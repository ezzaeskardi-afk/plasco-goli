// ============================================================
// آزمونِ حلقه‌ی پیگیریِ خودکارِ نتیجه‌ی پرداخت
// ============================================================
// این آزمون‌ها *رفتارِ* صفحه را می‌سنجند، نه توابعِ داخلی‌اش را. سه سناریوی
// درخواست‌شده اینجا هستند:
//
//   ۱) بازیابیِ دیرهنگام — سفارش از «در انتظار پرداخت» به «پرداخت‌شده» می‌رود،
//      کارت خودش عوض می‌شود، پیام تأیید یک بار می‌آید و حلقه می‌ایستد.
//   ۲) شکستِ قطعی — سفارش به «لغو شده» می‌رود: کارتِ قرمز، دکمه‌ی سفارشِ دوباره،
//      و **هیچ** پیامِ تأییدی؛ حلقه هم می‌ایستد.
//   ۳) پنجره‌ی صبر — وقتی نتیجه هیچ‌وقت روشن نمی‌شود، حلقه بعد از سقفِ تعیین‌شده
//      می‌ایستد، به مشتری می‌گوید، و با «بررسی دوباره» از سر می‌گیرد.
//
// چرا تایمرِ جعلی و نه تزریقِ ثابت‌ها: با تایمرِ جعلی همین اعدادِ *واقعیِ روی
// دیسک* سنجیده می‌شوند (۱۵ ثانیه، ۶۰ ثانیه، سقفِ ۴۰ بررسی). پس اگر روزی کسی
// ۱۵ را ۲۰ کند یا سقف را بردارد، آزمون می‌شکند. تزریقِ ثابت این محافظت را از
// بین می‌برد و کدِ اصلی را هم فقط برای آزمون‌پذیرشدن دست‌کاری می‌کرد.
// ۳۴ دقیقه‌ی زمانیِ این حلقه در عمل در چند میلی‌ثانیه اجرا می‌شود.
//
// تکرارِ عددها پایین (POLL_MS_FAST و…) عمدی است: آزمون باید انتظاراتش را
// مستقل بگوید، وگرنه «همان ثابتی که کد می‌خواند» را می‌سنجد و تغییرِ آن دیده
// نمی‌شود.
//
// نکته‌ی نگارشی: متن‌های فارسی را با «نیم‌فاصله» (ZWNJ) مقایسه نکنید مگر لازم
// باشد؛ یک کاراکتر نامرئی که جابه‌جا شود آزمون را می‌شکند بی‌آنکه رفتار عوض شده
// باشد. هرجا ممکن بوده، رشته‌ی بدونِ نیم‌فاصله انتخاب شده است.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OrderSuccessContent } from "@/components/OrderSuccessContent";
import { ToastProvider } from "@/components/Toast";
import { getMe, getOrder } from "@/lib/api";
import type { Order } from "@/lib/types";

