// The three store covers. Each is a composition, as the store asks ("an artistic cover, not a screenshot"), but
// every pixel comes from the game: the backdrop is the real game rendering a real island (its figure nearly
// rebuilt, the last blocks flying in, Kubo floating by), at twice the cover's size for clean edges; the lockup is
// the game's own logo (js/logo.js, the same blocks, colours and font as the title screen). The composition is a
// small HTML page per cover (art/store/cover-*.html), screenshot at its exact size.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, ROOT, gamePage } from './lib.mjs';
import { NO_TEXT_ZONES } from './spec.mjs';
import { LOGO_ROWS, GAME_NAME } from '../../js/logo.js';

// Where the camera looks from, per cover, as an orbit around the figure: `angle` around it (0 = in front),
// `dist` and `height` in metres, `lookY` the height it aims at, and `shift` how far (in metres) it aims to the
// side of the figure, which pushes the figure the other way in the frame and leaves room for the lockup. Kubo
// floats at `kubo`: [towards the camera, to the right as seen, height]. Blocks fly in from `fly` metres away.
export const BACKDROPS = {
  landscape: { w: 1920, h: 1080, fig: 'mushroom', leave: 7, fov: 30, angle: -1.0, dist: 10, height: 1.9, lookY: 2.1, shift: 1.7, kubo: [2.4, 1.7, 1.7], fly: 3.0 },
  portrait: { w: 800, h: 1200, fig: 'mushroom', leave: 7, fov: 48, angle: -1.35, dist: 9, height: 1.9, lookY: 1.3, shift: 0, kubo: [3.0, 1.1, 1.4], fly: 3.0 },
  square: { w: 800, h: 800, fig: 'mushroom', leave: 7, fov: 40, angle: -1.35, dist: 9, height: 1.9, lookY: 1.5, shift: 0.6, kubo: [3.0, 1.4, 1.5], fly: 3.0 },
};

// the camera and Kubo for a spec (figure on its pedestal at the origin)
export function framing(B) {
  const toCam = [Math.sin(B.angle), Math.cos(B.angle)], right = [Math.cos(B.angle), -Math.sin(B.angle)];
  const cam = { pos: [toCam[0] * B.dist, B.height, toCam[1] * B.dist], look: [-right[0] * B.shift, B.lookY, -right[1] * B.shift], fov: B.fov };
  const [d, r, y] = B.kubo;
  const kubo = { pos: [toCam[0] * d + right[0] * r, y, toCam[1] * d + right[1] * r], ground: 0.5 };
  return { cam, kubo, toCam, right };
}

// Render one backdrop: the figure built but for its last blocks, some of which are frozen mid-flight.
export async function renderBackdrop(browser, url, save, LEVELS, shape, { scale = 2 } = {}) {
  const B = BACKDROPS[shape];
  const g = await gamePage(browser, url, { save, viewport: { width: B.w, height: B.h }, scale });
  const p = g.page;
  await p.addScriptTag({ path: join(ROOT, 'tools/art/stage.js') });
  await p.evaluate(i => window.__voxlink.startLevel(i, false, 'island'), LEVELS.findIndex(l => l.id === B.fig));
  await g.until(() => window.__voxlink.ctx.app === 'playing');
  await g.tick(1600); // the camera's glide from the orbit to your eyes, blocks settled
  await p.evaluate(leave => { window.__art.buildAllBut(leave); window.__art.hud(false); }, B.leave);
  const { cam, kubo, toCam, right } = framing(B);
  await p.evaluate(([cam, kubo, toCam, right, far]) => {
    window.__art.camera(cam);
    window.__art.kubo(kubo);
    // the fitting blocks fly in from the near side and both flanks, caught at different points of their flight
    const vox = window.__voxlink.game.voxels;
    const from = [[0.9, -0.6], [0.5, 0.85], [-0.2, -1], [0.95, 0.25]];
    window.__art.fits().slice(0, 4).forEach((i, k) => {
      const [c, s] = from[k], t = vox[i].target;
      window.__art.fly(i, [t.x + (toCam[0] * c + right[0] * s) * far, 1.1 + k * 0.25, t.z + (toCam[1] * c + right[1] * s) * far], 1.1 + k * 0.35);
    });
  }, [cam, kubo, toCam, right, B.fly]);
  await g.tick(420); // mid-flight
  const file = join(OUT, 'backdrops', `${shape}.png`);
  mkdirSync(join(OUT, 'backdrops'), { recursive: true });
  await p.screenshot({ path: file });
  if (g.errors.length) console.log(`  page errors (${shape}):`, g.errors.slice(0, 3));
  await g.close();
  return file;
}

// The lockup per cover: logo size (the em of the letter blocks) and where its box goes, in cover pixels.
// Landscape: left of centre, under the label zone; portrait and square: along the bottom.
const LOCKUP = {
  landscape: { em: 104, left: 96, top: 520, align: 'flex-start' },
  portrait: { em: 84, left: 0, right: 0, bottom: 64, align: 'center' },
  square: { em: 74, left: 0, right: 0, bottom: 44, align: 'center' },
};

