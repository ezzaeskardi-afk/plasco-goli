// ============================================================
// آزمونِ «هر ارجاعِ داخلی به جایی می‌رسد»
// ============================================================
// چرا این آزمون لازم است: تا وقتی پنج rewrite در `next.config.ts` محتوای
// فرانت‌اندِ Express را سرو می‌کردند، یک ارجاعِ غلط **بی‌صدا** کار می‌کرد. اگر
// جایی `/terms.html` می‌ماند، نه typecheck می‌فهمید، نه lint، نه build — فقط
// مشتری می‌دید که لینکِ قوانین ۴۰۴ می‌دهد. حالا آن پروکسی‌ها حذف شده‌اند، پس
// می‌شود و *باید* سنجید: هر آدرسِ داخلی که خودِ اپ معرفی می‌کند باید به یکی از
// دو چیزی برسد که Next واقعاً سرو می‌کند:
//
//   ۱) فایلی در `public/` (دقیقاً همان‌جایی که دایرکتوریِ مبدأ می‌شود)
//   ۲) مسیری در درختِ App Router (`src/app/**/page.tsx` و robots/sitemap)
//
// چرا به‌جای اجرای واقعیِ سرور: همین دو مبدأ تمامِ پاسخ‌های داخلی‌اند و یک تستِ
// HTTP یعنی بالا آوردنِ یک Nextِ دیگر در CI — کند، شکننده، و همان دو نکته را
// می‌سنجد.
//
// یک تصمیمِ پیاده‌سازی که ارزشِ اندازه‌گیری داشت: نام‌ها با فهرستِ عیناً
// خوانده‌شده از دیسک مقایسه می‌شوند، **نه** با `fs.existsSync`. چون این پروژه
// روی ویندوز توسعه داده می‌شود و فایل‌سیستمِ ویندوز به بزرگی/کوچکیِ حرف
// بی‌توجه است: `existsSync("…/public/assets/Favicon.svg")` همان‌جا `true`
// می‌داد در حالی که سروِرِ واقعی همان مسیر را ۴۰۴ می‌دهد (سنجیده شد — Next
// برای فایل‌های `public` حساس به بزرگیِ حرف است، روی ویندوز هم). یعنی آزمونِ
// مبتنی بر `existsSync` روی ماشینِ دولوپر سبز می‌شد و روی لینوکسِ سرور قرمز —
// دقیقاً برعکسِ چیزی که لازم است.
//
// چه چیزهایی اسکن می‌شوند: هر رشتهٔ داخلی در کد (`src/**`، بدونِ فایل‌های آزمون)
// و هر ارجاعی در دارایی‌های ثابت (`manifest.webmanifest`، `sw.js`،
// `offline.html`، `security.txt`). یعنی همان چیزهایی که یک فرانت‌اندِ خودکفا
// به آن‌ها وابسته است و اگر یکی‌شان جا بماند، سکوتِ پروکسی پنهانش می‌کرد:
// میان‌بُرهای مانیفست، آیکون‌های layout، پیش‌کشِ سرویس‌ورکر، لینک‌های صفحه‌ی
// آفلاین، و ناوبری.
//
// سه قاعده که آزمون را از غلطِ مثبت نگه می‌دارند:
//
//   • توضیح‌ها (کامنت‌ها) قبل از استخراج حذف می‌شوند. وگرنه جمله‌ای مثلِ «متنِ
//     این صفحه از `frontend/terms.html` برداشته شده» خودش یک ارجاعِ جعلی
//     می‌ساخت. حذفِ کامنت با یک پویشگرِ کوچک انجام می‌شود که حالِ رشته‌ها را
//     می‌فهمد، نه با regexِ خام: `https://` و `"//evil.example"` نباید نصفه
//     بریده شوند.
//   • آرگومان‌های `startsWith/endsWith/includes` ارجاعِ ناوبری نیستند، مقایسهٔ
//     پیشوندی‌اند (`pathname.startsWith("/product")` با هیچ مسیری برابر نیست و
//     نباید باشد). اینها جدا جمع می‌شوند و فقط «پیشوندِ یک مسیرِ موجود» بودنشان
//     خواسته می‌شود.
//   • رشته‌های بیرونی (`https://wa.me/…`، `tel:…`، `//host`) و رشته‌های
//     غیرمسیری (فارسی، فاصله‌دار، الگوی middleware مثلِ `/admin/:path*`) کلاً
//     کنار گذاشته می‌شوند — charset به‌جای حدس‌زدن.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ------------------------------------------------------------
// مسیرهای پایه
// ------------------------------------------------------------
// از روی همین فایل حساب می‌شوند، نه از روی cwd: آزمون باید از هر جایی که
// اجرا شود یک نتیجه بدهد.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
const PUBLIC_DIR = path.join(FRONTEND_DIR, "public");
const SRC_DIR = path.join(FRONTEND_DIR, "src");
const APP_DIR = path.join(SRC_DIR, "app");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

