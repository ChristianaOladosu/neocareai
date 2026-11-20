import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { ReportKind, ReportData, ReportHistoryRow, Newborn } from '../types';
import { Banner, Empty, ErrorState, Loading } from '../components/common/ui';

function dateValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function reportDates(from: string, to: string) {
  return {
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59.999`).toISOString(),
  };
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const [kind, setKind] = useState('');
  const [from, setFrom] = useState(dateValue(weekAgo));
  const [to, setTo] = useState(dateValue(today));
  const [newbornId, setNewbornId] = useState('');
  const [format, setFormat] = useState<'csv' | 'pdf'>('pdf');
  const [downloadError, setDownloadError] = useState('');

  const kinds = useQuery({
    queryKey: ['report-kinds'],
    queryFn: () => api<ReportKind[]>('/reports/kinds'),
  });

  const newborns = useQuery({
    queryKey: ['newborns', 'reports'],
    queryFn: () => api<Newborn[]>('/newborns'),
  });

  const history = useQuery({
    queryKey: ['report-history'],
    queryFn: () => api<ReportHistoryRow[]>('/reports/history'),
  });

  const selected = kinds.data?.find((k) => k.key === kind);
  const preview = useMutation({
    mutationFn: () => api<ReportData>('/reports', {
      method: 'POST',
      body: {
        kind,
        ...reportDates(from, to),
        ...(selected?.needsNewborn && newbornId ? { newbornId } : {}),
        format: 'json',
      },
    }),
  });

  const exportReport = async () => {
    setDownloadError('');
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          ...reportDates(from, to),
          ...(selected?.needsNewborn && newbornId ? { newbornId } : {}),
          format,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Could not export this report.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] ||
        `neocareai-report.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({ queryKey: ['report-history'] });
      history.refetch();
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Export failed.');
    }
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Reports & Records</h1>
          <p>Generate clinical and operational records from the available system data.</p>
        </div>
      </div>

      <Banner kind="warn">
        Demonstration environment: reports may contain synthetic data and must not be used for real clinical decisions.
      </Banner>

      {kinds.isLoading ? <Loading label="Loading report categories" /> :
        kinds.error ? <ErrorState error={kinds.error} retry={() => kinds.refetch()} /> :
        !kinds.data?.length ? <Empty title="No report categories available">
          Your account does not currently have access to any report categories.
        </Empty> : (
          <>
            <section className="section">
              <header><h2>Build a report</h2></header>
              <div className="card">
                <div className="grid">
                  <div className="field">
                    <label htmlFor="report-kind">Report category</label>
                    <select id="report-kind" value={kind}
                      onChange={(e) => { setKind(e.target.value); preview.reset(); }}>
                      <option value="">Choose a report</option>
                      {kinds.data.map((k) => (
                        <option key={k.key} value={k.key}>{k.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="report-from">From</label>
                    <input id="report-from" type="date" value={from}
                      onChange={(e) => { setFrom(e.target.value); preview.reset(); }} />
                  </div>
                  <div className="field">
                    <label htmlFor="report-to">To</label>
                    <input id="report-to" type="date" value={to}
                      onChange={(e) => { setTo(e.target.value); preview.reset(); }} />
                  </div>
                  {selected?.needsNewborn && (
                    <div className="field">
                      <label htmlFor="report-newborn">Newborn</label>
                      <select id="report-newborn" value={newbornId}
                        onChange={(e) => { setNewbornId(e.target.value); preview.reset(); }}>
                        <option value="">Select newborn</option>
                        {newborns.data?.map((n) => (
                          <option key={n.id} value={n.id}>{n.newborn_identifier}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {from && to && to < from && (
                  <div className="banner err">The end date must be on or after the start date.</div>
                )}

                <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
                  <button className="btn" disabled={!kind || !from || !to || to < from ||
                    (selected?.needsNewborn && !newbornId) || preview.isPending}
                    onClick={() => preview.mutate()}>
                    {preview.isPending ? 'Generating preview…' : 'Generate preview'}
                  </button>
                  {can('reports:export') && (
                    <>
                      <select aria-label="Export format" value={format}
                        onChange={(e) => setFormat(e.target.value as 'csv' | 'pdf')}>
                        <option value="pdf">PDF</option>
                        <option value="csv">CSV</option>
                      </select>
                      <button className="btn ghost"
                        disabled={!kind || !from || !to || to < from ||
                          (selected?.needsNewborn && !newbornId)}
                        onClick={exportReport}>
                        Export {format.toUpperCase()}
                      </button>
                    </>
                  )}
                </div>

                {preview.error && <div className="banner err">{String(preview.error)}</div>}
                {downloadError && <div className="banner err">{downloadError}</div>}
              </div>
            </section>

            {preview.data && (
              <section className="section">
                <header><h2>{preview.data.title}</h2></header>
                <Banner kind="warn">{preview.data.note}</Banner>
                <div className="figures">
                  {preview.data.summary.map(([label, value]) => (
                    <div className="figure" key={label}>
                      <span>{label}</span><strong>{value}</strong>
                    </div>
                  ))}
                </div>
                {preview.data.sections.map((section, i) => (
                  <div className="section card" key={`${section.title}-${i}`}>
                    <h3>{section.title}</h3>
                    {!section.rows.length ? <p className="muted small">No records in this section for the selected period.</p> : (
                      <div className="tablewrap">
                        <table>
                          <thead><tr>{section.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                          <tbody>{section.rows.map((row, ri) => (
                            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell ?? '—'}</td>)}</tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        )}

      <section className="section">
        <header><h2>Export history</h2></header>
        {history.isLoading ? <Loading /> :
          history.error ? <ErrorState error={history.error} retry={() => history.refetch()} /> :
          !history.data?.length ? <Empty title="No exported reports yet">
            Reports you export will appear here.
          </Empty> : (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Report</th><th>Format</th><th>Records</th><th>Generated by</th><th>Date</th></tr></thead>
                <tbody>{history.data.map((r) => (
                  <tr key={r.id}>
                    <td>{r.kind}</td><td>{r.format.toUpperCase()}</td>
                    <td>{r.row_count}</td><td>{r.generated_by}</td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}
