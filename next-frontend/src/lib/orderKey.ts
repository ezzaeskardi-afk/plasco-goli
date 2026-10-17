// ============================================================
// کلید یکتای سفارش — کدام «تلاش» کدام کلید را می‌گیرد
// ============================================================
// چرا این ماژول وجود دارد: بک‌اند با هدر Idempotency-Key از دوبار ساخته شدنِ
// سفارش جلوگیری می‌کند (routes/orders.js:41-49) — ولی تنها به شرطی که
// «تلاشِ دوباره‌ی همان سفارش» با همان کلید برود. صفحه‌ی پرداخت پیش‌تر در هر
// تلاش یک کلید تازه می‌ساخت، پس اگر پاسخِ اولین ثبت گم می‌شد (timeout، قطع
// اینترنت وسطِ پرداخت، رفرش)، دکمه‌ی بعدی یعنی سفارش دوم و رزروِ دوباره‌ی
// موجودی — دقیقاً همان چیزی که مکانیزمِ idempotency برای جلوگیری از آن ساخته
// شده بود.
//
// قاعده: کلید به «امضا»ی سفارش گره می‌خورد. تا وقتی امضا (آدرس + کالاها +
// کد تخفیف) همان است، تلاش‌های پیاپی همان کلید را می‌فرستند؛ به‌محضِ تغییرِ
// امضا (مشتری آدرس را عوض کرد یا کدِ تخفیف عوض شد)، کلید می‌چرخد — وگرنه
// سرور سفارشِ قبلی را برمی‌گرداند و تغییرِ مشتری نادیده می‌ماند.
//
// ماژول عمداً بدونِ import است (نه از api، نه از React): رفتارش خالص است و
// `src/lib/orderKey.test.ts` هم همان رفتار و هم سیم‌کشیِ صفحه را قفل می‌کند.

export type OrderSignatureInput = {
  addressId: number;
  items: Array<{ productId: number; qty: number }>;
  couponCode?: string | null;
};

/** امضای سفارش — «چه چیزی» سفارش می‌شود، به‌ترتیبی که از ترتیبِ سبد مستقل باشد. */
export function orderSignature(input: OrderSignatureInput): string {
  const items = [...input.items]
    .map((i) => `${i.productId}x${i.qty}`)
    .sort()
    .join(",");
  return `${input.addressId}|${items}|${input.couponCode || ""}`;
}

export type OrderKeyStore = {
  /** کلیدِ همین امضا؛ اولین بار می‌سازد و بعد از آن همان را نگه می‌دارد. */
  keyFor(signature: string): string;
  /** دور ریختنِ کلیدِ فعلی (مثلاً بعد از ثبتِ موفق). */
  reset(): void;
};

export function createOrderKeyStore(makeKey: () => string): OrderKeyStore {
  let current: { signature: string; key: string } | null = null;
  return {
    keyFor(signature: string): string {
      if (!current || current.signature !== signature) {
        current = { signature, key: makeKey() };
      }
      return current.key;
    },
    reset(): void {
      current = null;
    },
  };
}
