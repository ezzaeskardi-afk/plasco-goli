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
  category: string; // نام دسته (متن، نه id)
  icon: string;
  image: string | null; // مسیر عکس مثل "/picture/products/..."
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

/** پاسخ API /products/:id */
export interface ProductDetailResponse {
  product: Product;
}

export interface FacetCategory {
  category: string; // نام دسته
  n: number; // تعداد
  icon: string;
}

export interface FacetResponse {
  minPrice: number;
  maxPrice: number;
  categories: FacetCategory[];
}

/** پاسخ API /shop/categories */
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

/** پاسخ API /shop/info */
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
}

export interface CartResponse {
  items: CartItem[];
  total: number;
  shippingFee: number;
  freeShippingThreshold: number;
  gap: number;
  payable: number;
  couponCode: string;
  discount: number;
}