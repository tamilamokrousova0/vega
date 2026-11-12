// Мета-прогрессия: жетоны и вспомогательный арсенал (localStorage)
import { ARSENAL } from './config.js';
import { sfx } from './audio.js';

const KEY = 'vega.save.v1';
export const save = { tokens: 0, cleared: 0, items: {}, board: [], ult: 'air', name: '' };
// позывной: 2–16 символов, без управляющих знаков
export const cleanName = v => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      save.tokens = Math.max(0, s.tokens | 0); save.cleared = Math.max(0, s.cleared | 0);
      save.items = (s.items && typeof s.items === 'object') ? s.items : {};
      save.board = Array.isArray(s.board) ? s.board.filter(r => r && typeof r.score === 'number').slice(0, 10) : [];
      save.ult = s.ult === 'cry' ? 'cry' : 'air';
      save.name = cleanName(s.name);
      for (const r of save.board) r.name = cleanName(r.name);
    }
  } catch (e) { /* повреждённое сохранение — начинаем с нуля */ }
}
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* хранилище недоступно */ }
}
export function rank(id) { return save.items[id] | 0; }

export function renderArsenal(listEl, tokEl) {
  tokEl.textContent = save.tokens;
  listEl.innerHTML = '';
  for (const it of ARSENAL) {
    const r = rank(it.id), max = it.cost.length, locked = save.cleared < it.unlock;
    const div = document.createElement('div'); div.className = 'item' + (locked ? ' locked' : '');
    const h = document.createElement('h3'); h.textContent = it.name;
    const sp = document.createElement('span'); sp.textContent = `${r} / ${max}`; h.appendChild(sp);
    const p = document.createElement('p'); p.textContent = it.desc;
    const b = document.createElement('button');
    if (locked) { b.textContent = `Откроется после биома ${it.unlock}`; b.disabled = true; }
    else if (r >= max) { b.textContent = 'Максимум'; b.disabled = true; }
    else {
      b.textContent = `Улучшить · ${it.cost[r]}`;
      b.disabled = save.tokens < it.cost[r];
      b.onclick = () => {
        if (save.tokens < it.cost[r]) return;
        save.tokens -= it.cost[r]; save.items[it.id] = r + 1; persist(); sfx.upgrade();
        renderArsenal(listEl, tokEl);
      };
    }
    div.append(h, p, b); listEl.appendChild(div);
  }
}
