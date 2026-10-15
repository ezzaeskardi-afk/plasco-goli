#!/usr/bin/env node
// ============================================================
// اجراکنندهٔ آزمون‌های مرورگرِ واقعی (Playwright)
// ============================================================
//
// این فایل «پدرِ» سه چیز است: بک‌اندِ سندباکس، سرورِ Next، و خودِ Playwright.
//
// ---------- شکافی که این اسکریپت می‌بندد ----------
// هر ۳۶۲ آزمونِ فرانت در jsdom اجرا می‌شوند و اسکریپت‌های زنده HTTP‌محورند.
// یعنی «کاربر کلیک می‌کند، صفحه عوض می‌شود، سبد می‌ماند، پول کم می‌شود» هیچ‌جا
// به‌عنوان یک سناریوی واقعیِ مرورگر آزموده نمی‌شد. سه مسیرِ پول‌محور این‌جا
// روی Chromium واقعی اجرا می‌شوند: ورود با کد پیامکی، سبد → تسویه → پرداخت →
// نتیجه، و ورودِ پنل با کدِ پشتیبان (روزِ گم‌شدنِ گوشی).
//
// ---------- چرا سرورها را خودش بالا می‌آورد، نه `webServer`ِ Playwright ----------
// سه دلیلِ عینی:
//   ۱. کدِ پیامکیِ تست **فقط در stdoutِ بک‌اند** هست (حالتِ آزمایشی آن‌جا
//      چاپش می‌کند، در دیتابیس فقط هش می‌نشیند). پس بک‌اند باید بچهٔ همین
//      پروسه باشد تا بتوانیم لاگش را بخوانیم.
//   ۲. سندباکس باید **قبل از** بوتِ سرور ساخته شود (کپیِ دیتابیس + پوشهٔ عکس)
//      و مسیرش به هر سه طرف داده شود.
//   ۳. `webServer`ِ Playwright ترتیبِ ساخت/بوت را به config گره می‌زند؛ این‌جا
//      ترتیب صریح است و در پایان هم تضمینِ پاک‌سازی داریم.
//
// ---------- چرا پورت‌های ۳۱۰۰/۳۱۰۱، نه ۳۰۰۰/۳۰۰۱ ----------
// ممکن است سرورِ توسعهٔ خودِ کاربر روی پورت‌های پیش‌فرض بالا باشد. این آزمون
// هرگز نباید به آن دست بزند یا روی دیتابیسِ **واقعی** بلغزد. پس هم پورت‌ها
// جدا هستند و هم `PG_DATA_DIR`/`PG_PICTURE_DIR` به یک کپیِ یک‌بارمصرف اشاره
// می‌کنند (همان قرارِ `backend/tests/sandbox.js`).
//
// ---------- اجرا ----------
//   cd next-frontend
//   npm run e2e                   # همین فایل (خودش بیلد می‌کند)
//   npm run e2e -- --headed       # آرگومان‌ها به Playwright می‌رسند
//   PG_E2E_REUSE_BUILD=1 npm run e2e   # اگر بیلدِ موجود از قبل به همین
//                                       # سندباکس اشاره می‌کند، بیلد نکن
//
// ---------- چرا خودش بیلد می‌کند (و این یک باگِ واقعی بود) ----------
// `rewrites()`ِ `next.config.ts` مقصدش را از `API_ORIGIN` می‌سازد، ولی Next آن
// را **در زمانِ بیلد** داخلِ `<distDir>/routes-manifest.json` می‌پخت:
//
//     "destination": "http://localhost:3000/api/:path*"   ← یخ‌زده روی دیسک
//
// یعنی `API_ORIGIN`ِ زمانِ `next start` بی‌اثر است. اجرای اولِ همین آزمون
// دقیقاً همین‌جا افتاد: پروکسی به :3000ِ خالی می‌رفت، هر درخواستِ API با
// ECONNREFUSED برمی‌گشت و کدِ پیامکی هرگز در لاگِ سندباکس ظاهر نمی‌شد —
// آزمونِ سبزِ توخالی، روی درختی که هیچ‌وقت به بک‌اندِ آزمون وصل نبود.
// پس هارنس اول مقصدِ پخته‌شده را از مانیفست می‌خواند؛ اگر به سندباکسِ خودش
// اشاره نکند، با `API_ORIGIN`ِ درست بیلد می‌کند. (روی بیلدِ درست، با
// `PG_E2E_REUSE_BUILD=1` از این هزینه صرف‌نظر می‌شود.)
//
// کدِ خروج: ۰ = همه سبز · ۱ = شکستِ آزمون · ۲ = پیش‌شرط (پورت اشغال، بیلد
// نشد، سرور بالا نیامد).

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..");
const ROOT = path.resolve(NEXT_DIR, "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const ARTIFACTS = path.join(NEXT_DIR, "e2e", ".artifacts");

const {
  makeSandboxData,
  removeSandboxData,
  serverEnv,
} = require(path.join(BACKEND_DIR, "tests", "sandbox.js"));

const BACKEND_PORT = Number(process.env.PG_E2E_BACKEND_PORT || 3100);
const WEB_PORT = Number(process.env.PG_E2E_WEB_PORT || 3101);
const BACKEND = `http://127.0.0.1:${BACKEND_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
/** شماره‌ی مدیرِ آزمون — موقتی است و فقط در همین سندباکس معنا دارد. */
const ADMIN_PHONE = "09120000009";
/** تعدادِ کدهای پشتیبانِ ساخته‌شده برای مدیرِ آزمون. */
const RECOVERY_COUNT = 8;

const args = process.argv.slice(2);
const passthrough = args.filter((a) => a !== "--");

function log(msg) {
  console.log(`[e2e] ${msg}`);
}

/* ---------- اجرای ابزارهای واقعیِ ساختِ کلید، به‌جای بازنویسیِ منطق ---------- */
// کدِ پشتیبان و کلیدِ TOTP **باید** با همان ابزاری ساخته شوند که مدیرِ واقعی
// استفاده می‌کند (`tools/admin-*.js`)؛ وگرنه آزمون چیزی را می‌سنجد که در
// production اجرا نمی‌شود. ولی این ابزارها `lib/mfa` را require می‌کنند و آن هم
// به `lib/shared-state` می‌رسد که ممکن است دیتابیس را باز کند — پس همین‌جا،
// قبل از اجرا، دیتابیس را به یک پوشهٔ موقت می‌بریم تا حتی یک بایت هم به
// دیتابیسِ واقعیِ مغازه دست نخورد.
function toolJson(script, toolArgs) {
  const res = spawnSync(process.execPath, [path.join(BACKEND_DIR, "tools", script), ...toolArgs], {
    cwd: BACKEND_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      PG_DATA_DIR: tempDataDir,
      PG_PICTURE_DIR: path.join(tempDataDir, "picture"),
      CLUSTER_ENABLED: "0",
    },
  });
  if (res.status !== 0) {
    console.error(res.stdout || "", res.stderr || "");
    throw new Error(`tools/${script} با کدِ ${res.status} تمام شد`);
  }
  return JSON.parse(res.stdout);
}

/* ---------- پیش‌شرط‌ها، پیش از هر کارِ سنگین ---------- */
// «آزاد است؟» با **اتصال** سنجیده می‌شود، نه با bind. چرا این تفاوت مهم است:
// روی ویندوز یک سرورِ گوش‌دهنده روی `0.0.0.0:3100` جلوی bindِ یک سوکتِ
// `127.0.0.1:3100` را *نمی‌گیرد*؛ اجرای اولِ همین سنجش دقیقاً همین‌جا لغزید —
// پیش‌شرط «آزاد است» گفت، هارنس سرورِ خودش را بالا آورد، سرور با EADDRINUSE
// مرد، آماده‌بودن از *سرورِ غریبه* جواب گرفت، و شش سناریو با «کدی در لاگ
// نیامد» افتادند در حالی که خطای واقعی جای دیگری بود.
// اتصال، همان چیزی است که کاربرِ واقعی انجام می‌دهد: پاسخ داد یا نه.
for (const [name, port] of [["بک‌اند", BACKEND_PORT], ["Next", WEB_PORT]]) {
  const probe = spawnSync(process.execPath, ["-e", `
    const net = require('net');
    const s = net.connect({ port: ${port}, host: '127.0.0.1' });
    const done = (code) => { s.destroy(); process.exit(code); };
    s.once('connect', () => done(1));            // کسی گوش می‌دهد → اشغال
    s.once('error', () => done(0));              // هیچ‌کس نیست → آزاد
    setTimeout(() => done(0), 1500).unref();
  `], { encoding: "utf8" });
  if (probe.status !== 0) {
    console.error(`پیش‌شرط: روی پورتِ ${port} (برای ${name}) کسی گوش می‌دهد. `
      + "این آزمون هرگز روی سرورِ در حالِ اجرا نمی‌نشیند؛ آن را ببندید یا "
      + "PG_E2E_BACKEND_PORT/PG_E2E_WEB_PORT را عوض کنید.");
    process.exit(2);
  }
}

/* ---------- سندباکس + کلیدهای آزمون ---------- */
const tempDataDir = makeSandboxData();

const totpInfo = toolJson("admin-totp.js", [ADMIN_PHONE, "--json"]);
const recoveryInfo = toolJson("admin-recovery.js", [ADMIN_PHONE, `--count=${RECOVERY_COUNT}`, "--json"]);
const recoveryCodes = recoveryInfo.codes;   // شکلِ XXXX-XXXX-XXXX

fs.mkdirSync(ARTIFACTS, { recursive: true });
const backendLog = path.join(ARTIFACTS, "backend.log");
const nextLog = path.join(ARTIFACTS, "next.log");
const backendLogFd = fs.openSync(backendLog, "w");
const nextLogFd = fs.openSync(nextLog, "w");

/* ---------- فرزندان ---------- */
const children = [];
function start(name, command, commandArgs, { cwd, env, logFd }) {
  const child = spawn(command, commandArgs, {
    cwd,
    env,
    stdio: ["ignore", logFd, logFd],
  });
  child.once("exit", (code, signal) => {
    if (!stopping) log(`${name} تمام شد (کد ${code ?? "-"}، سیگنال ${signal ?? "-"})`);
  });
  children.push({ name, child });
  return child;
}

let stopping = false;
function stopChild({ child }) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    // روی ویندوز `kill` به فرزندِ فرزندان نمی‌رسد؛ Next زیرپروسه می‌سازد.
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
}

function finish(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) stopChild(c);
  removeSandboxData(tempDataDir);
  fs.closeSync(backendLogFd);
  fs.closeSync(nextLogFd);

  // ---------- کدِ خروج — جايی که یک باندِ واقعی داشتیم ----------
  // تا پیش از این، تایمرِ پایان **`unref()`** شده بود: هر وقت کارِ دیگری
  // نبود، Node خودش پروسه را با کدِ طبيعي (**صفر**) می‌بست و تایمرِ ما هرگز
  // نمی‌رسید. یعنی `node scripts/e2e.mjs` حتی با شکستِ یک سناریو هم کدِ ۰
  // می‌داد. در ترمینال کسی نمی‌فهمید (خطِ «Playwright با کدِ ۱ تمام شد»
  // چاپ می‌شد)، ولی هر مصرف‌کنندهٔ *ماشینی* — CI و هارنسِ جهش — این را
  // «سبز» می‌دید. همین یک لغزش، لنگرِ جهش را هم می‌شکست: جهش می‌گرفت ولی
  // کدِ خروج صفر بود، پس «گرفته نشد» ثبت می‌شد.
  // حالا کدِ خروج هم روی خودِ پروسه می‌نشیند و هم تایمر **refشده** است.
  process.exitCode = code;
  setTimeout(() => process.exit(code), 300);
}
process.on("exit", () => { for (const c of children) stopChild(c); });
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => { removeSandboxData(tempDataDir); finish(2); });
}

/* ---------- ۱) بک‌اندِ سندباکس ---------- */
// `SITE_URL` روی مبدأِ **Next** تنظیم می‌شود، نه روی خودِ بک‌اند. دلیلش دقیقاً
// همان چیزی است که در production می‌گذرد: درگاه، مشتری را به
// `/api/orders/payment-callback` روی همان دامنهٔ سایت برمی‌گرداند و Next آن
// `/api` را به بک‌اند پروکسی می‌کند. اگر این‌جا SITE_URL را بک‌اند می‌گذاشتیم،
// مشتریِ آزمون وسطِ پرداخت از سایت بیرون می‌افتاد — یعنی مسیرِ آزمون‌شده دیگر
// مسیرِ production نبود.
start("backend", process.execPath, ["server.js"], {
  cwd: BACKEND_DIR,
  env: serverEnv(tempDataDir, {
    PORT: String(BACKEND_PORT),
    SITE_URL: WEB,
    ADMIN_PHONE,
    ADMIN_TOTP_SECRETS: `${ADMIN_PHONE}:${totpInfo.secret}`,
    ADMIN_RECOVERY_CODES: recoveryInfo.envLine.replace(/^ADMIN_RECOVERY_CODES=/, ""),
    // نوشتن‌های مرورگر از مبدأِ Next می‌آیند، پس همان باید در فهرستِ مجازِ CSRF باشد.
    CSRF_EXTRA_ORIGINS: WEB,
  }),
  logFd: backendLogFd,
});

async function waitFor(url, { expectAnyStatus = false, timeoutMs = 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (expectAnyStatus || res.ok) return true;
    } catch { /* هنوز گوش نمی‌دهد */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

if (!(await waitFor(`${BACKEND}/api/health`))) {
  log("بک‌اند بالا نیامد — لاگِ آخر:");
  console.error(fs.readFileSync(backendLog, "utf8").slice(-2000));
  finish(2);
  process.exit(2);
}
log(`بک‌اندِ سندباکس روی ${BACKEND} بالا آمد (داده: ${tempDataDir})`);

/* ---------- ۲) بیلدِ Next، از درختِ همین لحظه ----------
 * چرا پیش‌فرض «همیشه بیلد» است و نه «اگر بیلد نبود»: مقصدِ rewrite در زمانِ
 * بیلد پخته می‌شود، پس یک بیلدِ کهنه دو جور آزمونِ سبزِ دروغ می‌سازد —
 * هم می‌تواند به بک‌اندِ اشتباهی وصل شود، هم صفحه‌های *قبل از* آخرین ویرایش
 * را نشان دهد. با `PG_E2E_REUSE_BUILD=1` می‌شود از بیلد صرف‌نظر کرد، ولی
 * آن‌وقت هم اثرِ انگشتِ درخت (HEAD + تغییراتِ نسخه‌بندی‌شده) باید عیناً همان
 * چیزی باشد که بیلد با آن ساخته شده؛ وگرنه باز بیلد می‌شود. یعنی «سریع»
 * هرگز به «کهنه» تبدیل نمی‌شود. */
// پوشهٔ خروجیِ همین هارنس — **جدا** از `.next`ِ سایت. دلیلش یک حادثهٔ واقعی است:
// مقصدِ rewrite در زمانِ بیلد داخلِ پوشهٔ خروجی پخته می‌شود، پس بیلدِ سندباکس
// روی `.next` یعنی بیلدِ productionِ کاربر تا اولین بیلدِ بعدی به پورتِ
// سندباکس اشاره می‌کند. آن‌وقت `next start` بالا می‌آید، صفحه‌ها می‌آیند، ولی
// `/api` و `/picture` به یک پورتِ مرده می‌روند: لوگو نمی‌آید و دسته‌بندی‌ها
// خالی می‌شود، بی‌هیچ خطایی. `next.config.ts` همین متغیر را می‌خواند.
const DIST_DIR_NAME = ".next-e2e";
const DIST_DIR = path.join(NEXT_DIR, DIST_DIR_NAME);
const BUILD_MARKER = path.join(DIST_DIR, ".e2e-build.json");

function treeFingerprint() {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: NEXT_DIR, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: NEXT_DIR, encoding: "utf8" });
  if (head.status !== 0 || status.status !== 0) return null; // گیت نیست → «نامعلوم»
  return `${head.stdout.trim()}|${status.stdout.trim()}`;
}

function readBuildMarker() {
  try { return JSON.parse(fs.readFileSync(BUILD_MARKER, "utf8")); } catch { return null; }
}

function writeBuildMarker(apiOrigin, tree) {
  try {
    fs.writeFileSync(BUILD_MARKER, JSON.stringify({ apiOrigin, tree }, null, 1));
  } catch { /* بی‌اهمیت: دفعهٔ بعد فقط دوباره بیلد می‌شود */ }
}

/** مبدأیی که `/api/:path*` **داخلِ مانیفستِ بیلدِ فعلی** به آن اشاره می‌کند. */
function bakedApiOrigin() {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(DIST_DIR, "routes-manifest.json"), "utf8")
    );
    const all = [
      ...(manifest.rewrites?.beforeFiles ?? []),
      ...(manifest.rewrites?.afterFiles ?? []),
      ...(manifest.rewrites?.fallback ?? []),
    ];
    const rule = all.find((r) => r.source === "/api/:path*");
    if (!rule) return null;
    return rule.destination.replace(/\/api\/:path\*$/, "").replace(/\/+$/, "");
  } catch {
    return null; // بیلدی نیست، یا قابلِ خواندن نیست — هر دو یعنی «باید بیلد شود»
  }
}

const buildEnv = {
  ...process.env,
  NODE_ENV: "production",
  API_ORIGIN: BACKEND,
  NEXT_PUBLIC_SITE_URL: WEB,
  // بیلد **و** `next start` همین متغیر را می‌خوانند (next.config.ts → distDir)،
  // پس هارنس و سایتِ کاربر هیچ‌وقت روی یک پوشه نمی‌نویسند.
  PG_NEXT_DIST_DIR: DIST_DIR_NAME,
};

const baked = bakedApiOrigin();
const reuse = process.env.PG_E2E_REUSE_BUILD === "1";
const tree = treeFingerprint();
const marker = readBuildMarker();

// «قابلِ استفادهٔ دوباره» یعنی: کاربر خواسته، مقصدش سندباکسِ همین اجراست، و
// درخت هیچ تغییری نکرده (وگرنه بیلد مربوط به کدِ قبلی است).
const reusable = reuse
  && baked === BACKEND
  && tree !== null
  && marker?.tree === tree;

if (!reusable) {
  const why = reuse
    ? (baked !== BACKEND
      ? `بیلدِ موجود به ${baked ?? "هیچ‌جا"} اشاره می‌کند، نه به سندباکسِ ${BACKEND}`
      : "درخت از زمانِ بیلدِ قبلی عوض شده")
    : "پیش‌فرض: هر اجرا از درختِ همین لحظه بیلد می‌شود";
  log(`${why} — بیلد می‌کنم`);
  const built = spawnSync(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "build"],
    { cwd: NEXT_DIR, env: buildEnv, stdio: "inherit" }
  );
  if (built.status !== 0) {
    log(`بیلدِ Next شکست خورد (کدِ ${built.status ?? "-"}) — آزمون معنا ندارد`);
    finish(2);
    process.exit(2);
  }
  writeBuildMarker(BACKEND, treeFingerprint());
} else {
  log("از بیلدِ موجود استفاده می‌کنم (PG_E2E_REUSE_BUILD=1 و درخت دست‌نخورده)");
}

const effective = bakedApiOrigin();
if (effective !== BACKEND) {
  log(`بیلد به ${effective ?? "هیچ‌جا"} اشاره می‌کند، نه به ${BACKEND} — ادامه بی‌معناست`);
  finish(2);
  process.exit(2);
}

// صفحه‌های محصول در زمانِ بیلد پیش‌رندر می‌شوند (`generateStaticParams`). اگر
// بک‌اند در دست نبود، بیلد سبز می‌ماند ولی **صفر** صفحهٔ محصول می‌سازد — همان
// «بیلدِ سبزِ توخالی» که stepِ CI هم صریحاً می‌گیرد. این‌جا هم لازم است:
// سناریوی پرداخت از `/products` شروع می‌کند و با صفر صفحهٔ محصول، Playwright
// روی یک صفحهٔ خالی می‌افتد و خطا را به شکلِ «دکمهٔی نیست» گزارش می‌کند.
function countPrerenderedProducts(dir = path.join(DIST_DIR, "server", "app", "product")) {
  let total = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += countPrerenderedProducts(full);
    else if (entry.name.endsWith(".html")) total += 1;
  }
  return total;
}

const prerendered = countPrerenderedProducts();
if (prerendered < 1) {
  log("هیچ صفحهٔ محصولی پیش‌رندر نشده — یعنی بیلد به بک‌اندِ زنده نرسیده است");
  finish(2);
  process.exit(2);
}
log(`${prerendered} صفحهٔ محصول پیش‌رندر شد`);

/* ---------- ۳) سرورِ Next (production) ----------
 * نکته‌ای که یک بار هزینه‌اش را داد: `API_ORIGIN`ِ همین لحظه، مقصدِ پروکسی را
 * عوض نمی‌کند — آن مقصد داخلِ پوشهٔ خروجیِ بیلد پخته شده. `API_ORIGIN` این‌جا برای سرورِ
 * *زنده* است: `lib/site.ts` (fetchهای سمتِ سرور) و `next/image` از همین
 * می‌خوانند. پس هر دو باید یکی باشند، و همان `buildEnv` به هر دو داده می‌شود. */
const nextBin = require.resolve("next/dist/bin/next");
start("next", process.execPath, [nextBin, "start", "-p", String(WEB_PORT)], {
  cwd: NEXT_DIR,
  env: { ...buildEnv, PORT: String(WEB_PORT) },
  logFd: nextLogFd,
});

// آماده‌بودن با «هر وضعیتِ HTTP» سنجیده می‌شود، نه با ۲۰۰ روی یک مسیرِ ثابت:
// همان درسِ `static-paths-live.mjs` — اگر مسیرها موضوعِ سنجش باشند، ۴۰۴ هم
// ثابت می‌کند پروسه گوش می‌دهد.
if (!(await waitFor(`${WEB}/__readiness__`, { expectAnyStatus: true }))) {
  log("Next بالا نیامد — لاگِ آخر:");
  console.error(fs.readFileSync(nextLog, "utf8").slice(-2000));
  finish(2);
  process.exit(2);
}
log(`Next روی ${WEB} بالا آمد`);

// آماده‌بودن فقط یک چیز را ثابت می‌کند: «کسی روی این پورت جواب می‌دهد» —
// نه این‌که *همان* سروری است که ما ساختیم. اگر فرزندِ ما وسط راه مرده باشد
// (EADDRINUSE، خطای دیتابیس، پورتِ اشغال) و جای دیگری جواب بدهد، همه‌چیز
// سبزِ دروغ می‌شود. پس پیش از Playwright، زنده‌بودنِ خودِ فرزندان سنجیده می‌شود.
for (const { name, child } of children) {
  if (child.exitCode !== null || child.signalCode !== null) {
    log(`${name} پیش از آغازِ آزمون مرده است (کد ${child.exitCode ?? "-"}) — لاگش:`);
    console.error(
      fs.readFileSync(name === "backend" ? backendLog : nextLog, "utf8").slice(-2000)
    );
    finish(2);
    process.exit(2);
  }
}

/* ---------- ۴) Playwright ---------- */
const cli = require.resolve("@playwright/test/cli");
log(`اجرای Playwright${passthrough.length ? ` (${passthrough.join(" ")})` : ""}`);
const runner = spawn(process.execPath, [cli, "test", ...passthrough], {
  cwd: NEXT_DIR,
  stdio: "inherit",
  env: {
    ...process.env,
    PG_E2E_WEB: WEB,
    PG_E2E_API: BACKEND,
    PG_E2E_BACKEND_DIR: BACKEND_DIR,
    PG_E2E_BACKEND_LOG: backendLog,
    PG_E2E_ADMIN_PHONE: ADMIN_PHONE,
    PG_E2E_TOTP_SECRET: totpInfo.secret,
    PG_E2E_RECOVERY_CODES: recoveryCodes.join(","),
  },
});

runner.once("exit", (code) => {
  log(code === 0 ? "همهٔ سناریوها سبز" : `Playwright با کدِ ${code} تمام شد`);
  finish(code ?? 1);
});
runner.once("error", (err) => {
  log(`اجرای Playwright نشد: ${err.message}`);
  finish(2);
});
