import { Link } from 'react-router-dom';
import type { LogEvent, ResponseEvent } from '../../types';
import { EVENT_LABEL, STATUS_LABEL, dt } from '../../utils/format';

const TONE: Record<string, string> = { generated: 'coral', acknowledged: '', assessment_recorded: 'amber', response_documented: 'amber', escalated: 'coral', resolved: 'green' };
const detail = (e: ResponseEvent) => { const d = e.event_details as Record<string, string>; return d.reason ?? d.resolutionNote ?? d.responseText ?? (e.event_type === 'generated' ? `Rule ${d.ruleKey} v${d.ruleVersion} (illustrative)` : ''); };

export function Timeline({ events, showAlert }: { events: Array<ResponseEvent | LogEvent>; showAlert?: boolean }) {
  return (
    <ol className="timeline">{events.map((e) => (
      <li key={e.id} className={TONE[e.event_type] ?? ''}>
        <div className="row wrap" style={{ gap: 8 }}><b>{EVENT_LABEL[e.event_type] ?? e.event_type}</b>
          {showAlert && 'alert_id' in e && <Link to={`/alerts/${e.alert_id}`}>{e.newborn_identifier}: {e.alert_title}</Link>}
          <span className="small muted">{dt(e.created_at)}</span></div>
        <div className="small muted">{e.user_name ?? 'System'}{e.previous_status && e.new_status && e.previous_status !== e.new_status ? ` · ${STATUS_LABEL[e.previous_status as keyof typeof STATUS_LABEL] ?? e.previous_status} → ${STATUS_LABEL[e.new_status as keyof typeof STATUS_LABEL] ?? e.new_status}` : ''}</div>
        {detail(e) && <div className="small" style={{ marginTop: 2, maxWidth: '70ch' }}>{detail(e)}</div>}
      </li>))}
    </ol>
  );
}
