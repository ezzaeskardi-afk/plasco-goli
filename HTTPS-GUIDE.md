# راهنمای فعال‌سازی HTTPS و تنظیم COOKIE_SECURE

## چرا HTTPS لازم است؟

بدون HTTPS:
- کوکی نشست (`polasco.sid`) توسط مرورگر **نگه داشته نمی‌شود** وقتی `COOKIE_SECURE=true` باشد
- کاربر نمی‌تواند وارد شود
- هدر HSTS فعال نمی‌شود
- درگاه زرین‌پال HTTP را قبول نمی‌کند
- مرورگرها عبارت «Not Secure» نشان می‌دهند

---

## معماریِ استقرار را اول بشناسید

پروژه **دو برنامه** دارد و این راهنما هر دو را پوشش می‌دهد:

| برنامه | پوشه | پیش‌فرضِ پورت | چه چیزی سرو می‌کند |
| --- | --- | --- | --- |
| Express | `backend/` | ۳۰۰۰ | API (`/api/*`)، عکس‌ها (`/picture/*`)، و فرانت vanilla در `frontend/` |
| Next.js | `next-frontend/` | ۳۰۰۱ | فروشگاهِ Next (App Router) و **پنل مدیریت** (`/admin/*`) |

سه نکته که اگر ندانید، HTTPS را «موفق» می‌کنید و سایت نیمه‌کاره بالا می‌آید:

1. **پنل مدیریت روی Next است، نه Express.** اگر آدرسِ `SITE_URL` به دامنه‌ی Next
   اشاره نکند، هر ورود به `/admin` از Express با **۳۰۲** به مقصدِ اشتباه می‌رود
   (منطقش در `backend/server.js`: هر درخواستِ `/admin` و زیرمسیرهایش به همان مسیر
   روی `SITE_URL` ریدایرکت می‌شود؛ اگر `SITE_URL` خالی باشد یا میزبانش با میزبانِ
   همین درخواست یکی باشد، ریدایرکت انجام نمی‌شود تا حلقه‌ی بی‌پایان نسازیم).
2. **`SITE_URL` فقط تزئینی نیست.** آدرسِ بازگشتِ درگاه پرداخت هم از همین‌جا ساخته
   می‌شود؛ اگر اشتباه باشد مشتری وسطِ پرداخت از سایتِ Next بیرون می‌افتد.
3. **دو برنامه روی دو پورت = مبدأِ متفاوت.** مرورگر هدر `Origin` را با پورتِ Next
   می‌فرستد و سدِ CSRF در Express آن را غریبه می‌بیند → هر «نوشتن» با **۴۰۳** رد
   می‌شود. راه‌حل `CSRF_EXTRA_ORIGINS` است (پایین‌تر).

---

## مرحله ۱: تنظیم `.env`

### `backend/.env`

```env
# محیط اجرا
NODE_ENV=production

# آدرس رسمی سایت (با https://)
# در production باید یک URL معتبرِ https باشد، وگرنه سرور بالا نمی‌آید.
SITE_URL=https://yourdomain.com

# کوکی امن (فقط بعد از فعال شدن HTTPS)
# همین متغیر HSTS را هم روشن می‌کند: تا COOKIE_SECURE=true نشود هدرِ
# Strict-Transport-Security اصلاً فرستاده نمی‌شود.
COOKIE_SECURE=true

# secret نشست (حداقل ۳۲ کاراکتر تصادفی)
SESSION_SECRET=<یک رشته تصادفی حداقل ۳۲ کاراکتر>

# اعتماد به پروکسی (فقط پشت nginx/Cloudflare)
TRUST_PROXY=1

# درگاه پرداخت
ZARINPAL_MERCHANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# پیامک
SMS_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# مبدأهای اضافیِ مجاز برای درخواست‌های «نوشتن» (با کاما جدا کنید)
# تک‌دامنه‌ای پشت nginx: خالی بگذارید.
# Next روی پورتِ جداگانه (۳۰۰۱): http://localhost:3001
CSRF_EXTRA_ORIGINS=
```

