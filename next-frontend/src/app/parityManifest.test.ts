// ============================================================
// گاردِ ساختاریِ «مانیفستِ برابریِ فروشگاه»
// ============================================================
// خودِ مقایسه‌ی زنده کارِ `scripts/parity-storefront.mjs` است و به دو سرورِ
// بالا نیاز دارد. کاری که *همیشه* و بدونِ سرور باید قرمز شود، این‌جاست:
//
//   • کامل‌بودنِ پوشش: هر صفحهٔ Express یک ردیف دارد، هیچ فایلِ فروشگاهیِ
//     Express (html/js) بی‌ردیف نمی‌ماند، و هیچ مسیرِ فروشگاهیِ Next بی‌همتا
//     نمی‌ماند (پنلِ مدیریت عمداً بیرون است — فروشگاهِ مشتری نیست).
//   • وجودِ فایل‌ها: هر فایلی که مانیفست اعلام می‌کند واقعاً روی دیسک باشد؛
//     وگرنه مانیفست به مرور از کد جدا می‌افتد و مُهرِ تأییدِ دروغ می‌شود.
//   • اعتبارِ اعلان‌ها: هر واگراییِ پذیرفته/باز باید دلیلِ نوشته‌شده داشته
//     باشد. «واگراییِ بی‌دلیل» یعنی تصمیمی که کسی ثبتش نکرده.
//   • needleهای مرده: needleی که در سورسِ Express نیست، یا غلطِ تایپی است یا
//     متنِ Express عوض شده — هر دو باید شناخته شوند، نه بی‌صدا بمانند.
//
// بخشِ وابسته به Express (مثلِ shellParity) اگر پوشه‌ی `frontend/` نبود خودش
// را skip می‌کند؛ بخشِ اعتبارِ اعلان‌ها و ساختار همیشه اجرا می‌شود.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  META_FIELDS,
  PARITY_PAGES,
  STORE_PROBES,
  type DivState,
  type RenderMode,
} from "../lib/parityManifest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
// اوراکلِ منجمد: نسخه‌ی متنِ کاملِ فروشگاهِ Express، همان‌طور که پیش از
// حذفِ `frontend/` روی دیسک بود — از این پس منبعِ حقیقت همین fixture است،
// نه یک پوشه‌ی زنده‌ی در حالِ خروج (وگرنه این نگهبان‌ها بی‌صدا skip می‌شدند).
const EXPRESS_DIR = path.join(NEXT_DIR, "tests", "fixtures", "legacy-src");
const HAS_ORACLE = fs.existsSync(path.join(EXPRESS_DIR, "index.html"));

const STATES: DivState[] = ["accepted", "open"];
const MODES: RenderMode[] = ["server", "client", "redirect", "source"];

/** حداقلِ طولِ دلیل — دلیلِ کوتاه‌تر از این یعنی «تصمیم ثبت نشده». */
const MIN_REASON = 20;

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

/**
 * همان نرمال‌سازیِ اجراکنندهٔ زنده: تگ‌ها/کامنت‌ها حذف، نیم‌فاصله‌حذف و
 * فاصله‌ها یکی — تا «جملهٔ Express» با متنی که در مارک‌آپ شکسته شده مقایسه
 * شود، و «همه‌ی» با «همه‌ی» یکی حساب شود (درسِ seoParity).
 */
