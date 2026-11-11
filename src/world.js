// Сцена, свет, небо, дорога, биомы и декорации (в т.ч. подвижные и с эффектами)
import * as THREE from '../vendor/three.module.min.js';
import { G, rand } from './state.js';
import { ROAD_HALF } from './config.js';
import { P, box, cyl, sph, cone, ico, merge, MAT } from './models.js';
import { fire, steam, sparks, emitGlow, emitSolid } from './fx.js';
import { setAmbient } from './ambient.js';

const PI = Math.PI;
const W = { props: [], live: [], road: null, ground: null, sun: null, hemi: null, dust: null, dustVel: null, biome: null, sky: null, disc: null, halo: null, back: null, fireLights: [], flash: 0, b: null, wind: 0, fogK: 1, fogKT: 1, tint: 0, tintT: 0 };

const BIOMES = {
  city:   { fog: 0x161c26, zenith: 0x05070c, near: 26, far: 115, ground: 0x34373c, road: 0xa8a8aa, sun: 0xa9bbdc, sunI: 3.2, sky: 0x55647e, gnd: 0x2a2c34, hemiI: 2.5,
            dust: 0x8a8a8a, dustDir: -0.6, disc: { c: 0xd5dcea, x: -80, y: 34, r: 7 },
            props: [['building', 20], ['shop', 6], ['car', 8], ['bus', 2], ['lamp', 9], ['rubble', 8], ['clutter', 10], ['billboard', 3], ['gantry', 2]] },
  desert: { fog: 0x7d573c, zenith: 0x2e2a3a, near: 30, far: 130, ground: 0x7a6245, road: 0xa3927a, sun: 0xffb478, sunI: 2.6, sky: 0x8a6a50, gnd: 0x4a3a28, hemiI: 1.2,
            dust: 0xc9a47a, dustDir: -0.15, disc: { c: 0xffc27a, x: 70, y: 20, r: 15 },
            props: [['rock', 16], ['mesa', 6], ['cactus', 14], ['sign', 4], ['car', 5], ['pole', 9], ['pumpjack', 3], ['station', 2], ['billboard', 3], ['bones', 6]] },
  forest: { fog: 0x26332b, zenith: 0x0a100e, near: 14, far: 75, ground: 0x2c3a26, road: 0x8a8872, sun: 0xb4ceac, sunI: 2.4, sky: 0x4c6454, gnd: 0x1e281a, hemiI: 1.8,
            dust: 0x9db08a, dustDir: 0.12, disc: { c: 0xc8d6c8, x: 50, y: 30, r: 5 },
            props: [['tree', 34], ['conifer', 16], ['deadtree', 10], ['rock', 8], ['bush', 16], ['log', 6], ['cabin', 2], ['shroom', 8], ['car', 2]] },
  snow:   { fog: 0x8794a0, zenith: 0x55657a, near: 22, far: 100, ground: 0xb4bdc4, road: 0xc2c6ca, sun: 0xe2ebf5, sunI: 2.0, sky: 0xa8b4c0, gnd: 0x6a7480, hemiI: 1.3,
            dust: 0xffffff, dustDir: -1.6, disc: { c: 0xf2f6fa, x: -60, y: 26, r: 9 },
            props: [['pine', 22], ['tower', 5], ['crates', 8], ['fence', 9], ['bunker', 4], ['hangar', 2], ['radar', 3], ['truck', 4], ['mast', 4]] },
  factory:{ fog: 0x23261a, zenith: 0x0a0c08, near: 20, far: 100, ground: 0x38382c, road: 0x9a9684, sun: 0xd8c890, sunI: 2.6, sky: 0x5a5e40, gnd: 0x24241a, hemiI: 1.9, back: 'lab',
            dust: 0xa8b060, dustDir: 0.2, disc: { c: 0xb8c070, x: 60, y: 30, r: 8 },
            props: [['pipe', 9], ['fan', 5], ['press', 5], ['crates', 9], ['truck', 4], ['rubble', 6], ['pillar', 8], ['lamp', 7], ['tank', 5], ['gantry', 2], ['shop', 3]] },
  neon:   { fog: 0x150f26, zenith: 0x05030c, near: 26, far: 120, ground: 0x2a2836, road: 0x9a98aa, sun: 0xa8a0e0, sunI: 2.8, sky: 0x5a4a8a, gnd: 0x221a30, hemiI: 2.2, back: 'city',
            dust: 0x9ad8ff, dustDir: -1.2, disc: null,
            props: [['neontower', 18], ['building', 6], ['car', 7], ['bus', 2], ['lamp', 8], ['billboard', 4], ['clutter', 8], ['gantry', 3], ['rack', 4]] },
  lab:    { fog: 0x0e1c18, zenith: 0x030807, near: 18, far: 90, ground: 0x283232, road: 0x8a9a9a, sun: 0x9cecd0, sunI: 2.4, sky: 0x2e5a4c, gnd: 0x141e1a, hemiI: 1.9,
            dust: 0x7dff9a, dustDir: 0.3, disc: null,
            props: [['pillar', 12], ['tank', 14], ['pipe', 7], ['hive', 12], ['rack', 8], ['fan', 4], ['arch', 3], ['pod', 6]] },
};

