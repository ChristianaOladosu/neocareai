import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, BrainCircuit, CheckCircle2, Radio, ShieldAlert } from 'lucide-react';

import { api } from '../services/api';
import type {
  IntelligenceItem,
  IntelligenceDetail,
  Observation,
  MeasurementType,
  Trend,
} from '../types';

import { Banner, Empty, ErrorState, Loading } from '../components/common/ui';
import { TrendChart } from '../components/charts/TrendChart';
import { MEASUREMENT_ORDER } from '../utils/format';

const STATE_LABEL: Record<string, string> = {
  normal: 'Normal',
  concerning: 'Concerning',
  insufficient_signal: 'Insufficient signal',
  disconnected: 'Disconnected',
  not_monitored: 'Not monitored',
};

const STATE_CLASS: Record<string, string> = {
  normal: 'good',
  concerning: 'high',
  insufficient_signal: 'medium',
  disconnected: 'poor',
  not_monitored: '',
};

const TREND_LABEL: Record<Trend['classification'], string> = {
  rising: 'Rising',
  falling: 'Falling',
  stable: 'Stable',
  insufficient_data: 'Insufficient data',
};

const WINDOWS = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '6 hours', value: 360 },
  { label: '12 hours', value: 720 },
];

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="figure">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">{label}</span>
        {icon}
      </div>
      <div className="big">{value}</div>
      <div className="small muted">{detail}</div>
    </div>
  );
}

function TrendSummary({ trend }: { trend: Trend }) {
  return (
    <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{TREND_LABEL[trend.classification]}</b>
        <span className="small muted">{trend.reliableReadings}/{trend.readings} reliable</span>
      </div>
      {trend.first !== undefined && trend.last !== undefined && (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          First: {trend.first} · Latest: {trend.last} {trend.unit ?? ''}
        </p>
      )}
      {trend.netChange !== undefined && (
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Net change: {trend.netChange} {trend.unit ?? ''}
        </p>
      )}
      {trend.note && <p className="small muted">{trend.note}</p>}
    </div>
  );
}

