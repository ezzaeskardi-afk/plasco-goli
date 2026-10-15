// کمک‌کننده‌های آزمونِ مرورگر — یک جا، چون هر سه سناریو «ورود با کد پیامکی» را
// لازم دارند و کدِ پیامکی فقط در لاگِ stdoutِ بک‌اند پیدا می‌شود.
//
// چرا از لاگ می‌خوانیم و نه از دیتابیس: جدولِ `otp_codes` **هشِ** کد را نگه
// می‌دارد، نه خودش. تنها جایی که کدِ خام دیده می‌شود «حالتِ آزمایشیِ» `lib/sms.js`
// است که همان کارِ واقعیِ توسعه‌دهنده را می‌کند: چاپ در کنسول. پس آزمون دقیقاً
// همان چیزی را می‌خواند که آدمِ پشتِ سرور می‌خواند.

import fs from "node:fs";
import { Page, expect } from "@playwright/test";

/** متغیرها فقط از `scripts/e2e.mjs` می‌آیند؛ کانفیگ هم همین را الزام می‌کند. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`متغیرِ محیطیِ ${name} نیست — آزمون را با \`npm run e2e\` اجرا کنید`);
  return value;
}

export const backEndLogPath = () => required("PG_E2E_BACKEND_LOG");
export const ADMIN_PHONE = () => required("PG_E2E_ADMIN_PHONE");
export const TOTP_SECRET = () => required("PG_E2E_TOTP_SECRET");
export const recoveryCodes = () =>
  required("PG_E2E_RECOVERY_CODES").split(",").map((c) => c.trim()).filter(Boolean);

/**
 * شمارهٔ تازه برای هر اجرا.
 *
 * چرا تصادفی: جدولِ `otp_codes` در کپیِ دیتابیس ممکن است سطرِ تازه‌ای برای یک
 * شمارهٔ ثابت داشته باشد و پنجرهٔ ۳۰ ثانیه‌ایِ ارسال مجدد، همان اول آزمون را
 * به ۴۲۹ بخورد. شمارهٔ تازه یعنی آزمون هرگز به ساعتِ اجرا گره نمی‌خورد.
 */
export function freshPhone(): string {
  const tail = String(Math.floor(1000000 + Math.random() * 8999999));
  return `0912${tail}`;
}

/** اندازهٔ فعلیِ لاگ به بایت — «نشانهٔ» پیش از یک درخواست. */
export function logMark(): number {
  try { return fs.statSync(backEndLogPath()).size; } catch { return 0; }
}

/**
 * کدِ ۵ رقمی را از لاگِ بک‌اند می‌خواند (متنِ حالتِ آزمایشی) و تا آمدنش صبر می‌کند.
 *
 * `afterByte` آن «نشانه»ای است که *قبل از* درخواست گرفته شده. بدونِ آن، یک
 * کدِ کهنه از درخواستِ قبلی — همان شماره در سناریوهای بعدی — به‌عنوان پاسخِ
 * همین درخواست خوانده می‌شد و آزمون، به‌جای گرفتنِ ۴۲۹ِ واقعی، یک کدِ
 * مصرف‌شده را در فرم می‌ریخت و بعد «چرا فرم جلو نرفت» می‌پرسید.
 * `null` یعنی در مهلت هیچ کدِ تازه‌ای نیامد (مثلاً سرور ۴۲۹ داده و پیامکی
 * نفرستاده) — این خطا نیست، «سرده‌شدنِ عمدی» است.
 */
