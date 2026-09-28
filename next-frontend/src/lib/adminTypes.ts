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

// ============================================================
// وضعیت سیستم — GET /api/admin/system-status
// ============================================================
// عمداً نگاشتِ تنبل نیست: این نما درباره‌ی **سلامت** است، پس اگر شکلی که
// نمایش می‌دهیم با شکلی که سرور می‌فرستد یکی نباشد، ارزشِ کلِ نما از بین
// می‌رود (یک صفحه‌ی «همه‌چیز خوب است» که عددهایش اشتباه است، از نبودنش
// بدتر است). شکل‌ها با اجرای واقعیِ endpoint روی یک سرورِ سندباکس گرفته شدند.

export interface AdminBackupFile {
  name: string;
  sizeKb: number;
  /** ISO — از mtime فایل، پس با منطقه‌ی زمانی محلی نمایش داده می‌شود */
  createdAt: string;
}

/** قلبِ این نما: سلامتِ خودِ دیتابیس و آخرین بکاپ */
export interface AdminDbHealth {
  ok: boolean;
  products: number;
  /** زمانِ یک SELECT واقعی — کندیِ دیسک را قبل از اینکه کاربر حسش کند نشان می‌دهد */
  queryMs: number;
  sizeKb: number;
  /** فایلِ WAL. بزرگشدنش یعنی checkpoint گیر کرده (روی پوشه‌ی همگام‌شده پیش می‌آید) */
  walKb: number;
  walWarn: boolean;
  /** `null` یعنی هیچ بکاپی وجود ندارد — نه «قدیمی است» */
  lastBackup: { file: string; ageHours: number } | null;
  /** بیش از ۴۸ ساعت بدون بکاپ */
  backupStale: boolean;
}

/** خروجیِ PRAGMA quick_check — فقط با درخواستِ صریح (`?deep=1`) اجرا می‌شود */
export interface AdminIntegrity {
  ok: boolean;
  message: string;
}

export interface AdminDbHealthResponse {
  health: AdminDbHealth;
  /** وقتی `deep=1` نفرستاده باشیم `null` است */
  integrity: AdminIntegrity | null;
}

/** متریک‌های درون‌حافظه‌ای سرور — از lib/metrics.js */
export interface AdminMetrics {
  uptimeSeconds: number;
  totalRequests: number;
  slowRequests: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  /** کدِ وضعیت → تعداد، مثلاً `{"200": 1200, "404": 31}` */
  statuses: Record<string, number>;
  topRoutes: AdminRouteMetric[];
  routeCount: number;
}

export interface AdminRouteMetric {
  route: string;
  count: number;
  avgMs: number;
  maxMs: number;
  slow: number;
}

export interface AdminErrorDay {
  day: string;
  errors: number;
  http5xx: number;
}

/**
 * یک گروهِ خطا. `stack` و `reason` از **تازه‌ترین** نمونه می‌آیند (نه اولین)
 * تا تمامِ ردیف یک لحظه را توصیف کند — همان تصمیمی که در lib/error-digest.js
 * گرفته شده.
 */
export interface AdminErrorGroup {
  key: string;
  title: string;
  count: number;
  first: string;
  last: string;
  reason: string;
  stack: string[];
}

export interface AdminErrorsDigest {
  days?: number;
  /** مثل `AdminErrorsResponse.since` می‌تواند `null` باشد (شاخه‌ی خطا) */
  since?: string | null;
  totals: { errors: number; groups?: number; http5xx?: number; today?: number };
  daily?: AdminErrorDay[];
  groups?: AdminErrorGroup[];
  /**
   * اگر خواندنِ پوشه‌ی لاگ شکست بخورد، سرور به‌جای ۵۰۰ این را می‌فرستد.
   * رابط باید نمایش دهدش، وگرنه «۰ خطا» به‌غلط یعنی «همه‌چیز خوب است».
   */
  unavailable?: string;
}

export interface AdminServerInfo {
  uptime: number;
  nodeVersion: string;
  platform: string;
  pid: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
  };
}

