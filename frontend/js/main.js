// main.js — صفحه‌ی اصلی: بارگذاری محصولات + فیلتر دسته‌بندی/قیمت + مرتب‌سازی + جستجو

let PAGE_ITEMS = [];     // فقط کالاهای همین صفحه — نمای سریع از همین می‌خواند
let CATEGORIES = [];     // از /products/facets می‌آید، بدون دانلود کل کاتالوگ
// تعدادِ کالای هر دسته و کلِ کاتالوگ، از همان facets.
// عمداً از facets و نه از meta.total پاسخِ محصولات: meta.total تعدادِ کالای
// *فیلترشده* است (قیمت و جستجو هم رویش اثر دارد)، ولی دکمه‌ی «همه‌ی محصولات»
// به صفحه‌ای می‌رود که آن فیلترها را ندارد. اگر عددِ فیلترشده را روی دکمه
// بنویسیم، کاربر روی «۲ محصول» کلیک می‌کند و ۱۲ تا می‌بیند.
let CAT_COUNTS = new Map();
let CATALOG_TOTAL = 0;
let ACTIVE_CAT = 'همه';
let SEARCH_QUERY = '';
let SORT_BY = 'default';
let PRICE_MIN = null;
let PRICE_MAX = null;

// صفحه‌بندی سروری: هر بار فقط ۱۲ کالا از دیتابیس بیرون می‌آید، نه کل جدول.
// با چند هزار محصول هم بارگذاری اول همان‌قدر سبک می‌ماند.
const PAGE_SIZE = 12;
let CUR_PAGE = 1;
let TOTAL = 0;
let HAS_MORE = false;
let LAST_FILTER_SIG = '';
let FETCH_SEQ = 0;       // شماره‌ی درخواست؛ جوابِ دیررسِ فیلتر قبلی دور ریخته می‌شود

// نام مرتب‌سازی در فرانت ← نام معادلش در سرور
const SORT_MAP = {
  default: 'oldest',        // ترتیب اصلی ویترین (id صعودی)
  cheap: 'price-asc',
  expensive: 'price-desc',
  newest: 'newest',
  name: 'title'
};

document.addEventListener('DOMContentLoaded', () => initOrderTracking());

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  // اسکلت لودینگ تا رسیدن پاسخ سرور
  grid.innerHTML = skeletonHtml();

  // فقط دسته‌ها و بازه‌ی قیمت را می‌گیریم — چند بایت، به‌جای دانلود کل کاتالوگ
  try {
    const facets = await PG.api('/products/facets');
    // facets آیتم‌ها را به شکل {category, n} می‌دهد و رویداد pg:cats به شکل {name} —
    // هر دو را می‌پذیریم تا این تفاوت بی‌سروصدا لیست دسته‌ها را خالی نکند
    CATEGORIES = (facets.categories || [])
      .map(c => (typeof c === 'string' ? c : (c.category || c.name)))
      .filter(Boolean);
    // شمارشِ هر دسته را هم برمی‌داریم (اگر سرور داده باشد) تا دکمه‌ی پایینِ
      // بخش عددِ درست بگوید. جمعِ دسته‌ها = کلِ کاتالوگِ منتشرشده.
    CAT_COUNTS = new Map();
    for (const c of (facets.categories || [])) {
      if (c && typeof c === 'object' && Number.isFinite(c.n)) {
        CAT_COUNTS.set(c.category || c.name, c.n);
      }
    }
    CATALOG_TOTAL = [...CAT_COUNTS.values()].reduce((a, b) => a + b, 0);
    buildFilterPills(CATEGORIES);
  } catch (e) { /* بدون قرص‌های دسته هم ویترین باید بالا بیاید */ }
  syncAllProductsCta();
  initFilterToolbar();

  // اگر از صفحه‌ی دیگری با ?cat= یا ?q= آمدیم، همان فیلتر اعمال شود
  const params = new URLSearchParams(location.search);
  const cat = params.get('cat');
  const q = params.get('q');
  if (cat && CATEGORIES.includes(cat)) ACTIVE_CAT = cat;
  if (q) {
    SEARCH_QUERY = q;
    const input = document.getElementById('siteSearch');
    if (input) input.value = q;
  }
  syncPills();
  await renderGrid();
  // دیتای ساخت‌یافته از همان صفحه‌ی اول ساخته می‌شود (گوگل به کل کاتالوگ نیاز ندارد)
  injectProductSchema(PAGE_ITEMS);
  if (cat || q) document.getElementById('products')?.scrollIntoView();

  // نکته: این شنونده روی *document* بسته می‌شود، نه روی خودِ گرید.
  // چرا عوض شد: گرید دومی هم داریم («اخیراً دیده‌اید») که کارت‌هایش دقیقاً
  // همان ساختار را دارند. اگر شنونده فقط روی #productGrid می‌ماند، دکمه‌ی
  // «افزودن به سبد» و «نمای سریع» آن کارت‌ها ظاهر داشتند و هیچ کاری نمی‌کردند —
  // بدترین نوع باگ، چون هیچ خطایی هم جایی دیده نمی‌شود.
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#productGrid, #recentGrid')) return;
    // دکمه‌ی «نمایش همه‌ی محصولات» در حالت خالی (سازگار با CSP، بدون onclick درون‌خطی)
    if (e.target.closest('[data-reset-filters]')) {
      resetFilters();
      return;
    }
    // تلاش دوباره بعد از خطای شبکه: فقط همان درخواست تکرار می‌شود، نه کل صفحه
    const retryBtn = e.target.closest('[data-retry-products]');
    if (retryBtn) {
      retryBtn.disabled = true;
      retryBtn.textContent = 'در حال تلاش…';
      renderGrid();
      return;
    }
    const btn = e.target.closest('.buy-btn');
    if (btn) {
      if (btn.disabled) return;
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.innerHTML = '<svg><use href="#i-cart"/></svg> در حال افزودن…';
      try {
        await PG.addToCart(Number(btn.dataset.id), 1);
        // بازخورد کوتاه موفقیت روی خود دکمه
        btn.classList.remove('is-loading');
        btn.classList.add('is-added');
        btn.innerHTML = '<svg><use href="#i-check"/></svg> اضافه شد';
        flyToCart(btn);
        setTimeout(() => {
          btn.classList.remove('is-added');
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }, 1200);
      } catch (err) {
        PG.toast(err.message || 'خطا در افزودن به سبد', 'error');
        btn.classList.remove('is-loading');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
      return;
    }
    // کلیک روی قلب را common.js مدیریت می‌کند — نمای سریع باز نشود
    if (e.target.closest('.wish-btn')) return;
    // کلیک روی عکس → نمای سریع (عنوان، لینک صفحه‌ی کامل محصول است)
    const zone = e.target.closest('.product-media');
    if (zone) {
      const card = zone.closest('.product-card');
      const id = Number(card?.dataset.id);
      // در هر دو فهرست می‌گردیم: کالای بخش «اخیراً دیده‌اید» در PAGE_ITEMS نیست
      const product = PAGE_ITEMS.find(p => p.id === id) || RECENT_ITEMS.find(p => p.id === id);
      if (product) openQuickView(product);
    }
  });

  // کارت‌های دسته‌بندی دیگر «فیلترِ ویترین» نیستند؛ لینکِ واقعی به صفحه‌ی
  // فهرستِ همان دسته‌اند و خودِ href کارش را می‌کند.
  //
  // چرا عوض شد: تا وقتی کل فروشگاه ۱۲ محصول بود، فیلترکردنِ همین ویترین
  // یعنی دیدنِ کلِ آن دسته. حالا که دسته‌ها ۱۲ تا ۲۱ کالا دارند و ویترین
  // ۱۲تایی است، مشتری بخشی از دسته را می‌دید و فکر می‌کرد تمامش همین است.
  // فرقشان با «قرص»های بالای ویترین هم روشن است: قرص‌ها همین ویترین را
  // مرتب می‌کنند، کارت‌ها تو را به فهرستِ کامل می‌برند.

  // کارت‌های دسته‌بندی صفحه‌ی اصلی از جدول دسته‌ها ساخته می‌شوند (پنل ← انبار و کالا)
  document.addEventListener('pg:cats', (e) => {
    if (!e.detail?.length) return;
    // شبکه‌ی ایمنی: اگر facets نرسیده بود، لیست دسته‌ها را از همین رویداد بردار
    if (!CATEGORIES.length) {
      CATEGORIES = e.detail.map(c => c.name);
      buildFilterPills(CATEGORIES);
      syncPills();
    }
    const grid = document.querySelector('.cat-grid');
    if (!grid) return;
    grid.innerHTML = e.detail.map(c => `
      <a class="cat-card" href="/products.html?cat=${encodeURIComponent(c.name)}" data-cat="${PG.esc(c.name)}">
        <span class="cat-icon"><svg><use href="#${PG.esc(c.icon)}"/></svg></span>
        <span>${PG.esc(c.name)}</span>
      </a>`).join('');
  });
});

