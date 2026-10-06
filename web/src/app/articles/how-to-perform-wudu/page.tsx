import type { Metadata } from "next";
import { Article } from "@/features/site/Articles";
export const metadata: Metadata = { title: "How to perform wudu — Yaqeen", description: "A simple introduction to wudu, with references to Quran 5:6 and Sahih al-Bukhari 159." };
export default function Page() { return <Article slug="how-to-perform-wudu" />; }
