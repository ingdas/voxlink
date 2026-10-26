// CrazyGames: with a stand-in SDK on the page (the real one is never fetched off the portal), the lifecycle reaches
// it in order (loading, then gameplay only in play; never while paused or during an ad), an interstitial follows a
// finished figure (after the celebration) and a walk through a portal (either way) but not the menus' way to the
// Keeper's Isle, the game stands still, deaf and (while the ad plays) silent for it, the portal's mute outranks the
// game's sliders, the save goes to SDK.data too (and survives a browser that blocks localStorage in the iframe, and
// merges with this browser's copy), the in-game fullscreen switch is gone, and Kubo cheers with happytime() for a
// rebuilt world. Off the portal none of this exists: every other suite runs without an SDK.
import { suite, saveWith, MEADOW } from './lib.mjs';

// The stand-in: records every call in window.__cg.calls; ads start after `delay` ms and play for `length` ms (or
// fail when fill is false); SDK.data lives in sessionStorage, so it survives a reload like the real cloud save.
function fakeSdk(o) {
  const opts = Object.assign({ delay: 40, length: 1500, fill: true, mute: false, data: null, blockLocal: false }, o);
  const cg = window.__cg = { calls: [], playing: false, listeners: [], opts };
  const log = n => cg.calls.push(n);
  if (opts.data && !sessionStorage.getItem('cg.seeded')) { sessionStorage.setItem('cg.seeded', '1'); for (const [k, v] of Object.entries(opts.data)) sessionStorage.setItem(`cgdata:${k}`, v); }
  if (opts.blockLocal) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  window.CrazyGames = { SDK: {
    init: () => Promise.resolve(),
    game: {
      loadingStart: () => log('loadingStart'), loadingStop: () => log('loadingStop'),
      gameplayStart: () => log('gameplayStart'), gameplayStop: () => log('gameplayStop'), happytime: () => log('happytime'),
      settings: { get muteAudio() { return cg.opts.mute; } },
      addSettingsChangeListener: fn => cg.listeners.push(fn),
      inviteLink: p => `https://www.crazygames.com/game/kubos-islands?fig=${p.fig}`, getInviteParam: () => null,
    },
    ad: { requestAd(type, cb) {
      log(`ad:${type}`);
      const m = cg.opts;
      if (!m.fill) { setTimeout(() => cb.adError?.('no fill'), m.delay); return; }
      setTimeout(() => { cg.playing = true; cb.adStarted?.(); setTimeout(() => { cg.playing = false; cb.adFinished?.(); }, m.length); }, m.delay);
    } },
    data: {
      getItem: k => sessionStorage.getItem(`cgdata:${k}`), setItem: (k, v) => sessionStorage.setItem(`cgdata:${k}`, v),
      removeItem: k => sessionStorage.removeItem(`cgdata:${k}`), clear() {},
    },
    user: { systemInfo: { locale: 'en-US' } },
  } };
}

const calls = p => p.evaluate(() => window.__cg.calls.slice());
const since = (all, n) => all.slice(n);

