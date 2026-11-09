import { Link } from 'react-router-dom';
import type { Alert } from '../../types';
import { PriorityChip, StatusChip } from '../common/ui';
import { dt, ago } from '../../utils/format';

export function AlertRow({ a }: { a: Alert }) {
  const unack = a.status === 'awaiting_acknowledgement';
  return (
    <div className={`alert-row ${unack ? 'unack' : ''}`}>
      <div><Link to={`/newborns/${a.newborn_id}`}><b>{a.newborn_identifier}</b></Link><div className="small muted" title={dt(a.created_at)}>{ago(a.created_at)}</div></div>
      <div><div style={{ fontWeight: 600 }}>{a.title}</div><div className="small" style={{ maxWidth: 70 + 'ch' }}>{a.explanation}</div><div className="row wrap" style={{ marginTop: 6 }}><PriorityChip p={a.priority} /><StatusChip s={a.status} /></div></div>
      <Link className={`btn ${unack ? '' : 'ghost'} sm`} to={`/alerts/${a.id}`}>{unack ? 'Review alert' : 'Open'}</Link>
    </div>
  );
}
