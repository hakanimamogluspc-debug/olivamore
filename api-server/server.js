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
let cmsOnbellek = null; // /api/config yanıt önbelleği
// Sitenin canlı adresi: env.json → "siteAdresi": "https://olivamore.com" (girilmezse olivamore.de)
function SITE() { const e = oku('env.json', {}); return String(e.siteAdresi || 'https://olivamore.de').replace(/\/+$/, ''); }
function SITE_AD() { return SITE().replace(/^https?:\/\//, ''); }
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
  if (ad === 'siparisler.json') greenOpsZamanla();
}


// data:image/...;base64 → assets/img/yukleme-<özet>.<uzantı> (aynı görsel tekrar yazılmaz)
function gorselDosyala(v, dizin) {
  if (v.length < 4000 || v.indexOf('data:image/') !== 0) return v;
  const m = v.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return v;
  try {
    const ad = 'yukleme-' + crypto.createHash('sha1').update(m[2]).digest('hex').slice(0, 16) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
    const tam = path.join(dizin, ad);
    if (!fs.existsSync(tam)) fs.writeFileSync(tam, Buffer.from(m[2], 'base64'));
    return 'assets/img/' + ad;
  } catch (e) { console.error('[gorsel]', e.message); return v; }
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
    const link = SITE() + '/api/bulten-cik?e=' + encodeURIComponent(e) + '&t=' + bultenImza(e);
    epostaGonder(e, konu, metin +
      '\n\n—\nBu e-postayı Olivamore bültenine kayıtlı olduğunuz için aldınız.\nListeden çıkmak için: ' + link);
    setTimeout(adim, 150);
  })();
}

/* ---------- kargo entegrasyonu (Yurtiçi SOAP + DHL MyDHL) ----------
   env.json alanları girilince aktifleşir:
   - yurticiWsUser, yurticiWsSifre  (Yurtiçi müşteri temsilcisinden "WS entegrasyon" bilgileri)
   - dhlApiKey, dhlApiSecret, dhlHesapNo, dhlTest:true|false  (MyDHL API)
   - kargoGonderen: { ad, adres, il, ilce, postaKodu, telefon, eposta }  (DHL gönderici bilgisi) */
function kargoAktif() {
  const env = oku('env.json', {});
  return {
    yurtici: !!(env.yurticiWsUser && env.yurticiWsSifre),
    dhl: !!(env.dhlApiKey && env.dhlApiSecret && env.dhlHesapNo)
  };
}
function xmlKacir(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function httpsIstek(secenek, govdeStr) {
  return new Promise((cozul, hataVer) => {
    const istek = require('https').request(secenek, r => {
      let p = '';
      r.on('data', d => p += d);
      r.on('end', () => cozul({ kod: r.statusCode, govde: p }));
    });
    istek.on('error', hataVer);
    istek.setTimeout(20000, () => { istek.destroy(new Error('kargo servisi zaman aşımı')); });
    if (govdeStr) istek.end(govdeStr); else istek.end();
  });
}
/* Yurtiçi SOAP zarfı */
function yurticiSoap(metod, icerik, dilAlani) {
  const env = oku('env.json', {});
  // queryShipment dil alanını "wsLanguage" adıyla bekler; diğer metotlar "userLanguage" (YK Teknik Döküman V3)
  const dil = dilAlani || 'userLanguage';
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ship="http://yurticikargo.com.tr/ShippingOrderDispatcherServices">' +
    '<soapenv:Header/><soapenv:Body><ship:' + metod + '>' +
    '<wsUserName>' + xmlKacir(env.yurticiWsUser) + '</wsUserName>' +
    '<wsPassword>' + xmlKacir(env.yurticiWsSifre) + '</wsPassword>' +
    '<' + dil + '>TR</' + dil + '>' + icerik +
    '</ship:' + metod + '></soapenv:Body></soapenv:Envelope>';
  return httpsIstek({
    // env.yurticiTest=true → YK test ortamı (ilk doğrulama testleri orada yapılır)
    hostname: env.yurticiTest ? 'testwebservices.yurticikargo.com' : 'webservices.yurticikargo.com',
    path: '/KOPSWebServices/ShippingOrderDispatcherServices',
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '', 'Content-Length': Buffer.byteLength(xml) }
  }, xml);
}
// YK kuralı: telefon "alan koduyla 10 rakam" (başındaki 0/90 atılır)
function ykTelefon(t) {
  const r = String(t || '').replace(/\D/g, '');
  if (r.length >= 10) return r.slice(-10);
  return r;
}
async function yurticiGonderiOlustur(s) {
  const m = s.musteri;
  // YK kuralı: il/ilçe cityName-townName'de gönderiliyorsa adrese tekrar yazılmaz (min 10 karakter)
  let adres = String(m.adres || '').trim();
  if (adres.length < 10) adres = (adres + ' ' + (m.ilce || '') + ' ' + (m.il || '')).trim();
  const icerik = '<ShippingOrderVO>' +
    '<cargoKey>' + xmlKacir(s.no) + '</cargoKey>' +
    '<invoiceKey>' + xmlKacir(s.no) + '</invoiceKey>' +
    '<receiverCustName>' + xmlKacir(m.ad) + '</receiverCustName>' +
    '<receiverAddress>' + xmlKacir(adres) + '</receiverAddress>' +
    '<receiverPhone1>' + xmlKacir(ykTelefon(m.telefon)) + '</receiverPhone1>' +
    (m.il ? '<cityName>' + xmlKacir(m.il) + '</cityName>' : '') +
    (m.ilce ? '<townName>' + xmlKacir(m.ilce) + '</townName>' : '') +
    '<cargoCount>' + Math.min(50, Math.max(1, parseInt(s.koliAdet, 10) || 1)) + '</cargoCount>' +
    '<description>Olivamore siparişi ' + xmlKacir(s.no) + '</description>' +
    (m.eposta ? '<emailAddress>' + xmlKacir(m.eposta) + '</emailAddress>' : '') +
    '</ShippingOrderVO>';
  const y = await yurticiSoap('createShipment', icerik);
  const hataVar = /<outFlag>\s*[^0]/.test(y.govde) || y.kod >= 400;
  if (hataVar) {
    const msj = (y.govde.match(/<outResult>([^<]*)<\/outResult>/) || [])[1] ||
      (y.govde.match(/<errMessage>([^<]*)<\/errMessage>/) || [])[1] || 'Yurtiçi servisi hata döndü.';
    return { hata: msj };
  }
  // Yurtiçi'nde takip, gönderi anahtarı (sipariş no) ile yapılır
  return { kargoNo: s.no };
}
async function yurticiDurumSorgula(s) {
  // queryShipment: keyType 0 = cargoKey; dil alanı wsLanguage
  const icerik = '<keys>' + xmlKacir(s.kargoNo || s.no) + '</keys><keyType>0</keyType><addHistoricalData>false</addHistoricalData><onlyTracking>false</onlyTracking>';
  const y = await yurticiSoap('queryShipment', icerik, 'wsLanguage');
  // DLV = Kargo Teslim Edilmiştir (YK operationStatus tablosu)
  if (/<operationStatus>\s*DLV\s*</i.test(y.govde) || /TESLİM ED|TESLIM ED/i.test(y.govde)) return 'teslim';
  return '';
}
async function yurticiGonderiIptal(s) {
  const icerik = '<cargoKeys>' + xmlKacir(s.kargoNo || s.no) + '</cargoKeys>';
  const y = await yurticiSoap('cancelShipment', icerik);
  if (/<outFlag>\s*0\s*</.test(y.govde) || /<operationStatus>\s*CNL\s*</i.test(y.govde)) return { tamam: true };
  const msj = (y.govde.match(/<outResult>([^<]*)<\/outResult>/) || [])[1] || 'İptal edilemedi (gönderi düzenlenmiş olabilir).';
  return { hata: msj };
}
/* DHL MyDHL API */
function dhlSecenek(pathUri, metod, govdeStr) {
  const env = oku('env.json', {});
  return {
    hostname: 'express.api.dhl.com',
    path: (env.dhlTest ? '/mydhlapi/test' : '/mydhlapi') + pathUri,
    method: metod,
    headers: Object.assign({
      'Authorization': 'Basic ' + Buffer.from(env.dhlApiKey + ':' + env.dhlApiSecret).toString('base64'),
      'Content-Type': 'application/json'
    }, govdeStr ? { 'Content-Length': Buffer.byteLength(govdeStr) } : {})
  };
}
async function dhlGonderiOlustur(s) {
  const env = oku('env.json', {});
  const g = env.kargoGonderen || {};
  const m = s.musteri;
  const yarin = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const veri = JSON.stringify({
    plannedShippingDateAndTime: yarin + 'T10:00:00 GMT+03:00',
    pickup: { isRequested: false },
    productCode: 'N', // yurtiçi; uluslararası gönderide 'P' kullanılır
    accounts: [{ typeCode: 'shipper', number: env.dhlHesapNo }],
    customerDetails: {
      shipperDetails: {
        postalAddress: { postalCode: g.postaKodu || '10400', cityName: g.il || 'Balıkesir', countryCode: 'TR', addressLine1: (g.adres || 'Olivamore').slice(0, 45) },
        contactInformation: { phone: g.telefon || '', companyName: 'Olivamore', fullName: g.ad || 'Olivamore', email: g.eposta || 'site@olivamore.de' }
      },
      receiverDetails: {
        postalAddress: { postalCode: m.postaKodu || '34000', cityName: m.il || 'Istanbul', countryCode: 'TR', addressLine1: String(m.adres).slice(0, 45) },
        contactInformation: { phone: m.telefon, fullName: m.ad, email: m.eposta }
      }
    },
    content: {
      packages: [{ weight: Math.max(1, (s.kalemler || []).reduce((t, k) => t + k.adet, 0)), dimensions: { length: 20, width: 20, height: 30 } }],
      isCustomsDeclarable: false,
      description: 'Olivamore siparişi ' + s.no,
      unitOfMeasurement: 'metric'
    }
  });
  const y = await httpsIstek(dhlSecenek('/shipments', 'POST', veri), veri);
  let c = {};
  try { c = JSON.parse(y.govde); } catch (e) {}
  if (y.kod >= 400 || !c.shipmentTrackingNumber) {
    const msj = (c.detail || c.message || 'DHL servisi hata döndü (' + y.kod + ').');
    return { hata: String(msj).slice(0, 300) };
  }
  // Etiket PDF'i veri klasörüne kaydet (panelden yazdırılır)
  try {
    const doc = (c.documents || []).find(d => d.typeCode === 'label');
    if (doc && doc.content) fs.writeFileSync(dosya('etiket-' + s.no + '.pdf'), Buffer.from(doc.content, 'base64'));
  } catch (e) {}
  return { kargoNo: c.shipmentTrackingNumber };
}
async function dhlDurumSorgula(s) {
  const y = await httpsIstek(dhlSecenek('/shipments/' + encodeURIComponent(s.kargoNo) + '/tracking', 'GET'));
  if (/"Delivered"|"delivered"|\bOK\b.*Delivered/i.test(y.govde) || /"typeCode"\s*:\s*"OK"/.test(y.govde)) return 'teslim';
  return '';
}
/* Kargolanan siparişlerin teslim durumunu kontrol eder (otomasyon döngüsünden çağrılır) */
async function kargoTakipTur() {
  const aktif = kargoAktif();
  if (!aktif.yurtici && !aktif.dhl) return;
  const siparisler = oku('siparisler.json', []);
  let degisti = false;
  for (const s of siparisler) {
    if (s.durum !== 'kargolandı' || !s.kargoNo || s.kaynak === 'wordpress') continue;
    if (Date.now() - Date.parse(s.tarih) > 60 * 86400000) continue; // eski siparişleri sorgulamayı bırak
    try {
      let sonuc = '';
      if (s.kargoFirma === 'Yurtiçi' && aktif.yurtici) sonuc = await yurticiDurumSorgula(s);
      else if (s.kargoFirma === 'DHL' && aktif.dhl) sonuc = await dhlDurumSorgula(s);
      if (sonuc === 'teslim') {
        s.durum = 'tamamlandı';
        s.gecmis = s.gecmis || [];
        s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'kargo teslim edildi (otomatik)' });
        degisti = true;
      }
    } catch (e) { console.error('[kargo-takip]', s.no, e.message); }
  }
  if (degisti) yaz('siparisler.json', siparisler);
}



/* ---------- Meta Conversions API (sunucu taraflı dönüşüm) ----------
   env.json: "metaCapiToken": "...", isteğe bağlı "metaTestKodu": "TEST12345" (Events Manager test olayları)
   Yalnız çerez/ölçüm onayı veren ziyaretçiler için gönderilir. event_id tarayıcı Pixel'iyle aynıdır → Meta çift saymaz. */
function sha(v) { v = String(v == null ? '' : v).trim().toLowerCase(); return v ? crypto.createHash('sha256').update(v).digest('hex') : undefined; }
function metaAyar() {
  const env = oku('env.json', {}), cfg = oku('cms.json', {});
  if (!env.metaCapiToken || cfg.metaPixelAktif === false) return null;
  return { token: env.metaCapiToken, pixel: String(cfg.metaPixelId || '1511481262832458').replace(/\D/g, ''), test: env.metaTestKodu || '' };
}
function metaGonder(olaylar) {
  const a = metaAyar(); if (!a || !olaylar.length) return;
  const govdeStr = JSON.stringify(Object.assign({ data: olaylar }, a.test ? { test_event_code: a.test } : {}));
  const istek = require('https').request({
    hostname: 'graph.facebook.com', path: '/v21.0/' + a.pixel + '/events?access_token=' + encodeURIComponent(a.token), method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(govdeStr) }, timeout: 10000
  }, r => { let p = ''; r.on('data', d => p += d); r.on('end', () => { if (r.statusCode >= 400) console.error('[meta-capi]', r.statusCode, p.slice(0, 300)); }); });
  istek.on('error', e => console.error('[meta-capi]', e.message));
  istek.on('timeout', () => istek.destroy());
  istek.end(govdeStr);
}
function metaTelefon(t) { let d = String(t || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '0') d = '9' + d; else if (d.length === 10) d = '90' + d; return d || undefined; }
function metaSatinAlma(s, req) {
  try {
    if (!s || !s.iz || !s.iz.rz || s.metaGonderildi) return;
    const m = s.musteri || {}, ad = String(m.ad || '').trim().split(/\s+/);
    metaGonder([{
      event_name: 'Purchase', event_time: Math.floor(Date.now() / 1000), event_id: s.no, action_source: 'website',
      event_source_url: SITE() + '/sepet',
      user_data: {
        em: [sha(m.eposta)], ph: [sha(metaTelefon(m.telefon))], fn: [sha(ad[0])], ln: [sha(ad.length > 1 ? ad[ad.length - 1] : '')],
        ct: [sha(String(m.ilce || m.il || '').replace(/\s+/g, ''))], st: [sha(String(m.il || '').replace(/\s+/g, ''))], zp: [sha(m.postaKodu)], country: [sha('tr')],
        external_id: [sha(m.eposta)], client_ip_address: s.iz.ip || undefined, client_user_agent: s.iz.ua || undefined, fbp: s.iz.fbp || undefined, fbc: s.iz.fbc || undefined
      },
      custom_data: {
        currency: 'TRY', value: Number(s.toplam) || 0, order_id: s.no, content_type: 'product',
        content_ids: (s.kalemler || []).map(k => k.kod).filter(Boolean),
        contents: (s.kalemler || []).map(k => ({ id: k.kod || k.ad, quantity: k.adet, item_price: k.fiyat })),
        num_items: (s.kalemler || []).reduce((t, k) => t + k.adet, 0)
      }
    }]);
    const liste = oku('siparisler.json', []); const x = liste.find(y => y.no === s.no);
    if (x) { x.metaGonderildi = true; yaz('siparisler.json', liste); }
  } catch (e) { console.error('[meta-capi]', e.message); }
}
const META_OLAY = { urun_gor: 'ViewContent', sepete_ekle: 'AddToCart', odeme_basla: 'InitiateCheckout', odeme_adim2: 'AddPaymentInfo' };

/* ---------- Tarif asistanı: Edamam Recipe Search + DeepL çeviri ----------
   env.json: "edamamAppId", "edamamAppKey", isteğe bağlı "deeplKey" (Free anahtarlar ":fx" ile biter)
   Edamam koşulları: sonuçlar SAKLANMAZ (önbellek yok), yalnız isteği yapan kişiye gösterilir, "Powered by Edamam" rozeti zorunlu. */
const MALZEME_SOZLUK = {
  'domates':'tomato','yumurta':'egg','biber':'pepper','sivri biber':'green pepper','kırmızı biber':'red pepper','soğan':'onion','taze soğan':'scallion',
  'sarımsak':'garlic','patlıcan':'eggplant','kabak':'zucchini','taze fasulye':'green beans','fasulye':'beans','nohut':'chickpeas','mercimek':'lentils',
  'kırmızı mercimek':'red lentils','makarna':'pasta','pirinç':'rice','bulgur':'bulgur','levrek':'sea bass','çupra':'sea bream','somon':'salmon',
  'karides':'shrimp','balık':'fish','ahtapot':'octopus','kalamar':'squid','midye':'mussels','ton balığı':'tuna','roka':'arugula','enginar':'artichoke',
  'yoğurt':'yogurt','süzme yoğurt':'greek yogurt','limon':'lemon','portakal':'orange','mandalina':'mandarin','beyaz peynir':'feta','peynir':'cheese',
  'kaşar':'cheddar','lor':'ricotta','tavuk':'chicken','tavuk göğsü':'chicken breast','kıyma':'ground beef','dana':'beef','kuzu':'lamb','et':'beef',
  'patates':'potato','tatlı patates':'sweet potato','havuç':'carrot','ıspanak':'spinach','brokoli':'broccoli','karnabahar':'cauliflower','mantar':'mushroom',
  'mısır':'corn','bezelye':'peas','marul':'lettuce','salatalık':'cucumber','avokado':'avocado','fesleğen':'basil','maydanoz':'parsley','dereotu':'dill',
  'nane':'mint','kekik':'thyme','biberiye':'rosemary','zeytin':'olives','ceviz':'walnut','badem':'almond','fıstık':'pistachio','un':'flour','ekmek':'bread',
  'pırasa':'leek','kereviz':'celery','lahana':'cabbage','pancar':'beet','turp':'radish','elma':'apple','armut':'pear','incir':'fig','nar':'pomegranate',
  'nar ekşisi':'pomegranate molasses','sirke':'vinegar','balsamik':'balsamic','bal':'honey','çikolata':'chocolate','şeftali':'peach','çilek':'strawberry',
  'semizotu':'purslane','kinoa':'quinoa','tofu':'tofu','hindi':'turkey','sucuk':'sausage','mozzarella':'mozzarella','parmesan':'parmesan','krema':'cream',
  'süt':'milk','tereyağı':'butter','bamya':'okra','barbunya':'borlotti beans','kuru fasulye':'white beans','yeşil mercimek':'green lentils','kapya':'red bell pepper'
};
let tarifCagri = [];
const tarifIpSayac = new Map(), tarifCeviriSayac = new Map();
setInterval(() => { tarifIpSayac.clear(); tarifCeviriSayac.clear(); }, 60000);
function tarifAyar() {
  const e = oku('env.json', {});
  return (e.edamamAppId && e.edamamAppKey) ? { id: e.edamamAppId, key: e.edamamAppKey, deepl: e.deeplKey || '', kullanici: e.edamamKullanici || 'olivamore', kullaniciBasligi: e.edamamKullaniciBasligi === true } : null;
}
function httpsJson(secenek, govdeStr) {
  return new Promise((cozul, red) => {
    const istek = require('https').request(Object.assign({ timeout: 9000 }, secenek), r => {
      let p = ''; r.setEncoding('utf8'); r.on('data', d => p += d);
      r.on('end', () => { try { cozul({ kod: r.statusCode, veri: JSON.parse(p || '{}') }); } catch (e) { cozul({ kod: r.statusCode, veri: {} }); } });
    });
    istek.on('timeout', () => istek.destroy(new Error('zaman aşımı')));
    istek.on('error', red);
    if (govdeStr) istek.write(govdeStr);
    istek.end();
  });
}
async function deeplCevir(metinler, hedef, kaynak, anahtar) {
  if (!anahtar || !metinler.length) return null;
  const host = /:fx$/.test(anahtar) ? 'api-free.deepl.com' : 'api.deepl.com';
  const govdeStr = JSON.stringify(Object.assign({ text: metinler, target_lang: hedef }, kaynak ? { source_lang: kaynak } : {}));
  const y = await httpsJson({ hostname: host, path: '/v2/translate', method: 'POST',
    headers: { 'Authorization': 'DeepL-Auth-Key ' + anahtar, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(govdeStr) } }, govdeStr);
  if (y.kod !== 200 || !Array.isArray(y.veri.translations)) { console.error('[deepl]', y.kod); return null; }
  return y.veri.translations.map(t => t.text);
}
// Tarife en uygun Olivamore yağı (katalogdaki güncel ürünle)
function tarifYagi(metin, en) {
  const t = metin.toLowerCase();
  const cfg = oku('cms.json', {});
  const urun = id => (cfg.products || []).find(p => p.id === id && p.visible !== false);
  const sec = (id, nedenTR, nedenEN) => { const p = urun(id); return p ? { ad: en ? (p.nameEN || p.nameTR) : p.nameTR, birim: (en ? p.unitEN : p.unitTR) || '', img: p.img, href: 'p.html?id=' + encodeURIComponent(p.id), neden: en ? nedenEN : nedenTR } : null; };
  if (/(cake|dessert|cookie|muffin|orange|citrus|mandarin|tart)/.test(t)) return sec('ces-mand', 'Narenciyeli ve tatlı tariflerde Bodrum Mandalina Çeşnili yağ aromayı tamamlar; servisten önce az miktarda ekle.', 'In citrus and sweet recipes, the Bodrum Mandarin infused oil rounds off the aroma; add a little before serving.');
  if (/(fish|salmon|bass|bream|seafood|shrimp|prawn|octopus|squid|mussel|tuna|carpaccio)/.test(t)) return sec('ces-berg', 'Balık ve deniz ürünlerinde Bergamot Çeşnili yağ, servisten hemen önce damla damla eklenince ferah bir bitiş verir.', 'With fish and seafood, a few drops of Bergamot infused oil just before serving give a fresh finish.');
  if (/(salad|dressing|hummus|bruschetta|dip|raw|carpaccio|gazpacho|tabbouleh)/.test(t)) return sec('ay500', 'Çiğ ve soğuk tabaklarda Ayvalık Erken Hasat’ın yumuşak, meyvemsi karakteri öne çıkar; serviste gezdir.', 'In raw and cold dishes the smooth, fruity Ayvalık Early Harvest shines; drizzle at serving.');
  if (/(tomato|feta|greek|mediterranean|bean|chickpea|grilled vegetable|eggplant|aubergine)/.test(t)) return sec('tr750', 'Domates, peynir ve baklagillerle Trilye Erken Hasat’ın yoğun, biberimsi bitişi iyi eşleşir; servis sırasında ekle.', 'Trilye Early Harvest’s intense, peppery finish pairs well with tomato, cheese and pulses; add at serving.');
  return sec('og5l', 'Fırın, kavurma ve ocak yemeklerinde günlük pişirme yağı olarak Olgun Hasat; tabağa son dokunuşu Erken Hasat ile yapabilirsin.', 'For roasting, sautéing and stovetop cooking, Ripe Harvest is the everyday cooking oil; finish the plate with Early Harvest.')
    || sec('ay500', '', '');
}
async function tarifAra(malzemeMetni, en, istemciKimligi) {
  const ayar = tarifAyar();
  if (!ayar) return { durum: 503, veri: { hata: 'kapali' } };
  const simdi = Date.now();
  tarifCagri = tarifCagri.filter(t => simdi - t < 60000);
  if (tarifCagri.length >= 9) return { durum: 429, veri: { hata: 'yogun' } }; // Edamam Basic: dakikada 10
  // Türkçe malzemeler → İngilizce sorgu (sözlük + gerekirse DeepL)
  const parcalar = String(malzemeMetni || '').toLocaleLowerCase('tr').split(/[,\n;]+| ve /).map(x => x.trim()).filter(Boolean).slice(0, 8);
  if (!parcalar.length) return { durum: 400, veri: { hata: 'bos' } };
  let sorguParca = parcalar.map(p => en ? p : (MALZEME_SOZLUK[p] || null));
  const bilinmeyen = parcalar.filter((p, i) => sorguParca[i] === null);
  if (bilinmeyen.length) {
    const ceviri = await deeplCevir(bilinmeyen, 'EN-US', 'TR', ayar.deepl).catch(() => null);
    let j = 0;
    sorguParca = sorguParca.map((x, i) => x !== null ? x : ((ceviri && ceviri[j++]) || parcalar[i]));
  }
  const q = sorguParca.join(' ');
  const alanlar = ['label', 'image', 'images', 'url', 'source', 'ingredientLines', 'instructionLines', 'yield', 'totalTime', 'dishType', 'cuisineType', 'uri'].map(a => '&field=' + a).join('');
  const basliklar_ = Object.assign({ 'Accept': 'application/json' }, ayar.kullaniciBasligi ? { 'Edamam-Account-User': istemciKimligi || ayar.kullanici } : {});
  async function edamam(mutfaklar) {
    tarifCagri.push(Date.now());
    const yol = '/api/recipes/v2?type=public&q=' + encodeURIComponent(q) + '&app_id=' + encodeURIComponent(ayar.id) + '&app_key=' + encodeURIComponent(ayar.key) + alanlar +
      (mutfaklar || []).map(m => '&cuisineType=' + encodeURIComponent(m)).join('');
    return httpsJson({ hostname: 'api.edamam.com', path: yol, method: 'GET', headers: basliklar_ });
  }
  // Edamam'da ayrı "Turkish" mutfağı yok; Türk yemekleri "Middle Eastern" altında. Akdeniz yakın ikinci tercih.
  const TURK = /turk|türk|kebab|kebap|kofte|köfte|pilaf|pilav|borek|börek|meze|lahmacun|dolma|sarma|imam bayildi|baklava|cacik|menemen|shakshuka|ezme|mercimek|kisir|kısır|pide|gozleme|gözleme|manti|mantı|sucuk|bulgur|hummus|tahini|sumac|pomegranate molasses|urfa|aleppo|za'atar|zaatar/i;
  let y;
  try { y = await edamam(['Middle Eastern', 'Mediterranean']); }
  catch (e) { console.error('[edamam]', e.message); return { durum: 502, veri: { hata: 'baglanti' } }; }
  if (y.kod === 429) return { durum: 429, veri: { hata: 'yogun' } };
  if (y.kod !== 200) { console.error('[edamam]', y.kod, JSON.stringify(y.veri).slice(0, 200)); return { durum: 502, veri: { hata: 'servis' } }; }
  let hamlar = (y.veri.hits || []).map(h => h.recipe).filter(Boolean);
  // Mutfak filtresiyle az sonuç geldiyse (ve dakikalık sınır izin veriyorsa) filtresiz arama ile tamamla
  if (hamlar.filter(r => (r.instructionLines || []).length).length < 4 && tarifCagri.filter(t => Date.now() - t < 60000).length < 9) {
    try {
      const y2 = await edamam(null);
      if (y2.kod === 200) {
        const gorulen = new Set(hamlar.map(r => r.uri));
        hamlar = hamlar.concat((y2.veri.hits || []).map(h => h.recipe).filter(r => r && !gorulen.has(r.uri)));
      }
    } catch (e) { /* ilk sonuçlarla devam */ }
  }
  // Sıralama: yapılışı olan > Türk izi taşıyan > Orta Doğu > Akdeniz > diğer
  const puan = r => {
    const metin = [r.label, r.source, r.url, (r.ingredientLines || []).join(' ')].join(' ');
    const mutfak = (r.cuisineType || []).join(' ').toLowerCase();
    return ((r.instructionLines || []).length ? 100 : 0) + (TURK.test(r.label || '') ? 40 : TURK.test(metin) ? 15 : 0) +
      (mutfak.indexOf('middle eastern') !== -1 ? 20 : mutfak.indexOf('mediterranean') !== -1 ? 10 : 0);
  };
  const tarifler = hamlar.map((r, n) => ({ r, p: puan(r), n })).sort((a, b) => b.p - a.p || a.n - b.n).map(x => x.r).slice(0, 9);
  // Aramada yalnız başlıklar Türkçeye (DeepL kotasını korur); malzeme + yapılış, tarif açılınca /api/tarif-cevir ile çevrilir
  let basliklar = null;
  if (!en && tarifler.length) basliklar = await deeplCevir(tarifler.map(r => r.label || ''), 'TR', 'EN', ayar.deepl).catch(() => null);
  const sonuclar = tarifler.map((r, i) => {
    const malz = (r.ingredientLines || []).slice(0, 25).map(x => String(x).slice(0, 300));
    const adim = (r.instructionLines || []).slice(0, 25).map(x => String(x).slice(0, 600));
    const tumMetin = [r.label, (r.dishType || []).join(' '), (r.cuisineType || []).join(' '), malz.join(' ')].join(' ');
    return {
      baslik: (basliklar && basliklar[i]) || r.label, baslikOrijinal: r.label,
      resim: (r.images && r.images.REGULAR && r.images.REGULAR.url) || r.image,
      resimBuyuk: (r.images && r.images.LARGE && r.images.LARGE.url) || (r.images && r.images.REGULAR && r.images.REGULAR.url) || r.image, kaynak: r.source, url: r.url,
      malzemeler: malz, adimlar: adim, sure: r.totalTime || 0, porsiyon: r.yield || 0,
      yag: tarifYagi(tumMetin, en)
    };
  });
  return { durum: 200, veri: { tamam: true, sorgu: q, sonuclar: sonuclar } };
}

