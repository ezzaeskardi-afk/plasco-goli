// ============================================================
// سئوی صفحهٔ محصول — canonical، og:type و «در HTMLِ سروشده»
// ============================================================
// صفحهٔ محصول پرارزش‌ترین صفحهٔ این فروشگاه است (هر محصول یک صفحهٔ ورودیِ
// گوگل) و دو قلمِ سئویش هیچ نگهبانی نداشت. هر دو یک ویژگی مشترک دارند:
// **اگر بروند، هیچ خطایی نمی‌دهند.** صفحه بالا می‌آید، تست‌های رفتاری سبز
// می‌مانند، و تنها چیزی که عوض می‌شود رفتارِ گوگل و پیام‌رسان‌هاست:
//
//   ۱. **canonical** — آدرسِ مرجعِ صفحه. Express روی `/product/:id` خودش
//      تزریقش می‌کرد. نبودنش یعنی نسخه‌های پارامتری/قدیمیِ همان صفحه می‌توانند
//      به‌عنوان صفحهٔ جداگانه ایندکس شوند (محتوای تکراری).
//   ۲. **og:type=product** — نوعِ کارتِ اشتراک‌گذاری. Express فقط `product`
//      می‌داد. اگر یک `og:type=website`ِ اضافه *پیش از* آن بیفتد،
//      واتساپ/تلگرام همان اولی را می‌خوانند و کارتِ محصول به کارتِ عمومیِ
//      سایت تبدیل می‌شود.
//
// قلمِ سومِ همین بدهی — **ردیفِ اعتماد** (پنج قلمِ `ul.pd-perks`) — جای
// خودش را دارد: `oracleLists.test.ts`، چون همان جنسِ سنجش برای سه فهرستِ
// دیگر هم لازم بود (و دو تای آن‌ها واقعاً بی‌آیکون شده بودند). این‌جا فقط
// «این‌که ردیف در HTMLِ اولیه هست یا نه» می‌ماند، که یک ادعای سئویی است.
//
// ---------- چرا آفلاین و چرا از خودِ اوراکل ----------
// مثل خواهرانش (`seoParity`/`copyParity`/`shellParity`) هیچ سروری در CI بالا
// نیست؛ پس «متنِ سورس» سنجیده می‌شود و مرجع، **اوراکلِ منجمدِ Express** است
// (`tests/fixtures/legacy-src/product-gone.html`)، نه حافظهٔ نویسنده. هر دو
// ادعا در `guard-mutations.js` لنگرِ جهش دارند.
//
// آن‌چه *فقط* زنده سنجیدنی است (این‌که تگ‌ها واقعاً در HTMLِ سروشده هستند و
// نه فقط در سورس، و این‌که canonicalِ نسبی با `metadataBase` چه می‌شود) در
// `e2e/05-product-seo.spec.ts` است.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
const SRC_DIR = path.join(NEXT_DIR, "src");
/** اوراکلِ منجمدِ فروشگاهِ Express — مرجعِ هر سنجشِ برابری در این پروژه. */
const ORACLE_DIR = path.join(NEXT_DIR, "tests", "fixtures", "legacy-src");

const PRODUCT_PAGE = "app/product/[id]/page.tsx";
const PRODUCT_DETAIL = "components/ProductDetail.tsx";
const PRODUCT_GONE = "app/product-gone/page.tsx";

