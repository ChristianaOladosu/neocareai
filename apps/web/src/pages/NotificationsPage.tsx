import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, post } from '../services/api';
import type { NotificationList, NotificationItem } from '../types';
import { Banner, Empty, ErrorState, Loading, PriorityChip } from '../components/common/ui';
import { ago } from '../utils/format';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [filter, setFilter] = useState('all');

  const q = useQuery({
    queryKey: ['notifications', 'page'],
    queryFn: () => api<NotificationList>('/notifications?limit=200'),
    refetchInterval: 15000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: refresh,
  });

  const action = useMutation({
    mutationFn: ({ id, acknowledge }: { id: string; acknowledge: boolean }) =>
      post(`/notifications/${id}/${acknowledge ? 'acknowledge' : 'read'}`),
    onSuccess: refresh,
  });

  const openNotification = async (item: NotificationItem) => {
    if (!item.read_at) {
      await action.mutateAsync({ id: item.id, acknowledge: false });
    }

    if (item.link?.startsWith('/') && !item.link.startsWith('//')) {
      nav(item.link);
    } else if (item.alert_id) {
      nav(`/alerts/${item.alert_id}`);
    } else if (item.newborn_id) {
      nav(`/newborns/${item.newborn_id}`);
    }
  };

  const items = (q.data?.items ?? []).filter((item) => {
    if (filter === 'unread') return !item.read_at;
    if (filter === 'high') return item.priority === 'high';
    return true;
  });

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Notifications</h1>
          <p>Clinical alerts, system updates and important activity for your account.</p>
        </div>
        <button className="btn ghost" onClick={() => markAll.mutate()}
          disabled={!q.data?.unread || markAll.isPending}>
          {markAll.isPending ? 'Updating…' : 'Mark all as read'}
        </button>
      </div>

      <Banner kind="info">
        Notifications are specific to your account. Acknowledging a notification does not resolve its underlying clinical alert.
      </Banner>

      <div className="figures">
        <div className="figure"><span>Unread</span><strong>{q.data?.unread ?? '—'}</strong></div>
        <div className="figure"><span>High priority unread</span><strong>{q.data?.unread_high ?? '—'}</strong></div>
        <div className="figure"><span>Loaded notifications</span><strong>{q.data?.items.length ?? '—'}</strong></div>
      </div>

      <div className="tabs">
        {['all', 'unread', 'high'].map((f) => (
          <button key={f} className={filter === f ? 'active' : ''}
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'High priority'}
          </button>
        ))}
      </div>

      {q.isLoading ? <Loading label="Loading notifications" /> :
        q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> :
        !items.length ? <Empty title="No notifications here">
          New notifications will appear here when activity is recorded.
        </Empty> : (
          <section className="section">
            <div className="card">
              {items.map((item) => (
                <div key={item.id} className="row"
                  style={{ justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 4px', borderBottom: '1px solid var(--line, #e7e4ed)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <PriorityChip p={item.priority} />
                      {!item.read_at && <span className="chip">Unread</span>}
                      {item.acknowledged_at && <span className="chip good">Acknowledged</span>}
                    </div>
                    <strong>{item.title}</strong>
                    {item.body && <p className="small" style={{ margin: '6px 0' }}>{item.body}</p>}
                    <span className="small muted">{ago(item.created_at)}</span>
                    {(item.link || item.alert_id || item.newborn_id) && (
                      <div style={{ marginTop: 8 }}>
                        <button className="btn ghost sm" onClick={() => openNotification(item)}>
                          View details
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="row" style={{ flexShrink: 0 }}>
                    {!item.read_at && (
                      <button className="btn ghost sm"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: item.id, acknowledge: false })}>
                        Mark read
                      </button>
                    )}
                    {item.alert_id && !item.acknowledged_at && (
                      <button className="btn sm"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: item.id, acknowledge: true })}>
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      {action.error && <div className="banner err">{String(action.error)}</div>}
      {markAll.error && <div className="banner err">{String(markAll.error)}</div>}
    </div>
  );
}
