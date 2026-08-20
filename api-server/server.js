/* ============================================================
   OLIVAMORE API — bağımlılıksız Node.js servisi
   Portu: 127.0.0.1:3001 (yalnız nginx üzerinden erişilir)
   Veri: /var/www/olivamore-data/*.json (webroot DIŞI)

   Uçlar:
   Halka açık:
     GET  /api/config          → CMS içeriği (panelin kaydettiği JSON)
     POST /api/iletisim        → iletişim formu {ad,eposta,konu,mesaj}
     POST /api/bulten          → bülten kaydı {eposta}
     POST /api/siparis         → sipariş {musteri:{...}, odeme, kalemler:[...], toplam}
   Yönetici (nginx basic auth arkasında):
     POST /api/admin/config    → CMS içeriğini kaydet
     GET  /api/admin/siparisler
     POST /api/admin/siparis-durum {no, durum}
     GET  /api/admin/mesajlar
     GET  /api/admin/bulten

   Brevo SMTP anahtarı eklenince e-posta bildirimi de gönderilecek:
   /var/www/olivamore-data/env.json → {"brevoKey":"...","bildirimEposta":"..."}
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const DATA = process.env.OM_DATA || '/var/www/olivamore-data';

/* ---------- dosya yardımcıları (atomik yazma) ---------- */
function dosya(ad) { return path.join(DATA, ad); }
function oku(ad, vars) {
  try { return JSON.parse(fs.readFileSync(dosya(ad), 'utf8')); }
  catch (e) { return vars; }
}
function yaz(ad, veri) {
  const tmp = dosya(ad + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(veri, null, 1));
  fs.renameSync(tmp, dosya(ad));
}

/* ---------- yanıt yardımcıları ---------- */
function json(res, kod, veri) {
  const g = JSON.stringify(veri);
  res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(g);
}
function govde(req, limitMB) {
  return new Promise((cozul, hata) => {
    let boyut = 0, parcalar = [];
    req.on('data', p => {
      boyut += p.length;
      if (boyut > limitMB * 1024 * 1024) { hata(new Error('çok büyük')); req.destroy(); return; }
      parcalar.push(p);
    });
    req.on('end', () => {
      try { cozul(JSON.parse(Buffer.concat(parcalar).toString('utf8') || '{}')); }
      catch (e) { hata(new Error('geçersiz JSON')); }
    });
    req.on('error', hata);
  });
}
function temiz(s, max) { return String(s || '').slice(0, max || 500).trim(); }

/* Kupon doğrulama + indirim hesabı (fiyatlar KDV hariç net üzerinden) */
function kuponUygula(kupon, kalemler, cfg) {
  if (!kupon || kupon.aktif === false) return { hata: 'Kupon kodu geçersiz.' };
  const simdi = Date.now();
  if (kupon.baslangic && simdi < Date.parse(kupon.baslangic)) return { hata: 'Kupon henüz başlamadı.' };
  if (kupon.bitis && simdi > Date.parse(kupon.bitis) + 86399000) return { hata: 'Kuponun süresi dolmuş.' };
  const limit = parseInt(kupon.limit, 10) || 0;
  if (limit > 0 && (kupon.kullanildi || 0) >= limit) return { hata: 'Kupon kullanım limitine ulaştı.' };
  const urunler = (cfg && cfg.products) || [];
  const bul = ad => urunler.find(p => (p.nameTR && ad.indexOf(p.nameTR) === 0) || (p.nameEN && ad.indexOf(p.nameEN) === 0));
  let uygunNet = 0, toplamNet = 0;
  (kalemler || []).forEach(k => {
    const net = k.fiyat * k.adet;
    toplamNet += net;
    let uygun = true;
    if (kupon.kapsam === 'rol') { const p = bul(k.ad); uygun = !!(p && (kupon.roller || []).indexOf(p.role) !== -1); }
    else if (kupon.kapsam === 'urun') { const p = bul(k.ad); uygun = !!(p && (kupon.urunler || []).indexOf(p.id) !== -1); }
    if (uygun) uygunNet += net;
  });
  if (uygunNet <= 0) return { hata: 'Kupon sepetteki ürünlerde geçerli değil.' };
  const min = parseFloat(kupon.min) || 0;
  if (min > 0 && toplamNet < min) return { hata: 'Bu kupon en az ₺' + min + ' sepette geçerli.' };
  const deger = parseFloat(kupon.deger) || 0;
  let indirim = kupon.tip === 'tutar' ? Math.min(deger, uygunNet) : uygunNet * deger / 100;
  indirim = Math.round(indirim * 100) / 100;
  if (indirim <= 0) return { hata: 'Kupon indirimi hesaplanamadı.' };
  return { indirim: indirim, ucretsizKargo: !!kupon.ucretsizKargo };
}
function epostaMi(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || ''); }

