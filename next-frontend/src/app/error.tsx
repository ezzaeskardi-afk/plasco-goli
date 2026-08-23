"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <div
          className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl"
          style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}
        >
          !
        </div>
        <h1 className="text-xl font-extrabold mb-2" style={{ color: "var(--color-ink)" }}>
          خطایی رخ داد
        </h1>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          متأسفانه مشکلی در بارگذاری این صفحه پیش آمد. لطفاً دوباره تلاش کنید.
        </p>
        <button
          onClick={reset}
          className="rounded-full px-6 py-2.5 text-sm font-bold transition-colors"
          style={{ background: "var(--color-teal)", color: "#04211B" }}
        >
          تلاش دوباره
        </button>
      </div>
    </div>
  );
}