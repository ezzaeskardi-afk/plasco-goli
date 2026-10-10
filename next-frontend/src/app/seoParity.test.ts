// ============================================================
// نگهبانِ سئو و متادیتا — Express ↔ Next
// ============================================================
// چرا این فایل لازم شد: تا امروز تنها چیزی که درباره‌ی متادیتا آزموده می‌شد
// «عنوانِ» چند صفحه‌ی اصلی بود. یک بازرسیِ HTTP بین دو سرور نشان داد صفحه‌های
// داخلِ سبد/ورود/حساب **هیچ توضیحِ متایی نداشتند** و به توضیحِ عمومیِ سایت
// برمی‌گشتند، صفحه‌ی ۴۰۴ عنوانِ کوتاهِ «پیدا نشد» می‌داد، `max-image-preview`
// و کانونیکالِ صفحه‌های noindex هم با نسخه‌ی Express یکی نبود.
//
// چرا آزمونِ منبعی و نه آزمونِ زنده: در CI هیچ سروری بالا نیست. پس همان کاری
// را می‌کنیم که `shellParity.test.ts` می‌کند: متنِ متادیتا را از **خودِ
// `frontend/*.html`** می‌خوانیم و حضورِ همان متن را در سورسِ مسیرِ متناظرِ Next
// می‌سنجیم. هر تغییرِ ناخواسته در واژه‌ی عنوان یا توضیح، همین‌جا قرمز می‌شود.
//
// (قلمروِ این آزمون متادیتای *ایستا* است. متادیتای داینامیکِ دو مسیر
// `/products` و `/product/[id]` جداگانه و با الگو سنجیده می‌شود.)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
// اوراکلِ منجمد: نسخه‌ی متنِ کاملِ فروشگاهِ Express، همان‌طور که پیش از
// حذفِ `frontend/` روی دیسک بود — از این پس منبعِ حقیقت همین fixture است،
// نه یک پوشه‌ی زنده‌ی در حالِ خروج (وگرنه این نگهبان‌ها بی‌صدا skip می‌شدند).
const EXPRESS_DIR = path.join(NEXT_DIR, "tests", "fixtures", "legacy-src");

const HAS_ORACLE = fs.existsSync(path.join(EXPRESS_DIR, "index.html"));

/** یکسان‌سازی مثل نگهبان‌های دیگر: نیم‌فاصله و نشانه‌های نامرئیِ جهت. */
const plain = (s: string) =>
  String(s).replace(/[\u200c\u200e\u200f]/g, "").replace(/\s+/g, " ").trim();

/**
 * استخراجِ فقط بلوکِ `metadata` / `generateMetadata` از یک فایل.
 *
 * چرا لازم است: آزمونِ تخریبی نشان داد کوتاه‌کردنِ عنوانِ ۴۰۴ به «پیدا نشد»
 * گرفته نمی‌شود — چون همان جمله در `<h1>` بدنه‌ی همان صفحه هم هست. عنوانی که
 * مشتری در تبِ مرورگر و گوگل می‌بیند، همان است که در metadata نوشته شده؛ پس
 * مقایسه باید به همان بلوکِ محدود باشد، نه کلِ فایل.
 *
 * این تابع با شمارشِ آکولاد، بلوک را تا آکولادِ هم‌سطحِ اول پیدا می‌کند
 * (تطبیقِ ساده‌ی «تا اولین `};`» با آبجکت‌های تودرتو می‌شکند).
 */
function metadataBlock(src: string): string {
  const start = src.search(
    /export const metadata|export async function generateMetadata/,
  );
  if (start === -1) return "";

  // آکولادِ شروعی که «بدنه» است، نه آکولادِ پارامترها.
  //
  // `generateMetadata({ searchParams }: Props)` یک آکولادِ تودرتو *داخلِ*
  // پرانتز دارد؛ اگر آن را ابتدای بلوک بگیریم، بلوک همان‌جا تمام می‌شود و
  // عنوانی که پایین‌تر ساخته می‌شود بیرون می‌ماند. پس تا وقتی داخلِ پرانتز
  // هستیم آکولاد نمی‌شماریم.
  let paren = 0;
  let open = -1;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "{" && paren === 0) {
      open = i;
      break;
    }
  }
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

