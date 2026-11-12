// Процедурные модели: героиня, солдаты, заражённые, боссы, оружие
import * as THREE from '../vendor/three.module.min.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
const PI = Math.PI;

export const P = (geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => ({ geo, color, pos, rot, scl });
// Параллелепипед со скруглёнными рёбрами: вершины стягиваются к «внутренней» коробке и выносятся на радиус r
const _v = new THREE.Vector3(), _k = new THREE.Vector3();
export function rbox(x, y, z, r, seg = 2) {
  const g = new THREE.BoxGeometry(x, y, z, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal;
  const hx = x / 2 - r, hy = y / 2 - r, hz = z / 2 - r;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    _k.set(Math.max(-hx, Math.min(hx, _v.x)), Math.max(-hy, Math.min(hy, _v.y)), Math.max(-hz, Math.min(hz, _v.z)));
    _v.sub(_k); const len = _v.length();
    if (len > 1e-6) { _v.multiplyScalar(1 / len); p.setXYZ(i, _k.x + _v.x * r, _k.y + _v.y * r, _k.z + _v.z * r); n.setXYZ(i, _v.x, _v.y, _v.z); }
  }
  return g;
}
// мелкие детали остаются простыми коробками, всё крупнее 9 см получает скруглённые рёбра
export const box = (x, y, z) => { const m = Math.min(x, y, z); return m >= 0.09 ? rbox(x, y, z, Math.min(m * 0.24, 0.35), m > 0.7 ? 3 : 2) : new THREE.BoxGeometry(x, y, z); };
export const cyl = (a, b, h, s = 14) => new THREE.CylinderGeometry(a, b, h, Math.max(s, 10));
export const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, Math.max(w, 10), Math.max(h, 8));
export const cone = (r, h, s = 12) => new THREE.ConeGeometry(r, h, Math.max(s, 10));
// гладкая органическая форма (камни, кроны, наросты) вместо гранёного многогранника
export function blob(r = 1, seed = Math.random() * 100) {
  const g = new THREE.SphereGeometry(r, 14, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / r, y = p.getY(i) / r, z = p.getZ(i) / r;
    const d = 1 + 0.2 * Math.sin(x * 2.3 + seed) * Math.sin(y * 2.9 + seed * 1.7) * Math.sin(z * 2.6 + seed * 2.3) + 0.08 * Math.sin(x * 5.1 + seed * 3) * Math.sin(z * 4.7 + seed);
    p.setXYZ(i, x * d * r, y * d * r, z * d * r);
  }
  g.computeVertexNormals();
  return g;
}
export const ico = r => blob(r);

// Склейка частей в одну геометрию с цветами вершин. grit — «грязь»: случайное затемнение по треугольникам.
export function merge(parts, grit = 0) {
  const gs = []; let total = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    _m.compose(_p.set(...p.pos), _q.setFromEuler(_e.set(...p.rot)), _s.set(...p.scl));
    g.applyMatrix4(_m);
    gs.push([g, p.color]); total += g.attributes.position.count;
    p.geo.dispose();
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const [g, c] of gs) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    _c.set(c);
    for (let i = 0; i < n; i += 3) {
      const k = grit ? 1 - Math.random() * grit : 1;
      for (let j = 0; j < 3; j++) {
        const a = (o + i + j) * 3;
        col[a] = _c.r * k; col[a + 1] = _c.g * k; col[a + 2] = _c.b * k;
      }
    }
    o += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export const MAT = {
  char: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
  suit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.32 }),
  gun: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 }),
  prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.55, metalness: 0.6 }),
  wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
  drum: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.45 }),
  glowO: new THREE.MeshBasicMaterial({ color: 0xff7a22 }),
  glowG: new THREE.MeshBasicMaterial({ color: 0x86e05a }),
  glowR: new THREE.MeshBasicMaterial({ color: 0xff2618 }),
  glowC: new THREE.MeshBasicMaterial({ color: 0x4fd8ff }),
  glowY: new THREE.MeshBasicMaterial({ color: 0xffc83a }),
};

// ---------- Гуманоид ----------
function humanoid(o) {
  const d = Object.assign({
    hipY: 0.9, torsoH: 0.55, torsoR: 0.17, torsoZ: 0.7, headR: 0.105, shoulderW: 0.22, hipW: 0.1,
    armR: 0.05, legR: 0.078, top: 0x555555, sleeve: null, bottom: 0x333333, skin: 0x8a8f7a, boots: 0x18181a,
  }, o);
  if (d.sleeve === null) d.sleeve = d.top;
  d.shoulderY = d.torsoH - 0.04;
  const hy = d.torsoH + 0.1 + d.headR;
  const body = [
    P(cyl(d.torsoR * 0.98, d.torsoR * 0.86, d.torsoH, 10), d.top, [0, d.torsoH / 2, 0], [0, 0, 0], [1, 1, d.torsoZ]),
    P(sph(d.torsoR * 0.92), d.bottom, [0, 0, 0], [0, 0, 0], [1, 0.62, d.torsoZ]),
    P(sph(d.torsoR), d.top, [0, d.torsoH - 0.02, 0], [0, 0, 0], [1.22, 0.5, d.torsoZ]),
    P(cyl(0.045, 0.05, 0.12), d.skin, [0, d.torsoH + 0.05, 0]),
    P(sph(d.headR, 12, 10), d.skin, [0, hy, 0], [0, 0, 0], [0.92, 1.08, 1]),
  ];
  const arm = [
    P(cyl(d.armR, d.armR * 0.85, 0.3), d.sleeve, [0, -0.15, 0]),
    P(cyl(d.armR * 0.8, d.armR * 0.65, 0.28), d.skin, [0, -0.44, 0]),
    P(sph(d.armR * 0.9, 6, 5), d.skin, [0, -0.6, 0]),
  ];
  const L = d.hipY;
  const leg = [
    P(cyl(d.legR, d.legR * 0.75, L * 0.5), d.bottom, [0, -L * 0.25, 0]),
    P(cyl(d.legR * 0.72, d.legR * 0.55, L * 0.42), d.bottom, [0, -L * 0.7, 0]),
    P(box(d.legR * 1.5, 0.09, 0.24), d.boots, [0, -L + 0.045, -0.04]),
  ];
  return { d, body, arm, leg, hy };
}

