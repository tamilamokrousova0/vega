// Игровой цикл, интерфейс, экраны
import * as THREE from '../vendor/three.module.min.js';
import { G, rand, clamp } from './state.js';
import { WEAPONS, BOSSES, WORLDS, SEGMENTS } from './config.js';
import { initWorld, setBiome, updateWorld } from './world.js';
import { initFx, updateFx, setFxScale, toast, explosion } from './fx.js';
import { initPlayer, updatePlayer, resetSquad, setWeapon } from './player.js';
import { updateEnemies, updateZones, clearEnemies, aoe } from './enemies.js';
import { initWeapons, updateWeapons, clearProjectiles } from './weapons.js';
import { updateGates, clearGates } from './gates.js';
import { updateBoss, bossKilled, removeBoss } from './boss.js';
import { save, loadSave, persist, rank, renderArsenal, cleanName } from './arsenal.js';
import { sfx } from './audio.js';
import { initPhysics, updatePhysics, clearPhysics } from './physics.js';
import { initAmbient, updateAmbient } from './ambient.js';
import { loadActors, updateActors } from './actors.js';
import { loadTextures, detail } from './textures.js';
import { MAT } from './models.js';
import { newRun, updateRun, bindRunHooks, chooseUpgrade, useUlt, worldDef, comboMul, bossDefeated, startBoss } from './run.js';

const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), menu: $('menu'), arsenal: $('arsenal'), result: $('result'), pause: $('pause'), rest: $('rest'), fade: $('fade'),
  lvlName: $('lvlName'), prog: $('prog'), squadN: $('squadN'), wName: $('wName'), armor: $('armor'), score: $('score'), combo: $('combo'),
  bossBar: $('bossBar'), bossName: $('bossName'), bossHp: $('bossHp'), bossNote: $('bossNote'), mods: $('mods'),
  squadTag: $('squadTag'), hurt: $('hurt'), btnRoll: $('btnRoll'), btnDef: $('btnDef'), btnUlt: $('btnUlt'), rollCd: $('rollCd'), ultBar: $('ultBar'), ultName: $('ultName'),
};
const show = (el, on) => el.classList.toggle('hidden', !on);
const params = new URLSearchParams(location.search);
const fmt = n => Math.floor(n).toLocaleString('ru-RU');
const ULT = { air: 'Авиаудар', cry: 'Боевой клич' };
const REVIVE_COST = 60;

let arsenalFrom = 'menu', fadeT = 0;
let pendingT = 0, pendingFn = null;
const later = (t, fn) => { pendingT = t; pendingFn = fn; };

// ---------- Забег ----------
function enterWorld(i, first = false) {
  const w = worldDef(i);
  clearEnemies(); clearGates(); clearProjectiles(); removeBoss();
  setBiome(w.biome);
  G.charges.shield = rank('shield');
  fadeT = 1.3;
  show(ui.bossBar, false);
  toast(w.name, 'big');
  if (!first || i === 0) setTimeout(() => { if (G.mode !== 'menu') toast(w.brief, 'radio'); }, 2400);
}

function startRun(world = 0, practice = false) {
  clearPhysics();
  G.weaponTier = practice ? Math.min(world, 4) : 0; G.kills = 0;
  resetSquad(Math.min(8, 2 + rank('squad') + (practice ? Math.min(world, 3) : 0)));
  G.sqRate = 1; G.sqDmg = 1 + (practice ? world * 0.3 : 0);
  setWeapon(G.weaponTier);
  G.dmgMul = 1 + 0.05 * rank('ap'); G.rateMul = 1;
  G.charges.medkit = rank('medkit');
  G.ultKind = save.ult;
  G.mode = 'run'; G.paused = false; G.resting = false; G.timeScale = 1; G.slowmo = 0;
  pendingFn = null;
  newRun(world, practice);
  if (practice) G.sqDmg = 1 + world * 0.3;
  enterWorld(world, true);
  show(ui.menu, false); show(ui.result, false); show(ui.arsenal, false); show(ui.pause, false); show(ui.rest, false); show(ui.hud, true);
  ui.ultName.textContent = ULT[G.ultKind];
}

