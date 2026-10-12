#!/usr/bin/env node
// ============================================================
// تمرینِ کاتاور — هر دو دنیا پشتِ یک دامنه، روی یک پورت
// ============================================================
// تا امروز «کاتاور» یک آرزو بود: همه‌ی سنجش‌ها روی دو مبدأ جدا اجرا می‌شدند
// (Express روی ۳۰۰۰ و Next روی ۳۰۰۱) و هیچ‌وقت کسی *همان چیزی* را که کاربر
// می‌بیند نسنجیده بود: یک دامنه که صفحه‌ها را از Next و API/عکس را از Express
// می‌گیرد. تفاوت این دو، همان جایی است که لینک‌ها می‌شکنند — چون مسیری که
// روی یک مبدأ زنده است، روی دامنه‌ی واحد می‌تواند به دنیای دیگری برود.
//
// این اسکریپت چهار کار می‌کند:
//   ۱. یک پروکسیِ کوچک روی یک پورت بالا می‌آورد که **دقیقاً** همان مسیریابیِ
//      مستندِ nginx است (`HTTPS-GUIDE.md` → «پیکربندی nginx»):
//         /api/     → Express :3000
//         /picture/ → Express :3000
//         بقیه      → Next    :3001
//   ۲. از همان مبدأ می‌خزد: صفحه‌های Next، نشانی‌های عصرِ Express (`.html`)،
//      مسیرهای ثابت و PWA، API، عکس‌ها، و هر لینک/داراییِ داخلیِ پیدا‌شده.
//   ۳. فهرست می‌کند **کدام مسیر یا لینک می‌شکند** — با زنجیره‌ی کاملش.
//   ۴. رفتارِ *خطا* را روی همان دامنه سنجیده می‌کند: مسیرِ ناموجود، خطای ۵۰۰ی
//      که خودِ upstream برمی‌گرداند، و بالا‌نبودنِ یکی از دو سرویس. هر سه از
//      پشتِ همین پروکسی و با همان قراردادی که `HTTPS-GUIDE.md` می‌نویسد
//      (`error_page`، سوئیچِ `proxy_intercept_errors`، و `@api_down`).
//      نبودِ یک سرویس با پورتِ *بسته* شبیه‌سازی می‌شود، پس خطای واقعیِ شبکه
//      (ECONNREFUSED) رخ می‌دهد و فوریُبودن هم اندازه‌گیری می‌شود.
//
// ---------- چرا پروکسی و نه «Next را روی ۳۰۰۰ بالا کن» ----------
// چون کاربر هرگز فقط Next را نمی‌بیند: بدنه‌ی صفحه از Next می‌آید ولی عکسِ
// محصول، `/api/*` و سبد از Express. دو برنامه با یک دامنه یعنی مسیریابی، و
// مسیریابی جایی است که ایرادها پنهان می‌شوند (`/js/…` روی Express زنده است و
// روی دامنه مرده، چون nginx آن را به Next می‌دهد).
//
// ---------- دسته‌بندیِ شکست‌ها (مهم است، نه همه یک‌جورند) ----------
//   • شکستِ زنده: لینکی که *از یک صفحه‌ی سرو‌شده* آمده و به ۴۰۴/۴۱۰ می‌رسد.
//     این خرابیِ واقعیِ کاتاور است.
//   • شکستِ ارجاع‌شده از دنیای قدیم: مسیری که فقط از یک فایلِ `frontend/`
//     (کشِ کهنه، بوکمارک، لینکِ واتساپ) صدا زده می‌شود.
//   • انتقال: ریدایرکتی که به صفحه‌ی زنده می‌رسد — شکست نیست.
//
// اجرا (هر دو سرور باید بالا باشند):
//   node scripts/cutover-rehearsal.mjs                 # پورتِ ۸۰۸۰ (اگر آزاد نبود، خودش می‌گیرد)
//   node scripts/cutover-rehearsal.mjs --port=9000
//   node scripts/cutover-rehearsal.mjs --verbose        # هر مسیر را چاپ کن، نه فقط شکست‌ها
//   node scripts/cutover-rehearsal.mjs --serve          # فقط دامنه‌ی واحد را بالا نگه دار (خزش نکن)
//   node scripts/cutover-rehearsal.mjs --slow           # + درگاهِ باز و بی‌جواب (سنجشِ کاملِ بودجه‌ی صبر)
//
// کدِ خروج: ۰ = هیچ مسیر/لینکِ شکسته‌ای نیست · ۱ = شکستِ زنده · ۲ = پیش‌شرط

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LEGACY_PAGE_ALIASES, legacyRedirect } from "../src/lib/legacyUrls.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..");
const ROOT = path.resolve(NEXT_DIR, "..");
const FRONTEND_DIR = path.resolve(ROOT, "frontend");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};

const EXPRESS = String(flag("express", "http://127.0.0.1:3000")).replace(/\/+$/, "");
const NEXT = String(flag("next", "http://127.0.0.1:3001")).replace(/\/+$/, "");
const PORT = Number(flag("port", 8080)) || 8080;
const VERBOSE = flag("verbose", false) === true;
// حالتِ سرو: به‌جای خزش، پروکسی را بالا نگه می‌دارد تا خودتان روی همان
// پورت ببینید. خزش حکم می‌دهد؛ این حالت به چشم اجازه‌ی قضاوت می‌دهد.
const SERVE = flag("serve", false) === true;
// درگاهِ باز و بی‌جواب: سنجشِ همین یک حالت، بودجه‌ی صبر را *واقعاً* خرج
// می‌کند (تا `proxy_read_timeout`ِ مستند). پس پیش‌فرض خاموش است تا تمرینِ
// همیشه‌رو سریع بماند، ولی عددش همیشه از مستند خوانده می‌شود.
const SLOW = flag("slow", false) === true;
/** سقفِ خزش — تمرین باید سریع تمام شود؛ ۳۰۰ سقفِ مناسبی برای این سایت است. */
const MAX_URLS = 300;
const MAX_HOPS = 5;

let exitCode = 0;
// ارجاع‌هایی که داوری درباره‌شان معنا ندارد (اندپوینتِ POST و رشته‌ی داخلِ
// باندل) — از خرابیِ واقعی جدا نگه داشته می‌شوند، ولی شمرده و چاپ می‌شوند.
const notJudged = [];
const probes = []; // کاوش‌های عمدی (مثل عکسِ گم‌شده) — نتیجه‌شان اطلاعی است، نه حکم
// ارجاع‌هایی که از *صفحه‌ی خطا* پیدا شده‌اند: کسی روی صفحه‌ی ۴۰۴ ناوبری
// نمی‌کند، پس نبودِ دارایی‌های آن صفحه خرابیِ لینک نیست — ولی چون یک یافته‌ی
// واقعیِ کاتاور است (صفحه‌ی خطای Express روی دامنه بی‌استایل می‌شود)، چاپ می‌شود.
const fromErrorRefs = [];
const broken = []; // شکست‌های زنده (لینکی از صفحه‌ی سروشده)
const stale = []; // شکست‌هایی که فقط از دنیای قدیم ارجاع می‌شوند
const notes = [];

