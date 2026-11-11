// Sparks of the Keeper's Lantern: three lights the storm blew onto every figure's island (see docs/design-notes.md,
// 2026-11-11). Up to two float over high spots you can get onto (a terrace you jump up, a hay stack its trampoline
// throws you onto, a rock stack), one out on
// the far side of the island, and where there's only one high spot the third hangs in the air, a jump up. Catching
// one charges the magnet for this run, and counts towards the island's three for good.
import * as THREE from 'three';
import { toon, LAYER_OVERLAY } from './render.js';
import { glows } from './looks.js';
import { sharedDot } from './world-kit.js';
import { GRAVITY, JUMP_V } from './player.js';
import { mulberry32 } from './voxels.js';

export const SPARKS = 3;
export const HOP_SPARKS = 10; // sparks (anywhere) that earn Kubo's lift, the hop in mid-air
const HOVER = 1.05; // metres a spark floats over the ground or the top it's on
const CATCH = 0.95; // caught within this far of you (anywhere from your feet to your head)
const BODY = 1.7;

// Where an island's sparks float: the same spots every time (seeded), so the ones you've caught stay caught.
// `world` is the island's api (an archipelago's answers for its active island, in the scene's coordinates).
export function sparkSpots(world, seed, footR) {
  const rng = mulberry32(seed);
  const R = world.R;
  const apex = (JUMP_V * JUMP_V) / (2 * GRAVITY * (world.gravityScale ?? 1));
  const reach = Math.min(apex * 0.85, 2.6); // the highest ledge a jump gets you onto
  // ground you can stand on (nothing built on it), or null
  const ground = (x, z) => {
    const f = world.floorAt(x, z);
    return f !== null && world.walkSd(x, z) < -0.3 && world.heightAt(x, z) <= f + 0.05 ? f : null;
  };
  const mid = t => ({ x: (t.box.min.x + t.box.max.x) / 2, z: (t.box.min.z + t.box.max.z) / 2 });
  const gap = (a, b) => Math.hypot(Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x), Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z));
  // tops with room to stand on and nothing over their middle
  const tops = world.tops.filter(t => {
    const m = mid(t);
    return Math.min(t.box.max.x - t.box.min.x, t.box.max.z - t.box.min.z) >= 0.8 && world.heightAt(m.x, m.z) <= t.y + 0.05;
  });
  // the ones you can get up onto: a jump from the ground beside them or from a top you can already reach…
  const beside = t => {
    const b = t.box, o = 0.55, pts = [];
    for (let k = 0; k <= 4; k++) {
      const x = b.min.x + ((b.max.x - b.min.x) * k) / 4, z = b.min.z + ((b.max.z - b.min.z) * k) / 4;
      pts.push([x, b.min.z - o], [x, b.max.z + o], [b.min.x - o, z], [b.max.x + o, z]);
    }
    return pts;
  };
  // …or a bounce pad throws you onto (a hay trampoline, a giant clam, a jump pad)
  const lands = (world.pads || []).map(p => ({ x: p.x + p.vel.x * p.t, z: p.z + p.vel.z * p.t }));
  const up = new Set(tops.filter(t => lands.some(l => l.x > t.box.min.x - 0.2 && l.x < t.box.max.x + 0.2 && l.z > t.box.min.z - 0.2 && l.z < t.box.max.z + 0.2)));
  for (let grew = true; grew;) {
    grew = false;
    for (const t of tops) {
      if (up.has(t)) continue;
      const fromGround = beside(t).some(([x, z]) => { const g = ground(x, z); return g !== null && t.y - g <= reach; });
      if (fromGround || [...up].some(u => t.y - u.y <= reach && u.y - t.y < 3 && gap(t.box, u.box) < 0.9)) { up.add(t); grew = true; }
    }
  }

  const spots = [];
  const apart = (x, z, d) => spots.every(s => Math.hypot(s.x - x, s.z - z) > d);
  // up high: the highest tops first, well apart
  const high = [...up].filter(t => t.y >= 0.85).sort((a, b) => b.y - a.y || mid(a).x - mid(b).x || mid(a).z - mid(b).z);
  for (const t of high) {
    if (spots.length >= SPARKS - 1) break;
    const m = mid(t);
    if (apart(m.x, m.z, 7)) spots.push({ x: m.x, y: t.y + HOVER, z: m.z, kind: 'high' });
  }
  // the rest over open ground, as far from each other and from where you come in as the island allows
  const a0 = Math.PI / 2 - (world.spin || 0), rs = Math.min(R - 3, 9);
  const entry = { x: Math.cos(a0) * rs, z: Math.sin(a0) * rs };
  const r0 = Math.max(footR + 3.5, R * 0.45);
  while (spots.length < SPARKS) {
    let best = null, bestD = 0;
    for (let k = 0; k < 220; k++) {
      const th = rng() * Math.PI * 2, r = r0 + rng() * Math.max(0, R * 0.9 - r0);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (!world.isFreeGround(x, z, 0.5)) continue;
      const d = Math.min(Math.hypot(x - entry.x, z - entry.z), ...spots.map(s => Math.hypot(s.x - x, s.z - z)));
      if (d > bestD) { bestD = d; best = { x, z }; }
    }
    if (!best) break;
    const g = world.groundY(best.x, best.z);
    // the last one, on an island with a single high spot (or none): in the air, a jump up
    const leap = spots.length === SPARKS - 1 && spots.filter(s => s.kind === 'high').length < 2;
    spots.push({ x: best.x, y: g + (leap ? BODY + CATCH + apex * 0.4 : HOVER), z: best.z, kind: leap ? 'leap' : 'far' });
  }
  return spots;
}