/* =====================================================================
   GREEN OPS ENTEGRASYONU
   Site → Green Ops : sipariş olayları (webhook, HMAC-SHA256 imzalı, kuyruklu + yeniden denemeli)
   Green Ops → Site : /api/entegre/*  (Authorization: Bearer <greenOpsApiKey>)
     GET  /api/entegre/siparisler?sonra=ISO&durum=   sipariş listesi (kaçan olay/yedek senkron)
     GET  /api/entegre/siparis?no=                     tek sipariş
     POST /api/entegre/kargo-barkod {no, zorla?}       Yurtiçi gönderisini açar (bir kez) + etiket linki döner
     GET  /api/entegre/etiket?no=&exp=&t=              termal etiket (HTML, açılınca yazdırır) — imzalı link
     POST /api/entegre/durum {no, durum, not?}         Green Ops'tan durum bildirimi (hazırlanıyor / tamamlandı)
   env.json: greenOpsWebhookUrl, greenOpsSecret (imza), greenOpsApiKey (gelen istekler), greenOpsEtiket ("100x75" | "100x100" | "100x150")
   ===================================================================== */
var goZamanlayici = null, goCalisiyor = false;
function greenOpsZamanla() {
  if (goZamanlayici) return;
  goZamanlayici = setTimeout(() => { goZamanlayici = null; try { greenOpsTara(); } catch (e) { console.error('[greenops]', e.message); } greenOpsGonder().catch(e => console.error('[greenops]', e.message)); }, 1500);
}
function goAyar() {
  const e = oku('env.json', {});
  return { url: e.greenOpsWebhookUrl || '', sir: e.greenOpsSecret || '', anahtar: e.greenOpsApiKey || '', etiket: e.greenOpsEtiket || '100x80' };
}
const GO_DISARIDA = ['odeme-bekliyor', 'odeme-basarisiz'];
function goOdemeAlindi(s) { return !!s.odendi || ['hazırlanıyor', 'kargolandı', 'tamamlandı'].indexOf(s.durum) !== -1; }
function goSku(katalog, k) {
  let siteKod = k.kod || k.pid || k.id || '';
  if (!siteKod) { const kayit = urunKaydi(katalog, k.ad); if (kayit && kayit.id) siteKod = kayit.id; }
  const kat = (katalog.products || []).find(x => x.id === siteKod);
  return { siteKodu: siteKod, sku: (kat && kat.stokKodu) ? kat.stokKodu : greenOpsKodu(siteKod) };
}
function goSiparisVeri(s, katalog) {
  const m = s.musteri || {};
  return {
    no: s.no, tarih: s.tarih, kanal: s.kanal || (s.odeme === 'pazaryeri' ? 'pazaryeri' : 'web'),
    durum: s.durum, odeme: { yontem: s.odeme, alindi: goOdemeAlindi(s) },
    musteri: { ad: m.ad || '', eposta: m.eposta || '', telefon: m.telefon || '' },
    teslimat: { adres: m.adres || '', mahalle: m.mahalle || '', cadde: m.cadde || '', adresDetay: m.adresDetay || '', ilce: m.ilce || '', il: m.il || '', postaKodu: m.postaKodu || '', not: m.not || '' },
    fatura: s.faturaBilgi || { tip: 'bireysel' },
    kalemler: (s.kalemler || []).map(k => Object.assign(goSku(katalog, k), { ad: k.ad, adet: k.adet || 1, birimFiyat: k.fiyat, kdvOrani: typeof k.kdv === 'number' ? k.kdv : 1, paket: k.paket || undefined })),
    tutar: { araToplam: s.araToplam, indirim: s.indirim || 0, kargo: s.kargo || 0, kdv: s.kdvToplam || 0, toplam: s.toplam, paraBirimi: 'TRY' },
    kupon: s.kupon ? (s.kupon.kod || s.kupon) : null,
    kargo: { firma: s.kargoFirma || '', takipNo: s.kargoNo || '', koliAdet: parseInt(s.koliAdet, 10) || 1, etiketHazir: !!s.kargoNo },
    iade: s.iade || null, partiKod: s.partiKod || '', adminNot: s.adminNot || ''
  };
}
function goParmak(v) { return crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16); }
function goDurumOku() { return oku('greenops-durum.json', { baslangic: null, izler: {}, gecmis: [] }); }
function greenOpsTara() {
  const a = goAyar();
  if (!a.url) return;
  const durum = goDurumOku();
  const katalog = oku('cms.json', {});
  const liste = oku('siparisler.json', []).filter(s => s.kaynak !== 'wordpress' && GO_DISARIDA.indexOf(s.durum) === -1);
  // İlk açılışta mevcut siparişleri geçmiş say (taşkın olmasın); panelden "geçmişi gönder" ile istenirse gönderilir
  if (!durum.baslangic) {
    durum.baslangic = new Date().toISOString();
    liste.forEach(s => { durum.izler[s.no] = goParmak(goSiparisVeri(s, katalog)); });
    yaz('greenops-durum.json', durum);
    return;
  }
  const kuyruk = oku('greenops-kuyruk.json', []);
  let degisti = false;
  liste.forEach(s => {
    const veri = goSiparisVeri(s, katalog), p = goParmak(veri), onceki = durum.izler[s.no];
    if (onceki === p) return;
    durum.izler[s.no] = p; degisti = true;
    const olay = onceki ? 'siparis.guncellendi' : 'siparis.yeni';
    const bekleyen = kuyruk.find(x => x.no === s.no && !x.basarisiz);
    if (bekleyen) { bekleyen.veri = veri; bekleyen.sonraki = Date.now(); }
    else kuyruk.push({ id: crypto.randomBytes(8).toString('hex'), olay: olay, no: s.no, veri: veri, deneme: 0, sonraki: Date.now(), olusturma: new Date().toISOString() });
  });
  if (degisti) { yaz('greenops-durum.json', durum); yaz('greenops-kuyruk.json', kuyruk.slice(-2000)); }
}
function goPost(urlStr, govdeStr, basliklar) {
  return new Promise((cozul, red) => {
    let u; try { u = new URL(urlStr); } catch (e) { return red(new Error('Geçersiz webhook adresi')); }
    const mod = u.protocol === 'http:' ? require('http') : require('https');
    const istek = mod.request({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method: 'POST', timeout: 15000,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(govdeStr), 'User-Agent': 'Olivamore-Webhook/1' }, basliklar) }, r => {
      let p = ''; r.setEncoding('utf8'); r.on('data', d => { if (p.length < 2000) p += d; }); r.on('end', () => cozul({ kod: r.statusCode, govde: p }));
    });
    istek.on('timeout', () => istek.destroy(new Error('zaman aşımı')));
    istek.on('error', red);
    istek.end(govdeStr);
  });
}
const GO_BEKLEME_DK = [1, 2, 5, 15, 30, 60, 120, 240, 480, 720];
async function goTekGonder(olay, veri, teslimId) {
  const a = goAyar();
  const govdeStr = JSON.stringify({ olay: olay, id: teslimId, zaman: new Date().toISOString(), siparis: veri });
  const zaman = String(Math.floor(Date.now() / 1000));
  const imza = a.sir ? crypto.createHmac('sha256', a.sir).update(zaman + '.' + govdeStr).digest('hex') : '';
  return goPost(a.url, govdeStr, { 'X-Olivamore-Olay': olay, 'X-Olivamore-Teslim': teslimId, 'X-Olivamore-Zaman': zaman, 'X-Olivamore-Imza': 'sha256=' + imza });
}
async function greenOpsGonder() {
  const a = goAyar();
  if (!a.url || goCalisiyor) return;
  goCalisiyor = true;
  try {
    const kuyruk = oku('greenops-kuyruk.json', []);
    const simdi = Date.now();
    const sirada = kuyruk.filter(x => !x.basarisiz && x.sonraki <= simdi).slice(0, 20);
    if (!sirada.length) return;
    const durum = goDurumOku();
    const gonderilen = new Set();
    for (const x of sirada) {
      let sonuc = null, hata = '';
      try { sonuc = await goTekGonder(x.olay, x.veri, x.id); if (sonuc.kod < 200 || sonuc.kod >= 300) hata = 'HTTP ' + sonuc.kod + ' ' + String(sonuc.govde || '').slice(0, 160); }
      catch (e) { hata = e.message; }
      if (!hata) { gonderilen.add(x.id); durum.gecmis.unshift({ t: new Date().toISOString(), no: x.no, olay: x.olay, ok: true }); }
      else {
        x.deneme++; x.sonHata = hata;
        if (x.deneme >= GO_BEKLEME_DK.length) { x.basarisiz = true; console.error('[greenops] vazgeçildi', x.no, hata); }
        else x.sonraki = Date.now() + GO_BEKLEME_DK[x.deneme] * 60000;
        durum.gecmis.unshift({ t: new Date().toISOString(), no: x.no, olay: x.olay, ok: false, hata: hata.slice(0, 160) });
      }
    }
    durum.gecmis = durum.gecmis.slice(0, 60);
    // Gönderim sürerken eklenen kayıtlar kaybolmasın: taze kuyruğu oku, yalnız gönderilenleri çıkar, denemeleri işle
    const taze = oku('greenops-kuyruk.json', []);
    const isle = new Map(sirada.map(x => [x.id, x]));
    yaz('greenops-kuyruk.json', taze.filter(x => !gonderilen.has(x.id)).map(x => isle.has(x.id) ? Object.assign(x, { deneme: isle.get(x.id).deneme, sonHata: isle.get(x.id).sonHata, sonraki: goParmak(x.veri) === goParmak(isle.get(x.id).veri) ? isle.get(x.id).sonraki : x.sonraki, basarisiz: isle.get(x.id).basarisiz }) : x));
    yaz('greenops-durum.json', durum);
  } finally { goCalisiyor = false; }
}
setInterval(() => { try { greenOpsTara(); } catch (e) { console.error('[greenops]', e.message); } greenOpsGonder().catch(e => console.error('[greenops]', e.message)); }, 60000);

