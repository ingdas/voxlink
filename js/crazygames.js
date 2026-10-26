// The CrazyGames SDK (v3, https://docs.crazygames.com/sdk/intro/): the one place that touches it.
// Off the portal (any other host, a blocked CDN, a failed init) every export is a safe no-op: no lifecycle
// calls, no ads, no platform storage, and the game behaves exactly as it does anywhere else. Nothing here throws.
//
//   loading      loadingStart() at the top of main.js, loadingStop() once boot is done
//   gameplay     gameplay(on) every frame from main.js (only real transitions reach the SDK, and never while an ad
//                is up or before loading has stopped)
//   happytime    finishing a world, the finale, the 150th star (rare, as the docs ask)
//   ads          midgame(): an interstitial; while one is requested the game is frozen and takes no input
//                (onAd), and while one plays it is silent (onAdAudio)
//   mute         muted() / onMute(): the portal's own "mute audio" switch, which outranks the game's sliders
//   storage      store(): SDK.data, the cross-device save that also survives Safari's partitioned iframes
// The SDK script is only fetched on a CrazyGames page; a stand-in already on the page (window.CrazyGames, as the
// browser tests inject) is used wherever it is.

const SCRIPT_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const SCRIPT_WAIT_MS = 4000; // the script itself
const INIT_WAIT_MS = 5000; // init(): boot waits this long at most; a later answer is still taken (onLateReady)
const AD_SILENCE_MS = 8000; // a request nobody answers is given up on
const AD_MAX_MS = 180000; // an ad that started and never said it finished (never cut an ad in progress short)

export function onCrazyGames() {
  let hosts = '';
  try { hosts = [document.referrer, ...(location.ancestorOrigins ? [...location.ancestorOrigins] : [])].join(' '); } catch { /* sandboxed */ }
  return /crazygames\./i.test(hosts) || /crazygames\./i.test(location.hostname);
}
// on the portal (or with a stand-in SDK on the page): decides the things that must differ there from the start,
// like the in-game fullscreen switch, before the SDK has answered
export const onPlatform = () => onCrazyGames() || !!window.CrazyGames?.SDK;

let sdkNow = null; // the SDK once init() has succeeded
const lateListeners = [];
let readyPromise = null;

function loadScript() {
  if (window.CrazyGames?.SDK) return Promise.resolve(true);
  return new Promise(res => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => res(!!window.CrazyGames?.SDK);
    s.onerror = () => res(false);
    document.head.appendChild(s);
    setTimeout(() => res(!!window.CrazyGames?.SDK), SCRIPT_WAIT_MS);
  });
}

// Resolves with the SDK once it is initialised, or null (off the portal, blocked, failed, or still not answering
// after INIT_WAIT_MS; an init() that finishes later still makes the SDK available and tells onLateReady).
export function ready() {
  if (!readyPromise) readyPromise = (async () => {
    if (!onPlatform()) return null;
    if (!(await loadScript())) return null;
    const sdk = window.CrazyGames.SDK;
    let init;
    try { init = Promise.resolve(sdk.init()); } catch { return null; }
    const ok = init.then(() => true, () => false);
    const inTime = await Promise.race([ok, new Promise(r => setTimeout(() => r(null), INIT_WAIT_MS))]);
    if (inTime === true) { sdkNow = sdk; return sdk; }
    if (inTime === null) ok.then(late => { if (!late) return; sdkNow = sdk; for (const f of lateListeners) safe(() => f(sdk)); });
    return null;
  })();
  return readyPromise;
}
// the SDK arrived after boot stopped waiting for it
export function onLateReady(fn) { lateListeners.push(fn); }

const safe = fn => { try { return fn(); } catch (e) { console.debug('[crazygames] call failed; continuing.', e); } };
// run fn(sdk) once the SDK is ready, in call order; dropped off the portal
const call = fn => { ready().then(s => { if (s) safe(() => fn(s)); }); };

