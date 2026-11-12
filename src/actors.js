// Скелетные персонажи на манекенах Quaternius (CC0) и анимациях Universal Animation Library.
// Вега — собственный скелет; бойцы и заражённые делят несколько «кукол»-скелетов, чтобы орда была дешёвой.
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from '../vendor/addons/utils/SkeletonUtils.js';
import { G } from './state.js';
import { P, box, cyl, sph, cone, merge, MAT, weaponMesh, weaponParts, setActorFactory } from './models.js';

const DIR = 'assets/quaternius/';
import { makeSkin } from './skin.js';
const PI = Math.PI, IDENT = new THREE.Matrix4();
let HERO_SKIN = null;             // модель героини, надеваемая на скелет-манекен (manifest: heroSkin)
const SEX = {};                // m / f: { geo, armature, names, inverses, idx, gunLocal, head }
const CLIP = {};
const PUP = {};                // наборы кукол
const GEO = {};                // раскрашенные геометрии по видам
const deathRigs = { m: [], f: [] }, deadPose = { m: [], f: [] };
const puppets = [];
let hero = null, ready = false, counter = 0, ANIM = {};
const bosses = [];
const LOWER = /^(root|pelvis|thigh|calf|foot|ball)/;

// ---------- Загрузка ----------
function extract(gltf) {
  const armature = gltf.scene.getObjectByName('Armature') || gltf.scene;
  const meshes = []; armature.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const sk = meshes[0].skeleton;
  const geos = meshes.map(m => { const g = m.geometry.clone(); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(a)) g.deleteAttribute(a); return g; });
  const geo = mergeGeometries(geos, false);
  const names = sk.bones.map(b => b.name), idx = {};
  names.forEach((n, i) => { idx[n] = i; });
  gltf.scene.updateMatrixWorld(true);
  const bind = {}; sk.bones.forEach(b => { bind[b.name] = b.matrixWorld.clone(); });
  return { geo, armature, names, inverses: sk.boneInverses, idx, bind };
}

// только повороты (+ положение таза): так анимации мужского манекена ложатся на женский без искажения пропорций
function retarget(clip) {
  const tracks = clip.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
// ноги из одной анимации, верх тела — застывшая поза из другой (бег с оружием у плеча)
function combine(name, lower, upper, upperTime = 0) {
  const tracks = lower.tracks.filter(t => LOWER.test(t.name));
  for (const t of upper.tracks) {
    if (LOWER.test(t.name) || !t.name.endsWith('.quaternion')) continue;
    const n = t.getValueSize(); let k = 0;
    while (k < t.times.length - 1 && t.times[k + 1] <= upperTime) k++;
    const v = Array.from(t.values.slice(k * n, k * n + n));
    tracks.push(new THREE.QuaternionKeyframeTrack(t.name, [0, lower.duration], v.concat(v)));
  }
  return new THREE.AnimationClip(name, lower.duration, tracks);
}

function makeRig(sex) {
  const src = SEX[sex];
  const root = SkeletonUtils.clone(src.armature);
  const drop = []; root.traverse(o => { if (o.isSkinnedMesh) drop.push(o); });
  for (const o of drop) o.parent.remove(o);
  const bones = src.names.map(n => root.getObjectByName(n));
  return { root, bones, skeleton: new THREE.Skeleton(bones, src.inverses), mixer: new THREE.AnimationMixer(root), sex };
}

function puppet(sex, clips, phase) {
  const rig = makeRig(sex);
  rig.actions = clips.map(([clip, ts]) => { const a = rig.mixer.clipAction(clip); a.timeScale = ts || 1; a.play(); a.time = phase * clip.duration; return a; });
  for (let i = 1; i < rig.actions.length; i++) rig.actions[i].setEffectiveWeight(0);
  G.scene.add(rig.root); puppets.push(rig);
  return rig;
}

// ---------- Раскраска и снаряжение ----------
const _c = new THREE.Color();
function paint(sex, fn) {
  const g = SEX[sex].geo.clone(), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _c.set(fn(pos.getX(i), pos.getY(i), pos.getZ(i))); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// жёстко привязывает геометрию (в координатах позы привязки) к одной кости
function rigid(sex, geo, bone) {
  const base = SEX[sex].geo, si = base.attributes.skinIndex, sw = base.attributes.skinWeight, n = geo.attributes.position.count;
  const I = new si.array.constructor(n * 4), Wt = new sw.array.constructor(n * 4);
  const one = sw.normalized ? (sw.array instanceof Uint8Array ? 255 : 65535) : 1, b = SEX[sex].idx[bone];
  for (let i = 0; i < n; i++) { I[i * 4] = b; Wt[i * 4] = one; }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(I, 4, si.normalized));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(Wt, 4, sw.normalized));
  const ix = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) ix[i] = i;
  geo.setIndex(new THREE.BufferAttribute(ix, 1));
  return geo;
}
const gear = (sex, parts, bone, grit = 0) => rigid(sex, merge(parts, grit), bone);
function assemble(base, extras, groups = false) {
  if (base.index && base.index.array instanceof Uint16Array && extras.some(e => e.index.array instanceof Uint32Array)) base.setIndex(new THREE.BufferAttribute(new Uint32Array(base.index.array), 1));
  const g = mergeGeometries([base, ...extras], groups);
  g.computeBoundingSphere(); g.boundingSphere.radius *= 1.6;
  return g;
}
const blot = (x, y, z, s) => Math.sin(x * 9.1 + s) * Math.sin(y * 11.3 + s * 2.1) * Math.sin(z * 13.7 + s * 3.3);

