// Заражённые: появление, движение, контакт с отрядом, урон; зоны поражения на земле
import * as THREE from '../vendor/three.module.min.js';
import { G, rand, clamp } from './state.js';
import { ENEMIES, ROAD_HALF } from './config.js';
import { makeChar, animChar, MAT } from './models.js';
import { blood, decal, explosion, acid, sparks, smoke, dustBurst, shake } from './fx.js';
import { killSoldier, hurtHero } from './player.js';
import { sfx } from './audio.js';
import { debris, addCorpse, impulse } from './physics.js';

const pools = {};

export function spawnEnemy(type, x, z, opt = {}) {
  const def = ENEMIES[type];
  const pl = pools[type] || (pools[type] = []);
  let c = pl.pop();
  if (!c) { c = makeChar(def.model || type, def.scale); G.scene.add(c.root); }
  c.root.visible = true; c.root.rotation.set(0, Math.PI, 0);
  const hp = def.hp * G.hpMul() * (opt.hpK || 1);
  const e = {
    elite: !!def.elite, flee: !!def.flee,
    type, def, c, pool: pl, x, z, r: def.r, hp, maxHp: hp, alive: true, bites: def.bites,
    kx: 0, kz: 0, mass: def.r * def.r * 5, speed: def.speed * (opt.fast || 1) * rand(0.85, 1.15), aim: rand(-2.3, 2.3), t: rand(0, 6), h: 1.15 * def.scale, spit: rand(0.8, 2.4),
  };
  const bs = c.root.userData.bs || (c.root.userData.bs = c.root.scale.x);
  c.root.scale.setScalar(bs);
  if (opt.rise) { e.rise = 0.55; c.root.scale.y = bs * 0.05; dustBurst(x, z, 2); }    // вылезает из земли
  c.root.position.set(x, 0, z);
  G.enemies.push(e);
  return e;
}

function release(e) {
  if (e.pool) { e.c.root.visible = false; e.pool.push(e.c); }
  else G.scene.remove(e.c.root);
}

// ix, iz — импульс попадания (отбрасывание); gib — смерть от взрыва разрывает тело
export function damage(e, dmg, ix = 0, iz = 0, gib = false) {
  if (!e.alive) return;
  if (e.isBoss) {
    const b = G.boss;
    if (!b || b.state !== 'fight') return;
    if (b.def.armored && b.vuln <= 0) dmg *= 0.4;
  }
  e.hp -= dmg;
  if (e.mass) { e.kx += ix / e.mass; e.kz += iz / e.mass; }
  if (e.bar) e.bar.scale.x = Math.max(0.001, e.hp / e.maxHp);
  if (!e.static && Math.random() < 0.22) blood(e.x + rand(-0.3, 0.3) * e.r, e.h * rand(0.6, 1), e.z + 0.3, 2);
  if (e.hp <= 0) kill(e, gib);
}

