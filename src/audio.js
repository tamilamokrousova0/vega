// Процедурный звук на WebAudio
let ctx = null, master = null, noiseBuf = null, laser = null;
const last = {};

function gate(name, gap) {
  if (!ctx || sfx.muted) return false;
  const t = ctx.currentTime;
  if (last[name] !== undefined && t - last[name] < gap) return false;
  last[name] = t; return true;
}
function noise(dur, freq, q, vol, type = 'bandpass', freqEnd = 0) {
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  muted: false,
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  setMuted(m) {
    this.muted = m;
    if (master) master.gain.value = m ? 0 : 0.45;
    if (m) this.laser(false);
  },
  shot(tier) {
    if (!gate('shot', 0.055)) return;
    const base = [900, 1300, 700, 1100][Math.min(tier, 3)];
    noise(0.09, base, 0.8, 0.5, 'bandpass', 200);
    tone(160, 50, 0.07, 0.35, 'triangle');
  },
  rocket() { if (!gate('rocket', 0.1)) return; noise(0.5, 500, 0.6, 0.4, 'bandpass', 2400); },
  explosion(big) {
    if (!gate('boom', 0.07)) return;
    noise(big ? 1.1 : 0.6, 900, 0.4, big ? 0.9 : 0.6, 'lowpass', 60);
    tone(90, 28, big ? 0.8 : 0.45, 0.7, 'sine');
  },
  hit() { if (!gate('hit', 0.05)) return; noise(0.06, 380, 1.2, 0.25, 'bandpass', 150); },
  death() { if (!gate('death', 0.06)) return; noise(0.14, 300, 0.9, 0.3, 'lowpass', 90); tone(120, 60, 0.12, 0.15, 'sawtooth'); },
  hurt() { if (!gate('hurt', 0.2)) return; tone(220, 70, 0.3, 0.5, 'sawtooth'); noise(0.2, 500, 0.7, 0.4); },
  soldierDown() { if (!gate('sdown', 0.1)) return; tone(300, 110, 0.18, 0.22, 'square'); },
  gateGood() { if (!gate('gate', 0.1)) return; tone(520, 540, 0.12, 0.3, 'triangle'); tone(780, 800, 0.2, 0.3, 'triangle', 0.1); },
  gateBad() { if (!gate('gate', 0.1)) return; tone(200, 90, 0.4, 0.4, 'sawtooth'); },
  upgrade() { if (!gate('upg', 0.2)) return; [440, 554, 659, 880].forEach((f, i) => tone(f, f, 0.16, 0.28, 'triangle', i * 0.08)); },
  roar() { if (!gate('roar', 0.5)) return; tone(140, 38, 1.3, 0.6, 'sawtooth'); noise(1.2, 260, 1.5, 0.5, 'bandpass', 80); },
  warn() { if (!gate('warn', 0.3)) return; tone(660, 660, 0.1, 0.18, 'square'); tone(660, 660, 0.1, 0.18, 'square', 0.16); },
  click() { if (!gate('click', 0.03)) return; tone(700, 500, 0.05, 0.2, 'square'); },
  jet() { if (!gate('jet', 1)) return; noise(1.8, 300, 0.5, 0.7, 'bandpass', 3000); },
  thunder() { if (!gate('thunder', 2)) return; noise(2.4, 400, 0.3, 0.55, 'lowpass', 40); tone(60, 24, 1.8, 0.4, 'sine', 0.1); },
  heli() { if (!gate('heli', 4)) return; for (let i = 0; i < 26; i++) tone(70, 40, 0.09, 0.16 * Math.sin(i / 26 * Math.PI), 'square', i * 0.11); },
  caw() { if (!gate('caw', 0.6)) return; tone(900, 520, 0.16, 0.1, 'sawtooth'); tone(850, 480, 0.18, 0.09, 'sawtooth', 0.22); },
  wind() { if (!gate('wind', 3)) return; noise(2.6, 300, 0.8, 0.14, 'bandpass', 900); },
  laser(on) {
    if (!ctx) return;
    if (on && !laser && !this.muted) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 96;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 1450;
      const g = ctx.createGain(); g.gain.value = 0.09;
      const g2 = ctx.createGain(); g2.gain.value = 0.015;
      o.connect(g); o2.connect(g2); g.connect(master); g2.connect(master); o.start(); o2.start();
      laser = { o, o2, g, g2 };
    } else if (!on && laser) {
      laser.o.stop(); laser.o2.stop(); laser.g.disconnect(); laser.g2.disconnect(); laser = null;
    }
  },
};
