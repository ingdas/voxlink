// The two preview videos (landscape 1920×1080, portrait 1080×1620) and the press-kit stills.
//
// The preview is what plays when a player hovers the game on the portal, so it is a cut, not a capture: seven
// beats, each a real scene of the real game, recorded on its own and cut together. The store's rules
// (docs.crazygames.com/requirements/game-covers): 15–20 s, 1080p, no audio, no black frames or bars, no logo
// transitions or promotional text, the matching static cover as the opening frame, no fast-forward.
//
// Every frame is rendered by the game in headless Chrome with its clock in our hands (lib.mjs): each video frame
// is exactly 1/30 s of game time, however long the frame took to render, so motion is smooth and real-time.
// The cameras of the scenic beats are scripted (like the game's own cutscenes); the opening beat is played
// through the player's own eyes with the HUD: carrying the last four blocks, one tap links the first and the
// rest chain in after it, the figure is whole and the game's own celebration takes over.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { OUT, ROOT, gamePage } from './lib.mjs';

export const FPS = 30;
const SHAPES = { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1620 } };
// how much wider (vertically) the portrait cameras see, so a scene framed for 16:9 keeps its subject in 2:3
const PORTRAIT_FOV = 1.42;

const lerp3 = (a, b) => `[${a[0]} + (${b[0] - a[0]}) * e, ${a[1]} + (${b[1] - a[1]}) * e, ${a[2]} + (${b[2] - a[2]}) * e]`;
// a camera gliding from one pose to another (eased), as the source of a function of u (0..1 over the beat)
const glide = (from, to, fov) => `u => { const e = u * u * (3 - 2 * u); return { pos: ${lerp3(from.pos, to.pos)}, look: ${lerp3(from.look, to.look)}, fov: ${fov} }; }`;
// an orbit round the origin: angle a0 → a1 (radians), radius r, height y, looking at height ly
const orbit = (a0, a1, r, y, ly, fov, r1 = r, y1 = y) =>
  `u => { const e = u * u * (3 - 2 * u), a = ${a0} + ${a1 - a0} * e, r = ${r} + ${r1 - r} * e; return { pos: [Math.sin(a) * r, ${y} + ${y1 - y} * e, Math.cos(a) * r], look: [0, ${ly}, 0], fov: ${fov} }; }`;

