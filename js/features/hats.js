// Star rewards: Kubo wears a hat for every star milestone you reach (the newest one he's earned), and tells you
// the first time he gets one. Small voxel hats built from a few boxes, hung off the companion's hat slot
// (ctx.dressKubo is called by companion.js every frame he's shown).
import { t } from '../i18n.js';
import { toon } from '../render.js';

export const MILESTONES = [
  { n: 25, id: 'sprout' },
  { n: 60, id: 'party' },
  { n: 100, id: 'crown' },
  { n: 150, id: 'star' },
];

let ctx, THREE;
const built = new Map();

export function init(c) {
  ctx = c; THREE = c.THREE;
  const stars = () => ctx.LEVELS.reduce((k, l) => { const s = ctx.save.stars[l.id] || {}; return k + !!s.done + !!s.fast + !!s.clean; }, 0);
  ctx.kuboHat = () => [...MILESTONES].reverse().find(m => stars() >= m.n) || null;
  // the same hat for Kubo in the Garden (scaled to his size there) and on the world map (a small SVG)
  ctx.makeKuboHat = (id, size = 0.56) => { const h = make(id); h.scale.multiplyScalar(size / 0.56); return h; };
  ctx.hatSvg = id => HAT_SVG[id] || '';
  let checkT = 0, current = null;
  ctx.dressKubo = kubo => {
    // once a second is plenty: stars only change on the results panel
    const now = performance.now();
    if (now - checkT > 1000) {
      checkT = now;
      current = ctx.kuboHat();
      const seen = ctx.save.seen.hat || 0;
      if (current && current.n > seen) {
        ctx.save.seen.hat = current.n; ctx.persist();
        const n = current.n;
        setTimeout(() => ctx.kuboSays(t('kubo.newHat', { n })), 1200);
      }
    }
    const id = current?.id || null;
    if (kubo.hat === id) return;
    kubo.hat = id;
    for (const h of built.values()) h.visible = false;
    if (!id) return;
    if (!built.has(id)) { const h = make(id); built.set(id, h); kubo.hats.add(h); }
    built.get(id).visible = true;
  };
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const INK = '#2a1f3d';
const HAT_SVG = {
  sprout: `<svg viewBox="0 0 24 16"><path d="M12 16V8" stroke="#3f8f3a" stroke-width="2.4"/><path d="M12 9C9 4 4 5 3 7c3 3 6 3 9 2zM12 8c3-5 8-5 9-3-3 4-6 4-9 3z" fill="#6fdc6a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  party: `<svg viewBox="0 0 24 20"><path d="M5 19 12 4l7 15z" fill="#ff6b6b" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 13h8" stroke="#4cc9f0" stroke-width="2.4"/><circle cx="12" cy="3.4" r="2.6" fill="#fff4e0" stroke="${INK}" stroke-width="1.4"/></svg>`,
  crown: `<svg viewBox="0 0 24 14"><path d="M2 13V4l5 4 5-7 5 7 5-4v9z" fill="#ffc93c" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  star: `<svg viewBox="0 0 24 22"><path d="M2 21v-9l5 4 5-7 5 7 5-4v9z" fill="#ffc93c" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="m12 0 1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff1a8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
};

function make(id) {
  const g = new THREE.Group();
  if (id === 'sprout') {
    // a little seedling: stem and two leaves
    g.add(box(0.05, 0.2, 0.05, 0x4caf50, 0, 0.1, 0));
    const l = box(0.16, 0.05, 0.09, 0x6fdc6a, -0.08, 0.2, 0); l.rotation.z = 0.5; g.add(l);
    const r = box(0.16, 0.05, 0.09, 0x6fdc6a, 0.08, 0.22, 0); r.rotation.z = -0.5; g.add(r);
  } else if (id === 'party') {
    // a stepped party cone with a pom-pom
    g.add(box(0.3, 0.08, 0.3, 0xff6b6b, 0, 0.04, 0));
    g.add(box(0.22, 0.08, 0.22, 0x4cc9f0, 0, 0.12, 0));
    g.add(box(0.14, 0.08, 0.14, 0xff6b6b, 0, 0.2, 0));
    g.add(box(0.08, 0.08, 0.08, 0xfff4e0, 0, 0.28, 0));
    g.rotation.z = -0.18; g.position.x = 0.06;
  } else {
    g.scale.setScalar(0.9);
    // a crown: a band with five points (the gold star crown has a star on top)
    const gold = 0xffc93c;
    g.add(box(0.5, 0.1, 0.5, gold, 0, 0.05, 0));
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0.22]]) g.add(box(0.08, 0.12, 0.08, gold, x, 0.16, z));
    g.add(box(0.07, 0.07, 0.03, 0xff6b6b, 0, 0.06, 0.26));
    if (id === 'star') {
      const s = box(0.16, 0.16, 0.05, 0xfff1a8, 0, 0.36, 0); s.rotation.z = Math.PI / 4; g.add(s);
      g.add(box(0.12, 0.12, 0.06, 0xffe066, 0, 0.36, 0));
    }
  }
  // the seedling and the party hat read better a size up
  if (id === 'sprout' || id === 'party') g.scale.setScalar(1.35);
  return g;
}