const FLESH = [0x4a0f0c, 0x5a1410, 0x6e6a58, 0x3a3630];
export function kill(e, gib = false) {
  if (!e.alive) return;
  e.alive = false;
  if (e.isBoss) { G.hooks.onBossKilled(); return; }
  if (e === G.elite) G.elite = null;
  if (e.type === 'crate') {
    sparks(e.x, 0.8, e.z, 16); smoke(e.x, 0.5, e.z, 5, 0.8, 0.25);
    debris(e.x, 0.6, e.z, 14, 0x4a4e3c, 0.16, 6, { long: true }); debris(e.x, 0.6, e.z, 6, 0x2a2e24, 0.2, 5);
    G.hooks.onCrate(e);
  } else if (e.type === 'cage' || e.type === 'med') {
    sparks(e.x, 1, e.z, 14); debris(e.x, 1, e.z, 12, e.type === 'cage' ? 0x3a3d40 : 0xb8b8b0, 0.1, 6, { long: true });
    G.hooks.onPickup(e);
  } else if (e.type === 'barrel') {
    explosion(e.x, e.z, 4, true);
    debris(e.x, 0.8, e.z, 9, 0x5a2016, 0.3, 11, { up: 1.3 }); debris(e.x, 0.5, e.z, 6, 0x2a2a2a, 0.14, 9);
    aoe(e.x, e.z, 4.2, 320 * G.hpMul(), true);
  } else {
    const big = e.def.scale > 1.3;
    blood(e.x, e.h * 0.7, e.z, big ? 26 : 12, big ? 1.4 : 1);
    decal(e.x, e.z, 0.5 * e.def.scale + Math.random() * 0.4);
    G.kills++;
    sfx.death();
    if (G.hooks.onKill) G.hooks.onKill(e);
    if (e.def.explode) { explosion(e.x, e.z, e.def.explode); gib = true; }
    if (gib) {
      for (let k = 0; k < (big ? 9 : 5); k++)
        debris(e.x, e.h * 0.6, e.z, 1, FLESH[k % 4], 0.16 * e.def.scale, 7, { vx: e.kx * 0.5, vz: e.kz * 0.5, long: k % 2 === 0, bounce: 0.2, life: 6 });
      blood(e.x, e.h * 0.6, e.z, 14, 1.6);
      release(e);
    } else {
      addCorpse(e.c, e.pool, e.x, e.z, e.kx * 0.6, Math.min(e.kz, 0) * 0.6 - 1.5 - e.speed * 0.2, e.def.scale);
    }
    if (e.def.explode) aoe(e.x, e.z, e.def.explode, 120 * G.hpMul(), true);
    return;
  }
  release(e);
}

// Урон по площади. hurtSquad — задевает и своих.
export function aoe(x, z, r, dmg, hurtSquad = false) {
  const list = G.enemies;
  impulse(x, z, r * 1.3, 9);
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (!e.alive) continue;
    const dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < r + e.r) {
      const f = 1 - 0.5 * Math.min(1, d / r), n = d + 0.2;
      damage(e, dmg * f, dx / n * 14 * f, dz / n * 14 * f, true);
    }
  }
  if (hurtSquad) {
    for (let i = G.squad.length - 1; i >= 0; i--) {
      const s = G.squad[i], dx = s.x - x, dz = s.z - z;
      if (dx * dx + dz * dz < r * r) killSoldier(i, false, dx * 3, dz * 3 + 2);
    }
    const dx = G.hero.x - x;
    if (dx * dx + z * z < r * r) hurtHero(20, 'enemy');
  }
}

function bite(e) {
  e.bites--;
  if (e.bites <= 0) kill(e);
}

