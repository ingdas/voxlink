// Kubo as a companion on the islands: the yellow Keeper cube floats beside you and does the talking himself.
// His lines and the tutorial coach appear in a speech bubble above his head; when he has something to say
// he drifts into view in front of you, otherwise he trails at your side. (Kubo's Garden keeps its own Kubo.)
import { toon } from '../render.js';

let ctx, THREE;
let kubo = null; // { group, body, eyes, mouth, pos, vel, ... }
let bubble, bubbleText;
let bark = '', barkAt = 0, barkUntil = 0, coachHtml = '';
let shown = false, lastSeq = -1;

export function init(c) {
  ctx = c; THREE = c.THREE;
  bubble = document.createElement('div');
  bubble.id = 'kubo-speech';
  bubble.className = 'kubo-speech';
  bubble.innerHTML = '<div class="ks-box"><div class="kubo mini"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div><div class="ks-text"></div></div>';
  bubbleText = bubble.querySelector('.ks-text');
  document.getElementById('hud').appendChild(bubble);
  ctx.companion = {
    // only on an island, playing (not in menus, cutscenes, the garden or the workshop)
    active: () => shown,
    say(msg) { bark = msg; barkAt = performance.now(); barkUntil = barkAt + Math.min(9000, 3200 + msg.replace(/<[^>]+>/g, '').length * 45); },
    coach(html) { coachHtml = html; },
  };
  ctx.hooks.frame.push((g, dt) => update(g, dt));
}

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
  // a soft glow ring under him (he hovers)
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), new THREE.MeshBasicMaterial({ color: 0x2a1f3d, transparent: true, opacity: 0.18, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  return { group: g, body, eyes, mouth, ring, pos: new THREE.Vector3(), yaw: 0, blinkT: 2, t: 0, placed: false };
}

const forward = (yaw, out) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw));

function update(g, dt) {
  const app = ctx.app;
  const want = !!g.world && (g.mode === 'play' || g.mode === 'intro') && (app === 'playing' || app === 'intro' || app === 'paused') && !g.level?.museum;
  if (!want) { hide(g); return; }
  if (!kubo) kubo = build();
  if (kubo.group.parent !== g.scene) { g.scene.add(kubo.group); kubo.placed = false; }
  kubo.group.visible = true;
  shown = true;
  document.body.classList.add('companion');

  const pl = g.player, now = performance.now();
  const talking = !!coachHtml || now < barkUntil;
  // the scene shifted under us (walked onto another island): move along
  if (g.shiftSeq !== lastSeq) { if (g.shift && kubo.placed) kubo.pos.add(g.shift); lastSeq = g.shiftSeq; }
  // where to be: in front of you (a little to the right) while talking, beside you otherwise
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

  // bob, lean into the motion, look at you
  kubo.t += dt;
  const bob = Math.sin(kubo.t * 2.4) * 0.08;
  kubo.group.position.set(kubo.pos.x, kubo.pos.y + bob, kubo.pos.z);
  const look = Math.atan2(pl.pos.x - kubo.pos.x, pl.pos.z - kubo.pos.z);
  let d = look - kubo.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  kubo.yaw += d * Math.min(1, dt * 5);
  kubo.body.rotation.set(Math.min(0.35, speed * 0.04), kubo.yaw, Math.sin(kubo.t * 1.3) * 0.05);
  kubo.ring.position.y = (floor ?? kubo.pos.y - 1.05) - kubo.pos.y - bob + 0.03;
  kubo.ring.visible = floor !== null && floor !== undefined;
  // blink now and then, chatter while a line is fresh
  kubo.blinkT -= dt;
  const blink = kubo.blinkT < 0.12 ? 0.15 : 1;
  if (kubo.blinkT < 0) kubo.blinkT = 2.5 + Math.random() * 3;
  for (const e of kubo.eyes) e.scale.y = blink;
  // the mouth chatters for the first moments of a new line
  const chatter = now - barkAt < 1600 || (coachHtml && kubo.t % 4 < 1.2) ? Math.abs(Math.sin(kubo.t * 14)) : 0;
  kubo.mouth.scale.set(1, 1 + chatter * 2.5, 1);

  placeBubble(g, talking ? (now < barkUntil ? bark : coachHtml) : '');
}

function placeBubble(g, html) {
  if (!html) { bubble.classList.remove('show'); return; }
  if (bubbleText.innerHTML !== html) bubbleText.innerHTML = html;
  bubble.classList.add('show');
  const head = new THREE.Vector3(kubo.group.position.x, kubo.group.position.y + 0.5, kubo.group.position.z);
  const view = head.clone().applyMatrix4(g.camera.matrixWorldInverse);
  const p = head.project(g.camera);
  const W = innerWidth, H = innerHeight;
  const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
  const onScreen = view.z < 0 && x > 60 && x < W - 60 && y > 120 && y < H - 60;
  bubble.classList.toggle('docked', !onScreen);
  bubble.style.transform = onScreen ? `translate(${Math.round(x)}px, ${Math.round(y)}px)` : '';
}

function hide(g) {
  if (!shown && !kubo?.group.visible) return;
  shown = false;
  document.body.classList.remove('companion');
  bubble.classList.remove('show');
  if (kubo) { kubo.group.visible = false; kubo.placed = false; }
}