/** مسیرِ نسبی با اسلش، مستقل از ویندوز/لینوکس */
function rel(base: string, abs: string): string {
  return path.relative(base, abs).split(path.sep).join("/");
}

// ------------------------------------------------------------
// حذفِ توضیح‌ها، بی‌آنکه رشته‌ها خراب شوند
// ------------------------------------------------------------
// یک پویشگرِ نویسه‌به‌نویسه لازم است چون regexِ ساده دو جا می‌شکند: `https://`
// (که `//` دارد) و رشته‌ای مثلِ `"//evil.example"` که خودش `//` دارد. خطای
// اول باعث می‌شود آدرس‌های بیرونی نصفه بریده شوند و به‌شکلِ ارجاعِ داخلی دربیایند.
function stripJsComments(src: string): string {
  let out = "";
  let quote: string | null = null;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const stripHtmlComments = (src: string) => src.replace(/<!--[\s\S]*?-->/g, "");
const stripCssComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "");
// RFC 9116: خطِ آغازشده با # توضیح است.
const stripTxtComments = (src: string) => src.replace(/^[ \t]*#.*$/gm, "");

// ------------------------------------------------------------
// استخراجِ رشته‌ها و نرمال‌سازی
// ------------------------------------------------------------
const LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

function literals(src: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  LITERAL.lastIndex = 0;
  while ((m = LITERAL.exec(src))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/**
 * نویسه‌های مجازِ یک مسیر. عمداً باریک است: پرانتز و فاصله و خطِ عمودی و حرفِ
 * فارسی یعنی این رشته یک *الگو* یا یک جمله است، نه آدرسی که مرورگر باز کند.
 * `:` هم نیست، چون هر آدرسِ دارای scheme (`https:`، `tel:`) بیرونی است.
 */
// `[` و `]` هم مجازند: مسیرِ داینامیکِ صریحِ Next (`/product/[id]`) هم ارجاعی
// واقعی است، مثلِ آرگومانِ `revalidatePath`.
const PATH_CHARS = /^[/*A-Za-z0-9\-._~%&=@+,[\]]*$/;

type Ref = {
  /** برای پیامِ خطا: از کدام فایل آمده */
  file: string;
  /** همان‌طور که در کد نوشته شده */
  raw: string;
  /** فقط مسیر: کوئری و لنگر جدا شده‌اند */
  path: string;
  /** بخشِ پس از # (بدونِ #) */
  hash: string;
  /**
   * exact: خودش باید مسیر یا فایلِ موجود باشد (ناوبری، آرگومانِ revalidate،
   * مانیفست، سرویس‌ورکر…).
   * prefix: کافی است پیشوندِ یک مسیرِ موجود باشد — این‌ها مقایسه هستند نه
   * ناوبری (`pathname.startsWith("/product")`).
   */
  mode: "exact" | "prefix";
};

function normalize(file: string, raw: string, mode: Ref["mode"] = "exact"): Ref | null {
  let s = raw.trim();
  if (!s.startsWith("/")) return null; // نسبی یا بیرونی
  if (s.startsWith("//")) return null; // پروتکل‌نسبی = دامنهٔ غریبه
  // بخشِ پویا (`/product/${p.id}`) → نویسهٔ عام. اینها ارجاعِ واقعی‌اند و باید
  // با مسیرِ داینامیکِ `[id]` تطبیق داده شوند.
  s = s.replace(/\$\{[^}]*\}/g, "*");
  const hashAt = s.indexOf("#");
  const hash = hashAt === -1 ? "" : s.slice(hashAt + 1);
  const pathOnly = s.split("#")[0].split("?")[0];
  if (!PATH_CHARS.test(pathOnly)) return null;
  return { file, raw, path: pathOnly, hash, mode };
}

// ------------------------------------------------------------
// هدف‌هایی که Next واقعاً سرو می‌کند
// ------------------------------------------------------------
// نام‌ها عیناً از دیسک (حساس به بزرگی/کوچکیِ حرف) — دلیلش در سرآمدِ فایل.
const publicFiles = new Set(walk(PUBLIC_DIR).map((f) => "/" + rel(PUBLIC_DIR, f)));
const publicDirs = new Set<string>();
for (const f of publicFiles) {
  const parts = f.split("/").filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    publicDirs.add("/" + parts.slice(0, i).join("/"));
  }
}

/** مسیرهای App Router، بخش‌به‌بخش. گروه‌های `(name)` در آدرس نمی‌آیند. */
const ROUTES: string[][] = [];
for (const file of walk(APP_DIR)) {
  const r = rel(APP_DIR, file);
  if (r === "robots.ts" || r === "sitemap.ts") {
    ROUTES.push([r === "robots.ts" ? "robots.txt" : "sitemap.xml"]);
    continue;
  }
  if (!r.endsWith("page.tsx")) continue;
  const dir = r.slice(0, -"/page.tsx".length);
  ROUTES.push(dir.split("/").filter((s) => s && !/^\(.*\)$/.test(s)));
}

function matchSegs(route: string[], segs: string[]): boolean {
  let i = 0;
  for (; i < segs.length; i++) {
    const r = route[i];
    if (r === undefined) return false;
    if (r.startsWith("[[...") || r.startsWith("[...")) return true; // catch-all
    // نویسهٔ عام از خودِ ارجاع (`/product/${p.id}` → `/product/*`) یا مسیرِ
    // داینامیکِ صریحِ ارجاع (`/product/[id]`) با هر بخشی می‌خواند.
    const refIsWildcard = segs[i] === "*" || (segs[i].startsWith("[") && segs[i].endsWith("]"));
    const routeIsWildcard = r.startsWith("[") && r.endsWith("]");
    if (!refIsWildcard && !routeIsWildcard && r !== segs[i]) return false;
  }
  if (i === route.length) return true;
  return route[i].startsWith("[[..."); // catch-allِ اختیاری می‌تواند خالی بماند
}

function routeMatches(segs: string[]): boolean {
  return ROUTES.some((route) => matchSegs(route, segs));
}

/** پیشوندِ یک مسیرِ موجود است؟ (برای `startsWith("/product")`) */
function isPrefixOfRoute(segs: string[]): boolean {
  return ROUTES.some((route) => {
    if (segs.length > route.length) return false;
    return segs.every((s, i) => {
      const r = route[i];
      if (r === undefined) return false;
      return s === "*" || (r.startsWith("[") && r.endsWith("]")) || r === s;
    });
  });
}

function publicHit(p: string, mode: "exact" | "prefix"): boolean {
  const clean = p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;
  if (publicFiles.has(clean) || publicDirs.has(clean)) return true;
  if (mode === "exact") {
    if (p !== "/" && p.endsWith("/")) return publicDirs.has(clean);
    // `/product/*` و مانند آن: تا نویسهٔ عام باید فایلی موجود باشد.
    if (clean.includes("*")) {
      const prefix = clean.slice(0, clean.indexOf("*"));
      return [...publicFiles].some((f) => f.startsWith(prefix));
    }
    return false;
  }
  const needle = clean.endsWith("/") ? clean : clean + "/";
  return [...publicFiles, ...publicDirs].some((f) => f.startsWith(needle));
}

/**
 * نام‌های دنیای Express که در Next *هیچ‌وقت* نباید به‌عنوان ارجاع بمانند.
 * حتی اگر روزی کسی یکی از این فایل‌ها را در `public` کپی کند باز هم قرمز
 * می‌شود: آن‌وقت دو نسخه از یک صفحه داریم و همان چیزی که این آزمون برای
 * جلوگیری از آن نوشته شده — ادامهٔ پنهانیِ `frontend/` — برمی‌گردد.
 *
 * `admin.html` هم همین‌جا می‌ماند: خودِ فایل حالا حذف شده و پنل در Next است،
 * پس هر ارجاعی به آن یعنی یک لینکِ ۴۰۴.
 */
const EXPRESS_ERA = new Set([
  "index.html",
  "products.html",
  "product.html",
  "product-gone.html",
  "cart.html",
  "login.html",
  "checkout.html",
  "order-success.html",
  "account.html",
  "admin.html",
  "wholesale.html",
  "terms.html",
  "404.html",
  "500.html",
  "manifest.json",
]);

type Verdict = { ok: true } | { ok: false; why: string };

function resolveRef(ref: Ref, mode: "exact" | "prefix"): Verdict {
  const p = ref.path;
  const base = p.split("/").pop() ?? "";
  if (EXPRESS_ERA.has(base)) {
    return {
      ok: false,
      why: "نامِ دنیای Express است؛ روی مبدأِ Next این مسیر وجود ندارد و باید به معادلِ Next عوض شود",
    };
  }
  // تنها دو rewriteِ باقی‌مانده — هر دو دادهٔ مغازه‌اند نه فایلِ ثابت: خودِ API
  // و عکسِ محصول‌ها.
  if (p === "/api" || p.startsWith("/api/")) return { ok: true };
  if (p === "/picture" || p.startsWith("/picture/")) return { ok: true };
  if (publicHit(p, mode)) return { ok: true };

  const segs = p.split("/").filter(Boolean);
  if (routeMatches(segs)) return { ok: true };
  if (mode === "prefix" && isPrefixOfRoute(segs)) return { ok: true };

  if (p.endsWith(".html")) {
    return {
      ok: false,
      why: "پسوندِ .html روی مبدأِ Next فقط وقتی کار می‌کند که فایلش در public باشد",
    };
  }
  return { ok: false, why: "نه مسیری در app/ دارد و نه فایلی در public" };
}

function explain(ref: Ref, verdict: { ok: false; why: string }): string {
  return `${ref.file} → ${ref.raw}  (${verdict.why})`;
}

// ------------------------------------------------------------
// اسکنِ کد
// ------------------------------------------------------------
function scanSrc(): Ref[] {
  const refs: Ref[] = [];
  const files = walk(SRC_DIR).filter(
    (f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
  );
  for (const file of files) {
    const relPath = rel(FRONTEND_DIR, file);
    const raw = fs.readFileSync(file, "utf8");
    const clean = file.endsWith(".css")
      ? stripCssComments(raw)
      : stripJsComments(raw);

    // مقایسه‌های پیشوندی جدا می‌شوند: `pathname.startsWith("/product")` یک
    // ارجاعِ ناوبری نیست، پس نباید بخواهد با یک مسیر برابر باشد.
    const prefixArgs: string[] = [];
    const body = clean.replace(
      /\b(?:startsWith|endsWith|includes)\(\s*(["'`])([^"'`\n]*)\1\s*\)/g,
      (_m, _q: string, value: string) => {
        prefixArgs.push(value);
        return "";
      },
    );

    for (const lit of literals(body)) {
      const ref = normalize(relPath, lit);
      if (ref) refs.push(ref);
    }
    for (const lit of prefixArgs) {
      if (!lit.startsWith("/") || lit.startsWith("//")) continue;
      const ref = normalize(relPath, lit, "prefix");
      if (ref) refs.push(ref);
    }
  }
  return refs;
}

// ------------------------------------------------------------
// اسکنِ دارایی‌های ثابتِ public
// ------------------------------------------------------------
type PublicScan = {
  refs: Ref[];
  manifest: Ref[];
  serviceWorker: Ref[];
  offline: Ref[];
  securityTxt: Ref[];
};

function scanPublic(): PublicScan {
  const refs: Ref[] = [];
  const collect = (file: string, candidates: string[], mode?: "url") => {
    const out: Ref[] = [];
    for (const c of candidates) {
      if (mode === "url") {
        let parsed: URL;
        try {
          parsed = new URL(c);
        } catch {
          continue;
        }
        out.push({
          file,
          raw: c,
          path: parsed.pathname,
          hash: parsed.hash.replace("#", ""),
          mode: "exact",
        });
      } else {
        const ref = normalize(file, c);
        if (ref) out.push(ref);
      }
    }
    refs.push(...out);
    return out;
  };

  // ۱) مانیفستِ PWA — میان‌بُرها و آیکون‌ها همان‌هایی‌اند که کاربر لمس می‌کند.
  const manifestFile = "public/manifest.webmanifest";
  const manifest = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, "manifest.webmanifest"), "utf8"),
  );
  const manifestCandidates: string[] = [
    manifest.start_url,
    ...(manifest.icons ?? []).map((i: { src: string }) => i.src),
    ...(manifest.shortcuts ?? []).flatMap(
      (s: { url: string; icons?: { src: string }[] }) => [
        s.url,
        ...(s.icons ?? []).map((i) => i.src),
      ],
    ),
  ];
  const manifestRefs = collect(manifestFile, manifestCandidates);

  // ۲) پیش‌کشِ سرویس‌ورکر — اگر یکی از این‌ها نباشد، نصبِ کش نیمه‌کاره است و
  //    صفحه‌ی آفلاین (تنها چیزی که قطعیِ اینترنت را مدیریت می‌کند) غایب می‌ماند.
  const swFile = "public/sw.js";
  const swRefs = collect(
    swFile,
    literals(stripJsComments(fs.readFileSync(path.join(PUBLIC_DIR, "sw.js"), "utf8"))),
  );

  // ۳) لینک‌های صفحه‌ی آفلاین — این صفحه به هیچ CSS و فونتی وابسته نیست، پس
  //    همین چند لینک تمامِ دارایی‌اش است.
  const offlineFile = "public/offline.html";
  const offlineRefs = collect(
    offlineFile,
    literals(
      stripHtmlComments(fs.readFileSync(path.join(PUBLIC_DIR, "offline.html"), "utf8")),
    ),
  );

  // ۴) security.txt — «هم‌مبدأ» را از خودِ فایل می‌خوانیم: میدانِ Canonical
  //    مرجعِ دامنه است (RFC 9116)، پس Contact و Policy باید روی همان دامنه به
  //    مسیرِ موجود اشاره کنند.
  const txtFile = "public/.well-known/security.txt";
  const txt = stripTxtComments(
    fs.readFileSync(path.join(PUBLIC_DIR, ".well-known/security.txt"), "utf8"),
  );
  const fields = [...txt.matchAll(/^([A-Za-z-]+):[ \t]*(\S+)[ \t]*$/gm)].map((m) => ({
    name: m[1].toLowerCase(),
    value: m[2],
  }));
  const canonical = fields.find((f) => f.name === "canonical")?.value ?? "";
  const origin = canonical ? new URL(canonical).origin : "";
  const securityRefs = collect(
    txtFile,
    fields
      .map((f) => f.value)
      .filter((v) => /^https?:\/\//i.test(v))
      .filter((v) => new URL(v).origin === origin),
    "url",
  );

  return {
    refs,
    manifest: manifestRefs,
    serviceWorker: swRefs,
    offline: offlineRefs,
    securityTxt: securityRefs,
  };
}

function unresolved(refs: Ref[]): string[] {
  return refs
    .map((ref) => {
      const verdict = resolveRef(ref, ref.mode);
      return verdict.ok ? null : explain(ref, verdict);
    })
    .filter((m): m is string => m !== null);
}

describe("پیوندهای داخلی و مسیرهای ثابتِ Next", () => {
  it("هر ارجاعِ داخلی در کد به مسیر یا فایلِ واقعی می‌رسد", () => {
    const refs = scanSrc();

    // نگهبانِ خودِ آزمون: اگر استخراج خراب شود، فهرستِ خالی هم «سبز» می‌شود.
    // این چند مورد عمداً انتخاب شده‌اند چون هر کدام از یک جنسِ متفاوت‌اند:
    // ناوبریِ هدر، ناوبریِ پنل، آیکونِ layout، و مانیفست.
    const paths = new Set(refs.map((r) => r.path));
    expect(paths.size).toBeGreaterThan(25);
    for (const expected of [
      "/cart",
      "/products",
      "/admin/reports",
      "/admin/wholesale",
      "/assets/favicon.svg",
      "/manifest.webmanifest",
    ]) {
      expect([...paths].includes(expected), `ارجاعی به ${expected} پیدا نشد`).toBe(true);
    }

    expect(unresolved(refs)).toEqual([]);
  });

  it("فایل‌های ثابتِ public به مسیرهای موجود اشاره می‌کنند", () => {
    const scan = scanPublic();

    // هر منبع باید چیزی داده باشد؛ وگرنه آزمون به‌جای سنجیدن، ساکت است.
    expect(scan.manifest.length).toBeGreaterThanOrEqual(7); // start_url + ۴ آیکون + ۲ میان‌بُر
    expect(scan.serviceWorker.length).toBeGreaterThanOrEqual(5);
    expect(scan.offline.length).toBeGreaterThanOrEqual(2);
    expect(scan.securityTxt.length).toBeGreaterThanOrEqual(2);

    expect(unresolved(scan.refs)).toEqual([]);
  });

  it("هیچ ارجاعی به نام‌های دنیای Express (index.html، cart.html، …) برنمی‌گردد", () => {
    const offenders = [...scanSrc(), ...scanPublic().refs]
      .filter((r) => /\.html$/.test(r.path) || EXPRESS_ERA.has(r.path.split("/").pop() ?? ""))
      .filter((r) => {
        // نام‌های Express حتی اگر فایلش در public کپی شود هم قرمز می‌شوند
        // (فهرستِ EXPRESS_ERA بالا دلیلش را دارد).
        if (EXPRESS_ERA.has(r.path.split("/").pop() ?? "")) return true;
        // پسوندِ .html تنها وقتی مجاز است که واقعاً فایلی در public داشته باشد
        // — تنها استثنای پروژه `public/offline.html` است.
        return !resolveRef(r, "exact").ok;
      })
      .map((r) => `${r.file} → ${r.raw}`);

    expect(offenders).toEqual([]);
  });

  it("لنگرهای ارجاع‌شده (#…) در کد شناخته‌شده‌اند", () => {
    const refs = [...scanSrc(), ...scanPublic().refs].filter((r) => r.hash);
    expect(refs.length).toBeGreaterThan(0);

    // لنگرها در این پروژه دو جورند: شناسهٔ عنصر، و کلیدِ تب که با
    // location.hash خوانده می‌شود (`#orders` و `#wishlist` در حسابِ کاربری از
    // نوعِ دوم‌اند). پس «بودنِ همان رشته در کد» سنجیده می‌شود، نه `id="…"` —
    // این یک بررسیِ کاملِ لنگر نیست، ولی غلطِ تایپی را می‌گیرد.
    const srcText = walk(SRC_DIR)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n");

    const orphans = refs
      .filter((r) => !srcText.includes(`"${r.hash}"`) && !srcText.includes(`'${r.hash}'`))
      .map((r) => `${r.file} → ${r.raw}  (لنگرِ «${r.hash}» در کد پیدا نشد)`);

    expect(orphans).toEqual([]);
  });

  it("next.config فقط API و عکس را پروکسی می‌کند و ریدایرکتِ بازگشتِ پرداخت سرِ جایش است", async () => {
    // خودِ فایلِ پیکربندی خوانده می‌شود، نه یک کپیِ دستی از محتوایش: تنها راهِ
    // اینکه این آزمون روزی «سبزِ دروغین» نشود، خواندنِ همان چیزی است که Next
    // اجرا می‌کند.
    const config = (await import("../../next.config")).default;

    const rewrites = (await config.rewrites!()) as { source: string }[];
    expect(rewrites.map((r) => r.source)).toEqual(["/api/:path*", "/picture/:path*"]);

    // درگاه پرداخت (routes/orders.js) مشتری را به آدرسِ *نسبیِ*
    // `/order-success.html` برمی‌گرداند. این نام از دنیای Express مانده و روی
    // مبدأِ Next وجود ندارد؛ اگر این ریدایرکت برود، مشتریِ پول‌داده به صفحه‌ی
    // مرده می‌رسد. تنها استثنای عمدیِ فهرستِ بالاست، پس صریح سنجیده می‌شود.
    const redirects = (await config.redirects!()) as {
      source: string;
      destination: string;
      permanent: boolean;
    }[];
    expect(redirects).toEqual([
      { source: "/order-success.html", destination: "/order-success", permanent: false },
    ]);
  });
});
