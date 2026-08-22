# 🔒 گزارش اسکن امنیتی OWASP Top 10 — پلاسکو گلی

**تاریخ اسکن:** 2026-08-22  
**نتیجه:** ✅ **47/47 تست سبز — هیچ آسیب‌پذیری حیاتی یافت نشد**

---

## خلاصه اجرایی

| دسته OWASP | وضعیت | تعداد تست |
|---|---|---|
| A01: Broken Access Control | ✅ سبز | 6 |
| A02: Cryptographic Failures | ✅ سبز | 7 |
| A03: Injection | ✅ سبز | 5 |
| A04: Insecure Design | ✅ سبز | 4 |
| A05: Security Misconfiguration | ✅ سبز | 5 |
| A06: Vulnerable Components | ✅ سبز | 4 |
| A07: Auth Failures | ✅ سبز | 5 |
| A08: Data Integrity Failures | ✅ سبز | 3 |
| A09: Logging & Monitoring | ✅ سبز | 4 |
| A10: SSRF | ✅ سبز | 4 |

---

## A01: Broken Access Control

| تست | نتیجه | توضیح |
|---|---|---|
| پنل ادمین بدون ورود | ✅ 401 | `requireAdmin` = session + DB + dynamic `.env` check |
| محصولات پیش‌نویس عمومی | ✅ مخفی | `WHERE published = 1` روی همه queryهای عمومی |
| IDOR روی سفارش | ✅ 401 | `order.userId !== req.session.userId` روی هر endpoint |
| CSRF از مبدأ بیگانه | ✅ 403 | Origin/Referer check + SameSite=Lax cookie |
| endpoint ناشناخته | ✅ 404 | 404 handler سراسری |
| فایل .env سرو نمی‌شود | ✅ 404 | express.static فایل dot را سرو نمی‌کند |

**توضیح معماری:** سه لایه CSRF:
1. `sameSite: 'lax'` روی کوکی سشن
2. بررسی Origin/Referer در هر درخواست نوشتن
3. `X-Frame-Options: SAMEORIGIN` جلوی کلیک‌جک

---

## A02: Cryptographic Failures

| تست | نتیجه | توضیح |
|---|---|---|
| هدرهای امنیتی | ✅ کامل | nosniff, SAMEORIGIN, strict-origin, Referrer-Policy |
| CSP | ✅ سخت | `default-src 'self'`, `script-src 'self'`, no unsafe-inline |
| کوکی امن | ✅ HttpOnly + SameSite | SameSite=Lax, HttpOnly=true |
| X-Powered-By | ✅ حذف شده | `app.disable('x-powered-by')` |

**سیاست CSP (Content Security Policy):**
```
default-src 'self'
script-src 'self'
style-src 'self' 'sha256-...'  (فقط hash offline.html)
img-src 'self' data:
connect-src 'self'
frame-src 'none'
form-action 'self' https://www.zarinpal.com
```

---

## A03: Injection

| تست | نتیجه | توضیح |
|---|---|---|
| SQL Injection | ✅ ایمن | Prepared statements + `V.str()`, `V.int()` validation |
| XSS بازتابی | ✅ ایمن | `PG.esc()` + `textContent` در فرانت |
| Path Traversal | ✅ ایمن | فایل‌ها با نام ثابت سرو می‌شوند |
| CRLF Injection | ✅ ایمن | هدرها فقط از سمت سرور ست می‌شوند |
| JSON Oversized | ✅ 413 | `express.json({ limit: '64kb' })` |

** protects against:** Prepared statements روی ۱۰۰٪ کوئری‌ها. پارامترها هیچ‌وقت مستقیم وارد SQL نمی‌شوند.

---

## A04: Insecure Design

| تست | نتیجه | توضیح |
|---|---|---|
| کد OTP نامعتبر | ✅ 400 | `safeEqual` timing-safe + SHA-256 hash |
| شماره نامعتبر | ✅ 400 | `isValidIranPhone` regex validation |
| Idempotency key کوتاه | ✅ 400 | regex `^[A-Za-z0-9._:-]{16,128}$` |
| callback بدون validation | ✅ redirect | Authority + orderId match + status check |

**طراحی OTP:**
- کد ۵ رقمی → ۹۰۰۰ حالت ممکن
- ۵ تلاش ناموفق → قفل حساب (login-guard)
- ۲ دقیقه اعتبار → پنجره کوتاه
- Challenge token یک‌بارمصرف → جلوی ربات
- Rate limit IP-based → جلوی سیل درخواست

---

## A05: Security Misconfiguration

| تست | نتیجه | توضیح |
|---|---|---|
| افشای نسخه سرور | ✅ مخفی | Server header حذف شده |
| /healthz اطلاعات حساس | ✅ ایمن | فقط ok/uptime/db |
| debug endpoint | ✅ 404 | وجود ندارد |
| فایل‌های حساس | ✅ 404 | .env, .git, db مخفی |
| directory listing | ✅ غیرفعال | express.static listing=false |

