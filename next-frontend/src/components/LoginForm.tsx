"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getChallenge,
  requestOtp,
  verifyOtp,
  verifyTotp,
  passwordLogin,
  saveProfile,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { safeRedirectPath } from "@/lib/redirect";
import { hardNavigate } from "@/lib/navigation";
import { applyOtpText } from "@/lib/otpInput";

/**
 * `totp` مرحلهٔ چهارم در ظاهر نیست، ولی در عمل یک پلهٔ *منطقی* جدا است:
 * فقط برای شماره‌هایی پیش می‌آید که کلیدِ عاملِ دوم دارند (مدیرِ فروشگاه)،
 * و تا وقتی کدش نرسد سرور هیچ نشستی نمی‌سازد. جدا نگه داشتنش به این معنی
 * است که «کدِ پیامکیِ اشتباه» و «کدِ برنامهٔ اشتباه» دو پیامِ متفاوت
 * می‌گیرند و کاربر نمی‌ماند که کدام را دوباره بگیرد.
 */
type Step = "phone" | "otp" | "password" | "totp" | "recovery-done" | "name";

/**
 * شکلِ کدِ پشتیبان، دقیقاً همان چیزی که سرور قبول می‌کند:
 * ۱۲ نویسهٔ Base32 (خط تیره و فاصله‌اش شکلِ نمایش است، نه بخشی از کد).
 *
 * چرا سمتِ کلاینت هم سنجیده میشود: فرستادنِ یک رشتهٔ نیم‌کاره فقط یک
 * درخواستِ محکوم است و از سقفِ نرخ کم می‌کند؛ ولی *تنها* سنجشِ کلاینتی هم
 * نه — پیامِ دقیقِ حالات (مصرف‌شده، ناشناخته، تنظیم‌نشده) از سرور می‌آید.
 */
const RECOVERY_CODE_RE = /^[A-Z2-7]{12}$/;
const normalizeRecovery = (raw: string) => raw.replace(/[\s-_.]/g, "").toUpperCase();

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
 * عمرِ پشتیبانِ کد (دو دقیقه) — وقتی سرور عددی ندهد.
 *
 * چرا جدا از `FALLBACK_RESEND_SECONDS`: این دو **یک چیز نیستند**. کد دو دقیقه
 * زنده است و مهلتِ ارسال مجدد سی ثانیه؛ اگر عمرِ کد از مهلتِ ارسال مجدد ساخته
 * شود، هشدارِ «کد منقضی شده» در ثانیه‌ی ۳۱ ظاهر می‌شود در حالی که کد هنوز
 * نیمه‌ی عمرش را دارد — مشتری کدِ سالم را دور می‌ریزد و پیامکِ تازه می‌خواهد.
 * همتای `const ttl = Number(res.expiresIn) || 120;` در
 * `frontend/js/login.js` و نگهبانش `tests/otp-resend-window.js`.
 */
export const FALLBACK_CODE_TTL_SECONDS = 120;

/**
 * عمرِ واقعیِ کد از پاسخِ سرور (`expiresIn`، به ثانیه) یا `null`.
 *
 * `null` یعنی «سرور نگفت» — و پاسخِ درست آن هم «هیچ هشداری نشان نده» است،
 * نه اینکه از مهلتِ ارسال مجدد یک عددِ ساختگی بسازیم. `0` هم عددی معنادار است:
 * «کد همین حالا منقضی شده».
 */
function serverCodeSeconds(res: { expiresIn?: number }): number | null {
  const seconds = Number(res?.expiresIn);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  return null;
}

/**
 * عمرِ کد از یک خطاى ۴۲۹.
 *
 * `codeValid === false` یعنی سرور خودش گفته کد مرده — حتماً `0`، حتی اگر
 * `expiresIn` نرسیده باشد. وگرنه همان عددِ سرور، و اگر هیچ‌کدام نبود `null`
 * («نگفت») تا عددِ پشتیبان جایش را بگیرد.
 */
