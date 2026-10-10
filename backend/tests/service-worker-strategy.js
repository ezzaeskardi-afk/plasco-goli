#!/usr/bin/env node
// tests/service-worker-strategy.js — نگهبانِ «صفحه‌ی برگشته‌ها هرگز کهنه نباشد»
//
// ---------- چرا این آزمون وجود دارد ----------
// سرویس‌ورکر تنها کدی است که *بین* کاربر و سرور می‌نشیند و می‌تواند بدون هیچ
// خطای سروری، نسخه‌ی کهنه‌ی یک صفحه را به مشتری نشان دهد. تا امروز کسی این
// تصمیم را نمی‌سنجید: نه آزمونِ ایستا (که فقط وجودِ فایلِ precache را می‌بیند)
// و نه آزمونِ دود (که هیچ مرورگری ندارد). یک `caches.match` که جای اشتباهی
// بیفتد، یعنی مشتری هفته‌ها قیمتِ قدیمی می‌بیند و هیچ‌چیز قرمز نمی‌شود.
//
// قراردادی که این‌جا قفل می‌شود (سه بخش، به همان ترتیبی که در `sw.js` است):
//   ۱) ناوبری همیشه از شبکه: `fetch(req, { cache: 'no-cache' })`. یعنی حتی اگر
//      کشی پر از نسخه‌ی کهنه باشد، پاسخِ کاربر از شبکه می‌آید.
//   ۲) تازه‌سازیِ پس‌زمینه: همان HTMLِ سالم در کشِ صفحه‌ها کپی می‌شود تا کپی
//      هیچ‌وقت از یک ناوبری کهنه‌تر نباشد.
//   ۳) پشتیبانِ آفلاین فقط وقتی شبکه *رد* شود: صفحه‌ی خودش → offline.html →
//      پیامِ ساده. خطای سرور (۵۰۰) دست‌نخورده به کاربر می‌رسد.
//
// ---------- چرا **اجرا** و نه الگو ----------
// «`cache: 'no-cache'` در فایل هست» چیزِ کمی را ثابت می‌کند. یک `caches.match`
// که بالاتر از `fetch` بنشیند هم آن الگو را راضی می‌کند، ولی رفتار را خراب
// می‌کند. پس خودِ متنِ سورس در یک جعبه‌ی شبیه‌سازی‌شده **اجرا** می‌شود: `self`
// و `caches` و `fetch` جعلی‌اند، و سه سؤال پرسیده می‌شود که فقط رفتار جوابشان
// را می‌دهد:
//   • کش پر از نسخه‌ی کهنه + شبکه‌ی سالم → کاربر چه می‌بیند؟ (باید تازه)
//   • شبکه قطع + کپیِ همان صفحه → چه می‌بیند؟ (باید همان صفحه)
//   • شبکه قطع + هیچ کپی‌ای → چه می‌بیند؟ (باید صفحه‌ی آفلاین)
//
// ---------- یک کپی، و یک نگهبان برای نبودِ کپیِ دوم ----------
// تا دیروز این سرویس‌ورکر دو جا می‌نشست (`frontend/sw.js` و
// `next-frontend/public/sw.js`) و آزمون بایت‌به‌بایت یکی‌بودنشان را می‌سنجید.
// با بازنشستگیِ فروشگاهِ Express کپیِ اول حذف شد؛ تنها کپیِ زنده همان
// `next-frontend/public/sw.js` است و همینجا اجرا و سنجیده می‌شود.
// برگشتِ کپیِ دوم یک تله‌ی واقعی است — دو سرویس‌ورکر با دو رفتار یعنی
// کاربرها بسته به این‌که کدام را گرفته‌اند چیزهای متفاوتی می‌بینند — پس
// همان چیزی که قبلاً «یکی بودن» را می‌سنجید، حالا «نبودن» را می‌سنجد.
//
// اجرا: node tests/service-worker-strategy.js

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const REPO = path.join(BACKEND, '..');

const SW_FILE = path.join(REPO, 'next-frontend', 'public', 'sw.js');
const RETIRED_COPY = path.join(REPO, 'frontend', 'sw.js');

