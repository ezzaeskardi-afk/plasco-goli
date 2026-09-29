// ============================================================
// نرمال‌سازیِ کلیدهای کوئریِ صفحهٔ محصولات
// ============================================================
// چرا: نسخهٔ Express این صفحه با `cat`, `min`, `max`, `inStock` کار می‌کرد و
// نسخهٔ Next با `category`, `minPrice`, `maxPrice`, `inStockOnly`. یعنی هر
// نشانیِ قدیمی — بوکمارک، نتیجهٔ گوگل، لینکی که در واتساپ دست‌به‌دست شده —
// روی مبدأِ Next فیلترش بی‌صدا گم می‌شد. صفحه باز می‌شد ولی *بی‌فیلتر*، و این
// بدترین حالت است: مشتری فکر می‌کند آن دسته خالی است، نه اینکه فیلتر نخورده.
//
// راه‌حل: کلیدهای قدیمی هم خوانده می‌شوند، ولی همهٔ لینک‌هایی که خودِ سایت
// می‌سازد با نام‌های تازه ساخته می‌شوند تا یکدست بمانند.

export type RawQuery = Record<string, string | string[] | undefined>;

export interface ListingParams {
  page: number;
  sort?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly: boolean;
  q?: string;
}

/** نگاشتِ کلیدهای عصرِ Express به کلیدهای امروزی (فقط برای مستندسازی/تست). */
export const LEGACY_QUERY_KEYS: Record<string, string> = {
  cat: "category",
  min: "minPrice",
  max: "maxPrice",
  inStock: "inStockOnly",
};

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const num = (v?: string): number | undefined => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * `raw` همان `searchParams`ِ صفحه است: می‌تواند کلیدهای تازه داشته باشد،
 * کلیدهای قدیمی، یا هر دو (تازه اولویت دارد).
 */
export function normalizeListingQuery(raw: RawQuery): ListingParams {
  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = first(raw[k]);
      if (v !== undefined && v !== "") return v;
    }
    return undefined;
  };

  let minPrice = num(get("minPrice", "min"));
  let maxPrice = num(get("maxPrice", "max"));
  // بازهٔ وارونه («از ۵۰۰ تا ۱۰۰») همین‌جا صاف می‌شود — همتای `readUrl` در
  // `products.js` نسخهٔ Express. سرور هم با آن کنار می‌آید (نتیجهٔ خالی)، ولی
  // مشتری فکر می‌کند سایت خراب است نه اینکه خودش دو عدد را جابه‌جا نوشته.
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  const pageRaw = parseInt(get("page") || "", 10);

  return {
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    sort: get("sort"),
    category: get("category", "cat"),
    minPrice,
    maxPrice,
    inStockOnly: get("inStockOnly", "inStock") === "1",
    q: get("q"),
  };
}

/**
 * رشتهٔ کوئریِ کانونیکال — فقط کلیدهای امروزی و بدونِ مقادیرِ پیش‌فرض.
 * برای لینکِ canonical و هر لینکی که خودِ سایت می‌سازد.
 */
export function canonicalListingQuery(p: ListingParams): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.category) sp.set("category", p.category);
  if (p.minPrice !== undefined) sp.set("minPrice", String(p.minPrice));
  if (p.maxPrice !== undefined) sp.set("maxPrice", String(p.maxPrice));
  if (p.inStockOnly) sp.set("inStockOnly", "1");
  if (p.sort) sp.set("sort", p.sort);
  if (p.page > 1) sp.set("page", String(p.page));
  return sp.toString();
}
