import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ============================================================
// نگهبانِ برابریِ متنِ سبد، پرداخت و فیلترها (Express ↔ Next)
// ============================================================
// چرا این فایل لازم شد: هم‌راست‌کردنِ واژه‌به‌واژهٔ این سه ناحیه با Express
// دستی و با مقایسهٔ متنِ رندرشده انجام شد. آن کار یک ضعفِ ساختاری دارد —
// چیزی که *به‌دست آمده* هیچ‌جا ثبت نشده بود. یعنی فردا کسی می‌تواند برچسبی را
// به «قیمت (تومان):» برگرداند یا ردیفی را جابه‌جا کند و هیچ typecheck و هیچ
// lintی هم نمی‌گیرد، چون رشته است نه قرارداد. الگوِ همین‌جا همان الگوی
// `shellParity`/`seoParity` است: **منبعِ حقیقت خودِ `frontend/` است** و
// انتظارها از آن بیرون کشیده می‌شوند، نه اینکه دستی در آزمون تکرار شوند.
//
// دو جهت سنجیده می‌شود، چون هر کدام یک جور خرابی را می‌گیرد:
//
//   ۱. **چیزهایی که باید باشند** — هر برچسبی که Express می‌نویسد باید عیناً
//      در فایلِ Nextِ متناظر باشد. الگویِ استخراج روی سورسِ Express هم آزموده
//      می‌شود؛ پس اگر روزی خودِ Express عوض شود، اینجا قرمز می‌شود و می‌گوید
//      «منبعِ حقیقت عوض شده» — نه اینکه بی‌صدا سبز بماند.
//   ۲. **چیزهایی که نباید برگردند** — واژه‌های واگرایی که در همین کار حذف
//      شدند. برای اینکه «حذفِ اشتباهی» را هم بگیریم، همان رشته‌ها در سورسِ
//      Express هم جست‌وجو می‌شوند: اگر یکی از آن‌ها آن‌جا وجود داشت، یعنی
//      اصطلاحِ درستِ Express بوده و ما اشتباه یکسان‌سازی کرده‌ایم.
//
// نکتهٔ پیاده‌سازی: پیش از جهتِ دوم، **کامنت‌ها خنثی می‌شوند**. کامنتی که
// توضیح می‌دهد «قبلاً «مبلغ نهایی» بود، حالا «مبلغ قابل پرداخت» است» ناچاراً
// همان واژهٔ ممنوعه را می‌نویسد؛ اگر کامنت را ارجاع بشماریم، نگهبان روی چیزی
// قرمز می‌شود که خودش محافظش است (همان درسی که نگهبانِ پنلِ بازنشسته داد).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
const REPO_DIR = path.resolve(NEXT_DIR, "..");
const EXPRESS_DIR = path.join(REPO_DIR, "frontend");

const HAS_EXPRESS = fs.existsSync(path.join(EXPRESS_DIR, "cart.html"));

// ---------- فایل‌های دو طرف ----------
const CART_HTML = "cart.html";
const CART_JS = "js/cart.js";
const CHECKOUT_HTML = "checkout.html";
const CHECKOUT_JS = "js/checkout.js";
const PRODUCTS_HTML = "products.html";
const PRODUCTS_JS = "js/products.js";

const EXPRESS_CORPUS = [
  CART_HTML,
  CART_JS,
  CHECKOUT_HTML,
  CHECKOUT_JS,
  PRODUCTS_HTML,
  PRODUCTS_JS,
];

const NEXT_CART = "src/components/CartContent.tsx";
const NEXT_CART_PAGE = "src/app/cart/page.tsx";
const NEXT_CHECKOUT = "src/components/CheckoutContent.tsx";
const NEXT_FILTER = "src/components/FilterBar.tsx";
const NEXT_PRODUCTS = "src/app/products/page.tsx";

const NEXT_CORPUS = [NEXT_CART, NEXT_CART_PAGE, NEXT_CHECKOUT, NEXT_FILTER, NEXT_PRODUCTS];

const cache = new Map<string, string>();
function readExpress(rel: string): string {
  const hit = cache.get(`e:${rel}`);
  if (hit !== undefined) return hit;
  const text = fs.readFileSync(path.join(EXPRESS_DIR, rel), "utf8");
  cache.set(`e:${rel}`, text);
  return text;
}
function readNext(rel: string): string {
  const hit = cache.get(`n:${rel}`);
  if (hit !== undefined) return hit;
  const text = fs.readFileSync(path.join(NEXT_DIR, rel), "utf8");
  cache.set(`n:${rel}`, text);
  return text;
}

