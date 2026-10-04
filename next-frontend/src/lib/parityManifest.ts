// ============================================================
// مانیفستِ برابریِ فروشگاه — Express ↔ Next
// ============================================================
// این فایل تنها منبعِ حقیقتِ «کجایِ فروشگاهِ Next با Express فرق دارد» است.
// هر صفحهٔ فروشگاهِ Express با همتایش در Next جفت می‌شود و چهار محور سنجیده
// می‌شود:
//
//   • متن (text)          — جمله‌های Express در HTMLِ رندرشدهٔ Next چقدر پیدا
//                            می‌شوند؛ هر جملهٔ گم‌شده باید یا اصلاح شود یا
//                            همین‌جا با needle اعلام شده باشد.
//   • متادیتا (metadata)  — عنوان، توضیح، robots، canonical، og:*, twitter:card
//   • کدِ HTTP (http)     — کدِ وضعیتِ دو طرف، ۴۱۰ محصولِ ناموجود، ۴۰۴
//   • قابلیت (capability) — مسیرهای قدیمیِ .html، دروازهٔ ورود، دارایی‌های استاتیک
//
// دو مصرف‌کننده دارد:
//   • `src/app/parityManifest.test.ts` — گاردِ ساختاری: کامل‌بودنِ پوشش،
//     وجودِ فایل‌ها، و این‌که هر واگراییِ اعلام‌شده دلیلِ نوشته‌شده دارد.
//   • `scripts/parity-storefront.mjs` — اجراکنندهٔ زنده روی دو سرورِ محلی:
//     همه‌ی محورها را واقعاً می‌گیرد و هر اختلافی که در این فایل اعلام نشده
//     باشد را «واگراییِ تازه» می‌داند و با کدِ خطا بیرون می‌آید.
//
// قاعدهٔ طلایی: هر واگراییِ *شناخته‌شده* باید همین‌جا اعلام شود — با دلیل،
// و با یکی از دو حالت:
//   • `accepted` — آگاهانه پذیرفته‌شده (بهبودِ افزوده، مکانیزمِ متفاوت با
//                   نتیجهٔ یکسان، …)
//   • `open`     — بدهیِ باز: اختلافِ واقعی که هنوز تصمیم/اصلاحی نگرفته.
// اجراکننده هر دو را در گزارش می‌آورد (open را پررنگ‌تر) و فقط «واگراییِ
// تازه» را قرمز می‌کند. پس اگر فردا کسی متنی را عوض کند، یا اجراکننده قرمز
// می‌شود یا باید آگاهانه این‌جا اعلامش کند — همان کاری که برای گاردهای
// منبع (copyParity، seoParity، shellParity) هم می‌کنیم.
//
// مسیر فایل‌ها: `files.express` نسبت به `frontend/` و `files.next` نسبت به
// `next-frontend/` است (ریشهٔ فروشگاه). آدرس‌ها نسبت به ریشهٔ همان سرور.

export type RenderMode =
  /** HTMLِ کامل و سمتِ سرور — مقایسهٔ متن و متادیتا کامل است. */
  | "server"
  /** متنِ بخشی از صفحه سمتِ کلاینت ساخته می‌شود؛ مقایسهٔ زنده فقط پوسته را می‌گیرد. */
  | "client"
  /** پاسخِ ریدایرکت است (مثلاً دروازهٔ ورود)؛ فقط کدِ وضعیت سنجیده می‌شود. */
  | "redirect"
  /** صفحه‌ای که زنده قابلِ تحریک نیست (خطای ۵۰۰)؛ فقط ساختار و فایل‌ها سنجیده می‌شوند. */
  | "source";

export type DivState =
  /** آگاهانه پذیرفته شده — دلیلی دارد که همین‌جا نوشته شده. */
  | "accepted"
  /** بدهیِ باز — اختلافِ واقعیِ باقی‌مانده. */
  | "open";

/** فیلدهای متادیتایی که اجراکنندهٔ زنده دوبه‌دو مقایسه می‌کند. */
export const META_FIELDS = [
  "title",
  "description",
  "robots",
  "canonical",
  "og:title",
  "og:description",
  "og:type",
  "twitter:card",
] as const;
export type MetaField = (typeof META_FIELDS)[number];

export interface MetaDiff {
  field: MetaField;
  state: DivState;
  reason: string;
}

/**
 * قاعدهٔ «جملهٔ گم‌شدهٔ اعلام‌شده».
 * هر جمله‌ای از Express که در Next پیدا نشود، اگر **شاملِ** یکی از این
 * needleها باشد اعلام‌شده حساب می‌شود؛ وگرنه واگراییِ تازه است.
 */
export interface MissRule {
  needle: string;
  state: DivState;
  reason: string;
  /**
   * `static` = needle در سورسِ Express روی دیسک پیدا می‌شود (گارد آن را
   * بررسی می‌کند). `data` = متن از دیتابیس می‌آید و در سورس نیست (مثل
   * عنوانِ خودِ محصول)؛ فقط اجراکنندهٔ زنده می‌تواند بسنجدش.
   */
  source: "static" | "data";
}

