// Бонусные ворота (в т.ч. рулетка, запертые, формации), ящики, клетки с пленными, бочки, заграждения
import * as THREE from '../vendor/three.module.min.js';
import { G, rand } from './state.js';
import { ROAD_HALF, WEAPONS } from './config.js';
import { P, box, cyl, sph, merge, MAT } from './models.js';
import { addSoldiers, removeSoldiers, killSoldier, hurtHero } from './player.js';
import { upgradeWeapon } from './weapons.js';
import { toast, sparks } from './fx.js';
import { sfx } from './audio.js';

const gates = [], barricades = [];
G.dbg = { gates, barricades, isBad: e => e.t === 'sub' || e.t === 'div' };
let frameGeo, panelGeo, crateGeo, barrelGeo, barricadeGeo, barGeo, cageGeo, medGeo;
const labels = {};
const COL = { good: 0x2f7fd0, bad: 0xb02020, risk: 0x7a4ab0, lock: 0xb0802a, form: 0x2f9a6a };
const FORM = { wedge: ['КЛИН', 'Клин: урон +20%, узкий фронт'], square: ['КАРЕ', 'Каре: бойцы на 12% живучее'], line: ['ЦЕПЬ', 'Цепь: широкий фронт огня'] };

function geos() {
  if (frameGeo) return;
  const H = ROAD_HALF;
  frameGeo = merge([P(cyl(0.1, 0.12, 3.1, 8), 0x2a2d30, [-H, 1.55, 0]), P(cyl(0.1, 0.12, 3.1, 8), 0x2a2d30, [H, 1.55, 0]), P(cyl(0.08, 0.1, 3.1, 8), 0x2a2d30, [0, 1.55, 0]),
    P(box(H * 2 + 0.3, 0.16, 0.16), 0x33373a, [0, 3.1, 0]), P(box(0.5, 0.3, 0.4), 0x1e2022, [-H, 0.15, 0]), P(box(0.5, 0.3, 0.4), 0x1e2022, [H, 0.15, 0]), P(box(0.4, 0.3, 0.4), 0x1e2022, [0, 0.15, 0])]);
  panelGeo = new THREE.PlaneGeometry(H - 0.25, 2.7);
  crateGeo = merge([P(box(1.5, 1.1, 1.1), 0x3f4534, [0, 0.55, 0]), P(box(1.54, 0.1, 1.14), 0x2a2e24, [0, 0.3, 0]), P(box(1.54, 0.1, 1.14), 0x2a2e24, [0, 0.85, 0]),
    P(box(0.1, 1.14, 1.14), 0x2a2e24, [-0.5, 0.55, 0]), P(box(0.1, 1.14, 1.14), 0x2a2e24, [0.5, 0.55, 0]), P(box(0.5, 0.3, 0.02), 0xb0a070, [0, 0.58, 0.56])], 0.15);
  medGeo = merge([P(box(1.1, 0.8, 0.8), 0xb8b8b0, [0, 0.4, 0]), P(box(0.5, 0.16, 0.02), 0xa02020, [0, 0.45, 0.41]), P(box(0.16, 0.5, 0.02), 0xa02020, [0, 0.45, 0.41]), P(box(1.14, 0.08, 0.84), 0x6a6a64, [0, 0.8, 0])], 0.1);
  barrelGeo = merge([P(cyl(0.42, 0.42, 1.1, 12), 0x6a2418, [0, 0.55, 0]), P(cyl(0.44, 0.44, 0.06, 12), 0x3a1a14, [0, 0.3, 0]), P(cyl(0.44, 0.44, 0.06, 12), 0x3a1a14, [0, 0.8, 0]),
    P(cyl(0.4, 0.4, 0.04, 12), 0x2a2a2a, [0, 1.1, 0]), P(box(0.3, 0.22, 0.02), 0xb09a40, [0, 0.55, 0.42])], 0.25);
  const bp = [P(box(3.2, 0.9, 0.7), 0x5a5a58, [0, 0.45, 0]), P(box(3.0, 0.35, 0.45), 0x4c4c4a, [0, 1.05, 0]), P(box(3.22, 0.16, 0.72), 0x8a7a2a, [0, 0.5, 0])];
  for (let i = 0; i < 7; i++) bp.push(P(cyl(0.025, 0.025, 1.3, 4), 0x3a2a22, [-1.4 + i * 0.47, 1.4, 0.2], [0.6, 0, rand(-0.2, 0.2)]));
  barricadeGeo = merge(bp, 0.2);
  // клетка с пленными бойцами
  const cp = [P(box(1.5, 0.1, 1.5), 0x2a2d30, [0, 0.05, 0]), P(box(1.5, 0.1, 1.5), 0x2a2d30, [0, 2.1, 0])];
  for (let i = 0; i < 5; i++) for (const s of [-0.72, 0.72]) cp.push(P(cyl(0.03, 0.03, 2, 4), 0x3a3d40, [-0.72 + i * 0.36, 1.05, s]), P(cyl(0.03, 0.03, 2, 4), 0x3a3d40, [s, 1.05, -0.72 + i * 0.36]));
  for (const x of [-0.3, 0.3]) cp.push(P(cyl(0.16, 0.14, 0.6, 6), 0x3d4434, [x, 1.2, 0]), P(sph(0.12, 6, 5), 0x8a735e, [x, 1.65, 0]), P(cyl(0.12, 0.1, 0.9, 6), 0x353b2e, [x, 0.5, 0]));
  cageGeo = merge(cp, 0.1);
  barGeo = new THREE.PlaneGeometry(1.5, 0.12);
  labels.crate = textTex('?', 'СНАРЯЖЕНИЕ', 0); labels.weapon = textTex('ОРУЖИЕ', '', 0); labels.cage = textTex('ПЛЕННЫЙ', '', 0); labels.med = textTex('АПТЕЧКА', '', 0);
}