/**
 * متنِ قابلِ‌مشاهده سنجیده می‌شود، نه چیدمانِ کد: در سورسِ Next یک جمله ممکن است
 * روی چند خط شکسته باشد. پس فاصله‌ها یکسان می‌شوند — ولی **نیم‌فاصله و «ی/هٔ»
 * دست‌نخورده می‌مانند**، چون تفاوتِ همان‌ها بود که این کار را لازم کرد.
 */
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** کامنت‌های سورس (خطی، بلوکی و JSX) خنثی می‌شوند — کاربر آن‌ها را نمی‌بیند. */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // `://` را نمی‌شود ابتدای کامنت گرفت، وگرنه آدرسِ کاملِ https خراب می‌شود.
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

type Claim = {
  /** برای پیامِ خطا */
  what: string;
  /** فایلِ Express که این رشته در آن است */
  from: string;
  /** باید در سورسِ Express بخورد؛ در غیر این صورت «منبعِ حقیقت عوض شده» */
  re: RegExp;
  /** فایلی که باید همان متن را داشته باشد */
  to: string;
  /**
   * برای وقتی که متنِ Express پویاست یا کوتاه است و مقایسهٔ تحت‌اللفظی
   * بی‌معنی می‌شود (مثلِ placeholderِ تک‌نویسه‌ای): الگو روی سورسِ Next.
   */
  nextRe?: RegExp;
};

// ============================================================
// ۱) سبد خرید
// ============================================================
const CART_CLAIMS: Claim[] = [
  { what: "سرتیترِ صفحه", from: CART_HTML, re: /<h1>([^<]+)<\/h1>/, to: NEXT_CART_PAGE },
  { what: "سرتیترِ حالتِ خالی", from: CART_HTML, re: /<h3>([^<]*خالیه)<\/h3>/, to: NEXT_CART },
  {
    what: "پیامِ حالتِ خالی",
    from: CART_HTML,
    re: /<p>([^<]*برید یه سر[^<]*)<\/p>/,
    to: NEXT_CART,
  },
  {
    what: "دکمهٔ حالتِ خالی",
    from: CART_HTML,
    re: /<a href="\/products.html" class="btn btn-primary">([^<]+)<\/a>/,
    to: NEXT_CART,
  },
  { what: "سرتیترِ خلاصهٔ سفارش", from: CART_HTML, re: /<h3>([^<]*سفارش)<\/h3>/, to: NEXT_CART },
  { what: "ردیفِ تعداد", from: CART_HTML, re: /<span>(تعداد اقلام)<\/span>/, to: NEXT_CART },
  { what: "ردیفِ جمعِ کالاها", from: CART_HTML, re: /<span>(جمع کالاها)<\/span>/, to: NEXT_CART },
  {
    what: "ردیفِ سودِ تخفیف",
    from: CART_HTML,
    re: /<span>(سود شما از تخفیف[^<]*)<\/span>/,
    to: NEXT_CART,
  },
  { what: "ردیفِ هزینهٔ ارسال", from: CART_HTML, re: /<span>(هزینه ارسال)<\/span>/, to: NEXT_CART },
  {
    what: "ردیفِ مبلغِ نهایی",
    from: CART_HTML,
    re: /<span>(مبلغ قابل پرداخت)<\/span>/,
    to: NEXT_CART,
  },
  {
    what: "placeholderِ کدِ تخفیف",
    from: CART_HTML,
    re: /placeholder="(کد تخفیف دارید؟)"/,
    to: NEXT_CART,
  },
  { what: "aria-labelِ کدِ تخفیف", from: CART_HTML, re: /aria-label="(کد تخفیف)"/, to: NEXT_CART },
  {
    what: "aria-labelِ برداشتنِ کد",
    from: CART_HTML,
    re: /aria-label="(برداشتن کد تخفیف)"/,
    to: NEXT_CART,
  },
  {
    what: "دکمهٔ اعمالِ کد",
    from: CART_HTML,
    re: /class="coupon-apply" id="couponApply">([^<]+)<\/button>/,
    to: NEXT_CART,
  },
  {
    what: "قلمِ اطمینان ۱",
    from: CART_HTML,
    re: /<\/svg> ([^<]*پرداخت امن[^<]*)<\/li>/,
    to: NEXT_CART,
  },
  {
    what: "قلمِ اطمینان ۲",
    from: CART_HTML,
    re: /<\/svg> (ارسال داخل شهر[^<]*)<\/li>/,
    to: NEXT_CART,
  },
  {
    what: "قلمِ اطمینان ۳",
    from: CART_HTML,
    re: /<\/svg> (۷ روز مهلت[^<]*)<\/li>/,
    to: NEXT_CART,
  },
  {
    what: "دکمهٔ رفتن به پرداخت",
    from: CART_HTML,
    re: /<use href="#i-arrow-right"\/><\/svg> ([^<]+)/,
    to: NEXT_CART,
  },
];

