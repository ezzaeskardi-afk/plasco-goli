/* ============================================================
   error-digest.js — خلاصه‌ی خطاهای سرور برای بخشِ «خطاها»ی پنل
   ------------------------------------------------------------
   لاگ‌ها از قبل در `logs/error-*.log` نوشته می‌شدند، ولی برای خواندنشان باید
   با SSH یا Remote Desktop می‌رفتی سرِ سرور. عملاً یعنی هیچ‌وقت خوانده نمی‌شدند.

   **چرا خامش را نشان نمی‌دهیم:** یک خطِ لاگ حدود ۱۵۰۰ کاراکتر است که ۱۴۰۰
   کاراکترش stack traceِ داخلی express است. صاحبِ مغازه از این چیزی نمی‌فهمد و
   مهم‌تر: همان خطا اگر ۲۰۰ بار تکرار شده باشد، ۲۰۰ خط می‌شود و خطای *یک‌بارِ
   مهم* لای آن گم می‌شود. پس گروه می‌کنیم: «این خطا ۱۲ بار، آخرین بار ۲ ساعت پیش».

   سه تصمیمِ محتاطانه:
     • **شماره‌ی موبایل ماسک می‌شود.** لاگ واقعاً شماره دارد (مثلاً خطای ارسالِ
       پیامکِ ورود). همان قاعده‌ی دفترِ رویدادها که شماره را ماسک می‌کند.
     • **مسیرِ پوشه‌ی پروژه از stack بریده می‌شود** و فریم‌های node_modules
       انداخته می‌شوند. آنچه می‌ماند همان چند خطِ کدِ خودمان است که واقعاً مفید است.
     • **سقفِ بایت روی هر فایل.** لاگِ یک روزِ شلوغ می‌تواند ده‌ها مگابایت شود؛
       خواندنِ کاملش یعنی پنلِ ادمین حافظه‌ی سرور را می‌خورد. فقط انتهای فایل
       خوانده می‌شود، چون خطای تازه همیشه ته فایل است.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const MAX_BYTES_PER_FILE = 512 * 1024;   // فقط ۵۱۲ کیلوبایتِ آخرِ هر فایل
const MAX_GROUPS = 60;
const MAX_DAYS = 14;                     // بیش از این هم نگه داشته نمی‌شود (RETENTION_DAYS)
const STACK_FRAMES = 4;

// عینِ قاعده‌ی maskPhone در routes/auth.js: فقط چهار رقمِ آخر می‌ماند. دو شکلِ
// مختلفِ ماسک در یک پنل، خودش گمراه‌کننده است — کاربر فکر می‌کند دو چیزِ فرق‌دارند.
function maskPhone(p) {
  return String(p).replace(/\b0\d{10}\b/g, (m) => '****' + m.slice(-4));
}

// خواندنِ انتهای یک فایل بدون بالا آوردنِ کلش در حافظه
function tailFile(file, maxBytes = MAX_BYTES_PER_FILE) {
  let fd;
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    if (len <= 0) return '';
    const buf = Buffer.alloc(len);
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, buf, 0, len, start);
    let text = buf.toString('utf8');
    // اگر از وسطِ فایل شروع کرده‌ایم، خطِ اول نصفه است و پارسش آشغال می‌دهد
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return text;
  } catch (e) {
    return '';
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) { /* بسته بود */ } }
  }
}

/* عنوانِ گروه: همان پیام است ولی بخش‌های متغیرش برداشته می‌شود، وگرنه
   «Error GET /api/orders/41» و «… /42» دو گروهِ جدا می‌شدند و شمارش بی‌معنی. */
function groupKey(msg) {
  return msg
    .replace(/\b0\d{10}\b/g, '‹موبایل›')
    .replace(/\b[0-9a-f]{8,}\b/gi, '‹شناسه›')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '‹زمان›')
    .replace(/\/\d+\b/g, '/‹عدد›')
    .replace(/\b\d{2,}\b/g, '‹عدد›')
    .trim();
}

