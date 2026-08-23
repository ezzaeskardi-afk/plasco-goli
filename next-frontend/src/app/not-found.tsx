import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "پیدا نشد",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div className="text-center max-w-md">
        <div
          className="text-7xl font-extrabold mb-4"
          style={{ color: "var(--color-teal-dark)" }}
        >
          ۴۰۴
        </div>
        <h1 className="text-xl font-extrabold mb-2" style={{ color: "var(--color-ink)" }}>
          صفحه پیدا نشد
        </h1>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          صفحه‌ای که دنبالش هستید وجود ندارد یا حذف شده است.
        </p>
        <Link
          href="/"
          className="inline-block rounded-full px-6 py-2.5 text-sm font-bold transition-colors"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          بازگشت به خانه
        </Link>
      </div>
    </div>
  );
}