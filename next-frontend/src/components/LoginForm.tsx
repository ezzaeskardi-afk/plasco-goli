"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getChallenge,
  requestOtp,
  verifyOtp,
  passwordLogin,
  saveProfile,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { safeRedirectPath } from "@/lib/redirect";
import { hardNavigate } from "@/lib/navigation";

type Step = "phone" | "otp" | "password" | "name";

/**
 * مهلتِ ناوبریِ نرم بعد از ورود. دلیلِ وجودش در `goToRedirect` آمده.
 *
 * ۴ ثانیه: کوتاه‌تر از گاردِ اسکلتونِ `app/loading.tsx` (۶ ثانیه) چون در این
 * نقطه دقیقاً می‌دانیم که باید *فوراً* یک انتقال شروع شود — یا می‌شود یا نمی‌شود.
 */
export const NAV_FALLBACK_MS = 4000;

/**
 * مهلتِ ارسال مجدد وقتی سرور هیچ عددی نگوید، به ثانیه.
 *
 * عدد فقط یک *پشتیبان* است: مسیرِ اصلی همیشه `retryAfter`ِ سرور است. همتای
 * `FALLBACK_RESEND_SECONDS` در `frontend/js/login.js` — نگهبانِ
 * `tests/otp-resend-window.js` مساوی‌بودنِ همین دو عدد را می‌سنجد، چون اگر
 * یکی ۳۰ باشد و دیگری ۶۰، با *اولین* پاسخِ بدونِ عدد، دو فروشگاه دو چیزِ
 * متفاوت نشان می‌دهند.
 */
export const FALLBACK_RESEND_SECONDS = 30;

/**
 * مهلتِ واقعیِ ارسال مجدد از پاسخِ سرور (`retryAfter`، به ثانیه).
 *
 * چرا در یک تابع: عددِ مهلت قبلاً در دو نقطه `startCooldown(30)` نوشته شده بود
 * (هاردکد)، یعنی عددی که کاربر می‌شمرد و عددی که سرور اعمال می‌کرد از هم جدا
 * بودند. هر جا پنجره‌ای باز می‌شود، از همین یک راه می‌گذرد.
 */
