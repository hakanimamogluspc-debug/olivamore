#!/bin/bash
# Paraşüt OAuth teşhisi: env.json'daki bilgilerle token ister, YALNIZ hata açıklamasını gösterir.
node - <<'EOF'
const fs = require('fs');
const env = JSON.parse(fs.readFileSync('/var/www/olivamore-data/env.json', 'utf8'));
const eksik = ['parasutClientId','parasutClientSecret','parasutKullanici','parasutSifre','parasutFirmaId'].filter(k => !env[k]);
if (eksik.length) { console.log('EKSİK ALANLAR:', eksik.join(', ')); process.exit(0); }
console.log('kullanici:', env.parasutKullanici.replace(/(.{3}).*(@.*)/, '$1***$2'));
console.log('clientId uzunluk:', String(env.parasutClientId).length, '| secret uzunluk:', String(env.parasutClientSecret).length, '| firmaId:', env.parasutFirmaId);
console.log('redirect:', env.parasutRedirect || 'urn:ietf:wg:oauth:2.0:oob');
function dene(ad, basliklar, govdeObj, bitti) {
  const g = new URLSearchParams(govdeObj).toString();
  basliklar['Content-Type'] = 'application/x-www-form-urlencoded';
  basliklar['Content-Length'] = Buffer.byteLength(g);
  const istek = require('https').request({ hostname: 'api.parasut.com', path: '/oauth/token', method: 'POST', headers: basliklar }, r => {
    let p = '';
    r.on('data', d => p += d);
    r.on('end', () => {
      try {
        const v = JSON.parse(p);
        if (v.access_token) console.log(ad + ': BAŞARILI ✓');
        else console.log(ad + ': HTTP', r.statusCode, '|', v.error || '-', '|', (v.error_description || '-').slice(0, 90));
      } catch (e) { console.log(ad + ': HTTP', r.statusCode, '| ham:', p.slice(0, 120)); }
      bitti();
    });
  });
  istek.on('error', e => { console.log(ad + ': BAĞLANTI HATASI', e.message); bitti(); });
  istek.end(g);
}
const temel = { grant_type: 'password', username: env.parasutKullanici, password: env.parasutSifre, redirect_uri: env.parasutRedirect || 'urn:ietf:wg:oauth:2.0:oob' };
const basic = 'Basic ' + Buffer.from(env.parasutClientId + ':' + env.parasutClientSecret).toString('base64');
dene('1-govdede-kimlik', {}, Object.assign({ client_id: env.parasutClientId, client_secret: env.parasutClientSecret }, temel), function () {
  dene('2-basic-baslik', { 'Authorization': basic }, temel, function () {
    dene('3-basic+redirectsiz', { 'Authorization': basic }, { grant_type: 'password', username: env.parasutKullanici, password: env.parasutSifre }, function () {
      console.log('--- bitti ---');
    });
  });
});
EOF
