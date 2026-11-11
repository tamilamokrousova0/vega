// Балансовые таблицы (по документу «VEGA: Линия огня»)
export const ROAD_HALF = 5.2;
export const SCROLL = 14;
export const SQUAD_MAX = 60;

export const WEAPONS = [
  { id: 'ak',     name: 'АК-47',              kind: 'bullet', rate: 6,   dmg: 15, pellets: 1, spread: 0.012, sRate: 1.8, sDmg: 9 },
  { id: 'ar',     name: 'АК «Ветеран»',       kind: 'bullet', rate: 9,   dmg: 15, pellets: 1, spread: 0.012, sRate: 2.1, sDmg: 11 },
  { id: 'lmg',    name: 'Пулемёт РПК',        kind: 'bullet', rate: 13,  dmg: 17, pellets: 1, spread: 0.02,  sRate: 2.4, sDmg: 13 },
  { id: 'mini',   name: 'Станковый пулемёт',  kind: 'bullet', rate: 15,  dmg: 12, pellets: 3, spread: 0.07,  sRate: 2.8, sDmg: 15 },
  { id: 'rocket', name: 'Ракетница РПГ',      kind: 'rocket', rate: 1.8, dmg: 230, radius: 3.6,              sRate: 3.0, sDmg: 17 },
  { id: 'laser',  name: 'Лазер «Солнце»',     kind: 'laser',  dps: 650,                                      sRate: 3.2, sDmg: 19 },
];

// cost — цена в бюджете угрозы (БУ)
export const ENEMIES = {
  walker:   { name: 'Шатун',    cost: 1,  hp: 30,   speed: 2.2, r: 0.45, dmg: 10, bites: 1, scale: 1.0,  steer: 1.4, group: [4, 8] },
  runner:   { name: 'Бегун',    cost: 2,  hp: 20,   speed: 7.0, r: 0.42, dmg: 10, bites: 1, scale: 0.95, steer: 3.0, group: [2, 4] },
  crawler:  { name: 'Паразит',  cost: 1,  hp: 14,   speed: 5.0, r: 0.42, dmg: 6,  bites: 1, scale: 1.0,  steer: 2.5, group: [5, 8] },
  spitter:  { name: 'Плевака',  cost: 4,  hp: 60,   speed: 1.0, r: 0.5,  dmg: 10, bites: 1, scale: 1.1,  steer: 1.0, group: [1, 2] },
  exploder: { name: 'Раздутый', cost: 4,  hp: 50,   speed: 3.5, r: 0.5,  dmg: 20, bites: 1, scale: 1.1,  steer: 2.0, group: [1, 2], explode: 2.8 },
  fat:      { name: 'Таран',    cost: 8,  hp: 240,  speed: 1.4, r: 0.8,  dmg: 30, bites: 3, scale: 1.55, steer: 1.0, group: [1, 1] },
  brute:    { name: 'Громила',  cost: 25, hp: 1500, speed: 1.3, r: 1.15, dmg: 40, bites: 8, scale: 2.3,  steer: 1.2, group: [1, 1], model: 'fat', elite: true },
  gold:     { name: 'Золотой зомби', cost: 300, hp: 500, speed: 0, r: 0.5, dmg: 0, bites: 1, scale: 1.05, steer: 0, group: [1, 1], flee: true },
};

// Шесть миров — биомы забега. mix: [тип, вес]
export const WORLDS = [
  { name: 'Арден — падший город',       biome: 'city',    boss: 'butcher',
    brief: 'Хансен: «Вега, город потерян. Собирай всех, кто ещё стоит на ногах, и уходи по проспекту».',
    mix: [['walker', 6], ['runner', 1.4], ['spitter', 0.6], ['fat', 0.3]] },
  { name: 'Промзона «Нексис-7»',        biome: 'factory', boss: 'collector',
    brief: 'Хансен: «Заражение шло с завода „Нексис“. Они мутируют направленно. Будь осторожна».',
    mix: [['walker', 5], ['runner', 2], ['exploder', 1.2], ['crawler', 1.5], ['fat', 0.6]] },
  { name: 'Пустынная база «Рубеж»',     biome: 'desert',  boss: 'reid',
    brief: 'Хансен: «На „Рубеже“ вирус испытывали на солдатах. Там твой бывший командир, Вега».',
    mix: [['walker', 4], ['runner', 2.5], ['spitter', 1.2], ['fat', 1.3], ['crawler', 1]] },
  { name: 'Лаборатория «Глетчер»',      biome: 'snow',    boss: 'cryotitan',
    brief: 'Хансен: «Подо льдом — формула антидота. Забери её, пока лёд держит».',
    mix: [['walker', 4], ['runner', 2.5], ['crawler', 2.5], ['spitter', 1.4], ['exploder', 1], ['fat', 1.2]] },
  { name: 'Мегаполис «Нексис-Сити»',    biome: 'neon',    boss: 'omega',
    brief: 'Хансен: «Корвин вколол себе совершенный штамм. Башня „Нексис“ — прямо по курсу».',
    mix: [['walker', 4], ['runner', 3], ['spitter', 1.5], ['exploder', 1.6], ['fat', 1.6]] },
  { name: 'Улей — сердце заражения',    biome: 'lab',     boss: 'corvin',
    brief: 'Хансен: «Это его логово. Никого не бросаем — и никого не оставляем там».',
    mix: [['walker', 4], ['runner', 3], ['crawler', 2.5], ['spitter', 1.6], ['exploder', 1.6], ['fat', 2]] },
];

