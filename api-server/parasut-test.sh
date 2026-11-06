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
const g = JSON.stringify({
  grant_type: 'password',
  client_id: env.parasutClientId,
  client_secret: env.parasutClientSecret,
  username: env.parasutKullanici,
  password: env.parasutSifre,
  redirect_uri: env.parasutRedirect || 'urn:ietf:wg:oauth:2.0:oob'
});
const istek = require('https').request({
  hostname: 'api.parasut.com', path: '/oauth/token', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(g) }
}, r => {
  let p = '';
  r.on('data', d => p += d);
  r.on('end', () => {
    try {
      const v = JSON.parse(p);
      if (v.access_token) { console.log('SONUÇ: BAŞARILI ✓ (token alındı, gösterilmiyor)'); return; }
      console.log('SONUÇ: HTTP', r.statusCode, '| hata:', v.error || '-', '| açıklama:', v.error_description || '-');
    } catch (e) { console.log('SONUÇ: HTTP', r.statusCode, '| ham:', p.slice(0, 200)); }
  });
});
istek.on('error', e => console.log('BAĞLANTI HATASI:', e.message));
istek.end(g);
EOF
