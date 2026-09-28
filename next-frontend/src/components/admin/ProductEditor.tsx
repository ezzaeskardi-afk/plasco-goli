"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  getAdminProducts,
  setProductPublished,
  thumbUrl,
  updateProduct,
  uploadImage,
} from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  Panel,
  Spinner,
  ErrorBox,
  ForbiddenBox,
  Btn,
  Input,
  faNum,
  toman,
} from "@/components/admin/AdminBits";
import {
  EMPTY_PRODUCT_FORM,
  MAX_GALLERY,
  cleanSpecs,
  formFromProduct,
  imageRejectReason,
  toNum,
  toProductPayload,
  validateProductForm,
  type ProductFormState,
} from "@/lib/productForm";
import type { AdminProduct } from "@/lib/adminTypes";

// ============================================================
// ویرایشگرِ کاملِ محصول
// ============================================================
// این فرم همان چیزی است که تا امروز فقط در پنلِ Express وجود داشت
// (`openProductModal` در frontend/js/admin.js). دلیلِ وجودش یک جمله است: نمای
// انبار فقط قیمت و موجودی را درجا عوض می‌کند و بقیه‌ی محصول — توضیحات، گالری،
// مشخصات، عمده‌فروشی و عکس — راهی برای ویرایش نداشت.
//
// چهار تصمیمِ عمدی که ارزشِ نوشتن دارند:
//
//   ۱. **آیکون در این فرم نیست.** ستونِ `icon` در دیتابیس هست و سرور اعتبارسنجی
//      می‌کند، ولی هیچ‌جای فرانت‌اندِ Next آن را رندر نمی‌کند (جست‌وجو شد: نه
//      `ProductCard`، نه صفحه‌ی محصول، نه سبد). گذاشتنِ یک فیلد که هیچ‌جا دیده
//      نمی‌شود یعنی مدیر مقداری وارد می‌کند و «هیچ اتفاقی نمی‌افتد» می‌بیند.
//      پس نه نشان داده می‌شود و نه فرستاده: `PUT` با مقدارِ قبلی ادغام می‌کند،
//      پس مقدارِ موجود دستِ نخورده می‌ماند و برای کالای تازه سرور خودش
//      `i-package` می‌گذارد.
//
//   ۲. **عکس فقط با آپلود.** مسیرِ عکس دستی تایپ نمی‌شود، چون هر مسیرِ غلطی که
//      با `/picture/` شروع شود از اعتبارسنجیِ سرور رد می‌شود ولی روی سایت به
//      عکسِ شکسته می‌رسد. تنها راهِ گرفتنِ مسیر، همان endpointی است که فایل را
//      روی دیسک می‌نویسد و مسیرِ واقعی را برمی‌گرداند.
//
//   ۳. **گالری جدا از کاور.** سرور `image` را جایگزینِ `images` نمی‌کند و سقفِ
//      گالری ۸ عکس است (`.slice(0, 8)`)؛ همان عدد اینجا هم هست تا فرم و سرور
//      دو چیزِ متفاوت نگویند.
//
//   ۴. **انتشار از ذخیره جداست.** دکمه‌ی «ذخیره» هرگز منتشر نمی‌کند — همان
//      قاعده‌ای که `POST /products/:id/published` را از `PUT` جدا کرد: ذخیره‌ی
//      یک قیمتِ عجولانه نباید کالا را از سایت بردارد.

type Draft = ProductFormState;

const FIELD_CLASS =
  "w-full rounded-[14px] px-3 py-2 text-[16px] outline-none sm:text-xs";
const FIELD_STYLE: React.CSSProperties = {
  background: "var(--color-surface-2)",
  color: "var(--color-ink)",
  border: "1px solid var(--color-line-control)",
};

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="block text-[11px] mb-1.5" style={{ color: "var(--color-ink-dim)" }}>
      {children}
      {hint && <span className="mr-2 opacity-80">{hint}</span>}
    </span>
  );
}