G.hooks.enterWorld = i => enterWorld(i);
G.hooks.showRest = (opts, kind) => {
  $('restTitle').textContent = kind === 'boss' ? 'Биом зачищен' : 'Привал';
  $('restSub').textContent = kind === 'boss'
    ? `Трофейное оружие: ${WEAPONS[G.weaponTier].name}. Выберите улучшение — и дальше, в следующий биом.`
    : 'Мини-босс позади. Выберите одно улучшение на этот забег.';
  const list = $('restList'); list.innerHTML = '';
  for (const o of opts) {
    const b = document.createElement('button');
    const t = document.createElement('b'); t.textContent = o.name;
    const d = document.createElement('span'); d.textContent = o.desc;
    b.append(t, d);
    b.onclick = () => { sfx.upgrade(); show(ui.rest, false); chooseUpgrade(o.id); };
    list.appendChild(b);
  }
  if (kind === 'boss') { save.cleared = Math.max(save.cleared, Math.min(G.run.world + 1, 99)); persist(); }
  show(ui.rest, true); sfx.laser(false);
};
G.hooks.onHeroDead = () => {
  G.mode = 'dead'; G.scrollTarget = 0;
  toast('Вега пала', 'bad');
  later(1.8, showResult);
};
G.hooks.onBossKilled = () => { bossKilled(); show(ui.bossBar, false); };
G.hooks.onLevelComplete = () => { if (G.mode === 'boss') bossDefeated(); };
bindRunHooks();

function boardRows(el, title, mark) {
  el.innerHTML = '';
  if (!save.board.length) return;
  const h = document.createElement('h4'); h.textContent = title; el.appendChild(h);
  save.board.forEach((r, i) => {
    const d = document.createElement('div'); if (r === mark) d.className = 'me';
    const who = document.createElement('span'); who.textContent = `${i + 1}. ${r.name || 'Без имени'}`;
    d.appendChild(who);
    d.appendChild(document.createTextNode(` · ${r.world} · ${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`));
    const b = document.createElement('b'); b.textContent = fmt(r.score); d.appendChild(b); el.appendChild(d);
  });
}

function showResult() {
  const r = G.run, w = worldDef(r.world);
  const earned = Math.floor(r.score / 4000) + r.worldsCleared * 30 + (r.goldTokens || 0);
  if (!r.paid) { r.paid = 0; }
  save.tokens += earned - r.paid; r.paid = earned;
  let mine = null;
  if (!r.practice) {
    if (r.entry) save.board.splice(save.board.indexOf(r.entry), 1);
    mine = r.entry = { name: save.name, score: Math.floor(r.score), world: w.name.split(' — ')[0], time: r.time, date: Date.now() };
    save.board.push(mine); save.board.sort((a, b) => b.score - a.score); save.board = save.board.slice(0, 10);
  }
  persist();
  const place = mine ? save.board.indexOf(mine) : -1;
  $('resTitle').textContent = 'Вега пала';
  const who = save.name ? `Позывной: ${save.name}. ` : '';
  $('resSub').textContent = who + (r.practice ? `Тренировка: ${w.name}. В таблицу не идёт.`
    : place === 0 ? 'Новый рекорд. Линия держалась дольше, чем когда-либо.'
    : place > 0 ? `Место в таблице: ${place + 1}.` : 'В десятку лучших забег не попал.');
  const st = $('resStats'); st.innerHTML = '';
  const row = (k, v) => { const d = document.createElement('div'); d.textContent = k; const b = document.createElement('b'); b.textContent = v; d.appendChild(b); st.appendChild(d); };
  row('Очки', fmt(r.score));
  row('Дошла до', `${w.name.split(' — ')[0]}, волна ${r.wave + 1}`);
  row('Время забега', `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`);
  row('Уничтожено заражённых', r.kills);
  row('Идеальных уклонений', r.perfect);
  row('Спасено бойцов', r.rescued);
  row('Получено жетонов', '+' + earned);
  boardRows($('resBoard'), 'Лучшие забеги', mine);
  const rv = $('resRevive');
  show(rv, !r.revived && save.tokens >= REVIVE_COST);
  rv.textContent = `Воскресить Вегу · ${REVIVE_COST} жетонов`;
  show(ui.result, true); show(ui.hud, false);
  sfx.laser(false);
}

