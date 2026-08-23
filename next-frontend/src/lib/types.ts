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
}

export interface CartResponse {
  items: CartItem[];
  total: number;
  count: number;
  savings: number;
  coupon: string | null;
  discount: number;
  shippingCost: number;
  freeShippingOver: number;
  shippingFee: number;
  freeShippingGap: number;
  payable: number;
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

export interface CreateOrderResponse {
  ok: boolean;
  order?: Order;
  paymentUrl?: string;
  error?: string;
  retriable?: boolean;
}

export interface TrackOrderResponse {
  order: Order;
}

export interface OrdersResponse {
  orders: Order[];
}