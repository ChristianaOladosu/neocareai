import type { Quality, MeasurementType } from '../../../../intelligence/src/index.js';

export type AiKind = 'summary' | 'draft_assessment';
export const DEMO_LABEL = 'Demo Mode – Not Connected to Azure';
export const PLACEHOLDER_TOKEN = '[Clinician to complete';

/** Anonymised, read-only data bundle handed to a provider. It contains NO newborn identifier, name or user identity. */
export interface Bundle {
  alert: { priority: string; title: string; explanation: string; status: string; createdAt: string; ruleName: string | null; ruleVersion: number | null; illustrative: boolean;
    triggering: Array<{ measurementType: MeasurementType; value: number; unit: string; observedAt: string; quality: Quality }>;
    context: Array<{ measurementType: MeasurementType; value: number; unit: string; observedAt: string; quality: Quality }> };
  recent?: Array<{ measurementType: MeasurementType; value: number; unit: string; observedAt: string; quality: Quality }>;
  history?: Array<{ eventType: string; at: string; byRole: string }>;
  guidance: Array<{ id: string; title: string; text: string }>;
  unavailable: string[];   // what the user's role was not permitted to see
}

export interface AiOutput {
  title: string;
  sections: Array<{ heading: string; text: string }>;
  draftText?: string;
  sources: Array<{ id: string; title: string; kind: 'system-data' | 'system-documentation' }>;
  limitations: string[];
}
export interface ProviderResult { output: AiOutput; provider: string; mode: 'demo' | 'azure' }
export interface AiProvider { name: string; mode: 'demo' | 'azure'; label: string; generate(kind: AiKind, bundle: Bundle): Promise<AiOutput>; }
export interface ToolCallRecord { tool: string; allowed: boolean; reason?: string; resultCount?: number }
