// Design simulation: compares block-availability models with a human-like player model.
// node --import ./tools/register.mjs tools/design-sim.mjs [levelIds]
import { LEVELS, expandLevel, partsFor } from '../js/levels.js';
import { generatePuzzle, mulberry32, S } from '../js/voxels.js';

const RUN = 6.2;           // m/s average while moving
const READ_R = 4.5;        // can read a block's numbers within this distance
const SEE_R = 14;          // notices blocks within this distance
const T_READ = 0.7, T_PICK = 0.6, T_LINK = 1.4, T_THINK = 0.4;
const MEMORY = 8;          // remembers the last N blocks it has read (numbers + location)

function stagesFor(cells, puzzle) {
  const n = cells.length;
  const count = partsFor(n);
  const stageOf = new Array(n).fill(0);
  if (count === 1) return { count, stageOf };
  const byH = cells.map((c, i) => i).sort((a, b) => (cells[a].iy - cells[b].iy) || (Math.hypot(cells[a].x, cells[a].z) - Math.hypot(cells[b].x, cells[b].z)));
  byH.forEach((i, r) => { stageOf[i] = Math.floor((r * count) / n); });
  const q = [...puzzle.roots];
  while (q.length) { const p = q.shift(); for (const c of puzzle.children[p]) { stageOf[c] = Math.max(stageOf[c], stageOf[p]); q.push(c); } }
  return { count, stageOf };
}

function simulate(level, variant, seed) {
  const rng = mulberry32(seed);
  const { cells } = expandLevel(level);
  const puzzle = generatePuzzle(cells, rng);
  const n = cells.length;
  const footR = Math.max(3.2, ...cells.map(c => Math.hypot(c.x, c.z) * S + S));
  const R = Math.max(12 + Math.sqrt(n) * 1.25, footR + 14);
  const { count, stageOf } = stagesFor(cells, puzzle);
  const placed = new Array(n).fill(false);
  for (const r of puzzle.roots) placed[r] = true;
  // seed core like the game
  const seedN = n < 30 ? 0 : Math.round(n * 0.07);
  const q0 = puzzle.roots.flatMap(r => puzzle.children[r]);
  for (let k = 0; k < seedN && q0.length; k++) { const c = q0.splice(Math.floor(rng() * q0.length), 1)[0]; placed[c] = true; q0.push(...puzzle.children[c]); }
  // positions
  const pos = cells.map((c, i) => {
    let th, r;
    if (variant.zoned && count > 1) {
      // each part gets its own sector of the island
      const sector = (Math.PI * 2) / count;
      th = stageOf[i] * sector + rng() * sector;
    } else th = rng() * Math.PI * 2;
    const r0 = Math.max(4, footR + 1.2);
    const Rmax = variant.compact ? Math.min(R - 1, r0 + 6 + Math.sqrt(Math.min(n, 40)) * 1.4) : R - 1;
    r = r0 + Math.sqrt(rng()) * (Rmax - r0);
    return { x: Math.cos(th) * r, z: Math.sin(th) * r };
  });
  let stage = variant.stages ? 0 : count - 1;
  const available = i => !placed[i] && (!variant.stages || stageOf[i] <= stage);
  const fits = i => !placed[i] && puzzle.parent[i] >= 0 && placed[puzzle.parent[i]] && stageOf[i] <= stage;
  let px = 0, pz = 9, t = 0, dist = 0, reads = 0, wasted = 0;
  const pack = [];
  const memory = new Map(); // i -> true (known numbers)
  const readSet = new Set();
  const move = (x, z) => { const d = Math.hypot(x - px, z - pz); t += d / RUN; dist += d; px = x; pz = z; };
  let magnetCd = 0, guard = 0;
  while (placed.some(p => !p) && guard++ < 20000) {
    if (variant.stages) while (stage < count - 1 && cells.every((c, i) => stageOf[i] > stage || placed[i])) stage++;
    // 1. carrying something that fits -> go link everything that fits
    const fitIn = pack.filter(fits);
    if (fitIn.length && (pack.length >= 4 || !nearbyFit())) {
      const d = Math.hypot(px, pz); if (d > 4) move(px * 4 / d, pz * 4 / d);
      while (true) {
        const k = pack.findIndex(fits);
        if (k < 0) break;
        placed[pack[k]] = true; pack.splice(k, 1); t += T_LINK;
      }
      continue;
    }
    // tools
    if (variant.magnet && magnetCd <= t) {
      // magnet: pull every fitting block within 10 m into the pack (up to capacity)
      const pulled = [];
      for (let i = 0; i < n; i++) if (available(i) && fits(i) && !pack.includes(i) && Math.hypot(pos[i].x - px, pos[i].z - pz) < 10 && pack.length + pulled.length < 4) pulled.push(i);
      if (pulled.length) { pack.push(...pulled); magnetCd = t + 25; t += 1; continue; }
    }
    // 2. known fitting block -> fetch it
    let target = -1, best = Infinity;
    const knownFit = i => available(i) && !pack.includes(i) && fits(i) && (memory.has(i) || (variant.glint && Math.hypot(pos[i].x - px, pos[i].z - pz) < 9));
    for (let i = 0; i < n; i++) if (knownFit(i)) { const d = Math.hypot(pos[i].x - px, pos[i].z - pz); if (d < best) { best = d; target = i; } }
    if (target >= 0 && pack.length < 4) { move(pos[target].x, pos[target].z); t += T_PICK; pack.push(target); continue; }
    if (fitIn.length) { // nothing else known: go link
      const d = Math.hypot(px, pz); if (d > 4) move(px * 4 / d, pz * 4 / d);
      for (let k = pack.length - 1; k >= 0; k--) if (fits(pack[k])) { placed[pack[k]] = true; pack.splice(k, 1); t += T_LINK; }
      continue;
    }
    // 3. explore: walk to the nearest unread available block within sight, else wander
    target = -1; best = Infinity;
    const curStage = Math.min(...cells.map((c, i) => placed[i] ? Infinity : stageOf[i]));
    for (let i = 0; i < n; i++) {
      if (!available(i) || pack.includes(i) || readSet.has(i)) continue;
      if (variant.zoneAware && stageOf[i] !== curStage) continue;
      const d = Math.hypot(pos[i].x - px, pos[i].z - pz);
      if (d < best) { best = d; target = i; }
    }
    if (target < 0) { readSet.clear(); memory.clear(); t += 2; continue; } // forgot everything; re-scan
    if (best > READ_R) { const k = (best - READ_R * 0.8) / best; move(px + (pos[target].x - px) * k, pz + (pos[target].z - pz) * k); }
    // read all blocks within READ_R
    for (let i = 0; i < n; i++) {
      if (!available(i) || pack.includes(i) || readSet.has(i)) continue;
      if (Math.hypot(pos[i].x - px, pos[i].z - pz) <= READ_R) {
        if (variant.zoneAware && stageOf[i] !== curStage) continue; // tinted differently: not worth reading yet
        readSet.add(i); reads++; t += T_READ;
        if (fits(i)) { memory.set(i, true); }
        else { wasted++; memory.set(i, true); if (memory.size > MEMORY) memory.delete(memory.keys().next().value); }
      }
    }
    t += T_THINK;
    // stage change or new links make old reads stale-but-remembered (memory helps)
    if (memory.size > MEMORY) memory.delete(memory.keys().next().value);
  }
  return { t, dist, reads, wasted, n };
  function nearbyFit() { for (let i = 0; i < n; i++) if (available(i) && !pack.includes(i) && fits(i) && Math.hypot(pos[i].x - px, pos[i].z - pz) < 6 && (memory.has(i) || variant.glint)) return true; return false; }
}

