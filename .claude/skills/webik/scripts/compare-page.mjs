// Генерирует страницу сравнения «было / стало» из снимков capture.sh.
// Использование: node compare-page.mjs <папка .webik/compare> <папка dist> [--title "Название"]
// Ожидает: <compare>/before/, <compare>/after/ (desktop.png, mobile.png, lighthouse-*.json, meta.json)
// и <compare>/fixed.md — список исправленного («- пункт» на строку).
// Результат: <dist>/sravnenie/index.html и картинки рядом.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const titleIdx = args.indexOf('--title');
const title = titleIdx >= 0 ? args[titleIdx + 1] : '';
const [compareDir, distDir] = args.filter((_, i) => i !== titleIdx && i !== titleIdx + 1);

function fail(msg) {
  console.error(`Ошибка: ${msg}`);
  process.exit(1);
}

if (!compareDir || !distDir) fail('нужны папка сравнения и папка сборки');
if (!fs.existsSync(distDir)) fail(`нет папки сборки ${distDir}`);

const CATEGORIES = [
  ['performance', 'Скорость'],
  ['seo', 'SEO'],
  ['accessibility', 'Доступность'],
  ['best-practices', 'Качество кода'],
];

// Демо закрыто от индексации, а на боевом сайте запрет снимается.
// Чтобы SEO демо не занижался, этот аудит исключается из расчёта и для «было», и для «стало».
const EXCLUDED_AUDITS = new Set(['is-crawlable']);

