"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminSettings, updateAdminSettings, getCoupons } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  Panel,
  Pill,
  Spinner,
  ErrorBox,
  ForbiddenBox,
  Btn,
  Input,
  faNum,
  toman,
} from "@/components/admin/AdminBits";
import type { AdminSettings, AdminSettingsInput } from "@/lib/adminTypes";
import { couponStateOf, COUPON_STATE_LABEL, localToday } from "@/lib/couponState";

// ============================================================
// تنظیمات فروشگاه
// ============================================================
// این نما یک فرمِ ساده نیست. سه چیز است که ارزشش را از «لیستِ فیلدها» جدا
// می‌کند، و هر سه از خودِ سرور می‌آید:
//
//  ۱. **سوئیچِ خاموشیِ فروشگاه بی‌صدا نمی‌ماند.** با `shop_open='0'` هر
//     `POST /api/orders` یک ۵۰۳ می‌گیرد (`routes/orders.js:37`). یعنی یک
//     کلیک اینجا ثبتِ سفارش را روی کلِ سایت می‌بندد. برای همین بستنِ فروشگاه
//     تأییدِ صریح می‌خواهد، مثل حذفِ کدِ تخفیف.
//
//  ۲. **کدِ روی بنر بررسی می‌شود.** بنرِ صفحه‌ی اصلی به مشتری تخفیف وعده
//     می‌دهد؛ اگر کدش منقضی یا خاموش باشد، وعده دروغ است و مشتری در سبد
//     می‌فهمد. کد همین‌جا با همان قاعده‌ی نمای «تخفیف‌ها»
//     (`lib/couponState.ts`) سنجیده می‌شود — یک قاعده، یک جا.
//
//  ۳. **پیش‌نمایشِ زنده‌ی قاعده‌ی ارسال.** `shipping_cost` و
//     `free_shipping_over` دو عددند که فقط با هم معنا دارند؛ جدا نشان دادنشان
//     یعنی مدیر باید خودش جمع بزند. اینجا همان جمله‌ای که مشتری می‌بیند
//     نوشته می‌شود، و اگر آستانه از خودِ هزینه‌ی ارسال کمتر باشد هشدار
//     داده می‌شود (چیزی که تقریباً همیشه یعنی یک صفر کم یا زیاد شده).

const FIELDS: (keyof AdminSettings)[] = [
  "shop_name",
  "shop_phone",
  "shop_address",
  "shipping_cost",
  "free_shipping_over",
  "low_stock_threshold",
  "shop_open",
  "announcement",
  "promo_text",
  "promo_code",
];

const FIELD_LABEL: Record<keyof AdminSettings, string> = {
  shop_name: "نام فروشگاه",
  shop_phone: "شماره تماس",
  shop_address: "آدرس",
  shipping_cost: "هزینه‌ی ارسال",
  free_shipping_over: "ارسال رایگان از مبلغ",
  low_stock_threshold: "آستانه‌ی هشدار موجودی",
  announcement: "پیام اطلاعیه",
  shop_open: "وضعیت فروشگاه",
  promo_text: "متن بنر جشنواره",
  promo_code: "کد تخفیف روی بنر",
};

/** ورودی‌های عددی سرور: اگر منفی/غیرعددی باشند ۴۰۰ می‌گیریم */
const NUMERIC: (keyof AdminSettings)[] = ["shipping_cost", "free_shipping_over", "low_stock_threshold"];

/**
 * همان کاری که فرمِ Express می‌کند: `String(Number(v) || 0)`.
 *
 * چرا سمتِ کلاینت نرمال می‌شود و نه فقط سمتِ سرور: `Number("")` صفر می‌شود و
 * سرور آن را معتبر می‌داند، ولی اگر رشته‌ی خالی عیناً برود، مقداری که ذخیره
 * می‌شود `""` است نه `"0"` — و بعداً `Number("")` در محاسبه‌ی ارسال همان صفر
 * می‌دهد ولی مقدارِ ذخیره‌شده با پیش‌فرض‌ها یکی نیست. یکدست کردن اینجا یعنی
 * هر چه در دیتابیس می‌نشیند دقیقاً چیزی است که در فرم دیده شده.
 */
function normalizeNumbers(form: AdminSettings): AdminSettings {
  const out = { ...form };
  for (const k of NUMERIC) out[k] = String(Number(out[k]) || 0);
  return out;
}