// ---------- Текстуры ----------
function canvasTex(size, draw, repX, repY) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repX, repY);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function speckle(ctx, s, n, lo, hi, a) {
  for (let i = 0; i < n; i++) {
    const v = lo + Math.random() * (hi - lo) | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
    const w = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * s, Math.random() * s, w, w);
  }
}
function roadTex() {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#6e6e70'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 14000, 60, 150, 0.35);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 20 + Math.random() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(20,20,22,${0.15 + Math.random() * 0.25})`); g.addColorStop(1, 'rgba(20,20,22,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.strokeStyle = 'rgba(15,15,16,0.7)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      let x = Math.random() * s, y = Math.random() * s; ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 12; j++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(25,25,26,0.4)'; ctx.lineWidth = 5;   // следы шин
    for (const x of [150, 190, 330, 370]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke(); }
    ctx.fillStyle = 'rgba(200,190,160,0.5)';
    ctx.fillRect(s / 2 - 4, 30, 8, 190);
    ctx.fillRect(14, 0, 7, s); ctx.fillRect(s - 21, 0, 7, s);
    speckle(ctx, s, 5000, 50, 100, 0.5);
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 12 + Math.random() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(60,8,8,0.6)'); g.addColorStop(1, 'rgba(60,8,8,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, 1, 24);
}
function groundTex() {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 9000, 60, 220, 0.3);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 10 + Math.random() * 40, v = Math.random() < 0.5 ? 40 : 220;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${v},${v},${v},0.25)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, 30, 30);
}
function haloTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.25, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- Материалы подвижных частей ----------
const KM = {
  beam: new THREE.MeshBasicMaterial({ color: 0xcfd8e8, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
  warm: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  green: new THREE.MeshBasicMaterial({ color: 0x66ffaa }),
  cyan: new THREE.MeshBasicMaterial({ color: 0x7ad8ff }),
  pink: new THREE.MeshBasicMaterial({ color: 0xff4fa8 }),
};

// ---------- Декорации ----------
const R = Math.random;
const pick = a => a[R() * a.length | 0];
const wheel = (x, z, r = 0.34) => P(cyl(r, r, 0.24, 10), 0x0e0e0e, [x, r, z], [0, 0, PI / 2]);

const PROP = {
  building() {
    const w = 7 + R() * 6, h = 10 + R() * 20, d = 7 + R() * 7, col = pick([0x2c2e33, 0x35322d, 0x26292e, 0x3a3836]), trim = 0x1c1d20;
    const p = [P(box(w, h, d), col, [0, h / 2, 0]), P(box(w + 0.3, 3, d + 0.3), trim, [0, 1.5, 0]), P(box(w + 0.5, 0.4, d + 0.5), trim, [0, h + 0.2, 0])];
    const rows = Math.floor((h - 3) / 2.6), cols = Math.floor(d / 2);
    for (let r = 0; r < rows; r++) {
      if (r % 3 === 2) p.push(P(box(w + 0.25, 0.18, d + 0.25), trim, [0, 3.4 + r * 2.6 + 1.2, 0]));
      for (let c = 0; c < cols; c++) {
        if (R() < 0.12) continue;
        const wc = R() < 0.08 ? 0xa08a4a : pick([0x0a0b0d, 0x0e1014, 0x14171c]);
        const y = 4.6 + r * 2.6, z = -d / 2 + 1.2 + c * 2;
        for (const sx of [1, -1]) p.push(P(box(0.12, 1.4, 1), wc, [sx * w / 2, y, z]), P(box(0.2, 0.1, 1.2), trim, [sx * w / 2, y - 0.75, z]));
      }
    }
    for (const sx of [1, -1]) {    // пожарная лестница
      const z0 = (R() - 0.5) * (d - 3);
      for (let r = 0; r < Math.min(rows, 6); r++) p.push(P(box(0.9, 0.06, 2.2), 0x17181a, [sx * (w / 2 + 0.45), 3.6 + r * 2.6, z0]), P(box(0.05, 2.7, 0.05), 0x17181a, [sx * (w / 2 + 0.88), 4.9 + r * 2.6, z0 + 1.05]), P(box(0.05, 0.05, 2.9), 0x17181a, [sx * (w / 2 + 0.6), 4.9 + r * 2.6, z0], [0.75, 0, 0]));
    }
    p.push(P(cyl(0.9, 0.9, 1.8, 8), 0x2a2420, [w * 0.2, h + 2, d * 0.15]), P(cone(1, 0.6, 8), 0x1e1a18, [w * 0.2, h + 3.2, d * 0.15]), P(box(1.4, 0.9, 1.1), 0x3a3d40, [-w * 0.25, h + 0.85, -d * 0.2]), P(cyl(0.04, 0.04, 4, 4), 0x151515, [-w * 0.3, h + 2.4, d * 0.3]));
    for (const lx of [0.5, -0.5]) for (const lz of [0.5, -0.5]) p.push(P(cyl(0.06, 0.06, 1.1, 4), 0x1e1a18, [w * 0.2 + lx, h + 0.75, d * 0.15 + lz]));
    if (R() < 0.5) p.push(P(box(w * 0.45, 3, d * 0.5), col, [w * (R() - 0.5) * 0.4, h + 1.2, 0], [0, 0, (R() - 0.5) * 0.35]));
    return { parts: p, min: 12.5 + w / 2, spread: 14, grit: 0.12 };
  },
  neontower() {   // небоскрёб «Нексис-Сити» с неоновыми полосами и вывеской
    const w = 7 + R() * 5, h = 22 + R() * 26, d = 7 + R() * 6, col = pick([0x1c1e2a, 0x22202e, 0x181c26]);
    const p = [P(box(w, h, d), col, [0, h / 2, 0]), P(box(w * 0.7, 5, d * 0.7), col, [0, h + 2.5, 0]), P(box(w + 0.4, 3.2, d + 0.4), 0x101218, [0, 1.6, 0]), P(cyl(0.05, 0.05, 6, 4), 0x101218, [0, h + 8, 0])];
    const rows = Math.floor(h / 3);
    for (let r = 1; r < rows; r++) for (const sx of [1, -1]) if (R() < 0.75) p.push(P(box(0.1, 1.5, d * 0.85), pick([0x0a0c12, 0x10141e, 0x2a3a5a]), [sx * w / 2, r * 3 + 2, 0]));
    const strips = [], sign = [], c = R() < 0.5;
    for (const sx of [1, -1]) {
      strips.push(P(box(0.12, h * 0.9, 0.16), 0xffffff, [sx * (w / 2 + 0.04), h * 0.5, d * 0.46]), P(box(0.12, 0.16, d), 0xffffff, [sx * (w / 2 + 0.04), h * 0.96, 0]));
      sign.push(P(box(0.14, 2.2, d * 0.55), 0xffffff, [sx * (w / 2 + 0.3), 7 + R() * 6, 0]));
    }
    strips.push(P(sph(0.2, 6, 5), 0xffffff, [0, h + 11, 0]));
    return { parts: p, min: 12.5 + w / 2, spread: 13, grit: 0.1, kids: [{ parts: strips, pos: [0, 0, 0], mat: c ? 'cyan' : 'pink' }, { parts: sign, pos: [0, 0, 0], mat: c ? 'pink' : 'cyan', flicker: 'lamp' }] };
  },
  press() {       // промышленный пресс
    const p = [P(box(3.4, 0.5, 3.4), 0x2a2a24, [0, 0.25, 0]), P(box(0.5, 6, 0.5), 0x4a4030, [1.3, 3, 1.3]), P(box(0.5, 6, 0.5), 0x4a4030, [-1.3, 3, 1.3]), P(box(0.5, 6, 0.5), 0x4a4030, [1.3, 3, -1.3]), P(box(0.5, 6, 0.5), 0x4a4030, [-1.3, 3, -1.3]), P(box(3.6, 1, 3.6), 0x3a3428, [0, 6.3, 0]), P(box(3.62, 0.16, 3.62), 0x8a7a2a, [0, 5.9, 0])];
    return { parts: p, min: 8, spread: 6, grit: 0.3, kids: [{ parts: [P(box(2.2, 1.2, 2.2), 0x55585c, [0, 0, 0]), P(cyl(0.3, 0.3, 3, 8), 0x8a8a86, [0, 2, 0])], pos: [0, 3.4, 0], bob: { amp: 1.6, speed: 1.8 } }], fx: [{ type: 'steam', pos: [0, 0.8, 0], rate: 3 }] };
  },
  shop() {
    const w = 6 + R() * 3, d = 8 + R() * 4, col = pick([0x3a3530, 0x2e3236, 0x40382e]), aw = pick([0x5a2420, 0x24403a, 0x3a3a5a]);
    const p = [P(box(w, 4.2, d), col, [0, 2.1, 0]), P(box(w + 0.4, 0.3, d + 0.4), 0x1c1d20, [0, 4.35, 0])];
    for (const sx of [1, -1]) {
      p.push(P(box(0.1, 2, d * 0.7), 0x0b0c0e, [sx * w / 2, 1.5, 0]), P(box(1.6, 0.1, d * 0.8), aw, [sx * (w / 2 + 0.7), 3, 0], [0, 0, sx * -0.25]),
        P(box(0.14, 0.9, d * 0.6), 0x8a8472, [sx * (w / 2 + 0.05), 3.75, 0]), P(box(0.16, 2.1, 1), 0x1a1410, [sx * w / 2, 1.05, d * 0.42]));
      for (let i = 0; i < 4; i++) p.push(P(box(0.05, 0.9, 0.05), 0x222222, [sx * (w / 2 + 1.4), 2.4, -d * 0.35 + i * d * 0.23]));
    }
    return { parts: p, min: 9.5 + w / 2, spread: 3, grit: 0.15 };
  },
  car() {
    const col = pick([0x3b2a22, 0x2c3238, 0x41392c, 0x232527, 0x4a1e1a, 0x2a3a30]), burnt = R() < 0.3, c = burnt ? 0x141312 : col, van = R() < 0.3;
    const p = [P(box(1.8, 0.5, 4.2), c, [0, 0.62, 0]), P(box(1.84, 0.12, 4.3), 0x161616, [0, 0.4, 0]),
      P(box(1.7, 0.22, 1.2), c, [0, 0.95, -1.45], [0.08, 0, 0]),
      van ? P(box(1.7, 1.0, 2.9), c, [0, 1.35, 0.6]) : P(box(1.6, 0.55, 1.9), c, [0, 1.14, 0.25]),
      van ? P(box(1.72, 0.45, 0.9), 0x0c0d0f, [0, 1.5, -0.5]) : P(box(1.62, 0.4, 1.6), 0x0c0d0f, [0, 1.17, 0.25]),
      P(box(1.5, 0.06, 0.04), 0x0c0d0f, [0, 1.2, -0.72], [0.5, 0, 0]),
      P(box(0.34, 0.14, 0.05), burnt ? 0x222222 : 0xb8b4a0, [0.6, 0.72, -2.11]), P(box(0.34, 0.14, 0.05), burnt ? 0x222222 : 0xb8b4a0, [-0.6, 0.72, -2.11]),
      P(box(0.3, 0.12, 0.05), 0x5a1410, [0.62, 0.74, 2.11]), P(box(0.3, 0.12, 0.05), 0x5a1410, [-0.62, 0.74, 2.11]),
      P(box(1.9, 0.16, 0.12), 0x1a1a1a, [0, 0.42, -2.14]), P(box(1.9, 0.16, 0.12), 0x1a1a1a, [0, 0.42, 2.14])];
    if (R() < 0.4) p.push(P(box(0.06, 0.9, 1), c, [1.2, 0.95, 0.1], [0, 0.5, 0]));   // распахнутая дверь
    for (const x of [-0.9, 0.9]) for (const z of [-1.35, 1.35]) p.push(wheel(x, z));
    return { parts: p, min: 6.9, spread: 4, grit: 0.35, rotY: 1, tilt: 0.05, fx: burnt ? [{ type: 'fire', pos: [0, 1.0, -1.2], rate: 14, s: 0.9 }] : null };
  },
  bus() {
    const c = pick([0x4a4636, 0x2e3a44]);
    const p = [P(box(2.4, 2.3, 9), c, [0, 1.75, 0]), P(box(2.44, 0.7, 8.4), 0x0c0d0f, [0, 2.15, 0]), P(box(2.46, 0.14, 9.05), 0x1a1a1a, [0, 0.7, 0]), P(box(2.2, 0.1, 8.6), 0x2a2a28, [0, 2.95, 0])];
    for (let i = 0; i < 6; i++) p.push(P(box(2.46, 0.72, 0.1), c, [0, 2.15, -3.6 + i * 1.45]));
    for (const x of [-1.2, 1.2]) for (const z of [-3, 3]) p.push(wheel(x, z, 0.5));
    return { parts: p, min: 8.6, spread: 3, grit: 0.3, rotY: 0.1, tilt: 0.04 };
  },
  lamp() {
    const lit = R() < 0.55;
    const d = { parts: [P(cyl(0.08, 0.12, 7, 6), 0x1e2023, [0, 3.5, 0]), P(cyl(0.16, 0.2, 0.5, 6), 0x1e2023, [0, 0.25, 0]), P(box(1.8, 0.1, 0.1), 0x1e2023, [-0.8, 6.9, 0]), P(box(0.55, 0.14, 0.26), 0x2a2d30, [-1.6, 6.82, 0])], min: 6.4, spread: 0.4, flip: 1, tilt: lit ? 0.02 : 0.08 };
    if (lit) d.kids = [{ parts: [P(box(0.45, 0.05, 0.2), 0xffffff, [0, 0, 0])], pos: [-1.6, 6.73, 0], mat: 'warm', flicker: 'lamp' },
      { parts: [P(new THREE.ConeGeometry(2.6, 6.7, 12, 1, true), 0xffffff, [0, 0, 0])], pos: [-1.6, 3.35, 0], mat: 'beam', flicker: 'lamp' }];
    else d.fx = [{ type: 'spark', pos: [-1.6, 6.7, 0], rate: 0.25 }];
    return d;
  },
  rubble() {
    const p = [];
    for (let i = 0; i < 8; i++) p.push(P(box(0.4 + R() * 1.6, 0.3 + R() * 1, 0.4 + R() * 1.6), pick([0x2e2f31, 0x3a3833, 0x25272a]), [(R() - 0.5) * 3, 0.2 + R() * 0.5, (R() - 0.5) * 3], [R(), R() * 3, R()]));
    for (let i = 0; i < 4; i++) p.push(P(cyl(0.02, 0.02, 1.5 + R(), 4), 0x3a2a22, [(R() - 0.5) * 2, 0.8, (R() - 0.5) * 2], [R() - 0.5, 0, R() - 0.5]));
    return { parts: p, min: 7.2, spread: 6, grit: 0.3 };
  },
  clutter() {
    const k = R() * 4 | 0;
    if (k === 0) return { parts: [P(cyl(0.16, 0.2, 0.6, 8), 0x6a1e1a, [0, 0.3, 0]), P(sph(0.17, 8, 6), 0x6a1e1a, [0, 0.62, 0]), P(cyl(0.07, 0.07, 0.46, 6), 0x55181a, [0, 0.42, 0], [0, 0, PI / 2])], min: 6.2, spread: 1.2 };
    if (k === 1) return { parts: [P(cyl(0.36, 0.3, 0.95, 10), 0x2a3a30, [0, 0.48, 0]), P(cyl(0.38, 0.38, 0.06, 10), 0x1a1a1a, [0.3, 0.05, 0.4], [0.2, 0, 0]), P(box(0.3, 0.2, 0.3), 0x55503e, [-0.5, 0.1, 0.2], [0, 0.6, 0])], min: 6.3, spread: 2, fx: R() < 0.6 ? [{ type: 'fire', pos: [0, 0.9, 0], rate: 9, s: 0.5 }] : null };
    if (k === 2) return { parts: [P(box(2.2, 0.9, 0.5), 0x8a8a86, [0, 0.45, 0]), P(box(2, 0.3, 0.3), 0x7a7a76, [0, 1.0, 0]), P(box(2.22, 0.2, 0.52), 0x8a2a1a, [0, 0.6, 0])], min: 6.9, spread: 1.5, rotY: 0.2 };
    return { parts: [P(box(1.3, 0.05, 0.4), 0x4a3a2a, [0, 0.5, 0]), P(box(1.3, 0.5, 0.05), 0x4a3a2a, [0, 0.75, 0.2], [-0.2, 0, 0]), P(box(0.08, 0.5, 0.4), 0x1e2023, [0.55, 0.25, 0]), P(box(0.08, 0.5, 0.4), 0x1e2023, [-0.55, 0.25, 0])], min: 6.3, spread: 1, flipFace: 1 };
  },
  billboard() {
    const c = pick([0x4a3a2a, 0x2e3a44, 0x5a2a20]);
    const p = [P(cyl(0.18, 0.22, 9, 6), 0x2a2d30, [0, 4.5, 0]), P(box(0.4, 4, 9), c, [0, 9.5, 0]), P(box(0.5, 4.3, 0.2), 0x1e2023, [0, 9.5, 4.5]), P(box(0.5, 4.3, 0.2), 0x1e2023, [0, 9.5, -4.5]), P(box(0.5, 0.2, 9.2), 0x1e2023, [0, 11.6, 0]), P(box(0.5, 0.2, 9.2), 0x1e2023, [0, 7.4, 0])];
    for (let i = 0; i < 5; i++) p.push(P(box(0.44, 0.5 + R() * 1.5, 1 + R() * 2), 0x8a8472, [0, 8.4 + R() * 2.2, -3.5 + i * 1.7]));
    return { parts: p, min: 9, spread: 6 };
  },
  gantry() {   // рама над дорогой со светофорами
    const H = ROAD_HALF + 1.6, p = [P(cyl(0.14, 0.18, 7.6, 6), 0x1e2023, [-H, 3.8, 0]), P(cyl(0.14, 0.18, 7.6, 6), 0x1e2023, [H, 3.8, 0]), P(box(H * 2, 0.16, 0.16), 0x1e2023, [0, 7.5, 0]), P(box(H * 2, 0.06, 0.06), 0x1e2023, [0, 7.0, 0])];
    for (let i = 0; i < 8; i++) p.push(P(box(0.05, 0.6, 0.05), 0x1e2023, [-H + (i + 0.5) * H / 4, 7.25, 0], [0, 0, i % 2 ? 0.6 : -0.6]));
    for (const x of [-2.6, 2.6]) p.push(P(box(0.4, 1.1, 0.34), 0x111214, [x, 6.4, 0]), P(sph(0.12, 6, 5), 0x3a1010, [x, 6.75, 0.18]), P(sph(0.12, 6, 5), 0x3a3010, [x, 6.4, 0.18]), P(sph(0.12, 6, 5), 0x103a18, [x, 6.05, 0.18]));
    p.push(P(box(3, 0.9, 0.08), 0x1e3a2e, [0, 6.3, -0.05]), P(box(2.4, 0.12, 0.09), 0x9aa39a, [0, 6.45, -0.04]), P(box(1.6, 0.1, 0.09), 0x9aa39a, [-0.4, 6.15, -0.04]));
    return { parts: p, center: 1, recycleZ: 3, kids: [{ parts: [P(sph(0.13, 6, 5), 0xffffff, [0, 0, 0])], pos: [2.6, 6.4, 0.2], mat: 'warm', flicker: 'blink' }] };
  },
  rock() {
    const p = [], n = 1 + (R() * 3 | 0), col = pick([0x5d4f3e, 0x4c4336, 0x6a5a46, 0x3d3a34]);
    for (let i = 0; i < n; i++) { const s = 0.6 + R() * 1.8; p.push(P(ico(1, 1), col, [(R() - 0.5) * 2.5, s * 0.35, (R() - 0.5) * 2.5], [R() * 3, R() * 3, R() * 3], [s, s * (0.5 + R() * 0.5), s])); }
    return { parts: p, min: 7.6, spread: 20, grit: 0.3 };
  },
  mesa() {
    const w = 10 + R() * 14, h = 6 + R() * 12, col = pick([0x6b4a34, 0x5c4030]), dk = 0x4a3426;
    return { parts: [P(cyl(w * 0.4, w * 0.55, h, 9), col, [0, h / 2, 0]), P(cyl(w * 0.42, w * 0.42, h * 0.12, 9), dk, [0, h * 0.62, 0]), P(cyl(w * 0.5, w * 0.5, h * 0.1, 9), dk, [0, h * 0.25, 0]), P(cyl(w * 0.25, w * 0.38, h * 0.4, 7), col, [w * 0.1, h * 1.15, 0]), P(cyl(w * 0.6, w * 0.8, h * 0.2, 9), 0x6e5438, [0, h * 0.1, 0])], min: 34, spread: 26, grit: 0.25 };
  },
  cactus() {
    const h = 1.6 + R() * 2.2, col = 0x3d4a2c;
    const p = [P(cyl(0.2, 0.24, h, 8), col, [0, h / 2, 0]), P(sph(0.2, 8, 5), col, [0, h, 0])];
    if (R() < 0.8) p.push(P(cyl(0.12, 0.12, 0.6, 6), col, [0.4, h * 0.5, 0], [0, 0, PI / 2]), P(cyl(0.12, 0.13, 0.8, 6), col, [0.62, h * 0.5 + 0.4, 0]), P(sph(0.12, 6, 4), col, [0.62, h * 0.5 + 0.8, 0]));
    if (R() < 0.5) p.push(P(cyl(0.11, 0.11, 0.5, 6), col, [-0.35, h * 0.65, 0], [0, 0, PI / 2]), P(cyl(0.11, 0.12, 0.6, 6), col, [-0.55, h * 0.65 + 0.3, 0]), P(sph(0.11, 6, 4), col, [-0.55, h * 0.65 + 0.6, 0]));
    if (R() < 0.4) p.push(P(sph(0.07, 5, 4), 0x9a4a5a, [0, h + 0.2, 0]));
    return { parts: p, min: 6.8, spread: 18, grit: 0.2, rotY: 1 };
  },
  sign() {
    return { parts: [P(cyl(0.06, 0.06, 3.4, 5), 0x3a3a3a, [0, 1.7, 0]), P(box(1.8, 1, 0.06), 0x4a3a2a, [0, 3, 0]), P(box(1.5, 0.12, 0.07), 0x8a8472, [0, 3.15, 0.01]), P(box(1.1, 0.1, 0.07), 0x8a8472, [-0.2, 2.85, 0.01])], min: 6.6, spread: 2, tilt: 0.15, sway: 0.02 };
  },
  pole() {   // телеграфный столб с проводами
    const p = [P(cyl(0.1, 0.14, 8, 6), 0x3a2e22, [0, 4, 0]), P(box(2.2, 0.12, 0.12), 0x3a2e22, [0, 7.4, 0]), P(box(1.6, 0.1, 0.1), 0x3a2e22, [0, 6.8, 0])];
    for (const x of [-1, -0.5, 0.5, 1]) p.push(P(cyl(0.04, 0.05, 0.16, 5), 0x8a9a9a, [x, 7.54, 0]));
    for (const x of [-1, 1]) p.push(P(box(0.02, 0.02, 14), 0x151515, [x, 7.3, 0], [0.03, 0, 0]));
    return { parts: p, min: 7.2, spread: 0.3, tilt: 0.04 };
  },
  pumpjack() {   // нефтяная качалка
    const c = 0x3a2a22;
    const p = [P(box(1.2, 0.3, 4.5), 0x2a2a2a, [0, 0.15, 0]), P(box(0.16, 3.6, 0.16), c, [0.4, 1.8, 0.3], [0.12, 0, 0]), P(box(0.16, 3.6, 0.16), c, [-0.4, 1.8, 0.3], [0.12, 0, 0]), P(box(0.16, 3.6, 0.16), c, [0, 1.8, -0.3], [-0.12, 0, 0]), P(box(0.9, 1, 1.2), 0x2e3236, [0, 0.8, 1.7]), P(cyl(0.12, 0.12, 2.2, 6), 0x55585c, [0, 1.1, -2])];
    return { parts: p, min: 9, spread: 10, grit: 0.3, kids: [{ parts: [P(box(0.24, 0.3, 5), c, [0, 0, 0]), P(box(0.3, 1.3, 0.7), c, [0, -0.5, -2.5]), P(box(0.5, 0.8, 0.9), 0x1e1e1e, [0, -0.3, 2.3])], pos: [0, 3.6, 0], rock: { amp: 0.28, speed: 1.3 } }] };
  },
  station() {   // заброшенная заправка
    const p = [P(box(7, 3.4, 6), 0x7a6a58, [3, 1.7, 0]), P(box(7.3, 0.25, 6.3), 0x4a3a2e, [3, 3.5, 0]), P(box(0.1, 1.6, 4), 0x0c0d0f, [-0.5, 1.7, 0]), P(box(8, 0.3, 6), 0x8a3a2a, [-5, 4.6, 0]), P(box(8.1, 0.5, 6.1), 0xb8b0a0, [-5, 4.2, 0])];
    for (const z of [-2.4, 2.4]) p.push(P(cyl(0.14, 0.14, 4.2, 6), 0x55585c, [-8, 2.1, z]), P(cyl(0.14, 0.14, 4.2, 6), 0x55585c, [-2.5, 2.1, z]));
    for (const x of [-6.5, -4]) p.push(P(box(0.6, 1.6, 0.9), 0x8a3a2a, [x, 0.9, 0]), P(box(0.62, 0.4, 0.5), 0xb8b0a0, [x, 1.4, 0]), P(box(1.4, 0.2, 2), 0x5a5a58, [x, 0.1, 0]));
    p.push(P(cyl(0.1, 0.1, 9, 5), 0x55585c, [-10, 4.5, 3]), P(box(0.2, 2, 3), 0x8a3a2a, [-10, 8.5, 3]));
    return { parts: p, min: 18, spread: 3, grit: 0.25, mirror: 1 };
  },
  bones() {
    const p = [P(sph(0.22, 8, 6), 0xb8b0a0, [0, 0.18, -0.6], [0, 0, 0], [0.9, 0.8, 1.3])];
    for (let i = 0; i < 6; i++) p.push(P(new THREE.TorusGeometry(0.3 - i * 0.02, 0.025, 4, 8, PI), 0xb8b0a0, [0, 0.05, -0.2 + i * 0.22]));
    p.push(P(cyl(0.035, 0.035, 1.5, 5), 0xb8b0a0, [0, 0.08, 0.35], [PI / 2, 0, 0]), P(cone(0.04, 0.4, 5), 0xb8b0a0, [0.2, 0.4, -0.7], [0, 0, -0.9]), P(cone(0.04, 0.4, 5), 0xb8b0a0, [-0.2, 0.4, -0.7], [0, 0, 0.9]));
    return { parts: p, min: 6.4, spread: 8, rotY: 1, grit: 0.15 };
  },
  tree() {
    const h = 7 + R() * 7, col = pick([0x1a2618, 0x18221a, 0x202b1a]), bark = 0x241b13;
    const p = [P(cyl(0.2, 0.4, h, 7), bark, [0, h / 2, 0]), P(cone(0.7, 0.9, 7), bark, [0, 0.3, 0])];
    for (let i = 0; i < 3; i++) { const a = R() * 6.28, l = 2 + R() * 1.5; p.push(P(cyl(0.06, 0.14, l, 5), bark, [Math.cos(a) * l * 0.35, h * (0.5 + i * 0.13), Math.sin(a) * l * 0.35], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9])); }
    for (let i = 0; i < 6; i++) { const s = 1.4 + R() * 1.5; p.push(P(ico(1, 1), i % 3 ? col : 0x26321c, [(R() - 0.5) * 3, h * (0.62 + R() * 0.42), (R() - 0.5) * 3], [R() * 3, R() * 3, 0], [s, s * 0.75, s])); }
    return { parts: p, min: 9.5, spread: 24, grit: 0.3, sway: 0.018 };
  },
  conifer() {
    const h = 9 + R() * 8, p = [P(cyl(0.16, 0.34, h * 0.5, 6), 0x241b13, [0, h * 0.25, 0])];
    for (let i = 0; i < 6; i++) { const r = (2.6 - i * 0.38) * (h / 12); p.push(P(cone(r, h * 0.24, 8), i % 2 ? 0x152019 : 0x1a2a1e, [0, h * (0.28 + i * 0.125), 0])); }
    return { parts: p, min: 9, spread: 26, grit: 0.25, sway: 0.014 };
  },
  deadtree() {
    const h = 5 + R() * 5, col = 0x211a14;
    const p = [P(cyl(0.1, 0.3, h, 6), col, [0, h / 2, 0])];
    for (let i = 0; i < 6; i++) { const l = 1 + R() * 2, a = R() * 6.28, y = h * (0.45 + R() * 0.5); p.push(P(cyl(0.03, 0.08, l, 5), col, [Math.cos(a) * l * 0.4, y, Math.sin(a) * l * 0.4], [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0])); }
    return { parts: p, min: 7, spread: 14, grit: 0.2, sway: 0.012 };
  },
  bush() {
    const p = [];
    for (let i = 0; i < 4; i++) { const s = 0.5 + R() * 0.7; p.push(P(ico(1, 1), pick([0x1c2a18, 0x24301c, 0x2f2a1a]), [(R() - 0.5) * 1.6, s * 0.5, (R() - 0.5) * 1.6], [R() * 3, R() * 3, 0], [s, s * 0.7, s])); }
    for (let i = 0; i < 5; i++) p.push(P(cone(0.08, 0.9, 4), 0x2a3a1e, [(R() - 0.5) * 2, 0.4, (R() - 0.5) * 2], [(R() - 0.5), 0, (R() - 0.5)]));
    return { parts: p, min: 6.8, spread: 12, grit: 0.3, sway: 0.03 };
  },
  log() {
    const l = 3 + R() * 3;
    const p = [P(cyl(0.35, 0.42, l, 8), 0x2a2016, [0, 0.4, 0], [PI / 2, 0, 0]), P(cyl(0.3, 0.3, 0.04, 8), 0x6a5a40, [0, 0.4, l / 2 + 0.01], [PI / 2, 0, 0]), P(cyl(0.08, 0.1, 1, 5), 0x2a2016, [0.3, 0.8, -l * 0.2], [0, 0, -0.8]), P(sph(0.3, 6, 4), 0x34421f, [0, 0.72, 0.4], [0, 0, 0], [1, 0.4, 1.6])];
    return { parts: p, min: 8.6, spread: 8, rotY: 1, grit: 0.3 };
  },
  cabin() {
    const p = [P(box(5, 2.8, 4.5), 0x2e241a, [0, 1.4, 0]), P(box(3.2, 0.2, 5.2), 0x1e1814, [-1.4, 3.5, 0], [0, 0, 0.6]), P(box(3.2, 0.2, 5.2), 0x1e1814, [1.4, 3.5, 0], [0, 0, -0.6]), P(box(0.12, 1.9, 0.9), 0x120e0a, [2.5, 0.95, 0.8]), P(box(0.12, 0.8, 0.8), 0x0a0b0d, [2.5, 1.7, -1]), P(box(0.12, 0.8, 0.8), 0x0a0b0d, [-2.5, 1.7, -1]), P(box(0.7, 2, 0.7), 0x3a3836, [-1.5, 4, -1])];
    for (let i = 0; i < 6; i++) p.push(P(box(5.06, 0.06, 4.56), 0x1e1814, [0, 0.4 + i * 0.45, 0]));
    return { parts: p, min: 11, spread: 8, grit: 0.25, fx: [{ type: 'smoke', pos: [-1.5, 5.1, -1], rate: 3 }] };
  },
  shroom() {
    const p = [];
    for (let i = 0; i < 5; i++) { const x = (R() - 0.5) * 1.6, z = (R() - 0.5) * 1.6, h = 0.2 + R() * 0.5; p.push(P(cyl(0.04, 0.05, h, 5), 0x8a8a70, [x, h / 2, z]), P(sph(0.16 + R() * 0.1, 7, 4), 0x3a9a7a, [x, h, z], [0, 0, 0], [1, 0.5, 1])); }
    return { parts: p, min: 6.2, spread: 9, glow: 0.9 };
  },
  pine() {
    const h = 6 + R() * 6, p = [P(cyl(0.14, 0.26, h * 0.4, 6), 0x2a2019, [0, h * 0.2, 0])];
    for (let i = 0; i < 4; i++) {
      const r = (2.2 - i * 0.45) * (h / 9), y = h * (0.3 + i * 0.19);
      p.push(P(cone(r, h * 0.3, 8), 0x1d2b24, [0, y, 0]), P(cone(r * 0.9, h * 0.16, 8), 0xc9d1d8, [0, y + h * 0.085, 0]));
    }
    return { parts: p, min: 8.4, spread: 26, grit: 0.15, sway: 0.012 };
  },
  tower() {
    const p = [];
    for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) p.push(P(cyl(0.09, 0.09, 7, 5), 0x3a3d40, [x, 3.5, z]));
    p.push(P(box(3, 0.15, 3), 0x3a3530, [0, 7, 0]), P(box(3, 1.1, 0.1), 0x4a4d48, [0, 7.6, 1.45]), P(box(3, 1.1, 0.1), 0x4a4d48, [0, 7.6, -1.45]), P(box(0.1, 1.1, 3), 0x4a4d48, [1.45, 7.6, 0]),
      P(box(0.1, 1.1, 3), 0x4a4d48, [-1.45, 7.6, 0]), P(box(3.5, 0.14, 3.5), 0x2d3033, [0, 9.4, 0]), P(box(3.5, 0.12, 3.5), 0xc9d1d8, [0, 9.53, 0]),
      P(box(0.08, 4, 0.08), 0x3a3d40, [0, 3.5, 1.2], [0, 0, 0.6]), P(box(0.08, 4, 0.08), 0x3a3d40, [1.2, 3.5, 0], [0.6, 0, 0]), P(box(0.08, 4, 0.08), 0x3a3d40, [0, 3.5, -1.2], [0, 0, -0.6]));
    for (const x of [-1.35, 1.35]) for (const z of [-1.35, 1.35]) p.push(P(cyl(0.06, 0.06, 2.4, 4), 0x3a3d40, [x, 8.2, z]));
    for (let i = 0; i < 9; i++) p.push(P(box(0.5, 0.04, 0.04), 0x3a3d40, [-1.2, 0.6 + i * 0.75, 1.3]));
    // луч прожектора: вершина конуса на вышке, основание на земле; качается из стороны в сторону
    const kids = [{ parts: [P(new THREE.ConeGeometry(4.5, 26, 14, 1, true), 0xffffff, [0, -5.1, 12], [-PI / 2 + 0.4, 0, 0])], pos: [0, 8.5, 0], spin: 0.55, mat: 'beam' },
      { parts: [P(sph(0.22, 6, 5), 0xffffff, [0, 0, 0])], pos: [0, 8.5, 0], mat: 'warm' }];
    return { parts: p, min: 8.5, spread: 8, kids };
  },
  crates() {
    const p = [], n = 2 + (R() * 4 | 0);
    for (let i = 0; i < n; i++) { const s = 0.9 + R() * 0.5, y = i > 2 ? 1 : 0, x = (R() - 0.5) * 2.2, z = (R() - 0.5) * 2.2; p.push(P(box(s, s, s), pick([0x4a4e3c, 0x3d4234, 0x55503e]), [x, s / 2 + y, z], [0, R(), 0]), P(box(s * 1.04, 0.08, s * 1.04), 0xc9d1d8, [x, s + y + 0.03, z])); }
    p.push(P(cyl(0.4, 0.4, 1.1, 10), 0x3a4a3a, [1.8, 0.55, 0.5]), P(cyl(0.4, 0.4, 1.1, 10), 0x4a3a2a, [2.1, 0.4, -0.5], [PI / 2, 0, 0.4]));
    return { parts: p, min: 7.6, spread: 8, grit: 0.15 };
  },
  fence() {
    const p = [];
    for (let i = 0; i < 6; i++) p.push(P(cyl(0.05, 0.05, 2.8, 5), 0x3a3d40, [0, 1.4, -7.5 + i * 3]), P(box(0.05, 0.05, 0.6), 0x3a3d40, [0.15, 2.85, -7.5 + i * 3], [0, 0, 0.6]));
    for (let j = 0; j < 5; j++) p.push(P(box(0.025, 0.025, 15), 0x55585c, [0, 0.4 + j * 0.55, 0]));
    for (let j = 0; j < 7; j++) p.push(P(box(0.02, 3.2, 0.02), 0x55585c, [0, 1.4, -6.5 + j * 2.1], [0.75, 0, 0]));
    p.push(P(box(0.05, 0.5, 0.7), 0xb09a40, [0.03, 1.6, 1]));
    return { parts: p, min: 6.4, spread: 0.6 };
  },
  bunker() {
    const w = 6 + R() * 4;
    return { parts: [P(box(w, 3, 7), 0x5a5e60, [0, 1.5, 0]), P(box(w + 0.6, 0.5, 7.6), 0x4a4e50, [0, 0.25, 0]), P(box(w + 0.4, 0.3, 7.4), 0xc9d1d8, [0, 3.15, 0]), P(box(0.12, 0.5, 3), 0x0c0d0f, [w / 2, 2, 0]), P(box(0.12, 0.5, 3), 0x0c0d0f, [-w / 2, 2, 0]), P(box(0.14, 2, 1.2), 0x2e3236, [w / 2, 1, 2.5]), P(box(0.14, 2, 1.2), 0x2e3236, [-w / 2, 1, 2.5]), P(cyl(0.2, 0.2, 2.5, 6), 0x3a3d40, [w * 0.3, 4.3, 2]), P(box(1.2, 0.8, 1.2), 0x3a3d40, [-w * 0.2, 3.7, -2])], min: 10 + w / 2, spread: 10, grit: 0.1, fx: [{ type: 'smoke', pos: [w * 0.3, 5.6, 2], rate: 4, white: 1 }] };
  },
  hangar() {
    const p = [P(new THREE.CylinderGeometry(6, 6, 16, 14, 1, false, PI / 2, PI), 0x5a6468, [0, 0, 0], [PI / 2, 0, 0]), P(box(12, 0.3, 16.2), 0x4a4e50, [0, 0.15, 0]), P(box(5, 4.5, 0.2), 0x2e3236, [0, 2.25, 8.02]), P(box(5, 4.5, 0.2), 0x2e3236, [0, 2.25, -8.02])];
    for (let i = 0; i < 5; i++) p.push(P(new THREE.TorusGeometry(6.05, 0.1, 4, 14, PI), 0x3a3d40, [0, 0, -7 + i * 3.5]));
    p.push(P(new THREE.CylinderGeometry(6.1, 6.1, 15.6, 14, 1, true, PI * 0.85, PI * 0.3), 0xc9d1d8, [0, 0.02, 0], [PI / 2, 0, 0]));
    return { parts: p, min: 17, spread: 8, grit: 0.12 };
  },
  radar() {
    const p = [P(box(3, 2.6, 3), 0x5a5e60, [0, 1.3, 0]), P(box(3.2, 0.2, 3.2), 0xc9d1d8, [0, 2.7, 0]), P(cyl(0.2, 0.3, 2.4, 6), 0x3a3d40, [0, 3.9, 0])];
    const dish = [P(new THREE.SphereGeometry(2.1, 12, 6, 0, PI * 2, 0, PI * 0.36), 0x8a9296, [0, 0, 1.6], [-PI / 2, 0, 0]), P(cyl(0.04, 0.04, 2, 4), 0x3a3d40, [0, 0, -0.8], [PI / 2, 0, 0]), P(sph(0.14, 6, 4), 0x2a2d30, [0, 0, -1.8]), P(box(0.3, 0.3, 0.8), 0x3a3d40, [0, 0, 0.3])];
    return { parts: p, min: 10, spread: 9, kids: [{ parts: dish, pos: [0, 5.3, 0], spin: 0.9 }, { parts: [P(sph(0.12, 6, 4), 0xffffff, [0, 0, 0])], pos: [1.4, 2.95, 1.4], mat: 'red', flicker: 'blink' }] };
  },
  truck() {
    const c = pick([0x3d4234, 0x4a4e3c]);
    const p = [P(box(2.3, 0.3, 6.6), 0x1e1e1e, [0, 0.9, 0]), P(box(2.2, 1.5, 1.8), c, [0, 1.8, -2.3]), P(box(2.22, 0.6, 0.1), 0x0c0d0f, [0, 2.1, -3.2]), P(box(2.3, 1.7, 4.2), 0x55584a, [0, 1.95, 1.1]), P(box(2.34, 0.14, 4.3), 0xc9d1d8, [0, 2.87, 1.1]), P(box(2.2, 0.5, 0.9), c, [0, 1.3, -3.1])];
    for (const x of [-1.1, 1.1]) for (const z of [-2.4, 0.9, 2.3]) p.push(wheel(x, z, 0.5));
    return { parts: p, min: 8.4, spread: 5, grit: 0.2, rotY: 0.1 };
  },
  mast() {
    const p = [];
    for (let i = 0; i < 6; i++) { const y = i * 2.4, w = 1 - i * 0.13; p.push(P(box(w, 0.06, w), 0x8a2a1a, [0, y + 2.4, 0]), P(box(0.06, 2.6, 0.06), i % 2 ? 0xb8b8b8 : 0x8a2a1a, [w / 2, y + 1.2, w / 2]), P(box(0.06, 2.6, 0.06), i % 2 ? 0xb8b8b8 : 0x8a2a1a, [-w / 2, y + 1.2, -w / 2]), P(box(0.05, 2.9, 0.05), 0x55585c, [0, y + 1.2, w / 2], [0, 0, 0.4])); }
    p.push(P(cyl(0.04, 0.04, 3, 4), 0x55585c, [0, 15.8, 0]), P(box(1.2, 1, 1.2), 0x5a5e60, [1, 0.5, 0]));
    return { parts: p, min: 9, spread: 12, kids: [{ parts: [P(sph(0.16, 6, 4), 0xffffff, [0, 0, 0])], pos: [0, 14.5, 0], mat: 'red', flicker: 'blink' }] };
  },
  pillar() {
    const h = 14 + R() * 6;
    const p = [P(cyl(0.9, 1.1, h, 12), 0x232a2a, [0, h / 2, 0]), P(cyl(1.4, 1.5, 0.6, 12), 0x1a2020, [0, 0.3, 0])];
    for (let i = 0; i < 5; i++) p.push(P(cyl(1.15, 1.15, 0.25, 12), 0x2e3838, [0, 1 + i * 3.2, 0]));
    p.push(P(box(0.1, h, 0.2), 0x2f6a54, [1.02, h / 2, 0]), P(box(0.1, h, 0.2), 0x2f6a54, [-1.02, h / 2, 0]));
    for (let i = 0; i < 4; i++) p.push(P(cyl(0.06, 0.06, h * 0.7, 5), 0x151a1a, [Math.cos(i * 1.6) * 1.05, h * 0.4, Math.sin(i * 1.6) * 1.05]));
    return { parts: p, min: 7.6, spread: 16 };
  },
  tank() {
    const h = 3.4, g = pick([0x2f8f6a, 0x3aa87a, 0x2a7a70]);
    const p = [P(cyl(1.1, 1.2, 0.5, 14), 0x2a3030, [0, 0.25, 0]), P(cyl(0.95, 0.95, h, 14), g, [0, 0.5 + h / 2, 0]), P(cyl(1.1, 1.0, 0.5, 14), 0x2a3030, [0, h + 0.75, 0]),
      P(cyl(0.12, 0.12, 1.6, 6), 0x1a2020, [0.6, h + 1.6, 0], [0, 0, 0.5]), P(box(0.6, 0.4, 0.5), 0x1a2020, [1.4, 0.2, 0]), P(cyl(1.0, 1.0, 0.12, 14), 0x1a2020, [0, 1.6, 0]), P(cyl(1.0, 1.0, 0.12, 14), 0x1a2020, [0, 2.9, 0])];
    const broken = R() < 0.3;
    if (broken) p.push(P(box(0.6, 1.4, 0.1), 0x0a100e, [0.7, 2, 0.8], [0.2, 0.7, 0]));
    return { parts: p, min: 6.8, spread: 10, glow: 0.4, pulse: 1, fx: [{ type: broken ? 'steam' : 'bubble', pos: [0, broken ? 1.5 : 1, 0], rate: broken ? 6 : 4 }] };
  },
  pipe() {
    const p = [P(cyl(0.45, 0.45, 16, 10), 0x303a3a, [0, 2.6, 0], [PI / 2, 0, 0]), P(cyl(0.2, 0.2, 16, 6), 0x3a2e22, [0.7, 2.2, 0], [PI / 2, 0, 0])];
    for (let i = 0; i < 4; i++) p.push(P(cyl(0.55, 0.55, 0.3, 10), 0x3d4848, [0, 2.6, -6 + i * 4], [PI / 2, 0, 0]), P(box(0.2, 2.6, 0.2), 0x232a2a, [0, 1.3, -6 + i * 4]), P(box(1.4, 0.2, 0.3), 0x232a2a, [0.3, 2, -6 + i * 4]));
    p.push(P(cyl(0.2, 0.2, 0.1, 8), 0x8a2a1a, [0, 3.2, 2]), P(cyl(0.04, 0.04, 0.3, 4), 0x8a2a1a, [0, 3.1, 2]));
    return { parts: p, min: 6.8, spread: 3, fx: [{ type: 'steam', pos: [0, 3.1, -2 + R() * 4], rate: 7 }] };
  },
  hive() {
    const p = [], col = pick([0x3a1f1c, 0x2e1a1a, 0x40261e]);
    for (let i = 0; i < 7; i++) { const s = 0.5 + R() * 1.4; p.push(P(sph(1, 9, 7), col, [(R() - 0.5) * 2.6, s * 0.5 + R() * 1.5, (R() - 0.5) * 2.6], [0, 0, 0], [s, s * (0.7 + R() * 0.8), s])); }
    for (let i = 0; i < 5; i++) { const a = R() * 6.28; p.push(P(cyl(0.05, 0.14, 3, 5), 0x2a1614, [Math.cos(a) * 1.8, 0.5, Math.sin(a) * 1.8], [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2])); }
    for (let i = 0; i < 4; i++) p.push(P(sph(0.22, 6, 5), 0x7ac04a, [(R() - 0.5) * 2.4, 0.6 + R() * 1.6, (R() - 0.5) * 2.4]));
    return { parts: p, min: 7.2, spread: 12, grit: 0.3, glow: 0.25, pulse: 1 };
  },
  rack() {   // серверные стойки с огоньками
    const p = [], lights = [];
    for (let i = 0; i < 3; i++) {
      p.push(P(box(1, 2.6, 1.1), 0x1a2020, [0, 1.3, -1.3 + i * 1.3]), P(box(1.02, 0.04, 1.12), 0x2e3838, [0, 2.6, -1.3 + i * 1.3]));
      for (let j = 0; j < 7; j++) { p.push(P(box(0.04, 0.22, 0.95), 0x0c1010, [-0.5, 0.4 + j * 0.32, -1.3 + i * 1.3])); if (R() < 0.6) lights.push(P(box(0.03, 0.05, 0.08), 0xffffff, [-0.53, 0.42 + j * 0.32, -1.6 + i * 1.3 + R() * 0.6])); }
    }
    p.push(P(cyl(0.05, 0.05, 4, 5), 0x151a1a, [0.2, 2.9, 0], [PI / 2, 0, 0]));
    if (!lights.length) lights.push(P(box(0.03, 0.05, 0.08), 0xffffff, [-0.53, 1, 0]));
    return { parts: p, min: 6.6, spread: 5, faceRoad: 1, kids: [{ parts: lights, pos: [0, 0, 0], mat: 'green', flicker: 'blink' }] };
  },
  fan() {    // стена с большим вентилятором
    const p = [P(box(0.6, 7, 7), 0x232a2a, [0.3, 3.5, 0]), P(new THREE.TorusGeometry(2.6, 0.2, 6, 18), 0x2e3838, [0, 3.6, 0], [0, PI / 2, 0]), P(box(0.1, 0.12, 5.2), 0x151a1a, [-0.1, 3.6, 0]), P(box(0.1, 5.2, 0.12), 0x151a1a, [-0.1, 3.6, 0])];
    const blades = [];
    for (let i = 0; i < 5; i++) blades.push(P(box(0.06, 2.3, 0.7), 0x3d4848, [0, Math.cos(i * 1.2566) * 1.2, Math.sin(i * 1.2566) * 1.2], [i * 1.2566, 0, 0]));
    blades.push(P(cyl(0.3, 0.3, 0.2, 8), 0x151a1a, [0, 0, 0], [0, 0, PI / 2]));
    return { parts: p, min: 8, spread: 4, faceRoad: 1, kids: [{ parts: blades, pos: [0.05, 3.6, 0], spinX: 2.5 }] };
  },
  arch() {   // ребро свода над дорогой
    const H = ROAD_HALF + 2, p = [];
    for (let i = 0; i < 10; i++) { const am = (i + 0.5) / 10 * PI; p.push(P(box(H * 0.34, 0.5, 0.7), 0x232a2a, [-Math.cos(am) * H, Math.sin(am) * 8, 0], [0, 0, -(am - PI / 2)])); }
    p.push(P(box(1, 1.2, 1.2), 0x1a2020, [-H, 0.6, 0]), P(box(1, 1.2, 1.2), 0x1a2020, [H, 0.6, 0]), P(box(0.1, 3, 0.1), 0x151a1a, [-2, 6.3, 0]), P(box(0.1, 3, 0.1), 0x151a1a, [2.4, 6.5, 0]), P(box(0.9, 0.3, 0.5), 0x2e3838, [-2, 4.7, 0]));
    return { parts: p, center: 1, recycleZ: 3, kids: [{ parts: [P(box(0.7, 0.08, 0.3), 0xffffff, [0, 0, 0])], pos: [-2, 4.52, 0], mat: 'cyan', flicker: 'lamp' }, { parts: [P(sph(0.14, 6, 4), 0xffffff, [0, 0, 0])], pos: [H - 0.5, 1.4, 0.4], mat: 'red', flicker: 'blink' }] };
  },
  pod() {
    const p = [P(cyl(0.9, 1, 0.4, 10), 0x1a2020, [0, 0.2, 0]), P(new THREE.CapsuleGeometry(0.7, 1.4, 5, 10), 0x2a7a70, [0, 1.6, 0]), P(box(0.5, 0.7, 0.3), 0x2e3838, [0.9, 0.5, 0]), P(new THREE.TorusGeometry(0.72, 0.06, 5, 12), 0x1a2020, [0, 1.6, 0], [PI / 2, 0, 0])];
    return { parts: p, min: 6.5, spread: 5, glow: 0.5, pulse: 1 };
  },
};

