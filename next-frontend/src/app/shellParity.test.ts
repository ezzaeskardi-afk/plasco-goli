// ============================================================
// نگهبانِ «پوسته‌ی Express ↔ Next» — یک‌طرفه، مکانیکی
// ============================================================
// چرا این فایل لازم شد: امروز با نگاه‌کردن به index.html و common.js معلوم شد
// یک مشت قابلیتِ پوسته در نسخه‌ی Next **هرگز پورت نشده بودند** و هیچ آزمون یا
// گاردی نفهمیده بودشان:
//
//   • منوی کشوییِ موبایل (`#drawer`) — تنها راهِ جستجو و دسته‌بندی روی گوشی
//   • منوی کشوییِ دسته‌بندیِ هدر (`#catMenu`)
//   • لینکِ «رفتن به محتوای اصلی» + `#main`
//   • بخش‌های «درباره ما»، «سوالات متداول» و «تماس با ما» + لنگرهایشان
//   • شماره‌ی تماس، آدرس و واتساپِ مغازه در پاورقی
//   • سالِ پویا (جای «© ۱۴۰۴» دستی)
//
// همه‌ی اینها *نبودند* ولی هیچ‌چیز قرمز نمی‌شد، چون هر آزمونِ موجود فقط رفتارِ
// چیزی را می‌سنجید که وجود داشت. این فایل همان شکاف را می‌بندد: برای هر
// قابلیت، هم وجودش در **منبعِ Express** و هم حضورش در **سورسِ Next** سنجیده
// می‌شود. اگر فردا کسی منو را حذف کند، همین‌جا قرمز می‌شود.
//
// اگر پوشه‌ی `frontend/` روزی حذف شود (پایانِ مهاجرت)، بخشِ مقایسه‌ای خودش را
// skip می‌کند ولی بخشِ «پوسته‌ی Next» همچنان اجرا می‌شود — چون آن بخش هیچ
// وابستگی‌ای به Express ندارد.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
const SRC_DIR = path.join(FRONTEND_DIR, "src");
const REPO_DIR = path.resolve(FRONTEND_DIR, "..");
const EXPRESS_DIR = path.join(REPO_DIR, "frontend");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function readAll(dir: string, filter: (f: string) => boolean): string {
  return walk(dir)
    .filter(filter)
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
}

