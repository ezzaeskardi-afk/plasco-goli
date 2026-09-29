// ============================================================
// نوارِ سراسریِ اطلاعیه — همتای initShopBar در نسخهٔ Express
// ============================================================
// دو چیزی که این آزمون قفل می‌کند و هر دو یک بار در نسخهٔ Next شکسته بودند:
//
//   ۱) اطلاعیهٔ فروشگاهِ **باز** باید دیده شود. در نسخهٔ Next نوار فقط وقتی
//      می‌آمد که فروشگاه بسته بود؛ یعنی مدیر اطلاعیه می‌نوشت و هیچ‌جا
//      نشان داده نمی‌شد.
//   ۲) بستنِ اطلاعیه باید تا پایانِ همان نشست بماند، ولی پیامِ «فروشگاه بسته
//      است» بسته‌شدنی نباشد — وگرنه مشتری پیام را می‌بندد و بعد نمی‌فهمد
//      چرا نمی‌تواند سفارش بدهد.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AnnouncementBar,
  announcementText,
  ANNOUNCEMENT_DISMISS_KEY,
} from "@/components/AnnouncementBar";
import type { ShopInfo } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// مرزِ مسیر در `next/navigation` است؛ همین‌جا جعل می‌شود تا کامپوننت در
// jsdom بدونِ روترِ Next رندر شود.
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const ANNOUNCEMENT = "ارسالِ عید از ۲۵ اسفند";
const CLOSED_FALLBACK = "فروشگاه موقتاً تعطیل است؛ سفارش‌گیری فعلاً بسته است.";

const shop = (o: Partial<ShopInfo>): ShopInfo => o as unknown as ShopInfo;

let container: HTMLDivElement;
let root: Root;
let rootMounted = false;

async function mount(shopInfo: ShopInfo | null) {
  root = createRoot(container);
  rootMounted = true;
  await act(async () => {
    root.render(<AnnouncementBar shop={shopInfo} />);
  });
  // یک پاسِ دیگر تا افکتِ خواندنِ `sessionStorage` تمام شود.
  await act(async () => {});
}

function bar(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="status"]');
}

function closeButton(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[aria-label="بستن اطلاعیه"]');
}

beforeEach(() => {
  pathname = "/";
  container = document.createElement("div");
  document.body.appendChild(container);
  rootMounted = false;
  try {
    sessionStorage.clear();
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
});

describe("announcementText — چه چیزی نشان بده", () => {
  it("فروشگاهِ باز با اطلاعیه، همان اطلاعیه را می‌دهد", () => {
    expect(announcementText(shop({ announcement: ANNOUNCEMENT, shopOpen: true }))).toBe(
      ANNOUNCEMENT,
    );
  });

  it("فروشگاهِ بسته بدونِ اطلاعیه، پیامِ پیش‌فرضِ تعطیلی را می‌دهد", () => {
    expect(announcementText(shop({ announcement: "", shopOpen: false }))).toBe(
      CLOSED_FALLBACK,
    );
  });

  it("فروشگاهِ بسته با اطلاعیه، اطلاعیه‌ی مدیر را اولویت می‌دهد", () => {
    expect(announcementText(shop({ announcement: ANNOUNCEMENT, shopOpen: false }))).toBe(
      ANNOUNCEMENT,
    );
  });

  it("بدونِ اطلاعیه و با فروشگاهِ باز، نوار وجود ندارد", () => {
    expect(announcementText(shop({ announcement: "", shopOpen: true }))).toBeNull();
  });

  it("بدونِ تنظیماتِ فروشگاه (خطای شبکه) نوار وجود ندارد", () => {
    expect(announcementText(null)).toBeNull();
  });
});

describe("AnnouncementBar — نشان‌دادن و بستن", () => {
  it("اطلاعیه‌ی فروشگاهِ باز را نشان می‌دهد و بسته‌شدنی است", async () => {
    await mount(shop({ announcement: ANNOUNCEMENT, shopOpen: true }));
    expect(bar()?.textContent).toContain(ANNOUNCEMENT);
    expect(closeButton()).not.toBeNull();
  });

  it("بستن، نوار را برمی‌دارد و در همان نشست ذخیره می‌کند", async () => {
    await mount(shop({ announcement: ANNOUNCEMENT, shopOpen: true }));
    await act(async () => {
      closeButton()?.click();
    });
    expect(bar()).toBeNull();
    expect(sessionStorage.getItem(ANNOUNCEMENT_DISMISS_KEY)).toBe(ANNOUNCEMENT);
  });

  it("اطلاعیه‌ی بسته‌شده در بازدیدِ بعدیِ همان نشست برنمی‌گردد", async () => {
    sessionStorage.setItem(ANNOUNCEMENT_DISMISS_KEY, ANNOUNCEMENT);
    await mount(shop({ announcement: ANNOUNCEMENT, shopOpen: true }));
    // اگر یک فریم اول نشان داده و بعد پنهان شود، همان چشمکِ آزاردهنده است؛
    // پس در اولین رندرِ پایدار نباید باشد.
    expect(bar()).toBeNull();
  });

  it("اطلاعیه‌ی متفاوت با نادیده‌گرفتنِ بستنِ قبلی دیده می‌شود", async () => {
    sessionStorage.setItem(ANNOUNCEMENT_DISMISS_KEY, "متنِ قدیمی");
    await mount(shop({ announcement: ANNOUNCEMENT, shopOpen: true }));
    expect(bar()?.textContent).toContain(ANNOUNCEMENT);
  });

  it("پیامِ «فروشگاه بسته است» دیده می‌شود ولی دکمه‌ی بستن ندارد", async () => {
    await mount(shop({ announcement: "", shopOpen: false }));
    expect(bar()?.textContent).toContain(CLOSED_FALLBACK);
    expect(closeButton()).toBeNull();
  });

  it("پیامِ تعطیلی با بستنِ قبلیِ همان متن هم پنهان نمی‌شود", async () => {
    sessionStorage.setItem(ANNOUNCEMENT_DISMISS_KEY, CLOSED_FALLBACK);
    await mount(shop({ announcement: "", shopOpen: false }));
    expect(bar()?.textContent).toContain(CLOSED_FALLBACK);
  });

  it("در صفحه‌ی ورود (تمام‌صفحه) نوار نمی‌آید", async () => {
    pathname = "/login";
    await mount(shop({ announcement: ANNOUNCEMENT, shopOpen: true }));
    expect(bar()).toBeNull();
  });

  it("در بقیه‌ی صفحه‌ها نوار می‌آید، نه فقط صفحه‌ی اصلی", async () => {
    pathname = "/product/12";
    await mount(shop({ announcement: ANNOUNCEMENT, shopOpen: true }));
    expect(bar()?.textContent).toContain(ANNOUNCEMENT);
  });
});
