// Проверка собранного сайта (папка dist) без зависимостей.
// Использование:
//   node check-site.mjs <dist> [--urlmap .webik/brief.md] [--redirects deploy/redirects.nginx.conf]
// Ошибки: дубли title/description, не одна h1, нет lang/title/description/canonical,
// битые внутренние ссылки и картинки, img без alt, старый URL без страницы и без редиректа,
// демо-сборка без noindex. Предупреждения: заглушки [НУЖНО ОТ ВАС].
// Код выхода 1, если есть ошибки.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const dist = args.find((a, i) => !a.startsWith('--') && !['--urlmap', '--redirects'].includes(args[i - 1]));
if (!dist || !fs.existsSync(dist)) {
  console.error('Ошибка: укажите папку сборки, например dist');
  process.exit(2);
}

const errors = [];
const warnings = [];
const err = (page, msg) => errors.push(`${page}: ${msg}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist);
const toUrl = (file) => '/' + path.relative(dist, file).split(path.sep).join('/');
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const fileUrls = new Set(files.map(toUrl));

// Существует ли внутренний адрес в сборке: файл, папка с index.html или адрес без слеша
function exists(url) {
  let u = decodeURI(url.split('#')[0].split('?')[0]);
  if (!u || u === '/') return fileUrls.has('/index.html');
  if (fileUrls.has(u)) return true;
  if (!u.endsWith('/')) u += '/';
  return fileUrls.has(u + 'index.html');
}

const robots = fs.existsSync(path.join(dist, 'robots.txt')) ? fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8') : '';
const isDemo = /Disallow:\s*\/\s*$/m.test(robots);

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : null;
};

const titles = new Map();
const descriptions = new Map();
const placeholders = new Map();

for (const file of htmlFiles) {
  const page = toUrl(file).replace(/index\.html$/, '');
  const html = fs.readFileSync(file, 'utf8');
  // Страница-редирект Astro (meta refresh) проверяется только на цель
  const refresh = html.match(/<meta[^>]+http-equiv=["']?refresh[^>]*>/i);
  if (refresh) {
    const target = (attr(refresh[0], 'content') || '').replace(/^.*url=/i, '');
    if (target.startsWith('/') && !exists(target)) err(page, `редирект ведёт на несуществующую страницу ${target}`);
    continue;
  }
  const isNotFound = /\/404\.html$/.test(file);

  const htmlTag = html.match(/<html[^>]*>/i)?.[0] || '';
  if (!attr(htmlTag, 'lang')) err(page, 'нет атрибута lang у <html>');

  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  if (!title) err(page, 'нет <title>');
  else titles.set(title, [...(titles.get(title) || []), page]);

  const descTag = html.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0];
  const desc = descTag ? attr(descTag, 'content') : '';
  if (!desc) err(page, 'нет meta description');
  else descriptions.set(desc, [...(descriptions.get(desc) || []), page]);

  if (!isNotFound && !/<link[^>]+rel=["']canonical["']/i.test(html)) err(page, 'нет canonical');

  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1 !== 1) err(page, `h1: ${h1} (нужна ровно одна)`);

  if (isDemo && !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) err(page, 'демо-сборка без noindex');

  for (const img of html.match(/<img\b[^>]*>/gi) || []) {
    // Astro пишет пустой alt как голый атрибут `alt` — это корректно для декоративных картинок
    if (!/\salt(\s|=|>|\/)/i.test(img)) err(page, `img без alt: ${(attr(img, 'src') || '').slice(0, 80)}`);
    const src = attr(img, 'src');
    if (src && src.startsWith('/') && !src.startsWith('//') && !exists(src)) err(page, `нет картинки ${src}`);
  }

  for (const a of html.match(/<a\b[^>]*>/gi) || []) {
    const href = attr(a, 'href');
    if (href === null || href === '') {
      err(page, 'ссылка без href');
      continue;
    }
    if (href === '#') err(page, 'пустая ссылка href="#"');
    if (href.startsWith('/') && !href.startsWith('//') && !exists(href)) err(page, `битая ссылка ${href}`);
  }

  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
  for (const m of text.matchAll(/\[НУЖНО ОТ ВАС:?\s*([^\]]*)\]/g)) {
    const key = decode(m[1].replace(/<[^>]+>/g, '')) || '(без описания)';
    placeholders.set(key, new Set([...(placeholders.get(key) || []), page]));
  }
}

for (const [title, pages] of titles) if (pages.length > 1) errors.push(`одинаковый title «${title}» на ${pages.length} страницах: ${pages.slice(0, 5).join(', ')}`);
for (const [desc, pages] of descriptions)
  if (pages.length > 1) errors.push(`одинаковый description «${desc.slice(0, 60)}…» на ${pages.length} страницах: ${pages.slice(0, 5).join(', ')}`);

// Карта URL из брифа: каждый старый адрес должен существовать или иметь 301
const urlmapPath = opt('--urlmap');
const redirectsPath = opt('--redirects');
if (urlmapPath) {
  if (!fs.existsSync(urlmapPath)) errors.push(`нет файла карты URL ${urlmapPath}`);
  else {
    const md = fs.readFileSync(urlmapPath, 'utf8');
    const section = md.split(/^## /m).find((s) => /^Карта страниц/.test(s)) || '';
    const oldUrls = section
      .split(/\r?\n/)
      .filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/Старый URL/i.test(l))
      .flatMap((l) => (l.split('|')[1] || '').split(/[,\s]+/))
      .map((u) => u.replace(/`/g, '').trim())
      .filter((u) => u.startsWith('/'));
    const redirects = redirectsPath && fs.existsSync(redirectsPath) ? fs.readFileSync(redirectsPath, 'utf8') : '';
    if (redirectsPath && !redirects) errors.push(`нет файла редиректов ${redirectsPath}`);
    // Разбор правил nginx: location (=, ^~, префикс, ~ и ~*), rewrite и записи map ("старый" новый;)
    const locations = [...redirects.matchAll(/^\s*location\s+(=|\^~|~\*?)?\s*(\S+)\s*\{/gm)].map((m) => ({ mod: m[1] || '', path: m[2] }));
    const rewrites = [...redirects.matchAll(/^\s*rewrite\s+(\S+)\s+(\S+)/gm)].map((m) => ({ re: m[1], to: m[2] }));
    const mapKeys = new Set([...redirects.matchAll(/^\s*"?(\/[^"\s]*)"?\s+\S+;/gm)].map((m) => m[1]));
    const matchesLocation = (u) =>
      locations.some(({ mod, path: p }) => {
        if (mod === '=') return u === p;
        if (mod === '~' || mod === '~*') {
          try {
            return new RegExp(p, mod === '~*' ? 'i' : '').test(u);
          } catch {
            return false;
          }
        }
        return p !== '/' && u.startsWith(p); // ^~ и обычный префикс; корневой location / не считается редиректом
      });
    const redirected = (u, depth = 0) => {
      if (matchesLocation(u) || mapKeys.has(u)) return true;
      if (depth > 2) return false;
      for (const { re, to } of rewrites) {
        let m;
        try {
          m = u.match(new RegExp(re));
        } catch {
          continue;
        }
        if (!m) continue;
        const next = to.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
        if (next !== u && (exists(next) || redirected(next, depth + 1))) return true;
      }
      return false;
    };
    let missing = 0;
    for (const u of oldUrls) {
      if (exists(u) || redirected(u)) continue;
      missing++;
      errors.push(`старый адрес ${u} не существует в сборке и не перенаправлен`);
    }
    console.log(`Карта URL: старых адресов ${oldUrls.length}, без страницы и редиректа ${missing}`);
  }
}

if (placeholders.size) {
  for (const [key, pages] of placeholders) warnings.push(`[НУЖНО ОТ ВАС: ${key}] — ${pages.size} стр.`);
}

console.log(`Страниц: ${htmlFiles.length}${isDemo ? ' (демо-сборка)' : ''}`);
if (warnings.length) {
  console.log(`\nПредупреждения (${warnings.length}):`);
  for (const w of warnings) console.log(`  ${w}`);
}
if (errors.length) {
  console.log(`\nОшибки (${errors.length}):`);
  for (const e of errors.slice(0, 200)) console.log(`  ${e}`);
  if (errors.length > 200) console.log(`  …и ещё ${errors.length - 200}`);
  process.exit(1);
}
console.log('\nОшибок нет.');
