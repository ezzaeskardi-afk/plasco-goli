"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMe,
  getOrders,
  logout,
  cancelOrder,
  requestOrderReturn,
  reorderOrder,
  getWishlist,
  removeWishlistItem,
  addToCart,
  saveProfile,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setPassword,
  removePassword,
  logoutOthers,
  getSessions,
  getShopInfo,
  ApiError,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { User, Order, Address, WishlistProduct } from "@/lib/types";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
// ارقامِ رشته‌ها (شماره موبایل، کد رهگیری، کدپستی) — گروه‌بندی نمی‌خواهند،
// فقط فارسی شوند
function toFaDigits(s: string): string {
  return s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
function toToman(n: number): string {
  return `${toFa(n)} تومان`;
}

// تاریخِ شمسی با منطقه‌ی Asia/Tehran — قبلاً createdAt.slice(0,10) بود که
// میلادیِ لاتین می‌داد (2026-08-26) وسطِ رابطِ فارسی.
function faDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت شده",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  // بک‌اند «canceled» با یک l می‌نویسد (routes/orders.js). املای دوتایی هرگز
  // مطابقت نمی‌کرد، پس مشتری به‌جای «لغو شده» رشته‌ی خامِ انگلیسی می‌دید.
  canceled: "لغو شده",
  failed: "ناموفق",
  return_requested: "درخواست مرجوعی",
  returned: "مرجوع شده",
};

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "var(--color-gold)",
  paid: "var(--color-teal)",
  shipped: "var(--color-teal)",
  delivered: "var(--color-teal)",
  canceled: "var(--color-coral)",
  failed: "var(--color-coral)",
  return_requested: "var(--color-gold)",
  returned: "var(--color-ink-dim)",
};

// وضعیت‌هایی که فاکتور دارند — عین PAID_LIKE در frontend/js/account.js:47
const PAID_LIKE = ["paid", "shipped", "delivered", "return_requested", "returned"];

type Tab = "orders" | "wishlist" | "profile";

const VALID_HASHES: Tab[] = ["orders", "wishlist", "profile"];

function readHashTab(): Tab {
  const h = window.location.hash.replace("#", "") as Tab;
  return VALID_HASHES.includes(h) ? h : "orders";
}

// ============================================================
// فاکتور چاپی — همتای printInvoice در frontend/js/account.js:592
// ============================================================
// با createPortal مستقیم زیرِ <body> رندر می‌شود؛ CSS چاپ در globals.css
// همه‌چیز جز #pg-invoice را پنهان می‌کند وقتی <html> کلاسِ
// printing-invoice دارد. window.print() همگام است — بعدش کلاس برمی‌دارد.

