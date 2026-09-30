// ============================================================
// نگهبانِ «نشانیِ عکس دقیقاً یک‌بار کد شود»
// ============================================================
// چرا این فایل لازم شد: `image` را خودِ API از قبل percent-encoded برمی‌گرداند
// (`/picture/products/%D8%B3…jpg`) و چند جا دوباره `encodeURI` رویش می‌رفت. نتیجه
// `%25D8…` بود؛ نشانی‌ای که ۴۰۴ می‌دهد. سه جای مصرف‌کننده داشت:
//
//   • `image` در JSON-LDِ محصول (گوگل)
//   • همان در JSON-LDِ `ItemList` صفحه‌ی اصلی
//   • `<image:loc>` نقشه‌ی سایت
//
// هیچ‌کدام هم در آزمونِ سطحِ منبع دیده نمی‌شدند، چون «دوبار کدشده بودن» یک
// ویژگیِ runtime است: رشته‌ی `%25D8` در کد غلط به‌نظر نمی‌رسد. پس اینجا هم خودِ
// تابع سنجیده می‌شود و هم قاعده‌ای که دیگر کسی مستقیم `encodeURI` نزند.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { publicImagePath } from "@/lib/site";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, "..");

/** نمونه‌ی واقعیِ همان چیزی که API برمی‌گرداند. */
const ENCODED = "/picture/products/%D8%B3%D8%B7%D9%84%20%DB%B1.jpg";
const RAW = "/picture/products/سطل ۱.jpg";

describe("publicImagePath — دقیقاً یک‌بار کدشده", () => {
  it("مسیرِ از قبل کدشده را دست‌نخورده برمی‌گرداند", () => {
    expect(publicImagePath(ENCODED)).toBe(ENCODED);
  });

  it("مسیرِ خامِ فارسی را یک‌بار کد می‌کند", () => {
    expect(publicImagePath(RAW)).toBe(ENCODED);
  });

  it("مسیرِ دوبار‌کدشده را به شکلِ درست برمی‌گرداند", () => {
    // `encodeURI` روی مقدارِ کدشده — همان باگی که این تابع برای جلوگیری از آن
    // نوشته شد. حالا خودش هم ورودیِ خراب را ترمیم می‌کند.
    const double = ENCODED.replace(/%/g, "%25");
    expect(double).toContain("%25D8");
    expect(publicImagePath(double)).toBe(ENCODED);
  });

  it("idempotent است", () => {
    expect(publicImagePath(publicImagePath(ENCODED))).toBe(ENCODED);
    expect(publicImagePath(publicImagePath(RAW))).toBe(ENCODED);
  });

  it("خالی و null → رشته‌ی خالی", () => {
    expect(publicImagePath("")).toBe("");
    expect(publicImagePath(null)).toBe("");
    expect(publicImagePath(undefined)).toBe("");
  });

  it("درصدِ تنها (نامِ فایلی با `%`) خطا نمی‌دهد", () => {
    expect(() => publicImagePath("/picture/products/50%.jpg")).not.toThrow();
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

const nonTestSources = () =>
  walk(SRC_DIR).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
  );

const read = (rel: string) =>
  fs.readFileSync(path.join(SRC_DIR, rel), "utf8");

describe("هیچ مصرف‌کننده‌ای مسیرِ عکس را دوباره کد نمی‌کند", () => {
  it("هیچ‌جا `encodeURI(...image...)` نمانده", () => {
    const offenders = nonTestSources()
      .filter((f) => /encodeURI(?:Component)?\([^)\n]*\bimage\b/i.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC_DIR, f));
    expect(offenders).toEqual([]);
  });

  it("سازندهای نشانیِ مطلقِ عکس از `publicImagePath` استفاده می‌کنند", () => {
    // اگر روزی کسی یکی از این سه را عوض کند و به `encodeURI` یا الحاقِ ساده
    // برگردد، نگهبانِ بالا می‌گیرد؛ این یکی تضمین می‌کند که مصرف‌کننده‌ها هم
    // *همان* تابع را صدا بزنند (نه یک کپیِ محلی).
    expect(read("components/JsonLd.tsx")).toMatch(/publicImagePath\(product\.image\)/);
    expect(read("components/JsonLd.tsx")).toMatch(/publicImagePath\(p\.image\)/);
    expect(read("app/sitemap.ts")).toMatch(/publicImagePath\(p\.image\)/);
  });
});
