#!/bin/bash
# urun-yukle.json'daki katalogu cms.json'a uygular (yedekli).
# - Green Ops kodu mevcut bir urune denk geliyorsa o urun GUNCELLENIR (kod korunur: ay500 vb.)
# - Denk gelmeyenler yeni urun olarak eklenir (kod = Green Ops kodu)
# - Dosyada olmayan "product" tipindeki urunler SILINMEZ, GIZLENIR (visible:false) — geri alinabilir
set -e
VERI=/var/www/olivamore-data
cp "$VERI/cms.json" "/root/cms-yedek-$(date +%Y%m%d-%H%M%S).json"
node - <<'EOF'
const fs = require('fs');
const VERI = '/var/www/olivamore-data';
const cms = JSON.parse(fs.readFileSync(VERI + '/cms.json', 'utf8'));
const satirlar = JSON.parse(fs.readFileSync('/root/olivamore-repo/api-server/urun-yukle.json', 'utf8'));
cms.products = cms.products || [];
if (cms.products.filter(p => p.type === 'product' || !p.type).length < 5) {
  console.log('DURDU: Sunucuda kayıtlı ürün listesi yok. Önce panelde Ürünler sekmesini açıp bir kez "Kaydet ve Yayınla" de, sonra bu betiği tekrar çalıştır.');
  process.exit(1);
}
const GO = {'152.04.01.01':'ay250','152.04.01.02':'ay500','152.04.01.03':'ay750','152.04.01.05':'ay2l','152.04.01.06':'ay5l','152.04.01.07':'tr250','152.04.01.10':'tr500','152.04.01.11':'tr750','152.04.01.12':'tr2l','152.04.01.13':'tr5l','152.04.01.14':'og5l','152.04.01.04':'ces-mand','152.04.02.04':'ces-bib','152.04.02.01':'ces-berg','152.04.02.02':'ces-kek','152.05.01.05':'zey-siyah','152.05.01.03':'zey-yesil'};
const var_ = p => fs.existsSync('/var/www/olivamore/' + p);
const ilk = (...l) => l.find(var_) || l[l.length - 1];
// Yeni urunler icin gorsel (sunucuda varsa marka gorseli, yoksa en yakin genel gorsel)
const YENI_GORSEL = {
  '152.05.01.06': ilk('assets/img/zeytin-siyah.jpg'),
  '152.06.01.03': ilk('assets/img/hediye-seti-3lu.jpg'),
  '152.06.01.06': ilk('assets/img/marka/avantaj-ozel.png', 'assets/img/hediye-seti-3lu.jpg'),
  '152.06.01.21': ilk('assets/img/marka/avantaj-selecto.png', 'assets/img/hediye-seti-5li.jpg'),
  '152.06.01.08': ilk('assets/img/marka/avantaj-uclezzet.png', 'assets/img/foto-trilye-tenekeler.jpg'),
  '152.06.01.13': ilk('assets/img/marka/avantaj-grande.png', 'assets/img/foto-ayvalik-tenekeler.jpg')
};
const birim = u => { u = String(u || '').trim(); return !u ? '' : (u.indexOf('/') === 0 ? u : '/ ' + u); };
const islenen = new Set(); let guncel = 0, yeni = 0;
for (const r of satirlar) {
  const kod = String(r.id).trim();
  const hedefId = (GO[kod] && cms.products.find(p => p.id === GO[kod])) ? GO[kod] : kod;
  let p = cms.products.find(x => x.id === hedefId);
  if (!p) {
    p = { id: hedefId, type: 'product', img: YENI_GORSEL[kod] || '', galeri: [], href: '', featured: 0 };
    cms.products.push(p); yeni++;
  } else guncel++;
  p.nameTR = String(r.nameTR).trim();
  p.nameEN = String(r.nameEN || r.nameTR).trim();
  p.noteTR = String(r.noteTR || '').trim();
  p.noteEN = String(r.noteEN || '').trim();
  p.price = Number(r.price) || 0;           // KDV DAHIL satis fiyati
  p.unitTR = birim(r.unitTR); p.unitEN = birim(r.unitEN || r.unitTR);
  p.kdv = r.kdv === '' ? 1 : Number(r.kdv);
  p.role = String(r.role || '').trim();
  p.badgeTR = String(r.badgeTR || '').trim(); p.badgeEN = String(r.badgeEN || '').trim();
  if (r.stok !== '' && r.stok !== null) p.stok = Math.max(0, parseInt(r.stok, 10) || 0); else delete p.stok;
  p.visible = !/^(hay[ıi]r|no|0|false)$/i.test(String(r.visible || 'Evet').trim());
  p.stokKodu = String(r.stokKodu || kod).trim();
  islenen.add(p.id);
}
let gizlenen = [];
for (const p of cms.products) {
  if ((p.type === 'product' || !p.type) && !islenen.has(p.id) && p.visible !== false) { p.visible = false; gizlenen.push(p.id); }
}
fs.writeFileSync(VERI + '/cms.json', JSON.stringify(cms, null, 2));
console.log('guncellenen:', guncel, '| yeni:', yeni, '| gizlenen:', gizlenen.length ? gizlenen.join(', ') : 'yok');
const gorselsiz = cms.products.filter(p => p.visible !== false && !p.img).map(p => p.id);
console.log('gorseli eksik:', gorselsiz.length ? gorselsiz.join(', ') : 'yok');
EOF
echo "URUN-YUKLE-TAMAM (yedek: /root/cms-yedek-*.json)"
