// Things that live on the islands (see docs/design-notes.md, 2026-11-11): butterflies over the grass that scatter
// when you walk up, a few birds wheeling overhead, fish that jump out of the sea ahead of you, and shooting stars
// in the night worlds. All of it is scenery: nothing collides or can be clicked, and everything keeps near you
// as you walk the archipelago.
import * as THREE from 'three';
import { toon, LAYER_FX } from './render.js';

// per world: butterflies (how many, wing colours), birds (how many, colour, how much they glide, how high), fish
// (colour), stars (seconds between shooting stars)
const KIT = {
  meadow: { flutter: [10, [0xffd23f, 0xff8fc7, 0xffffff, 0x9b5de5, 0xff7a59]], birds: [5, 0x3d4a6b, 0.35, 15], fish: 0xffa24d },
  farm: { flutter: [9, [0xffffff, 0xffd23f, 0xff9f43]], birds: [5, 0x4a3f5c, 0.35, 15], fish: 0xffa24d },
  frost: { birds: [3, 0xffffff, 0.6, 13] },
  frostwood: { birds: [4, 0x4f4a66, 0.4, 14] },
  reef: { flutter: [5, [0xff8fc7, 0xffffff, 0x6ee7ff]], birds: [5, 0xffffff, 0.75, 13], fish: 0xff7a3c },
  cove: { birds: [6, 0xffffff, 0.75, 14], fish: 0xffd766 },
  starfall: { stars: [4, 9] },
  moon: { stars: [5, 11] },
  cliffs: { flutter: [7, [0xffffff, 0xffd23f, 0xff8fc7]], birds: [6, 0xffffff, 0.75, 16], fish: 0xf2f6ff },
  storm: { birds: [3, 0x2f2c44, 0.2, 12] },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

// one wing, flat, hinged along the body at x = 0 and reaching out along +x (the other wing is its mirror image)
function wingGeometry(pts) {
  const g = new THREE.BufferGeometry();
  const v = [];
  for (let k = 1; k < pts.length - 1; k++) v.push(pts[0][0], 0, pts[0][1], pts[k][0], 0, pts[k][1], pts[k + 1][0], 0, pts[k + 1][1]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// A pair of wings per flyer in one instanced mesh: instance 2k is flyer k's right wing, 2k + 1 its left.
class Wings {
  constructor(group, geo, n, material) {
    this.mesh = new THREE.InstancedMesh(geo, material, n * 2);
    this.mesh.layers.set(LAYER_FX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n * 2; i++) this.mesh.setMatrixAt(i, ZERO);
    group.add(this.mesh);
  }
  // pos, heading (yaw), nose up (pitch), bank (roll), how far the wings are raised, size
  set(k, pos, yaw, pitch, roll, raise, size) {
    _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
    for (const side of [1, -1]) {
      _q2.setFromAxisAngle(Z, raise * side).premultiply(_q);
      this.mesh.setMatrixAt(k * 2 + (side < 0 ? 1 : 0), _m.compose(pos, _q2, _s.set(size * side, size, size)));
    }
  }
  hide(k) { this.mesh.setMatrixAt(k * 2, ZERO); this.mesh.setMatrixAt(k * 2 + 1, ZERO); }
  done() { this.mesh.instanceMatrix.needsUpdate = true; }
}

// world: the island's (or archipelago's) api; quality: 'low' on phones
export function makeLife(scene, world, themeId, quality) {
  const K = KIT[themeId];
  if (!K) return null;
  const group = new THREE.Group();
  scene.add(group);
  const low = quality === 'low';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const land = (x, z) => world.walkSd(x, z) < -1 && world.floorAt(x, z) !== null;
  const updaters = [], shifters = [];
  const parts = {}; // what's here, for the debug tools and the tests: the butterflies' and birds' wings, the fish, the star

  // ---- butterflies: each keeps to a patch of ground near you, and moves off when you come close ----
  if (K.flutter) {
    const [count, colours] = K.flutter, n = low ? Math.ceil(count * 0.6) : count;
    // (fore wing and hind wing in one outline, a notch between them)
    const wings = new Wings(group, wingGeometry([[0, -0.03], [0.09, -0.13], [0.19, -0.11], [0.16, -0.02], [0.12, 0.02], [0.15, 0.09], [0.07, 0.12], [0, 0.05]]), n, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 0.022, 0.17), new THREE.MeshBasicMaterial({ color: 0x2a1f3d }), n);
    bodies.layers.set(LAYER_FX);
    bodies.frustumCulled = false;
    bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(bodies);
    const col = new THREE.Color();
    parts.flutter = wings.mesh;
    const flies = Array.from({ length: n }, (_, k) => {
      col.setHex(colours[k % colours.length]);
      wings.mesh.setColorAt(k * 2, col); wings.mesh.setColorAt(k * 2 + 1, col);
      return { home: new THREE.Vector3(), pos: new THREE.Vector3(), last: new THREE.Vector3(), yaw: 0, on: 0, lift: 0, live: false, ph: [rnd(0, 6), rnd(0, 6), rnd(0, 6), rnd(0, 6)], w: [rnd(0.5, 0.9), rnd(0.35, 0.7), rnd(0.9, 1.5)], r: rnd(1.2, 2.6), h: rnd(0.55, 1.3), size: rnd(0.65, 0.95) };
    });
    shifters.push(d => { for (const f of flies) { f.home.add(d); f.pos.add(d); f.last.add(d); } });
    const settle = (f, me) => {
      for (let tries = 0; tries < 8; tries++) {
        const a = rnd(0, Math.PI * 2), d = rnd(5, 21), x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d;
        if (!land(x, z)) continue;
        f.home.set(x, world.floorAt(x, z), z);
        f.live = true; f.on = 0; f.lift = 0;
        return;
      }
    };
    updaters.push((dt, t, me) => {
      for (let k = 0; k < n; k++) {
        const f = flies[k];
        const away = Math.hypot(f.home.x - me.x, f.home.z - me.z);
        if (!f.live || away > 30) {
          // out of sight behind you: move to a patch near where you are now (fading out first)
          f.on = Math.max(0, f.on - dt * 2);
          if (f.on <= 0) settle(f, me);
          if (!f.live) { wings.hide(k); bodies.setMatrixAt(k, ZERO); continue; }
        } else f.on = Math.min(1, f.on + dt * 1.5);
        const [a, b, c, d] = f.ph, [w1, w2, w3] = f.w;
        _p.set(
          f.home.x + Math.sin(t * w1 + a) * f.r + Math.sin(t * w3 + c) * 0.5,
          f.home.y + f.h + f.lift + Math.sin(t * w2 + b) * 0.3 + Math.abs(Math.sin(t * 11 + d)) * 0.05,
          f.home.z + Math.cos(t * w2 + b) * f.r + Math.cos(t * w3 + d) * 0.5,
        );
        // you came close: it climbs and its patch drifts away from you
        const near = Math.hypot(_p.x - me.x, _p.z - me.z);
        if (near < 2.4) {
          f.lift = Math.min(1.6, f.lift + dt * 2.2);
          const push = ((2.4 - near) / Math.max(near, 0.2)) * dt * 3;
          f.home.x += (_p.x - me.x) * push; f.home.z += (_p.z - me.z) * push;
        } else f.lift = Math.max(0, f.lift - dt * 0.4);
        const vx = _p.x - f.last.x, vz = _p.z - f.last.z;
        if (vx * vx + vz * vz > 1e-8) {
          let turn = Math.atan2(-vx, -vz) - f.yaw;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          f.yaw += turn * Math.min(1, dt * 8);
        }
        f.last.copy(_p);
        // a quick flutter with little rests in it
        const beat = Math.sin(t * 2.3 + d) > 0.75 ? 0.25 : Math.sin(t * 26 + a * 5);
        wings.set(k, _p, f.yaw, 0.25, 0, 0.45 + beat * 0.75, f.size * f.on);
        bodies.setMatrixAt(k, _m.compose(_p, _q, _s.setScalar(f.size * f.on)));
      }
      wings.done();
      bodies.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- birds: a loose ring wheeling over wherever you are ----
  if (K.birds) {
    const [count, colour, glide, height] = K.birds, n = low ? Math.ceil(count * 0.6) : count;
    const mat = new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide });
    const wings = new Wings(group, wingGeometry([[0, -0.12], [0.3, -0.13], [0.72, -0.02], [0.66, 0.05], [0.3, 0.1], [0, 0.13]]), n, mat);
    const bodies = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), mat, n);
    bodies.layers.set(LAYER_FX);
    bodies.frustumCulled = false;
    bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(bodies);
    parts.birds = wings.mesh;
    const centre = new THREE.Vector3(), dir = Math.random() < 0.5 ? 1 : -1;
    let placed = false;
    const birds = Array.from({ length: n }, (_, k) => ({ a: (k / n) * Math.PI * 2 + rnd(-0.5, 0.5), r: rnd(15, 27), h: height + rnd(-2, 4), sp: rnd(5.5, 7.5), ph: rnd(0, 6), size: rnd(0.85, 1.15) }));
    shifters.push(d => centre.add(d));
    updaters.push((dt, t, me) => {
      if (!placed) { centre.copy(me); placed = true; }
      centre.x += (me.x - centre.x) * Math.min(1, dt * 0.25); centre.z += (me.z - centre.z) * Math.min(1, dt * 0.25);
      for (let k = 0; k < n; k++) {
        const b = birds[k];
        b.a += (b.sp / b.r) * dt * dir;
        const r = b.r + Math.sin(t * 0.21 + b.ph) * 3;
        _p.set(centre.x + Math.cos(b.a) * r, b.h + Math.sin(t * 0.33 + b.ph) * 1.6, centre.z + Math.sin(b.a) * r);
        // flying along the ring, leaning into the turn; wings beat in bursts and glide in between
        const yaw = Math.atan2(Math.sin(b.a) * dir, -Math.cos(b.a) * dir);
        const gliding = Math.sin(t * 0.45 + b.ph * 3) < glide * 2 - 1;
        const raise = gliding ? 0.12 + Math.sin(t * 1.3 + b.ph) * 0.05 : Math.sin(t * 9.5 + b.ph) * 0.6 + 0.1;
        wings.set(k, _p, yaw, 0, -0.3 * dir, raise, b.size);
        _q.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
        bodies.setMatrixAt(k, _m.compose(_p, _q, _s.set(0.07 * b.size, 0.06 * b.size, 0.3 * b.size)));
      }
      wings.done();
      bodies.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- fish: now and then one jumps out of open water, more often than not where you're looking ----
  if (K.fish && world.hasSea !== false && world.voidY === undefined) {
    const seaY = world.seaY ?? -1.7;
    // (drawn without ink outlines: at 20 m they swallowed it)
    const body = new THREE.OctahedronGeometry(1).scale(0.13, 0.2, 0.46);
    const tail = wingGeometry([[0, 0.36], [0.2, 0.64], [-0.2, 0.64]]).rotateZ(Math.PI / 2);
    const mat = toon(K.fish);
    const ringGeo = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
    const fish = Array.from({ length: low ? 1 : 2 }, (_, k) => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, mat), tl = new THREE.Mesh(tail, new THREE.MeshBasicMaterial({ color: K.fish, side: THREE.DoubleSide }));
      b.layers.set(LAYER_FX); tl.layers.set(LAYER_FX);
      g.add(b, tl);
      g.visible = false;
      group.add(g);
      const rings = [0, 1].map(() => {
        const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: world.theme?.foam ?? 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
        r.layers.set(LAYER_FX);
        r.visible = false;
        group.add(r);
        return r;
      });
      return { g, tl, rings, wait: 2 + k * 3 + rnd(0, 3), u: -1, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 2, top: 1, dur: 0.9, ringT: [9, 9] };
    });
    parts.fish = fish.map(f => f.g);
    shifters.push(d => { for (const f of fish) { f.from.add(d); f.g.position.add(d); for (const r of f.rings) r.position.add(d); } });
    const splash = (f, i, at) => { const r = f.rings[i]; r.position.set(at.x, seaY + 0.06, at.z); r.visible = true; f.ringT[i] = 0; };
    updaters.push((dt, t, me, cam, onSplash) => {
      for (const f of fish) {
        for (let i = 0; i < 2; i++) {
          if (f.ringT[i] > 1) { f.rings[i].visible = false; continue; }
          f.ringT[i] += dt / 0.9;
          f.rings[i].scale.setScalar(0.25 + f.ringT[i] * 1.1);
          f.rings[i].material.opacity = 0.75 * (1 - f.ringT[i]);
        }
        if (f.u < 0) {
          if ((f.wait -= dt) > 0) continue;
          f.wait = rnd(2.5, 6);
          // the nearest open water in some direction (the way you're looking, more often than not), and a little
          // beyond: just off the shore you stand on, or beside the bridge you're crossing
          cam.getWorldDirection(_v);
          const a = Math.atan2(_v.z, _v.x) + (Math.random() < 0.75 ? rnd(-0.6, 0.6) : rnd(0, Math.PI * 2));
          let d = 3;
          while (d < 40 && world.walkSd(me.x + Math.cos(a) * d, me.z + Math.sin(a) * d) < 2.6) d += 1.5;
          d += rnd(0, 7);
          const x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d;
          if (d >= 40 || world.walkSd(x, z) < 2.6) { f.wait = 0.4; continue; }
          const th = rnd(0, Math.PI * 2);
          f.dir.set(Math.cos(th), 0, Math.sin(th));
          f.len = rnd(1.8, 2.8); f.top = rnd(0.9, 1.5); f.dur = 0.8 + f.top * 0.25;
          if (world.walkSd(x + f.dir.x * f.len, z + f.dir.z * f.len) < 1.5) { f.wait = 0.4; continue; }
          f.from.set(x, seaY - 0.1, z);
          f.u = 0; f.g.visible = true;
          splash(f, 0, f.from);
          onSplash?.(d);
        }
        f.u += dt / f.dur;
        const u = Math.min(1, f.u);
        f.g.position.copy(f.from).addScaledVector(f.dir, f.len * u).setY(f.from.y + 4 * f.top * u * (1 - u));
        // nose along the arc, with a wriggle in the tail
        _v.copy(f.dir).multiplyScalar(f.len).setY(4 * f.top * (1 - 2 * u));
        f.g.lookAt(_p.copy(f.g.position).sub(_v));
        f.tl.rotation.y = Math.sin(t * 30) * 0.5;
        if (f.u >= 1) { f.u = -1; f.g.visible = false; splash(f, 1, f.g.position); onSplash?.(Math.hypot(f.g.position.x - me.x, f.g.position.z - me.z)); }
      }
    });
  }

  // ---- shooting stars: a streak across the night sky every few seconds ----
  if (K.stars) {
    const [lo, hi] = K.stars;
    const geo = new THREE.PlaneGeometry(1, 1).translate(-0.5, 0, 0);
    const col = geo.attributes.position.array, alpha = [];
    for (let i = 0; i < col.length; i += 3) alpha.push(1, 1, 1, col[i] > -0.5 ? 1 : 0); // bright head, a tail that fades out
    geo.setAttribute('color', new THREE.Float32BufferAttribute(alpha, 4));
    const star = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff6d8, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    star.layers.set(LAYER_FX);
    star.frustumCulled = false;
    star.visible = false;
    star.renderOrder = -1;
    group.add(star);
    parts.star = star;
    let wait = rnd(2, 5), u = -1;
    const from = new THREE.Vector3(), vel = new THREE.Vector3();
    updaters.push((dt, t, me, cam) => {
      if (u < 0) {
        if ((wait -= dt) > 0) return;
        wait = rnd(lo, hi);
        // high in the part of the sky you're facing, falling across it
        cam.getWorldDirection(_v);
        const a = Math.atan2(_v.z, _v.x) + rnd(-0.9, 0.9), el = rnd(0.35, 0.95), d = 230;
        from.set(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d);
        const side = Math.random() < 0.5 ? 1 : -1;
        vel.set(-Math.sin(a) * side, -rnd(0.35, 0.8), Math.cos(a) * side).normalize().multiplyScalar(rnd(110, 160));
        u = 0; star.visible = true;
      }
      u += dt / 0.75;
      star.position.copy(cam.position).add(from).addScaledVector(vel, u * 0.75);
      // a streak along its path, turned to face you
      _v.copy(vel).normalize();
      _p.copy(star.position).sub(cam.position).normalize();
      const up = _p.clone().cross(_v).normalize(), n = _v.clone().cross(up);
      star.quaternion.setFromRotationMatrix(_m.makeBasis(_v, up, n));
      const k = Math.sin(Math.min(1, u) * Math.PI);
      star.scale.set(14 + k * 22, 0.9, 1);
      star.material.opacity = k * 0.9;
      if (u >= 1) { u = -1; star.visible = false; }
    });
  }

  return {
    group, parts,
    // me: where you are; cam: the camera; onSplash(distance): a fish broke the water that far away
    update(dt, t, me, cam, onSplash) { for (const f of updaters) f(dt, t, me, cam, onSplash); },
    // the scene moved (you walked onto another island): everything alive moves with it
    shift(d) { for (const f of shifters) f(d); },
    dispose() {
      scene.remove(group);
      group.traverse(o => { if (o.isInstancedMesh) o.dispose(); o.geometry?.dispose(); o.material?.dispose(); });
    },
  };
}
