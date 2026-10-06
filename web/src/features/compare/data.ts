import type { Bi } from "@/lib/types";
import type { CompareData, CompareNode, CompareRef } from "@/features/compare/model";

// Content for Religion & Belief Comparison. Edit this file to add a belief, tradition, topic, comparison or path text:
// the interface reads everything from here. Ids are stable: they appear in links, so do not rename them.
//
// Writing rules for comparisons and path text:
// - Describe a belief in words its own followers accept. Write "Islam teaches…", never that another belief is false.
// - Short sentences, simple words, and explain every term where it appears.
// - Every claim carries its reference in brackets, and the same reference is listed in the topic's `sources`.

const TOPICS = {
  god: { en: "God and existence", ar: "الإله والوجود" },
  sources: { en: "Holy books and prophets", ar: "الكتب المقدسة والأنبياء" },
  life: { en: "Human life and purpose", ar: "حياة الإنسان وغايتها" },
  practice: { en: "Ethics and religious practices", ar: "الأخلاق والشعائر الدينية" },
  afterlife: { en: "Life after death", ar: "الحياة بعد الموت" },
} satisfies Record<string, Bi>;

type TopicKey = keyof typeof TOPICS;

// Labels for positions that have no scripture or worship.
const NON_RELIGIOUS: Partial<Record<TopicKey, Bi>> = {
  god: { en: "The question of God's existence", ar: "مسألة وجود الإله" },
  sources: { en: "Reason, science and revelation", ar: "العقل والعلم والوحي" },
  practice: { en: "Ethics and way of life", ar: "الأخلاق ونمط الحياة" },
  afterlife: { en: "Death and what follows", ar: "الموت وما بعده" },
};

/** The standard topics under a belief or tradition, with optional adapted labels. Topic id: `<parent>.<topic>`. */
const topics = (parent: string, labels: Partial<Record<TopicKey, Bi>> = {}): CompareNode[] =>
  (Object.keys(TOPICS) as TopicKey[]).map((key) => ({ id: `${parent}.${key}`, type: "topic", parent, title: labels[key] ?? TOPICS[key] }));

const node = (type: CompareNode["type"], parent: string, id: string, en: string, ar: string): CompareNode => ({ id, type, parent, title: { en, ar } });
/** A group of the classification, with one line that says what its members share. */
const group = (parent: string, id: string, en: string, ar: string, noteEn: string, noteAr: string): CompareNode => ({ ...node("group", parent, id, en, ar), note: { en: noteEn, ar: noteAr } });

// --- Text and references ---

const digits = (text: string) => text.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
/** Arabic text is typed with 0-9 and shown with Arabic digits. */
const bi = (en: string, ar: string): Bi => ({ en, ar: digits(ar) });
const link = (id: string, en: string, ar: string, url: string): CompareRef => ({ id, title: bi(en, ar), url });

// Verses that are in the content bundle (content/sources/quran.json): they are shown word for word by their source id.
// Any other verse is a titled link to the Quran reader. To show one in full, add it to the bundle first, then to this list.
const BUNDLED = new Set(["1:3", "1:4", "1:5", "2:143", "2:164", "2:177", "2:255", "2:256", "5:6", "7:158", "20:114", "42:11", "52:35", "57:3", "60:8", "112:1", "112:2", "112:3", "112:4"]);
// Names as in the Quran reader (public/data/quran/index.json).
const SURAHS: Record<number, [latin: string, ar: string]> = {
  1: ["Al-Fātiḥah", "الفاتحة"], 2: ["Al-Baqarah", "البقرة"], 3: ["Āl-‘Imrān", "آل عمران"], 4: ["An-Nisā’", "النساء"], 5: ["Al-Mā’idah", "المائدة"],
  6: ["Al-An‘ām", "الأنعام"], 7: ["Al-A‘rāf", "الأعراف"], 9: ["At-Taubah", "التوبة"], 10: ["Yūnus", "يونس"],
  15: ["Al-Ḥijr", "الحجر"], 16: ["An-Naḥl", "النحل"], 17: ["Al-Isrā’", "الإسراء"], 19: ["Maryam", "مريم"], 20: ["Ṭā-Hā", "طه"],
  21: ["Al-Anbiyā’", "الأنبياء"], 22: ["Al-Ḥajj", "الحج"], 23: ["Al-Mu’minūn", "المؤمنون"], 29: ["Al-‘Ankabūt", "العنكبوت"], 30: ["Ar-Rūm", "الروم"],
  32: ["As-Sajdah", "السجدة"], 33: ["Al-Aḥzāb", "الأحزاب"], 35: ["Fāṭir", "فاطر"], 36: ["Yā-Sīn", "يس"], 39: ["Az-Zumar", "الزمر"],
  42: ["Ash-Shūra", "الشورى"], 43: ["Az-Zukhruf", "الزخرف"], 45: ["Al-Jāthiyah", "الجاثية"], 46: ["Al-Aḥqāf", "الأحقاف"], 49: ["Al-Ḥujurāt", "الحجرات"],
  51: ["Adh-Dhāriyāt", "الذاريات"], 52: ["Aṭ-Ṭūr", "الطور"], 53: ["An-Najm", "النجم"], 57: ["Al-Ḥadīd", "الحديد"], 60: ["Al-Mumtaḥanah", "الممتحنة"],
  61: ["Aṣ-Ṣaff", "الصف"], 67: ["Al-Mulk", "الملك"], 76: ["Al-Insān", "الإنسان"], 91: ["Ash-Shams", "الشمس"], 95: ["At-Tīn", "التين"],
  99: ["Az-Zalzalah", "الزلزلة"], 112: ["Al-Ikhlāṣ", "الإخلاص"],
  13: ["Ar-Ra‘d", "الرعد"], 25: ["Al-Furqān", "الفرقان"], 28: ["Al-Qaṣaṣ", "القصص"], 40: ["Ghāfir", "غافر"], 41: ["Fuṣṣilat", "فصلت"],
  50: ["Qāf", "ق"], 55: ["Ar-Raḥmān", "الرحمٰن"], 62: ["Al-Jumu‘ah", "الجمعة"], 79: ["An-Nāzi‘āt", "النازعات"], 94: ["Ash-Sharḥ", "الشرح"],
};

/** One verse `quran("4:171")` or a range in one surah `quran("4:157–158")`. */
const quran = (key: string): CompareRef => {
  const [surah, verses] = key.split(":");
  const [latin, ar] = SURAHS[+surah];
  return {
    id: BUNDLED.has(key) ? `quran:${key}` : `verse:${key}`,
    title: bi(`Quran ${key} (${latin})`, `القرآن الكريم، ${ar}: ${verses}`),
    url: `/quran/?s=${surah}&v=${parseInt(verses)}`,
  };
};

/** A Bible passage, linked to the World English Bible text: `bible("John 3:16", "يوحنا 3: 16")`. */
const bible = (en: string, ar: string): CompareRef =>
  link(`bible:${en}`, `The Bible, ${en}`, `الكتاب المقدس، ${ar}`, `https://www.biblegateway.com/passage/?search=${encodeURIComponent(en.replace("–", "-"))}&version=WEB`);

const CREEDS = link("creeds", "The Apostles' Creed and the Nicene Creed (text on the Church of England website)", "قانون إيمان الرسل وقانون الإيمان النيقاوي (النص في موقع كنيسة إنجلترا، بالإنجليزية)", "https://www.churchofengland.org/our-faith/what-we-believe/apostles-creed");
const ARABIC_BIBLE = link("bible-ar:John 3:16", "The Bible in Arabic, John 3:16 (Ketab El Hayat translation)", "الكتاب المقدس بالعربية، يوحنا 3: 16 (ترجمة كتاب الحياة)", "https://www.biblegateway.com/passage/?search=John+3:16&version=NAV");
const AMERICAN_ATHEISTS = link("american-atheists", "American Atheists, “What is an Atheist?”", "منظمة الملحدين الأمريكيين (American Atheists)، «من هو الملحد؟» (بالإنجليزية)", "https://www.atheists.org/activism/resources/about-atheism/");
const SEP = link("sep-atheism", "Stanford Encyclopedia of Philosophy, “Atheism and Agnosticism” (Paul Draper)", "موسوعة ستانفورد للفلسفة، مادة «الإلحاد واللاأدرية» لبول درايبر (بالإنجليزية)", "https://plato.stanford.edu/entries/atheism-agnosticism/");
const HUMANISTS_UK = link("humanists-uk", "Humanists UK, “Humanism”", "جمعية الإنسانيين في بريطانيا (Humanists UK)، «المذهب الإنساني» (بالإنجليزية)", "https://humanists.uk/humanism/");
const DECLARATION = link("humanist-declaration", "Humanists International, “Declaration of Modern Humanism” (2022)", "المنظمة الدولية للإنسانيين (Humanists International)، «إعلان الإنسانية الحديثة» 2022 (بالإنجليزية)", "https://humanists.international/policy/declaration-of-modern-humanism/");

// Books from the resource export. Their reuse licence is unknown: paraphrase and give the page, never copy a passage.
// Page numbers are the ones printed in the English PDF.
const comparisonBook = (pages: string) =>
  link(`comparison-book:${pages}`, `Muhammad As-Sayed Muhammad, “A Comparison between Islam, Christianity and Judaism and the choice between them”, ${pages.includes("–") ? "pp." : "p."} ${pages}`, `محمد السيد محمد، «A Comparison between Islam, Christianity and Judaism and the choice between them» (بالإنجليزية)، ص ${pages}`, "https://islamhouse.com/en/books/395994/");
const atheistDialogue = (pages: string) =>
  link(`atheist-dialogue:${pages}`, `Manea Hussein Al-Hazmi, “Dialogue with an Atheist”, ${pages.includes("–") ? "pp." : "p."} ${pages}`, `مانع حسين الحازمي، «Dialogue with an Atheist» (بالإنجليزية)، ص ${pages}`, "https://islamhouse.com/en/books/2831163/");

// Sources of other kinds that are in the content bundle. The title and link are only used if the bundle does not have them.
const HADITH_FIVE = link("hadith:henc:65000", "Hadith: “Islam is built on five” (Al-Bukhari and Muslim)", "حديث: «بُني الإسلام على خمس» (متفق عليه)", "https://hadeethenc.com/en/browse/hadith/65000");
const HADITH_DIMAM = link("hadith:henc:65044", "Hadith of Dimam ibn Tha‘labah (Al-Bukhari and Muslim)", "حديث ضِمام بن ثعلبة (متفق عليه)", "https://hadeethenc.com/en/browse/hadith/65044");
const TERM_ALLAH = link("ref:terminologyenc:16760", "Allah — Encyclopedia of Islamic Terms", "اللهُ — موسوعة المصطلحات الإسلامية", "https://terminologyenc.com/en/browse/term/16760");
const BOOK_ORIGIN = link("ref:book:god-existence:origin", "Abandoning Atheism for Islam, p. 11", "الإسلام والإلحاد وجهًا لوجه، ص 11", "https://islamhouse.com/en/books/2834110/");
const BOOK_UNCREATED = link("ref:book:god-existence:uncreated", "Abandoning Atheism for Islam, p. 35", "الإسلام والإلحاد وجهًا لوجه، ص 35", "https://islamhouse.com/en/books/2834110/");

// --- References for the other beliefs ---
// Two kinds stand side by side. The approved Islamic references of the project (dawa.center and the Dorar encyclopedia) give the facts
// and their order. Their wording is polemical, so nothing is quoted or translated from them. Beside them stands a text or a body of
// the belief itself, so that the belief is described in words its own followers accept.

/** A page of the Dorar encyclopedia of religions (dorar.net/adyan). A local copy is in resources/dorar/adyan. */
const dorar = (id: number, en: string, ar: string) =>
  link(`dorar:${id}`, `Dorar, Encyclopedia of Religions, “${en}” (in Arabic)`, `الدرر السنية، موسوعة الأديان، «${ar}»`, `https://dorar.net/adyan/${id}`);
/** A religion's entry in the Digital Dawah Repository. */
const dawa = (id: number, en: string, ar: string) =>
  link(`dawa:${id}`, `Digital Dawah Repository (dawa.center), “${en}” (in Arabic)`, `المستودع الدعوي الرقمي (dawa.center)، «${ar}»`, `https://dawa.center/religion/${id}`);

// Judaism. Hebrew Bible passages open on Sefaria, a library of Jewish texts, in a Jewish translation.
const sefaria = (ref: string) => `https://www.sefaria.org/${ref.replace(/ (?=\d)/, ".").replace(":", ".").replace("–", "-").replace(/ /g, "_")}`;
/** `tanakh("Deuteronomy 6:4", "التثنية 6: 4")` */
const tanakh = (en: string, ar: string): CompareRef => link(`sefaria:${en}`, `Hebrew Bible, ${en}`, `الكتاب المقدس العبري (التناخ)، ${ar}`, sefaria(en));
const AVOT_1_1 = link("sefaria:Pirkei Avot 1:1", "Mishnah, Pirkei Avot 1:1", "المشناه، فصول الآباء (بيركي أفوت) 1: 1", sefaria("Pirkei Avot 1:1"));
const AVOT_4_16 = link("sefaria:Pirkei Avot 4:16", "Mishnah, Pirkei Avot 4:16", "المشناه، فصول الآباء (بيركي أفوت) 4: 16", sefaria("Pirkei Avot 4:16"));
const SANHEDRIN_10_1 = link("sefaria:Mishnah Sanhedrin 10:1", "Mishnah, Sanhedrin 10:1", "المشناه، سنهدرين 10: 1", sefaria("Mishnah Sanhedrin 10:1"));
const MAKKOT_23B = link("sefaria:Makkot 23b", "Talmud, Makkot 23b", "التلمود، مكوت 23ب", "https://www.sefaria.org/Makkot.23b.18");
const mjl = (id: string, en: string, ar: string, slug: string) =>
  link(`mjl:${id}`, `My Jewish Learning, “${en}”`, `موقع My Jewish Learning، «${ar}» (بالإنجليزية)`, `https://www.myjewishlearning.com/article/${slug}/`);
const MJL_PRINCIPLES = mjl("principles", "The Thirteen Principles of Faith", "أصول الإيمان الثلاثة عشر لموسى بن ميمون", "the-thirteen-principles-of-faith");
const MJL_TANAKH = mjl("tanakh", "Hebrew Bible: Torah, Prophets and Writings", "الكتاب المقدس العبري: التوراة والأنبياء والكتابات", "hebrew-bible");
const MJL_TALMUD = mjl("talmud", "What Is the Talmud?", "ما التلمود؟", "talmud-101");
const MJL_JESUS = mjl("jesus", "What Do Jews Believe About Jesus?", "ماذا يعتقد اليهود في يسوع؟", "what-do-jews-believe-about-jesus");
const MJL_AFTERLIFE = mjl("afterlife", "Is There a Jewish Afterlife?", "هل في اليهودية حياة بعد الموت؟", "life-after-death");
const DAWA_JUDAISM = dawa(2, "Judaism", "اليهودية");
const DORAR_TORAH = dorar(169, "The Torah and the books joined to it", "التوراة والكتب الملحقة بها");
const DORAR_TALMUD = dorar(174, "The writing down of the Talmud", "تدوين التلمود");
const DORAR_JEWISH_PRAYER = dorar(250, "Judaism: prayer", "اليهودية: الصلاة");
const DORAR_JEWISH_FASTING = dorar(252, "Judaism: fasting", "اليهودية: الصيام");
const DORAR_JEWISH_FOOD = dorar(259, "Judaism: food and drink", "اليهودية: المأكل والمشرب");

// Hinduism.
const bbc = (id: string, en: string, ar: string, path: string) =>
  link(`bbc:${id}`, `BBC Religions, “${en}”`, `بي بي سي، قسم الأديان، «${ar}» (بالإنجليزية)`, `https://www.bbc.co.uk/religion/religions/${path}.shtml`);
const BBC_HINDUISM = bbc("hinduism", "Hinduism at a glance", "الهندوسية في لمحة", "hinduism/ataglance/glance");
const BBC_HINDU_CONCEPTS = bbc("hindu-concepts", "Hindu concepts", "مفاهيم هندوسية", "hinduism/concepts/concepts_1");
const BBC_HINDU_SCRIPTURE = bbc("hindu-scripture", "Hindu scripture", "الكتب المقدسة الهندوسية", "hinduism/texts/texts");
const BBC_HINDU_MOKSHA = bbc("hindu-moksha", "Moksha", "الموكشا", "hinduism/beliefs/moksha");
const BBC_HINDU_WORSHIP = bbc("hindu-worship", "Hindu worship", "العبادة الهندوسية", "hinduism/worship/worship");
const HAF = link("haf", "Hindu American Foundation, “Hinduism Basics”", "المؤسسة الهندوسية الأمريكية، «أساسيات الهندوسية» (بالإنجليزية)", "https://www.hinduamerican.org/hinduism-basics");
/** One verse of the Bhagavad Gita, or the group it is printed in: `gita("2.20")`, `gita("16.1–3")`. */
const gita = (key: string): CompareRef => {
  const [chapter, verse] = key.split(".");
  return link(`gita:${key}`, `Bhagavad Gita ${key} (translation of Swami Mukundananda)`, `البهاغافاد غيتا ${key} (ترجمة سوامي موكونداناندا، بالإنجليزية)`, `https://www.holy-bhagavad-gita.org/chapter/${chapter}/verse/${parseInt(verse)}`);
};
const DAWA_HINDUISM = dawa(43, "Hinduism", "الهندوسية");
const DORAR_HINDU_BOOKS = dorar(945, "Hinduism: ideas and beliefs", "الهندوسية: الأفكار والمعتقدات");
const DORAR_HINDU_GODS = dorar(949, "How Hinduism sees the gods", "نظرة الهندوسية إلى الآلهة");
const DORAR_HINDU_BELIEFS = dorar(953, "Hinduism: their beliefs", "الهندوسية: معتقداتهم");

// Buddhism. The early discourses are linked to Access to Insight, a library of translations from the Pali Canon.
const ati = (id: string, en: string, ar: string, path: string) =>
  link(`ati:${id}`, `${en} (Access to Insight)`, `${ar} (موقع Access to Insight، بالإنجليزية)`, `https://www.accesstoinsight.org/${path}.html`);
const SN_56_11 = ati("sn56.11", "Samyutta Nikaya 56.11, the Buddha's first discourse", "سَميوتا نيكايا 56.11، أول خطبة لبوذا", "tipitaka/sn/sn56/sn56.011.than");
const SN_15_3 = ati("sn15.3", "Samyutta Nikaya 15.3", "سَميوتا نيكايا 15.3", "tipitaka/sn/sn15/sn15.003.than");
const SN_22_59 = ati("sn22.59", "Samyutta Nikaya 22.59, the discourse on not-self", "سَميوتا نيكايا 22.59، خطبة «اللاذات»", "tipitaka/sn/sn22/sn22.059.than");
const MN_63 = ati("mn63", "Majjhima Nikaya 63", "مَجّيما نيكايا 63", "tipitaka/mn/mn.063.than");
const AN_3_65 = ati("an3.65", "Anguttara Nikaya 3.65, the discourse to the Kalamas", "أنغوتارا نيكايا 3.65، خطبة بوذا لأهل كالاما", "tipitaka/an/an03/an03.065.than");
const AN_5_57 = ati("an5.57", "Anguttara Nikaya 5.57", "أنغوتارا نيكايا 5.57", "tipitaka/an/an05/an05.057.than");
const UDANA_8_3 = ati("ud8.3", "Udana 8.3", "أودانا 8.3", "tipitaka/kn/ud/ud.8.03.than");
const DHP_165 = ati("dhp12", "Dhammapada, chapter 12 (verse 165)", "الدامابادا، الفصل 12 (البيت 165)", "tipitaka/kn/dhp/dhp.12.budd");
const DHP_183 = ati("dhp14", "Dhammapada, chapter 14 (verse 183)", "الدامابادا، الفصل 14 (البيت 183)", "tipitaka/kn/dhp/dhp.14.budd");
const DHP_276 = ati("dhp20", "Dhammapada, chapter 20 (verses 276–279)", "الدامابادا، الفصل 20 (الأبيات 276–279)", "tipitaka/kn/dhp/dhp.20.budd");
const METTA = ati("metta", "Karaniya Metta Sutta, the discourse on loving-kindness", "كَرَنيا مِتّا سوتا، خطبة المحبة", "tipitaka/kn/snp/snp.1.08.amar");
const PRECEPTS = ati("precepts", "The Five Precepts", "المبادئ الخمسة", "ptf/dhamma/sila/pancasila");
const TIPITAKA = ati("tipitaka", "Tipitaka: The Pali Canon", "التيبيتاكا: القانون البالي", "tipitaka/index");
const BBC_BUDDHISM = bbc("buddhism", "Buddhism at a glance", "البوذية في لمحة", "buddhism/ataglance/glance");
const SEP_BUDDHA = link("sep-buddha", "Stanford Encyclopedia of Philosophy, “Buddha” (Mark Siderits)", "موسوعة ستانفورد للفلسفة، مادة «بوذا» لمارك سيدريتس (بالإنجليزية)", "https://plato.stanford.edu/entries/buddha/");
const DAWA_BUDDHISM = dawa(44, "Buddhism", "البوذية");
const DORAR_BUDDHIST_TEACHING = dorar(970, "The beliefs, ideas and teachings of Buddhism", "عقائد البوذية وأفكارها وتعاليمها");
const DORAR_BUDDHIST_IDEAS = dorar(972, "Buddhism: ideas and beliefs", "البوذية: الأفكار والمعتقدات");

// Sikhism.
const BBC_SIKHISM = bbc("sikhism", "Sikhism at a glance", "السيخية في لمحة", "sikhism/ataglance/glance");
const BBC_SIKH_BELIEFS = bbc("sikh-beliefs", "Sikh beliefs", "معتقدات السيخ", "sikhism/beliefs/beliefs");
const SIKH_COALITION = link("sikh-coalition", "Sikh Coalition, “FAQ” about Sikhs", "التحالف السيخي (Sikh Coalition)، «أسئلة شائعة» عن السيخ (بالإنجليزية)", "https://www.sikhcoalition.org/about-sikhs/faq/");
const GRANTH_1 = link("granth:1", "Guru Granth Sahib, p. 1, the opening lines (translation of Sant Singh Khalsa)", "غورو غرانث صاحب، ص 1، الافتتاحية (ترجمة سانت سينغ خالصة، بالإنجليزية)", "https://www.srigranth.org/servlet/gurbani.gurbani?Action=Page&Param=1&english=t&id=0");
const DAWA_SIKHISM = dawa(45, "Sikhism", "السيخية");
const DORAR_SIKH_IDEAS = dorar(1013, "Sikhism: background of ideas", "السيخية: خلفية فكرية");
const DORAR_SIKH_BOOKS = dorar(1015, "Sikhism: their books", "السيخية: كتبهم");

// Agnosticism. The Dawah Repository defines the agnostic inside its entry on atheism.
const HUXLEY = link("huxley-agnosticism", "T. H. Huxley, “Agnosticism” (1889)", "توماس هنري هكسلي، مقالة «اللاأدرية» (1889، بالإنجليزية)", "https://mathcs.clarku.edu/huxley/CE5/Agn.html");
const HUXLEY_LETTER = link("huxley-letter", "T. H. Huxley, letter to Charles Kingsley, 23 September 1860", "توماس هنري هكسلي، رسالة إلى تشارلز كينغسلي، 23 سبتمبر 1860 (بالإنجليزية)", "https://mathcs.clarku.edu/huxley/letters/60.html");
const DAWA_ATHEISM = dawa(6, "Atheism", "الإلحاد");

const FIVE_PILLARS = bi(
  "This rests on five pillars: the testimony of faith, prayer, zakah (required charity for those in need), fasting in Ramadan, and pilgrimage for those who are able (hadith: “Islam is built on five”).",
  "ويقوم ذلك على خمسة أركان: الشهادتان، والصلاة، والزكاة (صدقة واجبة للمحتاجين)، وصوم رمضان، والحج لمن استطاع (حديث: «بُني الإسلام على خمس»).",
);
const join = (...parts: Bi[]): Bi => ({ en: parts.map((p) => p.en).join(" "), ar: parts.map((p) => p.ar).join(" ") });

// Islam's short overview of each kind of topic, shared in the same way.
const INTRO = {
  book: [bi(
    "The holy book of Islam is the Quran. Muslims believe it is the word of God, brought down to the Prophet Muhammad by the angel Gabriel (Quran 2:97), and that God guards it (Quran 15:9). Muslims also follow the Sunnah, which is the Prophet's teaching and example (Quran 33:21).",
    "كتاب الإسلام هو القرآن. يؤمن المسلمون بأنه كلام الله، نزل به جبريل عليه السلام على النبي محمد ﷺ (البقرة: 97)، وأن الله يحفظه (الحجر: 9). ويتّبع المسلمون كذلك السنّة، وهي تعليم النبي ﷺ وهديه (الأحزاب: 21).",
  )],
  human: [bi(
    "Islam teaches that God created people to worship Him (Quran 51:56). Life is a test of who does best (Quran 67:2), and God has honoured every human being (Quran 17:70).",
    "يعلّم الإسلام أن الله خلق الناس ليعبدوه (الذاريات: 56). والحياة اختبار ليظهر من هو أحسن عملًا (الملك: 2)، وقد كرّم الله بني آدم جميعًا (الإسراء: 70).",
  )],
  worship: [bi(
    "Muslim life is built on worship of God alone and on doing good to others (Quran 4:36). Its frame is five pillars: the testimony of faith, prayer, zakah, fasting and pilgrimage (hadith: “Islam is built on five”).",
    "تقوم حياة المسلم على عبادة الله وحده وعلى الإحسان إلى الناس (النساء: 36). وإطارها خمسة أركان: الشهادتان، والصلاة، والزكاة، والصوم، والحج (حديث: «بُني الإسلام على خمس»).",
  )],
  hereafter: [bi(
    "Islam teaches that every soul will taste death. Then, on the Day of Resurrection, each will be paid in full for what it did. Whoever is kept from the Fire and let into Paradise has succeeded (Quran 3:185).",
    "يعلّم الإسلام أن كل نفس ذائقة الموت، ثم تُوفّى كل نفس أجرها كاملًا يوم القيامة، فمن زُحزح عن النار وأُدخل الجنة فقد فاز (آل عمران: 185).",
  )],
  creator: [bi(
    "Islam teaches that the universe has a Creator: one God, who is the First (Quran 57:3). The Quran asks people to think about where everything came from (Quran 52:35–36), and it calls the order of the world a sign for people who use reason (Quran 2:164).",
    "يعلّم الإسلام أن للكون خالقًا: إلهًا واحدًا هو الأول (الحديد: 3). ويدعو القرآن الناس إلى التفكير في أصل كل شيء (الطور: 35–36)، ويجعل نظام الكون آيات لقوم يعقلون (البقرة: 164).",
  )],
  knowing: [bi(
    "Islam teaches that people know through the senses, reason and revelation together. God gave people hearing, sight and mind (Quran 16:78). He also sent messengers with good news and warning, so that no one could say they were never told (Quran 4:165).",
    "يعلّم الإسلام أن الإنسان يعرف بالحواس والعقل والوحي معًا. فقد جعل الله للناس السمع والأبصار والأفئدة (النحل: 78)، وأرسل رسلًا مبشّرين ومنذرين، لئلا يقول أحد إنه لم يبلغه شيء (النساء: 165).",
  )],
  purpose: [bi(
    "Islam teaches that life has a purpose given by the Creator: to worship Him (Quran 51:56). Life is a test of who does best (Quran 67:2). The Quran says people were not created without a purpose (Quran 23:115).",
    "يعلّم الإسلام أن للحياة غاية من عند الخالق: عبادته (الذاريات: 56). والحياة اختبار ليظهر من هو أحسن عملًا (الملك: 2). ويذكر القرآن أن الناس لم يُخلقوا عبثًا (المؤمنون: 115).",
  )],
  ethics: [bi(
    "Islam joins worship and ethics. God commands justice and good conduct, and forbids wrongdoing and oppression (Quran 16:90). Prayer is for remembering God (Quran 20:14).",
    "يجمع الإسلام بين العبادة والأخلاق. فالله يأمر بالعدل والإحسان، وينهى عن المنكر والبغي، أي الظلم (النحل: 90). والصلاة تُقام لذكر الله (طه: 14).",
  )],
  death: [bi(
    "Islam teaches that death is not the end. Every soul will taste death, and on the Day of Resurrection each will be paid in full for what it did (Quran 3:185). God will judge with full justice (Quran 21:47).",
    "يعلّم الإسلام أن الموت ليس النهاية. فكل نفس ذائقة الموت، ثم تُوفّى كل نفس أجرها كاملًا يوم القيامة (آل عمران: 185). ويحكم الله بالعدل التام (الأنبياء: 47).",
  )],
} satisfies Record<string, Bi[]>;

// Islam's main beliefs on each kind of topic. They do not change with the belief that stands beside them, so topics share them.
const ISLAM = {
  oneGod: [
    bi("God is one and needs nothing. He has no child and was not born, and nothing is like Him (Quran 112:1–4; 42:11).", "الله أحد صمد لا يحتاج إلى شيء، لم يلد ولم يولد، وليس كمثله شيء (الإخلاص: 1–4؛ الشورى: 11)."),
    bi("Only God is worshipped, and Muslims ask Him directly for help (Quran 1:5).", "العبادة لله وحده، والمسلم يطلب العون منه مباشرة (الفاتحة: 5)."),
    bi("God is the Most Merciful, and He is near to anyone who calls on Him (Quran 1:3; 2:186).", "الله هو الرحمن الرحيم، وهو قريب يجيب دعوة من يدعوه (الفاتحة: 3؛ البقرة: 186)."),
    bi("God never sleeps and never tires. He knows and keeps all things (Quran 2:255).", "الله لا تأخذه سِنة ولا نوم، ولا يُتعبه حفظ السماوات والأرض، ويعلم كل شيء (البقرة: 255)."),
  ],
  creator: [
    bi("What begins to exist needs a cause. The universe had a beginning, so it has a Maker (Quran 52:35–36; Al-Hazmi, pp. 2–3).", "كل ما له بداية يحتاج إلى سبب، وللكون بداية، فله صانع (الطور: 35–36؛ الحازمي، ص 2–3)."),
    bi("The order of the world is a sign for people who think (Quran 2:164; 3:190).", "نظام الكون آيات لأهل العقول (البقرة: 164؛ آل عمران: 190)."),
    bi("The Creator has no beginning. He is the First and the Last (Quran 57:3).", "الخالق لا بداية له، فهو الأول والآخر (الحديد: 3)."),
    bi("God made people with a natural pull towards Him, called fitrah (Quran 30:30).", "فطر الله الناس على الميل إليه، وهذه هي الفطرة (الروم: 30)."),
  ],
  book: [
    bi("The Quran is God's word. It says no one but God could have produced it (Quran 10:37).", "القرآن كلام الله، وقد ذكر أنه ما كان ليأتي به أحد من دون الله (يونس: 37)."),
    bi("God promised to guard it (Quran 15:9). Many companions knew it by heart, and it was written down in the Prophet's lifetime. Later his companions gathered it into one book (M. As-Sayed Muhammad, p. 129).", "تكفّل الله بحفظه (الحجر: 9). وقد حفظه كثير من الصحابة عن ظهر قلب، وكُتب في حياة النبي ﷺ، ثم جمعه أصحابه في مصحف واحد (محمد السيد محمد، ص 129)."),
    bi("Muslims believe God gave the Torah to Moses, the Psalms to David and the Gospel to Jesus (Quran 4:163; 5:44; 5:46).", "يؤمن المسلمون بأن الله أنزل التوراة على موسى، والزبور على داود، والإنجيل على عيسى عليهم السلام (النساء: 163؛ المائدة: 44؛ المائدة: 46)."),
  ],
  knowing: [
    bi("Hearing, sight and mind are gifts from God, and people will be asked how they used them (Quran 16:78; 17:36).", "السمع والبصر والعقل نِعَم من الله، وسيُسأل الإنسان كيف استعملها (النحل: 78؛ الإسراء: 36)."),
    bi("The Quran asks for proof, and blames following guesses (Quran 2:111; 45:24).", "القرآن يطالب بالبرهان، ويذمّ اتّباع الظن (البقرة: 111؛ الجاثية: 24)."),
    bi("Revelation is guidance for those who believe in what cannot be seen (Quran 2:2–3). It tells why we were made and what comes after death (Quran 51:56; 3:185).", "الوحي هدى للذين يؤمنون بالغيب، أي بما لا يُرى (البقرة: 2–3). وهو يخبر لماذا خُلقنا وما يكون بعد الموت (الذاريات: 56؛ آل عمران: 185)."),
    bi("The Quran offers itself for testing: readers are asked to look in it for contradictions (Quran 4:82).", "القرآن يعرض نفسه للاختبار، فيدعو قارئه إلى البحث فيه عن الاختلاف (النساء: 82)."),
  ],
  human: [
    bi("God made every person with a natural pull towards Him. It is called fitrah (Quran 30:30).", "فطر الله كل إنسان على الميل إليه، ويُسمّى ذلك الفطرة (الروم: 30)."),
    bi("Adam made a mistake and turned back to God, and God forgave him (Quran 2:37).", "أخطأ آدم عليه السلام ثم تاب إلى الله، فتاب الله عليه (البقرة: 37)."),
    bi("No one carries the sin of another. Each person answers for what they did (Quran 6:164; 53:39).", "لا يحمل أحد ذنب غيره، وكل إنسان مسؤول عن عمله (الأنعام: 164؛ النجم: 39)."),
    bi("Anyone can turn to God directly. He forgives all sins (Quran 39:53).", "لكل إنسان أن يرجع إلى الله مباشرة، فهو يغفر الذنوب جميعًا (الزمر: 53)."),
  ],
  purpose: [
    bi("God honoured the children of Adam and made the human being in the best form (Quran 17:70; 95:4).", "كرّم الله بني آدم وخلق الإنسان في أحسن تقويم (الإسراء: 70؛ التين: 4)."),
    bi("The purpose of life is to worship God. Goodness includes belief, giving, prayer, keeping promises and patience (Quran 51:56; 2:177).", "غاية الحياة عبادة الله، والبرّ يشمل الإيمان والإنفاق والصلاة والوفاء بالعهد والصبر (الذاريات: 56؛ البقرة: 177)."),
    bi("Life is a test of who does best (Quran 67:2).", "الحياة اختبار ليظهر من هو أحسن عملًا (الملك: 2)."),
    bi("People were made into nations and tribes to know one another. The most honoured with God is the most God-conscious (Quran 49:13).", "جعل الله الناس شعوبًا وقبائل ليتعارفوا، وأكرمهم عند الله أتقاهم (الحجرات: 13)."),
  ],
  worship: [
    bi("Prayer (salah): five prayers each day and night, said directly to God (hadith of Dimam ibn Tha‘labah; Quran 20:14).", "الصلاة: خمس صلوات في اليوم والليلة، يتوجّه بها المسلم إلى الله مباشرة (حديث ضِمام بن ثعلبة؛ طه: 14)."),
    bi("Zakah: required charity, taken from the rich and given to the poor (hadith of Dimam ibn Tha‘labah; Quran 9:60).", "الزكاة: صدقة واجبة تؤخذ من الأغنياء وتُعطى للفقراء (حديث ضِمام بن ثعلبة؛ التوبة: 60)."),
    bi("Fasting in the month of Ramadan (Quran 2:183; 2:185).", "صوم شهر رمضان (البقرة: 183؛ البقرة: 185)."),
    bi("Pilgrimage (hajj) to the Sacred House in Mecca, for those who are able (Quran 3:97).", "حج البيت الحرام في مكة لمن استطاع إليه سبيلًا (آل عمران: 97)."),
    bi("Character: justice, good conduct, and care for parents, neighbours and people in need (Quran 16:90; 4:36).", "الأخلاق: العدل والإحسان، وبرّ الوالدين، ورعاية الجار والمحتاج (النحل: 90؛ النساء: 36)."),
  ],
  ethics: [
    bi("God gave every soul the ability to tell right from wrong (Quran 91:7–8).", "ألهم الله كل نفس أن تميّز بين الخير والشر (الشمس: 7–8)."),
    bi("God commands people to stand for justice, even against themselves or their family (Quran 4:135).", "يأمر الله بإقامة العدل ولو على النفس أو الأهل (النساء: 135)."),
    bi("Goodness includes belief, giving, prayer, keeping promises and patience (Quran 2:177).", "البرّ يشمل الإيمان والإنفاق والصلاة والوفاء بالعهد والصبر (البقرة: 177)."),
    bi("Five pillars shape a Muslim's life: the testimony of faith, prayer, zakah (required charity for those in need), fasting in Ramadan, and pilgrimage (hadith: “Islam is built on five”).", "خمسة أركان تنظّم حياة المسلم: الشهادتان، والصلاة، والزكاة (صدقة واجبة للمحتاجين)، وصوم رمضان، والحج (حديث: «بُني الإسلام على خمس»)."),
  ],
  hereafter: [
    bi("God will bring the dead back to life. The One who made them the first time can do it again (Quran 36:78–79).", "سيحيي الله الموتى، فالذي أنشأهم أول مرة قادر على أن يعيدهم (يس: 78–79)."),
    bi("God judges with full justice. No soul is wronged, and the smallest deed is counted (Quran 21:47; 99:7–8).", "يحكم الله بالعدل التام، فلا تُظلم نفس شيئًا، وأصغر الأعمال محسوب (الأنبياء: 47؛ الزلزلة: 7–8)."),
    bi("Paradise is promised to those who believe and do good, men and women alike (Quran 4:124).", "الجنة وعد الله لمن آمن وعمل صالحًا، رجلًا كان أو امرأة (النساء: 124)."),
    bi("No one carries the burden of another (Quran 35:18).", "لا يحمل أحد حِمل غيره (فاطر: 18)."),
  ],
  death: [
    bi("Every soul will taste death (Quran 3:185).", "كل نفس ذائقة الموت (آل عمران: 185)."),
    bi("God will raise the dead. The One who made them the first time can do it again (Quran 36:78–79).", "سيبعث الله الموتى، فالذي أنشأهم أول مرة قادر على إعادتهم (يس: 78–79)."),
    bi("Every deed, good or bad, will be seen, down to an atom's weight (Quran 99:7–8).", "كل عمل، خيرًا كان أو شرًّا، سيُرى ولو كان مثقال ذرة (الزلزلة: 7–8)."),
    bi("God has promised believing men and women gardens to live in for ever, and His approval is greater still (Quran 9:72).", "وعد الله المؤمنين والمؤمنات جنات يخلدون فيها، ورضوان الله أكبر (التوبة: 72)."),
  ],
} satisfies Record<string, Bi[]>;

