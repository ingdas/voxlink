// Figures, chapters and story. Figures are built on an integer grid (x right, y up, z towards the viewer).

export const PALETTE = {
  r: 0xff5d5d, // coral red
  o: 0xff9f43, // orange
  y: 0xffd23f, // sunflower
  g: 0x5fd068, // leaf green
  G: 0x2f9e5b, // pine green
  l: 0x9be36b, // lime
  b: 0x9a6b4f, // bark
  B: 0x6b4a36, // dark wood
  w: 0xfff8ec, // cream white
  k: 0x3a3352, // ink-ish dark
  s: 0xb9c3d6, // silver
  n: 0x7d8597, // stone grey
  c: 0x4cc9f0, // sky cyan
  u: 0x4a6cf7, // blue
  U: 0x2d3f9e, // deep blue
  p: 0xff8fc7, // pink
  v: 0x9b5de5, // violet
  V: 0x6a3fb5, // deep violet
  t: 0xe8d9b8, // sand stone
  i: 0xbfe8ff, // ice
  // patterned blocks (append only: workshop share codes index this list)
  e: 0xf2474f, // glossy apple red
  m: 0xff5d5d, // toadstool red with light dots
  z: 0xff5d5d, // ladybug red with dark spots
  h: 0x8fd8ff, // blue glass
  j: 0xffde6a, // yellow glass (lamps)
};
// face patterns drawn by the voxel shader: 1 light dots, 2 dark spots, 3 glass shine
export const PATTERN = { e: 3, m: 1, z: 2, h: 3, j: 3 };

// ---------- tiny voxel modelling kit ----------
export function figure(fn) {
  const m = new Map();
  const k = (x, y, z) => `${x},${y},${z}`;
  const api = {
    set(x, y, z, c) { m.set(k(x, y, z), { x, y, z, c }); },
    del(x, y, z) { m.delete(k(x, y, z)); },
    has(x, y, z) { return m.has(k(x, y, z)); },
    get(x, y, z) { return m.get(k(x, y, z))?.c; },
    box(x0, y0, z0, x1, y1, z1, c) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
          for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) api.set(x, y, z, c);
    },
    ellipsoid(cx, cy, cz, rx, ry, rz, c) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
          for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
            const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
            if (d <= 1.0001) api.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
          }
    },
    // a line from one cell to another; every step moves along one axis, so the cells stay face-connected
    line(x0, y0, z0, x1, y1, z1, c) {
      const a = [x0, y0, z0], d = [x1 - x0, y1 - y0, z1 - z0], p = a.slice();
      const n = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]);
      api.set(...p, c);
      for (let i = 1; i <= n; i++) {
        let best = 0, lag = -Infinity;
        for (let k = 0; k < 3; k++) {
          const behind = Math.abs(d[k]) * (i / n) - Math.abs(p[k] - a[k]);
          if (p[k] !== a[k] + d[k] && behind > lag) { lag = behind; best = k; }
        }
        p[best] += Math.sign(d[best]);
        api.set(...p, c);
      }
    },
    layers(y0, rows, x0 = 0, z0 = 0) {
      // rows: array of layers (bottom -> top), each an array of strings (z rows); '.' = empty
      rows.forEach((layer, dy) => layer.forEach((row, dz) => {
        for (let dx = 0; dx < row.length; dx++) if (row[dx] !== '.') api.set(x0 + dx, y0 + dy, z0 + dz, row[dx]);
      }));
    },
    // a quarter turn around the vertical axis (what faced +z now faces +x)
    turn() { const all = [...m.values()]; m.clear(); for (const v of all) api.set(v.z, v.y, -v.x, v.c); },
    recolor(fn) { for (const v of m.values()) { const c = fn(v.x, v.y, v.z, v.c); if (c) v.c = c; } },
  };
  fn(api);
  return [...m.values()];
}

