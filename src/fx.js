// Частицы, вспышки, следы на земле, всплывающие сообщения
import * as THREE from '../vendor/three.module.min.js';
import { G, rand } from './state.js';
import { sfx } from './audio.js';

const VS = `
attribute float size; attribute vec4 pcolor; varying vec4 vC; uniform float scale;
void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FS = `
varying vec4 vC;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d);
  if (a * vC.a < 0.01) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }`;

class PSys {
  constructor(n, blending) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.grav = new Float32Array(n); this.alpha = new Float32Array(n); this.grow = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { scale: { value: 600 } }, transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0, grow = 0) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life; this.size[i] = size; this.grav[i] = grav; this.alpha[i] = a; this.grow[i] = grow;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
  }
  update(dt, scroll) {
    const { pos, vel, life, max, size, col, grav, alpha, grow, n } = this;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { size[i] = 0; col[i * 4 + 3] = 0; continue; }
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += (vel[i * 3 + 2] + scroll) * dt;
      if (pos[i * 3 + 1] < 0.03 && grav[i] > 0) { pos[i * 3 + 1] = 0.03; vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0; }
      size[i] += grow[i] * dt;
      col[i * 4 + 3] = alpha[i] * Math.min(1, life[i] / max[i] * 2.2);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.pcolor.needsUpdate = a.size.needsUpdate = true;
  }
}

let solid, glow, decals, decalI = 0, flashes = [];
const decalData = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export function initFx() {
  solid = new PSys(1400, THREE.NormalBlending);
  glow = new PSys(900, THREE.AdditiveBlending);
  solid.points.renderOrder = 5; glow.points.renderOrder = 6;
  G.scene.add(solid.points, glow.points);

  const N = 70;
  const cg = new THREE.CircleGeometry(1, 9); cg.rotateX(-Math.PI / 2);
  decals = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: 0x2a0606, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), N);
  decals.frustumCulled = false; decals.renderOrder = 1;
  for (let i = 0; i < N; i++) decalData.push({ x: 0, z: 999, s: 0, r: 0, sx: 1 });
  G.scene.add(decals);

  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xff8a3a, 0, 30, 1.6); l.position.set(0, -50, 0);
    G.scene.add(l); flashes.push({ l, t: 0, dur: 1, peak: 0 });
  }
}

export function setFxScale(h) { if (solid) solid.mat.uniforms.scale.value = glow.mat.uniforms.scale.value = h * 0.9; }

export function updateFx(dt) {
  solid.update(dt, G.scroll); glow.update(dt, G.scroll);
  const d = G.scroll * dt;
  for (let i = 0; i < decalData.length; i++) {
    const o = decalData[i];
    if (o.s > 0) { o.z += d; if (o.z > 20) o.s = 0; }
    _m.compose(_p.set(o.x, 0.02, o.z), _q.setFromEuler(_e.set(0, o.r, 0)), _s.set(o.s * o.sx, 1, o.s));
    decals.setMatrixAt(i, _m);
  }
  decals.instanceMatrix.needsUpdate = true;
  for (const f of flashes) {
    if (f.t > 0) { f.t -= dt; f.l.intensity = f.peak * Math.max(0, f.t / f.dur); f.l.position.z += d; }
  }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
}

export function shake(a) { G.shake = Math.min(1.2, Math.max(G.shake, a)); }

function flash(x, y, z, peak, dur, color) {
  let f = flashes[0];
  for (const o of flashes) if (o.t < f.t) f = o;
  f.l.position.set(x, y, z); f.l.color.set(color); f.peak = peak; f.dur = f.t = dur; f.l.intensity = peak;
}

export function decal(x, z, s) {
  const o = decalData[decalI]; decalI = (decalI + 1) % decalData.length;
  o.x = x; o.z = z; o.s = s; o.r = Math.random() * 6.28; o.sx = rand(0.6, 1.4);
}

export function blood(x, y, z, n = 8, pow = 1) {
  for (let i = 0; i < n; i++) {
    const k = rand(0.25, 0.55);
    solid.emit(x + rand(-0.2, 0.2), y + rand(-0.3, 0.3), z + rand(-0.2, 0.2), rand(-2.5, 2.5) * pow, rand(1, 5) * pow, rand(-1, 3) * pow,
      rand(0.5, 1.1), rand(0.12, 0.3), k, k * 0.06, k * 0.05, 0.95, 14);
  }
}
export function sparks(x, y, z, n = 6, r = 1, g = 0.7, b = 0.3) {
  for (let i = 0; i < n; i++)
    glow.emit(x, y, z, rand(-5, 5), rand(0, 6), rand(-3, 5), rand(0.15, 0.4), rand(0.06, 0.14), r, g, b, 1, 16);
}
export function smoke(x, y, z, n = 4, size = 1, dark = 0.12) {
  for (let i = 0; i < n; i++) {
    const k = dark * rand(0.7, 1.3);
    solid.emit(x + rand(-0.5, 0.5) * size, y + rand(0, 0.6) * size, z + rand(-0.5, 0.5) * size, rand(-0.8, 0.8), rand(0.8, 2.4), rand(-0.8, 0.8),
      rand(0.9, 1.8), rand(0.8, 1.5) * size, k, k, k, 0.5, -0.3, 1.2);
  }
}
export function muzzle(x, y, z) {
  glow.emit(x, y, z, rand(-0.5, 0.5), rand(-0.3, 0.6), -6, 0.05, rand(0.5, 0.8), 1, 0.75, 0.4, 0.9);
}
export function trail(x, y, z) {
  glow.emit(x, y, z, 0, 0, 3, 0.12, 0.35, 1, 0.6, 0.25, 0.8);
  solid.emit(x, y, z, rand(-0.3, 0.3), rand(0, 0.6), 2, 0.7, 0.3, 0.3, 0.3, 0.3, 0.35, -0.2, 0.8);
}
export function explosion(x, z, r = 3, big = false) {
  const n = big ? 34 : 20;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, v = rand(1, 7) * r * 0.35;
    glow.emit(x + rand(-0.4, 0.4), rand(0.3, 1.2), z + rand(-0.4, 0.4), Math.cos(a) * v, rand(1, 7), Math.sin(a) * v, rand(0.25, 0.6), rand(0.7, 1.6) * r * 0.4, 1, rand(0.4, 0.7), 0.15, 0.9, 5);
  }
  glow.emit(x, 1, z, 0, 0, 0, 0.14, r * 3, 1, 0.85, 0.6, 0.9);
  sparks(x, 0.8, z, 14);
  smoke(x, 0.5, z, big ? 12 : 7, r * 0.55, 0.1);
  decal(x, z, r * 0.6);
  flash(x, 2.5, z, big ? 160 : 90, 0.35, 0xff8a3a);
  shake(big ? 0.7 : 0.35);
  sfx.explosion(big);
}
export function acid(x, z, r = 1.6) {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * 6.28, v = rand(0.5, 3) * r;
    glow.emit(x, 0.3, z, Math.cos(a) * v, rand(1, 5), Math.sin(a) * v, rand(0.3, 0.7), rand(0.2, 0.5), 0.45, 0.9, 0.2, 0.8, 12);
  }
  smoke(x, 0.2, z, 4, r * 0.5, 0.2);
  flash(x, 1.5, z, 40, 0.3, 0x80ff40);
}
export function dustBurst(x, z, n = 5) {
  for (let i = 0; i < n; i++) solid.emit(x + rand(-0.6, 0.6), 0.2, z + rand(-0.6, 0.6), rand(-1.5, 1.5), rand(1, 4), rand(-1.5, 1.5), rand(0.5, 1), rand(0.5, 1.1), 0.3, 0.27, 0.22, 0.5, 4, 0.8);
}

const toasts = document.getElementById('toasts');
export function toast(text, cls = '') {
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text;
  toasts.appendChild(d);
  while (toasts.children.length > 4) toasts.firstChild.remove();
  setTimeout(() => d.remove(), cls.includes('big') ? 2600 : cls.includes('radio') ? 5000 : 1500);
}

// ---------- Окружение: огонь, пар, произвольные частицы ----------
export function emitSolid(...a) { solid.emit(...a); }
export function emitGlow(...a) { glow.emit(...a); }
export function fire(x, y, z, s = 1) {
  glow.emit(x + rand(-0.3, 0.3) * s, y, z + rand(-0.3, 0.3) * s, rand(-0.3, 0.3), rand(1.5, 3.5) * s, rand(-0.3, 0.3), rand(0.35, 0.7), rand(0.6, 1.1) * s, 1, rand(0.35, 0.6), 0.1, 0.75, -1, -0.6);
  if (Math.random() < 0.3) solid.emit(x, y + 1.2 * s, z, rand(-0.4, 0.4), rand(1.5, 2.5), rand(-0.4, 0.4), rand(1.5, 2.6), rand(0.6, 1) * s, 0.07, 0.07, 0.07, 0.4, -0.4, 1);
  if (Math.random() < 0.15) glow.emit(x, y + 0.5, z, rand(-1, 1), rand(2, 4), rand(-1, 1), rand(0.8, 1.6), 0.07, 1, 0.6, 0.2, 1, -0.5);
}
export function steam(x, y, z, dx = 0) {
  solid.emit(x, y, z, dx * 2 + rand(-0.3, 0.3), rand(1, 2.5), rand(-0.3, 0.3), rand(0.8, 1.4), 0.4, 0.7, 0.75, 0.75, 0.2, -0.5, 1.4);
}
