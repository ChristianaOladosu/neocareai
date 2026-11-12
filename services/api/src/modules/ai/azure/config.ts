/** Azure OpenAI configuration, read from environment variables on every call (so it can be changed without code changes). Secrets never leave the server. */
export interface AzureConfig {
  endpoint: string; apiKey?: string; deployment: string; apiVersion: string; auth: 'key' | 'entra';
  timeoutMs: number; maxOutputTokens: number; temperature?: number;
}
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export function azureConfigProblem(): string | null {
  const e = process.env;
  if (!e.AZURE_OPENAI_ENDPOINT) return 'AZURE_OPENAI_ENDPOINT is not set';
  if (!e.AZURE_OPENAI_DEPLOYMENT) return 'AZURE_OPENAI_DEPLOYMENT is not set';
  if ((e.AZURE_OPENAI_AUTH ?? 'key') === 'key' && !e.AZURE_OPENAI_API_KEY) return 'AZURE_OPENAI_API_KEY is not set (or set AZURE_OPENAI_AUTH=entra)';
  try { const u = new URL(e.AZURE_OPENAI_ENDPOINT); if (u.protocol !== 'https:' && !LOCAL.test(u.hostname)) return 'AZURE_OPENAI_ENDPOINT must use https (plain http is allowed only for localhost test servers)'; }
  catch { return 'AZURE_OPENAI_ENDPOINT is not a valid URL'; }
  return null;
}
export function azureConfig(): AzureConfig | null {
  if (azureConfigProblem()) return null;
  const e = process.env; const temp = e.AZURE_OPENAI_TEMPERATURE;
  return {
    endpoint: e.AZURE_OPENAI_ENDPOINT!, apiKey: e.AZURE_OPENAI_API_KEY, deployment: e.AZURE_OPENAI_DEPLOYMENT!, apiVersion: e.AZURE_OPENAI_API_VERSION || '2024-10-21',
    auth: e.AZURE_OPENAI_AUTH === 'entra' ? 'entra' : 'key', timeoutMs: Number(e.AI_TIMEOUT_MS) || 20000, maxOutputTokens: Number(e.AI_MAX_OUTPUT_TOKENS) || 1500,
    // Omitted unless set: some newer model families reject a temperature parameter.
    temperature: temp !== undefined && temp !== '' ? Number(temp) : undefined,
  };
}
export const azureConfigured = () => azureConfig() !== null;
/** Azure is only the default when explicitly requested AND fully configured. Otherwise Demo Mode is the default. */
export const defaultMode = (): 'demo' | 'azure' => (process.env.AI_PROVIDER === 'azure' && azureConfigured() ? 'azure' : 'demo');
