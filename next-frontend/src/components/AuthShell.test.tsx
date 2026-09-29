// ============================================================
// پوسته‌ی صفحه‌ی ورود — همتای `frontend/login.html`
// ============================================================
// این آزمون چیزی را می‌سنجد که `shellParity.test.ts` نمی‌تواند: **ساختارِ
// واقعیِ رندر‌شده**. آن نگهبان فقط وجودِ نامِ کلاس در سورس را چک می‌کند؛ اگر
// همین‌جا مثلاً فقط دو آیکونِ شناور رندر شود یا لینکِ «پیگیری بدون ورود» به
// مسیرِ غلط برود، سورس هنوز همان نام‌ها را دارد و آن نگهبان سبز می‌ماند.
//
// سه چیز قفل می‌شود:
//   • شش آیکونِ شناور و چهار دلیلِ ستونِ معرفی (شمارش، نه فقط وجودِ کلاس)
//   • لینک‌ها: بازگشت به «/»، پیگیری بدون ورود به «/#track»، قوانین به «/terms»
//   • در دسترس‌پذیری: پس‌زمینه‌ی تزئینی `aria-hidden` باشد و ستونِ معرفی یک
//     عنوانِ واقعی (h2) داشته باشد، نه یک `div`ِ متن.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AuthShell } from "@/components/AuthShell";
import { HideOnStandalone } from "@/components/HideOnStandalone";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/login";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

let container: HTMLDivElement;
let root: Root;
let mounted = false;

async function render(ui: React.ReactNode) {
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(ui);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      root.unmount();
    });
    mounted = false;
  }
  container.remove();
  pathname = "/login";
});

describe("پوسته‌ی صفحه‌ی ورود", () => {
  it("شش آیکونِ شناور و پس‌زمینه‌ی تزئینیِ پنهان را رندر می‌کند", async () => {
    await render(
      <AuthShell>
        <div data-testid="card">فرم</div>
      </AuthShell>,
    );

    const floats = container.querySelectorAll("svg.ab-float");
    expect(floats.length).toBe(6);
    // هر شش تا باید به یک id معتبرِ اسپرایت اشاره کنند (نه رشته‌ی خالی).
    const hrefs = [...floats].map((s) => s.querySelector("use")?.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(6);
    expect(hrefs.every((h) => /^#i-[a-z-]+$/.test(h ?? ""))).toBe(true);

    // پس‌زمینه تزئینی است: نباید در درختِ دسترس‌پذیری بماند.
    expect(container.querySelector(".auth-bg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("چهار دلیلِ ستونِ معرفی را با عنوانِ واقعی (h2) می‌سازد", async () => {
    await render(
      <AuthShell>
        <div>فرم</div>
      </AuthShell>,
    );

    const title = container.querySelector("h2.aa-title");
    expect(title?.textContent).toContain("هر چیزی که خانه لازم دارد");

    const points = container.querySelectorAll(".aa-points > li");
    expect(points.length).toBe(4);
    expect(points[0].textContent).toContain("ارسال به سراسر کشور");
    expect(points[1].textContent).toContain("پرداخت امن زرین‌پال");
    expect(points[2].textContent).toContain("مرجوعی");
    expect(points[3].textContent).toContain("پیگیری لحظه‌ای سفارش");
  });

  it("ردیفِ اعتماد و دو خطِ حقوقی درست را زیر کارت می‌گذارد", async () => {
    await render(
      <AuthShell>
        <div>فرم</div>
      </AuthShell>,
    );

    const trust = container.querySelectorAll(".auth-trust > span");
    expect(trust.length).toBe(3);

    const legal = container.querySelectorAll("p.auth-legal");
    expect(legal.length).toBe(2);
    expect(legal[0].textContent).toContain("بدون ورود پیگیری کنید");
    expect(legal[1].textContent).toContain("قوانین و مقررات");
  });

  it("پیگیریِ بدونِ ورود به لنگرِ #track و بازگشت به صفحه‌ی اصلی می‌رود", async () => {
    await render(
      <AuthShell>
        <div>فرم</div>
      </AuthShell>,
    );

    // اگر این لنگر غلط باشد، لینک به بالای صفحه می‌افتد و کار نمی‌کند —
    // همان چیزی که در Express با `index.html#track` کار می‌کرد.
    const track = [...container.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("بدون ورود پیگیری کنید"),
    );
    expect(track?.getAttribute("href")).toBe("/#track");

    const terms = [...container.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("قوانین و مقررات"),
    );
    expect(terms?.getAttribute("href")).toBe("/terms");

    const back = container.querySelector("a.auth-back");
    expect(back?.getAttribute("href")).toBe("/");
    expect(back?.textContent).toContain("بازگشت به فروشگاه");
  });

  it("فرمِ داخلش را دقیقاً یک بار رندر می‌کند", async () => {
    await render(
      <AuthShell>
        <div data-testid="card">فرم</div>
      </AuthShell>,
    );
    expect(container.querySelectorAll('[data-testid="card"]').length).toBe(1);
  });
});

describe("پنهان‌کردنِ چارچوبِ فروشگاه در مسیرهای تمام‌صفحه", () => {
  it("در /login هدر و پاورقی را رندر نمی‌کند", async () => {
    pathname = "/login";
    await render(
      <HideOnStandalone>
        <p>هدر</p>
      </HideOnStandalone>,
    );
    expect(container.textContent).toBe("");
  });

  it("در بقیه‌ی مسیرها چارچوب را سرِ جایش می‌گذارد", async () => {
    pathname = "/products";
    await render(
      <HideOnStandalone>
        <p>هدر</p>
      </HideOnStandalone>,
    );
    expect(container.textContent).toBe("هدر");
  });
});