const COLORS = ['#ffc93c', '#ff6b6b', '#3ddc97', '#4cc9f0', '#b693f5'];
const ROT = [-6, 4, -3, 5, -4, 3, -5];
function logoHtml() {
  let k = 0;
  return LOGO_ROWS.map(word => `<div class="row">${[...word].map(ch => {
    if (ch === "'") return '<span class="apos">’</span>';
    const s = `<span style="--c:${COLORS[k % COLORS.length]};--rot:${ROT[k % ROT.length]}deg">${ch}<sup>${k + 1}</sup></span>`;
    k++;
    return s;
  }).join('')}</div>`).join('');
}

// A cover page: the backdrop full-bleed, a soft shade where the lockup sits (for contrast on any backdrop), and
// the logo. Self-contained but for the backdrop and the game's own font (relative paths into the repo).
export function coverHtml(shape) {
  const B = BACKDROPS[shape], L = LOCKUP[shape];
  const pos = Object.entries(L).filter(([k]) => ['left', 'right', 'top', 'bottom'].includes(k)).map(([k, v]) => `${k}:${v}px`).join(';');
  const shade = shape === 'landscape'
    ? 'radial-gradient(ellipse 980px 520px at 500px 650px, rgba(255,244,224,.55), rgba(255,244,224,0) 70%)'
    : 'linear-gradient(to top, rgba(255,244,224,.5), rgba(255,244,224,0) 34%)';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${GAME_NAME} — ${shape} cover ${B.w}×${B.h}</title>
<!-- Generated by tools/art-pack.mjs: the backdrop is rendered by the game, the lockup is its logo (js/logo.js). -->
<style>
  @font-face { font-family: Fredoka; font-weight: 700; src: url(../../fonts/fredoka-latin-700-normal.woff2) format('woff2'); }
  html, body { margin: 0; width: ${B.w}px; height: ${B.h}px; overflow: hidden; }
  body { position: relative; background: #2a1f3d url(backdrops/${shape}.png) center / cover no-repeat; font-family: Fredoka, sans-serif; }
  .shade { position: absolute; inset: 0; background: ${shade}; }
  .lockup { position: absolute; ${pos}; display: flex; flex-direction: column; align-items: ${L.align}; gap: .16em; font-size: ${L.em}px; }
  .row { display: flex; gap: .09em; align-items: center; }
  .row span { position: relative; display: grid; place-items: center; width: 1.12em; height: 1.12em; font-weight: 700; line-height: 1;
    background: var(--c); color: #2a1f3d; border: .06em solid #2a1f3d; border-radius: .2em; box-shadow: 0 .11em 0 #2a1f3d; transform: rotate(var(--rot)); }
  .row span sup { position: absolute; top: .1em; right: .14em; font-size: .24em; background: #fff4e0; border: .09em solid #2a1f3d; border-radius: 999px;
    min-width: 1.6em; height: 1.6em; display: grid; place-items: center; line-height: 1; }
  .row span.apos { width: auto; height: auto; margin: 0 -.06em; align-self: flex-start; background: none; border: 0; box-shadow: none; transform: none;
    color: #fff4e0; -webkit-text-stroke: .05em #2a1f3d; paint-order: stroke; font-size: 1.1em; }
  ${shape === 'landscape' ? '.lockup .row:nth-child(2) { margin-left: .5em; }' : ''}
</style></head>
<body><div class="shade"></div><div class="lockup" id="lockup" role="img" aria-label="${GAME_NAME}">${logoHtml()}</div></body></html>
`;
}

// Write the cover page, screenshot it at its exact size, and measure the lockup against the portal's label zone.
export async function renderCover(browser, url, shape) {
  const B = BACKDROPS[shape];
  const name = `cover-${shape}-${B.w}x${B.h}`;
  writeFileSync(join(OUT, `${name}.html`), coverHtml(shape));
  const ctx = await browser.newContext({ viewport: { width: B.w, height: B.h } });
  const p = await ctx.newPage();
  await p.goto(`${url}art/store/${name}.html`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => getComputedStyle(document.body).backgroundImage !== 'none');
  await p.waitForTimeout(200);
  await p.screenshot({ path: join(OUT, `${name}.png`) });
  const r = await p.evaluate(() => { const b = document.getElementById('lockup').getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) }; });
  await ctx.close();
  const z = NO_TEXT_ZONES[shape], zone = { w: Math.round(B.w * z.w), h: Math.round(B.h * z.h) };
  // clear when the lockup is entirely right of or below the zone, and inside the frame
  const clear = (r.left >= zone.w || r.top >= zone.h) && r.left >= 0 && r.top >= 0 && r.right <= B.w && r.bottom <= B.h;
  return { file: `${name}.png`, w: B.w, h: B.h, layout: shape, lockup: r, zone, clear };
}
