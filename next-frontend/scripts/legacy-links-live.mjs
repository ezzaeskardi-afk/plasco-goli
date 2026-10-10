#!/usr/bin/env node
// ============================================================
// نگهبانِ بازنشستگیِ نشانی‌های عصرِ Express — نسخهٔ زنده
// ============================================================
// «هیچ لینکی ۴۰۴ یا واگرا نشود.» این فایل همان جمله را می‌سنجد.
//
// ---------- شکافی که این اسکریپت می‌بندد ----------
// `src/lib/legacyUrls.ts` نگاشتِ نام‌های عصرِ Express به مسیرهای تمیز است و
// `middleware.ts` همان را ۳۰۷ می‌کند. `parityManifest` هم برای هر صفحه یک
// probe دارد (`legacy-cart-html`: Express 200 / Next 307). ولی هیچ‌کدام از آن‌ها
// یک چیز را نمی‌سنجیدند:
//
//     **مقصد** ریدایرکت کجا می‌رود، و آیا آن مقصد زنده است؟
//
// یعنی اگر روزی کسی `/cart` را به `/سبد` تغییر دهد، `/cart.html` هنوز ۳۰۷
// می‌گیرد (probe سبز می‌ماند) ولی به یک ۴۰۴ می‌رسد: هر بوکمارک و هر لینکِ
// دست‌به‌دست‌شده می‌شکند و **هیچ نگهبانی نمی‌گیرد**. بدترینش برگشتِ درگاهِ
// پرداخت است (`/order-success.html`) — مشتری پول داده و صفحهٔ مرده می‌بیند.
//
// سه سنجشِ دیگر که هیچ‌جا نبود:
//   • پوششِ نام‌ها: هر `*.html` در پوستهٔ قدیمی (امروز: اوراکلِ منجمد) باید یا
//     مقصد داشته باشد یا دلیلِ مستندِ نبودنش (`LEGACY_NO_ALIAS`). فایلِ تازه‌ای
//     که کسی اضافه کند و نامش را در نگاشت نگذارد، امروز بی‌صدا است و فردا به
//     یک لینکِ مرده تبدیل می‌شود.  //   • نام‌هایی که *لینک* به آن‌ها اشاره می‌کند (نه فقط فایل‌ها): پوستهٔ قدیمی
//     به `index.html#about`، `login.html?next=order-success.html?orderId=۳` و
//     `account.html#wishlist` لینک می‌دهد. اگر نامی در نگاشت نباشد، همان لینک
//     پس از بازنشستگی ۴۰۴ می‌شود.
//   • sitemap: هیچ sitemapi نباید نشانی‌ای اعلام کند که خودش ریدایرکت می‌شود.
//     (`/products.html` در sitemapِ Express دقیقاً همین بود.)
//
// ---------- چرا «زنجیره» و نه فقط «کدِ وضعیت» ----------
// ۳۰۷ به‌تنهایی مدرک نیست. سه چیز باید با هم درست باشند:
//   ۱. کدِ وضعیت (۳۰۷/۳۰۱ — نه ۲۰۰، نه ۴۰۴)
//   ۲. مقصد — دقیقاً همان چیزی که `legacyRedirect()` می‌گوید (کوئری و
//      `?next=` هم ترجمه می‌شوند)
//   ۳. گامِ آخر — زنجیره باید روی یک صفحهٔ زنده (۲۰۰) تمام شود، نه روی ۴۰۴/۴۱۰
//
// ---------- اجرا ----------
//   node scripts/legacy-links-live.mjs                 # Next روی ۳۰۰۱ (الزامی)
//   node scripts/legacy-links-live.mjs --express=http://127.0.0.1:3000
//   node scripts/legacy-links-live.mjs --verbose        # زنجیره‌ی هر مورد را چاپ کن
//   node scripts/legacy-links-live.mjs --frontend=/tmp/khali   # حالتِ پس از حذفِ صفحه‌ها
//   (پیش‌فرضِ --frontend همان اوراکلِ منجمد است: tests/fixtures/legacy-src/)
//
// Next الزامی است (نگاشت آن‌جاست)؛ Express اختیاری — اگر بالا باشد سمتِ خودش
// هم سنجیده می‌شود: در حالتِ گذار ۲۰۰ می‌دهد (بدهیِ باز، شمرده و چاپ می‌شود) و
// پس از ریدایرکت باید به **همان مقصدِ Next** برود. ۴۰۴/۴۱۰ در هر دو حالت
// تخلف است.
//
// ---------- «سنجیده نشد» سبزِ خالی نیست ----------
// اگر پوستهٔ قدیمی روی دیسک نباشد (یا صفحه‌ای در آن نمانده باشد) این یک حالتِ
// **بازنشسته** است: صریح چاپ می‌شود و نگاشتِ ریدایرکت باید هنوز پر باشد. ولی
// اگر پوشه *موجود* و *ناخوانا* باشد (نه پوشه، بی‌دسترسی)، نمی‌توان پوشش را
// سنجید — و همان لحظه است که یک نگهبان به سبزِ توخالی تبدیل می‌شود. آن حالت
// کدِ ۲ می‌گیرد، مثلِ نبودِ سرور.
//
// کدِ خروج: ۰ = سالم (بدهی‌ها چاپ می‌شوند) · ۱ = تخلف · ۲ = پیش‌شرط (Next بالا نیست،
// یا پوستهٔ قدیمی ناخواناست)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEGACY_NO_ALIAS,
  LEGACY_PAGE_ALIASES,
  isLegacyHtmlPath,
  legacyRedirect,
} from "../src/lib/legacyUrls.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..");
const ROOT = path.resolve(NEXT_DIR, "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};

const NEXT = String(flag("next", "http://127.0.0.1:3001")).replace(/\/+$/, "");
const EXPRESS = flag("express", "") ? String(flag("express", "")).replace(/\/+$/, "") : null;
/**
 * پوستهٔ قدیمی — با `--frontend=` قابلِ‌جابه‌جایی است.
 *
 * چرا این پرچم وجود دارد: همین امروز نقطهٔ کورِ خودِ این نگهبان بود. روزی که
 * `frontend/` حذف شود (کاری که این نگهبان برایش ساخته شده)، `readdirSync`
 * می‌شکست و پوشش فقط یک «انجام نشد» چاپ می‌کرد — همان «سبزِ توخالی» که
 * پروژه از آن می‌گریزد. حالا آن حالت صریحاً «بازنشسته» است، ولی برای
 * آزمودنش لازم نیست پوشهٔ واقعی را جابه‌جا کنیم: با `--frontend=/tmp/خالی`
 * همان شاخه اجرا می‌شود.
 *
 * ---------- چرا پیش‌فرض، اوراکلِ منجمد است ----------
 * آن روز گذشت: `frontend/` حذف شد. اگر پیش‌فرض همان مسیرِ قدیمی می‌ماند،
 * سنجشِ *پوششِ نام‌ها* به «پوشه نیست، پس بازنشسته» سقوط می‌کرد و تنها چیزی
 * که می‌ماند شمردنِ کلیدهای خودِ نگاشت بود — یعنی نگهبانی که خودش را
 * تأیید می‌کند. پس پیش‌فرض حالا `tests/fixtures/legacy-src/` است: همان کپیِ
 * بایت‌به‌بایتِ `frontend/` پیش از حذف. اسمِ تازه‌ای که روزی در آن دنیا
 * اضافه می‌شد و در نگاشت جا می‌ماند، هنوز هم همین‌جا گرفته می‌شود.
 */
const LEGACY_ORACLE = path.join(NEXT_DIR, "tests", "fixtures", "legacy-src");
const FRONTEND_DIR = String(flag("frontend", fs.existsSync(LEGACY_ORACLE)
  ? LEGACY_ORACLE
  : path.resolve(ROOT, "frontend")));
const VERBOSE = flag("verbose", false) === true;
/** سقفِ گام‌های زنجیره — فروشگاه بیشتر از این نمی‌چرخد؛ چرخیدن یعنی حلقه. */
const MAX_HOPS = 4;

// خروجِ ناگهانی امن نیست (روی ویندوز با سوکتِ بازِ undici می‌جنگد) — همان
// الگویِ خواهرش `scripts/static-paths-live.mjs`: فقط `exitCode` می‌گذاریم.
let exitCode = 0;
/**
 * «سنجیده نشد» با «سبز شد» یکی نیست.
 *
 * اگر پوشهٔ پوستهٔ قدیمی موجود باشد ولی خوانده نشود (نه پوشه، بی‌دسترسی، حجم…)،
 * نمی‌توانیم پوشش را بسنجیم — و همان لحظه است که یک نگهبان به «سبزِ توخالی»
 * تبدیل می‌شود. قراردادِ خودِ پروژه (`scripts/static-paths-live.mjs`) این
 * حالت را کدِ ۲ می‌دهد، نه ۰.
 */
let precondition = false;
const violations = [];
const debts = [];

const say = (s = "") => console.log(s);
const ok = (s) => say(`  ✔ ${s}`);
const bad = (s) => {
  violations.push(s);
  say(`  ✖ ${s}`);
};
const warn = (s) => say(`  ! ${s}`);

// ------------------------------------------------------------
// واکشی — ریدایرکت دنبال نمی‌شود؛ خودِ ۳۰۷ یک واقعیتِ قابلِ‌سنجش است
// ------------------------------------------------------------
async function hit(url, { body = false } = {}) {
  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const loc = res.headers.get("location");
  return {
    status: res.status,
    location: loc ? new URL(loc, url).toString() : null,
    url,
    // بدنه فقط وقتی لازم است خوانده می‌شود: واکشیِ زنجیره‌ها ده‌ها درخواست دارد
    // و خواندنِ HTMLِ هر گام، سنجش را بی‌دلیل سنگین می‌کند.
    body: body ? await res.text() : "",
  };
}

/** مسیر + کوئریِ یک نشانی، نرمال‌شده (برای مقایسه‌ی مقصدها). */
function routeOf(href) {
  const u = new URL(href, "http://x.invalid");
  const q = new URLSearchParams(u.search);
  q.sort();
  const qs = q.toString();
  return u.pathname.replace(/\/+$/, "") + (qs ? `?${qs}` : "");
}

/**
 * زنجیره را تا سقفِ گام‌ها دنبال می‌کند.
 * خروجی: { hops: [{status, route}], terminal: hop | null }
 */
async function chain(origin, startPath) {
  const hops = [];
  let url = new URL(startPath, origin).toString();
  for (let i = 0; i <= MAX_HOPS; i++) {
    const res = await hit(url);
    hops.push({ status: res.status, route: routeOf(res.url), location: res.location });
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = res.location;
      continue;
    }
    return { hops, terminal: hops[hops.length - 1] };
  }
  return { hops, terminal: null };
}

