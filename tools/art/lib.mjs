// Shared plumbing for the store art (tools/art-pack.mjs): a static server for the repo, headless Chrome with
// WebGL, and game pages whose clock the script drives. Playwright is not a dependency of the game: it is loaded
// from PLAYWRIGHT_DIR (a folder with node_modules/playwright), or from wherever Node can resolve it.
//
// The page's clock is faked (Playwright's page.clock): requestAnimationFrame, timers and performance.now only
// move when the script says so. A software-rendered 1080p frame takes far longer than 1/60 s, so a real-time
// capture would stutter and skip; with the clock in hand every frame of a video is exactly 1/30 s of game time,
// and a still is taken at exactly the moment it is set up for.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const OUT = join(ROOT, 'art/store');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const SAVE_KEY = 'voxlink.v2';

export function loadPlaywright() {
  for (const d of [process.env.PLAYWRIGHT_DIR, process.cwd(), ROOT].filter(Boolean)) {
    try { return createRequire(join(d, 'node_modules', '_'))('playwright'); } catch { /* next */ }
  }
  throw new Error('Playwright not found: set PLAYWRIGHT_DIR to a folder whose node_modules contains playwright');
}

export async function serve() {
  const server = createServer(async (req, res) => {
    const path = posix.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const file = path.endsWith('/') ? `${path}index.html` : path;
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

export async function launch() {
  const { chromium } = loadPlaywright();
  return chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

// a save with every figure finished (three stars) and every story beat seen: the art shows the game, not a first run
export function fullSave(LEVELS, CHAPTERS, { undone = [] } = {}) {
  const stars = {};
  for (const id of LEVELS) if (!undone.includes(id)) stars[id] = { done: true, fast: true, clean: true };
  const seen = { prologue: true, tutorial: true, nexus: true };
  for (const c of CHAPTERS) seen[c] = true;
  return { campaign: 2, unlocked: LEVELS.length, seen, stars, settings: { sfx: 0, music: 0, full: false } };
}

// A game page with a fake clock. `tick(ms)` advances game time (and renders the frames in it);
// `until(fn)` ticks until fn() holds in the page.
export async function gamePage(browser, url, { save, viewport, scale = 1, query = '' }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, s]) => { localStorage.setItem(k, s); }, [SAVE_KEY, JSON.stringify(save)]);
  await p.clock.install({ time: new Date('2026-10-26T10:00:00') });
  await p.goto(url + query);
  const tick = async (ms = 16) => { await p.clock.runFor(ms); };
  const until = async (fn, arg, limit = 60000) => {
    for (let t = 0; t < limit; t += 100) {
      if (await p.evaluate(fn, arg).catch(() => false)) return;
      await tick(100);
      await new Promise(r => setTimeout(r, 20)); // real time for fetches, decoding and shader compiles
    }
    throw new Error(`timed out waiting for ${fn}`);
  };
  await until(() => window.__voxlink?.ctx.app === 'title');
  // full quality, always: no adaptive resolution (software rendering is slow, and would scale itself down)
  await p.evaluate(() => {
    const r = window.__voxlink.ctx.renderer;
    r.adapt = () => {};
    if (r.scale !== 1) { r.scale = 1; r.setSize(r.w, r.h); }
  });
  return { page: p, tick, until, errors, close: () => ctx.close() };
}
