// ============================================================
// جلوه‌های اسکرول — همتای initScrollFx + initScrollReveal نسخه‌ی Express
// ============================================================
// مهم‌ترین آزمونِ این فایل، آزمونِ اول است. `[data-reveal]` در CSS با
// `opacity:0` شروع می‌کند؛ اگر ناظری نباشد که کلاسِ `is-visible` را بگذارد،
// محتوا برای همیشه نامرئی می‌ماند و هیچ‌کدام از typecheck/lint/build این را
// نمی‌گیرد. یعنی این یک آزمونِ «زیبایی» نیست، آزمونِ «صفحه خالی نشود» است.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ScrollFx } from "@/components/ScrollFx";
import { REVEAL_THRESHOLD, TO_TOP_AT } from "@/lib/scrollFx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

type Entry = { target: Element; isIntersecting: boolean };

/** ناظرِ ساختگی — jsdom نداردش وگرنه هیچ راهی برای سنجیدنِ آستانه نبود. */
class FakeIO {
  static all: FakeIO[] = [];
  targets: Element[] = [];
  constructor(
    private cb: (entries: Entry[]) => void,
    public options: IntersectionObserverInit,
  ) {
    FakeIO.all.push(this);
  }
  observe(t: Element) {
    this.targets.push(t);
  }
  unobserve(t: Element) {
    this.targets = this.targets.filter((x) => x !== t);
  }
  disconnect() {
    this.targets = [];
  }
  enter() {
    this.cb(this.targets.map((target) => ({ target, isIntersecting: true })));
  }
}

let container: HTMLDivElement;
let fixtures: HTMLDivElement;
let root: Root;
let rootMounted = false;

async function mount() {
  root = createRoot(container);
  rootMounted = true;
  await act(async () => {
    root.render(<ScrollFx />);
  });
}

function addReveal(html: string): HTMLElement {
  fixtures.innerHTML = html;
  return fixtures;
}

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", {
    value: y,
    configurable: true,
    writable: true,
  });
}

/** رویدادِ اسکرول را می‌فرستد و فریمِ throttle را هم اجرا می‌کند. */
async function scrollTo(y: number) {
  setScrollY(y);
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  pathname = "/";
  FakeIO.all = [];
  setScrollY(0);
  container = document.createElement("div");
  fixtures = document.createElement("div");
  document.body.append(container, fixtures);
  rootMounted = false;
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  delete (window as { matchMedia?: unknown }).matchMedia;
});

afterEach(() => {
  if (rootMounted) {
    act(() => {
      root.unmount();
    });
  }
  container.remove();
  fixtures.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ScrollFx — هیچ محتوایی نامرئی نمی‌ماند", () => {
  it("بدونِ IntersectionObserver همه‌ی نشانه‌ها همان اول نمایان می‌شوند", async () => {
    const wrap = addReveal(
      `<p data-reveal=""></p><p data-reveal=""></p><p data-reveal=""></p>`,
    );
    await mount();
    expect(wrap.querySelectorAll("[data-reveal].is-visible")).toHaveLength(3);
  });

  it("کاربرِ «کم‌حرکت» هم بدونِ انیمیشن همه‌چیز را می‌بیند", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    const wrap = addReveal(`<p data-reveal=""></p>`);
    await mount();
    expect(wrap.querySelectorAll("[data-reveal].is-visible")).toHaveLength(1);
  });

  it("محتوایی که بعد از mount اضافه می‌شود هم گرفته می‌شود", async () => {
    const wrap = addReveal(`<p data-reveal=""></p>`);
    await mount();
    await act(async () => {
      const late = document.createElement("p");
      late.setAttribute("data-reveal", "");
      wrap.appendChild(late);
    });
    expect(wrap.querySelectorAll("[data-reveal].is-visible")).toHaveLength(2);
  });
});

describe("ScrollFx — ناظرِ واقعی", () => {
  it("آستانه‌ی ۰٫۱۲ و تأخیرِ پله‌ای بین همسایه‌ها را می‌گذارد", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const wrap = addReveal(
      `<p data-reveal=""></p><p data-reveal=""></p><p data-reveal=""></p>`,
    );
    await mount();

    const io = FakeIO.all.at(-1);
    expect(io).toBeDefined();
    expect(io?.options.threshold).toBe(REVEAL_THRESHOLD);
    expect(io?.targets).toHaveLength(3);

    // پله: اولی بی‌تأخیر، بعدی ۸۰ms، سومی ۱۶۰ms — و سقفِ ۴ پله.
    const rd = Array.from(wrap.querySelectorAll<HTMLElement>("p")).map((p) =>
      p.style.getPropertyValue("--rd"),
    );
    expect(rd).toEqual(["", "80ms", "160ms"]);

    // تا وقتی وارد دید نشده، هیچ‌چیز نمایان نمی‌شود (این همان رفتارِ انیمیشن است).
    expect(wrap.querySelectorAll("[data-reveal].is-visible")).toHaveLength(0);

    await act(async () => {
      io?.enter();
    });
    expect(wrap.querySelectorAll("[data-reveal].is-visible")).toHaveLength(3);
  });

  it("هر نشانه فقط یک بار به ناظر داده می‌شود", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    addReveal(`<p data-reveal=""></p>`);
    await mount();
    // یک تغییرِ بی‌ربط در DOM نباید همان هدف را دوباره ثبت کند (وگرنه تأخیرِ
    // پله‌ای هر بار بیشتر می‌شد).
    await act(async () => {
      fixtures.appendChild(document.createElement("span"));
    });
    expect(FakeIO.all.at(-1)?.targets).toHaveLength(1);
  });
});

describe("ScrollFx — دکمه‌ی بازگشت به بالا", () => {
  it("در بالای صفحه پنهان است و بعد از عبور از ۶۰۰ پیکسل نمایان می‌شود", async () => {
    await mount();
    const btn = container.querySelector<HTMLElement>(".to-top");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-label")).toBe("بازگشت به بالای صفحه");

    await act(async () => {
      vi.advanceTimersByTime(20); // فریمِ اولِ useScrollPast
    });
    expect(btn?.classList.contains("show")).toBe(false);

    await scrollTo(TO_TOP_AT);
    expect(btn?.classList.contains("show")).toBe(false);

    await scrollTo(TO_TOP_AT + 1);
    expect(btn?.classList.contains("show")).toBe(true);

    await scrollTo(0);
    expect(btn?.classList.contains("show")).toBe(false);
  });

  it("کلیک روی دکمه به بالای صفحه برمی‌گردد", async () => {
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
    await mount();
    await scrollTo(900);
    await act(async () => {
      container.querySelector<HTMLElement>(".to-top")?.click();
    });
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("در پنل مدیریت هیچ‌چیز رندر نمی‌شود", async () => {
    pathname = "/admin/orders";
    const wrap = addReveal(`<p data-reveal=""></p>`);
    await mount();
    expect(container.querySelector(".to-top")).toBeNull();
    // و آن‌جا هم `data-reveal` نباید بی‌ناظر بماند — ولی چون در پنل نشانه‌ای
    // نمی‌گذاریم، اینجا فقط نبودِ دکمه مهم است.
    expect(wrap.querySelectorAll("[data-reveal]")).toHaveLength(1);
  });
});
