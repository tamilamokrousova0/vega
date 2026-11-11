// Оружие: пули, ракеты, лазер, гранаты, дрон, авиаудар
import * as THREE from '../vendor/three.module.min.js';
import { G, rand, clamp } from './state.js';
import { WEAPONS, ROAD_HALF } from './config.js';
import { P, box, cyl, cone, merge, MAT } from './models.js';
import { damage, aoe } from './enemies.js';
import { chargeGates } from './gates.js';
import { setWeapon } from './player.js';
import { muzzle, sparks, trail, explosion, toast } from './fx.js';
import { sfx } from './audio.js';
import { rank } from './arsenal.js';
import { casing } from './physics.js';

const MAXB = 640, BSPEED = 64, RANGE = -42;     // дальность огня: бой идёт близко к камере
const bullets = [], rockets = [], rocketPool = [], grenades = [], grenadePool = [];
let bmesh, rocketGeo, laser, drone, droneCd = 0, grenadeCd = 3, air = null;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);

export function initWeapons() {
  bmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1.1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false, fog: false }), MAXB);
  bmesh.frustumCulled = false; bmesh.count = 0; G.scene.add(bmesh);
  rocketGeo = merge([P(cyl(0.09, 0.09, 0.7, 8), 0x3b4230, [0, 0, 0], [Math.PI / 2, 0, 0]), P(cone(0.09, 0.25, 8), 0x5a2a1a, [0, 0, -0.47], [-Math.PI / 2, 0, 0]), P(box(0.3, 0.02, 0.15), 0x222222, [0, 0, 0.3]), P(box(0.02, 0.3, 0.15), 0x222222, [0, 0, 0.3])]);

  laser = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1), new THREE.MeshBasicMaterial({ color: 0xfff0e8, toneMapped: false, fog: false }));
  const halo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 1), new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  laser.add(core, halo); laser.visible = false; laser.userData.halo = halo; G.scene.add(laser);

  drone = new THREE.Group();
  const parts = [P(box(0.5, 0.14, 0.6), 0x2a2d30, [0, 0, 0]), P(box(0.12, 0.12, 0.4), 0x1a1a1c, [0, -0.12, -0.2])];
  for (const x of [-0.42, 0.42]) for (const z of [-0.36, 0.36]) parts.push(P(cyl(0.22, 0.22, 0.02, 10), 0x15171a, [x, 0.08, z]), P(box(0.05, 0.05, 0.05), 0x2a2d30, [x, 0.04, z]));
  drone.add(new THREE.Mesh(merge(parts), MAT.gun)); drone.visible = false; G.scene.add(drone);
}

function fire(x, y, z, dir, dmg) {
  if (bullets.length >= MAXB) return;
  bullets.push({ x, y, z, vx: dir * BSPEED, dmg });
}

export function upgradeWeapon() {
  if (G.weaponTier < WEAPONS.length - 1) {
    setWeapon(G.weaponTier + 1);
    toast(WEAPONS[G.weaponTier].name, 'good big');
  } else {
    G.dmgMul += 0.25; toast('Урон +25%', 'good');
  }
  sfx.upgrade();
}

export function clearProjectiles() {
  bullets.length = 0; bmesh.count = 0;
  for (const r of rockets) { r.m.visible = false; rocketPool.push(r.m); } rockets.length = 0;
  for (const g of grenades) { g.m.visible = false; grenadePool.push(g.m); } grenades.length = 0;
  laser.visible = false; sfx.laser(false); air = null; grenadeCd = 3;
  drone.visible = rank('drone') > 0;
}

export function airstrike() {
  if (air || (G.mode !== 'run' && G.mode !== 'boss')) return false;
  air = { t: 0, k: 0 };
  toast('Авиаудар', 'bad'); sfx.jet();
  return true;
}

