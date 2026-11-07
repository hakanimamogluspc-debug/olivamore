#!/bin/bash
# GERI DONUS — gecis-yap.sh'in yaptiklarini geri alir (.de yonlendirmesi + siteAdresi).
# Ardindan Cloudflare'de olivamore.com A kaydini tekrar 35.207.70.107 yap → eski WordPress geri gelir.
set -e
[ -f /root/nginx-olivamore.de-gecis-oncesi ] && cp /root/nginx-olivamore.de-gecis-oncesi /etc/nginx/sites-available/olivamore.de
python3 - <<'PY'
import json
p = '/var/www/olivamore-data/env.json'
d = json.load(open(p)); d.pop('siteAdresi', None)
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=1)
print('siteAdresi kaldirildi')
PY
chown www-data:www-data /var/www/olivamore-data/env.json 2>/dev/null || true
systemctl restart olivamore-api
nginx -t && systemctl reload nginx
echo "GERI-ALINDI — simdi Cloudflare'de A kaydini 35.207.70.107 yap."
