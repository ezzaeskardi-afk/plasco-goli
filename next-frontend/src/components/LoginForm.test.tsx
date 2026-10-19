// ============================================================
// آزمونِ «بعد از ورود، مشتری در صفحه‌ی بارگذاری گیر نمی‌کند»
// ============================================================
// بدترین مسیرِ ممکن تا امروز این بود: مشتری از درگاهِ ورود می‌آمد
// (`/login?redirect=/order-success?orderId=…`)، کد را می‌زد، و بعد `router.push`
// به مقصد هیچ‌وقت تعیین‌تکلیف نمی‌شد. نه خطایی پرتاب می‌شود، نه promiseای رد
// می‌شود، نه کامپوننت unmount می‌شود — پس نه پیامِ خطایی هست و نه راهی برای
// بیرون آمدن؛ مشتری روی فرمِ برگشته به حالتِ عادی یا روی اسکلتونِ بی‌زبانِ
// بارگذاری می‌ماند و نمی‌داند وارد شده یا نه.
//
// این آزمون‌ها همان گارد را می‌سنجند: اگر تا `NAV_FALLBACK_MS` ناوبریِ نرم
// شروع نشده باشد (یعنی کامپوننت هنوز زنده است)، همان آدرس با ناوبریِ کاملِ
// مرورگر باز می‌شود. معکوسش هم مهم است: اگر انتقال *شروع* شده باشد (کامپوننت
// unmount شده)، آن ناوبریِ کامل نباید اجرا شود — وگرنه وسطِ بارگذاریِ صفحه‌ی
// مقصد، کارِ انجام‌شده از نو از صفر می‌شود.
//
// عددها عمداً تکرار شده‌اند (منبع: LoginForm.tsx) تا آزمون انتظاراتش را
// مستقل بگوید و تغییرِ ثابتِ اصلی دیده شود.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginForm } from "@/components/LoginForm";
import {
  ApiError,
  getChallenge,
  passwordLogin,
  requestOtp,
  saveProfile,
  verifyOtp,
  verifyTotp,
} from "@/lib/api";
import { hardNavigate } from "@/lib/navigation";
import type { OtpVerifyResponse, User } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// ------------------------------------------------------------
// وابستگی‌های مرزی
// ------------------------------------------------------------
// مسیریابِ Next بیرون از درختِ اپ کار نمی‌کند. هر دو هوک باید شیءِ **ثابت**
// برگردانند (همان دلیلی که در آزمونِ مجاور نوشته شده): اگر هر رندر یک شیءِ
// تازه بدهد، callbackهای وابسته هر رندر عوض می‌شوند و effectها بی‌نهایت
// اجرا می‌شوند.
const nav = vi.hoisted(() => {
  const push = vi.fn();
  return {
    push,
    router: { push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() },
    redirect: "/checkout" as string | null,
    cachedFor: undefined as string | null | undefined,
    params: null as URLSearchParams | null,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => {
    if (nav.cachedFor !== nav.redirect || !nav.params) {
      nav.cachedFor = nav.redirect;
      nav.params = new URLSearchParams(
        nav.redirect === null ? {} : { redirect: nav.redirect },
      );
    }
    return nav.params;
  },
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }
  return {
    ApiError,
    getChallenge: vi.fn(),
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    verifyTotp: vi.fn(),
    passwordLogin: vi.fn(),
    saveProfile: vi.fn(),
  };
});

// مرزِ ناوبریِ مرورگر — jsdom نمی‌گذارد `window.location` جعل شود، پس خودِ
// کار در یک ماژول است و اینجا جعل می‌شود.
vi.mock("@/lib/navigation", () => ({
  hardNavigate: vi.fn(),
  reloadPage: vi.fn(),
}));

/** همان عددِ روی دیسک — منبع: LoginForm.tsx */
const NAV_FALLBACK_MS = 4000;

const TEST_USER: User = {
  id: 1,
  phone: "09120000042",
  fullName: "مشتری آزمون",
  isAdmin: false,
  isStaff: false,
  hasPassword: true,
};

/**
 * پاسخِ واقعیِ `POST /api/auth/otp/verify` — همان چیزی که سرور با
 * `res.json({ ok: true, user: publicUser(user), mfaRequired })` می‌فرستد
 * (`backend/routes/auth.js`) و `publicUser` = `{ id, phone, fullName, isAdmin,
 * isStaff, hasPassword }`.
 *
 * چرا سازنده و نه سه شیءِ دست‌ساز: آزمون‌های این فایل پیش از این شکلِ *خیالیِ*
 * پاسخ را می‌ساختند — `fullName` و `isNew` در سطحِ بالا — یعنی همان شکلی که
 * تایپ هم ادعا می‌کرد و سرور هرگز نمی‌فرستاد. نتیجه: آزمون‌ها سبز بودند و
 * مشتریِ همیشگی در مرورگر دوباره نامش پرسیده می‌شد. حالا هر سناریو از همین
 * یکجا می‌آید و نگهبانِ `lib/apiContract.test.ts` فیلدهای همین سازنده را با
 * سورسِ سرور و با اوراکلِ Express مقایسه می‌کند.
 */
