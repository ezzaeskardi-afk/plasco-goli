// ============================================================
// تایپ‌های API — دقیقاً منطبق با پاسخ‌های واقعی Express
// ============================================================

export interface Product {
  id: number;
  title: string;
  description?: string;
  price: number;
  oldPrice: number;
  discountPercent: number;
  badge: string;
  stock: number;
  category: string;
  icon: string;
  image: string | null;
  images: string[];
  specs: { k: string; v: string }[];
  rating: { count: number; avg: number } | null;
  wholesale?: unknown;
}

export interface ProductListMeta {
  total: number;
  page: number;
  pages: number;
  limit: number;
  hasMore: boolean;
  fuzzy: boolean;
  suggestion: string;
}

export interface ProductListResponse {
  products: Product[];
  meta: ProductListMeta;
}

export interface ProductDetailResponse {
  product: Product;
}

export interface FacetCategory {
  category: string;
  n: number;
  icon: string;
}

export interface FacetResponse {
  minPrice: number;
  maxPrice: number;
  categories: FacetCategory[];
}

export interface CategoriesResponse {
  categories: ShopCategory[];
}

export interface ShopCategory {
  id: number;
  name: string;
  icon: string;
  sort: number;
  count: number;
}

export interface ShopInfo {
  shopName: string;
  shopPhone: string;
  announcement: string;
  shopOpen: boolean;
  promoText: string;
  promoCode: string;
  lowStockThreshold: number;
  freeShippingOver: number;
  shippingCost: number;
}

// ============================================================
// سبد خرید
// ============================================================

// تخفیف عمده‌ی یک قلم — خروجی wholesaleInfo در backend/lib/db.js:737.
// وقتی محصول تخفیف عمده ندارد، سرور `null` می‌فرستد.
export interface CartItemWholesale {
  minQty: number;
  discount: number;
  unitPrice: number;
  /** آیا با تعدادِ فعلیِ همین قلم فعال شده است */
  applies: boolean;
}

export interface CartItem {
  productId: number;
  title: string;
  icon: string;
  image: string | null;
  price: number;
  oldPrice: number;
  discountPercent: number;
  qty: number;
  maxQty: number;
  stock: number;
  hasDiscount: boolean;
  savings: number;
  notice?: string;
  // این چهار فیلد را سرور همیشه می‌فرستد (routes/cart.js:24-46) ولی در نوع
  // نیامده بودند، پس سبدِ Next قیمتِ عمده را نادیده می‌گرفت و جمعِ هر ردیف را
  // نشان نمی‌داد: مشتریِ عمده قیمتِ خرده می‌دید.
  unitPrice: number;
  subtotal: number;
  wholesale: CartItemWholesale | null;
  wholesaleSavings: number;
}

// کوپنِ نشسته روی سبد. سرور **آبجکت** می‌فرستد (routes/cart.js:68)، نه رشته.
// نوعِ قبلی `string | null` بود و صفحه‌ی سبد با اعمالِ هر کد تخفیفِ معتبر
// می‌ترکید (React error #31: «آبجکت فرزندِ معتبر نیست»).
export interface CartCoupon {
  code: string;
  discount: number;
}

export interface CartResponse {
  items: CartItem[];
  total: number;
  count: number;
  savings: number;
  coupon: CartCoupon | null;
  discount: number;
  shippingCost: number;
  freeShippingOver: number;
  shippingFee: number;
  freeShippingGap: number;
  payable: number;
  /** پیامِ سرور درباره‌ی تغییری که خودش در سبد داد (کالای حذف‌شده، تعدادِ اصلاح‌شده) */
  notice?: string;
  /** کدِ تخفیف دیگر صدق نمی‌کند و سرور برش داشت */
  couponNotice?: string;
}

// ============================================================
// احراز هویت
// ============================================================

export interface ChallengeResponse {
  token: string;
}

export interface OtpRequestResponse {
  ok: boolean;
  message?: string;
  cooldown?: number;
}

export interface OtpVerifyResponse {
  ok: boolean;
  user: User;
  fullName: string | null;
  isNew: boolean;
}

export interface PasswordLoginResponse {
  ok: boolean;
  user: User;
  remaining?: number;
}

export interface User {
  id: number;
  phone: string;
  fullName: string;
  isAdmin: boolean;
  isStaff: boolean;
  hasPassword: boolean;
}

export interface AuthMeResponse {
  user: User | null;
}

export interface HasPasswordResponse {
  hasPassword: boolean;
}

// ============================================================
// آدرس
// ============================================================

export interface Address {
  id: number;
  userId: number;
  fullName: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
}