export interface Probe {
  id: string;
  url: string;
  express: number;
  next: number;
  /** محورِ سنجش: کدِ وضعیتِ خالص یا قابلیتِ رفتاری. */
  axis: "http" | "capability";
  state: DivState;
  reason: string;
}

export interface ParityPage {
  id: string;
  label: string;
  express: { url: string; status: number };
  next: { url: string; status: number };
  mode: RenderMode;
  /**
   * کفِ پوششِ متن (نسبتِ جمله‌های Express که در HTMLِ Next پیدا می‌شوند).
   * عددها در ۲۰۲۶-۱۰-۰۴ روی دو سرورِ محلی اندازه‌گیری شده‌اند و عمداً کمی
   * پایین‌تر از مقدارِ دیده‌شده‌اند: هدف گرفتنِ *افت* است، نه قفل‌کردنِ رقم.
   */
  textFloor: number;
  misses: MissRule[];
  meta: MetaDiff[];
  probes: Probe[];
  files: { express: string[]; next: string[] };
  /** وقتی کدِ وضعیتِ دو طرف یکی نیست، دلیلِ اعلام‌شده الزامی است. */
  statusReason?: { state: DivState; reason: string };
}

// ============================================================
// دلیل‌های مشترک — یک‌بار نوشته می‌شوند و صفحه‌ها به آن‌ها ارجاع می‌دهند تا
// دلیل‌ها از هم جدا نیفتند.
// ============================================================

