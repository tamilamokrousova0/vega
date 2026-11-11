// Боссы: вход, атаки с телеграфом, гибель
import { G, rand, clamp } from './state.js';
import { BOSSES, ROAD_HALF } from './config.js';
import { makeChar, animChar } from './models.js';
import { spawnEnemy, addZone } from './enemies.js';
import { explosion, blood, toast, shake } from './fx.js';
import { sfx } from './audio.js';

const HOLD = -17;
const LANES = [-3.9, -1.3, 1.3, 3.9];

export function spawnBoss(key) {
  const def = BOSSES[key];
  const c = makeChar(def.model, def.scale);
  c.root.rotation.y = Math.PI; G.scene.add(c.root);
  const hp = Math.max(def.hp * Math.pow(1.5, (G.run ? G.run.cycle : 1) - 1), (G.bossHpMin || 0) * (def.armored ? 0.6 : 1));
  const e = { type: 'boss', isBoss: true, c, pool: null, x: 0, z: -80, r: def.r, h: def.scale * 1.2, hp, maxHp: hp, alive: true };
  c.root.position.set(0, 0, e.z);
  G.enemies.push(e);
  G.boss = { e, def, key, state: 'enter', cd: 1.6, atk: 0, lunge: 0, lungeDelay: -1, tx: 0, vuln: 0, dying: 0, t: 0 };
  toast(def.name, 'big'); sfx.roar();
}

export function removeBoss() {
  if (!G.boss) return;
  G.scene.remove(G.boss.e.c.root);
  G.boss = null;
}

function minions(b, type, n, fast) {
  for (let i = 0; i < n; i++) spawnEnemy(type, clamp(b.e.x + rand(-4, 4), -4.8, 4.8), b.e.z - rand(1, 7), { fast, rise: 1 });
}

function attack(b, name) {
  const h = G.hero, e = b.e, lim = ROAD_HALF - 0.6;
  const from = { x: e.x, y: e.h, z: e.z };
  const hard = e.hp < e.maxHp * 0.5;
  switch (name) {
    case 'charge': {
      const x = clamp(h.x, -lim + 1, lim - 1);
      addZone({ shape: 'lane', x, w: 3.4, dur: 1.25, dmg: 35, src: 'boss' });
      b.tx = x; b.lungeDelay = 0.95; sfx.warn();
      break;
    }
    case 'slam': {
      const first = Math.random() < 0.5 ? -1 : 1;
      addZone({ shape: 'lane', x: first * ROAD_HALF / 2, w: ROAD_HALF, dur: 1.3, dmg: 30, src: 'boss' });
      addZone({ shape: 'lane', x: -first * ROAD_HALF / 2, w: ROAD_HALF, dur: 1.1, delay: 1.5, dmg: 30, src: 'boss' });
      sfx.warn();
      break;
    }
    case 'roots': {
      const safe = Math.random() * 4 | 0;
      LANES.forEach((x, i) => { if (i !== safe) addZone({ shape: 'lane', x, w: 2.6, dur: hard ? 1.25 : 1.5, dmg: 30, src: 'boss', color: 0x8a5a1e }); });
      sfx.warn();
      break;
    }
    case 'spit': {
      const n = hard ? 4 : 3;
      for (let i = 0; i < n; i++)
        addZone({ x: clamp(h.x + (i - (n - 1) / 2) * 2.6 + rand(-0.4, 0.4), -lim, lim), z: rand(0.2, 3.5), r: 1.7, dur: 1.3 + i * 0.18, dmg: 22, src: 'boss', fx: 'acid', color: 0x7fae2a, from });
      break;
    }
    case 'rockets': {
      const n = hard ? 8 : 6;
      addZone({ x: h.x, z: 0.5, r: 1.6, dur: 1.2, dmg: 28, src: 'boss', from });
      for (let i = 0; i < n; i++)
        addZone({ x: rand(-lim, lim), z: rand(0, 5.5), r: 1.5, dur: 1.2, delay: 0.25 + i * 0.22, dmg: 28, src: 'boss', from });
      sfx.warn();
      break;
    }
    case 'spawnWalker': minions(b, 'walker', 7 + G.level * 2, 2.6); break;
    case 'spawnCrawler': minions(b, 'crawler', 8 + G.level, 1.5); break;
    case 'spawnRunner': minions(b, 'runner', 5 + G.level, 1.2); break;
    case 'spawnExploder': minions(b, 'exploder', 3, 1.6); break;
  }
  if (b.def.armored) b.vuln = 2.4;
  if (e.c.actor && e.c.actor.attack) e.c.actor.attack(name);
}

export function updateBoss(dt) {
  const b = G.boss; if (!b) return;
  const e = b.e, c = e.c;
  b.t += dt;
  if (b.state === 'enter') {
    e.z += 20 * dt;
    animChar(c, b.t * 5, 1);
    if (e.z >= HOLD) { e.z = HOLD; b.state = 'fight'; sfx.roar(); shake(0.5); }
  } else if (b.state === 'fight') {
    const hard = e.hp < e.maxHp * 0.5;
    b.vuln -= dt;
    if (b.lungeDelay > 0) {
      b.lungeDelay -= dt;
      if (b.lungeDelay <= 0) b.lunge = 0.7;
    }
    if (b.lunge > 0) {
      b.lunge -= dt;
      e.z = HOLD + Math.sin(Math.max(0, 1 - b.lunge / 0.7) * Math.PI) * 15;
      if (b.lunge <= 0) { e.z = HOLD; b.tx = rand(-3, 3); }
    } else if (b.lungeDelay <= 0) {
      if (Math.abs(b.tx - e.x) < 0.3 && Math.random() < dt * 0.8) b.tx = rand(-3.4, 3.4);
      b.cd -= dt;
      if (b.cd <= 0) {
        attack(b, b.def.attacks[b.atk % b.def.attacks.length]); b.atk++;
        b.cd = b.def.cd * (hard ? 0.7 : 1);
      }
    }
    e.x += clamp(b.tx - e.x, -5 * dt, 5 * dt);
    animChar(c, b.t * (hard ? 5 : 3.5), b.lunge > 0 ? 1.4 : 0.7);
    if (c.core) c.core.material.color.setHex(b.vuln > 0 ? 0xffe08a : 0xff5a14);
  } else if (b.state === 'dying') {
    b.dying -= dt;
    if (c.actor) animChar(c, 0, 0);          // скелетный босс падает своей анимацией
    else {
      c.root.rotation.x = Math.min(1.45, c.root.rotation.x + dt * 0.9);
      c.root.position.y = -Math.max(0, c.root.rotation.x - 0.6) * 0.5;
    }
    if (Math.random() < dt * 9) {
      explosion(e.x + rand(-2, 2), e.z + rand(-1, 3), 2.5, Math.random() < 0.3);
      blood(e.x + rand(-1, 1), rand(1, e.h), e.z + 1, 14, 1.6);
    }
    if (b.dying <= 0) { removeBoss(); G.hooks.onLevelComplete(); return; }
  }
  c.root.position.x = e.x; c.root.position.z = e.z;
}

export function bossKilled() {
  const b = G.boss; if (!b) return;
  b.state = 'dying'; b.dying = 2.8;
  if (b.e.c.actor && b.e.c.actor.die) b.e.c.actor.die();
  explosion(b.e.x, b.e.z + 1, 5, true); sfx.roar();
}
