# راهنمای فعال‌سازی HTTPS و تنظیم COOKIE_SECURE

## چرا HTTPS لازم است؟

بدون HTTPS:
- کوکی نشست (`polasco.sid`) توسط مرورگر **نگه داشته نمی‌شود** وقتی `COOKIE_SECURE=true` باشد
- کاربر نمی‌تواند وارد شود
- هدر HSTS فعال نمی‌شود
- درگاه زرین‌پال HTTP را قبول نمی‌کند
- مرورگرها عبارت «Not Secure» نشان می‌دهند

---

## مرحله ۱: تنظیم `.env`

```env
# محیط اجرا
NODE_ENV=production

# آدرس رسمی سایت (با https://)
SITE_URL=https://yourdomain.com

# کوکی امن (فقط بعد از فعال شدن HTTPS)
COOKIE_SECURE=true

# secret نشست (حداقل ۳۲ کاراکتر تصادفی)
SESSION_SECRET=<یک رشته تصادفی حداقل ۳۲ کاراکتر>

# اعتماد به پروکسی (فقط پشت nginx/Cloudflare)
TRUST_PROXY=1

# درگاه پرداخت
ZARINPAL_MERCHANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# پیامک
SMS_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

ساخت SESSION_SECRET تصادفی:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

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

#### پیکربندی nginx:
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

    location / {
        proxy_pass http://127.0.0.1:3000;
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

### روش D: آیینه‌ی Dev (localhost)

برای تست محلی:
```env
NODE_ENV=development
COOKIE_SECURE=false
SITE_URL=http://localhost:3000
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

---

## مرحله ۴: تست و تأیید

### ۱. بررسی هدرها:
```bash
curl -s -I https://yourdomain.com/ | grep -iE 'strict-transport|content-security|x-frame'
```

خروجی مورد انتظار:
```
Strict-Transport-Security: max-age=15552000; includeSubDomains
Content-Security-Policy: default-src 'self'; ...
X-Frame-Options: SAMEORIGIN
```

### ۲. بررسی کوکی:
```bash
curl -s -c - https://yourdomain.com/ -X POST \
  -H "Content-Type: application/json" \
  -d '{"phone":"09123456789"}' | grep polasco.sid
```

باید `Secure` flag داشته باشد.

### ۳. بررسی HTTP → HTTPS:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://yourdomain.com/
```

خروجی مورد انتظار: `301 https://yourdomain.com/`

### ۴. بررسی سایت در مرورگر:
- آدرس‌بار باید 🔒 نشان دهد
- عبارت «Secure» یا «امن» باید نوشته باشد
- ورود با شماره موبایل باید کار کند
- سبد خرید باید ذخیره بماند

### ۵. تست SSL:
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

### مشکل: صفحه ۵۰۲ بعد از فعال‌سازی HTTPS
```
علت: nginx به سرور Node وصل نمی‌شود
راه‌حل: مطمئن شوید سرور روی پورت ۳۰۰۰ بالاست
  curl http://127.0.0.1:3000/healthz
```

### مشکل: HSTS بعد از غیرفعال کردن HTTPS
```
علت: مرورگر HSTS را کش کرده
راه‌حل: منتظر بمانید (max-age) یا در مرورگر HSTS را پاک کنید
```

### مشکل: Mixed Content (محتوای ناامن)
```
علت: لینک به http:// در صفحه HTTPS
راه‌حل: همه URLها باید https:// یا // باشند
  sed -i 's|http://polasco-goli.example.com|https://yourdomain.com|g' frontend/*.html
```

### مشکل: Trusted Proxy
```
علت: TRUST_PROXY تنظیم نشده — IP همه کاربران یکی دیده می‌شود
راه‌حل: TRUST_PROXY=1 در .env
```

---

## چک‌لیست نهایی قبل از انتشار

- [ ] `NODE_ENV=production`
- [ ] `SITE_URL=https://yourdomain.com`
- [ ] `COOKIE_SECURE=true`
- [ ] `SESSION_SECRET` حداقل ۳۲ کاراکتر
- [ ] `TRUST_PROXY=1` (اگر پشت nginx/Cloudflare هستید)
- [ ] `ZARINPAL_MERCHANT_ID` تنظیم شده
- [ ] `SMS_API_KEY` تنظیم شده
- [ ] HTTPS کار می‌کند (SSL Labs: A)
- [ ] HTTP → HTTPS ریدایرکت می‌کند
- [ ] کوکی Secure flag دارد
- [ ] ورود با شماره موبایل کار می‌کند
- [ ] سبد خرید ذخیره می‌ماند
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

### Rate Limit روی nginx:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

location /api/ {
    limit_req zone=api burst=50 nodelay;
    proxy_pass http://127.0.0.1:3000;
}
```
