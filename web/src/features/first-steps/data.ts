import type { Bi } from "@/lib/types";
import type { CompareRef } from "@/features/compare/model";

const b = (en: string, ar: string): Bi => ({ en, ar });
const verse = (key: string): CompareRef => {
  const [s, v] = key.split(":");
  return { id: `quran:${key}`, title: b(`Quran ${key}`, `القرآن الكريم ${key}`), url: `/quran/?s=${s}&v=${v}` };
};
// Original teaching summaries, checked against the downloaded Osoul editions.
// Page numbers count the physical PDF pages, including the covers.
const book = (pages: string): CompareRef => ({ id: `first-steps:osoul:${pages}`,
  title: b(`My First Steps in Islam · Osoul Centre · PDF pp. ${pages}`, `خطواتي الأولى في الإسلام · مركز أصول · صفحات الملف ${pages} (المصدر بالإنجليزية)`),
  url: "https://osoulstore.com/book-list/english/my_first_steps_in_islam" });
const hadith = (id: number, title: Bi): CompareRef => ({ id: `first-steps:hadith:${id}`, title, url: `https://hadeethenc.com/en/browse/hadith/${id}` });
export type PracticeStep = { title: Bi; body: Bi };
export type DailyPrayer = { id: string; title: Bi; time: Bi; rakahs: number; recitation: Bi };
type BaseActivity = { id: string; title: Bi; sources: CompareRef[] };
export type Activity = BaseActivity & (
  | { kind: "walkthrough"; steps: PracticeStep[]; note?: Bi }
  | { kind: "shahada"; cards: (PracticeStep & { words: string; pronunciation: string; meaning: Bi })[] }
  | { kind: "guide"; body: Bi }
  | { kind: "recitation" }
  | { kind: "daily-prayers"; body: Bi }
  | { kind: "scenario"; question: Bi; options: { title: Bi; feedback: Bi }[] }
  | { kind: "community"; body: Bi; items: Bi[] }
);
export type PracticeStage = { id: string; title: Bi; intro: Bi; lessons: string[]; activities: Activity[] };
const step = (en: string, ar: string, bodyEn: string, bodyAr: string): PracticeStep => ({ title: b(en, ar), body: b(bodyEn, bodyAr) });
const guide = (id: string, title: Bi, body: Bi, sources: CompareRef[]): Activity => ({ id, title, body, sources, kind: "guide" });

// Obligatory rak’ahs and the prayer sequence: Osoul PDF pp. 44, 46–51.
export const DAILY_PRAYERS: DailyPrayer[] = [
  { id: "fajr", title: b("Fajr", "الفجر"), rakahs: 2, time: b("Dawn, before sunrise", "من طلوع الفجر إلى شروق الشمس"), recitation: b("Recitation aloud in both rak’ahs", "القراءة جهرًا في الركعتين") },
  { id: "dhuhr", title: b("Dhuhr", "الظهر"), rakahs: 4, time: b("After the sun passes its highest point, before Asr", "بعد زوال الشمس إلى دخول وقت العصر"), recitation: b("Quiet recitation in all four rak’ahs", "القراءة سرًّا في الركعات الأربع") },
  { id: "asr", title: b("Asr", "العصر"), rakahs: 4, time: b("Afternoon; pray before the sun turns yellow", "بعد الظهر؛ صلِّ قبل اصفرار الشمس"), recitation: b("Quiet recitation in all four rak’ahs", "القراءة سرًّا في الركعات الأربع") },
  { id: "maghrib", title: b("Maghrib", "المغرب"), rakahs: 3, time: b("From sunset until the red twilight disappears", "من غروب الشمس إلى غياب الشفق الأحمر"), recitation: b("Aloud in the first two rak’ahs; quiet in the third", "القراءة جهرًا في الركعتين الأوليين وسرًّا في الثالثة") },
  { id: "isha", title: b("Isha", "العشاء"), rakahs: 4, time: b("After the red twilight disappears; aim to pray before Islamic midnight, halfway between sunset and dawn", "بعد غياب الشفق الأحمر؛ احرص على الصلاة قبل منتصف الليل الشرعي، وهو منتصف المدة بين الغروب والفجر"), recitation: b("Aloud in the first two rak’ahs; quiet in the last two", "القراءة جهرًا في الركعتين الأوليين وسرًّا في الأخيرتين") },
];