function buildProps(list) {
  for (const o of W.props) {
    G.scene.remove(o);
    o.traverse(m => { if (m.isMesh && m.userData.own) { m.geometry.dispose(); if (m.material.userData.own) m.material.dispose(); } });
  }
  W.props.length = 0; W.live.length = 0;
  for (const [kind, count] of list) {
    const variants = [];
    for (let v = 0; v < Math.min(4, count); v++) {
      const def = PROP[kind]();
      let mat = MAT.prop;
      if (def.glow) { mat = MAT.prop.clone(); mat.emissive = new THREE.Color(0x1a6a48); mat.emissiveIntensity = def.glow; mat.userData.own = true; mat.userData.glow = def.glow; }
      const kids = (def.kids || []).map(k => ({ k, geo: merge(k.parts, 0.05) }));
      variants.push({ def, geo: merge(def.parts, def.grit || 0.08), mat, kids });
    }
    for (let i = 0; i < count; i++) {
      const v = variants[i % variants.length], def = v.def, own = i < variants.length;
      const body = new THREE.Mesh(v.geo, v.mat);
      body.castShadow = true; body.receiveShadow = true; body.userData.own = own;
      let m = body;
      const u = { own, min: def.min, spread: def.spread, side: i % 2 ? 1 : -1, center: !!def.center, recycleZ: def.recycleZ ?? 26, sway: def.sway || 0, ph: R() * 6.28, fx: def.fx || null, acc: 0, kids: [], pulse: def.pulse ? v.mat : null, rz: 0 };
      if (v.kids.length) {
        m = new THREE.Group(); m.add(body);
        for (const kd of v.kids) {
          const km = new THREE.Mesh(kd.geo, kd.k.mat ? KM[kd.k.mat] : MAT.prop);
          km.position.set(...kd.k.pos); km.userData.own = own;
          if (!kd.k.mat) km.castShadow = true;
          m.add(km); u.kids.push({ m: km, k: kd.k, ph: R() * 6.28 });
        }
      }
      const side = u.side;
      m.position.set(u.center ? 0 : side * (def.min + R() * def.spread), 0, -215 + (i + R()) * (240 / count));
      if (def.rotY) m.rotation.y = (R() - 0.5) * 6.28 * def.rotY;
      if ((def.flip || def.mirror || def.faceRoad) && side < 0) m.rotation.y = PI;
      if (def.flipFace) m.rotation.y = side > 0 ? -PI / 2 : PI / 2;
      if (def.tilt) { m.rotation.z = (R() - 0.5) * def.tilt * 2; m.rotation.x = (R() - 0.5) * def.tilt * 2; }
      u.rz = m.rotation.z;
      m.userData = u;
      G.scene.add(m); W.props.push(m);
      if (u.kids.length || u.fx || u.sway) W.live.push(m);
    }
  }
}

