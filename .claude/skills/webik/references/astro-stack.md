# Стек: Astro + Tailwind

Сайт собирается в **статику** (`output: "static"`, по умолчанию). Сервера приложений нет: на демо и на проде nginx отдаёт папку `dist/`.

> **Этот справочник задаёт структуру и соглашения, а не точный API.** Команды установки, конфиги и вызовы API ниже — ориентир на момент написания. Перед тем как писать код, сверь их с актуальной документацией через Context7 (обязательно, см. `SKILL.md` → «Context7 — обязательное условие для кода»). Если документация отличается, делай по документации.

## Создание проекта

Папка проекта уже содержит `.webik/`, поэтому `npm create astro` может отказаться работать в непустой папке. Каркас создаётся вручную, это надёжнее:

```bash
npm init -y
npm install astro @astrojs/sitemap tailwindcss @tailwindcss/vite
npm install @fontsource-variable/<шрифт>   # для каждого шрифта из дизайна
```

`package.json` → `"type": "module"` и скрипты:

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "build:demo": "cross-env WEBIK_ENV=demo astro build",
  "preview": "astro preview"
}
```

(`npm install -D cross-env`, чтобы `build:demo` одинаково работал в Windows и Linux.)

`astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const isDemo = process.env.WEBIK_ENV === 'demo';