function draw(ctx, big, small, charge) {
  ctx.clearRect(0, 0, 256, 128);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.fillStyle = '#eef1f4';
  ctx.font = `700 ${small ? 70 : 44}px "DIN Condensed","Arial Narrow",Arial,sans-serif`;
  ctx.lineWidth = 8; ctx.strokeText(big, 128, small ? 48 : 64); ctx.fillText(big, 128, small ? 48 : 64);
  if (small) {
    ctx.font = '600 26px "DIN Condensed","Arial Narrow",Arial,sans-serif'; ctx.lineWidth = 5;
    ctx.strokeText(small, 128, 100); ctx.fillText(small, 128, 100);
  }
  if (charge) { ctx.fillStyle = 'rgba(238,241,244,0.85)'; ctx.fillRect(28, 120, 200 * charge, 5); }
}
function textTex(big, small, charge) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d'); draw(ctx, big, small, charge);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData = { ctx };
  return t;
}

function label(e) {
  if (e.lock > 0) return [String(Math.ceil(e.lock)), 'ЗАПЕРТО · СТРЕЛЯЙ'];
  switch (e.t) {
    case 'add': return ['+' + e.n, e.charge ? 'БОЙЦЫ · СТРЕЛЯЙ' : 'БОЙЦЫ'];
    case 'mul': return ['×' + e.n, 'ОТРЯД'];
    case 'sub': return ['−' + e.n, 'БОЙЦЫ'];
    case 'div': return ['÷' + e.n, 'ОТРЯД'];
    case 'rate': return ['+20%', 'ТЕМП ОГНЯ'];
    case 'dmg': return ['+20%', 'КАЛИБР'];
    case 'weapon': return ['MK +1', 'ОРУЖИЕ'];
    case 'armor': return ['+40', 'БРОНЯ'];
    case 'roulette': return ['?', 'РУЛЕТКА'];
    case 'form': return [FORM[e.f][0], 'ФОРМАЦИЯ'];
  }
}
const isBad = e => e.t === 'sub' || e.t === 'div';
const color = e => e.lock > 0 ? COL.lock : isBad(e) ? COL.bad : e.t === 'roulette' ? COL.risk : e.t === 'form' ? COL.form : COL.good;

function goodEffect() {
  const r = Math.random(), L = Math.min(G.level, 8);
  if (r < 0.42) return { t: 'add', n: 2 + (Math.random() * 3 | 0) + Math.ceil(L / 2), charge: Math.random() < 0.5 };
  if (r < 0.48) return { t: 'mul', n: 2 };
  if (r < 0.62) return { t: 'rate' };
  if (r < 0.76) return { t: 'dmg' };
  if (r < 0.78 && G.weaponTier < WEAPONS.length - 1) return { t: 'weapon' };
  if (r < 0.88) { const fs = ['wedge', 'square', 'line'].filter(f => f !== G.formation); return { t: 'form', f: fs[Math.random() * 2 | 0] }; }
  if (r < 0.94) return { t: 'roulette' };
  if (G.hero.armor < G.hero.maxArmor - 20) return { t: 'armor' };
  return { t: 'add', n: 3 + Math.ceil(L / 2), charge: true };
}
function badEffect() {
  return Math.random() < 0.65 ? { t: 'sub', n: 3 + Math.min(G.level, 8) + (Math.random() * 4 | 0) } : { t: 'div', n: 2 };
}
// запертые ворота: мощный бонус за счётчиком, который нужно расстрелять
function lockedEffect() {
  const big = Math.random() < 0.12 && G.weaponTier < WEAPONS.length - 1 ? { t: 'weapon' } : { t: 'add', n: 10 + Math.min(G.level, 8) * 2 };
  big.lock = big.lock0 = Math.round(40 * (1 + G.weaponTier * 0.9) * (1 + G.squad.length * 0.12) * (1 + 0.2 * G.level));
  return big;
}

