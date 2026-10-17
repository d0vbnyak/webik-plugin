# Демо-сервер

Каждый проект живёт в своей папке `<root>/<slug>/` и открывается по своему адресу из `url_template`, сейчас `https://<slug>-demo.webik.tech/`. Выкладывает `/webik:demo` скриптом `deploy-demo.sh`. Ниже две схемы: та, что работает сейчас, и отдельный сервер на будущее.

## Схема 1 (сейчас): Caddy в Docker на сервере sakhuslugi

Сервер `72.56.237.147` (sakhuslugi-prod-01). Порты 80 и 443 занимает контейнер Caddy проекта sakhuslugi, через него же работают sakhuslugi65.ru и webik.tech. Демо раздаёт тот же Caddy.

- **DNS:** wildcard `*.webik.tech` → `72.56.237.147` (timeweb).
- **Файлы демо:** в томе, который контейнер уже видит: на хосте `/var/lib/docker/volumes/sakhuslugi_caddy_data/_data/demo/<slug>`, в контейнере `/data/demo/<slug>`.
- **Caddyfile:** `/opt/sakhuslugi/site/deploy/Caddyfile`, примонтирован в контейнер **одним файлом**. Поэтому его можно только дописывать (`cat >>`) или перезаписывать содержимое (`cat backup > Caddyfile`). `sed -i` и редакторы создают новый файл, и контейнер продолжит видеть старый.
- **Блок на каждый проект.** Общий блок на все `*-demo.webik.tech` потребовал бы wildcard-сертификат через DNS-API timeweb. Пока каждому демо нужен свой блок, и `deploy-demo.sh` дописывает его сам при первой выкладке проекта: резервная копия в `/opt/sakhuslugi/site/deploy/backup/`, `caddy validate`, плавный `caddy reload`, проверка соседних сайтов, откат при ошибке.

Блок, который добавляет скрипт:

```
aquamarines-demo.webik.tech {
	root * /data/demo/aquamarines
	encode zstd gzip
	header X-Robots-Tag "noindex, nofollow"
	file_server
	handle_errors {
		rewrite * /404.html
		file_server
	}
}
```

**Обязательно:** Caddyfile на сервере — копия из репозитория sakhuslugi. Новые блоки демо переносите в этот репозиторий, иначе следующий деплой sakhuslugi их сотрёт и демо перестанут открываться.

Конфиг на машине сотрудника — в `references/deploy.md` скилла, раздел «Конфиг демо-сервера».

## Схема 2: отдельный сервер с nginx и wildcard-сертификатом

Если демо переедут на отдельный VPS, новый проект не будет требовать настройки сервера вообще: nginx находит папку по поддомену. В конфиге тогда нет блока `caddy`.

### DNS

```
demo.example.ru     A   <IP>
*.demo.example.ru   A   <IP>
```

### Пользователь для выкладки

```bash
sudo adduser --disabled-password deploy
sudo mkdir -p /var/www/demo
sudo chown deploy:deploy /var/www/demo
# публичные SSH-ключи сотрудников — в /home/deploy/.ssh/authorized_keys
```

Вход только по ключам, пользователь `deploy` пишет только в `/var/www/demo`.

### Wildcard-сертификат

Выдаётся только через DNS-проверку, certbot с плагином вашего DNS-провайдера:

```bash
sudo certbot certonly --dns-<провайдер> -d demo.example.ru -d '*.demo.example.ru'
```

### nginx

```nginx
server {
    listen 80;
    server_name demo.example.ru *.demo.example.ru;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name ~^(?<project>[a-z0-9-]+)\.demo\.example\.ru$;

    ssl_certificate     /etc/letsencrypt/live/demo.example.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/demo.example.ru/privkey.pem;

    root /var/www/demo/$project;
    index index.html;
    add_header X-Robots-Tag "noindex, nofollow" always;

    location / {
        try_files $uri $uri/ =404;
    }

    location /_astro/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

    error_page 404 /404.html;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/demo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Конфиг сотрудника для этой схемы:

```json
{
  "demo": {
    "host": "<IP>",
    "user": "deploy",
    "root": "/var/www/demo",
    "url_template": "https://{slug}.demo.example.ru"
  }
}
```

## SSH-ключ сотрудника

PowerShell (в нём нет `ssh-copy-id`), спросит пароль один раз:

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" | ssh root@<host> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Git Bash, Linux, macOS: `ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<host>`.

Проверка: `ssh -o BatchMode=yes root@<host> "echo ok"`.
