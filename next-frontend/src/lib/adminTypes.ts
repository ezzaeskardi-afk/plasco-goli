// ============================================================
// تایپ‌های پنل مدیریت — منطبق با پاسخ‌های واقعیِ routes/admin.js
// ============================================================
// این تایپ‌ها با خواندنِ خودِ کد حدس زده نشده‌اند: توابع lib/db.js روی یک کپیِ
// دیتابیس اجرا شدند و شکلِ خروجی مستقیماً از JSON واقعی گرفته شده. دلیلش این
// است که در همین پروژه دو بار تایپِ خیالی دردسر ساخته بود — یک بار
// `CreateOrderResponse` که `{ok, order}` اعلام می‌کرد و سرور `{orderId}`
// می‌فرستاد، و یک بار `getRelatedProducts` که آرایه اعلام می‌کرد و سرور
// `{products}` می‌فرستاد. هر دو بی‌صدا کار می‌کردند و پیدا کردنشان سخت بود.

// ============================================================
// داشبورد — GET /api/admin/overview
// ============================================================

/** خروجی getAdminStats (lib/db.js:1679). نام‌ها snake_case هستند چون از SQL می‌آیند. */
export interface AdminStats {
  today_sales: number;
  today_orders: number;
  week_sales: number;
  month_sales: number;
  total_sales: number;
  total_orders: number;
  awaiting_shipment: number;
  in_transit: number;
  pending_payment: number;
  failed_orders: number;
  canceled_orders: number;
  return_requests: number;
  pending_reviews: number;
  today_visits: number;
  total_users: number;
  new_users_week: number;
  total_products: number;
  draft_products: number;
  low_stock: number;
  out_of_stock: number;
  inventory_value: number;
  wish_count: number;
  /** میانگین ارزش سفارش — خودِ سرور حساب می‌کند */
  avg_order: number;
}

export interface SalesPoint {
  /** تاریخِ محلی به شکل YYYY-MM-DD */
  day: string;
  orders: number;
  sales: number;
}

export interface TopProduct {
  id: number;
  title: string;
  qty: number;
  revenue: number;
}

export interface CategoryShare {
  category: string;
  revenue: number;
}

export interface TopCustomer {
  id: number;
  phone: string;
  fullName: string;
  orders: number;
  spent: number;
}

export interface LowStockItem {
  id: number;
  title: string;
  category: string;
  stock: number;
  price: number;
  image: string | null;
  icon: string;
}

export interface WishedOutOfStock {
  id: number;
  title: string;
  stock: number;
  /** چند نفر این کالا را در علاقه‌مندی دارند = تقاضای از‌دست‌رفته */
  wishers: number;
}

export interface ActivityEntry {
  id: number;
  action: string;
  target: string;
  detail: string;
  at: string;
  by: string;
}

export interface AdminOverview {
  stats: AdminStats;
  series: SalesPoint[];
  topProducts: TopProduct[];
  categories: CategoryShare[];
  topCustomers: TopCustomer[];
  lowStock: LowStockItem[];
  wishedOutOfStock: WishedOutOfStock[];
  recentActivity: ActivityEntry[];
  /** درخواست‌های عمده‌ی دیده‌نشده — بجِ کنارِ نوار */
  newWholesaleRequests: number;
  metrics: Record<string, unknown>;
}

// ============================================================
// سفارش‌ها — GET /api/admin/orders
// ============================================================

/** وضعیت‌هایی که سرور می‌شناسد (VALID_STATUS در routes/admin.js:427 + failed) */
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "shipped"
  | "delivered"
  | "canceled"
  | "return_requested"
  | "returned"
  | "failed";

export interface OrderAddress {
  id: number;
  userId: number;
  fullName: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
}

export interface AdminOrderItem {
  productId: number;
  title: string;
  price: number;
  qty: number;
  image?: string;
}

/**
 * سفارش در نمای ادمین — serializeOrder به‌علاوه‌ی شماره/نام مشتری.
 *
 * توجه: `shippedAt` واقعاً در پاسخ نیست (فهرستِ کلیدهای واقعی این را نشان داد:
 * createdAt، paidAt و deliveredAt هستند و بس). پس اینجا هم اعلام نمی‌شود تا
 * کسی روی فیلدی که همیشه undefined است حساب نکند.
 */
