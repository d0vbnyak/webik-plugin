#!/usr/bin/env bash
# Снимок сайта для сравнения «было / стало»: первый экран страниц на компьютере и телефоне
# в двойной плотности пикселей, HTML страниц (для подсчёта сторонних скриптов), по желанию Lighthouse.
#
# Использование: bash capture.sh <адрес-сайта> <папка> [имя=путь ...]
#   bash capture.sh https://aquamarines.ru .webik/compare/before home=/ tour=/moneron catalog=/zimnie
#   bash capture.sh https://aquamarines-demo.webik.tech .webik/compare/after home=/glavnaya/ tour=/moneron/ catalog=/zimnie/
# Имена страниц у «было» и «стало» должны совпадать: по ним собираются пары.
# Результат: <имя>-desktop.png (2560×1600), <имя>-mobile.png (1125×2436), <имя>.html, meta.json.
# WEBIK_LH=1 — ещё три прогона Lighthouse для главной (нужен Google Chrome): lighthouse-*.json.
set -euo pipefail

BASE="${1:-}"
OUT="${2:-}"
shift 2 || true
PAGES=("$@")
[ ${#PAGES[@]} -gt 0 ] || PAGES=("home=/")

PLAYWRIGHT="playwright@1.63.0"
LIGHTHOUSE="lighthouse@13.5.0"

fail() { echo "Ошибка: $*" >&2; exit 1; }

[[ "$BASE" =~ ^https?:// ]] || fail "первый аргумент — адрес сайта с http:// или https://"
[ -n "$OUT" ] || fail "второй аргумент — папка для результата"
command -v npx >/dev/null 2>&1 || fail "нужен Node.js (команда npx не найдена)"
BASE="${BASE%/}"
mkdir -p "$OUT"

npx -y "$PLAYWRIGHT" install chromium webkit >/dev/null

for spec in "${PAGES[@]}"; do
  name="${spec%%=*}"; path="${spec#*=}"
  [[ "$name" =~ ^[a-z0-9-]+$ ]] || fail "имя страницы '$name': только a-z, 0-9, дефис"
  [[ "$path" == /* ]] || fail "путь страницы '$path' должен начинаться с /"
  url="$BASE$path"
  echo "Снимок $name: $url"
  # Компьютер: окно 1280×800, плотность 2 → 2560×1600
  npx -y "$PLAYWRIGHT" screenshot -b chromium --device="Desktop Chrome HiDPI" --viewport-size=1280,800 \
    --wait-for-timeout=2500 "$url" "$OUT/$name-desktop.png"
  # Телефон: окно 375×812, плотность 3, движок WebKit, как в настоящем iPhone (iPhone 13 mini)
  npx -y "$PLAYWRIGHT" screenshot --device="iPhone 13 Mini" --viewport-size=375,812 \
    --wait-for-timeout=2500 "$url" "$OUT/$name-mobile.png"
  curl -sL --max-time 30 -A "Mozilla/5.0 (compatible; WebikCompare/1.0)" -o "$OUT/$name.html" "$url" || true
done

if [ "${WEBIK_LH:-0}" = "1" ]; then
  home_path="/"
  for spec in "${PAGES[@]}"; do [ "${spec%%=*}" = "home" ] && home_path="${spec#*=}"; done
  rm -f "$OUT"/lighthouse-*.json
  for i in 1 2 3; do
    echo "Lighthouse, прогон $i из 3…"
    # В Windows Lighthouse иногда падает при удалении временной папки Chrome уже после записи отчёта
    npx -y "$LIGHTHOUSE" "$BASE$home_path" --quiet --output=json --output-path="$OUT/lighthouse-$i.json" \
      --only-categories=performance,accessibility,best-practices,seo \
      --chrome-flags="--headless=new --no-sandbox" || true
    [ -s "$OUT/lighthouse-$i.json" ] || fail "Lighthouse не записал отчёт (установлен ли Google Chrome?)"
  done
fi

printf '{"base": "%s", "date": "%s", "pages": "%s"}\n' "$BASE" "$(date +%Y-%m-%d)" "${PAGES[*]}" > "$OUT/meta.json"
echo "Готово: $OUT"
