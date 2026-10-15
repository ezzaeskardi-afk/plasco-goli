// ============================================================
// فهرست‌های آیکون‌دارِ اوراکل — «هر قلم با آیکونِ خودش» یکی بماند
// ============================================================
// ---------- چرا این فایل وجود دارد ----------
// در نسخهٔ Express چند فهرستِ کوتاه وجود داشت که هر قلمش یک **آیکون** داشت:
// مزایای محصول، فهرستِ اطمینانِ سبد، مزایای خریدِ عمده، ارزش‌های «درباره»،
// کارت‌های «چرا پلاسکو گلی» و فهرستِ ورود. هنگامِ مهاجرت، *متن*ها یکی شدند
// ولی **آیکون‌ها** در دو جا از دست رفتند و همه به یک تیکِ عمومی تبدیل شدند:
//
//   • `ul.summary-trust` (سبد) — سه قلم، سه آیکونِ متفاوت.
//   • `ul.ws-points` (خرید عمده) — چهار قلم، چهار آیکون.
//
// هیچ نگهبانی نگرفتشان، و دلیلش دقیقاً همان چیزی است که این پروژه در
// جای‌های دیگر بسته است: `copyParity` **متن** را از اوراکل می‌خواند و با
// سورسِ Next مقایسه می‌کند، و هر چهار قلمِ آن فهرست‌ها متنِ درست را داشتند.
// «متن یکی، شکل نه» نه خطا می‌دهد، نه بیلد را می‌شکند، نه در هیچ سنجشِ
// دیگری دیده می‌شود — فقط کاربر یک ردیفِ بی‌آیکونِ همه‌شبیه‌هم می‌بیند.
//
// ---------- چه چیزی سنجیده می‌شود ----------
// برای هر فهرست: **ترتیب**، **متنِ هر قلم** و **آیکونِ هر قلم** — هر سه از
// خودِ اوراکلِ منجمد خوانده می‌شوند (نه از حافظهٔ نویسنده). نقشهٔ آیکونِ
// اسپرایت (`i-*`) به `components/Icon.tsx` یک نقشهٔ **بسته** است: قلمِ
// تازه‌ای با آیکونِ نامعلوم، سنجش را قرمز می‌کند تا کسی نقشه را به‌روز کند.
//
// ---------- و یک سنجشِ کشف، تا فهرستِ تازه بی‌صدا اضافه نشود ----------
// جدولِ پایین دستی است، پس اگر کسی فهرستِ آیکون‌دارِ تازه‌ای به یک صفحهٔ
// اوراکل اضافه کند (یا قلمی به فهرستِ موجود)، آزمونِ «کشف» می‌گیردش: هر
// `ul`ی که دو آیکون یا بیشتر در خود دارد باید در جدول باشد. محدودیتِ عمدی:
// کشف فقط `ul`ها را می‌بیند (فهرست‌های `div` در اوراکل ناهمگون‌اند) و
// بقیه صریح در جدول آمده‌اند.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
const SRC_DIR = path.join(NEXT_DIR, "src");
/** اوراکلِ منجمدِ فروشگاهِ Express — مرجعِ هر سنجشِ برابری در این پروژه. */
const ORACLE_DIR = path.join(NEXT_DIR, "tests", "fixtures", "legacy-src");

const ORACLE_FILES = fs
  .readdirSync(ORACLE_DIR)
  .filter((name) => name.endsWith(".html"))
  .sort();

