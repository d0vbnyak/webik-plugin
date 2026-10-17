#!/usr/bin/env bash
# Снимок сайта для сравнения «было / стало»: скриншоты desktop и mobile и замеры Lighthouse.
# Использование: bash capture.sh <url> <папка>
# Нужны Node.js (npx) и установленный Google Chrome (для Lighthouse).
# WEBIK_LH_RUNS — число прогонов Lighthouse (по умолчанию 3, берётся медиана).
set -euo pipefail

URL="${1:-}"
OUT="${2:-}"
RUNS="${WEBIK_LH_RUNS:-3}"
PLAYWRIGHT="playwright@1.63.0"
LIGHTHOUSE="lighthouse@13.5.0"

fail() { echo "Ошибка: $*" >&2; exit 1; }

[[ "$URL" =~ ^https?:// ]] || fail "первый аргумент — адрес сайта с http:// или https://"
[ -n "$OUT" ] || fail "второй аргумент — папка для результата"
command -v npx >/dev/null 2>&1 || fail "нужен Node.js (команда npx не найдена)"

mkdir -p "$OUT"
rm -f "$OUT"/lighthouse-*.json

echo "Скриншоты $URL…"
npx -y "$PLAYWRIGHT" install chromium >/dev/null
npx -y "$PLAYWRIGHT" screenshot --viewport-size=1440,900 --full-page --wait-for-timeout=2000 "$URL" "$OUT/desktop.png"
npx -y "$PLAYWRIGHT" screenshot --device="iPhone 13" --full-page --wait-for-timeout=2000 "$URL" "$OUT/mobile.png"

for i in $(seq 1 "$RUNS"); do
  echo "Lighthouse, прогон $i из $RUNS…"
  # В Windows Lighthouse иногда падает при удалении временной папки Chrome уже после записи отчёта,
  # поэтому результат проверяется по наличию файла, а не по коду выхода.
  npx -y "$LIGHTHOUSE" "$URL" --quiet --output=json --output-path="$OUT/lighthouse-$i.json" \
    --only-categories=performance,accessibility,best-practices,seo \
    --chrome-flags="--headless=new --no-sandbox" || true
  [ -s "$OUT/lighthouse-$i.json" ] || fail "Lighthouse не записал отчёт (установлен ли Google Chrome?)"
done

printf '{"url": "%s", "date": "%s"}\n' "$URL" "$(date +%Y-%m-%d)" > "$OUT/meta.json"
echo "Готово: $OUT"
