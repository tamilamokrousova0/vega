// Простая физика: твёрдые обломки (гравитация, отскок, трение) и падающие тела
import * as THREE from '../vendor/three.module.min.js';
import { G, rand } from './state.js';
import { dustBurst } from './fx.js';

const N = 300, GRAV = 24;
let mesh, bi = 0;
const bodies = [];
const corpses = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function initPhysics() {
  mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 }), N);
  mesh.castShadow = true; mesh.frustumCulled = false;
  for (let i = 0; i < N; i++) {
    bodies.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, sx: 1, sy: 1, sz: 1, life: 0, rest: false, bounce: 0.35 });
    mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, _c.set(0xffffff));
  }
  G.scene.add(mesh);
}

// n обломков цвета color, разлетающихся из точки. o: {long, up, vx, vz, life, bounce, spread}
export function debris(x, y, z, n, color, size = 0.2, power = 5, o = {}) {
  for (let k = 0; k < n; k++) {
    const i = bi; bi = (bi + 1) % N;
    const b = bodies[i], a = Math.random() * 6.283, v = rand(0.3, 1) * power, sp = o.spread ?? 0.3;
    b.on = true; b.rest = false; b.life = (o.life || 7) * rand(0.7, 1.2); b.bounce = o.bounce ?? 0.35;
    b.x = x + rand(-sp, sp); b.y = Math.max(0.1, y + rand(-sp, sp)); b.z = z + rand(-sp, sp);
    b.vx = Math.cos(a) * v + (o.vx || 0); b.vz = Math.sin(a) * v + (o.vz || 0); b.vy = rand(0.4, 1) * power * (o.up ?? 1);
    b.rx = rand(0, 6); b.ry = rand(0, 6); b.rz = rand(0, 6);
    b.wx = rand(-12, 12); b.wy = rand(-12, 12); b.wz = rand(-12, 12);
    const s = size * rand(0.6, 1.3);
    b.sx = s * (o.long ? rand(2, 4) : rand(0.7, 1.4)); b.sy = s * rand(0.5, 1); b.sz = s * rand(0.7, 1.3);
    _c.set(color).multiplyScalar(rand(0.65, 1.1)); mesh.setColorAt(i, _c);
  }
  mesh.instanceColor.needsUpdate = true;
}

export function casing(x, y, z) {
  const i = bi; bi = (bi + 1) % N;
  const b = bodies[i];
  b.on = true; b.rest = false; b.life = 2.2; b.bounce = 0.45;
  b.x = x; b.y = y; b.z = z; b.vx = rand(2, 4); b.vy = rand(2.5, 4.5); b.vz = rand(0.5, 2);
  b.rx = rand(0, 6); b.ry = rand(0, 6); b.rz = 0; b.wx = rand(-20, 20); b.wy = rand(-20, 20); b.wz = rand(-20, 20);
  b.sx = 0.035; b.sy = 0.035; b.sz = 0.11;
  mesh.setColorAt(i, _c.set(0xb08a3a)); mesh.instanceColor.needsUpdate = true;
}

// Ударная волна: подбрасывает лежащие обломки и тела
export function impulse(x, z, r, power) {
  const r2 = r * r;
  for (let i = 0; i < N; i++) {
    const b = bodies[i]; if (!b.on) continue;
    const dx = b.x - x, dz = b.z - z, d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) + 0.3, k = power * (1 - d / (r + 0.3)) + 1;
    b.vx += dx / d * k; b.vz += dz / d * k; b.vy += k * rand(0.6, 1.1);
    b.wx = rand(-14, 14); b.wz = rand(-14, 14); b.rest = false;
  }
  for (const c of corpses) {
    const dx = c.x - x, dz = c.z - z, d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) + 0.3, k = power * 0.7 * (1 - d / (r + 0.3)) / c.mass;
    c.vx += dx / d * k; c.vz += dz / d * k; c.vy = Math.max(c.vy, k * 0.8); c.spin = rand(-4, 4);
  }
}

