"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addToCart, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

// ============================================================
// افزودن به سبد — منطقِ مشترکِ کارتِ محصول و صفحه‌ی محصول
// ============================================================
// همتای frontend/js/common.js:183 (`PG.addToCart`). یک‌جا نوشته شده تا دو نقطه‌ی
// فراخوان از هم جدا نیفتند؛ در نسخه‌ی Express هم همین یک تابع بود.
//
// دو نکته که این هوک را از یک `fetch` ساده متمایز می‌کند:
//
//  ۱. پاسخِ `POST /api/cart/add` **کلِ سبد** است (routes/cart.js:148)، پس
//     مستقیم در کشِ ["cart"] نشانده می‌شود. نشانگرِ هدر همان کلید را می‌خواند،
//     پس بدونِ هیچ درخواستِ اضافه‌ای فوری عدد جدید را نشان می‌دهد.
//  ۲. بعدش هم invalidate می‌شود. تکراری نیست: موجودی ممکن است هم‌زمان توسط
//     خریدارِ دیگری کم شده باشد و سرور سبد را سرِ رسیدِ بعدی تصحیح کند.
//
// پیام‌های خطا از خودِ سرور می‌آیند و دست‌کاری نمی‌شوند — سرور دقیق‌تر می‌داند چه
// شد («این محصول فعلاً ناموجود است»، «تعداد اقلام سبد به سقف رسیده…»). فقط
// وقتی پیامی نداشتیم متنِ عمومی می‌گذاریم.

export function useAddToCart() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ productId, qty }: { productId: number; qty: number }) =>
      addToCart(productId, qty),
    onSuccess: (cart) => {
      queryClient.setQueryData(["cart"], cart);
      toast("به سبد خرید اضافه شد", {
        tone: "success",
        action: { href: "/cart", label: "مشاهده سبد" },
      });
      // اگر سرور خودش چیزی در سبد عوض کرده (کالای حذف‌شده برداشته شد، کدِ
      // تخفیف دیگر صدق نمی‌کند) باید گفته شود، وگرنه کاربر می‌بیند جمعِ سبدش
      // بی‌دلیل عوض شده است.
      if (cart.notice) toast(cart.notice, { tone: "info" });
      if (cart.couponNotice) toast(cart.couponNotice, { tone: "info" });
    },
    onError: (err) => {
      toast(
        err instanceof ApiError && err.message
          ? err.message
          : "خطا در افزودن به سبد",
        { tone: "error" },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
}