function otpVerifyPayload(
  over: Partial<User> = {},
  mfaRequired = false,
): OtpVerifyResponse {
  return {
    ok: true,
    user: { ...TEST_USER, ...over },
    ...(mfaRequired ? { mfaRequired: true } : {}),
  };
}

let container: HTMLDivElement;
let root: Root;
let rootMounted = false;
let queryClient: QueryClient;

function bodyOf(): string {
  return container.textContent ?? "";
}

function buttonOf(text: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(text),
  );
  if (!btn) throw new Error(`دکمه‌ای با متنِ «${text}» روی صفحه نبود`);
  return btn;
}

function buttonLabels(): string[] {
  return Array.from(container.querySelectorAll("button")).map((b) =>
    (b.textContent ?? "").trim(),
  );
}

/** نوشتن در ورودیِ کنترل‌شده — با setterِ اصلیِ DOM، نه تغییرِ مستقیمِ value */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

async function submitForm() {
  const form = container.querySelector("form");
  if (!form) throw new Error("فرمی روی صفحه نبود");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
}

/** تایمرها را جلو می‌برد و اجازه می‌دهد رندرها و درخواست‌ها تمام شوند */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
}

async function flush() {
  await act(async () => {});
  await act(async () => {});
}

async function mount() {
  root = createRoot(container);
  rootMounted = true;
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <LoginForm />
      </QueryClientProvider>,
    );
  });
  await flush();
}

/** از مرحله‌ی شماره به مرحله‌ی رمزِ عبور می‌رود و رمز را می‌نویسد */
async function goToPasswordStep(password = "secret123") {
  await typeIntoPhone("09120000042");
  await click(buttonOf("ورود با رمز عبور"));
  const input = container.querySelector<HTMLInputElement>("input[type=password]");
  if (!input) throw new Error("ورودیِ رمزِ عبور روی صفحه نبود");
  await act(async () => {
    typeInto(input, password);
  });
}

async function typeIntoPhone(phone: string) {
  const input = container.querySelector<HTMLInputElement>("input[type=tel]");
  if (!input) throw new Error("ورودیِ شماره روی صفحه نبود");
  await act(async () => {
    typeInto(input, phone);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    // عمداً محدود (همان توضیحِ آزمونِ مجاور): زمان‌بندِ خودِ React با
    // setImmediate و MessageChannel کار می‌کند و جعل‌کردنشان رندر را قفل می‌کند.
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });

  // هر آزمون باید از یک مرورگرِ پاک شروع شود؛ وضعیتِ ماندگارِ آزمونِ قبلی
  // وگرنه به‌صورتِ «بازگشت به صفحه» خوانده می‌شود و مرحله‌ی کد جابه‌جا می‌شود.
  localStorage.clear();

  nav.redirect = "/checkout";
  nav.push.mockClear();

  vi.mocked(getChallenge).mockResolvedValue({ token: "challenge-token" });
  vi.mocked(requestOtp).mockResolvedValue({ ok: true });
  vi.mocked(verifyOtp).mockResolvedValue(otpVerifyPayload());
  vi.mocked(saveProfile).mockResolvedValue({ ok: true });
  vi.mocked(passwordLogin).mockResolvedValue({ ok: true, user: TEST_USER });

  container = document.createElement("div");
  document.body.appendChild(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rootMounted = false;
});

afterEach(() => {
  if (rootMounted) {
    act(() => {
      root.unmount();
    });
  }
  container.remove();
  vi.useRealTimers();
});

// ============================================================
// ثانیه‌شمارِ «ارسال مجدد» — دوام در برابرِ رفرش و در برابرِ خواب
// ============================================================
// قرارداد این است: در حافظه یک **لحظه‌ی پایان** می‌نشیند و هر تیک از همان لحظه
// بازمحاسبه می‌شود. دو چیز این قرارداد را می‌شکند:
//   • ذخیره‌ی «چند ثانیه مانده» — آن‌وقت رفرش، شمارش را از صفر شروع می‌کند.
//   • تیکِ مبتنی بر کم‌کردنِ شمارنده — آن‌وقت هر ثانیه‌ای که تایمر از دست بدهد
//     (تبِ مخفی، خوابِ لپ‌تاپ) عدد را از واقعیت عقب می‌اندازد و دکمه بی‌دلیل
//     قفل می‌ماند. آزمونِ دوم عیناً همان حالت را می‌سازد.
const RESEND_KEY = "pg_otp_resend";

