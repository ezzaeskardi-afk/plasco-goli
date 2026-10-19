"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout as logoutRequest } from "@/lib/api";
import { useToast } from "@/components/Toast";

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const logout = useCallback(async () => {
    if (busy) return false;
    setBusy(true);
    try {
      await logoutRequest();
      queryClient.setQueryData(["auth"], { user: null });
      queryClient.removeQueries({ queryKey: ["cart"] });
      queryClient.removeQueries({ queryKey: ["wishlist"] });
      queryClient.removeQueries({ queryKey: ["wishlistIds"] });
      router.push("/");
      router.refresh();
      toast("از حساب خارج شدید", { tone: "info" });
      return true;
    } catch {
      toast("خروج انجام نشد؛ دوباره تلاش کنید", { tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, queryClient, router, toast]);

  return { logout, busy };
}