function revive() {
  const r = G.run, h = G.hero;
  if (r.revived || save.tokens < REVIVE_COST) return;
  save.tokens -= REVIVE_COST; persist(); r.revived = true;
  h.dead = false; h.armor = h.maxArmor * 0.6; h.inv = 2.5;
  h.c.root.rotation.set(0, 0, 0); h.c.root.position.y = 0;
  explosion(h.x, -2, 5, true); aoe(h.x, -2, 9, 600 * G.hpMul());
  G.mode = r.phase === 'boss' ? 'boss' : 'run';
  show(ui.result, false); show(ui.hud, true);
  toast('Никого не бросаем', 'good');
}

function toMenu() {
  G.mode = 'menu'; G.scrollTarget = 0; G.paused = false; G.resting = false; G.timeScale = 1; G.defend = false;
  clearEnemies(); clearGates(); removeBoss(); clearProjectiles(); clearPhysics();
  pendingFn = null; G.run = null; G.narrow = false; G.elite = null; G.formation = 'square'; fadeT = 0; ui.fade.style.opacity = 0;
  resetSquad(0); setWeapon(0);
  setBiome(WORLDS[Math.min(save.cleared, WORLDS.length - 1)].biome);
  show(ui.hud, false); show(ui.result, false); show(ui.arsenal, false); show(ui.pause, false); show(ui.rest, false); show(ui.menu, true);
  const cont = $('btnContinue'), wi = Math.min(save.cleared, WORLDS.length - 1);
  show(cont, save.cleared > 0);
  cont.textContent = `Тренировка: ${WORLDS[wi].name.split(' — ')[0]} · без рекорда`;
  $('btnUltPick').textContent = 'Ульта: ' + ULT[save.ult];
  boardRows($('menuBoard'), 'Лучшие забеги', null);
  nickEl.value = save.name; syncNick();
}

// ---------- Позывной ----------
const nickEl = $('nick');
let gameReady = false;             // пока модели грузятся, забег запускать нельзя
function syncNick() {
  const ok = gameReady && cleanName(nickEl.value).length >= 2;
  $('btnStart').disabled = !ok; $('btnContinue').disabled = !ok;
  return ok;
}
function commitNick() {
  if (!syncNick()) { nickEl.focus(); return false; }
  save.name = cleanName(nickEl.value); nickEl.value = save.name; persist(); nickEl.blur();
  return true;
}
nickEl.addEventListener('input', syncNick);
nickEl.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && gameReady && commitNick()) { sfx.init(); startRun(0, false); } });
nickEl.addEventListener('keyup', e => e.stopPropagation());