let pass = 0, fail = 0;
function ok(label) { pass++; console.log(`  [PASS] ${label}`); }
function bad(label, detail) { fail++; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
function check(label, condition, detail = '') {
  if (condition) ok(label); else bad(label, detail);
}

console.log('\n=== Service worker strategy guard (fresh pages + background refresh) ===\n');

// ---------- ۰) تک‌کپیِ زنده باید باشد، کپیِ بازنشسته نباید برگردد ----------
if (!fs.existsSync(SW_FILE)) {
  console.error(`  [FAIL] next-frontend/public/sw.js وجود ندارد — ${SW_FILE}`);
  console.error('  ⚠ سرویس‌ورکر پیدا نشد — نمی‌شود چیزی نسنجید.');
  process.exit(1);
}

check('کپیِ دومِ سرویس‌ورکر (frontend/sw.js) برنگشته است (دو کپی = دو رفتار)',
  !fs.existsSync(RETIRED_COPY),
  fs.existsSync(RETIRED_COPY) ? RETIRED_COPY : 'تک‌کپی');

const SRC = fs.readFileSync(SW_FILE, 'utf8');

// ---------- ۱) جعبه‌ی شبیه‌سازی ----------
const ORIGIN = 'http://127.0.0.1:3000';
const PAGE_URL = `${ORIGIN}/products.html`;
const OFFLINE_URL = `${ORIGIN}/offline.html`;

const htmlResponse = (body, status = 200, type = 'text/html; charset=utf-8') =>
  new Response(body, { status, headers: { 'Content-Type': type } });

// یک نمونه‌ی تازه از سرویس‌ورکر، با شبکه و کشِ قابلِ کنترل
function boot(src = SRC) {
  const listeners = {};
  const stores = new Map();          // نامِ کش → Map(url → Response)
  const puts = [];                   // ترتیبِ نوشتن‌ها
  const fetches = [];                // {url, init}
  const net = { down: false, body: '<html>تازه</html>', status: 200, type: 'text/html; charset=utf-8' };

  const bucket = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  // کلیدها مثلِ مرورگر حل می‌شوند: `caches.match('/offline.html')` در سرویس‌ورکر
  // به آدرسِ کامل نسبت به مبدأ می‌رسد، نه به رشته‌ی نسبی. اگر این‌جا حل نشود،
  // سناریوی آفلاین بی‌دلیل قرمز می‌شود (خودِ آزمون یک‌بار همین را گرفت).
  const keyOf = (k) => {
    const u = typeof k === 'string' ? k : k.url;
    return u.startsWith('/') ? new URL(u, ORIGIN).href : u;
  };

  const cachesApi = {
    open: async (name) => ({
      put: async (k, res) => { bucket(name).set(keyOf(k), res); puts.push(`${name} ← ${keyOf(k)}`); },
      match: async (k) => bucket(name).get(keyOf(k)) || undefined,
    }),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (k) => {
      const u = keyOf(k);
      for (const m of stores.values()) if (m.has(u)) return m.get(u);
      return undefined;
    },
  };

  const fakeFetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    fetches.push({ url, init });
    if (net.down) throw new TypeError('Failed to fetch');
    return htmlResponse(net.body, net.status, net.type);
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t, h) => { (listeners[t] ||= []).push(h); },
    skipWaiting() {},
    clients: { claim() {} },
  };

  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'Response', 'URL', 'console', src)(
    self, cachesApi, fakeFetch, Response, URL, console,
  );

  const navigate = async (url = PAGE_URL, mode = 'navigate') => {
    const evt = { request: { method: 'GET', url, mode }, response: null, respondWith(p) { this.response = p; return p; } };
    for (const h of listeners.fetch || []) h(evt);
    return { handled: Boolean(evt.response), response: evt.response ? await evt.response : null };
  };

  return { listeners, stores, puts, fetches, net, navigate, cachesApi, bucket };
}

const bodyOf = async (res) => (res ? await res.text() : null);

