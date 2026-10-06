"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { productionHost, routeUrl } from "@/lib/routes";

/** Covers client navigation and already-open bundles in addition to edge redirects. */
export function RouteGuard() {
  const pathname = usePathname();
  useEffect(() => {
    const { hostname, origin, search, hash } = window.location;
    if (!productionHost(hostname)) return;
    const href = pathname === "/" && hostname === "studio.yaqeenguide.com" ? "/studio/"
      : pathname === "/" && hostname === "app.yaqeenguide.com" ? "/learn/" : pathname;
    const target = routeUrl(href + search + hash, hostname);
    if (target !== origin + pathname + search + hash && target.startsWith("https://")) window.location.replace(target);
  }, [pathname]);
  return null;
}
