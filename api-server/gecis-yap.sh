#!/bin/bash
# ============================================================
# GECIS GUNU — Cloudflare'de olivamore.com A kaydi 46.225.219.32 yapildiktan ve
# https://olivamore.com yeni siteyi gosterdikten SONRA calistir.
#  1) env.json → "siteAdresi": "https://olivamore.com" (e-posta, odeme, fatura, feed baglantilari)
#  2) olivamore.de → olivamore.com kalici yonlendirme (eski .de baglantilari da calismaya devam eder)
# Geri donus: bash /root/olivamore-repo/api-server/gecis-geri.sh
# ============================================================
set -e
ENV=/var/www/olivamore-data/env.json
DE=/etc/nginx/sites-available/olivamore.de
[ -f /etc/nginx/sites-enabled/olivamore.com ] || { echo "HATA: once gecis-hazirla.sh calistirilmali."; exit 1; }

echo "==> Yedekler..."
cp "$ENV" /root/env-gecis-oncesi.json
cp "$DE" /root/nginx-olivamore.de-gecis-oncesi

echo "==> siteAdresi..."
python3 - "$ENV" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d['siteAdresi'] = 'https://olivamore.com'
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=1)
print('siteAdresi =', d['siteAdresi'])
PY
chown www-data:www-data "$ENV" 2>/dev/null || true
systemctl restart olivamore-api
sleep 1; systemctl is-active olivamore-api

echo "==> olivamore.de → olivamore.com yonlendirmesi..."
python3 - "$DE" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
if 'GECIS: olivamore.com' in s:
    print('zaten yonlendiriliyor'); sys.exit(0)
i = s.find('root /var/www/olivamore;')
if i == -1: raise SystemExit('HATA: .de site blogu bulunamadi')
s = s[:i] + '# GECIS: olivamore.com canli adres oldu\n    return 301 https://olivamore.com$request_uri;\n    ' + s[i:]
open(p, 'w').write(s)
print('.de bloguna 301 eklendi')
PY
if ! nginx -t; then cp /root/nginx-olivamore.de-gecis-oncesi "$DE"; echo "HATA: nginx ayari gecersiz, .de yonlendirmesi geri alindi."; exit 1; fi
systemctl reload nginx

echo "==> Kontrol..."
curl -s -o /dev/null -w "olivamore.de/koleksiyon → %{http_code} %{redirect_url}\n" https://olivamore.de/koleksiyon
curl -s -o /dev/null -w "olivamore.com/ → %{http_code}\n" https://olivamore.com/
curl -s -o /dev/null -w "olivamore.com/api/saglik → %{http_code}\n" https://olivamore.com/api/saglik
echo "GECIS-TAMAM"