function buildFilterPills(categories) {
  const host = document.getElementById('filterPills');
  if (!host) return;
  const cats = ['همه', ...categories];
  host.innerHTML = cats.map(cat => `
    <button class="pill${cat === ACTIVE_CAT ? ' active' : ''}" data-cat="${PG.esc(cat)}" role="tab" aria-selected="${cat === ACTIVE_CAT}">${PG.esc(cat)}</button>
  `).join('');
  // ممکن است دوباره ساخته شود (مسیر جایگزین pg:cats)؛ listener نباید تکرار شود
  if (!host.dataset.bound) {
    host.dataset.bound = '1';
    host.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      setActiveCat(pill.dataset.cat);
    });
  }
}

function syncPills() {
  document.querySelectorAll('#filterPills .pill').forEach(p => {
    const on = p.dataset.cat === ACTIVE_CAT;
    p.classList.toggle('active', on);
    p.setAttribute('aria-selected', on);
  });
}

function setActiveCat(cat) {
  ACTIVE_CAT = cat;
  syncPills();
  renderGrid();
}
// در دسترس منوی دسته‌بندی هدر (common.js)
window.setActiveCat = setActiveCat;

// جستجوی زنده: از باکس جستجوی هدر صدا زده می‌شود
// حالا هر جستجو یک درخواست سرور است، پس تایپِ زنده دبونس می‌شود تا برای هر
// حرف یک کوئری روی دیتابیس نخورد. Enter و انتخاب پیشنهاد همان‌لحظه اجرا می‌شوند.
let SEARCH_T;
function applySearch(q, opts = {}) {
  const next = String(q || '').trim();
  clearTimeout(SEARCH_T);
  if (next === SEARCH_QUERY) {
    // عبارت عوض نشده؛ فقط اگر کاربر Enter زده، ویترین را جلوی چشمش بیاور
    if (!opts.quiet) document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  SEARCH_QUERY = next;
  if (opts.quiet) {
    SEARCH_T = setTimeout(() => renderGrid(), 300);
    return;
  }
  renderGrid();
  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
}
window.applySearch = applySearch;

// همه‌ی فیلترها به query string ترجمه می‌شوند. جستجو، دسته، بازه‌ی قیمت،
// مرتب‌سازی و قانون «ناموجودها ته لیست» حالا داخل SQL انجام می‌شود نه مرورگر.
function buildQuery(page) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(PAGE_SIZE));
  params.set('sort', SORT_MAP[SORT_BY] || 'oldest');
  if (SEARCH_QUERY) params.set('q', SEARCH_QUERY);
  if (ACTIVE_CAT && ACTIVE_CAT !== 'همه') params.set('category', ACTIVE_CAT);
  if (PRICE_MIN != null) params.set('minPrice', String(PRICE_MIN));
  if (PRICE_MAX != null) params.set('maxPrice', String(PRICE_MAX));
  return params.toString();
}

