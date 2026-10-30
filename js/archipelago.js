// A world's archipelago: a small hub island in the middle and one island per figure, joined by bridges in the world's style.
// Islands stand north of the hub in two staggered rows (odd figures in front, even ones behind the gaps); a
// causeway runs north from the hub to a boardwalk, and a spur leads from the boardwalk into each island's south
// side (where every island keeps a clear path to its pedestal) — the back row's spurs pass between the front
// islands. Bridges are breeze lanes: you cross them fast. Rails line every open edge. Only one figure island is active (its puzzle loaded): the archipelago is shifted so that island sits
// at the origin, which is what the game expects, and `api` answers the player's queries across all islands and
// bridges in those shifted coordinates. Moving to another island just changes the shift.
import * as THREE from 'three';
import { PEDESTAL_TOP } from './world.js';
import { Batch, GEO, projectInside, sdBox } from './world-kit.js';
import { toon, LAYER_OVERLAY } from './render.js';
import { mergeFigure } from './voxels.js';
import { expandLevel } from './levels.js';

const DECK = 0.22; // bridge deck height
const GAP = 5.4; // between front-row islands (a back-row bridge passes through)
const BOOST = 2.4; // walking speed on the bridges
const SPUR = 4.5; // boardwalk to island
const CAUSE = 6; // hub to boardwalk
const HW = 1.2; // half width of a bridge

// each world's bridges: deck under-beam, plank (or slab) colours, rails, posts and the lamps on the posts at a
// crossing (`top`); `rails` are [height, thickness, width] (one thick rail makes a low wall), `railTop` a strip
// along the top rail, `edge` one along the deck's open edges, `cap` a cap on every post, `piers` stone piers under
// the deck instead of a piling under every post, `sound` the footsteps
export const STYLES = {
  meadow: { base: 0x8a5a3c, planks: [0xc08a5c, 0xb27b50], rail: 0xc08a5c, post: 0x6b4a36, top: 'flowers', sound: 'wood' },
  farm: { base: 0x9a6b4f, planks: [0xd9b27a, 0xc9a06a], rail: 0xf4efe6, post: 0xc0392b, top: 'hay', sound: 'wood' },
  frost: { base: 0x5aaee6, planks: [0xbfe8ff, 0x9ad8ff], rail: 0xdff4ff, post: 0x7cc4f0, cap: 0xffffff, top: 'ice', sound: 'ice' },
  frostwood: { base: 0x5c3f2e, planks: [0x8a6a52, 0x7a5a48], rail: 0x6b4a36, railTop: 0xf4f7ff, post: 0x6b4a36, round: true, cap: 0xffffff, edge: 0xf4f7ff, top: 'lantern', sound: 'wood' },
  reef: { base: 0xb08850, planks: [0xead48e, 0xdcc076], rail: 0xb8935a, rails: [[0.5, 0.05, 0.05], [0.88, 0.05, 0.05]], post: 0xc9b06a, round: true, top: 'torch', sound: 'wood' },
  cove: { base: 0x5a4a3c, planks: [0x8a7560, 0x7a6552], rail: 0xd9c49a, rails: [[0.5, 0.06, 0.06], [0.88, 0.06, 0.06]], post: 0x5c4a3c, round: true, postW: 0.2, top: 'lantern', sound: 'wood' },
  starfall: { base: 0x5a4a8a, planks: [0x9d8fd0, 0x8a7bc0], rail: 0x6ee7ff, railKind: 'glow', post: 0xb693f5, edge: 0x6ee7ff, edgeKind: 'glow', top: 'crystal', sound: 'crystal' },
  moon: { base: 0x4f4c60, planks: [0xa9a5ba, 0x9a96ad], rail: 0xcfcbe0, post: 0x6f6a85, edge: 0xffd23f, top: 'beacon', sound: 'stone' },
  cliffs: { base: 0xb9b0a0, planks: [0xeee8da, 0xe0d9c8], rail: 0xd8d2c4, rails: [[0.3, 0.6, 0.3]], post: 0xc9c2b2, postW: 0.32, piers: true, cap: 0xeee8da, top: 'flowers', sound: 'stone' },
  storm: { base: 0x5d5878, planks: [0x9a96b4, 0x8a86a4], rail: 0x77728f, railTop: 0x6fa58a, rails: [[0.3, 0.6, 0.3]], post: 0x77728f, postW: 0.32, piers: true, cap: 0x6fa58a, top: 'rune', sound: 'stone' },
};