ساخت SESSION_SECRET تصادفی:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### `next-frontend/.env`

```env
# مبدأِ Express برای fetchِ سمتِ سرور (SSR/SSG/Server Actions)
API_ORIGIN=https://yourdomain.com

# آدرس عمومیِ سایت — پایه‌ی canonical، sitemap، robots و JSON-LD
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

> `API_ORIGIN` عمداً `NEXT_PUBLIC_` نیست. مرورگر باید مسیرِ **نسبی** بزند تا
> `rewrites` در `next.config.ts` آن را به Express پروکسی کند. اگر مرورگر مستقیم به
> پورتِ Express بزند، درخواست cross-origin می‌شود و Express نه CORS می‌دهد نه
> کوکیِ نشست را می‌پذیرد — یعنی ورود و سبد خرید بی‌صدا می‌شکنند.

> `next.config.ts` سه چیز را از همین یک متغیر می‌سازد: `rewrites`، `remotePatterns`
> تصویرها (`/picture/**`) و fetchهای SSR. یک جا بودنشان عمدی است تا دو منبعِ حقیقت
> از هم واگرا نشوند.

### نکته‌ی `CSRF_EXTRA_ORIGINS`

سدِ دومِ CSRF در `backend/server.js` هر `POST/PUT/DELETE` را که هدر `Origin` غریبه
داشته باشد رد می‌کند. دو حالت:

- **تک‌دامنه‌ای پشت nginx** (پیشنهادی): مرورگر `Origin` را با همان دامنه می‌فرستد،
  پس `CSRF_EXTRA_ORIGINS` را **خالی** بگذارید.
- **Next روی پورت/دامنه‌ی جداگانه**: همان مبدأ را اینجا بنویسید، وگرنه خرید و ورود
  ۴۰۳ می‌شوند.

درخواستی که **هیچ** `Origin`/`Referer` نداشته باشد رد نمی‌شود (کلاینت‌های غیرِمرورگری
مثل uptime robot)، پس خالی گذاشتنِ این لیست یعنی «فقط مرورگرهای همان دامنه».

---

## مرحله ۲: انتخاب روش HTTPS

### روش A: Cloudflare (ساده‌ترین)

1. دامنه را به Cloudflare اضافه کنید
2. DNS را به سرور خودتان اشاره دهید (A Record)
3. در تب SSL/TLS:
   - Encryption mode را روی **Full (Strict)** بگذارید
   - Always Use HTTPS را روشن کنید
   - Automatic HTTPS Rewrites را روشن کنید
4. در تب Network:
   - WebSockets را روشن کنید (برای PWA)

مزایا:
- SSL رایگان خودکار
- CDN جهانی
- DDoS Protection
- **نیازی به تنظیم nginx نیست**

عیب:
- تأخیر اضافی (~20ms)
- رایگان فقط برای یک دامنه

> پشت Cloudflare، `TRUST_PROXY` را روی تعدادِ لایه‌ها بگذارید (۱). اگر عددِ
> `X-Forwarded-For` می‌رسد و `TRUST_PROXY` خاموش است، سرور یک‌بار هشدارِ بلند
> می‌دهد که IP همه‌ی کاربران یکی دیده می‌شود.

### روش B: Let's Encrypt + nginx

#### نصب Certbot (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

#### دریافت گواهی:
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

#### تمدید خودکار:
```bash
sudo systemctl status certbot.timer
# باید active باشد — تمدید هر ۶۰ روز خودکار انجام می‌شود
```

#### پیکربندی nginx (هر دو برنامه روی یک دامنه):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # HSTS — فقط بعد از تأیید HTTPS کار می‌کند
    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;

    # ---- API و عکس‌ها: Express روی ۳۰۰۰ ----
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /picture/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ---- فروشگاه و پنل: Next روی ۳۰۰۱ ----
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

> **اگر فقط فرانت vanilla در `frontend/` را سرو می‌کنید**، بلوکِ `location / { … }`
> را به `http://127.0.0.1:3000` بدهید و بلوکِ ۳۰۰۱ را حذف کنید — بقیه‌ی پیکربندی
> دست‌نخورده می‌ماند.

>
> **چرا `X-Forwarded-Proto` را خودمان می‌گذاریم؟** پروکسیِ داخلیِ Next (که
> `rewrites` را اجرا می‌کند) با `changeOrigin` کار می‌کند و فقط `x-forwarded-host` را
> ست می‌کند؛ `X-Forwarded-For` و `X-Forwarded-Proto` را اضافه **نمی‌کند**. پس
> Express پشتِ Next آدرسِ پروکسی را می‌بیند، نه کاربر را. اگر IP واقعیِ کاربر
> برایتان مهم است (لاگ، سقفِ نرخ، قفل حساب)، nginx باید این دو هدر را بگذارد.

#### اجرای nginx:
```bash
sudo nginx -t          # بررسی پیکربندی
sudo systemctl reload nginx
```

### روش C: Railway / Render / Vercel

این سرویس‌ها SSL خودکار دارند:
- فقط `SITE_URL=https://yourdomain.com` را تنظیم کنید
- `COOKIE_SECURE=true` را بگذارید
- `TRUST_PROXY=1` را بگذارید
- نیازی به تنظیم اضافی نیست

> اگر دو سرویس جدا بالا می‌آورید (یکی برای `backend/`، یکی برای `next-frontend/`)
> دو چیز را حتماً ست کنید: در سرویسِ Next، `API_ORIGIN` روی نشانیِ عمومیِ سرویسِ
> Express؛ و در سرویسِ Express، `CSRF_EXTRA_ORIGINS` روی دامنه‌ی سرویسِ Next.
> سرویسِ Next هم `NEXT_PUBLIC_SITE_URL` را با دامنه‌ی خودش می‌خواهد.
>
> روی Vercel، پنلِ `/admin` باید از خودِ دامنه سرو شود؛ اگر Express روی دامنه‌ی
> دیگری باشد، `SITE_URL` را روی دامنه‌ی Next بگذارید تا ریدایرکتِ ۳۰۲ به همان‌جا برود.

### روش D: آیینه‌ی Dev (localhost)

```env
NODE_ENV=development
COOKIE_SECURE=false
SITE_URL=http://localhost:3001
```

در حالتِ توسعه، فرانت‌اندِ Next روی ۳۰۰۱ می‌نشیند و صفحه‌ی واقعیِ سایت همان است،
پس `SITE_URL` را روی ۳۰۰۱ بگذارید (همان مقداری که `next-frontend/.env.example` و
`backend/.env.example` پیش‌فرض می‌گذارند). برای اینکه «نوشتن»ها از Next به Express
برسند:

```env
# backend/.env — تنها در حالتِ dev که Next روی پورتِ دیگری است
CSRF_EXTRA_ORIGINS=http://localhost:3001
```

HTTPS محلی (اختیاری):
```bash
# ساخت گواهی خود-امضا
openssl req -x509 -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=localhost' \
  -keyout localhost-privkey.pem \
  -out localhost-cert.pem -days 365

# اجرا با HTTPS
node -e "
const https = require('https');
const fs = require('fs');
const app = require('./server.js');
const opts = {
  key: fs.readFileSync('localhost-privkey.pem'),
  cert: fs.readFileSync('localhost-cert.pem')
};
https.createServer(opts, app).listen(3443, () => console.log('HTTPS on :3443'));
"
```

> با HTTPِ ساده در dev، کوکی را `COOKIE_SECURE=false` بگذارید وگرنه مرورگر
> نگهش نمی‌دارد و «وارد شدم ولی وارد نشدم» می‌شود.

---

## مرحله ۳: اجرای سرور

### با PM2 (پیشنهادی):
```bash
cd backend
CLUSTER_ENABLED=true pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### مستقیم:
```bash
cd backend
CLUSTER_ENABLED=true node server.js
```

### فرانت‌اند Next:
```bash
cd next-frontend
npm ci
npm run build
pm2 start npm --name polasco-next -- start   # اجرا روی ۳۰۰۱
pm2 save
```

> با `CLUSTER_ENABLED=true` شمارنده‌هایی که باید بین workerها مشترک باشند — سقف‌های
> نرخ، قفلِ حساب، و توکنِ یک‌بارمصرفِ پیامک — خودکار به جدول‌های SQLite منتقل
> می‌شوند؛ تنظیمِ دیگری لازم نیست. روی ویندوز خودکار خاموش می‌ماند.

---

## مرحله ۴: تست و تأیید

### ۱. بررسی هدرها:
```bash
curl -s -I https://yourdomain.com/ | grep -iE 'strict-transport|content-security|x-frame'
curl -s -I https://yourdomain.com/api/health | grep -iE 'strict-transport|content-security'
```

خروجی مورد انتظار **روی Express** (`/api/*`):
```
Strict-Transport-Security: max-age=15552000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self'; ... ; object-src 'none'
X-Frame-Options: SAMEORIGIN
```

خروجی مورد انتظار **روی Next** (صفحه‌های فروشگاه و پنل):
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: img-src 'self' data:; font-src 'self'; ... (بدونِ default-src)
X-Frame-Options: SAMEORIGIN
```

> دو تفاوت عمدی که نباید «باگ» حساب کنید:
> ۱) `default-src`/`script-src`/`style-src` در CSPِ Next **نیست**. اگر اضافه شود،
> اسکریپت‌های درون‌خطیِ App Router و صدها صفحه‌ی ثابت از کار می‌افتند؛ پس عمداً
> کنار گذاشته شده.
> ۲) HSTSِ Next بلندتر و با `preload` است. تا وقتی دامنه را واقعاً در لیستِ preload
> ثبت نکرده‌اید، این هدر بی‌خطر است (فقط همان میزبان را قفل می‌کند).

### ۲. بررسی کوکی:

مسیرِ API زیر `/api` است، نه ریشه‌ی سایت. سشن فقط وقتی ساخته می‌شود که چیزی واقعاً
در آن نوشته شود (cookie با `saveUninitialized: false` ساخته نمی‌شود)، پس یک
«نوشتنِ بی‌عارضه» می‌زنیم — افزودن به سبد خرید:

```bash
# شناسه‌ی محصولی بگذارید که روی همان سرور موجود و موجودِ انبار باشد
curl -s -D - -o /dev/null -X POST https://yourdomain.com/api/cart/add \
  -H "Content-Type: application/json" \
  -d '{"productId":1,"qty":1}' | grep -i 'set-cookie'
```

باید `polasco.sid=...` با `Secure` و `HttpOnly` و `SameSite=Lax` ببینید.

> این `curl` هیچ هدرِ `Origin` نمی‌فرستد، و سدِ CSRF درخواستِ بی‌`Origin` را رد
> **نمی‌کند** (کلاینت‌های غیرِمرورگری همین‌طور کار می‌کنند). پس اگر همین درخواست
> از مرورگرِ یک مبدأی دیگر بزنید و ۴۰۳ بگیرید، دلیلش `CSRF_EXTRA_ORIGINS` است.

بررسیِ دستی در مرورگر: وارد شوید و در DevTools → Application → Cookies ستونِ
`Secure` را برای `polasco.sid` ببینید.

### ۳. بررسی HTTP → HTTPS:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://yourdomain.com/
```

خروجی مورد انتظار: `301 https://yourdomain.com/`

### ۴. بررسی سلامتِ سرور:
```bash
curl -s https://yourdomain.com/healthz          # { status: "ok", ... }
curl -s "https://yourdomain.com/api/health?full=1"   # دیتابیس و حافظه
```

`/healthz` در حال خاموش‌شدن کد **۵۰۳** می‌دهد تا لودبالانسر ترافیکِ تازه نفرستد.
`/api/health` هم اگر دیتابیس جواب ندهد ۵۰۳ برمی‌گرداند (نه ۲۰۰) تا مانیتورینگ
واقعاً خبردار شود.

### ۵. بررسی پنل مدیریت:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://yourdomain.com/admin
curl -s -o /dev/null -w "%{http_code}\n" https://yourdomain.com/admin/orders
```

باید در نهایت روی دامنه‌ی Next بنشینید و پنل (با نوارِ چسبانِ بالای صفحه و دکمه‌ی
«بازگشت به صفحه سایت») بالا بیاید. اگر Express روی دامنه‌ی دیگری باشد، این دو
درخواست یک **۳۰۲** به `SITE_URL` می‌گیرند — طبیعی است.

### ۶. بررسی سایت در مرورگر:
- آدرس‌بار باید 🔒 نشان دهد
- عبارت «Secure» یا «امن» باید نوشته باشد
- ورود با شماره موبایل باید کار کند
- سبد خرید باید ذخیره بماند

### ۷. تست SSL:
```bash
# آنلاین
# https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com
```

امتیاز مورد انتظار: **A** یا **A+**

---

## عیب‌یابی

### مشکل: کوکی ذخیره نمی‌شود
```
علت: COOKIE_SECURE=true ولی سایت روی HTTP است
راه‌حل: HTTPS را فعال کنید یا COOKIE_SECURE=false بگذارید
```

### مشکل: ورود یا ثبت سفارش با ۴۰۳ رد می‌شود
```
علت: سدِ CSRF — هدر Origin با دامنه/پورتِ سایت یکی نیست
      (رایج‌ترین حالت: Next روی ۳۰۰۱ و Express روی ۳۰۰۰)
راه‌حل: در backend/.env مقدارِ CSRF_EXTRA_ORIGINS را روی همان مبدأیی بگذارید که
        مرورگر می‌فرستد (مثلاً http://localhost:3001)، یا هر دو را پشتِ یک دامنه
        بیاورید تا مقدار خالی بماند.
بررسی: با DevTools تب Network هدر Origin همان درخواست را ببینید؛ باید عیناً در
       لیست باشد (scheme + host + port).

نکته‌ی nginx: بعضی پیکربندی‌ها هدر Host را به آدرس داخلی (127.0.0.1) عوض می‌کنند.
آن وقت Origin مثلاً yourdomain.com است ولی میزبانِ دیده‌شده 127.0.0.1 می‌شود و
سایتِ سالم هم ۴۰۳ می‌گیرد. جبرانش TRUST_PROXY=1 است: با آن، هدرِ x-forwarded-host
هم به فهرستِ میزبان‌های مجاز اضافه می‌شود (بدونِ TRUST_PROXY عمداً اضافه نمی‌شود،
چون مهاجم خودش می‌تواند این هدر را بفرستد و سد را دور بزند).
```

### مشکل: صفحه ۵۰۲ بعد از فعال‌سازی HTTPS
```
علت: nginx به سرور Node وصل نمی‌شود
راه‌حل: مطمئن شوید سرور روی پورت ۳۰۰۰ بالاست
  curl http://127.0.0.1:3000/healthz
اگر سایت روی Next است، پورتِ ۳۰۰۱ را هم بررسی کنید:
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/
```

### مشکل: ورود به /admin به دامنه‌ی اشتباه می‌رود
```
علت: SITE_URL روی دامنه‌ی Express است ولی پنل روی Next سرو می‌شود
راه‌حل: SITE_URL را روی دامنه‌ای بگذارید که پنل (Next) را سرو می‌کند.
       اگر هر دو روی یک دامنه‌اند، اصلاً ریدایرکتی رخ نمی‌دهد.
```

### مشکل: HSTS بعد از غیرفعال کردن HTTPS
```
علت: مرورگر HSTS را کش کرده
راه‌حل: منتظر بمانید (max-age) یا در مرورگر HSTS را پاک کنید
نکته: تا COOKIE_SECURE=true نشود، HSTS اصلاً فرستاده نمی‌شود — پس برای خاموش‌کردنش
      همین یک متغیر را false کنید و بعد مرورگر را پاک کنید.
```

### مشکل: Mixed Content (محتوای ناامن)
```
علت: لینک به http:// در صفحه HTTPS
راه‌حل: همه URLها باید https:// یا // باشند
  sed -i 's|http://polasco-goli.example.com|https://yourdomain.com|g' frontend/*.html
در Next هیچ آدرسِ مطلقی هاردکد نیست؛ پایهٔ آدرس‌ها از NEXT_PUBLIC_SITE_URL می‌آید،
پس اگر Mixed Content دیدید اول همان متغیر را بررسی کنید.
```

### مشکل: Trusted Proxy
```
علت: TRUST_PROXY تنظیم نشده — IP همه کاربران یکی دیده می‌شود
     (پشتِ Next این حالت قطعی است: پروکسیِ داخلیِ Next هدرِ X-Forwarded-For اضافه نمی‌کند)
راه‌حل: TRUST_PROXY=1 در .env و عبورِ X-Forwarded-For/X-Forwarded-Proto از nginx
بررسی: سرور یک‌بار هشدارِ «Requests carry X-Forwarded-For but TRUST_PROXY is off»
       را در لاگ می‌نویسد.
```

---

## چک‌لیست نهایی قبل از انتشار

- [ ] `NODE_ENV=production`
- [ ] `SITE_URL=https://yourdomain.com` (دقیقاً همان دامنه‌ای که پنل را سرو می‌کند)
- [ ] `COOKIE_SECURE=true`
- [ ] `SESSION_SECRET` حداقل ۳۲ کاراکتر
- [ ] `TRUST_PROXY=1` (اگر پشت nginx/Cloudflare هستید)
- [ ] `CSRF_EXTRA_ORIGINS` — خالی در حالتِ تک‌دامنه‌ای، پر در حالتِ دو دامنه/دو پورت
- [ ] `ZARINPAL_MERCHANT_ID` تنظیم شده
- [ ] `SMS_API_KEY` تنظیم شده
- [ ] در `next-frontend/`: `API_ORIGIN` روی آدرسِ Express
- [ ] در `next-frontend/`: `NEXT_PUBLIC_SITE_URL` روی دامنه‌ی واقعیِ https
- [ ] `npm run build` فرانت‌اند Next موفق بوده و `pm2` هر دو برنامه را بالا آورده
- [ ] HTTPS کار می‌کند (SSL Labs: A)
- [ ] HTTP → HTTPS ریدایرکت می‌کند
- [ ] کوکی Secure flag دارد
- [ ] `/healthz` و `/api/health?full=1` جواب می‌دهند
- [ ] ورود با شماره موبایل کار می‌کند
- [ ] سبد خرید ذخیره می‌ماند
- [ ] پنل `/admin` روی دامنه‌ی درست باز می‌شود
- [ ] درگاه زرین‌پال کار می‌کند
- [ ] HSTS فعال است
- [ ] Mixed Content نیست
- [ ] `BACKUP_DIR2` تنظیم شده

---

## امنیت تکمیلی (اختیاری)

### DNSSEC:
```bash
# در پنل DNS فعال کنید — جلوی DNS Spoofing
```

### CSP Report-Only:
```bash
# ابتدا با گزارش شروع کنید، بعد فعال کنید
Content-Security-Policy-Report-Only: default-src 'self'; report-uri /api/csp-report
```

> هر دو برنامه تخلف‌های CSP را گزارش می‌کنند؛ سمتِ Express گیرنده در
> `/api/csp-report` است و پیش از سدِ origin می‌نشیند (مرورگر گزارش را با
> `Origin: null` می‌فرستد). سمتِ Next همین مسیر را به Express پروکسی می‌کند، پس
> گزارش‌ها یک‌جا جمع می‌شوند.

### Rate Limit روی nginx:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

location /api/ {
    limit_req zone=api burst=50 nodelay;
    proxy_pass http://127.0.0.1:3000;
}
```
