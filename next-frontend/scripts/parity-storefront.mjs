#!/usr/bin/env node
// ============================================================
// اجراکنندهٔ برابریِ فروشگاه — Express ↔ Next
// ============================================================
// مانیفستِ `src/lib/parityManifest.ts` را روی دو سرورِ محلی اجرا می‌کند و
// «واگرایی» ها را لو می‌دهد:
//
//   ۱. کدِ وضعیتِ هر صفحه در هر دو طرف
//   ۲. متادیتا (title/description/robots/canonical/og/twitter) — دوبه‌دو
//   ۳. پوششِ متن: چه کسری از جمله‌های HTMLِ Express در HTMLِ Next هست
//   ۴. probeهای قابلیت: مسیرهای قدیمیِ .html، دروازهٔ ورود، ۴۱۰، دارایی‌ها
//
// قاعده: هر اختلافی که در مانیفست اعلام شده باشد گزارشی است («پذیرفته» یا
// «بدهیِ باز»)؛ هر اختلافی که اعلام نشده باشد «واگراییِ تازه» است و کدِ خروج
// را ۱ می‌کند. پس این اسکریپت هم گزارشِ زنده است و هم گاردِ رگرسیون.
//
// اجرا (هر دو سرور باید بالا باشند):
//   node scripts/parity-storefront.mjs
//   node scripts/parity-storefront.mjs --report        # همیشه کدِ خروجِ ۰
//   node scripts/parity-storefront.mjs --show=8        # تا ۸ جملهٔ گم‌شدهٔ هر صفحه را هم چاپ کن
//   node scripts/parity-storefront.mjs --express=http://127.0.0.1:3100
//
// نکتهٔ راه‌اندازی: Express با `PORT=3000 node server.js` و Next با
// `npm run build && PORT=3000 npm run start -- -p 3001` بالا می‌آید (پورتِ
// دومی با آرگومانِ خطِ فرمان override می‌شود، پس Next همان ۳۰۰۰ را از
// environment می‌گیرد و ۳۰۰۱ را گوش می‌دهد؛ کانونیکال‌های تولیدشده هم
// به همان ریشهٔ env اشاره می‌کنند و قابلِ‌مقایسه می‌مانند).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  META_FIELDS,
  PARITY_PAGES,
  STORE_PROBES,
} from "../src/lib/parityManifest.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..");
const ORACLE_DIR = path.join(NEXT_DIR, "tests", "fixtures", "legacy-oracle");
const ORACLE_PROVENANCE = path.join(ORACLE_DIR, "provenance.json");
// سورسِ منجمدِ کلِ frontend/ — پشتوانهٔ دومِ بدنهٔ مرجع. برای صفحه‌هایی که
// اوراکلِ «سروشده» ندارند (۴۰۴، ۵۰۰، آفلاین، product-gone، product) همین
// فایل‌ها معیارِ متن و متادیتا هستند، چون سرورِ Express دیگر آن‌ها را ندارد.
const SRC_DIR = path.join(NEXT_DIR, "tests", "fixtures", "legacy-src");
const SRC_PROVENANCE = path.join(SRC_DIR, "provenance.json");

// ------------------------------------------------------------
// آرگومان‌ها
// ------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};
const EX = String(flag("express", "http://127.0.0.1:3000")).replace(/\/+$/, "");
const NX = String(flag("next", "http://127.0.0.1:3001")).replace(/\/+$/, "");
const REPORT_ONLY = flag("report", false) === true;
const NO_ORACLE = flag("no-oracle", false) === true;
// چند جملهٔ گم‌شدهٔ هر صفحه را در جدول چاپ کنیم (۰ = هیچ‌کدام).
const SHOW = Number(flag("show", 0)) || 0;

// ------------------------------------------------------------
// ابزارِ متن — همان روشی که برای اندازه‌گیریِ کفِ مانیفست به‌کار رفت:
// جمله‌های Express (تکه‌های بین نشانه‌های سجاوندی با ≥۲ کلمه) استخراج
// می‌شوند و به‌صورت جریانِ کلمه در HTMLِ Next جست‌وجو می‌شوند. تطبیقِ
// توالیِ کلمه‌ای، شکستنِ خطِ JSX و تگ‌ها را نادیده می‌گیرد.
// ------------------------------------------------------------
const WORD = /[\u0621-\u06FF\u200c]+/g;
const words = (s) => String(s).match(WORD) || [];

