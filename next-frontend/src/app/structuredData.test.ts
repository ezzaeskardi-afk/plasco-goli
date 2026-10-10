// ============================================================
// نگهبانِ داده‌ی ساختاریافته و دارایی‌های سئو — این‌بار در خانه‌ی تازه
// ============================================================
// این فایل وارثِ `backend/test-seo.js` است. آن آزمون HTMLِ `frontend/` را از
// دیسک می‌خواند و قراردادِ سئو را روی همان فایل‌ها می‌سنجید. با بازنشستگیِ
// فروشگاهِ Express آن پوشه حذف شد و آزمونش بی‌مرجع ماند — ولی دو دسته از
// سنجش‌هایش هنوز درباره‌ی *محصولِ زنده* بودند و دور ریختنشان یعنی یک حفره:
//
//   ۱) کدام نوع‌های داده‌ی ساختاریافته (JSON-LD) برای کدام مسیر تولید می‌شوند.
//      این‌جا با مرجعِ **اوراکلِ منجمد** سنجیده می‌شود: هر نوعی که Express برای
//      یک صفحه می‌فرستاد باید برای مسیرِ معادلش در Next هم تولید شود — و
//      برعکس، نوعِ اضافه‌ی اعلام‌نشده هم قبول نیست.
//   ۲) دارایی‌های اشتراک‌گذاری (og:image/twitter/robots/آیکون‌ها) و `alt` روی
//      عکس‌ها، به‌همراه ابعادِ صریح تا صفحه نلرزد.
//
// چرا آزمونِ منبعی و نه زنده: مثلِ خواهرهایش (`seoParity`/`shellParity`) هیچ
// سروری در CI بالا نیست، و «متنِ سورس» همان چیزی است که در بیلد اجرا می‌شود.
// چیزی که *فقط* زنده سنجیده می‌شود (کدِ وضعیت، مقصدِ ریدایرکت، بدنه‌ی HTML)
// در `next-frontend/scripts/*-live.mjs` و `backend/test-smoke.js` است.
//
// ---------- چرا همین‌جا یک واگراییِ واقعی پیدا شد ----------
// `/products` نسخه‌ی Express دو قلم داشت: `CollectionPage` + `BreadcrumbList`.
// مسیرِ Next فقط اولی را می‌فرستاد و هیچ نگهبانی نمی‌گرفت — سنجشِ زنده‌ی
// برابری فقط متادیتا (title/robots/canonical/og) را مقایسه می‌کند، نه JSON-LD.
// مسیرِ راه همان روز اضافه شد و همین آزمون قفلش می‌کند.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
const SRC_DIR = path.join(NEXT_DIR, "src");
const PUBLIC_DIR = path.join(NEXT_DIR, "public");
// اوراکلِ منجمدِ فروشگاهِ Express (`frontend/` پیش از حذف). هر جای این پروژه
// که «متنِ مرجع» لازم دارد از همین‌جا می‌خواند، نه از یک پوشه‌ی زنده.
const ORACLE_DIR = path.join(NEXT_DIR, "tests", "fixtures", "legacy-src");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(SRC_DIR, rel), "utf8");
}

/** حذفِ کامنت‌ها: یک یادداشتِ توضیحی نباید جای کدِ واقعی تأیید شود. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

/**
 * نوعِ schema → کامپوننتی که آن را تولید می‌کند.
 *
 * این جدول عمداً کامل نوشته شده: اگر روزی صفحه‌ای نوعِ تازه‌ای بفرستد و کسی
 * این‌جا را به‌روز نکند، آزمونِ پایین («هر نوعی سازنده دارد») قرمز می‌شود —
 * وگرنه آن نوع در سکوت از تورِ مقایسه می‌افتاد.
 */
const COMPONENT_OF: Record<string, string> = {
  Store: "StoreJsonLd",
  WebSite: "WebSiteJsonLd",
  FAQPage: "FAQPageJsonLd",
  ItemList: "ItemListJsonLd",
  CollectionPage: "CollectionPageJsonLd",
  Product: "ProductJsonLd",
  BreadcrumbList: "BreadcrumbJsonLd",
  WebPage: "WebPageJsonLd",
};

const PAGES = [
  { express: "index.html", next: "app/page.tsx" },
  { express: "products.html", next: "app/products/page.tsx" },
  { express: "terms.html", next: "app/terms/page.tsx" },
  { express: "wholesale.html", next: "app/wholesale/page.tsx" },
];