function splitParts(parts, jy, r) {
  const up = [], lo = [];
  for (const p of parts) {
    if (p.pos[1] < jy - 0.001) { p.pos = [p.pos[0], p.pos[1] - jy, p.pos[2]]; lo.push(p); } else up.push(p);
  }
  if (lo.length) lo.push(P(sph(r, 7, 5), lo[0].color, [0, 0, 0]));   // шарнир прикрывает сгиб
  return [up, lo];
}
function finish(h, mat, grit, limbs, extras = []) {
  const d = h.d, kneeY = -d.hipY * 0.5, elbowY = -0.3;
  const [lu, ll] = splitParts(h.leg, kneeY, (d.legR || 0.066) * 0.8);
  const t = { d, mat, bodyGeo: merge(h.body, grit), legGeo: merge(lu, grit), shinGeo: merge(ll, grit), kneeY, limbs, extras, lean: h.lean || 0 };
  if (limbs.armR.elbow !== undefined) {
    const [au, al] = splitParts(h.arm, elbowY, (d.armR || 0.04) * 0.85);
    t.armGeo = merge(au, grit); t.foreGeo = merge(al, grit); t.elbowY = elbowY;
  } else t.armGeo = merge(h.arm, grit);
  return t;
}

// ---------- Шаблоны ----------
const T = {};

function tplHero() {
  const SUIT = 0x14171e, SUIT2 = 0x1f2430, PLATE = 0x2c313b, ACC = 0x7c1d22, SKIN = 0xc59878, HAIR = 0x1c110c, BOOT = 0x0b0c0f, BELT = 0x3b3327;
  const prof = [[0.001, -0.1], [0.12, -0.09], [0.166, -0.02], [0.17, 0.05], [0.148, 0.13], [0.12, 0.22], [0.126, 0.3], [0.15, 0.39],
    [0.158, 0.45], [0.14, 0.52], [0.085, 0.57], [0.05, 0.6], [0.044, 0.68]].map(p => new THREE.Vector2(p[0], p[1]));
  const hy = 0.79;
  const body = [
    P(new THREE.LatheGeometry(prof, 18), SUIT, [0, 0, 0], [0, 0, 0], [1, 1, 0.74]),
    P(sph(0.07, 10, 8), SUIT, [0.066, 0.41, -0.072], [0, 0, 0], [1, 0.95, 0.9]),
    P(sph(0.07, 10, 8), SUIT, [-0.066, 0.41, -0.072], [0, 0, 0], [1, 0.95, 0.9]),
    P(sph(0.06), PLATE, [0.185, 0.52, 0], [0, 0, 0], [1, 0.85, 1]),
    P(sph(0.06), PLATE, [-0.185, 0.52, 0], [0, 0, 0], [1, 0.85, 1]),
    P(box(0.075, 0.012, 0.075), ACC, [0.19, 0.572, 0]),
    P(box(0.075, 0.012, 0.075), ACC, [-0.19, 0.572, 0]),
    P(cyl(0.05, 0.06, 0.04, 10), PLATE, [0, 0.615, 0]),
    P(cyl(0.04, 0.044, 0.08), SKIN, [0, 0.67, 0]),
    P(sph(0.1, 16, 12), SKIN, [0, hy, 0], [0, 0, 0], [0.9, 1.1, 0.98]),
    // волосы: шапка, пряди, хвост
    P(new THREE.SphereGeometry(0.108, 16, 10, 0, PI * 2, 0, PI * 0.6), HAIR, [0, hy + 0.012, 0.012], [0.6, 0, 0], [0.96, 1.08, 1.02]),
    P(box(0.022, 0.13, 0.07), HAIR, [0.086, hy - 0.03, 0.0]),
    P(box(0.022, 0.13, 0.07), HAIR, [-0.086, hy - 0.03, 0.0]),
    P(sph(0.042), HAIR, [0, hy + 0.06, 0.1]),
    P(cyl(0.034, 0.01, 0.38, 8), HAIR, [0, hy - 0.1, 0.19], [-0.5, 0, 0]),
    // тактические очки, губы
    P(box(0.15, 0.03, 0.03), 0x09090b, [0, hy + 0.012, -0.086]),
    P(sph(0.015, 6, 4), 0x7c2c2c, [0, hy - 0.05, -0.088], [0, 0, 0], [1.4, 0.5, 0.6]),
    // ремень, подсумки, разгрузка на спине
    P(cyl(0.156, 0.164, 0.045, 16), BELT, [0, 0.085, 0], [0, 0, 0], [1, 1, 0.76]),
    P(box(0.06, 0.075, 0.045), BELT, [0.125, 0.07, -0.085]),
    P(box(0.06, 0.075, 0.045), BELT, [-0.135, 0.07, 0.075]),
    P(box(0.17, 0.2, 0.035), PLATE, [0, 0.4, 0.1]),
    P(box(0.025, 0.3, 0.02), PLATE, [0.08, 0.42, 0.085], [0, 0, 0.25]),
    P(box(0.025, 0.3, 0.02), PLATE, [-0.08, 0.42, 0.085], [0, 0, -0.25]),
  ];
  const arm = [
    P(cyl(0.042, 0.036, 0.3, 8), SUIT, [0, -0.15, 0]),
    P(cyl(0.035, 0.03, 0.27, 8), SUIT2, [0, -0.43, 0]),
    P(cyl(0.038, 0.036, 0.05, 8), PLATE, [0, -0.3, 0]),
    P(sph(0.036, 6, 5), BOOT, [0, -0.59, 0]),
  ];
  const leg = [
    P(cyl(0.096, 0.064, 0.46, 12), SUIT, [0, -0.22, 0]),
    P(cyl(0.066, 0.044, 0.4, 12), SUIT, [0, -0.64, 0]),
    P(cyl(0.094, 0.091, 0.028, 12), ACC, [0, -0.13, 0]),
    P(sph(0.062), PLATE, [0, -0.45, -0.018], [0, 0, 0], [1, 1.15, 0.9]),
    P(cyl(0.05, 0.056, 0.2, 8), BOOT, [0, -0.79, 0]),
    P(box(0.085, 0.07, 0.22), BOOT, [0, -0.885, -0.04]),
  ];
  const d = { hipY: 0.92, hipW: 0.085, shoulderW: 0.19, shoulderY: 0.5, armR: 0.042, legR: 0.07 };
  body.push(P(box(0.05, 0.004, 0.012), 0x8a5a48, [0.035, hy + 0.04, -0.094], [0, 0, 0.5]));   // шрам над бровью
  const stripe = merge([P(box(0.022, 0.3, 0.012), 0xffffff, [0, 0.4, 0.122]), P(box(0.1, 0.018, 0.012), 0xffffff, [0, 0.54, 0.118])]);
  return finish({ d, body, arm, leg }, MAT.suit, 0, {
    armR: { base: 0.55, amp: 0.03, rz: -0.18, elbow: 1.0 }, armL: { base: 1.0, amp: 0.03, rz: 0.42, elbow: 0.55 }, leg: { amp: 0.78 },
  }, [{ geo: stripe, mat: MAT.glowC }]);
}

