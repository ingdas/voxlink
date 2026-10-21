// G2 — Figure workshop: a friendly voxel editor. Players build their own figure on a grid plate,
// save up to 12 of them, share them as compact codes / links, and play them as linking puzzles.
import * as THREE from 'three';
import { PALETTE, forgetLevel } from '../levels.js';
import { S } from '../voxels.js';
import { toon, LAYER_FX, LAYER_OVERLAY } from '../render.js';
import { THEMES } from '../world.js';
import { t } from '../i18n.js';
import { createEditorCam } from './workshop-cam.js';

const KEYS = Object.keys(PALETTE); // share-code colour index (append-only order)
const UI_ORDER = 'roylgGcuUvVpbBtwisnk'.split('').filter(c => c in PALETTE);
const MIN = 6, MAX = 200, SLOTS = 12;
const EXT = 7; // x, z in [-EXT, EXT]
const HMAX = 16; // y in [0, HMAX)
const THEME_IDS = ['meadow', 'frost', 'reef', 'starfall'];
const themeName = id => t(`workshop.theme.${id}`);
const FUN_NAME_COUNT = 16; // workshop.name.0 … workshop.name.15
const CHEER_COUNT = 4, GIFT_CHEER_COUNT = 3; // workshop.cheer.N / workshop.giftCheer.N
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const plural = (key, n, vars) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...vars });
const INK = 0x2a1f3d;

const ICONS = `
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-hammer" viewBox="0 0 24 24"><path d="M13.2 10.8 4.6 19.4a1.6 1.6 0 0 1-2.3-2.3l8.6-8.6"/><path d="M9.5 7.4 13.7 3.2c1.4-.6 3.3-.5 4.6.8l2.2 2.2-1.6 1.6.9.9-3.6 3.6-.9-.9-1.6 1.6z"/></symbol>
<symbol id="i-build" viewBox="0 0 24 24"><path d="M10 3.5 16.5 7v7L10 17.5 3.5 14V7zM3.5 7 10 10.5 16.5 7M10 10.5v7M19.5 14.5v6.5M16.25 17.75h6.5"/></symbol>
<symbol id="i-eraser" viewBox="0 0 24 24"><path d="M8.6 19.5 4.2 15.1a1.6 1.6 0 0 1 0-2.3l8.5-8.5a1.6 1.6 0 0 1 2.3 0l4.4 4.4a1.6 1.6 0 0 1 0 2.3l-8.1 8.5zM8.6 19.5H20M8.2 8.8l6.6 6.6"/></symbol>
<symbol id="i-brush" viewBox="0 0 24 24"><path d="M20.5 3.5 11.8 12.2M10.2 10.6l3.2 3.2M9.6 13.2c-2.7-.3-4.9 1.4-5 3.9-.1 1.2-.6 2.2-1.6 2.9 3.3.8 7.1-.2 7.8-3.6"/></symbol>
<symbol id="i-mirror" viewBox="0 0 24 24"><path d="M12 3v2.5M12 9.5v5M12 18.5V21M8.5 7 3.5 17h5zM15.5 7l5 10h-5z"/></symbol>
<symbol id="i-undo" viewBox="0 0 24 24"><path d="M8.5 13.5 4 9l4.5-4.5M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/></symbol>
<symbol id="i-redo" viewBox="0 0 24 24"><path d="M15.5 13.5 20 9l-4.5-4.5M20 9H9.5a5.5 5.5 0 0 0 0 11H14"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.2 11v5.5M13.8 11v5.5"/></symbol>
<symbol id="i-share" viewBox="0 0 24 24"><circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.7l6.6-3.9M8.7 13.3l6.6 3.9"/></symbol>
<symbol id="i-pencil" viewBox="0 0 24 24"><path d="M4 20l1-4.6L15.6 4.8a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.6 19 4 20zM13.6 6.8l3.6 3.6"/></symbol>
<symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5.5 15V6.5a2 2 0 0 1 2-2H15"/></symbol>
<symbol id="i-frame" viewBox="0 0 24 24"><path d="M3.5 8.5v-5h5M15.5 3.5h5v5M20.5 15.5v5h-5M8.5 20.5h-5v-5M12 7.6l3.8 2.1v4.6L12 16.4l-3.8-2.1V9.7zM8.2 9.7 12 11.8l3.8-2.1M12 11.8v4.6"/></symbol>
<symbol id="i-turn-l" viewBox="0 0 24 24"><path d="M12 3l4 2.3v4.6L12 12.2 8 9.9V5.3zM8 5.3l4 2.3 4-2.3M12 7.6v4.6M5 12.6C3.7 13.3 3 14.1 3 15c0 2.5 4 4.5 9 4.5s9-2 9-4.5c0-.9-.7-1.7-2-2.4M14 17.3 11.5 19.5l2.5 2.2"/></symbol>
<symbol id="i-turn-r" viewBox="0 0 24 24"><path d="M12 3l4 2.3v4.6L12 12.2 8 9.9V5.3zM8 5.3l4 2.3 4-2.3M12 7.6v4.6M5 12.6C3.7 13.3 3 14.1 3 15c0 2.5 4 4.5 9 4.5s9-2 9-4.5c0-.9-.7-1.7-2-2.4M10 17.3l2.5 2.2-2.5 2.2"/></symbol>
<symbol id="i-top" viewBox="0 0 24 24"><path d="M12 2.8v6.4M9.2 6.6 12 9.4l2.8-2.8M3.5 15.2 12 11.4l8.5 3.8L12 19zM3.5 15.2v1.6L12 20.8l8.5-4v-1.6"/></symbol>
<symbol id="i-gift" viewBox="0 0 24 24"><rect x="3.5" y="8" width="17" height="4.5" rx="1.2"/><path d="M5 12.5V20h14v-7.5M12 8v12M12 8C10 4 6.5 4.5 7.5 6.8 8.2 8 12 8 12 8zM12 8c2-4 5.5-3.5 4.5-1.2C15.8 8 12 8 12 8z"/></symbol>`;

// ---------------------------------------------------------------- share codes
// bit-packed: version, theme, bounding box, occupancy bitmap, colour runs; then name (UTF-8) and a checksum byte.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function toB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const k = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < k; j++) out += B64[(n >> (18 - j * 6)) & 63];
  }
  return out;
}
function fromB64(s) {
  const bytes = [];
  let acc = 0, n = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('bad char');
    acc = (acc << 6) | v; n += 6;
    if (n >= 8) { n -= 8; bytes.push((acc >> n) & 255); }
  }
  return bytes;
}
const checksum = bytes => bytes.reduce((h, b) => (h * 31 + b + 7) & 255, 113);
// (drop a high surrogate left dangling by the cut, so an emoji at the limit doesn't become U+FFFD)
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24).replace(/[\uD800-\uDBFF]$/, '');

export function encodeFigure({ voxels, name, theme }) {
  const bytes = [];
  let acc = 0, n = 0;
  const put = (v, k) => { for (let i = k - 1; i >= 0; i--) { acc = (acc << 1) | ((v >> i) & 1); if (++n === 8) { bytes.push(acc); acc = 0; n = 0; } } };
  const xs = voxels.map(v => v.x), ys = voxels.map(v => v.y), zs = voxels.map(v => v.z);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), z0 = Math.min(...zs);
  const W = Math.max(...xs) - x0 + 1, H = Math.max(...ys) - y0 + 1, D = Math.max(...zs) - z0 + 1;
  put(1, 3); put(Math.max(0, THEME_IDS.indexOf(theme)), 2);
  put(x0 + EXT, 4); put(y0, 4); put(z0 + EXT, 4); put(W - 1, 4); put(H - 1, 4); put(D - 1, 4);
  const grid = new Map(voxels.map(v => [`${v.x - x0},${v.y - y0},${v.z - z0}`, v.c]));
  const colors = [];
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const c = grid.get(`${x},${y},${z}`);
    put(c ? 1 : 0, 1);
    if (c) colors.push(Math.max(0, KEYS.indexOf(c)));
  }
  for (let i = 0; i < colors.length;) {
    let len = 1;
    while (i + len < colors.length && colors[i + len] === colors[i] && len < 16) len++;
    put(colors[i], 5); put(len - 1, 4);
    i += len;
  }
  if (n) put(0, 8 - n);
  const nm = [...new TextEncoder().encode(cleanName(name))];
  let nl = Math.min(60, nm.length);
  while (nl > 0 && nl < nm.length && (nm[nl] & 0xc0) === 0x80) nl--; // cut on a character boundary
  bytes.push(nl, ...nm.slice(0, nl));
  bytes.push(checksum(bytes));
  return toB64(bytes);
}

