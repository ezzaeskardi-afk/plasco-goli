#!/usr/bin/env node
/* ============================================================
   restore-backup.js — برگرداندن دیتابیس از بکاپ
   ------------------------------------------------------------
   تا امروز بکاپِ خودکار روزانه گرفته می‌شد ولی برگرداندنش دستی بود: باید
   سرور را می‌بستی، فایل را کپی می‌کردی روی polasco.db و امیدوار بودی که
   فایل‌های -wal/-shm را هم یادت باشد پاک کنی. همین «یادت باشد» جایی است که
   بازگردانیِ اضطراری خراب می‌شود — آن هم دقیقاً وقتی که کمترین حوصله را داری.

   خطرناک‌ترین ابزارِ این پروژه است، پس عمداً چند لایه محافظ دارد:

   ۱) **بی‌آرگومان هیچ کاری نمی‌کند.** فقط فهرست می‌دهد. برای بازگردانی باید
      صریحاً تاریخ یا نامِ فایل را بنویسی.
   ۲) **بکاپ قبل از اعتماد بررسی می‌شود** (integrity_check + وجودِ جدول‌های
      اصلی + شمارش سطرها). بکاپِ خرابی که روی دیتابیسِ سالم بریزد، بدترین
      نتیجه‌ی ممکن است — بدتر از هیچ‌کاری‌نکردن.
   ۳) **قبل از بازنویسی، از وضعیتِ فعلی عکس گرفته می‌شود** (`pre-restore-*.db`).
      اگر بعد از بازگردانی فهمیدی بکاپِ اشتباهی را انتخاب کردی، راهِ برگشت هست.
   ۴) **تفاوت را نشان می‌دهد و تأیید می‌خواهد.** «۳ سفارش برمی‌گردد و ۴۱ سفارش
      از بین می‌رود» را باید ببینی و `yes` تایپ کنی.
   ۵) **فایل‌های -wal و -shm پاک می‌شوند.** این تنها موردی است که سکوت در
      برابرش فاجعه است: آن دو فایل به دیتابیسِ *قبلی* مربوط‌اند و اگر بمانند،
      SQLite تغییراتِ نیمه‌کاره‌ی دیتابیسِ قدیم را روی فایلِ تازه پخش می‌کند.

   استفاده:
     node tools/restore-backup.js                    فهرستِ بکاپ‌ها
     node tools/restore-backup.js 2026-07-29         بازگردانی به آن روز
     node tools/restore-backup.js --latest           آخرین بکاپ
     node tools/restore-backup.js <نام فایل> --yes   بدون سؤال (برای اسکریپت)
     node tools/restore-backup.js --from-dir2 ...    از پوشه‌ی بکاپِ دومِ .env

   عمداً `lib/db.js` را require نمی‌کند: آن فایل موقعِ بارگذاری دیتابیس را باز
   می‌کند و مهاجرت‌ها را اجرا می‌کند. برای ابزاری که کارش جابه‌جا کردنِ همان
   فایل است، این یعنی قفلِ خودکار روی چیزی که می‌خواهیم عوضش کنیم.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// مسیرها را مثل lib/db.js حساب می‌کنیم — با احترام به PG_DATA_DIR — تا تست
// بتواند این ابزار را روی کپیِ دیتابیس بیازماید و به داده‌ی واقعی نزدیک نشود.
const DATA_DIR = process.env.PG_DATA_DIR
  ? path.resolve(process.env.PG_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'polasco.db');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const AUTO_YES = has('--yes');
const FROM_DIR2 = has('--from-dir2');
const WANT_LATEST = has('--latest');
const target = args.find(a => !a.startsWith('-'));

const SRC_DIR = FROM_DIR2 ? (process.env.BACKUP_DIR2 || '') : BACKUP_DIR;

const kb = (n) => (n / 1024).toFixed(0) + 'KB';
const line = (c = '═') => console.log('  ' + c.repeat(58));

/* ---------- خواندنِ خلاصه‌ی یک فایلِ دیتابیس ----------
   readOnly تلاشِ اول است تا کنارِ بکاپ فایلِ -journal جا نگذاریم؛ اگر نسخه‌ی
   Node این گزینه را نشناسد، به بازکردنِ معمولی برمی‌گردیم — ولی *نه* وقتی
   همراهِ نیمه‌کاره‌ای کنارِ فایل هست (توضیحش پایینِ همان شرط). */
