// The living sea: a toon sea whose colour runs from shallows by the shores to the deep, with foam lines
// rolling in, slow wave streaks, sun glints and a horizon that melts into the sky. How far each point of the sea is
// from the nearest shore is baked once into a small texture from the islands' own coastlines.
import * as THREE from 'three';
import { toon } from './render.js';
import { LK, NOISE_GLSL } from './looks.js';

const RANGE = 24; // metres of shore distance the bake keeps

export function makeSea(T, seaY) {
  const deep = new THREE.Color(T.water);
  // the shallows: lighter and greener; the deep: a little darker and bluer
  const shallow = deep.clone().lerp(new THREE.Color(0x7ff0e0), 0.45).offsetHSL(0, 0.05, 0.08);
  deep.offsetHSL(0.01, 0.02, -0.06);
  const foam = new THREE.Color(T.foam ?? 0xffffff);
  const u = {
    seaDeep: { value: deep }, seaShallow: { value: shallow }, seaFoam: { value: foam },
    tShore: { value: null }, shoreRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    seaSun: { value: new THREE.Vector3(...T.sunPos).normalize() }, seaClock: { value: LK.a }, seaOff: { value: LK.b },
  };
  const mat = toon(0xffffff);
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vSeaW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vSeaW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vSeaW;
uniform vec3 seaDeep; uniform vec3 seaShallow; uniform vec3 seaFoam; uniform sampler2D tShore; uniform vec4 shoreRect;
uniform vec3 seaSun; uniform vec4 seaClock; uniform vec4 seaOff;
${NOISE_GLSL.replace(/lk(Hash|Noise|CloudShade)/g, 'sea$1')}
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 sp = vSeaW.xz + seaOff.zw;
  float t = seaClock.x;
  float d = texture2D(tShore, (sp - shoreRect.xy) * shoreRect.zw).r * ${RANGE.toFixed(1)};
  // a ragged edge to the shallows
  d += (seaNoise(sp * 0.25) - 0.5) * 2.2;
  float shal = 1.0 - smoothstep(0.5, 11.0, d);
  vec3 c = mix(seaDeep, seaShallow, shal * shal);
  // slow wave streaks in two directions
  float w1 = seaNoise(vec2(sp.x * 0.11 + t * 0.09, sp.y * 0.32 - t * 0.05));
  float w2 = seaNoise(vec2(sp.x * 0.29 - t * 0.04, sp.y * 0.1 + t * 0.07) + 7.3);
  float crest = smoothstep(0.7, 0.74, w1 * 0.55 + w2 * 0.45);
  c = mix(c, c * 1.14 + 0.035, crest * 0.75);
  // foam lines rolling in to the shores, broken up
  float ph = fract(d * 0.28 + t * 0.22);
  float line = smoothstep(0.82, 0.88, ph) * (1.0 - smoothstep(0.93, 0.99, ph));
  line *= (1.0 - smoothstep(1.5, 8.5, d)) * smoothstep(0.35, 0.6, seaNoise(sp * 0.7 + t * 0.15));
  // a lapping fringe right at the shore
  float fringe = 1.0 - smoothstep(0.6, 1.4, d + sin(t * 1.7 + sp.x * 0.6 + sp.y * 0.4) * 0.35);
  c = mix(c, seaFoam, clamp(max(line * 0.85, fringe * 0.9), 0.0, 1.0));
  diffuseColor.rgb = c;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    // sun glints: tiny sparks where the waves turn the sun towards you
    vec2 gp = sp * 1.6 + vec2(t * 0.35, -t * 0.2);
    vec3 n = normalize(vec3(seaNoise(gp) - 0.5, 1.6, seaNoise(gp + 13.1) - 0.5));
    vec3 v = normalize(cameraPosition - vSeaW);
    float g = pow(max(dot(reflect(-seaSun, n), v), 0.0), 220.0);
    totalEmissiveRadiance += vec3(1.0, 0.97, 0.88) * step(0.35, g) * 1.4;
  }`)
      .replace('#include <premultiplied_alpha_fragment>', `#ifdef USE_FOG
  // the horizon: the sea melts into the sky far out
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(70.0, 280.0, vFogDepth));
  #endif
  #include <premultiplied_alpha_fragment>`);
  };
  mat.customProgramCacheKey = () => 'vx-sea';
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(900, 64), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = seaY;
  mesh.receiveShadow = true;
  // bake the distance to the nearest shore: coast(x, z) is a signed distance (negative on land) in the sea's
  // coordinates (archipelago space); rect [x0, z0, x1, z1] is the area that matters
  mesh.userData.bake = (coast, [x0, z0, x1, z1]) => {
    const t0 = performance.now();
    const step = Math.max(0.45, Math.max(x1 - x0, z1 - z0) / 320);
    const w = Math.ceil((x1 - x0) / step), h = Math.ceil((z1 - z0) / step);
    const data = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const d = coast(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);
      const v = Math.round(Math.max(0, Math.min(1, d / RANGE)) * 255), o = (j * w + i) * 4;
      data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
    }
    u.tShore.value?.dispose();
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    u.tShore.value = tex;
    u.shoreRect.value.set(x0, z0, 1 / (w * step), 1 / (h * step));
    mesh.userData.bakeMs = performance.now() - t0;
  };
  mesh.material.addEventListener('dispose', () => u.tShore.value?.dispose());
  return mesh;
}

// how far (x, z) is from the shores of a set of pieces: [{ sd(x, z) in its own coordinates, toLocal, x, z, R }]
export function coastOf(pieces) {
  return (x, z) => {
    let d = RANGE;
    for (const k of pieces) {
      const far = Math.hypot(x - k.x, z - k.z) - k.R;
      if (far > d) continue;
      d = Math.min(d, k.sd(...k.toLocal(x, z)));
    }
    return d;
  };
}
