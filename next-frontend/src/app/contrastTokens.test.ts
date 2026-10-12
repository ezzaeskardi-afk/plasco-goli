// ============================================================
// نگهبانِ کنتراستِ پالتِ تم — WCAG 2.2 سطح AA
// ============================================================
// این فایل وارثِ `backend/tools/contrast-audit.js` است. آن ابزار فقط
// `frontend/css/style.css` را می‌خواند و با حذفِ آن پوشه بازنشسته شد، ولی
// چیزی که می‌گرفت هنوز زنده است: پالتِ تیره‌ی این فروشگاه سه رنگِ گرم
// (فیروزه‌ای/طلایی/مرجانی) روی زمینه‌ی سبز-مشکی می‌نشاند و همین ترکیب‌ها
// همان‌جایی‌اند که متن ناخوانا می‌شود — بدونِ اینکه هیچ خطای قرمزی بدهد.
//
// چرا این سنجش لازم است و «خواندنِ کد» کافی نیست:
//   • چشمِ کاربر رنگِ **ترکیب‌شده** را می‌بیند، نه مقدارِ خام. `--color-pink-tint`
//     آلفا دارد و روی `--color-surface` می‌نشیند؛ نسبتِ دو رنگِ خام چیزِ دیگری
//     است. همین‌جا یک نقصِ واقعی پیدا شد: متنِ صورتیِ ۱۱پیکسلیِ `Pill` روی
//     tintِ صورتی روی کارت = **۴٫۳۸**، یعنی زیرِ کفِ ۴٫۵ سطح AA.
//   • یک توکنِ تازه (`--color-*`) می‌تواند بی‌صدا اضافه و استفاده شود.
//
// سه چیز سنجیده می‌شود:
//   ۱) نسبت‌ها: متن ۴٫۵ (معیارِ 1.4.3)، اجزای رابط/مرزِ کنترل ۳ (1.4.11).
//   ۲) پوشش: هر توکنِ رنگِ `@theme` باید در جدولِ زیر **ثبت** شود (یا صریحاً
//      تزئینی اعلام شود) — وگرنه افزودنِ یک رنگ، ثبت‌نشده می‌ماند.
//   ۳) وجودِ متغیرها: هر `var(--x)` که سورس می‌خواند باید در `globals.css`
//      تعریف شده باشد. این یک‌بار شکسته بود: `LoginForm` به `var(--shadow)`
//      ارجاع می‌داد که تعریف نشده بود و کارتِ ورود بی‌سایه رندر می‌شد.
//
// محدودیتِ صادقانه (همان چیزی که ابزارِ قبلی هم نوشته بود): آبشارِ CSS اینجا
// شبیه‌سازی نمی‌شود؛ جدولِ `CONTEXTS` یک قراردادِ صریحِ «چه چیزی روی چه چیزی
// می‌نشیند» است. اگر جایی زمینه‌ی تازه‌ای اضافه شود، باید همین‌جا ثبت شود —
// سنجشِ «پوشش» پایین‌تر همین را قرمز می‌کند تا بی‌صدا از قلم نیفتد.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, "..");
const GLOBALS_CSS = path.join(HERE, "globals.css");

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rawCss = fs.readFileSync(GLOBALS_CSS, "utf8");
const css = stripComments(rawCss);

// ============================================================
// ۱) پالتِ رنگ — از خودِ `@theme`
// ============================================================
const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const COLOR = new Map<string, string>();
for (const m of themeBlock.matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  COLOR.set(m[1], m[2].trim());
}

// نام‌های کوتاهِ `:root` — فقط برای `fill:` اسپرایتِ آیکون‌ها. دو منبعِ
// حقیقت برای یک پالت یعنی روزی که یکی عوض شود آیکون‌ها رنگِ دیگری می‌گیرند.
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
const SHORT = new Map<string, string>();
for (const m of rootBlock.matchAll(/(--(?:teal|coral|gold|pink))\s*:\s*([^;]+);/g)) {
  SHORT.set(m[1], m[2].trim());
}

// ============================================================
// ۲) ریاضیاتِ رنگ (WCAG 2.2 + ترکیبِ آلفا)
// ============================================================
type RGBA = [number, number, number, number];

