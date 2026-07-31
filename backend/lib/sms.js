// sms.js — ارسال پیامک (کد ورود + خبر سفارش جدید به مدیر)
//
// حالت پیش‌فرض: اگر SMS_API_KEY در .env خالی باشد، سایت در «حالت آزمایشی» می‌ماند
// و کد فقط در کنسول سرور چاپ می‌شود (بدون هزینه، برای تست).
//
// حالت واقعی: کافی است در .env این‌ها را پر کنید:
//   SMS_PROVIDER=kavenegar         (یا ippanel — پیش‌فرض kavenegar)
//   SMS_API_KEY=...                کلید API از پنل سرویس
//   SMS_OTP_TEMPLATE=login         نام الگوی «وریفای» در پنل کاوه‌نگار
//   SMS_SENDER=10008663            (فقط برای پیامک متنی به مدیر؛ اختیاری)
//
// نکته‌ی مهم: در ایران ارسال کد ورود باید از مسیر «وریفای/الگو» انجام شود،
// چون پیامک تبلیغاتی معمولی برای بعضی شماره‌ها فیلتر می‌شود.

const log = require('./logger');

const TIMEOUT_MS = 10000;

function provider() {
  return String(process.env.SMS_PROVIDER || 'kavenegar').trim().toLowerCase();
}
function isConfigured() {
  return Boolean(process.env.SMS_API_KEY);
}

// fetch با مهلت زمانی — سرویس پیامک نباید صفحه‌ی ورود کاربر را معطل نگه دارد
async function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* پاسخ JSON نبود */ }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return data ?? {};
  } finally {
    clearTimeout(timer);
  }
}

// ---------- کاوه‌نگار ----------
async function kavenegarVerify(phone, code) {
  const key = encodeURIComponent(process.env.SMS_API_KEY);
  const template = encodeURIComponent(process.env.SMS_OTP_TEMPLATE || 'login');
  const url = `https://api.kavenegar.com/v1/${key}/verify/lookup.json`
    + `?receptor=${encodeURIComponent(phone)}&token=${encodeURIComponent(code)}&template=${template}`;
  const data = await fetchJson(url);
  const status = data?.return?.status;
  if (status !== 200) throw new Error(`Kavenegar status ${status}: ${data?.return?.message || 'unknown'}`);
  return data;
}

async function kavenegarText(phone, message) {
  const key = encodeURIComponent(process.env.SMS_API_KEY);
  const url = `https://api.kavenegar.com/v1/${key}/sms/send.json`;
  const body = new URLSearchParams({ receptor: phone, message });
  if (process.env.SMS_SENDER) body.set('sender', process.env.SMS_SENDER);
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const status = data?.return?.status;
  if (status !== 200) throw new Error(`Kavenegar status ${status}: ${data?.return?.message || 'unknown'}`);
  return data;
}