function plain(source: string): string {
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * همان «دربرگیریِ توالیِ کلمه‌ای» که خودِ اجراکنندهٔ زنده دارد.
 *
 * چرا کلمه‌محور و نه `includes`: جداسازها در متنِ مارک‌آپ می‌مانند و در
 * استخراجِ جملهٔ اجراکننده نمی‌مانند — مثلاً عنوانِ «محصول | پلاسکو گلی»
 * در آن‌جا به سه کلمه تبدیل می‌شود، پس needle هم به همان شکل نوشته می‌شود.
 * با `includes` این needle «مرده» خوانده می‌شد و نگهبان روی خودش قرمز
 * می‌شد، نه روی واگراییِ واقعی.
 */
const WORD = /[\u0621-\u06FF\u200c]+/g;
// نیم‌فاصله مثلِ خودِ اجراکننده حذف می‌شود (expressText هم همین کار را می‌کند)،
// وگرنه «همه‌ی» در needle با «همه‌ی» در متن دو کلمهٔ متفاوت می‌شود.
const wordsOf = (s: string) => s.replace(/\u200c/g, "").match(WORD) || [];
function containsWords(haystack: string, needle: string): boolean {
  const h = wordsOf(haystack);
  const n = wordsOf(needle);
  if (!n.length) return false;
  outer: for (let i = 0; i + n.length <= h.length; i++) {
    for (let j = 0; j < n.length; j++) if (h[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

/** فایل‌های یک صفحه در سمتِ Express، به متنِ نرمال‌شده. */
function expressText(files: string[]): string {
  return plain(
    files
      .map((rel) => {
        const abs = path.join(EXPRESS_DIR, rel);
        return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      })
      .join("\n"),
  );
}

/**
 * مسیرهایی که عمداً فروشگاهِ مشتری نیستند و در مانیفست ردیف ندارند.
 * اگر فردا مسیرِ فروشگاهیِ تازه‌ای اضافه شود، این فهرست پوشش نمی‌دهد و آزمون
 * قرمز می‌شود — همان چیزی که می‌خواهیم.
 */
const NOT_STOREFRONT: { prefix: string; reason: string }[] = [
  {
    prefix: "admin/",
    reason:
      "پنلِ مدیریت پشتِ ورود است و در Express معادلی نداشت؛ فروشگاهِ مشتری نیست.",
  },
  {
    prefix: "product/[id]/not-found.tsx",
    reason:
      "not-foundِ تودرتوی مسیرِ محصول؛ پاسخِ ۴۰۴/۴۱۰ فروشگاه از middleware و صفحهٔ product-gone می‌آید (ردیفِ product-gone و not-found).",
  },
];

const storefrontNextRoutes = walk(path.join(NEXT_DIR, "src", "app"))
  .filter((abs) =>
    /[\\/](page|not-found|error|global-error)\.tsx$/.test(abs),
  )
  .map((abs) =>
    path
      .relative(path.join(NEXT_DIR, "src", "app"), abs)
      .split(path.sep)
      .join("/"),
  )
  .filter((rel) => !NOT_STOREFRONT.some((rule) => rel.startsWith(rule.prefix)));

const declaredNextFiles = new Set(
  PARITY_PAGES.flatMap((page) => page.files.next),
);

const describeExpress = HAS_ORACLE ? describe : describe.skip;

describe("مانیفستِ برابریِ فروشگاه", () => {
  describeExpress("کامل‌بودنِ پوشش", () => {
    it("هر صفحهٔ HTMLِ فروشگاهِ Express یک ردیف دارد", () => {
      const onDisk = fs
        .readdirSync(EXPRESS_DIR)
        .filter((f) => f.endsWith(".html"))
        .sort();
      const declared = [
        ...new Set(
          PARITY_PAGES.flatMap((p) =>
            p.files.express.filter((f) => f.endsWith(".html")),
          ),
        ),
      ].sort();
      expect(
        declared,
        "صفحهٔ HTMLی روی دیسک است که در مانیفست هیچ ردیفی ندارد",
      ).toEqual(onDisk);
    });

    it("هر فایلِ JSِ فروشگاهِ Express در مانیفست آمده", () => {
      const jsDir = path.join(EXPRESS_DIR, "js");
      const onDisk = fs.existsSync(jsDir)
        ? fs
            .readdirSync(jsDir)
            .filter((f) => f.endsWith(".js"))
            .map((f) => `js/${f}`)
            .sort()
        : [];
      const declared = [
        ...new Set(
          PARITY_PAGES.flatMap((p) =>
            p.files.express.filter((f) => f.startsWith("js/")),
          ),
        ),
      ].sort();
      expect(onDisk.filter((f) => !declared.includes(f))).toEqual([]);
      expect(declared.filter((f) => !onDisk.includes(f))).toEqual([]);
    });

    it("هیچ مسیرِ فروشگاهیِ Next بی‌همتا نمی‌ماند", () => {
      const orphans = storefrontNextRoutes.filter(
        (rel) => !declaredNextFiles.has(`src/app/${rel}`),
      );
      expect(
        orphans,
        "این مسیر(های) Next در مانیفست نیستند — یا ردیفشان را اضافه کن یا دلیلِ بیرون‌بودن را در NOT_STOREFRONT بنویس",
      ).toEqual([]);
    });

    it("آدرس‌های دو طرفِ مانیفست به مقصدِ واقعی می‌رسند", () => {
      // چرا لازم است: `internalLinks` دو فایلِ «نقشه» (legacyUrls و
      // parityManifest) را از اسکنِ ارجاع‌ها معاف می‌کند تا نگهبان روی خودِ
      // نقشه قرمز نشود. این آزمون همان روزنه را می‌بندد: آدرسِ Nextِ هر ردیف
      // باید یا مسیرِ واقعیِ درختِ app باشد یا فایلی در public، و آدرسِ
      // Expressِ هر ردیف باید همان فایلِ `frontend/` باشد که می‌گوید.
      const routePatterns: RegExp[] = [];
      for (const rel of storefrontNextRoutes) {
        if (path.posix.basename(rel) !== "page.tsx") continue; // ۴۰۴/۵۰۰ مسیرِ کاربر نیستند
        const dir = path.posix.dirname(rel);
        const segs = dir === "." ? [] : dir.split("/");
        const re = segs.length
          ? `^/${segs.map((s) => (s.startsWith("[") ? "[^/]+" : s)).join("/")}$`
          : "^/$";
        routePatterns.push(new RegExp(re));
      }
      const publicFiles = new Set(
        walk(path.join(NEXT_DIR, "public"))
          .map((abs) => path.relative(path.join(NEXT_DIR, "public"), abs).split(path.sep).join("/"))
          .map((rel) => `/${rel}`),
      );

      const problems: string[] = [];
      for (const page of PARITY_PAGES) {
        if (page.mode === "source") continue; // آدرسِ نمایشیِ مرزِ خطا
        const next = page.next.url.split("?")[0];
        // صفحه‌هایی که خودشان مسیرِ کاربر نیستند (۴۰۴/۵۰۰) از سنجشِ مسیر
        // معاف‌اند — jobشان گرفتنِ آدرسِ ناموجود است.
        const isFallback = page.files.next.some((f) =>
          /(^|\/)(not-found|error|global-error)\.tsx$/.test(f),
        );
        const hitsRoute = routePatterns.some((re) => re.test(next));
        const hitsPublic = publicFiles.has(next);
        if (!isFallback && !hitsRoute && !hitsPublic) {
          problems.push(`Nextِ ${page.id}: «${next}» نه مسیرِ واقعی است نه فایلی در public`);
        }
        if (page.express.url.endsWith(".html")) {
          const abs = path.join(EXPRESS_DIR, page.express.url.slice(1));
          if (!fs.existsSync(abs))
            problems.push(`Expressِ ${page.id}: «${page.express.url}» روی دیسک نیست`);
        }
      }
      expect(problems).toEqual([]);
    });
  });

  describeExpress("وجودِ فایل‌ها", () => {
    it("هر فایلِ اعلام‌شدهٔ دو طرف روی دیسک هست", () => {
      const missing: string[] = [];
      for (const page of PARITY_PAGES) {
        for (const rel of page.files.express) {
          if (!fs.existsSync(path.join(EXPRESS_DIR, rel)))
            missing.push(`${page.id}: frontend/${rel}`);
        }
        for (const rel of page.files.next) {
          if (!fs.existsSync(path.join(NEXT_DIR, rel)))
            missing.push(`${page.id}: next-frontend/${rel}`);
        }
      }
      expect(missing).toEqual([]);
    });
  });

  describeExpress("needleها", () => {
    it("هر needle در سورسِ همان صفحهٔ Express پیدا می‌شود", () => {
      const dead: string[] = [];
      for (const page of PARITY_PAGES) {
        const text = expressText(page.files.express);
        for (const miss of page.misses) {
          if (miss.source !== "static") continue; // متنِ دیتابیسی، سورس ندارد
          if (!containsWords(text, miss.needle)) {
            dead.push(`${page.id}: «${miss.needle}»`);
          }
        }
      }
      expect(
        dead,
        "این needleها در سورسِ Express نیستند — یا غلطِ تایپی‌اند یا متنِ Express عوض شده",
      ).toEqual([]);
    });
  });

  // ----------------------------------------------------------
  // اعتبارِ اعلان‌ها — بدونِ Express هم اجرا می‌شود
  // ----------------------------------------------------------
  it("هر واگراییِ اعلام‌شده حالت و دلیلِ معتبر دارد", () => {
    const problems: string[] = [];
    const probeIds = new Set<string>();

    for (const page of PARITY_PAGES) {
      const where = `صفحهٔ ${page.id}`;

      if (page.express.status !== page.next.status && !page.statusReason) {
        problems.push(`${where}: کدِ وضعیت دو طرف فرق دارد ولی statusReason ندارد`);
      }
      if (page.statusReason) {
        if (!STATES.includes(page.statusReason.state))
          problems.push(`${where}: حالتِ statusReason نامعتبر است`);
        if (page.statusReason.reason.trim().length < MIN_REASON)
          problems.push(`${where}: دلیلِ تفاوتِ وضعیت خیلی کوتاه است`);
      }

      for (const miss of page.misses) {
        if (!miss.needle.trim())
          problems.push(`${where}: needleِ خالی`);
        if (miss.needle.trim().split(/\s+/).length < 2)
          problems.push(`${where}: needleِ «${miss.needle}» یک‌کلمه‌ای است`);
        if (!STATES.includes(miss.state))
          problems.push(`${where}: حالتِ needleِ «${miss.needle}» نامعتبر است`);
        if (miss.reason.trim().length < MIN_REASON)
          problems.push(`${where}: دلیلِ needleِ «${miss.needle}» خیلی کوتاه است`);
        if (miss.source !== "static" && miss.source !== "data")
          problems.push(`${where}: sourceِ needleِ «${miss.needle}» نامعتبر است`);
      }

      for (const diff of page.meta) {
        if (!META_FIELDS.includes(diff.field))
          problems.push(`${where}: فیلدِ متادیتای «${diff.field}» در META_FIELDS نیست`);
        if (!STATES.includes(diff.state))
          problems.push(`${where}: حالتِ متادیتای ${diff.field} نامعتبر است`);
        if (diff.reason.trim().length < MIN_REASON)
          problems.push(`${where}: دلیلِ متادیتای ${diff.field} خیلی کوتاه است`);
      }

      if (page.mode !== "source" && !page.express.url.startsWith("/"))
        problems.push(`${where}: آدرسِ Express باید با / شروع شود`);
      if (page.mode !== "source" && !page.next.url.startsWith("/"))
        problems.push(`${where}: آدرسِ Next باید با / شروع شود`);
      if (!page.files.express.length || !page.files.next.length)
        problems.push(`${where}: ردیفِ فایل‌های خالی`);
    }

    for (const probe of [...STORE_PROBES, ...PARITY_PAGES.flatMap((p) => p.probes)]) {
      if (probeIds.has(probe.id))
        problems.push(`probeِ تکراری با شناسهٔ «${probe.id}»`);
      probeIds.add(probe.id);
      if (!probe.url.startsWith("/"))
        problems.push(`probeِ ${probe.id}: آدرس باید با / شروع شود`);
      for (const [side, code] of [
        ["Express", probe.express],
        ["Next", probe.next],
      ] as const) {
        if (!Number.isInteger(code) || code < 100 || code > 599)
          problems.push(`probeِ ${probe.id}: کدِ ${side} نامعتبر است`);
      }
      if (!STATES.includes(probe.state))
        problems.push(`probeِ ${probe.id}: حالت نامعتبر است`);
      if (probe.reason.trim().length < MIN_REASON)
        problems.push(`probeِ ${probe.id}: دلیل خیلی کوتاه است`);
    }

    expect(problems).toEqual([]);
  });

  it("حالتِ صفحه و کفِ پوششِ متن معتبرند", () => {
    const problems: string[] = [];
    for (const page of PARITY_PAGES) {
      if (!MODES.includes(page.mode))
        problems.push(`${page.id}: حالتِ «${page.mode}» نامعتبر است`);
      const floor = page.textFloor;
      if (!Number.isFinite(floor) || floor < 0 || floor > 1)
        problems.push(`${page.id}: کفِ پوششِ ${floor} بیرون از [0,1] است`);
      if (page.mode === "server" || page.mode === "client") {
        if (floor <= 0)
          problems.push(`${page.id}: صفحهٔ ${page.mode} بدونِ کفِ پوششِ متن است`);
      } else if (floor !== 0) {
        problems.push(`${page.id}: حالتِ ${page.mode} نباید کفِ پوشش داشته باشد`);
      }
    }
    expect(problems).toEqual([]);
  });
});