/* از stack فقط فریم‌های کدِ خودمان می‌ماند، با مسیرِ کوتاه‌شده.
   سه نکته که هر سه روی لاگِ *واقعی* لو رفتند، نه در تستِ ساختگی:

   • rootDir با path.resolve یکدست می‌شود. جای فراخوانی `path.join(a,'..','..')`
     می‌دهد که خودش تمیز است، ولی اگر کسی مسیری با `..` وسطش بدهد، جای‌گذاریِ
     رشته‌ای هیچ‌وقت نمی‌گیرد و همه‌ی مسیرها بلند می‌مانند — بی‌صدا.
   • فیلترِ اولیه فقط `node:internal` را می‌گرفت، پس فریم‌هایی مثل
     `(node:_http_outgoing:703:3)` رد می‌شدند. هر چیزی که مسیرش `node:` است
     داخلیِ خودِ Node است و به ما مربوط نیست.
   • عقب‌گردِ دوم: لاگ ماه‌ها می‌ماند و ممکن است از زمانی باشد که پروژه در
     مسیرِ دیگری نصب بوده (یا از سرورِ دیگری منتقل شده). آن فریم‌ها با rootDirِ
     امروز جور نمی‌شوند، پس هر چه قبل از `/backend/` یا `/frontend/` باشد هم
     بریده می‌شود. نتیجه در هر دو حالت یک شکل است.

   هر دو قاعده باید به شکلِ فریم بی‌اعتنا باشند: فریمی که نامِ تابع دارد
   `at f (/path:1:1)` است و فریمِ بی‌نام `at /path:1:1`. اولش هر دو قاعده به
   پرانتز گره خورده بودند، پس دقیقاً فریم‌های بی‌نام — که در express فراوان‌اند —
   از هر دو جان سالم بیرون می‌آمدند. */