/**
 * حذفِ کامنت‌ها پیش از تطبیق.
 *
 * چرا حیاتی است: در آزمونِ تخریبی معلوم شد اگر عنوانِ ۴۰۴ به «پیدا نشد» کوتاه
 * شود، این نگهبان **سبز می‌ماند** — چون متنِ «صفحه پیدا نشد (۴۰۴)» در کامنتِ
 * توضیحیِ همان فایل هم هست. یعنی نگهبانی که کامنت را با کد اشتباه می‌گیرد،
 * وجودِ یک یادداشت را به‌جای کارِ درست تأیید می‌کند.
 *
 * فقط کامنت‌های تمام‌خط و بلوکی حذف می‌شوند (نه `//`های میانِ خط، چون
 * نشانی‌هایی مثل `https://wa.me/...` را نصف می‌کنند).
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

function expressMeta(file: string) {
  const html = stripComments(
    fs.readFileSync(path.join(EXPRESS_DIR, file), "utf8"),
  );
  const grab = (re: RegExp) => plain((html.match(re) || [])[1] || "");
  return {
    title: grab(/<title[^>]*>([\s\S]*?)<\/title>/i),
    description: grab(/<meta name="description" content="([^"]*)"/i),
    robots: grab(/<meta name="robots" content="([^"]*)"/i),
    canonical: grab(/<link rel="canonical" href="([^"]*)"/i),
  };
}

function nextSource(rel: string): string {
  const abs = path.join(NEXT_DIR, "src", rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    return plain(stripComments(fs.readFileSync(abs, "utf8")));
  }
  if (fs.existsSync(abs)) {
    return plain(
      stripComments(
        fs
          .readdirSync(abs)
          .filter((f) => /\.(tsx|ts)$/.test(f))
          .map((f) => fs.readFileSync(path.join(abs, f), "utf8"))
          .join(" "),
      ),
    );
  }
  return "";
}

/**
 * هر صفحه‌ی Express و مسیرِ متناظرش در Next.
 *
 * `titleSuffix`: قالبی که Next خودش به عنوان اضافه می‌کند (« | پلاسکو گلی»).
 * پس فقط بخشِ پیش از آن باید در سورس باشد. صفحه‌ی اصلی استثناست: عنوانش با
 * `absolute` نوشته می‌شود و کلِ رشته باید در سورس باشد.
 */
const PAGES: {
  express: string;
  next: string;
  /** تکه‌ای از عنوان که باید در سورسِ Next باشد (اگر با کلِ عنوان یکی نیست) */
  titleInSource?: string;
  /** آیا Express این صفحه را noindex کرده؟ */
  noindex?: boolean;
  /**
   * صفحه‌ای که noindexش را خودِ Next تأمین می‌کند، نه سورسِ ما.
   * فقط برای صفحه‌ی ۴۰۴: Next روی پاسخِ ۴۰۴ خودش `noindex` می‌گذارد و اگر ما
   * هم صریح بنویسیم، دو تگِ robots تکراری تولید می‌شود.
   */
  autoNoindex?: boolean;
  /**
   * صفحه‌ای که noindexش *شرطی* است، نه مطلق — مثلِ فهرستِ محصولات.
   * Express در `products.js:96` ترکیب‌های عمیقِ فیلتر (قیمت/موجودی/جستجو/
   * مرتب‌سازیِ غیرِپیش‌فرض) را noindex می‌کرد و فهرستِ ساده را نه. پس این‌جا
   * تنها چیزی که باید سنجیده شود این است که شرطی بودنش حفظ شده باشد؛
   * otherwise صفحه‌ی ساده‌ی محصولات هم بی‌سروصدا از ایندکس می‌افتد.
   */
  conditionalNoindex?: boolean;
  /** آیا Express کانونیکال دارد؟ */
  canonical?: boolean;
}[] = [
  { express: "index.html", next: "app/page.tsx", canonical: true },
  {
    express: "products.html",
    next: "app/products/page.tsx",
    titleInSource: "همه‌ی محصولات",
    canonical: true,
    conditionalNoindex: true,
  },
  { express: "cart.html", next: "app/cart/page.tsx", noindex: true },
  { express: "checkout.html", next: "app/checkout/page.tsx", noindex: true },
  { express: "login.html", next: "app/login/page.tsx", noindex: true },
  { express: "account.html", next: "app/account/page.tsx", noindex: true },
  { express: "order-success.html", next: "app/order-success/page.tsx", noindex: true },
  { express: "terms.html", next: "app/terms/page.tsx", canonical: true },
  { express: "wholesale.html", next: "app/wholesale/page.tsx", canonical: true },
  { express: "404.html", next: "app/not-found.tsx", noindex: true, autoNoindex: true },
];