describe("ثانیه‌شمارِ ارسال مجدد، رفرش‌ناپذیر و خواب‌ناپذیر است", () => {
  it("بعد از بازگشت به صفحه، همان مهلتِ باقی‌مانده ادامه پیدا می‌کند، نه از صفر", async () => {
    // وضعیتی که یک بازدیدِ قبلی جا گذاشته: بیست ثانیه از پنجره مانده.
    localStorage.setItem(
      RESEND_KEY,
      JSON.stringify({ phone: "09120000042", until: Date.now() + 20_000 }),
    );

    await mount();

    // مستقیم به همان مرحله‌ی کد برمی‌گردد — رمزِ اینکه مهلتِ ذخیره‌شده به چشم
    // بیاید: بدونِ این، کاربر فقط با فرستادنِ دوباره‌ی کد به آن مرحله می‌رسد و
    // همان فرستادن، مهلت را با ۳۰ ثانیه‌ی تازه بازنویسی می‌کند.
    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>("input[type=text]"),
    );
    expect(boxes).toHaveLength(5);
    // و همان شماره‌ی بازدیدِ قبلی روی صفحه است، نه یک فرمِ خالی
    expect(bodyOf()).toContain("09120000042");

    // نه ۳۰ (شروعِ تازه)، نه بی‌خبری از مهلت — همان بیست ثانیه
    expect(buttonLabels()).toContain("ارسال مجدد کد (20 ثانیه)");

    // و یک ثانیه بعد هم واقعاً یکی کم می‌شود، یعنی از همان مهلت می‌خواند
    await advance(1000);
    expect(buttonLabels()).toContain("ارسال مجدد کد (19 ثانیه)");

    localStorage.clear();
  });

  it("مهلتِ تمام‌شده بعد از بازگشت به صفحه جدی گرفته نمی‌شود", async () => {
    localStorage.setItem(
      RESEND_KEY,
      JSON.stringify({ phone: "09120000042", until: Date.now() - 1 }),
    );
    await mount();

    // مرحله‌ی کدِ مرده نباید باز شود؛ کاربر از اول شروع می‌کند
    expect(
      container.querySelectorAll("input[type=text]").length,
    ).toBe(0);
    localStorage.clear();
  });

  it("اگر تب خواب رفته باشد، عددِ عقب‌مانده نشان داده نمی‌شود", async () => {
    await mount();
    await typeIntoPhone("09120000042");
    await submitForm(); // کد درخواست شد → پنجره‌ی ۳۰ ثانیه‌ای شروع شد
    expect(buttonLabels()).toContain("ارسال مجدد کد (30 ثانیه)");

    // ده دقیقه سکوت: نه رفرشی، نه تیکی — عینِ تبِ مخفی یا لپ‌تاپِ خواب‌رفته.
    // ساعت جلو می‌رود و فقط همان یک تیکِ در صف اجرا می‌شود.
    await act(async () => {
      vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    });
    await advance(1000);

    // با شمارنده‌ی کاهنده اینجا «۲۹ ثانیه» می‌ماند: عددی که ده دقیقه از واقعیت
    // عقب است و دکمه‌ای که سرور مدتهاست باز کرده، هنوز قفل است.
    expect(buttonLabels()).toContain("ارسال مجدد کد");
    expect(vi.getTimerCount()).toBe(0); // و تیکِ سرگردانی هم جا نمی‌ماند

    localStorage.clear();
  });
});

