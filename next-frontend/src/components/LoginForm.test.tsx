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

import { LoginForm } from "@/components/LoginForm";
import {
  ApiError,
  getChallenge,
  passwordLogin,
  requestOtp,
  verifyOtp,
} from "@/lib/api";
import { hardNavigate } from "@/lib/navigation";
import type { User } from "@/lib/types";

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

let container: HTMLDivElement;
let root: Root;
let rootMounted = false;

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
    root.render(<LoginForm />);
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

  nav.redirect = "/checkout";
  nav.push.mockClear();

  vi.mocked(getChallenge).mockResolvedValue({ token: "challenge-token" });
  vi.mocked(requestOtp).mockResolvedValue({ ok: true });
  vi.mocked(verifyOtp).mockResolvedValue({
    ok: true,
    user: TEST_USER,
    fullName: TEST_USER.fullName,
    isNew: false,
  });
  vi.mocked(passwordLogin).mockResolvedValue({ ok: true, user: TEST_USER });

  container = document.createElement("div");
  document.body.appendChild(container);
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