function buildLooks() {
  // --- Вега: облегающий тактический комбинезон, хвост, очки, светящаяся полоса на спине
  const SUIT = 0x14171e, PLATE = 0x2c313b, ACC = 0x7c1d22, SKIN = 0xc59878, HAIR = 0x1c110c;
  const vega = paint('f', (x, y, z) => {
    const ax = Math.abs(x);
    if (y > SEX.f.hc.bottom - 0.01 && ax < 0.13) return SKIN;
    if (ax > 0.78) return 0x0b0c0f;                                    // перчатки
    if (y < 0.3) return 0x0b0c0f;                                       // ботинки
    if (y > 0.985 && y < 1.035 && ax < 0.22) return 0x3b3327;           // ремень
    if (y > 0.8 && y < 0.822 && ax < 0.26) return 0x5a1a1e;             // полосы на бёдрах
    if (y > 0.44 && y < 0.56 && z > 0.02 && ax < 0.24) return PLATE;    // наколенники
    if (y > 1.38 && ax > 0.17 && ax < 0.3) return PLATE;                // наплечники
    if (ax > 0.5 && ax < 0.66) return PLATE;                            // пластины на предплечьях
    return blot(x, y, z, 1) > 0.5 ? 0x1b1f28 : SUIT;
  });
  const H = SEX.f.hc, hy = H.y, hz = H.z;
  const vegaHead = gear('f', [
    P(new THREE.SphereGeometry(1, 18, 12, 0, PI * 2, 0, PI * 0.62), HAIR, [0, hy + 0.006, hz - 0.008], [-0.42, 0, 0], [H.rx + 0.014, H.ry + 0.012, H.rz + 0.014]),
    P(box(0.02, 0.15, 0.09), HAIR, [H.rx + 0.004, hy - 0.03, hz - 0.01]), P(box(0.02, 0.15, 0.09), HAIR, [-H.rx - 0.004, hy - 0.03, hz - 0.01]),
    P(sph(0.042), HAIR, [0, hy + 0.05, hz - H.rz - 0.02]),
    P(cyl(0.034, 0.01, 0.42, 8), HAIR, [0, hy - 0.13, hz - H.rz - 0.1], [0.42, 0, 0]),
    P(box(H.rx * 2 + 0.01, 0.032, 0.05), 0x09090b, [0, hy + 0.018, hz + H.rz - 0.035]),
    P(sph(0.014, 6, 4), 0x7c2c2c, [0, hy - 0.052, hz + H.rz - 0.012], [0, 0, 0], [1.5, 0.5, 0.6]),
  ], 'Head');
  const vegaGear = gear('f', [P(box(0.19, 0.22, 0.04), PLATE, [0, 1.3, -0.13]), P(box(0.07, 0.09, 0.05), 0x3b3327, [0.15, 1.0, 0.1]), P(box(0.07, 0.09, 0.05), 0x3b3327, [-0.15, 1.0, -0.1])], 'spine_02');
  const vegaLeg = gear('f', [P(box(0.06, 0.16, 0.1), 0x1a1a1c, [-0.17, 0.82, 0])], 'thigh_r');
  const stripe = gear('f', [P(box(0.026, 0.3, 0.014), 0xffffff, [0, 1.3, -0.155]), P(box(0.11, 0.02, 0.014), 0xffffff, [0, 1.44, -0.15])], 'spine_03');
  GEO.hero = assemble(vega, [vegaHead, vegaGear, vegaLeg, stripe], true);
  GEO.hero.clearGroups();
  const nMain = GEO.hero.index.count - stripe.index.count;
  GEO.hero.addGroup(0, nMain, 0); GEO.hero.addGroup(nMain, stripe.index.count, 1);

  // --- Боец: полевая форма, жилет, шлем, рюкзак, автомат в руке
  const sol = paint('m', (x, y, z) => {
    const ax = Math.abs(x);
    if (y > SEX.m.hc.bottom - 0.01 && ax < 0.14) return 0x8a735e;
    if (ax > 0.8) return 0x1c1c1c;
    if (y < 0.16) return 0x141414;
    if (y > 1.0 && y < 1.47 && ax < 0.24) return blot(x, y, z, 2) > 0.3 ? 0x2b3026 : 0x30362a;      // жилет
    if (y > 0.96 && y < 1.02) return 0x1f221b;
    if (y > 0.44 && y < 0.56 && z > 0.02) return 0x2b3026;
    const b = blot(x, y, z, 3);
    return b > 0.35 ? 0x353b2e : b < -0.35 ? 0x4a523c : 0x3d4434;                                    // камуфляж
  });
  const M = SEX.m.hc, shy = M.y, shz = M.z;
  const solHead = gear('m', [P(new THREE.SphereGeometry(1, 14, 9, 0, PI * 2, 0, PI * 0.56), 0x2f3528, [0, shy + 0.01, shz], [-0.12, 0, 0], [M.rx + 0.03, M.ry + 0.03, M.rz + 0.03]),
    P(box(M.rx * 2 + 0.02, 0.04, 0.05), 0x0b0b0c, [0, shy + 0.01, shz + M.rz - 0.03]), P(box(M.rx * 2 + 0.06, 0.025, 0.07), 0x353b2e, [0, shy + 0.05, shz + M.rz + 0.02])], 'Head');
  const solBack = gear('m', [P(box(0.3, 0.34, 0.16), 0x30352a, [0, 1.28, -0.2]), P(box(0.1, 0.12, 0.07), 0x22261e, [-0.12, 1.36, -0.3]), P(cyl(0.007, 0.007, 0.36, 4), 0x151515, [-0.12, 1.56, -0.26]),
    P(box(0.1, 0.09, 0.06), 0x2b3026, [0.1, 1.08, 0.16]), P(box(0.1, 0.09, 0.06), 0x2b3026, [-0.1, 1.08, 0.16])], 'spine_02');
  const rifle = merge(weaponParts(1)); rifle.applyMatrix4(new THREE.Matrix4().makeScale(1.25, 1.25, 1.25));
  rifle.applyMatrix4(new THREE.Matrix4().multiplyMatrices(SEX.m.bind.hand_r, SEX.m.gunLocal));
  GEO.soldier = assemble(sol, [solHead, solBack, rigid('m', rifle, 'hand_r')]);

  // --- Заражённые: рваная одежда, серо-зелёная кожа, кровь
  const zombie = (sex, top, bottom, skin, seed, tornK = 0.55) => paint(sex, (x, y, z) => {
    const ax = Math.abs(x), h = SEX[sex].head, b = blot(x, y, z, seed);
    if (b > 0.62) return 0x3d0b0b;                                                   // кровь
    const hc = SEX[sex].hc;
    if (y > hc.bottom - 0.01 && ax < 0.14) return y < hc.y - 0.02 && z > hc.z + 0.04 && b > 0.1 ? 0x1d0606 : skin;
    if (ax > 0.52 || y < 0.1) return b < -0.5 ? 0x2a2420 : skin;                     // предплечья, кисти, ступни
    if (y < 0.98) return b < -tornK ? skin : bottom;
    return b < -tornK ? skin : top;
  });
  const SK = [0x93a082, 0xa3a590, 0x869482];
  // клочья волос: привязаны к голове
  const hair = (sex, col, long) => {
    const h = SEX[sex].hc, parts = [P(new THREE.SphereGeometry(1, 12, 8, 0, PI * 2, 0, PI * (long ? 0.6 : 0.42)), col, [0, h.y + 0.006, h.z - 0.008], [-0.4, 0, 0], [h.rx + 0.012, h.ry + 0.01, h.rz + 0.012])];
    if (long) parts.push(P(box(h.rx * 2 + 0.02, 0.26, 0.05), col, [0, h.y - 0.13, h.z - h.rz - 0.005], [0.12, 0, 0]), P(box(0.02, 0.2, 0.1), col, [h.rx + 0.006, h.y - 0.08, h.z - 0.02]), P(box(0.02, 0.2, 0.1), col, [-h.rx - 0.006, h.y - 0.08, h.z - 0.02]));
    return gear(sex, parts, 'Head', 0.2);
  };
  GEO.walker = [
    assemble(zombie('m', 0x2c3540, 0x15171c, SK[0], 1), [hair('m', 0x1e1a16)]), assemble(zombie('m', 0x4a2e22, 0x1e1a16, SK[1], 4), []),
    assemble(zombie('m', 0x24382a, 0x15171c, SK[2], 7), [hair('m', 0x3a2c1e)]), assemble(zombie('m', 0x3a3a3e, 0x1a1614, SK[0], 10), [hair('m', 0x55524c)]),
  ];
  GEO.walkerF = [assemble(zombie('f', 0x4a2a3a, 0x15171c, SK[1], 2), [hair('f', 0x1e1a16, true)]), assemble(zombie('f', 0x2a3a4a, 0x1e1a16, SK[2], 5), [hair('f', 0x4a3420, true)])];
  GEO.runner = assemble(zombie('m', 0x3a2420, 0x121316, 0xa8a496, 12, 0.3), []);
  GEO.runnerF = assemble(zombie('f', 0x3a2420, 0x121316, 0xa8a496, 13, 0.3), [hair('f', 0x2a2420, true)]);
  GEO.crawler = assemble(zombie('m', 0x3a322c, 0x2a2420, 0x6e6658, 15, 0.1), [gear('m', [0, 1, 2, 3].map(i => P(new THREE.ConeGeometry(0.03, 0.16, 5), 0x2a2420, [0, 1.42 - i * 0.12, -0.16], [-1.3, 0, 0])), 'spine_02')]);
  GEO.fat = assemble(zombie('m', 0x5c5a4c, 0x2e2b26, 0x868a6e, 17, 0.4), [gear('m', [P(sph(0.26, 12, 9), 0x7a7d62, [0, 1.12, 0.1], [0, 0, 0], [1, 0.95, 0.9]), P(sph(0.1, 6, 5), 0x5a1410, [0.08, 1.16, 0.32], [0, 0, 0], [1.4, 1, 0.4])], 'spine_01', 0.3)]);
  GEO.spitter = assemble(zombie('m', 0x4d5140, 0x2c2f2a, 0x7f8458, 19), [gear('m', [P(sph(0.16, 10, 8), 0x8d8f45, [0, SEX.m.hc.bottom - 0.04, 0.1]), P(sph(0.12, 8, 6), 0x9c9a4a, [0.12, 1.34, -0.16]), P(sph(0.1, 8, 6), 0x8d8f45, [-0.1, 1.2, -0.17])], 'spine_03', 0.25)]);
  const pts = [[0.14, 1.34, 0.13], [-0.13, 1.18, 0.16], [0.04, 1.08, 0.17], [-0.17, 1.36, -0.1], [0.17, 1.12, -0.12], [0, 1.42, -0.16], [-0.04, 1.28, 0.18]];
  const spots = gear('m', pts.map(p => P(sph(0.06, 6, 5), 0xffffff, p)), 'spine_02');
  const exb = paint('m', (x, y, z) => { const b = blot(x, y, z, 21), ax = Math.abs(x); return y > 0.98 && y < 1.5 && ax < 0.3 ? (b > 0.2 ? 0x8a4a34 : 0x7a3a2c) : b > 0.5 ? 0x3d0b0b : y < 0.98 ? 0x2e2622 : 0x8a5a48; });
  GEO.exploder = assemble(exb, [gear('m', [P(sph(0.24, 10, 8), 0x7a3a2c, [0, 1.2, 0.03])], 'spine_02', 0.25), spots], true);
  GEO.exploder.clearGroups();
  const nE = GEO.exploder.index.count - spots.index.count;
  GEO.exploder.addGroup(0, nE, 0); GEO.exploder.addGroup(nE, spots.index.count, 1);
  GEO.gold = assemble(paint('m', (x, y, z) => blot(x, y, z, 23) > 0.3 ? 0xd8b040 : 0xb8902a), []);
}

