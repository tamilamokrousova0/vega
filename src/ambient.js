// Живой мир: птицы, перекати-поле, бродячие заражённые у обочин, погода, вертолёт
import * as THREE from '../vendor/three.module.min.js';
import { G, rand } from './state.js';
import { P, box, cyl, sph, cone, merge, MAT, makeChar, animChar } from './models.js';
import { emitGlow, emitSolid } from './fx.js';
import { skyFlash, worldInfo } from './world.js';
import { sfx } from './audio.js';

const CFG = {
  city:   { birds: 1, strays: 9, lightning: 1, heli: 1, mist: [0.3, 0.33, 0.38], paper: 1 },
  desert: { birds: 1, strays: 5, weeds: 1, gusts: 1, heli: 0 },
  forest: { birds: 1, strays: 10, fireflies: 1, mist: [0.36, 0.44, 0.38] },
  snow:   { birds: 0, strays: 6, gusts: 1, heli: 1 },
  lab:    { birds: 0, strays: 8, mist: [0.2, 0.42, 0.34], drips: 1 },
  factory:{ birds: 1, strays: 8, mist: [0.36, 0.4, 0.24], drips: 1 },
  neon:   { birds: 0, strays: 8, lightning: 1, heli: 1, mist: [0.3, 0.24, 0.42], paper: 1 },
};
let cfg = CFG.city, key = 'city';
const birds = [], weeds = [], strays = [];
let birdMat, wingGeo, bodyGeo, weedGeo, heli = null, heliT = 12, boltT = 8, gustT = 6, gust = 0, flockT = 4, mistAcc = 0, flyAcc = 0, paperAcc = 0;

export function initAmbient() {
  birdMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.DoubleSide });
  wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.12, 0.62, 0, 0.02, 0, 0, 0.16]), 3));
  bodyGeo = new THREE.ConeGeometry(0.07, 0.42, 5); bodyGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group(), L = new THREE.Mesh(wingGeo, birdMat), Rw = new THREE.Mesh(wingGeo, birdMat);
    Rw.scale.x = -1; g.add(new THREE.Mesh(bodyGeo, birdMat), L, Rw); g.visible = false; G.scene.add(g);
    birds.push({ g, L, R: Rw, on: false, state: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ph: i });
  }
  // перекати-поле: клубок из колец
  const wp = [];
  for (let i = 0; i < 7; i++) wp.push(P(new THREE.TorusGeometry(0.42 + (i % 3) * 0.04, 0.018, 4, 10), [0x6a5638, 0x55452c, 0x7a6644][i % 3], [0, 0, 0], [i * 0.9, i * 1.7, i * 0.5]));
  weedGeo = merge(wp);
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(weedGeo, MAT.prop); m.castShadow = true; m.visible = false; G.scene.add(m); weeds.push({ m, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, s: 1 }); }
  // бродячие заражённые у обочин (не участвуют в бою)
  for (let i = 0; i < 10; i++) {
    const c = makeChar('walker'); c.root.visible = false; G.scene.add(c.root);
    strays.push({ c, on: false, x: 0, z: 0, dir: 1, t: i, speed: 1, mode: 0 });
  }
  // вертолёт
  const hp = [P(sph(1, 10, 8), 0x1a1e22, [0, 0, 0], [0, 0, 0], [1, 1, 2]), P(box(0.3, 0.35, 4), 0x1a1e22, [0, 0.2, 3.2]), P(box(0.08, 1.2, 0.7), 0x1a1e22, [0, 0.8, 5]), P(box(1.4, 0.08, 0.1), 0x111214, [0, -1.15, -0.4]),
    P(box(0.08, 0.5, 0.08), 0x111214, [0.6, -0.9, -0.4]), P(box(0.08, 0.5, 0.08), 0x111214, [-0.6, -0.9, -0.4]), P(box(0.1, 0.08, 2.6), 0x111214, [0.7, -1.2, 0]), P(box(0.1, 0.08, 2.6), 0x111214, [-0.7, -1.2, 0]), P(cyl(0.1, 0.1, 0.5, 6), 0x111214, [0, 1.1, 0])];
  const g = new THREE.Group(); g.add(new THREE.Mesh(merge(hp), MAT.gun));
  const rotor = new THREE.Mesh(merge([P(box(9, 0.04, 0.3), 0x0c0d0f, [0, 0, 0]), P(box(0.3, 0.04, 9), 0x0c0d0f, [0, 0, 0])]), MAT.gun); rotor.position.y = 1.4; g.add(rotor);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 13, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfd8e8, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  beam.position.y = -6.5; const bp = new THREE.Group(); bp.position.y = -1; bp.add(beam); g.add(bp);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); lamp.position.set(0, 0.5, 5.3); g.add(lamp);
  g.visible = false; G.scene.add(g);
  heli = { g, rotor, bp, lamp, on: false, x: 0, dir: 1 };
}

