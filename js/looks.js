// The game's finishing looks, on top of the toon shading and ink outlines (see docs/design-notes.md, 2026-11-11):
//   blocks darken where they meet (corner shading baked into the voxel geometry, voxels.js)
//   contact shadows: a little screen-space ambient occlusion in the outline pass (render.js)
//   a living sea: shallows by the shores, foam lines, waves, sun glints, a horizon that melts into the sky (sea.js)
//   a colour grade per world (lift / gain / saturation / contrast) in the outline pass
//   ground with variation: patches of lighter and darker ground, a worn ring round the pedestal
//   aerial haze: far things fade into the sky, a low mist between the islands
//   outlines drawn in a deep shade of what they outline, and FXAA (smooth edges, phones included; render.js)
//   islands that bloom: finished ones run richer, unfinished ones are muted, and finishing one washes colour out
//   from the figure across its island (archipelago.js)
//   a soft glow on things that give light (crystals, portals, lanterns, fireflies), desktop only (render.js)
import * as THREE from 'three';

// layer for things that glow (drawn again, alone, into the glow pass)
export const LAYER_GLOW = 3;
export function glows(obj) { obj.traverse(o => o.layers.enable(LAYER_GLOW)); return obj; }

// Shared uniforms. Their values are plain objects, not THREE vectors: three.js copies a material's uniforms when it
// compiles it, but keeps plain objects by reference, so every toon material sees these live.
export const LK = {
  // x: the looks' clock (the sea's waves and foam)
  a: { x: 0, y: 0, z: 0, w: 0 },
  // z, w: the archipelago's offset (world → archipelago coordinates, so patterns don't jump between islands)
  b: { x: 0, y: 0, z: 0, w: 0 },
  // haze amount, haze rate (1/m), mist amount, mist top (y)
  haze: { x: 0, y: 0.01, z: 0, w: -1.7 },
};

// per world: haze [amount, rate, mist], grade (see setLookTheme), glow strength (night worlds glow more)
const PER = {
  meadow: { haze: [0.35, 0.012, 0.15], grade: { lift: [0.01, 0.0, 0.03], gain: [1.03, 1.0, 0.95], sat: 1.06, con: 1.042 } },
  farm: { haze: [0.35, 0.012, 0.15], grade: { lift: [0.02, 0.0, 0.02], gain: [1.05, 1.0, 0.92], sat: 1.05, con: 1.035 } },
  frost: { haze: [0.39, 0.012, 0.21], grade: { lift: [0.0, 0.01, 0.04], gain: [0.97, 1.0, 1.04], sat: 1.025, con: 1.056 }, glow: 0.4 },
  frostwood: { haze: [0.39, 0.013, 0.21], grade: { lift: [0.0, 0.015, 0.04], gain: [0.98, 1.0, 1.03], sat: 1.03, con: 1.056 }, glow: 0.4 },
  reef: { haze: [0.32, 0.011, 0.12], grade: { lift: [0.02, 0.0, 0.03], gain: [1.05, 1.0, 0.95], sat: 1.07, con: 1.035 } },
  cove: { haze: [0.35, 0.012, 0.18], grade: { lift: [0.0, 0.01, 0.03], gain: [1.03, 1.0, 0.96], sat: 1.05, con: 1.042 } },
  starfall: { haze: [0.35, 0.01, 0.24], grade: { lift: [0.03, 0.0, 0.06], gain: [1.0, 0.98, 1.05], sat: 1.06, con: 1.07 }, glow: 0.55 },
  moon: { haze: [0.24, 0.008, 0.0], grade: { lift: [0.0, 0.0, 0.04], gain: [1.0, 1.0, 1.04], sat: 1.025, con: 1.098 }, glow: 0.47 },
  cliffs: { haze: [0.35, 0.012, 0.18], grade: { lift: [0.0, 0.0, 0.025], gain: [1.03, 1.01, 0.97], sat: 1.05, con: 1.042 } },
  storm: { haze: [0.42, 0.016, 0.27], grade: { lift: [0.0, 0.01, 0.05], gain: [1.08, 1.0, 0.9], sat: 1.09, con: 1.112 }, glow: 0.47 },
  nexus: { haze: [0.32, 0.009, 0.0], grade: { lift: [0.03, 0.01, 0.04], gain: [1.05, 1.0, 0.94], sat: 1.05, con: 1.035 } },
};

// grade uniforms for the outline pass (render.js reads these)
export const GRADE = { lift: new THREE.Vector3(), gain: new THREE.Vector3(1, 1, 1), sc: new THREE.Vector2(1, 1), glow: 0.25 };

// the world's look: called whenever the game switches world
export function setLookTheme(themeId) {
  const P = PER[themeId] || PER.meadow;
  [LK.haze.x, LK.haze.y, LK.haze.z] = P.haze;
  const g = P.grade;
  GRADE.lift.set(...g.lift); GRADE.gain.set(...g.gain); GRADE.sc.set(g.sat, g.con);
  GRADE.glow = P.glow ?? 0.32;
}