// نیم‌فاصله‌نرمال‌سازی — درسِ خودِ seoParity: «همه‌ی» و «همه‌ی» برای خواننده
// یکی‌اند و اگر واگرایی حساب شوند، گزارش پر از نویز می‌شود.
const ZWNJ = /\u200c/g;
const norm = (s) => String(s).replace(ZWNJ, "");

function strip(html) {
  return norm(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "\n");
}

function phrases(html) {
  const out = new Set();
  for (const raw of strip(html).split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    for (const chunk of line.split(/[.!؟…,،;؛:()«»"'’]+/)) {
      const ws = words(chunk);
      if (ws.length < 2 || ws.join("").length < 7) continue;
      out.add(ws.join(" "));
    }
  }
  return [...out];
}

function contains(stream, phrase) {
  const ph = Array.isArray(phrase) ? phrase : phrase.split(" ");
  outer: for (let i = 0; i + ph.length <= stream.length; i++) {
    for (let j = 0; j < ph.length; j++) if (stream[i + j] !== ph[j]) continue outer;
    return true;
  }
  return false;
}

function coverage(expressHtml, nextHtml) {
  const list = phrases(expressHtml);
  const stream = words(strip(nextHtml));
  const missing = list.filter((p) => !contains(stream, p.split(" ")));
  return {
    total: list.length,
    missing,
    ratio: list.length ? 1 - missing.length / list.length : 1,
  };
}

const grab = (html, re) => (html.match(re) || [])[1];
const metas = (html, name) =>
  [
    ...html.matchAll(
      new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`, "gi"),
    ),
  ].map((m) => m[1]);

/** متادیتای قابلِ‌مقایسه — همان هشت فیلدِ مانیفست. */
function head(html) {
  return {
    title: grab(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: metas(html, "description")[0],
    robots: metas(html, "robots").join("|") || null,
    canonical: grab(html, /<link rel="canonical" href="([^"]*)"/i),
    "og:title": metas(html, "og:title")[0],
    "og:description": metas(html, "og:description")[0],
    "og:type": metas(html, "og:type")[0],
    "twitter:card": metas(html, "twitter:card")[0],
  };
}

/**
 * اختلافِ یک فیلد. تنها نرمال‌سازیِ مجاز: اسلشِ انتهاییِ canonical — Express
 * برای صفحهٔ اصلی `/` می‌گذاشت و Next بدونِ اسلش؛ همان آدرس است.
 */
function metaDiff(field, a, b) {
  if (field === "canonical") {
    const norm = (v) => (typeof v === "string" ? v.replace(/(?<!:)\/+$/, "") : v);
    return JSON.stringify(norm(a)) !== JSON.stringify(norm(b));
  }
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

// ------------------------------------------------------------
// واکشی — ریدایرکت را دنبال نمی‌کنیم (خودِ ۳۰۷ یک واقعیتِ قابلِ‌سنجش است)
// ------------------------------------------------------------
async function get(url) {
  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const htmlish = [200, 404, 410].includes(res.status);
  return {
    status: res.status,
    location: res.headers.get("location"),
    body: htmlish ? await res.text() : "",
  };
}

// ------------------------------------------------------------
// اوراکلِ منجمد — متنِ Express از فایل، نه از سرور
// ------------------------------------------------------------
// چرا: با بازنشستگی، مسیرهای `.html` روی Express ریدایرکت می‌شوند و «HTMLِ
// سروشده‌ی Express» ناپدید می‌شود. اگر معیار همان سرور بماند، بعد از روشن‌شدن
// ریدایرکت بی‌صدا بدنه‌ی خالی مقایسه می‌شود و همه‌ی جمله‌های Express
// «گم‌شده» به نظر می‌رسند — یعنی نگهبان بدونِ اینکه کسی دستش بزند بی‌معنا
// می‌شود. پس متن از `tests/fixtures/legacy-oracle/` خوانده می‌شود
// (`scripts/freeze-legacy-oracle.mjs` آن را پر می‌کند) و چیزی که همچنان از
// سرورِ زنده سنجیده می‌شود **کدِ وضعیت** است — چون بازنشستگی خودش هم باید
// زیرِ نظر بماند.
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const oracleProvenance = fs.existsSync(ORACLE_PROVENANCE)
  ? JSON.parse(fs.readFileSync(ORACLE_PROVENANCE, "utf8"))
  : { entries: [] };

const srcProvenance = fs.existsSync(SRC_PROVENANCE)
  ? JSON.parse(fs.readFileSync(SRC_PROVENANCE, "utf8"))
  : { entries: [] };

/** کارنامهٔ فایلِ منجمد — با sha اگر منبعش ثبتش کرده باشد. */
function provenanceOf(entries, pick) {
  const entry = (entries || []).find(pick);
  return { entry, tampered: Boolean(entry && entry.sha256) };
}

/**
 * بدنهٔ *مرجعِ* یک صفحه — دو پشتوانه، به ترتیبِ اعتبار:
 *
 *   ۱) 🧊 `legacy-oracle/<id>.html` — همان HTMLی که سرورِ Express واقعاً سرو
 *      کرده بود (شاملِ تزریق‌های سرورساید: متای محصول، ItemListِ صفحهٔ اصلی).
 *   ۲) 📦 `legacy-src/<files.express[0]>` — خودِ فایلِ `frontend/` پیش از حذف.
 *      برای صفحه‌هایی که اوراکلِ سروشده ندارند و امروز روی Express ۴۰۴/۳۰۲
 *      می‌گیرند (۴۰۴، آفلاین، product-gone، product) این تنها معیارِ ممکن است؛
 *      بدونِ آن، بدنهٔ خالی با HTMLِ Next مقایسه می‌شد و «پوششِ متن ۰٪» می‌داد —
 *      یعنی نگهبان بدونِ اینکه کسی متن را عوض کند، بی‌معنا می‌شد.
 *
 * `null` یعنی این صفحه بدنهٔ مرجعی ندارد و باید از پاسخِ زنده سنجیده شود.
 * `--no-oracle` هر دو پشتوانه را خاموش می‌کند تا بتوان دو حالت را کنارِ هم
 * سنجید (A/B) — همان کاری که برای اثباتِ «انجماد رفتار را عوض نکرد» لازم است.
 */
function loadOracle(page) {
  if (NO_ORACLE || page.mode === "source") return null;
  const oracleFile = path.join(ORACLE_DIR, `${page.id}.html`);
  if (fs.existsSync(oracleFile)) {
    const html = fs.readFileSync(oracleFile, "utf8");
    const { entry, tampered } = provenanceOf(oracleProvenance.entries, (e) => e.id === page.id);
    return {
      html,
      file: oracleFile,
      kind: "oracle",
      entry,
      sha: sha256(html),
      tampered: tampered && entry.sha256 !== sha256(html),
    };
  }
  const rel = page.files.express[0];
  const srcFile = rel ? path.join(SRC_DIR, rel) : "";
  if (!srcFile || !fs.existsSync(srcFile)) {
    return { missing: true, file: oracleFile, triedSrc: srcFile };
  }
  const html = fs.readFileSync(srcFile, "utf8");
  const { entry, tampered } = provenanceOf(
    srcProvenance.entries,
    (e) => e.id === page.id || e.file === rel,
  );
  return {
    html,
    file: srcFile,
    kind: "src",
    entry,
    sha: sha256(html),
    tampered: tampered && entry.sha256 !== sha256(html),
  };
}

// ------------------------------------------------------------
// گزارش‌گیری
// ------------------------------------------------------------
// key = شناسهٔ قلمِ واگرایی روی همان صفحه (needle/field/probe)؛ برای این‌که
// «بدهی‌های باز» در گزارش تکرار نشوند (هر جملهٔ گم‌شده یک ردیف می‌سازد).
const findings = []; // { page, kind: "new" | "declared" | "stale", axis, text, key }
const add = (page, kind, axis, text, key = "") =>
  findings.push({ page, kind, axis, text, key });
const pct = (n) => `${(n * 100).toFixed(1)}%`;

async function checkOrigin(label, base) {
  try {
    const res = await fetch(base + "/", {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    return res.status > 0;
  } catch {
    console.error(
      `✖ سرورِ ${label} روی ${base} پاسخ نمی‌دهد. اول هر دو را بالا بیاور:\n` +
        `    Express:  cd backend && PORT=3000 node server.js\n` +
        `    Next:     cd next-frontend && npm run build && PORT=3000 npm run start -- -p 3001`,
    );
    process.exitCode = 2;
    return false;
  }
}

// ------------------------------------------------------------
// اجرا
// ------------------------------------------------------------
if (!(await checkOrigin("Express", EX))) process.exit(2);
if (!(await checkOrigin("Next", NX))) process.exit(2);

console.log(`برابریِ فروشگاه — Express ${EX}  ↔  Next ${NX}`);
const frozenPages = NO_ORACLE
  ? []
  : PARITY_PAGES.map((p) => ({ p, frozen: loadOracle(p) })).filter(
      ({ frozen }) => frozen && !frozen.missing,
    );
if (frozenPages.length) {
  const nOracle = frozenPages.filter(({ frozen }) => frozen.kind === "oracle").length;
  const nSrc = frozenPages.length - nOracle;
  console.log(
    `بدنهٔ مرجعِ منجمد: ${frozenPages.length} صفحه — 🧊 ${nOracle} از tests/fixtures/legacy-oracle/ ` +
      `(HTMLِ سروشده) و 📦 ${nSrc} از tests/fixtures/legacy-src/ (سورسِ frontend/). ` +
      `کدِ وضعیت همچنان زنده سنجیده می‌شود.`,
  );
}
console.log();

for (const page of PARITY_PAGES) {
  const head0 = `${page.id.padEnd(14)} «${page.label}»`;
  if (page.mode === "source") {
    console.log(`${head0}  ↷ فقط-سورس (${page.files.express[0]} ↔ ${page.files.next.join(", ")})`);
    if (page.statusReason) {
      add(page, "declared", "http", `کدِ وضعیت — ${page.statusReason.reason}`, "status");
    }
    continue;
  }

  const [live, nx] = await Promise.all([
    get(EX + page.express.url),
    get(NX + page.next.url),
  ]);
  const oracle = loadOracle(page);
  // کدِ وضعیت همیشه از سرورِ زنده می‌آید؛ بدنه (وقتی بدنهٔ مرجع هست) از فایل.
  const ex = oracle && !oracle.missing
    ? { ...live, body: oracle.html, frozen: true, frozenKind: oracle.kind }
    : live;
  // شمارندهٔ واگراییِ همین صفحه — اوراکلِ گم/دست‌کاری‌شده هم واگرایی است، پس
  // باید پیش از این دو بررسی زنده باشد (وگرنه مسیرِ «اوراکلِ خراب» با
  // ReferenceError می‌میرد و گزارشِ درست هیچ‌وقت چاپ نمی‌شود).
  let pageNew = 0;
  if (oracle && oracle.missing) {
    add(
      page,
      "new",
      "text",
      `بدنهٔ مرجعِ منجمدِ این صفحه نیست — پس از بازنشستگی متن و متادیتای Express از کجا سنجیده شود؟ ` +
        `یا اوراکل بساز (node scripts/freeze-legacy-oracle.mjs) یا فایلِ «${page.files.express[0]}» را در tests/fixtures/legacy-src/ داشته باش`,
    );
    pageNew++;
  }
  if (oracle && oracle.tampered) {
    add(
      page,
      "new",
      "text",
      `بدنهٔ منجمد (${oracle.kind === "oracle" ? "legacy-oracle" : "legacy-src"}) دست‌کاری شده (sha با کارنامه نمی‌خواند) — یا عمدی دوباره منجمزش کن یا دست نزن`,
    );
    pageNew++;
  }

  const bits = [];
  let shownMissing = [];

  // ۱) کدِ وضعیت
  if (ex.status !== page.express.status) {
    add(page, "new", "http", `وضعیتِ Express ${ex.status} است، مانیفست ${page.express.status} می‌گوید`);
    pageNew++;
  }
  if (nx.status !== page.next.status) {
    add(page, "new", "http", `وضعیتِ Next ${nx.status} است، مانیفست ${page.next.status} می‌گوید`);
    pageNew++;
  }
  const statusDiffers = ex.status !== nx.status;
  if (statusDiffers) {
    const note = page.statusReason;
    if (!note) {
      add(page, "new", "http", `کدِ وضعیت دو طرف فرق دارد (${ex.status} ↔ ${nx.status}) و در مانیفست اعلام نشده`);
      pageNew++;
    } else {
      add(
        page,
        "declared",
        "http",
        `کدِ وضعیت ${ex.status} ↔ ${nx.status} — ${note.state === "open" ? "بدهیِ باز" : "پذیرفته"}: ${note.reason}`,
        "status",
      );
    }
  }
  bits.push(
    `${ex.status}/${nx.status}${ex.frozen ? (ex.frozenKind === "src" ? " 📦" : " 🧊") : ""}`,
  );

  if (page.mode === "redirect") {
    console.log(`${head0}  ${bits.join(" ")}  (ریدایرکت — فقط کدِ وضعیت)`);
    continue;
  }

  // ۲) متادیتا
  if (ex.body && nx.body) {
    const a = head(ex.body);
    const b = head(nx.body);
    const seen = new Set();
    for (const field of META_FIELDS) {
      if (!metaDiff(field, a[field], b[field])) continue;
      seen.add(field);
      const rule = page.meta.find((m) => m.field === field);
      if (rule) {
        add(
          page,
          "declared",
          "metadata",
          `${field} — ${rule.state === "open" ? "بدهیِ باز" : "پذیرفته"}: ${rule.reason}`,
          `meta:${field}`,
        );
      } else {
        add(page, "new", "metadata", `${field} فرق دارد → Express: ${JSON.stringify(a[field])} / Next: ${JSON.stringify(b[field])}`);
        pageNew++;
      }
    }
    for (const rule of page.meta) {
      if (!seen.has(rule.field)) {
        add(page, "stale", "metadata", `اعلامِ کهنه: ${rule.field} حالا یکسان است — این ردیف را از مانیفست بردار`);
      }
    }
    bits.push(`متادیتا ${seen.size ? `${seen.size} فیلدِ متفاوت` : "یکسان"}`);

    // ۳) پوششِ متن
    const cov = coverage(ex.body, nx.body);
    bits.push(`متن ${pct(cov.ratio)} (کف ${pct(page.textFloor)})`);
    if (cov.ratio < page.textFloor) {
      add(page, "new", "text", `پوششِ متن ${pct(cov.ratio)} از کفِ ${pct(page.textFloor)} پایین‌تر است`);
      pageNew++;
    }
    const used = new Set();
    for (const phrase of cov.missing) {
      const rule = page.misses.find((r) => phrase.includes(norm(r.needle)));
      if (rule) {
        used.add(rule.needle);
        add(
          page,
          "declared",
          "text",
          `«${phrase}» — ${rule.state === "open" ? "بدهیِ باز" : "پذیرفته"}`,
          rule.needle,
        );
      } else {
        add(page, "new", "text", `جمله‌ی گم‌شده و اعلام‌نشده: «${phrase}»`);
        pageNew++;
      }
    }
    for (const rule of page.misses) {
      if (used.has(rule.needle)) continue;
      // needleِ «دادهٔ زمانِ اجرا» هرگز در بدنهٔ منجمد پیدا نمی‌شود: آن بدنه یا
      // اوراکلِ HTMLِ سروشده است (که پشتش دیتابیسِ لحظه‌ی انجماد بوده) یا
      // قالبِ خالیِ frontend/ (که داده هیچ‌وقت داخلش نبوده). پس «کهنه» خواندنش
      // درست نیست — فقط می‌شود گفت این یکی زنده قابلِ سنجش نیست و باید با
      // گاردهای منبع (seoParity/apiContract) قفل شده باشد.
      if (rule.source === "data") continue;
      add(page, "stale", "text", `اعلامِ کهنه: needleِ «${rule.needle}» دیگر هیچ جمله‌ای را نمی‌پوشاند — از مانیفست بردار`);
    }
    if (cov.missing.length && pageNew === 0) {
      bits.push(`— ${cov.missing.length} جملهٔ اعلام‌شده گم است`);
    }
    shownMissing = SHOW > 0 ? cov.missing.slice(0, SHOW) : [];
  }

  console.log(`${head0}  ${bits.join("  ")}${pageNew ? "  ✖" : "  ✔"}`);
  for (const phrase of shownMissing) console.log(`      - ${phrase}`);
}

// ------------------------------------------------------------
// probeهای سطحِ فروشگاه
// ------------------------------------------------------------
console.log("\nprobeهای سطحِ فروشگاه:");
for (const probe of STORE_PROBES) {
  const [ex, nx] = await Promise.all([get(EX + probe.url), get(NX + probe.url)]);
  const ok = ex.status === probe.express && nx.status === probe.next;
  if (!ok) {
    add({ id: probe.id, label: probe.url }, "new", probe.axis, `probe: انتظار ${probe.express}/${probe.next} — دیده‌شده ${ex.status}/${nx.status}`);    } else {
      add(
        { id: probe.id, label: probe.url },
        "declared",
        probe.axis,
        `${probe.url} ${ex.status}/${nx.status} — ${probe.state === "open" ? "بدهیِ باز" : "پذیرفته"}: ${probe.reason}`,
        probe.id,
      );
    }
  console.log(`  ${ok ? "✔" : "✖"} ${probe.url.padEnd(22)} Express ${ex.status} / Next ${nx.status}`);
}

// probeهای هر صفحه
console.log("\nprobeهای صفحه‌ها:");
for (const page of PARITY_PAGES) {
  for (const probe of page.probes) {
    const [ex, nx] = await Promise.all([get(EX + probe.url), get(NX + probe.url)]);
    const ok = ex.status === probe.express && nx.status === probe.next;
    if (!ok) {
      add(page, "new", probe.axis, `probeِ ${probe.id}: انتظار ${probe.express}/${probe.next} — دیده‌شده ${ex.status}/${nx.status}`);
    } else {
      add(
        page,
        "declared",
        probe.axis,
        `${probe.id}: ${probe.url} ${ex.status}/${nx.status} — ${probe.state === "open" ? "بدهیِ باز" : "پذیرفته"}`,
        probe.id,
      );
    }
    console.log(`  ${ok ? "✔" : "✖"} ${probe.id.padEnd(26)} ${probe.url.padEnd(26)} Express ${ex.status} / Next ${nx.status}`);
  }
}

// ------------------------------------------------------------
// جمع‌بندی
// ------------------------------------------------------------
const news = findings.filter((f) => f.kind === "new");
const declared = findings.filter((f) => f.kind === "declared");
const stale = findings.filter((f) => f.kind === "stale");
const opens = declared.filter((f) => f.text.includes("بدهیِ باز"));

console.log("\n──────── جمع‌بندی ────────");
console.log(`صفحه‌ها: ${PARITY_PAGES.length} (${PARITY_PAGES.filter((p) => p.mode === "source").length} فقط-سورس، ${PARITY_PAGES.filter((p) => p.mode === "redirect").length} ریدایرکت)`);
console.log(`اختلافِ اعلام‌شده: ${declared.length} — از آن ${opens.length} بدهیِ باز`);
console.log(`اعلامِ کهنه (قابلِ حذف از مانیفست): ${stale.length}`);
console.log(`واگراییِ تازه: ${news.length}`);

// بدهی‌های باز — فهرستِ تصمیم‌نیاز، تک‌به‌تک و بدونِ تکرار (برخلافِ جدول که
// هر جملهٔ گم‌شده یک ردیف است).
const openDebts = [];
const seenDebt = new Set();
for (const f of declared) {
  if (!f.text.includes("بدهیِ باز")) continue;
  const dedupe = `${f.page.id}::${f.key}`;
  if (seenDebt.has(dedupe)) continue;
  seenDebt.add(dedupe);
  openDebts.push(f);
}
if (openDebts.length) {
  console.log(`\n⚠ بدهی‌های باز (${openDebts.length} قلم — تصمیم یا اصلاح لازم دارند):`);
  for (const f of openDebts) {
    console.log(`  • [${f.axis}] ${f.page.id} (${f.page.label}): ${f.text}`);
  }
}

if (news.length) {
  console.log("\n✖ واگرایی‌های تازه:");
  for (const f of news) console.log(`  • [${f.axis}] ${f.page.id} (${f.page.label}): ${f.text}`);
}
if (stale.length) {
  console.log("\n↷ اعلام‌های کهنه:");
  for (const f of stale) console.log(`  • [${f.axis}] ${f.page.id}: ${f.text}`);
}

if (news.length && !REPORT_ONLY) {
  console.log("\nبرای دیدنِ همه‌ی اختلاف‌ها (بدونِ شکست) دوباره با --report اجرا کن.");
  process.exit(1);
}
if (!news.length) console.log("\n✔ واگراییِ اعلام‌نشده‌ای پیدا نشد.");