// امضای فیلترها؛ با هر تغییرش صفحه‌شماری از یک شروع می‌شود
function filterSig() {
  return `${ACTIVE_CAT}|${SEARCH_QUERY}|${SORT_BY}|${PRICE_MIN}|${PRICE_MAX}`;
}

// اسکلت لودینگ — هم در بار اول و هم موقع عوض‌شدن فیلتر استفاده می‌شود
function skeletonHtml(n = 8) {
  return Array.from({ length: n }).map(() => `
    <div class="sk-card" aria-hidden="true">
      <div class="sk sk-media"></div>
      <div class="sk-body">
        <div class="sk sk-line w60"></div>
        <div class="sk sk-line w80"></div>
        <div class="sk sk-line"></div>
      </div>
    </div>
  `).join('');
}

// ---------- نوار ابزار مرتب‌سازی و محدوده‌ی قیمت ----------
function initFilterToolbar() {
  const sortSelect = document.getElementById('sortSelect');
  const minInput = document.getElementById('priceMin');
  const maxInput = document.getElementById('priceMax');
  const clearBtn = document.getElementById('priceClear');
  if (!sortSelect || !minInput || !maxInput) return;

  sortSelect.addEventListener('change', () => {
    SORT_BY = sortSelect.value;
    renderGrid();
  });

  // ---------- دراپ‌داون سفارشی به‌جای لیست سفید مرورگر ----------
  // لیست بازشوی <select> با تم سیستم کشیده می‌شود و وسط تم تیره سفید می‌زند.
  // select اصلی مخفی (ولی زنده) می‌ماند و همین نسخه‌ی سفارشی جایش می‌نشیند؛
  // هر انتخابی مستقیم روی select اعمال و رویداد change همان مسیر قبلی را می‌رود.
  (function buildCustomSort() {
    const options = Array.from(sortSelect.options);
    const wrap = document.createElement('div');
    wrap.className = 'csel';
    wrap.innerHTML = `
      <button type="button" class="csel-btn" id="sortBtn" aria-haspopup="listbox" aria-expanded="false">
        <span class="csel-label">${PG.esc(sortSelect.selectedOptions[0]?.textContent || '')}</span>
        <svg class="chev"><use href="#i-chevron-down"/></svg>
      </button>
      <ul class="csel-list" role="listbox" aria-label="مرتب‌سازی محصولات" tabindex="-1">
        ${options.map(o => `<li role="option" data-value="${PG.esc(o.value)}"
            aria-selected="${o.selected}">${PG.esc(o.textContent)}</li>`).join('')}
      </ul>`;
    sortSelect.hidden = true;
    sortSelect.insertAdjacentElement('afterend', wrap);
    // لیبل «مرتب‌سازی» از این به بعد به دکمه اشاره کند نه select مخفی
    document.querySelector('label[for="sortSelect"]')?.setAttribute('for', 'sortBtn');

    const btn = wrap.querySelector('.csel-btn');
    const labelEl = wrap.querySelector('.csel-label');
    const list = wrap.querySelector('.csel-list');
    const items = Array.from(list.querySelectorAll('li'));
    let focusIdx = Math.max(0, options.findIndex(o => o.selected));

    function paintFocus() {
      items.forEach((li, i) => li.classList.toggle('focused', i === focusIdx));
      items[focusIdx]?.scrollIntoView({ block: 'nearest' });
    }
    function openList() {
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      focusIdx = Math.max(0, items.findIndex(li => li.getAttribute('aria-selected') === 'true'));
      paintFocus();
      list.focus();
    }
    function closeList(refocus = false) {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    }
    function choose(idx) {
      const li = items[idx];
      if (!li) return;
      sortSelect.value = li.dataset.value;
      sortSelect.dispatchEvent(new Event('change'));   // همان مسیر SORT_BY + renderGrid
      closeList(true);
    }
    // هر تغییری روی select (از هر جا، مثل resetFilters) → ظاهر سفارشی همگام می‌شود
    function syncFromSelect() {
      const cur = sortSelect.value;
      items.forEach(li => li.setAttribute('aria-selected', String(li.dataset.value === cur)));
      labelEl.textContent = sortSelect.selectedOptions[0]?.textContent || '';
    }
    sortSelect.addEventListener('change', syncFromSelect);

    btn.addEventListener('click', () => wrap.classList.contains('open') ? closeList() : openList());
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(); }
    });
    items.forEach((li, i) => {
      li.addEventListener('click', () => choose(i));
      li.addEventListener('mousemove', () => { focusIdx = i; paintFocus(); });
    });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(items.length - 1, focusIdx + 1); paintFocus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusIdx = Math.max(0, focusIdx - 1); paintFocus(); }
      else if (e.key === 'Home') { e.preventDefault(); focusIdx = 0; paintFocus(); }
      else if (e.key === 'End') { e.preventDefault(); focusIdx = items.length - 1; paintFocus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(focusIdx); }
      else if (e.key === 'Escape' || e.key === 'Tab') { closeList(true); }
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closeList(); });
  })();

  // ورودی قیمت: رقم فارسی هم قبول می‌شود، سه‌رقم سه‌رقم جدا نمایش داده می‌شود
  function parsePrice(v) {
    const digits = String(v || '')
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  }
  function formatInput(input) {
    const n = parsePrice(input.value);
    input.value = n != null ? n.toLocaleString('fa-IR') : '';
    return n;
  }

  let t;
  function applyPrice() {
    PRICE_MIN = parsePrice(minInput.value);
    PRICE_MAX = parsePrice(maxInput.value);
    // اگر جای «از» و «تا» برعکس وارد شد، خودمان درستش می‌کنیم
    if (PRICE_MIN != null && PRICE_MAX != null && PRICE_MIN > PRICE_MAX) {
      [PRICE_MIN, PRICE_MAX] = [PRICE_MAX, PRICE_MIN];
    }
    clearBtn?.classList.toggle('hidden', PRICE_MIN == null && PRICE_MAX == null);
    renderGrid();
  }
  [minInput, maxInput].forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(applyPrice, 350);
    });
    input.addEventListener('blur', () => { formatInput(input); applyPrice(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); formatInput(input); applyPrice(); } });
  });

  clearBtn?.addEventListener('click', () => {
    minInput.value = ''; maxInput.value = '';
    applyPrice();
  });
}

