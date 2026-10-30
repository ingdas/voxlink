// Kubo as a companion on the islands: the yellow Keeper cube floats beside you and does the talking himself.
// His lines and the tutorial coach appear in a speech bubble above his head; when he has something to say
// he drifts into view in front of you, otherwise he trails at your side. (Kubo's Garden keeps its own Kubo.)
// The bubble stays inside the screen (its tail still points at him); when he's out of view, or with reduced
// motion, it docks just above the backpack. Touches pass through the bubble (the thumb stick and buttons under it
// keep working); clicking the little Kubo in a docked bubble keeps the line up for another read (not on touch
// screens: there he sits right where the left thumb goes down for the stick). The bubble never covers what the
// player is looking for (the open bubbles on the figure, a nearby block that fits, the toast): it tries above his
// head, beside him on either side (up in the sky, or level with him) and docked, and takes the first spot that's
// clear. He hops on the first figure's links, and after a finished figure he flies ahead to the way on.
import { toon } from '../render.js';

let ctx, THREE;
let kubo = null; // { group, body, eyes, mouth, pos, ... }
let bubble, box, bubbleText, live;
let bark = '', barkLeft = 0, barkAge = 9, coachHtml = '', nudgeT = 0, hold = false, lastLevel = null, lastCoach = '';
let shown = false, lastSeq = -1, cheerT = 0, leadAt = null, lastPick = '';
const queue = []; // lines waiting their turn (each gets a fair read before the next)

// how long a line stays up: dense scripts (CJK, Thai) carry more per character
function readTime(msg) {
  let n = 0;
  for (const ch of msg.replace(/<[^>]+>/g, '')) n += ch.codePointAt(0) > 0x2e7f ? 2.6 : 1;
  return Math.min(13, 3.4 + n * 0.05);
}

export function init(c) {
  ctx = c; THREE = c.THREE;
  bubble = document.createElement('div');
  bubble.id = 'kubo-speech';
  bubble.className = 'kubo-speech';
  bubble.innerHTML = '<div class="ks-box"><div class="kubo mini"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div><div class="ks-text"></div></div>';
  box = bubble.querySelector('.ks-box');
  bubbleText = bubble.querySelector('.ks-text');
  document.getElementById('hud').appendChild(bubble);
  // tap the little Kubo (docked bubble) to keep the line up for another full read; queued lines wait for it
  const face = box.querySelector('.kubo.mini');
  face.addEventListener('pointerdown', e => { e.stopPropagation(); if (bark && (barkLeft > 0 || barkAge < 6)) { barkLeft = readTime(bark); barkAge = 0; hold = true; } });
  // screen readers hear Kubo's lines too
  live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);
  ctx.companion = {
    // only on an island, playing (not in menus, cutscenes, the Garden, the Keeper's Isle or the workshop); he hides
    // on his next frame there, but these places don't run his frames, so check now
    active: () => { if (shown && !wanted(ctx.game)) hide(); return shown; },
    // clear the current line (it no longer applies)
    hush() { barkLeft = 0; hold = false; },
    // a fresh start (a figure was just finished): drop whatever was waiting
    reset() { barkLeft = 0; hold = false; queue.length = 0; },
    say(msg, urgent = false) {
      if (!urgent && barkLeft > 0 && barkAge < Math.min(4, readTime(bark) * 0.8)) {
        if (queue.length < 3 && !queue.some(q => q.msg === msg) && msg !== bark) queue.push({ msg, at: performance.now() });
        return;
      }
      speak(msg);
    },
    coach(html) {
      coachHtml = html;
      // screen readers hear the tutorial steps too (once per step, not every progress tick)
      const plain = html.replace(/<span class="coach-bar">.*?<\/span>/g, '').replace(/<[^>]+>/g, '').trim();
      if (plain && plain !== lastCoach) { lastCoach = plain; live.textContent = plain; }
    },
    // a control that isn't unlocked yet: shake the bubble, wiggle Kubo
    nudge() { nudgeT = 0.45; box.classList.remove('nudge'); void box.offsetWidth; box.classList.add('nudge'); },
    // a hop and a spin (a link on the first figure)
    cheer() { cheerT = 0.7; },
    // fly ahead and wait there (the way on after a finished figure) until you come close; null: back to your side
    lead(pos) { leadAt = pos ? pos.clone() : null; },
  };
  ctx.hooks.frame.push((g, dt) => update(g, dt));
}