function goYetkili(req) {
  const a = goAyar();
  if (!a.anahtar) return false;
  const h = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const x = Buffer.from(h), y = Buffer.from(a.anahtar);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function goEtiketImza(no, exp) { const a = goAyar(); return crypto.createHmac('sha256', (a.sir || a.anahtar) + '|etiket').update(no + '.' + exp).digest('hex').slice(0, 32); }
function goEtiketLinki(no) {
  const exp = Math.floor(Date.now() / 1000) + 30 * 60; // 30 dk geçerli
  return SITE() + '/api/entegre/etiket?no=' + encodeURIComponent(no) + '&exp=' + exp + '&t=' + goEtiketImza(no, exp);
}
/* Code128-B (bağımlılıksız) — YK şubesi cargoKey'i (sipariş no) bu barkoddan okutur */
function code128Svg(metin, genislik, yukseklik) {
  const P = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
  const kodlar = [104];
  for (const ch of String(metin)) { let v = ch.charCodeAt(0) - 32; if (v < 0 || v > 94) v = 0; kodlar.push(v); }
  let toplam = 104; for (let j = 1; j < kodlar.length; j++) toplam += kodlar[j] * j;
  kodlar.push(toplam % 103); kodlar.push(106);
  const desen = kodlar.map(k => P[k]).join('');
  let modul = 0; for (const c of desen) modul += +c;
  const mw = genislik / (modul + 20); let x = mw * 10, cub = '';
  for (let d = 0; d < desen.length; d++) { const w = (+desen[d]) * mw; if (d % 2 === 0) cub += '<rect x="' + x.toFixed(2) + '" y="0" width="' + w.toFixed(2) + '" height="' + yukseklik + '" fill="#000"/>'; x += w; }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + genislik + '" height="' + yukseklik + '" viewBox="0 0 ' + genislik + ' ' + yukseklik + '">' + cub + '</svg>';
}
function htmlKacir(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function kargoEtiketHtml(s, boyut) {
  const m = s.musteri || {};
  const koliN = Math.min(50, Math.max(1, parseInt(s.koliAdet, 10) || 1));
  const [gw, gh] = (/^\d{2,3}x\d{2,3}$/.test(boyut || '') ? boyut : '100x80').split('x').map(Number);
  const urunler = (s.kalemler || []).map(k => (k.adet || 1) + '× ' + k.ad).join(', ');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kargo Etiketi ' + htmlKacir(s.no) + '</title>' +
    '<style>@page{size:' + gw + 'mm ' + gh + 'mm;margin:0}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#000}' +
    '.etiket{width:' + gw + 'mm;height:' + gh + 'mm;padding:4mm 5mm;display:flex;flex-direction:column;page-break-after:always;break-after:page}.etiket:last-child{page-break-after:auto;break-after:auto}' +
    '.koli{font-weight:700;font-size:11pt}' +
    '.ust{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #000;padding-bottom:1.5mm}' +
    '.marka{font-weight:700;font-size:13pt;letter-spacing:.12em}.firma{font-size:7pt;font-weight:700;letter-spacing:.06em}' +
    '.barkod{text-align:center;margin:2.5mm 0 .5mm}.barkod svg{width:100%;height:' + Math.round(gh * 0.22) + 'mm}' +
    '.kod{text-align:center;font-size:12pt;font-weight:700;letter-spacing:.18em;margin-bottom:2mm}' +
    '.alici{font-size:9pt;line-height:1.4;border-top:1px solid #000;padding-top:1.8mm}.alici b{font-size:10.5pt}' +
    '.icerik{font-size:7pt;margin-top:1.5mm;color:#222;max-height:' + (gh > 90 ? 18 : 6) + 'mm;overflow:hidden}' +
    '.alt{margin-top:auto;display:flex;justify-content:space-between;font-size:6.5pt;border-top:1px solid #000;padding-top:1.2mm}' +
    '@media screen{body{background:#eee;padding:10px}.etiket{background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);margin-bottom:10px}}' +
    '@media print{body{padding:0;background:#fff}}</style></head><body>' +
    Array.from({ length: koliN }, (_, j) => j + 1).map(i => '' +
    '<div class="etiket"><div class="ust"><span class="marka">OLIVAMORE</span><span class="firma">' + htmlKacir((s.kargoFirma || 'Yurtiçi').toLocaleUpperCase('tr')) + ' KARGO · GÖNDERİCİ ÖDEMELİ</span></div>' +
    '<div class="barkod">' + code128Svg(s.kargoNo || s.no, 380, 80) + '</div>' +
    '<div class="kod">' + htmlKacir(s.kargoNo || s.no) + '</div>' +
    '<div class="alici"><b>ALICI: ' + htmlKacir(m.ad) + '</b><br>' + htmlKacir(m.adres) + '<br>' + htmlKacir((m.ilce ? m.ilce + ' / ' : '') + (m.il || '')) + ' · Tel: ' + htmlKacir(m.telefon) + '</div>' +
    (gh >= 80 ? '<div class="icerik">İçerik: ' + htmlKacir(urunler) + '</div>' : '') +
    '<div class="alt"><span>Gönderici: Pektaş Tarım Gıda ve Tic. Ltd. Şti. · Ayvalık / Balıkesir</span><span>Sipariş: ' + htmlKacir(s.no) + ' · Koli: <span class="koli">' + i + ' / ' + koliN + '</span></span></div>' + '</div>').join('') +
    '<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>';
}
// Tek tuş: gönderiyi (bir kez) aç → etiket linki. Aynı sipariş için eşzamanlı ikinci istek beklemeye alınır, çift gönderi açılmaz.
const goKargoKilit = new Map();
async function kargoBarkodOlustur(no, secenek) {
  if (goKargoKilit.has(no)) return goKargoKilit.get(no);
  const is = (async () => {
    const liste = oku('siparisler.json', []);
    const s = liste.find(x => x.no === no);
    if (!s) return { kod: 404, veri: { hata: 'Sipariş bulunamadı.' } };
    if (s.kaynak === 'wordpress') return { kod: 409, veri: { hata: 'Eski site siparişi; kargo bu sistemden açılmaz.' } };
    if (['iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'].indexOf(s.durum) !== -1) return { kod: 409, veri: { hata: 'Sipariş durumu "' + s.durum + '": kargo açılamaz.' } };
    if (!goOdemeAlindi(s) && !secenek.zorla) return { kod: 409, veri: { hata: 'Ödeme henüz onaylanmadı (havale bekleniyor). Yine de göndermek için zorla:true.', kod: 'odeme-bekliyor' } };
    const koli = Math.min(50, Math.max(1, parseInt(secenek.koli, 10) || parseInt(s.koliAdet, 10) || 1));
    if (s.kargoNo && secenek.koli && koli !== (parseInt(s.koliAdet, 10) || 1)) {
      return { kod: 409, veri: { hata: 'Gönderi ' + (parseInt(s.koliAdet, 10) || 1) + ' koli olarak açılmış; koli sayısı değiştirilemez. Değiştirmek için gönderiyi iptal edip yeniden aç.', kod: 'koli-degismez', koliAdet: parseInt(s.koliAdet, 10) || 1, etiketUrl: goEtiketLinki(no) } };
    }
    if (!s.kargoNo) {
      s.koliAdet = koli;
      const firma = 'Yurtiçi';
      if (!kargoAktif().yurtici) return { kod: 503, veri: { hata: 'Yurtiçi WS bilgileri girilmemiş.' } };
      const sonuc = await yurticiGonderiOlustur(s);
      if (sonuc.hata) return { kod: 502, veri: { hata: 'Yurtiçi: ' + sonuc.hata } };
      const taze = oku('siparisler.json', []);
      const t = taze.find(x => x.no === no);
      const eskiDurum = t.durum;
      t.kargoFirma = firma; t.kargoNo = sonuc.kargoNo; t.durum = 'kargolandı'; t.koliAdet = koli;
      t.gecmis = t.gecmis || [];
      t.gecmis.unshift({ tarih: new Date().toISOString(), islem: firma + ' gönderisi oluşturuldu (' + sonuc.kargoNo + ')' +  + ' · ' + koli + ' koli' + (secenek.kaynak ? ' · ' + secenek.kaynak : '') });
      yaz('siparisler.json', taze);
      if (eskiDurum !== 'kargolandı' && t.musteri && t.musteri.eposta) {
        epostaGonder(t.musteri.eposta, 'Siparişiniz kargoya verildi · ' + t.no,
          'Merhaba ' + t.musteri.ad + ',\n\n' + t.no + ' numaralı siparişiniz kargoya verildi.\nKargo: ' + firma + ' · Takip No: ' + sonuc.kargoNo + '\n\nAfiyet olsun,\nOlivamore');
      }
      return { kod: 200, veri: { tamam: true, yeni: true, no: no, kargoFirma: firma, kargoNo: sonuc.kargoNo, koliAdet: koli, etiketUrl: goEtiketLinki(no) } };
    }
    return { kod: 200, veri: { tamam: true, yeni: false, no: no, kargoFirma: s.kargoFirma, kargoNo: s.kargoNo, koliAdet: parseInt(s.koliAdet, 10) || 1, etiketUrl: goEtiketLinki(no) } };
  })();
  goKargoKilit.set(no, is);
  try { return await is; } finally { goKargoKilit.delete(no); }
}
function greenOpsOzet() {
  const a = goAyar(), d = goDurumOku(), k = oku('greenops-kuyruk.json', []);
  let host = ''; try { host = a.url ? new URL(a.url).host : ''; } catch (e) { host = 'geçersiz adres'; }
  return { webhook: !!a.url, host: host, imza: !!a.sir, apiAnahtar: !!a.anahtar, etiket: a.etiket, baslangic: d.baslangic,
    bekleyen: k.filter(x => !x.basarisiz).length, basarisiz: k.filter(x => x.basarisiz).map(x => ({ no: x.no, olay: x.olay, hata: x.sonHata, deneme: x.deneme })),
    sonHata: (k.filter(x => !x.basarisiz && x.sonHata)[0] || {}).sonHata || '', gecmis: d.gecmis.slice(0, 25) };
}
/* ---------- Havale / EFT ---------- */
function bankaBilgi() {
  const b = (oku('cms.json', {}).banka) || {};
  return { unvan: b.unvan || '', banka: b.banka || '', iban: b.iban || '', not: b.not || '', hatirlatSaat: b.hatirlatSaat != null ? Number(b.hatirlatSaat) : 24, sureGun: Number(b.sureGun) || 3 };
}
function tlYaz(n) { return '₺' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function siparisOzetMetni(s) {
  const satir = (s.kalemler || []).map(k => '· ' + k.adet + ' × ' + k.ad + (k.hacim && k.ad.indexOf(k.hacim) === -1 ? ' (' + k.hacim + ')' : '') + ' — ' + tlYaz(k.fiyat * k.adet)).join('\n');
  let t = satir + '\n\nAra toplam: ' + tlYaz(s.araToplam);
  if (s.indirim) t += '\nKupon indirimi' + (s.kupon && s.kupon.kod ? ' (' + s.kupon.kod + ')' : '') + ': -' + tlYaz(s.indirim);
  if (s.uyeIndirim && s.uyeIndirim.tutar) t += '\nÜyelik indirimi: -' + tlYaz(s.uyeIndirim.tutar);
  t += '\nKargo: ' + (s.kargo ? tlYaz(s.kargo) : 'Ücretsiz') + '\nTOPLAM: ' + tlYaz(s.toplam) + ' (KDV dahil)';
  const m = s.musteri || {};
  t += '\n\nTeslimat adresi:\n' + m.ad + '\n' + m.adres + (m.ilce || m.il ? '\n' + [m.ilce, m.il].filter(Boolean).join(' / ') : '') + '\n' + m.telefon;
  return t;
}
function havaleTalimati(s, b) {
  return 'Ödeme bilgileri\n' +
    'Tutar: ' + tlYaz(s.toplam) + '\n' +
    'Hesap sahibi: ' + (b.unvan || '-') + '\n' +
    (b.banka ? 'Banka: ' + b.banka + '\n' : '') +
    'IBAN: ' + (b.iban || '-') + '\n' +
    'Açıklama: ' + s.no + '\n\n' +
    (b.not ? b.not + '\n' : 'Lütfen açıklama kısmına sipariş numaranı (' + s.no + ') yaz.\n') +
    'Ödemeyi ' + b.sureGun + ' gün içinde yapmanı rica ederiz; ödeme hesabımıza geçtiğinde siparişin hazırlanır ve kargoya verilir.';
}
function havaleOnayEpostasi(s) {
  const b = bankaBilgi();
  epostaGonder(s.musteri.eposta, 'Siparişin alındı · ' + s.no + ' · Ödeme bilgileri',
    'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişini aldık, teşekkür ederiz.\n\n' +
    havaleTalimati(s, b) + '\n\nSipariş özeti\n' + siparisOzetMetni(s) +
    '\n\nSorun ya da değişiklik isteğin olursa bu e-postayı yanıtlaman yeterli.\n\nAfiyet olsun,\nOlivamore');
}
// Ödemesi gelmeyen havale siparişine bir kez hatırlatma (panelde "hazırlanıyor"a alınan sipariş ödenmiş sayılır)
function havaleHatirlatTur() {
  if (!epostaServisiVar()) return;
  const b = bankaBilgi();
  if (!b.hatirlatSaat || !b.iban) return;
  const liste = oku('siparisler.json', []);
  const simdi = Date.now(); let degisti = false;
  liste.forEach(s => {
    if (s.odeme !== 'havale' || s.durum !== 'yeni' || s.odendi || s.odemeHatirlatma) return;
    const yas = simdi - Date.parse(s.tarih);
    if (yas < b.hatirlatSaat * 3600000 || yas > 10 * 86400000) return;
    epostaGonder(s.musteri.eposta, 'Ödemen bekleniyor · ' + s.no,
      'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişinin ödemesi henüz hesabımıza ulaşmadı. Ödemeyi yaptıysan bu e-postayı dikkate alma; havaleler bazen birkaç saat içinde görünür.\n\n' +
      havaleTalimati(s, b) + '\n\nSorun ya da değişiklik isteğin varsa bu e-postayı yanıtlaman yeterli.\n\nOlivamore');
    s.odemeHatirlatma = new Date().toISOString(); degisti = true;
  });
  if (degisti) yaz('siparisler.json', liste);
}
setInterval(havaleHatirlatTur, 30 * 60000);
setTimeout(havaleHatirlatTur, 30000);
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
  const link = SITE() + '/api/bulten-cik?e=' + encodeURIComponent(kime) + '&t=' + bultenImza(kime);
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
setInterval(() => { kargoTakipTur().catch(e => console.error('[kargo]', e.message)); }, 60 * 60000);
setTimeout(() => { kargoTakipTur().catch(e => console.error('[kargo]', e.message)); }, 40000);

/* ---------- stok takibi (cms.json içindeki ürünlerde "stok" alanı) ---------- */
// Sepet kalemini katalog ürününe eşler: önce ürün kodu (id), sonra Green Ops stok kodu, en son ad.
// (Aynı adı taşıyan farklı boyutlar olduğu için ad eşlemesi tek başına güvenilir değildir.)
function urunBulKalem(cfg, k) {
  const urunler = (cfg && cfg.products) || [];
  const kod = String((k && (k.kod || k.id)) || '').trim();
  if (kod) {
    const p = urunler.find(x => x.id === kod) || urunler.find(x => x.stokKodu && x.stokKodu === kod && x.visible !== false) || urunler.find(x => x.stokKodu && x.stokKodu === kod);
    if (p) return p;
  }
  return k && k.ad ? urunKaydi(cfg, k.ad) : null;
}
function urunKaydi(cfg, ad) {
  const urunler = (cfg && cfg.products) || [];
  return urunler.find(p => (p.nameTR && ad.indexOf(p.nameTR) === 0) || (p.nameEN && ad.indexOf(p.nameEN) === 0));
}
// Yeterliyse stoğu düşer; yetersizse {hata} döner. Stok alanı olmayan ürün sınırsız sayılır.
function stokDus(kalemler) {
  const cfg = oku('cms.json', {});
  // Aynı ürün sepette birden çok satırdaysa toplam adet kontrol edilir
  const toplamAdet = new Map();
  kalemler.forEach(k => { const p = urunBulKalem(cfg, k); if (p) toplamAdet.set(p, (toplamAdet.get(p) || 0) + k.adet); });
  for (const k of kalemler) {
    const p = urunBulKalem(cfg, k);
    if (p && typeof p.stok === 'number' && p.stok < (toplamAdet.get(p) || k.adet)) {
      return { hata: '"' + k.ad + '" için stok yetersiz' + (p.stok > 0 ? ' (kalan: ' + p.stok + ' adet).' : ' (tükendi).') };
    }
  }
  kalemler.forEach(k => {
    const p = urunBulKalem(cfg, k);
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
    const p = urunBulKalem(cfg, k);
    if (p && typeof p.stok === 'number') p.stok += k.adet;
  });
  yaz('cms.json', cfg);
  s.stokIade = true;
}

/* ---------- üye sistemi (uyeler.json) ---------- */
function sifreHashle(sifre, tuz) { return crypto.scryptSync(String(sifre), tuz, 64).toString('hex'); }
/* Üye bu ürünü gerçekten satın aldı mı? (ödemesi alınmış / kargolanmış / teslim edilmiş sipariş) */
function urunSatinAldiMi(eposta, urun) {
  const e = String(eposta || '').toLowerCase();
  return oku('siparisler.json', []).some(s =>
    (s.musteri && String(s.musteri.eposta || '').toLowerCase()) === e &&
    ['iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'].indexOf(s.durum) === -1 &&
    (goOdemeAlindi(s) || s.kaynak === 'wordpress') &&
    (s.kalemler || []).some(k => k.pid === urun.id || k.kod === urun.id || (urun.stokKodu && k.kod === urun.stokKodu) ||
      (urun.nameTR && String(k.ad || '').indexOf(urun.nameTR) === 0) || (urun.nameEN && String(k.ad || '').indexOf(urun.nameEN) === 0)));
}
/* Çok satanlar: son 90 günün ödenmiş siparişlerinden adet bazında (10 dk önbellek) */
let cokSatanOnbellek = { t: 0, liste: [] };
function cokSatanlar() {
  if (Date.now() - cokSatanOnbellek.t < 600000) return cokSatanOnbellek.liste;
  const cfg = oku('cms.json', {}), urunler = (cfg.products || []).filter(p => p.visible !== false && (p.type === 'product' || !p.type));
  const sinir = new Date(Date.now() - 90 * 86400000).toISOString(), say = {};
  oku('siparisler.json', []).forEach(sp => {
    if (String(sp.tarih) < sinir || ['iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'].indexOf(sp.durum) !== -1) return;
    (sp.kalemler || []).forEach(k => {
      const p = urunler.find(u => u.id === k.pid || u.id === k.kod || (u.stokKodu && u.stokKodu === k.kod)) || urunKaydi(cfg, k.ad);
      if (p && p.visible !== false) say[p.id] = (say[p.id] || 0) + (k.adet || 1);
    });
  });
  cokSatanOnbellek = { t: Date.now(), liste: Object.keys(say).sort((a, b) => say[b] - say[a]).slice(0, 12) };
  return cokSatanOnbellek.liste;
}
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

/* ---------- Site ürün kodu → Green Ops stok kodu (Paraşüt ürün kartı eşleşmesi) ---------- */
const PARASUT_KODLAR = {
  'ay250': '152.04.01.01', 'ay500': '152.04.01.02', 'ay750': '152.04.01.03',
  'ay2l': '152.04.01.05', 'ay5l': '152.04.01.06',
  'tr250': '152.04.01.07', 'tr500': '152.04.01.10', 'tr750': '152.04.01.11',
  'tr2l': '152.04.01.12', 'tr5l': '152.04.01.13',
  'og5l': '152.04.01.14',
  // Hediye kutulu ürünler: Green Ops'ta set SKU'su yok; yağ fiyatıyla aynı olduğundan yağ koduyla kesilir
  'kutu500': '152.04.01.02', 'kutu750': '152.04.01.03',
  // Kendi setini oluştur: 5'li salata seti; 3'lü seçimlerde 152.06.01.01
  'custom-set-5': '152.06.01.05', 'custom-set-3': '152.06.01.01', 'palate-box-3': '152.06.01.01',
  'ces-mand': '152.04.01.04', 'ces-bib': '152.04.02.04', 'ces-berg': '152.04.02.01', 'ces-kek': '152.04.02.02',
  'zey-siyah': '152.05.01.05', 'zey-yesil': '152.05.01.03',
  'sir-bal': '152.11.01.05', 'sir-alic': '152.11.01.06', 'sir-elma': '152.11.01.07', 'sir-uzum': '152.11.01.08', 'sir-nar': '152.11.01.04'
};
function greenOpsKodu(siteKodu) {
  const k = String(siteKodu || '');
  if (PARASUT_KODLAR[k]) return PARASUT_KODLAR[k];
  if (k.indexOf('custom-set') === 0) return PARASUT_KODLAR['custom-set-5'];
  return k;
}

/* ---------- Panel admin oturumu (env.json'a adminKullanici/adminTuz/adminHash girilince aktifleşir) ----------
   Şifre atamak için sunucuda: bash /root/olivamore-repo/api-server/admin-sifre-ata.sh */
function adminAktif() {
  // env.json VAR ama okunamıyorsa (yazım hatası) panel ŞİFRESİZ açılmaz: giriş zorunlu kalır (güvenli taraf)
  if (envBozuk()) return true;
  const env = oku('env.json', {});
  return !!(env.adminKullanici && env.adminTuz && env.adminHash);
}
function envBozuk() {
  try { if (!fs.existsSync(dosya('env.json'))) return false; JSON.parse(fs.readFileSync(dosya('env.json'), 'utf8')); return false; }
  catch (e) { return e.message || 'okunamadı'; }
}
function adminYetkili(req) {
  if (!adminAktif()) return true; // şifre atanana kadar eski düzen (nginx basic auth) geçerli
  let t = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!t) {
    const sorgu = (req.url || '').split('?')[1] || '';
    t = new URLSearchParams(sorgu).get('jeton') || '';
  }
  if (!t) return false;
  const oturumlar = oku('admin-oturum.json', []).filter(o => o.bitis > Date.now());
  return oturumlar.some(o => o.token === t);
}

/* ---------- Üye segmentleri (kampanya hedefleme) ---------- */
function segmentUyeleri(ad) {
  const gecersizDurum = ['iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'];
  const siparisler = oku('siparisler.json', []).filter(s => gecersizDurum.indexOf(s.durum) === -1 && s.musteri && epostaMi(s.musteri.eposta));
  const musteriler = {};
  siparisler.forEach(s => {
    const e = s.musteri.eposta.toLowerCase();
    musteriler[e] = musteriler[e] || { eposta: e, adet: 0, harcama: 0, son: 0 };
    musteriler[e].adet++;
    musteriler[e].harcama += Number(s.toplam) || 0;
    musteriler[e].son = Math.max(musteriler[e].son, Date.parse(s.tarih) || 0);
  });
  const liste = Object.values(musteriler);
  const doksanGun = Date.now() - 90 * 86400000;
  switch (ad) {
    case 'uyeler': return oku('uyeler.json', []).filter(u => epostaMi(u.eposta)).map(u => ({ eposta: u.eposta }));
    case 'musteriler': return liste.map(m => ({ eposta: m.eposta }));
    case 'coklu': return liste.filter(m => m.adet >= 3).map(m => ({ eposta: m.eposta }));
    case 'tek': return liste.filter(m => m.adet === 1).map(m => ({ eposta: m.eposta }));
    case 'sessiz90': return liste.filter(m => m.son > 0 && m.son < doksanGun).map(m => ({ eposta: m.eposta }));
    case 'vip': return liste.filter(m => m.harcama >= 5000).map(m => ({ eposta: m.eposta }));
    default: return oku('bulten.json', []).filter(a => epostaMi(a.eposta)); // 'aboneler'
  }
}

/* ---------- Abonelik motoru: vadesi gelen abonelikten otomatik sipariş ---------- */
/* Abonelik indirimi: varsayılan %15 (cms.json → abonelikIndirim ile değiştirilebilir) */
function aboneOran(cfg) { const o = Number((cfg || oku('cms.json', {})).abonelikIndirim); return o >= 0 && o <= 50 ? o : 15; }
function aboneFiyat(fiyat, oran) { return Math.round(Number(fiyat) * (1 - oran / 100) * 100) / 100; }
async function abonelikTur() {
  const abonelikler = oku('abonelikler.json', []);
  const bugun = new Date().toISOString().slice(0, 10);
  const vadeli = abonelikler.filter(a => a.durum === 'aktif' && a.sonrakiTarih && a.sonrakiTarih <= bugun);
  if (!vadeli.length) return;
  const siparisler = oku('siparisler.json', []);
  const cfg = oku('cms.json', {});
  for (const a of vadeli) {
    // Kalem listesi: yeni kayıtlar a.kalemler, eskiler tek ürün
    const istekler = (Array.isArray(a.kalemler) && a.kalemler.length)
      ? a.kalemler
      : [{ urun: a.urun, pid: a.pid, adet: a.adet || 1 }];
    const kalemler = [];
    let eksik = '';
    for (const k of istekler) {
      const p = (cfg.products || []).find(x => x.id === k.pid) || (cfg.products || []).find(x => x.nameTR && k.urun && k.urun.indexOf(x.nameTR) === 0);
      const liste = (istekler.length === 1 && Number(a.fiyat)) || (p ? Number(p.price) : 0);
      if (!liste) { eksik = k.urun; break; }
      const oranA = typeof a.indirimOran === 'number' ? a.indirimOran : aboneOran(cfg);
      kalemler.push({ ad: k.urun, adet: k.adet || 1, fiyat: aboneFiyat(liste, oranA), listeFiyat: liste, kdv: p && typeof p.kdv === 'number' ? p.kdv : 1, img: p ? p.img : '', pid: k.pid });
    }
    if (eksik) { a.sonHata = 'Fiyat bulunamadı (' + eksik + '); sipariş oluşturulamadı.'; continue; }
    const toplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0) * 100) / 100;
    const kdvToplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet * (k.kdv / (100 + k.kdv)), 0) * 100) / 100;
    const no = 'AB' + Date.now().toString().slice(-8);
    const siparis = {
      no: no, tarih: new Date().toISOString(),
      durum: 'yeni', odeme: 'abonelik', abonelikId: a.id,
      musteri: { ad: a.ad || a.eposta, eposta: a.eposta, telefon: a.telefon || '', adres: a.adres || '', mahalle: a.mahalle || '', cadde: a.cadde || '', adresDetay: a.adresDetay || '', il: a.il || '', ilce: a.ilce || '' },
      kalemler: kalemler,
      araToplam: toplam, indirim: 0, kargo: 0, kdvToplam: kdvToplam, toplam: toplam,
      gecmis: [{ tarih: new Date().toISOString(), islem: 'abonelikten otomatik oluşturuldu (' + a.id + ')' }]
    };
    let odemeUrl = '';
    if (paratikaAktif() && a.adres) {
      try {
        const o = await paratikaOturum(siparis, { headers: {}, socket: {} });
        siparis.durum = 'odeme-bekliyor'; siparis.odeme = 'kart'; siparis.odemeSaglayici = 'paratika'; siparis.paratikaToken = o.token;
        odemeUrl = o.url;
      } catch (e) { console.error('[abonelik-paratika]', e.message); }
    } else if (iyzicoAktif() && a.adres) {
      try {
        const parcalar = String(a.ad || 'Abone').split(/\s+/);
        const soyad = parcalar.length > 1 ? parcalar.pop() : '-';
        const y = await iyziIstek('/payment/iyzipos/checkoutform/initialize/auth/ecom', {
          locale: 'tr', conversationId: no, basketId: no,
          price: String(toplam), paidPrice: String(toplam), currency: 'TRY', paymentGroup: 'PRODUCT',
          callbackUrl: SITE() + '/api/odeme-sonuc',
          buyer: { id: no, name: parcalar.join(' ') || soyad, surname: soyad, gsmNumber: a.telefon || '', email: a.eposta, identityNumber: '11111111111', registrationAddress: a.adres, ip: '0.0.0.0', city: a.il || 'Istanbul', country: 'Turkey' },
          shippingAddress: { contactName: a.ad || 'Abone', city: a.il || 'Istanbul', country: 'Turkey', address: a.adres },
          billingAddress: { contactName: a.ad || 'Abone', city: a.il || 'Istanbul', country: 'Turkey', address: a.adres },
          basketItems: [{ id: no, name: 'Olivamore Abonelik ' + no, category1: 'Gıda', itemType: 'PHYSICAL', price: String(toplam) }]
        });
        if (y && y.status === 'success' && y.paymentPageUrl) { odemeUrl = y.paymentPageUrl; siparis.durum = 'odeme-bekliyor'; }
      } catch (e) { console.error('[abonelik-iyzico]', e.message); }
    }
    siparisler.unshift(siparis);
    // e-posta: ödeme linki varsa linkli, yoksa bilgilendirme
    const dokum = kalemler.map(k => k.adet + ' × ' + k.ad).join(', ');
    epostaGonder(a.eposta, 'Aboneliğinizin yeni dönemi hazır · ' + no,
      'Merhaba ' + (a.ad || '') + ',\n\nAboneliğiniz kapsamında ' + dokum + ' için ' + no + ' numaralı siparişiniz oluşturuldu (₺' + toplam.toLocaleString('tr-TR') + ').\n\n' +
      (odemeUrl ? 'Ödemeyi tamamlamak için: ' + odemeUrl : 'Ödeme için size ulaşacağız; dilerseniz bu e-postayı yanıtlayarak havale bilgisi isteyebilirsiniz.') +
      '\n\nAboneliğinizi durdurmak isterseniz bu e-postayı yanıtlamanız yeterli.\n\nAfiyet olsun,\nOlivamore');
    epostaBildir('Abonelik siparişi oluştu: ' + no, a.eposta + ' · ' + a.adet + ' × ' + a.urun + ' · ₺' + toplam + (odemeUrl ? '\nÖdeme linki gönderildi.' : '\nÖdeme linki YOK (adres/iyzico eksik).'));
    // sonraki vade (bugünü geçene kadar ilerlet)
    let sonraki = new Date(a.sonrakiTarih + 'T00:00:00');
    while (sonraki.toISOString().slice(0, 10) <= bugun) sonraki = new Date(sonraki.getTime() + (a.periyotGun || 30) * 86400000);
    a.sonrakiTarih = sonraki.toISOString().slice(0, 10);
    a.sonSiparis = no;
    a.sonHata = '';
  }
  yaz('siparisler.json', siparisler.slice(0, 5000));
  yaz('abonelikler.json', abonelikler);
}
setInterval(() => { abonelikTur().catch(e => console.error('[abonelik]', e.message)); }, 6 * 60 * 60 * 1000);
setTimeout(() => { abonelikTur().catch(e => console.error('[abonelik]', e.message)); }, 30 * 1000);

/* ---------- Satış kanalları: Trendyol + Hepsiburada (anahtarlar girilince aktifleşir) ----------
   env.json → trendyolSaticiId, trendyolApiKey, trendyolApiSecret
             hbMerchantId, hbKullanici, hbSifre
   Eşleme: kanal-esleme.json → { "<pid>": { "barkod": "TY barkodu", "hbSku": "HB satıcı SKU" } }
   10 dakikada bir: pazaryeri siparişleri çekilir (stok düşer, panele 'yeni' düşer) + stok anlık gönderilir. */
function trendyolAktif() {
  const env = oku('env.json', {});
  return !!(env.trendyolSaticiId && env.trendyolApiKey && env.trendyolApiSecret);
}
function hbAktif() {
  const env = oku('env.json', {});
  return !!(env.hbMerchantId && env.hbKullanici && env.hbSifre);
}
function kanalHttp(secenek, govdeObj) {
  return new Promise((cozul, hataVer) => {
    const g = govdeObj ? JSON.stringify(govdeObj) : '';
    secenek.headers = secenek.headers || {};
    secenek.headers['Content-Type'] = 'application/json';
    secenek.headers['Accept'] = 'application/json';
    if (g) secenek.headers['Content-Length'] = Buffer.byteLength(g);
    const istek = require('https').request(secenek, r => {
      let p = '';
      r.on('data', d => { p += d; });
      r.on('end', () => {
        let v = {};
        try { v = p ? JSON.parse(p) : {}; } catch (e) { v = { ham: String(p).slice(0, 300) }; }
        if (r.statusCode >= 400) return hataVer(new Error('HTTP ' + r.statusCode + ': ' + String(p).slice(0, 200)));
        cozul(v);
      });
    });
    istek.on('error', hataVer);
    istek.setTimeout(20000, () => { istek.destroy(new Error('zaman aşımı')); });
    if (g) istek.write(g);
    istek.end();
  });
}
function trendyolIstek(yontem, yolK, govdeObj) {
  const env = oku('env.json', {});
  const auth = 'Basic ' + Buffer.from(env.trendyolApiKey + ':' + env.trendyolApiSecret).toString('base64');
  return kanalHttp({
    hostname: 'apigw.trendyol.com', path: '/integration' + yolK, method: yontem,
    headers: { 'Authorization': auth, 'User-Agent': env.trendyolSaticiId + ' - SelfIntegration' }
  }, govdeObj);
}
function hbIstek(yontem, sunucu, yolK, govdeObj) {
  const env = oku('env.json', {});
  const auth = 'Basic ' + Buffer.from(env.hbKullanici + ':' + env.hbSifre).toString('base64');
  return kanalHttp({
    hostname: sunucu, path: yolK, method: yontem,
    headers: { 'Authorization': auth, 'User-Agent': String(env.hbMerchantId) }
  }, govdeObj);
}
function eslemeOku() { return oku('kanal-esleme.json', {}); }
function kanalDurumYaz(k, v) {
  const d = oku('kanal-durum.json', {});
  d[k] = Object.assign(d[k] || {}, v, { zaman: new Date().toISOString() });
  yaz('kanal-durum.json', d);
}
/* Stok + fiyat gönderimi (eşleşmiş ürünler) */
async function kanalStokGonder() {
  const cfg = oku('cms.json', {});
  const esleme = eslemeOku();
  const env = oku('env.json', {});
  const urunler = (cfg.products || []).filter(p => p.type === 'product' && esleme[p.id]);
  if (!urunler.length) return;
  if (trendyolAktif()) {
    const items = urunler.filter(p => esleme[p.id].barkod).map(p => ({
      barcode: esleme[p.id].barkod,
      quantity: typeof p.stok === 'number' ? Math.max(0, p.stok) : 999,
      salePrice: Number(p.price) || 0,
      listPrice: Number(p.price) || 0
    }));
    if (items.length) {
      try {
        await trendyolIstek('POST', '/inventory/sellers/' + env.trendyolSaticiId + '/products/price-and-inventory', { items: items });
        kanalDurumYaz('trendyolStok', { ok: true, adet: items.length, hata: '' });
      } catch (e) { kanalDurumYaz('trendyolStok', { ok: false, hata: e.message }); }
    }
  }
  if (hbAktif()) {
    const items = urunler.filter(p => esleme[p.id].hbSku).map(p => ({
      merchantSku: esleme[p.id].hbSku,
      availableStock: typeof p.stok === 'number' ? Math.max(0, p.stok) : 999
    }));
    if (items.length) {
      try {
        await hbIstek('POST', 'listing-external.hepsiburada.com', '/listings/merchantid/' + env.hbMerchantId + '/stock-uploads', items);
        kanalDurumYaz('hbStok', { ok: true, adet: items.length, hata: '' });
      } catch (e) { kanalDurumYaz('hbStok', { ok: false, hata: e.message }); }
    }
  }
}
/* Pazaryeri siparişlerini içeri al */
function kanalSiparisEkle(liste, cfg, esleme, yeni) {
  if (liste.some(s => s.kanal === yeni.kanal && s.kanalNo === yeni.kanalNo)) return false;
  // Stok düş (eşleşen ürün bulunursa)
  (yeni.kalemler || []).forEach(k => {
    const pid = Object.keys(esleme).find(id => (esleme[id].barkod && esleme[id].barkod === k.barkod) || (esleme[id].hbSku && esleme[id].hbSku === k.sku));
    if (!pid) return;
    const p = (cfg.products || []).find(x => x.id === pid);
    if (p && typeof p.stok === 'number') p.stok = Math.max(0, p.stok - (k.adet || 1));
  });
  liste.unshift(yeni);
  return true;
}
async function kanalSiparisCek() {
  const liste = oku('siparisler.json', []);
  const cfg = oku('cms.json', {});
  const esleme = eslemeOku();
  const env = oku('env.json', {});
  let eklenen = 0, cfgDegisti = false;
  if (trendyolAktif()) {
    try {
      const y = await trendyolIstek('GET', '/order/sellers/' + env.trendyolSaticiId + '/orders?status=Created&size=50&orderByField=PackageLastModifiedDate&orderByDirection=DESC');
      (y.content || []).forEach(pk => {
        const kalemler = (pk.lines || []).map(l => ({ ad: l.productName || 'Trendyol ürünü', adet: l.quantity || 1, fiyat: Number(l.price) || 0, barkod: l.barcode || '', hacim: '' }));
        const adres = pk.shipmentAddress || {};
        const tamam = kanalSiparisEkle(liste, cfg, esleme, {
          no: 'TY-' + (pk.orderNumber || pk.id),
          kanal: 'trendyol', kanalNo: String(pk.orderNumber || pk.id),
          tarih: new Date(pk.orderDate || Date.now()).toISOString(),
          durum: 'yeni', odendi: true, odeme: 'pazaryeri',
          musteri: { ad: ((pk.customerFirstName || '') + ' ' + (pk.customerLastName || '')).trim() || 'Trendyol Müşterisi', eposta: pk.customerEmail || '' },
          teslimat: { adres: adres.fullAddress || '', il: adres.city || '', ilce: adres.district || '' },
          kalemler: kalemler,
          araToplam: Number(pk.totalPrice) || 0, kargo: 0, indirim: 0,
          toplam: Number(pk.totalPrice) || kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0),
          gecmis: [{ tarih: new Date().toISOString(), islem: 'Trendyol\'dan alındı · paket ' + pk.id }]
        });
        if (tamam) { eklenen++; cfgDegisti = true; }
      });
      kanalDurumYaz('trendyolSiparis', { ok: true, hata: '' });
    } catch (e) { kanalDurumYaz('trendyolSiparis', { ok: false, hata: e.message }); }
  }
  if (hbAktif()) {
    try {
      const y = await hbIstek('GET', 'oms-external.hepsiburada.com', '/orders/merchantid/' + env.hbMerchantId + '?offset=0&limit=50');
      const kayitlar = (y.items || y.content || (Array.isArray(y) ? y : [])) || [];
      kayitlar.forEach(o => {
        const satirlar = o.items || o.details || [];
        const kalemler = satirlar.map(l => ({
          ad: (l.productName || (l.product && l.product.name)) || 'Hepsiburada ürünü',
          adet: l.quantity || 1,
          fiyat: Number(l.totalPrice && l.totalPrice.amount != null ? l.totalPrice.amount : l.price) || 0,
          sku: l.merchantSku || l.sku || '', hacim: ''
        }));
        const tamam = kanalSiparisEkle(liste, cfg, esleme, {
          no: 'HB-' + (o.orderNumber || o.id),
          kanal: 'hepsiburada', kanalNo: String(o.orderNumber || o.id),
          tarih: new Date(o.orderDate || o.createdDate || Date.now()).toISOString(),
          durum: 'yeni', odendi: true, odeme: 'pazaryeri',
          musteri: { ad: (o.customer && (o.customer.name || o.customerName)) || 'Hepsiburada Müşterisi', eposta: '' },
          teslimat: { adres: (o.shippingAddress && (o.shippingAddress.address || o.shippingAddress.fullAddress)) || '', il: (o.shippingAddress && o.shippingAddress.city) || '', ilce: (o.shippingAddress && (o.shippingAddress.district || o.shippingAddress.town)) || '' },
          kalemler: kalemler,
          araToplam: kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0), kargo: 0, indirim: 0,
          toplam: kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0),
          gecmis: [{ tarih: new Date().toISOString(), islem: 'Hepsiburada\'dan alındı' }]
        });
        if (tamam) { eklenen++; cfgDegisti = true; }
      });
      kanalDurumYaz('hbSiparis', { ok: true, hata: '' });
    } catch (e) { kanalDurumYaz('hbSiparis', { ok: false, hata: e.message }); }
  }
  if (eklenen) yaz('siparisler.json', liste);
  if (cfgDegisti) yaz('cms.json', cfg);
  return eklenen;
}
async function kanalTur() {
  if (!trendyolAktif() && !hbAktif()) return;
  try { await kanalSiparisCek(); } catch (e) { console.error('[kanal]', e.message); }
  try { await kanalStokGonder(); } catch (e) { console.error('[kanal]', e.message); }
}
setInterval(() => { kanalTur(); }, 10 * 60 * 1000);
setTimeout(() => { kanalTur(); }, 20 * 1000);

