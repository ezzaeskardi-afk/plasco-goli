# پلاسکو گلی — فروشگاه آنلاین

[![Security scan](https://github.com/ezzaeskardi-afk/plasco-goli/actions/workflows/security.yml/badge.svg)](https://github.com/ezzaeskardi-afk/plasco-goli/actions/workflows/security.yml)
[![CI](https://github.com/ezzaeskardi-afk/plasco-goli/actions/workflows/ci.yml/badge.svg)](https://github.com/ezzaeskardi-afk/plasco-goli/actions/workflows/ci.yml)
![OWASP](https://img.shields.io/badge/OWASP%20Top%2010-47%20checks-blue)
![node](https://img.shields.io/badge/node-%3E%3D22.5-339933)
![deps](https://img.shields.io/badge/runtime%20deps-3-lightgrey)
![license](https://img.shields.io/badge/license-proprietary-red)

فروشگاه فارسی محصولات پلاستیکی با Next.js (App Router) و backend مبتنی بر Node.js و Express. مشتری محصول را به سبد اضافه می‌کند، با شماره موبایل وارد می‌شود، آدرس تحویل می‌دهد، سفارش ثبت می‌کند و وضعیت سفارش را از حساب کاربری یا صفحه‌ی پیگیری می‌بیند.

> وضعیت فعلی: **۹۶۳ تست خودکار، همه سبز** — ۷۲۲ دود + ۸۶ سئو + ۴۷ OWASP + ۴۵ امنیت + ۳۷ تخفیف + ۱۸ یکپارچگیِ گزارشِ بنچمارک + ۸ رفتارِ فرانت‌اند (به‌علاوه‌ی نگهبانِ مرزِ راز که شمارش‌پذیر نیست). فرانت‌اند Next.js برابری کامل با Express برای فروشگاه مشتری دارد و صفحه‌ی نتیجه‌ی سفارش خودش وضعیت پرداخت را پیگیری می‌کند. پنل ادمین **۹ نما از ۱۳** را در Next.js دارد؛ ۴ نمای باقی‌مانده (عمده‌فروشی، گزارش‌ها، رویدادها، خطاها) هنوز در Express کار می‌کنند.

## وضعیت فنی فعلی

- Node.js `>=22.5`، Express و SQLite داخلی Node — **فقط ۳ وابستگیِ اجرا** (`express`، `express-session`، `dotenv`)
- **Next.js 15.5** با App Router، React 19، TanStack Query 5، Tailwind v4 — آزمونِ فرانت‌اند با Vitest 5 + jsdom
- **۱۵۵ تابع** در `db.js` (۲,۹۷۵ خط) — ۲۵ فایل کتابخانه + ۹ مسیر API + ۷ ابزار مدیریتی
- پنل ادمین: **۹ نما از ۱۳** منتقل شده — یک‌منبعِ حقیقت در `next-frontend/src/lib/adminSections.ts`
- تست: دود **۷۲۲** | سئو **۸۶** | OWASP **۴۷** | امنیت **۴۵** | تخفیف **۳۷** | یکپارچگیِ بنچمارک **۱۸** | فرانت‌اند (Vitest) **۸** = **۹۶۳**
- بنچمارک: **۱۰,۰۰۰ کاربر همزمان — ۱۰۰٪ موفق، صفر خطا**
- شاخهٔ اصلی: `main` (تنها شاخه — بدون شاخه‌ی جانبی)

## Quick start

نیازمندی: Node.js نسخه‌ی ۲۲.۵ یا بالاتر.

```bash
# اجرای سریع (Windows):
StartSite.bat

# یا دستی:
cd backend
npm install
copy .env.example .env   # Windows
# یا: cp .env.example .env
npm start
```

سایت روی `http://localhost:3000` اجرا می‌شود. فرانت‌اند Next.js روی `http://localhost:3001` اجرا می‌شود.

## قابلیت‌های کلیدی

### فروشگاه مشتری (Next.js — برابری کامل با Express)
- صفحه اصلی با محصولات پرفروش، جستجوی زنده، و نوار اطلاعیه
- فهرست محصولات با فیلتر دسته/قیمت/موجودی، مرتب‌سازی و صفحه‌بندی
- صفحه محصول با گالری چندعکسه (lightbox)، مشخصات، نظرات و محصولات مرتبط
- سبد خرید با تخفیف و هزینه ارسال (قابلیت بازگرداندن آیتم حذف‌شده)
- ورود با کد پیامکی (OTP) — ۵ باکس واقعی تکرقمی با cooldown پایدار و مدیریت 429
- پرداخت از طریق زرین‌پال — و اگر اینترنتِ مشتری وسطِ درگاه قطع شود، صفحه‌ی نتیجه خودش تا ۳۴ دقیقه وضعیت را پیگیری می‌کند
- حساب کاربری با آدرس‌ها، سفارش‌ها و علاقه‌مندی‌ها (۳ تب، با قابلیت لغو سفارش، مرجوعی، فاکتور چاپی)
- پیگیری سفارش بدون ورود (شماره سفارش + موبایل)
- علاقه‌مندی‌ها (heart button، صفحه جداگانه، افزودن به سبد)
- نمایش محصولات اخیراً مشاهده‌شده
- کد تخفیف قابل کپی در بنر پرومو
- جستجوی زنده با پیشنهادات (debounced) و ناوبری با کیبورد

### پنل مدیریت
در دوره‌ی گذار، پنل روی دو فرانت‌اند تقسیم شده و **هر دو زنده‌اند**. `✅` یعنی همین حالا در Next.js، `◻` یعنی هنوز در Express (`frontend/admin.html`).

- ✅ **داشبورد** — فروش، سفارش‌های باز، هشدارها و رویدادهای اخیر
- ✅ **سفارش‌ها** — تغییر وضعیت، کد رهگیری، یادداشت، لغو و مرجوعی
- ✅ **انبار و کالا** — ویرایش سریع قیمت/موجودی، محصول جدید، آپلود عکس، انتشار و برداشتنِ کالا
- ✅ **مشتری‌ها** — آمار خرید، جستجو، صفحه‌بندی و نقش کارمند
- ✅ **CRM مشتریان** — امتیازدهی RFM، سگمنت‌های هوشمند (VIP/پرخطر/بازگشتی)، تایم‌لاین فعالیت، یادداشت و پیگیری (با فیلتر تگ، حذف یادداشت/تسک)
- ✅ **نظرات** — تأیید یا رد دیدگاه خریداران
- ✅ **تخفیف‌ها** — کد تخفیف درصدی یا ثابت با سقف و تاریخ انقضا
- ✅ **تنظیمات** — هزینه ارسال، بنر جشنواره، تعطیلی موقت فروشگاه
- ✅ **وضعیت سیستم** — متریک سرور، سلامت دیتابیس با بررسیِ عمیقِ درخواستی، فهرستِ بکاپ‌ها با دکمه‌ی «بکاپ فوری»، نمودار خطای ۷ روزِ اخیر و رویدادهای پنل
- ◻ **عمده‌فروشی** — درخواست خرید B2B با قیمت پلکانی
- ◻ **گزارش‌ها** — نمودار فروش، محصولات برتر، سهم دسته‌بندی‌ها
- ◻ **رویدادها** — تایم‌لاین کاملِ کارهای انجام‌شده
- ◻ **خطاها** — لاگ خطاهای سرور

> منبعِ حقیقتِ این وضعیت `next-frontend/src/lib/adminSections.ts` است و نوارِ ناوبری و پانویسِ پوسته **هر دو** از همان ساخته می‌شوند، پس امکانِ واگرا شدن ندارند. ترتیبِ نوار عیناً همان نسخه‌ی Express است تا مدیر مجبور نشود جای بخش‌ها را از نو یاد بگیرد. آن چهار نما همان‌هایی هستند که `href`شان هنوز `null` است؛ اگر کسی آدرسشان را دستی در Next بزند به ۴۰۴ می‌رسد، نه به یک صفحه‌ی نیمه‌کاره. مجوزِ واقعیِ ادمین سمتِ Express اعمال می‌شود و `middleware.ts` در Next فقط «واردشده بودن» را چک می‌کند.

### سئو
- متاهای og/twitter و canonical **سمت سرور** تزریق می‌شوند
- JSON-LD: Store + WebSite + FAQPage + **ItemList محصولات پرفروش** (سرور-ساید)
- محصولات: Product + Offer + AggregateRating + BreadcrumbList
- sitemap.xml داینامیک با lastmod واقعی
- robots.txt داینامیک
- صفحه محصول حذف‌شده: در Express کد **۴۱۰** واقعی می‌گیرد (نه soft-404). در Next این مسیر SSG است و کد همان **۲۰۰** می‌ماند، پس به‌جایش `robots: noindex` برمی‌گردد — تفاوتی عمدی که در `product/[id]/not-found.tsx` دلیلش نوشته شده
- **تست خودکار سئو (۸۶ تست)**: canonical، og:image، robots، JSON-LD، meta description، title، img alt، favicon

### امنیت
- CSP کامل (بدون `unsafe-inline`) + گزارش‌گیری
- HSTS روی HTTPS
- CSRF دو لایه (sameSite cookie + بررسی Origin)
- Rate-limit چندلایه (سراسری + نوشتن + اختصاصی)
- قفل حساب بعد از رمز غلط پیاپی
- ماسک‌کردن شماره موبایل در لاگ
- Gitleaks برای جلوگیری از لو رفتن secretها
- **اسکن خودکار OWASP Top 10 (۴۷ تست)** روی ۱۰ دستهٔ آسیب‌پذیری
- **تست امنیت آپلود، CSRF، rate-limit (۴۵ تست)**
- **security.txt** برای responsible disclosure (RFC 9116)
- **HTTPS-GUIDE.md** — راهنمای کامل فعال‌سازی SSL و تنظیمات امنیتی production

### عملکرد
- **Cluster Mode**: استفاده از تمام هسته‌های CPU (روی لینوکس)
- **کش درون‌حافظه**: TTL ۲-۱۰ ثانیه برای queryهای پرتکرار
- **Rate-limit SQLite**: مشترک بین cluster workers
- **کش مرورگر**: CSS/JS immutable یک‌ماهه، HTML no-cache — در Next هدرِ `immutable` روی `/_next/static` فقط در production می‌آید، چون سرورِ dev چانک‌ها را **بدونِ هش** سرو می‌کند و کشِ یک‌ساله یعنی ویرایش‌های تو دیده نمی‌شوند
- **فشرده‌سازی**: gzip/brotli برای CSS/JS/SVG
- **WebP خودکار**: تحویل نسخه سبک‌تر اگر مرورگر بپذیرد
- **SQLite WAL**: خواندن و نوشتن هم‌زمان

## مجموعه تست‌ها

شش مجموعه‌ی شمارش‌پذیرِ بک‌اند + یک مجموعه‌ی فرانت‌اند + یک نگهبان. مجموعه‌های
بک‌اند عمداً جدا مانده‌اند، چون هر کدام سرور را با سقف‌های نرخِ متفاوتی بالا
می‌آورد (تستِ دود سقف را باز می‌خواهد، تستِ امنیت و OWASP بسته) و قاطی‌کردنشان در
یک پروسه یعنی یکی سهمیه‌ی دیگری را می‌سوزاند.

```bash
cd backend

npm test                              # ۷۲۲ تست دود (test-smoke.js)
node test-seo.js                      # ۸۶ تست سئو
node tests/owasp-scan.js              # ۴۷ تست OWASP Top 10
node tests/security.js                # ۴۵ تست امنیت (آپلود، CSRF، جعل IP، rate-limit)
node tests/discount.js                # ۳۷ تست کد تخفیف و قیمت قبلی
node tests/bench-report-integrity.js  # ۱۸ تست یکپارچگیِ گزارشِ بنچمارک
npm run test:secrets                  # نگهبانِ مرزِ راز (بی‌شمارش — یا سبز است یا throw)
```

مجموعه‌ی فرانت‌اند (Vitest + jsdom) — بدونِ سرور و بدونِ دیتابیس:

```bash
cd next-frontend
npm test           # ۸ تست رفتارِ حلقه‌ی پیگیریِ نتیجه‌ی پرداخت
npm run test:watch # حالتِ watch
```

> این هشت آزمون تنها چیزی در پروژه‌اند که رفتارِ **زمان‌محور** را می‌سنجند: ریتمِ
> ۱۵/۶۰ ثانیه‌ای و سقفِ ۴۰ بررسیِ صفحه‌ی نتیجه‌ی سفارش. نه typecheck می‌فهمد اگر آن
> اعداد عوض شوند و نه lint — و شکستنِ این حلقه یعنی مشتریِ پول‌داده تا ابد منتظر
> مانده یا سرور بی‌دلیل درخواست می‌گیرد. با تایمرِ جعلی همان اعدادِ production
> سنجیده می‌شوند، پس پنجره‌ی ۳۴ دقیقه‌ای در چند میلی‌ثانیه اجرا می‌شود و کدِ اصلی
> برای آزمون‌پذیر‌شدن حتی یک خط هم دست‌کاری نشده. هر مرزِ شبکه‌ای (`getOrder`،
> `getMe` و مسیریابِ Next) در خودِ آزمون جعل می‌شود.
>
> پوشش: بازیابیِ دیرهنگام (pending → paid)، شکستِ قطعی (canceled/failed)، پنجره‌ی
> صبر و توقفِ سرِ سقف، خطای گذرای شبکه، تبِ پنهان و بازگشتِ مشتری، و پاک‌سازیِ
> تایمر در unmount.

میان‌بُرهای npm:

```bash
npm run test:all     # دود + امنیت + تخفیف  (test-all.js)
npm run owasp        # همان tests/owasp-scan.js
npm run test:full    # هر شش مجموعه‌ی بک‌اند + نگهبانِ راز — ۹۵۵ تست، بی بنچمارک
npm run check        # test:all + سئو + بنچمارکِ ۲۰۰ کاربر  (بدونِ OWASP و راز)
```

> `npm run check` نامش قدیمی است و **همه‌ی** تست‌ها را اجرا نمی‌کند: بنچمارک دارد
> ولی OWASP و نگهبانِ راز را ندارد. برای پوششِ کامل `npm run test:full`، و اگر
> بنچمارک هم می‌خواهی هر دو را پشت سر هم.

هر شش مجموعه‌ی بک‌اند روی **کپیِ** دیتابیس اجرا می‌شوند (`tests/sandbox.js` در پوشه‌ی
موقتِ سیستم)، پس هیچ‌کدام به داده‌ی واقعیِ مغازه دست نمی‌زند. مجموعه‌ی فرانت‌اند
اصلاً به سرور وصل نمی‌شود.

## یکپارچگیِ پیوسته (CI)

`.github/workflows/ci.yml` روی هر push و هر pull request اجرا می‌شود و همان کاری را
می‌کند که خودت دستی می‌کنی:

- **بک‌اند** — هر شش مجموعه به‌عنوانِ یک stepِ جدا (تا شکست، نامِ مجموعه را بگوید نه
  یک لاگِ چندهزارخطی)، روی **Node ۲۲ و ۲۴** با `fail-fast: false`. ماتریس عمدی است:
  `engines` می‌گوید `>=22.5` ولی توسعه روی ۲۴ انجام می‌شود، و تفاوتِ نسخه‌ها دقیقاً
  چیزی است که دیر معلوم می‌شود.
- **فرانت‌اند** — `typecheck`، `lint`، `test` و در آخر `build` **با بک‌اندِ زنده**.

چرا بک‌اند در jobِ فرانت‌اند بالا می‌آید: `product/[id]/page.tsx` محصولات را در
زمانِ بیلد پیش‌رندر می‌کند و خطاهای API عمداً قورت داده می‌شوند — پس یک بیلدِ سبزِ
**توخالی** با صفر صفحه‌ی محصول ممکن است. بعد از بیلد تعدادِ HTMLهای محصول شمرده
می‌شود و اگر صفر باشد، اجرا قرمز می‌شود.

روی یک checkout تازه که `backend/data` ندارد، سرور تست دیتابیس را از صفر می‌سازد و
`lib/seed.js` محصولات را می‌کارد؛ پس CI به هیچ داده‌ی از پیش موجودی وابسته نیست.
نشان‌های بالای همین صفحه وضعیتِ واقعیِ همین workflowها هستند، نه یک بجِ دستی.

## بنچمارک

```bash
cd backend

# تست کامل (۴۰۰ خریدار + ۴۰۰ خواننده)
bash bench-report.sh

# فقط نوشتن
bash bench-report.sh write 1500

# فقط خواندن
bash bench-report.sh read 5000

# اجرای مستقیم
node bench-load.js 400               # بنچمارک نوشتن
node bench-read.js 400               # بنچمارک خواندن
```

`bench-report.sh` خروجی را تجزیه می‌کند و به‌صورت بلوک new در `benchmark-report.md` ذخیره می‌کند (append — محتوای قبلی پاک نمی‌شود).

### نتایج بنچمارک

#### نوشتن (POST /api/orders)

| کاربر | p50 | p99 | توان | موفقیت |
|---|---|---|---|---|
| ۴۰۰ | 145 ms | 251 ms | 1444 req/s | ۱۰۰٪ ✅ |
| ۲۰۰۰ | 597 ms | 1026 ms | 1767 req/s | ۱۰۰٪ ✅ |
| ۵۰۰۰ | 1586 ms | 2635 ms | 1692 req/s | ۱۰۰٪ ✅ |

#### خواندن (GET /api/products)

| کاربر | p50 | p99 | موفقیت |
|---|---|---|---|
| ۴۰۰ | 110 ms | 137 ms | ۱۰۰٪ ✅ |
| ۲۰۰۰ | 423 ms | 513 ms | ۱۰۰٪ ✅ |
| ۱۰۰۰۰ | 2258 ms | 2310 ms | ۱۰۰٪ ✅ |

## APIها

```text
/api/products          — لیست، جستجو، فیلتر، جزئیات، مرتبط
/api/cart              — سبد خرید
/api/auth              — ورود/ثبت‌نام (OTP + رمز عبور)
/api/addresses         — مدیریت آدرس‌ها
/api/orders            — ثبت سفارش + پرداخت
/api/wishlist          — علاقه‌مندی‌ها
/api/wholesale         — درخواست خرید عمده
/api/shop              — تنظیمات فروشگاه، دسته‌بندی‌ها
/api/admin             — پنل مدیریت (سفارش‌ها، محصولات، مشتریان، CRM، نظرات، تخفیف‌ها، گزارش، وضعیت سیستم)
/api/health            — نبض سرور (برای مانیتورینگ)
/api/csp-report        — گزارش تخلف‌های CSP
```

## ساختار پوشه‌ها

```
polasco-goli/
├── README.md
├── SECURITY.md                ← سیاستِ گزارشِ آسیب‌پذیری (responsible disclosure)
├── HTTPS-GUIDE.md             ← راهنمای کامل SSL و امنیت production
├── StartSite.bat              ← راه‌اندازی سریع
├── gitleaks.toml              ← تنظیمات secret scanning
├── .gitattributes             ← قرارِ خط‌پایان (مخزن LF است)
├── .gitleaksignore            ← استثناهای بررسی‌شده‌ی gitleaks
├── .github/workflows/         ← ci.yml (تست‌های بک‌اند + بیلدِ Next) و security.yml (Gitleaks)
├── backend/
│   ├── server.js              ← نقطه شروع سرور
│   ├── package.json
│   ├── package-lock.json
│   ├── ecosystem.config.js    ← تنظیماتِ PM2
│   ├── .env.example
│   ├── test-smoke.js          ← تست دود، کلِ مسیرِ سایت (۷۲۲ تست)
│   ├── test-all.js            ← اجراکننده‌ی سه مجموعه: دود + امنیت + تخفیف
│   ├── test-seo.js            ← تست سئو (۸۶ تست)
│   ├── tidy-test-data.js      ← پاک‌کردنِ رسوبِ تست دود (موجودی را دست نمی‌زند)
│   ├── bench-load.js          ← بنچمارک نوشتن (خرید همزمان)
│   ├── bench-read.js          ← بنچمارک خواندن (لیست/جستجو)
│   ├── bench-report.sh        ← اسکریپت خودکار بنچمارک و ثبت در گزارش
│   ├── benchmark-report.md    ← گزارش مقایسه‌ای بنچمارک
│   ├── SECURITY-REPORT.md     ← گزارش کامل اسکن OWASP Top 10
│   ├── lib/
│   │   ├── db.js              ← دیتابیس SQLite (۲,۹۷۵ خط، ۱۵۵ تابع)
│   │   ├── cache.js           ← کش درون‌حافظه با TTL
│   │   ├── cluster.js         ← Node.js cluster (لینوکس)
│   │   ├── rate-limit-sqlite.js ← rate-limit مشترک بین workers
│   │   ├── shared-state.js    ← انبارکِ مشترک بین workers (قفل حساب، توکن)
│   │   ├── metrics.js         ← متریک درخواست/تأخیر
│   │   ├── session-store.js   ← نشست در SQLite
│   │   ├── login-guard.js     ← قفل حساب
│   │   ├── middleware.js       ← احراز هویت، rate-limit، ETag، اعتبارسنجی
│   │   ├── security-config.js ← اعتبارسنجی تنظیمات امنیتی
│   │   ├── payment.js         ← زرین‌پال
│   │   ├── sms.js             ← ارسال پیامک
│   │   ├── phone.js           ← نرمال‌سازی شماره موبایل + شماره‌های مدیر
│   │   ├── logger.js          ← لاگ روزانه
│   │   ├── error-digest.js    ← خلاصه خطاها
│   │   ├── reconcile.js       ← تطبیق سفارش‌ها با درگاه
│   │   ├── static-compress.js ← فشرده‌سازی gzip/brotli
│   │   ├── webp-negotiate.js  ← تحویل WebP
│   │   ├── image-clean.js     ← پاک‌کردن GPS از عکس
│   │   ├── image-encode.js    ← رمزگذاری تصویر
│   │   ├── imagesize.js       ← خواندن ابعاد عکس
│   │   ├── jalali.js          ← تقویم شمسی
│   │   ├── ensure-fonts.js    ← دانلود فونت وزیرمتن
│   │   ├── paths.js           ← مسیرهای پوشه عکس
│   │   └── seed.js            ← لیست اولیه محصولات
│   ├── routes/
│   │   ├── products.js        ← محصولات + جستجو + ETag
│   │   ├── cart.js            ← سبد خرید
│   │   ├── auth.js            ← ورود OTP + رمز عبور
│   │   ├── addresses.js       ← آدرس‌ها
│   │   ├── orders.js          ← سفارشات + پرداخت
│   │   ├── wishlist.js        ← علاقه‌مندی‌ها
│   │   ├── wholesale.js       ← عمده‌فروشی B2B
│   │   ├── admin.js           ← پنل مدیریت
│   │   └── shop.js            ← تنظیمات فروشگاه
│   ├── tests/
│   │   ├── owasp-scan.js      ← اسکن OWASP Top 10 (۴۷ تست)
│   │   ├── security.js        ← تست امنیت (۴۵ تست)
│   │   ├── discount.js        ← تست کد تخفیف (۳۷ تست)
│   │   ├── bench-report-integrity.js ← یکپارچگیِ گزارشِ بنچمارک (۱۸ تست)
│   │   ├── secrets.js         ← نگهبانِ مرزِ راز (frontend، .env.example، ماسکِ لاگ)
│   │   ├── sandbox.js         ← ابزار sandbox تست (کپیِ دیتابیس در tmp)
│   │   └── makepng.js         ← ساختِ PNG معتبر با ابعادِ دلخواه برای تستِ آپلود
│   ├── tools/
│   │   ├── restore-backup.js  ← بازگردانیِ دیتابیس از بکاپ (چندلایه محافظ)
│   │   ├── seed-catalog.js    ← افزودنِ محصولاتِ پیش‌نویس (published = 0)
│   │   ├── optimize-images.js ← ساختِ نسخه‌ی WebP کنارِ هر عکس
│   │   ├── import-photos-*.js ← واردکردنِ دسته‌عکسِ تحویلیِ مالک
│   │   ├── contrast-audit.js  ← بازرسِ کنتراست رنگ (WCAG 2.2 سطح AA)
│   │   ├── css-audit.js       ← بازرسِ ریسپانسیو و متغیرهای CSS
│   │   └── log-summary.js     ← خلاصه‌ی خطاهای لاگ
│   └── data/                  ← دیتابیس + بکاپ‌ها (gitignore)
├── frontend/                  ← فرانت‌اند vanilla (Express)
│   ├── .well-known/
│   │   └── security.txt       ← responsible disclosure (RFC 9116)
│   ├── index.html             ← صفحه اصلی
│   ├── products.html          ← فهرست محصولات
│   ├── product.html           ← صفحه محصول
│   ├── product-gone.html      ← محصول حذف‌شده (HTTP 410)
│   ├── cart.html              ← سبد خرید
│   ├── login.html             ← ورود
│   ├── checkout.html          ← پرداخت
│   ├── order-success.html     ← رسید سفارش پس از پرداخت
│   ├── account.html           ← حساب کاربری
│   ├── admin.html             ← پنل مدیریت (۱۳ نما)
│   ├── wholesale.html         ← خرید عمده
│   ├── terms.html             ← قوانین
│   ├── 404.html               ← صفحه پیدا نشد
│   ├── 500.html               ← خطای سرور
│   ├── offline.html           ← حالت آفلاین (PWA)
│   ├── sw.js                  ← سرویس‌ورکر
│   ├── manifest.webmanifest   ← مانیفستِ PWA
│   ├── css/style.css          ← استایل‌ها
│   ├── css/invoice.css        ← استایلِ فاکتورِ چاپی
│   ├── js/                    ← اسکریپت‌ها (۱۲ فایل)
│   └── assets/                ← آیکون‌ها و فونت وزیرمتن
├── next-frontend/             ← فرانت‌اند Next.js (App Router)
│   ├── package.json           ← Next 15.5، React 19، TanStack Query 5، Tailwind v4
│   ├── next.config.ts         ← rewrites به Express + هدرِ کشِ چانک‌ها (فقط production)
│   ├── vitest.config.mts      ← پیکربندیِ تست (jsdom + JSXِ خودکار)
│   ├── eslint.config.mjs      ← ESLint 9 flat config (no warnings)
│   ├── postcss.config.mjs
│   ├── tsconfig.json
│   ├── .env.example           ← API_ORIGIN و NEXT_PUBLIC_SITE_URL
│   └── src/
│       ├── middleware.ts      ← «واردشده بودن»؛ مجوزِ ادمین سمتِ Express است
│       ├── app/               ← صفحات (App Router)
│       │   ├── page.tsx       ← صفحه اصلی
│       │   ├── layout.tsx     ← Layout اصلی
│       │   ├── globals.css    ← استایل‌ها + print CSS
│       │   ├── products/      ← فهرست محصولات
│       │   ├── product/[id]/  ← صفحه محصول (گالری + wholesale + «دیگر موجود نیست»)
│       │   ├── cart/          ← سبد خرید (undo toast)
│       │   ├── login/         ← ورود (cooldown پایدار + 429)
│       │   ├── checkout/      ← پرداخت (closed-shop guard + edit address)
│       │   ├── account/       ← حساب کاربری (۳ تب)
│       │   ├── wholesale/     ← خرید عمده
│       │   ├── order-success/ ← رسید سفارش + پیگیریِ خودکارِ وضعیت
│       │   ├── robots.ts / sitemap.ts ← سئوی داینامیک
│       │   └── admin/         ← ۹ نمای منتقل‌شده: داشبورد، سفارش‌ها، انبار،
│       │                        مشتری‌ها، CRM، نظرات، تخفیف‌ها، تنظیمات، وضعیت سیستم
│       ├── components/        ← ۲۱ کامپوننت + ۳ کامپوننتِ صفحه اصلی + ۱۰ فایلِ محتوای پنل
│       │   ├── Header.tsx / Footer.tsx / AdminNav.tsx / Toast.tsx
│       │   ├── ProductCard.tsx / ProductDetail.tsx / ProductReviews.tsx / StarRow.tsx
│       │   ├── AccountContent.tsx / CartContent.tsx / CheckoutContent.tsx / CrmContent.tsx
│       │   ├── LoginForm.tsx / FilterBar.tsx / NotifyMeButton.tsx / WholesaleForm.tsx
│       │   ├── ReviewForm.tsx / Providers.tsx / JsonLd.tsx / ServiceWorkerRegistrar.tsx
│       │   ├── OrderSuccessContent.tsx      ← حلقه‌ی پیگیریِ نتیجه‌ی پرداخت
│       │   ├── OrderSuccessContent.test.tsx ← ۸ آزمونِ همان حلقه
│       │   ├── admin/         ← محتوای ۹ نمای پنل + AdminBits (اجزای مشترک + toUtc)
│       │   └── home/          ← OrderTracking / RecentlyViewed / PromoBanner
│       └── lib/               ← کتابخانه‌ها
│           ├── api.ts         ← توابع API (products, cart, auth, wishlist, orders, shop)
│           ├── adminApi.ts / adminSections.ts / adminTypes.ts ← پنل مدیریت
│           ├── types.ts       ← تایپ‌ها (Product, Order, Wishlist, WholesaleInfo, …)
│           ├── actions.ts     ← Server Actions
│           ├── site.ts        ← مبدأِ API و آدرسِ سایت (apiBase)
│           ├── faSearch.ts    ← نرمال‌سازیِ جستجوی فارسی
│           ├── couponState.ts / recent.ts / redirect.ts
│           └── useWishlist.ts / useAddToCart.ts / useShopInfo.ts
└── picture/                   ← عکس محصولات — بیرونِ frontend
    ├── logo/
    └── products/
```

> پوشه‌ی `picture/` عمداً در ریشه است و نه داخلِ `frontend/`: عکس‌ها داده‌ی
> مغازه‌اند نه فایلِ ثابتِ سایت، و پنل مدیریت روی همان پوشه آپلود می‌کند. تنها
> منبعِ حقیقتِ مسیرش `backend/lib/paths.js` است و سرور آن را روی `/picture`
> سرو می‌کند.

## راه‌اندازی روی سیستم خودتون

نیاز دارید Node.js **نسخه‌ی ۲۲.۵ به بالا** نصب باشه.

```bash
# اجرای سریع (Windows):
StartSite.bat

# یا دستی:
cd backend
npm install
copy .env.example .env   # Windows
# یا: cp .env.example .env
npm start
```

فرانت‌اند Next.js:
```bash
cd next-frontend
npm install
npm run dev    # اجرا روی port 3001
npm run build  # بیلد production
npm run lint   ← بررسی ESLint (باید 0 warning باشد)
npm run test   ← تست‌های Vitest (رفتارِ حلقه‌ی پیگیریِ نتیجه‌ی پرداخت)
```

تست‌های بک‌اند:
```bash
cd backend
npm run test:full             # هر شش مجموعه — ۹۵۵ تست
```

فهرستِ کاملِ مجموعه‌ها و اینکه هر کدام چه می‌سنجد، در بخشِ
[مجموعه تست‌ها](#مجموعه-تست‌ها) آمده. عمداً اینجا تکرار نشده تا دو جا از هم واگرا نشوند.

## مسیر خرید

۱. مشتری محصول رو به سبد اضافه می‌کنه (بدون نیاز به ورود)
۲. وارد صفحه‌ی سبد خرید می‌شه، تعداد رو تنظیم می‌کنه (یا آیتم حذف‌شده را بازگردانی می‌کنه)
۳. روی «تکمیل خرید» می‌زنه → اگه وارد نشده، به صفحه‌ی ورود می‌ره
۴. با شماره موبایل، کد ۵ رقمی دریافت می‌کنه و وارد می‌شه
۵. آدرس تحویل رو وارد می‌کنه (یا از آدرس‌های قبلی انتخاب می‌کنه)
۶. روی «پرداخت» می‌زنه → به درگاه زرین‌پال منتقل می‌شه
۷. بعد از پرداخت، سفارش ثبت می‌مونه و مشتری فاکتور می‌بینه
۸. اگر تأییدیه‌ی درگاه هنوز نرسیده باشه، همین صفحه خودش هر ۱۵ ثانیه (و بعد هر ۱ دقیقه) از سرور می‌پرسه، تا سقفِ ۳۴ دقیقه — بی‌اینکه مشتری کاری بکنه یا صفحه رو دوباره باز کنه. هر وقت نتیجه روشن شد، کارت و پیامِ بالای صفحه خودشون عوض می‌شن و یک پیامِ تأیید می‌ده.

## تنظیمات محیطی

```env
NODE_ENV=production
SESSION_SECRET=<حداقل ۳۲ کاراکتر تصادفی>
COOKIE_SECURE=true
ADMIN_PHONE=<شماره موبایل مدیر — ۰۹xxxxxxxxx>
SITE_URL=https://your-domain.com
```

> `ADMIN_PHONE` عمداً نمونه‌ی واقعی ندارد. ورود مدیر با پیامک به همین شماره
> انجام می‌شود، پس نوشتنِ عددِ واقعی در مخزنِ عمومی یعنی اعلامِ اینکه کلیدِ
> پنل دستِ کدام شماره است. مقدارش فقط در `.env` روی سرور بماند.

سرویس‌های اختیاری:
- `ZARINPAL_MERCHANT_ID` — درگاه پرداخت واقعی
- `SMS_API_KEY` — ارسال پیامک واقعی
- `BACKUP_DIR2` — بکاپ خارج از دیسک اصلی
- `CLUSTER_ENABLED=true` — حالت cluster (فقط لینوکس)

فرانت‌اند Next.js (`next-frontend/.env.example`):

```env
API_ORIGIN=http://localhost:3000            # مبدأِ Express برای SSR/SSG/Server Actions
NEXT_PUBLIC_SITE_URL=http://localhost:3001  # پایه‌ی canonical، sitemap، robots و JSON-LD
```

> دو نکته که اگر رعایت نشوند فرانت‌اند نیمه‌کاره بالا می‌آید. اول: `API_ORIGIN`
> عمداً `NEXT_PUBLIC_` نیست — مرورگر باید مسیرِ **نسبی** بزند تا `rewrites` در
> `next.config.ts` آن را پروکسی کند؛ اگر مرورگر مستقیم به `:3000` بزند، درخواست
> cross-origin می‌شود و Express نه CORS می‌دهد نه کوکیِ نشست را می‌پذیرد. دوم: در
> `backend/.env` باید `CSRF_EXTRA_ORIGINS=http://localhost:3001` باشد، وگرنه هر
> «نوشتن» از Next با ۴۰۳ رد می‌شود، چون مرورگر `Origin` را با پورتِ ۳۰۰۱ می‌فرستد
> و Express آن را غریبه می‌بیند.

## انتشار (Deploy)

پوشه‌ی `backend/` (همراه `frontend/`) روی هر سرویس Node.js:
- ایران: لیارا یا آروان‌کلود
- عمومی: Railway، Render، یا VPS

```bash
# با PM2:
CLUSTER_ENABLED=true pm2 start ecosystem.config.js

# یا مستقیم:
CLUSTER_ENABLED=true node backend/server.js
```

فرانت‌اند Next.js:
```bash
cd next-frontend
npm run build
npm start       # اجرا روی port 3001
```

> در production دو متغیرِ همین پوشه باید ست باشند: `API_ORIGIN` روی آدرسِ Express
> و `NEXT_PUBLIC_SITE_URL` روی دامنه‌ی واقعیِ https — پایه‌ی canonical، sitemap،
> robots و JSON-LD همین است، و اگر اشتباه باشد گوگل آدرس‌های لوکال را ایندکس
> می‌کند. و در `.env` بک‌اند، `CSRF_EXTRA_ORIGINS` باید دامنه‌ی فرانت‌اند را داشته
> باشد؛ در غیر این صورت ورود و ثبت سفارش روی سایتِ Next با **۴۰۳** رد می‌شود و
> پیامِ خطا هم دلیلش را نمی‌گوید.

## امنیت

### اسکن‌های خودکار
```bash
node tests/owasp-scan.js       # اسکن OWASP Top 10 (۴۷ تست)
node tests/security.js         # تست آپلود، CSRF، جعل IP، rate-limit (۴۵ تست)
npm run test:secrets           # نگهبانِ مرزِ راز
npm run security:gitleaks      # gitleaks با تنظیماتِ خودِ پروژه
```

`security.yml` در CI هر push را با Gitleaks اسکن می‌کند — وضعیتش در نشانِ بالای
همین صفحه دیده می‌شود.

### گزارشِ آسیب‌پذیری
اگر ایرادِ امنیتی پیدا کردید، لطفاً به‌صورت عمومی issue نسازید.
راهِ درستش در [SECURITY.md](SECURITY.md) و `frontend/.well-known/security.txt`
(طبق RFC 9116) نوشته شده.

### Gitleaks دستی
```bash
gitleaks detect --redact --config gitleaks.toml --source .
```

### لاگ‌ها
- `backend/logs/app-YYYY-MM-DD.log` — رویدادها
- `backend/logs/error-YYYY-MM-DD.log` — خطاها
- `backend/logs/access-YYYY-MM-DD.log` — پاسخ‌های ۴xx/۵xx

```bash
npm run logs:summary -- --days=7
```

## ابزارهای مدیریتی

همه بدونِ هیچ پکیجِ بیرونی و همه با `cd backend` اجرا می‌شوند.

| ابزار | کار |
|---|---|
| `node tools/restore-backup.js` | فهرستِ بکاپ‌ها. بی‌آرگومان **هیچ چیزی را عوض نمی‌کند** — فقط نشان می‌دهد. بکاپِ نیمه‌کاره را قبل از اعتماد رد می‌کند. |
| `node tools/restore-backup.js 2026-08-20` | بازگردانی به آن روز — با عکسِ `pre-restore-*` و تأییدِ `yes` |
| `node tools/seed-catalog.js` | افزودنِ محصولاتِ **پیش‌نویس** (`published = 0`) — روی سایت دیده نمی‌شوند تا خودت عکس و قیمت بگذاری |
| `node tools/optimize-images.js` | ساختِ نسخه‌ی WebP کنارِ هر عکس (۲۵–۴۵٪ سبک‌تر) |
| `node tools/contrast-audit.js` | بازرسِ کنتراست رنگ طبقِ WCAG 2.2 سطح AA |
| `node tools/css-audit.js` | بازرسِ ریسپانسیو + متغیرهای CSSِ استفاده‌شده‌ی تعریف‌نشده |
| `node tools/log-summary.js --days=7` | خلاصه‌ی خطاهای لاگ |
| `node tidy-test-data.js` | فهرستِ رسوبِ تست دود (سرور خاموش). با `--apply` پاک می‌کند؛ موجودی را **عمداً** دست نمی‌زند. |
| `node tidy-test-data.js --check-stock` | مقایسه‌ی موجودی با آخرین بکاپ |

## مستندات

| فایل | توضیح |
|---|---|
| `README.md` | همین فایل — راهنمای اصلی پروژه |
| `SECURITY.md` | چطور آسیب‌پذیری را خصوصی گزارش کنید |
| `HTTPS-GUIDE.md` | راهنمای کامل فعال‌سازی SSL، nginx، و تنظیمات امنیتی production |
| `backend/SECURITY-REPORT.md` | گزارش کامل اسکن OWASP Top 10 با جزئیات هر دسته |
| `backend/benchmark-report.md` | گزارش مقایسه‌ای بنچمارک (قابل به‌روزرسانی با `bench-report.sh`) |

## مالکیت و مجوز

این کد **اختصاصی** است و مجوزِ متن‌بازی ندارد. نبودنِ فایلِ `LICENSE` تصادفی
نیست: طبق قانونِ کپی‌رایت، نبودنِ مجوز یعنی هیچ اجازه‌ای واگذار نشده است. مخزن
برای *دیدن* عمومی است، نه برای استفاده‌ی مجدد.

© ۲۰۲۶ پلاسکو گلی — همه‌ی حقوق محفوظ است.

---

<sub>بازبینیِ کد، تست‌نویسی و مستندسازیِ این پروژه با همکاریِ Claude (Anthropic) و Codebuff انجام شده است.</sub>