function tplSoldier() {
  const h = humanoid({ torsoR: 0.18, top: 0x3d4434, sleeve: 0x424a38, bottom: 0x353b2e, skin: 0x8a735e, armR: 0.052, legR: 0.082 });
  const hy = h.hy;
  h.body.push(
    P(box(0.37, 0.32, 0.27), 0x2b3026, [0, 0.33, 0]),
    P(box(0.24, 0.26, 0.12), 0x30352a, [0, 0.33, 0.18]),
    P(new THREE.SphereGeometry(0.125, 12, 8, 0, PI * 2, 0, PI * 0.55), 0x2f3528, [0, hy + 0.015, 0]),
    P(box(0.09, 0.07, 0.05), 0x2b3026, [0.1, 0.12, -0.14]),
    P(box(0.09, 0.07, 0.05), 0x2b3026, [-0.1, 0.12, -0.14]),
  );
  h.arm[2].color = 0x1c1c1c;
  h.body.push(
    P(box(0.17, 0.035, 0.03), 0x0b0b0c, [0, hy + 0.02, -0.095]),                       // очки
    P(box(0.2, 0.05, 0.02), 0x3a3f33, [0, hy + 0.06, -0.115]),                         // козырёк шлема
    P(cyl(0.006, 0.006, 0.34, 4), 0x151515, [-0.1, 0.62, 0.2]),                        // антенна рации
    P(box(0.07, 0.11, 0.05), 0x22261e, [-0.1, 0.44, 0.22]),
    P(box(0.09, 0.09, 0.05), 0x2b3026, [0, 0.12, -0.15]), P(box(0.08, 0.12, 0.06), 0x2b3026, [0.19, 0.02, 0]),
    P(box(0.03, 0.5, 0.02), 0x1f221b, [0.07, 0.36, -0.14], [0, 0, 0.5]),               // ремень оружия
    P(box(0.34, 0.05, 0.25), 0x22261e, [0, 0.03, 0]),
  );
  h.leg.push(P(sph(0.075, 7, 5), 0x2b3026, [0, -0.455, -0.03], [0, 0, 0], [1, 1.1, 0.8]), P(box(0.1, 0.12, 0.06), 0x2b3026, [0.06, -0.2, 0]));
  h.leg[2] = P(box(0.13, 0.13, 0.27), 0x141414, [0, -0.9 + 0.065, -0.04]);
  return finish(h, MAT.char, 0.12, {
    armR: { base: 0.55, amp: 0.03, rz: -0.18, elbow: 1.0 }, armL: { base: 1.0, amp: 0.03, rz: 0.42, elbow: 0.55 }, leg: { amp: 0.75 },
  });
}

