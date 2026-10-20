import * as THREE from 'three';

// Layer 0: geometry that receives ink outlines. Layer 1: un-outlined scenery (sky, grass).
// Layer 2: overlays drawn after the outline pass (badges, particles, previews).
export const LAYER_FX = 1;
export const LAYER_OVERLAY = 2;

let gradientTex = null;
export function toonGradient() {
  if (gradientTex) return gradientTex;
  const data = new Uint8Array([105, 105, 105, 255, 178, 178, 178, 255, 255, 255, 255, 255]);
  gradientTex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientTex.minFilter = gradientTex.magFilter = THREE.NearestFilter;
  gradientTex.generateMipmaps = false;
  gradientTex.needsUpdate = true;
  return gradientTex;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

const compositeVert = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const compositeFrag = /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float thickness;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 ink;
uniform float outline;
uniform float vignette;
uniform float transparentSky;
varying vec2 vUv;

float linDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return (cameraNear * cameraFar) / ((cameraFar - cameraNear) * d - cameraFar) * -1.0;
}

void main() {
  vec4 col = texture2D(tColor, vUv);
  vec2 px = thickness / resolution;
  float dc = linDepth(vUv);
  vec3 nc = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  bool sky = dc > cameraFar * 0.98;
  float facing = clamp(abs(nc.z), 0.22, 1.0);
  float edge = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(px.x, 0.0) : i == 1 ? vec2(-px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
    vec2 uv = vUv + o;
    float dn = linDepth(uv);
    float rel = (dn - dc) / dc;
    edge = max(edge, smoothstep(0.035 / facing, 0.07 / facing, rel));
    if (!sky) {
      vec3 nn = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
      float nd = 1.0 - dot(nc, nn);
      edge = max(edge, smoothstep(0.28, 0.5, nd));
    }
  }
  float fade = 1.0 - smoothstep(38.0, 85.0, dc);
  vec3 c = mix(col.rgb, ink, edge * outline * fade);
  vec2 q = vUv - 0.5;
  c *= 1.0 - vignette * dot(q, q) * 1.1;
  gl_FragColor = vec4(c, (sky && transparentSky > 0.5) ? edge * outline : 1.0);
  #include <colorspace_fragment>
  gl_FragDepth = texture2D(tDepth, vUv).x;
}`;

export class Renderer {
  constructor(canvas, { mobile }) {
    this.mobile = mobile;
    const r = (this.gl = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance',
    }));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.setClearColor(0x000000, 1);
    this.maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 2 : 2);
    this.scale = 1;
    this.outlines = true;
    this.colorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.normalRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType, depthTexture, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.normalMat = new THREE.MeshNormalMaterial();
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.composite = new THREE.ShaderMaterial({
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
      uniforms: {
        tColor: { value: this.colorRT.texture },
        tNormal: { value: this.normalRT.texture },
        tDepth: { value: depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        thickness: { value: 1 },
        cameraNear: { value: 0.05 },
        cameraFar: { value: 300 },
        ink: { value: new THREE.Color(0x2a1f3d) },
        outline: { value: 1 },
        vignette: { value: 0.35 },
        transparentSky: { value: 0 },
      },
    });
    const quad = new THREE.Mesh(tri, this.composite);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.w = 1; this.h = 1;
    this.frameTimes = [];
    this.adaptTimer = 0;
  }

  get pixelRatio() { return this.maxDpr * this.scale; }

  setSize(w, h) {
    this.w = w; this.h = h;
    const pr = this.pixelRatio;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    const pw = Math.max(1, Math.floor(w * pr)), ph = Math.max(1, Math.floor(h * pr));
    this.colorRT.setSize(pw, ph);
    this.normalRT.setSize(pw, ph);
    this.composite.uniforms.resolution.value.set(pw, ph);
    this.composite.uniforms.thickness.value = Math.max(1.5, pr * 0.9);
  }

  // Adaptive resolution: drop render scale when frames are slow, recover when fast.
  adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    this.frameTimes.length = 0;
    let s = this.scale;
    if (med > 1 / 45) s = Math.max(0.55, s * 0.85);
    else if (med < 1 / 58 && s < 1) s = Math.min(1, s * 1.08);
    if (Math.abs(s - this.scale) > 0.01) { this.scale = s; this.setSize(this.w, this.h); }
  }

  render(scene, camera, target = null, size = null) {
    const r = this.gl;
    const u = this.composite.uniforms;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    u.outline.value = this.outlines ? 1 : 0;
    u.transparentSky.value = target ? 1 : 0;
    if (size) {
      this.colorRT.setSize(size, size); this.normalRT.setSize(size, size);
      u.resolution.value.set(size, size); u.thickness.value = 2;
    }
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.colorRT);

    const mask = camera.layers.mask;
    const bg = scene.background, fog = scene.fog;
    camera.layers.set(0);
    camera.layers.enable(LAYER_FX);
    r.render(scene, camera);
    camera.layers.set(0);
    scene.overrideMaterial = this.normalMat;
    scene.background = null; scene.fog = null;
    r.setRenderTarget(this.normalRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg; scene.fog = fog;

    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.render(this.quadScene, this.quadCam);
    if (!target) {
      // overlays are depth-tested against the scene depth written by the composite pass
      camera.layers.set(LAYER_OVERLAY);
      r.autoClear = false;
      r.render(scene, camera);
      r.autoClear = true;
    }
    camera.layers.mask = mask;
    if (size) this.setSize(this.w, this.h);
  }
}
