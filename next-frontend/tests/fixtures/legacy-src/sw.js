// سرویس‌ورکر پلاسکو گلی — عمداً محافظه‌کار، ولی تازه.
//
// ---------- استراتژیِ HTML (ناوبری) ----------
// **همیشه از شبکه، با تازه‌سازیِ پس‌زمینه.** سه بخش دارد:
//
//   ۱) مسیرِ اصلی: `fetch(req, { cache: 'no-cache' })`. یعنی حتی اگر مرورگر یا
//      یک واسطه خیال کند این صفحه تازه است، سرویس‌ورکر باز از سرور می‌پرسد.
//      هزینه‌اش یک ۳۰۴ است و در عوض کاربرِ برگشته هیچ‌وقت نسخه‌ی کهنه‌ی صفحه
//      را نمی‌بیند. (مقدار `no-store` این کار را نمی‌کند؛ آن همیشه کلِ بدنه را
//      دوباره می‌کشد، در حالی که `no-cache` یعنی «اول بپرس».)
//
//   ۲) تازه‌سازیِ پس‌زمینه: همان صفحه‌ای که از شبکه آمد، در پس‌زمینه یک کپی
//      در کش می‌گیرد — بی‌آنکه پاسخِ کاربر معطل شود. پس عمرِ کهنگیِ آن کپی
//      دقیقاً یک ناوبری است: هر بار که کاربر صفحه را می‌بیند، کپی تازه می‌شود.
//
//   ۳) پشتیبانِ آفلاین (فقط وقتی fetch *رد* شود، یعنی شبکه اصلاً نیست):
//      کپیِ همان صفحه → `offline.html` → پیامِ ساده. خطای سرور (۵۰۰) اینجا
//      نمی‌آید، چون در آن حالت پاسخِ واقعیِ سرور باید دیده شود؛ پیامِ «آفلاین
//      هستید» آن‌جا دروغ است و کاربر را دنبالِ نخود سیاه می‌فرستد.
//
// ---------- چرا کش مسیرِ اصلی نیست ----------
// در یک فروشگاه، نشان‌دادن نسخه‌ی کهنه یعنی مشتری قیمت قدیمی یا کالای ناموجود
// را می‌بیند و سر همان زنگ می‌زند. پس کش فقط جایی به کار می‌آید که شبکه نباشد
// (آنجا هم دیدنِ صفحه‌ی خودش بهتر از یک پیامِ عمومی است) و مسیرِ اصلی همیشه
// تازه‌ترین چیزی است که سرور می‌دهد.
//
// ---------- دارایی‌های تغییرناپذیر ----------
// فونت و آیکون همان cache-first می‌مانند: آدرسشان با `?v=` عوض می‌شود، پس
// «کهنه‌شدن» برایشان معنا ندارد و خواندن از کش فقط سرعت است.
//
// نکته‌ی نگهبانی: این فایل **دو کپیِ یکسان** دارد (`frontend/sw.js` و
// `next-frontend/public/sw.js`) چون دو برنامه یک سرویس‌ورکر دارند. هر ویرایشی
// باید در هر دو بنشیند؛ `backend/tests/service-worker-strategy.js` یکسان‌بودن
// بایت‌به‌بایتشان را می‌سنجد وگرنه دو فروشگاه دو رفتارِ متفاوت به کاربر می‌دهند.
const CACHE = 'pg-static-v9';      // v9: استراتژیِ HTML عوض شد (تازه‌سازیِ پس‌زمینه)
const PAGE_CACHE = 'pg-pages-v9';  // نسخه‌اش باید همراهِ CACHE بالا برود