function updateResultCount(n, fuzzy = false) {
  const el = document.getElementById('ftResult');
  if (!el) return;
  // سرور می‌گوید عبارت دقیق پیدا نشد و این‌ها نزدیک‌ترین‌ها هستند
  if (fuzzy && SEARCH_QUERY) {
    el.textContent = `چیزی دقیقاً با «${SEARCH_QUERY}» نبود؛ نزدیک‌ترین‌ها را آوردیم`;
    return;
  }
  const filtered = SEARCH_QUERY || ACTIVE_CAT !== 'همه' || PRICE_MIN != null || PRICE_MAX != null;
  // فقط وقتی فیلتری فعال است عدد معنا دارد («۳ محصول پیدا شد»)؛
  // در حالت عادی شمردن کل ویترین فایده‌ای برای مشتری ندارد.
  el.textContent = filtered ? `${PG.money(n)} محصول پیدا شد` : '';
}

// «نتیجه‌ی نزدیک» دیگر درخواست جداگانه لازم ندارد: همان روت صفحه‌بندی، وقتی
// عبارت دقیق پیدا نشود، خودش نزدیک‌ترین‌ها را با meta.fuzzy=true برمی‌گرداند.

async function renderGrid(opts = {}) {
  const append = opts.append === true;
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  // اگر فیلتر/جستجو/مرتب‌سازی عوض شد، صفحه‌شماری از اول شروع می‌شود
  const sig = filterSig();
  if (sig !== LAST_FILTER_SIG) {
    LAST_FILTER_SIG = sig;
    CUR_PAGE = 1;
  }
  // یک جای واحد برای هماهنگ‌کردنِ دکمه‌ی پایینِ بخش: هر تغییرِ فیلتر از همین‌جا
  // رد می‌شود، پس هیچ مسیری (خطا، خالی، موفق) از قلم نمی‌افتد.
  syncAllProductsCta();

  // هر درخواست شماره می‌گیرد؛ اگر کاربر وسط راه فیلتر را عوض کند،
  // جوابِ دیررسِ درخواست قبلی نباید ویترین را عوض کند.
  const seq = ++FETCH_SEQ;

  const moreBtn = document.getElementById('loadMoreBtn');
  if (append && moreBtn) {
    moreBtn.disabled = true;
    moreBtn.textContent = 'در حال بارگذاری…';
  } else if (!append) {
    grid.innerHTML = skeletonHtml(Math.min(PAGE_SIZE, 8));
    removeLoadMore();
  }

  let data;
  try {
    data = await PG.api(`/products?${buildQuery(CUR_PAGE)}`);
  } catch (e) {
    if (seq !== FETCH_SEQ) return;
    if (append) {                 // صفحه‌ی بعد نیامد؛ همان‌جا که بودیم می‌مانیم
      CUR_PAGE = Math.max(1, CUR_PAGE - 1);
      syncLoadMore();
      PG.toast('بارگذاری محصولات بیشتر ناموفق بود؛ دوباره تلاش کنید', 'error');
      return;
    }
    // «صفحه را رفرش کنید» جواب درستی نیست: رفرش همان درخواستِ شکست‌خورده را
    // دوباره می‌زند و تازه سبد و فیلترها هم از دست می‌رود. دکمه‌ی تلاش دوباره
    // فقط همین یک درخواست را تکرار می‌کند و پیام هم می‌گوید مشکل از کجاست.
    grid.innerHTML = `
      <div class="grid-empty">
        <svg class="ic-44 txt-coral"><use href="#i-alert"/></svg>
        <p>${PG.esc(e.message || 'در حال حاضر امکان بارگذاری محصولات نیست.')}</p>
        <button class="btn btn-outline" data-retry-products>تلاش دوباره</button>
      </div>`;
    updateResultCount(0);
    removeLoadMore();
    return;
  }
  if (seq !== FETCH_SEQ) return;   // این جواب مالِ فیلتر قبلی بود

  const items = data.products || [];
  const meta = data.meta || {};
  TOTAL = Number.isFinite(meta.total) ? meta.total : items.length;
  HAS_MORE = Boolean(meta.hasMore);
  PAGE_ITEMS = append ? [...PAGE_ITEMS, ...items] : items;

  if (!PAGE_ITEMS.length) {
    grid.innerHTML = `
      <div class="grid-empty">
        <svg class="ic-44 txt-gold"><use href="#i-search"/></svg>
        <p>${SEARCH_QUERY ? `محصولی مطابق «${PG.esc(SEARCH_QUERY)}» پیدا نشد.` : (PRICE_MIN != null || PRICE_MAX != null) ? 'در این محدوده‌ی قیمت محصولی پیدا نشد.' : 'در این دسته فعلاً محصولی موجود نیست.'}</p>
        <button class="btn btn-outline" data-reset-filters>نمایش همه‌ی محصولات</button>
      </div>`;
    updateResultCount(0);
    removeLoadMore();
    return;
  }

  updateResultCount(TOTAL, meta.fuzzy);

  const oldCount = grid.querySelectorAll('.product-card').length;
  grid.innerHTML = PAGE_ITEMS.map(renderProductCard).join('');
  syncLoadMore();
  PG.syncWishHearts();
  // کارت‌های تازه‌آمده پلکانی وارد می‌شوند؛ اگر «نمایش بیشتر» زده شده
  // فقط همان کارت‌های جدید انیمیشن می‌گیرند نه کل گرید
  animateCards(grid, append ? oldCount : 0);
}

