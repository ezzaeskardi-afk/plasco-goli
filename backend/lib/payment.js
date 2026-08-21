// اتصال به درگاه پرداخت زرین‌پال (رایج‌ترین درگاه برای کسب‌وکارهای کوچک ایرانی).
//
// برای فعال‌سازی واقعی:
//   ۱. یک حساب زرین‌پال بسازید: https://www.zarinpal.com  (نیاز به کد ملی/شناسه ملی کسب‌وکار)
//   ۲. "کد پذیرندگی" (Merchant ID) رو از پنل زرین‌پال بردارید.
//   ۳. توی فایل .env این خط رو اضافه کنید:  ZARINPAL_MERCHANT_ID=کد-شما
//
// تا وقتی این متغیر تنظیم نشده، سیستم خودکار روی «حالت آزمایشی» می‌افته:
// پرداخت واقعی انجام نمی‌شه ولی کل مسیر (رفتن به درگاه، برگشت، تایید سفارش)
// دقیقاً همون‌طوری کار می‌کنه که با یک درگاه واقعی کار می‌کنه.
//
// نکته‌ی امنیتی مهم: در حالت واقعی (isLive)، authorityهای آزمایشی «TEST-»
// به هیچ عنوان پذیرفته نمی‌شوند — وگرنه هر کسی می‌توانست بدون پرداخت،
// سفارش خودش را «پرداخت‌شده» کند.

const ZARINPAL_MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID || '';
const isLive = Boolean(ZARINPAL_MERCHANT_ID);

const ZARINPAL_REQUEST_URL = 'https://api.zarinpal.com/pg/v4/payment/request.json';
const ZARINPAL_VERIFY_URL = 'https://api.zarinpal.com/pg/v4/payment/verify.json';
const ZARINPAL_STARTPAY_URL = 'https://www.zarinpal.com/pg/StartPay/';

const GATEWAY_TIMEOUT_MS = 15000;

