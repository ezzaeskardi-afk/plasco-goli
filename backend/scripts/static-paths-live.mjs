#!/usr/bin/env node
// ============================================================
// خواهرِ زمانِ‌اجرای آزمونِ «مسیرهای ثابت» — این‌بار برای فروشگاهِ Express
// ============================================================
// `next-frontend/scripts/static-paths-live.mjs` همین قرارداد را برای Next
// برقرار می‌کند: «فایل روی دیسک هست» ثابت نمی‌کند «سرورِ واقعی آن را ۲۰۰
// می‌دهد». آن سنجش فقط مسیرهای Next را می‌پوشاند؛ خودِ `frontend/` — که
// فروشگاهِ Express از آن سرو می‌شود — هیچ سنجشِ زنده‌ای نداشت. این فایل همان
// شکاف را می‌بندد و **همه‌ی** پنجاه فایلِ `frontend/` را روی سرورِ واقعی
// می‌سنجد، به‌علاوه‌ی سه روتِ داینامیک و آدرس‌هایی که خودِ صفحه‌ها صدا می‌زنند.
//
// چرا این شکاف تئوری نیست — چهار حالتِ واقعی که هیچ آزمونِ ایستایی نمی‌گیرد:
//   • پوشه‌ی dotfile: `express.static` پیش‌فرض `dotfiles: 'ignore'` است، پس
//     `frontend/.well-known/security.txt` روی دیسک هست ولی از مسیرِ عمومی
//     ۴۰۴ می‌شود. Next نسخه‌ی خودش را ۲۰۰ می‌دهد؛ Express نه. («فایل هست»
//     هیچ‌وقت این را نمی‌گوید.)
//   • کشِ فشرده‌سازی: `staticCompress(FRONTEND_DIR)` بدنه را در حافظه کش
//     می‌کند. اگر ملاکِ تازه‌شدن یک‌بار از دست برود، مرورگر CSS/JSِ کهنه
//     می‌گیرد و صفحه با HTMLِ تازه نمی‌خواند — سنجشِ بایت‌به‌بایت همین را
//     می‌گیرد، در حالی که «۲۰۰ شد» نه.
//   • جایگزینیِ دامنه‌ی نمونه: `PLACEHOLDER_HOST` فقط روی چهار صفحه‌ای اجرا
//     می‌شود که روتِ اختصاصی دارند. همان باگی که یک‌بار `wholesale.html` را
//     ایندکس‌شدنی کرد با canonicalی که به دامنه‌ای ناموجود اشاره می‌کرد.
//   • آدرس‌هایی که مرورگر واقعاً می‌زند `?v=72` دارند. هیچ‌چیز آن شکلِ کاملِ
//     آدرس را نمی‌سنجید؛ این‌جا از خودِ صفحه‌ها استخراج و همان‌طور درخواست
//     می‌شود.
//
// و چرا «بدونِ Next»: دو برنامه نام‌های یکسانی دارند (`index.html`، `sw.js`،
// `manifest.webmanifest`، `offline.html`). اگر Next بالا باشد، یک هیت می‌تواند
// از *آن* برنامه بیاید و سنجش همان چیزی را که ادعا می‌کند نسنجد. پس خودِ
// اسکریپت پیش‌شرط را می‌سنجد و با کدِ ۲ می‌شکند — «سبزِ خالی» از «سنجیده شد»
// جدا می‌ماند. (اجرای محلی با --allow-next آگاهانه رد می‌شود.)
//
// اجرا:
//   node scripts/static-paths-live.mjs
//   node scripts/static-paths-live.mjs --express=http://127.0.0.1:3100
//   node scripts/static-paths-live.mjs --allow-next     # فقط برای توسعهٔ محلی
//
// کدِ خروج: ۰ = همه ۲۰۰ و همان فایل · ۱ = مسیرِ غیرِ۲۰۰/ناهمخوان · ۲ = پیش‌شرط

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(HERE, "..");
const FRONTEND_DIR = path.resolve(BACKEND_DIR, "..", "frontend");
const SERVER_JS = path.join(BACKEND_DIR, "server.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};

const EXPRESS = String(flag("express", "http://127.0.0.1:3000")).replace(/\/+$/, "");
const NEXT = String(flag("next", "http://127.0.0.1:3001")).replace(/\/+$/, "");
const ALLOW_NEXT = flag("allow-next", false) === true;

// خروجِ ناگهانی با `process.exit()` این‌جا امن نیست: روی ویندوز با سوکتِ بازِ
// fetch (undici) می‌جنگد و به‌جای کدِ خودمان یک assertion crash می‌دهد. پس
// همه‌ی مسیرها فقط `exitCode` را می‌گذارند و پروسه طبیعی تمام می‌شود.
let exitCode = 0;
const giveUp = (msg) => {
  console.error(`✖ ${msg}`);
  exitCode = 2;
};

// ------------------------------------------------------------
// ۱) فهرستِ دارایی‌ها از خودِ دیسک — نه دستی
// ------------------------------------------------------------
// فهرستِ دستی این‌جا بی‌معنی است: هر فایلِ تازه‌ای که کسی به `frontend/`
// اضافه کند باید خودبه‌خود سنجیده شود، وگرنه پوشش بی‌صدا کوچک می‌شود.
function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, base));
    else if (entry.isFile()) out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