function readOracle(name: string): string {
  return fs.readFileSync(path.join(ORACLE_DIR, name), "utf8");
}
function readSource(rel: string): string {
  return fs.readFileSync(path.join(SRC_DIR, rel), "utf8");
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
/** متنِ دیده‌شده: تگ‌ها برداشته و فاصله‌ها یکی می‌شوند. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * آیکونِ اسپرایت → نامِ آیکون در `components/Icon.tsx`.
 *
 * چرا نقشهٔ صریح و بسته: `i-check-circle` → `checkCircle` را نمی‌شود حدس زد،
 * و مهم‌تر این‌که قلمِ تازه‌ای با آیکونِ نامعلوم باید **قرمز** کند، نه این‌که
 * بی‌صدا از تور بیفتد.
 */
const ICON_OF: Record<string, string> = {
  "i-truck": "truck",
  "i-lock": "lock",
  "i-tag": "tag",
  "i-shield": "shield",
  "i-phone": "phone",
  "i-check": "check",
  "i-check-circle": "checkCircle",
  "i-refresh": "refresh",
};

type Item = { icon: string; parts: string[]; conditional: boolean };

/**
 * بدنهٔ یک ظرف (`ul.X` یا `div.X`) را از HTMLِ اوراکل بیرون می‌کشد.
 *
 * پایانِ ظرف با **شمارش عمق** پیدا می‌شود و نه با نخستین `</div>`: در
 * `div.feature-grid` هر کارت خودش یک `div` است و نخستین بستن، فقط کارتِ
 * اول را تمام می‌کند — نتیجه‌اش این بود که ظرفِ چهارقلمی، یک قلم به نظر
 * می‌رسید.
 */
function containerInner(html: string, container: string): string | null {
  const [tag, cls] = container.split(".");
  const open = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`).exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;

  let depth = 1;
  const token = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  token.lastIndex = start;
  for (let m = token.exec(html); m; m = token.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return null;
}

/**
 * قلم‌های فهرست — **آیکون‌محور** بریده می‌شوند، نه تگ‌محور.
 *
 * چرا: در اوراکل، هر قلم ساختارِ متفاوتی دارد (`li`ِ ساده، `li > span > b+em`،
 * `div.feature-card > b+span`). آن‌چه در همه‌شان یکی است «آیکونِ آغازِ قلم»
 * است، پس هر قلم از یک `<use href="#i-…">` تا آیکونِ بعدی بریده می‌شود.
 */
function itemsOf(html: string, container: string): Item[] {
  const inner = containerInner(html, container);
  expect(inner, `ظرفِ «${container}» در ${container.split(".")[0]} پیدا نشد`).toBeTruthy();

  const uses = [...inner!.matchAll(/<use href="#(i-[a-z-]+)"\s*\/?>/g)];
  return uses.map((use, i) => {
    const from = (use.index ?? 0) + use[0].length;
    const to = i + 1 < uses.length ? uses[i + 1].index! : inner!.length;
    const chunk = inner!.slice(from, to);
    // فقط *درونی‌ترین* قطعه‌ها: در `ul.aa-points` هر قلم یک `<span>`ِ بیرونی
    // دارد که `<b>` و `<em>` را در خود گرفته. الگو `[^<]*` را می‌خواهد
    // (نه `[\s\S]*?`): با آن یکی، قطعهٔ بیرونی همه‌ی درونی‌ها را می‌بلعید و
    // متنِ دو قطعه به یک رشتهٔ به‌هم‌چسبیده تبدیل می‌شد.
    const parts = [...chunk.matchAll(/<(b|span|em)\b[^>]*>([^<]*)<\/\1>/g)]
      .map((m) => visibleText(m[2]))
      .filter(Boolean);
    // قلمی که در اوراکل متنِ ثابت ندارد (متنش را JS می‌سازد) ساختارِ خالی
    // دارد: نه `<b>`/`<span>` نه متن.
    const conditional = parts.length === 0 && visibleText(chunk) === "";
    return {
      icon: use[1],
      parts: parts.length ? parts : [visibleText(chunk)].filter(Boolean),
      conditional,
    };
  });
}

/** نزدیک‌ترین آیکونِ پیش از یک متن در سورسِ Next (`<Icon name="x"` یا `icon: "x"`). */
function iconBefore(src: string, at: number, window = 900): string | null {
  const slice = src.slice(Math.max(0, at - window), at);
  let last: string | null = null;
  for (const m of slice.matchAll(/<Icon\s+name="([A-Za-z]+)"|icon:\s*"([A-Za-z]+)"/g)) {
    last = m[1] ?? m[2] ?? null;
  }
  return last;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * جایی که این متن با **همین** آیکون می‌نشیند.
 *
 * چرا «هر جای فایل» کافی نیست: جمله‌های کوتاهِ این فهرست‌ها در متنِ متای SEO
 * هم می‌آیند (`قیمت منصفانه` در توضیحِ متای صفحهٔ اصلی) — و آن‌جا هیچ آیکونی
 * نیست. پس جای درست، جایی است که آیکونِ پیش از متن **همان** آیکونِ اوراکل
 * باشد؛ اگر کسی آیکونِ همان قلم را بردارد یا عوض کند، چنین جایی وجود ندارد.
 */
function anchoredAt(src: string, part: string, icon: string): number {
  for (const m of src.matchAll(new RegExp(escapeRe(part), "g"))) {
    if (iconBefore(src, m.index!) === icon) return m.index!;
  }
  return -1;
}

type ListSpec = {
  /** نامِ فایلِ اوراکل */
  oracle: string;
  /** ظرف با شکلِ `tag.class` */
  container: string;
  /** فایلِ Next نسبت به `src/` */
  next: string;
  /** توضیحِ یک‌خطی در پیامِ شکست */
  label: string;
  /**
   * نشانهٔ جای فهرست در سورسِ Next.
   *
   * لازم است وقتی یک فایل **دو** فهرست دارد و متنِ قلم‌هایشان هم‌پوشانی دارد:
   * در `AuthShell` قلمِ دومِ `aa-points` («ارسال به سراسر کشور») پیش از
   * `auth-trust` می‌آید، پس مقایسهٔ جای قلم‌ها در کلِ فایل بی‌معنی می‌شود —
   * ولی داخلِ خودِ فهرست، ترتیب دقیقاً همان چیزی است که باید بپاییم.
   */
  region?: string;
  /** ادعای ویژهٔ همین فهرست (مثلاً شرطِ قلمِ مشروط) */
  extra?: (src: string) => void;
};

// ============================================================
// جدولِ بسته — هر فهرستِ آیکون‌دارِ اوراکل، و همتایش در Next
// ============================================================
const LISTS: ListSpec[] = [
  {
    oracle: "product.html",
    container: "ul.pd-perks",
    next: "components/ProductDetail.tsx",
    label: "مزایای محصول",
    extra: (src) => {
      // قلمِ «ارسال رایگان» تنها قلمی است که Express هم با JS و مشروط
      // می‌کشت: `if (!over || !cost) return ''` و بعد `li.hidden = !note`.
      expect(src).toMatch(/shop\.freeShippingOver > 0 && shop\.shippingCost > 0/);
      expect(src.match(/ارسال رایگان/g) ?? [], "وعدهٔ ارسالِ رایگان دو جا ساخته می‌شود")
        .toHaveLength(1);
    },
  },
  {
    oracle: "cart.html",
    container: "ul.summary-trust",
    next: "components/CartContent.tsx",
    label: "فهرستِ اطمینانِ سبد",
  },
  {
    oracle: "wholesale.html",
    container: "ul.ws-points",
    next: "app/wholesale/page.tsx",
    label: "مزایای خریدِ عمده",
  },
  {
    oracle: "index.html",
    container: "ul.values",
    next: "app/page.tsx",
    label: "ارزش‌های «درباره»",
  },
  {
    oracle: "index.html",
    container: "div.feature-grid",
    next: "app/page.tsx",
    label: "کارت‌های «چرا پلاسکو گلی»",
  },
  {
    oracle: "login.html",
    container: "ul.aa-points",
    next: "components/AuthShell.tsx",
    label: "فهرستِ ورود",
    region: 'className="aa-points"',
  },
  {
    oracle: "login.html",
    container: "div.auth-trust",
    next: "components/AuthShell.tsx",
    label: "ردیفِ اعتمادِ زیرِ کارتِ ورود",
    region: 'className="auth-trust"',
  },
];

describe("فهرست‌های آیکون‌دارِ اوراکل — ترتیب، متن و آیکون", () => {
  for (const spec of LISTS) {
    it(`${spec.label}: هر قلم با آیکونِ خودش، به همان ترتیبِ Express`, () => {
      const html = readOracle(spec.oracle);
      const items = itemsOf(html, spec.container);
      expect(items.length, `${spec.label} هیچ قلمِ آیکون‌داری در اوراکل ندارد`)
        .toBeGreaterThan(1);

      const src = stripComments(readSource(spec.next));
      const anchored: number[] = [];

      let scope = src;
      if (spec.region) {
        const from = src.indexOf(spec.region);
        expect(from, `نشانهٔ «${spec.region}» در ${spec.next} نیست`).toBeGreaterThan(-1);
        scope = src.slice(from);
      }

      items.forEach((item, i) => {
        expect(ICON_OF[item.icon], `آیکونِ ${item.icon} در نقشهٔ نگهبان نیست`).toBeTruthy();

        if (item.conditional) {
          // قلمِ مشروط: متنِ ثابت ندارد، پس فقط وجودش در سورس سنجیده می‌شود
          // (شرطِ دقیقش در `extra` همین فهرست می‌آید).
          expect(
            /shop\.freeShippingOver/.test(src) || /Icon/.test(src),
            `قلمِ مشروطِ ${spec.label} در سورس نیست`,
          ).toBe(true);
          return;
        }

        const at = anchoredAt(scope, item.parts[0], ICON_OF[item.icon]);
        expect(
          at,
          `متنِ قلمِ ${i + 1} «${item.parts[0]}» در ${spec.next} نیست یا آیکونش`
          + ` ${ICON_OF[item.icon]} نیست (${spec.label})`,
        ).toBeGreaterThan(-1);
        anchored.push(at);

        for (const part of item.parts.slice(1)) {
          expect(scope, `متنِ دومِ قلمِ ${i + 1} «${part}» در ${spec.next} نیست`)
            .toContain(part);
        }
      });

      // و ترتیب: جای قلم‌ها در سورس باید صعودی باشد، وگرنه دو قلم جابه‌جا
      // شده‌اند و کاربر ردیفِ دیگری می‌بیند (چیزی که هیچ سنجشِ متن نمی‌گیرد).
      expect(
        anchored,
        `ترتیبِ قلم‌های ${spec.label} با اوراکل یکی نیست`,
      ).toEqual([...anchored].sort((a, b) => a - b));

      spec.extra?.(src);
    });
  }

  it("فهرستِ آیکون‌دارِ تازه‌ای در اوراکل بی‌پوشش نمی‌ماند (کشف)", () => {
    // چرا این آزمون لازم است: جدولِ بالا دستی است و یک فهرستِ تازه در اوراکل
    // می‌توانست بی‌صدا از تور بیفتد. این‌جا مستقیماً از دیسک کشف می‌شود.
    const covered = new Set(LISTS.map((l) => `${l.oracle}::${l.container}`));
    const found: string[] = [];
    for (const file of ORACLE_FILES) {
      const html = readOracle(file);
      for (const m of html.matchAll(/<ul([^>]*)>([\s\S]*?)<\/ul>/g)) {
        const icons = [...m[2].matchAll(/<use href="#i-[a-z-]+"/g)];
        if (icons.length < 2) continue;
        const cls = /class="([^"]*)"/.exec(m[1])?.[1];
        // `class="a b"` یعنی ظرف چند کلاس دارد و آزمونِ بالا با دومی صدا می‌زند.
        const name = (cls ?? "").split(/\s+/)[0];
        if (name) found.push(`${file}::ul.${name}`);
      }
    }
    expect(found.length, "کشفِ فهرست‌ها چیزی پیدا نکرد — یعنی خودِ کاشف کور است")
      .toBeGreaterThanOrEqual(4);

    const uncovered = found.filter((key) => !covered.has(key));
    expect(uncovered, "فهرستِ آیکون‌دارِ تازه در اوراکل — به جدولِ این فایل اضافه‌اش کنید")
      .toEqual([]);
  });

  it("نقشهٔ آیکون‌ها هیچ مدخلِ مرده‌ای ندارد", () => {
    // مدخلِ مرده یعنی «برای آیکونی نگهبانی گذاشته‌ایم که در اوراکل نیست» —
    // همان‌قدر گمراه‌کننده است که معافیتِ مرده در `guard-anchors`.
    const used = new Set<string>();
    for (const spec of LISTS) {
      for (const item of itemsOf(readOracle(spec.oracle), spec.container)) used.add(item.icon);
    }
    expect(Object.keys(ICON_OF).filter((k) => !used.has(k))).toEqual([]);
  });
});
