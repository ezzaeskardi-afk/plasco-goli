// ============================================================
// نگهبانِ ورودیِ کدِ یک‌بارمصرف — هر مسیرِ paste یک رفتار
// ============================================================
// نسخهٔ قبلی paste را فقط با `e.key === "v" && e.ctrlKey` می‌شناخت. یعنی:
//   • Cmd+V روی مک چیزی نمی‌کرد،
//   • راست‌کلیک → Paste (و نگه‌داشتن روی موبایل) چیزی نمی‌کرد،
//   • autofillِ کدِ پیامکی که کلِ کد را در onChange می‌ریزد رد می‌شد
//     (`/^\d?$/` هر رشتهٔ بلندتر از یک نویسه را برمی‌گرداند).
// حالا هر سه مسیر به یک تابعِ خالص می‌رسند و این آزمون همان تابع را
// می‌سنجد؛ سیم‌کشیِ onPaste در LoginForm هم این‌جا قفل می‌شود.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyOtpText } from "@/lib/otpInput";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", "..");

const LOGIN_SRC = fs.readFileSync(
  path.join(NEXT_DIR, "src", "components", "LoginForm.tsx"),
  "utf8",
);

const empty5 = ["", "", "", "", ""];

describe("otpInput — تایپ و چسباندن", () => {
  it("تایپِ یک رقم، همان باکس را پر می‌کند و فوکس به بعدی می‌رود", () => {
    const fill = applyOtpText(empty5, 0, "4");
    expect(fill).not.toBeNull();
    expect(fill!.digits).toEqual(["4", "", "", "", ""]);
    expect(fill!.focus).toBe(1);
    expect(fill!.code).toBeNull();
  });

  it("pasteِ پنج‌رقمی از باکس اول، همه را پر و کدِ کامل را برمی‌گرداند (auto-submit)", () => {
    const fill = applyOtpText(empty5, 0, "12345");
    expect(fill!.digits).toEqual(["1", "2", "3", "4", "5"]);
    expect(fill!.code).toBe("12345");
    expect(fill!.focus).toBe(4);
  });

  it("متنِ پیامکی با حروف و فاصله، فقط ارقامش برداشته می‌شود", () => {
    const fill = applyOtpText(empty5, 0, "کد ورود شما: 54321 می‌باشد");
    expect(fill!.code).toBe("54321");
  });

  it("ارقامِ فارسی و عربی مثل لاتین پذیرفته می‌شوند", () => {
    expect(applyOtpText(empty5, 0, "۱۲۳۴۵")!.code).toBe("12345");
    expect(applyOtpText(empty5, 0, "١٢٣٤٥")!.code).toBe("12345");
  });

  it("paste از میانِ راه، از همان باکس شروع می‌کند", () => {
    const current = ["1", "2", "", "", ""];
    const fill = applyOtpText(current, 2, "34");
    expect(fill!.digits).toEqual(["1", "2", "3", "4", ""]);
    expect(fill!.code).toBeNull();
  });

  it("متنِ بلندتر از ظرفیت، سرریز نمی‌کند و فوکس را از فرم بیرون نمی‌برد", () => {
    const fill = applyOtpText(empty5, 0, "123456789");
    expect(fill!.digits).toEqual(["1", "2", "3", "4", "5"]);
    expect(fill!.focus).toBe(4);
  });

  it("متنِ غیرِرقمی نادیده گرفته می‌شود و باکس را پاک نمی‌کند", () => {
    expect(applyOtpText(["7", "", "", "", ""], 0, "abc")).toBeNull();
  });

  it("رشتهٔ خالی فقط همان باکس را خالی می‌کند", () => {
    const fill = applyOtpText(["1", "2", "3", "4", "5"], 2, "");
    expect(fill!.digits).toEqual(["1", "2", "", "4", "5"]);
    expect(fill!.code).toBeNull();
  });
});

describe("otpInput — سیم‌کشیِ LoginForm", () => {
  it("هر دو ورودیِ کد (پیامکی و Authenticator) onPaste دارند", () => {
    expect(LOGIN_SRC).toMatch(/onPaste=\{\(e\) => handleOtpPaste\(i, e\)\}/);
    expect(LOGIN_SRC).toMatch(/onPaste=\{\(e\) => handleTotpPaste\(i, e\)\}/);
  });

  it("منطقِ توزیع از ماژولِ مشترک می‌آید، نه کدِ خطیِ تکراری", () => {
    expect(LOGIN_SRC).toMatch(/import \{ applyOtpText \} from "@\/lib\/otpInput"/);
    expect(LOGIN_SRC).toMatch(/applyOtpText\(otpDigits, index, text\)/);
    expect(LOGIN_SRC).toMatch(/applyOtpText\(totpDigits, index, text\)/);
  });

  it("راهِ قدیمیِ فقط-Ctrl+V دیگر وجود ندارد", () => {
    // فقط خطوطِ کد سنجیده می‌شوند؛ کامنتِ توضیحی عمداً همان عبارتِ قدیمی را
    // نقل می‌کند تا خواننده بفهمد چه چیزی برداشته شده.
    const codeLines = LOGIN_SRC.split("\n").filter((l) => !l.trim().startsWith("//"));
    const code = codeLines.join("\n");
    expect(code).not.toMatch(/e\.ctrlKey/);
    expect(code).not.toMatch(/navigator\.clipboard\.readText/);
  });

  it("تایمرِ فوکوسِ تأخیری با شروعِ پرکردن خنثی می‌شود (مسابقهٔ pasteِ سریع)", () => {
    // آزمونِ مرورگرِ واقعی این مسابقه را گرفت: تایمرِ ۱۰۰ میلی‌ثانیه‌ایِ
    // «فوکوسِ باکسِ اول» می‌توانست بعد از pasteِ سریع شلیک کند و فوکوس را از
    // باکسِ پنجم بدزدد؛ آن‌وقت رقمِ آخر جای اشتباه می‌نشست و فرم نمی‌فرستاد.
    expect(LOGIN_SRC).toMatch(
      /const cancelOtpFocus[\s\S]{0,160}?clearTimeout\(otpFocusTimer\.current\)/,
    );
    expect(LOGIN_SRC).toMatch(
      /const cancelTotpFocus[\s\S]{0,160}?clearTimeout\(totpFocusTimer\.current\)/,
    );
    expect(LOGIN_SRC).toMatch(/const applyOtpFill[\s\S]{0,160}?cancelOtpFocus\(\)/);
    expect(LOGIN_SRC).toMatch(/const applyTotpFill[\s\S]{0,160}?cancelTotpFocus\(\)/);
  });
});