const FIGURES = {
  sprout: () => figure(f => f.layers(0, [['.o.'], ['.g.'], ['lgl'], ['.y.']])),

  mushroom: () => figure(f => f.layers(0, [
    ['...', '.w.', '...'],
    ['...', '.w.', '...'],
    ['mmm', 'mmm', 'mmm'],
    ['.m.', 'mmm', '.m.'],
  ])),

  duck: () => figure(f => {
    f.box(-1, 0, 0, 1, 1, 2, 'y');
    f.box(-1, 2, 1, 1, 3, 2, 'y');
    f.set(-1, 3, 2, 'k'); f.set(1, 3, 2, 'k');
    for (let x = -1; x <= 1; x++) f.set(x, 2, 3, 'o');
    f.set(0, 4, 2, 'y');
    f.set(0, 1, -1, 'y'); f.set(0, 2, -1, 'y');
  }),
  windmill: () => figure(f => {
    f.box(-1, 0, -1, 1, 0, 1, 'n');
    f.set(0, 0, 1, 'B');
    for (let y = 1; y <= 6; y++) for (const [x, z] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) f.set(x, y, z, 't');
    f.box(-1, 7, -1, 1, 7, 1, 'r');
    f.set(0, 8, 0, 'r');
    // pinwheel sails on the front
    f.set(0, 5, 2, 'B');
    for (let i = 1; i <= 3; i++) { f.set(0, 5 + i, 2, 'B'); f.set(0, 5 - i, 2, 'B'); f.set(-i, 5, 2, 'B'); f.set(i, 5, 2, 'B'); }
    for (const [x, y] of [[1, 7], [1, 8], [2, 4], [3, 4], [-1, 2], [-1, 3], [-2, 6], [-3, 6]]) f.set(x, y, 2, 'w');
  }),
  penguin: () => figure(f => f.layers(0, [
    ['.....', '.....', '.o.o.', '.....'],
    ['.kkk.', 'kkkkk', '.www.', '.....'],
    ['.kkk.', 'kkkkk', '.www.', '.....'],
    ['.kkk.', '.kkk.', '.kwk.', '.....'],
    ['.kkk.', '.kkk.', '.wkw.', '..o..'],
    ['.....', '..k..', '.....', '.....'],
  ])),

  snowman: () => figure(f => {
    const plus = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [x, z] of plus) { f.set(x, 0, z, 'w'); f.set(x, 3, z, 'w'); }
    for (const y of [1, 2]) { f.box(-1, y, -1, 1, y, 1, 'w'); for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) f.set(x, y, z, 'w'); }
    f.set(0, 1, 2, 'k'); f.set(0, 2, 2, 'k');
    f.box(-1, 4, -1, 1, 5, 1, 'w');
    f.recolor((x, y, z) => (y === 4 && !(x === 0 && z === 0) ? 'r' : null));
    f.set(-1, 5, 1, 'k'); f.set(1, 5, 1, 'k');
    f.set(0, 5, 2, 'o');
    f.box(-1, 6, -1, 1, 6, 1, 'k');
    f.set(0, 7, 0, 'k');
    for (const sx of [-1, 1]) { f.set(3 * sx, 2, 0, 'B'); f.set(3 * sx, 3, 0, 'B'); f.set(4 * sx, 3, 0, 'B'); }
  }),
  frostpine: () => figure(f => {
    f.set(0, 0, 0, 'b'); f.set(0, 1, 0, 'b');
    f.box(-2, 2, -2, 2, 2, 2, 'G');
    for (const x of [-2, 2]) for (const z of [-2, 2]) f.del(x, 2, z);
    f.box(-1, 3, -1, 1, 3, 1, 'G');
    f.box(-1, 4, -1, 1, 4, 1, 'G');
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) f.set(x, 4, z, 'G');
    for (const [x, z] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { f.set(x, 5, z, 'G'); f.set(x, 6, z, 'G'); }
    f.set(0, 7, 0, 'G');
    // snow on every ledge that has open sky above it
    f.recolor((x, y, z) => (!f.has(x, y + 1, z) && y >= 2 ? 'w' : null));
    f.set(0, 8, 0, 'y');
  }),
  polarbear: () => figure(f => {
    f.box(-1, 2, -2, 1, 4, 2, 'w');
    f.del(-1, 4, -2); f.del(1, 4, -2); f.del(-1, 4, 2); f.del(1, 4, 2);
    for (const x of [-1, 1]) for (const z of [-2, 2]) { f.set(x, 0, z, 'w'); f.set(x, 1, z, 'w'); }
    f.box(-1, 3, 3, 1, 5, 4, 'w');
    f.set(0, 3, 5, 'w'); f.set(0, 4, 5, 'k');
    f.set(-1, 5, 4, 'k'); f.set(1, 5, 4, 'k');
    f.set(-1, 6, 3, 'w'); f.set(1, 6, 3, 'w');
    f.set(0, 4, -3, 'w');
    for (const x of [-1, 1]) for (const z of [-2, 2]) f.set(x, 0, z, 'k');
  }),

  crab: () => figure(f => {
    for (const x of [-2, 2]) for (const z of [-1, 0, 1]) f.set(x, 0, z, 'o');
    f.box(-2, 1, -1, 2, 1, 1, 'r');
    f.box(-1, 2, -1, 1, 2, 1, 'r');
    for (const s of [-1, 1]) {
      f.set(3 * s, 1, 1, 'r'); f.set(3 * s, 2, 1, 'r'); f.set(3 * s, 2, 2, 'o');
      f.set(3 * s, 3, 2, 'o'); f.set(3 * s, 3, 1, 'r');
      f.set(s, 3, 1, 'r'); f.set(s, 4, 1, 'k');
    }
    f.set(0, 2, 2, 'p');
  }),

  palm: () => figure(f => {
    f.ellipsoid(0, 0, 0, 1.6, 0.5, 1.6, 'y');
    for (let y = 1; y <= 3; y++) f.set(0, y, 0, 'b');
    f.set(1, 3, 0, 'b');
    for (let y = 4; y <= 6; y++) f.set(1, y, 0, 'b');
    f.set(1, 7, 0, 'g');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let i = 1; i <= 2; i++) f.set(1 + dx * i, 7, dz * i, i === 2 ? 'G' : 'g');
      f.set(1 + dx * 3, 7, dz * 3, 'G');
      f.set(1 + dx * 3, 6, dz * 3, 'G');
    }
    f.set(1, 8, 0, 'g');
    f.set(2, 6, 0, 'B'); f.set(1, 6, 1, 'B'); f.set(0, 6, 0, 'B');
  }),

  sailboat: () => figure(f => {
    for (let z = -2; z <= 2; z++) f.set(0, 0, z, 'B');
    f.box(-1, 1, -3, 1, 1, 3, 'b');
    for (let z = -3; z <= 3; z++) { f.set(-1, 2, z, 'r'); f.set(1, 2, z, 'r'); }
    f.set(0, 2, -3, 'r');
    f.set(0, 1, 4, 'b'); f.set(0, 2, 4, 'r');
    for (let y = 2; y <= 9; y++) f.set(0, y, 0, 'B');
    for (let y = 3; y <= 8; y++) {
      const len = y <= 6 ? 3 : 9 - y;
      for (let z = 1; z <= len; z++) f.set(0, y, z, 'w');
    }
    for (let y = 4; y <= 6; y++) for (let z = -2; z <= -1; z++) f.set(0, y, z, 'y');
    f.set(0, 10, 0, 'r'); f.set(0, 10, -1, 'r');
  }),

  whale: () => figure(f => {
    f.ellipsoid(0, 2, 0, 2.3, 1.9, 3.6, (x, y) => (y <= 1 ? 'w' : 'u'));
    f.set(-1, 0, 2, 'w'); f.set(1, 0, 2, 'w');
    f.set(0, 2, -4, 'u'); f.set(0, 3, -5, 'u'); f.set(0, 2, -5, 'u');
    f.set(0, 3, -6, 'u'); f.set(-1, 3, -6, 'u'); f.set(1, 3, -6, 'u'); f.set(-2, 3, -6, 'U'); f.set(2, 3, -6, 'U');
    for (const sx of [-1, 1]) { f.set(2 * sx, 1, 1, 'U'); f.set(3 * sx, 1, 1, 'U'); f.set(3 * sx, 0, 1, 'U'); }
    f.set(-2, 2, 3, 'k'); f.set(2, 2, 3, 'k');
    f.set(0, 4, 1, 'c'); f.set(0, 5, 1, 'c'); f.set(-1, 6, 1, 'c'); f.set(1, 6, 1, 'c'); f.set(0, 6, 1, 'c');
  }),

  robot: () => figure(f => f.layers(0, [
    ['.n.n.', '.n.n.'],
    ['.s.s.', '.s.s.'],
    ['.sss.', '.sss.'],
    ['usssu', 'usrsu'],
    ['usssu', 'usssu'],
    ['.sss.', '.hsh.'],
    ['.sss.', '.sss.'],
    ['..r..', '.....'],
  ])),

  castle: () => figure(f => {
    f.layers(0, [
      ['ttttt', 't...t', 't...t', 't...t', 'ttbtt'],
      ['ttttt', 't...t', 't...t', 't...t', 'ttbtt'],
      ['t.t.t', '.....', 't...t', '.....', 't.t.t'],
      ['t...t', '.....', '.....', '.....', 't...t'],
      ['v...v', '.....', '.....', '.....', 'v...v'],
    ]);
    f.set(0, 5, 0, 'y'); f.set(4, 5, 4, 'y');
  }),

  rocket: () => figure(f => {
    f.set(0, 0, 0, 'k');
    f.box(-1, 1, -1, 1, 5, 1, 'w');
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { f.set(x, 1, z, 'r'); f.set(x, 2, z, 'r'); }
    f.set(0, 4, 2, 'h'); f.set(0, 3, 2, 'w');
    f.box(-1, 6, -1, 1, 6, 1, 'r');
    f.set(0, 7, 0, 'r'); f.set(0, 8, 0, 'y');
    f.recolor((x, y, z) => (y === 1 && Math.abs(x) <= 1 && Math.abs(z) <= 1 ? 's' : null));
  }),

  balloon: () => figure(f => {
    // striped envelope
    f.ellipsoid(0, 7, 0, 2.4, 2.9, 2.4, (x, y, z) => {
      const a = Math.atan2(z, x);
      if (y >= 9) return 'r';
      return Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 ? 'y' : 'r';
    });
    f.set(0, 10, 0, 'y');
    // ropes
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) for (let y = 2; y <= 4; y++) f.set(x, y, z, 'B');
    // basket
    for (let y = 0; y <= 1; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (y === 1 && x === 0 && z === 0) continue;
      f.set(x, y, z, 'b');
    }
    f.set(0, 1, 0, 'o');
  }),

  octopus: () => figure(f => {
    f.ellipsoid(0, 5.2, 0, 2.1, 2.4, 2.1, 'p');
    f.set(-1, 5, 2, 'w'); f.set(1, 5, 2, 'w'); f.set(-1, 5, 3, 'k'); f.set(1, 5, 3, 'k');
    f.set(0, 4, 2, 'v');
    // eight curly legs
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    dirs.forEach(([dx, dz], i) => {
      let x = dx, z = dz, y = 3;
      const path = [[x, y, z]];
      for (let k = 0; k < 3; k++) { y = Math.max(0, y - 1); path.push([x, y, z]); x += dx; path.push([x, y, z]); z += dz; if (dz) path.push([x, y, z]); }
      path.push([x, y + 1, z]);
      if (i % 2) path.push([x, y + 2, z]);
      for (const [px, py, pz] of path) f.set(px, py, pz, py === 0 ? 'v' : 'p');
    });
  }),

  lighthouse: () => figure(f => {
    const plus = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    f.box(-1, 0, -1, 1, 0, 1, 'n');
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) f.set(x, 0, z, 'n');
    for (let y = 1; y <= 10; y++) {
      const c = Math.floor((y - 1) / 2) % 2 ? 'w' : 'r';
      for (const [x, z] of plus) f.set(x, y, z, c);
      if (y <= 2) for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) f.set(x, y, z, c);
    }
    f.set(0, 1, 2, 'B');
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) f.set(x, 11, z, 'h');
    for (const [x, z] of plus) f.set(x, 11, z, 'j');
    f.box(-1, 12, -1, 1, 12, 1, 'k');
    f.set(0, 13, 0, 'r');
  }),
  // The final boss: a giant Keeper statue with Kubo's face.
  colossus: () => figure(f => {
    for (const sx of [-1, 1]) {
      f.box(sx * 1, 0, -1, sx * 2, 4, 0, 'n');                    // legs
      f.box(sx * 1, 0, 1, sx * 2, 0, 1, 'k');                      // toes
      f.box(sx * 4, 6, -1, sx * 4, 8, 0, 't');                     // arms
      f.box(sx * 4, 3, -1, sx * 4, 5, 0, 'n');                     // fists
    }
    f.box(-3, 5, -2, 3, 8, 1, 't');                                 // body
    f.box(-3, 5, -2, 3, 5, 1, 'B');                                 // belt
    f.recolor((x, y, z) => (z === 1 && y >= 6 && y <= 7 && Math.abs(x) <= 1 ? 'c' : null)); // glowing heart
    f.box(-3, 9, -2, 3, 13, 1, 'y');                                // Kubo head
    f.recolor((x, y, z) => {
      if (z !== 1 || y < 9 || y > 13) return null;
      if (Math.abs(x) === 1 && (y === 11 || y === 12)) return 'k'; // eyes
      if (y === 9 && Math.abs(x) <= 1) return 'k';                 // smile
      if (y === 10 && Math.abs(x) === 2) return 'k';
      if (y === 10 && Math.abs(x) === 3) return 'p';               // cheeks
      return null;
    });
    f.recolor((x, y) => (y === 13 ? 'o' : null));                   // crown band
    for (const x of [-3, 0, 3]) { f.set(x, 14, -1, 'o'); f.set(x, 14, 0, 'o'); f.set(x, 15, 0, 'y'); }
    f.set(0, 16, 0, 'c');
  }),
  dragon: () => figure(f => {
    f.box(-1, 2, -2, 1, 4, 2, 'v');
    for (const x of [-1, 1]) for (const z of [-2, 2]) f.del(x, 4, z);
    f.recolor((x, y) => (y === 2 && x === 0 ? 'y' : null));
    for (const x of [-1, 1]) for (const z of [-2, 2]) { f.set(x, 0, z, 'V'); f.set(x, 1, z, 'V'); }
    f.set(0, 5, 2, 'v'); f.set(0, 6, 2, 'v'); f.set(0, 6, 3, 'v');
    f.box(-1, 7, 3, 1, 8, 5, 'v');
    f.set(0, 7, 6, 'v'); f.set(0, 8, 6, 'v');
    f.set(-1, 8, 5, 'y'); f.set(1, 8, 5, 'y');
    f.set(-1, 9, 3, 'y'); f.set(1, 9, 3, 'y');
    f.set(0, 3, -3, 'v'); f.set(0, 3, -4, 'v'); f.set(0, 4, -4, 'v'); f.set(0, 4, -5, 'v'); f.set(0, 5, -5, 'v'); f.set(0, 5, -6, 'y');
    for (const s of [-1, 1]) {
      for (let z = -1; z <= 1; z++) { f.set(2 * s, 4, z, 'p'); f.set(2 * s, 5, z, 'p'); f.set(3 * s, 5, z, 'p'); f.set(3 * s, 6, z, 'p'); }
      f.set(4 * s, 6, 0, 'p'); f.set(4 * s, 6, -1, 'p'); f.set(4 * s, 7, 0, 'p'); f.set(4 * s, 7, -1, 'V'); f.set(5 * s, 7, -1, 'V');
    }
    for (let z = -2; z <= 1; z++) f.set(0, 5, z, 'y');
  }),

  // ---------- Meadow ----------
  apple: () => figure(f => {
    // a round, shiny apple: narrow bottom, full middle, a top with a dip for the stem
    f.layers(0, [['.e.', 'eee', '.e.'], ['eee', 'eee', 'eee'], ['eee', 'eee', 'eee'], ['.e.', 'e.e', '.e.']], -1, -1);
    f.set(0, 3, 0, 'B'); f.set(0, 4, 0, 'B');
    f.set(1, 4, 0, 'g'); f.set(2, 4, 0, 'l');
  }),
  tulip: () => figure(f => {
    for (let y = 0; y <= 3; y++) f.set(0, y, 0, 'g');
    f.set(-1, 1, 0, 'l'); f.set(1, 2, 0, 'l');
    for (const [x, z] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) f.set(x, 4, z, x || z ? 'v' : 'y');
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) f.set(x, 5, z, 'p');
  }),
  ladybug: () => figure(f => {
    f.box(-1, 0, -2, 1, 0, 1, 'z');
    f.box(-1, 1, -1, 1, 1, 0, 'z');
    for (let x = -1; x <= 1; x++) f.set(x, 0, 2, 'k');
    f.set(-1, 1, 2, 'w'); f.set(1, 1, 2, 'w');
    f.turn(); // side-on, so the spotted shell faces you
  }),
  snail: () => figure(f => {
    for (let z = -2; z <= 3; z++) f.set(0, 0, z, 'l');
    f.set(0, 1, 3, 'l'); f.set(0, 2, 3, 'l'); f.set(0, 3, 3, 'l');
    for (const x of [-1, 1]) { f.set(x, 3, 3, 'l'); f.set(x, 4, 3, 'k'); }
    // spiral shell: dark heart, lighter coils
    f.ellipsoid(0, 2.5, -0.5, 1.5, 1.7, 1.7, (x, y, z) => (Math.abs(y - 2.5) + Math.abs(z + 0.5) < 1.2 ? 'B' : 'o'));
  }),
  bunny: () => figure(f => {
    f.box(-1, 0, -1, 1, 1, 1, 'w');
    f.del(-1, 1, -1); f.del(1, 1, -1);
    f.box(-1, 2, 0, 1, 3, 1, 'w');
    f.set(-1, 3, 1, 'k'); f.set(1, 3, 1, 'k');
    f.set(0, 2, 2, 'p');
    for (const x of [-1, 1]) { for (let y = 4; y <= 6; y++) f.set(x, y, 0, 'w'); f.set(x, 4, 1, 'p'); f.set(x, 0, 2, 'w'); }
    f.set(0, 1, -2, 'w');
  }),
  sheep: () => figure(f => {
    f.box(-1, 1, -2, 1, 3, 1, 'w');
    for (const x of [-1, 1]) for (const z of [-2, 1]) { f.del(x, 3, z); f.set(x, 0, z, 'k'); }
    f.box(0, 2, 2, 0, 3, 3, 'k');
    f.set(-1, 3, 2, 'k'); f.set(1, 3, 2, 'k');
    f.set(0, 4, 2, 'w');
    f.set(0, 2, -3, 'w');
  }),

  // ---------- Frost ----------
  mitten: () => figure(f => {
    f.box(-1, 0, 0, 1, 0, 1, 'w');
    f.box(-1, 1, 0, 1, 4, 1, 'u');
    f.del(1, 4, 0); f.del(1, 4, 1);
    for (const z of [0, 1]) { f.set(2, 2, z, 'u'); f.set(2, 3, z, 'u'); }
    f.recolor((x, y, z) => (y === 2 && x < 2 && (x + z + 4) % 2 === 0 ? 'w' : null)); // knitted band
  }),
  sled: () => figure(f => {
    for (const x of [-1, 1]) {
      for (let z = -2; z <= 2; z++) f.set(x, 0, z, 'n');
      f.set(x, 1, 3, 'n'); f.set(x, 2, 3, 'n');
    }
    f.box(-1, 1, -2, 1, 1, 2, 'b');
    f.recolor((x, y, z) => (y === 1 && Math.abs(z) <= 2 && z % 2 === 0 ? 'B' : null));
    f.set(0, 1, 3, 'r');
    f.box(-1, 2, -2, 0, 3, -1, 'r'); // a present on board
    f.set(-1, 4, -1, 'y'); f.set(0, 4, -2, 'y');
  }),
  seal: () => figure(f => {
    f.box(-1, 0, -3, 1, 0, 1, 's');
    f.box(-1, 1, 0, 1, 1, 1, 's');
    f.box(-1, 2, 1, 1, 3, 2, 's');
    f.set(-1, 3, 2, 'k'); f.set(1, 3, 2, 'k');
    f.set(0, 3, 3, 'k');                       // nose
    f.set(0, 4, 3, 'r'); f.set(0, 5, 3, 'w'); // ball balanced on it
    f.set(-2, 0, 0, 'n'); f.set(2, 0, 0, 'n');
    f.set(-1, 0, -4, 'n'); f.set(1, 0, -4, 'n');
  }),
  igloo: () => figure(f => {
    for (let x = -3; x <= 3; x++) for (let y = 0; y <= 3; y++) for (let z = -3; z <= 3; z++) {
      const d = Math.hypot(x, y, z);
      if (d <= 2.8 && d > 1.65) f.set(x, y, z, y % 2 ? 'i' : 'w');
    }
    f.del(0, 0, 2); f.del(0, 1, 2); // doorway
    for (const [x, y] of [[-1, 0], [-1, 1], [-1, 2], [0, 2], [1, 2], [1, 1], [1, 0]]) f.set(x, y, 3, 'w');
  }),
  owl: () => figure(f => {
    f.box(-1, 0, -1, 1, 4, 1, 'w');
    for (const x of [-1, 1]) for (const z of [-1, 1]) f.del(x, 4, z);
    for (const [x, y, z] of [[-1, 1, 1], [1, 0, 1], [0, 1, -1], [1, 2, 0], [-1, 3, -1]]) f.set(x, y, z, 'k');
    f.set(-1, 3, 1, 'y'); f.set(1, 3, 1, 'y');
    f.set(0, 2, 2, 'o');
    f.set(-1, 0, 2, 'o'); f.set(1, 0, 2, 'o');
    f.set(-1, 5, 0, 'w'); f.set(1, 5, 0, 'w');
  }),
  fox: () => figure(f => {
    f.box(-1, 0, -1, 1, 1, 1, 'o');
    f.box(-1, 2, 0, 1, 2, 1, 'o');
    f.box(-1, 3, 0, 1, 4, 2, 'o');
    f.del(-1, 4, 2); f.del(1, 4, 2);
    f.recolor((x, y, z) => ((z === 1 && x === 0 && y <= 2) || (y === 3 && z === 2) ? 'w' : null)); // chest and muzzle
    f.set(-1, 4, 1, 'k'); f.set(1, 4, 1, 'k');
    f.set(0, 3, 3, 'k');
    for (const x of [-1, 1]) { f.set(x, 5, 0, 'o'); f.set(x, 6, 0, 'k'); }
    for (const [x, y, z] of [[2, 0, -1], [2, 0, 0], [2, 0, 1], [2, 1, 1], [2, 1, 2]]) f.set(x, y, z, z === 2 ? 'w' : 'o');
  }),

  // ---------- Reef ----------
  starfish: () => figure(f => {
    f.box(-1, 0, -1, 1, 0, 1, 'o');
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      f.line(0, 0, 0, Math.round(Math.cos(a) * 3.4), 0, Math.round(Math.sin(a) * 3.4), 'o');
    }
    f.recolor((x, y, z) => (Math.hypot(x, z) >= 1.9 && (x + z + 8) % 2 === 0 ? 'y' : null));
    f.set(0, 1, 0, 'p');
  }),
  anchor: () => figure(f => {
    for (let y = 1; y <= 8; y++) f.set(0, y, 0, 'n');
    f.box(-2, 7, 0, 2, 7, 0, 'n');
    for (const [x, y] of [[-1, 9], [0, 9], [1, 9], [-1, 10], [1, 10], [-1, 11], [0, 11], [1, 11]]) f.set(x, y, 0, 's');
    f.box(-2, 0, 0, 2, 0, 0, 'n');
    for (const s of [-1, 1]) { f.set(3 * s, 0, 0, 'n'); f.set(3 * s, 1, 0, 'n'); f.set(3 * s, 2, 0, 'n'); f.set(2 * s, 2, 0, 'n'); }
    for (const [x, y] of [[1, 3], [-1, 4], [1, 5]]) f.set(x, y, 0, 'G'); // seaweed
  }),
  clownfish: () => figure(f => {
    f.ellipsoid(0, 2, 0.5, 2.6, 1.6, 1, 'o');
    f.recolor((x, y, z) => (x === 1 || x === -1 ? 'w' : null));
    for (const z of [0, 1]) {
      f.set(-3, 2, z, 'o'); f.set(-4, 2, z, 'o'); f.set(-4, 1, z, 'k'); f.set(-4, 3, z, 'k');
      f.set(0, 4, z, 'o'); f.set(-1, 4, z, 'k'); f.set(0, 0, z, 'o');
    }
    f.set(2, 2, 1, 'k'); f.set(2, 2, 0, 'k');
  }),
  jellyfish: () => figure(f => {
    f.ellipsoid(0, 5, 0, 2.3, 2.2, 2.3, (x, y) => (y >= 6 ? 'p' : 'v'));
    f.recolor((x, y, z) => (y === 7 ? 'w' : null));
    for (let x = -2; x <= 2; x++) for (let y = 3; y <= 4; y++) for (let z = -2; z <= 2; z++) f.del(x, y, z);
    const legs = [[-1, -1, [0, 1]], [1, 1, [-1, 0]], [1, -1, [0, -1]], [-1, 1, [1, 0]]];
    legs.forEach(([x, z, [dx, dz]], i) => {
      const end = i % 2 ? 0 : 1;
      for (let y = 4; y >= 3; y--) f.set(x, y, z, 'p');
      for (let y = 2; y >= end; y--) f.set(x + dx, y, z + dz, 'p');
      f.set(x + dx, 3, z + dz, 'p');
    });
    for (let y = 1; y <= 4; y++) f.set(0, y, 0, 'w');
  }),
  turtle: () => figure(f => {
    f.ellipsoid(0, 1, 0, 2.4, 2.2, 2.9, (x, y, z) => ((Math.abs(x) + Math.abs(z)) % 3 === 0 && y >= 2 ? 'g' : 'G'));
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (const y of [-1, 0]) f.del(x, y, z);
    for (const s of [-1, 1]) for (const z of [-1, 1]) { f.set(2 * s, 0, z, 'l'); f.set(3 * s, 0, z, 'l'); }
    f.set(0, 1, 3, 'l'); f.set(0, 1, 4, 'l'); f.set(0, 2, 4, 'l');
    f.set(-1, 2, 4, 'k'); f.set(1, 2, 4, 'k');
    f.set(0, 1, -3, 'l');
  }),
  chest: () => figure(f => {
    f.box(-2, 0, -1, 2, 2, 1, 'b');
    f.recolor((x, y) => (Math.abs(x) === 2 || y === 2 ? 'B' : null));
    f.set(0, 1, 2, 'y');                        // lock
    f.box(-2, 3, -1, 2, 4, -1, 'b');            // open lid
    f.recolor((x, y, z) => (y >= 3 && z === -1 && (Math.abs(x) === 2 || y === 4) ? 'B' : null));
    for (const [x, z, c] of [[-1, 0, 'y'], [0, 0, 'y'], [1, 0, 'y'], [-1, 1, 'p'], [0, 1, 'y'], [1, 1, 'c']]) f.set(x, 3, z, c);
    f.set(0, 4, 0, 'o');                        // a little crown on the pile
  }),

  // ---------- Starfall ----------
  star: () => figure(f => {
    f.layers(0, [
      ['yy...yy'], ['.yy.yy.'], ['..yyy..'], ['.yyyyy.'], ['yyyyyyy'], ['..yyy..'], ['...y...'],
    ], -3, 0);
    for (const [x, y] of [[-1, 3], [0, 3], [1, 3], [0, 4]]) f.set(x, y, 1, 'o');
  }),
  crystal: () => figure(f => {
    f.box(-1, 0, -1, 1, 0, 1, 'n');
    for (let y = 1; y <= 6; y++) f.set(0, y, 0, 'h');
    f.set(0, 7, 0, 'i');
    for (let y = 1; y <= 3; y++) f.set(1, y, 0, 'v');
    f.set(2, 3, 0, 'v'); f.set(2, 4, 0, 'v'); f.set(2, 5, 0, 'i');
    for (let y = 1; y <= 4; y++) f.set(-1, y, 1, 'V');
    f.set(-1, 5, 1, 'i');
    f.set(0, 1, -1, 'p'); f.set(0, 2, -1, 'p'); f.set(0, 2, -2, 'p'); f.set(0, 3, -2, 'p'); f.set(0, 4, -2, 'i');
    f.set(-1, 1, -1, 'c'); f.set(-1, 2, -1, 'i');
    f.set(1, 1, 1, 'v'); f.set(1, 2, 1, 'i');
  }),
  moon: () => figure(f => {
    for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) {
      if (x * x + y * y > 4.3 * 4.3 || (x - 2.1) ** 2 + (y - 0.6) ** 2 <= 3.6 * 3.6) continue;
      f.set(x, y, 0, 'y'); f.set(x, y, 1, 'y');
    }
    f.set(-2, 1, 1, 'k'); // a sleepy closed eye
    f.set(-2, -1, 1, 'p');
  }),
  astronaut: () => figure(f => {
    for (const s of [-1, 1]) {
      f.set(s, 0, 0, 'n'); f.set(s, 0, 1, 'n');
      f.set(s, 1, 0, 'w'); f.set(s, 2, 0, 'w');
      f.box(2 * s, 3, 0, 2 * s, 5, 0, 'w');
      f.set(2 * s, 3, 0, 's');
    }
    f.box(-1, 3, -1, 1, 5, 0, 'w');
    f.set(0, 4, 1, 'r'); f.set(-1, 4, 1, 'u');
    f.box(-1, 3, -2, 1, 4, -2, 's');
    f.box(-1, 6, -1, 1, 8, 1, 'w');
    for (const x of [-1, 1]) for (const z of [-1, 1]) f.del(x, 8, z);
    f.recolor((x, y, z) => (z === 1 && (y === 6 || y === 7) && Math.abs(x) <= 1 ? 'h' : null));
    f.set(1, 9, 0, 's'); f.set(1, 10, 0, 'r');
  }),
  ufo: () => figure(f => {
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const r = Math.hypot(x, z);
      if (r <= 3.2) f.set(x, 1, z, r > 2.5 && (x + z + 8) % 2 === 0 ? 'y' : 's');
      if (r <= 2.2) f.set(x, 2, z, 'n');
      if (r <= 1.5) f.set(x, 3, z, 'h');
    }
    f.set(0, 4, 0, 'l'); f.set(0, 5, 0, 'l'); // a little alien peeking out
    for (const [x, z] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) f.set(x, 0, z, 'y');
  }),
  satellite: () => figure(f => {
    f.set(0, 0, 0, 'k'); f.set(0, 1, 0, 'n');      // thruster
    f.box(-1, 2, -1, 1, 4, 1, 'y');                // gold-foil body
    f.recolor((x, y, z) => (y === 3 && z === 1 && x === 0 ? 'o' : null));
    for (const s of [-1, 1]) {
      f.set(2 * s, 3, 0, 'n');
      for (let k = 3; k <= 6; k++) for (let y = 2; y <= 4; y++) f.set(k * s, y, 0, k === 5 ? 's' : 'u'); // solar panels
    }
    f.set(0, 5, 0, 'n');
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) f.set(x, 6, z, 'w'); // the dish
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) f.set(x, 7, z, x || z ? 'w' : 'n'); // its rim, antenna in the middle
    f.set(0, 8, 0, 'r');
  }),

  // ---------- Eye of the Storm ----------
  kite: () => figure(f => {
    for (let x = -3; x <= 3; x++) for (let y = 4; y <= 12; y++) {
      if (Math.abs(x) / 3 + Math.abs(y - 8) / 4.2 > 1) continue;
      f.set(x, y, 0, x === 0 || y === 8 ? 'B' : (x > 0) === (y > 8) ? 'r' : 'y');
    }
    for (const [x, y] of [[0, 3], [0, 2], [1, 2], [1, 1], [1, 0]]) f.set(x, y, 0, 'B');
    f.set(-1, 2, 0, 'p'); f.set(2, 1, 0, 'c');
  }),
  weathervane: () => figure(f => {
    f.box(-1, 0, -1, 1, 0, 1, 'B');
    for (let y = 1; y <= 7; y++) f.set(0, y, 0, 'n');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      f.set(dx, 4, dz, 's'); f.set(2 * dx, 4, dz * 2, 's'); f.set(3 * dx, 4, dz * 3, 'k');
    }
    // the copper rooster, facing east
    f.layers(8, [
      ['...o...'], ['...oo..'], ['..oooo.'], ['.BBooo.'], ['BB..ooy'], ['B...oo.'], ['....rr.'],
    ].map(l => l), -3, 0);
  }),
  lantern: () => figure(f => {
    f.box(-1, 0, -1, 1, 0, 1, 'B');
    for (let y = 1; y <= 4; y++) {
      for (const x of [-1, 1]) for (const z of [-1, 1]) f.set(x, y, z, 'B');
      for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) f.set(x, y, z, y === 2 ? 'o' : 'j');
    }
    f.box(-1, 5, -1, 1, 5, 1, 'B');
    f.set(0, 6, 0, 'B');
    for (const [x, y] of [[-1, 6], [1, 6], [-1, 7], [1, 7], [-1, 8], [0, 8], [1, 8]]) f.set(x, y, 0, 'n');
  }),
  umbrella: () => figure(f => {
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const r = Math.hypot(x, z);
      const c = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? 'u' : 'y';
      if (r >= 2.2 && r <= 3.2) f.set(x, 6, z, c);
      if (r >= 1.2 && r <= 2.6) f.set(x, 7, z, c);
      if (r < 1.5) f.set(x, 8, z, c);
    }
    for (let y = 0; y <= 7; y++) f.set(0, y, 0, 'B');
    f.set(0, 9, 0, 'B');
    f.set(1, 0, 0, 'r'); f.set(2, 0, 0, 'r'); f.set(2, 1, 0, 'r');
  }),
  thunderbird: () => figure(f => {
    f.box(-1, 2, -2, 1, 4, 1, 'U');
    for (const x of [-1, 1]) { f.del(x, 4, -2); f.del(x, 2, -2); }
    f.recolor((x, y, z) => (z === 1 && x === 0 ? 'c' : null));
    f.box(-1, 5, 0, 1, 6, 2, 'U');
    for (const x of [-1, 1]) { f.del(x, 6, 0); f.del(x, 5, 2); }
    f.set(0, 5, 3, 'y'); f.set(-1, 6, 2, 'y'); f.set(1, 6, 2, 'y');
    f.set(0, 7, 0, 'c'); f.set(0, 7, 1, 'c'); f.set(0, 8, 0, 'c');
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
      const x = (2 + k) * s, y0 = 3 + Math.floor(k / 2);
      for (let y = y0; y <= y0 + (k === 4 ? 1 : 2); y++) f.set(x, y, -1, y === y0 + 1 && k % 2 === 0 ? 'y' : y === y0 + 1 ? 'c' : 'u');
    }
    f.box(-1, 2, -3, 1, 3, -3, 'u');
    f.set(0, 2, -4, 'y'); f.set(0, 3, -4, 'y');
    for (const x of [-1, 1]) { f.set(x, 1, 0, 'y'); f.set(x, 0, 0, 'y'); f.set(x, 0, 1, 'y'); }
  }),
  galleon: () => figure(f => {
    for (let z = -3; z <= 3; z++) f.set(0, 0, z, 'B');
    f.box(-2, 1, -3, 2, 1, 3, 'b');
    f.box(-1, 1, -4, 1, 1, 4, 'b');
    for (let z = -3; z <= 3; z++) { f.set(-2, 2, z, 'B'); f.set(2, 2, z, 'B'); }
    for (const z of [-4, 4]) { f.set(-1, 2, z, 'B'); f.set(1, 2, z, 'B'); }
    f.box(-1, 2, -4, 1, 3, -3, 'b');            // stern cabin
    f.set(0, 3, -2, 'y');                       // its lit window
    for (let y = 2; y <= 9; y++) f.set(0, y, 2, 'B');
    for (let y = 2; y <= 10; y++) f.set(0, y, -1, 'B');
    for (let x = -2; x <= 2; x++) for (let y = 4; y <= 7; y++) if (x) f.set(x, y, 2, y === 5 ? 'r' : 'w');
    for (let x = -2; x <= 2; x++) for (let y = 4; y <= 8; y++) if (x) f.set(x, y, -1, y === 6 ? 'r' : 'w');
    f.set(0, 11, -1, 'k'); f.set(0, 11, -2, 'k');
    for (const [y, z] of [[2, 4], [2, 5], [3, 5], [3, 6]]) f.set(0, y, z, 'B'); // bowsprit
  }),
};

