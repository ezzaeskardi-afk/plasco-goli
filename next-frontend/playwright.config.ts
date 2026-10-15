import { defineConfig, devices } from "@playwright/test";

// ============================================================
// کانفیگِ Playwright — سناریوهای واقعیِ مرورگر
// ============================================================
//
// این کانفیگ **به‌تنهایی اجرا نمی‌شود**. دروازهٔ ورودش یک شرطِ صریح است:
// متغیرهای محیطی باید از `scripts/e2e.mjs` آمده باشند — همان اسکریپتی که
// سندباکس می‌سازد، بک‌اندِ یک‌بارمصرف و Next را بالا می‌آورد، و مسیرِ لاگِ
// بک‌اند را به آزمون‌ها می‌دهد.
//
// چرا این شرط لازم است: بدونش، `npx playwright test` خام روی ماشینِ توسعه‌دهنده
// می‌توانست بی‌سروصدا به **دیتابیسِ واقعیِ مغازه** بزند (سفارش بسازد، موجودی
// کم کند). خودِ پروژه یک بار هزینهٔ همین جنس خطا را داده است: یک تست ۵۴ عدد
// از موجودیِ واقعی را خورد (`backend/tests/sandbox.js` سرآغازش را دارد).
// پس «اجرا نشد» این‌جا یک خطای واضح است، نه یک سبزِ توخالی.

if (!process.env.PG_E2E_WEB) {
  throw new Error(
    "این آزمون‌ها فقط از طریق `npm run e2e` اجرا می‌شوند "
    + "(اسکریپتِ scripts/e2e.mjs سرورها و سندباکس را می‌سازد). "
    + "اجرای مستقیمِ `playwright test` عمداً ممکن نیست تا به دیتابیسِ واقعی دست نخورد."
  );
}

export default defineConfig({
  testDir: "./e2e",
  // سناریوها روی یک سندباکسِ مشترک اجرا می‌شوند (سبد و سفارش یکی است)، پس
  // موازی‌سازی خاموش است. ورکر ۱: ترتیبِ فایل‌ها قطعی می‌ماند.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "e2e/.artifacts/test-results",
  use: {
    baseURL: process.env.PG_E2E_WEB,
    locale: "fa-IR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
