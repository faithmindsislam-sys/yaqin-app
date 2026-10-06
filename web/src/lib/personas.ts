import type { Bi, TrackId } from "./types";

export const PERSONAS = {
  rayen: {
    name: { en: "Rayen", ar: "ريان" }, avatar: "/avatars/rayen.webp", gender: "male",
    role: { en: "Journey Guide", ar: "مرشد الرحلة" },
    welcome: { en: "I'm Rayen, your AI guide specializing in comparing religions and explaining Islam in a simple, approachable way. Ask me anything you'd like to discover.", ar: "أنا ريان، مرشدك الذكي المتخصص في مقارنة الأديان وشرح الإسلام بطريقة سهلة وواضحة. اسألني عمّا ترغب في اكتشافه." },
  },
  khaled: {
    name: { en: "Khaled", ar: "خالد" }, avatar: "/avatars/khaled.webp", gender: "male",
    role: { en: "Journey Guide", ar: "مرشد الرحلة" },
    welcome: { en: "I'm Khaled. Let's take your first steps as a Muslim together, one clear question at a time.", ar: "أنا خالد. لنتعلّم أساسيات الإسلام خطوة خطوة. اسألني عمّا تحتاج إلى فهمه." },
  },
  ibrahim: {
    name: { en: "Ibrahim", ar: "إبراهيم" }, avatar: "/avatars/ibrahim.webp", gender: "male",
    role: { en: "Journey Guide", ar: "مرشد الرحلة" },
    welcome: { en: "I'm Ibrahim. Let's deepen your understanding of Islam, with clear explanations and sources you can explore.", ar: "أنا إبراهيم. لنتعمّق في فهم الإسلام، بشرح واضح ومصادر يمكنك الرجوع إليها." },
  },
  mariam: {
    name: { en: "Mariam", ar: "مريم" }, avatar: "/avatars/mariam.webp", gender: "female",
    role: { en: "Learning Companion", ar: "رفيقة التعلّم" },
    welcome: { en: "I'm Mariam. Ask me about this page, or how its ideas connect to the rest of your course.", ar: "أنا مريم. اسألني عن هذه الصفحة، أو عن صلة أفكارها ببقية الدورة." },
  },
  hassan: {
    name: { en: "Hassan", ar: "حسن" }, avatar: "/avatars/hassan.webp", gender: "male",
    role: { en: "Course Creator", ar: "منشئ الدورات" },
    welcome: { en: "Tell me who your course is for and what it should cover. I'll prepare a draft.", ar: "أخبرني لمن تُعدّ الدورة وما الذي تريد أن تتناوله. سأجهّز مسودة." },
  },
} satisfies Record<string, { name: Bi; avatar: string; role: Bi; welcome: Bi; gender: "male" | "female" }>;

export type Persona = (typeof PERSONAS)[keyof typeof PERSONAS];

export function journeyGuide(journey: TrackId): Persona {
  return journey === "first-steps" ? PERSONAS.khaled : journey === "deepen" ? PERSONAS.ibrahim : PERSONAS.rayen;
}