const say = (s = "") => console.log(s);

// ------------------------------------------------------------
// ۱) پروکسی — همان مسیریابیِ مستند
// ------------------------------------------------------------
// مسیرهایی که nginx به Express می‌دهد. عمداً «پیشوند» است نه regex، چون خودِ
// پیکربندیِ مستند `location /api/` و `location /picture/` است.
const TO_EXPRESS = ["/api/", "/picture/"];

// ------------------------------------------------------------
// ۰) قراردادِ لبه — از خودِ مستند خوانده می‌شود، نه از حافظه
// ------------------------------------------------------------
// چرا parse و نه «همان عددها را این‌جا بنویسیم»: اگر این اسکریپت مهلت‌ها و
// مسیرِ کارتِ خطا را از خودش بداند، با هر تغییرِ پیکربندیِ nginx *بی‌صدا* از
// آن جدا می‌شود و یک نسخه‌ی دومِ حقیقت می‌سازد. پس بلوک‌های مستند خوانده و
// همان‌ها اجرا می‌شوند؛ نبودِ هر لنگر یعنی پیش‌شرطِ ناقص، نه یک سبزِ خالی.
const GUIDE = path.join(ROOT, "HTTPS-GUIDE.md");

/** بدنه‌ی یک بلوکِ `location` — از سرِ آن تا بستنِ هم‌تورفتگی‌اش. */
function blockOf(src, head) {
  const i = src.indexOf(head);
  if (i === -1) return null;
  const j = src.indexOf("\n    }", i);
  return j === -1 ? null : src.slice(i, j);
}
const secondsOf = (block, directive) => {
  const m = block && block.match(new RegExp(`${directive}\\s+(\\d+)s;`));
  return m ? Number(m[1]) * 1000 : null;
};
const interceptOf = (block) => {
  const m = block && block.match(/proxy_intercept_errors\s+(on|off);/);
  return m ? m[1] === "on" : null;
};

function loadEdgeContract() {
  const src = fs.readFileSync(GUIDE, "utf8");
  const api = blockOf(src, "location /api/ {");
  const picture = blockOf(src, "location /picture/ {");
  const page = blockOf(src, "location / {");
  const cardLoc = blockOf(src, "location = /error-500.html {");
  const down = blockOf(src, "location @api_down {");

  const cardLine = src.match(/error_page\s+([\d ]+?)\s+(\/error-500\.html);/);
  const downReturn = down && down.match(/return\s+(\d{3})\s+'([^']+)'/);
  const root = cardLoc && cardLoc.match(/root\s+(\S+);/);
  // مسیرِ `root` در مستند، مسیرِ سرور است (`/var/www/…/next-frontend/public`).
  // همان پوشه روی ماشینِ توسعه `next-frontend/public`ِ همین مخزن است.
  const tail = root
    ? root[1].slice(root[1].indexOf("next-frontend/") + "next-frontend/".length)
    : "";

  const contract = {
    cardStatuses: cardLine ? cardLine[1].trim().split(/\s+/).map(Number) : [],
    cardPath: cardLine && root ? path.join(NEXT_DIR, tail, cardLine[2]) : null,
    cardCache: /Cache-Control\s+"no-store"/.test(cardLoc || "") ? "no-store" : null,
    api: {
      connect: secondsOf(api, "proxy_connect_timeout"),
      read: secondsOf(api, "proxy_read_timeout"),
      intercept: interceptOf(api),
      downStatus: downReturn ? Number(downReturn[1]) : null,
      downBody: downReturn ? downReturn[2] : null,
      downType: down && /default_type\s+application\/json/.test(down) ? "application/json" : null,
    },
    picture: {
      connect: secondsOf(picture, "proxy_connect_timeout"),
      read: secondsOf(picture, "proxy_read_timeout"),
    },
    page: {
      connect: secondsOf(page, "proxy_connect_timeout"),
      read: secondsOf(page, "proxy_read_timeout"),
      intercept: interceptOf(page),
    },
  };

  const missing = [];
  if (!contract.cardStatuses.length || !contract.cardPath) missing.push("خطِ error_page برای کارتِ ۵۰۰");
  else if (!fs.existsSync(contract.cardPath)) missing.push(`فایلِ کارت روی دیسک نیست (${contract.cardPath})`);
  if (!contract.cardCache) missing.push('add_header Cache-Control "no-store" روی همان کارت');
  if (!contract.api.connect || contract.api.intercept !== false) missing.push("location /api/ (مهلتِ اتصال + proxy_intercept_errors off)");
  if (!contract.api.downStatus || !contract.api.downBody || !contract.api.downType) missing.push("location @api_down (کد، بدنه و default_type)");
  if (!contract.picture.connect) missing.push("location /picture/ (مهلتِ اتصال)");
  if (!contract.page.connect || !contract.page.read || contract.page.intercept !== true) missing.push("location / (مهلت‌ها + proxy_intercept_errors on)");
  return { contract, missing };
}

const { contract: EDGE, missing: EDGE_MISSING } = loadEdgeContract();
// کارتِ لبه از دیسک خوانده می‌شود (همان کاری که nginx با `root` می‌کند) تا
// بدنه‌ی سروشده بایت‌به‌بایت با فایل مقایسه شود، نه با «به‌نظر درست است».
const CARD_BODY = EDGE.cardPath && fs.existsSync(EDGE.cardPath) ? fs.readFileSync(EDGE.cardPath) : null;

// سرویسِ خوابیده: مبدأش به پورتِ *بسته* می‌رود، پس خطای واقعیِ شبکه
// (ECONNREFUSED) رخ می‌دهد — نه یک ۵۰۲ِ ساختگیِ خودمان. با همین، «فوری بود»
// هم معنا پیدا می‌کند: اندازه‌گیری روی همان چیزی است که مشتری تجربه می‌کند.
const OVERRIDE = { next: null, express: null };

function upstreamFor(pathname) {
  const toExpress = TO_EXPRESS.some((p) => pathname.startsWith(p));
  return toExpress ? OVERRIDE.express || EXPRESS : OVERRIDE.next || NEXT;
}

