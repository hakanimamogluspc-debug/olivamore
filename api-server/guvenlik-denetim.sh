#!/usr/bin/env bash
# Olivamore güvenlik durum tespiti — SALT OKUNUR: hiçbir ayarı değiştirmez.
# Kullanım (sunucuda): bash /root/olivamore-repo/api-server/guvenlik-denetim.sh
# Çıktıda şifre/anahtar yazdırılmaz; env.json'dan yalnız alan ADLARI listelenir.

b() { echo; echo "=== $1 ==="; }
VERI=/var/www/olivamore-data

b "Sistem"
. /etc/os-release 2>/dev/null; echo "OS: $PRETTY_NAME"; uname -r
echo "Çalışma süresi: $(uptime -p)"
echo "Bekleyen güncelleme: $(apt list --upgradable 2>/dev/null | grep -c upgradable)"
echo "Güvenlik güncellemesi: $(apt list --upgradable 2>/dev/null | grep -ci security)"
dpkg -l unattended-upgrades 2>/dev/null | grep -q ^ii && echo "unattended-upgrades: kurulu" || echo "unattended-upgrades: YOK"
[ -f /var/run/reboot-required ] && echo "Yeniden başlatma bekliyor: EVET" || echo "Yeniden başlatma bekliyor: hayır"

b "SSH"
sshd -T 2>/dev/null | grep -Ei '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|kbdinteractiveauthentication|maxauthtries|x11forwarding) '
echo "Yetkili anahtar sayısı (root): $(grep -c '^ssh-' /root/.ssh/authorized_keys 2>/dev/null || echo 0)"
echo "Son 24 saatte başarısız SSH girişi: $(journalctl -u ssh -u sshd --since '24 hours ago' 2>/dev/null | grep -ci 'failed\|invalid user')"

b "Güvenlik duvarı / koruma"
command -v ufw >/dev/null && ufw status verbose 2>/dev/null | head -20 || echo "ufw: YOK"
command -v fail2ban-client >/dev/null && fail2ban-client status 2>/dev/null || echo "fail2ban: YOK"

b "Dışarı açık portlar"
ss -tulpn 2>/dev/null | awk 'NR==1 || /LISTEN|UNCONN/' | grep -v '127.0.0.1\|::1\|127.0.0.53'

b "Süreçler (hangi kullanıcıyla çalışıyor)"
ps -eo user,pid,comm,args --sort=user | grep -E 'node|nginx|caddy|pm2' | grep -v grep | cut -c1-150

b "Web sunucusu"
command -v nginx >/dev/null && nginx -v 2>&1
command -v caddy >/dev/null && caddy version
echo "-- Güvenlik başlıkları (olivamore.com):"
curl -sI https://olivamore.com/ 2>/dev/null | grep -Ei '^(server|strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy)' || echo "(alınamadı)"
echo "-- TLS sertifika bitişi:"
echo | openssl s_client -servername olivamore.com -connect olivamore.com:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null
echo "-- Hassas yollar dışarıdan (200 olmamalı):"
for y in /.git/config /api-server/server.js /env.json /olivamore-data/cms.json /.env /panel.html; do
  echo "$y → $(curl -s -o /dev/null -w '%{http_code}' https://olivamore.com$y)"
done

b "Node"
node -v 2>/dev/null
cd /root/olivamore-repo/api-server 2>/dev/null && [ -f package.json ] && (npm audit --omit=dev 2>/dev/null | tail -5)

b "Veri dosyaları izinleri"
ls -la $VERI 2>/dev/null | head -40
echo "-- env.json alan adları (değerler gizli):"
node -e "try{const e=require('$VERI/env.json');console.log(Object.keys(e).join(', '))}catch(x){console.log('okunamadı')}"
echo "-- Herkesin okuyabildiği hassas dosya:"
find $VERI /etc/nginx -maxdepth 2 -type f \( -name '*.json' -o -name '.htpasswd' \) -perm -o+r 2>/dev/null

b "Yedekleme"
crontab -l 2>/dev/null | grep -v '^#'
ls -la /root/yedek* /var/backups/olivamore* 2>/dev/null | tail -5

b "Panel girişleri (son 7 gün)"
journalctl --since '7 days ago' 2>/dev/null | grep -ci 'admin.*giris\|panel.*giris' || true

b "Disk"
df -h / | tail -1
echo; echo "Bitti. Bu çıktının tamamını kopyalayıp gönder."
