// ============================================================
// نگهبانِ متادیتای اشتراک‌گذاری — Express ↔ Next
// ============================================================
// چرا لازم شد: یک بازرسیِ HTTP نشان داد روی مبدأِ Next تقریباً همه‌ی صفحه‌ها
// فقط متای *عمومیِ* layout را می‌فرستند. نتیجه‌اش این بود که لینکِ
// `/products` در واتساپ/تلگرام با عنوانِ «پلاسکو گلی — فروشگاه محصولات
// پلاستیکی» و توضیحِ عمومی پیش‌نمایش داده می‌شد، در حالی که نسخه‌ی Express
// برای همان صفحه عنوان و توضیحِ مخصوص خودش را داشت. دلیلِ ساختاری‌اش این است
// که در Next، `openGraph`ِ یک صفحه **کلِ** `openGraph`ِ layout را جایگزین
// می‌کند (از جمله `siteName` و `locale`) — پس صفحه‌ای که فقط عنوان بدهد، بقیه
// را از دست می‌دهد.
//
// چرا سطحِ منبع و نه آزمونِ زنده: در CI هیچ سروری بالا نیست (همان دلیلی که در
// `seoParity.test.ts` نوشته شده). متنِ مرجع را از خودِ `frontend/*.html`
// می‌خوانیم و حضورِ همان رشته‌ها را در سورسِ صفحه‌ی متناظرِ Next می‌سنجیم.

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

/** یکسان‌سازی مثل بقیه‌ی نگهبان‌ها: نیم‌فاصله و نشانه‌های نامرئیِ جهت. */
const plain = (s: string) =>
  String(s).replace(/[\u200c\u200e\u200f]/g, "").replace(/\s+/g, " ").trim();

/** فقط کامنت‌های تمام‌خط و بلوکی (نه `//`های میانِ خط مثل `https://`). */
const stripCommentsJs = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

/** کامنت‌های HTML — وگرنه متنِ توضیحیِ خودِ فایل، مرجعِ جعلی می‌سازد. */
const stripCommentsHtml = (src: string) => src.replace(/<!--[\s\S]*?-->/g, " ");

function expressTags(file: string): Record<string, string> {
  const html = stripCommentsHtml(
    fs.readFileSync(path.join(EXPRESS_DIR, file), "utf8"),
  );
  const out: Record<string, string> = {};
  for (const m of html.matchAll(
    /<meta\s+(?:property|name)="((?:og|twitter)[^"]*)"\s+content="([^"]*)"/g,
  )) {
    out[m[1]] = plain(m[2]);
  }
  return out;
}

function nextSource(rel: string): string {
  const abs = path.join(NEXT_DIR, "src", rel);
  return plain(stripCommentsJs(fs.readFileSync(abs, "utf8")));
}

const contains = (haystack: string, needle: string) =>
  haystack.includes(plain(needle));

/**
 * هر صفحه‌ی Express که متای اشتراک‌گذاری داشت و مسیرِ متناظرش در Next.
 *
 * صفحه‌های noindex (سبد، ورود، حساب، ۴۰۴…) در Express هیچ og/twitter نداشتند،
 * پس اینجا هم سنجیده نمی‌شوند: وجودِ متای عمومیِ layout روی آن‌ها یک *اضافه*‌ی
 * بی‌ضرر است، نه واگرایی.
 *
 * `og:url` عمداً مقایسه نمی‌شود: در Express نشانیِ دنیای قدیم است
 * (`/products.html`) و در Next نشانیِ کانونیکِ امروز (`/products`). چیزی که
 * مهم است این است که Next اصلاً `.html` تولید نکند — در آزمونِ آخر می‌آید.
 */
const PAGES: { express: string; next: string; titleInSource?: string }[] = [
  { express: "index.html", next: "app/page.tsx" },
  {
    express: "products.html",
    next: "app/products/page.tsx",
    // عنوان در Next از `base` ساخته می‌شود (نامِ دسته یا «همه‌ی محصولات»)، پس
    // خودِ رشته‌ی کاملِ Express عیناً در سورس نیست — الگو سنجیده می‌شود.
    // (og:title و twitter:title هر دو همین را می‌گیرند.)
    titleInSource: "| پلاسکو گلی",
  },
  { express: "terms.html", next: "app/terms/page.tsx" },
  { express: "wholesale.html", next: "app/wholesale/page.tsx" },
];