export interface AdminOrder {
  id: number;
  userId: number;
  items: AdminOrderItem[];
  address: OrderAddress;
  total: number;
  shippingFee: number;
  couponCode: string;
  discount: number;
  status: OrderStatus;
  authority: string;
  refId: string;
  paymentUrl: string;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  adminNote: string;
  trackingCode: string;
  cancelReason: string;
  returnReason: string;
  userPhone: string;
  userName: string;
}

export interface OrderStatusCounts {
  all: number;
  [status: string]: number;
}

export interface AdminOrdersResponse {
  orders: AdminOrder[];
  total: number;
  /** جمعِ مبلغ سفارش‌های پرداخت‌شده در همان فیلتر */
  sum: number;
  counts: OrderStatusCounts;
}

export interface OrderMutationResponse {
  ok: boolean;
  order: AdminOrder;
}

// ============================================================
// انبار — GET /api/admin/inventory
// ============================================================

/**
 * ردیفِ انبار — خروجی getProductsWithSales (lib/db.js:2486).
 *
 * دو فیلد اینجا آرایه نیستند و همین یک تله‌ی واقعی است: `images` و `specs`
 * **رشته‌ی JSON** خام از دیتابیس می‌آیند، نه آرایه. اگر مستقیم `.map` رویشان
 * بزنی می‌ترکد. در نمای انبار به آن‌ها دست نمی‌زنیم، ولی تایپ باید راست بگوید.
 */
export interface InventoryRow {
  id: number;
  category: string;
  icon: string;
  image: string | null;
  title: string;
  description: string;
  price: number;
  badge: string;
  stock: number;
  created_at: string;
  updated_at: string;
  /** رشته‌ی JSON — نه آرایه */
  images: string;
  /** رشته‌ی JSON — نه آرایه */
  specs: string;
  old_price: number;
  published: number;
  import_batch: string;
  wholesale_min_qty: number;
  wholesale_discount: number;
  soldQty: number;
  revenue: number;
  wishers: number;
  waiting: number;
}

export interface InventoryResponse {
  products: InventoryRow[];
  lowStock: LowStockItem[];
  wishedOutOfStock: WishedOutOfStock[];
}

/** PUT /api/admin/products/:id — همه‌ی فیلدها اختیاری‌اند (سرور با مقدار قبلی ادغام می‌کند) */
export interface ProductUpdateInput {
  title?: string;
  category?: string;
  description?: string;
  price?: number;
  /** قیمت خط‌خورده؛ ۰ یعنی تخفیف نیست. باید از price بیشتر باشد. */
  oldPrice?: number;
  stock?: number;
  badge?: string;
  icon?: string;
  image?: string | null;
  images?: string[];
  specs?: { k: string; v: string }[];
  wholesaleMinQty?: number;
  wholesaleDiscount?: number;
}

export interface ProductMutationResponse {
  ok: boolean;
  product: unknown;
}

/** POST /api/admin/products/:id/published */
export interface PublishResponse {
  ok: boolean;
  published: number;
  product: unknown;
}

// ============================================================
// نظرات — GET /api/admin/reviews
// ============================================================

export interface AdminReview {
  id: number;
  productId: number;
  rating: number;
  body: string;
  isBuyer: boolean;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  userName: string;
  /** شماره‌ی نویسنده — فقط در نمای ادمین می‌آید */
  userPhone: string;
  productTitle: string;
}

export interface AdminReviewsResponse {
  reviews: AdminReview[];
  counts: { all: number; pending: number; approved: number; rejected: number };
}

export interface ReviewMutationResponse {
  ok: boolean;
  review: AdminReview;
}

// ============================================================
// کدهای تخفیف — routes/admin.js:574
// ============================================================