function trimStack(stack, rootDir) {
  if (!stack || typeof stack !== 'string') return [];
  const root = path.resolve(rootDir || '.').replace(/\\/g, '/');
  return stack.split('\n')
    .slice(1)                                    // خطِ اول همان پیام است
    .map(s => s.trim().replace(/\\/g, '/'))
    .filter(s => s.startsWith('at ') && !s.includes('/node_modules/') && !/(?:^at |\()node:/.test(s))
    .map(s => s.split(root + '/').join('').split(root).join(''))
    .map(s => s.replace(/\/[^\s()]*?\/(?=(?:backend|frontend)\/)/g, ''))
    .slice(0, STACK_FRAMES);
}

/* شمارشِ پاسخ‌های ۵xx از دفترِ دسترسی. این عدد از خودِ تعدادِ خطا مهم‌تر است:
   یعنی مشتری واقعاً صفحه‌ی خطا دیده. بعضی خطاها لاگ می‌شوند ولی کاربر
   جوابِ درست می‌گیرد (مثل شکستِ ارسالِ پیامکِ اطلاع‌رسانی).

   **۵۰۳ عمداً شمرده نمی‌شود.** اولش «هر چیزِ ≥۵۰۰» را می‌شمردم و روی لاگِ
   واقعی عددِ ۵۶ درآمد — با صفر خطای ثبت‌شده. نگاه کردم: هر ۵۶ مورد
   `POST /api/orders` بود با پاسخِ «فروشگاه موقتاً تعطیل است». یعنی تصمیمِ خودِ
   صاحبِ مغازه، نه خرابی. در این پروژه ۵۰۳ فقط سه منبع دارد و هیچ‌کدام باگ
   نیست: مغازه‌ی بسته، لحظه‌ی خاموش‌شدنِ سرور، و /api/health وقتی دیتابیس
   نیست. پس اگر می‌ماند، کارتِ «مشتری خطا دید» قرمزِ ۵۶ نشان می‌داد در حالی
   که چیزی خراب نبود — دقیقاً همان گمراهیِ که این صفحه باید جلویش را بگیرد.
   خرابیِ واقعیِ دیتابیس هم کور نمی‌ماند: خودش خطا لاگ می‌کند و در کارتِ
   «خطاهای ثبت‌شده» می‌آید. */
function count5xx(text) {
  let n = 0;
  const re = /\[HTTP\] \S+ \S+ (\d{3}) /g;
  let m;
  while ((m = re.exec(text))) {
    const code = Number(m[1]);
    if (code >= 500 && code !== 503) n++;
  }
  return n;
}

/**
 * @param {object} opts
 * @param {string} opts.logDir پوشه‌ی لاگ‌ها
 * @param {string} opts.rootDir ریشه‌ی پروژه (برای کوتاه‌کردنِ مسیرها در stack)
 * @param {number} [opts.days] چند روزِ گذشته
 */
function errorDigest({ logDir, rootDir, days = 7 }) {
  const span = Math.min(Math.max(Number(days) || 7, 1), MAX_DAYS);
  const groups = new Map();
  const daily = [];
  let total = 0, http5xx = 0, todayCount = 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  for (let i = span - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const errText = tailFile(path.join(logDir, `error-${day}.log`));
    const accText = tailFile(path.join(logDir, `access-${day}.log`));
    const fiveXx = count5xx(accText);
    http5xx += fiveXx;

    let dayErrors = 0;
    for (const raw of errText.split('\n')) {
      // `2026-07-29T00:56:20.950Z [ERROR] پیام {"message":…,"stack":…}`
      const m = raw.match(/^(\S+) \[ERROR\] (.*)$/);
      if (!m) continue;
      const at = m[1];
      let body = m[2];
      let detail = null;

      // JSONِ انتهای خط: با آخرین `{` که تا انتهای خط پارس شود پیدایش می‌کنیم.
      // پیامِ خطا خودش می‌تواند `{` داشته باشد، پس از راست شروع می‌کنیم.
      const brace = body.lastIndexOf(' {');
      if (brace > -1) {
        try { detail = JSON.parse(body.slice(brace + 1)); body = body.slice(0, brace); }
        catch (e) { detail = null; }
      }

      const title = maskPhone(body.trim());
      const key = groupKey(title);
      dayErrors++; total++;
      if (day === todayStr) todayCount++;

      let g = groups.get(key);
      if (!g) {
        g = { key, title, count: 0, first: at, last: at, reason: '', stack: [] };
        groups.set(key, g);
      }
      g.count++;
      if (at < g.first) g.first = at;
      /* عنوان و دلیل و stack همه از **تازه‌ترین** نمونه می‌آیند، نه اولی. دو دلیل:
         • اگر خطا شکلش عوض شده باشد، آنچه الان دارد می‌افتد مهم‌تر است.
         • یک ردیفِ رابط باید همه‌اش یک لحظه را توصیف کند. اولش عنوان از نمونه‌ی
           اول می‌آمد و زمان از آخری، پس «۳× … /api/orders/41 — ۲ دقیقه پیش»
           نشان می‌داد؛ در حالی که سفارشِ ۴۱ یک بار خطا داده بود و آن یکی دو
           دقیقه پیش سفارشِ ۴۳ بود. عددِ گروه درست بود ولی سرنخ غلط می‌داد. */
      if (at >= g.last) {
        g.last = at;
        g.title = title;
        if (detail) {
          if (detail.message) g.reason = maskPhone(String(detail.message)).slice(0, 300);
          const st = trimStack(detail.stack, rootDir);
          if (st.length) g.stack = st;
        }
      }
    }
    daily.push({ day, errors: dayErrors, http5xx: fiveXx });
  }

  const list = [...groups.values()]
    .sort((a, b) => (b.last < a.last ? -1 : b.last > a.last ? 1 : b.count - a.count))
    .slice(0, MAX_GROUPS);

  return {
    days: span,
    since: daily.length ? daily[0].day : todayStr,
    totals: { errors: total, groups: groups.size, http5xx, today: todayCount },
    daily,
    groups: list,
  };
}

module.exports = { errorDigest, groupKey, trimStack, maskPhone, count5xx, tailFile };
