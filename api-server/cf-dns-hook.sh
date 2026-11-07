#!/bin/bash
# Certbot DNS-01 dogrulama kancasi (Cloudflare API, dogrudan curl).
# Kullanim (certbot cagirir):  cf-dns-hook.sh ekle   |   cf-dns-hook.sh sil
# Ortam: CERTBOT_DOMAIN, CERTBOT_VALIDATION (certbot verir). Anahtar: /root/.secrets/cloudflare.ini
set -e
INI=/root/.secrets/cloudflare.ini
TOKEN=$(sed -n 's/^dns_cloudflare_api_token *= *//p' "$INI" | head -1 | tr -d '\r" ')
API=https://api.cloudflare.com/client/v4
AD="_acme-challenge.${CERTBOT_DOMAIN}"
KAYIT_DOSYA="/tmp/cf-acme-${CERTBOT_DOMAIN}.id"
ZONE=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/zones?name=olivamore.com" | python3 -c "import json,sys; print(json.load(sys.stdin)['result'][0]['id'])")

if [ "$1" = "ekle" ]; then
  ID=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$API/zones/$ZONE/dns_records" \
    --data "{\"type\":\"TXT\",\"name\":\"$AD\",\"content\":\"$CERTBOT_VALIDATION\",\"ttl\":60}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result']['id'] if d.get('success') else 'HATA:'+str(d.get('errors')))")
  case "$ID" in HATA:*) echo "$ID" >&2; exit 1;; esac
  echo "$ID" >> "$KAYIT_DOSYA"
  # Cloudflare ad sunucularina yayilmasi icin bekle
  sleep 25
elif [ "$1" = "sil" ]; then
  if [ -f "$KAYIT_DOSYA" ]; then
    while read -r ID; do
      [ -n "$ID" ] && curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$API/zones/$ZONE/dns_records/$ID" >/dev/null
    done < "$KAYIT_DOSYA"
    rm -f "$KAYIT_DOSYA"
  fi
fi