// ============================================================
// ۲) پرداخت
// ============================================================
const CHECKOUT_CLAIMS: Claim[] = [
  {
    what: "eyebrowِ خلاصهٔ سفارش",
    from: CHECKOUT_HTML,
    re: /<span class="eyebrow"><span class="dot"><\/span> ([^<]+)<\/span>/,
    to: NEXT_CHECKOUT,
  },
  { what: "سرتیترِ ستونِ سفارش", from: CHECKOUT_HTML, re: /<h2>([^<]+)<\/h2>/, to: NEXT_CHECKOUT },
  {
    what: "ردیفِ سودِ تخفیف",
    from: CHECKOUT_HTML,
    re: /<span>(سود شما از تخفیف[^<]*)<\/span>/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "ردیفِ هزینهٔ ارسال",
    from: CHECKOUT_HTML,
    re: /<span>(هزینه ارسال)<\/span>/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "ردیفِ مبلغِ نهایی",
    from: CHECKOUT_HTML,
    re: /<span>(مبلغ قابل پرداخت)<\/span>/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "سرتیترِ فرمِ آدرس",
    from: CHECKOUT_HTML,
    re: /<b class="fs-15">([^<]+)<\/b>/,
    to: NEXT_CHECKOUT,
  },
  // برچسب‌های فرم: Express فرم را با برچسب می‌ساخت و Next فقط placeholder
  // داشت، پس همین‌ها متنِ دو نسخه را از هم جدا می‌کردند.
  ...[
    ["fullName", "نام گیرنده"],
    ["addrPhone", "شمارهٔ تماس"],
    ["province", "استان"],
    ["city", "شهر"],
    ["addressLine", "آدرسِ کامل"],
    ["postalCode", "کدِ پستی"],
  ].map(([id, what]) => ({
    what: `برچسبِ ${what}`,
    from: CHECKOUT_HTML,
    re: new RegExp(`<label for="${id}">([^<]+)</label>`),
    to: NEXT_CHECKOUT,
  })),
  {
    what: "placeholderِ شمارهٔ تماس",
    from: CHECKOUT_HTML,
    re: /id="addrPhone"[^>]*placeholder="([^"]+)"/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "placeholderِ استان",
    from: CHECKOUT_HTML,
    re: /id="province"[^>]*placeholder="([^"]+)"/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "دکمهٔ پرداخت",
    from: CHECKOUT_HTML,
    re: /id="payBtn">\s*<svg><use href="#i-lock"\/><\/svg> ([^<]+)/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "یادداشتِ زیرِ دکمه",
    from: CHECKOUT_HTML,
    re: /<p class="form-note">([^<]+)<\/p>/,
    to: NEXT_CHECKOUT,
  },
  // این چهار قلم در جاوااسکریپتِ Express هستند، نه در HTML — چون رفتارند.
  {
    what: "برچسبِ آدرسِ تازه",
    from: CHECKOUT_JS,
    re: /<b>(\+ استفاده از آدرس جدید)<\/b>/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "توستِ ویرایشِ آدرس",
    from: CHECKOUT_JS,
    re: /PG\.toast\('([^']*ذخیره می‌شود)'/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "متنِ در حال رفتن به درگاه",
    from: CHECKOUT_JS,
    re: /<\/svg> (در حال انتقال به درگاه…)/,
    to: NEXT_CHECKOUT,
  },
  {
    what: "پیامِ تعطیلیِ فروشگاه",
    from: CHECKOUT_JS,
    re: /'([^']*تعطیل است[^']*)'/,
    to: NEXT_CHECKOUT,
  },
];

