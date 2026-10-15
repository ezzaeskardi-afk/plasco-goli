// ============================================================
// سناریو ۳ — درِ پنل: عاملِ دوم و راهِ برگشتِ اضطراری
// ============================================================
// دو چیز این‌جا سنجیده می‌شود که هیچ آزمونِ دیگری نمی‌سنجد:
//
//   ۱. *ترتیبِ واقعیِ* در: رفتن به `/admin` بدونِ ورود، پرتاب به صفحهٔ ورود با
//      `?redirect=/admin`، و برگشتن روی همان `/admin` بعد از دو عامل. اگر
//      روزی middleware یا فرم ترتیبشان را عوض کند، مشتری پشتِ یک حلقهٔ ورود
//      می‌ماند و کسی نمی‌فهمد چرا.
//   ۲. کدِ پشتیبان در مرورگرِ واقعی — همان روزِ بدی که گوشیِ مدیر گم شده و
//      کاغذِ کدها تنها راهِ بازکردنِ در است. و «یک‌بارمصرف» بودنش: همان کد
//      در یک مرورگرِ تازه باید **رد** شود، نه این‌که دوباره باز کند.
import path from "node:path";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
import { ADMIN_PHONE, TOTP_SECRET, loginWithOtp, recoveryCodes } from "./helpers";

const requireFromHere = createRequire(__filename);

/** کدِ همین لحظهٔ اپِ Authenticator — از همان پیاده‌سازیِ سرور، نه یک کپیِ محلی. */
function currentTotpCode(): string {
  const backendDir = process.env.PG_E2E_BACKEND_DIR;
  if (!backendDir) throw new Error("PG_E2E_BACKEND_DIR نیست — آزمون را با `npm run e2e` اجرا کنید");
  const totp = requireFromHere(path.join(backendDir, "lib", "totp.js"));
  return String(totp.totp(TOTP_SECRET()));
}

/** کدِ ۶ رقمیِ اپ را در باکس‌هایش می‌ریزد؛ رقمِ ششم خودش فرم را می‌فرستد. */
async function fillTotp(page: import("@playwright/test").Page, code: string): Promise<void> {
  const boxes = page.locator('input[autocomplete="one-time-code"]');
  await expect(boxes).toHaveCount(6);
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i]);
}

test("پنل بدونِ ورود ۴۰۴ نمی‌دهد، به ورود می‌فرستد و با کدِ اپ برمی‌گردد", async ({ page }) => {
  // مسیرِ محافظت‌شده: middleware باید به صفحهٔ ورود بفرستد، با مقصدِ همان صفحه.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin/);

  const outcome = await loginWithOtp(page, ADMIN_PHONE(), { onLoginPage: true });
  expect(outcome, "مدیرِ کلیددار باید مرحلهٔ عاملِ دوم را ببیند").toBe("second-factor");

  await fillTotp(page, currentTotpCode());

  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "داشبورد" })).toBeVisible();
});

test("کدِ پشتیبان در: ورود می‌دهد، می‌گوید چند تا مانده، و دوباره کار نمی‌کند", async ({ page, browser }) => {
  const codes = recoveryCodes();
  expect(codes.length, "برای این آزمون چند کدِ پشتیبان لازم است").toBeGreaterThan(1);
  const code = codes[0];

  await page.goto("/admin");
  expect(await loginWithOtp(page, ADMIN_PHONE(), { onLoginPage: true })).toBe("second-factor");

  // مسیرِ «گوشی‌ام در دسترس نیست» — دکمه‌ای که روزِ گم‌شدنِ گوشی تنها راه است.
  await page.getByRole("button", { name: /کد پشتیبان دارم/ }).click();
  await page.getByPlaceholder("XXXX-XXXX-XXXX").fill(code);
  await page.getByRole("button", { name: "تأیید کد پشتیبان" }).click();

  // ورود می‌شود، ولی یک قدم می‌ایستد تا بگوید کاغذ دارد ته می‌کشد.
  await expect(page.getByRole("heading", { name: "با کد پشتیبان وارد شدید" })).toBeVisible();
  const remaining = page.locator('p[role="status"]');
  await expect(remaining).toBeVisible();
  await expect(remaining).toContainText(/کد/);

  await page.getByRole("button", { name: "ورود به پنل" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });

  // ---------- مصرفِ دائمی ----------
  // یک مرورگرِ تازه (بدونِ کوکی) همان کد را دوباره وارد می‌کند. اگر سرور
  // «یک‌بارمصرف» را جدی نگیرد، این‌جا دوباره باز می‌شود و کلِ مدلِ امنیتیِ
  // کدِ پشتیبان می‌ریزد.
  const ctx = await browser.newContext();
  try {
    const fresh = await ctx.newPage();
    await fresh.goto("/admin");
    expect(await loginWithOtp(fresh, ADMIN_PHONE(), { onLoginPage: true })).toBe("second-factor");

    await fresh.getByRole("button", { name: /کد پشتیبان دارم/ }).click();
    await fresh.getByPlaceholder("XXXX-XXXX-XXXX").fill(code);
    await fresh.getByRole("button", { name: "تأیید کد پشتیبان" }).click();

    await expect(fresh.getByText(/قبلاً مصرف شده/)).toBeVisible();
    await expect(fresh).toHaveURL(/\/login/);
    await expect(fresh.getByRole("heading", { name: "با کد پشتیبان وارد شدید" })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
