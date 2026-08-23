"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getMe, getOrders, logout } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { User, Order } from "@/lib/types";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function toToman(n: number): string {
  return `${toFa(n)} تومان`;
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت شده",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  cancelled: "لغو شده",
  failed: "ناموفق",
  return_requested: "درخواست مرجوعی",
  returned: "مرجوع شده",
};

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "var(--color-gold)",
  paid: "var(--color-teal)",
  shipped: "var(--color-teal)",
  delivered: "var(--color-teal)",
  cancelled: "var(--color-coral)",
  failed: "var(--color-coral)",
  return_requested: "var(--color-gold)",
  returned: "var(--color-ink-dim)",
};

export function AccountContent() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [meData, ordersData] = await Promise.all([getMe(), getOrders()]);
      if (!meData.user) {
        router.push("/login?redirect=/account");
        return;
      }
      setUser(meData.user);
      setOrders(ordersData.orders || []);
    } catch {
      setError("خطا در بارگذاری");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/");
    } catch {
      setError("خطا در خروج");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* سایدبار پروفایل */}
      <div className="lg:col-span-1">
        <div
          className="rounded-[18px] p-5 sticky top-[130px]"
          style={{ background: "var(--color-surface)" }}
        >
          <div className="text-center mb-4">
            <div
              className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold"
              style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
            >
              {user.fullName ? user.fullName[0] : "👤"}
            </div>
            <h2 className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>
              {user.fullName || "کاربر"}
            </h2>
            <p className="text-[11px] mt-1" style={{ color: "var(--color-ink-dim)" }} dir="ltr">
              {user.phone}
            </p>
          </div>

          <div className="space-y-1">
            <Link
              href="/account"
              className="block rounded-full px-3 py-2 text-xs font-medium transition-colors"
              style={{
                background: "var(--color-teal-tint)",
                color: "var(--color-teal)",
              }}
            >
              سفارش‌های من
            </Link>
            <Link
              href="/cart"
              className="block rounded-full px-3 py-2 text-xs font-medium transition-colors"
              style={{ color: "var(--color-ink-soft)" }}
            >
              سبد خرید
            </Link>
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-4 rounded-full py-2 text-xs font-medium transition-colors"
            style={{
              background: "var(--color-coral-tint)",
              color: "var(--color-coral)",
            }}
          >
            خروج
          </button>
        </div>
      </div>

      {/* سفارش‌ها */}
      <div className="lg:col-span-3">
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--color-ink)" }}>
          سفارش‌های من
        </h1>

        {error && (
          <p className="text-xs mb-4" style={{ color: "var(--color-coral)" }}>
            {error}
          </p>
        )}

        {orders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-ink-soft mb-4">هنوز سفارشی ثبت نکردید</p>
            <Link
              href="/products"
              className="inline-block rounded-full px-5 py-2 text-sm font-bold transition-colors"
              style={{ background: "var(--color-teal)", color: "#04211B" }}
            >
              مشاهدهٔ محصولات
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-[18px] p-4"
                style={{ background: "var(--color-surface)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: "var(--color-ink)" }}>
                      سفارش #{toFa(order.id)}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: `${STATUS_COLORS[order.status] || "var(--color-line)"}20`,
                        color: STATUS_COLORS[order.status] || "var(--color-ink-soft)",
                      }}
                    >
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
                    {order.createdAt?.slice(0, 10)}
                  </span>
                </div>

                <div className="text-xs space-y-1 mb-2" style={{ color: "var(--color-ink-soft)" }}>
                  {order.items?.slice(0, 3).map((item, i) => (
                    <span key={i}>
                      {item.title} ×{toFa(item.qty)}
                      {i < Math.min(order.items.length, 3) - 1 && "، "}
                    </span>
                  ))}
                  {order.items?.length > 3 && (
                    <span> و {toFa(order.items.length - 3)} قلم دیگر</span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold" style={{ color: "var(--color-teal)" }}>
                    {toToman(order.total)}
                  </span>
                  {order.status === "pending_payment" && order.paymentUrl && (
                    <a
                      href={order.paymentUrl}
                      className="rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors"
                      style={{ background: "var(--color-teal)", color: "#04211B" }}
                    >
                      پرداخت
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}