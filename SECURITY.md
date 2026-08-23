# گزارشِ آسیب‌پذیری

اگر ایرادِ امنیتی در این پروژه پیدا کردید، ممنون می‌شویم خبر بدهید — ولی
**نه با issueِ عمومی**. issue همان لحظه برای همه دیده می‌شود و تا وقتی وصله
نرسیده، فقط نقشه‌ی حمله را رایگان پخش می‌کند.

## راهِ درست

۱. **گزارشِ خصوصیِ گیت‌هاب** (ساده‌ترین راه)
   در همین مخزن → تبِ **Security** → **Report a vulnerability**.
   گزارش خصوصی می‌ماند و فقط مالکِ مخزن می‌بیندش.

۲. **مسیرهای `security.txt`**
   طبقِ RFC 9116 در `frontend/.well-known/security.txt` نگه داشته می‌شود:

   | فیلد | مقدار |
   |---|---|
   | Contact | `https://polasco-goli.ir/contact` |
   | Policy | `https://polasco-goli.ir/terms.html` |
   | Preferred-Languages | فارسی، انگلیسی |

## در گزارش چه بنویسید

هر چه دقیق‌تر، وصله زودتر می‌رسد:

- کدام نسخه/کامیت را آزمودید
- مسیرِ بازتولید، قدم‌به‌قدم — درخواستِ خام (`curl`) خیلی کمک می‌کند
- اثرِ واقعی: چه چیزی خوانده، نوشته یا دور زده می‌شود
- اگر PoC دارید، همان‌جا پیوست کنید

## قرارِ ما

- **تأییدِ دریافت:** تا ۷۲ ساعت
- **ارزیابیِ اولیه و برنامه‌ی وصله:** تا ۷ روز
- **افشا:** بعد از رسیدنِ وصله، هماهنگ با خودِ گزارش‌دهنده

این یک پروژه‌ی تجاریِ کوچک است و **برنامه‌ی جایزه (bug bounty) ندارد**. اما اگر
دوست داشته باشید، اسمتان در یادداشتِ همان وصله ثبت می‌شود.

## دامنه‌ی گزارش

**در دامنه:**
احراز هویت و نشست · ورودِ مدیر · مسیرِ آپلودِ عکس · SQL و تزریق · XSS و CSP ·
CSRF · افشای داده‌ی مشتری (شماره، آدرس، سفارش) · دور زدنِ سقفِ نرخ · گرفتنِ
دسترسیِ مدیر · مسیرِ پرداخت

**بیرون از دامنه:**
- خروجیِ اسکنرِ خودکار بدونِ اثرِ اثبات‌شده
- نبودنِ هدرهای امنیتیِ اختیاری، بی‌نشان‌دادنِ حمله‌ی واقعی
- گزارشِ حملهٔ محرومیت از سرویس (DoS) و بارگذاریِ سنگین
- مهندسیِ اجتماعی روی کارکنان یا مشتری
- ایرادِ سرویس‌های بیرونی (زرین‌پال، سرویسِ پیامک) — به خودشان گزارش شود
- نسخه‌ی قدیمیِ وابستگی‌ها بدونِ مسیرِ بهره‌برداریِ قابلِ اجرا در همین پروژه

## پیش از گزارش، این‌ها را می‌دانیم

این مخزن دو اسکنرِ خودکارِ خودش را دارد و هر دو سبزند:

```bash
cd backend
node tests/owasp-scan.js       # ۴۷ بررسیِ OWASP Top 10
node tests/security.js         # ۴۵ تستِ آپلود، CSRF، جعل IP، سقفِ نرخ
npm run test:secrets           # نگهبانِ مرزِ راز
```

`backend/SECURITY-REPORT.md` جزئیاتِ هر ده دسته‌ی OWASP را دارد. اگر گزارشتان
چیزی است که این‌ها می‌سنجند، لطفاً بگویید کدام بررسی را دور می‌زند.

---

# Reporting a vulnerability (English)

Please **do not open a public issue**. Use GitHub's private reporting:
**Security → Report a vulnerability** in this repository, or the contact
listed in `frontend/.well-known/security.txt` (RFC 9116).

Include the commit you tested, step-by-step reproduction (a raw `curl` is
ideal), and the concrete impact. We acknowledge within 72 hours and aim to
share a remediation plan within 7 days. Disclosure is coordinated with you
after a fix ships. There is no bug bounty — this is a small commercial
project — but you will be credited in the fix.

Out of scope: unproven scanner output, missing optional headers with no
demonstrated attack, DoS/volumetric testing, social engineering, and issues
in third-party services (payment gateway, SMS provider).
