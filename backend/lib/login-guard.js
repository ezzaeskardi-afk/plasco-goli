// قفلِ حساب بعد از تلاش‌های ناموفقِ پیاپی
//
// چرا وقتی rateLimit داریم باز هم این لازم است:
//   rateLimit روی «آدرس IP» می‌شمارد. دو سوراخ دارد که هیچ‌کدام نظری نیست:
//
//   ۱) مهاجم IP عوض می‌کند. با یک گوشیِ همراه، هر بار Airplane-mode زدن یک IP
//      تازه می‌دهد؛ با پروکسیِ ارزان، هزارتا. آن‌وقت رمزِ شماره‌ی مدیر را
//      بی‌نهایت بار می‌شود امتحان کرد و شمارنده هیچ‌وقت پر نمی‌شود.
//
//   ۲) برعکسش هم بد است: در ایران اپراتورها CGNAT دارند، یعنی هزاران مشترک
//      پشت یک IP هستند. اگر سقفِ IP را پایین بیاوریم تا سوراخ اول بسته شود،
//      یک نفر که رمزش را فراموش کرده، همه‌ی همسایه‌هایش را هم قفل می‌کند.
//
//   راه‌حل همان چیزی است که بانک‌ها می‌کنند: شمارنده روی «حساب» باشد نه روی
//   خط اینترنت. هر شماره‌ی موبایل سهمیه‌ی خودش را دارد.
//
// چرا در حافظه و نه در دیتابیس: این داده‌ی گذرا است و عمرش چند دقیقه است.
// نوشتنش در SQLite یعنی یک write به‌ازای هر رمزِ غلط — دقیقاً همان چیزی که
// مهاجم می‌خواهد. با ریستارتِ سرور پاک می‌شود و آن هم اشکالی ندارد: ریستارت
// دستِ مدیر است، نه دستِ مهاجم.

// ۵ تلاشِ ناموفق، بعدش قفل. چرا ۵ و نه ۳: آدمِ واقعی که رمزش را نصفه یادش
// است، دو-سه بار غلط می‌زند؛ ۳ یعنی مشتریِ واقعی را زیاد قفل می‌کنیم.
const MAX_FAILS = 5;
// پله‌های قفل. تکرارِ حمله را گران‌تر می‌کند بدون اینکه کاربرِ فراموش‌کار را
// یک‌ساعت بیرون بگذارد: اول ۱ دقیقه، بعد ۵، بعد ۱۵، بعد ۶۰.
const LOCK_STEPS_MS = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3];
// اگر مدتی خبری نبود، پرونده بسته می‌شود؛ وگرنه کسی که سه ماه پیش دو بار
// غلط زده، امروز با یک اشتباه قفل می‌شود.
const FORGET_MS = 60 * 60e3;

const attempts = new Map(); // phone → { fails, lockedUntil, level, seen }

// هرس دوره‌ای تا Map با شماره‌های قدیمی بی‌نهایت رشد نکند (نشتِ حافظه).
// unref تا این تایمر جلوی بسته‌شدن پروسه را در تست‌ها نگیرد.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) {
    if (now - v.seen > FORGET_MS && now > (v.lockedUntil || 0)) attempts.delete(k);
  }
}, 10 * 60e3);
if (sweeper.unref) sweeper.unref();

// آیا این حساب همین حالا قفل است؟ اگر بله، چند ثانیه مانده.
function lockState(key) {
  const rec = attempts.get(String(key || ''));
  if (!rec) return { locked: false, retryAfter: 0, fails: 0 };
  const left = (rec.lockedUntil || 0) - Date.now();
  if (left > 0) return { locked: true, retryAfter: Math.ceil(left / 1000), fails: rec.fails };
  return { locked: false, retryAfter: 0, fails: rec.fails };
}

// یک تلاشِ ناموفق را ثبت می‌کند و می‌گوید آیا حساب همین حالا قفل شد.
function registerFail(key) {
  const k = String(key || '');
  const now = Date.now();
  const rec = attempts.get(k) || { fails: 0, lockedUntil: 0, level: 0, seen: now };
  // اگر از آخرین تلاش خیلی گذشته، شمارنده تازه شروع می‌شود
  if (now - rec.seen > FORGET_MS) { rec.fails = 0; rec.level = 0; }
  rec.fails += 1;
  rec.seen = now;
  if (rec.fails >= MAX_FAILS) {
    const step = LOCK_STEPS_MS[Math.min(rec.level, LOCK_STEPS_MS.length - 1)];
    rec.lockedUntil = now + step;
    rec.level += 1;
    rec.fails = 0; // شمارنده برای دورِ بعد صفر می‌شود، ولی level یادش می‌ماند
    attempts.set(k, rec);
    return { locked: true, retryAfter: Math.ceil(step / 1000) };
  }
  attempts.set(k, rec);
  return { locked: false, remaining: MAX_FAILS - rec.fails };
}

// ورود موفق ⇒ پرونده پاک. کسی که رمز درست را بلد است، نباید تاوانِ
// تلاش‌های ناموفقِ قبلی‌اش را بدهد.
function registerSuccess(key) { attempts.delete(String(key || '')); }

// فقط برای تست: همه‌چیز را صفر می‌کند
function _resetAll() { attempts.clear(); }

// متن فارسیِ «چقدر صبر کن» — عددِ ثانیه‌ی خام به درد کاربر نمی‌خورد
function waitText(seconds) {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} ساعت`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} دقیقه`;
  return `${seconds} ثانیه`;
}

module.exports = { lockState, registerFail, registerSuccess, waitText, _resetAll, MAX_FAILS };
