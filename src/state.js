// Общее состояние игры
export const G = {
  scene: null, camera: null, renderer: null,
  mode: 'menu',            // menu | run | boss | dead
  paused: false, resting: false,
  level: 0, time: 0, timeScale: 1, slowmo: 0,
  scroll: 0, scrollTarget: 0,
  hero: null, squad: [],
  weaponTier: 0, dmgMul: 1, rateMul: 1,
  formation: 'square', defend: false, cry: 0,
  enemies: [], boss: null, elite: null,
  kills: 0,
  ult: 0, ultKind: 'air',
  mods: { vet: 0, medic: 0, meleeCd: 0.7, rollCd: 2, ultGain: 1 },
  charges: { medkit: 0, shield: 0 },
  run: null,
  input: { roll: false, defend: false, ult: false },
  shake: 0, hurtFlash: 0,
  god: false,
  hooks: {},
  hpMul() { return 1 + 0.5 * this.level; },
};
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
