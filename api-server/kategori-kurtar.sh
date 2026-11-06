#!/bin/bash
# Panel kaydinda silinen alanlari /root/cms-yedek-*.json yedeklerinden geri getirir.
# - urunKategorileri: yedeklerde olup simdi olmayan kategoriler eklenir (mevcutlar degismez)
# - kategoriler / anasayfaSiralari / bloklar: simdi yoksa en yeni yedekten alinir
set -e
VERI=/var/www/olivamore-data
cp "$VERI/cms.json" "/root/cms-yedek-kurtar-$(date +%Y%m%d-%H%M%S).json"
node - <<'EOF'
const fs = require('fs');
const F = '/var/www/olivamore-data/cms.json';
const cms = JSON.parse(fs.readFileSync(F, 'utf8'));
const yedekler = fs.readdirSync('/root').filter(f => /^cms-yedek.*\.json$/.test(f))
  .map(f => '/root/' + f).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
console.log('incelenen yedek:', yedekler.length);
cms.urunKategorileri = Array.isArray(cms.urunKategorileri) ? cms.urunKategorileri : [];
const eklenen = [];
for (const y of yedekler) {
  let d; try { d = JSON.parse(fs.readFileSync(y, 'utf8')); } catch (e) { continue; }
  (d.urunKategorileri || []).forEach(k => {
    if (k && k.id && !cms.urunKategorileri.some(x => x.id === k.id)) { cms.urunKategorileri.push(k); eklenen.push(k.adTR + ' (' + k.id + ')'); }
  });
  ['kategoriler', 'anasayfaSiralari', 'bloklar'].forEach(a => {
    const bos = !cms[a] || (Array.isArray(cms[a]) && !cms[a].length);
    if (bos && d[a] && (!Array.isArray(d[a]) || d[a].length)) { cms[a] = d[a]; console.log(a, 'geri alindi <-', y); }
  });
}
fs.writeFileSync(F, JSON.stringify(cms, null, 2));
console.log('geri eklenen urun kategorisi:', eklenen.length ? eklenen.join(', ') : 'yok');
console.log('simdiki kategoriler:', cms.urunKategorileri.map(k => k.adTR).join(' | '));
// Urunlerde kullanilip listede olmayan rol var mi?
const roller = [...new Set((cms.products || []).map(p => p.role).filter(Boolean))];
const eksik = roller.filter(r => !cms.urunKategorileri.some(k => k.id === r));
if (eksik.length) console.log('UYARI: urunlerde kullanilan ama listede olmayan kategori kodlari:', eksik.join(', '));
EOF
echo "KATEGORI-KURTAR-TAMAM"