// ============================================================
// ۳) فیلترها و فهرست
// ============================================================
const FILTER_CLAIMS: Claim[] = [
  {
    what: "سرتیترِ بازهٔ قیمت",
    from: PRODUCTS_HTML,
    re: /<h3>([^<]*قیمت)<\/h3>/,
    to: NEXT_FILTER,
  },
  {
    what: "placeholderِ کمینه",
    from: PRODUCTS_HTML,
    re: /id="plMin"[^>]*placeholder="۰"/,
    to: NEXT_FILTER,
    // تک‌نویسه‌ای است، پس با متنِ «۰» تنها سنجیده نمی‌شود.
    nextRe: /placeholder="۰"/,
  },
  {
    what: "placeholderِ بیشینه",
    from: PRODUCTS_HTML,
    re: /id="plMax"[^>]*placeholder="—"/,
    to: NEXT_FILTER,
    nextRe: /placeholder="—"/,
  },
  {
    what: "دکمهٔ اعمالِ قیمت",
    from: PRODUCTS_HTML,
    re: /id="plPriceApply">([^<]+)<\/button>/,
    to: NEXT_FILTER,
  },
  {
    what: "برچسبِ فقط موجود",
    from: PRODUCTS_HTML,
    re: /<span>(فقط کالاهای موجود)<\/span>/,
    to: NEXT_FILTER,
  },
  ...[
    ["newest", "جدیدترین"],
    ["price-asc", "ارزان‌ترین"],
    ["price-desc", "گران‌ترین"],
    ["title", "نام"],
    ["stock", "موجودی"],
  ].map(([value, what]) => ({
    what: `گزینهٔ مرتب‌سازی «${what}»`,
    from: PRODUCTS_HTML,
    re: new RegExp(`<option value="${value}">([^<]+)</option>`),
    to: NEXT_FILTER,
  })),
  {
    // Express عمداً **دو** برچسبِ متفاوت برای همین فیلتر دارد و Next هم باید
    // همان دو را داشته باشد: چک‌باکسِ ستونِ فیلتر «فقط کالاهای موجود» است
    // (products.html) و برچسبِ تراشهٔ فیلترِ فعال «فقط موجود»
    // (products.js:111). یکی‌کردنِ این دو، خودش یک واگراییِ تازه است — و همین
    // آزمون بود که آن را گرفت.
    what: "تراشهٔ فیلترِ موجودی",
    from: PRODUCTS_JS,
    re: /label: '(فقط موجود)'/,
    to: NEXT_PRODUCTS,
  },
];

// ============================================================
// ۴) واگرایی‌هایی که بسته شدند و نباید برگردند
// ============================================================
// هر قلم یک بار روی سورسِ Next (باید نباشد) و یک بار روی سورسِ Express
// (هم نباید باشد — وگرنه یعنی اشتباه یکسان‌سازی کرده‌ایم) سنجیده می‌شود.
const RESTORED: { what: string; re: RegExp }[] = [
  { what: "برچسبِ «مبلغ نهایی» در پرداخت", re: /مبلغ نهایی/ },
  { what: "برچسبِ «قیمت (تومان)» در فیلترها", re: /قیمت \(تومان\)/ },
  { what: "برچسبِ کوتاهِ «قابل پرداخت» به‌جای «مبلغ قابل پرداخت»", re: />قابل پرداخت</ },
  { what: "ردیفِ «جمع اقلام» به‌جای «جمع کالاها»", re: /جمع اقلام/ },
  { what: "«صرفه‌جویی شما» به‌جای «سود شما از تخفیف‌ها»", re: /صرفه‌جویی شما/ },
  { what: "خطِ «محصول پیدا شد» به‌جای «کالا»", re: /محصول پیدا شد/ },
  { what: "حالتِ خالیِ «محصولی با این مشخصات پیدا نشد»", re: /محصولی با این مشخصات پیدا نشد/ },
  { what: "متنِ بارگذاریِ «بارگذاری فیلترها…»", re: /بارگذاری فیلترها/ },
  { what: "گزینهٔ مرتب‌سازی «الفبایی»", re: />الفبایی</ },
  { what: "دکمهٔ «+ ثبت آدرس جدید»", re: /\+ ثبت آدرس جدید/ },
  { what: "پیامِ «هیچ آدرسی ثبت نشده»", re: /هیچ آدرسی ثبت نشده/ },
  { what: "خطِ «ارسال به:» در ستونِ پرداخت", re: /ارسال به:/ },
  // «خلاصهٔ» با همزهٔ ترکیبی (U+0654) در برابر «خلاصه‌ی» با نیم‌فاصله — همان
  // تفاوتِ نامرئی‌ای که فقط با مقایسهٔ متنِ رندرشده پیدا شد.
  { what: "«خلاصهٔ سفارش» با همزهٔ ترکیبی", re: /خلاصه\u0654/ },
];

