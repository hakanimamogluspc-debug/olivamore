#!/bin/bash
# olivamore.com'daki marka gorsellerini olivamore.de'ye indirir (kendi varliklarimiz)
set -e
HEDEF=/var/www/olivamore/assets/img/marka
mkdir -p "$HEDEF"
cd "$HEDEF"

indir() { wget -q -O "$2" "$1" && echo "ok  $2" || echo "HATA $2"; }

indir "https://olivamore.com/wp-content/uploads/2026/06/Webslider-2048.png" hero-kaynak.png
indir "https://olivamore.com/wp-content/uploads/2024/12/divider-olive.svg" divider-olive.svg
indir "https://olivamore.com/wp-content/uploads/2024/12/amblem-koyu.svg" amblem-koyu.svg
indir "https://olivamore.com/wp-content/uploads/2025/03/cografi-isaret-urun.svg" rozet-cografi.svg
indir "https://olivamore.com/wp-content/uploads/2025/03/surdurulebilirtarim.svg" rozet-surdurulebilir.svg
indir "https://olivamore.com/wp-content/uploads/2025/03/Soguksikim.svg" rozet-soguksikim.svg
indir "https://olivamore.com/wp-content/uploads/2025/03/yuzdeyuz_dogal.svg" rozet-dogal.svg
indir "https://olivamore.com/wp-content/uploads/2025/04/iso-9001.svg" iso-9001.svg
indir "https://olivamore.com/wp-content/uploads/2025/04/iso-14001.svg" iso-14001.svg
indir "https://olivamore.com/wp-content/uploads/2025/04/iso-22000.svg" iso-22000.svg
indir "https://olivamore.com/wp-content/uploads/2025/04/analiz-raporu.svg" analiz-raporu.svg
indir "https://olivamore.com/wp-content/uploads/2025/04/olivamore_yemekgorseli_526x788px.jpg" marka-yemek.jpg
indir "https://olivamore.com/wp-content/uploads/2025/04/olivamore_sisegorseli_526x788px.jpg" marka-sise.jpg

# Hero: PNG cok agir; web icin jpg'e cevir
if command -v convert >/dev/null; then
  convert hero-kaynak.png -resize 2048x -quality 80 hero-zeytinlik.jpg && rm -f hero-kaynak.png
  echo "ok  hero-zeytinlik.jpg (jpg'e cevrildi)"
else
  mv hero-kaynak.png hero-zeytinlik.jpg
  echo "uyari: convert yok, png oldugu gibi kullanildi"
fi
ls -la "$HEDEF"
echo "MARKA-GORSELLER-TAMAM"