export interface AdminSystemStatus {
  server: AdminServerInfo;
  metrics: AdminMetrics;
  health: AdminDbHealth;
  errors: AdminErrorsDigest;
  /** تازه‌ترین اول — از همان پوشه‌ای که دکمه‌ی «بکاپ بگیر» می‌نویسد */
  backups: AdminBackupFile[];
  /** رویدادهای پنل — همان شکلِ ActivityEntry داشبورد */
  adminLog: ActivityEntry[];
}

export interface AdminBackupResponse {
  ok: boolean;
  /** فقط نامِ فایل (بدونِ مسیر) */
  file: string;
}

// ============================================================
// عمده‌فروشی — GET /api/admin/wholesale/requests
// ============================================================
// مسیر `{ requests: listWholesaleRequests(300) }` برمی‌گرداند و آن تابع،
// `SELECT *` روی جدولِ `wholesale_requests` است (lib/db.js:482). پس نام‌های
// فیلدها **snake_case** و عیناً ستون‌های دیتابیس‌اند — نه camelCase مثل
// کوپن‌ها. این تفاوت همان چیزی است که یک تایپِ خیالی را خطرناک می‌کند.

/** سه وضعیتِ ممکن — سرور فقط همین‌ها را در PATCH قبول می‌کند (۴۰۰ در غیر این‌صورت) */
export type WholesaleStatus = "new" | "contacted" | "done";

/**
 * یک درخواستِ خرید عمده.
 *
 * ⚠️ `product_id` و `product_title` و `quantity` و `note` می‌توانند «خالی»
 * باشند: فرمِ عمومی همه‌ی این‌ها را اختیاری می‌فرستد و ستون‌های متنی هم
 * DEFAULT '' دارند. یعنی `quantity: 0` یعنی «تعداد نگفته»، نه «صفر تا».
 * همین‌طور `product_id: null` یعنی «کالای مشخصی انتخاب نشده».
 */
export interface WholesaleRequest {
  id: number;
  /** نامِ تماس — اجباری است */
  name: string;
  phone: string;
  product_id: number | null;
  product_title: string;
  quantity: number;
  note: string;
  status: WholesaleStatus;
  created_at: string;
}

export interface WholesaleRequestsResponse {
  requests: WholesaleRequest[];
}

// ============================================================
// گزارش‌ها — GET /api/admin/reports و /reports/monthly
// ============================================================

/**
 * پاسخِ `/reports?days=`. بازه‌ی روزها در سرور به **۷ تا ۳۶۵** محدود می‌شود
 * (`Math.min(Math.max(...))`)، پس هر عددی بفرستی چیزی بین این دو می‌گیری.
 *
 * `series` همیشه دقیقاً `days` درایه دارد — روزهای بی‌فروش با صفر پر می‌شوند
 * (getSalesSeries)، پس جمع‌زدنِ روی آن معادلِ فروشِ کلِ بازه است.
 *
 * سه برترینِ فهرست‌ها پنجره‌ی خودشان را دارند و به `days` کاری ندارند:
 * `topProducts` روی ۹۰ روزِ اخیر است (TOP_PRODUCTS_WINDOW_DAYS در db.js:1799)
 * و `topCustomers` و `categories` کلِ تاریخِ فروشگاه. یعنی این جدول‌ها با
 * عوض‌کردنِ بازه‌ی نمودار تکان نمی‌خورند — عمدی است، ولی باید در رابط گفته شود
 * وگرنه مدیر فکر می‌کند فیلتر کار نمی‌کند.
 */
export interface AdminReportsResponse {
  days: number;
  series: SalesPoint[];
  topProducts: TopProduct[];
  categories: CategoryShare[];
  topCustomers: TopCustomer[];
  stats: AdminStats;
}

