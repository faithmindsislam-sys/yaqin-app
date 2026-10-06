"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useBrowserValue } from "@/lib/store";
import { routeUrl } from "@/lib/routes";

export default function RouteLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const host = useBrowserValue(() => window.location.hostname, "yaqeenguide.com");
  const target = typeof href === "string" ? routeUrl(href, host) : href;
  return <NextLink {...props} href={target} />;
}
