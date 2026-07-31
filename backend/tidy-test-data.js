/**
 * پاک‌کردن داده‌هایی که test-smoke.js می‌سازد.
 *
 * test-smoke.js هر بار یک کاربر با شماره تصادفی 0912111XXXX می‌سازد،
 * یک سفارش برایش ثبت می‌کند و چند ردیف در admin_log می‌گذارد.
 * این اسکریپت آخرین رسوب را برمی‌دارد.
 *
 * موجودی را عمداً *دست نمی‌زند*. نسخه‌ی قبلی این کار را با محاسبه می‌کرد
 * (stock = stock + qty برای هر قلمِ هر سفارشِ پاک‌شده) و این حالا خطرناک است:
 * test-smoke.js از نسخه‌ی V15 روی کالای یک‌بارمصرفِ خودش خرید می‌کند، پس هرگز
 * از انبار واقعی کم نمی‌شود. اگر همان محاسبه اجرا شود، به موجودیِ درست اضافه
 * می‌کند و انبار را باد می‌کند — یعنی سایت کالایی را می‌فروشد که وجود ندارد.
 * برای برگرداندن موجودی، مرجع درست فایل بکاپ روزانه است، نه جمع‌وتفریق:
 *   node tidy-test-data.js --check-stock   مقایسه با آخرین بکاپ
 *
 * روش استفاده (سرور باید خاموش باشد):
 *   node tidy-test-data.js          نمایش آنچه پاک می‌شود، بدون تغییر
 *   node tidy-test-data.js --apply  اعمال واقعی
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const APPLY = process.argv.includes('--apply');
const DB = path.join(__dirname, 'data', 'polasco.db');
const db = new DatabaseSync(DB);

// کاربرانی که در یک ساعت گذشته با الگوی شماره‌ی تست ساخته شده‌اند.
// محدودیت زمانی عمدی است: کاربران تستی قدیمی‌تر تنها داده‌ای هستند
// که داشبورد ادمین را پر نشان می‌دهند و نباید پاک شوند.
const users = db.prepare(
  `SELECT id, phone, created_at FROM users
    WHERE phone LIKE '0912111%'
      AND created_at >= datetime('now', '-1 hour')`
).all();

// ---------- مقایسه‌ی موجودی با آخرین بکاپ ----------
// مرجعِ درستِ موجودی، فایل بکاپ است نه جمع‌وتفریقِ سفارش‌ها. اگر تستی یا اسکریپتی
// انبار واقعی را خورده باشد، اینجا با عدد دقیق دیده می‌شود.
if (process.argv.includes('--check-stock')) {
  const fs = require('node:fs');
  const bdir = path.join(__dirname, 'data', 'backups');
  // فقط بکاپ‌های روزانه‌ی خودکار. الگو عمداً سخت‌گیر است: پوشه فایل‌های دیگری هم
  // دارد (مثل pre-recovery-*.db) و چون «pre» الفبایی بعد از «polasco» می‌آید،
  // یک sort ساده قدیمی‌ترین‌ها را جدیدترین نشان می‌داد و موجودی از عکسی چندروزه
  // بازنویسی می‌شد.
  const files = fs.existsSync(bdir)
    ? fs.readdirSync(bdir).filter(f => /^polasco-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()
    : [];
  if (!files.length) { console.error('بکاپ روزانه‌ای پیدا نشد (polasco-YYYY-MM-DD.db).'); process.exit(1); }
  const latest = path.join(bdir, files[files.length - 1]);
  const bak = new DatabaseSync(latest, { readOnly: true });
  console.log(`مقایسه با: ${files[files.length - 1]}\n`);
  let drift = 0;
  for (const b of bak.prepare('SELECT id, title, stock FROM products').all()) {
    const live = db.prepare('SELECT stock FROM products WHERE id = ?').get(b.id);
    if (!live) { console.log(`#${b.id} ${b.title} — در دیتابیس فعلی نیست`); continue; }
    if (live.stock !== b.stock) {
      console.log(`#${b.id} ${b.title}: بکاپ=${b.stock} فعلی=${live.stock} (${live.stock - b.stock > 0 ? '+' : ''}${live.stock - b.stock})`);
      drift++;
    }
  }
  console.log(drift ? `\n${drift} کالا اختلاف دارد.` : '\nموجودی همه‌ی کالاها با بکاپ یکی است.');
  if (drift && process.argv.includes('--apply')) {
    db.exec('BEGIN IMMEDIATE');
    for (const b of bak.prepare('SELECT id, stock FROM products').all()) {
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(b.stock, b.id);
    }
    db.exec('COMMIT');
    console.log('موجودی از بکاپ بازنویسی شد.');
  } else if (drift) {
    console.log('برای بازنویسی از بکاپ: node tidy-test-data.js --check-stock --apply');
  }
  process.exit(0);
}

const logRows  = db.prepare('SELECT COUNT(*) c FROM admin_log').get().c;
const testProd = db.prepare("SELECT id,title FROM products WHERE title LIKE '%TEST %'").all();

console.log(`دیتابیس: ${DB}`);
console.log(`کاربران تستی امروز: ${users.length}`);
for (const u of users) {
  const orders = db.prepare('SELECT id, items FROM orders WHERE user_id = ?').all(u.id);
  console.log(`  ${u.phone} (#${u.id}) — ${orders.length} سفارش`);
}
console.log(`کالای تستی: ${testProd.length}`);
console.log(`ردیف لاگ ادمین: ${logRows}`);

if (!APPLY) {
  console.log('\nحالت نمایشی. برای اعمال: node tidy-test-data.js --apply');
  process.exit(0);
}

// محافظ: پاک کردن دسته‌جمعی معمولاً یعنی الگو اشتباه گرفته است
if (users.length > 2 && !process.argv.includes('--force')) {
  console.error(`\nمتوقف شد: ${users.length} کاربر پیدا شد که بیش از حد انتظار است.`);
  console.error('یک اجرای test-smoke.js فقط یک کاربر می‌سازد. احتمالاً الگو دارد');
  console.error('کاربران واقعی یا داده‌های قدیمی داشبورد را هم می‌گیرد.');
  console.error('اگر مطمئنی، دوباره با --force اجرا کن.');
  process.exit(1);
}

db.exec('BEGIN');
try {
  for (const u of users) {
    // موجودی لمس نمی‌شود — توضیح کامل در سرصفحه‌ی فایل.
    const del = db.prepare('DELETE FROM orders WHERE user_id = ?').run(u.id);
    if (del.changes) console.log(`  ${del.changes} سفارش پاک شد`);
    db.prepare('DELETE FROM wishlist  WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM addresses WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM reviews   WHERE user_id = ?').run(u.id);
    db.prepare('DELETE FROM users     WHERE id = ?').run(u.id);
    console.log(`  کاربر ${u.phone} پاک شد`);
  }
  db.prepare("DELETE FROM products WHERE title LIKE '%TEST PRODUCT%'").run();
  db.prepare("DELETE FROM products WHERE title LIKE '%TEST BUYABLE%'").run();
  db.prepare("DELETE FROM products WHERE title LIKE '%TEST STOCK PROBE%'").run();
  db.prepare('DELETE FROM admin_log').run();
  db.prepare('DELETE FROM otp_codes').run();
  db.prepare('DELETE FROM otp_ip_log').run();
  db.prepare('DELETE FROM sessions').run();
  db.exec('COMMIT');
  console.log('\nانجام شد.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('برگشت خورد:', e.message);
  process.exit(1);
}

console.log('سفارش‌ها:', db.prepare('SELECT COUNT(*) c FROM orders').get().c,
            '| کاربران:', db.prepare('SELECT COUNT(*) c FROM users').get().c,
            '| کالاها:',  db.prepare('SELECT COUNT(*) c FROM products').get().c);
