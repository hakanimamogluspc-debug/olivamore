#!/bin/bash
# olivamore.com'daki odul madalya gorsellerini indirir.
set -e
HEDEF=/var/www/olivamore/assets/img/marka
mkdir -p "$HEDEF"
cd /tmp

wget -q -O "$HEDEF/odul-london.png"   "https://olivamore.com/wp-content/uploads/2026/05/London-IOOC-2026_quality-gold.png"
wget -q -O "$HEDEF/odul-istanbul.png" "https://olivamore.com/wp-content/uploads/2026/06/IOOC-Istanbul-2026_gold2.png"
wget -q -O "$HEDEF/odul-japan.png"    "https://olivamore.com/wp-content/uploads/2026/06/Olive-japan-gold.png"

chown www-data:www-data "$HEDEF"/odul-*.png
ls -la "$HEDEF"/odul-*.png
echo "ODUL-TAMAM"