export function SettingsContent() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["adminSettings"],
    queryFn: getAdminSettings,
    retry: false,
    staleTime: 30_000,
  });

  // `loaded` = آخرین وضعیتِ ذخیره‌شده (مبنا)، `form` = چیزی که روی صفحه است.
  // جدا نگه داشتنشان تنها راهِ دانستنِ «چه چیزی عوض شده» است — و همان چیزی
  // است که اجازه می‌دهد فقط همان‌ها فرستاده شوند.
  const [loaded, setLoaded] = useState<AdminSettings | null>(null);
  const [form, setForm] = useState<AdminSettings | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [trimmed, setTrimmed] = useState<string[]>([]);

  const server = settingsQuery.data?.settings;
  useEffect(() => {
    if (server && !loaded) {
      setLoaded(server);
      setForm(server);
    }
  }, [server, loaded]);

  // ---------- تغییراتِ ذخیره‌نشده ----------
  const changed = useMemo(() => {
    if (!loaded || !form) return [] as (keyof AdminSettings)[];
    return FIELDS.filter((k) => form[k] !== loaded[k]);
  }, [loaded, form]);

  // بستنِ مرورگر یا رفرش با تغییراتِ ذخیره‌نشده. توجه: ناوبریِ *داخلیِ* Next
  // (کلیک روی تبِ دیگری در نوارِ پنل) این رویداد را صدا نمی‌زند — برای آن
  // باید مسیریاب را قفل کرد که ماشین‌آلاتِ بیشتری می‌خواهد. پس این یک تورِ
  // ایمنی برای «تب را بستم» است، و بادبانِ هشدارِ داخلِ صفحه برای بقیه.
  useEffect(() => {
    if (!changed.length) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed.length]);

  const saveMutation = useMutation({
    mutationFn: (patch: AdminSettingsInput) => updateAdminSettings(patch),
    onSuccess: (res, patch) => {
      const saved = res.settings;
      setLoaded(saved);
      setForm(saved);
      setConfirmClose(false);

      // سرور رشته‌های بلند را می‌بُرد (نام ۶۰، آدرس ۲۰۰، اطلاعیه ۳۰۰، متنِ بنر
      // ۱۲۰، کد ۳۰). اگر ببُرد و ما ساکت بمانیم، کاربر متنی دیده که ذخیره
      // نشده — پس مقادیرِ برگشتی با فرستاده‌شده مقایسه و گزارش می‌شوند.
      const cut = Object.keys(patch).filter((k) => {
        const key = k as keyof AdminSettings;
        return patch[key] !== undefined && String(patch[key]) !== String(saved[key]);
      });
      setTrimmed(cut.map((k) => FIELD_LABEL[k as keyof AdminSettings]));

      // هدر و بنرِ سایتِ همین مرورگر از یک کوئریِ مشترکِ `["shop"]` تغذیه
      // می‌شوند (`useShopInfo`) با `staleTime` پنج دقیقه. بدونِ باطل‌کردنِ آن،
      // مدیر فروشگاه را می‌بندد، پنل می‌گوید «بسته»، ولی نوارِ بالای همان
      // صفحه تا پنج دقیقه هنوز فروشگاه را باز نشان می‌دهد — یعنی دقیقاً حالتی
      // که باعث می‌شود مدیر دوباره وبگردی کند و نتواند بفهمد کدام درست است.
      queryClient.invalidateQueries({ queryKey: ["shop"] });

      toast("تنظیمات ذخیره شد", { tone: "success" });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.message : "ذخیره‌ی تنظیمات ممکن نشد";
      toast(msg, { tone: "error" });
    },
  });

  function save(withCloseConfirm = false) {
    if (!form || !loaded) return;
    const normalized = normalizeNumbers(form);

    if (normalized.shop_name.trim() === "") {
      // همان متنِ سرور، تا کاربر دو نسخه‌ی متفاوت از یک قاعده نبیند
      toast("نام فروشگاه خالی است", { tone: "error" });
      return;
    }

    // بستنِ فروشگاه: فقط وقتی از باز به بسته می‌رود تأیید می‌خواهد. بازکردن
    // دوباره هیچ ریسکی ندارد و نباید معطل بماند.
    const isClosing = loaded.shop_open === "1" && normalized.shop_open === "0";
    if (isClosing && !withCloseConfirm) {
      setConfirmClose(true);
      return;
    }

    const patch: AdminSettingsInput = {};
    for (const k of changed) patch[k] = normalized[k];
    // اگر فقط نرمال‌سازی چیزی را عوض کرده (مثلاً `""` → `"0"`) آن هم باید برود
    for (const k of NUMERIC) if (form[k] !== normalized[k]) patch[k] = normalized[k];
    if (!Object.keys(patch).length) {
      toast("چیزی برای ذخیره نیست", { tone: "info" });
      return;
    }
    setTrimmed([]);
    saveMutation.mutate(patch);
  }

  // ---------- بررسیِ کدِ روی بنر ----------
  const promoCode = (form?.promo_code ?? "").trim().toUpperCase();
  const couponsQuery = useQuery({
    queryKey: ["adminCoupons"],
    queryFn: getCoupons,
    enabled: promoCode.length > 0,
    retry: false,
    staleTime: 30_000,
  });

  const promoCheck = useMemo(() => {
    if (!promoCode) return null;
    if (!couponsQuery.data) return { kind: "loading" as const };
    const found = couponsQuery.data.coupons.find((c) => c.code.toUpperCase() === promoCode);
    if (!found) return { kind: "missing" as const };
    const state = couponStateOf(found, localToday());
    return { kind: "found" as const, state, coupon: found };
  }, [promoCode, couponsQuery.data]);

  // ---------- وضعیت‌های بارگذاری ----------
  if (
    settingsQuery.error instanceof ApiError &&
    [401, 403].includes(settingsQuery.error.status)
  ) {
    return <ForbiddenBox />;
  }
  if (settingsQuery.isPending || !form || !loaded) return <Spinner label="در حال گرفتن تنظیمات…" />;
  if (settingsQuery.error) {
    return (
      <ErrorBox
        message={
          settingsQuery.error instanceof ApiError
            ? settingsQuery.error.message
            : "خطا در گرفتن تنظیمات"
        }
        onRetry={() => settingsQuery.refetch()}
      />
    );
  }

  const set = <K extends keyof AdminSettings>(k: K, v: AdminSettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));

  const shipping = Number(form.shipping_cost) || 0;
  const freeOver = Number(form.free_shipping_over) || 0;
  const shopOpen = form.shop_open === "1";

  return (
    <div className="space-y-5">
      {/* ---------- نوارِ تغییراتِ ذخیره‌نشده ---------- */}
      {changed.length > 0 && (
        <div
          className="rounded-[18px] p-3.5 flex flex-wrap items-center gap-3"
          style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
          role="status"
        >
          <span className="text-xs font-bold">
            {faNum(changed.length)} تغییرِ ذخیره‌نشده
          </span>
          <span className="text-[11px] opacity-90">
            {changed.map((k) => FIELD_LABEL[k]).join("، ")}
          </span>
          <div className="flex gap-1.5 mr-auto">
            <Btn tone="teal" disabled={saveMutation.isPending} onClick={() => save()}>
              {saveMutation.isPending ? "در حال ذخیره…" : "ذخیره"}
            </Btn>
            <Btn
              tone="dim"
              disabled={saveMutation.isPending}
              onClick={() => {
                setForm(loaded);
                setConfirmClose(false);
                setTrimmed([]);
              }}
            >
              بازگرداندن
            </Btn>
          </div>
        </div>
      )}

      {trimmed.length > 0 && (
        <p
          className="rounded-[18px] p-3 text-[11px] leading-relaxed"
          style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
        >
          سرور این فیلدها را کوتاه‌تر ذخیره کرد (سقفِ طول): {trimmed.join("، ")}. فرم
          حالا همان مقدارِ ذخیره‌شده را نشان می‌دهد.
        </p>
      )}

      {/* ============================================================
          فروشگاه
          ============================================================ */}
      <Panel title="فروشگاه">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Field label="نام فروشگاه" hint="در هدر، فوتر و عنوانِ صفحه‌ها می‌آید.">
              <Input
                value={form.shop_name}
                onChange={(v) => set("shop_name", v.slice(0, 60))}
                ariaLabel="نام فروشگاه"
                className="w-56"
              />
            </Field>
            <Field label="شماره تماس فروشگاه" hint="در فوتر و پیامِ تعطیلی نشان داده می‌شود.">
              <Input
                value={form.shop_phone}
                onChange={(v) => set("shop_phone", v.slice(0, 20))}
                dir="ltr"
                ariaLabel="شماره تماس فروشگاه"
                className="w-48"
              />
            </Field>
          </div>

          <Field label="آدرس فروشگاه" hint="در فوتر سایت.">
            <Input
              value={form.shop_address}
              onChange={(v) => set("shop_address", v.slice(0, 200))}
              ariaLabel="آدرس فروشگاه"
              className="w-full"
            />
          </Field>

          {/* ---------- وضعیت فروشگاه ---------- */}
          <div
            className="rounded-[16px] p-3.5"
            style={{
              background: shopOpen ? "var(--color-surface-2)" : "var(--color-coral-tint)",
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold" style={{ color: "var(--color-ink)" }}>
                وضعیت فروشگاه
              </span>
              <div className="flex gap-1.5">
                {(
                  [
                    ["1", "باز"],
                    ["0", "بسته"],
                  ] as const
                ).map(([v, label]) => {
                  const on = form.shop_open === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set("shop_open", v)}
                      aria-pressed={on}
                      className="rounded-full px-3.5 py-1.5 text-xs font-bold"
                      style={
                        on
                          ? v === "1"
                            ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                            : { background: "var(--color-coral)", color: "var(--color-ink-on-warm)" }
                          : { background: "var(--color-surface)", color: "var(--color-ink-dim)" }
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {!shopOpen && <Pill label="ثبتِ سفارش بسته است" tone="coral" />}
            </div>

            <p
              className="text-[11px] leading-relaxed mt-2"
              style={{ color: shopOpen ? "var(--color-ink-dim)" : "var(--color-coral)" }}
            >
              {shopOpen ? (
                <>
                  فروشگاه باز است. اگر ببندی، هر تلاش برای ثبت سفارش با پیامِ
                  «فروشگاه موقتاً تعطیل است» رد می‌شود — دیدنِ سایت و پر کردنِ سبد
                  آزاد می‌ماند. مشتریِ در حالِ پرداخت هم سفارشش ثبت نمی‌شود.
                </>
              ) : (
                <>
                  ثبتِ سفارش روی کلِ سایت بسته است. متنِ «پیام اطلاعیه» پایین‌تر
                  به‌عنوان پیامِ تعطیلی در بالای سایت و در صفحه‌ی پرداخت نشان داده
                  می‌شود؛ اگر خالی باشد پیامِ پیش‌فرض می‌آید. یادت نرود بعداً بازش کنی.
                  <br />
                  <strong>نکته:</strong> خودِ رد شدنِ سفارش‌ها بی‌درنگ است، ولی
                  نشان‌دادنِ پیامِ تعطیلی تا یک دقیقه در مرورگرِ مشتری کش می‌شود
                  (`/api/shop/info` با `max-age=60`). پس ممکن است تا یک دقیقه سایت هنوز
                  «باز» به نظر برسد در حالی که سفارش جدید ثبت نمی‌شود. مرورگرِ خودت هم
                  باید صفحه را رفرش کنی.
                </>
              )}
            </p>
          </div>
        </div>
      </Panel>

      {/* ============================================================
          ارسال
          ============================================================ */}
      <Panel title="هزینه‌ی ارسال">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Field label="هزینه‌ی ارسال (تومان)" hint="صفر = ارسال رایگان برای همه.">
              <Input
                value={form.shipping_cost}
                onChange={(v) => set("shipping_cost", v)}
                type="number"
                dir="ltr"
                ariaLabel="هزینه‌ی ارسال"
                className="w-40"
              />
            </Field>
            <Field label="ارسال رایگان از مبلغ (تومان)" hint="صفر = بدون شرطِ مبلغ.">
              <Input
                value={form.free_shipping_over}
                onChange={(v) => set("free_shipping_over", v)}
                type="number"
                dir="ltr"
                ariaLabel="ارسال رایگان از مبلغ"
                className="w-44"
              />
            </Field>
          </div>

          {/* همان جمله‌ای که مشتری می‌بیند — با اعدادِ فارسی */}
          <p
            className="rounded-[14px] p-3 text-xs leading-relaxed"
            style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
          >
            مشتری این را می‌بیند:{" "}
            {shipping === 0 ? (
              <>
                <strong>ارسال رایگان</strong>
                {freeOver > 0 && " (قیدِ مبلغ دیگر اثری ندارد چون ارسال از قبل رایگان است)"}
              </>
            ) : freeOver === 0 ? (
              <>هزینه‌ی ارسال <strong>{toman(shipping)}</strong> برای همه‌ی سفارش‌ها.</>
            ) : (
              <>
                ارسال <strong>{toman(shipping)}</strong>؛ از{" "}
                <strong>{toman(freeOver)}</strong> به بالا <strong>رایگان</strong>.
              </>
            )}
          </p>
          <p className="text-[10px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
            مقایسه با مبلغِ سبد <strong>پس از کسرِ تخفیف</strong> انجام می‌شود، نه مبلغِ
            پیش از تخفیف.
          </p>

          {shipping > 0 && freeOver > 0 && freeOver <= shipping && (
            <p
              className="rounded-[14px] p-3 text-[11px] leading-relaxed"
              style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
            >
              آستانه‌ی ارسالِ رایگان ({toman(freeOver)}) از خودِ هزینه‌ی ارسال (
              {toman(shipping)}) کمتر یا برابر است. یعنی سبدی که کمتر از آستانه
              باشد، هزینه‌ی ارسالی بیشتر از خودش می‌دهد و عملاً بیشترِ سفارش‌ها
              رایگان می‌شوند. اگر عمدی نیست، احتمالاً یک صفر کم یا زیاد شده.
            </p>
          )}
        </div>
      </Panel>

      {/* ============================================================
          اطلاعیه
          ============================================================ */}
      <Panel title="نوار اطلاعیه">
        <Field
          label="پیام اطلاعیه"
          hint="بالای همه‌ی صفحه‌های سایت. خالی = بدون نوار. اگر فروشگاه بسته باشد، همین متن به‌عنوان پیامِ تعطیلی می‌آید."
        >
          <textarea
            value={form.announcement}
            onChange={(e) => set("announcement", e.target.value.slice(0, 300))}
            rows={2}
            aria-label="پیام اطلاعیه"
            className="w-full rounded-[14px] px-3 py-2 text-xs outline-none resize-y"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line-control)",
            }}
          />
        </Field>
        <p className="text-[10px] mt-1.5" style={{ color: "var(--color-ink-dim)" }}>
          {faNum(form.announcement.length)} از ۳۰۰ کاراکتر
        </p>
      </Panel>

      {/* ============================================================
          بنر جشنواره
          ============================================================ */}
      <Panel title="بنر جشنواره‌ی صفحه‌ی اصلی">
        <div className="space-y-3">
          <Field
            label="متن بنر"
            hint="خالی بگذار تا بنر کلاً پنهان شود."
          >
            <Input
              value={form.promo_text}
              onChange={(v) => set("promo_text", v.slice(0, 120))}
              placeholder="مثلاً: جشنواره‌ی تابستانه — ۱۵٪ تخفیف روی همه‌ی سبدها"
              ariaLabel="متن بنر جشنواره"
              className="w-full"
            />
          </Field>
          <Field label="کد تخفیف روی بنر" hint="اختیاری — روی بنر با دکمه‌ی کپی نشان داده می‌شود.">
            <Input
              value={form.promo_code}
              onChange={(v) => set("promo_code", v.toUpperCase().slice(0, 30))}
              placeholder="SUMMER15"
              dir="ltr"
              ariaLabel="کد تخفیف روی بنر"
              className="w-48"
            />
          </Field>

          {/* ---------- بررسیِ کد در برابر لیستِ واقعیِ کدها ---------- */}
          {promoCode && promoCheck?.kind === "loading" && (
            <p className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
              در حال بررسیِ کد…
            </p>
          )}

          {promoCode && promoCheck?.kind === "missing" && (
            <p
              className="rounded-[14px] p-3 text-[11px] leading-relaxed"
              style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
            >
              کدی به نام <strong dir="ltr">{promoCode}</strong> در فهرستِ کدهای تخفیف
              نیست. بنر به مشتری تخفیف وعده می‌دهد ولی مشتری در سبد پیامِ
              «این کد تخفیف معتبر نیست» می‌گیرد. کد را در نمای «تخفیف‌ها» بساز یا
              این فیلد را خالی بگذار.
            </p>
          )}

          {promoCheck?.kind === "found" && (
            <div
              className="rounded-[14px] p-3 text-[11px] leading-relaxed space-y-1"
              style={
                promoCheck.state === "live"
                  ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                  : { background: "var(--color-coral-tint)", color: "var(--color-coral)" }
              }
            >
              <div>
                کد <strong dir="ltr">{promoCheck.coupon.code}</strong> —{" "}
                <strong>{COUPON_STATE_LABEL[promoCheck.state]}</strong>
                {" · "}
                {promoCheck.coupon.type === "percent"
                  ? `${faNum(promoCheck.coupon.value)}٪ تخفیف${
                      promoCheck.coupon.maxDiscount > 0
                        ? ` تا سقف ${toman(promoCheck.coupon.maxDiscount)}`
                        : ""
                    }`
                  : `${toman(promoCheck.coupon.value)} تخفیفِ ثابت`}
              </div>
              {promoCheck.state !== "live" && (
                <div>
                  بنر روی صفحه‌ی اصلی به مشتری وعده‌ی تخفیف می‌دهد ولی این کد الان کار
                  نمی‌کند. یا کد را در نمای «تخفیف‌ها» درست کن، یا کد را از بنر بردار.
                </div>
              )}
            </div>
          )}

          {/* کد بدونِ متن: بنر رندر نمی‌شود، پس کد هیچ‌وقت دیده نمی‌شود */}
          {promoCode && !form.promo_text.trim() && (
            <p
              className="rounded-[14px] p-3 text-[11px] leading-relaxed"
              style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
            >
              متنِ بنر خالی است، پس بنر روی صفحه‌ی اصلی نمایش داده نمی‌شود و این کد
              هیچ‌وقت به مشتری نشان داده نمی‌شود. بنر فقط وقتی می‌آید که متن داشته باشد.
            </p>
          )}
        </div>
      </Panel>

      {/* ============================================================
          هشدار موجودی
          ============================================================ */}
      <Panel title="هشدار موجودی">
        <Field
          label="آستانه (عدد)"
          hint="کالایی با موجودیِ کمتر از این عدد، هم در «نیاز به توجه» داشبورد می‌آید و هم روی کارتِ کالا به مشتری برچسبِ «فقط N عدد مانده» می‌خورد."
        >
          <Input
            value={form.low_stock_threshold}
            onChange={(v) => set("low_stock_threshold", v)}
            type="number"
            dir="ltr"
            ariaLabel="آستانه‌ی هشدار موجودی"
            className="w-32"
          />
        </Field>
      </Panel>

      {/* ============================================================
          تأییدِ بستنِ فروشگاه
          ============================================================ */}
      {confirmClose && (
        <div
          className="rounded-[18px] p-4 space-y-3"
          style={{ background: "var(--color-coral-tint)", border: "1px solid var(--color-coral)" }}
        >
          <p className="text-xs leading-relaxed font-bold" style={{ color: "var(--color-coral)" }}>
            فروشگاه بسته شود؟
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-coral)" }}>
            از این لحظه تا وقتی دوباره بازش کنی، هیچ سفارشی ثبت نمی‌شود — نه از سمتِ
            سایت و نه از سبدِ مشتریانی که همین حالا در حالِ خریدند. صفحه‌ی محصولات و
            سبد باز می‌ماند ولی دکمه‌ی پرداخت رد می‌شود.
          </p>
          <div className="flex flex-wrap gap-2">
            <Btn
              tone="coral"
              disabled={saveMutation.isPending}
              onClick={() => save(true)}
            >
              {saveMutation.isPending ? "در حال ذخیره…" : "بله، فروشگاه را ببند"}
            </Btn>
            <Btn tone="dim" onClick={() => setConfirmClose(false)}>
              انصراف
            </Btn>
          </div>
        </div>
      )}

      {/* ---------- ذخیره‌ی همیشگی ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Btn
          tone="teal"
          disabled={saveMutation.isPending || changed.length === 0}
          onClick={() => save()}
        >
          {saveMutation.isPending ? "در حال ذخیره…" : "ذخیره‌ی تنظیمات"}
        </Btn>
        {changed.length === 0 ? (
          <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
            همه‌چیز ذخیره شده است.
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
            فقط {faNum(changed.length)} فیلدِ عوض‌شده فرستاده می‌شود.
          </span>
        )}
        <Btn
          tone="dim"
          disabled={saveMutation.isPending}
          onClick={() => settingsQuery.refetch()}
          title="خواندنِ دوباره از سرور"
        >
          بازخوانی از سرور
        </Btn>
      </div>

      <p className="text-[10px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
        «بازخوانی از سرور» تغییراتِ ذخیره‌نشده را دور می‌ریزد. بکاپِ دستی و خروجیِ
        اکسل در این نما نیستند؛ آن دو بخشِ «نگهداری» بودند و در نمای «وضعیت سیستم»
        می‌آیند.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] mb-1" style={{ color: "var(--color-ink-dim)" }}>
        {label}
      </div>
      {children}
      {hint && (
        <div className="text-[10px] mt-1 max-w-[420px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