function serverResendSeconds(res: { retryAfter?: number }): number {
  const seconds = Number(res?.retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  return FALLBACK_RESEND_SECONDS;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // مقصدِ بازگشت از خودِ آدرس می‌آید، پس هرگز نباید بدونِ بررسی استفاده شود:
  // `/login?redirect=https://evil.example` کاربر را بعد از ورودِ موفق به
  // دامنه‌ی مهاجم می‌برد. `safeRedirectPath` فقط مسیرِ هم‌مبدأ را رد می‌کند و
  // برای هر چیزِ دیگر `null` می‌دهد — آن‌وقت پیش‌فرضِ امن، صفحه‌ی اصلی است.
  // هر سه نقطه‌ی `router.push` پایین از همین یک مقدار می‌خوانند.
  const redirect = safeRedirectPath(searchParams.get("redirect")) ?? "/";

  // ============================================================
  // «نشستِ پنل بسته شد» — چرا اینجا
  // ============================================================
  // `panelIdleGuard` سمتِ Express نشستِ مدیر را پس از نیم‌ساعت بی‌کاری می‌بندد و
  // ۴۰۱ با `reason: 'idle'` می‌دهد. تا امروز پنلِ Next همان را مثلِ ۴۰۳ («دسترسی
  // نداری») نشان می‌داد: مدیر یک کادرِ قرمز می‌دید که می‌گفت حق ندارد، در حالی
  // که حق داشت و فقط نشستش بسته شده بود.
  //
  // حالا `adminFetcher` (lib/adminApi.ts) این حالت را می‌شناسد و با
  // `?idle=1&redirect=…` به همین صفحه می‌فرستد. پیام در همان لحظه دیده می‌شود،
  // بدونِ اینکه چیزی بترکد یا صفحه‌ی خطا نشان داده شود.
  const idleEnded = searchParams.get("idle") === "1";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [cooldown, setCooldown] = useState(0);
  // مهلت به‌صورت «لحظه‌ی پایان» هم نگه داشته می‌شود چون منبعِ حقیقتِ شمارش همین
  // است، نه عددی که هر ثانیه یکی کم می‌شود (پایین توضیح داده شده).
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ============================================================
  // رفتن به مقصدِ بازگشت — با سقفِ زمانی
  // ============================================================
  // `router.push` یک وعده‌ی نرم است: اگر درخواستِ صفحه‌ی مقصد هیچ‌وقت پاسخ
  // نگیرد، هیچ خطایی پرتاب نمی‌شود، هیچ promiseای رد نمی‌شود و این کامپوننت هم
  // unmount نمی‌شود — یعنی مشتری بعد از وارد شدن، روی همان فرم می‌ماند و
  // نمی‌فهمد چه شد. (یا بدتر: اگر انتقال شروع شود ولی معلّق بماند، به
  // اسکلتونِ بی‌زبانِ بارگذاری می‌رسد.)
  //
  // پس یک مهلت می‌گذاریم: اگر تا این مدت انتقال *شروع* نشده باشد — یعنی این
  // کامپوننت unmount نشده باشد — همان آدرس را با ناوبریِ کاملِ مرورگر باز
  // می‌کنیم. همان صفحه، ولی این بار با نوارِ پیشرفتِ خودِ مرورگر و بدونِ هیچ
  // حالتِ معلّقِ روتر. آدرسِ مقصد از `safeRedirectPath` عبور کرده و هم‌مبدأ است.
  const navFallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  // unmount یعنی انتقال شروع شده → تایمر باید برود. وگرنه وسطِ بارگذاریِ
  // صفحه‌ی مقصد یک بارگذاریِ کاملِ تازه اجرا می‌شود و کارِ انجام‌شده را از نو
  // از صفر می‌کند.
  useEffect(() => {
    return () => {
      if (navFallback.current) clearTimeout(navFallback.current);
    };
  }, []);

  const goToRedirect = useCallback(() => {
    if (navFallback.current) clearTimeout(navFallback.current);
    router.push(redirect);
    navFallback.current = setTimeout(() => hardNavigate(redirect), NAV_FALLBACK_MS);
  }, [router, redirect]);

  // شمارش معکوس cooldown — پایدار در برابر رفرش: **لحظه‌ی پایان به‌همراهِ
  // شماره** ذخیره می‌شود و موقعِ برگشت به همان مرحله‌ی کد بازمحاسبه می‌شود.
  // همتای `resendAt`/`pg_otp_state` در `frontend/js/login.js`.
  //
  // چرا شماره هم ذخیره می‌شود: بدونِ آن، بعد از رفرش معلوم نیست این مهلت مالِ
  // کدام شماره است. آن‌وقت تنها راهِ رسیدنِ کاربر به مرحله‌ی کد «فرستادنِ دوباره‌ی
  // کد» است — که خودش `startCooldown(30)` را صدا می‌زند و مهلتِ ذخیره‌شده را
  // بازنویسی می‌کند؛ یعنی عددِ ذخیره‌شده هیچ‌وقت به چشم نمی‌آمد و مکانیزمِ
  // «رفرش‌ناپذیر» عملاً مرده بود.
  const RESEND_KEY = "pg_otp_resend";

  function startCooldown(seconds: number) {
    const until = Date.now() + seconds * 1000;
    try {
      localStorage.setItem(RESEND_KEY, JSON.stringify({ phone, until }));
    } catch {
      // حالت ناشناس — شمارش فقط در حافظه می‌ماند
    }
    setCooldownUntil(until);
    setCooldown(seconds);
  }

  function clearCooldown() {
    try {
      localStorage.removeItem(RESEND_KEY);
    } catch {
      // بی‌اهمیت
    }
  }

  // بازگشت به مرحله‌ی کد بعد از رفرش — همان کاری که فروشگاهِ Express می‌کند:
  // کاربر به همان‌جایی برمی‌گردد که بود و شمارش از وسطِ راه ادامه پیدا می‌کند.
  // فقط یک‌بار در mount، چون این وضعیت کارِ بازدیدِ قبلی است و از داخلِ همین
  // صفحه عوض نمی‌شود.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RESEND_KEY) || "null");
      const until = Number(stored?.until);
      const remain = Math.ceil((until - Date.now()) / 1000);
      if (!stored?.phone || !Number.isFinite(remain) || remain <= 0) return;
      setPhone(stored.phone);
      setCooldownUntil(until);
      setCooldown(remain);
      setStep("otp");
    } catch {
      // بی‌اهمیت
    }
  }, []);

  // شمارش معکوس cooldown
  //
  // هر تیک از **مهلتِ مطلق** از نو حساب می‌شود، نه با کم‌کردنِ یک شمارنده.
  // فرقش جایی معلوم می‌شود که تایمر عقب بیفتد: تبِ مخفی، لپ‌تاپِ خواب‌رفته، یا
  // موبایلی که مرورگرش پس‌زمینه را منجمد می‌کند. با شمارنده‌ی کاهنده، یک دقیقه
  // خواب یعنی یک دقیقه عددِ عقب‌مانده — مشتری عددی می‌بیند که واقعیت ندارد و
  // دکمه دیرتر از سرور باز می‌شود (سرور همان کد را معتبر می‌داند، پس دکمه‌ی
  // قفل‌شده هیچ کاری هم نمی‌کند). با مهلتِ مطلق، تیکِ بعدی خودش را با ساعتِ
  // واقعی هم‌گام می‌کند.
  useEffect(() => {
    if (cooldownUntil <= 0) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldown(left);
      // با تمامِ‌شدنِ مهلت، خودِ همین مقدار وابستگیِ effect را عوض می‌کند
      // و تایمر پاک می‌شود — وگرنه تا ابد هر ثانیه یک تیکِ بی‌فایده می‌خورد.
      if (left <= 0) setCooldownUntil(0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

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
      // دریافت چالش
      const ch = await getChallenge();

      // درخواست کد
      const res = await requestOtp(trimmed, ch.token);
      setStep("otp");
      setOtpDigits(["", "", "", "", ""]);
      setOtpError("");
      // مهلت از خودِ سرور، نه ۳۰ ثانیه‌ی حدسی
      startCooldown(serverResendSeconds(res));
      // فوکوس اولین باکس
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      // ۴۲۹ یعنی کدِ قبلی هنوز معتبر است و سرور مهلتِ باقی‌مانده را هم گفته؛
      // عیناً همان کاری که فروشگاهِ Express می‌کند: به همان مرحله‌ی کد می‌رویم
      // و شمارش را با عددِ *سرور* کوک می‌کنیم. با ۳۰ ثانیه‌ی تازه، عددِ
      // روی صفحه با عددی که سرور اعمال می‌کند یکی نبود.
      const wait = err instanceof ApiError ? Number(err.retryAfter) : NaN;
      if (Number.isFinite(wait) && wait > 0) {
        setStep("otp");
        setOtpDigits(["", "", "", "", ""]);
        startCooldown(wait);
        setOtpError("کد قبلی هنوز معتبر است؛ همان را وارد کنید");
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      } else {
        setError(err instanceof ApiError ? err.message : "خطا در ارسال کد");
      }
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
      const res = await requestOtp(phone.trim(), ch.token);
      startCooldown(serverResendSeconds(res));
      setOtpError("");
    } catch (err) {
      // ۴۲۹ = کدِ قبلی هنوز معتبر است. پیامِ سرور همین را می‌گوید و مهلتِ
      // واقعیِ باقی‌مانده را هم می‌آورد؛ پس شمارش با «عددِ سرور» کوک می‌شود —
      // همتای `login.js` که همان `retryAfter` را می‌خواند. اگر سرور مهلتِ
      // کوتاه‌تری داده باشد، همین‌جا کوتاه می‌شویم و دکمه سرِ وقتِ سرور باز
      // می‌شود، نه دیرتر.
      const wait = err instanceof ApiError ? Number(err.retryAfter) : NaN;
      if (Number.isFinite(wait) && wait > 0) {
        startCooldown(wait);
      } else if (!(err instanceof ApiError && err.status === 429)) {
        // خطای واقعی (نه «هنوز معتبر است»): پنجره بسته نمی‌ماند، وگرنه مشتری
        // بی‌دلیل پشتِ دکمه‌ی قفل گیر می‌کند. کلیدِ درست پاک می‌شود؛ قبلاً
        // اینجا `pg_otp_resend_<شماره>` پاک می‌شد که هیچ‌وقت نوشته نمی‌شد و
        // مهلتِ کهنه بعد از رفرش دوباره برمی‌گشت.
        clearCooldown();
        setCooldownUntil(0);
        setCooldown(0);
      }
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
      // ورود موفق → مهلتِ ذخیره‌شده دیگر معنی ندارد
      clearCooldown();
      if (res.isNew || !res.fullName) {
        setStep("name");
        setLoading(false);
      } else {
        goToRedirect();
      }
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "کد اشتباه است");
      setOtpDigits(["", "", "", "", ""]);
      otpRefs.current[0]?.focus();
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
      // ⚠️ دکمه عمداً در حالتِ «در حال رفتن» می‌ماند و `setLoading(false)`
      // صدا زده نمی‌شود: فرمی که بعد از زدنِ دکمه به حالتِ عادی برگردد، در
      // همان لحظه‌ای که انتقال معلّق است، به کاربر می‌گوید «هیچ اتفاقی
      // نیفتاد» و او دوباره دکمه را می‌زند.
      goToRedirect();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "رمز اشتباه است");
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
      // مثلِ مرحله‌ی رمز: تا وقتی ناوبری تعیین‌تکلیف نشده، دکمه در حالتِ
      // انتظار می‌ماند.
      goToRedirect();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
      setLoading(false);
    }
  };

  return (
    // ظاهرِ کارت (`auth-card`) از globals.css می‌آید: همان حاشیه‌ی بالای فیروزه‌ای،
    // نوارِ درخشان، شعاعِ ۲۴ و ورودِ نرمِ نسخه‌ی Express. عمداً استایلِ درون‌خطی
    // نداریم تا این کارت با بقیه‌ی ظاهرِ صفحه‌ی ورود یک‌جا از CSS بیاید.
    <div className="auth-card mx-auto w-full">
      {/* برند — نشان + نام، عیناً ساختار `div.logo` نسخه‌ی Express؛ کارتِ ورود
          تنها جایی است که لوگو بالای فرم می‌نشیند. */}
      <div className="mb-6 flex items-center justify-center gap-3">
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- نشانِ ۴۸px که از rewrite مسیر /picture سرو می‌شود */}
          <img
            src="/picture/logo/aa0b989f259f92d1240eb20d51846643.jpg"
            alt="لوگوی پلاسکو گلی"
            width={48}
            height={48}
            decoding="async"
            className="h-12 w-12 object-cover"
          />
        </span>
        <span
          className="text-xl font-extrabold"
          style={{ color: "var(--color-teal)" }}
        >
          پلاسکو گلی
        </span>
      </div>

      {/* نشستِ پنل به‌خاطر بی‌کاری بسته شده — دقیقاً همان لحظه‌ای که مدیر باید
          بداند چرا از پنل بیرون افتاده. */}
      {idleEnded && (
        <p
          className="mx-6 mb-4 rounded-[16px] p-3 text-[11px] leading-relaxed"
          style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
          role="status"
        >
          به‌خاطر نیم‌ساعت بی‌کاری از پنل خارج شدید. دوباره وارد شوید تا به همان
          صفحه برگردید.
        </p>
      )}

      {/* مراحل */}
      <div className="flex items-center justify-center gap-2 px-6 pb-6">
        {/* شماره‌ی مرحله با رقمِ فارسی نوشته می‌شود: در نسخه‌ی Express هم
            `<i>۱</i>` بود. `num` عددی می‌ماند چون منطقِ فعال/گذشته با آن
            مقایسه می‌شود؛ `fa` فقط شکلِ نمایش است. */}
        {[
          { label: "شماره", num: 1, fa: "۱" },
          { label: "کد", num: 2, fa: "۲" },
          { label: "نام", num: 3, fa: "۳" },
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
                {s.fa}
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
            className="w-full rounded-full py-3 px-4 text-sm outline-none mb-1"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-ink)",
              border: "1.5px solid var(--color-line-control)",
            }}
            autoFocus
            dir="ltr"
          />

          {/* راهنمایِ اینپوت — در Express زیرِ همین کادر بود (`p.field-hint`).
              کارکردش این است که مشتری سرِ «۰۹۱۲… یا ‎۹۸۹۱۲…؟» شک نکند و
              بداند ارقام فارسی هم پذیرفته می‌شود. */}
          <p className="field-hint mb-4">
            ارقام فارسی و فرمت‌هایی مثل ‎+۹۸‎ هم پذیرفته می‌شود.
          </p>

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
            onClick={() => {
              clearCooldown();
              setStep("phone");
            }}
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

      {/*
        خطِ «قوانین و مقررات» عمداً از داخلِ کارت برداشته شد: در Express هر دو
        خطِ حقوقی بیرونِ کارت و در `AuthShell` می‌نشستند. حالا هر دو یک‌جا
        آن‌جاست تا دو نسخه‌ی موازی از یک متن نداشته باشیم.
      */}
    </div>
  );
}