// ---------- Кнопки ----------
function bind(id, fn) { $(id).addEventListener('click', () => { sfx.init(); sfx.click(); fn(); }); }
bind('btnStart', () => { if (commitNick()) startRun(0, false); });
bind('btnContinue', () => { if (commitNick()) startRun(Math.min(save.cleared, WORLDS.length - 1), true); });
bind('btnUltPick', () => { save.ult = save.ult === 'air' ? 'cry' : 'air'; persist(); $('btnUltPick').textContent = 'Ульта: ' + ULT[save.ult]; });
bind('btnArsenal', () => openArsenal('menu'));
bind('resArsenal', () => openArsenal('result'));
bind('arsBack', () => { show(ui.arsenal, false); if (arsenalFrom === 'menu') show(ui.menu, true); else { show(ui.result, true); show($('resRevive'), !G.run.revived && save.tokens >= REVIVE_COST); } });
bind('resNext', () => startRun(G.run.practice ? G.run.world % WORLDS.length : 0, G.run.practice));
bind('resRevive', revive);
bind('resMenu', toMenu);
bind('btnResume', () => setPaused(false));
bind('btnQuit', toMenu);
bind('muteBtn', () => { sfx.setMuted(!sfx.muted); $('muteBtn').textContent = 'Звук: ' + (sfx.muted ? 'выкл' : 'вкл'); });
// боевые кнопки (для телефона и мыши)
ui.btnRoll.addEventListener('pointerdown', e => { e.preventDefault(); G.input.roll = true; });
ui.btnUlt.addEventListener('pointerdown', e => { e.preventDefault(); useUlt(); });
ui.btnDef.addEventListener('pointerdown', e => { e.preventDefault(); G.input.defend = true; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) ui.btnDef.addEventListener(ev, () => { G.input.defend = false; });

function openArsenal(from) {
  arsenalFrom = from;
  show(ui.menu, false); show(ui.result, false); show(ui.arsenal, true);
  renderArsenal($('arsList'), $('arsTok'));
}
function setPaused(p) {
  if ((G.mode !== 'run' && G.mode !== 'boss') || G.resting) return;
  G.paused = p; show(ui.pause, p);
  if (p) sfx.laser(false);
}
window.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!G.paused);
  else if (e.code === 'Space') e.preventDefault();
  else if (e.code === 'KeyQ') useUlt();
  else if (e.code === 'KeyM') $('muteBtn').click();
});
window.addEventListener('pointerdown', () => sfx.init(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden && !params.has('world')) setPaused(true); });

// ---------- Камера и HUD ----------
const camPos = new THREE.Vector3(0, 9, 11), camLook = new THREE.Vector3(0, 1, -9);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
let menuLight;

function updateCamera(dt) {
  const h = G.hero, cam = G.camera;
  if (G.mode === 'menu') {
    const p = G.portrait;
    _a.set(h.x - (p ? 0.5 : 1.1) + Math.sin(G.time * 0.35) * 0.35, p ? 1.2 : 1.5, p ? -4.8 : -3.1);
    _b.set(h.x + (p ? 0 : 0.85), p ? 0.2 : 1.15, 0);
  } else {
    // почти от третьего лица: камера низко за спиной Веги; на боссе немного отъезжает и поднимается
    const cx = h.x * 0.8, far = G.mode === 'boss' ? 1.3 : 1;
    if (G.portrait) { _a.set(cx, 5.2 * far, 8.6 * far); _b.set(cx * 0.9, 1.4, -14); }
    else { _a.set(cx, 3.7 * far, 6.6 * far); _b.set(cx * 0.9, 1.5, -15); }
  }
  const k = 1 - Math.exp(-dt * 4.5);
  camPos.lerp(_a, k); camLook.lerp(_b, k);
  cam.position.copy(camPos);
  if (G.shake > 0) { cam.position.x += rand(-1, 1) * G.shake * 0.35; cam.position.y += rand(-1, 1) * G.shake * 0.35; }
  cam.lookAt(camLook);
  if (G.dbgCam) { const c = G.dbgCam; cam.position.set(c[0] + h.x, c[1], c[2]); cam.lookAt(c[3] + h.x, c[4], c[5]); }   // отладочная камера
  menuLight.intensity += ((G.mode === 'menu' ? 30 : 0) - menuLight.intensity) * k;
  menuLight.position.set(h.x - 1.4, 2.4, -2.6);
}

