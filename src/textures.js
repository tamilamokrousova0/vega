// Фото-текстуры (Poly Haven, CC0), наложенные без развёртки: проекция по трём осям в локальных координатах модели.
// Цвет вершин задаёт оттенок, текстура — рисунок поверхности, рельеф и неровность блеска.
import * as THREE from '../vendor/three.module.min.js';

import { fetchAsset } from './assets.js';
const DIR = 'assets/textures/';
const NAMES = ['asphalt', 'pavement', 'floor', 'concrete', 'brick', 'metal', 'rust', 'iron', 'rock', 'bark', 'planks', 'sand', 'snow', 'forest', 'fabric', 'leather'];
export const TEX = {};

function average(img) {
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data, col = new THREE.Color(); let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { col.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace); r += col.r; g += col.g; b += col.b; }
  return new THREE.Vector3(r / 64, g / 64, b / 64).max(new THREE.Vector3(0.02, 0.02, 0.02));
}

// Если файл не загрузился, материал просто остаётся без текстуры.
export function loadTextures(maxAniso = 4) {
  const loader = new THREE.TextureLoader();
  return Promise.all(NAMES.map(n => fetchAsset(u => loader.loadAsync(u), DIR + n + '.jpg').then(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    t.userData.avg = average(t.image); TEX[n] = t;
  }, () => console.warn('Текстура не загружена:', n))));
}

const LUM = 'vec3(0.2126, 0.7152, 0.0722)';
// tile — размер плитки в метрах; own — доля собственного цвета текстуры (0 = только рисунок);
// amt — сила рисунка; bump — высота рельефа; rough — влияние на блеск.
export function detail(mat, name, tile = 2, o = {}) {
  const tex = TEX[name]; if (!tex || !mat) return mat;
  const u = mat.userData.tri = {
    uTex: { value: tex }, uAvg: { value: tex.userData.avg }, uTs: { value: 1 / tile }, uOff: { value: new THREE.Vector3() },
    uOwn: { value: o.own ?? 0.3 }, uAmt: { value: o.amt ?? 1 }, uBump: { value: o.bump ?? 0.012 }, uRgh: { value: o.rough ?? 0.25 },
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTp; varying vec3 vTn; uniform float uTs; uniform vec3 uOff;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTp = (position + uOff) * uTs; vTn = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTp; varying vec3 vTn; uniform sampler2D uTex; uniform vec3 uAvg; uniform float uOwn, uAmt, uBump, uRgh;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 tw = pow(abs(normalize(vTn)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        vec3 tc = texture2D(uTex, vTp.zy).rgb * tw.x + texture2D(uTex, vTp.xz).rgb * tw.y + texture2D(uTex, vTp.xy).rgb * tw.z;
        float tl = dot(tc, ${LUM}) / dot(uAvg, ${LUM});
        vec3 tBase = diffuseColor.rgb;
        vec3 tA = tBase * min(tc / uAvg, vec3(2.2));
        vec3 tB = tc * (dot(tBase, ${LUM}) / dot(uAvg, ${LUM}));
        diffuseColor.rgb = mix(tBase, mix(tA, tB, uOwn), uAmt);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (1.0 - tl) * uRgh, 0.05, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(tl), hy = dFdy(tl);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          float fadeB = 1.0 / (1.0 + dot(vViewPosition, vViewPosition) * 0.0009);
          normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2) * uBump * fadeB); }`);
  };
  mat.customProgramCacheKey = () => 'tri';
  mat.needsUpdate = true;
  return mat;
}

// Цвет-множитель для материала с обычной картой: приводит среднюю яркость текстуры к заданному цвету
export function tintFor(name, hex, keep = 0.5) {
  const c = new THREE.Color(hex), tex = TEX[name]; if (!tex) return c;
  const a = tex.userData.avg, l = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / (0.2126 * a.x + 0.7152 * a.y + 0.0722 * a.z);
  return c.setRGB(THREE.MathUtils.lerp(c.r / a.x, l, keep), THREE.MathUtils.lerp(c.g / a.y, l, keep), THREE.MathUtils.lerp(c.b / a.z, l, keep));
}
