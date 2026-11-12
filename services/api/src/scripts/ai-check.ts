/**
 * Checks the Azure OpenAI connection using fixed SYNTHETIC data (no patient data, no database).
 * Run:  npm run ai:check        (reads .env). It never prints the API key.
 * A PASS here is the first real evidence that the integration works against your Azure deployment.
 */
import '../config/env.js';
import { azureConfig, azureConfigProblem } from '../modules/ai/azure/config.js';
import { AzureError } from '../modules/ai/azure/client.js';
import { azureGenerate, OutputRejected } from '../modules/ai/providers/azure.provider.js';
import { syntheticBundle } from '../modules/ai/synthetic.js';

const problem = azureConfigProblem();
if (problem) { console.error(`NOT CONFIGURED: ${problem}\nSee README, section "Connecting Azure OpenAI".`); process.exit(2); }
const c = azureConfig()!;
console.log(`Endpoint host : ${new URL(c.endpoint).host}\nDeployment    : ${c.deployment}\nAPI version   : ${c.apiVersion}\nAuth          : ${c.auth}${c.auth === 'key' ? ' (API key, not shown)' : ''}\nTimeout       : ${c.timeoutMs} ms\n`);
const t0 = Date.now();
try {
  const r = await azureGenerate('summary', syntheticBundle(), { forbidden: [] });
  console.log(`PASS  model answered in ${Date.now() - t0} ms (model: ${r.model})`);
  for (const k of r.validation.checks) console.log(`  ${k.ok ? '✓' : '✗'} ${k.name}${k.detail ? ` (${k.detail})` : ''}`);
  console.log('\nSample output (synthetic data):'); for (const s of r.output.sections) console.log(`- ${s.heading}\n    ${s.text.replace(/\n/g, '\n    ')}`);
  console.log('\nNote: validation checks format, sources, numbers and unsafe patterns. It does not prove clinical correctness.');
} catch (e) {
  if (e instanceof OutputRejected) { console.error('CONNECTED, BUT OUTPUT FAILED VALIDATION (model/prompt compatibility, not credentials):'); for (const k of e.validation.checks.filter((x) => !x.ok)) console.error(`  ✗ ${k.name}${k.detail ? ` (${k.detail})` : ''}`); process.exit(3); }
  if (e instanceof AzureError) { console.error(`FAIL  category: ${e.category}`); process.exit(1); }
  console.error('FAIL  unexpected error'); process.exit(1);
}
