// Tiny synthesised sound kit + generative ambient music. No assets needed.
const PENTA = [0, 2, 4, 7, 9];

export class Audio {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.5;
    this.musicOn = true;
    this.nextNote = 0;
    this.chordIdx = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      this.comp = c.createDynamicsCompressor();
      this.master.connect(this.comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = this.musicVol * 0.5; this.music.connect(this.master);
      // simple feedback delay for a dreamy tail
      this.delay = c.createDelay(1); this.delay.delayTime.value = 0.38;
      this.fb = c.createGain(); this.fb.gain.value = 0.38;
      this.wet = c.createGain(); this.wet.gain.value = 0.5;
      this.delay.connect(this.fb).connect(this.delay);
      this.delay.connect(this.wet).connect(this.master);
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setSfx(v) { this.sfxVol = v; if (this.sfx) this.sfx.gain.value = v; }
  setMusic(v) { this.musicVol = v; if (this.music) this.music.gain.value = v * 0.5; }
  suspend(s) { if (!this.ctx) return; s ? this.ctx.suspend() : this.ctx.resume(); }

  tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.2, vol = 0.3, attack = 0.005, out = null, wet = 0 }) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out || this.sfx);
    if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w).connect(this.delay); }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise({ t = 0, dur = 0.08, vol = 0.2, freq = 1200, q = 1, type = 'bandpass' }) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t0, Math.random() * 0.3); s.stop(t0 + dur + 0.02);
  }

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // --- sound effects ---
  click() { this.tone({ f: 900, f2: 1300, type: 'triangle', dur: 0.06, vol: 0.12 }); }
  hover() { this.tone({ f: 1400, type: 'sine', dur: 0.03, vol: 0.04 }); }
  pickup() {
    this.tone({ f: 380, f2: 760, type: 'triangle', dur: 0.12, vol: 0.25 });
    this.tone({ f: 1100, type: 'sine', t: 0.05, dur: 0.12, vol: 0.08 });
  }
  drop() { this.tone({ f: 420, f2: 200, type: 'triangle', dur: 0.14, vol: 0.2 }); }
  thud() { this.tone({ f: 140, f2: 60, type: 'sine', dur: 0.12, vol: 0.3 }); this.noise({ dur: 0.05, vol: 0.06, freq: 500 }); }
  link(progress) {
    // rising pentatonic as the figure fills up
    const step = Math.floor(progress * 14);
    const base = 60 + 12 * Math.floor(step / 5) + PENTA[step % 5];
    this.noise({ dur: 0.05, vol: 0.14, freq: 2500, q: 2 });
    this.tone({ f: 180, f2: 90, type: 'sine', dur: 0.1, vol: 0.3 });
    this.tone({ f: this.midi(base), type: 'triangle', t: 0.02, dur: 0.35, vol: 0.22, wet: 0.4 });
    this.tone({ f: this.midi(base + 7), type: 'sine', t: 0.07, dur: 0.4, vol: 0.14, wet: 0.5 });
  }
  wrong() {
    this.tone({ f: 220, f2: 150, type: 'square', dur: 0.12, vol: 0.07 });
    this.tone({ f: 180, f2: 120, type: 'square', t: 0.09, dur: 0.14, vol: 0.06 });
  }
  jump() { this.tone({ f: 260, f2: 420, type: 'sine', dur: 0.1, vol: 0.06 }); }
  land(v) { this.noise({ dur: 0.07, vol: Math.min(0.25, v * 0.02), freq: 400, q: 0.7 }); }
  step() {
    if (this.surface === 'snow') this.noise({ dur: 0.07, vol: 0.06, freq: 2600 + Math.random() * 800, q: 0.6, type: 'highpass' });
    else if (this.surface === 'sand') this.noise({ dur: 0.06, vol: 0.045, freq: 1800 + Math.random() * 500, q: 0.5 });
    else this.noise({ dur: 0.045, vol: 0.05, freq: 700 + Math.random() * 400, q: 0.8 });
  }
  hint() {
    [0, 4, 7, 12].forEach((n, i) => this.tone({ f: this.midi(76 + n), type: 'sine', t: i * 0.06, dur: 0.3, vol: 0.08, wet: 0.6 }));
  }
  star(k) {
    const n = [76, 79, 84][k] ?? 84;
    this.tone({ f: this.midi(n), type: 'triangle', dur: 0.35, vol: 0.18, wet: 0.5 });
    this.tone({ f: this.midi(n + 12), type: 'sine', t: 0.03, dur: 0.3, vol: 0.07, wet: 0.5 });
  }
  win() {
    const seq = [60, 64, 67, 72, 76, 79, 84];
    seq.forEach((n, i) => this.tone({ f: this.midi(n), type: 'triangle', t: i * 0.08, dur: 0.5, vol: 0.18, wet: 0.5 }));
    [72, 76, 79].forEach(n => this.tone({ f: this.midi(n), type: 'sine', t: 0.62, dur: 1.6, vol: 0.12, attack: 0.03, wet: 0.6 }));
    this.noise({ t: 0.6, dur: 0.6, vol: 0.05, freq: 6000, q: 0.5, type: 'highpass' });
  }

  // --- ambient music: soft plucks over slow chords ---
  updateMusic() {
    const c = this.ctx;
    if (!c || !this.musicOn || this.musicVol <= 0 || c.state !== 'running') return;
    if (c.currentTime < this.nextNote - 0.2) return;
    if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.1;
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const beat = 0.42;
    for (let i = 0; i < 8; i++) {
      const t = this.nextNote - c.currentTime + i * beat;
      const ch = chords[this.chordIdx % chords.length];
      if (i === 0) ch.forEach(n => this.tone({ f: this.midi(n), type: 'sine', t, dur: beat * 8, vol: 0.05, attack: 0.6, out: this.music }));
      if (Math.random() < 0.55) {
        const n = ch[Math.floor(Math.random() * 3)] + 12 + (Math.random() < 0.3 ? 12 : 0);
        this.tone({ f: this.midi(n), type: 'triangle', t, dur: 0.7, vol: 0.06, out: this.music, wet: 0.35 });
      }
    }
    this.nextNote += beat * 8;
    this.chordIdx++;
  }
}
