// ============================================================
// ورودیِ کدِ یک‌بارمصرف — توزیعِ متنِ چسبانده‌شده بین باکس‌ها
// ============================================================
// چرا ماژولِ جدا: همین رفتار در دو جا تکرار می‌شود (کدِ پیامکیِ ۵ رقمی و
// کدِ برنامهٔ Authenticatorِ ۶ رقمی) و نسخهٔ قبلی فقط با «Ctrl+V» کار
// می‌کرد — یعنی Cmd+V روی مک، paste از منوی راست‌کلیک، و autofillِ کدِ
// پیامکیِ iOS/اندروید (که کلِ کد را یک‌جا در onChange می‌ریزد) هیچ‌کدام
// نمی‌گرفتند و کاربر باید ۵ رقم را دستی و در ۳۰ ثانیه تایپ می‌کرد.
//
// تابع خالص است تا هر دو لبه‌اش قابلِ سنجش باشد: «چه می‌شود» (توزیع از
// جایِ درست، بریدنِ سرریز، کدِ کامل وقتی همه پر شد) و «چه نمی‌شود» (حرفِ
// غیرِ رقم باکس را پاک نمی‌کند — رفتارِ پیش‌فرضِ مرورگر با maxLength خودش
// همان یک نویسه را جا می‌دهد و state کنترل‌شده برش می‌گرداند).

export type OtpFill = {
  digits: string[];
  /** باکسی که باید فوکس شود */
  focus: number;
  /** کدِ کامل وقتی همهٔ باکس‌ها پر شدند؛ وگرنه null */
  code: string | null;
};

/**
 * متنِ تازه‌رسیده به یک باکس را بین باکس‌ها پخش می‌کند.
 *
 * @param current وضعیتِ فعلیِ باکس‌ها
 * @param start   باکسی که رویداد رویش افتاده
 * @param text    مقدارِ ورودی: تایپِ یک رقم، pasteِ چندرقمی، یا '' برای پاک‌کردن
 * @returns حالتِ جدید، یا null یعنی «نادیده بگیر» (متنِ غیرِرقمی — نه پاک‌کردن)
 */
export function applyOtpText(current: string[], start: number, text: string): OtpFill | null {
  const raw = String(text ?? "");

  // رشتهٔ خالی = کاربر باکس را پاک کرده؛ همان باکس خالی می‌ماند
  if (!raw) {
    const out = [...current];
    out[start] = "";
    return { digits: out, focus: start, code: null };
  }

  // ارقامِ فارسی/عربی هم پذیرفته می‌شوند: پیامک‌ها معمولاً لاتین‌اند، ولی
  // کپی‌کردن از جایی که ۰-۹ فارسی به‌کار رفته نباید «هیچ» حساب شود.
  const normalized = raw
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));

  const digits = normalized.replace(/\D/g, "").split("");
  if (!digits.length) return null; // حرف/فاصله — نباید باکس را پاک کند

  const out = [...current];
  digits.forEach((d, i) => {
    const at = start + i;
    if (at < out.length) out[at] = d;
  });

  // سرریز نمی‌کنیم: بدنهٔ pasteِ بلندتر از ظرفیت، فوکس را از فرم بیرون نمی‌برد
  const focus = Math.min(start + Math.max(digits.length, 1), out.length - 1);
  const code = out.every((d) => d !== "") ? out.join("") : null;
  return { digits: out, focus, code };
}