export default defineConfig({
  // Боевой домен клиента; на демо подставляется адрес демо-проекта
  site: isDemo ? process.env.WEBIK_DEMO_URL : 'https://<домен-клиента>',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // Константа сборки: в боевой сборке код демо-страницы «было / стало» и её скриншоты вырезаются целиком
    define: { __WEBIK_DEMO__: JSON.stringify(isDemo) },
  },
});
```

`src/env.d.ts`:

```ts
/** true только в демо-сборке (npm run build:demo), см. astro.config.mjs */
declare const __WEBIK_DEMO__: boolean;
```

`tsconfig.json`:

```json
{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"] }
```

`.gitignore`: `node_modules/`, `dist/`, `.astro/`, `.env`, `.webik/source/`.

## Демо и боевая сборка

Одна кодовая база, две сборки: `npm run build` (прод) и `npm run build:demo` (`WEBIK_ENV=demo`). В демо:
- `noindex` на всех страницах, `robots.txt` с `Disallow: /`, без счётчиков, форма не отправляет данные;
- корень `/` — страница «было / стало» для клиента (`references/compare.md`), главная сайта — `/glavnaya/`.

```ts
// src/data/site.ts
/** На демо корень домена занимает страница «было / стало», главная сайта живёт на /glavnaya/ */
export const isDemo = process.env.WEBIK_ENV === 'demo';
export const homeHref = isDemo ? '/glavnaya/' : '/';
```

```astro
---
// src/pages/index.astro — прод: главная сайта; демо: страница «было / стало»
import HomePage from '../components/sections/HomePage.astro';
// В боевой сборке ветка вырезается, и скриншоты сравнения не попадают в dist/
const Comparison = __WEBIK_DEMO__ ? (await import('../components/demo/Comparison.astro')).default : null;
---
{Comparison ? <Comparison /> : <HomePage />}
```

```astro
---
// src/pages/glavnaya/[...rest].astro — главная сайта на демо; в боевой сборке страниц нет
import HomePage from '../../components/sections/HomePage.astro';
import { isDemo } from '../../data/site';
export function getStaticPaths() {
  return isDemo ? [{ params: { rest: undefined } }] : [];
}
---
<HomePage />
```

Главная сайта целиком живёт в компоненте `HomePage.astro`, страницы только выбирают, где её показать. Все ссылки «на главную» (логотип, хлебные крошки, 404, «Главная» в меню) — через `homeHref`, не `href="/"`. Канонический адрес главной на демо значения не имеет: демо закрыто от индексации.

## Структура

```
src/
├── assets/                 # изображения (оптимизируются astro:assets)
├── components/
│   ├── ui/                 # Button, Container, Section, Heading, Field…
│   ├── sections/           # Hero, Services, Gallery, Faq, Cta… — по артбордам
│   ├── layout/             # Header, Footer, MobileMenu, Breadcrumbs
│   └── seo/                # Seo.astro, JsonLd.astro
├── content/                # коллекции: услуги, статьи, товары
├── content.config.ts       # схемы коллекций (zod)
├── layouts/BaseLayout.astro
├── pages/                  # маршруты; повторяют карту URL из брифа
│   ├── index.astro
│   ├── 404.astro
│   ├── robots.txt.ts
│   └── uslugi/[slug].astro
├── data/site.ts            # название, телефоны, адрес, соцсети — одно место
└── styles/global.css
public/                     # favicon, документы PDF, файлы без обработки
```

Контакты и реквизиты живут только в `src/data/site.ts`: шапка, подвал, страница контактов и микроразметка берут их оттуда.

## Токены Tailwind

Tailwind v4, настройка в CSS:

```css
/* src/styles/global.css */
@import "tailwindcss";
@import "@fontsource-variable/<шрифт>";

@theme {
  --font-display: "<Шрифт заголовков> Variable", serif;
  --font-body: "<Шрифт текста> Variable", sans-serif;

  --color-ink: #1d1a16;        /* основной текст */
  --color-ink-soft: #5b544b;   /* второстепенный */
  --color-paper: #faf7f2;      /* фон страницы */
  --color-brand: #c2410c;      /* акцент из бренда клиента */
  --color-line: rgb(29 26 22 / 0.1);

  --radius-control: 6px;
  --radius-card: 12px;
}
```

### Шкала типографики

Размеры шрифта тоже задаются токенами, по одному на ступень шкалы из `design.md`. Крупные ступени адаптивные через `clamp()`, поэтому не нужны пары `text-x md:text-y`:

```css
@theme {
  --text-display: clamp(2.75rem, 1.6rem + 4.2vw, 4.5rem);
  --text-display--line-height: 1.05;
  --text-display--letter-spacing: -0.02em;
  --text-h1: clamp(2.125rem, 1.5rem + 2.6vw, 3rem);
  --text-h1--line-height: 1.1;
  --text-h2: clamp(1.625rem, 1.25rem + 1.6vw, 2.25rem);
  --text-h2--line-height: 1.15;
  --text-h3: 1.375rem;
  --text-h3--line-height: 1.25;
  --text-body: 1.0625rem;
  --text-body--line-height: 1.6;
  --text-small: 0.875rem;
  --text-small--line-height: 1.45;
}
```

В разметке — только `text-display`, `text-h1`, `text-h2`… Секции одного ранга получают одну и ту же ступень. Произвольные `text-[1.375rem]` и пары вроде `text-2xl md:text-[2.1rem]` запрещены (их ловит `check-ai-tells.sh`). Синтаксис `@theme` сверяй через Context7.

Имена токенов — по смыслу и миру клиента (`ink`, `paper`, `brick`), а не `gray-700`. В разметке используй только токены (`text-ink-soft`, `bg-paper`), без сырых `text-gray-500` и `#hex`. Длинная повторяющаяся строка классов означает, что нужен компонент.

## Компоненты и интерактив

- По умолчанию — `.astro`-компоненты без JS. Интерактив (меню, аккордеон, слайдер, лайтбокс) — небольшой `<script>` внутри компонента на чистом JS.
- Сначала нативное: `<details>` для FAQ, `<dialog>` для модалок и лайтбокса, `<a href="tel:">`, `<a href="mailto:">`.
- Фреймворк-острова (React/Preact) — только если без них никак (сложный калькулятор, фильтры каталога). Тогда `npx astro add preact` и `client:visible`.
- Иконки — inline SVG-компоненты; никаких иконочных шрифтов.
- **Иконки мессенджеров — только официальные знаки из плагина**: `templates/icons/telegram.svg`, `whatsapp.svg`, `max.svg`. Не рисуй их сам и не бери из наборов иконок. Скопируй в `src/assets/icons/` и выводи картинкой (`<img>` или `<Image>` из `astro:assets`) с `alt` по названию («Telegram»), размер 24–32px в кнопках, 40–48px в отдельных бейджах. Inline не вставлять: у `max.svg` внутри фильтры и градиенты с id, при нескольких копиях на странице они конфликтуют. Ссылки: `https://t.me/<ник>`, `https://wa.me/<номер без +>`, Max — ссылка из профиля клиента; номера и ники — только реальные из `src/data/site.ts`. Если дизайн требует одноцветные знаки (монохром в цвет текста), используй тот же контур через `mask-image: url(...)` с `background-color: currentColor`, а не перерисовку.
- Карты (Яндекс/Google) — iframe с `loading="lazy"` или статичная картинка со ссылкой; не грузить JS карты на каждой странице.

## Изображения

- Исходники в `src/assets/`, вывод через `<Image>` / `<Picture>` из `astro:assets`: Astro сам делает WebP/AVIF, `width`/`height`, `srcset`.
- Первый экран: `loading="eager"` и `fetchpriority="high"` для главного изображения; остальные `loading="lazy"` (по умолчанию).
- `alt` осмысленный: что на фото и где, а не «картинка1». Декоративные — `alt=""`.
- Логотип — SVG, если есть или можно перерисовать простой; иначе PNG в двойном размере.

## Шрифты

- Только локально через `@fontsource` или `@fontsource-variable`: быстрее, без внешних запросов, без передачи данных посетителей третьим лицам.
- Кириллица обязательна: проверь, что у шрифта есть поднабор `cyrillic`.
- Не больше двух семейств. Для основного шрифта `font-display: swap` (в fontsource по умолчанию).

## Формы

Сайт статический, поэтому форма отправляет данные на внешний обработчик, адрес которого задаётся переменной окружения:

```
PUBLIC_FORM_ENDPOINT=https://…   # в .env на проде; на демо не задаётся
```

Поведение компонента формы:
- `<form method="post" action={endpoint}>` + прогрессивное улучшение: JS перехватывает отправку, шлёт `fetch` и показывает состояние «Отправка…» / «Спасибо» / ошибку.
- Если `WEBIK_ENV=demo` или endpoint не задан, форма не отправляет данные, а показывает «Это демо-версия сайта, заявка не отправлена».
- Защита от спама: скрытое поле-ловушка (honeypot) и минимальное время заполнения.
- У полей есть `<label>`, правильные `type`/`autocomplete`/`inputmode` (`tel`, `email`, `name`), ошибки — текстом рядом с полем.
- Для сайтов на русском — обязательный чекбокс согласия на обработку персональных данных со ссылкой на `/politika-konfidencialnosti/`.

Какой обработчик стоит на проде, решает руководитель; это пункт в `DEPLOY.md`.

## Редиректы

Astro в статическом режиме делает редиректы через meta refresh: для SEO этого мало. 301-редиректы генерируются для nginx:

- файл `deploy/redirects.nginx.conf` в проекте, по одной строке на каждый изменённый URL из карты страниц:

```nginx
location = /uslugi/remont.html { return 301 /uslugi/remont/; }
location = /about.html { return 301 /o-kompanii/; }
```

- старые URL с параметрами (`/index.php?id=12`) — через `map $request_uri` в том же файле.

## Аналитика

Компонент `Analytics.astro` выводит Яндекс Метрику (`PUBLIC_YM_ID`) и/или Google Analytics (`PUBLIC_GA_ID`) **только если** переменная задана и сборка не демо. Идентификаторы не выдумываются: они в `.env` прода.
