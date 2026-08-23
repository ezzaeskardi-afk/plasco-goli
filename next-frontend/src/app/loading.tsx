export default function Loading() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      {/* اسکلتون hero */}
      <div className="text-center py-16 space-y-4">
        <div
          className="mx-auto w-48 h-7 rounded-full animate-pulse"
          style={{ background: "var(--color-line)" }}
        />
        <div
          className="mx-auto w-96 max-w-full h-10 rounded-full animate-pulse"
          style={{ background: "var(--color-line)" }}
        />
        <div
          className="mx-auto w-72 max-w-full h-4 rounded-full animate-pulse"
          style={{ background: "var(--color-line)" }}
        />
      </div>

      {/* اسکلتون گرید */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[18px] overflow-hidden"
            style={{ background: "var(--color-surface)" }}
          >
            <div
              className="aspect-square animate-pulse"
              style={{ background: "var(--color-line)" }}
            />
            <div className="p-3 space-y-2">
              <div
                className="w-20 h-3 rounded-full animate-pulse"
                style={{ background: "var(--color-line)" }}
              />
              <div
                className="w-full h-4 rounded-full animate-pulse"
                style={{ background: "var(--color-line)" }}
              />
              <div
                className="w-2/3 h-4 rounded-full animate-pulse"
                style={{ background: "var(--color-line)" }}
              />
              <div
                className="w-24 h-8 rounded-full animate-pulse mt-2"
                style={{ background: "var(--color-line)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}