function median(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function categoryScore(report, id) {
  const category = report.categories?.[id];
  if (!category) return null;
  let sum = 0;
  let weights = 0;
  for (const ref of category.auditRefs) {
    const score = report.audits[ref.id]?.score;
    if (!ref.weight || score === null || score === undefined || EXCLUDED_AUDITS.has(ref.id)) continue;
    sum += ref.weight * score;
    weights += ref.weight;
  }
  return weights ? Math.round((sum / weights) * 100) : null;
}

function readSnapshot(name) {
  const dir = path.join(compareDir, name);
  if (!fs.existsSync(dir)) fail(`нет папки ${dir} — сначала снимок через capture.sh`);
  const reports = fs
    .readdirSync(dir)
    .filter((f) => /^lighthouse-\d+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  if (!reports.length) fail(`в ${dir} нет отчётов Lighthouse`);
  const audit = (id) => median(reports.map((r) => r.audits[id]?.numericValue));
  const meta = fs.existsSync(path.join(dir, 'meta.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'))
    : {};
  return {
    dir,
    meta,
    scores: Object.fromEntries(CATEGORIES.map(([id]) => [id, median(reports.map((r) => categoryScore(r, id)))])),
    lcp: audit('largest-contentful-paint'),
    cls: audit('cumulative-layout-shift'),
    weight: audit('total-byte-weight'),
  };
}

const before = readSnapshot('before');
const after = readSnapshot('after');

const fixedPath = path.join(compareDir, 'fixed.md');
const fixed = fs.existsSync(fixedPath)
  ? fs
      .readFileSync(fixedPath, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^\s*[-*]\s+/.test(l))
      .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
  : [];

let studio = {};
try {
  const configPath = process.env.WEBIK_CONFIG || path.join(os.homedir(), '.webik', 'config.json');
  studio = JSON.parse(fs.readFileSync(configPath, 'utf8')).studio || {};
} catch {
  // Блок студии необязателен
}

const outDir = path.join(distDir, 'sravnenie');
fs.mkdirSync(outDir, { recursive: true });
for (const [snap, name] of [[before, 'before'], [after, 'after']]) {
  for (const device of ['desktop', 'mobile']) {
    const src = path.join(snap.dir, `${device}.png`);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, `${name}-${device}.png`));
  }
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const nbsp = ' ';
const fmtSeconds = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')}${nbsp}с`);
const fmtCls = (v) => (v == null ? '—' : v.toFixed(2).replace('.', ','));
const fmtWeight = (bytes) => {
  if (bytes == null) return '—';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1).replace('.', ',')}${nbsp}МБ` : `${Math.round(bytes / 1024)}${nbsp}КБ`;
};
const level = (score) => (score == null ? 'none' : score >= 90 ? 'good' : score >= 50 ? 'mid' : 'bad');

const scoreRows = CATEGORIES.map(([id, label]) => {
  const b = before.scores[id];
  const a = after.scores[id];
  const delta = a != null && b != null ? a - b : null;
  return `
      <div class="score">
        <span class="score-label">${label}</span>
        <span class="score-after" data-level="${level(a)}">${a ?? '—'}</span>
        <span class="score-before">было ${b ?? '—'}${delta ? `, <b>${delta > 0 ? '+' : '−'}${Math.abs(delta)}</b>` : ''}</span>
      </div>`;
}).join('');

const metricRows = [
  ['Загрузка главного блока', fmtSeconds(before.lcp), fmtSeconds(after.lcp)],
  ['Сдвиги при загрузке', fmtCls(before.cls), fmtCls(after.cls)],
  ['Вес страницы', fmtWeight(before.weight), fmtWeight(after.weight)],
]
  .map(([label, b, a]) => `<tr><th scope="row">${label}</th><td>${b}</td><td>${a}</td></tr>`)
  .join('');

const shot = (name, device, alt) =>
  fs.existsSync(path.join(outDir, `${name}-${device}.png`))
    ? `<img src="${name}-${device}.png" alt="${esc(alt)}" loading="lazy">`
    : '<p class="shot-missing">Скриншот не снят</p>';

const compareBlock = (device) => `
      <div class="pair" data-device="${device}">
        <figure><figcaption>Было</figcaption><div class="frame">${shot('before', device, `Старый сайт, ${device === 'desktop' ? 'компьютер' : 'телефон'}`)}</div></figure>
        <figure><figcaption>Стало</figcaption><div class="frame">${shot('after', device, `Новый сайт, ${device === 'desktop' ? 'компьютер' : 'телефон'}`)}</div></figure>
      </div>`;

const studioLinks = [
  studio.phone && `<a href="tel:${esc(studio.phone.replace(/[^\d+]/g, ''))}">${esc(studio.phone)}</a>`,
  studio.telegram && `<a href="https://t.me/${esc(studio.telegram.replace(/^@/, ''))}">Telegram</a>`,
  studio.email && `<a href="mailto:${esc(studio.email)}">${esc(studio.email)}</a>`,
  studio.site && `<a href="${esc(studio.site)}">${esc(studio.site.replace(/^https?:\/\//, ''))}</a>`,
].filter(Boolean);

const heading = title ? `${esc(title)}: было и стало` : 'Было и стало';
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${heading}</title>
<style>
  :root {
    --ink: #1c1b19; --ink-soft: #5f5b54; --paper: #fbfaf7; --panel: #ffffff;
    --line: rgb(28 27 25 / 0.1); --good: #1f7a4a; --mid: #b4690e; --bad: #b42318;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 1200px; margin: 0 auto; padding: 56px 20px 80px; }
  h1 { font-size: clamp(30px, 5vw, 44px); line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 12px; text-wrap: balance; }
  h2 { font-size: 24px; line-height: 1.2; margin: 64px 0 20px; }
  .lead { color: var(--ink-soft); margin: 0; max-width: 60ch; }
  .scores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; margin-top: 40px; }
  .score { background: var(--panel); padding: 24px; display: grid; gap: 4px; }
  .score-label { color: var(--ink-soft); font-size: 15px; }
  .score-after { font-size: 48px; font-weight: 650; line-height: 1; font-variant-numeric: tabular-nums; }
  .score-after[data-level="good"] { color: var(--good); }
  .score-after[data-level="mid"] { color: var(--mid); }
  .score-after[data-level="bad"] { color: var(--bad); }
  .score-before { color: var(--ink-soft); font-size: 15px; font-variant-numeric: tabular-nums; }
  .score-before b { color: var(--ink); font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 14px 0; border-bottom: 1px solid var(--line); }
  thead th { color: var(--ink-soft); font-weight: 500; font-size: 15px; }
  td { width: 22%; }
  td:last-child { font-weight: 600; }
  .tabs { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; padding: 3px; margin-bottom: 20px; background: var(--panel); }
  .tabs button { font: inherit; font-size: 15px; border: 0; background: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; color: var(--ink-soft); }
  .tabs button[aria-selected="true"] { background: var(--ink); color: var(--paper); }
  .tabs button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .pair[hidden] { display: none; }
  .pair[data-device="mobile"] { grid-template-columns: repeat(2, minmax(0, 390px)); }
  figure { margin: 0; }
  figcaption { font-weight: 600; margin-bottom: 8px; }
  .frame { height: min(80vh, 760px); overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .frame img { display: block; width: 100%; height: auto; }
  .shot-missing { color: var(--ink-soft); padding: 24px; margin: 0; }
  .fixed { padding-left: 1.2em; margin: 0; max-width: 70ch; }
  .fixed li + li { margin-top: 10px; }
  .note { color: var(--ink-soft); font-size: 14px; margin-top: 48px; max-width: 70ch; }
  footer { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: baseline; }
  footer a { color: var(--ink); }
  @media (max-width: 760px) {
    .scores { grid-template-columns: 1fr 1fr; }
    .pair, .pair[data-device="mobile"] { grid-template-columns: 1fr; }
    td { width: auto; }
  }
</style>
</head>
<body>
<main>
  <h1>${heading}</h1>
  <p class="lead">Сравнение старого сайта${before.meta.url ? ` (${esc(before.meta.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))})` : ''} и новой версии. Оценки Google Lighthouse для мобильных устройств, от 0 до 100.</p>

  <section class="scores" aria-label="Оценки Lighthouse">${scoreRows}
  </section>

  <h2>Скорость загрузки на телефоне</h2>
  <table>
    <thead><tr><th scope="col"></th><th scope="col">Было</th><th scope="col">Стало</th></tr></thead>
    <tbody>${metricRows}</tbody>
  </table>

  <h2>Внешний вид</h2>
  <div class="tabs" role="tablist" aria-label="Устройство">
    <button type="button" role="tab" aria-selected="true" data-tab="desktop">Компьютер</button>
    <button type="button" role="tab" aria-selected="false" data-tab="mobile">Телефон</button>
  </div>
  ${compareBlock('desktop')}
  ${compareBlock('mobile').replace('class="pair"', 'class="pair" hidden')}
${fixed.length ? `
  <h2>Что исправлено</h2>
  <ul class="fixed">
    ${fixed.map((item) => `<li>${esc(item)}</li>`).join('\n    ')}
  </ul>` : ''}

  <p class="note">Замеры сделаны ${esc(before.meta.date || '')}${before.meta.date || after.meta.date ? ' и ' : ''}${esc(after.meta.date || '')}, медиана нескольких прогонов. Оценка SEO новой версии посчитана без учёта запрета индексации: он стоит только на демо-версии и снимается при запуске сайта.</p>
${studio.name || studioLinks.length ? `
  <footer>
    ${studio.name ? `<strong>${esc(studio.name)}</strong>` : ''}
    ${studioLinks.join('\n    ')}
  </footer>` : ''}
</main>
<script>
  const tabs = document.querySelectorAll('[data-tab]');
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll('.pair').forEach((p) => { p.hidden = p.dataset.device !== tab.dataset.tab; });
  }));
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`Готово: ${path.join(outDir, 'index.html')}`);