function speak(msg) { bark = msg; barkLeft = readTime(msg); barkAge = 0; hold = false; live.textContent = msg.replace(/<[^>]+>/g, ''); }

function build() {
  const g = new THREE.Group();
  const s = 0.56;
  const body = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), toon(0xffc93c));
  body.castShadow = true;
  g.add(body);
  const ink = toon(0x2a1f3d), white = toon(0xffffff), pink = toon(0xff8f8f);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.04), ink); e.position.set(sx * 0.13, 0.06, s / 2 + 0.01); body.add(e); eyes.push(e);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.02), white); w.position.set(sx * 0.13 - 0.017, 0.1, s / 2 + 0.035); body.add(w); eyes.push(w);
    const ck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), pink); ck.position.set(sx * 0.24, -0.06, s / 2 + 0.006); body.add(ck);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.03), ink); mouth.position.set(0, -0.1, s / 2 + 0.012); body.add(mouth);
  // a soft shadow under him (he hovers)
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), new THREE.MeshBasicMaterial({ color: 0x2a1f3d, transparent: true, opacity: 0.18, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  // optional cosmetics (star rewards) hang off the body
  const hats = new THREE.Group(); hats.position.y = s / 2; body.add(hats);
  return { group: g, body, eyes, mouth, ring, hats, hat: null, pos: new THREE.Vector3(), yaw: 0, blinkT: 2, t: 0, placed: false };
}

const forward = (yaw, out) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw));

const wanted = g => !!g.world && (g.mode === 'play' || g.mode === 'intro') && ['playing', 'intro', 'paused'].includes(ctx.app);

function update(g, dt) {
  if (!wanted(g)) { hide(); return; }
  if (!kubo) kubo = build();
  if (kubo.group.parent !== g.scene) { g.scene.add(kubo.group); kubo.placed = false; }
  ctx.dressKubo?.(kubo);
  kubo.group.visible = true;
  shown = true;
  document.body.classList.add('companion');
  const still = document.body.classList.contains('reduce-motion');

  barkLeft -= dt; barkAge += dt;
  // another island's lines don't carry over; waiting lines also go stale after a while (you've walked on)
  if (g.level !== lastLevel) { lastLevel = g.level; queue.length = 0; leadAt = null; }
  while (queue.length && performance.now() - queue[0].at > 9000) queue.shift();
  if (queue.length && (barkLeft <= 0 || (!hold && barkAge >= Math.min(4, readTime(bark) * 0.8)))) speak(queue.shift().msg);
  const pl = g.player;
  const talking = !!coachHtml || barkLeft > 0;
  // the scene shifted under us (walked onto another island): move along
  if (g.shiftSeq !== lastSeq) { if (g.shift && kubo.placed) kubo.pos.add(g.shift); lastSeq = g.shiftSeq; }
  // where to be: ahead of you and to the right while talking (well inside the view, which is narrow on a
  // phone held upright), beside you otherwise
  const fwd = forward(pl.yaw, new THREE.Vector3()), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const halfW = Math.tan(THREE.MathUtils.degToRad(g.camera.fov / 2)) * g.camera.aspect; // tan of half the horizontal view
  if (leadAt && Math.hypot(pl.pos.x - leadAt.x, pl.pos.z - leadAt.z) < 4) leadAt = null; // you caught up
  const desired = leadAt && !talking ? leadAt.clone()
    : pl.pos.clone().addScaledVector(fwd, talking ? 4.2 : 0.6).addScaledVector(right, talking ? Math.min(2.7, 4.2 * halfW * 0.62) : 2.3);
  // stay clear of the figure on its pedestal
  const fr = (g.footR || 3) + 0.8, dh = Math.hypot(desired.x, desired.z);
  if (dh < fr && Math.hypot(pl.pos.x, pl.pos.z) > fr) desired.multiplyScalar(fr / Math.max(dh, 0.01));
  const floor = g.world.floorAt?.(desired.x, desired.z);
  desired.y = Math.max(floor ?? pl.pos.y, pl.pos.y - 1) + 1.05;
  if (!kubo.placed || kubo.pos.distanceTo(desired) > 18) { kubo.pos.copy(desired); kubo.placed = true; }
  const k = 1 - Math.exp(-dt * (talking ? 3.2 : 2.4));
  const before = kubo.pos.clone();
  kubo.pos.lerp(desired, k);
  // never right in your face (or inside the camera)
  const ax = kubo.pos.x - pl.pos.x, az = kubo.pos.z - pl.pos.z, ad = Math.hypot(ax, az);
  if (ad < 1.8) { const s = 1.8 / Math.max(ad, 0.01); kubo.pos.x = pl.pos.x + ax * s; kubo.pos.z = pl.pos.z + az * s; }
  const speed = before.distanceTo(kubo.pos) / Math.max(dt, 1e-3);

  // bob, lean into the motion, look at you (calm with reduced motion)
  kubo.t += dt;
  nudgeT = Math.max(0, nudgeT - dt);
  cheerT = Math.max(0, cheerT - dt);
  const hopK = still ? 0 : cheerT / 0.7;
  const bob = (still ? 0 : Math.sin(kubo.t * 2.4) * 0.08) + Math.sin(hopK * Math.PI) * 0.45;
  kubo.group.position.set(kubo.pos.x, kubo.pos.y + bob, kubo.pos.z);
  const look = Math.atan2(pl.pos.x - kubo.pos.x, pl.pos.z - kubo.pos.z);
  let d = look - kubo.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  kubo.yaw += d * Math.min(1, dt * 5);
  const wiggle = nudgeT > 0 ? Math.sin(nudgeT * 40) * 0.25 * (nudgeT / 0.45) : 0;
  const spin = hopK > 0 ? (1 - hopK) * Math.PI * 2 : 0;
  kubo.body.rotation.set(still ? 0 : Math.min(0.35, speed * 0.04), kubo.yaw + wiggle + spin, still ? 0 : Math.sin(kubo.t * 1.3) * 0.05);
  kubo.ring.position.y = (floor ?? kubo.pos.y - 1.05) - kubo.pos.y - bob + 0.03;
  kubo.ring.visible = floor !== null && floor !== undefined;
  // blink now and then, chatter while a line is fresh
  kubo.blinkT -= dt;
  const blink = kubo.blinkT < 0.12 ? 0.15 : 1;
  if (kubo.blinkT < 0) kubo.blinkT = 2.5 + Math.random() * 3;
  for (const e of kubo.eyes) e.scale.y = blink;
  const chatter = barkAge < 1.6 || (coachHtml && kubo.t % 4 < 1.2) ? Math.abs(Math.sin(kubo.t * 14)) : 0;
  kubo.mouth.scale.set(1, 1 + chatter * 2.5, 1);

  placeBubble(g, talking ? (barkLeft > 0 ? bark : coachHtml) : '', still);
}