// The beats, in order. `fig`: whose island (finished, standing) unless `fresh`; `dur`: seconds in the cut;
// `cam(H, fov)`: camera source (H = the figure's height; none: the player's own eyes); `kubo`: Kubo's pose or null
// to let him be; `hud`; `setup(page)` and `frame` (a function of the beat's time t, run before every frame) script
// the player; `still`: the moment (0..1) for the press-kit screenshot of this beat; `video: false`: a still only.
// The cut is mostly play, seen through the player's eyes with the HUD: carrying and linking, grabbing, the tools,
// the updraft, a walk to a portal; one look at the Keeper Colossus closes it.
const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])); // the player's yaw facing a point
export const BEATS = [
  {
    name: 'build', fig: 'duck', fresh: true, dur: 3.2, hud: true, still: { at: 0.06, name: 'build' },
    // the figure all but done, the last four blocks carried: one link and the rest chain in, then the celebration
    async setup(p) {
      await p.evaluate(() => {
        const A = window.__art, g = window.__voxlink.game;
        A.buildAllBut(4);
        for (const v of g.voxels) if (v.state !== 'placed') A.grab(v.i);
        A.player([1.3, 0, 5.0], Math.atan2(1.3, 5.0) + 0.3, 0.02);
      });
    },
    frame: `(t) => {
      const A = window.__art, g = window.__voxlink.game, pl = g.player;
      const goal = Math.atan2(1.3, 5.0) - 0.02;
      if (t < 0.45) { const k = Math.min(1, t / 0.4), e = k * k * (3 - 2 * k); pl.yaw = goal + 0.32 * (1 - e); pl.pitch = 0.02 + 0.1 * e; }
      if (t >= 0.5 && !window.__linked) { const fit = g.pack.find(i => g.sockets.has(i)); if (fit !== undefined) { window.__linked = true; A.link(fit); } }
    }`,
  },
  {
    name: 'grab', fig: 'penguin', fresh: true, dur: 1.8, hud: true, still: { at: 0.5, name: 'grab' },
    // three blocks in a row picked up off the snow, turning from one to the next; the backpack fills
    async setup(p) {
      await p.evaluate(yawSrc => {
        const yawTo = (0, eval)(yawSrc), A = window.__art, g = window.__voxlink.game;
        A.buildAllBut(18);
        const P = [1.6, 4.9], face = yawTo(P, [0, 0]) + 1.15;
        const fits = A.fits(), loose = g.voxels.filter(v => v.state === 'loose').map(v => v.i);
        const pick = [...fits, ...loose.filter(i => !fits.includes(i))].slice(0, 3);
        const at = pick.map((i, k) => { const a = face + (k - 1) * 0.55, d = 2.3; return [P[0] - Math.sin(a) * d, P[1] - Math.cos(a) * d]; });
        pick.forEach((i, k) => A.lay(i, at[k][0], at[k][1], k * 0.7));
        window.__grab = { pick, yaws: at.map(q => yawTo(P, q)), face };
        A.player([P[0], 0, P[1]], window.__grab.yaws[0], -0.42);
      }, yawTo.toString());
    },
    frame: `(t) => {
      const G = window.__grab, g = window.__voxlink.game, pl = g.player;
      const keys = [[0, G.yaws[0]], [0.55, G.yaws[1]], [1.1, G.yaws[2]], [2.0, G.yaws[2]]];
      const grabs = [0.22, 0.78, 1.33];
      grabs.forEach((at, k) => { if (t >= at && !G['g' + k]) { G['g' + k] = true; window.__art.grab(G.pick[k]); } });
      for (let k = 0; k < keys.length - 1; k++) {
        const [t0, a] = keys[k], [t1, b] = keys[k + 1];
        if (t >= t0 && t < t1) { const u = Math.min(1, Math.max(0, (t - t0 - 0.2) / (t1 - t0 - 0.2))), e = u * u * (3 - 2 * u); pl.yaw = a + (b - a) * e; }
      }
      pl.pitch = -0.38;
    }`,
  },
  {
    name: 'tools', fig: 'lighthouse', fresh: true, dur: 2.7, hud: true, still: { at: 0.3, name: 'tools' },
    // the magnet pulls every block that fits into the backpack, then Kubo Express sends them across to the figure
    async setup(p) {
      await p.evaluate(yawSrc => {
        const yawTo = (0, eval)(yawSrc), A = window.__art, g = window.__voxlink.game;
        A.buildAllBut(12);
        const P = [-4.6, 8.2], face = yawTo(P, [0, 0]);
        A.fits().slice(0, 4).forEach((i, k) => {
          const a = face + [-0.75, 0.6, -0.3, 0.95][k], d = [3.2, 4.0, 5.2, 2.8][k];
          A.lay(i, P[0] - Math.sin(a) * d, P[1] - Math.cos(a) * d, k);
        });
        g.magnetCharges = 1; g.expressCharges = 1;
        A.player([P[0], 0, P[1]], face, 0.12);
      }, yawTo.toString());
    },
    frame: `(t) => {
      const g = window.__voxlink.game;
      window.__voxlink.ctx.companion?.reset();
      if (t >= 0.3 && !window.__mag) { window.__mag = true; g.useMagnet(); }
      if (t >= 1.15 && !window.__exp) { window.__exp = true; g.useExpress(); }
      g.player.pitch = 0.12 + 0.1 * Math.min(1, Math.max(0, (t - 1.2) / 0.8));
    }`,
  },
  {
    name: 'reef', fig: 'clownfish', fresh: true, dur: 2.1, hud: true, still: { at: 0.15, name: 'reef-link' },
    // at sunset on the reef: three blocks carried, one link and the other two chain in after it
    async setup(p) {
      await p.evaluate(() => {
        const A = window.__art, g = window.__voxlink.game;
        A.buildAllBut(3);
        for (const v of g.voxels) if (v.state !== 'placed') A.grab(v.i);
        A.player([-1.6, 0, 4.8], Math.atan2(-1.6, 4.8) - 0.18, 0.1);
      });
    },
    frame: `(t) => {
      const A = window.__art, g = window.__voxlink.game, pl = g.player, goal = Math.atan2(-1.6, 4.8);
      const k = Math.min(1, t / 0.35), e = k * k * (3 - 2 * k); pl.yaw = goal - 0.18 * (1 - e);
      if (t >= 0.4 && !window.__linked) { const fit = g.pack.find(i => g.sockets.has(i)); if (fit !== undefined) { window.__linked = true; A.link(fit); } }
    }`,
  },
  {
    name: 'float', fig: 'rocket', fresh: true, dur: 2.2, hud: true, still: { at: 0.65, name: 'float' },
    // hold jump inside the glowing ring: the Keeper's updraft lifts you up the rocket, Earth over your shoulder
    async setup(p) {
      await p.evaluate(yawSrc => {
        const yawTo = (0, eval)(yawSrc), A = window.__art, g = window.__voxlink.game;
        A.buildAllBut(14);
        const loose = g.voxels.filter(v => v.state === 'loose').slice(0, 2);
        for (const v of loose) A.grab(v.i);
        const P = [1.7, 3.4];
        A.player([P[0], 0, P[1]], yawTo(P, [0, 0]) + Math.PI - 0.5, -0.12);
        A.kubo({ pos: [-3, 1.5, -3], ground: 0.5 }); // out of the way, behind the rocket
        A.key('Space', true);
      }, yawTo.toString());
    },
    frame: `(t) => {
      const g = window.__voxlink.game, pl = g.player;
      window.__voxlink.ctx.companion?.reset(); // (talking, he'd float into view)
      pl.pitch = -0.12 - 0.45 * Math.min(1, t / 2.0);
    }`,
  },
  {
    name: 'walk', isle: true, dur: 1.8, hud: true, still: { at: 0.4, name: 'keepers-isle-walk' },
    // across the Keeper's Isle: zip along a bridge towards a world's portal
    async setup(p) {
      await p.evaluate(() => {
        const N = window.__voxlink.ctx.nexus.session, k = 6, u = N.isle.islets[k].u;
        const r = 4;
        N.player.pos.set(u.x * r, 0, u.z * r); N.player.vel.set(0, 0, 0);
        N.player.yaw = Math.atan2(-u.x, -u.z); N.player.pitch = 0.04;
        window.__art.key('KeyW', true); window.__art.key('ShiftLeft', true);
      });
    },
    // stop just short of the portal (stepping in would load the world mid-shot)
    frame: `() => {
      const N = window.__voxlink.ctx.nexus.session, q = N.isle.portalPos(6), pl = N.player.pos;
      if (Math.hypot(q.x - pl.x, q.z - pl.z) < 3.2) { window.__art.key('KeyW', false); window.__art.key('ShiftLeft', false); }
    }`,
  },
  {
    name: 'storm', fig: 'colossus', dur: 2.3, still: { at: 0.8, name: 'storm' },
    cam: (H, f) => glide({ pos: [4, H * 0.5, H * 1.6 + 6], look: [0, H * 0.5, 0] }, { pos: [2.5, H * 0.45, H * 1.1 + 5], look: [0, H * 0.6, 0] }, f(46)),
  },
  // stills only: the worlds at their prettiest
  {
    name: 'frost', fig: 'penguin', video: false, dur: 2.5, still: { at: 0.6, name: 'frost' },
    cam: (H, f) => glide({ pos: [-15, 10, 17], look: [0, 1.5, 0] }, { pos: [-7.5, 4.2, 8.5], look: [0, H * 0.45 + 0.5, 0] }, f(40)),
    kubo: H => ({ pos: [-1.6, H * 0.45 + 1.1, 3.2], ground: 0.5 }),
  },
  {
    name: 'starfall', fig: 'castle', video: false, dur: 2.4, still: { at: 0.5, name: 'starfall' },
    cam: (H, f) => orbit(0.42, 0.8, 9.2, 2.5, H * 0.5 + 0.8, f(42), 8.4, 2.2),
    kubo: H => ({ pos: [-2.6, H * 0.4 + 0.9, 2.4], ground: 0.5 }),
  },
  {
    name: 'reef-view', fig: 'clownfish', video: false, dur: 2.4, still: { at: 0.5, name: 'reef' },
    cam: (H, f) => orbit(0.3, 0.7, 9.5, 2.2, H * 0.5 + 0.7, f(40)),
    kubo: H => ({ pos: [-2.2, H * 0.5 + 0.9, 2.6], ground: 0.5 }),
  },
  {
    name: 'isle', isle: true, video: false, dur: 3.0, still: { at: 0.5, name: 'keepers-isle' },
    cam: (H, f) => orbit(-0.25, 0.35, 36, 17, 0.5, f(44), 31, 14),
  },
];

