// ============================================================
// نگهبانِ «داده‌ی ساختاریافته‌ی FAQ = محتوای دیده‌شده»
// ============================================================
// باگی که این آزمون می‌بندد، یک باگِ سئو با پیامدِ واقعی بود: نسخه‌ی Next
// `<FAQPageJsonLd>` را در HTML می‌گذاشت ولی در صفحه **هیچ بخشِ سوالات متداولی
// نداشت**. راهنمای خودِ گوگل صریح است که محتوای FAQ باید روی همان صفحه دیده
// شود؛ علامت‌گذاریِ نامرئی می‌تواند به‌عنوان «اسپمِ ساختاریافته» جریمه بخورد و
// اعتبارِ کلِ سایت را پایین بیاورد.
//
// حالا هر دو از `lib/faq.ts` می‌خوانند و این آزمون همان قرارداد را قفل می‌کند:
//   • هیچ سوالی در JSON-LD نباشد که در بخشِ دیدنی نیست.
//   • و بخشِ دیدنی خالی نباشد.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOME_FAQ } from "@/lib/faq";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = fs.readFileSync(path.join(HERE, "page.tsx"), "utf8");
const JSON_LD = fs.readFileSync(
  path.join(HERE, "..", "components", "JsonLd.tsx"),
  "utf8",
);
const FAQ_LIB = fs.readFileSync(
  path.join(HERE, "..", "lib", "faq.ts"),
  "utf8",
);

describe("سوالاتِ متداول — دیدنی و داده‌ی ساختاریافته", () => {
  it("بخشِ دیدنی و داده‌ی ساختاریافته از یک منبع می‌خوانند", () => {
    // `JsonLd` نباید آرایه‌ی دستیِ خودش را داشته باشد؛ باید همان `HOME_FAQ`
    // را بخواند. اگر کسی داده‌ی ساختاریافته را جدا بنویسد، از صفحه جدا می‌افتد.
    expect(JSON_LD).toContain("HOME_FAQ");
    expect(JSON_LD).toContain("items.map");
    expect(PAGE).toContain("HOME_FAQ");
    // و بخشِ دیدنی باید روی همان آرایه‌ی کتابخانه map بزند، نه روی یک لیستِ
    // تازه در خودِ صفحه.
    expect(PAGE).toMatch(/HOME_FAQ\.map\(/);
  });

  it("متنِ سوال‌ها فقط در یک فایل است، نه نسخه‌ی دوم در صفحه‌ها", () => {
    // این همان چیزی است که «داده‌ی ساختاریافته از محتوا جدا می‌افتد» را
    // می‌گیرد: با دو نسخه‌ی متن، کافی است یک‌بار ویرایش ناقص بماند.
    const duplicated = HOME_FAQ.filter(
      (item) => PAGE.includes(item.answer) || JSON_LD.includes(item.answer),
    ).map((item) => item.question);
    expect(duplicated, "پاسخ‌هایی که در جای دومی هم نوشته شده‌اند").toEqual([]);

    const questionsInLib = HOME_FAQ.filter((item) =>
      FAQ_LIB.includes(item.question),
    );
    expect(questionsInLib).toHaveLength(HOME_FAQ.length);
  });

  it("بخشِ سوالات متداول لنگرِ #faq دارد", () => {
    // پاورقی و منوی موبایل به `/#faq` لینک می‌دهند؛ بدونِ این لنگر، لینک‌ها
    // همه به بالای صفحه می‌پرند.
    expect(PAGE).toContain('id="faq"');
  });

  it("هر سوال پاسخِ غیرخالی دارد", () => {
    for (const item of HOME_FAQ) {
      expect(item.question.trim().length).toBeGreaterThan(5);
      expect(item.answer.trim().length).toBeGreaterThan(20);
    }
  });
});
