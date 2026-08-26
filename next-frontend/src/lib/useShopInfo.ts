"use client";

import { useQuery } from "@tanstack/react-query";
import { getShopInfo } from "@/lib/api";
import type { ShopInfo } from "@/lib/types";

// ============================================================
// تنظیمات فروشگاه — یک کوئریِ مشترک برای همه‌ی مصرف‌کننده‌ها
// ============================================================
// همتای PG.SHOP در نسخه‌ی Express (common.js initShopBar): نوارِ اعلانِ هدر،
// آستانه‌ی «فقط N عدد مانده» روی کارت‌ها، یادداشتِ ارسال رایگان، سدِ
// «فروشگاه بسته است» در پرداخت — همه به یک درخواست نیاز دارند. با کشِ مشترکِ
// TanStack فقط بار اول fetch می‌شود.
//
// خطا عمداً قورت داده می‌شود (null): نبودنِ تنظیمات نباید هیچ صفحه‌ای را
// بکشد؛ همه‌ی مصرف‌کننده‌ها برای null جایگزینِ پیش‌فرض دارند.

export function useShopInfo(): ShopInfo | null {
  const { data } = useQuery<ShopInfo>({
    queryKey: ["shop"],
    queryFn: getShopInfo,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data ?? null;
}

/** آستانه‌ی هشدارِ موجودیِ کم — پیش‌فرضِ سرور ۵ است (lib/db.js) */
export function lowStockThreshold(shop: ShopInfo | null): number {
  const n = Number(shop?.lowStockThreshold);
  return Number.isFinite(n) && n > 0 ? n : 5;
}
