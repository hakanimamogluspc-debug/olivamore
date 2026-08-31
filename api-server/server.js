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
const crypto = require('crypto');

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

/* Bülten çıkış linki imzası (KVKK: her e-postada listeden çıkma linki) */
function bultenImza(eposta) {
  const env = oku('env.json', {});
  if (!env.gizli) { env.gizli = crypto.randomBytes(16).toString('hex'); yaz('env.json', env); }
  return crypto.createHmac('sha256', env.gizli).update(String(eposta).toLowerCase()).digest('hex').slice(0, 20);
}

/* Kampanyayı arka planda sırayla gönderir (Brevo'yu boğmamak için 150 ms arayla) */
function kampanyaArkaplan(aboneler, konu, metin) {
  let i = 0;
  (function adim() {
    if (i >= aboneler.length) return;
    const e = aboneler[i++].eposta;
    const link = 'https://olivamore.de/api/bulten-cik?e=' + encodeURIComponent(e) + '&t=' + bultenImza(e);
    epostaGonder(e, konu, metin +
      '\n\n—\nBu e-postayı Olivamore bültenine kayıtlı olduğunuz için aldınız.\nListeden çıkmak için: ' + link);
    setTimeout(adim, 150);
  })();
}

/* ---------- e-posta otomasyonları ---------- */
function otomasyonAyar() {
  return oku('otomasyon.json', {
    sepet: { aktif: true, saat: 24, konu: 'Sepetindekiler seni bekliyor 🫒', metin: 'Merhaba,\n\nSepetinde birkaç güzel şişe kalmış. Hasat sınırlı; tükenmeden tamamlamak istersen sepetin seni bekliyor:\nhttps://olivamore.de/sepet\n\nAfiyet olsun,\nOlivamore' },
    hosgeldin: { aktif: true, konu: 'Olivamore sofrasına hoş geldin', metin: 'Merhaba,\n\nAramıza hoş geldin! Ayvalık bahçemizden sofrana uzanan yolculuğu artık birlikte izleyeceğiz. Hangi yağın sana göre olduğunu merak ediyorsan 90 saniyelik damak testimizi dene:\nhttps://olivamore.de/damak-testi\n\nAfiyet olsun,\nOlivamore' },
    tekrar: { aktif: true, gun: 35, konu: 'Şişenin dibi görünmüş olmalı 🫒', metin: 'Merhaba,\n\nSon siparişinin üzerinden bir süre geçti; yağın azalmıştır diye düşündük. Aynı hasattan stoklar sürerken tazelemek istersen:\nhttps://olivamore.de/koleksiyon\n\nAfiyet olsun,\nOlivamore' }
  });
}
function aboneVeyaUye(eposta) {
  const e = String(eposta || '').toLowerCase();
  if (oku('bulten.json', []).some(a => (a.eposta || '').toLowerCase() === e)) return true;
  return oku('uyeler.json', []).some(u => u.eposta === e);
}
function otomasyonPosta(kime, konu, metin) {
  const link = 'https://olivamore.de/api/bulten-cik?e=' + encodeURIComponent(kime) + '&t=' + bultenImza(kime);
  epostaGonder(kime, konu, metin + '\n\n—\nBu e-postayı Olivamore ile paylaştığınız adrese gönderdik.\nBenzer e-postaları almamak için: ' + link);
}
function otomasyonCalistir() {
  if (!epostaServisiVar()) return;
  const ayar = otomasyonAyar();
  const simdi = Date.now();
  // 1) Terk edilmiş sepet hatırlatması
  if (ayar.sepet && ayar.sepet.aktif) {
    const sepetler = oku('sepetler.json', []);
    let degisti = false;
    sepetler.forEach(sp => {
      const yas = simdi - Date.parse(sp.tarih);
      if (!sp.hatirlatildi && yas > (ayar.sepet.saat || 24) * 3600000 && yas < 7 * 86400000 &&
        (sp.kalemler || []).length && aboneVeyaUye(sp.eposta)) {
        const liste = sp.kalemler.map(k => '· ' + k.adet + ' × ' + k.ad).join('\n');
        otomasyonPosta(sp.eposta, ayar.sepet.konu, ayar.sepet.metin + '\n\nSepetinde:\n' + liste);
        sp.hatirlatildi = true;
        degisti = true;
      }
    });
    if (degisti) yaz('sepetler.json', sepetler);
  }
  // 2) Tekrar sipariş hatırlatması (teslim edilen siparişten N gün sonra, bir kez)
  if (ayar.tekrar && ayar.tekrar.aktif) {
    const siparisler = oku('siparisler.json', []);
    let degisti = false;
    siparisler.forEach(s => {
      if (s.tekrarMail || ['kargolandı', 'tamamlandı'].indexOf(s.durum) === -1) return;
      const yas = simdi - Date.parse(s.tarih);
      const esik = (ayar.tekrar.gun || 35) * 86400000;
      if (yas > esik && yas < esik + 30 * 86400000 && s.musteri && aboneVeyaUye(s.musteri.eposta)) {
        otomasyonPosta(s.musteri.eposta, ayar.tekrar.konu, 'Merhaba ' + s.musteri.ad + ',\n\n' + ayar.tekrar.metin.replace(/^Merhaba,?\n*/i, ''));
        s.tekrarMail = true;
        degisti = true;
      }
    });
    if (degisti) yaz('siparisler.json', siparisler);
  }
}
setInterval(otomasyonCalistir, 30 * 60000);
setTimeout(otomasyonCalistir, 20000);

