// Tiny synthesised sound kit + generative ambient music. No assets needed.
// Each world has its own music flavour (chords, tempo, instrument) and an ambient bed
// (breeze and birds, farmyard, howling wind, hushed forest, waves and gulls, creaking cove, starry shimmer,
// moon hum, cliff-top wind, rain and wind; a high breeze with wind chimes on the Keeper's Isle).
const PENTA = [0, 2, 4, 7, 9];

const MUSIC = {
  // C G Am F: bright plucks
  meadow: { chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], beat: 0.4, voice: 'pluck', density: 0.55, up: 12 },
  // G D Em C: a bouncy country pluck with a swing
  farm: { chords: [[55, 59, 62], [62, 66, 69], [52, 55, 59], [60, 64, 67]], beat: 0.34, voice: 'pluck', density: 0.6, up: 12, swing: 0.12, bass: 'offbeat' },
  // Dmaj7 Bm7 Gmaj7 A: slow music-box bells
  frost: { chords: [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 69]], beat: 0.56, voice: 'bell', density: 0.38, up: 24 },
  // Am F C G: soft bells drifting through a quiet forest
  frostwood: { chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], beat: 0.6, voice: 'bell', density: 0.32, up: 24, pad: 'wide' },
  // F Bb C Dm: bouncy marimba with a swing and a little bass line
  reef: { chords: [[53, 57, 60], [58, 62, 65], [60, 64, 67], [62, 65, 69]], beat: 0.33, voice: 'marimba', density: 0.62, up: 12, swing: 0.1, bass: 'offbeat' },
  // Dm Bb F C: a swaying sea shanty
  cove: { chords: [[62, 65, 69], [58, 62, 65], [53, 57, 60], [60, 64, 67]], beat: 0.38, voice: 'marimba', density: 0.55, up: 12, swing: 0.16, bass: 'offbeat' },
  // Cmaj7#11 D/C Em7 D: floaty glass tones over wide pads
  starfall: { chords: [[60, 64, 67, 71], [62, 66, 69, 74], [64, 67, 71, 74], [62, 66, 69, 72]], beat: 0.62, voice: 'glass', density: 0.34, up: 12, pad: 'wide' },
  // Fmaj7 G6 Em7 Am: very slow, sparse glass in the void
  moon: { chords: [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 67]], beat: 0.75, voice: 'glass', density: 0.24, up: 12, pad: 'wide' },
  // D A Bm G: a brisk folk pluck over a pulse
  cliffs: { chords: [[62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]], beat: 0.33, voice: 'pluck', density: 0.55, up: 12, bass: 'pulse' },
  // Am F Dm E: a steady pulse under minor plucks
  storm: { chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], beat: 0.36, voice: 'pluck', density: 0.5, up: 12, bass: 'pulse' },
  // Fmaj7 G6 Am7 Em7: warm, unhurried bells on the Keeper's Isle
  nexus: { chords: [[53, 57, 60, 64], [55, 59, 62, 64], [57, 60, 64, 67], [52, 55, 59, 62]], beat: 0.5, voice: 'bell', density: 0.4, up: 12, pad: 'wide' },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.5;
    this.nextNote = 0;
    this.chordIdx = 0;
    this.world = 'meadow';
    this.surface = 'grass';
    this.ambNodes = null;
    this.ambEventT = 3;
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
      this.amb = c.createGain(); this.amb.gain.value = this.sfxVol; this.amb.connect(this.master);
      // simple feedback delay for a dreamy tail
      this.delay = c.createDelay(1); this.delay.delayTime.value = 0.38;
      this.fb = c.createGain(); this.fb.gain.value = 0.38;
      this.wet = c.createGain(); this.wet.gain.value = 0.5;
      this.delay.connect(this.fb).connect(this.delay);
      this.delay.connect(this.wet).connect(this.master);
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2.5, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.setWorld(this.world); // the world may have been picked before audio existed: apply its delay + ambience now
    }
    // iOS reports 'interrupted' after a call or a trip to the home screen
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  setSfx(v) { this.sfxVol = v; if (this.sfx) { this.sfx.gain.value = v; this.amb.gain.value = v; } }
  setMusic(v) { this.musicVol = v; if (this.music) this.music.gain.value = v * 0.5; }
  suspend(s) { if (!this.ctx) return; s ? this.ctx.suspend() : this.ctx.resume(); }

  // switch music flavour, footsteps and ambient bed to a world (theme id)
  setWorld(id) {
    const prev = this.world;
    this.world = MUSIC[id] ? id : 'meadow';
    this.surface = { frost: 'snow', frostwood: 'snow', reef: 'sand', cove: 'sand', moon: 'sand', storm: 'grass' }[this.world] || 'grass';
    this.delay && (this.delay.delayTime.value = this.world === 'starfall' ? 0.5 : this.world === 'frost' ? 0.45 : 0.38);
    if (prev !== this.world || !this.ambNodes) { this.chordIdx = 0; this.startAmbience(); }
  }

  // one-shots are dropped while the context is locked or suspended, so they don't all burst out on resume
  tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.2, vol = 0.3, attack = 0.005, out = null, wet = 0 }) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
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

  noise({ t = 0, dur = 0.08, vol = 0.2, freq = 1200, q = 1, type = 'bandpass', f2 = null, attack = 0, out = null }) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const t0 = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = c.createGain();
    if (attack) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); } else g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(out || this.sfx);
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
  link(progress, chain = 0) {
    // rising pentatonic as the figure fills up; chains climb further
    const step = Math.floor(progress * 14) + chain * 2;
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
  step(kind = this.surface) {
    const r = Math.random();
    switch (kind) {
      case 'snow': this.noise({ dur: 0.07, vol: 0.06, freq: 2600 + r * 800, q: 0.6, type: 'highpass' }); break;
      case 'sand': this.noise({ dur: 0.06, vol: 0.045, freq: 1800 + r * 500, q: 0.5 }); break;
      case 'ice':
        this.noise({ dur: 0.05, vol: 0.035, freq: 5200 + r * 1500, q: 0.8, type: 'highpass' });
        this.tone({ f: 2300 + r * 600, type: 'sine', dur: 0.04, vol: 0.012 });
        break;
      case 'water':
        this.noise({ dur: 0.2, vol: 0.08, freq: 900 + r * 300, q: 0.7, type: 'lowpass', f2: 300 });
        this.noise({ t: 0.02, dur: 0.12, vol: 0.05, freq: 2600 + r * 900, q: 1.2 });
        break;
      case 'wood':
        this.tone({ f: 190 + r * 30, f2: 140, type: 'triangle', dur: 0.06, vol: 0.06 });
        this.noise({ dur: 0.04, vol: 0.04, freq: 900, q: 1.5 });
        break;
      case 'stone': this.noise({ dur: 0.04, vol: 0.06, freq: 1300 + r * 500, q: 1.6 }); break;
      case 'crystal':
        this.noise({ dur: 0.04, vol: 0.04, freq: 1500, q: 1 });
        this.tone({ f: this.midi(84 + PENTA[Math.floor(r * 5)]), type: 'sine', dur: 0.25, vol: 0.018, wet: 0.5 });
        break;
      default: this.noise({ dur: 0.045, vol: 0.05, freq: 700 + r * 400, q: 0.8 });
    }
  }
  // jump pad
  boing() {
    this.tone({ f: 170, f2: 720, type: 'sine', dur: 0.35, vol: 0.22 });
    this.tone({ f: 340, f2: 1440, type: 'triangle', dur: 0.3, vol: 0.05 });
    [0, 4, 7, 12].forEach((n, i) => this.tone({ f: this.midi(84 + n), type: 'sine', t: 0.05 + i * 0.05, dur: 0.25, vol: 0.04, wet: 0.5 }));
  }
  // wind gust (and the gentle float back after a fall)
  whoosh(soft = 0) {
    this.noise({ dur: 1.8, vol: soft ? 0.09 : 0.13, freq: 260, f2: 1100, q: 1.4, attack: 0.6 });
    this.noise({ t: 0.3, dur: 1.6, vol: soft ? 0.05 : 0.08, freq: 900, f2: 380, q: 1.1, attack: 0.5 });
    if (soft) [0, 4, 7, 11, 14].forEach((n, i) => this.tone({ f: this.midi(79 + n), type: 'sine', t: 0.2 + i * 0.12, dur: 0.5, vol: 0.04, wet: 0.6 }));
  }
  hint() {
    [0, 4, 7, 12].forEach((n, i) => this.tone({ f: this.midi(76 + n), type: 'sine', t: i * 0.06, dur: 0.3, vol: 0.08, wet: 0.6 }));
  }
  star(k) {
    const n = [76, 79, 84][k] ?? 84;
    this.tone({ f: this.midi(n), type: 'triangle', dur: 0.35, vol: 0.18, wet: 0.5 });
    this.tone({ f: this.midi(n + 12), type: 'sine', t: 0.03, dur: 0.3, vol: 0.07, wet: 0.5 });
  }
  thunder() {
    const delay = 0.3 + Math.random() * 0.8;
    this.noise({ t: delay, dur: 2.2, vol: 0.35, freq: 140, q: 0.4, type: 'lowpass' });
    this.noise({ t: delay + 0.05, dur: 0.5, vol: 0.2, freq: 900, q: 0.3, type: 'lowpass' });
  }
  win() {
    const seq = [60, 64, 67, 72, 76, 79, 84];
    seq.forEach((n, i) => this.tone({ f: this.midi(n), type: 'triangle', t: i * 0.08, dur: 0.5, vol: 0.18, wet: 0.5 }));
    [72, 76, 79].forEach(n => this.tone({ f: this.midi(n), type: 'sine', t: 0.62, dur: 1.6, vol: 0.12, attack: 0.03, wet: 0.6 }));
    this.noise({ t: 0.6, dur: 0.6, vol: 0.05, freq: 6000, q: 0.5, type: 'highpass' });
  }

  // --- ambient bed: looped filtered noise with slow swells, plus little events ---
  startAmbience() {
    const c = this.ctx;
    if (!c) return;
    if (this.ambNodes) {
      const old = this.ambNodes;
      old.out.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
      setTimeout(() => { old.stop.forEach(n => { try { n.stop(); } catch { /* already stopped */ } }); old.out.disconnect(); }, 2000);
    }
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, c.currentTime);
    out.gain.setTargetAtTime(1, c.currentTime + 0.2, 0.8);
    out.connect(this.amb);
    const stop = [];
    // one noise layer: filter type/freq, level, and an optional slow swell (lfo Hz, depth) on level or cutoff
    const layer = (type, freq, q, vol, lfo = 0, depth = 0, onFreq = false) => {
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = vol;
      s.connect(f).connect(g).connect(out);
      s.start(c.currentTime, Math.random() * 2);
      stop.push(s);
      if (lfo) {
        const o = c.createOscillator(); o.frequency.value = lfo;
        const d = c.createGain(); d.gain.value = depth;
        o.connect(d).connect(onFreq ? f.frequency : g.gain);
        o.start(); stop.push(o);
      }
    };
    const w = this.world;
    if (w === 'meadow' || w === 'farm') layer('bandpass', 520, 0.6, 0.018, 0.07, 0.01);
    else if (w === 'frostwood') layer('bandpass', 380, 1.5, 0.03, 0.06, 160, true);
    else if (w === 'cove') { layer('lowpass', 520, 0.5, 0.06, 0.09, 0.05); layer('highpass', 3200, 0.4, 0.006, 0.09, 0.005); }
    else if (w === 'moon') {
      for (const f of [55, 82.5]) {
        const o = c.createOscillator(); o.frequency.value = f; o.type = 'sine';
        const g = c.createGain(); g.gain.value = 0.012;
        o.connect(g).connect(out); o.start(); stop.push(o);
      }
    } else if (w === 'cliffs') { layer('highpass', 2400, 0.5, 0.02, 0.12, 0.012); layer('bandpass', 420, 1.0, 0.025, 0.05, 0.015); }
    else if (w === 'frost') { layer('bandpass', 420, 3, 0.05, 0.09, 260, true); layer('bandpass', 900, 5, 0.012, 0.13, 400, true); }
    else if (w === 'reef') { layer('lowpass', 650, 0.5, 0.05, 0.11, 0.045); layer('highpass', 3500, 0.4, 0.006, 0.11, 0.005); }
    else if (w === 'starfall') {
      for (const f of [880, 883.5, 1318.5]) {
        const o = c.createOscillator(); o.frequency.value = f; o.type = 'sine';
        const g = c.createGain(); g.gain.value = 0.0035;
        o.connect(g).connect(out); o.start(); stop.push(o);
      }
      layer('bandpass', 1800, 0.8, 0.006, 0.05, 0.004);
    } else if (w === 'storm') { layer('highpass', 2800, 0.5, 0.035, 0.2, 0.008); layer('bandpass', 320, 1.2, 0.04, 0.06, 0.025); }
    else if (w === 'nexus') layer('bandpass', 760, 0.5, 0.014, 0.05, 0.008);
    this.ambNodes = { out, stop };
  }

  ambientEvents(dt) {
    this.ambEventT -= dt;
    if (this.ambEventT > 0) return;
    const r = Math.random;
    const w = this.world;
    const o = this.amb;
    if (w === 'meadow') {
      // a bird: a few quick chirps
      const base = 2600 + r() * 1400, n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) this.tone({ f: base, f2: base * (1.2 + r() * 0.3), type: 'sine', t: i * 0.11, dur: 0.07, vol: 0.025, out: o });
      this.ambEventT = 1.5 + r() * 4;
    } else if (w === 'farm') {
      if (r() < 0.25) {
        // a far-off moo
        this.tone({ f: 150, f2: 118, type: 'triangle', dur: 0.9, vol: 0.03, attack: 0.15, out: o });
        this.tone({ f: 300, f2: 236, type: 'sine', dur: 0.9, vol: 0.008, attack: 0.15, out: o });
      } else {
        const base = 2600 + r() * 1400, n = 2 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) this.tone({ f: base, f2: base * (1.2 + r() * 0.3), type: 'sine', t: i * 0.11, dur: 0.07, vol: 0.025, out: o });
      }
      this.ambEventT = 2 + r() * 4;
    } else if (w === 'frostwood') {
      // an owl: hoo-hoo
      for (let i = 0; i < 2; i++) this.tone({ f: 410, f2: 380, type: 'sine', t: i * 0.42, dur: 0.32, vol: 0.02, attack: 0.05, wet: 0.5, out: o });
      this.ambEventT = 8 + r() * 9;
    } else if (w === 'cove') {
      // creaking timbers, sometimes a gull
      if (r() < 0.5) this.noise({ dur: 0.5, vol: 0.02, freq: 240 + r() * 120, f2: 180, q: 6, out: o });
      else { const f = 1300 + r() * 300; for (let i = 0; i < 2; i++) this.tone({ f, f2: f * 0.7, type: 'triangle', t: i * 0.28, dur: 0.22, vol: 0.02, out: o }); }
      this.ambEventT = 5 + r() * 7;
    } else if (w === 'moon') {
      // the base beeps now and then
      for (let i = 0; i < 2; i++) this.tone({ f: 1760, type: 'sine', t: i * 0.16, dur: 0.06, vol: 0.008, out: o });
      this.ambEventT = 7 + r() * 8;
    } else if (w === 'cliffs') {
      const f = 1400 + r() * 300;
      for (let i = 0; i < 2 + Math.floor(r() * 2); i++) this.tone({ f, f2: f * 0.7, type: 'triangle', t: i * 0.26, dur: 0.2, vol: 0.02, out: o });
      this.ambEventT = 6 + r() * 7;
    } else if (w === 'frost') {
      [0, 7, 12].forEach((nn, i) => this.tone({ f: this.midi(88 + nn + (r() < 0.5 ? 2 : 0)), type: 'sine', t: i * 0.09, dur: 0.6, vol: 0.012, wet: 0.6, out: o }));
      this.ambEventT = 5 + r() * 6;
    } else if (w === 'reef') {
      // a gull far away
      const f = 1300 + r() * 300;
      for (let i = 0; i < 2 + Math.floor(r() * 2); i++) this.tone({ f, f2: f * 0.7, type: 'triangle', t: i * 0.28, dur: 0.22, vol: 0.02, out: o });
      this.ambEventT = 6 + r() * 8;
    } else if (w === 'starfall') {
      this.tone({ f: this.midi(91 + PENTA[Math.floor(r() * 5)]), type: 'sine', dur: 1.2, vol: 0.015, attack: 0.05, wet: 0.8, out: o });
      this.ambEventT = 2 + r() * 4;
    } else if (w === 'nexus') {
      // wind chimes: a few high notes tumbling together
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) this.tone({ f: this.midi(84 + PENTA[Math.floor(r() * 5)] + (r() < 0.3 ? 12 : 0)), type: 'sine', t: i * (0.12 + r() * 0.1), dur: 1.4, vol: 0.012, attack: 0.01, wet: 0.7, out: o });
      this.ambEventT = 4 + r() * 6;
    } else this.ambEventT = 5;
  }

  // --- ambient music: soft notes over slow chords, flavoured per world ---
  updateMusic() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    const dt = Math.min(0.1, now - (this.lastTick ?? now));
    this.lastTick = now;
    this.ambientEvents(dt);
    if (this.musicVol <= 0) return;
    if (now < this.nextNote - 0.2) return;
    if (this.nextNote < now) this.nextNote = now + 0.1;
    const P = MUSIC[this.world] || MUSIC.meadow;
    const beat = P.beat;
    const ch = P.chords[this.chordIdx % P.chords.length];
    for (let i = 0; i < 8; i++) {
      const t = this.nextNote - now + i * beat + (i % 2 ? (P.swing || 0) * beat : 0);
      if (i === 0) {
        ch.slice(0, 3).forEach(n => this.tone({ f: this.midi(n), type: 'sine', t, dur: beat * 8, vol: 0.045, attack: 0.6, out: this.music }));
        if (P.pad === 'wide') ch.forEach(n => this.tone({ f: this.midi(n + 12) * 1.004, type: 'sine', t, dur: beat * 8, vol: 0.02, attack: 1.2, out: this.music, wet: 0.4 }));
      }
      if (P.bass === 'pulse') this.tone({ f: this.midi(ch[0] - 12), type: 'triangle', t, dur: beat * 0.7, vol: 0.06, out: this.music });
      else if (P.bass === 'offbeat' && i % 2 === 0) this.tone({ f: this.midi(ch[i % 4 === 0 ? 0 : 2] - 12), type: 'sine', t, dur: beat * 0.8, vol: 0.08, out: this.music });
      if (Math.random() < P.density) {
        const n = ch[Math.floor(Math.random() * ch.length)] + P.up + (Math.random() < 0.3 ? 12 : 0);
        const f = this.midi(n);
        if (P.voice === 'bell') {
          this.tone({ f, type: 'sine', t, dur: 1.4, vol: 0.05, out: this.music, wet: 0.5 });
          this.tone({ f: f * 2.76, type: 'sine', t, dur: 0.5, vol: 0.012, out: this.music, wet: 0.5 });
        } else if (P.voice === 'marimba') {
          this.tone({ f, type: 'sine', t, dur: 0.28, vol: 0.075, out: this.music, wet: 0.2 });
          this.tone({ f: f * 4, type: 'sine', t, dur: 0.05, vol: 0.02, out: this.music });
        } else if (P.voice === 'glass') {
          this.tone({ f, type: 'sine', t, dur: 1.8, vol: 0.04, attack: 0.09, out: this.music, wet: 0.7 });
          this.tone({ f: f * 2.01, type: 'sine', t, dur: 1.0, vol: 0.012, attack: 0.09, out: this.music, wet: 0.7 });
        } else this.tone({ f, type: 'triangle', t, dur: 0.7, vol: 0.06, out: this.music, wet: 0.35 });
      }
    }
    this.nextNote += beat * 8;
    this.chordIdx++;
  }
}