const BLOOD = 0x3d0b0b, GORE = 0x5a1410;
function zombieBase(o, variant = 0) {
  const tops = [0x4b525b, 0x57493c, 0x3e4a3c, 0x5c5850];
  const skins = [0x7f8870, 0x8b8c7c, 0x6f7a6c];
  const h = humanoid(Object.assign({ top: tops[variant % 4], bottom: [0x2c2f36, 0x33302b][variant % 2], skin: skins[variant % 3] }, o));
  const d = h.d, hy = h.hy;
  h.body.push(
    P(box(d.headR * 1.1, d.headR * 0.5, d.headR * 0.5), 0x1d0606, [0, hy - d.headR * 0.55, -d.headR * 0.72]),
    P(sph(d.headR * 0.22, 5, 4), 0x0a0a0a, [d.headR * 0.38, hy + d.headR * 0.15, -d.headR * 0.82]),
    P(sph(d.headR * 0.22, 5, 4), 0x0a0a0a, [-d.headR * 0.38, hy + d.headR * 0.15, -d.headR * 0.82]),
    P(sph(d.torsoR * 0.6, 7, 5), BLOOD, [d.torsoR * 0.3, d.torsoH * 0.55, -d.torsoR * d.torsoZ * 0.75], [0, 0, 0], [1, 1.3, 0.35]),
    P(sph(d.torsoR * 0.4, 7, 5), GORE, [-d.torsoR * 0.4, d.torsoH * 0.25, -d.torsoR * d.torsoZ * 0.8], [0, 0, 0], [1, 1, 0.35]),
  );
  h.arm.push(P(sph(d.armR * 0.9, 5, 4), BLOOD, [0, -0.5, -d.armR * 0.3], [0, 0, 0], [1, 1.6, 1]));
  // клочья волос, рваный подол, рёбра в ране, кисти-когти
  const HAIRC = [0x1e1a16, 0x3a2c1e, 0x55524c][variant % 3];
  h.body.push(
    P(new THREE.SphereGeometry(d.headR * 1.04, 8, 5, 0, PI * 2, 0, PI * (0.3 + (variant % 3) * 0.1)), HAIRC, [0, hy + 0.005, 0.012], [0.5, variant, 0]),
    P(box(d.torsoR * 0.7, 0.14, 0.015), d.top, [d.torsoR * 0.45, -0.06, -d.torsoR * d.torsoZ * 0.95], [0.25, 0, 0.2]),
    P(box(d.torsoR * 0.5, 0.2, 0.015), d.top, [-d.torsoR * 0.5, -0.09, -d.torsoR * d.torsoZ * 0.9], [0.3, 0, -0.15]),
    P(box(d.torsoR * 0.6, 0.16, 0.015), d.top, [0, -0.07, d.torsoR * d.torsoZ * 0.95], [-0.2, 0, 0.1]),
    P(box(d.torsoR * 0.5, 0.012, 0.02), 0xb9b3a0, [d.torsoR * 0.3, d.torsoH * 0.62, -d.torsoR * d.torsoZ * 0.98]),
    P(box(d.torsoR * 0.5, 0.012, 0.02), 0xb9b3a0, [d.torsoR * 0.3, d.torsoH * 0.52, -d.torsoR * d.torsoZ * 0.98]),
    P(box(d.torsoR * 0.45, 0.012, 0.02), 0xb9b3a0, [d.torsoR * 0.3, d.torsoH * 0.42, -d.torsoR * d.torsoZ * 0.96]),
    P(sph(d.headR * 0.45, 6, 4), GORE, [d.headR * 0.5, hy - d.headR * 0.9, 0.01], [0, 0, 0], [1, 0.6, 1]),
  );
  for (let f = -1; f <= 1; f++) h.arm.push(P(cone(d.armR * 0.22, d.armR * 1.6, 4), 0x2a2420, [f * d.armR * 0.45, -0.66, 0], [0, 0, PI]));
  h.lean = -0.28;
  return h;
}
const Z_LIMBS = { armR: { base: 1.15, amp: 0.2, rz: -0.1, elbow: 0.35 }, armL: { base: 0.95, amp: 0.2, rz: 0.12, ph: 1.3, elbow: 0.5 }, leg: { amp: 0.6 } };

function tplWalker(v) { return finish(zombieBase({}, v), MAT.char, 0.4, Z_LIMBS); }
function tplRunner() {
  const h = zombieBase({ torsoR: 0.14, armR: 0.04, legR: 0.062, top: 0x4a3f3a, skin: 0x8f8a80 }, 2);
  h.lean = -0.55;
  return finish(h, MAT.char, 0.4, { armR: { base: 0.2, amp: 0.9, rz: -0.1, ph: PI, elbow: 1.3 }, armL: { base: 0.2, amp: 0.9, rz: 0.1, elbow: 1.3 }, leg: { amp: 0.95 } });
}
function tplFat() {
  const h = zombieBase({ torsoR: 0.3, torsoZ: 0.95, torsoH: 0.6, armR: 0.075, legR: 0.11, shoulderW: 0.36, hipW: 0.15, top: 0x5c5a4c, skin: 0x868a6e }, 1);
  h.body.push(P(sph(0.34, 10, 8), 0x7a7d62, [0, 0.2, -0.1], [0, 0, 0], [1, 0.9, 0.9]),
    P(sph(0.12, 6, 5), GORE, [0.1, 0.25, -0.38], [0, 0, 0], [1.4, 1, 0.4]));
  h.lean = -0.12;
  return finish(h, MAT.char, 0.4, { armR: { base: 0.9, amp: 0.15, rz: -0.3 }, armL: { base: 0.8, amp: 0.15, rz: 0.3, ph: 1 }, leg: { amp: 0.45 } });
}
function tplSpitter() {
  const h = zombieBase({ top: 0x4d5140, skin: 0x7f8458 }, 2);
  const hy = h.hy;
  h.body.push(P(sph(0.2, 10, 8), 0x8d8f45, [0, hy - 0.18, -0.08], [0, 0, 0], [1.1, 0.9, 1]),
    P(sph(0.12, 8, 6), 0x9c9a4a, [0.12, 0.42, 0.14]), P(sph(0.1, 8, 6), 0x8d8f45, [-0.1, 0.3, 0.15]));
  const ex = merge([P(sph(0.07, 6, 5), 0xffffff, [0, hy - 0.2, -0.26]), P(sph(0.04, 6, 5), 0xffffff, [0.13, 0.46, 0.24])]);
  h.lean = -0.15;
  return finish(h, MAT.char, 0.35, Z_LIMBS, [{ geo: ex, mat: MAT.glowG }]);
}
function tplExploder() {
  const h = zombieBase({ torsoR: 0.22, torsoZ: 0.9, top: 0x5a3a30, skin: 0x8a5a48, bottom: 0x2e2622 }, 0);
  h.body.push(P(sph(0.26, 10, 8), 0x7a3a2c, [0, 0.3, 0.02]));
  const pts = [[0.16, 0.42, -0.17], [-0.14, 0.26, -0.2], [0.05, 0.16, -0.24], [-0.2, 0.44, 0.06], [0.2, 0.2, 0.1], [0, 0.5, 0.2], [-0.05, 0.36, -0.25]];
  const ex = merge(pts.map(p => P(sph(0.06 + Math.random() * 0.03, 6, 5), 0xffffff, p)));
  return finish(h, MAT.char, 0.35, { armR: { base: 0.5, amp: 0.5, rz: -0.4 }, armL: { base: 0.5, amp: 0.5, rz: 0.4, ph: PI }, leg: { amp: 0.8 } }, [{ geo: ex, mat: MAT.glowO }]);
}

