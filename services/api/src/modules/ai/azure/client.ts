import { AzureOpenAI } from 'openai';
import { azureConfig, type AzureConfig } from './config.js';

export type AzureErrorCategory = 'credentials' | 'rate_limited' | 'timeout' | 'unavailable' | 'content_filtered' | 'malformed' | 'misconfigured';
export class AzureError extends Error { constructor(public category: AzureErrorCategory, public retryAfterSeconds?: number) { super(category); } }

/** Minimal surface of the SDK client that we use; lets tests inject a fake without any network. */
export interface ChatClient { chat: { completions: { create(args: Record<string, unknown>): Promise<any> } } }
type Factory = (cfg: AzureConfig) => Promise<ChatClient> | ChatClient;

async function defaultFactory(cfg: AzureConfig): Promise<ChatClient> {
  const common = { endpoint: cfg.endpoint, deployment: cfg.deployment, apiVersion: cfg.apiVersion, timeout: cfg.timeoutMs, maxRetries: 1 };
  if (cfg.auth === 'entra') {
    // Keyless auth (Microsoft's recommended method). Needs `npm install @azure/identity`. Implemented but NOT tested against Entra ID.
    const name = '@azure/identity'; let mod: any;
    try { mod = await import(name); } catch { throw new AzureError('misconfigured'); }
    const azureADTokenProvider = mod.getBearerTokenProvider(new mod.DefaultAzureCredential(), 'https://cognitiveservices.azure.com/.default');
    return new AzureOpenAI({ ...common, azureADTokenProvider }) as unknown as ChatClient;
  }
  return new AzureOpenAI({ ...common, apiKey: cfg.apiKey }) as unknown as ChatClient;
}
let factory: Factory = defaultFactory;
export const setAzureClientFactory = (f: Factory) => { factory = f; };
export const resetAzureClientFactory = () => { factory = defaultFactory; };

/** Maps SDK/HTTP failures to a small set of categories. Raw error messages are deliberately never kept (they can echo endpoints or keys). */
export function classify(err: any): AzureError {
  if (err instanceof AzureError) return err;
  const status: number | undefined = err?.status; const code = err?.code ?? err?.error?.code; const name = String(err?.name ?? '');
  // The SDK's timeout error reports name 'Error'; its identity is in the class name, message and cause (verified against the installed SDK).
  const ctor = String(err?.constructor?.name ?? ''); const msg = String(err?.message ?? ''); const cause = String(err?.cause?.name ?? '');
  if (/timeout|timed out/i.test(`${name} ${ctor} ${msg}`) || code === 'ETIMEDOUT' || name === 'AbortError' || cause === 'AbortError') return new AzureError('timeout');
  if (status === 401 || status === 403) return new AzureError('credentials');
  if (status === 404) return new AzureError('misconfigured');
  if (status === 429) { const h = err?.headers; const ra = Number(typeof h?.get === 'function' ? h.get('retry-after') : h?.['retry-after']); return new AzureError('rate_limited', Number.isFinite(ra) && ra > 0 ? ra : undefined); }
  if (status === 400 && code === 'content_filter') return new AzureError('content_filtered');
  if (status === 400 || status === 422) return new AzureError('misconfigured');
  return new AzureError('unavailable');
}

export async function callAzure(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<{ content: string; model: string }> {
  const cfg = azureConfig(); if (!cfg) throw new AzureError('misconfigured');
  let res: any;
  try {
    const client = await factory(cfg);
    res = await client.chat.completions.create({
      model: cfg.deployment, messages, response_format: { type: 'json_object' }, max_completion_tokens: cfg.maxOutputTokens,
      ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
    });
  } catch (e) { throw classify(e); }
  const choice = res?.choices?.[0];
  if (!choice) throw new AzureError('malformed');
  if (choice.finish_reason === 'content_filter' || choice.message?.refusal) throw new AzureError('content_filtered');
  if (choice.finish_reason === 'length') throw new AzureError('malformed');
  const content = choice.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new AzureError('malformed');
  return { content, model: String(res.model ?? cfg.deployment) };
}