function apply(e) {
  if (e.lock > 0) { toast('Ворота заперты', 'bad'); sfx.gateBad(); return; }
  const bad = isBad(e);
  switch (e.t) {
    case 'add': addSoldiers(e.n); toast(`+${e.n} бойцов`, 'good'); break;
    case 'mul': addSoldiers(Math.min(14, (G.squad.length + 1) * (e.n - 1))); toast(`Отряд ×${e.n}`, 'good'); break;
    case 'sub': removeSoldiers(e.n); toast(`−${e.n} бойцов`, 'bad'); break;
    case 'div': removeSoldiers(Math.ceil(G.squad.length / e.n)); toast('Отряд ÷2', 'bad'); break;
    case 'rate': G.rateMul += 0.2; toast('Темп огня +20%', 'good'); break;
    case 'dmg': G.dmgMul += 0.2; toast('Калибр: урон +20%', 'good'); break;
    case 'weapon': upgradeWeapon(); break;
    case 'armor': G.hero.armor = Math.min(G.hero.maxArmor, G.hero.armor + 40); toast('Броня +40', 'good'); break;
    case 'form': G.formation = e.f; toast(FORM[e.f][1], 'good'); break;
    case 'roulette': {
      if (G.hooks.onRisk) G.hooks.onRisk();
      const r = Math.random();
      if (r < 0.22) apply({ t: 'div', n: 2 });
      else if (r < 0.4) apply({ t: 'sub', n: 6 + Math.min(G.level, 8) });
      else if (r < 0.62) apply({ t: 'add', n: 12 + G.level * 2 });
      else if (r < 0.8) { G.dmgMul += 0.4; toast('Рулетка: урон +40%', 'good'); sfx.gateGood(); }
      else if (r < 0.86 && G.weaponTier < WEAPONS.length - 1) upgradeWeapon();
      else { G.ult = 100; toast('Рулетка: ульта заряжена', 'good'); sfx.gateGood(); }
      return;
    }
  }
  if (bad) { sfx.gateBad(); if (G.hooks.onRisk) G.hooks.onRisk(); } else if (e.t !== 'weapon') sfx.gateGood();
}

function makeSide(eff, x, group) {
  const panel = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: color(eff), transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
  panel.position.set(x, 1.6, 0);
  const [big, small] = label(eff);
  const tex = textTex(big, small, 0);
  const text = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  text.position.set(x, 1.65, 0.05); text.renderOrder = 3;
  group.add(panel, text);
  return { eff, panel, text, tex, hits: 0 };
}

export function spawnGatePair(z, opt = {}) {
  geos();
  const group = new THREE.Group();
  const fr = new THREE.Mesh(frameGeo, MAT.gun); fr.castShadow = true; group.add(fr);
  let a = opt.locked ? lockedEffect() : goodEffect();
  let b = Math.random() < (opt.rich ? 0.35 : 0.6) ? badEffect() : goodEffect();
  if (b.t === a.t && a.t !== 'add') b = { t: 'add', n: 3 + Math.min(G.level, 8), charge: true };
  if (Math.random() < 0.5) [a, b] = [b, a];
  const H = ROAD_HALF / 2;
  const g = { z, group, L: makeSide(a, -H, group), R: makeSide(b, H, group), used: false };
  group.position.z = z; G.scene.add(group); gates.push(g);
}

// Пули заряжают «стреляй»-ворота и сбивают счётчик запертых
export function chargeGates(pz, nz, x, amount) {
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (g.used || g.z > pz || g.z < nz) continue;
    const s = x < 0 ? g.L : g.R, e = s.eff;
    if (e.lock > 0) {
      e.lock -= amount;
      if (e.lock <= 0) { e.lock = 0; s.panel.material.color.set(color(e)); sfx.gateGood(); }
      const [big, small] = label(e);
      draw(s.tex.userData.ctx, big, small, e.lock > 0 ? 1 - e.lock / e.lock0 : 0); s.tex.needsUpdate = true;
      continue;
    }
    if (!e.charge || e.n >= 30) continue;
    s.hits += amount;
    const need = 5 + e.n * 0.6;
    if (s.hits >= need) { s.hits -= need; e.n++; }
    const [big, small] = label(e);
    draw(s.tex.userData.ctx, big, small, s.hits / need); s.tex.needsUpdate = true;
  }
}

