/* ============================================================
   OLIVAMORE — ortak bileşenler (logo, header, footer, etkileşim)
   Marka: Logo-main.pdf · Pantone 4007 C (#BFA25D)
   İki dilli: TR (varsayılan) + EN (body[data-lang="en"], *-en.html)
   ============================================================ */
(function () {
  const GOLD = '#BFA25D';
  const EN = document.body.dataset.lang === 'en';

  /* ---------- Dil yardımcıları ---------- */
  // TR dosya adını aktif dile çevirir: koleksiyon.html -> koleksiyon-en.html (EN'de)
  function P(f) {
    if (!EN) return f;
    const i = f.indexOf('#');
    const base = i === -1 ? f : f.slice(0, i);
    const hash = i === -1 ? '' : f.slice(i);
    return base.replace(/\.html$/, '-en.html') + hash;
  }
  // Karşı dilin sayfası (uzantılı ve uzantısız URL'lerde aynı çalışır).
  let current = (location.pathname.split('/').pop() || 'index.html');
  if (current === 'en') current = 'index-en.html'; // temiz EN ana sayfa: /en
  const currentStem = current.replace(/\.html$/, '') || 'index';
  const pairedPages = new Set([
    'index','damak-testi','hediye-olustur','hesap','hikayemiz','iletisim','kalite','koleksiyon',
    'kulup','ogren','p','pasaport','sepet','sss','tarif-asistani','ureticiler','urun','urun-trilye',
    'naturel-sizma-zeytinyagi-nedir','zeytinyagi-polifenol-acilik-yakicilik','erken-hasat-olgun-hasat',
    'zeytinyagi-saklama-raf-omru','zeytinyagi-efsaneleri','akdeniz-diyeti-zeytinyagi',
    'sabah-bir-kasik-zeytinyagi','zeytinyagi-geleneksel-kullanimlari','alic-sirkesi-nedir','dogal-fermente-sirke'
  ]);
  const baseStem = currentStem.replace(/-en$/, '');
  // GitHub sunucusundaki uzantısız kanonik adresler.
  const cleanTR = baseStem === 'index' ? '/' : '/' + baseStem;
  const cleanEN = baseStem === 'index' ? '/en' : '/' + baseStem + '-en';
  const other = pairedPages.has(baseStem) ? (EN ? cleanTR : cleanEN) : '';

  // Arama motorlarına dil eşlerini ve tercih edilen URL'yi açıkça bildir.
  if (pairedPages.has(baseStem)) {
    const origin = location.origin;
    if (!document.querySelector('link[rel="canonical"]')) {
      const canonical = document.createElement('link');
      canonical.rel = 'canonical';
      canonical.href = origin + (EN ? cleanEN : cleanTR) + location.search;
      document.head.appendChild(canonical);
    }
    [['tr', cleanTR], ['en', cleanEN]].forEach(function (pair) {
      if (document.querySelector('link[rel="alternate"][hreflang="' + pair[0] + '"]')) return;
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = pair[0];
      link.href = origin + pair[1];
      document.head.appendChild(link);
    });
  }

  /* ---------- Metinler ---------- */
  const T = EN ? {
    announce: '2025 harvest · Ayvalık and Trilye · Check published batch records in the Harvest Passport',
    shop: 'Shop', club: 'Club', producers: 'Producers', learn: 'Learn', quality: 'Quality', story: 'Our Story',
    megaCat: 'Category', megaAll: 'All Products', megaBest: 'Bestsellers', megaEvoo: 'Finishing Oils', megaEarly: 'Cooking Oils',
    megaPurpose: 'Purpose', megaGift: 'Gift Sets', megaBuild: 'Build Your Own Set', megaJoin: 'Join the Club', megaAcc: 'Accessories',
    megaNew: 'The new harvest is here', megaCta: 'Discover', megaRecipe: 'Recipe Assistant', megaQuiz: 'Palate Quiz',
    search: 'Search', cart: 'Bag', menu: 'Menu',
    faq: 'FAQ', contact: 'Contact',
    tagline: 'Traceable extra virgin olive oil shaped by Olivamore’s Ayvalık grove and carefully selected harvests.',
    fShop: 'Shop', fBrand: 'Brand', fHelp: 'Help',
    fAll: 'All Products', fEvoo: 'Finishing Oils', fGift: 'Gift Sets',
    fStory: 'Our Story', fProducers: 'Producers', fTrace: 'Traceability', fPassport: 'Harvest Passport', fQuality: 'Quality & Lab Reports', fAwards: 'Awards',
    fFaq: 'FAQ', fShipping: 'Shipping & Returns', fContact: 'Contact', fTrack: 'Order Tracking',
    rights: '© 2026 Olivamore. All rights reserved.',
    privacy: 'Privacy', terms: 'Terms of Use', kvkk: 'KVKK',
    toast: 'Added to bag ✓',
    cookieText: 'We use only the cookies necessary for this site to work. When analytics cookies are added later, we will ask for your consent first.',
    cookieOk: 'OK', cookieMore: 'Privacy'
  } : {
    announce: '2025 hasadı · Ayvalık ve Trilye · Yayımlanan parti kayıtlarını Hasat Pasaportunda kontrol et',
    shop: 'Alışveriş', club: 'Club', producers: 'Üreticiler', learn: 'Öğren', quality: 'Kalite', story: 'Hikâyemiz',
    megaCat: 'Kategori', megaAll: 'Tüm Ürünler', megaBest: 'Çok Satanlar', megaEvoo: 'Bitirme Zeytinyağları', megaEarly: 'Pişirme Zeytinyağları',
    megaPurpose: 'Amaç', megaGift: 'Hediyelik Setler', megaBuild: 'Kendi Setini Oluştur', megaJoin: "Club'a Katıl", megaAcc: 'Aksesuarlar',
    megaNew: 'Yeni hasat geldi', megaCta: 'Keşfet', megaRecipe: 'Tarif Asistanı', megaQuiz: 'Damak Testi',
    search: 'Ara', cart: 'Sepet', menu: 'Menü',
    faq: 'SSS', contact: 'İletişim',
    tagline: "Ayvalık'taki bahçemizden ve özenle seçilen hasatlardan, izlenebilir naturel sızma zeytinyağı.",

    fShop: 'Alışveriş', fBrand: 'Marka', fHelp: 'Yardım',
    fAll: 'Tüm Ürünler', fEvoo: 'Serin Sofra', fGift: 'Hediyelik Setler',
    fStory: 'Hikâyemiz', fProducers: 'Üreticiler', fTrace: 'İzlenebilirlik', fPassport: 'Hasat Pasaportu', fQuality: 'Kalite ve Analizler', fAwards: 'Ödüller',
    fFaq: 'SSS', fShipping: 'Kargo & İade', fContact: 'İletişim', fTrack: 'Sipariş Takibi',
    rights: '© 2026 Olivamore. Tüm hakları saklıdır.',
    privacy: 'Gizlilik', terms: 'Kullanım Şartları', kvkk: 'KVKK',
    toast: 'Sepete eklendi ✓',
    cookieText: 'Bu sitede yalnızca sitenin çalışması için gerekli çerezler kullanılır. İleride analitik çerezler kullanmaya başlarsak önce onayını isteyeceğiz.',
    cookieOk: 'Tamam', cookieMore: 'Gizlilik'
  };

  /* ---------- Logo işareti — gerçek marka dosyasından (Logo-main.pdf) ---------- */
  function mark(size, color) {
    return `<img src="assets/logo-mark.svg" style="width:${size}px;height:auto;" alt="Olivamore">`;
  }
  function markSweep() {
    document.querySelectorAll('[data-mark]').forEach(el => {
      if (!el.querySelector('img')) el.innerHTML = mark(el.dataset.mark || 60, el.dataset.color || GOLD);
    });
  }

  /* ---------- Header ---------- */
  const header = `
  <div class="announce">${T.announce}</div>
  <header class="site">
    <div class="nav-wrap nav3">
      <nav class="main nav-left">
        <div class="has-mega">
          <a class="top" data-nav="shop" href="${P('koleksiyon.html')}">${T.shop}</a>
          <div class="mega mega-cats">
            <div class="mega-sol">
            <h5>${EN ? 'Shop by Category' : 'Kategoriye Göre Alışveriş'}</h5>
            <div class="cat-grid mega-grid">
              <a class="cat-card" href="${P('koleksiyon.html#serin')}"><span class="thumb"><img src="assets/img/kat-bitirme.png" alt=""></span>${EN ? 'Finishing Olive Oil' : 'Bitirme Zeytinyağı'}</a>
              <a class="cat-card" href="${P('koleksiyon.html#ocak')}"><span class="thumb"><img src="assets/img/kat-pisirme.png" alt=""></span>${EN ? 'Cooking Olive Oil' : 'Pişirme Zeytinyağı'}</a>
              <a class="cat-card" href="${P('koleksiyon.html#zeytin')}"><span class="thumb"><img src="assets/img/kat-zeytin.png" alt=""></span>${EN ? 'Natural Olives · Soon' : 'Doğal Zeytinler · Yakında'}</a>
              <a class="cat-card" href="${P('koleksiyon.html#eksi')}"><span class="thumb"><img src="assets/img/kat-sirke.png" alt=""></span>${EN ? 'Vinegars & Pomegranate · Soon' : 'Ekşiler · Yakında'}</a>
              <a class="cat-card" href="${P('koleksiyon.html#hediyelik')}"><span class="thumb"><img src="assets/img/kat-set.png" alt=""></span>${EN ? 'Sets' : 'Setler'}</a>
              <a class="cat-card" href="${P('koleksiyon.html')}"><span class="thumb"><img src="assets/img/kat-tum.png" alt=""></span>${EN ? 'All Products' : 'Tüm Ürünler'}</a>
            </div>
            <div class="mega-links">
              <a href="${P('damak-testi.html')}">${T.megaQuiz}</a>
              <a href="${P('tarif-asistani.html')}">${T.megaRecipe}</a>
              <a href="${P('hediye-olustur.html')}">${T.megaBuild}</a>
            </div>
            </div>
            <a class="mega-promo" href="${P('koleksiyon.html#hediyelik')}">
              <img src="assets/img/foto-hediye-setleri.jpg" alt="">
              <div class="mp-body">
                <p>${EN ? 'A box worth opening, an oil worth the table' : 'Açmaya değer bir kutu, sofrana yakışan bir yağ'}</p>
                <span class="btn btn-gold btn-sm">${EN ? 'Shop Now' : 'Alışverişe Başla'}</span>
              </div>
            </a>
          </div>
        </div>
        <div><a class="top" href="${P('damak-testi.html')}">${EN ? 'Find Your Oil' : 'Yağını Bul'}</a></div>
        <div><a class="top" data-nav="ureticiler" href="${P('ureticiler.html')}">${T.producers}</a></div>
      </nav>
      <a class="logo-link" href="${EN ? '/en' : '/'}" aria-label="Olivamore">
        <img src="assets/logo-word.svg" style="height:17px;width:auto;" alt="OLIVAMORE">
      </a>
      <div class="nav-right">
        <a class="top" data-nav="ogren" href="${P('ogren.html')}">${T.learn}</a>
        <a class="top" data-nav="kalite" href="${P('kalite.html')}">${T.quality}</a>
        <a class="top" data-nav="hikayemiz" href="${P('hikayemiz.html')}">${T.story}</a>
        ${other ? `<a class="top lang-switch" href="${other}" aria-label="${EN ? 'Türkçe' : 'English'}">${EN ? 'TR' : 'EN'}</a>` : ''}
        <a class="icon-btn" aria-label="${EN ? 'My Account' : 'Hesabım'}" href="${P('hesap.html')}">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.4-3.4 4-5 7-5s5.6 1.6 7 5"/></svg>
        </a>
        <a class="icon-btn" aria-label="${T.cart}" id="cart-btn" href="${P('sepet.html')}">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7h12l-1.5 12h-9L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
          <span class="cart-count" id="cart-count">0</span>
        </a>
        <button class="burger" aria-label="${T.menu}" id="burger">
          <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
        </button>
      </div>
    </div>
    <div class="mobile-nav" id="mobile-nav">
      <a href="${P('koleksiyon.html')}">${T.shop}</a>
      <a href="${P('damak-testi.html')}">${EN ? 'Find Your Oil' : 'Yağını Bul'}</a>
      <a href="${P('ureticiler.html')}">${T.producers}</a>
      <a href="${P('hikayemiz.html')}">${T.story}</a>
      <a href="${P('ogren.html')}">${T.learn}</a>
      <a href="${P('kalite.html')}">${T.quality}</a>
      <a href="${P('sss.html')}">${T.faq}</a>
      <a href="${P('iletisim.html')}">${T.contact}</a>
      ${other ? `<a href="${other}">${EN ? 'Türkçe' : 'English'}</a>` : ''}
    </div>
  </header>`;

  /* ---------- Footer ---------- */
  const footer = `
  <footer class="site">
    <div class="container">
      <div class="foot-grid">
        <div class="foot-brand">
          <img src="assets/logo-full-light.svg" style="width:190px;height:auto;" alt="Olivamore">
          <p>${T.tagline}</p>
        </div>
        <div>
          <h5>${T.fShop}</h5>
          <ul>
            <li><a href="${P('koleksiyon.html')}">${T.fAll}</a></li>
            <li><a href="${P('koleksiyon.html#serin')}">${T.fEvoo}</a></li>
            <li><a href="${P('koleksiyon.html#hediyelik')}">${T.fGift}</a></li>
            <li><a href="${P('damak-testi.html')}">${EN ? 'Palate Quiz' : 'Damak Pusulası'}</a></li>
          </ul>
        </div>
        <div>
          <h5>${T.fBrand}</h5>
          <ul>
            <li><a href="${P('hikayemiz.html')}">${T.fStory}</a></li>
            <li><a href="${P('ureticiler.html')}">${T.fProducers}</a></li>
            <li><a href="${P('ureticiler.html#izlenebilirlik')}">${T.fTrace}</a></li>
            <li><a href="${P('pasaport.html')}">${T.fPassport}</a></li>
            <li><a href="${P('kalite.html')}">${T.fQuality}</a></li>
            <li><a href="${P('ureticiler.html#oduller')}">${T.fAwards}</a></li>
          </ul>
        </div>
        <div>
          <h5>${T.fHelp}</h5>
          <ul>
            <li><a href="${P('sss.html')}">${T.fFaq}</a></li>
            <li><a href="${P('sss.html#kargo')}">${T.fShipping}</a></li>
            <li><a href="${P('iletisim.html')}">${T.fContact}</a></li>
            <li><a href="${P('iletisim.html')}">${T.fTrack}</a></li>
          </ul>
        </div>
      </div>
      <div class="foot-bottom">
        <span>${T.rights}</span>
        <span><a href="gizlilik.html">${T.kvkk}</a> · <a href="kullanim-sartlari.html">${T.terms}</a> · <a href="mesafeli-satis.html">${EN ? 'Distance Sales Agreement' : 'Mesafeli Satış Sözleşmesi'}</a> · <a href="cerez-politikasi.html">${EN ? 'Cookie Policy' : 'Çerez Politikası'}</a></span>
      </div>
    </div>
  </footer>
  <div class="toast" id="toast">${T.toast}</div>`;

  /* ============================================================
     CMS RENDER MOTORU (panel.html → localStorage 'om-admin')
     Sayfa metinleri, ürünler, bloglar, modüller ve ayarlar
     bu config'den okunur; config yoksa statik HTML aynen kalır.
     ============================================================ */
  function adminConfig() {
    try { return JSON.parse(localStorage.getItem('om-admin') || '{}'); }
    catch (e) { return {}; }
  }
  function fmtTL(n) { return Number(n).toLocaleString('tr-TR'); }
  // olivamore.com canlı mağaza fiyatları, 21 Ağustos 2026.
  const LIVE_PRICE_REV = 'olivamore.com@2026-08-21';
  const LIVE_PRICES = {
    ay250: 425, ay500: 850, ay750: 1250, ay2l: 2500, ay5l: 5250,
    tr250: 450, tr500: 880, tr750: 1350, tr2l: 2900, tr5l: 5750,
    og5l: 3450, kutu750: 1250, kutu500: 850, 'custom-set': 1600,
    'ces-mand': 650, 'ces-bib': 650, 'ces-berg': 650, 'ces-kek': 650,
    'zey-siyah': 360, 'zey-yesil': 325
  };
  function syncLivePrices(config) {
    const C = config || {};
    if (C.priceSource === LIVE_PRICE_REV) return C;
    if (Array.isArray(C.products)) {
      C.products.forEach(p => {
        if (LIVE_PRICES[p.id] !== undefined) p.price = LIVE_PRICES[p.id];
      });
    }
    C.gift3 = 1600;
    C.gift5 = 1500;
    C.pdp = Object.assign({}, C.pdp, { ay750: 1250 });
    C.priceSource = LIVE_PRICE_REV;
    return C;
  }
  const BRAND_COPY_REV = 'nature-balance@2026-08-21';
  function syncBrandCopy(config) {
    const C = config || {};
    if (C.brandCopySource === BRAND_COPY_REV) return C;
    C.heroTitleTR = 'Doğanın Dengesi';
    C.heroTitleEN = "Nature's Balance";
    C.pages = C.pages || {};
    C.pages.hikayemiz = Object.assign({}, C.pages.hikayemiz, {
      tTR: 'Doğanın Dengesi',
      tEN: "Nature's Balance",
      lTR: 'Aynı bahçede yetişen farklı zeytin çeşitlerinin birbirini tamamlayan karakterinden doğan bir yaklaşım.',
      lEN: 'An approach born from the complementary characters of different olive varieties growing in the same grove.'
    });
    C.brandCopySource = BRAND_COPY_REV;
    return C;
  }
  const TRUST_BASELINE_REV = 'prelaunch-truth@2026-08-22';
  function syncTrustBaseline(config) {
    const C = config || {};
    C.announceTR = '2025 hasadı · Ayvalık ve Trilye · Yayımlanan parti kayıtlarını Hasat Pasaportunda kontrol et';
    C.announceEN = '2025 harvest · Ayvalık and Trilye · Check published batch records in the Harvest Passport';
    C.heroLeadTR = "Ayvalık bahçemizden; tadı, hasadı ve hangi yemeğe yakıştığı belli zeytinyağları.";
    C.heroLeadEN = 'From our Ayvalık grove: olive oils with a clear taste, harvest and place at the table.';
    C.modules = Object.assign({}, C.modules, { club:false, reviews:false });
    C.pages = C.pages || {};
    C.pages.ureticiler = {
      tTR:'Şişenin arkasındaki üretim yaklaşımı', tEN:'The production approach behind the bottle',
      lTR:"Olivamore'un üretim yaklaşımı Ayvalık'ta 2017'de edinilen bahçeyle başladı. Yalnızca doğrulayabildiğimiz köken, üretim ve analiz bilgisini yayınlıyoruz.",
      lEN:"Olivamore's production journey began with a grove acquired in Ayvalık in 2017. We publish only origin, production and analysis details we can verify."
    };
    C.pages.kulup = {
      tTR:'Olivamore Club hazırlanıyor', tEN:'Olivamore Club is being prepared',
      lTR:'Club şu anda aktif bir abonelik ürünü değil. Koşullar kesinleştiğinde bekleme listesindekilere haber vereceğiz.',
      lEN:'Club is not an active subscription product. We will notify the waitlist when the terms are final.'
    };
    if (Array.isArray(C.products)) C.products.forEach(p => { if (p.type === 'club' || p.id === 'club') p.visible = false; });
    C.trustBaselineSource = TRUST_BASELINE_REV;
    return C;
  }
  const PAIRING_COPY_REV = 'role-timing-articles@2026-08-24';
  const PAIRING_NOTES = {
    og5l: {
      tr: 'Nohut, türlü, taze fasulye ve fırın sebzede baştan eklenen günlük pişirme yağı.',
      en: 'An everyday cooking oil added from the start for chickpea stew, braised vegetables and the oven.'
    },
    'ces-mand': {
      tr: 'Pancar–peynir salatası, narenciyeli kek ve deniz ürününde serviste. Aroma verir; asitlik için limon veya sirke ayrıca.',
      en: 'Finish beet-and-cheese salad, citrus cake or seafood. It adds aroma, not acidity; add lemon or vinegar separately.'
    },
    'ces-bib': {
      tr: 'Mercimek çorbası, humus ve pizzada serviste; ayrıca kızdırmadan, birkaç damladan başlayarak.',
      en: 'Finish lentil soup, hummus or pizza. Do not heat separately; begin with a few drops.'
    },
    'ces-berg': {
      tr: 'Beyaz balık ve enginarda çok düşük dozlu bitirme yağı; servisten hemen önce, damla damla.',
      en: 'A very-low-dose finishing oil for white fish and artichokes; add drop by drop just before serving.'
    },
    'ces-kek': {
      tr: 'Fırın patates, sıcak ekmek ve ızgara tavukta piştikten sonra eklenen otsu bitirme yağı.',
      en: 'A herbal finishing oil for roast potatoes, warm bread and grilled chicken, added after cooking.'
    },
    'sir-bal': {
      tr: 'Domates–mozzarella, pancar–peynir ve ızgara ette düşük dozlu tatlı-ekşi bitiriş.',
      en: 'A low-dose sweet-sour finish for tomato and mozzarella, beet and cheese, or grilled beef.'
    },
    'sir-alic': {
      tr: 'Mercimek ve patates salatasında sos asidi; doğal asitlik değişebileceği için düşük dozdan başla.',
      en: 'A dressing acid for lentil or potato salad; begin low because natural acidity can vary by batch.'
    },
    'sir-elma': {
      tr: 'Ispanak–elma salatasında, lahana salatasında ve hızlı turşuda günlük meyvemsi ekşilik.',
      en: 'Everyday fruity acidity for spinach and apple salad, slaw and quick pickles.'
    },
    'sir-uzum': {
      tr: 'Antalya piyazı, çoban salata ve köz patlıcan salatasında geleneksel sos asidi.',
      en: 'Traditional dressing acidity for Antalya-style bean salad, shepherd salad and charred eggplant.'
    },
    'sir-nar': {
      tr: 'Gavurdağı salatası, kısır ve muhammarada yoğun meyve ekşiliği. Sirke değildir.',
      en: 'Dense fruit tartness for Gavurdağı salad, kısır and muhammara. It is not vinegar.'
    }
  };
  const ARTICLE_BLOGS = {
    b1: {
      titleTR: 'Natürel sızma zeytinyağı nedir? Diğerlerinden farkı ne?', titleEN: 'What is extra virgin olive oil? How is it different?',
      noteTR: 'Natürel sızma, natürel birinci, rafine ve Riviera kategorilerini üretim ve duyusal ölçütlerle ayır.',
      noteEN: 'Separate extra virgin, virgin, refined and blended olive oil by production and sensory criteria.',
      img: 'assets/img/blog-naturel-nedir.jpg', href: 'naturel-sizma-zeytinyagi-nedir.html'
    },
    b2: {
      titleTR: 'Zeytinyağında polifenol, acılık ve yakıcılık', titleEN: 'Polyphenols, bitterness and pungency in olive oil',
      noteTR: 'Acılık ve yakıcılık olumlu özellikler olabilir; kesin polifenol miktarı aynı parti analiziyle belirlenir.',
      noteEN: 'Bitterness and pungency can be positive; exact phenolic content requires analysis of the same batch.',
      img: 'assets/img/blog-polifenol.jpg', href: 'zeytinyagi-polifenol-acilik-yakicilik.html'
    },
    b3: {
      titleTR: 'Erken hasat ve olgun hasat arasındaki fark', titleEN: 'Early-harvest and ripe-harvest olive oil',
      noteTR: 'Hasat zamanı verim ve duyusal profili etkiler; tek başına kalite garantisi değildir.',
      noteEN: 'Harvest timing affects yield and sensory profile; it is not a quality guarantee by itself.',
      img: 'assets/img/blog-hasat.jpg', href: 'erken-hasat-olgun-hasat.html'
    },
    b4: {
      titleTR: 'Zeytinyağı bozulur mu? Raf ömrü ve saklama', titleEN: 'Does olive oil go bad? Shelf life and storage',
      noteTR: 'Işık, ısı ve oksijeni sınırla; hacmi kullanım hızına göre seç ve kapağı hemen kapat.',
      noteEN: 'Limit light, heat and oxygen; choose a size you can use and close it promptly.',
      img: 'assets/img/blog-raf-omru.jpg', href: 'zeytinyagi-saklama-raf-omru.html'
    },
    b5: {
      titleTR: 'Zeytinyağı tüketiminde sık yapılan hatalar ve doğruları', titleEN: 'Common olive-oil mistakes and the facts',
      noteTR: 'Pişirme, renk, asitlik, yakıcılık ve buzdolabı testi hakkındaki yedi efsaneyi ayır.',
      noteEN: 'Separate fact from seven myths about cooking, colour, acidity, pungency and the fridge test.',
      img: 'assets/img/blog-hatalar.jpg', href: 'zeytinyagi-efsaneleri.html'
    },
    b7: {
      titleTR: 'Akdeniz beslenmesinde zeytin ve zeytinyağının rolü', titleEN: 'The role of olives and olive oil in the Mediterranean diet',
      noteTR: 'Tek bir mucize gıda değil; sebze, bakliyat, tahıl, ölçü, mevsim ve paylaşım kültürü.',
      noteEN: 'Not one miracle food, but vegetables, pulses, grains, measured use, seasonality and sharing.',
      img: 'assets/img/blog-akdeniz.jpg', href: 'akdeniz-diyeti-zeytinyagi.html'
    },
    b8: {
      titleTR: 'Sabah bir kaşık zeytinyağı: Gelenek, kanıt ve ölçü', titleEN: 'A morning spoonful of olive oil: tradition, evidence and measure',
      noteTR: 'Araştırmalar özel bir aç-karnına zamanlamadan çok toplam beslenme düzenini inceler.',
      noteEN: 'Research focuses on the overall dietary pattern rather than a special empty-stomach timing.',
      img: 'assets/img/blog-detoks.jpg', href: 'sabah-bir-kasik-zeytinyagi.html'
    },
    b9: {
      titleTR: 'Mutfaktan sabuna: Zeytinyağının yaşayan kültürü', titleEN: 'From kitchen to soap: Olive oil as living culture',
      noteTR: 'Hasat ve sabun mirasını anlatırken mutfak yağı, kozmetik ve güvenlik sınırlarını ayır.',
      noteEN: 'Explore harvest and soap heritage while keeping culinary oil, cosmetics and safety separate.',
      img: 'assets/img/blog-cilt.jpg', href: 'zeytinyagi-geleneksel-kullanimlari.html'
    },
    b10: {
      titleTR: 'Alıç sirkesi nedir?', titleEN: 'What is hawthorn vinegar?',
      noteTR: 'Türü ve parti profili değişebilir; tadını, fermantasyonunu ve kontrollü mutfak dozlarını öğren.',
      noteEN: 'Species and batch profile can vary; learn its flavour, fermentation and controlled kitchen doses.',
      img: 'assets/img/blog-alic-sirkesi.jpg', href: 'alic-sirkesi-nedir.html'
    },
    b11: {
      titleTR: 'Doğal fermente, filtrelenmiş ve pastörize sirke: Fark nedir?', titleEN: 'Naturally fermented, filtered and pasteurised vinegar: What is the difference?',
      noteTR: 'Fermantasyon, filtrasyon, pastörizasyon, sirke anası ve tortu aynı şeyi anlatmaz.',
      noteEN: 'Fermentation, filtration, pasteurisation, vinegar mother and sediment describe different things.',
      img: 'assets/img/blog-fermantasyon.jpg', href: 'dogal-fermente-sirke.html'
    }
  };
  const RECIPE_BLOGS = {
    b12: {
      tagTR: 'Tarif · Pişir + Bitir', tagEN: 'Recipe · Cook + finish',
      titleTR: 'Fırında Sebzeli Levrek', titleEN: 'Oven-baked Sea Bass',
      noteTR: 'Olgun Hasat ile pişir; Trilye\'yi biberimsi aroması için fırından sonra ekle.',
      noteEN: 'Cook with Ripe Harvest; add Trilye after the oven for a peppery finish.',
      img: 'assets/img/tarif-firin-levrek.jpg', href: 'tarif-firin-levrek.html'
    },
    b13: {
      tagTR: 'Tarif · Bitir', tagEN: 'Recipe · Finish',
      titleTR: 'Vişneli Lorlu Salata', titleEN: 'Sour Cherry Salad with Fresh Curd',
      noteTR: 'Tatlı-ekşi vişne ve lorun üzerine Ayvalık\'ı yalnızca serviste ekle.',
      noteEN: 'Add Ayvalık only at the table over sweet-tart cherries and fresh curd.',
      img: 'assets/img/tarif-visneli-salata.jpg', href: 'tarif-visneli-salata.html'
    },
    b14: {
      section: 'tarif', tagTR: 'Tarif · Pişir', tagEN: 'Recipe · Cook',
      titleTR: 'Zeytinyağlı Nohut Yemeği', titleEN: 'Olive-oil Chickpea Stew',
      noteTR: 'Olgun Hasat\'ı tencerenin başından itibaren kullanan pratik günlük yemek.',
      noteEN: 'A practical everyday pot that uses Ripe Harvest from the beginning.',
      img: 'assets/img/tarif-nohut-yemegi.jpg', href: 'tarif-nohut-yemegi.html'
    }
  };
  function syncPairingCopy(config) {
    const C = config || {};
    if (C.pairingCopySource === PAIRING_COPY_REV) return C;
    if (Array.isArray(C.products)) {
      C.products.forEach(p => {
        const copy = PAIRING_NOTES[p.id];
        if (!copy) return;
        p.noteTR = copy.tr;
        p.noteEN = copy.en;
      });
    }
    if (Array.isArray(C.blogs)) {
      C.blogs.forEach(b => {
        if (ARTICLE_BLOGS[b.id]) Object.assign(b, ARTICLE_BLOGS[b.id]);
        if (RECIPE_BLOGS[b.id]) Object.assign(b, RECIPE_BLOGS[b.id]);
      });
    }
    C.pairingCopySource = PAIRING_COPY_REV;
    return C;
  }
  let AC = syncPairingCopy(syncTrustBaseline(syncBrandCopy(syncLivePrices(adminConfig())))); // yerel yedek; sunucu config'i gelirse üzerine yazılır
  window.omLivePrices = LIVE_PRICES;
  let MODS = mkMods();
  function mkMods() {
    const mods = Object.assign(
      { announce: true, trust: true, club: false, reviews: false, newsletter: true, hediyelik: true, blogPreview: true, hediye: true, tarif: true },
      AC.modules || {}
    );
    mods.club = false;
    mods.reviews = false;
    return mods;
  }

  function applyAdminOverrides() {
    const C = AC;
    if (!C || Object.keys(C).length === 0) { applyModules(); return; }

    // ---- 1) Duyuru şeridi ----
    const ann = EN ? C.announceEN : C.announceTR;
    if (ann) {
      const el = document.querySelector('.announce');
      if (el) el.innerHTML = ann;
    }

    // ---- 2) Ana sayfa hero ----
    if (document.body.dataset.page === 'home') {
      const t = EN ? C.heroTitleEN : C.heroTitleTR;
      const l = EN ? C.heroLeadEN : C.heroLeadTR;
      const h1 = document.querySelector('.hero-light h1');
      const lead = document.querySelector('.hero-light .lead');
      if (t && h1) h1.textContent = t;
      if (l && lead) lead.textContent = l;
    }

    // ---- 3) Sayfa başlıkları/metinleri (page-hero veya koyu hero) ----
    if (C.pages) {
      const key = current.replace(/-en\.html$/, '').replace(/\.html$/, '');
      const pg = C.pages[key];
      if (pg) {
        const h1 = document.querySelector('.page-hero h1') || document.querySelector('.hero h1');
        const lead = document.querySelector('.page-hero .lead') || document.querySelector('.hero .lead');
        const t = EN ? pg.tEN : pg.tTR;
        const l = EN ? pg.lEN : pg.lTR;
        if (t && h1) h1.textContent = t;
        if (l && lead) lead.textContent = l;
      }
    }

    // ---- 4) Ürün gridleri (koleksiyon + ana sayfa vitrini) ----
    if (C.products && C.products.length) {
      renderProductGrids(C);
    }

    // ---- 5) Blog gridleri (Öğren + ana sayfa önizleme) ----
    if (C.blogs && C.blogs.length) {
      renderBlogGrids(C);
    }

    // ---- 6) PDP boyut seçici fiyatları ----
    const priceOf = id => {
      if (C.products) { const p = C.products.find(x => x.id === id); if (p) return p.price; }
      return (C.prices || {})[id];
    };
    const pdp750 = (C.pdp && C.pdp.ay750) || (C.prices || {}).ay750;
    let sizeMap = null;
    if (current.indexOf('urun-trilye') === 0) sizeMap = { tr250: priceOf('tr250'), tr500: priceOf('tr500'), tr750: priceOf('tr750'), tr2l: priceOf('tr2l'), tr5l: priceOf('tr5l') };
    else if (current.indexOf('urun') === 0) sizeMap = { ay250: priceOf('ay250'), ay500: priceOf('ay500'), ay750: pdp750, ay2l: priceOf('ay2l'), ay5l: priceOf('ay5l') };
    if (sizeMap && document.getElementById('fiyat-tek')) {
      document.querySelectorAll('.sizes .size[data-price]').forEach(b => {
        const val = sizeMap[b.dataset.pid];
        if (val) {
          b.dataset.price = fmtTL(val);
          b.dataset.sub = fmtTL(Math.floor(val * 0.85));
        }
        if (b.classList.contains('on')) {
          document.getElementById('fiyat-tek').textContent = '₺' + b.dataset.price;
          const ab = document.getElementById('fiyat-abone');
          if (ab) ab.textContent = '₺' + b.dataset.sub;
          const btn = document.getElementById('sepet-btn');
          if (btn) btn.textContent = (EN ? 'Add to Bag · ₺' : 'Sepete Ekle · ₺') + b.dataset.price;
        }
      });
    }

    // ---- 7) Hediye kutusu oluşturucu fiyatları ----
    document.querySelectorAll('.gb-box .size[data-cap]').forEach(b => {
      const val = b.dataset.cap === '3' ? C.gift3 : C.gift5;
      if (!val) return;
      b.dataset.price = fmtTL(val);
      const small = b.querySelector('small');
      if (small) small.textContent = b.dataset.cap + ' × 100 ml · ₺' + fmtTL(val);
    });
    const gbPrice = document.getElementById('gb-price');
    if (gbPrice) {
      const sel = document.querySelector('.gb-box .size.on');
      if (sel) gbPrice.textContent = '₺' + sel.dataset.price;
    }

    applyModules();
  }

  /* ---- Ürün kartı HTML üret ---- */
  const ROLE_LABELS = {
    serin: { tr: 'Bitirme Zeytinyağı', en: 'Finishing' },
    ocak: { tr: 'Pişirme Zeytinyağı', en: 'Cooking' },
    zeytin: { tr: 'Doğal Zeytinler', en: 'Natural Olives' },
    eksi: { tr: 'Ekşiler', en: 'Vinegars & Pomegranate' },
    hediye: { tr: 'Setler', en: 'Sets' }
  };
  // Zengin (elle yazılmış) sayfası olan ürünler; kalan her ürün dinamik p.html'e gider
  const OZEL_SAYFA = {
    ay250: 'urun.html', ay500: 'urun.html', ay750: 'urun.html', ay2l: 'urun.html', ay5l: 'urun.html',
    tr250: 'urun-trilye.html', tr500: 'urun-trilye.html', tr750: 'urun-trilye.html', tr2l: 'urun-trilye.html', tr5l: 'urun-trilye.html'
  };
  function urunHref(p) {
    if (p.type === 'builder' || p.type === 'club') return P(p.href || 'koleksiyon.html');
    if (OZEL_SAYFA[p.id]) return P(OZEL_SAYFA[p.id]) + '?variant=' + encodeURIComponent(p.id || '');
    return (EN ? 'p-en.html' : 'p.html') + '?id=' + encodeURIComponent(p.id || '');
  }
  const STATIC_PRODUCT_META = {
    ay250: { volume: '250 ml', price: 425, img: 'assets/img/ayvalik-250.jpg' },
    ay500: { volume: '500 ml', price: 850, img: 'assets/img/ayvalik-500.jpg' },
    ay750: { volume: '750 ml', price: 1250, img: 'assets/img/ayvalik-750.jpg' },
    ay2l: { volume: '2 L Teneke', price: 2500, img: 'assets/img/ayvalik-2l.jpg' },
    ay5l: { volume: '5 L Teneke', price: 5250, img: 'assets/img/ayvalik-5l.jpg' },
    tr250: { volume: '250 ml', price: 450, img: 'assets/img/trilye-250.jpg' },
    tr500: { volume: '500 ml', price: 880, img: 'assets/img/trilye-500.jpg' },
    tr750: { volume: '750 ml', price: 1350, img: 'assets/img/trilye-750.jpg' },
    tr2l: { volume: '2 L Teneke', price: 2900, img: 'assets/img/trilye-2l.jpg' },
    tr5l: { volume: '5 L Teneke', price: 5750, img: 'assets/img/trilye-5l.jpg' },
    og5l: { volume: '5 L Teneke', price: 3450, img: 'assets/img/ayvalik-5l.jpg' },
    kutu750: { volume: '750 ml', price: 1250, img: 'assets/img/kutulu-750.jpg' },
    kutu500: { volume: '500 ml', price: 850, img: 'assets/img/kutulu-500.jpg' }
  };
  function normalizeVariantText(value) {
    return String(value || '').toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/\s+/g, ' ').trim();
  }
  function detectVariantId(value) {
    const text = normalizeVariantText(value);
    if (/hediye kutulu.*750|gift box.*750/.test(text)) return 'kutu750';
    if (/hediye kutulu.*500|gift box.*500/.test(text)) return 'kutu500';
    if (/olgun hasat|ripe harvest/.test(text)) return 'og5l';
    if (/trilye/.test(text)) {
      if (/\b2\s*(?:l|lt|litre)/.test(text)) return 'tr2l';
      if (/\b5\s*(?:l|lt|litre)/.test(text)) return 'tr5l';
      if (/250\s*ml/.test(text)) return 'tr250';
      if (/500\s*ml/.test(text)) return 'tr500';
      return 'tr750';
    }
    if (/ayvalik/.test(text)) {
      if (/\b2\s*(?:l|lt|litre)/.test(text)) return 'ay2l';
      if (/\b5\s*(?:l|lt|litre)/.test(text)) return 'ay5l';
      if (/250\s*ml/.test(text)) return 'ay250';
      if (/750\s*ml/.test(text)) return 'ay750';
      return 'ay500';
    }
    return '';
  }
  function cleanProductUnit(value) {
    return displayUnit(value).replace(/^\s*\/\s*/, '').trim();
  }
  function hydrateProductCards(root) {
    (root || document).querySelectorAll('.card').forEach(card => {
      const visibleText = [card.querySelector('h3') && card.querySelector('h3').textContent, card.querySelector('.price') && card.querySelector('.price').textContent].filter(Boolean).join(' ');
      const id = card.dataset.pid || detectVariantId(visibleText);
      const meta = STATIC_PRODUCT_META[id];
      if (!id || !meta) return;
      card.dataset.pid = id;
      card.dataset.code = id;
      card.dataset.volume = card.dataset.volume || meta.volume;
      card.dataset.price = card.dataset.price || String(meta.price);
      card.dataset.img = card.dataset.img || ((card.querySelector('.prod-img > img:not(.alt-img)') || {}).getAttribute && card.querySelector('.prod-img > img:not(.alt-img)').getAttribute('src')) || meta.img;
      card.setAttribute('href', urunHref({ id: id, type: 'product' }));
    });
  }
  function displayUnit(value) {
    return String(value || '')
      .replace(/(\d)\s*ml\b/gi, '$1 ml')
      .replace(/(\d)\s*(?:lt|l)\b/gi, '$1 L')
      .replace(/100 ml\s*[x×]\s*(\d)/gi, '100 ml × $1');
  }
  function productCard(p, C) {
    const name = EN ? p.nameEN : p.nameTR;
    const note = EN ? p.noteEN : p.noteTR;
    const unit = displayUnit(EN ? p.unitEN : p.unitTR);
    const badge = EN ? p.badgeEN : p.badgeTR;
    const href = urunHref(p);
    const badgeHtml = badge ? `<span class="badge">${badge}</span>` : '';
    const roleDef = ROLE_LABELS[p.role];
    const roleHtml = roleDef ? `<span class="role-tag">${EN ? roleDef.en : roleDef.tr}</span>` : '';
    let media, priceHtml;
    if (p.type === 'club') {
      media = `<div class="prod-img art-olive">${badgeHtml}<div style="height:100%;display:flex;align-items:center;justify-content:center;padding-bottom:60px;" data-mark="110"></div><span class="add-bag">${EN ? 'Join the Club' : "Club'a Katıl"} <span>→</span></span></div>`;
      priceHtml = `₺${fmtTL(p.price)} <small>${unit || ''}</small>`;
    } else if (p.type === 'builder') {
      const gp = C.gift3 || p.price;
      media = `<div class="prod-img photo">${badgeHtml}<img src="${p.img}" alt="${name}"><span class="add-bag">${EN ? 'Build Your Set' : 'Setini Oluştur'} <span>→</span></span></div>`;
      priceHtml = EN ? `from ₺${fmtTL(gp)}` : `₺${fmtTL(gp)}<small>'dan</small>`;
    } else {
      const altImg = (p.galeri && p.galeri[0]) ? `<img class="alt-img" src="${p.galeri[0]}" alt="">` : '';
      const tukendi = typeof p.stok === 'number' && p.stok <= 0;
      const addBtn = (p.price && !tukendi) ? `<button class="add-bag" data-add>${EN ? 'Add to Bag' : 'Sepete Ekle'} <span>→</span></button>` : '';
      const stokBadge = tukendi ? `<span class="badge" style="background:#6b7280;color:#fff;">${EN ? 'Sold Out' : 'Tükendi'}</span>` : badgeHtml;
      media = `<div class="prod-img photo"${tukendi ? ' style="opacity:.65;"' : ''}>${stokBadge}<img src="${p.img}" alt="${name}">${altImg}${addBtn}</div>`;
      let unitProof = EN ? 'VAT included' : 'KDV dahil';
      const volume = String(unit || '').toLowerCase();
      const amount = volume.includes('ml') ? Number(volume.replace(/[^0-9]/g, '')) / 1000 : (/\b(?:l|lt|litre)\b/.test(volume) ? Number(volume.replace(/[^0-9]/g, '')) : 0);
      if (p.price && amount) unitProof = `₺${fmtTL(Math.round(p.price / amount))} / ${EN ? 'litre' : 'litre'} · ${unitProof}`;
      priceHtml = p.price ? `₺${fmtTL(p.price)} <small>${unit || ''}</small><em class="portion">${unitProof}</em>` : `<span style="color:var(--gold-text);font-size:.85rem;font-weight:600;">${EN ? 'Coming soon' : 'Fiyat yakında'}</span>`;
    }
    return `<article class="card" data-role="${p.role || 'all'}" data-pid="${p.id || ''}" data-code="${p.id || ''}" data-volume="${cleanProductUnit(unit)}" data-price="${Number(p.price) || 0}" data-img="${p.img || ''}"><a class="card-hit" href="${href}" aria-label="${name}" data-pid="${p.id || ''}"></a>${media}<div class="card-body">${roleHtml}<div class="card-row"><h3>${name}</h3><span class="price">${priceHtml}</span></div>${note ? `<p class="card-note">${note}</p>` : ''}</div></article>`;
  }

  function renderProductGrids(C) {
    const vis = C.products.filter(p => p.visible !== false);
    // Koleksiyon: tüm ürünler
    if (current.indexOf('koleksiyon') === 0) {
      const grid = document.querySelector('.prod-grid.three');
      if (grid) grid.innerHTML = vis.map(p => productCard(p, C)).join('');
    }
    // Ana sayfa: vitrin (featured sırasına göre ilk 4)
    if (document.body.dataset.page === 'home') {
      const grid = document.querySelector('.prod-grid:not(.three)');
      if (grid) {
        const feat = vis.filter(p => p.featured > 0).sort((a, b) => a.featured - b.featured).slice(0, 4);
        if (feat.length) grid.innerHTML = feat.map(p => productCard(p, C)).join('');
      }
    }
  }

  /* ---- Blog kartı HTML üret ---- */
  function blogCard(b) {
    const title = EN ? b.titleEN : b.titleTR;
    const note = EN ? b.noteEN : b.noteTR;
    const tag = EN ? b.tagEN : b.tagTR;
    const href = b.href ? P(b.href) : '#';
    return `<a class="blog-card" href="${href}"><div class="blog-thumb"><img src="${b.img}" alt="${title}"></div><div class="card-body"><span class="blog-tag">${tag}</span><h3>${title}</h3><p class="card-note">${note}</p></div></a>`;
  }

  function renderBlogGrids(C) {
    const vis = C.blogs.filter(b => b.visible !== false);
    if (document.body.dataset.page === 'ogren' && current.indexOf('tarif-asistani') !== 0) {
      const grids = document.querySelectorAll('section .blog-grid');
      const order = ['rehber', 'yasam', 'sirke', 'tarif'];
      grids.forEach((g, i) => {
        const items = vis.filter(b => b.section === order[i]);
        if (items.length) g.innerHTML = items.map(blogCard).join('');
        else if (order[i]) { const sec = g.closest('section'); if (sec) sec.style.display = 'none'; }
      });
    }
    if (document.body.dataset.page === 'home') {
      const grid = document.querySelector('#sec-blog .blog-grid');
      if (grid) {
        const items = vis.filter(b => b.section === 'rehber').slice(0, 3);
        if (items.length) grid.innerHTML = items.map(blogCard).join('');
      }
    }
  }

  /* ---- Modül aç/kapa ---- */
  function applyModules() {
    if (!MODS.announce) { const a = document.querySelector('.announce'); if (a) a.remove(); }
    const hideIds = { trust: 'sec-trust', club: 'sec-club', reviews: 'sec-reviews', newsletter: 'sec-newsletter', hediyelik: 'sec-hediyelik', blogPreview: 'sec-blog', tarif: 'sec-tarif-promo' };
    Object.keys(hideIds).forEach(k => {
      if (!MODS[k]) { const el = document.getElementById(hideIds[k]); if (el) el.style.display = 'none'; }
    });
    // Modül kapalıysa ona giden tüm linkleri de gizle (mega menü, butonlar, kartlar)
    if (!MODS.hediye) document.querySelectorAll('a[href*="hediye-olustur"]').forEach(a => { (a.closest('li') || a).style.display = 'none'; });
    if (!MODS.tarif) document.querySelectorAll('a[href*="tarif-asistani"]').forEach(a => { (a.closest('li') || a).style.display = 'none'; });
  }

  /* ---------- Yerleştir + etkileşimler ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    const h = document.getElementById('om-header');
    const f = document.getElementById('om-footer');
    if (h) h.innerHTML = header;
    if (f) f.innerHTML = footer;
    // Statik yedek kartlar da CMS kartlarıyla aynı varyant kimliğini taşır.
    hydrateProductCards(document);

    // Sunucu CMS config'i (panel kayıtları tüm ziyaretçilere buradan ulaşır);
    // API yoksa (yerel önizleme) localStorage yedeğiyle devam edilir.
    fetch('/api/config', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (cfg && Object.keys(cfg).length) { AC = syncPairingCopy(syncTrustBaseline(syncBrandCopy(syncLivePrices(cfg)))); MODS = mkMods(); }
        applyAdminOverrides();
        markSweep();
        if (window.omBoySenkron) window.omBoySenkron();
        urunOdakla();
        omPopupKur();
      })
      .catch(() => { applyAdminOverrides(); markSweep(); if (window.omBoySenkron) window.omBoySenkron(); urunOdakla(); omPopupKur(); });

    // Derin bağlantı: koleksiyon.html#p=<urunId> → o ürünün kartına kaydır ve vurgula
    function urunOdakla() {
      const m = location.hash.match(/^#p=([\w-]+)$/);
      if (!m) return;
      setTimeout(() => {
        const kart = document.querySelector('.card[data-pid="' + m[1] + '"]');
        if (!kart) return;
        kart.scrollIntoView({ behavior: 'smooth', block: 'center' });
        kart.style.outline = '2px solid var(--gold)';
        kart.style.outlineOffset = '4px';
        kart.style.borderRadius = '16px';
        setTimeout(() => { kart.style.outline = ''; }, 3500);
      }, 300);
    }

    // aktif nav
    const page = document.body.dataset.page;
    if (page) {
      const link = document.querySelector(`[data-nav="${page}"]`);
      if (link) link.classList.add('active');
    }

    // logo placeholder'ları (data-mark) — grid yeniden kurulunca tekrar çağrılır
    markSweep();
    // burger
    const burger = document.getElementById('burger');
    if (burger) burger.addEventListener('click', () => {
      document.getElementById('mobile-nav').classList.toggle('open');
    });

    // ---- GERÇEK SEPET (localStorage 'om-cart') ----
    const toast = document.getElementById('toast');
    function showToast(msg, type) {
      toast.textContent = msg;
      toast.classList.toggle('is-error', type === 'error');
      toast.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => toast.classList.remove('show'), 2200);
    }
    function cartGet() {
      try {
        const parsed = JSON.parse(localStorage.getItem('om-cart') || '[]');
        return Array.isArray(parsed) ? parsed.map(k => {
          const id = k.id || detectVariantId([k.ad, k.hacim].filter(Boolean).join(' '));
          const meta = STATIC_PRODUCT_META[id] || {};
          return Object.assign({}, k, {
            id: id || k.id || '',
            kod: k.kod || id || '',
            hacim: k.hacim || meta.volume || '',
            img: k.img || meta.img || '',
            fiyat: Number(k.fiyat) || meta.price || 0
          });
        }) : [];
      } catch (e) { return []; }
    }
    function cartSave(c) {
      localStorage.setItem('om-cart', JSON.stringify(c));
      cartCount();
    }
    function cartCount() {
      const n = cartGet().reduce((t, k) => t + k.adet, 0);
      const el = document.getElementById('cart-count');
      if (el) el.textContent = n;
    }
    window.omCart = { get: cartGet, save: cartSave, refresh: cartCount }; // sepet.html kullanır
    cartCount();

    function fiyatCoz(metin) {
      // Metindeki İLK fiyatı al: "₺850 / 500ml" → 850, "₺1.950 / 2lt" → 1950
      var m = String(metin || '').match(/\d{1,3}(?:\.\d{3})+|\d+/);
      return m ? parseInt(m[0].replace(/\./g, ''), 10) : 0;
    }
    function birimTemizle(birim) {
      return String(birim || '').replace(/^\s*\/\s*/, '').trim();
    }
    function urunKaydi(id) {
      return ((AC && AC.products) || []).find(p => p.id === id) || null;
    }
    function urunTopla(addEl) {
      // Tıklanan butonun bağlamından ürün bilgisi çıkar
      // 1) PDP "Sepete Ekle · ₺X" butonu
      if (addEl.id === 'sepet-btn') {
        const h1 = document.querySelector('.buy h1');
        const boyut = document.querySelector('.sizes .size.on');
        const id = (boyut && boyut.dataset.pid) || addEl.dataset.pid || '';
        const kayit = urunKaydi(id);
        const hacim = (boyut && boyut.dataset.l) || addEl.dataset.volume || birimTemizle(kayit && (EN ? kayit.unitEN : kayit.unitTR));
        return {
          id: id,
          kod: id,
          ad: h1 ? h1.textContent.trim() : 'Ürün',
          hacim: hacim,
          fiyat: fiyatCoz((boyut && boyut.dataset.price) || addEl.textContent),
          img: (boyut && boyut.dataset.img) || addEl.dataset.img || (document.getElementById('gallery-img') || {}).src || ''
        };
      }
      // 2) Hediye kutusu oluşturucu
      if (addEl.id === 'gb-add') {
        const sec = document.querySelector('.gb-box .size.on');
        const params = new URLSearchParams(location.search);
        const isPalateBox = params.get('discount') === '15' && (params.get('palate') || '').split(',').filter(Boolean).length === 3;
        return {
          id: isPalateBox ? 'palate-box-3' : ('custom-set-' + (sec ? sec.dataset.cap : '')),
          kod: isPalateBox ? 'palate-box-3' : ('custom-set-' + (sec ? sec.dataset.cap : '')),
          ad: isPalateBox
            ? (EN ? 'My Palate Box (3 bottles · 15% advantage)' : 'Damak Kutum (3’lü · %15 avantajlı)')
            : (EN ? ('Custom Gift Set (' + (sec ? sec.dataset.cap : '?') + ' bottles)') : ('Kendi Hediye Setin (' + (sec ? sec.dataset.cap : '?') + "'li)")),
          hacim: sec ? ((sec.dataset.cap || '?') + (EN ? ' bottles' : "'li")) : '',
          fiyat: fiyatCoz((document.getElementById('gb-price') || {}).textContent),
          img: (document.getElementById('gb-img') || {}).src || 'assets/img/hediye-seti-5li.jpg'
        };
      }
      // 3) Ürün kartları
      const kart = addEl.closest('.card');
      if (kart) {
        const h3 = kart.querySelector('h3');
        const fiyat = kart.querySelector('.price');
        const img = kart.querySelector('img');
        const id = kart.dataset.pid || kart.dataset.code || detectVariantId([h3 && h3.textContent, fiyat && fiyat.textContent].filter(Boolean).join(' '));
        const kayit = urunKaydi(id);
        const meta = STATIC_PRODUCT_META[id] || {};
        return {
          id: id,
          kod: kart.dataset.code || id,
          ad: h3 ? h3.textContent.trim() : 'Ürün',
          hacim: kart.dataset.volume || birimTemizle(kayit && (EN ? kayit.unitEN : kayit.unitTR)) || meta.volume || '',
          fiyat: Number(kart.dataset.price) || fiyatCoz(fiyat ? fiyat.textContent : '') || meta.price || 0,
          img: kart.dataset.img || (img ? img.getAttribute('src') : '') || meta.img || ''
        };
      }
      return null;
    }

    // Ürün adından KDV oranını bul (panel ürün kayıtlarından; varsayılan gıda %1)
    function kdvBul(ad) {
      const liste = (AC && AC.products) || [];
      for (const p of liste) {
        if (p.nameTR && ad.indexOf(p.nameTR) === 0) return (typeof p.kdv === 'number' ? p.kdv : 1);
        if (p.nameEN && ad.indexOf(p.nameEN) === 0) return (typeof p.kdv === 'number' ? p.kdv : 1);
      }
      return 1;
    }

    document.body.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        e.preventDefault();
        const u = urunTopla(add);
        if (u && u.fiyat > 0) {
          const c = cartGet();
          const ayni = c.find(k => u.id ? k.id === u.id : (k.ad === u.ad && k.hacim === u.hacim && k.fiyat === u.fiyat));
          if (ayni) ayni.adet = Math.min(99, ayni.adet + 1);
          else c.push({ id: u.id || '', kod: u.kod || u.id || '', ad: u.ad, hacim: u.hacim || '', fiyat: u.fiyat, adet: 1, img: u.img, kdv: kdvBul(u.ad) });
          cartSave(c);
          showToast(T.toast);
        } else {
          showToast(EN ? 'This product is not available yet.' : 'Bu ürün henüz satışta değil.', 'error');
        }
      }
      // akordeon
      const head = e.target.closest('.acc-head');
      if (head) head.parentElement.classList.toggle('open');
      // grup seçimleri (chip / size / pt-option / thumb)
      const pick = e.target.closest('.chip,.size,.pt-option,.thumb');
      if (pick) {
        pick.parentElement.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
        pick.classList.add('on');
        if (pick.matches('.size')) {
          pick.parentElement.querySelectorAll('.size').forEach(x => x.setAttribute('aria-pressed', x === pick ? 'true' : 'false'));
        }
      }
    });

    // Sayaç: karşılaştırma tablosundaki sayılar görünüme girince 0'dan dolar
    const cmp = document.querySelector('.compare');
    if (cmp && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const io2 = new IntersectionObserver((ents) => {
        if (!ents.some(e => e.isIntersecting)) return;
        io2.disconnect();
        cmp.querySelectorAll('td').forEach(td => {
          const m = td.textContent.match(/(\d{2,4})/);
          if (!m || +m[1] < 10) return;
          const hedef = +m[1], orij = td.textContent, t0 = performance.now();
          const adim = (t) => {
            const p = Math.min(1, (t - t0) / 900);
            td.textContent = orij.replace(m[1], String(Math.round(hedef * (1 - Math.pow(1 - p, 3)))));
            if (p < 1) requestAnimationFrame(adim);
          };
          requestAnimationFrame(adim);
        });
      }, { threshold: 0.3 });
      io2.observe(cmp);
    }

    // Hero dönüşümlü kelime (bu akşam tabakta: ...)
    const rw = document.getElementById('rot-word');
    if (rw) {
      const ws = (rw.dataset.words || '').split('|').filter(Boolean);
      let ri = 0;
      if (ws.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setInterval(() => {
          rw.style.opacity = '0';
          setTimeout(() => { ri = (ri + 1) % ws.length; rw.textContent = ws[ri]; rw.style.opacity = '1'; }, 350);
        }, 2600);
      }
    }

    // Scroll-reveal: bölümler görünüme girerken yumuşak beliriş
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      const revs = document.querySelectorAll('section.block > .container, .cta-band');
      const io = new IntersectionObserver((ents) => {
        ents.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      revs.forEach(el => {
        // İlk ekrandaki içerik animasyon beklemeden görünür olmalı; özellikle mobil koleksiyonda
        // filtrelerin ve ilk ürünün boş sayfa izlenimi vermesini önler.
        if (el.getBoundingClientRect().top < window.innerHeight * 1.15) {
          el.classList.add('in');
          return;
        }
        el.classList.add('rv');
        io.observe(el);
      });
    }

    // PDP boy butonlarını CMS fiyatlarıyla eşitle (panelde fiyat girilince otomatik aktifleşir)
    const boySenkron = () => {
      if (!AC || !AC.products) return;
      document.querySelectorAll('.size[data-pid]').forEach(b => {
        const p = AC.products.find(x => x.id === b.dataset.pid);
        if (!p) return;
        if (p.price > 0) {
          b.disabled = false;
          b.removeAttribute('title');
          b.dataset.price = p.price.toLocaleString('tr-TR');
          b.dataset.sub = Math.round(p.price * 0.85).toLocaleString('tr-TR');
          if (b.dataset.l) b.textContent = b.dataset.l;
        } else {
          b.disabled = true;
        }
      });
      if (window.omVariantSync) window.omVariantSync();
    };
    window.omBoySenkron = boySenkron;

    // PDP'de seçili hacmin litre fiyatını ve KDV bilgisini eşzamanlı güncelle.
    const priceNote = document.getElementById('price-note');
    function updateUnitPrice(button) {
      if (!priceNote || !button) return;
      const rawPrice = Number(String(button.dataset.price || '').replace(/\./g, '').replace(',', '.'));
      const label = String(button.dataset.l || '').toLowerCase();
      const amount = label.includes('ml') ? Number(label.replace(/[^0-9]/g, '')) / 1000 : Number(label.replace(/[^0-9]/g, ''));
      if (!rawPrice || !amount) return;
      const perLitre = Math.round(rawPrice / amount).toLocaleString(EN ? 'en-US' : 'tr-TR');
      priceNote.textContent = EN
        ? `VAT included · ₺${perLitre} / litre · Delivery within Turkey only`
        : `KDV dahil · ₺${perLitre} / litre · Türkiye içi teslimat`;
    }
    const sizeButtons = Array.from(document.querySelectorAll('.sizes .size[data-pid]'));
    function syncPdpVariant(button, updateUrl) {
      if (!button) return;
      sizeButtons.forEach(b => {
        const active = b === button;
        b.classList.toggle('on', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const price = document.getElementById('fiyat-tek');
      const addButton = document.getElementById('sepet-btn');
      const gallery = document.getElementById('gallery-img');
      if (price && button.dataset.price) price.textContent = '₺' + button.dataset.price;
      if (addButton) {
        addButton.dataset.pid = button.dataset.pid || '';
        addButton.dataset.volume = button.dataset.l || '';
        addButton.dataset.img = button.dataset.img || '';
        if (button.dataset.price) addButton.textContent = (EN ? 'Add to Bag · ₺' : 'Sepete Ekle · ₺') + button.dataset.price;
      }
      if (gallery && button.dataset.img) {
        gallery.src = button.dataset.img;
        const heading = document.querySelector('.buy h1');
        gallery.alt = ((heading && heading.textContent.trim()) || 'Ürün') + (button.dataset.l ? ' ' + button.dataset.l : '');
      }
      document.querySelectorAll('.thumb[data-img]').forEach(t => t.classList.toggle('on', t.dataset.img === button.dataset.img));
      updateUnitPrice(button);
      if (updateUrl && button.dataset.pid) {
        const url = new URL(location.href);
        url.searchParams.set('variant', button.dataset.pid);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
      if (window.omStickyVariantSync) window.omStickyVariantSync();
    }
    window.omVariantSync = function () {
      if (!sizeButtons.length) {
        if (window.omStickyVariantSync) window.omStickyVariantSync();
        return;
      }
      const requested = new URLSearchParams(location.search).get('variant');
      const chosen = (requested && sizeButtons.find(b => b.dataset.pid === requested && !b.disabled)) || sizeButtons.find(b => b.classList.contains('on') && !b.disabled) || sizeButtons.find(b => !b.disabled);
      syncPdpVariant(chosen, false);
    };
    sizeButtons.forEach(b => b.addEventListener('click', () => syncPdpVariant(b, true)));
    window.omVariantSync();

    // PDP mobil sabit CTA çubuğu (strateji: ad + fiyat + Sepete Ekle hep görünür)
    const pdpBtn = document.getElementById('sepet-btn');
    const pdpAd = document.querySelector('.buy h1');
    const pdpFiyat = document.getElementById('fiyat-tek');
    if (pdpBtn && pdpAd && pdpFiyat) {
      const bar = document.createElement('div');
      bar.className = 'pdp-sticky';
      bar.innerHTML = `<div class="t"><b>${pdpAd.textContent.trim()}</b><span></span></div><button class="btn btn-gold" type="button">${EN ? 'Add to Bag' : 'Sepete Ekle'}</button>`;
      document.body.appendChild(bar);
      const setSticky = (visible) => {
        bar.classList.toggle('show', visible);
        document.body.classList.toggle('has-pdp-sticky', visible);
      };
      const fiyatKopya = bar.querySelector('span');
      const baslikKopya = bar.querySelector('b');
      const stickyButton = bar.querySelector('button');
      const esitle = () => {
        const selected = document.querySelector('.sizes .size.on');
        const hacim = (selected && selected.dataset.l) || pdpBtn.dataset.volume || '';
        baslikKopya.textContent = pdpAd.textContent.trim() + (hacim ? ' · ' + hacim : '');
        fiyatKopya.textContent = pdpFiyat.textContent;
        stickyButton.textContent = (EN ? 'Add to Bag' : 'Sepete Ekle') + (hacim ? ' · ' + hacim : '');
      };
      window.omStickyVariantSync = esitle;
      esitle();
      new MutationObserver(esitle).observe(pdpFiyat, { childList: true, characterData: true, subtree: true });
      stickyButton.addEventListener('click', () => pdpBtn.click());
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => setSticky(!entry.isIntersecting), { threshold: 0.15 }).observe(pdpBtn);
      } else {
        setSticky(true);
      }
    }

    // Hoş geldin popup'ı (lead toplama) — panel > Pazarlama'dan yönetilir
    window.omPopupKur = function () {
      const pp = (typeof AC === 'object' && AC && AC.popup) || {};
      if (!pp.aktif || document.getElementById('om-popup')) return;
      if (/sepet|panel/.test(location.pathname)) return; // ödeme akışını bölme
      try {
        if (localStorage.getItem('om-popup-abone')) return;
        if (Date.now() - parseInt(localStorage.getItem('om-popup-son') || '0', 10) < 7 * 86400000) return;
      } catch (e) { return; }
      const baslik = (EN ? pp.baslikEN : pp.baslikTR) || pp.baslikTR || '';
      const metin = (EN ? pp.metinEN : pp.metinTR) || pp.metinTR || '';
      let acildi = false;
      function ac() {
        if (acildi) return; acildi = true;
        try { localStorage.setItem('om-popup-son', String(Date.now())); } catch (e) {}
        const ort = document.createElement('div');
        ort.id = 'om-popup';
        ort.style.cssText = 'position:fixed;inset:0;background:rgba(30,28,25,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';
        const kart = document.createElement('div');
        kart.style.cssText = 'background:#fff;border-radius:16px;max-width:400px;width:100%;padding:32px 28px;text-align:center;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.25);border-top:3px solid #BFA25D;';
        const kapat = document.createElement('button');
        kapat.textContent = '✕';
        kapat.setAttribute('aria-label', EN ? 'Close' : 'Kapat');
        kapat.style.cssText = 'position:absolute;top:10px;right:14px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:#8a8377;';
        const h = document.createElement('h3');
        h.textContent = baslik;
        h.style.cssText = 'font-family:Fraunces,serif;font-size:1.4rem;margin:0 0 10px;';
        const p = document.createElement('p');
        p.textContent = metin;
        p.style.cssText = 'font-size:.9rem;color:#4A463F;margin:0 0 18px;line-height:1.55;';
        const form = document.createElement('form');
        form.style.cssText = 'display:flex;gap:8px;';
        const inp = document.createElement('input');
        inp.type = 'email'; inp.required = true;
        inp.placeholder = EN ? 'Your email' : 'E-posta adresin';
        inp.style.cssText = 'flex:1;padding:11px 14px;border:1px solid #ECEAE6;border-radius:10px;font:inherit;font-size:.9rem;min-width:0;';
        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.textContent = EN ? 'Get code' : 'Kodu Al';
        btn.className = 'btn btn-gold';
        btn.style.cssText = 'white-space:nowrap;';
        const durum = document.createElement('p');
        durum.style.cssText = 'font-size:.8rem;color:#8a8377;margin:10px 0 0;min-height:1em;';
        form.append(inp, btn);
        kart.append(kapat, h, p, form, durum);
        ort.appendChild(kart);
        document.body.appendChild(ort);
        const kapa = () => ort.remove();
        kapat.addEventListener('click', kapa);
        ort.addEventListener('click', e => { if (e.target === ort) kapa(); });
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { kapa(); document.removeEventListener('keydown', esc); } });
        form.addEventListener('submit', e => {
          e.preventDefault();
          btn.disabled = true;
          fetch('/api/bulten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eposta: inp.value.trim(), kaynak: 'popup' }) })
            .then(r => r.json())
            .then(c => {
              if (c && c.tamam) {
                try { localStorage.setItem('om-popup-abone', '1'); } catch (err) {}
                form.style.display = 'none';
                p.textContent = EN ? 'Welcome! Use this code at checkout:' : 'Hoş geldin! Sepette bu kodu kullan:';
                if (pp.kupon) {
                  const kod = document.createElement('div');
                  kod.textContent = pp.kupon;
                  kod.style.cssText = 'font-size:1.3rem;font-weight:700;letter-spacing:.15em;color:#BFA25D;border:1px dashed #BFA25D;border-radius:10px;padding:12px;margin-top:6px;';
                  durum.before(kod);
                } else {
                  p.textContent = EN ? 'Welcome! You are on the list.' : 'Hoş geldin! Listeye eklendin.';
                }
                setTimeout(kapa, 6000);
              } else {
                btn.disabled = false;
                durum.textContent = (c && c.hata) || (EN ? 'Please try again.' : 'Lütfen tekrar dene.');
              }
            })
            .catch(() => { btn.disabled = false; durum.textContent = EN ? 'Connection error.' : 'Bağlantı hatası.'; });
        });
        setTimeout(() => inp.focus(), 150);
      }
      setTimeout(ac, Math.max(3, pp.gecikme || 15) * 1000);
      document.addEventListener('mouseout', e => { if (!e.relatedTarget && e.clientY <= 0) ac(); });
    };

    // çerez bandı (KVKK) — bir kez gösterilir
    if (!localStorage.getItem('om-cookie-ok')) {
      const cb = document.createElement('div');
      cb.className = 'cookie-bar show';
      cb.innerHTML = `<p>${T.cookieText} <a href="cerez-politikasi.html" style="text-decoration:underline;">${EN ? 'Cookie Policy' : 'Çerez Politikası'}</a></p><button class="btn btn-dark" id="cookie-ok">${T.cookieOk}</button>`;
      document.body.appendChild(cb);
      document.getElementById('cookie-ok').addEventListener('click', () => {
        localStorage.setItem('om-cookie-ok', '1');
        cb.remove();
      });
    }

    // Formlar: başarı yalnızca sunucu isteği gerçekten kabul ederse gösterilir.
    document.querySelectorAll('form[data-demo]').forEach(form => {
      let status = form.querySelector('.form-status');
      if (!status) {
        status = document.createElement('p');
        status.className = 'form-status';
        status.setAttribute('aria-live', 'polite');
        form.appendChild(status);
      }
      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        const eposta = (form.querySelector('input[type=email]') || {}).value || '';
        const mesajAlani = form.querySelector('textarea');
        const submit = form.querySelector('[type=submit]');
        const originalText = submit ? submit.textContent : '';
        if (submit) {
          submit.disabled = true;
          submit.textContent = EN ? 'Sending…' : 'Gönderiliyor…';
        }
        status.className = 'form-status is-pending';
        status.textContent = EN ? 'Your request is being sent…' : 'İsteğiniz gönderiliyor…';
        try {
          let endpoint;
          let payload;
          if (mesajAlani) {
            endpoint = '/api/iletisim';
            payload = {
              ad: (form.querySelector('#name') || {}).value || '',
              eposta: eposta,
              konu: (form.querySelector('#topic') || {}).value || '',
              mesaj: mesajAlani.value
            };
          } else {
            endpoint = '/api/bulten';
            payload = { eposta: eposta, kaynak: document.body.dataset.page || '' };
          }
          const response = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          let result = {};
          try { result = await response.json(); } catch (jsonError) { result = {}; }
          if (!response.ok || result.tamam !== true) {
            throw new Error(result.hata || (EN ? 'The request could not be completed. Please try again.' : 'İşlem tamamlanamadı. Lütfen yeniden deneyin.'));
          }
          status.className = 'form-status is-success';
          status.textContent = form.dataset.demo;
          showToast(form.dataset.demo);
          form.reset();
        } catch (error) {
          status.className = 'form-status is-error';
          status.textContent = error && error.message
            ? error.message
            : (EN ? 'Connection failed. Your entries were kept; please try again.' : 'Bağlantı kurulamadı. Bilgileriniz korundu; lütfen yeniden deneyin.');
        } finally {
          if (submit) {
            submit.disabled = false;
            submit.textContent = originalText;
          }
        }
      });
    });
  });
})();