export function decodeFigure(code) {
  try {
    code = String(code || '').trim();
    const m = code.match(/[?&#]fig=([A-Za-z0-9_-]+)/);
    if (m) code = m[1];
    const all = fromB64(code);
    if (all.length < 4 || checksum(all.slice(0, -1)) !== all[all.length - 1]) return null;
    const bytes = all.slice(0, -1); // payload only: never read the checksum byte as data
    let pos = 0;
    const get = k => {
      let v = 0;
      for (let i = 0; i < k; i++, pos++) {
        const b = bytes[pos >> 3];
        if (b === undefined) throw new Error('short');
        v = (v << 1) | ((b >> (7 - (pos & 7))) & 1);
      }
      return v;
    };
    if (get(3) !== 1) return null;
    const theme = THEME_IDS[get(2)];
    const x0 = get(4) - EXT, y0 = get(4), z0 = get(4) - EXT, W = get(4) + 1, H = get(4) + 1, D = get(4) + 1;
    if (x0 + W - 1 > EXT || z0 + D - 1 > EXT || y0 + H > HMAX) return null;
    const cells = [];
    for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (get(1)) cells.push({ x: x + x0, y: y + y0, z: z + z0 });
    if (!cells.length || cells.length > MAX) return null;
    let k = 0;
    while (k < cells.length) {
      const c = KEYS[get(5)], len = get(4) + 1;
      if (!c) return null;
      for (let j = 0; j < len && k < cells.length; j++) cells[k++].c = c;
    }
    let bp = (pos + 7) >> 3;
    const nl = bytes[bp++];
    const name = cleanName(new TextDecoder().decode(new Uint8Array(bytes.slice(bp, bp + nl))));
    return { voxels: cells, name: name || t('workshop.gift.defaultName'), theme };
  } catch { return null; }
}

// ---------------------------------------------------------------- helpers
const keyOf = (x, y, z) => `${x},${y},${z}`;
const inRange = (x, y, z) => Math.abs(x) <= EXT && Math.abs(z) <= EXT && y >= 0 && y < HMAX;
const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// returns the set of keys in the largest face-connected component, and the number of components
function components(vox) {
  const seen = new Set();
  let best = new Set(), count = 0;
  for (const k of vox.keys()) {
    if (seen.has(k)) continue;
    count++;
    const comp = new Set([k]), q = [k];
    seen.add(k);
    while (q.length) {
      const [x, y, z] = q.pop().split(',').map(Number);
      for (const [dx, dy, dz] of NB) {
        const kk = keyOf(x + dx, y + dy, z + dz);
        if (vox.has(kk) && !seen.has(kk)) { seen.add(kk); comp.add(kk); q.push(kk); }
      }
    }
    if (comp.size > best.size) best = comp;
  }
  return { main: best, count };
}
// cells in the same shape expandLevel produces, without dropping disconnected bits (for thumbnails)
function thumbCells(voxels) {
  const xs = voxels.map(v => v.x), ys = voxels.map(v => v.y), zs = voxels.map(v => v.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, y0 = Math.min(...ys);
  return voxels.map(v => ({ ix: v.x, iy: v.y - y0, iz: v.z, x: v.x - cx, y: v.y - y0, z: v.z - cz, color: PALETTE[v.c] ?? 0xffffff }));
}
const sigOf = voxels => voxels.map(v => `${v.x},${v.y},${v.z}${v.c}`).sort().join('|');
const easeBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

// ---------------------------------------------------------------- feature
export function init(ctx) {
  const { save, persist, audio, fmt, hex, mobile } = ctx;
  const $ = id => document.getElementById(id);
  if (!Array.isArray(save.custom)) save.custom = [];
  const list = save.custom;

  // ---------- DOM ----------
  document.querySelector('svg defs')?.insertAdjacentHTML('beforeend', ICONS);
  const sw = c => `<button class="ws-sw" data-c="${c}" style="--c:${hex(PALETTE[c])}" aria-label="${attr(t('workshop.colour', { c }))}"></button>`;
  const tool = (id, icon, label) => `<button class="btn ws-tool" data-tool="${id}" aria-label="${attr(label)}" title="${attr(label)}"><svg><use href="#i-${icon}"/></svg><span>${label}</span></button>`;
  const camBtn = (id, icon, key) => {
    const label = t(`workshop.cam.${id}`);
    return `<button class="btn icon ws-cam" id="ws-cam-${id}" aria-label="${attr(label)}" title="${attr(mobile ? label : `${label} (${key})`)}"><svg><use href="#i-${icon}"/></svg></button>`;
  };
  document.body.insertAdjacentHTML('beforeend', `
<div id="screen-ws" class="screen dim">
  <div class="panel ws-gallery">
    <div class="panel-head">
      <button class="btn icon" id="ws-home" aria-label="${attr(t('workshop.home'))}"><svg><use href="#i-home"/></svg></button>
      <h2>${t('workshop.title')}</h2>
      <div class="tag ws-slots" id="ws-slots">0 / ${SLOTS}</div>
    </div>
    <div class="say ws-intro" id="ws-intro"><div class="kubo mini"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div><p>${t('workshop.intro')}</p></div>
    <div class="ws-list" id="ws-list"></div>
    <div class="ws-import">
      <input class="ws-input" id="ws-code" placeholder="${attr(t('workshop.codePlaceholder'))}" autocomplete="off" spellcheck="false">
      <button class="btn sky" id="ws-import"><svg><use href="#i-drop"/></svg><span>${t('workshop.import')}</span></button>
    </div>
  </div>
</div>

<div id="screen-ws-edit" class="screen ws-edit">
  <div class="ws-stage" id="ws-stage"></div>
  <div class="ws-top">
    <button class="btn icon ws-back" id="ws-back" aria-label="${attr(t('workshop.back'))}"><svg><use href="#i-back"/></svg></button>
    <input class="ws-name" id="ws-name" maxlength="24" autocomplete="off" spellcheck="false" aria-label="${attr(t('workshop.figureName'))}">
    <div class="tag ws-count" id="ws-count"><svg><use href="#i-cube"/></svg><b>0</b><small>/ ${MAX}</small></div>
    <div class="ws-gap"></div>
    <button class="btn icon ws-undo" id="ws-undo" aria-label="${attr(t('workshop.undo'))}" title="${attr(t('workshop.undo'))}"><svg><use href="#i-undo"/></svg></button>
    <button class="btn icon ws-redo" id="ws-redo" aria-label="${attr(t('workshop.redo'))}" title="${attr(t('workshop.redo'))}"><svg><use href="#i-redo"/></svg></button>
    <button class="btn mint ws-play" id="ws-play"><svg><use href="#i-play"/></svg><span>${t('workshop.play')}</span></button>
  </div>
  <div class="tag ws-status" id="ws-status"></div>
  <div class="ws-tools">
    ${tool('add', 'build', t('workshop.tool.build'))}${tool('erase', 'eraser', t('workshop.tool.erase'))}${tool('paint', 'brush', t('workshop.tool.paint')).replace('<span>', '<i class="ws-dot"></i><span>')}
    <button class="btn ws-tool" id="ws-mirror" aria-label="${attr(t('workshop.tool.mirror'))}" title="${attr(t('workshop.tool.mirror'))}"><svg><use href="#i-mirror"/></svg><span>${t('workshop.tool.mirror')}</span></button>
    <button class="btn ws-tool" id="ws-clear" aria-label="${attr(t('workshop.tool.clear'))}" title="${attr(t('workshop.tool.clear'))}"><svg><use href="#i-trash"/></svg><span>${t('workshop.tool.clear')}</span></button>
  </div>
  <div class="ws-view" id="ws-view">
    ${camBtn('frame', 'frame', 'F')}${camBtn('left', 'turn-l', '⇧←')}${camBtn('right', 'turn-r', '⇧→')}${camBtn('top', 'top', 'T')}
  </div>
  <div class="ws-bottom"><div class="ws-palette" id="ws-palette">${UI_ORDER.map(sw).join('')}</div></div>
</div>

<div id="screen-ws-play" class="screen dim">
  <div class="panel narrow ws-sheet">
    <div class="brief-thumb ws-sheet-thumb"><img id="ws-p-img" alt=""></div>
    <h2 class="center" id="ws-p-name"></h2>
    <p class="brief-tag" id="ws-p-tag"></p>
    <div class="ws-label">${t('workshop.pickIsland')}</div>
    <div class="ws-themes" id="ws-themes">${THEME_IDS.map(id => {
      const T = THEMES[id];
      return `<button class="ws-theme" data-t="${id}" title="${attr(themeName(id))}" style="--a:${hex(T.skyTop)};--b:${hex(T.skyHorizon)};--g:${hex(T.grass)};--w:${hex(T.water)}"><i class="ws-check"><svg><use href="#i-check"/></svg></i><span>${themeName(id)}</span></button>`;
    }).join('')}</div>
    <div class="row">
      <button class="btn icon" id="ws-p-back" aria-label="${attr(t('workshop.back'))}"><svg><use href="#i-back"/></svg></button>
      <button class="btn mint grow huge-ish" id="ws-p-go"><svg><use href="#i-play"/></svg><span>${t('workshop.playGo')}</span></button>
    </div>
  </div>
</div>

<div id="screen-ws-share" class="screen dim">
  <div class="panel narrow ws-sheet">
    <div class="brief-thumb ws-sheet-thumb"><img id="ws-s-img" alt=""></div>
    <h2 class="center" id="ws-s-name"></h2>
    <p class="brief-tag">${t('workshop.shareTag')}</p>
    <input class="ws-input ws-link" id="ws-s-link" readonly>
    <div class="row">
      <button class="btn icon" id="ws-s-back" aria-label="${attr(t('workshop.back'))}"><svg><use href="#i-back"/></svg></button>
      <button class="btn" id="ws-s-code"><svg><use href="#i-copy"/></svg><span>${t('workshop.code')}</span></button>
      <button class="btn mint grow" id="ws-s-copy"><svg><use href="#i-copy"/></svg><span>${t('workshop.copyLink')}</span></button>
    </div>
  </div>
</div>

<div id="screen-ws-gift" class="screen dim">
  <div class="panel narrow ws-sheet">
    <div class="brief-chapter ws-gift-tag"><svg><use href="#i-gift"/></svg> ${t('workshop.gift.heading')}</div>
    <div class="brief-thumb ws-sheet-thumb"><img id="ws-g-img" alt=""></div>
    <h2 class="center" id="ws-g-name"></h2>
    <p class="brief-tag" id="ws-g-tag"></p>
    <div class="say"><div class="kubo mini"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div><p>${t('workshop.gift.say')}</p></div>
    <div class="row">
      <button class="btn icon" id="ws-g-no" aria-label="${attr(t('workshop.gift.notNow'))}"><svg><use href="#i-back"/></svg></button>
      <button class="btn" id="ws-g-save"><svg><use href="#i-hammer"/></svg><span>${t('workshop.gift.keep')}</span></button>
      <button class="btn mint grow" id="ws-g-play"><svg><use href="#i-play"/></svg><span>${t('workshop.play')}</span></button>
    </div>
  </div>
</div>
<div class="tag ws-toast" id="ws-toast"></div>`);
  $('title-extra')?.insertAdjacentHTML('beforeend', `<button class="btn" id="btn-workshop"><svg><use href="#i-hammer"/></svg>${t('workshop.title')}</button>`);
  document.querySelectorAll('.ws-input, .ws-name').forEach(el => el.addEventListener('contextmenu', e => e.stopPropagation()));

  let toastT = 0;
  function wsToast(msg) {
    const el = $('ws-toast');
    el.innerHTML = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 2400);
  }
  const shake = el => el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 250 });

  // ---------- thumbnails ----------
  const thumbCache = new Map(); // id -> { sig, url }
  function thumbOf(entry) {
    if (!entry.voxels?.length) return '';
    const sig = sigOf(entry.voxels);
    const c = thumbCache.get(entry.id);
    if (c && c.sig === sig) return c.url;
    const url = ctx.renderThumb(thumbCells(entry.voxels));
    thumbCache.set(entry.id, { sig, url });
    return url;
  }

  const levelFor = entry => ({
    id: entry.id, name: entry.name, kind: 'custom', voxels: entry.voxels.map(v => ({ x: v.x, y: v.y, z: v.z, c: v.c })),
    theme: entry.theme || 'meadow', tag: t('workshop.levelTag'), intro: '', outro: '',
  });
  function unusedName() {
    const used = new Set(list.map(e => e.name));
    for (let i = 0; i < FUN_NAME_COUNT; i++) { const n = t(`workshop.name.${i}`); if (!used.has(n)) return n; }
    return t('workshop.name.fallback', { n: list.length + 1 });
  }
  function playable(voxels) {
    const vox = new Map(voxels.map(v => [keyOf(v.x, v.y, v.z), v.c]));
    return vox.size >= MIN && components(vox).count === 1;
  }

  // ================================================================ gallery
  function openGallery(highlightId) {
    flushEditor();
    ctx.enterTitle();
    ctx.setBase('screen-ws');
    renderGallery(highlightId);
  }

  function renderGallery(highlightId) {
    $('ws-slots').textContent = `${list.length} / ${SLOTS}`;
    $('ws-intro').classList.toggle('hidden', list.length > 0);
    const full = list.length >= SLOTS;
    let html = `<button class="card ws-card ws-new ${full ? 'full' : ''}" id="ws-new"><span class="ws-plus"><svg><use href="#i-plus"/></svg></span><span>${full ? t('workshop.full') : t('workshop.newFigure')}</span></button>`;
    for (const e of list) {
      const ok = playable(e.voxels || []);
      html += `<div class="card ws-card ${e.id === highlightId ? 'flash' : ''}" data-id="${e.id}">
        <button class="ws-thumb" data-act="edit" aria-label="${attr(t('workshop.edit'))}"><img src="${thumbOf(e)}" alt=""></button>
        <div class="ws-info">
          <div class="ws-title">${escapeHtml(e.name)}</div>
          <div class="ws-meta"><span><svg><use href="#i-cube"/></svg>${e.voxels.length}</span>${e.best ? `<span><svg><use href="#i-clock"/></svg>${fmt(e.best)}</span>` : ''}${ok ? '' : `<span class="ws-wip">${t('workshop.unfinished')}</span>`}</div>
          <div class="ws-acts">
            <button class="btn mint grow" data-act="play" ${ok ? '' : 'disabled'}><svg><use href="#i-play"/></svg><span>${t('workshop.play')}</span></button>
            <button class="btn sq" data-act="edit" aria-label="${attr(t('workshop.edit'))}"><svg><use href="#i-pencil"/></svg></button>
            <button class="btn sq" data-act="share" aria-label="${attr(t('workshop.share'))}" title="${attr(t('workshop.share'))}" ${ok ? '' : 'disabled'}><svg><use href="#i-share"/></svg></button>
            <button class="btn sq coral" data-act="del" aria-label="${attr(t('workshop.delete'))}" title="${attr(t('workshop.delete'))}"><svg><use href="#i-trash"/></svg></button>
          </div>
        </div>
      </div>`;
    }
    $('ws-list').innerHTML = html;
    if (highlightId) $('ws-list').querySelector('.flash')?.scrollIntoView({ block: 'nearest' });
  }
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  $('ws-list').addEventListener('click', e => {
    if (e.target.closest('#ws-new')) {
      if (list.length >= SLOTS) { audio.wrong(); shake(e.target.closest('#ws-new')); wsToast(t('workshop.toast.fullDelete')); return; }
      openEditor(null);
      return;
    }
    const b = e.target.closest('[data-act]');
    const card = e.target.closest('[data-id]');
    if (!b || !card) return;
    const entry = list.find(x => x.id === card.dataset.id);
    if (!entry) return;
    const act = b.dataset.act;
    if (act === 'edit') openEditor(entry);
    else if (act === 'play') openPlaySheet(entry);
    else if (act === 'share') openShare(entry);
    else if (act === 'del') {
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = t('workshop.sure');
        setTimeout(() => { if (b.isConnected) { b.classList.remove('armed'); b.innerHTML = '<svg><use href="#i-trash"/></svg>'; } }, 2500);
        return;
      }
      list.splice(list.indexOf(entry), 1);
      thumbCache.delete(entry.id);
      if (save.session?.id === entry.id) delete save.session;
      persist();
      audio.drop();
      renderGallery();
    }
  });
  $('ws-home').onclick = () => ctx.enterTitle();
  $('btn-workshop').onclick = () => openGallery();

  function addEntry(fig) {
    const sig = sigOf(fig.voxels);
    const dup = list.find(e => sigOf(e.voxels) === sig);
    if (dup) return { entry: dup, dup: true };
    if (list.length >= SLOTS) return { full: true };
    const entry = { id: `c-${Date.now()}`, name: fig.name, voxels: fig.voxels, theme: fig.theme || 'meadow', created: Date.now(), best: 0, gift: true };
    list.unshift(entry);
    persist();
    return { entry };
  }

  $('ws-import').onclick = () => {
    const inp = $('ws-code');
    const fig = decodeFigure(inp.value);
    if (!fig) { audio.wrong(); shake(inp); wsToast(inp.value.trim() ? t('workshop.toast.badCode') : t('workshop.toast.noCode')); return; }
    const r = addEntry(fig);
    if (r.full) { audio.wrong(); wsToast(t('workshop.toast.fullImport')); return; }
    inp.value = '';
    inp.blur();
    audio.star(1);
    wsToast(t(r.dup ? 'workshop.toast.dup' : 'workshop.toast.imported', { name: escapeHtml(r.entry.name) }));
    renderGallery(r.entry.id);
  };
  $('ws-code').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('ws-import').click(); } });

  // ================================================================ play sheet
  let sheetEntry = null, sheetTheme = 'meadow';
  function openPlaySheet(entry) {
    if (!playable(entry.voxels)) { audio.wrong(); return; }
    sheetEntry = entry;
    sheetTheme = entry.theme || 'meadow';
    $('ws-p-img').src = thumbOf(entry);
    $('ws-p-name').textContent = entry.name;
    $('ws-p-tag').textContent = entry.best ? plural('workshop.blocksBest', entry.voxels.length, { time: fmt(entry.best) }) : plural('workshop.blocks', entry.voxels.length);
    renderThemes();
    ctx.pushOverlay('screen-ws-play');
  }
  function renderThemes() {
    document.querySelectorAll('.ws-theme').forEach(b => b.classList.toggle('on', b.dataset.t === sheetTheme));
  }
  $('ws-themes').addEventListener('click', e => {
    const b = e.target.closest('.ws-theme');
    if (!b) return;
    audio.click();
    sheetTheme = b.dataset.t;
    renderThemes();
  });
  $('ws-p-back').onclick = () => ctx.popOverlay('screen-ws-play');
  $('ws-p-go').onclick = () => {
    if (!sheetEntry) return;
    sheetEntry.theme = sheetTheme;
    persist();
    playEntry(sheetEntry);
  };
  function playEntry(entry) {
    flushEditor();
    forgetLevel(entry.id);
    if (save.session?.id === entry.id) delete save.session;
    ctx.startLevel(levelFor(entry));
  }

  ctx.completeHandlers.custom = (stats, level) => {
    const entry = list.find(e => e.id === level.id);
    const prev = entry?.best || 0;
    const isBest = !prev || stats.time < prev;
    if (entry && isBest) { entry.best = stats.time; }
    if (save.session?.id === level.id) delete save.session;
    persist();
    const par = ctx.parTime(level);
    const gifted = entry ? entry.gift : true;
    ctx.showComplete({
      name: level.name, img: entry ? thumbOf(entry) : ctx.renderThumb(ctx.expandLevel(level).cells),
      time: stats.time, par, hints: stats.hints,
      stars: [true, stats.time <= par, stats.hints === 0],
      best: isBest && prev ? t('workshop.newBest') : '',
      say: t(`workshop.${gifted ? 'giftCheer' : 'cheer'}.${Math.floor(Math.random() * (gifted ? GIFT_CHEER_COUNT : CHEER_COUNT))}`),
      nextLabel: t('workshop.title'), onNext: () => openGallery(entry?.id), onMap: () => ctx.enterTitle(),
      onRetry: () => { forgetLevel(level.id); ctx.startLevel(level); },
    });
  };

  // ================================================================ share
  let shareEntry = null;
  function shareLink(entry) {
    const code = encodeFigure(entry);
    return { code, link: `${location.origin}${location.pathname}?fig=${code}` };
  }
  function openShare(entry) {
    if (!playable(entry.voxels)) { audio.wrong(); return; }
    shareEntry = entry;
    const { link } = shareLink(entry);
    $('ws-s-img').src = thumbOf(entry);
    $('ws-s-name').textContent = entry.name;
    $('ws-s-link').value = link;
    $('ws-s-copy').querySelector('span').textContent = t('workshop.copyLink');
    $('ws-s-code').querySelector('span').textContent = t('workshop.code');
    ctx.pushOverlay('screen-ws-share');
  }
  $('ws-s-back').onclick = () => ctx.popOverlay('screen-ws-share');
  $('ws-s-link').addEventListener('focus', e => e.target.select());
  const copyBtn = (id, what, labelKey) => {
    $(id).onclick = async () => {
      if (!shareEntry) return;
      const ok = await copyText(shareLink(shareEntry)[what]);
      $(id).querySelector('span').textContent = ok ? t('workshop.copied') : t(labelKey);
      if (ok) audio.star(0); else { $('ws-s-link').select(); wsToast(t('workshop.toast.copyFailed')); }
      setTimeout(() => { $(id).querySelector('span').textContent = t(labelKey); }, 1800);
    };
  };
  copyBtn('ws-s-copy', 'link', 'workshop.copyLink');
  copyBtn('ws-s-code', 'code', 'workshop.code');

  // ================================================================ ?fig= links
  let gift = null;
  const giftCode = new URLSearchParams(location.search).get('fig');
  if (giftCode) {
    gift = decodeFigure(giftCode);
    const show = () => {
      if (ctx.base !== 'screen-title') { setTimeout(show, 200); return; }
      try { const u = new URL(location.href); u.searchParams.delete('fig'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch { /* ignore */ }
      if (!gift || !playable(gift.voxels)) { wsToast(t('workshop.gift.broken')); return; }
      $('ws-g-img').src = ctx.renderThumb(thumbCells(gift.voxels));
      $('ws-g-name').textContent = gift.name;
      $('ws-g-tag').textContent = plural('workshop.gift.tag', gift.voxels.length, { theme: themeName(THEME_IDS.includes(gift.theme) ? gift.theme : 'meadow') });
      ctx.pushOverlay('screen-ws-gift');
    };
    setTimeout(show, 300);
  }
  const keepGift = fullKey => {
    const r = addEntry(gift);
    if (r.full) { wsToast(t(fullKey)); return null; }
    return r.entry;
  };
  $('ws-g-no').onclick = () => ctx.popOverlay('screen-ws-gift');
  $('ws-g-save').onclick = () => { const e = keepGift('workshop.toast.fullImport'); if (e) { audio.star(1); openGallery(e.id); wsToast(t('workshop.gift.kept', { name: escapeHtml(e.name) })); } else audio.wrong(); };
  $('ws-g-play').onclick = () => {
    const e = keepGift('workshop.gift.fullPlay');
    if (e) { playEntry(e); return; }
    const lvl = levelFor({ ...gift, id: 'c-gift' });
    forgetLevel(lvl.id);
    ctx.startLevel(lvl);
  };

  // ================================================================ editor: 3D
  const es = new THREE.Scene();
  // sky dome on the fx layer (scene.background would be redrawn over the ink pass by the overlay render)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x86c8ff) }, horizon: { value: new THREE.Color(0xffe7c9) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
      void main(){ float t = smoothstep(-0.1, 0.7, normalize(vP).y); gl_FragColor = vec4(mix(horizon, top, t), 1.0);
      #include <colorspace_fragment>
      }`,
  }));
  sky.layers.set(LAYER_FX);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  es.add(sky);
  es.add(new THREE.HemisphereLight(0xcfe0ff, 0xc9a98a, 1.45));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
  sun.position.set(-4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0015;
  es.add(sun, sun.target);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 120);

  // plate with a grid on top, on a little grass island
  const P = (2 * EXT + 1) * S;
  const gridTex = (() => {
    const n = 2 * EXT + 1, px = 40, cv = document.createElement('canvas');
    cv.width = cv.height = n * px;
    const g = cv.getContext('2d');
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#f6e8cc' : '#fff4e0';
      g.fillRect(i * px, j * px, px, px);
    }
    g.strokeStyle = 'rgba(42,31,61,.18)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * px, 0); g.lineTo(i * px, n * px); g.stroke(); g.beginPath(); g.moveTo(0, i * px); g.lineTo(n * px, i * px); g.stroke(); }
    g.fillStyle = 'rgba(182,147,245,.16)';
    g.fillRect(EXT * px, 0, px, n * px);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  })();
  const plateSide = toon(0xe0a877), plateTop = toon(0xffffff, { map: gridTex });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(P, 0.24, P), [plateSide, plateSide, plateTop, plateSide, plateSide, plateSide]);
  plate.position.y = -0.12;
  plate.receiveShadow = true;
  es.add(plate);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(P * 0.76, P * 0.62, 1.1, 28), [toon(0xe0a877), toon(0x8fdc6a), toon(0xc98a5e)]);
  island.position.y = -0.8;
  island.receiveShadow = true;
  es.add(island);
  const water = new THREE.Mesh(new THREE.CircleGeometry(60, 40), toon(0x7fd3ef));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.15;
  es.add(water);

  // voxels: one mesh each, block texture gives every cube a soft bevel
  const blockTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#c2b7a9'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.roundRect(5, 5, 54, 54, 10); g.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const boxGeo = new THREE.BoxGeometry(S, S, S);
  const mats = {}, warnMats = {};
  const matFor = (c, warn) => {
    const bank = warn ? warnMats : mats;
    return bank[c] ||= toon(PALETTE[c], { map: blockTex, ...(warn ? { emissive: 0xffffff, emissiveIntensity: 0.2 } : {}) });
  };
  const vox = new Map(); // key -> colour char
  const meshes = new Map(); // key -> mesh
  const popping = new Set();
  const group = new THREE.Group();
  es.add(group);

  function addMesh(k, c, animate) {
    const [x, y, z] = k.split(',').map(Number);
    const m = new THREE.Mesh(boxGeo, matFor(c));
    m.position.set(x * S, y * S + S / 2, z * S);
    m.castShadow = m.receiveShadow = true;
    m.userData = { cell: [x, y, z], t: animate ? 0 : 1 };
    if (animate) { m.scale.setScalar(0.3); popping.add(m); }
    group.add(m);
    meshes.set(k, m);
  }
  function sync(animate = true) {
    for (const [k, m] of meshes) if (!vox.has(k)) { group.remove(m); meshes.delete(k); popping.delete(m); }
    for (const [k, c] of vox) {
      const m = meshes.get(k);
      if (!m) addMesh(k, c, animate);
      else if (m.userData.c !== c) { m.userData.t = 0.35; popping.add(m); }
      meshes.get(k).userData.c = c;
    }
    refreshState();
  }

  // ghost cursor + mirror plane live on the overlay layer (drawn after the ink pass)
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.85 });
  const ghostGeo = new THREE.BoxGeometry(S * 1.02, S * 1.02, S * 1.02);
  const edgeGeo = new THREE.EdgesGeometry(ghostGeo);
  const ghosts = [0, 1].map(() => {
    const g = new THREE.Mesh(ghostGeo, ghostMat);
    g.add(new THREE.LineSegments(edgeGeo, edgeMat));
    g.traverse(o => o.layers.set(LAYER_OVERLAY));
    g.visible = false;
    es.add(g);
    return g;
  });
  const mirrorPlane = new THREE.Mesh(new THREE.PlaneGeometry(P, 1.6),
    new THREE.MeshBasicMaterial({ color: 0x9b6bf0, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }));
  mirrorPlane.rotation.y = Math.PI / 2;
  mirrorPlane.position.y = 0.8;
  mirrorPlane.layers.set(LAYER_OVERLAY);
  mirrorPlane.visible = false;
  es.add(mirrorPlane);

  // height guide under the ghost: a footprint on whatever it would rest on, and a dashed drop line
  // when it hangs in the air (placed against the side of a block)
  const footMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const footGeo = new THREE.PlaneGeometry(S * 0.96, S * 0.96).rotateX(-Math.PI / 2);
  const footEdge = new THREE.EdgesGeometry(footGeo);
  const dropMat = new THREE.LineDashedMaterial({ color: INK, transparent: true, opacity: 0.75, dashSize: 0.09, gapSize: 0.07, depthWrite: false });
  const guides = [0, 1].map(() => {
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.add(new THREE.LineSegments(footEdge, edgeMat));
    const drop = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -1, 0], 3)), dropMat);
    for (const o of [foot, drop]) { o.traverse(q => q.layers.set(LAYER_OVERLAY)); o.visible = false; o.renderOrder = 2; es.add(o); }
    return { foot, drop };
  });
  // focus ring (long-press / middle-click a block)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 40), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, depthTest: false, depthWrite: false }));
  ring.layers.set(LAYER_OVERLAY);
  ring.visible = false;
  ring.renderOrder = 5;
  ring.userData.t = 1;
  es.add(ring);
  const pingRing = p => { ring.position.copy(p); ring.userData.t = 0; ring.visible = true; };

  // ---------- orbit camera (js/features/workshop-cam.js) ----------
  const figureBox = () => {
    if (!vox.size) return null;
    const box = new THREE.Box3();
    for (const k of vox.keys()) { const [x, y, z] = k.split(',').map(Number); box.expandByPoint(new THREE.Vector3(x * S, y * S + S / 2, z * S)); }
    return box.expandByScalar(S / 2);
  };
  let boxCache = null;
  const freeRect = () => {
    const W = innerWidth, H = innerHeight;
    const r = { l: 0, t: 0, r: W, b: H };
    const rect = id => { const el = $(id); const b = el?.getBoundingClientRect(); return b && b.width > 0 && b.height > 0 ? b : null; };
    const topBar = rect('ws-top'), status = rect('ws-status'), pal = rect('ws-palette'), tools = document.querySelector('.ws-tools')?.getBoundingClientRect(), view = rect('ws-view');
    if (topBar) r.t = Math.max(r.t, topBar.bottom);
    if (status && status.top < H / 2) r.t = Math.max(r.t, status.bottom);
    if (pal) r.b = Math.min(r.b, pal.top);
    if (tools?.width) { if (tools.height > tools.width) r.l = Math.max(r.l, tools.right); else r.b = Math.min(r.b, tools.top); }
    // the view column trims the right edge; on narrow screens trim both sides so the figure stays centred
    if (view && view.height > view.width) {
      r.r = Math.min(r.r, view.left);
      if (view.width > W * 0.1) r.l = Math.max(r.l, W - view.left);
    }
    return { l: r.l + 6, t: r.t + 6, r: r.r - 6, b: r.b - 6 };
  };
  const camCtl = createEditorCam({
    cam, half: P / 2, freeRect,
    bounds: () => (boxCache ||= figureBox()),
    solidAt: (x, y, z) => y >= 0 && vox.has(keyOf(Math.round(x / S), Math.floor(y / S), Math.round(z / S))),
    hitPoint: (cx, cy) => pick(cx, cy)?.point || null,
    onChange: () => $('ws-cam-top')?.classList.toggle('on', camCtl.top),
  });
  ctx.wsCam = camCtl; // for debugging / tests
  addEventListener('resize', () => camCtl.resize());
  camCtl.resize();

  // ================================================================ editor: state
  let entry = null; // the figure being edited (only added to the list once it holds a block)
  let toolMode = 'add', color = 'r', mirror = false;
  let undoStack = [], redoStack = [];
  let comp = { main: new Set(), count: 0 };
  let flashT = 0, dirty = false;
  const snap = () => [...vox].map(([k, c]) => `${k},${c}`).join(';');
  function restore(s) {
    vox.clear();
    if (s) for (const part of s.split(';')) { const [x, y, z, c] = part.split(','); vox.set(keyOf(x, y, z), c); }
    sync(true);
  }
  function commit(before) {
    undoStack.push(before);
    if (undoStack.length > 150) undoStack.shift();
    redoStack = [];
    sync(true);
    markDirty();
  }
  function markDirty() {
    dirty = true;
    clearTimeout(markDirty.t);
    markDirty.t = setTimeout(flushEditor, 500);
  }
  function flushEditor() {
    clearTimeout(markDirty.t);
    if (!entry || !dirty) return;
    dirty = false;
    entry.voxels = [...vox].map(([k, c]) => { const [x, y, z] = k.split(',').map(Number); return { x, y, z, c }; });
    entry.name = cleanName($('ws-name').value) || entry.name;
    delete entry.gift;
    const idx = list.indexOf(entry);
    if (!entry.voxels.length) { if (idx >= 0) list.splice(idx, 1); thumbCache.delete(entry.id); }
    else if (idx < 0) list.unshift(entry);
    forgetLevel(entry.id);
    persist();
  }

  function openEditor(e) {
    if (!e) {
      if (list.length >= SLOTS) return;
      e = { id: `c-${Date.now()}`, name: unusedName(), voxels: [], theme: 'meadow', created: Date.now(), best: 0 };
    }
    entry = e;
    dirty = false;
    vox.clear();
    for (const v of e.voxels) if (inRange(v.x, v.y, v.z) && v.c in PALETTE) vox.set(keyOf(v.x, v.y, v.z), v.c);
    for (const m of meshes.values()) group.remove(m);
    meshes.clear(); popping.clear();
    sync(false);
    undoStack = []; redoStack = [];
    disarmClear(); // an armed Clear must not carry over to the next figure
    $('ws-name').value = e.name;
    if (e.voxels.length) color = e.voxels[e.voxels.length - 1].c;
    setTool('add');
    renderPalette();
    ctx.app = 'editor';
    ctx.input.enabled = false;
    $('ws-toast').classList.remove('show');
    ctx.setBase('screen-ws-edit');
    hideGhost();
    refreshState();
    camCtl.clearKeys();
    camCtl.resize();
    camCtl.frame({ home: true, snap: true });
  }

  function setTool(mode) {
    toolMode = mode;
    document.querySelectorAll('.ws-tool[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === mode));
    $('ws-stage').dataset.tool = mode;
    updateHover();
  }
  function renderPalette() {
    document.querySelectorAll('.ws-sw').forEach(b => b.classList.toggle('on', b.dataset.c === color));
    document.querySelector('.ws-tool[data-tool="add"]').style.setProperty('--c', hex(PALETTE[color]));
    document.querySelector('.ws-tool[data-tool="paint"]').style.setProperty('--c', hex(PALETTE[color]));
  }

  function refreshState() {
    boxCache = null;
    comp = components(vox);
    for (const [k, m] of meshes) {
      m.userData.loose = comp.count > 1 && !comp.main.has(k);
      m.material = matFor(vox.get(k), m.userData.loose);
      if (!m.userData.loose) m.position.y = m.userData.cell[1] * S + S / 2;
    }
    const n = vox.size;
    let top = 0;
    for (const k of vox.keys()) top = Math.max(top, +k.split(',')[1]);
    mirrorPlane.scale.y = Math.max(1, ((top + 2) * S) / 1.6);
    mirrorPlane.position.y = mirrorPlane.scale.y * 0.8;
    $('ws-count').querySelector('b').textContent = n;
    $('ws-count').classList.toggle('full', n >= MAX);
    $('ws-undo').disabled = !undoStack.length;
    $('ws-redo').disabled = !redoStack.length;
    $('ws-play').classList.toggle('off', !!blocker());
    if (performance.now() > flashT) showStatus();
  }
  function blocker() {
    const n = vox.size;
    if (n < MIN) return n === 0 ? t(mobile ? 'workshop.status.startTap' : 'workshop.status.startClick') : plural('workshop.status.addMore', MIN - n);
    if (comp.count > 1) return plural('workshop.status.floating', n - comp.main.size);
    return '';
  }
  function showStatus(msg, kind) {
    const el = $('ws-status');
    const b = blocker();
    if (!msg) {
      msg = b || (vox.size >= MAX ? t('workshop.status.limit', { max: MAX }) : t('workshop.status.ready'));
      kind = b ? (comp.count > 1 ? 'warn' : '') : 'ok';
    }
    el.innerHTML = msg;
    el.className = `tag ws-status show ${kind || ''}`;
  }
  function flash(msg, kind = 'warn') { flashT = performance.now() + 2200; showStatus(msg, kind); clearTimeout(flash.t); flash.t = setTimeout(() => { flashT = 0; showStatus(); }, 2200); }

  // ---------- picking: exact voxel-grid ray walk (ignores pop / bob animations), then the plate ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const o = ray.ray.origin, d = ray.ray.direction;
    // cell space: cell (i, j, k) spans [i, i+1) x [j, j+1) x [k, k+1) in (x/S + .5, y/S, z/S + .5)
    const O = [o.x / S + 0.5, o.y / S, o.z / S + 0.5], D = [d.x / S, d.y / S, d.z / S];
    const lo = [-EXT, 0, -EXT], hi = [EXT + 1, HMAX, EXT + 1];
    let t0 = 0, t1 = Infinity, axis0 = -1;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(D[a]) < 1e-9) { if (O[a] < lo[a] || O[a] > hi[a]) { t1 = -1; break; } continue; }
      let ta = (lo[a] - O[a]) / D[a], tb = (hi[a] - O[a]) / D[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) { t0 = ta; axis0 = a; }
      t1 = Math.min(t1, tb);
    }
    if (t1 > t0 && vox.size) {
      const at = t0 + 1e-6;
      const cell = [0, 1, 2].map(a => THREE.MathUtils.clamp(Math.floor(O[a] + D[a] * at), lo[a], hi[a] - 1));
      const step = D.map(v => (v > 0 ? 1 : v < 0 ? -1 : 0));
      const tMax = [0, 1, 2].map(a => (step[a] ? ((cell[a] + (step[a] > 0 ? 1 : 0)) - O[a]) / D[a] : Infinity));
      const tDelta = D.map(v => (v ? Math.abs(1 / v) : Infinity));
      let t = t0, axis = axis0;
      for (let i = 0; i < 96; i++) {
        if (vox.has(keyOf(cell[0], cell[1], cell[2]))) {
          const n = [0, 0, 0];
          if (axis >= 0) n[axis] = -step[axis];
          const point = o.clone().addScaledVector(d, t);
          return { hit: [...cell], place: axis >= 0 ? [cell[0] + n[0], cell[1] + n[1], cell[2] + n[2]] : null, point };
        }
        axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
        t = tMax[axis];
        if (t > t1) break;
        cell[axis] += step[axis];
        tMax[axis] += tDelta[axis];
      }
    }
    if (d.y < -1e-6) {
      const tp = -o.y / d.y;
      if (tp > 0) {
        const point = o.clone().addScaledVector(d, tp);
        const x = Math.round(point.x / S), z = Math.round(point.z / S);
        if (inRange(x, 0, z)) return { hit: null, place: [x, 0, z], point };
      }
    }
    return null;
  }
  const withMirror = ([x, y, z]) => (mirror && x !== 0 ? [[x, y, z], [-x, y, z]] : [[x, y, z]]);

  function apply(p) {
    if (!p || (toolMode === 'add' && !p.place)) return;
    const before = snap();
    if (toolMode === 'add') {
      const cells = withMirror(p.place).filter(([x, y, z]) => inRange(x, y, z) && !vox.has(keyOf(x, y, z)));
      if (!inRange(...p.place)) { audio.wrong(); flash(t(p.place[1] >= HMAX ? 'workshop.status.tooTall' : 'workshop.status.edge')); return; }
      if (!cells.length) return;
      if (vox.size + cells.length > MAX) { audio.wrong(); flash(t('workshop.status.limit', { max: MAX })); return; }
      for (const [x, y, z] of cells) vox.set(keyOf(x, y, z), color);
      audio.tone({ f: 330 + p.place[1] * 28, f2: 520 + p.place[1] * 30, type: 'triangle', dur: 0.09, vol: 0.14 });
    } else if (p.hit) {
      const cells = withMirror(p.hit).map(c => keyOf(...c)).filter(k => vox.has(k));
      if (toolMode === 'erase') { cells.forEach(k => vox.delete(k)); audio.drop(); }
      else {
        const todo = cells.filter(k => vox.get(k) !== color);
        if (!todo.length) return;
        todo.forEach(k => vox.set(k, color));
        audio.tone({ f: 760, f2: 1040, type: 'sine', dur: 0.08, vol: 0.1 });
      }
    } else return;
    commit(before);
    updateHover();
  }

  // ---------- hover ghost (mouse hover, or under a finger until it starts dragging) ----------
  let hoverXY = null;
  function hideGhost() {
    ghosts.forEach(g => { g.visible = false; });
    guides.forEach(g => { g.foot.visible = g.drop.visible = false; });
  }
  function updateHover() {
    hideGhost();
    if (!hoverXY || (drag && drag.mode !== 'tap' && drag.mode !== 'held')) return;
    const p = pick(hoverXY[0], hoverXY[1]);
    if (!p) return;
    let cells;
    if (toolMode === 'add') cells = p.place && inRange(...p.place) ? withMirror(p.place).filter(c => !vox.has(keyOf(...c))) : [];
    else cells = p.hit ? withMirror(p.hit).filter(c => vox.has(keyOf(...c))) : [];
    ghostMat.color.setHex(toolMode === 'erase' ? 0xff4d6d : PALETTE[color]);
    ghostMat.opacity = toolMode === 'erase' ? 0.55 : 0.6;
    const s = toolMode === 'add' ? 1 : 1.07;
    cells.slice(0, 2).forEach(([x, y, z], i) => {
      const g = ghosts[i];
      g.position.set(x * S, y * S + S / 2, z * S);
      g.scale.setScalar(s * (i ? 0.98 : 1));
      g.visible = true;
      if (toolMode !== 'add') return;
      // what would this block rest on? (the plate, or the top of the column below it)
      let below = -1;
      for (let yy = y - 1; yy >= 0; yy--) if (vox.has(keyOf(x, yy, z))) { below = yy; break; }
      const floor = (below + 1) * S, gd = guides[i];
      gd.foot.position.set(x * S, floor + 0.004, z * S);
      gd.foot.visible = true;
      if (y * S - floor > 0.01) {
        const pos = gd.drop.geometry.attributes.position;
        pos.setXYZ(0, x * S, y * S, z * S);
        pos.setXYZ(1, x * S, floor, z * S);
        pos.needsUpdate = true;
        gd.drop.computeLineDistances();
        gd.drop.visible = true;
      }
    });
  }

  // ---------- gestures ----------
  // mouse: left drag orbits (with inertia), right / middle / shift drag pans, wheel zooms toward the cursor,
  //        click = tool, double-click empty space = frame, middle-click / alt-click / hold a block = focus it
  // touch: one finger orbits, two fingers pinch-zoom + pan + twist together, tap = tool, hold = focus,
  //        double-tap empty space = frame. A tap that only stops a spinning view never builds.
  const stage = $('ws-stage');
  const pts = new Map();
  let drag = null; // { mode: 'tap'|'held'|'orbit'|'pan'|'pinch'|'none', ... }
  let holdT = 0, lastEmpty = null;
  const pinchInfo = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const focusAt = (x, y) => {
    const p = pick(x, y);
    if (!p) return false;
    const at = p.hit ? new THREE.Vector3(p.hit[0] * S, p.hit[1] * S + S / 2, p.hit[2] * S) : p.point;
    camCtl.focus(at);
    pingRing(at);
    audio.tone({ f: 620, f2: 880, type: 'sine', dur: 0.08, vol: 0.08 });
    return true;
  };
  function tapAt(x, y) {
    const p = pick(x, y);
    if (!p) { // double-tap / double-click on empty space frames the whole figure
      const t = performance.now();
      if (lastEmpty && t - lastEmpty.t < 420 && Math.hypot(x - lastEmpty.x, y - lastEmpty.y) < 40) { lastEmpty = null; camCtl.frame(); audio.click(); }
      else lastEmpty = { t, x, y };
      return;
    }
    lastEmpty = null;
    apply(p);
  }
  stage.addEventListener('pointerdown', e => {
    e.preventDefault();
    document.activeElement?.blur?.();
    audio.unlock();
    camCtl.poke();
    stage.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    clearTimeout(holdT);
    if (pts.size === 1) {
      const touch = e.pointerType !== 'mouse';
      const spinning = camCtl.stop();
      drag = {
        mode: 'tap', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, at: performance.now(), touch, button: e.button,
        pan: e.button === 2 || e.button === 1 || e.shiftKey, noTap: spinning || e.button === 2,
      };
      if (touch) hoverXY = [e.clientX, e.clientY]; // preview the block under the finger
      if (!spinning && e.button === 0) holdT = setTimeout(() => {
        if (drag?.mode === 'tap' && pts.size === 1 && focusAt(drag.sx, drag.sy)) { drag.mode = 'held'; navigator.vibrate?.(12); updateHover(); }
      }, 520);
    } else if (pts.size === 2) {
      if (drag?.mode === 'orbit') { camCtl.endOrbit(); camCtl.stop(); } // no flick spin from the first finger
      drag = { mode: 'pinch', ...pinchInfo(), twist: 0, twisting: false };
    } else drag = { mode: 'none' };
    updateHover();
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') hoverXY = [e.clientX, e.clientY];
    const pt = pts.get(e.pointerId);
    if (!pt) { if (e.pointerType === 'mouse') updateHover(); return; }
    pt.x = e.clientX; pt.y = e.clientY;
    if (!drag) return;
    camCtl.poke();
    if (drag.mode === 'tap' || drag.mode === 'held') {
      const th = drag.touch ? 12 : 5;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > th) {
        clearTimeout(holdT);
        drag.mode = drag.pan ? 'pan' : 'orbit';
        if (drag.mode === 'orbit') camCtl.beginOrbit();
        stage.classList.add('drag');
        if (drag.touch) hoverXY = null;
        hideGhost();
      }
    }
    if (drag.mode === 'orbit' || drag.mode === 'pan') {
      const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
      drag.lx = e.clientX; drag.ly = e.clientY;
      if (drag.mode === 'orbit') camCtl.orbit(dx, dy);
      else camCtl.pan(dx, dy);
    } else if (drag.mode === 'pinch' && pts.size === 2) {
      const p = pinchInfo();
      if (p.d > 10 && drag.d > 10) camCtl.zoomAt(p.mx, p.my, drag.d / p.d, 22);
      camCtl.pan(p.mx - drag.mx, p.my - drag.my);
      let da = p.ang - drag.ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      drag.twist += da;
      if (!drag.twisting && Math.abs(drag.twist) > 0.2) { drag.twisting = true; da = drag.twist; }
      if (drag.twisting) camCtl.turn(da);
      Object.assign(drag, { d: p.d, mx: p.mx, my: p.my, ang: p.ang });
    }
  });
  const endPointer = (e, cancel) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    clearTimeout(holdT);
    camCtl.poke();
    // (only while the editor is up: a press that outlives Esc / Back must not build on a closed figure)
    if (drag?.mode === 'tap' && !cancel && !drag.noTap && pts.size === 0 && performance.now() - drag.at < 650 && ctx.app === 'editor') {
      if (drag.button === 1 || (e.altKey && !drag.touch)) focusAt(e.clientX, e.clientY);
      else if (drag.button === 0 || drag.touch) tapAt(e.clientX, e.clientY);
    }
    if (drag?.mode === 'orbit' && pts.size === 0) camCtl.endOrbit();
    if (pts.size === 0) {
      drag = null;
      stage.classList.remove('drag');
      if (e.pointerType !== 'mouse') hoverXY = null;
      updateHover();
    } else if (pts.size === 1 && drag?.mode === 'pinch') {
      const [p] = [...pts.values()];
      drag = { mode: 'orbit', lx: p.x, ly: p.y, touch: true }; // remaining finger keeps orbiting, never taps
      camCtl.beginOrbit();
    }
  };
  stage.addEventListener('pointerup', e => endPointer(e, false));
  stage.addEventListener('pointercancel', e => endPointer(e, true));
  stage.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) { hoverXY = null; hideGhost(); } });
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    camCtl.poke();
    // ctrl + wheel is a trackpad pinch: small deltas, so a stronger factor
    const k = e.ctrlKey ? 0.012 : e.deltaMode ? 0.06 : 0.0016;
    camCtl.zoomAt(e.clientX, e.clientY, Math.exp(THREE.MathUtils.clamp(e.deltaY, -240, 240) * k));
  }, { passive: false });
  stage.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- view buttons ----------
  const camClick = (id, fn) => { $(id).onclick = () => { fn(); audio.click(); }; };
  camClick('ws-cam-frame', () => camCtl.frame({ home: camCtl.framed() }));
  camClick('ws-cam-left', () => camCtl.rotateQuarter(1));
  camClick('ws-cam-right', () => camCtl.rotateQuarter(-1));
  camClick('ws-cam-top', () => camCtl.toggleTop());

  // ---------- toolbar ----------
  document.querySelectorAll('.ws-tool[data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });
  $('ws-palette').addEventListener('click', e => {
    const b = e.target.closest('.ws-sw');
    if (!b) return;
    color = b.dataset.c;
    if (toolMode === 'erase') setTool('add');
    renderPalette();
    audio.tone({ f: 980, type: 'sine', dur: 0.05, vol: 0.06 });
    updateHover();
  });
  $('ws-mirror').onclick = () => {
    mirror = !mirror;
    $('ws-mirror').classList.toggle('on', mirror);
    mirrorPlane.visible = mirror;
    flash(t(mirror ? 'workshop.status.mirrorOn' : 'workshop.status.mirrorOff'), 'ok');
    updateHover();
  };
  let clearArmed = 0, clearT = 0;
  const disarmClear = () => {
    clearArmed = 0;
    clearTimeout(clearT);
    $('ws-clear').classList.remove('armed');
    $('ws-clear').querySelector('span').textContent = t('workshop.tool.clear');
  };
  $('ws-clear').onclick = () => {
    if (!vox.size) return;
    const b = $('ws-clear');
    if (performance.now() > clearArmed) {
      clearArmed = performance.now() + 2500;
      b.classList.add('armed');
      b.querySelector('span').textContent = t('workshop.sure');
      flash(t('workshop.status.clearConfirm'));
      clearTimeout(clearT);
      clearT = setTimeout(disarmClear, 2500);
      return;
    }
    disarmClear();
    const before = snap();
    vox.clear();
    commit(before);
    audio.drop();
    flash(t('workshop.status.cleared'), 'ok');
  };
  const undo = () => { if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); markDirty(); audio.click(); updateHover(); };
  const redo = () => { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); markDirty(); audio.click(); updateHover(); };
  $('ws-undo').onclick = undo;
  $('ws-redo').onclick = redo;
  $('ws-back').onclick = () => openGallery(vox.size ? entry?.id : null);
  $('ws-name').addEventListener('input', () => { if (entry) { entry.name = cleanName($('ws-name').value) || entry.name; markDirty(); } });
  $('ws-name').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.target.blur(); } });
  $('ws-name').addEventListener('blur', () => { if (entry && !cleanName($('ws-name').value)) $('ws-name').value = entry.name; });
  $('ws-play').onclick = () => {
    const b = blocker();
    if (b) { audio.wrong(); shake($('ws-play')); flash(b, 'warn'); return; }
    dirty = true;
    flushEditor();
    openPlaySheet(entry);
  };

  addEventListener('keydown', e => {
    if (ctx.overlays.length) return;
    const typing = e.target.closest?.('input, textarea');
    if (ctx.base === 'screen-ws' && e.code === 'Escape' && !typing) { e.preventDefault(); ctx.enterTitle(); return; }
    if (ctx.app !== 'editor' || typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
    if (mod && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (mod) return;
    if (e.code === 'Escape') { e.preventDefault(); $('ws-back').click(); }
    else if (e.code === 'Digit1' || e.code === 'KeyB') setTool('add');
    else if (e.code === 'Digit2' || e.code === 'KeyE') setTool('erase');
    else if (e.code === 'Digit3' || e.code === 'KeyP') setTool('paint');
    else if (e.code === 'KeyM') $('ws-mirror').click();
    else if (camCtl.keyDown(e)) { e.preventDefault(); camCtl.poke(); }
  }, true);
  addEventListener('keyup', e => camCtl.keyUp(e.code));
  addEventListener('blur', () => camCtl.clearKeys());

  // ---------- per-frame (main loop hands rendering to us while app === 'editor') ----------
  let pulse = 0;
  ctx.views.editor = dt => {
    pulse += dt;
    for (const m of popping) {
      m.userData.t = Math.min(1, m.userData.t + dt * 4.2);
      m.scale.setScalar(Math.max(0.01, easeBack(m.userData.t)));
      if (m.userData.t >= 1) { m.scale.setScalar(1); popping.delete(m); }
    }
    // floating (disconnected) blocks bob and blink so they are easy to spot
    const w = 0.18 + 0.18 * Math.sin(pulse * 6);
    for (const k in warnMats) warnMats[k].emissiveIntensity = w;
    if (comp.count > 1) for (const m of meshes.values()) if (m.userData.loose) m.position.y = m.userData.cell[1] * S + S / 2 + 0.05 + Math.sin(pulse * 4 + m.userData.cell[0]) * 0.05;
    edgeMat.opacity = 0.6 + 0.3 * Math.sin(pulse * 5);
    if (ctx.overlays.length) camCtl.clearKeys();
    // the ghost follows the view while the camera glides (inertia, keys, framing)
    if (camCtl.update(dt) && hoverXY && (!drag || drag.mode === 'tap' || drag.mode === 'held')) updateHover();
    sky.position.copy(cam.position);
    if (ring.visible) {
      ring.userData.t = Math.min(1, ring.userData.t + dt * 1.8);
      const u = ring.userData.t;
      ring.quaternion.copy(cam.quaternion);
      ring.scale.setScalar(0.6 + u * 1.4);
      ring.material.opacity = 1 - u;
      if (u >= 1) ring.visible = false;
    }
    ctx.renderer.render(es, cam);
  };
}
