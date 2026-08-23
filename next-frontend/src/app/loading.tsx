export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full animate-spin border-[3px]"
          style={{
            borderColor: "var(--color-line)",
            borderTopColor: "var(--color-teal)",
          }}
        />
        <p className="text-sm text-ink-dim">در حال بارگذاری...</p>
      </div>
    </div>
  );
}