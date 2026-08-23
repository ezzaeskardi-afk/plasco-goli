import Link from "next/link";
import { CartContent } from "@/components/CartContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سبد خرید",
  robots: { index: false },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <div className="flex items-center gap-2 text-xs text-ink-dim mb-6">
        <Link href="/" className="hover:text-teal transition-colors">خانه</Link>
        <span>/</span>
        <span className="text-ink-soft">سبد خرید</span>
      </div>
      <h1 className="text-2xl font-extrabold text-ink mb-6">سبد خرید</h1>
      <CartContent />
    </div>
  );
}