function InvoiceSheet({ order, shopName, shopPhone }: { order: Order; shopName: string; shopPhone: string }) {
  const itemsSubtotal = (order.items || []).reduce(
    (sum, it) => sum + Number(it.price) * Number(it.qty),
    0,
  );
  return (
    <div id="pg-invoice" dir="rtl">
      <div className="inv-head">
        <div>
          <h1>{shopName || "پلاسکو گلی"}</h1>
          <p>فاکتور فروش — سفارش #{toFa(order.id)}</p>
        </div>
        <div className="inv-meta">
          <span>تاریخ: {faDate(order.createdAt)}</span>
          {order.trackingCode && <span>کد رهگیری پستی: {toFaDigits(order.trackingCode)}</span>}
        </div>
      </div>

      <div className="inv-parties">
        <div>
          <h2>خریدار</h2>
          <p>{order.userName || "—"} — {toFaDigits(order.userPhone || "")}</p>
        </div>
        <div>
          <h2>نشانی</h2>
          <p>
            {order.address
              ? `${order.address.province ? order.address.province + "، " : ""}${order.address.city}، ${order.address.addressLine}${order.address.postalCode ? " — کدپستی " + toFaDigits(order.address.postalCode) : ""}`
              : "—"}
          </p>
        </div>
      </div>

      <table className="inv-items">
        <thead>
          <tr>
            <th>کالا</th>
            <th>تعداد</th>
            <th>قیمت واحد</th>
            <th>جمع</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((it, i) => (
            <tr key={i}>
              <td>{it.title}</td>
              <td>{toFa(it.qty)}</td>
              <td>{toToman(it.price)}</td>
              <td>{toToman(Number(it.price) * Number(it.qty))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-totals">
        <div><span>جمع کالاها</span><b>{toToman(itemsSubtotal)}</b></div>
        {order.discount > 0 && (
          <div><span>تخفیف{order.couponCode ? ` (${order.couponCode})` : ""}</span><b>−{toToman(order.discount)}</b></div>
        )}
        <div><span>هزینه ارسال</span><b>{order.shippingFee > 0 ? toToman(order.shippingFee) : "رایگان"}</b></div>
        <div className="inv-grand"><span>مبلغ نهایی</span><b>{toToman(order.total)}</b></div>
      </div>

      <p className="inv-foot">
        {shopName || "پلاسکو گلی"} — {toFaDigits(shopPhone || "")} · این فاکتور توسط سامانه فروشگاه تولید شده است.
      </p>
    </div>
  );
}

// ============================================================
// ردیف سفارش — با اکشن‌های وضعیت‌محور
// ============================================================

function OrderCard({
  order,
  onMutated,
  onPrint,
}: {
  order: Order;
  onMutated: (o: Order) => void;
  onPrint: (o: Order) => void;
}) {
  const toast = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ order: Order }>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fn();
      toast(okMsg, { tone: "success" });
      onMutated(res.order);
    } catch (err) {
      toast(err instanceof ApiError && err.message ? err.message : "انجام نشد", { tone: "error" });
    } finally {
      setBusy(false);
      setConfirmingCancel(false);
      setReturning(false);
    }
  }

  async function handleReorder() {
    setBusy(true);
    try {
      const res = await reorderOrder(order.id);
      if (res.skipped?.length) {
        toast(
          `${toFa(res.added)} قلم به سبد رفت؛ ${toFa(res.skipped.length)} قلم نشد: ${res.skipped.map((s) => `${s.title} (${s.reason})`).join("، ")}`,
          { tone: "info" },
        );
      } else {
        toast("سبد با اقلام این سفارش جایگزین شد", { tone: "success" });
      }
      window.location.href = "/cart";
    } catch (err) {
      toast(err instanceof ApiError && err.message ? err.message : "سفارش مجدد نشد", { tone: "error" });
      setBusy(false);
    }
  }

  const canCancel = order.status === "paid";
  const canReturn = order.status === "delivered";
  const canReorder = ["failed", "canceled", "returned", "pending_payment", "delivered"].includes(order.status);
  const canPrint = PAID_LIKE.includes(order.status);

  return (
    <div className="rounded-[18px] p-4" style={{ background: "var(--color-surface)" }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
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
          {faDate(order.createdAt)}
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

      {/* کد رهگیری پستی — وقتی ارسال شد، مهم‌ترین چیزی است که مشتری دنبالش است */}
      {order.trackingCode && (
        <p className="text-[11px] mb-2" style={{ color: "var(--color-ink-dim)" }} dir="ltr">
          کد رهگیری: {toFaDigits(order.trackingCode)}
        </p>
      )}

      {/* دلیلِ لغو/مرجوعیِ سمتِ فروشگاه — سکوت اینجا یعنی تماسِ تلفنی */}
      {order.cancelReason && (
        <p className="text-[11px] mb-2 text-coral">دلیل لغو: {order.cancelReason}</p>
      )}
      {order.returnReason && (
        <p className="text-[11px] mb-2 text-gold">دلیل درخواست مرجوعی: {order.returnReason}</p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-extrabold" style={{ color: "var(--color-teal)" }}>
          {toToman(order.total)}
        </span>

        <div className="flex items-center gap-1.5 flex-wrap">
          {order.status === "pending_payment" && order.paymentUrl && (
            <a
              href={order.paymentUrl}
              className="rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors"
              style={{ background: "var(--color-teal)", color: "#04211B" }}
            >
              پرداخت
            </a>
          )}
          {canPrint && (
            <button
              type="button"
              onClick={() => onPrint(order)}
              disabled={busy}
              className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
              style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
            >
              فاکتور
            </button>
          )}
          {canReorder && (
            <button
              type="button"
              onClick={handleReorder}
              disabled={busy}
              className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
              style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
            >
              خرید مجدد
            </button>
          )}
          {canCancel && !confirmingCancel && (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              disabled={busy}
              className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
              style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
            >
              لغو سفارش
            </button>
          )}
          {canReturn && !returning && (
            <button
              type="button"
              onClick={() => setReturning(true)}
              disabled={busy}
              className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
              style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
            >
              درخواست مرجوعی
            </button>
          )}
        </div>
      </div>

      {/* تأییدِ لغو — همان جا، بدون مودال؛ مثل account.js:96 */}
      {confirmingCancel && (
        <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--color-coral-tint)" }}>
          <p className="mb-2" style={{ color: "var(--color-coral)" }}>
            سفارش لغو شود؟ موجودی کالاها برمی‌گردد و این کار برگشت‌پذیر نیست.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => cancelOrder(order.id), "سفارش لغو شد")}
              className="rounded-full px-3 py-1.5 font-bold"
              style={{ background: "var(--color-coral)", color: "var(--color-ink-on-warm)" }}
            >
              بله، لغو شود
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="rounded-full px-3 py-1.5 font-medium"
              style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
            >
              منصرف شدم
            </button>
          </div>
        </div>
      )}

      {/* فرمِ دلیلِ مرجوعی — سرور حداقل ۵ حرف می‌خواهد (orders.js:293) */}
      {returning && (
        <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--color-gold-tint)" }}>
          <label className="block mb-1.5 font-medium" style={{ color: "var(--color-gold)" }}>
            چرا این کالا را مرجوع می‌کنید؟ (حداقل ۵ حرف)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full rounded-xl p-2 text-xs outline-none mb-2"
            style={{
              background: "var(--color-surface)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line-control)",
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || reason.trim().length < 5}
              onClick={() => run(() => requestOrderReturn(order.id, reason.trim()), "درخواست مرجوعی ثبت شد")}
              className="rounded-full px-3 py-1.5 font-bold disabled:opacity-50"
              style={{ background: "var(--color-gold)", color: "#2B0A03" }}
            >
              ثبت درخواست
            </button>
            <button
              type="button"
              onClick={() => setReturning(false)}
              className="rounded-full px-3 py-1.5 font-medium"
              style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
            >
              انصراف
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// تبِ علاقه‌مندی‌ها
// ============================================================

function WishlistTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["wishlist"],
    queryFn: getWishlist,
    retry: false,
  });
  const addMutation = useMutation({
    mutationFn: ({ productId, qty }: { productId: number; qty: number }) => addToCart(productId, qty),
    onSuccess: (cart) => {
      queryClient.setQueryData(["cart"], cart);
      toast("به سبد خرید اضافه شد", { tone: "success", action: { href: "/cart", label: "مشاهده سبد" } });
    },
    onError: (err) => {
      toast(err instanceof ApiError && err.message ? err.message : "افزودن نشد", { tone: "error" });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (productId: number) => removeWishlistItem(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["wishlistIds"] });
      toast("از علاقه‌مندی‌ها حذف شد", { tone: "info" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }
  if (error) {
    return <p className="text-xs" style={{ color: "var(--color-coral)" }}>خطا در بارگذاری علاقه‌مندی‌ها</p>;
  }
  const products: WishlistProduct[] = data?.products || [];

  if (!products.length) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-ink-soft mb-4">هنوز چیزی به علاقه‌مندی‌ها اضافه نکردید</p>
        <Link
          href="/products"
          className="inline-block rounded-full px-5 py-2 text-sm font-bold"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          دیدن محصولات
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((p) => {
        const out = p.stock <= 0;
        return (
          <div
            key={p.id}
            className="rounded-[18px] overflow-hidden flex flex-col"
            style={{ background: "var(--color-surface)" }}
          >
            <Link href={`/product/${p.id}`} className="relative aspect-square block">
              {p.image ? (
                <Image src={p.image} alt={p.title} fill sizes="200px" className="object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-4xl" style={{ background: "var(--color-surface-2)" }}>
                  🧺
                </span>
              )}
              {out && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold text-gold">
                  ناموجود
                </span>
              )}
            </Link>
            <div className="p-3 flex flex-col gap-2 flex-1">
              <Link href={`/product/${p.id}`} className="text-xs font-semibold line-clamp-2" style={{ color: "var(--color-ink)" }}>
                {p.title}
              </Link>
              <span className="text-sm font-extrabold text-teal mt-auto">{toToman(p.price)}</span>
              <div className="flex gap-1.5">
                {!out && (
                  <button
                    type="button"
                    disabled={addMutation.isPending}
                    onClick={() => addMutation.mutate({ productId: p.id, qty: 1 })}
                    className="flex-1 rounded-full py-1.5 text-[11px] font-bold"
                    style={{ background: "var(--color-teal)", color: "#04211B" }}
                  >
                    خرید
                  </button>
                )}
                <button
                  type="button"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(p.id)}
                  aria-label={`حذف ${p.title} از علاقه‌مندی‌ها`}
                  className="rounded-full p-1.5"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-coral)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 17s-6.5-4.1-8.2-8A4.6 4.6 0 0110 5.4 4.6 4.6 0 0118.2 9c-1.7 3.9-8.2 8-8.2 8z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// تبِ پروفایل — نام، آدرس‌ها، رمز عبور، نشست‌ها
// ============================================================

const EMPTY_ADDR = { fullName: "", phone: "", province: "", city: "", addressLine: "", postalCode: "" };

function ProfileTab({ user }: { user: User }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  // ---------- نام ----------
  const [name, setName] = useState(user.fullName || "");
  const nameMutation = useMutation({
    mutationFn: () => saveProfile(name.trim()),
    onSuccess: () => {
      toast("نام ذخیره شد", { tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast(err instanceof ApiError && err.message ? err.message : "ذخیره نشد", { tone: "error" }),
  });

  // ---------- آدرس‌ها ----------
  const { data: addresses = [], isLoading: addrLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: getAddresses,
    retry: false,
  });
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [addrForm, setAddrForm] = useState({ ...EMPTY_ADDR });

  function startNewAddress() {
    setAddrForm({ ...EMPTY_ADDR });
    setEditingId("new");
  }
  function startEditAddress(a: Address) {
    setAddrForm({
      fullName: a.fullName || "",
      phone: a.phone || "",
      province: a.province || "",
      city: a.city || "",
      addressLine: a.addressLine || "",
      postalCode: a.postalCode || "",
    });
    setEditingId(a.id);
  }

  const saveAddrMutation = useMutation({
    mutationFn: async () => {
      if (editingId === "new") return createAddress(addrForm);
      return updateAddress(editingId as number, addrForm);
    },
    onSuccess: () => {
      toast("آدرس ذخیره شد", { tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      setEditingId(null);
    },
    onError: (err) => toast(err instanceof ApiError && err.message ? err.message : "ذخیره نشد", { tone: "error" }),
  });

  const deleteAddrMutation = useMutation({
    mutationFn: (id: number) => deleteAddress(id),
    onSuccess: () => {
      toast("آدرس حذف شد", { tone: "info" });
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });

  function submitAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!addrForm.fullName.trim() || !addrForm.phone.trim() || !addrForm.city.trim() || !addrForm.addressLine.trim()) {
      toast("نام، شماره تماس، شهر و آدرس الزامی است", { tone: "error" });
      return;
    }
    saveAddrMutation.mutate();
  }

  // ---------- رمز عبور ----------
  const [pw, setPw] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [removingPw, setRemovingPw] = useState(false);
  const pwMutation = useMutation({
    mutationFn: async () => {
      if (removingPw) return removePassword(pwCurrent || undefined);
      return setPassword({ password: pw, currentPassword: pwCurrent || undefined });
    },
    onSuccess: (res) => {
      toast(
        res.revoked > 0
          ? `رمز ${removingPw ? "برداشته" : "ذخیره"} شد؛ ${toFa(res.revoked)} دستگاهِ دیگر از حساب خارج شد`
          : `رمز ${removingPw ? "برداشته" : "ذخیره"} شد`,
        { tone: "success" },
      );
      setPw("");
      setPwCurrent("");
      setRemovingPw(false);
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err) => {
      // پیامِ سرور خودش می‌گوید اگر رمزِ فعلی لازم است («اول رمز فعلی را وارد
      // کنید»)؛ دکمه هم تا پرشدنِ رمزِ فعلی غیرفعال است.
      toast(err instanceof ApiError && err.message ? err.message : "انجام نشد", { tone: "error" });
    },
  });

  // ---------- نشست‌ها ----------
  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    retry: false,
  });
  const logoutOthersMutation = useMutation({
    mutationFn: logoutOthers,
    onSuccess: (res) => {
      toast(`${toFa(res.revoked)} دستگاهِ دیگر از حساب خارج شد`, { tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => toast("انجام نشد", { tone: "error" }),
  });

  const hasPw = user.hasPassword;
  const addrInputStyle = {
    background: "var(--color-surface-2)",
    color: "var(--color-ink)",
    border: "1px solid var(--color-line-control)",
  } as const;

  return (
    <div className="space-y-6">
      {/* نام */}
      <section className="rounded-[18px] p-4" style={{ background: "var(--color-surface)" }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--color-ink)" }}>نام من</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="flex-1 min-w-[200px] rounded-full px-4 py-2 text-sm outline-none"
            style={addrInputStyle}
          />
          <button
            type="button"
            disabled={nameMutation.isPending || !name.trim()}
            onClick={() => nameMutation.mutate()}
            className="rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50"
            style={{ background: "var(--color-teal)", color: "#04211B" }}
          >
            ذخیره
          </button>
        </div>
        <p className="text-[11px] mt-2 text-ink-dim">
          شماره موبایل ({toFaDigits(user.phone)}) هویت ورود شماست و تغییر نمی‌کند.
        </p>
      </section>

      {/* آدرس‌ها */}
      <section className="rounded-[18px] p-4" style={{ background: "var(--color-surface)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>دفترچه آدرس</h3>
          {editingId === null && (
            <button
              type="button"
              onClick={startNewAddress}
              className="rounded-full px-4 py-1.5 text-xs font-bold"
              style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
            >
              + آدرس جدید
            </button>
          )}
        </div>

        {addrLoading ? (
          <p className="text-xs text-ink-dim">در حال بارگذاری…</p>
        ) : (
          <div className="space-y-2">
            {(addresses as Address[]).length === 0 && editingId === null && (
              <p className="text-xs text-ink-dim">هنوز آدرسی ثبت نکرده‌اید</p>
            )}
            {(addresses as Address[]).map((a) => (
              <div
                key={a.id}
                className="rounded-xl p-3 text-xs flex items-start justify-between gap-3"
                style={{ background: "var(--color-surface-2)" }}
              >
                <div className="min-w-0">
                  <p className="font-bold mb-0.5" style={{ color: "var(--color-ink)" }}>
                    {a.fullName} — <span dir="ltr">{toFaDigits(a.phone)}</span>
                  </p>
                  <p className="text-ink-soft leading-relaxed">
                    {a.province && `${a.province}، `}{a.city}، {a.addressLine}
                    {a.postalCode && ` — کدپستی ${toFaDigits(a.postalCode)}`}
                  </p>
                </div>
                {editingId === null && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditAddress(a)}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{ background: "var(--color-surface)", color: "var(--color-teal)" }}
                    >
                      ویرایش
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("این آدرس حذف شود؟")) deleteAddrMutation.mutate(a.id);
                      }}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{ background: "var(--color-surface)", color: "var(--color-coral)" }}
                    >
                      حذف
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* فرمِ افزودن/ویرایش */}
            {editingId !== null && (
              <form onSubmit={submitAddress} className="rounded-xl p-3 space-y-2" style={{ background: "var(--color-surface-2)" }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text" placeholder="نام و نام خانوادگی *" value={addrForm.fullName}
                    onChange={(e) => setAddrForm((f) => ({ ...f, fullName: e.target.value }))}
                    className="rounded-full px-3 py-2 text-xs outline-none" style={addrInputStyle}
                  />
                  <input
                    type="tel" placeholder="شماره تماس *" value={addrForm.phone}
                    onChange={(e) => setAddrForm((f) => ({ ...f, phone: e.target.value }))}
                    className="rounded-full px-3 py-2 text-xs outline-none" style={addrInputStyle} dir="ltr"
                  />
                  <input
                    type="text" placeholder="استان" value={addrForm.province}
                    onChange={(e) => setAddrForm((f) => ({ ...f, province: e.target.value }))}
                    className="rounded-full px-3 py-2 text-xs outline-none" style={addrInputStyle}
                  />
                  <input
                    type="text" placeholder="شهر *" value={addrForm.city}
                    onChange={(e) => setAddrForm((f) => ({ ...f, city: e.target.value }))}
                    className="rounded-full px-3 py-2 text-xs outline-none" style={addrInputStyle}
                  />
                  <input
                    type="text" placeholder="کد پستی" value={addrForm.postalCode}
                    onChange={(e) => setAddrForm((f) => ({ ...f, postalCode: e.target.value }))}
                    className="rounded-full px-3 py-2 text-xs outline-none sm:col-span-2" style={addrInputStyle} dir="ltr"
                  />
                </div>
                <textarea
                  placeholder="نشانی کامل *" value={addrForm.addressLine}
                  onChange={(e) => setAddrForm((f) => ({ ...f, addressLine: e.target.value }))}
                  rows={2} maxLength={300}
                  className="w-full rounded-xl px-3 py-2 text-xs outline-none" style={addrInputStyle}
                />
                <div className="flex gap-2">
                  <button
                    type="submit" disabled={saveAddrMutation.isPending}
                    className="rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-50"
                    style={{ background: "var(--color-teal)", color: "#04211B" }}
                  >
                    ذخیره آدرس
                  </button>
                  <button
                    type="button" onClick={() => setEditingId(null)}
                    className="rounded-full px-4 py-1.5 text-xs font-medium"
                    style={{ background: "var(--color-surface)", color: "var(--color-ink-soft)" }}
                  >
                    انصراف
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>

      {/* رمز عبور */}
      <section className="rounded-[18px] p-4" style={{ background: "var(--color-surface)" }}>
        <h3 className="text-sm font-bold mb-1" style={{ color: "var(--color-ink)" }}>رمز عبور</h3>
        <p className="text-[11px] text-ink-dim mb-3">
          {hasPw
            ? "می‌توانید رمز را عوض کنید یا کلاً بردارید (ورود فقط با پیامک)."
            : "رمزی ندارید؛ با گذاشتن رمز، ورود با رمز هم برایتان فعال می‌شود."}
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); pwMutation.mutate(); }}
          className="space-y-2"
        >
          {hasPw && (
            <input
              type="password" placeholder="رمز فعلی" value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              className="w-full sm:w-64 rounded-full px-4 py-2 text-xs outline-none block"
              style={addrInputStyle} dir="ltr" autoComplete="current-password"
            />
          )}
          {!removingPw && (
            <input
              type="password" placeholder="رمز تازه (حداقل ۶ کاراکتر)" value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full sm:w-64 rounded-full px-4 py-2 text-xs outline-none block"
              style={addrInputStyle} dir="ltr" autoComplete="new-password" minLength={6}
            />
          )}
          <div className="flex gap-2 flex-wrap">
            {!removingPw ? (
              <>
                <button
                  type="submit" disabled={pwMutation.isPending || pw.length < 6 || (hasPw && !pwCurrent)}
                  className="rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50"
                  style={{ background: "var(--color-teal)", color: "#04211B" }}
                >
                  {hasPw ? "تغییر رمز" : "گذاشتن رمز"}
                </button>
                {hasPw && (
                  <button
                    type="button" onClick={() => setRemovingPw(true)}
                    className="rounded-full px-4 py-2 text-xs font-medium"
                    style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
                  >
                    برداشتن رمز
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="submit" disabled={pwMutation.isPending || (hasPw && !pwCurrent)}
                  className="rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50"
                  style={{ background: "var(--color-coral)", color: "var(--color-ink-on-warm)" }}
                >
                  رمز برداشته شود
                </button>
                <button
                  type="button" onClick={() => setRemovingPw(false)}
                  className="rounded-full px-4 py-2 text-xs font-medium"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-ink-soft)" }}
                >
                  انصراف
                </button>
              </>
            )}
          </div>
        </form>
        <p className="text-[10px] mt-2 text-ink-dim">
          با تغییر یا برداشتنِ رمز، همه‌ی دستگاه‌های دیگر از حساب خارج می‌شوند.
        </p>
      </section>

      {/* نشست‌ها */}
      <section className="rounded-[18px] p-4" style={{ background: "var(--color-surface)" }}>
        <h3 className="text-sm font-bold mb-2" style={{ color: "var(--color-ink)" }}>دستگاه‌های واردشده</h3>
        <p className="text-xs text-ink-soft mb-3">
          {sessions ? `${toFa(sessions.count)} نشست فعال به این حساب وارد است.` : "…"}
        </p>
        <button
          type="button"
          disabled={logoutOthersMutation.isPending || (sessions?.count ?? 0) <= 1}
          onClick={() => logoutOthersMutation.mutate()}
          className="rounded-full px-5 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
        >
          خروج از دستگاه‌های دیگر
        </button>
      </section>
    </div>
  );
}

// ============================================================
// بدنه‌ی اصلی
// ============================================================

export function AccountContent() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("orders");
  const [printing, setPrinting] = useState<Order | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [mounted, setMounted] = useState(false);
  const printTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    setTab(readHashTab());
    const onHash = () => setTab(readHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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

  // نام/تلفنِ فروشگاه برای سربرگِ فاکتور — از همان کوئریِ مشترک
  useEffect(() => {
    getShopInfo()
      .then((s) => {
        setShopName(s.shopName || "");
        setShopPhone(s.shopPhone || "");
      })
      .catch(() => {});
  }, []);

  function switchTab(t: Tab) {
    setTab(t);
    // هش آپدیت شود تا لینکِ عمیق (مثل قلبِ هدر → #wishlist) کار کند؛
    // بدون pushState، hashchange هم فایر نمی‌شود و خودش ست می‌کنیم.
    if (readHashTab() !== t) {
      window.location.hash = t;
    }
  }

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/");
    } catch {
      toast("خروج انجام نشد؛ دوباره تلاش کنید", { tone: "error" });
    }
  };

  // ---------- چاپ فاکتور ----------
  function handlePrint(order: Order) {
    setPrinting(order);
  }
  useEffect(() => {
    if (!printing) return;
    document.documentElement.classList.add("printing-invoice");
    // صبر برای رندرِ portal قبل از دیالوگِ چاپ
    printTimer.current = setTimeout(() => {
      window.print();
      document.documentElement.classList.remove("printing-invoice");
      setPrinting(null);
    }, 60);
    return () => {
      if (printTimer.current) clearTimeout(printTimer.current);
      document.documentElement.classList.remove("printing-invoice");
    };
  }, [printing]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "orders", label: "سفارش‌های من" },
    { id: "wishlist", label: "علاقه‌مندی‌ها" },
    { id: "profile", label: "مشخصات من" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* سایدبار پروفایل */}
      <div className="lg:col-span-1">
        <div
          className="rounded-[18px] p-5 lg:sticky lg:top-[130px]"
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
              {toFaDigits(user.phone)}
            </p>
          </div>

          <div className="space-y-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className="w-full text-right rounded-full px-3 py-2 text-xs font-medium transition-colors"
                style={
                  tab === t.id
                    ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                    : { color: "var(--color-ink-soft)" }
                }
              >
                {t.label}
              </button>
            ))}
            {(user.isAdmin || user.isStaff) && (
              <Link
                href="/admin"
                className="block rounded-full px-3 py-2 text-xs font-medium"
                style={{ color: "var(--color-gold)" }}
              >
                پنل مدیریت
              </Link>
            )}
            <Link
              href="/products"
              className="block rounded-full px-3 py-2 text-xs font-medium"
              style={{ color: "var(--color-ink-soft)" }}
            >
              ادامه‌ی خرید
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

      {/* محتوای تب */}
      <div className="lg:col-span-3">
        {tab === "orders" && (
          <>
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
                  <OrderCard
                    key={order.id}
                    order={order}
                    onMutated={(o) =>
                      setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)))
                    }
                    onPrint={handlePrint}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "wishlist" && (
          <>
            <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--color-ink)" }}>
              علاقه‌مندی‌ها
            </h1>
            <WishlistTab />
          </>
        )}

        {tab === "profile" && (
          <>
            <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--color-ink)" }}>
              مشخصات من
            </h1>
            <ProfileTab user={user} />
          </>
        )}
      </div>

      {/* فاکتورِ چاپی — فقط هنگامِ چاپ در DOM می‌آید */}
      {printing &&
        mounted &&
        createPortal(
          <InvoiceSheet order={printing} shopName={shopName} shopPhone={shopPhone} />,
          document.body,
        )}
    </div>
  );
}
