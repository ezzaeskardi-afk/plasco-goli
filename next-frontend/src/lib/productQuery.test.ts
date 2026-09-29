import { describe, it, expect } from "vitest";
import {
  normalizeListingQuery,
  canonicalListingQuery,
  LEGACY_QUERY_KEYS,
} from "./productQuery";

describe("normalizeListingQuery — کلیدهای عصرِ Express هم خوانده می‌شوند", () => {
  it("`cat` را به `category` ترجمه می‌کند", () => {
    expect(normalizeListingQuery({ cat: "سطل" }).category).toBe("سطل");
  });

  it("`min`/`max` را به `minPrice`/`maxPrice` ترجمه می‌کند", () => {
    const p = normalizeListingQuery({ min: "10000", max: "50000" });
    expect(p.minPrice).toBe(10000);
    expect(p.maxPrice).toBe(50000);
  });

  it("`inStock` را به `inStockOnly` ترجمه می‌کند", () => {
    expect(normalizeListingQuery({ inStock: "1" }).inStockOnly).toBe(true);
    expect(normalizeListingQuery({ inStock: "0" }).inStockOnly).toBe(false);
  });

  it("وقتی هر دو کلید آمده‌اند، کلیدِ تازه اولویت دارد", () => {
    const p = normalizeListingQuery({ cat: "قدیمی", category: "تازه" });
    expect(p.category).toBe("تازه");
  });

  it("هر کلیدِ قدیمی یک معادلِ تازه دارد (نگهبانِ خودِ نگاشت)", () => {
    expect(LEGACY_QUERY_KEYS).toMatchObject({
      cat: "category",
      min: "minPrice",
      max: "maxPrice",
      inStock: "inStockOnly",
    });
  });

  it("بازه‌ی وارونه را صاف می‌کند، نه اینکه نتیجه‌ی خالی بدهد", () => {
    const p = normalizeListingQuery({ min: "500", max: "100" });
    expect(p.minPrice).toBe(100);
    expect(p.maxPrice).toBe(500);
  });

  it("`page` نامعتبر یا صفر به ۱ برمی‌گردد", () => {
    for (const page of ["", "0", "-2", "abc", undefined]) {
      expect(normalizeListingQuery({ page }).page).toBe(1);
    }
    expect(normalizeListingQuery({ page: "3" }).page).toBe(3);
  });

  it("عددِ منفی یا نامعتبر در بازه‌ی قیمت نادیده گرفته می‌شود", () => {
    const p = normalizeListingQuery({ min: "-5", max: "abc" });
    expect(p.minPrice).toBeUndefined();
    expect(p.maxPrice).toBeUndefined();
  });
});

describe("canonicalListingQuery — لینکی که خودِ سایت می‌سازد", () => {
  it("فقط کلیدهای امروزی را می‌نویسد، حتی اگر ورودی قدیمی بوده باشد", () => {
    const qs = canonicalListingQuery(normalizeListingQuery({ cat: "سطل", min: "10" }));
    expect(qs).toContain("category=");
    expect(qs).toContain("minPrice=10");
    expect(qs).not.toContain("cat=");
    expect(qs).not.toContain("min=");
  });

  it("مقادیرِ پیش‌فرض را حذف می‌کند تا کانونیکال یکتا بماند", () => {
    expect(canonicalListingQuery(normalizeListingQuery({ page: "1" }))).toBe("");
    expect(canonicalListingQuery(normalizeListingQuery({ page: "2" }))).toBe("page=2");
    expect(canonicalListingQuery(normalizeListingQuery({}))).toBe("");
  });
});