// ---------- Персонажи ----------
function charBase(kind, scale) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const holder = new THREE.Group(); holder.rotation.y = PI; root.add(holder);
  root.scale.setScalar(scale);
  return { root, holder, body: new THREE.Object3D(), limbs: [], hipY: 0.9, kind, core: null, phase: 0, gun: null, lean: 0, actor: null };
}

const KIND = {
  soldier:  { geo: () => GEO.soldier, pups: 'soldier', sex: 'm', k: 0.96 },
  walker:   { geo: () => Math.random() < 0.3 ? GEO.walkerF[Math.random() * 2 | 0] : GEO.walker[Math.random() * 4 | 0], pups: 'walk', k: 0.96 },
  runner:   { geo: () => Math.random() < 0.4 ? GEO.runnerF : GEO.runner, pups: 'run', k: 0.98, sx: 0.9 },
  crawler:  { geo: () => GEO.crawler, pups: 'crawl', sex: 'm', k: 0.95 },
  fat:      { geo: () => GEO.fat, pups: 'walk', sex: 'm', k: 0.82, sx: 1.4 },
  spitter:  { geo: () => GEO.spitter, pups: 'walk', sex: 'm', k: 0.93 },
  exploder: { geo: () => GEO.exploder, pups: 'run', sex: 'm', k: 0.93, sx: 1.15, mats: () => [MAT.char, MAT.glowO] },
  gold:     { geo: () => GEO.gold, pups: 'flee', sex: 'm', k: 0.98, mats: () => MAT.suit },
};

function puppetChar(kind, scale) {
  const cfg = KIND[kind], geo = cfg.geo(), sex = geo.userData.sex;
  const c = charBase(kind, scale * cfg.k);
  if (cfg.sx) c.holder.scale.set(cfg.sx, 1, cfg.sx);
  const mesh = new THREE.SkinnedMesh(geo, cfg.mats ? cfg.mats() : MAT.char);
  mesh.castShadow = true; mesh.frustumCulled = false; mesh.bindMode = THREE.DetachedBindMode;
  c.holder.add(mesh);
  const set = PUP[cfg.pups + (sex === 'f' ? 'F' : '')];
  const a = c.actor = { mesh, sex, live: set[counter++ % set.length], dead: false, rig: null };
  mesh.bind(a.live.skeleton, IDENT);
  a.anim = () => { if (a.dead) { a.dead = false; if (a.rig) { const i = a.rig.users.indexOf(a); if (i >= 0) a.rig.users.splice(i, 1); a.rig = null; } mesh.bind(a.live.skeleton, IDENT); } };
  a.die = () => {
    if (a.dead) return; a.dead = true;
    const pool = deathRigs[sex];
    let rig = pool.find(r => !r.busy);
    if (!rig) { rig = pool.reduce((m, r) => r.t > m.t ? r : m, pool[0]); settle(rig); }
    rig.busy = true; rig.t = 0; rig.which = Math.random() * 2 | 0;
    rig.actions.forEach((ac, i) => { ac.stop(); if (i === rig.which) { ac.reset(); ac.play(); } });
    rig.users.push(a); a.rig = rig; mesh.bind(rig.skeleton, IDENT);
  };
  return c;
}
// анимация гибели доиграна: тела переходят на общую статичную позу, скелет освобождается
function settle(rig) {
  const pose = deadPose[rig.sex][rig.which];
  for (const a of rig.users) { a.mesh.bind(pose.skeleton, IDENT); a.rig = null; }
  rig.users.length = 0; rig.busy = false;
}

function heroChar(scale) {
  const c = charBase('hero', scale * 0.98);
  const rig = makeRig('f');
  c.holder.add(rig.root);
  const mesh = new THREE.SkinnedMesh(GEO.hero, [MAT.suit, MAT.glowC]);
  mesh.castShadow = true; mesh.frustumCulled = false;
  rig.root.add(mesh); mesh.bind(rig.skeleton, IDENT);
  const act = {}, mk = (n, clip, once) => { const a = rig.mixer.clipAction(clip); if (once) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } a.play(); a.setEffectiveWeight(0); act[n] = a; };
  mk('run', CLIP.sprintAim); mk('idle', CLIP.aimIdle); mk('roll', CLIP.roll, true); mk('melee', CLIP.melee, true); mk('death', CLIP.death1, true);
  act.idle.setEffectiveWeight(1);
  const gunHolder = new THREE.Group();
  rig.root.getObjectByName('hand_r').add(gunHolder);
  gunHolder.matrixAutoUpdate = false; gunHolder.matrix.copy(SEX.f.gunLocal);
  const a = c.actor = { rig, act, run: 0, w: { run: 0, idle: 1, roll: 0, melee: 0, death: 0 }, st: { roll: -1, melee: false, dead: false }, was: {} };
  a.anim = (t, k) => { a.run = k; };
  a.setGun = tier => { if (c.gun) gunHolder.remove(c.gun); c.gun = weaponMesh(tier); gunHolder.add(c.gun); };
  a.state = (roll, melee, dead) => { a.st.roll = roll; a.st.melee = melee; a.st.dead = dead; };
  a.update = dt => {
    const s = a.st, w = a.w, tgt = { run: 0, idle: 0, roll: 0, melee: 0, death: 0 };
    if (s.dead) { tgt.death = 1; if (!a.was.dead) { act.death.reset(); act.death.play(); } }
    else if (s.roll >= 0) { tgt.roll = 1; if (!(a.was.roll >= 0)) { act.roll.reset(); act.roll.play(); } act.roll.time = 0.12 + s.roll * 0.95; }
    else if (s.melee) { tgt.melee = 1; if (!a.was.melee) { act.melee.reset(); act.melee.timeScale = 1.6; act.melee.play(); } tgt.run = a.run * 0.4; }
    else { tgt.run = a.run; tgt.idle = 1 - a.run; }
    a.was = { roll: s.roll, melee: s.melee, dead: s.dead };
    const k = Math.min(1, dt * 14);
    for (const n in w) { w[n] += (tgt[n] - w[n]) * k; act[n].setEffectiveWeight(w[n]); }
    act.roll.paused = true;
    rig.mixer.update(dt);
  };
  if (HERO_SKIN) {
    try {
      const skin = makeSkin(c.holder, rig.root, HERO_SKIN.scene, HERO_SKIN);
      mesh.visible = false;
      const upd = a.update; a.update = dt => { upd(dt); skin.update(); };
      skin.update();
    } catch (err) { console.warn('Модель героини не надета, остаётся манекен:', err.message || err); }
  }
  hero = a;
  return c;
}

