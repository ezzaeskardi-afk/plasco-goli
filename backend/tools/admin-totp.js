#!/usr/bin/env node
/* ============================================================
   tools/admin-totp.js — ساختِ کلیدِ عاملِ دوم برای ورودِ پنل

   ---------- چرا این ابزار لازم است ----------
   سدِ عاملِ دوم فقط وقتی کار می‌کند که کلیدش **بیرون از کانالِ ورود** زاده
   شود (دلیلش کامل در `lib/mfa.js` آمده): اگر ادمین می‌توانست داخلِ پنل کلید
   بسازد، همان کسی که کدِ پیامکی را گرفته بود اول کلیدِ خودش را ثبت می‌کرد
   و سد فقط تا اولین حمله دوام می‌آورد.

   پس کلید روی دستگاهِ خودِ صاحبِ فروشگاه ساخته می‌شود و تنها چیزی که به
   سرور می‌رود، همان کلید در `.env` است — نه در دیتابیس، نه در پنل، نه در
   هیچ پاسخی از API. هیچ مسیری در سایت این کلید را نمی‌سازد و نمی‌خواند.

   ---------- اجرا ----------
     node tools/admin-totp.js 09121234567
     node tools/admin-totp.js 09121234567 --json   # فقط برای اسکریپت‌ها

   خروجی: کلیدِ Base32، نشانیِ `otpauth://` (برای QR یا ورودِ دستی)، و خطِ
   آمادهٔ `ADMIN_TOTP_SECRETS` که باید در `.env` بنشیند.

   ---------- چرا QR ساخته نمی‌شود ----------
   ساختِ تصویرِ QR یک الگوریتمِ کامل است و افزودنش بدونِ وابستگی یعنی چند صد
   خط کدِ ربطی به امنیتِ سایت. نشانیِ `otpauth://` همان چیزی است که هر اپِ
   Authenticator با «افزودن دستی» می‌پذیرد، و اگر مدیر QR بخواهد می‌تواند
   همین نشانی را در هر سرویسِ QR بیندازد — بدونِ اینکه ما به خودِ سرویس
   وابسته شویم.
   ============================================================ */
'use strict';

const totp = require('../lib/totp');
const { normalizePhone, isValidIranPhone } = require('../lib/phone');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const phoneArg = args.find((a) => !a.startsWith('--'));

if (!phoneArg || args.includes('--help') || args.includes('-h')) {
  console.log('استفاده: node tools/admin-totp.js <شماره‌ی مدیر> [--json]');
  console.log('مثال:   node tools/admin-totp.js 09121234567');
  process.exit(phoneArg ? 0 : 2);
}

const phone = normalizePhone(phoneArg);
if (!isValidIranPhone(phone)) {
  console.error(`شماره‌ی نامعتبر: ${phoneArg} — نمونه‌ی درست: 09121234567`);
  process.exit(2);
}

const secret = totp.randomSecret();
const uri = totp.otpauthUri({ secret, account: phone });
const envLine = `ADMIN_TOTP_SECRETS=${phone}:${secret}`;
const nowCode = totp.totp(secret);
const remaining = totp.DEFAULTS.step - (Math.floor(Date.now() / 1000) % totp.DEFAULTS.step);

if (asJson) {
  console.log(JSON.stringify({ phone, secret, uri, envLine, code: nowCode, step: totp.DEFAULTS.step, expiresIn: remaining }, null, 2));
  process.exit(0);
}

console.log('');
console.log('کلیدِ عاملِ دوم برای ورودِ پنل');
console.log('────────────────────────────────────────────────────────────');
console.log(`شماره:        ${phone}`);
console.log(`کلید (Base32): ${secret}`);
console.log(`کدِ همین حالا:  ${nowCode}   (${remaining} ثانیهٔ دیگر عوض می‌شود)`);
console.log('');
console.log('۱) این نشانی را در اپِ Authenticator خود اضافه کنید («افزودن دستی» یا QR):');
console.log(`   ${uri}`);
console.log('');
console.log('۲) این خط را به backend/.env اضافه کنید (اگر از قبل هست، کلید را به آخرش اضافه کنید):');
console.log(`   ${envLine}`);
console.log('');
console.log('۳) سرور را دوباره بالا بیاورید. از این پس ورودِ این شماره دو مرحله دارد:');
console.log('   کدِ پیامکی، بعد کدِ ۶ رقمیِ اپ.');
console.log('');
console.log('نکته: کلید را جای امنی نگه دارید. اگر گم شود، همین ابزار را دوباره');
console.log('اجرا کنید و خطِ تازه را جایگزین کنید — ورودِ بعدی با کلیدِ نو کار می‌کند.');
console.log('');