/** خروجی serializeCoupon (lib/db.js:2258) — نام‌ها camelCase هستند، نه snake_case */
export interface Coupon {
  id: number;
  code: string;
  type: "percent" | "fixed";
  /** درصد (۱–۹۰) یا مبلغِ تومانی (حداقل ۱۰۰۰) — بستگی به `type` دارد */
  value: number;
  /** حداقلِ مبلغِ سبد؛ ۰ = بدون شرط */
  minTotal: number;
  /** سقفِ تخفیفِ **درصدی**؛ ۰ = بدون سقف. برای `fixed` بی‌معناست. */
  maxDiscount: number;
  /** YYYY-MM-DD یا null = بدون انقضا */
  expiresAt: string | null;
  /** سقفِ کلِ استفاده؛ ۰ = نامحدود */
  usageLimit: number;
  /** سقفِ هر مشتری؛ ۰ = نامحدود */
  perUserLimit: number;
  active: boolean;
  createdAt: string;
  /**
   * تعداد استفادهِ واقعی — سفارش‌های با همین کد که failed/canceled/
   * pending_payment نیستند و بعد از ساختِ کد ثبت شده‌اند (stmtCouponUses).
   */
  uses: number;
}

export interface CouponsResponse {
  coupons: Coupon[];
}

/**
 * ورودیِ ساختِ کد تخفیف.
 *
 * `code` فقط در ساخت فرستاده می‌شود: در `PUT` هیچ‌جا خوانده نمی‌شود
 * (`cleanCouponInput(body, false)` اعتبارسنجیِ کد را رد می‌کند و کوئریِ
 * `adminUpdateCoupon` هم ستونِ `code` را ندارد). یعنی کد بعد از ساخت
 * **تغییرناپذیر** است — و فرمِ ویرایش هم باید همین را نشان بدهد، وگرنه مدیر یک
 * کدِ تازه تایپ می‌کند، ذخیره می‌زند و بی‌صدا هیچ اتفاقی نمی‌افتد.
 */
export interface CouponInput {
  code?: string;
  type: "percent" | "fixed";
  value: number;
  minTotal: number;
  maxDiscount: number;
  /** '' یعنی بدون انقضا */
  expiresAt: string;
  usageLimit: number;
  perUserLimit: number;
  active: boolean;
}

export interface CouponMutationResponse {
  ok: boolean;
  coupon: Coupon;
}

// ============================================================
// مشتری‌ها — routes/admin.js:227
// ============================================================

/**
 * یک ردیف از `getAllUsers()` (lib/db.js:1100) — فهرستِ مشتری‌ها + آمار خرید.
 *
 * دو مرزِ مهم که از خودِ کوئری می‌آید (`stmtAllUsers`) و شکلِ این تایپ را
 * تعیین کرده:
 *
 *  ۱. `paidOrders` و `totalSpent` فقط سفارش‌های `paid/shipped/delivered/`
 *     `return_requested` را می‌شمرند. یعنی سفارش در انتظارِ پرداخت، ناموفق و
 *     لغوشده در `totalSpent` نمی‌آیند. پس مشتری‌ای که «۰ سفارش» دارد ممکن است
 *     یک سفارشِ نیمه‌کاره داشته باشد — و این عمدی است: آمارِ خرید باید فقط
 *     پولی را بشمارد که واقعاً گرفته شده.
 *  ۲. `lastOrderAt` با `MAX` روی همان شرط است، پس `null` یعنی «هیچ‌وقت خریدِ
 *     موفق نداشته»، نه «هیچ‌وقت سفارش نداده».
 *
 * `totalSpent` همیشه عدد است (COALESCE(...,0)) ولی `lastOrderAt` می‌تواند
 * null باشد — تایپی که این را نگوید باعث می‌شود `faDateTime(null)` بی‌خبر
 * رد شود و «—» نشان بدهد.
 */
export interface AdminUser {
  id: number;
  phone: string;
  /** می‌تواند رشته‌ی خالی باشد — نام اختیاری است */
  fullName: string;
  isAdmin: boolean;
  isStaff: boolean;
  /** کاربر با رمزِ شخصی هم می‌تواند وارد شود، نه فقط با کد پیامکی */
  hasPassword: boolean;
  createdAt: string;
  /** تعداد سفارش‌های موفق (شاملِ مرجوعی) */
  paidOrders: number;
  /** مجموعِ مبلغِ همان سفارش‌ها به تومان */
  totalSpent: number;
  lastOrderAt: string | null;
}

/**
 * `GET /api/admin/users` — **بدون پارامتر**.
 *
 * این مسیر نه جستجو دارد نه صفحه‌بندی: کلِ جدولِ کاربران را در یک پاسخ
 * می‌دهد (`res.json({ users: getAllUsers() })`). پس هر جستجو/صفحه‌بندی در
 * نمای مشتری‌ها سمتِ مرورگر انجام می‌شود و *بارِ شبکه را کم نمی‌کند* — فقط
 * تعداد ردیف‌های روی صفحه را. فرقش برای مدیر محسوس است ولی برای سرور نه.
 */
