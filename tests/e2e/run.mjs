// Runs every browser test in this folder, one after another: node tests/e2e/run.mjs [name …]
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const pick = process.argv.slice(2);
const files = readdirSync(dir).filter(f => f.endsWith('.mjs') && !['lib.mjs', 'run.mjs'].includes(f) && (!pick.length || pick.some(n => f.startsWith(n))));
const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [`${dir}${f}`], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
}
console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : `\nAll ${files.length} suites passed`);
process.exit(failed.length ? 1 : 0);
