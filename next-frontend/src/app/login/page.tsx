import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ورود",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <div className="py-12 px-4">
      <Suspense
        fallback={
          <div
            className="mx-auto max-w-[420px] rounded-[26px] p-8 text-center"
            style={{ background: "var(--color-surface)" }}
          >
            <div className="w-8 h-8 rounded-full border-2 border-teal/30 border-t-teal animate-spin mx-auto" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}