/* ---------- Paraşüt e-Arşiv fatura (anahtarlar girilince aktifleşir) ----------
   env.json → parasutClientId, parasutClientSecret, parasutKullanici, parasutSifre, parasutFirmaId
   Sipariş "hazırlanıyor" durumuna geçince satış faturası oluşturulur ve e-Arşiv'e resmileştirme gönderilir. */
function parasutAktif() {
  const env = oku('env.json', {});
  return !!(env.parasutClientId && env.parasutClientSecret && env.parasutKullanici && env.parasutSifre && env.parasutFirmaId);
}
let parasutJeton = { token: '', bitis: 0 };
function parasutHttp(yontem, yolP, govdeObj, token) {
  return new Promise((cozul, hataVer) => {
    const g = govdeObj ? JSON.stringify(govdeObj) : '';
    const basliklar = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) basliklar['Authorization'] = 'Bearer ' + token;
    if (g) basliklar['Content-Length'] = Buffer.byteLength(g);
    const istek = require('https').request({ hostname: 'api.parasut.com', path: yolP, method: yontem, headers: basliklar }, r => {
      let p = '';
      r.on('data', d => { p += d; });
      r.on('end', () => {
        let v = {};
        try { v = p ? JSON.parse(p) : {}; } catch (e) { return hataVer(new Error('Paraşüt yanıtı okunamadı')); }
        if (r.statusCode >= 400) {
          const m = (v.errors && v.errors[0] && (v.errors[0].detail || v.errors[0].title)) || ('Paraşüt hatası ' + r.statusCode);
          return hataVer(new Error(m));
        }
        cozul(v);
      });
    });
    istek.on('error', hataVer);
    if (g) istek.write(g);
    istek.end();
  });
}
async function parasutTokenAl() {
  if (parasutJeton.token && Date.now() < parasutJeton.bitis) return parasutJeton.token;
  const env = oku('env.json', {});
  // OAuth ucu: kimlik HTTP Basic başlığında, gövde form-encoded (client_secret_basic)
  const govdeStr = new URLSearchParams({
    grant_type: 'password',
    username: env.parasutKullanici,
    password: env.parasutSifre
  }).toString();
  const basicAuth = 'Basic ' + Buffer.from(env.parasutClientId + ':' + env.parasutClientSecret).toString('base64');
  const v = await new Promise((cozul, hataVer) => {
    const istek = require('https').request({
      hostname: 'api.parasut.com', path: '/oauth/token', method: 'POST',
      headers: { 'Authorization': basicAuth, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'Content-Length': Buffer.byteLength(govdeStr) }
    }, r => {
      let p = '';
      r.on('data', d => { p += d; });
      r.on('end', () => { try { cozul(JSON.parse(p)); } catch (e) { hataVer(new Error('Paraşüt token yanıtı okunamadı')); } });
    });
    istek.on('error', hataVer);
    istek.setTimeout(20000, () => { istek.destroy(new Error('Paraşüt zaman aşımı')); });
    istek.end(govdeStr);
  });
  if (!v.access_token) throw new Error('Paraşüt oturumu açılamadı: ' + (v.error_description || v.error || 'bilinmeyen'));
  parasutJeton = { token: v.access_token, bitis: Date.now() + ((v.expires_in || 7200) - 120) * 1000 };
  return parasutJeton.token;
}
async function parasutFaturaKes(s, secenek) {
  secenek = secenek || {};
  const env = oku('env.json', {});
  const firma = env.parasutFirmaId;
  const token = await parasutTokenAl();
  const eposta = (s.musteri && s.musteri.eposta || '').toLowerCase();
  const kurumsal = s.faturaBilgi && s.faturaBilgi.tip === 'kurumsal' && s.faturaBilgi.vkn;
  // 1) Müşteri kartı: kurumsalda VKN ile, bireyselde e-postayla bul; yoksa oluştur
  let kisiId = null;
  if (kurumsal) {
    const bulunan = await parasutHttp('GET', '/v4/' + firma + '/contacts?filter[tax_number]=' + encodeURIComponent(s.faturaBilgi.vkn), null, token);
    if (bulunan.data && bulunan.data.length) kisiId = bulunan.data[0].id;
  } else if (eposta) {
    const bulunan = await parasutHttp('GET', '/v4/' + firma + '/contacts?filter[email]=' + encodeURIComponent(eposta), null, token);
    if (bulunan.data && bulunan.data.length) kisiId = bulunan.data[0].id;
  }
  if (!kisiId) {
    const yeni = await parasutHttp('POST', '/v4/' + firma + '/contacts', {
      data: { type: 'contacts', attributes: {
        name: kurumsal ? s.faturaBilgi.unvan : ((s.musteri && s.musteri.ad) || 'Müşteri'),
        email: eposta || undefined,
        contact_type: kurumsal ? 'company' : 'person',
        account_type: 'customer',
        tax_number: kurumsal ? s.faturaBilgi.vkn : undefined,
        tax_office: kurumsal ? s.faturaBilgi.vergiDairesi : undefined,
        address: (s.musteri && s.musteri.adres) || undefined,
        city: (s.musteri && s.musteri.il) || undefined
      } }
    }, token);
    kisiId = yeni.data && yeni.data.id;
  }
  if (!kisiId) throw new Error('Paraşüt müşteri kartı oluşturulamadı');
  // 2) Paraşüt ürün kartları: önce STOK KODUYLA bul, sonra adla; yoksa stok koduyla yeni kart aç
  async function parasutUrun(ad, kdvOran, stokKodu) {
    const adK = String(ad).slice(0, 120);
    if (stokKodu) {
      const araKod = await parasutHttp('GET', '/v4/' + firma + '/products?filter[code]=' + encodeURIComponent(stokKodu) + '&page[size]=1', null, token);
      if (araKod.data && araKod.data.length) return araKod.data[0].id;
    }
    const ara = await parasutHttp('GET', '/v4/' + firma + '/products?filter[name]=' + encodeURIComponent(adK) + '&page[size]=1', null, token);
    if (ara.data && ara.data.length) return ara.data[0].id;
    const yeni = await parasutHttp('POST', '/v4/' + firma + '/products', {
      data: { type: 'products', attributes: { name: adK, code: stokKodu || undefined, vat_rate: kdvOran, unit: 'Adet', currency: 'TRL', inventory_tracking: false } }
    }, token);
    if (!(yeni.data && yeni.data.id)) throw new Error('Paraşüt ürün kartı açılamadı: ' + adK);
    return yeni.data.id;
  }
  // 3) Satış faturası (kalemler KDV dahil tutulur; Paraşüt'e KDV hariç birim fiyat gider)
  const katalog = oku('cms.json', {});
  // Kupon + üyelik indirimi satırlara orantılı dağıtılır (fatura toplamı = tahsil edilen tutar)
  const araT = Number(s.araToplam) || (s.kalemler || []).reduce((t, k) => t + (Number(k.fiyat) || 0) * (k.adet || 1), 0);
  const indT = (Number(s.indirim) || 0) + (s.uyeIndirim && Number(s.uyeIndirim.tutar) || 0);
  const indirimOran = araT > 0 ? Math.max(0, (araT - indT) / araT) : 1;
  const detaylar = [];
  for (const k of (s.kalemler || [])) {
    const kdvOran = (typeof k.kdv === 'number' ? k.kdv : 1);
    const birimHaric = (Number(k.fiyat) || 0) * indirimOran / (1 + kdvOran / 100);
    const urunAd = (k.ad || 'Ürün') + (k.hacim ? ' ' + k.hacim : '');
    // Stok kodu: kalemde varsa o; yoksa (eski siparişler) üründen adıyla bulunur
    let siteKod = k.kod || k.id || '';
    if (!siteKod) {
      const kayit = urunKaydi(katalog, k.ad);
      if (kayit && kayit.id) siteKod = kayit.id;
    }
    // Panelde ürüne girilmiş Green Ops kodu varsa o öncelikli
    const katKayit = (katalog.products || []).find(x => x.id === siteKod);
    const stokKodu = (katKayit && katKayit.stokKodu) ? katKayit.stokKodu : greenOpsKodu(siteKod);
    const urunId = await parasutUrun(urunAd, kdvOran, stokKodu);
    detaylar.push({ type: 'sales_invoice_details', attributes: {
      quantity: k.adet || 1,
      unit_price: Math.round(birimHaric * 10000) / 10000,
      vat_rate: kdvOran,
      description: urunAd
    }, relationships: { product: { data: { id: urunId, type: 'products' } } } });
  }
  if (s.kargo && Number(s.kargo) > 0) {
    const kargoId = await parasutUrun('Kargo Bedeli', 20, 'KARGO');
    detaylar.push({ type: 'sales_invoice_details', attributes: { quantity: 1, unit_price: Math.round((Number(s.kargo) / 1.20) * 10000) / 10000, vat_rate: 20, description: 'Kargo bedeli' }, relationships: { product: { data: { id: kargoId, type: 'products' } } } });
  }
  const fat = await parasutHttp('POST', '/v4/' + firma + '/sales_invoices', {
    data: {
      type: 'sales_invoices',
      attributes: {
        item_type: 'invoice',
        issue_date: new Date().toISOString().slice(0, 10),
        currency: 'TRL',
        shipment_included: false,
        description: 'Sipariş ' + s.no + (s.kaynak === 'wordpress' ? ' (eski site, sipariş tarihi: ' + String(s.tarih || '').slice(0, 10) + ')' : '') + (s.indirim ? ' · İndirim: ₺' + s.indirim : '')
      },
      relationships: {
        contact: { data: { id: kisiId, type: 'contacts' } },
        details: { data: detaylar }
      }
    }
  }, token);
  const fatId = fat.data && fat.data.id;
  if (!fatId) throw new Error('Paraşüt faturası oluşturulamadı');
  // TEST MODU: env.parasutTaslak=true → resmileştirme yapılmaz, Paraşüt'te taslak kalır (silinebilir)
  if (env.parasutTaslak) {
    s.fatura = { durum: 'kesildi', kaynak: 'parasut', belge: 'taslak (test)', parasutId: fatId, no: 'TASLAK-' + fatId, tarih: new Date().toISOString() };
    return s.fatura;
  }
  // İSTENEN TASLAK: panelden "taslak fatura oluştur" → resmileştirilmez; muhasebe Paraşüt'te kontrol edip keser
  if (secenek.taslak) {
    s.fatura = { durum: 'taslak', kaynak: 'parasut', belge: 'Paraşüt taslağı', parasutId: fatId, no: 'TASLAK-' + fatId, tarih: new Date().toISOString(), eski: !!(s.fatura && s.fatura.eski) };
    return s.fatura;
  }
  // 3) Resmileştirme: kurumsal alıcı e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv
  let belgeTip = 'e-Arşiv', eIs = '';
  try {
    let gelenKutusu = null;
    if (kurumsal) {
      try {
        const kutular = await parasutHttp('GET', '/v4/' + firma + '/e_invoice_inboxes?filter[vkn]=' + encodeURIComponent(s.faturaBilgi.vkn), null, token);
        if (kutular.data && kutular.data.length) gelenKutusu = kutular.data[0];
      } catch (e2) { /* sorgu başarısızsa e-Arşiv'e düşülür */ }
    }
    if (gelenKutusu) {
      belgeTip = 'e-Fatura';
      const ef = await parasutHttp('POST', '/v4/' + firma + '/e_invoices', {
        data: { type: 'e_invoices', attributes: {
          scenario: 'basic',
          to: (gelenKutusu.attributes && (gelenKutusu.attributes.e_invoice_address || gelenKutusu.attributes.address)) || undefined
        }, relationships: { invoice: { data: { id: fatId, type: 'sales_invoices' } } } }
      }, token);
      eIs = (ef.data && ef.data.id) || '';
    } else {
      const ea = await parasutHttp('POST', '/v4/' + firma + '/e_archives', {
        data: { type: 'e_archives', attributes: {
          internet_sale: {
            url: SITE(),
            payment_type: s.odeme === 'kart' ? 'KREDIKARTI/BANKAKARTI' : 'EFT/HAVALE',
            payment_platform: SITE_AD(),
            payment_date: new Date().toISOString().slice(0, 10)
          }
        }, relationships: { sales_invoice: { data: { id: fatId, type: 'sales_invoices' } } } }
      }, token);
      eIs = (ea.data && ea.data.id) || '';
    }
  } catch (e) {
    // Resmileştirme başarısızsa fatura taslak kalır; panelden tekrar denenebilir
    s.fatura = { durum: 'hata', kaynak: 'parasut', parasutId: fatId, hata: 'Fatura taslak oluştu, ' + belgeTip + ' gönderilemedi: ' + e.message, tarih: new Date().toISOString() };
    return s.fatura;
  }
  s.fatura = {
    durum: 'kesildi', kaynak: 'parasut', belge: belgeTip,
    parasutId: fatId, eArsivIs: eIs,
    no: (fat.data.attributes && (fat.data.attributes.invoice_no || fat.data.attributes.invoice_id)) || ('P-' + fatId),
    tarih: new Date().toISOString()
  };
  return s.fatura;
}

/* ---------- iyzico para iadesi ----------
   İade onaylanınca kartla ödenmiş siparişlerde tutar otomatik iade edilir. */
async function iyziParaIade(s, tutar) {
  if (!iyzicoAktif() || !s.odemeId) throw new Error('Kart iadesi için ödeme kaydı yok.');
  const detay = await iyziIstek('/payment/detail', { locale: 'tr', paymentId: s.odemeId });
  const islemler = (detay && detay.itemTransactions) || [];
  if (detay.status !== 'success' || !islemler.length) throw new Error('iyzico ödeme detayı alınamadı.');
  let kalan = Math.min(Number(tutar) || 0, Number(s.toplam) || 0);
  const sonuclar = [];
  for (const it of islemler) {
    if (kalan <= 0) break;
    const parca = Math.min(kalan, Number(it.paidPrice) || 0);
    if (parca <= 0) continue;
    const y = await iyziIstek('/payment/refund', {
      locale: 'tr',
      paymentTransactionId: it.paymentTransactionId,
      price: parca.toFixed(2),
      currency: 'TRY',
      ip: '85.95.0.1'
    });
    sonuclar.push({ islem: it.paymentTransactionId, tutar: parca, durum: y.status, hata: y.errorMessage || '' });
    if (y.status === 'success') kalan -= parca;
  }
  const iadeEdilen = (Number(tutar) || 0) - kalan;
  return { iadeEdilen: Math.round(iadeEdilen * 100) / 100, sonuclar: sonuclar, tamam: kalan <= 0.005 };
}

/* ---------- iyzico Checkout Form (anahtar girilince aktifleşir) ----------
   env.json → iyzicoApiKey, iyzicoSecret, iyzicoCanli (true = api.iyzipay.com)
   Akış: sepette "kart" seçilir → sipariş 'odeme-bekliyor' kaydedilir →
   iyzico ödeme sayfasına yönlendirilir → callback /api/odeme-sonuc doğrular. */
/* Kargo ücreti (panel > Ayarlar > Kargo): cms.kargo = { ucret, esik, esikAktif, kampanyaBitis } */
function kargoAyar(cfg) {
  const k = (cfg && cfg.kargo) || {};
  return { ucret: Number.isFinite(+k.ucret) && +k.ucret >= 0 ? +k.ucret : 80, esik: Number.isFinite(+k.esik) && +k.esik >= 0 ? +k.esik : 500,
    esikAktif: k.esikAktif !== false, kampanyaBitis: /^\d{4}-\d{2}-\d{2}$/.test(k.kampanyaBitis || '') ? k.kampanyaBitis : '' };
}
function kargoUcreti(cfg, ara, kuponBedava) {
  const k = kargoAyar(cfg);
  if (kuponBedava) return 0;
  if (k.kampanyaBitis && new Date().toISOString().slice(0, 10) <= k.kampanyaBitis) return 0; // herkese ücretsiz kargo kampanyası
  if (k.esikAktif && ara >= k.esik) return 0;
  return k.ucret;
}
function iyzicoAktif() {
  const env = oku('env.json', {});
  return !!(env.iyzicoApiKey && env.iyzicoSecret);
}
/* ---------- Paratika (Payten altyapısı) — Ortak Ödeme Sayfası (HPP) + 3D Secure ----------
   env.json: paratikaMerchant, paratikaKullanici, paratikaSifre, paratikaGizli (hash anahtarı), paratikaTest (true → entegrasyon ortamı)
   Akış: SESSIONTOKEN → müşteri Paratika ödeme sayfasında öder → tarayıcı /api/paratika-donus'a POST eder
   Doğrulama: sdSha512 = SHA512(merchantPaymentId|customerId|sessionToken|responseCode|random|hashAnahtarı) + oturum/tutar eşleşmesi */
function paratikaAktif() {
  const e = oku('env.json', {});
  return !!(e.paratikaMerchant && e.paratikaKullanici && e.paratikaSifre && e.paratikaGizli);
}
function kartAktif() { return paratikaAktif() || iyzicoAktif(); }
function paratikaAdres() {
  const e = oku('env.json', {});
  const kok = e.paratikaTest ? 'https://entegrasyon.paratika.com.tr' : 'https://vpos.paratika.com.tr';
  return { api: kok + '/paratika/api/v2', odeme: (e.paratikaOdemeSayfasi || (kok + '/payment/')) };
}
function paratikaIstek(alanlar) {
  const e = oku('env.json', {});
  const govdeStr = new URLSearchParams(Object.assign({ MERCHANT: e.paratikaMerchant, MERCHANTUSER: e.paratikaKullanici, MERCHANTPASSWORD: e.paratikaSifre }, alanlar)).toString();
  const u = new URL(paratikaAdres().api);
  return new Promise((cozul, red) => {
    const istek = require('https').request({ hostname: u.hostname, path: u.pathname, method: 'POST', timeout: 20000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(govdeStr) } }, rr => {
      let p = ''; rr.setEncoding('utf8'); rr.on('data', d => p += d);
      rr.on('end', () => { try { cozul(JSON.parse(p)); } catch (x) { red(new Error('Paratika yanıtı okunamadı (HTTP ' + rr.statusCode + ')')); } });
    });
    istek.on('timeout', () => istek.destroy(new Error('Paratika zaman aşımı')));
    istek.on('error', red);
    istek.end(govdeStr);
  });
}
async function paratikaOturum(s, req) {
  const m = s.musteri || {};
  const tutar = Number(s.toplam).toFixed(2);
  const y = await paratikaIstek({
    ACTION: 'SESSIONTOKEN', SESSIONTYPE: 'PAYMENTSESSION',
    MERCHANTPAYMENTID: s.no, AMOUNT: tutar, CURRENCY: 'TRY',
    RETURNURL: SITE() + '/api/paratika-donus',
    CUSTOMER: s.no, CUSTOMERNAME: String(m.ad || '').slice(0, 100), CUSTOMEREMAIL: String(m.eposta || '').slice(0, 100),
    CUSTOMERPHONE: String(m.telefon || '').replace(/\D/g, '').replace(/^(90|0)/, '').slice(0, 10),
    CUSTOMERIP: String((req.headers || {})['x-real-ip'] || (req.socket || {}).remoteAddress || '46.225.219.32').split(',')[0].trim(),
    CUSTOMERUSERAGENT: String((req.headers || {})['user-agent'] || 'Olivamore-Abonelik').slice(0, 250),
    // Kalem tutarları toplamı = AMOUNT olmalı → tek satır (indirim/kargo dahil sipariş toplamı)
    ORDERITEMS: JSON.stringify([{ code: s.no, name: 'Olivamore siparişi ' + s.no, description: (s.kalemler || []).map(k => k.adet + 'x ' + k.ad).join(', ').slice(0, 250), quantity: 1, amount: Number(tutar) }])
  });
  if (y && y.responseCode === '00' && y.sessionToken) return { token: y.sessionToken, url: paratikaAdres().odeme + y.sessionToken, post: paratikaAdres().api + '/post/sale3d/' + y.sessionToken };
  throw new Error((y && (y.errorMsg || y.responseMsg)) || 'oturum açılamadı');
}
function paratikaImzaDogru(p) {
  const e = oku('env.json', {});
  if (!e.paratikaGizli || !p.sdSha512) return false;
  const beklenen = crypto.createHash('sha512').update([p.merchantPaymentId, p.customerId, p.sessionToken, p.responseCode, p.random, e.paratikaGizli].join('|'), 'utf8').digest('hex');
  const a = Buffer.from(String(p.sdSha512).toLowerCase()), b = Buffer.from(beklenen);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Kart ödemesi onaylandı (iyzico / Paratika ortak): sipariş + abonelik + bildirimler
function kartOdemesiTamam(s, liste, odemeId, saglayici, ek) {
  if (s.durum !== 'odeme-bekliyor') return;
  s.durum = 'yeni'; s.odendi = true; s.odemeId = odemeId || ''; s.odemeSaglayici = saglayici;
  if (ek) Object.assign(s, ek);
  s.gecmis = s.gecmis || [];
  s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'kart ödemesi alındı · ' + saglayici + (odemeId ? ' (' + odemeId + ')' : '') });
  if (s.abonelikId) {
    const abListe = oku('abonelikler.json', []);
    const ab = abListe.find(a => a.id === s.abonelikId);
    if (ab && ab.durum !== 'aktif') {
      ab.durum = 'aktif';
      ab.sonrakiTarih = new Date(Date.now() + (ab.periyotGun || 30) * 86400000).toISOString().slice(0, 10);
      ab.sonSiparis = s.no;
      yaz('abonelikler.json', abListe);
      epostaBildir('Abonelik AKTİFLEŞTİ: ' + ab.id, ab.eposta + ' · ' + ab.urun + '\nSonraki teslim: ' + ab.sonrakiTarih);
    }
  }
  yaz('siparisler.json', liste);
  metaSatinAlma(s);
  epostaBildir('Yeni sipariş ' + s.no + ' · ₺' + s.toplam.toLocaleString('tr-TR') + ' (KART İLE ÖDENDİ · ' + saglayici + ')',
    s.kalemler.map(k => k.adet + ' × ' + k.ad).join('\n') +
    '\n\nMüşteri: ' + s.musteri.ad + ' / ' + s.musteri.telefon + ' / ' + s.musteri.eposta + '\nAdres: ' + s.musteri.adres);
  epostaGonder(s.musteri.eposta, 'Siparişin alındı · ' + s.no,
    'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişin ödemesi alındı (₺' + s.toplam.toLocaleString('tr-TR') + '). Hazırlanıp kargoya verildiğinde tekrar haber vereceğiz.\n\nAfiyet olsun,\nOlivamore');
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
  return n > 60; // mobil operatörlerde çok kullanıcı aynı IP'yi paylaşır
}


/* ---------- Web analizi (birinci taraf, çerezsiz: tarayıcıda anonim kimlik) ----------
   Olaylar /var/www/olivamore-data/analiz/GG-AA-YYYY değil YYYY-AA-GG.jsonl dosyalarına satır satır eklenir.
   IP adresi SAKLANMAZ. Botlar elenir. */