function codeSecondsFromError(err: unknown): number | null {
  if (!(err instanceof ApiError)) return null;
  if (err.codeValid === false) return 0;
  return serverCodeSeconds(err);
}

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
  const queryClient = useQueryClient();
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
  // عمرِ *خودِ کد* — جدا از مهلتِ ارسال مجدد. هشدارِ «کد منقضی شده» فقط از
  // این عدد ساخته می‌شود، نه از پنجره‌ی ارسال مجدد.
  const [codeUntil, setCodeUntil] = useState(0);
  const [codeExpired, setCodeExpired] = useState(false);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  // کدِ عاملِ دوم ۶ رقمی است (نه ۵)، پس حالتِ جداگانه لازم دارد.
  const [totpDigits, setTotpDigits] = useState(["", "", "", "", "", ""]);
  const [totpError, setTotpError] = useState("");
  // کدِ پشتیبان: ورودیِ جدا چون *شکلش* جداست (۱۲ نویسهٔ حرف/رقم، نه ۶ رقم).
  // تلاش برای جا دادنش در شش خانهٔ رقمی یعنی کاربری که گوشی‌اش را گم کرده
  // نمی‌تواند هیچ‌وقت وارد شود — یعنی کلِ خاصیت بی‌اثر می‌ماند.
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  // بعد از ورودِ موفّق با کدِ پشتیبان، قبل از رفتن به پنل یک قدم می‌ایستیم.
  // چرا: عددِ کدهای باقی‌مانده باید به مدیر گفته شود. "ورود موفق" در این
  // حالت خبرِ خوبِ کاملی نیست — گوشی در دست نبوده و کاغذِ کدها هم دارد
  // ته می‌کشد؛ اگر بی‌صدا به پنل برود، خطر را بعد از آخرین کد می‌فهمد.
  const [recoveryDone, setRecoveryDone] = useState<{ message: string; remaining: number } | null>(null);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const totpRefs = useRef<(HTMLInputElement | null)[]>([]);
  // تایمرِ «فوکوسِ اولین باکس» وقتی خطِ کد تازه باز می‌شود — نگه می‌داریم تا
  // اگر کاربر پیش از شلیکش شروع به تایپ/چسباندن کرد، خنثی شود (پایین‌تر).
  const otpFocusTimer = useRef<number | null>(null);
  const totpFocusTimer = useRef<number | null>(null);

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
    // هدر در چیدمانِ ریشه نشسته و کوئریِ `auth` را با دادهٔ مهمان کش کرده است.
    // بدونِ این، بعد از ورودِ موفق همان «ورود» تا رفرش می‌ماند، چون داده هنوز
    // «تازه» است و `refetchOnMount` کاری نمی‌کند.
    queryClient.invalidateQueries({ queryKey: ["auth"] });
    router.push(redirect);
    navFallback.current = setTimeout(() => hardNavigate(redirect), NAV_FALLBACK_MS);
  }, [router, redirect, queryClient]);

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

  //
  // `codeSeconds` عمرِ خودِ کد است و **جدا** ذخیره می‌شود: مهلتِ ارسال مجدد
  // (۳۰ ثانیه) و عمرِ کد (۱۲۰ ثانیه) دو عددند و قاطی‌کردنشان یعنی هشدارِ انقضا
  // سرِ ۳۰ ثانیه ظاهر شود. `null` = «سرور نگفت».
  function startCooldown(seconds: number, codeSeconds: number | null = null) {
    const codeLeft = codeSeconds === null ? FALLBACK_CODE_TTL_SECONDS : codeSeconds;
    const until = Date.now() + seconds * 1000;
    const codeUntilAbs = Date.now() + codeLeft * 1000;
    try {
      localStorage.setItem(RESEND_KEY, JSON.stringify({ phone, until, codeUntil: codeUntilAbs }));
    } catch {
      // حالت ناشناس — شمارش فقط در حافظه می‌ماند
    }
    setCooldownUntil(until);
    setCooldown(seconds);
    setCodeUntil(codeUntilAbs);
    setCodeExpired(codeUntilAbs > 0 && Date.now() >= codeUntilAbs);
  }

  function clearCooldown() {
    try {
      localStorage.removeItem(RESEND_KEY);
    } catch {
      // بی‌اهمیت
    }
    setCodeUntil(0);
    setCodeExpired(false);
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
      // عمرِ کد مستقل از مهلتِ ارسال مجدد زنده می‌ماند: ممکن است پنجره‌ی ارسال
      // مجدد تمام شده باشد ولی خودِ کد چند دقیقه‌ی دیگر معتبر باشد (و برعکس).
      // پس هر دو بازگردانی می‌شوند — وگرنه بعد از رفرش، هشدارِ انقضا محو می‌شود.
      const storedCodeUntil = Number(stored?.codeUntil) || 0;
      if (!stored?.phone || !Number.isFinite(remain) || remain <= 0) {
        // «ارسال مجدد» تمام شده، ولی کد هنوز می‌تواند زنده باشد: کاربر را به
        // همان مرحله‌ی کد برمی‌گردانیم، بدونِ شمارشِ قفل.
        if (stored?.phone && storedCodeUntil > Date.now()) {
          setPhone(stored.phone);
          setCodeUntil(storedCodeUntil);
          setStep("otp");
        }
        return;
      }
      setPhone(stored.phone);
      setCooldownUntil(until);
      setCooldown(remain);
      setCodeUntil(storedCodeUntil);
      setCodeExpired(storedCodeUntil > 0 && Date.now() >= storedCodeUntil);
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
  //
  // و همان تیک، هشدارِ انقضایِ *کد* را هم می‌چرخاند — چون این دو **یک عدد
  // نیستند**: مهلتِ ارسال مجدد ۳۰ ثانیه است و عمرِ کد ۱۲۰ ثانیه. اگر هشدارِ
  // انقضا از مهلتِ ارسال مجدد ساخته شود (کاری که تا امروز می‌شد)، سرِ ثانیه‌ی
  // ۳۱ به مشتری گفته می‌شود کدش مرده، در حالی که کد نیمه‌ی عمرش را دارد.
  //
  // چرا یک تایمر و نه دو تا: نگهبانِ همین فایل (`LoginForm.test.tsx`) بعد از
  // تمامِ‌شدنِ پنجره‌ها `getTimerCount() === 0` می‌خواهد — «هیچ تیکِ
  // سرگردانی جا نمی‌ماند». یک اینتروال که *هر دو* مهلت را می‌پاید و با
  // تمامِ‌شدنِ دومی خودش را می‌بندد، هم همان انتظار را برمی‌آورد و هم تیکِ
  // اضافه ندارد.
  useEffect(() => {
    if (cooldownUntil <= 0 && codeUntil <= 0) return;
    const tick = () => {
      const nowMs = Date.now();
      if (cooldownUntil > 0) {
        const left = Math.max(0, Math.ceil((cooldownUntil - nowMs) / 1000));
        setCooldown(left);
        // با تمامِ‌شدنِ مهلت، خودِ همین مقدار وابستگیِ effect را عوض می‌کند
        // و تایمر پاک می‌شود — وگرنه تا ابد هر ثانیه یک تیکِ بی‌فایده می‌خورد.
        if (left <= 0) setCooldownUntil(0);
      }
      // عمرِ کد هم با همان مهلتِ *مطلق* سنجیده می‌شود، پس خوابِ تب یا رفرش
      // هیچ عددی را عقب نمی‌اندازد: لحظه‌ی بعدی خودش را با ساعتِ واقعی هم‌گام
      // می‌کند. بعد از انقضا، مهلت صفر می‌شود تا تیک بسته شود؛ خودِ هشدار می‌ماند.
      if (codeUntil > 0 && nowMs >= codeUntil) {
        setCodeExpired(true);
        setCodeUntil(0);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [cooldownUntil, codeUntil]);

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
      // مهلت از خودِ سرور، نه ۳۰ ثانیه‌ی حدسی — و عمرِ کد جدا از آن
      startCooldown(serverResendSeconds(res), serverCodeSeconds(res));
      // فوکوس اولین باکس (خنثی‌شدنی — بالای `applyOtpFill` توضیح داده شده)
      otpFocusTimer.current = window.setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      // ۴۲۹ یعنی کدِ قبلی هنوز معتبر است و سرور مهلتِ باقی‌مانده را هم گفته؛
      // عیناً همان کاری که فروشگاهِ Express می‌کند: به همان مرحله‌ی کد می‌رویم
      // و شمارش را با عددِ *سرور* کوک می‌کنیم. با ۳۰ ثانیه‌ی تازه، عددِ
      // روی صفحه با عددی که سرور اعمال می‌کند یکی نبود.
      const wait = err instanceof ApiError ? Number(err.retryAfter) : NaN;
      if (Number.isFinite(wait) && wait > 0) {
        setStep("otp");
        setOtpDigits(["", "", "", "", ""]);
        // عمرِ کد از `expiresIn` می‌آید، نه از `wait` (و اگر سرور گفته باشد
        // کد مرده است، همان لحظه هشدار داده می‌شود).
        startCooldown(wait, codeSecondsFromError(err));
        setOtpError("کد قبلی هنوز معتبر است؛ همان را وارد کنید");
        otpFocusTimer.current = window.setTimeout(() => otpRefs.current[0]?.focus(), 100);
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
      startCooldown(serverResendSeconds(res), serverCodeSeconds(res));
      setOtpError("");
    } catch (err) {
      // ۴۲۹ = کدِ قبلی هنوز معتبر است. پیامِ سرور همین را می‌گوید و مهلتِ
      // واقعیِ باقی‌مانده را هم می‌آورد؛ پس شمارش با «عددِ سرور» کوک می‌شود —
      // همتای `login.js` که همان `retryAfter` را می‌خواند. اگر سرور مهلتِ
      // کوتاه‌تری داده باشد، همین‌جا کوتاه می‌شویم و دکمه سرِ وقتِ سرور باز
      // می‌شود، نه دیرتر.
      const wait = err instanceof ApiError ? Number(err.retryAfter) : NaN;
      if (Number.isFinite(wait) && wait > 0) {
        // همین‌جا هم عمرِ کد جدا رد می‌شود: این دکمه بیشترین احتمال را دارد که
        // سرِ ۳۰ ثانیه زده شود، یعنی وقتی کد هنوز زنده است.
        startCooldown(wait, codeSecondsFromError(err));
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
  //
  // ورودیِ چندرقمی از سه مسیر می‌آید و هر سه باید یکی رفتار کنند:
  //   • paste با Ctrl+V یا Cmd+V (رویدادِ onPaste هر دو را می‌گیرد)
  //   • paste از منوی راست‌کلیک و نگه‌داشتن روی موبایل
  //   • autofillِ کدِ پیامکی (iOS/اندروید کلِ کد را یک‌جا در onChange می‌ریزد)
  // برای همین منطقِ توزیع در lib/otpInput.ts نشسته و هر دو مسیر به آن می‌دهند.
  // نسخهٔ قبلی فقط `e.key === "v" && e.ctrlKey` را می‌شناخت؛ Cmd+V روی مک و
  // autofill هیچ کاری نمی‌کردند.
  //
  // ⚠️ یک مسابقهٔ واقعی که آزمونِ مرورگر گرفت: خطِ کد که باز می‌شود، یک تایمرِ
  // ۱۰۰ میلی‌ثانیه‌ای فوکوس را به باکسِ اول می‌برد. کاربری که کد را از پیامک
  // کپی کرده، ممکن است در همان ۱۰۰ میلی‌ثانیه چهار رقم را بچسباند؛ تایمرِ
  // کهنه بعد از paste شلیک می‌کند، فوکوس را از باکسِ پنجم به باکسِ اول پرت
  // می‌کند و رقمِ آخر جای اشتباه می‌نشیند (فرم هم هیچ‌وقت نمی‌فرستد). پس
  // شروعِ پرکردن = پایانِ عمرِ تایمر.
  const cancelOtpFocus = () => {
    if (otpFocusTimer.current !== null) {
      window.clearTimeout(otpFocusTimer.current);
      otpFocusTimer.current = null;
    }
  };

  const applyOtpFill = (index: number, text: string) => {
    cancelOtpFocus();
    const fill = applyOtpText(otpDigits, index, text);
    if (!fill) return false;
    setOtpDigits(fill.digits);
    if (fill.code) {
      submitOtp(phone.trim(), fill.code);
    } else {
      otpRefs.current[fill.focus]?.focus();
    }
    return true;
  };

  const handleOtpInput = (index: number, value: string) => {
    applyOtpFill(index, value);
  };

  const handleOtpPaste = (index: number, e: React.ClipboardEvent) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (applyOtpFill(index, text)) e.preventDefault();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const submitOtp = async (ph: string, code: string) => {
    setLoading(true);
    setOtpError("");
    try {
      const res = await verifyOtp(ph, code);
      // ورود موفق → مهلتِ ذخیره‌شده دیگر معنی ندارد
      clearCooldown();
      // عاملِ دوم: ورود *تمام نشده*. اینجا مهلتِ بازفرست هم پاک می‌شود چون
      // کدِ پیامکی مصرف شده؛ و اگر تا پنج دقیقه کدِ برنامه نرسد، سرور
      // حالتِ نیمه‌باز را می‌بندد و کاربر باید از شماره شروع کند.
      if (res.mfaRequired) {
        setStep("totp");
        setLoading(false);
        totpFocusTimer.current = window.setTimeout(() => totpRefs.current[0]?.focus(), 100);
        return;
      }
      /* مرحلهٔ «نام» فقط برای مشتریِ تازه باز می‌شود.

         نامِ مشتری **فقط زیرِ `user`** می‌آید — همان شکلی که `publicUser` در
         `backend/routes/auth.js` می‌سازد و اوراکلِ Express هم از همان می‌خواند
         (`if (!user.fullName)` در `login.js`).

         این‌جا پیش از این فیلدِ سطحِ بالای پاسخ خوانده می‌شد، که سرور هرگز
         نمی‌فرستدش؛ پس شرط برای *هر* ورودِ موفق درست از آب درمی‌آمد و مشتریِ
         همیشگی — با اینکه نامش سال‌هاست ثبت شده — دوباره نامش پرسیده می‌شد.
         نگهبانش: `lib/apiContract.test.ts` (شکلِ سیم ↔ تایپ ↔ اوراکل). */
      if (!res.user?.fullName?.trim()) {
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

  // ========== مرحله ۲.۵: کدِ برنامهٔ Authenticator (عاملِ دوم) ==========
  const submitTotp = async (code: string) => {
    setLoading(true);
    setTotpError("");
    try {
      const res = await verifyTotp(code);
      /* ---------- کدِ پشتیبان، مسیرِ خودش ----------
         سرور خودش از قالبِ ورودی می‌فهمد کدام عامل است و در پاسخ می‌گوید
         (`method`). این‌جا وقتی آن کد بوده، یک قدم قبل از پنل می‌ایستیم تا
         «چند تا مانده» گفته شود — همان چیزی که سرور حساب کرده و در
         `recoveryMessage` فرستاده. */
      if (res.method === "recovery") {
        setRecoveryDone({
          message: res.recoveryMessage || "",
          remaining: res.recoveryRemaining ?? 0,
        });
        setRecoveryCode("");
        setStep("recovery-done");
        setLoading(false);
        return;
      }
      // مثلِ مرحلهٔ رمز: تا وقتی ناوبری تعیینِ‌تکلیف نشده، دکمه در حالتِ
      // انتظار می‌ماند — اما اینجا خودِ ناوبری رخ می‌دهد، پس چیزی برنمی‌گردانیم.
      goToRedirect();
    } catch (err) {
      setTotpError(err instanceof ApiError ? err.message : "کدِ برنامه اشتباه است");
      setTotpDigits(["", "", "", "", "", ""]);
      totpRefs.current[0]?.focus();
      setLoading(false);
    }
  };

  // ارسالِ کدِ پشتیبان — از همان مسیرِ کدِ اپ می‌رود (`submitTotp`) چون سرور
  // خودش تفکیک می‌کند؛ ولی پیش از فرستادن، شکلِ کد سنجیده می‌شود تا یک
  // درخواستِ محکوم سهمیهٔ سقفِ نرخ را نخورد.
  const submitRecovery = () => {
    const normalized = normalizeRecovery(recoveryCode);
    if (!RECOVERY_CODE_RE.test(normalized)) {
      setTotpError("کدِ پشتیبان ۱۲ نویسه است و شکلِ XXXX-XXXX-XXXX دارد");
      return;
    }
    submitTotp(normalized);
  };

  // رنگِ کادرِ ورودی از همین می‌آید: «شکلش درست است» را کاربر همان‌جا ببیند،
  // نه با یک رفت‌وبرگشت به سرور و پیامِ خطا.
  const recoveryReady = RECOVERY_CODE_RE.test(normalizeRecovery(recoveryCode));

  // چسباندنِ کدِ برنامه از onPaste می‌آید، نه از sniffکردنِ Ctrl+V — چون کاربر
  // این کد را از اپِ Authenticator کپی می‌کند (یا سیستم autofill می‌ریزد) و
  // تایپِ ۶ رقم در ۳۰ ثانیه واقعاً تنگ است. منطقِ توزیع همان ماژولِ مشترک است.
  const cancelTotpFocus = () => {
    if (totpFocusTimer.current !== null) {
      window.clearTimeout(totpFocusTimer.current);
      totpFocusTimer.current = null;
    }
  };

  const applyTotpFill = (index: number, text: string) => {
    cancelTotpFocus();
    const fill = applyOtpText(totpDigits, index, text);
    if (!fill) return false;
    setTotpDigits(fill.digits);
    if (fill.code) {
      submitTotp(fill.code);
    } else {
      totpRefs.current[fill.focus]?.focus();
    }
    return true;
  };

  const handleTotpInput = (index: number, value: string) => {
    applyTotpFill(index, value);
  };

  const handleTotpPaste = (index: number, e: React.ClipboardEvent) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (applyTotpFill(index, text)) e.preventDefault();
  };

  const handleTotpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !totpDigits[index] && index > 0) {
      totpRefs.current[index - 1]?.focus();
    }
  };

  // ========== مرحله ۳: رمز عبور ==========
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await passwordLogin(phone.trim(), password);
      // ورودِ رمزی هم می‌تواند نیمه‌کاره بماند — سدِ عاملِ دوم در «ایستگاهِ
      // ورود» است، نه چسبیده به یک مسیرِ خاص.
      if (res.mfaRequired) {
        setStep("totp");
        setLoading(false);
        totpFocusTimer.current = window.setTimeout(() => totpRefs.current[0]?.focus(), 100);
        return;
      }
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
            (s.num === 2 &&
              (step === "otp" || step === "password" || step === "totp" || step === "recovery-done")) ||
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
                onPaste={(e) => handleOtpPaste(i, e)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="otp-box w-12 h-14 text-center text-xl font-bold rounded-xl outline-none transition-colors"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: `2px solid ${
                    d ? "var(--color-teal)" : "var(--color-line-control)"
                  }`,
                }}
                autoComplete="one-time-code"
                // همان `aria-describedby`ِ نسخهٔ Express: صفحه‌خوان باید وقتی
                // کد منقضی می‌شود، همان جمله را بخواند.
                aria-describedby="codeExpiry"
              />
            ))}
          </div>

          {otpError && (
            <p className="text-xs text-center mb-3" style={{ color: "var(--color-coral)" }}>
              {otpError}
            </p>
          )}

          {/*
            هشدارِ انقضایِ کد — همتای `<p id="codeExpiry">` در `login.html`ِ
            Express. تا امروز این عنصر در Next نبود و در نتیجه عمرِ کد هیچ‌جا
            نشان داده نمی‌شد؛ و آن‌جا هم که هشدار ساخته می‌شد، از مهلتِ ارسال
            مجدد ساخته می‌شد (۳۰ ثانیه) نه از عمرِ کد (۱۲۰ ثانیه).

            خالی می‌ماند تا وقتی کد واقعاً منقضی شود — «همیشه یک هشدار» یعنی
            هشداری که دیده نمی‌شود.
          */}
          <p
            id="codeExpiry"
            aria-live="polite"
            className="text-xs text-center mb-3"
            style={{ color: codeExpired ? "var(--color-gold)" : "transparent" }}
          >
            {codeExpired ? "کد منقضی شده — دوباره ارسال کنید" : "\u00a0"}
          </p>

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

      {/* === مرحله کدِ برنامهٔ Authenticator (عاملِ دوم) === */}
      {/* چرا این مرحله از `password` جداست: رمز عبور و کدِ برنامه دو چیزِ
          متفاوت‌اند — یکی «چیزی که می‌دانی» و دیگری «چیزی که داری» — و
          پیامِ خطایشان هم باید متفاوت باشد، وگرنه مدیر نمی‌فهمد کدام را
          باید عوض کند. */}
      {step === "totp" && (
        <div className="px-6 pb-8">
          <h2 className="text-lg font-bold text-center mb-1" style={{ color: "var(--color-ink)" }}>
            {recoveryMode ? "ورود با کد پشتیبان" : "کد تأیید دو مرحله‌ای"}
          </h2>
          <p className="text-xs text-center mb-6" style={{ color: "var(--color-ink-soft)" }}>
            {recoveryMode
              ? "یکی از کدهایی که روی کاغذ نوشته‌اید را وارد کنید"
              : "کد ۶ رقمی برنامهٔ Authenticator را وارد کنید"}
          </p>

          {!recoveryMode && (
          <div className="flex justify-center gap-1.5 mb-4" dir="ltr">
            {totpDigits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { totpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleTotpInput(i, e.target.value)}
                onPaste={(e) => handleTotpPaste(i, e)}
                onKeyDown={(e) => handleTotpKeyDown(i, e)}
                className="otp-box w-11 h-14 text-center text-xl font-bold rounded-xl outline-none transition-colors"
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
          )}

          {recoveryMode && (
            <div className="mb-2">
              <input
                type="text"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitRecovery(); }}
                placeholder="XXXX-XXXX-XXXX"
                className="w-full text-center rounded-xl py-3 px-4 text-lg font-bold outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: `2px solid ${
                    recoveryReady ? "var(--color-teal)" : "var(--color-line-control)"
                  }`,
                }}
                dir="ltr"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={submitRecovery}
                disabled={loading}
                className="w-full mt-3 rounded-full py-3 text-sm font-bold disabled:opacity-60"
                style={{ background: "var(--color-teal)", color: "var(--color-surface)" }}
              >
                تأیید کد پشتیبان
              </button>
              <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
                هر کد فقط یک بار کار می‌کند؛ کدهای مصرف‌شده را روی کاغذ خط بزنید.
                به خط تیره و بزرگی/کوچکیِ حرف‌ها حساس نیست.
              </p>
            </div>
          )}

          {totpError && (
            <p className="text-xs text-center mb-3" style={{ color: "var(--color-coral)" }}>
              {totpError}
            </p>
          )}

          {loading && (
            <div className="flex justify-center mb-3">
              <span className="inline-block w-5 h-5 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
            </div>
          )}

          {/* کلیدِ رفتن به مسیرِ کدِ پشتیبان. چرا برجسته نیست: مدیرِ روزِ
              عادیِ خودش صاحبِ گوشی است و این را نمی‌خواهد؛ ولی روزی که گوشی
              گم شود، همین یک دکمهٔ کم‌رنگ تنها راهِ برگشت است — پس باید
              همیشه این‌جا باشد، نه در یک راهنما/کمکِ جدا. */}
          {!recoveryMode ? (
            <button
              type="button"
              onClick={() => { setRecoveryMode(true); setTotpError(""); }}
              className="w-full text-center text-xs mt-1"
              style={{ color: "var(--color-ink-dim)" }}
            >
              گوشی‌ام در دسترس نیست — کد پشتیبان دارم
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setRecoveryMode(false); setRecoveryCode(""); setTotpError(""); }}
              className="w-full text-center text-xs mt-2"
              style={{ color: "var(--color-ink-dim)" }}
            >
              ← برگشت به کدِ برنامهٔ Authenticator
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setTotpDigits(["", "", "", "", "", ""]);
              setRecoveryCode("");
              setRecoveryMode(false);
              setTotpError("");
            }}
            className="w-full text-center text-xs mt-1"
            style={{ color: "var(--color-ink-dim)" }}
          >
            ← شروع دوباره از شماره
          </button>
        </div>
      )}

      {/* === پایانِ ورود با کدِ پشتیبان === */}
      {/* چرا یک قدمِ جدا: ورود با کدِ پشتیبان "موفق" است ولی خبرِ خوبِ کامل
          نیست — گوشی در دست نبوده و کاغذِ کدها هم دارد ته می‌کشد. اگر
          بی‌درنگ به پنل می‌رفتیم، تنها لحظه‌ای که می‌شد این را گفت از دست
          می‌رفت و مدیر روزِ آخرین کد می‌فهمید. */}
      {step === "recovery-done" && (
        <div className="px-6 pb-8">
          <h2 className="text-lg font-bold text-center mb-1" style={{ color: "var(--color-ink)" }}>
            با کد پشتیبان وارد شدید
          </h2>
          <p className="text-xs text-center mb-4" style={{ color: "var(--color-ink-soft)" }}>
            گوشی در دست نبود و کاغذِ کدها به کار آمد. ولی هر کد فقط یک بار کار
            می‌کند.
          </p>

          {recoveryDone?.message && (
            <p
              className="rounded-[14px] p-3 text-xs text-center leading-relaxed mb-4"
              role="status"
              style={
                recoveryDone.remaining > 0
                  ? { background: "var(--color-gold-tint)", color: "var(--color-gold)" }
                  : { background: "var(--color-coral-tint)", color: "var(--color-coral)" }
              }
            >
              {recoveryDone.message}
            </p>
          )}

          <p className="text-[11px] leading-relaxed mb-4" style={{ color: "var(--color-ink-soft)" }}>
            همین امروز کدهای تازه بسازید (روی دستگاهِ خودتان):{" "}
            <code dir="ltr">node tools/admin-recovery.js 0912…</code> — خطِ
            هش‌ها را در <code dir="ltr">ADMIN_RECOVERY_CODES</code> بگذارید و
            خودِ کدها را روی کاغذ بنویسید. از این پس ورود با گوشیِ
            جدید هم کار می‌کند و کدهای تازه جای قدیمی‌ها را می‌گیرند.
          </p>

          <button
            type="button"
            onClick={goToRedirect}
            className="w-full rounded-full py-3 text-sm font-bold"
            style={{ background: "var(--color-teal)", color: "var(--color-surface)" }}
          >
            ورود به پنل
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