// ---------- chapters ----------
export const CHAPTERS = [
  {
    id: 'meadow', name: 'Meadow Isles', blurb: 'Where the storm hit first',
    theme: 'meadow',
    intro: [
      "Oh! You're awake! I'm <b>Kubo</b>, the last Keeper of the Archipelago.",
      'You saw it too? The <b>Great Storm</b> smashed every figure on every island — even the mighty Colossus!',
      'But blocks remember their neighbours. Each matching <b>pair of numbers</b> belongs together.',
      "Link the numbers and the figures will stand again. Let's start with something tiny!",
    ],
    levels: [
      { id: 'sprout', tag: 'Something tiny', name: 'Sprout', intro: 'Just six blocks. A perfect warm-up!', outro: 'A little sprout! The meadow already looks happier.' },
      { id: 'tulip', tag: 'First bloom', name: 'Tulip', intro: 'Petals everywhere! The meadow wants its flower back.', outro: 'The Tulip blooms again. Can you smell it?' },
      { id: 'mushroom', tag: 'Forest snack', name: 'Mushroom', intro: 'The forest folk always kept a lucky charm by the pond…', outro: 'The lucky mushroom! Spotty and proud.' },
      { id: 'ladybug', tag: 'Lucky spots', name: 'Ladybug', intro: 'Count the spots — a ladybug brings good luck!', outro: 'The Ladybug is back. Our luck is turning!' },
      { id: 'apple', tag: 'Crunchy', name: 'Apple', intro: 'The orchard folk left a snack behind. Two layers and a stem!', outro: 'A shiny Apple! An apple a day keeps the storm away.' },
    ],
  },
  {
    id: 'farm', name: 'Windmill Farm', blurb: 'Fields, fences and a lot of mooing',
    theme: 'farm',
    intro: [
      'Welcome to <b>Windmill Farm</b>! The storm blew right through the fields.',
      'The farm figures are scattered everywhere. Try the <b>hay trampolines</b> — boing!',
    ],
    levels: [
      { id: 'snail', tag: 'Slow and steady', name: 'Snail', intro: 'No rush on this one. Snails never hurry.', outro: 'The Snail carries its home again. Slowly. Proudly.' },
      { id: 'duck', tag: 'Squeak squeak', name: 'Rubber Duck', intro: 'I hear faint squeaking. Something yellow is scattered here.', outro: 'Squeak! The Rubber Duck guards the pond again.' },
      { id: 'bunny', tag: 'Hop hop', name: 'Bunny', intro: 'Long ears, fluffy tail… someone is hiding in the grass.', outro: 'The Bunny! Its nose is twitching already.' },
      { id: 'sheep', tag: 'Woolly', name: 'Sheep', intro: 'A fluffy one. Its wool blew all over the meadow!', outro: 'Baa! The Sheep is ready for a nap.' },
      { id: 'windmill', tag: 'Turns with the wind', name: 'Windmill', intro: 'The biggest figure of the meadow. You can carry up to four blocks — use it!', outro: 'Feel that breeze? The Windmill is spinning again. Onwards — north!' },
    ],
  },
  {
    id: 'frost', name: 'Frost Isles', blurb: 'Brr — blocks blew all the way north',
    theme: 'frost',
    intro: [
      'Brrr! The storm blew blocks all the way to the <b>Frost Isles</b>.',
      'The snow hides them well. Use your <b>hint</b> if you get stuck — no shame in it!',
    ],
    levels: [
      { id: 'mitten', tag: 'Toasty', name: 'Mitten', intro: 'Someone lost a mitten in the snow. Just one, of course.', outro: 'A cosy Mitten! Somewhere, a cold hand says thank you.' },
      { id: 'sled', tag: 'Downhill fast', name: 'Sled', intro: "The fastest way down a frosty hill. There's even a present on it!", outro: 'The Sled is ready to race. Wheee!' },
      { id: 'seal', tag: 'Ball balancer', name: 'Seal', intro: 'This one does tricks. Find the ball, too!', outro: 'The Seal balances its ball again. Bravo!' },
      { id: 'igloo', tag: 'Snug inside', name: 'Igloo', intro: "A house made of snow. It's hollow — build the walls all the way around!", outro: 'The Igloo is cosy and warm. Well… warm for snow.' },
      { id: 'penguin', tag: 'Chilly friend', name: 'Penguin', intro: 'Someone small and dapper used to stand here.', outro: 'A Penguin! Dressed for dinner, as always.' },
    ],
  },
  {
    id: 'frostwood', name: 'Frostwood', blurb: 'Deep snow under tall pines',
    theme: 'frostwood',
    intro: [
      'Deeper in the north lies <b>Frostwood</b>, a quiet forest full of snow.',
      'Careful: the <b>snowdrifts</b> are deep and slow you down. The frozen stream is slippery, too!',
    ],
    levels: [
      { id: 'owl', tag: 'Night watcher', name: 'Snowy Owl', intro: 'Two big yellow eyes used to watch over the north.', outro: 'Hoo-hoo! The Snowy Owl keeps watch again.' },
      { id: 'fox', tag: 'Fluffy tail', name: 'Fox', intro: 'Quick and quiet. Its orange coat stands out in the snow!', outro: 'The Fox curls its tail around its paws. Adorable.' },
      { id: 'frostpine', tag: 'Evergreen', name: 'Frost Pine', intro: 'Every winter the islanders hang a star on this one.', outro: 'The Frost Pine sparkles. Look at that star!' },
      { id: 'snowman', tag: 'Carrot nose', name: 'Snowman', intro: 'This one has a carrot somewhere. And a fancy hat!', outro: 'The Snowman! Its scarf is a little crooked. Perfect.' },
      { id: 'polarbear', tag: 'Big and fluffy', name: 'Polar Bear', intro: "The Guardian of the North. It's a big one!", outro: 'The Polar Bear stands tall. The north is safe. Now south, to the reef!' },
    ],
  },
  {
    id: 'reef', name: 'Sunset Reef', blurb: 'Warm sand, long shadows',
    theme: 'reef',
    intro: [
      'Smell that salty air? This is the <b>Sunset Reef</b>.',
      "The reef folk miss their sea friends terribly. Let's bring them back!",
    ],
    levels: [
      { id: 'starfish', tag: 'Five arms', name: 'Starfish', intro: 'Something star-shaped washed up on the beach.', outro: 'A Starfish! The reef has its own little star.' },
      { id: 'anchor', tag: 'Heavy metal', name: 'Anchor', intro: 'No ship can stay put without one of these.', outro: 'The Anchor holds fast. No more drifting!' },
      { id: 'clownfish', tag: 'Stripes', name: 'Clownfish', intro: 'Orange and white stripes, hiding somewhere in the lagoon.', outro: 'The Clownfish wiggles happily. Found you!' },
      { id: 'palm', tag: 'Coconut shade', name: 'Palm Tree', intro: 'Every beach needs some shade.', outro: 'The Palm Tree! Mind the coconuts.' },
      { id: 'crab', tag: 'Sideways walker', name: 'Crab', intro: 'Watch your toes. This one pinches.', outro: 'A Crab! It waves both claws at you.' },
    ],
  },
  {
    id: 'cove', name: 'Shipwreck Cove', blurb: 'Where an old ship ran aground',
    theme: 'cove',
    intro: [
      'This is <b>Shipwreck Cove</b>. A ship ran aground here long, long ago.',
      'See those <b>giant clams</b>? Step on one and it tosses you up the rocks!',
    ],
    levels: [
      { id: 'turtle', tag: 'Ancient swimmer', name: 'Sea Turtle', intro: 'The oldest swimmer of the reef. Mind its shell!', outro: 'The Sea Turtle is whole. It has seen a hundred storms.' },
      { id: 'jellyfish', tag: 'Wobbly', name: 'Jellyfish', intro: 'A wobbly one. Its long tentacles drifted everywhere.', outro: "The Jellyfish glows in the sunset. Look, but don't touch!" },
      { id: 'chest', tag: 'X marks the spot', name: 'Treasure Chest', intro: 'Pirates buried this long ago. The storm dug it right up!', outro: 'The Treasure Chest is full again. Gold for everyone!' },
      { id: 'sailboat', tag: 'Catches the wind', name: 'Sailboat', intro: 'The reef folk sailed to the other islands on this.', outro: 'The Sailboat is ready to sail. All aboard!' },
      { id: 'whale', tag: 'Gentle giant', name: 'Whale', intro: 'The biggest friend of the reef. Its blocks are everywhere!', outro: 'The Whale sings again! I think I know where the storm came from…' },
    ],
  },
  {
    id: 'starfall', name: 'Starfall Peak', blurb: 'Where the storm was born',
    theme: 'starfall',
    intro: [
      'This is <b>Starfall Peak</b>. The storm started here.',
      'Legend says the oldest figure of all sleeps on top. When it broke, the skies went wild.',
      'Rebuild everything here, and maybe… the storms will finally stop.',
    ],
    levels: [
      { id: 'star', tag: 'Make a wish', name: 'Falling Star', intro: "A star fell right out of the sky. Let's put it back together.", outro: 'The Falling Star shines again. Make a wish!' },
      { id: 'crystal', tag: 'Shiny', name: 'Star Crystal', intro: 'These crystals grow where stars land. Mind the sharp tips!', outro: 'The Star Crystal sparkles. It hums very softly…' },
      { id: 'robot', tag: 'Beep boop', name: 'Robot', intro: 'The old star-watchers built a helper here.', outro: 'Beep boop! The Robot salutes you.' },
      { id: 'castle', tag: 'Tiny kingdom', name: 'Castle', intro: 'A hollow figure — the walls go all the way around!', outro: 'The Castle! Its towers glow in the twilight.' },
      { id: 'moon', tag: 'Sleepy', name: 'Crescent Moon', intro: "The moon dozed off and tumbled down. Let's help it back up!", outro: 'The Crescent Moon smiles in its sleep. Goodnight, moon!' },
    ],
  },
  {
    id: 'moon', name: 'Moon Isle', blurb: 'One small step, one giant jump',
    theme: 'moon',
    intro: [
      "Whoa — we're on the <b>Moon Isle</b>! Everything is so light up here.",
      'Your jumps go <b>super high</b> on the moon. And somewhere up here sleeps the oldest figure of all…',
    ],
    levels: [
      { id: 'astronaut', tag: 'Space walker', name: 'Astronaut', intro: 'The bravest star-watcher of all. Their helmet is around here somewhere.', outro: 'The Astronaut gives you a big thumbs up!' },
      { id: 'ufo', tag: 'Visitors', name: 'UFO', intro: "Something strange landed on the peak. Don't worry, they're friendly!", outro: 'The UFO hovers again. The little alien waves hello!' },
      { id: 'satellite', tag: 'Beep… beep…', name: 'Satellite', intro: "The star-watchers' satellite crashed down in the storm. Its panels are everywhere!", outro: 'The Satellite is back in orbit. Beep… beep… signal found!' },
      { id: 'rocket', tag: 'To the stars', name: 'Rocket', intro: 'The star-watchers dreamed of flying up there.', outro: 'The Rocket points at the stars. One figure left…' },
      { id: 'dragon', tag: 'Oldest of all', name: 'Star Dragon', intro: "This is it. The Star Dragon — keeper of the skies. It isn't angry… just broken.", outro: 'The Star Dragon is whole! But look — the last of the storm is spinning far out at sea…' },
    ],
  },
  {
    id: 'cliffs', name: 'Gale Cliffs', blurb: 'Hold on to your hat',
    theme: 'cliffs',
    intro: [
      "The <b>Gale Cliffs</b>! The storm's wind whistles over the chalk cliffs.",
      'Strong <b>gusts</b> will push you around. Lean into the wind and keep linking!',
    ],
    levels: [
      { id: 'kite', tag: 'Catch the wind', name: 'Kite', intro: 'In this wind? Perfect kite weather!', outro: 'The Kite dances on the gusts. Hold the string tight!' },
      { id: 'weathervane', tag: 'Which way?', name: 'Weathervane', intro: 'The rooster on top shows which way the storm blows.', outro: 'The Weathervane spins. The wind is calming down!' },
      { id: 'lantern', tag: 'Little light', name: 'Storm Lantern', intro: 'A little light to see by in all this rain.', outro: 'The Storm Lantern glows warm and bright.' },
      { id: 'umbrella', tag: 'Stay dry', name: 'Umbrella', intro: "Rain, rain, go away! Let's build some shelter.", outro: 'The Umbrella is open. Finally, a dry spot!' },
      { id: 'lighthouse', tag: 'Guiding light', name: 'Lighthouse', intro: 'A light in the storm. The sailors need it tonight.', outro: 'The Lighthouse shines through the rain! Now we can find our way deeper in.' },
    ],
  },
  {
    id: 'storm', name: 'Eye of the Storm', blurb: 'Where it all ends',
    theme: 'storm',
    intro: [
      'The skies are calm everywhere… except <b>here</b>. All the leftover storm gathered in one place.',
      'Deep inside sleeps the <b>Keeper Colossus</b> — the first Keeper ever built. My great-great-great-grandcube!',
      'It was holding the storm in its hands when it shattered. Rebuild it, and the storm is gone for good.',
    ],
    levels: [
      { id: 'thunderbird', tag: 'Lightning wings', name: 'Thunderbird', intro: 'The storm took the shape of a bird. It just wants to rest.', outro: 'The Thunderbird folds its wings. The thunder is getting quieter…' },
      { id: 'balloon', tag: 'Up, up and away', name: 'Hot Air Balloon', intro: 'The islanders used to float above the clouds in this one.', outro: 'The Balloon floats again! Hold on to your hat.' },
      { id: 'galleon', tag: 'All hands on deck', name: 'Galleon', intro: "The storm wrecked the islanders' biggest ship. Two masts, lots of sails!", outro: 'The Galleon is ready to sail. Anchors aweigh!' },
      { id: 'octopus', tag: 'Eight arms, one hug', name: 'Octopus', intro: 'Count the arms when you are done. All eight!', outro: 'The Octopus waves all eight arms! Look — I can see the Colossus from here…' },
      { id: 'colossus', tag: 'The final Keeper', name: 'Keeper Colossus', boss: true, intro: 'This is the biggest figure ever made. It will take many parts — and every block you can carry. Ready?', outro: 'The Colossus is whole again! Wait… did it just move?' },
    ],
  },
];