// ---------- lifecycle ----------
let loadingDone = false, wantPlay = false, playing = false;
export function loadingStart() { call(s => s.game.loadingStart()); }
export function loadingStop() { if (loadingDone) return; loadingDone = true; call(s => s.game.loadingStop()); syncPlay(); }
// The game says every frame whether the player is in active play; only real transitions go to the SDK.
export function gameplay(on) { wantPlay = !!on; syncPlay(); }
function syncPlay() {
  const on = loadingDone && wantPlay && adsInFlight === 0;
  if (on === playing) return;
  playing = on;
  call(s => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
}
export function happytime() { call(s => s.game.happytime?.()); }

// ---------- ads ----------
// Two clocks, as CrazyGames' ad rules ask (https://docs.crazygames.com/requirements/ads/): the game takes no input
// and stands still from the moment an ad is *requested* (onAd), but goes silent only once one actually *plays*
// (onAdAudio): most requests end without an ad (frequency cap, no fill), and those shouldn't cost a moment of sound.
let adsInFlight = 0, adsPlaying = 0;
const adListeners = new Set(), audioListeners = new Set();
export const adShowing = () => adsInFlight > 0;
export function onAd(fn) { adListeners.add(fn); return () => adListeners.delete(fn); }
export function onAdAudio(fn) { audioListeners.add(fn); return () => audioListeners.delete(fn); }
const tell = (set, v) => { for (const f of [...set]) safe(() => f(v)); };

// An interstitial at a natural break (a figure finished, a walk through a portal). Resolves when it is over, failed,
// or there is no SDK; never rejects, always settles. The platform caps how often one really shows, so asking at
// every break is fine. Resolves at once off the portal.
export function midgame() {
  return new Promise(resolve => {
    ready().then(sdk => {
      if (!sdk) { resolve(); return; }
      let settled = false, started = false;
      adsInFlight++;
      if (adsInFlight === 1) { tell(adListeners, true); syncPlay(); }
      let timer = setTimeout(() => finish(), AD_SILENCE_MS);
      function finish() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (started && --adsPlaying === 0) tell(audioListeners, false);
        if (--adsInFlight === 0) { tell(adListeners, false); syncPlay(); }
        resolve();
      }
      const adStarted = () => {
        if (settled || started) return;
        started = true;
        if (++adsPlaying === 1) tell(audioListeners, true);
        clearTimeout(timer);
        timer = setTimeout(() => finish(), AD_MAX_MS);
      };
      try {
        sdk.ad.requestAd('midgame', { adStarted, adFinished: finish, adError: e => { console.debug('[crazygames] midgame ad error.', e); finish(); } });
      } catch (e) { console.debug('[crazygames] requestAd threw.', e); finish(); }
    });
  });
}

// ---------- the portal's mute ----------
// SDK.game.settings.muteAudio, live through addSettingsChangeListener. It outranks the game's own sound settings
// ("be sure this doesn't enable the audio back if it is disabled in the SDK settings"); the player's own volumes
// are kept underneath and come back when the portal lets go.
let muteNow = false;
const muteListeners = new Set();
export const muted = () => muteNow;
export function onMute(fn) { muteListeners.add(fn); return () => muteListeners.delete(fn); }
const setMute = v => { v = !!v; if (v === muteNow) return; muteNow = v; tell(muteListeners, v); };
function wireSettings(sdk) {
  safe(() => setMute(sdk.game.settings?.muteAudio === true));
  safe(() => sdk.game.addSettingsChangeListener?.(s => setMute(s?.muteAudio === true)));
}
ready().then(s => { if (s) wireSettings(s); });
onLateReady(wireSettings);

// ---------- storage ----------
// SDK.data: shaped like localStorage and synchronous (the SDK uploads in the background). null until the SDK is up.
export function store() {
  const d = safe(() => sdkNow?.data);
  if (!d || typeof d.getItem !== 'function') return null;
  return {
    getItem: k => safe(() => d.getItem(k)) ?? null,
    setItem: (k, v) => safe(() => d.setItem(k, v)),
  };
}

// ---------- the rest ----------
export async function locale() {
  const s = await ready();
  return safe(() => s?.user?.systemInfo?.locale) || null;
}
