export const INTRODUCTION = {
  shahada: {
    title: { ar: "الشهادتان", en: "The two testimonies of faith" },
    lead: {
      ar: "يدخل الإنسان في الإسلام بالنطق بالشهادتين عن إيمان بمعناهما:",
      en: "To become Muslim, a person declares the two testimonies of faith, sincerely believing in their meaning:",
    },
    declaration: {
      ar: "أشهد أن لا إله إلا الله، وأشهد أن محمدًا رسول الله",
      en: "I bear witness that there is no deity worthy of worship except Allah, and I bear witness that Muhammad is the Messenger of Allah.",
    },
    meaning: {
      ar: "ومعناهما أن الله وحده المستحق للعبادة، وأن محمدًا رسول الله، فنؤمن برسالته ونتّبع ما جاء به.",
      en: "Together, they affirm that Allah alone is worthy of worship, and that Muhammad is His Messenger, whose message and guidance Muslims follow.",
    },
  },
  pillars: {
    title: { ar: "أركان الإسلام الخمسة", en: "The five pillars of Islam" },
    items: [
      { ar: "الشهادتان", en: "The testimonies of faith" },
      { ar: "إقامة الصلاة", en: "Prayer" },
      { ar: "إيتاء الزكاة", en: "Zakah · obligatory giving" },
      { ar: "صوم رمضان", en: "Fasting Ramadan" },
      { ar: "حجّ البيت لمن استطاع", en: "Hajj · pilgrimage for those able" },
    ],
  },
  dailyLife: {
    title: { ar: "الإسلام في الحياة اليومية", en: "Islam in everyday life" },
    body: {
      ar: "الإسلام لا يقتصر على الشعائر، بل يشمل الأخلاق والمعاملات: العدل، ومساعدة الآخرين، والكلمة الطيبة، وإزالة الأذى عن الطريق.",
      en: "Islam extends beyond rituals to character and everyday dealings: being fair, helping others, speaking kindly and removing harm from the way.",
    },
  },
  references: [
    { sourceId: "hadith:henc:66512", label: { ar: "الشهادتان والأركان الخمسة · شرح حديث «بني الإسلام على خمس»", en: "The testimonies and five pillars · Explanation of “Islam is built on five”" }, url: { ar: "https://hadeethenc.com/ar/browse/hadith/66512", en: "https://hadeethenc.com/en/browse/hadith/66512" } },
    { sourceId: "hadith:henc:4568", label: { ar: "الأخلاق والمعاملات · صور الصدقة في الحياة اليومية", en: "Character and everyday dealings · Everyday acts of charity" }, url: { ar: "https://hadeethenc.com/ar/browse/hadith/4568", en: "https://hadeethenc.com/en/browse/hadith/4568" } },
    { sourceId: null, label: { ar: "الدخول في الإسلام · الإيمان بمعنى الشهادتين", en: "Entering Islam · Believing in the meaning of the testimonies" }, url: { ar: "https://binbaz.org.sa/fatwas/1158/وجوب-التصديق-مع-الشهادتين", en: "https://binbaz.org.sa/fatwas/1158/وجوب-التصديق-مع-الشهادتين" } },
    { sourceId: null, label: { ar: "الحج والاستطاعة · سورة آل عمران، الآية 97", en: "Hajj and ability · Quran 3:97" }, url: { ar: "https://quran.com/ali-imran/97", en: "https://quran.com/ali-imran/97" } },
  ],
} as const;