export function updateActors(dt) {
  if (!ready) return;
  const run = Math.min(1, G.scroll / 14);
  for (const p of puppets) {
    if (p.blend) { p.actions[0].setEffectiveWeight(run); p.actions[1].setEffectiveWeight(1 - run); }
    p.mixer.update(dt);
  }
  for (const sex of ['m', 'f']) for (const r of deathRigs[sex]) {
    if (!r.busy) continue;
    r.t += dt; r.mixer.update(dt);
    if (r.t > 2.6) settle(r);
  }
  if (hero) hero.update(dt);
  for (let i = famDeath.length - 1; i >= 0; i--) {
    const r = famDeath[i]; if (!r.busy) continue;
    r.t += dt; r.mixer.update(dt);
    if (r.t > r.dur + 0.3) famSettle(r);
  }
  for (let i = bosses.length - 1; i >= 0; i--) { const b = bosses[i]; if (!b.c.root.parent) { bosses.splice(i, 1); continue; } b.update(dt); }
}

// ---------- Боссы: собственный скелет, броня и снаряжение на костях ----------
// основная часть + светящаяся часть отдельной группой материалов
function withGlow(base, extras, glow) {
  const g = assemble(base, extras.concat([glow]), true);
  g.clearGroups();
  const n = g.index.count - glow.index.count;
  g.addGroup(0, n, 0); g.addGroup(n, glow.index.count, 1);
  return g;
}
const BOSS_LOOK = {
  // Мясник: туша в фартуке, маска, по тесаку в каждой руке
  butcher() {
    const hc = SEX.m.hc;
    const base = paint('m', (x, y, z) => { const b = blot(x, y, z, 31); if (b > 0.5) return 0x4a0f0c; if (y < 0.14) return 0x141210; if (y < 0.98) return 0x27231f; return b < -0.4 ? 0x6e5a4a : 0x8a7460; });
    const g = [
      gear('m', [P(sph(0.3, 12, 9), 0x8a7460, [0, 1.1, 0.08], [0, 0, 0], [1, 1, 0.9]), P(box(0.5, 0.72, 0.03), 0x8d8474, [0, 1.02, 0.34]), P(box(0.3, 0.3, 0.035), 0x4a0f0c, [0.05, 1.0, 0.345]), P(box(0.18, 0.36, 0.035), 0x5a1410, [-0.12, 1.16, 0.345])], 'spine_01', 0.3),
      gear('m', [P(box(0.2, 0.15, 0.1), 0x1b1b1d, [0, hc.y - 0.03, hc.z + hc.rz - 0.02]), P(box(0.19, 0.04, 0.11), 0x55585c, [0, hc.y + 0.06, hc.z + hc.rz - 0.02])], 'Head'),
      gear('m', [P(box(0.5, 0.3, 0.03), 0x8f9296, [1.13, 1.36, 0.02]), P(box(0.2, 0.3, 0.032), 0x5a1410, [1.3, 1.36, 0.02]), P(box(0.14, 0.05, 0.05), 0x2b1d14, [0.88, 1.42, 0.02])], 'hand_l'),
      gear('m', [P(box(0.5, 0.3, 0.03), 0x8f9296, [-1.13, 1.36, 0.02]), P(box(0.2, 0.3, 0.032), 0x5a1410, [-1.3, 1.36, 0.02]), P(box(0.14, 0.05, 0.05), 0x2b1d14, [-0.88, 1.42, 0.02])], 'hand_r'),
    ];
    return { geo: assemble(base, g), mats: MAT.char, sx: 1.3 };
  },
  // Сборщик: мутант, сросшийся с погрузочным краном — стрела с крюком вместо руки
  treant() {
    const hc = SEX.m.hc;
    const base = paint('m', (x, y, z) => { const b = blot(x, y, z, 33); if ((y > 1.18 && y < 1.24) || (y > 0.62 && y < 0.68)) return (Math.floor(x * 14) & 1) ? 0xb09a2a : 0x151515; if (b > 0.45) return 0x5a2c16; if (b < -0.45) return 0x6e7a52; return y < 0.98 ? 0x2a2620 : 0x4a3a2a; });
    const boom = [P(box(1.0, 0.16, 0.16), 0x8a7a2a, [-0.95, 1.43, 0]), P(box(1.02, 0.05, 0.18), 0x151515, [-0.95, 1.52, 0]), P(cyl(0.02, 0.02, 0.6, 5), 0x1a1a1a, [-1.42, 1.1, 0]), P(new THREE.TorusGeometry(0.14, 0.035, 6, 10, PI * 1.4), 0x55585c, [-1.42, 0.7, 0], [0, 0, 2.2]), P(box(0.2, 0.2, 0.22), 0x3a3428, [-0.48, 1.43, 0])];
    const claw = [0.03, 0, -0.03].map((dz, i) => P(cone(0.03, 0.34, 5), 0x231a11, [1.05, 1.4 + (i - 1) * 0.04, dz * 2], [0, 0, -PI / 2]));
    const glow = gear('m', [P(sph(0.03, 6, 4), 0xffffff, [0.045, hc.y + 0.02, hc.z + hc.rz + 0.07]), P(sph(0.03, 6, 4), 0xffffff, [-0.045, hc.y + 0.02, hc.z + hc.rz + 0.07]), P(box(0.1, 0.03, 0.02), 0xffffff, [0, 1.36, 0.19])], 'spine_03');
    const g = [
      gear('m', boom, 'lowerarm_r', 0.25), gear('m', claw, 'hand_l'),
      gear('m', [P(box(0.26, 0.26, 0.26), 0x3a3428, [0, hc.y, hc.z]), P(box(0.2, 0.08, 0.02), 0x0c0d0f, [0, hc.y + 0.02, hc.z + 0.135])], 'Head', 0.2),
      gear('m', [P(cyl(0.11, 0.11, 0.55, 8), 0x4a4030, [0.14, 1.3, -0.22]), P(cyl(0.11, 0.11, 0.55, 8), 0x4a4030, [-0.14, 1.3, -0.22]), P(box(0.46, 0.34, 0.1), 0x3a3428, [0, 1.3, 0.17]),
        P(cyl(0.02, 0.02, 0.5, 4), 0x3a2a22, [0.26, 1.62, -0.05], [0.2, 0, -0.4]), P(cyl(0.02, 0.02, 0.6, 4), 0x3a2a22, [-0.24, 1.66, -0.08], [0.3, 0, 0.5])], 'spine_03', 0.25),
    ];
    return { geo: withGlow(base, g, glow), mats: [MAT.char, MAT.glowG], sx: 1.15 };
  },
  // Полковник Рейд / Прототип Омега: силовая броня со светящимся ядром
  goliath: () => armored(0x4b5158, 0x33383e, MAT.glowO, 1.2),
  omega: () => armored(0x2a3648, 0x1a2230, MAT.glowC, 1.3),
  // Криотитан: ползущая ледяная тварь с шипами вдоль хребта
  queen() {
    const hc = SEX.m.hc;
    const base = paint('m', (x, y, z) => { const b = blot(x, y, z, 37); if (b > 0.4) return 0xd8e6ee; if (b < -0.5) return 0x3a5466; return z > 0.06 ? 0x4a6474 : 0x7fa4b8; });
    const spikes = [];
    for (let i = 0; i < 7; i++) spikes.push(P(cone(0.07 - i * 0.004, 0.55 - i * 0.03, 5), 0xcfe2ec, [(i % 2 ? 0.07 : -0.07), 1.0 + i * 0.075, -0.3], [-PI / 2 - 0.3, 0, 0]));
    const glow = gear('m', [[0.14, 1.34, -0.17], [-0.15, 1.18, -0.16], [0, 1.08, -0.15], [0.12, 1.02, -0.13]].map(p => P(sph(0.08, 7, 6), 0xffffff, p)), 'spine_02');
    const g = [
      gear('m', spikes, 'spine_02', 0.1),
      gear('m', [P(cone(0.05, 0.3, 5), 0xcfe2ec, [0.07, hc.y + 0.16, hc.z - 0.02], [-0.5, 0, -0.3]), P(cone(0.05, 0.3, 5), 0xcfe2ec, [-0.07, hc.y + 0.16, hc.z - 0.02], [-0.5, 0, 0.3]), P(box(0.14, 0.07, 0.08), 0x1a2630, [0, hc.y - 0.07, hc.z + hc.rz])], 'Head'),
      gear('m', [P(sph(0.34, 12, 9), 0x7fa4b8, [0, 1.05, -0.08], [0, 0, 0], [1, 1, 1.1])], 'spine_01', 0.2),
    ];
    return { geo: withGlow(base, g, glow), mats: [MAT.char, MAT.glowC], sx: 1.5, crawl: true };
  },
  // Корвин-Прамать: высокий, в плаще, с костяной короной и светящимся сердцем
  patriarch() {
    const hc = SEX.m.hc, BONE = 0xa39e90;
    const base = paint('m', (x, y, z) => { const ax = Math.abs(x), b = blot(x, y, z, 41); if (y > hc.bottom - 0.01 && ax < 0.14) return 0x8c8088; if (ax > 0.6) return 0x8c8088; return b > 0.45 ? 0x2a0c12 : 0x1a1216; });
    const crown = [];
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.6; crown.push(P(cone(0.03, 0.36, 5), BONE, [Math.sin(a) * 0.09, hc.y + hc.ry + 0.1 + Math.cos(a) * 0.04, hc.z - 0.01], [-0.15, 0, -a * 0.55])); }
    crown.push(P(box(0.12, 0.05, 0.05), 0x0c0406, [0, hc.y - 0.06, hc.z + hc.rz]));
    const ribs = [0, 1, 2, 3].map(i => P(box(0.34 - i * 0.03, 0.026, 0.03), BONE, [0, 1.16 + i * 0.07, 0.17]));
    const glow = gear('m', [P(sph(0.07, 8, 6), 0xffffff, [0, 1.3, 0.16], [0, 0, 0], [1, 1.3, 0.5])], 'spine_03');
    const eyes = gear('m', [P(sph(0.022, 5, 4), 0xffffff, [0.04, hc.y + 0.02, hc.z + hc.rz]), P(sph(0.022, 5, 4), 0xffffff, [-0.04, hc.y + 0.02, hc.z + hc.rz])], 'Head');
    const g = [
      gear('m', crown, 'Head'), gear('m', ribs, 'spine_03'),
      gear('m', [P(box(0.62, 1.25, 0.04), 0x100b0d, [0, 0.95, -0.2], [-0.1, 0, 0]), P(sph(0.15, 8, 6), 0x1a1216, [0.28, 1.5, 0], [0, 0, 0], [1.2, 0.6, 1]), P(sph(0.15, 8, 6), 0x1a1216, [-0.28, 1.5, 0], [0, 0, 0], [1.2, 0.6, 1]),
        P(cone(0.05, 0.4, 5), BONE, [0.34, 1.66, 0], [0, 0, -0.5]), P(cone(0.05, 0.4, 5), BONE, [-0.34, 1.66, 0], [0, 0, 0.5])], 'spine_03', 0.15),
      gear('m', [-1, 0, 1].map(i => P(cone(0.02, 0.3, 4), BONE, [1.05, 1.42 + i * 0.03, i * 0.04], [0, 0, -PI / 2])), 'hand_l'),
      gear('m', [-1, 0, 1].map(i => P(cone(0.02, 0.3, 4), BONE, [-1.05, 1.42 + i * 0.03, i * 0.04], [0, 0, PI / 2])), 'hand_r'),
      eyes,
    ];
    return { geo: withGlow(base, g, glow), mats: [MAT.char, MAT.glowR], sx: 0.92 };
  },
};
function armored(ARM, ARM2, glowMat, sx) {
  const hc = SEX.m.hc;
  const base = paint('m', (x, y, z) => { const b = blot(x, y, z, 35), ax = Math.abs(x); if (y > hc.bottom - 0.01 && ax < 0.14) return 0x7a7468; return b > 0.5 ? 0x3d0b0b : 0x26282a; });
  const glow = gear('m', [P(box(0.2, 0.2, 0.03), 0xffffff, [0, 1.3, 0.235]), P(box(0.05, 0.3, 0.03), 0xffffff, [0, 1.32, -0.3])], 'spine_03');
  const side = s => [
    gear('m', [P(box(0.3, 0.2, 0.34), ARM, [s * 0.3, 1.5, 0], [0, 0, -s * 0.25]), P(box(0.24, 0.16, 0.2), ARM2, [s * 0.42, 1.43, 0])], s > 0 ? 'upperarm_l' : 'upperarm_r'),
    gear('m', [P(box(0.3, 0.18, 0.18), ARM, [s * 0.66, 1.43, 0]), P(box(0.12, 0.2, 0.2), ARM2, [s * 0.8, 1.43, 0])], s > 0 ? 'lowerarm_l' : 'lowerarm_r'),
    gear('m', [P(box(0.19, 0.36, 0.22), ARM, [s * 0.1, 0.72, 0.01]), P(box(0.2, 0.08, 0.23), ARM2, [s * 0.1, 0.92, 0.01])], s > 0 ? 'thigh_l' : 'thigh_r'),
    gear('m', [P(box(0.17, 0.34, 0.2), ARM2, [s * 0.1, 0.3, 0]), P(sph(0.1, 7, 5), ARM, [s * 0.1, 0.5, 0.05])], s > 0 ? 'calf_l' : 'calf_r'),
  ];
  const g = [
    gear('m', [P(box(0.52, 0.42, 0.4), ARM, [0, 1.3, 0.02]), P(cyl(0.07, 0.07, 0.5, 8), ARM2, [0.2, 1.42, -0.26]), P(cyl(0.07, 0.07, 0.5, 8), ARM2, [-0.2, 1.42, -0.26]), P(box(0.3, 0.1, 0.42), ARM2, [0, 1.53, 0.02])], 'spine_03', 0.15),
    gear('m', [P(box(0.44, 0.2, 0.34), ARM2, [0, 1.02, 0.01])], 'spine_01', 0.15),
    gear('m', [P(box(0.26, 0.27, 0.28), ARM2, [0, hc.y + 0.01, hc.z]), P(box(0.2, 0.05, 0.02), 0x0a0a0a, [0, hc.y + 0.03, hc.z + 0.145])], 'Head', 0.1),
    ...side(1), ...side(-1),
  ];
  return { geo: withGlow(base, g, glow), mats: [MAT.char, glowMat.clone()], sx, core: true };
}
// какая разовая анимация сопровождает атаку
const ATK = { slam: 'Sword_GroundPound', roots: 'Sword_GroundPound', spit: 'OverhandThrow', rockets: 'OverhandThrow',
  spawnWalker: 'MonsterTransformation', spawnRunner: 'MonsterTransformation', spawnCrawler: 'MonsterTransformation', spawnExploder: 'MonsterTransformation' };