/** هدرهای کارتِ لبه — خطا از دیسک سرو می‌شود، با همان `no-store`ِ مستند. */
function cardHeaders() {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(CARD_BODY),
    ...(EDGE.cardCache ? { "cache-control": EDGE.cardCache } : {}),
  };
}

/** خطای ساخته‌ی خودِ لبه (۵۰۲/۵۰۴) یا ۵۰۰ی که از upstream نیامده. */
function sendCard(res, status, extra = {}) {
  res.writeHead(status, { ...cardHeaders(), "x-rehearsal-upstream": "edge", ...extra });
  res.end(CARD_BODY);
}

/** پاسخِ `location @api_down` — به زبانِ خودِ API، نه کارتِ HTML. */
function sendApiDown(res) {
  res.writeHead(EDGE.api.downStatus, {
    "content-type": EDGE.api.downType,
    "content-length": Buffer.byteLength(EDGE.api.downBody, "utf8"),
    "x-rehearsal-upstream": "edge",
  });
  res.end(EDGE.api.downBody);
}

// تزریقِ خطا: این دو مسیرِ ساختگی پاسخِ «۵۰۰ِ upstream» را می‌سازند تا مسیرِ
// `error_page` سنجیده شود، بدونِ دست‌زدن به کدِ تولید. مسیرِ `/api/` عمداً
// جدا است: قراردادِ آن‌جا JSON است و نباید کارت ببیند.
const FAULT_PAGE = "/__rehearsal__/upstream-500";
const FAULT_API = "/api/__rehearsal__/upstream-500";
const FAULT_MARK = "upstream-500-tazrigh";

function injectedUpstream500(req, res, pathname) {
  const isApi = pathname.startsWith("/api/");
  const upstream = isApi ? "express" : "next";
  const body = `<!doctype html><html><body><h1>${FAULT_MARK} (${upstream})</h1></body></html>`;
  const intercepted = !isApi && EDGE.page.intercept === true && EDGE.cardStatuses.includes(500);
  if (intercepted) return sendCard(res, 500, { "x-rehearsal-injected": "500" });
  res.writeHead(500, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body, "utf8"),
    "x-rehearsal-upstream": upstream,
    "x-rehearsal-injected": "500",
  });
  res.end(body);
}

function proxy(req, res) {
  const pathname = req.url.split("?")[0];
  if (pathname === FAULT_PAGE || pathname === FAULT_API) return injectedUpstream500(req, res, pathname);

  const target = upstreamFor(pathname);
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  const isPicture = pathname.startsWith("/picture/");
  const url = new URL(req.url, target);
  const up = http.request(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        ...req.headers,
        // میزبانِ دامنه می‌ماند (مثلِ `proxy_set_header Host $host` در nginx).
        host: req.headers.host,
      },
    },
    (upRes) => {
      const status = upRes.statusCode || 502;
      // همان سوئیچِ `proxy_intercept_errors`: روی `location /` روشن است
      // (خطای خودِ Next هم به همان کارت می‌رسد) و روی `/api/` خاموش
      // (قراردادِ JSON). عمداً هیچ کدِ ۴۰۴ این‌جا نیست — `not-found.tsx`ِ
      // Next نباید قربانیِ کارتِ ۵۰۰ شود و در مستند هم `error_page …404` نداریم.
      const shouldIntercept = !isApi && !isPicture && EDGE.page.intercept === true && EDGE.cardStatuses.includes(status);
      if (shouldIntercept) {
        upRes.resume(); // بدنه‌ی upstream خوانده نمی‌شود؛ جای آن کارت می‌رود.
        return sendCard(res, status, { "x-rehearsal-intercepted": String(status) });
      }
      // بدنه بایت‌به‌بایت رد می‌شود و هدرها دست‌نخورده — پس
      // `content-encoding` و `location` همان چیزی می‌مانند که سرور گفته.
      res.writeHead(status, {
        ...upRes.headers,
        "x-rehearsal-upstream": target === EXPRESS ? "express" : "next",
      });
      upRes.pipe(res);
    },
  );
  // مهلتِ خواندن از مستند می‌آید: همین خط است که وقتی درگاه باز است و کسی
  // جواب نمی‌دهد، مشتری را از انتظارِ بی‌پایان نجات می‌دهد.
  const readMs = isApi ? EDGE.api.read : isPicture ? EDGE.picture.read : EDGE.page.read;
  if (readMs) up.setTimeout(readMs, () => up.destroy(new Error("etimeout")));
  up.on("error", (e) => {
    if (res.headersSent) return res.destroy();
    if (isApi) return sendApiDown(res);
    return sendCard(res, e.message === "etimeout" ? 504 : 502, { "x-rehearsal-edge-error": e.message });
  });
  req.pipe(up);
}

const server = http.createServer(proxy);

// ------------------------------------------------------------
// ۲) ابزارِ خزش
// ------------------------------------------------------------
/** یک پورتِ قطعاً بسته — برای شبیه‌سازیِ سرویسِ خوابیده. */
async function deadOrigin() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  await new Promise((r) => srv.close(r));
  return `http://127.0.0.1:${port}`;
}