// Kubo's farewell after the finale cutscene
export const ENDING = [
  'Every island has its figures back. The Archipelago is <b>whole</b> again.',
  'Thank you, Linker. Visit any island whenever you like — and go for all the stars!',
];

export const LEVELS = [];
CHAPTERS.forEach((ch, ci) => ch.levels.forEach((l, li) => {
  l.chapter = ci;
  l.indexInChapter = li;
  l.chapterProgress = li / Math.max(1, ch.levels.length - 1); // 0 = first figure of the chapter, 1 = its finale
  l.index = LEVELS.length;
  LEVELS.push(l);
}));

const cache = new Map();
export function forgetLevel(id) { cache.delete(id); }
export const figureOf = id => FIGURES[id];
// Expand a level into a list of cells {ix,iy,iz,x,y,z,color} centred on x/z.
export function expandLevel(level) {
  if (cache.has(level.id)) return cache.get(level.id);
  const src = level.voxels ? () => level.voxels.map(v => ({ ...v })) : level.figure || FIGURES[level.id];
  const raw = largestComponent(src(), level.id);
  const xs = raw.map(c => c.x), ys = raw.map(c => c.y), zs = raw.map(c => c.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const cells = raw.map(c => {
    if (!(c.c in PALETTE)) throw new Error(`Unknown palette '${c.c}' in ${level.id}`);
    return { ix: c.x, iy: c.y - minY, iz: c.z, x: c.x - cx, y: c.y - minY, z: c.z - cz, color: PALETTE[c.c], pattern: PATTERN[c.c] || 0 };
  });
  const out = { cells, width: maxX - minX + 1, depth: maxZ - minZ + 1, height: maxY - minY + 1 };
  cache.set(level.id, out);
  return out;
}

function largestComponent(cells, id) {
  const key = c => `${c.x},${c.y},${c.z}`;
  const map = new Map(cells.map(c => [key(c), c]));
  const seen = new Set();
  let best = [];
  for (const c of cells) {
    if (seen.has(key(c))) continue;
    const comp = [], q = [c];
    seen.add(key(c));
    while (q.length) {
      const a = q.pop(); comp.push(a);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const kk = `${a.x + dx},${a.y + dy},${a.z + dz}`;
        if (map.has(kk) && !seen.has(kk)) { seen.add(kk); q.push(map.get(kk)); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  if (best.length !== cells.length) console.warn(`${id}: ${cells.length - best.length} disconnected cells dropped`);
  return best;
}

// Big figures are built in parts, each with its own district on the island.
export const partsFor = n => (n > 44 ? Math.ceil(n / 34) : 1);

// Target time for the clock star.
export const parTime = level => Math.round((30 + expandLevel(level).cells.length * 7) / 15) * 15;
