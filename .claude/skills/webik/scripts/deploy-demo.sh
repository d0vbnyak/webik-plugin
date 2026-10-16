#!/usr/bin/env bash
# Выкладка собранного сайта на демо-сервер.
# Использование: bash deploy-demo.sh <slug> [папка-сборки]
# Конфиг: ~/.webik/config.json (или путь в WEBIK_CONFIG), секция "demo".
set -euo pipefail

SLUG="${1:-}"
DIST="${2:-dist}"
CONFIG="${WEBIK_CONFIG:-$HOME/.webik/config.json}"

fail() { echo "Ошибка: $*" >&2; exit 1; }

[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || fail "некорректный slug '$SLUG' (только a-z, 0-9, дефис)"
[ -d "$DIST" ] || fail "нет папки сборки $DIST"
[ -f "$CONFIG" ] || fail "нет конфига $CONFIG (пример в references/deploy.md)"

# Демо-сборка обязана быть закрыта от индексации
grep -q "Disallow: /" "$DIST/robots.txt" 2>/dev/null || fail "$DIST/robots.txt без 'Disallow: /' — это не демо-сборка"
grep -q "noindex" "$DIST/index.html" 2>/dev/null || fail "$DIST/index.html без noindex — это не демо-сборка"

# Конфиг читается через stdin, чтобы путь работал и в Git Bash, и в Linux.
# Парсер JSON — node, а если его нет, python.
if command -v node >/dev/null 2>&1; then
  read_key() {
    node -e '
      let s = "";
      process.stdin.on("data", d => s += d).on("end", () => {
        const v = (JSON.parse(s).demo || {})[process.argv[1]];
        if (v === undefined || v === "") process.exit(2);
        console.log(v);
      });' "$1"
  }
else
  PY="$(command -v python3 || command -v python || true)"
  [ -n "$PY" ] || fail "нужен node или python, чтобы прочитать конфиг"
  read_key() {
    "$PY" -I -c '
import json, sys
v = json.load(sys.stdin).get("demo", {}).get(sys.argv[1])
if v in (None, ""): sys.exit(2)
print(v)' "$1"
  }
fi
cfg() { read_key "$1" < "$CONFIG" | tr -d '\r' || fail "в конфиге нет demo.$1"; }

HOST="$(cfg host)"
USER_NAME="$(cfg user)"
ROOT="$(cfg root)"
URL_TEMPLATE="$(cfg url_template)"
PORT="$(read_key port < "$CONFIG" 2>/dev/null | tr -d '\r' || true)"
PORT="${PORT:-22}"
REMOTE="$USER_NAME@$HOST"
URL="${URL_TEMPLATE//\{slug\}/$SLUG}"

[[ "$ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "demo.root должен быть абсолютным путём без пробелов"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -C "$DIST" -czf "$TMP/site.tgz" .

echo "Загрузка $SLUG на $HOST…"
scp -q -P "$PORT" "$TMP/site.tgz" "$REMOTE:/tmp/webik-$SLUG.tgz"

# Распаковка рядом и атомарная подмена: старая версия работает до последнего момента
ssh -p "$PORT" "$REMOTE" bash -s -- "$ROOT" "$SLUG" <<'REMOTE_SCRIPT'
set -euo pipefail
ROOT="$1"; SLUG="$2"; D="$ROOT/$SLUG"; ARCH="/tmp/webik-$SLUG.tgz"
rm -rf "$D.new" "$D.old"
mkdir -p "$D.new"
tar -xzf "$ARCH" -C "$D.new"
rm -f "$ARCH"
if [ -d "$D" ]; then mv "$D" "$D.old"; fi
mv "$D.new" "$D"
rm -rf "$D.old"
REMOTE_SCRIPT

echo "Готово: $URL"