/* ---------- basit hız sınırı (IP başına dakikada 30 POST) ---------- */
const sayac = new Map();
setInterval(() => sayac.clear(), 60000);
function hizAsimi(req) {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '?';
  const n = (sayac.get(ip) || 0) + 1;
  sayac.set(ip, n);
  return n > 30;
}

/* ---------- sunucu ---------- */
const sunucu = http.createServer(async (req, res) => {
  const yol = (req.url || '').split('?')[0];

  try {
    /* ---- halka açık ---- */
    if (req.method === 'GET' && yol === '/api/config') {
      return json(res, 200, oku('cms.json', {}));
    }

    if (req.method === 'POST' && hizAsimi(req)) {
      return json(res, 429, { hata: 'Çok fazla istek; bir dakika sonra tekrar dene.' });
    }

    if (req.method === 'POST' && yol === '/api/iletisim') {
      const g = await govde(req, 1);
      if (!temiz(g.ad, 120) || !epostaMi(g.eposta) || !temiz(g.mesaj, 4000)) {
        return json(res, 400, { hata: 'Ad, geçerli e-posta ve mesaj zorunlu.' });
      }
      const liste = oku('mesajlar.json', []);
      liste.unshift({
        tarih: new Date().toISOString(), ad: temiz(g.ad, 120), eposta: temiz(g.eposta, 200),
        konu: temiz(g.konu, 200), mesaj: temiz(g.mesaj, 4000), okundu: false
      });
      yaz('mesajlar.json', liste.slice(0, 2000));
      epostaBildir('Yeni iletişim mesajı: ' + temiz(g.konu, 200), temiz(g.ad, 120) + ' <' + g.eposta + '>\n\n' + temiz(g.mesaj, 4000));
      return json(res, 200, { tamam: true });
    }

    if (req.method === 'POST' && yol === '/api/bulten') {
      const g = await govde(req, 1);
      if (!epostaMi(g.eposta)) return json(res, 400, { hata: 'Geçerli bir e-posta gir.' });
      const liste = oku('bulten.json', []);
      if (!liste.find(x => x.eposta === g.eposta)) {
        liste.unshift({ tarih: new Date().toISOString(), eposta: temiz(g.eposta, 200), kaynak: temiz(g.kaynak, 60) });
        yaz('bulten.json', liste.slice(0, 20000));
      }
      return json(res, 200, { tamam: true });
    }

    if (req.method === 'POST' && yol === '/api/kupon') {
      const g = await govde(req, 1);
      const kod = temiz(g.kod, 40).toUpperCase();
      const cfg = oku('cms.json', {});
      const kp = (cfg.coupons || []).find(c => (c.kod || '').toUpperCase() === kod);
      const kal = Array.isArray(g.kalemler) ? g.kalemler.slice(0, 50).map(k => ({
        ad: temiz(k.ad, 200), fiyat: Math.max(0, parseFloat(k.fiyat) || 0),
        adet: Math.min(99, Math.max(1, parseInt(k.adet, 10) || 1))
      })) : [];
      const s = kuponUygula(kp, kal, cfg);
      if (s.hata) return json(res, 200, { gecerli: false, mesaj: s.hata });
      return json(res, 200, { gecerli: true, indirim: s.indirim, ucretsizKargo: s.ucretsizKargo, mesaj: 'Kupon uygulandı.' });
    }

    if (req.method === 'POST' && yol === '/api/siparis') {
      const g = await govde(req, 1);
      const m = g.musteri || {};
      if (!temiz(m.ad, 120) || !epostaMi(m.eposta) || !temiz(m.telefon, 40) || !temiz(m.adres, 1000)) {
        return json(res, 400, { hata: 'Ad, e-posta, telefon ve adres zorunlu.' });
      }
      if (!Array.isArray(g.kalemler) || !g.kalemler.length || g.kalemler.length > 50) {
        return json(res, 400, { hata: 'Sepet boş.' });
      }
      const kalemler = g.kalemler.map(k => ({
        ad: temiz(k.ad, 200), fiyat: Math.max(0, parseInt(k.fiyat, 10) || 0),
        adet: Math.min(99, Math.max(1, parseInt(k.adet, 10) || 1)), img: temiz(k.img, 300),
        kdv: Math.min(20, Math.max(0, parseFloat(k.kdv) || 1))
      }));
      // Fiyatlar KDV HARİÇ sabittir; KDV oranına göre üzerine eklenir
      const araToplam = kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0);
      // Kupon (sunucu tarafında doğrulanır; kullanım sayacı artar)
      let indirim = 0, kargoBedava = false, kuponBilgi = null;
      const kuponKod = temiz(g.kupon, 40).toUpperCase();
      if (kuponKod) {
        const cfg = oku('cms.json', {});
        const kp = (cfg.coupons || []).find(c => (c.kod || '').toUpperCase() === kuponKod);
        const s = kuponUygula(kp, kalemler, cfg);
        if (!s.hata) {
          indirim = s.indirim; kargoBedava = s.ucretsizKargo;
          kuponBilgi = { kod: kuponKod, indirim: indirim };
          kp.kullanildi = (kp.kullanildi || 0) + 1;
          yaz('cms.json', cfg);
        }
      }
      const indirimliAra = Math.max(0, Math.round((araToplam - indirim) * 100) / 100);
      const oran = araToplam > 0 ? indirimliAra / araToplam : 1;
      const kdvToplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet * oran * k.kdv / 100, 0) * 100) / 100;
      const kargo = (kargoBedava || indirimliAra >= 500) ? 0 : 80; // [KARGO AYARI]
      const toplam = Math.round((indirimliAra + kdvToplam + kargo) * 100) / 100;
      const durum = oku('sayac.json', { son: 1000 });
      durum.son++;
      yaz('sayac.json', durum);
      const no = 'OM-' + durum.son;
      const siparisler = oku('siparisler.json', []);
      siparisler.unshift({
        no: no, tarih: new Date().toISOString(), durum: 'yeni',
        odeme: temiz(g.odeme, 40) || 'havale',
        musteri: { ad: temiz(m.ad, 120), eposta: temiz(m.eposta, 200), telefon: temiz(m.telefon, 40), adres: temiz(m.adres, 1000), not: temiz(m.not, 500) },
        kalemler: kalemler, araToplam: araToplam, kupon: kuponBilgi, indirim: indirim, kdvToplam: kdvToplam, kargo: kargo, toplam: toplam
      });
      yaz('siparisler.json', siparisler.slice(0, 5000));
      epostaBildir('Yeni sipariş ' + no + ' · ₺' + toplam.toLocaleString('tr-TR'),
        kalemler.map(k => k.adet + ' × ' + k.ad + ' (₺' + k.fiyat + ')').join('\n') +
        (kuponBilgi ? '\n\nKupon: ' + kuponBilgi.kod + ' (-₺' + indirim + ')' : '') +
        '\n\nMüşteri: ' + m.ad + ' / ' + m.telefon + ' / ' + m.eposta + '\nAdres: ' + m.adres + '\nÖdeme: ' + (g.odeme || 'havale'));
      return json(res, 200, { tamam: true, no: no, toplam: toplam });
    }

    /* ---- yönetici (nginx basic auth arkasında) ---- */
    // Görsel kütüphanesi: listele / yükle / sil (dosya olarak webroot'a yazılır)
    if (req.method === 'GET' && yol === '/api/admin/gorseller') {
      try {
        const IMG_DIZIN = process.env.OM_WEB_IMG || '/var/www/olivamore/assets/img';
        const dosyalar = require('fs').readdirSync(IMG_DIZIN)
          .filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort();
        return json(res, 200, dosyalar.map(f => 'assets/img/' + f));
      } catch (e) { return json(res, 500, { hata: 'Kütüphane listelenemedi.' }); }
    }
    if (req.method === 'POST' && yol === '/api/admin/gorsel-yukle') {
      const g = await govde(req, 8);
      const ad = String(g.ad || '').toLowerCase()
        .replace(/[ğ]/g, 'g').replace(/[üu]/g, 'u').replace(/[şs]/g, 's').replace(/[ıi]/g, 'i').replace(/[öo]/g, 'o').replace(/[ç]/g, 'c')
        .replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      const m = String(g.veri || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!ad || !m) return json(res, 400, { hata: 'Geçersiz dosya.' });
      const IMG_DIZIN = process.env.OM_WEB_IMG || '/var/www/olivamore/assets/img';
      const dosya = ad + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
      try {
        require('fs').writeFileSync(require('path').join(IMG_DIZIN, dosya), Buffer.from(m[2], 'base64'));
        return json(res, 200, { tamam: true, yol: 'assets/img/' + dosya });
      } catch (e) { return json(res, 500, { hata: 'Yazılamadı (izin?).' }); }
    }
    if (req.method === 'POST' && yol === '/api/admin/gorsel-sil') {
      const g = await govde(req, 1);
      const ad = String(g.ad || '').replace(/^assets\/img\//, '');
      if (!/^[a-z0-9-_.]+\.(jpe?g|png|webp)$/i.test(ad)) return json(res, 400, { hata: 'Geçersiz ad.' });
      const IMG_DIZIN = process.env.OM_WEB_IMG || '/var/www/olivamore/assets/img';
      try { require('fs').unlinkSync(require('path').join(IMG_DIZIN, ad)); } catch (e) { }
      return json(res, 200, { tamam: true });
    }

    if (req.method === 'POST' && yol === '/api/admin/config') {
      const g = await govde(req, 8); // panel görsel yüklemeleri için geniş limit
      yaz('cms.json', g);
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'GET' && yol === '/api/admin/siparisler') {
      return json(res, 200, oku('siparisler.json', []));
    }
    if (req.method === 'POST' && yol === '/api/admin/siparis-durum') {
      const g = await govde(req, 1);
      const liste = oku('siparisler.json', []);
      const s = liste.find(x => x.no === g.no);
      if (!s) return json(res, 404, { hata: 'Sipariş bulunamadı.' });
      s.durum = temiz(g.durum, 30) || s.durum;
      if (g.kargoNo !== undefined) s.kargoNo = temiz(g.kargoNo, 60);
      yaz('siparisler.json', liste);
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'GET' && yol === '/api/admin/mesajlar') {
      return json(res, 200, oku('mesajlar.json', []));
    }
    if (req.method === 'GET' && yol === '/api/admin/bulten') {
      return json(res, 200, oku('bulten.json', []));
    }

    json(res, 404, { hata: 'Bulunamadı' });
  } catch (e) {
    json(res, 400, { hata: e.message || 'İstek işlenemedi' });
  }
});

/* ---------- e-posta bildirimi (Brevo anahtarı girilince aktifleşir) ---------- */
function epostaBildir(konu, metin) {
  const env = oku('env.json', {});
  if (!env.brevoKey || !env.bildirimEposta) return; // anahtar yoksa sessizce geç
  const veri = JSON.stringify({
    sender: { name: 'Olivamore Site', email: env.gonderen || 'site@olivamore.de' },
    to: [{ email: env.bildirimEposta }],
    subject: konu, textContent: metin
  });
  const istek = require('https').request({
    hostname: 'api.brevo.com', path: '/v3/smtp/email', method: 'POST',
    headers: { 'api-key': env.brevoKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) }
  }, r => { r.resume(); });
  istek.on('error', e => console.error('[posta]', e.message));
  istek.end(veri);
}

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
sunucu.listen(PORT, '127.0.0.1', () => console.log('Olivamore API 127.0.0.1:' + PORT + ' · veri: ' + DATA));
