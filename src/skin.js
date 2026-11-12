// «Кожа» поверх манекена: чужая модель со своим скелетом (риг Rigify из Blender) каждый кадр
// повторяет позу скелета-манекена. Так все анимации героини (бег, перекат, удар, гибель) работают
// на модели, в файле которой анимаций нет.
import * as THREE from '../vendor/three.module.min.js';

const _m = new THREE.Matrix4(), _n = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _v = new THREE.Vector3();

// матрица объекта в системе координат holder (общего предка манекена и модели)
function matH(o, holder, out) { out.identity(); for (; o && o !== holder; o = o.parent) { o.updateMatrix(); out.premultiply(o.matrix); } return out; }
function quatH(o, holder, out) { matH(o, holder, _m).decompose(_p, out, _s); return out; }
function posH(o, holder, out) { return out.setFromMatrixPosition(matH(o, holder, _m)); }

const base = n => n.replace(/_\d+$/, '').replace(/\./g, '');
const SIDES = [['L', 'l'], ['R', 'r']];

// holder — общий родитель; driver — корень скелета-манекена; scene — загруженная модель
export function makeSkin(holder, driver, scene, opt = {}) {
  const wrap = new THREE.Group(); wrap.add(scene); holder.add(wrap);
  const byName = {};
  scene.traverse(o => {
    if (o.isBone) { const b = base(o.name); if (!byName[b]) byName[b] = o; }
    if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if ((opt.hide || []).some(h => o.name.includes(h) || (o.parent && o.parent.name.includes(h)))) o.visible = false; }
  });
  const G_ = n => byName[n], D_ = n => driver.getObjectByName(n);
  // тип скелета: Rigify (Blender) или CAT (3ds Max, кости вида «<Имя>Pelvis», «<Имя>LArm11»)
  let P = null;
  for (const n in byName) { const m = /^(.*)Pelvis$/.exec(n); if (m && byName[m[1] + 'LArm11'] && byName[m[1] + 'LLeg1']) { P = m[1]; break; } }
  const cat = P !== null, rigify = !!G_('DEF-spine') && !!G_('DEF-upper_armL');
  if (!cat && !rigify) throw new Error('скелет не распознан: поддерживаются Rigify и CAT');
  const N = cat
    ? { hip: P + 'Pelvis', head: P + 'Head', handL: P + 'LArmPalm', handR: P + 'RArmPalm', footL: P + 'LLegAnkle' }
    : { hip: 'DEF-spine', head: 'DEF-Head', handL: 'DEF-handL', handR: 'DEF-handR', footL: 'DEF-footL' };

  // разворот, рост и уровень пола — по кистям, голове и стопам
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const dl = posH(D_('hand_l'), holder, a).x - posH(D_('hand_r'), holder, b).x;
  const gl = posH(G_(N.handL), holder, c).x - posH(G_(N.handR), holder, d).x;
  if (dl * gl < 0) wrap.rotation.y = Math.PI;
  const dh = posH(D_('Head'), holder, a).y - posH(D_('foot_l'), holder, b).y;
  const gh = posH(G_(N.head), holder, c).y - posH(G_(N.footL), holder, d).y;
  wrap.scale.setScalar((dh / gh) * (opt.scale || 1));
  wrap.position.y += posH(D_('foot_l'), holder, a).y - posH(G_(N.footL), holder, b).y;

  const pairs = [], syncs = [];
  const dirOf = (from, to, out) => posH(to, holder, out).sub(posH(from, holder, _v)).normalize();
  function pair(g, dn, gChild, dChild) {
    const gb = G_(g), db = D_(dn); if (!gb || !db) return;
    const A = new THREE.Quaternion();
    if (gChild && dChild && G_(gChild) && D_(dChild)) A.setFromUnitVectors(dirOf(gb, G_(gChild), a).clone(), dirOf(db, D_(dChild), b).clone());
    // цель = поворот манекена относительно покоя · выравнивание направления кости · покой модели
    const R = quatH(db, holder, new THREE.Quaternion()).invert().multiply(A).multiply(quatH(gb, holder, new THREE.Quaternion()));
    pairs.push({ gb, db, R });
  }
  function sync(to, from) {
    const t = G_(to), f = G_(from); if (!t || !f) return;
    syncs.push({ t, f, K: matH(f, holder, new THREE.Matrix4()).invert().multiply(matH(t, holder, new THREE.Matrix4())), at: pairs.length });
  }
  if (cat) {
    pair(P + 'Pelvis', 'pelvis'); pair(P + 'Spine1', 'spine_01'); pair(P + 'Spine2', 'spine_02'); pair(P + 'Chest', 'spine_03');
    pair(P + 'Neck', 'neck_01'); pair(P + 'Head', 'Head');
    for (const [S, s] of SIDES) {
      pair(P + S + 'ArmCollarbone', 'clavicle_' + s, P + S + 'Arm11', 'upperarm_' + s);
      pair(P + S + 'Arm11', 'upperarm_' + s, P + S + 'Arm21', 'lowerarm_' + s);
      pair(P + S + 'Arm21', 'lowerarm_' + s, P + S + 'ArmPalm', 'hand_' + s);
      pair(P + S + 'ArmPalm', 'hand_' + s, P + S + 'ArmDigit31', 'middle_01_' + s);
      pair(P + S + 'Leg1', 'thigh_' + s, P + S + 'Leg21', 'calf_' + s);
      pair(P + S + 'Leg21', 'calf_' + s, P + S + 'LegAnkle', 'foot_' + s);
      pair(P + S + 'LegAnkle', 'foot_' + s, P + S + 'LegDigit11', 'ball_' + s);
      pair(P + S + 'LegDigit11', 'ball_' + s);
    }
  } else {
    pair('DEF-spine', 'pelvis'); pair('DEF-spine001', 'spine_01'); pair('DEF-spine002', 'spine_02'); pair('DEF-spine003', 'spine_03');
    pair('DEF-NEck', 'neck_01'); pair('DEF-Head', 'Head');
    sync('ORG-spine', 'DEF-spine'); sync('ORG-spine003', 'DEF-spine003');     // на этих костях висят ноги и руки
    for (const [S, s] of SIDES) {
      pair('ORG-shoulder' + S, 'clavicle_' + s, 'DEF-upper_arm' + S, 'upperarm_' + s);
      pair('DEF-upper_arm' + S, 'upperarm_' + s, 'DEF-forearm' + S, 'lowerarm_' + s);
      pair('DEF-forearm' + S, 'lowerarm_' + s, 'DEF-hand' + S, 'hand_' + s);
      pair('DEF-hand' + S, 'hand_' + s, 'DEF-f_middle01' + S, 'middle_01_' + s);
      sync('ORG-hand' + S, 'DEF-hand' + S);                                    // большие пальцы
      pair('DEF-thigh' + S, 'thigh_' + s, 'DEF-shin' + S, 'calf_' + s);
      pair('DEF-shin' + S, 'calf_' + s, 'DEF-foot' + S, 'foot_' + s);
      pair('DEF-foot' + S, 'foot_' + s, 'DEF-toe' + S, 'ball_' + s);
      pair('DEF-toe' + S, 'ball_' + s);
    }
  }
  const hipG = G_(N.hip), hipD = D_('pelvis');
  const hipG0 = posH(hipG, holder, new THREE.Vector3()), hipD0 = posH(hipD, holder, new THREE.Vector3());

  function applySync(sy) {
    _n.copy(matH(sy.f, holder, _m)).multiply(sy.K);                           // желаемая матрица в системе holder
    matH(sy.t.parent, holder, _m).invert().multiply(_n).decompose(sy.t.position, sy.t.quaternion, sy.t.scale);
  }
  return {
    wrap,
    update() {
      // таз: смещение манекена относительно покоя
      posH(hipD, holder, _v).sub(hipD0).add(hipG0);
      matH(hipG.parent, holder, _n).invert(); hipG.position.copy(_v.applyMatrix4(_n));
      let si = 0;
      for (let i = 0; i < pairs.length; i++) {
        while (si < syncs.length && syncs[si].at <= i) applySync(syncs[si++]);
        const p = pairs[i];
        quatH(p.db, holder, _q).multiply(p.R);                                 // целевой поворот в системе holder
        quatH(p.gb.parent, holder, _r).invert();
        p.gb.quaternion.copy(_r.multiply(_q));
      }
      while (si < syncs.length) applySync(syncs[si++]);
    },
  };
}
