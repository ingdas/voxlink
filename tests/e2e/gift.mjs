// Gift links: a brand-new player's gift is saved at once and offered on the Sprout's results card (Enter opens
// it); a gift for a full workshop waits and moves in when a slot frees up; names can't flip their direction.
import { suite, saveWith } from './lib.mjs';

const codeFor = (p, name, n = 9) => p.evaluate(async ([name, n]) => {
  const m = await import('/js/features/workshop.js');
  return m.encodeFigure({ name, voxels: Array.from({ length: n }, (_, k) => ({ x: k % 3, y: (k / 3) | 0, z: 0, c: 'u' })), theme: 'reef' });
}, [name, n]);

await suite('gift', async t => {
  const p0 = await t.page({ query: '?debug' });
  const code = await codeFor(p0, 'Blue Wall');
  const evil = await codeFor(p0, 'Gift‮evil 👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦', 8);
  await p0.close();

  // a brand-new player (?debug skips the cutscene for the test)
  const p = await t.page({ query: `?debug&fig=${code}` });
  await p.waitForTimeout(800);
  t.check('the gift is saved straight away', await p.evaluate(() => window.__voxlink.save.custom?.length === 1 && !!window.__voxlink.save.pendingGift));
  t.check('a card says it is waiting', /Blue Wall/.test(await p.evaluate(() => document.getElementById('ws-toast').textContent)));
  await t.hideDebug(p);
  await p.evaluate(() => { window.__voxlink.save.seen.tutorial = true; window.__voxlink.startLevel(0); });
  await t.app(p, 'playing');
  await p.evaluate(() => { window.__voxlink.game.tutorial = null; });
  await t.win(p);
  await p.waitForTimeout(4200);
  t.check('the Sprout\'s card offers the gift', /gift/i.test(await p.evaluate(() => document.getElementById('dc-go')?.innerText || '')));
  await p.keyboard.press('Enter'); await p.waitForTimeout(600);
  const g = await p.evaluate(() => ({ ov: window.__voxlink.ctx.overlays.slice(), focus: document.activeElement?.id }));
  t.check('Enter opens the gift card, Play focused', g.ov.includes('screen-ws-gift') && g.focus === 'ws-g-play', g);
  await p.keyboard.press('Enter');
  await t.app(p, 'playing');
  t.check('Enter plays it', await p.evaluate(() => window.__voxlink.game.level.kind === 'custom' && /Blue Wall/.test(window.__voxlink.game.level.name)));
  await p.close();

  // a full workshop: the gift waits, and moves in when a figure is deleted
  const custom = Array.from({ length: 12 }, (_, i) => ({ id: `c-${i}`, name: `F${i}`, voxels: Array.from({ length: 6 }, (_, k) => ({ x: k, y: 0, z: i % 3, c: 'r' })), theme: 'meadow', created: i, best: 0 }));
  const q = await t.page({ save: saveWith(['sprout'], { extra: { custom } }), query: `?fig=${evil}` });
  await q.waitForTimeout(1200);
  const w = await q.evaluate(() => ({ card: document.getElementById('screen-ws-gift').classList.contains('show'), name: document.getElementById('ws-g-name').textContent, btn: document.querySelector('#ws-g-save span').textContent, queue: !!window.__voxlink.save.giftQueue }));
  t.check('full workshop: the gift card offers to make room, the gift waits', w.card && w.queue && /room/i.test(w.btn), w);
  t.check('direction overrides are stripped and emoji are not cut in half', w.name === 'Giftevil 👨‍👩‍👧‍👦', w.name);
  await q.evaluate(() => document.getElementById('ws-g-save').click()); await q.waitForTimeout(500);
  await q.evaluate(async () => { const b = document.querySelector('#ws-list [data-act=del]'); b.click(); await new Promise(r => setTimeout(r, 100)); b.click(); });
  await q.waitForTimeout(500);
  const d = await q.evaluate(() => ({ queue: !!window.__voxlink.save.giftQueue, first: window.__voxlink.save.custom[0].name }));
  t.check('deleting a figure lets the gift move in', !d.queue && d.first === 'Giftevil 👨‍👩‍👧‍👦', d);
});
