import { AccountContent } from "@/components/AccountContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "حساب کاربری",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <AccountContent />
    </div>
  );
}