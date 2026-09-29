// ============================================================
// نوار ناوبری پایین (موبایل) — همتای initBottomNav نسخه‌ی Express
// ============================================================
// دو چیز اینجا قفل می‌شود که هر دو در نسخه‌ی اصلی دلیلِ نوشته‌شده دارند:
// «سبد باید روی /checkout هم روشن بماند» و «تبِ علاقه‌مندی و تبِ حساب نباید
// هم‌زمان روشن شوند». در نسخه‌ی Next این نوار اصلاً وجود نداشت.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BottomNav, bottomNavActive, showsBottomNav } from "@/components/BottomNav";
import type { AuthMeResponse, CartResponse } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/api", () => ({
  getMe: vi.fn(),
  getCart: vi.fn(),
  getWishlistIds: vi.fn(),
}));
import { getCart, getMe, getWishlistIds } from "@/lib/api";

const TAB_LABELS = ["خانه", "محصولات", "سبد خرید", "علاقه‌مندی", "ورود"];

let container: HTMLDivElement;
let root: Root;
let rootMounted = false;

async function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  root = createRoot(container);
  rootMounted = true;
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <BottomNav />
      </QueryClientProvider>,
    );
  });
  // دو پاسِ انتظارِ واقعی: سبد و علاقه‌مندی از بک‌اند می‌آیند و شمارنده‌ها به
  // همان پاسخ بسته‌اند، پس بدونِ این، آزمونِ شمارنده به‌جای سنجیدنِ منطق،
  // «هنوز نرسیده» را می‌سنجد.
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const nav = () => container.querySelector<HTMLElement>("nav.bottom-nav");
const activeItems = () =>
  Array.from(container.querySelectorAll(".bn-item.active")).map((el) =>
    el.textContent?.trim(),
  );

beforeEach(() => {
  pathname = "/";
  container = document.createElement("div");
  document.body.appendChild(container);
  rootMounted = false;
  window.location.hash = "";
  vi.mocked(getMe).mockReset().mockResolvedValue({ user: null } as AuthMeResponse);
  vi.mocked(getCart)
    .mockReset()
    .mockResolvedValue({ count: 0 } as unknown as CartResponse);
  vi.mocked(getWishlistIds).mockReset().mockResolvedValue({ ids: [] });
});

afterEach(() => {
  if (rootMounted) {
    act(() => {
      root.unmount();
    });
  }
  container.remove();
});

describe("bottomNavActive — کدام تب روشن است", () => {
  it("صفحه‌ی اصلی فقط تبِ خانه را روشن می‌کند", () => {
    const a = bottomNavActive("/", "");
    expect(a.home).toBe(true);
    expect([a.products, a.cart, a.wishlist, a.account]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("هم فهرستِ محصولات و هم صفحه‌ی یک محصول، تبِ «محصولات» را روشن می‌کنند", () => {
    expect(bottomNavActive("/products", "").products).toBe(true);
    expect(bottomNavActive("/product/12", "").products).toBe(true);
  });

  it("سبد روی /cart و روی /checkout روشن می‌ماند", () => {
    // مشتری که وسطِ پرداخت است نباید فکر کند از سبد بیرون آمده — عیناً همان
    // `is(['cart.html','checkout.html'])` نسخه‌ی Express.
    expect(bottomNavActive("/cart", "").cart).toBe(true);
    expect(bottomNavActive("/checkout", "").cart).toBe(true);
  });

  it("تبِ علاقه‌مندی فقط با لنگرِ #wishlist روشن می‌شود، و آن‌وقت تبِ حساب خاموش است", () => {
    const onWishlist = bottomNavActive("/account", "#wishlist");
    expect(onWishlist.wishlist).toBe(true);
    expect(onWishlist.account).toBe(false);
  });

  it("در /account بدونِ لنگر، تبِ حساب روشن است و تبِ علاقه‌مندی نه", () => {
    const onAccount = bottomNavActive("/account", "");
    expect(onAccount.account).toBe(true);
    expect(onAccount.wishlist).toBe(false);
  });

  it("صفحه‌ی ورود تبِ حساب را روشن می‌کند", () => {
    expect(bottomNavActive("/login", "").account).toBe(true);
  });

  it("در صفحه‌هایی مثل قوانین هیچ تبی روشن نمی‌شود", () => {
    const a = bottomNavActive("/terms", "");
    expect(Object.values(a).some(Boolean)).toBe(false);
  });
});

describe("showsBottomNav — کجا نوار نباشد", () => {
  it("صفحه‌ی ورود تمام‌صفحه است و نوار ندارد", () => {
    expect(showsBottomNav("/login")).toBe(false);
  });

  it("پنل مدیریت نوار ندارد (همتای اینکه admin.html هرگز common.js را لود نمی‌کرد)", () => {
    expect(showsBottomNav("/admin")).toBe(false);
    expect(showsBottomNav("/admin/orders")).toBe(false);
  });

  it("بقیه‌ی صفحه‌ها نوار دارند", () => {
    for (const p of ["/", "/products", "/product/12", "/cart", "/checkout", "/terms"]) {
      expect(showsBottomNav(p), p).toBe(true);
    }
  });
});

describe("BottomNav — رندر", () => {
  it("پنج مقصدِ اصلی را می‌سازد و تبِ درست را فعال می‌کند", async () => {
    await mount();
    expect(nav()).not.toBeNull();
    for (const label of TAB_LABELS) {
      expect(container.textContent, label).toContain(label);
    }
    expect(activeItems()).toEqual(["خانه"]);
  });

  it("مهمان به صفحه‌ی ورود می‌رود، با برچسبِ «ورود»", async () => {
    await mount();
    expect(container.querySelector('a[href="/login"]')?.textContent).toContain(
      "ورود",
    );
    expect(container.querySelector('a[href="/account"]')).toBeNull();
  });

  it("مشتریِ واردشده به حسابِ خودش می‌رود، با برچسبِ «حساب من»", async () => {
    vi.mocked(getMe).mockResolvedValue({
      user: {
        id: 1,
        phone: "09120000000",
        fullName: "سارا",
        isAdmin: false,
        isStaff: false,
        hasPassword: true,
      },
    } as AuthMeResponse);
    await mount();
    expect(container.querySelector('a[href="/account"]')?.textContent).toContain(
      "حساب من",
    );
    expect(container.querySelector('a[href="/login"]')).toBeNull();
  });

  it("شمارنده‌ی سبد فقط وقتی چیزی در سبد هست نشان داده می‌شود", async () => {
    vi.mocked(getCart).mockResolvedValue({ count: 3 } as unknown as CartResponse);
    vi.mocked(getWishlistIds).mockResolvedValue({ ids: [4, 5] });
    await mount();
    const badges = Array.from(container.querySelectorAll(".bn-count")).map(
      (el) => el.textContent,
    );
    expect(badges).toEqual(["۳", "۲"]);
  });

  it("سبدِ خالی هیچ شمارنده‌ای نمی‌سازد", async () => {
    await mount();
    expect(container.querySelectorAll(".bn-count")).toHaveLength(0);
  });

  it("در صفحه‌ی ورود رندر نمی‌شود", async () => {
    pathname = "/login";
    await mount();
    expect(nav()).toBeNull();
  });

  it("در پنل مدیریت رندر نمی‌شود", async () => {
    pathname = "/admin/orders";
    await mount();
    expect(nav()).toBeNull();
  });
});
