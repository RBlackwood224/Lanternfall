'use strict';
// ===== Synthesized sound effects + ambience (no audio files needed) =====
const SND = { ctx: null, master: null, sfx: null, amb: null, sfxVol: 0.8, musVol: 0.6, music: null, noiseBuf: null, started: false };

function audioInit() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const c = SND.ctx = new AC();
  SND.master = c.createGain(); SND.master.connect(c.destination);
  SND.sfx = c.createGain(); SND.sfx.gain.value = SND.sfxVol; SND.sfx.connect(SND.master);
  SND.amb = c.createGain(); SND.amb.gain.value = SND.sfxVol * 0.5; SND.amb.connect(SND.master);
  const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  SND.noiseBuf = buf;
}
function setVolumes(sfx, mus) {
  SND.sfxVol = sfx; SND.musVol = mus;
  if (SND.sfx) { SND.sfx.gain.value = sfx; SND.amb.gain.value = sfx * 0.5; }
  if (SND.music) SND.music.volume = mus;
}
function tone(type, f0, f1, dur, vol, opts) {
  const c = SND.ctx; if (!c) return;
  opts = opts || {};
  const t0 = c.currentTime + (opts.delay || 0);
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (opts.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; node.connect(f); node = f; }
  node.connect(g); g.connect(opts.pan !== undefined ? panNode(opts.pan) : SND.sfx);
  if (opts.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = opts.vib; lg.gain.value = f0 * 0.04; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur); }
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur, vol, type, freq, opts) {
  const c = SND.ctx; if (!c) return;
  opts = opts || {};
  const t0 = c.currentTime + (opts.delay || 0);
  const s = c.createBufferSource(); s.buffer = SND.noiseBuf; s.loop = true;
  const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq || 1000, t0);
  if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t0 + dur);
  if (opts.q) f.Q.value = opts.q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(opts.pan !== undefined ? panNode(opts.pan) : SND.sfx);
  s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}
function panNode(p) {
  const c = SND.ctx;
  if (c.createStereoPanner) { const n = c.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); n.connect(SND.sfx); return n; }
  return SND.sfx;
}