// دکمه‌ی ثابتِ «مشاهده‌ی همه‌ی محصولات» زیر گرید (در index.html است، نه اینجا).
// اینجا فقط متن و آدرسش را با وضعیتِ فعلی هماهنگ می‌کنیم:
//   • عددِ واقعی بگذاریم، چون «۱۰۰ کالا» خیلی قانع‌کننده‌تر از «همه» است
//   • اگر دسته‌ای فعال است، همان دسته را در فهرست هم باز کنیم
// هیچ‌وقت مخفی نمی‌شود: حتی وقتی همه‌ی کالاها همین‌جا نشان داده شده‌اند، صفحه‌ی
// فهرست چیزی دارد که این بخش ندارد — فیلترِ ترکیبی و آدرسِ قابلِ اشتراک.
function syncAllProductsCta() {
  const link = document.getElementById('allProductsCta');
  const label = document.getElementById('allProductsCtaText');
  if (!link || !label) return;
  const cat = ACTIVE_CAT && ACTIVE_CAT !== 'همه' ? ACTIVE_CAT : '';
  link.href = `/products.html${cat ? `?cat=${encodeURIComponent(cat)}` : ''}`;

  // عدد فقط وقتی نوشته می‌شود که واقعاً بدانیمش و مثبت باشد؛ «۰ کالا» روی
  // دکمه بدتر از ننوشتنِ عدد است (مثلاً وقتی facets نیامده باشد).
  const n = cat ? (CAT_COUNTS.get(cat) || 0) : CATALOG_TOTAL;
  if (cat) {
    label.textContent = n ? `دیدنِ همه‌ی ${PG.money(n)} کالای «${cat}»` : `دیدنِ همه‌ی کالاهای «${cat}»`;
  } else {
    label.textContent = n ? `مشاهده‌ی همه‌ی ${PG.money(n)} محصول` : 'مشاهده‌ی همه‌ی محصولات';
  }
}

// ---------- ورود پلکانی کارت‌ها ----------
// اصل کار: حالت مخفی فقط با JS اضافه می‌شود و یک تایمر ایمنی هم دارد،
// پس حتی اگر IntersectionObserver یا transitionend کار نکند،
// کارت‌ها حتماً دیده می‌شوند. (باگ قدیمیِ «کارت‌های نامرئی» دیگر تکرار نمی‌شود.)
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateCards(grid, startIndex = 0) {
  if (REDUCED_MOTION) return;
  const cards = [...grid.querySelectorAll('.product-card')].slice(startIndex);
  if (!cards.length) return;

  cards.forEach(c => c.classList.add('pc-enter'));

  // در فریم بعد کلاس ورود گذاشته می‌شود تا مرورگر حالت اولیه را ثبت کند
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cards.forEach((card, i) => {
        const delay = Math.min(i, 11) * 55; // سقف تأخیر، تا ردیف‌های پایین لفت ندهند
        card.style.transitionDelay = `${delay}ms`;
        card.classList.remove('pc-enter');
        card.classList.add('pc-in');
      });
    });
  });

  // شبکه‌ی ایمنی: بعد از یک ثانیه هرچه مانده به حالت عادی برگردد
  clearTimeout(animateCards._t);
  animateCards._t = setTimeout(() => {
    grid.querySelectorAll('.product-card').forEach(c => {
      c.classList.remove('pc-enter');
      c.classList.add('pc-in');
      c.style.transitionDelay = '';
    });
  }, 1000);
}

// ---------- پرواز محصول به سمت سبد خرید ----------
// یک دایره‌ی کوچک از روی کارت به آیکون سبد پرواز می‌کند تا کاربر
// مطمئن شود کالا واقعاً به سبد رفته. اگر چیزی سر جایش نبود، بی‌سروصدا رد می‌شود.
function flyToCart(fromEl) {
  if (REDUCED_MOTION) return;
  try {
    const card = fromEl.closest('.product-card');
    const media = card?.querySelector('.product-media');
    // روی موبایل آیکون سبد در نوار پایین است
    const target = [...document.querySelectorAll('.cart-count')]
      .map(el => el.closest('a,button') || el)
      .find(el => el.getBoundingClientRect().width > 0);
    if (!media || !target) return;

    const a = media.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const dot = document.createElement('span');
    dot.className = 'fly-dot';
    dot.style.cssText =
      `left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px;`;
    const img = media.querySelector('img');
    if (img) dot.style.backgroundImage = `url("${img.src}")`;
    document.body.appendChild(dot);

    const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    requestAnimationFrame(() => {
      dot.style.transform = `translate(${dx}px, ${dy}px) scale(.18)`;
      dot.style.opacity = '.15';
    });
    setTimeout(() => dot.remove(), 800);
  } catch (e) { /* افکت تزئینی است؛ هیچ‌وقت نباید خرید را خراب کند */ }
}