export default function ClinicalIntelligencePage() {
  const [minutes, setMinutes] = useState(30);
  const [selected, setSelected] = useState('');

  const overview = useQuery({
    queryKey: ['intelligence-overview', minutes],
    queryFn: () => api<{ windowMinutes: number; illustrative: boolean; items: IntelligenceItem[] }>(
      `/intelligence/overview?minutes=${minutes}`,
    ),
    refetchInterval: 15000,
  });

  const items = overview.data?.items ?? [];
  const chosenId = items.some((x) => x.id === selected)
    ? selected
    : items[0]?.id ?? '';

  const detail = useQuery({
    queryKey: ['intelligence-detail', chosenId, minutes],
    queryFn: () => api<IntelligenceDetail>(
      `/intelligence/newborns/${chosenId}?minutes=${minutes}`,
    ),
    enabled: !!chosenId,
    refetchInterval: 15000,
  });

  const since = new Date(Date.now() - minutes * 60000).toISOString();

  const observations = useQuery({
    queryKey: ['intelligence-observations', chosenId, minutes],
    queryFn: () => api<Observation[]>(
      `/newborns/${chosenId}/observations?limit=1000&since=${encodeURIComponent(since)}`,
    ),
    enabled: !!chosenId,
    refetchInterval: 15000,
  });

  if (overview.isLoading) return <Loading label="Analysing clinical intelligence" />;
  if (overview.error) {
    return <ErrorState error={overview.error} retry={() => overview.refetch()} />;
  }

  const count = (state: string) => items.filter((x) => x.state === state).length;
  const concerning = count('concerning');
  const normal = count('normal');
  const signalIssues = items.filter((x) =>
    ['insufficient_signal', 'disconnected'].includes(x.state),
  ).length;
  const insufficient = items.reduce((n, x) => n + x.rulesInsufficient, 0);
  const trends = detail.data?.trends;

  const chartPoints = (type: MeasurementType) =>
    (observations.data ?? [])
      .filter((o) => o.measurement_type === type)
      .map((o) => ({
        t: new Date(o.observed_at).getTime(),
        v: o.value,
        q: o.quality_status,
      }));

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Clinical Intelligence</h1>
          <p>Transparent trend analysis and explainable clinical rule evaluations.</p>
        </div>
        <div className="row">
          <label htmlFor="intelligence-window" className="small muted">Analysis window</label>
          <select
            id="intelligence-window"
            style={{ width: 'auto' }}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>
      </div>

      <Banner kind="info">
        This workspace uses synthetic demonstration data and illustrative rules.
        Trend descriptions are not diagnoses, predictions or risk scores.
        They are not clinically validated and must not guide real patient care.
      </Banner>

      <div className="figures">
        <Metric label="Normal" value={normal} detail="No active clinical alerts" icon={<CheckCircle2 size={19} />} />
        <Metric label="Concerning" value={concerning} detail="Active clinical alerts" icon={<AlertTriangle size={19} />} />
        <Metric label="Signal issues" value={signalIssues} detail="Insufficient signal or disconnected" icon={<Radio size={19} />} />
        <Metric label="Rules needing data" value={insufficient} detail="Insufficient information to evaluate" icon={<BrainCircuit size={19} />} />
      </div>

      <section className="section">
        <header>
          <h2>Hospital-wide newborn assessment</h2>
          <span className="small muted">{items.length} monitored newborns</span>
        </header>

        {!items.length ? (
          <Empty title="No monitored newborns">
            Newborns appear here when their monitoring status is active.
          </Empty>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Newborn</th>
                  <th>Clinical state</th>
                  <th>Signal quality</th>
                  <th>Rules met</th>
                  <th>Rules requiring data</th>
                  <th>Assessment</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                    style={{
                      cursor: 'pointer',
                      background: chosenId === item.id ? 'var(--accent-soft)' : undefined,
                    }}
                  >
                    <td>
                      <button
                        className="small"
                        onClick={() => setSelected(item.id)}
                        style={{
                          border: 0,
                          background: 'none',
                          padding: 0,
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {item.identifier}
                      </button>
                    </td>
                    <td>
                      <span className={`chip ${STATE_CLASS[item.state]}`}>
                        {STATE_LABEL[item.state] ?? item.state}
                      </span>
                    </td>
                    <td>{item.signal.label}</td>
                    <td className="num">{item.rulesMet}</td>
                    <td className="num">{item.rulesInsufficient}</td>
                    <td className="small">
                      {item.assessment
                        ? new Date(item.assessment.evaluated_at).toLocaleString()
                        : 'No assessment recorded'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {chosenId && (
        <>
          <section className="section">
            <header>
              <div>
                <h2>Individual newborn analysis</h2>
                <p className="small muted">
                  {items.find((x) => x.id === chosenId)?.identifier}
                </p>
              </div>
              <Link to={`/newborns/${chosenId}`}>Open newborn profile</Link>
            </header>

            {detail.isLoading ? <Loading label="Loading analysis" /> :
              detail.error ? <ErrorState error={detail.error} retry={() => detail.refetch()} /> :
              detail.data && (
                <>
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                    <span className={`chip ${STATE_CLASS[detail.data.state]}`}>
                      {STATE_LABEL[detail.data.state]}
                    </span>
                    <span className="chip">{detail.data.signal.label}</span>
                    <span className="small muted">{detail.data.windowMinutes}-minute analysis</span>
                  </div>

                  <p className="small muted">{detail.data.signal.explanation}</p>

                  <div className="charts">
                    {MEASUREMENT_ORDER.map((type) => (
                      <div key={type}>
                        <TrendChart
                          type={type}
                          points={chartPoints(type)}
                        />
                        {trends?.[type] && <TrendSummary trend={trends[type]} />}
                      </div>
                    ))}
                  </div>

                  <p className="small muted" style={{ marginTop: 12 }}>
                    Trend direction describes the measurements only. It does not independently
                    determine whether a newborn is deteriorating. Hollow chart markers indicate
                    questionable or poor-quality readings.
                  </p>
                </>
              )}
          </section>

          <section className="section">
            <header>
              <h2>Explainable rule evaluation</h2>
              <span className="small muted">
                {detail.data?.evaluation.length ?? 0} configured rules
              </span>
            </header>

            {detail.isLoading ? <Loading /> :
              detail.error ? <ErrorState error={detail.error} retry={() => detail.refetch()} /> :
              !detail.data?.evaluation.length ? (
                <Empty title="No configured rules available" />
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {detail.data.evaluation.map((rule) => (
                    <article
                      key={rule.ruleKey}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: 16,
                      }}
                    >
                      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <div>
                          <b>{rule.name}</b>
                          <div className="small muted">
                            {rule.category} · Version {rule.version} · Illustrative rule
                          </div>
                        </div>
                        <span className={`chip ${
                          rule.status === 'met' ? 'high' :
                          rule.status === 'insufficient_data' ? 'medium' : 'good'
                        }`}>
                          {rule.status === 'met' ? 'Condition met' :
                           rule.status === 'insufficient_data' ? 'Insufficient data' : 'Not met'}
                        </span>
                      </div>

                      {rule.conditions.map((condition, index) => (
                        <div
                          key={index}
                          style={{
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop: '1px solid var(--border)',
                          }}
                        >
                          <div className="small"><b>Required:</b> {condition.requirement}</div>
                          <div className="small muted" style={{ marginTop: 4 }}>
                            <b>Observed:</b> {condition.observed}
                          </div>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              )}
          </section>

          {detail.data?.missingInformation.length ? (
            <section className="section">
              <header><h2>Limitations and missing information</h2></header>
              <ul className="small muted">
                {detail.data.missingInformation.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
              <p className="small muted">{detail.data.disclaimer}</p>
            </section>
          ) : null}
        </>
      )}

      <div className="small muted" style={{ marginTop: 16 }}>
        <Activity size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
        Data refreshes automatically. All demonstration observations are synthetic.
      </div>
    </div>
  );
}