// GLSL shared by the toon patch and the sea
export const NOISE_GLSL = /* glsl */`
float lkHash(vec2 p) { p = mod(p, 289.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lkNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lkHash(i), lkHash(i + vec2(1.0, 0.0)), f.x), mix(lkHash(i + vec2(0.0, 1.0)), lkHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

let installed = false;
// patch the toon shader (every world surface, block and prop uses it): ground variation, the islands' colour wash, haze
export function installLooks() {
  if (installed) return;
  installed = true;
  const L = THREE.ShaderLib.toon;
  Object.assign(L.uniforms, {
    lkB: { value: LK.b }, lkHaze: { value: LK.haze },
    // per material (see thrive()): from, to, radius of the wash, shine
    lkThrive: { value: { x: 0, y: 0, z: -1, w: 0 } },
  });
  const decl = 'varying vec3 vLkW;\nvarying vec3 vLkL;\nvarying vec3 vLkN;\n';
  L.vertexShader = L.vertexShader.replace('#define TOON\n', `#define TOON\n${decl}`).replace('#include <fog_vertex>', `#include <fog_vertex>
  {
    vec4 lkP = vec4(transformed, 1.0);
    vec3 lkN = objectNormal;
    #ifdef USE_INSTANCING
      lkP = instanceMatrix * lkP; lkN = mat3(instanceMatrix) * lkN;
    #endif
    #ifdef USE_BATCHING
      lkP = batchingMatrix * lkP;
    #endif
    vLkL = lkP.xyz;
    vLkW = (modelMatrix * lkP).xyz;
    vLkN = normalize(mat3(modelMatrix) * lkN);
  }`);
  L.fragmentShader = L.fragmentShader
    .replace('#define TOON\n', `#define TOON\n${decl}uniform vec4 lkB; uniform vec4 lkHaze; uniform vec4 lkThrive;\n${NOISE_GLSL}\n`)
    // patches of lighter and darker ground (two scales), a worn ring round the pedestal; tops only
    .replace('#include <color_fragment>', `#include <color_fragment>
  #ifdef LK_GROUND
  if (vLkN.y > 0.7) {
    vec2 gp = vLkW.xz + lkB.zw;
    float big = lkNoise(gp * 0.09) - 0.5, small = lkNoise(gp * 0.45 + 3.1) - 0.5;
    float tone = big * 0.22 + small * 0.1;
    vec3 c = diffuseColor.rgb;
    float lum = dot(c, vec3(0.3, 0.55, 0.15));
    // lighter patches run a little warmer, darker ones a little richer
    c *= 1.0 + tone;
    c = mix(c, c * vec3(1.05, 1.02, 0.86), clamp(tone * 3.0, 0.0, 1.0) * 0.5);
    #ifdef LK_WEAR
    float r = length(vLkL.xz);
    float wear = smoothstep(2.9, 3.4, r) * (1.0 - smoothstep(3.6, 5.0, r));
    wear *= 0.55 + 0.45 * lkNoise(vLkL.xz * 1.7);
    c = mix(c, mix(vec3(lum), c, 0.55) * vec3(1.08, 1.0, 0.85), wear * 0.55);
    #endif
    diffuseColor.rgb = c;
  }
  #endif`)
    .replace('#include <opaque_fragment>', `{
    float r = length(vLkL.xz);
    float k = lkThrive.z < 0.0 ? 1.0 : 1.0 - smoothstep(lkThrive.z - 3.5, lkThrive.z, r);
    float v = mix(lkThrive.x, lkThrive.y, k);
    float lum = dot(outgoingLight, vec3(0.3, 0.55, 0.15));
    // muted: greyer and a touch dimmer; vivid: richer and a touch warmer
    outgoingLight = max(mix(vec3(lum), outgoingLight, 1.0 + v * (v < 0.0 ? 0.5 : 0.2)), 0.0);
    outgoingLight *= 1.0 + v * (v < 0.0 ? 0.12 : 0.05);
    outgoingLight *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), max(v, 0.0));
    // the wash's leading edge shines
    if (lkThrive.z >= 0.0) outgoingLight += vec3(1.0, 0.92, 0.6) * (smoothstep(lkThrive.z - 3.5, lkThrive.z - 1.5, r) - smoothstep(lkThrive.z - 1.0, lkThrive.z, r)) * 0.35 * lkThrive.w;
  }
  #include <opaque_fragment>`)
    .replace('#include <fog_fragment>', `#ifdef USE_FOG
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    // far things fade into the sky; a mist hangs low over the sea between the islands
    float lkH = lkHaze.x * (1.0 - exp(-max(vFogDepth - 25.0, 0.0) * lkHaze.y));
    float lkM = lkHaze.z * exp(-max(vLkW.y - lkHaze.w, 0.0) * 0.9) * smoothstep(20.0, 70.0, vFogDepth);
    fogFactor = clamp(1.0 - (1.0 - fogFactor) * (1.0 - lkH) * (1.0 - lkM), 0.0, 1.0);
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif`);
}

// thrive: give a world's toon materials their own wash uniform (from, to, radius, shine)
export function thrive(group, state) {
  group.traverse(o => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m.isMeshToonMaterial || m.userData.lkThrive) continue;
      m.userData.lkThrive = state;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); if (sh.uniforms.lkThrive) sh.uniforms.lkThrive = { value: state }; };
    }
  });
}

// ground surfaces get the variation (a define, so only their program carries it); wear: round a pedestal
export function groundMaterial(m, wear = false) {
  m.defines = { ...(m.defines || {}), LK_GROUND: '', ...(wear ? { LK_WEAR: '' } : {}) };
  return m;
}