const VARIANTS = {
  'parts (current)': { stages: true, glint: true },
  'all-at-once': { stages: false, glint: true },
  'all-at-once, zoned by part': { stages: false, glint: true, zoned: true },
  'all-at-once + magnet tool': { stages: false, glint: true, magnet: true },
  'all-at-once, zoned + magnet': { stages: false, glint: true, zoned: true, magnet: true },
  'parts + magnet': { stages: true, glint: true, magnet: true },
  'parts, zoned': { stages: true, glint: true, zoned: true },
  'parts, compact island': { stages: true, glint: true, compact: true },
  'all-at-once, zoned + zone-aware': { stages: false, glint: true, zoned: true, zoneAware: true },
  'all-at-once, zoned-aware + magnet': { stages: false, glint: true, zoned: true, zoneAware: true, magnet: true },
};
const ids = (process.argv[2] || 'windmill,whale,dragon,octopus,colossus').split(',');
for (const id of ids) {
  const level = LEVELS.find(l => l.id === id);
  if (!level) { console.error(`unknown level '${id}' (ids: ${LEVELS.map(l => l.id).join(', ')})`); process.exitCode = 1; continue; }
  console.log(`\n${level.name} (${expandLevel(level).cells.length} blocks)`);
  for (const [name, v] of Object.entries(VARIANTS)) {
    const runs = [];
    for (let s = 1; s <= 12; s++) runs.push(simulate(level, v, s * 7919));
    const avg = k => runs.reduce((a, r) => a + r[k], 0) / runs.length;
    console.log(`  ${name.padEnd(30)} time ${(avg('t') / 60).toFixed(1).padStart(5)} min · walk ${Math.round(avg('dist')).toString().padStart(5)} m · reads ${Math.round(avg('reads')).toString().padStart(4)} · wasted reads/link ${(avg('wasted') / avg('n')).toFixed(2)}`);
  }
}
