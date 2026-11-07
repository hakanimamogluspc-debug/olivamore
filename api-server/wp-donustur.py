#!/usr/bin/env python3
"""
WordPress/WooCommerce (UpdraftPlus SQL yedeği) → Olivamore aktarım dosyası.
Kullanım:  python3 wp-donustur.py <yedek.gz veya .sql> <cikti.json>
Çıktı: {"siparisler": [...], "uyeler": [...], "bulten": [...], "ozet": {...}}
Kişisel veri içerir: çıktı dosyası GitHub'a gönderilmez (wp-yedek/ klasöründe tutulur).
"""
import re, sys, json, gzip, collections
from datetime import datetime, timezone, timedelta

GIRDI, CIKTI = sys.argv[1], sys.argv[2]
P = None  # tablo öneki dosyadan okunur

# ---------- SQL okuma (MySQL gerekmez) ----------
def satirlari_coz(s, i):
    satirlar, n = [], len(s)
    while i < n:
        while i < n and s[i] in ' \n\r\t,': i += 1
        if i >= n or s[i] == ';': break
        i += 1; satir = []
        while True:
            while s[i] in ' \n\r\t': i += 1
            if s[i] == "'":
                i += 1; buf = []
                while True:
                    c = s[i]
                    if c == '\\':
                        nx = s[i+1]; buf.append({'n': '\n', 'r': '\r', 't': '\t', '0': '\0', 'Z': '\x1a'}.get(nx, nx)); i += 2
                    elif c == "'":
                        if s[i+1] == "'": buf.append("'"); i += 2
                        else: i += 1; break
                    else: buf.append(c); i += 1
                satir.append(''.join(buf))
            else:
                j = i
                while s[j] not in ',)': j += 1
                tok = s[i:j].strip(); i = j
                satir.append(None if tok.upper() == 'NULL' else tok)
            while s[i] in ' \n\r\t': i += 1
            if s[i] == ',': i += 1; continue
            if s[i] == ')': i += 1; break
        satirlar.append(satir)
    return satirlar, i

ham = (gzip.open(GIRDI, 'rt', encoding='utf-8', errors='replace') if GIRDI.endswith('.gz') else open(GIRDI, encoding='utf-8', errors='replace')).read()
m = re.search(r'# Table prefix: (\w+)', ham); P = m.group(1) if m else 'wp_'
TABLOLAR = {P + t for t in ['wc_orders', 'wc_order_addresses', 'wc_orders_meta', 'woocommerce_order_items', 'woocommerce_order_itemmeta',
                            'users', 'usermeta', 'mailpoet_subscribers', 'comments', 'posts']}
kol, V = {}, collections.defaultdict(list)
for mm in re.finditer(r'CREATE TABLE `(\w+)` \((.*?)\n\)', ham, re.S):
    if mm.group(1) in TABLOLAR: kol[mm.group(1)] = re.findall(r'^\s*`(\w+)`', mm.group(2), re.M)
for mm in re.finditer(r'INSERT INTO `(\w+)` VALUES ', ham):
    t = mm.group(1)
    if t not in TABLOLAR: continue
    rows, _ = satirlari_coz(ham, mm.end())
    V[t].extend(dict(zip(kol[t], r)) for r in rows)
del ham
T = lambda ad: V[P + ad]

# ---------- yardımcılar ----------
IL = {'01':'Adana','02':'Adıyaman','03':'Afyonkarahisar','04':'Ağrı','05':'Amasya','06':'Ankara','07':'Antalya','08':'Artvin','09':'Aydın','10':'Balıkesir','11':'Bilecik','12':'Bingöl','13':'Bitlis','14':'Bolu','15':'Burdur','16':'Bursa','17':'Çanakkale','18':'Çankırı','19':'Çorum','20':'Denizli','21':'Diyarbakır','22':'Edirne','23':'Elazığ','24':'Erzincan','25':'Erzurum','26':'Eskişehir','27':'Gaziantep','28':'Giresun','29':'Gümüşhane','30':'Hakkari','31':'Hatay','32':'Isparta','33':'Mersin','34':'İstanbul','35':'İzmir','36':'Kars','37':'Kastamonu','38':'Kayseri','39':'Kırklareli','40':'Kırşehir','41':'Kocaeli','42':'Konya','43':'Kütahya','44':'Malatya','45':'Manisa','46':'Kahramanmaraş','47':'Mardin','48':'Muğla','49':'Muş','50':'Nevşehir','51':'Niğde','52':'Ordu','53':'Rize','54':'Sakarya','55':'Samsun','56':'Siirt','57':'Sinop','58':'Sivas','59':'Tekirdağ','60':'Tokat','61':'Trabzon','62':'Tunceli','63':'Şanlıurfa','64':'Uşak','65':'Van','66':'Yozgat','67':'Zonguldak','68':'Aksaray','69':'Bayburt','70':'Karaman','71':'Kırıkkale','72':'Batman','73':'Şırnak','74':'Bartın','75':'Ardahan','76':'Iğdır','77':'Yalova','78':'Karabük','79':'Kilis','80':'Osmaniye','81':'Düzce'}
def il_ad(st):
    st = (st or '').strip()
    mm = re.match(r'^TR(\d\d)$', st)
    return IL.get(mm.group(1), st) if mm else st
