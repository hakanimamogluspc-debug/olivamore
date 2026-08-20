#!/bin/bash
# ============================================================
# OLIVAMORE — Hetzner (Ubuntu/Debian) tek komut kurulum scripti
# Kullanım: sunucuda, olivamore-site.zip ile aynı klasörde:
#   sudo bash kurulum.sh
# Ön koşul: olivamore.de ve www DNS A kayıtları bu sunucunun
# IP'sine yönlenmiş olmalı (Let's Encrypt doğrulaması için).
# ============================================================
set -e

DOMAIN="olivamore.de"
WEBROOT="/var/www/olivamore"
ZIP="olivamore-site.zip"

echo "==> Paketler kuruluyor (nginx, certbot, unzip)..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx unzip

echo "==> Site dosyaları açılıyor -> $WEBROOT"
[ -f "$ZIP" ] || { echo "HATA: $ZIP bu klasörde yok. Önce zip'i sunucuya yükle."; exit 1; }
mkdir -p "$WEBROOT"
TMP=$(mktemp -d)
unzip -oq "$ZIP" -d "$TMP"
cp -r "$TMP"/olivamore-site/* "$WEBROOT"/
rm -rf "$TMP"
chown -R www-data:www-data "$WEBROOT"

echo "==> Yönetim paneli için şifre koruması (kullanıcı: hakan)"
if [ ! -f /etc/nginx/.htpasswd ]; then
  apt-get install -y -qq apache2-utils
  echo "Panel için bir şifre belirle:"
  htpasswd -c /etc/nginx/.htpasswd hakan
fi

echo "==> Nginx site tanımı yazılıyor..."
cat > /etc/nginx/sites-available/$DOMAIN <<'NGINX'
server {
    listen 80;
    server_name olivamore.de www.olivamore.de;
    root /var/www/olivamore;
    index index.html;

    # AR deneyim sayfası kısa yolu
    location = /deneyim { try_files /deneyim.html =404; }

    # Yönetim paneli: şifre korumalı
    location = /panel.html {
        auth_basic "Olivamore Yonetim";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }

    location / { try_files $uri $uri/ =404; }

    location ~* \.(jpg|jpeg|png|svg|css|js|mind|mp4)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    gzip on;
    gzip_types text/css application/javascript image/svg+xml;
}
NGINX

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
nginx -t
systemctl reload nginx

echo "==> Let's Encrypt sertifikası alınıyor (HTTPS)..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect --non-interactive --agree-tos -m hakanimamogluspc@gmail.com || {
  echo "UYARI: certbot başarısız. DNS kayıtları henüz yayılmamış olabilir."
  echo "DNS yayıldıktan sonra tekrar dene: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect"
}

echo ""
echo "============================================"
echo "  Kurulum tamam!"
echo "  Site:    https://$DOMAIN"
echo "  AR:      https://$DOMAIN/deneyim"
echo "  Panel:   https://$DOMAIN/panel.html (şifreli)"
echo "============================================"
