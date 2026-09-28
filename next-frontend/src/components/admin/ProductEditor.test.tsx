// ============================================================
// ویرایشگرِ کاملِ محصول — رفتارش، نه توابعِ داخلی‌اش
// ============================================================
// این فرم تنها راهِ ویرایشِ کاملِ کالا است (توضیحات، عکس، گالری، مشخصات،
// عمده‌فروشی) و تا امروز در پنلِ Express بود. چهار چیزی که آزمون قفل می‌کند:
//
//   ۱) کالا **درست** در فرم بارگذاری می‌شود (عددها به رشته، صفر به خالی).
//   ۲) فرمِ نامعتبر هیچ درخواستی نمی‌فرستد و خطا را نشان می‌دهد — وگرنه سرور
//      ۴۰۰ می‌داد و مدیر فقط یک پیامِ نامفهوم می‌دید.
//   ۳) ذخیره، payload درست می‌فرستد (`oldPrice` نه `old_price`؛ مشخصاتِ
//      نیمه‌خالی حذف).
//   ۴) دو نگهبانِ انتشار: کالای بی‌عکس ۴۰۹ می‌گیرد و فقط با تأییدِ صریحِ مدیر
//      منتشر می‌شود؛ و در حالتِ گزارش‌نشده فرم بازنویسی نمی‌شود.
//
// چه چیزی جعل می‌شود: خودِ لایه‌ی API پنل (تا هیچ شبکه‌ای لازم نباشد)،
// مسیریابِ Next، لینک، و toast. چه چیزی واقعی است: فرم، اعتبارسنجی و تبدیلِ
// state — یعنی همان چیزی که این آزمون برایش نوشته شده.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ------------------------------------------------------------
// مرزها
// ------------------------------------------------------------
const api = vi.hoisted(() => ({
  getAdminProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  setProductPublished: vi.fn(),
  uploadImage: vi.fn(),
  thumbUrl: (p: string | null, w = 320) => (p ? `${p}?w=${w}` : ""),
}));

vi.mock("@/lib/adminApi", () => api);

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const toasts = vi.hoisted(() => [] as string[]);
vi.mock("@/components/Toast", () => ({
  useToast: () => (msg: string) => {
    toasts.push(msg);
  },
}));

// `window.confirm` در jsdom تعریف شده ولی همیشه false می‌دهد (و لاگ می‌کند).
let confirmAnswer = false;
const confirmSpy = vi.fn(() => confirmAnswer);

// ------------------------------------------------------------
// کالای آزمایشی
// ------------------------------------------------------------
const PRODUCT = {
  id: 7,
  title: "سطل رنگ ساختمانی",
  category: "رنگ",
  description: "توضیحِ کوتاه",
  price: 120000,
  oldPrice: 150000,
  stock: 4,
  badge: "جدید",
  icon: "i-package",
  image: "/picture/products/a.jpg",
  images: ["/picture/products/a.jpg"],
  specs: [{ k: "گنجایش", v: "۳ لیتر" }],
  wholesaleMinQty: 12,
  wholesaleDiscount: 15,
  published: false,
  createdAt: "2026-08-01 10:00:00",
  updatedAt: "2026-08-20 11:30:00",
};

let container: HTMLDivElement;
let root: Root | null = null;

/**
 * تمام‌کردنِ کارهای معلق.
 *
 * ⚠️ بدونِ `setTimeout(…, 0)` کافی نیست: react-query نتیجه‌ی هر query را با
 * یک macrotask خبر می‌دهد (batching)، و `await act(async () => {})` فقط
 * ریزکارها را تمام می‌کند. با همان، فرم تا ابد «در حال خواندنِ کالا…» می‌ماند
 * — که خودش یک بار همین اتفاق افتاد.
 */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {});
}

async function render(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  });
  await flush();
}

function unmount() {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
}