def f(x):
    try: return float(x)
    except (TypeError, ValueError): return 0.0
def yuvarla(x): return round(x + 1e-9, 2)
def iso(t):
    if not t or t.startswith('0000'): return None
    return datetime.strptime(t, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z')
def temiz(x, n=500): return (x or '').strip()[:n]

# WooCommerce ürün → yeni site ürün kodu (adres eşlemesiyle aynı)
URUN_KOD = {
  'ayvalik-erken-hasat-naturel-sizma-zeytinyagi-cam-sise-250-ml': 'ay250', 'ayvalik-erken-hasat-naturel-sizma-zeytinyagi-500ml': 'ay500',
  'ayvalik-erken-hasat-naturel-sizma-zeytinyagi-cam-sise-750-ml': 'ay750', 'ayvalik-erken-hasat-naturel-sizma-zeytinyagi-2l-teneke': 'ay2l',
  'ayvalik-erken-hasat-naturel-sizma-zeytinyagi-5l-teneke': 'ay5l', 'trilye-erken-hasat-naturel-sizma-zeytinyagi-cam-sise-250ml': 'tr250',
  'trilye-erken-hasat-naturel-sizma-zeytinyagi-cam-sise-500ml': 'tr500', 'trilye-erken-hasat-naturel-sizma-zeytinyagi-cam-sise-750ml': 'tr750',
  'trilye-erken-hasat-naturel-sizma-zeytinyagi-2l-teneke': 'tr2l', 'trilye-erken-hasat-naturel-sizma-zeytinyagi-5l-teneke': 'tr5l',
  'ayvalik-olgun-hasat-naturel-sizma-yemeklik-zeytinyagi-5l-teneke': 'og5l', 'gemlik-dogal-fermente-siyah-zeytin-5-kg-teneke': '152.05.01.06',
  'gemlik-dogal-fermente-siyah-zeytin-cam-kavanoz-500gr': 'zey-siyah', 'ayvalik-dogal-salamura-yesil-zeytin-cam-kavanoz-500gr': 'zey-yesil',
  'olivamore-bodrum-mandalinasi-cesnili-zeytinyagi': 'ces-mand', 'bergamot-cesnili-zeytinyagi-cam-sise-250-ml': 'ces-berg',
  'cantali-hediye-kutusu-3lu-hediye-seti-zeytinyagi-ve-zeytin': '152.06.01.03', 'avantaj-paketi-ozel': '152.06.01.06',
  'avantaj-paketi-selecto': '152.06.01.21', 'avantaj-paketi-uc-lezzet': '152.06.01.08', 'avantaj-paketi-grande': '152.06.01.13',
  'balsamik-sirke-cam-sise-250ml': 'sir-bal',
}
urun_slug = {x['ID']: x['post_name'] for x in T('posts') if x['post_type'] in ('product', 'product_variation')}
urun_img = {}

def ad_kod(ad):
    """Silinmiş/yeniden açılmış ürünler için ada göre eşleme ("- Yeni Sezon" vb.)"""
    a = (ad or '').lower().replace('ı', 'i').replace('İ', 'i')
    hacim = re.search(r'(250|500|750)\s*ml|(\d)\s*l\b|(\d+)\s*kg', a)
    def v():
        if not hacim: return ''
        if hacim.group(1): return hacim.group(1)
        if hacim.group(2): return hacim.group(2) + 'l'
        return hacim.group(3) + 'kg'
    if 'olgun hasat' in a: return 'og5l'
    if 'ayvalik erken hasat' in a and v() in ('250', '500', '750', '2l', '5l'): return 'ay' + v()
    if 'trilye erken hasat' in a and v() in ('250', '500', '750', '2l', '5l'): return 'tr' + v()
    if 'mandalina' in a and 'cesnili' in a.replace('ş', 's'): return 'ces-mand'
    if 'bergamot' in a: return 'ces-berg'
    if 'siyah zeytin' in a and '500' in a: return 'zey-siyah'
    if 'yesil zeytin' in a.replace('ş', 's'): return 'zey-yesil'
    if 'alic sirkesi' in a.replace('ı', 'i').replace('ç', 'c'): return 'sir-alic'
    if 'elma sirkesi' in a: return 'sir-elma'
    if 'uzum sirkesi' in a.replace('ü', 'u'): return 'sir-uzum'
    if 'nar eksisi' in a.replace('ş', 's') and 'hediye' not in a: return 'sir-nar'
    if 'balsamik' in a and 'hediye' not in a and 'set' not in a: return 'sir-bal'
    return ''
def test_kalemi(ad): return bool(re.match(r'^\s*(test|deneme)\b|test product|test ürün', (ad or '').lower()))

DURUM = {'wc-completed': 'tamamlandı', 'wc-processing': 'hazırlanıyor', 'wc-on-hold': 'yeni', 'wc-pending': 'odeme-bekliyor',
         'wc-cancelled': 'iptal', 'wc-refunded': 'iade', 'wc-failed': 'odeme-basarisiz', 'wc-return-approved': 'iade',
         'wc-return-requested': 'tamamlandı', 'wc-checkout-draft': None, 'trash': None}
KARGO_AD = {'dhl': 'DHL', 'yurtici': 'Yurtiçi', 'aras': 'Aras', 'mng': 'MNG', 'ptt': 'PTT', 'surat': 'Sürat', 'ups': 'UPS'}

meta = collections.defaultdict(dict)
for x in T('wc_orders_meta'): meta[x['order_id']][x['meta_key']] = x['meta_value']
adres = collections.defaultdict(dict)
for x in T('wc_order_addresses'): adres[x['order_id']][x['address_type']] = x
kalemler = collections.defaultdict(list)
for x in T('woocommerce_order_items'): kalemler[x['order_id']].append(x)
imeta = collections.defaultdict(dict)
for x in T('woocommerce_order_itemmeta'): imeta[x['order_item_id']][x['meta_key']] = x['meta_value']
notlar = collections.defaultdict(list)
for x in T('comments'):
    if x['comment_type'] == 'order_note': notlar[x['comment_post_ID']].append(x)
iadeler = collections.defaultdict(float)
for o in T('wc_orders'):
    if o['type'] == 'shop_order_refund' and o['parent_order_id']: iadeler[o['parent_order_id']] += abs(f(o['total_amount']))

simdi = datetime.now(timezone.utc)
siparisler, atlanan = [], collections.Counter()
for o in T('wc_orders'):
    if o['type'] != 'shop_order': continue
    if o['status'] == 'wc-kargo-verildi':
        tarih_dt = datetime.strptime(o['date_created_gmt'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        durum = 'kargolandı' if simdi - tarih_dt < timedelta(days=10) else 'tamamlandı'
    else:
        durum = DURUM.get(o['status'], 'tamamlandı')
    if durum is None: atlanan[o['status']] += 1; continue
    oid, mt = o['id'], meta[o['id']]
    fa = adres[oid].get('billing', {}); te = adres[oid].get('shipping') or fa
    def kisi(a): return (temiz(a.get('first_name')) + ' ' + temiz(a.get('last_name'))).strip()
    anonim = mt.get('_anonymized') == 'yes' or (o['billing_email'] or '').endswith('.invalid')
    musteri = {
        'ad': kisi(te) or kisi(fa) or '[anonim]',
        'eposta': '' if anonim else temiz(o['billing_email'] or fa.get('email'), 200).lower(),
        'telefon': temiz(fa.get('phone') or te.get('phone'), 40),
        'adres': ', '.join(p for p in [temiz(te.get('address_1')), temiz(te.get('address_2'))] if p),
        'ilce': temiz(te.get('city'), 60), 'il': il_ad(te.get('state'))[:60], 'postaKodu': temiz(te.get('postcode'), 10),
        'not': temiz(o['customer_note'], 500)
    }
    fatura_bilgi = None
    if mt.get('_billing_wooccm10') == 'Kurumsal' and re.match(r'^\d{10,11}$', mt.get('_billing_wooccm13') or ''):
        fatura_bilgi = {'tip': 'kurumsal', 'unvan': temiz(mt.get('_billing_wooccm11'), 200), 'vkn': mt['_billing_wooccm13'], 'vergiDairesi': temiz(mt.get('_billing_wooccm12'), 60)}
    kal, kargo, indirim, kupon = [], 0.0, 0.0, None
    for it in kalemler[oid]:
        im = imeta[it['order_item_id']]
        tip = it['order_item_type']
        if tip == 'line_item':
            adet = max(1, int(f(im.get('_qty'))))
            # Birim fiyat: kupon ÖNCESİ (subtotal) KDV dahil — indirim ayrı satırda düşülür
            net = f(im.get('_line_subtotal')) if im.get('_line_subtotal') not in (None, '') else f(im.get('_line_total'))
            vergi = f(im.get('_line_subtotal_tax')) if im.get('_line_subtotal_tax') not in (None, '') else f(im.get('_line_tax'))
            kdv = round(vergi / net * 100) if net > 0 else 1
            slug = urun_slug.get(im.get('_product_id'), '')
            kal.append({'ad': temiz(it['order_item_name'], 200), 'adet': adet, 'fiyat': yuvarla((net + vergi) / adet),
                        'kdv': kdv if kdv in (0, 1, 10, 20) else 1, 'kod': URUN_KOD.get(slug, '') or ad_kod(it['order_item_name']), 'hacim': ''})
        elif tip == 'shipping':
            kargo += f(im.get('cost')) + f(im.get('total_tax'))
        elif tip == 'coupon':
            indirim += f(im.get('discount_amount')) + f(im.get('discount_amount_tax'))
            kupon = (kupon + ', ' if kupon else '') + temiz(it['order_item_name'], 40).upper()
        elif tip == 'fee':
            tutar = f(im.get('_line_total')) + f(im.get('_line_tax'))
            if abs(tutar) > 0.004: kal.append({'ad': temiz(it['order_item_name'], 200), 'adet': 1, 'fiyat': yuvarla(tutar), 'kdv': 0, 'kod': '', 'hacim': ''})
    if kal and all(test_kalemi(k['ad']) for k in kal if k['fiyat'] > 0 or True):
        atlanan['test-siparisi'] += 1; continue
    ara = yuvarla(sum(k['fiyat'] * k['adet'] for k in kal))
    # Kuponsuz indirimler (kampanya kuralları vb.): toplamı tutturacak fark indirim sayılır
    fark = yuvarla(ara - indirim + kargo - f(o['total_amount']))
    if fark > 0.5: indirim += fark
    gecmis = [{'tarih': iso(n['comment_date_gmt']), 'islem': re.sub(r'<[^>]+>', '', n['comment_content'])[:300]} for n in sorted(notlar[oid], key=lambda n: n['comment_date_gmt'], reverse=True)]
    gecmis.append({'tarih': simdi.isoformat().replace('+00:00', 'Z'), 'islem': 'eski siteden (WooCommerce #' + oid + ') aktarıldı'})
    gecmis.sort(key=lambda g: g['tarih'] or '', reverse=True)
    firma = (mt.get('tracking_company') or '').lower()
    s = {
        'no': 'WC-' + oid, 'tarih': iso(o['date_created_gmt']), 'durum': durum,
        'odeme': 'kart' if o['payment_method'] else 'havale', 'odendi': durum not in ('odeme-bekliyor', 'odeme-basarisiz'),
        'odemeId': temiz(o['transaction_id'], 80), 'dil': 'tr', 'musteri': musteri, 'faturaBilgi': fatura_bilgi,
        'kalemler': kal, 'araToplam': ara, 'indirim': yuvarla(indirim), 'kupon': {'kod': kupon, 'indirim': yuvarla(indirim)} if kupon else None,
        'kdvToplam': yuvarla(f(o['tax_amount'])), 'kargo': yuvarla(kargo), 'toplam': yuvarla(f(o['total_amount'])),
        'kargoFirma': KARGO_AD.get(firma, firma.capitalize()) if firma else '', 'kargoNo': temiz(mt.get('tracking_code'), 60),
        'gecmis': gecmis[:40],
        # Eski kayıt işaretleri: otomasyon, fatura, kargo takibi, Meta, hatırlatma DIŞI
        'kaynak': 'wordpress', 'wcId': int(oid), 'stokIade': True, 'tekrarMail': True, 'metaGonderildi': True,
        'kanal': {'tur': mt.get('_wc_order_attribution_source_type', ''), 'kaynak': mt.get('_wc_order_attribution_utm_source', ''), 'cihaz': mt.get('_wc_order_attribution_device_type', '')},
        'fatura': {'belge': 'Eski sistem (WordPress)', 'no': '', 'eski': True}
    }
    if anonim: s['anonim'] = True
    if iadeler.get(oid): s['iade'] = {'durum': 'onay', 'tutar': yuvarla(iadeler[oid]), 'neden': 'eski sistemde iade', 'tarih': s['tarih']}
    if o['status'] == 'wc-return-requested': s['adminNot'] = 'Eski sitede iade talebi açıktı — kontrol et'
    if durum == 'hazırlanıyor': s['adminNot'] = 'Eski siteden açık sipariş olarak geldi — faturası ve kargosu eski düzende mi yapıldı kontrol et'
    siparisler.append(s)
siparisler.sort(key=lambda s: s['tarih'] or '', reverse=True)

# ---------- üyeler (müşteri rolündekiler) ----------
umeta = collections.defaultdict(dict)
for x in T('usermeta'): umeta[x['user_id']][x['meta_key']] = x['meta_value']
uyeler = []
for u in T('users'):
    m_ = umeta[u['ID']]
    yetki = m_.get(P + 'capabilities', '')
    if '"customer"' not in yetki: continue
    eposta = temiz(u['user_email'], 200).lower()
    if not eposta or eposta.endswith('.invalid'): continue
    ad = (temiz(m_.get('first_name')) + ' ' + temiz(m_.get('last_name'))).strip() or temiz(u['display_name'], 120) or eposta.split('@')[0]
    uye = {'id': 'U-WP' + u['ID'], 'ad': ad[:120], 'eposta': eposta, 'tuz': '', 'hash': '', 'sifreYok': True, 'kaynak': 'wordpress',
           'tarih': iso(u['user_registered']), 'oturumlar': []}
    if m_.get('shipping_address_1') or m_.get('billing_address_1'):
        pre = 'shipping_' if m_.get('shipping_address_1') else 'billing_'
        uye['adresler'] = [{'id': 'A-WP' + u['ID'], 'baslik': 'Kayıtlı adresim', 'ad': (temiz(m_.get(pre + 'first_name')) + ' ' + temiz(m_.get(pre + 'last_name'))).strip() or ad,
                            'telefon': temiz(m_.get('billing_phone'), 40), 'adres': ', '.join(p for p in [temiz(m_.get(pre + 'address_1')), temiz(m_.get(pre + 'address_2'))] if p),
                            'il': il_ad(m_.get(pre + 'state'))[:60], 'ilce': temiz(m_.get(pre + 'city'), 60), 'postaKodu': temiz(m_.get(pre + 'postcode'), 10)}]
    uyeler.append(uye)

# ---------- bülten: yalnız açıkça onaylamış aboneler ----------
bulten = [{'tarih': iso(x.get('created_at')) or simdi.isoformat().replace('+00:00', 'Z'), 'eposta': temiz(x['email'], 200).lower(), 'kaynak': 'wordpress-mailpoet'}
          for x in T('mailpoet_subscribers') if x.get('status') == 'subscribed' and x.get('email')]

ozet = {
    'siparis': len(siparisler), 'atlanan': dict(atlanan),
    'durumlar': dict(collections.Counter(s['durum'] for s in siparisler)),
    'tarihAraligi': [siparisler[-1]['tarih'], siparisler[0]['tarih']] if siparisler else None,
    'ciro': yuvarla(sum(s['toplam'] for s in siparisler if s['durum'] not in ('iptal', 'iade', 'odeme-bekliyor', 'odeme-basarisiz'))),
    'kodsuzKalem': sorted(set(k['ad'] for s in siparisler for k in s['kalemler'] if not k['kod'])),
    'uye': len(uyeler), 'bulten': len(bulten), 'kurumsalFatura': sum(1 for s in siparisler if s['faturaBilgi']),
    'kargoNolu': sum(1 for s in siparisler if s['kargoNo']), 'anonim': sum(1 for s in siparisler if s.get('anonim')),
    'tutarFarki': [s['no'] for s in siparisler if abs(s['araToplam'] - s['indirim'] + s['kargo'] - s['toplam']) > 1][:20]
}
json.dump({'siparisler': siparisler, 'uyeler': uyeler, 'bulten': bulten, 'ozet': ozet}, open(CIKTI, 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps(ozet, ensure_ascii=False, indent=1))