function hexToRgba(hex: string): RGBA {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

/** هر رنگِ CSS که این پالت استفاده می‌کند → [r,g,b,a]. ناشناخته = null. */
function parseColor(value: string): RGBA | null {
  const v = String(value).trim();
  if (v.startsWith("#")) return hexToRgba(v);
  const m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
  const a = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
  return [parts[0], parts[1], parts[2], a];
}

/** رنگِ نیمه‌شفاف روی زمینه‌اش می‌نشیند؛ چشم همین را می‌بیند. */
function composite(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function luminance([r, g, b]: RGBA): number {
  const f = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** نسبتِ کنتراست با ترکیبِ آلفای پیش‌زمینه روی زمینه. */
function contrast(fgValue: string, bgValue: string): number {
  const bg = parseColor(bgValue);
  const fg = parseColor(fgValue);
  if (!bg || !fg) return NaN;
  const [l1, l2] = [luminance(composite(fg, bg)), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** رنگِ یک توکن، با خطای روشن اگر نبود (تایپو در جدول نباید بی‌صدا رد شود). */
function token(name: string): string {
  const v = COLOR.get(name);
  if (v === undefined) throw new Error(`توکنِ «${name}» در @theme نیست`);
  return v;
}

// ============================================================
// ۳) زمینه‌ها و جدولِ قرارداد
// ============================================================
const TEXT_MIN = 4.5; // 1.4.3 — متنِ معمولی (زیرِ ۱۸٫۶۶px ضخیم یا ۲۴px)
const UI_MIN = 3; // 1.4.11 — مرزِ کنترل و حلقه‌ی فوکوس

const SURFACES = ["--color-cream", "--color-surface", "--color-surface-2"] as const;
const BRAND = [
  "--color-teal",
  "--color-teal-dark",
  "--color-coral",
  "--color-coral-dark",
  "--color-pink",
  "--color-gold",
] as const;
// رنگ‌هایی که فقط به‌عنوانِ *زمینه* به کار می‌روند (تکمه‌های گرم) و متنِ
// رویشان `ink-on-warm` است.
const WARM_BG = ["--color-gold", "--color-teal", "--color-coral", "--color-pink", "--color-coral-dark", "--color-teal-dark"] as const;
// هر tint و برندِ همراهش — همین جفت در کد استفاده می‌شود (`TONE_STYLE`ِ پنل).
const TINT_PAIRS = [
  { tint: "--color-teal-tint", accent: "--color-teal" },
  { tint: "--color-gold-tint", accent: "--color-gold" },
  { tint: "--color-coral-tint", accent: "--color-coral" },
  { tint: "--color-pink-tint", accent: "--color-pink" },
] as const;

type Context = {
  /** توکنِ رنگِ متن/اجزا */
  fg: string;
  /** توکنِ زمینه (یا tint که روی `base` می‌نشیند) */
  bg: string;
  base?: string;
  min: number;
  why: string;
};

const CONTEXTS: Context[] = [
  ...SURFACES.flatMap((bg) => [
    { fg: "--color-ink", bg, min: TEXT_MIN, why: "متنِ اصلیِ صفحه/کارت" },
    { fg: "--color-ink-soft", bg, min: TEXT_MIN, why: "متنِ فرعی" },
    { fg: "--color-ink-dim", bg, min: TEXT_MIN, why: "متنِ کم‌رنگ (برچسب/تاریخ)" },
    ...BRAND.map((fg) => ({ fg, bg, min: TEXT_MIN, why: "برند روی سطح" })),
  ]),
  ...WARM_BG.map((bg) => ({
    fg: "--color-ink-on-warm",
    bg,
    min: TEXT_MIN,
    why: "متنِ تکمه‌های گرم",
  })),
  ...TINT_PAIRS.flatMap(({ tint, accent }) =>
    SURFACES.map((base) => ({
      fg: accent,
      bg: tint,
      base,
      min: TEXT_MIN,
      why: "متنِ برند روی tintِ خودش (Pill/بَج، ۱۱px ضخیم)",
    })),
  ),
  ...SURFACES.map((base) => ({
    fg: "--color-line-control",
    bg: base,
    min: UI_MIN,
    why: "مرزِ کنترل (اینپوت/دکمه‌ی خطی)",
  })),
];

// رنگ‌هایی که عمداً کفِ کنتراست ندارند، با دلیل. `line`/`line-strong` جداکننده
// و تزئین‌اند (کارت با رنگِ سطحِ خودش هم تشخیص داده می‌شود) و WCAG برای جداکننده‌ی
// صرف ۳:۱ نمی‌خواهد؛ مرزِ کنترل چیزی است که کاربر باید ببیند و `line-control`
// برای همان است.
const DECORATIVE: { token: string; why: string }[] = [
  { token: "--color-line", why: "جداکننده‌ی تزئینی؛ مرزِ کنترل جای دیگری است" },
  { token: "--color-line-strong", why: "جداکننده‌ی پررنگ‌تر، هنوز تزئینی" },
];

// متغیرهایی که در زمانِ اجرا با style ست می‌شوند (پس در CSS تعریف ندارند).
// شرطِ ماندن در این فهرست: خواندنِ CSS حتماً fallback داشته باشد، وگرنه اگر
// کامپوننت دیر برسد خاصیت بی‌مقدار می‌ماند. آزمونِ آخرین `describe` همین را
// می‌سنجد — یعنی این فهرست سوراخِ خالی نیست، قراردادِ fallback است.
const RUNTIME_TOKENS: { token: string; why: string }[] = [
  { token: "--stall-delay", why: "StallNotice با style ست می‌کند؛ CSS فقط می‌خواند" },
  { token: "--rd", why: "ScrollFx تأخیرِ پله‌ایِ همسایه‌ها را ست می‌کند" },
];

const registered = new Set<string>([
  ...CONTEXTS.flatMap((c) => [c.fg, c.bg, ...(c.base ? [c.base] : [])]),
  ...DECORATIVE.map((d) => d.token),
]);

// ============================================================
// ۴) سورسِ زنده (بدونِ فایل‌های آزمون — وگرنه خودش را تأیید می‌کند)
// ============================================================
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(abs, out);
    else if (!/\.test\.(ts|tsx)$/.test(e.name)) out.push(abs);
  }
  return out;
}
const SOURCE_TEXT = sourceFiles(SRC_DIR).map((f) => stripComments(fs.readFileSync(f, "utf8"))).join("\n");

const definedTokens = new Set<string>([
  ...[...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
]);
const readTokens = new Set<string>([
  ...[...SOURCE_TEXT.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]),
  ...[...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]),
].filter((t) => !RUNTIME_TOKENS.some((r) => r.token === t)));

const ratioOf = (c: Context) => {
  if (!c.base) return contrast(token(c.fg), token(c.bg));
  // tint روی پایه: زمینه همان رنگِ ترکیب‌شده است (آلفای tint روی سطح).
  const composed = composite(parseColor(token(c.bg))!, parseColor(token(c.base))!);
  return contrast(token(c.fg), `rgb(${composed[0]}, ${composed[1]}, ${composed[2]})`);
};
const label = (c: Context) => `${c.fg} روی ${c.bg}${c.base ? ` (روی ${c.base})` : ""}`;
const failing = (min: number) =>
  CONTEXTS.filter((c) => c.min === min)
    .map((c) => ({ c, r: ratioOf(c) }))
    .filter((x) => !(x.r >= min));

describe("پالتِ رنگ", () => {
  it("پالت از @theme خوانده می‌شود و رنگ‌ها قابلِ تجزیه‌اند", () => {
    expect(COLOR.size).toBeGreaterThanOrEqual(18);
    const bad = [...COLOR].filter(([, v]) => parseColor(v) === null);
    expect(bad.map(([k, v]) => `${k}=${v}`)).toEqual([]);
  });

  it("نام‌های کوتاهِ :root با همان رنگ‌های @theme یکی‌اند", () => {
    expect(SHORT.size).toBe(4);
    const drift = [...SHORT]
      .map(([short, value]) => ({
        short,
        value,
        theme: COLOR.get(`--color-${short.replace("--", "")}`),
      }))
      .filter((x) => x.theme?.toLowerCase() !== x.value.toLowerCase());
    expect(drift.map((x) => `${x.short}=${x.value} در برابر ${x.theme}`)).toEqual([]);
  });
});

describe("کنتراستِ متن (WCAG 2.2 — 1.4.3)", () => {
  it("متن‌های اصلی/فرعی/کم‌رنگ و رنگ‌های برند روی هر سه سطح ≥ ۴٫۵", () => {
    const bad = failing(TEXT_MIN).filter((x) => !x.c.base);
    expect(bad.map((x) => `${label(x.c)} = ${x.r.toFixed(2)} (${x.c.why})`)).toEqual([]);
  });

  it("متنِ روی tintِ خودش (بَج‌های ۱۱پیکسلی) روی هر سه پایه ≥ ۴٫۵", () => {
    const bad = failing(TEXT_MIN).filter((x) => x.c.base);
    expect(bad.map((x) => `${label(x.c)} = ${x.r.toFixed(2)} (${x.c.why})`)).toEqual([]);
  });
});

describe("مرزهای رابط (WCAG 2.2 — 1.4.11)", () => {
  it("مرزِ کنترل روی هر سه سطح ≥ ۳", () => {
    const bad = failing(UI_MIN);
    expect(bad.map((x) => `${label(x.c)} = ${x.r.toFixed(2)}`)).toEqual([]);
  });
});

describe("پوشش (تا پالت بی‌صدا بزرگ نشود)", () => {
  it("هر توکنِ رنگِ @theme در جدول ثبت شده یا صریحاً تزئینی است", () => {
    const unregistered = [...COLOR.keys()].filter((k) => !registered.has(k));
    expect(unregistered).toEqual([]);
  });

  it("هر توکنِ نام‌برده‌شده در جدول واقعاً در @theme هست", () => {
    const ghosts = [...registered].filter((k) => !COLOR.has(k));
    expect(ghosts).toEqual([]);
  });

  it("هر رنگِ تزئینی دلیلِ نوشته‌شده دارد", () => {
    expect(DECORATIVE.filter((d) => !d.why.trim()).map((d) => d.token)).toEqual([]);
  });

  it("هر tintی که سورس استفاده می‌کند به‌عنوانِ زمینه ثبت شده", () => {
    const used = TINT_PAIRS.map((p) => p.tint).filter((t) =>
      new RegExp(`${t.replace(/[-]/g, "\\-")}\\)`).test(SOURCE_TEXT),
    );
    const unregisteredTints = used.filter((t) => !CONTEXTS.some((c) => c.bg === t));
    expect(unregisteredTints).toEqual([]);
    // و برعکس: اگر سورس دیگر از یک tint استفاده نمی‌کند، ثبتش بی‌معنی است.
    const unused = TINT_PAIRS.map((p) => p.tint).filter((t) => !used.includes(t));
    expect(unused).toEqual([]);
  });

  it("هر توکنی که به‌شکلِ یوتیلیتیِ Tailwind در سورس می‌آید ثبت شده است", () => {
    const usedElsewhere = [...COLOR.keys()]
      .map((k) => k.replace("--color-", ""))
      .filter((name) => new RegExp(`\\b(text|bg|border|fill)-${name}(?![-a-z0-9])`).test(SOURCE_TEXT))
      .map((name) => `--color-${name}`)
      .filter((k) => !registered.has(k));
    expect(usedElsewhere).toEqual([]);
  });
});

describe("متغیرهای خوانده‌شده", () => {
  it("هر var(--…) که سورس یا CSS می‌خواند تعریف شده است", () => {
    const missing = [...readTokens].filter((t) => !definedTokens.has(t));
    expect(missing).toEqual([]);
  });

  it("هر متغیرِ زمانِ‌اجرا دلیل دارد و در CSS با fallback خوانده می‌شود", () => {
    expect(RUNTIME_TOKENS.filter((r) => !r.why.trim()).map((r) => r.token)).toEqual([]);
    const noFallback = RUNTIME_TOKENS.filter(
      (r) => !new RegExp(`var\\(\\s*${r.token}\\s*,`).test(css),
    );
    expect(noFallback.map((r) => r.token)).toEqual([]);
  });
});
