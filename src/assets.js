// Тяжёлые файлы (модели, текстуры) на опубликованном сайте берём через jsDelivr: он раздаёт файлы
// прямо из GitHub-репозитория и обычно намного быстрее GitHub Pages. Если CDN недоступен — берём с самого сайта.
// ASSET_REV — коммит, в котором лежат нужные версии файлов. Поменяли модель или текстуру:
// сначала закоммитьте её, затем впишите сюда хеш того коммита и закоммитьте ещё раз.
export const ASSET_REV = 'b8549e7';
const CDN = `https://cdn.jsdelivr.net/gh/tamilamokrousova0/vega@${ASSET_REV}/`;
const useCdn = /\.github\.io$/.test(location.hostname) && !new URLSearchParams(location.search).has('nocdn');

// load(url) → Promise; пробуем CDN, при ошибке — локальный путь
export function fetchAsset(load, path) {
  return useCdn ? load(CDN + path).catch(() => load(path)) : load(path);
}
