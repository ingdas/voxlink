import * as THREE from 'three';

const RADIUS = 0.3, HEIGHT = 1.7, EYE = 1.55, STEP = 0.55;
const GRAVITY = 24, JUMP_V = 8.6, WALK = 5.0, RUN = 7.6;

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = true;
    this.coyote = 0; this.jumpBuffer = 0;
    this.bob = 0; this.bobAmt = 0;
    this.land = 0;
    this.stepPhase = 0;
    this.bobScale = 1; this.landScale = 1; // comfort settings (head bob / reduced motion)
    this.onStep = null; this.onLand = null; this.onJump = null;
    this._box = new THREE.Box3();
  }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = -0.12;
    this.onGround = true;
  }

  box(p = this.pos) {
    this._box.min.set(p.x - RADIUS, p.y, p.z - RADIUS);
    this._box.max.set(p.x + RADIUS, p.y + HEIGHT, p.z + RADIUS);
    return this._box;
  }

  collides(colliders, p = this.pos) {
    const b = this.box(p);
    for (const c of colliders) if (b.intersectsBox(c) && overlapAmount(b, c) > 1e-4) return c;
    return null;
  }

  update(dt, input, look, colliders, world) {
    this.yaw -= look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y, -1.45, 1.45);

    const { x: mx, y: my, sprint } = input.move;
    const speed = sprint ? RUN : WALK;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward is -z rotated by yaw
    const wx = mx * cos + my * sin;
    const wz = -mx * sin + my * cos;
    const targetX = wx * speed, targetZ = wz * speed;
    const accel = this.onGround ? 14 : 5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (targetX - this.vel.x) * k;
    this.vel.z += (targetZ - this.vel.z) * k;

    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_V;
      this.coyote = 0; this.jumpBuffer = 0;
      this.onGround = false;
      this.onJump?.();
    }
    // variable jump height: release early to cut the jump
    if (!input.jumpHeld && this.vel.y > 3 && !this.onGround) this.vel.y -= GRAVITY * dt * 1.2;
    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -30) this.vel.y = -30;

    const wasGround = this.onGround;
    const fallSpeed = this.vel.y;
    this.onGround = false;
    // sub-step to avoid tunnelling at low frame rates
    const steps = Math.ceil(Math.max(Math.abs(this.vel.x), Math.abs(this.vel.z), Math.abs(this.vel.y)) * dt / 0.2) || 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.moveAxis('x', this.vel.x * h, colliders, wasGround);
      this.moveAxis('z', this.vel.z * h, colliders, wasGround);
      this.moveAxis('y', this.vel.y * h, colliders, wasGround);
    }
    if (this.pos.y <= 0) { this.pos.y = 0; if (this.vel.y < 0) this.vel.y = 0; this.onGround = true; }

    // keep inside the island
    const r = Math.hypot(this.pos.x, this.pos.z);
    const th = Math.atan2(this.pos.z, this.pos.x);
    const maxR = world.radiusAt(th) - 0.6;
    if (r > maxR) { this.pos.x *= maxR / r; this.pos.z *= maxR / r; }

    if (this.onGround && !wasGround && fallSpeed < -6) {
      this.land = Math.min(0.22, -fallSpeed * 0.012);
      this.onLand?.(-fallSpeed);
    }
    this.land += (0 - this.land) * (1 - Math.exp(-10 * dt));

    const hs = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.onGround && hs > 0.6;
    this.bobAmt += ((moving ? 1 : 0) - this.bobAmt) * (1 - Math.exp(-8 * dt));
    if (moving) {
      const prev = this.stepPhase;
      this.stepPhase += hs * dt * 1.55;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.stepPhase / Math.PI)) this.onStep?.(hs);
    }
  }

  moveAxis(axis, d, colliders, wasGround) {
    if (d === 0) return;
    this.pos[axis] += d;
    for (let iter = 0; iter < 4; iter++) {
      const c = this.collides(colliders);
      if (!c) return;
      if (axis === 'y') {
        if (d < 0) { this.pos.y = c.max.y; this.onGround = true; }
        else this.pos.y = c.min.y - HEIGHT - 1e-3;
        this.vel.y = 0;
        continue;
      }
      // step up onto low ledges
      const rise = c.max.y - this.pos.y;
      if (rise > 0 && rise <= STEP && (wasGround || this.vel.y <= 0)) {
        const oldY = this.pos.y;
        this.pos.y = c.max.y + 1e-3;
        if (!this.collides(colliders)) { this.onGround = true; this.vel.y = Math.max(this.vel.y, 0); continue; }
        this.pos.y = oldY;
      }
      if (d > 0) this.pos[axis] = c.min[axis] - RADIUS - 1e-3;
      else this.pos[axis] = c.max[axis] + RADIUS + 1e-3;
      this.vel[axis] = 0;
    }
  }

  // Push the player out of a freshly placed box.
  resolvePenetration(colliders) {
    if (!this.collides(colliders)) return;
    const p = this.pos.clone();
    const tryPos = new THREE.Vector3();
    for (let r = 0.15; r < 4; r += 0.15) {
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * Math.PI * 2;
        tryPos.set(p.x + Math.cos(th) * r, p.y, p.z + Math.sin(th) * r);
        if (!this.collides(colliders, tryPos)) { this.pos.copy(tryPos); return; }
      }
      tryPos.set(p.x, p.y + r, p.z);
      if (!this.collides(colliders, tryPos)) { this.pos.copy(tryPos); return; }
    }
  }

  applyCamera(camera) {
    const bobY = Math.sin(this.stepPhase * 2) * 0.035 * this.bobAmt * this.bobScale;
    const bobX = Math.cos(this.stepPhase) * 0.025 * this.bobAmt * this.bobScale;
    camera.position.set(this.pos.x, this.pos.y + EYE + bobY - this.land * this.landScale, this.pos.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    camera.translateX(bobX);
  }
}

function overlapAmount(a, b) {
  const x = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const y = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const z = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return Math.min(x, y, z);
}
