// Every world's archipelago builds, and every one of the 50 figures can be completed on its own island.
import { suite } from './lib.mjs';

await suite('worlds', async t => {
  const p = await t.page({ query: '?debug' });
  const n = await p.evaluate(() => window.__voxlink.ctx.CHAPTERS.length);
  for (let c = 0; c < n; c++) {
    const r = await p.evaluate(c => {
      const { game } = window.__voxlink, ch = window.__voxlink.ctx.CHAPTERS[c];
      game.load(ch.levels[0]);
      let solved = 0;
      for (const l of ch.levels) {
        game.load(l, null, { arrive: 'island' });
        let guard = 0;
        while (game.placedCount < game.voxels.length && guard++ < 1000) {
          const v = game.voxels.find(v => v.state !== 'placed' && game.voxels[v.parent]?.state === 'placed');
          if (!v) break;
          game.place(v.i, true);
        }
        if (game.placedCount === game.voxels.length) solved++;
      }
      return { id: ch.id, solved, total: ch.levels.length };
    }, c);
    t.check(`${r.id}: ${r.solved}/${r.total} figures complete`, r.solved === r.total);
  }
});
