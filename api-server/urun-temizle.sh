#!/bin/bash
# Cift kayit temizligi: ayni Green Ops stok koduna sahip GIZLI 152.* kopyalari,
# gorunur esine (ay750 vb.) galeri/gorselini aktarip siler. Yedekli.
set -e
VERI=/var/www/olivamore-data
cp "$VERI/cms.json" "/root/cms-yedek-temizle-$(date +%Y%m%d-%H%M%S).json"
node - <<'EOF'
const fs = require('fs');
const F = '/var/www/olivamore-data/cms.json';
const cms = JSON.parse(fs.readFileSync(F, 'utf8'));
const urunler = cms.products || [];
const silinecek = new Set();
for (const kopya of urunler) {
  if (kopya.visible !== false || !/^152\./.test(kopya.id)) continue;
  const es = urunler.find(p => p !== kopya && p.visible !== false && (p.stokKodu === kopya.id || p.stokKodu === kopya.stokKodu));
  if (!es) continue;
  // Panelde eklenmis galeri gorsellerini kaybetme
  const galeri = new Set([...(es.galeri || []), ...(kopya.galeri || [])]);
  es.galeri = [...galeri].filter(g => g && g !== es.img);
  if (!es.img && kopya.img) es.img = kopya.img;
  if (!es.featured && kopya.featured) es.featured = kopya.featured;
  silinecek.add(kopya.id);
  console.log(kopya.id, '->', es.id, '(birlestirildi)');
}
cms.products = urunler.filter(p => !silinecek.has(p.id));
// Ana sayfa siralarini gercek urun id'lerine cevir
const idBul = id => { const p = cms.products.find(x => x.id === id) || cms.products.find(x => x.stokKodu === id && x.visible !== false); return p ? p.id : id; };
(cms.anasayfaSiralari || []).forEach(s => { s.urunler = (s.urunler || []).map(idBul); });
fs.writeFileSync(F, JSON.stringify(cms, null, 2));
console.log('silinen kopya:', silinecek.size, '| gorunur urun:', cms.products.filter(p => p.visible !== false && (p.type === 'product' || !p.type)).length);
console.log('gizli kalan:', cms.products.filter(p => p.visible === false && (p.type === 'product' || !p.type)).map(p => p.id).join(', ') || 'yok');
EOF
echo "URUN-TEMIZLE-TAMAM"