// Questions that readers of more than one belief ask. A topic lists them beside its own questions.
const FAQ = {
  preserved: {
    id: "preserved",
    q: bi("Was the Quran changed over time?", "هل تغيّر القرآن مع الزمن؟"),
    a: bi(
      "Islam teaches that God Himself promised to guard the Quran (15:9). Many companions of the Prophet knew it by heart, and it was written down while he was alive. Abu Bakr, the first caliph (leader of the Muslims after the Prophet), gathered the written parts. Uthman, the third caliph, had it copied into one book and sent out to the lands (M. As-Sayed Muhammad, p. 129).",
      "يعلّم الإسلام أن الله تكفّل بحفظ القرآن (الحجر: 9). وقد حفظه كثير من الصحابة، وكُتب في حياة النبي ﷺ. ثم جمع أبو بكر، وهو الخليفة الأول (أي قائد المسلمين بعد النبي ﷺ)، ما كُتب منه، وأمر عثمان، وهو الخليفة الثالث، بنسخه في مصحف واحد وإرساله إلى البلدان (محمد السيد محمد، ص 129).",
    ),
  },
  author: {
    id: "author",
    q: bi("Who wrote the Quran?", "من كتب القرآن؟"),
    a: bi(
      "Muslims believe that no human being is its author. The Quran says it could not have come from anyone but God (10:37). It invites anyone in doubt to produce one chapter like it (2:23), and to look in it for contradictions (4:82).",
      "يؤمن المسلمون بأنه ليس من تأليف بشر. فالقرآن يذكر أنه ما كان ليأتي من عند غير الله (يونس: 37)، ويدعو من يشكّ فيه إلى أن يأتي بسورة من مثله (البقرة: 23)، وأن يبحث فيه عن الاختلاف (النساء: 82).",
    ),
  },
  saved: {
    id: "saved",
    q: bi("How is a person saved in Islam?", "كيف ينجو الإنسان في الإسلام؟"),
    a: bi(
      "By God's mercy. A person believes in God, does good, and asks forgiveness after doing wrong (4:124; 4:110). The Quran tells people never to lose hope in God's mercy, because He forgives all sins (39:53).",
      "برحمة الله. يؤمن الإنسان بالله ويعمل الصالحات، ويستغفر إذا أخطأ (النساء: 124؛ النساء: 110). ويدعو القرآن الناس ألا ييأسوا من رحمة الله، فهو يغفر الذنوب جميعًا (الزمر: 53).",
    ),
  },
  purpose: {
    id: "purpose",
    q: bi("Why are we here, according to Islam?", "لماذا نحن هنا في نظر الإسلام؟"),
    a: bi(
      "To worship God and to do good in the time we are given. The Quran says God made death and life to test who is best in deeds (67:2), and that people were not created without a purpose (23:115).",
      "لنعبد الله ونعمل الخير في العمر الذي أُعطيناه. فالقرآن يذكر أن الله خلق الموت والحياة ليختبر الناس أيهم أحسن عملًا (الملك: 2)، وأن الناس لم يُخلقوا عبثًا (المؤمنون: 115).",
    ),
  },
  fasting: {
    id: "fasting",
    q: bi("Do Muslims fast?", "هل يصوم المسلمون؟"),
    a: bi(
      "Yes, in the month of Ramadan, from dawn until sunset (2:187). The Quran says fasting was also asked of earlier communities (2:183). It says God wants ease and not hardship, so a sick person or a traveller fasts on other days (2:185).",
      "نعم، في شهر رمضان، من الفجر إلى غروب الشمس (البقرة: 187). ويذكر القرآن أن الصيام كُتب على الأمم السابقة أيضًا (البقرة: 183)، وأن الله يريد اليسر لا العسر، فالمريض والمسافر يصومان أيامًا أُخَر (البقرة: 185).",
    ),
  },
  rules: {
    id: "rules",
    q: bi("Is Islam only a list of rules?", "هل الإسلام مجرد قائمة أحكام؟"),
    a: bi(
      "No. The Quran says goodness is not about which direction you face. It is to believe, to give to relatives, orphans and people in need, to pray, to keep your promises and to be patient in hard times (2:177).",
      "لا. فالقرآن يذكر أن البرّ ليس في الجهة التي تتوجّه إليها، بل في الإيمان، وإعطاء المال للأقارب واليتامى والمحتاجين، وإقامة الصلاة، والوفاء بالعهد، والصبر في الشدائد (البقرة: 177).",
    ),
  },
  heaven: {
    id: "heaven",
    q: bi("Do Muslims believe in heaven and hell?", "هل يؤمن المسلمون بالجنة والنار؟"),
    a: bi(
      "Yes. The Quran describes Paradise as gardens where people live for ever, and it says God's approval is greater than all of that (9:72). It also warns of the Fire, and says the one who is kept away from it has succeeded (3:185).",
      "نعم. يصف القرآن الجنة بأنها جنات يخلد فيها أهلها، ويذكر أن رضوان الله أكبر من ذلك كله (التوبة: 72). ويحذّر من النار، ويذكر أن من زُحزح عنها فقد فاز (آل عمران: 185).",
    ),
  },
  who: {
    id: "who",
    q: bi("Who enters Paradise, in the Muslim view?", "من يدخل الجنة في نظر المسلمين؟"),
    a: bi(
      "The Quran promises Paradise to those who believe and do good, men and women alike (4:124). It says God will set up scales of justice, so no soul is wronged (21:47), and it tells people never to lose hope in His mercy (39:53). The judgement belongs to God, the Master of the Day of Judgement (1:4).",
      "يَعِد القرآن بالجنة من آمن وعمل صالحًا، رجلًا كان أو امرأة (النساء: 124). ويذكر أن الله يضع الموازين القسط فلا تُظلم نفس شيئًا (الأنبياء: 47)، ويدعو الناس ألا ييأسوا من رحمته (الزمر: 53). والحكم لله، فهو مالك يوم الدين (الفاتحة: 4).",
    ),
  },
  whoMadeGod: {
    id: "who-made-god",
    q: bi("If God made everything, who made God?", "إذا كان الله خلق كل شيء، فمن خلق الله؟"),
    a: bi(
      "Islam teaches that only things that begin need a maker. God did not begin: He is the First (57:3). If every maker needed another maker before it, the chain would never start and nothing would exist. So there must be one Creator who was not created (Abandoning Atheism for Islam, p. 35).",
      "يعلّم الإسلام أن ما له بداية هو الذي يحتاج إلى صانع. والله لا بداية له، فهو الأول (الحديد: 3). ولو احتاج كل صانع إلى صانع قبله لما بدأت السلسلة ولما وُجد شيء. فلا بد من خالق واحد غير مخلوق (الإسلام والإلحاد وجهًا لوجه، ص 35).",
    ),
  },
  science: {
    id: "science",
    q: bi("Can science and belief in God go together?", "هل يجتمع العلم والإيمان بالله؟"),
    a: bi(
      "Islam says yes. The Quran tells people to travel and see how creation began (29:20), and it asks whether those who know are equal to those who do not know (39:9). Science studies how the world works. Islam teaches why we are here: to worship the One who made it (51:56).",
      "نعم في نظر الإسلام. فالقرآن يأمر الناس أن يسيروا في الأرض وينظروا كيف بدأ الخلق (العنكبوت: 20)، ويسأل: هل يستوي الذين يعلمون والذين لا يعلمون؟ (الزمر: 9). العلم يدرس كيف يعمل العالم، والإسلام يعلّم لماذا نحن هنا: لنعبد خالقه (الذاريات: 56).",
    ),
  },
  suffering: {
    id: "suffering",
    q: bi("Why does a good God allow suffering?", "لماذا يسمح إله رحيم بالمعاناة؟"),
    a: bi(
      "This is a serious question, and Islam does not brush it aside. The Quran says God made death and life to test who is best in deeds (67:2). It says God does not ask of any soul more than it can bear (2:286). And it says nothing is lost: scales of justice will be set up, and no soul will be wronged (21:47).",
      "هذا سؤال جادّ، والإسلام لا يتجاهله. فالقرآن يذكر أن الله خلق الموت والحياة ليختبر الناس أيهم أحسن عملًا (الملك: 2)، وأنه لا يكلّف نفسًا إلا وسعها (البقرة: 286)، وأنه لا يضيع شيء: فالموازين القسط تُنصب ولا تُظلم نفس شيئًا (الأنبياء: 47).",
    ),
  },
  blindFaith: {
    id: "blind-faith",
    q: bi("Does Islam ask for blind faith?", "هل يطلب الإسلام إيمانًا أعمى؟"),
    a: bi(
      "No. The Quran says the signs in nature are for people who use reason (2:164). It tells people not to follow what they have no knowledge of (17:36), and it asks those who make a claim to bring their proof (2:111).",
      "لا. فالقرآن يذكر أن آيات الكون لقوم يعقلون (البقرة: 164)، وينهى عن اتّباع ما لا علم للإنسان به (الإسراء: 36)، ويطالب صاحب الدعوى ببرهانه (البقرة: 111).",
    ),
  },
  check: {
    id: "check",
    q: bi("How can I check whether the Quran is from God?", "كيف أتحقق من أن القرآن من عند الله؟"),
    a: bi(
      "The Quran invites this check. It asks readers to look in it for contradictions (4:82), and it challenges anyone in doubt to produce one chapter like it (2:23). A simple first step is to read it yourself. You can open it in the Quran section of this app.",
      "القرآن نفسه يدعو إلى هذا التحقق. فهو يدعو قارئه إلى البحث فيه عن الاختلاف (النساء: 82)، ويتحدّى من يشكّ فيه أن يأتي بسورة من مثله (البقرة: 23). وأيسر خطوة أن تقرأه بنفسك، ويمكنك فتحه من قسم القرآن في هذا التطبيق.",
    ),
  },
  reasonFirst: {
    id: "reason-first",
    q: bi("Is there an argument that does not start from scripture?", "هل من دليل لا يبدأ من النصوص؟"),
    a: bi(
      "Yes. The Quran itself starts with a question for the mind: were people created by nothing, or did they create themselves? (52:35). The argument is that whatever begins to exist needs a cause (Al-Hazmi, pp. 2–3). Scripture comes after this step, not before it.",
      "نعم. فالقرآن نفسه يبدأ بسؤال للعقل: هل خُلق الناس من غير شيء، أم هم الخالقون؟ (الطور: 35). والدليل هو أن كل ما له بداية يحتاج إلى سبب (الحازمي، ص 2–3). والنصوص تأتي بعد هذه الخطوة لا قبلها.",
    ),
  },
  worship: {
    id: "worship",
    q: bi("What does “worship” mean in Islam?", "ما معنى «العبادة» في الإسلام؟"),
    a: bi(
      "It is more than rituals. The Quran describes goodness like this: to believe, to give to relatives, orphans and people in need, to pray, to keep promises and to be patient in hard times (2:177).",
      "هي أوسع من الشعائر. فالقرآن يصف البرّ بأنه الإيمان، وإعطاء المال للأقارب واليتامى والمحتاجين، وإقامة الصلاة، والوفاء بالعهد، والصبر في الشدائد (البقرة: 177).",
    ),
  },
  human: {
    id: "human",
    q: bi("Does Islam see human beings as bad?", "هل ينظر الإسلام إلى الإنسان على أنه سيّئ؟"),
    a: bi(
      "No. The Quran says God honoured the children of Adam (17:70). People make mistakes, and the way back is always open: God forgives all sins (39:53).",
      "لا. فالقرآن يذكر أن الله كرّم بني آدم (الإسراء: 70). والناس يخطئون، وباب الرجوع مفتوح دائمًا: فالله يغفر الذنوب جميعًا (الزمر: 53).",
    ),
  },
  goodWithoutGod: {
    id: "good-without-god",
    q: bi("Can a person be good without believing in God?", "هل يكون الإنسان صالحًا من دون إيمان بالله؟"),
    a: bi(
      "Islam teaches that God gave every soul a sense of right and wrong (91:7–8), and that whoever does an atom's weight of good will see it (99:7–8). What Islam adds is the reason we were made: to worship the One who made us (51:56).",
      "يعلّم الإسلام أن الله ألهم كل نفس التمييز بين الخير والشر (الشمس: 7–8)، وأن من يعمل مثقال ذرة خيرًا يره (الزلزلة: 7–8). وما يضيفه الإسلام هو الغاية التي خُلقنا لها: أن نعبد من خلقنا (الذاريات: 56).",
    ),
  },
  rituals: {
    id: "rituals",
    q: bi("Why does Islam have rituals at all?", "لماذا في الإسلام شعائر أصلًا؟"),
    a: bi(
      "They serve a purpose. The Quran says prayer is for remembering God (20:14), and that fasting is asked so that people may grow in God-consciousness (2:183).",
      "لأن لها غاية. فالقرآن يذكر أن الصلاة تُقام لذكر الله (طه: 14)، وأن الصيام كُتب لعل الناس يتّقون (البقرة: 183).",
    ),
  },
  force: {
    id: "force",
    q: bi("Does Islam force its rules on others?", "هل يفرض الإسلام أحكامه على غير أهله؟"),
    a: bi(
      "The Quran says there is no compulsion in religion (2:256). It tells Muslims to be kind and fair to people who do not fight them (60:8).",
      "يقرّر القرآن أنه لا إكراه في الدين (البقرة: 256)، ويأمر المسلمين بالبرّ والعدل مع من لا يقاتلهم (الممتحنة: 8).",
    ),
  },
  reason: {
    id: "reason",
    q: bi("Is there any reason to believe in life after death?", "هل من سبب للإيمان بالحياة بعد الموت؟"),
    a: bi(
      "The Quran answers with a question: who gave life the first time? The One who made a person when he was nothing can bring him back (36:78–79; 19:66–67). It also points to justice: every soul will be repaid for what it earned, and no one will be wronged (45:21–22).",
      "يجيب القرآن بسؤال: من الذي أحيا أول مرة؟ فالذي خلق الإنسان ولم يكن شيئًا قادر على أن يعيده (يس: 78–79؛ مريم: 66–67). ويشير كذلك إلى العدل: ستُجزى كل نفس بما كسبت ولا يُظلم أحد (الجاثية: 21–22).",
    ),
  },
  fear: {
    id: "fear",
    q: bi("Is the afterlife only a way to frighten people?", "هل الآخرة مجرد وسيلة لتخويف الناس؟"),
    a: bi(
      "In Islam it is first a promise. The Quran says no soul knows what joy is kept hidden for it as a reward (32:17), and that God forgives all sins (39:53). The warning is also real: the Quran speaks of the Fire (3:185).",
      "هي في الإسلام وعدٌ أولًا. فالقرآن يذكر أنه لا تعلم نفس ما أُخفي لها من قرة أعين جزاءً (السجدة: 17)، وأن الله يغفر الذنوب جميعًا (الزمر: 53). والتحذير حقيقي كذلك، فالقرآن يذكر النار (آل عمران: 185).",
    ),
  },
  allah: {
    id: "allah",
    q: bi("What does “Allah” mean?", "ما معنى كلمة «الله»؟"),
    a: bi(
      "“Allah” is the Arabic name for the one God, the Creator, who alone deserves worship (Encyclopedia of Islamic Terms). It is not the name of a different god.",
      "«الله» هو الاسم العربي للإله الواحد الخالق، المستحق للعبادة وحده (موسوعة المصطلحات الإسلامية). وليس اسمًا لإله آخر.",
    ),
  },
  rebirth: {
    id: "rebirth",
    q: bi("Does Islam accept rebirth in another body?", "هل يقبل الإسلام عودة الروح في جسد آخر؟"),
    a: bi(
      "No. Islam teaches that each person lives once on earth. The Quran describes a person at death asking to be sent back to do good. The answer is no: there is a barrier until the day people are raised (23:99–100). It sums up the whole journey as life, death, and then life again with God (2:28).",
      "لا. يعلّم الإسلام أن الإنسان يعيش على الأرض مرة واحدة. ويصف القرآن إنسانًا حضره الموت فطلب أن يُرجَع ليعمل صالحًا، فيكون الجواب: كلا، ومن ورائهم برزخ، أي حاجز، إلى يوم يُبعثون (المؤمنون: 99–100). ويلخّص القرآن الرحلة كلها: حياة، ثم موت، ثم حياة عند الله (البقرة: 28).",
    ),
  },
  karma: {
    id: "karma",
    q: bi("Does Islam believe in karma?", "هل يقول الإسلام بالكارما؟"),
    a: bi(
      "Islam shares one part of the idea: every deed counts, and even an atom's weight of good or evil will be seen (99:7–8). The difference is how. Islam teaches that God Himself judges, with justice and mercy, on the Day of Resurrection (21:47), and not through a chain of rebirths.",
      "يشترك الإسلام مع هذه الفكرة في جانب واحد: كل عمل محسوب، ومن يعمل مثقال ذرة خيرًا أو شرًّا يره (الزلزلة: 7–8). والاختلاف في الطريقة: فالإسلام يعلّم أن الله نفسه هو الذي يحاسب بعدل ورحمة يوم القيامة (الأنبياء: 47)، لا عن طريق سلسلة من الولادات المتكررة.",
    ),
  },
  equality: {
    id: "equality",
    q: bi("Are all people equal in Islam?", "هل الناس متساوون في الإسلام؟"),
    a: bi(
      "Islam teaches that all people were created from one soul (4:1). The Quran says people were made into nations and tribes so that they may know one another, and that the most honoured with God is the most God-conscious (49:13). So no one is higher by birth.",
      "يعلّم الإسلام أن الناس جميعًا خُلقوا من نفس واحدة (النساء: 1). ويذكر القرآن أن الله جعل الناس شعوبًا وقبائل ليتعارفوا، وأن أكرمهم عند الله أتقاهم (الحجرات: 13). فلا فضل لأحد بنسبه.",
    ),
  },
  remembrance: {
    id: "remembrance",
    q: bi("Does Islam have something like meditation?", "هل في الإسلام ما يشبه التأمل؟"),
    a: bi(
      "Islam has remembrance of God, called dhikr, and reflection. The Quran praises those who remember God standing, sitting and lying down, and who think about the creation of the heavens and the earth (3:191). It says hearts find rest in the remembrance of God (13:28). The daily prayers are fixed times for it (20:14).",
      "في الإسلام ذكر الله والتفكّر. فالقرآن يثني على الذين يذكرون الله قيامًا وقعودًا وعلى جنوبهم، ويتفكّرون في خلق السماوات والأرض (آل عمران: 191). ويذكر أن القلوب تطمئن بذكر الله (الرعد: 28). والصلوات اليومية أوقات ثابتة لهذا الذكر (طه: 14).",
    ),
  },
} satisfies Record<string, { id: string; q: Bi; a: Bi }>;

// The references cited by the shared overview and beliefs of each kind of topic.
const ISLAM_REFS = {
  oneGod: [quran("112:1"), quran("112:2"), quran("112:3"), quran("112:4"), quran("42:11"), quran("1:5"), quran("1:3"), quran("2:186"), quran("2:255")],
  creator: [quran("52:35"), quran("57:3"), quran("2:164"), quran("3:190"), quran("30:30"), atheistDialogue("2–3")],
  book: [quran("2:97"), quran("15:9"), quran("33:21"), quran("10:37"), quran("4:163"), quran("5:44"), quran("5:46"), comparisonBook("129")],
  knowing: [quran("16:78"), quran("4:165"), quran("17:36"), quran("2:111"), quran("45:24"), quran("2:2–3"), quran("51:56"), quran("3:185"), quran("4:82")],
  human: [quran("51:56"), quran("67:2"), quran("17:70"), quran("30:30"), quran("2:37"), quran("6:164"), quran("53:39"), quran("39:53")],
  purpose: [quran("51:56"), quran("67:2"), quran("23:115"), quran("17:70"), quran("95:4"), quran("2:177"), quran("49:13")],
  worship: [HADITH_FIVE, HADITH_DIMAM, quran("4:36"), quran("20:14"), quran("9:60"), quran("2:183"), quran("2:185"), quran("3:97"), quran("16:90")],
  ethics: [HADITH_FIVE, quran("16:90"), quran("20:14"), quran("91:7–8"), quran("4:135"), quran("2:177")],
  hereafter: [quran("3:185"), quran("36:78–79"), quran("21:47"), quran("99:7–8"), quran("4:124"), quran("35:18")],
  death: [quran("3:185"), quran("21:47"), quran("36:78–79"), quran("99:7–8"), quran("9:72")],
} satisfies Record<keyof typeof ISLAM, CompareRef[]>;
/** One list of references without repeats. */
const refs = (...items: CompareRef[]) => [...new Map(items.map((r) => [r.id, r])).values()];

// Step 1 of the path, for every belief that already accepts a Creator.
const STEP_CREATED = bi(
  "Islam starts from the same point. The world did not come from nothing, and it did not create itself. God created it (Quran 52:35–36).",
  "ينطلق الإسلام من النقطة نفسها: الكون لم يأتِ من لا شيء، ولم يخلق نفسه، بل خلقه الله (الطور: 35–36).",
);