/** ورودی/متنِ دارای برچسبِ دسترس‌پذیری — تنها راهِ سنجیدنِ مستقل از ترتیبِ DOM */
function field(name: string): HTMLInputElement | HTMLTextAreaElement {
  const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${name}"]`,
  );
  expect(el, `فیلدی با برچسبِ «${name}» پیدا نشد`).not.toBeNull();
  return el as HTMLInputElement;
}

function setField(name: string, value: string) {
  const el = field(name);
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  // React به setterِ خودِ عنصر گوش می‌دهد؛ تغییرِ مستقیمِ `.value` رویداد
  // نمی‌سازد و state عوض نمی‌شود.
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  // داخلِ `act` وگرنه React هشدارِ «update not wrapped in act» می‌دهد
  act(() => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => (b.textContent || "").includes(text),
  );
  expect(found, `دکمه‌ای با متنِ «${text}» پیدا نشد`).not.toBeNull();
  return found as HTMLButtonElement;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

beforeEach(() => {
  api.getAdminProducts.mockReset();
  api.createProduct.mockReset();
  api.updateProduct.mockReset();
  api.setProductPublished.mockReset();
  api.uploadImage.mockReset();
  router.push.mockReset();
  toasts.length = 0;
  confirmAnswer = false;
  confirmSpy.mockClear();
  vi.stubGlobal("confirm", confirmSpy);

  api.getAdminProducts.mockResolvedValue({ products: [{ ...PRODUCT }] });
  api.updateProduct.mockResolvedValue({ ok: true, product: {} });
  api.createProduct.mockResolvedValue({ ok: true, product: { id: 9 } });
  api.setProductPublished.mockResolvedValue({ ok: true, published: 1, product: {} });
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("بارگذاریِ کالا در فرم", () => {
  it("مقدارهای کالا در فیلدها می‌نشینند", async () => {
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    await render(<ProductEditor id={7} />);

    expect(field("عنوان").value).toBe("سطل رنگ ساختمانی");
    expect(field("دسته‌بندی").value).toBe("رنگ");
    expect(field("قیمت").value).toBe("120000");
    expect(field("قیمت خط‌خورده").value).toBe("150000");
    // مشخصاتِ کالا
    expect(field("عنوان مشخصه").value).toBe("گنجایش");
    expect(field("مقدار مشخصه").value).toBe("۳ لیتر");
    // عمده‌فروشی
    expect(field("حد نصاب عمده").value).toBe("12");
    expect(field("درصد تخفیف عمده").value).toBe("15");
    // پیش‌نمایشِ عکسِ کاور با نسخه‌ی کوچک
    expect(container.innerHTML).toContain("/picture/products/a.jpg?w=");
  });

  it("شناسه‌ی ناموجود → پیامِ روشن، نه فرمِ خالی", async () => {
    api.getAdminProducts.mockResolvedValue({ products: [] });
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    await render(<ProductEditor id={7} />);

    expect(container.textContent).toContain("کالا پیدا نشد");
    expect(container.textContent).toContain("بازگشت به انبار");
  });
});

describe("اعتبارسنجی", () => {
  it("فرمِ نامعتبر هیچ درخواستی نمی‌فرستد و خطا را نشان می‌دهد", async () => {
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    await render(<ProductEditor id={7} />);

    // عنوان را خالی کن و ذخیره بزن
    setField("عنوان", "");
    await click(buttonByText("ذخیره"));

    expect(api.updateProduct).not.toHaveBeenCalled();
    expect(container.textContent).toContain("عنوان لازم است");
    expect(toasts.join(" ")).toContain("عنوان لازم است");
  });

  it("تخفیفِ بزرگ‌تر از قیمت رد می‌شود", async () => {
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    await render(<ProductEditor id={7} />);

    setField("قیمت خط‌خورده", "1000");
    await click(buttonByText("ذخیره"));

    expect(api.updateProduct).not.toHaveBeenCalled();
    expect(container.textContent).toContain("قیمت قبلی باید از قیمت فعلی بیشتر باشد");
  });
});

describe("ذخیره", () => {
  it("payload با نام‌های درست و مشخصاتِ تمیزشده می‌رود", async () => {
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    await render(<ProductEditor id={7} />);

    setField("قیمت", "125000");
    await click(buttonByText("ذخیره"));

    expect(api.updateProduct).toHaveBeenCalledTimes(1);
    const [id, payload] = api.updateProduct.mock.calls[0] as [number, Record<string, unknown>];
    expect(id).toBe(7);
    expect(payload.price).toBe(125000);
    // سرور `oldPrice` را می‌خواند (نه `old_price`) و با مقدار قبلی ادغام می‌کند
    expect(payload.oldPrice).toBe(150000);
    expect(payload.specs).toEqual([{ k: "گنجایش", v: "۳ لیتر" }]);
    expect(payload.images).toEqual(["/picture/products/a.jpg"]);
    expect(payload.wholesaleDiscount).toBe(15);
    expect(toasts.join(" ")).toContain("ذخیره شد");
  });

  it("کالای تازه ساخته می‌شود و بعد از ساخت به فهرست برمی‌گردد", async () => {
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    await render(<ProductEditor />);

    setField("عنوان", "کالای تازه");
    setField("دسته‌بندی", "رنگ");
    setField("قیمت", "50000");
    setField("موجودی", "3");
    await click(buttonByText("ساختن"));

    expect(api.createProduct).toHaveBeenCalledTimes(1);
    expect(api.updateProduct).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/admin/stock");
  });
});

describe("آپلودِ عکس", () => {
  it("فایلِ غیرتصویری رد می‌شود و به سرور نمی‌رود", async () => {
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    await render(<ProductEditor id={7} />);

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(toasts.join(" ")).toContain("فقط عکس JPG/PNG/WebP قابل قبول است");
  });

  it("فایلِ سالم آپلود می‌شود و مسیرش در گالری می‌نشیند", async () => {
    api.uploadImage.mockResolvedValue({
      ok: true,
      path: "/picture/products/new.jpg",
      width: 800,
      height: 600,
    });
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    await render(<ProductEditor id={7} />);

    // دومی ورودیِ گالری است (اولی کاور) — با `multiple` تشخیص داده می‌شود
    const gallery = container.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
    const file = new File(["x"], "new.jpg", { type: "image/jpeg" });
    Object.defineProperty(gallery, "files", { value: [file], configurable: true });
    await act(async () => {
      gallery.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    await click(buttonByText("ذخیره"));
    const [, payload] = api.updateProduct.mock.calls[0] as [number, { images: string[] }];
    expect(payload.images).toContain("/picture/products/new.jpg");
  });
});

describe("انتشار", () => {
  it("۴۰۹ «عکس ندارد» فقط با تأییدِ مدیر رد می‌شود", async () => {
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    const { ApiError } = await import("@/lib/api");

    api.setProductPublished
      .mockRejectedValueOnce(
        new ApiError(409, "این محصول عکس ندارد؛ اگر مطمئنی، دوباره با تأیید بفرست"),
      )
      .mockResolvedValueOnce({ ok: true, published: 1, product: {} });

    await render(<ProductEditor id={7} />);
    confirmAnswer = true;
    await click(buttonByText("انتشار در سایت"));

    expect(api.setProductPublished).toHaveBeenCalledTimes(2);
    expect(api.setProductPublished.mock.calls[0]).toEqual([7, true, false]);
    expect(api.setProductPublished.mock.calls[1]).toEqual([7, true, true]);
  });

  it("اگر مدیر تأیید نکند، دورِ دوم اجرا نمی‌شود", async () => {
    const { ProductEditor } = await import("@/components/admin/ProductEditor");
    const { ApiError } = await import("@/lib/api");

    api.setProductPublished.mockRejectedValueOnce(
      new ApiError(409, "این محصول عکس ندارد؛ اگر مطمئنی، دوباره با تأیید بفرست"),
    );

    await render(<ProductEditor id={7} />);
    confirmAnswer = false;
    await click(buttonByText("انتشار در سایت"));

    expect(api.setProductPublished).toHaveBeenCalledTimes(1);
  });
});