function bossChar(kind, scale) {
  const L = BOSS_LOOK[kind]();
  L.geo.userData.sex = 'm';
  const c = charBase(kind, scale * 0.95);
  if (L.sx) c.holder.scale.set(L.sx, 1, L.sx);
  const rig = makeRig('m'); c.holder.add(rig.root);
  const mesh = new THREE.SkinnedMesh(L.geo, L.mats);
  mesh.castShadow = true; mesh.frustumCulled = false;
  rig.root.add(mesh); mesh.bind(rig.skeleton, IDENT);
  if (L.core) c.core = { material: L.mats[1] };
  const mk = (clip, once, ts = 1) => { const a = rig.mixer.clipAction(clip); if (once) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } a.timeScale = ts; a.play(); a.setEffectiveWeight(0); return a; };
  const act = L.crawl
    ? { walk: mk(ANIM.Crawl_Fwd_Loop, false, 0.8), idle: mk(ANIM.Crawl_Idle_Loop), run: mk(ANIM.Crawl_Fwd_Loop.clone(), false, 2.2) }
    : { walk: mk(ANIM.Zombie_Walk_Fwd_Loop, false, 0.75), idle: mk(ANIM.Zombie_Idle_Loop, false, 0.7), run: mk(ANIM.Zombie_Run_Fwd_Loop, false, 0.9) };
  act.death = mk(L.crawl ? ANIM.Crawl_Idle_Loop.clone() : CLIP.death1, true, L.crawl ? 0.05 : 0.75);
  const once = {};
  const a = c.actor = { c, k: 0, w: { walk: 0, idle: 1, run: 0, death: 0, atk: 0 }, atk: null, atkT: 0, dead: false };
  a.anim = (t, k) => { a.k = k; };
  a.attack = name => {
    const n = ATK[name]; if (!n || !ANIM[n] || L.crawl) return;
    if (a.atk) a.atk.setEffectiveWeight(0);
    a.atk = once[n] || (once[n] = mk(ANIM[n], true)); a.atk.reset(); a.atk.play(); a.atkT = ANIM[n].duration;
  };
  a.die = () => { if (a.dead) return; a.dead = true; act.death.reset(); act.death.play(); };
  a.update = dt => {
    const w = a.w, tgt = { walk: 0, idle: 0, run: 0, death: 0, atk: 0 };
    if (a.dead) tgt.death = 1;
    else if (a.k > 1.05) tgt.run = 1;
    else if (a.atkT > 0) { a.atkT -= dt; tgt.atk = 1; tgt.idle = 0.15; }
    else if (a.k > 0.9) tgt.walk = 1;
    else { tgt.walk = 0.45; tgt.idle = 0.55; }
    const kk = Math.min(1, dt * 9);
    for (const n in w) w[n] += (tgt[n] - w[n]) * kk;
    act.walk.setEffectiveWeight(w.walk); act.idle.setEffectiveWeight(w.idle); act.run.setEffectiveWeight(w.run); act.death.setEffectiveWeight(w.death);
    if (a.atk) a.atk.setEffectiveWeight(w.atk);
    rig.mixer.update(dt);
  };
  bosses.push(a);
  return c;
}