const describeExpress = HAS_EXPRESS ? describe : describe.skip;

describeExpress("متنِ سبد، پرداخت و فیلترها بین Express و Next یکی است", () => {
  for (const [label, claims] of [
    ["سبد خرید", CART_CLAIMS],
    ["پرداخت", CHECKOUT_CLAIMS],
    ["فیلترها", FILTER_CLAIMS],
  ] as const) {
    it(`هر برچسبِ ${label} که Express می‌نویسد در Next هست`, () => {
      // نگهبانِ خودِ آزمون: اگر استخراج خراب شود، فهرستِ خالی هم سبز می‌شود.
      expect(claims.length, "فهرستِ ادعاها خالی است").toBeGreaterThanOrEqual(5);

      for (const c of claims) {
        const m = readExpress(c.from).match(c.re);
        expect(
          m,
          `منبعِ حقیقت عوض شده: الگوی «${c.what}» در frontend/${c.from} نمی‌خورد`,
        ).toBeTruthy();

        const next = flat(stripComments(readNext(c.to)));
        if (c.nextRe) {
          expect(c.nextRe.test(next), `${c.what} → ${c.to}`).toBe(true);
        } else {
          const expected = flat((m![1] ?? "").replace(/<[^>]*>/g, ""));
          expect(
            next,
            `${c.what}: «${expected}» (از frontend/${c.from}) در ${c.to} نیست یا عوض شده`,
          ).toContain(expected);
        }
      }
    });
  }

  it("راهنمای بازهٔ قیمت همان شکلِ Express را دارد (عدد پویاست، پس شکل سنجیده می‌شود)", () => {
    // `products.js:132` → «ارزان‌ترین ۴۲٬۰۰۰ — گران‌ترین ۶۸۹٬۰۰۰ تومان». عدد از
    // facets می‌آید، پس فقط چیدمانِ واژه‌ها و جداکننده مقایسه می‌شود.
    expect(
      readExpress(PRODUCTS_JS),
      "راهنمای قیمت در products.js عوض شده",
    ).toMatch(
      /ارزان‌ترین \$\{PG\.money\(FACETS\.minPrice\)\} — گران‌ترین \$\{PG\.money\(FACETS\.maxPrice\)\} تومان/,
    );
    expect(flat(readNext(NEXT_FILTER))).toMatch(
      /ارزان‌ترین \{toFa\([^}]*\)\} — گران‌ترین \{toFa\([^}]*\)\} تومان/,
    );
  });

  it("واگرایی‌هایی که بسته شدند، به سورسِ Next برنگشتند", () => {
    for (const file of NEXT_CORPUS) {
      const next = flat(stripComments(readNext(file)));
      for (const r of RESTORED) {
        expect(r.re.test(next), `${r.what} به ${file} برگشت`).toBe(false);
      }
    }
  });

  it("همان واژه‌ها در Express هم نبودند (پس حذفشان اشتباه یکسان‌سازی نبود)", () => {
    // اگر یکی از این‌ها در Express وجود داشته باشد، یعنی اصطلاحِ درست آن‌جا
    // همان بوده و ما به‌اشتباه عوضش کرده‌ایم — این آزمون دقیقاً همان را می‌گیرد.
    for (const file of EXPRESS_CORPUS) {
      const exp = flat(readExpress(file));
      for (const r of RESTORED) {
        expect(r.re.test(exp), `${r.what} در frontend/${file} هست — یکسان‌سازی اشتباه بود`).toBe(
          false,
        );
      }
    }
  });
});
