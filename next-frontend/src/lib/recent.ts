// ============================================================
// «اخیراً دیده‌شده» — حافظه‌ی محلیِ مرورگر
// ============================================================
// همتای pushRecent/recentIds در frontend/js/common.js:937-964. فقط شناسه‌ها
// ذخیره می‌شوند (نه آبجکتِ محصول) تا قیمت/موجودیِ کهنه از کشِ localStorage
// به کاربر نشان داده نشود؛ خودِ محصولات موقعِ نمایش از
// GET /api/products/by-ids تازه گرفته می‌شوند و حذف‌شده‌ها بی‌صدا می‌افتند.

const KEY = "pg_recent";
const MAX = 12;

export function pushRecent(id: number): void {
  if (typeof window === "undefined") return;
  try {
    const ids = getRecentIds().filter((x) => x !== id);
    ids.unshift(id);
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {
    // حالتِ ناشناس/پر بودنِ سهمیه — «اخیراً دیده‌شده» حیاتی نیست
  }
}

export function getRecentIds(exceptId?: number): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ids)) return [];
    return ids
      .filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0)
      .filter((x) => x !== exceptId)
      .slice(0, MAX);
  } catch {
    return [];
  }
}
