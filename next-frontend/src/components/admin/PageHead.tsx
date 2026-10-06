import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import {
  sectionByKey,
  type AdminSectionKey,
} from "@/lib/adminSections";

// ============================================================
// قالبِ صفحه‌های پنل — سرصفحه + ستونِ محتوا
// ============================================================
// چرا این فایل لازم شد: هر ۱۳ صفحه‌ی پنل دقیقاً یک سرصفحه‌ی تکراری داشتند —
// یک `div` با `mx-auto max-w-[1180px] px-4 py-6`، یک `h1.text-2xl.font-extrabold`
// و (در شش‌تایشان) یک `p.text-xs` خاکستری. یعنی ۱۳ کپی از یک چیدمان، که هر
// تغییرِ ظاهری در آن باید ۱۳ بار تکرار می‌شد — و طبیعتاً هیچ‌وقت تکرار نمی‌شد.
//
// حالا یک جا است. چیزی که به هر صفحه داده می‌شود «کلیدِ بخش» است، نه آیکون:
// برچسب و آیکون از `adminSections.ts` خوانده می‌شوند، یعنی همان منبعی که نوارِ
// پنل از آن ساخته می‌شود. نتیجه: آیکونِ کنارِ عنوان همیشه همان آیکونِ همان
// بخش در نوار است و نامِ بخش هم هیچ‌وقت دو شکل پیدا نمی‌کند.
//
// `title` اختیاری است چون سه صفحه عنوانِ کامل‌تری از برچسبِ نوار دارند و باید
// داشته باشند: نوار جای کوتاه دارد («رویدادها») و صفحه جای دقیق («دفتر
// رویدادها»). ولی آیکون جای انتخاب ندارد — و همین‌جا است که تکرار حذف می‌شود.
//
// این فایل `"use client"` **نیست**: هیچ قلاب و رویدادی ندارد، و صفحه‌های پنل
// کامپوننتِ سروری‌اند. اگر کلاینتی بود، هر سرصفحه یک مرزِ کلاینت می‌ساخت.

export function AdminPage({
  sectionKey,
  title,
  desc,
  children,
}: {
  /** کلیدِ بخش در `ADMIN_SECTIONS` — آیکونِ سرصفحه از همین می‌آید */
  sectionKey: AdminSectionKey;
  /** عنوانِ صفحه؛ اگر نیاید، برچسبِ همان بخش از نوار استفاده می‌شود */
  title?: string;
  /** یک‌دو جمله توضیح: این صفحه چه کاری می‌کند و چه چیزی نشان می‌دهد */
  desc?: string;
  children: ReactNode;
}) {
  const section = sectionByKey(sectionKey);

  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-5 pb-10 sm:px-6 sm:pt-7">
      <header className="mb-5">
        <div className="flex items-center gap-3">
          {/* کاشیِ آیکون. گرادیانِ ملایم + هاله‌ی کم‌رنگ: سرصفحه وزنِ بصری
              می‌گیرد بدونِ اینکه یک تصویر یا آیکونِ رنگیِ اضافه لازم باشد. */}
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px]"
            style={{
              background:
                "linear-gradient(150deg, rgba(37, 214, 176, 0.22), rgba(37, 214, 176, 0.02))",
              border: "1px solid var(--color-line-strong)",
              color: "var(--color-teal)",
              boxShadow: "0 16px 30px -24px rgba(37, 214, 176, 0.95)",
            }}
            aria-hidden="true"
          >
            <Icon name={section?.icon ?? "dashboard"} size={21} />
          </span>
          <h1 className="min-w-0 text-[21px] font-extrabold leading-tight text-ink sm:text-2xl">
            {title ?? section?.label}
          </h1>
        </div>

        {desc && (
          <p
            className="mt-3 max-w-[70ch] text-xs leading-relaxed"
            style={{ color: "var(--color-ink-soft)" }}
          >
            {desc}
          </p>
        )}

        {/* خطِ موییِ محو — سرصفحه را از بدنه جدا می‌کند بدونِ یک کادرِ کامل.
            در RTL از راست (زیرِ عنوان) پررنگ است و به چپ محو می‌شود. */}
        <div
          className="mt-4 h-px w-full"
          style={{
            background:
              "linear-gradient(to left, var(--color-line-strong), transparent)",
          }}
          aria-hidden="true"
        />
      </header>

      {children}
    </div>
  );
}