/** درگاهی که اتصال را می‌پذیرد ولی هرگز پاسخ نمی‌دهد (پروسهٔ قفل‌شده). */
async function hungOrigin() {
  const sockets = new Set();
  const srv = net.createServer((sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    // وقتی خودِ پروکسی مهلت را تمام می‌کند و سوکت را می‌بندد، این طرف
    // ECONNRESET می‌گیرد. بدونِ این خط، همان ریستِ **منتظره** یک
    // unhandled 'error' می‌شود و کلِ تمرین را می‌کشد (تجربهٔ اجرای اول).
    sock.on("error", () => sockets.delete(sock));
    // عمداً هیچ پاسخی نمی‌دهد و سوکت را هم نمی‌بندد.
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => {
      for (const s of sockets) s.destroy();
      srv.close();
    },
  };
}

async function alive(origin) {
  try {
    const res = await fetch(origin + "/", {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

/** یک درخواست بدونِ دنبال‌کردنِ ریدایرکت. */
async function hit(url, { timeoutMs = 15000 } = {}) {
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "cutover-rehearsal/1.0" },
    // پیش‌فرض بلندتر از بودجهٔ *خواندنِ* مستند (۱۵s) نیست؛ هر جا سنجشی
    // عمداً همان بودجه را خرج می‌کند، مهلتِ خودِ سنجش هم بلندتر می‌شود
    // وگرنه سنجش پیش از پاسخ می‌میرد و تشخیص را بهجای گزارش می‌شکند.
    signal: AbortSignal.timeout(timeoutMs),
  });
  const loc = res.headers.get("location");
  const type = res.headers.get("content-type") || "";
  return {
    status: res.status,
    location: loc ? new URL(loc, url).toString() : null,
    upstream: res.headers.get("x-rehearsal-upstream") || "?",
    cache: res.headers.get("cache-control"),
    type,
    body: /html|css|javascript|json|xml/.test(type) ? await res.text() : "",
  };
}

/** زنجیره را دنبال می‌کند و می‌گوید کجا تمام شد. */
async function walk(start) {
  const hops = [];
  let url = start;
  for (let i = 0; i <= MAX_HOPS; i++) {
    const r = await hit(url);
    hops.push({ url, status: r.status, upstream: r.upstream, location: r.location });
    if (r.status >= 300 && r.status < 400 && r.location) {
      url = r.location;
      continue;
    }
    return { hops, terminal: { ...r, url } };
  }
  return { hops, terminal: null };
}

const sameOrigin = (base, href) => {
  try {
    const u = new URL(href, base);
    return u.origin === new URL(base).origin ? u : null;
  } catch {
    return null;
  }
};

// ------------------------------------------------------------
// طبقه‌بندیِ ارجاع‌ها — «لینک» و «رشته‌ی داخلِ باندل» یکی نیستند
// ------------------------------------------------------------
// درسِ اولین اجرای همین تمرین: استخراجِ خامِ رشته‌های مطلق از باندل‌های
// جاوااسکریپت ۵۰+ «شکستِ زنده» می‌سازد که هیچ‌کدام خرابی نیستند —
// `/api/orders` یک اندپوینتِ POST است (GET رویش ۴۰۴ می‌دهد و باید هم بدهد)،
// `/product/` تکه‌قالبِ کد است که با شناسه ساخته می‌شود، و `/a/b` و
// `/%3E%3C/svg%3E` آشغالِ مینیفای‌شده. اگر همه را «لینکِ شکسته» بشماریم،
// گزارش بی‌ارزش می‌شود و خرابیِ واقعی در نویز گم می‌شود.
//
// پس هر ارجاع یک «نوع» دارد و فقط دو نوع داوری می‌شوند:
//   link  — `href`/`action`/`src` در HTML یک صفحه‌ی سرو‌شده (مسیرِ کاربر)
//   asset — فایلی که *باید* سرو شود (`/_next/…`, `/assets/…`, `/picture/…`، یا هر
//           چیزی با پسوندِ فایل) — نبودش خرابی است، از هر کجا که آمده باشد
//   endpoint — `/api/…`؛ متدش POST است و GETِ ۴۰۴ درباره‌ی وجودش چیزی نمی‌گوید
//   code  — رشته‌ی داخلِ کد/CSS که مسیرِ صفحه نیست (تکه‌قالب، کلید، آشغال)
// پسوندهای واقعیِ دارایی — عمداً فهرستِ بسته و نه «هر چیزی که نقطه دارد»:
// `​/​req.url` و `​/e.url` هم نقطه دارند و در اجرای اولِ همین تمرین به‌عنوان
// «فایلِ گم‌شده» شمرده شدند، در حالی که عضوی از کد بودند.
const ASSET_EXT = /\.(js|mjs|css|svg|png|jpe?g|webp|avif|gif|ico|bmp|woff2?|ttf|otf|eot|json|xml|txt|webmanifest|map|mp4|webm|pdf)$/i;
const CANDIDATE = (p, fromCode = false) => {
  if (/^\/api\//.test(p)) return "endpoint";
  // مسیری که با `/` تمام می‌شود از کد یعنی «پیشوند»، نه فایل
  // (`/assets/fonts/` در سرویس‌ورکر یعنی «این زیرشاخه را این‌طور کش کن»).
  if (fromCode && p.split("?")[0].endsWith("/")) return null;
  if (ASSET_EXT.test(p.split("?")[0])) return "asset";
  return null;
};

function extractRefs(base, body, contentType) {
  const out = new Map(); // مسیر → نوع
  if (!body) return out;
  const push = (raw, fromCode) => {
    if (!raw) return;
    const v = String(raw).trim();
    if (!v || v.startsWith("#")) return;
    if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(v)) return;
    const u = sameOrigin(base, v);
    if (!u) return;
    const p = u.pathname + u.search;
    const kind = CANDIDATE(p) || (fromCode ? "code" : "link");
    // اگر یک مسیر از دو جا دیده شد، سخت‌گیرانه‌ترین نوع برنده است.
    const rank = { code: 0, endpoint: 1, asset: 2, link: 2 };
    if (!out.has(p) || rank[kind] > rank[out.get(p)]) out.set(p, kind);
  };

  // ۱) ارجاع‌های HTML — همان چیزی که مرورگر دنبال می‌کند
  for (const m of body.matchAll(/(?:href|src|action)\s*=\s*["']([^"']+)["']/gi)) push(m[1], false);
  for (const m of body.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
    for (const part of m[1].split(",")) push(part.trim().split(/\s+/)[0], false);
  }

  // ۲) داخلِ CSS — `url(…)` یک ارجاعِ واقعی است
  if (/css/.test(contentType)) {
    for (const m of body.matchAll(/url\((['"]?)([^)'"]+)\1\)/gi)) push(m[2], true);
  }

  // ۳) باندل‌های JS عمداً اسکن **نمی‌شوند**.
  //
  // این تصمیم از خودِ تمرین بیرون آمد، نه از سلیقه: خواندنِ رشته‌های مطلق از
  // کدِ مینیفای‌شده در اجرای اول ۲۲ «شکست» می‌ساخت که هیچ‌کدام مسیر نبودند —
  // `/(0,i.addBasePath`، `/N,E.origin`، `/%23b`، `/this`. (اندپوینت‌های POST هم
  // همان‌جا پیدا می‌شوند و GETِ ۴۰۴ درباره‌شان چیزی نمی‌گوید.) گزارشِ پر از نویز،
  // خرابیِ واقعی را پنهان می‌کند.
  return out;
}

// ------------------------------------------------------------
// ۳) اجرا
// ------------------------------------------------------------
if (SERVE) {
  await serveOnly();
} else if (EDGE_MISSING.length || !CARD_BODY) {
  console.error(
    `✖ قراردادِ لبه از خودِ HTTPS-GUIDE.md خوانده نشد — تمرینِ خطا معنا ندارد:\n` +
      EDGE_MISSING.map((m) => `    • ${m}`).join("\n"),
  );
  process.exitCode = 2;
} else if (!(await alive(EXPRESS)) || !(await alive(NEXT))) {
  console.error(
    `✖ برایِ تمرینِ کاتاور هر دو سرور لازم است:\n` +
      `    Express: cd backend && node server.js\n` +
      `    Next:    cd next-frontend && npm run start\n` +
      `  (Express ${EXPRESS} · Next ${NEXT})`,
  );
  process.exitCode = 2;
} else {
  await run();
  process.exitCode = exitCode;
}

/** پورتِ پروکسی — ثابت درخواست می‌شود، ولی اگر گرفته بود روی پورتِ آزاد. */
function listen() {
  return new Promise((resolve, reject) => {
    server.once("error", (e) => {
      if (e.code !== "EADDRINUSE") return reject(e);
      process.stdout.write(`پورتِ ${PORT} گرفته است؛ روی پورتِ آزاد بالا می‌آید.\n`);
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server.address().port));
  });
}

/** حالتِ سرو: بدونِ خزش، فقط دامنه‌ی واحد بالا می‌ماند. */
async function serveOnly() {
  const port = await listen();
  const up = [];
  if (!(await alive(EXPRESS))) up.push(`⚠ Express روی ${EXPRESS} جواب نمی‌دهد — /api و /picture خراب می‌شوند`);
  if (!(await alive(NEXT))) up.push(`⚠ Next روی ${NEXT} جواب نمی‌دهد — صفحه‌ها خراب می‌شوند`);
  say(`کاتاورِ تمرینی بالا است: http://127.0.0.1:${port}`);
  say(`  /api/ و /picture/ → Express ${EXPRESS}`);
  say(`  بقیه                → Next    ${NEXT}`);
  for (const u of up) say(`  ${u}`);
  say("برای بستن: Ctrl+C");
}

async function run() {
  const port = await listen();
  const DOMAIN = `http://127.0.0.1:${port}`;
  say(`تمرینِ کاتاور — دامنه‌ی واحد روی ${DOMAIN}\n`);
  say("مسیریابی (همان nginx مستند):");
  for (const p of TO_EXPRESS) say(`  ${p.padEnd(10)} → Express ${EXPRESS}`);
  say(`  بقیه                → Next    ${NEXT}`);

  // ---------- بذرها ----------
  // چهار دسته:
  //   ۱. مسیرهای تمیزِ فروشگاه (چیزی که کاربر می‌زند)
  //   ۲. نشانی‌های عصرِ Express (`*.html` — بوکمارک، گوگل، لینکِ واتساپ)
  //   ۳. مسیرهای ثابت و PWA (روی دامنه از Next می‌آید)
  //   ۴. API و عکس (روی دامنه از Express می‌آید)
  const seeds = new Map();
  // بذرهای `/api/…` عمداً `api-probe` هستند: خودمان فهرستشان کردیم و GET رویشان
  // باید ۲۰۰ بدهد؛ این با اندپوینت‌های POSTی که از *باندل* کشف می‌شوند فرق دارد.
  const addSeed = (p, why, kind) =>
    seeds.set(p, {
      why,
      from: "seed",
      kind: kind || (/^\/api\//.test(p) ? "api-probe" : "link"),
    });

  for (const p of ["/", "/products", "/cart", "/checkout", "/login", "/account", "/order-success", "/terms", "/wholesale", "/admin"]) {
    addSeed(p, "مسیرِ تمیز");
  }
  for (const file of Object.keys(LEGACY_PAGE_ALIASES)) addSeed(`/${file}`, "نشانیِ عصرِ Express");
  addSeed("/product.html?id=1", "نشانیِ عصرِ Express");
  addSeed("/login.html?next=%2Fcart", "نشانیِ عصرِ Express");
  for (const p of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/sw.js", "/offline.html", "/assets/icons.svg", "/assets/favicon.svg", "/assets/apple-touch-icon.png"]) {
    addSeed(p, "ثابت/PWA");
  }
  // دو کاوشِ عمدی — هیچ‌کدام «لینک» نیستند، پس حکم نمی‌گیرند ولی نتیجه‌شان
  // باید دیده شود:
  //   فراوایلن ۴۰۴‌هیچ لینکی به آن اشاره نمی‌کند؛ مرورگرها خودشان می‌پرسند.
  //   عکسِ گم‌شده: مسیرِ خطای *Express* روی دامنه (چون `/picture/` به آن می‌رود)
  //   — همان‌جا بود که اجرای اول نشان داد صفحه‌ی ۴۰۴ِ Express به
  //   `/css/style.css` و `/js/…` اشاره می‌کند که روی دامنه به Next می‌روند و ۴۰۴ می‌شوند.
  addSeed("/favicon.ico", "درخواستِ خودکارِ مرورگر", "probe");
  addSeed("/picture/__nist-vajood-nadarad__.jpg", "عکسِ گم‌شده — مسیرِ خطای Express", "probe");
  addSeed("/api/health", "API");
  addSeed("/api/products?limit=1", "API");

  // عکسِ واقعیِ محصول از خودِ API خوانده می‌شود — نه نامِ حدسی.
  let samplePicture = null;
  try {
    const r = await hit(`${DOMAIN}/api/products?limit=5`);
    if (r.status === 200 && r.body) {
      const j = JSON.parse(r.body);
      const list = Array.isArray(j) ? j : j.products || [];
      const withImage = list.find((p) => p && p.image);
      if (withImage) {
        // `image` از API خودش با `/picture/…` می‌آید؛ یك‌بار پیشوند زدن و
        // encode کردنِ دوباره، آدرسِ `/picture/%2Fpicture%2F…` می‌سازد که
        // ۴۰۴ است — باگِ خودِ همین تمرین در اجرای اول.
        const img = String(withImage.image);
        // برای سنجشِ رفتارِ خطا روی همان مبدأ لازم می‌شود (خوابِ Express).
        samplePicture = img.startsWith("/picture/") ? img : `/picture/${img}`;
        // نامِ خام می‌ماند: خودِ fetch نویسه‌های غیرِ‌ASCII را درست کد می‌کند.
        // (encode کردنِ دوباره هم آدرس را می‌شکند، هم پروندهٔ عکس را گم می‌کند.)
        addSeed(img.startsWith("/picture/") ? img : `/picture/${img}`, "عکسِ محصول (از API)");
      }
      const anyProduct = list.find((p) => p && p.id);
      if (anyProduct) addSeed(`/product/${anyProduct.id}`, "صفحه‌ی محصول (از API)");
    }
  } catch (e) {
    notes.push(`فهرستِ محصولات از API خوانده نشد (${e.message}) — صفحه/عکسِ محصول سنجیده نشد`);
  }

  // ---------- خزش ----------
  const seen = new Set();
  const queue = [...seeds.entries()].map(([url, meta]) => ({ url, ...meta, depth: 0 }));
  const rows = [];

  while (queue.length && seen.size < MAX_URLS) {
    const item = queue.shift();
    const key = item.url;
    if (seen.has(key)) continue;
    seen.add(key);

    let result;
    try {
      result = await walk(DOMAIN + key);
    } catch (e) {
      rows.push({ ...item, error: e.message });
      continue;
    }
    const t = result.terminal;
    const finalStatus = t ? t.status : 0;
    const dead = [404, 410].includes(finalStatus) || !t;
    const kind = item.kind || "link";
    // داوری فقط روی همین سه نوع: مسیرِ کاربر (`link`)، فایلی که باید سرو
    // شود (`asset`)، و APIی که خودمان بذر کردیم (`api-probe`) — و نه ارجاعی که
    // از یک صفحه‌ی خطا آمده (`fromErrorPage`).
    const judged = ["link", "asset", "api-probe"].includes(kind) && !item.fromErrorPage;

    rows.push({
      ...item,
      kind,
      hops: result.hops,
      finalStatus,
      finalUrl: t ? new URL(t.url).pathname + new URL(t.url).search : "(حلقه)",
      upstream: result.hops[0].upstream,
      dead,
    });

    if (kind === "probe") probes.push(rows[rows.length - 1]);
    if (dead) {
      if (item.fromErrorPage) fromErrorRefs.push(rows[rows.length - 1]);
      else if (judged) broken.push(rows[rows.length - 1]);
      else notJudged.push(rows[rows.length - 1]);
    }

    // ارجاع‌های همان صفحه برای گامِ بعد
    if (t && t.body && /html|css|javascript/.test(t.type) && item.depth < 2) {
      for (const [link, kind] of extractRefs(t.url, t.body, t.type)) {
        if (seen.has(link) || seeds.has(link)) continue;
        queue.push({
          url: link,
          kind,
          why: "ارجاعِ صفحه",
          from: t.url,
          depth: item.depth + 1,
          fromErrorPage: [404, 410].includes(t.status),
        });
      }
    }
  }

  // ---------- لینک‌های دنیای قدیم ----------
  // مسیرهایی که فقط در `frontend/` به آن‌ها لینک شده: این‌ها «کشِ کهنه /
  // بوکمارک» هستند، نه لینکِ زنده — ولی روی دامنه‌ی واحد باید *لااقل* زنده
  // بمانند، وگرنه مشتریِ برگشته از گوگل صفحه‌ی مرده می‌بیند.
  const oldTargets = new Set();
  try {
    for (const f of fs.readdirSync(FRONTEND_DIR)) {
      if (!/\.(html|js)$/i.test(f)) continue;
      const text = fs.readFileSync(path.join(FRONTEND_DIR, f), "utf8");
      // `src` هم شمرده می‌شود: دارایی‌های `js/…` و `css/…` و `assets/…`
      // روی دامنه‌ی واحد به Next می‌روند (نه Express) — و همان جاست که
      // یک HTMLِ کش‌شده در مرورگرِ مشتری به ۴۰۴ می‌رسد.
      for (const m of text.matchAll(/(?:href|src|action|location\.href\s*=|location\.assign\()\s*[=:]?\s*['"`]([^'"`]+)['"`]/gi)) {
        const raw = m[1];
        if (/^(mailto:|tel:|https?:|#|\/api\/|\/picture\/)/i.test(raw)) continue;
        const clean = raw.split("#")[0];
        if (!clean) continue;
        const abs = clean.startsWith("/") ? clean : `/${clean}`;
        if (!seen.has(abs)) oldTargets.add(abs);
      }
    }
  } catch (e) {
    notes.push(`فایل‌های frontend/ خوانده نشد (${e.message}) — لینک‌های دنیای قدیم سنجیده نشد`);
  }
  for (const url of oldTargets) {
    if (seen.size >= MAX_URLS) break;
    seen.add(url);
    let result;
    try {
      result = await walk(DOMAIN + url);
    } catch (e) {
      stale.push({ url, why: "لینکِ frontend/", from: "frontend/", error: e.message, dead: true });
      continue;
    }
    const t = result.terminal;
    const finalStatus = t ? t.status : 0;
    const dead = [404, 410].includes(finalStatus) || !t;
    const row = {
      url,
      why: "لینکِ frontend/",
      from: "frontend/",
      kind: CANDIDATE(url) || "link",
      hops: result.hops,
      finalStatus,
      finalUrl: t ? new URL(t.url).pathname + new URL(t.url).search : "(حلقه)",
      upstream: result.hops[0].upstream,
      dead,
    };
    rows.push(row);
    if (dead) stale.push(row);
  }

  // ---------- گزارش ----------
  const redirects = rows.filter((r) => r.hops && r.hops.length > 1 && !r.dead);
  const ok200 = rows.filter((r) => !r.dead && r.hops && r.hops.length === 1 && r.finalStatus === 200);
  const servedByExpress = rows.filter((r) => r.upstream === "express");
  const servedByNext = rows.filter((r) => r.upstream === "next");

  if (VERBOSE) {
    say("\nهمه‌ی مسیرها:");
    for (const r of rows) {
      const chain = r.hops ? r.hops.map((h) => h.status).join(" → ") : "شکستِ شبکه";
      say(`  ${String(r.finalStatus).padEnd(4)} ${r.url.padEnd(34)} [${r.upstream}] ${chain}`);
    }
  }

  if (redirects.length) {
    say(`\nانتقال‌ها (${redirects.length}) — شکست نیستند:`);
    for (const r of redirects) {
      say(`  ${r.url} → ${r.finalUrl}  (${r.finalStatus})`);
    }
  }

  say(`\nمسیریابیِ مشاهده‌شده: Next ${servedByNext.length} مسیر · Express ${servedByExpress.length} مسیر`);
  const unexpected = servedByExpress.filter((r) => !/^\/(api|picture)\//.test(r.url));
  if (unexpected.length) {
    say("  ⚠ مسیرهایی که به Express رفتند و طبقِ پیکربندی مستند نباید می‌رفتند:");
    for (const r of unexpected) say(`    ${r.url} [${r.upstream}]`);
  }

  const chainOf = (r) =>
    r.hops
      ? r.hops.map((h) => `${new URL(h.url).pathname} ${h.status}`).join(" → ")
      : (r.error ?? "شکستِ شبکه");

  if (broken.length) {
    say(`\n✖ ${broken.length} شکستِ زنده‌ی داوری‌شده (لینک/دارایی/API که به ۴۰۴/۴۱۰ می‌رسد):`);
    for (const r of broken) {
      say(`  • [${r.kind}] ${r.url}  [${r.why}${r.from && r.from !== "seed" ? ` — از ${r.from}` : ""}]`);
      say(`      زنجیره: ${chainOf(r)}`);
    }
  }
  if (stale.length) {
    say(`\n! ${stale.length} مسیرِ دنیای قدیم که روی دامنه مرده است (کشِ کهنه/بوکمارک/گوگل):`);
    for (const r of stale) {
      say(`  • [${r.kind ?? "link"}] ${r.url}  → ${chainOf(r)}`);
    }
  }
  if (notJudged.length) {
    // عمداً فهرست نمی‌شوند: این‌ها خرابی نیستند. ولی شمرده و چاپ می‌شوند تا
    // پنهان نماند که «چه چیزی داوری نشد» — یک سنجشِ ناقص باید بگوید ناقص است.
    const byKind = notJudged.reduce((a, r) => ({ ...a, [r.kind]: (a[r.kind] || 0) + 1 }), {});
    say(
      `\n∅ ${notJudged.length} ارجاعِ داوری‌نشده (${Object.entries(byKind).map(([k, n]) => `${k}: ${n}`).join("، ")}) — ` +
        `اندپوینتِ POST و رشته‌ی کد، نه مسیرِ کاربر. چند نمونه:`,
    );
    for (const r of notJudged.slice(0, 5)) say(`  · [${r.kind}] ${r.url} → ${r.finalStatus}`);
  }

  // sitemapهای دامنه: هیچ‌کدام نباید نشانیِ ریدایرکت‌شده اعلام کند.
  if (probes.length) {
    say(`\n∎ ${probes.length} کاوشِ عمدی — نه لینک، ولی نتیجه‌شان باید معلوم باشد:`);
    for (const r of probes) {
      const ok = r.finalStatus === 200;
      say(`  ${ok ? "✔" : "·"} ${r.url} [${r.why}] → ${r.finalStatus}${ok ? " (سالم)" : " (طبقِ انتظار خراب است، ولی لینکی به آن اشاره نمی‌کند)"}`);
    }
  }
  if (fromErrorRefs.length) {
    say(`\n⌙ ${fromErrorRefs.length} ارجاع از *صفحه‌ی خطا* — خرابیِ لینک نیستند، ولی نشانه‌ی یک ایرادِ واقعی‌اند:`);
    for (const r of fromErrorRefs) {
      say(`  · [${r.kind}] ${r.url} → ${r.finalStatus}   (صفحه‌ی خطا: ${r.from})`);
    }
    say("    یعنی روی دامنه‌ی واحد، وقتی Express صفحه‌ی ۴۰۴ را سرو می‌کند (مثلاً عکسِ گم‌شده)،");
    say("    همان صفحه به دارایی‌هایی اشاره می‌کند که nginx به Next می‌دهد — بی‌استایل و با JSِ گم‌شده.");
  }

  // ---------- رفتارِ خطا روی دامنهٔ واحد ----------
  // چرا لازم بود: تا امروز هر سنجشِ خطا روی *دو مبدأ جدا* اجرا می‌شد (Express
  // روی ۳۰۰۰ و Next روی ۳۰۰۱). ولی مشتری فقط دامنهٔ واحد را می‌بیند، و روی آن
  // نه فقط چه کسی جواب می‌دهد تفاوت دارد، بلکه *خودِ کدِ خطا و بدنه‌اش* هم از
  // لبه می‌آید. سه چیز این‌جا سنجیده می‌شود و هر سه از پشتِ همان پروکسی:
  //   الف) مسیرِ ناموجود → کارتِ ۴۰۴ِ Next
  //   ب) خطای ۵۰۰ی که خودِ upstream برمی‌گرداند → کارتِ لبه (و زیرِ /api/ دست‌نخورده)
  //   ج) بالا‌نبودنِ یکی از دو سرویس → ۵۰۲ِ کارت‌دار برای صفحه، JSONِ @api_down
  //      برای /api، و سلامتِ سرویسِ دیگر (فوری، بدونِ انتظار).
  const edge = [];
  const edgeBad = [];
  const verdict = (label, ok, detail) => {
    edge.push({ label, ok, detail });
    if (!ok) edgeBad.push({ label, detail });
  };
  // یک واکشیِ ناموفق نباید کلِ تمرین را بکشد: شکستِ شبکه خودش یک یافته است.
  const probe = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      verdict(label, false, `واکشی شکست خورد: ${e.message}`);
      return null;
    }
  };
  const textOf = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // نشانه‌های متن از همان دو فایلی می‌آیند که پاسخ را می‌سازند، نه از حدس:
  // `app/not-found.tsx` و `public/error-500.html`.
  const NOT_FOUND_TEXT = "پیدا نشد (۴۰۴)";
  const CARD_TEXT = "خطای ۵۰۰";
  const BARE_EXPRESS_TEXT = "چنین صفحه‌ای وجود ندارد";

  say("\nرفتارِ خطا روی دامنهٔ واحد (پشتِ همان پروکسی):");

  // الف) مسیرِ ناموجود
  {
    const p = `/__rehearsal__/${Date.now().toString(36)}-nist`;
    const r = await hit(DOMAIN + p);
    const t = textOf(r.body);
    verdict(
      `مسیرِ ناموجود (${p}) کارتِ ۴۰۴ِ Next است، نه متنِ خامِ Express`,
      r.status === 404 &&
        r.upstream === "next" &&
        /html/.test(r.type) &&
        t.includes(NOT_FOUND_TEXT) &&
        !t.includes(BARE_EXPRESS_TEXT),
      `${r.status} از ${r.upstream} · نشانهٔ ۴۰۴: ${t.includes(NOT_FOUND_TEXT)} · متنِ خام: ${t.includes(BARE_EXPRESS_TEXT)}`,
    );
  }

  // ب) خطای عمدیِ سرور (۵۰۰ی که upstream برمی‌گرداند)
  {
    const r = await hit(DOMAIN + FAULT_PAGE);
    const t = textOf(r.body);
    verdict(
      "خطای ۵۰۰ِ Next به کارتِ استایل‌دارِ لبه می‌رسد (بدنهٔ upstream عوض می‌شود)",
      r.status === 500 && !t.includes(FAULT_MARK) && t.includes(CARD_TEXT) && (r.cache || "").includes("no-store"),
      `${r.status} · بدنهٔ upstream پاک شد: ${!t.includes(FAULT_MARK)} · کارت: ${t.includes(CARD_TEXT)} · cache: ${r.cache}`,
    );
    const a = await hit(DOMAIN + FAULT_API);
    const at = textOf(a.body);
    verdict(
      "همان ۵۰۰ زیرِ /api/ دست‌نخورده می‌ماند (قراردادِ JSON، نه کارتِ HTML)",
      a.status === 500 && at.includes(FAULT_MARK) && !at.includes(CARD_TEXT),
      `${a.status} · بدنهٔ upstream دیده شد: ${at.includes(FAULT_MARK)}`,
    );
  }

  // ج) یکی از دو سرویس بالا نیست — با پورتِ بسته، یعنی خطای واقعیِ شبکه.
  const DEAD = await deadOrigin();
  {
    OVERRIDE.next = DEAD;
    const t0 = Date.now();
    const r = await hit(DOMAIN + "/products");
    const ms = Date.now() - t0;
    const t = textOf(r.body);
    verdict(
      "Next خواب: صفحه کارتِ ۵۰۲ را می‌گیرد و فوری می‌آید",
      r.status === 502 && t.includes(CARD_TEXT) && ms <= EDGE.page.connect + 1500,
      `${r.status} در ${ms}ms (بودجهٔ اتصالِ مستند: ${EDGE.page.connect}ms) · کارت: ${t.includes(CARD_TEXT)}`,
    );
    const a = await hit(DOMAIN + "/api/health");
    verdict(
      "با خوابیدنِ Next، خودِ /api سالم می‌ماند (دو سرویس، یک دامنه)",
      a.status === 200,
      `${a.status} از ${a.upstream}`,
    );
    OVERRIDE.next = null;
  }
  {
    OVERRIDE.express = DEAD;
    const a = await hit(DOMAIN + "/api/health");
    verdict(
      "Express خواب: /api همان JSONِ @api_down را می‌دهد (کد و بدنه از مستند)",
      a.status === EDGE.api.downStatus &&
        String(a.type).includes(EDGE.api.downType) &&
        String(a.body).includes("سرویس موقتاً در دسترس نیست"),
      `${a.status} ${a.type} — «${String(a.body).slice(0, 58)}…»`,
    );
    const p = await hit(DOMAIN + "/products");
    verdict("با خوابیدنِ Express، صفحه‌های Next سالم می‌مانند", p.status === 200, `${p.status} از ${p.upstream}`);
    if (samplePicture) {
      const img = await hit(DOMAIN + samplePicture);
      verdict(
        `عکس (${samplePicture}) روی همین مبدأ کدِ ۵۰۲ می‌گیرد، نه عکسِ نیمه‌کاره`,
        img.status === 502,
        `${img.status} · نوعِ بدنه: ${img.type}`,
      );
    } else {
      notes.push("عکسِ نمونه‌ای پیدا نشد — سنجشِ عکس هنگامِ خوابِ Express انجام نشد");
    }
    OVERRIDE.express = null;
  }

  // د) درگاهِ باز و بی‌جواب — همان حالتی که مهلتِ *خواندن* را خرج می‌کند.
  if (SLOW) {
    const hung = await hungOrigin();
    try {
      OVERRIDE.next = hung.origin;
      const t0 = Date.now();
      const r = await probe(`درگاهِ باز و بی‌جواب (${EDGE.page.read}ms)`, () =>
        hit(DOMAIN + "/products", { timeoutMs: EDGE.page.read + 5000 }),
      );
      const ms = Date.now() - t0;
      if (r) {
        verdict(
          `درگاهِ باز و بی‌جواب: در ${EDGE.page.read}ms کارتِ ۵۰۴ می‌آید (نه ۶۰ ثانیهٔ پیش‌فرض)`,
          r.status === 504 &&
            textOf(r.body).includes(CARD_TEXT) &&
            ms >= EDGE.page.read - 500 &&
            ms <= EDGE.page.read + 3000,
          `${r.status} در ${ms}ms (بودجهٔ خواندنِ مستند: ${EDGE.page.read}ms)`,
        );
      }
    } finally {
      OVERRIDE.next = null;
      hung.close();
    }
  } else {
    notes.push(
      `حالتِ «درگاهِ باز و بی‌جواب» سنجیده نشد — با --slow اجرا کن (بودجهٔ خواندنِ مستند: ${EDGE.page.read}ms)`,
    );
  }

  for (const v of edge) say(`  ${v.ok ? "✔" : "✖"} ${v.label}\n      ${v.detail}`);

  try {
    const sm = await hit(`${DOMAIN}/sitemap.xml`);
    if (sm.status === 200) {
      const locs = [...sm.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1]);
      const legacy = locs.filter((loc) => legacyRedirect(new URL(loc).pathname, "") !== null);
      say(`\nsitemapِ دامنه: ${locs.length} نشانی، ${legacy.length} نشانیِ ریدایرکت‌شده`);
      for (const l of legacy.slice(0, 5)) say(`  • ${l}`);
      if (legacy.length) broken.push({ url: "/sitemap.xml", why: "sitemap", dead: true });
    } else {
      notes.push(`sitemapِ دامنه کدِ ${sm.status} داد`);
    }
  } catch (e) {
    notes.push(`sitemapِ دامنه خوانده نشد (${e.message})`);
  }

  say("\n" + "─".repeat(60));
  for (const n of notes) say(`• ${n}`);
  say(
    `جمع: ${rows.length} مسیر سنجیده شد — ${ok200.length} در یک گام ۲۰۰، ${redirects.length} انتقال، ` +
      `${broken.length} شکستِ داوری‌شده، ${stale.length} مسیرِ کهنه‌ی مرده، ${notJudged.length} ارجاعِ داوری‌نشده، ` +
      `${fromErrorRefs.length} ارجاع از صفحه‌ی خطا، ${edge.length} سنجشِ رفتارِ خطا (${edgeBad.length} ناموفق).`,
  );

  if (edgeBad.length) {
    say("\n✖ رفتارِ خطا روی دامنهٔ واحد طبقِ قراردادِ مستند نیست:");
    for (const v of edgeBad) say(`  • ${v.label}\n      ${v.detail}`);
  }

  if (broken.length || edgeBad.length) {
    say("✖ کاتاور با این وضعیت شکسته است.");
    exitCode = 1;
  } else if (stale.length) {
    say("⚠ هیچ لینکِ زنده‌ای نشکست؛ فقط مسیرهای دنیای قدیم مرده‌اند (که هدفِ بازنشستگی است).");
  } else {
    say("✔ هیچ مسیر یا لینکی نشکست.");
  }

  server.close();
  process.exitCode = exitCode;
}
