// Unified keyboard / mouse (pointer lock) / touch input.
// Rebindable keyboard actions (event.code). Arrows / Enter / Backspace stay as fixed secondary keys.
export const DEFAULT_KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', run: 'ShiftLeft', interact: 'KeyE', drop: 'KeyQ', hint: 'KeyH' };
const ALT_KEYS = { forward: ['ArrowUp'], back: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], interact: ['Enter'], drop: ['Backspace'] };
const sideless = c => c.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');

export class Input {
  constructor(canvas, touchLayer, { mobile }) {
    this.canvas = canvas;
    this.mobile = mobile;
    this.keys = new Set();
    this.look = { x: 0, y: 0 };
    this.move = { x: 0, y: 0, sprint: false };
    this.actions = []; // {type:'interact', x, y} | {type:'drop'} | {type:'jump'} | {type:'hint'} | {type:'pause'}
    this.enabled = false;
    this.locked = false;
    this.lookSens = 1;
    this.invertY = false;
    this.stick = null; // { id, ox, oy, x, y }
    this.lookTouches = new Map();
    this.jumpHeld = false;
    this.onLockChange = null;
    this.bindings = { ...DEFAULT_KEYS };
    this.smoothing = 0; // 0 = raw mouse/touch look, 1 = heavily smoothed
    this.pending = { x: 0, y: 0 };
    this.lastPoll = 0;
    // gamepad state, written each frame by features/access.js (lx/ly: look delta, consumed by poll)
    this.pad = { x: 0, y: 0, sprint: false, jump: false, lx: 0, ly: 0 };

    addEventListener('keydown', e => {
      if (e.repeat) { if (this.enabled) e.preventDefault(); return; }
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (this.is(e.code, 'jump')) { this.actions.push({ type: 'jump' }); e.preventDefault(); }
      if (this.is(e.code, 'interact')) this.actions.push({ type: 'interact' });
      if (this.is(e.code, 'drop')) this.actions.push({ type: 'drop' });
      if (this.is(e.code, 'hint')) this.actions.push({ type: 'hint' });
      if (e.code === 'KeyP') this.actions.push({ type: 'pause' });
      if (/^Digit[1-4]$/.test(e.code)) this.actions.push({ type: 'slot', k: +e.code.slice(5) - 1 });
      if (e.code === 'Tab') { this.actions.push({ type: 'cycle', d: e.shiftKey ? -1 : 1 }); e.preventDefault(); }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', e => {
      if (!this.enabled || !this.locked) return;
      // Guard against the occasional huge spike some browsers emit on lock.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.look.x += e.movementX * 0.0023 * this.lookSens;
      this.look.y += e.movementY * 0.0023 * this.lookSens * (this.invertY ? -1 : 1);
    });
    canvas.addEventListener('mousedown', e => {
      if (!this.enabled || this.mobile) return;
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) this.actions.push({ type: 'interact' });
      if (e.button === 2) this.actions.push({ type: 'drop' });
    });
    addEventListener('contextmenu', e => e.preventDefault());
    let wheelAcc = 0;
    addEventListener('wheel', e => {
      if (!this.enabled || !this.locked) return;
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) > 40) { this.actions.push({ type: 'cycle', d: Math.sign(wheelAcc) }); wheelAcc = 0; }
    }, { passive: true });

    // Touch: left side spawns a floating stick, elsewhere drags the camera. Quick taps interact.
    const opt = { passive: false };
    touchLayer.addEventListener('touchstart', e => this.touchStart(e), opt);
    touchLayer.addEventListener('touchmove', e => this.touchMove(e), opt);
    touchLayer.addEventListener('touchend', e => this.touchEnd(e), opt);
    touchLayer.addEventListener('touchcancel', e => this.touchEnd(e), opt);
    this.stickEl = document.getElementById('stick');
    this.knobEl = document.getElementById('stick-knob');
  }

  is(code, action) {
    const b = this.bindings[action];
    return (!!b && sideless(code) === sideless(b)) || !!ALT_KEYS[action]?.includes(code);
  }
  held(action) { for (const c of this.keys) if (this.is(c, action)) return true; return false; }

  requestLock() {
    if (this.mobile) return Promise.resolve();
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) return p.catch(() => this.canvas.requestPointerLock());
    } catch { /* older browsers */ }
    return Promise.resolve();
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  touchStart(e) {
    e.preventDefault();
    if (!this.enabled) return;
    const w = innerWidth;
    for (const t of e.changedTouches) {
      const now = performance.now();
      if (!this.stick && t.clientX < w * 0.42) {
        this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0, t0: now, moved: 0 };
        this.stickEl.style.transform = `translate(${t.clientX}px, ${t.clientY}px)`;
        this.stickEl.classList.add('on');
        this.knobEl.style.transform = 'translate(0px, 0px)';
      } else {
        this.lookTouches.set(t.identifier, { lx: t.clientX, ly: t.clientY, sx: t.clientX, sy: t.clientY, t0: now, moved: 0 });
      }
    }
  }
  touchMove(e) {
    e.preventDefault();
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) {
        const R = 56;
        let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
        const len = Math.hypot(dx, dy);
        this.stick.moved = Math.max(this.stick.moved, len);
        if (len > R) {
          // drag the stick base along so the thumb never "loses" it
          const k = (len - R) / len;
          this.stick.ox += dx * k; this.stick.oy += dy * k;
          dx = t.clientX - this.stick.ox; dy = t.clientY - this.stick.oy;
          this.stickEl.style.transform = `translate(${this.stick.ox}px, ${this.stick.oy}px)`;
        }
        this.stick.x = dx / R; this.stick.y = dy / R;
        this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
        continue;
      }
      const l = this.lookTouches.get(t.identifier);
      if (!l) continue;
      const dx = t.clientX - l.lx, dy = t.clientY - l.ly;
      l.lx = t.clientX; l.ly = t.clientY;
      l.moved = Math.max(l.moved, Math.hypot(t.clientX - l.sx, t.clientY - l.sy));
      const k = 0.0062 * this.lookSens;
      this.look.x += dx * k;
      this.look.y += dy * k * (this.invertY ? -1 : 1);
    }
  }
  touchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const now = performance.now();
      if (this.stick && t.identifier === this.stick.id) {
        if (now - this.stick.t0 < 260 && this.stick.moved < 14) this.actions.push({ type: 'interact', x: t.clientX, y: t.clientY });
        this.stick = null;
        this.stickEl.classList.remove('on');
        continue;
      }
      const l = this.lookTouches.get(t.identifier);
      if (!l) continue;
      this.lookTouches.delete(t.identifier);
      if (now - l.t0 < 300 && l.moved < 14 && this.enabled) this.actions.push({ type: 'interact', x: t.clientX, y: t.clientY });
    }
  }

  // Called once per frame: returns accumulated look delta and resolved move vector.
  poll() {
    let mx = 0, my = 0;
    if (this.held('forward')) my -= 1;
    if (this.held('back')) my += 1;
    if (this.held('left')) mx -= 1;
    if (this.held('right')) mx += 1;
    let sprint = this.held('run') || this.pad.sprint;
    mx += this.pad.x; my += this.pad.y;
    if (this.stick) {
      mx += this.stick.x; my += this.stick.y;
      if (Math.hypot(this.stick.x, this.stick.y) > 0.92) sprint = true;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my; this.move.sprint = sprint;
    // optional exponential smoothing of mouse / touch look (gamepad look is already smooth)
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastPoll || now)) / 1000);
    this.lastPoll = now;
    const p = this.pending;
    p.x += this.look.x; p.y += this.look.y;
    this.look.x = this.look.y = 0;
    const f = this.smoothing > 0 ? 1 - Math.exp(-dt / (this.smoothing * 0.12)) : 1;
    const look = { x: p.x * f + this.pad.lx, y: p.y * f + this.pad.ly };
    p.x -= p.x * f; p.y -= p.y * f;
    this.pad.lx = this.pad.ly = 0;
    this.jumpHeld = this.held('jump') || this.jumpButtonHeld || this.pad.jump;
    return look;
  }

  takeActions() { const a = this.actions; this.actions = []; return a; }

  reset() {
    this.actions = []; this.look.x = this.look.y = 0; this.keys.clear();
    this.pending.x = this.pending.y = 0; this.pad.lx = this.pad.ly = 0;
    this.stick = null; this.lookTouches.clear(); this.stickEl?.classList.remove('on');
  }
}