export function ProductEditor({ id }: { id?: number } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const isNew = id == null;

  const [draft, setDraft] = useState<Draft>(EMPTY_PRODUCT_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [uploading, setUploading] = useState<"cover" | "gallery" | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  // فهرستِ کالاها فقط برای دو کار لازم است: پیدا کردنِ کالای همین مسیر (سرور
  // مسیرِ «یک کالا» ندارد) و پر کردنِ پیشنهادهای دسته‌بندی از دسته‌های موجود.
  const listQuery = useQuery({
    queryKey: ["adminProducts"],
    queryFn: getAdminProducts,
    retry: false,
    staleTime: 20_000,
  });

  const product: AdminProduct | null = useMemo(() => {
    if (isNew || !listQuery.data) return null;
    return listQuery.data.products.find((p) => p.id === id) ?? null;
  }, [isNew, id, listQuery.data]);

  const categories = useMemo(
    () => [...new Set((listQuery.data?.products ?? []).map((p) => p.category))].filter(Boolean),
    [listQuery.data],
  );

  // فقط یک بار فرم را از کالا پر کن. بدونِ این محافظ، هر بار که فهرست تازه
  // می‌شود (`staleTime` تمام شود یا کاربر ذخیره بزند) فرم بازنویسی می‌شد و
  // تغییرهای ذخیره‌نشده‌ی مدیر بی‌صدا می‌رفت.
  const [loadedFrom, setLoadedFrom] = useState<number | null>(null);
  useEffect(() => {
    if (!product || loadedFrom === product.id) return;
    setDraft(formFromProduct(product));
    setLoadedFrom(product.id);
  }, [product, loadedFrom]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["adminProducts"] });
    queryClient.invalidateQueries({ queryKey: ["adminInventory"] });
    queryClient.invalidateQueries({ queryKey: ["adminOverview"] });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = toProductPayload(draft);
      return isNew ? createProduct(payload) : updateProduct(id as number, payload);
    },
    onSuccess: () => {
      refreshAll();
      toast(isNew ? "کالا ساخته شد — هنوز منتشر نشده است" : "تغییرها ذخیره شد", {
        tone: "success",
      });
      if (isNew) router.push("/admin/stock");
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "ذخیره ممکن نشد", { tone: "error" }),
  });

  const publishMutation = useMutation({
    mutationFn: ({ published, force }: { published: boolean; force: boolean }) =>
      setProductPublished(id as number, published, force),
    onSuccess: (res) => {
      refreshAll();
      toast(res.published ? "کالا منتشر شد" : "کالا از سایت برداشته شد", {
        tone: "success",
      });
    },
    onError: (err) => {
      // ۴۰۹ یعنی «عکس ندارد؛ اگر مطمئنی دوباره بفرست» — تنها خطایی که مدیر
      // می‌تواند آگاهانه ردش کند. کالای صفر تومان ۴۰۰ می‌گیرد و راهِ عبوری
      // ندارد (فروشِ مجانی راهِ برگشتی ندارد).
      if (err instanceof ApiError && err.status === 409 && product) {
        if (window.confirm(`${err.message}\n\nبدونِ عکس منتشر شود؟`)) {
          publishMutation.mutate({ published: true, force: true });
        }
        return;
      }
      toast(err instanceof ApiError ? err.message : "تغییر انتشار ممکن نشد", {
        tone: "error",
      });
    },
  });

  async function onPickFiles(files: FileList | null, target: "cover" | "gallery") {
    if (!files || !files.length) return;
    const list = [...files];
    if (target === "gallery" && draft.images.length + list.length > MAX_GALLERY) {
      toast(`گالری حداکثر ${faNum(MAX_GALLERY)} عکس دارد.`, { tone: "error" });
      return;
    }
    setUploading(target);
    try {
      const added: string[] = [];
      for (const file of list) {
        const reject = imageRejectReason(file);
        if (reject) {
          toast(reject, { tone: "error" });
          continue;
        }
        const res = await uploadImage(file);
        added.push(res.path);
      }
      if (!added.length) return;
      if (target === "cover") {
        set("image", added[0]);
        // عکسِ کاور هم به گالری اضافه می‌شود: مدیر معمولاً همان عکس را در
        // گالریِ صفحه‌ی محصول هم می‌خواهد، و پیدا کردنش در فایل‌سیستم دوباره
        // کارِ اضافه است.
        setDraft((d) => ({ ...d, images: [...new Set([...d.images, ...added])] }));
      } else {
        setDraft((d) => ({ ...d, images: [...new Set([...d.images, ...added])] }));
      }
      toast(target === "cover" ? "عکسِ کاور ثبت شد" : `${faNum(added.length)} عکس اضافه شد`, {
        tone: "success",
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "آپلود انجام نشد", { tone: "error" });
    } finally {
      setUploading(null);
      // ورودی را خالی می‌کنیم وگرنه انتخابِ دوباره‌ی همان فایل هیچ رویدادی
      // نمی‌دهد (رفتارِ خودِ مرورگر) و مدیر فکر می‌کند آپلود کار نکرد.
      if (coverInput.current) coverInput.current.value = "";
      if (galleryInput.current) galleryInput.current.value = "";
    }
  }

  function submit() {
    setTouched(true);
    const found = validateProductForm(draft);
    setErrors(found);
    if (found.length) {
      toast(found[0], { tone: "error" });
      return;
    }
    saveMutation.mutate();
  }

  if (listQuery.error instanceof ApiError && [401, 403].includes(listQuery.error.status)) {
    return <ForbiddenBox />;
  }
  if (listQuery.isPending) return <Spinner label="در حال خواندنِ کالا…" />;
  if (listQuery.error) {
    return (
      <ErrorBox message="فهرستِ کالاها خوانده نشد" onRetry={() => listQuery.refetch()} />
    );
  }
  if (!isNew && !product) {
    return (
      <Panel title="کالا پیدا نشد">
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          کالایی با شناسه‌ی {faNum(id as number)} در فهرست نیست. ممکن است همین حالا
          حذف شده باشد یا شناسه‌ی آدرس اشتباه باشد.
        </p>
        <Link
          href="/admin/stock"
          className="inline-block mt-3 rounded-full px-4 py-2 text-xs font-bold"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          بازگشت به انبار
        </Link>
      </Panel>
    );
  }

  const dirty = !isNew && product && JSON.stringify(draft) !== JSON.stringify(formFromProduct(product));
  const specs = draft.specs;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: "var(--color-ink)" }}>
            {isNew ? "کالای تازه" : draft.title || "بدونِ عنوان"}
          </h2>
          {!isNew && (
            <p className="text-[11px] mt-1" style={{ color: "var(--color-ink-dim)" }}>
              شناسهی {faNum(id as number)} — آخرین تغییر: {product?.updatedAt}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/stock"
            className="rounded-full px-4 py-2 text-xs font-bold min-h-10 sm:min-h-0"
            style={{ background: "var(--color-surface-2)", color: "var(--color-ink-dim)" }}
          >
            بازگشت
          </Link>
          <Btn onClick={submit} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "در حال ذخیره…" : isNew ? "ساختنِ کالا" : "ذخیره‌ی تغییرات"}
          </Btn>
        </div>
      </div>

      {errors.length > 0 && touched && (
        <ul
          className="rounded-[18px] p-3 text-[11px] leading-relaxed space-y-1"
          style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
          role="alert"
        >
          {errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}

      {/* ---------- اطلاعاتِ اصلی ---------- */}
      <Panel title="اطلاعاتِ کالا">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <Label hint="حداکثر ۱۲۰ حرف">عنوان</Label>
            <input
              className={FIELD_CLASS}
              style={FIELD_STYLE}
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              aria-label="عنوان"
            />
          </label>

          <label className="block">
            <Label>دسته‌بندی</Label>
            <input
              className={FIELD_CLASS}
              style={FIELD_STYLE}
              value={draft.category}
              list="pg-categories"
              onChange={(e) => set("category", e.target.value)}
              aria-label="دسته‌بندی"
            />
            {/* پیشنهادها از دسته‌های موجود می‌آید، ولی ورودی آزاد است: سرور
                خودش `ensureCategory` می‌زند و دسته‌ی تازه را می‌سازد. */}
            <datalist id="pg-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className="block sm:col-span-2">
            <Label hint="حداکثر ۵۰۰ حرف">توضیحات</Label>
            <textarea
              className={`${FIELD_CLASS} min-h-24 leading-relaxed`}
              style={FIELD_STYLE}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              aria-label="توضیحات"
            />
          </label>

          <label className="block">
            <Label hint="تومان">قیمت</Label>
            <Input
              value={draft.price}
              onChange={(v) => set("price", v)}
              type="number"
              dir="ltr"
              ariaLabel="قیمت"
            />
          </label>

          <label className="block">
            <Label hint="خالی = بدونِ تخفیف">قیمت خط‌خورده</Label>
            <Input
              value={draft.oldPrice}
              onChange={(v) => set("oldPrice", v)}
              type="number"
              dir="ltr"
              ariaLabel="قیمت خط‌خورده"
            />
          </label>

          <label className="block">
            <Label>موجودی</Label>
            <Input
              value={draft.stock}
              onChange={(v) => set("stock", v)}
              type="number"
              dir="ltr"
              ariaLabel="موجودی"
            />
          </label>

          <label className="block">
            <Label hint="حداکثر ۳۰ حرف، مثل «جدید»">نشان</Label>
            <Input
              value={draft.badge}
              onChange={(v) => set("badge", v)}
              ariaLabel="نشان"
            />
          </label>
        </div>
      </Panel>

      {/* ---------- عکس‌ها ---------- */}
      <Panel
        title="عکس‌ها"
        action={
          <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
            گالری {faNum(draft.images.length)} از {faNum(MAX_GALLERY)}
          </span>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[14px]"
              style={{ background: "var(--color-surface-2)" }}
            >
              {draft.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- پیش‌نمایشِ آپلود؛ next/image اینجا سربار است
                <img
                  src={thumbUrl(draft.image, 200)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  className="flex h-full w-full items-center justify-center text-[10px] text-center"
                  style={{ color: "var(--color-ink-dim)" }}
                >
                  بدون عکس
                </span>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Btn
                  tone="dim"
                  onClick={() => coverInput.current?.click()}
                  disabled={uploading !== null}
                >
                  {uploading === "cover" ? "در حال آپلود…" : "آپلود عکسِ کاور"}
                </Btn>
                {draft.image && (
                  <Btn tone="coral" onClick={() => set("image", null)}>
                    برداشتنِ کاور
                  </Btn>
                )}
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
                JPG/PNG/WebP، حداکثر ۲ مگابایت، بزرگ‌ترین ضلع تا ۴۰۰۰ و کوچک‌ترین
                حداقل ۸۰ پیکسل. (فراداده‌ی محلِ عکس‌برداری سرور خودش پاک می‌کند.)
              </p>
              {/* کالای بی‌عکس منتشر نمی‌شود (۴۰۹) — پس همین‌جا هم گفته می‌شود */}
              {!draft.image && (
                <p className="text-[10px]" style={{ color: "var(--color-gold)" }}>
                  تا عکس نگذاری، دکمه‌ی انتشار هشدار می‌دهد.
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <Label hint="اولی، عکسِ اولِ گالری است">گالری</Label>
              <Btn
                tone="dim"
                onClick={() => galleryInput.current?.click()}
                disabled={uploading !== null || draft.images.length >= MAX_GALLERY}
              >
                {uploading === "gallery" ? "در حال آپلود…" : "افزودنِ عکس"}
              </Btn>
            </div>
            {draft.images.length === 0 ? (
              <p className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
                گالری خالی است. عکس‌های اضافه‌ی محصول اینجا می‌آیند (حداکثر ۸ تا).
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {draft.images.map((src) => (
                  <li key={src} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- بندانگشتیِ فهرست */}
                    <img
                      src={thumbUrl(src, 160)}
                      alt=""
                      className="h-16 w-16 rounded-[12px] object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "images",
                          draft.images.filter((s) => s !== src),
                        )
                      }
                      className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full text-[11px] font-bold"
                      style={{ background: "var(--color-coral)", color: "#2B0B0B" }}
                      aria-label="برداشتن از گالری"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* دو ورودیِ پنهان: یکی برای کاور (تک فایل) و یکی برای گالری (چند فایل) */}
        <input
          ref={coverInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onPickFiles(e.target.files, "cover")}
        />
        <input
          ref={galleryInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onPickFiles(e.target.files, "gallery")}
        />
      </Panel>

      {/* ---------- مشخصات ---------- */}
      <Panel
        title="مشخصات"
        action={
          specs.length < 12 ? (
            <Btn
              tone="dim"
              onClick={() => set("specs", [...specs, { k: "", v: "" }])}
            >
              افزودنِ ردیف
            </Btn>
          ) : (
            <span className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
              سقفِ ۱۲ ردیف پر شد
            </span>
          )
        }
      >
        {specs.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--color-ink-dim)" }}>
            جدولِ «مشخصات» صفحه‌ی محصول از همین ردیف‌ها ساخته می‌شود — مثل
            «گنجایش: ۳ لیتر». ردیفِ نیمه‌خالی نادیده گرفته می‌شود.
          </p>
        ) : (
          <ul className="space-y-2">
            {specs.map((row, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input
                  value={row.k}
                  onChange={(v) =>
                    set(
                      "specs",
                      specs.map((r, j) => (j === i ? { ...r, k: v } : r)),
                    )
                  }
                  placeholder="عنوان"
                  ariaLabel="عنوان مشخصه"
                  className="min-w-0 flex-1 sm:w-40 sm:flex-none"
                />
                <Input
                  value={row.v}
                  onChange={(v) =>
                    set(
                      "specs",
                      specs.map((r, j) => (j === i ? { ...r, v } : r)),
                    )
                  }
                  placeholder="مقدار"
                  ariaLabel="مقدار مشخصه"
                  className="min-w-0 flex-[2] sm:w-64 sm:flex-none"
                />
                <button
                  type="button"
                  onClick={() => set("specs", specs.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-full px-3 py-2 text-xs font-bold min-h-10 sm:min-h-0"
                  style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
                  aria-label="برداشتنِ ردیف"
                >
                  حذف
                </button>
              </li>
            ))}
          </ul>
        )}
        {cleanSpecs(specs).length !== specs.length && specs.length > 0 && (
          <p className="text-[10px] mt-2" style={{ color: "var(--color-ink-dim)" }}>
            {faNum(specs.length - cleanSpecs(specs).length)} ردیفِ نیمه‌خالی ذخیره
            نمی‌شود.
          </p>
        )}
      </Panel>

      {/* ---------- عمده‌فروشی ---------- */}
      <Panel title="عمده‌فروشی (B2B)">
        <p className="text-[11px] mb-3 leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
          اگر «حد نصاب» و «درصد تخفیف» هر دو پر باشند، از آن تعداد به بالا قیمتِ
          واحد در صفحه‌ی محصول با تخفیفِ عمده محاسبه می‌شود. صفر یا خالی = خاموش.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <Label hint="تعداد">حد نصاب تعداد</Label>
            <Input
              value={draft.wholesaleMinQty}
              onChange={(v) => set("wholesaleMinQty", v)}
              type="number"
              dir="ltr"
              ariaLabel="حد نصاب عمده"
            />
          </label>
          <label className="block">
            <Label hint="بین ۰ و ۹۰">درصد تخفیف عمده</Label>
            <Input
              value={draft.wholesaleDiscount}
              onChange={(v) => set("wholesaleDiscount", v)}
              type="number"
              dir="ltr"
              ariaLabel="درصد تخفیف عمده"
            />
          </label>
        </div>
        {toNum(draft.wholesaleMinQty) > 0 && toNum(draft.wholesaleDiscount) > 0 && (
          <p className="text-[11px] mt-3" style={{ color: "var(--color-teal)" }}>
            از {faNum(toNum(draft.wholesaleMinQty))} عدد به بالا، قیمتِ واحد{" "}
            {toman(
              Math.round(
                toNum(draft.price) * (1 - toNum(draft.wholesaleDiscount) / 100),
              ),
            )}{" "}
            می‌شود.
          </p>
        )}
      </Panel>

      {/* ---------- انتشار ---------- */}
      {!isNew && product && (
        <Panel title="انتشار در سایت">
          <p className="text-[11px] mb-3 leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
            {product.published
              ? "این کالا در سایت دیده می‌شود."
              : "این کالا پیش‌نویس است و در سایت دیده نمی‌شود."}{" "}
            ذخیره‌ی تغییرها هیچ‌وقت وضعیتِ انتشار را عوض نمی‌کند.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              tone={product.published ? "coral" : "teal"}
              disabled={publishMutation.isPending}
              onClick={() =>
                publishMutation.mutate({ published: !product.published, force: false })
              }
            >
              {product.published ? "برداشتن از سایت" : "انتشار در سایت"}
            </Btn>
            {product.updatedAt && (
              <a
                href={`/product/${product.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full px-4 py-2 text-xs font-bold min-h-10 sm:min-h-0 inline-flex items-center"
                style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
              >
                دیدن در سایت
              </a>
            )}
          </div>
        </Panel>
      )}

      {dirty && (
        <p className="text-[11px]" style={{ color: "var(--color-gold)" }}>
          تغییرهای ذخیره‌نشده داری.
        </p>
      )}
    </div>
  );
}
