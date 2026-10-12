// ============================================================
// نگهبانِ پوششِ مسیرهای ثابت — «حذفِ یک ردیف بی‌صدا نباشد»
// ============================================================
// خواهرِ ایستای `scripts/static-paths-live.mjs` (و `internalLinks.test.ts`) و
// دقیقاً همان حفره‌ای را می‌گیرد که تا امروز باز بود: خودِ فهرستِ سنجش، *دستی*
// است. کسی می‌توانست یک ردیف را پاک کند — یا یک داراییِ تازه به سورس اضافه
// شود و هیچ‌کس یادش نرود آن را به فهرست اضافه کند — و سنجشِ زنده هم چنان با
// اطمینان بنویسد «هر N مسیر ۲۰۰ داد». حذفِ یک ردیف یعنی پوشش بی‌صدا کوچک شد.
//
// راهِ بستنش «شمارشِ ردیف‌ها» نیست (عددِ ثابت فقط تغییر را می‌گیرد، نه *جهت*
// را). قرارداد این است:
//
//   هر مسیری که سورس به آن ارجاع می‌دهد باید سنجیده شود،
//   و هر مسیری که سنجیده می‌شود باید ارجاعی داشته باشد یا قراردادِ مستند باشد.
//
// یعنی حذفِ ردیف `["/assets/icons.svg", …]` قرمز می‌شود چون `sw.js` و
// `IconSprite` هنوز به آن ارجاع می‌دهند؛ و افزودنِ داراییِ تازه بدونِ سنجیدنش
// هم قرمز می‌شود. تنها معافیت‌ها در `CONVENTIONS`ِ همان ماژولِ مشترک‌اند و هر
// کدام دلیلِ نوشته‌شده دارند.
//
// دو چیز این آزمون عمداً *نمی‌سنجد*: کدِ وضعیتِ ۲۰۰ (کارِ اجراکننده‌ی زنده است)
// و وجودِ فایل روی دیسک (کارِ `internalLinks.test.ts`). اینجا فقط «پوششِ
// سنجش» سنجیده می‌شود، ولی فهرستِ سنجش از همان ماژولِ مشترک می‌آید تا دو فهرستِ
// واگرا نداشته باشیم.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectTargets, CONVENTIONS, MANUAL_PATHS } from "../../scripts/static-paths.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", "..");
const SRC_DIR = path.join(NEXT_DIR, "src");
const PUBLIC_DIR = path.join(NEXT_DIR, "public");

// ---------- فهرستِ سنجش، از منبعِ حقیقتِ مشترک ----------
const { targets, manifestError, iconsEmpty, fontError } = collectTargets({
  manifestPath: path.join(PUBLIC_DIR, "manifest.webmanifest"),
  cssPath: path.join(SRC_DIR, "app", "globals.css"),
});
const measured = targets.map(([p]) => p);

// ---------- ارجاع‌ها: کد، سرویس‌ورکر و مانیفست (کامنت‌ها پاک) ----------
// چرا کامنت‌ها پاک می‌شوند: سورسِ همین پروژه جاهایی *تاریخی* از مسیرها حرف
// می‌زند («`/assets/og-image.png` وجود نداشت و ۴۰۴ می‌داد») — وگرنه یک کامنت
// درباره‌ی یک مسیرِ حذف‌شده خودش را جای ارجاع جا می‌زد و سنجش را قرمز می‌کرد.
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // `//` جدا می‌شود، ولی نه آن‌هایی که بخشی از `://` هستند
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(abs, out);
    else if (!/\.test\.(ts|tsx)$/.test(e.name)) out.push(abs);
  }
  return out;
}

const SCANNED = [
  ...sourceFiles(SRC_DIR),
  path.join(PUBLIC_DIR, "sw.js"),
  path.join(PUBLIC_DIR, "manifest.webmanifest"),
];

// فقط ریشه‌هایی که «مسیرِ ثابت»اند؛ `/picture/…` عکسِ محصول است و از بک‌اند
// می‌آید، و مسیرهای صفحه‌ها (`/cart`، `/product/12`) کارِ `internalLinks`اند.
const CANDIDATE =
  /(?<![\w.$-])\/(?:assets\/[A-Za-z0-9._/-]*|\.well-known\/[A-Za-z0-9._/-]*|sw\.js|offline\.html|manifest\.webmanifest|robots\.txt|sitemap\.xml)/g;

