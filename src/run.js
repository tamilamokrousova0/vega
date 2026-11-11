// Бесконечный забег: сегменты → волна (5 сегментов + мини-босс + привал) → биом (3 волны + босс) → цикл.
// «Директор» покупает врагов на бюджет угрозы и подстраивает его под потери отряда (не более ±15%).
import { G, rand, clamp } from './state.js';
import { WORLDS, ENEMIES, SEGMENTS, SEG_DUR, SCROLL, UPGRADES, WEAPONS, SQUAD_MAX } from './config.js';
import { spawnEnemy } from './enemies.js';
import { spawnCrate, spawnCage, spawnMed, spawnBarrel, spawnBarricade } from './gates.js';
import { spawnBoss } from './boss.js';
import { addSoldiers } from './player.js';
import { upgradeWeapon, airstrike } from './weapons.js';
import { toast, dustBurst } from './fx.js';
import { setMood } from './world.js';
import { rank } from './arsenal.js';
import { sfx } from './audio.js';

const SEG_KEYS = Object.keys(SEGMENTS);
const WAVES = 3, SEGS = 5;
const THREAT = 4.3;     // масштаб бюджета угрозы: сколько «очков» врагов приходится на сегмент

export function worldDef(i) {
  const r = G.run, n = WORLDS.length;
  if (!r || i < n) return WORLDS[i % n];
  return WORLDS[r.order[i % n]];          // со второго цикла биомы идут в случайном порядке
}
export const cycleOf = i => Math.floor(i / WORLDS.length) + 1;

export function newRun(startWorld = 0, practice = false) {
  const order = WORLDS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]]; }
  G.run = {
    world: startWorld, cycle: cycleOf(startWorld), order, practice,
    seg: startWorld * WAVES * SEGS, segIdx: 0, wave: 0, type: 'avenue', def: SEGMENTS.avenue, t: 0, dur: SEG_DUR,
    rate: 1, spawnT: 1, gateT: 2, wallT: 99, sideT: 99, barrelT: rand(5, 9), cageT: 99, cages: 0, supplyT: 99,
    heavy: 0, last: null, used: new Set(), crateGiven: false,
    phase: 'seg', adapt: 1, losses: 0, eliteRef: null, bossLoss: false,
    score: 0, streak: 0, risk: 0, time: 0, dist: 0, kills: 0, perfect: 0, rescued: 0, worldsCleared: 0,
    event: null, eventLeft: 0, eventT: rand(100, 150), revived: false,
  };
  G.level = startWorld; G.ult = 0; G.cry = 0; G.elite = null; G.formation = 'square'; G.sqRate = 1; G.sqDmg = 1;
  G.mods = { vet: 0, medic: 0, meleeCd: 0.7, rollCd: 2, ultGain: 1 + 0.2 * rank('ultfast') };
  startSegment();
}

// ---------- Очки ----------
export function comboMul() { return 1 + Math.min(7, G.run.streak / 30); }
export function addScore(v) {
  const r = G.run;
  r.score += v * comboMul() * Math.pow(1.5, r.cycle - 1) * (r.event === 'blood' ? 2 : 1);
}
function chargeUlt(v) { G.ult = Math.min(100, G.ult + v * G.mods.ultGain); }

export function bindRunHooks() {
  const H = G.hooks;
  H.onKill = e => {
    const r = G.run; if (!r) return;
    r.kills++; r.streak++; addScore(e.def.cost * 10); chargeUlt(e.def.cost * 0.45);
    if (e.type === 'gold') { r.goldTokens = (r.goldTokens || 0) + 40; toast('Золотой зомби: +40 жетонов', 'good'); sfx.upgrade(); }
  };
  H.onHurt = () => { if (G.run) G.run.streak = Math.floor(G.run.streak / 2); };
  H.onLoss = () => { if (G.run) { G.run.losses++; G.run.bossLoss = true; } };
  H.onPerfect = () => { const r = G.run; if (!r) return; r.perfect++; addScore(500); chargeUlt(25); G.slowmo = 1.1; toast('Идеальное уклонение', 'good'); sfx.gateGood(); };
  H.onMelee = killed => { chargeUlt(3); if (killed) { addScore(250); const h = G.hero; h.armor = Math.min(h.maxArmor, h.armor + 3); } };
  H.onRisk = () => { if (G.run) G.run.risk = 60; };
  H.onCrate = e => { if (e.kind === 'weapon') { G.run.lastGun = G.run.time; upgradeWeapon(); } else loot(); };
  H.onPickup = e => {
    const r = G.run, h = G.hero;
    if (e.type === 'cage') { const full = G.squad.length >= SQUAD_MAX; addSoldiers(1); r.rescued++; addScore(300); toast(full ? 'Боец спасён: урон отряда +10%' : 'Боец спасён', 'good'); sfx.gateGood(); }
    else { h.armor = Math.min(h.maxArmor, h.armor + 35); toast('Броня +35', 'good'); sfx.gateGood(); }
  };
}