// دو نوعی که Express *در زمانِ سرو* تزریق می‌کرد، نه در خودِ فایل: مارکرشان در
// HTMLِ منجمد مانده است. پس «نوعِ لازم» از خودِ مارکر خوانده می‌شود، نه از یک
// فهرستِ دستی که کهنه می‌شود.
const INJECTED: { marker: string; type: string }[] = [
  { marker: "<!--pg-itemlist-->", type: "ItemList" },
];

function oracleHtml(file: string): string {
  return fs.readFileSync(path.join(ORACLE_DIR, file), "utf8");
}

/** نوع‌های JSON-LD که خودِ فایلِ Express اعلام می‌کند (آرایه‌ها هم پهن می‌شوند). */
function oracleTypes(file: string): string[] {
  const html = oracleHtml(file);
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(m[1]);
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        const type = (node as { "@type"?: unknown })["@type"];
        if (typeof type === "string") out.push(type);
      }
    } catch {
      // JSON-LDِ نامعتبر در اوراکل: عمداً نادیده — اوراکل یک سندِ تاریخی است و
      // این آزمون قرار نیست صحتش را بسنجد؛ چیزی که می‌سنجد *حضور* نوع‌ها است.
    }
  }
  return out;
}

/** نوع‌هایی که Next برای این مسیر لازم دارد: خودِ فایل + مارکرهای تزریقی. */
function requiredTypes(file: string): string[] {
  const set = new Set(oracleTypes(file));
  const html = oracleHtml(file);
  for (const inj of INJECTED) if (html.includes(inj.marker)) set.add(inj.type);
  return [...set];
}

/** کامپوننت‌های JSON-LDی که سورسِ یک مسیر واقعاً رندر می‌کند. */
function renderedComponents(rel: string): string[] {
  const src = stripComments(readSource(rel));
  return Object.values(COMPONENT_OF).filter((c) => new RegExp(`<${c}[\\s/>]`).test(src));
}

// ------------------------------------------------------------
// ۱) داده‌ی ساختاریافته: هر مسیر در برابر اوراکلِ Express
// ------------------------------------------------------------
describe("داده‌ی ساختاریافته‌ی هر مسیر، در برابر اوراکلِ Express", () => {
  it("اوراکل واقعاً خوانده می‌شود (وگرنه آزمونِ خالی سبز می‌شود)", () => {
    expect(fs.existsSync(ORACLE_DIR)).toBe(true);
    const total = PAGES.reduce((n, p) => n + oracleTypes(p.express).length, 0);
    expect(total).toBeGreaterThanOrEqual(7);
  });

  for (const page of PAGES) {
    it(`${page.express} → ${page.next}`, () => {
      const want = requiredTypes(page.express);
      const have = renderedComponents(page.next);

      const missing = want.filter((type) => !have.includes(COMPONENT_OF[type]));
      expect(missing, `نوع‌هایی که Express می‌فرستاد و این مسیر ندارد`).toEqual([]);

      // جهتِ مخالف هم مهم است: نوعِ اضافه یعنی مسیر چیزی را اعلام می‌کند که
      // نسخه‌ی Express نداشت — تغییری که باید آگاهانه و اعلام‌شده باشد.
      const extra = have
        .map((c) => Object.keys(COMPONENT_OF).find((t) => COMPONENT_OF[t] === c) || c)
        .filter((type) => !want.includes(type));
      expect(extra, `نوع‌هایی که این مسیر می‌فرستد و Express نمی‌فرستاد`).toEqual([]);
    });
  }

  it("هر نوعی که در اوراکل دیده می‌شود، سازنده‌ی متناظر دارد", () => {
    const seen = new Set<string>();
    for (const page of PAGES) for (const t of requiredTypes(page.express)) seen.add(t);
    // مسیرِ محصول نوعش را سمتِ سرور می‌گیرد (پایین‌تر سنجیده می‌شود)
    seen.add("Product");
    expect([...seen].filter((t) => !COMPONENT_OF[t])).toEqual([]);
  });

  it("مسیرِ محصول همان دو قلمِ تزریق‌شده‌ی Express را می‌سازد", () => {
    // `product.html` در اوراکل هیچ JSON-LDی ندارد: Express آن را در
    // `server.js` برای `/product/:id` تزریق می‌کرد. پس مرجعِ این یکی، رفتارِ
    // سرور است، نه فایل — و همین‌جا صریح نوشته می‌شود تا خالی نماند.
    const src = stripComments(readSource("app/product/[id]/page.tsx"));
    expect(src).toContain("<ProductJsonLd");
    expect(src).toContain("<BreadcrumbJsonLd");
  });
});