// a little star with six points: three stretched octahedra
let starGeo = null;
function starGeometry() {
  if (starGeo) return starGeo;
  const arms = [[0.1, 0.4, 0.1], [0.3, 0.1, 0.1], [0.1, 0.1, 0.3]].map(s => new THREE.OctahedronGeometry(1).scale(...s));
  const pos = new Float32Array(arms.reduce((n, g) => n + g.attributes.position.array.length, 0));
  let o = 0;
  for (const g of arms) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; g.dispose(); }
  starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.computeVertexNormals();
  return starGeo;
}

const easeBack = t => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// The lights themselves. gone: bits of the sparks that aren't here (caught this run, or found before on an island
// you only walk); pale: bits of the ones found before (they still charge the magnet, in a paler light).
export class Sparks {
  constructor(scene, spots, { gone = 0, pale = 0 } = {}) {
    this.scene = scene;
    this.spots = spots;
    this.group = new THREE.Group();
    this.items = spots.map((s, k) => {
      const old = !!(pale & (1 << k));
      const star = new THREE.Mesh(starGeometry(), toon(old ? 0xcfe6ff : 0xffd23f, { emissive: old ? 0x6f9fd8 : 0xff9d00, emissiveIntensity: 0.55 }));
      glows(star);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedDot(), color: old ? 0xbfe0ff : 0xffdf80, transparent: true, opacity: 0.26, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.layers.set(LAYER_OVERLAY);
      halo.scale.setScalar(1.5);
      const g = new THREE.Group();
      g.add(star, halo);
      g.position.set(s.x, s.y, s.z);
      g.visible = !(gone & (1 << k));
      this.group.add(g);
      return { k, g, star, halo, live: g.visible, born: 0.35 + k * 0.22, caught: -1, from: new THREE.Vector3(), ph: k * 2.1, twinkle: Math.random() };
    });
    scene.add(this.group);
  }

  // the figure is finished: the ones found before go, the ones never found stay for you to find
  drop(mask) { for (const it of this.items) if (mask & (1 << it.k) && it.caught < 0) { it.live = false; it.g.visible = false; } }

  // player: null while nobody can catch them (the celebration, a cutscene); onCatch(k), sparkle(pos)
  update(dt, t, player, onCatch, sparkle) {
    for (const it of this.items) {
      if (!it.g.visible) continue;
      const s = this.spots[it.k];
      it.born = Math.max(-1, it.born - dt);
      const grow = it.born > 0 ? 0 : easeBack(Math.min(1, -it.born / 0.45));
      it.star.rotation.y = t * 1.6 + it.ph;
      it.star.rotation.z = Math.sin(t * 1.1 + it.ph) * 0.25;
      const pulse = 1 + Math.sin(t * 3.2 + it.ph) * 0.08;
      if (it.caught >= 0) {
        // caught: it darts into your hands and is gone
        it.caught += dt / 0.2;
        const k = Math.min(1, it.caught);
        if (player) it.g.position.lerpVectors(it.from, player.pos, k * k).setY(THREE.MathUtils.lerp(it.from.y, player.pos.y + 1.1, k * k));
        it.star.scale.setScalar((1 - k * 0.7) * 1.25);
        it.halo.scale.setScalar(1.5 + k * 2);
        if (k >= 1) { it.g.visible = false; onCatch?.(it.k); }
        continue;
      }
      it.g.position.set(s.x, s.y + Math.sin(t * 1.9 + it.ph) * 0.12, s.z);
      it.star.scale.setScalar(grow * pulse);
      it.halo.scale.setScalar(grow * (1.5 + Math.sin(t * 3.2 + it.ph) * 0.2));
      if ((it.twinkle -= dt) <= 0 && grow > 0.5) { it.twinkle = 0.25 + Math.random() * 0.45; sparkle?.(it.g.position); }
      if (!player || !it.live || it.born > -0.3) continue;
      const p = player.pos, y = it.g.position.y;
      const d = Math.hypot(p.x - s.x, p.z - s.z, y - THREE.MathUtils.clamp(y, p.y, p.y + BODY));
      if (d < CATCH) { it.live = false; it.caught = 0; it.from.copy(it.g.position); }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const it of this.items) { it.star.material.dispose(); it.halo.material.dispose(); }
  }
}