// Случайное улучшение из ящика (ворот больше нет — всё снаряжение лежит в ящиках)
function loot() {
  const h = G.hero, x = Math.random(), full = G.squad.length >= SQUAD_MAX;
  if (x < 0.22 && !full) { addSoldiers(1); toast('+1 боец', 'good'); }
  else if (x < 0.46) { G.sqRate += 0.15; toast('Отряд: темп огня +15%', 'good'); }
  else if (x < 0.70) { G.sqDmg += 0.2; toast('Отряд: урон +20%', 'good'); }
  else if (x < 0.82 && h.armor < h.maxArmor - 10) { h.armor = Math.min(h.maxArmor, h.armor + 30); toast('Броня +30', 'good'); }
  else if (x < 0.92) { chargeUlt(35); toast('Заряд ульты +35%', 'good'); }
  else if (G.weaponTier < WEAPONS.length - 1 && x > 0.96 && G.run.time - (G.run.lastGun || -99) > 90) { G.run.lastGun = G.run.time; upgradeWeapon(); }
  else { G.sqDmg += 0.2; toast('Отряд: урон +20%', 'good'); }
  sfx.gateGood();
}

export function useUlt() {
  if (G.ult < 100 || G.hero.dead || (G.mode !== 'run' && G.mode !== 'boss')) return;
  if (G.ultKind === 'cry') { G.cry = 5; G.ult = 0; toast('Боевой клич', 'good'); sfx.roar(); }
  else if (airstrike()) G.ult = 0;
}

// Сила отряда: суммарный урон в секунду (Вега + бойцы, с учётом ворот и улучшений)
export function squadPower() {
  const w = WEAPONS[G.weaponTier];
  const hero = w.kind === 'laser' ? w.dps : w.rate * w.dmg * (w.pellets || 1) * (w.kind === 'rocket' ? 1.6 : 1);
  const squad = G.squad.length * w.sRate * w.sDmg * 2.56 * G.sqRate * G.sqDmg * G.dmgMul * G.rateMul;
  return hero * G.dmgMul * (w.kind === 'laser' ? 1 : G.rateMul) + squad;
}
// Здоровье врагов подтягивается к силе отряда: число врагов ограничено движком, дальше растёт живучесть
function threatHp(rate, k) {
  const base = rate * 24 * G.hpMul();
  const want = 0.36 * squadPower() * G.run.adapt * k;
  return clamp(Math.pow(Math.max(1, want / Math.max(1, base)), 0.75), 1, 10);
}

// ---------- Сегменты ----------
function pickSegment() {
  const r = G.run;
  if (r.seg === 1 && !r.practice) return 'avenue';
  if (r.heavy >= 2) return 'supply';
  let pool = SEG_KEYS.filter(k => k !== r.last && !r.used.has(k));
  if (!pool.length) pool = SEG_KEYS.filter(k => k !== r.last);
  if (r.seg < 3) pool = pool.filter(k => !SEGMENTS[k].heavy) ;
  return pool[Math.random() * pool.length | 0] || 'avenue';
}

function startSegment() {
  const r = G.run;
  // подстройка под потери за прошлый сегмент
  if (r.seg > 0) {
    if (r.losses > Math.max(2, G.squad.length * 0.25)) r.adapt = Math.max(0.85, r.adapt - 0.07);
    else if (r.losses === 0) r.adapt = Math.min(1.15, r.adapt + 0.04);
  }
  r.losses = 0; r.seg++;
  const type = pickSegment(), def = SEGMENTS[type];
  r.type = type; r.def = def; r.last = type; r.used.add(type);
  if (def.heavy) r.heavy++; else if (type === 'supply') r.heavy = 0;
  r.t = 0; r.dur = def.dur || SEG_DUR; r.phase = 'seg';
  const budget = THREAT * 40 * Math.pow(1 + 0.09 * r.seg, 1.4) * Math.pow(1.35, r.cycle - 1) * r.adapt * def.k;
  // поток врагов не превышает того, что отряд способен перемолоть (примерно половина его урона в секунду)
  const afford = 0.42 * squadPower() * r.adapt * def.k / (24 * G.hpMul());
  r.rate = Math.max(1.5 * def.k, Math.min(budget / r.dur, 24 * def.k, afford)); r.spawnT = 1.2;
  r.hpK = threatHp(r.rate, def.k);
  r.gateT = def.crate ? 2.5 : 1e9; r.wallT = def.wall ? rand(5, 9) : 1e9; r.sideT = def.sides ? 2.5 : 1e9;
  r.cages = def.cages || 0; r.cageT = 2.5; r.supplyT = def.supply ? 2 : 1e9;
  const tag = { barricade: 'Держать оборону', ambush: 'Засада', panic: 'Паника: бегуны', rescue: 'Спасите пленных', narrow: 'Узкое место', supply: 'Снабжение', gates: 'Склад: ящики со снаряжением' }[type];
  if (tag) toast(tag, def.heavy ? 'bad' : 'good');
}

