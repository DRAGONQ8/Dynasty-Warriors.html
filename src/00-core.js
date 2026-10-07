
(() => {
  'use strict';
  /* Veyrath uses Babylon left-handed coordinates: Y up, +Z actor forward.
   Orbit camera yaw 0 is behind at -Z; positive movement X is world east. */
  const BUILD = '2.0.0',
    B = BABYLON,
    $ = id => document.getElementById(id),
    clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp = (a, b, t) => a + (b - a) * t,
    dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    angle = (x, z) => Math.atan2(x, z),
    wrap = a => Math.atan2(Math.sin(a), Math.cos(a)),
    rnd = (() => {
      let s = 0x72b61;
      const f = () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296
      };
      f.reset = n => s = n >>> 0;
      return f
    })(),
    fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const HEROES = [{
    id: 'kareth',
    style: 0,
    name: 'كارث',
    weapon: 'السيف العريض',
    hp: 360,
    speed: 6.4,
    dmg: 26,
    reach: 3,
    arc: 1.35,
    chain: 6,
    duration: .36,
    color: '#59d0ba',
    skills: ['شق الصدع', 'حماية الراية'],
    ultimate: 'سقوط الفجر',
    passive: 'الصدّ المتقن يقوّي الضربة الثقيلة التالية.',
    cd: [7, 12]
  }, {
    id: 'seyra',
    style: 1,
    name: 'سيرا',
    weapon: 'الرمح',
    hp: 320,
    speed: 6.8,
    dmg: 22,
    reach: 4.5,
    arc: .44,
    chain: 6,
    duration: .32,
    color: '#dad7b1',
    skills: ['اندفاع خارق', 'دوامة الريح'],
    ultimate: 'تشكيل شق السماء',
    passive: 'طرف الرمح يضاعف ضرر التوازن.',
    cd: [8, 10]
  }, {
    id: 'nivara',
    style: 2,
    name: 'نيفارا',
    weapon: 'النصلان',
    hp: 280,
    speed: 7.4,
    dmg: 17,
    reach: 2.2,
    arc: 1.2,
    chain: 6,
    duration: .25,
    color: '#af9ecb',
    skills: ['خطوة الحجاب', 'مدار النصال'],
    ultimate: 'عاصفة زجاج الليل',
    passive: 'تفادٍ قريب يمنح الضربة التالية حاسمة.',
    cd: [7, 11]
  }, {
    id: 'torvek',
    style: 3,
    name: 'تورفيك',
    weapon: 'الفأس الثقيل',
    hp: 440,
    speed: 5.7,
    dmg: 40,
    reach: 3.3,
    arc: 1.4,
    chain: 6,
    duration: .55,
    color: '#d8a774',
    skills: ['مطرقة الفالق', 'تقدّم الحديد'],
    ultimate: 'تاج الانهيار',
    passive: 'الثقيل المشحون يكسر الدروع والحواجز.',
    cd: [9, 12]
  }, {
    id: 'daeron',
    style: 1,
    name: 'دايرون',
    weapon: 'رمح الهلال',
    hp: 345,
    speed: 6.5,
    dmg: 25,
    reach: 4.4,
    arc: 1.25,
    chain: 6,
    duration: .37,
    color: '#70c9ed',
    skills: ['قوس الهلال', 'حصاد القمر'],
    ultimate: 'مدار الهلال',
    passive: 'طرف الهلال يقوّي كسر التوازن ويعيد طاقة إضافية.',
    cd: [8, 12]
  }, {
    id: 'maelis',
    style: 0,
    name: 'ميليس',
    weapon: 'السيف والدرع',
    hp: 400,
    speed: 6.1,
    dmg: 25,
    reach: 2.9,
    arc: 1.25,
    chain: 6,
    duration: .38,
    color: '#f1b15d',
    skills: ['اندفاع الدرع', 'عهد الحماية'],
    ultimate: 'ميثاق الشمس',
    passive: 'صدّ أقوى؛ الصدّ المتقن يعيد ٢٠ طاقة.',
    cd: [7, 13]
  }];
  const HERO_DETAILS = [["مقاتل متوازن", "سيف حلف الفجر؛ يستعيد الرايات بالصدّ والهجوم المضاد.", -1, "counter"], ["قائدة الرماح", "تقود تشكيلات الرمح وتفتح مسار الحلف عبر الصفوف.", -1, "reach"], ["مبارزة سريعة", "كشافة الحلف؛ تراهن على التفادي والنصال المتلاحقة.", 0, "evade"], ["كاسر الحصون", "قوة حصار الفجر؛ فأسه تفتح الطريق عبر الحديد.", 1, "breaker"], ["قائد الهلال", "حارس جسور فيراث؛ يصل بين سرعة الرمح واتساع النصل.", -1, "reach"], ["حامية الحلف", "حاملة عهد الشمس؛ درعها يجمع الصفوف حول الراية.", -1, "guard"]];
  HEROES.forEach((h, i) => Object.assign(h, {role: HERO_DETAILS[i][0], lore: HERO_DETAILS[i][1], unlockStage: HERO_DETAILS[i][2], passiveKind: HERO_DETAILS[i][3]}));
  HEROES.push(...[
  {
    "id": "valen",
    "style": 0,
    "name": "فالين",
    "weapon": "سيف التنين",
    "hp": 375,
    "speed": 6.7,
    "dmg": 28,
    "reach": 3.2,
    "arc": 1.4,
    "chain": 6,
    "duration": 0.34,
    "color": "#76dca9",
    "skills": [
      "شق الطليعة",
      "تركيز الحارس"
    ],
    "ultimate": "نصل التنين",
    "passive": "الصدّ المتقن يفتح ضربة مضادة أقوى ويجدد الطاقة.",
    "cd": [
      8,
      13
    ],
    "skillProfile": "vanguard",
    "passiveKind": "counter",
    "role": "قائد الطليعة",
    "lore": "حارس المرافئ الذي يحمل نصل الحلف إلى خط المعركة الأول.",
    "unlockStage": 2
  },
  {
    "id": "lyss",
    "style": 2,
    "name": "ليس",
    "weapon": "نصلا الصيد",
    "hp": 300,
    "speed": 7.7,
    "dmg": 20,
    "reach": 2.4,
    "arc": 1.25,
    "chain": 6,
    "duration": 0.24,
    "color": "#badcf4",
    "skills": [
      "وثبة الصياد",
      "حلقة المطاردة"
    ],
    "ultimate": "شظايا القمر",
    "passive": "التفادي القريب يمنح ضربة حاسمة ويعيد بعض الطاقة.",
    "cd": [
      7,
      11
    ],
    "skillProfile": "hunter",
    "passiveKind": "evade",
    "role": "قائدة الكشافة",
    "lore": "متعقبة مستنقع المرآة؛ تتسلل بين الصفوف وتقطع خطوط الإمداد.",
    "unlockStage": 3
  },
  {
    "id": "sahir",
    "style": 1,
    "name": "ساهر",
    "weapon": "رمح الرعد",
    "hp": 355,
    "speed": 6.9,
    "dmg": 26,
    "reach": 4.8,
    "arc": 0.8,
    "chain": 6,
    "duration": 0.33,
    "color": "#f1ce78",
    "skills": [
      "طعنة البرق",
      "دوامة الرعد"
    ],
    "ultimate": "حكم العاصفة",
    "passive": "إصابة طرف الرمح تضعف التوازن وتجدد الطاقة.",
    "cd": [
      8,
      12
    ],
    "skillProfile": "tempest",
    "passiveKind": "reach",
    "role": "قائد فرسان الواحة",
    "lore": "حارس طرق الملح؛ يقود الفرسان من الآبار إلى بوابات الرمال.",
    "unlockStage": 4
  },
  {
    "id": "brynja",
    "style": 3,
    "name": "برينيا",
    "weapon": "فأس القمم",
    "hp": 465,
    "speed": 5.9,
    "dmg": 43,
    "reach": 3.5,
    "arc": 1.5,
    "chain": 6,
    "duration": 0.52,
    "color": "#8bbfe5",
    "skills": [
      "صدع الجبل",
      "عهد الحديد"
    ],
    "ultimate": "سقوط القمة",
    "passive": "الضربات الثقيلة المشحونة تحطم الحواجز وتكسر التوازن.",
    "cd": [
      10,
      14
    ],
    "skillProfile": "breaker",
    "passiveKind": "breaker",
    "role": "قائدة الحرس الجبلي",
    "lore": "قائدة حرس السلاسل الشمالية؛ تستقبل الجيوش بدرع لا يلين.",
    "unlockStage": 5
  },
  {
    "id": "oriel",
    "style": 0,
    "name": "أورييل",
    "weapon": "سيف الراية ودرع الشمس",
    "hp": 425,
    "speed": 6.3,
    "dmg": 27,
    "reach": 3,
    "arc": 1.35,
    "chain": 6,
    "duration": 0.36,
    "color": "#ed8f80",
    "skills": [
      "صدمة الدرع",
      "راية الحياة"
    ],
    "ultimate": "شمس الحلف",
    "passive": "الصدّ المتقن يعيد الطاقة؛ مهارة الراية تشفي الحلفاء القريبين.",
    "cd": [
      8,
      15
    ],
    "skillProfile": "guardian",
    "passiveKind": "guard",
    "role": "حامية رايات الحلف",
    "lore": "قائدة حلف الفجر؛ تعيد الصفوف إلى القتال حين تتهاوى المعنويات.",
    "unlockStage": 6
  },
  {
    "id": "riven",
    "style": 2,
    "name": "ريفن",
    "weapon": "خنجرا العاصفة",
    "hp": 315,
    "speed": 7.8,
    "dmg": 22,
    "reach": 2.5,
    "arc": 1.3,
    "chain": 6,
    "duration": 0.23,
    "color": "#c59cef",
    "skills": [
      "اندفاع الظل",
      "حجاب العاصفة"
    ],
    "ultimate": "ليلة ألف نصل",
    "passive": "التفادي القريب يفتح ضربة حاسمة؛ الحجاب يقوّي سلسلة النصال.",
    "cd": [
      7,
      12
    ],
    "skillProfile": "storm",
    "passiveKind": "evade",
    "role": "قائد حرس الظلال",
    "lore": "آخر كشافة تاج الرماد؛ عاد إلى الحلف ليقود الهجوم الأخير.",
    "unlockStage": 7
  }
]);
  const TYPES = {
    raider: {
      hp: 65,
      dmg: 12,
      range: 1.8,
      speed: 3.1,
      wind: .65
    },
    shield: {
      hp: 80,
      dmg: 14,
      range: 2,
      speed: 2.8,
      wind: .8
    },
    pike: {
      hp: 65,
      dmg: 15,
      range: 3.5,
      speed: 2.7,
      wind: .85
    },
    archer: {
      hp: 55,
      dmg: 10,
      range: 17,
      speed: 2.5,
      wind: 1.2
    },
    captain: {
      hp: 190,
      dmg: 24,
      range: 2.8,
      speed: 3.1,
      wind: .8
    },
    sentinel: {
      hp: 750,
      dmg: 35,
      range: 4.5,
      speed: 3.2,
      wind: 1.1
    },
    duelist: {
      hp: 650,
      dmg: 28,
      range: 2.7,
      speed: 4.3,
      wind: .6
    },
    warcaller: {
      hp: 700,
      dmg: 24,
      range: 3.6,
      speed: 2.9,
      wind: 1
    },
    odran: {
      hp: 1450,
      dmg: 48,
      range: 4,
      speed: 3.3,
      wind: 1.3
    },
    azrakan: {
      hp: 2800,
      dmg: 50,
      range: 5.5,
      speed: 3.6,
      wind: 1.2
    },
    commander: {
      hp: 1800,
      dmg: 25,
      range: 3,
      speed: 2.7,
      wind: .75
    },
    bearer: {
      hp: 1100,
      dmg: 10,
      range: 2,
      speed: 3.6,
      wind: 1
    }
  };
  Object.assign(TYPES, {
  "valkora": {
    "hp": 1250,
    "dmg": 31,
    "range": 3.1,
    "speed": 4.4,
    "wind": 0.68,
    "archetype": "duelist",
    "elite": true,
    "phases": 2,
    "phaseThresholds": [
      0.5
    ],
    "posture": 210,
    "tactics": "سريعة: تفادَ الاندفاع جانبياً ثم عاقب فترة الاسترداد.",
    "lore": "فالكورا، أدميرالة المد؛ تتحكم في أبراج الساحل وخطوط المرافئ."
  },
  "mirelord": {
    "hp": 1500,
    "dmg": 30,
    "range": 4,
    "speed": 3.1,
    "wind": 1.05,
    "archetype": "warcaller",
    "elite": true,
    "phases": 2,
    "phaseThresholds": [
      0.5
    ],
    "posture": 230,
    "tactics": "اترك دائرة الموجة؛ حرّر مخزن الأعشاب لقطع التعزيزات.",
    "lore": "سيراث، سيد المستنقع؛ يجمع فرق الرماد حول منارات الضباب."
  },
  "sandwarden": {
    "hp": 1750,
    "dmg": 39,
    "range": 4.7,
    "speed": 3.5,
    "wind": 1.12,
    "archetype": "sentinel",
    "elite": true,
    "phases": 2,
    "phaseThresholds": [
      0.5
    ],
    "posture": 280,
    "tactics": "اكسر التوازن بالشحن؛ لا تبقَ أمام درعه أثناء المسح.",
    "lore": "قادر، حارس الرمال؛ أقام حصناً حول آخر آبار طريق الملح."
  },
  "frostthane": {
    "hp": 2150,
    "dmg": 44,
    "range": 4.2,
    "speed": 3.5,
    "wind": 1.15,
    "archetype": "odran",
    "elite": true,
    "phases": 2,
    "phaseThresholds": [
      0.5
    ],
    "posture": 310,
    "boss": true,
    "tactics": "اترك خط الاندفاع؛ بعد نصف الحياة تتسع سلسلة هجماته.",
    "lore": "هالدريك، ملك الصقيع؛ يقود الحرس الحديدي فوق سلاسل الشتاء."
  },
  "cindermarshal": {
    "hp": 3250,
    "dmg": 52,
    "range": 5.5,
    "speed": 3.7,
    "wind": 1.15,
    "archetype": "azrakan",
    "elite": true,
    "phases": 3,
    "phaseThresholds": [
      0.66,
      0.33
    ],
    "posture": 440,
    "boss": true,
    "tactics": "ثلاث مراحل: احفظ الطاقة للصدّ والتفادي واقطع إمداد البطارية.",
    "lore": "ڤاروس، سيّد التاج المحترق؛ آخر مارشالات الرماد وحارس قلب الصدع."
  }
});
  const NAMES = {
    captain: 'قائد الحامية',
    sentinel: 'حارس الراية — الرقيب',
    duelist: 'راثا — المبارزة',
    warcaller: 'مُنادي الرماد',
    odran: 'أودران • كاسر الجسر',
    azrakan: 'أزراكان • مارشال الرماد',
    commander: 'قائد الفجر',
    bearer: 'حامل الراية',
    valkora: 'فالكورا • أدميرالة المد',
    mirelord: 'سيراث • سيّد المستنقع',
    sandwarden: 'قادر • حارس الرمال',
    frostthane: 'هالدريك • ملك الصقيع',
    cindermarshal: 'ڤاروس • سيّد التاج المحترق'
  };
  const STAGES = [{
    name: 'زحف سهل الجمر',
    subtitle: 'EMBERFIELD ADVANCE',
    w: 180,
    h: 160,
    limit: 720,
    par: 450,
    night: false,
    brief: 'استعد شبكة الرايات. اكسر التشكيل، واستولِ على مخيم الإمداد لفتح الجسر. احمِ قائد الفجر ثم اقتحم حصن التل.',
    points: [
      [0, -56],
      [-12, -26],
      [12, 3],
      [0, 39],
      [-47, -12]
    ],
    bases: ['مخيم الإمداد', 'موقع الجسر', 'راية حصن التل', 'مخيم الرماة'],
    nodes: ['اكسر التشكيل واهزم قائد مخيم الإمداد', 'استولِ على مخيم الإمداد لفتح الجسر', 'صدّ الالتفاف عن قائد الفجر', 'اعبر الجسر واهزم الرقيب', 'استولِ على راية حصن التل']
  }, {
    name: 'ممر المشاعل',
    subtitle: 'LANTERN PASS',
    w: 200,
    h: 120,
    limit: 840,
    par: 540,
    night: true,
    brief: 'رافق حامل الراية عبر الممر. أوقف مُنادي الرماد، واحمِ مخيم المشاعل. اكسر حاجز أودران ثم انسحب إلى راية الاستخراج.',
    points: [
      [-73, -12],
      [-38, -12],
      [-5, 13],
      [30, -10],
      [76, -10]
    ],
    bases: ['مرصد المُنادي', 'مخيم المشاعل', 'حاجز أودران', 'راية الاستخراج'],
    nodes: ['رافق حامل الراية إلى العلامة الأولى', 'اهزم مُنادي الرماد واستولِ على المرصد', 'رافق الراية إلى مخيم المشاعل', 'دافع عن المخيم حتى تنتهي الموجة', 'اهزم أودران واكسر حاجز الجسر', 'رافق حامل الراية إلى راية الاستخراج']
  }, {
    name: 'حصار تاج الصدع',
    subtitle: 'SIEGE OF THE RIFT CROWN',
    w: 190,
    h: 180,
    limit: 960,
    par: 630,
    night: false,
    brief: 'حرّر ساحة الحصار. اقتل قائد البوابة وشغّل الرافعة. احمِ القائد في الفناء، واهزم المبارزة لفتح تاج الصدع. أزراكان ينتظر في الداخل.',
    points: [
      [0, -65],
      [-18, -35],
      [0, -7],
      [0, 23],
      [0, 62]
    ],
    bases: ['ساحة الحصار', 'دار البوابة', 'الفناء الخارجي', 'تاج الصدع'],
    nodes: ['استولِ على ساحة الحصار', 'اهزم قائد البوابة', 'شغّل رافعة البوابة قرب العلامة', 'احمِ القائد في الفناء الخارجي', 'اهزم المبارزة لفتح الفناء الأخير', 'اهزم أزراكان • مارشال الرماد']
  }];
  const STAGE_DETAILS = [{"theme": "grassland", "landscape": "grassland", "chapter": "الفصل الأول — تحرير فيراث", "recommendedLevel": 1, "victory": "هزيمة الرقيب ورفع راية حصن التل.", "defenseDuration": 105}, {"theme": "lantern", "landscape": "lantern", "chapter": "الفصل الأول — تحرير فيراث", "recommendedLevel": 3, "victory": "بلوغ حامل الراية منطقة الاستخراج بعد فك الحصار.", "defenseDuration": 85}, {"theme": "citadel", "landscape": "citadel", "chapter": "الفصل الأول — تحرير فيراث", "recommendedLevel": 5, "victory": "هزيمة أزراكان مع بقاء قائد الفجر حياً.", "defenseDuration": 100}];
  STAGES.forEach((stage, i) => Object.assign(stage, STAGE_DETAILS[i]));
  STAGES[1].points.push([-48, 24]);
  STAGES[1].bases.push('مخيم الحرس الخلفي');
  STAGES[1].brief += ' حرّر مخيم الحرس الخلفي الاختياري لتجديد حامل الراية واستدعاء فرقة حماية.';
  STAGES.push(...[
  {
    "name": "حرب ساحل التنين",
    "subtitle": "DRAGON COAST",
    "w": 220,
    "h": 180,
    "limit": 1200,
    "par": 750,
    "night": false,
    "theme": "coast",
    "landscape": "coast",
    "layout": "coast",
    "chapter": "الفصل الثاني — تحالف السواحل",
    "recommendedLevel": 7,
    "victory": "هزيمة فالكورا • أدميرالة المد ورفع راية حصن التنين مع بقاء قائد الفجر حياً.",
    "brief": "استعد مرفأ الحلف وبرج المد. رافق قائد الفجر إلى البرج وصدّ إنزال الأسطول، ثم حرّر الرصيف وواجه فالكورا. مخزن الأشرعة الاختياري يقطع احتياط العدو ويرسل حرساً حليفاً.",
    "points": [
      [
        -80,
        -55
      ],
      [
        -45,
        -20
      ],
      [
        0,
        -6
      ],
      [
        45,
        24
      ],
      [
        72,
        60
      ],
      [
        -64,
        40
      ]
    ],
    "bases": [
      "مرفأ الحلف",
      "برج المد",
      "رصيف الأسطول",
      "حصن التنين",
      "مخزن الأشرعة"
    ],
    "nodes": [
      "استولِ على مرفأ الحلف",
      "اهزم حارس برج المد",
      "ارفع راية برج المد",
      "احمِ قائد الفجر من إنزال الأسطول",
      "حرّر رصيف الأسطول",
      "اهزم فالكورا • أدميرالة المد",
      "ارفع راية حصن التنين"
    ],
    "campaign": {
      "strongholds": [
        {
          "point": 1,
          "type": "captain",
          "count": 34,
          "optional": false,
          "officerName": "مرفأ الحلف — قائد الحامية"
        },
        {
          "point": 2,
          "type": "sentinel",
          "count": 38,
          "optional": false,
          "officerName": "برج المد — ضابط الحرس"
        },
        {
          "point": 3,
          "type": "captain",
          "count": 34,
          "optional": false,
          "officerName": "رصيف الأسطول — قائد الاحتياط"
        },
        {
          "point": 4,
          "type": "valkora",
          "count": 42,
          "optional": false,
          "officerName": null
        },
        {
          "point": 5,
          "type": "captain",
          "count": 22,
          "optional": true,
          "officerName": "مخزن الأشرعة — أمين الإمداد"
        }
      ],
      "steps": [
        {
          "kind": "capture",
          "base": 0
        },
        {
          "kind": "officer",
          "base": 1
        },
        {
          "kind": "capture",
          "base": 1
        },
        {
          "kind": "defend",
          "base": 1,
          "duration": 80,
          "waves": 3
        },
        {
          "kind": "capture",
          "base": 2
        },
        {
          "kind": "officer",
          "base": 3
        },
        {
          "kind": "capture",
          "base": 3
        }
      ],
      "bossBase": 3,
      "supplyBase": 4,
      "supplyBonus": "reinforce",
      "defenseDuration": 90
    }
  },
  {
    "name": "منارات مستنقع المرآة",
    "subtitle": "MIRROR MARSH",
    "w": 200,
    "h": 200,
    "limit": 1200,
    "par": 750,
    "night": true,
    "theme": "marsh",
    "landscape": "marsh",
    "layout": "marsh",
    "chapter": "الفصل الثاني — طرق الضباب",
    "recommendedLevel": 9,
    "victory": "هزيمة سيراث • سيّد المستنقع ورفع راية حصن المرآة مع بقاء قائد الفجر حياً.",
    "brief": "اقطع إشارات المنارات باستعادة معبر القصب ومنارة الضباب. احمِ راية الحلف أثناء زحف الضباب ثم حرّر جسر الجذور وواجه سيراث. استعادة مخزن الأعشاب تجدد قائد الفجر وتقطع احتياط فرق المستنقع.",
    "points": [
      [
        -62,
        -70
      ],
      [
        -38,
        -28
      ],
      [
        34,
        -20
      ],
      [
        -22,
        30
      ],
      [
        36,
        64
      ],
      [
        70,
        20
      ]
    ],
    "bases": [
      "معبر القصب",
      "منارة الضباب",
      "جسر الجذور",
      "حصن المرآة",
      "مخزن الأعشاب"
    ],
    "nodes": [
      "حرّر معبر القصب",
      "أوقف مُنادي منارة الضباب",
      "استولِ على منارة الضباب",
      "احمِ منارة الضباب وقائد الفجر",
      "اكسر حرس جسر الجذور وارفع الراية",
      "اهزم سيراث • سيّد المستنقع",
      "ارفع راية حصن المرآة"
    ],
    "campaign": {
      "strongholds": [
        {
          "point": 1,
          "type": "captain",
          "count": 34,
          "optional": false,
          "officerName": "معبر القصب — قائد الحامية"
        },
        {
          "point": 2,
          "type": "warcaller",
          "count": 38,
          "optional": false,
          "officerName": "منارة الضباب — ضابط الحرس"
        },
        {
          "point": 3,
          "type": "sentinel",
          "count": 34,
          "optional": false,
          "officerName": "جسر الجذور — قائد الاحتياط"
        },
        {
          "point": 4,
          "type": "mirelord",
          "count": 42,
          "optional": false,
          "officerName": null
        },
        {
          "point": 5,
          "type": "captain",
          "count": 22,
          "optional": true,
          "officerName": "مخزن الأعشاب — أمين الإمداد"
        }
      ],
      "steps": [
        {
          "kind": "capture",
          "base": 0
        },
        {
          "kind": "officer",
          "base": 1
        },
        {
          "kind": "capture",
          "base": 1
        },
        {
          "kind": "defend",
          "base": 1,
          "duration": 90,
          "waves": 4
        },
        {
          "kind": "capture",
          "base": 2
        },
        {
          "kind": "officer",
          "base": 3
        },
        {
          "kind": "capture",
          "base": 3
        }
      ],
      "bossBase": 3,
      "supplyBase": 4,
      "supplyBonus": "reinforce",
      "defenseDuration": 90
    }
  },
  {
    "name": "عاصفة طريق الملح",
    "subtitle": "SALTROAD STORM",
    "w": 220,
    "h": 190,
    "limit": 1380,
    "par": 900,
    "night": false,
    "theme": "desert",
    "landscape": "desert",
    "layout": "desert",
    "chapter": "الفصل الثالث — العرش البعيد",
    "recommendedLevel": 11,
    "victory": "هزيمة قادر • حارس الرمال ورفع راية معبد الرمال مع بقاء قائد الفجر حياً.",
    "brief": "استعد الواحة قبل هجوم فرسان الرمال. احمِ قائد الفجر عند الماء ثم اخضع برج القوافل وممر الحجر. يحرس قادر المعبد الأخير؛ تحرير مخزن القوافل يرسل حرساً إضافياً ويقطع إمداد العدو.",
    "points": [
      [
        -78,
        -62
      ],
      [
        -44,
        -25
      ],
      [
        8,
        -12
      ],
      [
        48,
        18
      ],
      [
        64,
        65
      ],
      [
        -60,
        38
      ]
    ],
    "bases": [
      "واحة النجاة",
      "برج القوافل",
      "ممر الحجر",
      "معبد الرمال",
      "مخزن القوافل"
    ],
    "nodes": [
      "استولِ على واحة النجاة",
      "دافع عن الواحة وقائد الفجر",
      "اهزم كاسر طريق القوافل",
      "ارفع راية برج القوافل",
      "حرّر ممر الحجر",
      "اهزم قادر • حارس الرمال",
      "ارفع راية معبد الرمال"
    ],
    "campaign": {
      "strongholds": [
        {
          "point": 1,
          "type": "captain",
          "count": 34,
          "optional": false,
          "officerName": "واحة النجاة — قائد الحامية"
        },
        {
          "point": 2,
          "type": "odran",
          "count": 38,
          "optional": false,
          "officerName": "برج القوافل — ضابط الحرس"
        },
        {
          "point": 3,
          "type": "captain",
          "count": 34,
          "optional": false,
          "officerName": "ممر الحجر — قائد الاحتياط"
        },
        {
          "point": 4,
          "type": "sandwarden",
          "count": 42,
          "optional": false,
          "officerName": null
        },
        {
          "point": 5,
          "type": "captain",
          "count": 22,
          "optional": true,
          "officerName": "مخزن القوافل — أمين الإمداد"
        }
      ],
      "steps": [
        {
          "kind": "capture",
          "base": 0
        },
        {
          "kind": "defend",
          "base": 0,
          "duration": 85,
          "waves": 4
        },
        {
          "kind": "officer",
          "base": 1
        },
        {
          "kind": "capture",
          "base": 1
        },
        {
          "kind": "capture",
          "base": 2
        },
        {
          "kind": "officer",
          "base": 3
        },
        {
          "kind": "capture",
          "base": 3
        }
      ],
      "bossBase": 3,
      "supplyBase": 4,
      "supplyBonus": "reinforce",
      "defenseDuration": 90
    }
  },
  {
    "name": "حصون سلاسل الشتاء",
    "subtitle": "WINTER CHAINS",
    "w": 210,
    "h": 200,
    "limit": 1380,
    "par": 900,
    "night": true,
    "theme": "frost",
    "landscape": "frost",
    "layout": "frost",
    "chapter": "الفصل الثالث — السلاسل الشمالية",
    "recommendedLevel": 13,
    "victory": "هزيمة هالدريك • ملك الصقيع ورفع راية عرش الصقيع مع بقاء قائد الفجر حياً.",
    "brief": "أعد إشعال رايات الحرس في الجبال. احمِ المخيم ثم اخضع مبارزة المرصد وحارس دار الحديد. هالدريك ينتظر عند عرش الصقيع بهجوم يتغير بعد نصف حياته. مخزن الحطب يمنح الحلف إمداداً وتعزيزات.",
    "points": [
      [
        0,
        -72
      ],
      [
        -36,
        -35
      ],
      [
        34,
        -8
      ],
      [
        -25,
        28
      ],
      [
        22,
        68
      ],
      [
        65,
        -30
      ]
    ],
    "bases": [
      "مخيم الحرس",
      "مرصد الجليد",
      "دار الحديد",
      "عرش الصقيع",
      "مخزن الحطب"
    ],
    "nodes": [
      "حرّر مخيم الحرس",
      "احمِ المخيم حتى تصل التعزيزات",
      "اهزم مبارزة مرصد الجليد",
      "استولِ على مرصد الجليد",
      "حرّر دار الحديد",
      "اهزم هالدريك • ملك الصقيع",
      "ارفع راية عرش الصقيع"
    ],
    "campaign": {
      "strongholds": [
        {
          "point": 1,
          "type": "captain",
          "count": 34,
          "optional": false,
          "officerName": "مخيم الحرس — قائد الحامية"
        },
        {
          "point": 2,
          "type": "duelist",
          "count": 38,
          "optional": false,
          "officerName": "مرصد الجليد — ضابط الحرس"
        },
        {
          "point": 3,
          "type": "sentinel",
          "count": 34,
          "optional": false,
          "officerName": "دار الحديد — قائد الاحتياط"
        },
        {
          "point": 4,
          "type": "frostthane",
          "count": 42,
          "optional": false,
          "officerName": null
        },
        {
          "point": 5,
          "type": "captain",
          "count": 22,
          "optional": true,
          "officerName": "مخزن الحطب — أمين الإمداد"
        }
      ],
      "steps": [
        {
          "kind": "capture",
          "base": 0
        },
        {
          "kind": "defend",
          "base": 0,
          "duration": 95,
          "waves": 4
        },
        {
          "kind": "officer",
          "base": 1
        },
        {
          "kind": "capture",
          "base": 1
        },
        {
          "kind": "capture",
          "base": 2
        },
        {
          "kind": "officer",
          "base": 3
        },
        {
          "kind": "capture",
          "base": 3
        }
      ],
      "bossBase": 3,
      "supplyBase": 4,
      "supplyBonus": "reinforce",
      "defenseDuration": 90
    }
  },
  {
    "name": "سقوط التاج المحترق",
    "subtitle": "THE BURNING CROWN",
    "w": 210,
    "h": 210,
    "limit": 1380,
    "par": 900,
    "night": false,
    "theme": "volcanic",
    "landscape": "volcanic",
    "layout": "volcanic",
    "chapter": "الفصل الأخير — فجر جديد",
    "recommendedLevel": 15,
    "victory": "هزيمة ڤاروس • سيّد التاج المحترق ورفع راية التاج المحترق مع بقاء قائد الفجر حياً.",
    "brief": "استعد معسكر الصدع وعطّل بطارية الرماد. احمِ قائد الفجر من آخر كتائب المارشال، ثم حرّر جسر الحمم واقتحم التاج المحترق. ڤاروس يقاتل عبر ثلاث مراحل؛ استعادة مخزن الحصار تضعف احتياطاته.",
    "points": [
      [
        0,
        -80
      ],
      [
        -32,
        -44
      ],
      [
        32,
        -6
      ],
      [
        -28,
        32
      ],
      [
        0,
        78
      ],
      [
        70,
        36
      ]
    ],
    "bases": [
      "معسكر الصدع",
      "بطارية الرماد",
      "جسر الحمم",
      "التاج المحترق",
      "مخزن الحصار"
    ],
    "nodes": [
      "استولِ على معسكر الصدع",
      "اهزم قائد بطارية الرماد",
      "ارفع راية بطارية الرماد",
      "احمِ قائد الفجر من كتائب المارشال",
      "اكسر حرس جسر الحمم وارفع الراية",
      "اهزم ڤاروس • سيّد التاج المحترق",
      "ارفع راية الفجر فوق التاج المحترق"
    ],
    "campaign": {
      "strongholds": [
        {
          "point": 1,
          "type": "captain",
          "count": 34,
          "optional": false,
          "officerName": "معسكر الصدع — قائد الحامية"
        },
        {
          "point": 2,
          "type": "sentinel",
          "count": 38,
          "optional": false,
          "officerName": "بطارية الرماد — ضابط الحرس"
        },
        {
          "point": 3,
          "type": "odran",
          "count": 34,
          "optional": false,
          "officerName": "جسر الحمم — قائد الاحتياط"
        },
        {
          "point": 4,
          "type": "cindermarshal",
          "count": 42,
          "optional": false,
          "officerName": null
        },
        {
          "point": 5,
          "type": "captain",
          "count": 22,
          "optional": true,
          "officerName": "مخزن الحصار — أمين الإمداد"
        }
      ],
      "steps": [
        {
          "kind": "capture",
          "base": 0
        },
        {
          "kind": "officer",
          "base": 1
        },
        {
          "kind": "capture",
          "base": 1
        },
        {
          "kind": "defend",
          "base": 1,
          "duration": 105,
          "waves": 5
        },
        {
          "kind": "capture",
          "base": 2
        },
        {
          "kind": "officer",
          "base": 3
        },
        {
          "kind": "capture",
          "base": 3
        }
      ],
      "bossBase": 3,
      "supplyBase": 4,
      "supplyBonus": "reinforce",
      "defenseDuration": 90
    }
  }
]);
  const ELITE_PATTERNS = {
    azrakan: [
      ['sweep', 'charge'],
      ['sweep', 'wave', 'charge'],
      ['wave', 'charge', 'sweep', 'wave']
    ],
    odran: [
      ['strike', 'charge'],
      ['sweep', 'charge', 'strike']
    ]
  };
  Object.assign(ELITE_PATTERNS, {
  "valkora": [
    [
      "strike",
      "charge"
    ],
    [
      "charge",
      "sweep",
      "charge"
    ]
  ],
  "mirelord": [
    [
      "wave",
      "strike"
    ],
    [
      "wave",
      "charge",
      "wave"
    ]
  ],
  "sandwarden": [
    [
      "sweep",
      "strike"
    ],
    [
      "sweep",
      "charge",
      "strike"
    ]
  ],
  "frostthane": [
    [
      "strike",
      "charge"
    ],
    [
      "sweep",
      "charge",
      "wave"
    ]
  ],
  "cindermarshal": [
    [
      "sweep",
      "charge"
    ],
    [
      "sweep",
      "wave",
      "charge"
    ],
    [
      "wave",
      "charge",
      "sweep",
      "wave"
    ]
  ]
});
  const ABILITIES = {
    cost: [25, 40],
    shield: 135,
    shieldDuration: 8,
    ironDuration: 7,
    ultimateDuration: 3,
    ultimateRecharge: 10,
    skillDamage: 2,
    ultimateDamage: [4, 4, 2, 4, 3, 3.2, 3.6, 2.2, 3.5, 4.4, 3.2, 2.3],
    ultimatePulses: [3, 3, 9, 3, 5, 4, 4, 8, 5, 3, 4, 9],
    ultimateReach: [10, 13, 10, 10, 11, 9, 11, 10, 14, 12, 11, 10]
  };
  const PRESETS = {
    performance: {
      cap: 80,
      mid: 60,
      far: 120,
      pixels: 1e6,
      dpr: 1,
      particles: 180
    },
    balanced: {
      cap: 120,
      mid: 100,
      far: 180,
      pixels: 1.5e6,
      dpr: 1.25,
      particles: 300
    },
    quality: {
      cap: 160,
      mid: 140,
      far: 240,
      pixels: 8.3e6,
      dpr: 2,
      particles: 450
    }
  };
  const DEFAULT_BIND = {
    light: 2,
    heavy: 3,
    jump: 0,
    dodge: 1,
    interact: 8,
    guard: 4,
    skill1: 5,
    skill2: 7,
    ultimate: 6,
    pause: 9,
    lock: 10,
    cycle: 11
  };
  const DEFAULT_KEYS = {
    light: 'KeyJ',
    heavy: 'KeyK',
    jump: 'Space',
    dodge: 'AltLeft',
    sprint: 'ShiftLeft',
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    guard: 'KeyQ',
    skill1: 'KeyE',
    skill2: 'KeyR',
    ultimate: 'KeyF',
    interact: 'KeyC',
    lock: 'Tab',
    cycle: 'KeyT',
    pause: 'Escape'
  };