const hudCache = {};
function setText(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }
function setCls(el, key, cls, on) { if (hudCache[key] !== on) { hudCache[key] = on; el.classList.toggle(cls, on); } }
function updateHud() {
  const h = G.hero, r = G.run; if (!r) return;
  const w = worldDef(r.world);
  const segName = r.phase === 'mini' ? 'Мини-босс' : r.phase === 'boss' ? 'Босс' : r.phase === 'rest' ? 'Привал' : SEGMENTS[r.type].name;
  setText(ui.lvlName, 'lvl', `${w.name.split(' — ')[0]} · волна ${r.wave + 1}/3 · ${segName}${r.cycle > 1 ? ' · цикл ' + r.cycle : ''}`);
  ui.prog.style.width = Math.min(100, (r.segIdx + (r.phase === 'seg' ? r.t / r.dur : 0)) / 5 * 100) + '%';
  setText(ui.score, 'score', fmt(r.score));
  setText(ui.combo, 'combo', '×' + comboMul().toFixed(1));
  setText(ui.squadN, 'sq', G.squad.length + 1);
  setText(ui.wName, 'w', WEAPONS[G.weaponTier].name);
  ui.armor.style.width = (h.armor / h.maxArmor * 100) + '%';
  setCls(ui.armor.parentElement, 'low', 'low', h.armor < 35);
  const b = G.boss, el = G.elite;
  if (b) {
    show(ui.bossBar, b.state !== 'dying');
    setText(ui.bossName, 'bn', b.def.name.toUpperCase());
    ui.bossHp.style.width = Math.max(0, b.e.hp / b.e.maxHp * 100) + '%';
    setText(ui.bossNote, 'note', b.def.armored ? (b.vuln > 0 ? 'Ядро открыто — огонь' : 'Броня: урон снижен, ждите атаки') : '');
  } else if (el && el.alive) {
    show(ui.bossBar, true);
    setText(ui.bossName, 'bn', 'ГРОМИЛА');
    ui.bossHp.style.width = Math.max(0, el.hp / el.maxHp * 100) + '%';
    setText(ui.bossNote, 'note', 'Не дайте ему дойти до строя');
  } else show(ui.bossBar, false);
  const mods = [];
  if (r.event === 'blood') mods.push('Кровавая луна ×2');
  if (r.event === 'fog') mods.push('Туман');
  if (G.sqDmg > 1.001 || G.sqRate > 1.001) mods.push(`Отряд: урон ×${G.sqDmg.toFixed(2)}, темп ×${G.sqRate.toFixed(2)}`);
  if (G.dmgMul > 1.001) mods.push(`Урон ×${G.dmgMul.toFixed(2)}`);
  if (G.rateMul > 1.001) mods.push(`Темп ×${G.rateMul.toFixed(2)}`);
  if (G.cry > 0) mods.push('Боевой клич');
  if (r.practice) mods.push('Тренировка');
  setText(ui.mods, 'mods', mods.join(' · '));
  ui.rollCd.style.width = (1 - clamp(h.rollCd / G.mods.rollCd, 0, 1)) * 100 + '%';
  setCls(ui.btnRoll, 'rr', 'ready', h.rollCd <= 0);
  ui.ultBar.style.width = G.ult + '%';
  setCls(ui.btnUlt, 'ur', 'ready', G.ult >= 100);
  setCls(ui.btnDef, 'dh', 'held', G.defend);
  _a.set(h.x, 2.35, 0).project(G.camera);
  ui.squadTag.style.left = ((_a.x * 0.5 + 0.5) * window.innerWidth) + 'px';
  ui.squadTag.style.top = ((-_a.y * 0.5 + 0.5) * window.innerHeight) + 'px';
  setText(ui.squadTag, 'tag', G.squad.length + 1);
}

