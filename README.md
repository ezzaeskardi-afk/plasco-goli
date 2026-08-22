# پلاسکو گلی — فروشگاه آنلاین

فروشگاه فارسی محصولات پلاستیکی با frontend ساده‌ی HTML/CSS/JavaScript و backend مبتنی بر Node.js و Express. مشتری محصول را به سبد اضافه می‌کند، با شماره موبایل وارد می‌شود، آدرس تحویل می‌دهد، سفارش ثبت می‌کند و وضعیت سفارش را از حساب کاربری یا صفحه‌ی پیگیری می‌بیند.

> وضعیت فعلی: **۶۸۸ تست smoke + ۵۴ تست سئو = ۷۴۲ تست سبز.** CRM پیشرفته با امتیازدهی RFM، وضعیت سیستم در پنل، بنچمارک ۱۰,۰۰۰ کاربر، و Cluster Mode آماده است.

## وضعیت فنی فعلی

- Node.js `>=22.5`، Express و SQLite داخلی Node
- **۱۵۵ تابع** در `db.js` (۲,۹۲۹ خط) — ۲۴ فایل کتابخانه + ۹ مسیر API
- تست smoke: **۶۸۸ تست موفق** + تست سئو: **۵۴ تست موفق**
- بنچمارک: **۱۰,۰۰۰ کاربر همزمان — ۱۰۰٪ موفق، صفر خطا**
- شاخه‌ی اصلی: `master`

## Quick start

نیازمندی: Node.js نسخه‌ی ۲۲.۵ یا بالاتر.

```bash
cd backend
npm install
copy .env.example .env   # Windows
# یا: cp .env.example .env
npm start
```

سایت روی `http://localhost:3000` اجرا می‌شود. در حالت توسعه اگر `SESSION_SECRET` تنظیم نشده باشد secret موقت ساخته می‌شود؛ در production این کار ممنوع است.

## قابلیت‌های کلیدی

### فروشگاه مشتری
- صفحه اصلی با محصولات پرفروش، جستجوی زنده، و نوار اطلاعیه
- فهرست محصولات با فیلتر دسته/قیمت/موجودی، مرتب‌سازی و صفحه‌بندی
- صفحه محصول با گالری چندعکسه، مشخصات، نظرات و محصولات مرتبط
- سبد خرید با تخفیف و هزینه ارسال
- ورود با کد پیامکی (OTP) — ۵ باکس واقعی تکرقمی
- پرداخت از طریق زرین‌پال
- حساب کاربری با آدرس‌ها، سفارش‌ها و علاقه‌مندی‌ها
- پیگیری سفارش بدون ورود (شماره سفارش + موبایل)
- فاکتور قابل چاپ

### پنل مدیریت
- **داشبورد**: فروش، سفارش‌ها، مشتری‌ها، کالاهای رو به اتمام
- **سفارش‌ها**: مدیریت وضعیت، کد رهگیری، لغو و مرجوعی
- **انبار**: ویرایش سریع قیمت/موجودی، محصول جدید، آپلود عکس
- **مشتری‌ها**: لیست با آمار خرید، جستجو و صفحه‌بندی
- **CRM پیشرفته**: امتیازدهی RFM، سگمنت‌های هوشمند (VIP/پرخطر/بازگشتی)، تایم‌لاین فعالیت، یادداشت و پیگیری
- **نظرات**: مدیریت نظرات با تأیید/رد
- **تخفیف‌ها**: کد تخفیف درصدی یا ثابت با سقف و تاریخ انقضا
- **عمده‌فروشی**: درخواست خرید B2B با قیمت پلکانی
- **گزارش‌ها**: نمودار فروش، محصولات برتر، سهم دسته‌بندی‌ها
- **وضعیت سیستم**: متریک سرور، سلامت دیتابیس، بکاپ‌ها، لاگ خطاها
- **تنظیمات**: هزینه ارسال، بنر جشنواره، تعطیلی موقت

