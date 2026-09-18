#!/bin/bash
# Figma tasarimindaki gorselleri indirir (URL'ler ~7 gun gecerli, indirilince sunucuda kalici).
set -e
HEDEF=/var/www/olivamore/assets/img/marka
mkdir -p "$HEDEF"
cd /tmp
TABAN="https://www.figma.com/api/mcp/asset"

# Manset sag gorsel + Dogal Uretim doku zemini (jpg'e cevrilir)
wget -q -O manset-sag-ham.png   "$TABAN/e1be770f-ba78-4abc-aa4d-e167369b1fa1.png"
wget -q -O dogal-bg-ham.png     "$TABAN/89d7202d-046d-4b5a-a796-e6f2c7890dbe.png"
convert manset-sag-ham.png -quality 85 "$HEDEF/manset-sag.jpg"
convert dogal-bg-ham.png   -quality 85 "$HEDEF/dogal-uretim-bg.jpg"

# Gold amblem
wget -q -O "$HEDEF/amblem-gold.png" "$TABAN/4c4e92d5-6ee4-4ce9-9380-c3a99cee5aaf.png"

# Kampanya posterleri (soldan saga: Ozel, Grande, Selecto, Uc Lezzet)
wget -q -O "$HEDEF/kampanya-1.png" "$TABAN/22f99654-5e8b-4bdd-b92b-95a9b3577431.png"
wget -q -O "$HEDEF/kampanya-2.png" "$TABAN/ef92cacf-98b7-4929-a3fe-f1c41e4edb38.png"
wget -q -O "$HEDEF/kampanya-3.png" "$TABAN/40cffc4d-5c58-4865-a46d-07c99076392f.png"
wget -q -O "$HEDEF/kampanya-4.png" "$TABAN/3c715d5e-41ba-4ef8-96bd-9f59bdc39321.png"

# Avantaj paketi urun fotograflari
wget -q -O "$HEDEF/avantaj-selecto.png"  "$TABAN/de7bd47b-5b8e-48ba-9ce2-ac5a9eb6425b.png"
wget -q -O "$HEDEF/avantaj-uclezzet.png" "$TABAN/c19538f0-9520-491a-b19d-a055e2a291f7.png"
wget -q -O "$HEDEF/avantaj-ozel.png"     "$TABAN/131d5b55-77e1-4639-ad65-533f5d9a0db7.png"
wget -q -O "$HEDEF/avantaj-grande.png"   "$TABAN/5206a064-61d7-4f5f-bd01-a87992e578c7.png"

rm -f manset-sag-ham.png dogal-bg-ham.png
chown www-data:www-data "$HEDEF"/manset-sag.jpg "$HEDEF"/dogal-uretim-bg.jpg "$HEDEF"/amblem-gold.png "$HEDEF"/kampanya-*.png "$HEDEF"/avantaj-*.png
ls -la "$HEDEF" | grep -E "manset-sag|dogal-uretim|amblem-gold|kampanya|avantaj"
echo "FIGMA-VARLIK-TAMAM"