const ANALIZ_DIZIN = () => { const d = dosya('analiz'); if (!fs.existsSync(d)) fs.mkdirSync(d); return d; };
const OLAY_TURLERI = ['sayfa', 'urun_gor', 'sepete_ekle', 'sepetten_cikar', 'odeme_basla', 'odeme_adim2', 'satin_al', 'tarif_ara'];
const olaySayac = new Map();
setInterval(() => olaySayac.clear(), 60000);
function olayKaydet(req, g) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|python|curl|wget/i.test(ua)) return;
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '?';
  const n = (olaySayac.get(ip) || 0) + 1; olaySayac.set(ip, n);
  if (n > 400) return; // kötüye kullanım koruması (normal kullanıcı dakikada birkaç olay üretir)
  const e = String(g.e || '');
  if (OLAY_TURLERI.indexOf(e) === -1) return;
  const kis = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').slice(0, n);
  const cihaz = /iPad|Tablet/i.test(ua) ? 'tablet' : (/Mobi|Android|iPhone/i.test(ua) ? 'mobil' : 'masaustu');
  const satir = {
    t: Date.now(), e: e,
    v: kis(g.v, 40), s: kis(g.s, 40),
    p: kis(g.p, 200), ti: kis(g.ti, 120),
    r: kis(g.r, 120), us: kis(g.us, 60), um: kis(g.um, 60), uc: kis(g.uc, 80),
    gc: g.gc ? 1 : 0, fc: g.fc ? 1 : 0,
    c: cihaz, dl: g.dl === 'en' ? 'en' : 'tr',
    u: kis(g.u, 60), ua2: kis(g.ad, 120), d: Math.max(0, Math.min(1e7, Number(g.d) || 0)), a: Math.max(0, Math.min(99, parseInt(g.a, 10) || 0)),
    no: kis(g.no, 20), y: g.y ? 1 : 0
  };
  if (!satir.v || !satir.s) return;
  const gun = new Date().toISOString().slice(0, 10);
  try { fs.appendFileSync(path.join(ANALIZ_DIZIN(), gun + '.jsonl'), JSON.stringify(satir) + '\n'); } catch (er) { console.error('[analiz]', er.message); }
  if (g.rz && META_OLAY[e] && g.eid) {
    const cd = { currency: 'TRY' };
    if (satir.u) { cd.content_ids = [satir.u]; cd.content_type = 'product'; }
    if (satir.d) cd.value = satir.d;
    if (satir.a) cd.num_items = satir.a;
    metaGonder([{ event_name: META_OLAY[e], event_time: Math.floor(satir.t / 1000), event_id: kis(g.eid, 60), action_source: 'website',
      event_source_url: SITE() + satir.p,
      user_data: { client_ip_address: String(ip).split(',')[0].trim(), client_user_agent: ua, fbp: kis(g.fbp, 120) || undefined, fbc: kis(g.fbc, 200) || undefined, external_id: [sha(satir.v)] },
      custom_data: cd }]);
  }
}
function analizOku(gunSay) {
  const dz = ANALIZ_DIZIN(), olaylar = [];
  for (let i = gunSay - 1; i >= 0; i--) {
    const gun = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const yolF = path.join(dz, gun + '.jsonl');
    if (!fs.existsSync(yolF)) continue;
    fs.readFileSync(yolF, 'utf8').split('\n').forEach(l => { if (l) { try { olaylar.push(JSON.parse(l)); } catch (e) { } } });
  }
  return olaylar;
}
// Trafik kanalı: oturumun ilk olayındaki referans + UTM + reklam tıklama kimliğinden
function kanalBul(o) {
  const us = (o.us || '').toLowerCase(), um = (o.um || '').toLowerCase(), r = (o.r || '').toLowerCase();
  if (o.gc || (us.indexOf('google') !== -1 && /cpc|ppc|paid|ads/.test(um))) return 'Google Reklam';
  if (/cpc|ppc|paid|ads|reklam/.test(um) && /(facebook|instagram|meta|fb|ig)/.test(us)) return 'Meta Reklam';
  if (o.fc && !us) return 'Meta Reklam';
  if (/mail|newsletter|bulten|e-posta|eposta/.test(um + us)) return 'E-posta';
  if (us) return 'Kampanya: ' + o.us;
  if (!r) return 'Doğrudan';
  if (/google\./.test(r)) return 'Google (organik)';
  if (/bing\.|yandex\.|duckduckgo|yahoo\./.test(r)) return 'Diğer arama motoru';
  if (/instagram\./.test(r)) return 'Instagram';
  if (/facebook\.|fb\.com|fb\.me|m\.me/.test(r)) return 'Facebook';
  if (/t\.co|twitter\.|x\.com/.test(r)) return 'X (Twitter)';
  if (/tiktok\./.test(r)) return 'TikTok';
  if (/youtube\.|youtu\.be/.test(r)) return 'YouTube';
  if (/whatsapp|wa\.me/.test(r)) return 'WhatsApp';
  if (/trendyol|hepsiburada|amazon/.test(r)) return 'Pazaryeri';
  if (/olivamore\./.test(r)) return 'Doğrudan';
  return 'Diğer site: ' + r;
}
function webAnaliz(gunSay) {
  const olaylar = analizOku(gunSay);
  const siparisler = oku('siparisler.json', []);
  const sipBul = no => siparisler.find(x => x.no === no);
  const oturumlar = new Map();
  olaylar.forEach(o => {
    let ot = oturumlar.get(o.s);
    if (!ot) { ot = { s: o.s, v: o.v, bas: o.t, son: o.t, kanal: kanalBul(o), r: o.r, us: o.us, um: o.um, uc: o.uc, c: o.c, dl: o.dl, adimlar: [], sayfa: 0, urun: 0, sepet: 0, odeme: 0, satin: [] }; oturumlar.set(o.s, ot); }
    ot.son = Math.max(ot.son, o.t);
    if (o.e === 'sayfa') ot.sayfa++;
    if (o.e === 'urun_gor') ot.urun++;
    if (o.e === 'sepete_ekle') ot.sepet++;
    if (o.e === 'odeme_basla' || o.e === 'odeme_adim2') ot.odeme++;
    if (o.e === 'satin_al' && o.no && ot.satin.indexOf(o.no) === -1) ot.satin.push(o.no);
    if (ot.adimlar.length < 60) ot.adimlar.push({ t: o.t, e: o.e, p: o.p, ti: o.ti, u: o.u, ad: o.ua2, d: o.d, a: o.a, no: o.no });
  });
  const ot = Array.from(oturumlar.values());
  const ziyaretci = new Set(ot.map(x => x.v)).size;
  const sayfaGos = olaylar.filter(o => o.e === 'sayfa').length;
  const satinOturum = ot.filter(x => x.satin.length);
  // Ciro: siparis kaydından (iptal/iade/ödenmemiş hariç)
  const gecerli = s => s && ['iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'].indexOf(s.durum) === -1;
  const otCiro = x => x.satin.reduce((t, no) => { const s = sipBul(no); return t + (gecerli(s) ? (Number(s.toplam) || 0) : 0); }, 0);
  // Kanallar
  const kanal = {};
  ot.forEach(x => {
    const k = kanal[x.kanal] = kanal[x.kanal] || { kanal: x.kanal, oturum: 0, ziyaretci: new Set(), sepet: 0, satin: 0, ciro: 0 };
    k.oturum++; k.ziyaretci.add(x.v); if (x.sepet) k.sepet++; if (x.satin.length) k.satin++; k.ciro += otCiro(x);
  });
  // Kampanyalar (UTM)
  const kampanya = {};
  ot.filter(x => x.us || x.uc).forEach(x => {
    const ad = [x.us, x.um, x.uc].filter(Boolean).join(' / ');
    const k = kampanya[ad] = kampanya[ad] || { ad: ad, oturum: 0, sepet: 0, satin: 0, ciro: 0 };
    k.oturum++; if (x.sepet) k.sepet++; if (x.satin.length) k.satin++; k.ciro += otCiro(x);
  });
  // Sayfalar
  const sayfa = {};
  olaylar.filter(o => o.e === 'sayfa').forEach(o => {
    const p = (o.p || '/').replace(/\.html$/, '').replace(/[?#].*$/, '') || '/';
    const k = sayfa[p] = sayfa[p] || { p: p, ti: o.ti, gos: 0, kisi: new Set(), giris: 0 };
    k.gos++; k.kisi.add(o.v); if (!k.ti && o.ti) k.ti = o.ti;
  });
  ot.forEach(x => { const ilk = x.adimlar.find(a => a.e === 'sayfa'); if (ilk) { const p = (ilk.p || '/').replace(/\.html$/, '').replace(/[?#].*$/, '') || '/'; if (sayfa[p]) sayfa[p].giris++; } });
  // Ürünler
  const urun = {};
  olaylar.forEach(o => {
    if (!o.u || (o.e !== 'urun_gor' && o.e !== 'sepete_ekle')) return;
    const k = urun[o.u] = urun[o.u] || { u: o.u, ad: o.ua2 || o.u, gor: 0, sepet: 0, satis: 0 };
    if (o.ua2) k.ad = o.ua2;
    if (o.e === 'urun_gor') k.gor++; else k.sepet += (o.a || 1);
  });
  satinOturum.forEach(x => x.satin.forEach(no => { const s = sipBul(no); if (!gecerli(s)) return; (s.kalemler || []).forEach(kl => { const id = kl.kod || kl.ad; const k = urun[id] = urun[id] || { u: id, ad: kl.ad, gor: 0, sepet: 0, satis: 0 }; k.satis += kl.adet || 1; }); }));
  // Günlük seri
  const gunluk = {};
  for (let i = gunSay - 1; i >= 0; i--) gunluk[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = { ziyaretci: new Set(), oturum: 0, satin: 0 };
  ot.forEach(x => { const g = new Date(x.bas).toISOString().slice(0, 10); if (gunluk[g]) { gunluk[g].ziyaretci.add(x.v); gunluk[g].oturum++; if (x.satin.length) gunluk[g].satin++; } });
  // Cihaz
  const cihaz = {}; ot.forEach(x => { cihaz[x.c] = (cihaz[x.c] || 0) + 1; });
  // Canlı (son 5 dk)
  const simdi = Date.now();
  const canli = ot.filter(x => simdi - x.son < 5 * 60000).map(x => { const s = x.adimlar[x.adimlar.length - 1]; return { kanal: x.kanal, c: x.c, p: s && s.p, ti: s && s.ti, sepet: x.sepet }; });
  // Ziyaretçi yolculukları (son 150 oturum)
  const yolculuk = ot.sort((a, b) => b.bas - a.bas).slice(0, 150).map(x => {
    const ilkSip = x.satin.map(sipBul).find(Boolean);
    return {
      bas: x.bas, sure: Math.round((x.son - x.bas) / 1000), kanal: x.kanal, r: x.r, uc: x.uc, c: x.c, dl: x.dl,
      sayfa: x.sayfa, sepet: x.sepet, odeme: x.odeme, satin: x.satin, ciro: otCiro(x),
      musteri: ilkSip ? (ilkSip.musteri && ilkSip.musteri.ad) + ' · ' + (ilkSip.musteri && ilkSip.musteri.il || '') : '',
      ziyaretSayisi: ot.filter(y => y.v === x.v).length,
      adimlar: x.adimlar.map(a => ({ t: a.t, e: a.e, p: (a.p || '').replace(/\.html/, ''), ti: a.ti, ad: a.ad, d: a.d, no: a.no }))
    };
  });
  const sureler = ot.filter(x => x.sayfa > 1).map(x => (x.son - x.bas) / 1000);
  return {
    gun: gunSay,
    ozet: {
      ziyaretci: ziyaretci, oturum: ot.length, sayfaGos: sayfaGos,
      sayfaOturum: ot.length ? Math.round(sayfaGos / ot.length * 10) / 10 : 0,
      hemenCikma: ot.length ? Math.round(ot.filter(x => x.sayfa <= 1 && !x.sepet).length / ot.length * 100) : 0,
      ortSure: sureler.length ? Math.round(sureler.reduce((a, b) => a + b, 0) / sureler.length) : 0,
      sepetOturum: ot.filter(x => x.sepet).length, odemeOturum: ot.filter(x => x.odeme).length,
      satinOturum: satinOturum.length, ciro: satinOturum.reduce((t, x) => t + otCiro(x), 0),
      donusum: ot.length ? Math.round(satinOturum.length / ot.length * 1000) / 10 : 0
    },
    huni: [
      { ad: 'Siteye gelen oturum', n: ot.length },
      { ad: 'Ürün inceleyen', n: ot.filter(x => x.urun).length },
      { ad: 'Sepete ekleyen', n: ot.filter(x => x.sepet).length },
      { ad: 'Ödemeye geçen', n: ot.filter(x => x.odeme).length },
      { ad: 'Satın alan', n: satinOturum.length }
    ],
    kanallar: Object.values(kanal).map(k => ({ kanal: k.kanal, oturum: k.oturum, ziyaretci: k.ziyaretci.size, sepet: k.sepet, satin: k.satin, ciro: k.ciro })).sort((a, b) => b.oturum - a.oturum),
    kampanyalar: Object.values(kampanya).sort((a, b) => b.oturum - a.oturum).slice(0, 30),
    sayfalar: Object.values(sayfa).map(k => ({ p: k.p, ti: k.ti, gos: k.gos, kisi: k.kisi.size, giris: k.giris })).sort((a, b) => b.gos - a.gos).slice(0, 40),
    urunler: Object.values(urun).sort((a, b) => (b.gor + b.sepet * 3) - (a.gor + a.sepet * 3)).slice(0, 30),
    gunluk: Object.keys(gunluk).map(g => ({ g: g, ziyaretci: gunluk[g].ziyaretci.size, oturum: gunluk[g].oturum, satin: gunluk[g].satin })),
    cihaz: cihaz, canli: canli, yolculuk: yolculuk
  };
}
// Son hatalar (Sağlık ekranı için bellekte tutulur)
const SON_HATALAR = [];
const _konsolHata = console.error.bind(console);
console.error = function () {
  try { SON_HATALAR.unshift({ t: new Date().toISOString(), m: Array.from(arguments).map(a => a && a.stack ? a.stack.split('\n')[0] : String(a)).join(' ').slice(0, 300) }); if (SON_HATALAR.length > 50) SON_HATALAR.pop(); } catch (e) { }
  _konsolHata.apply(null, arguments);
};
function saglikRaporu() {
  const env = oku('env.json', {});
  const boyut = ad => { try { return fs.statSync(dosya(ad)).size; } catch (e) { return 0; } };
  let disk = null;
  try { const st = fs.statfsSync(DATA); disk = { bos: st.bavail * st.bsize, toplam: st.blocks * st.bsize }; } catch (e) { }
  let yedek = null;
  try { const d = '/root/yedekler'; const l = fs.readdirSync(d).filter(x => /^olivamore-veri/.test(x)).map(x => ({ ad: x, t: fs.statSync(path.join(d, x)).mtimeMs })).sort((a, b) => b.t - a.t); if (l[0]) yedek = { ad: l[0].ad, t: new Date(l[0].t).toISOString(), adet: l.length }; } catch (e) { }
  if (!yedek) { const yd = oku('yedek-durum.json', null); if (yd && yd.t) yedek = { ad: yd.ad, t: yd.t, adet: yd.adet || 1 }; }
  const sip = oku('siparisler.json', []);
  const bugun = new Date().toISOString().slice(0, 10);
  const bekleyenOdeme = sip.filter(s => s.durum === 'odeme-bekliyor' && Date.now() - Date.parse(s.tarih) > 30 * 60000).length;
  let cmsOk = true; try { JSON.parse(fs.readFileSync(dosya('cms.json'), 'utf8')); } catch (e) { cmsOk = false; }
  const urunler = (oku('cms.json', {}).products || []).filter(p => (p.type === 'product' || !p.type) && p.visible !== false);
  const gorselsiz = urunler.filter(p => !p.img).length;
  const tukenen = urunler.filter(p => typeof p.stok === 'number' && p.stok <= 0).map(p => p.nameTR + ' ' + (p.unitTR || ''));
  const azalan = urunler.filter(p => typeof p.stok === 'number' && p.stok > 0 && p.stok <= 5).map(p => p.nameTR + ' ' + (p.unitTR || '') + ' (' + p.stok + ')');
  return {
    zaman: new Date().toISOString(),
    servis: { calismaSn: Math.round(process.uptime()), bellekMB: Math.round(process.memoryUsage().rss / 1048576), node: process.version },
    disk: disk, yedek: yedek, cmsOk: cmsOk,
    dosyalar: { cms: boyut('cms.json'), siparisler: boyut('siparisler.json'), uyeler: boyut('uyeler.json') },
    entegrasyon: {
      kartOdeme: kartAktif(), iyzicoCanli: !!env.iyzicoCanli, paratika: paratikaAktif(), paratikaTest: !!env.paratikaTest,
      eposta: !!(env.resendKey || env.brevoKey), bildirimEposta: !!env.bildirimEposta,
      parasut: parasutAktif(), parasutTaslak: !!env.parasutTaslak,
      yurtici: !!(env.yurticiWsUser && env.yurticiWsSifre), yurticiTest: !!env.yurticiTest,
      trendyol: !!(env.trendyolSaticiId && env.trendyolApiKey), hepsiburada: !!(env.hbMerchantId && env.hbKullanici),
      panelSifre: !!(env.adminKullanici && env.adminHash),
      tarifAsistani: !!(env.edamamAppId && env.edamamAppKey), ceviri: !!env.deeplKey,
      greenOps: greenOpsOzet(),
      metaCapi: !!env.metaCapiToken, metaTest: !!env.metaTestKodu, siteAdresi: SITE(),
      banka: !!(bankaBilgi().iban)
    },
    siparis: {
      bugun: sip.filter(s => (s.tarih || '').slice(0, 10) === bugun).length,
      son: sip[0] ? sip[0].tarih : null,
      bekleyenOdeme: bekleyenOdeme,
      yeniBekleyen: sip.filter(s => s.durum === 'yeni').length
    },
    katalog: { gorunurUrun: urunler.length, gorselsiz: gorselsiz, tukenen: tukenen, azalan: azalan },
    envHata: envBozuk() ? String(envBozuk()).slice(0, 160) : '',
    hatalar: SON_HATALAR.slice(0, 20)
  };
}
/* ---------- sunucu ---------- */
const sunucu = http.createServer(async (req, res) => {
  const yol = (req.url || '').split('?')[0];

  try {
    /* ---- halka açık ---- */
    if (req.method === 'GET' && yol === '/api/config') {
      // Disk dosyası değişmedikçe aynı yanıt bellekten verilir (yoğun trafikte hızlı)
      try {
        const st = fs.statSync(dosya('cms.json'));
        if (!cmsOnbellek || cmsOnbellek.mtime !== st.mtimeMs || cmsOnbellek.boyut !== st.size) {
          cmsOnbellek = { mtime: st.mtimeMs, boyut: st.size, govde: JSON.stringify(oku('cms.json', {})) };
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(cmsOnbellek.govde);
      } catch (e) { return json(res, 200, {}); }
    }

    // Sağlık kontrolü (izleme servisleri için): veri dosyaları okunabiliyor mu?
    if (req.method === 'GET' && yol === '/api/saglik') {
      let ok = true; try { JSON.parse(fs.readFileSync(dosya('cms.json'), 'utf8')); fs.accessSync(DATA, fs.constants.W_OK); } catch (e) { ok = false; }
      return json(res, ok ? 200 : 500, { durum: ok ? 'iyi' : 'sorun', zaman: new Date().toISOString(), calismaSn: Math.round(process.uptime()) });
    }

    // Web analizi olayı (navigator.sendBeacon → text/plain JSON). Her zaman 204 döner; site hiç beklemez.
    if (req.method === 'POST' && yol === '/api/olay') {
      try { const g = await govde(req, 0.02); olayKaydet(req, g); } catch (e) { }
      res.writeHead(204); return res.end();
    }

    // ======== Green Ops → Site (Bearer greenOpsApiKey) ========
    if (yol === '/api/entegre/etiket' && req.method === 'GET') {
      const u = new URL(req.url, 'http://x');
      const no = String(u.searchParams.get('no') || '').replace(/[^A-Za-z0-9-]/g, '');
      const exp = parseInt(u.searchParams.get('exp'), 10) || 0, t = String(u.searchParams.get('t') || '');
      const imzaOk = exp > Date.now() / 1000 && t.length === 32 && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(goEtiketImza(no, exp)));
      if (!imzaOk && !goYetkili(req) && !adminYetkili(req)) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Etiket linkinin süresi dolmuş. Green Ops\'ta "Barkod" butonuna tekrar bas.'); }
      const s = oku('siparisler.json', []).find(x => x.no === no);
      if (!s) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Sipariş bulunamadı.'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return res.end(kargoEtiketHtml(s, u.searchParams.get('boyut') || goAyar().etiket));
    }
    if (yol.indexOf('/api/entegre/') === 0) {
      if (!goYetkili(req)) return json(res, 401, { hata: 'Yetkisiz. Authorization: Bearer <greenOpsApiKey> gerekli.' });
      const katalog = oku('cms.json', {});
      if (req.method === 'GET' && yol === '/api/entegre/siparisler') {
        const u = new URL(req.url, 'http://x');
        const sonra = u.searchParams.get('sonra') || '', durumF = u.searchParams.get('durum') || '';
        const liste = oku('siparisler.json', []).filter(s => s.kaynak !== 'wordpress' && GO_DISARIDA.indexOf(s.durum) === -1)
          .filter(s => !sonra || String(s.tarih) > sonra).filter(s => !durumF || s.durum === durumF).slice(0, 500);
        return json(res, 200, { tamam: true, adet: liste.length, siparisler: liste.map(s => goSiparisVeri(s, katalog)) });
      }
      if (req.method === 'GET' && yol === '/api/entegre/siparis') {
        const no = new URL(req.url, 'http://x').searchParams.get('no');
        const s = oku('siparisler.json', []).find(x => x.no === no);
        if (!s) return json(res, 404, { hata: 'Sipariş bulunamadı.' });
        return json(res, 200, { tamam: true, siparis: goSiparisVeri(s, katalog), etiketUrl: s.kargoNo ? goEtiketLinki(s.no) : null });
      }
      if (req.method === 'POST' && yol === '/api/entegre/kargo-barkod') {
        const g = await govde(req, 0.05);
        const no = temiz(g.no, 30);
        if (!no) return json(res, 400, { hata: 'no gerekli' });
        try { const r = await kargoBarkodOlustur(no, { zorla: g.zorla === true, koli: g.koli, kaynak: 'Green Ops' + (g.kullanici ? ' · ' + temiz(g.kullanici, 60) : '') }); return json(res, r.kod, r.veri); }
        catch (e) { return json(res, 502, { hata: 'Kargo servisine ulaşılamadı: ' + e.message }); }
      }
      if (req.method === 'POST' && yol === '/api/entegre/durum') {
        const g = await govde(req, 0.05);
        const izinli = ['hazırlanıyor', 'kargolandı', 'tamamlandı'];
        const yeni = temiz(g.durum, 30);
        if (izinli.indexOf(yeni) === -1) return json(res, 400, { hata: 'durum şunlardan biri olmalı: ' + izinli.join(', ') });
        const liste = oku('siparisler.json', []);
        const s = liste.find(x => x.no === temiz(g.no, 30));
        if (!s) return json(res, 404, { hata: 'Sipariş bulunamadı.' });
        if (['iptal', 'iade'].indexOf(s.durum) !== -1) return json(res, 409, { hata: 'Sipariş ' + s.durum + ' durumunda.' });
        if (s.durum !== yeni) {
          s.gecmis = s.gecmis || [];
          s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'Green Ops: ' + s.durum + ' → ' + yeni + (g.not ? ' · ' + temiz(g.not, 200) : '') });
          s.durum = yeni;
          yaz('siparisler.json', liste);
        }
        return json(res, 200, { tamam: true, no: s.no, durum: s.durum });
      }
      return json(res, 404, { hata: 'Bilinmeyen uç nokta' });
    }
    // Tarif detayı çevirisi (malzeme + yapılış → Türkçe). Kişi başı dakikada 12, istek başına ≤ 50 satır / 9000 karakter
    if (req.method === 'POST' && yol === '/api/tarif-cevir') {
      const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '?');
      const n = (tarifCeviriSayac.get(ip) || 0) + 1; tarifCeviriSayac.set(ip, n);
      if (n > 12) return json(res, 429, { hata: 'yogun' });
      const ayar = tarifAyar();
      if (!ayar || !ayar.deepl) return json(res, 503, { hata: 'kapali' });
      const g = await govde(req, 0.05);
      const satirlar = Array.isArray(g.satirlar) ? g.satirlar.slice(0, 50).map(x => String(x || '').slice(0, 600)) : [];
      if (!satirlar.length || satirlar.join('').length > 9000) return json(res, 400, { hata: 'gecersiz' });
      const c = await deeplCevir(satirlar, 'TR', 'EN', ayar.deepl).catch(() => null);
      if (!c) return json(res, 502, { hata: 'ceviri' });
      return json(res, 200, { tamam: true, satirlar: c });
    }
    // Tarif asistanı (Edamam). Rate-limit: kişi başı dakikada 6, toplam dakikada 9
    if (req.method === 'POST' && yol === '/api/tarif-ara') {
      const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '?');
      const n = (tarifIpSayac.get(ip) || 0) + 1; tarifIpSayac.set(ip, n);
      if (n > 6) return json(res, 429, { hata: 'yogun' });
      const g = await govde(req, 0.02);
      const kimlik = 'om-' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
      const r = await tarifAra(temiz(g.malzemeler, 300), g.dil === 'en', kimlik);
      return json(res, r.durum, r.veri);
    }
    // Hız sınırı: yönetici istekleri ve iyzico geri dönüşü hariç (iyzico tüm müşteriler için aynı IP'den gelir)
    if (req.method === 'POST' && yol !== '/api/odeme-sonuc' && !(yol.indexOf('/api/admin/') === 0 && adminYetkili(req)) && hizAsimi(req)) {
      return json(res, 429, { hata: 'Çok fazla istek; bir dakika sonra tekrar dene.' });
    }

    /* ---- panel girişi ---- */
    if (req.method === 'POST' && yol === '/api/admin/giris') {
      const g = await govde(req, 1);
      const env = oku('env.json', {});
      if (!adminAktif()) return json(res, 400, { hata: 'Panel şifresi henüz atanmamış. Sunucuda admin-sifre-ata.sh çalıştırılmalı.' });
      const kullaniciDogru = temiz(g.kullanici, 60) === env.adminKullanici;
      const deneme = Buffer.from(sifreHashle(String(g.sifre || ''), env.adminTuz), 'hex');
      const gercek = Buffer.from(env.adminHash, 'hex');
      if (!kullaniciDogru || deneme.length !== gercek.length || !crypto.timingSafeEqual(deneme, gercek)) {
        return json(res, 401, { hata: 'Kullanıcı adı veya şifre hatalı.' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const oturumlar = oku('admin-oturum.json', []).filter(o => o.bitis > Date.now()).slice(0, 20);
      oturumlar.push({ token: token, bitis: Date.now() + 30 * 86400000, tarih: new Date().toISOString() });
      yaz('admin-oturum.json', oturumlar);
      return json(res, 200, { tamam: true, token: token });
    }
    if (req.method === 'POST' && yol === '/api/admin/cikis') {
      const g = await govde(req, 1);
      yaz('admin-oturum.json', oku('admin-oturum.json', []).filter(o => o.token !== g.token));
      return json(res, 200, { tamam: true });
    }
    /* ---- admin uçları koruması (şifre atandıysa token zorunlu) ---- */
    if (yol.indexOf('/api/admin/') === 0 && !adminYetkili(req)) {
      return json(res, 401, { hata: 'Oturum gerekli.' });
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

    /* ---- abonelik başlat: ilk teslimat ödemesiyle anında aktifleşir ---- */
    if (req.method === 'POST' && yol === '/api/abonelik-baslat') {
      const g = await govde(req, 1);
      const cfg = oku('cms.json', {});
      const ad = temiz(g.ad, 80), eposta = temiz(g.eposta, 120).toLowerCase();
      const telefon = temiz(g.telefon, 40), il = temiz(g.il, 60), ilce = temiz(g.ilce, 60);
      const mahalle = temiz(g.mahalle, 80), cadde = temiz(g.cadde, 120), adresDetay = temiz(g.adresDetay, 600);
      const en = g.dil === 'en';
      if (!ad || !epostaMi(eposta) || !telefon) return json(res, 400, { hata: en ? 'Name, email and phone are required.' : 'Ad, e-posta ve telefon zorunlu.' });
      if (!mahalle || !cadde || !adresDetay || !il || !ilce) return json(res, 400, { hata: en ? 'Neighbourhood, street, building no, province and district are required.' : 'Mahalle, cadde/sokak, bina no, il ve ilçe zorunlu.' });
      if (String(telefon).replace(/\D/g, '').replace(/^(90|0)/, '').length !== 10) return json(res, 400, { hata: en ? 'Please enter a valid 10-digit phone number.' : 'Geçerli bir telefon numarası gir (alan koduyla 10 hane).' });
      const adres = [/\b(mah\.?|mahallesi|mh\.?)$/i.test(mahalle) ? mahalle : mahalle + ' Mah.', cadde, adresDetay].join(' ');
      const oran = aboneOran(cfg);
      const istekler = (Array.isArray(g.kalemler) ? g.kalemler.slice(0, 10) : [])
        .map(k => ({ pid: temiz(k.pid, 40), adet: Math.max(1, Math.min(20, parseInt(k.adet, 10) || 1)) }))
        .filter(k => k.pid);
      if (!istekler.length) return json(res, 400, { hata: 'En az bir ürün seç.' });
      // Fiyatlar sunucudan (cms) çözülür — istemciden fiyat kabul edilmez
      const kalemler = [];
      for (const k of istekler) {
        const p = (cfg.products || []).find(x => x.id === k.pid);
        if (!p || !(Number(p.price) > 0)) return json(res, 400, { hata: 'Ürün bulunamadı: ' + k.pid });
        const birim = String(p.unitTR || '').replace(/^\//, '').trim();
        kalemler.push({ ad: p.nameTR + (birim ? ' · ' + birim : ''), pid: p.id, adet: k.adet, fiyat: aboneFiyat(p.price, oran), listeFiyat: Number(p.price), kdv: typeof p.kdv === 'number' ? p.kdv : 1, img: p.img || '' });
      }
      const periyotGun = Math.max(7, Math.min(120, parseInt(g.periyotGun, 10) || 30));
      const ozet = kalemler.map(k => k.adet + ' × ' + k.ad).join(', ');
      const abonelikler = oku('abonelikler.json', []);
      const ab = {
        id: 'AB-' + Date.now().toString(36).toUpperCase(),
        eposta: eposta, ad: ad,
        kalemler: kalemler.map(k => ({ urun: k.ad, pid: k.pid, adet: k.adet })),
        urun: ozet.slice(0, 300), pid: kalemler[0].pid, adet: 1,
        telefon: telefon, adres: adres, mahalle: mahalle, cadde: cadde, adresDetay: adresDetay, il: il, ilce: ilce, not: temiz(g.not, 500), indirimOran: oran,
        periyotGun: periyotGun, sonrakiTarih: '', durum: 'odeme-bekliyor',
        olusturma: new Date().toISOString()
      };
      // iyzico kapalıysa talep akışına düş (site çalışmaya devam etsin)
      if (!kartAktif()) {
        ab.durum = 'talep';
        abonelikler.push(ab);
        yaz('abonelikler.json', abonelikler.slice(0, 5000));
        epostaBildir('Yeni abonelik talebi (ödeme kapalı): ' + ozet.slice(0, 80), ad + ' <' + eposta + '>\n' + ozet + ' · her ' + periyotGun + ' günde\nTel: ' + telefon + '\nAdres: ' + adres + ' / ' + il);
        epostaGonder(eposta, 'Abonelik talebin bize ulaştı · Olivamore',
          'Merhaba ' + ad + ',\n\n' + ozet + ' için her ' + periyotGun + ' günde bir teslimat talebini aldık. En geç bir iş günü içinde ödeme bilgisiyle birlikte dönüş yapacağız.\n\nAfiyet olsun,\nOlivamore');
        return json(res, 200, { tamam: true, talep: true });
      }
      // Stok düş + ilk sipariş + ödeme sayfası
      const stokSonuc = stokDus(kalemler);
      if (stokSonuc.hata) return json(res, 400, { hata: stokSonuc.hata });
      const toplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0) * 100) / 100;
      const kdvToplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet * (k.kdv / (100 + k.kdv)), 0) * 100) / 100;
      const no = 'AB' + Date.now().toString().slice(-8);
      const siparisler = oku('siparisler.json', []);
      const siparis = {
        no: no, tarih: new Date().toISOString(),
        durum: 'odeme-bekliyor', odeme: 'kart', abonelikId: ab.id, dil: g.dil === 'en' ? 'en' : 'tr',
        musteri: { ad: ad, eposta: eposta, telefon: telefon, adres: adres, mahalle: mahalle, cadde: cadde, adresDetay: adresDetay, il: il, ilce: ilce, not: ab.not },
        kalemler: kalemler.map(k => ({ ad: k.ad, adet: k.adet, fiyat: k.fiyat, listeFiyat: k.listeFiyat, kdv: k.kdv, img: k.img, pid: k.pid })),
        araToplam: toplam, indirim: 0, kargo: 0, kdvToplam: kdvToplam, toplam: toplam,
        abonelikIndirim: { oran: oran, tutar: Math.round(kalemler.reduce((t, k) => t + (k.listeFiyat - k.fiyat) * k.adet, 0) * 100) / 100 },
        gecmis: [{ tarih: new Date().toISOString(), islem: 'abonelik ilk siparişi (' + ab.id + ') — ödeme bekleniyor' }]
      };
      if (paratikaAktif()) {
        try {
          const o = await paratikaOturum(siparis, req);
          siparis.odemeSaglayici = 'paratika'; siparis.paratikaToken = o.token;
          abonelikler.push(ab); yaz('abonelikler.json', abonelikler.slice(0, 5000));
          siparisler.unshift(siparis); yaz('siparisler.json', siparisler.slice(0, 5000));
          return json(res, 200, { tamam: true, odemeUrl: o.url, toplam: toplam });
        } catch (e) { console.error('[abonelik-paratika]', e.message); }
        stokGeriEkle(siparis);
        return json(res, 502, { hata: en ? 'The payment page could not be opened; please try again shortly.' : 'Ödeme sayfası açılamadı; lütfen biraz sonra tekrar dene.' });
      }
      try {
        const parcalar = ad.split(/\s+/);
        const soyad = parcalar.length > 1 ? parcalar.pop() : '-';
        const y = await iyziIstek('/payment/iyzipos/checkoutform/initialize/auth/ecom', {
          locale: siparis.dil, conversationId: no, basketId: no,
          price: String(toplam), paidPrice: String(toplam), currency: 'TRY', paymentGroup: 'PRODUCT',
          callbackUrl: SITE() + '/api/odeme-sonuc',
          buyer: { id: no, name: parcalar.join(' ') || soyad, surname: soyad, gsmNumber: telefon, email: eposta, identityNumber: '11111111111', registrationAddress: adres, ip: req.headers['x-real-ip'] || '0.0.0.0', city: il || 'Istanbul', country: 'Turkey' },
          shippingAddress: { contactName: ad, city: il || 'Istanbul', country: 'Turkey', address: adres },
          billingAddress: { contactName: ad, city: il || 'Istanbul', country: 'Turkey', address: adres },
          basketItems: [{ id: no, name: 'Olivamore Abonelik ' + no, category1: 'Gıda', itemType: 'PHYSICAL', price: String(toplam) }]
        });
        if (y && y.status === 'success' && y.paymentPageUrl) {
          abonelikler.push(ab);
          yaz('abonelikler.json', abonelikler.slice(0, 5000));
          siparisler.unshift(siparis);
          yaz('siparisler.json', siparisler.slice(0, 5000));
          return json(res, 200, { tamam: true, odemeUrl: y.paymentPageUrl, toplam: toplam });
        }
        console.error('[abonelik-iyzico]', y && y.errorMessage);
      } catch (e) { console.error('[abonelik-iyzico]', e.message); }
      stokGeriEkle(siparis);
      return json(res, 502, { hata: 'Ödeme sayfası açılamadı; lütfen biraz sonra tekrar dene.' });
    }

    /* ---- abonelik talebi (site formu; panelden onaylanınca aktifleşir) ---- */
    if (req.method === 'POST' && yol === '/api/abonelik-talep') {
      const g = await govde(req, 1);
      const liste = oku('abonelikler.json', []);
      // Çoklu ürün: kalemler [{urun,pid,adet}] (eski tek-ürün alanlarıyla geriye uyumlu)
      let kalemler = Array.isArray(g.kalemler) ? g.kalemler.slice(0, 10).map(k => ({
        urun: temiz(k.urun, 120),
        pid: temiz(k.pid, 40),
        adet: Math.max(1, Math.min(20, parseInt(k.adet, 10) || 1))
      })).filter(k => k.urun) : [];
      if (!kalemler.length && temiz(g.urun, 120)) {
        kalemler = [{ urun: temiz(g.urun, 120), pid: temiz(g.pid, 40), adet: Math.max(1, Math.min(20, parseInt(g.adet, 10) || 1)) }];
      }
      if (!temiz(g.ad, 80) || !epostaMi(g.eposta) || !kalemler.length) {
        return json(res, 400, { hata: 'Ad, geçerli e-posta ve en az bir ürün zorunlu.' });
      }
      const ozet = kalemler.map(k => k.adet + ' × ' + k.urun).join(', ');
      const yeni = {
        id: 'AB-' + Date.now().toString(36).toUpperCase(),
        eposta: temiz(g.eposta, 120).toLowerCase(),
        ad: temiz(g.ad, 80),
        kalemler: kalemler,
        urun: ozet.slice(0, 300),
        pid: kalemler[0].pid,
        adet: 1,
        telefon: temiz(g.telefon, 40),
        adres: temiz(g.adres, 1000),
        il: temiz(g.il, 60),
        not: temiz(g.not, 500),
        periyotGun: Math.max(7, Math.min(120, parseInt(g.periyotGun, 10) || 30)),
        sonrakiTarih: '',
        durum: 'talep',
        olusturma: new Date().toISOString()
      };
      liste.push(yeni);
      yaz('abonelikler.json', liste.slice(0, 5000));
      epostaGonder(yeni.eposta, 'Abonelik talebin bize ulaştı · Olivamore',
        'Merhaba ' + yeni.ad + ',\n\n' + yeni.urun + ' için her ' + yeni.periyotGun + ' günde bir teslimat talebini aldık. En geç bir iş günü içinde onaylayıp ilk teslimat tarihini e-postayla bildireceğiz.\n\nDilediğin an bu e-postayı yanıtlayarak değişiklik yapabilir veya vazgeçebilirsin.\n\nAfiyet olsun,\nOlivamore');
      epostaBildir('Yeni abonelik talebi: ' + yeni.urun.slice(0, 80),
        yeni.ad + ' <' + yeni.eposta + '>\n' + yeni.urun + ' · her ' + yeni.periyotGun + ' günde\nTel: ' + yeni.telefon + '\nAdres: ' + yeni.adres + ' / ' + yeni.il + (yeni.not ? '\nNot: ' + yeni.not : '') + '\n\nPanel → Abonelikler sekmesinden tarih verip aktifleştir.');
      return json(res, 200, { tamam: true, id: yeni.id });
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
        '<p><a href="' + SITE() + '/" style="color:#BFA25D;">' + SITE_AD() + '</a></p></body></html>';
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
      // Kargo için eksiksiz adres: mahalle, cadde/sokak, il, ilçe + geçerli telefon
      if (!temiz(m.mahalle, 80) || !temiz(m.cadde, 120) || !temiz(m.il, 60) || !temiz(m.ilce, 60)) {
        return json(res, 400, { hata: g.dil === 'en' ? 'Neighbourhood, street, province and district are required.' : 'Mahalle, cadde/sokak, il ve ilçe zorunlu.' });
      }
      if (String(m.telefon).replace(/\D/g, '').replace(/^(90|0)/, '').length !== 10) {
        return json(res, 400, { hata: g.dil === 'en' ? 'Please enter a valid 10-digit phone number.' : 'Geçerli bir telefon numarası gir (alan koduyla 10 hane).' });
      }
      if (!Array.isArray(g.kalemler) || !g.kalemler.length || g.kalemler.length > 50) {
        return json(res, 400, { hata: 'Sepet boş.' });
      }
      const kalemler = g.kalemler.map(k => ({
        ad: temiz(k.ad, 200), fiyat: Math.max(0, parseInt(k.fiyat, 10) || 0),
        adet: Math.min(99, Math.max(1, parseInt(k.adet, 10) || 1)), img: temiz(k.img, 300),
        kdv: Math.min(20, Math.max(0, parseFloat(k.kdv) || 1)),
        kod: temiz(k.id || k.kod, 40), hacim: temiz(k.hacim, 40),
        paket: k.paket === 'damak10' ? 'damak10' : undefined
      }));
      // Damak Kutusu (%10): en fazla 3 farklı ürün; fazlası/tekrarı indirimsiz sayılır
      {
        const gorulen = new Set();
        kalemler.forEach(k => { if (!k.paket) return; if (gorulen.size >= 3 || gorulen.has(k.kod)) delete k.paket; else gorulen.add(k.kod); });
      }
      // Fiyat SUNUCUDA belirlenir: tarayıcıdan gelen fiyat (eski önbellek / değiştirilmiş istek) kullanılmaz.
      {
        const katalog = oku('cms.json', {});
        for (const k of kalemler) {
          const ozelSet = /^(custom-set|palate-box)/.test(k.kod || '');
          const p = ozelSet ? null : urunBulKalem(katalog, k);
          if (p) {
            if (p.visible === false) return json(res, 400, { hata: '"' + (p.nameTR || k.ad) + '" artık satışta değil; lütfen sepetinden çıkar.', kod: 'satista-degil', urun: k.kod });
            { const birim = String(p.unitTR || '').replace(/^\s*\/\s*/, '').trim(); k.ad = temiz((p.nameTR || k.ad) + (birim && String(p.nameTR || '').indexOf(birim) === -1 ? ' · ' + birim : ''), 200); if (!k.hacim) k.hacim = birim; }
            if (Number(p.price) > 0) k.fiyat = k.paket === 'damak10' ? Math.round(Number(p.price) * 0.9) : Number(p.price);
            if (p.kdv != null) k.kdv = Math.min(20, Math.max(0, parseFloat(p.kdv) || 0));
            if (!k.kod) k.kod = p.id;
          } else if (ozelSet) {
            // Kendi setin / damak kutusu: fiyatı oluşturucu hesaplar; makul alt sınır uygulanır
            const taban = Math.round(Math.min(Number(katalog.gift3) || 1600, Number(katalog.gift5) || 1500) * 0.5);
            if (k.fiyat < taban) return json(res, 400, { hata: 'Hediye seti fiyatı doğrulanamadı; lütfen seti yeniden oluştur.' });
          } else {
            return json(res, 400, { hata: '"' + k.ad + '" ürününü bulamadık; lütfen sepetinden çıkarıp yeniden ekle.', kod: 'urun-yok', urun: k.kod });
          }
        }
      }
      // Stok kontrolü + düşümü (yetersizse sipariş alınmaz)
      const stokSonuc = stokDus(kalemler);
      if (stokSonuc.hata) return json(res, 400, { hata: stokSonuc.hata });
      // Fiyatlar KDV DAHİLDİR (sitede/sepette görünen fiyat); KDV bu tutarın içinden ayrıştırılır
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
      const kdvToplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet * oran * (k.kdv / (100 + k.kdv)), 0) * 100) / 100;
      const kargo = kargoUcreti(oku('cms.json', {}), indirimliAra, kargoBedava); // panel > Ayarlar > Kargo
      const toplam = Math.round((indirimliAra + kargo) * 100) / 100; // KDV fiyatın içinde
      const durum = oku('sayac.json', { son: 1000 });
      durum.son++;
      yaz('sayac.json', durum);
      const no = 'OM-' + durum.son;
      const odemeYolu = temiz(g.odeme, 40) || 'havale';
      if (odemeYolu === 'kart' && !kartAktif()) {
        return json(res, 400, { hata: 'Kartla ödeme şu anda aktif değil; lütfen Havale/EFT seç.' });
      }
      const siparisler = oku('siparisler.json', []);
      siparisler.unshift({
        no: no, tarih: new Date().toISOString(),
        durum: odemeYolu === 'kart' ? 'odeme-bekliyor' : 'yeni',
        odeme: odemeYolu, dil: g.dil === 'en' ? 'en' : 'tr',
        musteri: { ad: temiz(m.ad, 120), eposta: temiz(m.eposta, 200), telefon: temiz(m.telefon, 40), adres: temiz(m.adres, 1000), mahalle: temiz(m.mahalle, 80), cadde: temiz(m.cadde, 120), adresDetay: temiz(m.adresDetay, 600), il: temiz(m.il, 60), ilce: temiz(m.ilce, 60), postaKodu: temiz(m.postaKodu, 10), not: temiz(m.not, 500) },
        faturaBilgi: (g.fatura && g.fatura.tip === 'kurumsal' && /^[0-9]{10,11}$/.test(String(g.fatura.vkn || '')))
          ? { tip: 'kurumsal', unvan: temiz(g.fatura.unvan, 200), vkn: temiz(g.fatura.vkn, 11), vergiDairesi: temiz(g.fatura.vergiDairesi, 60) }
          : null,
        kalemler: kalemler, araToplam: araToplam, kupon: kuponBilgi, indirim: indirim,
        uyeIndirim: uyeIndirimTutar > 0 ? { oran: uyeIndirimOran, tutar: uyeIndirimTutar, eposta: uyeB.u.eposta } : null,
        kdvToplam: kdvToplam, kargo: kargo, toplam: toplam,
        iz: (g.iz && g.iz.rz) ? { rz: 1, fbp: temiz(g.iz.fbp, 120), fbc: temiz(g.iz.fbc, 200), ua: temiz(req.headers['user-agent'], 300), ip: String(req.headers['x-real-ip'] || '').split(',')[0].trim() } : undefined
      });
      yaz('siparisler.json', siparisler.slice(0, 5000));
      // Sipariş tamamlandı → terk edilmiş sepet kaydı silinir
      const spListe = oku('sepetler.json', []).filter(x => x.eposta !== temiz(m.eposta, 200).toLowerCase());
      yaz('sepetler.json', spListe);
      if (odemeYolu === 'kart' && paratikaAktif()) {
        try {
          const sip = oku('siparisler.json', []).find(x => x.no === no);
          const o = await paratikaOturum(sip, req);
          const taze = oku('siparisler.json', []); const t = taze.find(x => x.no === no);
          if (t) { t.odemeSaglayici = 'paratika'; t.paratikaToken = o.token; yaz('siparisler.json', taze); }
          // Kart formu bizim sayfamızda: tarayıcı kart bilgisini DOĞRUDAN Paratika'ya gönderir (Direct Post 3D) — sunucumuza kart verisi gelmez
          const yerinde = oku('env.json', {}).paratikaYerinde !== false;
          return json(res, 200, { tamam: true, no: no, toplam: toplam, odemeUrl: o.url, kartPost: yerinde ? o.post : undefined });
        } catch (e) { console.error('[paratika]', e.message); }
        const tazeListe = oku('siparisler.json', []);
        const s = tazeListe.find(x => x.no === no);
        if (s) { s.durum = 'odeme-basarisiz'; stokGeriEkle(s); yaz('siparisler.json', tazeListe); }
        return json(res, 502, { hata: g.dil === 'en' ? 'The payment page could not be opened; please try again or choose bank transfer.' : 'Ödeme sayfası açılamadı; lütfen tekrar dene veya Havale/EFT seç.' });
      }
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
            callbackUrl: SITE() + '/api/odeme-sonuc',
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
        // await sırasında başka siparişler yazılmış olabilir: listeyi TAZE oku (eski kopyayı yazmak siparişleri silerdi)
        const tazeListe = oku('siparisler.json', []);
        const s = tazeListe.find(x => x.no === no);
        if (s) { s.durum = 'odeme-basarisiz'; stokGeriEkle(s); yaz('siparisler.json', tazeListe); }
        return json(res, 502, { hata: 'Ödeme sayfası açılamadı; lütfen tekrar dene veya Havale/EFT seç.' });
      }
      epostaBildir('Yeni sipariş ' + no + ' · ₺' + toplam.toLocaleString('tr-TR'),
        kalemler.map(k => k.adet + ' × ' + k.ad + ' (₺' + k.fiyat + ')').join('\n') +
        (kuponBilgi ? '\n\nKupon: ' + kuponBilgi.kod + ' (-₺' + indirim + ')' : '') +
        '\n\nMüşteri: ' + m.ad + ' / ' + m.telefon + ' / ' + m.eposta + '\nAdres: ' + m.adres + '\nÖdeme: ' + odemeYolu);
      { const yeniSip = oku('siparisler.json', []).find(x => x.no === no); if (yeniSip && odemeYolu === 'havale') { havaleOnayEpostasi(yeniSip); metaSatinAlma(yeniSip, req); } }
      const bk = bankaBilgi();
      return json(res, 200, { tamam: true, no: no, toplam: toplam, banka: odemeYolu === 'havale' ? { unvan: bk.unvan, banka: bk.banka, iban: bk.iban, not: bk.not, sureGun: bk.sureGun } : undefined });
    }

    /* ---- üye uçları ---- */
    if (req.method === 'POST' && yol === '/api/uye/kayit') {
      const g = await govde(req, 1);
      const ad = temiz(g.ad, 120), eposta = temiz(g.eposta, 200).toLowerCase(), sifre = String(g.sifre || '');
      if (!ad || !epostaMi(eposta)) return json(res, 400, { hata: 'Ad ve geçerli e-posta zorunlu.' });
      if (sifre.length < 6) return json(res, 400, { hata: 'Şifre en az 6 karakter olmalı.' });
      const liste = oku('uyeler.json', []);
      const varolan = liste.find(u => u.eposta === eposta);
      if (varolan && varolan.sifreYok) return json(res, 400, { hata: 'Bu e-postayla eski sitemizden bir hesabın var; geçmiş siparişlerin de içinde. "Şifremi unuttum" ile şifreni belirleyebilirsin.', kod: 'sifre-belirle' });
      if (varolan) return json(res, 400, { hata: 'Bu e-posta zaten kayıtlı; giriş yapmayı dene.' });
      const tuz = crypto.randomBytes(16).toString('hex');
      const u = { id: 'U-' + Date.now(), ad: ad, eposta: eposta, tuz: tuz, hash: sifreHashle(sifre, tuz), tarih: new Date().toISOString(), oturumlar: [] };
      const token = oturumAc(u);
      liste.push(u);
      yaz('uyeler.json', liste.slice(-50000));
      return json(res, 200, { tamam: true, token: token, ad: ad });
    }
    /* ---- Şifremi unuttum: e-postaya tek kullanımlık bağlantı (1 saat geçerli) ---- */
    if (req.method === 'POST' && yol === '/api/uye/sifre-unuttum') {
      const g = await govde(req, 1);
      const eposta = temiz(g.eposta, 200).toLowerCase();
      if (!epostaMi(eposta)) return json(res, 400, { hata: 'Geçerli bir e-posta gir.' });
      const liste = oku('uyeler.json', []);
      const u = liste.find(x => x.eposta === eposta);
      if (u) {
        const son = u.sifirla && u.sifirla.gonderim ? Date.parse(u.sifirla.gonderim) : 0;
        if (Date.now() - son > 60000) { // dakikada en fazla bir e-posta
          const anahtar = crypto.randomBytes(24).toString('hex');
          u.sifirla = { ozet: crypto.createHash('sha256').update(anahtar).digest('hex'), bitis: Date.now() + 3600000, gonderim: new Date().toISOString() };
          yaz('uyeler.json', liste);
          const en = g.dil === 'en';
          const link = SITE() + (en ? '/hesap-en' : '/hesap') + '?sifirla=' + anahtar + '&e=' + encodeURIComponent(eposta);
          epostaGonder(eposta, en ? 'Set your Olivamore password' : 'Olivamore şifreni belirle',
            (en ? 'Hello ' + u.ad + ',\n\nUse the link below to set a new password. It is valid for 1 hour:\n' + link + '\n\nIf you did not request this, you can ignore this email; your account stays unchanged.\n\nOlivamore'
                : 'Merhaba ' + u.ad + ',\n\nYeni şifreni belirlemek için aşağıdaki bağlantıya tıkla. Bağlantı 1 saat geçerlidir:\n' + link + '\n\nBu isteği sen yapmadıysan e-postayı yok sayabilirsin; hesabında bir değişiklik olmaz.\n\nOlivamore'));
        }
      }
      // Kayıtlı olsun olmasın aynı yanıt (e-posta adresleri dışarıdan sorgulanamasın)
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'POST' && yol === '/api/uye/sifre-yenile') {
      const g = await govde(req, 1);
      const eposta = temiz(g.eposta, 200).toLowerCase(), anahtar = String(g.anahtar || ''), sifre = String(g.sifre || '');
      if (sifre.length < 6) return json(res, 400, { hata: 'Şifre en az 6 karakter olmalı.' });
      const liste = oku('uyeler.json', []);
      const u = liste.find(x => x.eposta === eposta);
      const ozet = crypto.createHash('sha256').update(anahtar).digest('hex');
      if (!u || !u.sifirla || u.sifirla.bitis < Date.now() || u.sifirla.ozet.length !== ozet.length ||
          !crypto.timingSafeEqual(Buffer.from(u.sifirla.ozet), Buffer.from(ozet))) {
        return json(res, 400, { hata: 'Bağlantının süresi dolmuş ya da geçersiz. "Şifremi unuttum" ile yenisini iste.' });
      }
      u.tuz = crypto.randomBytes(16).toString('hex');
      u.hash = sifreHashle(sifre, u.tuz);
      delete u.sifirla; delete u.sifreYok;
      u.oturumlar = []; // eski oturumlar kapanır
      const token = oturumAc(u);
      yaz('uyeler.json', liste);
      return json(res, 200, { tamam: true, token: token, ad: u.ad });
    }
    if (req.method === 'POST' && yol === '/api/uye/giris') {
      const g = await govde(req, 1);
      const eposta = temiz(g.eposta, 200).toLowerCase();
      const liste = oku('uyeler.json', []);
      const u = liste.find(x => x.eposta === eposta);
      const hatali = () => json(res, 401, { hata: 'E-posta veya şifre hatalı.' });
      if (!u) return hatali();
      if (u.sifreYok || !u.hash) return json(res, 403, { hata: 'Hesabın eski sitemizden aktarıldı. Güvenliğin için yeni bir şifre belirlemen gerekiyor: "Şifremi unuttum"a tıkla, e-postana bağlantı gelsin.', kod: 'sifre-belirle' });
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
    if (req.method === 'GET' && yol === '/api/cok-satanlar') return json(res, 200, { urunler: cokSatanlar() });
    /* Bu üye bu ürünü değerlendirebilir mi? (ürün sayfasındaki yorum formu için) */
    if (req.method === 'GET' && yol === '/api/yorum-hak') {
      const b = uyeBul(req);
      if (!b) return json(res, 200, { giris: false, hak: false });
      const cfg = oku('cms.json', {});
      const uid = String(new URL(req.url, 'http://x').searchParams.get('urun') || '').slice(0, 40);
      const urun = (cfg.products || []).find(p => p.id === uid);
      if (!urun) return json(res, 404, { hata: 'Ürün bulunamadı.' });
      const mevcut = oku('yorumlar.json', []).find(y => y.eposta === b.u.eposta && y.urunId === urun.id);
      return json(res, 200, { giris: true, ad: b.u.ad, hak: urunSatinAldiMi(b.u.eposta, urun), mevcut: mevcut ? { yildiz: mevcut.yildiz, metin: mevcut.metin, durum: mevcut.durum } : null });
    }
    /* Yorum gönder: YALNIZ ürünü satın almış üye */
    if (req.method === 'POST' && yol === '/api/yorum') {
      const b = uyeBul(req);
      if (!b) return json(res, 401, { hata: 'Yorum yapmak için giriş yapmalısın.' });
      const g = await govde(req, 1);
      const yildiz = Math.min(5, Math.max(1, parseInt(g.yildiz, 10) || 0));
      const metin = temiz(g.metin, 1000);
      if (!g.yildiz || !metin) return json(res, 400, { hata: 'Yıldız ve yorum metni zorunlu.' });
      const cfg = oku('cms.json', {});
      const urun = (g.urunId && (cfg.products || []).find(p => p.id === temiz(g.urunId, 40))) || urunKaydi(cfg, temiz(g.urunAd, 200));
      if (!urun) return json(res, 400, { hata: 'Ürün bulunamadı.' });
      // Yalnız satın alanlar yorum yapabilir
      const dogrulanmis = urunSatinAldiMi(b.u.eposta, urun);
      if (!dogrulanmis) return json(res, 403, { hata: g.dil === 'en' ? 'Only customers who bought this product can review it.' : 'Bu ürünü yalnızca satın alan müşteriler değerlendirebilir.' });
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
      epostaBildir('Yeni ürün yorumu bekliyor: ' + urun.nameTR, b.u.ad + ' · ' + yildiz + '★\n\n' + metin + '\n\nPanelden onaylayabilirsin: ' + SITE() + '/panel');
      return json(res, 200, { tamam: true, mesaj: 'Yorumun alındı; onaylandığında yayınlanır' + (uyeAyar().yorumPuan ? ' ve ' + uyeAyar().yorumPuan + ' puan kazanırsın' : '') + '.' });
    }

    if (req.method === 'POST' && yol === '/api/uye/adres-kaydet') {
      const b = uyeBul(req);
      if (!b) return json(res, 401, { hata: 'Oturum geçersiz; yeniden giriş yap.' });
      const g = await govde(req, 1);
      if (!temiz(g.ad, 120) || !temiz(g.telefon, 40) || !temiz(g.adres, 1000)) {
        return json(res, 400, { hata: 'Ad, telefon ve adres zorunlu.' });
      }
      if (!temiz(g.mahalle, 80) || !temiz(g.cadde, 120) || !temiz(g.il, 60) || !temiz(g.ilce, 60)) {
        return json(res, 400, { hata: g.dil === 'en' ? 'Neighbourhood, street, province and district are required.' : 'Mahalle, cadde/sokak, il ve ilçe zorunlu.' });
      }
      if (String(g.telefon).replace(/\D/g, '').replace(/^(90|0)/, '').length !== 10) {
        return json(res, 400, { hata: g.dil === 'en' ? 'Please enter a valid 10-digit phone number.' : 'Geçerli bir telefon numarası gir (alan koduyla 10 hane).' });
      }
      b.u.adresler = b.u.adresler || [];
      const yeni = {
        id: temiz(g.id, 30) || 'A-' + Date.now(),
        baslik: temiz(g.baslik, 40) || 'Adresim',
        ad: temiz(g.ad, 120), telefon: temiz(g.telefon, 40),
        adres: temiz(g.adres, 1000), mahalle: temiz(g.mahalle, 80), cadde: temiz(g.cadde, 120), adresDetay: temiz(g.adresDetay, 600), il: temiz(g.il, 60), ilce: temiz(g.ilce, 60), postaKodu: temiz(g.postaKodu, 10)
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
      return json(res, 200, { kart: kartAktif(), saglayici: paratikaAktif() ? 'paratika' : (iyzicoAktif() ? 'iyzico' : '') });
    }

    /* Paratika ödeme sonucu: tarayıcı POST eder; imza (sdSha512) + oturum + tutar doğrulanır */
    if (yol === '/api/paratika-donus') {
      const yonlendir = hedef => { res.writeHead(303, { Location: hedef }); res.end(); };
      if (req.method !== 'POST') return yonlendir('/sepet');
      const ham = await new Promise((cozul, hataVer) => {
        let p = ''; req.on('data', d => { p += d; if (p.length > 100000) req.destroy(); });
        req.on('end', () => cozul(p)); req.on('error', hataVer);
      });
      const p = Object.fromEntries(new URLSearchParams(ham));
      const liste = oku('siparisler.json', []);
      const s = liste.find(x => x.no === p.merchantPaymentId);
      const sepetYolu = s && s.abonelikId ? (s.dil === 'en' ? '/abonelik-en' : '/abonelik') : (s && s.dil === 'en' ? '/sepet-en' : '/sepet');
      const imzaOk = paratikaImzaDogru(p);
      const oturumOk = !!(s && s.paratikaToken && s.paratikaToken === p.sessionToken);
      const tutarOk = !!(s && (p.amount === undefined || Math.abs(parseFloat(p.amount) - Number(s.toplam)) < 0.01));
      if (s && p.responseCode === '00' && imzaOk && oturumOk && tutarOk) {
        kartOdemesiTamam(s, liste, p.pgTranId || '', 'paratika', { odemeTaksit: parseInt(p.installment, 10) || 1, odemeKart: p.paymentSystem || '' });
        return yonlendir(sepetYolu + '#odeme-ok-' + s.no);
      }
      if (s && p.responseCode === '00' && !(imzaOk && oturumOk && tutarOk)) {
        // Onay geldi ama doğrulanamadı: sipariş açık bırakılır, elle kontrol için bildirilir (para alınmış olabilir)
        s.gecmis = s.gecmis || [];
        s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'Paratika onayı DOĞRULANAMADI (imza:' + imzaOk + ' oturum:' + oturumOk + ' tutar:' + tutarOk + ') — Paratika panelinden kontrol et' });
        s.odemeKontrol = true; yaz('siparisler.json', liste);
        epostaBildir('DİKKAT: Paratika ödemesi doğrulanamadı · ' + s.no, 'Paratika "onaylandı" döndü ama imza/tutar doğrulaması geçmedi. Paratika panelinden ' + s.no + ' işlemini kontrol et; ödeme gerçekten alındıysa siparişi panelden onayla.');
        return yonlendir(sepetYolu + '#odeme-hata');
      }
      if (s && s.durum === 'odeme-bekliyor') {
        s.durum = 'odeme-basarisiz'; stokGeriEkle(s);
        s.gecmis = s.gecmis || [];
        s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'Paratika ödeme başarısız: ' + String(p.errorMsg || p.pgTranErrorText || p.responseMsg || p.responseCode || '').slice(0, 160) });
        yaz('siparisler.json', liste);
      }
      const neden = String(p.pgTranErrorText || p.errorMsg || p.mdErrorMsg || '').replace(/[^\p{L}\p{N} .,:;()\/-]/gu, '').slice(0, 140);
      return yonlendir(sepetYolu + (neden ? '?odeme=' + encodeURIComponent(neden) : '') + '#odeme-hata');
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
        kartOdemesiTamam(s, liste, d.paymentId || '', 'iyzico');
        const okHedef = s.abonelikId ? (s.dil === 'en' ? '/abonelik-en' : '/abonelik') : sepetYolu;
        return yonlendir(okHedef + '#odeme-ok-' + s.no);
      }
      if (s && s.durum === 'odeme-bekliyor') { s.durum = 'odeme-basarisiz'; stokGeriEkle(s); yaz('siparisler.json', liste); }
      const hataHedef = s && s.abonelikId ? (s.dil === 'en' ? '/abonelik-en' : '/abonelik') : sepetYolu;
      return yonlendir(hataHedef + '#odeme-hata');
    }

    /* ---- yönetici (nginx basic auth arkasında) ---- */
    // Görsel kütüphanesi: listele / yükle / sil (dosya olarak webroot'a yazılır)
    if (req.method === 'GET' && yol === '/api/admin/gorseller') {
      try {
        const IMG_DIZIN = process.env.OM_WEB_IMG || '/var/www/olivamore/assets/img';
        const dosyalar = require('fs').readdirSync(IMG_DIZIN)
          .filter(f => /\.(jpe?g|png|webp|mp4|webm)$/i.test(f)).sort();
        return json(res, 200, dosyalar.map(f => 'assets/img/' + f));
      } catch (e) { return json(res, 500, { hata: 'Kütüphane listelenemedi.' }); }
    }
    if (req.method === 'POST' && yol === '/api/admin/gorsel-yukle') {
      const g = await govde(req, 90); // video yüklemeleri için geniş limit
      const ad = String(g.ad || '').toLowerCase()
        .replace(/[ğ]/g, 'g').replace(/[üu]/g, 'u').replace(/[şs]/g, 's').replace(/[ıi]/g, 'i').replace(/[öo]/g, 'o').replace(/[ç]/g, 'c')
        .replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      const m = String(g.veri || '').match(/^data:(?:image\/(jpeg|png|webp)|video\/(mp4|webm));base64,([A-Za-z0-9+/=]+)$/);
      if (!ad || !m) return json(res, 400, { hata: 'Geçersiz dosya (jpg/png/webp görsel veya mp4/webm video olmalı).' });
      const IMG_DIZIN = process.env.OM_WEB_IMG || '/var/www/olivamore/assets/img';
      const uzanti = m[1] ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : m[2];
      const dosya = ad + '.' + uzanti;
      try {
        require('fs').writeFileSync(require('path').join(IMG_DIZIN, dosya), Buffer.from(m[3], 'base64'));
        return json(res, 200, { tamam: true, yol: 'assets/img/' + dosya });
      } catch (e) { return json(res, 500, { hata: 'Yazılamadı (izin?).' }); }
    }
    if (req.method === 'POST' && yol === '/api/admin/gorsel-sil') {
      const g = await govde(req, 1);
      const ad = String(g.ad || '').replace(/^assets\/img\//, '');
      if (!/^[a-z0-9-_.]+\.(jpe?g|png|webp|mp4|webm)$/i.test(ad)) return json(res, 400, { hata: 'Geçersiz ad.' });
      const IMG_DIZIN = process.env.OM_WEB_IMG || '/var/www/olivamore/assets/img';
      try { require('fs').unlinkSync(require('path').join(IMG_DIZIN, ad)); } catch (e) { }
      return json(res, 200, { tamam: true });
    }

    // Bahçe koordinatından TKGM (Parsel Sorgu) parsel bilgisi + sınır poligonu
    if (req.method === 'GET' && yol === '/api/admin/tkgm-parsel') {
      const tu = new URL(req.url, 'http://x'); const lat = parseFloat(tu.searchParams.get('lat')), lng = parseFloat(tu.searchParams.get('lng'));
      if (!(lat > 35 && lat < 43 && lng > 25 && lng < 45)) return json(res, 400, { hata: 'Koordinat Türkiye sınırları içinde değil' });
      try {
        const y = await httpsJson({ hostname: 'cbsapi.tkgm.gov.tr', path: '/megsiswebapi.v3/api/parsel/' + lat.toFixed(6) + '/' + lng.toFixed(6) + '/', method: 'GET',
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Olivamore panel)', 'Referer': 'https://parselsorgu.tkgm.gov.tr/', 'Origin': 'https://parselsorgu.tkgm.gov.tr' } });
        let ft = y.veri;
        if (ft && ft.type === 'FeatureCollection') ft = (ft.features || [])[0];
        if (y.kod !== 200 || !ft || !ft.geometry) return json(res, 502, { hata: 'TKGM yanıt vermedi (kod ' + y.kod + '). Sınırı parselsorgu.tkgm.gov.tr\'den GeoJSON olarak indirip yapıştırabilirsin.' });
        const p = ft.properties || {};
        return json(res, 200, { tamam: true, il: p.ilAd || '', ilce: p.ilceAd || '', mahalle: p.mahalleAd || '', ada: String(p.adaNo || ''), parsel: String(p.parselNo || ''),
          alan: p.alan ? String(p.alan) + ' m²' : '', mevkii: p.mevkii || '', nitelik: p.nitelik || '', sinir: JSON.stringify(ft.geometry) });
      } catch (e) { return json(res, 502, { hata: 'TKGM bağlantı hatası: ' + e.message + '. Sınırı elle yapıştırabilirsin.' }); }
    }
    // Manuel sipariş (WhatsApp, telefon, Instagram, mağaza…): fiyat panelden gelebilir; stok düşer; Green Ops'a otomatik gider
    if (req.method === 'POST' && yol === '/api/admin/manuel-siparis') {
      const g = await govde(req, 1);
      const m = g.musteri || {};
      const KANALLAR = ['whatsapp', 'telefon', 'instagram', 'magaza', 'e-posta', 'diger'];
      const kanal = KANALLAR.indexOf(g.kanal) !== -1 ? g.kanal : 'diger';
      const tel = String(m.telefon || '').replace(/\D/g, '').replace(/^(90|0)/, '');
      if (!temiz(m.ad, 120)) return json(res, 400, { hata: 'Müşteri adı zorunlu.' });
      if (tel.length !== 10) return json(res, 400, { hata: 'Telefon alan koduyla 10 hane olmalı.' });
      if (m.eposta && !epostaMi(m.eposta)) return json(res, 400, { hata: 'E-posta adresi geçersiz.' });
      if (!temiz(m.mahalle, 80) || !temiz(m.cadde, 120) || !temiz(m.adresDetay, 600) || !temiz(m.il, 60) || !temiz(m.ilce, 60)) return json(res, 400, { hata: 'Mahalle, cadde/sokak, bina no/daire, il ve ilçe zorunlu.' });
      if (!Array.isArray(g.kalemler) || !g.kalemler.length || g.kalemler.length > 50) return json(res, 400, { hata: 'En az bir ürün ekle.' });
      const katalog = oku('cms.json', {});
      const kalemler = [];
      for (const k of g.kalemler) {
        const p = (katalog.products || []).find(x => x.id === k.id);
        if (!p) return json(res, 400, { hata: 'Ürün bulunamadı: ' + temiz(k.id, 40) });
        const birim = String(p.unitTR || '').replace(/^\s*\/\s*/, '').trim();
        const fiyat = Math.round((parseFloat(k.fiyat) >= 0 ? parseFloat(k.fiyat) : Number(p.price) || 0) * 100) / 100;
        kalemler.push({ ad: temiz((p.nameTR || p.id) + (birim && String(p.nameTR || '').indexOf(birim) === -1 ? ' · ' + birim : ''), 200), fiyat: fiyat,
          adet: Math.min(999, Math.max(1, parseInt(k.adet, 10) || 1)), img: p.img || '', kdv: typeof p.kdv === 'number' ? p.kdv : 1, kod: p.id, pid: p.id, hacim: birim });
      }
      if (g.stokDus !== false) { const st = stokDus(kalemler); if (st.hata) return json(res, 400, { hata: st.hata + ' (Stoğu düşmeden kaydetmek için "Stoktan düş" seçimini kaldır.)' }); }
      const araToplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet, 0) * 100) / 100;
      const indirim = Math.min(araToplam, Math.max(0, Math.round((parseFloat(g.indirim) || 0) * 100) / 100));
      const indirimliAra = Math.round((araToplam - indirim) * 100) / 100;
      const oran = araToplam > 0 ? indirimliAra / araToplam : 1;
      const kdvToplam = Math.round(kalemler.reduce((t, k) => t + k.fiyat * k.adet * oran * (k.kdv / (100 + k.kdv)), 0) * 100) / 100;
      const kargo = Math.max(0, Math.round((parseFloat(g.kargo) || 0) * 100) / 100);
      const toplam = Math.round((indirimliAra + kargo) * 100) / 100;
      const sayacD = oku('sayac.json', { son: 1000 }); sayacD.son++; yaz('sayac.json', sayacD);
      const no = 'OM-' + sayacD.son;
      const odeme = ['havale', 'kart-pos', 'nakit', 'kapida', 'diger'].indexOf(g.odeme) !== -1 ? g.odeme : 'havale';
      const odendi = g.odendi === true;
      const mh = temiz(m.mahalle, 80), cd = temiz(m.cadde, 120), dt = temiz(m.adresDetay, 600);
      const s = {
        no: no, tarih: new Date().toISOString(), durum: odendi ? 'hazırlanıyor' : 'yeni', odeme: odeme, odendi: odendi, dil: 'tr',
        kanal: kanal, kaynak: 'manuel',
        musteri: { ad: temiz(m.ad, 120), eposta: temiz(m.eposta, 200), telefon: temiz(m.telefon, 40),
          adres: [/\b(mah\.?|mahallesi|mh\.?)$/i.test(mh) ? mh : mh + ' Mah.', cd, dt].join(' '), mahalle: mh, cadde: cd, adresDetay: dt,
          il: temiz(m.il, 60), ilce: temiz(m.ilce, 60), postaKodu: temiz(m.postaKodu, 10), not: temiz(m.not, 500) },
        faturaBilgi: (g.fatura && g.fatura.tip === 'kurumsal' && /^[0-9]{10,11}$/.test(String(g.fatura.vkn || '')) && temiz(g.fatura.unvan, 200))
          ? { tip: 'kurumsal', unvan: temiz(g.fatura.unvan, 200), vkn: temiz(g.fatura.vkn, 11), vergiDairesi: temiz(g.fatura.vergiDairesi, 60) } : null,
        kalemler: kalemler, araToplam: araToplam, kupon: null, indirim: indirim, kdvToplam: kdvToplam, kargo: kargo, toplam: toplam,
        adminNot: temiz(g.adminNot, 1000), stokDusuldu: g.stokDus !== false, koliAdet: Math.min(50, Math.max(1, parseInt(g.koli, 10) || 1)),
        gecmis: [{ tarih: new Date().toISOString(), islem: 'Panelden manuel oluşturuldu (' + kanal + ')' + (odendi ? ' · ödeme alındı' : '') }]
      };
      const liste = oku('siparisler.json', []);
      liste.unshift(s);
      yaz('siparisler.json', liste.slice(0, 5000));
      // İsteğe bağlı: müşteriye sipariş onayı / havale bilgisi
      if (g.epostaGonder && s.musteri.eposta) {
        if (!odendi && odeme === 'havale') havaleOnayEpostasi(s);
        else epostaGonder(s.musteri.eposta, 'Siparişiniz alındı · ' + s.no, 'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişiniz alındı.\n\n' + siparisOzetMetni(s) + '\n\nAfiyet olsun,\nOlivamore');
      }
      // İsteğe bağlı: ödeme alındıysa Paraşüt e-Arşiv faturası
      let faturaMesaj = '';
      if (g.faturaKes && odendi && parasutAktif()) {
        try {
          const taze = oku('siparisler.json', []); const t = taze.find(x => x.no === no);
          await parasutFaturaKes(t);
          t.gecmis.unshift({ tarih: new Date().toISOString(), islem: t.fatura && t.fatura.durum === 'kesildi' ? 'Paraşüt e-Arşiv faturası kesildi · ' + (t.fatura.no || '') : 'Paraşüt fatura uyarısı' });
          yaz('siparisler.json', taze);
          faturaMesaj = t.fatura && t.fatura.no ? 'Fatura: ' + t.fatura.no : 'Fatura işlemi başlatıldı';
        } catch (e) { faturaMesaj = 'Fatura kesilemedi: ' + e.message; }
      }
      return json(res, 200, { tamam: true, no: no, toplam: toplam, fatura: faturaMesaj });
    }
    if (req.method === 'GET' && yol === '/api/admin/greenops') return json(res, 200, greenOpsOzet());
    if (req.method === 'POST' && yol === '/api/admin/greenops') {
      const g = await govde(req, 0.05);
      const a = goAyar();
      if (!a.url) return json(res, 400, { hata: 'env.json → greenOpsWebhookUrl girilmemiş.' });
      if (g.islem === 'test') {
        try {
          const r = await goTekGonder('test', { mesaj: 'Olivamore bağlantı testi', site: SITE() }, 'test-' + Date.now());
          return json(res, 200, { tamam: r.kod >= 200 && r.kod < 300, kod: r.kod, yanit: String(r.govde || '').slice(0, 300) });
        } catch (e) { return json(res, 200, { tamam: false, hata: e.message }); }
      }
      if (g.islem === 'yeniden') {
        const k = oku('greenops-kuyruk.json', []); k.forEach(x => { x.basarisiz = false; x.deneme = 0; x.sonraki = Date.now(); });
        yaz('greenops-kuyruk.json', k); greenOpsGonder().catch(() => {});
        return json(res, 200, { tamam: true, adet: k.length });
      }
      if (g.islem === 'gecmis-gonder') {
        // Son N gündeki siparişleri (açık olanlar) Green Ops'a yeniden gönder
        const gun = Math.min(90, Math.max(1, parseInt(g.gun, 10) || 7));
        const sinir = new Date(Date.now() - gun * 86400000).toISOString();
        const d = goDurumOku(); let adet = 0;
        oku('siparisler.json', []).forEach(s => { if (s.kaynak !== 'wordpress' && s.tarih > sinir && d.izler[s.no]) { delete d.izler[s.no]; adet++; } });
        d.baslangic = d.baslangic && d.baslangic < sinir ? d.baslangic : sinir;
        yaz('greenops-durum.json', d); greenOpsTara(); greenOpsGonder().catch(() => {});
        return json(res, 200, { tamam: true, adet: adet });
      }
      return json(res, 400, { hata: 'Bilinmeyen işlem' });
    }
    if (req.method === 'POST' && yol === '/api/admin/kargo-barkod') {
      const g = await govde(req, 0.05);
      try { const r = await kargoBarkodOlustur(temiz(g.no, 30), { zorla: g.zorla === true, koli: g.koli, kaynak: 'Panel' }); return json(res, r.kod, r.veri); }
      catch (e) { return json(res, 502, { hata: 'Kargo servisine ulaşılamadı: ' + e.message }); }
    }
    if (req.method === 'GET' && yol === '/api/admin/web-analiz') {
      const q = new URLSearchParams((req.url || '').split('?')[1] || '');
      const gun = Math.min(90, Math.max(1, parseInt(q.get('gun'), 10) || 7));
      return json(res, 200, webAnaliz(gun));
    }
    if (req.method === 'GET' && yol === '/api/admin/saglik') {
      return json(res, 200, saglikRaporu());
    }
    if (req.method === 'GET' && yol === '/api/admin/config') {
      return json(res, 200, oku('cms.json', {}));
    }
    /* ---- Ürün feed'i: Google Merchant + Meta katalog (herkese açık) ---- */
    if (req.method === 'GET' && yol === '/feed/urunler.xml') {
      const cfg = oku('cms.json', {});
      const taban = SITE();
      function xml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
      const urunler = (cfg.products || []).filter(p => p.type === 'product' && p.visible !== false && Number(p.price) > 0);
      const kalemler = urunler.map(p => {
        const href = String(p.href || ('p.html?id=' + p.id)).replace('.html', '');
        const stokYok = typeof p.stok === 'number' && p.stok <= 0;
        const birim = String(p.unitTR || '').replace(/^\//, '').trim();
        return '<item>' +
          '<g:id>' + xml(p.id) + '</g:id>' +
          '<g:title>' + xml('Olivamore ' + p.nameTR + (birim ? ' ' + birim : '')) + '</g:title>' +
          '<g:description>' + xml(p.noteTR || p.nameTR) + '</g:description>' +
          '<g:link>' + xml(taban + '/' + href) + '</g:link>' +
          '<g:image_link>' + xml(taban + '/' + (p.img || '')) + '</g:image_link>' +
          '<g:availability>' + (stokYok ? 'out_of_stock' : 'in_stock') + '</g:availability>' +
          (Number(p.eskiFiyat) > Number(p.price)
            ? '<g:price>' + Number(p.eskiFiyat).toFixed(2) + ' TRY</g:price><g:sale_price>' + Number(p.price).toFixed(2) + ' TRY</g:sale_price>'
            : '<g:price>' + Number(p.price).toFixed(2) + ' TRY</g:price>') +
          '<g:brand>Olivamore</g:brand>' +
          '<g:condition>new</g:condition>' +
          '<g:product_type>' + xml(p.role === 'zeytin' ? 'Zeytin' : (p.role === 'sirke' ? 'Sirke' : 'Zeytinyağı')) + '</g:product_type>' +
          '</item>';
      }).join('\n');
      const feed = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n' +
        '<title>Olivamore Ürünleri</title>\n<link>' + taban + '</link>\n' +
        '<description>Olivamore naturel sızma zeytinyağı ve doğal ürünler</description>\n' +
        kalemler + '\n</channel>\n</rss>';
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=1800' });
      return res.end(feed);
    }

    if (req.method === 'POST' && yol === '/api/admin/config') {
      const g = await govde(req, 8); // panel görsel yüklemeleri için geniş limit
      if (!g || typeof g !== 'object' || !Array.isArray(g.products) || g.products.length < 1) {
        return json(res, 400, { hata: 'Kayıt reddedildi: ürün listesi boş geldi (panel tam yüklenmemiş olabilir). Paneli yenileyip tekrar dene.' });
      }
      const eski = oku('cms.json', {});
      // 1) Stok: panel açıkken gelen siparişlerin düşümü ezilmesin → panelde yapılan DEĞİŞİKLİK (fark) uygulanır
      const yuklenen = (g._stokYuklenen && typeof g._stokYuklenen === 'object') ? g._stokYuklenen : null;
      delete g._stokYuklenen;
      (g.products || []).forEach(p => {
        const sp = (eski.products || []).find(x => x.id === p.id);
        if (!sp || typeof p.stok !== 'number' || typeof sp.stok !== 'number') return;
        if (yuklenen && typeof yuklenen[p.id] === 'number') p.stok = Math.max(0, sp.stok + (p.stok - yuklenen[p.id]));
      });
      // 2) Kupon kullanım sayacı sunucuda artar; panel eski sayıyla ezmesin
      (g.coupons || []).forEach(c => {
        const sc = (eski.coupons || []).find(x => (x.kod || '').toUpperCase() === (c.kod || '').toUpperCase());
        if (sc && (sc.kullanildi || 0) > (c.kullanildi || 0)) c.kullanildi = sc.kullanildi;
      });
      // 3) Panelden yüklenen base64 görseller dosyaya yazılır → /api/config küçük ve hızlı kalır
      const IMG_DIZIN = process.env.OM_WEB_IMG || '/var/www/olivamore/assets/img';
      const gez = (o) => {
        if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === 'string') o[i] = gorselDosyala(v, IMG_DIZIN); else if (v && typeof v === 'object') gez(v); }); return; }
        Object.keys(o).forEach(k => { const v = o[k]; if (typeof v === 'string') o[k] = gorselDosyala(v, IMG_DIZIN); else if (v && typeof v === 'object') gez(v); });
      };
      gez(g);
      // Eski sürümü yedekle (son 20 kayıt), sonra yaz
      try {
        const yd = dosya('cms-gecmis'); if (!fs.existsSync(yd)) fs.mkdirSync(yd);
        fs.writeFileSync(path.join(yd, 'cms-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), JSON.stringify(eski));
        fs.readdirSync(yd).sort().slice(0, -20).forEach(f => { try { fs.unlinkSync(path.join(yd, f)); } catch (e) { } });
      } catch (e) { console.error('[cms-yedek]', e.message); }
      yaz('cms.json', g);
      cmsOnbellek = null;
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'GET' && yol === '/api/admin/siparisler') {
      return json(res, 200, oku('siparisler.json', []));
    }
    if (req.method === 'POST' && yol === '/api/admin/siparis-bilgi') {
      const g = await govde(req, 1);
      const liste = oku('siparisler.json', []);
      const s = liste.find(x => x.no === g.no);
      if (!s) return json(res, 404, { hata: 'Sipariş bulunamadı.' });
      const m = s.musteri = s.musteri || {};
      const degisen = [];
      const ata = (alan, deger, n) => { if (deger === undefined) return; const v = temiz(deger, n); if (v !== (m[alan] || '')) { m[alan] = v; degisen.push(alan); } };
      if (g.musteri) {
        if (g.musteri.eposta !== undefined && !epostaMi(g.musteri.eposta)) return json(res, 400, { hata: 'E-posta adresi geçersiz.' });
        ata('ad', g.musteri.ad, 120); ata('telefon', g.musteri.telefon, 40); ata('adres', g.musteri.adres, 1000);
        ata('ilce', g.musteri.ilce, 60); ata('il', g.musteri.il, 60); ata('postaKodu', g.musteri.postaKodu, 10); ata('eposta', g.musteri.eposta, 200);
      }
      if (g.fatura) {
        if (g.fatura.tip === 'kurumsal') {
          if (!/^[0-9]{10,11}$/.test(String(g.fatura.vkn || '')) || !temiz(g.fatura.unvan, 200) || !temiz(g.fatura.vergiDairesi, 60)) return json(res, 400, { hata: 'Kurumsal fatura bilgileri eksik ya da hatalı.' });
          s.faturaBilgi = { tip: 'kurumsal', unvan: temiz(g.fatura.unvan, 200), vkn: temiz(g.fatura.vkn, 11), vergiDairesi: temiz(g.fatura.vergiDairesi, 60) };
        } else s.faturaBilgi = null;
        degisen.push('fatura');
      }
      if (degisen.length) {
        s.gecmis = s.gecmis || [];
        s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'bilgiler düzenlendi (' + degisen.join(', ') + ')' + (s.fatura && degisen.indexOf('fatura') !== -1 ? ' — fatura zaten kesilmiş, gerekirse iptal edip yeniden kes' : '') });
        yaz('siparisler.json', liste);
      }
      return json(res, 200, { tamam: true, degisen: degisen });
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
      // Fatura yönetimi: {fatura:{islem:'kesildi'|'geri-al', no}}  (Paraşüt entegrasyonu Faz B'de otomatikleşir)
      if (g.fatura && g.fatura.islem) {
        const fIslem = temiz(g.fatura.islem, 20);
        if (fIslem === 'kesildi') {
          s.fatura = { durum: 'kesildi', no: temiz(g.fatura.no, 40), tarih: new Date().toISOString() };
        } else if (fIslem === 'geri-al') {
          s.fatura = null;
        }
      }
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
      // İade onayı + kartla ödenmiş sipariş → iyzico'dan otomatik para iadesi
      if (g.iade && g.iade.islem === 'onay' && s.odendi && s.odemeId && s.odemeSaglayici !== 'paratika' && iyzicoAktif()) {
        try {
          const pi = await iyziParaIade(s, s.iade.tutar || s.toplam);
          s.iade.parasal = pi;
          s.gecmis = s.gecmis || [];
          s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'iyzico para iadesi: ₺' + pi.iadeEdilen + (pi.tamam ? '' : ' (eksik kaldı — kontrol et)') });
        } catch (e) {
          s.iade.parasal = { hata: e.message };
          s.gecmis = s.gecmis || [];
          s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'iyzico para iadesi BAŞARISIZ: ' + e.message });
        }
      }
      // "Hazırlanıyor"a geçiş + Paraşüt bağlı → otomatik e-Arşiv fatura
      if (s.durum === 'hazırlanıyor' && eskiDurum !== 'hazırlanıyor' && !s.fatura && parasutAktif()) {
        try {
          await parasutFaturaKes(s);
          s.gecmis = s.gecmis || [];
          s.gecmis.unshift({ tarih: new Date().toISOString(), islem: s.fatura.durum === 'kesildi' ? ('Paraşüt e-Arşiv faturası kesildi · ' + (s.fatura.no || '')) : ('Paraşüt fatura uyarısı: ' + (s.fatura.hata || '')) });
        } catch (e) {
          s.fatura = { durum: 'hata', kaynak: 'parasut', hata: e.message, tarih: new Date().toISOString() };
          s.gecmis = s.gecmis || [];
          s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'Paraşüt fatura hatası: ' + e.message });
        }
      }
      // Sipariş iptalinde Yurtiçi'ye bildirilmiş gönderi varsa kargo da iptal edilir
      if (s.durum === 'iptal' && eskiDurum !== 'iptal' && s.kargoFirma === 'Yurtiçi' && s.kargoNo && kargoAktif().yurtici) {
        try {
          const ki = await yurticiGonderiIptal(s);
          s.gecmis = s.gecmis || [];
          s.gecmis.unshift({ tarih: new Date().toISOString(), islem: ki.tamam ? 'Yurtiçi gönderisi iptal edildi' : ('Yurtiçi iptal UYARI: ' + ki.hata) });
        } catch (e) {
          s.gecmis = s.gecmis || [];
          s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'Yurtiçi iptal hatası: ' + e.message });
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
      if (g.fatura && g.fatura.islem) kayit.push(g.fatura.islem === 'kesildi' ? ('fatura kesildi' + (s.fatura && s.fatura.no ? ' · ' + s.fatura.no : '')) : 'fatura kaydı geri alındı');
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
      const segment = temiz(g.segment, 20) || 'aboneler';
      const aboneler = segmentUyeleri(segment);
      if (!aboneler.length) return json(res, 400, { hata: 'Bu segmentte hiç alıcı yok.' });
      const kampanyalar = oku('kampanyalar.json', []);
      kampanyalar.unshift({ tarih: new Date().toISOString(), konu: konu, alici: aboneler.length, segment: segment });
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

    /* ---- kargo (admin) ---- */
    if (req.method === 'GET' && yol === '/api/admin/kargo-durum') {
      return json(res, 200, kargoAktif());
    }
    if (req.method === 'POST' && yol === '/api/admin/kargo-gonder') {
      const g = await govde(req, 1);
      const liste = oku('siparisler.json', []);
      const s = liste.find(x => x.no === temiz(g.no, 20));
      if (!s) return json(res, 404, { hata: 'Sipariş bulunamadı.' });
      const firma = temiz(g.firma, 20);
      if (g.koli) s.koliAdet = Math.min(50, Math.max(1, parseInt(g.koli, 10) || 1));
      const aktif = kargoAktif();
      if (firma === 'Yurtiçi' && !aktif.yurtici) return json(res, 400, { hata: 'Yurtiçi WS bilgileri girilmemiş (env.json → yurticiWsUser / yurticiWsSifre).' });
      if (firma === 'DHL' && !aktif.dhl) return json(res, 400, { hata: 'DHL API bilgileri girilmemiş (env.json → dhlApiKey / dhlApiSecret / dhlHesapNo).' });
      if (['Yurtiçi', 'DHL'].indexOf(firma) === -1) return json(res, 400, { hata: 'Geçersiz taşıyıcı.' });
      try {
        const sonuc = firma === 'Yurtiçi' ? await yurticiGonderiOlustur(s) : await dhlGonderiOlustur(s);
        if (sonuc.hata) return json(res, 502, { hata: firma + ': ' + sonuc.hata });
        const eskiDurum = s.durum;
        s.kargoFirma = firma;
        s.kargoNo = sonuc.kargoNo;
        s.durum = 'kargolandı';
        s.gecmis = s.gecmis || [];
        s.gecmis.unshift({ tarih: new Date().toISOString(), islem: firma + ' gönderisi oluşturuldu (' + sonuc.kargoNo + ')' });
        yaz('siparisler.json', liste);
        if (eskiDurum !== 'kargolandı' && s.musteri && s.musteri.eposta) {
          epostaGonder(s.musteri.eposta, 'Siparişiniz kargoya verildi · ' + s.no,
            'Merhaba ' + s.musteri.ad + ',\n\n' + s.no + ' numaralı siparişiniz kargoya verildi.\nKargo: ' + firma + ' · Takip No: ' + sonuc.kargoNo + '\n\nAfiyet olsun,\nOlivamore');
        }
        const etiketVar = fs.existsSync(dosya('etiket-' + s.no + '.pdf'));
        return json(res, 200, { tamam: true, kargoNo: sonuc.kargoNo, etiket: etiketVar });
      } catch (e) {
        return json(res, 502, { hata: firma + ' servisine ulaşılamadı: ' + e.message });
      }
    }
    if (req.method === 'GET' && yol === '/api/admin/etiket') {
      const u = new URL(req.url, 'http://x');
      const no = String(u.searchParams.get('no') || '').replace(/[^A-Za-z0-9-]/g, '');
      const yolPdf = dosya('etiket-' + no + '.pdf');
      if (!no || !fs.existsSync(yolPdf)) { return json(res, 404, { hata: 'Etiket bulunamadı.' }); }
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="etiket-' + no + '.pdf"' });
      return fs.createReadStream(yolPdf).pipe(res);
    }

    if (req.method === 'GET' && yol === '/api/admin/ozet') {
      const siparisler = oku('siparisler.json', []);
      const cfg = oku('cms.json', {});
      const faturalanacak = ['hazırlanıyor', 'kargolandı', 'teslim'];
      return json(res, 200, {
        yeniSiparis: siparisler.filter(s => s.durum === 'yeni').length,
        iadeTalep: siparisler.filter(s => s.iade && s.iade.durum === 'talep').length,
        odemeBekleyen: siparisler.filter(s => s.durum === 'odeme-bekliyor').length,
        okunmamisMesaj: oku('mesajlar.json', []).filter(m => !m.okundu).length,
        dusukStok: ((cfg.products) || []).filter(p => p.visible !== false && typeof p.stok === 'number' && p.stok <= 5).length,
        bekleyenYorum: oku('yorumlar.json', []).filter(y => y.durum === 'bekliyor').length,
        faturasiz: siparisler.filter(s => s.kaynak !== 'wordpress' && faturalanacak.indexOf(s.durum) !== -1 && !(s.fatura && s.fatura.durum === 'kesildi')).length,
        aktifAbonelik: oku('abonelikler.json', []).filter(a => a.durum === 'aktif').length,
        parasut: parasutAktif(),
        kartIade: iyzicoAktif(),
        trendyol: trendyolAktif(),
        hepsiburada: hbAktif()
      });
    }

    /* ---- Üye segmentleri: sayılar ---- */
    if (req.method === 'GET' && yol === '/api/admin/segmentler') {
      const adlar = ['aboneler', 'uyeler', 'musteriler', 'coklu', 'tek', 'sessiz90', 'vip'];
      const sonuc = {};
      adlar.forEach(a => { sonuc[a] = segmentUyeleri(a).length; });
      return json(res, 200, sonuc);
    }

    /* ---- Satış kanalları: eşleme + elle senkron + durum ---- */
    if (req.method === 'GET' && yol === '/api/admin/kanal-esleme') {
      return json(res, 200, { esleme: eslemeOku(), durum: oku('kanal-durum.json', {}) });
    }
    if (req.method === 'POST' && yol === '/api/admin/kanal-esleme') {
      const g = await govde(req, 1);
      yaz('kanal-esleme.json', g.esleme || {});
      return json(res, 200, { tamam: true });
    }
    if (req.method === 'POST' && yol === '/api/admin/kanal-senkron') {
      if (!trendyolAktif() && !hbAktif()) return json(res, 400, { hata: 'Hiçbir kanal anahtarı tanımlı değil (env.json).' });
      const eklenen = await kanalSiparisCek();
      await kanalStokGonder();
      return json(res, 200, { tamam: true, yeniSiparis: eklenen, durum: oku('kanal-durum.json', {}) });
    }

    /* ---- Fatura: manuel Paraşüt kesimi / tekrar deneme ---- */
    // Panelden: Paraşüt'te TASLAK fatura (resmileştirmeden) — eski site siparişleri ve faturası unutulmuş siparişler için
    if (req.method === 'POST' && yol === '/api/admin/taslak-fatura') {
      if (!parasutAktif()) return json(res, 400, { hata: 'Paraşüt anahtarları env.json\'da tanımlı değil.' });
      const g = await govde(req, 1);
      const liste = oku('siparisler.json', []);
      const s = liste.find(x => x.no === g.no);
      if (!s) return json(res, 404, { hata: 'Sipariş bulunamadı.' });
      if (s.fatura && s.fatura.durum === 'kesildi') return json(res, 400, { hata: 'Bu siparişin faturası zaten kesilmiş.' });
      if (s.fatura && s.fatura.durum === 'taslak' && !g.yeniden) return json(res, 409, { hata: 'Bu sipariş için Paraşüt\'te zaten bir taslak var (' + (s.fatura.no || '') + '). Yine de yenisini oluşturmak istiyor musun?', kod: 'taslak-var' });
      if (['iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'].indexOf(s.durum) !== -1 && !g.yeniden) return json(res, 409, { hata: 'Sipariş "' + s.durum + '" durumunda. Yine de taslak fatura oluşturulsun mu?', kod: 'durum-uyari' });
      try {
        await parasutFaturaKes(s, { taslak: true });
        s.gecmis = s.gecmis || [];
        s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'Paraşüt\'te taslak fatura oluşturuldu · ' + (s.fatura.no || '') });
        yaz('siparisler.json', liste);
        return json(res, 200, { tamam: true, fatura: s.fatura });
      } catch (e) {
        return json(res, 502, { hata: 'Taslak oluşturulamadı: ' + e.message });
      }
    }
    if (req.method === 'POST' && yol === '/api/admin/fatura-kes') {
      if (!parasutAktif()) return json(res, 400, { hata: 'Paraşüt anahtarları env.json\'da tanımlı değil.' });
      const g = await govde(req, 1);
      const liste = oku('siparisler.json', []);
      const s = liste.find(x => x.no === g.no);
      if (!s) return json(res, 404, { hata: 'Sipariş bulunamadı.' });
      if (s.fatura && s.fatura.durum === 'kesildi') return json(res, 400, { hata: 'Bu siparişin faturası zaten kesilmiş.' });
      try {
        await parasutFaturaKes(s);
        s.gecmis = s.gecmis || [];
        s.gecmis.unshift({ tarih: new Date().toISOString(), islem: s.fatura.durum === 'kesildi' ? ('Paraşüt e-Arşiv faturası kesildi · ' + (s.fatura.no || '')) : ('Paraşüt fatura uyarısı: ' + (s.fatura.hata || '')) });
      } catch (e) {
        s.fatura = { durum: 'hata', kaynak: 'parasut', hata: e.message, tarih: new Date().toISOString() };
      }
      yaz('siparisler.json', liste);
      if (s.fatura.durum !== 'kesildi') return json(res, 502, { hata: s.fatura.hata || 'Fatura kesilemedi.', fatura: s.fatura });
      return json(res, 200, { tamam: true, fatura: s.fatura });
    }
    /* ---- Ödeme: manuel iyzico para iadesi ---- */
    if (req.method === 'POST' && yol === '/api/admin/odeme-iade') {
      const g = await govde(req, 1);
      const liste = oku('siparisler.json', []);
      const s = liste.find(x => x.no === g.no);
      if (!s) return json(res, 404, { hata: 'Sipariş bulunamadı.' });
      try {
        const pi = await iyziParaIade(s, parseFloat(g.tutar) || s.toplam);
        s.iade = s.iade || {};
        s.iade.parasal = pi;
        s.gecmis = s.gecmis || [];
        s.gecmis.unshift({ tarih: new Date().toISOString(), islem: 'iyzico para iadesi (manuel): ₺' + pi.iadeEdilen });
        yaz('siparisler.json', liste);
        return json(res, 200, { tamam: true, iade: pi });
      } catch (e) {
        return json(res, 502, { hata: e.message });
      }
    }

    /* ---- Abonelikler (Faz A iskeleti; otomatik sipariş motoru Faz D'de) ---- */
    if (req.method === 'GET' && yol === '/api/admin/abonelikler') {
      return json(res, 200, oku('abonelikler.json', []));
    }
    if (req.method === 'POST' && yol === '/api/admin/abonelik') {
      const g = await govde(req, 1);
      const liste = oku('abonelikler.json', []);
      if (g.sil && g.id) {
        const kalan = liste.filter(a => a.id !== g.id);
        yaz('abonelikler.json', kalan);
        return json(res, 200, { tamam: true });
      }
      if (g.id) {
        const a = liste.find(x => x.id === g.id);
        if (!a) return json(res, 404, { hata: 'Abonelik bulunamadı.' });
        if (g.durum) a.durum = temiz(g.durum, 20);
        if (g.periyotGun) a.periyotGun = parseInt(g.periyotGun, 10) || a.periyotGun;
        if (g.sonrakiTarih) a.sonrakiTarih = temiz(g.sonrakiTarih, 10);
        yaz('abonelikler.json', liste);
        return json(res, 200, { tamam: true, abonelik: a });
      }
      const yeni = {
        id: 'AB-' + Date.now().toString(36).toUpperCase(),
        eposta: temiz(g.eposta, 120).toLowerCase(),
        ad: temiz(g.ad, 80),
        urun: temiz(g.urun, 120),
        pid: temiz(g.pid, 40),
        adet: Math.max(1, parseInt(g.adet, 10) || 1),
        fiyat: parseFloat(g.fiyat) || 0,
        telefon: temiz(g.telefon, 40),
        adres: temiz(g.adres, 1000),
        il: temiz(g.il, 60), ilce: temiz(g.ilce, 60),
        periyotGun: Math.max(7, parseInt(g.periyotGun, 10) || 30),
        sonrakiTarih: temiz(g.sonrakiTarih, 10) || new Date(Date.now() + 2592000000).toISOString().slice(0, 10),
        durum: 'aktif',
        olusturma: new Date().toISOString()
      };
      liste.push(yeni);
      yaz('abonelikler.json', liste);
      return json(res, 200, { tamam: true, abonelik: yeni });
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
/* Markalı HTML e-posta şablonu: düz metni şık bir zarfa koyar.
   Satır sonları korunur, URL'ler tıklanabilir olur, son "—" sonrası dipnot sayılır. */
function epostaHtmlYap(konu, metin) {
  const kacir = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linkle = s => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#806A36;">$1</a>');
  // Gövde / dipnot ayrımı (çıkış linki vb. "—" ile ayrılıyor)
  const parcalar = String(metin).split(/\n—\n/);
  const govdeHtml = linkle(kacir(parcalar[0])).replace(/\n/g, '<br>');
  const dipnotHtml = parcalar[1] ? linkle(kacir(parcalar.slice(1).join('\n'))).replace(/\n/g, '<br>') : '';
  // Tek parça kart: tüm içerik tek çerçeveli tabloda, satırlar arası boşluk/kenarlık yok
  return '<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#F7F6F3;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F7F6F3;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;border:1px solid #ECEAE6;border-radius:14px;overflow:hidden;border-collapse:separate;">' +
    // Başlık bandı
    '<tr><td style="background-color:#000000;padding:28px 20px;text-align:center;border-radius:13px 13px 0 0;">' +
    '<img src="https://olivamore.de/assets/img/logo-eposta.png" alt="OLIVAMORE" width="180" style="width:180px;height:auto;border:0;display:inline-block;">' +
    '</td></tr>' +
    // Gövde
    '<tr><td style="padding:32px 34px 24px 34px;">' +
    '<div style="font-family:Georgia,serif;font-size:20px;color:#1E1C19;margin-bottom:16px;">' + kacir(konu) + '</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#4A463F;">' + govdeHtml + '</div>' +
    '</td></tr>' +
    // Alt bölüm (aynı kartın içinde, ince ayraçla)
    '<tr><td style="padding:18px 34px 22px 34px;text-align:center;border-top:1px dashed #ECEAE6;">' +
    '<div style="font-family:Georgia,serif;font-style:italic;font-size:13px;color:#806A36;margin-bottom:8px;">&ldquo;Her şişe, tek bir hasadın izini taşır.&rdquo;</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a8377;"><a href="https://olivamore.de" style="color:#8a8377;">olivamore.de</a></div>' +
    (dipnotHtml ? '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#b0aa9e;margin-top:10px;line-height:1.6;">' + dipnotHtml + '</div>' : '') +
    '</td></tr></table></td></tr></table></body></html>';
}

// Herhangi bir alıcıya e-posta — Resend (öncelikli) veya Brevo (yedek)
function epostaGonder(kime, konu, metin) {
  const env = oku('env.json', {});
  if (!epostaMi(kime)) return;
  const adres = SITE(), adresAd = SITE_AD();
  metin = String(metin).replace(/https:\/\/olivamore\.de/g, adres);
  const html = epostaHtmlYap(konu, metin).replace(/https:\/\/olivamore\.de/g, adres).replace(/>olivamore\.de</g, '>' + adresAd + '<');
  const gonderen = env.gonderen || ('siparis@' + adresAd.replace(/^www\./, ''));
  let secenek, veri;
  if (env.resendKey) {
    veri = JSON.stringify({
      from: 'Olivamore <' + gonderen + '>',
      to: [kime], subject: konu, text: metin, html: html,
      reply_to: env.yanitAdresi || undefined
    });
    secenek = {
      hostname: 'api.resend.com', path: '/emails', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.resendKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) }
    };
  } else if (env.brevoKey) {
    veri = JSON.stringify({
      sender: { name: 'Olivamore', email: gonderen },
      to: [{ email: kime }],
      subject: konu, textContent: metin, htmlContent: html
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

// Beklenmeyen bir hata tek bir isteği bozar, tüm servisi düşürmez (systemd yine de yeniden başlatır)
process.on('uncaughtException', e => console.error('[YAKALANMAYAN]', e && e.stack || e));
process.on('unhandledRejection', e => console.error('[YAKALANMAYAN-PROMISE]', e && e.stack || e));
sunucu.requestTimeout = 120000; sunucu.headersTimeout = 30000; sunucu.keepAliveTimeout = 5000;
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
if (envBozuk()) console.error('[env.json] OKUNAMIYOR (yazım hatası): ' + envBozuk() + ' — entegrasyonlar kapalı, panel girişi kilitli.');
sunucu.listen(PORT, '127.0.0.1', () => console.log('Olivamore API 127.0.0.1:' + PORT + ' · veri: ' + DATA));
