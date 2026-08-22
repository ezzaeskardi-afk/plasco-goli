// product.js — صفحه‌ی اختصاصی محصول: بارگذاری از /api/products/:id + سئو + محصولات مرتبط

document.addEventListener('DOMContentLoaded', async () => {
  // شناسه از مسیر تمیز /product/12 یا از پارامتر ?id=12
  const pathMatch = location.pathname.match(/\/product\/(\d+)/);
  const id = pathMatch ? pathMatch[1] : new URLSearchParams(location.search).get('id');
  const loading = document.getElementById('pdLoading');
  const notFound = document.getElementById('pdNotFound');
  const loaded = document.getElementById('pdLoaded');

  // کادرِ عکسِ اصلی در دسکتاپ حداکثر ۴۶۰ پیکسل است و در موبایل تمامِ عرض تا
  // همان سقف. چون گالری همین عکس را با JS عوض می‌کند، این رشته باید یک‌جا
  // تعریف شود؛ دو نسخه‌ی جدا یعنی بعد از تعویضِ عکس، sizes با HTML اولیه فرق کند.
  const COVER_SIZES = '(max-width:820px) min(100vw, 460px), 460px';

  if (!id) return showNotFound();

  // هر دو درخواست هم‌زمان شروع می‌شوند (قبلاً پشت‌سرهم بودند و یک رفت‌وبرگشت
  // اضافه به صفحه تحمیل می‌کردند). لیست کامل برای «محصولات مرتبط» لازم است.
  const productReq = PG.api(`/products/${encodeURIComponent(id)}`);

  let product;
  try {
    ({ product } = await productReq);
  } catch (e) {
    // فرقِ «نیست» با «نرسید» حیاتی است: قبلاً هر خطایی — حتی قطعیِ لحظه‌ایِ
    // اینترنت — پیام «محصول پیدا نشد» می‌داد. یعنی به مشتری دروغ می‌گفتیم که
    // کالا حذف شده و او می‌رفت، در حالی که کالا سرِ جایش بود.
    if (e.status === 404 || e.status === 410) return showNotFound();
    loading?.classList.add('hidden');
    PG.pageError(e);
    return;
  }

  renderProduct(product);
  applySeo(product);
  // ترتیب مهم است: اول فهرستِ اخیر را با شناسه‌های *قبلی* می‌کشیم، بعد این
  // محصول را اضافه می‌کنیم. برعکسش یعنی همان کالایی که باز است، در بخش
  // «اخیراً دیده‌اید» همان صفحه دوباره ظاهر شود.
  loadRecent(product);
  PG.pushRecent(product.id);
  loadRelated(product);
  loadReviews(product);
  paintFreeShipPerk();
  // تنظیمات فروشگاه ممکن است بعد از رندر برسد؛ همان لحظه هم دوباره می‌کشیم
  document.addEventListener('pg:shopinfo', paintFreeShipPerk);

  // «خرید بالای N تومان، ارسال رایگان» — فقط اگر مدیر آستانه تعیین کرده باشد.
  // آستانه‌ی نداشته را نمی‌سازیم؛ وعده‌ی توخالی از نگفتن بدتر است.
  function paintFreeShipPerk() {
    const li = document.getElementById('pdFreeShip');
    if (!li) return;
    const note = PG.freeShipNote();
    li.querySelector('span').textContent = note;
    li.hidden = !note;
  }

  function showNotFound() {
    loading.classList.add('hidden');
    notFound.classList.remove('hidden');
    document.title = 'محصول پیدا نشد | پلاسکو گلی';
  }

  function renderProduct(p) {
    document.getElementById('pdCrumbTitle').textContent = p.title;
    document.getElementById('pdCat').textContent = p.category;
    document.getElementById('pdTitle').textContent = p.title;
    document.getElementById('pdDesc').textContent = p.description;
    document.getElementById('pdPrice').innerHTML = PG.priceHtml(p, { big: true });

    // «چقدر صرفه‌جویی می‌کنید» — عدد واقعی از اختلاف دو قیمت، نه ادعای تبلیغاتی
    const saveEl = document.getElementById('pdSave');
    if (saveEl) {
      const save = (Number(p.oldPrice) || 0) - Number(p.price);
      if (save > 0) {
        saveEl.innerHTML = `<svg aria-hidden="true"><use href="#i-check-circle"/></svg> با این خرید <b>${PG.money(save)} تومان</b> کمتر می‌پردازید`;
        saveEl.hidden = false;
      } else {
        saveEl.hidden = true;
      }
    }

    // تخفیف عمده (B2B) — سرور با wholesaleInfo حسابش کرده و فقط وقتی حد نصاب
    // و درصد تعریف شده باشد این بلاک را نشان می‌دهیم.
    const wsEl = document.getElementById('pdWholesale');
    if (wsEl) {
      const ws = p.wholesale;
      if (ws && ws.minQty > 0 && ws.discount > 0) {
        wsEl.innerHTML = `
          <svg aria-hidden="true"><use href="#i-box"/></svg>
          <span>خرید عمده: از <b>${PG.money(ws.minQty)} عدد</b>، هر عدد <b>${PG.money(ws.unitPrice)} تومان</b> (${PG.money(ws.discount)}٪ تخفیف)</span>
          <a href="/wholesale.html?product=${encodeURIComponent(p.id)}">درخواست قیمت عمده</a>`;
        wsEl.hidden = false;
      } else {
        wsEl.hidden = true;
      }
    }

    // ---------- گالری ----------
    // کاور و عکس‌های اضافه یک لیست یکتا می‌شوند. اگر مدیر کاور نگذاشته باشد ولی
    // گالری پر باشد، عکس اولِ گالری کاور می‌شود؛ قبلاً در این حالت عکس اصلی همان
    // آیکون می‌ماند و کلیک روی بندانگشتی‌ها هیچ اثری نداشت.
    const gallery = [p.image, ...(Array.isArray(p.images) ? p.images : [])]
      .filter(Boolean).filter((src, i, all) => all.indexOf(src) === i);
    const cover = gallery[0] || '';

    const media = document.getElementById('pdMedia');
    media.innerHTML = `
      ${p.discountPercent ? `<span class="product-badge off">${PG.money(p.discountPercent)}٪ تخفیف</span>` : (p.badge ? `<span class="product-badge">${PG.esc(p.badge)}</span>` : '')}
      ${PG.wishBtnHtml(p.id, 'pd-wish')}
      ${cover
        ? `<img src="${PG.esc(cover)}"${PG.imgSizing(cover, COVER_SIZES)} alt="${PG.esc(p.title)}" fetchpriority="high" decoding="async">
           <span class="pd-zoom-hint"><svg aria-hidden="true"><use href="#i-search"/></svg> برای بزرگ‌نمایی بزنید</span>`
        : `<svg role="img" aria-label="${PG.esc(p.title)}"><use href="#${PG.esc(p.icon)}"/></svg>`}`;
    PG.refreshWishlist();
    if (cover) setupGallery(p, gallery, media);

    // جدول مشخصات (اگر در پنل پر شده باشد)
    const specs = Array.isArray(p.specs) ? p.specs.filter(s => s && s.k && s.v) : [];
    if (specs.length) {
      document.getElementById('pdSpecsTable').innerHTML = specs.map(s =>
        `<tr><th>${PG.esc(s.k)}</th><td>${PG.esc(s.v)}</td></tr>`).join('');
      document.getElementById('pdSpecs').classList.remove('hidden');
    }

    const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
    const lowStock = typeof p.stock === 'number' && p.stock > 0 && p.stock <= PG.lowStockAt();
    const stockEl = document.getElementById('pdStock');
    stockEl.hidden = !(outOfStock || lowStock);
    stockEl.classList.toggle('out', outOfStock);
    stockEl.textContent = outOfStock ? 'ناموجود' : (lowStock ? `فقط ${PG.money(p.stock)} عدد باقی مانده` : '');

    // انتخاب تعداد
    let qty = 1;
    const maxQty = typeof p.stock === 'number' && p.stock > 0 ? p.stock : 99;
    const qtyVal = document.getElementById('qtyVal');
    function syncQty() { qtyVal.textContent = PG.money(qty); }
    document.getElementById('qtyMinus').addEventListener('click', () => { if (qty > 1) { qty--; syncQty(); } });
    document.getElementById('qtyPlus').addEventListener('click', () => { if (qty < maxQty) { qty++; syncQty(); } });

    const buy = document.getElementById('pdBuy');
    buy.disabled = outOfStock;
    buy.querySelector('span').textContent = outOfStock ? 'ناموجود' : 'افزودن به سبد';
    const buyIdleHtml = buy.innerHTML; // بعد از تنظیم متن درست ذخیره می‌شود

    // ناموجود؟ به‌جای بن‌بست، دکمه‌ی «موجود شد خبرم کن» — مشتری از دست نمی‌رود.
    // خودِ دکمه و رفتارش در common.js است (همان که روی کارت‌ها هم می‌نشیند)،
    // پس اینجا فقط جایش را می‌سازیم. قبلاً یک نسخه‌ی دومِ همین کد اینجا بود.
    if (outOfStock && !document.querySelector('.notify-me-wrap')) {
      document.querySelector('.pd-buy-row').insertAdjacentHTML('afterend', `
        <div class="notify-me-wrap">
          ${PG.notifyBtnHtml(p.id)}
          <small>به محض شارژ موجودی، پیامک می‌گیرید.</small>
        </div>`);
    }
    buy.addEventListener('click', async () => {
      if (buy.disabled) return;
      buy.disabled = true;
      buy.querySelector('span').textContent = 'در حال افزودن…';
      try {
        await PG.addToCart(p.id, qty);
        // همان بازخورد «اضافه شد» شبکه‌ی محصولات — کاربر مطمئن شود کالا واقعاً به سبد رفت
        buy.classList.add('is-added');
        buy.innerHTML = '<svg><use href="#i-check"/></svg> <span>اضافه شد</span>';
        setTimeout(() => {
          buy.classList.remove('is-added');
          buy.innerHTML = buyIdleHtml;
          buy.disabled = outOfStock;
        }, 1200);
      } catch (err) {
        PG.toast(err.message || 'خطا در افزودن به سبد', 'error');
        buy.innerHTML = buyIdleHtml;
        buy.disabled = outOfStock;
      }
    });

    loading.classList.add('hidden');
    loaded.classList.remove('hidden');
  }

  // ---------- گالری عکس ----------
  // یک رفتار، چهار راه ورود: بندانگشتی برای موس، کشیدن انگشت برای موبایل،
  // کلیدهای جهت‌دار برای کیبورد، و کلیک روی عکس برای دیدن در اندازه‌ی بزرگ.
  // مشتریِ لوازم خانه قبل از خرید می‌خواهد جنس را از نزدیک ببیند؛ نبودِ
  // بزرگ‌نمایی یعنی باید عکس را در تب جدید باز کند — که معمولاً نمی‌کند.
  function setupGallery(p, gallery, media) {
    const mainImg = media.querySelector('img');
    const thumbs = document.getElementById('pdThumbs');
    const multi = gallery.length > 1;
    let idx = 0;
    let lightbox = null, lbImg = null, lbCount = null, lastFocus = null;

    // عکس‌های همسایه از قبل دانلود می‌شوند تا تعویض بدون پرشِ سفید باشد
    const preload = (i) => {
      const src = gallery[(i + gallery.length) % gallery.length];
      if (src) { const im = new Image(); im.src = src; }
    };

    function show(i, { focusThumb = false } = {}) {
      idx = (i + gallery.length) % gallery.length;
      if (mainImg) PG.setImgSrc(mainImg, gallery[idx], COVER_SIZES);
      if (lbImg) { lbImg.src = gallery[idx]; lbImg.classList.remove('is-zoomed'); }
      if (lbCount) lbCount.textContent = `${PG.money(idx + 1)} از ${PG.money(gallery.length)}`;
      thumbs.querySelectorAll('.pd-thumb').forEach((t, n) => {
        const on = n === idx;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', String(on));
        // الگوی استاندارد tablist: فقط عکسِ فعال در مسیر Tab است و بقیه با فلش
        t.tabIndex = on ? 0 : -1;
        if (on) {
          t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          if (focusThumb) t.focus();
        }
      });
      if (multi) { preload(idx + 1); preload(idx - 1); }
    }

    if (multi) {
      thumbs.innerHTML = gallery.map((src, i) => `
        <button type="button" class="pd-thumb${i === 0 ? ' on' : ''}" role="tab"
          aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" aria-label="عکس ${PG.money(i + 1)}">
          <img src="${PG.esc(PG.thumb(src, 320))}" alt="" loading="lazy" decoding="async">
        </button>`).join('');
      thumbs.classList.remove('hidden');

      thumbs.addEventListener('click', (e) => {
        const btn = e.target.closest('.pd-thumb');
        if (btn) show([...thumbs.children].indexOf(btn));
      });
      // در چیدمان راست‌به‌چپ، فلشِ چپ یعنی «عکس بعدی»
      thumbs.addEventListener('keydown', (e) => {
        const next = { ArrowLeft: idx + 1, ArrowRight: idx - 1, Home: 0, End: gallery.length - 1 };
        if (!(e.key in next)) return;
        e.preventDefault();
        show(next[e.key], { focusThumb: true });
      });
      preload(1);
    }

    // کشیدن انگشت روی عکس اصلی. flagِ swiped لازم است چون بعضی مرورگرها بعد از
    // کشیدن هم click می‌فرستند و بدون آن، هر سوایپ نمای بزرگ را هم باز می‌کرد.
    let x0 = null, y0 = null, swiped = false;
    media.addEventListener('touchstart', (e) => {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; swiped = false;
    }, { passive: true });
    media.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      // فقط حرکت افقیِ واضح؛ اسکرول عمودی صفحه نباید عکس را عوض کند
      if (multi && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiped = true;
        show(dx < 0 ? idx + 1 : idx - 1);
      }
    }, { passive: true });

    media.classList.add('zoomable');
    media.addEventListener('click', (e) => {
      if (e.target.closest('.wish-btn')) return; // دکمه‌ی علاقه‌مندی کار خودش را دارد
      if (swiped) { swiped = false; return; }
      openLightbox();
    });

    function openLightbox() {
      if (!lightbox) buildLightbox();
      lastFocus = document.activeElement;
      lbImg.src = gallery[idx];
      lbImg.classList.remove('is-zoomed');
      if (lbCount) lbCount.textContent = `${PG.money(idx + 1)} از ${PG.money(gallery.length)}`;
      prevOverflow = document.body.style.overflow;
      document.body.classList.add('qv-lock'); // همان کلاسی که نمای سریع استفاده می‌کند
      lightbox.classList.add('open');
      lightbox.querySelector('.pd-lb-close').focus();
    }

    function closeLightbox() {
      if (!lightbox) return;
      lightbox.classList.remove('open');
      document.body.classList.remove('qv-lock');
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }

    function buildLightbox() {
      lightbox = document.createElement('div');
      lightbox.className = 'pd-lightbox';
      lightbox.setAttribute('role', 'dialog');
      lightbox.setAttribute('aria-modal', 'true');
      lightbox.setAttribute('aria-label', `عکس‌های ${p.title}`);
      lightbox.innerHTML = `
        <button type="button" class="pd-lb-close" aria-label="بستن"><svg><use href="#i-close"/></svg></button>
        ${multi ? `
        <button type="button" class="pd-lb-nav prev" aria-label="عکس قبلی"><svg><use href="#i-arrow-right"/></svg></button>
        <button type="button" class="pd-lb-nav next" aria-label="عکس بعدی"><svg><use href="#i-arrow-right"/></svg></button>
        <span class="pd-lb-count" aria-live="polite"></span>` : ''}
        <img src="${PG.esc(gallery[idx])}" alt="${PG.esc(p.title)}">`;
      document.body.appendChild(lightbox);
      lbImg = lightbox.querySelector('img');
      lbCount = lightbox.querySelector('.pd-lb-count');

      lightbox.querySelector('.pd-lb-close').addEventListener('click', closeLightbox);
      lightbox.querySelector('.prev')?.addEventListener('click', () => show(idx - 1));
      lightbox.querySelector('.next')?.addEventListener('click', () => show(idx + 1));
      // کلیک روی فضای خالی = بستن (خودِ عکس و دکمه‌ها stopPropagation دارند)
      lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

      // بزرگ‌نمایی: نقطه‌ی کلیک مرکز بزرگ‌نمایی می‌شود تا کاربر همان جایی را
      // ببیند که رویش کلیک کرده، نه مرکز عکس.
      lbImg.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = lbImg.getBoundingClientRect();
        lbImg.style.transformOrigin =
          `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
        lbImg.classList.toggle('is-zoomed');
      });

      // کیبورد: Esc بستن، فلش‌ها تعویض، Tab داخل همین پنجره حلقه می‌زند
      lightbox.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); return closeLightbox(); }
        if (multi && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          return show(e.key === 'ArrowLeft' ? idx + 1 : idx - 1);
        }
        if (e.key !== 'Tab') return;
        const focusable = [...lightbox.querySelectorAll('button')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
  }

  // عنوان، توضیحات متا، canonical، og/twitter و Schema.org برای سئو
  function applySeo(p) {
    document.title = `${p.title} | خرید با قیمت ${PG.money(p.price)} تومان | پلاسکو گلی`;
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `خرید ${p.title} — ${p.description} قیمت: ${PG.money(p.price)} تومان. ارسال سریع از پلاسکو گلی ساری.`);

    // ⚠️ سرور برای آدرس /product/:id همین متاها را از قبل تزریق کرده است.
    // پس این تابع باید «تکرارنکن» باشد: دو تگ canonical روی یک صفحه، بدتر از
    // نداشتن canonical است چون گوگل هر دو را نادیده می‌گیرد.
    if (!document.querySelector('link[rel="canonical"]')) {
      const canonical = document.createElement('link');
      canonical.rel = 'canonical';
      canonical.href = `${location.origin}/product/${p.id}`;
      document.head.appendChild(canonical);
    }

    // پیش‌نمایش درست موقع فرستادن لینک محصول در واتساپ/تلگرام/توییتر
    const setMeta = (attr, name, content) => {
      let m = document.querySelector(`meta[${attr}="${name}"]`);
      if (!m) { m = document.createElement('meta'); m.setAttribute(attr, name); document.head.appendChild(m); }
      m.setAttribute('content', content);
    };
    setMeta('property', 'og:type', 'product');
    setMeta('property', 'og:site_name', 'پلاسکو گلی');
    setMeta('property', 'og:url', `${location.origin}/product/${p.id}`);
    setMeta('property', 'og:title', `${p.title} | پلاسکو گلی`);
    setMeta('property', 'og:description', `${p.description} — ${PG.money(p.price)} تومان`);
    if (p.image) setMeta('property', 'og:image', location.origin + p.image);
    setMeta('name', 'twitter:card', p.image ? 'summary_large_image' : 'summary');
    setMeta('name', 'twitter:title', `${p.title} | پلاسکو گلی`);
    if (p.image) setMeta('name', 'twitter:image', location.origin + p.image);

    // مسیر خانه → دسته → محصول در نتایج گوگل (BreadcrumbList)
    if (!document.querySelector('script[data-pg-ld="crumbs"]')) {
      const crumbs = document.createElement('script');
      crumbs.type = 'application/ld+json';
      crumbs.setAttribute('data-pg-ld', 'crumbs');
      crumbs.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'خانه', item: `${location.origin}/` },
          { '@type': 'ListItem', position: 2, name: p.category, item: `${location.origin}/index.html?cat=${encodeURIComponent(p.category)}` },
          { '@type': 'ListItem', position: 3, name: p.title, item: `${location.origin}/product/${p.id}` }
        ]
      });
      document.head.appendChild(crumbs);
    }

    // اگر سرور (روت /product/:id) داده‌ی ساختاریافته را تزریق کرده، دوباره
    // نمی‌سازیم. تزریق کلاینتی فقط برای وقتی است که صفحه با آدرس
    // product.html?id=… باز شده باشد و آن مسیرِ بازنویسیِ متا رد نشده باشد.
    if (document.querySelector('script[data-pg-ld="product"]')) return;

    const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.title,
      description: p.description,
      category: p.category,
      ...(p.image ? { image: location.origin + p.image } : {}),
      // ستاره‌ها در نتایج گوگل — فقط وقتی دیدگاه تأییدشده داریم
      ...(p.rating && p.rating.count > 0 ? {
        aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating.avg, reviewCount: p.rating.count }
      } : {}),
      offers: {
        '@type': 'Offer',
        url: `${location.origin}/product/${p.id}`,
        // واحد سایت تومان است و IRR ریال؛ بدون ×۱۰ عدد یک‌دهم واقعیت اعلام می‌شد
        price: Number(p.price) * 10,
        priceCurrency: 'IRR',
        availability: outOfStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        seller: { '@type': 'Store', name: 'پلاسکو گلی' }
      }
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-pg-ld', 'product');
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
  }

  // محصولات مرتبط (هم‌دسته، غیر از خودش) — سرور موجودها را اول می‌گذارد تا
  // «همچنین بخرید» هیچ‌وقت با کالای ناموجود شروع نشود.
  async function loadRelated(p) {
    try {
      const res = await PG.api(`/products/${encodeURIComponent(p.id)}/related`);
      const related = (res.products || []).slice(0, 4);
      if (!related.length) return;
      document.getElementById('pdRelated').innerHTML = related.map(renderRelatedCard).join('');
      document.getElementById('pdRelatedWrap').classList.remove('hidden');
      PG.syncWishHearts();
    } catch (e) { /* بخش مرتبط اختیاری است */ }
  }

  // ---------- اخیراً دیده‌اید ----------
  // با «محصولات مرتبط» فرق دارد: آن‌جا هم‌دسته‌هاست، این‌جا چیزهایی که خودِ
  // این مشتری واقعاً باز کرده. برای برگشتن به کالایی که چند صفحه قبل دیده و
  // مقایسه‌ی دو گزینه، همین کوتاه‌ترین راه است.
  async function loadRecent(p) {
    const items = await PG.recentProducts({ exceptId: p.id, limit: 6 });
    // اگر فقط همین یک کالا را دیده باشد، بخش خالی نشان نمی‌دهیم
    if (!items.length) return;
    document.getElementById('pdRecent').innerHTML = items.map(renderRelatedCard).join('');
    document.getElementById('pdRecentWrap').classList.remove('hidden');
    PG.syncWishHearts();
  }

  // ---------- دیدگاه خریداران ----------
  const starRow = (v) => Array.from({ length: 5 }, (_, i) =>
    `<svg class="rv-star${i < Math.round(v) ? ' on' : ''}"><use href="#i-star"/></svg>`).join('');

  async function loadReviews(p) {
    let data;
    try {
      data = await PG.api(`/products/${p.id}/reviews`);
    } catch (e) { return; } // بخش نظرات اختیاری است؛ صفحه را نمی‌خواباند

    // خلاصه‌ی امتیاز (ستون کناری) + ستاره‌ی کنار عنوان
    document.getElementById('rvAvg').textContent = data.count ? PG.money(data.avg) : '—';
    document.getElementById('rvStars').innerHTML = starRow(data.count ? data.avg : 0);
    document.getElementById('rvCount').textContent = data.count
      ? `از ${PG.money(data.count)} دیدگاه تأییدشده`
      : 'هنوز دیدگاهی ثبت نشده — اولین نفر باشید!';
    const link = document.getElementById('pdRatingLink');
    if (data.count) {
      link.innerHTML = `<span class="rv-stars sm">${starRow(data.avg)}</span>
        <b>${PG.money(data.avg)}</b> <span>(${PG.money(data.count)} دیدگاه)</span>`;
      link.classList.remove('hidden');
    }

    // لیست نظرات تأییدشده
    const list = document.getElementById('rvList');
    list.innerHTML = data.items.map(r => `
      <article class="rv-item">
        <header>
          <span class="rv-name">${PG.esc(r.userName)}
            ${r.isBuyer ? '<span class="rv-buyer"><svg><use href="#i-check-circle"/></svg> خریدار</span>' : ''}
          </span>
          <span class="rv-stars sm" aria-label="${PG.money(r.rating)} ستاره">${starRow(r.rating)}</span>
        </header>
        ${r.body ? `<p>${PG.esc(r.body)}</p>` : ''}
        <time class="muted">${new Date(r.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('fa-IR')}</time>
      </article>
    `).join('');

    // فرم ثبت نظر — مهمان دعوت به ورود می‌شود
    const wrap = document.getElementById('rvFormWrap');
    const { user } = await PG.api('/auth/me').catch(() => ({ user: null }));
    if (!user) {
      wrap.innerHTML = `<div class="rv-login">
        برای ثبت دیدگاه <a href="/login.html?next=${encodeURIComponent(`product.html?id=${p.id}`)}">وارد حساب‌تان شوید</a>
      </div>`;
      return;
    }
    const mine = data.myReview;
    wrap.innerHTML = `
      <form class="rv-form" id="rvForm">
        <div class="rv-form-head">
          <b>${mine ? 'ویرایش دیدگاه شما' : 'دیدگاه خود را ثبت کنید'}</b>
          ${mine && mine.status === 'pending' ? '<span class="rv-pending">در انتظار تأیید</span>' : ''}
        </div>
        <div class="rv-pick" role="radiogroup" aria-label="امتیاز از ۱ تا ۵">
          ${[1, 2, 3, 4, 5].map(n => `
            <button type="button" class="rv-pick-star${mine && n <= mine.rating ? ' on' : ''}" data-star="${n}"
              role="radio" aria-checked="${mine ? String(n === mine.rating) : 'false'}" aria-label="${n} ستاره">
              <svg><use href="#i-star"/></svg>
            </button>`).join('')}
        </div>
        <textarea id="rvBody" rows="3" maxlength="500"
          placeholder="تجربه‌تان از این جنس را بنویسید؛ کیفیت، اندازه، رنگ...">${mine ? PG.esc(mine.body) : ''}</textarea>
        <button type="submit" class="btn btn-primary" id="rvSubmit">${mine ? 'به‌روزرسانی دیدگاه' : 'ثبت دیدگاه'}</button>
      </form>`;

    let picked = mine ? mine.rating : 0;
    const stars = [...wrap.querySelectorAll('.rv-pick-star')];
    const paint = (n) => stars.forEach((s, i) => {
      s.classList.toggle('on', i < n);
      s.setAttribute('aria-checked', String(i + 1 === picked));
    });
    stars.forEach(s => {
      s.addEventListener('mouseenter', () => paint(Number(s.dataset.star)));
      s.addEventListener('click', () => { picked = Number(s.dataset.star); paint(picked); });
    });
    wrap.querySelector('.rv-pick').addEventListener('mouseleave', () => paint(picked));

    wrap.querySelector('#rvForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!picked) return PG.toast('اول امتیاز بدهید (روی ستاره‌ها بزنید)', 'error');
      const btn = wrap.querySelector('#rvSubmit');
      btn.disabled = true;
      try {
        const res = await PG.api(`/products/${p.id}/reviews`, {
          method: 'POST',
          body: JSON.stringify({ rating: picked, body: wrap.querySelector('#rvBody').value.trim() })
        });
        PG.toast(res.message || 'دیدگاه شما ثبت شد', 'success');
        loadReviews(p); // فرم و لیست از نو (حالت «در انتظار تأیید» را نشان می‌دهد)
      } catch (err) {
        PG.toast(err.message || 'ثبت دیدگاه ممکن نشد', 'error');
        btn.disabled = false;
      }
    });
  }

  function renderRelatedCard(p) {
    const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
    const title = PG.esc(p.title);
    const media = p.image
      ? `<img src="${PG.esc(PG.cardImg(p.image))}"${PG.imgSizing(p.image)} alt="${title}" loading="lazy" decoding="async">`
      : `<svg role="img" aria-label="${title}"><use href="#${PG.esc(p.icon)}"/></svg>`;
    return `
      <article class="product-card">
        <a href="/product/${p.id}" class="product-media${p.image ? ' has-image' : ''} d-flex" aria-label="${title}">
          ${p.discountPercent ? `<span class="product-badge off">${PG.money(p.discountPercent)}٪ تخفیف</span>` : (p.badge ? `<span class="product-badge">${PG.esc(p.badge)}</span>` : '')}
          ${PG.wishBtnHtml(p.id)}
          ${media}
        </a>
        <div class="product-body">
          <span class="product-cat">${PG.esc(p.category)}</span>
          <h3 class="product-title"><a href="/product/${p.id}">${title}</a></h3>
          <div class="product-footer">
            ${PG.priceHtml(p)}
            <a class="buy-btn" href="/product/${p.id}" ${outOfStock ? 'aria-disabled="true"' : ''}>
              ${outOfStock ? 'ناموجود' : 'مشاهده'}
            </a>
          </div>
        </div>
      </article>`;
  }
});
