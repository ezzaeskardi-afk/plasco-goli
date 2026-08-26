"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWishlistIds, toggleWishlist, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

// ============================================================
// علاقه‌مندی‌ها — قلبِ روی کارت‌ها و نشانگرِ هدر
// ============================================================
// همتای بخشِ wishlist در frontend/js/common.js:218-272. در نسخه‌ی Next هیچ
// ردی از آن نبود: نه قلبی روی کارت بود، نه شمارنده‌ای در هدر، نه تبِ حساب —
// با اینکه بک‌اند و دیتابیس آماده بودند.
//
// مهمان: GET /ids همیشه ۲۰۰ با [] می‌دهد (routes/wishlist.js:21)، پس قلب‌ها
// بی‌دردسر رندر می‌شوند؛ فقط روی toggle است که ۴۰۱ می‌آید و مثل نسخه‌ی
// Express به صفحه‌ی ورود هدایت می‌شویم.

export function useWishlistIds() {
  return useQuery<number[]>({
    queryKey: ["wishlistIds"],
    queryFn: async () => (await getWishlistIds()).ids,
    staleTime: 60_000,
    retry: false,
  });
}

export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (productId: number) => toggleWishlist(productId),
    // بهینه: پاسخِ سرور آرایه‌ی تازه را هم دارد — مستقیم می‌نشینیم
    onSuccess: (res) => {
      queryClient.setQueryData(["wishlistIds"], res.ids);
      toast(res.inWishlist ? "به علاقه‌مندی‌ها اضافه شد" : "از علاقه‌مندی‌ها حذف شد", {
        tone: "success",
        action: res.inWishlist ? { href: "/account#wishlist", label: "مشاهده" } : undefined,
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast("برای علاقه‌مندی‌ها اول وارد حساب‌تان شوید", { tone: "info" });
        const back = window.location.pathname + window.location.search;
        setTimeout(() => {
          window.location.href = `/login?redirect=${encodeURIComponent(back)}`;
        }, 1100);
        return;
      }
      toast(
        err instanceof ApiError && err.message ? err.message : "ثبت نشد؛ دوباره تلاش کنید",
        { tone: "error" },
      );
    },
  });
}