const WHY = {
  clientCategories:
    "دسته‌ها در Next از APIِ زنده می‌آیند (CatMenu و MobileDrawer از /api/shop/categories، FilterBar از خودِ صفحه) و متنِ نهایی سمتِ کلاینت ساخته می‌شود؛ Express فهرستِ ثابتِ شش‌تایی را در HTMLِ هر صفحه تکرار کرده بود. نگهبانِ پوسته (shellParity) وجودِ همین منوها را در سورس می‌سنجد.",
  clientRender:
    "کامپوننتِ کلاینت این متن را بعد از hydrate (و اغلب بعد از پاسخِ API) می‌سازد؛ جمله‌ها در سورسِ Next هستند و گاردهای منبع قفلشان کرده‌اند، ولی در HTMLِ اولیه نمی‌آیند.",
  clientLoading:
    "حالتِ بارگذاری/خالی: رندرِ اولیه عمداً جای‌نگه‌دار نشان می‌دهد تا داده برسد؛ Express همان متن را ثابت در HTML داشت.",
  heroOpen:
    "هیروی صفحهٔ اصلی در مهاجرت بازنویسی شد و هیچ‌کدام از متن‌های Express را ندارد (سرتیتر، لید، دکمه‌ها، چیپ‌های اعتماد). متنِ غایب همین‌جا فهرست شده — تصمیم/اصلاحش بدهیِ باز است.",
  tickerOpen:
    "نوارِ متحرکِ اعتمادِ Express (شش جمله) در Next نیامده؛ از آن‌ها فقط «ارسال سریع به سراسر کشور» در نوارِ بالای هدر هست. جایگزینش (feature-grid) متنِ کوتاه‌تری دارد.",
  homeCopyOpen:
    "متنِ این بخش در Next بازنویسی شده (یا بخش اصلاً نیامده) و واژه‌به‌واژه با Express یکی نیست — بدهیِ بازِ متن.",
  homeClient:
    "بخش در Next هست ولی کلاینتی/شرطی رندر می‌شود (escape: بدونِ داده مخفی می‌شود)، پس در HTMLِ اولیه نیست؛ عینِ متن در سورس با گارد قفل شده.",
  contactOpen:
    "بخشِ «تماس با فروشگاه»ی Express (سرفصل و کارتِ تماس) در Next با «راه‌های ارتباطی» عوض شده و واژه‌های Express را ندارد — بدهیِ باز.",
  socialLayout:
    "تگ‌های اجتماعیِ سطحِ layout در Next این صفحه‌ها را هم پوشش می‌دهند؛ Express روی این صفحه‌ها og/twitter نداشت. بهبودِ افزوده، نه از دست رفتن.",
  canonicalLegacy:
    "کانونیکالِ Express به مسیرِ قدیمیِ .html اشاره می‌کرد؛ Next عمداً به مسیرِ تازه اشاره می‌کند (آدرسی که امروز مرجع است و مسیرهای قدیمی به آن ریدایرکت می‌شوند).",
  robotsEnhance:
    "Next روی همان «index, follow» تگِ max-image-preview:large را هم می‌گذارد — بهبودِ SEOِ افزوده.",
  authGate:
    "میان‌افزارِ Next این مسیر را برای کاربرِ ناشناس ۳۰۷ به /login می‌فرستد؛ Express پوستهٔ ۲۰۰ می‌داد و خودِ کلاینت ریدایرکت می‌کرد. محافظتِ مسیر یکسان است، کدِ HTTPِ گامِ اول نه.",
  legacyAlias:
    "مسیرِ قدیمیِ .html در Next با ۳۰۷ به مسیرِ تازه می‌رود؛ Express همان فایلِ استاتیک را ۲۰۰ می‌داد. قابلیت (لینک‌های قدیمی کار می‌کنند) حفظ شده، مکانیزم عوض شده.",
  cleanRoute:
    "این مسیرِ تازه فقط در Next وجود دارد (Express نسخهٔ .html را داشت)؛ برای ناشناس محافظت‌شده است.",
  productTitle:
    "عنوانِ تب را در Express خودِ اسکریپتِ کلاینت با قالبِ «| خرید با قیمت … تومان» (product.js:373) جایگزین می‌کرد؛ Next همان قالبِ دیده‌شدهٔ کاربر را مستقیم در متا می‌گذارد (گاردِ seoParity قالب را قفل کرده).",
  productCanonical:
    "Express روی صفحهٔ محصول کانونیکالِ سرورساید تزریق می‌کرد، Next ندارد — بدهیِ بازِ SEO روی پرارزش‌ترین صفحه‌های فروشگاه.",
  productOgType:
    "Express برای صفحهٔ محصول og:type=product می‌گذاشت، Next=website — بدهیِ باز (کارتِ اشتراک‌گذاری نامِ نوعِ درست را ندارد).",
  offlineHome:
    "دو نسخهٔ offline.html عمداً فقط در یک لینک فرق دارند: Express به /index.html و Next به / (توضیحش داخلِ خودِ فایلِ Next نوشته شده)؛ متنِ صفحه یکی است.",
  goneLegacy:
    "میان‌افزار عمداً /product-gone.html را به مسیرِ تازه نگاشت نمی‌کند (دلیلش در legacyUrls.ts آمده)؛ Express همان فایل را ۲۰۰ می‌داد. این آدرس هیچ‌وقت لینکِ کاربر نبود، فقط حاملِ پاسخِ ۴۱۰.",
  html410:
    "محصولِ ناموجود در هر دو ۴۱۰ می‌دهد: Express با صفحهٔ product-gone.html و Next با middleware + صفحهٔ product-gone (گاردش در legacyParity/seoParity هست).",
  staticAsset: "داراییِ استاتیکِ مشترک؛ هر دو ۲۰۰ می‌دهند.",
  adminGate:
    "پنلِ مدیریت فقط در Next وجود دارد و برای کاربرِ ناشناس ۳۰۷ به /login می‌رود؛ در Express معادلی نداشت (این probe فقط Next را می‌سنجد).",
  errorBoundary:
    "Express صفحهٔ ۵۰۰ را از هندلرِ خطای سرور سرو می‌کرد؛ Next با مرزِ خطا (error.tsx و global-error.tsx + دکمهٔ تلاشِ دوباره). چون خطای ۵۰۰ را نمی‌توان زنده تحریک کرد، فقط ساختار و فایل‌ها سنجیده می‌شوند.",
} as const;

/** شش دستهٔ کاتالوگ — در Express در مگامنو، کشوی موبایل و فوترِ هر صفحه تکرار شده‌اند. */
const CATEGORY_NEEDLES: MissRule[] = [
  "تشت و لگن",
  "صندلی و میز",
  "ظروف نگهداری",
  "سبد و جالباسی",
  "لوازم آشپزخانه",
  "لوازم نظافت",
].map((needle) => ({
  needle,
  state: "accepted" as const,
  reason: WHY.clientCategories,
  source: "static" as const,
}));

// ============================================================
// صفحه‌ها
// ============================================================

