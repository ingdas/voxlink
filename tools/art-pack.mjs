#!/usr/bin/env node
// Regenerate the CrazyGames submission pack in art/store/ and say whether it is in spec.
//
//   PLAYWRIGHT_DIR=<folder with node_modules/playwright> node tools/art-pack.mjs [--no-video] [--only=covers,stills,video]
//
// 1. the three covers: a backdrop rendered by the game (tools/art/covers.mjs) under the game's logo;
// 2. the press-kit stills (the video's scenes as 1920×1080 PNGs);
// 3. both preview videos, beat by beat (tools/art/video.mjs; needs ffmpeg; a few minutes);
// 4. the facts the form needs (the upload's files and size, the initial download), the checks against the portal's
//    limits (tools/art/spec.mjs), and art/store/overview.html, which links all of it together.
// Exits 1 if anything is out of spec. --only re-renders some parts and keeps the rest as they are.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, OUT, serve, launch, fullSave } from './art/lib.mjs';
import { BACKDROPS, renderBackdrop, renderCover } from './art/covers.mjs';
import { recordBeats, renderStills, cutPreview, probeVideo, BEATS } from './art/video.mjs';
import { overviewHtml, runChecks } from './art/overview.mjs';
import { ART_SLOTS } from './art/spec.mjs';
import { LEVELS, CHAPTERS } from '../js/levels.js';
import { GAME_NAME } from '../js/logo.js';

const ARGS = process.argv.slice(2);
const only = ARGS.find(a => a.startsWith('--only='))?.slice(7).split(',');
const want = part => (only ? only.includes(part) : true) && !(part === 'video' && ARGS.includes('--no-video'));
mkdirSync(OUT, { recursive: true });

const ids = LEVELS.map(l => l.id), worldIds = CHAPTERS.map(c => c.id);
// everything rebuilt (the islands stand finished), except the duck the video's first beat rebuilds
const save = fullSave(ids, worldIds, { undone: ['duck'] });
const srv = await serve();
const browser = await launch();
const t0 = Date.now();
const log = s => console.log(`── ${s} (${Math.round((Date.now() - t0) / 1000)} s)`);

try {
  if (want('covers')) {
    const covers = [];
    for (const shape of Object.keys(BACKDROPS)) {
      log(`cover: ${shape}`);
      await renderBackdrop(browser, srv.url, save, LEVELS, shape);
      covers.push(await renderCover(browser, srv.url, shape));
    }
    writeFileSync(join(OUT, 'covers.json'), JSON.stringify({ title: GAME_NAME, covers }, null, 2) + '\n');
  }
  if (want('stills')) {
    log('stills');
    for (const f of readdirSync(OUT)) if (/^screenshot-.*\.png$/.test(f)) rmSync(join(OUT, f));
    await renderStills(browser, srv.url, save, LEVELS);
  }
  if (want('video')) {
    const tmp = join(tmpdir(), 'kubo-art');
    for (const slot of ART_SLOTS.filter(s => s.kind === 'video')) {
      log(`video: ${slot.shape}`);
      const beats = await recordBeats(browser, srv.url, save, LEVELS, slot.shape, join(tmp, slot.shape));
      // the opening frame is the matching cover; the portrait one is drawn again at the video's size
      let cover = join(OUT, ART_SLOTS.find(s => s.kind === 'cover' && s.shape === slot.shape).file);
      if (slot.shape === 'portrait') {
        cover = join(tmp, 'cover-portrait-video.png');
        const ctx = await browser.newContext({ viewport: { width: 800, height: 1200 }, deviceScaleFactor: slot.w / 800 });
        const p = await ctx.newPage();
        await p.goto(`${srv.url}art/store/cover-portrait-800x1200.html`);
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(200);
        await p.screenshot({ path: cover });
        await ctx.close();
      }
      const len = cutPreview(slot.shape, cover, beats, slot.file);
      console.log(`  ${slot.file}: ${len.toFixed(2)} s`);
    }
  }
} finally {
  await browser.close();
}

// ---- the facts ----
log('checks');
// the upload: what the deploy workflow copies
const deploy = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
const shipped = /cp -r ([^\n]+?) _site\//.exec(deploy)[1].trim().split(/\s+/);
let count = 0, bytes = 0;
const walk = p => { const s = statSync(p); if (s.isDirectory()) for (const f of readdirSync(p)) { if (f !== '.DS_Store') walk(join(p, f)); } else { count++; bytes += s.size; } };
for (const f of shipped) walk(join(ROOT, f));
const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
const relative = ![...index.matchAll(/(?:src|href)="([^"]+)"/g)].some(m => /^\/(?!\/)/.test(m[1]));
const title = /<title>([^<]+)<\/title>/.exec(index)[1].replace(/&#39;|&apos;/g, "'");

// the initial download: a first visit, up to the opening cutscene
const b2 = await launch();
const ctx = await b2.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
let initial = { bytes: 0, requests: 0 };
page.on('response', async r => { try { const b = await r.body(); initial.bytes += b.length; initial.requests++; } catch { /* redirects */ } });
await page.goto(srv.url);
await page.waitForFunction(() => window.__voxlink?.ctx.app === 'cinema', null, { timeout: 120000 });
await page.waitForTimeout(500);
await b2.close();
srv.close();

const covers = existsSync(join(OUT, 'covers.json')) ? JSON.parse(readFileSync(join(OUT, 'covers.json'), 'utf8')).covers : [];
for (const c of covers) {
  const id = execFileSync('magick', ['identify', '-format', '%w %h', join(OUT, c.file)]).toString().split(' ').map(Number);
  c.size = { w: id[0], h: id[1] }; c.bytes = statSync(join(OUT, c.file)).size;
}
const videos = ART_SLOTS.filter(s => s.kind === 'video').map(s => {
  const path = join(OUT, s.file), cover = ART_SLOTS.find(c => c.kind === 'cover' && c.shape === s.shape).file;
  if (!existsSync(path)) return { file: s.file, poster: cover };
  return { file: s.file, poster: cover, probe: probeVideo(path), olderThanCover: statSync(path).mtimeMs < statSync(join(OUT, cover)).mtimeMs };
});
const stills = BEATS.filter(b => b.still).map(b => `screenshot-${b.still.name}-1920x1080.png`).filter(f => existsSync(join(OUT, f)));
copyFileSync(join(ROOT, 'icons/icon.svg'), join(OUT, 'icon.svg'));
copyFileSync(join(ROOT, 'icons/icon-512.png'), join(OUT, 'icon-512.png'));
const locales = readdirSync(join(ROOT, 'js/i18n')).filter(f => /^[a-z]{2}-[A-Z]{2}\.js$/.test(f)).length + 1; // + English

const facts = {
  generated: new Date().toISOString().slice(0, 10), commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(),
  title, figures: LEVELS.length, worlds: CHAPTERS.length, locales,
  files: { count, bytes, relative }, initial, covers, videos, stills,
};
writeFileSync(join(OUT, 'overview.html'), overviewHtml(facts));

const checks = runChecks(facts);
const tag = { ok: '  ok  ', warn: ' warn ', fail: ' FAIL ' };
for (const c of checks) console.log(`${tag[c.level]} ${c.area.padEnd(16)} ${c.text.replace(/<[^>]+>/g, '')}`);
const fails = checks.filter(c => c.level === 'fail').length, warns = checks.filter(c => c.level === 'warn').length;
console.log(`\n${fails ? `${fails} out of spec` : 'Inside every limit the portal checks'}${warns ? `, ${warns} to look at` : ''}. Open art/store/overview.html.`);
process.exit(fails ? 1 : 0);