// React بدونِ این پرچم روی هر رندر هشدار می‌دهد که «act» دورِ خودت لازم است.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// ------------------------------------------------------------
// وابستگی‌های مرزیِ صفحه
// ------------------------------------------------------------
// مسیریابِ Next و لینکش بیرون از درختِ اپ کار نمی‌کنند (به RouterContext نیاز
// دارند). هر دو اینجا با معادلِ سادهٔ خودشان عوض می‌شوند تا آزمون به یک اپِ
// کاملِ Next وابسته نشود.
// ⚠️ اینجا هر دو هوک باید **شیءِ ثابت** برگردانند، نه یکی تازه در هر رندر.
// کامپوننت `load` را با useCallback روی [orderId, router] می‌سازد و effectِ
// بارگذاری به `load` وابسته است. اگر useRouter هر رندر یک شیءِ نو بدهد،
// `load` هم هر رندر عوض می‌شود، effect دوباره اجرا می‌شود، state می‌نشیند و
// همین حلقه بی‌نهایت می‌شود — رندرِ واقعیِ Next شیءِ پایدار می‌دهد و اتفاق هم
// نمی‌افتد؛ پس اینجا هم باید پایدار بماند.
const nav = vi.hoisted(() => {
  const push = vi.fn();
  return {
    push,
    router: { push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() },
    orderId: "42" as string | null,
    cachedFor: null as string | null | undefined,
    params: null as URLSearchParams | null,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => {
    if (nav.cachedFor !== nav.orderId || !nav.params) {
      nav.cachedFor = nav.orderId;
      nav.params = new URLSearchParams(
        nav.orderId === null ? {} : { orderId: nav.orderId },
      );
    }
    return nav.params;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
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
    getMe: vi.fn(),
    getOrder: vi.fn(),
    reorderOrder: vi.fn(),
  };
});

// ------------------------------------------------------------
// ابزارها
// ------------------------------------------------------------

/** همان اعدادِ روی دیسک — منبع: OrderSuccessContent.tsx */
const POLL_MS_FAST = 15_000;
const POLL_MS_SLOW = 60_000;
const POLL_CHECKS_FAST = 8;
const POLL_CHECKS_TOTAL = 40;

/** کلِ پنجره: ۸ بررسیِ ۱۵ ثانیه‌ای + ۳۲ بررسیِ یک‌دقیقه‌ای ≈ ۳۴ دقیقه */
const FULL_WINDOW_MS =
  POLL_CHECKS_FAST * POLL_MS_FAST +
  (POLL_CHECKS_TOTAL - POLL_CHECKS_FAST) * POLL_MS_SLOW;

const TOAST_PAID = "تأیید شد و سفارش ثبت شد";
/** بدنه‌ی خطِ «در حال بررسی» — بدونِ نیم‌فاصله انتخاب شده */
const WATCHING = "لازم نیست کاری کنید";
/** بدنه‌ی پیامِ توقفِ بررسی — بدونِ نیم‌فاصله */
const GAVE_UP = "نگه داشتیم";
/** عنوانِ کارتی که می‌گوید وضعیت خوانده نشد */
const UNREADABLE = "نتوانستیم بگیریم";

let currentStatus = "pending_payment";
/** اگر پر شود، این تعداد بررسیِ بعدی با خطا رد می‌شود (شبیه‌سازیِ قطعیِ گذرا) */
let failNextPolls = 0;

function makeOrder(status: string, over: Partial<Order> = {}): Order {
  return {
    id: 42,
    userId: 1,
    items: [{ productId: 7, title: "دستکش لاتکس", price: 120_000, qty: 2 }],
    address: {
      id: 1,
      userId: 1,
      fullName: "مشتری آزمون",
      phone: "09120000042",
      province: "تهران",
      city: "تهران",
      addressLine: "خیابان آزمون، پلاک ۱",
      postalCode: "1111111111",
    },
    total: 240_000,
    shippingFee: 0,
    couponCode: "",
    discount: 0,
    status,
    authority: "A0000000000000000000000000000000001",
    refId: "",
    paymentUrl: "",
    createdAt: "2026-09-25T08:00:00.000Z",
    paidAt: null,
    shippedAt: null,
    deliveredAt: null,
    trackingCode: "",
    cancelReason: "",
    returnReason: "",
    adminNote: "",
    ...over,
  };
}

/** تایمرها را جلو می‌برد و اجازه می‌دهد رندرها و درخواست‌ها تمام شوند */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
}

/** فقط ریزکارهای معلق را تمام می‌کند، بدونِ جلوبردنِ زمان */
async function flush() {
  await act(async () => {});
  await act(async () => {});
}

function titleOf(container: HTMLElement): string {
  return container.querySelector("h1")?.textContent?.trim() ?? "";
}

function bodyOf(container: HTMLElement): string {
  return container.textContent ?? "";
}

function buttonLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button")).map((b) =>
    (b.textContent ?? "").trim(),
  );
}

/** برچسبِ وضعیت روی کارتِ جزئیات — همان چیزی که مشتری به‌جای کدِ انگلیسی می‌بیند */
function statusPill(container: HTMLElement): string {
  return container.querySelector("span.rounded-full")?.textContent?.trim() ?? "";
}

