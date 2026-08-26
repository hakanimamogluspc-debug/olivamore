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
  // Karşı dilin sayfası (dil anahtarı için)
  let current = (location.pathname.split('/').pop() || 'index.html');
  if (current === 'en') current = 'index-en.html';                 // temiz EN ana sayfa
  else if (!/\.html$/.test(current)) current += '.html';           // temiz URL -> dosya adı
  const other = EN
    ? current.replace(/-en\.html$/, '.html')
    : current.replace(/\.html$/, '-en.html');

  /* ---------- Metinler ---------- */
  const T = EN ? {
    announce: 'The new harvest is here: <b>free shipping over 500 TL</b> · Club members always ship free',
    shop: 'Shop', club: 'Club', producers: 'Producers', learn: 'Learn', story: 'Our Story',
    megaCat: 'Category', megaAll: 'All Products', megaBest: 'Bestsellers', megaEvoo: 'Finishing Oils', megaEarly: 'Cooking Oils',
    megaPurpose: 'Purpose', megaGift: 'Gift Sets', megaBuild: 'Build Your Own Set', megaJoin: 'Join the Club', megaAcc: 'Accessories',
    megaNew: 'The new harvest is here', megaCta: 'Discover', megaRecipe: 'Recipe Assistant', megaQuiz: 'Palate Quiz',
    search: 'Search', cart: 'Bag', menu: 'Menu',
    faq: 'FAQ', contact: 'Contact',
    tagline: 'Traceable, award-winning extra virgin olive oil from our own groves in Ayvalık and Trilye.',
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
    announce: 'Yeni hasat geldi: <b>500 TL üzeri kargo bedava</b> · Club üyelerine her zaman ücretsiz kargo',
    shop: 'Shop', club: 'Club', producers: 'Üreticiler', learn: 'Öğren', story: 'Hikâyemiz',
    megaCat: 'Kategori', megaAll: 'Tüm Ürünler', megaBest: 'Çok Satanlar', megaEvoo: 'Serin Sofra', megaEarly: 'Ocak Başı',
    megaPurpose: 'Amaç', megaGift: 'Hediyelik Setler', megaBuild: 'Kendi Setini Oluştur', megaJoin: "Club'a Katıl", megaAcc: 'Aksesuarlar',
    megaNew: 'Yeni hasat geldi', megaCta: 'Keşfet', megaRecipe: 'Tarif Asistanı', megaQuiz: 'Damak Testi',
    search: 'Ara', cart: 'Sepet', menu: 'Menü',
    faq: 'SSS', contact: 'İletişim',
    tagline: "Ayvalık ve Trilye'nin kendi topraklarından, izlenebilir, ödüllü sızma zeytinyağı.",
    fShop: 'Alışveriş', fBrand: 'Marka', fHelp: 'Yardım',
    fAll: 'Tüm Ürünler', fEvoo: 'Serin Sofra', fGift: 'Hediyelik Setler',
    fStory: 'Hikâyemiz', fProducers: 'Üreticiler', fTrace: 'İzlenebilirlik', fPassport: 'Hasat Pasaportu', fQuality: 'Kalite ve Analizler', fAwards: 'Ödüller',
    fFaq: 'SSS', fShipping: 'Kargo & İade', fContact: 'İletişim', fTrack: 'Sipariş Takibi',
    rights: '© 2026 Olivamore. Tüm hakları saklıdır.',
    privacy: 'Gizlilik', terms: 'Kullanım Şartları', kvkk: 'KVKK',
    toast: 'Sepete eklendi ✓',
    cookieText: 'Bu sitede yalnızca çalışması için gerekli çerezler kullanılır. İleride analitik çerezler eklendiğinde önce onayınızı isteyeceğiz.',
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
              <a class="cat-card" href="${P('koleksiyon.html#zeytin')}"><span class="thumb"><img src="assets/img/kat-zeytin.png" alt=""></span>${EN ? 'Natural Olives' : 'Doğal Zeytinler'}</a>
              <a class="cat-card" href="${P('koleksiyon.html#eksi')}"><span class="thumb"><img src="assets/img/kat-sirke.png" alt=""></span>${EN ? 'Vinegars' : 'Sirkeler'}</a>
              <a class="cat-card" href="${P('koleksiyon.html#hediyelik')}"><span class="thumb"><img src="assets/img/kat-set.png" alt=""></span>${EN ? 'Sets' : 'Setler'}</a>
              <a class="cat-card" href="${P('koleksiyon.html')}"><span class="thumb"><img src="assets/img/kat-tum.png" alt=""></span>${EN ? 'All Products' : 'Tüm Ürünler'}</a>
            </div>
            <div class="mega-links">
              <a href="${P('damak-testi.html')}">${T.megaQuiz}</a>
              <a href="${P('tarif-asistani.html')}">${T.megaRecipe}</a>
              <a href="${P('hediye-olustur.html')}">${T.megaBuild}</a>
              <a href="${P('kulup.html')}">${T.megaJoin}</a>
            </div>
            </div>
            <a class="mega-promo" href="${P('koleksiyon.html#hediyelik')}">
              <img src="assets/img/foto-hediye-setleri.jpg" alt="">
              <div class="mp-body">
                <p>${EN ? 'A box worth opening, an oil worth the table' : 'Açmaya değer bir kutu, sofraya değer bir yağ'}</p>
                <span class="btn btn-gold btn-sm">${EN ? 'Shop Now' : 'Alışverişe Başla'}</span>
              </div>
            </a>
          </div>
        </div>
        <div><a class="top" data-nav="kulup" href="${P('kulup.html')}">${T.club}</a></div>
        <div><a class="top" data-nav="ureticiler" href="${P('ureticiler.html')}">${T.producers}</a></div>
      </nav>
      <a class="logo-link" href="${EN ? '/en' : '/'}" aria-label="Olivamore">
        <img src="assets/logo-word.svg" style="height:17px;width:auto;" alt="OLIVAMORE">
      </a>
      <div class="nav-right">
        <a class="top" data-nav="ogren" href="${P('ogren.html')}">${T.learn}</a>
        <a class="top" data-nav="hikayemiz" href="${P('hikayemiz.html')}">${T.story}</a>
        <a class="top lang-switch" href="${other}" aria-label="${EN ? 'Türkçe' : 'English'}">${EN ? 'TR' : 'EN'}</a>
        <button class="icon-btn" aria-label="${T.search}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        </button>
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
      <a href="${P('kulup.html')}">Olivamore Club</a>
      <a href="${P('ureticiler.html')}">${T.producers}</a>
      <a href="${P('hikayemiz.html')}">${T.story}</a>
      <a href="${P('ogren.html')}">${T.learn}</a>
      <a href="${P('sss.html')}">${T.faq}</a>
      <a href="${P('iletisim.html')}">${T.contact}</a>
      <a href="${other}">${EN ? 'Türkçe' : 'English'}</a>
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
            <li><a href="${P('kulup.html')}">Club</a></li>
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
        <span><a href="gizlilik.html">${T.kvkk}</a> · <a href="kullanim-sartlari.html">${T.terms}</a> · <a href="mesafeli-satis.html">${EN ? 'Distance Sales Agreement' : 'Mesafeli Satış Sözleşmesi'}</a> · <a href="cerez-politikasi.html">${EN ? 'Cookie Policy' : 'Çerez Politikası'}</a> · <a href="panel.html" style="opacity:.55;">${EN ? 'Admin' : 'Yönetim'}</a></span>
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
  let AC = adminConfig(); // yerel yedek; sunucu config'i gelirse üzerine yazılır
  let MODS = mkMods();
  function mkMods() {
    return Object.assign(
      { announce: true, trust: true, club: true, reviews: true, newsletter: true, hediyelik: true, blogPreview: true, hediye: true, tarif: true },
      AC.modules || {}
    );
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
    if (current.indexOf('urun-trilye') === 0) sizeMap = { '750ml': priceOf('tr750'), '2lt': priceOf('tr2l') };
    else if (current.indexOf('urun') === 0) sizeMap = { '250ml': priceOf('ay250'), '500ml': priceOf('ay500'), '750ml': pdp750 };
    if (sizeMap && document.getElementById('fiyat-tek')) {
      document.querySelectorAll('.sizes .size[data-price]').forEach(b => {
        const label = b.textContent.trim().replace(/\s.*$/, '');
        const val = sizeMap[label];
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
    eksi: { tr: 'Sirkeler', en: 'Vinegars' },
    hediye: { tr: 'Setler', en: 'Sets' }
  };
  // Zengin (elle yazılmış) sayfası olan ürünler; kalan her ürün dinamik p.html'e gider
  const OZEL_SAYFA = {
    ay250: 'urun.html', ay500: 'urun.html', ay750: 'urun.html', ay2l: 'urun.html', ay5l: 'urun.html',
    tr250: 'urun-trilye.html', tr500: 'urun-trilye.html', tr750: 'urun-trilye.html', tr2l: 'urun-trilye.html', tr5l: 'urun-trilye.html'
  };
  function urunHref(p) {
    if (p.type === 'builder' || p.type === 'club') return P(p.href || 'koleksiyon.html');
    if (OZEL_SAYFA[p.id]) return P(OZEL_SAYFA[p.id]);
    return (EN ? 'p-en.html' : 'p.html') + '?id=' + encodeURIComponent(p.id || '');
  }
  function productCard(p, C) {
    const name = EN ? p.nameEN : p.nameTR;
    const note = EN ? p.noteEN : p.noteTR;
    const unit = EN ? p.unitEN : p.unitTR;
    const badge = EN ? p.badgeEN : p.badgeTR;
    const href = urunHref(p);
    const badgeHtml = badge ? `<span class="badge">${badge}</span>` : '';
    const roleDef = ROLE_LABELS[p.role];
    const roleHtml = roleDef ? `<span class="role-tag">${EN ? roleDef.en : roleDef.tr}</span>` : '';
    let media, priceHtml, cta;
    if (p.type === 'club') {
      media = `<div class="prod-img art-olive">${badgeHtml}<div style="height:100%;display:flex;align-items:center;justify-content:center;padding-bottom:60px;" data-mark="110"></div><span class="add-bag">${EN ? 'Join the Club' : "Club'a Katıl"} <span>→</span></span></div>`;
      priceHtml = `₺${fmtTL(p.price)} <small>${unit || ''}</small>`;
    } else if (p.type === 'builder') {
      const gp = C.gift3 || p.price;
      media = `<div class="prod-img photo">${badgeHtml}<img src="${p.img}" alt="${name}"><span class="add-bag">${EN ? 'Build Your Set' : 'Setini Oluştur'} <span>→</span></span></div>`;
      priceHtml = EN ? `from ₺${fmtTL(gp)}` : `₺${fmtTL(gp)}<small>'dan</small>`;
    } else {
      const altImg = (p.galeri && p.galeri[0]) ? `<img class="alt-img" src="${p.galeri[0]}" alt="">` : '';
      const addBtn = p.price ? `<button class="add-bag" data-add>${EN ? 'Add to Bag' : 'Sepete Ekle'} <span>→</span></button>` : '';
      media = `<div class="prod-img photo">${badgeHtml}<img src="${p.img}" alt="${name}">${altImg}${addBtn}</div>`;
      priceHtml = p.price ? `₺${fmtTL(p.price)} <small>${unit || ''}</small>` : `<span style="color:var(--gold);font-size:.85rem;font-weight:600;">${EN ? 'Coming soon' : 'Fiyat yakında'}</span>`;
    }
    return `<a class="card" href="${href}" data-role="${p.role || 'all'}" data-pid="${p.id || ''}">${media}<div class="card-body">${roleHtml}<div class="card-row"><h3>${name}</h3><span class="price">${priceHtml}</span></div>${note ? `<p class="card-note">${note}</p>` : ''}</div></a>`;
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

    // Sunucu CMS config'i (panel kayıtları tüm ziyaretçilere buradan ulaşır);
    // API yoksa (yerel önizleme) localStorage yedeğiyle devam edilir.
    fetch('/api/config', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (cfg && Object.keys(cfg).length) { AC = cfg; MODS = mkMods(); }
        applyAdminOverrides();
        markSweep();
        if (window.omBoySenkron) window.omBoySenkron();
        urunOdakla();
      })
      .catch(() => { applyAdminOverrides(); markSweep(); if (window.omBoySenkron) window.omBoySenkron(); urunOdakla(); });

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
    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => toast.classList.remove('show'), 2200);
    }
    function cartGet() {
      try { return JSON.parse(localStorage.getItem('om-cart') || '[]'); } catch (e) { return []; }
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
    function urunTopla(addEl) {
      // Tıklanan butonun bağlamından ürün bilgisi çıkar
      // 1) PDP "Sepete Ekle · ₺X" butonu
      if (addEl.id === 'sepet-btn') {
        const h1 = document.querySelector('.buy h1');
        const boyut = document.querySelector('.sizes .size.on');
        return {
          ad: (h1 ? h1.textContent.trim() : 'Ürün') + (boyut ? ' · ' + boyut.textContent.trim() : ''),
          fiyat: fiyatCoz(addEl.textContent),
          img: (document.getElementById('gallery-img') || {}).src || ''
        };
      }
      // 2) Hediye kutusu oluşturucu
      if (addEl.id === 'gb-add') {
        const sec = document.querySelector('.gb-box .size.on');
        return {
          ad: EN ? ('Custom Gift Set (' + (sec ? sec.dataset.cap : '?') + ' bottles)') : ('Kendi Hediye Setin (' + (sec ? sec.dataset.cap : '?') + "'li)"),
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
        return {
          ad: h3 ? h3.textContent.trim() : 'Ürün',
          fiyat: fiyatCoz(fiyat ? fiyat.textContent : ''),
          img: img ? img.getAttribute('src') : ''
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
          const ayni = c.find(k => k.ad === u.ad && k.fiyat === u.fiyat);
          if (ayni) ayni.adet = Math.min(99, ayni.adet + 1);
          else c.push({ ad: u.ad, fiyat: u.fiyat, adet: 1, img: u.img, kdv: kdvBul(u.ad) });
          cartSave(c);
          showToast(T.toast);
        } else {
          showToast(T.toast);
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
      revs.forEach(el => { el.classList.add('rv'); io.observe(el); });
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
    };
    window.omBoySenkron = boySenkron;

    // PDP mobil sabit CTA çubuğu (strateji: ad + fiyat + Sepete Ekle hep görünür)
    const pdpBtn = document.getElementById('sepet-btn');
    const pdpAd = document.querySelector('.buy h1');
    const pdpFiyat = document.getElementById('fiyat-tek');
    if (pdpBtn && pdpAd && pdpFiyat) {
      const bar = document.createElement('div');
      bar.className = 'pdp-sticky';
      bar.innerHTML = `<div class="t"><b>${pdpAd.textContent.trim()}</b><span></span></div><button class="btn btn-gold" type="button">${EN ? 'Add to Bag' : 'Sepete Ekle'}</button>`;
      document.body.appendChild(bar);
      document.body.classList.add('has-pdp-sticky');
      const fiyatKopya = bar.querySelector('span');
      const esitle = () => { fiyatKopya.textContent = pdpFiyat.textContent; };
      esitle();
      new MutationObserver(esitle).observe(pdpFiyat, { childList: true, characterData: true, subtree: true });
      bar.querySelector('button').addEventListener('click', () => pdpBtn.click());
    }

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

    // formlar: bülten/iletişim artık API'ye gider (API yoksa yine de nazik davranır)
    document.querySelectorAll('form[data-demo]').forEach(form => {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const eposta = (form.querySelector('input[type=email]') || {}).value || '';
        const mesajAlani = form.querySelector('textarea');
        if (mesajAlani) {
          // iletişim formu
          fetch('/api/iletisim', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ad: (form.querySelector('#name') || {}).value || '',
              eposta: eposta,
              konu: (form.querySelector('#topic') || {}).value || '',
              mesaj: mesajAlani.value
            })
          }).catch(() => {});
        } else if (eposta) {
          // bülten / e-posta yakalama formları
          fetch('/api/bulten', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eposta: eposta, kaynak: document.body.dataset.page || '' })
          }).catch(() => {});
        }
        showToast(form.dataset.demo);
        form.reset();
      });
    });
  });
})();
