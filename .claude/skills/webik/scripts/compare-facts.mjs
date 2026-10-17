// Проверяемые цифры для страницы «было / стало».
// Использование:
//   node compare-facts.mjs --before .webik/compare/before --after .webik/compare/after \
//     --dist dist --redirects deploy/redirects.nginx.conf
// Печатает цифры и пишет их в <after>/../facts.json. На странице используются только они.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const before = opt('--before');
const after = opt('--after');
const dist = opt('--dist');
const redirectsPath = opt('--redirects');
if (!before || !after) {
  console.error('Ошибка: нужны --before и --after (папки снимков capture.sh)');
  process.exit(2);
}

const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const facts = {};

// Сторонние скрипты: <script src> с чужого домена плюс встроенные счётчики
const COUNTERS = [
  [/mc\.yandex\.ru|ym\(\s*\d+/, 'Яндекс Метрика'],
  [/googletagmanager\.com|gtag\(/, 'Google Analytics'],
  [/top-fwz1\.mail\.ru|top\.mail\.ru/, 'Top Mail.ru'],
  [/connect\.facebook\.net|vk\.com\/js\/api\/openapi/, 'пиксель соцсети'],
  [/jivosite|jivo\.chat|bitrix24.*crm|chatra|carrotquest/, 'онлайн-чат'],
];
function scripts(dir, name) {
  const file = path.join(dir, `${name}.html`);
  const meta = readJson(path.join(dir, 'meta.json'));
  if (!fs.existsSync(file) || !meta) return null;
  const host = new URL(meta.base).hostname.replace(/^www\./, '');
  const html = fs.readFileSync(file, 'utf8');
  const external = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((src) => /^(https?:)?\/\//.test(src))
    .map((src) => new URL(src, meta.base).hostname.replace(/^www\./, ''))
    .filter((h) => h !== host);
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  const counters = COUNTERS.filter(([re]) => re.test(inline)).map(([, label]) => label);
  const hosts = {};
  for (const h of external) hosts[h] = (hosts[h] || 0) + 1;
  return { external: external.length, hosts, counters };
}

const names = fs.existsSync(before)
  ? [...new Set(fs.readdirSync(before).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')))]
  : [];
facts.scripts = {};
for (const name of names) {
  const b = scripts(before, name);
  const a = scripts(after, name);
  if (b || a) facts.scripts[name] = { before: b, after: a };
}

// Страницы в сборке (без 404 и страниц-редиректов)
if (dist && fs.existsSync(dist)) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const pages = walk(dist).filter((f) => f.endsWith('.html') && !/[\\/]404\.html$/.test(f) && !/http-equiv=["']?refresh/i.test(fs.readFileSync(f, 'utf8')));
  facts.pages = pages.length;
}

// Перенаправления и «удалено» в конфиге nginx
if (redirectsPath && fs.existsSync(redirectsPath)) {
  const conf = fs.readFileSync(redirectsPath, 'utf8').split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
  facts.redirects = {
    permanent: conf.filter((l) => /return\s+301|rewrite\s+\S+\s+\S+\s+permanent/.test(l)).length,
    gone: conf.filter((l) => /return\s+410/.test(l)).length,
    note: 'Правила, а не адреса: одно правило с регулярным выражением может закрывать много старых адресов.',
  };
}

// Lighthouse (если снимали с WEBIK_LH=1): медиана по прогонам
function lighthouse(dir) {
  if (!fs.existsSync(dir)) return null;
  const reports = fs.readdirSync(dir).filter((f) => /^lighthouse-\d+\.json$/.test(f)).map((f) => readJson(path.join(dir, f)));
  if (!reports.length) return null;
  const median = (vals) => {
    const s = vals.filter((v) => typeof v === 'number').sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  // SEO демо считается без аудита индексации: на демо он всегда провален, на проде снимется
  const score = (r, id) => {
    const c = r.categories?.[id];
    if (!c) return null;
    let sum = 0;
    let w = 0;
    for (const ref of c.auditRefs) {
      const s = r.audits[ref.id]?.score;
      if (!ref.weight || s == null || ref.id === 'is-crawlable') continue;
      sum += ref.weight * s;
      w += ref.weight;
    }
    return w ? Math.round((sum / w) * 100) : null;
  };
  const cats = ['performance', 'seo', 'accessibility', 'best-practices'];
  return {
    scores: Object.fromEntries(cats.map((c) => [c, median(reports.map((r) => score(r, c)))])),
    lcpMs: median(reports.map((r) => r.audits['largest-contentful-paint']?.numericValue)),
    cls: median(reports.map((r) => r.audits['cumulative-layout-shift']?.numericValue)),
    bytes: median(reports.map((r) => r.audits['total-byte-weight']?.numericValue)),
  };
}
const lb = lighthouse(before);
const la = lighthouse(after);
if (lb || la) facts.lighthouse = { before: lb, after: la, note: 'SEO без аудита индексации (на демо запрет индексации стоит намеренно).' };

const out = path.join(path.dirname(path.resolve(after)), 'facts.json');
fs.writeFileSync(out, JSON.stringify(facts, null, 2));

// Короткая сводка
if (facts.pages != null) console.log(`Страниц в сборке: ${facts.pages}`);
if (facts.redirects) console.log(`Правил 301: ${facts.redirects.permanent}, правил 410: ${facts.redirects.gone}`);
for (const [name, s] of Object.entries(facts.scripts)) {
  const fmt = (x) => (x ? `${x.external}${x.counters.length ? ` + встроенные: ${x.counters.join(', ')}` : ''}` : '—');
  console.log(`Сторонние скрипты, ${name}: было ${fmt(s.before)}, стало ${fmt(s.after)}`);
}
if (facts.lighthouse) {
  const f = (x) => (x ? Object.entries(x.scores).map(([k, v]) => `${k} ${v ?? '—'}`).join(', ') : '—');
  console.log(`Lighthouse было: ${f(facts.lighthouse.before)}\nLighthouse стало: ${f(facts.lighthouse.after)}`);
}
console.log(`\nЗаписано: ${out}`);