// ---------- Горизонт: далёкие силуэты ----------
function backdrop(key, fogHex) {
  const fog = new THREE.Color(fogHex), dk = h => fog.clone().multiplyScalar(h).getHex(), p = [];
  const Z = -250;
  if (key === 'city') {
    for (let x = -300; x < 300; x += 9 + R() * 8) {
      const w = 8 + R() * 10, h = 18 + R() * 70, z = Z - R() * 40;
      p.push(P(box(w, h, 10), dk(0.5 + R() * 0.2), [x, h / 2, z]));
      if (R() < 0.4) p.push(P(box(w * 0.4, 8, 4), dk(0.5), [x, h + 4, z]), P(box(0.4, 14, 0.4), dk(0.45), [x, h + 14, z]));
      for (let k = 0; k < 5; k++) if (R() < 0.5) p.push(P(box(0.9, 0.9, 0.2), 0x7a6a3a, [x + (R() - 0.5) * w * 0.8, R() * h * 0.9 + 2, z + 5.2]));
    }
  } else if (key === 'desert') {
    for (let x = -320; x < 320; x += 40 + R() * 40) { const w = 30 + R() * 40, h = 18 + R() * 30; p.push(P(cyl(w * 0.4, w * 0.6, h, 8), dk(0.62), [x, h / 2, Z - R() * 30]), P(cyl(w * 0.2, w * 0.32, h * 0.4, 6), dk(0.6), [x + w * 0.1, h * 1.15, Z - 10])); }
    for (let x = -300; x < 300; x += 12) p.push(P(cyl(6, 14, 4 + R() * 5, 6), dk(0.72), [x, 2, Z + 20]));
  } else if (key === 'forest') {
    for (let x = -300; x < 300; x += 5 + R() * 5) { const h = 28 + R() * 30; p.push(P(cone(7 + R() * 4, h, 6), dk(0.42 + R() * 0.2), [x, h / 2, Z + 60 - R() * 60])); }
  } else if (key === 'snow') {
    for (let x = -340; x < 340; x += 50 + R() * 50) { const r = 60 + R() * 50, h = 50 + R() * 60, z = Z - 30 - R() * 40, ry = R() * 3; p.push(P(cone(r, h, 7), dk(0.7), [x, h / 2, z], [0, ry, 0]), P(cone(r * 0.42, h * 0.42, 7), dk(1.22), [x, h * 0.795, z], [0, ry, 0])); }
    for (let x = -300; x < 300; x += 7) { const h = 12 + R() * 10; p.push(P(cone(3.5, h, 5), dk(0.5), [x, h / 2, Z + 70])); }
  } else {
    for (let x = -300; x < 300; x += 22 + R() * 10) { const h = 80 + R() * 40; p.push(P(cyl(5, 6, h, 8), dk(0.55), [x, h / 2, Z + 50 - R() * 60])); }
    for (let i = 0; i < 6; i++) p.push(P(box(700, 3, 5), dk(0.5), [0, 18 + i * 14, Z - 10 + i * 6]));
    for (let x = -280; x < 280; x += 35) p.push(P(sph(3, 6, 5), 0x3a9a70, [x + R() * 10, 12 + R() * 50, Z + 30]));
  }
  return merge(p);
}

