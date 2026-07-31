// ============================================================
// تقویم شمسی — فقط آن‌قدری که گزارشِ ماهانه لازم دارد.
//
// چرا اصلاً لازم شد: SQLite تقویم شمسی نمی‌شناسد، پس
// `strftime('%Y-%m', ...)` ماه‌های **میلادی** می‌دهد. روی داده‌ی واقعیِ همین
// مغازه، همه‌ی سفارش‌ها بین ۱۸ تا ۳۰ ژوئیه‌ی ۲۰۲۶ بودند؛ گروه‌بندی میلادی همه را
// یک ماه («۲۰۲۶-۰۷») نشان می‌داد، در حالی که برای صاحب مغازه این‌ها دو ماهِ جدا
// هستند: تیر (تا ۲۲ ژوئیه) و مرداد (از ۲۳ ژوئیه). یعنی گزارشِ میلادی دقیقاً همان
// چیزی را که پرسیده می‌شود («این ماه چقدر فروختم؟») نمی‌داد.
//
// چرا الگوریتمِ تبدیل ننوشتم: Node ۲۲ با ICU کامل می‌آید و خودش تقویم فارسی دارد.
// یک الگوریتمِ دست‌ساز باید سال‌های کبیسه‌ی شمسی را هم درست بدهد و اشتباهش سال‌ها
// بعد و بی‌صدا لو می‌رود. اگر روزی ICU کوچک بود، `available()` خبر می‌دهد و
// گزارش به ماه میلادی برمی‌گردد (نه اینکه پنل خطا بدهد).
//
// نکته‌ی منطقه‌ی زمانی: هیچ‌جا `timeZone` را دستی ست نمی‌کنیم. دیتابیس با
// `date(created_at,'localtime')` گروه می‌شود، یعنی منطقه‌ی زمانیِ سیستم‌عامل؛ اگر
// این‌جا Asia/Tehran را سفت می‌کردیم، روی سروری با ساعتِ دیگر مرزِ ماه با مرزِ
// روزِ SQLite یکی نمی‌شد و سفارش‌های بامدادِ اولِ ماه در ماهِ قبل می‌افتادند.
// ============================================================

const FA_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

// `en-u-ca-persian` عمداً انگلیسی است تا ارقامِ خروجی لاتین باشند و
// `Number()` رویشان کار کند؛ اگر `fa-IR` می‌گذاشتیم «۱۴۰۵» می‌داد که NaN است.
let fmt = null;
try {
  fmt = new Intl.DateTimeFormat('en-u-ca-persian', {
    year: 'numeric', month: 'numeric', day: 'numeric'
  });
} catch (e) { fmt = null; }

// آیا واقعاً تقویم فارسی داریم؟ روی نسخه‌های small-ICU، درخواستِ تقویمِ ناشناخته
// خطا نمی‌دهد بلکه بی‌صدا میلادی برمی‌گرداند. پس به‌جای اعتماد به نبودِ خطا،
// خروجی را می‌سنجیم: سالِ شمسیِ امروز باید چهاررقمیِ حدود ۱۴۰۰ باشد، نه ۲۰۲۶.
let ok = false;
try {
  const y = Number(fmt.formatToParts(new Date()).find(p => p.type === 'year').value);
  ok = Number.isFinite(y) && y > 1200 && y < 1700;
} catch (e) { ok = false; }

function available() { return ok; }

// اجزای تاریخ شمسیِ یک لحظه: { jy, jm, jd }
function parts(date) {
  const p = fmt.formatToParts(date);
  const get = (t) => Number(p.find(x => x.type === t).value);
  return { jy: get('year'), jm: get('month'), jd: get('day') };
}

// تاریخِ محلی به شکل YYYY-MM-DD میلادی — دقیقاً همان قالبی که
// `date(created_at,'localtime')` در SQLite می‌سازد، پس با هم قابل مقایسه‌اند.
// از `toISOString()` استفاده نمی‌کنیم چون آن UTC می‌دهد و در ایران ۳:۳۰ ساعت
// عقب‌تر است، یعنی سفارش‌های بامداد یک روز عقب می‌افتادند.
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// نامِ فارسیِ ماه از شماره‌ی ۱..۱۲
function monthName(jm) { return FA_MONTHS[jm - 1] || String(jm); }

/* شروعِ `count` ماهِ گذشته (شاملِ ماهِ جاری) — از جدید به قدیم.
   روشِ کار عمداً «شمردنِ روز» است نه محاسبه‌ی کبیسه: روزِ اولِ ماهِ جاری =
   امروز منهای (jd-1) روز. بعد یک روز عقب‌تر یعنی آخرین روزِ ماهِ قبل، و دوباره
   همان کار. این‌طور هر چه ICU درباره‌ی کبیسه می‌داند خودبه‌خود رعایت می‌شود.

   ساعت روی ظهر ست می‌شود تا اگر روزی کشوری ساعتِ تابستانی داشت،
   جمع/تفریقِ روز از مرزِ نیمه‌شب رد نشود (ایران از ۱۴۰۱ ساعتِ تابستانی ندارد،
   ولی این کد نباید به آن وابسته باشد). */
function monthStarts(count) {
  const out = [];
  let cur = new Date();
  cur.setHours(12, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const { jy, jm, jd } = parts(cur);
    const start = new Date(cur);
    start.setDate(start.getDate() - (jd - 1));
    out.push({ jy, jm, name: monthName(jm), start, startIso: isoLocal(start) });
    cur = new Date(start);
    cur.setDate(cur.getDate() - 1); // آخرین روزِ ماهِ قبل
  }
  return out;
}

/* همان کار برای تقویم میلادی — مسیرِ پشتیبان وقتی ICU فارسی ندارد.
   شکلِ خروجی عمداً یکسان است تا بقیه‌ی کد شاخه‌بندی نداشته باشد. */
function gregorianMonthStarts(count) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 12, 0, 0, 0);
    out.push({
      jy: start.getFullYear(), jm: start.getMonth() + 1,
      name: String(start.getMonth() + 1), start, startIso: isoLocal(start)
    });
  }
  return out;
}

module.exports = { available, parts, isoLocal, monthName, monthStarts, gregorianMonthStarts, FA_MONTHS };
