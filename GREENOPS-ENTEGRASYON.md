# Olivamore web sitesi ↔ Green Ops entegrasyonu

Bu belge Green Ops tarafında yazılacak kodu tarif eder. Site tarafı hazırdır.

## Akış

1. Web'de sipariş oluşur ya da değişir. Site, Green Ops'a **webhook** gönderir.
2. Green Ops siparişi kendi tablosuna **sipariş numarasıyla upsert** eder: varsa günceller, yoksa ekler.
3. Depo çalışanı Green Ops'ta siparişin yanındaki **Barkod** butonuna basar.
4. Green Ops sitenin `POST /api/entegre/kargo-barkod` ucunu çağırır.
5. Site Yurtiçi gönderisini açar. Bunu bir kez yapar; tekrar basılırsa aynı gönderiyi döndürür. Siparişi "kargolandı" yapar, müşteriye takip e-postası gönderir ve `etiketUrl` döner.
6. Green Ops `etiketUrl`'yi yeni sekmede açar. Etiket termal yazıcı boyutundadır ve sayfa açılınca yazdırma penceresi kendiliğinden gelir.
7. İsteğe bağlı: Green Ops paketleme durumunu `POST /api/entegre/durum` ile siteye bildirir.

## Sunucu ayarları (site sunucusu, `/var/www/olivamore-data/env.json`)

| Alan | Açıklama |
|---|---|
| `greenOpsWebhookUrl` | Green Ops'un webhook alacağı adres, örn. `https://ops.ornek.com/api/webhooks/olivamore` |
| `greenOpsSecret` | Webhook imza anahtarı. Uzun ve rastgele olmalı; aynısı Green Ops'ta da tanımlanır. |
| `greenOpsApiKey` | Green Ops'un siteye istek atarken kullandığı anahtar (Bearer). Uzun ve rastgele olmalı. |
| `greenOpsEtiket` | İsteğe bağlı etiket boyutu: `100x80` (varsayılan; Zebra ZD220), `100x75`, `100x100` veya `100x150` |

Rastgele anahtar üretmek için: `openssl rand -hex 32`

## 1) Webhook (site → Green Ops)

`POST {greenOpsWebhookUrl}` gövdesi JSON:

```json
{
  "olay": "siparis.yeni",
  "id": "a1b2c3d4e5f60718",
  "zaman": "2026-11-10T09:42:04.233Z",
  "siparis": {
    "no": "OM-261110-1234",
    "tarih": "2026-11-10T09:41:58.000Z",
    "kanal": "web",
    "durum": "yeni",
    "odeme": { "yontem": "havale", "alindi": false },
    "musteri": { "ad": "Ad Soyad", "eposta": "x@y.com", "telefon": "05551112233" },
    "teslimat": { "adres": "…", "ilce": "Bornova", "il": "İzmir", "postaKodu": "", "not": "" },
    "fatura": { "tip": "bireysel" },
    "kalemler": [
      { "siteKodu": "ay500", "sku": "GO-AY-500", "ad": "Ayvalık Erken Hasat · 500 ml", "adet": 2, "birimFiyat": 500, "kdvOrani": 1 }
    ],
    "tutar": { "araToplam": 1000, "indirim": 0, "kargo": 0, "kdv": 9.9, "toplam": 1000, "paraBirimi": "TRY" },
    "kupon": null,
    "kargo": { "firma": "", "takipNo": "", "etiketHazir": false },
    "iade": null, "partiKod": "", "adminNot": ""
  }
}
```

**Olaylar**

| Olay | Ne zaman gelir |
|---|---|
| `siparis.yeni` | Sipariş ilk kez oluştuğunda |
| `siparis.guncellendi` | Durum, ödeme, adres, kargo, iade ya da kalemlerden biri değiştiğinde. Her zaman siparişin **son halinin tamamı** gelir. |
| `test` | Paneldeki "Bağlantıyı test et" butonu (`siparis` yerine bilgi alanı içerir) |

**Önemli kurallar**

- **Upsert:** Aynı `siparis.no` tekrar gelebilir. Kaydı güncelleyin, çift kayıt açmayın.
- **Yanıt:** 2xx dönerseniz teslim edilmiş sayılır. Başka bir kod ya da zaman aşımında site 1, 2, 5, 15, 30, 60, 120, 240, 480 ve 720 dakika arayla yeniden dener. Yanıtı 15 saniye içinde verin.
- **Sevkiyat kuralı:** `odeme.alindi === false` ise (havale henüz gelmediyse) siparişi "ödeme bekleniyor" olarak tutun. Lot düşümü ve sevkiyat `alindi: true` olduğunda yapılmalı.
- **Stok kodu:** `sku`, Green Ops stok kodudur ve sitede ürüne girilen kod öncelikli kullanılır. Green Ops'ta karşılığı yoksa eşleştirme uyarısı verin.
- Ödeme sayfasında yarıda kalan kart denemeleri (`odeme-bekliyor` / `odeme-basarisiz`) ve eski WordPress siparişleri **gönderilmez**.

**İmza doğrulama (zorunlu)**

Başlıklar:

- `X-Olivamore-Olay`
- `X-Olivamore-Teslim` (= `id`)
- `X-Olivamore-Zaman` (unix saniye)
- `X-Olivamore-Imza: sha256=<hex>`

