// Вега и отряд: управление, перекат, щит, строй, урон
import * as THREE from '../vendor/three.module.min.js';
import { G, clamp } from './state.js';
import { ROAD_HALF, SQUAD_MAX } from './config.js';
import { makeChar, animChar, giveGun } from './models.js';
import { blood, sparks, toast, shake, dustBurst } from './fx.js';
import { sfx } from './audio.js';
import { rank } from './arsenal.js';
import { addCorpse } from './physics.js';

const pool = [];
const keys = {};
let dragX = null, shieldMesh = null;
const HERO_SCALE = 1.12;
const ROLL_T = 0.4;

export function initPlayer() {
  const c = makeChar('hero', HERO_SCALE);
  G.scene.add(c.root);
  G.hero = { c, x: 0, tx: 0, armor: 100, maxArmor: 100, fireCd: 0, inv: 0, step: 0, dead: false, roll: 0, rollAge: 9, rollCd: 0, rollDir: 1, perfect: false, meleeCd: 0, meleeAnim: 0 };
  giveGun(c, 0);
  G.muzzle = new THREE.PointLight(0xffb060, 0, 16, 1.8);
  G.muzzle.position.set(0, 1.5, -1.4); G.scene.add(G.muzzle);
  // щит перед строем в режиме обороны
  shieldMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 2.2, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76),
    new THREE.MeshBasicMaterial({ color: 0x4fa8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  shieldMesh.position.y = 1.1; shieldMesh.visible = false; G.scene.add(shieldMesh);

  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  const cv = G.renderer.domElement;
  cv.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') dragX = e.clientX; });
  window.addEventListener('pointerup', () => { dragX = null; });
  window.addEventListener('pointercancel', () => { dragX = null; });
  window.addEventListener('pointermove', e => {
    if (G.mode !== 'run' && G.mode !== 'boss') return;
    const h = G.hero, lim = ROAD_HALF - 0.5;
    if (e.pointerType === 'mouse') {
      h.tx = clamp((e.clientX / window.innerWidth - 0.5) * 2 * ROAD_HALF * (G.portrait ? 1.1 : 1.45), -lim, lim);
    } else if (dragX !== null) {
      h.tx = clamp(h.tx + (e.clientX - dragX) / window.innerWidth * ROAD_HALF * 2 * 1.5, -lim, lim);
      dragX = e.clientX;
    }
  });
}

export function setWeapon(tier) {
  G.weaponTier = tier;
  giveGun(G.hero.c, tier);
}

// Малый отряд идёт шеренгой рядом с Вегой (камера смотрит из-за спины, поэтому позади никого)
const SLOTS = [[-1.2, 0.3], [1.2, 0.3], [-2.4, 0.6], [2.4, 0.6], [-3.5, 0.95], [3.5, 0.95], [-0.7, 1.7], [0.7, 1.7]];
function slot(i, out) {
  const p = SLOTS[i % SLOTS.length];
  out.x = p[0]; out.z = p[1];
  if (G.defend) { out.x *= 0.6; out.z = 0.3 + (out.z - 0.3) * 0.7; }
  if (G.narrow) { out.z += Math.abs(out.x) * 0.55; out.x *= 0.5; }      // узкое место: отряд сжимается в клин
  return out;
}
const _slot = { x: 0, z: 0 };

export function resetSquad(n) {
  for (const s of G.squad) { s.c.root.visible = false; pool.push(s.c); }
  G.squad.length = 0;
  const h = G.hero;
  h.x = h.tx = 0; h.maxArmor = 100; h.armor = h.maxArmor; h.inv = 0; h.dead = false; h.fireCd = 0;
  h.roll = 0; h.rollCd = 0; h.rollAge = 9; h.meleeCd = 0;
  h.c.root.visible = true; h.c.root.rotation.set(0, 0, 0); h.c.root.position.set(0, 0, 0);
  addSoldiers(n, true);
}

export function addSoldiers(n, snap = false) {
  let added = 0;
  for (let k = 0; k < n && G.squad.length < SQUAD_MAX; k++) {
    let c = pool.pop();
    if (!c) { c = makeChar('soldier'); giveGun(c, 1); G.scene.add(c.root); }
    c.root.visible = true; c.root.rotation.set(0, 0, 0); c.root.position.y = 0;
    const s = { c, x: G.hero.x, z: 2.5, cd: Math.random() * 0.5, hp: 2 };
    if (snap) { slot(G.squad.length, _slot); s.x = G.hero.x + _slot.x; s.z = _slot.z; }
    G.squad.push(s); added++;
  }
  // сверх предела отряда пополнение превращается в урон (по документу)
  if (added < n) G.sqDmg += 0.1 * (n - added);
  return added;
}

export function killSoldier(i, armorCheck = true, vx = (Math.random() - 0.5) * 2, vz = 2.5) {
  const s = G.squad[i]; if (!s) return false;
  if (G.god || G.cry > 0) return false;
  let save = G.mods.vet + (armorCheck ? 0.08 * rank('vest') : 0);
  if (G.defend) save = 1 - (1 - save) * 0.4;
  if (Math.random() < save) { sparks(s.x, 1.2, s.z, 6, 0.5, 0.75, 1); return false; }
  if (--s.hp > 0) { blood(s.x, 1.2, s.z, 5); sparks(s.x, 1.2, s.z, 4); sfx.hit(); return false; }     // первое попадание боец держит
  blood(s.x, 1.1, s.z, 12);
  addCorpse(s.c, pool, s.x, s.z, vx, vz, 1);
  G.squad.splice(i, 1);
  sfx.soldierDown();
  if (G.hooks.onLoss) G.hooks.onLoss();
  return true;
}
export function removeSoldiers(n) {
  for (let k = 0; k < n && G.squad.length; k++) {
    const s = G.squad.pop(); s.c.root.visible = false; pool.push(s.c);
  }
}

// src: 'bite' — контакт с заражённым, 'boss' — атака босса, иначе зона/взрыв/препятствие
export function hurtHero(dmg, src) {
  const h = G.hero;
  if (G.god || h.dead) return;
  if (h.roll > 0) {            // перекат: неуязвимость; уход в последний момент — идеальное уклонение
    if (src !== 'bite' && h.rollAge < 0.28 && !h.perfect) { h.perfect = true; if (G.hooks.onPerfect) G.hooks.onPerfect(); }
    return;
  }
  if (h.inv > 0) return;
  if (src === 'boss' && G.charges.shield > 0) {
    G.charges.shield--; h.inv = 0.8; toast('Энергощит поглотил удар', 'good'); sparks(h.x, 1.3, 0, 20, 0.4, 0.7, 1); return;
  }
  if (G.defend) dmg *= 0.4;
  h.armor -= dmg; h.inv = 0.4;
  G.hurtFlash = 1; shake(0.4); sfx.hurt(); blood(h.x, 1.2, 0, 6);
  if (G.hooks.onHurt) G.hooks.onHurt();
  if (h.armor <= 35 && h.armor > 0 && G.charges.medkit > 0) {
    G.charges.medkit--; h.armor = Math.min(h.maxArmor, h.armor + 50); toast('Аптечка: +50 брони', 'good');
  }
  if (h.armor <= 0) { h.armor = 0; h.dead = true; blood(h.x, 1.2, 0, 30, 1.4); G.hooks.onHeroDead(); }
}

export function tryRoll() {
  const h = G.hero;
  if (h.dead || h.rollCd > 0 || (G.mode !== 'run' && G.mode !== 'boss')) return;
  const lim = ROAD_HALF - 0.5;
  const k = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const d = h.tx - h.x;
  h.rollDir = k || (Math.abs(d) > 0.15 ? Math.sign(d) : h.rollDir);
  h.tx = clamp(h.x + h.rollDir * 2.8, -lim, lim);
  h.roll = ROLL_T; h.rollAge = 0; h.rollCd = G.mods.rollCd; h.perfect = false;
  dustBurst(h.x, 0.3, 3); sfx.click();
}

export function updatePlayer(dt) {
  const h = G.hero, lim = ROAD_HALF - 0.5;
  const active = (G.mode === 'run' || G.mode === 'boss') && !h.dead;
  if (active) {
    if (keys.Space || G.input.roll) { keys.Space = false; G.input.roll = false; tryRoll(); }
    G.defend = !!(keys.ShiftLeft || keys.ShiftRight || G.input.defend) && h.roll <= 0;
    const k = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (k && h.roll <= 0) h.tx = clamp(h.tx + k * 12 * dt, -lim, lim);
    const sp = h.roll > 0 ? 26 : G.defend ? 9 : 16;
    h.x += clamp(h.tx - h.x, -sp * dt, sp * dt);
    h.inv -= dt; h.rollCd -= dt; h.meleeCd -= dt; h.meleeAnim -= dt; h.rollAge += dt;
    if (h.roll > 0) h.roll -= dt;
    if (G.mods.medic) h.armor = Math.min(h.maxArmor, h.armor + G.mods.medic * dt);
  } else G.defend = false;

  const run = clamp(G.scroll / 14, 0, 1);
  h.step += dt * (4 + run * 8);
  const c = h.c;
  if (c.actor) {                       // скелетная Вега: позы задаёт анимация, а не повороты корня
    c.root.position.set(h.x, 0, 0); c.root.rotation.x = 0; c.root.scale.setScalar(HERO_SCALE * 0.95);
    c.root.rotation.z = h.dead || h.roll > 0 ? 0 : clamp((h.tx - h.x) * -0.05, -0.16, 0.16);
    animChar(c, h.step, run);
    c.actor.state(h.roll > 0 ? 1 - h.roll / ROLL_T : -1, h.meleeAnim > 0, h.dead);
  } else if (h.dead) {
    c.root.rotation.x = Math.min(1.5, c.root.rotation.x + dt * 4); c.root.position.y = 0.15;
  } else {
    c.root.position.x = h.x;
    animChar(c, h.step, run);
    if (h.roll > 0) {
      const p = 1 - h.roll / ROLL_T;
      c.root.rotation.z = -h.rollDir * p * Math.PI * 2;
      c.root.position.y = 0.55 * Math.sin(p * Math.PI) * 0.4 + 0.35 * Math.sin(p * Math.PI);
      c.root.scale.setScalar(HERO_SCALE * (1 - 0.3 * Math.sin(p * Math.PI)));
    } else {
      c.root.rotation.z = clamp((h.tx - h.x) * -0.06, -0.2, 0.2);
      c.root.position.y = 0; c.root.scale.setScalar(HERO_SCALE);
      c.root.rotation.x = h.meleeAnim > 0 ? -0.45 * Math.sin(h.meleeAnim / 0.25 * Math.PI) : 0;
    }
    if (!run) c.body.position.y += Math.sin(G.time * 2) * 0.008;
  }
  for (let i = 0; i < G.squad.length; i++) {
    const s = G.squad[i]; slot(i, _slot);
    let tx = clamp(h.x + _slot.x, -ROAD_HALF + 0.2, ROAD_HALF - 0.2);
    // бойцы сами обходят заграждения: смещаются к свободному краю со стороны Веги
    const walls = G.dbg ? G.dbg.barricades : null;
    if (walls) for (let j = 0; j < walls.length; j++) {
      const b = walls[j];
      if (b.z < -13 || b.z > s.z + 0.6 || Math.abs(tx - b.x) > b.w / 2 + 0.45) continue;
      const side = h.x >= b.x ? 1 : -1;
      tx = clamp(b.x + side * (b.w / 2 + 0.55 + (i % 3) * 0.5), -ROAD_HALF + 0.2, ROAD_HALF - 0.2);
    }
    // и уходят из зон атак: к ближайшему краю, по возможности в сторону Веги
    let danger = false;
    const zs = G.dbgZones;
    if (zs) for (let j = 0; j < zs.length; j++) {
      const z = zs[j]; if (z.t < 0) continue;
      const half = z.shape === 'circle' ? (Math.abs(s.z - z.z) < z.r ? Math.sqrt(z.r * z.r - (s.z - z.z) * (s.z - z.z)) : 0) : z.w / 2;
      if (!half || Math.abs(tx - z.x) > half + 0.3) continue;
      const side = Math.abs(h.x - z.x) > half ? Math.sign(h.x - z.x) : (tx >= z.x ? 1 : -1);
      let nx = z.x + side * (half + 0.5 + (i % 3) * 0.45);
      if (Math.abs(nx) > ROAD_HALF - 0.2) nx = z.x - side * (half + 0.5 + (i % 3) * 0.45);
      tx = clamp(nx, -ROAD_HALF + 0.2, ROAD_HALF - 0.2); danger = true;
    }
    const lag = danger ? 12 : Math.max(4, 9 - _slot.z * 0.9);
    s.x += (tx - s.x) * Math.min(1, dt * lag);
    s.z += (_slot.z - s.z) * Math.min(1, dt * 5);
    if (s.wall > 0) { s.wall -= dt; if (s.wall <= 0) s.wall = 0; }
    s.c.root.position.set(s.x, 0, s.z);
    animChar(s.c, h.step, run);
  }
  shieldMesh.visible = G.defend;
  if (G.defend) { shieldMesh.position.x = h.x; shieldMesh.position.z = 2.2; shieldMesh.material.opacity = 0.13 + Math.sin(G.time * 9) * 0.03; }
  G.muzzle.intensity *= Math.max(0, 1 - dt * 22);
  G.muzzle.position.x = h.x;
}
