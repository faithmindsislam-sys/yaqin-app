"use client";

import Image from "next/image";
import Link from "@/components/RouteLink";
import { useI18n } from "@/lib/i18n";

export function Logo({ compact = false, horizontal = false, href = "/" }: { compact?: boolean; horizontal?: boolean; href?: string }) {
  const { t } = useI18n();
  return (
    <Link href={href} className={`brand-logo ${compact ? "brand-logo-compact" : ""} ${horizontal ? "brand-logo-horizontal" : ""}`} aria-label={t({ en: "Yaqeen — home", ar: "يقين — الرئيسية" })}>
      <Image src={horizontal ? "/yaqeen-logo-horizontal.png" : "/yaqeen-logo.png"} alt="يقين · Yaqeen" width={horizontal ? 640 : 512} height={horizontal ? 256 : 512} preload />
    </Link>
  );
}
