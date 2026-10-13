#!/usr/bin/env node
/* ============================================================
   tests/recovery-codes.js — «گم‌شدنِ گوشیِ مدیر نباید به قفل‌شدنِ پنل تبدیل شود»

   ---------- چرا این آزمون وجود دارد ----------
   عاملِ دوم (TOTP) یک ریسکِ تازه ساخت که خودش قبا‌لاً نبود: کلید فقط در
   گوشیِ مدیر است. گوشی که گم/عوض/ریست شود، کلید هم با آن می‌رود و درِ پنل
   برای همیشه بسته می‌ماند. یعنی ارزان‌ترین راهِ از‌کار‌انداختنِ پنل،
   برداشتنِ گوشیِ مدیر بود — و هیچ‌چیز این را نمی‌گفت.

   کدِ پشتیبان این را می‌بندد، ولی *چهار* چیزِ جدا باید با هم درست باشند و
   هر کدام تنها، نصفِ کار است:

     ۱) **قاعده** (`lib/mfa.js`) — قالب، هش، ساخت، تطبیق، و شکافِ پوشش.
        این‌جا خالص اجرا می‌شود، در یک پروسهٔ **بی‌دیتابیس** (چون همان فایل
        قاعده، دیتابیس را باز نمی‌کند؛ مرز عمدی است).
     ۲) **مصرفِ دائمی** (`lib/db.js` + `routes/auth.js`) — هر کد **یک بار**.
        اگر «مصرف‌شده» فراموش شود (یا با TTL نگه داشته شود)، همان کاغذی که
        مدیر کنارِ مانیتور گذاشته تا ابد کار می‌کند.
     ۳) **اجبارِ production** (`lib/security-config.js`) — هر مدیرِ کلیددار
        *باید* کدِ پشتیبان داشته باشد، وگرنه سرور بالا نمی‌آید. بدونِ این،
        خاصیت یک امکانِ اختیاری می‌شود که ممکن است هیچ‌وقت روشن نشود.
     ۴) **نمای پنل** (Next) — «کدام مدیر قفل‌شدنی است» و «خودم چند تا دارم»
        باید دیده شود. تا امروز پنل در همان صفحه‌ای که هشدارِ یک‌عاملی‌بودن
        را نشان می‌دهد، هیچ‌چیزِ این ریسک را نمی‌گفت.

   ---------- چرا دو نیمه (ایستا + زنده) ----------
   نیمهٔ ایستا سورس را می‌خواند و بی‌سرور اجرا می‌شود، ولی نمی‌تواند ثابت کند
   سرور واقعاً همان کار را می‌کند. نیمهٔ زنده روی **سندباکسِ یک‌بارمصرف**
   (`tests/sandbox.js`) سرورِ واقعی بالا می‌آورد و کلِ مسیر را با HTTP می‌رود:
   کدِ ناشناخته، کدِ درست، همان کدِ درست دوباره (باید «مصرف‌شده» بگوید)،
   کدِ دومِ کاغذ، و در آخر کدِ خودِ اپ (که باید سرِ جایش باشد).

   ---------- رمزِ واقعی در مخزن نوشته نمی‌شود ----------
   کدها، کلیدِ TOTP، و دیتابیس همه در هر اجرا از نو ساخته می‌شوند. یک رشتهٔ
   به‌ظاهر تصادفیِ کنارِ کلمهٔ «recovery» دقیقاً همان چیزی است که اسکنرِ راز
   دنبالش می‌گردد؛ و استثناگرفتن برای یک ثابتِ بی‌ارزش روزی روی یک رازِ واقعی
   هم اعمال می‌شود.

   ---------- اجرا ----------
     node tests/recovery-codes.js      → ۰ سبز، ۱ قرمز، ۲ پیش‌شرط نبود
   ============================================================ */
'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const {
  BACKEND_DIR: DIR, PROJECT_DIR: REPO,
  makeSandboxData, removeSandboxData, serverEnv
} = require('./sandbox');
const mfaLib = require('../lib/mfa');
const totpLib = require('../lib/totp');

