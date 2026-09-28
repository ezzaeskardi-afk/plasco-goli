"use client";

// ============================================================
// فاکتورِ چاپی — یک قطعه، دو مصرف‌کننده
// ============================================================
// این کد قبلاً داخل `AccountContent.tsx` بود و فقط مشتری از آن استفاده می‌کرد.
// ولی چاپِ فاکتور یک کارِ **ادمین** هم هست: موقعِ بستنِ بسته. آن نسخه در پنلِ
// قدیمیِ Express بود که پنجره‌ی تازه‌ای با یک استایلِ چاپِ جدا باز می‌کرد — آن
// پنل و آن استایل حالا حذف شده‌اند. اگر این قطعه پیش از حذف استخراج نمی‌شد، ادمین
// راهی برای چاپِ فاکتورِ سفارش نداشت.
//
// حالا یک منبع است و دو مصرف: صفحه‌ی حسابِ مشتری و جزئیاتِ سفارش در پنل. یعنی
// فاکتوری که مشتری می‌بیند و فاکتوری که ادمین چاپ می‌کند **کلمه‌به‌کلمه** یکی
// است — وگرنه روزی دو فاکتور با دو جمعِ متفاوت روی میزِ مالک پیدا می‌شد.
//
// چاپ چطور کار می‌کند: برگه با `createPortal` مستقیم زیرِ `<body>` می‌رود و
// `<html>` کلاسِ `printing-invoice` می‌گیرد؛ CSS در `globals.css` در آن حالت
// همه‌چیز جز `#pg-invoice` را پنهان می‌کند. `window.print()` همگام است — پس
// بلافاصله بعدش کلاس برداشته می‌شود. آن ۶۰ میلی‌ثانیه تأخیر برای این است که
// portal اول رندر شود و بعد دیالوگِ چاپ باز شود.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ---------- قالب‌بندی ----------

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(Number.isFinite(n) ? n : 0);
}

/** ارقامِ رشته‌ها (موبایل، کد رهگیری، کدپستی) — گروه‌بندی نمی‌خواهند */
function toFaDigits(s: string): string {
  return String(s || "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function toToman(n: number): string {
  return `${toFa(n)} تومان`;
}

/** تاریخِ شمسی با منطقه‌ی Asia/Tehran — نه میلادیِ لاتین وسطِ فاکتورِ فارسی */
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

// ---------- داده ----------
// ساختاری و نه وابسته به یکی از دو تایپِ `Order`/`AdminOrder`: هر دو این فیلدها
// را دارند، پس هیچ تبدیلی لازم نیست و هیچ‌کدام هم مجبور به importِ دیگری نیست.

export interface InvoiceOrder {
  id: number;
  items: { title: string; price: number; qty: number }[];
  address?: {
    province?: string;
    city?: string;
    addressLine?: string;
    postalCode?: string;
  } | null;
  total: number;
  shippingFee: number;
  discount: number;
  couponCode?: string;
  trackingCode?: string;
  userName?: string;
  userPhone?: string;
  createdAt: string;
}

export function InvoiceSheet({
  order,
  shopName,
  shopPhone,
}: {
  order: InvoiceOrder;
  shopName: string;
  shopPhone: string;
}) {
  // جمعِ اقلام از خودِ اقلام حساب می‌شود، نه از `total`.
  // چرا: `total` مبلغِ نهاییِ پرداخت‌شده است (کالاها − تخفیف + ارسال). اگر همان
  // بالای جدول بنشیند، فاکتور با خودش نمی‌خواند و مشتری حق دارد فکر کند اشتباه
  // حساب شده.
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
          <p>
            {order.userName || "—"} — {toFaDigits(order.userPhone || "")}
          </p>
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
        <div>
          <span>جمع کالاها</span>
          <b>{toToman(itemsSubtotal)}</b>
        </div>
        {order.discount > 0 && (
          <div>
            <span>تخفیف{order.couponCode ? ` (${order.couponCode})` : ""}</span>
            <b>−{toToman(order.discount)}</b>
          </div>
        )}
        <div>
          <span>هزینه ارسال</span>
          <b>{order.shippingFee > 0 ? toToman(order.shippingFee) : "رایگان"}</b>
        </div>
        <div className="inv-grand">
          <span>مبلغ نهایی</span>
          <b>{toToman(order.total)}</b>
        </div>
      </div>

      <p className="inv-foot">
        {shopName || "پلاسکو گلی"} — {toFaDigits(shopPhone || "")} · این فاکتور توسط
        سامانه فروشگاه تولید شده است.
      </p>
    </div>
  );
}

/**
 * چاپِ فاکتور — کلِ چرخه در یک هوک.
 *
 * `print(order, { shopName, shopPhone })` را صدا بزن؛ برگه رندر می‌شود، دیالوگِ
 * چاپ باز می‌شود و بعد خودش جمع می‌شود. آنچه برمی‌گرداند باید در درختِ کامپوننت
 * رندر شود:
 *
 *   const { print, portal } = useInvoicePrint();
 *   …<button onClick={() => print(order, shop)}>چاپ فاکتور</button>
 *   {portal}
 *
 * چرا `mounted` جدا هست: با createPortal، همین درخت باید سمتِ سرور هم رندر شود
 * بی‌آنکه portal بسازد (وگرنه هیدریشن می‌شکند).
 */
export interface ShopIdentity {
  shopName: string;
  shopPhone: string;
}

export function useInvoicePrint() {
  // نامِ فروشگاه **با خودِ چاپ** می‌آید و نه لحظه‌ی ساختِ هوک: پنلِ مدیریت نام را
  // تازه موقعِ کلیک می‌گیرد (`/api/shop/info`)، و اگر هوک آن را یک بار می‌گرفت،
  // فاکتورِ اول با نامِ خالی («پلاسکو گلی»ِ پیش‌فرض) چاپ می‌شد.
  const [printing, setPrinting] = useState<
    { order: InvoiceOrder; shop: ShopIdentity } | null
  >(null);
  const [mounted, setMounted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.documentElement.classList.remove("printing-invoice");
    };
  }, []);

  useEffect(() => {
    if (!printing) return;
    document.documentElement.classList.add("printing-invoice");
    // صبر برای رندرِ portal قبل از دیالوگِ چاپ
    timer.current = setTimeout(() => {
      window.print();
      document.documentElement.classList.remove("printing-invoice");
      setPrinting(null);
    }, 60);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.documentElement.classList.remove("printing-invoice");
    };
  }, [printing]);

  const portal =
    printing && mounted
      ? createPortal(
          <InvoiceSheet
            order={printing.order}
            shopName={printing.shop.shopName}
            shopPhone={printing.shop.shopPhone}
          />,
          document.body,
        )
      : null;

  const print = (order: InvoiceOrder, shop: ShopIdentity) => setPrinting({ order, shop });

  return { printing, print, portal };
}
