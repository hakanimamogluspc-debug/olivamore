# Olivamore — E-Ticaret Sitesi

Premium Ayvalık zeytinyağı markası [olivamore.de](https://olivamore.de) için statik site + hafif API.

## Yapı

- `olivamore-site/` — Statik site (HTML/CSS/JS, TR + EN). Ortak header/footer `assets/site.js` ile çizilir; içerik `panel.html` üzerinden sunucu CMS'ine (`/api/config`) yazılır.
- `api-server/server.js` — Bağımlılıksız Node.js API (port 3001): sipariş/iletişim/bülten formları, kupon doğrulama, admin config, görsel kütüphanesi. Veri `/var/www/olivamore-data/*.json`.
- `kurulum.sh` / `api-server/kurulum-api.sh` — Ubuntu 24.04 + Nginx + Let's Encrypt kurulum betikleri.

## Deploy (Hetzner)

```bash
# Site (tam kopya)
scp -r olivamore-site root@SUNUCU:/tmp/site-fresh
ssh root@SUNUCU "cp -rf /tmp/site-fresh/* /var/www/olivamore/ && chown -R www-data:www-data /var/www/olivamore && rm -rf /tmp/site-fresh"

# API
scp api-server/server.js root@SUNUCU:/opt/olivamore-api/
ssh root@SUNUCU "systemctl restart olivamore-api"
```

## Önemli notlar

- Ürün/blog/parti/kupon içeriği kodda değil, panelden yönetilir (nginx basic auth arkasında: `/panel.html`).
- Fiyatlar KDV hariçtir; KDV sepette oranına göre eklenir (panelde ürün başına ayarlanır).
- `env.json` (Brevo anahtarı), `.htpasswd` ve `olivamore-data/` sunucuda kalır, **asla commit edilmez**.
- Görsellerin ham kaynakları `Kütüphane/` klasöründedir ve repo dışıdır.
