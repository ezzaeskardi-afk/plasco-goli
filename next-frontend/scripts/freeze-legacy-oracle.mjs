#!/usr/bin/env node
// ============================================================
// انجمادِ اوراکل — «منبعِ حقیقتِ Express» را از سرور جدا کن
// ============================================================
// چرا این فایل لازم شد:
//
// خانواده‌ی برابری (اجراکننده‌ی زنده + کفِ پوششِ متن + متادیتا) تا امروز
// **HTMLِ سروشده‌ی Express** را معیار می‌گرفت: هر صفحه با همتای Next مقایسه
// می‌شد. آن مدل یک پیش‌شرطِ پنهان داشت: «Express همیشه صفحه را ۲۰۰ می‌دهد».
//
// با بازنشستگیِ فروشگاه، همان مسیرها ۳۰۱ می‌شوند (و بعد حذف) — یعنی معیار
// ناپدید می‌شود و اگر کسی فقط ریدایرکت را روشن کند، اجراکننده بی‌صدا «بدنه‌ی
// خالی» مقایسه می‌کند و همه‌ی جمله‌های Express «گم‌شده» می‌شوند؛ یا بدتر،
// کسی کفِ پوشش را پایین می‌آورد تا سبز شود.
//
// راهِ درست: **همان لحظه‌ی پیش از بازنشستگی، HTML را منجمد کن.** از آن پس
// اوراکل یک فایل است، نه یک سرور؛ بازنشستگی هرچه جلوتر برود (۳۰۱، حذفِ
// صفحه‌ها، حذفِ `frontend/`) این فایل دست‌نخورده می‌ماند.
//
// ---------- چرا از HTMLِ «سروشده» و نه از فایلِ خام ----------
// `server.js` روی چهار صفحه جای نمونه‌ی دومِ دامنه را می‌گذارد و روی
// `/product/:id` متا و JSON-LD تزریق می‌کند؛ چیزی که سنجش‌های برابری تا امروز
// با آن مقایسه می‌کردند همین نسخه‌ی نهایی بود. فایلِ خام روی دیسک چیزِ دیگری
// است (پس از حذف، سورسِ خام هم می‌رود).
//
// ---------- قفل‌های خودِ ابزار ----------
//   • بدونِ `--force` روی اوراکلِ موجود نمی‌نویسد: «منجمد» یعنی دست‌نخورده.
//   • اگر Express برای نشانیِ قدیمی ریدایرکت بدهد (۳۰۱)، **رد می‌کند** —
//     وگرنه صفحه‌ی خالی را منجمد می‌کردیم. پس این ابزار باید *پیش از*
//     ریدایرکت اجرا شود.
//   • کارنامه‌ی `provenance.json` با sha256 و زمانِ ثبت کنارِ فایل‌ها می‌ماند.
//
// اجرا:
//   node scripts/freeze-legacy-oracle.mjs              # هر دو سرور لازم نیست؛ فقط Express
//   node scripts/freeze-legacy-oracle.mjs --express=http://127.0.0.1:3000
//   node scripts/freeze-legacy-oracle.mjs --dry        # فقط بگو چه می‌سنجد
//
// کدِ خروج: ۰ = ثبت شد · ۱ = رد (ریدایرکت/کدِ نامنتظر/اوراکلِ موجود) · ۲ = پیش‌شرط

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { PARITY_PAGES } from "../src/lib/parityManifest.ts";
import { legacyRedirect } from "../src/lib/legacyUrls.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..");
const ORACLE_DIR = path.join(NEXT_DIR, "tests", "fixtures", "legacy-oracle");
const PROVENANCE = path.join(ORACLE_DIR, "provenance.json");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};
const EXPRESS = String(flag("express", "http://127.0.0.1:3000")).replace(/\/+$/, "");
const FORCE = flag("force", false) === true;
const DRY = flag("dry", false) === true;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

let exitCode = 0;

