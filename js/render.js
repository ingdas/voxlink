import * as THREE from 'three';
import { LAYER_GLOW, GRADE, installLooks } from './looks.js';

installLooks();

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
uniform float encodeOut;
uniform mat4 projInv;
uniform float projY;
uniform vec3 gLift;
uniform vec3 gGain;
uniform vec2 gSC;
uniform sampler2D tGlow;
uniform float glowAmt;
varying vec2 vUv;

vec3 viewPos(vec2 uv) {
  vec4 p = projInv * vec4(vec3(uv, texture2D(tDepth, uv).x) * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}

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
  vec3 base = col.rgb;
  // contact shadows: scalable ambient obscurance from the depth and normal buffers, a few samples on a spiral
  if (!sky && dc < 60.0) {
    vec3 P = viewPos(vUv);
    vec3 N = normalize(nc);
    float rad = 0.6;
    vec2 uvR = vec2(resolution.y / resolution.x, 1.0) * (rad * projY * 0.5 / -P.z);
    float spin = 0.0;
    float sum = 0.0;
    for (int i = 0; i < LK_AO_N; i++) {
      float fi = float(i) + 0.5;
      float a = fi * 2.39996 + spin;
      vec3 v = viewPos(vUv + vec2(cos(a), sin(a)) * uvR * (fi / float(LK_AO_N))) - P;
      float vv = dot(v, v);
      float f = max(rad * rad - vv, 0.0);
      sum += f * f * f * max((dot(v, N) - 0.012 * -P.z) / (0.01 + vv), 0.0);
    }
    float ao = max(0.0, 1.0 - sum * 6.0 / (pow(rad, 6.0) * float(LK_AO_N)));
    base *= mix(1.0, ao, 0.75 * (1.0 - smoothstep(35.0, 60.0, dc)));
  }
  // the line takes a deep shade of what it outlines (the ink colour still leads)
  vec3 inkC = mix(ink, base * vec3(0.3, 0.26, 0.36), 0.45);
  vec3 c = mix(base, inkC, edge * outline * fade);
  #ifdef LK_GLOW
  c += texture2D(tGlow, vUv).rgb * glowAmt;
  #endif
  // the world's colour grade
  {
    vec3 g = pow(max(c, 0.0), vec3(1.0 / 2.2));
    g = g * gGain + gLift * (1.0 - g);
    g = mix(vec3(dot(g, vec3(0.299, 0.587, 0.114))), g, gSC.x);
    g = (g - 0.5) * gSC.y + 0.5;
    c = pow(max(g, 0.0), vec3(2.2));
  }
  vec2 q = vUv - 0.5;
  c *= 1.0 - vignette * dot(q, q) * 1.1;
  gl_FragColor = vec4(c, (sky && transparentSky > 0.5) ? edge * outline : 1.0);
  #include <colorspace_fragment>
  if (encodeOut > 0.5) gl_FragColor.rgb = sRGBTransferOETF(gl_FragColor).rgb;
  gl_FragDepth = texture2D(tDepth, vUv).x;
}`;

// FXAA (after Lottes, the compact form): smooths the edges of the composited frame, outlines included. It reads the
// frame sRGB-encoded and writes it as is; it passes the scene depth on for the overlays.
const fxaaFrag = /* glsl */`
uniform sampler2D tFrame;
uniform sampler2D tDepth;
uniform vec2 resolution;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 px = 1.0 / resolution;
  vec3 rgbM = texture2D(tFrame, vUv).rgb;
  float lNW = luma(texture2D(tFrame, vUv + vec2(-1.0, -1.0) * px).rgb), lNE = luma(texture2D(tFrame, vUv + vec2(1.0, -1.0) * px).rgb);
  float lSW = luma(texture2D(tFrame, vUv + vec2(-1.0, 1.0) * px).rgb), lSE = luma(texture2D(tFrame, vUv + vec2(1.0, 1.0) * px).rgb);
  float lM = luma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * px;
  vec3 a = 0.5 * (texture2D(tFrame, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tFrame, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tFrame, vUv - dir * 0.5).rgb + texture2D(tFrame, vUv + dir * 0.5).rgb);
  float lB = luma(b);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
  gl_FragDepth = texture2D(tDepth, vUv).x;
}`;

// separable blur for the glow (9 taps, a wider step on the second round)
const blurFrag = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
  c += (texture2D(tSrc, vUv + dir * 1.385).rgb + texture2D(tSrc, vUv - dir * 1.385).rgb) * 0.316;
  c += (texture2D(tSrc, vUv + dir * 3.231).rgb + texture2D(tSrc, vUv - dir * 3.231).rgb) * 0.07;
  gl_FragColor = vec4(c, 1.0);
}`;

