#!/usr/bin/env bash
# Olivamore — Faz 2 sunucu sertleştirme (tekrar çalıştırılabilir; her adım yedek alır ve doğrular)
# Kullanım: ssh root@46.225.219.32 "bash /root/olivamore-repo/api-server/guvenlik-sertlestir.sh"
# Yeniden başlatma YAPMAZ (sonda ayrı komutla, sakin bir saatte).
set -u
export DEBIAN_FRONTEND=noninteractive
ok()  { echo "  ✓ $1"; }
uy()  { echo "  ⚠ $1"; }
b()   { echo; echo "=== $1 ==="; }
D=/var/www/olivamore-data
SENIN_IP=$(echo "${SSH_CLIENT:-}" | awk '{print $1}')

b "1) Sistem güncellemeleri"
apt-get update -qq && apt-get -y -qq -o Dpkg::Options::=--force-confold upgrade >/dev/null && ok "paketler güncellendi" || uy "güncelleme tamamlanamadı"
apt-get -y -qq install fail2ban python3-systemd ufw >/dev/null && ok "fail2ban + ufw kurulu"

b "2) SSH: yalnız anahtarla giriş"
# Ubuntu 24.04: sshd_config.d dosyalarında İLK değer geçerli → 00- ile başlayan dosya diğerlerini (50-cloud-init) ezer
cat > /etc/ssh/sshd_config.d/00-olivamore.conf <<'SSH'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
SSH
if sshd -t 2>/dev/null; then
  (systemctl reload ssh 2>/dev/null || systemctl restart ssh) && ok "SSH şifreyle girişe kapatıldı (anahtarın çalışmaya devam eder)"
else
  rm -f /etc/ssh/sshd_config.d/00-olivamore.conf; uy "sshd yapılandırma testi başarısız — değişiklik geri alındı"
fi
sshd -T 2>/dev/null | grep -Ei '^(passwordauthentication|permitrootlogin|x11forwarding|maxauthtries) ' | sed 's/^/    /'

b "3) fail2ban (kaba kuvvet saldırılarını engeller)"
cat > /etc/fail2ban/jail.local <<JAIL
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
ignoreip = 127.0.0.1/8 ::1 ${SENIN_IP}

[sshd]
enabled  = true
maxretry = 4
bantime  = 24h

[recidive]
enabled  = true
logpath  = /var/log/fail2ban.log
backend  = auto
bantime  = 7d
findtime = 1d
maxretry = 3
JAIL
systemctl enable --now fail2ban >/dev/null 2>&1; systemctl restart fail2ban; sleep 2
fail2ban-client status sshd >/dev/null 2>&1 && ok "fail2ban aktif (senin IP'n muaf: ${SENIN_IP:-yok})" || uy "fail2ban başlamadı: journalctl -u fail2ban -n 30"

b "4) Güvenlik duvarı (yalnız 22, 80, 443)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null && ok "güvenlik duvarı açık"
ufw status | sed 's/^/    /'

b "5) Veri dosyası izinleri"
mkdir -p /root/env-eski && chmod 700 /root/env-eski
for f in env.json.bozuk env.json.yedek; do [ -f "$D/$f" ] && mv "$D/$f" /root/env-eski/ && ok "$f → /root/env-eski (artık web kullanıcısı göremez)"; done
chmod 600 /root/env-eski/* 2>/dev/null
chown -R www-data:www-data "$D"
find "$D" -type d -exec chmod 750 {} +
find "$D" -type f -exec chmod 640 {} +
ok "olivamore-data: yalnız uygulama okuyabilir (dosya 640, klasör 750)"
[ -f /etc/nginx/.htpasswd ] && chown root:www-data /etc/nginx/.htpasswd && chmod 640 /etc/nginx/.htpasswd && ok ".htpasswd 640"
chmod 700 /root/yedekler 2>/dev/null; chmod 600 /root/yedekler/* 2>/dev/null; ok "yedek arşivleri yalnız root"
# Uygulamanın yeni oluşturduğu dosyalar da herkese açık olmasın
mkdir -p /etc/systemd/system/olivamore-api.service.d
cat > /etc/systemd/system/olivamore-api.service.d/guvenlik.conf <<'UNIT'
[Service]
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
UNIT
systemctl daemon-reload && systemctl restart olivamore-api && sleep 2
systemctl is-active --quiet olivamore-api && ok "API yeniden başladı (kısıtlı mod)" || {
  uy "API başlamadı — kısıtlamalar geri alınıyor"; rm -f /etc/systemd/system/olivamore-api.service.d/guvenlik.conf
  systemctl daemon-reload; systemctl restart olivamore-api; }

b "6) Nginx: sürüm gizleme + güvenlik başlıkları"
cat > /etc/nginx/conf.d/olivamore-guvenlik.conf <<'NGX'
server_tokens off;
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;
NGX
if nginx -t 2>/dev/null; then systemctl reload nginx && ok "başlıklar eklendi"; else rm -f /etc/nginx/conf.d/olivamore-guvenlik.conf; uy "nginx testi başarısız — geri alındı"; fi
curl -sI https://olivamore.com/ | grep -Ei '^(server|strict-transport|x-frame|x-content-type|referrer-policy)' | sed 's/^/    /'

b "7) Günlük yedek (crontab'da yoktu)"
if [ -x /usr/local/bin/olivamore-yedek ]; then
  sed -i 's#chmod 644 /var/www/olivamore-data/yedek-durum.json#chown www-data:www-data /var/www/olivamore-data/yedek-durum.json; chmod 640 /var/www/olivamore-data/yedek-durum.json; chmod 600 /root/yedekler/*.tar.gz#' /usr/local/bin/olivamore-yedek
  ( crontab -l 2>/dev/null | grep -v olivamore-yedek; echo "30 3 * * * /usr/local/bin/olivamore-yedek" ) | crontab -
  /usr/local/bin/olivamore-yedek && ok "yedek alındı, her gece 03:30'a kuruldu"
  crontab -l | grep olivamore-yedek | sed 's/^/    /'
else
  uy "yedek betiği yok → bash /root/olivamore-repo/api-server/yedek-kur.sh"
fi

b "8) Son kontrol"
for u in / /koleksiyon /api/config; do echo "    https://olivamore.com$u → $(curl -s -o /dev/null -w '%{http_code}' https://olivamore.com$u)"; done
echo "    Son 10 dakikada engellenen IP: $(fail2ban-client status sshd 2>/dev/null | grep 'Currently banned' | awk '{print $NF}')"
[ -f /var/run/reboot-required ] && echo "    ⚠ Çekirdek güncellemesi için yeniden başlatma gerekiyor (sakin bir saatte: reboot — site ~1 dk kapalı)"
echo; echo "SERTLESTIRME-TAMAM"