export const BOSSES = {
  butcher:   { name: 'Мясник',           model: 'butcher',   hp: 12000,  r: 1.5, scale: 2.6, cd: 3.2, attacks: ['charge', 'slam', 'charge', 'spawnRunner'] },
  collector: { name: 'Сборщик',          model: 'treant',    hp: 30000,  r: 1.7, scale: 3.2, cd: 3.0, attacks: ['roots', 'spit', 'spawnWalker', 'roots', 'slam'] },
  reid:      { name: 'Полковник Рейд',   model: 'goliath',   hp: 48000,  r: 1.8, scale: 3.2, cd: 2.8, attacks: ['rockets', 'charge', 'slam', 'rockets', 'spawnRunner'], armored: true },
  cryotitan: { name: 'Криотитан',        model: 'queen',     hp: 62000,  r: 2.0, scale: 3.0, cd: 2.8, attacks: ['spit', 'spawnCrawler', 'roots', 'spit', 'slam'] },
  omega:     { name: 'Прототип Омега',   model: 'omega',     hp: 85000,  r: 1.9, scale: 3.5, cd: 2.6, attacks: ['rockets', 'slam', 'charge', 'rockets', 'spawnExploder', 'roots'], armored: true },
  corvin:    { name: 'Корвин-Прамать',   model: 'patriarch', hp: 120000, r: 1.7, scale: 3.8, cd: 2.5, attacks: ['roots', 'rockets', 'spawnRunner', 'charge', 'spit', 'slam', 'spawnExploder'] },
};

// Типы сегментов (30 с). k — доля бюджета угрозы; heavy — «тяжёлый» сегмент
export const SEGMENTS = {
  avenue:    { name: 'Проспект',      verb: 'Огонь',       k: 1.0,  gate: 9,   wall: 12 },
  narrow:    { name: 'Узкое место',   verb: 'Уклонение',   k: 0.8,  heavy: 1, sides: 5.5 },
  barricade: { name: 'Баррикада',     verb: 'Оборона',     k: 1.5,  heavy: 1, stop: 1, dur: 26 },
  ambush:    { name: 'Засада',        verb: 'Ближний бой', k: 1.0,  heavy: 1, close: 1 },
  gates:     { name: 'Коридор ворот', verb: 'Выбор',       k: 0.35, gate: 5.5, wall: 7 },
  rescue:    { name: 'Спасение',      verb: 'Риск',        k: 0.8,  cages: 6, gate: 14 },
  panic:     { name: 'Паника',        verb: 'Всё сразу',   k: 1.2,  heavy: 1, force: 'runner' },
  supply:    { name: 'Снабжение',     verb: 'Передышка',   k: 0.25, supply: 1, gate: 10 },
};
export const SEG_DUR = 30;

// Улучшения на привале (на один забег)
export const UPGRADES = [
  { id: 'men',    name: 'Подкрепление',  desc: '+6 бойцов в строй.' },
  { id: 'dmg',    name: 'Калибр',        desc: 'Урон всего оружия +25%.' },
  { id: 'rate',   name: 'Темп',          desc: 'Скорострельность +20%.' },
  { id: 'armor',  name: 'Бронепластины', desc: '+50 брони и +20 к максимуму.' },
  { id: 'weapon', name: 'Трофей',        desc: 'Следующее оружие в линейке.' },
  { id: 'ult',    name: 'Связь',         desc: 'Ульта заряжена и набирается на 30% быстрее.' },
  { id: 'vets',   name: 'Закалка',       desc: 'Бойцы на 15% чаще переживают удар.' },
  { id: 'medic',  name: 'Медик',         desc: 'Вега восстанавливает 1 брони в секунду.' },
  { id: 'melee',  name: 'Ближний бой',   desc: 'Рукопашная Веги перезаряжается вдвое быстрее.' },
  { id: 'roll',   name: 'Рефлексы',      desc: 'Перекат перезаряжается за 1,2 с.' },
];

// unlock — сколько биомов нужно пройти, чтобы позиция открылась
export const ARSENAL = [
  { id: 'vest',    name: 'Бронежилеты',  desc: 'Боец с шансом 8% за ранг переживает укус.',            unlock: 0, cost: [30, 70, 130, 220] },
  { id: 'squad',   name: 'Начальный отряд', desc: '+1 боец на старте забега за ранг.',                 unlock: 0, cost: [40, 90, 160, 260] },
  { id: 'ap',      name: 'Оружейная',    desc: '+5% урона всего оружия за ранг.',                      unlock: 1, cost: [50, 110, 180, 280] },
  { id: 'grenade', name: 'Гренадёр',     desc: 'Отряд сам бросает гранату каждые 7 / 5,5 / 4 с.',      unlock: 1, cost: [80, 150, 240] },
  { id: 'drone',   name: 'Дрон поддержки', desc: 'Сопровождает Вегу и ведёт огонь.',                   unlock: 2, cost: [140, 260] },
  { id: 'medkit',  name: 'Аптечка',      desc: 'Раз за забег восстанавливает 50 брони при ранении.',   unlock: 2, cost: [120] },
  { id: 'ultfast', name: 'Командный канал', desc: 'Ульта заряжается на 20% быстрее за ранг.',          unlock: 3, cost: [150, 280] },
  { id: 'shield',  name: 'Энергощит',    desc: 'Поглощает один удар босса за биом.',                   unlock: 4, cost: [260] },
];
