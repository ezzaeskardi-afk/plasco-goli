// سرویس‌ورکر پلاسکو گلی — عمداً محافظه‌کار.
//
// اصل کار: هیچ صفحه، قیمت یا پاسخ APIای کش نمی‌شود. فقط دو چیز کش می‌شوند:
//   ۱) دارایی‌های تغییرناپذیر (فونت و آیکون) — سرعت بارگذاری دوباره
//   ۲) صفحه‌ی offline.html — تا وقتی اینترنت قطع است، به‌جای صفحه‌ی خشکِ
//      «Site can't be reached» مرورگر، یک صفحه‌ی فارسیِ خودمان دیده شود
//
// چرا صفحه‌ها کش نمی‌شوند: در یک فروشگاه، نشان‌دادن نسخه‌ی کهنه یعنی مشتری
// قیمت قدیمی یا کالای ناموجود را می‌بیند و سر همان زنگ می‌زند. سرعت به این
// قیمت نمی‌ارزد.
const CACHE = 'pg-static-v7';   // v7: نصبِ SW با cache:'reload' از HTTP cache کهنه عبور می‌کند

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // دامنه‌ی غریبه: دست نمی‌زنیم

  // ---- ناوبری (باز کردن یک صفحه) ----
  // همیشه از شبکه. فقط اگر شبکه *اصلاً* نبود، صفحه‌ی آفلاین.
  // نکته: خطای شبکه با خطای سرور فرق دارد؛ اگر سرور ۵۰۰ داد باید همان صفحه‌ی
  // ۵۰۰ خودمان دیده شود، نه پیام «آفلاین هستید» که دروغ است و کاربر را
  // دنبال نخود سیاه می‌فرستد. پس فقط در catch (یعنی رد شدن fetch) جواب می‌دهیم.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((hit) =>
          hit || new Response('اینترنت قطع است.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          })
        )
      )
    );
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