/**
 * یک ماه در گزارشِ ماه‌به‌ماه.
 *
 * `growth` سه حالت دارد و هر سه باید فرق کنند: مثبت، منفی، و **`null`**
 * یعنی «ماهِ قبل صفر بوده» — که درصدِ معنادار ندارد. صفر یعنی «بی‌تغییر».
 */
export interface MonthlySalesRow {
  /** سالِ شمسی (یا میلادی، اگر ICUِ سرور تقویمِ شمسی نداشته باشد) */
  jy: number;
  jm: number;
  /** نامِ ماه، مثلاً «مرداد» */
  name: string;
  /** «مرداد ۱۴۰۵» */
  label: string;
  /** اولین روزِ ماه به شکل YYYY-MM-DD */
  start: string;
  orders: number;
  sales: number;
  customers: number;
  avg: number;
  /** درصدِ رشد نسبت به ماهِ قبل؛ `null` یعنی ماهِ قبل فروشی نبوده */
  growth: number | null;
}

/**
 * پاسخِ `/reports/monthly?months=` — `months` در سرور به ۲ تا ۳۶ محدود می‌شود.
 *
 * ⚠️ `calendar` را باید نشان داد: اگر سروری `full-icu` نداشته باشد، ماه‌ها
 * **میلادی** می‌شوند و برچسبِ «مرداد» دروغ می‌شود. نسخه‌ی Express همین را
 * هشدار می‌داد و بدونِ آن، عددهای غلط بی‌سروصدا باور می‌شوند.
 */
export interface MonthlySalesResponse {
  months: number;
  calendar: "jalali" | "gregorian";
  /** از قدیم به جدید — یعنی `rows[rows.length - 1]` ماهِ جاری است */
  rows: MonthlySalesRow[];
  totals: { orders: number; sales: number; avg: number };
  best: { label: string; sales: number } | null;
}

// ============================================================
// دفتر رویدادها — GET /api/admin/activity
// ============================================================

export interface ActivityResponse {
  activity: ActivityEntry[];
}

// ============================================================
// خطاهای سرور — GET /api/admin/errors
// ============================================================
// همان شکلِ `errorDigest()` (lib/error-digest.js:197). در حالتِ عادی این پنج
// فیلد همیشه هستند؛ فقط شاخه‌ی خطا (پوشه‌ی لاگ خوانده نمی‌شود) `unavailable`
// می‌فرستد و بقیه را ندارد — پس همه اختیاری‌اند.

/**
 * پاسخِ `/errors?days=`. بازه در error-digest به **MAX_DAYS = ۱۴** محدود است
 * (فقط ۱۴ روز لاگ نگه داشته می‌شود)، پس فرستادنِ `days=30` بی‌اثر است.
 *
 * ⚠️ این مسیر — و تنها این مسیر — حتی برای **کارمند** هم ۴۰۳ می‌دهد: stack
 * trace ساختارِ داخلیِ سرور را لو می‌دهد. پس ۴۰۳ اینجا معنایش «کارمندی» است،
 * نه «این مسیر نیست».
 */
export interface AdminErrorsResponse {
  days?: number;
  /**
   * اولین روزِ بازه به شکل YYYY-MM-DD.
   *
   * ⚠️ در شاخه‌ی خطا **`null`** است، نه `undefined` (routes/admin.js:219 در
   * همان `res.json` صریحاً `since: null` می‌فرستد). یک تایپِ `since?: string`
   * این را نمی‌گفت و همین یک تناقضِ خاموش است — همان چیزی که در همین پروژه
   * دو بار دردسر ساخته. حالا هر دو حالت را می‌گوید.
   */
  since?: string | null;
  /** هر چهار عدد در هر دو شاخه (عادی و خطا) می‌آیند، پس همه اجباری‌اند */
  totals: { errors: number; groups: number; http5xx: number; today: number };
  daily?: AdminErrorDay[];
  groups?: AdminErrorGroup[];
  /** پوشه‌ی لاگ خوانده نشد — «۰ خطا» یعنی «نمی‌دانم»، نه «خبری نیست» */
  unavailable?: string;
}