// fetch با مهلت زمانی — اگر درگاه جواب ندهد، درخواستِ گیرکرده سرور را قفل نمی‌کند
async function fetchJson(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// مبلغ‌ها توی این پروژه به تومان ذخیره می‌شن.
async function requestPayment({ orderId, amountToman, description, callbackUrl }) {
  if (!isLive) {
    // حالت آزمایشی: یک "authority" جعلی می‌سازیم و مستقیم به صفحه‌ی برگشت هدایت می‌کنیم.
    const fakeAuthority = `TEST-${orderId}-${Date.now()}`;
    return {
      ok: true,
      testMode: true,
      authority: fakeAuthority,
      paymentUrl: `${callbackUrl}&Authority=${fakeAuthority}&Status=OK`
    };
  }

  try {
    const json = await fetchJson(ZARINPAL_REQUEST_URL, {
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount: amountToman,
      currency: 'IRT',
      description,
      callback_url: callbackUrl
    });

    if (json?.data?.code === 100 && json.data.authority) {
      return {
        ok: true,
        testMode: false,
        authority: json.data.authority,
        paymentUrl: ZARINPAL_STARTPAY_URL + json.data.authority
      };
    }
    return { ok: false, error: json?.errors || 'خطای نامشخص از درگاه پرداخت' };
  } catch (err) {
    return { ok: false, error: err.message || 'اتصال به درگاه پرداخت برقرار نشد' };
  }
}

async function verifyPayment({ authority, amountToman }) {
  const isTestAuthority = String(authority).startsWith('TEST-');

  // فقط وقتی درگاه واقعی «تنظیم نشده» authority آزمایشی پذیرفته می‌شود.
  if (!isLive && isTestAuthority) {
    return { ok: true, testMode: true, refId: `TEST-REF-${Date.now()}` };
  }
  // در حالت واقعی، authority آزمایشی = تلاش برای دور زدن پرداخت
  if (isLive && isTestAuthority) {
    return { ok: false, error: 'authority نامعتبر', retriable: false };
  }
  if (!isLive) {
    // درگاه پیکربندی نشده و authority هم آزمایشی نیست: نمی‌توانیم بپرسیم.
    // retriable چون این یک «نه» از درگاه نیست، یک نداشتنِ ابزارِ پرسیدن است.
    return { ok: false, error: 'درگاه پرداخت پیکربندی نشده', retriable: true };
  }

  try {
    const json = await fetchJson(ZARINPAL_VERIFY_URL, {
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount: amountToman,
      authority
    });

    // کد 100 = تایید موفق، کد 101 = قبلاً تایید شده
    if (json?.data?.code === 100 || json?.data?.code === 101) {
      return { ok: true, testMode: false, refId: json.data.ref_id };
    }
    // پاسخِ درست‌شکل از درگاه رسید و می‌گوید «پرداخت نشده» → حکمِ قطعی
    return { ok: false, error: json?.errors || 'پرداخت تایید نشد', retriable: false };
  } catch (err) {
    // به درگاه نرسیدیم (قطعیِ شبکه، تایم‌اوت، JSONِ خراب). این «پرداخت نشده»
    // نیست، «نمی‌دانیم» است. تفاوتش برای lib/reconcile.js حیاتی است: آنجا
    // نباید سفارشی را به‌خاطر یک قطعیِ گذرا باطل کند و پولِ مشتری را بخورد.
    return { ok: false, error: err.message || 'اتصال به درگاه پرداخت برقرار نشد', retriable: true };
  }
}

/* ---------- استعلامِ تکلیفِ یک پرداختِ رهاشده ----------
   این تابع برای lib/reconcile.js است، نه برای مسیرِ برگشتِ مشتری. تفاوتش با
   verifyPayment یک چیزِ کوچک ولی حیاتی است: **هرگز در حالت آزمایشی «پرداخت شد»
   نمی‌گوید.**

   چرا: verifyPayment وقتی درگاه واقعی تنظیم نشده باشد، هر authorityِ «-TEST» را
   تایید می‌کند — و درست هم هست، چون آنجا مشتری تازه از صفحه‌ی جعلیِ پرداخت
   برگشته و کلِ هدفِ حالتِ آزمایشی همین است. ولی کارِ تطبیق سراغِ سفارش‌هایی
   می‌رود که مشتری **برنگشته**. اگر همان منطق را وام می‌گرفتیم، هر سبدِ
   رهاشده‌ی آزمایشی نیم‌ساعت بعد خودبه‌خود «پرداخت‌شده» می‌شد: موجودی کم،
   فروشِ الکی در داشبورد، و پیامکِ «سفارش شما ثبت شد» برای کسی که هیچ نداده.

   سه حکمِ ممکن — و تفاوتشان کلِ ارزشِ این ماژول است:
     paid    → درگاه گفت پول گرفته شده (کد ۱۰۰ یا ۱۰۱). سفارش زنده می‌شود.
     unpaid  → درگاه پاسخِ درست‌شکل داد و گفت نه. باطل کردن امن است.
     unknown → به درگاه نرسیدیم. **نمی‌دانیم.** دست نمی‌زنیم و بعداً می‌پرسیم.

   نکته: خودِ verify در زرین‌پال هم «پرسیدن» است و هم «تسویه». تراکنشی که
   پرداخت شده ولی هرگز verify نشود، بعد از مدتی به حسابِ مشتری برمی‌گردد. پس
   این استعلام صرفاً خبررسانی نیست؛ همان کاری است که باید انجام می‌شد. */
async function inquirePayment({ authority, amountToman }) {
  const isTestAuthority = String(authority).startsWith('TEST-');

  if (!isLive) {
    // درگاهی نداریم که از آن بپرسیم. در حالت آزمایشی، سفارشی که مشتری از
    // صفحه‌ی برگشت رد نشده یعنی رهایش کرده — همان رفتارِ قبلی.
    return { verdict: 'unpaid', reason: 'حالت آزمایشی — درگاه واقعی تنظیم نشده' };
  }
  if (isTestAuthority) {
    // درگاهِ واقعی داریم ولی authority آزمایشی است؛ یعنی این سفارش از دوره‌ی
    // آزمایش مانده. پولی در کار نبوده.
    return { verdict: 'unpaid', reason: 'authority آزمایشی روی درگاه واقعی' };
  }

  const r = await verifyPayment({ authority, amountToman });
  if (r.ok) return { verdict: 'paid', refId: r.refId };
  if (r.retriable) return { verdict: 'unknown', reason: r.error };
  return { verdict: 'unpaid', reason: r.error };
}

module.exports = { requestPayment, verifyPayment, inquirePayment, isLive };
