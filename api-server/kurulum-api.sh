#!/bin/bash
# ============================================================
# OLIVAMORE API kurulumu (Ubuntu 24.04)
# Kullanım: server.js ile aynı klasörde → sudo bash kurulum-api.sh
# Yaptıkları: Node.js kurar, servisi /opt/olivamore-api'ye koyar,
# systemd servisi + nginx /api proxy'sini ayarlar.
# ============================================================
set -e

echo "==> Node.js kuruluyor..."
apt-get update -qq
apt-get install -y -qq nodejs

echo "==> Servis dosyaları yerleştiriliyor..."
mkdir -p /opt/olivamore-api /var/www/olivamore-data
cp server.js /opt/olivamore-api/server.js
[ -f /var/www/olivamore-data/env.json ] || echo '{"brevoKey":"","bildirimEposta":"hakanimamogluspc@gmail.com","gonderen":"site@olivamore.de"}' > /var/www/olivamore-data/env.json
chown -R www-data:www-data /var/www/olivamore-data

echo "==> systemd servisi..."
cat > /etc/systemd/system/olivamore-api.service <<'UNIT'
[Unit]
Description=Olivamore API
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/olivamore-api/server.js
User=www-data
Restart=always
RestartSec=3
Environment=OM_DATA=/var/www/olivamore-data

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now olivamore-api
sleep 1
systemctl is-active olivamore-api

echo "==> Nginx /api proxy..."
mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/olivamore-api.conf <<'NGX'
location /api/admin/ {
    auth_basic "Olivamore Yonetim";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 10m;
}
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 2m;
}
NGX
# include satırını site tanımına bir kez ekle
CONF=/etc/nginx/sites-available/olivamore.de
grep -q "olivamore-api.conf" $CONF || sed -i 's|^\(\s*\)index index.html;|\1index index.html;\n\1include /etc/nginx/snippets/olivamore-api.conf;|' $CONF
nginx -t
systemctl reload nginx

echo "==> Günlük veri yedeği (03:00, son 14 gün)..."
cat > /etc/cron.daily/olivamore-yedek <<'CRON'
#!/bin/bash
tar -czf /root/olivamore-data-$(date +%u).tar.gz -C /var/www olivamore-data
CRON
chmod +x /etc/cron.daily/olivamore-yedek

echo ""
echo "============================================"
echo "  API hazır!"
echo "  Test:   curl -s https://olivamore.de/api/config"
echo "  Servis: systemctl status olivamore-api"
echo "  Loglar: journalctl -u olivamore-api -f"
echo "  Brevo anahtarı gelince:"
echo "  nano /var/www/olivamore-data/env.json → brevoKey doldur"
echo "============================================"