const NEEDED = ['products', 'orders', 'users', 'settings'];

// آیا کنارِ فایل «همراهِ نیمه‌کاره» مانده؟ یعنی ژورنالِ داغ یا WALِ رهاشده —
// نشانه‌ی اینکه نوشتنِ این فایل تمام نشده و وسطِ کار رهایش کرده‌اند.
const hotCompanions = (file) => ['-journal', '-wal'].filter(x => {
  try { return fs.statSync(file + x).size > 0; } catch (e) { return false; }
});

function inspect(file) {
  let d = null;
  try { d = new DatabaseSync(file, { readOnly: true }); }
  catch (e) {
    // فقط اگر خودِ Node گزینه‌ی readOnly را نشناسد به این‌جا می‌رسیم. آن‌وقت
    // بازکردنِ read-write روی فایلی که ژورنالِ داغ دارد، همان ژورنال را
    // rollback و مصرف می‌کند — یعنی «فهرست گرفتن» بکاپ را عوض می‌کند. پس در
    // آن حالت fallback نمی‌زنیم.
    const hot = hotCompanions(file);
    if (hot.length) {
      return { ok: false, message: `نیمه‌کاره رها شده (${hot.join(' و ')} کنارش مانده) — قابلِ اعتماد نیست` };
    }
    try { d = new DatabaseSync(file); } catch (e2) { return { ok: false, message: e2.message }; }
  }
  try {
    const tables = new Set(d.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
    const missing = NEEDED.filter(t => !tables.has(t));
    if (missing.length) return { ok: false, message: `جدول‌های اصلی نیست: ${missing.join(', ')}`, tables };

    // integrity_check گران است ولی اینجا دقیقاً همان چیزی است که می‌خواهیم:
    // بکاپی که ساختارش شکسته باشد نباید جای دیتابیسِ کاری بنشیند.
    const ic = d.prepare('PRAGMA integrity_check').all();
    const icOk = ic.length === 1 && String(Object.values(ic[0])[0]).toLowerCase() === 'ok';

    const n = (sql) => { try { return d.prepare(sql).get().n; } catch (e) { return null; } };
    return {
      ok: icOk,
      message: icOk ? '' : 'integrity_check رد شد',
      tables,
      products: n('SELECT COUNT(*) AS n FROM products'),
      orders: n('SELECT COUNT(*) AS n FROM orders'),
      users: n('SELECT COUNT(*) AS n FROM users'),
      reviews: n('SELECT COUNT(*) AS n FROM reviews'),
      lastOrder: (() => {
        try { return d.prepare('SELECT MAX(created_at) AS n FROM orders').get().n; }
        catch (e) { return null; }
      })(),
    };
  } catch (e) {
    // SQLite تا اولین *خواندن* دست به ژورنال نمی‌زند، پس بکاپِ نیمه‌کاره موقعِ
    // باز شدن لو نمی‌رود؛ همین‌جا می‌ترکد با پیامِ خامِ
    // «attempt to write a readonly database». آن جمله مدیرِ نیمه‌شب را دنبالِ
    // مشکلِ دسترسیِ فایل می‌فرستد، در حالی که واقعیت این است: این بکاپ وسطِ
    // نوشتن رها شده. یکی از بکاپ‌های واقعیِ همین پروژه (۲۰۲۶-۰۷-۲۷) دقیقاً
    // همین بود — ۲۰۰ کیلوبایت روی دیسک که تراکنشش هرگز commit نشده بود و
    // محتوایش عملاً خالی است. باید صریح گفته شود، نه با پیامِ گمراه‌کننده.
    const hot = hotCompanions(file);
    if (hot.length) {
      return { ok: false, message: `نیمه‌کاره رها شده (${hot.join(' و ')} کنارش مانده) — قابلِ اعتماد نیست` };
    }
    return { ok: false, message: e.message };
  } finally {
    try { d.close(); } catch (e) { /* بسته بود */ }
  }
}

/* ---------- آیا کسی همین حالا از دیتابیس استفاده می‌کند؟ ----------
   دو آزمونِ مستقل، چون هیچ‌کدام تنها کافی نیست:
   • BEGIN EXCLUSIVE نویسنده‌ی فعال را می‌گیرد ولی سرورِ روشنِ بی‌کار را نه.
   • فایلِ -shm نشانه‌ی اتصالِ باز در حالتِ WAL است، ولی ممکن است از اجرای
     قبلی جا مانده باشد؛ پس فقط «مشکوک» حساب می‌شود نه قطعی. */
function looksBusy() {
  const notes = [];
  try {
    const d = new DatabaseSync(DB_FILE);
    try { d.exec('BEGIN EXCLUSIVE'); d.exec('ROLLBACK'); }
    catch (e) { notes.push('یک پروسه‌ی دیگر روی دیتابیس قفلِ نوشتن دارد'); }
    d.close();
  } catch (e) { notes.push(`بازکردنِ دیتابیس نشد: ${e.message}`); }
  if (fs.existsSync(DB_FILE + '-shm')) notes.push('فایل -shm هست (احتمالاً سرور روشن است)');
  return notes;
}

function askYes(question) {
  if (AUTO_YES) return true;
  process.stdout.write(question);
  const buf = Buffer.alloc(64);
  let got = 0;
  try { got = fs.readSync(0, buf, 0, 64, null); }
  catch (e) { console.log('\n  ورودی خوانده نشد. برای اجرای بی‌سؤال از --yes استفاده کنید.'); return false; }
  return buf.slice(0, got).toString('utf8').trim().toLowerCase() === 'yes';
}

/* ---------- فهرست ---------- */
console.log('');
line();
console.log('  بازگردانیِ دیتابیس از بکاپ');
line();

if (FROM_DIR2 && !SRC_DIR) {
  console.log('\n  BACKUP_DIR2 در .env تنظیم نشده است.\n');
  process.exit(1);
}
if (!fs.existsSync(SRC_DIR)) {
  console.log(`\n  پوشه‌ی بکاپ پیدا نشد: ${SRC_DIR}\n`);
  process.exit(1);
}

const backups = fs.readdirSync(SRC_DIR)
  .filter(f => f.endsWith('.db'))
  .map(f => ({ name: f, full: path.join(SRC_DIR, f), st: fs.statSync(path.join(SRC_DIR, f)) }))
  .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);

