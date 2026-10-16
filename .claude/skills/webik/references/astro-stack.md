# Стек: Astro + Tailwind

Сайт собирается в **статику** (`output: "static"`, по умолчанию). Сервера приложений нет: на демо и на проде nginx отдаёт папку `dist/`.

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
  vite: { plugins: [tailwindcss()] },
});
```

`tsconfig.json`:

```json
{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"] }
```

`.gitignore`: `node_modules/`, `dist/`, `.astro/`, `.env`, `.webik/source/`.

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

Имена токенов — по смыслу и миру клиента (`ink`, `paper`, `brick`), а не `gray-700`. В разметке используй только токены (`text-ink-soft`, `bg-paper`), без сырых `text-gray-500` и `#hex`. Длинная повторяющаяся строка классов означает, что нужен компонент.

## Компоненты и интерактив

- По умолчанию — `.astro`-компоненты без JS. Интерактив (меню, аккордеон, слайдер, лайтбокс) — небольшой `<script>` внутри компонента на чистом JS.
- Сначала нативное: `<details>` для FAQ, `<dialog>` для модалок и лайтбокса, `<a href="tel:">`, `<a href="mailto:">`.
- Фреймворк-острова (React/Preact) — только если без них никак (сложный калькулятор, фильтры каталога). Тогда `npx astro add preact` и `client:visible`.
- Иконки — inline SVG-компоненты; никаких иконочных шрифтов.
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