// ------------------------------------------------------------
// ۲) دارایی‌های اشتراک‌گذاری و آیکون‌ها
// ------------------------------------------------------------
describe("دارایی‌های اشتراک‌گذاری (og/twitter) و آیکون‌ها", () => {
  const layout = stripComments(readSource("app/layout.tsx"));
  const site = stripComments(readSource("lib/site.ts"));

  it("og:image به یک فایلِ واقعیِ مخزن اشاره می‌کند، نه مسیرِ ۴۰۴", () => {
    // این دقیقاً یک باگِ واقعیِ گذشته است: `/assets/og-image.png` در سورس بود و
    // چنین فایلی وجود نداشت، یعنی هر لینکِ اشتراک‌گذاشته‌شده بی‌عکس باز می‌شد.
    const m = site.match(/export const OG_IMAGE\s*=\s*\n?\s*"([^"]+)"/);
    expect(m, "OG_IMAGE در lib/site.ts پیدا نشد").toBeTruthy();
    const url = m ? m[1] : "";
    expect(url.startsWith("/")).toBe(true);
    const onDisk = url.startsWith("/picture/")
      ? path.join(NEXT_DIR, "..", url.slice(1)) // picture/ در ریشه‌ی مخزن است
      : path.join(PUBLIC_DIR, url.slice(1));
    expect(fs.existsSync(onDisk), `فایلِ og:image روی دیسک نیست: ${url}`).toBe(true);
  });

  it("openGraph/twitter/robots به همان ثابت‌های site گره خورده‌اند", () => {
    expect(layout).toMatch(/images:\s*\[\{\s*url:\s*OG_IMAGE/);
    expect(layout).toContain("card:");
    expect(layout).toMatch(/images:\s*\[OG_IMAGE\]/);
    // `max-image-preview:large` در Express هم بود (index.html/products.html):
    // بدونش گوگل تصویرِ کوچک می‌آورد و برای فروشگاهِ عکسمحور یعنی کلیکِ کمتر.
    expect(layout).toContain('"max-image-preview": "large"');
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*true/);
  });

  it("آیکون‌ها و manifest به فایل‌های موجودِ public اشاره می‌کنند", () => {
    const icons = [...layout.matchAll(/url:\s*"(\/[^"]+)"/g)].map((m) => m[1]);
    const apple = layout.match(/apple:\s*"(\/[^"]+)"/);
    const manifest = layout.match(/manifest:\s*"(\/[^"]+)"/);
    expect(icons.length).toBeGreaterThan(0);
    for (const url of [...icons, ...(apple ? [apple[1]] : []), ...(manifest ? [manifest[1]] : [])]) {
      expect(fs.existsSync(path.join(PUBLIC_DIR, url.slice(1))), `آیکونِ گمشده: ${url}`).toBe(true);
    }
  });
});

// ------------------------------------------------------------
// ۳) قیمت در داده‌ی ساختاریافته و متاهای فیسبوک
// ------------------------------------------------------------
// این بخش از `backend/tests/discount.js` به اینجا منتقل شد. آن آزمون زنده،
// صفحه‌ی `/product/:id` نسخه‌ی Express را می‌گرفت و نشانه‌های `data-pg-ld`
// (محصول و مسیرِ راه) و ریالی‌بودنِ قیمت را می‌سنجید. با حذفِ آن صفحه، سنجش
// «قیمت ریالی است نه تومانی» جای دیگری نداشت — و این یکی از باگ‌های واقعیِ
// گذشته است: قیمتِ تومانی در `Offer.price` یعنی گوگل و فیسبوک قیمتی را
// نشان می‌دهند که یک‌دهمِ واقعیت است.
describe("قیمت در داده‌ی ساختاریافته و متاها", () => {
  const jsonLd = stripComments(readSource("components/JsonLd.tsx"));
  const productPage = stripComments(readSource("app/product/[id]/page.tsx"));

  it("قیمتِ JSON-LD ریالی و با ارزِ IRR است (نه تومانی)", () => {
    expect(jsonLd).toContain('priceCurrency: "IRR"');
    // دو جا: Offerِ محصول و Offerِ هر قلم در ItemList
    expect(jsonLd.match(/price:\s*product\.price \* 10/g)?.length).toBeGreaterThanOrEqual(1);
    expect(jsonLd.match(/price:\s*p\.price \* 10/g)?.length).toBeGreaterThanOrEqual(1);
    expect(jsonLd).toContain("// ریال");
  });

  it("متاهای قیمت همان عددِ ریالی را می‌دهند", () => {
    expect(productPage).toMatch(/property="product:price:amount"\s+content=\{String\(product\.price \* 10\)\}/);
    expect(productPage).toMatch(/property="product:price:currency"\s+content="IRR"/);
  });

  it("قیمتِ قبلی فقط وقتی تخفیفِ واقعی هست اعلام می‌شود", () => {
    // Express هم همین قید را داشت: با `oldPrice` کوچک‌تر یا مساوی، متای قیمتِ
    // قبل اعلام نمی‌شد (وگرنه درصدِ دروغ در پیش‌نمایشِ لینک دیده می‌شد).
    expect(productPage).toMatch(/Number\(product\.oldPrice\) > Number\(product\.price\)/);
    expect(productPage).toContain("og:price:standard_amount");
  });
});

