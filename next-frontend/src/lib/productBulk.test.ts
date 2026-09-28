// ============================================================
// عملیاتِ گروهی — آینه‌ی فهرستِ سرور
// ============================================================
// مهم‌ترین چیزی که این آزمون قفل می‌کند یک تساوی است: مجموعه‌ی عملیاتی که پنل
// *نشان می‌دهد* با `BULK_OPS` در routes/admin.js یکی باشد. اگر روزی سرور
// عملیاتی را بردارد یا نامش را عوض کند، منوی پنل نباید گزینه‌ای نشان بدهد که
// با ۴۰۰ «عملیات نامعتبر است» برمی‌گردد — و اگر سرور عملیاتِ تازه‌ای اضافه کند،
// نباید بی‌صدا در پنل غایب بماند.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BULK_OPS,
  bulkOp,
  bulkPayloadValue,
  bulkValueError,
} from "@/lib/productBulk";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROUTES = path.resolve(HERE, "..", "..", "..", "backend", "routes", "admin.js");
const SERVER_SRC = fs.readFileSync(SERVER_ROUTES, "utf8");

/** فهرستِ عملیات از خودِ سورسِ سرور خوانده می‌شود، نه از یک کپیِ دستی */
function serverOps(): string[] {
  const m = SERVER_SRC.match(/const BULK_OPS = \[([^\]]*)\]/);
  expect(m, "BULK_OPS در routes/admin.js پیدا نشد").not.toBeNull();
  return (m as RegExpMatchArray)[1]
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

describe("فهرستِ عملیات", () => {
  it("هر عملیاتی که پنل نشان می‌دهد، در سرور هم هست", () => {
    const missing = BULK_OPS.map((o) => o.op).filter((op) => !serverOps().includes(op));
    expect(missing).toEqual([]);
  });

  it("هر عملیاتِ سرور در پنل هم دیده می‌شود (تازه‌ها بی‌صدا غایب نمی‌مانند)", () => {
    const shown = BULK_OPS.map((o) => o.op);
    const hidden = serverOps().filter((op) => !shown.includes(op));
    expect(hidden).toEqual([]);
  });

  it("هر عملیات برچسبِ فارسیِ یکتا دارد", () => {
    const labels = BULK_OPS.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.every((l) => /[\u0600-\u06FF]/.test(l))).toBe(true);
  });

  it("عملیاتِ برچسب‌دارِ سرور هم برچسب دارند (BULK_LABEL)", () => {
    // سرور برای دفتر رویدادها `BULK_LABEL` دارد؛ همه‌ی کلیدهایش باید همان
    // عملیات‌ها باشند، وگرنه لاگ یک عملیات را بی‌نام می‌نویسد.
    for (const op of bulkOpsWithLabel()) {
      expect(bulkOp(op), `${op} در پنل نیست`).toBeDefined();
    }
  });
});

function bulkOpsWithLabel(): string[] {
  const m = SERVER_SRC.match(/const BULK_LABEL = \{([\s\S]*?)\};/);
  expect(m).not.toBeNull();
  return [...(m as RegExpMatchArray)[1].matchAll(/(\w+):/g)].map((x) => x[1]);
}

describe("مقدارِ عملیات", () => {
  it("عملیات‌های بدونِ مقدار، مقدار هم نمی‌فرستند", () => {
    for (const op of ["clear_badge", "discount_end", "publish", "unpublish"]) {
      expect(bulkValueError(op, "", NaN)).toBeNull();
      expect(bulkPayloadValue(op, "", NaN)).toBeUndefined();
    }
  });

  it("عملیاتِ متنی بدونِ مقدار اجرا نمی‌شود", () => {
    expect(bulkValueError("set_category", "  ", NaN)).toBe("مقدار لازم است");
    expect(bulkPayloadValue("set_category", "  رنگ  ", NaN)).toBe("رنگ");
  });

  it("درصدِ تغییرِ قیمت بین ۱-۹۰ و ۹۰۰ است", () => {
    expect(bulkValueError("price_pct", "", -90)).toBeNull();
    expect(bulkValueError("price_pct", "", 900)).toBeNull();
    expect(bulkValueError("price_pct", "", -91)).toContain("۹۰-");
    expect(bulkValueError("price_pct", "", 901)).toContain("۹۰۰");
    expect(bulkValueError("price_pct", "", 1.5)).toContain("عددِ درست");
  });

  it("تخفیفِ گروهی بین ۱ و ۹۰ است — صفر بی‌معنی و بالای ۹۰ مجانی است", () => {
    expect(bulkValueError("discount", "", 1)).toBeNull();
    expect(bulkValueError("discount", "", 90)).toBeNull();
    expect(bulkValueError("discount", "", 0)).toContain("۱ تا ۹۰");
    expect(bulkValueError("discount", "", 91)).toContain("۱ تا ۹۰");
  });

  it("موجودیِ منفی و عظیم رد می‌شود", () => {
    expect(bulkValueError("set_stock", "", -1)).toContain("۰ و ۱۰۰۰۰۰۰");
    expect(bulkValueError("set_stock", "", 1_000_001)).toContain("۰ و ۱۰۰۰۰۰۰");
    expect(bulkValueError("add_stock", "", 5)).toBeNull();
  });

  it("عملیاتِ ناشناخته رد می‌شود، نه اینکه بی‌صدا رد شود", () => {
    expect(bulkValueError("drop_table", "", 1)).toBe("عملیات نامعتبر است");
    expect(bulkPayloadValue("drop_table", "", 1)).toBeUndefined();
  });

  it("مقدارِ عددی همان عدد می‌رود، و متنی همین‌طور", () => {
    expect(bulkPayloadValue("set_stock", "12", 12)).toBe(12);
    expect(bulkPayloadValue("set_badge", " آفر ", NaN)).toBe("آفر");
  });
});
