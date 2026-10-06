import { PERSONAS, type Persona } from "@/lib/personas";
import type { Bi, TrackId } from "@/lib/types";

export const HASSAN_EDUCATOR_ROLE: Bi = { en: "Educator assistant", ar: "مساعد المعلّمين" };

export const SITE_LINKS = {
  email: "faithmindsislam@gmail.com",
  instagram: "https://www.instagram.com/yaqeenguide/",
  facebook: "https://www.facebook.com/profile.php?id=61594989577341",
  x: "https://x.com/YakeenGuide",
  youtube: "https://www.youtube.com/@YaqeenGuide",
  docs: "https://public-api.yaqeenguide.com/api/v1/docs",
  mcpGuide: "https://public-api.yaqeenguide.com/api/v1/docs#mcp",
  mcp: "https://public-api.yaqeenguide.com/api/v1/mcp/",
};

export const JOURNEYS: { id: TrackId; title: Bi; audience: Bi; description: Bi; topics: Bi[]; guide: Persona; href: string }[] = [
  { id: "explore", title: { en: "Explore Islam", ar: "اكتشف الإسلام" }, audience: { en: "For the curious mind", ar: "لكل عقل يتساءل" }, description: { en: "Bring your questions. Discover the beliefs, explore different perspectives, and understand Islam without pressure.", ar: "اطرح أسئلتك. اكتشف العقيدة وتعرّف على وجهات النظر وافهم الإسلام بلا ضغط." }, topics: [{ en: "Beliefs & big questions", ar: "العقيدة والأسئلة الكبرى" }, { en: "Comparing religions", ar: "مقارنة الأديان" }, { en: "Islam in everyday life", ar: "الإسلام في الحياة اليومية" }], guide: PERSONAS.rayen, href: "/start/explore/" },
  { id: "first-steps", title: { en: "First Steps as a Muslim", ar: "خطواتي الأولى كمسلم" }, audience: { en: "For a new beginning", ar: "لبداية جديدة" }, description: { en: "You don’t have to learn everything at once. Build confidence in prayer, purification, and daily life, one gentle step at a time.", ar: "لا يلزمك أن تتعلّم كل شيء دفعة واحدة. تعلّم الصلاة والطهارة والحياة اليومية بثقة، خطوة هادئة كل مرة." }, topics: [{ en: "The essentials of faith", ar: "أساسيات الإيمان" }, { en: "Wudu & daily prayer", ar: "الوضوء والصلاة اليومية" }, { en: "Habits & community", ar: "العادات والمجتمع" }], guide: PERSONAS.khaled, href: "/start/?track=first-steps" },
  { id: "deepen", title: { en: "Deepen My Knowledge", ar: "أعمّق معرفتي" }, audience: { en: "For a deeper connection", ar: "لصلة أعمق" }, description: { en: "Go beyond the routine. Understand what you recite, connect with the Quran, and bring more meaning to your worship.", ar: "تجاوز العادة إلى الفهم. افهم ما تتلوه وتواصل مع القرآن وأضف معنى أعمق إلى عبادتك." }, topics: [{ en: "Quran & its meanings", ar: "القرآن ومعانيه" }, { en: "Worship with understanding", ar: "عبادة بفهم" }, { en: "Hadith, seerah & character", ar: "الحديث والسيرة والأخلاق" }], guide: PERSONAS.ibrahim, href: "/start/?track=deepen" },
];

export const ARTICLES = [
  { slug: "how-to-perform-wudu", title: { en: "A clear beginning: how to perform wudu", ar: "بداية واضحة: كيف تتوضأ" }, category: { en: "Everyday worship", ar: "العبادة اليومية" }, description: { en: "A simple walk through the washing described in the Quran and the practice narrated from the Prophet ﷺ.", ar: "خطوات بسيطة للوضوء المذكور في القرآن والمنقول عن النبي ﷺ." }, image: "/img/site/wudu.jpg", alt: { en: "Clear water flowing from a brass tap into a stone basin", ar: "ماء صافٍ يتدفّق من صنبور نحاسي إلى حوض حجري" }, minutes: 3 },
  { slug: "what-is-zakat", title: { en: "Understanding zakat: a little that means a lot", ar: "فهم الزكاة: قدر قليل وأثر كبير" }, category: { en: "Foundations of faith", ar: "أساسيات الدين" }, description: { en: "What zakat means, where the familiar 2.5% comes in, and why the conditions matter.", ar: "معنى الزكاة، ومتى تنطبق نسبة ٢٫٥٪، ولماذا تهمّ شروطها." }, image: "/img/site/zakat.jpg", alt: { en: "A blue ceramic bowl with coins beside an olive branch", ar: "وعاء خزفي أزرق فيه عملات بجانب غصن زيتون" }, minutes: 3 },
] as const;