// Ближайшая к игроку цель в полосе пули
function hitScan(x, pz, nz, pad) {
  let best = null; const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive || e.z < nz - e.r || e.z > pz + e.r) continue;
    if (Math.abs(e.x - x) > e.r + pad) continue;
    if (!best || e.z > best.z) best = e;
  }
  return best;
}

export function updateWeapons(dt) {
  const h = G.hero, w = WEAPONS[G.weaponTier];
  const active = (G.mode === 'run' || G.mode === 'boss') && !h.dead;
  const dmgMul = G.dmgMul, rateMul = G.rateMul * (G.defend ? 0.5 : 1) * (G.cry > 0 ? 2 : 1);

  // --- героиня
  let lasing = false;
  if (active) {
    if (w.kind === 'laser') {
      lasing = true;
      const list = G.enemies; let hits = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive || e.z > 0.5 || e.z < RANGE || Math.abs(e.x - h.x) > e.r + 0.4) continue;
        damage(e, w.dps * dmgMul * dt, 0, -dt * 5);
        if (hits++ < 4 && Math.random() < 0.5) sparks(h.x, e.h * 0.7, e.z, 1, 1, 0.3, 0.15);
      }
      chargeGates(-1, RANGE, h.x, dt * 30);
      G.muzzle.color.set(0xff3a20); G.muzzle.intensity = 5;
    } else {
      h.fireCd -= dt;
      let guard = 0;
      while (h.fireCd <= 0 && guard++ < 4) {
        h.fireCd += 1 / (w.rate * rateMul);
        if (w.kind === 'rocket') {
          let m = rocketPool.pop();
          if (!m) { m = new THREE.Mesh(rocketGeo, MAT.gun); G.scene.add(m); }
          m.visible = true;
          rockets.push({ m, x: h.x + 0.1, z: -1.2, dmg: w.dmg * dmgMul, r: w.radius });
          sfx.rocket();
        } else {
          for (let p = 0; p < w.pellets; p++) {
            const dir = w.pellets > 1 ? (p - (w.pellets - 1) / 2) * w.spread + rand(-0.015, 0.015) : rand(-w.spread, w.spread);
            fire(h.x + 0.1, 1.38, -1.2, dir, w.dmg * dmgMul);
          }
          sfx.shot(G.weaponTier); casing(h.x + 0.22, 1.36, -0.5);
        }
        muzzle(h.x + 0.1, 1.38, -1.25);
        G.muzzle.color.set(0xffb060); G.muzzle.intensity = 6;
      }
    }
    // --- бойцы
    const sr = w.sRate * rateMul * G.sqRate * 1.6, sd = w.sDmg * dmgMul * G.sqDmg * 1.6;
    for (let i = 0; i < G.squad.length; i++) {
      const s = G.squad[i];
      s.cd -= dt;
      if (s.cd <= 0) { s.cd = rand(0.8, 1.2) / sr; fire(s.x + 0.08, 1.22, s.z - 0.9, rand(-0.02, 0.02), sd); if (Math.random() < 0.3) casing(s.x + 0.2, 1.2, s.z - 0.3); }
    }
    // --- дрон
    const dr = rank('drone');
    if (dr > 0) {
      drone.position.set(h.x + 1.7, 3 + Math.sin(G.time * 2.4) * 0.15, 1);
      drone.rotation.z = Math.sin(G.time * 3) * 0.06;
      droneCd -= dt;
      if (droneCd <= 0) {
        droneCd = dr > 1 ? 0.2 : 0.33;
        let tgt = null;
        for (const e of G.enemies) if (e.alive && e.z < -2 && e.z > -40 && (!tgt || e.z > tgt.z)) tgt = e;
        if (tgt) fire(drone.position.x, 1.3, 0, clamp((tgt.x - drone.position.x) / Math.max(4, -tgt.z), -0.5, 0.5), (9 + G.weaponTier * 4) * dmgMul);
      }
    }
    // --- гранаты
    const gr = rank('grenade');
    if (gr > 0) {
      grenadeCd -= dt;
      if (grenadeCd <= 0) {
        let tgt = null;
        for (const e of G.enemies) if (e.alive && !e.static && e.z < -5 && e.z > -28 && (!tgt || e.z > tgt.z)) tgt = e;
        if (tgt) {
          grenadeCd = [7, 5.5, 4][gr - 1];
          let m = grenadePool.pop();
          if (!m) { m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), MAT.steel); G.scene.add(m); }
          m.visible = true;
          grenades.push({ m, x0: h.x, x1: tgt.x, z1: tgt.z + (tgt.isBoss ? 0 : 4), t: 0 });
        }
      }
    }
  }
  laser.visible = lasing;
  sfx.laser(lasing && !G.paused);
  if (lasing) {
    const len = -RANGE, k = 0.8 + Math.random() * 0.4;
    laser.position.set(h.x + 0.1, 1.38, -1.2 - len / 2);
    laser.scale.set(1, 1, len); laser.userData.halo.scale.set(k, k, 1);
  }

  // --- пули
  const step = BSPEED * dt;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i], pz = b.z;
    b.z -= step; b.x += b.vx * dt;
    chargeGates(pz, b.z, b.x, 1);
    const e = hitScan(b.x, pz, b.z, 0.12);
    if (e) {
      damage(e, b.dmg, b.vx * 0.02, -0.9);
      if (e.static || e.isBoss) sparks(b.x, b.y, e.z + e.r, 2);
      bullets[i] = bullets[bullets.length - 1]; bullets.pop(); continue;
    }
    if (b.z < RANGE || Math.abs(b.x) > ROAD_HALF + 3) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
  }
  bmesh.count = bullets.length;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    _q.setFromAxisAngle(_up, Math.atan2(b.vx, -BSPEED) + Math.PI);
    _m.compose(_p.set(b.x, b.y, b.z), _q, _s);
    bmesh.setMatrixAt(i, _m);
  }
  bmesh.instanceMatrix.needsUpdate = true;

  // --- ракеты
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i], pz = r.z;
    r.z -= 40 * dt;
    r.m.position.set(r.x, 1.38, r.z); r.m.rotation.z += dt * 6;
    trail(r.x, 1.38, r.z + 0.5);
    const e = hitScan(r.x, pz, r.z, 0.25);
    if (e || r.z < RANGE) {
      if (e) { explosion(r.x, e.z, r.r); aoe(r.x, e.z, r.r, r.dmg); }
      r.m.visible = false; rocketPool.push(r.m); rockets.splice(i, 1);
    }
  }
  // --- гранаты
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t += dt / 0.75; g.z1 += G.scroll * dt;
    const p = Math.min(1, g.t);
    g.m.position.set(g.x0 + (g.x1 - g.x0) * p, 1.4 + Math.sin(p * Math.PI) * 4, g.z1 * p);
    if (p >= 1) {
      explosion(g.x1, g.z1, 3.2); aoe(g.x1, g.z1, 3.4, 180 * G.hpMul());
      g.m.visible = false; grenadePool.push(g.m); grenades.splice(i, 1);
    }
  }
  // --- авиаудар
  if (air) {
    air.t += dt;
    while (air && air.t > 0.9 + air.k * 0.07) {
      const z = -5 - air.k * 5.5;
      explosion(rand(-4, 4), z, 4.5, true); explosion(rand(-4.5, 4.5), z - 2, 3.5);
      if (++air.k >= 10) {
        for (const e of G.enemies) {
          if (!e.alive || e.static && e.type !== 'barrel') continue;
          if (e.isBoss) { if (G.boss && G.boss.state === 'fight') { e.hp -= e.maxHp * 0.08; if (e.hp <= 0) damage(e, 1); } }
          else damage(e, 500 * G.hpMul(), rand(-6, 6), -8, true);
        }
        air = null;
      }
    }
  }
}