// ============================================================
// مهلتِ ارسال مجدد = همان عددی که سرور می‌دهد
// ============================================================
// پیش از این، این کامپوننت `startCooldown(30)` را دو بار هاردکد کرده بود و
// `retryAfter` سرور را نمی‌خواند (حتی فیلدش در نوعِ `OtpRequestResponse` نبود).
// یعنی عددی که مشتری می‌شمرد و عددی که سرور اعمال می‌کرد از هم جدا بودند: با
// تغییرِ مهلتِ سرور، دکمه یا زودتر از موعد باز می‌شد (سرور ۴۲۹) یا دیرتر
// (مشتری بی‌دلیل منتظر می‌ماند). چهار حالت زیر همان چهار مسیر است.
describe("شمارش در هر مسیر از خودِ سرور خوانده می‌شود، نه از ۳۰ ثانیه‌ی حدسی", () => {
  it("عددی که سرور می‌دهد عیناً همان چیزی است که کاربر می‌شمارد", async () => {
    vi.mocked(requestOtp).mockResolvedValueOnce({ ok: true, retryAfter: 12 });

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();

    // نه ۳۰ ثانیه‌ی هاردکدِ قبلی — همان ۱۲ ثانیه‌ی سرور
    expect(buttonLabels()).toContain("ارسال مجدد کد (12 ثانیه)");

    // و سرِ همان وقتِ سرور باز می‌شود (نه دیرتر): ۱۲ ثانیه، نه ۳۰
    await advance(12_000);
    expect(buttonLabels()).toContain("ارسال مجدد کد");

    localStorage.clear();
  });

  it("مهلتِ بلندتر از ۳۰ هم همان است که سرور گفته (سقفی روی عدد نیست)", async () => {
    vi.mocked(requestOtp).mockResolvedValueOnce({ ok: true, retryAfter: 45 });

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();

    expect(buttonLabels()).toContain("ارسال مجدد کد (45 ثانیه)");
    await advance(12_000);
    expect(buttonLabels()).toContain("ارسال مجدد کد (33 ثانیه)");

    localStorage.clear();
  });

  it("سرور مهلتِ کوتاه‌تری داد (۴۲۹)؟ شمارش خودش را کوتاه می‌کند", async () => {
    await mount();
    await typeIntoPhone("09120000042");
    await submitForm(); // پنجره با پشتیبانِ ۳۰ باز می‌شود (سرور عددی نگفت)
    expect(buttonLabels()).toContain("ارسال مجدد کد (30 ثانیه)");

    await advance(30_000); // پنجره تمام شد و دکمه باز است
    expect(buttonLabels()).toContain("ارسال مجدد کد");

    // سرور مهلتِ باقی‌مانده را در بدنه می‌فرستد؛ همان عددی که باید دیده شود.
    const stale = new ApiError(429, "کد قبلاً ارسال شده؛ ۷ ثانیه دیگر دوباره تلاش کنید");
    stale.retryAfter = 7;
    vi.mocked(requestOtp).mockRejectedValueOnce(stale);

    await click(buttonOf("ارسال مجدد کد"));

    // نه پنجره‌ی تازه‌ی ۳۰ ثانیه (که با سرور نمی‌خواند)، نه قفلِ بی‌پایان —
    // دقیقاً همان ۷ ثانیه‌ی سرور.
    expect(buttonLabels()).toContain("ارسال مجدد کد (7 ثانیه)");
    expect(bodyOf()).toContain("کد قبلاً ارسال شده");

    localStorage.clear();
  });

  it("۴۲۹ در مرحله‌ی شماره هم کاربر را به مرحله‌ی کد می‌برد — با مهلتِ سرور", async () => {
    // همتای فروشگاهِ Express: وقتی سرور می‌گوید کدِ قبلی هنوز معتبر است و
    // مهلتِ باقی‌مانده را هم می‌دهد، کاربر باید به همان مرحله‌ی کد برود و
    // عددِ سرور را ببیند، نه اینکه پیامِ خطا بخورد و پنجره‌ی جعلیِ ۳۰ بگیرد.
    const alreadySent = new ApiError(429, "کد قبلاً ارسال شده؛ ۹ ثانیه دیگر دوباره تلاش کنید");
    alreadySent.retryAfter = 9;
    vi.mocked(requestOtp).mockRejectedValueOnce(alreadySent);

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();

    expect(container.querySelectorAll("input[type=text]").length).toBe(5);
    expect(bodyOf()).toContain("کد قبلی هنوز معتبر است؛ همان را وارد کنید");
    expect(buttonLabels()).toContain("ارسال مجدد کد (9 ثانیه)");

    localStorage.clear();
  });
});

