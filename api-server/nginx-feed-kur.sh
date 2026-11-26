#!/bin/bash
# /feed/ yolunu Node API'ye yönlendirir (Meta/Google ürün XML feed'i). Idempotent.
# "location ^~ /feed/" kullanılır: düzenli ifade (regex) bloklarından (ör. *.xml statik/önbellek kuralı) ÖNCE gelir.
set -e
# /api konumu hangi dosyadaysa (site conf'u ya da snippet) feed bloğu oraya eklenir
CONF=$(grep -lsE "location[[:space:]]+(\^~[[:space:]]+)?/api/?[[:space:]]*\{" /etc/nginx/sites-enabled/* /etc/nginx/snippets/* /etc/nginx/conf.d/* 2>/dev/null | grep -v yedek | head -1)
if [ -z "$CONF" ]; then
  echo "location /api bulunamadı. Mevcut proxy satırları:"; grep -rn "proxy_pass\|location" /etc/nginx/sites-enabled/ /etc/nginx/snippets/ 2>/dev/null | head -40; exit 1
fi
echo "Ayar dosyası: $CONF"
UPSTREAM=$(grep -oE "proxy_pass[[:space:]]+[^;]+" "$CONF" | head -1 | awk '{print $2}')
[ -z "$UPSTREAM" ] && UPSTREAM="http://127.0.0.1:3001"
echo "API adresi: $UPSTREAM"
cp "$CONF" "/root/nginx-feed-oncesi-$(date +%Y%m%d-%H%M%S).conf"
python3 - "$CONF" "$UPSTREAM" <<'PY'
import sys, re
yol, up = sys.argv[1], sys.argv[2].rstrip('/')
if '/api' in up: up = up.split('/api')[0]
s = open(yol).read()
# eski (öncelik sorunlu) /feed/ bloklarını kaldır
s = re.sub(r'[ \t]*location\s+(\^~\s+)?/feed/\s*\{[^}]*\}\n?', '', s)
blok = ("    location ^~ /feed/ {\n        proxy_pass " + up + ";\n        proxy_set_header Host $host;\n"
        "        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n")
# her server bloğunda /api konumundan önce ekle (http ve https blokları)
parcalar = re.split(r'(?=[ \t]*location\s+(?:\^~\s+)?/api/?\s*\{)', s)
if len(parcalar) < 2: raise SystemExit('location /api bulunamadı')
s = parcalar[0] + ''.join(blok + p for p in parcalar[1:])
open(yol, 'w').write(s)
print('feed bloğu yazıldı:', yol, '·', s.count('location ^~ /feed/'), 'adet')
PY
if nginx -t; then systemctl reload nginx; else
  echo "nginx testi başarısız — yedek geri yükleniyor"; cp "$(ls -t /root/nginx-feed-oncesi-*.conf | head -1)" "$CONF"; nginx -t && systemctl reload nginx; exit 1
fi
sleep 1
echo "API doğrudan: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/feed/urunler.xml)"
echo "Dışarıdan:    $(curl -s -o /dev/null -w '%{http_code}' https://olivamore.com/feed/urunler.xml)"
echo "Ürün sayısı:  $(curl -s https://olivamore.com/feed/urunler.xml | grep -c '<item>')"
echo "FEED-TAMAM"
