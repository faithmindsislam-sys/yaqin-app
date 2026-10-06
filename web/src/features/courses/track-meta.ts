import { BookOpen, Compass, Sprout } from "lucide-react";
import { FIRST_STEPS_TITLE } from "./catalog";
import type { TrackId } from "@/lib/types";

export const TRACK_META: Record<TrackId, { icon: typeof Compass; tint: string; ring: string; tags: { en: string; ar: string }[] }> = {
  explore: {
    icon: Compass,
    tint: "from-sky-100 to-white",
    ring: "bg-sky-200 text-ink",
    tags: [
      { en: "Basics", ar: "الأساسيات" },
      { en: "Beliefs", ar: "العقيدة" },
      { en: "Common questions", ar: "أسئلة شائعة" },
    ],
  },
  "first-steps": {
    icon: Sprout,
    tint: "from-brand-50 to-white",
    ring: "bg-brand-100 text-brand-700",
    tags: [
      FIRST_STEPS_TITLE,
      { en: "Daily practice", ar: "عمل يومي" },
      { en: "Support", ar: "مرافقة" },
    ],
  },
  deepen: {
    icon: BookOpen,
    tint: "from-salmon-50 to-white",
    ring: "bg-salmon-100 text-salmon-700",
    tags: [
      { en: "Quran", ar: "القرآن" },
      { en: "Tafsir", ar: "التفسير" },
      { en: "Fiqh", ar: "الفقه" },
    ],
  },
};

