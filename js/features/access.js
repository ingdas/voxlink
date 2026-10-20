// Comfort, accessibility & controls: FOV / look smoothing / head bob / reduced motion / UI size /
// high contrast settings, rebindable keys and standard-mapping gamepad support (game + menus).
import { THEMES } from '../world.js';
import { DEFAULT_KEYS } from '../input.js';

const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULTS = { fov: 88, smooth: 0, bob: true, reduceMotion: prefersReduced, uiScale: 1, contrast: false };
const ACTIONS = [
  ['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Strafe left'], ['right', 'Strafe right'],
  ['jump', 'Jump'], ['run', 'Run'], ['interact', 'Grab / link'], ['drop', 'Drop'], ['hint', 'Hint'],
];
// fixed keys that can't be rebound (menus, slots, pause and the secondary movement keys)
const RESERVED = new Set(['Escape', 'Tab', 'KeyP', 'Enter', 'NumpadEnter', 'Backspace', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'MetaLeft', 'MetaRight', 'F5', 'F11', 'F12']);
const KEY_NAMES = {
  Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn', ContextMenu: 'Menu',
};
// snow ground a touch darker / blue-grey so white blocks pop in high contrast
const FROST_HC = { grass: 0xc9d5e8, cap: 0xdae3f0, tuft: 0xa9bad4 };
const PAD_LEGEND = [
  ['Left stick', 'Move', 'L3 click to run'], ['Right stick', 'Look', ''], ['A', 'Jump', 'Menus: select'],
  ['X / RT', 'Grab / link', ''], ['B / LT', 'Drop', 'Menus: back'], ['Y', 'Hint', ''], ['LB / RB', 'Backpack slot', ''],
  ['Start', 'Pause / resume', ''], ['D-pad', 'Menu focus', ''],
];
const PRIMARY = '#btn-play, #btn-brief-go, #btn-next, #btn-resume, #btn-ending-map';
const FOCUSABLE = '.btn, .toggle, .node, input[type=range], .kbtn';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sideless = c => c.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');

