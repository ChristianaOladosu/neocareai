/**
 * Local knowledge base. It contains ONLY documentation about how this prototype works.
 * It contains NO clinical guidance. No clinician-approved clinical reference material has been loaded, and none is invented here.
 * A future deployment would replace this with an approved, versioned, source-referenced corpus (e.g. Azure AI Search).
 */
export interface GuidanceDoc { id: string; title: string; text: string; keywords: string[] }
export const GUIDANCE: GuidanceDoc[] = [
  { id: 'DOC-RULES-001', title: 'How NeocareAI alert rules work', keywords: ['rule', 'threshold', 'trigger', 'consecutive', 'alert'],
    text: 'Alerts come from configurable rules that look for repeated readings beyond a configured threshold within a time window. Every alert records the rule, its version, the triggering readings and recent context. Rules in this prototype are illustrative demonstrations and are not clinically approved.' },
  { id: 'DOC-QUALITY-001', title: 'What signal quality means', keywords: ['signal', 'quality', 'poor', 'questionable', 'unreliable', 'sensor'],
    text: 'Signal quality describes how reliable a measurement is, not how the newborn is. Poor or unavailable signal is never treated as evidence of stability. Physiological rules only count readings with good or unknown quality; repeated unreliable readings raise a separate data-quality notice.' },
  { id: 'DOC-LIFECYCLE-001', title: 'Alert lifecycle and accountability', keywords: ['acknowledge', 'assessment', 'resolve', 'escalate', 'lifecycle', 'status', 'response'],
    text: 'An alert stays open until a clinician acts. Acknowledgement, assessment, escalation and resolution are each recorded with the acting user and time. Alerts are never closed automatically when values change.' },
  { id: 'DOC-AI-001', title: 'Scope of AI assistance in NeocareAI', keywords: ['ai', 'summary', 'draft', 'assist'],
    text: 'AI assistance can summarise existing alert data and prepare a draft for clinician review. It cannot diagnose, recommend treatment, dismiss or resolve alerts, or change any record. Drafts contain placeholders the clinician must complete before anything is recorded.' },
];
export function retrieve(query: string, limit = 3) {
  const q = query.toLowerCase().split(/\W+/).filter(Boolean);
  return GUIDANCE.map((d) => ({ d, score: d.keywords.filter((k) => q.some((w) => k.includes(w) || w.includes(k))).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => ({ id: x.d.id, title: x.d.title, text: x.d.text }));
}