// The way on: a tall column of light with a bobbing "?" (over the next figure's island, a world's portal, or the
// next world's portal on the Keeper's Isle). Set userData.top to the mark's height; dispose() frees it.
export function makeBeacon() {
  const beacon = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 60, 20, 1, true), beamMat);
  beam.position.y = 30;
  beam.layers.set(LAYER_OVERLAY);
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a1f3d'; g.beginPath(); g.arc(64, 70, 56, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(64, 62, 52, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a1f3d'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 72px Fredoka, sans-serif'; g.fillText('?', 64, 66);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
  mark.scale.setScalar(2.4);
  mark.layers.set(LAYER_OVERLAY); mark.renderOrder = 6;
  beacon.add(beam, mark);
  beacon.userData = { beam, mark, beamMat, tex, top: 5 };
  beacon.visible = false;
  beacon.animate = (t, calm) => {
    if (!beacon.visible) return;
    mark.position.y = beacon.userData.top + (calm ? 0 : Math.sin(t * 2.2) * 0.35);
    beamMat.opacity = calm ? 0.3 : 0.28 + Math.sin(t * 1.6) * 0.08;
  };
  beacon.dispose = () => { beam.geometry.dispose(); beamMat.dispose(); mark.material.dispose(); tex.dispose(); };
  return beacon;
}

