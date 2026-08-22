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
//
// ...ولی این استدلال فقط در حالتِ تک‌پروسه برقرار است. اگر CLUSTER_ENABLED
// روشن شود، هر worker یک Map جدا دارد و شمارنده‌ی «۵ تلاش» می‌شود «۵ تلاش
// برای هر worker». با ۸ هسته یعنی ۴۰ رمز — و همان سوراخی که خطوط ۴ تا ۱۵
// برای بستنش نوشته شده‌اند دوباره باز می‌شود، فقط این بار بی‌صدا.
//
// پس انتخاب شرطی است و makeSharedStore همین کار را می‌کند: در تک‌پروسه همان
// Map (پس استدلالِ بالا دست‌نخورده می‌ماند و صفر I/O اضافه)، و در کلاستر یک
// جدولِ SQLite مشترک. آن‌جا نگرانیِ «هر تلاش یک write» بی‌اثر است چون
// rate limiter هم از قبل به‌ازای هر درخواست می‌نویسد.

// ۵ تلاشِ ناموفق، بعدش قفل. چرا ۵ و نه ۳: آدمِ واقعی که رمزش را نصفه یادش
// است، دو-سه بار غلط می‌زند؛ ۳ یعنی مشتریِ واقعی را زیاد قفل می‌کنیم.
const MAX_FAILS = 5;
// پله‌های قفل. تکرارِ حمله را گران‌تر می‌کند بدون اینکه کاربرِ فراموش‌کار را
// یک‌ساعت بیرون بگذارد: اول ۱ دقیقه، بعد ۵، بعد ۱۵، بعد ۶۰.
const LOCK_STEPS_MS = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3];
// اگر مدتی خبری نبود، پرونده بسته می‌شود؛ وگرنه کسی که سه ماه پیش دو بار
// غلط زده، امروز با یک اشتباه قفل می‌شود.
const FORGET_MS = 60 * 60e3;

const { makeSharedStore } = require('./shared-state');

// phone → { fails, lockedUntil, level, seen }
//
// عمرِ هر پرونده: تا وقتی که هم FORGET_MS از آخرین تلاش گذشته باشد و هم قفل
// تمام شده باشد. چون بلندترین پله‌ی قفل (۶۰ دقیقه) با FORGET_MS برابر است،
// max همیشه جوابِ درست را می‌دهد. هرس و سقفِ حافظه هم داخل انبارک است.
const attempts = makeSharedStore('login-guard', {
  ttlMs: FORGET_MS,
  maxKeys: 50000,
  sweepMs: 10 * 60e3,
});
const ttlFor = (rec) => Math.max(FORGET_MS, (rec.lockedUntil || 0) - Date.now());

// آیا این حساب همین حالا قفل است؟ اگر بله، چند ثانیه مانده.
function lockState(key) {
  const rec = attempts.get(String(key || ''));
  if (!rec) return { locked: false, retryAfter: 0, fails: 0 };
  const left = (rec.lockedUntil || 0) - Date.now();
  if (left > 0) return { locked: true, retryAfter: Math.ceil(left / 1000), fails: rec.fails };
  return { locked: false, retryAfter: 0, fails: rec.fails };
}

// یک تلاشِ ناموفق را ثبت می‌کند و می‌گوید آیا حساب همین حالا قفل شد.
//
// خواندن-تغییر-نوشتن داخل mutate انجام می‌شود چون در کلاستر باید اتمیک باشد:
// دو worker که هم‌زمان «۴» را می‌خوانند و هر دو «۵» می‌نویسند، یک تلاشِ
// ناموفق را گم می‌کنند و مهاجم یک حدسِ رایگان می‌گیرد.
function registerFail(key) {
  let result;
  attempts.mutate(String(key || ''), (prev) => {
    const now = Date.now();
    const rec = prev || { fails: 0, lockedUntil: 0, level: 0, seen: now };
    // اگر از آخرین تلاش خیلی گذشته، شمارنده تازه شروع می‌شود
    if (now - rec.seen > FORGET_MS) { rec.fails = 0; rec.level = 0; }
    rec.fails += 1;
    rec.seen = now;
    if (rec.fails >= MAX_FAILS) {
      const step = LOCK_STEPS_MS[Math.min(rec.level, LOCK_STEPS_MS.length - 1)];
      rec.lockedUntil = now + step;
      rec.level += 1;
      rec.fails = 0; // شمارنده برای دورِ بعد صفر می‌شود، ولی level یادش می‌ماند
      result = { locked: true, retryAfter: Math.ceil(step / 1000) };
    } else {
      result = { locked: false, remaining: MAX_FAILS - rec.fails };
    }
    return rec;
  }, ttlFor);
  return result;
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
