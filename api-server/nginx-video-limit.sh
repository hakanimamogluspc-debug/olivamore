#!/bin/bash
# /api/admin/ yukleme limitini video icin 100 MB'a cikarir (bir kez calistirilir)
set -e
CONF=/etc/nginx/snippets/olivamore-api.conf
if grep -q 'client_max_body_size 100m' "$CONF"; then
  echo "zaten 100m"
else
  sed -i 's/client_max_body_size 10m;/client_max_body_size 100m;/' "$CONF"
  echo "limit 100m yapildi"
fi
nginx -t && systemctl reload nginx
echo "NGINX-VIDEO-LIMIT-TAMAM"
