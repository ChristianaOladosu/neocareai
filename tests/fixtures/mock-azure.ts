import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * LOCAL MOCK of the Azure OpenAI chat-completions endpoint. It is NOT Azure. The real `AzureOpenAI` SDK client is pointed at it over HTTP,
 * so request path, api-version, headers, retries and timeouts are exercised, but nothing here proves behaviour of a real deployment or model.
 */
export type Behaviour = 'ok' | 'unauthorized' | 'rate_limit' | 'server_error' | 'timeout' | 'not_found' | 'not_json' | 'empty' | 'length' | 'content_filter' | 'refusal'
  | 'diagnosis' | 'treatment' | 'dismissal' | 'recommendation' | 'inference' | 'bad_number' | 'no_refs' | 'bad_ref' | 'wrong_measurement' | 'bad_heading' | 'markup' | 'extra_fields' | 'slow_ok';
export const MOCK_KEY = 'mock-key-0123456789abcdef-NOT-A-REAL-KEY';
const NAME: Record<string, string> = { heart_rate: 'Heart rate', respiratory_rate: 'Respiratory rate', spo2: 'Oxygen saturation', temperature: 'Temperature' };
type Stmt = { kind: string; text: string; refs: string[] };

function grounded(task: string, records: any[]): Array<{ heading: string; statements: Stmt[] }> {
  const trends = records.filter((r) => r.type === 'trend'); const events = records.filter((r) => r.type === 'event'); const alert = records.find((r) => r.type === 'alert');
  const trendFacts = trends.map((f) => ({ kind: 'fact', text: `${NAME[f.measurement]} had ${f.readings} readings from ${f.firstValue} to ${f.lastValue} ${f.unit} over ${f.spanMinutes} minutes.`, refs: [f.id] }));
  const qualFacts = trends.map((f) => ({ kind: 'fact', text: `Signal quality for ${NAME[f.measurement].toLowerCase()} readings was ${f.signalQualities.join(' and ')}.`, refs: [f.id] }));
  const evFacts: Stmt[] = events.length ? events.map((e) => ({ kind: 'fact', text: `The record shows ${String(e.event).replace(/_/g, ' ')} by ${e.byRole}.`, refs: [e.id] })) : [{ kind: 'uncertainty', text: 'No responses are recorded yet.', refs: [] }];
  if (task === 'summary') return [
    { heading: 'What the system detected', statements: [{ kind: 'fact', text: `The alert has ${alert.priority} priority and came from a rule marked as illustrative.`, refs: ['A1'] }] },
    { heading: 'Measurement trends', statements: trendFacts }, { heading: 'Observations and responses so far', statements: evFacts },
    { heading: 'Uncertainty and missing information', statements: [{ kind: 'uncertainty', text: 'No bedside findings are available to this summary.', refs: [] }] },
    { heading: 'Questions for the clinical team', statements: [{ kind: 'question', text: 'Do the bedside findings match these recorded measurements?', refs: [] }] }];
  if (task === 'draft_assessment') return [
    { heading: 'Measurements recorded by the system', statements: trendFacts }, { heading: 'Signal quality', statements: qualFacts }, { heading: 'Responses recorded so far', statements: evFacts },
    { heading: 'Questions to consider at the bedside', statements: [{ kind: 'question', text: 'Is the sensor placement as expected?', refs: [] }] }];
  return [{ heading: 'Documentation checklist', statements: [{ kind: 'question', text: 'Is the acknowledgement recorded?', refs: [] }, { kind: 'question', text: 'Is any signal-quality issue noted?', refs: [] }] }];
}
const mutate = (b: Behaviour, secs: Array<{ heading: string; statements: Stmt[] }>, records: any[]) => {
  const first = secs.find((s) => s.statements.some((x) => x.kind === 'fact')) ?? secs[0]; const f = first.statements[0]; const trend = records.find((r) => r.type === 'trend');
  const inject = (text: string, refs = f.refs) => { first.statements.push({ kind: 'fact', text, refs }); };
  switch (b) {
    case 'diagnosis': inject('The baby has sepsis.'); break;
    case 'treatment': inject('Start antibiotics and give oxygen.'); break;
    case 'dismissal': inject('No action is needed and this alert can be dismissed.'); break;
    case 'recommendation': inject('The team should review the sensor straight away.'); break;
    case 'inference': inject('The change is likely due to an infection.'); break;
    case 'bad_number': inject('Heart rate reached 250 bpm.', trend ? [trend.id] : f.refs); break;
    case 'no_refs': inject('Heart rate was high.', []); break;
    case 'bad_ref': inject('Heart rate was recorded.', ['T99']); break;
    case 'wrong_measurement': inject('Temperature was recorded.', trend ? [trend.id] : f.refs); break;
    case 'markup': inject('See <b>this</b> link http://example.com'); break;
    case 'bad_heading': secs.push({ heading: 'Recommended management', statements: [{ kind: 'question', text: 'What is next?', refs: [] }] }); break;
  }
  return secs;
};

export async function startMockAzure() {
  const state = { behaviour: 'ok' as Behaviour, delayMs: 0, requests: [] as Array<{ url: string; headers: http.IncomingHttpHeaders; body: any }>, expectedKey: MOCK_KEY };
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === '/__mock/behaviour' && req.method === 'POST') { state.behaviour = body.behaviour; state.delayMs = body.delayMs ?? 0; res.writeHead(200); return res.end('{"ok":true}'); } // test control only
      state.requests.push({ url: req.url ?? '', headers: req.headers, body });
      const send = (code: number, obj: unknown, headers: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      if (!/\/openai\/deployments\/[^/]+\/chat\/completions/.test(req.url ?? '')) return send(404, { error: { code: 'DeploymentNotFound', message: 'The API deployment for this resource does not exist.' } });
      if (state.behaviour === 'not_found') return send(404, { error: { code: 'DeploymentNotFound', message: 'missing' } });
      if (req.headers['api-key'] !== state.expectedKey || state.behaviour === 'unauthorized') return send(401, { error: { code: '401', message: 'Access denied due to invalid subscription key.' } });
      if (state.behaviour === 'rate_limit') return send(429, { error: { code: '429', message: 'Rate limit' } }, { 'retry-after': '1', 'retry-after-ms': '20' });
      if (state.behaviour === 'server_error') return send(500, { error: { code: 'InternalServerError', message: 'boom' } }, { 'retry-after-ms': '10' });
      if (state.behaviour === 'timeout') return; // never answer; the client's timeout must fire
      const user = JSON.parse(body.messages?.[1]?.content ?? '{}'); const records = user.records ?? [];
      const wrap = (content: string | null, finish = 'stop', extra: Record<string, unknown> = {}) => send(200, { id: 'mock', object: 'chat.completion', model: 'gpt-4o-mock', choices: [{ index: 0, finish_reason: finish, message: { role: 'assistant', content, ...extra } }] });
      switch (state.behaviour) {
        case 'not_json': return wrap('Sure! Here is a summary: the baby is fine.');
        case 'empty': return wrap('');
        case 'length': return wrap('{"sections":[', 'length');
        case 'content_filter': return wrap(null, 'content_filter');
        case 'refusal': return wrap(null, 'stop', { refusal: 'I cannot help with that.' });
      }
      const secs = mutate(state.behaviour, grounded(user.task, records), records);
      const out: any = { sections: secs }; if (state.behaviour === 'extra_fields') { out.title = 'x'; out.diagnosis = 'none'; }
      return wrap(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, state, close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
}
