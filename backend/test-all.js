// ============================================================
// اجرای همه‌ی مجموعه‌های تست، پشت سر هم.
//
//   cd backend  ->  node test-all.js
//
// سه مجموعه داریم و عمداً جدا مانده‌اند، چون هر کدام سرور را با تنظیمات متفاوتی
// بالا می‌آورد (سقف نرخِ باز برای تستِ دود، سقف نرخِ پایین برای تستِ جعل IP) و
// قاطی‌کردنشان در یک پروسه یعنی یکی سهمیه‌ی دیگری را می‌سوزاند.
//
// هر سه روی **کپیِ** دیتابیس اجرا می‌شوند (tests/sandbox.js)، پس اجرای این فایل
// به داده‌ی واقعی مغازه دست نمی‌زند.
// ============================================================
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['تست دود (کل مسیر سایت)', 'test-smoke.js'],
  ['تست امنیت (هدرها، CSRF، جعل IP، آپلود)', path.join('tests', 'security.js')],
  ['تست تخفیف (قیمت قبلی، درصد، ویرایش گروهی)', path.join('tests', 'discount.js')]
];

const results = [];
for (const [label, file] of SUITES) {
  console.log('\n' + '█'.repeat(60));
  console.log('█  ' + label);
  console.log('█'.repeat(60) + '\n');
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  results.push({ label, ok: r.status === 0 });
}

console.log('\n' + '='.repeat(60));
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'}  ${r.label}`);
const failed = results.filter(r => !r.ok);
console.log('='.repeat(60));
if (failed.length) {
  console.log(`\n  ${failed.length} مجموعه ناموفق بود. خطوط [FAIL] بالا را ببین.\n`);
  process.exit(1);
}
console.log('\n  همه‌ی مجموعه‌ها سبز.\n');