// Short explainers behind the four intro cards. Demo content awaiting scholarly review, like INTRODUCTION.
export const ESSENTIALS = [
  {
    id: "tawhid",
    title: { ar: "التوحيد", en: "Oneness of Allah" },
    label: { ar: "أصل الإيمان", en: "Core belief" },
    intro: { ar: "التوحيد هو الإيمان بأن الله واحد لا شريك له، وهو أساس الإسلام.", en: "Tawhid means believing that Allah is One, with no partner. It is the foundation of Islam." },
    items: [
      { title: { ar: "ربّ واحد", en: "One Lord" }, body: { ar: "الله وحده الخالق المالك المدبّر لكل شيء.", en: "Allah alone creates, owns and runs everything." } },
      { title: { ar: "إله واحد يُعبد", en: "One God to worship" }, body: { ar: "العبادة كلها، من صلاة ودعاء وتوكّل، لله وحده.", en: "All worship, such as prayer, supplication (asking Allah) and trust, is for Allah alone." } },
      { title: { ar: "أسماء وصفات لا تُشبَّه", en: "Names and attributes beyond compare" }, body: { ar: "لله الأسماء الحسنى والصفات العُلا، وليس كمثله شيء.", en: "Allah has the most beautiful names and perfect attributes, and nothing is like Him." } },
    ],
    references: [
      { label: { ar: "سورة الإخلاص", en: "Quran 112 · Al-Ikhlas" }, url: { ar: "https://quran.com/al-ikhlas", en: "https://quran.com/al-ikhlas" } },
      { label: { ar: "سورة الشورى، الآية 11", en: "Quran 42:11" }, url: { ar: "https://quran.com/ash-shura/11", en: "https://quran.com/ash-shura/11" } },
    ],
  },
  {
    id: "islam",
    title: { ar: "أركان الإسلام", en: "Pillars of Islam" },
    label: { ar: "العبادات", en: "Practice" },
    intro: { ar: "بُني الإسلام على خمسة أركان، هي أساس عبادة المسلم.", en: "Islam is built on five pillars. They are the base of a Muslim’s worship." },
    items: [
      { title: INTRODUCTION.pillars.items[0], body: { ar: "أن يشهد المسلم أن لا إله إلا الله وأن محمدًا رسول الله، عن إيمان بمعناهما.", en: "Declaring that no one is worthy of worship except Allah, and that Muhammad is His Messenger, with belief in their meaning." } },
      { title: INTRODUCTION.pillars.items[1], body: { ar: "خمس صلوات في اليوم والليلة، تصل المسلم بربّه طوال يومه.", en: "Five prayers each day and night, keeping a Muslim connected to Allah through the day." } },
      { title: INTRODUCTION.pillars.items[2], body: { ar: "قدر محدّد من المال يُعطى للمستحقين إذا بلغ المال النصاب وحال عليه الحول.", en: "A fixed share of savings given to people in need, once savings stay above a set minimum for a full year." } },
      { title: INTRODUCTION.pillars.items[3], body: { ar: "الإمساك عن المفطرات من طلوع الفجر إلى غروب الشمس في شهر رمضان، طلبًا للتقوى.", en: "Not eating or drinking, among other things, from dawn to sunset in the month of Ramadan, to grow in mindfulness of Allah." } },
      { title: INTRODUCTION.pillars.items[4], body: { ar: "قصد البيت الحرام بمكة لأداء المناسك، مرة في العمر لمن استطاع.", en: "A journey to the Kaaba in Makkah to perform set rites, once in a lifetime for those able." } },
    ],
    references: [INTRODUCTION.references[0], INTRODUCTION.references[3]],
  },
  {
    id: "iman",
    title: { ar: "أركان الإيمان", en: "Pillars of faith" },
    label: { ar: "ستة أصول", en: "Six beliefs" },
    intro: { ar: "أركان الإيمان ستة، بيّنها النبي ﷺ في حديث جبريل عليه السلام.", en: "Faith (iman) rests on six beliefs. The Prophet ﷺ listed them when the angel Jibril (Gabriel) asked him about faith." },
    items: [
      { title: { ar: "الإيمان بالله", en: "Allah" }, body: { ar: "الإيمان بوجود الله ووحدانيته وأسمائه وصفاته.", en: "Believing in Allah, His oneness, and His names and attributes." } },
      { title: { ar: "الإيمان بالملائكة", en: "The angels" }, body: { ar: "مخلوقات من نور، يعبدون الله وينفّذون أمره.", en: "Beings created from light, who worship Allah and carry out His commands." } },
      { title: { ar: "الإيمان بالكتب", en: "The revealed books" }, body: { ar: "الكتب التي أنزلها الله، كالتوراة والإنجيل، وآخرها القرآن.", en: "The scriptures Allah revealed, such as the Torah and the Gospel, and finally the Quran." } },
      { title: { ar: "الإيمان بالرسل", en: "The messengers" }, body: { ar: "الرسل الذين أرسلهم الله لهداية الناس، ومنهم نوح وإبراهيم وموسى وعيسى، وخاتمهم محمد ﷺ.", en: "The messengers Allah sent to guide people, including Noah, Abraham, Moses and Jesus, and the last of them, Muhammad ﷺ." } },
      { title: { ar: "الإيمان باليوم الآخر", en: "The Last Day" }, body: { ar: "البعث بعد الموت، والحساب والجزاء على الأعمال.", en: "Life after death, when every person is raised and answers for their deeds." } },
      { title: { ar: "الإيمان بالقدر", en: "Divine decree (qadar)" }, body: { ar: "الإيمان بأن كل ما يقع هو بعلم الله ومشيئته، خيره وشرّه.", en: "Believing that everything happens by Allah’s knowledge and will, the good and the bad." } },
    ],
    references: [
      { label: { ar: "سورة النساء، الآية 136", en: "Quran 4:136" }, url: { ar: "https://quran.com/an-nisa/136", en: "https://quran.com/an-nisa/136" } },
      { label: { ar: "سورة القمر، الآية 49", en: "Quran 54:49" }, url: { ar: "https://quran.com/al-qamar/49", en: "https://quran.com/al-qamar/49" } },
    ],
  },
  {
    id: "akhlaq",
    title: { ar: "أخلاق المسلم", en: "A Muslim’s character" },
    label: { ar: "الأخلاق والقيم", en: "Character & values" },
    intro: INTRODUCTION.dailyLife.body,
    items: [
      { title: { ar: "الصدق", en: "Honesty" }, body: { ar: "قول الحق والوفاء بالوعد.", en: "Telling the truth and keeping promises." } },
      { title: { ar: "اللطف", en: "Kindness" }, body: { ar: "لين الكلام وحسن معاملة الناس، ولو بابتسامة.", en: "Speaking gently and treating people well, even with a smile." } },
      { title: { ar: "العدل", en: "Justice" }, body: { ar: "الإنصاف مع الجميع، حتى مع من تختلف معه.", en: "Being fair with everyone, even with people you disagree with." } },
      { title: { ar: "الأسرة", en: "Family" }, body: { ar: "برّ الوالدين، ورعاية الأبناء، وصلة الرحم.", en: "Honoring parents, caring for children and keeping family ties." } },
      { title: { ar: "الصدقة", en: "Charity" }, body: { ar: "مساعدة الآخرين بالمال أو الوقت أو الجهد، حتى بإماطة الأذى عن الطريق.", en: "Helping others with money, time or effort, even by removing harm from a path." } },
    ],
    references: [
      INTRODUCTION.references[1],
      { label: { ar: "سورة المائدة، الآية 8", en: "Quran 5:8" }, url: { ar: "https://quran.com/al-maidah/8", en: "https://quran.com/al-maidah/8" } },
    ],
  },
] as const;
