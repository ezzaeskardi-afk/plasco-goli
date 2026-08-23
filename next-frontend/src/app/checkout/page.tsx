import Link from "next/link";
import { CheckoutContent } from "@/components/CheckoutContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تکمیل خرید",
  robots: { index: false },
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <div className="flex items-center gap-2 text-xs text-ink-dim mb-6">
        <Link href="/" className="hover:text-teal transition-colors">خانه</Link>
        <span>/</span>
        <Link href="/cart" className="hover:text-teal transition-colors">سبد خرید</Link>
        <span>/</span>
        <span className="text-ink-soft">تکمیل خرید</span>
      </div>
      <h1 className="text-2xl font-extrabold text-ink mb-6">تکمیل خرید</h1>
      <CheckoutContent />
    </div>
  );
}