// Load a beat's scene in an open game page and frame it (exported for tuning a beat on its own).
export async function stageBeat(g, beat, shape, LEVELS) {
  const p = g.page;
  // let the last beat's timers run out first (a figure finished in it walks you back onto its island 2.6 s later)
  await p.evaluate(() => { window.__beatFrame = null; for (const k of ['KeyW', 'ShiftLeft', 'Space']) window.__art.key(k, false); });
  await g.tick(4000);
  if (beat.isle) {
    await p.evaluate(() => window.__voxlink.ctx.openNexus());
    await g.until(() => window.__voxlink.ctx.app === 'nexus' && window.__voxlink.ctx.nexus.session?.ready);
  } else {
    await p.evaluate(([i, fresh]) => window.__voxlink.startLevel(i, !fresh, 'island'), [LEVELS.findIndex(l => l.id === beat.fig), !!beat.fresh]);
    await g.until(id => window.__voxlink.ctx.app === 'playing' && window.__voxlink.game.level.id === id && window.__voxlink.game.mode === 'play', beat.fig);
  }
  await g.tick(1200); // settled: arrival glide over, blocks landed, shaders warm
  await p.evaluate(on => {
    window.__linked = window.__mag = window.__exp = false;
    for (const k of ['KeyW', 'ShiftLeft', 'Space']) window.__art.key(k, false);
    window.__voxlink.ctx.companion?.reset();
    window.__voxlink.ctx.input.jumpHeld = false;
    window.__art.hud(on); window.__voxlink.ctx.hideDoneCard?.();
  }, !!beat.hud);
  const H = await p.evaluate(() => window.__art.info().height || 4);
  const f = fov => Math.min(80, shape === 'portrait' ? fov * PORTRAIT_FOV : fov);
  await p.evaluate(k => window.__art.kubo(k), beat.kubo ? beat.kubo(H) : null);
  if (beat.setup) await beat.setup(p); // (may pose Kubo itself)
  if (beat.cam) await p.evaluate(([c, d]) => window.__art.camera(c, d), [beat.cam(H, f), beat.dur]);
  else await p.evaluate(() => window.__art.camera(null));
  if (beat.frame) await p.evaluate(src => { window.__beatFrame = (0, eval)(src); }, beat.frame);
  else await p.evaluate(() => { window.__beatFrame = null; });
}