function readSource(rel: string): string {
  return fs.readFileSync(path.join(SRC_DIR, rel), "utf8");
}
function readOracle(name: string): string {
  return fs.readFileSync(path.join(ORACLE_DIR, name), "utf8");
}
/** حذفِ کامنت‌ها: یادداشتِ توضیحی نباید جای کدِ واقعی تأیید شود. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

describe("canonical صفحهٔ محصول", () => {
  it("canonical روی مسیرِ تمیزِ محصول ساخته می‌شود، نه نامِ `.html` عصرِ Express", () => {
    const src = stripComments(readSource(PRODUCT_PAGE));
    expect(src).toMatch(/alternates:\s*\{\s*canonical:\s*`\/product\/\$\{product\.id\}`/);
    // canonicalِ نسبی با `metadataBase` مطلق می‌شود؛ اگر یک دامنهٔ هاردکد یا
    // نامِ `.html` داخلش بیفتد، این نگهبان باید بگیرد.
    const canonical = /canonical:\s*([^,\n]+)/.exec(src);
    expect(canonical, "canonical پیدا نشد").toBeTruthy();
    expect(canonical![1]).not.toContain(".html");
    expect(canonical![1]).not.toContain("http");
  });

  it("صفحهٔ ۴۱۰ (محصولِ حذف‌شده) هیچ canonical نمی‌دهد", () => {
    // مرجع، خودِ اوراکل است: `product-gone.html` هیچ canonicalی نداشت.
    const oracle = readOracle("product-gone.html");
    expect(oracle).not.toContain('rel="canonical"');

    const src = stripComments(readSource(PRODUCT_GONE));
    expect(src).not.toContain("canonical");
  });
});

describe("og:type صفحهٔ محصول", () => {
  it("دقیقاً یک تگِ `og:type=product` تولید می‌شود", () => {
    const src = stripComments(readSource(PRODUCT_PAGE));
    const tags = src.match(/property="og:type"/g) ?? [];
    expect(tags, "تعدادِ تگِ `og:type` در صفحهٔ محصول").toHaveLength(1);
    expect(src).toMatch(/<meta\s+property="og:type"\s+content="product"\s*\/>/);
  });

  it("`pageSocial` بدونِ og:type صدا زده می‌شود تا یک `website`ِ اضافه نیفتد", () => {
    // خودِ Next مقدارهای ناشناسِ og:type را در build رد می‌کند (`product` هم
    // در unionِ تایپ نیست)، پس این تگ را نمی‌شود از آبجکتِ Metadata داد.
    // نتیجه‌اش این است که اگر `type: null` به `pageSocial` نرود، یک
    // `og:type=website` **پیش از** تگِ `product` می‌نشیند و کارتِ اشتراک‌گذاری
    // نوعِ درست را از دست می‌دهد — همان چیزی که `socialParity` برای خودِ
    // تابع قفل کرده است.
    const src = stripComments(readSource(PRODUCT_PAGE));
    expect(src).toMatch(/pageSocial\(\{[\s\S]*?type:\s*null/);
  });

  it("صفحهٔ ۴۱۰ هیچ og:typeِ محصولی از خودش نمی‌سازد", () => {
    // نکتهٔ دقیق (که سنجشِ زنده هم همان را می‌گوید): `og:type=website`ِ
    // **ریشه** روی هر صفحه‌ای می‌نشیند که خودش `openGraph` ندهد — و این درست
    // است. چیزی که نباید باشد تگِ `product` است: ۴۱۰ با کارتِ محصول یعنی
    // خودش را یک کالای معتبر به پیام‌رسان‌ها معرفی می‌کند.
    const src = stripComments(readSource(PRODUCT_GONE));
    expect(src).not.toContain("og:type");
    expect(src).not.toContain("product:price");
    expect(src).not.toContain("openGraph");
  });
});

describe("ردیفِ اعتماد باید در HTMLِ سروشده باشد، نه بعد از جاوااسکریپت", () => {
  it("صفحهٔ محصول، محصول را از سرور به `ProductDetail` می‌دهد", () => {
    // ردیفِ اعتماد داخلِ `ProductDetail` است و آن کامپوننت محصول را از
    // **پراپ** می‌گیرد؛ پس SSR آن را می‌کشد. اگر روزی کسی محصول را سمتِ
    // کلاینت واکشی کند (`useQuery` روی جزئیاتِ محصول)، ردیف از HTMLِ اولیه
    // می‌افتد و خزنده/کاربرِ بی‌جاوااسکریپت آن را نمی‌بیند — بی‌صدا.
    // (خودِ برابریِ متن و آیکونِ قلم‌ها در `oracleLists.test.ts` است.)
    const detail = readSource(PRODUCT_DETAIL);
    expect(detail).toMatch(
      /export function ProductDetail\(\{ product \}: \{ product: Product \}\)/,
    );
    expect(detail, "محصول در ProductDetail سمتِ کلاینت واکشی می‌شود").not.toMatch(
      /useQuery[^;]*getProduct/,
    );
    expect(stripComments(readSource(PRODUCT_PAGE))).toContain(
      "<ProductDetail product={product} />",
    );
  });
});