export function init(ctx) {
  const { save, persist, input, camera, game, $ } = ctx;
  const st = save.settings;
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof st[k] !== typeof v) st[k] = v;
  const keys = st.keys = Object.assign({}, DEFAULT_KEYS, st.keys);
  for (const a of Object.keys(DEFAULT_KEYS)) if (typeof keys[a] !== 'string' || !keys[a]) keys[a] = DEFAULT_KEYS[a];
  input.bindings = keys;
  const body = document.body, root = document.documentElement;

  // ---------- floating toast (the HUD toast is hidden while menus are up) ----------
  const toastEl = document.createElement('div');
  toastEl.id = 'acc-toast';
  toastEl.className = 'tag toast';
  body.appendChild(toastEl);
  let toastT = 0;
  const notify = msg => {
    if (ctx.base == null && !$('hud').classList.contains('off')) return ctx.toast(msg);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
  };

  // ---------- key labels ----------
  let layout = null;
  navigator.keyboard?.getLayoutMap?.().then(m => { layout = m; renderKeys(); renderKeysHint(); }).catch(() => {});
  const keyLabel = code => {
    const ch = layout?.get?.(code);
    if (ch && ch.trim() && !KEY_NAMES[code]) return ch.toUpperCase();
    return KEY_NAMES[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
  };
  const L = a => keyLabel(keys[a]);
  const moveLabel = () => {
    const m = ['forward', 'left', 'back', 'right'].map(L);
    return m.every(s => s.length === 1) ? m.join('') : m.join(' ');
  };

  // ---------- settings rows ----------
  const list = document.querySelector('#screen-settings .settings');
  const range = (id, label, min, max, step) =>
    `<label class="setting acc-range"><span>${label} <em class="acc-val" id="${id}-val"></em></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"></label>`;
  const toggle = (id, label, extra = '') => `<div class="setting ${extra}" id="${id}-row"><span>${label}</span><button class="toggle" id="${id}" aria-label="${label}"><i></i></button></div>`;
  list.querySelector('#set-sens').closest('.setting').insertAdjacentHTML('afterend', range('acc-smooth', 'Look smoothing', 0, 1, 0.05));
  list.querySelector('.setting.danger').insertAdjacentHTML('beforebegin', `
    <div class="acc-sec">Comfort &amp; accessibility</div>
    ${range('acc-fov', 'Field of view', 70, 110, 1)}
    ${toggle('acc-bob', 'Head bob')}
    ${toggle('acc-motion', 'Reduced motion')}
    ${range('acc-ui', 'UI size', 0.8, 1.3, 0.05)}
    ${toggle('acc-contrast', 'High contrast')}
    <div class="acc-sec acc-desk" id="acc-controls-sec">Controls</div>
    <div class="setting acc-desk"><span>Keyboard</span><button class="btn small" id="acc-keys-btn" aria-expanded="false">Edit</button></div>
    <div class="acc-keys hidden" id="acc-keys"></div>
    <div class="setting acc-desk acc-pad-row" id="acc-pad-row"><span>Gamepad <em class="acc-val" id="acc-pad-status">not found</em></span><button class="btn small" id="acc-pad-btn" aria-expanded="false">Layout</button></div>
    <div class="acc-keys acc-legend hidden" id="acc-pad-legend">${PAD_LEGEND.map(([b, a, n]) =>
      `<div class="acc-key"><span>${a}${n ? `<small>${n}</small>` : ''}</span><kbd>${b}</kbd></div>`).join('')}</div>
    <div class="acc-sec acc-sec-end"></div>`);

  const bindRange = (id, key, fmtVal, apply) => {
    const el = $(id), val = $(`${id}-val`);
    el.value = st[key];
    val.textContent = fmtVal(st[key]);
    el.addEventListener('input', () => { st[key] = +el.value; val.textContent = fmtVal(st[key]); apply(); persist(); });
  };
  const bindToggle = (id, key, apply) => {
    const el = $(id);
    el.classList.toggle('on', !!st[key]);
    el.onclick = () => { st[key] = !st[key]; el.classList.toggle('on', st[key]); apply(); persist(); };
  };
  bindRange('acc-smooth', 'smooth', v => (v ? `${Math.round(v * 100)}%` : 'off'), applySmooth);
  bindRange('acc-fov', 'fov', v => `${v}°`, applyFov);
  bindRange('acc-ui', 'uiScale', v => `${Math.round(v * 100)}%`, applyUi);
  bindToggle('acc-bob', 'bob', applyMotion);
  bindToggle('acc-motion', 'reduceMotion', applyMotion);
  bindToggle('acc-contrast', 'contrast', applyContrast);

  const expander = (btnId, panelId) => {
    const b = $(btnId), p = $(panelId);
    b.onclick = () => {
      const open = p.classList.toggle('hidden') === false;
      b.textContent = open ? 'Done' : b.dataset.label;
      b.setAttribute('aria-expanded', open);
      if (!open) cancelCapture();
      if (open) requestAnimationFrame(() => p.scrollIntoView({ block: 'nearest', behavior: st.reduceMotion ? 'auto' : 'smooth' }));
    };
    b.dataset.label = b.textContent;
  };
  expander('acc-keys-btn', 'acc-keys');
  expander('acc-pad-btn', 'acc-pad-legend');

  // ---------- applying ----------
  function applySmooth() { input.smoothing = st.smooth; }
  function applyFov() {
    camera.userData.hfov = st.fov;
    dispatchEvent(new Event('resize'));
  }
  function applyMotion() {
    const rm = st.reduceMotion;
    body.classList.toggle('reduce-motion', rm);
    game.player.bobScale = st.bob && !rm ? 1 : 0;
    game.player.landScale = rm ? 0.25 : 1;
    game.comfort.kick = rm ? 0 : 1;
    game.comfort.spin = rm ? 0.3 : 1;
    $('acc-bob-row').classList.toggle('acc-off', rm);
  }
  function applyUi() {
    const m = Math.min(innerWidth, innerHeight);
    // never grow past what small phones can fit (390px-tall landscape / 390px-wide portrait)
    const hud = Math.min(st.uiScale, clamp(Math.min(innerWidth / 360, innerHeight / 340), 1, 1.3));
    const menu = Math.min(st.uiScale, clamp(m / 480, 1, 1.3));
    root.style.setProperty('--ui-hud', hud);
    root.style.setProperty('--ui-menu', menu);
    body.classList.toggle('ui-scaled', hud !== 1 || menu !== 1);
  }
  const frostOrig = { grass: THEMES.frost.grass, cap: THEMES.frost.cap, tuft: THEMES.frost.tuft };
  function applyContrast() {
    body.classList.toggle('high-contrast', st.contrast);
    Object.assign(THEMES.frost, st.contrast ? FROST_HC : frostOrig); // takes effect on the next island build
  }
  addEventListener('resize', applyUi);

  // ---------- key remapping ----------
  let capturing = null;
  function renderKeys() {
    $('acc-keys').innerHTML = ACTIONS.map(([a, label]) =>
      `<div class="acc-key"><span>${label}</span><button class="kbtn ${capturing === a ? 'wait' : ''}" data-act="${a}">${capturing === a ? 'Press a key…' : esc(L(a))}</button></div>`).join('') +
      `<div class="acc-keys-foot"><small>Arrows, Enter &amp; Backspace always work · Esc cancels</small><button class="btn small" id="acc-keys-reset">Defaults</button></div>`;
  }
  function cancelCapture() { if (capturing) { capturing = null; renderKeys(); } }
  $('acc-keys').addEventListener('click', e => {
    const k = e.target.closest('.kbtn');
    if (k) { capturing = capturing === k.dataset.act ? null : k.dataset.act; renderKeys(); return; }
    if (e.target.closest('#acc-keys-reset')) {
      Object.assign(keys, DEFAULT_KEYS);
      capturing = null;
      persist(); renderKeys(); renderKeysHint();
      notify('Keys reset to defaults');
    }
  });
  let swallowUp = null;
  addEventListener('keydown', e => {
    if (!capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    swallowUp = e.code;
    if (e.code === 'Escape') return cancelCapture();
    if (RESERVED.has(e.code)) { notify(`${keyLabel(e.code)} is reserved, pick another key`); return; }
    const act = capturing;
    const other = Object.keys(keys).find(a => a !== act && sideless(keys[a]) === sideless(e.code));
    if (other) keys[other] = keys[act]; // swap so no action is left unbound
    keys[act] = e.code;
    capturing = null;
    persist(); renderKeys(); renderKeysHint();
    if (other) notify(`Swapped with ${ACTIONS.find(x => x[0] === other)[1]}`);
  }, true);
  addEventListener('keyup', e => { if (swallowUp === e.code) { swallowUp = null; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // leaving the settings screen cancels a pending capture
  new MutationObserver(() => { if (!$('screen-settings').classList.contains('show')) cancelCapture(); })
    .observe($('screen-settings'), { attributes: true, attributeFilter: ['class'] });

  function renderKeysHint() {
    const k = s => `<kbd>${esc(s)}</kbd>`;
    $('keys').innerHTML = padMode
      ? `<span>${k('L-stick')} move · ${k('R-stick')} look</span><span>${k('X')} / ${k('RT')} grab / link</span><span>${k('A')} jump · ${k('L3')} run</span><span>${k('LB')} / ${k('RB')} pick slot</span><span>${k('B')} drop · ${k('Y')} hint</span>`
      : `<span>${k(moveLabel())} move</span><span>${k('Click')} / ${k(L('interact'))} grab / link</span><span>${k(L('jump'))} jump · ${k(L('run'))} run</span><span>${k('1-4')} / ${k('Wheel')} pick slot</span><span>${k('Right-click')} / ${k(L('drop'))} drop · ${k(L('hint'))} hint</span>`;
  }
  // the first tutorial line names the keys; keep it in sync with bindings / gamepad
  ctx.hooks.tick.push(() => {
    const c = $('coach');
    if (!c.classList.contains('show') || !c.innerHTML.includes('<b>WASD</b>')) return;
    const m = moveLabel();
    if (m === 'WASD' && !padMode) return;
    c.innerHTML = c.innerHTML.replace('<b>WASD</b>', padMode ? '<b>Left stick</b>' : `<b>${esc(m)}</b>`)
      .replace('<b>mouse</b>', padMode ? '<b>right stick</b>' : '<b>mouse</b>');
  });

  // ---------- gamepad ----------
  let padMode = false;
  const setPadMode = on => {
    if (on === padMode) return;
    padMode = on;
    body.classList.toggle('pad-nav', on);
    renderKeysHint();
  };
  // with a gamepad there is no need for pointer lock (and it can't be requested without a click anyway)
  const lock = input.requestLock.bind(input);
  input.requestLock = () => (padMode ? Promise.resolve() : lock());
  addEventListener('mousedown', () => setPadMode(false), true);
  addEventListener('keydown', () => setPadMode(false), true);
  addEventListener('touchstart', () => setPadMode(false), { capture: true, passive: true });

  const getPad = () => {
    const all = [...(navigator.getGamepads?.() || [])].filter(g => g && g.connected !== false);
    return all.find(g => g.mapping === 'standard') || all[0] || null;
  };
  const refreshPadStatus = () => {
    const gp = getPad();
    $('acc-pad-status').textContent = gp ? 'connected' : 'not found';
    $('acc-pad-row').classList.toggle('on', !!gp);
    $('acc-controls-sec').classList.toggle('on', !!gp);
  };
  addEventListener('gamepadconnected', () => { notify('Gamepad connected'); refreshPadStatus(); });
  addEventListener('gamepaddisconnected', () => {
    refreshPadStatus();
    if (!getPad()) { notify('Gamepad disconnected'); setPadMode(false); }
  });

  const pad = input.pad;
  const zeroPad = () => { pad.x = pad.y = 0; pad.sprint = pad.jump = false; };
  const DZ = 0.18;
  const stick = (x = 0, y = 0) => {
    const m = Math.hypot(x, y);
    if (m < DZ) return { x: 0, y: 0, m: 0 };
    const k = Math.min(1, (m - DZ) / (1 - DZ)) / m;
    return { x: x * k, y: y * k, m: Math.min(1, (m - DZ) / (1 - DZ)) };
  };
  let prev = [], sprintLatch = false, lastT = performance.now();
  let navDir = null, navNext = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    const gp = getPad();
    if (!gp) { zeroPad(); prev = []; return; }
    const btn = gp.buttons.map(b => !!b && (b.pressed || b.value > 0.5));
    const old = prev;
    const pressed = i => btn[i] && !old[i];
    prev = btn;
    const ls = stick(gp.axes[0], gp.axes[1]), rs = stick(gp.axes[2], gp.axes[3]);
    if (btn.some((b, i) => b && pressed(i)) || ls.m > 0.4 || rs.m > 0.4) setPadMode(true);

    const inGame = ctx.app === 'playing' && input.enabled && ctx.base == null && !ctx.overlays.length;
    if (!inGame) {
      zeroPad();
      if ((ctx.app === 'playing' || ctx.app === 'intro') && pressed(9)) return ctx.pause();
      return menuPad(btn, pressed, ls, rs, now, dt);
    }
    if (pressed(10)) sprintLatch = !sprintLatch;
    if (ls.m < 0.2) sprintLatch = false;
    pad.x = ls.x; pad.y = ls.y; pad.sprint = sprintLatch; pad.jump = btn[0];
    // look: squared response curve for fine aim, full deflection ~ 3.2 rad/s at look speed 1
    const rate = 3.2 * (st.sens || 1) * rs.m;
    pad.lx += rs.x * rate * dt;
    pad.ly += rs.y * rate * dt * (input.invertY ? -1 : 1);
    const act = a => input.actions.push(a);
    if (pressed(0)) act({ type: 'jump' });
    if (pressed(2) || pressed(7)) act({ type: 'interact' });
    if (pressed(1) || pressed(6)) act({ type: 'drop' });
    if (pressed(3)) act({ type: 'hint' });
    if (pressed(4)) act({ type: 'cycle', d: -1 });
    if (pressed(5)) act({ type: 'cycle', d: 1 });
    if (pressed(9)) ctx.pause();
  }
  requestAnimationFrame(loop);

  // ---------- menu navigation ----------
  const visible = el => el.getClientRects().length > 0 && !el.disabled && getComputedStyle(el).visibility !== 'hidden';
  const focusEl = el => {
    if (!el) return;
    try { el.focus({ focusVisible: true, preventScroll: true }); } catch { el.focus(); }
    el.scrollIntoView({ block: el.classList.contains('node') ? 'center' : 'nearest', behavior: st.reduceMotion ? 'auto' : 'smooth' });
  };
  function menuPad(btn, pressed, ls, rs, now, dt) {
    const id = ctx.overlays.at(-1) || ctx.base;
    if (!id) return;
    const scr = $(id);
    if (!scr) return;
    if (id === 'screen-talk') { if (pressed(0) || pressed(2) || pressed(9)) scr.click(); return; }
    const items = [...scr.querySelectorAll(FOCUSABLE)].filter(e => visible(e) && !e.matches('.node.locked'));
    const cur = scr.contains(document.activeElement) && items.includes(document.activeElement) ? document.activeElement : null;
    const primary = [...scr.querySelectorAll(PRIMARY)].find(visible);
    const fallback = () => primary || scr.querySelector('.node.current') || items.find(e => !e.classList.contains('locked')) || items[0];
    const tap = el => { ctx.audio.unlock(); ctx.audio.click(); el.click(); };

    if (pressed(0)) {
      if (cur && cur.type !== 'range') tap(cur);
      else if (!cur && primary) tap(primary);
      else if (!cur) focusEl(fallback());
      return;
    }
    if (pressed(9)) {
      if (id === 'screen-pause') ctx.resume();
      else if (primary) tap(primary);
      return;
    }
    if (pressed(1)) {
      if (ctx.overlays.length) ctx.popOverlay();
      else if (id === 'screen-map') ctx.enterTitle();
      else if (id === 'screen-pause') ctx.resume();
      return;
    }
    // right stick scrolls long screens (map, settings)
    if (rs.m > 0) scr.querySelector('.map-scroll, .settings')?.scrollBy(0, rs.y * 1100 * dt);

    let dir = null;
    if (btn[12] || ls.y < -0.55) dir = 'up';
    else if (btn[13] || ls.y > 0.55) dir = 'down';
    else if (btn[14] || ls.x < -0.55) dir = 'left';
    else if (btn[15] || ls.x > 0.55) dir = 'right';
    if (!dir) { navDir = null; return; }
    if (dir === navDir && now < navNext) return;
    navNext = now + (dir === navDir ? 110 : 380);
    navDir = dir;
    if (!cur) return focusEl(fallback());
    if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      const s = +cur.step || 1;
      cur.value = +cur.value + (dir === 'left' ? -s : s);
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    focusEl(nearest(cur, dir, items));
  }
  // spatial navigation: closest element in the pressed direction, favouring alignment
  function nearest(cur, dir, items) {
    const c = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const r0 = cur.getBoundingClientRect(), p0 = c(r0);
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), p = c(r);
      const vx = p.x - p0.x, vy = p.y - p0.y;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const ortho = Math.abs(dx ? vy : vx);
      // overlapping on the cross axis counts as aligned
      const overlap = dx ? (r.top < r0.bottom && r.bottom > r0.top) : (r.left < r0.right && r.right > r0.left);
      const score = along + (overlap ? 0 : ortho * 2.5);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best || cur;
  }

  // ---------- boot ----------
  applySmooth(); applyFov(); applyMotion(); applyUi(); applyContrast();
  renderKeys(); renderKeysHint(); refreshPadStatus();
}
