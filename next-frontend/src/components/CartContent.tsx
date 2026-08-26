"use client";

import { useEffect, useState, useOptimistic } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCart,
  updateCartItem,
  removeFromCart,
  addToCart,
  applyCoupon,
  removeCoupon,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { CartResponse } from "@/lib/types";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function toToman(n: number): string {
  return `${toFa(n)} تومان`;
}

// ============================================================
// Optimistic cart update hook
// ============================================================
function useOptimisticCart(cart: CartResponse | null) {
  const [optimistic, setOptimistic] = useOptimistic(cart);

  const updateItemQty = (productId: number, newQty: number) => {
    if (!optimistic) return;
    setOptimistic({
      ...optimistic,
      items: optimistic.items.map((item) =>
        item.productId === productId
          ? { ...item, qty: newQty }
          : item,
      ),
    });
  };

  const removeItem = (productId: number) => {
    if (!optimistic) return;
    setOptimistic({
      ...optimistic,
      items: optimistic.items.filter(
        (item) => item.productId !== productId,
      ),
    });
  };

  return { optimistic, updateItemQty, removeItem };
}

// ============================================================
// CartContent
// ============================================================
export function CartContent() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [couponCode, setCouponCode] = useState("");
  const [couponMsg, setCouponMsg] = useState("");

  // TanStack Query — کش خودکار، refetch هوشمند
  const {
    data: cart,
    isLoading,
    error,
  } = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: getCart,
    staleTime: 10_000,
  });

  const { optimistic, updateItemQty, removeItem } = useOptimisticCart(
    cart ?? null,
  );

  // پیام‌های خودِ سرور درباره‌ی تغییری که *او* در سبد داد: کالایی که مدیر حذف
  // کرده و از سبد برداشته شد، تعدادی که به سقف چسبید، کدِ تخفیفی که با تغییرِ
  // سبد دیگر صدق نمی‌کند. سرور این‌ها را می‌فرستد و نسخه‌ی Next بی‌صدا دورشان
  // می‌ریخت — یعنی سبدِ کاربر عوض می‌شد و هیچ توضیحی نمی‌گرفت.
  // نسخه‌ی Express همین دو را در frontend/js/cart.js:77 و :218 توست می‌کند.
  const notice = cart?.notice;
  const couponNotice = cart?.couponNotice;
  useEffect(() => {
    if (notice) toast(notice, { tone: "info" });
  }, [notice, toast]);
  useEffect(() => {
    if (couponNotice) toast(couponNotice, { tone: "info" });
  }, [couponNotice, toast]);

  // Mutation — آپدیت تعداد
  const updateMutation = useMutation({
    mutationFn: ({ productId, qty }: { productId: number; qty: number }) =>
      updateCartItem(productId, qty),
    onMutate: async ({ productId, qty }) => {
      await queryClient.cancelQueries({ queryKey: ["cart"] });
      updateItemQty(productId, qty);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });

  // Mutation — حذف
  // برای «بازگرداندن» — همان POST /cart/add؛ پاسخش کلِ سبد است
  const addMutation = useMutation({
    mutationFn: ({ productId, qty }: { productId: number; qty: number }) =>
      addToCart(productId, qty),
    onSuccess: (data) => {
      queryClient.setQueryData(["cart"], data);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (productId: number) => removeFromCart(productId),
    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: ["cart"] });
      removeItem(productId);
    },
    onSuccess: (_data, productId) => {
      // بازگرداندن با یک کلیک — همتای undo در frontend/js/cart.js:86. حذفِ
      // اشتباهیِ یک قلم نباید یعنی رفتن به صفحه‌ی محصول و چیدن از اول.
      const item = cart?.items.find((x) => x.productId === productId);
      toast("از سبد حذف شد", {
        tone: "info",
        action: item
          ? {
              label: "بازگرداندن",
              onClick: () => {
                addMutation.mutate({ productId, qty: item.qty });
              },
            }
          : undefined,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });

  // کوپن
  const couponMutation = useMutation({
    mutationFn: (code: string) => applyCoupon(code),
    onSuccess: (data) => {
      queryClient.setQueryData(["cart"], data);
      setCouponMsg("کد تخفیف اعمال شد");
      setCouponCode("");
    },
    onError: (err) => {
      setCouponMsg(
        err instanceof ApiError ? err.message : "خطا",
      );
    },
  });

  const removeCouponMutation = useMutation({
    mutationFn: removeCoupon,
    onSuccess: (data) => {
      queryClient.setQueryData(["cart"], data);
      setCouponMsg("");
    },
    onError: (err) => {
      setCouponMsg(
        err instanceof ApiError ? err.message : "خطا",
      );
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }

  const displayCart = optimistic ?? cart;

  if (
    !displayCart ||
    displayCart.items.length === 0
  ) {
    return (
      <div className="text-center py-16">
        <p className="text-ink-soft text-sm mb-4">سبد خریدتون خالیه</p>
        <Link
          href="/products"
          className="inline-block rounded-full px-6 py-2.5 text-sm font-bold transition-colors"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          مشاهدهٔ محصولات
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* ستون اقلام */}
      <div className="lg:col-span-2 space-y-3">
        {displayCart.items.map((item) => (
          <div
            key={item.productId}
            className="flex gap-3 rounded-[18px] p-3 transition-opacity"
            style={{
              background: "var(--color-surface)",
              opacity: updateMutation.isPending ||
                removeMutation.isPending
                ? 0.7
                : 1,
            }}
          >
            {/* تصویر */}
            <div
              className="w-20 h-20 rounded-xl shrink-0 overflow-hidden relative"
              style={{ background: "var(--color-surface-2)" }}
            >
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-2xl"
                  style={{ color: "var(--color-teal-dark)" }}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="2" y="4" width="16" height="12" rx="3" />
                  </svg>
                </div>
              )}
            </div>

            {/* اطلاعات */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/product/${item.productId}`}
                className="text-sm font-semibold leading-snug line-clamp-1 hover:text-teal transition-colors"
                style={{ color: "var(--color-ink)" }}
              >
                {item.title}
              </Link>

              {item.notice && (
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--color-coral)" }}
                >
                  {item.notice}
                </p>
              )}

              <div className="flex items-center justify-between mt-2">
                {/* کنترل تعداد */}
                <div
                  className="flex items-center rounded-full overflow-hidden"
                  style={{
                    border: "1px solid var(--color-line)",
                    background: "var(--color-surface-2)",
                  }}
                >
                  <button
                    onClick={() =>
                      updateMutation.mutate({
                        productId: item.productId,
                        qty: item.qty + 1,
                      })
                    }
                    disabled={
                      item.qty >= item.maxQty || updateMutation.isPending
                    }
                    className="w-8 h-8 flex items-center justify-center text-sm font-bold transition-colors hover:bg-teal-tint disabled:opacity-30"
                    style={{ color: "var(--color-teal)" }}
                  >
                    +
                  </button>
                  <span
                    className="w-8 text-center text-xs font-bold"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {toFa(item.qty)}
                  </span>
                  <button
                    onClick={() =>
                      item.qty > 1
                        ? updateMutation.mutate({
                            productId: item.productId,
                            qty: item.qty - 1,
                          })
                        : removeMutation.mutate(item.productId)
                    }
                    disabled={updateMutation.isPending}
                    className="w-8 h-8 flex items-center justify-center text-sm font-bold transition-colors hover:bg-coral-tint disabled:opacity-30"
                    style={{ color: "var(--color-coral)" }}
                  >
                    {item.qty > 1 ? (
                      "−"
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M5 5l10 10M15 5l-10 10" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* قیمت */}
                <div className="text-right">
                  {/* تخفیف عمده مقدم است: وقتی فعال شده، قیمتِ واحدِ واقعی
                      همان unitPrice است نه price. قبلاً همیشه price نشان داده
                      می‌شد، پس مشتریِ عمده قیمتِ خرده می‌دید در حالی که سرور
                      کمتر حساب می‌کرد — عددِ ردیف با جمعِ فاکتور نمی‌خواند. */}
                  {item.wholesale?.applies ? (
                    <div className="flex items-baseline gap-1.5 justify-end">
                      <span
                        className="text-sm font-extrabold"
                        style={{ color: "var(--color-gold)" }}
                      >
                        {toToman(item.unitPrice)}
                      </span>
                      <span
                        className="text-[11px] line-through"
                        style={{ color: "var(--color-ink-dim)" }}
                      >
                        {toToman(item.price)}
                      </span>
                    </div>
                  ) : item.discountPercent > 0 ? (
                    <div className="flex items-baseline gap-1.5 justify-end">
                      <span
                        className="text-sm font-extrabold"
                        style={{ color: "var(--color-teal)" }}
                      >
                        {toToman(item.price)}
                      </span>
                      <span
                        className="text-[11px] line-through"
                        style={{ color: "var(--color-ink-dim)" }}
                      >
                        {toToman(item.oldPrice)}
                      </span>
                    </div>
                  ) : (
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--color-ink-soft)" }}
                    >
                      {toToman(item.price)}
                    </span>
                  )}
                  {/* جمعِ ردیف — همان چیزی که سرور حساب کرده. بدونش کاربر باید
                      قیمت×تعداد را خودش ضرب می‌کرد و با تخفیف عمده هم به عددِ
                      اشتباه می‌رسید. */}
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--color-ink-dim)" }}
                  >
                    جمع: {toToman(item.subtotal)}
                  </div>
                </div>
              </div>

              {item.wholesale?.applies && (
                <p
                  className="text-[11px] mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                  style={{
                    background: "var(--color-gold-tint)",
                    color: "var(--color-gold)",
                  }}
                >
                  تخفیف عمده اعمال شد — {toFa(item.wholesale.discount)}٪ (از{" "}
                  {toFa(item.wholesale.minQty)} عدد)
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ستون جمع */}
      <div className="lg:col-span-1">
        <div
          className="rounded-[18px] p-4 sticky top-[130px]"
          style={{ background: "var(--color-surface)" }}
        >
          <h3
            className="text-sm font-bold mb-4"
            style={{ color: "var(--color-ink)" }}
          >
            خلاصهٔ سفارش
          </h3>

          {/* کوپن */}
          {displayCart.coupon ? (
            <div className="flex items-center justify-between mb-3 text-xs">
              <span style={{ color: "var(--color-teal)" }}>
                {/* `.code` لازم است: سرور آبجکت می‌فرستد. قبلاً خودِ آبجکت رندر
                    می‌شد و صفحه با هر کدِ تخفیفِ معتبر به صفحه‌ی خطا می‌افتاد. */}
                کد تخفیف: {displayCart.coupon.code}
              </span>
              <button
                onClick={() => removeCouponMutation.mutate()}
                disabled={removeCouponMutation.isPending}
                className="underline"
                style={{ color: "var(--color-ink-dim)" }}
              >
                حذف
              </button>
            </div>
          ) : (
            <div className="flex gap-1 mb-3">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="کد تخفیف"
                className="flex-1 rounded-full px-3 py-1.5 text-xs outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-line-control)",
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && couponMutation.mutate(couponCode)
                }
              />
              <button
                onClick={() => couponMutation.mutate(couponCode)}
                disabled={
                  couponMutation.isPending || !couponCode.trim()
                }
                className="rounded-full px-3 py-1.5 text-xs font-bold"
                style={{
                  background: "var(--color-teal-tint)",
                  color: "var(--color-teal)",
                }}
              >
                {couponMutation.isPending ? "..." : "اعمال"}
              </button>
            </div>
          )}
          {couponMsg && (
            <p
              className="text-[11px] mb-2"
              style={{
                color: couponMsg.includes("اعمال")
                  ? "var(--color-teal)"
                  : "var(--color-coral)",
              }}
            >
              {couponMsg}
            </p>
          )}

          {/* ردیف‌های مالی */}
          <div className="space-y-2 text-xs">
            <div
              className="flex justify-between"
              style={{ color: "var(--color-ink-soft)" }}
            >
              <span>تعداد اقلام</span>
              <span>{toFa(displayCart.count)}</span>
            </div>
            <div
              className="flex justify-between"
              style={{ color: "var(--color-ink-soft)" }}
            >
              <span>جمع اقلام</span>
              <span>{toToman(displayCart.total)}</span>
            </div>
            {/* صرفه‌جویی از تخفیفِ خودِ محصولات — جدا از کد تخفیف. سرور
                حسابش می‌کند و Express نشانش می‌داد؛ اینجا جا افتاده بود. */}
            {displayCart.savings > 0 && (
              <div
                className="flex justify-between"
                style={{ color: "var(--color-teal)" }}
              >
                <span>صرفه‌جویی شما</span>
                <span>{toToman(displayCart.savings)}</span>
              </div>
            )}
            {displayCart.discount > 0 && (
              <div
                className="flex justify-between"
                style={{ color: "var(--color-teal)" }}
              >
                <span>
                  تخفیف
                  {displayCart.coupon ? ` (${displayCart.coupon.code})` : ""}
                </span>
                <span>−{toToman(displayCart.discount)}</span>
              </div>
            )}
            <div
              className="flex justify-between"
              style={{ color: "var(--color-ink-soft)" }}
            >
              <span>هزینه ارسال</span>
              <span>
                {displayCart.shippingFee === 0 ? (
                  <span style={{ color: "var(--color-teal)" }}>رایگان</span>
                ) : (
                  toToman(displayCart.shippingFee)
                )}
              </span>
            </div>
            {/* شرط عیناً همان frontend/js/cart.js:228: فقط وقتی فروشگاه هم
                آستانه‌ی ارسال رایگان تعریف کرده و هم کرایه‌ای می‌گیرد. وگرنه
                «تا ارسال رایگان» برای فروشگاهی که همیشه رایگان می‌فرستد
                بی‌معنی است. */}
            {displayCart.freeShippingOver > 0 &&
              displayCart.shippingCost > 0 &&
              displayCart.freeShippingGap > 0 && (
                <div
                  className="text-center py-1.5 rounded-full text-[11px]"
                  style={{
                    background: "var(--color-gold-tint)",
                    color: "var(--color-gold)",
                  }}
                >
                  {toToman(displayCart.freeShippingGap)} تا ارسال رایگان
                </div>
              )}
            <div
              className="flex justify-between text-sm font-extrabold pt-2"
              style={{
                borderTop: "1px solid var(--color-line)",
                color: "var(--color-ink)",
              }}
            >
              <span>قابل پرداخت</span>
              <span>{toToman(displayCart.payable)}</span>
            </div>
          </div>

          {error && (
            <p
              className="text-xs mt-2"
              style={{ color: "var(--color-coral)" }}
            >
              {error instanceof Error ? error.message : "خطا"}
            </p>
          )}

          <Link
            href="/checkout"
            className="block w-full text-center rounded-full py-3 mt-4 text-sm font-bold transition-colors"
            style={{
              background: "var(--color-teal)",
              color: "#04211B",
              boxShadow: "var(--shadow-glow-teal)",
            }}
          >
            تکمیل خرید
          </Link>
        </div>
      </div>
    </div>
  );
}