export function updateEnemies(dt) {
  const h = G.hero, sq = G.squad, list = G.enemies, lim = ROAD_HALF - 0.3;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive || e.isBoss) continue;
    if (e.static) {
      e.z += G.scroll * dt; e.c.root.position.z = e.z;
      if (e.z > 14) { e.alive = false; release(e); }
      continue;
    }
    e.t += dt;
    if (e.rise > 0) { e.rise -= dt; const bs = e.c.root.userData.bs; e.c.root.scale.y = bs * Math.min(1, 1.05 - Math.max(0, e.rise) / 0.55); }
    if (e.flee) {                             // золотой зомби убегает от отряда
      e.z -= 1.6 * dt; e.x += Math.sin(e.t * 1.7) * 2.2 * dt;
      e.c.root.position.set(e.x, 0, e.z); e.c.root.rotation.y = 0; animChar(e.c, e.t * 9, 1);
      if (e.z < -72) { e.alive = false; release(e); }
      continue;
    }
    e.z += (G.scroll + e.speed) * dt;
    if (e.kx || e.kz) {                       // отбрасывание от попаданий и взрывов
      e.x += e.kx * dt; e.z += e.kz * dt;
      const f = Math.max(0, 1 - dt * 7); e.kx *= f; e.kz *= f;
      if (Math.abs(e.kx) + Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
    }
    for (let j = i + 1; j < list.length; j++) {  // заражённые расталкивают друг друга
      const o = list[j];
      if (!o.alive || o.static || o.isBoss) continue;
      const dz = o.z - e.z; if (dz > 1.3 || dz < -1.3) continue;
      const dx = o.x - e.x, rr = e.r + o.r; if (dx > rr || dx < -rr) continue;
      const d2 = dx * dx + dz * dz; if (d2 >= rr * rr || d2 < 0.0001) continue;
      const d = Math.sqrt(d2), push = (rr - d) * 0.5 * Math.min(1, dt * 10), tm = e.mass + o.mass;
      const nx = dx / d * push, nz = dz / d * push;
      e.x -= nx * o.mass / tm * 2; e.z -= nz * o.mass / tm; o.x += nx * e.mass / tm * 2; o.z += nz * e.mass / tm;
    }
    if (e.z > -22) {
      const dx = h.x + e.aim - e.x, st = e.def.steer * dt;
      e.x = clamp(e.x + clamp(dx, -st, st), -lim, lim);
    }
    if (e.type === 'spitter' && e.z > -46 && e.z < -9) {
      e.spit -= dt;
      if (e.spit <= 0) {
        e.spit = 2.8;
        addZone({ x: clamp(h.x + rand(-0.8, 0.8), -lim, lim), z: rand(0.3, 2.2), r: 1.5, dur: 1.4, dmg: 12, fx: 'acid', color: 0x7fae2a, from: { x: e.x, y: e.h, z: e.z } });
      }
    }
    e.c.root.position.set(e.x, 0, e.z);
    animChar(e.c, e.t * (3.5 + e.speed * 1.1), 1);
    if (e.z > -1.4) {
      if (e.z < 1 && Math.abs(e.x - h.x) < e.r + 0.4 && !h.dead) {
        if (h.roll > 0) { /* в перекате Вега проходит сквозь толпу */ }
        else if (h.meleeCd <= 0 && !e.elite) {      // рукопашная: удар прикладом отбрасывает заражённого
          h.meleeCd = G.mods.meleeCd; h.meleeAnim = 0.25;
          sparks(e.x, 1.2, e.z, 5, 1, 0.9, 0.7); sfx.hit();
          damage(e, 75 * G.hpMul() * (1 + G.weaponTier * 0.25), (e.x - h.x) * 6, -11);
          if (G.hooks.onMelee) G.hooks.onMelee(!e.alive);
        } else { hurtHero(e.def.dmg, 'bite'); bite(e); if (e.alive && e.elite) e.kz = -16 / e.mass * 6; }   // громила после удара отшатывается
      }
      else {
        for (let j = 0; j < sq.length; j++) {
          const s = sq[j];
          if (Math.abs(s.z - e.z) < e.r + 0.35 && Math.abs(s.x - e.x) < e.r + 0.35) { killSoldier(j); bite(e); break; }
        }
      }
      if (e.alive && e.z > 13) { e.alive = false; release(e); }
    }
  }
  let w = 0;
  for (let i = 0; i < list.length; i++) if (list[i].alive) list[w++] = list[i];
  list.length = w;
}

export function clearEnemies() {
  for (const e of G.enemies) { if (e.isBoss) continue; e.alive = false; release(e); }
  G.enemies.length = 0;
  for (const z of zones) freeZone(z);
  zones.length = 0;
}

// ---------- Зоны поражения (телеграф атак) ----------
const zones = [], zpool = { circle: [], lane: [] }, blobPool = [];
G.dbgZones = zones;
let circleGeo, laneGeo, blobGeo;