const references = new Map<string, string>(); // path → اولین فایلی که ارجاع داده
for (const file of SCANNED) {
  const text = stripComments(fs.readFileSync(file, "utf8"));
  for (const m of text.matchAll(CANDIDATE)) {
    const p = m[0].split(/[?#]/)[0];
    // `/assets/fonts/` در `sw.js` یک *پیشوند* است (شرطِ کش)، نه یک مسیر
    if (p.endsWith("/")) continue;
    if (!references.has(p)) references.set(p, path.relative(NEXT_DIR, file));
  }
}

const conventionPaths = new Set(CONVENTIONS.map((c) => c.path));

// مسیرهای مسیرسازِ App Router که فایلِ ثابت ندارند.
const APP_ROUTES: Record<string, string> = {
  "/robots.txt": "src/app/robots.ts",
  "/sitemap.xml": "src/app/sitemap.ts",
};

describe("فهرستِ دستیِ مسیرهای ثابت", () => {
  it("هر ردیف مسیرِ مطلق است، دلیلِ نوشته‌شده دارد و تکراری نیست", () => {
    const bad = MANUAL_PATHS.filter(
      ([p, why]) => !String(p).startsWith("/") || !String(why ?? "").trim(),
    ).map(([p]) => String(p));
    expect(bad).toEqual([]);
    expect(new Set(MANUAL_PATHS.map(([p]) => p)).size).toBe(MANUAL_PATHS.length);
    expect(MANUAL_PATHS.length).toBeGreaterThan(0);
  });

  it("هر قراردادِ مستند دلیل دارد و همان مسیر سنجیده می‌شود", () => {
    const bad = CONVENTIONS.filter(
      (c) => !String(c.path).startsWith("/") || !String(c.why ?? "").trim(),
    ).map((c) => c.path);
    expect(bad).toEqual([]);
    expect(new Set(CONVENTIONS.map((c) => c.path)).size).toBe(CONVENTIONS.length);
    // این فهرست معافیتِ قانونِ *ارجاع* است، پس فقط برای مسیری معنا دارد که
    // واقعاً سنجیده می‌شود — وگرنه یک ردیفِ مرده است. (تداخل با فهرستِ دستی
    // عمدی و طبیعی است: همان ردیف هم سنجیده می‌شود و هم ارجاعی ندارد.)
    expect(CONVENTIONS.map((c) => c.path).filter((p) => !measured.includes(p))).toEqual([]);
  });
});

describe("پوششِ سنجش", () => {
  it("هر مسیری که سورس به آن ارجاع می‌دهد سنجیده می‌شود (حذفِ یک ردیف بی‌صدا نیست)", () => {
    const uncovered = [...references]
      .filter(([p]) => !measured.includes(p))
      .map(([p, file]) => `${p} (ارجاع در ${file})`);
    expect(uncovered).toEqual([]);
  });

  it("هر مسیرِ سنجیده‌شده یا ارجاع دارد یا قراردادِ مستند است", () => {
    const unexplained = measured.filter(
      (p) => !references.has(p) && !conventionPaths.has(p),
    );
    expect(unexplained).toEqual([]);
  });

  it("هر مسیرِ سنجیده‌شده روی دیسک یا در درختِ مسیرهای App Router هست", () => {
    const missing = measured.filter((p) => {
      if (APP_ROUTES[p]) return !fs.existsSync(path.join(NEXT_DIR, APP_ROUTES[p]));
      return !fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, "")));
    });
    expect(missing).toEqual([]);
  });

  it("کشفِ مانیفست و فونت خطا نمی‌دهد و صفر نمی‌شود", () => {
    expect({ manifestError, iconsEmpty, fontError }).toEqual({
      manifestError: null,
      iconsEmpty: false,
      fontError: null,
    });
    // کفِ پوشش: فهرستِ دستی + فونت‌ها + آیکون‌های مانیفست. اگر کشفِ پویا از کار
    // بیفتد، بقیه‌ی آزمون‌ها می‌توانند سبز بمانند در حالی که پوشش نصف شده.
    expect(measured.length).toBeGreaterThan(MANUAL_PATHS.length);
    const fonts = targets.filter(([, why]) => /globals\.css/.test(String(why)));
    expect(fonts.length).toBeGreaterThan(0);
    const icons = targets.filter(([, why]) => /مانیفستِ PWA/.test(String(why)));
    expect(icons.length).toBeGreaterThan(0);
  });
});
