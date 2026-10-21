// Kubo as a companion on the islands: the yellow Keeper cube floats beside you and does the talking himself.
// His lines and the tutorial coach appear in a speech bubble above his head; when he has something to say
// he drifts into view in front of you, otherwise he trails at your side. (Kubo's Garden keeps its own Kubo.)
// The bubble stays inside the screen (its tail still points at him); when he's out of view, or with reduced
// motion, it docks: above the backpack, or under the top HUD on short landscape screens.
import { toon } from '../render.js';

let ctx, THREE;
let kubo = null; // { group, body, eyes, mouth, pos, ... }
let bubble, box, bubbleText, live;
let bark = '', barkLeft = 0, barkAge = 9, coachHtml = '', nudgeT = 0;
let shown = false, lastSeq = -1;
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
  // tap the bubble to keep the line up a little longer (a re-read)
  box.style.pointerEvents = 'auto';
  box.addEventListener('pointerdown', e => { e.stopPropagation(); if (barkLeft > 0 || barkAge < 6) { barkLeft = readTime(bark); barkAge = Math.min(barkAge, 2); } });
  // screen readers hear Kubo's lines too
  live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);
  ctx.companion = {
    // only on an island, playing (not in menus, cutscenes, the garden or the workshop)
    active: () => shown,
    say(msg, urgent = false) {
      if (!urgent && barkLeft > 0 && barkAge < Math.min(4, readTime(bark) * 0.8)) {
        if (queue.length < 3 && !queue.some(q => q.msg === msg) && msg !== bark) queue.push({ msg, at: performance.now() });
        return;
      }
      speak(msg);
    },
    coach(html) { coachHtml = html; },
    // a control that isn't unlocked yet: shake the bubble, wiggle Kubo
    nudge() { nudgeT = 0.45; box.classList.remove('nudge'); void box.offsetWidth; box.classList.add('nudge'); },
  };
  ctx.hooks.frame.push((g, dt) => update(g, dt));
}

function speak(msg) { bark = msg; barkLeft = readTime(msg); barkAge = 0; live.textContent = msg.replace(/<[^>]+>/g, ''); }

function build() {
  const g = new THREE.Group();
  const s = 0.66;
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

function update(g, dt) {
  const app = ctx.app;
  const want = !!g.world && (g.mode === 'play' || g.mode === 'intro') && (app === 'playing' || app === 'intro' || app === 'paused');
  if (!want) { hide(); return; }
  if (!kubo) kubo = build();
  if (kubo.group.parent !== g.scene) { g.scene.add(kubo.group); kubo.placed = false; }
  ctx.dressKubo?.(kubo);
  kubo.group.visible = true;
  shown = true;
  document.body.classList.add('companion');
  const still = document.body.classList.contains('reduce-motion');

  barkLeft -= dt; barkAge += dt;
  // waiting lines go stale after a while (you've walked on)
  while (queue.length && performance.now() - queue[0].at > 9000) queue.shift();
  if (queue.length && (barkLeft <= 0 || barkAge >= Math.min(4, readTime(bark) * 0.8))) speak(queue.shift().msg);
  const pl = g.player;
  const talking = !!coachHtml || barkLeft > 0;
  // the scene shifted under us (walked onto another island): move along
  if (g.shiftSeq !== lastSeq) { if (g.shift && kubo.placed) kubo.pos.add(g.shift); lastSeq = g.shiftSeq; }
  // where to be: ahead of you and to the right while talking, beside you otherwise
  const fwd = forward(pl.yaw, new THREE.Vector3()), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const desired = pl.pos.clone().addScaledVector(fwd, talking ? 3.4 : 0.3).addScaledVector(right, talking ? 2.3 : 1.9);
  // stay clear of the figure on its pedestal
  const fr = (g.footR || 3) + 0.8, dh = Math.hypot(desired.x, desired.z);
  if (dh < fr && Math.hypot(pl.pos.x, pl.pos.z) > fr) desired.multiplyScalar(fr / Math.max(dh, 0.01));
  const floor = g.world.floorAt?.(desired.x, desired.z);
  desired.y = Math.max(floor ?? pl.pos.y, pl.pos.y - 1) + 1.05;
  if (!kubo.placed || kubo.pos.distanceTo(desired) > 18) { kubo.pos.copy(desired); kubo.placed = true; }
  const k = 1 - Math.exp(-dt * (talking ? 3.2 : 2.4));
  const before = kubo.pos.clone();
  kubo.pos.lerp(desired, k);
  const speed = before.distanceTo(kubo.pos) / Math.max(dt, 1e-3);

  // bob, lean into the motion, look at you (calm with reduced motion)
  kubo.t += dt;
  nudgeT = Math.max(0, nudgeT - dt);
  const bob = still ? 0 : Math.sin(kubo.t * 2.4) * 0.08;
  kubo.group.position.set(kubo.pos.x, kubo.pos.y + bob, kubo.pos.z);
  const look = Math.atan2(pl.pos.x - kubo.pos.x, pl.pos.z - kubo.pos.z);
  let d = look - kubo.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  kubo.yaw += d * Math.min(1, dt * 5);
  const wiggle = nudgeT > 0 ? Math.sin(nudgeT * 40) * 0.25 * (nudgeT / 0.45) : 0;
  kubo.body.rotation.set(still ? 0 : Math.min(0.35, speed * 0.04), kubo.yaw + wiggle, still ? 0 : Math.sin(kubo.t * 1.3) * 0.05);
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

function placeBubble(g, html, still) {
  if (!html) { bubble.classList.remove('show'); return; }
  if (bubbleText.innerHTML !== html) bubbleText.innerHTML = html;
  bubble.classList.add('show');
  const W = innerWidth, H = innerHeight;
  const head = new THREE.Vector3(kubo.group.position.x, kubo.group.position.y + 0.5, kubo.group.position.z);
  const view = head.clone().applyMatrix4(g.camera.matrixWorldInverse);
  const p = head.project(g.camera);
  const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
  const r = box.getBoundingClientRect(), bw = r.width || 300, bh = r.height || 60;
  const topLimit = 108; // clear of the top HUD (progress pill, bubbles row)
  // pinned above his head when there's room for the whole box; otherwise docked
  const fits = !still && view.z < 0 && x > 20 && x < W - 20 && y - bh - 18 > topLimit && y < H - 40;
  bubble.classList.toggle('docked', !fits);
  if (fits) {
    const cx = Math.min(W - bw / 2 - 10, Math.max(bw / 2 + 10, x));
    bubble.style.transform = `translate(${Math.round(cx)}px, ${Math.round(y)}px)`;
    box.style.setProperty('--tail', `${Math.round(Math.max(-bw / 2 + 22, Math.min(bw / 2 - 22, x - cx)))}px`);
    bubble.classList.remove('dock-top');
  } else {
    bubble.style.transform = '';
    box.style.setProperty('--tail', '0px');
    // short landscape screens: under the top HUD; otherwise just above the backpack
    const top = H < 520 && W > H;
    bubble.classList.toggle('dock-top', top);
    if (!top) {
      const pack = document.querySelector('.pack-wrap')?.getBoundingClientRect();
      bubble.style.setProperty('--dock-bottom', `${Math.round(pack && pack.height ? H - pack.top + 12 : 150)}px`);
    }
  }
}

function hide() {
  if (!shown && !kubo?.group.visible) return;
  shown = false;
  queue.length = 0;
  document.body.classList.remove('companion');
  bubble.classList.remove('show');
  if (kubo) { kubo.group.visible = false; kubo.placed = false; }
}
