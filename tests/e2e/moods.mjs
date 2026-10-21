// Every world's five islands have characters of their own: each fits its landmark, and no two islands of a world
// get the same one. Screenshots of each island's landmark go to tests/e2e/out/ (MOODS_SHOTS=1).
import { suite, saveWith } from './lib.mjs';
import { mkdirSync } from 'node:fs';

const shots = !!process.env.MOODS_SHOTS;
await suite('moods', async t => {
  const p = await t.page({ save: saveWith(['sprout'], { unlocked: 50 }) });
  if (shots) mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  for (let ch = 0; ch < 10; ch++) {
    await p.evaluate(ch => { const v = window.__voxlink; v.startLevel(v.LEVELS.findIndex(l => l.chapter === ch), false, 'island'); }, ch);
    await t.app(p, 'playing');
    await p.waitForTimeout(400);
    const marks = await p.evaluate(() => window.__voxlink.game.arch.parts.map(pt => ({ id: pt.level.id, mark: pt.world.landmark?.kind || null })));
    const kinds = marks.map(m => m.mark);
    t.check(`world ${ch + 1}: every island has its landmark, all different`, kinds.every(Boolean) && new Set(kinds).size === kinds.length, marks);
    if (!shots) continue;
    await t.hideDebug(p);
    for (const m of marks.filter(m => m.mark)) {
      // a camera of our own, out from the landmark towards the shore, looking back in; drawn and read in one go
      const png = await p.evaluate(id => {
        const v = window.__voxlink, { THREE } = v.ctx, pt = v.game.arch.parts.find(q => q.level.id === id), L = pt.world.landmark;
        const c = pt.world.group.localToWorld(new THREE.Vector3(L.x, 0, L.z)), d = Math.hypot(L.x, L.z) || 1;
        const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
        cam.position.set(c.x + (L.x / d) * 9 + (L.z / d) * 3, c.y + 5, c.z + (L.z / d) * 9 - (L.x / d) * 3);
        cam.lookAt(c.x, c.y + 1.5, c.z);
        v.renderer.render(v.ctx.scene, cam);
        return v.renderer.gl.domElement.toDataURL('image/png');
      }, m.id);
      const { writeFileSync } = await import('node:fs');
      writeFileSync(new URL(`./out/${ch}-${m.id}-${m.mark}.png`, import.meta.url), Buffer.from(png.split(',')[1], 'base64'));
    }
  }
});