// ---------- Ползуны ----------
function tplCrawler(o = {}) {
  const d = Object.assign({ skin: 0x6e6658, dark: 0x3a322c, legs: 4, abdomen: 0, bodyY: 0.42 }, o);
  const body = [
    P(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), d.skin, [0, 0, 0], [PI / 2, 0, 0]),
    P(sph(0.17, 10, 8), d.skin, [0, 0.06, -0.5], [0, 0, 0], [1, 0.9, 1.15]),
    P(box(0.2, 0.07, 0.16), 0x1d0606, [0, -0.02, -0.62]),
    P(sph(0.1, 6, 5), BLOOD, [0.08, 0.16, -0.1], [0, 0, 0], [1.4, 0.4, 1.8]),
  ];
  for (let i = 0; i < 5; i++) body.push(P(cone(0.035, 0.16, 5), d.dark, [0, 0.22, -0.3 + i * 0.15], [-0.3, 0, 0]));
  const extras = [];
  if (d.abdomen) {
    body.push(P(sph(d.abdomen, 12, 10), 0x6b5440, [0, 0.12, 0.62], [0, 0, 0], [1, 0.85, 1.25]),
      P(sph(d.abdomen * 0.5, 8, 6), 0x7d6248, [0.25, 0.3, 0.5]), P(sph(d.abdomen * 0.45, 8, 6), 0x7d6248, [-0.28, 0.24, 0.8]),
      P(cone(0.05, 0.3, 5), d.dark, [0.12, 0.2, -0.66], [-1.2, 0, 0.3]), P(cone(0.05, 0.3, 5), d.dark, [-0.12, 0.2, -0.66], [-1.2, 0, -0.3]));
    const sacs = [[0.3, 0.35, 0.7], [-0.2, 0.42, 0.55], [0, 0.4, 1.0], [-0.36, 0.2, 1.0], [0.32, 0.12, 1.05]];
    extras.push({ geo: merge(sacs.map(p => P(sph(0.11, 7, 6), 0xffffff, p))), mat: MAT.glowG });
  }
  const leg = [
    P(cyl(0.05, 0.04, 0.4, 6), d.skin, [0.16, 0.06, 0], [0, 0, -1.1]),
    P(cyl(0.04, 0.02, 0.5, 6), d.dark, [0.36, -0.14, 0], [0, 0, -0.15]),
  ];
  return { crawler: true, d, mat: MAT.char, bodyGeo: merge(body, 0.4), legGeo: merge(leg, 0.3), extras };
}

