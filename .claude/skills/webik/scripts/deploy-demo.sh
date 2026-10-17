#!/usr/bin/env bash
# Выкладка собранного сайта на демо-сервер.
# Использование: bash deploy-demo.sh <slug> [папка-сборки]
# Конфиг: ~/.webik/config.json (или путь в WEBIK_CONFIG), секция "demo".
# Если в "demo" есть блок "caddy", для нового проекта скрипт сам дописывает сайт в Caddyfile
# (резервная копия, caddy validate, плавный reload, проверка соседних сайтов, откат при ошибке).
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
# Парсер JSON — node, а если его нет, python. Ключ может быть вложенным: caddy.container
if command -v node >/dev/null 2>&1; then
  read_key() {
    node -e '
      let s = "";
      process.stdin.on("data", d => s += d).on("end", () => {
        let v = JSON.parse(s).demo || {};
        for (const k of process.argv[1].split(".")) v = v == null ? undefined : v[k];
        if (v === undefined || v === null || v === "") process.exit(2);
        console.log(Array.isArray(v) ? v.join("\n") : v);
      });' "$1"
  }
else
  PY="$(command -v python3 || command -v python || true)"
  [ -n "$PY" ] || fail "нужен node или python, чтобы прочитать конфиг"
  read_key() {
    "$PY" -I -c '
import json, sys
v = json.load(sys.stdin).get("demo", {})
for k in sys.argv[1].split("."):
    v = v.get(k) if isinstance(v, dict) else None
if v in (None, ""): sys.exit(2)
print("\n".join(v) if isinstance(v, list) else v)' "$1"
  }
fi
cfg() { read_key "$1" < "$CONFIG" | tr -d '\r' || fail "в конфиге нет demo.$1"; }
cfg_opt() { read_key "$1" < "$CONFIG" 2>/dev/null | tr -d '\r' || true; }

HOST="$(cfg host)"
USER_NAME="$(cfg user)"
ROOT="$(cfg root)"
URL_TEMPLATE="$(cfg url_template)"
PORT="$(cfg_opt port)"; PORT="${PORT:-22}"
REMOTE="$USER_NAME@$HOST"

[[ "$URL_TEMPLATE" == https://* ]] || fail "demo.url_template должен начинаться с https:// (сейчас: $URL_TEMPLATE)"
[[ "$URL_TEMPLATE" == *"{slug}"* ]] || fail "в demo.url_template нет {slug} (сейчас: $URL_TEMPLATE). Пример: https://{slug}-demo.webik.tech"
[[ "$ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "demo.root должен быть абсолютным путём без пробелов"

URL="${URL_TEMPLATE//\{slug\}/$SLUG}"
SITE_HOST="${URL#https://}"; SITE_HOST="${SITE_HOST%%/*}"

CADDY_CONTAINER="$(cfg_opt caddy.container)"
if [ -n "$CADDY_CONTAINER" ]; then
  CADDYFILE="$(cfg caddy.caddyfile)"
  CADDY_ROOT="$(cfg caddy.root_in_container)"
  CADDYFILE_IN="$(cfg_opt caddy.caddyfile_in_container)"; CADDYFILE_IN="${CADDYFILE_IN:-/etc/caddy/Caddyfile}"
  BACKUP_DIR="$(cfg_opt caddy.backup_dir)"; BACKUP_DIR="${BACKUP_DIR:-$(dirname "$CADDYFILE")/backup}"
  CHECK_URLS="$(cfg_opt caddy.check_urls | tr '\n' ' ')"
  for v in "$CADDY_CONTAINER" "$CADDYFILE" "$CADDY_ROOT" "$CADDYFILE_IN" "$BACKUP_DIR"; do
    [[ "$v" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "недопустимое значение в demo.caddy: '$v'"
  done
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -C "$DIST" -czf "$TMP/site.tgz" .

echo "Загрузка $SLUG на $HOST…"
scp -q -P "$PORT" "$TMP/site.tgz" "$REMOTE:/tmp/webik-$SLUG.tgz"

# Распаковка рядом и атомарная подмена: старая версия работает до последнего момента
ssh -p "$PORT" "$REMOTE" bash -s -- "$ROOT" "$SLUG" <<'REMOTE_SCRIPT'
set -euo pipefail
ROOT="$1"; SLUG="$2"; D="$ROOT/$SLUG"; ARCH="/tmp/webik-$SLUG.tgz"
mkdir -p "$ROOT"
rm -rf "$D.new" "$D.old"
mkdir -p "$D.new"
tar -xzf "$ARCH" -C "$D.new"
rm -f "$ARCH"
if [ -d "$D" ]; then mv "$D" "$D.old"; fi
mv "$D.new" "$D"
rm -rf "$D.old"
REMOTE_SCRIPT

if [ -n "$CADDY_CONTAINER" ]; then
  echo "Caddy: проверка блока $SITE_HOST…"
  ssh -p "$PORT" "$REMOTE" bash -s -- "$CADDYFILE" "$CADDYFILE_IN" "$CADDY_CONTAINER" "$CADDY_ROOT" "$BACKUP_DIR" "$SLUG" "$SITE_HOST" $CHECK_URLS <<'CADDY_SCRIPT'
set -euo pipefail
F="$1"; F_IN="$2"; C="$3"; CROOT="$4"; BK="$5"; SLUG="$6"; SITE="$7"; shift 7
CHECK_URLS=("$@")

if grep -qE "^${SITE//./\\.}[[:space:]]*\{" "$F"; then
  echo "Блок $SITE уже есть в Caddyfile, конфиг не меняется."
  exit 0
fi

status() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$1" || echo 000; }
declare -A BEFORE
for u in "${CHECK_URLS[@]}"; do BEFORE[$u]="$(status "$u")"; done

mkdir -p "$BK"
B="$BK/Caddyfile.before-webik-$SLUG-$(date +%Y%m%d-%H%M%S)"
cp -p "$F" "$B"

# Откат без смены inode: Caddyfile примонтирован в контейнер одним файлом
rollback() {
  echo "Откат Caddyfile из $B" >&2
  cat "$B" > "$F"
  docker exec "$C" caddy reload --config "$F_IN" --adapter caddyfile >/dev/null 2>&1 || true
  exit 1
}

# Только дописывание в конец (cat >>): sed -i и редакторы создают новый файл, и контейнер его не увидит
cat >> "$F" <<EOF

# Демо webik: $SLUG (добавлено $(date +%Y-%m-%d)). Файлы: $CROOT/$SLUG
$SITE {
	root * $CROOT/$SLUG
	encode zstd gzip
	header X-Robots-Tag "noindex, nofollow"
	file_server
	handle_errors {
		rewrite * /404.html
		file_server
	}
}
EOF

docker exec "$C" caddy validate --config "$F_IN" --adapter caddyfile >/dev/null 2>&1 || { echo "caddy validate не прошёл" >&2; rollback; }
docker exec "$C" caddy reload --config "$F_IN" --adapter caddyfile >/dev/null 2>&1 || { echo "caddy reload не прошёл" >&2; rollback; }

sleep 2
for u in "${CHECK_URLS[@]}"; do
  now="$(status "$u")"
  if [[ "${BEFORE[$u]}" =~ ^[23] && ! "$now" =~ ^[23] ]]; then
    echo "Соседний сайт $u: было ${BEFORE[$u]}, стало $now" >&2
    rollback
  fi
  echo "Соседний сайт $u: $now"
done
echo "Блок $SITE добавлен, Caddy перезагружен. Резервная копия: $B"
CADDY_SCRIPT
fi

echo "Готово: $URL"
