#!/bin/bash
# /feed/ yolunu Node API'ye yönlendirir (ürün XML feed'i için). Idempotent.
set -e
CONF=$(grep -ls "proxy_pass http://127.0.0.1:3001" /etc/nginx/sites-enabled/* | grep -v yedek | head -1)
if [ -z "$CONF" ]; then echo "API proxy'li conf bulunamadı"; exit 1; fi
if grep -q "location /feed/" "$CONF"; then echo "feed zaten tanımlı: $CONF"; else
python3 - "$CONF" <<'PY'
import sys, re
yol = sys.argv[1]
s = open(yol).read()
blok = "    location /feed/ {\n        proxy_pass http://127.0.0.1:3001;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n    }\n"
m = re.search(r'([ \t]*)location\s+/api/?\s*\{', s)
if not m: raise SystemExit('location /api bulunamadı')
s = s[:m.start()] + blok + s[m.start():]
open(yol, 'w').write(s)
print('feed bloğu eklendi:', yol)
PY
fi
nginx -t && systemctl reload nginx
echo "FEED-TAMAM"
