"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getCart,
  getMe,
  getAddresses,
  createAddress,
  updateAddress,
  createOrder,
  newIdempotencyKey,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useShopInfo } from "@/lib/useShopInfo";
import type { CartResponse, Address, User } from "@/lib/types";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function toToman(n: number): string {
  return `${toFa(n)} تومان`;
}

export function CheckoutContent() {
  const router = useRouter();
  const shop = useShopInfo();
  const shopClosed = Boolean(shop && !shop.shopOpen);
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  // فرم آدرس — برای «جدید» و «ویرایش» یکی است؛ editAddrId مشخص می‌کند کدام
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [editAddrId, setEditAddrId] = useState<number | null>(null);
  const [addrForm, setAddrForm] = useState({
    fullName: "",
    phone: "",
    province: "",
    city: "",
    addressLine: "",
    postalCode: "",
  });

  function startNewAddress() {
    setEditAddrId(null);
    setAddrForm({ fullName: "", phone: "", province: "", city: "", addressLine: "", postalCode: "" });
    setShowAddrForm(true);
  }

  function startEditAddress(a: Address) {
    setEditAddrId(a.id);
    setAddrForm({
      fullName: a.fullName || "",
      phone: a.phone || "",
      province: a.province || "",
      city: a.city || "",
      addressLine: a.addressLine || "",
      postalCode: a.postalCode || "",
    });
    setShowAddrForm(true);
  }

  const loadData = useCallback(async () => {
    try {
      const [cartData, meData, addrData] = await Promise.all([
        getCart(),
        getMe(),
        getAddresses(),
      ]);

      if (!meData.user) {
        router.push("/login?redirect=/checkout");
        return;
      }
      if (!cartData || cartData.items.length === 0) {
        router.push("/cart");
        return;
      }

      setCart(cartData);
      setUser(meData.user);
      setAddresses(addrData);
      if (addrData.length > 0) setSelectedAddrId(addrData[0].id);
    } catch {
      setError("خطا در بارگذاری اطلاعات");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const addr =
        editAddrId != null
          ? await updateAddress(editAddrId, addrForm)
          : await createAddress(addrForm);
      setAddresses((list) =>
        editAddrId != null
          ? list.map((x) => (x.id === addr.id ? addr : x))
          : [...list, addr],
      );
      setSelectedAddrId(addr.id);
      setShowAddrForm(false);
      setEditAddrId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ثبت آدرس");
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddrId) {
      setError("لطفاً یک آدرس انتخاب کنید");
      return;
    }

    setPlacing(true);
    setError("");
    try {
      const result = await createOrder({
        addressId: selectedAddrId,
        idempotencyKey: newIdempotencyKey(),
      });

      // بک‌اند همیشه paymentUrl می‌دهد — حتی در حالت آزمایشی، که آدرسِ
      // برگشتِ خودِ درگاه است (lib/payment.js:51). پس مسیرِ عادی همین است.
      // دکمه را عمداً برنمی‌گردانیم؛ صفحه در حال رفتن به درگاه است.
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }

      // اگر روزی درگاه غیرفعال شد و سفارش بدونِ لینکِ پرداخت ساخته شد،
      // مشتری باید وضعیتش را ببیند، نه یک دکمه‌ی خاموش.
      router.push(`/order-success?orderId=${result.orderId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ثبت سفارش");
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }

  if (!cart || !user) return null;

  const selectedAddr = addresses.find((a) => a.id === selectedAddrId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* ستون آدرس‌ها */}
      <div className="lg:col-span-2 space-y-6">
        {/* فروشگاه بسته — سرور هم در POST /orders سد می‌گذارد؛ اینجا فقط
            زودتر خبر می‌دهیم که مشتری فرم را پر نکند (checkout.js:24) */}
        {shopClosed && (
          <div
            className="rounded-[18px] p-4 text-sm font-bold"
            style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
            role="alert"
          >
            فروشگاه موقتاً بسته است؛ ثبت سفارش فعلاً ممکن نیست.
            {shop?.announcement ? ` ${shop.announcement}` : ""}
          </div>
        )}

        <h2 className="text-lg font-bold" style={{ color: "var(--color-ink)" }}>
          آدرس تحویل
        </h2>

        {addresses.length === 0 && !showAddrForm ? (
          <div className="text-center py-8">
            <p className="text-sm text-ink-soft mb-4">هیچ آدرسی ثبت نشده</p>
            <button
              onClick={startNewAddress}
              className="rounded-full px-5 py-2 text-sm font-bold transition-colors"
              style={{ background: "var(--color-teal)", color: "#04211B" }}
            >
              ثبت آدرس جدید
            </button>
          </div>
        ) : (
          addresses.map((addr) => (
            <div
              key={addr.id}
              className={`relative block rounded-[18px] p-4 transition-colors ${
                selectedAddrId === addr.id ? "border-2" : "border"
              }`}
              style={{
                background: "var(--color-surface)",
                borderColor:
                  selectedAddrId === addr.id
                    ? "var(--color-teal)"
                    : "var(--color-line)",
              }}
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="address"
                  checked={selectedAddrId === addr.id}
                  onChange={() => setSelectedAddrId(addr.id)}
                  className="accent-[var(--color-teal)]"
                />
                <span className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>
                  {addr.fullName}
                </span>
                <span className="text-xs mr-auto" style={{ color: "var(--color-ink-dim)" }} dir="ltr">
                  {addr.phone}
                </span>
              </label>
              <div className="text-xs mt-1 mr-6" style={{ color: "var(--color-ink-soft)" }}>
                {addr.province && `${addr.province}، `}
                {addr.city && `${addr.city} — `}
                {addr.addressLine}
                {addr.postalCode && ` (کدپستی: ${addr.postalCode})`}
              </div>
              {/* ویرایشِ همان‌جا — همتای checkout.js:110؛ بدونِ این، غلطِ
                  تایپی آدرس یعنی سفارش به جای اشتباه */}
              {selectedAddrId === addr.id && !showAddrForm && (
                <button
                  type="button"
                  onClick={() => startEditAddress(addr)}
                  className="absolute top-3 left-3 text-[11px] font-medium rounded-full px-2.5 py-1"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-teal)" }}
                >
                  ویرایش
                </button>
              )}
            </div>
          ))
        )}

        {addresses.length > 0 && !showAddrForm && (
          <button
            onClick={startNewAddress}
            className="text-xs font-medium"
            style={{ color: "var(--color-teal)" }}
          >
            + ثبت آدرس جدید
          </button>
        )}

        {showAddrForm && (
          <form
            onSubmit={handleSaveAddress}
            className="rounded-[18px] p-4 space-y-3"
            style={{ background: "var(--color-surface)" }}
          >
            <h3 className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>
              {editAddrId != null ? "ویرایش آدرس" : "آدرس جدید"}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={addrForm.fullName}
                onChange={(e) => setAddrForm({ ...addrForm, fullName: e.target.value })}
                placeholder="نام کامل"
                required
                className="rounded-full px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-line-control)",
                }}
              />
              <input
                type="tel"
                value={addrForm.phone}
                onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })}
                placeholder="شماره موبایل"
                required
                className="rounded-full px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-line-control)",
                }}
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={addrForm.province}
                onChange={(e) => setAddrForm({ ...addrForm, province: e.target.value })}
                placeholder="استان"
                className="rounded-full px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-line-control)",
                }}
              />
              <input
                type="text"
                value={addrForm.city}
                onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })}
                placeholder="شهر"
                required
                className="rounded-full px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-line-control)",
                }}
              />
              <input
                type="text"
                value={addrForm.postalCode}
                onChange={(e) => setAddrForm({ ...addrForm, postalCode: e.target.value })}
                placeholder="کدپستی"
                className="rounded-full px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-line-control)",
                }}
                dir="ltr"
              />
            </div>
            <input
              type="text"
              value={addrForm.addressLine}
              onChange={(e) => setAddrForm({ ...addrForm, addressLine: e.target.value })}
              placeholder="آدرس کامل"
              required
              className="w-full rounded-full px-3 py-2 text-xs outline-none"
              style={{
                background: "var(--color-surface-2)",
                color: "var(--color-ink)",
                border: "1px solid var(--color-line-control)",
              }}
            />

            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-full px-4 py-2 text-xs font-bold transition-colors"
                style={{ background: "var(--color-teal)", color: "#04211B" }}
              >
                {editAddrId != null ? "ذخیرهٔ تغییرات" : "ثبت"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddrForm(false);
                  setEditAddrId(null);
                }}
                className="rounded-full px-4 py-2 text-xs"
                style={{ color: "var(--color-ink-dim)" }}
              >
                انصراف
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ستون جمع */}
      <div className="lg:col-span-1">
        <div
          className="rounded-[18px] p-4 sticky top-[130px]"
          style={{ background: "var(--color-surface)" }}
        >
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--color-ink)" }}>
            خلاصهٔ سفارش
          </h3>

          <div className="space-y-2 text-xs mb-4 max-h-48 overflow-y-auto">
            {cart.items.map((item) => (
              <div key={item.productId} className="flex justify-between">
                <span className="truncate max-w-[180px]" style={{ color: "var(--color-ink-soft)" }}>
                  {item.title} ×{toFa(item.qty)}
                </span>
                <span className="shrink-0" style={{ color: "var(--color-ink-soft)" }}>
                  {/* subtotal خودِ سرور، نه price×qty. با تخفیف عمده قیمتِ واحد
                      unitPrice است و ضربِ دستی عددی می‌داد که با ردیفِ «جمع»
                      پایین همین کادر نمی‌خواند. */}
                  {toToman(item.subtotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-xs" style={{ borderTop: "1px solid var(--color-line)", paddingTop: "0.75rem" }}>
            <div className="flex justify-between" style={{ color: "var(--color-ink-soft)" }}>
              <span>جمع</span>
              <span>{toToman(cart.total)}</span>
            </div>
            {cart.discount > 0 && (
              <div className="flex justify-between" style={{ color: "var(--color-teal)" }}>
                <span>تخفیف{cart.coupon ? ` (${cart.coupon.code})` : ""}</span>
                <span>−{toToman(cart.discount)}</span>
              </div>
            )}
            <div className="flex justify-between" style={{ color: "var(--color-ink-soft)" }}>
              <span>ارسال</span>
              <span>{cart.shippingFee === 0 ? "رایگان" : toToman(cart.shippingFee)}</span>
            </div>
            <div
              className="flex justify-between text-sm font-extrabold pt-2"
              style={{
                borderTop: "1px solid var(--color-line)",
                color: "var(--color-ink)",
              }}
            >
              <span>مبلغ نهایی</span>
              <span>{toToman(cart.payable)}</span>
            </div>
          </div>

          {selectedAddr && (
            <div className="mt-3 text-[11px] rounded-xl p-2" style={{ background: "var(--color-teal-tint)" }}>
              <span style={{ color: "var(--color-teal)" }}>
                ارسال به: {selectedAddr.city}
              </span>
            </div>
          )}

          {error && (
            <p className="text-xs mt-2" style={{ color: "var(--color-coral)" }}>
              {error}
            </p>
          )}

          <button
            onClick={handlePlaceOrder}
            disabled={placing || !selectedAddrId || shopClosed}
            title={shopClosed ? "فروشگاه موقتاً بسته است" : undefined}
            className="w-full rounded-full py-3 mt-4 text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: shopClosed ? "var(--color-surface-2)" : "var(--color-teal)",
              color: shopClosed ? "var(--color-ink-dim)" : "#04211B",
              opacity: placing ? 0.7 : 1,
              boxShadow: shopClosed ? undefined : "var(--shadow-glow-teal)",
            }}
          >
            {placing ? (
              <span className="inline-block w-4 h-4 rounded-full border-2 border-[#04211B]/30 border-t-[#04211B] animate-spin" />
            ) : (
              "پرداخت و ثبت سفارش"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}