await suite('crazygames', async t => {
  // ---- lifecycle, the interstitial after a figure, freezing for it ----
  let p = await t.page({ save: saveWith(MEADOW.slice(0, 3), { seen: { nexus: true } }), query: '?debug', init: [fakeSdk, {}] });
  await t.hideDebug(p);
  await p.waitForTimeout(300);
  let c = await calls(p);
  t.check('loading starts and stops, and the title is no gameplay', c.join() === 'loadingStart,loadingStop', c);
  t.check('no fullscreen switch on the portal', await p.evaluate(() => document.getElementById('set-full').closest('.setting').classList.contains('hidden')));
  await p.evaluate(() => window.__voxlink.startLevel(3, false, 'island'));
  await t.app(p, 'playing');
  await p.waitForTimeout(300);
  t.check('playing a figure is gameplay', (await calls(p)).at(-1) === 'gameplayStart', await calls(p));
  await p.evaluate(() => window.__voxlink.ctx.pause()); await p.waitForTimeout(200);
  t.check('the pause menu stops it', (await calls(p)).at(-1) === 'gameplayStop');
  await p.evaluate(() => { const i = window.__voxlink.ctx.input; i.requestLock = () => Promise.resolve(); window.__voxlink.ctx.resume(); }); // (headless Chrome refuses pointer lock, which would pause again)
  await p.waitForTimeout(300);
  t.check('…and resuming starts it again', (await calls(p)).at(-1) === 'gameplayStart');
  let n = (await calls(p)).length;
  await t.win(p);
  await p.waitForTimeout(1200);
  t.check('no ad during the celebration', !since(await calls(p), n).some(x => x.startsWith('ad:')), since(await calls(p), n));
  await p.waitForFunction(() => window.__cg.playing, null, { timeout: 6000 });
  const during = await p.evaluate(async () => {
    const g = window.__voxlink.game, t0 = g.t;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return { frozen: g.t === t0, app: window.__voxlink.ctx.app, input: window.__voxlink.ctx.input.enabled, silent: window.__voxlink.ctx.audio.held };
  });
  c = since(await calls(p), n);
  t.check('after the celebration: a midgame ad, with gameplay stopped first', c.includes('ad:midgame') && c.indexOf('gameplayStop') < c.indexOf('ad:midgame'), c);
  t.check('while it plays the game is frozen, deaf (Escape does nothing) and silent', during.frozen && during.app === 'complete' && !during.input && during.silent, during);
  await p.waitForFunction(() => window.__voxlink.ctx.app === 'playing' && document.getElementById('done-card').classList.contains('show'), null, { timeout: 8000 });
  await p.waitForTimeout(200);
  t.check('after the ad: back on the island with the results card, playing, sound back', (await calls(p)).at(-1) === 'gameplayStart' && !(await p.evaluate(() => window.__voxlink.ctx.audio.held)));

  // ---- portals: walking through one brings an interstitial, the menus' way doesn't ----
  await p.evaluate(() => { window.__cg.opts.length = 300; });
  n = (await calls(p)).length;
  await p.evaluate(() => window.__voxlink.game.events.portal());
  await p.waitForFunction(() => window.__voxlink.ctx.app === 'nexus', null, { timeout: 20000 });
  t.check('walking into a world\'s portal: a midgame ad on the way to the Keeper\'s Isle', since(await calls(p), n).includes('ad:midgame'), since(await calls(p), n));
  await p.waitForFunction(() => window.__voxlink.ctx.nexus.session?.ready, null, { timeout: 20000 });
  n = (await calls(p)).length;
  await p.evaluate(() => window.__voxlink.ctx.nexus.session.travel(0));
  await p.waitForFunction(() => window.__voxlink.ctx.app === 'playing', null, { timeout: 30000 });
  t.check('walking into a portal on the Keeper\'s Isle: a midgame ad on the way into the world', since(await calls(p), n).includes('ad:midgame'), since(await calls(p), n));
  n = (await calls(p)).length;
  await p.evaluate(() => window.__voxlink.ctx.openNexus());
  await p.waitForFunction(() => window.__voxlink.ctx.app === 'nexus', null, { timeout: 20000 });
  t.check('the menus\' way to the Keeper\'s Isle: no ad', !since(await calls(p), n).some(x => x.startsWith('ad:')), since(await calls(p), n));
  // no ad to show (no fill): the portal still takes you
  await p.evaluate(() => { window.__cg.opts.fill = false; });
  await p.waitForFunction(() => window.__voxlink.ctx.nexus.session?.ready, null, { timeout: 20000 });
  await p.evaluate(() => window.__voxlink.ctx.nexus.session.travel(0));
  await p.waitForFunction(() => window.__voxlink.ctx.app === 'playing', null, { timeout: 30000 });
  t.check('no ad available: the portal works as ever', await p.evaluate(() => window.__voxlink.ctx.input.enabled === true || window.__voxlink.ctx.app === 'playing'));

  // ---- the save goes to SDK.data too ----
  const cloud = await p.evaluate(() => JSON.parse(sessionStorage.getItem('cgdata:voxlink.v2') || '{}'));
  t.check('progress is saved to SDK.data as well', !!cloud.stars?.ladybug?.done && !!cloud.stars?.sprout?.done, Object.keys(cloud.stars || {}));
  await p.close();

  // ---- happytime for a rebuilt world ----
  p = await t.page({ save: saveWith(MEADOW.slice(0, 4)), query: '?debug', init: [fakeSdk, {}] });
  await t.hideDebug(p);
  await p.evaluate(() => window.__voxlink.startLevel(4, false, 'island'));
  await t.app(p, 'playing');
  await t.win(p);
  await p.waitForTimeout(1500);
  t.check('rebuilding a world\'s last figure: the site celebrates (happytime)', (await calls(p)).includes('happytime'));
  await p.close();

  // ---- the portal's mute ----
  p = await t.page({ save: saveWith(MEADOW.slice(0, 1)), init: [fakeSdk, { mute: true }] });
  await p.waitForTimeout(300);
  const m1 = await p.evaluate(() => ({ held: window.__voxlink.ctx.audio.held, disabled: document.getElementById('set-sfx').disabled && document.getElementById('set-music').disabled, sfx: window.__voxlink.save.settings.sfx }));
  t.check('muted by the portal: silent, the sliders disabled, the player\'s level kept', m1.held && m1.disabled && m1.sfx === 0.8, m1);
  await p.evaluate(() => { window.__cg.opts.mute = false; window.__cg.listeners.forEach(f => f({ muteAudio: false })); });
  const m2 = await p.evaluate(() => ({ held: window.__voxlink.ctx.audio.held, disabled: document.getElementById('set-sfx').disabled }));
  t.check('…and unmuted: sound and sliders back', !m2.held && !m2.disabled, m2);
  await p.close();

  // ---- SDK.data: a browser that blocks localStorage in the iframe keeps progress through the platform ----
  const cloudSave = JSON.stringify(saveWith(['sprout', 'tulip', 'mushroom']));
  p = await t.page({ save: null, init: [fakeSdk, { blockLocal: true, data: { 'voxlink.v2': cloudSave } }] });
  t.check('localStorage blocked: the game starts, with the stars from SDK.data', await p.evaluate(() => ['sprout', 'tulip', 'mushroom'].every(id => window.__voxlink.save.stars[id]?.done)));
  await p.close();
  // a browser-only save moves up to the platform, and two copies merge without losing a star
  p = await t.page({ save: saveWith(['sprout', 'tulip']), init: [fakeSdk, { data: { 'voxlink.v2': JSON.stringify(saveWith(['mushroom'], { unlocked: 4 })) } }] });
  const merged = await p.evaluate(() => ({ local: Object.keys(window.__voxlink.save.stars).sort().join(), cloud: Object.keys(JSON.parse(sessionStorage.getItem('cgdata:voxlink.v2')).stars).sort().join() }));
  t.check('this browser\'s save and the platform\'s merge, and both copies hold the result', merged.local === 'mushroom,sprout,tulip' && merged.cloud === merged.local, merged);
  await p.close();
});