function pickType(def) {
  const w = worldDef(G.run.world);
  if (def.force) return def.force;
  let mix = w.mix;
  if (def.close) mix = mix.filter(m => m[0] === 'walker' || m[0] === 'runner' || m[0] === 'crawler');
  let total = 0; for (const m of mix) total += m[1];
  let x = Math.random() * total;
  for (const m of mix) { x -= m[1]; if (x <= 0) return m[0]; }
  return 'walker';
}

function spawnGroup(def, rateK) {
  const r = G.run, type = pickType(def), ed = ENEMIES[type];
  let n = ed.group[0] + (Math.random() * (ed.group[1] - ed.group[0] + 1) | 0);
  const cost = n * ed.cost;
  r.spawnT += cost / (r.rate * rateK);
  if (def.close) {                         // из люков и с обочин, вплотную
    const side = Math.random() < 0.5 ? -1 : 1, z0 = rand(-30, -20);
    dustBurst(side * 4.6, z0, 6);
    for (let k = 0; k < n; k++) spawnEnemy(type, side * rand(3.6, 4.9), z0 - rand(0, 4), { hpK: r.hpK, rise: 1 });
  } else if (def.stop) {
    const cx = rand(-4, 4);
    for (let k = 0; k < n; k++) spawnEnemy(type, clamp(cx + rand(-1.9, 1.9), -4.9, 4.9), -40 - rand(0, 8), { fast: 2.2, hpK: r.hpK, rise: 1 });
  } else {
    const cx = rand(-4, 4);
    for (let k = 0; k < n; k++) spawnEnemy(type, clamp(cx + rand(-1.9, 1.9), -4.9, 4.9), -56 - rand(0, 9), { hpK: r.hpK, rise: 1 });
  }
}

function updateSegment(dt) {
  const r = G.run, def = r.def, moving = G.scroll > 3;
  r.t += dt;
  const blood = r.event === 'blood' ? 2 : 1;
  r.spawnT -= dt;
  let guard = 0;
  while (r.spawnT <= 0 && G.enemies.length < 240 && guard++ < 8) spawnGroup(def, blood);
  if (r.spawnT < -2) r.spawnT = 0;
  if (moving) {
    if ((r.gateT -= dt) <= 0) { r.gateT = def.crate * rand(0.8, 1.25); spawnCrate(rand(-4, 4), -66); }
    if ((r.wallT -= dt) <= 0) { r.wallT = def.wall * rand(0.8, 1.3); spawnBarricade(rand(-3.4, 3.4), -70); }
    if ((r.sideT -= dt) <= 0) { r.sideT = def.sides; spawnBarricade(-3.7, -72); spawnBarricade(3.7, -72); }
    if ((r.barrelT -= dt) <= 0) { r.barrelT = rand(6, 11); spawnBarrel(rand(-4.3, 4.3), -66); }
    if (r.cages > 0 && (r.cageT -= dt) <= 0) { r.cages--; r.cageT = 8; spawnCage((Math.random() < 0.5 ? -1 : 1) * 4.2, -68); }
    if ((r.supplyT -= dt) <= 0) {
      r.supplyT = 1e9;
      if (!r.crateGiven) { r.crateGiven = true; spawnCrate(rand(-3, 3), -66, 'weapon'); }
      spawnMed(rand(-3.8, 3.8), -76); spawnCage((Math.random() < 0.5 ? -1 : 1) * 4.2, -88);
    }
  }
  if (r.t >= r.dur) {
    r.segIdx++;
    if (r.segIdx < SEGS) startSegment();
    else if (r.wave < WAVES - 1) startMini();
    else startBoss();
  }
}

function startMini() {
  const r = G.run;
  r.phase = 'mini'; r.t = 0; r.def = SEGMENTS.avenue; r.type = 'mini';
  r.rate = THREAT * 40 * Math.pow(1 + 0.09 * r.seg, 1.4) * Math.pow(1.35, r.cycle - 1) * 0.3 / SEG_DUR; r.spawnT = 2;
  r.hpK = threatHp(r.rate, 0.6);
  const e = spawnEnemy('brute', 0, -66, { hpK: Math.max((1 + 0.35 * r.wave) * Math.pow(1.35, r.cycle - 1), squadPower() * 9 / (1500 * G.hpMul())) });
  G.elite = e; r.eliteRef = e;
  toast('Мини-босс: Громила', 'big'); sfx.roar();
}