const OFFLINE_URL = '/offline.html';
const STATIC = [
  OFFLINE_URL,
  '/assets/fonts/Vazir-FD-WOL.woff2',
  '/assets/fonts/Vazir-Bold-FD-WOL.woff2',
  '/assets/icons.svg',
  '/assets/favicon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // هر فایل جدا: اگر یکی نبود، کلِ نصب شکست نخورد. addAll اتمی است و
      // یک ۴۰۴ کوچک باعث می‌شد هیچ‌چیز کش نشود — از جمله صفحه‌ی آفلاین.
      //
      // fetch با cache:'reload' عمدی است: اگر قبلاً همین آدرس را با
      // Cache-Control: immutable گرفته باشیم (مثل icons.svg در نسخه‌های قبل)،
      // c.add() همان ورودیِ کهنه‌ی HTTP cache را برمی‌گرداند و نسخه‌ی تازه
      // هرگز وارد کش نمی‌شود. reload یعنی همیشه از شبکه، تا نصب دقیقاً
      // محتوایِ روی دیسک را بگیرد.
      await Promise.all(STATIC.map((u) =>
        fetch(u, { cache: 'reload' })
          .then((res) => (res.ok ? c.put(u, res) : Promise.resolve()))
          .catch(() => {})
      ));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // هر دو خانواده‌ی کش نگه داشته می‌شوند: نسخه‌ی کهنه‌ی *هر دو* باید برود،
      // وگرنه کشِ صفحه‌ها با استراتژیِ قدیمی زنده می‌ماند.
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- صفحه: تازه از شبکه، پشتیبان از کش ----------
// جدا نوشته شده تا مسیرِ اصلی یک نگاه خوانده شود — و نگهبان بتواند همین
// تابع را با شبکه‌ی جعلی *اجرا* کند، نه اینکه فقط الگو بگیرد.
function freshPage(req) {
  return fetch(req, { cache: 'no-cache' })
    .then((res) => {
      cachePageInBackground(req, res);
      return res;
    })
    .catch(() =>
      caches.open(PAGE_CACHE)
        .then((c) => c.match(req.url))
        .then((own) => own || caches.match(OFFLINE_URL))
        .then((hit) => hit || new Response('اینترنت قطع است.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }))
    );
}

// تازه‌سازیِ پس‌زمینه — کپیِ صفحه کنار می‌رود، بدونِ معطل‌کردنِ کاربر.
function cachePageInBackground(req, res) {
  // فقط یک HTMLِ کاملِ سالم: پاسخِ API، ریدایرکت، ۲۰۴ و ۵xx هرگز. وگرنه
  // دفعه‌ی بعد یک صفحه‌ی نیمه‌کاره یا پاسخِ غلط تحویلِ کاربر می‌شود.
  if (!res || res.status !== 200) return;
  if (!(res.headers.get('content-type') || '').includes('text/html')) return;
  const copy = res.clone();
  // کلید همان URL است، نه خودِ درخواست: درخواستِ ناوبری را بعضی مرورگرها در
  // `put` نمی‌پذیرند و آن‌وقت کپی بی‌صدا ذخیره نمی‌شد.
  caches.open(PAGE_CACHE)
    .then((c) => c.put(req.url, copy))
    .catch(() => {}); // حالتِ خصوصی/پرِ حافظه: بی‌خیال
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // دامنه‌ی غریبه: دست نمی‌زنیم

  // ---- ناوبری (باز کردن یک صفحه) ----
  if (req.mode === 'navigate') {
    e.respondWith(freshPage(req));
    return;
  }

  // ---- دارایی‌های تغییرناپذیر ----
  const cacheable =
    url.pathname.startsWith('/assets/fonts/') ||
    url.pathname === '/assets/icons.svg' ||
    url.pathname === '/assets/favicon.svg';
  if (!cacheable) return; // بقیه: رفتار عادی مرورگر (شبکه)

  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        // فقط پاسخ کاملِ سالم کش می‌شود. پاسخ ۲۰۶ (تکه‌ای) یا خطا اگر کش شود،
        // دفعه‌ی بعد یک فونت نیمه‌کاره تحویل کاربر می‌رود و متن خراب می‌شود.
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});