// دکمه‌ی «نمایش محصولات بیشتر» زیر گرید — فقط وقتی محصول دیده‌نشده‌ای مانده باشد.
//
// لینکِ «یا همه را با فیلتر ببین» که قبلاً از صفحه‌ی دوم به بعد اینجا ساخته
// می‌شد حذف شد: حالا دکمه‌ی ثابتِ #allProductsCta همیشه پایینِ بخش هست و همان
// کار را از همان اولین نگاه می‌کند. دو تا لینک به یک مقصد، درست زیر هم، فقط
// تصمیم‌گیری را سخت می‌کرد.
function syncLoadMore() {
  const grid = document.getElementById('productGrid');
  let btn = document.getElementById('loadMoreBtn');
  if (!HAS_MORE) { removeLoadMore(); return; }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'loadMoreBtn';
    btn.className = 'btn btn-outline load-more-btn';
    btn.addEventListener('click', () => {
      CUR_PAGE++;
      renderGrid({ append: true });
    });
    grid.insertAdjacentElement('afterend', btn);
  }
  btn.disabled = false;
  const left = Math.max(0, TOTAL - PAGE_ITEMS.length);
  btn.textContent = `نمایش محصولات بیشتر (${PG.money(left)} محصول دیگر)`;
}

function removeLoadMore() {
  document.getElementById('loadMoreBtn')?.remove();
}

function resetFilters() {
  SEARCH_QUERY = '';
  PRICE_MIN = null;
  PRICE_MAX = null;
  SORT_BY = 'default';
  const input = document.getElementById('siteSearch');
  if (input) input.value = '';
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect && sortSelect.value !== 'default') {
    sortSelect.value = 'default';
    // رویداد change لازم است تا لیبل دراپ‌داون سفارشی هم همگام شود
    sortSelect.dispatchEvent(new Event('change'));
  }
  const minInput = document.getElementById('priceMin');
  const maxInput = document.getElementById('priceMax');
  if (minInput) minInput.value = '';
  if (maxInput) maxInput.value = '';
  document.getElementById('priceClear')?.classList.add('hidden');
  setActiveCat('همه');
}
window.resetFilters = resetFilters;

// «حرف مشتری‌ها» — نظرات واقعی تأییدشده؛ اگر هنوز نظری نیست، بخش پنهان می‌ماند
(async function initTestimonials() {
  const strip = document.getElementById('testiStrip');
  if (!strip) return;
  let reviews;
  try { ({ reviews } = await PG.api('/shop/recent-reviews')); } catch (e) { return; }
  if (!reviews || !reviews.length) return;
  const stars = (n) => Array.from({ length: n }, () => '<svg><use href="#i-star"/></svg>').join('');
  document.getElementById('testiGrid').innerHTML = reviews.slice(0, 3).map(r => `
    <div class="testi-card">
      <svg class="quote"><use href="#i-quote"/></svg>
      <p class="body">${PG.esc(r.body)}</p>
      <div class="testi-stars">${stars(r.rating)}</div>
      <div class="testi-who">
        <span class="testi-avatar">${PG.esc(r.userName.slice(0, 1))}</span>
        <div>
          <div class="testi-name">${PG.esc(r.userName)}${r.isBuyer ? ' <span class="rv-buyer"><svg><use href="#i-check-circle"/></svg> خریدار</span>' : ''}</div>
          <div class="testi-meta"><a href="/product/${r.productId}">${PG.esc(r.productTitle)}</a></div>
        </div>
      </div>
    </div>`).join('');
  strip.hidden = false;
})();

// بنر جشنواره‌ی صفحه‌ی اصلی — از پنل ← تنظیمات (promo_text / promo_code)
document.addEventListener('pg:shopinfo', (e) => {
  const info = e.detail || {};
  const strip = document.getElementById('promoStrip');
  if (!strip || !info.promoText) return;
  document.getElementById('promo-title').textContent = info.promoText;
  if (info.promoCode) {
    document.getElementById('promoCodeText').textContent = info.promoCode;
    document.getElementById('promoCodeLine').hidden = false;
    document.getElementById('promoCodeBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(info.promoCode);
        PG.toast('کد تخفیف کپی شد؛ موقع پرداخت در سبد واردش کنید', 'success');
      } catch (err) {
        PG.toast(`کد تخفیف: ${info.promoCode}`, 'info');
      }
    });
  }
  strip.hidden = false;
});

// «اخیراً دیده‌اید» در صفحه‌ی اصلی — برای مشتریِ برگشته.
// اطلاعات از سرور تازه گرفته می‌شود (در مرورگر فقط شناسه هست)، پس قیمت و
// موجودیِ نمایش‌داده‌شده همیشه همان چیزی است که در صفحه‌ی محصول می‌بیند.
let RECENT_ITEMS = []; // برای «نمای سریع»؛ این‌ها در PAGE_ITEMS نیستند

(async function initRecentlyViewed() {
  const wrap = document.getElementById('recentWrap');
  if (!wrap) return;
  if (!PG.recentIds().length) return; // بازدید اولِ کاربر: بخش اصلاً ساخته نمی‌شود
  const items = await PG.recentProducts({ limit: 4 });
  if (!items.length) return;          // همه‌شان حذف شده بودند
  RECENT_ITEMS = items;
  document.getElementById('recentGrid').innerHTML = items.map(renderProductCard).join('');
  wrap.hidden = false;
  PG.syncWishHearts();
})();