export interface AdminUsersResponse {
  users: AdminUser[];
}

/**
 * `POST /api/admin/users/:id/staff`
 *
 * تنها جای پنل که نقشِ کارمند داده/گرفته می‌شود و **فقط ادمین** می‌تواند
 * صدا بزند: `requireAdmin` عبور می‌کند ولی خودِ هندلر برای کارمند ۴۰۳
 * می‌دهد. پس ۴۰۳ در این تابع یعنی «تو ادمین نیستی»، نه «این مسیر نیست».
 */
export interface StaffMutationResponse {
  ok: boolean;
  isStaff: boolean;
}

// ============================================================
// تنظیمات فروشگاه — routes/admin.js:1156
// ============================================================

/**
 * خروجیِ `getSettings()` (lib/db.js:1923).
 *
 * ⚠️ **همه‌ی مقادیر رشته‌اند، حتی عددی‌ها.** جدولِ `settings` یک ستونِ
 * `value TEXT` دارد و پیش‌فرض‌ها هم رشته‌اند (`shipping_cost: '0'`). این با
 * تایپِ عمومیِ `ShopInfo` فرق دارد که همان مقادیر را برای مرورگر به
 * `number`/`boolean` تبدیل می‌کند (`shippingCost: number`, `shopOpen: boolean`).
 * پس نباید `ShopInfo` را برای فرمِ پنل استفاده کرد: فرم باید همان چیزی را
 * نگه دارد که دیتابیس دارد، وگرنه یک `0` عددی به‌جای رشته می‌رود و ذخیره‌سازی
 * می‌تواند رشته‌ی `"0"` را با `0` قاطی کند.
 */
export interface AdminSettings {
  shop_name: string;
  shop_phone: string;
  shop_address: string;
  /** تومان؛ `"0"` یعنی «ارسال رایگان» */
  shipping_cost: string;
  /** تومان؛ `"0"` یعنی بدون شرطِ مبلغ */
  free_shipping_over: string;
  /** کالای کمتر از این عدد در «نیاز به توجه» می‌آید */
  low_stock_threshold: string;
  /** نوارِ بالای سایت؛ `""` یعنی بدون نوار */
  announcement: string;
  /**
   * `"1"` = باز، `"0"` = بسته.
   *
   * ⚠️ این **رشته** است و نه بولینِ عمدی: مسیرِ ثبتِ سفارش
   * (`routes/orders.js:37`) شرطِ `getSetting('shop_open') === '0'` را چک می‌کند —
   * یعنی فقط رشته‌ی `"0"` فروشگاه را می‌بندد. فرستادنِ `false` مقدارِ `"false"`
   * را ذخیره می‌کند (`setSettingsTx` → `String(v)`)، آن شرط نادرست می‌شود و
   * فروشگاه **باز می‌ماند** در حالی که پنل می‌گوید بسته شد. یک سوئیچِ خاموشیِ
   * بی‌صدا. پس ورودیِ سرور فقط `"1"`/`"0"` است.
   */
  shop_open: string;
  /** متنِ بنرِ جشنواره‌ی صفحه‌ی اصلی؛ `""` یعنی بنر پنهان */
  promo_text: string;
  /** کدِ تخفیفی که روی بنر نمایش داده می‌شود (اختیاری) */
  promo_code: string;
}

export interface SettingsResponse {
  settings: AdminSettings;
}

/**
 * ورودیِ ذخیره — **جزئی** و اختیاری.
 *
 * سرور فقط کلیدهایی را می‌نویسد که در `SETTING_DEFAULTS` باشند
 * (`if (k in SETTING_DEFAULTS)`)، پس کلیدِ ناشناس بی‌صدا رد می‌شود و کلیدِ
 * نیامده دست نمی‌خورد. یعنی «فقط فیلدهای عوض‌شده» امن است — و مزیتش این است
 * که `note()` در رویدادها فقط همان‌ها را ثبت می‌کند.
 */
export type AdminSettingsInput = Partial<AdminSettings>;