(async () => {
  /* ================= ۱) کاربرِ برگشته: کشِ کهنه، شبکه‌ی سالم ================= */
  console.log('-- ۱) ناوبری با کشِ پر از نسخه‌ی کهنه (تنها چیزی که کاربر می‌بیند) --');

  const s1 = boot();
  s1.bucket('pg-pages-v9').set(PAGE_URL, htmlResponse('<html>کهنه</html>'));
  const r1 = await s1.navigate();
  const b1 = await bodyOf(r1.response);
  check('ناوبری گرفته می‌شود (respondWith صدا زده می‌شود)', r1.handled);
  check('کاربر نسخه‌ی *تازه* را می‌بیند، نه کپیِ کهنه‌ی کش',
    b1 === '<html>تازه</html>', `بدنه: ${b1}`);
  check('درخواستِ شبکه با `cache: \'no-cache\'` می‌رود (همیشه از سرور می‌پرسد)',
    s1.fetches.length === 1 && s1.fetches[0].init?.cache === 'no-cache',
    JSON.stringify(s1.fetches[0]?.init));

  /* ================= ۲) تازه‌سازیِ پس‌زمینه ================= */
  console.log('\n-- ۲) کپیِ پس‌زمینه (تا کپی از یک ناوبری کهنه‌تر نباشد) --');
  await new Promise((r) => setTimeout(r, 0)); // put در پس‌زمینه و بی‌await است
  const stored = s1.bucket('pg-pages-v9').get(PAGE_URL);
  const storedBody = stored ? await stored.text() : null;
  check('HTMLِ سالمِ همان ناوبری در کشِ صفحه‌ها نوشته می‌شود', storedBody === '<html>تازه</html>',
    `در کش: ${storedBody}`);
  check('کپی در کشِ درست می‌نشیند (نه کشِ دارایی‌ها)',
    s1.puts.some((p) => p.startsWith('pg-pages-v9')) &&
    !s1.puts.some((p) => p.startsWith('pg-static-')),
    s1.puts.join(' | '));

  const s2 = boot();
  s2.net.status = 500;
  const r2 = await s2.navigate();
  await new Promise((r) => setTimeout(r, 0));
  check('پاسخِ ۵xx به کاربر می‌رسد (پیامِ دروغِ «آفلاین هستید» جایش را نمی‌گیرد)',
    r2.response?.status === 500, `کد: ${r2.response?.status}`);
  check('پاسخِ خطا هرگز در کش نوشته نمی‌شود', s2.puts.length === 0, s2.puts.join(' | '));

  const s3 = boot();
  s3.net.type = 'application/json';
  await s3.navigate();
  await new Promise((r) => setTimeout(r, 0));
  check('پاسخِ غیرِHTML (API) کش نمی‌شود', s3.puts.length === 0, s3.puts.join(' | '));

  /* ================= ۳) آفلاین: صفحه‌ی خودش، بعد صفحه‌ی آفلاین ================= */
  console.log('\n-- ۳) فقط وقتی شبکه نیست: پشتیبانِ آفلاین به ترتیب --');

  const s4 = boot();
  s4.net.down = true;
  s4.bucket('pg-pages-v9').set(PAGE_URL, htmlResponse('<html>کپیِ دیروز</html>'));
  s4.bucket('pg-static-v9').set(OFFLINE_URL, htmlResponse('<html>آفلاین</html>'));
  const r4 = await s4.navigate();
  const b4 = await bodyOf(r4.response); // هر بدنه فقط یک‌بار خواندنی است
  check('آفلاین با کپیِ همان صفحه → همان صفحه دیده می‌شود (نه پیامِ عمومی)',
    b4 === '<html>کپیِ دیروز</html>', `بدنه: ${b4}`);

  const s5 = boot();
  s5.net.down = true;
  s5.bucket('pg-static-v9').set(OFFLINE_URL, htmlResponse('<html>آفلاین</html>'));
  const r5 = await s5.navigate();
  const b5 = await bodyOf(r5.response);
  check('آفلاین بدونِ کپیِ آن صفحه → صفحه‌ی آفلاین می‌آید',
    b5 === '<html>آفلاین</html>', `بدنه: ${b5}`);

  const s6 = boot();
  s6.net.down = true;
  const r6 = await s6.navigate();
  check('آفلاین بدونِ هیچ کپی‌ای → پیامِ ۵۰۳ (نه استک‌تریس، نه صفحه‌ی سفید)',
    r6.response?.status === 503, `کد: ${r6.response?.status}`);

  /* ================= ۴) بقیه‌ی درخواست‌ها دست نمی‌خورند ================= */
  console.log('\n-- ۴) دامنه‌ی دخالت: فقط همین دو چیز --');
  const s7 = boot();
  const other = await s7.navigate(`${ORIGIN}/js/main.js`, 'no-cors');
  check('دارایی‌های غیرِفونت/آیکون گرفته نمی‌شوند (رفتارِ عادی مرورگر)',
    !other.handled && s7.fetches.length === 0);
  const foreign = await s7.navigate('https://example.com/', 'navigate');
  check('دامنه‌ی غریبه دست‌نخورده می‌ماند',
    !foreign.handled && s7.fetches.length === 0);

  /* ================= ۵) چیزهایی که اجرا نشانشان نمی‌دهد ================= */
  console.log('\n-- ۵) ساختار: نسخه‌ها، نصب، و precache --');

  const vStatic = Number((SRC.match(/const CACHE = 'pg-static-v(\d+)'/) || [])[1] || 0);
  const vPages = Number((SRC.match(/const PAGE_CACHE = 'pg-pages-v(\d+)'/) || [])[1] || 0);
  check('هر دو کش نسخه‌دارند و نسخه‌شان یکی است (وگرنه activate یکی را پاک می‌کند)',
    vStatic > 0 && vStatic === vPages, `static=v${vStatic} · pages=v${vPages}`);
  check('نسخه از کفِ آزمونِ دود عقب‌تر نیست (v9 = استراتژیِ تازه‌سازیِ پس‌زمینه)',
    vStatic >= 9, `v${vStatic}`);
  check('activate هر دو خانواده‌ی کش را نگه می‌دارد و بقیه را پاک می‌کند',
    /keys\.filter\(\(k\) => k !== CACHE && k !== PAGE_CACHE\)/.test(SRC));
  check('سرویس‌ورکرِ تازه همان بازدید فعال می‌شود (skipWaiting + clients.claim)',
    /self\.skipWaiting\(\)/.test(SRC) && /self\.clients\.claim\(\)/.test(SRC));
  check('صفحه‌ی آفلاین و فونت/آیکون‌ها هنوز precache می‌شوند',
    /OFFLINE_URL/.test(SRC) && /\/assets\/fonts\//.test(SRC) && /\/assets\/icons\.svg/.test(SRC));

  // خودِ جعبه‌ی شبیه‌سازی: اگر خراب باشد، هر سه سناریو «سبزِ خالی» می‌شوند.
  console.log('\n-- ۶) خودآزمون (نگهبانِ خراب باید قرمز شود) --');

  const CACHE_FIRST = SRC.replace(
    "  return fetch(req, { cache: 'no-cache' })",
    "  return caches.open(PAGE_CACHE).then((c) => c.match(req.url)).then((hit) => hit || fetch(req, { cache: 'no-cache' }))",
  );
  check('خودآزمون: الگویِ کش-اول در سورس پیدا می‌شود (وگرنه بازنویسی بی‌اثر است)',
    CACHE_FIRST !== SRC);
  const stale = boot(CACHE_FIRST);
  stale.bucket('pg-pages-v9').set(PAGE_URL, htmlResponse('<html>کهنه</html>'));
  const staleBody = await bodyOf((await stale.navigate()).response);
  check('خودآزمون: استراتژیِ کش-اول واقعاً نسخه‌ی کهنه را می‌دهد (ارزشِ سنجش تأیید می‌شود)',
    staleBody === '<html>کهنه</html>', `بدنه: ${staleBody}`);

  const NO_REFRESH = SRC.replace('      cachePageInBackground(req, res);\n', '');
  const noRef = boot(NO_REFRESH);
  await noRef.navigate();
  await new Promise((r) => setTimeout(r, 0));
  check('خودآزمون: بدونِ تازه‌سازیِ پس‌زمینه چیزی در کش نمی‌نشیند (پس آن بررسی معنا دارد)',
    NO_REFRESH !== SRC && noRef.puts.length === 0, noRef.puts.join(' | '));

  console.log('\n------------------------------------------------------------');
  console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
  console.log('------------------------------------------------------------\n');
  process.exit(fail === 0 ? 0 : 1);
})();
