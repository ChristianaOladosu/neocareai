import { slopePerMinute, type Reading, type MeasurementType } from '../../../../../intelligence/src/index.js';
import { DEMO_LABEL, PLACEHOLDER_TOKEN, type AiOutput, type AiProvider, type Bundle } from '../types.js';

/**
 * DEMO PROVIDER. Deterministic, template-based text assembled from the alert data. It is NOT a language model,
 * makes no network calls and needs no credentials. Every number it states is computed from the supplied bundle.
 */
const NAME: Record<MeasurementType, string> = { heart_rate: 'Heart rate', respiratory_rate: 'Respiratory rate', spo2: 'Oxygen saturation', temperature: 'Temperature' };
const q = (x: string) => x.replace('_', ' ');
const t = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmt = (m: MeasurementType, v: number) => (m === 'temperature' ? v.toFixed(1) : String(Math.round(v * 10) / 10));

function factLines(b: Bundle): string[] {
  const types = [...new Set(b.alert.triggering.map((r) => r.measurementType))];
  return types.map((m) => {
    const rs = b.alert.triggering.filter((r) => r.measurementType === m).sort((a, c) => a.observedAt.localeCompare(c.observedAt));
    const first = rs[0], last = rs[rs.length - 1];
    const span = (new Date(last.observedAt).getTime() - new Date(first.observedAt).getTime()) / 60000;
    const sl = slopePerMinute(rs.map((r) => ({ id: '', measurementType: r.measurementType, value: r.value, unit: r.unit, observedAt: new Date(r.observedAt), quality: r.quality }) as Reading));
    const dir = sl === null ? '' : Math.abs(sl) < 0.05 ? ', essentially flat' : `, ${sl > 0 ? 'rising' : 'falling'} by about ${Math.abs(Math.round(sl * 10) / 10)} ${first.unit} per minute`;
    const quals = [...new Set(rs.map((r) => q(r.quality)))].join('/');
    return `${NAME[m]}: ${rs.length} readings from ${fmt(m, first.value)} to ${fmt(m, last.value)} ${first.unit} between ${t(first.observedAt)} and ${t(last.observedAt)} (${Math.round(span * 10) / 10} min)${dir}; signal quality ${quals}.`;
  });
}
const ctxLine = (b: Bundle) => {
  const types = [...new Set(b.alert.context.map((r) => r.measurementType))];
  return types.length ? types.map((m) => { const v = b.alert.context.filter((r) => r.measurementType === m).map((r) => r.value); return `${NAME[m]} ${fmt(m, Math.min(...v))} to ${fmt(m, Math.max(...v))} ${b.alert.context.find((r) => r.measurementType === m)!.unit} over ${v.length} earlier readings`; }).join('; ') + '.' : 'No earlier readings were stored in the evidence window.';
};
const sources = (b: Bundle): AiOutput['sources'] => [{ id: 'ALERT-EVIDENCE', title: 'Stored alert evidence (triggering readings and context)', kind: 'system-data' as const }, ...b.guidance.map((g) => ({ id: g.id, title: g.title, kind: 'system-documentation' as const }))];
const limits = (b: Bundle) => ['Prepared only from the stored alert data. It has no bedside, historical or clinical context about this newborn.', 'This is not a diagnosis, a clinical assessment or a recommendation.', 'Alert rules in this prototype are illustrative and not clinically approved.', 'No clinician-approved clinical guidance is loaded in this prototype; only system documentation is referenced.', ...b.unavailable.map((u) => `Not shown to your role: ${u}.`)];

export const demoProvider: AiProvider = {
  name: 'local-template', mode: 'demo', label: DEMO_LABEL,
  async generate(kind, b) {
    const facts = factLines(b); const poor = b.alert.triggering.some((r) => r.quality === 'poor' || r.quality === 'unavailable' || r.quality === 'questionable');
    const qtext = poor ? 'Some triggering readings have questionable, poor or unavailable signal. A poor signal is not evidence of stability and not evidence of deterioration; the measurement itself needs checking.' : 'All triggering readings were recorded with good or unreported signal quality.';
    if (kind === 'summary') {
      const recent = b.recent?.length ? 'Latest stored readings, for reference only: ' + b.recent.map((r) => `${NAME[r.measurementType]} ${fmt(r.measurementType, r.value)} ${r.unit} at ${t(r.observedAt)} (${q(r.quality)})`).join('; ') + '. These do not change the alert status.' : undefined;
      const hist = b.history?.length ? `Recorded so far: ${b.history.map((h) => `${h.eventType.replace(/_/g, ' ')} (${h.byRole}) at ${t(h.at)}`).join(', ')}. Current status: ${b.alert.status.replace(/_/g, ' ')}.` : undefined;
      return {
        title: 'Alert summary (prepared from stored data)',
        sections: [
          { heading: 'What the system detected', text: `${b.alert.ruleName ?? 'A rule'} (version ${b.alert.ruleVersion ?? 'n/a'}${b.alert.illustrative ? ', illustrative' : ''}) raised a ${b.alert.priority}-priority alert at ${t(b.alert.createdAt)}. ${b.alert.explanation}` },
          { heading: 'Measurements involved', text: facts.join('\n') },
          { heading: 'Earlier context', text: ctxLine(b) },
          { heading: 'Signal quality', text: qtext },
          ...(recent ? [{ heading: 'Latest readings', text: recent }] : []),
          ...(hist ? [{ heading: 'Response so far', text: hist }] : []),
          { heading: 'Questions for the clinical team', text: 'Do the bedside findings match these measurements?\nCould sensor placement or signal explain any of the readings?\nWho is responsible for the next step on this alert?' },
        ],
        sources: sources(b), limitations: limits(b),
      };
    }
    if (kind === 'documentation_help') {
      const done = new Set((b.history ?? []).map((h) => h.eventType));
      const items = [
        `Acknowledgement: ${done.has('acknowledged') ? 'recorded' : 'not yet recorded'}.`,
        `Clinical assessment: ${done.has('assessment_recorded') ? 'recorded' : 'not yet recorded'}.`,
        `Response documented: ${done.has('response_documented') ? 'recorded' : 'not yet recorded'}.`,
        poor ? 'Signal quality: some triggering readings are unreliable; is this noted?' : 'Signal quality: all triggering readings were good or unreported.',
        'Who is responsible for the next step on this alert?',
      ];
      return { title: 'Documentation checklist (prepared from stored data)', sections: [{ heading: 'Documentation checklist', text: items.join('\n') }], sources: sources(b), limitations: limits(b) };
    }
    const draft = [
      'DRAFT FOR CLINICIAN REVIEW. Prepared from stored system data. It is not a clinical finding.',
      '',
      `Alert: ${b.alert.title} (${b.alert.priority} priority), generated ${t(b.alert.createdAt)}. Status when drafted: ${b.alert.status.replace(/_/g, ' ')}.`,
      'Measurements recorded by the system:', ...facts.map((f) => `- ${f}`),
      `Signal quality: ${qtext}`,
      '',
      `Bedside assessment: ${PLACEHOLDER_TOKEN}: findings on examination]`,
      `Interpretation: ${PLACEHOLDER_TOKEN}: your clinical interpretation]`,
      `Actions taken or planned: ${PLACEHOLDER_TOKEN}: response and follow-up]`,
    ].join('\n');
    return { title: 'Draft assessment for clinician review', sections: [{ heading: 'How to use this draft', text: 'The system-data lines are filled in from stored readings. The three bracketed fields are intentionally empty: only you can complete them. The draft cannot be recorded until every bracketed field is replaced with your own text.' }], draftText: draft, sources: sources(b), limitations: limits(b) };
  },
};