let files = [];
try {
  if (!fs.existsSync(FRONTEND_DIR)) throw new Error(`${FRONTEND_DIR} وجود ندارد`);
  files = walk(FRONTEND_DIR).sort();
  if (!files.length) throw new Error("هیچ فایلی در frontend/ پیدا نشد");
} catch (e) {
  giveUp(`دارایی‌های frontend/ خوانده نشد: ${e.message}`);
}

// ------------------------------------------------------------
// ۲) دو چیزِ دیگر که از خودِ سورسِ سرور خوانده می‌شوند
// ------------------------------------------------------------
// الف) صفحه‌هایی که روتِ اختصاصی دارند و بدنه‌شان *عمداً* با دیسک یکی نیست
//     (دامنه‌ی نمونه جایگزین می‌شود). صفر تا یعنی استخراج از کار افتاده.
// ب) خودِ دامنه‌ی نمونه، تا مطمئن شویم در هیچ صفحه‌ای به کاربر نمی‌رسد.
let serverSrc = "";
let placeholderHost = null;
let rendered = new Set();
try {
  serverSrc = fs.readFileSync(SERVER_JS, "utf8");
  const ph = serverSrc.match(/const PLACEHOLDER_HOST = '([^']+)'/);
  if (!ph) throw new Error("PLACEHOLDER_HOST در server.js پیدا نشد");
  placeholderHost = ph[1];

  for (const m of serverSrc.matchAll(/renderSeoPage\('([^']+)'\)/g)) rendered.add(m[1]);
  if (/app\.get\('\/index\.html', renderHomepage\)/.test(serverSrc)) rendered.add("index.html");
  if (!rendered.size) throw new Error("صفحه‌های روت‌دار از server.js استخراج نشد");
} catch (e) {
  giveUp(`سورسِ سرور خوانده نشد: ${e.message}`);
}

// تیترِ صفحه‌ی اصلی از خودِ فایل: نشانه‌ی هویتِ سرور. اگر سرورِ اشتباهی روی
// این پورت باشد (مثلاً Next روی ۳۰۰۱)، همان تیتر پیدا نمی‌شود و با کدِ ۲
// می‌ایستیم — وگرنه یک سنجشِ سبزِ بی‌معنی می‌گرفتیم.
let homeTitle = null;
try {
  const html = fs.readFileSync(path.join(FRONTEND_DIR, "index.html"), "utf8");
  homeTitle = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? null;
  if (!homeTitle) throw new Error("تیترِ index.html خوانده نشد");
} catch (e) {
  giveUp(`نشانه‌ی هویت خوانده نشد: ${e.message}`);
}