### سئو
- متاهای og/twitter و canonical **سمت سرور** تزریق می‌شوند
- JSON-LD: Store + WebSite + FAQPage + **ItemList محصولات پرفروش** (سرور-ساید)
- محصولات: Product + Offer + AggregateRating + BreadcrumbList
- sitemap.xml داینامیک با lastmod واقعی
- robots.txt داینامیک
- صفحه محصول حذف‌شده: HTTP 410 Gone
- **تست خودکار سئو**: ۵۴ تست — canonical، og:image، robots، JSON-LD

### امنیت
- CSP کامل (بدون `unsafe-inline`) + گزارش‌گیری
- HSTS روی HTTPS
- CSRF دو لایه (sameSite cookie + بررسی Origin)
- Rate-limit چندلایه (سراسری + نوشتن + اختصاصی)
- قفل حساب بعد از رمز غلط پیاپی
- ماسک‌کردن شماره موبایل در لاگ
- Gitleaks برای جلوگیری از لو رفتن secretها

### عملکرد
- **Cluster Mode**: استفاده از تمام هسته‌های CPU (روی لینوکس)
- **کش درون‌حافظه**: TTL ۲-۱۰ ثانیه برای queryهای پرتکرار
- **Rate-limit SQLite**: مشترک بین cluster workers
- **کش مرورگر**: CSS/JS immutable یک‌ماهه، HTML no-cache
- **فشرده‌سازی**: gzip/brotli برای CSS/JS/SVG
- **WebP خودکار**: تحویل نسخه سبک‌تر اگر مرورگر بپذیرد
- **SQLite WAL**: خواندن و نوشتن هم‌زمان
- **بنچمارک**: `bench-load.js` (نوشتن) + `bench-read.js` (خواندن)

## نتایج بنچمارک

### نوشتن (POST /api/orders)

| کاربر | p50 | p99 | توان | موفقیت |
|---|---|---|---|---|
| ۴۰۰ | 145 ms | 251 ms | 1444 req/s | ۱۰۰٪ ✅ |
| ۲۰۰۰ | 597 ms | 1026 ms | 1767 req/s | ۱۰۰٪ ✅ |
| ۵۰۰۰ | 1586 ms | 2635 ms | 1692 req/s | ۱۰۰٪ ✅ |

### خواندن (GET /api/products)

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
/api/admin             — پنل مدیریت (سفارشات، محصولات، CRM، گزارش، وضعیت سیستم)
/api/health            — نبض سرور (برای مانیتورینگ)
/api/csp-report        — گزارش تخلف‌های CSP
```

## ساختار پوشه‌ها

```
polasco-goli/
├── README.md
├── StartSite.bat              ← راه‌اندازی سریع
├── gitleaks.toml              ← تنظیمات secret scanning
├── .github/workflows/         ← اسکن Gitleaks در CI
├── backend/
│   ├── server.js              ← نقطه شروع سرور
│   ├── package.json
│   ├── .env.example
│   ├── test-all.js            ← مجموعه تست (۶۸۸ تست)
│   ├── test-smoke.js          ← تست مسیر سایت
│   ├── test-seo.js            ← تست خودکار سئو (۵۴ تست)
│   ├── bench-load.js          ← بنچمارک نوشتن (خرید همزمان)
│   ├── bench-read.js          ← بنچمارک خواندن (لیست/جستجو)
│   ├── benchmark-report.md    ← گزارش مقایسه‌ای بنچمارک
│   ├── lib/
│   │   ├── db.js              ← دیتابیس SQLite (۲,۹۲۹ خط، ۱۵۵ تابع)
│   │   ├── cache.js           ← کش درون‌حافظه با TTL
│   │   ├── cluster.js         ← Node.js cluster (لینوکس)
│   │   ├── rate-limit-sqlite.js ← rate-limit مشترک بین workers
│   │   ├── metrics.js         ← متریک درخواست/تأخیر
│   │   ├── session-store.js   ← نشست در SQLite
│   │   ├── login-guard.js     ← قفل حساب
│   │   ├── middleware.js       ← احراز هویت، rate-limit، ETag
│   │   ├── security-config.js ← اعتبارسنجی تنظیمات امنیتی
│   │   ├── payment.js         ← زرین‌پال
│   │   ├── sms.js             ← ارسال پیامک
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
│   ├── tests/                 ← مجموعه تست امنیت و مرزی
│   ├── tools/                 ← ابزارهای مدیریتی
│   └── data/                  ← دیتابیس + بکاپ‌ها
└── frontend/
    ├── index.html             ← صفحه اصلی
    ├── products.html          ← فهرست محصولات
    ├── product.html           ← صفحه محصول
    ├── cart.html              ← سبد خرید
    ├── login.html             ← ورود
    ├── checkout.html          ← پرداخت
    ├── account.html           ← حساب کاربری
    ├── admin.html             ← پنل مدیریت
    ├── wholesale.html         ← خرید عمده
    ├── terms.html             ← قوانین
    ├── offline.html           ← حالت آفلاین (PWA)
    ├── sw.js                  ← سرویس‌ورکر
    ├── css/style.css          ← استایل‌ها
    ├── js/                    ← اسکریپت‌ها
    ├── assets/                ← آیکون‌ها و فونت‌ها
    └── picture/               ← عکس محصولات