// ---------- Боссы ----------
function tplButcher() {
  const h = zombieBase({ torsoR: 0.3, torsoZ: 0.9, torsoH: 0.62, headR: 0.115, armR: 0.09, legR: 0.12, shoulderW: 0.38, hipW: 0.15, top: 0x75624f, skin: 0x7c6a58, bottom: 0x27231f }, 1);
  const hy = h.hy;
  h.body.push(
    P(box(0.5, 0.75, 0.03), 0x8d8474, [0, 0.22, -0.3]), P(box(0.3, 0.3, 0.035), BLOOD, [0.05, 0.2, -0.305]), P(box(0.18, 0.4, 0.035), GORE, [-0.12, 0.34, -0.305]),
    P(sph(0.33, 10, 8), 0x75624f, [0, 0.18, -0.06]),
    P(box(0.2, 0.14, 0.08), 0x1b1b1d, [0, hy - 0.03, -0.1]),
    P(cyl(0.02, 0.02, 0.7, 5), 0x333333, [0, 0.45, 0.28], [0, 0, 1.2]),
  );
  h.arm.push(P(box(0.03, 0.42, 0.24), 0x8f9296, [0, -0.8, -0.05]), P(box(0.035, 0.1, 0.05), 0x2b1d14, [0, -0.62, 0]), P(box(0.032, 0.16, 0.25), GORE, [0, -0.93, -0.05]));
  h.lean = -0.15;
  return finish(h, MAT.char, 0.35, { armR: { base: 0.6, amp: 0.35, rz: -0.35, elbow: 0.6 }, armL: { base: 0.6, amp: 0.35, rz: 0.35, ph: PI, elbow: 0.6 }, leg: { amp: 0.4 } });
}
function tplTreant() {
  const BARK = 0x33271a, DARK = 0x231a11, MOSS = 0x34421f;
  const h = humanoid({ torsoR: 0.25, torsoZ: 0.85, torsoH: 0.78, headR: 0.12, armR: 0.075, legR: 0.11, shoulderW: 0.33, hipW: 0.13, top: BARK, bottom: DARK, skin: 0x3d2e1e, boots: DARK });
  const hy = h.hy;
  const spikes = [[0.3, 0.8, 0.05, 0, 0, -0.6], [-0.32, 0.82, 0, 0, 0, 0.7], [0.12, 0.95, 0.12, 0.3, 0, -0.2], [-0.1, 0.6, 0.22, 1.0, 0, 0.2], [0.18, 0.4, 0.22, 1.2, 0, -0.3], [0, hy + 0.2, 0, 0, 0, 0.1], [0.1, hy + 0.14, 0.04, 0, 0, -0.5], [-0.1, hy + 0.14, 0.02, 0, 0, 0.5]];
  for (const s of spikes) h.body.push(P(cone(0.06, 0.5, 5), DARK, [s[0], s[1], s[2]], [s[3], s[4], s[5]]));
  h.body.push(P(sph(0.18, 7, 5), MOSS, [0.2, 0.7, -0.05], [0, 0, 0], [1, 0.6, 1]), P(sph(0.16, 7, 5), MOSS, [-0.15, 0.3, -0.16], [0, 0, 0], [1, 0.8, 0.6]),
    P(box(0.14, 0.05, 0.06), 0x100806, [0, hy - 0.05, -0.1]));
  h.arm.push(P(cone(0.03, 0.35, 5), DARK, [0.04, -0.75, 0], [0, 0, PI]), P(cone(0.03, 0.35, 5), DARK, [-0.04, -0.75, 0], [0, 0, PI]), P(cone(0.03, 0.3, 5), DARK, [0, -0.72, -0.05], [0, 0, PI]));
  const ex = merge([P(sph(0.03, 5, 4), 0xffffff, [0.05, hy + 0.02, -0.11]), P(sph(0.03, 5, 4), 0xffffff, [-0.05, hy + 0.02, -0.11])]);
  h.lean = -0.1;
  return finish(h, MAT.char, 0.45, { armR: { base: 0.7, amp: 0.3, rz: -0.4, elbow: 0.5 }, armL: { base: 0.5, amp: 0.3, rz: 0.4, ph: 2, elbow: 0.6 }, leg: { amp: 0.35 } }, [{ geo: ex, mat: MAT.glowG }]);
}
function tplGoliath(ARM = 0x4b5158, ARM2 = 0x33383e, glow = MAT.glowO) {
  const h = zombieBase({ torsoR: 0.3, torsoZ: 0.9, torsoH: 0.68, headR: 0.11, armR: 0.095, legR: 0.125, shoulderW: 0.4, hipW: 0.16, top: 0x4d4a44, skin: 0x7a7468, bottom: 0x26282a }, 1);
  const hy = h.hy;
  h.body.push(
    P(box(0.62, 0.45, 0.5), ARM, [0, 0.42, 0]), P(box(0.5, 0.2, 0.46), ARM2, [0, 0.12, 0]),
    P(box(0.3, 0.2, 0.36), ARM, [0.44, 0.7, 0], [0, 0, -0.3]), P(box(0.3, 0.2, 0.36), ARM, [-0.44, 0.7, 0], [0, 0, 0.3]),
    P(box(0.27, 0.26, 0.28), ARM2, [0, hy + 0.01, 0.01]), P(box(0.2, 0.05, 0.02), 0x0a0a0a, [0, hy + 0.03, -0.14]),
    P(cyl(0.07, 0.07, 0.5, 8), ARM2, [0.22, 0.6, 0.32]), P(cyl(0.07, 0.07, 0.5, 8), ARM2, [-0.22, 0.6, 0.32]),
  );
  h.arm.push(P(box(0.24, 0.3, 0.24), ARM, [0, -0.42, 0]), P(box(0.2, 0.16, 0.2), ARM2, [0, -0.64, 0]));
  h.leg.push(P(box(0.26, 0.34, 0.26), ARM, [0, -0.3, 0]), P(box(0.22, 0.3, 0.24), ARM2, [0, -0.68, 0]));
  const ex = merge([P(box(0.2, 0.2, 0.03), 0xffffff, [0, 0.44, -0.255]), P(box(0.16, 0.02, 0.02), 0xffffff, [0, hy + 0.03, -0.152])]);
  h.lean = -0.05;
  return finish(h, MAT.char, 0.25, { armR: { base: 0.35, amp: 0.3, rz: -0.3, elbow: 0.6 }, armL: { base: 0.35, amp: 0.3, rz: 0.3, ph: PI, elbow: 0.6 }, leg: { amp: 0.4 } }, [{ geo: ex, mat: glow, core: true }]);
}
function tplGold() {
  const h = humanoid({ torsoR: 0.15, armR: 0.042, legR: 0.066, top: 0xb8902a, bottom: 0x8a6a1c, skin: 0xd8b040, boots: 0x5a4410 });
  h.lean = -0.4;
  const ex = merge([P(sph(0.05, 6, 5), 0xffffff, [0, h.hy + 0.16, 0])]);
  return finish(h, MAT.suit, 0.1, { armR: { base: 0.2, amp: 0.9, rz: -0.1, ph: PI, elbow: 1.3 }, armL: { base: 0.2, amp: 0.9, rz: 0.1, elbow: 1.3 }, leg: { amp: 0.95 } }, [{ geo: ex, mat: MAT.glowY }]);
}
function tplPatriarch() {
  const DARK = 0x1a1216, PALE = 0x8c8088, BONE = 0xa39e90;
  const h = humanoid({ torsoR: 0.19, torsoZ: 0.8, torsoH: 0.85, headR: 0.1, armR: 0.05, legR: 0.08, shoulderW: 0.3, hipW: 0.1, hipY: 1.0, top: DARK, bottom: 0x120c0f, skin: PALE, boots: 0x0a0708 });
  const hy = h.hy;
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.4;
    h.body.push(P(cone(0.03, 0.34, 5), BONE, [Math.sin(a) * 0.1, hy + 0.12 + Math.cos(a) * 0.05, 0.02], [0.15, 0, -a * 0.6]));
  }
  for (let i = 0; i < 4; i++) h.body.push(P(box(0.34 - i * 0.02, 0.025, 0.02), BONE, [0, 0.36 + i * 0.1, -0.155]));
  h.body.push(
    P(box(0.6, 1.3, 0.04), 0x100b0d, [0, 0.2, 0.18], [0.12, 0, 0]),
    P(sph(0.16, 8, 6), DARK, [0.3, 0.84, 0], [0, 0, 0], [1.2, 0.6, 1]), P(sph(0.16, 8, 6), DARK, [-0.3, 0.84, 0], [0, 0, 0], [1.2, 0.6, 1]),
    P(cone(0.05, 0.4, 5), BONE, [0.36, 1.0, 0], [0, 0, -0.5]), P(cone(0.05, 0.4, 5), BONE, [-0.36, 1.0, 0], [0, 0, 0.5]),
    P(box(0.12, 0.06, 0.05), 0x0c0406, [0, hy - 0.06, -0.08]),
  );
  h.arm.push(P(cone(0.02, 0.3, 4), BONE, [0.03, -0.74, 0], [0, 0, PI]), P(cone(0.02, 0.3, 4), BONE, [-0.03, -0.74, 0], [0, 0, PI]), P(cone(0.02, 0.26, 4), BONE, [0, -0.72, -0.04], [0, 0, PI]));
  const ex = merge([P(sph(0.022, 5, 4), 0xffffff, [0.04, hy + 0.02, -0.092]), P(sph(0.022, 5, 4), 0xffffff, [-0.04, hy + 0.02, -0.092]), P(sph(0.07, 8, 6), 0xffffff, [0, 0.5, -0.14], [0, 0, 0], [1, 1.3, 0.5])]);
  h.lean = -0.08;
  return finish(h, MAT.char, 0.3, { armR: { base: 0.4, amp: 0.25, rz: -0.6, elbow: 0.8 }, armL: { base: 0.4, amp: 0.25, rz: 0.6, ph: 1.6, elbow: 0.8 }, leg: { amp: 0.3 } }, [{ geo: ex, mat: MAT.glowR }]);
}