export const PARITY_PAGES: ParityPage[] = [
  {
    id: "index",
    label: "صفحهٔ اصلی",
    express: { url: "/index.html", status: 200 },
    next: { url: "/", status: 200 },
    mode: "server",
    // ۶۹.۷٪ اندازه‌گیری شد؛ کف برای گرفتنِ افت است نه قفل‌کردنِ عدد.
    textFloor: 0.65,
    misses: [
      // ── هیرو (بازنویسیِ کامل) ─────────────────────────────────
      {
        needle: "با اعتماد چند نسل",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "هر چی خانه‌ی شما لازم داره",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "پلاستیکی و رنگی",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "پلاسکو گلی سال‌هاست کنار خانواده‌های همین محله ایستاده",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "سبد و هر وسیله‌ی پلاستیکی که یک خانه برای زندگی روزمره لازم دارد",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "از تشت و صندلی گرفته تا ظرف نگهداری",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "خرید آنلاین راحت",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "مشاهده محصولات",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "جنس درجه‌یک",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "قیمت مناسب",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "کیفیت مطمئن",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      {
        needle: "ارسال همون‌روز",
        state: "open",
        reason: WHY.heroOpen,
        source: "static",
      },
      // ── نوارِ متحرکِ اعتماد (index.html:260) ──────────────────
      {
        needle: "ضمانت اصالت کالا",
        state: "open",
        reason: WHY.tickerOpen,
        source: "static",
      },
      {
        needle: "پرداخت امن زرین‌پال",
        state: "open",
        reason: WHY.tickerOpen,
        source: "static",
      },
      {
        needle: "۷ روز مهلت مرجوعی",
        state: "open",
        reason: WHY.tickerOpen,
        source: "static",
      },
      // ── بخشِ محصولات و فیلترهای صفحهٔ اصلی ───────────────────
      {
        needle: "محصولاتی که هر خانه یک بار نیاز پیدا می‌کند",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      {
        needle: "محصول موردنظرتون رو به سبد اضافه کنید",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      {
        needle: "مشاهده‌ی همه‌ی محصولات",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      {
        needle: "فیلترِ دسته‌بندی",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      {
        // سرِ مارک‌آپ بینِ «مرتب‌سازی» و «همه» یک خط‌تیره دارد و استخراجِ
        // جمله آن را می‌اندازد؛ همین تکه برای پوششِ همان جمله کافی است.
        needle: "محدوده‌ی قیمت و مرتب‌سازی",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      {
        needle: "حروف الفبا",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      {
        needle: "محدوده قیمت",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      {
        needle: "ادامه‌ی گشت‌وگذار",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      {
        needle: "پیشنهاد ویژه",
        state: "open",
        reason: WHY.homeCopyOpen,
        source: "static",
      },
      // ── بخش‌های کلاینتی/شرطی که در Next هستند ────────────────
      {
        needle: "اخیراً دیده‌اید",
        state: "accepted",
        reason: WHY.homeClient,
        source: "static",
      },
      {
        needle: "سفارشم کجاست",
        state: "accepted",
        reason: WHY.homeClient,
        source: "static",
      },
      {
        needle: "شماره‌ی سفارش و موبایلی که باهاش خرید کردید را بزنید",
        state: "accepted",
        reason: WHY.homeClient,
        source: "static",
      },
      {
        needle: "شماره سفارش",
        state: "accepted",
        reason: WHY.homeClient,
        source: "static",
      },
      {
        needle: "شماره‌ی سفارش را در پیامک تأیید خرید یا صفحه‌ی",
        state: "accepted",
        reason: WHY.homeClient,
        source: "static",
      },
      {
        needle: "سفارش‌های من",
        state: "accepted",
        reason: WHY.homeClient,
        source: "static",
      },
      {
        needle: "کد تخفیف",
        state: "accepted",
        reason: WHY.homeClient,
        source: "static",
      },
      // ── حرفِ مشتری‌ها: بدونِ دیدگاهِ تأییدشده عمداً مخفی است ──
      {
        needle: "نظر مشتری‌ها",
        state: "accepted",
        reason:
          "بخشِ دیدگاه‌ها در Next بدونِ دیدگاهِ تأییدشده رندر نمی‌شود (کامنتِ خودِ کد: ستونِ تعریفِ خالی اعتماد نمی‌سازد)؛ در دیتابیسِ محلیِ فعلی دیدگاهِ تأییدشده‌ای برای رندر نیست.",
        source: "static",
      },
      {
        needle: "حرف مشتری‌های واقعی پلاسکو گلی",
        state: "accepted",
        reason:
          "عنوانِ بخشِ دیدگاه‌هاست و همراهِ خودِ بخش (بدونِ داده) مخفی می‌شود؛ متنش در سورس عیناً هست.",
        source: "static",
      },
      {
        needle: "این‌ها دیدگاه‌های ثبت‌شده زیر خود محصولات‌اند",
        state: "accepted",
        reason:
          "توضیحِ زیرِ عنوانِ بخشِ دیدگاه‌هاست و همراهِ خودِ بخش (بدونِ داده) مخفی می‌شود.",
        source: "static",
      },
      {
        needle: "نه متن تبلیغاتی",
        state: "accepted",
        reason: "ادامهٔ همان جملهٔ بخشِ دیدگاه‌هاست؛ بدونِ داده رندر نمی‌شود.",
        source: "static",
      },
      // ── پوسته ────────────────────────────────────────────────
      {
        needle: "تماس با فروشگاه",
        state: "open",
        reason: WHY.contactOpen,
        source: "static",
      },
    ],
    meta: [],
    probes: [
      {
        id: "legacy-index-html",
        url: "/index.html",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
    ],
    files: {
      express: ["index.html", "js/common.js", "js/main.js"],
      next: [
        "src/app/page.tsx",
        "src/components/home/PromoBanner.tsx",
        "src/components/home/RecentlyViewed.tsx",
        "src/components/home/OrderTracking.tsx",
        "src/lib/faq.ts",
      ],
    },
  },

  {
    id: "products",
    label: "فهرستِ محصولات",
    express: { url: "/products.html", status: 200 },
    next: { url: "/products", status: 200 },
    mode: "server",
    textFloor: 0.88,
    misses: [
      {
        needle: "در حال بارگذاری",
        state: "accepted",
        reason: WHY.clientLoading,
        source: "static",
      },
      {
        needle: "پاک کردن همه‌ی فیلترها",
        state: "accepted",
        reason:
          "در Next این دکمه داخلِ حالتِ خالی رندر می‌شود (Express آن را در نوارِ کنارِ فیلترها داشت و تا فعال‌شدنِ فیلتری مخفی بود)؛ در HTMLِ پرِ فیلتر دیده نمی‌شود. متنش در سورس عیناً همان «پاک کردن همه‌ی فیلترها»ی products.html:197 است — این واژه همین امروز با همین گارد از «پاک کردن فیلترها» اصلاح شد.",
        source: "static",
      },
      {
        needle: "تماس با فروشگاه",
        state: "open",
        reason: WHY.contactOpen,
        source: "static",
      },
    ],
    meta: [
      {
        field: "canonical",
        state: "accepted",
        reason: WHY.canonicalLegacy,
      },
    ],
    probes: [
      {
        id: "legacy-products-html",
        url: "/products.html",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
    ],
    files: {
      express: ["products.html", "js/common.js", "js/products.js"],
      next: [
        "src/app/products/page.tsx",
        "src/components/FilterBar.tsx",
        "src/lib/productQuery.ts",
        "src/lib/faSearch.ts",
      ],
    },
  },

  {
    id: "product",
    label: "صفحهٔ محصول",
    express: { url: "/product/1", status: 200 },
    next: { url: "/product/1", status: 200 },
    mode: "client",
    textFloor: 0.53,
    misses: [
      {
        needle: "سطل شیاردار درب چوبی ۳ لیتر پلاسکو گلی",
        state: "open",
        reason:
          "عنوانِ همین محصول است که Express سرورساید در تگ‌های متا/og تزریق می‌کند (متنِ پرصفحه سمتِ کلاینت می‌آید)؛ Next در متنِ ابتداییِ صفحه عنوانِ خام را ندارد — بخشی از همان بدهیِ متادیتای محصول.",
        source: "data",
      },
      {
        needle: "محصول پیدا نشد",
        state: "accepted",
        reason:
          "بخشِ «محصول پیدا نشد» در product.html برای حالتی است که API جزئیات را ندهد؛ Next معادلش را در ProductGone دارد (و ۴۱۰ را middleware می‌دهد)، پس روی مسیرِ سالم رندر نمی‌شود.",
        source: "static",
      },
      {
        needle: "ممکن است این محصول حذف شده باشد یا آدرس اشتباه باشد",
        state: "accepted",
        reason: "ادامهٔ همان پیامِ حالتِ ناموجود است؛ روی محصولِ موجود رندر نمی‌شود.",
        source: "static",
      },
      {
        needle: "مشاهده همه‌ی محصولات",
        state: "accepted",
        reason: "دکمهٔ همان حالتِ ناموجود؛ روی محصولِ موجود رندر نمی‌شود.",
        source: "static",
      },
      {
        needle: "افزودن به سبد",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "داخل شهر همان روز",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "ضمانت اصالت کالا",
        state: "open",
        reason:
          "ردیفِ اعتمادِ product.html:171 (چهار قلم) در ProductDetail نیامده؛ متنِ غایب همین‌جا فهرست شده — بدهیِ باز.",
        source: "static",
      },
      {
        needle: "۷ روز مهلت مرجوعی",
        state: "open",
        reason: "همان ردیفِ اعتمادِ product.html:171 — بدهیِ باز.",
        source: "static",
      },
      {
        needle: "پرداخت امن زرین‌پال",
        state: "open",
        reason: "همان ردیفِ اعتمادِ product.html:171 — بدهیِ باز.",
        source: "static",
      },
      {
        needle: "نظر کسانی که این جنس را خریده‌اند",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "از همین دسته",
        state: "open",
        reason:
          "بلوکِ «از همین دسته»ی Express در ProductDetail نیامده — بدهیِ بازِ متن/قابلیت.",
        source: "static",
      },
      {
        needle: "ادامه‌ی گشت‌وگذار",
        state: "open",
        reason: "همان بلوکِ «از همین دسته»/بازگشت به فهرست — بدهیِ باز.",
        source: "static",
      },
      {
        needle: "اخیراً دیده‌اید",
        state: "accepted",
        reason: WHY.homeClient,
        source: "static",
      },
      {
        needle: "تماس با فروشگاه",
        state: "open",
        reason: WHY.contactOpen,
        source: "static",
      },
      // دسته‌های Express در کشوی موبایل/فوتر فهرست شده‌اند؛ در Next فقط دستهٔ
      // خودِ محصول روی صفحه می‌آید و بقیه سمتِ کلاینت از API. «ظروف نگهداری»
      // این‌جا نیست چون همان دستهٔ محصولِ نمونه است و روی صفحه می‌آید.
      ...CATEGORY_NEEDLES.filter((r) => r.needle !== "ظروف نگهداری"),
    ],
    meta: [
      { field: "title", state: "accepted", reason: WHY.productTitle },
      { field: "canonical", state: "open", reason: WHY.productCanonical },
      { field: "og:type", state: "open", reason: WHY.productOgType },
    ],
    probes: [
      {
        id: "legacy-product-html-id",
        url: "/product.html?id=1",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
    ],
    files: {
      express: ["product.html", "js/common.js", "js/product.js"],
      next: [
        "src/app/product/[id]/page.tsx",
        "src/components/ProductDetail.tsx",
        "src/components/ProductReviews.tsx",
        "src/components/ReviewForm.tsx",
        "src/components/NotifyMeButton.tsx",
        "src/components/StarRow.tsx",
      ],
    },
  },

  {
    id: "cart",
    label: "سبد خرید",
    express: { url: "/cart.html", status: 200 },
    next: { url: "/cart", status: 200 },
    mode: "client",
    textFloor: 0.48,
    misses: [
      {
        needle: "سبد خریدتون خالیه",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "برید یه سر به محصولات بزنید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "چیز خوب پیدا می‌کنید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "مشاهده محصولات",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "خلاصه‌ی سفارش",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "تعداد اقلام",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "جمع کالاها",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "سود شما از تخفیف‌ها",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "هزینه ارسال",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "اعمال شد",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "مبلغ قابل پرداخت",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "تکمیل خرید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "پرداخت امن با درگاه زرین‌پال",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "ارسال داخل شهر همان روز",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "۷ روز مهلت مرجوعی",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      ...CATEGORY_NEEDLES,
    ],
    meta: [
      { field: "og:title", state: "accepted", reason: WHY.socialLayout },
      { field: "og:description", state: "accepted", reason: WHY.socialLayout },
      { field: "og:type", state: "accepted", reason: WHY.socialLayout },
      { field: "twitter:card", state: "accepted", reason: WHY.socialLayout },
    ],
    probes: [
      {
        id: "legacy-cart-html",
        url: "/cart.html",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
    ],
    files: {
      express: ["cart.html", "js/common.js", "js/cart.js"],
      next: ["src/app/cart/page.tsx", "src/components/CartContent.tsx"],
    },
  },

  {
    id: "checkout",
    label: "تکمیل خرید",
    express: { url: "/checkout.html", status: 200 },
    next: { url: "/checkout", status: 307 },
    mode: "redirect",
    textFloor: 0,
    misses: [],
    meta: [],
    statusReason: { state: "accepted", reason: WHY.authGate },
    probes: [
      {
        id: "legacy-checkout-html",
        url: "/checkout.html",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
    ],
    files: {
      express: ["checkout.html", "js/common.js", "js/checkout.js"],
      next: [
        "src/app/checkout/page.tsx",
        "src/components/CheckoutContent.tsx",
      ],
    },
  },

  {
    id: "login",
    label: "ورود / ثبت‌نام",
    express: { url: "/login.html", status: 200 },
    next: { url: "/login", status: 200 },
    mode: "client",
    textFloor: 0.52,
    misses: [
      {
        needle: "ورود یا ثبت‌نام",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "شماره موبایل‌تون رو وارد کنید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "ارقام فارسی و فرمت‌هایی مثل",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "دریافت کد ورود",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "قبلاً رمز گذاشتید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "ورود با رمز عبور",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "شماره موبایل و رمزتون رو وارد کنید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "رمز عبور",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "رمز ندارید یا فراموشش کردید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "ورود با کد پیامکی",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "کد تایید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "کد ۵ رقمی ارسال‌شده به",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "رو وارد کنید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "شماره اشتباه است",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "کد نیومد",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "دوباره ارسال کن",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "خوش اومدید",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "ثبت‌نام‌تون کامل شد",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "اسم‌تون رو بگید تا با اسم خودتون صداتون کنیم",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "نام و نام خانوادگی",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "ذخیره و ادامه",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      {
        needle: "بعداً تکمیل می‌کنم",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
    ],
    meta: [
      { field: "og:title", state: "accepted", reason: WHY.socialLayout },
      { field: "og:description", state: "accepted", reason: WHY.socialLayout },
      { field: "og:type", state: "accepted", reason: WHY.socialLayout },
      { field: "twitter:card", state: "accepted", reason: WHY.socialLayout },
    ],
    probes: [
      {
        id: "legacy-login-next-param",
        url: "/login.html?next=%2Faccount",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason:
          "لینکِ قدیمیِ «بازگشت به صفحهٔ قبلی» با پارامترِ next در Next به /login?redirect=… نگاشت می‌شود (قابلیت حفظ شده)؛ Express فایلِ استاتیک را با ۲۰۰ می‌داد.",
      },
      {
        id: "clean-login-route",
        url: "/login",
        express: 404,
        next: 200,
        axis: "capability",
        state: "accepted",
        reason: WHY.cleanRoute,
      },
    ],
    files: {
      express: ["login.html", "js/common.js", "js/login.js"],
      next: [
        "src/app/login/page.tsx",
        "src/components/LoginForm.tsx",
        "src/components/AuthShell.tsx",
      ],
    },
  },

  {
    id: "account",
    label: "حساب کاربری",
    express: { url: "/account.html", status: 200 },
    next: { url: "/account", status: 307 },
    mode: "redirect",
    textFloor: 0,
    misses: [],
    meta: [],
    statusReason: { state: "accepted", reason: WHY.authGate },
    probes: [
      {
        id: "legacy-account-html",
        url: "/account.html",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
      {
        id: "clean-account-gate",
        url: "/account",
        express: 404,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.cleanRoute,
      },
    ],
    files: {
      express: ["account.html", "js/common.js", "js/account.js"],
      next: [
        "src/app/account/page.tsx",
        "src/components/AccountContent.tsx",
        "src/components/InvoiceSheet.tsx",
      ],
    },
  },

  {
    id: "order-success",
    label: "سفارشِ ثبت‌شده",
    express: { url: "/order-success.html", status: 200 },
    next: { url: "/order-success", status: 200 },
    mode: "client",
    textFloor: 0.71,
    misses: [
      {
        needle: "در حال بررسی سفارش",
        state: "accepted",
        reason: WHY.clientRender,
        source: "static",
      },
      ...CATEGORY_NEEDLES,
    ],
    meta: [
      { field: "og:title", state: "accepted", reason: WHY.socialLayout },
      { field: "og:description", state: "accepted", reason: WHY.socialLayout },
      { field: "og:type", state: "accepted", reason: WHY.socialLayout },
      { field: "twitter:card", state: "accepted", reason: WHY.socialLayout },
    ],
    probes: [
      {
        id: "legacy-order-success-html",
        url: "/order-success.html",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
    ],
    files: {
      express: ["order-success.html", "js/common.js", "js/order-success.js"],
      next: [
        "src/app/order-success/page.tsx",
        "src/components/OrderSuccessContent.tsx",
      ],
    },
  },

  {
    id: "terms",
    label: "قوانین و راهنمای خرید",
    express: { url: "/terms.html", status: 200 },
    next: { url: "/terms", status: 200 },
    mode: "server",
    textFloor: 0.89,
    misses: [
      {
        needle: "لغو و مرجوعی",
        state: "open",
        reason:
          "سرفصلِ Express «لغو و مرجوعی» است و Next «لغو سفارش و مرجوعی» نوشته (terms/page.tsx)؛ محتوا هست ولی عنوان واژه‌به‌واژه یکی نیست — بدهیِ بازِ متن.",
        source: "static",
      },
      ...CATEGORY_NEEDLES,
    ],
    meta: [
      { field: "robots", state: "accepted", reason: WHY.robotsEnhance },
      { field: "canonical", state: "accepted", reason: WHY.canonicalLegacy },
    ],
    probes: [
      {
        id: "legacy-terms-html",
        url: "/terms.html",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
    ],
    files: {
      express: ["terms.html", "js/common.js"],
      next: ["src/app/terms/page.tsx"],
    },
  },

  {
    id: "wholesale",
    label: "فروشِ عمده",
    express: { url: "/wholesale.html", status: 200 },
    next: { url: "/wholesale", status: 200 },
    mode: "server",
    textFloor: 0.94,
    misses: [
      {
        needle: "تماس با فروشگاه",
        state: "open",
        reason: WHY.contactOpen,
        source: "static",
      },
    ],
    meta: [
      { field: "robots", state: "accepted", reason: WHY.robotsEnhance },
      { field: "canonical", state: "accepted", reason: WHY.canonicalLegacy },
    ],
    probes: [
      {
        id: "legacy-wholesale-html",
        url: "/wholesale.html",
        express: 200,
        next: 307,
        axis: "capability",
        state: "accepted",
        reason: WHY.legacyAlias,
      },
    ],
    files: {
      express: ["wholesale.html", "js/common.js", "js/wholesale.js"],
      next: [
        "src/app/wholesale/page.tsx",
        "src/components/WholesaleForm.tsx",
      ],
    },
  },

  {
    id: "product-gone",
    label: "محصولِ حذف‌شده (۴۱۰)",
    express: { url: "/product-gone.html", status: 200 },
    next: { url: "/product-gone", status: 200 },
    mode: "server",
    textFloor: 0.95,
    misses: [],
    meta: [
      { field: "description", state: "accepted", reason: WHY.socialLayout },
      { field: "og:title", state: "accepted", reason: WHY.socialLayout },
      { field: "og:description", state: "accepted", reason: WHY.socialLayout },
      { field: "og:type", state: "accepted", reason: WHY.socialLayout },
      { field: "twitter:card", state: "accepted", reason: WHY.socialLayout },
    ],
    probes: [
      {
        id: "missing-product-410",
        url: "/product/999999",
        express: 410,
        next: 410,
        axis: "http",
        state: "accepted",
        reason: WHY.html410,
      },
      {
        id: "legacy-product-gone-html",
        url: "/product-gone.html",
        express: 200,
        next: 404,
        axis: "capability",
        state: "accepted",
        reason: WHY.goneLegacy,
      },
    ],
    files: {
      express: ["product-gone.html"],
      next: [
        "src/app/product-gone/page.tsx",
        "src/components/ProductGone.tsx",
        "src/lib/productGone.ts",
      ],
    },
  },

  {
    id: "not-found",
    label: "صفحهٔ ۴۰۴",
    express: { url: "/zzz-nope", status: 404 },
    next: { url: "/zzz-nope", status: 404 },
    mode: "server",
    // ۷۹.۴٪ اندازه‌گیری شد (هفت جملهٔ گم: شش دستهٔ کشو + یک دعوت به ادامه).
    textFloor: 0.75,
    // مقایسهٔ متن این‌جا نیم‌فاصله‌نرمال است (مثلِ seoParity): تفاوتِ
    // «از این‌جا» با «از اینجا» در ۴۰۴ را واگرایی حساب نمی‌کنیم، چون برای
    // خواننده نامرئی است.
    misses: [...CATEGORY_NEEDLES],
    meta: [
      {
        field: "robots",
        state: "accepted",
        reason:
          "Next روی ۴۰۴ خودش یک تگِ noindex می‌گذارد و بلوکِ metadataِ ما هم «noindex, follow» را اضافه می‌کند؛ نتیجه دو تگِ هم‌معنا است، نه ایندکس‌شدن (seoParity همین را به‌عنوان رفتارِ خودِ Next مستند کرده).",
      },
      { field: "og:title", state: "accepted", reason: WHY.socialLayout },
      { field: "og:description", state: "accepted", reason: WHY.socialLayout },
      { field: "og:type", state: "accepted", reason: WHY.socialLayout },
      { field: "twitter:card", state: "accepted", reason: WHY.socialLayout },
    ],
    probes: [],
    files: {
      express: ["404.html"],
      next: ["src/app/not-found.tsx"],
    },
  },

  {
    id: "error-500",
    label: "صفحهٔ ۵۰۰",
    express: { url: "(هندلرِ خطا)", status: 500 },
    next: { url: "(مرزِ خطا)", status: 500 },
    mode: "source",
    textFloor: 0,
    misses: [],
    meta: [],
    statusReason: { state: "accepted", reason: WHY.errorBoundary },
    probes: [],
    files: {
      express: ["500.html", "js/err-500.js"],
      next: ["src/app/error.tsx", "src/app/global-error.tsx"],
    },
  },

  {
    id: "offline",
    label: "صفحهٔ آفلاین",
    express: { url: "/offline.html", status: 200 },
    next: { url: "/offline.html", status: 200 },
    mode: "server",
    textFloor: 0.95,
    misses: [],
    meta: [],
    probes: [],
    statusReason: { state: "accepted", reason: WHY.offlineHome },
    files: {
      express: ["offline.html"],
      next: ["public/offline.html"],
    },
  },
];

// ============================================================
// probeهای سطحِ فروشگاه — چیزهایی که به یک صفحه گره نمی‌خورند.
// ============================================================

export const STORE_PROBES: Probe[] = [
  {
    id: "robots-txt",
    url: "/robots.txt",
    express: 200,
    next: 200,
    axis: "capability",
    state: "accepted",
    reason: WHY.staticAsset,
  },
  {
    id: "sitemap-xml",
    url: "/sitemap.xml",
    express: 200,
    next: 200,
    axis: "capability",
    state: "accepted",
    reason: WHY.staticAsset,
  },
  {
    id: "webmanifest",
    url: "/manifest.webmanifest",
    express: 200,
    next: 200,
    axis: "capability",
    state: "accepted",
    reason: WHY.staticAsset,
  },
  {
    id: "service-worker",
    url: "/sw.js",
    express: 200,
    next: 200,
    axis: "capability",
    state: "accepted",
    reason: WHY.staticAsset,
  },
  {
    id: "admin-gate",
    url: "/admin",
    express: 404,
    next: 307,
    axis: "capability",
    state: "accepted",
    reason: WHY.adminGate,
  },
];
