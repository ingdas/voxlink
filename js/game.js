import * as THREE from 'three';
import { LEVELS, CHAPTERS, expandLevel } from './levels.js';
import { buildWorld, PEDESTAL_TOP, dotTexture } from './world.js';
import { S, DIRS, INK, buildVoxelGeometry, voxelMaterial, generatePuzzle, mulberry32, cubeRotations, getPuzzleAtlas, sumFor, ATLAS_CELLS } from './voxels.js';
import { Player } from './player.js';
import { LAYER_OVERLAY } from './render.js';
import { t } from './i18n.js';

const LOOSE_RANGE = 5.5, SOCKET_RANGE = 14;
export const PACK_SIZE = 4;
export const CHUNK_MAX = 12; // puzzler mode: most blocks one ground-built chunk may hold
export const hashId = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 100000; };
const ease = t => 1 - Math.pow(1 - t, 3);
const easeBack = t => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

const badgeCache = new Map();
function badgeTexture(num, style) {
  const k = `${num}:${style}`;
  if (badgeCache.has(k)) return badgeCache.get(k);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const fill = style === 'ready' ? '#3ddc97' : style === 'dim' ? '#e9dfcf' : '#fff4e0';
  g.fillStyle = INK;
  g.beginPath(); g.arc(64, 70, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = fill;
  g.beginPath(); g.arc(64, 62, 50, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
  g.fillStyle = style === 'dim' ? '#8c829c' : INK;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const t = String(num);
  g.font = `700 ${t.length > 2 ? 44 : t.length > 1 ? 54 : 64}px Fredoka, sans-serif`;
  g.fillText(t, 64, 66);
  if (num === 6 || num === 9) g.fillRect(52, 94, 24, 6);
  if (style === 'ready') {
    // check mark badge so "ready" never relies on colour alone
    g.fillStyle = INK;
    g.beginPath(); g.arc(102, 27, 22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff4e0'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(92, 28); g.lineTo(99, 35); g.lineTo(112, 20); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  badgeCache.set(k, tex);
  return tex;
}

// Glowing ring + rising sparkles marking the updraft zone.
function makeLiftFx(scene, radius, top) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.12, radius + 0.12, 72),
    new THREE.MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const n = 140, pos = new Float32Array(n * 3), seeds = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = radius * (0.55 + Math.random() * 0.45);
    seeds.push({ a, r, y: Math.random() * (top + 2), s: 0.6 + Math.random() });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbff6ff, size: 0.12, map: dotTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  for (const o of [ring, pts]) o.layers.set(LAYER_OVERLAY);
  group.add(ring, pts);
  scene.add(group);
  let glow = 0;
  return {
    update(dt, t, inside, floating) {
      glow += ((inside ? 1 : 0) - glow) * Math.min(1, dt * 5);
      ring.material.opacity = 0.35 + 0.25 * Math.sin(t * 2.5) * 0.5 + glow * 0.35;
      pts.material.opacity = 0.35 + glow * 0.4;
      const speed = floating ? 3.2 : 1.1;
      seeds.forEach((p, i) => {
        p.y += dt * speed * p.s;
        if (p.y > top + 2) p.y = 0;
        p.a += dt * 0.25;
        pos[i * 3] = Math.cos(p.a) * p.r; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = Math.sin(p.a) * p.r;
      });
      geo.attributes.position.needsUpdate = true;
    },
    dispose() { scene.remove(group); ring.geometry.dispose(); ring.material.dispose(); geo.dispose(); pts.material.map.dispose(); pts.material.dispose(); },
  };
}

export class Game {
  constructor({ renderer, scene, camera, audio, input, fx, events }) {
    Object.assign(this, { renderer, scene, camera, audio, input, fx, events });
    this.player = new Player();
    this.player.onStep = (hs, surf) => {
      this.audio.step(surf?.sound);
      if (surf?.splash) {
        const p = this.player.pos;
        this.fx.burst(new THREE.Vector3(p.x, p.y + 0.12, p.z), 0xe6fbff, 5, 1.6);
      }
    };
    this.player.onLand = v => this.audio.land(v);
    this.player.onJump = () => this.audio.jump();
    this.player.onPad = () => {
      this.audio.boing();
      const p = this.player.pos;
      this.fx.burst(new THREE.Vector3(p.x, p.y + 0.15, p.z), 0xff9eef, 14, 3);
    };
    this.player.onRescue = () => this.audio.whoosh(1);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.enableAll();
    this.pickGroup = new THREE.Group();
    this.world = null;
    this.mode = 'idle'; // 'showcase' | 'intro' | 'play' | 'celebrate'
    this.t = 0;
    this.lastDt = 0.016;
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(S * 1.02, S * 1.02, S * 1.02),
      new THREE.MeshBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.ghost.geometry), new THREE.LineBasicMaterial({ color: 0x2a1f3d })));
    this.ghost.layers.set(LAYER_OVERLAY); this.ghost.children[0].layers.set(LAYER_OVERLAY);
    this.ghost.visible = false;
    this.handSpin = new THREE.Quaternion();
    this.spinAxis = new THREE.Vector3(0.35, 1, 0.2).normalize();
    this.sway = new THREE.Vector2();
    this.tmpQ = new THREE.Quaternion();
    this.pack = [];
    this.active = 0;
    this.comfort = { kick: 1, spin: 1 }; // scaled down by the reduced-motion setting
  }

  // ---------- level lifecycle ----------
  // resume: { seed, placed: [cell indices in link order], elapsed, hints }
  // level: campaign index, or a level object ({ id, name, voxels|figure, theme, kind, ... })
  load(index, resume = null) {
    this.unload();
    const level = typeof index === 'object' ? index : LEVELS[index];
    const chapter = CHAPTERS[level.chapter ?? 0];
    const themeId = level.theme || chapter.theme;
    this.levelIndex = level.index ?? -1;
    this.level = level;
    const { cells, height } = expandLevel(level);
    this.cells = cells;
    this.runSeed = resume?.seed ?? ((Math.random() * 1e9) | 0);
    const rng = mulberry32(this.runSeed);
    const layoutRng = mulberry32(1000 + hashId(level.id) * 7919);
    this.puzzle = generatePuzzle(cells, rng);
    // optional Puzzler mode (decided per load by a feature module; classic when unset)
    this.puzzler = !!this.puzzlerFor?.(level, resume);
    this.exprs = null;
    this.chunks = new Map(); // puzzler: id -> { id, members:Set, anchor, restPos, restQuat }
    this.nextChunk = 1;
    // keep scenery and loose blocks clear of the space the finished figure will occupy
    this.footR = Math.max(3.2, ...cells.map(c => Math.hypot(c.x, c.z) * S + S));
    const R = Math.max(12 + Math.sqrt(cells.length) * 1.25, this.footR + 14);
    this.world = buildWorld({
      rng: layoutRng, radius: R, seed: (hashId(level.id) % 97) + 1, quality: this.renderer.mobile ? 'low' : 'high', clearR: this.footR,
      theme: themeId, difficulty: Math.min(1, (level.chapter ?? 1) / 3 + (level.indexInChapter ?? 1) * 0.08),
    });
    this.scene.add(this.world.group);
    this.world.onFlash = () => { if (this.mode === 'play' || this.mode === 'showcase') this.audio.thunder(); };
    this.world.onGust = () => { if (this.mode === 'play' || this.mode === 'showcase') this.audio.whoosh(); };
    this.audio.setWorld?.(themeId);
    this.scene.fog.color.setHex(this.world.theme.skyHorizon);
    this.scene.fog.density = this.world.theme.fogDensity;
    this.scene.add(this.ghost);
    this.figureHeight = height * S;
    // tall figures get the Keeper's updraft around the pedestal (hold jump to float up)
    this.liftR = height >= 5 ? this.footR + 3.2 : 0;
    this.liftTop = PEDESTAL_TOP + this.figureHeight - 0.4;
    this.liftTold = false;
    this.liftFx = this.liftR ? makeLiftFx(this.scene, this.liftR, this.liftTop) : null;

    this.mat = voxelMaterial(this.renderer.gl);
    if (this.puzzler) this.mat.map = this.applySums().texture;
    this.voxels = cells.map((c, i) => {
      const geo = buildVoxelGeometry(this.puzzle.faces[i]);
      const mat = this.mat.clone();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.voxel = i;
      this.scene.add(mesh);
      const target = new THREE.Vector3(c.x * S, PEDESTAL_TOP + c.iy * S + S / 2, c.z * S);
      return {
        i, mesh, mat, cell: c, target, state: 'loose',
        num: this.puzzle.edgeNum[i], parent: this.puzzle.parent[i],
        rest: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
        anim: null, highlight: 0, pulse: 0, hop: 0,
        numbers: this.puzzle.faces[i].filter(f => f.type === 'num').map(f => f.num).sort((a, b) => a - b),
      };
    });
    this.structureColliders = [];
    this.sockets = new Map(); // child index -> socket
    this.placedCount = 0;
    this.pack = [];
    this.active = 0;
    this.computeStages();
    this.stage = 0;
    this.scatter(rng, Math.min(0.5, 0.18 + (level.chapter ?? 1) * 0.08));
    if (this.levelIndex === 0) {
      // tutorial: put the first block right in front of the player
      const first = this.voxels[this.puzzle.children[this.puzzle.root][0]];
      first.rest.pos.set(0.9, S / 2, Math.min(R - 3, 9) - 3.2);
      first.mesh.position.copy(first.rest.pos);
    }
    for (const r of this.puzzle.roots) this.place(r, true);
    // big figures start with a small pre-built core so several bubbles are open from the start
    const seed = cells.length < 30 ? 0 : Math.round(cells.length * 0.07);
    const queue = this.puzzle.roots.flatMap(r => this.puzzle.children[r]);
    for (let k = 0; k < seed && queue.length; k++) {
      const c = queue.splice(Math.floor(rng() * queue.length), 1)[0];
      this.place(c, true);
      queue.push(...this.puzzle.children[c]);
    }
    this.refreshColliders();

    this.player.spawn(0, Math.min(R - 3, 9), 0);
    this.linkOrder = [];
    if (resume) {
      for (const i of resume.placed) if (this.voxels[i] && this.voxels[i].state !== 'placed' && this.voxels[this.puzzle.parent[i]]?.state === 'placed') this.place(i, true);
      this.linkOrder = resume.placed.slice();
      this.refreshColliders();
    }
    this.stage = Math.min(this.stageCount - 1, Math.min(...this.voxels.filter(v => v.state !== 'placed').map(v => this.stageOf[v.i]), this.stageCount - 1));
    this.syncStage(false);
    this.elapsed = resume?.elapsed ?? 0;
    this.hintsUsed = resume?.hints ?? 0;
    this.splits = resume?.splits?.slice() ?? [];
    this.sinceLink = 0;
    this.hintCooldown = 0;
    this.hintMax = this.puzzler ? 16 : 8;
    this.focus = null;
    this.focusKey = '';
    this.waved = false;
    this.tutorial = this.levelIndex === 0 ? 1 : 0;
    this.packTipShown = false;
    this.barked = new Set();
    this.kick = 0;
    this.emitProgress();
    this.emitPack();
  }

  // Puzzler: the child side of every link shows a small sum instead of the plain number
  // (deterministic from the run seed; the parent side and the bubble keep the number).
  applySums() {
    const { faces, parent, parentDir, edgeNum } = this.puzzle;
    const rng = mulberry32((this.runSeed ^ 0x51ab1e) >>> 0);
    const base = this.cells.length - 1; // plain numbers use cells 1..n-1, sums go after them
    const tiles = [];
    this.exprs = {};
    for (let i = 0; i < this.cells.length; i++) {
      if (parent[i] < 0) continue;
      const k = edgeNum[i], cell = base + k;
      if (cell >= ATLAS_CELLS) continue; // no room left in the atlas: this face keeps its plain number
      const text = sumFor(k, rng);
      this.exprs[k] = text;
      tiles.push({ cell, text });
      faces[i][parentDir[i]] = { ...faces[i][parentDir[i]], cell, expr: text };
    }
    return getPuzzleAtlas(this.renderer.gl, tiles);
  }

  // ---------- puzzler chunks (blocks linked together on the ground) ----------
  membersOf(i) {
    const c = this.voxels[i].chunk;
    return c === undefined ? [i] : [...this.chunks.get(c).members];
  }
  // every carried block (a chunk counts with all its blocks)
  carriedAll() { return this.puzzler ? this.pack.flatMap(i => this.membersOf(i)) : this.pack; }
  slotOf(i) {
    if (!this.puzzler) return this.pack.indexOf(i);
    const c = this.voxels[i].chunk;
    return this.pack.findIndex(p => p === i || (c !== undefined && this.voxels[p].chunk === c));
  }
  carrying(i) { return this.slotOf(i) >= 0; }
  hasFitInPack() { return this.carriedAll().some(i => this.sockets.has(i)); }
  // the block of a group whose parent lies outside it (the one that links to the figure)
  topOf(members) {
    const set = new Set(members);
    return members.find(m => !set.has(this.puzzle.parent[m])) ?? members[0];
  }
  // what a slot / tooltip shows for a block or chunk: its numbers that can still link
  itemInfo(rep) {
    const mem = this.membersOf(rep), set = new Set(mem), top = this.topOf(mem);
    const list = [];
    for (const m of mem) {
      const v = this.voxels[m];
      if (!set.has(v.parent) && v.parent >= 0) list.push({ n: v.num, label: this.exprs?.[v.num], link: true });
      for (const c of this.puzzle.children[m]) if (!set.has(c)) list.push({ n: this.voxels[c].num });
    }
    list.sort((a, b) => (b.link ? 1 : 0) - (a.link ? 1 : 0) || a.n - b.n); // the linking face first
    const tv = this.voxels[top];
    return { numbers: list.map(x => x.n), labels: list.map(x => x.label), link: tv.num, fits: this.sockets.has(top), color: tv.cell.color, count: mem.length };
  }
  // pack slot whose block/chunk links straight onto loose block b (-2: it would, but the chunk would get too big)
  attachSlot(b) {
    if (!this.puzzler || !this.pack.length || this.voxels[b].state !== 'loose') return -1;
    const B = new Set(this.membersOf(b));
    const order = [this.active, ...this.pack.keys()].filter((k, j, a) => a.indexOf(k) === j && k < this.pack.length);
    let tooBig = false;
    for (const k of order) {
      const A = this.membersOf(this.pack[k]);
      if (!A.some(a => B.has(this.puzzle.parent[a]) || this.puzzle.children[a].some(c => B.has(c)))) continue;
      if (A.length + B.size > CHUNK_MAX) { tooBig = true; continue; }
      return k;
    }
    return tooBig ? -2 : -1;
  }
  // Rest positions of a chunk's blocks from its anchor transform; then sit it on the ground.
  layoutChunk(ch) {
    const a = this.voxels[ch.anchor].cell;
    const pts = [];
    for (const m of ch.members) {
      const c = this.voxels[m].cell;
      const p = new THREE.Vector3(c.ix - a.ix, c.iy - a.iy, c.iz - a.iz).multiplyScalar(S).applyQuaternion(ch.restQuat).add(ch.restPos);
      p.y = ch.restPos.y + Math.round((p.y - ch.restPos.y) / S) * S;
      pts.push([m, p]);
    }
    let shift = -Infinity;
    for (const [, p] of pts) shift = Math.max(shift, this.world.heightAt(p.x, p.z, p.y + S / 2) + S / 2 - p.y);
    ch.restPos.y += shift;
    for (const [m, p] of pts) {
      const w = this.voxels[m];
      w.rest.pos.copy(p).setY(p.y + shift);
      w.rest.quat.copy(ch.restQuat);
    }
    return shift;
  }
  // centre of a chunk in cells relative to its anchor, and its radius in metres
  chunkShape(ch) {
    const a = this.voxels[ch.anchor].cell, mid = new THREE.Vector3();
    for (const m of ch.members) { const c = this.voxels[m].cell; mid.x += c.ix - a.ix; mid.y += c.iy - a.iy; mid.z += c.iz - a.iz; }
    mid.divideScalar(ch.members.size);
    let r = 0;
    for (const m of ch.members) { const c = this.voxels[m].cell; r = Math.max(r, Math.hypot(c.ix - a.ix - mid.x, c.iz - a.iz - mid.z)); }
    return { mid, radius: r * S + S / 2 };
  }
  // put a carried chunk down centred on pos (upright, random turn), animating every block
  restChunk(ch, pos, dur) {
    ch.restQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6);
    const off = this.chunkShape(ch).mid.multiplyScalar(S).applyQuaternion(ch.restQuat);
    ch.restPos.set(pos.x - off.x, pos.y, pos.z - off.z);
    this.layoutChunk(ch);
    [...ch.members].forEach((m, j) => {
      const w = this.voxels[m];
      this.startAnim(w, 'dropping', w.rest.pos, w.rest.quat, dur);
      w.anim.quiet = j > 0;
    });
  }
  // link the block/chunk in pack slot k onto loose block b (and its chunk) right where b lies
  attach(k, b) {
    const rep = this.pack[k], A = this.membersOf(rep), bv = this.voxels[b];
    let ch = bv.chunk !== undefined ? this.chunks.get(bv.chunk) : null;
    if (!ch) {
      ch = { id: this.nextChunk++, members: new Set([b]), anchor: b, restPos: bv.rest.pos.clone(), restQuat: bv.rest.quat.clone() };
      this.chunks.set(ch.id, ch);
      bv.chunk = ch.id;
    }
    const before = [...ch.members];
    const oldId = this.voxels[rep].chunk;
    if (oldId !== undefined) this.chunks.delete(oldId);
    for (const m of A) { ch.members.add(m); this.voxels[m].chunk = ch.id; }
    this.pack.splice(k, 1);
    this.active = Math.max(0, Math.min(this.active > k ? this.active - 1 : this.active, this.pack.length - 1));
    const shift = this.layoutChunk(ch);
    A.forEach((m, j) => {
      const w = this.voxels[m];
      this.startAnim(w, 'dropping', w.rest.pos, w.rest.quat, 0.32);
      w.anim.quiet = j > 0;
    });
    if (shift > 1e-3) for (const m of before) { const w = this.voxels[m]; this.startAnim(w, 'dropping', w.rest.pos, w.rest.quat, 0.32); w.anim.quiet = true; }
    this.ghost.visible = false;
    this.audio.tone({ f: 420, f2: 760, type: 'triangle', dur: 0.16, vol: 0.09 });
    this.fx.burst(bv.rest.pos, bv.cell.color, 12, 2.5);
    this.events.vibrate?.(14);
    if (ch.members.size >= 3 && !this.barked.has('chunk')) { this.barked.add('chunk'); this.events.kubo?.(t('puzzler.kubo.chunk', { n: ch.members.size })); }
    this.emitPack();
  }
  // a carried chunk flies onto the figure; its blocks are placed in tree order when it lands
  launchChunk(top) {
    const ch = this.chunks.get(this.voxels[top].chunk);
    this.chunks.delete(ch.id);
    const order = [top];
    for (let q = 0; q < order.length; q++) for (const c of this.puzzle.children[order[q]]) if (ch.members.has(c)) order.push(c);
    order.forEach((m, j) => {
      const w = this.voxels[m];
      w.chunk = undefined;
      this.startAnim(w, 'flying', w.target, new THREE.Quaternion(), 0.4);
      if (j === 0) w.anim.group = order; else w.anim.follow = true;
    });
  }
  placeGroup(order) {
    order.forEach((m, j) => { this.quietLink = j > 0; this.place(m); });
    this.quietLink = false;
    if (order.length > 1) this.audio.tone({ f: 700, f2: 1300, type: 'sine', dur: 0.3, vol: 0.08 });
  }

  // Big figures are built in parts (bottom first). A block's part is never earlier than its parent's.
  computeStages() {
    const n = this.cells.length;
    this.stageCount = n > 44 ? Math.ceil(n / 34) : 1;
    this.stageOf = new Array(n).fill(0);
    if (this.stageCount === 1) return;
    const byHeight = this.cells.map((c, i) => i).sort((a, b) => (this.cells[a].iy - this.cells[b].iy) || (Math.hypot(this.cells[a].x, this.cells[a].z) - Math.hypot(this.cells[b].x, this.cells[b].z)));
    byHeight.forEach((i, rank) => { this.stageOf[i] = Math.floor((rank * this.stageCount) / n); });
    const queue = [...this.puzzle.roots];
    for (const r of queue) this.stageOf[r] = 0;
    while (queue.length) {
      const p = queue.shift();
      for (const c of this.puzzle.children[p]) { this.stageOf[c] = Math.max(this.stageOf[c], this.stageOf[p]); queue.push(c); }
    }
  }

  stageCleared(k) { return this.voxels.every(v => this.stageOf[v.i] > k || v.state === 'placed'); }

  // Show the blocks of the current part (raining them in when a new part starts) and open its bubbles.
  syncStage(rain) {
    for (const v of this.voxels) {
      const inStage = this.stageOf[v.i] <= this.stage;
      if (!inStage && v.state === 'loose') { v.state = 'waiting'; v.mesh.visible = false; }
      else if (inStage && v.state === 'waiting') {
        v.mesh.visible = true;
        if (rain) {
          const from = v.rest.pos.clone().add(new THREE.Vector3(0, 16 + Math.random() * 8, 0));
          v.mesh.position.copy(from);
          this.startAnim(v, 'dropping', v.rest.pos, v.rest.quat, 0.9);
          v.anim.from.copy(from);
          v.anim.delay = Math.random() * 1.6;
          v.anim.quiet = Math.random() > 0.2;
        } else v.state = 'loose';
      }
    }
    for (const v of this.voxels) {
      if (v.state !== 'placed') continue;
      for (const c of this.puzzle.children[v.i]) if (this.voxels[c].state !== 'placed' && this.stageOf[c] <= this.stage && !this.sockets.has(c)) this.addSocket(c);
    }
  }

  advanceStage() {
    this.stage++;
    this.syncStage(true);
    this.fx.confettiBurst(new THREE.Vector3(0, PEDESTAL_TOP + this.figureHeight * 0.6, 0), 2, 90);
    [0, 1, 2].forEach(k => setTimeout(() => this.audio.star(k), 150 + k * 160));
    this.events.stage?.(this.stage, this.stageCount);
    this.events.kubo?.(this.stage === this.stageCount - 1
      ? t('kubo.partLast', { k: this.stage })
      : t('kubo.part', { k: this.stage, n: this.stageCount }));
    this.emitProgress();
  }

  // Nearest block that fits right now — only offered when the player seems stuck.
  radarTarget() {
    if (this.mode !== 'play' || this.sinceLink < (this.puzzler ? 45 : 20) || this.hasFitInPack()) return null;
    let best = null, bd = Infinity;
    for (const v of this.voxels) {
      if (v.state !== 'loose' || !this.sockets.has(v.i)) continue;
      const d = v.mesh.position.distanceToSquared(this.player.pos);
      if (d < bd) { bd = d; best = v.mesh.position; }
    }
    return best;
  }

  unload() {
    if (!this.world) return;
    this.scene.remove(this.world.group);
    this.world.dispose();
    for (const v of this.voxels) { this.scene.remove(v.mesh); v.mesh.geometry.dispose(); v.mat.dispose(); }
    for (const s of [...this.sockets.values()]) this.removeSocket(s);
    this.mat.dispose();
    this.fx.clearBeam();
    this.liftFx?.dispose();
    this.liftFx = null;
    this.world = null;
  }

  scatter(rng, topShare) {
    const w = this.world;
    const placedPts = [];
    const ok = (x, z, y) => placedPts.every(p => Math.hypot(p.x - x, p.z - z) > 1.15 || Math.abs(p.y - y) > 1);
    const loose = this.voxels.filter(v => !this.puzzle.roots.includes(v.i));
    const rots = cubeRotations();
    const nTop = Math.min(w.tops.length * 3, Math.round(loose.length * topShare));
    // shuffle so the high-up blocks are a random selection
    const order = loose.slice().sort(() => rng() - 0.5);
    order.forEach((v, k) => {
      let pos = null;
      // a high spot first if this block should be up top (falls back to the ground when the tops are full)
      const free = (x, z, y) => [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, 0]].every(([dx, dz]) => w.heightAt(x + dx, z + dz) <= y + 0.01);
      for (let tries = 0; tries < 400 && !pos; tries++) {
        if (k < nTop && w.tops.length && tries < 150) {
          const t = w.tops[Math.floor(rng() * w.tops.length)];
          const x = THREE.MathUtils.lerp(t.box.min.x + 0.45, t.box.max.x - 0.45, rng());
          const z = THREE.MathUtils.lerp(t.box.min.z + 0.45, t.box.max.z - 0.45, rng());
          if (free(x, z, t.y) && ok(x, z, t.y)) pos = new THREE.Vector3(x, t.y, z);
        } else {
          const th = rng() * Math.PI * 2;
          const r0 = Math.max(4, this.footR + 1.2);
          const r = r0 + Math.sqrt(rng()) * (w.R - 1 - r0);
          const x = Math.cos(th) * r, z = Math.sin(th) * r;
          if (w.isFreeGround(x, z, tries < 300 ? 0.5 : 0)) {
            const y = w.groundY ? w.groundY(x, z) : 0;
            if (tries >= 340 || ok(x, z, y)) pos = new THREE.Vector3(x, y, z);
          }
        }
      }
      if (!pos) pos = new THREE.Vector3((rng() - 0.5) * 8, 0, 4 + rng() * 3);
      placedPts.push(pos);
      // keep the face that links to the figure from pointing into the ground
      const n = new THREE.Vector3(...DIRS[this.puzzle.parentDir[v.i]].n);
      let q;
      for (let t = 0; t < 20; t++) {
        q = rots[Math.floor(rng() * rots.length)];
        if (n.clone().applyQuaternion(q).y > -0.5) break;
      }
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      v.rest.quat.copy(yaw).multiply(q);
      v.rest.pos.set(pos.x, pos.y + S / 2, pos.z);
      v.mesh.position.copy(v.rest.pos);
      v.mesh.quaternion.copy(v.rest.quat);
    });
  }

  refreshColliders() {
    this.colliders = this.world.colliders.concat(this.structureColliders);
    this.blockers = this.world.blockers.concat(this.voxels.filter(v => v.state === 'placed').map(v => v.mesh));
  }

  // ---------- sockets ----------
  addSocket(child) {
    const v = this.voxels[child];
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(v.num, 'idle'), depthWrite: false, transparent: true }));
    sprite.layers.set(LAYER_OVERLAY);
    sprite.position.copy(v.target);
    sprite.scale.setScalar(0.001);
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    // faint copy drawn through the figure, so hidden bubbles can still be found
    const ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite.material.map, depthTest: false, depthWrite: false, transparent: true, opacity: 0.28 }));
    ghost.layers.set(LAYER_OVERLAY);
    ghost.renderOrder = 4;
    sprite.add(ghost);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(S, S, S));
    proxy.position.copy(v.target);
    proxy.userData.socket = child;
    this.pickGroup.add(proxy);
    this.pickGroup.updateMatrixWorld(true);
    this.sockets.set(child, { child, num: v.num, sprite, proxy, style: 'idle', born: this.t, phase: Math.random() * 6 });
  }
  removeSocket(s) {
    this.scene.remove(s.sprite);
    s.sprite.material.dispose();
    s.sprite.children[0]?.material.dispose();
    this.pickGroup.remove(s.proxy);
    s.proxy.geometry.dispose();
    this.sockets.delete(s.child);
  }

  place(i, instant = false) {
    const v = this.voxels[i];
    v.state = 'placed';
    v.anim = null;
    v.mesh.position.copy(v.target);
    v.mesh.quaternion.identity();
    v.mesh.scale.setScalar(1);
    v.mesh.castShadow = true;
    v.mat.emissive.setScalar(0);
    this.placedCount++;
    const sock = this.sockets.get(i);
    if (sock) this.removeSocket(sock);
    for (const c of this.puzzle.children[i]) if (this.voxels[c].state !== 'placed' && this.stageOf[c] <= this.stage) this.addSocket(c);
    this.structureColliders.push(new THREE.Box3().setFromCenterAndSize(v.target, new THREE.Vector3(S, S, S)));
    this.refreshColliders();
    this.emitPack();
    if (!instant) {
      v.pulse = 1;
      this.kick = 1;
      this.player.resolvePenetration(this.colliders);
      const n = this.voxels.length, left = n - this.placedCount;
      const frac = this.placedCount / n;
      for (const [m, line] of [[0.25, t('kubo.q1')], [0.5, t('kubo.q2')], [0.75, t('kubo.q3')]]) {
        if (n >= 16 && frac >= m && !this.barked.has(m)) { this.barked.add(m); this.events.kubo?.(line); }
      }
      if (n >= 16 && left === 3 && !this.barked.has('last')) { this.barked.add('last'); this.events.kubo?.(t('kubo.last3')); }
      this.fx.burst(v.target, v.cell.color, 24, 4);
      if (!this.quietLink) { this.audio.link(this.placedCount / this.voxels.length); this.events.vibrate?.(18); }
      this.emitProgress();
      this.linkOrder.push(i);
      this.sinceLink = 0;
      const fr = this.placedCount / this.voxels.length;
      while (this.splits.length < 3 && fr >= (this.splits.length + 1) * 0.25) this.splits.push(Math.round(this.elapsed * 10) / 10);
      this.events.link?.(this, i);
      if (this.placedCount < this.voxels.length && this.stage < this.stageCount - 1 && this.stageCleared(this.stage)) this.advanceStage();
      if (this.placedCount === this.voxels.length) this.complete();
      else this.events.saveSession?.(this.sessionData());
    }
  }

  // ---------- interaction ----------
  rayFrom(x, y) {
    const ndc = new THREE.Vector2();
    if (x === undefined) ndc.set(0, 0);
    else ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.far = SOCKET_RANGE + 2;
    const hits = [];
    const loose = this.voxels.filter(v => v.state === 'loose').map(v => v.mesh);
    for (const h of this.raycaster.intersectObjects(loose, false)) { hits.push({ kind: 'loose', i: h.object.userData.voxel, d: h.distance }); break; }
    for (const h of this.raycaster.intersectObjects(this.pickGroup.children, false)) { hits.push({ kind: 'socket', child: h.object.userData.socket, d: h.distance }); break; }
    for (const h of this.raycaster.intersectObjects(this.blockers, false)) {
      const vi = h.object.userData.voxel;
      if (vi !== undefined && h.face) {
        // a numbered face on the figure counts as its bubble
        const n = h.face.normal;
        const d = DIRS.findIndex(D => Math.round(n.x) === D.n[0] && Math.round(n.y) === D.n[1] && Math.round(n.z) === D.n[2]);
        let child = this.puzzle.children[vi].find(c => this.sockets.has(c) && this.puzzle.parentDir[c] === (d ^ 1));
        // clicking the block a carried block belongs to links it too (handy when its bubble is hidden)
        if (child === undefined || !this.carrying(child)) {
          const carried = this.carriedAll().find(c => this.puzzle.parent[c] === vi && this.sockets.has(c));
          if (carried !== undefined) child = carried;
        }
        if (child !== undefined) { hits.push({ kind: 'socket', child, d: h.distance }); break; }
      }
      hits.push({ kind: 'block', d: h.distance });
      break;
    }
    hits.sort((a, b) => a.d - b.d);
    let h = hits[0];
    const blockD = hits.find(k => k.kind === 'block')?.d ?? Infinity;
    // forgiving aim: snap to a nearby bubble / block on screen
    if (!h || h.kind === 'block') {
      const sx = x ?? innerWidth / 2, sy = y ?? innerHeight / 2;
      const near = this.screenSnap(sx, sy, x === undefined ? 26 : 44, blockD);
      if (near) h = near;
    }
    if (!h || h.kind === 'block') return null;
    if (h.kind === 'loose' && h.d > LOOSE_RANGE) return { ...h, far: true };
    if (h.kind === 'socket' && h.d > SOCKET_RANGE) return { ...h, far: true };
    return h;
  }

  screenSnap(sx, sy, radius, maxD) {
    let best = null, bestD = radius;
    const v = new THREE.Vector3();
    const test = (pos, make) => {
      const dist = pos.distanceTo(this.camera.position);
      if (dist > maxD + 0.5) return;
      v.copy(pos).project(this.camera);
      if (v.z > 1 || v.z < -1) return;
      const px = (v.x * 0.5 + 0.5) * innerWidth, py = (-v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(px - sx, py - sy);
      if (d < bestD) { bestD = d; best = make(dist); }
    };
    for (const s of this.sockets.values()) test(s.sprite.position, d => ({ kind: 'socket', child: s.child, d }));
    for (const vx of this.voxels) if (vx.state === 'loose') test(vx.mesh.position, d => ({ kind: 'loose', i: vx.i, d }));
    return best;
  }

  interact(x, y) {
    if (this.mode !== 'play') return;
    const h = this.rayFrom(x, y);
    if (!h) return;
    if (h.far) { this.events.toast?.(t('toast.far')); this.audio.wrong(); return; }
    if (h.kind === 'loose') {
      if (this.puzzler) {
        const k = this.attachSlot(h.i);
        if (k >= 0) return this.attach(k, h.i);
        if (k === -2) { this.audio.wrong(); this.events.toast?.(t('puzzler.toast.chunkMax', { n: CHUNK_MAX })); return; }
      }
      return this.grab(h.i);
    }
    if (h.kind === 'socket') {
      if (this.carrying(h.child)) return this.launch(h.child);
      const num = this.voxels[h.child].num;
      this.audio.wrong();
      this.shakeSocket(h.child);
      this.events.vibrate?.([10, 40, 10]);
      if (!this.pack.length) this.events.toast?.(t('toast.findNum', { n: num }));
      else this.events.toast?.(t('toast.noneHas', { n: num }));
    }
  }

  shakeSocket(child) { const s = this.sockets.get(child); if (s) s.shake = 0.4; }

  grab(i) {
    const v = this.voxels[i];
    if (this.pack.length >= PACK_SIZE) {
      // swap: the active block takes the grabbed block's resting spot
      const old = this.voxels[this.pack[this.active]];
      if (old.chunk !== undefined) this.restChunk(this.chunks.get(old.chunk), v.rest.pos, 0.35);
      else {
        old.rest.pos.copy(v.rest.pos);
        old.rest.quat.copy(v.rest.quat);
        this.startAnim(old, 'dropping', old.rest.pos, old.rest.quat, 0.35);
      }
      this.pack.splice(this.active, 1);
      this.events.toast?.(t('toast.swapped'));
    }
    this.pack.push(i);
    this.active = this.pack.length - 1;
    for (const m of this.membersOf(i)) {
      const w = this.voxels[m];
      w.state = 'lifting';
      w.mesh.castShadow = false;
      w.anim = { t: 0, dur: 0.22, from: w.mesh.position.clone(), fromQ: w.mesh.quaternion.clone() };
      if (this.fx.beamTarget === w.mesh) this.fx.clearBeam();
    }
    this.audio.pickup();
    this.events.vibrate?.(10);
    if (this.tutorial === 1 || this.tutorial === 2) this.tutorial = this.sockets.has(i) ? 3 : 2;
    if (this.pack.length === 2 && !this.packTipShown && this.levelIndex >= 0 && this.levelIndex <= 4) {
      this.packTipShown = true;
      this.events.toast?.(t('toast.carry', { n: PACK_SIZE }));
    }
    this.emitPack();
  }

  selectSlot(k) {
    if (k < 0 || k >= this.pack.length) return;
    this.active = k;
    this.audio.hover();
    this.emitPack();
  }
  cycleSlot(d) { if (this.pack.length > 1) this.selectSlot((this.active + d + this.pack.length) % this.pack.length); }

  drop() {
    if (!this.pack.length || this.mode !== 'play') return;
    const v = this.voxels[this.pack[this.active]];
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const reach = 1.2 + (v.chunk !== undefined ? this.chunkShape(this.chunks.get(v.chunk)).radius - S / 2 : 0);
    let x = p.pos.x + fx * reach, z = p.pos.z + fz * reach;
    const r = Math.hypot(x, z);
    const minR = Math.max(3.7, this.footR + 0.8);
    if (r < minR) { const k = minR / Math.max(r, 0.01); x *= k; z *= k; }
    let y;
    if (this.world.dropPoint) ({ x, y, z } = this.world.dropPoint(x, z, p.pos.y + 0.6, p.pos.x, p.pos.z));
    else {
      const th = Math.atan2(z, x), maxR = this.world.radiusAt(th) - 1;
      if (Math.hypot(x, z) > maxR) { const k = maxR / Math.hypot(x, z); x *= k; z *= k; }
      y = this.world.heightAt(x, z, p.pos.y + 0.6);
    }
    if (v.chunk !== undefined) this.restChunk(this.chunks.get(v.chunk), new THREE.Vector3(x, y + S / 2, z), 0.4);
    else {
      v.rest.pos.set(x, y + S / 2, z);
      v.rest.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6).multiply(cubeRotations()[Math.floor(Math.random() * 24)]);
      this.startAnim(v, 'dropping', v.rest.pos, v.rest.quat, 0.4);
    }
    this.pack.splice(this.active, 1);
    this.active = Math.max(0, Math.min(this.active, this.pack.length - 1));
    this.audio.drop();
    this.emitPack();
  }

  launch(i) {
    const v = this.voxels[i];
    this.pack.splice(this.slotOf(i), 1);
    if (this.active >= this.pack.length) this.active = Math.max(0, this.pack.length - 1);
    if (v.chunk !== undefined) this.launchChunk(i);
    else this.startAnim(v, 'flying', v.target, new THREE.Quaternion(), 0.34);
    this.ghost.visible = false;
    this.audio.tone({ f: 500, f2: 900, type: 'sine', dur: 0.2, vol: 0.08 });
    if (this.tutorial === 3) this.tutorial = 4;
    this.emitPack();
  }

  startAnim(v, state, toPos, toQuat, dur) {
    v.state = state;
    v.anim = { t: 0, dur, from: v.mesh.position.clone(), fromQ: v.mesh.quaternion.clone(), to: toPos.clone(), toQ: toQuat.clone(), fromScale: v.mesh.scale.x };
  }

  hint() {
    if (this.mode !== 'play') return;
    const fitInPack = this.carriedAll().find(i => this.sockets.has(i));
    if (fitInPack !== undefined) {
      // free: you're already carrying a fitting block, just point at its bubble
      const s = this.sockets.get(fitInPack);
      s.shake = 0.8;
      this.fx.pointBeam(s.sprite);
      this.events.toast?.(t('toast.carrying', { n: s.num }));
      this.audio.hint();
      return;
    }
    if (this.hintCooldown > 0) { this.events.toast?.(t('toast.recharging')); return; }
    const fits = this.voxels.filter(v => v.state === 'loose' && this.sockets.has(v.i));
    if (!fits.length) return;
    this.hintCooldown = this.hintMax;
    this.hintsUsed++;
    this.audio.hint();
    const pp = this.player.pos;
    fits.sort((a, b) => a.mesh.position.distanceToSquared(pp) - b.mesh.position.distanceToSquared(pp));
    const v = fits[0];
    for (const m of this.membersOf(v.i)) this.voxels[m].hop = 4;
    this.fx.pointBeam(v.mesh);
    this.events.toast?.(t('toast.follow', { n: v.num }));
  }

  complete() {
    this.mode = 'celebrate';
    this.celebrateT = 0;
    this.input.exitLock();
    this.fx.clearBeam();
    this.camFrom = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    this.orbitAngle = Math.atan2(this.camera.position.x, this.camera.position.z);
    this.splits.push(Math.round(this.elapsed * 10) / 10);
    this.events.complete?.({ time: this.elapsed, hints: this.hintsUsed, splits: this.splits.slice() });
  }

  // ---------- per-frame ----------
  update(dt) {
    this.t += dt;
    this.lastDt = dt;
    if (!this.world) return;
    this.world.update(dt, this.t, this.camera.position);

    if (this.mode === 'play') this.updatePlay(dt);
    else if (this.mode === 'showcase') this.updateOrbit(dt, 0.08, 1);
    else if (this.mode === 'celebrate') this.updateCelebrate(dt);
    else if (this.mode === 'intro') this.updateIntro(dt);

    this.camera.updateMatrixWorld();
    this.updateVoxels(dt);
    this.updateSockets(dt);
    this.fx.update(dt, this.camera);
  }

  orbitPose(angle, distMul = 1) {
    const R = Math.max(7.5, this.figureHeight * 1.5 + 4) * distMul;
    const cy = PEDESTAL_TOP + this.figureHeight * 0.5;
    const pos = new THREE.Vector3(Math.sin(angle) * R, cy + R * 0.42, Math.cos(angle) * R);
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(0, cy - 0.3, 0), new THREE.Vector3(0, 1, 0));
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }

  updateOrbit(dt, speed, distMul) {
    this.orbitAngle = (this.orbitAngle ?? 0.6) + dt * speed;
    const p = this.orbitPose(this.orbitAngle, distMul);
    this.camera.position.copy(p.pos);
    this.camera.quaternion.copy(p.quat);
  }

  // camera glides from the orbit down to the player's eyes
  startIntro() {
    this.mode = 'intro';
    this.introT = 0;
    this.camFrom = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
  }
  updateIntro(dt) {
    this.introT += dt / 1.4;
    const k = ease(Math.min(1, this.introT));
    this.player.applyCamera(this.camera);
    const toP = this.camera.position.clone(), toQ = this.camera.quaternion.clone();
    this.camera.position.lerpVectors(this.camFrom.pos, toP, k);
    this.camera.quaternion.slerpQuaternions(this.camFrom.quat, toQ, k);
    if (this.introT >= 1) { this.mode = 'play'; this.input.takeActions(); this.events.introDone?.(); }
  }

  updateCelebrate(dt) {
    this.celebrateT += dt;
    const t = this.celebrateT;
    if (t > 0.35 && !this.waved) {
      this.waved = true;
      this.voxels.forEach(v => { v.waveAt = t + v.cell.iy * 0.07 + Math.random() * 0.05; });
      this.audio.win();
      this.fx.confettiBurst(new THREE.Vector3(0, PEDESTAL_TOP + this.figureHeight, 0), 3, 240);
    }
    this.orbitAngle += dt * 0.25 * this.comfort.spin;
    const target = this.orbitPose(this.orbitAngle, 0.85);
    const k = ease(Math.min(1, t / 2.2));
    this.camera.position.lerpVectors(this.camFrom.pos, target.pos, k);
    this.camera.quaternion.slerpQuaternions(this.camFrom.quat, target.quat, k);
    // the finished figure hops and does a turn on its pedestal
    const hop = Math.max(0, Math.sin(THREE.MathUtils.clamp((t - 0.35) / 0.55, 0, 1) * Math.PI)) * 0.6;
    const spinK = THREE.MathUtils.clamp((t - 0.7) / 2.6, 0, 1);
    const rot = (spinK < 0.5 ? 2 * spinK * spinK : 1 - Math.pow(-2 * spinK + 2, 2) / 2) * Math.PI * 2;
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const v of this.voxels) {
      if (v.waveAt !== undefined && t >= v.waveAt) { v.pulse = 1; v.waveAt = undefined; }
      const p = v.target;
      v.mesh.position.set(p.x * c + p.z * sn, p.y + hop, -p.x * sn + p.z * c);
      v.mesh.rotation.set(0, rot, 0);
    }
  }

  updatePlay(dt) {
    const look = this.input.poll();
    for (const a of this.input.takeActions()) {
      if (a.type === 'jump') this.player.jumpBuffer = 0.14;
      else if (a.type === 'interact') this.interact(a.x, a.y);
      else if (a.type === 'drop') this.drop();
      else if (a.type === 'hint') this.hint();
      else if (a.type === 'pause') this.events.pause?.();
      else if (a.type === 'slot') this.selectSlot(a.k);
      else if (a.type === 'cycle') this.cycleSlot(a.d);
    }
    const r = Math.hypot(this.player.pos.x, this.player.pos.z);
    const lift = this.liftR && r < this.liftR ? { maxY: this.liftTop } : null;
    if (this.liftR && !this.liftTold && (lift || this.elapsed > 8)) { this.liftTold = true; this.events.kubo?.(t(this.input.mobile ? 'kubo.lift.touch' : 'kubo.lift')); }
    this.player.update(dt, this.input, look, this.colliders, this.world, lift);
    if (this.liftFx) this.liftFx.update(dt, this.t, !!lift, this.player.floating);
    this.player.applyCamera(this.camera);
    if (this.kick > 0.001 || this.camera.fov !== this.camera.userData.baseFov) {
      this.kick = this.kick > 0.002 ? this.kick * Math.exp(-dt * 9) : 0;
      this.camera.fov = (this.camera.userData.baseFov || 70) * (1 + this.kick * 0.03 * this.comfort.kick);
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.sway.x += (look.x * 1.5 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (look.y * 1.5 - this.sway.y) * Math.min(1, dt * 10);
    this.elapsed += dt;
    this.sinceLink += dt;
    this.hintCooldown = Math.max(0, this.hintCooldown - dt);
    if (this.tutorial === 1 && this.elapsed > 3) this.tutorial = 2;

    this.setFocus(this.input.mobile ? null : this.rayFrom());
    this.events.tick?.(this);
  }

  setFocus(f) {
    const key = f ? `${f.kind}:${f.i ?? f.child}:${f.far ? 1 : 0}:${this.pack.join(',')}` : '';
    if (key === this.focusKey) return;
    const prevLoose = this.focus?.kind === 'loose' ? this.focus.i : -1;
    this.focusKey = key;
    this.focus = f;
    let info = null;
    if (f && f.kind === 'loose') {
      const v = this.voxels[f.i];
      if (this.puzzler) {
        // no "this one fits" giveaway in puzzler mode; say whether it links to what you carry
        const it = this.itemInfo(f.i);
        info = { kind: 'loose', far: f.far, numbers: it.numbers, labels: it.labels, fit: null, full: this.pack.length >= PACK_SIZE, count: it.count, attach: this.attachSlot(f.i) >= 0 };
      } else info = { kind: 'loose', far: f.far, numbers: v.numbers, fit: this.sockets.has(v.i) ? v.num : null, full: this.pack.length >= PACK_SIZE };
      if (!f.far && f.i !== prevLoose) this.audio.hover();
    } else if (f && f.kind === 'socket') {
      info = { kind: 'socket', far: f.far, num: this.voxels[f.child].num, ok: this.carrying(f.child), holding: this.pack.length > 0 };
    }
    this.events.focus?.(info);
  }

  handPoses() {
    const portrait = this.camera.aspect < 1;
    const x = portrait ? 0.14 : 0.3;
    const y = portrait ? -0.3 : -0.24;
    this.handSpin.multiply(this.tmpQ.setFromAxisAngle(this.spinAxis, 0.7 * this.lastDt));
    const bob = Math.sin(this.t * 2) * 0.008;
    const poses = [];
    // only the active block is held up in view; the rest ride in the backpack (HUD slots)
    this.pack.forEach((vi, k) => {
      const isActive = k === this.active;
      const local = isActive
        ? new THREE.Vector3(x - this.sway.x * 0.5, y + this.sway.y * 0.5 + bob, -0.9)
        : new THREE.Vector3(0, -0.75, -0.6);
      const pos = local.applyMatrix4(this.camera.matrixWorld);
      const quat = this.camera.quaternion.clone().multiply(this.handSpin);
      const mem = this.voxels[vi].chunk !== undefined ? this.membersOf(vi) : null;
      if (!mem) { poses[vi] = { pos, quat, scale: isActive ? 0.3 : 0.05, hidden: !isActive }; return; }
      // a chunk is shown shrunk so the whole group is about one held block big
      const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity), c = new THREE.Vector3();
      for (const m of mem) { const cl = this.voxels[m].cell; c.set(cl.ix, cl.iy, cl.iz); lo.min(c); hi.max(c); }
      const ext = Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) + 1;
      const scale = (isActive ? 0.36 : 0.05) / ext;
      const mid = lo.add(hi).multiplyScalar(0.5);
      for (const m of mem) {
        const cl = this.voxels[m].cell;
        const p = new THREE.Vector3(cl.ix - mid.x, cl.iy - mid.y, cl.iz - mid.z).multiplyScalar(S * scale).applyQuaternion(quat).add(pos);
        poses[m] = { pos: p, quat, scale, hidden: !isActive };
      }
    });
    return poses;
  }

  updateVoxels(dt) {
    const hand = this.pack.length ? this.handPoses() : [];
    for (const v of this.voxels) {
      const m = v.mesh;
      if (v.state === 'lifting' || v.state === 'held') {
        const pose = hand[v.i];
        if (!pose) { v.state = 'loose'; continue; }
        if (v.state === 'lifting') {
          v.anim.t += dt / v.anim.dur;
          const k = ease(Math.min(1, v.anim.t));
          m.position.lerpVectors(v.anim.from, pose.pos, k);
          m.quaternion.slerpQuaternions(v.anim.fromQ, pose.quat, k);
          m.scale.setScalar(THREE.MathUtils.lerp(1, pose.scale, k));
          if (v.anim.t >= 1) v.state = 'held';
        } else {
          m.position.lerp(pose.pos, pose.hidden ? Math.min(1, dt * 12) : 1);
          m.quaternion.copy(pose.quat);
          m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, pose.scale, Math.min(1, dt * 14)));
        }
        m.visible = !pose.hidden || m.scale.x > 0.08;
        v.mat.emissive.setScalar(0);
        continue;
      }
      m.visible = true;
      if (v.state === 'waiting') { m.visible = false; continue; }
      if (v.state === 'flying' || v.state === 'dropping') {
        const a = v.anim;
        if (a.delay > 0) { a.delay -= dt; m.position.copy(a.from); continue; }
        a.t += dt / a.dur;
        const k = Math.min(1, a.t);
        const e = v.state === 'flying' ? ease(k) : k;
        m.position.lerpVectors(a.from, a.to, e);
        m.position.y += Math.sin(k * Math.PI) * (v.state === 'flying' ? 0.5 : 0.6);
        m.quaternion.slerpQuaternions(a.fromQ, a.toQ, v.state === 'flying' ? easeBack(k) : ease(k));
        m.scale.setScalar(THREE.MathUtils.lerp(a.fromScale, 1, ease(k)));
        if (a.t >= 1) {
          if (v.state === 'flying') {
            if (a.group) this.placeGroup(a.group);
            else if (!a.follow) this.place(v.i); // chunk followers wait for their group's first block
          }
          else {
            const quiet = v.anim.quiet;
            v.state = 'loose'; v.anim = null; m.position.copy(v.rest.pos); m.castShadow = true;
            if (!quiet) {
              this.audio.thud();
              this.fx.burst(new THREE.Vector3(m.position.x, m.position.y - S / 2, m.position.z), 0xffffff, 6, 1.5);
            }
          }
        }
        continue;
      }
      if (v.state === 'placed') {
        if (v.pulse > 0) {
          v.pulse = Math.max(0, v.pulse - dt * 2.8);
          m.scale.setScalar(1 + Math.sin(v.pulse * Math.PI) * 0.18);
          v.mat.emissive.setScalar(v.pulse * 0.5);
        }
        continue;
      }
      // loose
      const hovered = this.focus && this.focus.kind === 'loose' && !this.focus.far
        && (this.focus.i === v.i || (v.chunk !== undefined && this.voxels[this.focus.i].chunk === v.chunk));
      v.highlight += ((hovered ? 1 : 0) - v.highlight) * Math.min(1, dt * 14);
      // blocks that fit right now glint when you're near
      const fitsNow = this.mode === 'play' && !this.puzzler && this.sockets.has(v.i) && m.position.distanceToSquared(this.player.pos) < 81;
      v.glint = (v.glint || 0) + ((fitsNow ? 1 : 0) - (v.glint || 0)) * Math.min(1, dt * 3);
      const tw = Math.max(0, Math.sin(this.t * 2.6 + v.i * 1.7));
      v.mat.emissive.setScalar(Math.max(v.highlight * (0.18 + 0.06 * Math.sin(this.t * 8)), v.glint * tw * tw * 0.16));
      if (v.glint > 0.5 && Math.random() < dt * 1.4) this.fx.sparkle(m.position);
      if (v.hop > 0) {
        v.hop = Math.max(0, v.hop - dt);
        m.position.y = v.rest.pos.y + Math.abs(Math.sin(v.hop * 6)) * 0.35 * Math.min(1, v.hop);
      } else m.position.y = v.rest.pos.y;
    }
  }

  updateSockets(dt) {
    const carried = this.carriedAll();
    const anyFit = carried.some(i => this.sockets.has(i));
    for (const s of this.sockets.values()) {
      const ready = carried.includes(s.child);
      const style = ready ? 'ready' : anyFit ? 'dim' : 'idle';
      if (style !== s.style) {
        s.style = style;
        s.sprite.material.map = badgeTexture(s.num, style); s.sprite.material.needsUpdate = true;
        const g = s.sprite.children[0];
        if (g) { g.material.map = s.sprite.material.map; g.material.needsUpdate = true; }
      }
      const appear = easeBack(Math.min(1, (this.t - s.born) / 0.35));
      const focused = this.focus && this.focus.kind === 'socket' && this.focus.child === s.child;
      let sc = 0.4 * appear * (1 + 0.05 * Math.sin(this.t * 3 + s.phase));
      if (style === 'ready') sc *= 1.25 + 0.08 * Math.sin(this.t * 9);
      if (style === 'dim') sc *= 0.8;
      if (focused) sc *= 1.15;
      // keep far bubbles readable
      sc *= Math.max(1, s.sprite.position.distanceTo(this.camera.position) / 9);
      s.sprite.scale.setScalar(sc);
      s.sprite.position.copy(this.voxels[s.child].target);
      if (s.shake > 0) {
        s.shake -= dt;
        s.sprite.position.x += Math.sin(s.shake * 60) * 0.05 * s.shake * 2;
      }
    }
    const f = this.focus;
    const show = this.mode === 'play' && f && f.kind === 'socket' && !f.far && carried.includes(f.child);
    this.ghost.visible = !!show;
    if (show) {
      this.ghost.position.copy(this.voxels[f.child].target);
      this.ghost.material.opacity = 0.25 + 0.12 * Math.sin(this.t * 10);
    }
  }

  emitProgress() { this.events.progress?.(this.placedCount, this.voxels.length, this.level); }
  emitPack() {
    this.focusKey = '#';
    this.events.pack?.({
      active: this.active,
      slots: this.pack.map(i => {
        if (this.puzzler) return this.itemInfo(i);
        const v = this.voxels[i];
        return { numbers: v.numbers, link: v.num, fits: this.sockets.has(i), color: v.cell.color };
      }),
    });
  }

  sessionData() {
    return { id: this.level.id, seed: this.runSeed, placed: this.linkOrder.slice(), elapsed: Math.round(this.elapsed), hints: this.hintsUsed, n: this.voxels.length, done: this.placedCount, splits: this.splits.slice() };
  }

  openSocketNumbers() { return [...this.sockets.values()].map(s => s.num).sort((a, b) => a - b); }
  readyNumbers() { return new Set(this.carriedAll().filter(i => this.sockets.has(i)).map(i => this.voxels[i].num)); }
}