if (!backups.length) {
  console.log('\n  هیچ بکاپی در این پوشه نیست.\n');
  process.exit(1);
}

if (!target && !WANT_LATEST) {
  console.log(`\n  پوشه: ${SRC_DIR}\n`);
  for (const b of backups) {
    const info = inspect(b.full);
    const when = b.st.mtime.toISOString().slice(0, 16).replace('T', ' ');
    const body = info.ok
      ? `${info.products} کالا · ${info.orders} سفارش · ${info.users} کاربر`
      : `⚠ ${info.message}`;
    console.log(`  ${b.name.padEnd(38)} ${kb(b.st.size).padStart(8)}  ${when}`);
    console.log(`  ${' '.repeat(38)} ${' '.repeat(8)}  ${body}`);
  }
  console.log('');
  line('─');
  console.log('  برای بازگردانی، تاریخ یا نامِ فایل را بنویسید:');
  console.log('    node tools/restore-backup.js 2026-07-29');
  console.log('    node tools/restore-backup.js --latest');
  console.log('');
  process.exit(0);
}

/* ---------- انتخابِ بکاپ ---------- */
let pick = null;
if (WANT_LATEST) {
  // «آخرین» یعنی آخرین بکاپِ *روزانه*، نه عکس‌های دستیِ pre-restore/pre-recovery.
  // وگرنه دستِ آخر آدم را به همان وضعیتی برمی‌گرداند که می‌خواست از آن فرار کند.
  pick = backups.find(b => b.name.startsWith('polasco-')) || backups[0];
} else {
  const exact = backups.find(b => b.name === target);
  const byDate = backups.filter(b => b.name.includes(target));
  if (exact) pick = exact;
  else if (byDate.length === 1) pick = byDate[0];
  else if (byDate.length > 1) {
    console.log(`\n  «${target}» به چند فایل می‌خورد. یکی را کامل بنویسید:`);
    for (const b of byDate) console.log('    ' + b.name);
    console.log('');
    process.exit(1);
  }
}
if (!pick) {
  console.log(`\n  بکاپی با «${target}» پیدا نشد. بدون آرگومان اجرا کنید تا فهرست را ببینید.\n`);
  process.exit(1);
}

