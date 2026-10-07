#!/usr/bin/env node
// ============================================================
// خواهرِ زمانِ‌اجرای آزمونِ «مسیرهای ثابت» — با سرورِ واقعیِ Next و بدونِ بک‌اند
// ============================================================
// `src/app/internalLinks.test.ts` همین مسیرها را *ایستا* می‌سنجد: هر ارجاعِ
// داخلی باید به فایلی در `public/` یا مسیری در App Router برسد. خودِ آن آزمون
// عمداً سرور بالا نمی‌آورد («کند، شکننده، و همان دو نکته را می‌سنجد») — و همین
// یک شکافِ واقعی باقی می‌گذارد: اینکه فایلی روی دیسک باشد و مسیری در درختِ
// App Router وجود داشته باشد، ثابت نمی‌کند سرورِ *ساخته‌شده* آن را ۲۰۰ می‌دهد.
//
// چرا این شکاف تئوری نیست:
//   • `existsSync` روی ویندوز به بزرگی/کوچکیِ حرف بی‌توجه است ولی Next برای
//     فایل‌های `public` حساس است — مدرکش در سرآمدِ همان آزمون آمده. یعنی جفتِ
//     ارجاع/فایل می‌تواند روی ماشینِ دولوپر سبز و روی لینوکسِ سرور ۴۰۴ باشد.
//   • تا همین اواخر پنج rewrite در `next.config.ts` محتوای `frontend/` را سرو
//     می‌کرد (`/assets/*`، `/sw.js`، `/manifest.webmanifest`،
//     `/offline.html`). با برداشتنِ آن‌ها، تنها چیزی که این مسیرها را زنده
//     نگه می‌دارد `public/` است — و هیچ‌چیز آن را *روی سرورِ واقعی* نمی‌سنجید.
//   • `/sitemap.xml` داده را از API می‌خواند. باید حتی وقتی API در دسترس نیست
//     حداقل صفحات ثابت را ۲۰۰ بدهد (خودش catch دارد؛ اینجا اثبات می‌شود).
//   • فونت‌های وزیر: `@font-face` در `globals.css` پنج فایلِ `.woff2` را نام
//     می‌برد، ولی **هیچ‌کدام از دو لایه** سنجیده نمی‌شد — آزمونِ ایستا `url()`
//     در CSS را نمی‌خواند. اگر یکی‌شان ۴۰۴ شود، مرورگر بی‌صدا به فونتِ سیستم
//     برمی‌گردد و تایپوگرافیِ کلِ سایت عوض می‌شود بدون هیچ خطای قرمزی.
//
// و چرا «بدونِ بک‌اند»: اگر بک‌اند بالا باشد، مسیرهای ثابت ممکن است از پروکسیِ
// `/api` و `/picture` سیر شوند و سنجش، همان چیزی را که ادعا می‌کند نمی‌سنجد.
// پس خودِ اسکریپت هم پیش‌شرط را می‌سنجد و اگر بک‌اند بالا باشد با کدِ ۲
// می‌شکند — «سبزِ خالی» از «سنجیده شد» جدا می‌ماند.
//
// اجرا:
//   node scripts/static-paths-live.mjs
//   node scripts/static-paths-live.mjs --next=http://127.0.0.1:3002
//   node scripts/static-paths-live.mjs --allow-backend   # فقط برای توسعهٔ محلی
//
// کدِ خروج: ۰ = همه ۲۰۰ · ۱ = مسیرِ غیرِ۲۰۰ · ۲ = پیش‌شرط برقرار نیست

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(HERE, "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};

const NX = String(flag("next", "http://127.0.0.1:3001")).replace(/\/+$/, "");
const BACKEND = String(flag("backend", "http://127.0.0.1:3000")).replace(/\/+$/, "");
const ALLOW_BACKEND = flag("allow-backend", false) === true;

// ------------------------------------------------------------
// فهرستِ مسیرها — هر ردیف با دلیلش، تا حذفِ یک ردیف یک تصمیم باشد نه فراموشی
// ------------------------------------------------------------
const PATHS = [
  ["/manifest.webmanifest", "مانیفستِ PWA؛ layout به آن لینک می‌دهد"],
  ["/sw.js", "سرویس‌ورکرِ فروشگاه"],
  ["/offline.html", "صفحه‌ی آفلاین — تنها چیزی که قطعیِ اینترنت را مدیریت می‌کند"],
  ["/.well-known/security.txt", "RFC 9116"],
  ["/assets/favicon.svg", "آیکونِ layout (icon)"],
  ["/assets/apple-touch-icon.png", "آیکونِ layout (apple)"],
  ["/assets/icons.svg", "اسپرایتِ آیکون‌ها — `IconSprite` در زمانِ اجرا fetch می‌کند و نبودش بی‌صدا به نسخه‌ی درون‌خطی می‌افتد"],
  ["/robots.txt", "مسیرِ متادیتای App Router (`app/robots.ts`)"],
  ["/sitemap.xml", "مسیرِ متادیتای App Router — باید بدونِ API هم ۲۰۰ بدهد"],
];

// آیکون‌های مانیفست از *خودِ مانیفست* خوانده می‌شوند، نه دستی تکرار: اگر فردا
// آیکونی اضافه شود، همین سنجش خودبه‌خود پوشش می‌دهد و لازم نیست کسی یادش باشد.
let manifestError = null;
try {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(FRONTEND_DIR, "public", "manifest.webmanifest"), "utf8"),
  );
  for (const icon of manifest.icons ?? []) {
    PATHS.push([icon.src, "آیکونِ اعلام‌شده در مانیفستِ PWA"]);
  }
} catch (e) {
  manifestError = e.message;
}

