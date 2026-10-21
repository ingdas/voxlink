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
    this.normalMat = new THREE.MeshNormalMaterial();
    this.makeTargets();
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
        tDepth: { value: this.normalRT.depthTexture },
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

  makeTargets() {
    this.colorRT?.dispose();
    this.normalRT?.dispose();
    this.colorRT = new THREE.WebGLRenderTarget(1, 1, { type: this.tier.type, samples: this.tier.samples });
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.normalRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType, depthTexture, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    if (this.composite) {
      const u = this.composite.uniforms;
      u.tColor.value = this.colorRT.texture; u.tNormal.value = this.normalRT.texture; u.tDepth.value = depthTexture;
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
    else { this.colorRT.dispose(); this.normalRT.dispose(); } // unused from now on: free their GPU memory
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
    if (!target && this.verifyFrames > 0) {
      this.verifyFrames--;
      if (!this.targetsComplete()) this.downgrade('incomplete framebuffer');
      else if (this.verifyFrames === 0 && this.frameLooksBroken()) this.downgrade('black frame');
    }
  }
}
