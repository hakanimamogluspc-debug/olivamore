#!/bin/bash
# ============================================================
# Eski WordPress verisini yeni siteye aktarir (wp-donustur.py ciktisi).
# Kullanim:  bash wp-aktar.sh /root/wp-aktarim.json
#  - Once yedek alir. Tekrar calistirilabilir: ayni WC- siparisler guncellenir, kopya olusmaz.
#  - Siparisler: eski kayit olarak eklenir (fatura/kargo/e-posta/Meta otomasyonlarina GIRMEZ, stok dusulmez)
#  - Uyeler: yeni sitede zaten kayitli olan e-posta atlanir; digerleri "sifre belirle" durumunda eklenir
#  - Bulten: yalniz acik onayli aboneler; hos geldin e-postasi GONDERILMEZ
# ============================================================
set -e
DOSYA="${1:-/root/wp-aktarim.json}"
VERI=${OM_DATA:-/var/www/olivamore-data}
[ -f "$DOSYA" ] || { echo "HATA: $DOSYA yok"; exit 1; }
T=$(date +%Y%m%d-%H%M%S)
YD=${YEDEK_DIZIN:-/root/yedekler}; mkdir -p "$YD"
tar -czf "$YD/wp-aktarim-oncesi-$T.tar.gz" -C "$VERI" siparisler.json uyeler.json bulten.json 2>/dev/null || true
echo "Yedek: $YD/wp-aktarim-oncesi-$T.tar.gz"
node - "$DOSYA" "$VERI" <<'EOF'
const fs = require('fs'), path = require('path');
const [dosya, VERI] = process.argv.slice(2);
const oku = (ad, vars) => { try { return JSON.parse(fs.readFileSync(path.join(VERI, ad), 'utf8')); } catch (e) { return vars; } };
const yaz = (ad, v) => { const p = path.join(VERI, ad); fs.writeFileSync(p + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(p + '.tmp', p); };
const a = JSON.parse(fs.readFileSync(dosya, 'utf8'));

// Siparisler
const sip = oku('siparisler.json', []);
const gelenNo = new Set(a.siparisler.map(s => s.no));
const kalan = sip.filter(s => !gelenNo.has(s.no));
const guncellenen = sip.length - kalan.length;
const tum = kalan.concat(a.siparisler).sort((x, y) => String(y.tarih || '').localeCompare(String(x.tarih || '')));
yaz('siparisler.json', tum);
console.log('Siparis: ' + a.siparisler.length + ' aktarildi (' + guncellenen + ' tanesi onceki aktarimdan guncellendi) · toplam ' + tum.length);

// Uyeler
const uye = oku('uyeler.json', []);
const varolan = new Set(uye.map(u => u.eposta));
let eklenenUye = 0, atlananUye = 0;
a.uyeler.forEach(u => {
  if (varolan.has(u.eposta)) {
    const mevcut = uye.find(x => x.eposta === u.eposta);
    // Onceki aktarimdan gelip hala sifre belirlememis kayit → guncelle; yeni sitede kayitli kisi → dokunma
    if (mevcut.kaynak === 'wordpress' && mevcut.sifreYok) { Object.assign(mevcut, u, { oturumlar: mevcut.oturumlar || [] }); }
    else atlananUye++;
    return;
  }
  uye.push(u); varolan.add(u.eposta); eklenenUye++;
});
yaz('uyeler.json', uye);
console.log('Uye: ' + eklenenUye + ' eklendi, ' + atlananUye + ' zaten yeni sitede kayitli oldugu icin atlandi');

// Bulten
const bl = oku('bulten.json', []);
const blSet = new Set(bl.map(x => (x.eposta || '').toLowerCase()));
let eklenenBl = 0;
a.bulten.forEach(x => { if (!blSet.has(x.eposta)) { bl.push(x); blSet.add(x.eposta); eklenenBl++; } });
yaz('bulten.json', bl);
console.log('Bulten: ' + eklenenBl + ' abone eklendi · toplam ' + bl.length);
EOF
chown www-data:www-data "$VERI"/siparisler.json "$VERI"/uyeler.json "$VERI"/bulten.json 2>/dev/null || true
echo "WP-AKTARIM-TAMAM"
echo "Kisisel veri iceren aktarim dosyasini silmeyi unutma:  rm $DOSYA"