function paintSky(horizon, zenith) {
  const g = W.sky.geometry, pos = g.attributes.position, col = g.attributes.color, a = new THREE.Color(horizon), b = new THREE.Color(zenith), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.pow(Math.max(0, Math.min(1, pos.getY(i) / 330 * 1.6)), 0.55);
    c.copy(a).lerp(b, t); col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// ---------- Инициализация ----------
export function initWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 20, 100);
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 700);
  G.renderer = renderer; G.scene = scene; G.camera = camera;

  W.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1); scene.add(W.hemi);
  const sun = W.sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(-7, 30, 14); sun.target.position.set(0, 0, -14);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 34; sc.bottom = -30; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // небо, светило, горизонт
  const sg = new THREE.SphereGeometry(330, 24, 14);
  sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sg.attributes.position.count * 3), 3));
  W.sky = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  W.sky.renderOrder = -10; W.sky.position.set(0, -4, -40); W.sky.frustumCulled = false; scene.add(W.sky);
  W.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false }));
  W.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  W.disc.renderOrder = -9; scene.add(W.disc, W.halo);
  W.back = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  W.back.frustumCulled = false; scene.add(W.back);

  W.ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 1 }));
  W.ground.rotation.x = -PI / 2; W.ground.position.set(0, -0.03, -100); W.ground.receiveShadow = true; scene.add(W.ground);
  W.road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 0.6, 250), new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.92 }));
  W.road.rotation.x = -PI / 2; W.road.position.set(0, 0, -100); W.road.receiveShadow = true; scene.add(W.road);
  const cg = merge([P(box(0.3, 0.16, 250), 0x8a8a88, [-ROAD_HALF - 0.45, 0.05, -100]), P(box(0.3, 0.16, 250), 0x8a8a88, [ROAD_HALF + 0.45, 0.05, -100])]);
  W.curb = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); W.curb.receiveShadow = true; scene.add(W.curb);

  for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xff7a30, 0, 20, 1.7); l.position.set(0, -50, 0); scene.add(l); W.fireLights.push(l); }

  const N = 420, pos = new Float32Array(N * 3);
  W.dustVel = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = rand(-26, 26); pos[i * 3 + 1] = rand(0, 14); pos[i * 3 + 2] = rand(-60, 12); W.dustVel[i] = rand(0.5, 1.5); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  W.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.11, transparent: true, opacity: 0.6, depthWrite: false }));
  W.dust.frustumCulled = false; scene.add(W.dust);

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    G.portrait = camera.aspect < 0.85;
    camera.fov = G.portrait ? 72 : 55; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize); resize();
}