// ============================================================
// عمرِ خودِ کد ≠ مهلتِ ارسال مجدد
// ============================================================
// چرا این آزمون‌ها: کد ۱۲۰ ثانیه زنده است ولی مهلتِ ارسال مجدد ۳۰ ثانیه.
// تا امروز این کامپوننت عمرِ کد را از مهلتِ ارسال مجدد می‌ساخت (در نسخه‌ی
// Express هم عیناً همین کار می‌شد: `codeExpiresAt: Date.now() + wait * 1000`
// در شاخهٔ ۴۲۹)، پس هشدارِ «کد منقضی شده» سرِ ثانیه‌ی ۳۱ ساخته می‌شد در حالی
// که کد هنوز نیمه‌ی عمرش را داشت — مشتری کدِ سالم را دور می‌ریخت و پیامکِ
// تازه می‌خواست. حالا سرور عمرِ واقعی را می‌فرستد (`expiresIn`) و هشدار از
// همان ساخته می‌شود.
describe("هشدارِ «کد منقضی شده» از عمرِ واقعیِ کد ساخته می‌شود، نه از مهلتِ ارسال مجدد", () => {
  const expiryText = () =>
    container.querySelector("#codeExpiry")?.textContent?.trim() ?? "";

  it("بعد از تمامِ‌شدنِ مهلتِ ارسال مجدد، کد هنوز زنده است و هیچ هشداری نیست", async () => {
    vi.mocked(requestOtp).mockResolvedValueOnce({
      ok: true,
      retryAfter: 5,
      expiresIn: 120,
    });

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();

    // سرِ ۵ ثانیه، پنجره‌ی ارسال مجدد تمام می‌شود — ولی کد ۱۱۵ ثانیه دیگر زنده است
    await advance(5_000);
    expect(buttonLabels()).toContain("ارسال مجدد کد");
    expect(expiryText()).toBe("");

    // و سرِ همان ۱۲۰ ثانیه‌ی *خودِ کد* هشدار می‌دهد
    await advance(115_000);
    expect(expiryText()).toBe("کد منقضی شده — دوباره ارسال کنید");

    localStorage.clear();
  });

  it("۴۲۹ عمرِ کد را در بدنه می‌آورد؛ هشدار از `retryAfter` ساخته نمی‌شود", async () => {
    await mount();
    await typeIntoPhone("09120000042");
    await submitForm(); // پشتیبانِ ۳۰ ثانیه و ۱۲۰ ثانیه‌ی کد
    // دکمه تا تمامِ‌شدنِ پنجره‌ی فعلی قفل است (و کلیکِ روی دکمه‌ی قفل‌شده هیچ
    // کاری نمی‌کند)، پس اول پنجره را تمام می‌کنیم.
    await advance(30_000);

    const stale = new ApiError(429, "کد قبلاً ارسال شده؛ ۷ ثانیه دیگر دوباره تلاش کنید");
    stale.retryAfter = 7;
    stale.expiresIn = 90; // عمرِ واقعیِ کد — جدا از پنجره‌ی ارسال مجدد
    vi.mocked(requestOtp).mockRejectedValueOnce(stale);
    await click(buttonOf("ارسال مجدد کد"));

    // سرِ ۷ ثانیه دکمه باز است و کد هنوز ۸۳ ثانیه زنده است — هشدارِ انقضا نه
    await advance(7_000);
    expect(buttonLabels()).toContain("ارسال مجدد کد");
    expect(expiryText()).toBe("");

    await advance(83_000);
    expect(expiryText()).toBe("کد منقضی شده — دوباره ارسال کنید");

    localStorage.clear();
  });

  it("سرور گفت کد مرده (`codeValid: false`)؟ همان لحظه هشدار می‌دهد، بدونِ صبر", async () => {
    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();

    await advance(30_000);
    const dead = new ApiError(429, "کد قبلاً ارسال شده؛ ۴ ثانیه دیگر دوباره تلاش کنید");
    dead.retryAfter = 4;
    dead.expiresIn = 0;
    dead.codeValid = false;
    vi.mocked(requestOtp).mockRejectedValueOnce(dead);
    await click(buttonOf("ارسال مجدد کد"));

    expect(expiryText()).toBe("کد منقضی شده — دوباره ارسال کنید");
    // و دکمه‌ی ارسال مجدد همان ۴ ثانیه‌ی سرور را می‌شمارد (دو عدد از هم جدا)
    expect(buttonLabels()).toContain("ارسال مجدد کد (4 ثانیه)");

    localStorage.clear();
  });

  it("بعد از رفرش، عمرِ کد از حافظه برمی‌گردد (حتی اگر پنجره‌ی ارسال مجدد تمام شده باشد)", async () => {
    // تنها مهلتِ ارسال مجدد ذخیره شده بود، پس رفرش عمرِ کد را پاک می‌کرد و
    // مشتریِ برگشته هیچ‌وقت نمی‌فهمید کدش مرده است.
    localStorage.setItem(
      "pg_otp_resend",
      JSON.stringify({
        phone: "09120000042",
        until: Date.now() - 1_000,          // پنجره‌ی ارسال مجدد تمام شده
        codeUntil: Date.now() + 60_000,     // کد هنوز زنده
      }),
    );

    await mount();
    expect(expiryText()).toBe("");
    await advance(60_000);
    expect(expiryText()).toBe("کد منقضی شده — دوباره ارسال کنید");

    localStorage.clear();
  });
});