// ج) آدرس‌هایی که خودِ صفحه‌ها صدا می‌زنند (با همان ?v= که در HTML نوشته شده).
//    `css/`، `js/` و `assets/` نسبی‌اند، پس از ریشه‌ی سرور سرو می‌شوند.
const pageUrls = new Set();
try {
  for (const rel of files.filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(FRONTEND_DIR, rel), "utf8");
    for (const m of html.matchAll(/(?:href|src)="((?:css|js|assets)\/[^"]+)"/g)) {
      pageUrls.add("/" + m[1]);
    }
  }
  if (!pageUrls.size) throw new Error("هیچ ارجاعِ دارایی‌ای در صفحه‌ها پیدا نشد");
} catch (e) {
  giveUp(`ارجاع‌های صفحه‌ها خوانده نشد: ${e.message}`);
}

// ------------------------------------------------------------
// ۳) روت‌های داینامیک — فایلی روی دیسک ندارند، پس دستی و با دلیل
// ------------------------------------------------------------
const ROUTES = [
  ["/", "صفحه‌ی اصلی — روتِ renderHomepage (ItemList تزریقی)"],
  ["/robots.txt", "روتِ داینامیک — دامنه‌ی همان درخواست را می‌نویسد"],
  ["/sitemap.xml", "روتِ داینامیک — باید بدونِ کاتالوگ هم ۲۰۰ بدهد"],
];

const whyFor = (rel) => {
  if (rendered.has(rel)) return "روتِ رندرشده — دامنه‌ی نمونه جایگزین می‌شود";
  if (rel === "sw.js") return "سرویس‌ورکر — no-cache (کشِ کهنه یعنی مشتریِ گیرکرده)";
  if (rel === "manifest.webmanifest") return "مانیفستِ PWA — layout به آن لینک می‌دهد";
  if (rel === "offline.html") return "صفحه‌ی آفلاین — تنها چیزی که قطعیِ اینترنت را مدیریت می‌کند";
  if (rel === "404.html" || rel === "500.html") return "صفحه‌ی خطا — باید خودش ۲۰۰ بدهد تا در ۴۰۴ لوپ نشویم";
  if (rel.startsWith(".well-known/")) return "RFC 9116 — پوشه‌ی dotfile؛ express.static پیش‌فرض نادیده می‌گیرد";
  if (rel.startsWith("assets/fonts/")) return "فونتِ وزیر — @font-face در css/style.css";
  if (rel.startsWith("assets/")) return "داراییِ آیکون/تصویر";
  if (rel.startsWith("css/") || rel.startsWith("js/")) return "CSS/JS — با ?v= نسخه‌بندی و یک ماه immutable کش می‌شود";
  if (rel.endsWith(".html")) return "صفحه‌ی ثابتِ فروشگاه";
  return "فایلِ داخلِ frontend/";
};

// هر هدف: { url، why، rel } — rel فقط برای فایل‌ها پر است (مقایسه‌ی بدنه).
const targets = [];
for (const [url, why] of ROUTES) targets.push({ url, why, rel: null });
for (const rel of files) targets.push({ url: "/" + rel, why: whyFor(rel), rel });
for (const url of [...pageUrls].sort()) {
  targets.push({ url, why: "آدرسی که خودِ صفحه صدا می‌زند (با ?v=)", rel: null });
}