const describeChain = (hops) =>
  hops.map((h) => `${h.route} ${h.status}`).join(" → ");

// ------------------------------------------------------------
// پیش‌شرط: Next باید بالا باشد
// ------------------------------------------------------------
async function alive(origin) {
  try {
    const res = await hit(origin + "/");
    return res.status > 0;
  } catch {
    return false;
  }
}  if (!(await alive(NEXT))) {
  console.error(
    `✖ Next روی ${NEXT} پاسخ نمی‌دهد. اول بالا بیاورید:\n` +
      `    cd next-frontend && npm run build && npm run start\n` +
      `  (نگاشتِ نشانی‌های قدیمی داخلِ خودِ Next است، پس بدونِ آن سنجشی وجود ندارد.)`,
  );
  process.exitCode = 2;
} else {
  await run();
  // کدِ خروج را از متغیرِ ماژول می‌دهیم: هیچ‌جا وسطِ کار `process.exit()`
  // صدا نمی‌زنیم تا سوکت‌های باز (undici) روی ویندوز ترک نزنند.
  process.exitCode = exitCode;
}

// ============================================================
// بدنه
// ============================================================
async function run() {
  say(`بازنشستگیِ نشانی‌های عصرِ Express — Next ${NEXT}${EXPRESS ? `  ↔  Express ${EXPRESS}` : ""}\n`);

  // ----------------------------------------------------------
  // ۱) پوششِ نام‌ها روی دیسک
  // ----------------------------------------------------------
  say("پوششِ نام‌ها (*.htmlِ پوستهٔ قدیمی ← نگاشت یا دلیلِ مستند):");
  let files = [];
  let unreadable = null;
  try {
    files = fs
      .readdirSync(FRONTEND_DIR)
      .filter((f) => f.endsWith(".html"))
      .sort();
  } catch (e) {
    unreadable = e;
  }

  // حالتِ پس از بازنشستگی: یا پوشه رفته، یا دیگر صفحه‌ای در آن نیست.
  // عمداً هر دو یک‌جا: پوشهٔ *خالی* خطا نمی‌دهد، و حالتِ محتملِ بعد از حذف
  // همین است (صفحه‌ها رفته‌اند و `js/` و دارایی‌ها مانده‌اند). اگر فقط
  // ENOENT را «بازنشسته» بشماریم، آن حالت بی‌صدا از کنارِ سنجش رد می‌شود —
  // همان «سبزِ توخالی»یی که این نگهبان باید بگیرد.
  if (!files.length) {
    if (unreadable && unreadable.code !== "ENOENT") {
      precondition = true;
      console.error(
        `✖ پوشهٔ ${FRONTEND_DIR} خوانده نشد (${unreadable.message}) — سنجشِ پوشش انجام نشد.`,
      );
      console.error("  (پوشهٔ *ناموجود* یعنی بازنشستگی؛ پوشهٔ *ناخوانا* یعنی مسیرِ خراب — یکی نیستند.)");
    } else {
      const mapped = Object.keys(LEGACY_PAGE_ALIASES).length;
      if (mapped) {
        ok(`صفحهٔ عصرِ Express روی دیسک نمانده — پوشش بازنشسته شد (نگاشت با ${mapped} نام باقی است)`);
      } else {
        bad("نه پوستهٔ قدیمی مانده و نه نگاشتی — نشانی‌های قدیمی بی‌مقصد شده‌اند");
      }
    }
  }

  for (const file of files) {
    const dest = legacyRedirect(`/${file}`, "");
    const excused = Object.prototype.hasOwnProperty.call(LEGACY_NO_ALIAS, file);
    if (dest && excused) {
      bad(`${file} هم مقصد دارد (${dest}) و هم در LEGACY_NO_ALIAS است — تناقض`);
    } else if (dest) {
      if (VERBOSE) ok(`${file} → ${dest}`);
    } else if (excused) {
      if (VERBOSE) ok(`${file} — عمداً بدونِ مقصد: ${LEGACY_NO_ALIAS[file]}`);
    } else {
      bad(
        `${file} نه مقصدی در LEGACY_PAGE_ALIASES دارد و نه دلیلی در LEGACY_NO_ALIAS — ` +
          `روزی که frontend/ حذف شود، این نام ۴۰۴ می‌شود`,
      );
    }
  }
  if (!violations.length && files.length) {
    ok(`${files.length} فایلِ html — همه یا مقصد دارند یا دلیل`);
  }

  // ----------------------------------------------------------
  // ۲) نام‌هایی که *لینک* به آن‌ها اشاره می‌کند — نه فقط فایل‌ها
  // ----------------------------------------------------------
  // چرا لازم است: نگاشتِ بالا فقط فایل‌های موجود را می‌پوشاند، ولی پوستهٔ
  // قدیمی به نام‌هایی لینک می‌دهد که ممکن است فایل نباشند (`product.html?id=`
  // در قالبِ جاوااسکریپت). اگر نامی این‌جا پیدا شود و در نگاشت نباشد، همان
  // لینک پس از بازنشستگی می‌شکند.
  say("\nنام‌های لینک‌شده در پوستهٔ قدیمی:");
  const linked = new Set();
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(abs);
      } else if (/\.(html|js)$/i.test(entry.name)) {
        const text = fs.readFileSync(abs, "utf8");
        for (const m of text.matchAll(/(?:href|action)\s*[=:]\s*["'`]([^"'`]+)["'`]/gi)) {
          const target = m[1];
          // نشانیِ بیرونی (`https:`, `mailto:`, `//cdn…`) نامِ فایلِ *ما*
          // نیست؛ برداشتنِ basename‌اش یک مثبتِ کاذب می‌سازد (یک سایتِ بیرونی
          // با نامِ `index.html` نگهبان را بی‌دلیل قرمز می‌کند).
          if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue;
          const bare = target.split(/[?#]/)[0].split("/").pop();
          if (bare && isLegacyHtmlPath(`/${bare}`)) linked.add(bare);
        }
      }
    }
  };
  // پیمایشِ لینک‌ها عمداً به «بازنشسته» گره نمی‌خورد: `js/` ممکن است بعد از
  // رفتنِ صفحه‌ها بماند و همان فایل‌ها هنوز به نام‌های قدیمی لینک می‌دهند.
  if (!fs.existsSync(FRONTEND_DIR)) {
    ok("پوستهٔ قدیمی روی دیسک نیست — لینکی برای سنجیدن نمانده");
  } else if (!unreadable) {
    // اگر پوشه ناخوانا بود، پیش‌تر با کدِ ۲ گزارش شد؛ پیامِ تکراری چاپ نمی‌کنیم.
    try {
      scan(FRONTEND_DIR);
    } catch (e) {
      precondition = true;
      console.error(`✖ پیمایشِ ${FRONTEND_DIR} انجام نشد (${e.message})`);
    }
  }
  let unlinked = 0;
  for (const file of [...linked].sort()) {
    const dest = legacyRedirect(`/${file}`, "");
    const excused = Object.prototype.hasOwnProperty.call(LEGACY_NO_ALIAS, file);
    if (dest) {
      if (VERBOSE) ok(`${file} → ${dest}`);
    } else if (excused) {
      if (VERBOSE) ok(`${file} — عمداً بدونِ مقصد`);
    } else {
      unlinked++;
      bad(`لینکی به ${file} اشاره می‌کند و هیچ مقصدی ندارد — پس از بازنشستگی ۴۰۴ می‌شود`);
    }
  }
  // فقط وقتی نامی هست اعلام می‌شود: «۰ نامِ لینک‌شده ✅» یک سبزِ توخالی است.
  if (!unlinked && linked.size) ok(`${linked.size} نامِ لینک‌شده — همه به مقصد می‌رسند`);

  // ----------------------------------------------------------
  // ۳) زنجیرهٔ زندهٔ هر نشانیِ قدیمی — سمتِ Next
  // ----------------------------------------------------------
  // مواردِ پارامتری جدا هستند چون هر کدام یک تصمیمِ متفاوت‌اند:
  //   • `?id=` معتبر → مسیرِ محصول؛ بی‌شناسه/نامعتبر → فهرست
  //   • `?next=` (ورود) → `?redirect=` (نامِ پارامتر در دو فرانت‌اند فرق دارد)
  //   • کوئریِ فیلتر (`cat`, `inStock`) دست‌نخورده می‌ماند
  const cases = [
    ...Object.keys(LEGACY_PAGE_ALIASES).map((file) => ({
      path: `/${file}`,
      search: "",
      why: "نگاشت",
    })),
    { path: "/product.html", search: "?id=1", why: "شناسه‌ی محصول از کوئری به مسیر" },
    { path: "/product.html", search: "", why: "بدونِ شناسه" },
    { path: "/product.html", search: "?id=abc", why: "شناسه‌ی نامعتبر" },
    { path: "/login.html", search: "?next=%2Fcart", why: "ترجمه‌ی next → redirect" },
    { path: "/products.html", search: "?cat=%D8%B3%D8%A8%D8%AF", why: "کوئریِ فیلتر" },
  ];

  say("\nزنجیرهٔ زنده (Next):");
  for (const c of cases) {
    const expect = legacyRedirect(c.path, c.search);
    const start = `${c.path}${c.search}`;
    let hops;
    try {
      ({ hops } = await chain(NEXT, start));
    } catch (e) {
      bad(`${start} — واکشیِ زنجیره شکست (${e.message})`);
      continue;
    }
    const first = hops[0];
    if (!expect) {
      bad(`${start} — نگاشت مقصدی نمی‌دهد ولی در فهرستِ سنجش است (تناقض)`);
      continue;
    }
    if (!(first.status >= 300 && first.status < 400)) {
      bad(`${start} — انتظارِ ریدایرکت بود، ${first.status} آمد`);
      continue;
    }
    if (!first.location) {
      // ۳۰۷ بدونِ مقصد یعنی مرورگر به همان جا می‌ماند — نه ریدایرکت واقعی.
      bad(`${start} — کدِ ${first.status} بدونِ هدرِ Location`);
      continue;
    }
    if (routeOf(new URL(expect, "http://x.invalid").toString()) !== routeOf(first.location)) {
      bad(`${start} — مقصدِ ریدایرکت ${routeOf(first.location ?? "")} است، نگاشت ${routeOf(new URL(expect, "http://x.invalid").toString())} می‌گوید`);
      continue;
    }
    const last = hops[hops.length - 1];
    if ([404, 410].includes(last.status)) {
      bad(`${start} — زنجیره روی ${last.status} تمام می‌شود (${describeChain(hops)}) — لینکِ مرده`);
      continue;
    }
    if (last.status !== 200) {
      bad(`${start} — زنجیره روی ${last.status} تمام می‌شود (${describeChain(hops)})`);
      continue;
    }
    ok(VERBOSE ? `${start} — ${describeChain(hops)}  [${c.why}]` : `${start} → ${expect}`);
  }

  // ----------------------------------------------------------
  // ۴) سمتِ Express — حالتِ گذار در برابر هم‌گرایی
  // ----------------------------------------------------------
  // امروز Express خودِ صفحه را ۲۰۰ می‌دهد (بدهیِ باز: دو دنیا). پس از
  // بازنشستگی باید دقیقاً به همان مقصدِ Next ریدایرکت کند؛ آن‌وقت این بخش
  // خودبه‌خود «هم‌گرا» می‌شود و ۴۰۴ در هر دو حالت تخلف است.
  if (EXPRESS && (await alive(EXPRESS))) {
    say("\nسمتِ Express (گذر به بازنشستگی):");
    let serving = 0;
    let redirecting = 0;
    for (const c of cases) {
      const expect = legacyRedirect(c.path, c.search);
      const start = `${c.path}${c.search}`;
      let res;
      try {
        res = await hit(EXPRESS + start);
      } catch (e) {
        bad(`${start} — واکشی از Express شکست (${e.message})`);
        continue;
      }
      if ([404, 410].includes(res.status)) {
        // `/product.html?id=…` روی Express روتِ اختصاصی دارد و ۲۰۰ می‌دهد؛
        // پس ۴۰۴ این‌جا یعنی نامی که خودِ Express هم نمی‌شناسد.
        bad(`${start} — Express کدِ ${res.status} می‌دهد (نامِ مرده در همان دنیای قدیم)`);
      } else if (res.status === 200) {
        serving++;
        if (VERBOSE) warn(`${start} — هنوز ۲۰۰ (صفحهٔ قدیمی سرو می‌شود)`);
      } else if (res.status >= 300 && res.status < 400 && !res.location) {
        bad(`${start} — Express کدِ ${res.status} بدونِ هدرِ Location`);
      } else if (res.status >= 300 && res.status < 400) {
        const got = routeOf(res.location);
        if (got !== routeOf(new URL(expect, "http://x.invalid").toString())) {
          bad(`${start} — Express به ${got} می‌رود، نگاشت/Next ${expect} می‌گوید (واگراییِ مقصد)`);
        } else {
          redirecting++;
          if (VERBOSE) ok(`${start} → ${got}`);
        }
      } else {
        bad(`${start} — Express کدِ نامنتظر ${res.status} می‌دهد`);
      }
    }
    if (serving) {
      debts.push(
        `${serving} نشانیِ قدیمی هنوز روی Express با ۲۰۰ سرو می‌شود (صفحهٔ قدیمی زنده است) — ` +
          `گامِ بعدی: ریدایرکت به همان مقصدِ Next (کارِ حذفِ frontend/ بعد از آن)`,
      );
      warn(`${serving} نشانی هنوز ۲۰۰ · ${redirecting} ریدایرکت‌شده`);
    } else if (redirecting) {
      ok(`هر ${redirecting} نشانیِ قدیمی روی Express به مقصدِ Next می‌رود — هم‌گرا`);
    }
  } else if (EXPRESS) {
    warn(`Express روی ${EXPRESS} بالا نیست — سمتِ آن سنجیده نشد`);
  }

  // ----------------------------------------------------------
  // ۵) sitemap: هیچ sitemapi نباید نشانیِ ریدایرکت‌شده اعلام کند
  // ----------------------------------------------------------
  // چرا: sitemap یعنی «این‌ها را ایندکس کن». نشانی‌ای که خودش ۳۰۷ می‌شود
  // سیگنالِ متضاد است و بودجهٔ خزش را هدر می‌دهد. (`/products.html` در
  // sitemapِ Express دقیقاً همین بود.)
  say("\nsitemap:");
  for (const [label, origin] of [["Next", NEXT], ["Express", EXPRESS]]) {
    if (!origin) continue;
    let res;
    try {
      res = await hit(origin + "/sitemap.xml", { body: true });
    } catch (e) {
      warn(`${label} — sitemap خوانده نشد (${e.message})`);
      continue;
    }
    if (res.status !== 200) {
      if (label === "Next") bad(`sitemapِ Next کدِ ${res.status} می‌دهد`);
      else warn(`sitemapِ Express کدِ ${res.status} می‌دهد`);
      continue;
    }
    const xml = res.body;
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1]);
    const legacy = locs.filter((loc) => {
      let p;
      try {
        p = new URL(loc).pathname;
      } catch {
        return false;
      }
      return isLegacyHtmlPath(p) || legacyRedirect(p, "") !== null;
    });
    if (legacy.length) {
      bad(`${label} — ${legacy.length} نشانیِ قدیمی در sitemap (${legacy.slice(0, 3).join(", ")}${legacy.length > 3 ? " …" : ""})`);
    } else {
      ok(`${label} — ${locs.length} نشانی، هیچ‌کدام ریدایرکت‌شده نیست`);
    }
  }

  // ----------------------------------------------------------
  // ۶) نام‌های مستند که باید *واقعاً* زنده بمانند
  // ----------------------------------------------------------
  // `offline.html` استثنای واقعی است: فایل در `public/` است و سرویس‌ورکر
  // همان را می‌خواهد. اگر روزی ۴۰۴ شود، حالتِ آفلاینِ کاربر می‌شکند و
  // هیچ نگهبانِ دیگری این را نمی‌گوید (هر دو نگهبانِ «مسیرهای ثابت» فقط
  // «فایل هست» را می‌سنجند).
  //
  // ---------- چرا انتظارِ دو مبدأ یکی نیست ----------
  // این بخش تا روزِ بازنشستگی، برای **هر دو مبدأ** ۲۰۰ می‌خواست: هر دو
  // برنامه یک `offline.html` داشتند. آن روز گذشته است — دارایی‌های ثابت
  // امروز فقط در `next-frontend/public/` هستند و Express هیچ فایلی سرو
  // نمی‌کند. اگر همان انتظارِ قدیمی بماند، نگهبان روی معماریِ *درست* قرمز
  // می‌شود (یک مثبتِ کاذب که آدم را وادار می‌کند چیزِ سالم را «تعمیر» کند).
  // پس: Next باید ۲۰۰ بدهد، و Express باید ۴۰۴ — چون برگشتنِ فایلِ ثابت روی
  // آن مبدأ یعنی کسی دوباره فروشگاهِ حذف‌شده را سرو می‌کند.
  say("\nفایل‌های مستقل:");
  const standalone = [
    ["Next", NEXT, 200],
    ["Express", EXPRESS, 404],
  ];
  for (const name of ["offline.html"]) {
    for (const [label, origin, want] of standalone) {
      if (!origin) continue;
      let res;
      try {
        res = await hit(`${origin}/${name}`);
      } catch (e) {
        bad(`${label} /${name} — واکشی شکست (${e.message})`);
        continue;
      }
      if (res.status === want) ok(`${label} /${name} — ${res.status}`);
      else if (want === 200) bad(`${label} /${name} کدِ ${res.status} می‌دهد (سرویس‌ورکر به این فایل تکیه دارد)`);
      else bad(`${label} /${name} کدِ ${res.status} می‌دهد — این مبدأ نباید فایلِ ثابت سرو کند`);
    }
  }

  // ----------------------------------------------------------
  // جمع‌بندی
  // ----------------------------------------------------------
  say("\n" + "─".repeat(60));
  if (debts.length) {
    say("بدهی‌های باز (تخلف نیستند — کارِ باقی‌مانده‌ی بازنشستگی):");
    for (const d of debts) say(`  • ${d}`);
  }
  if (violations.length) {
    say(`✖ ${violations.length} تخلف:`);
    for (const v of violations) say(`  - ${v}`);
    exitCode = 1;
  } else if (precondition) {
    say("✖ سنجش کامل نشد (پیش‌شرط) — نتیجه را «سبز» حساب نکنید.");
    exitCode = 2;
  } else {
    say("✔ هیچ لینکِ مرده و هیچ واگراییِ مقصدی پیدا نشد.");
  }
}