const read = (p) => fs.readFileSync(p, 'utf8');
const AUTH = read(path.join(DIR, 'routes', 'auth.js'));
const ADMIN_ROUTE = read(path.join(DIR, 'routes', 'admin.js'));
const CONFIG = read(path.join(DIR, 'lib', 'security-config.js'));
const DB = read(path.join(DIR, 'lib', 'db.js'));
const MFA = read(path.join(DIR, 'lib', 'mfa.js'));
const VIEW = read(path.join(REPO, 'next-frontend', 'src', 'components', 'admin', 'SystemContent.tsx'));
const TYPES = read(path.join(REPO, 'next-frontend', 'src', 'lib', 'adminTypes.ts'));
const ACTIVITY = read(path.join(REPO, 'next-frontend', 'src', 'components', 'admin', 'ActivityContent.tsx'));
const LOGIN = read(path.join(REPO, 'next-frontend', 'src', 'components', 'LoginForm.tsx'));
const TOOL = read(path.join(DIR, 'tools', 'admin-recovery.js'));
const ENV_EXAMPLE = read(path.join(DIR, '.env.example'));

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n--- ${title} ---`); }

const ADMIN = '09121234567';
const OTHER = '09129876543';
const KEY_ADMIN = totpLib.randomSecret();

console.log('\n=== Recovery code guard (losing the phone must not lock the panel) ===\n');

/* ============================================================
   ۱) قاعده — در پروسهٔ فرزند و با محیطِ کنترل‌شده
   ============================================================ */
/* چرا پروسهٔ فرزند و نه in-process: `lib/mfa.js` پیکربندی را یک بار در
   زمانِ بارگذاری می‌خواند. یک پروسه فقط یک محیط را نشان می‌دهد، و اگر محیطِ
   خودِ توسعه‌دهنده ADMIN_RECOVERY_CODES داشته باشد، آزمون به‌جای قاعده، محیط
   را می‌سنجد. */
section('۱) قاعده: هشِ کد در پیکربندی، و تطبیقی که کد را مصرف نمی‌کند');

const PROBE = `
  const phones = JSON.parse(process.env.PROBE_PHONES || '[]');
  const mfa = require('./lib/mfa');
  // شکافِ پوشش را *قبل* از دست‌زدن به محیط می‌سنجیم: در ادامهٔ همین پروسه
  // خطِ کدهای ساختهٔ‌شده در محیط می‌نشیند.
  const gapBefore = mfa.recoveryGap(phones);
  const codes = mfa.generateRecoveryCodes(3);
  const formatted = codes.map(mfa.formatRecoveryCode);
  const envLine = mfa.recoveryEnvLine(process.env.PROBE_PHONE, codes);
  const stored = envLine.split('=')[1];
  // همان کاری که سرور می‌کند: خط را در محیط بگذار و پیکربندی را از نو بخوان.
  process.env.ADMIN_RECOVERY_CODES = stored;
  delete require.cache[require.resolve('./lib/mfa')];
  const fresh = require('./lib/mfa');
  process.stdout.write(JSON.stringify({
    codes, formatted, stored,
    plaintextAbsent: !codes.some((c) => stored.includes(c)),
    shaped: [fresh.recoveryShaped(formatted[0]), fresh.recoveryShaped(formatted[0].toLowerCase()),
             fresh.recoveryShaped('123456'), fresh.recoveryShaped('KRND-SJJ2-ZUN'), fresh.recoveryShaped('')],
    ok: fresh.matchRecoveryCode(process.env.PROBE_PHONE, formatted[0]),
    caseFold: fresh.matchRecoveryCode(process.env.PROBE_PHONE, formatted[0].toLowerCase()),
    dashed: fresh.matchRecoveryCode(process.env.PROBE_PHONE, ' ' + formatted[0].replace(/-/g, '') + ' '),
    unknown: fresh.matchRecoveryCode(process.env.PROBE_PHONE, 'AAAA-BBBB-CCCC'),
    digits: fresh.matchRecoveryCode(process.env.PROBE_PHONE, '123456'),
    otherPhone: fresh.matchRecoveryCode('09120000000', formatted[0]),
    count: fresh.recoveryCountFor(process.env.PROBE_PHONE),
    gapBefore,
    invalidPlaintext: fresh.parseRecoveryCodes('09121234567:' + codes[0]).invalid.length,
    invalidMixed: fresh.parseRecoveryCodes('09121234567:' + fresh.hashRecoveryCode(codes[0]) + ' ' + codes[1]).invalid.length
  }));
