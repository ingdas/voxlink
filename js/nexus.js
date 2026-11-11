// The Keeper's Isle: the world of worlds. A floating plaza with the Keeper's Lantern in the middle over the flowery
// arch into Kubo's Garden, and a bridge out to one islet per world. Each islet has its world's ground, trees and lamps, its
// portal on the far side (facing the plaza), the world's rebuilt figures in miniature on four little pedestals and
// its finale on top of the portal. A closed world's bridge has a gate. `api` answers the player's queries (floor,
// edges, footsteps) across the plaza, the islets and the bridges; js/features/nexus.js does the rest.
import * as THREE from 'three';
import { buildWorld, THEMES } from './world.js';
import { STYLES, makeBeacon, lockTexture } from './archipelago.js';
import { Batch, GEO, projectInside } from './world-kit.js';
import { toon, LAYER_FX, LAYER_OVERLAY } from './render.js';
import { glows } from './looks.js';
import { mulberry32, mergeFigure, S } from './voxels.js';
import { makePortal, paintView } from './portal.js';
import { idleHop } from './life.js';

const PLAZA_R = 10, ISLET_R = 6.2, RING = 28; // the plaza, each islet, and how far out the islets stand
const DECK = 0.22, HW = 1.2; // bridge deck height and half width
const BOOST = 2.4; // walking speed on the bridges (as in the worlds)
const GATE_A = PLAZA_R + 0.4; // a closed bridge ends here
const PORTAL_Y = 1.85;