export async function loadActors(onProgress) {
  const loader = new GLTFLoader();
  const manP = fetch(CUSTOM + 'manifest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  // свои модели начинают качаться сразу, параллельно с манекенами; одинаковый файл качается один раз
  manP.then(man => { if (man && typeof man === 'object') for (const k of Object.keys(man)) { const e = man[k]; if (k !== 'props' && e && safeFile(e.file)) preload(loader, e.file); } });
  loadCustom.man = manP;
  let done = 0; const step = () => { if (onProgress) onProgress(++done / 3); };
  const [f, u1, u2] = await Promise.all(['Mannequin_F.glb', 'UAL1.glb', 'UAL2.glb'].map(n => loader.loadAsync(DIR + n).then(g => { step(); return g; })));
  SEX.f = extract(f); SEX.m = extract(u1);
  SEX.f.geo.userData.sex = 'f'; SEX.m.geo.userData.sex = 'm';
  for (const s of ['m', 'f']) {
    const h = new THREE.Vector3().setFromMatrixPosition(SEX[s].bind.Head); SEX[s].head = h;
    const p = SEX[s].geo.attributes.position; let y0 = 9, y1 = -9, z0 = 9, z1 = -9, x1 = 0;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > h.y + 0.02 && Math.abs(p.getX(i)) < 0.2) { const z = p.getZ(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); x1 = Math.max(x1, p.getX(i)); } }
    SEX[s].hc = { y: (y0 + y1) / 2, z: (z0 + z1) / 2, rx: x1, ry: (y1 - y0) / 2, rz: (z1 - z0) / 2, bottom: y0 };
  }
  const A = {}; for (const c of u1.animations.concat(u2.animations)) A[c.name] = retarget(c);
  ANIM = A;
  CLIP.sprintAim = combine('SprintAim', A.Sprint_Loop, A.Pistol_Aim_Neutral);
  CLIP.aimIdle = combine('AimIdle', A.Idle_Loop, A.Pistol_Aim_Neutral);
  CLIP.roll = A.Roll; CLIP.melee = A.Melee_Hook; CLIP.death1 = A.Death01; CLIP.death2 = A.Death02;

  // положение оружия в кисти: ставим скелет в позу прицеливания и запоминаем, где должен быть автомат
  for (const s of ['m', 'f']) {
    const rig = makeRig(s), a = rig.mixer.clipAction(CLIP.aimIdle); a.play(); rig.mixer.update(0);
    rig.root.updateMatrixWorld(true);
    const hand = rig.root.getObjectByName('hand_r'), hw = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
    const want = new THREE.Matrix4().compose(new THREE.Vector3(hw.x - 0.02, hw.y + 0.04, hw.z - 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI, 0)), new THREE.Vector3(1, 1, 1));
    SEX[s].gunLocal = new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(want);
    SEX[s].aimHand = hw;
  }
  buildLooks();
  for (const k in GEO) { const set = Array.isArray(GEO[k]) ? GEO[k] : [GEO[k]]; for (const g of set) g.userData.sex = (k.endsWith('F') || k === 'hero') ? 'f' : 'm'; }

  const ph = n => Array.from({ length: n }, (_, i) => i / n);
  PUP.soldier = ph(4).map(p => { const r = puppet('m', [[CLIP.sprintAim, 1.15], [CLIP.aimIdle, 1]], p); r.blend = true; return r; });
  PUP.walk = ph(5).map(p => puppet('m', [[A.Zombie_Walk_Fwd_Loop, 1.25]], p));
  PUP.walkF = ph(3).map(p => puppet('f', [[A.Zombie_Walk_Fwd_Loop, 1.25]], p));
  PUP.run = ph(4).map(p => puppet('m', [[A.Zombie_Run_Fwd_Loop, 1.2]], p));
  PUP.runF = ph(2).map(p => puppet('f', [[A.Zombie_Run_Fwd_Loop, 1.2]], p));
  PUP.crawl = ph(3).map(p => puppet('m', [[A.Crawl_Fwd_Loop, 1.6]], p));
  PUP.flee = ph(1).map(p => puppet('m', [[A.Sprint_Loop, 1]], p));
  for (const s of ['m', 'f']) {
    for (let w = 0; w < 2; w++) {            // статичные позы лежащих тел
      const r = makeRig(s), clip = w ? CLIP.death2 : CLIP.death1, a = r.mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.play(); r.mixer.update(clip.duration + 0.1);
      G.scene.add(r.root); deadPose[s].push(r);
    }
    for (let i = 0; i < (s === 'm' ? 10 : 4); i++) {
      const r = makeRig(s); r.users = []; r.busy = false; r.t = 0; r.which = 0;
      r.actions = [CLIP.death1, CLIP.death2].map(clip => { const a = r.mixer.clipAction(clip); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.timeScale = 1.5; return a; });
      G.scene.add(r.root); deathRigs[s].push(r);
    }
  }
  ready = true; G.dbgActors = { SEX, GEO, PUP, deathRigs };
  await loadCustom(loader);
  setActorFactory((kind, scale) => {
    const fam = FAM[kind];
    if (fam) return kind === 'hero' || BOSS_LOOK[kind] ? soloChar(fam, kind, scale, kind !== 'hero') : famChar(fam, kind, scale);
    return kind === 'hero' ? heroChar(scale) : KIND[kind] ? puppetChar(kind, scale) : BOSS_LOOK[kind] ? bossChar(kind, scale) : null;
  });
  return { head: SEX.f.head, hand: SEX.f.aimHand };
}