// ------------------------------------------------------------
// ۴) عکس‌ها: alt، و ابعادِ صریح تا صفحه نلرزد
// ------------------------------------------------------------
/**
 * برشِ یک تگِ JSX از نامش تا `>` در عمقِ صفر.
 *
 * چرا شمارشِ عمق و گیومه‌ها لازم است: `alt={x ? "a" : "b"}` و `onClick={() => …}`
 * هر دو `>` دارند. یک regexِ ساده‌ی `/<img[^>]*>/` آن‌ها را نصف می‌کند و بعد
 * «alt ندارد» می‌گوید — یعنی نگهبانی که کدِ درست را قرمز می‌کند.
 */
function jsxTags(src: string, name: string): string[] {
  const out: string[] = [];
  let i = 0;
  while ((i = src.indexOf(`<${name}`, i)) !== -1) {
    const after = src[i + 1 + name.length];
    if (after && /[A-Za-z0-9_]/.test(after)) { i += 1; continue; }
    let depth = 0;
    let quote: string | null = null;
    let j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(src.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}

function componentFiles(dir = SRC_DIR, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) componentFiles(abs, out);
    else if (/\.tsx$/.test(abs) && !/\.test\.tsx$/.test(abs)) out.push(abs);
  }
  return out;
}

describe("عکس‌ها: alt و ابعادِ صریح", () => {
  const files = componentFiles();

  it("هر عکس alt دارد (تزئینی‌ها صریحاً alt=\"\" می‌گیرند)", () => {
    const missing: string[] = [];
    for (const file of files) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      for (const name of ["img", "Image"]) {
        for (const tag of jsxTags(src, name)) {
          if (!/\balt=/.test(tag)) missing.push(`${path.relative(NEXT_DIR, file)}: ${tag.slice(0, 60)}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("هر next/image یا `fill` دارد یا عرض و ارتفاع", () => {
    const bad: string[] = [];
    for (const file of files) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      for (const tag of jsxTags(src, "Image")) {
        const sized = /\bwidth=/.test(tag) && /\bheight=/.test(tag);
        if (!sized && !/\bfill\b/.test(tag)) bad.push(`${path.relative(NEXT_DIR, file)}: ${tag.slice(0, 60)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("هر img خالص یا ابعاد دارد یا در جعبه‌ی اندازه‌دار با alt=\"\" نشسته", () => {
    // استثنای آگاهانه: بندانگشتی‌های پنل داخلِ یک جعبه‌ی `h-16 w-16` می‌نشینند و
    // `alt=""` دارند (عکسِ تزئینیِ پیش‌نمایش، نه محتوا). برای آن‌ها ابعادِ صریح
    // تکراری است؛ برای بقیه لازم — وگرنه صفحه موقعِ لود می‌لرزد.
    const bad: string[] = [];
    for (const file of files) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      for (const tag of jsxTags(src, "img")) {
        if (/\bwidth=/.test(tag) && /\bheight=/.test(tag)) continue;
        const decorative = /alt=""/.test(tag);
        // `h-16 w-16` (جعبه‌ی صریح) یا `h-full w-full` (پرکردنِ جعبه‌ی پدرِ
        // اندازه‌دار) — هر دو یعنی اندازه از قبل معلوم است.
        const sized = /\b(h|w)-(full|\d)/.test(tag);
        if (!(decorative && sized)) bad.push(`${path.relative(NEXT_DIR, file)}: ${tag.slice(0, 60)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