// سورسِ Next (بدونِ فایل‌های آزمون — وگرنه خودِ همین فایل همه‌ی نشانه‌ها را
// دارد و آزمون به‌جای سنجیدنِ کد، خودش را تأیید می‌کند).
const nextSrc = readAll(
  SRC_DIR,
  (f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
);

const expressIndexPath = path.join(EXPRESS_DIR, "index.html");
const HAS_EXPRESS = fs.existsSync(expressIndexPath);

// منبعِ Express: همان سه فایلی که پوسته را می‌سازند.
const expressSrc = HAS_EXPRESS
  ? [
      fs.readFileSync(expressIndexPath, "utf8"),
      fs.readFileSync(path.join(EXPRESS_DIR, "js", "common.js"), "utf8"),
      fs.readFileSync(path.join(EXPRESS_DIR, "css", "style.css"), "utf8"),
    ].join("\n")
  : "";

type Feature = {
  /** نامِ قابلیت برای پیامِ خطا */
  name: string;
  /** نشانه‌ای که ثابت می‌کند قابلیت در Express وجود دارد */
  express: string;
  /** نشانه‌ای که باید در سورسِ Next باشد */
  next: string;
};

const FEATURES: Feature[] = [
  {
    name: "لینکِ «رفتن به محتوای اصلی»",
    express: 'class="skip-link"',
    next: "skip-link",
  },
  {
    name: "لنگرِ محتوای اصلی (#main)",
    express: 'href="#main"',
    next: 'id="main"',
  },
  {
    name: "نوارِ ناوبریِ پایینِ موبایل",
    express: "initBottomNav",
    next: "bottom-nav",
  },
  {
    name: "دکمه‌ی بازگشت به بالا",
    express: "toTop.className = 'to-top'",
    next: "to-top",
  },
  {
    name: "انیمیشنِ ورودِ بخش‌ها",
    express: "[data-reveal]",
    next: "[data-reveal]",
  },
  {
    name: "کادرِ خوش‌آمد (دعوت به ثبت‌نام)",
    express: "WELCOME_DELAY_MS = 25000",
    next: "WELCOME_DELAY_MS = 25_000",
  },
  {
    name: "نوارِ اطلاعیه‌ی سراسری",
    express: "pgAnnDismiss",
    next: '"pgAnnDismiss"',
  },
  {
    name: "منوی کشوییِ موبایل",
    express: 'id="drawer"',
    next: 'id="drawer"',
  },
  {
    name: "منوی کشوییِ دسته‌بندیِ هدر",
    express: "initCatMenu",
    next: "CatMenu",
  },
  {
    name: "سالِ پویا در پاورقی",
    express: "initFooterYear",
    next: "FooterYear",
  },
  {
    name: "تزریقِ اسپرایتِ آیکون‌ها",
    express: "loadIconSprite",
    next: "IconSprite",
  },
  {
    name: "ردیفِ دومِ هدر (subnav)",
    express: 'class="subnav"',
    next: "Subnav",
  },
  {
    name: "شماره‌ی تماسِ مغازه",
    express: "tel:09113567409",
    next: "tel:09113567409",
  },
  {
    name: "آدرسِ مغازه",
    express: "بلوار کشاورز",
    next: "بلوار کشاورز",
  },
  {
    name: "واتساپِ مغازه",
    express: "wa.me/989113567409",
    next: "wa.me/989113567409",
  },
  {
    name: "ساعاتِ کاری",
    express: "شنبه تا پنجشنبه",
    next: "شنبه تا پنجشنبه",
  },
];

/** لنگرهای صفحه‌ی اصلی که در هر دو فرانت‌اند باید وجود داشته باشند. */
const ANCHORS = ["home", "products", "about", "faq", "track", "contact"];

const describeExpress = HAS_EXPRESS ? describe : describe.skip;

describeExpress("پوسته ی Express در Next هم هست", () => {
  it("هر قابلیتِ پوسته در هر دو طرف موجود است", () => {
    const missingInExpress = FEATURES.filter((f) => !expressSrc.includes(f.express));
    // این حالت یعنی خودِ فهرستِ بالا از واقعیتِ Express جدا افتاده — نه اینکه
    // چیزی در Next کم است. جدا گزارش می‌شود تا گیج‌کننده نباشد.
    expect(
      missingInExpress.map((f) => f.name),
      "این قابلیت‌ها دیگر در Express نیستند؛ فهرستِ نگهبان باید به‌روز شود",
    ).toEqual([]);

    const missingInNext = FEATURES.filter((f) => !nextSrc.includes(f.next));
    expect(
      missingInNext.map((f) => f.name),
      "این قابلیت‌ها در Express بودند و در Next نیستند",
    ).toEqual([]);
  });

  it("همه‌ی لنگرهای صفحه‌ی اصلی در هر دو طرف ساخته می‌شوند", () => {
    const missing = ANCHORS.filter(
      (id) => !expressSrc.includes(`id="${id}"`) || !nextSrc.includes(`id="${id}"`),
    );
    expect(missing).toEqual([]);
  });
});

// ------------------------------------------------------------
// نگهبانِ عددی: اگر کسی آستانه‌ای را در Next «اصلاح» کند بدون اینکه در Express
// عوض شود، رفتار دو فرانت‌اند از هم جدا می‌افتد و اینجا قرمز می‌شود.
// ------------------------------------------------------------
describeExpress("عددهای جلوه‌های اسکرول یکی‌اند", () => {
  function firstMatch(src: string, re: RegExp): number | null {
    const m = src.match(re);
    return m ? Number(m[1]) : null;
  }

  it("آستانه‌ی هدر و دکمه‌ی بازگشت به بالا", () => {
    // Express: `yearlist.classList.toggle('scrolled', y > 10)` و `y > 600`
    const expressThresholds = [...expressSrc.matchAll(/\by > (\d+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(expressThresholds).toContain(10);
    expect(expressThresholds).toContain(600);

    expect(firstMatch(nextSrc, /HEADER_SCROLLED_AT = (\d+)/)).toBe(10);
    expect(firstMatch(nextSrc, /TO_TOP_AT = (\d+)/)).toBe(600);
  });

  it("آستانه و پله‌بندیِ انیمیشنِ ورود", () => {
    // Express: `{ threshold: 0.12 }` و `Math.min(i, 4) * 80`
    expect(expressSrc).toContain("threshold: 0.12");
    const stagger = expressSrc.match(/Math\.min\(i, (\d+)\)\s*\*\s*(\d+)/);
    expect(stagger).not.toBeNull();

    expect(firstMatch(nextSrc, /REVEAL_THRESHOLD = ([\d.]+)/)).toBe(0.12);
    expect(firstMatch(nextSrc, /REVEAL_MAX_STEPS = (\d+)/)).toBe(
      Number(stagger![1]),
    );
    expect(firstMatch(nextSrc, /REVEAL_STEP_MS = (\d+)/)).toBe(
      Number(stagger![2]),
    );
  });

  it("سقفِ انتظارِ شبکه با درخواست‌های API یکی است", () => {
    // هر دو فرانت‌اند اسمِ یکسانی برای این ثابت دارند (`NET_TIMEOUT`) — دقیقاً
    // به‌خاطر همین قابل‌مقایسه بودنش.
    expect(expressSrc).toContain("NET_TIMEOUT = 20000");
    expect(firstMatch(nextSrc, /NET_TIMEOUT = (\d+)/)).toBe(20_000);
  });
});

// ------------------------------------------------------------
// پوسته‌ی صفحه‌ی ورود — دومی که همین امروز پیدا شد
// ------------------------------------------------------------
// در نسخه‌ی Express، `/login.html` یک صفحه‌ی مستقلِ تمام‌صفحه بود (کلاسِ
// `auth-page`، بدون هدر و پاورقی) با پس‌زمینه‌ی زنده، دکمه‌ی بازگشت، ستونِ
// معرفی، کارتِ درخشان، ردیفِ اعتماد و دو خطِ حقوقی. در نسخه‌ی Next هیچ‌کدام
// نبود — یک کارتِ لخت وسطِ همان چارچوبِ فروشگاه — و هیچ آزمونی هم نمی‌گرفت،
// چون رفتارِ *داخلِ* فرم (OTP، رمز، پشتیبان) درست کار می‌کرد.
//
// این بخش دقیقاً همان شکاف را می‌بندد: هر بخش باید هم در `login.html` باشد و
// هم در سورسِ Next.
const loginHtmlPath = path.join(EXPRESS_DIR, "login.html");
const HAS_LOGIN = fs.existsSync(loginHtmlPath);

// متن‌ها یک‌سان‌سازی می‌شوند: نشانه‌های نامرئیِ جهت (‎ U+200E) و نیم‌فاصله،
// همان‌هایی که در HTMLِ فارسی جا می‌مانند و مقایسه‌ی خام را بی‌دلیل قرمز
// می‌کنند. (این تله قبلاً یک‌بار ما را گرفت؛ این‌جا از اول خنثی شده.)
function plain(s: string): string {
  return s.replace(/[\u200c\u200e\u200f]/g, "").replace(/\s+/g, " ");
}

const expressLogin = HAS_LOGIN ? plain(fs.readFileSync(loginHtmlPath, "utf8")) : "";

// برای پوسته‌ی ورود، سمتِ Next را فقط از **کامپوننت‌ها** می‌خوانیم، نه از کلِ
// سورس. دلیلش را با آزمونِ تخریبیِ امروز دیدم: `auth-aside` در globals.css هم
// هست، پس اگر کسی خودِ `<aside>` را از کامپوننت حذف می‌کرد، نگهبان به‌خاطرِ
// قاعده‌ی CSS سبز می‌ماند. نامِ کلاس در CSS ثابت می‌کند «استایل نوشته شده»،
// نه «این بخش رندر می‌شود». پس معیارِ وجود، مارکاپِ TSX است.
const nextTsx = plain(
  readAll(SRC_DIR, (f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f)),
);
const nextPlain = nextTsx;

const AUTH_FEATURES: Feature[] = [
  { name: "کلاسِ صفحه‌ی مستقلِ ورود", express: 'class="auth-page"', next: "auth-page" },
  { name: "پس‌زمینه‌ی زنده (هاله‌ها)", express: 'class="auth-bg"', next: "auth-bg" },
  { name: "آیکون‌های شناورِ وسایل خانه", express: 'class="ab-float af-1"', next: "ab-float" },
  { name: "دکمه‌ی بازگشت به فروشگاه", express: "بازگشت به فروشگاه", next: "بازگشت به فروشگاه" },
  { name: "ستونِ معرفی", express: 'class="auth-aside"', next: "auth-aside" },
  { name: "نشانِ بالای ستونِ معرفی", express: 'class="aa-kicker"', next: "aa-kicker" },
  { name: "تیترِ ستونِ معرفی", express: 'class="aa-title"', next: "aa-title" },
  { name: "متنیِ ستونِ معرفی", express: 'class="aa-lead"', next: "aa-lead" },
  { name: "فهرستِ چهار دلیل", express: 'class="aa-points"', next: "aa-points" },
  { name: "نگه‌داشتنِ شماره (یادداشتِ اعتماد)", express: 'class="aa-note"', next: "aa-note" },
  { name: "کارتِ ورود", express: 'class="auth-card"', next: "auth-card" },
  { name: "ردیفِ سه‌قولِ فروشگاه", express: 'class="auth-trust"', next: "auth-trust" },
  { name: "خطوطِ حقوقی زیر کارت", express: 'class="auth-legal"', next: "auth-legal" },
];

const describeLogin = HAS_LOGIN ? describe : describe.skip;

describeLogin("پوسته‌ی صفحه‌ی ورود در Next هم هست", () => {
  it("هر بخشِ صفحه‌ی ورود در هر دو طرف وجود دارد", () => {
    const missingInExpress = AUTH_FEATURES.filter((f) => !expressLogin.includes(plain(f.express)));
    expect(
      missingInExpress.map((f) => f.name),
      "این بخش‌ها دیگر در login.html نیستند؛ فهرستِ نگهبان باید به‌روز شود",
    ).toEqual([]);

    const missingInNext = AUTH_FEATURES.filter((f) => !nextPlain.includes(plain(f.next)));
    expect(
      missingInNext.map((f) => f.name),
      "این بخش‌ها در login.html بودند و در Next نیستند",
    ).toEqual([]);
  });

  it("سه‌قولِ فروشگاه و دو خطِ حقوقی عیناً همان متنِ Express است", () => {
    // متن، بخشی از تجربه‌ی خرید است: «ضمانت جنس اصل» یک قول به مشتری است،
    // نه یک رشته‌ی تزئینی. اگر روزی کسی در Next عوضش کند، این‌جا قرمز می‌شود.
    const shared = [
      "پرداخت امن زرین‌پال",
      "ارسال به سراسر کشور",
      "ضمانت جنس اصل",
      "فقط می‌خواهید ببینید سفارشتان کجاست؟",
      "بدون ورود پیگیری کنید",
      "فروشگاه را می‌پذیرید",
      "ارقام فارسی و فرمت‌هایی مثل ‎+۹۸‎ هم پذیرفته می‌شود.",
    ];
    const mismatched = shared.filter(
      (t) => !expressLogin.includes(plain(t)) || !nextPlain.includes(plain(t)),
    );
    expect(mismatched).toEqual([]);
  });

  it("لینکِ «بدون ورود پیگیری کنید» به لنگرِ موجود اشاره می‌کند", () => {
    // Express: `index.html#track` — Next: `/#track`. هر دو باید لنگرِ `#track`
    // را داشته باشند، وگرنه لینک به بالای صفحه می‌افتد و کار نمی‌کند.
    expect(expressLogin).toContain("index.html#track");
    expect(nextPlain).toContain('href="/#track"');
    expect(nextPlain).toContain('id="track"');
  });

  it("ورود «تمام‌صفحه» است — هدر و پاورقی در آن مسیر رندر نمی‌شوند", () => {
    // در Express اصلاً `<header>`/`<footer>` در login.html نبود؛ در Next باید
    // مسیرِ ورود از همین پوشش رد شده باشد تا چارچوب پنهان شود.
    expect(expressLogin).not.toContain("<header");
    expect(expressLogin).not.toContain("<footer");
    expect(nextPlain).toContain("STANDALONE_ROUTES");
    expect(nextPlain).toContain('"/login"');

    // فقط *داشتنِ* پوشش کافی نیست؛ باید دورِ هدر *و* پاورقی پیچیده شده باشد.
    // اگر کسی یکی را از layout بردارد، ستونِ صفحه جابه‌جا می‌شود و این‌جا قرمز.
    const layout = fs.readFileSync(path.join(SRC_DIR, "app", "layout.tsx"), "utf8");
    const wrappers = [...layout.matchAll(/<HideOnStandalone>/g)].length;
    expect(wrappers, "هدر و پاورقی هر دو باید داخلِ HideOnStandalone باشند").toBe(2);
    expect(layout).toContain("<Header />");
    expect(layout).toContain("<Footer />");
  });
});

// ------------------------------------------------------------
// آیکون‌های شناور باید در اسپرایتِ همان Next وجود داشته باشند.
// ------------------------------------------------------------
// `<use href="#i-tub">` اگر آن id در اسپرایتِ تزریق‌شده نباشد، مرورگر یک مربعِ
// خالی می‌کشد — خطای بی‌صدایی که نه typecheck می‌گیرد، نه lint و نه build.
// پس فهرستِ آیکون‌ها از خودِ کامپوننت خوانده و با اسپرایتِ مقصد سنجیده می‌شود.
describeLogin("آیکون‌های شناورِ صفحه‌ی ورود در اسپرایتِ Next موجودند", () => {
  it("هر آیکونِ شناور در public/assets/icons.svg هست", () => {
    const authShell = fs.readFileSync(
      path.join(SRC_DIR, "components", "AuthShell.tsx"),
      "utf8",
    );
    const listMatch = authShell.match(/FLOATING_ICONS = \[([^\]]+)\]/);
    expect(listMatch, "فهرستِ FLOATING_ICONS در AuthShell پیدا نشد").not.toBeNull();
    const ids = [...listMatch![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(6);

    const sprite = fs.readFileSync(
      path.join(FRONTEND_DIR, "public", "assets", "icons.svg"),
      "utf8",
    );
    const missing = ids.filter((id) => !sprite.includes(`id="${id}"`));
    expect(missing, "این آیکون‌ها در اسپرایت نیستند و مربعِ خالی می‌شوند").toEqual([]);
  });
});
