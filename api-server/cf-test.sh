#!/bin/bash
# Cloudflare API anahtarini dener (anahtarin kendisini EKRANA YAZMAZ)
INI=/root/.secrets/cloudflare.ini
[ -f "$INI" ] || { echo "HATA: $INI yok"; exit 1; }
echo "==> Dosya bicimi:"
SATIR=$(grep -c '^dns_cloudflare_api_token *= *[^ ]' "$INI")
echo "   'dns_cloudflare_api_token = ...' satiri: $SATIR adet (1 olmali)"
TOKEN=$(sed -n 's/^dns_cloudflare_api_token *= *//p' "$INI" | head -1 | tr -d '\r" ')
echo "   anahtar uzunlugu: ${#TOKEN} karakter (genelde 40)"
grep -q $'\r' "$INI" && echo "   UYARI: dosyada Windows satir sonu var (temizlendi sayilir)"
echo "==> Anahtar gecerli mi:"
curl -s -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify | python3 -c "import json,sys; d=json.load(sys.stdin); print('   basari:', d.get('success'), '| durum:', (d.get('result') or {}).get('status'), '| hata:', [e.get('message') for e in d.get('errors',[])])"
echo "==> olivamore.com bolgesini gorebiliyor mu (Zone:Read):"
curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones?name=olivamore.com" | python3 -c "import json,sys; d=json.load(sys.stdin); print('   basari:', d.get('success'), '| bulunan bolge:', len(d.get('result') or []), '| hata:', [e.get('message') for e in d.get('errors',[])])"
