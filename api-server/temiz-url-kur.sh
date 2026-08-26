#!/bin/bash
# Olivamore temiz URL kurulumu — yedek alir, conf'u gunceller, test eder, uygular
set -e
CONF=$(grep -l "server_name olivamore.de" /etc/nginx/sites-enabled/* | grep -v yedek | head -n1)
echo "Conf dosyasi: $CONF"
# Yedek nginx'in okumadigi bir yere alinir; eski hatali yedek varsa temizlenir
cp "$CONF" "/root/nginx-olivamore.yedek"
rm -f /etc/nginx/sites-enabled/*.yedek
python3 - "$CONF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "location / { try_files $uri $uri/ =404; }"
new = "include /etc/nginx/snippets/olivamore-temiz-url.conf;\n    location / { try_files $uri $uri.html $uri/ =404; }"
if "olivamore-temiz-url.conf" in s:
    print("zaten kurulu, dokunulmadi"); sys.exit(0)
# Ayni satir default blokta da olabilir; yalniz olivamore bloğundakini degistir
i = s.find("root /var/www/olivamore")
if i == -1:
    print("HATA: olivamore blogu bulunamadi"); sys.exit(1)
j = s.find(old, i)
if j == -1:
    print("HATA: try_files satiri bulunamadi"); sys.exit(1)
s = s[:j] + new + s[j+len(old):]
open(p, "w").write(s)
print("conf guncellendi")
PY
nginx -t
systemctl reload nginx
echo "TEMIZ-URL-AKTIF"