// ------------------------------------------------------------
// ۴) پیش‌شرط: Next نباید بالا باشد
// ------------------------------------------------------------
// آماده‌بودن با «هر وضعیتِ HTTP» سنجیده می‌شود، نه با ۲۰۰ روی یک مسیرِ
// موضوعِ سنجش. `/sw.js` عمداً انتخاب شده: فایلی استاتیک است که Next بدونِ
// هیچ وابستگی به API فوراً پاسخ می‌دهد، پس «کند بودن» را با «خواب بودن»
// قاطی نمی‌کنیم.
async function nextIsUp() {
  try {
    const res = await fetch(`${NEXT}/sw.js`, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function probe(url) {
  try {
    const res = await fetch(EXPRESS + url, {
      redirect: "manual", // ریدایرکت «موفقیت» نیست؛ ۲۰۰ می‌خواهیم
      signal: AbortSignal.timeout(15000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buf };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

if (exitCode === 0 && !ALLOW_NEXT && (await nextIsUp())) {
  giveUp(
    `Next روی ${NEXT} بالاست. این سنجش فقط وقتی معنا دارد که Next خواب باشد، ` +
      `وگرنه مسیرهای هم‌نام (` +
      `index.html، sw.js، manifest.webmanifest، offline.html)` +
      ` می‌توانند از آن برنامه سیر شوند و سنجش همان چیزی را که ادعا می‌کند نسنجد.\n` +
      `   اول Next را بخوابان (یا با --allow-next آگاهانه رد شو).`,
  );
}

if (exitCode === 0) {
  const home = await probe("/index.html");
  const looksLikeRepo = home.status === 200 && home.buf.toString("utf8").includes(homeTitle);
  if (!looksLikeRepo) {
    giveUp(
      `سرورِ روی ${EXPRESS} نسخه‌ی همین مخزن را سرو نمی‌کند: ` +
        `/index.html باید تیترِ «${homeTitle}» را داشته باشد ولی ` +
        (home.status === 200 ? "نداشت" : `کدِ ${home.status || "—"} داد`) +
        `.\n   یعنی این پورت سرورِ دیگری است و سنجشِ frontend/ بی‌معنی می‌شود.`,
    );
  }
}

// ------------------------------------------------------------
// ۵) سنجش
// ------------------------------------------------------------
if (exitCode === 0) {
  console.log(`دارایی‌ها و مسیرهای ثابتِ frontend/ — Express ${EXPRESS} بدونِ Next\n`);

  const notOk = [];
  const notSame = [];

  for (const t of targets) {
    const { status, buf, error } = await probe(t.url);
    let note = "";

    if (status !== 200) {
      notOk.push(`${t.url} → ${status || `خطا (${error})`} (${t.why})`);
    } else if (t.rel && !rendered.has(t.rel)) {
      // دارایی‌ها باید بایت‌به‌بایت همان فایلِ دیسک باشند: «۲۰۰» می‌تواند
      // یک نسخه‌ی کهنه (کشِ فشرده‌سازی) یا فایلِ برنامه‌ی دیگری باشد.
      const disk = fs.readFileSync(path.join(FRONTEND_DIR, t.rel));
      if (!disk.equals(buf)) {
        note = ` ✖ بدنه یکی نیست (دیسک ${disk.length}B · سرور ${buf.length}B)`;
        notSame.push(`${t.url} (${t.why}) — ${disk.length}B روی دیسک، ${buf.length}B از سرور`);
      }
    } else if (t.rel && rendered.has(t.rel)) {
      // صفحه‌های روت‌دار عمداً بازنویسی می‌شوند، پس بایت‌به‌بایت سنجیده
      // نمی‌شوند؛ ولی دامنه‌ی نمونه نباید به چشمِ کاربر برسد.
      const body = buf.toString("utf8");
      if (body.includes(placeholderHost)) {
        note = " ✖ دامنه‌ی نمونه در بدنه";
        notSame.push(`${t.url} — «${placeholderHost}» به کاربر می‌رسد (canonical/og:url) (${t.why})`);
      } else if (!body.includes(homeTitle) && t.rel !== "index.html") {
        // جز index.html تیترها فرق دارند؛ فقط هویتِ index سنجیده می‌شود.
      }
    }

    console.log(`  ${status === 200 && !note ? "✔" : "✖"} ${t.url.padEnd(44)} ${String(status || "—").padEnd(4)} ${t.why}${note}`);
  }

  console.log("");
  if (notOk.length || notSame.length) {
    if (notOk.length) {
      console.log(`✖ ${notOk.length} مسیر ۲۰۰ نداد:`);
      for (const f of notOk) console.log(`  • ${f}`);
    }
    if (notSame.length) {
      console.log(`✖ ${notSame.length} مسیر ۲۰۰ داد ولی همان چیزی نبود که روی دیسک است:`);
      for (const f of notSame) console.log(`  • ${f}`);
    }
    exitCode = 1;
  } else {
    const bodyChecked = targets.filter((t) => t.rel && !rendered.has(t.rel)).length;
    console.log(
      `✔ هر ${targets.length} هدف ۲۰۰ داد — ${files.length} فایلِ frontend/ ` +
        `(از این میان ${bodyChecked} فایل بایت‌به‌بایت با دیسک یکی بود) ` +
        `و ${ROUTES.length} روتِ داینامیک.`,
    );
  }
}

process.exitCode = exitCode;
