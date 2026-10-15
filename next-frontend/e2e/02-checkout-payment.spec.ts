// ============================================================
// سناریو ۲ — سبد → تسویه → پرداخت → نتیجه
// ============================================================
// گران‌ترین مسیرِ سایت: اگر این‌جا چیزی بشکند، مشتری پول می‌دهد و صفحهٔ مرده
// می‌بیند (یا بدتر، پول می‌دهد و سفارشش ثبت نمی‌شود).
//
// چه چیزی *فقط* این‌جا سنجیده می‌شود: برگشتِ واقعی از درگاه. بک‌اند در حالتِ
// آزمایشی یک `paymentUrl` می‌سازد که به `/api/orders/payment-callback` روی
// **مبدأ سایت** (Next) اشاره می‌کند؛ مرورگر آن را باز می‌کند، Next پروکسی
// می‌کند، بک‌اند تایید می‌کند و به `/order-success` هدایت می‌کند. اگر روزی
// `SITE_URL` یا ترتیبِ ریدایرکت‌ها عوض شود، این آزمون — و نه هیچ آزمونِ دیگری —
// آن را می‌گیرد.
import { test, expect } from "@playwright/test";
import { currentUser, freshPhone, loginWithOtp } from "./helpers";

/** وضعیتِ سفارش‌های همین کاربر از چشمِ مرورگر (کوکیِ همان نشست). */
async function myOrders(page: import("@playwright/test").Page) {
  const res = await page.request.get("/api/orders/mine");
  expect(res.ok()).toBe(true);
  return (await res.json()).orders as Array<{ id: number; status: string; total: number }>;
}

test("ثبتِ سفارش و برگشتِ موفق از درگاه", async ({ page }) => {
  const phone = freshPhone();
  await loginWithOtp(page, phone, { redirect: "/products" });
  expect((await currentUser(page))?.phone).toBe(phone);

  // ۱) افزودن از خودِ صفحهٔ محصولات — همان دکمه‌ای که مشتری می‌زند.
  await page.goto("/products");
  const addButtons = page.locator('button[aria-label*="به سبد خرید"]:not([disabled])');
  await expect(addButtons.first(), "هیچ محصولِ قابل‌خریدی روی صفحه نبود").toBeVisible();
  const addedLabel = await addButtons.first().getAttribute("aria-label");
  await addButtons.first().click();

  // ۲) سبد باید همان کالا را داشته باشد و راهِ تسویه باز باشد.
  await page.goto("/cart");
  await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
  await page.locator('a[href="/checkout"]').click();
  await expect(page).toHaveURL(/\/checkout/);

  // ۳) آدرس (کاربرِ تازه هیچ آدرسی ندارد، پس فرم همان اول باز است).
  await page.locator("#coFullName").fill("گیرندهٔ آزمون");
  await page.locator("#coPhone").fill(phone);
  await page.locator("#coProvince").fill("تهران");
  await page.locator("#coCity").fill("تهران");
  await page.locator("#coAddressLine").fill("خیابان آزمون، کوچهٔ ۱، پلاک ۱");
  // `exact` لازم است: «پرداخت و ثبت سفارش» هم زیررشتهٔ «ثبت» را دارد و
  // بدونِ آن، locator به دو عنصر می‌خورد و آزمون پیش از کلیک می‌ایستد.
  await page.getByRole("button", { name: "ثبت", exact: true }).click();

  // ۴) پرداخت — دکمه بعد از ذخیرهٔ آدرس فعال می‌شود (آدرسِ تازه خودش انتخاب می‌شود).
  const pay = page.getByRole("button", { name: "پرداخت و ثبت سفارش" });
  await expect(pay).toBeEnabled();
  await pay.click();

  // ۵) برگشتِ درگاه: مرورگر از callback می‌گذرد و روی نتیجهٔ سفارش می‌نشیند.
  await expect(page).toHaveURL(/\/order-success\?orderId=\d+/, { timeout: 30_000 });
  await expect(page.getByText("پرداخت‌شده").first()).toBeVisible({ timeout: 30_000 });

  // ۶) و مهرِ نهایی: خودِ API می‌گوید *همین* سفارش پرداخت‌شده است.
  //    جست‌وجو با شناسهٔ خودِ URL، نه «آخرین سفارش» — با ترتیبِ لیست گره نمی‌خوریم.
  const orderId = Number(/orderId=(\d+)/.exec(page.url())?.[1]);
  const orders = await myOrders(page);
  const placed = orders.find((o) => o.id === orderId);
  expect(placed, `سفارش ${orderId} در لیست سفارش‌های کاربر نبود`).toBeTruthy();
  expect(placed?.status).toBe("paid");
  expect(placed?.total).toBeGreaterThan(0);

  // ۷) سبد بعد از خرید خالی شده — وگرنه سفارشِ بعدی دوباره همان کالا را می‌خرد.
  const cart = await page.request.get("/api/cart");
  const cartBody = await cart.json();
  expect(cartBody.items ?? []).toHaveLength(0);

  // یادآوریِ نامِ کالایی که خریدیم، برای خواندنِ لاگِ شکست.
  expect(addedLabel).toContain("به سبد خرید");
});
