// ============================================================
// نگهبانِ کلیدِ یکتای سفارش — نه دوبار سفارش، نه نادیده‌گرفتنِ تغییر
// ============================================================
// بک‌اند با Idempotency-Key از ثبتِ دوباره‌ی سفارش جلوگیری می‌کند
// (routes/orders.js:41-49): همان کلید یعنی «همان سفارش» و پاسخِ قبلی برمی‌گردد.
// این مکانیزم فقط وقتی کار می‌کند که فرانت‌اند در تلاشِ دوباره‌ی *همان سفارش*
// همان کلید را بفرستد. نسخه‌ی قبلی در هر کلیک یک کلید تازه می‌ساخت؛ این آزمون
// دو طرف را قفل می‌کند:
//
//   ۱) رفتارِ خالصِ store (همان کلید تا وقتی امضا همان است؛ چرخش با تغییر امضا)
//   ۲) سیم‌کشیِ CheckoutContent (شکلِ کد — چون نگهبانِ رفتاریِ کامپوننت برای
//      یک خط کد، هزینه‌ی یک محیطِ رندرِ کامل را توجیه نمی‌کند و سابقه‌ی این
//      مخزن هم سنجشِ سورس است، مثلِ V38 در test-smoke).
//
// نکته: اگر روزی کسی `idempotencyKey: newIdempotencyKey()` را برگرداند، تستِ
// دوم می‌شکند؛ اگر کسی شرطِ چرخشِ امضا را بردارد، تستِ اول.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createOrderKeyStore, orderSignature } from "@/lib/orderKey";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", "..");

const CHECKOUT_SRC = fs.readFileSync(
  path.join(NEXT_DIR, "src", "components", "CheckoutContent.tsx"),
  "utf8",
);

function keyFactory() {
  let n = 0;
  return () => `key-${++n}`;
}

const base = { addressId: 7, items: [{ productId: 1, qty: 2 }] };

describe("orderKey — کلیدِ سفارش", () => {
  it("دو تلاشِ پیاپی با همان امضا همان کلید را می‌فرستند (دوبار سفارش ممنوع)", () => {
    const store = createOrderKeyStore(keyFactory());
    const sig = orderSignature(base);
    expect(store.keyFor(sig)).toBe(store.keyFor(sig));
    expect(store.keyFor(orderSignature(base))).toBe("key-1");
  });

  it("تغییر آدرس کلید را می‌چرخاند (سفارش قبلی نباید برگردد)", () => {
    const store = createOrderKeyStore(keyFactory());
    const a = store.keyFor(orderSignature(base));
    const b = store.keyFor(orderSignature({ ...base, addressId: 8 }));
    expect(b).not.toBe(a);
  });

  it("تغییر کالا یا تعداد کلید را می‌چرخاند", () => {
    const store = createOrderKeyStore(keyFactory());
    const a = store.keyFor(orderSignature(base));
    const b = store.keyFor(orderSignature({ ...base, items: [{ productId: 1, qty: 3 }] }));
    const c = store.keyFor(orderSignature({ ...base, items: [{ productId: 2, qty: 2 }] }));
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("ترتیب کالاها در سبد، کلید را بی‌دلیل عوض نمی‌کند", () => {
    const two = [{ productId: 1, qty: 1 }, { productId: 2, qty: 5 }];
    const store = createOrderKeyStore(keyFactory());
    const a = store.keyFor(orderSignature({ ...base, items: two }));
    const b = store.keyFor(orderSignature({ ...base, items: [...two].reverse() }));
    expect(b).toBe(a);
  });

  it("تغییر کد تخفیف کلید را می‌چرخاند", () => {
    const store = createOrderKeyStore(keyFactory());
    const a = store.keyFor(orderSignature({ ...base, couponCode: "OFF10" }));
    const b = store.keyFor(orderSignature({ ...base, couponCode: null }));
    expect(b).not.toBe(a);
  });

  it("reset کلیدِ بعدی را تازه می‌کند (بعد از ثبت موفق)", () => {
    const store = createOrderKeyStore(keyFactory());
    const sig = orderSignature(base);
    store.keyFor(sig);
    store.reset();
    expect(store.keyFor(sig)).toBe("key-2");
  });
});

describe("orderKey — سیم‌کشیِ صفحه‌ی پرداخت", () => {
  it("CheckoutContent کلید را از orderKey می‌گیرد، نه از یک کلیدِ تازه در هر تلاش", () => {
    expect(CHECKOUT_SRC).toMatch(
      /import\s*\{[^}]*createOrderKeyStore[^}]*\}\s*from\s*"@\/lib\/orderKey"/,
    );
    expect(CHECKOUT_SRC).toMatch(/idempotencyKey:\s*orderKeys\.keyFor\(signature\)/);
    expect(CHECKOUT_SRC).not.toMatch(/idempotencyKey:\s*newIdempotencyKey\(\)/);
  });

  it("امضا از همان سه چیزی ساخته می‌شود که سفارش را تعریف می‌کنند", () => {
    expect(CHECKOUT_SRC).toMatch(/orderSignature\(\{/);
    expect(CHECKOUT_SRC).toMatch(/addressId:\s*selectedAddrId/);
    expect(CHECKOUT_SRC).toMatch(/items:\s*cart\s*\?/);
    expect(CHECKOUT_SRC).toMatch(/couponCode:\s*cart\?\.coupon\?\.code/);
  });
});