// advance one video frame: the beat's own script first, then 1/FPS of game time
async function step(g, t) {
  await g.page.evaluate(t => window.__beatFrame?.(t), t);
  await g.tick(1000 / FPS);
}

// Record every beat of one shape as JPEG frames (dir/<beat>/0001.jpg …); returns the beat directories.
export async function recordBeats(browser, url, save, LEVELS, shape, dir, only = null) {
  const S = SHAPES[shape];
  const g = await gamePage(browser, url, { save, viewport: { width: S.w, height: S.h } });
  await g.page.addScriptTag({ path: join(ROOT, 'tools/art/stage.js') });
  const dirs = [];
  for (const beat of BEATS) {
    if (beat.video === false || (only && !only.includes(beat.name))) continue;
    const d = join(dir, beat.name);
    rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true });
    await stageBeat(g, beat, shape, LEVELS);
    const n = Math.round(beat.dur * FPS);
    for (let k = 0; k < n; k++) {
      await step(g, k / FPS);
      await g.page.screenshot({ path: join(d, `${String(k + 1).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 94 });
    }
    process.stdout.write(`  ${shape} ${beat.name}: ${n} frames\n`);
    dirs.push({ beat, dir: d });
  }
  if (g.errors.length) console.log('  page errors:', g.errors.slice(0, 3));
  await g.close();
  return dirs;
}

// The press-kit stills: each beat at its moment, rendered at twice the size and scaled down.
export async function renderStills(browser, url, save, LEVELS) {
  const out = [];
  const g = await gamePage(browser, url, { save, viewport: { width: 1920, height: 1080 }, scale: 2 });
  await g.page.addScriptTag({ path: join(ROOT, 'tools/art/stage.js') });
  for (const beat of BEATS) {
    if (!beat.still) continue;
    await stageBeat(g, beat, 'landscape', LEVELS);
    const n = Math.round(beat.dur * beat.still.at * FPS);
    for (let k = 0; k < n; k++) await step(g, k / FPS);
    const big = join(OUT, `.still-${beat.still.name}.png`), file = `screenshot-${beat.still.name}-1920x1080.png`;
    await g.page.screenshot({ path: big });
    execFileSync('magick', [big, '-filter', 'Lanczos', '-resize', '1920x1080', '-strip', join(OUT, file)]);
    rmSync(big);
    out.push(file);
  }
  await g.close();
  return out;
}

function ffmpeg(args) { execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' }); }

// Cut one preview: the cover held, dissolving into the beats, which dissolve into each other.
export function cutPreview(shape, coverPng, beatDirs, file, { hold = 0.7, fade = 0.3, xfade = 0.2, crf = 21 } = {}) {
  const S = SHAPES[shape];
  const inputs = ['-loop', '1', '-framerate', String(FPS), '-t', String(hold + fade), '-i', coverPng];
  for (const b of beatDirs) inputs.push('-framerate', String(FPS), '-i', join(b.dir, '%04d.jpg'));
  const scale = `scale=${S.w}:${S.h}:flags=lanczos,setsar=1,format=yuv420p,fps=${FPS}`;
  const parts = [`[0:v]${scale}[v0]`];
  beatDirs.forEach((b, k) => parts.push(`[${k + 1}:v]${scale}[v${k + 1}]`));
  let prev = 'v0', len = hold + fade;
  beatDirs.forEach((b, k) => {
    const d = k === 0 ? fade : xfade;
    const offset = (len - d).toFixed(3);
    const outL = k === beatDirs.length - 1 ? 'out' : `x${k}`;
    parts.push(`[${prev}][v${k + 1}]xfade=transition=fade:duration=${d}:offset=${offset}[${outL}]`);
    len = len - d + b.beat.dur;
    prev = outL;
  });
  ffmpeg([...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-an', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', isAbsolute(file) ? file : join(OUT, file)]);
  return len;
}

// What a finished video is: size, duration, streams, and whether any stretch of it is black.
export function probeVideo(path) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]).toString());
  const v = j.streams.find(s => s.codec_type === 'video');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', path, '-vf', 'blackdetect=d=0.1:pix_th=0.08', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  return {
    w: v.width, h: v.height, codec: v.codec_name, seconds: +(+j.format.duration).toFixed(2), bytes: statSync(path).size,
    audio: j.streams.some(s => s.codec_type === 'audio'), black: /black_start/.test(r.stderr),
  };
}

export const frameCount = d => readdirSync(d).length;
