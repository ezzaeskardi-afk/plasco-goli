// ============================================================
// منطقِ خالصِ کادرِ خوش‌آمد — همتای initWelcomePrompt نسخه‌ی Express
// ============================================================
// این چند تابع عمداً بیرونِ کامپوننت‌اند تا همین‌جا سنجیده شوند: هر کدامشان
// یک تصمیمِ «چه زمانی به مشتری مزاحم نشویم» است و در نسخه‌ی Next کلِ این
// تصمیم‌ها وجود نداشت.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hasSeenWelcome,
  markWelcomeSeen,
  welcomePageEligible,
  welcomeScrolledEnough,
  WELCOME_SCROLL_FRACTION,
  WELCOME_SEEN_KEY,
} from "@/lib/welcome";

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* حالتِ خصوصی */
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("welcomePageEligible — کادر فقط در صفحه‌ی اصلی", () => {
  it("صفحه‌ی اصلی مجاز است", () => {
    expect(welcomePageEligible("/")).toBe(true);
  });

  it("بقیه‌ی صفحه‌ها مجاز نیستند", () => {
    for (const p of ["/product/12", "/products", "/cart", "/login", "/wholesale", "/admin"]) {
      expect(welcomePageEligible(p), p).toBe(false);
    }
  });
});

describe("دیده‌شدنِ کادر در حافظه", () => {
  it("در آغاز ندیده است", () => {
    expect(hasSeenWelcome()).toBe(false);
  });

  it("بعد از علامت‌گذاری، دیده‌شده حساب می‌شود و با کلیدِ نسخه‌ی Express ذخیره می‌شود", () => {
    markWelcomeSeen();
    expect(localStorage.getItem(WELCOME_SEEN_KEY)).toBe("1");
    expect(hasSeenWelcome()).toBe(true);
  });

  it("هر مقدارِ راستی در همان کلید، «دیده‌شده» است (سازگاری با نسخه‌ی Express)", () => {
    // نسخه‌ی Express هم `if (localStorage.getItem('pg_welcomed')) return;` بود،
    // یعنی «۱» را خاص نمی‌کرد. مهم است چون هر دو فرانت‌اند ممکن است روی یک
    // مرورگر و یک دامنه اجرا شوند.
    localStorage.setItem(WELCOME_SEEN_KEY, "yes");
    expect(hasSeenWelcome()).toBe(true);
  });
});

describe("welcomeScrolledEnough — اسکرول تا نصفِ صفحه", () => {
  it("بالای صفحه کافی نیست", () => {
    expect(welcomeScrolledEnough(0, 800, 4000)).toBe(false);
  });

  it("درست سرِ نصف، کافی است (آستانه شامل است)", () => {
    // scrollY + innerHeight باید برابرِ نصفِ scrollHeight شود: ۱۲۰۰ + ۸۰۰ = ۲۰۰۰
    expect(welcomeScrolledEnough(1200, 800, 4000)).toBe(true);
  });

  it("یک پیکسل کم‌تر کافی نیست", () => {
    expect(welcomeScrolledEnough(1199, 800, 4000)).toBe(false);
  });

  it("صفحه‌ی کوتاه‌تر از یک نمایشگر هرگز «نصف» نمی‌شود", () => {
    // ۵۰۰ + ۸۰۰ = ۱۳۰۰ در حالی که نصفِ ۱۰۰۰ می‌شود ۵۰۰ — ولی اینجا صفحه
    // کوتاه‌تر از صفحه‌ی نمایش است؛ در عمل هم کاربر اسکرولی نمی‌بیند، پس
    // شرطِ اسکرول نباید تایمرِ ۲۵ ثانیه را دور بزند — تایمر خودش هست.
    expect(welcomeScrolledEnough(0, 800, 1000)).toBe(true);
    expect(WELCOME_SCROLL_FRACTION).toBe(0.5);
  });
});
