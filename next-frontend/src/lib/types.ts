// ============================================================
// تایپ‌های API — منطبق با پاسخ‌های Express
// ============================================================

export interface Product {
  id: number;
  title: string;
  price: number;
  oldPrice: number;
  discountPercent: number;
  stock: number;
  categoryId: number;
  category?: string;
  image: string | null;
  icon: string;
  rating: number | null;
  reviewCount: number;
  isDraft?: boolean;
  createdAt?: string;
}

export interface ProductListResponse {
  products: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ShopInfo {
  siteName: string;
  siteDescription: string;
  shippingFee: number;
  freeShippingThreshold: number;
  phone: string;
  address: string;
  isClosed: boolean;
  closedMessage: string;
  bannerText: string;
  bannerActive: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface FacetResponse {
  minPrice: number;
  maxPrice: number;
  categories: Category[];
}

export interface User {
  id: number;
  phone: string;
  fullName: string;
  isAdmin: boolean;
  isStaff: boolean;
  hasPassword: boolean;
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