#!/usr/bin/env node
/* ============================================================
   tools/admin-recovery.js — ساختِ کدِ پشتیبان برای ورودِ دو‌مرحله‌ایِ پنل

   ---------- چرا این ابزار لازم است ----------
   سدِ عاملِ دوم کلیدش را فقط در گوشیِ مدیر نگه می‌دارد و همین، خودِ سد را به
   یک ریسک تبدیل می‌کند: گوشی که گم شود، کلید هم با آن می‌رود و درِ پنل برای
   همیشه بسته می‌ماند. کدِ پشتیبان راهِ بستهٔ همین قفل است — چند رشتهٔ
   یک‌بارمصرف که مدیر روی کاغذ می‌گذارد و در روزِ گم‌شدنِ گوشی از یکی‌شان
   استفاده می‌کند.

   ---------- چرا بیرون از پنل ساخته می‌شود ----------
   همان دلیلی که کلیدِ TOTP را بیرون از پنل ساختیم (کاملش در `lib/mfa.js`):
   اگر ادمین می‌توانست داخلِ پنل کدِ پشتیبان بسازد، همان کسی که کدِ پیامکیِ
   شماره را در دست گرفته بود اول برای خودش یک کد می‌ساخت و از آن به بعد با
   دو عامل وارد می‌شد. پس کدها روی دستگاهِ خودِ مدیر زاده می‌شوند.

   ---------- تنها چیزی که به سرور می‌رود، هش است ----------
   خروجی این ابزار دو تکه دارد و این تفکیک *کل* نکتهٔ امنیتی‌اش است:

     • خودِ کدها  → روی کاغذ (یا هر جای مطمئنِ بیرون از سرور). این‌ها را
       در `.env` نگذارید.
     • خطِ `ADMIN_RECOVERY_CODES` → فقط هش‌ها. این خط در `.env` می‌نشیند.

   اگر خطِ اول اشتباهی جای خطِ دوم برود، مدیر فکر می‌کند کدهایش تنظیم است
   در حالی که هیچ‌کدام کار نمی‌کند؛ برای همین `lib/mfa.js` هر مقداری که
   *شکلِ کد* داشته باشد را ناخوانا می‌شمارد و سرور هم موقعِ بالا آمدن
   هشدارش را چاپ می‌کند.

   ---------- اجرا ----------
     node tools/admin-recovery.js 09121234567
     node tools/admin-recovery.js 09121234567 --count=10
     node tools/admin-recovery.js 09121234567 --json   # فقط برای اسکریپت‌ها

   ---------- نکته‌ای که روزِ استفاده مهم می‌شود ----------
   هر کد **یک بار** کار می‌کند و مصرفش در دیتابیس می‌ماند. اگر روزی کدهای
   تازه ساختید، خطِ قدیمی را کامل جایگزین کنید: هش‌های قبلی تا وقتی آن خط
   سر جایش باشد معتبر می‌مانند.
   ============================================================ */
'use strict';

const mfa = require('../lib/mfa');
const { normalizePhone, isValidIranPhone } = require('../lib/phone');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const countArg = args.find((a) => a.startsWith('--count='));
const phoneArg = args.find((a) => !a.startsWith('--'));

if (!phoneArg || args.includes('--help') || args.includes('-h')) {
  console.log('استفاده: node tools/admin-recovery.js <شماره‌ی مدیر> [--count=8] [--json]');
  console.log('مثال:   node tools/admin-recovery.js 09121234567');
  process.exit(phoneArg ? 0 : 2);
}

const count = countArg
  ? Number(countArg.slice('--count='.length))
  : mfa.RECOVERY.defaultCount;
if (!Number.isInteger(count) || count < 1 || count > 50) {
  console.error(`تعدادِ نامعتبر: ${countArg} — بینِ ۱ تا ۵۰ انتخاب کنید (پیش‌فرض ${mfa.RECOVERY.defaultCount}).`);
  process.exit(2);
}

const phone = normalizePhone(phoneArg);
if (!isValidIranPhone(phone)) {
  console.error(`شماره‌ی نامعتبر: ${phoneArg} — نمونه‌ی درست: 09121234567`);
  process.exit(2);
}

const codes = mfa.generateRecoveryCodes(count);
const formatted = codes.map(mfa.formatRecoveryCode);
const envLine = mfa.recoveryEnvLine(phone, codes);

if (asJson) {
  console.log(JSON.stringify({ phone, count, codes: formatted, envLine }, null, 2));
  process.exit(0);
}

console.log('');
console.log('کدهای پشتیبانِ ورودِ دو‌مرحله‌ای');
console.log('────────────────────────────────────────────────────────────');
console.log(`شماره: ${phone}`);
console.log(`تعداد: ${codes.length} کدِ یک‌بارمصرف`);
console.log('');
console.log('۱) این کدها را روی کاغذ بنویسید و جای مطمئنی بیرون از سرور بگذارید');
console.log('   (نه در .env، نه در چت، نه در ایمیل — هر کدام یک بار کار می‌کند):');
console.log('');
formatted.forEach((c, i) => console.log(`     ${String(i + 1).padStart(2, ' ')}.  ${c}`));
console.log('');
console.log('۲) این خط را در backend/.env بگذارید — فقط *هش‌ها* را دارد، نه خودِ کدها:');
console.log('');
console.log(`   ${envLine}`);
console.log('');
console.log('۳) سرور را دوباره بالا بیاورید. اگر کدِ پشتیبان برای شماره‌ی دیگری هم');
console.log('   دارید، هر دو در همان یک خط با کاما می‌آیند:');
console.log('   ADMIN_RECOVERY_CODES=0912…:هش هش …,0913…:هش هش …');
console.log('');
console.log('نکته: در صفحه‌ی ورودِ پنل، همان‌جای کدِ برنامهٔ Authenticator می‌توانید');
console.log('یکی از این کدها را وارد کنید (شکلش XXXX-XXXX-XXXX است). مصرفِ هر کد');
console.log('دائمی است و بعد از هر بار، شمارِ باقی‌مانده به شما گفته می‌شود.');
console.log('');
