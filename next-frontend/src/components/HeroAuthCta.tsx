"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { getMe } from "@/lib/api";
import type { AuthMeResponse } from "@/lib/types";

const CTA =
  "hero-cta-outline inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-bold transition-all";
const CTA_STYLE = {
  background: "transparent",
  color: "var(--color-ink)",
  border: "1.5px solid var(--color-line-control)",
} as const;

export function HeroAuthCta({ guestLabel }: { guestLabel: string }) {
  const { data } = useQuery<AuthMeResponse>({
    queryKey: ["auth"],
    queryFn: getMe,
    staleTime: 60_000,
    retry: false,
    refetchOnMount: true,
  });

  const user = data?.user || null;
  const isAdmin = user?.isAdmin || user?.isStaff;

  return (
    <Link
      href={user ? (isAdmin ? "/admin" : "/account") : "/login"}
      className={CTA}
      style={CTA_STYLE}
    >
      <Icon name={isAdmin ? "dashboard" : "user"} size={18} />
      {user ? (isAdmin ? "پنل مدیریت" : "حساب من") : guestLabel}
    </Link>
  );
}