// پیش‌شرط: Express باید بالا باشد (اوراکل را از خودش می‌گیریم، نه از دیسک).
let up = false;
try {
  const res = await fetch(EXPRESS + "/api/health", {
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  up = res.status > 0;
} catch {
  up = false;
}
if (!up) {
  console.error(
    `✖ Express روی ${EXPRESS} پاسخ نمی‌دهد. اول بالا بیاورید:\n` +
      `    cd backend && node server.js\n` +
      `  (اوراکل از HTMLِ *سروشده* گرفته می‌شود — همان چیزی که سنجش‌ها با آن مقایسه می‌کردند.)`,
  );
  process.exit(2);
}

// ------------------------------------------------------------
// چه صفحه‌هایی؟
// ------------------------------------------------------------
// فقط صفحه‌هایی که بازنشستگی مسیرشان را عوض می‌کند: نشانیِ تک‌بخشیِ `.html`
// که در نگاشتِ `legacyUrls` مقصد دارد. بقیه (`/product/1`، `/product-gone.html`)
// روی Express روتِ اختصاصی دارند و بعد از بازنشستگی هم زنده می‌مانند، پس
// اوراکلشان لازم نیست.
const targets = PARITY_PAGES.filter((page) => page.mode !== "source").filter((page) => {
  const p = page.express.url.split("?")[0];
  return legacyRedirect(p, "") !== null;
});

console.log(`انجمادِ اوراکل — Express ${EXPRESS}\n`);
console.log(`پوشهٔ اوراکل: ${path.relative(NEXT_DIR, ORACLE_DIR).split(path.sep).join("/")}`);
console.log(`صفحه‌های نامزدِ بازنشستگی: ${targets.length} از ${PARITY_PAGES.length}\n`);

if (DRY) {
  for (const page of targets) console.log(`  ${page.id.padEnd(14)} ${page.express.url}`);
  console.log("\n(--dry: چیزی نوشته نشد)");
  process.exit(0);
}

fs.mkdirSync(ORACLE_DIR, { recursive: true });

const captured = [];
for (const page of targets) {
  const file = path.join(ORACLE_DIR, `${page.id}.html`);
  const rel = `tests/fixtures/legacy-oracle/${page.id}.html`;

  if (fs.existsSync(file) && !FORCE) {
    console.error(`✖ ${rel} از قبل هست — اوراکلِ منجمد را بی‌دلیل بازنویسی نمی‌کنم (--force برای عمدی).`);
    exitCode = 1;
    continue;
  }

  let res;
  try {
    res = await fetch(EXPRESS + page.express.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error(`✖ ${page.id}: واکشی شکست (${e.message})`);
    exitCode = 1;
    continue;
  }

  if (res.status !== 200) {
    // مهم‌ترین قفلِ این فایل: اگر Express الان ریدایرکت می‌دهد، یعنی
    // بازنشستگی روشن شده و «HTMLِ سروشدهٔ Express» دیگر وجود ندارد.
    const hint =
      res.status >= 300 && res.status < 400
        ? `\n      این نشانی ریدایرکت می‌شود (location: ${res.headers.get("location")}) — بازنشستگی روشن است.` +
          `\n      اوراکل باید *پیش از* ریدایرکت منجمد شود؛ از ` + "`git show HEAD:frontend/" + `${page.express.url.slice(1)}` + "` یا با خاموش‌کردنِ موقتِ ریدایرکت بگیرید."
        : "";
    console.error(`✖ ${page.id}: کدِ ${res.status} از ${page.express.url} — انتظار ۲۰۰ بود${hint}`);
    exitCode = 1;
    continue;
  }

  const html = await res.text();
  if (!/<html|<!doctype/i.test(html)) {
    console.error(`✖ ${page.id}: پاسخ HTML نیست — منجمد نمی‌کنم`);
    exitCode = 1;
    continue;
  }

  fs.writeFileSync(file, html, "utf8");
  captured.push({
    id: page.id,
    url: page.express.url,
    status: res.status,
    bytes: Buffer.byteLength(html, "utf8"),
    sha256: sha256(html),
  });
  console.log(`  ✔ ${rel}  ${String(Buffer.byteLength(html, "utf8")).padStart(8)} بایت  ${sha256(html).slice(0, 12)}`);
}

// کارنامه — تا معلوم باشد هر فایل از کجا و کِی آمده. بدونِ این، یک فایلِ
// اوراکلِ دست‌کاری‌شده از یک فایلِ واقعی قابلِ‌تشخیص نیست.
if (captured.length) {
  const prev = fs.existsSync(PROVENANCE) ? JSON.parse(fs.readFileSync(PROVENANCE, "utf8")) : { entries: [] };
  const byId = new Map((prev.entries || []).map((e) => [e.id, e]));
  for (const e of captured) byId.set(e.id, { ...e, capturedAt: new Date().toISOString(), express: EXPRESS });
  const merged = { note: prev.note, entries: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  fs.writeFileSync(PROVENANCE, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(`\n✔ کارنامه: tests/fixtures/legacy-oracle/provenance.json (${merged.entries.length} ردیف)`);
}

if (exitCode === 0) {
  console.log(`\n✔ ${captured.length} اوراکل منجمد شد. از این پس اجراکنندهٔ برابری متنِ Express را از همین فایل‌ها می‌خواند.`);
}
process.exitCode = exitCode;
