#!/bin/bash
# Eski WordPress kuponlarini panele ekler (ayni kod varsa dokunmaz). Kullanim: bash kupon-aktar.sh /root/kupon-aktarim.json
set -e
DOSYA="${1:-/root/kupon-aktarim.json}"; CMS=/var/www/olivamore-data/cms.json
[ -f "$DOSYA" ] || { echo "HATA: $DOSYA yok"; exit 1; }
cp "$CMS" "/root/cms-kupon-oncesi-$(date +%Y%m%d-%H%M).json"
node - "$DOSYA" "$CMS" <<'JS'
const fs=require('fs'); const [d,c]=process.argv.slice(2);
const yeni=JSON.parse(fs.readFileSync(d,'utf8')), cms=JSON.parse(fs.readFileSync(c,'utf8'));
const n=k=>String(k||'').replace(/\s/g,'').toLocaleUpperCase('tr');
cms.coupons=cms.coupons||[]; const var_=new Set(cms.coupons.map(x=>n(x.kod))); let ek=0, atla=0;
yeni.forEach(k=>{ if(var_.has(n(k.kod))){atla++;return;} cms.coupons.push(k); var_.add(n(k.kod)); ek++; });
fs.writeFileSync(c+'.tmp',JSON.stringify(cms,null,1)); fs.renameSync(c+'.tmp',c);
console.log('Eklenen kupon: '+ek+' · zaten vardi: '+atla+' · toplam: '+cms.coupons.length);
JS
chown www-data:www-data "$CMS"; echo "KUPON-AKTARIM-TAMAM"; echo "Aktarim dosyasini silebilirsin: rm $DOSYA"
