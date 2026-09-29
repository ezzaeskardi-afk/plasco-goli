// ============================================================
// منوی کشوییِ موبایل — همتای `#drawer` و `initDrawer` نسخه‌ی Express
// ============================================================
// این منو در نسخه‌ی Next کامل غایب بود: نه جستجو داشت، نه دسته‌بندی‌ها، نه
// لینک‌های راهنما. آزمون‌ها روی همان چیزهایی تمرکز دارند که در نسخه‌ی اصلی
// دلیلِ نوشته‌شده داشتند: بستن با Escape و پس‌زمینه، جستجویی که به فهرست
// می‌برد، و برچسبِ ورود/حساب که با نشستِ کاربر عوض می‌شود.

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MobileDrawer } from "@/components/MobileDrawer";
import type { ShopCategory, User } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const CATEGORIES: ShopCategory[] = [
  { id: 1, name: "تشت و لگن", icon: "i-tub", sort: 1, count: 3 },
  { id: 2, name: "لوازم نظافت", icon: "i-broom", sort: 2, count: 2 },
];

const USER: User = {
  id: 7,
  phone: "09120000000",
  fullName: "سارا",
  isAdmin: false,
  isStaff: false,
  hasPassword: true,
};

type CloseFn = (options?: { restoreFocus?: boolean }) => void;

let container: HTMLDivElement;
let root: Root;
let rootMounted = false;
let onClose: Mock<CloseFn>;

async function mount({
  open = true,
  categories = CATEGORIES,
  user = null as User | null,
} = {}) {
  onClose = vi.fn<CloseFn>();
  root = createRoot(container);
  rootMounted = true;
  await act(async () => {
    root.render(
      <MobileDrawer
        open={open}
        onClose={onClose}
        categories={categories}
        user={user}
      />,
    );
  });
}

const drawer = () => container.querySelector<HTMLElement>("#drawer");
const panel = () => container.querySelector<HTMLElement>(".drawer-panel");

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  rootMounted = false;
  push.mockClear();
});

afterEach(() => {
  if (rootMounted) {
    act(() => {
      root.unmount();
    });
  }
  container.remove();
});

describe("MobileDrawer — باز و بسته", () => {
  it("در حالتِ بسته رندر می‌شود ولی کلاسِ open ندارد", async () => {
    await mount({ open: false });
    expect(drawer()).not.toBeNull();
    expect(drawer()?.classList.contains("open")).toBe(false);
  });

  it("در حالتِ باز، کلاسِ open و نقشِ دیالوگ را دارد", async () => {
    await mount();
    expect(drawer()?.classList.contains("open")).toBe(true);
    expect(drawer()?.getAttribute("role")).toBe("dialog");
    expect(drawer()?.getAttribute("aria-modal")).toBe("true");
    expect(drawer()?.getAttribute("aria-label")).toBe("منوی اصلی");
  });

  it("با Escape بسته می‌شود", async () => {
    await mount();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("کلیک روی پس‌زمینه می‌بندد، ولی کلیک داخل پنل نه", async () => {
    await mount();
    await act(async () => {
      panel()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      drawer()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("MobileDrawer — محتوا", () => {
  it("صفحه‌ها، دسته‌بندی‌ها و راهنما را دارد", async () => {
    await mount();
    const text = panel()?.textContent ?? "";
    for (const label of [
      "صفحات",
      "خانه",
      "محصولات",
      "سبد خرید",
      "دسته‌بندی‌ها",
      "راهنما",
      "درباره ما",
      "سوالات متداول",
      "تماس با ما",
      "قوانین و راهنمای خرید",
    ]) {
      expect(text, label).toContain(label);
    }
  });

  it("دسته‌بندی‌ها با آیکونِ خودشان از سرور می‌آیند", async () => {
    await mount();
    const uses = Array.from(panel()?.querySelectorAll("use") ?? []).map((u) =>
      u.getAttribute("href"),
    );
    expect(uses).toContain("#i-tub");
    expect(uses).toContain("#i-broom");
    expect(
      Array.from(panel()?.querySelectorAll("a") ?? []).map((a) =>
        a.getAttribute("href"),
      ),
    ).toContain("/products?category=%D8%AA%D8%B4%D8%AA%20%D9%88%20%D9%84%DA%AF%D9%86");
  });

  it("مهمان «ورود / ثبت‌نام» می‌بیند و به /login می‌رود", async () => {
    await mount();
    expect(panel()?.textContent).toContain("ورود / ثبت‌نام");
    expect(
      Array.from(panel()?.querySelectorAll("a") ?? []).map((a) =>
        a.getAttribute("href"),
      ),
    ).toContain("/login");
  });

  it("مشتریِ واردشده نامش را می‌بیند و به حسابش می‌رود", async () => {
    await mount({ user: USER });
    expect(panel()?.textContent).toContain("حساب سارا");
    expect(
      Array.from(panel()?.querySelectorAll("a") ?? []).map((a) =>
        a.getAttribute("href"),
      ),
    ).toContain("/account");
  });

  it("بدونِ دسته‌بندی، بخشِ دسته‌بندی‌ها نیامده است", async () => {
    await mount({ categories: [] });
    expect(panel()?.textContent).not.toContain("دسته‌بندی‌ها");
  });

  it("کلیک روی هر لینک منو را می‌بندد و فوکوس را برنمی‌گرداند", async () => {
    await mount();
    const productsLink = Array.from(panel()?.querySelectorAll("a") ?? []).find(
      (a) => a.textContent?.trim() === "محصولات",
    );
    await act(async () => {
      productsLink?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledWith({ restoreFocus: false });
  });
});

describe("MobileDrawer — جستجو", () => {
  it("با Enter به فهرستِ محصولات می‌رود و منو را می‌بندد", async () => {
    await mount();
    const input = panel()?.querySelector<HTMLInputElement>('input[type="search"]');
    // مقدار باید از مسیرِ native setter برود، وگرنه React خودش مقدار را
    // ردیابی می‌کند و رویدادِ input را «تغییرنکرده» می‌بیند.
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      if (input && setValue) {
        setValue.call(input, "سطل");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await act(async () => {
      panel()
        ?.querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(push).toHaveBeenCalledWith(`/products?q=${encodeURIComponent("سطل")}`);
    expect(onClose).toHaveBeenCalledWith({ restoreFocus: false });
  });

  it("جستجوی خالی هیچ‌جا نمی‌رود ولی منو را می‌بندد", async () => {
    await mount();
    await act(async () => {
      panel()
        ?.querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(push).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith({ restoreFocus: false });
  });
});