const BUILD = {
  hero: tplHero, soldier: tplSoldier,
  walker0: () => tplWalker(0), walker1: () => tplWalker(1), walker2: () => tplWalker(2), walker3: () => tplWalker(3),
  runner: tplRunner, fat: tplFat, spitter: tplSpitter, exploder: tplExploder,
  crawler: () => tplCrawler(),
  queen: () => tplCrawler({ skin: 0x6a5a48, dark: 0x2c231c, legs: 6, abdomen: 0.5 }),
  butcher: tplButcher, treant: tplTreant, goliath: () => tplGoliath(), patriarch: tplPatriarch,
  omega: () => tplGoliath(0x2a3648, 0x1a2230, MAT.glowC), gold: tplGold,
};

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; return m;
}

// Скелетные модели (actors.js) подменяют процедурные, когда загружены
let actorFactory = null;
export function setActorFactory(fn) { actorFactory = fn; }

export function makeChar(kind, scale = 1) {
  if (actorFactory) { const a = actorFactory(kind, scale); if (a) return a; }
  if (kind === 'walker') kind = 'walker' + (Math.random() * 4 | 0);
  const t = T[kind] || (T[kind] = BUILD[kind]());
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const limbs = [];
  let body, hipY;
  if (t.crawler) {
    hipY = t.d.bodyY;
    body = mesh(t.bodyGeo, t.mat); body.position.y = hipY; root.add(body);
    const n = t.d.legs;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? -1 : 1, row = Math.floor(i / 2), rows = n / 2;
      const m = mesh(t.legGeo, t.mat, false);
      m.position.set(side * 0.16, 0, -0.3 + row * (0.6 / Math.max(1, rows - 1)));
      m.scale.x = side;
      body.add(m);
      limbs.push({ m, lower: null, kind: 'leg', bend: 0, base: 0, amp: 0.55, ph: (i % 2 ? PI : 0) + row * 1.4, freq: 1.6 });
    }
  } else {
    const d = t.d; hipY = d.hipY;
    body = mesh(t.bodyGeo, t.mat); body.position.y = hipY; body.rotation.x = t.lean; root.add(body);
    for (const side of [1, -1]) {
      const cfg = side > 0 ? t.limbs.armR : t.limbs.armL;
      const a = mesh(t.armGeo, t.mat);
      a.position.set(side * d.shoulderW, d.shoulderY, 0); a.rotation.order = 'ZXY'; a.rotation.z = cfg.rz || 0;
      body.add(a);
      let fore = null;
      if (t.foreGeo) { fore = mesh(t.foreGeo, t.mat, false); fore.position.y = t.elbowY; a.add(fore); }
      limbs.push({ m: a, lower: fore, kind: 'arm', bend: cfg.elbow || 0, base: cfg.base - t.lean, amp: cfg.amp, ph: cfg.ph || 0, freq: 1 });
      const l = mesh(t.legGeo, t.mat);
      l.position.set(side * d.hipW, hipY, 0); root.add(l);
      const shin = mesh(t.shinGeo, t.mat); shin.position.y = t.kneeY; l.add(shin);
      limbs.push({ m: l, lower: shin, kind: 'leg', bend: 0, base: 0, amp: t.limbs.leg.amp, ph: side > 0 ? 0 : PI, freq: 1 });
    }
  }
  let core = null;
  for (const ex of t.extras) {
    const m = new THREE.Mesh(ex.geo, ex.core ? ex.mat.clone() : ex.mat);
    body.add(m);
    if (ex.core) core = m;
  }
  root.scale.setScalar(scale);
  const c = { root, body, limbs, hipY, kind, core, phase: Math.random() * 6.28, gun: null, lean: t.lean || 0 };
  animChar(c, 0, 0);
  return c;
}

// t — время шага (рад), k — интенсивность (0 = стоит)
export function animChar(c, t, k = 1) {
  if (c.actor) { c.actor.anim(t, k); return; }
  t += c.phase;
  for (const l of c.limbs) {
    const ph = t * l.freq + l.ph;
    l.m.rotation.x = l.base + Math.sin(ph) * l.amp * k;
    if (l.lower) {
      l.lower.rotation.x = l.kind === 'leg'
        ? -(0.06 + Math.max(0, Math.cos(ph)) * 1.35 * l.amp * k)     // колено сгибается на переносе ноги
        : l.bend + Math.sin(ph) * l.amp * 0.35 * k;
    }
  }
  c.body.position.y = c.hipY + Math.abs(Math.sin(t)) * 0.035 * k;
  c.body.rotation.y = Math.sin(t) * 0.09 * k;
  c.body.rotation.x = c.lean;
}