// Расстреливаемые объекты на дороге: ящик с оружием, клетка с пленными, аптечка
function pickup(type, geo, x, z, hp, r, labelTex, h = 1.5) {
  geos();
  const root = new THREE.Group();
  const m = new THREE.Mesh(geo, MAT.wood); m.castShadow = true; root.add(m);
  const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xd8d5cc, fog: false })); bar.position.set(0, h, 0); root.add(bar);
  const back = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x15171a, fog: false })); back.position.set(0, h, -0.01); back.scale.set(1.04, 1.5, 1); root.add(back);
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false, fog: false })); txt.position.set(0, h + 0.6, 0); root.add(txt);
  root.position.set(x, 0, z); G.scene.add(root);
  const e = { type, static: true, c: { root }, pool: null, x, z, r, h: 1, hp, maxHp: hp, alive: true, bar };
  G.enemies.push(e);
  return e;
}
const pickHp = k => k * (1 + G.weaponTier * 1.2) * (1 + G.squad.length * 0.12 * G.sqDmg * G.sqRate) * (1 + 0.25 * G.level);
// kind: 'loot' — случайное улучшение, 'weapon' — следующее оружие Веги
export function spawnCrate(x, z, kind = 'loot') { geos(); pickup('crate', crateGeo, x, z, pickHp(kind === 'weapon' ? 150 : 70), 0.85, kind === 'weapon' ? labels.weapon : labels.crate).kind = kind; }
export function spawnCage(x, z) { geos(); pickup('cage', cageGeo, x, z, pickHp(90), 0.8, labels.cage, 2.5); }
export function spawnMed(x, z) { geos(); pickup('med', medGeo, x, z, pickHp(60), 0.7, labels.med, 1.3); }

export function spawnBarrel(x, z) {
  geos();
  const root = new THREE.Mesh(barrelGeo, MAT.drum); root.castShadow = true;
  root.position.set(x, 0, z); G.scene.add(root);
  const hp = 35 * G.hpMul();
  G.enemies.push({ type: 'barrel', static: true, c: { root }, pool: null, x, z, r: 0.55, h: 1, hp, maxHp: hp, alive: true });
}
export function spawnBarricade(x, z) {
  geos();
  const m = new THREE.Mesh(barricadeGeo, MAT.prop); m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, 0, z); G.scene.add(m);
  barricades.push({ x, z, w: 3.2, m, hitHero: false });
}

export function updateGates(dt) {
  const d = G.scroll * dt, h = G.hero;
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    g.z += d; g.group.position.z = g.z;
    if (!g.used && g.z >= -0.2) {
      g.used = true;
      const s = h.x < 0 ? g.L : g.R;
      apply(s.eff);
      s.panel.visible = false; s.text.visible = false;
      sparks(h.x, 1.5, 0, 10, 0.4, 0.6, 1);
    }
    if (g.z > 14) {
      G.scene.remove(g.group);
      for (const s of [g.L, g.R]) { s.tex.dispose(); s.panel.material.dispose(); s.text.material.dispose(); s.text.geometry.dispose(); }
      gates.splice(i, 1);
    }
  }
  for (let i = barricades.length - 1; i >= 0; i--) {
    const b = barricades[i];
    b.z += d; b.m.position.z = b.z;
    if (b.z > -0.6 && b.z < 9) {
      if (!b.hitHero && b.z < 0.8 && Math.abs(h.x - b.x) < b.w / 2 + 0.3) { b.hitHero = true; hurtHero(25, 'wall'); }
      for (let j = G.squad.length - 1; j >= 0; j--) {
        const s = G.squad[j];
        if (!s.wall && Math.abs(s.z - b.z) < 0.5 && Math.abs(s.x - b.x) < b.w / 2 + 0.1) { s.wall = 0.8; killSoldier(j, false, 0, 6); }
      }
    }
    if (b.z > 14) { G.scene.remove(b.m); barricades.splice(i, 1); }
  }
}

export function clearGates() {
  for (const g of gates) G.scene.remove(g.group);
  gates.length = 0;
  for (const b of barricades) G.scene.remove(b.m);
  barricades.length = 0;
}
