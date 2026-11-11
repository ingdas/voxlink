import * as THREE from 'three';
import { LAYER_OVERLAY } from './render.js';
import { glows } from './looks.js';

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

// Wind lines that hang in the air ahead of you while a breeze lane carries you along: you fly past them.
class Streaks {
  constructor(scene, n = 26) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.045, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }), n);
    this.mesh.layers.set(LAYER_OVERLAY);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.visible = false;
    this.items = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), len: 2, live: false }));
    this.dir = new THREE.Vector3(0, 0, -1);
    scene.add(this.mesh);
  }
  // vel: your velocity; amount: 0 (none) to 1 (full speed)
  update(camera, vel, amount) {
    const m = this.mesh;
    m.material.opacity = amount * 0.7;
    if (amount < 0.02) { if (m.visible) { m.visible = false; for (const it of this.items) it.live = false; } return; }
    const fresh = !m.visible;
    m.visible = true;
    const h = Math.hypot(vel.x, vel.z);
    if (h > 1) this.dir.set(vel.x / h, 0, vel.z / h);
    const d = this.dir, c = camera.position;
    _q.setFromUnitVectors(_s.set(0, 0, 1), d);
    this.items.forEach((it, i) => {
      const along = (it.p.x - c.x) * d.x + (it.p.z - c.z) * d.z, side = (it.p.x - c.x) * -d.z + (it.p.z - c.z) * d.x;
      if (!it.live || along < -2 || along > 30 || Math.abs(side) > 7) {
        // a new one, off to one side of the way ahead (never across the middle of the view)
        const a = fresh ? 3 + Math.random() * 20 : 16 + Math.random() * 10, s = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2.8);
        it.p.set(c.x + d.x * a - d.z * s, c.y - 1 + Math.random() * 2.4, c.z + d.z * a + d.x * s);
        it.len = 2.2 + Math.random() * 2.6;
        it.live = true;
      }
      m.setMatrixAt(i, _m.compose(it.p, _q, _e2.set(1, 1, it.len)));
    });
    m.instanceMatrix.needsUpdate = true;
  }
}
const _e2 = new THREE.Vector3();

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.wind = new Streaks(scene);
    // dust rings that spread over the ground from your feet (through your own eyes a puff at your feet is out of view)
    const dustGeo = new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2);
    this.dustRings = Array.from({ length: 3 }, () => {
      const r = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      r.layers.set(LAYER_OVERLAY);
      r.visible = false;
      r.userData.t = 1;
      scene.add(r);
      return r;
    });
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
    glows(ring);
    ring.position.copy(pos);
    ring.userData.t = 0;
    this.scene.add(ring);
    this.rings.push(ring);
  }

  // a low puff of dust round your feet (a jump, a landing), and a ring of it spreading `reach` metres over the ground
  puff(pos, color, n = 8, power = 1.6, reach = 0) {
    const c = this.col.set(color);
    if (reach > 0) {
      const r = this.dustRings.reduce((a, b) => (b.userData.t > a.userData.t ? b : a));
      r.position.set(pos.x, pos.y + 0.05, pos.z);
      r.material.color.copy(c);
      Object.assign(r.userData, { t: 0, reach });
      r.visible = true;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = power * (0.5 + Math.random() * 0.7);
      this.bits.emit({
        pos: this.tmp.set(pos.x + Math.cos(a) * 0.22, pos.y + 0.06, pos.z + Math.sin(a) * 0.22),
        vel: new THREE.Vector3(Math.cos(a) * s, 0.5 + Math.random() * 0.8, Math.sin(a) * s),
        color: c.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.1), life: 0.35 + Math.random() * 0.3, size: 0.06 + Math.random() * 0.07, spin: 8, g: 3, drag: 3,
      });
    }
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
    for (const r of this.dustRings) {
      if (!r.visible) continue;
      r.userData.t += dt / 0.5;
      const k = Math.min(1, r.userData.t), e = 1 - (1 - k) * (1 - k);
      r.scale.setScalar(0.3 + e * r.userData.reach);
      r.material.opacity = 0.6 * (1 - k * k);
      if (k >= 1) r.visible = false;
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
