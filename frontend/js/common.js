// common.js — روی همه‌ی صفحات لود می‌شود

(async function loadIconSprite() {
  try {
    const res = await fetch('/assets/icons.svg');
    const svgText = await res.text();
    document.body.insertAdjacentHTML('afterbegin', svgText);
  } catch (e) {
    console.error('بارگذاری آیکون‌ها ناموفق بود', e);
  }
})();

const PG = (function () {
  // سقفِ انتظار برای پاسخ سرور. بدون این، روی موبایلِ ایران درخواست می‌تواند
  // دقیقه‌ها معلق بماند: دکمه قفل، اسپینر می‌چرخد و مشتری فقط صفحه را می‌بندد.
  // آپلود عکس در پنل از fetch خام استفاده می‌کند، پس این سقف رویش نمی‌افتد.
  const NET_TIMEOUT = 20000;

  async function api(path, options = {}) {
    const { timeout, ...fetchOpts } = options;
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout || NET_TIMEOUT);
    try {
      res = await fetch(`/api${path}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: ctrl.signal,
        ...fetchOpts
      });
    } catch (e) {
      // ترجمه‌ی خطای شبکه به فارسیِ آدمیزاد. چرا لازم است: وقتی fetch به سرور
      // نمی‌رسد، مرورگر «Failed to fetch» پرت می‌کند (سافاری: «Load failed») و
      // همین رشته‌ی انگلیسی مستقیم توی پیامِ سایت به مشتری نشان داده می‌شد.
      // پیام باید بگوید چه کاری از دستِ *مشتری* برمی‌آید، نه اینکه چه شد.
      const err = new Error(
        e.name === 'AbortError'
          ? 'پاسخ سرور خیلی طول کشید. اینترنتت را چک کن و دوباره بزن.'
          : navigator.onLine === false
            ? 'اینترنت وصل نیست. وصل شو و دوباره امتحان کن.'
            : 'ارتباط با سرور برقرار نشد. چند لحظه بعد دوباره امتحان کن.'
      );
      err.status = 0;
      err.network = true;
      err.timeout = e.name === 'AbortError';
      err.offline = navigator.onLine === false;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      // پاسخِ بی‌بدنه (۵۰۲ از nginx، صفحه‌ی خطای پروکسی، بدنه‌ی خراب) هم باید پیامِ
      // آدمیزاد بدهد. «خطایی رخ داد» به مشتری نمی‌گفت مشکل از کجاست و چه کاری از
      // دستش برمی‌آید — و همین جمله روی هر دکمه‌ای می‌نشست.
      let message = data.error || (
        res.status === 401 ? 'برای این کار باید وارد حساب شوید.'
        : res.status === 403 ? 'اجازه‌ی این کار را ندارید.'
        : res.status === 404 ? 'این مورد پیدا نشد؛ شاید حذف شده باشد.'
        : res.status === 413 ? 'حجم فایل بیش از حد مجاز است.'
        : res.status === 429 ? 'تعداد درخواست زیاد شد؛ یک دقیقه صبر کنید و دوباره بزنید.'
        : res.status >= 500 ? 'مشکلی سمت سرور پیش آمد. چند لحظه بعد دوباره امتحان کنید.'
        : 'درخواست انجام نشد؛ دوباره امتحان کنید.'
      );
      // خطای واقعیِ سرور (نه ایرادِ ورودی کاربر) کد پیگیری دارد. نشان‌دادنش به
      // مشتری یعنی وقتی زنگ می‌زند، همان کد را می‌گوید و ما مستقیم به همان یک
      // خط لاگ می‌رسیم — به‌جای گشتن بین صدها درخواستِ آن دقیقه.
      if (res.status >= 500 && data.ref) message += `\n(کد پیگیری: ${data.ref})`;
      const err = new Error(message);
      err.status = res.status;
      err.ref = data.ref || null;
      err.data = data;
      // خروجِ خودکارِ پنل بعد از بی‌کاری. یک رویداد پخش می‌شود تا صفحه‌ی پنل
      // بتواند به‌جای یک toastِ گم‌شونده، پرده‌ی «دوباره وارد شوید» را نشان دهد.
      // چرا اینجا و نه در admin.js: پنل ده‌ها فراخوانی دارد و هر کدام می‌تواند
      // اولین درخواستی باشد که به نشستِ منقضی می‌خورد.
      if (res.status === 401 && data.reason === 'idle') {
        err.idle = true;
        document.dispatchEvent(new CustomEvent('pg:idle-logout', { detail: { message } }));
      }
      throw err;
    }
    return data;
  }

  // میزبانِ پیام‌ها یک «ناحیه‌ی زنده» است: خواننده‌های صفحه فقط تغییرِ عنصری را
  // اعلام می‌کنند که *از قبل* در DOM بوده باشد. اگر همان لحظه‌ی نمایش اولین پیام
  // ساخته و پر شود، آن پیام بی‌صدا رد می‌شود — و پیام‌ها اصلی‌ترین کانال بازخورد
  // سایت‌اند («به سبد اضافه شد»، خطاها). پس در بارگذاری صفحه می‌سازیمش.
  function ensureToastHost() {
    let host = document.getElementById('pgToastHost');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'pgToastHost';
    // polite نه assertive: هر خطای فرم حرفِ کاربر را قطع نکند. خطاها خودشان
    // پایین‌تر role="alert" می‌گیرند تا فوری خوانده شوند.
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'false');
    host.style.cssText = 'position:fixed;top:96px;left:50%;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:8px;width:min(90vw,380px);';
    document.body.appendChild(host);
    return host;
  }

  function toast(message, type = 'info', opts = {}) {
    const host = ensureToastHost();
    const el = document.createElement('div');
    // خطا باید حرفِ در جریان را قطع کند، وگرنه کاربر نابینا فرم را می‌فرستد و
    // نمی‌فهمد چرا هیچ اتفاقی نیفتاد.
    if (type === 'error') el.setAttribute('role', 'alert');
    const colors = {
      success: 'background:linear-gradient(135deg,#25E3C4,#12A78F);color:#04211B;',
      error: 'background:linear-gradient(135deg,#FF6A4D,#E8503A);color:#fff;',
      info: 'background:#1C2E27;color:#EDF6F1;border:1px solid rgba(237,246,241,.16);'
    };
    // pre-line: بعضی پیام‌ها یک خط دوم دارند (مثل «کد پیگیری») و بدون این،
    // خط جدید به فاصله تبدیل می‌شد و همه در یک سطر به‌هم می‌چسبید.
    el.style.cssText = `${colors[type] || colors.info} padding:13px 18px;border-radius:12px;font-size:13.5px;font-weight:700;line-height:1.9;white-space:pre-line;box-shadow:0 14px 26px -12px rgba(0,0,0,.35);opacity:0;transform:translateY(-8px);transition:opacity .25s ease, transform .25s ease;`;
    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      el.style.opacity = '0'; el.style.transform = 'translateY(-8px)';
      setTimeout(() => el.remove(), 250);
    };
    if (opts.action && (opts.action.href || opts.action.onClick)) {
      // پیام + یک اقدام: یا لینک (مثلاً «مشاهده سبد») یا دکمه (مثلاً «بازگرداندن»)
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'space-between';
      el.style.gap = '14px';
      const msg = document.createElement('span');
      msg.textContent = message;
      const style = 'flex:none;color:inherit;font-weight:800;text-decoration:underline;text-underline-offset:3px;background:none;border:0;cursor:pointer;font-family:inherit;font-size:inherit;padding:0;';
      let act;
      if (opts.action.href) {
        act = document.createElement('a');
        act.href = opts.action.href;
      } else {
        act = document.createElement('button');
        act.type = 'button';
        act.addEventListener('click', () => { dismiss(); opts.action.onClick(); });
      }
      act.textContent = opts.action.label || 'مشاهده';
      act.style.cssText = style;
      el.append(msg, act);
    } else {
      el.textContent = message;
    }
    host.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    timer = setTimeout(dismiss, opts.action ? 5000 : 2600);
  }

  // بج سبد: وقتی خالی است پنهان می‌شود و موقع تغییر یک پرش کوچک می‌زند
  function paintCartBadge(count) {
    const n = Number(count) || 0;
    document.querySelectorAll('.cart-count').forEach(el => {
      const changed = el.dataset.n !== String(n);
      el.dataset.n = String(n);
      el.textContent = n > 99 ? '۹۹+' : money(n);
      el.classList.toggle('is-empty', n === 0);
      el.setAttribute('aria-label', n ? `${money(n)} کالا در سبد خرید` : 'سبد خرید خالی است');
      if (changed && n > 0) {
        el.classList.remove('bump');
        void el.offsetWidth;      // ری‌استارت انیمیشن
        el.classList.add('bump');
      }
    });
  }

  async function refreshCartBadge() {
    try {
      const cart = await api('/cart');
      paintCartBadge(cart.count);
      return cart;
    } catch (e) {
      paintCartBadge(0);
      return { items: [], total: 0, count: 0 };
    }
  }

  async function addToCart(productId, qty = 1) {
    const cart = await api('/cart/add', { method: 'POST', body: JSON.stringify({ productId, qty }) });
    paintCartBadge(cart.count);
    // لینک «مشاهده سبد» داخل توست — مشتری بدون گشتن دنبال آیکون، مستقیم برود سمت پرداخت
    toast('به سبد خرید اضافه شد', 'success', { action: { href: '/cart.html', label: 'مشاهده سبد' } });
    return cart;
  }

  async function refreshAuthNav() {
    try {
      const { user } = await api('/auth/me');
      document.querySelectorAll('[data-auth-link="text"]').forEach(el => {
        const label = el.querySelector('[data-auth-label]');
        (label || el).textContent = user ? (user.fullName ? `حساب ${user.fullName}` : 'حساب من') : 'ورود / ثبت‌نام';
        el.href = user ? '/account.html' : '/login.html';
      });
      document.querySelectorAll('[data-auth-link="icon"]').forEach(el => {
        el.href = user ? '/account.html' : '/login.html';
        el.setAttribute('aria-label', user ? 'حساب کاربری' : 'ورود به حساب');
      });
      document.querySelectorAll('[data-auth-link="bn"]').forEach(el => {
        el.href = user ? '/account.html' : '/login.html';
        const label = el.querySelector('[data-auth-label-bn]');
        if (label) label.textContent = user ? 'حساب من' : 'ورود';
      });
      return user;
    } catch (e) {
      return null;
    }
  }

  // ---------- علاقه‌مندی‌ها (قلب روی کارت‌ها) ----------
  let WISH_IDS = new Set();

  function isWished(id) { return WISH_IDS.has(Number(id)); }

  // قلب‌های موجود در صفحه را با وضعیت فعلی هماهنگ می‌کند
  function syncWishHearts() {
    document.querySelectorAll('.wish-btn[data-id]').forEach(btn => {
      const on = WISH_IDS.has(Number(btn.dataset.id));
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on);
      const use = btn.querySelector('use');
      if (use) use.setAttribute('href', on ? '#i-heart-fill' : '#i-heart');
    });
    document.querySelectorAll('.wish-count').forEach(badge => {
      badge.textContent = WISH_IDS.size;
      badge.classList.toggle('hidden', WISH_IDS.size === 0);
    });
  }

  async function refreshWishlist() {
    try {
      const { ids } = await api('/wishlist/ids');
      WISH_IDS = new Set(ids);
    } catch (e) { WISH_IDS = new Set(); }
    syncWishHearts();
  }

  async function toggleWish(productId) {
    try {
      const res = await api('/wishlist/toggle', { method: 'POST', body: JSON.stringify({ productId }) });
      WISH_IDS = new Set(res.ids);
      syncWishHearts();
      toast(res.inWishlist ? 'به علاقه‌مندی‌ها اضافه شد ❤' : 'از علاقه‌مندی‌ها حذف شد', res.inWishlist ? 'success' : 'info');
      document.dispatchEvent(new CustomEvent('pg:wishchange', { detail: res }));
      return res;
    } catch (err) {
      if (err.status === 401) {
        toast('برای ذخیره‌ی علاقه‌مندی‌ها اول وارد حساب‌تان شوید', 'info');
        const next = encodeURIComponent(location.pathname + location.search);
        setTimeout(() => { location.href = `/login.html?next=${next}`; }, 1100);
      } else {
        toast(err.message || 'خطا در ثبت علاقه‌مندی', 'error');
      }
      throw err;
    }
  }

  // دکمه‌ی قلب آماده برای قرار گرفتن روی کارت محصول
  function wishBtnHtml(productId, extraClass = '') {
    return `
      <button type="button" class="wish-btn ${extraClass}" data-id="${productId}"
              aria-pressed="false" aria-label="افزودن به علاقه‌مندی‌ها">
        <svg><use href="#i-heart"/></svg>
      </button>`;
  }

  function initDrawer() {
    const drawer = document.getElementById('drawer');
    const openBtn = document.getElementById('menuOpen');
    const closeBtn = document.getElementById('menuClose');
    if (!drawer || !openBtn) return;

    const panel = drawer.querySelector('.drawer-panel') || drawer;
    // منو یک دیالوگ است: هم برای screen reader باید اعلام شود، هم فوکوس نباید
    // پشتش بماند. قبلاً با Tab می‌شد به لینک‌های صفحه‌ی زیرِ منو رسید — کاربر
    // کیبورد جایی فوکوس داشت که نمی‌دید.
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'منوی اصلی');
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.setAttribute('aria-controls', 'drawer');

    const focusables = () => [...panel.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null);

    function open() {
      drawer.classList.add('open');
      openBtn.setAttribute('aria-expanded', 'true');
      // فوکوس روی دکمه‌ی بستن، نه اولین لینک: کاربر تازه منو را باز کرده،
      // احتمال «بستن» بیشتر از پریدن به اولین آیتم است.
      (closeBtn || focusables()[0])?.focus();
      document.addEventListener('keydown', onKey);
    }
    function close({ restore = true } = {}) {
      if (!drawer.classList.contains('open')) return;
      drawer.classList.remove('open');
      openBtn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey);
      if (restore) openBtn.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') return close();
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    openBtn.addEventListener('click', open);
    closeBtn?.addEventListener('click', () => close());
    drawer.addEventListener('click', (e) => { if (e.target === drawer) close(); });
    // کلیک روی لینک صفحه را عوض می‌کند؛ برگرداندن فوکوس به دکمه‌ی منو بی‌معنی است
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => close({ restore: false })));
  }

  function initFooterYear() {
    const el = document.getElementById('year');
    if (el) el.textContent = `© ${new Date().getFullYear()} پلاسکو گلی. تمامی حقوق محفوظ است.`;
  }

  // سایه‌دار شدن هدر بعد از اسکرول + دکمه‌ی بازگشت به بالا
  function initScrollFx() {
    const header = document.querySelector('header.site');

    let toTop = document.querySelector('.to-top');
    if (!toTop) {
      toTop = document.createElement('button');
      toTop.className = 'to-top';
      toTop.setAttribute('aria-label', 'بازگشت به بالای صفحه');
      toTop.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      document.body.appendChild(toTop);
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        header?.classList.toggle('scrolled', y > 10);
        toTop.classList.toggle('show', y > 600);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initScrollReveal() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-visible'));
      return;
    }
    // تأخیر پله‌ای بین همسایه‌ها: المان‌هایی که والد مشترک دارند پشت هم می‌آیند
    // نه همه با هم. سقف ۴ پله (۳۲۰ms) گذاشته‌ایم تا در لیست‌های بلند، آخرین
    // کارت‌ها ثانیه‌ها منتظر نمانند — تأخیر طولانی حس کندی سایت می‌دهد.
    const seen = new Map();
    items.forEach(el => {
      const key = el.parentElement || document.body;
      const i = seen.get(key) || 0;
      seen.set(key, i + 1);
      if (i > 0) el.style.setProperty('--rd', `${Math.min(i, 4) * 80}ms`);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(el => io.observe(el));
  }

  function money(n) {
    return Number(n || 0).toLocaleString('fa-IR');
  }

  // عددِ بدون جداکننده‌ی سه‌رقمی، با رقم‌های فارسی — برای شماره‌ی سفارش، تعداد و
  // شماره‌ی صفحه. با money اشتباه نشود: «سفارش #۱٬۲۳۴» غلط است.
  function num(n) {
    return Number(n || 0).toLocaleString('fa-IR', { useGrouping: false });
  }

  // برچسب فارسیِ وضعیت سفارش. تا امروز عیناً در account.js و order-success.js
  // تکرار شده بود و حالا صفحه‌ی رهگیری هم می‌خواستش. سه نسخه یعنی روزی که
  // وضعیت جدیدی اضافه شود، یکی‌شان یادش می‌رود و مشتری کد خام انگلیسی می‌بیند.
  function statusLabel(status) {
    return {
      paid: 'پرداخت‌شده',
      shipped: 'ارسال شده',
      delivered: 'تحویل شده',
      pending_payment: 'در انتظار پرداخت',
      failed: 'ناموفق',
      canceled: 'لغو شده',
      return_requested: 'در انتظار بررسی مرجوعی',
      returned: 'مرجوع شده'
    }[status] || status;
  }

  // امن‌سازی متن قبل از تزریق در innerHTML.
  // امروز فقط ادمین محصول می‌سازد و CSP هم script-src 'self' است، ولی اگر روزی
  // ادمین دوم یا نظرات کاربران اضافه شود، همین یک تابع جلوی XSS را می‌گیرد.
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // نرمال‌سازی متن فارسی برای جستجو (ی/ك عربی، فاصله‌ها)
  function normFa(s) {
    return String(s || '')
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .replace(/‌/g, ' ')
      .replace(/\s+/g, ' ')
      .trim().toLowerCase();
  }

  // تاشدن هم‌آواها — «صتل» و «سطل» به یک رشته می‌رسند، پس غلط املایی رایج
  // فارسی همان لحظه و بدون رفت‌وبرگشت به سرور پیدا می‌شود.
  // (همین نگاشت در سرور هم هست: backend/lib/db.js → FOLD_MAP)
  const FOLD_FA = {
    'ص': 'س', 'ث': 'س', 'ذ': 'ز', 'ض': 'ز', 'ظ': 'ز', 'ط': 'ت',
    'ح': 'ه', 'غ': 'ق', 'آ': 'ا', 'أ': 'ا', 'إ': 'ا', 'ع': 'ا', 'ء': 'ا',
    'ي': 'ی', 'ئ': 'ی', 'ى': 'ی', 'ك': 'ک', 'ؤ': 'و', 'ة': 'ه', 'ۀ': 'ه',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };
  function foldFa(s) {
    const base = normFa(s).replace(/[ً-ْٰٕٔ]/g, '');
    let out = '';
    for (const ch of base) out += FOLD_FA[ch] || ch;
    return out;
  }

  // ---------- منوی بازشوی دسته‌بندی‌ها (هدر) ----------
  function initCatMenu() {
    const menu = document.getElementById('catMenu');
    const btn = document.getElementById('catMenuBtn');
    if (!menu || !btn) return;

    function close() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
    });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // نمایندگی رویداد، تا وقتی لیست از سرور بازسازی شد هم کار کند
    menu.addEventListener('click', (e) => {
      const a = e.target.closest('.cat-dropdown a[data-cat]');
      if (!a) return;
      close();
      e.preventDefault();
      if (typeof window.setActiveCat === 'function') {
        // روی صفحه‌ی اصلی هستیم: فیلتر زنده + اسکرول
        window.setActiveCat(a.dataset.cat);
        document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
      } else {
        location.href = `/index.html?cat=${encodeURIComponent(a.dataset.cat)}#products`;
      }
    });
  }

  // ---------- دسته‌بندی‌های داینامیک (از پنل مدیریت) ----------
  // منوی هدر و دراور موبایل از /api/shop/categories بازسازی می‌شوند؛
  // HTML ثابت داخل صفحه‌ها فقط حالت آغازین/فال‌بک است.
  async function initDynamicCats() {
    let cats;
    try { ({ categories: cats } = await api('/shop/categories')); } catch (e) { return; }
    if (!Array.isArray(cats) || !cats.length) return;
    PG.CATS = cats;

    const drop = document.querySelector('#catMenu .cat-dropdown');
    if (drop) {
      drop.innerHTML = cats.map(c =>
        `<a href="index.html#products" data-cat="${esc(c.name)}" role="menuitem"><svg><use href="#${esc(c.icon)}"/></svg> ${esc(c.name)}</a>`).join('')
        + `<a href="index.html#products" data-cat="همه" class="cat-all" role="menuitem"><svg><use href="#i-package"/></svg> نمایش همه‌ی محصولات</a>`;
    }

    // دراور موبایل: لینک‌های بین لیبل «دسته‌بندی‌ها» تا لیبل بعدی عوض می‌شوند
    const label = [...document.querySelectorAll('.mobile-drawer .drawer-label')]
      .find(l => l.textContent.trim() === 'دسته‌بندی‌ها');
    if (label) {
      let n = label.nextElementSibling;
      while (n && !n.classList.contains('drawer-label')) { const next = n.nextElementSibling; n.remove(); n = next; }
      label.insertAdjacentHTML('afterend', cats.map(c =>
        `<a href="index.html?cat=${encodeURIComponent(c.name)}#products"><svg><use href="#${esc(c.icon)}"/></svg> ${esc(c.name)}</a>`).join(''));
    }

    document.dispatchEvent(new CustomEvent('pg:cats', { detail: cats }));
  }

  // ---------- جستجوی سراسری با پیشنهاد زنده ----------
  // پیشنهادها را خود سرور می‌دهد (۶ تا)، پس دیگر کل کاتالوگ دانلود نمی‌شود.

  function initSearch() {
    const box = document.getElementById('searchBox');
    const input = document.getElementById('siteSearch');

    if (box && input) {
      let host = null;
      function closeSuggest() { if (host) { host.remove(); host = null; } }

      // جواب هر عبارت کش می‌شود تا با هر حرفِ تایپ دوباره از سرور نپرسیم
      const suggestCache = new Map();

      async function suggestFromServer(query) {
        if (suggestCache.has(query)) return suggestCache.get(query);
        let out = { items: [], isNear: false };
        try {
          const data = await api(`/products?q=${encodeURIComponent(query)}&limit=6`);
          // fuzzy یعنی عبارت دقیق نبود و این‌ها نزدیک‌ترین‌هایند
          out = { items: data.products || [], isNear: Boolean(data.meta && data.meta.fuzzy) };
        } catch (e) { /* پیشنهاد تزئینی است؛ خطایش نباید جستجو را بخواباند */ }
        suggestCache.set(query, out);
        return out;
      }

      async function renderSuggest(q) {
        const query = q.trim();
        if (!query) return closeSuggest();
        const { items, isNear } = await suggestFromServer(query);
        if (input.value.trim() !== query) return;   // کاربر ادامه داده؛ این جواب کهنه است
        const hits = items.slice(0, 6);

        if (!host) {
          host = document.createElement('div');
          host.className = 'search-suggest';
          box.appendChild(host);
        }
        // اگر نتیجه‌ها از مسیر «نزدیک‌ترین» آمده‌اند، به کاربر بگو تا فکر نکند دقیقاً همین را نوشته
        const nearHint = isNear
          ? `<div class="suggest-hint">چیزی دقیقاً با «${esc(query)}» نبود؛ منظورت این‌ها بود؟</div>`
          : '';
        host.innerHTML = hits.length ? nearHint + hits.map(p => `
          <a href="/index.html?q=${encodeURIComponent(p.title)}#products" data-title="${esc(p.title)}">
            <span class="suggest-thumb">${p.image
              ? `<img src="${esc(thumb(p.image))}" alt="" loading="lazy" decoding="async">`
              : `<svg><use href="#${esc(p.icon)}"/></svg>`}</span>
            <span class="suggest-body">
              <span class="suggest-title">${esc(p.title)}</span>
              <span class="suggest-price">${money(p.price)} تومان</span>
            </span>
          </a>
        `).join('') : `<div class="suggest-empty">محصولی با «${esc(query)}» پیدا نشد</div>`;

        host.querySelectorAll('a').forEach(a => {
          a.addEventListener('click', (e) => {
            if (typeof window.applySearch === 'function') {
              e.preventDefault();
              input.value = a.dataset.title;
              window.applySearch(a.dataset.title);
              closeSuggest();
            }
          });
        });
      }

      let t;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => renderSuggest(input.value), 140);
        if (typeof window.applySearch === 'function') window.applySearch(input.value, { quiet: true });
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          closeSuggest();
          const q = input.value.trim();
          if (typeof window.applySearch === 'function') window.applySearch(q);
          else if (q) location.href = `/index.html?q=${encodeURIComponent(q)}#products`;
        }
        if (e.key === 'Escape') closeSuggest();
      });
      document.addEventListener('click', (e) => { if (!box.contains(e.target)) closeSuggest(); });
    }

    // جستجوی داخل منوی موبایل
    const dInput = document.getElementById('drawerSearch');
    if (dInput) {
      dInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = dInput.value.trim();
        document.getElementById('drawer')?.classList.remove('open');
        if (typeof window.applySearch === 'function') {
          window.applySearch(q);
        } else if (q) {
          location.href = `/index.html?q=${encodeURIComponent(q)}#products`;
        }
      });
    }
  }

  // آیکون قلب در هدر (کنار سبد خرید) — روی همه‌ی صفحات یکسان تزریق می‌شود
  function initHeaderWishIcon() {
    const actions = document.querySelector('.header-actions');
    if (!actions || actions.querySelector('.wish-link')) return;
    const cartLink = actions.querySelector('a[href*="cart"]');
    const a = document.createElement('a');
    a.className = 'icon-btn wish-link';
    a.href = '/account.html#wishlist';
    a.setAttribute('aria-label', 'علاقه‌مندی‌های من');
    a.innerHTML = '<svg><use href="#i-heart"/></svg><span class="wish-count hidden">0</span>';
    actions.insertBefore(a, cartLink);
  }

  // ---------- نوار ناوبری پایین موبایل (مثل اپ‌های فروشگاهی) ----------
  function initBottomNav() {
    // صفحه‌های تمام‌صفحه (مثل ورود) نوار پایین نمی‌خواهند — تمرکز فقط روی فرم
    if (document.body.hasAttribute('data-no-bottom-nav')) return;
    if (document.querySelector('.bottom-nav')) return;
    const path = location.pathname.replace(/^\//, '') || 'index.html';
    const onWishlist = path.startsWith('account.html') && location.hash === '#wishlist';
    const is = (names) => names.some(n => path.startsWith(n));
    const cls = (on) => on ? ' active' : '';
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'ناوبری پایین');
    nav.innerHTML = `
      <a href="/index.html" class="bn-item${cls(is(['index.html']))}">
        <svg><use href="#i-home"/></svg><span>خانه</span>
      </a>
      <a href="/index.html#products" class="bn-item${cls(is(['product']))}">
        <svg><use href="#i-package"/></svg><span>محصولات</span>
      </a>
      <a href="/cart.html" class="bn-item${cls(is(['cart.html', 'checkout.html']))}">
        <span class="bn-badge-wrap"><svg><use href="#i-cart"/></svg><span class="cart-count bn-cart-count is-empty" data-n="0">۰</span></span>
        <span>سبد خرید</span>
      </a>
      <a href="/account.html#wishlist" class="bn-item${cls(onWishlist)}">
        <span class="bn-badge-wrap"><svg><use href="#i-heart"/></svg><span class="wish-count hidden">0</span></span>
        <span>علاقه‌مندی</span>
      </a>
      <a href="/login.html" class="bn-item${cls(!onWishlist && is(['login.html', 'account.html']))}" data-auth-link="bn">
        <svg><use href="#i-user"/></svg><span data-auth-label-bn>ورود</span>
      </a>`;
    document.body.appendChild(nav);
  }

  // ---------- دعوت به ثبت‌نام در اولین بازدید ----------
  async function initWelcomePrompt() {
    const user = await refreshAuthNav();
    // فقط صفحه‌ی اصلی، فقط یک بار، و فقط برای مهمان
    if (!/(^\/$|index\.html)/.test(location.pathname)) return;
    if (localStorage.getItem('pg_welcomed')) return;
    if (user) { localStorage.setItem('pg_welcomed', '1'); return; }

    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML = `
      <div class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="wcTitle">
        <button class="welcome-close" aria-label="بستن"><svg><use href="#i-close"/></svg></button>
        <span class="logo-badge"><img src="/picture/logo/aa0b989f259f92d1240eb20d51846643.jfif" alt=""></span>
        <h3 id="wcTitle">به پلاسکو گلی خوش اومدید 👋</h3>
        <p>با شماره موبایل‌تون ثبت‌نام کنید تا سفارش‌هاتون ذخیره بشه، علاقه‌مندی‌هاتون رو نشون کنید و خرید بعدی سریع‌تر باشه.</p>
        <div class="welcome-actions">
          <a href="/login.html" class="btn btn-primary btn-block"><svg><use href="#i-user"/></svg> ورود / ثبت‌نام سریع</a>
          <button type="button" class="btn btn-outline btn-block welcome-later">فعلاً فقط نگاه می‌کنم</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    function dismiss() {
      localStorage.setItem('pg_welcomed', '1');
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
    overlay.querySelector('.welcome-close').addEventListener('click', dismiss);
    overlay.querySelector('.welcome-later').addEventListener('click', dismiss);
    overlay.querySelector('a.btn-primary').addEventListener('click', () => localStorage.setItem('pg_welcomed', '1'));
  }

  // نوار اطلاعیه/تعطیلی بالای سایت — متنش از پنل ← تنظیمات می‌آید
  async function initShopBar() {
    if (document.body.classList.contains('auth-page')) return; // صفحه‌ی ورود، تمام‌صفحه است
    let info;
    try { info = await api('/shop/info'); } catch (e) { return; }
    PG.SHOP = info; // بقیه‌ی اسکریپت‌ها (بنر تخفیف، checkout) هم استفاده می‌کنند
    document.dispatchEvent(new CustomEvent('pg:shopinfo', { detail: info }));

    const closed = info.shopOpen === false;
    const msg = closed
      ? (info.announcement || 'فروشگاه موقتاً تعطیل است؛ سفارش‌گیری فعلاً بسته است.')
      : info.announcement;
    if (!msg) return;
    // اطلاعیه‌ی عادی را اگر کاربر بست، تا پایان همین نشست دیگر نشان نده (پیام تعطیلی بسته‌شدنی نیست)
    if (!closed && sessionStorage.getItem('pgAnnDismiss') === msg) return;

    const bar = document.createElement('div');
    bar.className = 'shop-bar' + (closed ? ' closed' : '');
    bar.setAttribute('role', 'status');
    const inner = document.createElement('div');
    inner.className = 'container shop-bar-in';
    const txt = document.createElement('span');
    txt.textContent = msg;
    inner.appendChild(txt);
    if (!closed) {
      const x = document.createElement('button');
      x.className = 'shop-bar-x';
      x.setAttribute('aria-label', 'بستن اطلاعیه');
      x.textContent = '×';
      x.addEventListener('click', () => { sessionStorage.setItem('pgAnnDismiss', msg); bar.remove(); });
      inner.appendChild(x);
    }
    bar.appendChild(inner);
    // بعد از لینک «رفتن به محتوا» تا دسترس‌پذیری صفحه به هم نخورد
    const skip = document.querySelector('.skip-link');
    if (skip) skip.after(bar); else document.body.prepend(bar);
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureToastHost();
    initDrawer();
    initFooterYear();
    initScrollReveal();
    initScrollFx();
    initCatMenu();
    initDynamicCats();
    initSearch();
    initHeaderWishIcon();
    initBottomNav();
    initShopBar();

    // PWA: سایت قابل نصب روی گوشی می‌شود؛ سرویس‌ورکر فقط فونت/آیکون کش می‌کند
    if ('serviceWorker' in navigator && !location.pathname.startsWith('/admin')) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* اختیاری است */ });
    }
    refreshCartBadge();
    refreshWishlist();
    initWelcomePrompt();

    // کلیک روی هر قلبی در هر صفحه‌ای (کارت‌ها بعداً هم اضافه می‌شوند)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.wish-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      toggleWish(Number(btn.dataset.id)).catch(() => {}).finally(() => { btn.disabled = false; });
    });
  });

  // آستانه‌ی «کم‌موجود» از تنظیمات پنل می‌آید؛ تا رسیدنِ /shop/info همان
  // مقدار پیش‌فرض دیتابیس (۵) استفاده می‌شود تا عددی جعلی نشان نداده باشیم.
  function lowStockAt() {
    const n = Number(PG.SHOP?.lowStockThreshold);
    return Number.isFinite(n) && n > 0 ? n : 5;
  }

  // ---------- نمایش قیمت با تخفیف ----------
  // هر سه جای سایت (کارت محصول، نمای سریع، صفحه‌ی محصول) از همین یک تابع
  // استفاده می‌کنند تا عدد و ظاهر تخفیف همه‌جا یکی باشد. درصد تخفیف را سرور
  // حساب کرده و این‌جا فقط نمایش داده می‌شود — عمداً دوباره محاسبه نمی‌کنیم.
  function priceHtml(p, { big = false } = {}) {
    const now = `${money(p.price)} <small>تومان</small>`;
    const off = Number(p.discountPercent) || 0;
    const old = Number(p.oldPrice) || 0;
    if (!old || !off) return now;
    return `
      <span class="price-off${big ? ' big' : ''}">
        <span class="po-row">
          <s class="po-old" aria-label="قیمت قبلی">${money(old)}</s>
          <span class="po-badge">${money(off)}٪ تخفیف</span>
        </span>
        <span class="po-now">${now}</span>
      </span>`;
  }

  // متن آستانه‌ی ارسال رایگان برای صفحه‌ی محصول. اگر مدیر آستانه‌ای تعیین نکرده
  // باشد رشته‌ی خالی برمی‌گردد و چیزی نشان داده نمی‌شود — وعده‌ی بی‌پشتوانه نمی‌دهیم.
  // (نوارِ پیشرفتِ «چقدر مانده» در سبد خرید هست؛ آن‌جا عددِ سبد را واقعاً می‌دانیم.)
  function freeShipNote() {
    const over = Number(PG.SHOP?.freeShippingOver) || 0;
    const cost = Number(PG.SHOP?.shippingCost) || 0;
    if (!over || !cost) return '';
    return `خرید بالای ${money(over)} تومان، ارسال رایگان`;
  }

  // ---------- بازدیدهای اخیر ----------
  // فقط *شناسه*ی محصول‌ها در مرورگر می‌ماند، نه عنوان و قیمت.
  //
  // چرا: مشتری‌ای که دیروز کالایی را دیده، امروز باید قیمت و موجودیِ امروز را
  // ببیند. اگر قیمت را در مرورگر ذخیره کنیم، عدد کهنه نشان داده می‌شود و بعد
  // پای تلفن سرِ همان عدد بحث می‌شود. پس اطلاعات همیشه تازه از سرور می‌آید.
  //
  // ذخیره‌سازی هم اختیاری است: در حالت ناشناسِ بعضی مرورگرها localStorage
  // استثنا پرتاب می‌کند و نباید کل صفحه را بخواباند.
  const RV_KEY = 'pg_recent';
  const RV_MAX = 12;

  function recentIds() {
    try {
      const a = JSON.parse(localStorage.getItem(RV_KEY) || '[]');
      return Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n > 0).slice(0, RV_MAX) : [];
    } catch (e) { return []; }
  }

  function pushRecent(id) {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) return;
    // اگر قبلاً دیده شده، از جای قبلی برداشته و اول فهرست گذاشته می‌شود
    const list = [n, ...recentIds().filter((x) => x !== n)].slice(0, RV_MAX);
    try { localStorage.setItem(RV_KEY, JSON.stringify(list)); } catch (e) { /* حالت خصوصی */ }
  }

  // fetch تازه‌ی همان شناسه‌ها. exceptId برای صفحه‌ی محصول است: خودِ کالایی که
  // همین حالا باز است نباید در «بازدیدهای اخیر» خودش تکرار شود.
  async function recentProducts({ exceptId = null, limit = 6 } = {}) {
    const ids = recentIds().filter((id) => id !== Number(exceptId)).slice(0, limit);
    if (!ids.length) return [];
    try {
      const res = await api(`/products/by-ids?ids=${ids.join(',')}`);
      return res.products || [];
    } catch (e) { return []; } // این بخش تزئینی است؛ خطایش نباید دیده شود
  }

  // ---------- آدرسِ نسخه‌ی بندانگشتیِ عکس ----------
  // چند جای سایت عکسِ محصول را در کادرِ خیلی کوچکی نشان می‌دهد که اندازه‌اش در
  // CSS ثابت است: پیشنهادِ جست‌وجو ۴۴px، ردیفِ سبد ۷۶px، فهرستِ کالای پنل ۴۰px.
  // تا امروز برای هر کدام همان فایلِ ۹۳۸ پیکسلی می‌رفت — یک جست‌وجوی ساده با
  // شش پیشنهاد، ۳۶۶KB برای شش مربعِ ۴۴ پیکسلی.
  //
  // `?w=320` به سرور می‌گوید اگر نسخه‌ی کوچک را ساخته‌ای همان را بده. اگر
  // نساخته باشی، همان عکسِ کامل بیاید. یعنی این تابع هیچ‌وقت عکس را نمی‌شکند:
  // بدترین حالتش وضعِ امروز است.
  //
  // فقط روی مسیرهای داخلیِ /picture عمل می‌کند. اگر روزی عکسی از دامنه‌ی دیگری
  // بیاید، پارامتری که آن سرور نمی‌شناسد می‌توانست کشِ آن‌طرف را دو تکه کند.
  function thumb(src, w) {
    if (!src || typeof src !== 'string') return src;
    if (!src.startsWith('/picture/')) return src;
    if (src.includes('?')) return src;              // آدرسی که خودش پارامتر دارد، دست‌نخورده
    if (!/\.(jpe?g|jfif|png)$/i.test(src)) return src;   // svg و webp نسخه‌ی کوچک ندارند
    return `${src}?w=${w || 320}`;
  }

  // عکسِ کارتِ محصول. اینجا برخلافِ thumb کادر ثابت نیست — با چیدمانِ گرید
  // عوض می‌شود. اندازه گرفتم: ۴ ستونه ۲۶۸px، ۳ ستونه ۳۲۷، ۲ ستونه ۲۸۳، و
  // ۱ ستونه‌ی موبایل ۳۸۲. یعنی کارتِ موبایل از کارتِ دسکتاپ *بزرگ‌تر* است.
  //
  // پس ملاک را عرضِ پنجره نگرفتم، فقط چگالیِ پیکسل: روی DPR۱ حتی بزرگ‌ترین
  // حالت (۳۸۲ × نسبتِ ۱٫۳۵ = ۵۱۶) زیرِ ۵۶۰ می‌ماند، پس یک تصمیم برای همه‌ی
  // عرض‌ها جواب می‌دهد و تغییرِ اندازه‌ی پنجره هم نمی‌تواند تارش کند.
  // روی DPR ≥۲ اصلاً دست نمی‌زنیم.
  function cardImg(src) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (dpr > 1) return src;
    return thumb(src, 560);
  }

  // ---------- خطای کل صفحه ----------
  // چند صفحه (سبد، پرداخت، حساب کاربری) کارشان را با یک درخواست شروع می‌کنند.
  // اگر همان اولی بترکد، هیچ‌چیزِ صفحه ساخته نمی‌شود: نه لیست، نه پیام، نه دکمه —
  // مشتری یک صفحه‌ی نیمه‌کاره و ساکت می‌بیند و فکر می‌کند سایت خراب است.
  // این تابع حداقل می‌گوید چه شد و یک راه خروج می‌گذارد.
  function pageError(err, onRetry) {
    const host = document.querySelector('main') || document.body;
    let box = document.getElementById('pgPageError');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pgPageError';
      box.className = 'page-error';
      box.setAttribute('role', 'alert');
      host.prepend(box);
    }
    box.innerHTML = `
      <svg aria-hidden="true"><use href="#i-alert"/></svg>
      <div class="pe-text">
        <strong>این صفحه کامل بالا نیامد</strong>
        <p>${esc((err && err.message) || 'خطایی رخ داد')}</p>
      </div>
      <button type="button" class="btn btn-outline" data-page-retry>تلاش دوباره</button>`;
    box.querySelector('[data-page-retry]').addEventListener('click', () => {
      if (typeof onRetry === 'function') onRetry(); else location.reload();
    });
    box.scrollIntoView({ block: 'nearest' });
    return box;
  }

  // پوششِ راه‌اندازی صفحه. هر صفحه‌ای که با درخواست شروع می‌شود باید داخل این
  // بپیچد، وگرنه خطا فقط در کنسول می‌نشیند و کاربر هیچ نمی‌بیند.
  // تلاشِ دوباره باید *دوباره هم* پوشش داشته باشد، وگرنه بار دوم که شکست بخورد
  // خطا بی‌صدا رد می‌شود و دکمه روی «در حال تلاش…» می‌ماند. پس onRetry پیش‌فرض،
  // خودِ همین boot است. کادر خطا هم بعد از موفقیت برداشته می‌شود.
  async function boot(fn, onRetry) {
    try {
      await fn();
      document.getElementById('pgPageError')?.remove();
    } catch (err) {
      console.error('page boot failed', err);
      pageError(err, onRetry || (() => boot(fn, onRetry)));
    }
  }

  return { api, toast, pageError, boot, refreshCartBadge, paintCartBadge, addToCart, refreshAuthNav, money, num, statusLabel, esc, thumb, cardImg, normFa, foldFa, isWished, syncWishHearts, refreshWishlist, toggleWish, wishBtnHtml, lowStockAt, priceHtml, freeShipNote, pushRecent, recentIds, recentProducts };
})();
