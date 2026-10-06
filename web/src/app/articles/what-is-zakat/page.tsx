import type { Metadata } from "next";
import { Article } from "@/features/site/Articles";
export const metadata: Metadata = { title: "What is zakat? — Yaqeen", description: "Understand zakat, the 2.5% rate for monetary wealth, and the importance of its conditions." };
export default function Page() { return <Article slug="what-is-zakat" />; }