// Тело падает и остаётся лежать, пока не уедет за кадр. pool — куда вернуть модель.
export function addCorpse(c, pool, x, z, vx, vz, scale = 1) {
  const back = vz <= 0.5 ? 1 : -1;          // падает по направлению удара
  const co = { c, pool, x, z, y: 0, vx, vz, vy: 0, t: 0, dir: (c.root.rotation.y ? back : -back), spin: rand(-1.5, 1.5), scale, mass: scale * scale, down: false, tg: [] };
  for (const l of c.limbs) co.tg.push(rand(-1.4, 1.6), l.lower ? (l.kind === 'leg' ? -rand(0, 1.4) : rand(0, 1.8)) : 0);
  if (c.actor && !c.actor.noDeath) { c.actor.die(); co.skinned = true; }     // скелетная модель падает своей анимацией
  corpses.push(co);
  if (corpses.length > 46) freeCorpse(corpses.shift());
}
function freeCorpse(co) {
  const r = co.c.root;
  r.visible = false; r.rotation.x = 0; r.rotation.z = 0; r.position.y = 0;
  co.pool.push(co.c);
}

export function updatePhysics(dt) {
  const sc = G.scroll;
  for (let i = 0; i < N; i++) {
    const b = bodies[i]; if (!b.on) continue;
    b.life -= dt;
    b.z += (b.vz + sc) * dt; b.x += b.vx * dt;
    if (b.life <= 0 || b.z > 16) { b.on = false; mesh.setMatrixAt(i, ZERO); continue; }
    const h = Math.max(0.02, b.sy * 0.5);
    if (!b.rest) {
      b.vy -= GRAV * dt; b.y += b.vy * dt;
      b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
      if (b.y < h) {
        b.y = h;
        if (Math.abs(b.vy) < 1.6) { b.rest = true; b.vy = 0; b.rx = 0; b.rz = 0; }
        else { b.vy = -b.vy * b.bounce; b.vx *= 0.6; b.vz *= 0.6; b.wx *= 0.5; b.wy *= 0.5; b.wz *= 0.5; }
      }
    } else { const f = Math.max(0, 1 - dt * 7); b.vx *= f; b.vz *= f; }
    const k = b.life < 0.4 ? b.life / 0.4 : 1;
    _m.compose(_p.set(b.x, b.y, b.z), _q.setFromEuler(_e.set(b.rx, b.ry, b.rz)), _s.set(b.sx * k, b.sy * k, b.sz * k));
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;

  for (let i = corpses.length - 1; i >= 0; i--) {
    const co = corpses[i], c = co.c, r = c.root;
    co.t += dt;
    co.x += co.vx * dt; co.z += (co.vz + sc) * dt;
    co.vy -= GRAV * dt; co.y = Math.max(0, co.y + co.vy * dt);
    if (co.y === 0) { const f = Math.max(0, 1 - dt * 3.5); co.vx *= f; co.vz *= f; co.vy = 0; }
    if (co.skinned) { r.position.set(co.x, co.y, co.z); if (co.z > 15) { freeCorpse(co); corpses.splice(i, 1); } continue; }
    const ang = Math.min(1.5, co.t * co.t * 16);
    if (!co.down && ang >= 1.5) { co.down = true; dustBurst(co.x, co.z - co.dir * 0.8 * co.scale, 2); }
    r.rotation.x = ang * co.dir;
    r.rotation.z += co.spin * dt * (co.down ? 0 : 0.4);
    r.position.set(co.x, co.y + Math.sin(ang) * 0.17 * co.scale, co.z);
    const kk = Math.min(1, dt * 9);
    for (let j = 0; j < c.limbs.length; j++) {
      const l = c.limbs[j];
      l.m.rotation.x += (co.tg[j * 2] - l.m.rotation.x) * kk;
      if (l.lower) l.lower.rotation.x += (co.tg[j * 2 + 1] - l.lower.rotation.x) * kk;
    }
    if (co.z > 15) { freeCorpse(co); corpses.splice(i, 1); }
  }
}

export function clearPhysics() {
  for (const co of corpses) freeCorpse(co);
  corpses.length = 0;
  for (let i = 0; i < N; i++) { bodies[i].on = false; mesh.setMatrixAt(i, ZERO); }
  mesh.instanceMatrix.needsUpdate = true;
}