describe("بعد از ورود، ناوبری هیچ‌وقت معلّق نمی‌ماند", () => {
  it("اگر انتقال شروع نشود، همان آدرس با ناوبریِ کاملِ مرورگر باز می‌شود", async () => {
    await mount();
    await goToPasswordStep();

    await submitForm();

    // اول تلاشِ نرم، همان‌طور که باید
    expect(vi.mocked(passwordLogin)).toHaveBeenCalledWith("09120000042", "secret123");
    expect(nav.push).toHaveBeenCalledWith("/checkout");
    // و دکمه در حالتِ انتظار می‌ماند: فرمِ برگشته به حالتِ عادی، در همان
    // لحظه‌ای که انتقال معلّق است، به کاربر می‌گوید «هیچ اتفاقی نیفتاد».
    expect(buttonLabels()).toContain("...");

    // هنوز چیزی جایگزین نشده — و یک میلی‌ثانیه قبل از مهلت هم نباید بشود
    await advance(NAV_FALLBACK_MS - 1);
    expect(vi.mocked(hardNavigate)).not.toHaveBeenCalled();

    // مهلت تمام: مشتری با ناوبریِ کامل به همان مقصد می‌رسد، نه به صفحه‌ی
    // بارگذاریِ ابدی.
    await advance(1);
    expect(vi.mocked(hardNavigate)).toHaveBeenCalledWith("/checkout");
  });

  it("اگر انتقال شروع شده باشد (کامپوننت رفته)، ناوبریِ کامل اجرا نمی‌شود", async () => {
    await mount();
    await goToPasswordStep();
    await submitForm();

    expect(nav.push).toHaveBeenCalledWith("/checkout");

    // شروعِ انتقال = unmount شدنِ همین کامپوننت (مرزِ بارگذاری جایش را می‌گیرد)
    act(() => {
      root.unmount();
    });
    rootMounted = false;

    await advance(NAV_FALLBACK_MS * 2);

    // نه ناوبریِ کاملِ تازه، نه تایمرِ سرگردان. وگرنه وسطِ بارگذاریِ صفحه‌ی
    // مقصد، همان صفحه از نو از صفر بارگذاری می‌شد.
    expect(vi.mocked(hardNavigate)).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("مسیرِ کدِ یکبارمصرف هم همین گارد را دارد", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();

    // مرحله‌ی کد: پنج رقم، همان‌طور که مشتری تایپ می‌کند
    const boxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    expect(boxes).toHaveLength(5);
    await act(async () => {
      "12345".split("").forEach((d, i) => typeInto(boxes[i], d));
    });
    await flush();

    expect(vi.mocked(verifyOtp)).toHaveBeenCalledWith("09120000042", "12345");
    expect(nav.push).toHaveBeenCalledWith("/checkout");
    // هدر در چیدمانِ ریشه کوئریِ auth را با حالتِ مهمان کش کرده است؛ بدونِ
    // باطل‌کردنش، دکمه‌ی «ورود» تا رفرش می‌ماند.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["auth"] });

    await advance(NAV_FALLBACK_MS);
    expect(vi.mocked(hardNavigate)).toHaveBeenCalledWith("/checkout");
  });

  it("مقصدِ خطرناک هرگز دنبال نمی‌شود — نه نرم، نه کامل", async () => {
    // همان حمله‌ی فیشینگ: لینکی از دامنه‌ی ما که بعد از ورود، کاربر را جای
    // دیگری می‌برد. `safeRedirectPath` باید هر دو مسیر را به صفحه‌ی اصلی ببرد.
    nav.redirect = "https://evil.example";
    await mount();
    await goToPasswordStep();
    await submitForm();

    expect(nav.push).toHaveBeenCalledWith("/");
    await advance(NAV_FALLBACK_MS);
    expect(vi.mocked(hardNavigate)).toHaveBeenCalledWith("/");
  });

  /* ============================================================
     پلهٔ دومِ ورود (عاملِ دوم)
     ============================================================
     این پله فقط برای شماره‌هایی پیش می‌آید که کلیدِ TOTP دارند (مدیر)، و تا
     وقتی کدش نرسد سرور هیچ نشستی نمی‌سازد. چیزی که اینجا سنجیده می‌شود
     *رفتارِ کاربر* است: مرحلهٔ درست باز شود، کد به سرور برود، و تا تأیید
     نشده هیچ‌جا نرود. */
  it("اگر سرور کدِ دوم بخواهد، مرحلهٔ کدِ برنامه باز می‌شود و کد به سرور می‌رود", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(
      otpVerifyPayload({ isAdmin: true }, true),
    );
    vi.mocked(verifyTotp).mockResolvedValue({
      ok: true,
      user: { ...TEST_USER, isAdmin: true },
    });

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();

    // پنج رقمِ کدِ پیامکی
    const otpBoxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    expect(otpBoxes).toHaveLength(5);
    await act(async () => {
      "12345".split("").forEach((d, i) => typeInto(otpBoxes[i], d));
    });
    await flush();

    // کدِ پیامکی درست بود، ولی *ورود تمام نشده*: شش باکسِ کدِ برنامه باز می‌شود.
    expect(vi.mocked(verifyOtp)).toHaveBeenCalledWith("09120000042", "12345");
    expect(nav.push).not.toHaveBeenCalled();
    const boxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    expect(boxes).toHaveLength(6);
    expect(bodyOf()).toContain("Authenticator");
    await act(async () => {
      "123456".split("").forEach((d, i) => typeInto(boxes[i], d));
    });
    await flush();

    expect(vi.mocked(verifyTotp)).toHaveBeenCalledWith("123456");
    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("کدِ دومِ اشتباه: پیام می‌ماند، باکس‌ها خالی می‌شوند و هیچ ناوبری‌ای رخ نمی‌دهد", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(
      otpVerifyPayload({ isAdmin: true }, true),
    );
    vi.mocked(verifyTotp).mockRejectedValue(
      new ApiError(400, "کدِ برنامه اشتباه است؛ ۴ تلاش دیگر مانده"),
    );

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();
    const otpBoxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    await act(async () => {
      "12345".split("").forEach((d, i) => typeInto(otpBoxes[i], d));
    });
    await flush();

    const boxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    expect(boxes).toHaveLength(6);
    await act(async () => {
      "000000".split("").forEach((d, i) => typeInto(boxes[i], d));
    });
    await flush();

    expect(bodyOf()).toContain("۴ تلاش دیگر مانده");
    // باکس‌ها خالی شده‌اند تا کاربر بدونِ پاک‌کردنِ دستی دوباره بزند.
    expect(
      Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]")).every(
        (b) => b.value === "",
      ),
    ).toBe(true);
    expect(nav.push).not.toHaveBeenCalled();
    await advance(NAV_FALLBACK_MS * 2);
    expect(vi.mocked(hardNavigate)).not.toHaveBeenCalled();
  });

  /* ============================================================
     کدِ پشتیبان — «گم‌شدنِ گوشی نباید قفل‌شدنِ پنل باشد»
     ============================================================
     مدیرِ گوشی‌گم‌کرده تنها جایی که می‌رسد همین صفحه است. سه چیز این‌جا
     سنجیده می‌شود و هر سه لازم است تا خاصیت واقعاً کار کند: راهِ رسیدنش
     پیدا باشد (دکمه)، کد با همان شکلِ سرور برود، و «چند تا مانده»
     *پیش از* رفتن به پنل گفته شود. یک چیزِ منفی هم مهم است: ورودیِ
     بی‌شکل به سرور نمی‌رود تا سهمیهٔ سقفِ نرخِ پلهٔ دوم را نسوزاند. */
  it("گم‌شدنِ گوشی: کدِ پشتیبان پذیرفته می‌شود و «چند تا مانده» قبل از پنل گفته می‌شود", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(
      otpVerifyPayload({ isAdmin: true }, true),
    );
    vi.mocked(verifyTotp).mockResolvedValue({
      ok: true,
      user: { ...TEST_USER, isAdmin: true },
      method: "recovery",
      recoveryRemaining: 2,
      recoveryMessage: "۲ کدِ پشتیبان دیگر روی کاغذتان مانده",
    });

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();
    const otpBoxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    await act(async () => {
      "12345".split("").forEach((d, i) => typeInto(otpBoxes[i], d));
    });
    await flush();

    // مسیرِ کدِ پشتیبان باید از *همین* مرحله پیدا باشد: روزی که گوشی گم شود،
    // مدیر وقتِ خواندنِ راهنما ندارد.
    await click(buttonOf("کد پشتیبان دارم"));

    const fields = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    // شش خانهٔ رقمی جایش را به یک ورودیِ متنی داده — با شش خانه، تایپِ ۱۲ نویسه
    // ممکن نیست و کلِ خاصیت بی‌اثر می‌ماند.
    expect(fields).toHaveLength(1);
    await act(async () => {
      // همان‌طور که مدیر از روی کاغذ می‌خواند: حروفِ کوچک، با خطِ تیره.
      typeInto(fields[0], "krnd-sjj2-zunr");
    });
    await click(buttonOf("تأیید کد پشتیبان"));

    // خطِ تیره و بزرگی/کوچکیِ حرف بی‌اثر است، ولی آنچه به سرور می‌رود باید همان
    // شکلِ ۱۲ نویسهٔ Base32 باشد که `mfa.recoveryShaped` می‌شناسد.
    expect(vi.mocked(verifyTotp)).toHaveBeenCalledWith("KRNDSJJ2ZUNR");

    // هنوز نرفته: اولین چیزی که مدیر باید بخواند «چند تا مانده» است.
    expect(nav.push).not.toHaveBeenCalled();
    expect(bodyOf()).toContain("۲ کدِ پشتیبان دیگر روی کاغذتان مانده");
    expect(bodyOf()).toContain("node tools/admin-recovery.js");

    await advance(NAV_FALLBACK_MS * 2);
    expect(vi.mocked(hardNavigate)).not.toHaveBeenCalled();

    await click(buttonOf("ورود به پنل"));
    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("کدِ پشتیبانِ بی‌شکل به سرور نمی‌رود (سهمیهٔ سقفِ پلهٔ دوم نمی‌سوزد)", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(
      otpVerifyPayload({ isAdmin: true }, true),
    );

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();
    const otpBoxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    await act(async () => {
      "12345".split("").forEach((d, i) => typeInto(otpBoxes[i], d));
    });
    await flush();

    await click(buttonOf("کد پشتیبان دارم"));
    const field = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"))[0];
    await act(async () => {
      typeInto(field, "123456"); // شکلِ کدِ اپ: ۶ رقم، نه کدِ پشتیبان
    });
    await click(buttonOf("تأیید کد پشتیبان"));

    expect(vi.mocked(verifyTotp)).not.toHaveBeenCalled();
    expect(bodyOf()).toContain("۱۲ نویسه");
    // و راهِ برگشت باز است: کسی که کدِ پشتیبان را اشتباه فهمیده، باید بتواند
    // بی‌\u200cآنکه از شماره شروع کند به کدِ اپ برگردد.
    expect(buttonLabels().some((l) => l.includes("برگشت به کدِ برنامه"))).toBe(true);
  });

  it("ورودِ رمزی هم می‌تواند به پلهٔ دوم بماند (سد در ایستگاهِ ورود است، نه یک مسیر)", async () => {
    vi.mocked(passwordLogin).mockResolvedValue({
      ok: true,
      user: { ...TEST_USER, isAdmin: true },
      mfaRequired: true,
    });
    vi.mocked(verifyTotp).mockResolvedValue({
      ok: true,
      user: { ...TEST_USER, isAdmin: true },
    });

    await mount();
    await goToPasswordStep("secret-pass");
    await submitForm();

    const boxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type=text]"));
    expect(boxes).toHaveLength(6);
    await act(async () => {
      "654321".split("").forEach((d, i) => typeInto(boxes[i], d));
    });
    await flush();

    expect(vi.mocked(verifyTotp)).toHaveBeenCalledWith("654321");
    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("رمزِ اشتباه: پیام می‌آید، حالتِ انتظار پاک می‌شود و ناوبری‌ای رخ نمی‌دهد", async () => {
    vi.mocked(passwordLogin).mockRejectedValue(
      new ApiError(401, "رمز عبور اشتباه است"),
    );
    await mount();
    await goToPasswordStep("wrong-pass");
    await submitForm();

    expect(bodyOf()).toContain("رمز عبور اشتباه است");
    // فرم باید برگردد تا مشتری بتواند دوباره تلاش کند — وگرنه دکمه‌ی «...»
    // تا ابد منتظر می‌ماند.
    expect(buttonLabels()).toContain("ورود");
    expect(nav.push).not.toHaveBeenCalled();

    await advance(NAV_FALLBACK_MS * 2);
    expect(vi.mocked(hardNavigate)).not.toHaveBeenCalled();
  });
});