export const DATA: CompareData = {
  // The classification follows the tree of the Digital Dawah Repository (dawa.center/religions): revealed religions, Eastern religions
  // and contemporary positions. Islam stands in it as one of the revealed religions, and it is the reference of every comparison.
  nodes: [
    { id: "beliefs", type: "group", parent: null, title: { en: "Beliefs and worldviews", ar: "المعتقدات والتصورات" } },

    group("beliefs", "religions", "Religions", "الأديان", "They have worship, sacred texts and a community of followers.", "لها عبادات ونصوص مقدسة وجماعة من الأتباع."),
    group("religions", "revealed", "Revealed religions", "الأديان السماوية", "They go back to prophets and to a book sent down by God.", "تنتسب إلى أنبياء وإلى كتاب منزَّل من عند الله."),
    node("belief", "revealed", "judaism", "Judaism", "اليهودية"),
    node("belief", "revealed", "christianity", "Christianity", "المسيحية"),
    node("reference", "revealed", "islam", "Islam", "الإسلام"),
    group("religions", "eastern", "South & East Asian religions", "الأديان الشرقية", "They began in India and share ideas such as karma and rebirth.", "نشأت في الهند، وتشترك في أفكار مثل الكارما وتكرار الولادة."),
    node("belief", "eastern", "hinduism", "Hinduism", "الهندوسية"),
    node("belief", "eastern", "buddhism", "Buddhism", "البوذية"),
    node("belief", "eastern", "sikhism", "Sikhism", "السيخية"),

    group("beliefs", "positions", "Non-religious worldviews", "مواقف غير دينية", "Views on the existence of God that do not follow a religion.", "مواقف من مسألة وجود الله لا تتبع دينًا."),
    node("belief", "positions", "atheism", "Atheism", "الإلحاد"),
    node("belief", "positions", "agnosticism", "Agnosticism", "اللاأدرية"),

    ...topics("christianity"),
    ...topics("judaism"),
    ...topics("hinduism"),
    ...topics("buddhism", { god: { en: "The question of God and existence", ar: "مسألة الإله والوجود" } }),
    ...topics("sikhism"),
    ...topics("atheism", NON_RELIGIOUS),
    ...topics("agnosticism", NON_RELIGIOUS),

    // Sample branches: a tradition sits under its belief and has its own topics.
    node("tradition", "christianity", "christianity.catholicism", "Catholicism", "الكاثوليكية"),
    node("tradition", "christianity", "christianity.orthodoxy", "Orthodoxy", "الأرثوذكسية"),
    node("tradition", "christianity", "christianity.protestantism", "Protestantism", "البروتستانتية"),
    ...topics("christianity.catholicism"),
    ...topics("christianity.orthodoxy"),
    ...topics("christianity.protestantism"),
  ],

  // The guided path: the same six questions for everyone. A belief joins at `entry`, the first step where it differs from Islam;
  // the steps before it are common ground. A belief with `views` (one per step, in order) has the path; the others only have their topics.
  path: {
    steps: [
      { question: bi("Is there a Creator?", "هل لهذا الكون خالق؟"), lesson: "why-believe-in-god" },
      { question: bi("One God or many? What is God like?", "إله واحد أم آلهة متعددة؟ وما صفاته؟"), lesson: "who-is-god" },
      { question: bi("Does God send guidance through prophets and books?", "هل يرسل الله هدايته عن طريق الأنبياء والكتب؟") },
      { question: bi("Which message stayed unchanged? Who is Jesus?", "أيّ الرسالات بقيت كما نزلت؟ ومن هو المسيح؟") },
      { question: bi("Why Muhammad and the Quran?", "لماذا محمد ﷺ والقرآن؟") },
      { question: bi("What does Islam ask of me?", "ماذا يطلب الإسلام مني؟") },
    ],
    beliefs: {
      christianity: {
        entry: 4,
        views: [
          {
            belief: bi(
              "Yes. Christians believe in one God, the Father almighty, who made heaven and earth (Genesis 1:1; Apostles' Creed).",
              "نعم. يؤمن المسيحيون بإله واحد، الآب القدير، خالق السماء والأرض (التكوين 1: 1؛ قانون إيمان الرسل).",
            ),
            islam: STEP_CREATED,
            verse: quran("52:35"),
          },
          {
            belief: bi(
              "One God. Jesus repeats the old command: the Lord our God, the Lord is one (Mark 12:29). Christians believe that God is love (1 John 4:8). They also believe the one God is Father, Son and Holy Spirit. Step 4 looks at this.",
              "إله واحد. يكرّر يسوع الوصية القديمة: الرب إلهنا رب واحد (مرقس 12: 29). ويؤمن المسيحيون بأن الله محبة (رسالة يوحنا الأولى 4: 8)، وبأن الإله الواحد هو الآب والابن والروح القدس، وهذا موضوع الخطوة 4.",
            ),
            islam: bi(
              "Islam teaches that God is one and has no partner. Nothing is like Him, and He is the Most Merciful (Quran 112:1–4; 1:3). So the starting point is shared: one God, who alone deserves worship.",
              "يعلّم الإسلام أن الله واحد لا شريك له، ليس كمثله شيء، وهو الرحمن الرحيم (الإخلاص: 1–4؛ الفاتحة: 3). فنقطة البداية مشتركة: إله واحد هو وحده المستحق للعبادة.",
            ),
            verse: quran("112:1"),
          },
          {
            belief: bi(
              "Yes. Christians believe God spoke through the prophets many times, and at last through his Son (Hebrews 1:1–2). They hold that Scripture is inspired by God (2 Timothy 3:16).",
              "نعم. يؤمن المسيحيون بأن الله كلّم الناس بالأنبياء مرات كثيرة، ثم كلّمهم أخيرًا بابنه (العبرانيين 1: 1–2)، وبأن الكتاب المقدس موحى به من الله (تيموثاوس الثانية 3: 16).",
            ),
            islam: bi(
              "Islam teaches that God sent a messenger to every nation (Quran 16:36). Muslims believe in what was given to Abraham, Moses, Jesus and all the prophets, and they do not reject any of them (Quran 2:136).",
              "يعلّم الإسلام أن الله بعث في كل أمة رسولًا (النحل: 36). ويؤمن المسلمون بما أُنزل على إبراهيم وموسى وعيسى وسائر النبيين، ولا يفرّقون بين أحد منهم (البقرة: 136).",
            ),
            verse: quran("2:136"),
          },
          {
            belief: bi(
              "Christians believe Jesus is the Son of God, true God and true man. He died on the cross for our sins and rose on the third day (Nicene Creed; 1 Corinthians 15:3–4). They trust the Bible as the inspired word of God (2 Timothy 3:16).",
              "يؤمن المسيحيون بأن يسوع هو ابن الله، إله حق وإنسان حق، وأنه مات على الصليب من أجل خطايانا وقام في اليوم الثالث (قانون الإيمان النيقاوي؛ كورنثوس الأولى 15: 3–4). ويثقون بأن الكتاب المقدس كلمة الله الموحى بها (تيموثاوس الثانية 3: 16).",
            ),
            islam: bi(
              "Islam honours Jesus, son of Mary, as the Messiah and a great messenger of God, born of the Virgin Mary (Quran 3:45–47). Islam teaches that he was a human prophet, not God or a son of God, and that he was not killed or crucified: God raised him (Quran 4:171; 4:157–158). Islam teaches that part of the earlier message was forgotten over time (Quran 5:14), and that God promised to guard the Quran Himself (Quran 15:9).",
              "يكرّم الإسلام المسيح عيسى ابن مريم عليه السلام، فهو المسيح ورسول عظيم من رسل الله، وُلد من مريم العذراء (آل عمران: 45–47). ويعلّم الإسلام أنه بشر ونبي، وليس إلهًا ولا ابنًا لله، وأنه لم يُقتل ولم يُصلب بل رفعه الله إليه (النساء: 171؛ النساء: 157–158). ويعلّم أن جزءًا من الرسالة السابقة نُسي مع الزمن (المائدة: 14)، وأن الله تكفّل بحفظ القرآن (الحجر: 9).",
            ),
            verse: quran("4:171"),
          },
          {
            belief: bi(
              "Christians believe that God, who spoke through the prophets, has now spoken his final word in his Son, Jesus Christ (Hebrews 1:1–2). So Christianity does not teach a later prophet or a later book.",
              "يؤمن المسيحيون بأن الله الذي كلّم الناس بالأنبياء قد قال كلمته الأخيرة في ابنه يسوع المسيح (العبرانيين 1: 1–2). لذلك لا تقول المسيحية بنبي أو كتاب يأتي بعده.",
            ),
            islam: bi(
              "Islam teaches that Muhammad is the last of the prophets, sent to all people and not to one nation (Quran 33:40; 7:158). The Quran confirms the books before it (Quran 3:3), and it says that Jesus announced a messenger to come after him (Quran 61:6). The Quran invites every reader to reflect on it and test it (Quran 4:82).",
              "يعلّم الإسلام أن محمدًا ﷺ خاتم النبيين، أُرسل إلى الناس جميعًا لا إلى قوم بعينهم (الأحزاب: 40؛ الأعراف: 158). والقرآن مصدِّق لما قبله من الكتب (آل عمران: 3)، ويذكر أن عيسى عليه السلام بشّر برسول يأتي من بعده (الصف: 6). ويدعو القرآن كل قارئ إلى تدبّره واختباره (النساء: 82).",
            ),
            verse: quran("7:158"),
          },
          {
            belief: bi(
              "Jesus sums up the law in two commands: love God with all your heart, and love your neighbour as yourself (Matthew 22:37–39). Christians believe they are saved by God's grace, through faith in Christ (Ephesians 2:8–9).",
              "يلخّص يسوع الشريعة في وصيتين: أن تحب الله من كل قلبك، وأن تحب قريبك كنفسك (متى 22: 37–39). ويؤمن المسيحيون بأنهم يخلُصون بنعمة الله بالإيمان بالمسيح (أفسس 2: 8–9).",
            ),
            islam: join(
              bi("Islam asks you first to worship God alone and to follow His messenger (Quran 7:158).", "يطلب الإسلام منك أولًا أن تعبد الله وحده وتتّبع رسوله (الأعراف: 158)."),
              FIVE_PILLARS,
              bi(
                "A Muslim still believes in Jesus as a prophet (Quran 2:136). No one may be forced to believe (Quran 2:256).",
                "والمسلم يبقى مؤمنًا بعيسى عليه السلام نبيًّا (البقرة: 136). ولا إكراه لأحد على الإيمان (البقرة: 256).",
              ),
            ),
            verse: quran("2:177"),
          },
        ],
      },
      judaism: {
        entry: 4,
        views: [
          {
            belief: bi("Yes. Jews believe that God created heaven and earth (Genesis 1:1).", "نعم. يؤمن اليهود بأن الله خلق السماء والأرض (التكوين 1: 1)."),
            islam: STEP_CREATED,
            verse: quran("52:35"),
          },
          {
            belief: bi(
              "One God. The Shema declares that the Lord alone is God (Deuteronomy 6:4). Jewish teaching says that God has no body and that only He may be worshipped (Maimonides, Thirteen Principles).",
              "إله واحد. ففي «الشماع» الإقرار بأن الرب وحده هو الإله (التثنية 6: 4). وتعلّم اليهودية أن الله ليس بجسم، وأنه وحده المستحق للعبادة (موسى بن ميمون، الأصول الثلاثة عشر).",
            ),
            islam: bi(
              "Islam teaches the same: God is one and has no partner. Nothing is like Him, and He is the Most Merciful (Quran 112:1–4; 42:11; 1:3).",
              "يعلّم الإسلام الأمر نفسه: الله واحد لا شريك له، ليس كمثله شيء، وهو الرحمن الرحيم (الإخلاص: 1–4؛ الشورى: 11؛ الفاتحة: 3).",
            ),
            verse: quran("112:1"),
          },
          {
            belief: bi(
              "Yes. Jews believe that God speaks through prophets, that Moses is the greatest of them, and that the Torah is from heaven (Maimonides, Thirteen Principles; Deuteronomy 34:10).",
              "نعم. يؤمن اليهود بأن الله يخاطب الناس بالأنبياء، وأن موسى أعظمهم، وأن التوراة من السماء (موسى بن ميمون، الأصول الثلاثة عشر؛ التثنية 34: 10).",
            ),
            islam: bi(
              "Islam teaches that God sent a messenger to every nation (Quran 16:36). Muslims believe in what was given to Abraham, Moses and all the prophets (Quran 2:136), and that God spoke to Moses directly (Quran 4:164).",
              "يعلّم الإسلام أن الله بعث في كل أمة رسولًا (النحل: 36). ويؤمن المسلمون بما أُنزل على إبراهيم وموسى وسائر النبيين (البقرة: 136)، وبأن الله كلّم موسى تكليمًا (النساء: 164).",
            ),
            verse: quran("2:136"),
          },
          {
            belief: bi(
              "Jews hold that the Torah given to Moses is complete and will never be replaced (Maimonides, Thirteen Principles; Deuteronomy 4:2). Judaism does not accept Jesus as the Messiah or as divine. Some Jews today see him as a Jewish teacher (My Jewish Learning).",
              "يرى اليهود أن التوراة التي أوتيها موسى كاملة ولن تُنسخ أبدًا (موسى بن ميمون، الأصول الثلاثة عشر؛ التثنية 4: 2). واليهودية لا تقبل أن يسوع هو المسيح المنتظر ولا أنه إله، وبعض اليهود اليوم يرونه معلّمًا يهوديًّا (موقع My Jewish Learning).",
            ),
            islam: bi(
              "Islam teaches that Jesus, son of Mary, is the Messiah and a messenger of God, born of the Virgin Mary (Quran 3:45–47). He was a human prophet, not God (Quran 4:171). Islam teaches that part of the earlier message was forgotten or changed over time (Quran 5:13), and that God promised to guard the Quran Himself (Quran 15:9).",
              "يعلّم الإسلام أن عيسى ابن مريم عليه السلام هو المسيح، وأنه رسول من الله، وُلد من مريم العذراء (آل عمران: 45–47). وهو بشر ونبي وليس إلهًا (النساء: 171). ويعلّم الإسلام أن جزءًا من الرسالة السابقة نُسي أو غُيّر مع الزمن (المائدة: 13)، وأن الله تكفّل بحفظ القرآن (الحجر: 9).",
            ),
            verse: quran("4:171"),
          },
          {
            belief: bi(
              "Judaism teaches that no prophet like Moses arose again in Israel (Deuteronomy 34:10), and that nothing is to be added to the Torah (Deuteronomy 4:2). So it does not accept a later prophet or a later book.",
              "تعلّم اليهودية أنه لم يقم في إسرائيل بعدُ نبي مثل موسى (التثنية 34: 10)، وأن التوراة لا يُزاد عليها (التثنية 4: 2). ولذلك لا تقبل نبيًّا ولا كتابًا يأتي بعدها.",
            ),
            islam: bi(
              "Islam teaches that Muhammad is the last of the prophets, sent to all people and not to one nation (Quran 33:40; 7:158). The Quran confirms the books before it (Quran 3:3), and says he is described in the Torah and the Gospel (Quran 7:157). The Quran invites every reader to reflect on it and test it (Quran 4:82).",
              "يعلّم الإسلام أن محمدًا ﷺ خاتم النبيين، أُرسل إلى الناس جميعًا لا إلى قوم بعينهم (الأحزاب: 40؛ الأعراف: 158). والقرآن مصدِّق لما قبله من الكتب (آل عمران: 3)، ويذكر أن النبي ﷺ مكتوب في التوراة والإنجيل (الأعراف: 157). ويدعو القرآن كل قارئ إلى تدبّره واختباره (النساء: 82).",
            ),
            verse: quran("7:158"),
          },
          {
            belief: bi(
              "Judaism asks a Jew to keep the commandments of the Torah: to love God with all the heart, to love one's neighbour, to do justice and to walk humbly with God (Deuteronomy 6:4–5; Leviticus 19:18; Micah 6:8).",
              "تطلب اليهودية من اليهودي أن يحفظ وصايا التوراة: أن يحب الله من كل قلبه، وأن يحب قريبه، وأن يعمل بالعدل ويسير بتواضع مع إلهه (التثنية 6: 4–5؛ اللاويين 19: 18؛ ميخا 6: 8).",
            ),
            islam: join(
              bi("Islam asks you first to worship God alone and to follow His messenger (Quran 7:158).", "يطلب الإسلام منك أولًا أن تعبد الله وحده وتتّبع رسوله (الأعراف: 158)."),
              FIVE_PILLARS,
              bi("A Muslim still believes in Moses as a prophet (Quran 2:136). No one may be forced to believe (Quran 2:256).", "والمسلم يبقى مؤمنًا بموسى عليه السلام نبيًّا (البقرة: 136). ولا إكراه لأحد على الإيمان (البقرة: 256)."),
            ),
            verse: quran("2:177"),
          },
        ],
      },
      hinduism: {
        entry: 2,
        views: [
          {
            belief: bi(
              "Yes, for most Hindus. Most Hindus believe in a Supreme God who creates, sustains and dissolves the universe (BBC). In the Gita, Krishna is called the origin of all creation (Bhagavad Gita 10.8).",
              "نعم عند أكثر الهندوس. فأكثرهم يؤمنون بإله أعلى يخلق الكون ويحفظه ثم يفنيه (بي بي سي). وفي الغيتا يوصف كريشنا بأنه أصل كل الخلق (البهاغافاد غيتا 10.8).",
            ),
            islam: STEP_CREATED,
            verse: quran("52:35"),
          },
          {
            belief: bi(
              "Most Hindus believe in one Supreme God, whose qualities and forms are shown by many deities (BBC). Hindus worship through images of the deities, and believe that God comes to earth in forms such as Krishna (BBC; Bhagavad Gita 4.7).",
              "يؤمن أكثر الهندوس بإله أعلى واحد، تمثّل الآلهة الكثيرة صفاته وصوره (بي بي سي). ويتعبّد الهندوس عن طريق تماثيل الآلهة، ويؤمنون بأن الإله ينزل إلى الأرض في صور مثل كريشنا (بي بي سي؛ البهاغافاد غيتا 4.7).",
            ),
            islam: bi(
              "Islam teaches that God is one, with no partners and no forms. Nothing is like Him, and eyes do not reach Him (Quran 112:1–4; 42:11; 6:103). He does not become a human being, and no image can show Him. He is near, and people pray to Him directly (Quran 2:186).",
              "يعلّم الإسلام أن الله واحد بلا شركاء ولا صور. ليس كمثله شيء، ولا تدركه الأبصار (الإخلاص: 1–4؛ الشورى: 11؛ الأنعام: 103). وهو لا يصير بشرًا، ولا تمثّله صورة. وهو قريب، يدعوه الناس مباشرة (البقرة: 186).",
            ),
            verse: quran("42:11"),
          },
          {
            belief: bi(
              "Hindus hold that the Vedas are eternal truths that ancient sages heard and passed on (Hindu American Foundation; BBC). Hinduism has no single founder, and it teaches that there is more than one path to the truth (Hindu American Foundation).",
              "يرى الهندوس أن الفيدا حقائق أزلية سمعها حكماء قدماء ثم نقلوها (المؤسسة الهندوسية الأمريكية؛ بي بي سي). وليس للهندوسية مؤسس واحد، وهي تعلّم أن الطرق إلى الحقيقة متعددة (المؤسسة الهندوسية الأمريكية).",
            ),
            islam: bi(
              "Islam teaches that God sent a messenger to every nation, with one core message: worship God alone (Quran 16:36). Some messengers are named in the Quran and some are not (Quran 40:78). So Muslims believe that guidance reached every people, though the Quran does not name who brought it to each.",
              "يعلّم الإسلام أن الله بعث في كل أمة رسولًا برسالة واحدة في أصلها: اعبدوا الله وحده (النحل: 36). ومن الرسل من قصّهم القرآن ومنهم من لم يقصصهم (غافر: 78). فالمسلمون يؤمنون بأن الهداية بلغت كل قوم، وإن لم يسمِّ القرآن من جاء بها إلى كل قوم.",
            ),
            verse: quran("16:36"),
          },
          {
            belief: bi(
              "Hinduism has no single teaching about Jesus. It has no single scripture and no agreed set of teachings (BBC), and it accepts more than one way of relating to God (Hindu American Foundation).",
              "ليس في الهندوسية تعليم واحد عن المسيح. فليس لها كتاب واحد ولا تعاليم متفق عليها (بي بي سي)، وهي تقبل أكثر من طريق إلى الإله (المؤسسة الهندوسية الأمريكية).",
            ),
            islam: bi(
              "Islam teaches that earlier messages were partly forgotten or changed over time (Quran 5:13–14), and that God promised to guard the Quran Himself (Quran 15:9). Jesus, son of Mary, is honoured in Islam as a human messenger of God, not as God in human form (Quran 4:171).",
              "يعلّم الإسلام أن الرسالات السابقة نُسي بعضها أو غُيّر مع الزمن (المائدة: 13–14)، وأن الله تكفّل بحفظ القرآن (الحجر: 9). والمسيح عيسى ابن مريم عليه السلام مكرَّم في الإسلام، فهو بشر ورسول من الله، وليس إلهًا في صورة بشر (النساء: 171).",
            ),
            verse: quran("15:9"),
          },
          {
            belief: bi(
              "Hinduism does not take one prophet or one book as final. It holds that truth is one and that the wise call it by many names (Hindu American Foundation).",
              "لا تجعل الهندوسية نبيًّا واحدًا ولا كتابًا واحدًا هو الأخير، فهي ترى أن الحقيقة واحدة وأن الحكماء يسمّونها بأسماء كثيرة (المؤسسة الهندوسية الأمريكية).",
            ),
            islam: bi(
              "Islam teaches that Muhammad is the last of the prophets, sent to all people (Quran 33:40; 7:158). The Quran invites every reader to test it: to reflect on it, to look for contradictions, and to try to produce one chapter like it (Quran 4:82; 2:23).",
              "يعلّم الإسلام أن محمدًا ﷺ خاتم النبيين، أُرسل إلى الناس جميعًا (الأحزاب: 40؛ الأعراف: 158). ويدعو القرآن كل قارئ إلى اختباره: أن يتدبّره، وأن يبحث فيه عن الاختلاف، وأن يحاول الإتيان بسورة من مثله (النساء: 82؛ البقرة: 23).",
            ),
            verse: quran("7:158"),
          },
          {
            belief: bi(
              "Hinduism asks a person to live by dharma, which means duty and right conduct, to avoid harming others, and to seek freedom from rebirth through devotion, knowledge, action or meditation (BBC; Hindu American Foundation).",
              "تطلب الهندوسية من الإنسان أن يعيش وفق «الدارما»، أي الواجب والسلوك القويم، وأن يجتنب إيذاء غيره، وأن يطلب التحرّر من تكرار الولادة بالتعبّد أو المعرفة أو العمل أو التأمل (بي بي سي؛ المؤسسة الهندوسية الأمريكية).",
            ),
            islam: join(
              bi("Islam asks you first to worship the one God alone, without images or partners (Quran 1:5; 42:11).", "يطلب الإسلام منك أولًا أن تعبد الإله الواحد وحده، بلا تماثيل ولا شركاء (الفاتحة: 5؛ الشورى: 11)."),
              FIVE_PILLARS,
              bi("No one may be forced to believe (Quran 2:256).", "ولا إكراه لأحد على الإيمان (البقرة: 256)."),
            ),
            verse: quran("2:256"),
          },
        ],
      },
      // Buddhism joins at step 1: it does not teach a Creator, so that is where the difference begins.
      buddhism: {
        entry: 1,
        views: [
          {
            belief: bi(
              "Buddhism has no belief in a personal god (BBC). The Buddha said that no first beginning of the round of rebirth can be found (Samyutta Nikaya 15.3). He set aside questions about whether the world is eternal, because they do not lead to the end of suffering (Majjhima Nikaya 63).",
              "ليس في البوذية إيمان بإله شخصي (بي بي سي). وقد ذكر بوذا أن دورة الولادة المتكررة ليس لها بداية أولى يمكن معرفتها (سَميوتا نيكايا 15.3). وترك أسئلة مثل: هل العالم أزلي؟ لأنها لا توصل إلى نهاية المعاناة (مَجّيما نيكايا 63).",
            ),
            islam: bi(
              "Islam invites you to ask one question. Did everything come from nothing? Did it create itself? Or was it created (Quran 52:35–36)? Islam teaches that the order of the world is a sign for people who use their reason (Quran 2:164). It agrees that everything in this world passes away, and teaches that the One who made it remains (Quran 55:26–27).",
              "يدعوك الإسلام إلى سؤال واحد: هل جاء كل شيء من لا شيء؟ أم خلق نفسه؟ أم أن له خالقًا (الطور: 35–36)؟ ويعلّم الإسلام أن نظام الكون آيات لقوم يعقلون (البقرة: 164). وهو يوافق على أن كل ما في هذه الدنيا فانٍ، ويعلّم أن الذي خلقها باقٍ (الرحمٰن: 26–27).",
            ),
            verse: quran("52:35"),
          },
          {
            belief: bi(
              "The Buddha is honoured as an awakened human teacher who shows the way. Each person must make the effort themselves (Dhammapada 276). Buddhism does not describe a God to be worshipped (BBC).",
              "يُكرَّم بوذا على أنه إنسان مستنير ومعلّم يدلّ على الطريق، وعلى كل إنسان أن يجتهد بنفسه (الدامابادا 276). والبوذية لا تصف إلهًا يُعبد (بي بي سي).",
            ),
            islam: bi(
              "Islam teaches that the Creator is one, and that nothing is like Him (Quran 112:1–4; 42:11). He is the First, so nothing came before Him (Quran 57:3). He is near and answers the one who calls on Him (Quran 2:186), and hearts find rest in remembering Him (Quran 13:28).",
              "يعلّم الإسلام أن الخالق واحد، ليس كمثله شيء (الإخلاص: 1–4؛ الشورى: 11). وهو الأول، فلم يسبقه شيء (الحديد: 3). وهو قريب يجيب من يدعوه (البقرة: 186)، وبذكره تطمئن القلوب (الرعد: 28).",
            ),
            verse: quran("42:11"),
          },
          {
            belief: bi(
              "Buddhist teaching is not presented as a message from a god. It comes from the Buddha's own awakening, and it is kept in collections such as the Pali Canon (Samyutta Nikaya 56.11; Access to Insight). The Buddha asked people to test teachings for themselves (Anguttara Nikaya 3.65).",
              "التعاليم البوذية لا تُقدَّم على أنها رسالة من إله، بل هي ممّا انكشف لبوذا في يقظته، وهي محفوظة في مجموعات مثل القانون البالي (سَميوتا نيكايا 56.11؛ موقع Access to Insight). وقد طلب بوذا من الناس أن يختبروا التعاليم بأنفسهم (أنغوتارا نيكايا 3.65).",
            ),
            islam: bi(
              "Islam teaches that God did not leave people without guidance. He sent a messenger to every nation with one core message: worship God alone (Quran 16:36). Some messengers are named in the Quran and some are not (Quran 40:78). The Quran also tells people not to follow what they have no knowledge of (Quran 17:36).",
              "يعلّم الإسلام أن الله لم يترك الناس بلا هداية، فبعث في كل أمة رسولًا برسالة واحدة في أصلها: اعبدوا الله وحده (النحل: 36). ومن الرسل من قصّهم القرآن ومنهم من لم يقصصهم (غافر: 78). وينهى القرآن كذلك عن اتّباع ما لا علم للإنسان به (الإسراء: 36).",
            ),
            verse: quran("16:36"),
          },
          {
            belief: bi(
              "The Pali Canon holds the discourses of the Buddha and his close disciples (Access to Insight). The Buddha lived about 2,500 years ago (BBC), long before Jesus, so these texts do not speak about him.",
              "يضم القانون البالي خطب بوذا وكبار تلاميذه (موقع Access to Insight). وقد عاش بوذا قبل نحو 2500 سنة (بي بي سي)، أي قبل المسيح بزمن طويل، فهذه النصوص لا تتحدث عنه.",
            ),
            islam: bi(
              "Islam teaches that Jesus, son of Mary, was a human messenger of God, not God (Quran 4:171). Part of the earlier messages was forgotten over time (Quran 5:14). God promised to guard the Quran Himself (Quran 15:9), and the Quran asks its readers to look in it for contradictions (Quran 4:82).",
              "يعلّم الإسلام أن المسيح عيسى ابن مريم عليه السلام بشر ورسول من الله، وليس إلهًا (النساء: 171). وقد نُسي جزء من الرسالات السابقة مع الزمن (المائدة: 14). وتكفّل الله بحفظ القرآن (الحجر: 9)، والقرآن يدعو قارئه إلى أن يبحث فيه عن الاختلاف (النساء: 82).",
            ),
            verse: quran("15:9"),
          },
          {
            belief: bi(
              "Buddhism does not look for a prophet or a revealed book. A Buddhist is asked to judge a teaching by its results: does it lead to harm, or to good? (Anguttara Nikaya 3.65)",
              "لا تنتظر البوذية نبيًّا ولا كتابًا منزَّلًا. ويُطلب من البوذي أن يحكم على التعليم بنتائجه: هل يؤدي إلى الضرر أم إلى الخير؟ (أنغوتارا نيكايا 3.65)",
            ),
            islam: bi(
              "Islam welcomes the test. The Quran asks readers to reflect on it and to look for contradictions (Quran 4:82), and it challenges anyone in doubt to produce one chapter like it (Quran 2:23). It says Muhammad was sent to all people, as the last prophet (Quran 7:158; 33:40), and as a mercy to the worlds (Quran 21:107).",
              "يرحّب الإسلام بهذا الاختبار. فالقرآن يدعو قارئه إلى تدبّره والبحث فيه عن الاختلاف (النساء: 82)، ويتحدّى من يشكّ فيه أن يأتي بسورة من مثله (البقرة: 23). ويذكر أن محمدًا ﷺ أُرسل إلى الناس جميعًا وأنه خاتم النبيين (الأعراف: 158؛ الأحزاب: 40)، وأنه أُرسل رحمة للعالمين (الأنبياء: 107).",
            ),
            verse: quran("7:158"),
          },
          {
            belief: bi(
              "Buddhism asks a person to avoid evil, do good and purify the mind (Dhammapada 183), to keep the five precepts, and to follow the Noble Eightfold Path to the end of suffering (Access to Insight; Samyutta Nikaya 56.11).",
              "تطلب البوذية من الإنسان أن يجتنب الشر ويفعل الخير ويطهّر عقله (الدامابادا 183)، وأن يلتزم المبادئ الخمسة، وأن يسلك الطريق النبيل الثُماني إلى نهاية المعاناة (موقع Access to Insight؛ سَميوتا نيكايا 56.11).",
            ),
            islam: join(
              bi(
                "Islam asks you to keep your kindness and your self-control (Quran 16:90), and to add one thing: worship your Creator alone (Quran 51:56).",
                "يطلب الإسلام منك أن تحتفظ برحمتك وبضبطك لنفسك (النحل: 90)، وأن تضيف أمرًا واحدًا: أن تعبد خالقك وحده (الذاريات: 56).",
              ),
              FIVE_PILLARS,
              bi(
                "Islam is a middle way: it does not ask you to leave the world (Quran 2:143; 28:77). No one may be forced to believe (Quran 2:256).",
                "والإسلام طريق وسط، لا يطلب منك ترك الدنيا (البقرة: 143؛ القصص: 77). ولا إكراه لأحد على الإيمان (البقرة: 256).",
              ),
            ),
            verse: quran("2:256"),
          },
        ],
      },
      sikhism: {
        entry: 4,
        views: [
          {
            belief: bi(
              "Yes. The Sikh scripture opens by affirming one God, the Creator (Sikh Coalition; Guru Granth Sahib, p. 1).",
              "نعم. يفتتح كتاب السيخ المقدس بالإقرار بإله واحد هو الخالق (التحالف السيخي؛ غورو غرانث صاحب، ص 1).",
            ),
            islam: STEP_CREATED,
            verse: quran("52:35"),
          },
          {
            belief: bi(
              "One God. He has no form and no gender, was not born and does not die (Guru Granth Sahib, p. 1; BBC). Sikhs also believe that God is within every person (BBC).",
              "إله واحد، لا صورة له ولا جنس، لم يولد ولا يموت (غورو غرانث صاحب، ص 1؛ بي بي سي). ويؤمن السيخ كذلك بأن الإله في داخل كل إنسان (بي بي سي).",
            ),
            islam: bi(
              "Islam teaches the same about the oneness of God: He is one, He was not born, and nothing is like Him (Quran 112:1–4; 42:11). He is nearer to a person than the jugular vein (Quran 50:16), and He remains distinct from His creation.",
              "يعلّم الإسلام الأمر نفسه في توحيد الله: هو واحد، لم يولد، وليس كمثله شيء (الإخلاص: 1–4؛ الشورى: 11). وهو أقرب إلى الإنسان من حبل الوريد (ق: 16)، وهو مع ذلك غير خلقه.",
            ),
            verse: quran("112:1"),
          },
          {
            belief: bi(
              "Yes, in the Sikh way. Sikhs believe that God shows people the way through scripture and through holy teachers. For Sikhs these are the ten Gurus and the Guru Granth Sahib (BBC; Sikh Coalition).",
              "نعم، على طريقة السيخ. فهم يؤمنون بأن الإله يدلّ الناس على الطريق بكتاب وبمعلّمين صالحين، وهم عندهم المعلّمون العشرة وكتاب غورو غرانث صاحب (بي بي سي؛ التحالف السيخي).",
            ),
            islam: bi(
              "Islam teaches that God sent a messenger to every nation (Quran 16:36), and that He gave revelation to His prophets (Quran 4:163). Islam calls these teachers prophets and messengers: people chosen by God to carry His message.",
              "يعلّم الإسلام أن الله بعث في كل أمة رسولًا (النحل: 36)، وأنه أوحى إلى أنبيائه (النساء: 163). ويسمّي الإسلام هؤلاء المعلّمين أنبياء ورسلًا، أي أناسًا اختارهم الله ليبلّغوا رسالته.",
            ),
            verse: quran("16:36"),
          },
          {
            belief: bi(
              "Sikhs follow the Guru Granth Sahib as their living Guru (BBC). The Gurus taught that there are many ways to connect with God (Sikh Coalition). A Sikh's faith is defined by the ten Gurus and their scripture, and Jesus is not one of them (Sikh Coalition).",
              "يتّبع السيخ كتاب غورو غرانث صاحب، ويعدّونه معلّمهم الحيّ (بي بي سي). وقد علّم معلّموهم أن طرق الاتصال بالإله كثيرة (التحالف السيخي). وإيمان السيخي يقوم على المعلّمين العشرة وكتابهم، والمسيح ليس واحدًا منهم (التحالف السيخي).",
            ),
            islam: bi(
              "Islam teaches that earlier messages were partly forgotten or changed over time (Quran 5:13–14), and that God promised to guard the Quran Himself (Quran 15:9). Islam honours Jesus, son of Mary, as the Messiah and a human messenger of God (Quran 3:45; 4:171).",
              "يعلّم الإسلام أن الرسالات السابقة نُسي بعضها أو غُيّر مع الزمن (المائدة: 13–14)، وأن الله تكفّل بحفظ القرآن (الحجر: 9). ويكرّم الإسلام عيسى ابن مريم عليه السلام، فهو المسيح، وهو بشر ورسول من الله (آل عمران: 45؛ النساء: 171).",
            ),
            verse: quran("15:9"),
          },
          {
            belief: bi(
              "For Sikhs, guidance came through Guru Nanak and the Gurus after him, about five hundred years ago (BBC). A Sikh does not owe allegiance to any other religion (Sikh Coalition).",
              "جاءت الهداية عند السيخ عن طريق الغورو ناناك والمعلّمين من بعده، قبل نحو خمسمئة سنة (بي بي سي). والسيخي لا يدين بالولاء لدين آخر (التحالف السيخي).",
            ),
            islam: bi(
              "Islam teaches that Muhammad is the last of the prophets, sent to all people (Quran 33:40; 7:158), and that God completed the religion with him (Quran 5:3). The Quran invites every reader to test it (Quran 4:82; 2:23).",
              "يعلّم الإسلام أن محمدًا ﷺ خاتم النبيين، أُرسل إلى الناس جميعًا (الأحزاب: 40؛ الأعراف: 158)، وأن الله أكمل به الدين (المائدة: 3). ويدعو القرآن كل قارئ إلى اختباره (النساء: 82؛ البقرة: 23).",
            ),
            verse: quran("7:158"),
          },
          {
            belief: bi(
              "Sikhism asks a Sikh to keep God in mind, to earn an honest living, to share with others and to serve people (BBC).",
              "تطلب السيخية من السيخي أن يذكر الإله، وأن يكسب رزقه بأمانة، وأن يشارك غيره ويخدم الناس (بي بي سي).",
            ),
            islam: join(
              bi(
                "Islam asks for the same care for people (Quran 2:177), and first of all for worship of God alone, in the way His last messenger taught (Quran 7:158).",
                "يطلب الإسلام مثل هذا الإحسان إلى الناس (البقرة: 177)، ويطلب قبل ذلك عبادة الله وحده على ما علّمه خاتم رسله (الأعراف: 158).",
              ),
              FIVE_PILLARS,
              bi("No one may be forced to believe (Quran 2:256).", "ولا إكراه لأحد على الإيمان (البقرة: 256)."),
            ),
            verse: quran("2:177"),
          },
        ],
      },
      atheism: {
        entry: 1,
        views: [
          {
            belief: bi(
              "Atheism is not a religion or a belief system. It answers one question: do you believe in gods? An atheist is a person who lacks that belief (American Atheists). Many atheists trust the scientific method to explain the world, and do not accept the supernatural (Humanists UK).",
              "الإلحاد ليس دينًا ولا منظومة عقائد، بل هو جواب عن سؤال واحد: هل تؤمن بوجود آلهة؟ والملحد هو من لا يحمل هذا الإيمان (منظمة الملحدين الأمريكيين). ويثق كثير من الملحدين بالمنهج العلمي في تفسير العالم، ولا يقبلون ما وراء الطبيعة (جمعية الإنسانيين في بريطانيا).",
            ),
            islam: bi(
              "Islam invites you to ask one question. Did everything come from nothing? Did it create itself? Or was it created (Quran 52:35–36)? Islam teaches that the order of the world is a sign for people who use their reason (Quran 2:164). It does not ask you to stop thinking. It asks you to think it through.",
              "يدعوك الإسلام إلى سؤال واحد: هل جاء كل شيء من لا شيء؟ أم خلق نفسه؟ أم أن له خالقًا (الطور: 35–36)؟ ويعلّم الإسلام أن نظام الكون آيات لقوم يعقلون (البقرة: 164). فهو لا يطلب منك أن تتوقف عن التفكير، بل أن تمضي فيه إلى آخره.",
            ),
            verse: quran("52:35"),
          },
          {
            belief: bi(
              "Atheists do not believe in any god, one or many (American Atheists). Some add a hard question: if a good and all-powerful God exists, why is there so much suffering? (Stanford Encyclopedia of Philosophy)",
              "لا يؤمن الملحدون بأي إله، واحدًا كان أم أكثر (منظمة الملحدين الأمريكيين). ويطرح بعضهم سؤالًا صعبًا: إن كان هناك إله خيّر قادر على كل شيء، فلماذا كل هذه المعاناة؟ (موسوعة ستانفورد للفلسفة)",
            ),
            islam: bi(
              "Islam teaches that the Creator is one, and that nothing is like Him (Quran 112:1–4; 42:11). He is the First, so nothing came before Him and no one made Him (Quran 57:3). Islam teaches that this life is a test (Quran 67:2), and that every wrong will be weighed with full justice (Quran 21:47).",
              "يعلّم الإسلام أن الخالق واحد، ليس كمثله شيء (الإخلاص: 1–4؛ الشورى: 11). وهو الأول، فلم يسبقه شيء ولم يخلقه أحد (الحديد: 3). ويعلّم أن هذه الحياة اختبار (الملك: 2)، وأن كل ظلم سيوزن بميزان العدل التام (الأنبياء: 47).",
            ),
            verse: quran("42:11"),
          },
          {
            belief: bi(
              "Atheism has no revelation and no scripture. Humanists, for example, hold that reliable knowledge comes from observation, reason and free inquiry, and that it can always be revised (Declaration of Modern Humanism).",
              "ليس في الإلحاد وحي ولا كتاب مقدس. والإنسانيون مثلًا يرون أن المعرفة الموثوقة تأتي من الملاحظة والعقل والبحث الحر، وأنها قابلة للمراجعة دائمًا (إعلان الإنسانية الحديثة).",
            ),
            islam: bi(
              "Islam teaches that God did not leave people without guidance. He sent a messenger to every nation with one core message: worship God alone (Quran 16:36). The messengers came so that people would know what God asks of them, and no one would be judged without warning (Quran 4:165; 17:15).",
              "يعلّم الإسلام أن الله لم يترك الناس بلا هداية، فبعث في كل أمة رسولًا برسالة واحدة في أصلها: اعبدوا الله وحده (النحل: 36). وجاء الرسل ليعرف الناس ما يطلبه الله منهم، فلا يُحاسَب أحد قبل أن يبلغه البيان (النساء: 165؛ الإسراء: 15).",
            ),
            verse: quran("16:36"),
          },
          {
            belief: bi(
              "For an atheist, no book is a message from God, because there is no belief in gods (American Atheists). Humanists also do not accept the supernatural (Humanists UK). So Jesus is not seen as a messenger of God.",
              "لا يرى الملحد في أي كتاب رسالة من عند الله، لأنه لا يؤمن بوجود آلهة (منظمة الملحدين الأمريكيين). والإنسانيون كذلك لا يقبلون ما وراء الطبيعة (جمعية الإنسانيين في بريطانيا). ولذلك لا يُنظر إلى المسيح على أنه رسول من الله.",
            ),
            islam: bi(
              "Islam teaches that Jesus, son of Mary, was a human messenger of God, not God (Quran 4:171). The earlier books came from God (Quran 3:3), but part of that message was forgotten over time (Quran 5:14). God promised to guard the Quran Himself (Quran 15:9), and the Quran asks its readers to look in it for contradictions (Quran 4:82).",
              "يعلّم الإسلام أن المسيح عيسى ابن مريم عليه السلام بشر ورسول من الله، وليس إلهًا (النساء: 171). والكتب السابقة نزلت من عند الله (آل عمران: 3)، لكنّ جزءًا من تلك الرسالة نُسي مع الزمن (المائدة: 14). وقد تكفّل الله بحفظ القرآن (الحجر: 9)، والقرآن يدعو قارئه إلى أن يبحث فيه عن الاختلاف (النساء: 82).",
            ),
            verse: quran("15:9"),
          },
          {
            belief: bi(
              "With no belief in gods, an atheist does not accept that Muhammad, or anyone else, received a revelation (American Atheists). Humanists ask that the world's questions be answered by reason, science and free inquiry (Declaration of Modern Humanism).",
              "ما دام الملحد لا يؤمن بوجود آلهة، فهو لا يقبل أن محمدًا أو غيره تلقّى وحيًا (منظمة الملحدين الأمريكيين). ويطلب الإنسانيون أن يُجاب عن أسئلة العالم بالعقل والعلم والبحث الحر (إعلان الإنسانية الحديثة).",
            ),
            islam: bi(
              "Islam welcomes the test. The Quran asks readers to reflect on it and to look for contradictions (Quran 4:82). It challenges anyone in doubt to produce one chapter like it (Quran 2:23). It says Muhammad was sent to all people, as the last prophet (Quran 7:158; 33:40). And it says he was a human being who only followed what was revealed to him (Quran 46:9).",
              "يرحّب الإسلام بهذا الاختبار. فالقرآن يدعو قارئه إلى تدبّره والبحث فيه عن الاختلاف (النساء: 82)، ويتحدّى من يشكّ فيه أن يأتي بسورة من مثله (البقرة: 23). ويذكر أن محمدًا ﷺ أُرسل إلى الناس جميعًا وأنه خاتم النبيين (الأعراف: 158؛ الأحزاب: 40)، وأنه بشر يتّبع ما يُوحى إليه (الأحقاف: 9).",
            ),
            verse: quran("7:158"),
          },
          {
            belief: bi(
              "Many atheists make their ethical choices with reason and empathy, and give their lives meaning by seeking happiness and helping others (Humanists UK).",
              "يتخذ كثير من الملحدين قراراتهم الأخلاقية بالعقل والتعاطف، ويمنحون حياتهم معنى بالسعي إلى السعادة ومساعدة الآخرين (جمعية الإنسانيين في بريطانيا).",
            ),
            islam: join(
              bi(
                "Islam asks you to keep your reason and your care for others (Quran 2:164; 16:90), and to add one thing: worship your Creator alone (Quran 51:56).",
                "يطلب الإسلام منك أن تحتفظ بعقلك وبإحسانك إلى الناس (البقرة: 164؛ النحل: 90)، وأن تضيف أمرًا واحدًا: أن تعبد خالقك وحده (الذاريات: 56).",
              ),
              FIVE_PILLARS,
              bi("No one may be forced to believe (Quran 2:256).", "ولا إكراه لأحد على الإيمان (البقرة: 256)."),
            ),
            verse: quran("2:256"),
          },
        ],
      },
      agnosticism: {
        entry: 1,
        views: [
          {
            belief: bi(
              "An agnostic has thought about the question, and neither believes that there is a God nor believes that there is none (Stanford Encyclopedia of Philosophy). The word comes from T. H. Huxley. His rule was: do not treat a conclusion as certain when it has not been shown (Huxley, “Agnosticism”).",
              "اللاأدري فكّر في المسألة، وهو لا يعتقد أن الله موجود ولا يعتقد أنه غير موجود (موسوعة ستانفورد للفلسفة). والكلمة من وضع توماس هنري هكسلي، وقاعدته: لا تجعل النتيجة يقينًا وهي لم تثبت (هكسلي، «اللاأدرية»).",
            ),
            islam: bi(
              "Islam respects that rule: the Quran says not to follow what you have no knowledge of (Quran 17:36). Then it asks one question. Did everything come from nothing? Did it create itself? Or was it created (Quran 52:35–36)? It says God shows His signs in the world and within people, until the truth becomes clear (Quran 41:53).",
              "يحترم الإسلام هذه القاعدة، فالقرآن ينهى عن اتّباع ما لا علم للإنسان به (الإسراء: 36). ثم يطرح سؤالًا واحدًا: هل جاء كل شيء من لا شيء؟ أم خلق نفسه؟ أم أن له خالقًا (الطور: 35–36)؟ ويذكر أن الله يُري الناس آياته في الآفاق وفي أنفسهم حتى يتبيّن لهم الحق (فصلت: 53).",
            ),
            verse: quran("52:35"),
          },
          {
            belief: bi(
              "For an agnostic the question stays open, so nothing is claimed about what God is like. Some add that such questions are beyond what the human mind can reach (Digital Dawah Repository).",
              "تبقى المسألة مفتوحة عند اللاأدري، فلا يقول شيئًا عن صفات الله. ويضيف بعضهم أن هذه المسائل فوق ما يدركه عقل الإنسان (المستودع الدعوي الرقمي).",
            ),
            islam: bi(
              "Islam teaches that the mind can know that the Creator exists, and that He is one and unlike anything else (Quran 112:1–4; 42:11). What He is like in full is beyond us. So He told us about Himself: He is the First, and He is the Most Merciful (Quran 57:3; 1:3).",
              "يعلّم الإسلام أن العقل يستطيع أن يعرف أن الخالق موجود، وأنه واحد ليس كمثله شيء (الإخلاص: 1–4؛ الشورى: 11). أما حقيقته فهي فوق إدراكنا، ولذلك عرّفنا بنفسه: فهو الأول، وهو الرحمن الرحيم (الحديد: 3؛ الفاتحة: 3).",
            ),
            verse: quran("42:11"),
          },
          {
            belief: bi(
              "Agnosticism has no revelation and no scripture. Its rule is to follow reason as far as it goes, and to accept only what the evidence supports (Huxley, “Agnosticism”).",
              "ليس في اللاأدرية وحي ولا كتاب مقدس. وقاعدتها أن يُتَّبع العقل إلى حيث يصل، وألا يُقبل إلا ما يؤيّده الدليل (هكسلي، «اللاأدرية»).",
            ),
            islam: bi(
              "Islam teaches that God did not leave people without guidance. He sent a messenger to every nation with one core message: worship God alone (Quran 16:36). The messengers came so that people would know what God asks of them, and no one would be judged without warning (Quran 4:165; 17:15).",
              "يعلّم الإسلام أن الله لم يترك الناس بلا هداية، فبعث في كل أمة رسولًا برسالة واحدة في أصلها: اعبدوا الله وحده (النحل: 36). وجاء الرسل ليعرف الناس ما يطلبه الله منهم، فلا يُحاسَب أحد قبل أن يبلغه البيان (النساء: 165؛ الإسراء: 15).",
            ),
            verse: quran("16:36"),
          },
          {
            belief: bi(
              "An agnostic does not accept any book as a message from God until there is good evidence for it (Huxley, “Agnosticism”). So whether Jesus was sent by God is, for an agnostic, an open question.",
              "لا يقبل اللاأدري أن كتابًا ما رسالة من عند الله حتى يقوم عليه دليل كافٍ (هكسلي، «اللاأدرية»). ولذلك تبقى مسألة إرسال الله للمسيح مفتوحة عنده.",
            ),
            islam: bi(
              "Islam teaches that Jesus, son of Mary, was a human messenger of God, not God (Quran 4:171). The earlier books came from God (Quran 3:3), but part of that message was forgotten over time (Quran 5:14). God promised to guard the Quran Himself (Quran 15:9), and the Quran asks its readers to look in it for contradictions (Quran 4:82).",
              "يعلّم الإسلام أن المسيح عيسى ابن مريم عليه السلام بشر ورسول من الله، وليس إلهًا (النساء: 171). والكتب السابقة نزلت من عند الله (آل عمران: 3)، لكنّ جزءًا من تلك الرسالة نُسي مع الزمن (المائدة: 14). وقد تكفّل الله بحفظ القرآن (الحجر: 9)، والقرآن يدعو قارئه إلى أن يبحث فيه عن الاختلاف (النساء: 82).",
            ),
            verse: quran("15:9"),
          },
          {
            belief: bi(
              "An agnostic asks for evidence before accepting that Muhammad, or anyone, received a revelation. Huxley wrote that he would believe a claim if he were given evidence that would justify believing anything else (Huxley, letter of 1860).",
              "يطلب اللاأدري الدليل قبل أن يقبل أن محمدًا أو غيره تلقّى وحيًا. وقد كتب هكسلي أنه يصدّق الدعوى إذا أُعطي من الدليل ما يسوّغ تصديق أي شيء آخر (هكسلي، رسالة عام 1860).",
            ),
            islam: bi(
              "Islam welcomes the test. The Quran asks readers to reflect on it and to look for contradictions (Quran 4:82). It challenges anyone in doubt to produce one chapter like it (Quran 2:23). It says Muhammad was sent to all people, as the last prophet (Quran 7:158; 33:40). And it says he was a human being who only followed what was revealed to him (Quran 46:9).",
              "يرحّب الإسلام بهذا الاختبار. فالقرآن يدعو قارئه إلى تدبّره والبحث فيه عن الاختلاف (النساء: 82)، ويتحدّى من يشكّ فيه أن يأتي بسورة من مثله (البقرة: 23). ويذكر أن محمدًا ﷺ أُرسل إلى الناس جميعًا وأنه خاتم النبيين (الأعراف: 158؛ الأحزاب: 40)، وأنه بشر يتّبع ما يُوحى إليه (الأحقاف: 9).",
            ),
            verse: quran("7:158"),
          },
          {
            belief: bi(
              "Agnosticism itself asks only for honesty of mind (Huxley, “Agnosticism”). Humanists, who may be agnostics, also live by reason, empathy and helping others (Humanists UK).",
              "اللاأدرية نفسها لا تطلب إلا الأمانة العقلية (هكسلي، «اللاأدرية»). والإنسانيون، ومنهم لاأدريون، يعيشون كذلك بالعقل والتعاطف ومساعدة الآخرين (جمعية الإنسانيين في بريطانيا).",
            ),
            islam: join(
              bi(
                "Islam asks you to keep that honesty and that care for others (Quran 17:36; 16:90), and to follow the evidence to its end: to worship your Creator alone (Quran 51:56).",
                "يطلب الإسلام منك أن تحتفظ بهذه الأمانة وبهذا الإحسان إلى الناس (الإسراء: 36؛ النحل: 90)، وأن تمضي مع الدليل إلى آخره: أن تعبد خالقك وحده (الذاريات: 56).",
              ),
              FIVE_PILLARS,
              bi("No one may be forced to believe (Quran 2:256).", "ولا إكراه لأحد على الإيمان (البقرة: 256)."),
            ),
            verse: quran("2:256"),
          },
        ],
      },
    },
  },

  // The comparison for each topic, keyed by topic id. A topic with no entry shows "Being prepared".
  comparisons: {
    "christianity.god": {
      overview: {
        belief: [bi(
          "Christians believe in one God, who made everything. They believe this one God is three persons: the Father, the Son (Jesus Christ) and the Holy Spirit. This teaching is called the Trinity (Nicene Creed; Matthew 28:19).",
          "يؤمن المسيحيون بإله واحد خلق كل شيء. ويؤمنون بأن هذا الإله الواحد ثلاثة أقانيم (أي أشخاص): الآب، والابن (يسوع المسيح)، والروح القدس. ويُسمّى هذا التعليم الثالوث (قانون الإيمان النيقاوي؛ متى 28: 19).",
        )],
        islam: [bi(
          "Islam teaches that God is one in every way. He has no partner, no son and no equal. This belief is called tawhid, which means the oneness of God (Quran 112:1–4).",
          "يعلّم الإسلام أن الله واحد من كل وجه، لا شريك له ولا ولد ولا مثيل. ويُسمّى هذا الاعتقاد التوحيد، أي إفراد الله بالألوهية (الإخلاص: 1–4).",
        )],
      },
      beliefs: {
        belief: [
          bi("There is one God, the Father almighty, maker of heaven and earth (Apostles' Creed; Deuteronomy 6:4).", "إله واحد، الآب القدير، خالق السماء والأرض (قانون إيمان الرسل؛ التثنية 6: 4)."),
          bi("Jesus Christ is the eternal Son of God, who became human (John 1:1; 1:14).", "يسوع المسيح هو ابن الله الأزلي الذي صار إنسانًا (يوحنا 1: 1؛ 1: 14)."),
          bi("The Holy Spirit is the Lord and giver of life, worshipped with the Father and the Son (Nicene Creed).", "الروح القدس هو الرب المحيي، يُعبد مع الآب والابن (قانون الإيمان النيقاوي)."),
          bi("God is love (1 John 4:8).", "الله محبة (رسالة يوحنا الأولى 4: 8)."),
        ],
        islam: ISLAM.oneGod,
      },
      common: [
        bi("There is one God, the Creator of the heavens and the earth (Genesis 1:1; Quran 42:11).", "الله واحد، خالق السماوات والأرض (التكوين 1: 1؛ الشورى: 11)."),
        bi("God is merciful, and He hears prayer (Matthew 6:9; Quran 1:3; 2:186).", "الله رحيم يسمع الدعاء (متى 6: 9؛ الفاتحة: 3؛ البقرة: 186)."),
        bi("The Quran tells Muslims to say to Jews and Christians: our God and your God is one (Quran 29:46).", "يأمر القرآن المسلمين أن يقولوا لليهود والمسيحيين: إلهنا وإلهكم واحد (العنكبوت: 46)."),
      ],
      differences: {
        belief: [
          bi("God is one being in three persons: Father, Son and Holy Spirit (Nicene Creed).", "الله جوهر واحد في ثلاثة أقانيم: الآب والابن والروح القدس (قانون الإيمان النيقاوي)."),
          bi("The Son became human in Jesus, and God is known through him (John 1:14).", "الابن صار إنسانًا في يسوع، وبه يُعرف الله (يوحنا 1: 14)."),
        ],
        islam: [
          bi("Islam teaches that God is one, with no persons and no partners, and it asks people not to say “three” (Quran 4:171).", "يعلّم الإسلام أن الله واحد بلا أقانيم ولا شركاء، وينهى عن قول «ثلاثة» (النساء: 171)."),
          bi("Islam teaches that God has no son, and that nothing created is like Him (Quran 19:35; 42:11).", "يعلّم الإسلام أن الله لم يتخذ ولدًا، وأنه لا يشبهه شيء من خلقه (مريم: 35؛ الشورى: 11)."),
        ],
      },
      faq: [
        {
          id: "same-god",
          q: bi("Do Muslims and Christians worship the same God?", "هل يعبد المسلمون والمسيحيون الإله نفسه؟"),
          a: bi(
            "Both worship the one God who created the world. The Quran tells Muslims to say: our God and your God is one (29:46). The difference is in how God is understood. Christians believe in the Trinity. Islam teaches that God is one, with no persons and no partners (4:171).",
            "كلاهما يعبد الإله الواحد خالق العالم. ويأمر القرآن المسلمين أن يقولوا: إلهنا وإلهكم واحد (العنكبوت: 46). والاختلاف في فهم حقيقة الله: فالمسيحيون يؤمنون بالثالوث، والإسلام يعلّم أن الله واحد بلا أقانيم ولا شركاء (النساء: 171).",
          ),
        },
        {
          id: "trinity",
          q: bi("Why does Islam not accept the Trinity?", "لماذا لا يقبل الإسلام عقيدة الثالوث؟"),
          a: bi(
            "Islam teaches that God is fully one and needs nothing (112:1–4). It teaches that the Messiah was a messenger like the messengers before him, and the Quran notes that he and his mother both ate food (5:75). So Islam honours Jesus as a great messenger, and keeps worship for God alone (1:5).",
            "يعلّم الإسلام أن الله أحد صمد لا يحتاج إلى شيء (الإخلاص: 1–4). ويعلّم أن المسيح رسول كالرسل الذين سبقوه، وقد ذكر القرآن أنه وأمه كانا يأكلان الطعام (المائدة: 75). ولذلك يكرّم الإسلام المسيح رسولًا عظيمًا، ويجعل العبادة لله وحده (الفاتحة: 5).",
          ),
        },
        {
          id: "allah",
          q: bi("What does “Allah” mean?", "ما معنى كلمة «الله»؟"),
          a: bi(
            "“Allah” is the Arabic name for the one God, who alone deserves worship (Encyclopedia of Islamic Terms). It is not the name of a different god. Arabic Bibles use the same word for God, for example in John 3:16.",
            "«الله» هو الاسم العربي للإله الواحد المستحق للعبادة وحده (موسوعة المصطلحات الإسلامية). وليس اسمًا لإله آخر، فالترجمات العربية للكتاب المقدس تستعمل الكلمة نفسها، كما في يوحنا 3: 16.",
          ),
        },
      ],
      sources: {
        belief: [CREEDS, bible("Genesis 1:1", "التكوين 1: 1"), bible("Deuteronomy 6:4", "التثنية 6: 4"), bible("Matthew 6:9", "متى 6: 9"), bible("Matthew 28:19", "متى 28: 19"), bible("John 1:1", "يوحنا 1: 1"), bible("John 1:14", "يوحنا 1: 14"), bible("1 John 4:8", "رسالة يوحنا الأولى 4: 8"), ARABIC_BIBLE],
        islam: [quran("112:1"), quran("112:2"), quran("112:3"), quran("112:4"), quran("42:11"), quran("1:3"), quran("1:5"), quran("2:255"), quran("2:186"), quran("4:171"), quran("19:35"), quran("5:75"), quran("29:46"), TERM_ALLAH, comparisonBook("115")],
      },
    },

    "christianity.sources": {
      overview: {
        belief: [bi(
          "The Christian holy book is the Bible. It has two parts: the Old Testament, from before Jesus, and the New Testament, about Jesus and the first Christians (M. As-Sayed Muhammad, p. 43). Christians believe the Bible is inspired by God (2 Timothy 3:16).",
          "كتاب المسيحيين هو الكتاب المقدس، وهو قسمان: العهد القديم، وهو ما كان قبل يسوع، والعهد الجديد، وهو عن يسوع والمسيحيين الأوائل (محمد السيد محمد، ص 43). ويؤمن المسيحيون بأن الكتاب المقدس موحى به من الله (تيموثاوس الثانية 3: 16).",
        )],
        islam: INTRO.book,
      },
      beliefs: {
        belief: [
          bi("The New Testament has four Gospels (Matthew, Mark, Luke and John), letters of the apostles and other writings (M. As-Sayed Muhammad, p. 43).", "يضم العهد الجديد أربعة أناجيل (متى ومرقس ولوقا ويوحنا) ورسائل الرسل وكتابات أخرى (محمد السيد محمد، ص 43)."),
          bi("Christians believe all Scripture is inspired by God, and that it teaches and corrects (2 Timothy 3:16).", "يؤمن المسيحيون بأن الكتاب كله موحى به من الله، وأنه نافع للتعليم والتقويم (تيموثاوس الثانية 3: 16)."),
          bi("Churches differ a little on the list of books: the Catholic Bible has seven more books than the Protestant Bible (M. As-Sayed Muhammad, p. 43).", "تختلف الكنائس قليلًا في قائمة الأسفار: ففي الكتاب المقدس الكاثوليكي سبعة أسفار زائدة على ما عند البروتستانت (محمد السيد محمد، ص 43)."),
          bi("Many churches also say the early creeds, such as the Apostles' Creed and the Nicene Creed (Church of England).", "وتتلو كنائس كثيرة قوانين الإيمان القديمة، مثل قانون إيمان الرسل وقانون الإيمان النيقاوي (كنيسة إنجلترا)."),
        ],
        islam: ISLAM.book,
      },
      common: [
        bi("God speaks to people through prophets (Hebrews 1:1–2; Quran 4:163).", "الله يخاطب الناس عن طريق الأنبياء (العبرانيين 1: 1–2؛ النساء: 163)."),
        bi("The Torah, the Psalms and the Gospel are honoured as given by God (2 Timothy 3:16; Quran 3:3; 4:163).", "التوراة والزبور والإنجيل لها مكانتها لأنها من عند الله (تيموثاوس الثانية 3: 16؛ آل عمران: 3؛ النساء: 163)."),
        bi("Scripture is to be read, thought about and lived (2 Timothy 3:16; Quran 4:82).", "الكتاب يُقرأ ويُتدبَّر ويُعمل به (تيموثاوس الثانية 3: 16؛ النساء: 82)."),
      ],
      differences: {
        belief: [
          bi("Christians trust the Bible they read today as the inspired word of God (2 Timothy 3:16).", "يثق المسيحيون بأن الكتاب المقدس الذي بين أيديهم اليوم هو كلمة الله الموحى بها (تيموثاوس الثانية 3: 16)."),
          bi("God's final word is his Son, so no later scripture is expected (Hebrews 1:1–2).", "كلمة الله الأخيرة هي ابنه، فلا يُنتظر كتاب بعده (العبرانيين 1: 1–2)."),
        ],
        islam: [
          bi("Islam teaches that the first Torah and Gospel were guidance and light from God, but that part of the message was later forgotten or changed (Quran 5:13–14; 5:46).", "يعلّم الإسلام أن التوراة والإنجيل كانا في أصلهما هدى ونورًا من الله، لكنّ جزءًا من الرسالة نُسي أو غُيّر بعد ذلك (المائدة: 13–14؛ المائدة: 46)."),
          bi("Islam teaches that the Quran confirms the earlier books and is the measure over them (Quran 5:48).", "يعلّم الإسلام أن القرآن مصدِّق لما قبله من الكتب ومهيمن عليها، أي شاهد وحاكم عليها (المائدة: 48)."),
        ],
      },
      faq: [
        {
          id: "bible",
          q: bi("Do Muslims believe in the Bible?", "هل يؤمن المسلمون بالكتاب المقدس؟"),
          a: bi(
            "Muslims believe God gave the Torah to Moses, the Psalms to David and the Gospel to Jesus (4:163; 5:46). Islam teaches that these first books were true guidance, and that part of the message was forgotten over time (5:14). So Muslims respect them, and take the Quran as the final measure (5:48).",
            "يؤمن المسلمون بأن الله أنزل التوراة على موسى، والزبور على داود، والإنجيل على عيسى عليهم السلام (النساء: 163؛ المائدة: 46). ويعلّم الإسلام أن هذه الكتب كانت في أصلها هدى، وأن جزءًا من الرسالة نُسي مع الزمن (المائدة: 14). فالمسلمون يحترمونها، ويجعلون القرآن هو الحَكَم الأخير (المائدة: 48).",
          ),
        },
        FAQ.preserved,
        FAQ.author,
      ],
      sources: {
        belief: [bible("2 Timothy 3:16", "تيموثاوس الثانية 3: 16"), bible("Hebrews 1:1–2", "العبرانيين 1: 1–2"), CREEDS, comparisonBook("43")],
        islam: [quran("2:97"), quran("15:9"), quran("33:21"), quran("10:37"), quran("4:163"), quran("5:44"), quran("5:46"), quran("3:3"), quran("4:82"), quran("5:13–14"), quran("5:48"), quran("2:23"), comparisonBook("129")],
      },
    },

    "christianity.life": {
      overview: {
        belief: [bi(
          "Christians believe that God made people in his image (Genesis 1:27). The purpose of life is to know God, and to love him and other people (John 17:3; Matthew 22:37–39).",
          "يؤمن المسيحيون بأن الله خلق الإنسان على صورته (التكوين 1: 27). وغاية الحياة أن يعرف الإنسان الله، وأن يحبه ويحب الناس (يوحنا 17: 3؛ متى 22: 37–39).",
        )],
        islam: INTRO.human,
      },
      beliefs: {
        belief: [
          bi("Every person is made in the image of God (Genesis 1:27).", "كل إنسان مخلوق على صورة الله (التكوين 1: 27)."),
          bi("Sin came into the world through one man, and death with it, and it reached all people. This is often called original sin (Romans 5:12).", "دخلت الخطيئة إلى العالم بإنسان واحد ومعها الموت، وعمّت جميع الناس. ويُسمّى هذا غالبًا الخطيئة الأصلية (رومية 5: 12)."),
          bi("All have sinned. People are put right with God freely, by his grace, through Jesus Christ (Romans 3:23–24).", "الجميع أخطأوا، والإنسان يتبرّر مجّانًا بنعمة الله بيسوع المسيح (رومية 3: 23–24)."),
          bi("Salvation is a gift of God, received through faith and not earned by works (Ephesians 2:8–9).", "الخلاص عطية من الله، يُنال بالإيمان لا بالأعمال (أفسس 2: 8–9)."),
        ],
        islam: ISLAM.human,
      },
      common: [
        bi("Human life has a purpose that comes from God (John 17:3; Quran 51:56).", "لحياة الإنسان غاية من عند الله (يوحنا 17: 3؛ الذاريات: 56)."),
        bi("People do wrong, and they need God's mercy and forgiveness (Romans 3:23–24; Quran 39:53).", "الناس يخطئون ويحتاجون إلى رحمة الله ومغفرته (رومية 3: 23–24؛ الزمر: 53)."),
        bi("Devotion to God and doing good to others belong together (Matthew 22:37–39; Quran 4:36).", "الإخلاص لله والإحسان إلى الناس متلازمان (متى 22: 37–39؛ النساء: 36)."),
      ],
      differences: {
        belief: [
          bi("People are born into a world marked by sin, and they need a saviour (Romans 5:12).", "يولد الإنسان في عالم دخلته الخطيئة، وهو يحتاج إلى مخلّص (رومية 5: 12)."),
          bi("Christ died for our sins, and salvation comes through faith in him (1 Corinthians 15:3–4; Ephesians 2:8–9).", "مات المسيح من أجل خطايانا، والخلاص يكون بالإيمان به (كورنثوس الأولى 15: 3–4؛ أفسس 2: 8–9)."),
        ],
        islam: [
          bi("Islam teaches that sin is not inherited: no soul carries the burden of another (Quran 6:164).", "يعلّم الإسلام أن الخطيئة لا تُورَّث، فلا تحمل نفسٌ حِمل نفس أخرى (الأنعام: 164)."),
          bi("Islam teaches that God forgives the one who asks Him, and that faith goes together with good deeds (Quran 4:110; 4:124).", "يعلّم الإسلام أن الله يغفر لمن يستغفره، وأن الإيمان يقترن بالعمل الصالح (النساء: 110؛ النساء: 124)."),
        ],
      },
      faq: [
        {
          id: "original-sin",
          q: bi("Does Islam teach original sin?", "هل يقول الإسلام بالخطيئة الأصلية؟"),
          a: bi(
            "No. Islam teaches that Adam made a mistake, turned back to God, and God accepted his repentance (2:37). After that, each person carries only their own deeds (6:164).",
            "لا. يعلّم الإسلام أن آدم عليه السلام أخطأ ثم تاب إلى الله فقبل توبته (البقرة: 37). وبعد ذلك لا يحمل كل إنسان إلا عمله هو (الأنعام: 164).",
          ),
        },
        FAQ.saved,
        FAQ.purpose,
      ],
      sources: {
        belief: [bible("Genesis 1:27", "التكوين 1: 27"), bible("John 17:3", "يوحنا 17: 3"), bible("Matthew 22:37–39", "متى 22: 37–39"), bible("Romans 5:12", "رومية 5: 12"), bible("Romans 3:23–24", "رومية 3: 23–24"), bible("Ephesians 2:8–9", "أفسس 2: 8–9"), bible("1 Corinthians 15:3–4", "كورنثوس الأولى 15: 3–4")],
        islam: [quran("51:56"), quran("67:2"), quran("17:70"), quran("30:30"), quran("2:37"), quran("6:164"), quran("53:39"), quran("39:53"), quran("4:36"), quran("4:110"), quran("4:124"), quran("23:115"), comparisonBook("40–41")],
      },
    },

    "christianity.practice": {
      overview: {
        belief: [bi(
          "Christian life is built on love of God and love of neighbour (Matthew 22:37–39). Christians pray, are baptised, and share bread and wine in memory of Jesus (Matthew 6:9; 28:19; Luke 22:19–20).",
          "تقوم الحياة المسيحية على محبة الله ومحبة القريب (متى 22: 37–39). والمسيحيون يصلّون ويعتمدون، ويتناولون الخبز والخمر لذكرى يسوع (متى 6: 9؛ 28: 19؛ لوقا 22: 19–20).",
        )],
        islam: INTRO.worship,
      },
      beliefs: {
        belief: [
          bi("Prayer: Jesus taught his followers to pray to God as Father. This is called the Lord's Prayer (Matthew 6:9).", "الصلاة: علّم يسوع تلاميذه أن يصلّوا إلى الله أبيهم، وتُسمّى هذه الصلاة الربّانية (متى 6: 9)."),
          bi("Baptism: believers are baptised in the name of the Father, the Son and the Holy Spirit (Matthew 28:19).", "المعمودية: يُعمَّد المؤمنون باسم الآب والابن والروح القدس (متى 28: 19)."),
          bi("Communion, also called the Eucharist: Christians share bread and wine in memory of Jesus (Luke 22:19–20).", "التناول، ويُسمّى أيضًا الإفخارستيا: يتناول المسيحيون الخبز والخمر لذكرى يسوع (لوقا 22: 19–20)."),
          bi("Giving and fasting are done quietly, for God and not for show (Matthew 6:2–4; 6:16–18).", "الصدقة والصوم يكونان في الخفاء، لله لا للتظاهر (متى 6: 2–4؛ 6: 16–18)."),
          bi("The golden rule: do to others what you want them to do to you (Matthew 7:12).", "القاعدة الذهبية: عامل الناس بما تحب أن يعاملوك به (متى 7: 12)."),
        ],
        islam: ISLAM.worship,
      },
      common: [
        bi("Prayer to God is at the centre of life (Matthew 6:9; Quran 20:14).", "الصلاة لله في قلب الحياة (متى 6: 9؛ طه: 14)."),
        bi("Both give to the poor and fast. The Quran says fasting was also asked of earlier communities (Matthew 6:2–4; 6:16–18; Quran 2:183).", "كلاهما يتصدّق ويصوم، وقد ذكر القرآن أن الصيام كُتب على الأمم السابقة أيضًا (متى 6: 2–4؛ 6: 16–18؛ البقرة: 183)."),
        bi("Love of neighbour and care for people in need (Matthew 22:37–39; Quran 4:36).", "محبة القريب ورعاية المحتاج (متى 22: 37–39؛ النساء: 36)."),
      ],
      differences: {
        belief: [
          bi("Communion recalls the death of Jesus, which Christians believe was for their sins (Luke 22:19–20; 1 Corinthians 15:3–4).", "يذكّر التناول بموت يسوع، ويؤمن المسيحيون بأنه كان من أجل خطاياهم (لوقا 22: 19–20؛ كورنثوس الأولى 15: 3–4)."),
          bi("Christians pray in the name of Jesus (John 14:13–14).", "يصلّي المسيحيون باسم يسوع (يوحنا 14: 13–14)."),
        ],
        islam: [
          bi("Islam teaches that worship and prayer go to God alone, and that He answers the one who calls on Him (Quran 1:5; 2:186).", "يعلّم الإسلام أن العبادة والدعاء لله وحده، وأنه يجيب من يدعوه (الفاتحة: 5؛ البقرة: 186)."),
          bi("Islam sets prayers at fixed times, and it has rules for food and drink: pork and alcohol are not allowed (Quran 4:103; 5:3; 5:90).", "يحدّد الإسلام للصلاة أوقاتًا معلومة، وله أحكام في الطعام والشراب: فلحم الخنزير والخمر محرّمان (النساء: 103؛ المائدة: 3؛ المائدة: 90)."),
        ],
      },
      faq: [
        {
          id: "prayer",
          q: bi("Do Muslims pray like Christians?", "هل يصلّي المسلمون مثل المسيحيين؟"),
          a: bi(
            "Both pray to God and ask for His help. Muslim prayer, called salah, has fixed times in the day (4:103). It has a set form with bowing and prostration, which means placing the forehead on the ground (22:77). Before it, a Muslim washes in a simple way called wudu (5:6).",
            "كلاهما يدعو الله ويطلب عونه. وللصلاة في الإسلام أوقات محدّدة في اليوم (النساء: 103)، وهيئة معلومة فيها ركوع وسجود، والسجود وضع الجبهة على الأرض (الحج: 77). وقبلها يتطهّر المسلم بغسل يسير يُسمّى الوضوء (المائدة: 6).",
          ),
        },
        FAQ.fasting,
        FAQ.rules,
      ],
      sources: {
        belief: [bible("Matthew 22:37–39", "متى 22: 37–39"), bible("Matthew 6:9", "متى 6: 9"), bible("Matthew 28:19", "متى 28: 19"), bible("Luke 22:19–20", "لوقا 22: 19–20"), bible("Matthew 6:2–4", "متى 6: 2–4"), bible("Matthew 6:16–18", "متى 6: 16–18"), bible("Matthew 7:12", "متى 7: 12"), bible("John 14:13–14", "يوحنا 14: 13–14"), bible("1 Corinthians 15:3–4", "كورنثوس الأولى 15: 3–4")],
        islam: [HADITH_FIVE, HADITH_DIMAM, quran("2:177"), quran("5:6"), quran("1:5"), quran("4:36"), quran("20:14"), quran("9:60"), quran("2:183"), quran("2:185"), quran("2:187"), quran("3:97"), quran("16:90"), quran("2:186"), quran("4:103"), quran("5:3"), quran("5:90"), quran("22:77"), comparisonBook("120–122")],
      },
    },

    "christianity.afterlife": {
      overview: {
        belief: [bi(
          "Christians believe that death is not the end. People die once, and then comes judgement (Hebrews 9:27). The dead will rise (John 5:28–29), and whoever believes in the Son of God has eternal life (John 3:16).",
          "يؤمن المسيحيون بأن الموت ليس النهاية. فالناس يموتون مرة واحدة ثم تكون الدينونة، أي الحساب (العبرانيين 9: 27). وسيقوم الأموات (يوحنا 5: 28–29)، ومن يؤمن بابن الله تكون له الحياة الأبدية (يوحنا 3: 16).",
        )],
        islam: INTRO.hereafter,
      },
      beliefs: {
        belief: [
          bi("Jesus will come again to judge the living and the dead (Nicene Creed).", "سيأتي يسوع ثانية ليدين الأحياء والأموات (قانون الإيمان النيقاوي)."),
          bi("The body will rise again, and there is life everlasting (Apostles' Creed; John 5:28–29).", "قيامة الجسد والحياة الأبدية (قانون إيمان الرسل؛ يوحنا 5: 28–29)."),
          bi("Eternal life is given to those who believe in the Son of God (John 3:16; 11:25).", "الحياة الأبدية لمن يؤمن بابن الله (يوحنا 3: 16؛ 11: 25)."),
          bi("In the life to come God wipes away every tear. There is also eternal punishment (Revelation 21:4; Matthew 25:46).", "في الحياة الآتية يمسح الله كل دمعة، وهناك أيضًا عذاب أبدي (الرؤيا 21: 4؛ متى 25: 46)."),
        ],
        islam: ISLAM.hereafter,
      },
      common: [
        bi("Death is not the end: the dead will rise, and there is a judgement (Hebrews 9:27; John 5:28–29; Quran 3:185).", "الموت ليس النهاية: سيقوم الأموات، وهناك حساب (العبرانيين 9: 27؛ يوحنا 5: 28–29؛ آل عمران: 185)."),
        bi("What we do in this life matters before God (Matthew 25:46; Quran 99:7–8).", "ما نعمله في هذه الحياة له وزنه عند الله (متى 25: 46؛ الزلزلة: 7–8)."),
        bi("There is eternal joy near God, and there is real punishment (Revelation 21:4; Matthew 25:46; Quran 9:72; 3:185).", "هناك نعيم أبدي في جوار الله، وهناك عذاب حقيقي (الرؤيا 21: 4؛ متى 25: 46؛ التوبة: 72؛ آل عمران: 185)."),
        bi("Both wait for the return of Jesus before the end (Nicene Creed; Quran 43:61).", "كلاهما ينتظر عودة المسيح قبل النهاية (قانون الإيمان النيقاوي؛ الزخرف: 61)."),
      ],
      differences: {
        belief: [
          bi("Eternal life comes through Jesus Christ: he says no one comes to the Father except through him (John 14:6).", "الحياة الأبدية تكون بيسوع المسيح، فهو يقول إنه لا يأتي أحد إلى الآب إلا به (يوحنا 14: 6)."),
          bi("Jesus himself is the judge at the end (Nicene Creed).", "يسوع نفسه هو الديّان في النهاية (قانون الإيمان النيقاوي)."),
        ],
        islam: [
          bi("Islam teaches that God alone is Master of the Day of Judgement (Quran 1:4).", "يعلّم الإسلام أن الله وحده مالك يوم الدين (الفاتحة: 4)."),
          bi("Islam teaches that no one can carry the sins of another, and that Paradise is for those who believe and do good (Quran 35:18; 4:124).", "يعلّم الإسلام أنه لا أحد يحمل ذنوب غيره، وأن الجنة لمن آمن وعمل صالحًا (فاطر: 18؛ النساء: 124)."),
        ],
      },
      faq: [
        FAQ.heaven,
        FAQ.who,
        {
          id: "jesus-return",
          q: bi("What does Islam say about Jesus and the end of time?", "ماذا يقول الإسلام عن المسيح وآخر الزمان؟"),
          a: bi(
            "Islam teaches that God raised Jesus to Himself (4:158), and that he will return before the Last Day (43:61; M. As-Sayed Muhammad, p. 127). So Muslims and Christians share this hope, although they understand it differently.",
            "يعلّم الإسلام أن الله رفع عيسى عليه السلام إليه (النساء: 158)، وأنه سيعود قبل يوم القيامة (الزخرف: 61؛ محمد السيد محمد، ص 127). فهذا رجاء يشترك فيه المسلمون والمسيحيون، وإن اختلف فهمهم له.",
          ),
        },
      ],
      sources: {
        belief: [CREEDS, bible("Hebrews 9:27", "العبرانيين 9: 27"), bible("John 5:28–29", "يوحنا 5: 28–29"), bible("John 3:16", "يوحنا 3: 16"), bible("John 11:25", "يوحنا 11: 25"), bible("John 14:6", "يوحنا 14: 6"), bible("Revelation 21:4", "الرؤيا 21: 4"), bible("Matthew 25:46", "متى 25: 46")],
        islam: [quran("1:4"), quran("3:185"), quran("36:78–79"), quran("21:47"), quran("99:7–8"), quran("4:124"), quran("35:18"), quran("9:72"), quran("43:61"), quran("4:158"), quran("39:53"), comparisonBook("127")],
      },
    },

    "atheism.god": {
      overview: {
        belief: [bi(
          "Atheism is the lack of belief in gods. It is not a religion and it has no creed. It answers one question only: do you believe in gods? (American Atheists). In philosophy, the word often means the view that there is no God (Stanford Encyclopedia of Philosophy).",
          "الإلحاد هو عدم الإيمان بوجود آلهة. ليس دينًا وليس له عقيدة مقرّرة، وإنما هو جواب عن سؤال واحد: هل تؤمن بوجود آلهة؟ (منظمة الملحدين الأمريكيين). وفي الفلسفة يُراد به غالبًا القول بأنه لا إله (موسوعة ستانفورد للفلسفة).",
        )],
        islam: INTRO.creator,
      },
      beliefs: {
        belief: [
          bi("Atheists share one thing: they have no belief in gods. On other matters they differ a lot (American Atheists).", "يشترك الملحدون في أمر واحد هو عدم الإيمان بآلهة، ويختلفون كثيرًا فيما سوى ذلك (منظمة الملحدين الأمريكيين)."),
          bi("Atheism is about what a person believes. Agnosticism is about what a person knows (American Atheists).", "الإلحاد يتعلق بما يؤمن به الإنسان، واللاأدرية تتعلق بما يعلمه (منظمة الملحدين الأمريكيين)."),
          bi("Arguments often given: the suffering in the world, and the view that the existence of God is unlikely from the start (Stanford Encyclopedia of Philosophy).", "من الحجج الشائعة: وجود المعاناة في العالم، والقول بأن وجود الإله مستبعد من الأصل (موسوعة ستانفورد للفلسفة)."),
          bi("Many atheists trust the scientific method to explain the world, and do not accept the supernatural (Humanists UK).", "يثق كثير من الملحدين بالمنهج العلمي في تفسير العالم، ولا يقبلون ما وراء الطبيعة (جمعية الإنسانيين في بريطانيا)."),
        ],
        islam: ISLAM.creator,
      },
      common: [
        bi("Truth matters, and beliefs need good reasons. The Quran says not to follow what you have no knowledge of (Declaration of Modern Humanism; Quran 17:36).", "الحقيقة مهمة، والاعتقاد يحتاج إلى أسباب صحيحة. والقرآن ينهى عن اتّباع ما لا علم للإنسان به (إعلان الإنسانية الحديثة؛ الإسراء: 36)."),
        bi("The natural world is worth studying. The Quran tells people to look at what is in the heavens and the earth (Humanists UK; Quran 10:101).", "العالم الطبيعي جدير بالدراسة، والقرآن يأمر بالنظر فيما في السماوات والأرض (جمعية الإنسانيين في بريطانيا؛ يونس: 101)."),
        bi("People must be free to think and to choose. The Quran says there is no compulsion in religion (Declaration of Modern Humanism; Quran 2:256).", "للناس حرية التفكير والاختيار، والقرآن يقرّر أنه لا إكراه في الدين (إعلان الإنسانية الحديثة؛ البقرة: 256)."),
      ],
      differences: {
        belief: [
          bi("No god is believed in, and the supernatural is not accepted as an explanation (American Atheists; Humanists UK).", "لا إيمان بإله، ولا قبول لما وراء الطبيعة تفسيرًا (منظمة الملحدين الأمريكيين؛ جمعية الإنسانيين في بريطانيا)."),
          bi("For many, suffering is a strong reason to doubt a good and all-powerful God (Stanford Encyclopedia of Philosophy).", "يرى كثيرون أن المعاناة سبب قوي للشك في وجود إله خيّر قادر على كل شيء (موسوعة ستانفورد للفلسفة)."),
        ],
        islam: [
          bi("Islam teaches that nature itself needs an explanation: it did not come from nothing and did not create itself (Quran 52:35).", "يعلّم الإسلام أن الطبيعة نفسها تحتاج إلى تفسير: فهي لم تأتِ من لا شيء ولم تخلق نفسها (الطور: 35)."),
          bi("Islam teaches that this life is a test and not the whole picture. Full justice comes on the Day of Resurrection (Quran 67:2; 21:47).", "يعلّم الإسلام أن هذه الحياة اختبار وليست الصورة كاملة، وأن العدل التام يكون يوم القيامة (الملك: 2؛ الأنبياء: 47)."),
        ],
      },
      faq: [
        FAQ.whoMadeGod,
        FAQ.science,
        FAQ.suffering,
      ],
      sources: {
        belief: [AMERICAN_ATHEISTS, SEP, HUMANISTS_UK, DECLARATION],
        islam: [quran("52:35"), quran("2:164"), quran("57:3"), quran("2:256"), BOOK_ORIGIN, BOOK_UNCREATED, quran("3:190"), quran("30:30"), quran("17:36"), quran("10:101"), quran("67:2"), quran("21:47"), quran("29:20"), quran("39:9"), quran("51:56"), quran("2:286"), atheistDialogue("2–3")],
      },
    },

    "atheism.sources": {
      overview: {
        belief: [bi(
          "Atheism has no scripture and no prophets. Many atheists, such as humanists, hold that reliable knowledge comes from observation, reason and science, and that it can always be corrected (Declaration of Modern Humanism; Humanists UK).",
          "ليس في الإلحاد كتاب مقدس ولا أنبياء. ويرى كثير من الملحدين، كالإنسانيين، أن المعرفة الموثوقة تأتي من الملاحظة والعقل والعلم، وأنها قابلة للتصحيح دائمًا (إعلان الإنسانية الحديثة؛ جمعية الإنسانيين في بريطانيا).",
        )],
        islam: INTRO.knowing,
      },
      beliefs: {
        belief: [
          bi("Knowledge grows through observation, learning and rethinking. No text is fixed and final (Declaration of Modern Humanism).", "المعرفة تنمو بالملاحظة والتعلّم وإعادة النظر، ولا يوجد نص ثابت نهائي (إعلان الإنسانية الحديثة)."),
          bi("Science and free inquiry are the tools for solving the world's problems (Declaration of Modern Humanism).", "العلم والبحث الحر هما وسيلة حل مشكلات العالم (إعلان الإنسانية الحديثة)."),
          bi("The scientific method is trusted, and the supernatural is not accepted (Humanists UK).", "يُوثَق بالمنهج العلمي، ولا يُقبل ما وراء الطبيعة (جمعية الإنسانيين في بريطانيا)."),
        ],
        islam: ISLAM.knowing,
      },
      common: [
        bi("Do not hold a belief without knowledge (Declaration of Modern Humanism; Quran 17:36).", "لا يصح اعتقاد شيء بغير علم (إعلان الإنسانية الحديثة؛ الإسراء: 36)."),
        bi("Studying nature is good. The Quran tells people to travel and see how creation began (Humanists UK; Quran 29:20).", "دراسة الطبيعة أمر حسن، والقرآن يأمر بالسير في الأرض والنظر كيف بدأ الخلق (جمعية الإنسانيين في بريطانيا؛ العنكبوت: 20)."),
        bi("Learning never ends. The Quran teaches this prayer: my Lord, increase me in knowledge (Declaration of Modern Humanism; Quran 20:114).", "التعلّم لا ينتهي، والقرآن يعلّم هذا الدعاء: ربِّ زدني علمًا (إعلان الإنسانية الحديثة؛ طه: 114)."),
      ],
      differences: {
        belief: [
          bi("Knowledge comes from human observation and reasoning, not from the supernatural (Humanists UK).", "المعرفة تأتي من ملاحظة الإنسان وتفكيره، لا ممّا وراء الطبيعة (جمعية الإنسانيين في بريطانيا)."),
          bi("With no belief in gods, no book is taken as a message from God (American Atheists).", "ما دام لا إيمان بآلهة، فلا يُعدّ أي كتاب رسالة من عند الله (منظمة الملحدين الأمريكيين)."),
        ],
        islam: [
          bi("Islam teaches that revelation is a source of knowledge beside reason and the senses (Quran 4:165; 2:2–3).", "يعلّم الإسلام أن الوحي مصدر للمعرفة مع العقل والحواس (النساء: 165؛ البقرة: 2–3)."),
          bi("Islam teaches that God sent a messenger to every nation (Quran 16:36).", "يعلّم الإسلام أن الله بعث في كل أمة رسولًا (النحل: 36)."),
        ],
      },
      faq: [
        FAQ.blindFaith,
        FAQ.check,
        FAQ.reasonFirst,
      ],
      sources: {
        belief: [DECLARATION, HUMANISTS_UK, AMERICAN_ATHEISTS],
        islam: [quran("2:164"), quran("20:114"), quran("52:35"), quran("16:78"), quran("4:165"), quran("17:36"), quran("2:111"), quran("45:24"), quran("2:2–3"), quran("51:56"), quran("3:185"), quran("4:82"), quran("29:20"), quran("16:36"), quran("2:23"), atheistDialogue("2–3")],
      },
    },

    "atheism.life": {
      overview: {
        belief: [bi(
          "Many atheists see no purpose built into the universe. People give their own lives meaning by seeking happiness and helping others (Humanists UK). Humanists find purpose in personal growth, creativity, knowledge and human flourishing (Declaration of Modern Humanism).",
          "يرى كثير من الملحدين أنه لا غاية مقرّرة في الكون سلفًا، وأن الناس يمنحون حياتهم معنى بالسعي إلى السعادة ومساعدة الآخرين (جمعية الإنسانيين في بريطانيا). ويجد الإنسانيون الغاية في نموّ الشخص والإبداع والمعرفة وازدهار الإنسان (إعلان الإنسانية الحديثة).",
        )],
        islam: INTRO.purpose,
      },
      beliefs: {
        belief: [
          bi("Every person has worth and dignity, and the freedom to choose (Declaration of Modern Humanism).", "لكل إنسان قيمة وكرامة، وله حرية الاختيار (إعلان الإنسانية الحديثة)."),
          bi("Meaning is made by people, not given from outside (Humanists UK).", "المعنى يصنعه الناس ولا يُعطى من الخارج (جمعية الإنسانيين في بريطانيا)."),
          bi("Freedom goes with responsibility to society, to future generations and to other living beings (Declaration of Modern Humanism).", "الحرية تقترن بالمسؤولية تجاه المجتمع والأجيال القادمة وسائر الكائنات الحية (إعلان الإنسانية الحديثة)."),
          bi("This life is the only one we have (Humanists UK).", "هذه الحياة هي الوحيدة لنا (جمعية الإنسانيين في بريطانيا)."),
        ],
        islam: ISLAM.purpose,
      },
      common: [
        bi("Every human being has dignity (Declaration of Modern Humanism; Quran 17:70).", "لكل إنسان كرامة (إعلان الإنسانية الحديثة؛ الإسراء: 70)."),
        bi("A good life includes responsibility and care for other people (Declaration of Modern Humanism; Quran 16:90).", "الحياة الطيبة تشمل المسؤولية والإحسان إلى الناس (إعلان الإنسانية الحديثة؛ النحل: 90)."),
        bi("People are free to choose (Declaration of Modern Humanism; Quran 76:3).", "الإنسان حرّ في اختياره (إعلان الإنسانية الحديثة؛ الإنسان: 3)."),
      ],
      differences: {
        belief: [
          bi("There is no purpose given from outside. People give their own lives meaning (Humanists UK).", "لا غاية تُعطى من الخارج، والناس يمنحون حياتهم معناها (جمعية الإنسانيين في بريطانيا)."),
        ],
        islam: [
          bi("Islam teaches that the One who made us also told us why (Quran 51:56).", "يعلّم الإسلام أن الذي خلقنا أخبرنا لماذا خلقنا (الذاريات: 56)."),
          bi("Islam teaches that people choose freely, and that every deed will be seen (Quran 76:3; 99:7–8).", "يعلّم الإسلام أن الإنسان يختار بحرية، وأن كل عمل سيُرى (الإنسان: 3؛ الزلزلة: 7–8)."),
        ],
      },
      faq: [
        {
          id: "meaning",
          q: bi("Can life have meaning without God?", "هل للحياة معنى من دون الله؟"),
          a: bi(
            "Many atheists find meaning in seeking happiness and helping others (Humanists UK). Islam teaches that no good deed is lost (99:7–8). Islam adds a question: if everything ends at death, does the meaning end too? The Quran asks whether people thought they were created for nothing and would not return to God (23:115).",
            "يجد كثير من الملحدين المعنى في السعي إلى السعادة ومساعدة الآخرين (جمعية الإنسانيين في بريطانيا). والإسلام يعلّم أن أي خير لا يضيع (الزلزلة: 7–8). ويضيف الإسلام سؤالًا: إن كان كل شيء ينتهي بالموت، فهل ينتهي المعنى أيضًا؟ والقرآن يسأل: أظنّ الناس أنهم خُلقوا عبثًا وأنهم لا يرجعون إلى الله؟ (المؤمنون: 115).",
          ),
        },
        FAQ.worship,
        FAQ.human,
      ],
      sources: {
        belief: [HUMANISTS_UK, DECLARATION],
        islam: [quran("2:177"), quran("51:56"), quran("67:2"), quran("23:115"), quran("17:70"), quran("95:4"), quran("49:13"), quran("16:90"), quran("76:3"), quran("99:7–8"), quran("39:53"), atheistDialogue("10–11")],
      },
    },

    "atheism.practice": {
      overview: {
        belief: [bi(
          "Atheism is not a religion, so it has no worship and no single moral code (American Atheists). Many atheists base their ethics on reason, empathy and concern for people and other animals that can feel (Humanists UK).",
          "الإلحاد ليس دينًا، فليس فيه عبادة ولا نظام أخلاقي واحد (منظمة الملحدين الأمريكيين). ويبني كثير من الملحدين أخلاقهم على العقل والتعاطف والاهتمام بالناس وبسائر الحيوانات التي تحسّ (جمعية الإنسانيين في بريطانيا).",
        )],
        islam: INTRO.ethics,
      },
      beliefs: {
        belief: [
          bi("Morality comes from the fact that living beings can suffer and can flourish (Declaration of Modern Humanism).", "مصدر الأخلاق أن الكائنات الحية تتألم وتزدهر (إعلان الإنسانية الحديثة)."),
          bi("Ethical choices are made with reason, empathy and concern for others (Humanists UK).", "تُتخذ القرارات الأخلاقية بالعقل والتعاطف والاهتمام بالآخرين (جمعية الإنسانيين في بريطانيا)."),
          bi("Personal freedom goes together with responsibility to society (Declaration of Modern Humanism).", "الحرية الشخصية تقترن بالمسؤولية تجاه المجتمع (إعلان الإنسانية الحديثة)."),
        ],
        islam: ISLAM.ethics,
      },
      common: [
        bi("Doing good to other people is a duty (Declaration of Modern Humanism; Quran 16:90).", "الإحسان إلى الناس واجب (إعلان الإنسانية الحديثة؛ النحل: 90)."),
        bi("Helping people in need is part of a good life (Humanists UK; Quran 2:177).", "مساعدة المحتاجين من صميم الحياة الطيبة (جمعية الإنسانيين في بريطانيا؛ البقرة: 177)."),
        bi("Our actions affect others, so we answer for them (Declaration of Modern Humanism; Quran 99:7–8).", "أعمالنا تؤثّر في غيرنا، فنحن مسؤولون عنها (إعلان الإنسانية الحديثة؛ الزلزلة: 7–8)."),
      ],
      differences: {
        belief: [
          bi("Ethics rest on human reason and empathy, with no command from a god (Humanists UK; American Atheists).", "تقوم الأخلاق على عقل الإنسان وتعاطفه، دون أمر من إله (جمعية الإنسانيين في بريطانيا؛ منظمة الملحدين الأمريكيين)."),
        ],
        islam: [
          bi("Islam teaches that God both placed the sense of right and wrong in people and commanded what is just (Quran 91:7–8; 16:90).", "يعلّم الإسلام أن الله غرس في الإنسان الإحساس بالخير والشر، وأمره كذلك بالعدل (الشمس: 7–8؛ النحل: 90)."),
          bi("Islam teaches that every deed, even the smallest, will be seen by the one who did it (Quran 99:7–8).", "يعلّم الإسلام أن كل عمل مهما صغر سيراه صاحبه (الزلزلة: 7–8)."),
        ],
      },
      faq: [
        FAQ.goodWithoutGod,
        FAQ.rituals,
        FAQ.force,
      ],
      sources: {
        belief: [AMERICAN_ATHEISTS, HUMANISTS_UK, DECLARATION],
        islam: [HADITH_FIVE, quran("2:177"), quran("2:256"), quran("60:8"), quran("16:90"), quran("20:14"), quran("91:7–8"), quran("4:135"), quran("99:7–8"), quran("2:183"), quran("51:56")],
      },
    },

    "atheism.afterlife": {
      overview: {
        belief: [bi(
          "Atheism itself says nothing about death: it is only the lack of belief in gods (American Atheists). Many atheists, such as humanists, hold that there is no afterlife and that this is the only life we have (Humanists UK).",
          "الإلحاد نفسه لا يقول شيئًا عن الموت، فهو مجرد عدم الإيمان بآلهة (منظمة الملحدين الأمريكيين). ويرى كثير من الملحدين، كالإنسانيين، أنه لا حياة بعد الموت، وأن هذه الحياة هي الوحيدة لنا (جمعية الإنسانيين في بريطانيا).",
        )],
        islam: INTRO.death,
      },
      beliefs: {
        belief: [
          bi("There is no afterlife (Humanists UK).", "لا حياة بعد الموت (جمعية الإنسانيين في بريطانيا)."),
          bi("So meaning is found in this life, in seeking happiness and helping others (Humanists UK).", "ولذلك يُطلب المعنى في هذه الحياة، في السعي إلى السعادة ومساعدة الآخرين (جمعية الإنسانيين في بريطانيا)."),
          bi("People have duties to the generations that come after them (Declaration of Modern Humanism).", "على الناس واجبات تجاه الأجيال القادمة (إعلان الإنسانية الحديثة)."),
        ],
        islam: ISLAM.death,
      },
      common: [
        bi("Death comes to everyone, so the time we have is precious (Humanists UK; Quran 3:185).", "الموت يأتي على كل أحد، فالوقت الذي لنا ثمين (جمعية الإنسانيين في بريطانيا؛ آل عمران: 185)."),
        bi("How we live matters (Humanists UK; Quran 67:2).", "المهمّ كيف نعيش (جمعية الإنسانيين في بريطانيا؛ الملك: 2)."),
      ],
      differences: {
        belief: [
          bi("With no afterlife, there is no judgement, reward or punishment after death (Humanists UK).", "ما دام لا حياة بعد الموت، فلا حساب ولا ثواب ولا عقاب بعده (جمعية الإنسانيين في بريطانيا)."),
        ],
        islam: [
          bi("Islam teaches that after death God gives life again, and all return to Him (Quran 2:28).", "يعلّم الإسلام أن الله يحيي الناس بعد موتهم ثم إليه يُرجعون (البقرة: 28)."),
          bi("Islam teaches that those who do evil and those who believe and do good are not treated the same, in life or in death (Quran 45:21–22).", "يعلّم الإسلام أن من يعمل السيئات لا يستوي مع من آمن وعمل الصالحات، لا في الحياة ولا في الممات (الجاثية: 21–22)."),
        ],
      },
      faq: [
        FAQ.reason,
        FAQ.fear,
        {
          id: "time",
          q: bi("Does the Quran speak about people who deny life after death?", "هل يتحدث القرآن عمّن ينكرون الحياة بعد الموت؟"),
          a: bi(
            "Yes. It reports people who said that there is only this life, that we die and live, and that only time destroys us. The Quran answers that this is a guess and not knowledge (45:24).",
            "نعم. فهو ينقل قول من قالوا إنه لا حياة إلا هذه الدنيا، نموت ونحيا، وما يهلكنا إلا الدهر. ويردّ القرآن بأن هذا ظنّ لا علم (الجاثية: 24).",
          ),
        },
      ],
      sources: {
        belief: [AMERICAN_ATHEISTS, HUMANISTS_UK, DECLARATION],
        islam: [quran("3:185"), quran("21:47"), quran("36:78–79"), quran("99:7–8"), quran("9:72"), quran("67:2"), quran("2:28"), quran("45:21–22"), quran("19:66–67"), quran("32:17"), quran("39:53"), quran("45:24")],
      },
    },

    "judaism.god": {
      overview: {
        belief: [bi(
          "Jews believe in one God, who created heaven and earth (Genesis 1:1). The best-known statement of Jewish faith is the Shema, which declares that the Lord alone is God (Deuteronomy 6:4).",
          "يؤمن اليهود بإله واحد خلق السماء والأرض (التكوين 1: 1). وأشهر عبارات الإيمان اليهودي «الشماع»، وفيها الإقرار بأن الرب وحده هو الإله (التثنية 6: 4).",
        )],
        islam: [bi(
          "Islam starts from the same belief: God is one, with no partner and no equal (Quran 112:1–4). The Quran tells Muslims to say to Jews and Christians: our God and your God is one (Quran 29:46).",
          "ينطلق الإسلام من الإيمان نفسه: الله واحد لا شريك له ولا مثيل (الإخلاص: 1–4). ويأمر القرآن المسلمين أن يقولوا لليهود والمسيحيين: إلهنا وإلهكم واحد (العنكبوت: 46).",
        )],
      },
      beliefs: {
        belief: [
          bi("There is no god beside the one God, and only He is to be worshipped (Isaiah 45:5; Exodus 20:2–3).", "لا إله مع الله الواحد، وهو وحده المعبود (إشعياء 45: 5؛ الخروج 20: 2–3)."),
          bi("God is one, has no body, and existed before everything else (Maimonides, Thirteen Principles).", "الله واحد، ليس بجسم، وهو موجود قبل كل شيء (موسى بن ميمون، الأصول الثلاثة عشر)."),
          bi("God is near to all who call on Him sincerely (Psalms 145:18).", "الله قريب من كل من يدعوه بصدق (المزامير 145: 18)."),
        ],
        islam: ISLAM.oneGod,
      },
      common: [
        bi("God is one, the Creator, and He alone is worshipped (Deuteronomy 6:4; Quran 112:1–4).", "الله واحد، وهو الخالق، وهو وحده المعبود (التثنية 6: 4؛ الإخلاص: 1–4)."),
        bi("God has no body, and nothing is like Him (Maimonides, Thirteen Principles; Quran 42:11).", "الله ليس بجسم، وليس كمثله شيء (موسى بن ميمون، الأصول الثلاثة عشر؛ الشورى: 11)."),
        bi("God is near and answers those who call on Him (Psalms 145:18; Quran 2:186).", "الله قريب يجيب من يدعوه (المزامير 145: 18؛ البقرة: 186)."),
        bi("The Quran invites Jews and Christians to a word shared by all: to worship none but God (Quran 3:64).", "يدعو القرآن اليهود والمسيحيين إلى كلمة سواء بين الجميع: ألا نعبد إلا الله (آل عمران: 64)."),
      ],
      differences: {
        belief: [
          bi("God brought the people of Israel out of Egypt and gave them His commandments, which are not to be added to or reduced (Exodus 20:2–3; Deuteronomy 4:2).", "أخرج الله بني إسرائيل من مصر وأعطاهم وصاياه، ولا يُزاد عليها ولا يُنقص منها (الخروج 20: 2–3؛ التثنية 4: 2)."),
        ],
        islam: [
          bi("On the oneness of God the two faiths stand very close. Islam teaches that God sent guidance to every nation, and that His last message is for all people (Quran 16:36; 7:158).", "الديانتان متقاربتان جدًّا في توحيد الله. ويعلّم الإسلام أن الله بعث الهداية إلى كل أمة، وأن رسالته الأخيرة للناس جميعًا (النحل: 36؛ الأعراف: 158)."),
          bi("Islam teaches that the most honoured with God is the most God-conscious, from whatever people (Quran 49:13).", "يعلّم الإسلام أن أكرم الناس عند الله أتقاهم، من أي قوم كانوا (الحجرات: 13)."),
        ],
      },
      faq: [
        {
          id: "same-god",
          q: bi("Do Jews and Muslims worship the same God?", "هل يعبد اليهود والمسلمون الإله نفسه؟"),
          a: bi(
            "Both worship the one God who created the world and who spoke to Moses. The Quran tells Muslims to say to the People of the Book, meaning Jews and Christians: our God and your God is one (29:46). It also says God spoke to Moses directly (4:164).",
            "كلاهما يعبد الإله الواحد خالق العالم الذي كلّم موسى. ويأمر القرآن المسلمين أن يقولوا لأهل الكتاب، أي اليهود والمسيحيين: إلهنا وإلهكم واحد (العنكبوت: 46). ويذكر كذلك أن الله كلّم موسى تكليمًا (النساء: 164).",
          ),
        },
        {
          id: "moses",
          q: bi("What does the Quran say about Moses?", "ماذا يقول القرآن عن موسى؟"),
          a: bi(
            "It honours him. It calls him chosen, a messenger and a prophet (19:51), and says God spoke to him directly (4:164). Muslims believe in what was given to Moses and to all the prophets (2:136). The Quran also reminds the Children of Israel of God's favour to them (2:47).",
            "يكرّمه القرآن. فهو يصفه بأنه مُخلَص مختار، وأنه رسول ونبي (مريم: 51)، ويذكر أن الله كلّمه تكليمًا (النساء: 164). ويؤمن المسلمون بما أوتي موسى وسائر النبيين (البقرة: 136). ويذكّر القرآن بني إسرائيل بنعمة الله عليهم (البقرة: 47).",
          ),
        },
        FAQ.allah,
      ],
      sources: {
        belief: [tanakh("Genesis 1:1", "التكوين 1: 1"), tanakh("Deuteronomy 6:4", "التثنية 6: 4"), tanakh("Isaiah 45:5", "إشعياء 45: 5"), tanakh("Exodus 20:2–3", "الخروج 20: 2–3"), tanakh("Psalms 145:18", "المزامير 145: 18"), tanakh("Deuteronomy 4:2", "التثنية 4: 2"), MJL_PRINCIPLES, DAWA_JUDAISM],
        islam: refs(...ISLAM_REFS.oneGod, quran("29:46"), quran("3:64"), quran("16:36"), quran("7:158"), quran("49:13"), quran("4:164"), quran("19:51"), quran("2:136"), quran("2:47"), TERM_ALLAH),
      },
    },

    "judaism.sources": {
      overview: {
        belief: [bi(
          "The Jewish scripture is the Hebrew Bible, called the Tanakh. It has three parts: the Torah (the five books of Moses), the Prophets and the Writings (My Jewish Learning; Dorar Encyclopedia). Jews also study the Talmud. It gathers the Mishnah and its commentary, and it is the basis of Jewish law (My Jewish Learning; Dorar Encyclopedia).",
          "الكتاب المقدس عند اليهود هو الكتاب المقدس العبري، ويُسمّى التناخ. وهو ثلاثة أقسام: التوراة (أسفار موسى الخمسة)، والأنبياء، والكتابات (موقع My Jewish Learning؛ موسوعة الدرر السنية). ويدرس اليهود كذلك التلمود، وهو يجمع المشناه وشرحها، وعليه يقوم التشريع اليهودي (موقع My Jewish Learning؛ موسوعة الدرر السنية).",
        )],
        islam: [bi(
          "The holy book of Islam is the Quran. Muslims believe it is the word of God, brought down to the Prophet Muhammad by the angel Gabriel (Quran 2:97). Muslims also believe that God gave the Torah to Moses, with guidance and light in it (Quran 5:44).",
          "كتاب الإسلام هو القرآن. يؤمن المسلمون بأنه كلام الله، نزل به جبريل على النبي محمد ﷺ (البقرة: 97). ويؤمن المسلمون كذلك بأن الله أنزل التوراة على موسى، فيها هدى ونور (المائدة: 44).",
        )],
      },
      beliefs: {
        belief: [
          bi("The Torah is from heaven, and Moses is the greatest of the prophets (Maimonides, Thirteen Principles; Deuteronomy 34:10).", "التوراة من السماء، وموسى أعظم الأنبياء (موسى بن ميمون، الأصول الثلاثة عشر؛ التثنية 34: 10)."),
          bi("The Torah will never be replaced. Nothing may be added to it or taken from it (Maimonides, Thirteen Principles; Deuteronomy 4:2).", "التوراة لا تُنسخ أبدًا، ولا يُزاد عليها ولا يُنقص منها (موسى بن ميمون، الأصول الثلاثة عشر؛ التثنية 4: 2)."),
          bi("Moses received the Torah at Sinai and handed it on, from teacher to teacher (Pirkei Avot 1:1). The teachings of the rabbis were later written in the Mishnah, around the year 200, and the Talmud explains it (My Jewish Learning).", "تلقّى موسى التوراة في سيناء ثم سلّمها، معلّمًا بعد معلّم (فصول الآباء 1: 1). ثم دُوّنت تعاليم الحاخامات في المشناه نحو سنة 200 للميلاد، والتلمود شرحٌ لها (موقع My Jewish Learning)."),
        ],
        islam: ISLAM.book,
      },
      common: [
        bi("God speaks to people through prophets (Maimonides, Thirteen Principles; Quran 4:163).", "الله يخاطب الناس عن طريق الأنبياء (موسى بن ميمون، الأصول الثلاثة عشر؛ النساء: 163)."),
        bi("Moses is a great prophet, and God spoke to him directly (Deuteronomy 34:10; Quran 4:164).", "موسى نبي عظيم، وقد كلّمه الله مباشرة (التثنية 34: 10؛ النساء: 164)."),
        bi("God gave the Torah as guidance (Pirkei Avot 1:1; Quran 5:44).", "أنزل الله التوراة هدى (فصول الآباء 1: 1؛ المائدة: 44)."),
      ],
      differences: {
        belief: [
          bi("The Torah given to Moses is final, so Judaism does not accept a later scripture such as the Gospel or the Quran (Maimonides, Thirteen Principles).", "التوراة التي أوتيها موسى نهائية، فلا تقبل اليهودية كتابًا بعدها كالإنجيل أو القرآن (موسى بن ميمون، الأصول الثلاثة عشر)."),
        ],
        islam: [
          bi("Islam teaches that God sent prophets after Moses too, among them Jesus, and that Muhammad is the last of the prophets (Quran 5:46; 33:40).", "يعلّم الإسلام أن الله أرسل أنبياء بعد موسى كذلك، ومنهم عيسى، وأن محمدًا ﷺ خاتم النبيين (المائدة: 46؛ الأحزاب: 40)."),
          bi("Islam teaches that part of the earlier message was forgotten or changed over time, and that the Quran confirms the earlier books and is the measure over them (Quran 5:13–14; 5:48).", "يعلّم الإسلام أن جزءًا من الرسالة السابقة نُسي أو غُيّر مع الزمن، وأن القرآن مصدِّق لما قبله من الكتب ومهيمن عليها، أي شاهد وحاكم عليها (المائدة: 13–14؛ المائدة: 48)."),
        ],
      },
      faq: [
        {
          id: "torah",
          q: bi("Do Muslims believe in the Torah?", "هل يؤمن المسلمون بالتوراة؟"),
          a: bi(
            "Yes. The Quran says God sent down the Torah, with guidance and light in it (5:44). Islam teaches that part of the message was forgotten or changed over time (5:13–14), so Muslims take the Quran as the final measure (5:48).",
            "نعم. فالقرآن يذكر أن الله أنزل التوراة فيها هدى ونور (المائدة: 44). ويعلّم الإسلام أن جزءًا من الرسالة نُسي أو غُيّر مع الزمن (المائدة: 13–14)، ولذلك يجعل المسلمون القرآن هو المرجع الأخير (المائدة: 48).",
          ),
        },
        {
          id: "later-prophet",
          q: bi("Why follow a prophet who came after Moses?", "لماذا يُتَّبع نبي جاء بعد موسى؟"),
          a: bi(
            "Islam teaches that God gave one faith to Noah, Abraham, Moses and Jesus (42:13), and sent prophets one after another. The Quran says Muhammad is the last of them (33:40), sent to all people (7:158). A Muslim still believes in Moses and in what was given to him (2:136).",
            "يعلّم الإسلام أن الله شرع دينًا واحدًا لنوح وإبراهيم وموسى وعيسى (الشورى: 13)، وأرسل الأنبياء واحدًا بعد آخر. ويذكر القرآن أن محمدًا ﷺ خاتمهم (الأحزاب: 40)، وأنه أُرسل إلى الناس جميعًا (الأعراف: 158). والمسلم يبقى مؤمنًا بموسى وبما أوتي (البقرة: 136).",
          ),
        },
        FAQ.preserved,
      ],
      sources: {
        belief: [MJL_TANAKH, MJL_TALMUD, MJL_PRINCIPLES, tanakh("Deuteronomy 34:10", "التثنية 34: 10"), tanakh("Deuteronomy 4:2", "التثنية 4: 2"), AVOT_1_1, DAWA_JUDAISM, DORAR_TORAH, DORAR_TALMUD],
        islam: refs(...ISLAM_REFS.book, quran("4:164"), quran("33:40"), quran("5:13–14"), quran("5:48"), quran("42:13"), quran("7:158"), quran("2:136")),
      },
    },

    "judaism.life": {
      overview: {
        belief: [bi(
          "Jews believe that God created human beings in His image (Genesis 1:27). The purpose of life is to revere God and keep His commandments, called mitzvot (Ecclesiastes 12:13).",
          "يؤمن اليهود بأن الله خلق الإنسان على صورته (التكوين 1: 27). وغاية الحياة أن يتّقي الإنسان الله ويحفظ وصاياه، وتُسمّى «المتسفوت» (الجامعة 12: 13).",
        )],
        islam: INTRO.human,
      },
      beliefs: {
        belief: [
          bi("Every person is created in the image of God (Genesis 1:27).", "كل إنسان مخلوق على صورة الله (التكوين 1: 27)."),
          bi("People are free to choose, and are asked to choose life and blessing (Deuteronomy 30:19).", "الإنسان حرّ في اختياره، وهو مدعوّ إلى أن يختار الحياة والبركة (التثنية 30: 19)."),
          bi("Each person answers for their own deeds. A child does not carry a parent's guilt (Ezekiel 18:20).", "كل إنسان مسؤول عن عمله، والابن لا يحمل إثم أبيه (حزقيال 18: 20)."),
          bi("God asks people to do justice, to love goodness and to walk humbly with Him (Micah 6:8).", "يطلب الله من الإنسان أن يعمل بالعدل، ويحب الإحسان، ويسير بتواضع مع إلهه (ميخا 6: 8)."),
        ],
        islam: ISLAM.human,
      },
      common: [
        bi("Human life has a purpose given by God: to serve Him and keep His commands (Ecclesiastes 12:13; Quran 51:56).", "لحياة الإنسان غاية من عند الله: أن يعبده ويحفظ أوامره (الجامعة 12: 13؛ الذاريات: 56)."),
        bi("No one carries the sin of another (Ezekiel 18:20; Quran 6:164).", "لا يحمل أحد ذنب غيره (حزقيال 18: 20؛ الأنعام: 164)."),
        bi("People are free to choose, and they answer for their choice (Deuteronomy 30:19; Quran 76:3).", "الإنسان حرّ في اختياره ومسؤول عنه (التثنية 30: 19؛ الإنسان: 3)."),
        bi("Every life is precious. The Quran recalls a rule given to the Children of Israel: whoever saves one life, it is as if he saved all people (Quran 5:32).", "كل نفس غالية. ويذكر القرآن حكمًا كُتب على بني إسرائيل: من أحيا نفسًا فكأنما أحيا الناس جميعًا (المائدة: 32)."),
      ],
      differences: {
        belief: [
          bi("God gave Moses 613 commandments in the Torah, and keeping them is the Jewish way of life (Talmud, Makkot 23b).", "أعطى الله موسى 613 وصية في التوراة، وحفظها هو طريق الحياة اليهودية (التلمود، مكوت 23ب)."),
        ],
        islam: [
          bi("Islam teaches that its message is for all people, not for one nation (Quran 7:158).", "يعلّم الإسلام أن رسالته للناس جميعًا، لا لأمة بعينها (الأعراف: 158)."),
          bi("Islam teaches that people are honoured by their God-consciousness, not by their descent (Quran 49:13).", "يعلّم الإسلام أن كرامة الناس بتقواهم لا بأنسابهم (الحجرات: 13)."),
        ],
      },
      faq: [
        {
          id: "favour",
          q: bi("Does Islam accept that God favoured the Children of Israel?", "هل يقرّ الإسلام بأن الله فضّل بني إسرائيل؟"),
          a: bi(
            "The Quran reminds the Children of Israel of God's favour to them, and says prophets judged among them by the Torah (2:47; 5:44). Islam teaches that with God the most honoured person is the most God-conscious, from any people (49:13).",
            "يذكّر القرآن بني إسرائيل بنعمة الله عليهم، ويذكر أن النبيين كانوا يحكمون فيهم بالتوراة (البقرة: 47؛ المائدة: 44). ويعلّم الإسلام أن أكرم الناس عند الله أتقاهم، من أي قوم كانوا (الحجرات: 13).",
          ),
        },
        FAQ.saved,
        FAQ.purpose,
      ],
      sources: {
        belief: [tanakh("Genesis 1:27", "التكوين 1: 27"), tanakh("Ecclesiastes 12:13", "الجامعة 12: 13"), tanakh("Deuteronomy 30:19", "التثنية 30: 19"), tanakh("Ezekiel 18:20", "حزقيال 18: 20"), tanakh("Micah 6:8", "ميخا 6: 8"), MAKKOT_23B],
        islam: refs(...ISLAM_REFS.human, quran("76:3"), quran("5:32"), quran("7:158"), quran("49:13"), quran("2:47"), quran("5:44"), quran("4:124"), quran("4:110"), quran("23:115")),
      },
    },

    "judaism.practice": {
      overview: {
        belief: [bi(
          "Jewish life is shaped by the commandments of the Torah. They cover prayer, the Sabbath (a weekly day of rest), food, fasting and how to treat other people (Exodus 20:8–10; Leviticus 19:18; Dorar Encyclopedia).",
          "تنتظم الحياة اليهودية بوصايا التوراة، وهي تشمل الصلاة، والسبت (يوم راحة أسبوعي)، والطعام، والصيام، ومعاملة الناس (الخروج 20: 8–10؛ اللاويين 19: 18؛ موسوعة الدرر السنية).",
        )],
        islam: INTRO.worship,
      },
      beliefs: {
        belief: [
          bi("Prayer: Jews traditionally pray three times a day, facing Jerusalem (Dorar Encyclopedia).", "الصلاة: يصلّي اليهود في المأثور عندهم ثلاث مرات في اليوم، متوجّهين إلى بيت المقدس (موسوعة الدرر السنية)."),
          bi("The Sabbath: the seventh day is kept holy, and no work is done on it (Exodus 20:8–10).", "السبت: اليوم السابع مقدّس، ولا يُعمل فيه عمل (الخروج 20: 8–10)."),
          bi("Food laws: some animals may not be eaten, for example the pig (Leviticus 11:7). Meat and milk are not eaten together (Dorar Encyclopedia).", "أحكام الطعام: بعض الحيوانات لا يؤكل، كالخنزير (اللاويين 11: 7). ولا يُجمع بين اللحم واللبن في طعام واحد (موسوعة الدرر السنية)."),
          bi("Fasting: the main fast is the Day of Atonement, Yom Kippur (Leviticus 23:27; Dorar Encyclopedia).", "الصيام: أهم صيام هو صوم يوم الغفران، يوم كيبور (اللاويين 23: 27؛ موسوعة الدرر السنية)."),
          bi("Kindness: love your neighbour as yourself, and open your hand to the poor (Leviticus 19:18; Deuteronomy 15:11).", "الإحسان: أحبّ قريبك كنفسك، وافتح يدك للفقير (اللاويين 19: 18؛ التثنية 15: 11)."),
        ],
        islam: ISLAM.worship,
      },
      common: [
        bi("Daily prayer to the one God (Dorar Encyclopedia; Quran 20:14).", "الصلاة اليومية للإله الواحد (موسوعة الدرر السنية؛ طه: 14)."),
        bi("Fasting. The Quran says fasting was also asked of earlier communities (Leviticus 23:27; Quran 2:183).", "الصيام. وقد ذكر القرآن أن الصيام كُتب على الأمم السابقة أيضًا (اللاويين 23: 27؛ البقرة: 183)."),
        bi("Giving to the poor is a duty (Deuteronomy 15:11; Quran 9:60).", "إعطاء الفقراء واجب (التثنية 15: 11؛ التوبة: 60)."),
        bi("Both have food laws, and neither eats pork (Leviticus 11:7; Quran 5:3). The Quran says the food of the People of the Book is lawful for Muslims (Quran 5:5).", "لكلٍّ منهما أحكام في الطعام، وكلاهما لا يأكل لحم الخنزير (اللاويين 11: 7؛ المائدة: 3). ويذكر القرآن أن طعام أهل الكتاب حِلٌّ للمسلمين (المائدة: 5)."),
      ],
      differences: {
        belief: [
          bi("The Sabbath is a full day of rest, on which all work stops (Exodus 20:8–10).", "السبت يوم راحة كامل يتوقف فيه كل عمل (الخروج 20: 8–10)."),
          bi("The food laws are wider: for example, meat and milk are kept apart (Dorar Encyclopedia).", "أحكام الطعام أوسع: فاللحم واللبن مثلًا لا يُجمع بينهما (موسوعة الدرر السنية)."),
        ],
        islam: [
          bi("Islam has a weekly gathering for prayer on Friday. Trade is left for the prayer, and people return to their work after it (Quran 62:9–10).", "في الإسلام اجتماع أسبوعي للصلاة يوم الجمعة، يُترك البيع لأجلها، ثم ينتشر الناس إلى أعمالهم بعدها (الجمعة: 9–10)."),
          bi("Islam teaches that the Prophet Muhammad was sent to make lawful what is good and to lift earlier burdens (Quran 7:157).", "يعلّم الإسلام أن النبي محمدًا ﷺ بُعث ليُحِلّ الطيبات ويضع عن الناس ما كان عليهم من الأثقال (الأعراف: 157)."),
        ],
      },
      faq: [
        {
          id: "kosher",
          q: bi("Can Muslims eat kosher food?", "هل يأكل المسلم الطعام المُعدّ على الطريقة اليهودية (الكوشر)؟"),
          a: bi(
            "The Quran says the food of those who were given the Scripture is lawful for Muslims (5:5). Islamic rules still apply: for example, wine is not allowed (5:90). For a specific case, ask a qualified scholar.",
            "يذكر القرآن أن طعام الذين أوتوا الكتاب حِلٌّ للمسلمين (المائدة: 5). وتبقى أحكام الإسلام قائمة: فالخمر مثلًا لا تحلّ (المائدة: 90). وفي الحالات الخاصة يُسأل أهل العلم.",
          ),
        },
        FAQ.fasting,
        FAQ.rules,
      ],
      sources: {
        belief: [tanakh("Exodus 20:8–10", "الخروج 20: 8–10"), tanakh("Leviticus 19:18", "اللاويين 19: 18"), tanakh("Leviticus 11:7", "اللاويين 11: 7"), tanakh("Leviticus 23:27", "اللاويين 23: 27"), tanakh("Deuteronomy 15:11", "التثنية 15: 11"), DAWA_JUDAISM, DORAR_JEWISH_PRAYER, DORAR_JEWISH_FASTING, DORAR_JEWISH_FOOD],
        islam: refs(...ISLAM_REFS.worship, quran("5:3"), quran("5:5"), quran("62:9–10"), quran("7:157"), quran("5:90"), quran("2:187"), quran("2:177")),
      },
    },

    "judaism.afterlife": {
      overview: {
        belief: [bi(
          "Jewish tradition speaks of a World to Come and of the dead rising again (Mishnah Sanhedrin 10:1; Daniel 12:2). The Hebrew Bible says little about life after death, and Jewish teachers have described it in different ways (My Jewish Learning).",
          "يتحدث التراث اليهودي عن «العالم الآتي» وعن قيامة الأموات (مشناه سنهدرين 10: 1؛ دانيال 12: 2). والكتاب المقدس العبري قليل الكلام عن الحياة بعد الموت، وقد وصفها علماء اليهود بصور مختلفة (موقع My Jewish Learning).",
        )],
        islam: INTRO.hereafter,
      },
      beliefs: {
        belief: [
          bi("The dead will rise: many who sleep in the dust will awake (Daniel 12:2; Maimonides, Thirteen Principles).", "سيقوم الأموات: كثيرون من الراقدين في التراب يستيقظون (دانيال 12: 2؛ موسى بن ميمون، الأصول الثلاثة عشر)."),
          bi("God rewards those who keep His commands and punishes those who break them (Maimonides, Thirteen Principles).", "الله يثيب من يحفظ أوامره ويعاقب من يخالفها (موسى بن ميمون، الأصول الثلاثة عشر)."),
          bi("This world is like an entrance hall before the World to Come, so a person prepares here (Pirkei Avot 4:16).", "هذا العالم كالدهليز قبل العالم الآتي، ففيه يستعدّ الإنسان (فصول الآباء 4: 16)."),
          bi("A Messiah will come, and with him an age of peace (Maimonides, Thirteen Principles; Isaiah 2:4).", "سيأتي مسيح منتظر، ومعه زمن السلام (موسى بن ميمون، الأصول الثلاثة عشر؛ إشعياء 2: 4)."),
        ],
        islam: ISLAM.hereafter,
      },
      common: [
        bi("Death is not the end: the dead will be raised (Daniel 12:2; Quran 36:78–79).", "الموت ليس النهاية: سيُبعث الأموات (دانيال 12: 2؛ يس: 78–79)."),
        bi("God judges with justice, and He rewards and punishes (Maimonides, Thirteen Principles; Quran 21:47).", "الله يحكم بالعدل، ويثيب ويعاقب (موسى بن ميمون، الأصول الثلاثة عشر؛ الأنبياء: 47)."),
        bi("This life is the time to prepare (Pirkei Avot 4:16; Quran 67:2).", "هذه الحياة وقت الاستعداد (فصول الآباء 4: 16؛ الملك: 2)."),
      ],
      differences: {
        belief: [
          bi("The Mishnah teaches that all Israel have a share in the World to Come, with some exceptions (Mishnah Sanhedrin 10:1).", "تعلّم المشناه أن لكل إسرائيل نصيبًا في العالم الآتي، مع استثناءات (مشناه سنهدرين 10: 1)."),
          bi("The Messiah is still awaited (Maimonides, Thirteen Principles).", "المسيح المنتظر لم يأتِ بعد (موسى بن ميمون، الأصول الثلاثة عشر)."),
        ],
        islam: [
          bi("Islam teaches that Paradise is promised to whoever believes and does good, man or woman, from any people (Quran 4:124).", "يعلّم الإسلام أن الجنة وعد الله لكل من آمن وعمل صالحًا، رجلًا كان أو امرأة، من أي قوم كان (النساء: 124)."),
          bi("Islam teaches that the Messiah has already come: he is Jesus, son of Mary, and he will return before the Last Day (Quran 3:45; 43:61).", "يعلّم الإسلام أن المسيح قد جاء، وهو عيسى ابن مريم، وأنه سيعود قبل يوم القيامة (آل عمران: 45؛ الزخرف: 61)."),
        ],
      },
      faq: [
        {
          id: "messiah",
          q: bi("Who is the Messiah in Islam?", "من هو المسيح في الإسلام؟"),
          a: bi(
            "The Quran gives this title to Jesus, son of Mary (3:45). Islam teaches that he was a human messenger of God (4:171), that God raised him to Himself (4:158), and that he will return before the Last Day (43:61). Judaism does not accept Jesus as the Messiah, and still waits for the Messiah to come (My Jewish Learning).",
            "يطلق القرآن هذا اللقب على عيسى ابن مريم (آل عمران: 45). ويعلّم الإسلام أنه بشر ورسول من الله (النساء: 171)، وأن الله رفعه إليه (النساء: 158)، وأنه سيعود قبل يوم القيامة (الزخرف: 61). واليهودية لا تقبل أن يسوع هو المسيح، وما زالت تنتظر مجيء المسيح (موقع My Jewish Learning).",
          ),
        },
        FAQ.heaven,
        FAQ.who,
      ],
      sources: {
        belief: [tanakh("Daniel 12:2", "دانيال 12: 2"), tanakh("Isaiah 2:4", "إشعياء 2: 4"), SANHEDRIN_10_1, AVOT_4_16, MJL_PRINCIPLES, MJL_AFTERLIFE, MJL_JESUS],
        islam: refs(...ISLAM_REFS.hereafter, quran("67:2"), quran("3:45"), quran("43:61"), quran("4:171"), quran("4:158"), quran("9:72"), quran("39:53"), quran("1:4")),
      },
    },

    "hinduism.god": {
      overview: {
        belief: [bi(
          "Hinduism is a family of traditions, with no single founder and no single set of teachings (BBC). Most Hindus believe in one Supreme God, whose qualities and forms are shown by many deities (BBC). Many also speak of Brahman, the power that upholds everything (BBC).",
          "الهندوسية مجموعة من التقاليد الدينية، ليس لها مؤسس واحد ولا تعاليم واحدة متفق عليها (بي بي سي). ويؤمن أكثر الهندوس بإله أعلى واحد، تمثّل الآلهة الكثيرة صفاته وصوره (بي بي سي). ويتحدث كثير منهم عن «براهمان»، وهو القوة التي يقوم بها كل شيء (بي بي سي).",
        )],
        islam: [bi(
          "Islam teaches that God is one in every way. He has no partner and no equal, and nothing is like Him (Quran 112:1–4; 42:11). This belief is called tawhid, which means the oneness of God.",
          "يعلّم الإسلام أن الله واحد من كل وجه، لا شريك له ولا مثيل، وليس كمثله شيء (الإخلاص: 1–4؛ الشورى: 11). ويُسمّى هذا الاعتقاد التوحيد، أي إفراد الله بالألوهية.",
        )],
      },
      beliefs: {
        belief: [
          bi("God can be understood as a person who loves His creatures, or as a reality beyond words (BBC).", "قد يُفهم الإله على أنه ذات تحب خلقها، أو على أنه حقيقة فوق الوصف (بي بي سي)."),
          bi("God creates, sustains and dissolves the universe. Many Hindus name three forms for this: Brahma, Vishnu and Shiva (BBC; Dorar Encyclopedia).", "الإله يخلق الكون ويحفظه ثم يفنيه. ويذكر كثير من الهندوس لذلك ثلاث صور: براهما وفيشنو وشيفا (بي بي سي؛ موسوعة الدرر السنية)."),
          bi("God comes down to earth in a form called an avatar, such as Krishna, when goodness declines (Bhagavad Gita 4.7; 4.8).", "ينزل الإله إلى الأرض في صورة تُسمّى «أفاتار»، مثل كريشنا، كلما ضعف الخير (البهاغافاد غيتا 4.7؛ 4.8)."),
          bi("Worship given to other deities is, in the end, worship of the one Lord (Bhagavad Gita 9.23).", "عبادة الآلهة الأخرى هي في حقيقتها عبادة للرب الواحد (البهاغافاد غيتا 9.23)."),
        ],
        islam: ISLAM.oneGod,
      },
      common: [
        bi("There is one highest reality, the source of all that exists (Bhagavad Gita 10.8; Quran 57:3).", "هناك حقيقة عليا واحدة هي مصدر كل موجود (البهاغافاد غيتا 10.8؛ الحديد: 3)."),
        bi("God sustains the world (BBC; Quran 2:255).", "الإله يحفظ العالم (بي بي سي؛ البقرة: 255)."),
        bi("People can turn to God with devotion (BBC; Quran 2:186).", "للإنسان أن يتوجّه إلى الإله بإخلاص (بي بي سي؛ البقرة: 186)."),
      ],
      differences: {
        belief: [
          bi("The one Divine shows itself in many forms, so Hindus worship through many deities and images, called murtis (Hindu American Foundation; BBC).", "الإله الواحد يتجلّى في صور كثيرة، فيعبد الهندوس عن طريق آلهة وتماثيل كثيرة تُسمّى «المورتي» (المؤسسة الهندوسية الأمريكية؛ بي بي سي)."),
          bi("Many Hindus hold that the soul and God are in the end one. Others hold that they stay distinct (BBC).", "يرى كثير من الهندوس أن الروح والإله شيء واحد في النهاية، ويرى آخرون أنهما متمايزان (بي بي سي)."),
        ],
        islam: [
          bi("Islam teaches that God is not shown in any image and does not take a human or other form: nothing is like Him, and eyes do not reach Him (Quran 42:11; 6:103).", "يعلّم الإسلام أن الله لا تمثّله صورة، ولا يتّخذ هيئة بشر ولا غيره: فليس كمثله شيء، ولا تدركه الأبصار (الشورى: 11؛ الأنعام: 103)."),
          bi("Islam teaches that the Creator and His creation are distinct, and that worship goes to God alone, with no partner and no go-between (Quran 1:5; 39:3).", "يعلّم الإسلام أن الخالق غير المخلوق، وأن العبادة لله وحده بلا شريك ولا واسطة (الفاتحة: 5؛ الزمر: 3)."),
        ],
      },
      faq: [
        {
          id: "one-or-many",
          q: bi("Is the Hindu belief close to the Muslim belief in one God?", "هل يقترب الاعتقاد الهندوسي من إيمان المسلمين بالإله الواحد؟"),
          a: bi(
            "There is a shared point: many Hindus say that behind all forms there is one Supreme God (BBC). Islam goes further. It teaches that God has no forms, partners or images, and that worship is for Him alone (112:1–4; 42:11).",
            "هناك نقطة مشتركة: فكثير من الهندوس يقولون إن وراء كل الصور إلهًا أعلى واحدًا (بي بي سي). والإسلام يمضي أبعد من ذلك، فيعلّم أن الله لا صور له ولا شركاء ولا تماثيل، وأن العبادة له وحده (الإخلاص: 1–4؛ الشورى: 11).",
          ),
        },
        {
          id: "images",
          q: bi("Why does Islam not use images in worship?", "لماذا لا يستعمل الإسلام الصور في العبادة؟"),
          a: bi(
            "Islam teaches that nothing is like God and that sight cannot reach Him (42:11; 6:103). So no image can show Him. A Muslim prays to God directly, and the Quran says He is near and answers (2:186). The Quran also tells Muslims not to insult what others worship (6:108).",
            "يعلّم الإسلام أن الله ليس كمثله شيء، وأن الأبصار لا تدركه (الشورى: 11؛ الأنعام: 103)، فلا صورة تمثّله. والمسلم يدعو الله مباشرة، والقرآن يذكر أنه قريب يجيب (البقرة: 186). وينهى القرآن المسلمين كذلك عن سبّ ما يعبده غيرهم (الأنعام: 108).",
          ),
        },
        {
          id: "why-one",
          q: bi("Why does Islam insist on only one God?", "لماذا يصرّ الإسلام على إله واحد فقط؟"),
          a: bi(
            "The Quran gives an argument from order: if there were other gods beside God in the heavens and the earth, both would fall into ruin (21:22). It also says every messenger brought the same message: there is no god but God, so worship Him (21:25).",
            "يذكر القرآن دليلًا من نظام الكون: لو كان في السماوات والأرض آلهة غير الله لفسدتا (الأنبياء: 22). ويذكر أن كل رسول جاء بالرسالة نفسها: لا إله إلا الله فاعبدوه (الأنبياء: 25).",
          ),
        },
        FAQ.allah,
      ],
      sources: {
        belief: [BBC_HINDUISM, BBC_HINDU_CONCEPTS, BBC_HINDU_WORSHIP, HAF, gita("4.7"), gita("4.8"), gita("9.23"), gita("10.8"), DAWA_HINDUISM, DORAR_HINDU_GODS],
        islam: refs(...ISLAM_REFS.oneGod, quran("57:3"), quran("6:103"), quran("39:3"), quran("6:108"), quran("21:22"), quran("21:25"), TERM_ALLAH),
      },
    },

    "hinduism.sources": {
      overview: {
        belief: [bi(
          "The oldest Hindu scriptures are the four Vedas. Hindus call them shruti, “what was heard”, and hold them to be eternal truths (Hindu American Foundation; BBC). Other texts remind people of these truths. The best known is the Bhagavad Gita, a primary scripture for Hindus (Hindu American Foundation).",
          "أقدم الكتب المقدسة الهندوسية هي الفيدات الأربع. يسمّيها الهندوس «شروتي»، أي «ما سُمع»، ويرونها حقائق أزلية (المؤسسة الهندوسية الأمريكية؛ بي بي سي). وهناك نصوص أخرى تذكّر الناس بهذه الحقائق، وأشهرها البهاغافاد غيتا، وهي كتاب أساسي عند الهندوس (المؤسسة الهندوسية الأمريكية).",
        )],
        islam: INTRO.book,
      },
      beliefs: {
        belief: [
          bi("There are four Vedas: Rig, Sama, Yajur and Atharva. The Rig Veda is the oldest (Hindu American Foundation; Dorar Encyclopedia).", "الفيدات أربع: ريغ، وساما، وياجور، وأثارفا. وأقدمها ريغ فيدا (المؤسسة الهندوسية الأمريكية؛ موسوعة الدرر السنية)."),
          bi("The Upanishads are the part of the Vedas that explores the self, God and the world (Hindu American Foundation; BBC).", "الأوبانيشاد هي الجزء من الفيدا الذي يبحث في النفس والإله والعالم (المؤسسة الهندوسية الأمريكية؛ بي بي سي)."),
          bi("Hinduism has no single founder and no one book that alone has authority (Hindu American Foundation; BBC).", "ليس للهندوسية مؤسس واحد، ولا كتاب واحد له وحده السلطة (المؤسسة الهندوسية الأمريكية؛ بي بي سي)."),
          bi("Truth is one, and the wise call it by many names. So Hindus accept that there is more than one path (Hindu American Foundation).", "الحقيقة واحدة، والحكماء يسمّونها بأسماء كثيرة. ولذلك يقبل الهندوس أن الطرق متعددة (المؤسسة الهندوسية الأمريكية)."),
        ],
        islam: ISLAM.book,
      },
      common: [
        bi("Sacred words are learned by heart and passed on with care. The Vedas were handed down by word of mouth for centuries, and many companions of the Prophet knew the Quran by heart (BBC; M. As-Sayed Muhammad, p. 129).", "الكلام المقدس يُحفظ في الصدور ويُنقل بعناية. فقد تناقل الناس الفيدا مشافهة قرونًا، وحفظ القرآن كثير من الصحابة عن ظهر قلب (بي بي سي؛ محمد السيد محمد، ص 129)."),
        bi("Truth does not belong to one people. Islam teaches that every nation had someone to warn it (Hindu American Foundation; Quran 35:24).", "الحق ليس حكرًا على قوم. والإسلام يعلّم أنه ما من أمة إلا خلا فيها نذير (المؤسسة الهندوسية الأمريكية؛ فاطر: 24)."),
      ],
      differences: {
        belief: [
          bi("The Vedas are held to be eternal truths heard by ancient sages, not a book brought by one prophet (Hindu American Foundation; BBC).", "تُعدّ الفيدا حقائق أزلية سمعها حكماء قدماء، لا كتابًا جاء به نبي واحد (المؤسسة الهندوسية الأمريكية؛ بي بي سي)."),
          bi("There are many paths to the truth, and no single final scripture (Hindu American Foundation).", "الطرق إلى الحقيقة كثيرة، وليس هناك كتاب واحد أخير (المؤسسة الهندوسية الأمريكية)."),
        ],
        islam: [
          bi("Islam teaches that God sent guidance through prophets, to every nation, and that Muhammad is the last of them (Quran 16:36; 33:40).", "يعلّم الإسلام أن الله بعث هدايته عن طريق الأنبياء إلى كل أمة، وأن محمدًا ﷺ خاتمهم (النحل: 36؛ الأحزاب: 40)."),
          bi("Islam teaches that the Quran is God's final book, guarded by Him, and the measure over what came before (Quran 15:9; 5:48).", "يعلّم الإسلام أن القرآن كتاب الله الأخير، وأن الله تكفّل بحفظه، وأنه مهيمن على ما قبله، أي شاهد وحاكم عليه (الحجر: 9؛ المائدة: 48)."),
        ],
      },
      faq: [
        {
          id: "vedas",
          q: bi("What does Islam say about the Vedas?", "ماذا يقول الإسلام عن الفيدا؟"),
          a: bi(
            "The Quran does not mention them. It says God sent messengers to every nation, and that some of them are not named in the Quran (16:36; 40:78). So a Muslim does not say who brought the Vedas. Muslims follow the Quran, which they believe God has guarded (15:9).",
            "لم يذكرها القرآن. وهو يذكر أن الله بعث في كل أمة رسولًا، وأن من الرسل من لم يقصصهم في القرآن (النحل: 36؛ غافر: 78). فالمسلم لا يجزم بمن جاء بالفيدا. ويتّبع المسلمون القرآن، وهم يؤمنون بأن الله حفظه (الحجر: 9).",
          ),
        },
        FAQ.preserved,
        FAQ.check,
      ],
      sources: {
        belief: [HAF, BBC_HINDU_SCRIPTURE, BBC_HINDUISM, DAWA_HINDUISM, DORAR_HINDU_BOOKS],
        islam: refs(...ISLAM_REFS.book, quran("16:36"), quran("35:24"), quran("33:40"), quran("5:48"), quran("40:78"), quran("4:82"), quran("2:23")),
      },
    },

    "hinduism.life": {
      overview: {
        belief: [bi(
          "Hindus believe that each person has an eternal self, the atman, which is never born and never dies (BBC; Bhagavad Gita 2.20). It is reborn again and again, in a cycle called samsara. The final goal is to be freed from this cycle. That freedom is called moksha (BBC).",
          "يؤمن الهندوس بأن لكل إنسان ذاتًا أزلية هي «الأتمان»، لا تولد ولا تموت (بي بي سي؛ البهاغافاد غيتا 2.20). وهي تولد مرة بعد مرة في دورة تُسمّى «السامسارا». والغاية الأخيرة هي التحرّر من هذه الدورة، ويُسمّى هذا التحرّر «الموكشا» (بي بي سي).",
        )],
        islam: [bi(
          "Islam teaches that God created each person and gave them one life on earth as a test (Quran 67:2). Its purpose is to worship God (Quran 51:56), and after it everyone returns to Him (Quran 2:28).",
          "يعلّم الإسلام أن الله خلق كل إنسان وجعل له حياة واحدة على الأرض اختبارًا (الملك: 2). وغايتها عبادة الله (الذاريات: 56)، وبعدها يرجع الجميع إليه (البقرة: 28).",
        )],
      },
      beliefs: {
        belief: [
          bi("Karma: every action has a result, in this life or in a later one (BBC; Dorar Encyclopedia).", "الكارما: لكل عمل نتيجة، في هذه الحياة أو في حياة تالية (بي بي سي؛ موسوعة الدرر السنية)."),
          bi("Dharma: duty and right conduct, which differ with a person's age and place in life (BBC).", "الدارما: الواجب والسلوك القويم، وهما يختلفان باختلاف عمر الإنسان وموقعه في الحياة (بي بي سي)."),
          bi("Life has four goals: right living, worldly success, pleasure and, last, liberation (BBC).", "للحياة أربع غايات: الاستقامة، والنجاح الدنيوي، والمتعة، ثم التحرّر (بي بي سي)."),
          bi("A person should do their duty without clinging to its results (Bhagavad Gita 2.47).", "على الإنسان أن يؤدي واجبه دون تعلّق بثمرته (البهاغافاد غيتا 2.47)."),
        ],
        islam: ISLAM.purpose,
      },
      common: [
        bi("A human being is more than a body (Bhagavad Gita 2.20; Quran 17:85).", "الإنسان أكثر من جسد (البهاغافاد غيتا 2.20؛ الإسراء: 85)."),
        bi("Every action has consequences, and no good deed is lost (BBC; Quran 99:7–8).", "لكل عمل عاقبة، ولا يضيع عمل صالح (بي بي سي؛ الزلزلة: 7–8)."),
        bi("Doing one's duty comes before personal gain (Bhagavad Gita 2.47; Quran 76:8–9).", "أداء الواجب مقدَّم على المنفعة الشخصية (البهاغافاد غيتا 2.47؛ الإنسان: 8–9)."),
      ],
      differences: {
        belief: [
          bi("The soul is eternal and was never created (Bhagavad Gita 2.20).", "الروح أزلية لم تُخلق (البهاغافاد غيتا 2.20)."),
          bi("The results of actions are met through many rebirths, until the soul is freed (BBC).", "تُلقى نتائج الأعمال عبر ولادات كثيرة، إلى أن تتحرّر الروح (بي بي سي)."),
          bi("Traditional texts describe four social classes, called varnas, each with its own duties (BBC; Dorar Encyclopedia).", "تذكر النصوص القديمة أربع طبقات اجتماعية تُسمّى «الفارنا»، لكل منها واجباتها (بي بي سي؛ موسوعة الدرر السنية)."),
        ],
        islam: [
          bi("Islam teaches that God created every soul, and that each person lives once on earth, dies, and is then raised (Quran 2:28).", "يعلّم الإسلام أن الله خلق كل نفس، وأن الإنسان يعيش على الأرض مرة واحدة، ثم يموت، ثم يُبعث (البقرة: 28)."),
          bi("Islam teaches that all people come from one soul. No one is higher by birth: the most honoured with God is the most God-conscious (Quran 4:1; 49:13).", "يعلّم الإسلام أن الناس جميعًا من نفس واحدة، فلا فضل لأحد بمولده، وأكرمهم عند الله أتقاهم (النساء: 1؛ الحجرات: 13)."),
        ],
      },
      faq: [FAQ.karma, FAQ.equality, FAQ.purpose],
      sources: {
        belief: [BBC_HINDU_CONCEPTS, BBC_HINDUISM, gita("2.20"), gita("2.47"), DAWA_HINDUISM, DORAR_HINDU_BELIEFS, DORAR_HINDU_GODS],
        islam: refs(...ISLAM_REFS.purpose, quran("2:28"), quran("17:85"), quran("99:7–8"), quran("76:8–9"), quran("4:1"), quran("21:47")),
      },
    },

    "hinduism.practice": {
      overview: {
        belief: [bi(
          "Hindu worship is called puja. It uses images of the deities (murtis), prayers (mantras) and offerings such as water, fruit, flowers and incense, at home or in a temple (BBC). The most treasured Hindu value is ahimsa: not harming by thought, word or action (Hindu American Foundation).",
          "تُسمّى العبادة الهندوسية «البوجا». وفيها تماثيل الآلهة (المورتي)، والأدعية (المانترا)، وقرابين مثل الماء والفاكهة والزهور والبخور، في البيت أو في المعبد (بي بي سي). وأعزّ القيم عند الهندوس «الأهيمسا»، أي ألّا تؤذي بفكر ولا قول ولا فعل (المؤسسة الهندوسية الأمريكية).",
        )],
        islam: INTRO.worship,
      },
      beliefs: {
        belief: [
          bi("Worship is mostly personal: most Hindu homes have a shrine where offerings and prayers are made (BBC).", "العبادة فردية في الغالب: ففي أكثر بيوت الهندوس مزار تُقدَّم فيه القرابين والأدعية (بي بي سي)."),
          bi("There are several paths to the goal: devotion, knowledge, action and meditation (Hindu American Foundation).", "الطرق إلى الغاية متعددة: المحبة والتعبّد، والمعرفة، والعمل، والتأمل (المؤسسة الهندوسية الأمريكية)."),
          bi("Virtues praised in the Gita include non-violence, truthfulness, charity, self-control and compassion for all living beings (Bhagavad Gita 16.1–3).", "من الفضائل التي تمدحها الغيتا: ترك العنف، والصدق، والصدقة، وضبط النفس، والرحمة بكل الأحياء (البهاغافاد غيتا 16.1–3)."),
          bi("Hindus honour the cow and do not eat beef (Dorar Encyclopedia).", "يعظّم الهندوس البقرة ولا يأكلون لحمها (موسوعة الدرر السنية)."),
        ],
        islam: ISLAM.worship,
      },
      common: [
        bi("Truthfulness, charity and self-control are virtues (Bhagavad Gita 16.1–3; Quran 2:177).", "الصدق والصدقة وضبط النفس فضائل (البهاغافاد غيتا 16.1–3؛ البقرة: 177)."),
        bi("Do not harm others. The Quran says that to kill one person unjustly is like killing all people (Hindu American Foundation; Quran 5:32).", "لا تؤذِ غيرك. والقرآن يذكر أن من قتل نفسًا بغير حق فكأنما قتل الناس جميعًا (المؤسسة الهندوسية الأمريكية؛ المائدة: 32)."),
        bi("Prayer and remembrance belong to every day (BBC; Quran 20:14).", "الدعاء والذكر من عمل كل يوم (بي بي سي؛ طه: 14)."),
      ],
      differences: {
        belief: [
          bi("Worship is offered through images of the deities, with offerings placed before them (BBC).", "تُؤدّى العبادة عن طريق تماثيل الآلهة، وتوضع القرابين أمامها (بي بي سي)."),
        ],
        islam: [
          bi("Islam teaches that prayer goes to God alone, without images, and that He answers the one who calls on Him (Quran 1:5; 2:186).", "يعلّم الإسلام أن الدعاء لله وحده بلا تماثيل، وأنه يجيب من يدعوه (الفاتحة: 5؛ البقرة: 186)."),
          bi("Islam teaches that what reaches God from an offering is not its meat or its blood, but the devotion of the person (Quran 22:37).", "يعلّم الإسلام أن الذي يصل إلى الله من القربان ليس لحمه ولا دمه، بل تقوى صاحبه (الحج: 37)."),
        ],
      },
      faq: [
        {
          id: "meat",
          q: bi("Why do Muslims eat meat?", "لماذا يأكل المسلمون اللحم؟"),
          a: bi(
            "Islam allows good and wholesome food, with limits: for example, pork and wine are not allowed (5:3; 5:90), and waste is blamed (7:31). Islam also asks for mercy to all creatures: the Quran says the Prophet was sent as a mercy to the worlds (21:107).",
            "يبيح الإسلام الطيبات من الطعام بحدود: فلحم الخنزير والخمر مثلًا محرّمان (المائدة: 3؛ المائدة: 90)، والإسراف مذموم (الأعراف: 31). ويأمر الإسلام كذلك بالرحمة بالخلق كلهم، فالقرآن يذكر أن النبي ﷺ أُرسل رحمة للعالمين (الأنبياء: 107).",
          ),
        },
        FAQ.rituals,
        FAQ.force,
      ],
      sources: {
        belief: [BBC_HINDU_WORSHIP, HAF, gita("16.1–3"), DAWA_HINDUISM, DORAR_HINDU_BELIEFS],
        islam: refs(...ISLAM_REFS.worship, quran("2:177"), quran("5:32"), quran("1:5"), quran("2:186"), quran("22:37"), quran("5:3"), quran("5:90"), quran("7:31"), quran("21:107"), quran("2:256"), quran("60:8")),
      },
    },

    "hinduism.afterlife": {
      overview: {
        belief: [bi(
          "Hindus believe that death is a change of body, not the end. The soul leaves a worn-out body and enters a new one, as a person changes clothes (Bhagavad Gita 2.22). The next life depends on how this one was lived (BBC).",
          "يؤمن الهندوس بأن الموت تبديل للجسد لا نهاية. فالروح تترك جسدًا باليًا وتدخل جسدًا جديدًا، كما يبدّل الإنسان ثيابه (البهاغافاد غيتا 2.22). والحياة التالية تتوقف على ما عمله الإنسان في هذه الحياة (بي بي سي).",
        )],
        islam: INTRO.hereafter,
      },
      beliefs: {
        belief: [
          bi("Rebirth: the soul is born again and again, as a human or in another form (BBC).", "تكرار الولادة: تولد الروح مرة بعد مرة، في صورة إنسان أو في صورة أخرى (بي بي سي)."),
          bi("Karma decides the next life. Its results may also be met for a time in a heavenly or hellish realm (BBC).", "الكارما تحدّد الحياة التالية، وقد تُلقى نتائجها مدةً في عالم نعيم أو عالم عذاب (بي بي سي)."),
          bi("Moksha: the final goal is freedom from the cycle of death and rebirth (BBC).", "الموكشا: الغاية الأخيرة هي التحرّر من دورة الموت والولادة (بي بي سي)."),
          bi("Whoever reaches God is not born again (Bhagavad Gita 8.16).", "من بلغ الإله لا يولد مرة أخرى (البهاغافاد غيتا 8.16)."),
        ],
        islam: ISLAM.hereafter,
      },
      common: [
        bi("Death is not the end of a person (Bhagavad Gita 2.22; Quran 3:185).", "الموت ليس نهاية الإنسان (البهاغافاد غيتا 2.22؛ آل عمران: 185)."),
        bi("What we do in this life shapes what comes after (BBC; Quran 99:7–8).", "ما نعمله في هذه الحياة يحدّد ما بعدها (بي بي سي؛ الزلزلة: 7–8)."),
        bi("The highest hope is to be near God, beyond death and sorrow (Bhagavad Gita 8.16; Quran 9:72).", "أعلى الرجاء هو القرب من الله، حيث لا موت ولا حزن (البهاغافاد غيتا 8.16؛ التوبة: 72)."),
      ],
      differences: {
        belief: [
          bi("The soul returns to this world many times, until it is freed (BBC; Dorar Encyclopedia).", "تعود الروح إلى هذا العالم مرات كثيرة إلى أن تتحرّر (بي بي سي؛ موسوعة الدرر السنية)."),
          bi("For many Hindus, freedom means that the soul becomes one with the Supreme (BBC; Dorar Encyclopedia).", "التحرّر عند كثير من الهندوس أن تتّحد الروح بالإله الأعلى (بي بي سي؛ موسوعة الدرر السنية)."),
        ],
        islam: [
          bi("Islam teaches that there is one life on earth and no return to it: after death comes a barrier until the Day of Resurrection (Quran 23:99–100).", "يعلّم الإسلام أن الحياة على الأرض واحدة ولا رجوع إليها: فبعد الموت برزخ، أي حاجز، إلى يوم البعث (المؤمنون: 99–100)."),
          bi("Islam teaches that people are raised as themselves and judged by God. They come near to Him, but they do not become Him (Quran 2:28; 42:11).", "يعلّم الإسلام أن الناس يُبعثون بأنفسهم ويحاسبهم الله، وأنهم يقتربون منه ولا يصيرون إيّاه (البقرة: 28؛ الشورى: 11)."),
        ],
      },
      faq: [FAQ.rebirth, FAQ.reason, FAQ.heaven],
      sources: {
        belief: [gita("2.22"), gita("8.16"), BBC_HINDUISM, BBC_HINDU_CONCEPTS, BBC_HINDU_MOKSHA, DAWA_HINDUISM, DORAR_HINDU_BELIEFS],
        islam: refs(...ISLAM_REFS.hereafter, quran("9:72"), quran("23:99–100"), quran("2:28"), quran("42:11"), quran("19:66–67"), quran("45:21–22")),
      },
    },

    "buddhism.god": {
      overview: {
        belief: [bi(
          "Buddhism is a path of personal spiritual growth, taught by the Buddha about 2,500 years ago. It has no belief in a personal god (BBC; Dorar Encyclopedia). Its aim is to end suffering and reach nirvana (BBC; Stanford Encyclopedia of Philosophy).",
          "البوذية طريق للارتقاء الروحي الشخصي، علّمه بوذا قبل نحو 2500 سنة. وليس فيها إيمان بإله شخصي (بي بي سي؛ موسوعة الدرر السنية). وغايتها إنهاء المعاناة وبلوغ «النيرفانا» (بي بي سي؛ موسوعة ستانفورد للفلسفة).",
        )],
        islam: INTRO.creator,
      },
      beliefs: {
        belief: [
          bi("The Buddha set aside questions such as whether the world is eternal. He said they do not lead to the end of suffering (Majjhima Nikaya 63).", "ترك بوذا أسئلة مثل: هل العالم أزلي؟ وقال إنها لا توصل إلى نهاية المعاناة (مَجّيما نيكايا 63)."),
          bi("The round of rebirth has no beginning that can be found (Samyutta Nikaya 15.3).", "دورة الولادة المتكررة ليس لها بداية يمكن معرفتها (سَميوتا نيكايا 15.3)."),
          bi("Everything that is put together passes away, and nothing in a person is a lasting self (Dhammapada 277–279; Samyutta Nikaya 22.59).", "كل مركّب زائل، وليس في الإنسان ذات باقية (الدامابادا 277–279؛ سَميوتا نيكايا 22.59)."),
          bi("Each person must make the effort. A Buddha only shows the way (Dhammapada 276).", "على كل إنسان أن يجتهد بنفسه، وبوذا إنما يدلّ على الطريق (الدامابادا 276)."),
        ],
        islam: ISLAM.creator,
      },
      common: [
        bi("Life in this world does not last, and clinging to it brings pain (Dhammapada 277; Quran 57:20).", "الحياة الدنيا لا تدوم، والتعلّق بها يجلب الألم (الدامابادا 277؛ الحديد: 20)."),
        bi("Beliefs should be tested, not taken on hearsay (Anguttara Nikaya 3.65; Quran 17:36).", "الاعتقاد يُختبر ولا يؤخذ بالسماع وحده (أنغوتارا نيكايا 3.65؛ الإسراء: 36)."),
        bi("Human knowledge has limits. The Quran says people were given only a little knowledge (Majjhima Nikaya 63; Quran 17:85).", "لعلم الإنسان حدود، والقرآن يذكر أن الناس ما أوتوا من العلم إلا قليلًا (مَجّيما نيكايا 63؛ الإسراء: 85)."),
      ],
      differences: {
        belief: [
          bi("The Buddhist path does not rest on a Creator. It rests on a person's own insight and effort (BBC; Dhammapada 276).", "الطريق البوذي لا يقوم على الإيمان بخالق، بل على بصيرة الإنسان وجهده (بي بي سي؛ الدامابادا 276)."),
          bi("The first beginning of the world is left an open question (Samyutta Nikaya 15.3; Majjhima Nikaya 63).", "بداية العالم الأولى مسألة تُترك مفتوحة (سَميوتا نيكايا 15.3؛ مَجّيما نيكايا 63)."),
        ],
        islam: [
          bi("Islam teaches that the world did not come from nothing and did not make itself: it has a Creator, who has no beginning (Quran 52:35; 57:3).", "يعلّم الإسلام أن العالم لم يأتِ من لا شيء ولم يخلق نفسه، بل له خالق لا بداية له (الطور: 35؛ الحديد: 3)."),
          bi("Islam teaches that knowing the Creator is the key to the purpose of life, and that hearts find rest in remembering Him (Quran 51:56; 13:28).", "يعلّم الإسلام أن معرفة الخالق مفتاح غاية الحياة، وأن القلوب تطمئن بذكره (الذاريات: 56؛ الرعد: 28)."),
        ],
      },
      faq: [
        {
          id: "buddha-prophet",
          q: bi("Was the Buddha a prophet?", "هل كان بوذا نبيًّا؟"),
          a: bi(
            "The Quran does not mention him. It says God sent messengers to every nation, and that some of them are not named in the Quran (16:36; 40:78). So Muslims do not say that he was a prophet, and they do not say for certain that he was not. What Islam does teach is that every messenger called people to worship the one God (21:25).",
            "لم يذكره القرآن. وهو يذكر أن الله بعث في كل أمة رسولًا، وأن من الرسل من لم يقصصهم في القرآن (النحل: 36؛ غافر: 78). فالمسلمون لا يقولون إنه نبي، ولا يجزمون بأنه ليس نبيًّا. والذي يعلّمه الإسلام أن كل رسول دعا الناس إلى عبادة الإله الواحد (الأنبياء: 25).",
          ),
        },
        FAQ.whoMadeGod,
        FAQ.suffering,
      ],
      sources: {
        belief: [BBC_BUDDHISM, SEP_BUDDHA, MN_63, SN_15_3, SN_22_59, DHP_276, AN_3_65, DAWA_BUDDHISM, DORAR_BUDDHIST_TEACHING],
        islam: refs(...ISLAM_REFS.creator, quran("57:20"), quran("17:36"), quran("17:85"), quran("51:56"), quran("13:28"), quran("16:36"), quran("40:78"), quran("21:25"), BOOK_UNCREATED, quran("67:2"), quran("2:286"), quran("21:47")),
      },
    },

    "buddhism.sources": {
      overview: {
        belief: [bi(
          "Buddhist scripture is not presented as a revelation from a god. It records the words of the Buddha, kept by his followers (Dorar Encyclopedia). The oldest collection is the Pali Canon, also called the Tipitaka, “three baskets”: rules for monks and nuns, the Buddha's discourses, and further teaching (Access to Insight).",
          "الكتب البوذية لا تُقدَّم على أنها وحي من إله، بل هي أقوال بوذا كما حفظها أتباعه (موسوعة الدرر السنية). وأقدم مجموعاتها «القانون البالي»، ويُسمّى أيضًا «التيبيتاكا»، أي «السلال الثلاث»: قواعد الرهبان والراهبات، وخطب بوذا، وتعاليم أخرى (موقع Access to Insight).",
        )],
        islam: INTRO.knowing,
      },
      beliefs: {
        belief: [
          bi("The Buddha taught from his own awakening: knowledge and insight arose in him about things not heard before (Samyutta Nikaya 56.11).", "علّم بوذا ممّا انكشف له في يقظته: نشأت فيه معرفة وبصيرة بأمور لم تُسمع من قبل (سَميوتا نيكايا 56.11)."),
          bi("Do not accept a teaching only because of reports, tradition or scripture. Accept it when you know for yourself that it leads to good (Anguttara Nikaya 3.65).", "لا تقبل تعليمًا لمجرد الرواية أو التقليد أو النص، بل اقبله إذا عرفت بنفسك أنه يؤدي إلى الخير (أنغوتارا نيكايا 3.65)."),
          bi("The Pali Canon is the basis of Theravada Buddhism. Mahayana schools also use other texts (Access to Insight; Dorar Encyclopedia).", "القانون البالي أساس بوذية «ثيرافادا»، ولمدارس «ماهايانا» نصوص أخرى كذلك (موقع Access to Insight؛ موسوعة الدرر السنية)."),
        ],
        islam: ISLAM.knowing,
      },
      common: [
        bi("Do not follow what you have no knowledge of (Anguttara Nikaya 3.65; Quran 17:36).", "لا تتّبع ما ليس لك به علم (أنغوتارا نيكايا 3.65؛ الإسراء: 36)."),
        bi("Seeking knowledge and insight is praised. The Quran teaches this prayer: my Lord, increase me in knowledge (Samyutta Nikaya 56.11; Quran 20:114).", "طلب المعرفة والبصيرة ممدوح، والقرآن يعلّم هذا الدعاء: ربِّ زدني علمًا (سَميوتا نيكايا 56.11؛ طه: 114)."),
      ],
      differences: {
        belief: [
          bi("The source of the teaching is the insight of an awakened human being, not a message from a Creator (Samyutta Nikaya 56.11; Dorar Encyclopedia).", "مصدر التعليم بصيرة إنسان مستنير، لا رسالة من خالق (سَميوتا نيكايا 56.11؛ موسوعة الدرر السنية)."),
        ],
        islam: [
          bi("Islam teaches that revelation is a source of knowledge beside reason and the senses: God told people what they could not find out alone (Quran 4:165; 2:2–3).", "يعلّم الإسلام أن الوحي مصدر للمعرفة مع العقل والحواس، فقد أخبر الله الناس بما لا يصلون إليه وحدهم (النساء: 165؛ البقرة: 2–3)."),
          bi("Islam teaches that the Quran is God's word, guarded by Him, and open to testing (Quran 15:9; 4:82).", "يعلّم الإسلام أن القرآن كلام الله، وأن الله تكفّل بحفظه، وأنه معروض للاختبار (الحجر: 9؛ النساء: 82)."),
        ],
      },
      faq: [
        {
          id: "test",
          q: bi("Buddhism says: test every teaching. Does Islam agree?", "البوذية تقول: اختبر كل تعليم. فهل يوافق الإسلام؟"),
          a: bi(
            "Islam also asks for proof and blames following guesses (2:111; 17:36). The Quran even offers itself for testing (4:82). Islam adds one thing: some matters, such as what comes after death, cannot be found by testing alone, so God sent messengers to tell us (4:165).",
            "الإسلام كذلك يطالب بالبرهان ويذمّ اتّباع الظن (البقرة: 111؛ الإسراء: 36). والقرآن يعرض نفسه للاختبار (النساء: 82). ويضيف الإسلام أمرًا: أن بعض المسائل، كالذي يكون بعد الموت، لا تُعرف بالاختبار وحده، ولذلك أرسل الله رسلًا يخبروننا (النساء: 165).",
          ),
        },
        FAQ.blindFaith,
        FAQ.check,
      ],
      sources: {
        belief: [TIPITAKA, SN_56_11, AN_3_65, DAWA_BUDDHISM, DORAR_BUDDHIST_IDEAS],
        islam: refs(...ISLAM_REFS.knowing, quran("20:114"), quran("15:9"), quran("2:164"), quran("2:23")),
      },
    },

    "buddhism.life": {
      overview: {
        belief: [bi(
          "The Buddha taught four noble truths: life involves suffering; suffering comes from craving; suffering can end; and there is a path that ends it (Samyutta Nikaya 56.11; Dorar Encyclopedia). The goal of life is to follow that path to nirvana, the end of suffering (BBC).",
          "علّم بوذا أربع حقائق نبيلة: في الحياة معاناة؛ وسبب المعاناة الشهوة والتعلّق؛ والمعاناة يمكن أن تنتهي؛ وهناك طريق ينهيها (سَميوتا نيكايا 56.11؛ موسوعة الدرر السنية). وغاية الحياة سلوك هذا الطريق إلى «النيرفانا»، أي نهاية المعاناة (بي بي سي).",
        )],
        islam: INTRO.purpose,
      },
      beliefs: {
        belief: [
          bi("Birth, ageing, death, and not getting what one wants are all forms of suffering (Samyutta Nikaya 56.11).", "الولادة والشيخوخة والموت وفوات ما يتمنّاه المرء كلها صور من المعاناة (سَميوتا نيكايا 56.11)."),
          bi("Craving is the root of suffering. Letting go of craving ends it (Samyutta Nikaya 56.11).", "الشهوة والتعلّق أصل المعاناة، وتركهما ينهيها (سَميوتا نيكايا 56.11)."),
          bi("There is no lasting self: body, feelings and mind are “not self” (Samyutta Nikaya 22.59).", "ليس هناك ذات باقية: فالجسد والمشاعر والعقل «ليست ذاتًا» (سَميوتا نيكايا 22.59)."),
          bi("Each person is the owner and heir of their own actions (Anguttara Nikaya 5.57).", "كل إنسان صاحب أعماله ووارثها (أنغوتارا نيكايا 5.57)."),
        ],
        islam: ISLAM.purpose,
      },
      common: [
        bi("This world passes. The Quran compares it to a plant that grows, turns yellow and becomes dust (Dhammapada 277; Quran 57:20).", "الدنيا زائلة. ويشبّهها القرآن بنبات ينمو ثم يصفرّ ثم يصير حطامًا (الدامابادا 277؛ الحديد: 20)."),
        bi("Desire without limits harms a person, and restraint is praised (Samyutta Nikaya 56.11; Quran 79:40–41).", "الشهوة بلا حدّ تضرّ صاحبها، وضبط النفس ممدوح (سَميوتا نيكايا 56.11؛ النازعات: 40–41)."),
        bi("Each person answers for their own actions (Anguttara Nikaya 5.57; Quran 53:39).", "كل إنسان مسؤول عن عمله (أنغوتارا نيكايا 5.57؛ النجم: 39)."),
      ],
      differences: {
        belief: [
          bi("The goal is to end craving, and with it rebirth and suffering (Samyutta Nikaya 56.11).", "الغاية إنهاء الشهوة والتعلّق، ومعهما تكرار الولادة والمعاناة (سَميوتا نيكايا 56.11)."),
          bi("There is no lasting self or soul (Samyutta Nikaya 22.59).", "ليس للإنسان ذات أو روح باقية (سَميوتا نيكايا 22.59)."),
        ],
        islam: [
          bi("Islam teaches that hardship is a test with meaning, and that with hardship comes ease (Quran 2:155–156; 94:5–6).", "يعلّم الإسلام أن الشدة اختبار له معنى، وأن مع العسر يسرًا (البقرة: 155–156؛ الشرح: 5–6)."),
          bi("Islam teaches that each person is a real soul, honoured by God, who will return to Him (Quran 17:70; 2:28).", "يعلّم الإسلام أن كل إنسان نفس حقيقية كرّمها الله، وأنها راجعة إليه (الإسراء: 70؛ البقرة: 28)."),
        ],
      },
      faq: [
        {
          id: "desire",
          q: bi("Does Islam ask people to give up desire?", "هل يطلب الإسلام من الناس ترك الشهوات كلها؟"),
          a: bi(
            "Islam asks for balance, not for giving up the world. The Quran says: seek the home of the Hereafter, and do not forget your share of this world (28:77). It calls Muslims a middle community (2:143), and it praises the one who holds the soul back from wrong desire (79:40–41).",
            "يطلب الإسلام التوازن لا ترك الدنيا. فالقرآن يقول: ابتغِ الدار الآخرة ولا تنسَ نصيبك من الدنيا (القصص: 77). ويصف المسلمين بأنهم أمة وسط (البقرة: 143)، ويثني على من نهى النفس عن الهوى (النازعات: 40–41).",
          ),
        },
        FAQ.suffering,
        FAQ.purpose,
      ],
      sources: {
        belief: [SN_56_11, BBC_BUDDHISM, SN_22_59, AN_5_57, DHP_276, DAWA_BUDDHISM, DORAR_BUDDHIST_TEACHING],
        islam: refs(...ISLAM_REFS.purpose, quran("57:20"), quran("79:40–41"), quran("53:39"), quran("2:155–156"), quran("94:5–6"), quran("2:28"), quran("28:77"), quran("2:143"), quran("2:286"), quran("21:47")),
      },
    },

    "buddhism.practice": {
      overview: {
        belief: [bi(
          "Buddhist practice follows the Middle Way, between a life of pleasure and a life of harsh self-denial (Samyutta Nikaya 56.11). One short verse sums it up: avoid all evil, do good, and purify the mind (Dhammapada 183).",
          "تسير الممارسة البوذية على «الطريق الوسط»، بين حياة اللذّة وحياة التقشّف القاسي (سَميوتا نيكايا 56.11). ويلخّصها بيت قصير: اجتنب كل شر، وافعل الخير، وطهّر عقلك (الدامابادا 183).",
        )],
        islam: INTRO.ethics,
      },
      beliefs: {
        belief: [
          bi("The Noble Eightfold Path: right view, resolve, speech, action, livelihood, effort, mindfulness and concentration (Samyutta Nikaya 56.11; Dorar Encyclopedia).", "الطريق النبيل الثُماني: سلامة النظر، والعزم، والقول، والفعل، والكسب، والجهد، واليقظة، والتركيز (سَميوتا نيكايا 56.11؛ موسوعة الدرر السنية)."),
          bi("Five precepts for all Buddhists: do not kill, do not steal, no sexual misconduct, no false speech, no alcohol or drugs (Access to Insight; Dorar Encyclopedia).", "خمسة مبادئ لكل بوذي: لا تقتل، ولا تسرق، ولا ترتكب الفاحشة، ولا تكذب، ولا تتناول مسكرًا ولا مخدّرًا (موقع Access to Insight؛ موسوعة الدرر السنية)."),
          bi("Loving-kindness: care for all living beings as a mother cares for her only child (Karaniya Metta Sutta).", "المحبة: ارعَ كل الأحياء كما ترعى الأم ولدها الوحيد (كَرَنيا مِتّا سوتا)."),
          bi("Meditation trains the mind, and some followers live as monks and nuns (BBC; Access to Insight).", "التأمل يروّض العقل، وبعض الأتباع يعيشون رهبانًا وراهبات (بي بي سي؛ موقع Access to Insight)."),
        ],
        islam: ISLAM.ethics,
      },
      common: [
        bi("Life is sacred, and taking what is not yours is wrong (Access to Insight; Quran 5:32; 2:188).", "النفس مصونة، وأخذ ما ليس لك خطأ (موقع Access to Insight؛ المائدة: 32؛ البقرة: 188)."),
        bi("Alcohol and drugs that cloud the mind are avoided (Access to Insight; Quran 5:90).", "تُجتنب الخمر والمخدّرات التي تُذهب العقل (موقع Access to Insight؛ المائدة: 90)."),
        bi("Kindness and control of anger are praised (Karaniya Metta Sutta; Quran 3:134).", "الرحمة وكظم الغيظ ممدوحان (كَرَنيا مِتّا سوتا؛ آل عمران: 134)."),
        bi("Balance: neither excess nor harshness to oneself (Samyutta Nikaya 56.11; Quran 2:143).", "التوازن: لا إسراف ولا تشديد على النفس (سَميوتا نيكايا 56.11؛ البقرة: 143)."),
      ],
      differences: {
        belief: [
          bi("The practice is a training of one's own mind. It is not worship of a Creator (BBC; Dhammapada 165).", "الممارسة ترويض للعقل، وليست عبادة لخالق (بي بي سي؛ الدامابادا 165)."),
          bi("Those who follow the path most fully often live as monks or nuns, without home or possessions (Access to Insight; Dorar Encyclopedia).", "من يسلكون الطريق كاملًا يعيشون غالبًا رهبانًا أو راهبات، بلا بيت ولا مال (موقع Access to Insight؛ موسوعة الدرر السنية)."),
        ],
        islam: [
          bi("Islam teaches that good conduct is part of worshipping God, and that prayer keeps a person in touch with Him every day (Quran 16:90; 20:14).", "يعلّم الإسلام أن حسن الخلق جزء من عبادة الله، وأن الصلاة تصل الإنسان بربه كل يوم (النحل: 90؛ طه: 14)."),
          bi("Islam does not ask people to leave the world: it asks them to seek the Hereafter and not forget their share of this life (Quran 28:77).", "لا يطلب الإسلام ترك الدنيا، بل يطلب ابتغاء الآخرة مع عدم نسيان النصيب من الدنيا (القصص: 77)."),
        ],
      },
      faq: [FAQ.remembrance, FAQ.goodWithoutGod, FAQ.rituals],
      sources: {
        belief: [SN_56_11, DHP_183, DHP_165, PRECEPTS, METTA, TIPITAKA, BBC_BUDDHISM, DAWA_BUDDHISM, DORAR_BUDDHIST_IDEAS],
        islam: refs(...ISLAM_REFS.ethics, quran("5:32"), quran("2:188"), quran("5:90"), quran("3:134"), quran("2:143"), quran("28:77"), quran("3:191"), quran("13:28"), quran("99:7–8"), quran("51:56"), quran("2:183")),
      },
    },

    "buddhism.afterlife": {
      overview: {
        belief: [bi(
          "Buddhists believe that beings are reborn again and again, and that their actions (karma) shape each new life (Stanford Encyclopedia of Philosophy; BBC). The final goal is nirvana: the end of craving, suffering and rebirth (Samyutta Nikaya 56.11; Dorar Encyclopedia).",
          "يؤمن البوذيون بأن الكائنات تولد مرة بعد مرة، وأن أعمالها (الكارما) تحدّد كل حياة جديدة (موسوعة ستانفورد للفلسفة؛ بي بي سي). والغاية الأخيرة هي «النيرفانا»: نهاية الشهوة والمعاناة وتكرار الولادة (سَميوتا نيكايا 56.11؛ موسوعة الدرر السنية).",
        )],
        islam: INTRO.death,
      },
      beliefs: {
        belief: [
          bi("Good actions bring pleasant results and bad actions painful ones, in this life or a later one (Stanford Encyclopedia of Philosophy).", "العمل الصالح يثمر عاقبة طيبة، والعمل السيّئ عاقبة مؤلمة، في هذه الحياة أو في حياة تالية (موسوعة ستانفورد للفلسفة)."),
          bi("A person is the heir of their own actions (Anguttara Nikaya 5.57).", "الإنسان وارث أعماله (أنغوتارا نيكايا 5.57)."),
          bi("Nirvana is described as unborn and unmade, an escape from all that is born and made (Udana 8.3).", "توصف النيرفانا بأنها غير مولودة وغير مصنوعة، وأنها الخلاص من كل مولود ومصنوع (أودانا 8.3)."),
          bi("The Buddha did not declare what happens to an awakened person after death (Majjhima Nikaya 63).", "لم يبيّن بوذا ما يكون من أمر المستنير بعد موته (مَجّيما نيكايا 63)."),
        ],
        islam: ISLAM.death,
      },
      common: [
        bi("Death comes to everyone, and nothing in this world lasts (Dhammapada 277; Quran 55:26–27).", "الموت يأتي على كل أحد، ولا يدوم شيء في هذه الدنيا (الدامابادا 277؛ الرحمٰن: 26–27)."),
        bi("Actions have results that follow a person beyond death (Anguttara Nikaya 5.57; Quran 99:7–8).", "للأعمال نتائج تتبع صاحبها بعد الموت (أنغوتارا نيكايا 5.57؛ الزلزلة: 7–8)."),
        bi("There is a final peace beyond this world of loss (Udana 8.3; Quran 9:72).", "هناك سلام أخير وراء هذا العالم الفاني (أودانا 8.3؛ التوبة: 72)."),
      ],
      differences: {
        belief: [
          bi("Life is a long round of rebirths, with no first beginning that can be found (Samyutta Nikaya 15.3).", "الحياة دورة طويلة من الولادات، ليس لها بداية أولى يمكن معرفتها (سَميوتا نيكايا 15.3)."),
          bi("The results of actions come by the law of karma, not from a judge. The final goal is not a place but the end of rebirth (Stanford Encyclopedia of Philosophy; Samyutta Nikaya 56.11).", "نتائج الأعمال تأتي بقانون الكارما لا بحكم حاكم. والغاية الأخيرة ليست مكانًا، بل انتهاء تكرار الولادة (موسوعة ستانفورد للفلسفة؛ سَميوتا نيكايا 56.11)."),
        ],
        islam: [
          bi("Islam teaches that each person lives once, and that there is no return to this world after death (Quran 23:99–100).", "يعلّم الإسلام أن الإنسان يعيش مرة واحدة، وأنه لا رجوع إلى الدنيا بعد الموت (المؤمنون: 99–100)."),
          bi("Islam teaches that God raises people and judges them with justice, and that the believers live for ever in His approval (Quran 21:47; 9:72).", "يعلّم الإسلام أن الله يبعث الناس ويحاسبهم بالعدل، وأن المؤمنين يخلدون في رضوانه (الأنبياء: 47؛ التوبة: 72)."),
        ],
      },
      faq: [FAQ.rebirth, FAQ.reason, FAQ.fear],
      sources: {
        belief: [SEP_BUDDHA, BBC_BUDDHISM, SN_56_11, SN_15_3, AN_5_57, UDANA_8_3, MN_63, DHP_276, DAWA_BUDDHISM, DORAR_BUDDHIST_TEACHING],
        islam: refs(...ISLAM_REFS.death, quran("55:26–27"), quran("23:99–100"), quran("2:28"), quran("19:66–67"), quran("45:21–22"), quran("32:17"), quran("39:53")),
      },
    },

    "sikhism.god": {
      overview: {
        belief: [bi(
          "Sikhs believe in one God, the Creator. The Sikh scripture opens with the words Ik Oankar, which affirm that there is one God (Sikh Coalition; Guru Granth Sahib, p. 1). Sikhs often call God Waheguru (Sikh Coalition; Dorar Encyclopedia).",
          "يؤمن السيخ بإله واحد هو الخالق. ويفتتح كتابهم المقدس بعبارة «إك أونكار»، وهي إقرار بأن الإله واحد (التحالف السيخي؛ غورو غرانث صاحب، ص 1). ويسمّي السيخ الإله غالبًا «واهي غورو» (التحالف السيخي؛ موسوعة الدرر السنية).",
        )],
        islam: [bi(
          "Islam starts from the same belief: God is one, with no partner and no equal, and nothing is like Him (Quran 112:1–4; 42:11). This belief is called tawhid, which means the oneness of God.",
          "ينطلق الإسلام من الإيمان نفسه: الله واحد لا شريك له ولا مثيل، وليس كمثله شيء (الإخلاص: 1–4؛ الشورى: 11). ويُسمّى هذا الاعتقاد التوحيد، أي إفراد الله بالألوهية.",
        )],
      },
      beliefs: {
        belief: [
          bi("God is one, the Creator, without fear and without hatred, beyond birth and death, and self-existent (Guru Granth Sahib, p. 1).", "الإله واحد، هو الخالق، لا يخاف ولا يُبغض، منزَّه عن الولادة والموت، قائم بذاته (غورو غرانث صاحب، ص 1)."),
          bi("God has no form and no gender (BBC; Dorar Encyclopedia).", "الإله لا صورة له ولا جنس (بي بي سي؛ موسوعة الدرر السنية)."),
          bi("Everyone has direct access to God, and everyone is equal before God (BBC).", "لكل إنسان أن يصل إلى الإله مباشرة، والناس سواء أمامه (بي بي سي)."),
          bi("God is inside every person, and can be experienced through love, worship and contemplation (BBC).", "الإله في داخل كل إنسان، ويُدرَك بالمحبة والعبادة والتأمل (بي بي سي)."),
        ],
        islam: ISLAM.oneGod,
      },
      common: [
        bi("There is one God, the Creator, who was not born and does not die (Guru Granth Sahib, p. 1; Quran 112:1–4).", "الإله واحد، هو الخالق، لم يولد ولا يموت (غورو غرانث صاحب، ص 1؛ الإخلاص: 1–4)."),
        bi("God has no form, and images of Him are not worshipped (BBC; Dorar Encyclopedia; Quran 42:11).", "الإله لا صورة له، ولا تُعبد له تماثيل (بي بي سي؛ موسوعة الدرر السنية؛ الشورى: 11)."),
        bi("Everyone can turn to God directly, with no priest in between (BBC; Sikh Coalition; Quran 2:186).", "لكل إنسان أن يتوجّه إلى الإله مباشرة بلا كاهن بينهما (بي بي سي؛ التحالف السيخي؛ البقرة: 186)."),
        bi("God is close to each person. The Quran says He is nearer to a person than the jugular vein (BBC; Quran 50:16).", "الإله قريب من كل إنسان، والقرآن يذكر أنه أقرب إلى الإنسان من حبل الوريد (بي بي سي؛ ق: 16)."),
      ],
      differences: {
        belief: [
          bi("God is within every person, and the final goal is union with God: to become one with Him (BBC).", "الإله في داخل كل إنسان، والغاية الأخيرة الاتحاد به، أي أن يصير الإنسان واحدًا معه (بي بي سي)."),
          bi("God's grace is reached with the help of the Guru (Guru Granth Sahib, p. 1; Dorar Encyclopedia).", "تُنال نعمة الإله بمعونة «الغورو»، أي المعلّم الروحي (غورو غرانث صاحب، ص 1؛ موسوعة الدرر السنية)."),
        ],
        islam: [
          bi("Islam teaches that God is near to people, yet distinct from His creation: nothing is like Him, and no one becomes Him (Quran 50:16; 42:11).", "يعلّم الإسلام أن الله قريب من الناس، وهو مع ذلك غير خلقه: ليس كمثله شيء، ولا يصير أحد إيّاه (ق: 16؛ الشورى: 11)."),
          bi("Islam teaches that people come to know God through His messengers, the last of whom is Muhammad (Quran 16:36; 33:40).", "يعلّم الإسلام أن الناس يعرفون الله عن طريق رسله، وخاتمهم محمد ﷺ (النحل: 36؛ الأحزاب: 40)."),
        ],
      },
      faq: [
        {
          id: "same-god",
          q: bi("Do Sikhs and Muslims believe in the same one God?", "هل يؤمن السيخ والمسلمون بالإله الواحد نفسه؟"),
          a: bi(
            "Both believe in one Creator who has no form, was not born and does not die (Guru Granth Sahib, p. 1; Quran 112:1–4). They differ on how God is known. Sikhs follow the ten Gurus and the Guru Granth Sahib (Sikh Coalition). Muslims follow the prophets and the Quran (2:136).",
            "كلاهما يؤمن بخالق واحد لا صورة له، لم يولد ولا يموت (غورو غرانث صاحب، ص 1؛ الإخلاص: 1–4). ويختلفان في طريق معرفته: فالسيخ يتّبعون المعلّمين العشرة وكتاب غورو غرانث صاحب (التحالف السيخي)، والمسلمون يتّبعون الأنبياء والقرآن (البقرة: 136).",
          ),
        },
        FAQ.allah,
      ],
      sources: {
        belief: [SIKH_COALITION, GRANTH_1, BBC_SIKH_BELIEFS, DAWA_SIKHISM, DORAR_SIKH_IDEAS],
        islam: refs(...ISLAM_REFS.oneGod, quran("50:16"), quran("16:36"), quran("33:40"), quran("2:136"), TERM_ALLAH),
      },
    },

    "sikhism.sources": {
      overview: {
        belief: [bi(
          "The Sikh scripture is the Guru Granth Sahib. Sikhs treat it as their living Guru: the tenth Guru said that after him the scripture itself would guide the Sikhs (BBC). It holds hymns of the Sikh Gurus and also of teachers from other faiths (Sikh Coalition; Dorar Encyclopedia).",
          "الكتاب المقدس عند السيخ هو «غورو غرانث صاحب». ويعدّه السيخ معلّمهم الحيّ: فقد أوصى المعلّم العاشر أن يكون الكتاب نفسه هو المرشد بعده (بي بي سي). وفيه أناشيد لمعلّمي السيخ ولمعلّمين من أديان أخرى (التحالف السيخي؛ موسوعة الدرر السنية).",
        )],
        islam: INTRO.book,
      },
      beliefs: {
        belief: [
          bi("Sikhism began with Guru Nanak, about five hundred years ago, in Punjab. Nine Gurus followed him (BBC; Sikh Coalition).", "بدأت السيخية بالغورو ناناك قبل نحو خمسمئة سنة في البنجاب، وتبعه تسعة معلّمين (بي بي سي؛ التحالف السيخي)."),
          bi("A Sikh believes in one God, the ten Gurus, the Guru Granth Sahib and the teachings of the ten Gurus (Sikh Coalition).", "يؤمن السيخي بإله واحد، وبالمعلّمين العشرة، وبكتاب غورو غرانث صاحب، وبتعاليم المعلّمين العشرة (التحالف السيخي)."),
          bi("God's message is found in creation, in the lives and words of the Gurus, and in scripture (BBC).", "رسالة الإله توجد في الخلق، وفي حياة المعلّمين وكلامهم، وفي الكتاب (بي بي سي)."),
          bi("The Sikh Gurus taught that there are many ways to connect with God, and that the Sikh way is one of them (Sikh Coalition).", "علّم معلّمو السيخ أن طرق الاتصال بالإله كثيرة، وأن طريق السيخ واحد منها (التحالف السيخي)."),
        ],
        islam: ISLAM.book,
      },
      common: [
        bi("God guides people through teachers and through scripture (BBC; Quran 4:163).", "الإله يهدي الناس بمعلّمين وبكتاب (بي بي سي؛ النساء: 163)."),
        bi("Anyone may read the scripture and think about it (Sikh Coalition; Quran 4:82).", "لكل أحد أن يقرأ الكتاب ويتدبّره (التحالف السيخي؛ النساء: 82)."),
      ],
      differences: {
        belief: [
          bi("Guidance came through ten Gurus, from Guru Nanak to Guru Gobind Singh, and now comes through the Guru Granth Sahib (Sikh Coalition; BBC).", "جاءت الهداية عن طريق عشرة معلّمين، من ناناك إلى غوبند سينغ، وهي الآن في كتاب غورو غرانث صاحب (التحالف السيخي؛ بي بي سي)."),
          bi("There are many paths to God (Sikh Coalition).", "الطرق إلى الإله كثيرة (التحالف السيخي)."),
        ],
        islam: [
          bi("Islam teaches that Muhammad is the last of the prophets, and that God completed the religion with him (Quran 33:40; 5:3).", "يعلّم الإسلام أن محمدًا ﷺ خاتم النبيين، وأن الله أكمل به الدين (الأحزاب: 40؛ المائدة: 3)."),
          bi("Islam teaches that the Quran is God's own word, not the words of a human teacher, and that God guards it (Quran 10:37; 15:9).", "يعلّم الإسلام أن القرآن كلام الله، لا كلام معلّم من البشر، وأن الله تكفّل بحفظه (يونس: 37؛ الحجر: 9)."),
        ],
      },
      faq: [
        {
          id: "nanak",
          q: bi("How does Islam see Guru Nanak?", "كيف ينظر الإسلام إلى الغورو ناناك؟"),
          a: bi(
            "The Quran came long before Guru Nanak, so it does not speak about him. Islam teaches that Muhammad is the last of the prophets (33:40). So Muslims do not count later teachers as prophets. They also hold that no one may be forced in religion (2:256).",
            "نزل القرآن قبل ناناك بزمن طويل، فلم يذكره. ويعلّم الإسلام أن محمدًا ﷺ خاتم النبيين (الأحزاب: 40)، فلا يعدّ المسلمون من جاء بعده من المعلّمين أنبياء. وهم يؤمنون كذلك بأنه لا إكراه في الدين (البقرة: 256).",
          ),
        },
        FAQ.preserved,
        FAQ.author,
      ],
      sources: {
        belief: [BBC_SIKHISM, BBC_SIKH_BELIEFS, SIKH_COALITION, DAWA_SIKHISM, DORAR_SIKH_BOOKS],
        islam: refs(...ISLAM_REFS.book, quran("4:82"), quran("33:40"), quran("5:3"), quran("2:256"), quran("2:23")),
      },
    },

    "sikhism.life": {
      overview: {
        belief: [bi(
          "Sikhs believe that people live in a cycle of birth, life and rebirth, and that the quality of each life depends on karma, the law of actions (BBC; Dorar Encyclopedia). The aim of life is to grow close to God and, by His grace, to be freed from this cycle. This freedom is called mukti (BBC).",
          "يؤمن السيخ بأن الإنسان يعيش في دورة من الولادة والحياة ثم الولادة من جديد، وأن حال كل حياة يتوقف على «الكارما»، أي قانون الأعمال (بي بي سي؛ موسوعة الدرر السنية). وغاية الحياة القرب من الإله، ثم التحرّر من هذه الدورة بنعمته، ويُسمّى هذا التحرّر «الموكتي» (بي بي سي).",
        )],
        islam: INTRO.human,
      },
      beliefs: {
        belief: [
          bi("A good life joins belief and action: keep God in mind, work honestly and share with others (BBC).", "الحياة الصالحة تجمع الإيمان والعمل: اذكر الإله، واعمل بأمانة، وشارك غيرك (بي بي سي)."),
          bi("Self-centred pride, called haumai, hides God from people (BBC).", "الكِبر والأنانية، ويُسمّيان «هَوماي»، يحجبان الإله عن الإنسان (بي بي سي)."),
          bi("All people are equal, whatever their caste, religion, race or sex (Sikh Coalition; Dorar Encyclopedia).", "الناس متساوون، أيًّا كانت طبقتهم أو دينهم أو عرقهم أو جنسهم (التحالف السيخي؛ موسوعة الدرر السنية)."),
          bi("Liberation comes by God's grace. It is not something a person can earn (BBC).", "التحرّر يكون بنعمة الإله، وليس شيئًا يكسبه الإنسان (بي بي سي)."),
        ],
        islam: ISLAM.human,
      },
      common: [
        bi("Life is a chance to come close to God (Sikh Coalition; Quran 51:56).", "الحياة فرصة للقرب من الله (التحالف السيخي؛ الذاريات: 56)."),
        bi("All people are equal before God (BBC; Quran 49:13).", "الناس سواء أمام الله (بي بي سي؛ الحجرات: 13)."),
        bi("Pride is a barrier, and humility is praised (BBC; Quran 25:63).", "الكِبر حجاب، والتواضع ممدوح (بي بي سي؛ الفرقان: 63)."),
        bi("No one succeeds without God's mercy (BBC; Quran 39:53).", "لا ينجو أحد بغير رحمة الله (بي بي سي؛ الزمر: 53)."),
      ],
      differences: {
        belief: [
          bi("A soul passes through many lives until it is freed (BBC).", "تمرّ الروح بحيوات كثيرة إلى أن تتحرّر (بي بي سي)."),
          bi("The goal is union with God (BBC).", "الغاية الاتحاد بالإله (بي بي سي)."),
        ],
        islam: [
          bi("Islam teaches that each person lives once on earth, dies, and is raised to meet God (Quran 2:28).", "يعلّم الإسلام أن الإنسان يعيش على الأرض مرة واحدة، ثم يموت، ثم يُبعث ليلقى الله (البقرة: 28)."),
          bi("Islam teaches that the goal is God's approval and a life near Him for ever, while He remains the Creator and we His creatures (Quran 9:72; 42:11).", "يعلّم الإسلام أن الغاية رضوان الله وحياة خالدة في جواره، وهو الخالق ونحن خلقه (التوبة: 72؛ الشورى: 11)."),
        ],
      },
      faq: [FAQ.equality, FAQ.karma, FAQ.purpose],
      sources: {
        belief: [BBC_SIKH_BELIEFS, BBC_SIKHISM, SIKH_COALITION, DAWA_SIKHISM, DORAR_SIKH_IDEAS],
        islam: refs(...ISLAM_REFS.human, quran("49:13"), quran("25:63"), quran("2:28"), quran("9:72"), quran("42:11"), quran("4:1"), quran("99:7–8"), quran("21:47"), quran("23:115")),
      },
    },

    "sikhism.practice": {
      overview: {
        belief: [bi(
          "Sikh life rests on three duties: keep God in mind at all times, earn an honest living, and share with others (BBC). Sikhs worship in a gurdwara, where everyone is welcome (BBC; Sikh Coalition).",
          "تقوم حياة السيخي على ثلاثة واجبات: ذكر الإله في كل وقت، وكسب الرزق بأمانة، ومشاركة الآخرين (بي بي سي). ويتعبّد السيخ في «الغوردوارا»، وهو مفتوح لكل الناس (بي بي سي؛ التحالف السيخي).",
        )],
        islam: INTRO.worship,
      },
      beliefs: {
        belief: [
          bi("Service to others, called seva, is a way of serving God (BBC).", "خدمة الناس، وتُسمّى «السيفا»، طريق لخدمة الإله (بي بي سي)."),
          bi("Langar: every gurdwara has a free kitchen where all people eat together as equals (Sikh Coalition).", "اللنغر: في كل غوردوارا مطبخ مجّاني يأكل فيه الناس معًا سواسية (التحالف السيخي)."),
          bi("Initiated Sikhs wear five articles of faith, among them uncut hair, and Sikh men wear a turban (Sikh Coalition; Dorar Encyclopedia).", "يلتزم السيخي المُكرَّس بخمس علامات دينية، منها ترك الشعر بلا قصّ، ويلبس رجال السيخ العمامة (التحالف السيخي؛ موسوعة الدرر السنية)."),
          bi("Alcohol and other intoxicants are not allowed (Sikh Coalition).", "الخمر وسائر المسكرات ممنوعة (التحالف السيخي)."),
          bi("Sikhs try to overcome five vices: lust, greed, attachment to this world, anger and pride (BBC).", "يجتهد السيخي في التغلّب على خمس رذائل: الشهوة، والطمع، والتعلّق بالدنيا، والغضب، والكِبر (بي بي سي)."),
        ],
        islam: ISLAM.worship,
      },
      common: [
        bi("Remembering God through the day (BBC; Quran 13:28).", "ذكر الله طوال اليوم (بي بي سي؛ الرعد: 28)."),
        bi("Earning an honest living (BBC; Quran 2:188).", "كسب الرزق بالحلال (بي بي سي؛ البقرة: 188)."),
        bi("Giving, and feeding people for God's sake (Sikh Coalition; Quran 76:8–9).", "الإنفاق وإطعام الناس لوجه الله (التحالف السيخي؛ الإنسان: 8–9)."),
        bi("No alcohol (Sikh Coalition; Quran 5:90).", "اجتناب الخمر (التحالف السيخي؛ المائدة: 90)."),
        bi("Control of anger (BBC; Quran 3:134).", "كظم الغيظ (بي بي سي؛ آل عمران: 134)."),
      ],
      differences: {
        belief: [
          bi("Sikhs do not follow ritual rules about food, such as kosher or halal (Sikh Coalition).", "لا يلتزم السيخ بأحكام شعائرية في الطعام، كالكوشر عند اليهود أو الحلال عند المسلمين (التحالف السيخي)."),
          bi("Sikhs hold that rituals done without meaning have no value (BBC).", "يرى السيخ أن الشعائر الخالية من المعنى لا قيمة لها (بي بي سي)."),
        ],
        islam: [
          bi("Islam teaches set acts of worship given by God: daily prayers, fasting in Ramadan and pilgrimage (Quran 20:14; 2:183; 3:97).", "يعلّم الإسلام عبادات محدّدة شرعها الله: الصلوات اليومية، وصوم رمضان، والحج (طه: 14؛ البقرة: 183؛ آل عمران: 97)."),
          bi("Islam teaches that these acts have an inner purpose: prayer is for remembering God, and fasting is for growing in God-consciousness (Quran 20:14; 2:183).", "يعلّم الإسلام أن لهذه العبادات غاية في القلب: فالصلاة لذكر الله، والصيام لتحصيل التقوى (طه: 14؛ البقرة: 183)."),
        ],
      },
      faq: [
        {
          id: "food",
          q: bi("Why do Muslims have rules about food?", "لماذا عند المسلمين أحكام في الطعام؟"),
          a: bi(
            "Islam allows what is good and wholesome and forbids a few things, such as pork and wine (5:3; 5:90). The aim is not the ritual itself. The Quran says that what reaches God from an offering is not its meat or its blood, but the devotion of the person (22:37).",
            "يبيح الإسلام الطيبات ويحرّم أشياء قليلة، كلحم الخنزير والخمر (المائدة: 3؛ المائدة: 90). وليست الغاية الشعيرة لذاتها، فالقرآن يذكر أن الذي يصل إلى الله من القربان ليس لحمه ولا دمه، بل تقوى صاحبه (الحج: 37).",
          ),
        },
        FAQ.rituals,
        FAQ.rules,
      ],
      sources: {
        belief: [BBC_SIKH_BELIEFS, BBC_SIKHISM, SIKH_COALITION, DAWA_SIKHISM, DORAR_SIKH_IDEAS],
        islam: refs(...ISLAM_REFS.worship, quran("13:28"), quran("2:188"), quran("76:8–9"), quran("5:90"), quran("3:134"), quran("5:3"), quran("22:37"), quran("2:177")),
      },
    },

    "sikhism.afterlife": {
      overview: {
        belief: [bi(
          "Sikhs are taught to focus on their deeds in this life and on union with God, more than on heaven and hell (Sikh Coalition). Sikh scripture supports the idea of rebirth: a person meets the results of their deeds, and God's grace also decides (Sikh Coalition).",
          "يُعلَّم السيخ أن يهتمّوا بأعمالهم في هذه الحياة وبالاتحاد بالإله أكثر من اهتمامهم بالجنة والنار (التحالف السيخي). وكتابهم يؤيّد فكرة تكرار الولادة: فالإنسان يلقى نتائج أعماله، ونعمة الإله لها أثرها كذلك (التحالف السيخي).",
        )],
        islam: INTRO.hereafter,
      },
      beliefs: {
        belief: [
          bi("Karma takes account of a person's good and bad actions (Sikh Coalition).", "الكارما تحسب للإنسان أعماله الحسنة والسيئة (التحالف السيخي)."),
          bi("Human beings pass through a cycle of birth, life and rebirth (BBC; Dorar Encyclopedia).", "يمرّ الإنسان بدورة من الولادة والحياة ثم الولادة من جديد (بي بي سي؛ موسوعة الدرر السنية)."),
          bi("The way out of the cycle is full knowledge of God and union with Him, called mukti (BBC).", "الخروج من هذه الدورة يكون بمعرفة الإله معرفة تامة والاتحاد به، وهو «الموكتي» (بي بي سي)."),
        ],
        islam: ISLAM.hereafter,
      },
      common: [
        bi("Deeds in this life have results after it (Sikh Coalition; Quran 99:7–8).", "لأعمال هذه الحياة نتائج بعدها (التحالف السيخي؛ الزلزلة: 7–8)."),
        bi("No one succeeds without God's grace and mercy (BBC; Quran 39:53).", "لا ينجو أحد بغير فضل الله ورحمته (بي بي سي؛ الزمر: 53)."),
        bi("This life is the chance to turn to God (Sikh Coalition; Quran 67:2).", "هذه الحياة فرصة الرجوع إلى الله (التحالف السيخي؛ الملك: 2)."),
      ],
      differences: {
        belief: [
          bi("A soul is reborn until it reaches union with God (BBC).", "تولد الروح مرة بعد مرة إلى أن تبلغ الاتحاد بالإله (بي بي سي)."),
          bi("Heaven and hell are not the main focus (Sikh Coalition).", "الجنة والنار ليستا محور الاهتمام (التحالف السيخي)."),
        ],
        islam: [
          bi("Islam teaches that there is one life on earth and no return to it. After death comes a barrier until the Day of Resurrection (Quran 23:99–100).", "يعلّم الإسلام أن الحياة على الأرض واحدة ولا رجوع إليها، وأن بعد الموت برزخًا، أي حاجزًا، إلى يوم البعث (المؤمنون: 99–100)."),
          bi("Islam teaches that Paradise and the Fire are real, and that God judges every soul with full justice (Quran 3:185; 21:47).", "يعلّم الإسلام أن الجنة والنار حق، وأن الله يحاسب كل نفس بالعدل التام (آل عمران: 185؛ الأنبياء: 47)."),
        ],
      },
      faq: [FAQ.rebirth, FAQ.heaven, FAQ.who],
      sources: {
        belief: [SIKH_COALITION, BBC_SIKH_BELIEFS, DAWA_SIKHISM, DORAR_SIKH_IDEAS],
        islam: refs(...ISLAM_REFS.hereafter, quran("39:53"), quran("67:2"), quran("23:99–100"), quran("2:28"), quran("9:72"), quran("1:4")),
      },
    },

    "agnosticism.god": {
      overview: {
        belief: [bi(
          "An agnostic neither believes that there is a God nor believes that there is none (Stanford Encyclopedia of Philosophy). Many agnostics add that the question cannot be settled: the existence of God can be neither proved nor disproved (Digital Dawah Repository).",
          "اللاأدري لا يعتقد أن الله موجود، ولا يعتقد أنه غير موجود (موسوعة ستانفورد للفلسفة). ويضيف كثير من اللاأدريين أن المسألة لا تُحسم: فوجود الله لا يمكن إثباته ولا نفيه (المستودع الدعوي الرقمي).",
        )],
        islam: INTRO.creator,
      },
      beliefs: {
        belief: [
          bi("The word was coined by the biologist T. H. Huxley in the nineteenth century (Stanford Encyclopedia of Philosophy; Huxley, “Agnosticism”).", "وضع هذه الكلمة عالم الأحياء توماس هنري هكسلي في القرن التاسع عشر (موسوعة ستانفورد للفلسفة؛ هكسلي، «اللاأدرية»)."),
          bi("For Huxley, agnosticism is not a creed but a method: follow reason as far as it goes (Huxley, “Agnosticism”).", "اللاأدرية عند هكسلي ليست عقيدة بل منهج: اتبع العقل إلى حيث يصل (هكسلي، «اللاأدرية»)."),
          bi("Do not treat a conclusion as certain when it has not been shown (Huxley, “Agnosticism”).", "لا تجعل النتيجة يقينًا وهي لم تثبت (هكسلي، «اللاأدرية»)."),
          bi("Agnosticism is about what a person knows. Atheism is about what a person believes (American Atheists).", "اللاأدرية تتعلق بما يعلمه الإنسان، والإلحاد يتعلق بما يؤمن به (منظمة الملحدين الأمريكيين)."),
        ],
        islam: ISLAM.creator,
      },
      common: [
        bi("Do not claim to know what you do not know (Huxley, “Agnosticism”; Quran 17:36).", "لا تدّعِ علم ما لا تعلم (هكسلي، «اللاأدرية»؛ الإسراء: 36)."),
        bi("Follow the evidence honestly. The Quran asks those who make a claim to bring their proof (Huxley, “Agnosticism”; Quran 2:111).", "اتبع الدليل بأمانة. والقرآن يطالب صاحب الدعوى ببرهانه (هكسلي، «اللاأدرية»؛ البقرة: 111)."),
        bi("People must be free to think and to choose (Declaration of Modern Humanism; Quran 2:256).", "للناس حرية التفكير والاختيار (إعلان الإنسانية الحديثة؛ البقرة: 256)."),
      ],
      differences: {
        belief: [
          bi("Judgement is suspended: the evidence is held to be too weak, for God and against God (Stanford Encyclopedia of Philosophy).", "يُعلَّق الحكم: فالدليل في نظر اللاأدري غير كافٍ، لا للإثبات ولا للنفي (موسوعة ستانفورد للفلسفة)."),
          bi("Some hold that these questions lie beyond what the human mind can reach (Digital Dawah Repository).", "يرى بعضهم أن هذه المسائل فوق ما يدركه عقل الإنسان (المستودع الدعوي الرقمي)."),
        ],
        islam: [
          bi("Islam teaches that there is enough evidence to decide: God shows His signs in the world and within people themselves, until the truth becomes clear (Quran 41:53).", "يعلّم الإسلام أن الدليل كافٍ للحكم: فالله يُري الناس آياته في الآفاق وفي أنفسهم حتى يتبيّن لهم الحق (فصلت: 53)."),
          bi("Islam teaches that reason reaches the Creator by a simple step: things did not come from nothing, and did not create themselves (Quran 52:35).", "يعلّم الإسلام أن العقل يصل إلى الخالق بخطوة يسيرة: الأشياء لم تأتِ من لا شيء، ولم تخلق نفسها (الطور: 35)."),
        ],
      },
      faq: [
        {
          id: "certainty",
          q: bi("Do I need to be certain before I can start?", "هل يلزمني اليقين قبل أن أبدأ؟"),
          a: bi(
            "No. The Quran speaks to people who are thinking, and asks them to look at the signs (41:53; 2:164). It says there is no compulsion in religion (2:256). You can read, ask and reflect at your own pace. A good first step is the question the Quran itself asks: were we created by nothing? (52:35)",
            "لا. فالقرآن يخاطب من يفكّرون، ويدعوهم إلى النظر في الآيات (فصلت: 53؛ البقرة: 164). ويقرّر أنه لا إكراه في الدين (البقرة: 256). فلك أن تقرأ وتسأل وتتأمل على مهلك. وأحسن بداية هي السؤال الذي يطرحه القرآن نفسه: هل خُلقنا من غير شيء؟ (الطور: 35)",
          ),
        },
        FAQ.whoMadeGod,
        FAQ.science,
      ],
      sources: {
        belief: [SEP, HUXLEY, AMERICAN_ATHEISTS, DECLARATION, DAWA_ATHEISM],
        islam: refs(...ISLAM_REFS.creator, quran("17:36"), quran("2:111"), quran("2:256"), quran("41:53"), BOOK_UNCREATED, quran("29:20"), quran("39:9"), quran("51:56")),
      },
    },

    "agnosticism.sources": {
      overview: {
        belief: [bi(
          "Agnosticism has no scripture. Its starting point is a rule about knowledge: follow reason and evidence, and do not claim more than they show (Huxley, “Agnosticism”). Humanists, who may be atheists or agnostics, trust the scientific method to understand the world (Humanists UK).",
          "ليس للاأدرية كتاب مقدس. ومنطلقها قاعدة في المعرفة: اتبع العقل والدليل، ولا تدّعِ أكثر ممّا يثبتانه (هكسلي، «اللاأدرية»). والإنسانيون، وهم ملحدون أو لاأدريون، يثقون بالمنهج العلمي في فهم العالم (جمعية الإنسانيين في بريطانيا).",
        )],
        islam: INTRO.knowing,
      },
      beliefs: {
        belief: [
          bi("What is unproven today may be proven tomorrow by new discoveries (Huxley, “Agnosticism”).", "ما لم يثبت اليوم قد يثبت غدًا باكتشافات جديدة (هكسلي، «اللاأدرية»)."),
          bi("It is wrong to say you know or believe something without good evidence (Stanford Encyclopedia of Philosophy).", "من الخطأ أن تقول إنك تعلم شيئًا أو تؤمن به بلا دليل كافٍ (موسوعة ستانفورد للفلسفة)."),
          bi("Knowledge grows through observation, learning and rethinking (Declaration of Modern Humanism).", "المعرفة تنمو بالملاحظة والتعلّم وإعادة النظر (إعلان الإنسانية الحديثة)."),
        ],
        islam: ISLAM.knowing,
      },
      common: [
        bi("Do not hold a belief without knowledge (Huxley, “Agnosticism”; Quran 17:36).", "لا يصح اعتقاد شيء بغير علم (هكسلي، «اللاأدرية»؛ الإسراء: 36)."),
        bi("Ask for proof (Stanford Encyclopedia of Philosophy; Quran 2:111).", "طالب بالبرهان (موسوعة ستانفورد للفلسفة؛ البقرة: 111)."),
        bi("Learning never ends. The Quran teaches this prayer: my Lord, increase me in knowledge (Declaration of Modern Humanism; Quran 20:114).", "التعلّم لا ينتهي، والقرآن يعلّم هذا الدعاء: ربِّ زدني علمًا (إعلان الإنسانية الحديثة؛ طه: 114)."),
      ],
      differences: {
        belief: [
          bi("Only what reason and evidence can show counts as knowledge, so claims of revelation are left undecided (Huxley, “Agnosticism”).", "لا يُعدّ علمًا إلا ما يثبته العقل والدليل، ولذلك تُترك دعاوى الوحي بلا حكم (هكسلي، «اللاأدرية»)."),
        ],
        islam: [
          bi("Islam teaches that revelation is a source of knowledge beside reason and the senses (Quran 4:165; 2:2–3).", "يعلّم الإسلام أن الوحي مصدر للمعرفة مع العقل والحواس (النساء: 165؛ البقرة: 2–3)."),
          bi("Islam teaches that human knowledge is limited, so God told people what they could not discover alone (Quran 17:85; 4:165).", "يعلّم الإسلام أن علم الإنسان محدود، ولذلك أخبر الله الناس بما لا يصلون إليه وحدهم (الإسراء: 85؛ النساء: 165)."),
        ],
      },
      faq: [FAQ.blindFaith, FAQ.check, FAQ.reasonFirst],
      sources: {
        belief: [HUXLEY, SEP, HUMANISTS_UK, DECLARATION],
        islam: refs(...ISLAM_REFS.knowing, quran("20:114"), quran("17:85"), quran("2:164"), quran("2:23"), quran("52:35"), atheistDialogue("2–3")),
      },
    },

    "agnosticism.life": {
      overview: {
        belief: [bi(
          "Agnosticism does not teach a purpose of life: it is only a position on what can be known about God (Stanford Encyclopedia of Philosophy). Humanists, who may be agnostics, hold that people give their own lives meaning, by seeking happiness and helping others (Humanists UK).",
          "اللاأدرية لا تعلّم غاية للحياة، فهي موقف من إمكان معرفة الله فقط (موسوعة ستانفورد للفلسفة). والإنسانيون، ومنهم لاأدريون، يرون أن الناس يمنحون حياتهم معنى بالسعي إلى السعادة ومساعدة الآخرين (جمعية الإنسانيين في بريطانيا).",
        )],
        islam: INTRO.purpose,
      },
      beliefs: {
        belief: [
          bi("No purpose of the universe can be made out (Humanists UK).", "لا تظهر للكون غاية يمكن تبيّنها (جمعية الإنسانيين في بريطانيا)."),
          bi("People can give their own lives meaning (Humanists UK).", "للناس أن يمنحوا حياتهم معناها (جمعية الإنسانيين في بريطانيا)."),
          bi("Every person has worth and dignity, and the freedom to choose (Declaration of Modern Humanism).", "لكل إنسان قيمة وكرامة، وله حرية الاختيار (إعلان الإنسانية الحديثة)."),
        ],
        islam: ISLAM.purpose,
      },
      common: [
        bi("Every human being has dignity (Declaration of Modern Humanism; Quran 17:70).", "لكل إنسان كرامة (إعلان الإنسانية الحديثة؛ الإسراء: 70)."),
        bi("A good life includes care for other people (Declaration of Modern Humanism; Quran 16:90).", "الحياة الطيبة تشمل الإحسان إلى الناس (إعلان الإنسانية الحديثة؛ النحل: 90)."),
        bi("People are free to choose (Declaration of Modern Humanism; Quran 76:3).", "الإنسان حرّ في اختياره (إعلان الإنسانية الحديثة؛ الإنسان: 3)."),
      ],
      differences: {
        belief: [
          bi("With no sure knowledge of God, no purpose from God can be relied on. Meaning is made by people (Humanists UK).", "ما دام العلم بالله غير متيقَّن، فلا يُعتمد على غاية من عنده، والمعنى يصنعه الناس (جمعية الإنسانيين في بريطانيا)."),
        ],
        islam: [
          bi("Islam teaches that the One who made us also told us why (Quran 51:56).", "يعلّم الإسلام أن الذي خلقنا أخبرنا لماذا خلقنا (الذاريات: 56)."),
          bi("Islam teaches that people were not created without purpose, and that they return to God (Quran 23:115).", "يعلّم الإسلام أن الناس لم يُخلقوا عبثًا، وأنهم راجعون إلى الله (المؤمنون: 115)."),
        ],
      },
      faq: [
        {
          id: "undecided",
          q: bi("Is it enough to stay undecided?", "هل يكفي أن أبقى بلا قرار؟"),
          a: bi(
            "Islam respects honest searching: the Quran asks people to think and to look for proof (2:111; 41:53). It also says that life is a test and that it ends (67:2; 3:185). So Islam invites a person to keep searching, and not to leave the biggest question of life unanswered.",
            "يحترم الإسلام البحث الصادق: فالقرآن يدعو الناس إلى التفكير وطلب البرهان (البقرة: 111؛ فصلت: 53). ويذكر كذلك أن الحياة اختبار وأنها تنتهي (الملك: 2؛ آل عمران: 185). فالإسلام يدعو الإنسان إلى مواصلة البحث، وألا يترك أكبر أسئلة الحياة بلا جواب.",
          ),
        },
        FAQ.worship,
        FAQ.human,
      ],
      sources: {
        belief: [SEP, HUMANISTS_UK, DECLARATION],
        islam: refs(...ISLAM_REFS.purpose, quran("16:90"), quran("76:3"), quran("2:111"), quran("41:53"), quran("3:185"), quran("39:53")),
      },
    },

    "agnosticism.practice": {
      overview: {
        belief: [bi(
          "Agnosticism is a view about knowledge, not a religion, so it has no worship and no moral code of its own (Stanford Encyclopedia of Philosophy). Humanists, who may be agnostics, base their ethics on reason, empathy and concern for people and other animals that can feel (Humanists UK).",
          "اللاأدرية رأي في المعرفة وليست دينًا، فليس فيها عبادة ولا نظام أخلاقي خاص بها (موسوعة ستانفورد للفلسفة). والإنسانيون، ومنهم لاأدريون، يبنون أخلاقهم على العقل والتعاطف والاهتمام بالناس وبسائر الحيوانات التي تحسّ (جمعية الإنسانيين في بريطانيا).",
        )],
        islam: INTRO.ethics,
      },
      beliefs: {
        belief: [
          bi("Ethical choices are made with reason, empathy and concern for others (Humanists UK).", "تُتخذ القرارات الأخلاقية بالعقل والتعاطف والاهتمام بالآخرين (جمعية الإنسانيين في بريطانيا)."),
          bi("Morality comes from the fact that living beings can suffer and can flourish (Declaration of Modern Humanism).", "مصدر الأخلاق أن الكائنات الحية تتألم وتزدهر (إعلان الإنسانية الحديثة)."),
          bi("Honesty of mind is itself a duty: do not pretend to be sure (Huxley, “Agnosticism”).", "الأمانة العقلية واجب في نفسها: لا تتظاهر باليقين (هكسلي، «اللاأدرية»)."),
        ],
        islam: ISLAM.ethics,
      },
      common: [
        bi("Honesty about what we know (Huxley, “Agnosticism”; Quran 17:36).", "الصدق في حدود ما نعلم (هكسلي، «اللاأدرية»؛ الإسراء: 36)."),
        bi("Doing good to other people is a duty (Declaration of Modern Humanism; Quran 16:90).", "الإحسان إلى الناس واجب (إعلان الإنسانية الحديثة؛ النحل: 90)."),
        bi("Helping people in need is part of a good life (Humanists UK; Quran 2:177).", "مساعدة المحتاجين من صميم الحياة الطيبة (جمعية الإنسانيين في بريطانيا؛ البقرة: 177)."),
      ],
      differences: {
        belief: [
          bi("Ethics rest on human reason and empathy, with no command from God (Humanists UK).", "تقوم الأخلاق على عقل الإنسان وتعاطفه، دون أمر من الله (جمعية الإنسانيين في بريطانيا)."),
        ],
        islam: [
          bi("Islam teaches that God both placed the sense of right and wrong in people and commanded what is just (Quran 91:7–8; 16:90).", "يعلّم الإسلام أن الله غرس في الإنسان الإحساس بالخير والشر، وأمره كذلك بالعدل (الشمس: 7–8؛ النحل: 90)."),
          bi("Islam teaches that every deed, even the smallest, will be seen by the one who did it (Quran 99:7–8).", "يعلّم الإسلام أن كل عمل مهما صغر سيراه صاحبه (الزلزلة: 7–8)."),
        ],
      },
      faq: [FAQ.goodWithoutGod, FAQ.rituals, FAQ.force],
      sources: {
        belief: [SEP, HUMANISTS_UK, DECLARATION, HUXLEY],
        islam: refs(...ISLAM_REFS.ethics, quran("17:36"), quran("99:7–8"), quran("51:56"), quran("2:183"), quran("2:256"), quran("60:8")),
      },
    },

    "agnosticism.afterlife": {
      overview: {
        belief: [bi(
          "An agnostic usually says: I do not know what follows death. Huxley wrote that he neither denied nor affirmed that the human soul lives on. He saw no reason to believe it, and no means of disproving it (Huxley, letter of 1860).",
          "يقول اللاأدري في الغالب: لا أدري ما يكون بعد الموت. وقد كتب هكسلي أنه لا ينفي بقاء نفس الإنسان بعد الموت ولا يثبته، فهو لا يرى سببًا للإيمان به، ولا يملك وسيلة لنفيه (هكسلي، رسالة عام 1860).",
        )],
        islam: INTRO.death,
      },
      beliefs: {
        belief: [
          bi("Life after death is neither affirmed nor denied (Huxley, letter of 1860).", "الحياة بعد الموت لا تُثبَت ولا تُنفى (هكسلي، رسالة عام 1860)."),
          bi("Belief should wait for evidence strong enough to justify it (Huxley, letter of 1860).", "ينبغي أن ينتظر الإيمان دليلًا قويًّا يسوّغه (هكسلي، رسالة عام 1860)."),
          bi("Humanists, who may be agnostics, seek meaning in this life (Humanists UK).", "الإنسانيون، ومنهم لاأدريون، يطلبون المعنى في هذه الحياة (جمعية الإنسانيين في بريطانيا)."),
        ],
        islam: ISLAM.death,
      },
      common: [
        bi("Death comes to everyone, so the time we have is precious (Humanists UK; Quran 3:185).", "الموت يأتي على كل أحد، فالوقت الذي لنا ثمين (جمعية الإنسانيين في بريطانيا؛ آل عمران: 185)."),
        bi("How we live matters (Humanists UK; Quran 67:2).", "المهمّ كيف نعيش (جمعية الإنسانيين في بريطانيا؛ الملك: 2)."),
        bi("The question deserves an honest answer, not a guess (Huxley, letter of 1860; Quran 17:36).", "هذه المسألة تستحق جوابًا صادقًا لا ظنًّا (هكسلي، رسالة عام 1860؛ الإسراء: 36)."),
      ],
      differences: {
        belief: [
          bi("What happens after death is left open, because it cannot be tested (Huxley, letter of 1860).", "يُترك أمر ما بعد الموت مفتوحًا، لأنه لا يمكن اختباره (هكسلي، رسالة عام 1860)."),
        ],
        islam: [
          bi("Islam teaches that what comes after death is known through revelation: God will give life again, and all return to Him (Quran 2:28).", "يعلّم الإسلام أن ما بعد الموت يُعرف بالوحي: فالله يحيي الناس من جديد ثم إليه يُرجعون (البقرة: 28)."),
          bi("Islam teaches that those who do evil and those who believe and do good are not treated the same, in life or in death (Quran 45:21–22).", "يعلّم الإسلام أن من يعمل السيئات لا يستوي مع من آمن وعمل الصالحات، لا في الحياة ولا في الممات (الجاثية: 21–22)."),
        ],
      },
      faq: [
        {
          id: "no-one-returned",
          q: bi("No one has come back from death. How can anyone know?", "لم يرجع أحد من الموت، فكيف يعرف أحد؟"),
          a: bi(
            "Islam agrees that we cannot test this ourselves. It teaches that the One who created life told us what follows it, through His messengers (4:165). The Quran also argues from what we can see: the One who gave life the first time can give it again (36:78–79).",
            "يوافق الإسلام على أننا لا نستطيع اختبار ذلك بأنفسنا. ويعلّم أن الذي خلق الحياة أخبرنا بما بعدها عن طريق رسله (النساء: 165). ويستدلّ القرآن كذلك بما نراه: فالذي أحيا أول مرة قادر على أن يحيي مرة أخرى (يس: 78–79).",
          ),
        },
        FAQ.reason,
        FAQ.fear,
      ],
      sources: {
        belief: [HUXLEY_LETTER, HUMANISTS_UK],
        islam: refs(...ISLAM_REFS.death, quran("67:2"), quran("17:36"), quran("2:28"), quran("45:21–22"), quran("4:165"), quran("19:66–67"), quran("32:17"), quran("39:53")),
      },
    },
  },
};