export class Renderer {
  // safe: no post-processing, no shadows, 1x resolution (used after a GPU crash or when chosen in Settings)
  constructor(canvas, { mobile, safe = false }) {
    this.safe = safe;
    this.mobile = mobile;
    const r = (this.gl = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false, powerPreference: mobile ? 'default' : 'high-performance',
    }));
    r.shadowMap.enabled = !safe;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.setClearColor(0x000000, 1);
    // phones: lower resolution, plain 8-bit buffers and no MSAA (many mobile GPUs can't render to
    // multisampled half-float targets, which leaves the 3D view black)
    this.maxDpr = this.dprCap();
    this.scale = 1;
    this.outlines = true;
    const ext = r.extensions;
    const canHalf = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.tier = {
      type: !mobile && canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: mobile ? 0 : Math.min(4, r.capabilities.maxSamples || 0),
    };
    // last-resort mode: no post-processing (no ink outlines). WebGL1 devices always use it.
    this.direct = safe || !!window.__gfx?.legacy || r.capabilities.isWebGL2 === false;
    if (this.direct) { this.tier = { type: THREE.UnsignedByteType, samples: 0 }; this.verifyFrames = 0; }
    if (!this.direct) this.verifyFrames = 2;
    // the glow pass (js/looks.js) is for desktops
    this.glowOn = !mobile;
    this.normalMat = new THREE.MeshNormalMaterial();
    this.makeTargets();
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const defines = { LK_AO_N: mobile ? 6 : 12 };
    if (this.glowOn) defines.LK_GLOW = '';
    this.composite = new THREE.ShaderMaterial({
      defines,
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
      uniforms: {
        tColor: { value: this.colorRT.texture },
        tNormal: { value: this.normalRT.texture },
        tDepth: { value: this.normalRT.depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) },
        thickness: { value: 1 },
        cameraNear: { value: 0.05 },
        cameraFar: { value: 300 },
        ink: { value: new THREE.Color(0x2a1f3d) },
        outline: { value: 1 },
        vignette: { value: 0.35 },
        transparentSky: { value: 0 },
        encodeOut: { value: 0 },
        projInv: { value: new THREE.Matrix4() },
        projY: { value: 1 },
        gLift: { value: GRADE.lift },
        gGain: { value: GRADE.gain },
        gSC: { value: GRADE.sc },
        tGlow: { value: null },
        glowAmt: { value: 1 },
      },
    });
    const quad = new THREE.Mesh(tri, this.composite);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.quad = quad;
    this.fxaa = new THREE.ShaderMaterial({
      vertexShader: compositeVert, fragmentShader: fxaaFrag,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
      uniforms: { tFrame: { value: null }, tDepth: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } },
    });
    this.blur = new THREE.ShaderMaterial({
      vertexShader: compositeVert, fragmentShader: blurFrag, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
    });
    this.black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.composite.uniforms.tGlow.value = this.glowRT?.texture ?? null;
    this.fxaa.uniforms.tFrame.value = this.aaRT.texture;
    this.fxaa.uniforms.tDepth.value = this.normalRT.depthTexture;
    this.w = 1; this.h = 1;
    this.frameTimes = [];
    this.adaptTimer = 0;
  }

  makeTargets() {
    this.colorRT?.dispose();
    this.normalRT?.dispose();
    this.aaRT?.dispose(); this.aaRT = null;
    this.glowRT?.dispose(); this.glowRT2?.dispose(); this.glowRT = this.glowRT2 = null;
    this.colorRT = new THREE.WebGLRenderTarget(1, 1, { type: this.tier.type, samples: this.tier.samples });
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.normalRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType, depthTexture, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    // FXAA reads the composited frame from here
    this.aaRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
    if (this.glowOn) {
      const o = { type: this.tier.type, depthBuffer: true };
      this.glowRT = new THREE.WebGLRenderTarget(1, 1, o);
      this.glowRT2 = new THREE.WebGLRenderTarget(1, 1, { type: this.tier.type, depthBuffer: false });
    }
    if (this.composite) {
      const u = this.composite.uniforms;
      u.tColor.value = this.colorRT.texture; u.tNormal.value = this.normalRT.texture; u.tDepth.value = depthTexture;
      u.tGlow.value = this.glowRT?.texture ?? null;
      this.fxaa.uniforms.tFrame.value = this.aaRT.texture; this.fxaa.uniforms.tDepth.value = depthTexture;
      this.setSize(this.w, this.h);
    }
  }

  // Step down to something this GPU can do: no MSAA -> 8-bit color -> no post-processing.
  downgrade(reason) {
    if (this.tier.samples) this.tier.samples = 0;
    else if (this.tier.type !== THREE.UnsignedByteType) this.tier.type = THREE.UnsignedByteType;
    else if (!this.direct) this.direct = true;
    else return false;
    console.warn(`[kubo] graphics fallback (${reason}):`, this.direct ? 'direct rendering' : this.tier);
    if (!this.direct) this.makeTargets();
    else { this.colorRT.dispose(); this.normalRT.dispose(); this.aaRT?.dispose(); this.glowRT?.dispose(); this.glowRT2?.dispose(); } // unused from now on: free their GPU memory
    this.verifyFrames = 2;
    setTimeout(() => this.onDowngrade?.(), 0);
    return true;
  }

  targetsComplete() {
    const gl = this.gl.getContext();
    for (const rt of [this.colorRT, this.normalRT]) {
      const p = this.gl.properties.get(rt);
      for (const fb of [p.__webglFramebuffer, p.__webglMultisampledFramebuffer]) {
        if (!fb) continue;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!ok) return false;
      }
    }
    return true;
  }

  // Right after drawing a frame: did anything reach the screen? (an all-black frame means a broken pipeline)
  frameLooksBroken() {
    const gl = this.gl.getContext();
    const px = new Uint8Array(4);
    let lit = 0;
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.85], [0.2, 0.3], [0.8, 0.7], [0.5, 0.15]]) {
      gl.readPixels(Math.floor(gl.drawingBufferWidth * fx), Math.floor(gl.drawingBufferHeight * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (px[0] + px[1] + px[2] > 6) lit++;
    }
    return lit === 0;
  }

  // after a context loss on screen: 1x resolution and no shadows from now on (everything recompiles anyway)
  lighten() {
    this.safe = true;
    this.gl.shadowMap.enabled = false;
    this.setSize(this.w, this.h);
  }

  // the context came back: three.js re-creates its GPU objects; check the pipeline again
  restored() {
    if (!this.direct) this.verifyFrames = 2;
  }

  dprCap() { return Math.min(window.devicePixelRatio || 1, this.safe ? 1 : this.mobile ? 1.5 : 2); }

  get pixelRatio() { return this.maxDpr * this.scale; }

  setSize(w, h) {
    this.w = w; this.h = h;
    // browser zoom changes the device pixel ratio (and fires the resize that lands here)
    this.maxDpr = this.dprCap();
    const pr = this.pixelRatio;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    const pw = Math.max(1, Math.floor(w * pr)), ph = Math.max(1, Math.floor(h * pr));
    this.colorRT.setSize(pw, ph);
    this.normalRT.setSize(pw, ph);
    this.composite.uniforms.resolution.value.set(pw, ph);
    this.composite.uniforms.thickness.value = Math.max(1.5, pr * 0.9);
    this.aaRT.setSize(pw, ph);
    this.fxaa.uniforms.resolution.value.set(pw, ph);
    const gw = Math.max(1, pw >> 2), gh = Math.max(1, ph >> 2);
    this.glowRT?.setSize(gw, gh); this.glowRT2?.setSize(gw, gh);
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

  // glow: what gives light, alone over a black silhouette of the scene (so walls still hide it), at quarter size, blurred
  renderGlow(scene, camera) {
    const r = this.gl, bg = scene.background;
    r.setRenderTarget(this.glowRT);
    r.setClearColor(0x000000, 1);
    r.clear();
    camera.layers.set(0);
    scene.overrideMaterial = this.black; scene.background = null;
    r.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.set(LAYER_GLOW);
    r.autoClear = false;
    r.render(scene, camera);
    r.autoClear = true;
    scene.background = bg;
    const w = this.glowRT.width, h = this.glowRT.height, b = this.blur.uniforms;
    this.quad.material = this.blur;
    for (const [src, dst, dx, dy] of [[this.glowRT, this.glowRT2, 1, 0], [this.glowRT2, this.glowRT, 0, 1], [this.glowRT, this.glowRT2, 2.5, 0], [this.glowRT2, this.glowRT, 0, 2.5], [this.glowRT, this.glowRT2, 5, 0], [this.glowRT2, this.glowRT, 0, 5]]) {
      b.tSrc.value = src.texture; b.dir.value.set(dx / w, dy / h);
      r.setRenderTarget(dst);
      r.render(this.quadScene, this.quadCam);
    }
    this.quad.material = this.composite;
  }

  render(scene, camera, target = null, size = null) {
    const r = this.gl;
    // three.js skips drawing while the context is lost; don't mistake that for a broken pipeline
    if (r.getContext().isContextLost()) return;
    if (this.direct) {
      // fallback without post-processing: everything straight to the screen
      const mask = camera.layers.mask;
      camera.layers.enableAll();
      r.shadowMap.needsUpdate = true;
      r.setClearColor(0x000000, 0); // thumbnails need a transparent background (the screen canvas has no alpha)
      r.setRenderTarget(target);
      r.render(scene, camera);
      camera.layers.mask = mask;
      return;
    }
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

    u.projInv.value.copy(camera.projectionMatrixInverse);
    u.projY.value = camera.projectionMatrix.elements[5];
    u.glowAmt.value = 0;
    if (this.glowRT && !target) { this.renderGlow(scene, camera); u.glowAmt.value = GRADE.glow; }
    const aa = !target;
    u.encodeOut.value = aa ? 1 : 0;
    r.setRenderTarget(aa ? this.aaRT : target);
    r.setClearColor(0x000000, 0);
    r.render(this.quadScene, this.quadCam);
    if (aa) {
      r.setRenderTarget(null);
      this.quad.material = this.fxaa;
      r.render(this.quadScene, this.quadCam);
      this.quad.material = this.composite;
    }
    if (!target) {
      // overlays are depth-tested against the scene depth written by the composite pass
      camera.layers.set(LAYER_OVERLAY);
      r.autoClear = false;
      r.render(scene, camera);
      r.autoClear = true;
    }
    camera.layers.mask = mask;
    if (size) this.setSize(this.w, this.h);
    if (!target && this.verifyFrames > 0) {
      this.verifyFrames--;
      if (!this.targetsComplete()) this.downgrade('incomplete framebuffer');
      else if (this.verifyFrames === 0 && this.frameLooksBroken()) this.downgrade('black frame');
    }
  }
}
