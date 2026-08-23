import { CrmContent } from "@/components/CrmContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مدیریت ارتباط با مشتری",
  robots: { index: false },
};

export default function CrmPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <h1 className="text-2xl font-extrabold text-ink mb-6">
        مدیریت ارتباط با مشتری (CRM)
      </h1>
      <CrmContent />
    </div>
  );
}