// هر پیامِ شناوری که تا آخرِ آزمون ظاهر شده — برای شمردنِ دقیق، نه حدس.
// توست پس از ۲٫۶ ثانیه خودش می‌رود، پس «الان چند تا روی صفحه است» نمی‌تواند
// بگوید چند بار *آمده*؛ درج‌ها شمرده می‌شوند و حذف‌ها اهمیتی ندارند.
let toastsSeen: string[] = [];
const observer = new MutationObserver((records) => {
  for (const rec of records) {
    for (const node of Array.from(rec.addedNodes)) {
      const text = (node as HTMLElement).textContent ?? "";
      if (text.includes(TOAST_PAID)) toastsSeen.push(text);
    }
  }
});

let container: HTMLDivElement;
let root: Root;
let rootMounted = false;

beforeEach(() => {
  vi.useFakeTimers({
    // عمداً محدود: setImmediate و MessageChannel دست‌نخورده می‌مانند چون
    // زمان‌بندِ خودِ React با آن‌ها کار می‌کند و جعل‌کردنشان رندر را قفل می‌کند.
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

  currentStatus = "pending_payment";
  failNextPolls = 0;
  nav.orderId = "42";
  nav.push.mockClear();

  vi.mocked(getMe).mockResolvedValue({
    user: {
      id: 1,
      phone: "09120000042",
      fullName: "مشتری آزمون",
      isAdmin: false,
      isStaff: false,
      hasPassword: false,
    },
  });
  vi.mocked(getOrder).mockImplementation(async () => {
    if (failNextPolls > 0) {
      failNextPolls -= 1;
      throw new Error("قطعیِ لحظه‌ایِ شبکه");
    }
    return { order: makeOrder(currentStatus) };
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  rootMounted = false;

  toastsSeen = [];
  observer.observe(document.body, { childList: true, subtree: true });
});

afterEach(() => {
  observer.disconnect();
  if (rootMounted) {
    act(() => {
      root.unmount();
    });
  }
  container.remove();
  // پراپرتیِ جعلیِ document.hidden برداشته می‌شود تا گترِ اصلیِ jsdom برگردد
  delete (document as unknown as Record<string, unknown>).hidden;
  vi.useRealTimers();
});

/** صفحه را داخلِ Providerِ واقعیِ توست سوار می‌کند */
async function mount() {
  root = createRoot(container);
  rootMounted = true;
  await act(async () => {
    root.render(
      <ToastProvider>
        <OrderSuccessContent />
      </ToastProvider>,
    );
  });
  await flush();
}

/** تعدادِ درخواست‌های وضعیت تا این لحظه (بارگذاریِ اول + بررسی‌ها) */
function orderFetches(): number {
  return vi.mocked(getOrder).mock.calls.length;
}

function clickButton(label: string) {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!btn) throw new Error(`دکمه‌ای با متنِ «${label}» روی صفحه نبود`);
  return btn;
}

// ============================================================
// ۱) بازیابیِ دیرهنگام
// ============================================================
describe("پیگیریِ خودکار — بازیابیِ دیرهنگام", () => {
  it("وقتی تأییدیه با تأخیر می‌رسد کارت را عوض می‌کند، یک بار خبر می‌دهد و می‌ایستد", async () => {
    await mount();

    // شروع: هنوز در انتظار پرداخت — باید بگوید «در حال بررسی» و دکمه‌ی سفارشِ
    // دوباره را *نشان ندهد* (وگرنه مشتری دوباره سفارش می‌دهد و در صورتِ
    // تأییدشدنِ پرداختِ گم‌شده، دو بار از حسابش کم می‌شود).
    expect(titleOf(container)).toContain("هنوز مشخص نیست");
    expect(bodyOf(container)).toContain(WATCHING);
    expect(buttonLabels(container)).toContain("بررسی دوباره");
    expect(buttonLabels(container)).not.toContain("دوباره سفارش بده");
    expect(statusPill(container)).toBe("در انتظار پرداخت");
    expect(bodyOf(container)).not.toContain("pending_payment");

    // بین دو بررسی هنوز چیزی نپرسیده‌ایم
    expect(orderFetches()).toBe(1);
    await advance(POLL_MS_FAST - 1);
    expect(orderFetches()).toBe(1);

    // سرِ موعدِ اولین بررسی، درگاه تأییدیه را داده است
    currentStatus = "paid";
    await advance(1);

    expect(orderFetches()).toBe(2);
    expect(titleOf(container)).toBe("پرداخت با موفقیت انجام شد");
    // «پرداخت‌شده» با نیم‌فاصله نوشته می‌شود؛ الگو هر دو حالت را می‌گیرد
    expect(statusPill(container)).toMatch(/^پرداخت\u200c?شده$/);
    // خطِ «در حال بررسی» باید برود: کار تمام شده
    expect(bodyOf(container)).not.toContain(WATCHING);
    expect(buttonLabels(container)).not.toContain("بررسی دوباره");

    // پیامِ تأیید: دقیقاً یک بار
    expect(toastsSeen).toHaveLength(1);
    expect(toastsSeen[0]).toContain(TOAST_PAID);

    // و حلقه ایستاده: پنجره‌ی کاملِ ۳۴ دقیقه‌ای جلو می‌رود بی‌آنکه درخواستی برود
    const settled = orderFetches();
    await advance(FULL_WINDOW_MS);
    expect(orderFetches()).toBe(settled);
    expect(toastsSeen).toHaveLength(1);
  });
});

// ============================================================
// ۲) شکستِ قطعی
// ============================================================
describe("پیگیریِ خودکار — شکستِ قطعی", () => {
  it("لغوِ سفارش حلقه را می‌بندد، پیامِ تأیید نمی‌دهد و راهِ سفارشِ دوباره را باز می‌کند", async () => {
    await mount();
    expect(titleOf(container)).toContain("هنوز مشخص نیست");

    currentStatus = "canceled";
    await advance(POLL_MS_FAST);

    expect(titleOf(container)).toBe("این سفارش لغو شده");
    expect(statusPill(container)).toBe("لغو شده");
    // خبرِ بد پیامِ شناور نمی‌گیرد — خودِ کارت می‌گوید
    expect(toastsSeen).toHaveLength(0);
    // و حالا جای «بررسی دوباره» دکمه‌ی سفارشِ دوباره است
    expect(buttonLabels(container)).toContain("دوباره سفارش بده");
    expect(buttonLabels(container)).not.toContain("بررسی دوباره");
    // کدِ خامِ وضعیت نباید به مشتری نشان داده شود
    expect(bodyOf(container)).not.toContain("canceled");

    // حلقه باید ایستاده باشد: در حالتِ قطعی هیچ بررسیِ بعدی‌ای معنا ندارد
    const settled = orderFetches();
    await advance(FULL_WINDOW_MS);
    expect(orderFetches()).toBe(settled);
    expect(toastsSeen).toHaveLength(0);
  });

  it("«ناموفق» هم مثل لغو، قطعی است", async () => {
    await mount();

    currentStatus = "failed";
    await advance(POLL_MS_FAST);

    expect(titleOf(container)).toBe("پرداخت انجام نشد");
    expect(statusPill(container)).toBe("ناموفق");
    expect(toastsSeen).toHaveLength(0);
    expect(buttonLabels(container)).toContain("دوباره سفارش بده");

    const settled = orderFetches();
    await advance(FULL_WINDOW_MS);
    expect(orderFetches()).toBe(settled);
  });
});

// ============================================================
// ۳) پنجره‌ی صبر
// ============================================================
describe("پیگیریِ خودکار — پنجره‌ی صبر", () => {
  it("ریتمِ ۱۵ ثانیه‌ای و بعد یک‌دقیقه‌ای را رعایت می‌کند", async () => {
    await mount();

    // هفت بررسیِ اول تا t=105s انجام شده‌اند
    await advance(105_000);
    expect(orderFetches()).toBe(1 + 7);

    // هشتمین بررسی هنوز ریتمِ سریع است
    await advance(POLL_MS_FAST);
    expect(orderFetches()).toBe(1 + 8); // t=120s

    // تا پیش از نخستین بررسیِ آرام نباید خبری باشد — این خط مرزِ ۸ بررسیِ
    // سریع را قفل می‌کند
    await advance(POLL_MS_SLOW - 1);
    expect(orderFetches()).toBe(1 + 8); // t=179s

    await advance(1);
    expect(orderFetches()).toBe(1 + 9); // t=180s — ریتمِ آرام شروع شد
  });

  it("بعد از سقفِ پنجره می‌ایستد، به مشتری می‌گوید، و با «بررسی دوباره» از سر می‌گیرد", async () => {
    await mount();

    // سقف: بررسیِ چهلم سرِ ۳۴ دقیقه انجام می‌شود و همان‌جا می‌ایستد
    await advance(FULL_WINDOW_MS - 1);
    expect(orderFetches()).toBe(1 + (POLL_CHECKS_TOTAL - 1));

    await advance(1);
    expect(orderFetches()).toBe(1 + POLL_CHECKS_TOTAL);
    expect(bodyOf(container)).toContain(GAVE_UP);

    // نه حلقه‌ی بی‌پایان: نیم ساعتِ دیگر هم هیچ درخواستی نمی‌رود
    const stopped = orderFetches();
    await advance(30 * 60_000);
    expect(orderFetches()).toBe(stopped);

    // ولی مشتری راهِ بیرون‌رفتن از انتظار را دارد — با یک بررسیِ فوری
    await act(async () => {
      clickButton("بررسی دوباره").click();
    });
    expect(orderFetches()).toBe(stopped + 1);
    // گیت باز شده و حلقه دوباره سوار شده: سرِ ۱۵ ثانیه یک بررسیِ دیگر
    await advance(POLL_MS_FAST);
    expect(orderFetches()).toBe(stopped + 2);
  });

  it("خطای گذرا در یک بررسی، حلقه را نمی‌بندد و کارت را قرمز نمی‌کند", async () => {
    await mount();

    // دو بررسیِ پیاپی شبکه قطع است
    failNextPolls = 2;
    await advance(POLL_MS_FAST * 2);

    // هیچ کارتِ قرمزی نباید آمده باشد: خطای گذرا یعنی «این نوبت نشد»
    expect(titleOf(container)).toContain("هنوز مشخص نیست");
    expect(bodyOf(container)).toContain(WATCHING);
    expect(bodyOf(container)).not.toContain(UNREADABLE);
    expect(toastsSeen).toHaveLength(0);

    // و بعد از رفعِ قطعی، بررسیِ بعدی همان لحظه نتیجه را می‌گیرد
    currentStatus = "shipped";
    await advance(POLL_MS_FAST);
    expect(titleOf(container)).toBe("پرداخت با موفقیت انجام شد");
    expect(toastsSeen).toHaveLength(1);
  });

  it("تبِ پنهان بررسی نمی‌فرستد و لحظه‌ی برگشتنِ مشتری فوراً می‌پرسد", async () => {
    await mount();
    expect(orderFetches()).toBe(1);

    // تبِ پنهان: مشتری رفته، پس هیچ درخواستی نباید برود — حتی سرِ موعد
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    await advance(POLL_MS_FAST * 3);
    expect(orderFetches()).toBe(1);

    // مشتری برمی‌گردد: تا موعدِ بعدی صبر نمی‌کنیم، همان حالا می‌پرسیم
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    currentStatus = "paid";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(orderFetches()).toBe(2);
    expect(titleOf(container)).toBe("پرداخت با موفقیت انجام شد");
  });

  it("با رفتن از صفحه، تایمر پاک می‌شود و درخواستِ یتیم نمی‌ماند", async () => {
    await mount();
    await advance(POLL_MS_FAST);
    expect(orderFetches()).toBe(2);

    act(() => {
      root.unmount();
    });
    rootMounted = false;

    const afterUnmount = orderFetches();
    await advance(FULL_WINDOW_MS);
    expect(orderFetches()).toBe(afterUnmount);
  });
});
