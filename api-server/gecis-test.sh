#!/bin/bash
# olivamore.com tanimini DNS'e dokunmadan, sunucunun icinden test eder (istedigin kadar calistirilabilir)
t() { curl -sk -o /dev/null -w "%{http_code} %{redirect_url}" --resolve "$1:443:127.0.0.1" --resolve "$1:80:127.0.0.1" "$3://$1$2"; echo "   ← $3://$1$2"; }
echo "==> Beklenen: 200"
t olivamore.com / https
t olivamore.com /koleksiyon https
t olivamore.com /api/saglik https
t olivamore.com /p?id=ay500 https
echo "==> Beklenen: 301 (yonlendirme)"
t www.olivamore.com /koleksiyon https
t olivamore.com /koleksiyon http
t olivamore.com /urun/ayvalik-erken-hasat-naturel-sizma-zeytinyagi-500ml/ https
t olivamore.com /hakkimizda/ https
t olivamore.com /kategori/dogal-zeytinler/ https
t olivamore.com /wp-content/uploads/2025/01/blog-1.jpg https
echo "==> Sertifika:"
echo | openssl s_client -connect 127.0.0.1:443 -servername olivamore.com 2>/dev/null | openssl x509 -noout -subject -enddate
echo "==> Otomatik yenileme testi (1 dakika surebilir):"
certbot renew --dry-run --cert-name olivamore.com 2>&1 | grep -iE "success|fail|error" | tail -3
echo "TEST-BITTI"
