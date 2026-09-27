// ============================================================
// هشدارِ «بارگذاریِ معلّق» — همان چیزی که مشتریِ گیرکرده می‌بیند
// ============================================================
// مسیرِ واقعیِ این باگ: مشتری از درگاهِ ورود می‌آید، کد را می‌زند و به مقصد
// منتقل می‌شود — ولی اگر رندرِ مقصد هیچ‌وقت تمام نشود، چیزی که می‌بیند یک
// اسکلتونِ بی‌زبان است، بی‌نهایت. نه پیامی، نه راهی برای بیرون آمدن.
//
// گاردِ این حالت دو نیمه دارد و **هر دو** لازم است:
//
//   • نیمه‌ی دیداری در CSS است (`.stall-notice` در `src/app/globals.css`)،
//     چون در بارگذاریِ کاملِ سند این HTML ممکن است هرگز hydrate نشود و
//     effectها اجرا نشوند (اندازه‌گیری شد). اگر این نیمه برداشته شود یا کلاس
//     از کامپوننت جدا شود، همان اسکلتونِ ابدی برمی‌گردد — آزمونِ دوم عمداً
//     روی دیسک نگاه می‌کند تا همین اتفاق قرمز شود.
//   • نیمه‌ی جاوااسکریپتی فقط کارهایی را می‌کند که CSS نمی‌تواند: اعلام به
//     صفحه‌خوان، و ارتقای «بارگذاری دوباره» به یک ناوبریِ صریح. اگر اجرا
//     نشود، دو راهِ فرار همچنان کار می‌کنند چون `<a>` ساده‌اند — آزمونِ سوم
//     همین را قفل می‌کند.
//
// متن‌های فارسیِ زیر عمداً **بدونِ نیم‌فاصله** انتخاب شده‌اند (قاعده‌ی فایلِ
// آزمونِ مجاور): یک کاراکترِ نامرئی که جابه‌جا شود، آزمون را می‌شکند بی‌آنکه
// رفتار عوض شده باشد.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { StallNotice } from "@/components/StallNotice";
import { reloadPage } from "@/lib/navigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// جاوااسکریپتِ مرورگر در jsdom واقعی اجرا می‌شود ولی تأثیری ندارد؛ مرزِ
// ناوبری در `lib/navigation.ts` جمع شده تا همین‌جا جعل شود.
vi.mock("@/lib/navigation", () => ({
  hardNavigate: vi.fn(),
  reloadPage: vi.fn(),
}));

/** همان عددِ روی دیسک — منبع: StallNotice.tsx */
const STALL_NOTICE_MS = 6000;
/** بخشی از متنِ پیام، بدونِ نیم‌فاصله */
const NOTICE = "دارد دیر باز";
const RELOAD_LABEL = "بارگذاری";
const HOME_LABEL = "اصلی";

// مثلِ آزمونِ مجاور: مسیرها از روی خودِ فایل حساب می‌شوند، نه از روی cwd —
// آزمون باید از هر جایی که اجرا شود یک نتیجه بدهد.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(HERE, "..", ".."); // next-frontend/
const GLOBALS_CSS = path.join(FRONTEND_DIR, "src", "app", "globals.css");

let container: HTMLDivElement;
let root: Root;
let rootMounted = false;

function bodyOf(): string {
  return container.textContent ?? "";
}

/** همان پنلِ پیام — چیزی که کاربر می‌بیند (یا تازه بعد از مهلت می‌بیند) */
function panel(): HTMLElement {
  const el = container.querySelector<HTMLElement>(".stall-notice");
  if (!el) throw new Error("پنلِ هشدار روی صفحه نبود");
  return el;
}

/** ناحیه‌ی زنده‌ای که صفحه‌خوان می‌خواند — جدا از پنلِ دیداری */
function liveRegion(): HTMLElement {
  const el = container.querySelector<HTMLElement>('[role="status"]');
  if (!el) throw new Error("ناحیه‌ی زنده روی صفحه نبود");
  return el;
}

function linkOf(text: string): HTMLAnchorElement {
  const a = Array.from(container.querySelectorAll("a")).find((el) =>
    (el.textContent ?? "").includes(text),
  );
  if (!a) throw new Error(`لینکِ «${text}» روی صفحه نبود`);
  return a;
}

/** تایمرها را جلو می‌برد و اجازه می‌دهد رندرها تمام شوند */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {});
}

