import type { Metadata, Viewport } from "next";
import { Amiri_Quran, DM_Serif_Display, Readex_Pro } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { ContentProvider } from "@/features/courses/ContentProvider";
import { RouteGuard } from "@/components/RouteGuard";
import "./globals.css";
import "@/features/onboarding/styles.css";
import "@/features/site/styles.css";
import "@/features/studio/curriculum/styles.css";
import "@/features/studio/course-editor/styles.css";
import "@/features/courses/content.css";
import "@/features/studio/course-editor/rich-text.css";

const readex = Readex_Pro({ variable: "--font-readex", subsets: ["latin", "arabic"], display: "swap" });
const dmSerif = DM_Serif_Display({
  variable: "--font-dmserif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});
const amiriQuran = Amiri_Quran({ variable: "--font-amiri-quran", subsets: ["arabic"], weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: "Yaqeen — Knowledge that brings you closer",
  description:
    "Short visual Islamic lessons you can listen to and talk to, in Arabic and English, with every claim traceable to an approved source.",
};

export const viewport: Viewport = { themeColor: "#075aab" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${readex.variable} ${dmSerif.variable} ${amiriQuran.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <RouteGuard />
        <I18nProvider>
          <SessionProvider><ContentProvider>{children}</ContentProvider></SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