İmza şöyle hesaplanır: `HMAC_SHA256(greenOpsSecret, Zaman + "." + hamGövde)`. Gövdeyi JSON'a çevirmeden önce **ham haliyle** doğrulayın.

```js
// Node/Express örneği
app.post('/api/webhooks/olivamore', express.raw({ type: 'application/json' }), (req, res) => {
  const zaman = req.get('X-Olivamore-Zaman');
  const beklenen = 'sha256=' + crypto.createHmac('sha256', process.env.OLIVAMORE_SECRET).update(zaman + '.' + req.body).digest('hex');
  const gelen = req.get('X-Olivamore-Imza') || '';
  if (gelen.length !== beklenen.length || !crypto.timingSafeEqual(Buffer.from(gelen), Buffer.from(beklenen))) return res.sendStatus(401);
  if (Math.abs(Date.now() / 1000 - Number(zaman)) > 600) return res.sendStatus(401); // 10 dk tekrar saldırısı koruması
  const { olay, siparis } = JSON.parse(req.body);
  if (olay === 'test') return res.sendStatus(200);
  // upsert(siparis.no, siparis) …
  res.sendStatus(200);
});
```

## 2) Green Ops → site API

Taban adres `https://olivamore.com` (geçişe kadar `https://olivamore.de`). Her istekte şu başlık gerekir:

`Authorization: Bearer <greenOpsApiKey>`

### Tek tuş kargo barkodu

```
POST /api/entegre/kargo-barkod
{ "no": "OM-261110-1234", "kullanici": "depo-ayse" }
```

Başarılı yanıt (200):

```json
{ "tamam": true, "yeni": true, "no": "OM-261110-1234", "kargoFirma": "Yurtiçi", "kargoNo": "OM-261110-1234",
  "etiketUrl": "https://olivamore.com/api/entegre/etiket?no=…&exp=…&t=…" }
```

- `yeni: false` ise gönderi daha önce açılmıştır; aynı etiket yeniden basılır. Butona iki kez basmak ya da iki kişinin aynı anda basması ikinci gönderi açmaz.
- `409` + `"kod": "odeme-bekliyor"` ödemenin henüz alınmadığını gösterir. Yetkili kişi yine de göndermek isterse `"zorla": true` ile tekrar çağrılır.
- `409` iptal ya da iade edilmiş siparişi gösterir. `502` Yurtiçi hatasıdır; mesajı kullanıcıya gösterin.
- `etiketUrl` 30 dakika geçerlidir ve anahtar içermez. Doğrudan `window.open(etiketUrl)` ile açın. Süresi dolarsa butona tekrar basmak yeni link üretir.

**Örnek buton kodu (tarayıcı tarafı):** Anahtar tarayıcıya konmaz; çağrı Green Ops sunucusundan yapılır.

```js
// Green Ops sunucusu: /api/olivamore/barkod/:no  →  siteye vekil istek
const r = await fetch(SITE + '/api/entegre/kargo-barkod', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + process.env.OLIVAMORE_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ no, kullanici: req.user.ad })
});
res.status(r.status).json(await r.json());

// Green Ops arayüzü: Barkod butonu
const d = await (await fetch('/api/olivamore/barkod/' + no, { method: 'POST' })).json();
if (d.tamam) window.open(d.etiketUrl, '_blank'); else alert(d.hata);
```

### Diğer uçlar

| İstek | Açıklama |
|---|---|
| `GET /api/entegre/siparisler?sonra=<ISO tarih>&durum=<durum>` | Kaçan webhook'lar için yedek senkron (en fazla 500 kayıt). Webhook ile aynı sipariş biçimi. |
| `GET /api/entegre/siparis?no=<no>` | Tek sipariş + varsa `etiketUrl` |
| `POST /api/entegre/durum` `{ "no", "durum": "hazırlanıyor" \| "kargolandı" \| "tamamlandı", "not" }` | Green Ops'taki ilerlemeyi siteye yazar (sipariş geçmişine "Green Ops: …" olarak düşer) |

## Termal yazıcı ayarı

- Etiket HTML'dir ve `@page` boyutu (varsayılan `100mm × 80mm`) tanımlıdır. Chrome'da ilk seferde şunları seçin: yazdırma penceresinde yazıcı = termal yazıcı, kenar boşluğu = **Yok**, ölçek = **%100**. Chrome bu ayarları hatırlar.
- Yazıcı sürücüsünde kâğıt boyutu etiket boyutuyla aynı olmalı. Boyut farklıysa sunucuda `greenOpsEtiket` değerini değiştirin.
- Yazdırma penceresi hiç çıkmadan basmak için depo bilgisayarında Chrome'u `--kiosk-printing` parametresiyle açın; varsayılan yazıcı termal yazıcı olmalı.
- Barkod Code128 biçimindedir ve sipariş numarasını (Yurtiçi `cargoKey`) taşır. Yurtiçi şubesi bunu okutup irsaliyeyi kendisi basar.

## Panelden izleme

Panel → Ayarlar → **Green Ops** sekmesi şunları gösterir:

- Bağlantı durumu, kuyrukta bekleyenler ve gönderilemeyenler
- Son aktarımlar
- **Bağlantıyı test et**, **Yeniden gönder** ve **Son 7 günü gönder** butonları

Entegrasyon ilk açıldığında mevcut siparişler geçmiş sayılır ve gönderilmez. İstenirse "Son 7 günü gönder" butonuyla gönderilebilir.
