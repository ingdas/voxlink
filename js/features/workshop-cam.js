// Workshop editor camera: damped orbit with inertia, zoom toward the cursor / pinch centre, pan in the
// view plane, auto-framing into the free screen area (between the toolbars), quarter-turn snaps, a top
// view, held-key control, and a "spring arm" that pushes the lens out of the figure so it never clips.
// Pure camera maths: workshop.js wires gestures, buttons, keys and picking to it.
import * as THREE from 'three';

const QUARTER = Math.PI / 2;
export const HOME_YAW = 0.62, HOME_PITCH = 0.5;
const PITCH_MIN = 0.06, PITCH_MAX = 1.5, TOP_PITCH = 1.5;
const DIST_MIN = 1.6, DIST_MAX = 20;
const RATE_DRAG = 22, RATE_WHEEL = 14, RATE_ANIM = 7; // smoothing speeds (1/s) of current -> goal
const clamp = THREE.MathUtils.clamp;

const KEY_YAW = { ArrowLeft: 1, KeyA: 1, ArrowRight: -1, KeyD: -1 };
const KEY_PITCH = { ArrowUp: 1, KeyW: 1, ArrowDown: -1, KeyS: -1 };
const KEY_ZOOM = { PageUp: -1, Equal: -1, NumpadAdd: -1, PageDown: 1, Minus: 1, NumpadSubtract: 1 };

/**
 * @param {object} o
 * @param {THREE.PerspectiveCamera} o.cam
 * @param {(x:number,y:number,z:number) => boolean} o.solidAt  world point inside a block?
 * @param {() => THREE.Box3|null} o.bounds  world box of the figure (null when empty)
 * @param {number} o.half  half size of the plate (pivot is clamped to it)
 * @param {() => {l:number,t:number,r:number,b:number}} o.freeRect  screen area not covered by UI
 * @param {(cx:number, cy:number) => THREE.Vector3|null} o.hitPoint  world point under a screen point
 * @param {() => void} [o.onChange]  view mode (top view) changed
 */
