import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MeasurementType, Quality } from '../../types';
import { MEASUREMENTS, QUALITY_LABEL, fmtValue, time } from '../../utils/format';

export interface Point { t: number; v: number; q: Quality }
const COLOR: Record<Quality, string> = { good: '#147D78', unknown: '#647482', questionable: '#D9A441', poor: '#D96B63', unavailable: '#D96B63' };

/** Points are coloured AND shaped by quality: hollow markers mean the reading is not reliable. */
export function TrendChart({ title, type, points, height = 170 }: { title?: string; type: MeasurementType; points: Point[]; height?: number }) {
  const m = MEASUREMENTS[type];
  const sorted = [...points].sort((a, b) => a.t - b.t);
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="row" style={{ marginBottom: 4 }}><h3>{title ?? m.label}</h3><span className="small muted">{m.unit}</span></figcaption>
      {!sorted.length ? <div className="state small">No observations yet.</div> : (
        <div role="img" aria-label={`${m.label} trend, ${sorted.length} observations, latest ${fmtValue(type, sorted[sorted.length - 1].v)} ${m.unit}`}>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={sorted} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="#E4E1D6" vertical={false} />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => time(new Date(t).toISOString())} tick={{ fontSize: 11, fill: '#647482' }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#647482', fontFamily: 'IBM Plex Mono' }} />
              <Tooltip formatter={(v: number, _n, p) => [`${fmtValue(type, v)} ${m.unit} (${QUALITY_LABEL[(p.payload as Point).q]})`, m.short]} labelFormatter={(t) => time(new Date(t as number).toISOString())} />
              <Line type="monotone" dataKey="v" stroke="#647482" strokeWidth={1.5} isAnimationActive={false}
                dot={(p: any) => { const q = p.payload.q as Quality; const bad = q !== 'good' && q !== 'unknown'; return <circle key={p.key} cx={p.cx} cy={p.cy} r={bad ? 4 : 3} fill={bad ? '#fff' : COLOR[q]} stroke={COLOR[q]} strokeWidth={2} />; }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
