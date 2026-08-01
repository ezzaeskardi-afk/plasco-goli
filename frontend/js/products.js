/* ============================================================
   products.js — صفحه‌ی «همه‌ی محصولات»
   ------------------------------------------------------------
   با ۱۲ محصول، صفحه‌ی اصلی کافی بود. با ۱۰۰ تا دیگر نیست: مشتری
   باید بتواند دسته و قیمت را محدود کند، صفحه عوض کند، و نتیجه را
   برای کسی بفرستد.

   سه تصمیمِ اصلیِ این فایل:

   ۱) آدرس، حافظه‌ی صفحه است.
      همه‌ی حالت (دسته، قیمت، مرتب‌سازی، صفحه) در query string است، پس
      «کپی و ارسالِ لینک» و «دکمه‌ی برگشتِ مرورگر» هر دو رایگان کار
      می‌کنند. اگر حالت را در متغیر نگه می‌داشتیم، لینکی که مشتری برای
      دوستش می‌فرستاد او را به صفحه‌ی اولِ بی‌فیلتر می‌برد.

   ۲) فیلترکردن کارِ سرور است، نه مرورگر.
      کل کاتالوگ دانلود نمی‌شود؛ فقط همان ۲۴ کالای همان صفحه. با ۱۰۰
      محصول شاید فرقی حس نشود، ولی همین کد با ۵۰۰۰ محصول هم همین‌قدر
      سریع می‌ماند و لازم نیست بعداً بازنویسی شود.

   ۳) هر بازطراحیِ فهرست، *فقط* شبکه‌ی مربوط به خودش را نشان می‌دهد.
      درخواست‌ها با یک شماره‌ی ترتیبی مهر می‌شوند و پاسخِ دیرآمده‌ی
      قدیمی دور ریخته می‌شود. بدون این، مشتری که سریع دو دسته را کلیک
      می‌کند ممکن است نتیجه‌ی دسته‌ی اول را زیر عنوان دسته‌ی دوم ببیند.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PER_PAGE = 24;

  const SORT_LABEL = {
    newest: 'جدیدترین', 'price-asc': 'ارزان‌ترین', 'price-desc': 'گران‌ترین',
    title: 'بر اساس نام', stock: 'بیشترین موجودی'
  };

  // حالتِ صفحه. تنها منبعِ راست، همین شیء است و همیشه از آدرس ساخته می‌شود.
  let S = { cat: '', min: null, max: null, inStock: false, sort: 'newest', page: 1, q: '' };
  let FACETS = { minPrice: 0, maxPrice: 0, categories: [] };
  let reqSeq = 0;         // شماره‌ی ترتیبیِ درخواست‌ها (بند ۳ بالا)
  let firstPaint = true;

  // ---------- آدرس ⇄ حالت ----------
  function readUrl() {
    const u = new URLSearchParams(location.search);
    const int = (k) => { const v = parseInt(u.get(k), 10); return Number.isFinite(v) && v >= 0 ? v : null; };
    S = {
      cat: (u.get('cat') || '').slice(0, 40),
      min: int('min'),
      max: int('max'),
      inStock: u.get('inStock') === '1',
      sort: SORT_LABEL[u.get('sort')] ? u.get('sort') : 'newest',
      page: Math.max(1, parseInt(u.get('page'), 10) || 1),
      q: (u.get('q') || '').slice(0, 60)
    };
    // بازه‌ی وارونه («از ۵۰۰ تا ۱۰۰») را همین‌جا صاف می‌کنیم. سرور هم با آن
    // کنار می‌آید (نتیجه‌ی خالی)، ولی مشتری فکر می‌کند سایت خراب است نه
    // اینکه خودش دو عدد را جابه‌جا نوشته.
    if (S.min !== null && S.max !== null && S.min > S.max) { const t = S.min; S.min = S.max; S.max = t; }
  }

  function writeUrl(replace) {
    const u = new URLSearchParams();
    if (S.q) u.set('q', S.q);
    if (S.cat) u.set('cat', S.cat);
    if (S.min !== null) u.set('min', S.min);
    if (S.max !== null) u.set('max', S.max);
    if (S.inStock) u.set('inStock', '1');
    if (S.sort !== 'newest') u.set('sort', S.sort);
    if (S.page > 1) u.set('page', S.page);
    const qs = u.toString();
    const url = location.pathname + (qs ? '?' + qs : '');
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
    syncCanonical(url);
  }

  // یک <link rel="canonical"> که همراه فیلترها به‌روز می‌شود.
  // چرا لازم است: ترکیبِ فیلترها ده‌ها آدرسِ متفاوت می‌سازد که محتوایشان
  // هم‌پوشانی دارد. بدون canonical، گوگل بودجه‌ی خزشش را روی همین‌ها
  // خرج می‌کند و صفحه‌های واقعیِ محصول دیرتر ایندکس می‌شوند.
  function syncCanonical(url) {
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); }
    // فقط دسته و صفحه ارزشِ ایندکس‌شدن دارند؛ قیمت و موجودی حالتِ گذرای
    // یک بازدیدکننده‌اند و نباید آدرسِ مستقل در گوگل بسازند.
    const u = new URLSearchParams();
    if (S.cat) u.set('cat', S.cat);
    if (S.page > 1) u.set('page', S.page);
    const qs = u.toString();
    el.href = location.origin + location.pathname + (qs ? '?' + qs : '');

    // ترکیب‌های عمیقِ فیلتر اصلاً نباید ایندکس شوند
    let rob = document.querySelector('meta[name="robots"]');
    if (!rob) { rob = document.createElement('meta'); rob.name = 'robots'; document.head.appendChild(rob); }
    const deep = S.min !== null || S.max !== null || S.inStock || S.q || S.sort !== 'newest';
    rob.content = deep ? 'noindex, follow' : 'index, follow, max-image-preview:large';
  }

  // ---------- شمردنِ فیلترهای فعال ----------
  function activeFilters() {
    const out = [];
    if (S.q) out.push({ k: 'q', label: `جست‌وجو: «${S.q}»` });
    if (S.cat) out.push({ k: 'cat', label: S.cat });
    if (S.min !== null || S.max !== null) {
      out.push({
        k: 'price',
        label: S.min !== null && S.max !== null ? `${PG.money(S.min)} تا ${PG.money(S.max)} تومان`
          : S.min !== null ? `از ${PG.money(S.min)} تومان` : `تا ${PG.money(S.max)} تومان`
      });
    }
    if (S.inStock) out.push({ k: 'inStock', label: 'فقط موجود' });
    return out;
  }

  // ---------- ساختنِ فیلترها ----------
  function paintFacets() {
    const total = FACETS.categories.reduce((s, c) => s + c.n, 0);
    $('plCats').innerHTML =
      `<li><button type="button" class="pl-cat${S.cat ? '' : ' on'}" data-cat="">
         <svg><use href="#i-package"/></svg><span>همه</span><b>${PG.money(total)}</b></button></li>` +
      FACETS.categories.map(c => `
        <li><button type="button" class="pl-cat${S.cat === c.category ? ' on' : ''}" data-cat="${PG.esc(c.category)}">
          <svg><use href="#${PG.esc(c.icon || 'i-package')}"/></svg>
          <span>${PG.esc(c.category)}</span><b>${PG.money(c.n)}</b>
        </button></li>`).join('');

    $('plMin').value = S.min ?? '';
    $('plMax').value = S.max ?? '';
    $('plInStock').checked = S.inStock;
    $('plSort').value = S.sort;
    if (FACETS.maxPrice) {
      $('plPriceHint').textContent =
        `ارزان‌ترین ${PG.money(FACETS.minPrice)} — گران‌ترین ${PG.money(FACETS.maxPrice)} تومان`;
    }

    const act = activeFilters();
    $('plReset').hidden = act.length === 0;
    $('plFCount').hidden = act.length === 0;
    $('plFCount').textContent = PG.money(act.length);

    const chips = $('plChips');
    chips.hidden = act.length === 0;
    chips.innerHTML = act.map(a =>
      `<button type="button" class="pl-chip" data-clear="${a.k}">${PG.esc(a.label)} <span aria-hidden="true">✕</span><span class="sr-only">حذف این فیلتر</span></button>`
    ).join('');
  }

  // ---------- اسکلتِ بارگذاری ----------
  // چرا اسکلت و نه «در حال بارگذاری…»: ارتفاعِ کارت‌ها از قبل رزرو می‌شود،
  // پس وقتی داده می‌رسد صفحه نمی‌پرد. پرشِ چیدمان همان چیزی است که باعث
  // می‌شود مشتری روی دکمه‌ی اشتباه کلیک کند.
  function paintSkeleton(n) {
    $('plGrid').innerHTML = Array.from({ length: n }, () =>
      `<div class="pl-skel" aria-hidden="true"><div class="pl-skel-media"></div><div class="pl-skel-line"></div><div class="pl-skel-line short"></div></div>`
    ).join('');
    $('plGrid').setAttribute('aria-busy', 'true');
  }

  // ---------- کارتِ محصول ----------
  // عمداً همان ساختار و کلاس‌های کارتِ صفحه‌ی اصلی است تا استایل، «نمای
  // سریع»، دکمه‌ی سبد و قلبِ علاقه‌مندی همگی بدون کدِ تکراری کار کنند.
  function cardHtml(p, eager) {
    const out = typeof p.stock === 'number' && p.stock <= 0;
    const low = typeof p.stock === 'number' && p.stock > 0 && p.stock <= PG.lowStockAt();
    const title = PG.esc(p.title);
    // ردیفِ اول زودتر و با اولویتِ بالا بار می‌شود (همان تصویری که معیارِ
    // LCP گوگل است)؛ بقیه تنبل. width/height ثابت جلوی پرشِ چیدمان را
    // می‌گیرد حتی قبل از رسیدنِ عکس.
    const media = p.image
      ? `<img src="${PG.esc(PG.cardImg(p.image))}" alt="${title}" width="560" height="560"
           ${eager ? 'fetchpriority="high" decoding="sync"' : 'loading="lazy" decoding="async"'}>`
      : `<svg role="img" aria-label="${title}"><use href="#${PG.esc(p.icon || 'i-package')}"/></svg>`;
    // در صفحه‌ی اصلی، کلیک روی عکس «نمای سریع» را باز می‌کند. اینجا عمداً
    // یک لینکِ ساده به صفحه‌ی محصول است: کدِ نمای سریع در main.js است و
    // آوردنش به این صفحه یعنی دو نسخه از یک چیز. مهم‌تر اینکه در یک صفحه‌ی
    // فهرست، مشتری معمولاً دنبالِ رفتن به محصول است نه دیدنِ همان اطلاعات
    // در یک پنجره‌ی کوچک‌تر. لینکِ واقعی هم یعنی «باز کردن در تبِ جدید» و
    // خزیدنِ گوگل هر دو کار می‌کنند.
    return `
    <article class="product-card" data-id="${p.id}">
      <div class="product-media pl-media${p.image ? ' has-image' : ''}">
        ${p.discountPercent ? `<span class="product-badge off">${PG.money(p.discountPercent)}٪ تخفیف</span>`
          : (p.badge ? `<span class="product-badge">${PG.esc(p.badge)}</span>` : '')}
        ${PG.wishBtnHtml(p.id)}
        ${media}
        <a class="pl-media-link" href="/product/${p.id}" aria-label="${title}" tabindex="-1"></a>
      </div>
      <div class="product-body">
        <div class="pc-meta">
          <span class="product-cat">${PG.esc(p.category)}</span>
          ${p.rating && p.rating.count > 0 ? `
          <span class="pc-stars" title="میانگین ${PG.money(p.rating.avg)} از ${PG.money(p.rating.count)} دیدگاه">
            <svg aria-hidden="true"><use href="#i-star"/></svg>${PG.money(p.rating.avg)}
          </span>` : ''}
        </div>
        <h3 class="product-title"><a href="/product/${p.id}">${title}</a></h3>
        <p class="product-desc">${PG.esc(p.description)}</p>
        ${low ? `<span class="stock-hint">فقط ${PG.money(p.stock)} عدد باقی مانده</span>` : ''}
        <div class="product-footer">
          ${PG.priceHtml(p)}
          <button class="buy-btn" data-id="${p.id}" ${out ? 'disabled' : ''} aria-label="${out ? 'ناموجود' : `افزودن ${title} به سبد خرید`}">
            <svg><use href="#i-cart"/></svg> ${out ? 'ناموجود' : 'افزودن به سبد'}
          </button>
        </div>
      </div>
    </article>`;
  }

  // ---------- صفحه‌بندی با شماره ----------
  // چرا شماره و نه «بیشتر ببین»: با ۲۴ کالا در صفحه و صد محصول، مشتری باید
  // بتواند مستقیم برود صفحه‌ی ۴ و بعد همان لینک را دوباره باز کند. دکمه‌ی
  // «بیشتر» این را نمی‌دهد و برای گوگل هم صفحه‌های بعدی نامرئی می‌ماند.
  function pageList(page, pages) {
    const win = 1, out = new Set([1, pages, page]);
    for (let i = page - win; i <= page + win; i++) if (i > 1 && i < pages) out.add(i);
    const nums = [...out].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
    const withGaps = [];
    nums.forEach((n, i) => {
      if (i && n - nums[i - 1] > 1) withGaps.push('…');
      withGaps.push(n);
    });
    return withGaps;
  }

  function paintPager(meta) {
    const pager = $('plPager');
    if (!meta || meta.pages <= 1) { pager.hidden = true; pager.innerHTML = ''; return; }
    const btn = (n, label, cls, dis) =>
      `<button type="button" class="pl-page${cls ? ' ' + cls : ''}" data-page="${n}" ${dis ? 'disabled' : ''}
         ${cls === 'on' ? 'aria-current="page"' : ''}>${label}</button>`;
    pager.innerHTML =
      btn(meta.page - 1, '<svg><use href="#i-chevron-right"/></svg> قبلی', 'nav', meta.page <= 1) +
      pageList(meta.page, meta.pages).map(n =>
        n === '…' ? '<span class="pl-gap">…</span>' : btn(n, PG.money(n), n === meta.page ? 'on' : '')
      ).join('') +
      btn(meta.page + 1, 'بعدی <svg><use href="#i-chevron-left"/></svg>', 'nav', meta.page >= meta.pages);
    pager.hidden = false;
  }

  // ---------- بارگذاری ----------
  async function load(opts = {}) {
    const my = ++reqSeq;
    paintSkeleton(Math.min(PER_PAGE, 12));

    const u = new URLSearchParams({ page: S.page, limit: PER_PAGE, sort: S.sort });
    if (S.q) u.set('q', S.q);
    if (S.cat) u.set('category', S.cat);
    if (S.min !== null) u.set('minPrice', S.min);
    if (S.max !== null) u.set('maxPrice', S.max);
    if (S.inStock) u.set('inStock', '1');

    let d;
    try {
      d = await PG.api('/products?' + u.toString());
    } catch (err) {
      if (my !== reqSeq) return;                     // پاسخِ کهنه؛ نادیده
      $('plGrid').setAttribute('aria-busy', 'false');
      $('plGrid').innerHTML = `
        <div class="pl-empty">
          <svg><use href="#i-alert"/></svg>
          <b>فهرست بالا نیامد</b>
          <p>${PG.esc(err.message)}</p>
          <button class="btn btn-primary btn-sm" type="button" id="plRetry">دوباره امتحان کن</button>
        </div>`;
      const r = $('plRetry'); if (r) r.addEventListener('click', () => load());
      $('plPager').hidden = true;
      $('plCount').textContent = '';
      return;
    }
    if (my !== reqSeq) return;

    const meta = d.meta || { total: d.products.length, page: 1, pages: 1 };

    // سرور صفحه‌ی خارج از محدوده را به آخرین صفحه می‌چسباند (تا مشتری صفحه‌ی
    // خالی نبیند). اگر این اتفاق افتاد، آدرس هم باید همان را بگوید — وگرنه
    // «صفحه‌ی ۹۹» در نوار آدرس می‌ماند و رفرش دوباره همان چرخه را می‌سازد.
    if (meta.page !== S.page) { S.page = meta.page; writeUrl(true); }

    $('plGrid').setAttribute('aria-busy', 'false');
    if (!d.products.length) {
      $('plGrid').innerHTML = `
        <div class="pl-empty">
          <svg><use href="#i-box"/></svg>
          <b>با این فیلترها چیزی پیدا نشد</b>
          <p>می‌توانی یکی از فیلترها را برداری یا همه را پاک کنی.</p>
          <button class="btn btn-primary btn-sm" type="button" id="plEmptyReset">پاک کردن فیلترها</button>
        </div>`;
      const b = $('plEmptyReset');
      if (b) b.addEventListener('click', () => { S = { ...S, cat: '', min: null, max: null, inStock: false, q: '', page: 1 }; apply(); });
    } else {
      // چهار کارتِ اول ردیفِ نخستِ دسکتاپ‌اند؛ همان‌ها eager می‌شوند.
      $('plGrid').innerHTML = d.products.map((p, i) => cardHtml(p, i < 4)).join('');
    }

    const fuzzyNote = meta.fuzzy
      ? ` — چیزی دقیقاً به این نام نبود؛ نزدیک‌ترین‌ها را می‌بینی${meta.suggestion ? `. شاید منظورت «${PG.esc(meta.suggestion)}» بود` : ''}`
      : '';
    $('plCount').innerHTML = meta.total
      ? `<b>${PG.money(meta.total)}</b> کالا${meta.pages > 1 ? ` · صفحه‌ی ${PG.money(meta.page)} از ${PG.money(meta.pages)}` : ''}${fuzzyNote}`
      : '';

    const act = activeFilters();
    $('plTitle').textContent = S.cat || (S.q ? `نتیجه‌ی جست‌وجوی «${S.q}»` : 'همه‌ی محصولات');
    $('plCrumb').textContent = S.cat || 'همه‌ی محصولات';
    document.title = `${S.cat || 'همه‌ی محصولات'}${meta.pages > 1 ? ` — صفحه ${meta.page}` : ''} | پلاسکو گلی`;
    $('plSub').textContent = act.length
      ? `${PG.money(meta.total)} کالا با فیلترِ ${act.map(a => a.label).join(' + ')}`
      : `${PG.money(meta.total)} کالا در فروشگاه — مرتب‌شده بر اساس ${SORT_LABEL[S.sort]}`;

    paintPager(meta);
    paintFacets();
    PG.syncWishHearts();

    // بعد از عوض‌کردنِ صفحه، بالای فهرست برو — ولی نه در بارگذاریِ اول،
    // چون آن‌وقت لینکی که کسی با #anchor فرستاده پرت می‌شود.
    if (opts.scroll && !firstPaint) {
      document.querySelector('.pl-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    firstPaint = false;
  }

  function apply(opts) { writeUrl(false); load(opts); }

  // ---------- افزودن به سبد ----------
  // قلبِ علاقه‌مندی را common.js سراسری گرفته، ولی دکمه‌ی سبد در main.js است
  // که این صفحه بارش نمی‌کند. همان رفتار اینجا تکرار می‌شود: دکمه قفل شود،
  // «اضافه شد» نشان دهد و برگردد — بدون این، مشتری چون چیزی تغییر نمی‌کند
  // دوباره می‌زند و دو عدد در سبدش می‌رود.
  $('plGrid').addEventListener('click', async (e) => {
    const btn = e.target.closest('.buy-btn');
    if (!btn || btn.disabled) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = '<svg><use href="#i-cart"/></svg> در حال افزودن…';
    try {
      await PG.addToCart(Number(btn.dataset.id), 1);
      btn.classList.remove('is-loading');
      btn.classList.add('is-added');
      btn.innerHTML = '<svg><use href="#i-check"/></svg> اضافه شد';
      setTimeout(() => {
        btn.classList.remove('is-added');
        btn.innerHTML = original;
        btn.disabled = false;
      }, 1200);
    } catch (err) {
      PG.toast(err.message || 'خطا در افزودن به سبد', 'error');
      btn.classList.remove('is-loading');
      btn.innerHTML = original;
      btn.disabled = false;
    }
  });

  // ---------- رویدادها ----------
  $('plCats').addEventListener('click', (e) => {
    const b = e.target.closest('.pl-cat'); if (!b) return;
    S.cat = b.dataset.cat; S.page = 1;
    closeSide();
    apply({ scroll: true });
  });

  $('plSort').addEventListener('change', (e) => { S.sort = e.target.value; S.page = 1; apply({ scroll: true }); });
  $('plInStock').addEventListener('change', (e) => { S.inStock = e.target.checked; S.page = 1; apply({ scroll: true }); });

  function applyPrice() {
    const g = (el) => { const v = parseInt(el.value, 10); return Number.isFinite(v) && v >= 0 ? v : null; };
    S.min = g($('plMin')); S.max = g($('plMax'));
    if (S.min !== null && S.max !== null && S.min > S.max) { const t = S.min; S.min = S.max; S.max = t; }
    S.page = 1; closeSide(); apply({ scroll: true });
  }
  $('plPriceApply').addEventListener('click', applyPrice);
  ['plMin', 'plMax'].forEach(id => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') applyPrice(); }));

  $('plChips').addEventListener('click', (e) => {
    const c = e.target.closest('.pl-chip'); if (!c) return;
    const k = c.dataset.clear;
    if (k === 'price') { S.min = null; S.max = null; }
    else if (k === 'inStock') S.inStock = false;
    else S[k] = '';
    S.page = 1; apply({ scroll: true });
  });

  $('plReset').addEventListener('click', () => {
    S = { cat: '', min: null, max: null, inStock: false, sort: 'newest', page: 1, q: '' };
    closeSide(); apply({ scroll: true });
  });

  $('plPager').addEventListener('click', (e) => {
    const b = e.target.closest('.pl-page'); if (!b || b.disabled) return;
    const n = parseInt(b.dataset.page, 10);
    if (!Number.isFinite(n) || n === S.page) return;
    S.page = n; apply({ scroll: true });
  });

  // دکمه‌ی برگشتِ مرورگر: چون همه‌چیز در آدرس است، فقط کافی است دوباره بخوانیم
  window.addEventListener('popstate', () => { readUrl(); load(); });

  // قلابی برای منوی دسته‌بندیِ هدر (common.js). فقط روی همین صفحه تعریف
  // می‌شود؛ در بقیه‌ی صفحه‌ها وجود ندارد و منو لینکِ عادی را دنبال می‌کند.
  // بدون این، کلیک روی دسته در هدرِ همین صفحه کلِ صفحه را دوباره بار می‌کرد.
  window.PL_setCat = (cat) => {
    S.cat = cat || ''; S.page = 1;
    closeSide();
    apply({ scroll: true });
  };

  // ---------- کشوی فیلتر در موبایل ----------
  function openSide() {
    $('plSide').classList.add('open'); $('plBackdrop').hidden = false;
    document.body.classList.add("qv-lock");
    $('plSideClose').focus();
  }
  function closeSide() {
    $('plSide').classList.remove('open'); $('plBackdrop').hidden = true;
    document.body.classList.remove("qv-lock");
  }
  $('plFilterBtn').addEventListener('click', openSide);
  $('plSideClose').addEventListener('click', closeSide);
  $('plBackdrop').addEventListener('click', closeSide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSide(); });

  // ---------- شروع ----------
  (async function init() {
    readUrl();
    syncCanonical(location.pathname + location.search);
    paintSkeleton(12);
    // فیلترها و فهرست را موازی می‌گیریم؛ منتظرِ ترتیبی ماندن یک رفت‌وبرگشتِ
    // اضافه به زمانِ دیدنِ صفحه اضافه می‌کرد.
    const facetsP = PG.api('/products/facets').catch(() => null);
    const listP = load();
    const f = await facetsP;
    if (f) { FACETS = f; paintFacets(); }
    await listP;
  })();
})();