// ============================================================
// ویرایشگرِ محصول — GET/POST/PUT/DELETE /api/admin/products
// ============================================================
// چرا یک تایپِ جدا و نه همان `InventoryRow`: شکلِ خامِ سرور و شکلِ فرم دو چیز
// متفاوت‌اند و قاطی‌کردنشان دقیقاً همان جایی است که باگ می‌سازد —
//
//   • سرور `old_price` می‌فرستد، فرم `oldPrice` می‌خواهد.
//   • `images` و `specs` در دیتابیس **رشته‌ی JSON**‌اند و باید پارس شوند؛
//     `images` در گالری هم می‌تواند `null` یا `""` باشد.
//   • `published` عددِ ۰/۱ است، ولی فرم بولی می‌خواهد.
//
// `toAdminProduct` در `lib/adminApi.ts` همین تبدیل را انجام می‌دهد؛ هر جای
// دیگری که به این تایپِ نرمال‌شده نیاز داشت، از همان تابع رد شود.
export interface AdminProduct {
  id: number;
  title: string;
  category: string;
  description: string;
  price: number;
  /** قیمت خط‌خورده؛ ۰ یعنی تخفیف نیست */
  oldPrice: number;
  stock: number;
  badge: string;
  icon: string;
  /** مسیرِ داخلیِ `/picture/...` یا null */
  image: string | null;
  /** گالری — حداکثر ۸ عکس، جدا از عکسِ کاور */
  images: string[];
  specs: { k: string; v: string }[];
  wholesaleMinQty: number;
  wholesaleDiscount: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * شاخه‌ی خلاصه‌ی پیش‌نویس‌ها که همراهِ فهرست می‌آید.
 *
 * عددها arbitrary نیستند: `getDraftSummary()` در lib/db.js برای هر دستهٔ
 * «چند کالای منتشرنشده» می‌شمارد تا پنل بتواند بگوید «۸۸ پیش‌نویس داری».
 */
export interface ProductDraftSummary {
  drafts?: { total: number; byCategory: { category: string; n: number }[] };
}

export interface AdminProductsResponse extends ProductDraftSummary {
  products: AdminProduct[];
}

/** POST /api/admin/products — برخلاف PUT، همه‌ی فیلدهای لازم اجباری‌اند */
export interface ProductCreateInput {
  title: string;
  category: string;
  description: string;
  price: number;
  oldPrice: number;
  stock: number;
  badge: string;
  icon: string;
  image: string | null;
  images: string[];
  specs: { k: string; v: string }[];
  wholesaleMinQty: number;
  wholesaleDiscount: number;
}

/** پاسخِ DELETE — سرورِ حذف یک شاخه‌ی دوم هم دارد (کالای دارای سابقه‌ی سفارش) */
export interface ProductDeleteResponse {
  ok: boolean;
  /** true یعنی سطر پاک شد؛ false یعنی فقط ناموجود شد (سابقه‌ی سفارش دارد) */
  deleted: boolean;
}

// ============================================================
// عملیات گروهی — POST /api/admin/products/bulk
// ============================================================
export interface ProductBulkResponse {
  ok: boolean;
  /** چند سطر واقعاً عوض شد */
  changed: number;
  /** فهرستِ تازه‌ی انبار — همان لحظه برمی‌گردد تا پنل دوباره درخواست نزند */
  products: InventoryRow[];
}

// ============================================================
// آپلود عکس — POST /api/admin/upload-image
// ============================================================
// بدنه **خام** است (نه multipart و نه JSON): همان بایت‌های فایل با
// `Content-Type` واقعی‌اش. سرور پسوند را از امضای خودِ فایل می‌خواند، نه از این
// هدر — پس هدرِ دروغ چیزی را خراب نمی‌کند، فقط ۴۱۵ می‌گیرد.
export interface UploadImageResponse {
  ok: boolean;
  /** مسیرِ آماده برای گذاشتن در `image`/`images` */
  path: string;
  width: number;
  height: number;
}