const tashahhud = b(
  "Rise from the second prostration saying Allahu akbar and sit. Recite: At-tahiyyatu lillahi was-salawatu wat-tayyibat. As-salamu ‘alayka ayyuhan-nabiyyu wa rahmatullahi wa barakatuh. As-salamu ‘alayna wa ‘ala ‘ibadillahis-salihin. Ashhadu an la ilaha illallah, wa ashhadu anna Muhammadan ‘abduhu wa rasuluh.",
  "ارفع من السجدة الثانية قائلًا: الله أكبر، واجلس. اقرأ: التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ، السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ، السَّلَامُ عَلَيْنَا وَعَلَى عِبَادِ اللَّهِ الصَّالِحِينَ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ."
);

export function dailyPrayerSteps(prayer: DailyPrayer): (PracticeStep & { phase: Bi })[] {
  const steps: (PracticeStep & { phase: Bi })[] = [];
  const add = (phase: Bi, instruction: PracticeStep) => steps.push({ ...instruction, phase });
  add(b("Prepare", "الاستعداد"), step("Before you begin", "قبل أن تبدأ", `Check the local time for ${prayer.title.en}, your purification, covering and a clean place. Face the qiblah and intend this prayer in your heart.`, `تحقّق من وقت صلاة ${prayer.title.ar} في منطقتك، وطهارتك وستر العورة ونظافة المكان. استقبل القبلة وانوِ هذه الصلاة بقلبك.`));
  for (let unit = 1; unit <= prayer.rakahs; unit++) {
    const phase = b(`Rak’ah ${unit}`, `الركعة ${unit.toLocaleString("ar-EG")}`);
    add(phase, step(unit === 1 ? "Begin and recite" : "Stand and recite", unit === 1 ? "ابدأ واقرأ" : "قم واقرأ",
      `${unit === 1 ? "Raise your hands and say Allahu akbar (Allah is greater) to begin. Place your right hand over your left." : "Rise for this rak’ah saying Allahu akbar."} Recite Al-Fatihah while standing.${unit <= 2 ? " You may add a short surah or other Quran verses after it." : " In this rak’ah, recite Al-Fatihah."} ${prayer.id === "dhuhr" || prayer.id === "asr" || unit > 2 ? "Recite quietly, moving your lips." : "This is a rak’ah with audible recitation."}`,
      `${unit === 1 ? "ارفع يديك وقل: الله أكبر، لتبدأ الصلاة. ضع يدك اليمنى على اليسرى." : "قم لهذه الركعة قائلًا: الله أكبر."} اقرأ الفاتحة وأنت قائم.${unit <= 2 ? " ويمكنك أن تقرأ بعدها سورة قصيرة أو آيات من القرآن." : " في هذه الركعة اقرأ الفاتحة."} ${prayer.id === "dhuhr" || prayer.id === "asr" || unit > 2 ? "اقرأ سرًّا مع تحريك شفتيك." : "هذه ركعة تُجهر فيها بالقراءة."}`));
    add(phase, step("Bow · Ruku", "اركع", "Say Allahu akbar and bow, with your hands on your knees. Settle calmly and say Subhana rabbiyal-‘azim (Glory be to my Lord, the Magnificent).", "قل: الله أكبر، واركع واضعًا يديك على ركبتيك. اطمئنّ وقل: سُبْحَانَ رَبِّيَ الْعَظِيمِ."));
    add(phase, step("Stand upright", "اعتدل قائمًا", "When praying alone, rise saying Sami‘allahu liman hamidah (Allah hears whoever praises Him). Stand fully upright and say Rabbana wa lakal-hamd (Our Lord, to You belongs all praise).", "إذا صلّيت منفردًا، ارفع من الركوع قائلًا: سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ. اعتدل قائمًا وقل: رَبَّنَا وَلَكَ الْحَمْدُ."));
    add(phase, step("First prostration", "السجدة الأولى", "Say Allahu akbar and prostrate on your forehead and nose, both hands, both knees and the toes of both feet. Settle calmly and say Subhana rabbiyal-a‘la (Glory be to my Lord, the Most High).", "قل: الله أكبر، واسجد على جبهتك وأنفك وكفّيك وركبتيك وأطراف قدميك. اطمئنّ وقل: سُبْحَانَ رَبِّيَ الْأَعْلَى."));
    add(phase, step("Sit between prostrations", "اجلس بين السجدتين", "Say Allahu akbar and sit calmly. Say Rabbighfir li (My Lord, forgive me).", "قل: الله أكبر، واجلس مطمئنًّا بين السجدتين، وقل: رَبِّ اغْفِرْ لِي."));
    add(phase, step("Second prostration", "السجدة الثانية", "Say Allahu akbar and prostrate again. Settle calmly and repeat Subhana rabbiyal-a‘la. This completes this rak’ah.", "قل: الله أكبر، واسجد مرة ثانية. اطمئنّ وقل: سُبْحَانَ رَبِّيَ الْأَعْلَى. بهذا تتمّ هذه الركعة."));
    if (unit === 2 && unit < prayer.rakahs) add(b("First sitting", "التشهّد الأول"), { title: b("The first tashahhud", "التشهّد الأول"), body: tashahhud });
  }
  const final = b("Final sitting", "الجلوس الأخير");
  add(final, { title: b("The final tashahhud", "التشهّد الأخير"), body: tashahhud });
  add(final, step("Send blessings on the Prophet ﷺ", "صلِّ على النبي ﷺ", "Remain seated and recite: Allahumma salli ‘ala Muhammad wa ‘ala ali Muhammad, kama sallayta ‘ala Ibrahim wa ‘ala ali Ibrahim, innaka hamidun majid. Allahumma barik ‘ala Muhammad wa ‘ala ali Muhammad, kama barakta ‘ala Ibrahim wa ‘ala ali Ibrahim, innaka hamidun majid. You may then make supplication before the greeting.", "ابقَ جالسًا واقرأ: اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ. اللَّهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ. ويمكنك الدعاء قبل التسليم."));
  add(b("Finish", "الختام"), step("Finish with the greeting · Tasleem", "اختم بالتسليم", "Turn your head to the right and say As-salamu ‘alaykum wa rahmatullah (Peace and Allah’s mercy be upon you). Then turn to the left and say the same greeting. Your prayer is complete.", "التفت برأسك إلى اليمين وقل: السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ، ثم إلى اليسار وقل مثل ذلك. بهذا تتمّ صلاتك."));
  return steps;
}

