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

import path from "node:path";
import { fileURLToPath } from "node:url";
// فهرستِ مسیرها و منطقِ کشفش در یک ماژولِ جدا زندگی می‌کنند تا نگهبانِ
// `src/app/staticPathsCoverage.test.ts` همان را import کند و دو فهرستِ
// واگرا نداشته باشیم (آن آزمون می‌سنجد که هر ارجاعِ سورس سنجیده شود).
import { collectTargets } from "./static-paths.mjs";

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
// فهرستِ مسیرها — از ماژولِ مشترک (هر ردیف با دلیلش؛ چرا جدا شد بالای آن)
// ------------------------------------------------------------
const { targets, manifestError, iconsEmpty, fontError } = collectTargets({
  manifestPath: path.join(FRONTEND_DIR, "public", "manifest.webmanifest"),
  cssPath: path.join(FRONTEND_DIR, "src", "app", "globals.css"),
});

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
} else if (iconsEmpty) {
  console.error(
    "✖ مانیفستِ PWA هیچ آیکونی در فهرستِ اصلی ندارد — پوششِ آیکون‌ها بی‌صدا " +
      "کوچک می‌شد، پس سنجش را انجام نمی‌دهیم.",
  );
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