// slots: one per world's islet, in order round the plaza, and the Garden's (garden: true) last (its arch is in the
// middle, its index the one after the worlds'):
//   { theme, garden, open, minis: [{ cells, height, gold } | null] × 4, finale: { cells, height } | null, done, crowned }
// sign(k): a CanvasTexture for the sign at slot k's bridge head; figureMat: the material of rebuilt figures
export function buildNexus({ quality, slots, figureMat, sign }) {
  const root = new THREE.Group();
  const own = []; // geometries, materials and textures this file made (the worlds dispose their own)
  const keep = x => { own.push(x); return x; };
  const gardenSlot = slots.find(s => s.garden);
  slots = slots.filter(s => !s.garden);
  const n = slots.length, GARDEN = n;
  // the worlds go round clockwise from the south (where you first arrive, facing the Garden's arch)
  const dirs = slots.map((s, i) => {
    const phi = Math.PI + ((i + 0.5) * 2 * Math.PI) / n;
    return { x: Math.sin(phi), z: -Math.cos(phi) };
  });

  // ---- the plaza and the islets ----
  const plaza = buildWorld({ rng: mulberry32(9090), radius: PLAZA_R, seed: 23, quality, theme: 'nexus', pedestal: false, opts: { spokes: dirs } });
  root.add(plaza.group);
  const pieces = [{ world: plaza, p: new THREE.Vector3(), reach: PLAZA_R + 3 }];
  const islets = slots.map((s, i) => {
    const u = dirs[i];
    const world = buildWorld({ rng: mulberry32(7000 + i * 13), radius: ISLET_R, seed: 3 + i * 1.7, quality, theme: s.garden ? 'meadow' : s.theme, layout: 'gate', part: true, pedestal: false, opts: { dir: u, garden: s.garden } });
    const p = new THREE.Vector3(u.x * RING, 0, u.z * RING);
    world.group.position.copy(p);
    root.add(world.group);
    const theme = s.garden ? 'meadow' : s.theme;
    const piece = { world, p, reach: ISLET_R + 3, slot: s, u, i, ry: Math.atan2(u.x, u.z), open: !!s.open, T: THEMES[theme], style: STYLES[theme] || STYLES.meadow };
    pieces.push(piece);
    return piece;
  });

  // ---- walking: the union of the ground and the bridges ----
  const along = (k, x, z) => x * k.u.x + z * k.u.z;
  const across = (k, x, z) => x * k.u.z - z * k.u.x;
  const a0 = PLAZA_R - 1.2, a1 = RING - ISLET_R + 1.2, mid = (a0 + a1) / 2, half = (a1 - a0) / 2;
  const bridgeSdOf = (k, x, z) => {
    const a = along(k, x, z), qa = Math.abs(a - mid) - half, qb = Math.abs(across(k, x, z)) - HW;
    let d = Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0);
    if (!k.open) d = Math.max(d, a - GATE_A);
    return d;
  };
  // the bridge under (x, z), if any (only the one pointing that way can be)
  const bridgeAt = (x, z, inside = 0.05) => {
    let best = null, bd = inside;
    for (const k of islets) { if (along(k, x, z) < 0) continue; const d = bridgeSdOf(k, x, z); if (d < bd) { bd = d; best = k; } }
    return best;
  };
  const bridgeSd = (x, z) => { let d = Infinity; for (const k of islets) if (along(k, x, z) > 0) d = Math.min(d, bridgeSdOf(k, x, z)); return d; };
  const pieceAt = (x, z, inside = 0) => {
    for (const k of pieces) {
      const lx = x - k.p.x, lz = z - k.p.z;
      if (Math.abs(lx) < k.reach && Math.abs(lz) < k.reach && k.world.walkSd(lx, lz) < inside) return k;
    }
    return null;
  };
  const colliders = [];
  for (const k of pieces) for (const b of k.world.colliders) { const c = b.clone().translate(k.p); c.sound = b.sound; colliders.push(c); }
  const api = {
    theme: plaza.theme, themeId: 'nexus', colliders, blockers: [], gravityScale: 1, wind: null, voidY: plaza.voidY,
    calmMotion: () => false,
    floorAt(x, z) {
      let best = null;
      for (const k of pieces) {
        const lx = x - k.p.x, lz = z - k.p.z;
        if (Math.abs(lx) > k.reach || Math.abs(lz) > k.reach || k.world.walkSd(lx, lz) >= 0.35) continue;
        const f = k.world.floorAt(lx, lz);
        if (f !== null && (best === null || f > best)) best = f;
      }
      if (bridgeSd(x, z) < 0.05 && (best === null || DECK > best)) best = DECK;
      return best;
    },
    walkSd(x, z) {
      let d = bridgeSd(x, z);
      for (const k of pieces) {
        const lx = x - k.p.x, lz = z - k.p.z;
        if (Math.abs(lx) < k.reach && Math.abs(lz) < k.reach) d = Math.min(d, k.world.walkSd(lx, lz));
      }
      return d;
    },
    surfaceAt(x, z, y) {
      const k = pieceAt(x, z, -0.3);
      const b = !k && bridgeAt(x, z);
      if (b) return { friction: 1, slow: api.calmMotion() ? 1.4 : BOOST, sound: b.style.sound };
      const w = k || pieces[0];
      return w.world.surfaceAt(x - w.p.x, z - w.p.z, y);
    },
    padAt: () => null,
    safeAt: (x, z) => api.walkSd(x, z) < -0.6,
    // never off an edge (there's nothing below but clouds)
    clampPlayer(pos) { if (api.walkSd(pos.x, pos.z) > -0.45) projectInside(api.walkSd, pos, 0.45); },
    update() {},
  };

  // ---- the bridges, each in its world's style ----
  const B = new Batch(), plankRng = mulberry32(4711);
  for (const k of islets) {
    const { u, ry, style: St } = k;
    const at = (a, s, y) => [u.x * a + u.z * s, y, u.z * a - u.x * s];
    const L = a1 - a0;
    B.put(GEO.box(), St.base, ...at(mid, 0, DECK - 0.12), { sx: HW * 2, sy: 0.16, sz: L, ry });
    // planks of uneven length, each a touch askew (like the worlds' own bridges)
    for (let t = 0.25; t < L; t += 0.5) {
      const pr = plankRng();
      B.put(GEO.box(), pr < 0.18 ? new THREE.Color(St.planks[Math.round(t * 2) % 2]).multiplyScalar(0.92).getHex() : St.planks[Math.round(t * 2) % 2], ...at(a0 + t, 0, DECK - 0.02), { sx: HW * 2 + 0.04 + pr * 0.16, sy: 0.06, sz: 0.44, ry: ry + (plankRng() - 0.5) * 0.035, kind: 'ground' });
    }
    // rails over the open air, posts hanging a little below the deck
    const r0 = PLAZA_R + 0.3, r1 = RING - ISLET_R - 0.3, rm = (r0 + r1) / 2, rl = r1 - r0;
    const rails = St.rails || [[0.42, 0.08, 0.09], [0.86, 0.08, 0.09]];
    for (const s of [-1, 1]) {
      const c = s * (HW + 0.05);
      for (const [y, sy, sw] of rails) B.put(GEO.box(), St.rail, ...at(rm, c, DECK + y), { sx: sw, sy, sz: rl, ry, kind: St.railKind || 'solid' });
      if (St.railTop) { const [y, sy, sw] = rails[rails.length - 1]; B.put(GEO.box(), St.railTop, ...at(rm, c, DECK + y + sy / 2 + 0.02), { sx: sw + 0.04, sy: 0.05, sz: rl, ry }); }
      if (St.edge) B.put(GEO.box(), St.edge, ...at(rm, c, DECK + 0.02), { sx: 0.16, sy: 0.06, sz: rl, ry, kind: St.edgeKind || 'ground' });
      const posts = Math.max(1, Math.round(rl / 1.8));
      for (let j = 0; j <= posts; j++) {
        const a = r0 + (rl * j) / posts, w = St.postW || 0.14, h = 1.6 + 0.95;
        B.put(St.round ? GEO.cyl(8) : GEO.box(), St.post, ...at(a, c, DECK + 0.95 - h / 2), St.round ? { sx: w * 0.6, sy: h, sz: w * 0.6 } : { sx: w, sy: h, sz: w, ry });
        if (St.cap) B.put(GEO.box(), St.cap, ...at(a, c, DECK + 0.98), { sx: w + 0.06, sy: 0.07, sz: w + 0.06, ry });
        else if (!St.round) B.put(GEO.cone(4), St.post, ...at(a, c, DECK + 1.0), { sx: w * 0.78, sy: 0.1, sz: w * 0.78, ry: ry + Math.PI / 4 });
      }
    }
  }
  for (const m of B.build(root, [])) { keep(m.geometry); keep(m.material); }

  // ---- gates on closed bridges ----
  const lockTex = keep(lockTexture());
  const gateGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  for (const k of islets) {
    if (k.open) continue;
    const wood = keep(toon(k.style.base)), dark = keep(toon(k.style.post));
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const m = new THREE.Mesh(gateGeo, wood); m.scale.set(0.24, 1.5, 0.24); m.position.set(s * (HW - 0.05), DECK + 0.75, 0); g.add(m); }
    for (const y of [0.55, 1.1]) { const m = new THREE.Mesh(gateGeo, dark); m.scale.set(HW * 2, 0.14, 0.1); m.position.set(0, DECK + y, 0); g.add(m); }
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: lockTex, depthWrite: false, transparent: true })));
    sp.scale.setScalar(0.7); sp.position.set(0, DECK + 1.95, 0); sp.layers.set(LAYER_OVERLAY); sp.renderOrder = 5;
    g.add(sp);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(k.u.x * (GATE_A + 0.35), 0, k.u.z * (GATE_A + 0.35));
    g.rotation.y = k.ry;
    root.add(g);
    k.gate = g;
  }

  // ---- portals: the way into the world (js/portal.js: its sky, hills and trees down a twisting tunnel of its
  // light); a sleeping one is dark. (The heart writes depth, so the beacon's beam behind it stays hidden.)
  const discGeo = keep(new THREE.CircleGeometry(1.25, 40));
  const hearts = [];
  for (const k of islets) {
    const o = k.world.out.portal;
    const g = new THREE.Group();
    g.position.set(k.p.x + o.x, PORTAL_Y, k.p.z + o.z);
    g.rotation.y = k.ry + Math.PI; // facing the plaza (the depth pass only sees front faces)
    const heart = makePortal({ view: paintView(k.T, { garden: k.slot.garden, seed: k.i + 1 }), color: k.slot.garden ? 0xff8fc7 : k.T.pedestal[2] });
    hearts.push(heart);
    const sleep = new THREE.Mesh(discGeo, keep(new THREE.MeshBasicMaterial({ color: 0x3a3150, side: THREE.DoubleSide })));
    g.add(heart.group, sleep);
    root.add(g);
    k.portal = { g, heart, sleep, pos: g.position.clone(), wake: k.open ? 1 : 0, waking: false };
    setWake(k, k.portal.wake);
  }
  // the Garden's portal, in its arch under the Lantern (facing the south; you walk through from either side)
  const gardenHeart = makePortal({ view: paintView(THEMES.meadow, { garden: true, seed: 77 }), color: 0xff8fc7 });
  gardenHeart.group.position.set(0, PORTAL_Y, 0);
  root.add(gardenHeart.group);
  hearts.push(gardenHeart);
  const gardenPos = new THREE.Vector3(0, PORTAL_Y, 0);
  function setWake(k, w) {
    const P = k.portal;
    P.wake = w;
    P.heart.group.scale.setScalar(Math.max(0.001, w));
    P.sleep.visible = w < 1;
    P.heart.group.visible = w > 0;
  }

  // ---- the world's rebuilt figures in miniature, its finale on top of the portal ----
  const figGeos = [];
  const pedMats = new Map();
  const pedMat = c => { if (!pedMats.has(c)) pedMats.set(c, keep(toon(c))); return pedMats.get(c); };
  const pedBase = keep(new THREE.CylinderGeometry(0.5, 0.56, 0.36, 8)), pedTop = keep(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 8));
  const fit = (cells, height, maxH, maxR) => {
    const reach = Math.max(...cells.map(c => Math.hypot(c.x, c.z))) * S + S * 0.72;
    return Math.min(maxH / (height * S), maxR / reach, 0.5);
  };
  const figure = (f, x, y, z, ry, k) => {
    const geo = mergeFigure(f.cells);
    figGeos.push(geo);
    const m = new THREE.Mesh(geo, figureMat);
    m.scale.setScalar(k);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    figs.push({ m, y, k, st: {} });
  };
  const figs = []; // the rebuilt figures standing here: they give a little jump now and then, like the ones in their worlds
  for (const k of islets) {
    if (k.slot.garden) continue;
    const T = k.T;
    k.world.out.minis.forEach((spot, j) => {
      const f = k.slot.minis[j];
      const x = k.p.x + spot.x, z = k.p.z + spot.z;
      const base = new THREE.Mesh(pedBase, pedMat(f?.gold ? 0xe0a21a : T.pedestal[0]));
      base.position.set(x, 0.18, z);
      const top = new THREE.Mesh(pedTop, pedMat(f?.gold ? 0xffc93c : f ? T.pedestal[1] : 0xd8ccb6));
      top.position.set(x, 0.45, z);
      for (const m of [base, top]) { m.rotation.y = Math.PI / 8; m.castShadow = m.receiveShadow = true; root.add(m); }
      if (f) figure(f, x, 0.54, z, spot.ry, fit(f.cells, f.height, 1.3, 0.45));
    });
    const fin = k.slot.finale;
    if (fin) {
      const { pos } = k.portal;
      const slab = new THREE.Mesh(pedTop, pedMat(T.pedestal[1]));
      slab.scale.set(1.15, 0.6, 1.15);
      slab.position.set(pos.x, 3.74, pos.z);
      root.add(slab);
      figure(fin, pos.x, 3.8, pos.z, k.ry + Math.PI, fit(fin.cells, fin.height, 1.7, 0.95));
    }
  }

  // ---- signs at the bridge heads ----
  const postGeo = keep(new THREE.BoxGeometry(0.12, 0.6, 0.12)), boardGeo = keep(new THREE.BoxGeometry(1.6, 0.84, 0.1)), faceGeo = keep(new THREE.PlaneGeometry(1.48, 0.72));
  const postMat = keep(toon(0x9a6b4f));
  plaza.out.signs.forEach((sp, i) => {
    const k = islets[i];
    const g = new THREE.Group();
    g.position.set(sp.x, 0, sp.z);
    g.rotation.y = sp.ry;
    for (const sx of [-0.55, 0.55]) { const p = new THREE.Mesh(postGeo, postMat); p.position.set(sx, 0.3, 0); g.add(p); }
    const board = new THREE.Mesh(boardGeo, pedMat(k.slot.garden ? 0x4f9e52 : k.T.pedestal[0]));
    board.position.y = 0.98;
    const face = new THREE.Mesh(faceGeo, keep(new THREE.MeshBasicMaterial({ map: keep(sign(i)), color: 0xf4f0ea })));
    face.position.set(0, 0.98, 0.055);
    g.add(board, face);
    g.traverse(o => { if (o.isMesh && o !== face) o.castShadow = true; });
    root.add(g);
  });

  // ---- the Keeper's Lantern: a crystal over the plaza, and an orb per world that lights up once it's rebuilt
  // (gold with every star) ----
  const lantern = new THREE.Group();
  lantern.position.y = 5.6; // over the Garden's arch
  const crystal = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.62, 0)), keep(new THREE.MeshBasicMaterial({ color: 0xfff1b8 })));
  crystal.scale.y = 1.45;
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glowTexture()), color: 0xffe2a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  halo.scale.setScalar(3.4);
  halo.layers.set(LAYER_FX);
  lantern.add(crystal, halo);
  glows(crystal); glows(halo);
  const orbs = new THREE.Group();
  const orbGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  const worlds = islets.filter(k => !k.slot.garden);
  worlds.forEach((k, j) => {
    const lit = k.slot.done, gold = k.slot.crowned;
    const mat = lit ? keep(new THREE.MeshBasicMaterial({ color: gold ? 0xffc93c : k.T.pedestal[2] })) : pedMat(0x8a8098);
    const o = new THREE.Mesh(orbGeo, mat);
    const a = (j / worlds.length) * Math.PI * 2;
    o.position.set(Math.cos(a) * 1.45, Math.sin(a * 2) * 0.12, Math.sin(a) * 1.45);
    o.scale.setScalar(lit ? 0.2 : 0.13);
    if (lit) glows(o);
    orbs.add(o);
  });
  lantern.add(orbs);
  root.add(lantern);

  // ---- the way on ----
  const beacon = makeBeacon();
  root.add(beacon);

  // the sun's shadow follows you round the isle
  const sun = plaza.atmos.sun;
  const sunDir = new THREE.Vector3(...plaza.theme.sunPos).normalize();
  if (sun) {
    const cam = sun.shadow.camera, e = 30;
    Object.assign(cam, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 110 });
    cam.updateProjectionMatrix();
  }

  let opening = null; // a gate sinking and its portal waking
  const nexus = {
    group: root, api, islets,
    update(dt, t, cam) {
      for (const k of pieces) k.world.update(dt, t, cam ? cam.clone().sub(k.p) : null);
      const calm = api.calmMotion();
      beacon.animate(t, calm);
      if (!calm) for (const f of figs) idleHop(f.m, f.st, dt, f.y, f.k);
      for (const k of islets) {
        const P = k.portal;
        if (P.heart.group.visible) P.heart.update(t + k.i * 1.7, calm);
      }
      gardenHeart.update(t, calm);
      crystal.rotation.y = t * 0.6;
      crystal.position.y = calm ? 0 : Math.sin(t * 1.3) * 0.12;
      orbs.rotation.y = calm ? 0 : -t * 0.25;
      if (opening) {
        const o = opening;
        o.t += dt;
        const k = Math.min(1, o.t / 1.4);
        if (o.k.gate) {
          o.k.gate.position.y = -3.2 * k * k;
          o.k.gate.visible = k < 1;
        }
        setWake(o.k, Math.min(1, Math.max(0, (o.t - 0.6) / 0.9)));
        if (o.t > 1.5) opening = null;
      }
      if (sun && cam) {
        sun.target.position.set(cam.x, 0, cam.z);
        sun.position.copy(sunDir).multiplyScalar(40).add(sun.target.position);
      }
    },
    // a closed world opens: its gate sinks into the bridge and the portal wakes
    openGate(i) {
      const k = islets[i];
      if (k.open) return;
      k.open = true;
      opening = { k, t: 0 };
    },
    setBeacon(i) {
      beacon.visible = i != null && i >= 0;
      if (!beacon.visible) return;
      // just behind the portal, so its light doesn't wash over the view through it
      const { pos } = islets[i].portal, u = islets[i].u;
      beacon.position.set(pos.x + u.x * 2.1, 0, pos.z + u.z * 2.1);
      beacon.userData.top = islets[i].slot.finale ? 7 : 5.4;
      beacon.userData.mark.position.y = beacon.userData.top;
    },
    // the open portal you're stepping into, if any (its slot index; the Garden's arch: the index after the worlds')
    portalAt(x, z) {
      if (Math.abs(x) < 1.05 && Math.abs(z) < 0.55) return GARDEN;
      for (const k of islets) {
        if (!k.open || k.portal.wake < 1) continue;
        const { pos } = k.portal, dx = x - pos.x, dz = z - pos.z;
        if (Math.abs(across(k, dx, dz)) < 1.05 && Math.abs(along(k, dx, dz)) < 0.55) return k.i;
      }
      return -1;
    },
    // the closed gate you're pressing against, if any
    gateAt(x, z) {
      for (const k of islets) if (!k.open && Math.abs(along(k, x, z) - GATE_A) < 1.6 && Math.abs(across(k, x, z)) < HW + 0.6) return k.i;
      return -1;
    },
    // the world you're at: on its islet, on its bridge, or by its sign
    slotAt(x, z) {
      for (const k of islets) {
        if (k.world.walkSd(x - k.p.x, z - k.p.z) < 0.5) return k.i;
        if (along(k, x, z) > PLAZA_R - 2.6 && bridgeSdOf({ ...k, open: true }, x, z) < 0.6) return k.i;
      }
      const s = plaza.out.signs.findIndex(sp => Math.hypot(x - sp.x, z - sp.z) < 2.2);
      if (s < 0 && Math.hypot(x, z) < 4.2) return GARDEN; // by the Garden's arch
      return s;
    },
    // where you stand stepping out of slot i's portal (facing the plaza), and on the plaza facing slot i
    arrival(i) {
      if (i === GARDEN) return { x: 0, z: 2.6, yaw: Math.PI }; // out of the arch, facing the south
      const k = islets[i], { pos } = k.portal;
      return { x: pos.x - k.u.x * 2.6, z: pos.z - k.u.z * 2.6, yaw: Math.atan2(k.u.x, k.u.z) };
    },
    plazaSpot(i) {
      if (i === GARDEN) return { x: 0, z: 5.5, yaw: 0 };
      const u = islets[i].u;
      return { x: u.x * 3.6, z: u.z * 3.6, yaw: Math.atan2(-u.x, -u.z) };
    },
    portalPos(i) { return i === GARDEN ? gardenPos.clone() : islets[i].portal.pos.clone(); },
    dispose() {
      for (const k of pieces) k.world.dispose();
      for (const g of figGeos) g.dispose();
      for (const h of hearts) h.dispose();
      for (const x of new Set(own)) x.dispose();
      beacon.dispose();
    },
  };
  return nexus;
}

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