// a padlock badge (for the gates of closed bridges); the caller disposes it
export function lockTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a1f3d'; g.beginPath(); g.arc(64, 70, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e9dfcf'; g.beginPath(); g.arc(64, 62, 50, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1f3d'; g.lineWidth = 9; g.beginPath(); g.arc(64, 52, 16, Math.PI, 0); g.stroke();
  g.fillStyle = '#2a1f3d'; g.fillRect(42, 52, 44, 32);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// furthest extent of an island's ground in one direction (scan along z at a few x positions)
function reach(world, dirZ) {
  let best = 0;
  for (let x = -world.R; x <= world.R; x += 1) {
    for (let d = 0; d <= world.R + 2; d += 0.5) if (world.walkSd(x, d * dirZ) < 0) best = Math.max(best, d);
  }
  return best;
}
// where the ground ends going along +z (or -z) from the centre line
function coast(world, dirZ) {
  let d = 0;
  while (d < world.R + 4 && world.walkSd(0, (d + 0.25) * dirZ) < 0) d += 0.25;
  return d;
}

// chapter: index; levels: its figures; makePart(level) -> { world, footR }; makeHub(seaY) -> world
// isOpen(level) / isDone(level); figureMaterial: material for finished figures standing on inactive islands
// doorShut(level): a door at the island end of its bridge stays shut (the very first figure, until it's rebuilt)
// isHalf(level): a saved run in progress (a half-filled marker floats over its pedestal)
export function buildArchipelago({ chapter, levels, makePart, makeHub, isOpen, isDone, isHalf = () => false, doorShut = () => false, figureMaterial }) {
  const root = new THREE.Group();
  const parts = levels.map(level => ({ level, ...makePart(level), p: new THREE.Vector3() }));
  const hubWorld = makeHub(parts[0].world.seaY);
  const hub = { world: hubWorld, p: new THREE.Vector3() };
  const floating = hubWorld.voidY !== undefined;

  // ---- layout: two staggered rows north of the hub ----
  const zJ = -(reach(hubWorld, -1) + CAUSE); // the boardwalk
  const front = parts.filter((pt, i) => i % 2 === 0 || i === parts.length - 1); // an even count ends the front row
  const back = parts.filter(pt => !front.includes(pt));
  for (const pt of parts) { pt.coast = coast(pt.world, 1); pt.south = reach(pt.world, 1); pt.north = reach(pt.world, -1); }
  let x = 0;
  front.forEach((pt, k) => { if (k) x += front[k - 1].world.R + pt.world.R + GAP; pt.p.set(x, 0, zJ - SPUR - pt.south); });
  const mid = (front[0].p.x + front[front.length - 1].p.x) / 2;
  for (const pt of front) pt.p.x -= mid;
  // a back-row island stands behind the gap between its two front-row neighbours, clear of their north shores
  // (and of the back-row island before it)
  back.forEach((pt, k) => {
    const L = front[k], Rt = front[k + 1] || front[k];
    const gx = Rt === L ? L.p.x + L.world.R + GAP / 2 : (L.p.x + L.world.R + Rt.p.x - Rt.world.R) / 2;
    let z = Math.min(L.p.z - L.north, Rt.p.z - Rt.north) - 3 - pt.south;
    const prev = back[k - 1];
    if (prev && Math.abs(gx - prev.p.x) < prev.world.R + pt.world.R + 2) z = Math.min(z, prev.p.z - prev.north - 3 - pt.south);
    pt.p.set(gx, 0, z);
  });
  for (const pt of parts) pt.entry = new THREE.Vector3(pt.p.x, 0, pt.p.z + pt.coast); // where its spur reaches the island
  const hubN = coast(hubWorld, -1);
  const xMin = Math.min(...parts.map(pt => pt.p.x)), xMax = Math.max(...parts.map(pt => pt.p.x));
  // bridges as rectangles [x0, z0, x1, z1] (archipelago coordinates: the hub at the origin)
  const causeway = [-HW, zJ - HW, HW, -hubN + 0.8];
  const boardwalk = [xMin - HW, zJ - HW, xMax + HW, zJ + HW];
  parts.forEach(pt => { pt.spur = [pt.p.x - HW + 0.1, pt.entry.z - 0.8, pt.p.x + HW - 0.1, zJ]; });
  const rectSd = ([x0, z0, x1, z1]) => sdBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2);
  const fixedSd = [rectSd(causeway), rectSd(boardwalk)];
  parts.forEach(pt => { pt.spurSd = rectSd(pt.spur); });
  // a locked island's spur is closed off by a gate where it leaves the boardwalk
  for (const pt of parts) pt.doorZ = pt.entry.z + 1.3;
  const bridgeSd = (x, z) => {
    let d = Math.min(fixedSd[0](x, z), fixedSd[1](x, z));
    for (const pt of parts) {
      let e = pt.spurSd(x, z);
      if (!pt.open) e = Math.max(e, (zJ - HW - 0.6) - z);
      if (pt.shut) e = Math.max(e, 0.35 - Math.abs(z - pt.doorZ));
      d = Math.min(d, e);
    }
    return d;
  };

  // ---- place the islands ----
  hubWorld.group.position.copy(hub.p);
  root.add(hubWorld.group);
  for (const pt of parts) { pt.world.group.position.copy(pt.p); root.add(pt.world.group); }

  // ---- bridge looks ----
  // Where the causeway or a spur joins the boardwalk, the boardwalk's deck runs on through the crossing and the
  // rails stop exactly at the corners of the opening, each corner marked by a taller post with the world's lamp.
  const S = STYLES[hubWorld.themeId] || STYLES.meadow;
  const B = new Batch();
  const rects = [causeway, boardwalk, ...parts.map(pt => pt.spur)];
  const pieceList = [hub, ...parts];
  const onLand = (ax, az) => pieceList.some(k => k.world.walkSd(ax - k.p.x, az - k.p.z) < -0.05);
  const piers = S.piers && !floating;
  const postH = piers ? 1.15 : floating ? 1.6 : DECK - hubWorld.seaY + 0.9;
  const rails = S.rails || [[0.42, 0.08, 0.09], [0.86, 0.08, 0.09]];
  const posts = [];
  const deck = r => {
    const [x0, z0, x1, z1] = r === boardwalk ? r
      : [r[0], r[1] < boardwalk[1] ? r[1] : Math.max(r[1], boardwalk[3]), r[2], r[3] > boardwalk[3] ? r[3] : Math.min(r[3], boardwalk[1])];
    const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, w = alongX ? z1 - z0 : x1 - x0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B.put(GEO.box(), S.base, cx, DECK - 0.12, cz, { sx: alongX ? L : w, sy: 0.16, sz: alongX ? w : L });
    for (let t = 0.25; t < L; t += 0.5) {
      const px = alongX ? x0 + t : cx, pz = alongX ? cz : z0 + t;
      B.put(GEO.box(), S.planks[Math.round(t * 2) % 2], px, DECK - 0.02, pz, { sx: alongX ? 0.44 : w + 0.1, sy: 0.06, sz: alongX ? w + 0.1 : 0.44, kind: 'ground' });
    }
    if (piers) {
      const y0 = hubWorld.seaY - 1, y1 = DECK - 0.2;
      for (let t = 1.8; t < L - 0.6; t += 3.6) {
        const px = alongX ? x0 + t : cx, pz = alongX ? cz : z0 + t;
        if (!onLand(px, pz)) B.put(GEO.box(), S.post, px, (y0 + y1) / 2, pz, { sx: alongX ? 0.8 : w - 0.2, sy: y1 - y0, sz: alongX ? w - 0.2 : 0.8 });
      }
    }
  };
  // one stretch of railing along a side, from a to b
  const span = (alongX, c, { a, b, an, bn }) => {
    if (b - a < 0.3) return;
    const at = t => (alongX ? [t, c] : [c, t]);
    const [mx, mz] = at((a + b) / 2), L = b - a;
    const bar = (y, sy, sw, color, kind = 'solid') => B.put(GEO.box(), color, mx, DECK + y, mz, { sx: alongX ? L : sw, sy, sz: alongX ? sw : L, kind });
    for (const [y, sy, sw] of rails) bar(y, sy, sw, S.rail, S.railKind);
    if (S.railTop) { const [y, sy, sw] = rails[rails.length - 1]; bar(y + sy / 2 + 0.02, 0.05, sw + 0.04, S.railTop); }
    if (S.edge) bar(0.02, 0.06, 0.16, S.edge, S.edgeKind || 'ground');
    const k = Math.max(1, Math.round(L / 1.8));
    for (let i = 0; i <= k; i++) posts.push({ p: at(a + L * i / k), newel: (i === 0 && an) || (i === k && bn) });
  };
  const railing = r => {
    const [x0, z0, x1, z1] = r;
    for (const [alongX, c, a, b] of [[true, z0 - 0.05, x0, x1], [true, z1 + 0.05, x0, x1], [false, x0 - 0.05, z0, z1], [false, x1 + 0.05, z0, z1]]) {
      // cut out where another bridge joins (its exact edges, so the corners line up) ...
      let segs = [[a, b, false, false]];
      for (const q of rects) {
        const [lo, hi, c0, c1] = alongX ? [q[0], q[2], q[1], q[3]] : [q[1], q[3], q[0], q[2]];
        if (q === r || c <= c0 || c >= c1) continue;
        segs = segs.flatMap(([s, e, sn, en]) => (hi <= s || lo >= e ? [[s, e, sn, en]]
          : [...(lo > s ? [[s, lo, sn, true]] : []), ...(hi < e ? [[hi, e, true, en]] : [])]));
      }
      // ... and stop where the side runs over land
      for (const [s, e, sn, en] of segs) {
        const n = Math.max(1, Math.ceil((e - s) / 0.1));
        let run = null;
        for (let i = 0; i <= n; i++) {
          const t = s + ((e - s) * i) / n;
          if (onLand(...(alongX ? [t, c] : [c, t]))) { if (run) span(alongX, c, run); run = null; }
          else if (run) { run.b = t; run.bn = i === n && en; } else run = { a: t, b: t, an: i === 0 && sn, bn: false };
        }
        if (run) span(alongX, c, run);
      }
    }
  };
  for (const r of rects) { deck(r); railing(r); }
  // posts (one where two railings meet), the crossing's corners taller and lit
  const kept = [];
  for (const q of posts) {
    const o = kept.find(k => Math.hypot(k.p[0] - q.p[0], k.p[1] - q.p[1]) < 0.35);
    if (o) o.newel ||= q.newel; else kept.push(q);
  }
  const flowers = hubWorld.theme.flowers;
  for (const { p: [px, pz], newel } of kept) {
    const w = (S.postW || 0.14) * (newel ? 1.5 : 1), top = DECK + (newel ? 1.2 : 0.95), h = postH + top - DECK - 0.95;
    B.put(S.round ? GEO.cyl(8) : GEO.box(), S.post, px, top - h / 2, pz, S.round ? { sx: w * 0.6, sy: h, sz: w * 0.6 } : { sx: w, sy: h, sz: w });
    if (S.cap) B.put(GEO.box(), S.cap, px, top + 0.03, pz, { sx: w + 0.06, sy: 0.07, sz: w + 0.06 });
    if (!newel) continue;
    const y = top + (S.cap ? 0.07 : 0);
    const put = (geo, color, dy, s, o = {}) => B.put(geo, color, px, y + dy, pz, { sx: s[0], sy: s[1], sz: s[2], ...o });
    switch (S.top) {
      case 'flowers':
        put(GEO.box(), 0xd9774a, 0.09, [0.34, 0.18, 0.34]);
        for (let i = 0; i < 3; i++) B.put(GEO.blob(), flowers[i % flowers.length], px + [-0.08, 0.08, 0][i], y + 0.24, pz + [0.06, 0.04, -0.08][i], { sx: 0.08, sy: 0.08, sz: 0.08 });
        break;
      case 'hay':
        put(GEO.box(), 0xe9c75a, 0.14, [0.42, 0.28, 0.32]);
        put(GEO.box(), 0xc9a03a, 0.14, [0.44, 0.06, 0.34]);
        break;
      case 'ice': put(GEO.octa(), 0xc8f0ff, 0.22, [0.15, 0.28, 0.15], { kind: 'glow' }); break;
      case 'crystal': put(GEO.octa(), 0xff9ee8, 0.22, [0.15, 0.28, 0.15], { kind: 'glow' }); break;
      case 'lantern':
        put(GEO.box(), 0x3a2a20, 0.03, [0.26, 0.06, 0.26]);
        put(GEO.box(), 0xffd27a, 0.17, [0.17, 0.22, 0.17], { kind: 'glow' });
        put(GEO.cone(4), 0x3a2a20, 0.36, [0.22, 0.16, 0.22], { ry: Math.PI / 4 });
        break;
      case 'torch':
        put(GEO.cone(6), 0x8a6a3c, 0.1, [0.14, 0.2, 0.14], { rx: Math.PI });
        put(GEO.ico(), 0xffa040, 0.3, [0.1, 0.18, 0.1], { kind: 'glow' });
        break;
      case 'beacon':
        put(GEO.box(), 0x3a3850, 0.04, [0.24, 0.08, 0.24]);
        put(GEO.dome(), 0x4cc9f0, 0.08, [0.12, 0.14, 0.12], { kind: 'glow' });
        break;
      case 'rune': put(GEO.box(), 0x9cf5ff, 0.22, [0.15, 0.15, 0.15], { rx: Math.PI / 4, rz: Math.PI / 4, kind: 'glow' }); break;
    }
  }
  const bridgeBlockers = [];
  B.build(root, bridgeBlockers);

  // gates on the spurs of locked islands, and finished figures on the islands you're not on
  const gateGeo = new THREE.BoxGeometry(1, 1, 1);
  const wood = toon(S.base), dark = toon(S.post);
  let lockTex = null;
  const lockBadge = () => lockTex || (lockTex = lockTexture());
  for (const pt of parts) {
    const g = new THREE.Group();
    const z = zJ - HW - 0.55; // clear of the crossing's corner posts
    for (const s of [-1, 1]) { const m = new THREE.Mesh(gateGeo, wood); m.scale.set(0.24, 1.5, 0.24); m.position.set(pt.p.x + s * (HW - 0.05), DECK + 0.75, z); g.add(m); }
    for (const y of [0.55, 1.1]) { const m = new THREE.Mesh(gateGeo, dark); m.scale.set(HW * 2, 0.14, 0.1); m.position.set(pt.p.x, DECK + y, z); g.add(m); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockBadge(), depthWrite: false, transparent: true }));
    sp.scale.setScalar(0.7); sp.position.set(pt.p.x, DECK + 1.95, z); sp.layers.set(LAYER_OVERLAY); sp.renderOrder = 5;
    g.add(sp);
    g.traverse(o => { o.castShadow = true; });
    root.add(g);
    pt.gate = g;
    pt.gatePos = new THREE.Vector3(pt.p.x, 0, z);
    // a door at the island end, for the figure that has to be rebuilt before you may leave
    const d = new THREE.Group();
    for (const s of [-1, 1]) { const m = new THREE.Mesh(gateGeo, wood); m.scale.set(0.28, 2.5, 0.28); m.position.set(s * (HW - 0.02), DECK + 1.25, 0); d.add(m); }
    const lintel = new THREE.Mesh(gateGeo, wood); lintel.scale.set(HW * 2 + 0.3, 0.3, 0.34); lintel.position.set(0, DECK + 2.55, 0); d.add(lintel);
    pt.leaves = [-1, 1].map(s => {
      const hinge = new THREE.Group(); hinge.position.set(s * (HW - 0.16), DECK, 0);
      const leaf = new THREE.Mesh(gateGeo, dark); leaf.scale.set(HW - 0.18, 2.2, 0.1); leaf.position.set(-s * (HW - 0.18) / 2, 1.1, 0); hinge.add(leaf);
      const knob = new THREE.Mesh(gateGeo, toon(0xffd23f)); knob.scale.setScalar(0.12); knob.position.set(-s * (HW - 0.36), 1.05, 0.08); hinge.add(knob);
      hinge.userData.s = s;
      d.add(hinge);
      return hinge;
    });
    d.position.set(pt.p.x, 0, pt.doorZ);
    d.traverse(o => { o.castShadow = true; });
    root.add(d);
    pt.door = d;
  }

  let active = null;
  const A = new THREE.Vector3(); // archipelago position of the active island
  const pieces = [hub, ...parts];
  const api = {
    group: root, theme: hubWorld.theme, themeId: hubWorld.themeId, atmos: hubWorld.atmos, archipelago: true,
    get onFlash() { return hubWorld.onFlash; }, set onFlash(f) { hubWorld.onFlash = f; },
    get onGust() { return hubWorld.onGust; }, set onGust(f) { hubWorld.onGust = f; },
    get calm() { return hubWorld.calm; }, set calm(v) { hubWorld.calm = v; },
    gravityScale: hubWorld.gravityScale, wind: hubWorld.wind, voidY: hubWorld.voidY,
    colliders: [], blockers: [],
    // the puzzle lives on the active island (its own coordinates are the scene's)
    get R() { return active.world.R; }, get tops() { return active.world.tops; },
    radiusAt: th => active.world.radiusAt(th),
    isFreeGround: (x, z, m) => active.world.isFreeGround(x, z, m),
    heightAt: (x, z, maxY) => active.world.heightAt(x, z, maxY),
    groundY: (x, z) => active.world.groundY(x, z),
    dropPoint: (x, z, maxY, px, pz) => active.world.dropPoint(x, z, maxY, px, pz),
    // ---- the player walks across everything ----
    floorAt(x, z) {
      const ax = x + A.x, az = z + A.z;
      let best = null;
      for (const k of pieces) {
        const lx = ax - k.p.x, lz = az - k.p.z;
        if (k.world.walkSd(lx, lz) < 0.35) { const f = k.world.floorAt(lx, lz); if (f !== null && (best === null || f > best)) best = f; }
      }
      if (bridgeSd(ax, az) < 0.05 && (best === null || DECK > best)) best = DECK;
      return best;
    },
    walkSd(x, z) {
      const ax = x + A.x, az = z + A.z;
      let d = bridgeSd(ax, az);
      for (const k of pieces) d = Math.min(d, k.world.walkSd(ax - k.p.x, az - k.p.z));
      return d;
    },
    surfaceAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      const k = pieceAt(ax, az, -0.3);
      // (gentler with reduced motion)
      if (!k && bridgeSd(ax, az) < 0.05) return { friction: 1, slow: api.calmMotion?.() ? 1.4 : BOOST, sound: S.sound };
      return (k || active).world.surfaceAt(ax - (k || active).p.x, az - (k || active).p.z, y);
    },
    padAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      for (const k of pieces) { const pd = k.world.padAt(ax - k.p.x, az - k.p.z, y); if (pd) return pd; }
      return null;
    },
    safeAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      if (bridgeSd(ax, az) < -0.6 && Math.abs(y - DECK) < 0.15) return true;
      const k = pieceAt(ax, az, -0.6);
      return !!k && k.world.safeAt(ax - k.p.x, az - k.p.z, y);
    },
    // carrying blocks keeps you on the active island; otherwise anywhere on land or a bridge
    restrict: null, onBlocked: null,
    clampPlayer(pos) {
      if (api.restrict?.()) {
        const x = pos.x, z = pos.z;
        active.world.clampPlayer(pos);
        if (Math.abs(pos.x - x) + Math.abs(pos.z - z) > 1e-4 && bridgeSd(x + A.x, z + A.z) < 0.3) api.onBlocked?.();
        return;
      }
      if (floating && (pos.y > 0.05 || pos.y < -0.3)) return;
      if (api.walkSd(pos.x, pos.z) > -0.45) projectInside(api.walkSd, pos, 0.45);
    },
    update(dt, t, cam) {
      const c = cam ? cam.clone().add(A) : null;
      beacon.animate(t, api.calmMotion?.());
      for (const pt of parts) for (const h of pt.leaves) if (h.rotation.y !== h.userData.to) {
        const d = h.userData.to - h.rotation.y;
        h.rotation.y = Math.abs(d) < 0.002 ? h.userData.to : h.rotation.y + d * Math.min(1, dt * 2.6);
      }
      for (const k of pieces) k.world.update(dt, t, c ? c.clone().sub(k.p) : null);
      // the sun's shadow follows you round the archipelago
      const sun = hubWorld.atmos.sun;
      if (sun && c) {
        sun.target.position.set(c.x, 0, c.z);
        sun.position.copy(sunDir).multiplyScalar(40).add(sun.target.position);
      }
    },
    dispose() {
      for (const k of pieces) k.world.dispose();
      root.traverse(o => { if (o.parent && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
      for (const d of displays.values()) d.geometry.dispose();
      wood.dispose(); dark.dispose(); lockTex?.dispose(); beacon.dispose(); halfTex.dispose();
      for (const s of halves.values()) s.material.dispose();
    },
  };
  const sunDir = new THREE.Vector3(...hubWorld.theme.sunPos).normalize();
  if (hubWorld.atmos.sun) {
    const cam = hubWorld.atmos.sun.shadow.camera, e = 30;
    Object.assign(cam, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 110 });
    cam.updateProjectionMatrix();
  }
  // a piece whose ground is under (ax, az), at least `inside` deep
  function pieceAt(ax, az, inside = 0) {
    for (const k of pieces) if (k.world.walkSd(ax - k.p.x, az - k.p.z) < inside) return k;
    return null;
  }

  // a beacon over the next figure's island (or the portal)
  const beacon = makeBeacon();
  root.add(beacon);
  let beaconFor;

  // half-built marker: a half-filled disc over the pedestal of a figure with a saved run
  const halfTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#2a1f3d'; g.beginPath(); g.arc(64, 68, 54, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff4e0'; g.beginPath(); g.arc(64, 62, 48, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffc93c'; g.beginPath(); g.moveTo(64, 62); g.arc(64, 62, 48, Math.PI / 2, Math.PI * 1.5); g.fill();
    g.strokeStyle = '#2a1f3d'; g.lineWidth = 6; g.beginPath(); g.moveTo(64, 16); g.lineTo(64, 108); g.stroke();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const halves = new Map();
  const displays = new Map();
  function dress() {
    for (const pt of parts) {
      pt.open = isOpen(pt.level);
      pt.gate.visible = !pt.open;
      pt.shut = doorShut(pt.level);
      pt.door.visible = pt.shut || pt.hadDoor;
      if (pt.shut) pt.hadDoor = true;
      // swung open: it swings while you watch (the figure just finished), and stands open from the start otherwise
      for (const h of pt.leaves) { h.userData.to = pt.shut ? 0 : h.userData.s * 1.75; if (!pt.dressed) h.rotation.y = h.userData.to; }
      pt.dressed = true;
      const show = pt !== active && isDone(pt.level);
      if (show && !displays.has(pt)) {
        const m = new THREE.Mesh(mergeFigure(expandLevel(pt.level).cells), figureMaterial);
        m.position.set(0, PEDESTAL_TOP, 0);
        m.castShadow = m.receiveShadow = true;
        pt.world.group.add(m);
        displays.set(pt, m);
      }
      if (displays.has(pt)) displays.get(pt).visible = show;
      const half = pt !== active && pt.open && !isDone(pt.level) && isHalf(pt.level);
      if (half && !halves.has(pt)) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halfTex, depthWrite: false, transparent: true, fog: false }));
        // big enough to read across the water, and beside the beacon's beam rather than inside it
        s.scale.setScalar(2.8);
        s.position.set(2.4, PEDESTAL_TOP + 3.2, 0);
        s.renderOrder = 5;
        pt.world.group.add(s);
        halves.set(pt, s);
      }
      if (halves.has(pt)) halves.get(pt).visible = half;
    }
  }

  const arch = {
    chapter, api, group: root, parts,
    // make `level`'s island the active one; returns how far the scene moved (add it to anything you keep, like the player)
    setActive(level) {
      const pt = parts.find(p => p.level === level);
      const old = A.clone();
      active = pt;
      A.copy(pt.p);
      root.position.set(-A.x, 0, -A.z);
      api.colliders = [];
      api.blockers = [...bridgeBlockers];
      for (const k of pieces) {
        const o = new THREE.Vector3(k.p.x - A.x, 0, k.p.z - A.z);
        for (const b of k.world.colliders) { const c = b.clone().translate(o); c.sound = b.sound; api.colliders.push(c); }
        api.blockers.push(...k.world.blockers);
      }
      root.updateMatrixWorld(true);
      dress();
      return old.sub(A);
    },
    refresh: dress,
    // the open figure island under the player (well inside its shore), if any
    partAt(x, z) {
      const ax = x + A.x, az = z + A.z;
      return parts.find(p => p.open && p.world.walkSd(ax - p.p.x, az - p.p.z) < -0.8) || null;
    },
    boardwalkZ() { return zJ - A.z; },
    // is (x, z) on the active figure's island (bridges excluded)?
    onActive(x, z) { return active.world.walkSd(x, z) < 0.2 && bridgeSd(x + A.x, z + A.z) > 0.05; },
    offsetOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.p.x - A.x, 0, pt.p.z - A.z) : null; },
    // scene positions: where you arrive by portal, an island's bridge entry, the portal itself
    arrival() { const pz = hubWorld.portal?.z ?? 4; return { x: hub.p.x - A.x, z: hub.p.z + pz - 2.6 - A.z, yaw: 0 }; },
    entryOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.entry.x - A.x, DECK + 1, pt.entry.z + 1.5 - A.z) : null; },
    portalPos() { const pz = hubWorld.portal?.z ?? 4; return new THREE.Vector3(hub.p.x - A.x, 1.8, hub.p.z + pz - A.z); },
    atPortal(x, z) { const p = arch.portalPos(); return Math.hypot(x - p.x, z - p.z) < 1.3; },
    // a locked spur's gate you're pressing against
    // light the beacon over a figure's island (a level), the portal ('portal') or nothing (null)
    setBeacon(target) {
      if (target === beaconFor) return;
      beaconFor = target;
      beacon.visible = !!target;
      if (!target) return;
      if (target === 'portal') {
        const pz = hubWorld.portal?.z ?? 4;
        beacon.position.set(hub.p.x, 0, hub.p.z + pz);
        beacon.userData.top = 5;
      } else {
        const pt = parts.find(p => p.level === target);
        beacon.position.copy(pt.p);
        beacon.userData.top = PEDESTAL_TOP + expandLevel(target).height * 0.6 + 3;
      }
      beacon.userData.mark.position.y = beacon.userData.top;
    },
    shutDoorAt(x, z) {
      for (const pt of parts) if (pt.shut && Math.hypot(x + A.x - pt.p.x, z + A.z - pt.doorZ) < 2) return pt;
      return null;
    },
    lockedGateAt(x, z) {
      for (const pt of parts) if (!pt.open && Math.hypot(x + A.x - pt.gatePos.x, z + A.z - pt.gatePos.z) < 2.2) return pt;
      return null;
    },
  };
  return arch;
}