export const FIRST_STEPS = {
  title: b("First Steps as a Muslim", "خطواتي الأولى كمسلم"),
  sub: b("A little guidance. A little practice. One step at a time.", "قليل من التوجيه، وقليل من التطبيق، خطوةً بعد خطوة."),
  path: b("Your practice path", "مسارك للتطبيق"),
  activities: b("Choose an activity", "اختر نشاطًا"),
  practice: b("Interactive practice", "تطبيق تفاعلي"),
  quick: b("Quick guide", "دليل مختصر"),
  next: b("Next step", "الخطوة التالية"),
  back: b("Previous step", "الخطوة السابقة"),
  pronunciation: b("Pronunciation", "النطق"),
  meaning: b("Meaning", "المعنى"),
  askHelp: b("Something unclear? Khaled, our AI guide, is happy to help.", "هل هناك ما لم تفهمه؟ خالد، مرشدنا بالذكاء الاصطناعي، يسعده مساعدتك."),
  askKhaled: b("Ask Khaled", "اسأل خالد"),
  of: b("of", "من"),
  retry: b("Try again", "حاول مجددًا"),
};

export const PRACTICE_STAGES: PracticeStage[] = [
  { id: "foundations", title: b("My foundations", "أساسياتي"), intro: b("Understand your Shahada and what your new beginning means.", "افهم شهادتك ومعنى بدايتك الجديدة."), lessons: ["fs-meaning-of-shahada", "fs-a-fresh-start", "fs-six-pillars-of-faith"], activities: [
    { id: "shahada", title: b("My Shahada", "شهادتي"), kind: "shahada", sources: [book("14–19"), verse("3:18"), verse("33:40")], cards: [
      { ...step("Worship Allah alone", "أعبد الله وحده", "The first testimony means that Allah alone deserves worship. Your prayer and supplication are directed to Him.", "تعني الشهادة الأولى أن الله وحده يستحق العبادة، فتتوجّه إليه بصلاتك ودعائك."), words: "أشهد أن لا إله إلا الله", pronunciation: "Ash-hadu an la ilaha illa-Allah.", meaning: b("I bear witness that there is no god worthy of worship except Allah.", "أشهد أنه لا معبود بحق إلا الله.") },
      { ...step("Follow His Messenger", "أتّبع رسوله", "The second testimony means accepting Muhammad ﷺ as Allah’s Messenger and learning to follow his guidance.", "تعني الشهادة الثانية الإيمان بأن محمدًا ﷺ رسول الله، وتعلّم اتباع هديه."), words: "وأشهد أن محمدًا رسول الله", pronunciation: "Wa ash-hadu anna Muhammadan rasulu-Allah.", meaning: b("And I bear witness that Muhammad is the Messenger of Allah.", "وأشهد أن محمدًا رسول الله.") },
    ] },
    guide("fresh-start", b("A fresh start", "بداية جديدة"), b("Entering Islam is a new beginning. Learn what you need for daily worship, and keep asking questions as your understanding grows.", "الدخول في الإسلام بداية جديدة. تعلّم ما تحتاجه لعبادتك اليومية، واستمر في السؤال ليزداد فهمك."), [book("78–79")]),
    guide("belief-basics", b("My belief basics", "أساسيات إيماني"), b("Begin with belief in Allah, His angels, His books, His messengers, the Last Day, and the decree. Take each topic in a clear, simple way before studying it more deeply.", "ابدأ بالإيمان بالله وملائكته وكتبه ورسله واليوم الآخر والقدر. افهم كل ركن بصورة واضحة ومبسّطة ثم تعمّق فيه."), [hadith(4563, b("The hadith of Jibril: Islam and faith", "حديث جبريل: الإسلام والإيمان")), verse("4:136")]),
  ] },
  { id: "purification", title: b("Purification", "الطهارة"), intro: b("Prepare for prayer with a calm, step-by-step wudu walkthrough.", "استعدّ للصلاة بدليل هادئ للوضوء خطوةً بخطوة."), lessons: ["wudu-order", "what-breaks-wudu", "fs-ghusl", "fs-tayammum"], activities: [
    { id: "wudu", title: b("Wudu walkthrough", "الوضوء خطوةً بخطوة"), kind: "walkthrough", sources: [book("40–41"), verse("5:6")], note: b("This walkthrough follows the complete method described in the source. Washing once can suffice; three washes are the fuller Sunnah. The head is wiped once.", "يتّبع هذا الدليل الصفة الكاملة الواردة في المصدر. تجزئ الغسلة الواحدة، والتثليث هو السنّة الكاملة. ويُمسح الرأس مرة واحدة."), steps: [
      step("Begin with intention", "ابدأ بالنية", "Intend in your heart to purify yourself for prayer. There is no need to say the intention aloud.", "انوِ بقلبك التطهّر للصلاة، ولا حاجة إلى التلفّظ بالنية."),
      step("Wash the hands", "اغسل الكفّين", "Wash both hands. The source describes washing them three times at the start.", "اغسل كفّيك. يصف المصدر غسلهما ثلاث مرات في البداية."),
      step("Rinse mouth and nose", "تمضمض واستنشق", "Rinse your mouth and nose with water, as shown in the source’s wudu sequence.", "تمضمض واستنشق بالماء كما ورد في ترتيب الوضوء في المصدر."),
      step("Wash the face", "اغسل الوجه", "Wash the whole face, from the hairline to the chin and from ear to ear.", "اغسل وجهك كاملًا، من منابت الشعر إلى الذقن، ومن الأذن إلى الأذن."),
      step("Wash the arms", "اغسل اليدين إلى المرفقين", "Wash each arm from the fingertips to and including the elbow, beginning with the right.", "اغسل كل يد من أطراف الأصابع إلى المرفق مع غسله، مبتدئًا باليمنى."),
      step("Wipe the head and ears", "امسح الرأس والأذنين", "Wipe the head once with wet hands, then wipe the ears.", "امسح رأسك مرة واحدة بيدين مبلولتين، ثم امسح الأذنين."),
      step("Wash the feet", "اغسل الرجلين", "Wash each foot to and including the ankle, right before left. Make sure water reaches the heels.", "اغسل كل رجل إلى الكعب مع غسله، اليمنى قبل اليسرى، وتأكد من وصول الماء إلى العقبين."),
    ] },
    guide("ghusl", b("Ghusl basics", "أساسيات الغُسل"), b("Ghusl is a full washing with the intention to purify, making sure water reaches the whole body. It is required in particular circumstances, such as major impurity and after menstrual or postnatal bleeding ends. Scholars differ about ghusl on entering Islam; ask a trusted teacher which view to follow.", "الغُسل غسل كامل مع نية التطهّر، يصل فيه الماء إلى جميع البدن. يجب في حالات معيّنة كالجنابة وبعد انتهاء الحيض أو النفاس. ويختلف العلماء في حكم الغُسل عند دخول الإسلام، فاسأل معلّمًا موثوقًا عن القول الذي تتّبعه."), [book("38–39"), verse("5:6")]),
    guide("tayammum", b("When water is unavailable", "عند تعذّر استعمال الماء"), b("Tayammum is an alternative purification when water is unavailable or cannot be used. Learn its circumstances and method with a trusted teacher, especially when illness is involved.", "التيمّم طهارة بديلة عند عدم وجود الماء أو تعذّر استعماله. تعلّم أحكامه وصفته مع معلّم موثوق، خاصة عند المرض."), [book("42"), verse("5:6")]),
  ] },
  { id: "prayer", title: b("My prayer", "صلاتي"), intro: b("Learn the movements calmly, and connect them to your daily prayers.", "تعلّم الحركات بسكينة واربطها بصلواتك اليومية."), lessons: ["fs-how-to-pray", "fs-five-daily-prayers", "why-face-qibla"], activities: [
    { id: "rakah", title: b("Practise one rak’ah", "تدرّب على ركعة"), kind: "walkthrough", sources: [book("46–51"), hadith(3185, b("Learning to pray with calm", "تعلّم الطمأنينة في الصلاة"))], note: b("This rehearses the movements of one unit, not a complete prayer. The words, number of units, final sitting, and greeting are part of learning the full prayer.", "هذا تدريب على حركات ركعة واحدة، وليس صلاة كاملة. والأذكار وعدد الركعات والجلوس الأخير والتسليم من تعلّم الصلاة كاملة."), steps: [
      step("Stand and begin", "قف وابدأ", "Begin with the opening takbir, then recite while standing.", "ابدأ بتكبيرة الإحرام، ثم اقرأ وأنت قائم."),
      step("Bow · Ruku", "اركع", "Move into bowing and settle calmly before moving on.", "انتقل إلى الركوع واطمئنّ فيه قبل الانتقال."),
      step("Stand upright", "اعتدل قائمًا", "Rise from bowing and settle fully upright.", "ارفع من الركوع واعتدل قائمًا حتى تطمئنّ."),
      step("Prostrate · Sujud", "اسجد", "Move into the first prostration and settle calmly.", "انتقل إلى السجدة الأولى واطمئنّ فيها."),
      step("Sit", "اجلس", "Sit calmly between the two prostrations.", "اجلس بين السجدتين واطمئنّ في جلوسك."),
      step("Prostrate again", "اسجد مرة ثانية", "Complete the second prostration. These movements form one rak’ah.", "أتمّ السجدة الثانية. هذه الحركات تكوّن ركعة واحدة."),
    ] },
    guide("before-prayer", b("Before I pray", "قبل أن أصلّي"), b("Check the prayer time, purification, appropriate covering, a clean body, clothing and place, and the qiblah. Ask a teacher about any situation you are unsure of.", "تحقّق من وقت الصلاة والطهارة وستر العورة ونظافة البدن والملابس والمكان واستقبال القبلة. واسأل معلّمًا عمّا يشكل عليك."), [book("45–46"), verse("2:144"), verse("5:6")]),
    { id: "daily-prayers", title: b("Five daily prayers", "الصلوات الخمس"), kind: "daily-prayers", body: b("Muslims pray five obligatory prayers each day: Fajr, Dhuhr, Asr, Maghrib and Isha. Choose a prayer to walk through it. Check a trusted local timetable for its exact time.", "يصلّي المسلم خمس صلوات مفروضة كل يوم: الفجر والظهر والعصر والمغرب والعشاء. اختر صلاة لتتعلّمها خطوةً بخطوة. تحقّق من وقتها الدقيق في جدول محلي موثوق."), sources: [book("43–51")] },
  ] },
  { id: "recitation", title: b("My recitation", "قراءتي"), intro: b("Listen to Al-Fatihah one verse at a time, explore its meaning, and practise recalling it.", "استمع إلى الفاتحة آيةً آية، وافهم معانيها وتدرّب على تذكّرها."), lessons: ["fs-what-i-recite", "al-fatiha-meaning"], activities: [
    { id: "fatiha", title: b("Al-Fatihah", "الفاتحة"), kind: "recitation", sources: [verse("1:1"), book("47") ] },
    guide("prayer-words", b("Prayer phrases", "أذكار الصلاة"), b("Learn the opening takbir, the remembrance in bowing and prostration, and the words of the final sitting. Understand a short phrase before adding the next.", "تعلّم تكبيرة الإحرام وأذكار الركوع والسجود وكلمات التشهّد. افهم العبارة القصيرة ثم أضف إليها ما يليها."), [book("47–51")]),
    guide("short-surahs", b("Short surahs", "سور قصيرة"), b("After learning Al-Fatihah, explore a short surah such as Al-Ikhlas, Al-Kawthar or Al-Asr. Listen to a trusted reciter and repeat one verse at a time.", "بعد تعلّم الفاتحة، ابدأ بسورة قصيرة كالإخلاص أو الكوثر أو العصر. استمع إلى قارئ موثوق وكرّر آيةً آية."), [verse("112:1"), verse("108:1"), verse("103:1")]),
  ] },
  { id: "everyday-life", title: b("Everyday life", "حياتي اليومية"), intro: b("Explore a real situation, with a gentle next step you can use.", "استكشف موقفًا واقعيًّا وخطوة عملية لطيفة للتعامل معه."), lessons: ["fs-my-family", "fs-halal-food", "fs-small-and-steady"], activities: [
    { id: "family", title: b("My family", "أسرتي"), kind: "scenario", sources: [verse("31:15"), verse("60:8")], question: b("“My family is worried about my new faith.”", "«أسرتي قلقة بشأن ديني الجديد.»"), options: [
      { title: b("Listen calmly and keep showing kindness", "أستمع بهدوء وأواصل الإحسان"), feedback: b("Hear their worries, explain what matters to you gently, and keep family ties warm. The Quran teaches kindness to parents even when they do not share your faith.", "استمع إلى مخاوفهم، واشرح ما يهمّك برفق، وحافظ على دفء الصلة. يعلّم القرآن الإحسان إلى الوالدين حتى إن لم يشاركاك الإيمان.") },
      { title: b("I need help with this conversation", "أحتاج مساعدة في هذا الحوار"), feedback: b("Prepare your questions for a trusted teacher who understands your family situation. You can seek support while continuing to treat your family with kindness.", "جهّز أسئلتك لمعلّم موثوق يفهم وضع أسرتك. يمكنك طلب الدعم مع الاستمرار في الإحسان إليهم.") },
    ] },
    guide("food", b("Food & daily life", "الطعام والحياة اليومية"), b("Begin with the clear basics of permissible food and drink. When a particular ingredient or situation is unclear, ask a knowledgeable teacher rather than guessing.", "ابدأ بالأساسيات الواضحة للطعام والشراب الحلال. وعند الشك في مكوّن أو حالة معيّنة، اسأل أهل العلم بدل التخمين."), [book("72–73"), verse("5:3")]),
    guide("steady-habits", b("Small, steady habits", "عادات قليلة دائمة"), b("Keep learning your daily obligations. Alongside them, choose one small extra habit you can maintain, such as a little remembrance after prayer. Build steadily without overburdening yourself.", "واصل تعلّم واجباتك اليومية. واختر معها عملًا إضافيًّا صغيرًا تستطيع المداومة عليه، كذكر قليل بعد الصلاة. ابنِ عاداتك بثبات دون أن ترهق نفسك."), [{ id: "hadith:bukhari:6464", title: b("The most beloved deeds are consistent", "أحب الأعمال أدومها"), url: "https://sunnah.com/bukhari:6464" }, book("82")]),
  ] },
  { id: "community", title: b("My community", "مجتمعي"), intro: b("Prepare for your first mosque visit and find people who can support your learning.", "استعدّ لزيارتك الأولى للمسجد وتعرّف على من يعينك في التعلّم."), lessons: ["fs-mosque-and-community", "fs-learning-well", "fs-doubts-and-questions"], activities: [
    { id: "mosque-visit", title: b("My first mosque visit", "زيارتي الأولى للمسجد"), kind: "community", sources: [verse("49:10"), book("79–82")], body: b("When you feel ready, a nearby mosque or Islamic center can help you get started. These are optional suggestions for your visit. Contact the center, tell them you are a new Muslim, and ask when someone can welcome you and help you learn.", "عندما تشعر بالاستعداد، يمكن لمسجد أو مركز إسلامي قريب أن يعينك في بدايتك. هذه اقتراحات اختيارية لزيارتك. تواصل مع المركز وأخبرهم أنك مسلم جديد، واسأل عن وقت يستقبلك فيه أحد ويساعدك على التعلّم."), items: [b("Look for a nearby mosque or Islamic center.", "ابحث عن مسجد أو مركز إسلامي قريب."), b("Call or message them to arrange a welcoming visit.", "اتّصل بهم أو راسلهم لترتيب زيارة يُرحَّب بك فيها."), b("Bring any questions you would like to ask a teacher.", "اصطحب الأسئلة التي ترغب في طرحها على معلّم.") ] },
    guide("teacher", b("A trusted teacher", "معلّم موثوق"), b("Look for a knowledgeable teacher who welcomes questions and explains the sources. Supportive companions can help you learn and practise consistently.", "ابحث عن معلّم ذي علم يرحّب بالأسئلة ويوضّح المصادر. ويمكن للصحبة الصالحة أن تعينك على التعلّم والعمل باستمرار."), [book("79–82")]),
    guide("questions", b("Questions I can ask", "أسئلة أستطيع طرحها"), b("Try: “Can you show me how to prepare for prayer?” or “What can I do while I am still learning the recitation?” Bring the question that matters most to you today.", "اسأل مثلًا: «هل تريني كيف أستعدّ للصلاة؟» أو «ماذا أفعل وأنا لا أزال أتعلّم القراءة؟» ابدأ بالسؤال الأهمّ لك اليوم."), [book("79"), verse("16:43")]),
  ] },
];

export const firstStepsHref = (id: string) => `/first-steps/?step=${encodeURIComponent(id)}`;