// what his bubble mustn't cover: the open bubbles on the figure, the blocks that fit nearby (what he's usually
// talking about) and the toast
const _v = {};
function keepClear(g, W, H) {
  const pts = [], rects = [];
  const v = _v.v || (_v.v = new THREE.Vector3());
  const add = (pos, r) => {
    v.copy(pos).applyMatrix4(g.camera.matrixWorldInverse);
    if (v.z > -0.1) return; // behind you
    v.copy(pos).project(g.camera);
    if (Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
    pts.push({ x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, r });
  };
  const cam = g.camera.position;
  for (const sk of g.sockets?.values() || []) if (sk.sprite.position.distanceToSquared(cam) < 900) add(sk.sprite.position, 26);
  for (const vx of g.voxels || []) if (vx.state === 'loose' && g.sockets.has(vx.i) && vx.mesh.position.distanceToSquared(cam) < 81) add(vx.mesh.position, 36);
  const toast = document.getElementById('toast');
  if (toast?.classList.contains('show')) { const r = toast.getBoundingClientRect(); if (r.width) rects.push(r); }
  return { pts, rects };
}
const covers = (c, k) => k.pts.filter(p => p.x > c.l - p.r && p.x < c.r + p.r && p.y > c.t - p.r && p.y < c.b + p.r).length
  + k.rects.filter(r => r.left < c.r && r.right > c.l && r.top < c.b && r.bottom > c.t).length;

function placeBubble(g, html, still) {
  if (!html) { bubble.classList.remove('show'); lastPick = ''; return; }
  if (bubbleText.innerHTML !== html) bubbleText.innerHTML = html;
  bubble.classList.add('show');
  const W = innerWidth, H = innerHeight;
  const head = new THREE.Vector3(kubo.group.position.x, kubo.group.position.y + 0.5, kubo.group.position.z);
  const view = head.clone().applyMatrix4(g.camera.matrixWorldInverse);
  const p = head.project(g.camera);
  const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
  const r = box.getBoundingClientRect(), bw = r.width || 300, bh = r.height || 60;
  const topLimit = (document.getElementById('needs')?.getBoundingClientRect().bottom || 108) + 8; // clear of the top HUD
  const pack = document.querySelector('.pack-wrap')?.getBoundingClientRect();
  const reb = document.getElementById('btn-rebuild');
  const under = reb?.classList.contains('show') ? reb.getBoundingClientRect() : pack;
  const dockBottom = Math.round(under && under.height ? H - under.top + 12 : H < 520 ? 18 : 150);
  const floorY = pack?.height ? pack.top - 8 : H - 60;
  // the spots he can talk from, in order of preference: above his head when the whole box fits there; beside
  // him, on the side with more room first, up in the sky or level with him (landscape phones: the top HUD leaves
  // no room above); docked above the backpack
  const spots = [];
  const onScreen = !still && view.z < 0 && x > 20 && x < W - 20;
  if (onScreen && y - bh - 18 > topLimit && y < H - 40) {
    const cx = Math.min(W - bw / 2 - 10, Math.max(bw / 2 + 10, x));
    spots.push({ key: 'above', cx, y, l: cx - bw / 2, r: cx + bw / 2, t: y - 16 - bh, b: y - 16 });
  }
  if (onScreen) {
    const mid = new THREE.Vector3(kubo.group.position.x, kubo.group.position.y, kubo.group.position.z).project(g.camera);
    const half = Math.abs(new THREE.Vector3(0.36, 0, 0).applyQuaternion(g.camera.quaternion).add(kubo.group.position).project(g.camera).x - mid.x) * 0.5 * W;
    const mx = (mid.x * 0.5 + 0.5) * W, my = (-mid.y * 0.5 + 0.5) * H;
    const first = mx > W / 2 ? -1 : 1;
    for (const level of [topLimit + bh / 2, Math.min(floorY - bh / 2, Math.max(topLimit + bh / 2, my))]) {
      for (const side of [first, -first]) {
        const sx = mx + side * (half + 14);
        const room = side < 0 ? sx - 10 : W - 10 - sx;
        if (room < bw || level + bh / 2 > floorY) continue;
        const key = `side${side}:${Math.round(level)}`;
        if (spots.some(s => s.key === key)) continue;
        spots.push({ key, side, sx, sy: level, l: side < 0 ? sx - bw : sx, r: side < 0 ? sx : sx + bw, t: level - bh / 2, b: level + bh / 2 });
      }
    }
  }
  // docked: in the middle, or at either edge (with his little face, so it's still him talking)
  for (const [key, l] of [['dock', W / 2 - bw / 2], ['dock-l', 12], ['dock-r', W - 12 - bw]]) spots.push({ key, l, r: l + bw, t: H - dockBottom - bh, b: H - dockBottom });
  // the first spot that covers nothing (staying put while the current one does, so it doesn't hop about);
  // if every spot covers something, the one that covers least
  const clear = keepClear(g, W, H);
  for (const s of spots) s.hits = covers(s, clear);
  const keep = spots.find(s => s.key === lastPick && !s.hits);
  const pick = keep || spots.find(s => !s.hits) || spots.reduce((a, b) => (b.hits < a.hits ? b : a));
  lastPick = pick.key;
  const side = pick.side || 0, fits = pick.key === 'above';
  bubble.classList.toggle('docked', pick.key.startsWith('dock'));
  bubble.classList.toggle('dock-l', pick.key === 'dock-l');
  bubble.classList.toggle('dock-r', pick.key === 'dock-r');
  bubble.classList.toggle('side-l', side < 0);
  bubble.classList.toggle('side-r', side > 0);
  if (side) {
    bubble.style.transform = `translate(${Math.round(pick.sx)}px, ${Math.round(pick.sy)}px)`;
    box.style.setProperty('--tail', '0px');
  } else if (fits) {
    bubble.style.transform = `translate(${Math.round(pick.cx)}px, ${Math.round(pick.y)}px)`;
    box.style.setProperty('--tail', `${Math.round(Math.max(-bw / 2 + 22, Math.min(bw / 2 - 22, x - pick.cx)))}px`);
  } else {
    // just above the backpack (or the Rebuild button while roaming)
    bubble.style.transform = '';
    box.style.setProperty('--tail', '0px');
    bubble.style.setProperty('--dock-bottom', `${dockBottom}px`);
  }
}

function hide() {
  if (!shown && !kubo?.group.visible) return;
  shown = false;
  queue.length = 0;
  document.body.classList.remove('companion');
  bubble.classList.remove('show');
  if (kubo) { kubo.group.visible = false; kubo.placed = false; }
  leadAt = null;
}