// ---------- ippanel (نسخه‌ی ۲) ----------
async function ippanelPattern(phone, code) {
  const patternCode = process.env.SMS_OTP_TEMPLATE || 'login';
  const data = await fetchJson('https://api2.ippanel.com/api/v1/sms/pattern/normal/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `AccessKey ${process.env.SMS_API_KEY}` },
    body: JSON.stringify({
      code: patternCode,
      sender: process.env.SMS_SENDER || '+983000505',
      recipient: phone,
      variable: { code: String(code) }
    })
  });
  if (data?.status && data.status !== 'OK') throw new Error(`ippanel: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function ippanelText(phone, message) {
  const data = await fetchJson('https://api2.ippanel.com/api/v1/sms/send/webservice/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `AccessKey ${process.env.SMS_API_KEY}` },
    body: JSON.stringify({
      sender: process.env.SMS_SENDER || '+983000505',
      recipient: [phone],
      message
    })
  });
  if (data?.status && data.status !== 'OK') throw new Error(`ippanel: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// ---------- رابط بیرونی ----------
// سقف کل پیامکِ ورود در روز — سد مقابل حمله‌ای که با هزاران درخواست کد،
// قبض پیامک فروشگاه را نجومی می‌کند. پیامک‌های وضعیت سفارش مستثنا هستند.
const SMS_DAILY_CAP = Number(process.env.SMS_DAILY_CAP) || 300;

async function sendOtpSms(phone, code) {
  if (!isConfigured()) {
    console.log(`\n[TEST MODE - no real SMS] Login code for ${phone}: ${code}\n`);
    return { ok: true, mode: 'test' };
  }

  // سقف قبل از ارسال خوانده می‌شود و شمارنده فقط بعد از ارسال موفق بالا می‌رود.
  // اگر سرویس پیامک موقتاً خراب باشد، تلاش‌های ناموفق ظرفیت امروز را نمی‌سوزانند
  // (وگرنه بعد از رفع خرابی هم تا آخر روز کسی نمی‌توانست وارد شود).
  const { getSmsCount, bumpSmsCounter } = require('./db');
  if (getSmsCount() >= SMS_DAILY_CAP) {
    log.warn(`SMS daily cap (${SMS_DAILY_CAP}) reached - OTP for ${phone} not sent`);
    return { ok: false, mode: 'live', error: 'ظرفیت ارسال پیامک امروز پر شده؛ لطفاً کمی بعد دوباره تلاش کنید' };
  }

  try {
    if (provider() === 'ippanel') await ippanelPattern(phone, code);
    else await kavenegarVerify(phone, code);
    bumpSmsCounter();   // فقط پیامکی که واقعاً رفت، از سقف کم می‌شود
    log.info(`OTP SMS sent to ${phone} via ${provider()}`);
    return { ok: true, mode: 'live' };
  } catch (err) {
    // شماره‌ی کاربر در لاگ می‌ماند ولی کد هرگز لاگ نمی‌شود
    log.error(`OTP SMS failed for ${phone} via ${provider()}`, err);
    return { ok: false, mode: 'live', error: err.message };
  }
}

// خبر «سفارش جدید» برای مدیر فروشگاه — تا لازم نباشد مدام پنل را چک کند.
// شماره(ها) از ADMIN_PHONE در .env خوانده می‌شود؛ خطای پیامک نباید سفارش را خراب کند.
async function notifyAdminNewOrder(order) {
  const admins = String(process.env.ADMIN_PHONE || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!admins.length) return { ok: false, reason: 'no-admin-phone' };

  const text = `سفارش جدید #${order.id} به مبلغ ${Number(order.total || 0).toLocaleString('fa-IR')} تومان ثبت شد. | پلاسکو گلی`;

  if (!isConfigured()) {
    for (const adminPhone of admins) {
      console.log(`[TEST MODE - no real SMS] Order alert for ${adminPhone}: order #${order.id}`);
    }
    return { ok: true, mode: 'test' };
  }

  const results = await Promise.allSettled(admins.map(adminPhone =>
    provider() === 'ippanel' ? ippanelText(adminPhone, text) : kavenegarText(adminPhone, text)
  ));
  results.forEach((r, i) => {
    if (r.status === 'rejected') log.error(`Order-alert SMS failed for ${admins[i]}`, r.reason);
  });

  return { ok: results.some(r => r.status === 'fulfilled'), mode: 'live' };
}

// ---------- پیامک وضعیت سفارش به خود مشتری ----------
// حس «فروشگاه واقعی»: مشتری بدون چک‌کردن سایت می‌فهمد سفارشش کجاست.
// خطای پیامک هرگز جریان سفارش را خراب نمی‌کند (async و بدون await صدا زده می‌شود).
const CUSTOMER_SMS = {
  paid: (o) => `پلاسکو گلی\nسفارش #${o.id} ثبت شد و به‌زودی آماده‌ی ارسال می‌شود.\nپیگیری: بخش «حساب کاربری» سایت`,
  shipped: (o) => `پلاسکو گلی\nسفارش #${o.id} ارسال شد${o.trackingCode ? `\nکد رهگیری پستی: ${o.trackingCode}` : ''}`,
  delivered: (o) => `پلاسکو گلی\nسفارش #${o.id} تحویل شد. نوش جان‌تان باشد!\nتا ۷ روز مهلت مرجوعی دارید.`,
  canceled: (o) => `پلاسکو گلی\nسفارش #${o.id} لغو شد. بازگشت وجه با هماهنگی انجام می‌شود.`,
  returned: (o) => `پلاسکو گلی\nمرجوعی سفارش #${o.id} تأیید شد. بازگشت وجه با هماهنگی انجام می‌شود.`
};

async function notifyCustomerOrderStatus(order, phone) {
  const make = CUSTOMER_SMS[order?.status];
  if (!make || !phone) return { ok: false, reason: 'nothing-to-send' };
  const text = make(order);

  if (!isConfigured()) {
    console.log(`[TEST MODE - no real SMS] Status SMS for ${phone} (order #${order.id} -> ${order.status})`);
    return { ok: true, mode: 'test' };
  }

  try {
    if (provider() === 'ippanel') await ippanelText(phone, text);
    else await kavenegarText(phone, text);
    log.info(`Status SMS (${order.status}) sent to customer for order #${order.id}`);
    return { ok: true, mode: 'live' };
  } catch (err) {
    log.error(`Status SMS failed for order #${order.id}`, err);
    return { ok: false, mode: 'live', error: err.message };
  }
}

// «موجود شد» — برای مشتری‌هایی که روی کالای ناموجود دکمه‌ی «خبرم کن» را زده‌اند
async function notifyStockAvailable(product, phones) {
  const list = (phones || []).filter(Boolean);
  if (!product || !list.length) return { ok: false, reason: 'nothing-to-send' };
  const text = `پلاسکو گلی\n«${product.title}» دوباره موجود شد!\nتا تمام نشده سفارش‌تان را ثبت کنید.`;

  if (!isConfigured()) {
    list.forEach(p => console.log(`[TEST MODE - no real SMS] Restock SMS for ${p}: ${product.title}`));
    return { ok: true, mode: 'test' };
  }

  const results = await Promise.allSettled(list.map(p =>
    provider() === 'ippanel' ? ippanelText(p, text) : kavenegarText(p, text)
  ));
  results.forEach((r, i) => {
    if (r.status === 'rejected') log.error(`Restock SMS failed for ${list[i]}`, r.reason);
  });
  return { ok: results.some(r => r.status === 'fulfilled'), mode: 'live' };
}

module.exports = { sendOtpSms, notifyAdminNewOrder, notifyCustomerOrderStatus, notifyStockAvailable };
