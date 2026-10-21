// Checks every locale in js/i18n/ against the English source: all keys present,
// identical {placeholders} and HTML tags, no stray keys. Also checks that the English modules
// don't redefine each other's keys, that every locale listed in js/i18n.js has a file, and that
// literal keys in the code (t('key'), data-i18n="key") exist. Exits non-zero on problems (used by CI).
// Usage: node tools/check-i18n.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'js/i18n');
const load = async f => (await import(pathToFileURL(f))).default;
const en = await load(path.join(dir, 'en.js'));
const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
const tags = s => (s.match(/<\/?[a-z]+[^>]*>/g) || []).map(t => t.replace(/\s.*>/, '>')).sort().join(',');
let total = 0;
const report = (label, problems) => {
  total += problems.length;
  console.log(`${label}: ${problems.length ? problems.length + ' problems' : 'OK'}`);
  for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
};

// English modules are spread into one object, so a key defined twice silently loses one text
const owner = {}, dupes = [];
for (const file of fs.readdirSync(path.join(dir, 'en')).filter(f => f.endsWith('.js')).sort()) {
  for (const k of Object.keys(await load(path.join(dir, 'en', file)))) {
    if (owner[k]) dupes.push(`${k} in both en/${owner[k]} and en/${file}`);
    owner[k] = file;
  }
}
report('en', dupes);

const files = fs.readdirSync(dir).filter(f => /^[a-z]{2}-[A-Z]{2}\.js$/.test(f)).sort();
for (const file of files) {
  const tr = await load(path.join(dir, file));
  const problems = [];
  for (const k of Object.keys(en)) {
    if (typeof tr[k] !== 'string' || !tr[k].trim()) problems.push(`missing ${k}`);
    else {
      if (ph(en[k]) !== ph(tr[k])) problems.push(`placeholders ${k}`);
      if (tags(en[k]) !== tags(tr[k])) problems.push(`tags ${k}`);
    }
  }
  for (const k of Object.keys(tr)) if (!(k in en)) problems.push(`unused ${k}`);
  report(file.replace('.js', ''), problems);
}

// the language picker (LOCALES in js/i18n.js) and the locale files must match
const listed = [...fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8').matchAll(/\['([a-z]{2}-[A-Z]{2})',/g)].map(m => m[1]);
const have = new Set(files.map(f => f.replace('.js', '')));
report('LOCALES', [
  ...listed.filter(c => c !== 'en-US' && !have.has(c)).map(c => `${c} is listed but has no js/i18n/${c}.js`),
  ...[...have].filter(c => !listed.includes(c)).map(c => `js/i18n/${c}.js is not listed in LOCALES`),
]);

// literal keys used in the code must exist in English (dynamic keys like t(`lvl.${id}.name`) aren't checked)
const sources = [path.join(root, 'index.html')];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (p !== dir) walk(p); } else if (e.name.endsWith('.js')) sources.push(p);
});
walk(path.join(root, 'js'));
const unknown = [];
for (const f of sources) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return; // comments
    for (const m of line.matchAll(/\bt\(\s*(['"])([\w.-]+)\1|data-i18n(?:-html|-aria)?="([\w.-]+)"/g)) {
      const k = m[2] || m[3];
      if (!(k in en)) unknown.push(`${path.relative(root, f)}:${i + 1} ${k}`);
    }
  });
}
report('code', unknown);

console.log(`${Object.keys(en).length} English keys`);
process.exit(total ? 1 : 0);
