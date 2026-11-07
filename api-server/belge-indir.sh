#!/bin/bash
# Kalite sayfasindaki PDF belgeleri eski WordPress'ten yeni sunucuya kopyalar (gecisten ONCE calistir)
set -e
D=/var/www/olivamore/assets/belgeler
mkdir -p "$D"
curl -fsSL -o "$D/deppo-analiz-raporu-2505969.pdf" "https://olivamore.com/wp-content/uploads/2025/04/2505969-PEKTAS-TARIM-Trilye-Erken-Hasat-Soguk-Sikim-Naturel-Sizma-Zeytinyagi-TREN.pdf"
curl -fsSL -o "$D/ayvalik-cografi-isaret.pdf" "https://olivamore.com/wp-content/uploads/2026/02/Cografi-isaret.pdf"
chown -R www-data:www-data "$D"
ls -lh "$D"
echo "BELGE-TAMAM"