// مقایسه‌ی متن، با نرمال‌سازیِ **هر دو طرف**.
//
// تله‌ای که همین امروز این آزمون را گرفت و ارزشِ یادداشت دارد: `nextSource`
// نیم‌فاصله‌ها را حذف می‌کند، ولی متنِ انتظار در خودِ این فایل نیم‌فاصله دارد؛
// نتیجه این بود که «همه‌ی محصولات» هرگز با «همهی محصولات» برابر نمی‌شد و آزمون
// به‌جای سنجیدنِ کد، از خودش شکایت می‌کرد. حالا هر دو طرف از `plain` رد می‌شوند.
function contains(haystack: string, needle: string): boolean {
  return haystack.includes(plain(needle));
}

const describeExpress = HAS_ORACLE ? describe : describe.skip;

describeExpress("سئوی صفحه‌ها بین Express و Next یکی است", () => {
  for (const page of PAGES) {
    it(`${page.express} → ${page.next}`, () => {
      const meta = expressMeta(page.express);
      const next = nextSource(page.next);
      const metaSrc = metadataBlock(next);
      expect(
        metaSrc.length,
        `بلوکِ metadata در ${page.next} پیدا نشد`,
      ).toBeGreaterThan(0);

      // ۱) عنوان: بخشِ پیش از «| پلاسکو گلی» باید در سورسِ Next باشد.
      //
      // چرا تقسیم می‌کنیم: در Express عنوان در HTML کامل نوشته شده
      // («سبد خرید | پلاسکو گلی») ولی در Next تکه‌ی اول در metadata و نامِ
      // برند در templateِ ریشه می‌نشیند. پس فقط تکه‌ی اول قابل‌مقایسه است.
      const expectedTitle =
        page.titleInSource ?? meta.title.replace(/\s*\|\s*پلاسکو گلی\s*$/, "");
      expect(
        contains(metaSrc, expectedTitle),
        `عنوانِ «${expectedTitle}» در بلوکِ metadataِ ${page.next} نیست (Express: «${meta.title}»)`,
      ).toBe(true);

      // ۲) توضیحِ متا: عیناً همان متن.
      expect(
        contains(metaSrc, meta.description),
        `توضیحِ «${meta.description}» در بلوکِ metadataِ ${page.next} نیست`,
      ).toBe(true);

      // ۳) قصدِ robots: صفحه‌های noindex نباید ایندکس‌شدنی بمانند و برعکس.
      //
      //    نکته‌ی درست‌سنجی: «نداشتنِ robots در سورسِ صفحه» یعنی *وارثت از
      //    layout*، نه «ایندکس‌شدنِ ناخواسته». پس برای صفحه‌های ایندکس‌شدنی این
      //    کافی است که خودشان noindex نگذارند (robotsِ مثبتِ ریشه در آزمونِ
      //    آخر و در آزمونِ زنده سنجیده می‌شود).
      if (page.noindex && !page.autoNoindex) {
        expect(
          /robots:\s*{\s*index:\s*false/.test(metaSrc),
          `صفحه‌ی ${page.express} در Express noindex است ولی ${page.next} آن را ایندکس می‌کند`,
        ).toBe(true);
      } else if (page.noindex && page.autoNoindex) {
        // ۴۰۴: Next خودش noindex می‌گذارد؛ فقط نباید ادعای index داشته باشیم.
        expect(
          /index:\s*true/.test(next),
          `صفحه‌ی ${page.express} noindex است ولی ${page.next} صریحاً index:true می‌گوید`,
        ).toBe(false);
      } else if (page.conditionalNoindex) {
        // شرطی بودن باید بماند: noindex باید از یک شرط بیاید (`...(x ? ...`),
        // نه یک noindexِ مطلق. اگر کسی `...` شرطی را بردارد و noindex را ثابت
        // کند، فهرستِ ساده‌ی محصولات از ایندکس بیرون می‌رود.
        expect(
          /\.\.\.\(deepFilter \? \{ robots: \{ index: false/.test(metaSrc),
          `صفحه‌ی ${page.express} فقط در فیلترهای عمیق noindex بود؛ ${page.next} این شرط را از دست داده`,
        ).toBe(true);
      } else {
        expect(
          /index:\s*false/.test(metaSrc),
          `صفحه‌ی ${page.express} در Express ایندکس‌شدنی است ولی ${page.next} آن را noindex می‌کند`,
        ).toBe(false);
      }

      // ۴) کانونیکال: در Express فقط چهار صفحه‌ی ایندکس‌شدنی کانونیکالِ صریح
      //    داشتند. این‌که کدام صفحه کانونیکال *بگیرد* هم مهم است: صفحه‌ی
      //    noindex با کانونیکال، پیامِ متناقض به گوگل می‌دهد.
      if (page.canonical) {
        expect(
          contains(metaSrc, "alternates: { canonical"),
          `صفحه‌ی ${page.express} در Express کانونیکال داشت ولی ${page.next} ندارد`,
        ).toBe(true);
      } else {
        expect(
          contains(metaSrc, "alternates: { canonical"),
          `صفحه‌ی ${page.express} در Express کانونیکال نداشت ولی ${page.next} یکی می‌سازد`,
        ).toBe(false);
      }
    });
  }

  it("قالبِ عنوانِ صفحه‌ی محصول همان الگولِ Express است (قیمت داخلِ عنوان)", () => {
    // Express (`product.js:373`):
    //   `${p.title} | خرید با قیمت ${PG.money(p.price)} تومان`
    // اگر قیمت از عنوان حذف شود، تبِ مرورگر بین چند محصولِ باز و نتایجِ
    // جست‌وجو بی‌خاصیت می‌شود.
    const src = nextSource("app/product/[id]/page.tsx");
    expect(contains(src, "| خرید با قیمت")).toBe(true);
    expect(contains(src, "تومان")).toBe(true);
  });

  it("آدرسِ نامعتبرِ محصول noindex است (soft-404 ایندکس نمی‌شود)", () => {
    // `getPublicProduct` در Express برای محصولِ ناموجود ۴۱۰ می‌داد. Next
    // نمی‌تواند ۴۱۰ بدهد (مستندشده در not-found همان مسیر)، پس کمترین کار
    // این است که صفحهٔ بی‌محتوا اصلاً ایندکس نشود. قبلاً شاخه‌ی «آدرسِ بی‌عدد»
    // (`/product/abc`) robots نداشت و ارثاً index می‌گرفت.
    const src = nextSource("app/product/[id]/page.tsx");
    const branches = [...src.matchAll(/isNaN[\s\S]{0,200}?robots:\s*{\s*index:\s*false/g)];
    expect(branches.length, "شاخه‌ی آدرسِ بی‌عدد باید robots noindex داشته باشد").toBeGreaterThan(0);
    // و شاخه‌ی محصولِ ناموجود هم
    expect(src.match(/index:\s*false/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("صفحه‌ی ۵۰۰ (مرزِ خطای مسیر) متنِ Escape نسخه‌ی Express را دارد", () => {
    // سه چیزی که در 500.html بود و در مرزِ خطای لاغرِ Next نبود.
    const err = nextSource("app/error.tsx");
    expect(contains(err, "خطای ۵۰۰")).toBe(true);
    expect(contains(err, "مشکلی موقت در سرور پیش آمد")).toBe(true);
    expect(contains(err, "سبد خرید و سفارش‌های شما سر جای خودشان امن")).toBe(true);
    expect(contains(err, "تلاش دوباره")).toBe(true);
    expect(contains(err, "tel:09113567409")).toBe(true);
    expect(contains(err, "wa.me/989113567409")).toBe(true);
  });

  it("صفحه‌ی ۴۰۴ دو راهِ خروج دارد (خانه + محصولات)", () => {
    const nf = nextSource("app/not-found.tsx");
    expect(contains(nf, "این صفحه پیدا نشد (۴۰۴)")).toBe(true);
    expect(contains(nf, "آدرس اشتباه است یا این صفحه جابه‌جا شده")).toBe(true);
    expect(contains(nf, 'href="/products"')).toBe(true);
  });

  it("قالبِ عنوانِ فهرست محصولات همان الگولِ Express است", () => {
    // Express (`products.js:306`): `${S.cat || 'همه‌ی محصولات'} — صفحه N`
    const src = nextSource("app/products/page.tsx");
    expect(contains(src, "همه‌ی محصولات")).toBe(true);
    expect(contains(src, "— صفحه")).toBe(true);
  });

  it("کانونیکالِ صفحه‌های noindex ساخته نمی‌شود و کانونیکالِ ریشه باقی است", () => {
    // این آزمون نگهبانِ همان تله‌ای است که در بازرسی پیدا شد: `alternates:
    // { canonical: "./" }` در layout، هر صفحه — از جمله ۴۰۴ — را صاحبِ
    // کانونیکال می‌کرد و صفحه‌ی ۴۰۴ به گوگل `/_not-found` را به‌عنوان
    // نسخه‌ی اصلیِ خود معرفی می‌کرد.
    const layout = nextSource("app/layout.tsx");
    expect(
      /alternates:\s*{\s*canonical/.test(layout),
      "layout نباید کانونیکالِ سراسری بدهد؛ هر صفحه‌ی ایندکس‌شدنی خودش می‌دهد",
    ).toBe(false);
    expect(contains(layout, '"max-image-preview": "large"')).toBe(true);
  });
});
