import * as THREE from 'three';
import { LEVELS, CHAPTERS, expandLevel, partsFor, coreSize } from './levels.js';
import { buildWorld, PEDESTAL_TOP, dotTexture } from './world.js';
import { buildArchipelago } from './archipelago.js';
import { S, DIRS, INK, buildVoxelGeometry, voxelMaterial, generatePuzzle, mulberry32, shuffle, cubeRotations, getPuzzleAtlas, sumFor, ATLAS_CELLS, mergeFigure } from './voxels.js';
import { Player } from './player.js';
import { LAYER_OVERLAY, toon } from './render.js';
import { t } from './i18n.js';

const LOOSE_RANGE = 5.5, SOCKET_RANGE = 14;
export const PACK_SIZE = 4;
const _e = new THREE.Euler();
const yawOf = q => _e.setFromQuaternion(q, 'YXZ').y;
const CHUNK_MAX = 12; // puzzler mode: most blocks one ground-built chunk may hold
// First-play tutorial: one control per step. A control unlocks at the step that teaches it and stays
// unlocked; anything not taught yet is blocked (and nudges the coach line). Looking around and pausing always work.
export const TUTORIAL = ['look', 'move', 'jump', 'grab', 'link', 'drop', 'hint', 'done'];
const LOOK_GOAL = 1.4, WALK_GOAL = 3.5; // radians looked around / metres walked
const NEEDS = { jump: 'jump', drop: 'drop', hint: 'hint', slot: 'grab', cycle: 'grab', magnet: 'done', express: 'done' };
export const hashId = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 100000; };
const ease = t => 1 - Math.pow(1 - t, 3);
const easeBack = t => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// a figure's island: keep scenery and loose blocks clear of the space the finished figure will occupy; size it
// compactly (walking dominates play time, see docs/design-notes.md)
function islandOf(level) {
  const { cells } = expandLevel(level);
  const footR = Math.max(3.2, ...cells.map(c => Math.hypot(c.x, c.z) * S + S));
  return { footR, R: Math.max(12 + Math.sqrt(cells.length) * 0.95, footR + 12) };
}
function buildIsland(level, themeId, quality, part) {
  const { footR, R } = islandOf(level);
  return buildWorld({
    rng: mulberry32(1000 + hashId(level.id) * 7919), radius: R, seed: (hashId(level.id) % 97) + 1, quality, clearR: footR, part,
    theme: themeId, difficulty: Math.min(1, (level.chapter ?? 2) * 0.16 + (level.chapterProgress ?? 0.33) * 0.24),
  });
}
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
    group,
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