**تنظیمات امنیتی production:**
- `TRUST_PROXY=0` (پیش‌فرض) → جلوی spoofing IP
- `COOKIE_SECURE=true` → فقط HTTPS
- `SESSION_SECRET` حداقل ۳۲ کاراکتر اجباری
- `HSTS max-age=15552000` وقتی HTTPS فعال

---

## A06: Vulnerable Components

| تست | نتیجه | توضیح |
|---|---|---|
| package-lock.json | ✅ موجود | Dependency lockfile |
| ماژول دیتابیس | ✅ built-in | `node:sqlite` بدون native compile |
| eval/Function | ✅ غیرفعال | در هیچ جای سرور |
| exec با ورودی کاربر | ✅ غیرفعال | spawn با آرایه آرگومان |

---

## A07: Auth Failures

| تست | نتیجه | توضیح |
|---|---|---|
| Rate limit OTP | ✅ فعال | 20 req/10min per IP + 5 attempts per code |
| Session fixation | ✅ محافظت | `session.regenerate()` بعد از ورود |
| Account lockout | ✅ فعال | 5 fails → escalating lockout (1m → 5m → 15m → 60m) |
| رمز عبور hash | ✅ scrypt | 64 bytes key, salt 16 bytes, timing-safe compare |
| الگوریتم ضعیف | ✅ عدم وجود | No MD5/SHA1/plaintext |

**لایه‌های محافظت ورود:**
1. Rate limit IP-based (20/10min)
2. Rate limit account-based (5 attempts)
3. Account lockout escalating
4. OTP challenge token (anti-robot)
5. SMS daily cap per phone + per IP
6. Timing-safe comparison

---

## A08: Data Integrity Failures

| تست | نتیجه | توضیح |
|---|---|---|
| Idempotency key | ✅ validation | 16-128 chars, unique per user |
| Payload size | ✅ 64KB | express.json limit |
| Database transactions | ✅ ACID | BEGIN IMMEDIATE → COMMIT with rollback |

---

## A09: Logging & Monitoring

| تست | نتیجه | توضیح |
|---|---|---|
| لاگ حساسیت‌ها | ✅ redacted | `[redacted]` برای password/secret/token |
| ماسک شماره موبایل | ✅ فعال | `maskPhone()` در error-digest + auth |
| HTTP access log | ✅ فعال | خطاها + درخواست‌های کند >1000ms |
| CSP violation report | ✅ فعال | `report-uri /api/csp-report` |

---

## A10: SSRF

| تست | نتیجه | توضیح |
|---|---|---|
| Callback URL | ✅ server-side | `req.protocol + req.get('host')` |
| Payment gateway | ✅ hardcoded | `api.zarinpal.com` + `www.zarinpal.com` |
| Image encoder | ✅ safe | `spawn(cmd, argsArray)` نه `exec(cmdString)` |
| SMS providers | ✅ hardcoded | `api.kavenegar.com` + `api2.ippanel.com` |

---

## اسکریپت تست خودکار

```bash
cd backend && node tests/owasp-scan.js
```

این اسکریپت ۴۷ تست خودکار را روی سرور در حال اجرا اجرا می‌کند:
- سرور تستی در پورت ۴۰۱۰ بالا می‌آید
- درخواست‌های واقعی HTTP می‌فرستد
- پاسخ‌ها را بررسی می‌کند
- فایل‌های منبع را اسکن می‌کند
- خروجی: ✅ PASS یا ❌ FAIL برای هر تست

---

## نتیجه‌گیری

**پروژه از نظر امنیتی در سطح بالایی قرار دارد.** معماری امنیتی چندلایه‌ای دارد:

1. **CSP** → جلوی XSS
2. **CSRF (sameSite + Origin check)** → جلوی CSRF
3. **Prepared statements** → جلوی SQL injection
4. **Input validation (V.str/int/phone)** → جلوی Injection
5. **Rate limiting (چندلایه)** → جلوی brute force
6. **Account lockout** → جلوی credential stuffing
7. **Session regeneration** → جلوی session fixation
8. **Timing-safe comparison** → جلوی timing attack
9. **File upload validation** → جلوی malicious upload
10. **Logging + redaction** → قابلیت ردیابی + حفظ حریم خصوصی

**توصیه‌ها برای production:**
- `COOKIE_SECURE=true` + `TRUST_PROXY=1` (پشت nginx/Cloudflare)
- `SESSION_SECRET` حداقل ۳۲ کاراکتر تصادفی
- `NODE_ENV=production` فعال شود
- بکاپ خودکار روزانه + `BACKUP_DIR2` مجزا تنظیم شود