// ---------- Оружие ----------
const GUN = 0x1a1a1c, GUN2 = 0x2b2d30, WOOD = 0x5e3b20, OLIVE = 0x3b4230;
const brl = (r, len, z, y = 0.012, col = GUN) => P(cyl(r, r, len, 6), col, [0, y, z], [PI / 2, 0, 0]);
const WPN = [
  () => [ // АК-47
    P(box(0.045, 0.07, 0.36), GUN, [0, 0, 0]), brl(0.011, 0.36, -0.36), brl(0.013, 0.2, -0.27, 0.04),
    P(box(0.05, 0.055, 0.2), WOOD, [0, 0.003, -0.26]), P(box(0.034, 0.2, 0.07), GUN2, [0, -0.12, -0.08], [-0.35, 0, 0]),
    P(box(0.034, 0.1, 0.045), WOOD, [0, -0.08, 0.1], [0.3, 0, 0]), P(box(0.04, 0.085, 0.26), WOOD, [0, -0.02, 0.3], [0.08, 0, 0]),
    P(box(0.01, 0.045, 0.012), GUN, [0, 0.04, -0.5]),
  ],
  () => [ // штурмовая винтовка
    P(box(0.05, 0.08, 0.4), GUN, [0, 0, 0]), brl(0.012, 0.3, -0.36), P(box(0.055, 0.06, 0.26), GUN2, [0, 0.005, -0.28]),
    P(box(0.034, 0.17, 0.06), GUN2, [0, -0.12, -0.05], [-0.1, 0, 0]), P(box(0.034, 0.1, 0.045), GUN, [0, -0.08, 0.1], [0.3, 0, 0]),
    P(box(0.045, 0.09, 0.24), GUN2, [0, -0.01, 0.3]), P(box(0.03, 0.04, 0.14), GUN, [0, 0.065, -0.02]), brl(0.02, 0.1, -0.52, 0.012, GUN2),
  ],
  () => [ // пулемёт
    P(box(0.06, 0.09, 0.5), GUN, [0, 0, 0]), brl(0.015, 0.5, -0.48), P(box(0.065, 0.05, 0.3), GUN2, [0, 0.01, -0.36]),
    P(box(0.12, 0.13, 0.13), OLIVE, [-0.03, -0.11, -0.08]), P(box(0.034, 0.1, 0.045), GUN, [0, -0.09, 0.14], [0.3, 0, 0]),
    P(box(0.05, 0.1, 0.26), WOOD, [0, -0.02, 0.36]), P(cyl(0.006, 0.006, 0.24, 4), GUN2, [0.05, -0.1, -0.6], [0, 0, -0.3]),
    P(cyl(0.006, 0.006, 0.24, 4), GUN2, [-0.05, -0.1, -0.6], [0, 0, 0.3]), P(box(0.02, 0.04, 0.02), GUN, [0, 0.06, -0.7]),
  ],
  () => { // миниган
    const p = [P(cyl(0.07, 0.07, 0.28, 10), GUN2, [0, 0, 0.05], [PI / 2, 0, 0]), P(box(0.1, 0.14, 0.2), GUN, [0, -0.04, 0.2]),
      P(cyl(0.062, 0.062, 0.03, 10), GUN, [0, 0, -0.3], [PI / 2, 0, 0]), P(cyl(0.062, 0.062, 0.03, 10), GUN, [0, 0, -0.62], [PI / 2, 0, 0]),
      P(box(0.14, 0.16, 0.14), OLIVE, [-0.12, -0.1, 0.12]), P(box(0.03, 0.03, 0.2), GUN, [0, 0.1, 0.08])];
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; p.push(P(cyl(0.013, 0.013, 0.62, 5), GUN, [Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.4], [PI / 2, 0, 0])); }
    return p;
  },
  () => [ // ракетомёт
    P(cyl(0.065, 0.065, 0.95, 10), OLIVE, [0, 0.06, 0], [PI / 2, 0, 0]), P(cyl(0.08, 0.065, 0.12, 10), GUN2, [0, 0.06, 0.5], [PI / 2, 0, 0]),
    P(cyl(0.075, 0.075, 0.06, 10), GUN2, [0, 0.06, -0.47], [PI / 2, 0, 0]), P(box(0.034, 0.11, 0.045), GUN, [0, -0.05, -0.05], [0.2, 0, 0]),
    P(box(0.034, 0.1, 0.045), GUN, [0, -0.05, -0.25]), P(box(0.03, 0.07, 0.12), GUN, [0.06, 0.14, -0.1]),
    P(cone(0.05, 0.14, 8), 0x5a2a1a, [0, 0.06, -0.55], [-PI / 2, 0, 0]),
  ],
  () => [ // лазер
    P(box(0.08, 0.1, 0.5), 0x3a3f46, [0, 0, 0]), P(box(0.06, 0.06, 0.36), 0x23262b, [0, 0.01, -0.4]),
    brl(0.02, 0.2, -0.66, 0.01, 0x8a2018), P(cyl(0.045, 0.045, 0.03, 8), 0xb5b8bc, [0, 0.01, -0.3], [PI / 2, 0, 0]),
    P(cyl(0.045, 0.045, 0.03, 8), 0xb5b8bc, [0, 0.01, -0.42], [PI / 2, 0, 0]), P(cyl(0.045, 0.045, 0.03, 8), 0xb5b8bc, [0, 0.01, -0.54], [PI / 2, 0, 0]),
    P(box(0.1, 0.14, 0.16), 0x23262b, [0, -0.08, 0.16]), P(box(0.034, 0.1, 0.045), GUN, [0, -0.09, -0.02], [0.3, 0, 0]),
    P(box(0.02, 0.03, 0.3), 0x8a2018, [0.045, 0.02, 0]), P(box(0.05, 0.08, 0.2), 0x3a3f46, [0, 0, 0.34]),
  ],
];
const wpnGeo = [];
export const weaponParts = tier => WPN[tier]();
export function weaponMesh(tier) {
  if (!wpnGeo[tier]) wpnGeo[tier] = merge(WPN[tier]());
  const m = new THREE.Mesh(wpnGeo[tier], MAT.gun); m.castShadow = true; m.scale.setScalar(1.25);
  return m;
}
export function giveGun(c, tier, heavy = false) {
  if (c.actor) { if (c.actor.setGun) c.actor.setGun(tier); return; }
  if (c.gun) c.body.remove(c.gun);
  c.gun = weaponMesh(tier);
  c.gun.position.set(0.07, tier >= 3 ? 0.2 : 0.27, -0.42);
  c.body.add(c.gun);
}
