// The game as a portal shows it (CrazyGames): inside an iframe on a longer page. It takes the keyboard as it loads,
// so the opening's Esc works without a click into the game first, and neither Space nor the arrows scroll the
// portal's page away from the game. A gamepad's A skips the opening too. And a returning player who comes out of a
// world's portal (Continue) has Kubo leading the way along the bridges to the figure they're up to; following him
// gets there.
import { suite, saveWith } from './lib.mjs';

const GAME = 'http://game.portal.test/';

await suite('portal-frame', async t => {
  // the portal's page: a header, the game's frame and a long page below it
  const p = await t.page({ waitFor: null });
  await p.route('http://www.portal.test/**', r => r.fulfill({ contentType: 'text/html', body: `<body style="margin:0;height:3000px"><div style="height:64px"></div><iframe id="g" src="${GAME}" style="border:0;width:960px;height:540px" allow="autoplay; fullscreen; gamepad"></iframe></body>` }));
  await p.route(`${GAME}**`, async r => { const res = await r.fetch({ url: r.request().url().replace(GAME, t.url) }); r.fulfill({ response: res }); });
  await p.goto('http://www.portal.test/kubo');
  const f = await (await p.waitForSelector('#g')).contentFrame();
  await f.waitForFunction(() => window.__voxlink?.ctx.app === 'cinema', null, { timeout: 45000 });
  t.check('in a portal\'s frame the game takes the keyboard as it loads', await f.evaluate(() => document.hasFocus()));
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('PageDown');
  await p.waitForTimeout(400);
  t.check('…the arrows and Page Down don\'t scroll the portal\'s page', (await p.evaluate(() => scrollY)) === 0, await p.evaluate(() => scrollY));
  await p.keyboard.press('Escape');
  await f.waitForFunction(() => window.__voxlink.ctx.app !== 'cinema', null, { timeout: 5000 }).catch(() => {});
  t.check('…and Esc skips the opening without a click into the game first', await f.evaluate(() => window.__voxlink.ctx.app !== 'cinema'));
  await f.waitForFunction(() => window.__voxlink.ctx.app === 'playing', null, { timeout: 15000 });
  await p.keyboard.press('Space');
  await p.waitForTimeout(400);
  t.check('…nor does Space while playing', (await p.evaluate(() => scrollY)) === 0, await p.evaluate(() => scrollY));
  await p.close();

  // a gamepad skips the opening: A presses Skip (it's the opening's main button)
  const pad = await t.page({ save: null, waitFor: 'cinema', init: [() => {
    const b = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    window.__pad = { id: 'Xbox Wireless Controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: b };
    navigator.getGamepads = () => [window.__pad];
  }, null] });
  await pad.waitForTimeout(600);
  const press = async i => { await pad.evaluate(i => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, i); await pad.waitForTimeout(150); await pad.evaluate(i => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, i); await pad.waitForTimeout(150); };
  await press(0);
  await pad.waitForFunction(() => window.__voxlink.ctx.app !== 'cinema', null, { timeout: 4000 }).catch(() => {});
  t.check('a gamepad: A skips the opening', await pad.evaluate(() => window.__voxlink.ctx.app !== 'cinema'));
  await pad.close();

  // Continue into a world whose next figure hasn't been started: out of the portal, and Kubo leads the way there
  const c = await t.page({ save: saveWith(['sprout']) });
  await c.click('#btn-play');
  await c.waitForFunction(() => window.__voxlink.ctx.app === 'playing' && window.__voxlink.game.level?.id === 'tulip', null, { timeout: 30000 });
  await c.waitForTimeout(400);
  const start = await c.evaluate(() => ({ onIsland: window.__voxlink.game.onIsland, leading: !!window.__voxlink.ctx.companion.leading() }));
  t.check('Continue: out of the portal on the middle island, with Kubo leading the way', !start.onIsland && start.leading, start);
  let reached = false;
  await c.keyboard.down('KeyW');
  for (let i = 0; i < 200 && !reached; i++) {
    reached = await c.evaluate(() => {
      const v = window.__voxlink, g = v.game, to = v.ctx.companion.leading() || g.wayTarget();
      if (to) g.player.yaw = Math.atan2(g.player.pos.x - to.x, g.player.pos.z - to.z);
      return g.onIsland;
    });
    await c.waitForTimeout(150);
  }
  await c.keyboard.up('KeyW');
  t.check('…and following him leads onto the Tulip\'s island', reached);
  await c.close();
});
