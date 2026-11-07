#!/bin/bash
# ============================================================
# GECIS HAZIRLIGI (gecisten ONCE, istedigin zaman calistir — canli siteye etkisi yok)
#  1) olivamore.com + www icin SSL sertifikasini Cloudflare DNS dogrulamasiyla ONCEDEN alir
#  2) Sunucuya olivamore.com site tanimini ekler (DNS henuz eski sunucuyu gosterdigi icin kimse buraya gelmez)
#  3) Yerel testle (sunucunun kendi icinden) yeni tanimi dogrular
# Gerekli: /root/.secrets/cloudflare.ini  (dns_cloudflare_api_token = ...)
# ============================================================
set -e
REPO=/root/olivamore-repo
INI=/root/.secrets/cloudflare.ini
[ -f "$INI" ] || { echo "HATA: $INI yok. Cloudflare API anahtarini once oraya kaydet."; exit 1; }
chmod 600 "$INI"

echo "==> Certbot Cloudflare eklentisi..."
dpkg -s python3-certbot-dns-cloudflare >/dev/null 2>&1 || apt-get install -y -qq python3-certbot-dns-cloudflare

echo "==> olivamore.com sertifikasi (DNS dogrulamasi)..."
if [ ! -f /etc/letsencrypt/live/olivamore.com/fullchain.pem ]; then
  certbot certonly --dns-cloudflare --dns-cloudflare-credentials "$INI" --dns-cloudflare-propagation-seconds 30 \
    -d olivamore.com -d www.olivamore.com --non-interactive --agree-tos -m info@olivamore.com
else
  echo "sertifika zaten var"
fi

echo "==> Eski WordPress yonlendirmeleri..."
cp "$REPO/api-server/nginx-eski-site-yonlendirme.conf" /etc/nginx/snippets/olivamore-eski-site.conf

echo "==> olivamore.com site tanimi..."
cat > /etc/nginx/sites-available/olivamore.com <<'NGINX'
# olivamore.com — canli adres (gecis-hazirla.sh ile olusturuldu)
server {
    listen 443 ssl;
    server_name olivamore.com;
    root /var/www/olivamore;
    index index.html;
    ssl_certificate /etc/letsencrypt/live/olivamore.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/olivamore.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    include /etc/nginx/snippets/olivamore-api.conf;
    include /etc/nginx/snippets/olivamore-eski-site.conf;

    location = /deneyim { try_files /deneyim.html =404; }
    location = /panel.html { }

    include /etc/nginx/snippets/olivamore-temiz-url.conf;
    location / { try_files $uri $uri.html $uri/ =404; }

    location ~* \.(jpg|jpeg|png|svg|css|js|mind|mp4|webp|pdf)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/json;
}
# www → yalın adres
server {
    listen 443 ssl;
    server_name www.olivamore.com;
    ssl_certificate /etc/letsencrypt/live/olivamore.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/olivamore.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    return 301 https://olivamore.com$request_uri;
}
# http → https
server {
    listen 80;
    server_name olivamore.com www.olivamore.com;
    return 301 https://olivamore.com$request_uri;
}
NGINX
ln -sf /etc/nginx/sites-available/olivamore.com /etc/nginx/sites-enabled/olivamore.com
if ! nginx -t; then
  echo "HATA: nginx ayari gecersiz — olivamore.com tanimi geri alindi, canli site etkilenmedi."
  rm -f /etc/nginx/sites-enabled/olivamore.com /etc/nginx/snippets/olivamore-eski-site.conf
  nginx -t && exit 1
fi
systemctl reload nginx

echo "==> Yerel test (DNS'e dokunmadan, sunucunun icinden)..."
t() { curl -sk -o /dev/null -w "%{http_code} %{redirect_url}" --resolve "$1:443:127.0.0.1" "https://$1$2"; echo "   ← $1$2"; }
t olivamore.com /
t olivamore.com /koleksiyon
t olivamore.com /api/saglik
t www.olivamore.com /koleksiyon
t olivamore.com /urun/ayvalik-erken-hasat-naturel-sizma-zeytinyagi-500ml/
t olivamore.com /hakkimizda/
t olivamore.com /olivablog/
echo ""
echo "Sertifika bitis tarihi: $(openssl x509 -enddate -noout -in /etc/letsencrypt/live/olivamore.com/fullchain.pem)"
echo "Otomatik yenileme testi:"; certbot renew --dry-run --cert-name olivamore.com 2>&1 | tail -2
echo "GECIS-HAZIR"
