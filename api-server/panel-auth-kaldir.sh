#!/bin/bash
# Token'lı giriş doğrulandıktan SONRA çalıştır: /panel'deki eski nginx basic auth kaldırılır.
set -e
CONF=$(grep -ls "auth_basic" /etc/nginx/sites-enabled/* /etc/nginx/snippets/olivamore-temiz-url.conf 2>/dev/null | grep -v yedek | head -1)
if [ -z "$CONF" ]; then echo "auth_basic bulunamadı; zaten kaldırılmış olabilir."; exit 0; fi
cp "$CONF" /root/nginx-panel-auth.yedek
python3 - "$CONF" <<'PY'
import sys, re
yol = sys.argv[1]
s = open(yol).read()
s2 = re.sub(r'^[ \t]*auth_basic[^;]*;\n', '', s, flags=re.M)
open(yol, 'w').write(s2)
print('auth_basic satırları kaldırıldı:', yol)
PY
nginx -t && systemctl reload nginx
echo "AUTH-KALDIRILDI — panel artık yalnız kendi giriş sayfasını kullanıyor (yedek: /root/nginx-panel-auth.yedek)"
