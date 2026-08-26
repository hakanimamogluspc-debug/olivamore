#!/bin/bash
# ============================================================
# OLIVAMORE DEPLOY — GitHub main dalini canliya alir
# Kullanim (sunucuda): bash /root/olivamore-repo/deploy.sh
# Ilk kurulumda repoyu klonlar, sonrakilerde gunceller.
# Sunucuda panelden yuklenen gorseller SILINMEZ (rsync --delete yok).
# ============================================================
set -e
REPO=/root/olivamore-repo

command -v git >/dev/null || apt-get install -y -qq git
command -v rsync >/dev/null || apt-get install -y -qq rsync

if [ ! -d "$REPO/.git" ]; then
  echo "==> Ilk kurulum: repo klonlaniyor..."
  git clone https://github.com/hakanimamogluspc-debug/olivamore.git "$REPO"
else
  echo "==> Repo guncelleniyor..."
  git -C "$REPO" fetch origin main
  git -C "$REPO" reset --hard origin/main
fi

echo "==> Site dosyalari /var/www/olivamore icine kopyalaniyor..."
rsync -a "$REPO/olivamore-site/" /var/www/olivamore/

echo "==> Nginx temiz URL yapilandirmasi..."
mkdir -p /etc/nginx/snippets
cp "$REPO/api-server/nginx-temiz-url.conf" /etc/nginx/snippets/olivamore-temiz-url.conf
bash "$REPO/api-server/temiz-url-kur.sh"

if ! cmp -s "$REPO/api-server/server.js" /opt/olivamore-api/server.js; then
  echo "==> API degisti, guncellenip yeniden baslatiliyor..."
  cp "$REPO/api-server/server.js" /opt/olivamore-api/server.js
  systemctl restart olivamore-api
  sleep 1
  systemctl is-active olivamore-api
fi

nginx -t >/dev/null 2>&1 && systemctl reload nginx
echo "DEPLOY-TAMAM"
