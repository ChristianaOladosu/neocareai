import type { AiOutput } from './types.js';

/** Output safety filter applied to EVERY provider's output (demo or Azure). Blocks diagnosis, treatment, dismissal and reassurance language. */
const RULES: Array<{ flag: string; re: RegExp }> = [
  { flag: 'diagnosis_claim', re: /\b(diagnosed with|diagnosis (of|is)|(the )?(newborn|baby|infant) (has|is suffering|is septic)|suffering from|indicates? (sepsis|infection|hypoxia|hypoxaemia|respiratory (distress|failure)|pneumonia)|is (septic|hypoxic|hypothermic|in (respiratory )?distress|deteriorating|critically ill))\b/i },
  { flag: 'treatment_advice', re: /\b(administer|prescribe|start (antibiotics|oxygen|treatment|ventilation)|give (the )?(newborn|baby|infant)|increase (the )?(dose|oxygen)|\d+\s?mg(\/kg)?|intubat|resuscitat|commence)\b/i },
  { flag: 'dismissal_or_resolution', re: /\b(no action (is )?(needed|required|necessary)|safe to (resolve|dismiss|ignore|close)|can be (dismissed|ignored|resolved|closed)|false (alarm|positive)|(resolve|dismiss|close) (this|the) alert|alert (is|was) resolved)\b/i },
  { flag: 'reassurance', re: /\b((newborn|baby|infant) (is|looks|appears) (stable|fine|well|normal|safe|improving|recovering)|nothing to worry|reassuring)\b/i },
  { flag: 'autonomous_decision', re: /\b(you should (now )?(resolve|dismiss|escalate|acknowledge|ignore)|i (have|will) (resolved|dismissed|escalated|changed|updated|recorded))\b/i },
];

export function textOf(o: AiOutput) { return [o.title, ...o.sections.map((s) => `${s.heading}\n${s.text}`), o.draftText ?? '', ...o.limitations].join('\n'); }
export function checkOutput(o: AiOutput): string[] { const t = textOf(o); return RULES.filter((r) => r.re.test(t)).map((r) => r.flag); }

export const withheld = (flags: string[]): AiOutput => ({
  title: 'AI output withheld', draftText: undefined,
  sections: [{ heading: 'Why nothing is shown', text: 'The generated text did not pass the safety checks, so it has been withheld. Please review the alert data directly. The alert workflow is unaffected.' }],
  sources: [], limitations: [`Withheld by safeguards: ${flags.join(', ')}`],
});