// ---------- Свои модели: assets/custom/manifest.json ----------
// Манифест необязателен. Роль из манифеста подменяет манекен загруженным GLB с его материалами и текстурами.
const CUSTOM = 'assets/custom/';
const FAM = {};                    // роль → семейство (исходная сцена, клипы, общие «куклы»)
const famDeath = [];
export const customProps = {};     // биом → [{ scene, def }]

const safeFile = f => typeof f === 'string' && !/^[a-z]+:|^\/\/|^\//i.test(f);
const isUal = root => ['pelvis', 'spine_01', 'hand_r', 'thigh_l', 'Head'].every(n => root.getObjectByName(n));
// анимации по умолчанию для моделей на скелете Universal Animation Library
function ualClip(role, key) {
  if (role === 'hero' || role === 'soldier') return { run: CLIP.sprintAim, idle: CLIP.aimIdle, roll: CLIP.roll, melee: CLIP.melee, death: CLIP.death1 }[key] || null;
  const z = KIND[role] ? KIND[role].pups : 'walk';
  if (key === 'walk') return z === 'run' || z === 'flee' ? ANIM.Zombie_Run_Fwd_Loop : z === 'crawl' ? ANIM.Crawl_Fwd_Loop : ANIM.Zombie_Walk_Fwd_Loop;
  return { idle: ANIM.Zombie_Idle_Loop, run: ANIM.Zombie_Run_Fwd_Loop, death: CLIP.death1, attack: ANIM.Sword_GroundPound }[key] || null;
}

// Анимации «с перемещением» превращаем в бег на месте: убираем равномерный снос костей за клип
function inPlace(clip) {
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.position') || t.times.length < 3) continue;
    const v = t.values, n = t.times.length, T = t.times[n - 1] - t.times[0] || 1;
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[i * 3 + k]); hi[k] = Math.max(hi[k], v[i * 3 + k]); }
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    for (let k = 0; k < 3; k++) {
      const drift = v[(n - 1) * 3 + k] - v[k];
      if (Math.abs(drift) < span * 0.5) continue;      // это не снос, а обычное покачивание
      for (let i = 0; i < n; i++) v[i * 3 + k] -= drift * (t.times[i] - t.times[0]) / T;
    }
  }
}
async function makeFamily(loader, role, e) {
  if (!safeFile(e.file)) throw new Error('файл должен лежать в assets/custom');
  const gltf = await preload(loader, e.file);
  const src = gltf.scene, meshes = [];
  src.updateMatrixWorld(true);
  // жёсткие детали на костях (оружие в руке, шлем) превращаем в части со скелетом, чтобы они жили на общих «куклах»
  let main = null; const rigid = [];
  src.traverse(o => { if (o.isSkinnedMesh && !main) main = o; });
  if (main) src.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    let b = o.parent; while (b && main.skeleton.bones.indexOf(b) < 0) b = b.parent;
    if (b) rigid.push([o, main.skeleton.bones.indexOf(b)]);
  });
  for (const [o, bi] of rigid) {
    const bone = main.skeleton.bones[bi], g = o.geometry.clone(), n = g.attributes.position.count;
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, main.skeleton.boneInverses[bi]).invert().multiply(o.matrixWorld));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const sm = new THREE.SkinnedMesh(g, o.material);
    sm.name = o.name; sm.position.copy(main.position); sm.quaternion.copy(main.quaternion); sm.scale.copy(main.scale);
    main.parent.add(sm); sm.bind(main.skeleton, main.bindMatrix); o.parent.remove(o);
  }
  src.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  if (!meshes.length) throw new Error('в файле нет сетки со скелетом');
  src.updateMatrixWorld(true);
  // габариты считаем по сетке в позе скелета: у моделей из Blender/Mixamo узлы часто масштабированы в 100 раз
  const bb = new THREE.Box3();
  for (const m of meshes) { m.computeBoundingBox(); bb.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
  const h = bb.max.y - bb.min.y;
  const ual = isUal(src), names = e.clips || {};
  for (const c of gltf.animations) inPlace(c);
  const clip = key => (names[key] && gltf.animations.find(c => c.name === names[key])) || (ual ? ualClip(role, key) : null);
  if (!clip('walk') && !clip('run') && !clip('idle')) throw new Error(`нет анимаций: укажите clips (в файле есть: ${gltf.animations.map(c => c.name).join(', ') || 'ничего'}) или используйте скелет UAL`);
  return { role, src, meshes, k: (h > 0 ? (e.height || 1.8) / h : 1) * (e.scale || 1), y0: -bb.min.y, rot: (e.rotateY ?? 180) * PI / 180, clip, ual, gun: e.gun !== false && ual, live: null, deaths: [], dead: null };
}
function famRig(fam, visible) {
  const root = SkeletonUtils.clone(fam.src), sk = [];
  root.traverse(o => { if (o.isSkinnedMesh) sk.push(o.skeleton); if (o.isMesh && !visible) o.visible = false; });
  return { root, sk, mixer: new THREE.AnimationMixer(root), fam };
}
const famBind = (a, rig) => a.meshes.forEach((m, i) => m.bind(rig.sk[i], a.fam.meshes[i].bindMatrix));
function famSettle(rig) {
  for (const a of rig.users) { famBind(a, rig.fam.dead); a.rig = null; }
  rig.users.length = 0; rig.busy = false;
}
function famHolder(c, fam) { c.holder.rotation.y = fam.rot; c.holder.scale.setScalar(fam.k); c.holder.position.y = fam.y0 * fam.k; }