export function setBiome(key) {
  if (W.biome === key) return;
  W.biome = key;
  const b = W.b = BIOMES[key], s = G.scene;
  s.fog.color.set(b.fog); s.fog.near = b.near; s.fog.far = b.far; s.background.set(b.fog);
  W.ground.material.color.set(b.ground); W.road.material.color.set(b.road); W.curb.material.color.set(b.road);
  W.sun.color.set(b.sun); W.sun.intensity = b.sunI;
  W.hemi.color.set(b.sky); W.hemi.groundColor.set(b.gnd); W.hemi.intensity = b.hemiI;
  W.dust.material.color.set(b.dust); W.dustDir = b.dustDir;
  W.dust.material.size = key === 'snow' ? 0.16 : 0.1;
  W.flash = 0; W.wind = 0;
  paintSky(b.fog, b.zenith);
  W.disc.visible = W.halo.visible = !!b.disc;
  if (b.disc) {
    W.disc.material.color.set(b.disc.c); W.halo.material.color.set(b.disc.c);
    W.disc.position.set(b.disc.x, b.disc.y, -300); W.disc.scale.setScalar(b.disc.r);
    W.halo.position.set(b.disc.x, b.disc.y, -299); W.halo.scale.setScalar(b.disc.r * 9);
  }
  W.back.geometry.dispose(); W.back.geometry = backdrop(b.back || key, b.fog);
  W.fogK = 1; W.tint = 0; W.fogKT = 1; W.tintT = 0;
  buildProps(b.props);
  setAmbient(key);
}

