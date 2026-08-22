// admin.js — پنل مدیریت پلاسکو گلی
// بخش‌ها: داشبورد، سفارش‌ها، انبار، مشتری‌ها، گزارش‌ها، تنظیمات، رویدادها
// نکته‌ی امنیتی: سرور مستقل از این فایل هم دسترسی را چک می‌کند؛ گاردِ زیر فقط تجربه‌ی کاربری است.

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => PG.esc(s);
  const thumb = (s) => PG.thumb(s);
  const money = (n) => PG.money(n);

  // ---------- کمک‌کارهای فارسی ----------
  const STATUS_FA = {
    paid: 'در انتظار ارسال', shipped: 'ارسال شده', delivered: 'تحویل شده',
    pending_payment: 'در انتظار پرداخت', failed: 'ناموفق', canceled: 'لغو شده',
    return_requested: 'درخواست مرجوعی', returned: 'مرجوع شده'
  };
  const ACTION_FA = {
    order_status: 'تغییر وضعیت سفارش', order_cancel: 'لغو سفارش', order_note: 'یادداشت سفارش',
    order_tracking: 'کد رهگیری', order_manual: 'سفارش دستی', review_status: 'وضعیت نظر',
    coupon_create: 'ساخت کد تخفیف', coupon_update: 'ویرایش کد تخفیف', coupon_delete: 'حذف کد تخفیف',
    product_create: 'ساخت محصول', product_update: 'ویرایش محصول',
    product_delete: 'حذف محصول', product_zeroed: 'ناموجود کردن محصول', product_bulk: 'ویرایش گروهی',
    product_publish: 'انتشار در سایت', product_unpublish: 'برداشتن از سایت',
    settings_update: 'تغییر تنظیمات', backup: 'بکاپ دیتابیس', export_csv: 'خروجی اکسل',
    category_create: 'ساخت دسته‌بندی', category_update: 'ویرایش دسته‌بندی',
    category_delete: 'حذف دسته‌بندی', category_move: 'جابه‌جایی دسته‌بندی',
    image_upload: 'آپلود عکس', staff_grant: 'دادن نقش کارمند', staff_revoke: 'گرفتن نقش کارمند',
    login_ok: 'ورود به پنل', login_failed: 'ورود ناموفق به پنل'
  };
  const ACTION_TONE = {
    order_cancel: 'bad', product_delete: 'bad', product_zeroed: 'warn',
    product_bulk: 'warn', settings_update: 'warn',
    // زرد نه قرمز: برداشتن از سایت برگشت‌پذیر است، ولی محصول از دیدِ مشتری غیب می‌شود
    product_unpublish: 'warn',
    category_delete: 'bad', staff_grant: 'warn', staff_revoke: 'warn',
    // قرمز چون این تنها سطری است که ممکن است کارِ خودِ مدیر نباشد
    login_failed: 'bad'
  };
  const ICON_CHOICES = ['i-package', 'i-box', 'i-bucket', 'i-tub', 'i-basket', 'i-chair',
    'i-hanger', 'i-dishrack', 'i-table', 'i-broom', 'i-tag'];

  // تاریخ شمسیِ خوانا از رشته‌ی UTC دیتابیس
  function toDate(s) {
    if (!s) return null;
    const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z');
    return isNaN(d) ? null : d;
  }
  const faDate = (s) => { const d = toDate(s); return d ? d.toLocaleDateString('fa-IR') : '—'; };
  const faFull = (s) => { const d = toDate(s); return d ? d.toLocaleString('fa-IR') : '—'; };
  // «۲ ساعت پیش» — برای دفتر رویدادها
  function ago(s) {
    const d = toDate(s); if (!d) return '—';
    const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (sec < 60) return 'همین حالا';
    if (sec < 3600) return `${money(Math.floor(sec / 60))} دقیقه پیش`;
    if (sec < 86400) return `${money(Math.floor(sec / 3600))} ساعت پیش`;
    if (sec < 604800) return `${money(Math.floor(sec / 86400))} روز پیش`;
    return faDate(s);
  }
  // برچسب کوتاه روزِ نمودار
  function dayLabel(iso) {
    const d = toDate(iso + 'T00:00:00');
    return d ? d.toLocaleDateString('fa-IR', { month: 'numeric', day: 'numeric' }) : iso;
  }
  const badge = (st) => `<span class="status-badge status-${esc(st)}">${esc(STATUS_FA[st] || st)}</span>`;
  const skel = (n = 4) => Array.from({ length: n }, () => '<div class="ad-skel ad-skel-row"></div>').join('');
  const emptyBox = (icon, text) =>
    `<div class="ad-list-empty"><svg><use href="#${icon}"/></svg>${esc(text)}</div>`;

  // ============================================================
  // گارد دسترسی
  // ============================================================
  let me = null;
  try { ({ user: me } = await PG.api('/auth/me')); } catch (e) { /* خطای شبکه */ }
  if (!me) { location.href = '/login.html?next=' + encodeURIComponent('/admin.html'); return; }
  if (!me.isAdmin && !me.isStaff) {
    $('adminGuard').innerHTML = `
      <div class="empty-state">
        <svg><use href="#i-lock"/></svg>
        <h3>دسترسی مجاز نیست</h3>
        <p>این صفحه مخصوص مدیر فروشگاه است.</p>
        <a href="/index.html" class="btn btn-primary">بازگشت به فروشگاه</a>
      </div>`;
    return;
  }
  $('adminGuard').classList.add('hidden');
  $('adminApp').classList.remove('hidden');

  // نشستِ پنل بعد از نیم‌ساعت بی‌کاری بسته می‌شود (سرور تصمیم می‌گیرد، نه اینجا).
  // چرا پرده‌ی تمام‌صفحه و نه toast: پنل ممکن است نیمه‌کاره رها شده باشد و
  // مدیر برگردد و روی داده‌ی بیات کار کند. once تا اگر چند درخواست هم‌زمان
  // ۴۰۱ گرفتند، فقط یک پرده بالا بیاید.
  document.addEventListener('pg:idle-logout', (e) => {
    $('adminApp').classList.add('hidden');
    $('adminGuard').classList.remove('hidden');
    $('adminGuard').innerHTML = `
      <div class="empty-state">
        <svg><use href="#i-lock"/></svg>
        <h3>نشست پنل بسته شد</h3>
        <p>${esc(e.detail?.message || 'به‌خاطر بی‌کاری از پنل خارج شدید.')}</p>
        <a href="/login.html?next=${encodeURIComponent('/admin.html')}" class="btn btn-primary">ورود دوباره</a>
      </div>`;
  }, { once: true });

  // کارمند فقط تب سفارش‌ها را می‌بیند
  if (!me.isAdmin && me.isStaff) {
    document.querySelectorAll('#adminNav button:not([data-view="orders"])').forEach(b => b.style.display = 'none');
  }

  $('dashHello').textContent = `سلام ${me.fullName || (me.isStaff ? 'کارمند' : 'مدیر')} 👋 — یک نگاه کلی به وضعیت فروشگاه.`;

  // خروجِ ناموفق نباید بی‌صدا بماند: نشستِ ادمین که باز بماند و کاربر فکر کند
  // بسته شده، بدترین حالت است — دسترسی به کل پنل پشت همان یک کوکی است.
  $('btnAdminLogout').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    try {
      await PG.api('/auth/logout', { method: 'POST' });
      location.href = '/index.html';
    } catch (err) {
      delete btn.dataset.busy;
      PG.toast(`${err.message} خروج انجام نشد؛ دوباره بزن.`, 'error');
    }
  });

  // ============================================================
  // ناوبری بخش‌ها (با هش آدرس، تا رفرش همان‌جا بماند)
  // ============================================================
  const VIEWS = ['dash', 'orders', 'stock', 'people', 'crm', 'reviews', 'coupons', 'wholesale', 'report', 'config', 'log', 'errors'];
  const LOADED = new Set();

  function show(view) {
    if (!VIEWS.includes(view)) view = 'dash';
    // کارمند فقط به سفارش‌ها دسترسی دارد
    if (!me.isAdmin && me.isStaff && view !== 'orders') view = 'orders';
    VIEWS.forEach(v => $('view' + v[0].toUpperCase() + v.slice(1)).classList.toggle('hidden', v !== view));
    document.querySelectorAll('#adminNav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // بخش‌ها فقط بار اول داده می‌گیرند (بارگذاری تنبل)
    if (!LOADED.has(view)) { LOADED.add(view); LOADERS[view]?.(); }
  }
  $('adminNav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (b) show(b.dataset.view);
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));

  // ============================================================
  // نمودار خطی (SVG دست‌ساز — بدون کتابخانه)
  // ============================================================
  function drawChart(host, series) {
    if (!series || !series.length) { host.innerHTML = `<div class="chart-empty">داده‌ای برای نمایش نیست</div>`; return; }
    // viewBox با نسبت محفوظ کشیده می‌شود تا نقطه‌ها گرد بمانند؛
    // عرضش را با تعداد روزها تنظیم می‌کنیم تا فاصله‌ها یکنواخت باشد.
    const H = 210, padX = 10, padTop = 16, padBottom = 26;
    const n = series.length;
    const W = Math.max(560, Math.min(1100, n * 46));
    const max = Math.max(...series.map(p => p.sales), 1);
    const base = H - padBottom;               // خط پایه‌ی نمودار
    const plotH = base - padTop;              // ارتفاع مفید برای داده
    const x = (i) => padX + (i * (W - padX * 2)) / Math.max(n - 1, 1);
    const y = (v) => base - (v / max) * plotH;

    const pts = series.map((p, i) => [x(i), y(p.sales)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L${pts[n - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`;
    const grid = [0, .25, .5, .75, 1].map(f => {
      const gy = (padTop + f * plotH).toFixed(1);
      return `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}"/>`;
    }).join('');
    // فقط چند نقطه‌ی نشانه‌گذاری‌شده تا شلوغ نشود
    const step = Math.max(1, Math.round(n / 12));
    const dots = pts.map((p, i) => (i % step === 0 || i === n - 1)
      ? `<circle class="chart-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2"/>` : '').join('');
    // ناحیه‌ی حساسِ نامرئی برای تولتیپ (کل ستون هر روز)
    const bw = (W - padX * 2) / Math.max(n - 1, 1);
    const hits = series.map((p, i) =>
      `<rect class="chart-hit" data-i="${i}" x="${(x(i) - bw / 2).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${base}"/>`).join('');

    const labelIdx = n <= 8 ? series.map((_, i) => i)
      : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1];
    // برچسب‌ها داخل خود SVG رسم می‌شوند تا دقیقاً زیر نقطه‌ی خودشان بیفتند
    const labels = labelIdx.map(i => {
      const px = x(i);
      const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      return `<text class="chart-xlabel" x="${px.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(dayLabel(series[i].day))}</text>`;
    }).join('');

    host.innerHTML = `
      <div class="chart-ymax">سقف بازه: ${money(max)} تومان</div>
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="نمودار فروش">
        <defs>
          <linearGradient id="adChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1CC9AD" stop-opacity=".28"/>
            <stop offset="100%" stop-color="#1CC9AD" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <g class="chart-grid">${grid}</g>
        <path class="chart-area" d="${area}"/>
        <path class="chart-line" d="${line}"/>
        ${dots}${labels}${hits}
      </svg>
      <div class="chart-tip" id="chartTip"></div>`;

    // تولتیپ
    const svg = host.querySelector('.chart-svg');
    const tip = host.querySelector('.chart-tip');
    svg.addEventListener('pointermove', (e) => {
      const hit = e.target.closest('.chart-hit');
      if (!hit) return;
      const p = series[Number(hit.dataset.i)];
      tip.innerHTML = `${esc(dayLabel(p.day))} — <b>${money(p.sales)}</b> تومان<br>${money(p.orders)} سفارش`;
      const box = svg.getBoundingClientRect();
      tip.style.left = (e.clientX - box.left) + 'px';
      tip.style.top = (e.clientY - box.top) + 'px';
      tip.classList.add('show');
    });
    svg.addEventListener('pointerleave', () => tip.classList.remove('show'));
  }

  // میله‌های افقی (پرفروش‌ها / دسته‌ها)
  function drawBars(host, rows, { name, value, fmt = money, suffix = '' }) {
    if (!rows || !rows.length) { host.innerHTML = emptyBox('i-chart', 'هنوز داده‌ای ثبت نشده'); return; }
    const max = Math.max(...rows.map(r => Number(r[value]) || 0), 1);
    host.innerHTML = `<div class="bar-list">` + rows.map(r => `
      <div class="bar-row">
        <span class="bar-name">${esc(r[name] || '—')}</span>
        <span class="bar-val">${fmt(r[value])}${esc(suffix)}</span>
        <span class="bar-track"><span class="bar-fill" data-w="${((Number(r[value]) || 0) / max * 100).toFixed(1)}"></span></span>
      </div>`).join('') + `</div>`;
    // درصدِ هر میله محاسبه‌شدنی است، پس با کلاسِ ثابت بیان نمی‌شود. صفتِ style=""
    // هم با بستنِ style-src در CSP بلوکه می‌شود — ولی نوشتن روی el.style از
    // جاوااسکریپت بلوکه نمی‌شود. پس عدد در data-w می‌آید و همین‌جا اعمال می‌شود.
    for (const el of host.querySelectorAll('.bar-fill')) el.style.width = el.dataset.w + '%';
  }

  // کارت آماری
  function kpi({ label, num, unit = '', sub = '', tone = '', icon = 'i-chart', trend = '', jump = '' }) {
    return `
      <div class="kpi ${tone} ${jump ? 'clickable' : ''}" ${jump ? `data-jump="${esc(jump)}"` : ''}>
        <div class="kpi-top"><svg><use href="#${esc(icon)}"/></svg><span class="kpi-label">${esc(label)}</span></div>
        <div class="kpi-num">${num}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
        ${sub ? `<div class="kpi-sub ${trend}">${trend ? `<svg><use href="#i-trend-${trend}"/></svg>` : ''}<span>${sub}</span></div>` : ''}
      </div>`;
  }
  // پرش با کلیک روی کارت آماری
  document.addEventListener('click', (e) => {
    const k = e.target.closest('.kpi[data-jump]');
    if (k) show(k.dataset.jump);
  });

  // ============================================================
  // ۱) داشبورد
  // ============================================================
  let SETTINGS = {};

  async function loadDash() {
    $('dashKpis').innerHTML = Array.from({ length: 6 }, () => '<div class="ad-skel ad-skel-kpi"></div>').join('');
    try {
      const d = await PG.api('/admin/overview');
      const s = d.stats;

      // مقایسه‌ی هفته‌ی جاری با میانگین ماه (سرانگشتی ولی گویا)
      const weekAvg = s.month_sales ? Math.round(s.month_sales / 4) : 0;
      const weekTrend = !weekAvg ? '' : (s.week_sales >= weekAvg ? 'up' : 'down');

      $('dashKpis').innerHTML = [
        kpi({ label: 'فروش امروز', num: money(s.today_sales), unit: 'تومان', icon: 'i-wallet',
          sub: `${money(s.today_orders)} سفارش امروز` }),
        kpi({ label: 'فروش این هفته', num: money(s.week_sales), unit: 'تومان', icon: 'i-chart', tone: 'blue',
          sub: weekAvg ? `میانگین هفتگی ماه: ${money(weekAvg)}` : 'هنوز مبنایی برای مقایسه نیست', trend: weekTrend }),
        kpi({ label: 'در انتظار ارسال', num: money(s.awaiting_shipment), unit: 'سفارش', icon: 'i-package',
          tone: s.awaiting_shipment ? 'gold' : '', jump: 'orders',
          sub: s.in_transit ? `${money(s.in_transit)} سفارش در راه` : 'چیزی در راه نیست' }),
        kpi({ label: 'فروش کل', num: money(s.total_sales), unit: 'تومان', icon: 'i-trend-up', tone: 'purple',
          sub: `${money(s.total_orders)} سفارش موفق · میانگین ${money(s.avg_order)}` }),
        kpi({ label: 'مشتری‌ها', num: money(s.total_users), unit: 'نفر', icon: 'i-users', jump: 'people',
          sub: s.new_users_week ? `${money(s.new_users_week)} عضو جدید این هفته` : 'عضو جدیدی این هفته نبوده' }),
        kpi({ label: 'هشدار انبار', num: money(s.low_stock + s.out_of_stock), unit: 'کالا', icon: 'i-warehouse',
          tone: (s.low_stock + s.out_of_stock) ? 'coral' : '', jump: 'stock',
          sub: `${money(s.out_of_stock)} ناموجود · ${money(s.low_stock)} رو به اتمام` }),
        kpi({ label: 'درخواست مرجوعی', num: money(s.return_requests || 0), unit: 'سفارش', icon: 'i-refresh',
          tone: s.return_requests ? 'gold' : '', jump: 'orders',
          sub: s.return_requests ? 'منتظر تصمیم شماست' : 'درخواست بازی نیست' }),
        kpi({ label: 'نظر در انتظار تأیید', num: money(s.pending_reviews || 0), unit: 'نظر', icon: 'i-quote',
          tone: s.pending_reviews ? 'gold' : '', jump: 'reviews',
          sub: s.pending_reviews ? 'تا تأیید نکنید روی سایت نمی‌رود' : 'صف خالی است' }),
        kpi({ label: 'بازدید امروز سایت', num: money(s.today_visits || 0), unit: 'بازدید', icon: 'i-eye', tone: 'blue',
          sub: 'شمارش صفحه‌ها، بدون ردیابی شخصی' }),
        kpi({ label: 'کارایی سرور', num: money(d.metrics ? d.metrics.slowRequests : 0), unit: 'درخواست کند', icon: 'i-database',
          tone: (d.metrics && d.metrics.slowRequests > 0) ? 'coral' : '',
          sub: d.metrics ? `p95: ${money(d.metrics.p95Ms)}ms · ${money(d.metrics.totalRequests)} درخواست` : '' })
      ].join('');

      drawChart($('chartHost'), d.series);
      drawBars($('dashTop'), d.topProducts.slice(0, 6), { name: 'title', value: 'revenue' });
      drawBars($('dashCats'), d.categories, { name: 'category', value: 'revenue' });

      // نیاز به توجه
      const alerts = d.lowStock;
      $('dashAlerts').innerHTML = alerts.length ? `<div class="ad-list">` + alerts.map(p => `
        <div class="ad-list-row">
          <span class="ad-thumb">${p.image ? `<img src="${esc(thumb(p.image))}" alt="">` : `<svg><use href="#${esc(p.icon || 'i-package')}"/></svg>`}</span>
          <span class="grow"><b>${esc(p.title)}</b><small>${esc(p.category)}</small></span>
          <span class="val ${p.stock ? 'warn' : 'bad'}">${p.stock ? `${money(p.stock)} عدد` : 'ناموجود'}</span>
        </div>`).join('') + `</div>`
        : emptyBox('i-check-circle', 'موجودی همه‌ی کالاها سالم است 👌');

      // برترین مشتری‌ها
      $('dashCustomers').innerHTML = d.topCustomers.length ? `<div class="ad-list">` + d.topCustomers.map((c, i) => `
        <div class="ad-list-row">
          <span class="rank ${i === 0 ? 'top' : ''}">${money(i + 1)}</span>
          <span class="grow"><b>${esc(c.fullName || 'بدون نام')}</b><small><bdo dir="ltr">${esc(c.phone)}</bdo> · ${money(c.orders)} سفارش</small></span>
          <span class="val">${money(c.spent)}</span>
        </div>`).join('') + `</div>`
        : emptyBox('i-users', 'هنوز خریدی ثبت نشده');

      // تقاضای از‌دست‌رفته
      $('dashLost').innerHTML = d.wishedOutOfStock.length ? `<div class="ad-list">` + d.wishedOutOfStock.map(p => `
        <div class="ad-list-row">
          <span class="rank"><svg class="ic-12"><use href="#i-heart-fill"/></svg></span>
          <span class="grow"><b>${esc(p.title)}</b><small>ناموجود است و ${money(p.wishers)} نفر منتظرند</small></span>
          <span class="val bad">${money(p.wishers)} نفر</span>
        </div>`).join('') + `</div>`
        : emptyBox('i-heart', 'کالای ناموجودی در علاقه‌مندی‌ها نیست');

      // عددهای کنار منو
      $('navOrders').textContent = money(s.awaiting_shipment);
      $('navOrders').classList.toggle('urgent', s.awaiting_shipment > 0);
      $('navStock').textContent = money(s.low_stock + s.out_of_stock);
      $('navStock').classList.toggle('urgent', (s.low_stock + s.out_of_stock) > 0);
      $('navPeople').textContent = money(s.total_users);
      $('navReviews').textContent = money(s.pending_reviews || 0);
      $('navReviews').classList.toggle('urgent', (s.pending_reviews || 0) > 0);
      $('navWholesale').textContent = money(d.newWholesaleRequests || 0);
      $('navWholesale').classList.toggle('urgent', (d.newWholesaleRequests || 0) > 0);
    } catch (e) {
      $('dashKpis').innerHTML = `<div class="alert alert-error span-all"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  $('chartRange').addEventListener('change', async (e) => {
    $('chartHost').innerHTML = '<div class="ad-skel skel-190"></div>';
    try {
      const { series } = await PG.api(`/admin/sales-series?days=${encodeURIComponent(e.target.value)}`);
      drawChart($('chartHost'), series);
    } catch (err) { PG.toast(err.message, 'error'); }
  });

  // بکاپ (دو دکمه، یک رفتار)
  async function doBackup(btn) {
    btn.disabled = true;
    try {
      const r = await PG.api('/admin/backup', { method: 'POST' });
      PG.toast(`بکاپ ساخته شد: ${r.file}`, 'success');
      if (LOADED.has('log')) loadLog();
    } catch (e) { PG.toast(e.message, 'error'); }
    finally { btn.disabled = false; }
  }
  $('btnBackup').addEventListener('click', (e) => doBackup(e.currentTarget));
  $('btnBackup2').addEventListener('click', (e) => doBackup(e.currentTarget));

  // ============================================================
  // ۲) سفارش‌ها
  // ============================================================
  const OQ = { status: 'all', q: '', from: '', to: '', limit: 40, offset: 0 };
  let ORDER_COUNTS = {};
  let ORDER_TOTAL = 0;
  const OPEN_ORDERS = new Set(); // شماره‌ی سفارش‌های بازشده (بین رفرش‌ها یادش می‌ماند)

  const CHIP_DEFS = [
    ['all', 'همه'], ['active', 'در جریان'], ['paid', 'در انتظار ارسال'], ['shipped', 'ارسال شده'],
    ['delivered', 'تحویل شده'], ['return_requested', 'درخواست مرجوعی'], ['returned', 'مرجوع شده'],
    ['pending_payment', 'در انتظار پرداخت'], ['failed', 'ناموفق'], ['canceled', 'لغو شده']
  ];
  function renderChips() {
    $('orderChips').innerHTML = CHIP_DEFS.map(([k, label]) => {
      const n = k === 'active' ? (ORDER_COUNTS.paid || 0) + (ORDER_COUNTS.shipped || 0) : ORDER_COUNTS[k];
      return `<button class="ad-chip ${OQ.status === k ? 'active' : ''}" data-f="${k}">${esc(label)}${
        n !== undefined ? ` <b>${money(n)}</b>` : ''}</button>`;
    }).join('');
  }

  function orderQS(extra = {}) {
    const p = new URLSearchParams();
    const q = { ...OQ, ...extra };
    p.set('status', q.status);
    if (q.q) p.set('q', q.q);
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    p.set('limit', q.limit); p.set('offset', q.offset);
    return p.toString();
  }

  async function loadOrders() {
    $('ordersHost').innerHTML = skel(4);
    try {
      const d = await PG.api('/admin/orders?' + orderQS());
      ORDER_COUNTS = d.counts || {};
      ORDER_TOTAL = d.total ?? d.orders.length;
      renderChips();
      renderOrders(d.orders, d.sum || 0);
      $('navOrders').textContent = money(ORDER_COUNTS.paid || 0);
      $('navOrders').classList.toggle('urgent', (ORDER_COUNTS.paid || 0) > 0);
    } catch (e) {
      $('ordersHost').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  function renderOrders(list, sum) {
    const from = ORDER_TOTAL ? OQ.offset + 1 : 0;
    const to = OQ.offset + list.length;
    $('orderResultBar').innerHTML = `
      <span>${ORDER_TOTAL ? `نمایش <b>${money(from)}</b> تا <b>${money(to)}</b> از <b>${money(ORDER_TOTAL)}</b> سفارش` : 'نتیجه‌ای نبود'}</span>
      ${sum ? `<span>جمع مبلغ این نتایج: <span class="sum">${money(sum)} تومان</span></span>` : ''}`;

    if (!list.length) {
      $('ordersHost').innerHTML = `<div class="empty-state"><svg><use href="#i-package"/></svg>
        <h3>سفارشی با این فیلترها پیدا نشد</h3><p>فیلترها یا بازه‌ی تاریخ را عوض کنید.</p></div>`;
      $('ordersPager').innerHTML = '';
      return;
    }

    $('ordersHost').innerHTML = list.map(o => {
      const a = o.address || {};
      const open = OPEN_ORDERS.has(o.id);
      const urgent = o.status === 'paid';
      return `
      <article class="ad-order ${open ? 'open' : ''} ${urgent ? 'urgent' : ''}" data-id="${o.id}">
        <div class="ad-order-bar" role="button" tabindex="0" aria-expanded="${open}">
          <span class="ad-order-id">#${money(o.id)}<small>${esc(faDate(o.createdAt))}</small></span>
          ${badge(o.status)}
          <span class="ad-order-who">
            <b>${esc(o.userName || 'بدون نام')}</b>
            <small><bdo dir="ltr">${esc(o.userPhone)}</bdo>${a.city ? ` · ${esc(a.city)}` : ''}</small>
          </span>
          <span class="ad-order-sum">${money(o.total)} <small>تومان</small></span>
          <span class="caret"><svg><use href="#i-chevron-down"/></svg></span>
        </div>
        <div class="ad-order-body">
          <div class="ad-order-cols">
            <div class="ad-block">
              <h4>اقلام سفارش (${money(o.items.length)} ردیف)</h4>
              <div class="ad-items">
                ${o.items.map(i => `
                  <div class="ad-item">
                    <span class="n">${money(i.qty)}</span>
                    <span class="t">${esc(i.title)}</span>
                    <span class="p">${money(i.price)} × ${money(i.qty)} = ${money(i.price * i.qty)}</span>
                  </div>`).join('')}
              </div>
              <div class="ad-item-total"><span>مبلغ کل</span><span>${money(o.total)} تومان</span></div>
            </div>
            <div class="ad-block">
              <h4>اطلاعات ارسال</h4>
              <div class="ad-facts">
                <div class="ad-fact"><svg><use href="#i-user"/></svg>
                  <span class="k">گیرنده:</span>
                  <span class="v">${esc(a.fullName || o.userName || '—')}</span></div>
                <div class="ad-fact"><svg><use href="#i-phone"/></svg>
                  <span class="k">موبایل:</span>
                  <span class="v"><bdo dir="ltr">${esc(a.phone || o.userPhone)}</bdo>
                    <button class="ad-copy" data-copy="${esc(a.phone || o.userPhone)}" title="کپی شماره"><svg><use href="#i-copy"/></svg></button>
                    <a class="ad-copy" href="tel:${esc(a.phone || o.userPhone)}" title="تماس"><svg><use href="#i-phone"/></svg></a>
                  </span></div>
                <div class="ad-fact"><svg><use href="#i-pin"/></svg>
                  <span class="k">آدرس:</span>
                  <span class="v">${esc([a.province, a.city, a.addressLine].filter(Boolean).join('، ') || '—')}
                    ${a.postalCode ? `<br>کدپستی: <bdo dir="ltr">${esc(a.postalCode)}</bdo>
                    <button class="ad-copy" data-copy="${esc(a.postalCode)}" title="کپی کدپستی"><svg><use href="#i-copy"/></svg></button>` : ''}
                  </span></div>
                <div class="ad-fact"><svg><use href="#i-clock"/></svg>
                  <span class="k">ثبت:</span><span class="v">${esc(faFull(o.createdAt))}</span></div>
                ${o.refId ? `<div class="ad-fact"><svg><use href="#i-wallet"/></svg>
                  <span class="k">شماره تراکنش:</span><span class="v"><bdo dir="ltr">${esc(o.refId)}</bdo></span></div>` : ''}
                ${o.trackingCode ? `<div class="ad-fact"><svg><use href="#i-truck"/></svg>
                  <span class="k">کد رهگیری:</span><span class="v"><bdo dir="ltr">${esc(o.trackingCode)}</bdo>
                  <button class="ad-copy" data-copy="${esc(o.trackingCode)}" title="کپی"><svg><use href="#i-copy"/></svg></button></span></div>` : ''}
                ${o.cancelReason ? `<div class="ad-fact"><svg><use href="#i-ban"/></svg>
                  <span class="k">علت لغو:</span><span class="v">${esc(o.cancelReason)}</span></div>` : ''}
                ${o.returnReason ? `<div class="ad-fact"><svg><use href="#i-refresh"/></svg>
                  <span class="k">دلیل مرجوعی مشتری:</span><span class="v">${esc(o.returnReason)}</span></div>` : ''}
                ${o.shippingFee > 0 ? `<div class="ad-fact"><svg><use href="#i-truck"/></svg>
                  <span class="k">هزینه ارسال:</span><span class="v">${money(o.shippingFee)} تومان (داخل مبلغ کل)</span></div>` : ''}
                ${o.discount > 0 ? `<div class="ad-fact"><svg><use href="#i-tag"/></svg>
                  <span class="k">تخفیف:</span><span class="v">${money(o.discount)} تومان${o.couponCode ? ` — کد <bdo dir="ltr">${esc(o.couponCode)}</bdo>` : ''}</span></div>` : ''}
                ${o.adminNote ? `<div class="ad-fact"><svg><use href="#i-note"/></svg>
                  <span class="k">یادداشت:</span><span class="v">${esc(o.adminNote)}</span></div>` : ''}
              </div>
            </div>
          </div>

          <div class="ad-order-tools">
            ${statusButtons(o)}
            ${['paid', 'shipped'].includes(o.status) ? `
              <span class="ad-inline-input">
                <input type="text" class="in-track" value="${esc(o.trackingCode)}" placeholder="کد رهگیری پستی" dir="ltr" maxlength="60">
                <button class="act-track" title="ذخیره‌ی کد رهگیری"><svg><use href="#i-save"/></svg></button>
              </span>` : ''}
            <span class="ad-inline-input wide ad-note-box">
              <input type="text" class="in-note" value="${esc(o.adminNote)}" placeholder="یادداشت داخلی (فقط شما می‌بینید)" maxlength="500">
              <button class="act-note" title="ذخیره‌ی یادداشت"><svg><use href="#i-save"/></svg></button>
            </span>
            <button class="btn btn-ghost btn-sm act-print"><svg><use href="#i-print"/></svg> فاکتور</button>
          </div>
        </div>
      </article>`;
    }).join('');

    // صفحه‌بندی
    const pages = Math.ceil(ORDER_TOTAL / OQ.limit) || 1;
    const cur = Math.floor(OQ.offset / OQ.limit) + 1;
    $('ordersPager').innerHTML = pages <= 1 ? '' : `
      <button class="btn btn-outline btn-sm" data-page="${cur - 1}" ${cur <= 1 ? 'disabled' : ''}>قبلی</button>
      <span class="ad-chip cur-default">صفحه ${money(cur)} از ${money(pages)}</span>
      <button class="btn btn-outline btn-sm" data-page="${cur + 1}" ${cur >= pages ? 'disabled' : ''}>بعدی</button>`;
  }

  // دکمه‌های تغییر وضعیت بر اساس مسیر منطقی سفارش
  function statusButtons(o) {
    const b = [];
    if (o.status === 'paid') b.push(`<button class="btn btn-primary btn-sm act-status" data-from="paid" data-to="shipped"><svg><use href="#i-truck"/></svg> ارسال شد</button>`);
    if (o.status === 'shipped') {
      b.push(`<button class="btn btn-primary btn-sm act-status" data-from="shipped" data-to="delivered"><svg><use href="#i-check-circle"/></svg> تحویل شد</button>`);
      b.push(`<button class="btn btn-ghost btn-sm act-status" data-from="shipped" data-to="paid">برگشت به انتظار ارسال</button>`);
    }
    if (o.status === 'delivered') b.push(`<button class="btn btn-ghost btn-sm act-status" data-from="delivered" data-to="shipped">برگشت به ارسال شده</button>`);
    if (o.status === 'return_requested') {
      // مشتری درخواست مرجوعی داده — تأیید یعنی کالا برگشته و موجودی هم برمی‌گردد
      b.push(`<button class="btn btn-primary btn-sm act-status" data-from="return_requested" data-to="returned"><svg><use href="#i-check-circle"/></svg> تأیید مرجوعی</button>`);
      b.push(`<button class="btn btn-ghost btn-sm act-status" data-from="return_requested" data-to="delivered">رد درخواست</button>`);
    }
    if (['paid', 'shipped', 'delivered', 'return_requested'].includes(o.status)) {
      b.push(`<button class="btn btn-ghost btn-sm act-cancel txt-danger"><svg><use href="#i-ban"/></svg> لغو سفارش</button>`);
    }
    return b.join('');
  }

  // ---------- رویدادهای بخش سفارش ----------
  $('ordersHost').addEventListener('click', async (e) => {
    const card = e.target.closest('.ad-order');
    if (!card) return;
    const id = Number(card.dataset.id);

    // باز/بسته کردن
    if (e.target.closest('.ad-order-bar')) {
      const willOpen = !card.classList.contains('open');
      card.classList.toggle('open', willOpen);
      card.querySelector('.ad-order-bar').setAttribute('aria-expanded', String(willOpen));
      if (willOpen) OPEN_ORDERS.add(id); else OPEN_ORDERS.delete(id);
      return;
    }

    // کپی
    const cp = e.target.closest('.ad-copy[data-copy]');
    if (cp) {
      try { await navigator.clipboard.writeText(cp.dataset.copy); PG.toast('کپی شد', 'success'); }
      catch { PG.toast('مرورگر اجازه‌ی کپی نداد', 'error'); }
      return;
    }

    // تغییر وضعیت
    const st = e.target.closest('.act-status');
    if (st) {
      st.disabled = true;
      try {
        await PG.api(`/admin/orders/${id}/status`, {
          method: 'POST',
          body: JSON.stringify({ from: st.dataset.from, to: st.dataset.to })
        });
        PG.toast('وضعیت سفارش به‌روز شد ✅', 'success');
        await afterOrderChange(id);
      } catch (err) { PG.toast(err.message, 'error'); st.disabled = false; }
      return;
    }

    // لغو سفارش
    if (e.target.closest('.act-cancel')) { openCancel(id); return; }

    // ذخیره‌ی کد رهگیری
    if (e.target.closest('.act-track')) {
      const input = card.querySelector('.in-track');
      const btn = e.target.closest('.act-track');
      btn.disabled = true;
      try {
        await PG.api(`/admin/orders/${id}/tracking`, {
          method: 'POST', body: JSON.stringify({ trackingCode: input.value.trim() })
        });
        PG.toast('کد رهگیری ذخیره شد', 'success');
        await afterOrderChange(id);
      } catch (err) { PG.toast(err.message, 'error'); btn.disabled = false; }
      return;
    }

    // ذخیره‌ی یادداشت
    if (e.target.closest('.act-note')) {
      const input = card.querySelector('.in-note');
      const btn = e.target.closest('.act-note');
      btn.disabled = true;
      try {
        await PG.api(`/admin/orders/${id}/note`, {
          method: 'POST', body: JSON.stringify({ note: input.value })
        });
        PG.toast('یادداشت ذخیره شد', 'success');
        await afterOrderChange(id);
      } catch (err) { PG.toast(err.message, 'error'); btn.disabled = false; }
      return;
    }

    // چاپ فاکتور
    if (e.target.closest('.act-print')) { printInvoice(id); return; }
  });

  // کلید Enter روی نوار سفارش
  $('ordersHost').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('ad-order-bar')) {
      e.preventDefault(); e.target.click();
    }
  });
  // Enter داخل فیلدهای کد رهگیری/یادداشت = ذخیره
  $('ordersHost').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.classList.contains('in-track')) { e.preventDefault(); e.target.closest('.ad-inline-input').querySelector('.act-track').click(); }
    if (e.target.classList.contains('in-note')) { e.preventDefault(); e.target.closest('.ad-inline-input').querySelector('.act-note').click(); }
  });

  async function afterOrderChange(id) {
    OPEN_ORDERS.add(id);
    await loadOrders();
    if (LOADED.has('dash')) loadDash();
    if (LOADED.has('log')) loadLog();
    if (LOADED.has('stock')) loadStock(); // لغو سفارش موجودی را عوض می‌کند
  }

  // چیپ‌های فیلتر
  $('orderChips').addEventListener('click', (e) => {
    const c = e.target.closest('.ad-chip[data-f]');
    if (!c) return;
    OQ.status = c.dataset.f; OQ.offset = 0;
    loadOrders();
  });

  // جستجو با تاخیر (debounce)
  function debounce(fn, ms = 350) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  const runOrderSearch = debounce(() => { OQ.offset = 0; loadOrders(); });
  $('orderSearch').addEventListener('input', (e) => {
    OQ.q = e.target.value.trim();
    $('orderSearchWrap').classList.toggle('has-value', !!OQ.q);
    runOrderSearch();
  });
  $('orderSearchClear').addEventListener('click', () => {
    $('orderSearch').value = ''; OQ.q = ''; OQ.offset = 0;
    $('orderSearchWrap').classList.remove('has-value');
    loadOrders();
  });
  $('orderFrom').addEventListener('change', (e) => { OQ.from = e.target.value; OQ.offset = 0; loadOrders(); });
  $('orderTo').addEventListener('change', (e) => { OQ.to = e.target.value; OQ.offset = 0; loadOrders(); });
  $('orderLimit').addEventListener('change', (e) => { OQ.limit = Number(e.target.value); OQ.offset = 0; loadOrders(); });
  $('ordersPager').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-page]');
    if (!b || b.disabled) return;
    OQ.offset = (Number(b.dataset.page) - 1) * OQ.limit;
    loadOrders();
  });

  // خروجی CSV با همان فیلترهای جاری
  function exportCsv() {
    const p = new URLSearchParams();
    p.set('status', OQ.status);
    if (OQ.q) p.set('q', OQ.q);
    if (OQ.from) p.set('from', OQ.from);
    if (OQ.to) p.set('to', OQ.to);
    location.href = '/api/admin/export/orders.csv?' + p.toString();
    PG.toast('فایل اکسل در حال دانلود است…', 'info');
  }
  $('btnExportCsv').addEventListener('click', exportCsv);
  $('btnExportCsv2').addEventListener('click', exportCsv);

  // خروجی مشتری‌ها و انبار.
  // چرا location.href و نه fetch: مرورگر باید هدر Content-Disposition را ببیند
  // تا پنجره‌ی «ذخیره‌ی فایل» را باز کند؛ با fetch باید خودمان Blob و لینک
  // موقت بسازیم که روی سافاریِ موبایل قابل‌اعتماد نیست.
  // فیلترِ «فقط خریدارها» عمداً از همان انتخابِ روی صفحه خوانده می‌شود تا
  // چیزی که مدیر می‌بیند با چیزی که در فایل می‌گیرد یکی باشد.
  $('btnExportPeople').addEventListener('click', () => {
    const onlyBuyers = $('userFilter').value === 'buyers' ? '?buyers=1' : '';
    location.href = '/api/admin/export/customers.csv' + onlyBuyers;
    PG.toast('فایل مشتری‌ها در حال دانلود است…', 'info');
  });
  $('btnExportStock').addEventListener('click', () => {
    location.href = '/api/admin/export/inventory.csv';
    PG.toast('فایل انبار در حال دانلود است…', 'info');
  });

  // ---------- مودال لغو ----------
  let CANCEL_ID = null;
  function openCancel(id) {
    CANCEL_ID = id;
    $('cmTitle').textContent = `لغو سفارش #${money(id)}`;
    $('cmReason').value = '';
    openModal('cancelModal');
    $('cmReason').focus();
  }
  $('cmConfirm').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await PG.api(`/admin/orders/${CANCEL_ID}/cancel`, {
        method: 'POST', body: JSON.stringify({ reason: $('cmReason').value.trim() })
      });
      PG.toast('سفارش لغو شد و موجودی برگشت', 'success');
      closeModal('cancelModal');
      await afterOrderChange(CANCEL_ID);
    } catch (err) { PG.toast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
  $('cmDismiss').addEventListener('click', () => closeModal('cancelModal'));
  $('cmClose').addEventListener('click', () => closeModal('cancelModal'));

  // ---------- فاکتور چاپی ----------
  async function printInvoice(id) {
    let o;
    try { ({ order: o } = await PG.api(`/admin/orders/${id}`)); }
    catch (e) { return PG.toast(e.message, 'error'); }
    const a = o.address || {};
    const rows = o.items.map((i, n) => `<tr>
      <td>${money(n + 1)}</td><td>${esc(i.title)}</td><td>${money(i.qty)}</td>
      <td>${money(i.price)}</td><td>${money(i.price * i.qty)}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8">
      <title>فاکتور سفارش ${o.id}</title>
      <link rel="stylesheet" href="/css/invoice.css?v=42">
      </head><body class="ad-invoice">
      <div class="head">
        <div><h1>${esc(SETTINGS.shop_name || 'پلاسکو گلی')}</h1>
          <div class="meta">فاکتور فروش<br>
          ${SETTINGS.shop_phone ? `تلفن: ${esc(SETTINGS.shop_phone)}<br>` : ''}
          ${SETTINGS.shop_address ? esc(SETTINGS.shop_address) : ''}</div></div>
        <div class="meta"><b>شماره سفارش: ${money(o.id)}</b><br>
          تاریخ: ${esc(faFull(o.createdAt))}<br>
          وضعیت: ${esc(STATUS_FA[o.status] || o.status)}
          ${o.trackingCode ? `<br>کد رهگیری: ${esc(o.trackingCode)}` : ''}</div>
      </div>
      <div class="meta"><b>خریدار:</b> ${esc(a.fullName || o.userName || '—')} — ${esc(a.phone || o.userPhone)}<br>
      <b>آدرس:</b> ${esc([a.province, a.city, a.addressLine].filter(Boolean).join('، ') || '—')}
      ${a.postalCode ? ` — کدپستی ${esc(a.postalCode)}` : ''}</div>
      <table><thead><tr><th>#</th><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4">مبلغ کل (تومان)</td><td>${money(o.total)}</td></tr></tfoot></table>
      <div class="foot">این فاکتور از پنل مدیریت صادر شده است. ${esc(SETTINGS.announcement || '')}</div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return PG.toast('مرورگر پنجره‌ی چاپ را بست؛ pop-up را اجازه بدهید', 'error');
    w.document.write(html); w.document.close();
    // چاپ از همین‌جا صدا زده می‌شود، نه با <script> داخلِ آن HTML: پنجره‌ای که با
    // window.open('') باز شود CSP صفحه‌ی مادر را به ارث می‌برد، پس script-src 'self'
    // اسکریپتِ درون‌خطی‌اش را اجرا نمی‌کرد و چاپِ خودکار عملاً کار نمی‌کرد.
    // load را هم لازم داریم تا invoice.css قبل از چاپ رسیده باشد.
    const go = () => { try { w.focus(); w.print(); } catch (e) { /* پنجره بسته شد */ } };
    if (w.document.readyState === 'complete') go();
    else w.addEventListener('load', go, { once: true });
  }

  // ============================================================
  // ۳) انبار و کالا
  // ============================================================
  let PRODUCTS = [];
  const PICKED = new Set();
  const PQ = { q: '', cat: '', stock: 'all', pub: 'all', sort: 'title', dir: 1 };

  async function loadStock() {
    $('prodBody').innerHTML = `<tr><td colspan="8">${skel(5)}</td></tr>`;
    try {
      const d = await PG.api('/admin/inventory');
      PRODUCTS = d.products;
      // پر کردن فهرست دسته‌ها (انتخاب فعلی حفظ می‌شود)
      const cats = [...new Set(PRODUCTS.map(p => p.category))].sort((a, b) => a.localeCompare(b, 'fa'));
      $('prodCat').innerHTML = `<option value="">همه‌ی دسته‌ها</option>` +
        cats.map(c => `<option value="${esc(c)}" ${PQ.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
      $('catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');

      const out = PRODUCTS.filter(p => p.stock === 0).length;
      const low = PRODUCTS.filter(p => p.stock > 0 && p.stock <= 5).length;
      const drafts = PRODUCTS.filter(p => p.published === 0).length;
      const draftNoImg = PRODUCTS.filter(p => p.published === 0 && !p.image).length;

      // بنرِ یادآور. عمداً فقط وقتی پیش‌نویس هست دیده می‌شود؛ نوارِ همیشگی
      // بعد از دو روز نامرئی می‌شود و کارش را نمی‌کند.
      $('draftNote').hidden = drafts === 0;
      if (drafts) {
        $('draftNoteText').innerHTML = `<b>${money(drafts)} کالا</b> در انبار هست ولی روی سایت نیست.` +
          (draftNoImg ? ` ${money(draftNoImg)} تای آن‌ها هنوز عکس ندارد.` : '');
      }
      const invValue = PRODUCTS.reduce((s, p) => s + p.price * p.stock, 0);
      const unitsSold = PRODUCTS.reduce((s, p) => s + p.soldQty, 0);
      $('stockKpis').innerHTML = [
        kpi({ label: 'تعداد کالا', num: money(PRODUCTS.length), unit: 'قلم', icon: 'i-box' }),
        kpi({ label: 'روی سایت', num: money(PRODUCTS.length - drafts), unit: 'قلم', icon: 'i-eye', tone: drafts ? 'gold' : 'blue' }),
        kpi({ label: 'ارزش انبار', num: money(invValue), unit: 'تومان', icon: 'i-wallet', tone: 'purple' }),
        kpi({ label: 'ناموجود', num: money(out), unit: 'قلم', icon: 'i-alert', tone: out ? 'coral' : '' }),
        kpi({ label: 'رو به اتمام', num: money(low), unit: 'قلم', icon: 'i-warehouse', tone: low ? 'gold' : '' }),
        kpi({ label: 'کل فروش رفته', num: money(unitsSold), unit: 'عدد', icon: 'i-trend-up', tone: 'blue' })
      ].join('');

      renderProducts();
      $('navStock').textContent = money(out + low);
      $('navStock').classList.toggle('urgent', (out + low) > 0);
    } catch (e) {
      $('prodBody').innerHTML = `<tr><td colspan="8"><div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div></td></tr>`;
    }
  }

  function visibleProducts() {
    const nq = PQ.q ? PG.normFa(PQ.q) : '';
    let list = PRODUCTS.filter(p => {
      if (PQ.cat && p.category !== PQ.cat) return false;
      if (PQ.stock === 'out' && p.stock !== 0) return false;
      if (PQ.stock === 'low' && !(p.stock > 0 && p.stock <= 5)) return false;
      if (PQ.stock === 'ok' && p.stock <= 5) return false;
      // published از سرور عدد ۰/۱ است؛ محصولاتِ قدیمیِ قبل از این ستون
      // مقدارِ پیش‌فرضِ ۱ گرفته‌اند، پس undefined هم یعنی «روی سایت».
      const isPub = p.published !== 0;
      if (PQ.pub === 'pub' && !isPub) return false;
      if (PQ.pub === 'draft' && isPub) return false;
      if (PQ.pub === 'noimg' && (isPub || p.image)) return false;
      if (nq && !PG.normFa(`${p.title} ${p.category} ${p.badge || ''}`).includes(nq)) return false;
      return true;
    });
    const k = PQ.sort;
    list.sort((a, b) => {
      const va = a[k], vb = b[k];
      const r = typeof va === 'string' ? String(va).localeCompare(String(vb), 'fa') : (va - vb);
      return r * PQ.dir;
    });
    return list;
  }

  function renderProducts() {
    const list = visibleProducts();
    document.querySelectorAll('#prodTable th.sortable').forEach(th => {
      th.querySelector('.arrow').textContent = th.dataset.s === PQ.sort ? (PQ.dir === 1 ? '▲' : '▼') : '';
    });
    if (!list.length) {
      $('prodBody').innerHTML = `<tr><td colspan="8">${emptyBox('i-box', 'کالایی با این فیلترها نیست')}</td></tr>`;
      syncBulkBar();
      return;
    }
    $('prodBody').innerHTML = list.map(p => {
      const cls = p.stock === 0 ? 'zero' : (p.stock <= 5 ? 'low' : '');
      const isPub = p.published !== 0;
      return `
      <tr data-id="${p.id}" class="${PICKED.has(p.id) ? 'picked' : ''}${isPub ? '' : ' is-draft'}">
        <td><input type="checkbox" class="ad-check row-pick" ${PICKED.has(p.id) ? 'checked' : ''} aria-label="انتخاب"></td>
        <td>
          <div class="ad-cell-prod">
            <span class="ad-thumb">${p.image ? `<img src="${esc(thumb(p.image))}" alt="" loading="lazy" decoding="async">` : `<svg><use href="#${esc(p.icon || 'i-package')}"/></svg>`}</span>
            <span>
              <b>${esc(p.title)}${isPub ? '' : ' <span class="ad-draft-tag">پیش‌نویس</span>'}</b>
              <small>${esc(p.category)}${p.badge ? ` · ${esc(p.badge)}` : ''}${
                isPub || p.image ? '' : ` · <span class="ad-noimg">بدون عکس</span>`}${
                Number(p.old_price) > Number(p.price)
                  ? ` · <span class="ad-onsale" title="قیمت قبلی ${money(p.old_price)} تومان">${money(Math.round(((p.old_price - p.price) / p.old_price) * 100))}٪ تخفیف</span>`
                  : ''}${
                p.waiting ? ` · <span class="ad-waiting" title="مشتری منتظر موجود شدن — با شارژ موجودی پیامک می‌رود">${money(p.waiting)} منتظر</span>` : ''}</small>
            </span>
          </div>
        </td>
        <td><input type="number" class="ad-num-input f-price" value="${p.price}" min="0" step="1000" dir="ltr" data-orig="${p.price}"></td>
        <td><input type="number" class="ad-num-input f-stock ${cls}" value="${p.stock}" min="0" step="1" dir="ltr" data-orig="${p.stock}"></td>
        <td>${money(p.soldQty)}</td>
        <td>${p.revenue ? money(p.revenue) : '—'}</td>
        <td>${p.wishers ? `${money(p.wishers)} ❤` : '—'}</td>
        <td>
          <div class="ad-row-tools">
            <button class="icon-btn act-save" title="ذخیره‌ی قیمت و موجودی"><svg><use href="#i-save"/></svg></button>
            <button class="icon-btn act-pub${isPub ? '' : ' on'}" title="${isPub ? 'برداشتن از سایت' : 'انتشار در سایت'}" aria-pressed="${isPub}"><svg><use href="#${isPub ? 'i-eye' : 'i-ban'}"/></svg></button>
            <button class="icon-btn act-edit" title="ویرایش کامل"><svg><use href="#i-edit"/></svg></button>
            <button class="icon-btn act-del danger" title="حذف"><svg><use href="#i-trash"/></svg></button>
          </div>
        </td>
      </tr>`;
    }).join('');
    syncBulkBar();
  }

  // ورودی‌های دست‌خورده رنگ عوض می‌کنند (تا یادتان نرود ذخیره کنید)
  $('prodBody').addEventListener('input', (e) => {
    const inp = e.target.closest('.ad-num-input');
    if (inp) inp.classList.toggle('dirty', inp.value !== inp.dataset.orig);
  });

  // مرتب‌سازی با کلیک روی سرستون
  $('prodTable').querySelector('thead').addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    if (PQ.sort === th.dataset.s) PQ.dir *= -1; else { PQ.sort = th.dataset.s; PQ.dir = 1; }
    renderProducts();
  });

  const runProdSearch = debounce(renderProducts, 220);
  $('prodSearch').addEventListener('input', (e) => {
    PQ.q = e.target.value.trim();
    $('prodSearchWrap').classList.toggle('has-value', !!PQ.q);
    runProdSearch();
  });
  $('prodSearchClear').addEventListener('click', () => {
    $('prodSearch').value = ''; PQ.q = '';
    $('prodSearchWrap').classList.remove('has-value');
    renderProducts();
  });
  $('prodCat').addEventListener('change', (e) => { PQ.cat = e.target.value; renderProducts(); });
  $('prodStockFilter').addEventListener('change', (e) => { PQ.stock = e.target.value; renderProducts(); });
  $('prodPubFilter').addEventListener('change', (e) => { PQ.pub = e.target.value; renderProducts(); });
  $('draftNoteShow').addEventListener('click', () => {
    PQ.pub = 'draft'; $('prodPubFilter').value = 'draft';
    renderProducts();
    $('prodTable').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- انتخاب و ویرایش گروهی ----------
  function syncBulkBar() {
    $('bulkCount').textContent = `${money(PICKED.size)} کالا`;
    $('bulkBar').classList.toggle('show', PICKED.size > 0);
    const shown = visibleProducts();
    $('prodCheckAll').checked = shown.length > 0 && shown.every(p => PICKED.has(p.id));
  }
  $('prodBody').addEventListener('change', (e) => {
    const cb = e.target.closest('.row-pick');
    if (!cb) return;
    const tr = cb.closest('tr');
    const id = Number(tr.dataset.id);
    if (cb.checked) PICKED.add(id); else PICKED.delete(id);
    tr.classList.toggle('picked', cb.checked);
    syncBulkBar();
  });
  $('prodCheckAll').addEventListener('change', (e) => {
    const shown = visibleProducts();
    if (e.target.checked) shown.forEach(p => PICKED.add(p.id));
    else shown.forEach(p => PICKED.delete(p.id));
    renderProducts();
  });
  $('bulkClear').addEventListener('click', () => { PICKED.clear(); renderProducts(); });

  // نوع ورودی مقدار، بر اساس عملیات انتخابی عوض می‌شود
  const BULK_HINT = {
    add_stock: ['number', 'مثلاً ۱۰'], set_stock: ['number', 'مثلاً ۲۰'],
    price_pct: ['number', 'مثلاً ۱۰ یا ۱۰-'], set_category: ['text', 'نام دسته'],
    set_badge: ['text', 'مثلاً تخفیف'], clear_badge: ['hidden', ''],
    discount: ['number', 'درصد تخفیف؛ مثلاً ۱۵'], discount_end: ['hidden', ''],
    publish: ['hidden', ''], unpublish: ['hidden', '']
  };
  function syncBulkInput() {
    const [type, ph] = BULK_HINT[$('bulkOp').value] || ['text', ''];
    const inp = $('bulkValue');
    inp.classList.toggle('hidden', type === 'hidden');
    if (type !== 'hidden') { inp.type = type; inp.placeholder = ph; }
  }
  $('bulkOp').addEventListener('change', syncBulkInput);
  syncBulkInput();

  // عملیاتی که به «مقدار» نیاز ندارند؛ قبلاً فقط clear_badge بود
  const BULK_NO_VALUE = ['clear_badge', 'discount_end', 'publish', 'unpublish'];

  $('bulkApply').addEventListener('click', async (e) => {
    const op = $('bulkOp').value;
    const raw = $('bulkValue').value.trim();
    if (!BULK_NO_VALUE.includes(op) && !raw) return PG.toast('مقدار را وارد کنید', 'error');
    let value = ['add_stock', 'set_stock', 'price_pct', 'discount'].includes(op) ? Number(raw) : raw;
    const names = PRODUCTS.filter(p => PICKED.has(p.id)).slice(0, 3).map(p => p.title).join('، ');
    // تخفیف روی قیمت واقعی اثر می‌گذارد، پس تأییدش باید صریح‌تر باشد
    const extra = op === 'discount'
      ? `\n\nقیمت فعلی به‌عنوان «قیمت قبلی» ذخیره می‌شود و ${value}٪ کم می‌شود.`
      : op === 'discount_end' ? '\n\nقیمت‌ها به همان قیمت قبل از تخفیف برمی‌گردند.'
      : op === 'publish' ? '\n\nاین کالاها روی سایت می‌آیند و مشتری می‌تواند بخرد.'
      : op === 'unpublish' ? '\n\nاین کالاها از سایت برداشته می‌شوند؛ مشتری دیگر نمی‌بیندشان.' : '';
    if (!confirm(`این تغییر روی ${PICKED.size} کالا اعمال شود؟\n(${names}${PICKED.size > 3 ? ' و …' : ''})${extra}`)) return;

    e.currentTarget.disabled = true;
    const send = async () => PG.api('/admin/products/bulk', {
      method: 'POST', body: JSON.stringify({ ids: [...PICKED], op, value })
    });
    try {
      let r;
      try { r = await send(); }
      catch (err) {
        // ۴۰۹ سرور برای «چندتاشان عکس ندارند» — یک سؤالِ صریح، بعد value='force'
        if (!err.data?.needsConfirm) throw err;
        const n = err.data.count || PICKED.size;
        if (!confirm(`${n} تا از این کالاها عکس ندارند.\nصفحه‌ی محصولِ بی‌عکس معمولاً فروش نمی‌رود و گوگل هم آن را ایندکس می‌کند.\nبا این حال منتشر شوند؟`)) {
          e.currentTarget.disabled = false; return;
        }
        value = 'force';
        r = await send();
      }
      PG.toast(`${money(r.changed)} کالا به‌روز شد ✅`, 'success');
      PICKED.clear();
      $('bulkValue').value = '';
      PRODUCTS = r.products;
      await loadStock();
      if (LOADED.has('dash')) loadDash();
      if (LOADED.has('log')) loadLog();
    } catch (err) { PG.toast(err.message, 'error'); }
    finally { e.currentTarget.disabled = false; }
  });

  // ---------- انتشار / برداشتن از سایت ----------
  // سرور برای «انتشارِ محصولِ بدون عکس» عمداً ۴۰۹ می‌دهد و منتظرِ تأییدِ دوم
  // می‌ماند. آن قانون در سرور است نه اینجا، چون فرانت‌اند قابلِ دورزدن است؛
  // این تابع فقط ترجمه‌ی همان ۴۰۹ به یک سؤالِ فارسی است.
  async function setPublished(id, on, force) {
    try {
      await PG.api(`/admin/products/${id}/published`, {
        method: 'POST', body: JSON.stringify({ published: on, force: !!force })
      });
      PG.toast(on ? 'روی سایت آمد ✅' : 'از سایت برداشته شد', on ? 'success' : 'info');
      return true;
    } catch (err) {
      if (err.data?.needsConfirm) {
        if (!confirm('این محصول عکس ندارد.\nمحصولِ بی‌عکس معمولاً فروش نمی‌رود و به اعتبارِ فروشگاه لطمه می‌زند.\nبا این حال منتشر شود؟')) return false;
        return setPublished(id, on, true);
      }
      throw err;
    }
  }

  // ---------- عملیات تک‌ردیفی ----------
  $('prodBody').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = Number(tr.dataset.id);

    if (e.target.closest('.act-save')) {
      const btn = e.target.closest('.act-save');
      btn.disabled = true;
      try {
        await PG.api(`/admin/products/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            price: Number(tr.querySelector('.f-price').value),
            stock: Number(tr.querySelector('.f-stock').value)
          })
        });
        PG.toast('ذخیره شد ✅', 'success');
        await loadStock();
        if (LOADED.has('dash')) loadDash();
        if (LOADED.has('log')) loadLog();
      } catch (err) { PG.toast(err.message, 'error'); btn.disabled = false; }
      return;
    }

    if (e.target.closest('.act-pub')) {
      const btn = e.target.closest('.act-pub');
      const p = PRODUCTS.find(x => x.id === id);
      const want = p.published === 0;           // پیش‌نویس بود ⇒ می‌خواهیم منتشر شود
      // برداشتن از سایت را می‌پرسیم، انتشار را نه: انتشار برگشت‌پذیر و کم‌ضرر است،
      // ولی پنهان‌کردنِ ناخواسته یعنی محصول از دیدِ مشتری غیب می‌شود بی‌آنکه
      // کسی متوجه شود — تا وقتی فروشش صفر شود.
      if (!want && !confirm(`«${p.title}» از سایت برداشته شود؟\nمشتری‌ها دیگر آن را نمی‌بینند و نمی‌توانند بخرند.`)) return;
      btn.disabled = true;
      try {
        await setPublished(id, want, false);
        await loadStock();
        if (LOADED.has('log')) loadLog();
      } catch (err) { PG.toast(err.message, 'error'); btn.disabled = false; }
      return;
    }

    if (e.target.closest('.act-edit')) {
      openProductModal(PRODUCTS.find(p => p.id === id));
      return;
    }

    if (e.target.closest('.act-del')) {
      const p = PRODUCTS.find(x => x.id === id);
      if (!confirm(`«${p.title}» حذف شود؟\n(اگر سابقه‌ی فروش داشته باشد فقط «ناموجود» می‌شود)`)) return;
      try {
        const r = await PG.api(`/admin/products/${id}`, { method: 'DELETE' });
        PG.toast(r.deleted ? 'محصول حذف شد' : 'محصول سابقه‌ی فروش داشت؛ ناموجود شد', 'info');
        PICKED.delete(id);
        await loadStock();
        if (LOADED.has('dash')) loadDash();
        if (LOADED.has('log')) loadLog();
      } catch (err) { PG.toast(err.message, 'error'); }
    }
  });

  // ---------- مودال محصول ----------
  let uploadedImage; // undefined = دست‌نخورده، null = حذف، string = مسیر جدید

  // عکس همین‌جا در مرورگر کوچک و سبک می‌شود (حداکثر ۱۴۰۰px، JPEG با کیفیت خوب)
  // تا صفحه‌ها روی اینترنت گوشی سریع باز شوند؛ اگر نتیجه بهتر نشد همان اصل می‌رود.
  async function shrinkImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const MAX = 1400;
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 350 * 1024) { bmp.close(); return file; } // از قبل سبک است
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'; // شفافیت PNG حفظ شود
      const blob = await new Promise(r => canvas.toBlob(r, outType, 0.85));
      return (blob && blob.size < file.size) ? blob : file;
    } catch (e) {
      return file; // هر مشکلی بود، فایل اصلی آپلود شود
    }
  }

  async function uploadImageFile(rawFile) {
    const file = await shrinkImage(rawFile);
    if (file.size > 2 * 1024 * 1024) throw new Error('حجم عکس حتی بعد از فشرده‌سازی بیشتر از ۲ مگابایت است');
    // این تنها جایی است که fetch خام می‌زنیم (بدنه باینری است، نه JSON)، پس
    // پوششِ PG.api رویش نمی‌افتد و باید سه چیز را خودمان دستی بگیریم:
    // ۱) خطای شبکه، وگرنه «Failed to fetch» انگلیسی روی صفحه می‌آمد.
    // ۲) بدنه‌ی غیرJSON — nginx برای فایل بزرگ صفحه‌ی HTML خودش را می‌دهد و
    //    res.json() می‌ترکید، یعنی پیام «Unexpected token <» به مدیر نشان می‌دادیم.
    // ۳) دلیلِ واقعی به‌جای «آپلود ناموفق بود» که نمی‌گفت باید چه کار کرد.
    let res;
    try {
      res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': file.type || rawFile.type },
        credentials: 'same-origin',
        body: file
      });
    } catch (e) {
      throw new Error(navigator.onLine === false
        ? 'اینترنت وصل نیست؛ عکس آپلود نشد.'
        : 'ارتباط با سرور قطع شد؛ عکس آپلود نشد. دوباره بزنید.');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* بدنه JSON نبود */ }
    if (!res.ok) {
      throw new Error(data.error || (
        res.status === 413 ? 'حجم عکس برای سرور زیاد است؛ عکس کوچک‌تری انتخاب کنید.'
        : res.status === 415 ? 'این فرمت عکس پشتیبانی نمی‌شود؛ JPG یا PNG یا WebP بفرستید.'
        : res.status === 401 || res.status === 403 ? 'نشست مدیریت بسته شده؛ صفحه را تازه کنید و دوباره وارد شوید.'
        : `آپلود انجام نشد (کد ${res.status})؛ دوباره بزنید.`
      ));
    }
    return data.path;
  }
  let galleryImages = []; // مسیر عکس‌های گالری (به‌جز کاور)

  const parseArrField = (v) => {
    if (Array.isArray(v)) return v;
    try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  };

  function paintGallery() {
    $('pmGallery').innerHTML = galleryImages.length
      ? galleryImages.map((src, i) => `
        <span class="pm-g-item">
          <img src="${esc(src)}" alt="">
          <button type="button" class="pm-g-del" data-gi="${i}" title="حذف از گالری"><svg><use href="#i-close"/></svg></button>
        </span>`).join('')
      : '<small class="muted-sub fs-115">هنوز عکسی در گالری نیست</small>';
  }
  $('pmGallery').addEventListener('click', (e) => {
    const del = e.target.closest('.pm-g-del');
    if (!del) return;
    galleryImages.splice(Number(del.dataset.gi), 1);
    paintGallery();
  });

  // آپلود چندتایی گالری — از همان endpoint امن آپلود تک‌عکس
  $('pmFileMore').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const file of files) {
      if (galleryImages.length >= 8) { PG.toast('حداکثر ۸ عکس در گالری جا می‌شود', 'error'); break; }
      try {
        galleryImages.push(await uploadImageFile(file));
        paintGallery();
      } catch (err) { PG.toast(`«${file.name}»: ${err.message}`, 'error'); }
    }
  });

  // ردیف‌های مشخصات (عنوان/مقدار)
  function specRowHtml(k = '', v = '') {
    return `<div class="pm-spec-row">
      <input type="text" class="ps-k" maxlength="40" placeholder="عنوان؛ مثلاً گنجایش" value="${esc(k)}">
      <input type="text" class="ps-v" maxlength="120" placeholder="مقدار؛ مثلاً ۳ لیتر" value="${esc(v)}">
      <button type="button" class="pm-g-del ps-del" title="حذف ردیف"><svg><use href="#i-close"/></svg></button>
    </div>`;
  }
  function paintSpecs(rows) {
    $('pmSpecs').innerHTML = rows.length ? rows.map(r => specRowHtml(r.k, r.v)).join('') : '';
  }
  $('pmAddSpec').addEventListener('click', () => {
    if ($('pmSpecs').querySelectorAll('.pm-spec-row').length >= 12) return PG.toast('حداکثر ۱۲ مشخصه', 'error');
    $('pmSpecs').insertAdjacentHTML('beforeend', specRowHtml());
    $('pmSpecs').querySelector('.pm-spec-row:last-child .ps-k').focus();
  });
  $('pmSpecs').addEventListener('click', (e) => {
    const del = e.target.closest('.ps-del');
    if (del) del.closest('.pm-spec-row').remove();
  });
  function collectSpecs() {
    return [...$('pmSpecs').querySelectorAll('.pm-spec-row')]
      .map(row => ({ k: row.querySelector('.ps-k').value.trim(), v: row.querySelector('.ps-v').value.trim() }))
      .filter(r => r.k && r.v);
  }

  $('pmIcons').innerHTML = ICON_CHOICES.map(ic =>
    `<button type="button" class="ad-icon-opt" data-icon="${ic}" title="${ic}"><svg><use href="#${ic}"/></svg></button>`).join('');
  $('pmIcons').addEventListener('click', (e) => {
    const b = e.target.closest('.ad-icon-opt');
    if (!b) return;
    $('pmIcon').value = b.dataset.icon;
    syncIconPicker();
  });
  function syncIconPicker() {
    const cur = $('pmIcon').value;
    $('pmIcons').querySelectorAll('.ad-icon-opt').forEach(b => b.classList.toggle('on', b.dataset.icon === cur));
  }

  function openProductModal(p = null) {
    uploadedImage = undefined;
    $('pmTitle').textContent = p ? `ویرایش «${p.title}»` : 'محصول جدید';
    $('pmAlert').innerHTML = '';
    $('pmId').value = p ? p.id : '';
    $('pmName').value = p?.title || '';
    $('pmCat').value = p?.category || '';
    $('pmBadge').value = p?.badge || '';
    $('pmPrice').value = p?.price ?? '';
    // ۰ در دیتابیس یعنی «تخفیفی نیست»؛ در فرم خالی نشان می‌دهیم نه صفر،
    // وگرنه مدیر فکر می‌کند قیمت قبلی صفر ثبت شده است.
    $('pmOldPrice').value = p?.oldPrice || p?.old_price ? (p.oldPrice || p.old_price) : '';
    // عمده‌فروشی: ۰ یعنی خاموش؛ در فرم خالی نشان می‌دهیم نه صفر
    $('pmWsMin').value = (p?.wholesale_min_qty ?? p?.wholesaleMinQty) ? (p.wholesale_min_qty ?? p.wholesaleMinQty) : '';
    $('pmWsDiscount').value = (p?.wholesale_discount ?? p?.wholesaleDiscount) ? (p.wholesale_discount ?? p.wholesaleDiscount) : '';
    $('pmStock').value = p?.stock ?? '';
    $('pmDesc').value = p?.description || '';
    $('pmIcon').value = p?.icon || 'i-package';
    syncIconPicker();
    setThumb(p?.image || null);
    galleryImages = parseArrField(p?.images);
    paintGallery();
    paintSpecs(parseArrField(p?.specs));
    openModal('prodModal');
    $('pmName').focus();
  }
  function setThumb(src) {
    $('pmThumb').innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<svg><use href="#i-package"/></svg>';
    $('pmRemoveImg').classList.toggle('hidden', !src);
  }

  $('btnNewProduct').addEventListener('click', () => openProductModal());
  $('pmCancel').addEventListener('click', () => closeModal('prodModal'));
  $('pmClose').addEventListener('click', () => closeModal('prodModal'));

  $('pmFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const path = await uploadImageFile(file);
      uploadedImage = path;
      setThumb(path);
      PG.toast('عکس آپلود شد (بهینه‌شده)', 'success');
    } catch (err) { PG.toast(err.message, 'error'); }
  });
  $('pmRemoveImg').addEventListener('click', () => { uploadedImage = null; setThumb(null); });

  $('formProduct').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('pmId').value;
    const body = {
      title: $('pmName').value.trim(),
      category: $('pmCat').value.trim(),
      badge: $('pmBadge').value.trim(),
      price: Number($('pmPrice').value),
      // رشته‌ی خالی را عمداً به ۰ تبدیل می‌کنیم؛ سرور ۰ را «بدون تخفیف» می‌فهمد
      oldPrice: $('pmOldPrice').value.trim() === '' ? 0 : Number($('pmOldPrice').value),
      wholesaleMinQty: $('pmWsMin').value.trim() === '' ? 0 : Number($('pmWsMin').value),
      wholesaleDiscount: $('pmWsDiscount').value.trim() === '' ? 0 : Number($('pmWsDiscount').value),
      stock: Number($('pmStock').value),
      description: $('pmDesc').value.trim(),
      icon: $('pmIcon').value,
      images: galleryImages,
      specs: collectSpecs()
    };
    if (uploadedImage !== undefined) body.image = uploadedImage;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (id) await PG.api(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await PG.api('/admin/products', { method: 'POST', body: JSON.stringify(body) });
      PG.toast('محصول ذخیره شد ✅', 'success');
      closeModal('prodModal');
      await loadStock();
      if (LOADED.has('dash')) loadDash();
      if (LOADED.has('log')) loadLog();
    } catch (err) {
      $('pmAlert').innerHTML =
        `<div class="alert alert-error mb-14"><svg><use href="#i-alert"/></svg><span>${esc(err.message)}</span></div>`;
    } finally { btn.disabled = false; }
  });

  // ============================================================
  // ۴) مشتری‌ها
  // ============================================================
  let USERS = [];
  const UQ = { q: '', sort: 'spent', filter: 'all' };

  async function loadPeople() {
    $('usersHost').innerHTML = skel(4);
    try {
      ({ users: USERS } = await PG.api('/admin/users'));
      renderPeople();
      $('navPeople').textContent = money(USERS.length);
    } catch (e) {
      $('usersHost').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  function renderPeople() {
    const nq = UQ.q ? PG.normFa(UQ.q) : '';
    let list = USERS.filter(u => {
      if (UQ.filter === 'buyers' && !u.paidOrders) return false;
      if (UQ.filter === 'idle' && u.paidOrders) return false;
      if (nq && !PG.normFa(`${u.fullName || ''} ${u.phone}`).includes(nq)) return false;
      return true;
    });
    const S = {
      spent: (a, b) => b.totalSpent - a.totalSpent,
      orders: (a, b) => b.paidOrders - a.paidOrders,
      new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      name: (a, b) => String(a.fullName || 'ی').localeCompare(String(b.fullName || 'ی'), 'fa')
    };
    list.sort(S[UQ.sort] || S.spent);

    const totalSpent = list.reduce((s, u) => s + u.totalSpent, 0);
    $('userResultBar').innerHTML = `
      <span><b>${money(list.length)}</b> مشتری از <b>${money(USERS.length)}</b></span>
      ${totalSpent ? `<span>جمع خرید این افراد: <span class="sum">${money(totalSpent)} تومان</span></span>` : ''}`;

    if (!list.length) {
      $('usersHost').innerHTML = `<div class="empty-state span-all">
        <svg><use href="#i-users"/></svg><h3>مشتری‌ای با این فیلترها نیست</h3></div>`;
      return;
    }

    // «مشتری ویژه» = بالای میانگین خریدِ خریدارها
    const buyers = USERS.filter(u => u.paidOrders);
    const avgSpent = buyers.length ? buyers.reduce((s, u) => s + u.totalSpent, 0) / buyers.length : 0;
    const weekAgo = Date.now() - 7 * 86400e3;

    $('usersHost').innerHTML = list.map(u => {
      const isNew = (toDate(u.createdAt)?.getTime() || 0) > weekAgo;
      const isVip = u.paidOrders > 0 && avgSpent > 0 && u.totalSpent >= avgSpent * 1.5;
      // نشان‌ها از داخل <b> نام بیرون آمده‌اند: وقتی کنار نام بودند نام را
      // له می‌کردند و با nowrap از کارت می‌زدند بیرون. حالا ردیف مستقل دارند.
      const tags = [
        u.isAdmin ? '<span class="ad-tag admin">مدیر</span>' : '',
        u.isStaff ? '<span class="ad-tag staff">کارمند</span>' : '',
        isVip ? '<span class="ad-tag vip">ویژه</span>' : '',
        isNew ? '<span class="ad-tag new">جدید</span>' : '',
        u.hasPassword ? '<span class="ad-tag soft">رمز دارد</span>' : ''
      ].filter(Boolean).join('');
      return `
      <article class="ad-person" data-id="${u.id}">
        <div class="ad-person-top">
          <span class="ad-thumb round"><svg><use href="#i-user"/></svg></span>
          <span class="grow">
            <b>${esc(u.fullName || 'بدون نام')}</b>
            <bdo class="ap-phone" dir="ltr">${esc(u.phone)}</bdo>
          </span>
        </div>
        <div class="ad-person-meta">
          ${tags}
          <span class="ap-since">عضو از ${esc(faDate(u.createdAt))}</span>
        </div>
        <div class="ad-person-stats">
          <div><b>${money(u.paidOrders)}</b><small>سفارش موفق</small></div>
          <div><b>${money(u.totalSpent)}</b><small>تومان خرید</small></div>
        </div>
        <div class="ad-person-acts">
          <button class="btn btn-outline btn-sm act-file"><svg><use href="#i-eye"/></svg> <span>پرونده</span></button>
          ${u.paidOrders ? `<button class="btn btn-ghost btn-sm act-orders" data-phone="${esc(u.phone)}"><svg><use href="#i-package"/></svg> <span>سفارش‌ها</span></button>` : ''}
          <a class="btn btn-ghost btn-sm ap-icon" href="tel:${esc(u.phone)}" title="تماس با ${esc(u.fullName || u.phone)}" aria-label="تماس با ${esc(u.fullName || u.phone)}"><svg><use href="#i-phone"/></svg></a>
          ${!u.isAdmin ? `<button class="btn btn-ghost btn-sm act-staff ap-staff" data-staff="${u.isStaff ? '1' : '0'}"><svg><use href="#i-shield"/></svg> <span>${u.isStaff ? 'لغو دسترسی کارمند' : 'دسترسی کارمند'}</span></button>` : ''}
        </div>
      </article>`;
    }).join('');
  }

  const runUserSearch = debounce(renderPeople, 220);
  $('userSearch').addEventListener('input', (e) => {
    UQ.q = e.target.value.trim();
    $('userSearchWrap').classList.toggle('has-value', !!UQ.q);
    runUserSearch();
  });
  $('userSearchClear').addEventListener('click', () => {
    $('userSearch').value = ''; UQ.q = '';
    $('userSearchWrap').classList.remove('has-value');
    renderPeople();
  });
  $('userSort').addEventListener('change', (e) => { UQ.sort = e.target.value; renderPeople(); });
  $('userFilter').addEventListener('change', (e) => { UQ.filter = e.target.value; renderPeople(); });

  $('usersHost').addEventListener('click', async (e) => {
    const card = e.target.closest('.ad-person');
    if (!card) return;
    if (e.target.closest('.act-file')) { openUserFile(Number(card.dataset.id)); return; }
    const ord = e.target.closest('.act-orders');
    if (ord) {
      // پرش به بخش سفارش‌ها با جستجوی شماره‌ی همین مشتری
      OQ.q = ord.dataset.phone; OQ.status = 'all'; OQ.offset = 0;
      $('orderSearch').value = OQ.q;
      $('orderSearchWrap').classList.add('has-value');
      LOADED.add('orders');
      show('orders');
      loadOrders();
    }
    const staffBtn = e.target.closest('.act-staff');
    if (staffBtn) {
      const id = Number(card.dataset.id);
      const on = staffBtn.dataset.staff !== '1';
      try {
        await PG.api(`/admin/users/${id}/staff`, { method: 'POST', body: JSON.stringify({ staff: on }) });
        PG.toast(on ? 'دسترسی کارمند داده شد' : 'دسترسی کارمند لغو شد', 'success');
        // تابع درست loadPeople است؛ قبلاً loadUsers صدا زده می‌شد که وجود ندارد
        // و بعد از هر تغییر دسترسی، هم پیام موفق و هم پیام خطا نشان داده می‌شد.
        await loadPeople();
      } catch (e) { PG.toast(e.message || 'تغییر دسترسی کارمند انجام نشد؛ دوباره بزنید.', 'error'); }
    }
  });

  // ---------- پرونده‌ی مشتری ----------
  async function openUserFile(id) {
    $('umBody').innerHTML = skel(3);
    openModal('userModal');
    try {
      const { user: u } = await PG.api(`/admin/users/${id}`);
      const s = u.summary;
      $('umTitle').textContent = u.fullName || `مشتری #${u.id}`;
      $('umBody').innerHTML = `
        <div class="ad-kpis mb-16">
          ${kpi({ label: 'سفارش موفق', num: money(s.paidOrders), unit: 'عدد', icon: 'i-package' })}
          ${kpi({ label: 'جمع خرید', num: money(s.totalSpent), unit: 'تومان', icon: 'i-wallet', tone: 'purple' })}
          ${kpi({ label: 'میانگین سبد', num: money(s.avgOrder), unit: 'تومان', icon: 'i-chart', tone: 'blue' })}
          ${kpi({ label: 'آخرین خرید', num: `<span class="fs-15">${esc(s.lastOrderAt ? faDate(s.lastOrderAt) : '—')}</span>`, icon: 'i-clock', tone: 'gold',
            sub: s.firstOrderAt ? `اولین خرید: ${esc(faDate(s.firstOrderAt))}` : '' })}
        </div>

        <div class="ad-card mb-14">
          <div class="ad-card-head"><h3><svg><use href="#i-user"/></svg> مشخصات</h3></div>
          <div class="ad-facts">
            <div class="ad-fact"><svg><use href="#i-phone"/></svg><span class="k">موبایل:</span>
              <span class="v"><bdo dir="ltr">${esc(u.phone)}</bdo>
              <button class="ad-copy" data-copy="${esc(u.phone)}" title="کپی"><svg><use href="#i-copy"/></svg></button></span></div>
            <div class="ad-fact"><svg><use href="#i-clock"/></svg><span class="k">عضویت:</span>
              <span class="v">${esc(faFull(u.createdAt))}</span></div>
            <div class="ad-fact"><svg><use href="#i-lock"/></svg><span class="k">ورود:</span>
              <span class="v">${u.hasPassword ? 'پیامک یا رمز عبور' : 'فقط پیامک'}${u.isAdmin ? ' · مدیر فروشگاه' : ''}</span></div>
          </div>
        </div>

        <div class="ad-card mb-14">
          <div class="ad-card-head"><h3><svg><use href="#i-pin"/></svg> آدرس‌ها</h3>
            <span class="ad-hint">${money(u.addresses.length)} آدرس</span></div>
          ${u.addresses.length ? `<div class="ad-list">` + u.addresses.map((a, i) => `
            <div class="ad-list-row">
              <span class="grow"><b>${esc(a.fullName || '—')} — <bdo dir="ltr">${esc(a.phone || '')}</bdo></b>
                <small>${esc([a.province, a.city, a.addressLine].filter(Boolean).join('، '))}${
                  a.postalCode ? ` · کدپستی ${esc(a.postalCode)}` : ''}</small></span>
              ${i === 0 ? '<span class="ad-tag new">آخرین</span>' : ''}
            </div>`).join('') + `</div>` : emptyBox('i-pin', 'آدرسی ثبت نکرده')}
        </div>

        <div class="ad-card mb-14">
          <div class="ad-card-head"><h3><svg><use href="#i-package"/></svg> سفارش‌ها</h3>
            <span class="ad-hint">${money(s.totalOrders)} سفارش (شامل ناموفق‌ها)</span></div>
          ${u.orders.length ? `<div class="ad-table-wrap"><table class="ad-table tbl-w460">
            <thead><tr><th>#</th><th>تاریخ</th><th>وضعیت</th><th>اقلام</th><th>مبلغ</th></tr></thead>
            <tbody>${u.orders.map(o => `<tr>
              <td>${money(o.id)}</td>
              <td>${esc(faDate(o.createdAt))}</td>
              <td>${badge(o.status)}</td>
              <td>${money(o.items.reduce((n, i) => n + i.qty, 0))} عدد</td>
              <td>${money(o.total)}</td></tr>`).join('')}</tbody>
          </table></div>` : emptyBox('i-package', 'سفارشی ثبت نکرده')}
        </div>

        <div class="ad-card mb-0">
          <div class="ad-card-head"><h3><svg><use href="#i-heart"/></svg> علاقه‌مندی‌ها</h3>
            <span class="ad-hint">${money(u.wishlist.length)} کالا</span></div>
          ${u.wishlist.length ? `<div class="ad-list">` + u.wishlist.map(p => `
            <div class="ad-list-row">
              <span class="grow"><b>${esc(p.title)}</b><small>${money(p.price)} تومان</small></span>
              <span class="val ${p.stock ? '' : 'bad'}">${p.stock ? `${money(p.stock)} موجود` : 'ناموجود'}</span>
            </div>`).join('') + `</div>` : emptyBox('i-heart', 'چیزی به علاقه‌مندی اضافه نکرده')}
        </div>`;
    } catch (e) {
      $('umBody').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }
  $('umClose').addEventListener('click', () => closeModal('userModal'));
  // کپی داخل مودال مشتری
  $('umBody').addEventListener('click', async (e) => {
    const cp = e.target.closest('.ad-copy[data-copy]');
    if (!cp) return;
    try { await navigator.clipboard.writeText(cp.dataset.copy); PG.toast('کپی شد', 'success'); }
    catch { PG.toast('مرورگر اجازه‌ی کپی نداد', 'error'); }
  });

  // ============================================================
  // ۴.۵) CRM — مدیریت ارتباط با مشتری
  // ============================================================
  let CRM_TAGS = [];
  let CRM_DETAIL = null;
  let CRM_SEL = null;
  const CRMQ = { q: '', tag: '', filter: 'all', sort: 'activity', page: 0 };
  const CRM_PAGE = 40;

  function crmTodayIso() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function crmTagColor(name) {
    const t = CRM_TAGS.find(x => x.name === name);
    return t ? t.color : '#2BD9BC';
  }
  function crmTagPill(t) {
    const color = t.color || crmTagColor(t.name);
    return `<span class="crm-tag" style="background:${color}22;color:${color}"><span class="dot" style="background:${color}"></span>${esc(t.name)}</span>`;
  }

  async function loadCrm() {
    $('crmList').innerHTML = skel(5);
    $('crmKpis').innerHTML = '';
    try {
      const { summary, tags } = await PG.api('/admin/crm/summary');
      CRM_TAGS = tags;
      // KPIهای پایه
      let kpiHtml = [
        kpi({ label: 'کل مشتری‌ها', num: money(summary.totalCustomers), unit: 'نفر', icon: 'i-users' }),
        kpi({ label: 'پیگیری باز', num: money(summary.openTasks), unit: 'مورد', icon: 'i-clock', tone: 'gold', sub: `${money(summary.dueTasks)} سررسیدشده` }),
        kpi({ label: 'برچسب‌خورده', num: money(summary.tagged), unit: 'نفر', icon: 'i-tag', tone: 'blue' }),
        kpi({ label: 'یادداشت‌ها', num: money(summary.totalNotes), unit: 'عدد', icon: 'i-note', tone: 'purple' })
      ].join('');
      // KPIهای پیشرفته (درآمد و رشد)
      try {
        const adv = await PG.api('/admin/crm/advanced');
        const s = adv.summary;
        if (s.thisMonth.revenue > 0) {
          kpiHtml += [
            kpi({ label: 'فروش این ماه', num: money(s.thisMonth.revenue), unit: 'تومان', icon: 'i-wallet',
              sub: `${s.revenueGrowth >= 0 ? '+' : ''}${money(s.revenueGrowth)}% نسبت به ماه قبل` }),
            kpi({ label: 'مشتری فعال این ماه', num: money(s.thisMonth.customers), unit: 'نفر', icon: 'i-users', tone: 'teal',
              sub: `${s.thisMonth.orders} سفارش` })
          ].join('');
        }
        // نمودار سگمنت‌ها
        if (s.segments && s.segments.length) {
          kpiHtml += `<div class="ad-kpi" style="grid-column:span 2"><div class="kpi-inner"><div class="kpi-label">سگمنت‌های مشتریان</div><div class="crm-seg-row">${s.segments.map(seg => {
            const colors = { vip: '#FFD700', at_risk: '#FF4444', returning: '#44AAFF', new_buyer: '#44DD44', casual: '#AAAAAA', dormant: '#666666', lead: '#CC88FF', new: '#2BD9BC' };
            const color = colors[seg.segment] || '#888';
            return `<div class="crm-seg-pill"><span class="crm-seg-dot" style="background:${color}"></span>${esc(seg.label)} <b>${money(seg.count)}</b> <small>(${money(seg.pct)}%)</small></div>`;
          }).join('')}</div><div class="crm-seg-actions"><button class="btn btn-outline btn-sm" id="btnCrmRecalc" title="بازحساب RFM همه مشتریان">🔄 بازحساب</button><a class="btn btn-outline btn-sm" href="/api/admin/crm/export" target="_blank">📥 صادرات CSV</a></div></div></div>`;
        }
      } catch (e) { /* advanced ممکنه نباشد */ }
      $('crmKpis').innerHTML = kpiHtml;
      $('navCrm').textContent = money(summary.openTasks);
      $('navCrm').classList.toggle('urgent', summary.dueTasks > 0);
      renderCrmTagChips();
      await loadCrmList();
    } catch (e) {
      $('crmList').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  function renderCrmTagChips() {
    $('crmTagChips').innerHTML = [
      `<button class="ad-chip ${!CRMQ.tag ? 'active' : ''}" data-tag="">همه</button>`,
      ...CRM_TAGS.map(t => `<button class="ad-chip ${CRMQ.tag === t.name ? 'active' : ''}" data-tag="${esc(t.name)}">${esc(t.name)}</button>`)
    ].join('');
  }

  async function loadCrmList() {
    $('crmList').innerHTML = skel(5);
    const p = new URLSearchParams({ sort: CRMQ.sort, filter: CRMQ.filter, limit: CRM_PAGE, offset: CRMQ.page * CRM_PAGE });
    if (CRMQ.q) p.set('q', CRMQ.q);
    if (CRMQ.tag) p.set('tag', CRMQ.tag);
    try {
      const d = await PG.api(`/admin/crm/customers?${p}`);
      renderCrmList(d);
    } catch (e) {
      $('crmList').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  function renderCrmList(d) {
    const pages = Math.max(1, Math.ceil(d.total / CRM_PAGE));
    $('crmResultBar').innerHTML = `<span><b>${money(d.total)}</b> مشتری</span>${CRMQ.tag ? `<span>برچسب: <b>${esc(CRMQ.tag)}</b></span>` : ''}`;
    if (!d.customers.length) {
      $('crmList').innerHTML = `<div class="empty-state"><svg><use href="#i-users"/></svg><h3>مشتری‌ای با این فیلترها نیست</h3></div>`;
      $('crmPager').innerHTML = '';
      return;
    }
    $('crmList').innerHTML = d.customers.map(c => `
      <div class="crm-row ${CRM_SEL === c.id ? 'active' : ''}" data-id="${c.id}" role="button" tabindex="0">
        <span class="ad-thumb round"><svg><use href="#i-user"/></svg></span>
        <span class="grow">
          <b>${esc(c.fullName || 'بدون نام')}</b>
          <small><bdo dir="ltr">${esc(c.phone)}</bdo></small>
          ${c.tags.length ? `<span class="crm-tags">${c.tags.map(n => crmTagPill({ name: n })).join('')}</span>` : ''}
        </span>
        <span class="crm-row-stats">
          <b>${money(c.totalSpent)}</b>
          <small>${money(c.paidOrders)} سفارش</small>
        </span>
      </div>`).join('');
    $('crmPager').innerHTML = pages > 1 ? `
      <button class="btn btn-outline btn-sm" id="crmPrev" ${CRMQ.page === 0 ? 'disabled' : ''}><svg><use href="#i-chevron-right"/></svg> قبلی</button>
      <b>صفحه ${money(CRMQ.page + 1)} از ${money(pages)}</b>
      <button class="btn btn-outline btn-sm" id="crmNext" ${CRMQ.page >= pages - 1 ? 'disabled' : ''}>بعدی <svg><use href="#i-chevron-left"/></svg></button>` : '';
  }

  async function openCrmCustomer(id) {
    CRM_SEL = id;
    document.querySelectorAll('.crm-row').forEach(r => r.classList.toggle('active', Number(r.dataset.id) === id));
    $('crmDetailPane').innerHTML = skel(3);
    try {
      const { customer } = await PG.api(`/admin/crm/customers/${id}`);
      CRM_DETAIL = customer;
      renderCrmDetail(customer);
    } catch (e) {
      $('crmDetailPane').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  function crmTaskRow(t) {
    const overdue = t.dueAt && !t.done && t.dueAt < crmTodayIso();
    return `<div class="crm-task ${t.done ? 'done' : ''} ${overdue ? 'overdue' : ''}" data-id="${t.id}">
      <button class="icon-btn crm-task-toggle" title="${t.done ? 'باز کردن' : 'انجام شد'}" aria-label="تغییر وضعیت"><svg><use href="#${t.done ? 'i-check-circle' : 'i-check'}"/></svg></button>
      <span class="crm-task-title">${esc(t.title)}${t.dueAt ? `<small>سررسید: ${esc(faDate(t.dueAt))}${overdue ? ' · دیر شده' : ''}</small>` : ''}</span>
      <button class="icon-btn danger crm-task-del" title="حذف" aria-label="حذف"><svg><use href="#i-trash"/></svg></button>
    </div>`;
  }

  function renderCrmDetail(c) {
    const s = c.summary;
    const score = c.score || {};
    const segmentLabels = { vip: '⭐ ویژه', at_risk: '⚠️ در خطر', returning: '🔄 بازگشتی', new_buyer: '🛒 خریدار جدید', casual: '👤 گذری', dormant: '💤 غیرفعال', lead: '🎯 سرنخ', new: '✨ جدید' };
    const segLabel = segmentLabels[score.segment] || '—';
    const segColors = { vip: '#FFD700', at_risk: '#FF4444', returning: '#44AAFF', new_buyer: '#44DD44', casual: '#AAAAAA', dormant: '#666666', lead: '#CC88FF', new: '#2BD9BC' };
    const segColor = segColors[score.segment] || '#888';
    const rfmBar = (val, max = 5) => `<div class="crm-rfm-bar"><div class="crm-rfm-fill" style="width:${(val/max)*100}%"></div></div>`;

    const tagEditor = CRM_TAGS.length
      ? `<div class="crm-tag-editor">${CRM_TAGS.map(t => {
          const on = c.tags.some(x => x.id === t.id);
          return `<span class="crm-tag ${on ? 'on' : ''}" data-tagid="${t.id}" role="button" tabindex="0" style="background:${t.color}22;color:${t.color}"><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</span>`;
        }).join('')}</div>`
      : '<small class="muted">هنوز برچسبی نساخته‌اید — از دکمهٔ «برچسب جدید» بالا بسازید.</small>';

    $('crmDetailPane').innerHTML = `
      <div class="crm-sec">
        <div class="ad-person-top">
          <span class="ad-thumb round"><svg><use href="#i-user"/></svg></span>
          <span class="grow">
            <b>${esc(c.fullName || 'بدون نام')}</b>
            <bdo class="ap-phone" dir="ltr">${esc(c.phone)}</bdo>
          </span>
          <a class="btn btn-outline btn-sm" href="tel:${esc(c.phone)}"><svg><use href="#i-phone"/></svg></a>
        </div>
        <div class="ad-person-stats">
          <div><b>${money(s.paidOrders)}</b><small>سفارش موفق</small></div>
          <div><b>${money(s.totalSpent)}</b><small>تومان خرید</small></div>
        </div>
        <div class="crm-tags">${c.tags.length ? c.tags.map(crmTagPill).join('') : '<small class="muted">بدون برچسب</small>'}</div>
      </div>

      <div class="crm-sec">
        <div class="crm-sec-head"><svg><use href="#i-chart"/></svg> امتیاز مشتری <button class="btn btn-outline btn-xs" id="btnCrmRecalcCust" title="بازحساب">🔄</button></div>
        <div class="crm-score-card">
          <div class="crm-score-seg" style="border-color:${segColor};color:${segColor}">${segLabel}</div>
          <div class="crm-score-health"><span>${money(score.health || 50)}</span><small>/۱۰۰ سلامت</small></div>
        </div>
        <div class="crm-rfm-row"><span>تازگی خرید</span>${rfmBar(score.recency)}<b>${money(score.recency)}/۵</b></div>
        <div class="crm-rfm-row"><span>تعداد سفارش</span>${rfmBar(score.frequency)}<b>${money(score.frequency)}/۵</b></div>
        <div class="crm-rfm-row"><span>مبلغ خرید</span>${rfmBar(score.monetary)}<b>${money(score.monetary)}/۵</b></div>
      </div>

      <div class="crm-sec">
        <div class="crm-sec-head"><svg><use href="#i-tag"/></svg> برچسب‌ها <span class="ad-hint">برای افزودن/حذف کلیک کنید</span></div>
        ${tagEditor}
      </div>

      <div class="crm-sec">
        <div class="crm-sec-head"><svg><use href="#i-note"/></svg> یادداشت‌ها <span class="ad-hint">${money(c.notes.length)}</span></div>
        <div id="crmNotesHost">${c.notes.length ? c.notes.map(n => `
          <div class="crm-note">
            <p>${esc(n.body)}</p>
            <small>${esc(n.adminName || 'مدیر')} · ${esc(faFull(n.createdAt))}
              <button class="icon-btn danger crm-del-note" data-id="${n.id}" title="حذف" aria-label="حذف یادداشت"><svg><use href="#i-trash"/></svg></button></small>
          </div>`).join('') : '<small class="muted">یادداشتی ثبت نشده.</small>'}</div>
        <div class="crm-add-row">
          <textarea id="crmNoteInput" rows="2" placeholder="مثلاً: تلفنی موجودی سطل ۱۰ لیتری را پرسید…" maxlength="2000"></textarea>
          <button class="btn btn-primary btn-sm" id="crmNoteAdd"><svg><use href="#i-save"/></svg> ثبت</button>
        </div>
      </div>

      <div class="crm-sec">
        <div class="crm-sec-head"><svg><use href="#i-clock"/></svg> پیگیری‌ها <span class="ad-hint">${money(c.tasks.filter(t => !t.done).length)} باز</span></div>
        <div id="crmTasksHost">${c.tasks.length ? c.tasks.map(crmTaskRow).join('') : '<small class="muted">پیگیری‌ای ثبت نشده.</small>'}</div>
        <div class="crm-add-row">
          <input type="text" id="crmTaskTitle" placeholder="عنوان پیگیری…" maxlength="200">
          <input type="date" id="crmTaskDue" class="ad-date">
          <button class="btn btn-primary btn-sm" id="crmTaskAdd"><svg><use href="#i-plus"/></svg> افزودن</button>
        </div>
      </div>

      <div class="crm-sec">
        <div class="crm-sec-head"><svg><use href="#i-clock"/></svg> تایم‌لاین فعالیت</div>
        <div class="crm-timeline">
          ${(c.activities || []).slice(0, 15).map(a => {
            const actIcons = { order: '🛒', note: '📝', task: '📋', tag: '🏷️', login: '🔑', stock: '📦', payment: '💳', view: '👁️' };
            const icon = actIcons[a.action] || '📌';
            return `<div class="crm-timeline-item"><span class="crm-tl-icon">${icon}</span><span class="crm-tl-body"><b>${esc(a.detail || a.action)}</b><small>${esc(faFull(a.createdAt))}</small></span></div>`;
          }).join('') || '<small class="muted">فعالیتی ثبت نشده.</small>'}
        </div>
      </div>

      <div class="crm-sec">
        <div class="crm-sec-head"><svg><use href="#i-package"/></svg> آخرین سفارش‌ها <span class="ad-hint">${money(s.totalOrders)}</span></div>
        ${c.orders.slice(0, 5).map(o => `
          <div class="ad-list-row">
            <span class="grow"><b>سفارش #${money(o.id)}</b><small>${esc(faDate(o.createdAt))} · ${money(o.items.reduce((n, i) => n + i.qty, 0))} قلم · ${badge(o.status)}</small></span>
            <span class="val">${money(o.total)}</span>
          </div>`).join('') || '<small class="muted">سفارشی ندارد.</small>'}
      </div>`;
  }

  // --- رویدادهای CRM ---
  $('crmList').addEventListener('click', (e) => {
    const row = e.target.closest('.crm-row');
    if (row) openCrmCustomer(Number(row.dataset.id));
  });
  $('crmList').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('crm-row')) openCrmCustomer(Number(e.target.dataset.id));
  });
  $('crmPager').addEventListener('click', (e) => {
    if (e.target.closest('#crmPrev') && CRMQ.page > 0) { CRMQ.page--; loadCrmList(); }
    else if (e.target.closest('#crmNext')) { CRMQ.page++; loadCrmList(); }
  });
  $('crmTagChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.ad-chip');
    if (!chip) return;
    CRMQ.tag = chip.dataset.tag || '';
    CRMQ.page = 0;
    renderCrmTagChips();
    loadCrmList();
  });
  const runCrmSearch = debounce(() => { CRMQ.page = 0; loadCrmList(); }, 220);
  $('crmSearch').addEventListener('input', (e) => {
    CRMQ.q = e.target.value.trim();
    $('crmSearchWrap').classList.toggle('has-value', !!CRMQ.q);
    runCrmSearch();
  });
  $('crmSearchClear').addEventListener('click', () => {
    $('crmSearch').value = ''; CRMQ.q = '';
    $('crmSearchWrap').classList.remove('has-value');
    CRMQ.page = 0; loadCrmList();
  });
  $('crmFilter').addEventListener('change', (e) => { CRMQ.filter = e.target.value; CRMQ.page = 0; loadCrmList(); });
  $('crmSort').addEventListener('change', (e) => { CRMQ.sort = e.target.value; CRMQ.page = 0; loadCrmList(); });

  $('crmDetailPane').addEventListener('click', async (e) => {
    const tagEl = e.target.closest('.crm-tag-editor .crm-tag[data-tagid]');
    if (tagEl) {
      const id = Number(tagEl.dataset.tagid);
      const has = CRM_DETAIL.tags.some(x => x.id === id);
      const ids = has ? CRM_DETAIL.tags.filter(x => x.id !== id).map(x => x.id) : [...CRM_DETAIL.tags.map(x => x.id), id];
      try {
        await PG.api(`/admin/crm/customers/${CRM_SEL}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds: ids }) });
        const { customer } = await PG.api(`/admin/crm/customers/${CRM_SEL}`);
        CRM_DETAIL = customer; renderCrmDetail(customer); loadCrmList();
      } catch (err) { PG.toast(err.message || 'تغییر برچسب انجام نشد', 'error'); }
      return;
    }
    if (e.target.closest('#crmNoteAdd')) {
      const v = $('crmNoteInput').value.trim();
      if (!v) { PG.toast('متن یادداشت خالی است', 'error'); return; }
      try {
        const { note } = await PG.api(`/admin/crm/customers/${CRM_SEL}/notes`, { method: 'POST', body: JSON.stringify({ body: v }) });
        CRM_DETAIL.notes.unshift(note);
        renderCrmDetail(CRM_DETAIL);
      } catch (err) { PG.toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('#crmTaskAdd')) {
      const t = $('crmTaskTitle').value.trim();
      if (!t) { PG.toast('عنوان پیگیری خالی است', 'error'); return; }
      try {
        const { task } = await PG.api(`/admin/crm/customers/${CRM_SEL}/tasks`, { method: 'POST', body: JSON.stringify({ title: t, dueAt: $('crmTaskDue').value || null }) });
        CRM_DETAIL.tasks.push(task);
        renderCrmDetail(CRM_DETAIL);
      } catch (err) { PG.toast(err.message, 'error'); }
      return;
    }
    const delNote = e.target.closest('.crm-del-note');
    if (delNote) {
      try {
        await PG.api(`/admin/crm/notes/${delNote.dataset.id}`, { method: 'DELETE' });
        CRM_DETAIL.notes = CRM_DETAIL.notes.filter(n => n.id !== Number(delNote.dataset.id));
        renderCrmDetail(CRM_DETAIL);
      } catch (err) { PG.toast(err.message, 'error'); }
      return;
    }
    const toggle = e.target.closest('.crm-task-toggle');
    if (toggle) {
      const taskEl = toggle.closest('.crm-task');
      const task = CRM_DETAIL.tasks.find(x => x.id === Number(taskEl.dataset.id));
      if (!task) return;
      try {
        const { task: up } = await PG.api(`/admin/crm/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done: !task.done }) });
        const i = CRM_DETAIL.tasks.findIndex(x => x.id === up.id);
        CRM_DETAIL.tasks[i] = up;
        renderCrmDetail(CRM_DETAIL);
      } catch (err) { PG.toast(err.message, 'error'); }
      return;
    }
    const delTask = e.target.closest('.crm-task-del');
    if (delTask) {
      const taskEl = delTask.closest('.crm-task');
      try {
        await PG.api(`/admin/crm/tasks/${taskEl.dataset.id}`, { method: 'DELETE' });
        CRM_DETAIL.tasks = CRM_DETAIL.tasks.filter(t => t.id !== Number(taskEl.dataset.id));
        renderCrmDetail(CRM_DETAIL);
      } catch (err) { PG.toast(err.message, 'error'); }
      return;
    }
  });

  // --- بازحساب RFM مشتری ---
  $('crmDetailPane').addEventListener('click', async (e) => {
    if (e.target.closest('#btnCrmRecalcCust')) {
      try {
        const { score } = await PG.api(`/admin/crm/customers/${CRM_SEL}/recalc`, { method: 'POST' });
        if (CRM_DETAIL) { CRM_DETAIL.score = score; renderCrmDetail(CRM_DETAIL); }
        PG.toast('امتیاز بازحساب شد ✅', 'success');
      } catch (err) { PG.toast(err.message, 'error'); }
    }
  });
  // --- بازحساب همه مشتریان (از KPI) ---
  $('crmKpis').addEventListener('click', async (e) => {
    if (e.target.closest('#btnCrmRecalc')) {
      try {
        await PG.api('/admin/crm/recalc-all', { method: 'POST' });
        PG.toast('امتیاز همه مشتریان بازحساب شد ✅', 'success');
        loadCrm();
      } catch (err) { PG.toast(err.message, 'error'); }
    }
  });

  // --- مودال برچسب جدید ---
  $('btnCrmTag').addEventListener('click', () => {
    $('ctName').value = '';
    $('ctColor').value = '#2BD9BC';
    openModal('crmTagModal');
    setTimeout(() => $('ctName').focus(), 60);
  });
  $('ctClose').addEventListener('click', () => closeModal('crmTagModal'));
  $('ctCancel').addEventListener('click', () => closeModal('crmTagModal'));
  $('ctSave').addEventListener('click', async () => {
    const name = $('ctName').value.trim();
    if (!name) { PG.toast('نام برچسب را وارد کنید', 'error'); return; }
    try {
      await PG.api('/admin/crm/tags', { method: 'POST', body: JSON.stringify({ name, color: $('ctColor').value }) });
      closeModal('crmTagModal');
      PG.toast('برچسب ساخته شد ✅', 'success');
      CRM_TAGS = (await PG.api('/admin/crm/tags')).tags;
      renderCrmTagChips();
      if (CRM_DETAIL) { const { customer } = await PG.api(`/admin/crm/customers/${CRM_SEL}`); CRM_DETAIL = customer; renderCrmDetail(customer); }
    } catch (err) { PG.toast(err.message, 'error'); }
  });

  // ============================================================
  // ۵) گزارش‌ها
  // ============================================================
  async function loadReport() {
    const days = Number($('reportRange').value) || 30;
    $('reportChart').innerHTML = '<div class="ad-skel skel-190"></div>';
    try {
      const d = await PG.api(`/admin/reports?days=${days}`);
      const s = d.stats;
      const inRange = d.series.reduce((a, p) => ({ sales: a.sales + p.sales, orders: a.orders + p.orders }), { sales: 0, orders: 0 });
      const best = d.series.reduce((a, p) => (p.sales > (a?.sales || 0) ? p : a), null);
      const activeDays = d.series.filter(p => p.orders > 0).length;

      $('reportKpis').innerHTML = [
        kpi({ label: `فروش ${money(days)} روز`, num: money(inRange.sales), unit: 'تومان', icon: 'i-wallet',
          sub: `${money(inRange.orders)} سفارش در این بازه` }),
        kpi({ label: 'میانگین روزانه', num: money(Math.round(inRange.sales / days)), unit: 'تومان', icon: 'i-chart', tone: 'blue',
          sub: `${money(activeDays)} روز از ${money(days)} روز فروش داشته` }),
        kpi({ label: 'میانگین هر سفارش', num: money(inRange.orders ? Math.round(inRange.sales / inRange.orders) : 0), unit: 'تومان', icon: 'i-trend-up', tone: 'purple',
          sub: `میانگین کل تاریخ فروشگاه: ${money(s.total_orders ? Math.round(s.total_sales / s.total_orders) : 0)}` }),
        kpi({ label: 'بهترین روز', num: `<span class="fs-16">${esc(best && best.sales ? dayLabel(best.day) : '—')}</span>`, icon: 'i-star', tone: 'gold',
          sub: best && best.sales ? `${money(best.sales)} تومان در یک روز` : 'در این بازه فروشی نبوده' }),
        kpi({ label: 'سفارش‌های ناموفق', num: money((s.failed_orders || 0) + (s.canceled_orders || 0)), unit: 'عدد', icon: 'i-ban',
          tone: ((s.failed_orders || 0) + (s.canceled_orders || 0)) ? 'coral' : '',
          sub: `${money(s.failed_orders || 0)} پرداخت ناموفق · ${money(s.canceled_orders || 0)} لغو شده` })
      ].join('');

      $('reportRangeHint').textContent = `${money(days)} روز اخیر — از ${dayLabel(d.series[0].day)} تا ${dayLabel(d.series[d.series.length - 1].day)}`;
      drawChart($('reportChart'), d.series);

      $('reportProducts').innerHTML = d.topProducts.length ? d.topProducts.map((p, i) => `
        <tr><td>${money(i + 1)}</td><td>${esc(p.title)}</td><td>${money(p.qty)}</td><td>${money(p.revenue)}</td></tr>`).join('')
        : `<tr><td colspan="4">${emptyBox('i-box', 'فروشی ثبت نشده')}</td></tr>`;

      $('reportCustomers').innerHTML = d.topCustomers.length ? d.topCustomers.map((c, i) => `
        <tr><td>${money(i + 1)}</td>
          <td>${esc(c.fullName || 'بدون نام')}<br><small class="muted"><bdo dir="ltr">${esc(c.phone)}</bdo></small></td>
          <td>${money(c.orders)}</td><td>${money(c.spent)}</td></tr>`).join('')
        : `<tr><td colspan="4">${emptyBox('i-users', 'خریدی ثبت نشده')}</td></tr>`;

      drawBars($('reportCats'), d.categories, { name: 'category', value: 'revenue' });
    } catch (e) {
      $('reportChart').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }
  $('reportRange').addEventListener('change', loadReport);
  $('btnPrintReport').addEventListener('click', () => window.print());

  /* ---------- گزارشِ ماه‌به‌ماهِ شمسی ----------
     چرا جدا از loadReport: بازه‌ی روزانه‌ی بالا به «مرداد چطور بود؟» جواب نمی‌دهد
     و برعکس. دو select جدا یعنی مدیر می‌تواند هم‌زمان «۳۰ روز اخیر» و «۲۴ ماه»
     را ببیند بدون اینکه یکی دیگری را عوض کند. */
  async function loadMonthly() {
    const months = Number($('monthlyRange').value) || 12;
    $('monthlyBody').innerHTML = `<tr><td colspan="6">${skel(3)}</td></tr>`;
    try {
      const d = await PG.api(`/admin/reports/monthly?months=${months}`);
      // از قدیم به جدید می‌آید؛ جدول را برعکس نشان می‌دهیم تا ماهِ جاری بالا باشد
      // (چیزی که مدیر اول می‌خواهد ببیند)، ولی نمودار میله‌ای ترتیبِ زمانی می‌ماند.
      const rows = d.rows.slice().reverse();

      $('monthlyBody').innerHTML = rows.map((m, i) => {
        // رشد سه حالت دارد و هر سه باید فرق داشته باشند: مثبت، منفی، و
        // «ماهِ قبل صفر بوده» (null) که درصدِ معنادار ندارد.
        const g = m.growth;
        const growth = g === null
          ? '<span class="muted">—</span>'
          : `<span class="mrep-growth ${g > 0 ? 'up' : g < 0 ? 'down' : ''}">${
              g === 0 ? '' : `<svg><use href="#i-trend-${g > 0 ? 'up' : 'down'}"/></svg>`
            }${money(Math.abs(g))}٪</span>`;
        return `<tr${i === 0 ? ' class="mrep-now"' : ''}>
          <td><b>${esc(m.label)}</b>${i === 0 ? ' <span class="mrep-tag">ماه جاری</span>' : ''}</td>
          <td>${money(m.sales)}</td>
          <td>${money(m.orders)}</td>
          <td>${money(m.customers)}</td>
          <td>${money(m.avg)}</td>
          <td>${growth}</td>
        </tr>`;
      }).join('') + `
        <tr class="mrep-sum">
          <td><b>جمع کل</b></td>
          <td><b>${money(d.totals.sales)}</b></td>
          <td>${money(d.totals.orders)}</td>
          <td>—</td>
          <td>${money(d.totals.avg)}</td>
          <td>—</td>
        </tr>`;

      drawBars($('monthlyBars'), d.rows.filter(m => m.sales > 0), { name: 'label', value: 'sales' });

      // تقویمِ میلادی یعنی ICU کوچک است و ماه‌ها شمسی نیستند — این را باید
      // گفت، وگرنه مدیر عددهای «مرداد» را می‌بیند که واقعاً مرداد نیستند.
      $('monthlyHint').innerHTML = d.calendar === 'jalali'
        ? (d.best ? `بهترین ماه: <b>${esc(d.best.label)}</b> با ${money(d.best.sales)} تومان` : 'هنوز فروشی ثبت نشده')
        : '⚠️ تقویم شمسی روی این سرور در دسترس نیست؛ ماه‌ها میلادی‌اند.';
    } catch (e) {
      $('monthlyBody').innerHTML = `<tr><td colspan="6"><div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div></td></tr>`;
      $('monthlyBars').innerHTML = '';
    }
  }
  $('monthlyRange').addEventListener('change', loadMonthly);
  $('btnExportMonthly').addEventListener('click', () => {
    location.href = `/api/admin/export/monthly.csv?months=${Number($('monthlyRange').value) || 12}`;
  });

  // ============================================================
  // ۶) تنظیمات
  // ============================================================
  async function loadConfig() {
    try {
      ({ settings: SETTINGS } = await PG.api('/admin/settings'));
      $('cfgName').value = SETTINGS.shop_name || '';
      $('cfgPhone').value = SETTINGS.shop_phone || '';
      $('cfgAddr').value = SETTINGS.shop_address || '';
      $('cfgShip').value = SETTINGS.shipping_cost || '0';
      $('cfgFree').value = SETTINGS.free_shipping_over || '0';
      $('cfgLow').value = SETTINGS.low_stock_threshold || '5';
      $('cfgAnn').value = SETTINGS.announcement || '';
      $('cfgOpen').checked = SETTINGS.shop_open !== '0';
      $('cfgPromoText').value = SETTINGS.promo_text || '';
      $('cfgPromoCode').value = SETTINGS.promo_code || '';
      $('cfgAlert').innerHTML = '';
    } catch (e) {
      $('cfgAlert').innerHTML = `<div class="alert alert-error mb-14"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }
  $('cfgReload').addEventListener('click', loadConfig);

  $('formSettings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { settings } = await PG.api('/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          shop_name: $('cfgName').value.trim(),
          shop_phone: $('cfgPhone').value.trim(),
          shop_address: $('cfgAddr').value.trim(),
          shipping_cost: String(Number($('cfgShip').value) || 0),
          free_shipping_over: String(Number($('cfgFree').value) || 0),
          low_stock_threshold: String(Number($('cfgLow').value) || 0),
          announcement: $('cfgAnn').value.trim(),
          shop_open: $('cfgOpen').checked ? '1' : '0',
          promo_text: $('cfgPromoText').value.trim(),
          promo_code: $('cfgPromoCode').value.trim()
        })
      });
      SETTINGS = settings;
      $('cfgAlert').innerHTML = `<div class="alert alert-success mb-14"><svg><use href="#i-check-circle"/></svg><span>تنظیمات ذخیره شد ✅</span></div>`;
      PG.toast('تنظیمات ذخیره شد', 'success');
      if (LOADED.has('log')) loadLog();
    } catch (err) {
      $('cfgAlert').innerHTML = `<div class="alert alert-error mb-14"><svg><use href="#i-alert"/></svg><span>${esc(err.message)}</span></div>`;
    } finally { btn.disabled = false; }
  });

  // ============================================================
  // ۷) دفتر رویدادها
  // ============================================================
  async function loadLog() {
    $('logHost').innerHTML = skel(5);
    try {
      const { activity } = await PG.api(`/admin/activity?limit=${encodeURIComponent($('logLimit').value)}`);
      if (!activity.length) { $('logHost').innerHTML = emptyBox('i-history', 'هنوز رویدادی ثبت نشده'); return; }
      $('logHost').innerHTML = activity.map(a => `
        <div class="ad-log-row">
          <span class="ad-log-dot ${ACTION_TONE[a.action] || ''}"></span>
          <span class="grow">
            <b>${esc(ACTION_FA[a.action] || a.action)}</b>${a.target ? ` — <bdo dir="ltr">${esc(a.target)}</bdo>` : ''}
            <small>${esc(a.detail || '')}${a.by ? `${a.detail ? ' · ' : ''}توسط ${esc(a.by)}` : ''}</small>
          </span>
          <time title="${esc(faFull(a.at))}">${esc(ago(a.at))}</time>
        </div>`).join('');
    } catch (e) {
      $('logHost').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }
  $('logLimit').addEventListener('change', loadLog);

  // ============================================================
  // مودال‌ها: باز/بسته + Escape + کلیک بیرون
  // ============================================================
  function openModal(id) {
    $(id).classList.add('open');
    document.body.classList.add('qv-lock');
  }
  function closeModal(id) {
    $(id).classList.remove('open');
    if (!document.querySelector('.ad-modal.open')) document.body.classList.remove('qv-lock');
  }
  document.querySelectorAll('.ad-modal').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(m.id); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.ad-modal.open');
    if (open) closeModal(open.id);
  });

  // ============================================================
  // راه‌اندازی
  // ============================================================
  // ============================================================
  // نظرات محصولات — صف تأیید
  // ============================================================
  let RQ_STATUS = 'pending'; // پیش‌فرض: چیزی که منتظر تأیید شماست
  const RV_CHIP_DEFS = [['pending', 'در انتظار تأیید'], ['approved', 'تأییدشده'], ['rejected', 'ردشده'], ['all', 'همه']];
  const RV_STATUS_FA = { pending: 'در انتظار', approved: 'تأییدشده', rejected: 'ردشده' };
  const rvStars = (n) => `<span class="rv-adm-stars" dir="ltr" aria-label="${money(n)} ستاره">${
    Array.from({ length: 5 }, (_, i) => `<svg class="${i < n ? 'on' : ''}"><use href="#i-star"/></svg>`).join('')}</span>`;

  async function loadReviews() {
    $('reviewsHost').innerHTML = skel(3);
    try {
      const d = await PG.api('/admin/reviews?status=' + RQ_STATUS);
      $('reviewChips').innerHTML = RV_CHIP_DEFS.map(([k, label]) =>
        `<button class="ad-chip ${RQ_STATUS === k ? 'active' : ''}" data-rv="${k}">${esc(label)} <b>${money(d.counts[k] ?? 0)}</b></button>`).join('');
      $('navReviews').textContent = money(d.counts.pending || 0);
      $('navReviews').classList.toggle('urgent', (d.counts.pending || 0) > 0);

      if (!d.reviews.length) {
        $('reviewsHost').innerHTML = emptyBox('i-quote', RQ_STATUS === 'pending' ? 'نظری در انتظار تأیید نیست 👌' : 'نظری با این وضعیت پیدا نشد');
        return;
      }
      $('reviewsHost').innerHTML = d.reviews.map(r => `
        <article class="ad-review" data-id="${r.id}">
          <div class="ad-review-main">
            <div class="ad-review-head">
              <b>${esc(r.productTitle)}</b>
              ${rvStars(r.rating)}
              <span class="status-badge status-rv-${esc(r.status)}">${RV_STATUS_FA[r.status] || esc(r.status)}</span>
              ${r.isBuyer ? '<span class="rv-buyer"><svg><use href="#i-check-circle"/></svg> خریدار</span>' : ''}
            </div>
            <p class="ad-review-body">${r.body ? esc(r.body) : '<span class="muted-i">(بدون متن — فقط امتیاز)</span>'}</p>
            <div class="ad-review-meta">${esc(r.userName)} — <bdo dir="ltr">${esc(r.userPhone)}</bdo> — ${esc(faFull(r.createdAt))}</div>
          </div>
          <div class="ad-review-actions">
            ${r.status !== 'approved' ? `<button class="btn btn-primary btn-sm act-rv-approve"><svg><use href="#i-check"/></svg> تأیید</button>` : ''}
            ${r.status !== 'rejected' ? `<button class="btn btn-ghost btn-sm act-rv-reject txt-danger"><svg><use href="#i-ban"/></svg> رد</button>` : ''}
          </div>
        </article>`).join('');
    } catch (e) {
      $('reviewsHost').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  $('reviewChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-rv]');
    if (!chip) return;
    RQ_STATUS = chip.dataset.rv;
    loadReviews();
  });

  $('reviewsHost').addEventListener('click', async (e) => {
    const card = e.target.closest('.ad-review');
    if (!card) return;
    const approve = e.target.closest('.act-rv-approve');
    const reject = e.target.closest('.act-rv-reject');
    if (!approve && !reject) return;
    const btn = approve || reject;
    btn.disabled = true;
    try {
      await PG.api(`/admin/reviews/${Number(card.dataset.id)}/status`, {
        method: 'POST', body: JSON.stringify({ status: approve ? 'approved' : 'rejected' })
      });
      PG.toast(approve ? 'نظر تأیید شد و روی سایت رفت' : 'نظر رد شد', approve ? 'success' : 'info');
      loadReviews();
      if (LOADED.has('log')) loadLog();
    } catch (err) {
      PG.toast(err.message || 'خطا در تغییر وضعیت نظر', 'error');
      btn.disabled = false;
    }
  });

  // ============================================================
  // مدیریت دسته‌بندی‌ها (داخل بخش انبار)
  // ============================================================
  const CAT_ICONS_FA = { 'i-package': 'بسته', 'i-box': 'جعبه', 'i-bucket': 'سطل', 'i-tub': 'تشت', 'i-basket': 'سبد', 'i-chair': 'صندلی', 'i-hanger': 'چوب‌لباسی', 'i-dishrack': 'آبچکان', 'i-table': 'میز', 'i-broom': 'جارو', 'i-tag': 'برچسب' };
  $('catNewIcon').innerHTML = ICON_CHOICES.map(ic => `<option value="${ic}">${esc(CAT_ICONS_FA[ic] || ic)}</option>`).join('');

  async function loadCats() {
    try {
      const { categories } = await PG.api('/admin/categories');
      paintCats(categories);
    } catch (e) {
      $('catHost').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }
  function paintCats(categories) {
    $('catHost').innerHTML = categories.map((c, i) => `
      <div class="cat-row" data-id="${c.id}">
        <svg class="cat-row-icon"><use href="#${esc(c.icon)}"/></svg>
        <input type="text" class="cat-name" value="${esc(c.name)}" maxlength="40">
        <select class="cat-icon ad-select">${ICON_CHOICES.map(ic =>
          `<option value="${ic}" ${ic === c.icon ? 'selected' : ''}>${esc(CAT_ICONS_FA[ic] || ic)}</option>`).join('')}</select>
        <span class="cat-count" title="${money(c.count)} کالا روی سایت از ${money(c.countAll ?? c.count)} کالای این دسته">${money(c.count)} کالا${(c.countAll ?? c.count) > c.count ? ` <i class="cat-draft">+${money((c.countAll ?? c.count) - c.count)} پیش‌نویس</i>` : ''}</span>
        <button type="button" class="icon-btn cat-up" title="بالا" ${i === 0 ? 'disabled' : ''}><svg class="rot180"><use href="#i-chevron-down"/></svg></button>
        <button type="button" class="icon-btn cat-down" title="پایین" ${i === categories.length - 1 ? 'disabled' : ''}><svg><use href="#i-chevron-down"/></svg></button>
        <button type="button" class="icon-btn cat-save" title="ذخیره"><svg><use href="#i-save"/></svg></button>
        <!-- شرطِ حذف عمداً countAll است نه count: دسته‌ای که ۱۸ پیش‌نویس دارد
             روی سایت «۰ کالا» است، ولی حذفش آن ۱۸ تا را بی‌دسته می‌کند. -->
        <button type="button" class="icon-btn danger cat-del" title="${(c.countAll ?? c.count) > 0 ? 'اول کالاهای این دسته را جابه‌جا کن' : 'حذف'}" ${(c.countAll ?? c.count) > 0 ? 'disabled' : ''}><svg><use href="#i-trash"/></svg></button>
      </div>`).join('');
  }

  $('catAdd').addEventListener('click', async () => {
    const name = $('catNewName').value.trim();
    if (name.length < 2) return PG.toast('نام دسته حداقل ۲ حرف است', 'error');
    try {
      await PG.api('/admin/categories', { method: 'POST', body: JSON.stringify({ name, icon: $('catNewIcon').value }) });
      PG.toast('دسته اضافه شد ✅', 'success');
      $('catNewName').value = '';
      loadCats();
    } catch (err) { PG.toast(err.message, 'error'); }
  });

  $('catHost').addEventListener('click', async (e) => {
    const row = e.target.closest('.cat-row');
    if (!row) return;
    const id = Number(row.dataset.id);
    try {
      if (e.target.closest('.cat-save')) {
        const r = await PG.api(`/admin/categories/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: row.querySelector('.cat-name').value.trim(), icon: row.querySelector('.cat-icon').value })
        });
        paintCats(r.categories);
        PG.toast('دسته ذخیره شد (نام محصولاتش هم به‌روز شد)', 'success');
        if (LOADED.has('stock')) loadStock();
      } else if (e.target.closest('.cat-up') || e.target.closest('.cat-down')) {
        const r = await PG.api(`/admin/categories/${id}/move`, {
          method: 'POST', body: JSON.stringify({ dir: e.target.closest('.cat-up') ? 'up' : 'down' })
        });
        paintCats(r.categories);
      } else if (e.target.closest('.cat-del')) {
        await PG.api(`/admin/categories/${id}`, { method: 'DELETE' });
        PG.toast('دسته حذف شد', 'info');
        loadCats();
      }
    } catch (err) { PG.toast(err.message, 'error'); }
  });

  // ============================================================
  // سفارش دستی (تلفنی/حضوری)
  // ============================================================
  let MO_PRODUCTS = []; // کاتالوگ برای انتخاب کالا در مودال

  function moRowHtml() {
    const opts = MO_PRODUCTS.map(p =>
      `<option value="${p.id}" data-price="${p.price}" ${p.stock <= 0 ? 'disabled' : ''}>
        ${esc(p.title)} — ${money(p.price)} ت${p.stock <= 0 ? ' (ناموجود)' : ` (موجودی ${money(p.stock)})`}
      </option>`).join('');
    return `<div class="mo-row">
      <select class="ad-select mo-p"><option value="">انتخاب کالا…</option>${opts}</select>
      <input type="number" class="mo-q" min="1" max="99" value="1" dir="ltr" aria-label="تعداد">
      <button type="button" class="pm-g-del mo-del" title="حذف ردیف"><svg><use href="#i-close"/></svg></button>
    </div>`;
  }

  function moPaintTotal() {
    let sum = 0;
    $('moRows').querySelectorAll('.mo-row').forEach(row => {
      const opt = row.querySelector('.mo-p').selectedOptions[0];
      const qty = Math.max(1, Number(row.querySelector('.mo-q').value) || 1);
      if (opt && opt.value) sum += Number(opt.dataset.price) * qty;
    });
    sum += Math.max(0, Number($('moShip').value) || 0);
    $('moTotal').textContent = `جمع: ${money(sum)} تومان`;
  }

  $('btnManualOrder').addEventListener('click', async () => {
    try {
      ({ products: MO_PRODUCTS } = await PG.api('/products'));
    } catch (e) { return PG.toast('لیست محصولات نیامد؛ دوباره تلاش کنید', 'error'); }
    $('moAlert').innerHTML = '';
    $('formManual').reset();
    $('moShip').value = '0';
    $('moRows').innerHTML = moRowHtml();
    moPaintTotal();
    openModal('manualModal');
    $('moPhone').focus();
  });
  $('moClose').addEventListener('click', () => closeModal('manualModal'));
  $('moCancel').addEventListener('click', () => closeModal('manualModal'));
  $('moAddRow').addEventListener('click', () => {
    if ($('moRows').querySelectorAll('.mo-row').length >= 20) return PG.toast('حداکثر ۲۰ ردیف', 'error');
    $('moRows').insertAdjacentHTML('beforeend', moRowHtml());
  });
  $('moRows').addEventListener('click', (e) => {
    const del = e.target.closest('.mo-del');
    if (del) {
      if ($('moRows').querySelectorAll('.mo-row').length > 1) del.closest('.mo-row').remove();
      moPaintTotal();
    }
  });
  $('moRows').addEventListener('input', moPaintTotal);
  $('moShip').addEventListener('input', moPaintTotal);

  $('formManual').addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = [...$('moRows').querySelectorAll('.mo-row')]
      .map(row => ({ productId: Number(row.querySelector('.mo-p').value), qty: Number(row.querySelector('.mo-q').value) || 1 }))
      .filter(i => i.productId);
    if (!items.length) {
      $('moAlert').innerHTML = `<div class="alert alert-error mb-14"><svg><use href="#i-alert"/></svg><span>حداقل یک کالا انتخاب کنید</span></div>`;
      return;
    }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await PG.api('/admin/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          phone: $('moPhone').value.trim(),
          fullName: $('moName').value.trim(),
          items,
          shippingFee: Number($('moShip').value) || 0,
          note: $('moNote').value.trim()
        })
      });
      PG.toast('سفارش دستی ثبت شد ✅ (پرداخت‌شده)', 'success');
      closeModal('manualModal');
      loadOrders();
      if (LOADED.has('dash')) loadDash();
      if (LOADED.has('stock')) loadStock();
      if (LOADED.has('log')) loadLog();
    } catch (err) {
      $('moAlert').innerHTML = `<div class="alert alert-error mb-14"><svg><use href="#i-alert"/></svg><span>${esc(err.message)}</span></div>`;
    } finally { btn.disabled = false; }
  });

  // ============================================================
  // درخواست‌های خرید عمده (B2B)
  // ============================================================
  const WS_STATUS = { new: 'جدید', contacted: 'تماس گرفته شد', done: 'انجام شد' };
  async function loadWholesale() {
    $('wsHost').innerHTML = skel(3);
    try {
      const { requests } = await PG.api('/admin/wholesale/requests');
      $('wsResultBar').textContent = `${money(requests.length)} درخواست`;
      if (!requests.length) {
        $('wsHost').innerHTML = emptyBox('i-box', 'هنوز درخواست عمده‌ای نیامده است');
        return;
      }
      $('wsHost').innerHTML = requests.map(r => `
        <div class="ws-request ${r.status}" data-id="${r.id}">
          <div class="grow">
            <b>${esc(r.name)} <bdo dir="ltr">${esc(r.phone)}</bdo></b>
            <small>${r.product_title ? `${esc(r.product_title)} · ` : ''}${r.quantity ? `تعداد ${money(r.quantity)} · ` : ''}${r.note ? esc(r.note) + ' · ' : ''}${new Date(r.created_at).toLocaleString('fa-IR')}</small>
          </div>
          <span class="ws-status ${r.status}">${WS_STATUS[r.status] || r.status}</span>
          <button class="btn btn-ghost btn-sm ws-contact${r.status === 'new' ? '' : ' hidden'}">تماس گرفتم</button>
          <button class="btn btn-outline btn-sm ws-done${r.status === 'done' ? ' hidden' : ''}">انجام شد</button>
          <button class="btn btn-ghost btn-sm ws-del txt-danger" aria-label="حذف"><svg><use href="#i-trash"/></svg></button>
        </div>`).join('');
    } catch (e) {
      $('wsHost').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  async function wsSetStatus(id, status, btn) {
    btn.disabled = true;
    try {
      await PG.api(`/admin/wholesale/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      PG.toast('به‌روز شد', 'success');
      loadWholesale();
      if (LOADED.has('dash')) loadDash();
    } catch (err) { PG.toast(err.message, 'error'); btn.disabled = false; }
  }

  $('wsHost').addEventListener('click', async (e) => {
    const card = e.target.closest('.ws-request');
    if (!card) return;
    const id = Number(card.dataset.id);

    const contact = e.target.closest('.ws-contact');
    if (contact) { await wsSetStatus(id, 'contacted', contact); return; }

    const done = e.target.closest('.ws-done');
    if (done) { await wsSetStatus(id, 'done', done); return; }

    const del = e.target.closest('.ws-del');
    if (del) {
      if (!del.dataset.armed) {
        del.dataset.armed = '1';
        del.textContent = 'مطمئنی؟';
        setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.innerHTML = '<svg><use href="#i-trash"/></svg>'; } }, 3500);
        return;
      }
      del.disabled = true;
      try {
        await PG.api(`/admin/wholesale/requests/${id}`, { method: 'DELETE' });
        PG.toast('درخواست حذف شد', 'info');
        loadWholesale();
        if (LOADED.has('dash')) loadDash();
      } catch (err) { PG.toast(err.message, 'error'); del.disabled = false; }
    }
  });

  $('wsReload').addEventListener('click', () => loadWholesale());

  // کدهای تخفیف
  // ============================================================
  async function loadCoupons() {
    $('couponsHost').innerHTML = skel(2);
    try {
      const { coupons } = await PG.api('/admin/coupons');
      if (!coupons.length) {
        $('couponsHost').innerHTML = emptyBox('i-tag', 'هنوز کدی نساخته‌اید — اولین جشنواره را راه بیندازید!');
        return;
      }
      $('couponsHost').innerHTML = coupons.map(c => `
        <article class="ad-review${c.active ? '' : ' cp-off'}" data-id="${c.id}" data-active="${c.active ? 1 : 0}">
          <div class="ad-review-main">
            <div class="ad-review-head">
              <b class="cp-code"><bdo dir="ltr">${esc(c.code)}</bdo></b>
              <button class="ad-copy" data-copy="${esc(c.code)}" title="کپی کد"><svg><use href="#i-copy"/></svg></button>
              <span class="status-badge ${c.active ? 'status-rv-approved' : 'status-rv-rejected'}">${c.active ? 'فعال' : 'خاموش'}</span>
            </div>
            <p class="ad-review-body">
              ${c.type === 'percent'
                ? `${money(c.value)}٪ تخفیف${c.maxDiscount ? ` تا سقف ${money(c.maxDiscount)} تومان` : ''}`
                : `${money(c.value)} تومان تخفیف ثابت`}${c.minTotal ? ` — برای خرید بالای ${money(c.minTotal)} تومان` : ''}
            </p>
            <div class="ad-review-meta">
              مصرف: ${money(c.uses)}${c.usageLimit ? ` از ${money(c.usageLimit)}` : ' (بدون سقف)'}
              — هر مشتری: ${c.perUserLimit ? `${money(c.perUserLimit)} بار` : 'نامحدود'}
              — انقضا: ${c.expiresAt ? `<bdo dir="ltr">${esc(c.expiresAt)}</bdo>` : 'ندارد'}
            </div>
          </div>
          <div class="ad-review-actions">
            <button class="btn btn-outline btn-sm cp-toggle">${c.active ? 'خاموش کن' : 'روشن کن'}</button>
            <button class="btn btn-ghost btn-sm cp-del txt-danger"><svg><use href="#i-trash"/></svg> حذف</button>
          </div>
        </article>`).join('');
    } catch (e) {
      $('couponsHost').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
    }
  }

  $('cpType').addEventListener('change', () => {
    $('cpValueHint').textContent = $('cpType').value === 'percent' ? '(درصد، ۱ تا ۹۰)' : '(تومان)';
  });

  $('formCoupon').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await PG.api('/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: $('cpCode').value.trim(),
          type: $('cpType').value,
          value: Number($('cpValue').value),
          minTotal: Number($('cpMin').value) || 0,
          maxDiscount: Number($('cpMax').value) || 0,
          expiresAt: $('cpExpire').value || '',
          usageLimit: Number($('cpLimit').value) || 0,
          perUserLimit: $('cpPerUser').value === '' ? 1 : Number($('cpPerUser').value)
        })
      });
      PG.toast('کد تخفیف ساخته شد ✅', 'success');
      $('cpAlert').innerHTML = '';
      e.target.reset();
      $('cpPerUser').value = '1';
      loadCoupons();
      if (LOADED.has('log')) loadLog();
    } catch (err) {
      $('cpAlert').innerHTML = `<div class="alert alert-error mb-14"><svg><use href="#i-alert"/></svg><span>${esc(err.message)}</span></div>`;
    } finally { btn.disabled = false; }
  });

  $('couponsHost').addEventListener('click', async (e) => {
    const card = e.target.closest('.ad-review');
    if (!card) return;
    const id = Number(card.dataset.id);

    const toggle = e.target.closest('.cp-toggle');
    if (toggle) {
      toggle.disabled = true;
      try {
        await PG.api(`/admin/coupons/${id}`, {
          method: 'PUT', body: JSON.stringify({ active: card.dataset.active !== '1' })
        });
        loadCoupons();
        if (LOADED.has('log')) loadLog();
      } catch (err) { PG.toast(err.message, 'error'); toggle.disabled = false; }
      return;
    }

    const del = e.target.closest('.cp-del');
    if (del) {
      // تأیید دومرحله‌ای همان‌جا — بدون دیالوگ خام مرورگر
      if (!del.dataset.armed) {
        del.dataset.armed = '1';
        del.textContent = 'مطمئنی؟ دوباره بزن';
        setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.innerHTML = '<svg><use href="#i-trash"/></svg> حذف'; } }, 3500);
        return;
      }
      del.disabled = true;
      try {
        await PG.api(`/admin/coupons/${id}`, { method: 'DELETE' });
        PG.toast('کد حذف شد', 'info');
        loadCoupons();
        if (LOADED.has('log')) loadLog();
      } catch (err) { PG.toast(err.message, 'error'); del.disabled = false; }
    }
  });

  // ============================================================
  // خطاهای سرور
  // ============================================================
  // چرا گروه‌بندی‌شده و نه لاگِ خام: یک خطِ لاگ ~۱۵۰۰ کاراکتر است که بیشترش
  // stack traceِ داخلیِ express است، و اگر خطایی ۲۰۰ بار تکرار شده باشد،
  // خطای یک‌بارِ *مهم* لای آن گم می‌شود. سرور در lib/error-digest.js جمعشان می‌کند.
  /* نشانِ کنارِ منو همیشه «۵xxِ امروز» است، نه تعدادِ کلِ بازه‌ی انتخابی.
     اگر با بازه عوض می‌شد، عددِ نشان با عوض‌کردنِ یک کشویی می‌پرید بالا و
     ادمین فکر می‌کرد چیزی همین حالا خراب شده. */
  function errBadge(n) {
    const el = $('navErrors');
    if (!el) return;
    el.textContent = money(n || 0);
    el.classList.toggle('urgent', (n || 0) > 0);
  }

  async function loadErrors() {
    $('errKpis').innerHTML = Array.from({ length: 3 }, () => '<div class="ad-skel ad-skel-kpi"></div>').join('');
    $('errHost').innerHTML = skel(4);
    try {
      const d = await PG.api(`/admin/errors?days=${encodeURIComponent($('errDays').value)}`);
      // آخرین درایه‌ی daily همیشه امروز است (حلقه‌ی سرور از قدیم به جدید پر می‌کند)
      errBadge(d.daily.length ? d.daily[d.daily.length - 1].http5xx : 0);

      // «مشتری خطا دید» اول می‌آید چون تنها عددی است که به فروش وصل است:
      // خیلی از خطاها لاگ می‌شوند ولی کاربر جوابِ درست گرفته (مثل شکستِ
      // پیامکِ اطلاع‌رسانی). آن‌ها مهم‌اند ولی فوری نیستند.
      $('errKpis').innerHTML = [
        kpi({ label: 'مشتری خطا دید', num: money(d.totals.http5xx), unit: 'بار', icon: 'i-alert',
          tone: d.totals.http5xx ? 'coral' : '',
          sub: d.totals.http5xx ? 'پاسخِ ۵xx — این‌ها را جدی بگیر' : 'هیچ مشتری‌ای صفحه‌ی خطا ندید' }),
        kpi({ label: 'خطاهای ثبت‌شده', num: money(d.totals.errors), unit: 'مورد', icon: 'i-history',
          sub: `${money(d.totals.groups)} نوعِ متفاوت` }),
        kpi({ label: 'امروز', num: money(d.totals.today), unit: 'خطا', icon: 'i-chart',
          tone: d.totals.today ? 'gold' : '', sub: d.since ? `از ${faDate(d.since + 'T00:00:00')}` : '' }),
      ].join('');

      if (d.unavailable) {
        $('errHost').innerHTML = `<div class="alert alert-info"><svg><use href="#i-alert"/></svg>
          <span>پوشه‌ی لاگ خوانده نشد: ${esc(d.unavailable)}</span></div>`;
        return;
      }
      if (!d.groups.length) {
        $('errHost').innerHTML = emptyBox('i-check', 'هیچ خطایی ثبت نشده — همه چیز سالم است');
        return;
      }

      // جزئیاتِ فنی داخل <details> بسته می‌ماند: صاحبِ مغازه لازم نیست ببیندش،
      // ولی وقتی می‌خواهد بفرستد برای بررسی، همان چند خط لازم است.
      $('errHost').innerHTML = d.groups.map((g, i) => `
        <details class="ad-err" ${i === 0 && g.count > 1 ? 'open' : ''}>
          <summary>
            <span class="ad-err-count${g.count > 4 ? ' hot' : ''}">${money(g.count)}×</span>
            <span class="grow">
              <b><bdo dir="ltr">${esc(g.title)}</bdo></b>
              ${g.reason ? `<small><bdo dir="ltr">${esc(g.reason)}</bdo></small>` : ''}
            </span>
            <time title="${esc(faFull(g.last))}">${esc(ago(g.last))}</time>
          </summary>
          <div class="ad-err-body">
            <p>اولین بار ${esc(faFull(g.first))} · آخرین بار ${esc(faFull(g.last))}</p>
            ${g.stack.length
              ? `<pre dir="ltr">${g.stack.map(s => esc(s)).join('\n')}</pre>`
              : '<p>جزئیاتِ فنی برای این خطا ثبت نشده.</p>'}
          </div>
        </details>`).join('');
    } catch (e) {
      $('errHost').innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${esc(e.message)}</span></div>`;
      $('errKpis').innerHTML = '';
    }
  }
  $('errDays').addEventListener('change', loadErrors);
  $('errReload').addEventListener('click', loadErrors);

  const LOADERS = {
    dash: loadDash,
    orders: loadOrders,
    stock: () => { loadStock(); loadCats(); },
    people: loadPeople, crm: loadCrm, reviews: loadReviews, coupons: loadCoupons,
    wholesale: loadWholesale,
    report: () => { loadReport(); loadMonthly(); },
    config: loadConfig, log: loadLog, errors: loadErrors
  };

  // ---------- سرکشی خودکار: سفارش/مرجوعی/نظرِ تازه بدون رفرش دستی ----------
  let LAST_POLL = null;
  async function pollFresh() {
    if (document.hidden) return; // تب پس‌زمینه است؛ بی‌خودی سرور را اذیت نکن
    let s;
    try { ({ stats: s } = await PG.api('/admin/stats')); } catch (e) { return; }
    $('navOrders').textContent = money(s.awaiting_shipment);
    $('navOrders').classList.toggle('urgent', s.awaiting_shipment > 0);
    $('navReviews').textContent = money(s.pending_reviews || 0);
    $('navReviews').classList.toggle('urgent', (s.pending_reviews || 0) > 0);
    if (LAST_POLL) {
      if (s.awaiting_shipment > LAST_POLL.awaiting_shipment) {
        PG.toast('سفارش جدید رسید!', 'success');
        if (LOADED.has('orders')) loadOrders();
        if (LOADED.has('dash')) loadDash();
      }
      if ((s.return_requests || 0) > (LAST_POLL.return_requests || 0)) {
        PG.toast('درخواست مرجوعی تازه دارید', 'info');
        if (LOADED.has('orders')) loadOrders();
      }
      if ((s.pending_reviews || 0) > (LAST_POLL.pending_reviews || 0)) {
        PG.toast('نظر تازه در انتظار تأیید است', 'info');
        if (LOADED.has('reviews')) loadReviews();
      }
    }
    LAST_POLL = s;
  }
  setInterval(pollFresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollFresh(); });

  $('btnRefreshAll').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      await Promise.all([...LOADED].map(v => LOADERS[v]?.()));
      PG.toast('همه‌چیز تازه شد', 'success');
    } finally { b.disabled = false; }
  });

  // تنظیمات را همان اول می‌گیریم چون فاکتور چاپی به آن نیاز دارد
  try { ({ settings: SETTINGS } = await PG.api('/admin/settings')); } catch (e) { /* بی‌خیال */ }

  LOADED.add('dash');
  await loadDash();

  /* نشانِ خطا را همان اول پر می‌کنیم، وگرنه تا وقتی کسی سرِ آن بخش نرود «—»
     می‌ماند و کلِ فایده‌ی نشان — دیدنِ خطا بی‌رفتن به آن صفحه — از دست می‌رود.
     فقط `days=1` می‌خواهیم، پس ارزان‌ترین حالتِ این درخواست است. عمداً هر
     دقیقه مثل pollFresh تکرار نمی‌شود: پاسخ از خواندنِ فایلِ لاگ می‌آید و
     تازگیِ ثانیه‌ای‌اش این هزینه را ندارد. */
  if (me.isAdmin) {
    PG.api('/admin/errors?days=1')
      .then(d => errBadge(d.totals.http5xx))
      .catch(() => { const el = $('navErrors'); if (el) el.textContent = '—'; });
  }

  // اگر آدرس هش داشت، همان بخش را باز کن؛ کارمند همیشه از سفارش‌ها شروع می‌کند
  const startView = (!me.isAdmin && me.isStaff) ? 'orders' : (location.hash.slice(1) || 'dash');
  if (startView && startView !== 'dash') show(startView);
});