// ============================================================
// سفارش
// ============================================================

export interface Order {
  id: number;
  userId: number;
  items: OrderItem[];
  address: Address;
  total: number;
  shippingFee: number;
  couponCode: string;
  discount: number;
  status: string;
  authority: string;
  refId: string;
  paymentUrl: string;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  trackingCode: string;
  cancelReason: string;
  returnReason: string;
  adminNote: string;
  userPhone?: string;
  userName?: string;
  itemCount?: number;
  city?: string;
  province?: string;
}

export interface OrderItem {
  productId: number;
  title: string;
  price: number;
  qty: number;
  image?: string;
}

// دقیقاً همان چیزی که backend/routes/orders.js:111 برمی‌گرداند.
// قبلاً اینجا `{ ok, order }` نوشته شده بود که بک‌اند هیچ‌وقت نمی‌فرستد؛ نتیجه
// این بود که checkout به شاخه‌ی `result.order` می‌رفت، مقدارش undefined بود و
// دکمه‌ی «ثبت سفارش» بی‌صدا هیچ کاری نمی‌کرد.
export interface CreateOrderResponse {
  orderId: number;
  paymentUrl: string | null;
  testMode?: boolean;
  /** درخواستِ تکراری با همان Idempotency-Key: همان سفارشِ قبلی برگشته */
  repeated?: boolean;
  status?: string;
}

/** GET /api/orders/:id — بک‌اند سفارش را داخلِ یک پوشش برمی‌گرداند */
export interface OrderDetailResponse {
  order: Order;
}

/** POST /api/orders/:id/reorder */
export interface ReorderResponse {
  added: number;
  /** کالاهایی که به سبد اضافه نشدند و دلیلش — باید به مشتری *گفته* شود */
  skipped: { title: string; reason: string }[];
}

export interface TrackOrderResponse {
  order: Order;
}

export interface OrdersResponse {
  orders: Order[];
}

// ============================================================
// CRM
// ============================================================

export interface CrmSummary {
  totalCustomers: number;
  tagged: number;
  openTasks: number;
  dueTasks: number;
  totalNotes: number;
}

export interface CrmTag {
  id: number;
  name: string;
  color: string;
}

export interface CrmCustomer {
  id: number;
  phone: string;
  fullName: string;
  isAdmin: boolean;
  isStaff: boolean;
  createdAt: string;
  paidOrders: number;
  totalSpent: number;
  lastOrderAt: string | null;
  tags: string[];
}

export interface CrmCustomerList {
  customers: CrmCustomer[];
  total: number;
  limit: number;
  offset: number;
}

export interface CrmScore {
  recency: number;
  frequency: number;
  monetary: number;
  health: number;
  segment: string;
  updatedAt: string;
}

export interface CrmNote {
  id: number;
  body: string;
  byName: string;
  createdAt: string;
}

export interface CrmTask {
  id: number;
  title: string;
  done: boolean;
  dueAt: string | null;
  byName: string;
  createdAt: string;
}

export interface CrmActivity {
  id: number;
  action: string;
  detail: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface CrmCustomerDetail {
  id: number;
  phone: string;
  fullName: string;
  isAdmin: boolean;
  isStaff: boolean;
  createdAt: string;
  orders: Order[];
  tags: CrmTag[];
  notes: CrmNote[];
  tasks: CrmTask[];
  score: CrmScore;
  activities: CrmActivity[];
}

export interface CrmAdvancedSummary {
  totalCustomers: number;
  activeBuyers: number;
  vipCount: number;
  atRiskCount: number;
  dormantCount: number;
  avgHealth: number;
  totalRevenue: number;
  avgOrderValue: number;
  retentionRate: number;
}

export interface CrmSegmentStat {
  segment: string;
  label: string;
  count: number;
  pct: number;
  avgSpent: number;
  totalSpent: number;
}

export interface CrmRevenueMonth {
  month: string;
  label: string;
  revenue: number;
  orders: number;
  customers: number;
  avgOrder: number;
}

export interface CrmTopCustomer {
  id: number;
  phone: string;
  fullName: string;
  orders: number;
  spent: number;
  lastOrder: string;
  health: number;
  segment: string;
}

// ============================================================
// خرید عمده (B2B) — POST /api/wholesale/request
// ============================================================

export interface WholesaleRequestInput {
  name: string;
  phone: string;
  productId?: number | null;
  productTitle?: string;
  quantity?: number;
  note?: string;
}

export interface WholesaleRequestResponse {
  ok: boolean;
  id: number;
  message: string;
}