async function mount() {
  root = createRoot(container);
  rootMounted = true;
  await act(async () => {
    root.render(<StallNotice />);
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

describe("هشدارِ بارگذاریِ معلّق", () => {
  it("پیام از همان ابتدا در HTML هست و مهلتش از خودِ کامپوننت می‌آید", async () => {
    await mount();

    // پیام و هر دو راهِ فرار باید *در همان HTMLی* باشند که سرور/روتر می‌فرستد.
    // دلیلش اندازه‌گیریِ بارگذاریِ کاملِ سند است: اگر جایی برای hydration نباشد،
    // دیگر هیچ شانسی برای ساختنِ این پیام وجود ندارد. پس ساخته‌شدنش نباید به
    // هیچ شرطی وابسته باشد.
    const text = panel().textContent ?? "";
    expect(text).toContain(NOTICE);
    // پیام باید reassuring باشد: سبد و سفارش سرِ جایشان‌اند و ورود ثبت شده.
    expect(text).toContain("سبد");
    expect(text).toContain("ورودتان ثبت شده");
    expect(text).toContain(RELOAD_LABEL);
    expect(text).toContain(HOME_LABEL);

    // مهلت با متغیرِ CSS به پنل داده می‌شود — همان چیزی که globals.css می‌خواند.
    expect(panel().getAttribute("style")).toContain(
      `--stall-delay: ${STALL_NOTICE_MS}ms`,
    );

    // و ناحیه‌ی زنده تا مهلت خالی است: مشتری بی‌دلیل چیزی نمی‌شنود.
    expect(liveRegion().textContent).toBe("");
    expect(bodyOf()).toContain(NOTICE);
  });

  it("نمایشِ پیام کارِ CSS است، نه effect — پس بدونِ hydration هم می‌آید", async () => {
    await mount();

    // این آزمون روی دیسک نگاه می‌کند، چون این نیمه اصلاً در جاوااسکریپت نیست:
    // یک کلاسِ پنهان به‌علاوه‌ی یک animation-delay. اگر کسی کلاس را از کامپوننت
    // بردارد یا قانونِ CSS را حذف کند، پیام برای کاربرِ بدونِ hydration برنمی-
    // گردد و اینجا قرمز می‌شود.
    const css = fs.readFileSync(GLOBALS_CSS, "utf8");

    // ۱) تنها چیزی که کاربر می‌بیند باید همین کلاس باشد.
    expect(panel().classList.contains("stall-notice")).toBe(true);

    const block = css.match(/\.stall-notice\s*\{([^}]*)\}/)?.[1] ?? "";
    // ۲) قبل از مهلت: نه دیده می‌شود و نه صفحه‌خوان می‌بیندش.
    expect(block).toMatch(/visibility:\s*hidden/);
    expect(block).toMatch(/opacity:\s*0/);
    // ۳) و نمایشش از همان متغیرِ کارتِ پنل تأخیر می‌خورد (یک منبعِ حقیقت).
    expect(block).toMatch(/animation:[^;]*var\(--stall-delay/);
    // ۴) پایانِ انیمیشن باید عنصر را واقعاً نشان بدهد — وگرنه پنهان می‌ماند.
    expect(css).toMatch(/@keyframes\s+stall-reveal\s*\{[^}]*visibility:\s*visible/);
  });

  it("هر دو راهِ فرار بدونِ جاوااسکریپت هم کار می‌کنند", async () => {
    await mount();

    // هیچ `button`ی روی صفحه نیست: دکمه‌ای که onClick بخواهد، بدونِ hydration
    // یک عنصرِ مرده است — یعنی دقیقاً همان چیزی که کاربرِ گیرکرده نباید ببیند.
    expect(container.querySelectorAll("button")).toHaveLength(0);

    // «بارگذاری دوباره» = پیمایش به همان آدرسِ فعلی (href خالی). کاربر بدونِ
    // هیچ onClickی، همین صفحه را از نو می‌آورد — و در ناوبریِ نرم، آدرس از قبل
    // همان مقصد است.
    expect(linkOf(RELOAD_LABEL).getAttribute("href")).toBe("");
    // و «صفحه‌ی اصلی» یک <a> ساده است، بدونِ وابستگی به روترِ Next.
    expect(linkOf(HOME_LABEL).getAttribute("href")).toBe("/");
  });

  it("با جاوااسکریپت، «بارگذاری دوباره» را به ناوبریِ صریح ارتقا می‌دهد", async () => {
    await mount();

    const link = linkOf(RELOAD_LABEL);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      link.dispatchEvent(event);
    });

    // هم رفتارِ مرورگر جلوی خودش گرفته می‌شود (تا دو بار پیمایش نشود)، هم
    // بارگذاریِ صریحِ خودمان اجرا می‌شود.
    expect(event.defaultPrevented).toBe(true);
    expect(vi.mocked(reloadPage)).toHaveBeenCalledTimes(1);
  });

  it("صفحه‌خوان با تأخیر خبردار می‌شود، نه قبلش", async () => {
    await mount();

    // یک میلی‌ثانیه قبل از مهلت هنوز چیزی اعلام نشده.
    await advance(STALL_NOTICE_MS - 1);
    expect(liveRegion().textContent).toBe("");

    await advance(1);
    expect(liveRegion().textContent).toContain(NOTICE);

    // و اگر بارگذاری سرِ وقت تمام شود، این کامپوننت با مرزِ بارگذاری می‌رود:
    // تایمرِ سرگردان یعنی یک setState روی کامپوننتِ رفته.
    await act(async () => {
      root.unmount();
    });
    rootMounted = false;
    await advance(STALL_NOTICE_MS * 2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