function renderProductCard(p) {
  const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
  // آستانه از تنظیمات پنل می‌آید نه عدد ثابت؛ «فقط N عدد مانده» باید راست باشد
  const lowStock = typeof p.stock === 'number' && p.stock > 0 && p.stock <= PG.lowStockAt();
  const title = PG.esc(p.title);
  const media = p.image
    ? `<img src="${PG.esc(PG.cardImg(p.image))}"${PG.imgSizing(p.image)} alt="${title}" loading="lazy" decoding="async">`
    : `<svg role="img" aria-label="${title}"><use href="#${PG.esc(p.icon)}"/></svg>`;
  return `
    <article class="product-card" data-id="${p.id}">
      <div class="product-media${p.image ? ' has-image' : ''}" role="button" tabindex="-1" aria-label="نمای سریع ${title}">
        ${p.discountPercent ? `<span class="product-badge off">${PG.money(p.discountPercent)}٪ تخفیف</span>` : (p.badge ? `<span class="product-badge">${PG.esc(p.badge)}</span>` : '')}
        ${PG.wishBtnHtml(p.id)}
        ${media}
        <span class="qv-hint" aria-hidden="true"><svg><use href="#i-search"/></svg> نمای سریع</span>
      </div>
      <div class="product-body">
        <div class="pc-meta">
          <span class="product-cat">${PG.esc(p.category)}</span>
          ${p.rating && p.rating.count > 0 ? `
          <span class="pc-stars" title="میانگین ${PG.money(p.rating.avg)} از ${PG.money(p.rating.count)} دیدگاه">
            <svg aria-hidden="true"><use href="#i-star"/></svg>${PG.money(p.rating.avg)}
          </span>` : ''}
        </div>
        <h3 class="product-title"><a href="/product/${p.id}" title="مشاهده جزئیات کامل">${title}</a></h3>
        <p class="product-desc">${PG.esc(p.description)}</p>
        ${lowStock ? `<span class="stock-hint">فقط ${PG.money(p.stock)} عدد باقی مانده</span>` : ''}
        <div class="product-footer">
          ${PG.priceHtml(p)}
          ${outOfStock ? PG.notifyBtnHtml(p.id) : `
          <button class="buy-btn" data-id="${p.id}" aria-label="افزودن ${title} به سبد خرید">
            <svg><use href="#i-cart"/></svg> افزودن به سبد
          </button>`}
        </div>
      </div>
    </article>
  `;
}

// ---------- مودال نمای سریع محصول ----------
let QV_LAST_FOCUS = null;

// نیمِ چپِ دیالوگِ min(880px,100%) است، پس زیرِ ۷۰۰ پیکسل تمامِ عرض و بالای آن
// حداکثر ۴۴۰. عکسِ اینجا object-fit:cover است و کلِ کادر را پر می‌کند.
const QV_SIZES = '(max-width:700px) 100vw, 440px';