/* ---------- بررسیِ بکاپ قبل از هر کاری ---------- */
console.log(`\n  بکاپِ انتخابی : ${pick.name}  (${kb(pick.st.size)})`);
const from = inspect(pick.full);
if (!from.ok) {
  console.log(`\n  ✗ این بکاپ سالم نیست: ${from.message}`);
  console.log('    بازگردانی انجام نشد — دیتابیسِ فعلی دست‌نخورده ماند.\n');
  process.exit(1);
}

const now = fs.existsSync(DB_FILE) ? inspect(DB_FILE) : { ok: true, products: 0, orders: 0, users: 0 };
const delta = (a, b) => {
  const d = (a ?? 0) - (b ?? 0);
  return d === 0 ? 'بی‌تغییر' : (d > 0 ? `${d}+` : `${d}`);
};

console.log('');
line('─');
console.log('  چه چیزی عوض می‌شود؟          الان →  بعد از بازگردانی   تفاوت');
for (const [fa, k] of [['کالا', 'products'], ['سفارش', 'orders'], ['کاربر', 'users'], ['نظر', 'reviews']]) {
  console.log(`    ${fa.padEnd(22)} ${String(now[k] ?? '؟').padStart(6)} → ${String(from[k] ?? '؟').padStart(6)}          ${delta(from[k], now[k])}`);
}
if (now.lastOrder || from.lastOrder) {
  console.log(`    آخرین سفارش           ${String(now.lastOrder || '—').slice(0, 16)} → ${String(from.lastOrder || '—').slice(0, 16)}`);
}

// مهاجرت: بکاپِ قدیمی ممکن است جدولِ نسخه‌های بعدی را نداشته باشد. سرور موقعِ
// بوت مهاجرت‌ها را اجرا می‌کند، پس فاجعه نیست — ولی باید بدانی، نه اینکه
// بعداً با خطای «no such table» غافلگیر شوی.
if (now.tables && from.tables) {
  const gone = [...now.tables].filter(t => !from.tables.has(t) && !t.startsWith('sqlite_'));
  if (gone.length) {
    console.log(`\n  توجه: این بکاپ از نسخه‌ی قدیمی‌تری است و این جدول‌ها را ندارد:`);
    console.log(`    ${gone.join(', ')}`);
    console.log('    سرور موقعِ بوتِ بعدی خودش می‌سازدشان (خالی).');
  }
}

const busy = looksBusy();
if (busy.length) {
  console.log('\n  ⚠  به‌نظر می‌رسد دیتابیس در حالِ استفاده است:');
  for (const n of busy) console.log('     • ' + n);
  console.log('     اول سرور را ببندید. بازگردانی روی دیتابیسِ باز، فایل را خراب می‌کند.');
  if (!AUTO_YES) {
    console.log('');
    process.exit(1);
  }
}

