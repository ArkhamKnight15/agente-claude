"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Atualiza os dados da página periodicamente enquanto algo está em andamento. */
export function AutoRefresh({ seconds = 5, active = true }: { seconds?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, active]);
  return null;
}