```

## راه‌اندازی روی سیستم خودتون

نیاز دارید Node.js **نسخه‌ی ۲۲.۵ به بالا** نصب باشه.

```bash
cd backend
npm install
copy .env.example .env   # Windows
# یا: cp .env.example .env
npm start
```

تست‌ها:
```bash
npm test                  # ۶۸۸ تست smoke
node test-seo.js          # ۵۴ تست سئو
npm run check             # همه تست‌ها + بنچمارک
```

## مسیر خرید

۱. مشتری محصول رو به سبد اضافه می‌کنه (بدون نیاز به ورود)
۲. وارد صفحه‌ی سبد خرید می‌شه، تعداد رو تنظیم می‌کنه
۳. روی «تکمیل خرید» می‌زنه → اگه وارد نشده، به صفحه‌ی ورود می‌ره
۴. با شماره موبایل، کد ۵ رقمی دریافت می‌کنه و وارد می‌شه
۵. آدرس تحویل رو وارد می‌کنه (یا از آدرس‌های قبلی انتخاب می‌کنه)
۶. روی «پرداخت» می‌زنه → به درگاه زرین‌پال منتقل می‌شه
۷. بعد از پرداخت، سفارش ثبت می‌مونه و مشتری فاکتور می‌بینه

## تنظیمات محیطی

```env
NODE_ENV=production
SESSION_SECRET=<حداقل ۳۲ کاراکتر تصادفی>
COOKIE_SECURE=true
ADMIN_PHONE=09113567409
SITE_URL=https://your-domain.com
```

سرویس‌های اختیاری:
- `ZARINPAL_MERCHANT_ID` — درگاه پرداخت واقعی
- `SMS_API_KEY` — ارسال پیامک واقعی
- `BACKUP_DIR2` — بکاپ خارج از دیسک اصلی
- `CLUSTER_ENABLED=true` — حالت cluster (فقط لینوکس)

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

## امنیت

### Gitleaks
```bash
gitleaks detect --redact --config gitleaks.toml --source .
cd backend && npm run security:gitleaks
```

### لاگ‌ها
- `backend/logs/app-YYYY-MM-DD.log` — رویدادها
- `backend/logs/error-YYYY-MM-DD.log` — خطاها
- `backend/logs/access-YYYY-MM-DD.log` — پاسخ‌های ۴xx/۵xx

```bash
npm run logs:summary -- --days=7
```

### بکاپ
```bash
node tools/restore-backup.js    # فهرست بکاپ‌ها
```

## سایر فایل‌ها

| فایل | توضیح |
|---|---|
| `benchmark-report.md` | گزارش مقایسه‌ای بنچمارک (قابل به‌روزرسانی) |
| `یادداشت-کلود.md` | یادداشت‌های فنی و تصمیم‌گیری‌ها |
| `گزارش-۱۰۰-محصول.md` | گزارش تحلیلی رسیدن به ۱۰۰ محصول |
| `ui-ux-pro-max/` | تحقیق و طراحی UI/UX |