const SFX = {
  click: () => tone('square', 660, 880, 0.06, 0.06),
  step: (v, p) => noise(0.05, 0.03 * v, 'bandpass', 900, { pan: p, q: 2 }),
  pick: (v, p) => { tone('square', 520, 1040, 0.09, 0.07 * v, { pan: p }); tone('square', 780, 1560, 0.08, 0.05 * v, { pan: p, delay: 0.06 }); },
  pour: (v, p) => { for (let i = 0; i < 5; i++) tone('sine', 300 + Math.random() * 200, 200, 0.08, 0.06 * v, { delay: i * 0.07, pan: p }); noise(0.4, 0.05 * v, 'lowpass', 500, { pan: p }); },
  altarlit: () => { noise(1.2, 0.25, 'lowpass', 200, { f1: 3000, att: 0.3 }); [262, 330, 392, 523].forEach((f, i) => tone('triangle', f, f, 1.8, 0.09, { delay: 0.25 + i * 0.08, att: 0.05 })); },
  bell: (v, p) => { for (const [f, a] of [[220, 0.18], [440, 0.1], [587, 0.07], [880, 0.04]]) tone('sine', f, f * 0.995, 3.5, a * v, { pan: p, att: 0.005 }); },
  wounded: (v, p) => { noise(0.25, 0.2 * v, 'lowpass', 1800, { pan: p }); tone('sawtooth', 300, 120, 0.3, 0.09 * v, { pan: p, lp: 1200 }); },
  grabbed: (v, p) => { tone('sawtooth', 700, 220, 0.9, 0.1 * v, { pan: p, lp: 2200, vib: 9 }); noise(0.4, 0.12 * v, 'highpass', 1500, { pan: p }); },
  caged: (v, p) => { tone('square', 140, 90, 0.25, 0.12 * v, { pan: p, lp: 900 }); noise(0.3, 0.12 * v, 'bandpass', 2500, { pan: p, q: 6 }); },
  ghost: () => tone('sine', 660, 165, 2.4, 0.12, { vib: 5, att: 0.2 }),
  rescued: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.3, 0.08, { delay: i * 0.08 })),
  healed: (v, p) => { tone('triangle', 440, 880, 0.3, 0.07 * v, { pan: p }); },
  snuffed: (v, p) => noise(0.35, 0.18 * v, 'lowpass', 2500, { f1: 200, pan: p }),
  stunned: (v, p) => { for (let i = 0; i < 6; i++) tone('square', 1200 + Math.random() * 1200, 900, 0.1, 0.04 * v, { delay: i * 0.05, pan: p }); tone('sawtooth', 200, 60, 0.6, 0.12 * v, { pan: p, lp: 800 }); },
  howl: (v, p) => tone('sawtooth', 220, 480, 1.8, 0.14 * Math.max(0.4, v), { vib: 6, lp: 1400, att: 0.3, pan: p }),
  thunder: () => { noise(2.5, 0.35, 'lowpass', 300, { f1: 60, att: 0.05 }); noise(0.3, 0.2, 'highpass', 2000); },
  claw: (v, p) => noise(0.15, 0.25 * v, 'bandpass', 3000, { f1: 800, pan: p, q: 1 }),
  splash: (v, p) => { noise(0.3, 0.15 * v, 'bandpass', 1800, { f1: 600, pan: p }); tone('sine', 1200, 300, 0.2, 0.05 * v, { pan: p }); },
  salt: (v, p) => { for (let i = 0; i < 4; i++) noise(0.05, 0.08 * v, 'highpass', 4000, { delay: i * 0.04, pan: p }); },
  trapped: (v, p) => { tone('square', 180, 120, 0.4, 0.14 * v, { pan: p, lp: 1500 }); noise(0.2, 0.15 * v, 'bandpass', 3000, { pan: p, q: 8 }); },
  hexed: (v, p) => tone('sine', 300, 900, 0.5, 0.1 * v, { vib: 12, pan: p }),
  rats: (v, p) => { for (let i = 0; i < 6; i++) tone('square', 2400 + Math.random() * 800, 2000, 0.05, 0.04 * v, { delay: i * 0.09, pan: p }); },
  scratch: (v, p) => { for (let i = 0; i < 4; i++) noise(0.12, 0.12 * v, 'bandpass', 1400, { delay: i * 0.25, pan: p, q: 3 }); },
  ping: () => { tone('sine', 880, 880, 0.15, 0.08); tone('sine', 1320, 1320, 0.2, 0.06, { delay: 0.1 }); },
  heartbeat: (v) => { tone('sine', 62, 40, 0.18, 0.4 * v); tone('sine', 56, 36, 0.16, 0.3 * v, { delay: 0.2 }); },
  manifest: () => { tone('sawtooth', 55, 40, 3, 0.2, { lp: 400, att: 0.4 }); tone('sawtooth', 82, 60, 3, 0.12, { lp: 600, att: 0.4 }); noise(2, 0.2, 'lowpass', 400, { f1: 2000, att: 0.6 }); },
  mhit: (v, p) => { tone('sawtooth', 160, 50, 0.6, 0.2, { lp: 900, pan: p }); noise(0.3, 0.2, 'bandpass', 900, { pan: p }); },
  win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.6, 0.09, { delay: i * 0.12 })),
  lose: () => [330, 311, 294, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.6, 0.07, { delay: i * 0.2, lp: 1200 })),
  nightfalls: () => { tone('sine', 110, 108, 3, 0.12, { att: 1 }); tone('sine', 165, 160, 3, 0.07, { att: 1 }); },
  predawn: () => [196, 247, 294].forEach((f, i) => tone('triangle', f, f, 1.2, 0.06, { delay: i * 0.3 })),
  ability: (v, p) => { tone('triangle', 440, 990, 0.25, 0.08 * v, { pan: p }); },
  whisper: (v, p) => noise(1.2, 0.07 * v, 'bandpass', 1600, { q: 4, att: 0.4, pan: p, f1: 900 }),
  lantern: (v) => tone('square', 300, 360, 0.05, 0.04 * v),
  throw: (v, p) => noise(0.15, 0.08 * v, 'highpass', 1500, { f1: 4000, pan: p }),
  denied: () => tone('square', 200, 150, 0.12, 0.06),
};
function playAt(name, x, y, lx, ly) {
  if (!SND.ctx || !SFX[name]) return;
  let v = 1, p = 0;
  if (x !== undefined && lx !== undefined) {
    const d = Math.hypot(x - lx, y - ly);
    v = Math.max(0, 1 - d / 240); p = Math.max(-1, Math.min(1, (x - lx) / 160));
    if (v <= 0.02) return;
  }
  SFX[name](v, p);
}

// ambience: wind bed, crickets, owl
let ambT = 0, windNode = null;
function ambienceStart() {
  if (!SND.ctx || windNode) return;
  const c = SND.ctx;
  const s = c.createBufferSource(); s.buffer = SND.noiseBuf; s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
  const g = c.createGain(); g.gain.value = 0.06;
  const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 0.07; lg.gain.value = 220; l.connect(lg); lg.connect(f.frequency); l.start();
  s.connect(f); f.connect(g); g.connect(SND.amb); s.start();
  windNode = { s, g };
}
function ambienceStop() { if (windNode) { try { windNode.s.stop(); } catch (e) { } windNode = null; } }
function ambienceTick(dt) {
  if (!SND.ctx) return;
  ambT -= dt;
  if (ambT <= 0) {
    ambT = 1.5 + Math.random() * 4;
    const r = Math.random();
    if (r < 0.5) for (let i = 0; i < 3; i++) tone('sine', 4200 + Math.random() * 300, 4100, 0.04, 0.012, { delay: i * 0.08, pan: Math.random() * 2 - 1 });
    else if (r < 0.62) { const p = Math.random() * 2 - 1; tone('sine', 420, 380, 0.35, 0.03, { pan: p, att: 0.08 }); tone('sine', 400, 360, 0.5, 0.03, { pan: p, delay: 0.5, att: 0.08 }); }
    else if (r < 0.7) tone('sine', 1800, 1500, 0.2, 0.012, { pan: Math.random() * 2 - 1 });
  }
}
// optional music file: put your own track at music/night.mp3
function musicStart() {
  if (SND.music) { SND.music.volume = SND.musVol; SND.music.play().catch(() => { }); return; }
  try {
    const a = new Audio('music/night.mp3'); a.loop = true; a.volume = SND.musVol;
    a.addEventListener('error', () => { SND.music = null; });
    SND.music = a; a.play().catch(() => { });
  } catch (e) { }
}
function musicStop() { if (SND.music) SND.music.pause(); }