// ============================================================
// مرحلهٔ «نام» — به شکلِ واقعیِ پاسخِ سرور
// ============================================================
// شکایتِ واقعیِ مشتری: «هر بار دوباره نامم را می‌پرسد». ریشه‌اش یک ناهم‌خوانیِ
// قرارداد بود: فرم نام را از سطحِ بالای پاسخ می‌خواند، یعنی دو فیلدی که سرور
// هرگز نمی‌فرستد — پس شرط **همیشه** درست می‌شد و مرحلهٔ نام برای هر ورودِ
// موفق باز می‌ماند، حتی برای کسی که نامش سال‌هاست ثبت شده.
//
// نکتهٔ مهمِ این آزمون‌ها *شکلِ پاسخی* است که تزریق می‌شود: `otpVerifyPayload`
// عیناً همان چیزی است که `publicUser` می‌سازد (نام زیرِ `user`، و هیچ `isNew`).
// با شکلِ خیالی، خودِ آزمون هم باگ را باور می‌کند و سبز می‌ماند — که دقیقاً
// همان اتفاقی بود که افتاد.
describe("مرحلهٔ نام به شکلِ واقعیِ پاسخِ `otp/verify`", () => {
  /** کدِ پنج‌رقمیِ پیامکی را تایپ می‌کند — همان کاری که مشتری می‌کند */
  async function typeOtp(code = "12345") {
    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>("input[type=text]"),
    );
    expect(boxes).toHaveLength(5);
    await act(async () => {
      code.split("").forEach((d, i) => typeInto(boxes[i], d));
    });
    await flush();
  }

  /** ورودیِ مرحلهٔ نام — نشانهٔ روشنِ اینکه این مرحله باز شده یا نه */
  function nameInput() {
    return container.querySelector<HTMLInputElement>(
      'input[placeholder="نام و نام خانوادگی"]',
    );
  }

  it("مشتریِ همیشگی که نامش ذخیره شده، دوباره نامش پرسیده نمی‌شود", async () => {
    // همان پاسخِ واقعیِ سرور: نام زیرِ `user` و فیلدی به نامِ `isNew` نیست.
    vi.mocked(verifyOtp).mockResolvedValue(otpVerifyPayload());

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();
    await typeOtp();

    // مستقیم به مقصد — بدونِ فرمِ نام و بدونِ هیچ ذخیره‌ای
    expect(nameInput()).toBeNull();
    expect(bodyOf()).not.toContain("لطفاً نام خود را وارد کنید");
    expect(vi.mocked(saveProfile)).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("مشتریِ تازه (نامِ خالی زیرِ `user`) مرحلهٔ نام را می‌بیند و نامش ذخیره می‌شود", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(otpVerifyPayload({ fullName: "" }));

    await mount();
    await typeIntoPhone("09120000042");
    await submitForm();
    await typeOtp();

    const input = nameInput();
    expect(input).not.toBeNull();
    expect(nav.push).not.toHaveBeenCalled();

    await act(async () => {
      typeInto(input as HTMLInputElement, "سارا محمدی");
    });
    await submitForm();

    expect(vi.mocked(saveProfile)).toHaveBeenCalledWith("سارا محمدی");
    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });
});