const describeExpress = HAS_ORACLE ? describe : describe.skip;

describeExpress("متادیتای اشتراک‌گذاری صفحه‌ها با Express یکی است", () => {
  for (const page of PAGES) {
    it(`${page.express} → ${page.next}`, () => {
      const tags = expressTags(page.express);
      const src = nextSource(page.next);

      // نگهبانِ خودِ آزمون: اگر استخراجِ متا خراب شود، مقایسه‌ی خالی هم سبز
      // می‌شود. هر چهار صفحه‌ی Express این کلیدها را دارند.
      for (const key of ["og:title", "og:description", "twitter:title", "twitter:card"]) {
        expect(tags[key], `${page.express} در Express «${key}» نداشت`).toBeTruthy();
      }

      // ۱) متن‌ها: هر چه Express می‌فرستاد باید در سورسِ Next باشد.
      expect(
        contains(src, page.titleInSource ?? tags["og:title"]),
        `og:titleِ «${tags["og:title"]}» در ${page.next} نیست`,
      ).toBe(true);
      expect(
        contains(src, tags["og:description"]),
        `og:descriptionِ «${tags["og:description"]}» در ${page.next} نیست`,
      ).toBe(true);
      expect(
        contains(src, page.titleInSource ?? tags["twitter:title"]),
        `twitter:titleِ «${tags["twitter:title"]}» در ${page.next} نیست`,
      ).toBe(true);
      expect(
        contains(src, tags["twitter:description"] || ""),
        `twitter:descriptionِ «${tags["twitter:description"]}» در ${page.next} نیست`,
      ).toBe(true);

      // ۱.۵) twitter دقیقاً همان است که Express می‌فرستاد: اگر مقدارش با og
      // یکی است، سورس نباید `twitterTitle`/`twitterDescription`ِ جداگانه
      // بدهد (وگرنه ممکن است چیزی جز مقدارِ درست بدهد)؛ و اگر فرق دارد،
      // همان مقدار باید صریح در سورس باشد. تله‌ای که این نگهبان می‌گیرد و یک
      // بار گرفته شد: در `index.html` عنوانِ twitter کوتاه‌تر از `<title>`
      // است («…خانه» در برابر «…خانه و آشپزخانه») و فرضِ اولیه اشتباه بود.
      for (const [key, prop] of [
        ["twitter:title", "twitterTitle"],
        ["twitter:description", "twitterDescription"],
      ]) {
        const own = tags[key];
        const ogKey = key.replace("twitter:", "og:");
        if (own && own !== tags[ogKey]) {
          expect(
            contains(src, `${prop}:`),
            `${page.next} باید «${prop}» را صریح بدهد («${own}» ≠ «${tags[ogKey]}»)`,
          ).toBe(true);
          expect(
            contains(src, own),
            `مقدارِ «${prop}» («${own}») در ${page.next} نیست`,
          ).toBe(true);
        } else {
          expect(
            contains(src, `${prop}:`),
            `${page.next} نباید «${prop}» بدهد — Express همان مقدارِ og را داشت`,
          ).toBe(false);
        }
      }

      // ۲) ساختار: هر صفحه باید از سازنده‌ی مشترک استفاده کند. بدونِ این،
      //    هر کس می‌تواند `openGraph`ِ دستی بگذارد و `siteName`/`locale`/
      //    ابعادِ عکس بی‌صدا بروند — همان واگراییِ اصلی.
      expect(
        contains(src, "pageSocial({"),
        `${page.next} از pageSocial استفاده نمی‌کند`,
      ).toBe(true);

      // ۳) کارتِ توییتر: `products.html` در Express کارتِ بزرگ داشت و بقیه
      //    کوچک. اگر کسی این را یکدست کند، پیش‌نمایشِ لینک عوض می‌شود.
      const card = tags["twitter:card"];
      if (card === "summary_large_image") {
        expect(
          /card:\s*"summary_large_image"/.test(src),
          `${page.next} باید کارتِ summary_large_image بدهد`,
        ).toBe(true);
      } else {
        expect(
          /card:\s*"summary_large_image"/.test(src),
          `${page.next} نباید کارتِ بزرگ بدهد (Express «${card}» می‌داد)`,
        ).toBe(false);
      }
    });
  }

  it("`og:type` همان است که Express می‌داد (article برای قوانین، website برای بقیه)", () => {
    expect(expressTags("terms.html")["og:type"]).toBe("article");
    expect(nextSource("app/terms/page.tsx")).toMatch(/type:\s*"article"/);
    // بقیه هیچ `type`ی نمی‌دهند و پیش‌فرضِ سازنده (website) را می‌گیرند.
    expect(nextSource("lib/social.ts")).toMatch(/type\s*=\s*"website"/);
  });

  it("مقادیرِ ثابتِ تصویر و sitename مثل Express هستند", () => {
    // og:image در Express روی دامنه‌ی نمونه بود؛ چیزی که مهم است مسیرش است.
    const img = expressTags("index.html")["og:image"];
    const imgPath = new URL(img).pathname;
    const site = nextSource("lib/site.ts");
    expect(contains(site, imgPath), `مسیرِ ${imgPath} در lib/site.ts نیست`).toBe(true);
    expect(contains(site, expressTags("index.html")["og:image:alt"])).toBe(true);
    expect(contains(site, expressTags("index.html")["og:site_name"])).toBe(true);
    // ابعادِ اعلام‌شده باید همان عددِ Express باشد (۵۱۲×۵۱۲).
    expect(site).toMatch(/OG_IMAGE_SIZE\s*=\s*{\s*width:\s*512,\s*height:\s*512\s*}/);
    expect(expressTags("index.html")["og:image:width"]).toBe("512");
    expect(nextSource("lib/social.ts")).toMatch(/locale:\s*"fa_IR"/);
  });

  it("صفحه‌ی محصول تگ‌های product که Express تزریق می‌کرد را دارد", () => {
    const src = nextSource("app/product/[id]/page.tsx");
    // og:type=product را **نمی‌توان** از آبجکتِ Metadata داد: خودِ Next مقدارِ
    // ناشناس را در زمانِ build رد می‌کند (Invalid OpenGraph type). پس تگِ
    // واقعی است — و اگر کسی دوباره آن را به `pageSocial` بدهد، build می‌شکند.
    expect(src).toMatch(/<meta property="og:type" content="product" \/>/);
    expect(src, "type: \"product\" به pageSocial می‌رود و build را می‌شکند").not.toMatch(
      /type:\s*"product"/,
    );
    expect(src).toMatch(/property="product:price:amount"/);
    expect(src).toMatch(/property="product:price:currency"/);
    expect(src).toMatch(/og:price:standard_amount/);
    // Express این چهار مورد را در og/twitter داشت و Next نداشت.
    expect(src).toMatch(/twitterDescription:\s*null/);
    expect(src).toMatch(/imageAlt:\s*brandedTitle/);
    // و `max-image-preview:large`ِ ریشه پس از جایگزینیِ robotsِ صفحه باید بماند.
    expect(src).toMatch(/"max-image-preview":\s*"large"/);
    // توضیحِ متا عیناً فرمولِ روتِ Express است (نه متنِ بازاریِ تازه).
    expect(src).toMatch(/خرید \$\{product\.title\}/);
    expect(src).toMatch(/قیمت: \$\{priceFa\} تومان\./);
    // مسیر میانهٔ Breadcrumb نامِ دسته است، مثل Express.
    expect(src).toMatch(/name:\s*product\.category/);
  });

  it("هیچ صفحه‌ای `og:url`ِ دنیای `.html` نمی‌سازد", () => {
    // `products.html`/`terms.html` روی مبدأِ Next با ۳۰۷ به مسیرِ امروزی
    // می‌روند؛ اگر og:url همان نشانیِ قدیمی باشد، به گوگل و به پیش‌نمایشِ لینک
    // یک نشانیِ ریدایرکت‌شده معرفی می‌کنیم.
    for (const page of PAGES) {
      expect(nextSource(page.next)).not.toMatch(
        /(?:path|url):\s*["'`][^"'`]*\.html/,
      );
    }
  });
});
