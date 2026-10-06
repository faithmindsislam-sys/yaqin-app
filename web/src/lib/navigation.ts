"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { routeUrl } from "@/lib/routes";
export { usePathname } from "next/navigation";

export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => {
    const navigate = (method: "push" | "replace", href: string, options?: { scroll?: boolean }) => {
      const target = routeUrl(href, window.location.hostname);
      const url = new URL(target, window.location.origin);
      if (url.origin !== window.location.origin) {
        window.location[method === "replace" ? "replace" : "assign"](target);
      } else router[method](url.pathname + url.search + url.hash, options);
    };
    return { ...router, push: (href: string, options?: { scroll?: boolean }) => navigate("push", href, options),
      replace: (href: string, options?: { scroll?: boolean }) => navigate("replace", href, options) };
  }, [router]);
}
