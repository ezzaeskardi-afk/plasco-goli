// ============================================================
// کادرِ خوش‌آمد — همتای showWelcome/initWelcomePrompt نسخه‌ی Express
// ============================================================
// هر شرطی که اینجا سنجیده می‌شود، یک بار در نسخه‌ی Express با دلیل نوشته شده
// بود و در نسخه‌ی Next هیچ‌کدام وجود نداشت. ارزشِ آزمون هم همین است: کادر
// بی‌شرط یعنی «همان کادری که همه می‌بندند»، و کادرِ دیرآمده یعنی ثبت‌نامی که
// هرگز پیشنهاد نشد.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { WelcomePrompt } from "@/components/WelcomePrompt";
import { WELCOME_INTENT_EVENT, WELCOME_SEEN_KEY } from "@/lib/welcome";
import type { AuthMeResponse, User } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/api", () => ({ getMe: vi.fn() }));
import { getMe } from "@/lib/api";
const getMeMock = vi.mocked(getMe);

const GUEST: AuthMeResponse = { user: null };
const LOGGED_IN: AuthMeResponse = {
  user: {
    id: 7,
    phone: "09120000000",
    fullName: "مشتری",
    isAdmin: false,
    isStaff: false,
    hasPassword: true,
  } satisfies User,
};

let container: HTMLDivElement;
let root: Root;
let rootMounted = false;
let queryClient: QueryClient;

async function mount() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  root = createRoot(container);
  rootMounted = true;
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WelcomePrompt />
      </QueryClientProvider>,
    );
  });
  // صفِ میکروتسک را خالی می‌کنیم تا پاسخِ `/api/auth/me` بنشیند و افکت تصمیم
  // بگیرد. نسخه‌ی `…Async` لازم است چون تایمرها جعلی‌اند و `setTimeout(resolve,
  // 0)` بدونِ جلو بردنِ ساعتِ جعلی هرگز اجرا نمی‌شود.
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

/**
 * تا رسیدنِ مهلتِ ۲۵ ثانیه‌ای جلو می‌رود.
 *
 * نسخه‌ی `…Async` عمدی است: تایمر داخلِ یک افکت نشانده می‌شود که خودش منتظرِ
 * پاسخِ `/api/auth/me` است، پس بینِ تیک‌های زمانی باید صفِ میکروتسک هم خالی
 * شود. با نسخه‌ی همگام، به‌روزرسانیِ state از تایمر در همان `act` نمی‌نشیند.
 */
async function waitForArmTimer(ms = 25_100) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  // پاسِ دوم برای فریمِ ورود: کلاسِ `open` را `requestAnimationFrame` می‌گذارد
  // (همتای نسخه‌ی Express)، و آن rAF بعد از commitِ همان state زمان‌بندی می‌شود —
  // یعنی خارج از پنجره‌ای که بالا جلو بردیم.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

const overlay = () => container.querySelector<HTMLElement>(".welcome-overlay");

/** دیالوگِ بازِ دیگری روی صفحه — مثلِ فرمِ دیدگاه. */
function openForeignDialog() {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  document.body.appendChild(dialog);
  return dialog;
}

beforeEach(() => {
  vi.useFakeTimers();
  pathname = "/";
  container = document.createElement("div");
  document.body.appendChild(container);
  rootMounted = false;
  getMeMock.mockReset();
  getMeMock.mockResolvedValue(GUEST);
  try {
    localStorage.clear();
  } catch {
    /* حالتِ خصوصی */
  }
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

describe("WelcomePrompt — چه زمانی و برای کی نشان داده می‌شود", () => {
  it("برای مهمانِ صفحه‌ی اصلی، بعد از مهلتِ ۲۵ ثانیه می‌آید", async () => {
    await mount();
    expect(overlay()).toBeNull(); // سرِ ورود نه — کاربر هنوز یک کالا ندیده
    await waitForArmTimer();
    expect(overlay()).not.toBeNull();
    expect(overlay()?.classList.contains("open")).toBe(true);
  });

  it("قبل از مهلت نمی‌آید", async () => {
    await mount();
    await waitForArmTimer(24_000);
    expect(overlay()).toBeNull();
  });

  it("پیامِ کادر همان چیزی است که مشتری به آن جواب می‌دهد", async () => {
    await mount();
    await waitForArmTimer();
    expect(container.textContent).toContain("به پلاسکو گلی خوش اومدید");
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(container.querySelector(".welcome-close")).not.toBeNull();
  });

  it("برای مشتریِ وارد‌شده هرگز نمی‌آید و برای همیشه علامت می‌خورد", async () => {
    getMeMock.mockResolvedValue(LOGGED_IN);
    await mount();
    await waitForArmTimer();
    expect(overlay()).toBeNull();
    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe("1");
  });

  it("اگر قبلاً دیده شده باشد برنمی‌گردد", async () => {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
    await mount();
    await waitForArmTimer();
    expect(overlay()).toBeNull();
  });

  it("در صفحه‌ی غیرِ اصلی نمی‌آید", async () => {
    pathname = "/product/12";
    await mount();
    await waitForArmTimer(60_000);
    expect(overlay()).toBeNull();
  });

  it("«علاقه‌ی واقعی» (افزودن به سبد) کادر را فوری می‌آورد، نه با تأخیرِ ۲۵ ثانیه", async () => {
    await mount();
    await act(async () => {
      document.dispatchEvent(new Event(WELCOME_INTENT_EVENT));
    });
    // ۲۲۰۰ms مکثِ عمدی است تا روی توستِ «به سبد اضافه شد» نیفتد.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_300);
    });
    expect(overlay()).not.toBeNull();
  });

  it("وسطِ یک دیالوگِ باز نمی‌پرد و چند ثانیه بعد دوباره امتحان می‌کند", async () => {
    const dialog = openForeignDialog();
    await mount();
    await waitForArmTimer();
    expect(overlay()).toBeNull();

    dialog.remove();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_100);
    });
    expect(overlay()).not.toBeNull();
  });
});

describe("WelcomePrompt — بستن", () => {
  it("دکمه‌ی بستن، کادر را برمی‌دارد و در حافظه ثبت می‌کند", async () => {
    await mount();
    await waitForArmTimer();
    const close = container.querySelector<HTMLElement>(".welcome-close");
    await act(async () => {
      close?.click();
    });
    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe("1");
    expect(overlay()?.classList.contains("open")).toBe(false);

    // بعد از پایانِ transition از DOM می‌رود، نه با پرشِ ناگهانی.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(overlay()).toBeNull();
  });

  it("«فعلاً فقط نگاه می‌کنم» هم ثبتش می‌کند، پس دوباره نمی‌پرسد", async () => {
    await mount();
    await waitForArmTimer();
    const later = container.querySelector<HTMLElement>(".welcome-actions button");
    await act(async () => {
      later?.click();
    });
    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe("1");
  });

  it("کلیک روی پس‌زمینه هم می‌بندد", async () => {
    await mount();
    await waitForArmTimer();
    const backdrop = overlay();
    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe("1");
  });
});