/* ---------- stok takibi (cms.json içindeki ürünlerde "stok" alanı) ---------- */
function urunKaydi(cfg, ad) {
  const urunler = (cfg && cfg.products) || [];
  return urunler.find(p => (p.nameTR && ad.indexOf(p.nameTR) === 0) || (p.nameEN && ad.indexOf(p.nameEN) === 0));
}
// Yeterliyse stoğu düşer; yetersizse {hata} döner. Stok alanı olmayan ürün sınırsız sayılır.
function stokDus(kalemler) {
  const cfg = oku('cms.json', {});
  for (const k of kalemler) {
    const p = urunKaydi(cfg, k.ad);
    if (p && typeof p.stok === 'number' && p.stok < k.adet) {
      return { hata: '"' + k.ad + '" için stok yetersiz' + (p.stok > 0 ? ' (kalan: ' + p.stok + ' adet).' : ' (tükendi).') };
    }
  }
  kalemler.forEach(k => {
    const p = urunKaydi(cfg, k.ad);
    if (p && typeof p.stok === 'number') p.stok = Math.max(0, p.stok - k.adet);
  });
  yaz('cms.json', cfg);
  return {};
}
// İptal/iade/ödeme başarısız → stok geri eklenir (sipariş başına bir kez)
function stokGeriEkle(s) {
  if (!s || s.stokIade) return;
  const cfg = oku('cms.json', {});
  (s.kalemler || []).forEach(k => {
    const p = urunKaydi(cfg, k.ad);
    if (p && typeof p.stok === 'number') p.stok += k.adet;
  });
  yaz('cms.json', cfg);
  s.stokIade = true;
}

/* ---------- üye sistemi (uyeler.json) ---------- */
function sifreHashle(sifre, tuz) { return crypto.scryptSync(String(sifre), tuz, 64).toString('hex'); }
function uyeBul(req) {
  const h = String(req.headers['authorization'] || '');
  const t = h.indexOf('Bearer ') === 0 ? h.slice(7) : '';
  if (!t || t.length < 20) return null;
  const liste = oku('uyeler.json', []);
  const simdi = Date.now();
  for (const u of liste) {
    if ((u.oturumlar || []).some(o => o.token === t && o.son > simdi)) return { u: u, liste: liste, token: t };
  }
  return null;
}
function oturumAc(u) {
  const token = crypto.randomBytes(24).toString('hex');
  u.oturumlar = (u.oturumlar || []).filter(o => o.son > Date.now()).slice(-4);
  u.oturumlar.push({ token: token, son: Date.now() + 30 * 86400000 });
  return token;
}
function puanHesapla(eposta) {
  const e = String(eposta).toLowerCase();
  let harcama = 0;
  oku('siparisler.json', []).forEach(s => {
    if ((s.musteri && (s.musteri.eposta || '').toLowerCase()) === e &&
      ['iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'].indexOf(s.durum) === -1) harcama += s.toplam;
  });
  const u = oku('uyeler.json', []).find(x => x.eposta === e);
  return Math.floor(harcama * 0.02) + ((u && u.bonusPuan) || 0); // her ₺50 = 1 puan + bonuslar (yorum vb.)
}
/* Sadakat seviyeleri (panelden düzenlenir): puan eşiği → üye indirim oranı (%) */
function uyeAyar() {
  const a = oku('uye-ayar.json', {
    seviyeler: [
      { puan: 0, oran: 0, ad: 'Fidan' },
      { puan: 100, oran: 3, ad: 'Dal' },
      { puan: 250, oran: 5, ad: 'Ağaç' },
      { puan: 500, oran: 8, ad: 'Bahçe' }
    ]
  });
  if (a.yorumPuan == null) a.yorumPuan = 10;
  return a;
}
function uyeOran(u) {
  const puan = puanHesapla(u.eposta);
  let oran = 0;
  (uyeAyar().seviyeler || []).forEach(s => {
    if (puan >= (parseFloat(s.puan) || 0)) oran = Math.max(oran, parseFloat(s.oran) || 0);
  });
  if (u.ozelIndirim && parseFloat(u.ozelIndirim.oran) > oran) oran = parseFloat(u.ozelIndirim.oran);
  return Math.min(50, Math.max(0, oran));
}

/* ---------- iyzico Checkout Form (anahtar girilince aktifleşir) ----------
   env.json → iyzicoApiKey, iyzicoSecret, iyzicoCanli (true = api.iyzipay.com)
   Akış: sepette "kart" seçilir → sipariş 'odeme-bekliyor' kaydedilir →
   iyzico ödeme sayfasına yönlendirilir → callback /api/odeme-sonuc doğrular. */