// События забега: туман (fogK < 1 — видимость хуже) и кровавая луна (tint 0..1)
export function setMood(fogK, tint) { W.fogKT = fogK; W.tintT = tint; }
// Вспышка молнии: кратко высветляет небо и сцену
export function skyFlash(v) { W.flash = Math.max(W.flash, v); }
export const worldInfo = W;

const _fc = new THREE.Color(), WHITE = new THREE.Color(0xbfd0ff), RED = new THREE.Color(0xc0281c);
export function updateWorld(dt) {
  const d = G.scroll * dt, t = G.time, b = W.b;
  W.road.material.map.offset.y += d / (250 / 24);
  W.ground.material.map.offset.y += d / 10;
  for (const m of W.props) {
    m.position.z += d;
    const u = m.userData;
    if (m.position.z > u.recycleZ) {
      m.position.z -= 240 + Math.random() * 6;
      if (!u.center) m.position.x = u.side * (u.min + Math.random() * u.spread);
    }
    if (u.pulse && u.own) u.pulse.emissiveIntensity = u.pulse.userData.glow * (0.75 + Math.sin(t * 1.7 + u.ph) * 0.25);
  }
  // живые декорации: качание, вращение, мерцание, огонь и пар
  let f1 = null, f2 = null;
  for (const m of W.live) {
    const z = m.position.z; if (z < -110 || z > 14) continue;
    const u = m.userData;
    if (u.sway) m.rotation.z = u.rz + Math.sin(t * 1.1 + u.ph) * u.sway + Math.sin(t * 2.7 + u.ph * 2) * u.sway * 0.4;
    for (const kd of u.kids) {
      const k = kd.k;
      if (k.spin) kd.m.rotation.y = k.mat ? Math.sin(t * k.spin + kd.ph) * 1.2 : t * k.spin + kd.ph;
      if (k.spinX) kd.m.rotation.x = t * k.spinX + kd.ph;
      if (k.rock) kd.m.rotation.x = Math.sin(t * k.rock.speed + kd.ph) * k.rock.amp;
      if (k.bob) kd.m.position.y = k.pos[1] - Math.pow(Math.max(0, Math.sin(t * k.bob.speed + kd.ph)), 6) * k.bob.amp;
      if (k.flicker === 'blink') kd.m.visible = Math.sin(t * 3.2 + kd.ph) > 0.2;
      else if (k.flicker === 'lamp') kd.m.visible = Math.sin(t * 31 + kd.ph * 7) + Math.sin(t * 7.3 + kd.ph) > -1.25;
    }
    if (u.fx && z > -80 && z < 10) {
      const cy = Math.cos(m.rotation.y), sy = Math.sin(m.rotation.y);
      for (const f of u.fx) {
        const x = m.position.x + f.pos[0] * cy + f.pos[2] * sy, y = f.pos[1], zz = z - f.pos[0] * sy + f.pos[2] * cy;
        if (f.type === 'fire') { if (!f1 || Math.abs(zz + 10) < Math.abs(f1[2] + 10)) { f2 = f1; f1 = [x, y, zz]; } else if (!f2) f2 = [x, y, zz]; }
        u.acc += dt * f.rate;
        while (u.acc >= 1) {
          u.acc -= 1;
          if (f.type === 'fire') fire(x, y, zz, f.s || 1);
          else if (f.type === 'steam') steam(x, y, zz, -Math.sign(m.position.x));
          else if (f.type === 'smoke') { const v = f.white ? 0.6 : 0.1; emitSolid(x, y, zz, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), rand(2, 3.5), 0.5, v, v, v, 0.3, -0.3, 0.9); }
          else if (f.type === 'bubble') emitGlow(x + rand(-0.6, 0.6), y + rand(0, 0.5), zz + rand(-0.6, 0.6), 0, rand(0.6, 1.4), 0, rand(1, 2), rand(0.08, 0.16), 0.5, 1, 0.75, 0.6, -0.1);
          else if (f.type === 'spark') sparks(x, y, zz, 5, 0.7, 0.85, 1);
        }
      }
    }
  }
  const fl = [f1, f2];
  for (let i = 0; i < 2; i++) {
    const l = W.fireLights[i], f = fl[i];
    if (f) { l.position.set(f[0], f[1] + 1, f[2]); l.intensity = 34 + Math.sin(t * 17 + i * 3) * 9 + Math.sin(t * 43) * 5; } else l.intensity = 0;
  }
  // плавная смена настроения (туман, кровавая луна)
  if (W.fogK !== W.fogKT || W.tint !== W.tintT) {
    const kk = Math.min(1, dt * 0.8);
    W.fogK += (W.fogKT - W.fogK) * kk; W.tint += (W.tintT - W.tint) * kk;
    if (Math.abs(W.fogK - W.fogKT) < 0.005) W.fogK = W.fogKT;
    if (Math.abs(W.tint - W.tintT) < 0.005) W.tint = W.tintT;
    G.scene.fog.near = b.near * W.fogK; G.scene.fog.far = b.far * W.fogK;
    _fc.set(b.sky).lerp(RED, W.tint * 0.75); W.hemi.color.copy(_fc);
    _fc.set(b.sun).lerp(RED, W.tint * 0.6); W.sun.color.copy(_fc);
    if (b.disc) { _fc.set(b.disc.c).lerp(RED, W.tint); W.disc.material.color.copy(_fc); W.halo.material.color.copy(_fc); }
  }
  // молния
  if (W.flash > 0) {
    W.flash = Math.max(0, W.flash - dt * 5);
    const k = W.flash * (0.6 + Math.random() * 0.4);
    W.hemi.intensity = b.hemiI + k * 7;
    _fc.set(b.fog).lerp(WHITE, k * 0.45); G.scene.fog.color.copy(_fc); G.scene.background.copy(_fc);
  }
  const p = W.dust.geometry.attributes.position, a = p.array, dir = W.dustDir, wind = W.wind;
  for (let i = 0; i < a.length / 3; i++) {
    const v = W.dustVel[i];
    a[i * 3 + 1] += dir * v * dt; a[i * 3 + 2] += d * 0.8 + v * dt * 0.6; a[i * 3] += Math.sin(t * v + i) * dt * 0.3 + wind * v * dt;
    if (a[i * 3 + 2] > 12) a[i * 3 + 2] -= 72;
    if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 14; else if (a[i * 3 + 1] > 14) a[i * 3 + 1] -= 14;
    if (a[i * 3] > 26) a[i * 3] -= 52; else if (a[i * 3] < -26) a[i * 3] += 52;
  }
  p.needsUpdate = true;
}