export function startBoss() {
  const r = G.run;
  r.phase = 'boss'; r.bossLoss = false; r.type = 'boss';
  G.mode = 'boss';
  // бой с боссом рассчитан примерно на 40 с огня всем отрядом, но не короче базового здоровья
  G.bossHpMin = squadPower() * 14;
  spawnBoss(worldDef(r.world).boss);
}

// ---------- Привал ----------
function openRest(kind) {
  const r = G.run;
  r.phase = 'rest'; r.restKind = kind;
  const pool = UPGRADES.filter(u => !(u.id === 'weapon' && (kind !== 'mini' || G.weaponTier >= WEAPONS.length - 1 || Math.random() < 0.6)) && !(u.id === 'roll' && G.mods.rollCd < 2) && !(u.id === 'melee' && G.mods.meleeCd < 0.7));
  const opts = [];
  while (opts.length < 3 && pool.length) opts.push(pool.splice(Math.random() * pool.length | 0, 1)[0]);
  G.resting = true;
  G.hooks.showRest(opts, kind);
}

export function chooseUpgrade(id) {
  const r = G.run, h = G.hero;
  switch (id) {
    case 'men': addSoldiers(2); break;
    case 'sqdmg': G.sqDmg += 0.35; break;
    case 'sqrate': G.sqRate += 0.25; break;
    case 'dmg': G.dmgMul += 0.25; break;
    case 'rate': G.rateMul += 0.2; break;
    case 'armor': h.maxArmor += 20; h.armor = Math.min(h.maxArmor, h.armor + 50); break;
    case 'weapon': upgradeWeapon(); break;
    case 'ult': G.ult = 100; G.mods.ultGain *= 1.3; break;
    case 'vets': G.mods.vet += 0.2; break;
    case 'medic': G.mods.medic += 1; break;
    case 'melee': G.mods.meleeCd = 0.35; break;
    case 'roll': G.mods.rollCd = 1.2; break;
  }
  G.resting = false;
  if (r.restKind === 'boss') nextWorld();
  else { r.wave++; r.segIdx = 0; startSegment(); }
}

function nextWorld() {
  const r = G.run;
  r.world++; r.wave = 0; r.segIdx = 0; r.used.clear(); r.heavy = 0; r.crateGiven = false;
  const c = cycleOf(r.world);
  G.level = r.world; G.mode = 'run';
  G.hooks.enterWorld(r.world);
  if (c !== r.cycle) { r.cycle = c; toast(`Цикл ${c}: заражённые мутируют`, 'bad'); }
  startSegment();
}

// Босс биома повержен (вызывается после анимации гибели)
export function bossDefeated() {
  const r = G.run;
  addScore(50000 * r.cycle * (r.bossLoss ? 1 : 2));
  if (!r.bossLoss) toast('Босс без потерь: награда ×2', 'good');
  r.worldsCleared++;
  upgradeWeapon();
  openRest('boss');
}

// ---------- События забега ----------
function updateEvents(dt) {
  const r = G.run;
  if (r.event) {
    if ((r.eventLeft -= dt) <= 0) { r.event = null; setMood(1, 0); r.eventT = rand(110, 170); toast('Событие закончилось'); }
    return;
  }
  if (r.phase !== 'seg' || (r.eventT -= dt) > 0) return;
  const k = Math.random();
  if (k < 0.4) { r.event = 'blood'; r.eventLeft = 60; setMood(1, 1); toast('Кровавая луна: врагов ×2, очков ×2', 'bad'); sfx.roar(); }
  else if (k < 0.7) { r.event = 'fog'; r.eventLeft = 60; setMood(0.42, 0); toast('Туман: видимость падает', 'bad'); }
  else { spawnEnemy('gold', rand(-3, 3), -22); r.eventT = rand(110, 170); toast('Золотой зомби! Не упустите', 'good'); }
}

export function updateRun(dt) {
  const r = G.run; if (!r) return;
  r.time += dt; r.dist += G.scroll * dt;
  if (r.risk > 0) r.risk -= dt;
  if (G.cry > 0) G.cry -= dt;
  addScore(G.scroll * dt * 10);
  const stop = r.phase === 'boss' || (r.phase === 'seg' && r.def.stop);
  G.scrollTarget = stop ? 0 : SCROLL * (G.defend ? 0.5 : 1);
  updateEvents(dt);
  if (r.phase === 'seg') updateSegment(dt);
  else if (r.phase === 'mini') {
    r.t += dt; r.spawnT -= dt;
    if (r.spawnT <= 0 && G.enemies.length < 200) spawnGroup(SEGMENTS.avenue, 1);
    const e = r.eliteRef;
    if (!e || !e.alive) {
      if (e && e.hp <= 0) { addScore(10000 * r.cycle); toast('Мини-босс уничтожен', 'good'); }
      G.elite = null; r.eliteRef = null;
      openRest('mini');
    }
  }
}