function iyzicoAktif() {
  const env = oku('env.json', {});
  return !!(env.iyzicoApiKey && env.iyzicoSecret);
}
function iyziIstek(uri, veriObj) {
  return new Promise((cozul, hataVer) => {
    const env = oku('env.json', {});
    const g = JSON.stringify(veriObj);
    const rnd = String(Date.now());
    const imza = crypto.createHmac('sha256', env.iyzicoSecret).update(rnd + uri + g).digest('hex');
    const auth = 'IYZWSv2 ' + Buffer.from('apiKey:' + env.iyzicoApiKey + '&randomKey:' + rnd + '&signature:' + imza).toString('base64');
    const istek = require('https').request({
      hostname: env.iyzicoCanli ? 'api.iyzipay.com' : 'sandbox-api.iyzipay.com',
      path: uri, method: 'POST',
      headers: { 'Authorization': auth, 'x-iyzi-rnd': rnd, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(g) }
    }, r => {
      let p = '';
      r.on('data', d => p += d);
      r.on('end', () => { try { cozul(JSON.parse(p)); } catch (e) { hataVer(new Error('iyzico yanıtı okunamadı')); } });
    });
    istek.on('error', hataVer);
    istek.end(g);
  });
}

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
        // Hoş geldin otomasyonu (yalnız yeni abonelere)
        const oa = otomasyonAyar();
        if (oa.hosgeldin && oa.hosgeldin.aktif) otomasyonPosta(g.eposta, oa.hosgeldin.konu, oa.hosgeldin.metin);
      }
      return json(res, 200, { tamam: true });
    }

    /* Terk edilmiş sepet anlık görüntüsü (e-postası bilinen ziyaretçi için) */
    if (req.method === 'POST' && yol === '/api/sepet-kayit') {
      const g = await govde(req, 1);
      if (!epostaMi(g.eposta)) return json(res, 200, { tamam: true }); // sessizce geç
      const e = temiz(g.eposta, 200).toLowerCase();
      let sepetler = oku('sepetler.json', []).filter(x => x.eposta !== e);
      const kal = Array.isArray(g.kalemler) ? g.kalemler.slice(0, 50).map(k => ({
        ad: temiz(k.ad, 200), adet: Math.min(99, Math.max(1, parseInt(k.adet, 10) || 1))
      })).filter(k => k.ad) : [];
      if (kal.length) sepetler.unshift({ eposta: e, kalemler: kal, tarih: new Date().toISOString(), hatirlatildi: false });
      yaz('sepetler.json', sepetler.slice(0, 2000));
      return json(res, 200, { tamam: true });
    }

    if (req.method === 'GET' && yol === '/api/bulten-cik') {
      const u = new URL(req.url, 'http://x');
      const e = String(u.searchParams.get('e') || '').slice(0, 200);
      const t = String(u.searchParams.get('t') || '');
      const govdeHtml = (mesaj) =>
        '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Olivamore Bülten</title></head>' +
        '<body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#1E1C19;">' +
        '<h2 style="letter-spacing:.2em;">OLIVAMORE</h2><p>' + mesaj + '</p>' +
        '<p><a href="https://olivamore.de/" style="color:#BFA25D;">olivamore.de</a></p></body></html>';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (!epostaMi(e) || t !== bultenImza(e)) return res.end(govdeHtml('Bağlantı geçersiz veya süresi dolmuş.'));
      const liste = oku('bulten.json', []);
      yaz('bulten.json', liste.filter(x => (x.eposta || '').toLowerCase() !== e.toLowerCase()));
      return res.end(govdeHtml('E-posta listemizden çıkarıldınız. Sizi yeniden aramızda görmek dileğiyle.'));
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
      // Stok kontrolü + düşümü (yetersizse sipariş alınmaz)
      const stokSonuc = stokDus(kalemler);
      if (stokSonuc.hata) return json(res, 400, { hata: stokSonuc.hata });
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
      // Üye indirimi (giriş yapmış üyeye sadakat seviyesi / özel indirim)
      let uyeIndirimTutar = 0, uyeIndirimOran = 0;
      const uyeB = uyeBul(req);
      if (uyeB) {
        uyeIndirimOran = uyeOran(uyeB.u);
        if (uyeIndirimOran > 0) {
          uyeIndirimTutar = Math.round((araToplam - indirim) * uyeIndirimOran) / 100;
          if (uyeIndirimTutar < 0) uyeIndirimTutar = 0;
        }
      }
      const indirimliAra = Math.max(0, Math.round((araToplam - indirim - uyeIndirimTutar) * 100) / 100);
      const oran = araToplam > 0 ? indirimliAra / araToplam : 1;
      const kdvToplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet * oran * k.kdv / 100, 0) * 100) / 100;
      const kargo = (kargoBedava || indirimliAra >= 500) ? 0 : 80; // [KARGO AYARI]
      const toplam = Math.round((indirimliAra + kdvToplam + kargo) * 100) / 100;
      const durum = oku('sayac.json', { son: 1000 });
      durum.son++;
      yaz('sayac.json', durum);
      const no = 'OM-' + durum.son;
      const odemeYolu = temiz(g.odeme, 40) || 'havale';
      if (odemeYolu === 'kart' && !iyzicoAktif()) {
        return json(res, 400, { hata: 'Kartla ödeme şu anda aktif değil; lütfen Havale/EFT seç.' });
      }
      const siparisler = oku('siparisler.json', []);
      siparisler.unshift({
        no: no, tarih: new Date().toISOString(),
        durum: odemeYolu === 'kart' ? 'odeme-bekliyor' : 'yeni',
        odeme: odemeYolu, dil: g.dil === 'en' ? 'en' : 'tr',
        musteri: { ad: temiz(m.ad, 120), eposta: temiz(m.eposta, 200), telefon: temiz(m.telefon, 40), adres: temiz(m.adres, 1000), il: temiz(m.il, 60), ilce: temiz(m.ilce, 60), postaKodu: temiz(m.postaKodu, 10), not: temiz(m.not, 500) },
        kalemler: kalemler, araToplam: araToplam, kupon: kuponBilgi, indirim: indirim,
        uyeIndirim: uyeIndirimTutar > 0 ? { oran: uyeIndirimOran, tutar: uyeIndirimTutar, eposta: uyeB.u.eposta } : null,
        kdvToplam: kdvToplam, kargo: kargo, toplam: toplam
      });
      yaz('siparisler.json', siparisler.slice(0, 5000));
      // Sipariş tamamlandı → terk edilmiş sepet kaydı silinir
      const spListe = oku('sepetler.json', []).filter(x => x.eposta !== temiz(m.eposta, 200).toLowerCase());
      yaz('sepetler.json', spListe);
      if (odemeYolu === 'kart') {
        // iyzico Checkout Form başlat; müşteri ödeme sayfasına yönlendirilir
        const parcalar = temiz(m.ad, 120).split(/\s+/);
        const soyad = parcalar.length > 1 ? parcalar.pop() : '-';
        const adK = parcalar.join(' ') || soyad;
        try {
          const y = await iyziIstek('/payment/iyzipos/checkoutform/initialize/auth/ecom', {
            locale: g.dil === 'en' ? 'en' : 'tr',
            conversationId: no, basketId: no,
            price: String(toplam), paidPrice: String(toplam), currency: 'TRY',
            paymentGroup: 'PRODUCT',
            callbackUrl: 'https://olivamore.de/api/odeme-sonuc',
            buyer: {
              id: no, name: adK, surname: soyad,
              gsmNumber: temiz(m.telefon, 40), email: temiz(m.eposta, 200),
              identityNumber: '11111111111', // TCKN toplamıyoruz; iyzico zorunlu alan
              registrationAddress: temiz(m.adres, 1000),
              ip: req.headers['x-real-ip'] || '0.0.0.0',
              city: temiz(m.il, 60) || 'Istanbul', country: 'Turkey'
            },
            shippingAddress: { contactName: temiz(m.ad, 120), city: temiz(m.il, 60) || 'Istanbul', country: 'Turkey', address: temiz(m.adres, 1000) },
            billingAddress: { contactName: temiz(m.ad, 120), city: temiz(m.il, 60) || 'Istanbul', country: 'Turkey', address: temiz(m.adres, 1000) },
            basketItems: [{ id: no, name: 'Olivamore Siparişi ' + no, category1: 'Gıda', itemType: 'PHYSICAL', price: String(toplam) }]
          });
          if (y && y.status === 'success' && y.paymentPageUrl) {
            return json(res, 200, { tamam: true, no: no, toplam: toplam, odemeUrl: y.paymentPageUrl });
          }
          console.error('[iyzico]', y && y.errorMessage);
        } catch (e) { console.error('[iyzico]', e.message); }
        const s = siparisler.find(x => x.no === no);
        if (s) { s.durum = 'odeme-basarisiz'; stokGeriEkle(s); yaz('siparisler.json', siparisler); }
        return json(res, 502, { hata: 'Ödeme sayfası açılamadı; lütfen tekrar dene veya Havale/EFT seç.' });
      }
      epostaBildir('Yeni sipariş ' + no + ' · ₺' + toplam.toLocaleString('tr-TR'),
        kalemler.map(k => k.adet + ' × ' + k.ad + ' (₺' + k.fiyat + ')').join('\n') +
        (kuponBilgi ? '\n\nKupon: ' + kuponBilgi.kod + ' (-₺' + indirim + ')' : '') +
        '\n\nMüşteri: ' + m.ad + ' / ' + m.telefon + ' / ' + m.eposta + '\nAdres: ' + m.adres + '\nÖdeme: ' + odemeYolu);
      return json(res, 200, { tamam: true, no: no, toplam: toplam });
    }

    /* ---- üye uçları ---- */
    if (req.method === 'POST' && yol === '/api/uye/kayit') {
      const g = await govde(req, 1);
      const ad = temiz(g.ad, 120), eposta = temiz(g.eposta, 200).toLowerCase(), sifre = String(g.sifre || '');
      if (!ad || !epostaMi(eposta)) return json(res, 400, { hata: 'Ad ve geçerli e-posta zorunlu.' });
      if (sifre.length < 6) return json(res, 400, { hata: 'Şifre en az 6 karakter olmalı.' });
      const liste = oku('uyeler.json', []);
      if (liste.find(u => u.eposta === eposta)) return json(res, 400, { hata: 'Bu e-posta zaten kayıtlı; giriş yapmayı dene.' });
      const tuz = crypto.randomBytes(16).toString('hex');
      const u = { id: 'U-' + Date.now(), ad: ad, eposta: eposta, tuz: tuz, hash: sifreHashle(sifre, tuz), tarih: new Date().toISOString(), oturumlar: [] };
      const token = oturumAc(u);
      liste.push(u);
      yaz('uyeler.json', liste.slice(-50000));
      return json(res, 200, { tamam: true, token: token, ad: ad });
    }
    if (req.method === 'POST' && yol === '/api/uye/giris') {
      const g = await govde(req, 1);
      const eposta = temiz(g.eposta, 200).toLowerCase();
      const liste = oku('uyeler.json', []);
      const u = liste.find(x => x.eposta === eposta);
      const hatali = () => json(res, 401, { hata: 'E-posta veya şifre hatalı.' });
      if (!u) return hatali();
      const deneme = Buffer.from(sifreHashle(String(g.sifre || ''), u.tuz), 'hex');
      const dogru = Buffer.from(u.hash, 'hex');
      if (deneme.length !== dogru.length || !crypto.timingSafeEqual(deneme, dogru)) return hatali();
      const token = oturumAc(u);
      yaz('uyeler.json', liste);
      return json(res, 200, { tamam: true, token: token, ad: u.ad });
    }
    if (req.method === 'POST' && yol === '/api/uye/cikis') {
      const b = uyeBul(req);
      if (b) { b.u.oturumlar = b.u.oturumlar.filter(o => o.token !== b.token); yaz('uyeler.json', b.liste); }
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'GET' && yol === '/api/uye/ben') {
      const b = uyeBul(req);
      if (!b) return json(res, 401, { hata: 'Oturum geçersiz; yeniden giriş yap.' });
      const e = b.u.eposta;
      const siparisler = oku('siparisler.json', [])
        .filter(s => (s.musteri && (s.musteri.eposta || '').toLowerCase()) === e)
        .slice(0, 100)
        .map(s => ({
          no: s.no, tarih: s.tarih, durum: s.durum, odeme: s.odeme,
          araToplam: s.araToplam, indirim: s.indirim || 0, kuponKod: (s.kupon && s.kupon.kod) || '',
          kdvToplam: s.kdvToplam, kargo: s.kargo, toplam: s.toplam,
          kargoFirma: s.kargoFirma || '', kargoNo: s.kargoNo || '',
          partiKod: s.partiKod || '',
          iadeDurum: s.iade ? s.iade.durum : '',
          kalemler: (s.kalemler || []).map(k => ({ ad: k.ad, adet: k.adet, fiyat: k.fiyat, img: k.img || '' }))
        }));
      return json(res, 200, {
        ad: b.u.ad, eposta: e, uyelik: b.u.tarih, puan: puanHesapla(e),
        indirimOran: uyeOran(b.u), seviyeler: uyeAyar().seviyeler,
        ozelIndirim: b.u.ozelIndirim ? parseFloat(b.u.ozelIndirim.oran) || 0 : 0,
        adresler: b.u.adresler || [],
        siparisler: siparisler
      });
    }

    /* Onaylı yorumlar (herkese açık): /api/yorumlar?urun=ID */
    if (req.method === 'GET' && yol === '/api/yorumlar') {
      const u = new URL(req.url, 'http://x');
      const urunId = String(u.searchParams.get('urun') || '').slice(0, 40);
      const liste = oku('yorumlar.json', [])
        .filter(y => y.durum === 'onaylandı' && (!urunId || y.urunId === urunId))
        .slice(0, 100)
        .map(y => {
          const parcalar = String(y.ad || '').trim().split(/\s+/);
          const gizliAd = parcalar[0] + (parcalar[1] ? ' ' + parcalar[1][0] + '.' : '');
          return { ad: gizliAd, yildiz: y.yildiz, metin: y.metin, tarih: y.tarih, dogrulanmis: !!y.dogrulanmis };
        });
      const ort = liste.length ? Math.round(liste.reduce((t, y) => t + y.yildiz, 0) / liste.length * 10) / 10 : 0;
      return json(res, 200, { yorumlar: liste, ortalama: ort, say: liste.length });
    }
    /* Yorum gönder (üye; ürün adıyla eşleştirilir) */
    if (req.method === 'POST' && yol === '/api/yorum') {
      const b = uyeBul(req);
      if (!b) return json(res, 401, { hata: 'Yorum yapmak için giriş yapmalısın.' });
      const g = await govde(req, 1);
      const yildiz = Math.min(5, Math.max(1, parseInt(g.yildiz, 10) || 0));
      const metin = temiz(g.metin, 1000);
      if (!g.yildiz || !metin) return json(res, 400, { hata: 'Yıldız ve yorum metni zorunlu.' });
      const cfg = oku('cms.json', {});
      const urun = urunKaydi(cfg, temiz(g.urunAd, 200));
      if (!urun) return json(res, 400, { hata: 'Ürün bulunamadı.' });
      // Satın alma doğrulaması
      const dogrulanmis = oku('siparisler.json', []).some(s =>
        (s.musteri && (s.musteri.eposta || '').toLowerCase()) === b.u.eposta &&
        ['iptal', 'odeme-bekliyor', 'odeme-basarisiz'].indexOf(s.durum) === -1 &&
        (s.kalemler || []).some(k => k.ad.indexOf(urun.nameTR) === 0 || (urun.nameEN && k.ad.indexOf(urun.nameEN) === 0)));
      const yorumlar = oku('yorumlar.json', []);
      const eski = yorumlar.find(y => y.eposta === b.u.eposta && y.urunId === urun.id);
      if (eski) {
        eski.yildiz = yildiz; eski.metin = metin; eski.tarih = new Date().toISOString(); eski.durum = 'bekliyor';
      } else {
        yorumlar.unshift({
          id: 'Y-' + Date.now(), urunId: urun.id, urunAd: urun.nameTR,
          eposta: b.u.eposta, ad: b.u.ad, yildiz: yildiz, metin: metin,
          tarih: new Date().toISOString(), durum: 'bekliyor', dogrulanmis: dogrulanmis
        });
      }
      yaz('yorumlar.json', yorumlar.slice(0, 5000));
      epostaBildir('Yeni ürün yorumu bekliyor: ' + urun.nameTR, b.u.ad + ' · ' + yildiz + '★\n\n' + metin + '\n\nPanelden onaylayabilirsin: https://olivamore.de/panel');
      return json(res, 200, { tamam: true, mesaj: 'Yorumun alındı; onaylandığında yayınlanır' + (uyeAyar().yorumPuan ? ' ve ' + uyeAyar().yorumPuan + ' puan kazanırsın' : '') + '.' });
    }

    if (req.method === 'POST' && yol === '/api/uye/adres-kaydet') {
      const b = uyeBul(req);
      if (!b) return json(res, 401, { hata: 'Oturum geçersiz; yeniden giriş yap.' });
      const g = await govde(req, 1);
      if (!temiz(g.ad, 120) || !temiz(g.telefon, 40) || !temiz(g.adres, 1000)) {
        return json(res, 400, { hata: 'Ad, telefon ve adres zorunlu.' });
      }
      b.u.adresler = b.u.adresler || [];
      const yeni = {
        id: temiz(g.id, 30) || 'A-' + Date.now(),
        baslik: temiz(g.baslik, 40) || 'Adresim',
        ad: temiz(g.ad, 120), telefon: temiz(g.telefon, 40),
        adres: temiz(g.adres, 1000), il: temiz(g.il, 60), ilce: temiz(g.ilce, 60), postaKodu: temiz(g.postaKodu, 10)
      };
      const i = b.u.adresler.findIndex(a => a.id === yeni.id);
      if (i !== -1) b.u.adresler[i] = yeni;
      else {
        if (b.u.adresler.length >= 8) return json(res, 400, { hata: 'En fazla 8 adres kaydedebilirsin.' });
        b.u.adresler.push(yeni);
      }
      yaz('uyeler.json', b.liste);
      return json(res, 200, { tamam: true, adresler: b.u.adresler });
    }
    if (req.method === 'POST' && yol === '/api/uye/adres-sil') {
      const b = uyeBul(req);
      if (!b) return json(res, 401, { hata: 'Oturum geçersiz.' });
      const g = await govde(req, 1);
      b.u.adresler = (b.u.adresler || []).filter(a => a.id !== temiz(g.id, 30));
      yaz('uyeler.json', b.liste);
      return json(res, 200, { tamam: true, adresler: b.u.adresler });
    }

    if (req.method === 'GET' && yol === '/api/odeme-durum') {
      return json(res, 200, { kart: iyzicoAktif() });
    }

    /* iyzico ödeme sonucu (callback) — token doğrulanır, sipariş güncellenir */
    if (yol === '/api/odeme-sonuc') {
      const yonlendir = hedef => { res.writeHead(302, { Location: hedef }); res.end(); };
      if (req.method !== 'POST') return yonlendir('/sepet');
      const ham = await new Promise((cozul, hataVer) => {
        let p = ''; req.on('data', d => { p += d; if (p.length > 100000) req.destroy(); });
        req.on('end', () => cozul(p)); req.on('error', hataVer);
      });
      const token = new URLSearchParams(ham).get('token');
      if (!token || !iyzicoAktif()) return yonlendir('/sepet#odeme-hata');
      let d = {};
      try { d = await iyziIstek('/payment/iyzipos/checkoutform/auth/ecom/detail', { token: token }); } catch (e) {}
      const liste = oku('siparisler.json', []);
      const s = liste.find(x => x.no === d.conversationId || x.no === d.basketId);
      const sepetYolu = s && s.dil === 'en' ? '/sepet-en' : '/sepet';
      if (d.status === 'success' && d.paymentStatus === 'SUCCESS' && s) {
        if (s.durum === 'odeme-bekliyor') {
          s.durum = 'yeni'; s.odendi = true; s.odemeId = d.paymentId || '';
          s.gecmis = s.gecmis || [];
          s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'kart ödemesi alındı' + (d.paymentId ? ' (' + d.paymentId + ')' : '') });
          yaz('siparisler.json', liste);
          epostaBildir('Yeni sipariş ' + s.no + ' · ₺' + s.toplam.toLocaleString('tr-TR') + ' (KART İLE ÖDENDİ)',
            s.kalemler.map(k => k.adet + ' × ' + k.ad).join('\n') +
            '\n\nMüşteri: ' + s.musteri.ad + ' / ' + s.musteri.telefon + ' / ' + s.musteri.eposta + '\nAdres: ' + s.musteri.adres);
          epostaGonder(s.musteri.eposta, 'Siparişin alındı · ' + s.no,
            'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişin ödemesi alındı (₺' + s.toplam.toLocaleString('tr-TR') + '). Hazırlanıp kargoya verildiğinde tekrar haber vereceğiz.\n\nAfiyet olsun,\nOlivamore');
        }
        return yonlendir(sepetYolu + '#odeme-ok-' + s.no);
      }
      if (s && s.durum === 'odeme-bekliyor') { s.durum = 'odeme-basarisiz'; stokGeriEkle(s); yaz('siparisler.json', liste); }
      return yonlendir(sepetYolu + '#odeme-hata');
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

    if (req.method === 'GET' && yol === '/api/admin/config') {
      return json(res, 200, oku('cms.json', {}));
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
      const eskiDurum = s.durum;
      const yeniDurum = temiz(g.durum, 30) || s.durum;
      s.durum = yeniDurum;
      if (g.kargoNo !== undefined) s.kargoNo = temiz(g.kargoNo, 60);
      if (g.kargoFirma !== undefined) s.kargoFirma = temiz(g.kargoFirma, 40);
      if (g.adminNot !== undefined) s.adminNot = temiz(g.adminNot, 1000);
      if (g.partiKod !== undefined) s.partiKod = temiz(g.partiKod, 30).toUpperCase();
      // İade yönetimi: {iade:{islem:'talep'|'onay'|'red', tutar, neden}}
      if (g.iade && g.iade.islem) {
        const islem = temiz(g.iade.islem, 20);
        s.iade = s.iade || {};
        if (islem === 'talep') {
          s.iade.durum = 'talep';
          s.iade.neden = temiz(g.iade.neden, 500);
          s.iade.tutar = Math.min(s.toplam, Math.max(0, parseFloat(g.iade.tutar) || s.toplam));
          s.iade.tarih = new Date().toISOString();
        } else if (islem === 'onay') {
          s.iade.durum = 'onaylandı';
          s.iade.onayTarih = new Date().toISOString();
          s.durum = 'iade';
        } else if (islem === 'red') {
          s.iade.durum = 'reddedildi';
        }
      }
      // İptal/iade → stok geri eklenir
      if (['iptal', 'iade', 'odeme-basarisiz'].indexOf(s.durum) !== -1) stokGeriEkle(s);
      // İşlem geçmişi
      s.gecmis = s.gecmis || [];
      const kayit = [];
      if (s.durum !== eskiDurum) kayit.push('durum: ' + eskiDurum + ' → ' + s.durum);
      if (g.kargoNo) kayit.push('kargo: ' + (s.kargoFirma ? s.kargoFirma + ' ' : '') + s.kargoNo);
      if (g.iade && g.iade.islem) kayit.push('iade ' + g.iade.islem + (g.iade.neden ? ' (' + temiz(g.iade.neden, 200) + ')' : ''));
      if (g.adminNot !== undefined) kayit.push('not güncellendi');
      if (kayit.length) s.gecmis.unshift({ tarih: new Date().toISOString(), islem: kayit.join(' · ') });
      yaz('siparisler.json', liste);
      // Müşteriye bilgilendirme e-postası (Brevo anahtarı varsa)
      if (s.durum !== eskiDurum && s.musteri && s.musteri.eposta) {
        if (s.durum === 'kargolandı') {
          epostaGonder(s.musteri.eposta, 'Siparişiniz kargoya verildi · ' + s.no,
            'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişiniz kargoya verildi.' +
            (s.kargoNo ? '\nKargo: ' + (s.kargoFirma || '') + ' · Takip No: ' + s.kargoNo : '') +
            '\n\nAfiyet olsun,\nOlivamore');
        } else if (s.durum === 'iptal') {
          epostaGonder(s.musteri.eposta, 'Siparişiniz iptal edildi · ' + s.no,
            'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişiniz iptal edildi. Sorularınız için bu e-postayı yanıtlayabilirsiniz.\n\nOlivamore');
        } else if (s.durum === 'iade') {
          epostaGonder(s.musteri.eposta, 'İade talebiniz onaylandı · ' + s.no,
            'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişiniz için ₺' + (s.iade && s.iade.tutar || s.toplam) +
            ' tutarında iade onaylandı. Ödeme yönteminize göre 3-10 iş günü içinde hesabınıza yansır.\n\nOlivamore');
        }
      }
      return json(res, 200, { tamam: true, siparis: s });
    }
    /* ---- üye yönetimi (admin) ---- */
    if (req.method === 'GET' && yol === '/api/admin/uyeler') {
      const siparisler = oku('siparisler.json', []);
      const uyeler = oku('uyeler.json', []).map(u => {
        const e = u.eposta;
        let say = 0, harcama = 0;
        siparisler.forEach(s => {
          if ((s.musteri && (s.musteri.eposta || '').toLowerCase()) === e &&
            ['iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'].indexOf(s.durum) === -1) { say++; harcama += s.toplam; }
        });
        return {
          ad: u.ad, eposta: e, tarih: u.tarih,
          puan: puanHesapla(e), siparisSay: say, harcama: Math.round(harcama * 100) / 100,
          seviyeOran: uyeOran(u),
          ozelIndirim: u.ozelIndirim || null
        };
      });
      return json(res, 200, { uyeler: uyeler, ayar: uyeAyar() });
    }
    if (req.method === 'POST' && yol === '/api/admin/uye-sifre') {
      const g = await govde(req, 1);
      const liste = oku('uyeler.json', []);
      const u = liste.find(x => x.eposta === temiz(g.eposta, 200).toLowerCase());
      if (!u) return json(res, 404, { hata: 'Üye bulunamadı.' });
      if (String(g.sifre || '').length < 6) return json(res, 400, { hata: 'Şifre en az 6 karakter olmalı.' });
      u.tuz = crypto.randomBytes(16).toString('hex');
      u.hash = sifreHashle(String(g.sifre), u.tuz);
      u.oturumlar = []; // tüm cihazlardan çıkış; yeni şifreyle girer
      yaz('uyeler.json', liste);
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'POST' && yol === '/api/admin/uye-indirim') {
      const g = await govde(req, 1);
      const liste = oku('uyeler.json', []);
      const u = liste.find(x => x.eposta === temiz(g.eposta, 200).toLowerCase());
      if (!u) return json(res, 404, { hata: 'Üye bulunamadı.' });
      const o = Math.min(50, Math.max(0, parseFloat(g.oran) || 0));
      if (o > 0) u.ozelIndirim = { oran: o, not: temiz(g.not, 200), tarih: new Date().toISOString() };
      else delete u.ozelIndirim;
      yaz('uyeler.json', liste);
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'POST' && yol === '/api/admin/uye-ayar') {
      const g = await govde(req, 1);
      const seviyeler = (Array.isArray(g.seviyeler) ? g.seviyeler : []).slice(0, 10)
        .map(s => ({ puan: Math.max(0, parseInt(s.puan, 10) || 0), oran: Math.min(50, Math.max(0, parseFloat(s.oran) || 0)), ad: temiz(s.ad, 30) }))
        .sort((a, b) => a.puan - b.puan);
      if (!seviyeler.length) return json(res, 400, { hata: 'En az bir seviye gerekli.' });
      const yorumPuan = Math.min(500, Math.max(0, parseInt(g.yorumPuan, 10) || 0));
      yaz('uye-ayar.json', { seviyeler: seviyeler, yorumPuan: yorumPuan });
      return json(res, 200, { tamam: true, seviyeler: seviyeler });
    }
    /* ---- yorum yönetimi (admin) ---- */
    if (req.method === 'GET' && yol === '/api/admin/yorumlar') {
      return json(res, 200, oku('yorumlar.json', []));
    }
    if (req.method === 'POST' && yol === '/api/admin/yorum-durum') {
      const g = await govde(req, 1);
      const yorumlar = oku('yorumlar.json', []);
      const y = yorumlar.find(x => x.id === temiz(g.id, 30));
      if (!y) return json(res, 404, { hata: 'Yorum bulunamadı.' });
      const durum = temiz(g.durum, 20);
      if (['onaylandı', 'red'].indexOf(durum) === -1) return json(res, 400, { hata: 'Geçersiz durum.' });
      y.durum = durum;
      // Onayda bir kez bonus puan
      if (durum === 'onaylandı' && !y.puanVerildi) {
        const bonus = uyeAyar().yorumPuan || 0;
        if (bonus > 0) {
          const uyeler = oku('uyeler.json', []);
          const u = uyeler.find(x => x.eposta === y.eposta);
          if (u) {
            u.bonusPuan = (u.bonusPuan || 0) + bonus;
            yaz('uyeler.json', uyeler);
            y.puanVerildi = true;
            epostaGonder(y.eposta, 'Yorumun yayında — ' + bonus + ' puan kazandın 🫒',
              'Merhaba ' + y.ad + ',\n\n"' + y.urunAd + '" için yazdığın yorum yayına alındı ve hesabına ' + bonus + ' puan eklendi (1 puan = ₺1).\n\nTeşekkürler,\nOlivamore');
          }
        }
      }
      yaz('yorumlar.json', yorumlar);
      return json(res, 200, { tamam: true });
    }

    /* ---- pazarlama ---- */
    if (req.method === 'GET' && yol === '/api/admin/otomasyon') {
      return json(res, 200, { ayar: otomasyonAyar(), bekleyenSepet: oku('sepetler.json', []).filter(s => !s.hatirlatildi).length });
    }
    if (req.method === 'POST' && yol === '/api/admin/otomasyon') {
      const g = await govde(req, 1);
      const mevcut = otomasyonAyar();
      ['sepet', 'hosgeldin', 'tekrar'].forEach(k => {
        if (!g[k]) return;
        mevcut[k] = mevcut[k] || {};
        mevcut[k].aktif = !!g[k].aktif;
        if (g[k].konu) mevcut[k].konu = temiz(g[k].konu, 200);
        if (g[k].metin) mevcut[k].metin = temiz(g[k].metin, 5000);
        if (k === 'sepet') mevcut[k].saat = Math.min(168, Math.max(1, parseInt(g[k].saat, 10) || 24));
        if (k === 'tekrar') mevcut[k].gun = Math.min(365, Math.max(7, parseInt(g[k].gun, 10) || 35));
      });
      yaz('otomasyon.json', mevcut);
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'GET' && yol === '/api/admin/pazarlama') {
      const env = oku('env.json', {});
      return json(res, 200, {
        aboneler: oku('bulten.json', []),
        kampanyalar: oku('kampanyalar.json', []),
        eposta: epostaServisiVar(),
        servis: env.resendKey ? 'Resend' : (env.brevoKey ? 'Brevo' : '')
      });
    }
    if (req.method === 'POST' && yol === '/api/admin/kampanya') {
      const g = await govde(req, 1);
      const konu = temiz(g.konu, 200), metin = temiz(g.metin, 20000);
      if (!konu || !metin) return json(res, 400, { hata: 'Konu ve metin zorunlu.' });
      const env = oku('env.json', {});
      if (!epostaServisiVar()) return json(res, 400, { hata: 'E-posta API anahtarı girilmemiş (sunucuda env.json → resendKey). Anahtar olmadan e-posta gönderilemez.' });
      if (g.test) {
        if (!env.bildirimEposta) return json(res, 400, { hata: 'Test için env.json → bildirimEposta gerekli.' });
        epostaGonder(env.bildirimEposta, '[TEST] ' + konu, metin + '\n\n—\n(Bu bir test gönderimidir; listeden çıkma linki gerçek gönderimde eklenir.)');
        return json(res, 200, { tamam: true, test: true, alici: env.bildirimEposta });
      }
      const aboneler = oku('bulten.json', []).filter(a => epostaMi(a.eposta));
      if (!aboneler.length) return json(res, 400, { hata: 'Hiç abone yok.' });
      const kampanyalar = oku('kampanyalar.json', []);
      kampanyalar.unshift({ tarih: new Date().toISOString(), konu: konu, alici: aboneler.length });
      yaz('kampanyalar.json', kampanyalar.slice(0, 500));
      kampanyaArkaplan(aboneler, konu, metin);
      return json(res, 200, { tamam: true, alici: aboneler.length });
    }
    if (req.method === 'POST' && yol === '/api/admin/abone-ekle') {
      const g = await govde(req, 1);
      if (!epostaMi(g.eposta)) return json(res, 400, { hata: 'Geçerli bir e-posta gir.' });
      const liste = oku('bulten.json', []);
      if (!liste.find(x => (x.eposta || '').toLowerCase() === g.eposta.toLowerCase())) {
        liste.unshift({ tarih: new Date().toISOString(), eposta: temiz(g.eposta, 200), kaynak: 'panel' });
        yaz('bulten.json', liste.slice(0, 20000));
      }
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'POST' && yol === '/api/admin/abone-sil') {
      const g = await govde(req, 1);
      const liste = oku('bulten.json', []);
      yaz('bulten.json', liste.filter(x => (x.eposta || '').toLowerCase() !== String(g.eposta || '').toLowerCase()));
      return json(res, 200, { tamam: true });
    }

    if (req.method === 'GET' && yol === '/api/admin/ozet') {
      const siparisler = oku('siparisler.json', []);
      const cfg = oku('cms.json', {});
      return json(res, 200, {
        yeniSiparis: siparisler.filter(s => s.durum === 'yeni').length,
        iadeTalep: siparisler.filter(s => s.iade && s.iade.durum === 'talep').length,
        odemeBekleyen: siparisler.filter(s => s.durum === 'odeme-bekliyor').length,
        okunmamisMesaj: oku('mesajlar.json', []).filter(m => !m.okundu).length,
        dusukStok: ((cfg.products) || []).filter(p => p.visible !== false && typeof p.stok === 'number' && p.stok <= 5).length,
        bekleyenYorum: oku('yorumlar.json', []).filter(y => y.durum === 'bekliyor').length
      });
    }
    if (req.method === 'POST' && yol === '/api/admin/mesaj-okundu') {
      const liste = oku('mesajlar.json', []);
      liste.forEach(m => { m.okundu = true; });
      yaz('mesajlar.json', liste);
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
  if (!env.bildirimEposta) return;
  epostaGonder(env.bildirimEposta, konu, metin);
}
// Herhangi bir alıcıya e-posta — Resend (öncelikli) veya Brevo (yedek)
function epostaGonder(kime, konu, metin) {
  const env = oku('env.json', {});
  if (!epostaMi(kime)) return;
  let secenek, veri;
  if (env.resendKey) {
    veri = JSON.stringify({
      from: 'Olivamore <' + (env.gonderen || 'site@olivamore.de') + '>',
      to: [kime], subject: konu, text: metin
    });
    secenek = {
      hostname: 'api.resend.com', path: '/emails', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.resendKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) }
    };
  } else if (env.brevoKey) {
    veri = JSON.stringify({
      sender: { name: 'Olivamore', email: env.gonderen || 'site@olivamore.de' },
      to: [{ email: kime }],
      subject: konu, textContent: metin
    });
    secenek = {
      hostname: 'api.brevo.com', path: '/v3/smtp/email', method: 'POST',
      headers: { 'api-key': env.brevoKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) }
    };
  } else return; // anahtar yoksa sessizce geç
  const istek = require('https').request(secenek, r => {
    if (r.statusCode >= 400) {
      let p = ''; r.on('data', d => p += d); r.on('end', () => console.error('[posta]', r.statusCode, p.slice(0, 300)));
    } else r.resume();
  });
  istek.on('error', e => console.error('[posta]', e.message));
  istek.end(veri);
}
function epostaServisiVar() {
  const env = oku('env.json', {});
  return !!(env.resendKey || env.brevoKey);
}

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
sunucu.listen(PORT, '127.0.0.1', () => console.log('Olivamore API 127.0.0.1:' + PORT + ' · veri: ' + DATA));