// ---------- Цикл ----------
let lastT = 0;
function tick(real) {
  if (G.slowmo > 0) G.slowmo -= real;
  G.timeScale += ((G.mode === 'dead' ? 0.45 : G.slowmo > 0 ? 0.3 : 1) - G.timeScale) * Math.min(1, real * 10);
  const dt = real * G.timeScale;
  G.time += dt;
  G.scroll += (G.scrollTarget - G.scroll) * Math.min(1, dt * 3);
  const playing = G.mode === 'run' || G.mode === 'boss';
  if (playing) updateRun(dt);
  updatePlayer(dt); updateActors(dt);
  if (G.mode !== 'menu') {
    updateEnemies(dt); updateBoss(dt); updateGates(dt); updateWeapons(dt); updateZones(dt);
  }
  updatePhysics(dt); updateWorld(dt); updateAmbient(dt); updateFx(dt); updateCamera(real);
  if (fadeT > 0) { fadeT = Math.max(0, fadeT - real); ui.fade.style.opacity = Math.min(1, fadeT / 0.8); }
  if (G.hurtFlash > 0) G.hurtFlash = Math.max(0, G.hurtFlash - real * 2.2);
  ui.hurt.style.opacity = G.hurtFlash * 0.8;
  if (playing || G.mode === 'dead') updateHud();
  if (pendingFn) { pendingT -= real; if (pendingT <= 0) { const f = pendingFn; pendingFn = null; f(); } }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  if (!G.paused && !G.resting && !G.frozen) tick(dt);
  G.renderer.render(G.scene, G.camera);
}
// отладка: прогнать симуляцию на заданное число секунд фиксированным шагом (привал выбирается автоматически)
window.__step = (sec, auto = true) => {
  G.frozen = true;
  for (let i = 0, n = Math.round(sec * 60); i < n; i++) {
    if (G.resting) { if (!auto) break; const b = $('restList').querySelector('button'); if (b) b.click(); else break; }
    tick(1 / 60);
  }
  G.renderer.render(G.scene, G.camera);
};

// ---------- Запуск ----------
loadSave();
const startBtn = $('btnStart'), startLabel = startBtn.textContent;
syncNick(); startBtn.textContent = 'Загрузка…';
await loadTextures();
// ткань, кожа, металл и дерево для персонажей, оружия и предметов
detail(MAT.char, 'fabric', 0.45, { own: 0, amt: 0.75, bump: 0.004, rough: 0.2 });
detail(MAT.suit, 'leather', 0.6, { own: 0, amt: 0.8, bump: 0.005, rough: 0.3 });
detail(MAT.gun, 'metal', 0.7, { own: 0, amt: 0.7, bump: 0.003, rough: 0.35 });
detail(MAT.steel, 'metal', 0.7, { own: 0, amt: 0.7, bump: 0.003, rough: 0.35 });
detail(MAT.wood, 'planks', 1.3, { own: 0.45, bump: 0.012 });
detail(MAT.drum, 'rust', 1.6, { own: 0.4, bump: 0.008 });
detail(MAT.prop, 'concrete', 3, { own: 0.3, bump: 0.02 });
initWorld($('c'));
// скелетные модели: если файлы не загрузились, игра остаётся на процедурных персонажах
try {
  await loadActors(k => { startBtn.textContent = `Загрузка… ${Math.round(k * 100)}%`; });
} catch (err) {
  console.warn('Модели не загружены, используются процедурные персонажи:', err);
}
initFx(); initPhysics(); initPlayer(); initWeapons(); initAmbient();
menuLight = new THREE.PointLight(0xfff0e0, 0, 12, 1.6); G.scene.add(menuLight);
setFxScale(window.innerHeight);
window.addEventListener('resize', () => setFxScale(window.innerHeight));
G.god = params.get('god') === '1';
gameReady = true; startBtn.textContent = startLabel;
toMenu();
camPos.set(-1.1, 1.5, -3.1); camLook.set(0.85, 1.15, 0);
if (params.has('world')) {
  if (!save.name) save.name = 'Тест';
  const wi = Math.max(1, parseInt(params.get('world'), 10) || 1) - 1;
  startRun(wi, true);
  if (params.has('tier')) setWeapon(clamp(parseInt(params.get('tier'), 10) || 0, 0, 5));
  if (params.get('boss') === '1') { G.run.wave = 2; G.run.segIdx = 5; startBoss(); }
}
window.__G = G;
requestAnimationFrame(frame);
