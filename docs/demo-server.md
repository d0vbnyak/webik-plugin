# Настройка демо-сервера (один раз)

Схема: каждый проект живёт в своей папке `/var/www/demo/<slug>/` и открывается по своему поддомену `https://<slug>.demo.example.ru/`. Новый проект не требует настройки сервера: `/webik:demo` просто кладёт папку, а nginx сам находит её по поддомену.

Ниже `demo.example.ru` — пример, замените на ваш домен.

## 1. DNS

Две A-записи на IP демо-сервера:

```
demo.example.ru     A   <IP>
*.demo.example.ru   A   <IP>
```

## 2. Пользователь для выкладки

```bash
sudo adduser --disabled-password deploy
sudo mkdir -p /var/www/demo
sudo chown deploy:deploy /var/www/demo
# публичные SSH-ключи сотрудников — в /home/deploy/.ssh/authorized_keys
```

Пароль не нужен: вход только по ключам. Пользователь `deploy` пишет только в `/var/www/demo`.

## 3. Wildcard-сертификат

Сертификат на `*.demo.example.ru` выдаётся только через DNS-проверку. Через certbot с плагином вашего DNS-провайдера (пример для Cloudflare; для других провайдеров есть свои плагины или `--manual`):

```bash
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d demo.example.ru -d '*.demo.example.ru'
```

## 4. nginx

`/etc/nginx/sites-available/demo`:

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

    # Демо-копии клиентских сайтов не должны попадать в поиск
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

Если поддомена-проекта нет, nginx вернёт 404: папки не существует.

По желанию — закрыть демо паролем (`auth_basic`) и отдавать клиенту ссылку вместе с паролем.

## 5. Конфиг на машине сотрудника

`~/.webik/config.json` (Windows: `C:\Users\<имя>\.webik\config.json`):

```json
{
  "demo": {
    "host": "<IP или домен демо-сервера>",
    "port": 22,
    "user": "deploy",
    "root": "/var/www/demo",
    "url_template": "https://{slug}.demo.example.ru"
  }
}
```

Проверка доступа: `ssh deploy@<host> ls /var/www/demo`.