export function createEditorCam({ cam, solidAt, bounds, half, freeRect, hitPoint, onChange = () => {} }) {
  const cur = { yaw: HOME_YAW, pitch: HOME_PITCH, dist: 9, target: new THREE.Vector3(0, 0.5, 0) };
  const goal = { yaw: HOME_YAW, pitch: HOME_PITCH, dist: 9, target: new THREE.Vector3(0, 0.5, 0) };
  const vel = { yaw: 0, pitch: 0 };
  let rate = RATE_ANIM;
  let manual = false; // user moved the pivot (pan / zoom to cursor / focus): stop following the figure
  let zoomed = false; // user picked a distance: stop backing off as the figure grows
  let top = null; // { pitch } to return to when the top view is toggled off
  let orbiting = false, samples = [];
  let lastInput = 0;
  let pushed = 0; // spring-arm extra distance
  const held = new Set();
  let focal = 500, halfW = 300, halfH = 200, fovC = 42; // px focal length + free half-extent (canvas px)
  const lastCam = new THREE.Vector3(), lastQuat = new THREE.Quaternion();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const now = () => performance.now();

  const backOf = (yaw, pitch, out = new THREE.Vector3()) => {
    const cp = Math.cos(pitch);
    return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
  };
  const rightOf = (yaw, out = new THREE.Vector3()) => out.set(Math.cos(yaw), 0, -Math.sin(yaw));

  // ---------- viewport: put the projection centre in the middle of the free area ----------
  function resize() {
    const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
    let r = freeRect();
    if (!r || r.r - r.l < 80 || r.b - r.t < 80) r = { l: 0, t: 0, r: W, b: H };
    const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
    const fullW = W + 2 * Math.abs(cx - W / 2), fullH = H + 2 * Math.abs(cy - H / 2);
    fovC = W / H < 1 ? 56 : 42; // vertical fov of the canvas itself
    const tanC = Math.tan(THREE.MathUtils.degToRad(fovC) / 2);
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanC * fullH / H));
    cam.aspect = fullW / fullH;
    cam.setViewOffset(fullW, fullH, fullW / 2 - cx, fullH / 2 - cy, W, H);
    cam.updateProjectionMatrix();
    focal = H / 2 / tanC;
    halfW = Math.max(40, (r.r - r.l) / 2);
    halfH = Math.max(40, (r.b - r.t) / 2);
  }

  // ---------- framing ----------
  const emptyBox = () => new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 0.6, 3));
  function centreOf(box) { return box.getCenter(new THREE.Vector3()); }
  // smallest distance at which every corner of the box fits the free area (with a margin)
  function fitDist(yaw, pitch, box) {
    const back = backOf(yaw, pitch, v1), right = rightOf(yaw, v2), up = v3.crossVectors(back, right);
    const c = centreOf(box);
    let d = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const z = p.dot(back);
      d = Math.max(d, z + Math.abs(p.dot(right)) * focal * 1.15 / halfW, z + Math.abs(p.dot(up)) * focal * 1.15 / halfH);
    }
    return clamp(d, 4.5, DIST_MAX);
  }
  function frame({ home = false, snap = false } = {}) {
    if (home) { goal.yaw = nearestYaw(goal.yaw, HOME_YAW); goal.pitch = HOME_PITCH; setTop(null); }
    else if (!top) goal.pitch = clamp(goal.pitch, 0.3, 1.25); // no horizon-level or near-vertical re-frames
    const box = bounds() || emptyBox();
    goal.target.copy(centreOf(box));
    goal.dist = fitDist(goal.yaw, goal.pitch, box);
    manual = zoomed = false;
    stop();
    rate = RATE_ANIM;
    if (snap) { Object.assign(cur, { yaw: goal.yaw, pitch: goal.pitch, dist: goal.dist }); cur.target.copy(goal.target); pushed = 0; }
  }
  const framed = () => {
    const box = bounds() || emptyBox();
    return !manual && goal.target.distanceTo(centreOf(box)) < 0.05 && Math.abs(goal.dist - fitDist(goal.yaw, goal.pitch, box)) < 0.05;
  };
  // the yaw closest to `yaw` that equals `base` modulo a quarter turn
  const nearestYaw = (yaw, base) => base + Math.round((yaw - base) / QUARTER) * QUARTER;

  // ---------- limits ----------
  function clampGoal() {
    const box = bounds();
    goal.pitch = clamp(goal.pitch, PITCH_MIN, PITCH_MAX);
    goal.dist = clamp(goal.dist, DIST_MIN, DIST_MAX);
    goal.target.x = clamp(goal.target.x, -half, half);
    goal.target.z = clamp(goal.target.z, -half, half);
    goal.target.y = clamp(goal.target.y, 0, (box ? box.max.y : 0.6) + 0.6);
    if (top && goal.pitch < TOP_PITCH - 0.2) setTop(null);
  }
  function setTop(v) { const was = !!top; top = v; if (was !== !!top) onChange(); }

  // ---------- interaction ----------
  function stop() { // kill inertia; true if the view was still visibly spinning
    const fast = Math.abs(vel.yaw) > 0.7 || Math.abs(vel.pitch) > 0.5;
    vel.yaw = vel.pitch = 0;
    return fast;
  }
  function beginOrbit() { orbiting = true; samples = []; stop(); }
  function orbit(dx, dy) {
    const dyaw = -dx * 0.0085, dpitch = dy * 0.0065;
    goal.yaw += dyaw; goal.pitch += dpitch;
    clampGoal();
    rate = RATE_DRAG;
    const t = now();
    samples.push({ t, dyaw, dpitch });
    while (samples.length > 2 && t - samples[0].t > 90) samples.shift();
  }
  function endOrbit() {
    orbiting = false;
    const t = now();
    if (samples.length >= 2 && t - samples[samples.length - 1].t < 60) {
      const span = Math.max(16, t - samples[0].t) / 1000;
      const sy = samples.reduce((a, s) => a + s.dyaw, 0) / span, sp = samples.reduce((a, s) => a + s.dpitch, 0) / span;
      vel.yaw = Math.abs(sy) > 0.5 ? clamp(sy, -9, 9) : 0;
      vel.pitch = Math.abs(sp) > 0.5 ? clamp(sp, -4, 4) * 0.6 : 0;
    }
    samples = [];
  }
  function turn(dyaw) { goal.yaw += dyaw; rate = RATE_DRAG; }
  // drag in screen px: the point under the pivot follows the finger
  function pan(dx, dy) {
    const wpp = cur.dist / focal;
    const right = rightOf(cur.yaw, v1), up = v2.crossVectors(backOf(cur.yaw, cur.pitch, v3), right);
    goal.target.addScaledVector(right, -dx * wpp).addScaledVector(up, dy * wpp);
    manual = true;
    rate = RATE_DRAG;
    clampGoal();
  }
  // scale the distance by f, keeping the world point under (cx, cy) in place when zooming in;
  // zooming out drifts the pivot back to the figure so it can never get lost
  function zoomAt(cx, cy, f, smooth = RATE_WHEEL) {
    const d0 = goal.dist, d1 = clamp(d0 * f, DIST_MIN, DIST_MAX), s = d1 / d0;
    if (Math.abs(s - 1) < 1e-4) return;
    goal.dist = d1;
    zoomed = true;
    if (s < 1 && cx != null) {
      let p = hitPoint(cx, cy);
      if (!p) { // nothing under the cursor: use the plane through the pivot facing the camera
        const ray = rayAt(cx, cy), n = backOf(cur.yaw, cur.pitch, v1);
        const den = ray.direction.dot(n);
        if (Math.abs(den) > 1e-3) p = ray.origin.clone().addScaledVector(ray.direction, cur.target.clone().sub(ray.origin).dot(n) / den);
      }
      if (p) {
        const before = goal.target.clone();
        goal.target.sub(p).multiplyScalar(s).add(p);
        if (goal.target.distanceTo(before) > 0.005) manual = true;
      }
    } else if (s > 1 && manual) {
      const c = autoCentre();
      goal.target.sub(c).multiplyScalar(1 / s).add(c);
      if (goal.target.distanceTo(c) < 0.12) manual = false;
    }
    rate = Math.max(smooth, rate);
    clampGoal();
  }
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function rayAt(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, cam);
    return raycaster.ray;
  }
  function focus(p) {
    goal.target.copy(p);
    goal.dist = Math.min(goal.dist, 7.5);
    manual = true;
    stop();
    rate = RATE_ANIM;
    clampGoal();
  }
  // quarter turns land on the home angle (or on the grid axes in top view)
  function rotateQuarter(dir) {
    const base = top ? 0 : HOME_YAW;
    const n = (goal.yaw - base) / QUARTER;
    goal.yaw = base + (dir > 0 ? Math.floor(n + 1e-3) + 1 : Math.ceil(n - 1e-3) - 1) * QUARTER;
    stop();
    rate = RATE_ANIM;
  }
  function toggleTop() {
    if (top) { goal.pitch = top.pitch; setTop(null); }
    else {
      setTop({ pitch: goal.pitch < TOP_PITCH - 0.25 ? goal.pitch : HOME_PITCH });
      goal.pitch = TOP_PITCH;
      goal.yaw = nearestYaw(goal.yaw, 0);
    }
    if (!manual) { const box = bounds() || emptyBox(); goal.target.copy(centreOf(box)); goal.dist = fitDist(goal.yaw, goal.pitch, box); }
    stop();
    rate = RATE_ANIM;
  }
  function autoCentre() { const b = bounds(); return b ? centreOf(b) : new THREE.Vector3(0, 0.3, 0); }

  // ---------- keys (held: smooth continuous motion) ----------
  function keyDown(e) {
    const c = e.code;
    if (c === 'KeyF' || c === 'Home') { if (!e.repeat) frame({ home: c === 'Home' || framed() }); return true; }
    if (c === 'KeyT') { if (!e.repeat) toggleTop(); return true; }
    if (e.shiftKey && c in KEY_YAW) { if (!e.repeat) rotateQuarter(KEY_YAW[c]); return true; }
    if (c in KEY_YAW || c in KEY_PITCH || c in KEY_ZOOM) { held.add(c); stop(); return true; }
    return false;
  }
  function keyUp(code) { held.delete(code); }
  function clearKeys() { held.clear(); }

  // ---------- per frame ----------
  function blocked(p) {
    const r = 0.2;
    for (let i = 0; i < 8; i++) if (solidAt(p.x + (i & 1 ? r : -r), p.y + (i & 2 ? r : -r), p.z + (i & 4 ? r : -r))) return true;
    return false;
  }
  function update(dt) {
    const t = now();
    if (held.size) {
      let y = 0, p = 0, z = 0;
      for (const c of held) { y += KEY_YAW[c] || 0; p += KEY_PITCH[c] || 0; z += KEY_ZOOM[c] || 0; }
      goal.yaw += y * 2.1 * dt; goal.pitch += p * 1.3 * dt;
      if (z) zoomAt(null, null, Math.exp(z * 1.5 * dt));
      rate = RATE_WHEEL;
      clampGoal();
    }
    if (vel.yaw || vel.pitch) {
      goal.yaw += vel.yaw * dt; goal.pitch += vel.pitch * dt;
      const k = Math.exp(-dt * 3.6);
      vel.yaw *= k; vel.pitch *= k;
      if (Math.abs(vel.yaw) < 0.04) vel.yaw = 0;
      if (Math.abs(vel.pitch) < 0.04 || goal.pitch <= PITCH_MIN || goal.pitch >= PITCH_MAX) vel.pitch = 0;
      clampGoal();
    }
    // the pivot glides to the middle of the figure while you turn it, or once you pause building
    // (and backs off when the figure outgrows the view, unless you chose a zoom yourself)
    if (!manual && (orbiting || vel.yaw || held.size || t - lastInput > 1200)) {
      const f = 1 - Math.exp(-dt * 3);
      goal.target.lerp(autoCentre(), f);
      const box = bounds();
      if (!zoomed && box) { const need = fitDist(goal.yaw, goal.pitch, box); if (need > goal.dist + 0.01) goal.dist += (need - goal.dist) * f; }
      clampGoal();
    }
    const k = 1 - Math.exp(-dt * rate);
    cur.yaw += (goal.yaw - cur.yaw) * k;
    cur.pitch += (goal.pitch - cur.pitch) * k;
    cur.dist += (goal.dist - cur.dist) * k;
    cur.target.lerp(goal.target, k);
    // spring arm: slide the lens outward until it is clear of every block
    const back = backOf(cur.yaw, cur.pitch, v1);
    let need = 0;
    while (need < 12 && blocked(v2.copy(cur.target).addScaledVector(back, cur.dist + need))) need += 0.08;
    pushed = need >= pushed ? need : pushed + (need - pushed) * (1 - Math.exp(-dt * 10));
    cam.position.copy(cur.target).addScaledVector(back, cur.dist + pushed);
    cam.lookAt(cur.target);
    const moved = cam.position.distanceToSquared(lastCam) > 1e-8 || 1 - Math.abs(cam.quaternion.dot(lastQuat)) > 1e-9;
    lastCam.copy(cam.position); lastQuat.copy(cam.quaternion);
    return moved;
  }

  return {
    cam, resize, frame, framed, orbit, beginOrbit, endOrbit, turn, pan, zoomAt, focus, rotateQuarter, toggleTop, stop, update,
    keyDown, keyUp, clearKeys,
    poke() { lastInput = now(); },
    get top() { return !!top; },
    debug: () => ({ cur: { ...cur, target: cur.target.toArray() }, goal: { ...goal, target: goal.target.toArray() }, manual, top: !!top, vel: { ...vel }, pushed }),
  };
}