export async function readOtpFromLog(
  phone: string,
  { afterByte = 0, timeoutMs = 25_000 }: { afterByte?: number; timeoutMs?: number } = {}
): Promise<string | null> {
  const logPath = backEndLogPath();
  const deadline = Date.now() + timeoutMs;
  const pattern = new RegExp(`${phone}: (\\d{5})`, "g");
  while (Date.now() < deadline) {
    try {
      const text = fs.readFileSync(logPath).subarray(afterByte).toString("utf8");
      const matches = [...text.matchAll(pattern)];
      if (matches.length) return matches[matches.length - 1][1];
    } catch { /* هنوز نوشته نشده */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/**
 * دکمهٔ «دریافت کد ورود» را می‌زند و کدِ *همین درخواست* را برمی‌گرداند.
 *
 * اگر سرور کدی نفرستد، **خطا می‌دهد** — و این عمدی است. سرور برای هر شماره
 * یک مهلتِ ارسال مجدد دارد (۳۰ ثانیه) و در آن بازه با ۴۲۹ جواب می‌دهد بدونِ
 * فرستادنِ پیامکِ تازه. یک آزمونِ ساده‌لوح در آن حالت کدِ کهنهٔ لاگ را
 * برمی‌داشت، در فرم می‌ریخت، و بعد در جای بی‌ربطی می‌شکست. این‌جا همان حالت
 * یک خطای صریح می‌شود که خودش می‌گوید مهلتِ ارسال مجدد چقدر بوده.
 * (خودِ رفتار ۴۲۹ جای دیگری سنجیده می‌شود: `01-login-otp.spec.ts`.)
 */
export async function requestOtpCode(page: Page, phone: string): Promise<string> {
  const mark = logMark();
  const replied = page.waitForResponse(
    (r) => r.url().includes("/api/auth/otp/request"),
    { timeout: 30_000 }
  );
  await page.getByRole("button", { name: "دریافت کد ورود" }).click();
  const res = await replied;

  const code = await readOtpFromLog(phone, { afterByte: mark, timeoutMs: 10_000 });
  if (code) return code;

  const body = (await res.json().catch(() => ({}))) as { retryAfter?: number; error?: string };
  const wait = Number(body.retryAfter);
  throw new Error(
    `سرور برای ${phone} کدی نفرستاد (HTTP ${res.status()}${body.error ? ` — ${body.error}` : ""})`
    + (wait > 0
      ? `؛ این شماره ${wait} ثانیه مهلتِ ارسال مجدد دارد، پس کدِ کهنه در لاگ هست `
        + "ولی کدِ *تازه‌ای* نیامده است"
      : "")
  );
}

/** پنج باکسِ کدِ یک‌بارمصرف را پر می‌کند؛ رقمِ پنجم خودش فرم را می‌فرستد. */
export async function fillOtp(page: Page, code: string): Promise<void> {
  const boxes = page.locator('input[autocomplete="one-time-code"]');
  await expect(boxes).toHaveCount(5);
  for (let i = 0; i < 5; i++) await boxes.nth(i).fill(code[i]);
}

export type LoginOutcome = "customer" | "second-factor";

/**
 * بعد از کدِ پیامکی سه سرنوشت ممکن است: مرحلهٔ نام (کاربرِ تازه)، عاملِ دوم
 * (مدیر)، یا جابه‌جاییِ ساده (مشتریِ قدیمی). این تابع اولیِ‌شان را تشخیص می‌دهد.
 *
 * چرا حلقه و نه یک `expect`ِ ساده: هر سه حالت هم‌زمان معتبرند و هیچ‌کدام
 * «حالتِ اصلی» نیست؛ اگر یکی را الزام کنیم، آزمون به ترتیبِ داخلیِ فرم گره
 * می‌خورد نه به مسیرِ کاربر.
 */
async function waitForPostOtpStep(page: Page, timeoutMs = 30_000): Promise<"name" | "second-factor" | "gone"> {
  const deadline = Date.now() + timeoutMs;
  const nameStep = page.getByPlaceholder("نام و نام خانوادگی");
  const second = page.getByRole("heading", { name: /کد تأیید دو مرحله/ });
  while (Date.now() < deadline) {
    if (await nameStep.isVisible().catch(() => false)) return "name";
    if (await second.isVisible().catch(() => false)) return "second-factor";
    if (!new URL(page.url()).pathname.startsWith("/login")) return "gone";
    await page.waitForTimeout(150);
  }
  throw new Error("بعد از کد پیامکی، فرم نه مرحلهٔ نام را نشان داد، نه عاملِ دوم، و نه صفحه را عوض کرد");
}

/**
 * ورودِ کامل از رابطِ کاربر — همان مسیری که مشتری می‌رود:
 * شماره → کد پیامکی → (نام، اگر کاربر تازه باشد) یا (عاملِ دوم، اگر مدیر باشد).
 *
 * خروجی می‌گوید کدام شاخه دیده شد؛ سناریوی پنل روی `second-factor` ادامه می‌دهد.
 *
 * اگر این شماره در فاصلهٔ مهلتِ ارسال مجدد باشد (سناریوی «ورودِ دوم با همان
 * شماره»)، `requestOtpCode` خودش با عددِ سرور صبر می‌کند و باز می‌زند.
 */
export async function loginWithOtp(
  page: Page,
  phone: string,
  { redirect, onLoginPage = false }: { redirect?: string; onLoginPage?: boolean } = {}
): Promise<LoginOutcome> {
  // `onLoginPage` برای مسیرهای محافظت‌شده است: middleware کاربر را با
  // `?redirect=/admin` به ورود می‌فرستد و ناوبریِ دوباره به `/login` همان
  // مقصد را پاک می‌کند — یعنی آزمون دیگر مسیری را که کاربر می‌رود نمی‌سنجد.
  if (!onLoginPage) {
    await page.goto(redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login");
  }
  await page.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(phone);

  const code = await requestOtpCode(page, phone);
  await fillOtp(page, code);

  const step = await waitForPostOtpStep(page);
  if (step === "second-factor") return "second-factor";

  if (step === "name") {
    await page.getByPlaceholder("نام و نام خانوادگی").fill(CUSTOMER_NAME);
    await page.getByRole("button", { name: "ورود به فروشگاه" }).click();
  }
  return "customer";
}

/** نامِ ثابتی که آزمون‌ها انتظار دیدنش را دارند. */
export const CUSTOMER_NAME = "مشتری آزمون";

/**
 * کاربرِ واردشده از چشمِ خودِ مرورگر (کوکیِ همان نشست) خوانده می‌شود.
 *
 * `fullName` هم در تایپ هست چون `publicUser` سرور آن را می‌فرستد و سناریوی
 * «مرحلهٔ نام فقط یک بار پرسیده می‌شود» به آن تکیه دارد؛ بدونش آن ادعا فقط
 * یک خطای کامپایل می‌شد، نه یک سنجش.
 */
export async function currentUser(
  page: Page
): Promise<{ id?: number; phone?: string; fullName?: string } | null> {
  const res = await page.request.get("/api/auth/me");
  if (!res.ok()) return null;
  const body = await res.json();
  return body?.user ?? null;
}
