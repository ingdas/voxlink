import * as THREE from 'three';
import { LAYER_OVERLAY } from './render.js';

const beamView = new THREE.Frustum(), beamM = new THREE.Matrix4(), beamBox = new THREE.Box3();

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

class ParticlePool {
  constructor(scene, geo, mat, count) {
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.layers.set(LAYER_OVERLAY);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts = Array.from({ length: count }, () => ({
      life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), size: 1, g: 9, drag: 0,
    }));
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < count; i++) { this.mesh.setColorAt(i, c); this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
    this.next = 0;
    scene.add(this.mesh);
  }
  emit(o) {
    const p = this.parts[this.next];
    this.mesh.setColorAt(this.next, o.color);
    this.next = (this.next + 1) % this.parts.length;
    p.life = p.max = o.life;
    p.p.copy(o.pos); p.v.copy(o.vel);
    p.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.w.set((Math.random() - 0.5) * o.spin, (Math.random() - 0.5) * o.spin, (Math.random() - 0.5) * o.spin);
    p.size = o.size; p.g = o.g; p.drag = o.drag || 0;
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    this.parts.forEach((p, i) => {
      if (p.life <= 0) return;
      any = true;
      p.life -= dt;
      p.v.y -= p.g * dt;
      if (p.drag) p.v.multiplyScalar(Math.exp(-p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      p.r.addScaledVector(p.w, dt);
      const k = Math.max(0, p.life / p.max);
      const s = p.size * Math.min(1, k * 3);
      _q.setFromEuler(_e.set(p.r.x, p.r.y, p.r.z));
      this.mesh.setMatrixAt(i, _m.compose(p.p, _q, _s.set(s, s, s)));
    });
    if (any || this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = any; }
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.bits = new ParticlePool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 260);
    this.confetti = new ParticlePool(scene, new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 360);
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.42, 0.5, 32);
    this.ringGeo = ringGeo;
    this.tmp = new THREE.Vector3();
    this.col = new THREE.Color();

    // hint beam
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 40, 16, 1, true), beamMat);
    this.beam.layers.set(LAYER_OVERLAY);
    this.beam.visible = false;
    scene.add(this.beam);
    this.beamTarget = null;
    this.beamTime = 0;
  }

  burst(pos, color, n = 22, power = 4) {
    const c = this.col.set(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(power * (0.4 + Math.random()));
      const cc = c.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      this.bits.emit({ pos: this.tmp.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4)), vel: v, color: cc, life: 0.5 + Math.random() * 0.5, size: 0.07 + Math.random() * 0.07, spin: 14, g: 12 });
    }
    // flat shockwave ring
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    ring.layers.set(LAYER_OVERLAY);
    ring.position.copy(pos);
    ring.userData.t = 0;
    this.scene.add(ring);
    this.rings.push(ring);
  }

  sparkle(pos) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3);
    this.bits.emit({
      pos: this.tmp.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5)),
      vel: v, color: this.col.setHex(0xfff6c8), life: 0.8, size: 0.05, spin: 6, g: 0,
    });
  }

  confettiBurst(center, radius = 3, n = 200) {
    const palette = [0xff5d5d, 0xffd23f, 0x5fd068, 0x4cc9f0, 0x9b5de5, 0xff8fc7, 0xffffff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 4), 6 + Math.random() * 7, Math.sin(a) * (1 + Math.random() * 4));
      this.confetti.emit({
        pos: this.tmp.set(center.x + Math.cos(a) * radius * 0.3, center.y, center.z + Math.sin(a) * radius * 0.3),
        vel: v, color: this.col.setHex(palette[i % palette.length]), life: 3 + Math.random() * 2,
        size: 0.14 + Math.random() * 0.1, spin: 16, g: 6, drag: 1.4,
      });
    }
  }

  // the light's 4 s only run once it's been in view (up to 10 s of waiting while you turn round to it)
  pointBeam(obj) { this.beamTarget = obj; this.beamTime = 4; this.beamAge = 0; this.beamWait = 10; this.beam.visible = true; }
  clearBeam() { this.beamTarget = null; this.beamTime = 0; this.beam.visible = false; }

  update(dt, camera) {
    this.bits.update(dt);
    this.confetti.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.userData.t += dt;
      const k = r.userData.t / 0.45;
      r.scale.setScalar(1 + k * 2.6);
      r.material.opacity = Math.max(0, 0.9 * (1 - k));
      r.quaternion.copy(camera.quaternion);
      if (k >= 1) { this.scene.remove(r); r.material.dispose(); this.rings.splice(i, 1); }
    }
    if (this.beamTime > 0 && this.beamTarget) {
      const p = this.beamTarget.position;
      this.beam.position.set(p.x, p.y + 20, p.z);
      this.beamAge += dt;
      camera.updateMatrixWorld();
      beamView.setFromProjectionMatrix(beamM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      beamBox.min.set(p.x - 0.3, p.y, p.z - 0.3); beamBox.max.set(p.x + 0.3, p.y + 40, p.z + 0.3);
      if (this.beamWait > 0 && !beamView.intersectsBox(beamBox)) this.beamWait -= dt;
      else { this.beamWait = 0; this.beamTime -= dt; }
      const fade = Math.min(1, this.beamTime, this.beamAge * 4);
      this.beam.material.opacity = 0.35 * fade * (0.8 + 0.2 * Math.sin(performance.now() * 0.01));
      if (this.beamTime <= 0) this.clearBeam();
    }
  }
}