export function setAmbient(k) {
  key = k; cfg = CFG[k] || CFG.city;
  for (const b of birds) { b.on = false; b.g.visible = false; }
  for (const w of weeds) { w.on = false; w.m.visible = false; }
  strays.forEach((s, i) => { s.on = i < cfg.strays; s.c.root.visible = s.on; if (s.on) placeStray(s, -100 + i * (110 / cfg.strays)); });
  heli.on = false; heli.g.visible = false; heliT = rand(8, 16); boltT = rand(4, 9); gustT = rand(4, 8); gust = 0; flockT = 3;
  worldInfo.wind = 0;
}

function placeStray(s, z) {
  s.dir = Math.random() < 0.5 ? -1 : 1;
  s.x = s.dir * rand(6.8, 14); s.z = z; s.speed = rand(0.3, 0.9); s.mode = Math.random() < 0.35 ? 1 : 0; s.t = rand(0, 9);
  s.c.root.rotation.set(0, s.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
}

// стая на дороге впереди: сидят, пока отряд не подойдёт, потом взлетают
function spawnFlock() {
  const cx = rand(-9, 9), n = 3 + (Math.random() * 4 | 0); let k = 0;
  for (const b of birds) {
    if (b.on || k >= n) continue;
    b.on = true; b.state = 0; b.x = cx + rand(-1.6, 1.6); b.y = 0.12; b.z = -95 + rand(-2, 2); b.g.visible = true;
    b.g.rotation.set(0, rand(0, 6.28), 0); k++;
  }
}

export function updateAmbient(dt) {
  const sc = G.scroll, d = sc * dt, t = G.time, playing = G.mode === 'run' || G.mode === 'boss';

  // --- птицы
  if (cfg.birds) {
    flockT -= dt * (sc > 2 ? 1 : 0);
    if (flockT <= 0) { flockT = rand(7, 13); spawnFlock(); }
  }
  for (const b of birds) {
    if (!b.on) continue;
    b.z += d;
    if (b.state === 0) {
      const peck = Math.sin(t * 6 + b.ph * 2);
      b.L.rotation.z = b.R.rotation.z = -1.2; b.g.rotation.x = peck > 0.6 ? 0.5 : 0;
      if (b.z > -17 - b.ph % 3) {
        b.state = 1; b.vx = (b.x > 0 ? 1 : -1) * rand(3, 7) + rand(-2, 2); b.vy = rand(4, 7); b.vz = -rand(2, 9);
        b.g.rotation.x = 0; if (b.ph === 0 || Math.random() < 0.3) sfx.caw();
      }
    } else {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vy += dt * 1.5;
      const f = Math.sin(t * 22 + b.ph * 1.7) * 0.9;
      b.L.rotation.z = f; b.R.rotation.z = -f;
      b.g.rotation.y = Math.atan2(-b.vx, -b.vz);
      if (b.y > 22 || Math.abs(b.x) > 45) { b.on = false; b.g.visible = false; }
    }
    b.g.position.set(b.x, b.y, b.z);
    if (b.z > 14) { b.on = false; b.g.visible = false; }
  }

  // --- перекати-поле
  if (cfg.weeds) {
    for (const w of weeds) {
      if (!w.on) {
        if (Math.random() < dt * 0.25) { w.on = true; w.m.visible = true; const dir = Math.random() < 0.5 ? -1 : 1; w.x = -dir * 26; w.z = rand(-70, -25); w.vx = dir * rand(4, 8); w.y = 0.5; w.vy = 0; w.s = rand(0.8, 1.5); w.m.scale.setScalar(w.s); }
        continue;
      }
      w.vx += worldInfo.wind * dt * 2; w.x += w.vx * dt; w.z += d;
      w.vy -= 14 * dt; w.y += w.vy * dt;
      if (w.y < 0.46 * w.s) { w.y = 0.46 * w.s; w.vy = rand(1.5, 4); }
      w.m.position.set(w.x, w.y, w.z); w.m.rotation.z -= w.vx * dt / (0.46 * w.s); w.m.rotation.x += dt * 0.7;
      if (Math.abs(w.x) > 30 || w.z > 14) { w.on = false; w.m.visible = false; }
    }
  }

  // --- бродячие заражённые
  for (const s of strays) {
    if (!s.on) continue;
    s.t += dt; s.z += d;
    if (s.mode === 0) {               // бредёт к дороге и обратно
      s.x -= s.dir * s.speed * dt;
      if (Math.abs(s.x) < 6.4) { s.dir = -s.dir; s.c.root.rotation.y += Math.PI; s.x = Math.sign(s.x) * 6.4; }
      else if (Math.abs(s.x) > 16) { s.dir = -s.dir; s.c.root.rotation.y += Math.PI; }
      animChar(s.c, s.t * (2.4 + s.speed * 2), 0.8);
    } else {                           // стоит и раскачивается, провожая отряд взглядом
      s.c.root.rotation.y = Math.atan2(G.hero.x - s.x, -s.z) + Math.PI;
      animChar(s.c, s.t * 1.3, 0.12);
      s.c.body.rotation.z = Math.sin(s.t * 1.1) * 0.12;
    }
    s.c.root.position.set(s.x, 0, s.z);
    if (s.z > 16) placeStray(s, -100 - rand(0, 12));
  }

  // --- молнии
  if (cfg.lightning) {
    boltT -= dt;
    if (boltT <= 0) { boltT = rand(7, 16); skyFlash(1); setTimeout(() => skyFlash(0.7), 130); setTimeout(() => sfx.thunder(), 500 + Math.random() * 900); }
  }

  // --- порывы ветра
  if (cfg.gusts) {
    gustT -= dt;
    if (gustT <= 0) { gustT = rand(7, 13); gust = 2.6; worldInfo.gdir = Math.random() < 0.5 ? -1 : 1; sfx.wind(); }
    if (gust > 0) {
      gust -= dt; const k = Math.sin(Math.min(1, gust / 2.6) * Math.PI), dir = worldInfo.gdir;
      worldInfo.wind = dir * k * 9;
      const c = key === 'snow' ? 0.85 : 0.5, cg = key === 'snow' ? 0.88 : 0.4, cb = key === 'snow' ? 0.92 : 0.28;
      for (let i = 0; i < 3; i++) emitSolid(-dir * rand(8, 20), rand(0.1, 1.6), rand(-55, 6), dir * rand(9, 16) * k, rand(0, 0.8), 0, rand(0.9, 1.6), rand(0.5, 1.2), c, cg, cb, 0.18 * k, -0.2, 1.2);
    } else worldInfo.wind = 0;
  }

  // --- туман по земле, светлячки, бумага, капли
  if (cfg.mist) {
    mistAcc += dt * 5;
    while (mistAcc >= 1) { mistAcc -= 1; const m = cfg.mist; emitSolid(rand(-22, 22), rand(0.2, 0.9), rand(-65, 4), rand(-0.5, 0.5), 0.05, rand(-0.2, 0.2), rand(4, 6), rand(3, 5), m[0], m[1], m[2], 0.07, -0.01, 0.5); }
  }
  if (cfg.fireflies) {
    flyAcc += dt * 9;
    while (flyAcc >= 1) { flyAcc -= 1; emitGlow(rand(-20, 20), rand(0.4, 3), rand(-55, 4), rand(-0.6, 0.6), rand(-0.2, 0.3), rand(-0.6, 0.6), rand(1.5, 3), rand(0.07, 0.12), 0.75, 1, 0.4, 0.9, 0); }
  }
  if (cfg.paper && sc > 2) {
    paperAcc += dt * 1.6;
    while (paperAcc >= 1) { paperAcc -= 1; emitSolid(rand(-8, 8), 0.1, rand(-50, -10), rand(-2, 2), rand(1, 3), rand(-1, 1), rand(1.5, 3), rand(0.1, 0.18), 0.6, 0.58, 0.52, 0.8, 2.2); }
  }
  if (cfg.drips && Math.random() < dt * 6) emitGlow(rand(-9, 9), rand(7, 10), rand(-50, 0), 0, -rand(6, 10), 0, 1.2, 0.07, 0.4, 1, 0.6, 0.8, 6);

  // --- вертолёт
  if (cfg.heli && playing) {
    if (!heli.on) {
      heliT -= dt;
      if (heliT <= 0) { heli.on = true; heli.dir = Math.random() < 0.5 ? -1 : 1; heli.x = -heli.dir * 75; heli.g.visible = true; heli.g.rotation.y = heli.dir > 0 ? -Math.PI / 2 : Math.PI / 2; sfx.heli(); }
    } else {
      heli.x += heli.dir * 17 * dt;
      heli.g.position.set(heli.x, 12.5 + Math.sin(t * 0.8) * 0.5, -52 + Math.sin(t * 0.3) * 4);
      heli.g.rotation.z = -0.12; heli.rotor.rotation.y += dt * 38;
      heli.bp.rotation.x = Math.sin(t * 1.3) * 0.5; heli.bp.rotation.z = Math.cos(t * 0.9) * 0.4;
      heli.lamp.visible = Math.sin(t * 9) > 0;
      if (Math.abs(heli.x) > 80) { heli.on = false; heli.g.visible = false; heliT = rand(22, 40); }
    }
  }
}
