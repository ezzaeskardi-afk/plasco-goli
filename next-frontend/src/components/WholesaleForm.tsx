"use client";

import { useState } from "react";
import { requestWholesale, ApiError } from "@/lib/api";

// فرمِ درخواستِ قیمتِ عمده — دقیقاً همان فیلدهای نسخهٔ Express
// (frontend/wholesale.html) و همان قواعدِ اعتبارسنجیِ
// backend/routes/wholesale.js. سمتِ سرور خودش رقم‌های فارسی را به لاتین
// تبدیل می‌کند، پس اینجا شمارهٔ خام فرستاده می‌شود.

const inputStyle = {
  background: "var(--color-surface-2)",
  color: "var(--color-ink)",
  border: "1.5px solid var(--color-line-control)",
} as const;

// رقم‌های فارسی/عربی → لاتین. سرور هم همین کار را می‌کند؛ اینجا فقط برای
// اینکه پیام خطا را قبل از رفت‌وبرگشت شبکه نشان بدهیم.
function latinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) =>
    String(
      "۰۱۲۳۴۵۶۷۸۹".indexOf(d) >= 0
        ? "۰۱۲۳۴۵۶۷۸۹".indexOf(d)
        : "٠١٢٣٤٥٦٧٨٩".indexOf(d),
    ),
  );
}

export function WholesaleForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const nm = name.trim();
    if (nm.length < 2) {
      setError("نام و نام خانوادگی را کامل بنویسید");
      return;
    }
    // قاعدهٔ نهایی روی سرور است (V.phone در backend/lib/middleware.js)؛
    // این فقط جلوی یک رفت‌وبرگشتِ بی‌فایده را می‌گیرد.
    const digits = latinDigits(phone).replace(/\D/g, "");
    if (digits.length < 10) {
      setError("شماره موبایل معتبر نیست");
      return;
    }

    const qty = Number(latinDigits(quantity).replace(/\D/g, ""));

    setLoading(true);
    try {
      const res = await requestWholesale({
        name: nm,
        phone: phone.trim(),
        productTitle: productTitle.trim() || undefined,
        quantity: qty > 0 ? qty : undefined,
        note: note.trim() || undefined,
      });
      setDone(res.message || "درخواست شما ثبت شد؛ به‌زودی با شما تماس می‌گیریم");
      setName("");
      setPhone("");
      setProductTitle("");
      setQuantity("");
      setNote("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "ارسال درخواست ناموفق بود؛ چند لحظه بعد دوباره تلاش کنید",
      );
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: "var(--color-surface)", boxShadow: "var(--shadow)" }}
      >
        <div
          className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--color-teal-tint)" }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-teal)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 className="text-base font-extrabold text-ink mb-1">
          درخواست ثبت شد
        </h2>
        <p className="text-sm text-ink-soft mb-4">{done}</p>
        <button
          type="button"
          onClick={() => setDone("")}
          className="rounded-full px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: "var(--color-teal-tint)",
            color: "var(--color-teal)",
          }}
        >
          ثبت درخواست دیگر
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl p-6"
      style={{ background: "var(--color-surface)", boxShadow: "var(--shadow)" }}
    >
      <h2 className="text-base font-extrabold text-ink mb-1">
        درخواست قیمت عمده
      </h2>
      <p className="text-xs text-ink-soft mb-5">
        در چند ثانیه درخواست بدهید؛ بقیه‌اش با ما.
      </p>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl px-3 py-2.5 text-xs mb-4"
          style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="wsName"
            className="block text-xs font-medium mb-1.5 text-ink-soft"
          >
            نام و نام خانوادگی <span style={{ color: "var(--color-coral)" }}>*</span>
          </label>
          <input
            id="wsName"
            name="name"
            type="text"
            maxLength={80}
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="wsPhone"
            className="block text-xs font-medium mb-1.5 text-ink-soft"
          >
            شماره موبایل <span style={{ color: "var(--color-coral)" }}>*</span>
          </label>
          <input
            id="wsPhone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            dir="ltr"
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="wsProduct"
            className="block text-xs font-medium mb-1.5 text-ink-soft"
          >
            نام کالا(ها)
          </label>
          <input
            id="wsProduct"
            name="productTitle"
            type="text"
            maxLength={120}
            placeholder="مثلاً: سطل شیاردار ۳ لیتر، تشت و لگن"
            value={productTitle}
            onChange={(e) => setProductTitle(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="wsQty"
            className="block text-xs font-medium mb-1.5 text-ink-soft"
          >
            تعداد تقریبی
          </label>
          <input
            id="wsQty"
            name="quantity"
            type="number"
            min={1}
            inputMode="numeric"
            dir="ltr"
            placeholder="مثلاً ۱۰۰"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="wsNote"
            className="block text-xs font-medium mb-1.5 text-ink-soft"
          >
            توضیح (اختیاری)
          </label>
          <textarea
            id="wsNote"
            name="note"
            rows={3}
            maxLength={500}
            placeholder="رنگ، سایز، زمان تحویل و هر نکته‌ای که به کارمان می‌آید"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all resize-y"
            style={inputStyle}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full py-3 text-sm font-bold transition-opacity disabled:opacity-60"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          {loading ? "در حال ارسال..." : "ثبت درخواست"}
        </button>

        <p className="text-[11px] leading-5 text-ink-dim">
          با ثبت درخواست، شماره‌ی شما فقط برای تماس درباره‌ی همین درخواست
          استفاده می‌شود.
        </p>
      </div>
    </form>
  );
}
