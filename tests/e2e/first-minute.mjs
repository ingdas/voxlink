// The first figure of a first play: an almost empty screen that fills in as each part is needed, the first block's
// number facing you, the bubble Kubo talks about bigger (and never under his own bubble), links with weight (slow
// motion, the two numbers meeting, Kubo's word on the first one), and after the figure: you face the way on, the door
// swings open, the new stars fly into the world's count and Kubo's bubble has no tutorial step left in it.
import { suite } from './lib.mjs';

const FIRST = { campaign: 2, seen: { prologue: true, meadow: true } };
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); const c = e && getComputedStyle(e); return !!c && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity > 0.5; }, sel);
// grab the block that fits and link it (as the game does on a click)
const linkOne = p => p.evaluate(() => {
  const g = window.__voxlink.game, v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i));
  if (v) g.grab(v.i);
  const c = g.carriedAll().find(i => g.sockets.has(i));
  if (c !== undefined) g.launch(c);
});

await suite('first-minute', async t => {
  const p = await t.page({ save: FIRST });
  await p.click('#btn-play');
  await t.app(p, 'playing');
  await p.waitForTimeout(700);
  t.check('the first step starts on an almost empty screen (no backpack, progress or hint yet)',
    !(await shown(p, '.pack-wrap')) && !(await shown(p, '.progress.tag')) && !(await shown(p, '#btn-hint')) && await shown(p, '#btn-pause'));
  // the first block: its number faces you, upright
  const face = await p.evaluate(() => {
    const g = window.__voxlink.game, THREE = window.__voxlink.ctx.THREE;
    // (js/voxels.js DIRS: each face's normal n and the up v of its number)
    const D = [{ n: [1, 0, 0], v: [0, 1, 0] }, { n: [-1, 0, 0], v: [0, 1, 0] }, { n: [0, 1, 0], v: [0, 0, -1] }, { n: [0, -1, 0], v: [0, 0, 1] }, { n: [0, 0, 1], v: [0, 1, 0] }, { n: [0, 0, -1], v: [0, 1, 0] }];
    const v = g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i)), d = D[g.puzzle.parentDir[v.i]];
    const n = new THREE.Vector3(...d.n).applyQuaternion(v.mesh.quaternion), up = new THREE.Vector3(...d.v).applyQuaternion(v.mesh.quaternion);
    const toCam = g.camera.position.clone().sub(v.mesh.position).normalize();
    return { facing: n.dot(toCam), upright: up.y };
  });
  t.check('the first block\'s number faces you, upright', face.facing > 0.85 && face.upright > 0.8, face);
  const bubbleSize = () => p.evaluate(() => { const g = window.__voxlink.game, s = [...g.sockets.values()][0]; return s.sprite.scale.x / Math.max(1, s.sprite.position.distanceTo(g.camera.position) / 9); });
  t.check('the bubble Kubo is talking about is bigger', (await bubbleSize()) > 0.5, await bubbleSize());

  await p.evaluate(() => { const g = window.__voxlink.game; g.grab(g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i)).i); });
  await p.waitForTimeout(500);
  t.check('the backpack comes in with the first grab', await shown(p, '.pack-wrap') && !(await shown(p, '.progress.tag')));
  // the link: slow motion as it lands, then the two numbers meet
  await p.evaluate(() => { const g = window.__voxlink.game; g.launch(g.carriedAll()[0]); });
  let slow = 0, snaps = 0;
  for (let i = 0; i < 30 && !snaps; i++) { await p.waitForTimeout(40); const s = await p.evaluate(() => ({ slow: window.__voxlink.game.slow, snaps: window.__voxlink.game.snaps.length })); slow = Math.max(slow, s.slow); snaps = s.snaps; }
  t.check('the first figure\'s link lands in slow motion', slow > 0, slow);
  t.check('the two numbers meet where the blocks join', snaps > 0);
  await p.waitForTimeout(800);
  const said = await p.evaluate(() => document.querySelector('#kubo-speech.show .ks-text')?.innerText || '');
  t.check('Kubo has a word for the very first link', /perfect match/.test(said), said);
  t.check('the progress comes in with the first link', await shown(p, '.progress.tag'));
  t.check('the snap is gone again after a moment', await p.waitForFunction(() => window.__voxlink.game.snaps.length === 0, null, { timeout: 4000 }).then(() => true, () => false));

  // finish the figure without stopping for the look / walk steps
  for (let k = 0; k < 30; k++) {
    if (await p.evaluate(() => window.__voxlink.game.mode !== 'play')) break;
    await linkOne(p);
    await p.waitForTimeout(500);
  }
  await p.waitForFunction(() => window.__voxlink.ctx.app === 'complete');
  await p.waitForFunction(() => window.__voxlink.game.roaming && window.__voxlink.ctx.app !== 'complete', null, { timeout: 15000 });
  await p.waitForTimeout(300);
  const back = await p.evaluate(() => {
    const g = window.__voxlink.game, e = g.arch.entryOf(g.level), want = Math.atan2(g.player.pos.x - e.x, g.player.pos.z - e.z);
    const d = Math.atan2(Math.sin(g.player.yaw - want), Math.cos(g.player.yaw - want));
    return { off: Math.abs(d), bubble: document.querySelector('#kubo-speech.show .ks-text')?.innerText || '' };
  });
  t.check('back in control facing the way on (this island\'s bridge)', back.off < 0.15, back);
  t.check('no tutorial step left in Kubo\'s bubble', !/pedestal|look around|walk around/i.test(back.bubble), back.bubble);
  await p.waitForTimeout(2500);
  const after = await p.evaluate(() => ({ door: Math.abs(window.__voxlink.game.arch.parts[0].leaves[0].rotation.y), stars: document.querySelector('#count .w-stars')?.innerText.trim() }));
  t.check('the door has swung open', after.door > 1.5, after);
  t.check('the new stars have flown into the world\'s star count', after.stars === '3', after);
  t.check('the whole HUD is back', !(await p.evaluate(() => document.body.classList.contains('hud-intro'))));
  await p.close();

  // on a phone: Kubo's bubble never covers the bubble on the pedestal he's talking about
  const m = await t.page({ save: FIRST, viewport: { width: 844, height: 390 }, mobile: true });
  await m.tap('#btn-play');
  await t.app(m, 'playing');
  await m.waitForTimeout(1500);
  const cover = await m.evaluate(() => {
    const g = window.__voxlink.game, s = [...g.sockets.values()][0], v = s.sprite.position.clone().project(g.camera);
    const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight, b = document.querySelector('#kubo-speech .ks-box').getBoundingClientRect();
    return { at: [Math.round(x), Math.round(y)], box: [b.left, b.top, b.right, b.bottom].map(Math.round), step: g.tutorial, over: x > b.left - 20 && x < b.right + 20 && y > b.top - 20 && y < b.bottom + 20 };
  });
  t.check('phone: Kubo\'s bubble keeps clear of the pedestal\'s bubble', cover.step === 'grab' && !cover.over, cover);
  await m.close();
});
