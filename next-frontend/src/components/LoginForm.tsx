"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getChallenge,
  requestOtp,
  verifyOtp,
  passwordLogin,
  hasPassword,
  saveProfile,
} from "@/lib/api";
import { ApiError } from "@/lib/api";

type Step = "phone" | "otp" | "password" | "name";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasPass, setHasPass] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // شمارش معکوس cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // ========== مرحله ۱: شماره موبایل ==========
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = phone.trim();
    if (!trimmed || trimmed.length < 10) {
      setError("شماره موبایل معتبر نیست");
      return;
    }

    setLoading(true);
    try {
      // چک کن رمز داره یا نه
      try {
        const hp = await hasPassword(trimmed);
        setHasPass(hp.hasPassword);
      } catch {
        setHasPass(false);
      }

      // دریافت چالش
      const ch = await getChallenge();
      setChallenge(ch.token);

      // درخواست کد
      await requestOtp(trimmed, ch.token);
      setStep("otp");
      setOtpDigits(["", "", "", "", ""]);
      setOtpError("");
      setCooldown(30);
      // فوکوس اولین باکس
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ارسال کد");
    } finally {
      setLoading(false);
    }
  };

  // بازفرستادن کد
  const handleResend = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const ch = await getChallenge();
      setChallenge(ch.token);
      await requestOtp(phone.trim(), ch.token);
      setCooldown(30);
      setOtpError("");
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "خطا");
    } finally {
      setLoading(false);
    }
  };

  // ========== مرحله ۲: کد OTP ==========
  const handleOtpInput = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const next = [...otpDigits];
    next[index] = value;
    setOtpDigits(next);

    // حرکت به باکس بعدی
    if (value && index < 4) {
      otpRefs.current[index + 1]?.focus();
    }

    // اگر ۵ رقم کامل شد auto-submit
    const code = next.join("");
    if (code.length === 5 && next.every((d) => d !== "")) {
      submitOtp(phone.trim(), code);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    // چسباندن
    if (e.key === "v" && e.ctrlKey) {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, 5).split("");
        const next = [...otpDigits];
        digits.forEach((d, i) => {
          if (i < 5) next[i] = d;
        });
        setOtpDigits(next);
        if (digits.length === 5 && next.every((d) => d !== "")) {
          submitOtp(phone.trim(), next.join(""));
        }
      });
    }
  };

  const submitOtp = async (ph: string, code: string) => {
    setLoading(true);
    setOtpError("");
    try {
      const res = await verifyOtp(ph, code);
      if (res.isNew || !res.fullName) {
        setStep("name");
      } else {
        router.push(redirect);
      }
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "کد اشتباه است");
      setOtpDigits(["", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ========== مرحله ۳: رمز عبور ==========
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await passwordLogin(phone.trim(), password);
      router.push(redirect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "رمز اشتباه است");
    } finally {
      setLoading(false);
    }
  };

  // ========== مرحله ۴: نام ==========
  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("نام را وارد کنید");
      return;
    }
    setLoading(true);
    try {
      await saveProfile(fullName.trim());
      router.push(redirect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="mx-auto max-w-[420px] rounded-[26px] overflow-hidden"
      style={{
        background: "var(--color-surface)",
        boxShadow: "var(--shadow)",
      }}
    >
      {/* برند */}
      <div className="text-center pt-8 pb-4">
        <span
          className="text-2xl font-extrabold"
          style={{ color: "var(--color-teal)" }}
        >
          پلاسکو گلی
        </span>
      </div>

      {/* مراحل */}
      <div className="flex items-center justify-center gap-2 px-6 pb-6">
        {[
          { label: "شماره", num: 1 },
          { label: "کد", num: 2 },
          { label: "نام", num: 3 },
        ].map((s, i) => {
          const active =
            (s.num === 1 && step === "phone") ||
            (s.num === 2 && (step === "otp" || step === "password")) ||
            (s.num === 3 && step === "name");
          const done =
            (s.num === 1 && step !== "phone") ||
            (s.num === 2 && step === "name") ||
            (s.num === 3 && false);

          return (
            <div key={s.num} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className="w-6 h-px"
                  style={{ background: "var(--color-line)" }}
                />
              )}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: active
                    ? "var(--color-teal)"
                    : done
                    ? "var(--color-teal-tint)"
                    : "var(--color-surface-2)",
                  color: active
                    ? "#04211B"
                    : done
                    ? "var(--color-teal)"
                    : "var(--color-ink-dim)",
                }}
              >
                {s.num}
              </div>
              <span
                className="text-[10px]"
                style={{ color: "var(--color-ink-dim)" }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* === مرحله شماره موبایل === */}
      {step === "phone" && (
        <form onSubmit={handlePhoneSubmit} className="px-6 pb-8">
          <h2 className="text-lg font-bold text-center mb-1" style={{ color: "var(--color-ink)" }}>
            ورود یا ثبت‌نام
          </h2>
          <p className="text-xs text-center mb-6" style={{ color: "var(--color-ink-soft)" }}>
            شماره موبایلتون رو وارد کنید تا کد ورود براتون ارسال بشه.
          </p>

          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--color-ink-soft)" }}
          >
            شماره موبایل
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            className="w-full rounded-full py-3 px-4 text-sm outline-none mb-4"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-ink)",
              border: "1.5px solid var(--color-line-control)",
            }}
            autoFocus
            dir="ltr"
          />

          {error && (
            <p className="text-xs mb-3" style={{ color: "var(--color-coral)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 rounded-full border-2 border-[#04211B]/30 border-t-[#04211B] animate-spin" />
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="14" height="8" rx="2" />
                  <path d="M6 11V7a4 4 0 118 0v4" />
                </svg>
                دریافت کد ورود
              </>
            )}
          </button>

          <p className="text-xs text-center mt-4" style={{ color: "var(--color-ink-soft)" }}>
            قبلاً رمز گذاشتید؟{" "}
            <button
              type="button"
              onClick={() => setStep("password")}
              className="font-medium underline"
              style={{ color: "var(--color-teal)" }}
            >
              ورود با رمز عبور
            </button>
          </p>
        </form>
      )}

      {/* === مرحله کد OTP === */}
      {step === "otp" && (
        <div className="px-6 pb-8">
          <h2 className="text-lg font-bold text-center mb-1" style={{ color: "var(--color-ink)" }}>
            کد ورود
          </h2>
          <p className="text-xs text-center mb-6" style={{ color: "var(--color-ink-soft)" }}>
            کد ۵ رقمی ارسال‌شده به {phone} را وارد کنید
          </p>

          {/* ۵ باکس */}
          <div className="flex justify-center gap-2 mb-4" dir="ltr">
            {otpDigits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleOtpInput(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-12 h-14 text-center text-xl font-bold rounded-xl outline-none transition-colors"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: `2px solid ${
                    d ? "var(--color-teal)" : "var(--color-line-control)"
                  }`,
                }}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          {otpError && (
            <p className="text-xs text-center mb-3" style={{ color: "var(--color-coral)" }}>
              {otpError}
            </p>
          )}

          {loading && (
            <div className="flex justify-center mb-3">
              <span className="inline-block w-5 h-5 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={cooldown > 0 || loading}
            className="w-full text-center text-xs transition-colors py-2"
            style={{
              color: cooldown > 0 ? "var(--color-ink-dim)" : "var(--color-teal)",
              cursor: cooldown > 0 ? "default" : "pointer",
            }}
          >
            {cooldown > 0
              ? `ارسال مجدد کد (${cooldown} ثانیه)`
              : "ارسال مجدد کد"}
          </button>

          <button
            type="button"
            onClick={() => setStep("phone")}
            className="w-full text-center text-xs mt-1"
            style={{ color: "var(--color-ink-dim)" }}
          >
            ← تغییر شماره
          </button>
        </div>
      )}

      {/* === مرحله رمز عبور === */}
      {step === "password" && (
        <form onSubmit={handlePasswordLogin} className="px-6 pb-8">
          <h2 className="text-lg font-bold text-center mb-1" style={{ color: "var(--color-ink)" }}>
            ورود با رمز عبور
          </h2>
          <p className="text-xs text-center mb-6" style={{ color: "var(--color-ink-soft)" }}>
            برای شماره {phone} رمز عبور را وارد کنید
          </p>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="رمز عبور"
            className="w-full rounded-full py-3 px-4 text-sm outline-none mb-4"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-ink)",
              border: "1.5px solid var(--color-line-control)",
            }}
            autoFocus
            dir="ltr"
          />

          {error && (
            <p className="text-xs mb-3" style={{ color: "var(--color-coral)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-full py-3 text-sm font-bold transition-colors"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "..." : "ورود"}
          </button>

          <button
            type="button"
            onClick={() => setStep("phone")}
            className="w-full text-center text-xs mt-4"
            style={{ color: "var(--color-ink-dim)" }}
          >
            ← بازگشت
          </button>
        </form>
      )}

      {/* === مرحله نام === */}
      {step === "name" && (
        <form onSubmit={handleNameSubmit} className="px-6 pb-8">
          <h2 className="text-lg font-bold text-center mb-1" style={{ color: "var(--color-ink)" }}>
            خوش آمدید!
          </h2>
          <p className="text-xs text-center mb-6" style={{ color: "var(--color-ink-soft)" }}>
            لطفاً نام خود را وارد کنید
          </p>

          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="نام و نام خانوادگی"
            className="w-full rounded-full py-3 px-4 text-sm outline-none mb-4"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-ink)",
              border: "1.5px solid var(--color-line-control)",
            }}
            autoFocus
          />

          {error && (
            <p className="text-xs mb-3" style={{ color: "var(--color-coral)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !fullName.trim()}
            className="w-full rounded-full py-3 text-sm font-bold transition-colors"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "..." : "ورود به فروشگاه"}
          </button>
        </form>
      )}

      {/* فوتر فرم */}
      <div className="px-6 pb-6">
        <p className="text-[11px] text-center" style={{ color: "var(--color-ink-dim)" }}>
          با ورود،{" "}
          <a href="/terms" className="underline" style={{ color: "var(--color-teal)" }}>
            قوانین و مقررات
          </a>{" "}
          فروشگاه را می‌پذیرید.
        </p>
      </div>
    </div>
  );
}