console.log('');
line('─');
console.log('  این کار برگشت‌پذیر است: از وضعیتِ فعلی عکس گرفته می‌شود.');
if (!askYes('  ادامه می‌دهید؟ برای تأیید «yes» تایپ کنید: ')) {
  console.log('\n  لغو شد. هیچ چیزی عوض نشد.\n');
  process.exit(0);
}

/* ---------- ۱: عکس از وضعیتِ فعلی ---------- */
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
// نامِ عکس تا **ثانیه** دقت دارد، پس دو بازگردانیِ پشت‌سرهم در یک ثانیه به یک
// نام می‌رسند و `VACUUM INTO` روی فایلِ موجود خطا می‌دهد. اولش همین بود و
// نتیجه‌اش این بود که بازگردانیِ دوم کامل رد می‌شد — بی‌خطر، ولی غلط.
let snap = path.join(BACKUP_DIR, `pre-restore-${stamp}.db`);
for (let i = 2; fs.existsSync(snap); i++) {
  snap = path.join(BACKUP_DIR, `pre-restore-${stamp}-${i}.db`);
}
if (fs.existsSync(DB_FILE)) {
  try {
    // VACUUM INTO جای copyFileSync: فایلِ خروجی از نظرِ SQLite کاملِ سالم است،
    // حتی اگر تغییراتی در -wal مانده باشد که هنوز به فایلِ اصلی نرسیده‌اند.
    const d = new DatabaseSync(DB_FILE);
    d.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
    d.close();
    console.log(`\n  ✓ عکسِ وضعیتِ فعلی: ${path.basename(snap)}  (${kb(fs.statSync(snap).size)})`);
  } catch (e) {
    console.log(`\n  ✗ عکس‌گرفتن از وضعیتِ فعلی نشد: ${e.message}`);
    console.log('    بازگردانی انجام نشد — بی‌راهِ برگشت این کار را نمی‌کنیم.\n');
    process.exit(1);
  }
}

/* ---------- ۲: جای‌گذاری ---------- */
try {
  fs.copyFileSync(pick.full, DB_FILE);
  console.log(`  ✓ ${pick.name} روی polasco.db نوشته شد`);
} catch (e) {
  console.log(`  ✗ کپی نشد: ${e.message}`);
  console.log(`    دیتابیسِ قبلی سالم است: ${path.basename(snap)}\n`);
  process.exit(1);
}

/* ---------- ۳: پاک‌کردنِ -wal و -shm ----------
   حساس‌ترین قدم. آن دو فایل به دیتابیسِ *قبلی* مربوط‌اند؛ اگر بمانند SQLite
   صفحه‌هایشان را روی فایلِ تازه پخش می‌کند و نتیجه دیتابیسی است که نه این است
   نه آن. سکوت درباره‌ی این قدم همان چیزی است که بازگردانیِ دستی را خطرناک می‌کرد. */
for (const ext of ['-wal', '-shm', '-journal']) {
  const f = DB_FILE + ext;
  if (fs.existsSync(f)) {
    try { fs.unlinkSync(f); console.log(`  ✓ فایلِ کهنه‌ی ${ext} پاک شد`); }
    catch (e) { console.log(`  ⚠ ${ext} پاک نشد (${e.message}) — سرور را ببندید و دستی پاکش کنید`); }
  }
}

/* ---------- ۴: بررسیِ نتیجه ---------- */
const after = inspect(DB_FILE);
console.log('');
line();
if (after.ok && after.products === from.products && after.orders === from.orders) {
  console.log(`  انجام شد. ${after.products} کالا · ${after.orders} سفارش · ${after.users} کاربر`);
  console.log(`  راهِ برگشت: node tools/restore-backup.js ${path.basename(snap)}`);
  line();
  console.log('');
  process.exit(0);
} else {
  console.log(`  ✗ نتیجه با انتظار نمی‌خواند: ${after.message || 'شمارش‌ها فرق دارند'}`);
  console.log(`  فوراً برگردانید: node tools/restore-backup.js ${path.basename(snap)}`);
  line();
  console.log('');
  process.exit(1);
}
