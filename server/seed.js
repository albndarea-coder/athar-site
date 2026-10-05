// المحتوى الابتدائي للموقع — منقول حرفيًا من لقطات الموقع المرجعي.
// الاستثناء الوحيد المقصود: التوقيع أسفل نافذة الهدية (بطلب المالكة).
'use strict';

const SIGNATURE = 'أ.البندري السلمي ث٣٥ بمكة';

function defaultContent() {
  return {
    schema: 1,
    meta: {
      title: 'أثر | رسالة لمعلّم - اليوم العالمي للمعلمين 2026',
      description:
        'منصة إهداءات رقمية تفاعلية لتكريم المعلمين والمعلمات بمناسبة اليوم العالمي للمعلمين 2026 — ' + SIGNATURE,
      author: SIGNATURE,
      ogImage: '',
    },
    theme: {
      fontFamily: 'Tajawal',
      fontCssUrl:
        'https://fonts.googleapis.com/css2?family=Tajawal:wght@200;300;400;500;700;800;900&display=swap',
      colors: {
        bg: '#F7F5F1',
        surface: '#FFFFFF',
        surfaceAlt: '#F1EEE8',
        border: '#E2DACE',
        primary: '#1F3A5F',
        primary2: '#2B4F7B',
        accent: '#B5784A',
        accentDeep: '#8F5A33',
        heading: '#1B3150',
        text: '#33465D',
        muted: '#5D6C82',
        placeholder: '#9EA8B6',
        pillBg: '#E9EDF3',
        onPrimary: '#FFFFFF',
        signature: '#8F5A33',
        success: '#2E7D5B',
        danger: '#C0392B',
      },
    },
    header: {
      badgeText: 'أثر',
      wordmark: 'أَثَـر',
      showLangButton: true,
    },
    nav: [
      { id: 'n-home', label: 'الرئيسية', icon: 'sparkles', target: '#home', hidden: false },
      { id: 'n-write', label: 'اكتب إهداء', icon: 'feather', target: '#write', hidden: false },
      { id: 'n-garden', label: 'حديقة الامتنان', icon: 'heart', target: '#garden', hidden: false },
    ],
    gift: {
      enabled: true,
      badge: 'الهدية الأولى | اليوم العالمي للمعلمين 2026',
      title: 'كلمة إكبار وامتنان',
      lead: 'إلى كل معلم ومعلمة آمنوا بطلابهم، وسعوا لأن يتركوا فيهم أثرًا لا يُنسى…',
      paragraphs: [
        'إلى من أدركوا أن أمامهم عقولًا تستحق أن تُستثمر، وأحلامًا تستحق أن تُرعى، وأن هذا الجيل قادر على أن يصنع الفرق ويكتب مستقبلًا أجمل.',
        'شكرًا لكل من جعل من التعليم رسالة، ومن المعرفة أثرًا، ومن كل طالب قصة نجاح تنتظر أن تبدأ.',
      ],
      quote: '«لأن الأثر الجميل لا ينتهي بانتهاء الدرس، بل يبقى.»',
      closingLead: 'بكل محبة وتقدير،',
      signature: SIGNATURE,
    },
    pages: [
      {
        id: 'p-home',
        slug: '',
        title: 'الرئيسية',
        hidden: false,
        sections: [
          {
            id: 'home',
            type: 'hero',
            hidden: false,
            data: {
              datePillImage: '/assets/poster.png',
              datePillText: '5 أكتوبر 2026 | اليوم العالمي للمعلمين',
              ringText: 'أَثَـر',
              quote: '«الوقوف مع المعلمين، وحماية المهنة، وتعزيز مكانتها، وصناعة المستقبل.»',
              cardText: 'نقف معكم؛ لأن بين أيديكم يبدأ المستقبل،\nوبـ [[أثركم]] تُصنع أجياله.',
              ctaLabel: '🎁 افتح هديتك',
              buttons: [
                { id: 'b1', label: 'اكتب إهداء', icon: 'feather', target: '#write', hidden: false },
                { id: 'b2', label: 'حديقة الامتنان', icon: 'heart', target: '#garden', hidden: false },
              ],
            },
          },
          {
            id: 'write',
            type: 'write',
            hidden: false,
            data: {
              pill: 'اترك بصمتك',
              title: 'اكتب إهداءً لمعلم/معلمة',
              subtitle: 'اكتب رسالة تقدير تبقى في قلب معلمك وفي واحة حديقة الامتنان.',
              step1Title: 'إلى من تهدي أثرك؟',
              singleLabel: 'معلم أو معلمة واحدة',
              groupLabel: 'مجموعة من المعلمين والمعلمات',
              teacherLabel: 'اسم المعلم أو المعلمة',
              teacherPlaceholder: 'مثال: أ. فاطمة الزهراني / أ. أحمد السعيد',
              schoolLabel: 'المدرسة / الجهة (اختياري)',
              schoolPlaceholder: 'مثال: ثانوية الأندلس / مدرسة النور الأهلية',
              countryLabel: 'الدولة (اختياري)',
              countryPlaceholder: 'مثال: المملكة العربية السعودية، مصر، الإمارات...',
              senderLabel: 'اسم صاحب الإهداء (اختياري)',
              senderPlaceholder: 'اسمك الكريم',
              anonymousLabel: 'أرغب أن يظهر إهدائي دون اسم 🤍',
              step2Title: 'اكتب إهداءك',
              helpLabel: '✨ ساعدني في كتابة إهدائي',
              textLabel: 'نص الإهداء',
              textPlaceholder: 'اكتب هنا ما يفيض به قلبك من شكر، دعاء، وامتنان لمعلّمك...',
              maxLength: 500,
              styleLabel: 'اختر شكل هديتك',
              cardStyles: [
                { id: 'ivory-gold', name: 'عاجي + ذهبي', bg: '#FCF7EE', bg2: '', fg: '#244A3C', hidden: false },
                { id: 'royal-green', name: 'أخضر ملكي + ذهبي', bg: '#4F6F62', bg2: '', fg: '#FFFFFF', hidden: false },
                { id: 'warm-ivory', name: 'عاجي وذهب دافئ', bg: '#F4E8D7', bg2: '', fg: '#244A3C', hidden: false },
                { id: 'emerald-satin', name: 'زمردي وساتان ذهبي', bg: '#4A7464', bg2: '#62907C', fg: '#FFFFFF', hidden: false },
                { id: 'navy-gold', name: 'كحلي ملكي وذهبي', bg: '#434F49', bg2: '', fg: '#FFFFFF', hidden: false },
              ],
              swatchText: 'أثر',
              previewLabel: 'معاينة شكل البطاقة',
              whoLabel: 'من أنت؟ (اختياري)',
              whoOptions: ['طالب/طالبة', 'ولي أمر', 'زميل/زميلة', 'أخرى'],
              submitLabel: 'أرسل أثرك',
              successMessage: 'وصل أثرك، وأصبح إهداؤك جزءًا من حديقة الامتنان.',
              pendingMessage: 'وصل أثرك، وسيظهر في حديقة الامتنان بعد المراجعة.',
              suggestions: [
                'شكرًا لأنك آمنت بي قبل أن أؤمن بنفسي، وجعلت من كل درس بابًا لحلم جديد. سيبقى أثرك فيّ ما حييت.',
                'إلى من علّمني أن المعرفة نور وأن الأخلاق تاج؛ جزاك الله عني خير الجزاء، ودمت منارة لكل جيل.',
                'كلماتك ما زالت ترافقني، وصبرك علّمني أن أحاول من جديد. شكرًا من القلب لمعلم صنع الفرق.',
              ],
            },
          },
          {
            id: 'garden',
            type: 'garden',
            hidden: false,
            data: {
              pill: 'واحة الوفاء والتقدير',
              emoji: '🌿',
              title: 'حديقة الامتنان',
              subtitle: 'كلمات صغيرة... لأثر كبير.',
              searchPlaceholder: '🔎 ابحث عن اسم معلم أو معلمة أو مدرسة...',
              filterAll: 'الكل',
              filterMale: 'معلم',
              filterFemale: 'معلمة',
              filterGroup: 'مجموعة',
              allCountries: 'جميع الدول',
              emptyText: 'لا توجد إهداءات بعد.',
              anonymousName: 'محب للمعلمين',
              loadMore: 'عرض المزيد',
            },
          },
        ],
      },
    ],
    settings: {
      moderation: false,
    },
  };
}

module.exports = { defaultContent, SIGNATURE };