// бойцы и рядовые заражённые: сетки каждого экземпляра привязаны к нескольким общим скелетам
function famChar(fam, kind, scale) {
  if (!fam.live) {
    const move = fam.clip('walk') || fam.clip('run') || fam.clip('idle'), idle = fam.clip('idle'), death = fam.clip('death');
    fam.live = [0, 0.25, 0.5, 0.75].map(ph => {
      const r = famRig(fam, false);
      r.actions = [move].concat(kind === 'soldier' && idle ? [idle] : []).map(cl => { const a = r.mixer.clipAction(cl); a.play(); a.time = ph * cl.duration; return a; });
      if (r.actions.length > 1) { r.actions[1].setEffectiveWeight(0); r.blend = true; }
      G.scene.add(r.root); puppets.push(r); return r;
    });
    if (death) {
      fam.dead = famRig(fam, false); const a = fam.dead.mixer.clipAction(death); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.play(); fam.dead.mixer.update(death.duration + 0.1); G.scene.add(fam.dead.root);
      for (let i = 0; i < 8; i++) { const r = famRig(fam, false); r.users = []; r.busy = false; r.t = 0; r.dur = death.duration; r.action = r.mixer.clipAction(death); r.action.setLoop(THREE.LoopOnce); r.action.clampWhenFinished = true; G.scene.add(r.root); fam.deaths.push(r); famDeath.push(r); }
    }
  }
  const c = charBase(kind, scale); famHolder(c, fam);
  const a = c.actor = { fam, meshes: [], live: fam.live[counter++ % fam.live.length], dead: false, rig: null, noDeath: !fam.dead };
  fam.meshes.forEach(m => { const sm = new THREE.SkinnedMesh(m.geometry, m.material); sm.bindMode = THREE.DetachedBindMode; sm.castShadow = true; sm.frustumCulled = false; c.holder.add(sm); a.meshes.push(sm); });
  famBind(a, a.live);
  a.anim = () => { if (a.dead) { a.dead = false; if (a.rig) { const i = a.rig.users.indexOf(a); if (i >= 0) a.rig.users.splice(i, 1); a.rig = null; } famBind(a, a.live); } };
  a.die = () => {
    if (a.dead || a.noDeath) return; a.dead = true;
    let rig = fam.deaths.find(r => !r.busy);
    if (!rig) { rig = fam.deaths.reduce((m, r) => r.t > m.t ? r : m, fam.deaths[0]); famSettle(rig); }
    rig.busy = true; rig.t = 0; rig.action.reset(); rig.action.play();
    rig.users.push(a); a.rig = rig; famBind(a, rig);
  };
  return c;
}

// Вега и боссы: собственная копия модели со своим микшером
function soloChar(fam, kind, scale, boss) {
  const c = charBase(kind, scale * (boss ? 1 : 0.9)); famHolder(c, fam);
  const rig = famRig(fam, true); c.holder.add(rig.root);
  const act = {}, w = {};
  for (const key of ['run', 'walk', 'idle', 'roll', 'melee', 'death', 'attack']) {
    const cl = fam.clip(key); if (!cl) continue;
    const a = rig.mixer.clipAction(cl);
    if (key === 'roll' || key === 'melee' || key === 'death' || key === 'attack') { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    a.play(); a.setEffectiveWeight(0); act[key] = a; w[key] = 0;
  }
  const move = act.run ? 'run' : act.walk ? 'walk' : 'idle', rest = act.idle ? 'idle' : move;
  let gunHolder = null;
  if (!boss && fam.gun) { const hand = rig.root.getObjectByName('hand_r'); if (hand) { gunHolder = new THREE.Group(); hand.add(gunHolder); gunHolder.matrixAutoUpdate = false; gunHolder.matrix.copy(SEX.f.gunLocal); } }
  const a = c.actor = { c, k: 0, st: { roll: -1, melee: false, dead: false }, was: {}, atkT: 0, dead: false };
  a.anim = (t, k) => { a.k = k; };
  a.setGun = tier => { if (!gunHolder) return; if (c.gun) gunHolder.remove(c.gun); c.gun = weaponMesh(tier); c.gun.scale.multiplyScalar(1 / fam.k); gunHolder.add(c.gun); };
  a.state = (roll, melee, dead) => { a.st.roll = roll; a.st.melee = melee; a.st.dead = dead; };
  a.attack = () => { if (act.attack) { act.attack.reset(); act.attack.play(); a.atkT = act.attack.getClip().duration; } };
  a.die = () => { a.st.dead = true; };
  a.update = dt => {
    const s = a.st, tgt = {}; for (const n in w) tgt[n] = 0;
    const once = (key, on, wasOn) => { if (on && !wasOn) { act[key].reset(); act[key].play(); } };
    if (s.dead && act.death) { tgt.death = 1; once('death', true, a.was.dead); }
    else if (s.roll >= 0 && act.roll) { tgt.roll = 1; once('roll', true, a.was.roll >= 0); act.roll.paused = true; act.roll.time = s.roll * act.roll.getClip().duration * 0.8; }
    else if (s.melee && act.melee) { tgt.melee = 1; once('melee', true, a.was.melee); }
    else if (a.atkT > 0 && act.attack) { a.atkT -= dt; tgt.attack = 1; }
    else if (boss) { if (a.k > 1.05 && act.run) tgt.run = 1; else { tgt[act.walk ? 'walk' : move] = 0.5; tgt[rest] = (tgt[rest] || 0) + 0.5; } }
    else { const k = Math.min(1, a.k); tgt[move] = k; tgt[rest] = (tgt[rest] || 0) + 1 - k; }
    a.was = { roll: s.roll, melee: s.melee, dead: s.dead };
    const kk = Math.min(1, dt * 12);
    for (const n in w) { w[n] += (tgt[n] - w[n]) * kk; act[n].setEffectiveWeight(w[n]); }
    rig.mixer.update(dt);
  };
  if (boss) bosses.push(a); else hero = a;
  return c;
}

const preloaded = {};
function preload(loader, file) { return preloaded[file] || (preloaded[file] = loader.loadAsync(CUSTOM + file)); }
async function loadCustom(loader) {
  const man = await loadCustom.man;
  const fams = {};
  if (!man || typeof man !== 'object') return;
  for (const role of Object.keys(man)) {
    const e = man[role];
    if (role === 'props' || !e || typeof e !== 'object') continue;
    if (role === 'heroSkin') {
      try {
        if (!safeFile(e.file)) throw new Error('файл должен лежать в assets/custom');
        const g = await preload(loader, e.file);
        HERO_SKIN = { scene: g.scene, hide: Array.isArray(e.hide) ? e.hide.filter(x => typeof x === 'string') : [], scale: +e.scale || 1 };
        console.info(`Модель героини подключена: ${e.file}`);
      } catch (err) { console.warn('Модель героини не подключена, остаётся манекен:', err.message || err); }
      continue;
    }
    if (role !== 'hero' && !KIND[role] && !BOSS_LOOK[role]) { console.warn(`manifest.json: неизвестная роль «${role}»`); continue; }
    try { const key = JSON.stringify(e); FAM[role] = fams[key] || (fams[key] = await makeFamily(loader, role, e)); console.info(`Своя модель подключена: ${role} ← ${e.file}`); }
    catch (err) { console.warn(`Модель «${role}» не подключена, остаётся манекен:`, err.message || err); }
  }
  const props = man.props && typeof man.props === 'object' ? man.props : {};
  for (const biome of Object.keys(props)) {
    const list = [];
    for (const e of Array.isArray(props[biome]) ? props[biome] : []) {
      try {
        if (!e || !safeFile(e.file)) throw new Error('файл должен лежать в assets/custom');
        const g = await loader.loadAsync(CUSTOM + e.file), scene = g.scene;
        let skinned = false;
        scene.traverse(o => { if (o.isSkinnedMesh) skinned = true; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        if (skinned) throw new Error('декорация должна быть статичной моделью без скелета');
        scene.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(scene), h = bb.max.y - bb.min.y;
        const k = (e.height && h > 0 ? e.height / h : 1) * (e.scale || 1);
        list.push({ scene, k, y: -bb.min.y * k + (e.y || 0), min: e.min ?? 9, spread: e.spread ?? 10, count: Math.max(1, Math.min(60, e.count | 0 || 8)), rot: (e.rotateY || 0) * PI / 180, spin: !!e.randomRotation });
      } catch (err) { console.warn(`Декорация «${e && e.file}» (${biome}) не подключена:`, err.message || err); }
    }
    if (list.length) customProps[biome] = list;
  }
}
