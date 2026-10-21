// Shared helpers for the browser tests: a static server for the repo, headless Chrome with WebGL (SwiftShader),
// pages with a seeded save, and pass/fail checks. Playwright is not a dependency of the game: it's loaded from
// PLAYWRIGHT_DIR (a folder with node_modules/playwright), or from wherever Node can resolve it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const SAVE_KEY = 'voxlink.v2';

function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, process.cwd(), ROOT].filter(Boolean);
  for (const d of dirs) {
    try { return createRequire(join(d, 'node_modules', '_'))('playwright'); } catch { /* next */ }
  }
  throw new Error('Playwright not found: set PLAYWRIGHT_DIR to a folder whose node_modules contains playwright');
}

let server = null, base = '';
export async function serve() {
  if (server) return base;
  server = createServer(async (req, res) => {
    const path = posix.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const file = path.endsWith('/') ? `${path}index.html` : path;
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  return base;
}

// one test file = one suite: launch, run, report, exit non-zero on any failed check or page error
export async function suite(name, fn) {
  const url = await serve();
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const errors = [];
  let failed = 0, passed = 0;
  const t = {
    url,
    // a page with a seeded save (null: a fresh first launch); errors on the page fail the suite
    async page({ save = null, query = '', viewport = { width: 1280, height: 720 }, mobile = false, waitFor = 'title' } = {}) {
      const p = await browser.newPage({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
      p.on('pageerror', e => errors.push(`${e.message} ${(e.stack || '').split('\n')[1] || ''}`));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
      // seed the save once per page (reloads keep what the game wrote)
      await p.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (s) localStorage.setItem(k, s); else localStorage.removeItem(k); } }, [SAVE_KEY, save && JSON.stringify(save)]);
      await p.goto(url + query);
      if (waitFor) await p.waitForFunction(w => window.__voxlink?.ctx.app === w, waitFor, { timeout: 45000 });
      return p;
    },
    check(label, ok, detail = '') {
      if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
    },
    // wait until the app reaches a state
    app: (p, state, timeout = 45000) => p.waitForFunction(s => window.__voxlink.ctx.app === s, state, { timeout }),
    // instantly finish the current figure (debug panel)
    win: p => p.evaluate(() => document.querySelector('#debug-panel [data-a=win]').click()),
    hideDebug: p => p.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; }),
  };
  console.log(name);
  try { await fn(t); } catch (e) { failed++; console.log(`  ✗ threw: ${e.message.split('\n')[0]}`); }
  await browser.close();
  if (errors.length) { failed++; console.log(`  ✗ page errors:\n    ${errors.slice(0, 6).join('\n    ')}`); }
  console.log(`  ${passed} passed, ${failed} failed`);
  server.close();
  process.exitCode = failed ? 1 : 0;
}

// a save that has finished the given figures (ids) with the given stars
export function saveWith(ids, { stars = { done: true }, unlocked, seen = {}, extra = {} } = {}) {
  return {
    campaign: 2, unlocked: unlocked ?? ids.length + 1,
    seen: { prologue: true, tutorial: true, meadow: true, ...seen },
    stars: Object.fromEntries(ids.map(id => [id, { ...stars }])), ...extra,
  };
}
export const MEADOW = ['sprout', 'tulip', 'mushroom', 'ladybug', 'apple'];