// فونت‌های وزیر هم از *خودِ `globals.css`* خوانده می‌شوند، نه دستی تکرار. اگر
// فردا یک وزن اضافه یا کم شود، فهرست خودبه‌خود عوض می‌شود — و صفر تا یعنی
// regex از کار افتاده، که مثلِ نبودِ مانیفست قرمز می‌شود (وگرنه پوشش بی‌صدا
// کوچک می‌شد، دقیقاً همان چیزی که این سنجش برای گرفتنش نوشته شده).
let fontError = null;
const FONT_CSS = path.join(FRONTEND_DIR, "src", "app", "globals.css");
try {
  const css = fs.readFileSync(FONT_CSS, "utf8");
  const urls = [...css.matchAll(/url\(\s*['"]([^'"]+\.woff2)['"]\s*\)/g)].map((m) => m[1]);
  const uniq = [...new Set(urls)];
  if (!uniq.length) throw new Error("هیچ url(...woff2) در globals.css پیدا نشد");
  for (const u of uniq) PATHS.push([u, "فونتِ وزیر — `@font-face` در globals.css"]);
} catch (e) {
  fontError = e.message;
}

// یکتا کردن، با نگه‌داشتنِ ترتیب
const seen = new Set();
const targets = PATHS.filter(([p]) => (seen.has(p) ? false : (seen.add(p), true)));

// ------------------------------------------------------------
// پیش‌شرط: بک‌اند نباید بالا باشد
// ------------------------------------------------------------
async function backendIsUp() {
  try {
    const res = await fetch(`${BACKEND}/api/health`, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

// خروجِ ناگهانی با `process.exit()` اینجا امن نیست: روی ویندوز با سوکتِ بازِ
// fetch (undici) می‌جنگد و به‌جای کدِ خودمان یک assertion crash می‌دهد. پس
// همه‌ی مسیرها فقط `exitCode` را می‌گذارند و پروسه طبیعی تمام می‌شود.
let exitCode = 0;
if (manifestError) {
  console.error(`✖ مانیفستِ PWA خوانده نشد: ${manifestError}`);
  exitCode = 2;
} else if (fontError) {
  console.error(`✖ فونت‌ها از globals.css خوانده نشدند: ${fontError}`);
  exitCode = 2;
} else if (!ALLOW_BACKEND && (await backendIsUp())) {
  console.error(
    `✖ بک‌اند روی ${BACKEND} بالاست. این سنجش فقط وقتی معنا دارد که بک‌اند خواب ` +
      `باشد، وگرنه مسیرها ممکن است از پروکسی سیر شوند و آزمون همان چیزی را ` +
      `که ادعا می‌کند نسنجد.\n` +
      `   اول بک‌اند را بخوابان (یا با --allow-backend آگاهانه رد شو).`,
  );
  exitCode = 2;
}

// ------------------------------------------------------------
// سنجش
// ------------------------------------------------------------
async function fetchStatus(p) {
  try {
    const res = await fetch(NX + p, {
      redirect: "manual", // ریدایرکت «موفقیت» نیست؛ ۲۰۰ می‌خواهیم
      signal: AbortSignal.timeout(15000),
    });
    return { status: res.status };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

if (exitCode === 0) {
  console.log(`مسیرهای ثابت و PWA — Next ${NX} بدونِ بک‌اند\n`);

  const failures = [];
  for (const [p, why] of targets) {
    const { status, error } = await fetchStatus(p);
    const ok = status === 200;
    if (!ok) failures.push(`${p} → ${status || `خطا (${error})`} (${why})`);
    console.log(`  ${ok ? "✔" : "✖"} ${p.padEnd(32)} ${String(status || "—").padEnd(4)} ${why}`);
  }

  console.log("");
  if (failures.length) {
    console.log(`✖ ${failures.length} مسیرِ ثابت ۲۰۰ نداد:`);
    for (const f of failures) console.log(`  • ${f}`);
    exitCode = 1;
  } else {
    console.log(`✔ هر ${targets.length} مسیرِ ثابت و PWA با بک‌اندِ خواب ۲۰۰ داد.`);
  }
}

process.exitCode = exitCode;