function ensureQuickView() {
  let overlay = document.getElementById('qvOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'qvOverlay';
  overlay.className = 'qv-overlay';
  overlay.innerHTML = `
    <div class="qv-dialog" role="dialog" aria-modal="true" aria-labelledby="qvTitle">
      <div class="qv-media" id="qvMedia">
        <button class="qv-close" id="qvClose" aria-label="بستن"><svg><use href="#i-close"/></svg></button>
      </div>
      <div class="qv-body">
        <span class="qv-cat" id="qvCat"></span>
        <h3 class="qv-title" id="qvTitle"></h3>
        <p class="qv-desc" id="qvDesc"></p>
        <span class="qv-stock" id="qvStock" hidden></span>
        <a class="qv-more" id="qvMore" href="#">مشاهده جزئیات کامل محصول ←</a>
        <div class="qv-footer">
          <span class="qv-price" id="qvPrice"></span>
          <button class="buy-btn" id="qvBuy"><svg><use href="#i-cart"/></svg> <span>افزودن به سبد</span></button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeQuickView(); });
  overlay.querySelector('#qvClose').addEventListener('click', closeQuickView);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeQuickView();
  });
  return overlay;
}

function openQuickView(p) {
  const overlay = ensureQuickView();
  QV_LAST_FOCUS = document.activeElement;

  const media = overlay.querySelector('#qvMedia');
  // عکس/آیکون قبلی را پاک کن، دکمه‌ی بستن بماند
  media.querySelectorAll('img, svg:not(.qv-keep), .product-badge, .wish-btn').forEach(el => {
    if (!el.closest('.qv-close')) el.remove();
  });
  if (p.discountPercent) media.insertAdjacentHTML('beforeend', `<span class="product-badge off">${PG.money(p.discountPercent)}٪ تخفیف</span>`);
  else if (p.badge) media.insertAdjacentHTML('beforeend', `<span class="product-badge">${PG.esc(p.badge)}</span>`);
  media.insertAdjacentHTML('beforeend', PG.wishBtnHtml(p.id, 'qv-wish'));
  media.insertAdjacentHTML('beforeend', p.image
    ? `<img src="${PG.esc(PG.cardImg(p.image))}"${PG.imgSizing(p.image, QV_SIZES)} alt="${PG.esc(p.title)}">`
    : `<svg role="img" aria-label="${PG.esc(p.title)}"><use href="#${PG.esc(p.icon)}"/></svg>`);

  overlay.querySelector('#qvCat').textContent = p.category;
  overlay.querySelector('#qvTitle').textContent = p.title;
  overlay.querySelector('#qvDesc').textContent = p.description;
  overlay.querySelector('#qvPrice').innerHTML = PG.priceHtml(p, { big: true });

  const stockEl = overlay.querySelector('#qvStock');
  const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
  const lowStock = typeof p.stock === 'number' && p.stock > 0 && p.stock <= PG.lowStockAt();
  stockEl.hidden = !(outOfStock || lowStock);
  stockEl.classList.toggle('out', outOfStock);
  stockEl.textContent = outOfStock ? 'ناموجود' : (lowStock ? `فقط ${PG.money(p.stock)} عدد باقی مانده` : '');

  const buy = overlay.querySelector('#qvBuy');
  overlay.querySelector('#qvMore').href = `/product/${p.id}`;

  // ناموجود؟ همان دکمه‌ی «خبرم کن» کارت‌ها اینجا هم می‌آید تا مسیر بن‌بست نشود.
  // این مودال برای هر محصول *بازاستفاده* می‌شود، پس هر بار باید هر دو حالت را
  // تمیز کنیم؛ وگرنه دکمه‌ی خبرم کنِ کالای قبلی روی کالای موجود می‌ماند.
  overlay.querySelector('[data-notify]')?.remove();
  buy.hidden = outOfStock;
  if (outOfStock) {
    overlay.querySelector('.qv-footer').insertAdjacentHTML('beforeend', PG.notifyBtnHtml(p.id));
  }
  buy.disabled = outOfStock;
  buy.querySelector('span').textContent = outOfStock ? 'ناموجود' : 'افزودن به سبد';
  buy.onclick = async () => {
    if (buy.disabled) return;
    buy.disabled = true;
    try {
      await PG.addToCart(p.id, 1);
      closeQuickView();
    } catch (err) {
      PG.toast(err.message || 'خطا در افزودن به سبد', 'error');
    } finally {
      buy.disabled = outOfStock;
    }
  };

  overlay.classList.add('open');
  document.body.classList.add('qv-lock');
  PG.syncWishHearts();
  overlay.querySelector('#qvClose').focus();
}

function closeQuickView() {
  const overlay = document.getElementById('qvOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('qv-lock');
  if (QV_LAST_FOCUS?.focus) QV_LAST_FOCUS.focus();
}

// تزریق دیتای ساخت‌یافته‌ی محصولات (Schema.org ItemList) برای سئو
function injectProductSchema(products) {
  try {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.title,
          description: p.description,
          category: p.category,
          ...(p.image ? { image: location.origin + p.image } : {}),
          offers: {
            '@type': 'Offer',
            // واحد سایت تومان است و IRR ریال؛ بدون ×۱۰ قیمت یک‌دهم اعلام می‌شد
            price: Number(p.price) * 10,
            priceCurrency: 'IRR',
            availability: (typeof p.stock === 'number' && p.stock <= 0)
              ? 'https://schema.org/OutOfStock'
              : 'https://schema.org/InStock'
          }
        }
      }))
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
  } catch (e) { /* سئو نباید جلوی کار سایت را بگیرد */ }
}

// ---------- رهگیری سفارش بدون ورود ----------
// چرا اینجا و نه در یک فایل جدا: بخشِ رهگیری فقط در index.html است و یک فایل
// جاوااسکریپتِ اضافه یعنی یک درخواست شبکه‌ی دیگر روی صفحه‌ی اصلی.
function initOrderTracking() {
  const form = document.getElementById('trackForm');
  if (!form) return;
  const out = document.getElementById('trackResult');
  const btn = document.getElementById('trackBtn');

  // مراحل واقعی سفارش، به ترتیب. وضعیت‌های «شکست» عمداً اینجا نیستند چون
  // خط زمانی ندارند — پیام خودشان را می‌گیرند.
  const STEPS = [
    ['pending_payment', 'ثبت سفارش'],
    ['paid', 'پرداخت شد'],
    ['shipped', 'ارسال شد'],
    ['delivered', 'تحویل شد']
  ];

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.dataset.busy) return;

    const orderId = document.getElementById('trackOrderId').value.trim();
    const phone = document.getElementById('trackPhone').value.trim();
    if (!orderId || !phone) {
      out.hidden = false;
      out.className = 'track-result is-error';
      out.textContent = 'هر دو کادر را پر کنید.';
      return;
    }

    btn.dataset.busy = '1';
    const label = btn.textContent;
    btn.textContent = 'در حال بررسی…';
    btn.disabled = true;
    try {
      const { order } = await PG.api('/orders/track', { method: 'POST', body: { orderId, phone } });

      // وضعیت‌های خارج از خط زمانی: خط مرحله‌ای برایشان بی‌معنی است.
      const offTrack = ['failed', 'canceled', 'return_requested', 'returned'].includes(order.status);
      const doneIdx = STEPS.findIndex(s => s[0] === order.status);

      const timeline = offTrack ? '' : `
        <ol class="track-steps" aria-label="مراحل سفارش">
          ${STEPS.map(([key, text], i) => `
            <li class="${i < doneIdx ? 'is-done' : i === doneIdx ? 'is-now' : ''}">
              <span class="ts-dot" aria-hidden="true"></span>
              <span class="ts-text">${text}</span>
            </li>`).join('')}
        </ol>`;

      const note = order.status === 'shipped' && order.trackingCode
        ? `<p class="track-note">کد رهگیری پستی: <b dir="ltr">${PG.esc(order.trackingCode)}</b></p>`
        : order.status === 'pending_payment'
          ? '<p class="track-note">این سفارش هنوز پرداخت نشده. اگر مبلغی کم شده و وضعیت عوض نشد، با ما تماس بگیرید.</p>'
          : order.status === 'failed' || order.status === 'canceled'
            ? '<p class="track-note">این سفارش نهایی نشد و کالاها به انبار برگشتند.</p>'
            : '';

      out.hidden = false;
      out.className = 'track-result is-ok';
      out.innerHTML = `
        <div class="track-head">
          <b>سفارش ${PG.num(order.id)}</b>
          <span class="status-badge status-${order.status}">${PG.statusLabel(order.status)}</span>
        </div>
        ${timeline}
        <div class="track-meta">
          <span>${PG.num(order.itemCount)} قلم</span>
          <span>${PG.money(order.total)} تومان</span>
          ${order.city ? `<span>مقصد: ${PG.esc(order.city)}</span>` : ''}
        </div>
        <ul class="track-items">
          ${order.items.map(i => `<li>${PG.esc(i.title)} <span>×${PG.num(i.qty)}</span></li>`).join('')}
        </ul>
        ${note}`;
      out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      out.hidden = false;
      out.className = 'track-result is-error';
      // پیام سرور برای ۴۰۴ و ۴۲۹ خودش گویاست؛ خطای شبکه را PG.api ترجمه کرده.
      out.textContent = err.message;
    } finally {
      delete btn.dataset.busy;
      btn.textContent = label;
      btn.disabled = false;
    }
  });
}
