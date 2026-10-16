#!/usr/bin/env bash
# Поиск признаков AI-работы в исходниках сайта.
# Использование: bash check-ai-tells.sh [папка, по умолчанию src]
# Строка с пометкой webik-allow пропускается (например <!-- webik-allow: слоган клиента -->).
# Код выхода 1, если что-то найдено.
set -uo pipefail
export LC_ALL=C.UTF-8

DIR="${1:-src}"
[ -d "$DIR" ] || { echo "Нет папки $DIR" >&2; exit 2; }

TEXT=(--include=*.astro --include=*.md --include=*.mdx --include=*.html)
CODE=("${TEXT[@]}" --include=*.ts --include=*.js --include=*.mjs --include=*.jsx --include=*.tsx --include=*.css)
STYLE=(--include=*.css --include=*.astro --include=*.ts --include=*.mjs --include=*.js --include=*.json)

found=0

# check <правило> <регулярка PCRE> <набор файлов: TEXT|CODE|STYLE>
check() {
  local rule="$1" re="$2" set="$3" out
  local -n inc="$set"
  out="$(grep -rnP "${inc[@]}" --exclude-dir=node_modules -e "$re" "$DIR" 2>/dev/null | grep -v 'webik-allow')"
  [ -z "$out" ] && return
  while IFS= read -r line; do
    printf '[%s] %s\n' "$rule" "${line:0:220}"
    found=$((found + 1))
  done <<< "$out"
}

# Тексты
check "разделитель" '\s[·•]\s|&middot;|&bull;' TEXT
check "рубленые-фразы" '(^|[\s>«"])(\p{Lu}\p{Ll}+\.\s+){2,}\p{Lu}\p{Ll}+\.' TEXT
check "эмодзи" '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B50}]' TEXT
check "вопрос-в-заголовке" '<h[1-3][^>]*>[^<]*\?\s*</h[1-3]>|^#{1,3}\s.*\?\s*$' TEXT
check "восклицание" '\p{Ll}!(\s|<|$)' TEXT
check "штамп" '(?i)команда (опытных )?профессионалов|индивидуальн\w* подход|широк\w* спектр|полн\w* комплекс услуг|динамично развива|надёжн\w* партн[её]р|надежн\w* партн[её]р|проверенн\w* временем|соотношени\w* цены и качества|в кратчайшие сроки|быстро и качественно|добро пожаловать|наш приоритет|откройте для себя|погрузитесь в|раскройте потенциал|новый уровень|инновационн\w* решени|почему выбирают нас|наша миссия|не просто \p{L}+\s*[—–-]' TEXT
check "общий-призыв" '>\s*(Подробнее|Узнать больше|Начать|Отправить|Learn more|Read more|Get started)\s*<' TEXT
check "выдумка-заглушка" '(?i)lorem ipsum|example\.(com|ru|org)|000-00-00|\+7\s?\(999\)' TEXT

# Шрифты
check "шрифт" '(?i)jetbrains|space mono|plex mono|fira code|roboto mono|geist mono|source code pro|ubuntu mono|\bInter\b|montserrat|open sans' STYLE

# Визуал и код
check "градиент-стекло" 'bg-gradient-to-|bg-linear-to-|bg-clip-text|backdrop-blur|linear-gradient\(' CODE
check "анимация-украшение" 'hover:scale-1\d\d|animate-(bounce|pulse|ping)' CODE
check "transition-all" 'transition-all|transition:\s*all' CODE
check "произвольное-значение" '-\[\d+(\.\d+)?px\]|-\[#[0-9a-fA-F]{3,8}\]' CODE
check "пустая-ссылка" 'href="#"' CODE
check "console.log" 'console\.log' CODE

if [ "$found" -eq 0 ]; then
  echo "Признаков AI-работы не найдено в $DIR."
  exit 0
fi
echo
echo "Найдено: $found. Исправь или пометь настоящий элемент клиента комментарием webik-allow с причиной."
exit 1
