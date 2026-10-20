// Checks every locale in js/i18n/ against the English source: all keys present,
// identical {placeholders} and HTML tags. Exits non-zero on problems (used by CI).
// Usage: node tools/check-i18n.mjs
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../js/i18n');
const en = (await import(pathToFileURL(path.join(dir, 'en.js')))).default;
const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
const tags = s => (s.match(/<\/?[a-z]+[^>]*>/g) || []).map(t => t.replace(/\s.*>/, '>')).sort().join(',');
let total = 0;
for (const file of fs.readdirSync(dir).filter(f => /^[a-z]{2}-[A-Z]{2}\.js$/.test(f)).sort()) {
  const tr = (await import(pathToFileURL(path.join(dir, file)))).default;
  const problems = [];
  for (const k of Object.keys(en)) {
    if (typeof tr[k] !== 'string' || !tr[k].trim()) problems.push(`missing ${k}`);
    else {
      if (ph(en[k]) !== ph(tr[k])) problems.push(`placeholders ${k}`);
      if (tags(en[k]) !== tags(tr[k])) problems.push(`tags ${k}`);
    }
  }
  for (const k of Object.keys(tr)) if (!(k in en)) problems.push(`unused ${k}`);
  total += problems.length;
  console.log(`${file.replace('.js', '')}: ${problems.length ? problems.length + ' problems' : 'OK'}`);
  for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
}
console.log(`${Object.keys(en).length} English keys`);
process.exit(total ? 1 : 0);