const DISTRICT_COLORS = ['#ff6b6b', '#ffc93c', '#3ddc97', '#4cc9f0', '#b693f5', '#ff8fc7', '#ff9f43', '#9be36b', '#6c8cff', '#e8d9b8'];

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
  // arrive: 'island' (start on the figure's island), 'hub' (by portal, on the middle island) or 'keep' (walked over:
  // the player stays where they are while the scene shifts to the new island)
  load(index, resume = null, { arrive = 'island' } = {}) {
    const level = typeof index === 'object' ? index : LEVELS[index];
    const campaign = LEVELS.includes(level);
    this.unloadPuzzle();
    if (!campaign || this.arch?.chapter !== level.chapter) this.unloadWorld();
    const chapter = CHAPTERS[level.chapter ?? 0];
    const themeId = level.theme || chapter.theme;
    this.levelIndex = level.index ?? -1;
    this.level = level;
    const { cells, height } = expandLevel(level);
    this.cells = cells;
    this.runSeed = resume?.seed ?? ((Math.random() * 1e9) | 0);
    const rng = mulberry32(this.runSeed);
    this.puzzle = generatePuzzle(cells, rng);
    // optional Puzzler mode (decided per load by a feature module; classic when unset)
    this.puzzler = !!this.puzzlerFor?.(level, resume);
    this.exprs = null;
    this.chunks = new Map(); // puzzler: id -> { id, members:Set, anchor, restPos, restQuat }
    this.nextChunk = 1;
    const isl = islandOf(level);
    this.footR = isl.footR;
    const R = isl.R;
    let shift = null;
    if (campaign) {
      // the world's whole archipelago (built once per world), with this figure's island active
      if (!this.arch) {
        const quality = this.renderer.mobile ? 'low' : 'high';
        this.figureMat = voxelMaterial(this.renderer.gl);
        this.arch = buildArchipelago({
          chapter: level.chapter, levels: chapter.levels, figureMaterial: this.figureMat,
          makePart: l => ({ world: buildIsland(l, themeId, quality, true) }),
          makeHub: seaY => buildWorld({ rng: mulberry32(4242 + level.chapter * 31), radius: 11, seed: 7 + level.chapter, quality, theme: themeId, layout: 'hub', seaY, pedestal: false }),
          isOpen: l => this.events.isOpen?.(l) ?? true, isDone: l => !!this.events.isDone?.(l),
          doorShut: l => l === LEVELS[0] && !this.events.isDone?.(l),
        });
        this.scene.add(this.arch.group);
        this.world = this.arch.api;
        this.world.restrict = () => this.pack.length > 0 && this.mode === 'play';
        this.world.calmMotion = () => document.body.classList.contains('reduce-motion');
        this.world.onBlocked = () => { if (this.t - (this.carryToldT ?? -9) > 3) { this.carryToldT = this.t; this.events.kubo?.(t('way.carry')); } };
      }
      shift = this.arch.setActive(level);
    } else {
      this.world = buildIsland(level, themeId, this.renderer.mobile ? 'low' : 'high', false);
      this.scene.add(this.world.group);
    }
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
      mat.onBeforeCompile = this.mat.onBeforeCompile; // clone() drops the pattern shader patch
      mat.customProgramCacheKey = this.mat.customProgramCacheKey;
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
    this.roaming = false;
    this.scatter(rng, Math.min(0.5, 0.18 + (level.chapter ?? 2) * 0.04), !!resume?.id && !resume.v);
    if (this.levelIndex === 0) {
      // tutorial: put the first block right in front of the player
      const first = this.voxels[this.puzzle.children[this.puzzle.root][0]];
      first.rest.pos.set(0.9, S / 2, Math.min(R - 3, 9) - 3.2);
      first.mesh.position.copy(first.rest.pos);
    }
    for (const r of this.puzzle.roots) this.place(r, true);
    // big figures start with a small pre-built core so several bubbles are open from the start
    const seed = coreSize(cells.length);
    const queue = this.puzzle.roots.flatMap(r => this.puzzle.children[r]);
    for (let k = 0; k < seed && queue.length; k++) {
      const c = queue.splice(Math.floor(rng() * queue.length), 1)[0];
      this.place(c, true);
      queue.push(...this.puzzle.children[c]);
    }
    this.refreshColliders();

    // the scene moved by `shift` (walked onto another island): things that follow the player move with it
    this.shift = shift && arrive === 'keep' ? shift.clone() : null;
    this.shiftSeq = (this.shiftSeq || 0) + 1;
    if (arrive === 'keep' && shift && this.player.pos) { this.player.pos.add(shift); this.player.lastSafe.add(shift); }
    else if (arrive === 'hub' && this.arch) { const a = this.arch.arrival(); this.player.spawn(a.x, a.z, a.yaw); }
    else this.player.spawn(0, Math.min(R - 3, 9), 0);
    this.onIsland = false; this.islandT = 0; this.arrived = false;
    this.switching = false; this.inPortal = this.arch ? this.arch.atPortal(this.player.pos.x, this.player.pos.z) : false;
    this.linkOrder = [];
    if (resume) {
      for (const i of resume.placed) if (this.voxels[i] && this.voxels[i].state !== 'placed' && this.voxels[this.puzzle.parent[i]]?.state === 'placed') this.place(i, true);
      this.linkOrder = resume.placed.slice();
      this.refreshColliders();
    }
    this.districtDone = new Set();
    for (let d = 0; d < this.stageCount; d++) if (this.stageCount > 1 && this.districtCleared(d)) this.districtDone.add(d);
    this.stage = Math.min(this.stageCount - 1, this.districtDone.size);
    this.syncStage();
    this.buildDistrictFlags();
    for (const d of this.districtDone) if (this.flags[d]) this.flags[d].banner.material.color.setScalar(0.55);
    this.magnetCharges = this.stageCount > 1 ? 1 : 0;
    this.magnetLinks = 0;
    this.magnetTold = false;
    this.expressCharges = 0;
    this.expressLinks = 0;
    this.expressTold = false;
    this.elapsed = resume?.elapsed ?? 0;
    this.hintsUsed = resume?.hints ?? 0;
    this.splits = resume?.splits?.slice() ?? [];
    this.sinceLink = 0;
    this.hintCooldown = 0;
    this.hintMax = this.puzzler ? 16 : 8;
    this.focus = null;
    this.focusKey = '';
    this.waved = false;
    this.tutorial = null; // set by main.js for a first play
    this.tutNext = null;
    this.tutAcc = 0;
    this.tutUsed = new Set(); // controls used during the current step (the coach lights their keys)
    this.packTipShown = false;
    this.barked = new Set();
    this.chainQueue = [];
    this.chain = 0;
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
    this.liftChunk(ch);
    [...ch.members].forEach((m, j) => {
      const w = this.voxels[m];
      this.startAnim(w, 'dropping', w.rest.pos, w.rest.quat, dur);
      w.anim.quiet = j > 0;
    });
  }
  // ---------- stacking ----------
  // Highest loose block whose footprint overlaps (x, z); returns { v, top } or null.
  stackBelow(x, z, ignore = new Set(), belowY = Infinity) {
    let best = null;
    for (const w of this.voxels) {
      if (ignore.has(w.i) || !(w.state === 'loose' || w.state === 'dropping')) continue;
      const r = w.rest.pos;
      if (Math.abs(r.x - x) > S * 0.85 || Math.abs(r.z - z) > S * 0.85 || r.y > belowY) continue;
      const top = r.y + S / 2;
      if (!best || top > best.top) best = { v: w, top };
    }
    return best;
  }
  // Resting height for a block at (x, z) at or below height y: ground, plateau or another loose block.
  restHeight(x, z, y, ignore) {
    const ground = this.world.heightAt(x, z, y + 0.05);
    const below = this.stackBelow(x, z, ignore, y - 0.05);
    return Math.max(ground, below ? below.top : 0);
  }
  // Raise a chunk so none of its blocks sink into blocks lying underneath.
  liftChunk(ch) {
    const ids = new Set(ch.members);
    let lift = 0;
    for (const m of ch.members) {
      const r = this.voxels[m].rest.pos;
      const below = this.stackBelow(r.x, r.z, ids, r.y + S * 0.4);
      if (below) lift = Math.max(lift, below.top - (r.y - S / 2));
    }
    if (lift > 0.001) { ch.restPos.y += lift; this.layoutChunk(ch); }
  }
  // After a block leaves the ground, let whatever rested on it fall down.
  settle() {
    const loose = this.voxels.filter(w => w.state === 'loose').sort((a, b) => a.rest.pos.y - b.rest.pos.y);
    const done = new Set();
    for (const w of loose) {
      if (done.has(w.i)) continue;
      const group = w.chunk !== undefined && this.chunks ? [...this.chunks.get(w.chunk).members].map(m => this.voxels[m]) : [w];
      group.forEach(g => done.add(g.i));
      const ids = new Set(group.map(g => g.i));
      let fall = Infinity;
      for (const g of group) {
        const r = g.rest.pos;
        fall = Math.min(fall, (r.y - S / 2) - this.restHeight(r.x, r.z, r.y - S / 2, ids));
      }
      if (!(fall > 0.02) || !isFinite(fall)) continue;
      if (w.chunk !== undefined && this.chunks) { const ch = this.chunks.get(w.chunk); ch.restPos.y -= fall; this.layoutChunk(ch); }
      else w.rest.pos.y -= fall;
      for (const g of group) { this.startAnim(g, 'dropping', g.rest.pos, g.rest.quat, 0.25 + fall * 0.1); g.anim.quiet = g !== group[0]; }
    }
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
    this.liftChunk(ch);
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
    this.stageCount = partsFor(n);
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

  // Every block is on the island from the start; parts are districts. Make sure all open bubbles exist.
  syncStage() {
    for (const v of this.voxels) {
      if (v.state !== 'placed') continue;
      for (const c of this.puzzle.children[v.i]) if (this.voxels[c].state !== 'placed' && !this.sockets.has(c)) this.addSocket(c);
    }
  }

  // Direction (angle around the pedestal) of district d; district 0 faces the spawn point.
  districtAngle(d) { return Math.PI / 2 + d * ((Math.PI * 2) / this.stageCount); }

  // A flag with the part number in the middle of each district.
  buildDistrictFlags() {
    this.flags = [];
    if (this.stageCount < 2) return;
    const group = (this.flagGroup = new THREE.Group());
    const w = this.world, r0 = Math.max(4, this.footR + 1.2);
    for (let d = 0; d < this.stageCount; d++) {
      const color = DISTRICT_COLORS[d % DISTRICT_COLORS.length];
      let pos = null;
      // search outwards from the middle of the district until there is free ground for the pole
      for (let k = 0; k < 160 && !pos; k++) {
        const spread = Math.min(1, k / 80);
        const th = this.districtAngle(d) + (k ? (Math.random() - 0.5) * (0.5 + spread * (Math.PI * 2 / this.stageCount - 0.5)) : 0);
        const r = r0 + 0.6 + (w.R - 2 - r0) * (k ? Math.random() * (0.3 + spread * 0.7) + (1 - spread) * 0.3 : 0.45);
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        if (w.isFreeGround(x, z, k < 100 ? 0.4 : 0)) pos = new THREE.Vector3(x, w.groundY ? w.groundY(x, z) : w.heightAt(x, z), z);
      }
      if (!pos) {
        // last resort: on the pedestal side facing the district
        const th = this.districtAngle(d), r = Math.max(3, this.footR + 0.6);
        pos = new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r);
      }
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), new THREE.MeshToonMaterial({ color: 0x6b4a36, gradientMap: this.mat.gradientMap }));
      pole.position.y = 1.6;
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = color; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#2a1f3d'; g.font = '700 64px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(d + 1), 64, 70);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8, 8, 1), new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide, gradientMap: this.mat.gradientMap }));
      banner.position.set(0.58, 2.7, 0);
      flag.add(pole, banner);
      flag.position.copy(pos);
      flag.lookAt(0, pos.y, 0);
      flag.traverse(o => { if (o.isMesh) o.castShadow = true; });
      group.add(flag);
      this.flags[d] = { pos: pos.clone().setY(pos.y + 2.4), banner, color };
    }
    this.scene.add(group);
  }

  districtCleared(d) { return this.voxels.every(v => this.stageOf[v.i] !== d || v.state === 'placed'); }

  // District with the most blocks that fit right now (where the compass points).
  activeDistrict() {
    const count = new Array(this.stageCount).fill(0);
    for (const v of this.voxels) if (v.state === 'loose' && this.sockets.has(v.i)) count[this.stageOf[v.i]]++;
    let best = -1;
    count.forEach((c, d) => { if (c > 0 && (best < 0 || c > count[best])) best = d; });
    return best;
  }

  // A district was completed (in any order): celebrate, and move the part counter on.
  advanceStage(d) {
    this.districtDone.add(d);
    this.stage = Math.min(this.stageCount - 1, this.districtDone.size);
    if (this.flags[d]) this.flags[d].banner.material.color.setScalar(0.55);
    this.fx.confettiBurst(new THREE.Vector3(0, PEDESTAL_TOP + this.figureHeight * 0.6, 0), 2, 90);
    [0, 1, 2].forEach(k => setTimeout(() => this.audio.star(k), 150 + k * 160));
    this.events.stage?.(this.stage, this.stageCount);
    this.events.kubo?.(this.districtDone.size === this.stageCount - 1
      ? t('kubo.partLast', { k: this.districtDone.size })
      : t('kubo.part', { k: this.districtDone.size, n: this.stageCount }));
    this.emitProgress();
  }

  // Magnet tool: pull every block that fits right now within 10 m into the backpack.
  useMagnet() {
    if (this.mode !== 'play' || this.magnetCharges <= 0) { this.audio.wrong(); return; }
    if (this.pack.length >= PACK_SIZE) { this.audio.wrong(); this.events.toast?.(t('magnet.full')); return; }
    const p = this.player.pos;
    const near = this.voxels
      .filter(v => v.state === 'loose' && this.sockets.has(v.i) && v.mesh.position.distanceTo(p) < 10)
      .sort((a, b) => a.mesh.position.distanceTo(p) - b.mesh.position.distanceTo(p));
    let got = 0;
    for (const v of near) {
      if (this.pack.length >= PACK_SIZE) break;
      if (v.state !== 'loose') continue; // already pulled in with its chunk
      this.grab(v.i);
      got++;
    }
    if (!got) { this.audio.wrong(); this.events.toast?.(t('magnet.none')); return; }
    this.magnetCharges--;
    this.fx.burst(new THREE.Vector3(p.x, p.y + 1, p.z), 0x9fe8ff, 30, 6);
    this.audio.tone({ f: 300, f2: 1200, type: 'sawtooth', dur: 0.35, vol: 0.06 });
    this.events.toast?.(t(got === 1 ? 'magnet.got.one' : 'magnet.got.other', { n: got }));
    this.events.magnet?.(this.magnetCharges, false);
  }

  // Kubo Express: every carried block that fits flies across the island to its bubble.
  useExpress() {
    if (this.mode !== 'play' || this.expressCharges <= 0) { this.audio.wrong(); return; }
    const fits = this.carriedAll().filter(i => this.sockets.has(i));
    if (!fits.length) { this.audio.wrong(); this.events.toast?.(t('express.none')); return; }
    this.expressCharges--;
    fits.forEach((i, k) => this.chainQueue.push({ i, at: this.t + 0.05 + k * 0.15, express: true }));
    this.audio.tone({ f: 400, f2: 1600, type: 'triangle', dur: 0.45, vol: 0.1, wet: 0.4 });
    this.events.toast?.(t(fits.length === 1 ? 'express.sent.one' : 'express.sent.other', { n: fits.length }));
    this.events.express?.(this.expressCharges, false);
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

  unload() { this.unloadPuzzle(); this.unloadWorld(); }
  unloadWorld() {
    if (!this.world) return;
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.figureMat?.dispose();
    this.figureMat = null;
    this.arch = null;
    this.world = null;
  }
  // the figure's puzzle: its blocks, bubbles and part flags (the island stays)
  unloadPuzzle() {
    if (!this.voxels?.length) return;
    for (const v of this.voxels) { this.scene.remove(v.mesh); v.mesh.geometry.dispose(); v.mat.dispose(); }
    for (const s of [...this.sockets.values()]) this.removeSocket(s);
    this.mat.dispose();
    this.fx.clearBeam();
    this.liftFx?.dispose();
    this.liftFx = null;
    if (this.flagGroup) {
      this.scene.remove(this.flagGroup);
      this.flagGroup.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
      this.flagGroup = null;
    }
    this.voxels = [];
  }

  scatter(rng, topShare, legacyShuffle) {
    const w = this.world;
    const placedPts = [];
    const ok = (x, z, y) => placedPts.every(p => Math.hypot(p.x - x, p.z - z) > 1.15 || Math.abs(p.y - y) > 1);
    const loose = this.voxels.filter(v => !this.puzzle.roots.includes(v.i));
    const rots = cubeRotations();
    const nTop = Math.min(w.tops.length * 3, Math.round(loose.length * topShare));
    // shuffle so the high-up blocks are a random selection; a Fisher-Yates shuffle gives the same layout in every
    // browser (sort with a random comparator depends on the engine), older saved runs keep their old layout
    const order = legacyShuffle ? loose.slice().sort(() => rng() - 0.5) : shuffle(loose.slice(), rng);
    // big figures: every part gets its own district (a slice of the island), the first one facing the spawn
    const D = this.stageCount, width = (Math.PI * 2) / D;
    const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const topsOf = d => (D === 1 ? w.tops : w.tops.filter(t => angDiff(Math.atan2((t.box.min.z + t.box.max.z) / 2, (t.box.min.x + t.box.max.x) / 2), this.districtAngle(d)) < width / 2));
    const districtTops = Array.from({ length: D }, (_, d) => topsOf(d));
    order.forEach((v, k) => {
      let pos = null;
      const d = this.stageOf[v.i];
      const tops = districtTops[d];
      // a high spot first if this block should be up top (falls back to the ground when the tops are full)
      const free = (x, z, y) => [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, 0]].every(([dx, dz]) => w.heightAt(x + dx, z + dz) <= y + 0.01);
      for (let tries = 0; tries < 400 && !pos; tries++) {
        if (k < nTop && tops.length && tries < 150) {
          const t = tops[Math.floor(rng() * tops.length)];
          const x = THREE.MathUtils.lerp(t.box.min.x + 0.45, t.box.max.x - 0.45, rng());
          const z = THREE.MathUtils.lerp(t.box.min.z + 0.45, t.box.max.z - 0.45, rng());
          if (free(x, z, t.y) && ok(x, z, t.y)) pos = new THREE.Vector3(x, t.y, z);
        } else {
          const th = D === 1 || tries > 200 ? rng() * Math.PI * 2 : this.districtAngle(d) + (rng() - 0.5) * width * 0.92;
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
    if (this.fx.beamTarget === s.sprite) this.fx.clearBeam();
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
    for (const c of this.puzzle.children[i]) if (this.voxels[c].state !== 'placed') this.addSocket(c);
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
      if (!this.quietLink) { this.audio.link(this.placedCount / this.voxels.length, this.chain); this.events.vibrate?.(18); }
      this.emitProgress();
      this.linkOrder.push(i);
      this.sinceLink = 0;
      // chain: carried blocks that belong right on the block we just placed fly in by themselves
      for (const c of this.puzzle.children[i]) {
        if (this.carrying(c) && !this.chainQueue.some(q => q.i === c)) this.chainQueue.push({ i: c, at: this.t + 0.22 + this.chainQueue.length * 0.12 });
      }
      if (this.t - (this.lastLinkT ?? -9) > 1.2) this.chain = 0;
      this.lastLinkT = this.t;
      if (this.stageCount > 1 && ++this.expressLinks >= 20) {
        this.expressLinks = 0;
        if (this.expressCharges < 2) {
          this.expressCharges++;
          this.events.express?.(this.expressCharges, true);
          if (!this.expressTold) { this.expressTold = true; this.events.kubo?.(t(this.input.mobile ? 'kubo.express.touch' : 'kubo.express.desk')); }
        }
      }
      if (this.stageCount > 1 && ++this.magnetLinks >= 12) {
        this.magnetLinks = 0;
        if (this.magnetCharges < 3) {
          this.magnetCharges++;
          this.events.magnet?.(this.magnetCharges, true);
          if (!this.magnetTold) { this.magnetTold = true; this.events.kubo?.(t(this.input.mobile ? 'kubo.magnet.touch' : 'kubo.magnet.desk')); }
        }
      }
      const fr = this.placedCount / this.voxels.length;
      while (this.splits.length < 3 && fr >= (this.splits.length + 1) * 0.25) this.splits.push(Math.round(this.elapsed * 10) / 10);
      this.events.link?.(this, i);
      const d = this.stageOf[i];
      if (this.stageCount > 1 && this.placedCount < this.voxels.length && !this.districtDone.has(d) && this.districtCleared(d)) this.advanceStage(d);
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
      if (!this.tutAllows('grab')) return this.tutNudge();
      if (this.puzzler) {
        const k = this.attachSlot(h.i);
        if (k >= 0) return this.attach(k, h.i);
        if (k === -2) { this.audio.wrong(); this.events.toast?.(t('puzzler.toast.chunkMax', { n: CHUNK_MAX })); return; }
      }
      return this.grab(h.i);
    }
    if (h.kind === 'socket') {
      if (this.carrying(h.child)) return this.tutAllows('link') ? this.launch(h.child) : this.tutNudge();
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
    if (this.tutorial === 'grab' && this.sockets.has(i)) this.tutAdvance('link');
    if (this.pack.length === 2 && !this.packTipShown && this.levelIndex >= 0 && this.levelIndex <= 4) {
      this.packTipShown = true;
      this.events.toast?.(t('toast.carry', { n: PACK_SIZE }));
    }
    this.settle();
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
      const turn = cubeRotations()[Math.floor(Math.random() * 24)];
      // landing on another loose block: stack neatly on top of it instead of overlapping
      const below = this.stackBelow(x, z, new Set([v.i]));
      if (below && below.top > y) {
        v.rest.pos.set(below.v.rest.pos.x, below.top + S / 2, below.v.rest.pos.z);
        v.rest.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOf(below.v.rest.quat)).multiply(turn);
      } else {
        v.rest.pos.set(x, y + S / 2, z);
        v.rest.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6).multiply(turn);
      }
      this.startAnim(v, 'dropping', v.rest.pos, v.rest.quat, 0.4);
    }
    this.pack.splice(this.active, 1);
    this.active = Math.max(0, Math.min(this.active, this.pack.length - 1));
    this.audio.drop();
    if (this.tutorial === 'drop') { this.tutUsed.add('drop'); this.tutAdvance('hint'); }
    this.emitPack();
  }

  launch(i) {
    const v = this.voxels[i];
    const k = this.slotOf(i);
    this.pack.splice(k, 1);
    this.active = Math.max(0, Math.min(this.active > k ? this.active - 1 : this.active, this.pack.length - 1));
    if (v.chunk !== undefined) this.launchChunk(i);
    else this.startAnim(v, 'flying', v.target, new THREE.Quaternion(), Math.min(1.6, 0.34 + v.mesh.position.distanceTo(v.target) * 0.03));
    this.ghost.visible = false;
    this.audio.tone({ f: 500, f2: 900, type: 'sine', dur: 0.2, vol: 0.08 });
    if (this.tutorial === 'link') this.tutAdvance('drop');
    this.emitPack();
  }

  startAnim(v, state, toPos, toQuat, dur) {
    v.state = state;
    v.anim = { t: 0, dur, from: v.mesh.position.clone(), fromQ: v.mesh.quaternion.clone(), to: toPos.clone(), toQ: toQuat.clone(), fromScale: v.mesh.scale.x };
  }

  hint() {
    if (this.mode !== 'play') return;
    // the tutorial's practice hint is free
    const practice = this.tutorial === 'hint';
    if (practice) { this.tutUsed.add('hint'); this.tutAdvance('done'); }
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
    if (!practice) this.hintsUsed++;
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
    this.updateIslands();
    this.events.frame?.(this, dt);
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

  // ---------- tutorial ----------
  tutAllows(what) {
    const k = this.tutorial ? TUTORIAL.indexOf(this.tutorial) : -1;
    return k < 0 || TUTORIAL.indexOf(what) <= k;
  }
  tutNudge() {
    if (this.t - (this.tutNudgeT ?? -9) < 0.8) return;
    this.tutNudgeT = this.t;
    this.audio.wrong();
    this.events.tutorialNudge?.();
  }
  // a finished step ticks over after a short beat, so the player sees it worked
  // how far along the look / walk steps are (0..1)
  tutProgress() {
    if (this.tutNext) return 1;
    return this.tutorial === 'look' ? Math.min(1, this.tutAcc / LOOK_GOAL) : this.tutorial === 'move' ? Math.min(1, this.tutAcc / WALK_GOAL) : 0;
  }
  tutAdvance(step, delay = 0.6) {
    if (this.tutNext) return;
    this.tutNext = { step, at: this.t + delay };
    this.audio.tone({ f: 660, f2: 990, type: 'triangle', dur: 0.18, vol: 0.1, wet: 0.3 });
  }
  updateTutorial(dt, look, moved) {
    const tut = this.tutorial;
    if (this.tutNext && this.t >= this.tutNext.at) {
      this.tutorial = this.tutNext.step;
      this.tutNext = null;
      this.tutAcc = 0;
      this.tutUsed.clear();
      return;
    }
    if (this.tutNext) return;
    if (tut === 'move') for (const d of ['forward', 'left', 'back', 'right']) if (this.input.held(d)) this.tutUsed.add(d);
    // look and walk advance the moment they're done (the coach shows the progress filling up)
    if (tut === 'look' && (this.tutAcc += Math.abs(look.x) + Math.abs(look.y)) > LOOK_GOAL) this.tutAdvance('move', 0.15);
    else if (tut === 'move' && (this.tutAcc += moved) > WALK_GOAL) this.tutAdvance('jump', 0.15);
    else if (tut === 'done' && (this.tutAcc += dt) > 4.5) this.tutorial = null;
  }

  updatePlay(dt) {
    const look = this.input.poll();
    if (this.tutorial) {
      const m = this.input.move;
      if (!this.tutAllows('move')) {
        if ((m.x || m.y) && !this.tutHeld) this.tutNudge();
        this.tutHeld = !!(m.x || m.y);
        m.x = m.y = 0; m.sprint = false;
      }
      if (!this.tutAllows('jump')) this.input.jumpHeld = false;
    }
    for (const a of this.input.takeActions()) {
      if (NEEDS[a.type] && !this.tutAllows(NEEDS[a.type])) { this.tutNudge(); continue; }
      if (a.type === 'jump') { this.player.jumpBuffer = 0.14; if (this.tutorial === 'jump') { this.tutUsed.add('jump'); this.tutAdvance('grab', 0.5); } }
      else if (a.type === 'interact') this.interact(a.x, a.y);
      else if (a.type === 'drop') this.drop();
      else if (a.type === 'hint') this.hint();
      else if (a.type === 'magnet') this.useMagnet();
      else if (a.type === 'express') this.useExpress();
      else if (a.type === 'pause') this.events.pause?.();
      else if (a.type === 'slot') this.selectSlot(a.k);
      else if (a.type === 'cycle') this.cycleSlot(a.d);
    }
    const r = Math.hypot(this.player.pos.x, this.player.pos.z);
    const lift = this.liftR && r < this.liftR ? { maxY: this.liftTop } : null;
    if (this.liftR && !this.liftTold && this.onIsland && (lift || this.islandT > 8)) { this.liftTold = true; this.events.tipOnce?.('lift', t(this.input.mobile ? 'kubo.lift.touch' : 'kubo.lift')); }
    const px = this.player.pos.x, pz = this.player.pos.z;
    this.player.update(dt, this.input, look, this.colliders, this.world, lift);
    if (this.tutorial) this.updateTutorial(dt, look, Math.hypot(this.player.pos.x - px, this.player.pos.z - pz));
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
    // the clock (par time) only runs on this figure's own island, and not during the controls tutorial
    const wasOn = this.onIsland;
    this.onIsland = !this.arch || this.arch.onActive(this.player.pos.x, this.player.pos.z);
    if (this.onIsland) this.islandT += dt;
    if (this.onIsland && !wasOn && !this.arrived) { this.arrived = true; this.events.arrive?.(this.level); }
    if (this.onIsland && !this.roaming && (!this.tutorial || this.tutorial === 'done')) this.elapsed += dt;
    this.sinceLink += dt;
    while (this.chainQueue.length && this.chainQueue[0].at <= this.t) {
      const { i, express } = this.chainQueue.shift();
      if (!this.carrying(i) || !this.sockets.has(i)) continue;
      if (!express) this.chain++;
      this.launch(i);
      if (!express && this.chain >= 2) this.events.toast?.(t('toast.chain', { n: this.chain + 1 }));
    }
    this.hintCooldown = Math.max(0, this.hintCooldown - dt);
    if (this.stageCount > 1 && !this.districtTip && this.islandT > 2.5) { this.districtTip = true; this.events.tip?.('districts'); }

    this.setFocus(this.input.mobile ? null : this.rayFrom());
    this.events.tick?.(this);
  }

  // ---------- walking between islands ----------
  // the next figure to rebuild in this world (the portal once they're all done); null while you're on it
  nextStop() {
    if (!this.arch) return null;
    const next = this.arch.parts.find(p => p.open && !this.events.isDone?.(p.level));
    if (!next) return this.arch.parts.every(p => this.events.isDone?.(p.level)) ? 'portal' : null;
    if (next.level === this.level && !this.roaming && this.arch.partAt(this.player.pos.x, this.player.pos.z) === next) return null;
    return next.level;
  }
  // where to point the edge arrow: the next figure's island, or the portal
  wayTarget() {
    const n = this.nextStop();
    if (!n) return null;
    return n === 'portal' ? this.arch.portalPos() : this.arch.offsetOf(n).setY(PEDESTAL_TOP + 1.5);
  }
  updateBeacon() { this.arch.setBeacon(this.nextStop()); }
  updateIslands() {
    if (!this.arch || this.mode !== 'play') return;
    const { x, z } = this.player.pos;
    const pt = this.arch.partAt(x, z);
    if (pt && pt.level !== this.level && !this.switching) { this.switching = true; this.events.island?.(pt.level); }
    const inPortal = this.arch.atPortal(x, z);
    if (inPortal && !this.inPortal) this.events.portal?.();
    this.inPortal = inPortal;
    const gate = this.arch.lockedGateAt(x, z), door = this.arch.shutDoorAt(x, z), told = gate || door;
    if (told && told !== this.gateTold) this.events.kubo?.(t(door ? 'way.door' : 'way.locked'));
    this.gateTold = told;
    this.updateBeacon();
  }
  // back on the island after the results: the figure stands finished and you can walk on
  walkOn() {
    this.roaming = true;
    this.fx.clearBeam();
    for (const v of this.voxels) { v.mesh.position.copy(v.target); v.mesh.rotation.set(0, 0, 0); v.mesh.scale.setScalar(1); }
    this.arch?.refresh();
    this.startIntro();
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
      if (v.state === 'flying' || v.state === 'dropping') {
        const a = v.anim;
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
      // all blocks are out at once: only nearby ones cast shadows (saves a lot on big figures)
      if ((this.t * 4 + v.i) % 8 < 1) m.castShadow = m.position.distanceToSquared(this.camera.position) < 900;
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
    return { v: 2, id: this.level.id, seed: this.runSeed, placed: this.linkOrder.slice(), elapsed: Math.round(this.elapsed), hints: this.hintsUsed, n: this.voxels.length, done: this.placedCount, splits: this.splits.slice() };
  }

  openSocketNumbers() { return [...this.sockets.values()].map(s => s.num).sort((a, b) => a - b); }
  readyNumbers() { return new Set(this.carriedAll().filter(i => this.sockets.has(i)).map(i => this.voxels[i].num)); }
}