function zoneMesh(shape) {
  let m = zpool[shape].pop();
  if (!m) {
    if (!circleGeo) {
      circleGeo = new THREE.CircleGeometry(1, 28); circleGeo.rotateX(-Math.PI / 2);
      laneGeo = new THREE.PlaneGeometry(1, 1); laneGeo.rotateX(-Math.PI / 2);
      blobGeo = new THREE.SphereGeometry(0.32, 8, 6);
    }
    m = new THREE.Mesh(shape === 'circle' ? circleGeo : laneGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.renderOrder = 2;
    G.scene.add(m);
  }
  m.visible = true;
  return m;
}
function freeZone(z) {
  z.mesh.visible = false; zpool[z.shape].push(z.mesh);
  if (z.blob) { z.blob.visible = false; blobPool.push(z.blob); z.blob = null; }
}

export function addZone(o) {
  const z = Object.assign({ shape: 'circle', x: 0, z: 1, r: 1.6, w: 3, dur: 1.2, dmg: 25, src: 'enemy', color: 0xc81e1e, fx: 'boom', t: 0, delay: 0 }, o);
  z.mesh = zoneMesh(z.shape);
  z.mesh.material.color.set(z.color);
  if (z.shape === 'circle') { z.mesh.position.set(z.x, 0.04, z.z); z.mesh.scale.set(z.r, 1, z.r); }
  else { z.mesh.position.set(z.x, 0.04, -9); z.mesh.scale.set(z.w, 1, 36); }
  if (z.from) {
    z.blob = blobPool.pop();
    if (!z.blob) { z.blob = new THREE.Mesh(blobGeo, MAT.glowG); G.scene.add(z.blob); }
    z.blob.material = z.fx === 'acid' ? MAT.glowG : MAT.glowO;
    z.blob.visible = z.delay <= 0;
  }
  z.t = -z.delay;
  if (z.delay > 0) z.mesh.visible = false;
  zones.push(z);
  return z;
}

function fireZone(z) {
  const h = G.hero, sq = G.squad;
  if (z.shape === 'circle') {
    if (z.fx === 'acid') acid(z.x, z.z, z.r); else { explosion(z.x, z.z, z.r); debris(z.x, 0.2, z.z, 6, 0x3a3a3a, 0.14, 7); }
    impulse(z.x, z.z, z.r * 1.3, 8);
    let cap = 2;
    for (let i = sq.length - 1; i >= 0 && cap > 0; i--) {
      const s = sq[i], dx = s.x - z.x, dz = s.z - z.z;
      if (dx * dx + dz * dz < z.r * z.r && killSoldier(i, false, dx * 3, dz * 3 + 2)) cap--;
    }
    const dx = h.x - z.x, rr = z.r + 0.15;
    if (dx * dx + z.z * z.z < rr * rr) hurtHero(z.dmg, z.src);
  } else {
    for (let k = 0; k < 7; k++) dustBurst(z.x + rand(-z.w, z.w) * 0.45, 7 - k * 3, 4);
    shake(0.5); sfx.explosion(false);
    for (let k = 0; k < 4; k++) debris(z.x + rand(-z.w, z.w) * 0.4, 0.2, rand(-2, 6), 3, 0x4a4a48, 0.15, 6);
    let cap = 2;
    for (let i = sq.length - 1; i >= 0 && cap > 0; i--) if (Math.abs(sq[i].x - z.x) < z.w / 2 && killSoldier(i, false, rand(-2, 2), 5)) cap--;
    if (Math.abs(h.x - z.x) < z.w / 2 + 0.15) hurtHero(z.dmg, z.src);
  }
  if (z.onFire) z.onFire(z);
}

export function updateZones(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    z.t += dt;
    if (z.t < 0) continue;
    z.mesh.visible = true;
    const p = z.t / z.dur;
    z.mesh.material.opacity = 0.14 + 0.42 * p * p + (p > 0.7 ? Math.sin(G.time * 40) * 0.08 : 0);
    if (z.blob) {
      const f = z.from; z.blob.visible = true;
      z.blob.position.set(f.x + (z.x - f.x) * p, f.y * (1 - p) + Math.sin(p * Math.PI) * 7, f.z + (z.z - f.z) * p);
    }
    if (p >= 1) { fireZone(z); freeZone(z); zones.splice(i, 1); }
  }
}