`;

function probe(secrets, phones) {
  const r = spawnSync(process.execPath, ['-e', PROBE], {
    cwd: DIR,
    env: {
      ...process.env,
      ADMIN_RECOVERY_CODES: secrets,
      // کلید برای همان شمارهٔ مدیر همیشه ست می‌شود: سنجشِ «شکافِ پوشش»
      // دقیقاً حالتی است که مدیر کلید دارد ولی کدِ پشتیبان ندارد.
      ADMIN_TOTP_SECRETS: `${ADMIN}:${KEY_ADMIN}`,
      PROBE_PHONE: ADMIN,
      PROBE_PHONES: JSON.stringify(phones || [ADMIN])
    },
    encoding: 'utf8'
  });
  if (r.status !== 0) return { error: ((r.stderr || '') + (r.stdout || '')).trim().slice(-300) };
  try { return JSON.parse(r.stdout); } catch (e) { return { error: 'پاسخِ خوانا نبود' }; }
}

const p = probe('', [ADMIN]);
if (p.error) {
  console.error(`✖ پیش‌شرطِ نگهبان: سنجشِ قاعده اجرا نشد — ${p.error}`);
  process.exit(2);
}

check('هش‌های پیکربندی، هیچ‌کدام از کدها را در خود ندارند (خودِ کد به سرور نمی‌رود)',
  p.plaintextAbsent === true);
check('قالب: ۱۲ نویسهٔ Base32 کدِ پشتیبان است — با خطِ تیره و حروفِ کوچک هم',
  p.shaped[0] === true && p.shaped[1] === true);
check('و کدِ ۶ رقمیِ اپ هرگز کدِ پشتیبان شمرده نمی‌شود (دو مسیرِ جدا)',
  p.shaped[2] === false && p.shaped[3] === false && p.shaped[4] === false);
check('کدِ درست تطبیق می‌شود و هشِ همان خانه برمی‌گردد',
  p.ok?.ok === true && typeof p.ok.hash === 'string' && p.ok.hash.length === 64, JSON.stringify(p.ok));
check('تطبیق به بزرگی/کوچکیِ حرف و خطِ تیره و فاصله حساس نیست (مدیر از روی کاغذ می‌خواند)',
  p.caseFold?.ok === true && p.dashed?.ok === true);
check('کدِ ناشناخته ⇒ mismatch، کدِ ۶ رقمی ⇒ format، شمارهٔ بی‌کد ⇒ not-configured',
  p.unknown?.reason === 'mismatch' && p.digits?.reason === 'format'
  && p.otherPhone?.reason === 'not-configured',
  `${p.unknown?.reason} / ${p.digits?.reason} / ${p.otherPhone?.reason}`);
check('شمارِ کدهای پیکربندی‌شده از همان فهرست خوانده می‌شود',
  p.count === 3, String(p.count));

// «تطبیق» باید بی‌حالت باشد: مصرف در routes/ انجام می‌شود، وگرنه نگهبانِ
// قاعده (همین‌جا، در پروسهٔ بی‌دیتابیس) هر بار یک کد را می‌سوزاند.
check('تطبیق، کد را مصرف نمی‌کند (مصرف در لایهٔ مسیر است، نه در قاعده)',
  /^function matchRecoveryCode\(phone, input\) \{/m.test(MFA)
  // فراخوانی، نه نام: توضیحِ همین فایل اسمِ `lib/db.js` را می‌آورد و آن
  // اشکالی ندارد — چیزی که نباید باشد، خودِ فراخوانی و require است.
  && !/consumeRecoveryCode\(/.test(MFA) && !/require\(['"]\.\/db['"]\)/.test(MFA));

// خطِ *کدها* جای خطِ *هش‌ها* — شایع‌ترین اشتباه، و بی‌صدا: مدیر کدهایش را
// «تنظیم‌شده» می‌بیند و روزِ گم‌شدنِ گوشی می‌فهمد هیچ‌کدام کار نمی‌کند.
check('مقداری که شکلِ کد دارد (نه هش) ناخوانا شمرده می‌شود',
  p.invalidPlaintext === 1, String(p.invalidPlaintext));
check('یک هشِ سالم در همان سطر، بقیهٔ سطر را خراب نمی‌کند — ولی سطرِ خراب کل رد می‌شود',
  p.invalidMixed === 1, String(p.invalidMixed));

check('مدیرِ کلیددارِ بی‌کدِ پشتیبان ⇒ شکافِ پوشش (همان حالتی که اجبار می‌شود)',
  p.gapBefore?.keyed === 1 && p.gapBefore?.missing === 1 && p.gapBefore?.covered === 0,
  JSON.stringify(p.gapBefore));
check('و مدیری که کلید ندارد در آن شمارش نمی‌آید (او اصلاً به این پله نمی‌رسد)',
  mfaLib.recoveryGap(['09120000002']).keyed === 0, 'بی‌کلید ⇒ keyed صفر');

/* ============================================================
   ۲) تولیدِ کد و خطِ محیط
   ============================================================ */
section('۲) ساخت: تازه، بی‌تکرار، با آنتروپیِ کافی، و بدونِ کدِ خام در خطِ محیط');

const gen = mfaLib.generateRecoveryCodes(8);
check('تعدادِ کدها همان چیزی است که خواسته شده', gen.length === 8, String(gen.length));
check('هیچ دو کدی یکسان نیستند', new Set(gen).size === 8);
check('هر کد ۱۲ نویسه از الفبای Base32 است', gen.every((c) => /^[A-Z2-7]{12}$/.test(c)));
// ۱۲ نویسه × ۵ بیت = ۶۰ بیت. اگر روزی کسی طول را کوتاه کند (۴ نویسه = ۲۰ بیت
// که با حدس‌زدن شکسته می‌شود)، این‌جا قرمز می‌شود.
check('کدها ۶۰ بیت آنتروپی دارند (۱۲ نویسهٔ Base32)',
  mfaLib.RECOVERY.groups * mfaLib.RECOVERY.groupLen === 12, String(mfaLib.RECOVERY.groups * mfaLib.RECOVERY.groupLen));
const line = mfaLib.recoveryEnvLine(ADMIN, gen);
check('خطِ محیط فقط هش دارد و هیچ کدِ خامی در آن نیست',
  /^ADMIN_RECOVERY_CODES=09\d{9}:[0-9a-f]{64}( [0-9a-f]{64}){7}$/.test(line));
check('هش همان کد است (نه چیزِ دیگر): SHA-256ِ شکلِ یکدست‌شده',
  mfaLib.hashRecoveryCode(mfaLib.formatRecoveryCode(gen[0]).toLowerCase())
  === require('crypto').createHash('sha256').update(gen[0]).digest('hex'));
check('ابزارِ ساخت هم از همین قاعده می‌آید (یک منبع، نه دو پیاده‌سازی)',
  /require\('\.\.\/lib\/mfa'\)/.test(TOOL) && /recoveryEnvLine\(phone, codes\)/.test(TOOL));
check('و به مدیر می‌گوید کدها را در .env نگذارد (فقط خطِ هش‌ها را)',
  /فقط \*هش\*|فقط \*هش‌ها\*/.test(TOOL) && /ADMIN_RECOVERY_CODES/.test(ENV_EXAMPLE));

/* ============================================================
   ۳) خودآزمونِ نگهبان — ابزارِ خراب باید قرمز شود
   ============================================================ */
section('۳) خودآزمون (نگهبانِ خراب باید قرمز شود، نه سبزِ خالی)');

// همان سنجشِ «خطِ محیط کدِ خام ندارد» روی یک نمونهٔ عمداً غلط: اگر ابزار این
// را قبول کند، نگهبان هم قبول می‌کند و کلِ خاصیت بی‌صدا می‌شود.
const looksHashed = (s) => /^ADMIN_RECOVERY_CODES=09\d{9}:[0-9a-f]{64}( [0-9a-f]{64})*$/.test(s);
check('خودآزمون: خطی که کدِ خام دارد رد می‌شود',
  looksHashed(`ADMIN_RECOVERY_CODES=${ADMIN}:${gen[0]}`) === false);
check('خودآزمون: نمونهٔ درست قبول می‌شود', looksHashed(line) === true);
check('خودآزمون: قالبِ کدِ اپ به‌عنوانِ کدِ پشتیبان پذیرفته نمی‌شود',
  mfaLib.recoveryShaped('123456') === false && mfaLib.recoveryShaped('12345') === false);
// و معکوسش: کلیدِ TOTP هم نباید کدِ پشتیبان شمرده شود — وگرنه یک ورودی دو
// تفسیر پیدا می‌کند و دامنهٔ مقایسه در هر ورود پهن‌تر می‌شود.
check('خودآزمون: کلیدِ Base32ِ ۳۲نویسه‌ای هم شکلِ کدِ پشتیبان نیست (طول قفل است)',
  mfaLib.recoveryShaped(KEY_ADMIN) === false);

/* ============================================================
   ۴) مسیرِ ورود: تفکیکِ قالب، مصرفِ دائمی، رویدادِ جدا
   ============================================================ */
section('۴) مسیرِ ورود: قالب می‌گوید کدام عامل است');

// تفکیک بر اساسِ *قالب* (و نه «اول TOTP را امتحان کن»)، چون کدِ ۶ رقمی و کدِ
// ۱۲ نویسه‌ای هیچ‌وقت هم‌پوشانی ندارند: هر ورودی یک تفسیر دارد.
check('مسیر، از قالبِ ورودی می‌فهمد کدام سنجش را اجرا کند',
  /const viaRecovery = mfa\.recoveryShaped\(req\.body\?\.code\)/.test(AUTH)
  && /const result = viaRecovery/.test(AUTH));
check('و هر دو شاخه از یک نقطه نتیجه می‌گیرند (کپیِ دومِ منطقِ ورود ساخته نشده)',
  /: mfa\.verifyCode\(\{ userId: user\.id, phone: user\.phone, code: req\.body\?\.code \}\);/.test(AUTH));

// مصرف در جدولِ دائمی، نه در `shared_state`: آن انبارک TTL دارد و کدِ پشتیبان
// تاریخِ انقضا ندارد.
check('مصرف از جدولِ دائمی می‌آید و اتمیک است (INSERT OR IGNORE + changes)',
  /CREATE TABLE IF NOT EXISTS recovery_code_use/.test(DB)
  && /INSERT OR IGNORE INTO recovery_code_use/.test(DB)
  && /function consumeRecoveryCode\(userId, codeHash, atMs = Date\.now\(\)\) \{/.test(DB));
check('و کلیدِ اصلی (user_id, code_hash) جلوی مصرفِ دوباره را می‌گیرد',
  /PRIMARY KEY \(user_id, code_hash\)/.test(DB));
check('حالتِ مصرف در `shared_state` نگه داشته نمی‌شود (TTL یعنی کدِ مصرف‌شده برمی‌گردد)',
  !/makeSharedStore\('recovery/.test(DB) && !/makeSharedStore\('recovery/.test(AUTH));
check('مسیر، «مصرف‌شده» را از «تطبیق نشد» جدا می‌کند',
  /if \(!consumeRecoveryCode\(userId, match\.hash\)\) return \{ ok: false, reason: 'used' \};/.test(AUTH));
check('عددِ باقی‌مانده از دو طرف حساب می‌شود: پیکربندی (mfa) منهای مصرف (db)',
  /mfa\.recoveryCountFor\(phone\) - usedRecoveryCodes\(userId\)\.length/.test(AUTH));

// چهار حالتِ خطا چهار پیامِ متفاوت دارند: «کدت غلط است» برای کسی که کد را از
// روی کاغذ درست خوانده و فقط شکلش را غلط زده، بی‌فایده است.
const REASONS = ['format', 'not-configured', 'used', 'mismatch'];
check('هر چهار حالتِ خطا پیامِ خودش را دارد',
  REASONS.every((r) => new RegExp(`['"]?${r}['"]?:`).test(AUTH)), REASONS.join(', '));
check('پیامِ «مصرف‌شده» کدِ بعدیِ کاغذ را می‌خواهد (نه اینکه کاربر حدس بزند)',
  /قبلاً مصرف شده؛ کدِ بعدی روی کاغذتان را وارد کنید/.test(AUTH));

// کدِ پشتیبان یک رویدادِ *جدا* است، نه «تأییدِ کدِ دوم»: یعنی گوشی در دست
// نیست، یا کاغذ به دستِ کسی افتاده که کدِ پیامکی را هم گرفته.
check('ورود با کدِ پشتیبان رویدادِ خودش را در دفترِ پنل ثبت می‌کند',
  /logAdminAction\(user\.id, 'admin_recovery_ok'/.test(AUTH));
check('و در لاگِ سرور هم هشدار می‌شود (کسی باید متوجه شود)',
  /log\.warn\('Admin signed in with a recovery code'/.test(AUTH));
check('برای همین رویداد، برچسبِ فارسی در پنل هست (وگرنه کلیدِ خام دیده می‌شود)',
  /admin_recovery_ok: "ورود با کد پشتیبان \(گوشی در دست نبود\)"/.test(ACTIVITY));
check('و رنگش «هشدار» است نه «معمولی» (ورودِ با کاغذ خبرِ کم‌اهمیتی نیست)',
  /admin_recovery_ok: "warn"/.test(ACTIVITY));
check('پاسخِ ورودِ موفق می‌گوید با کدام عامل بود و چند تا مانده',
  /method: 'recovery'/.test(AUTH) && /recoveryRemaining: left/.test(AUTH)
  && /recoveryMessage: left === 0/.test(AUTH));
check('مسیرِ کدِ اپ هم همان `method` را می‌دهد (رابط مجبور به حدس نباشد)',
  /res\.json\(\{ ok: true, user: publicUser\(user\), method: 'totp' \}\)/.test(AUTH));
// سقفِ تلاش و عددِ باقی‌ماندهٔ *کدِ پیامکی* دست‌نخورده باید بماند: نگهبانِ
// otp-attempt-cap روی همان دو قفل است و شکستنشان یک باگِ جدا است.
check('سقفِ تلاش و عددِ باقی‌ماندهٔ پیشین دست‌نخورده مانده',
  /const mfaLeft = Math\.max\(0, MAX_MFA_ATTEMPTS - mfaTry\);/ .test(AUTH)
  && /remaining: mfaLeft/.test(AUTH));

/* ============================================================
   ۵) اجبارِ production
   ============================================================ */
section('۵) production: هر مدیرِ کلیددار باید راهِ برگشت داشته باشد');

const RULE = `
  const { validateAdminRecovery } = require('./lib/security-config');
  const out = {};
  const run = (name, args) => {
    try { validateAdminRecovery(args); out[name] = 'ok'; }
    catch (e) { out[name] = e.message; }
  };
  run('devNoCodes', { isProduction: false, adminsWithKeys: ['09121234567'], adminsWithRecovery: [] });
  run('prodNoCodes', { isProduction: true, adminsWithKeys: ['09121234567'], adminsWithRecovery: [] });
  run('prodWithCodes', { isProduction: true, adminsWithKeys: ['09121234567'], adminsWithRecovery: ['09121234567'] });
  run('prodKeyless', { isProduction: true, adminsWithKeys: [], adminsWithRecovery: [] });
  run('prodPartial', { isProduction: true, adminsWithKeys: ['09121234567', '09129876543'], adminsWithRecovery: ['09121234567'] });
  process.stdout.write(JSON.stringify(out));
`;
const rule = (() => {
  const r = spawnSync(process.execPath, ['-e', RULE], { cwd: DIR, env: { ...process.env }, encoding: 'utf8' });
  if (r.status !== 0) return { error: ((r.stderr || '') + (r.stdout || '')).trim().slice(-300) };
  try { return JSON.parse(r.stdout); } catch (e) { return { error: 'پاسخِ خوانا نبود' }; }
})();
if (rule.error) {
  console.error(`✖ پیش‌شرطِ نگهبان: سنجشِ اجبار اجرا نشد — ${rule.error}`);
  process.exit(2);
}

check('در توسعه چیزی اجباری نیست (کلونِ تازه به دیوار نمی‌خورد)', rule.devNoCodes === 'ok');
check('در production، مدیری که کلید دارد ولی کدِ پشتیبان ندارد ⇒ سرور بالا نمی‌آید',
  typeof rule.prodNoCodes === 'string' && /ADMIN_RECOVERY_CODES/.test(rule.prodNoCodes));
check('و پیامش دستورِ ساخت را می‌دهد، نه فقط «کد ندارید»',
  /node tools\/admin-recovery\.js/.test(String(rule.prodNoCodes)));
check('مدیری که کد دارد نه (بی‌مرجع اجباری نمی‌شود)',
  rule.prodWithCodes === 'ok');
// مدیرِ بی‌کلید اصلاً به پلهٔ دوم نمی‌رسد؛ خواستنِ کدِ پشتیبان از او یک
// اجبارِ بی‌ربط است که سرِ هر راه‌اندازی خطا می‌سازد.
check('مدیرِ بی‌کلید اجباری نمی‌شود (شرط دقیقاً «کسی که می‌تواند قفل شود» است)',
  rule.prodKeyless === 'ok');
check('پوششِ ناقص هم سرور را می‌بندد (قفل‌شدنِ یک مدیر کافی است)',
  typeof rule.prodPartial === 'string' && /09129876543/.test(rule.prodPartial));
check('و همان قاعده در مسیرِ واقعیِ بوت صدا زده می‌شود، نه فقط تعریف شده',
  /validateAdminRecovery\(\{ isProduction, adminsWithKeys: totpSecretPhones, adminsWithRecovery: recoveryCodePhones \}\)/
    .test(CONFIG)
  && /recoveryCodePhones: mfa\.configuredRecoveryPhones\(\)/.test(read(path.join(DIR, 'server.js'))));
check('ورودیِ ناخوانا سرِ راه‌اندازی هشدار می‌شود (وگرنه مدیر فکر می‌کند تنظیم است)',
  /mfa\.recoveryInvalidEntries\(\)/.test(read(path.join(DIR, 'server.js'))));

/* ============================================================
   ۶) نمادِ پنل: «کدام مدیر قفل‌شدنی است» و «خودم چند تا دارم»
   ============================================================ */
section('۶) پنل: هشدارِ قفل‌شدن و شمارِ کدهای باقی‌مانده');

const sf = (ADMIN_ROUTE.match(/secondFactor: \{[\s\S]*?\n      \},/) || [''])[0];
check('فیلدِ `recovery` از همان قاعده می‌آید که اجبارِ بوت (یک منبع برای هر دو)',
  /\.\.\.mfa\.recoveryGap\(ADMIN_PHONES\)/.test(sf));
check('و شمارِ ورودیِ ناخوانا هم روی سیم می‌آید', /invalidEntries: mfa\.recoveryInvalidEntries\(\)\.length/.test(sf));
check('«خودم چند تا دارم» هم می‌آید (تنها راهِ فهمیدنِ ته‌کشیدنِ کاغذ، مصرفِ آخرین کد نباشد)',
  /mine: ownRecoveryStatus\(req\)/.test(sf)
  && /function ownRecoveryStatus\(req\)/.test(ADMIN_ROUTE));
check('`mine` برای مدیرِ بی‌کد `null` است، نه صفر (دو وضعیتِ متفاوت)', /if \(configured === 0\) return null;/.test(ADMIN_ROUTE));

// شرطِ مونت **و** متنِ هشدار، با هم. اگر فقط متن را بشماریم، `{false && (`
// جلوی همان بلوک هم این سنجش را سبز می‌گذارد — یعنی نگهبانی که با یک خط
// خاموش‌کردن دور می‌خورد. (جهشِ همین حالت در `guard-mutations.js` هست.)
check('کارتِ پنل هشدارِ قفل‌شدن را نشان می‌دهد (شرطش خاموش نشده)',
  /\{rec && rec\.missing > 0 && \(/.test(VIEW)
  && /با گم‌شدنِ گوشی، این مدیر از پنل بیرون می‌ماند/.test(VIEW));
check('و دستورِ ساخت را همان‌جا می‌گذارد (هشدارِ بی‌راهِ‌حل نیست)',
  /node tools\/admin-recovery\.js 09121234567/.test(VIEW));
check('و کدهای باقی‌ماندهٔ خودِ مدیر را می‌گوید', /const lowCodes = Boolean\(mine && mine\.remaining <= 2\);/.test(VIEW));
check('و به بندِ داوری (بالای صفحه) هم می‌آید — تنها چیزی که آدمِ عجله‌دار می‌خواند',
  /issues\.push\([\s\S]{0,400}?مدیرِ کلیددار کدِ پشتیبان ندارد/.test(VIEW)
  && /Boolean\(rec && rec\.missing > 0\)/.test(VIEW));
check('تایپِ فرانت همان فیلدها را دارد (سیم و تایپ یکی بمانند)',
  /recovery: AdminRecoveryStatus;/.test(TYPES)
  && /mine: \{ configured: number; used: number; remaining: number \} \| null;/.test(TYPES));
check('ورودیِ کدِ پشتیبان در صفحهٔ ورود جدا از شش خانهٔ رقمی است (وگرنه خاصیت بی‌اثر می‌ماند)',
  /کد پشتیبان دارم/.test(LOGIN) && /const RECOVERY_CODE_RE = \/\^\[A-Z2-7\]\{12\}\$\//.test(LOGIN));
check('و «چند تا مانده» پیش از رفتن به پنل گفته می‌شود (نه بعد از پایانِ کاغذ)',
  /if \(res\.method === "recovery"\) \{/.test(LOGIN) && /recovery-done/.test(LOGIN));

/* ============================================================
   ۷) آزمونِ زنده روی سندباکس
   ============================================================ */
section('۷) آزمونِ زنده: کدِ مصرف‌شده، کدِ بعدی، و کدِ اپ که سرِ جایش است');

const PORT = 3995;
const SANDBOX_DATA = makeSandboxData();
const ADMIN_PHONE = '0912' + String(Math.floor(1000000 + Math.random() * 8999999));
const CODES = mfaLib.generateRecoveryCodes(3);
const ENV_CODES = mfaLib.recoveryEnvLine(ADMIN_PHONE, CODES).split('=')[1];

function portFree(port) {
  return new Promise((resolve) => {
    const srv = require('net').createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

function startServer(port, extraEnv) {
  const out = { text: '' };
  const child = spawn(process.execPath, [path.join(DIR, 'server.js')], {
    cwd: DIR,
    env: serverEnv(SANDBOX_DATA, { PORT: String(port), ADMIN_PHONE: ADMIN_PHONE, ...extraEnv }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { out.text += d; });
  child.stderr.on('data', (d) => { out.text += d; });
  return { child, out, base: `http://127.0.0.1:${port}` };
}

async function healthy(srv) {
  if (srv.child.exitCode !== null) return false;
  try {
    const r = await fetch(`${srv.base}/api/health`);
    if (!r.ok) return false;
    if (!/json/i.test(r.headers.get('content-type') || '')) return false;
    const d = await r.json();
    return Boolean(d && d.ok === true);
  } catch (e) {
    return false;
  }
}

async function waitUp(srv) {
  for (let i = 0; i < 40; i++) {
    if (await healthy(srv)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function client(base) {
  const cookies = new Map();
  const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  return async function api(method, url, body) {
    const res = await fetch(base + '/api' + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies.size ? { Cookie: cookieHeader() } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    for (const c of raw) {
      const pair = c.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* بدنهٔ غیرِ JSON */ }
    return { status: res.status, data };
  };
}

// کدِ پیامکی از لاگِ سرور خوانده می‌شود (در حالتِ تست پیامک چاپ می‌شود).
async function codeFromLog(srv, phone) {
  for (let i = 0; i < 20; i++) {
    const m = [...srv.out.text.matchAll(new RegExp(`${phone}: (\\d{5})`, 'g'))];
    if (m.length) return m[m.length - 1][1];
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

// هر «ورودِ تازه» یک جانشستِ تازه می‌گیرد و تا پلهٔ دوم می‌رود. سقفِ بازفرست
// (۳۰ ثانیه برای هر شماره) مانع نیست: `otp/verify`ِ موفق ردیفِ کد را پاک
// می‌کند و مهلت هم با همان ردیف می‌رود — پس هر ورودِ کامل، مهلت را صفر
// می‌کند. اگر روزی این رفتار عوض شود، این آزمون ۴۲۹ می‌گیرد و صریح می‌گوید.
async function openPending(srv) {
  const api = client(srv.base);
  const ch = await api('GET', '/auth/otp/challenge');
  if (!ch.data?.token) return { error: `challenge failed: ${ch.status}` };
  const rq = await api('POST', '/auth/otp/request', { phone: ADMIN_PHONE, challenge: ch.data.token });
  if (rq.status !== 200) return { error: `otp/request: ${rq.status} ${JSON.stringify(rq.data)}` };
  const code = await codeFromLog(srv, ADMIN_PHONE);
  if (!code) return { error: 'کدِ پیامکی در لاگِ سرور پیدا نشد' };
  const verify = await api('POST', '/auth/otp/verify', { phone: ADMIN_PHONE, code });
  if (verify.status !== 200) return { error: `otp/verify: ${verify.status} ${JSON.stringify(verify.data)}` };
  if (!verify.data?.mfaRequired) return { error: 'پلهٔ دوم درخواست نشد (کلید/کدها به سرور نرسیده؟)' };
  return { api };
}

const finish = () => {
  console.log(`\nRecovery code checks: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

(async () => {
  const free = await portFree(PORT);
  check(`پورتِ ${PORT} برای سندباکس آزاد است`, free,
    free ? '' : `فرآیندِ دیگری پورتِ ${PORT} را گرفته — همان را ببند و دوباره اجرا کن`);
  if (!free) { removeSandboxData(SANDBOX_DATA); return finish(); }

  const srv = startServer(PORT, {
    ADMIN_TOTP_SECRETS: `${ADMIN_PHONE}:${KEY_ADMIN}`,
    ADMIN_RECOVERY_CODES: ENV_CODES
  });
  const up = await waitUp(srv);
  check('سرورِ سندباکس بالا آمد (با کلید و کدهای پشتیبان)', up,
    up ? '' : srv.out.text.slice(-400));
  if (!up) {
    srv.child.kill();
    removeSandboxData(SANDBOX_DATA);
    return finish();
  }

  try {
    /* ---------- کدِ ناشناخته، بعد همان نشست با کدِ درست ---------- */
    const one = await openPending(srv);
    if (one.error) {
      check('ورودِ اولِ سندباکس کامل شد', false, one.error);
    } else {
      const unknown = await one.api('POST', '/auth/totp/verify', { code: 'AAAA-BBBB-CCCC' });
      check('کدِ ناشناخته ۴۰۰ می‌گیرد و «تنظیم‌نشده»/«اشتباه» را از هم جدا می‌گوید',
        unknown.status === 400 && unknown.data?.reason === 'mismatch',
        `${unknown.status} ${JSON.stringify(unknown.data)}`);

      // همان نشست: مدیر بلافاصله کدِ درستِ کاغذ را می‌زند. شمارِ تلاشِ پلهٔ
      // دوم باید یکی جلو رفته باشد ولی ورود باید کامل شود (سقف ۵ است).
      const good = await one.api('POST', '/auth/totp/verify', { code: mfaLib.formatRecoveryCode(CODES[0]).toLowerCase() });
      check('کدِ درستِ کاغذ ورود را تمام می‌کند (با خطِ تیره و حروفِ کوچک)',
        good.status === 200, `${good.status} ${JSON.stringify(good.data)}`);
      check('و می‌گوید با کدِ پشتیبان بود، نه با اپ',
        good.data?.method === 'recovery', JSON.stringify(good.data?.method));
      check('و عددِ باقی‌مانده را می‌دهد (۳ کد داشتیم ⇒ ۲ مانده)',
        good.data?.recoveryRemaining === 2, String(good.data?.recoveryRemaining));
      check('و همان عدد را در جملهٔ فارسی هم می‌گذارد (کاربر فقط پیام را می‌بیند)',
        /۲ کدِ پشتیبان/.test(String(good.data?.recoveryMessage)), String(good.data?.recoveryMessage));

      /* ---------- همان کد، بارِ دوم: باید «مصرف‌شده» بگوید ---------- */
      const two = await openPending(srv);
      if (two.error) {
        check('ورودِ دومِ سندباکس کامل شد', false, two.error);
      } else {
        const replay = await two.api('POST', '/auth/totp/verify', { code: mfaLib.formatRecoveryCode(CODES[0]) });
        check('همان کد بارِ دوم رد می‌شود (مصرف دائمی است، نه TTLدار)',
          replay.status === 400 && replay.data?.reason === 'used',
          `${replay.status} ${JSON.stringify(replay.data)}`);

        const next = await two.api('POST', '/auth/totp/verify', { code: mfaLib.formatRecoveryCode(CODES[1]) });
        check('ولی کدِ بعدیِ همان کاغذ کار می‌کند',
          next.status === 200 && next.data?.recoveryRemaining === 1,
          `${next.status} ${JSON.stringify(next.data)}`);
      }

      /* ---------- کدِ اپ سرِ جایش است ---------- */
      const three = await openPending(srv);
      if (three.error) {
        check('ورودِ سومِ سندباکس کامل شد', false, three.error);
      } else {
        const viaApp = await three.api('POST', '/auth/totp/verify', { code: totpLib.totp(KEY_ADMIN) });
        check('ورود با کدِ اپِ Authenticator هنوز کار می‌کند و `method: totp` می‌دهد',
          viaApp.status === 200 && viaApp.data?.method === 'totp',
          `${viaApp.status} ${JSON.stringify(viaApp.data)}`);

        /* ---------- پنل: وضعیتِ کدهای پشتیبان روی HTTPِ واقعی ---------- */
        const status = await three.api('GET', '/admin/system-status');
        const rec = status.data?.security?.secondFactor?.recovery;
        check('پنل می‌گوید پوششِ کدِ پشتیبان کامل است (هیچ مدیری قفل‌شدنی نیست)',
          rec?.keyed === 1 && rec?.covered === 1 && rec?.missing === 0, JSON.stringify(rec));
        check('و ورودیِ ناخوانا صفر است (خطِ هش‌ها درست نشسته)', rec?.invalidEntries === 0, JSON.stringify(rec));
        check('و «خودم چند تا دارم» عددِ مصرف‌شده را نشان می‌دهد (۲ از ۳ مصرف شده)',
          rec?.mine?.configured === 3 && rec?.mine?.used === 2 && rec?.mine?.remaining === 1,
          JSON.stringify(rec?.mine));

        const activity = await three.api('GET', '/admin/activity');
        check('و ورودِ با کدِ پشتیبان در دفترِ رویدادها هست',
          JSON.stringify(activity.data).includes('admin_recovery_ok'),
          activity.status === 200 ? 'کلیدِ رویداد در فهرست نبود' : `activity: ${activity.status}`);
      }
    }
  } finally {
    try { srv.child.kill(); } catch (e) { /* بی‌اهمیت */ }
    removeSandboxData(SANDBOX_DATA);
  }
  finish();
})();
