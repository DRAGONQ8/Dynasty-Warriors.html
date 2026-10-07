  // RIFTBANNER 2.0: additive schema-1 migration, relics and a persistent war journal.
  const RELICS = [
    {id:'none', name:'بلا أثر', description:'القيم الأصلية للمقاتل.', requirement:'متاح منذ البداية'},
    {id:'dawnblade', name:'حدّ الفجر', description:'قوة السلاح +٨٪.', requirement:'أكمل زحف سهل الجمر', stage:0, damage:.08},
    {id:'aegis', name:'ميثاق الحارس', description:'الحياة القصوى +١٢٪.', requirement:'أكمل ممر المشاعل', stage:1, hp:.12},
    {id:'focus', name:'عدسة الصدع', description:'استعادة المهارات أسرع بنسبة ١٢٪.', requirement:'أكمل حصار تاج الصدع', stage:2, cooldown:.12},
    {id:'vigor', name:'نبض الواحة', description:'تجدد الطاقة أسرع بنسبة ٣٥٪.', requirement:'أكمل مرحلة الصحراء', stage:5, energyRegen:.35},
    {id:'crown', name:'تاج الرايات', description:'الحياة +٨٪ وقوة السلاح +٦٪.', requirement:'أكمل مرحلة الجليد', stage:6, hp:.08, damage:.06}
  ];
  const ACHIEVEMENTS = [
    {id:'first-light',name:'أول راية',description:'حقق نصراً واحداً.',metric:'wins',target:1},
    {id:'veteran',name:'قائد الجبهة',description:'حقق ١٠ انتصارات.',metric:'wins',target:10},
    {id:'hundred',name:'كاسر الصفوف',description:'أسقط ١٠٠ خصم.',metric:'ko',target:100},
    {id:'thousand',name:'أسطورة الميدان',description:'أسقط ١٠٠٠ خصم.',metric:'ko',target:1000},
    {id:'officers',name:'صائد القادة',description:'اهزم ٢٠ ضابطاً.',metric:'officers',target:20},
    {id:'combo',name:'سلسلة الفجر',description:'حقق تتابعاً من ٥٠ ضربة.',metric:'highCombo',target:50},
    {id:'evasion',name:'خطوة بلا أثر',description:'نفّذ ١٠ تفاديات متقنة.',metric:'perfectDodges',target:10},
    {id:'master',name:'إتقان المعركة',description:'حقق تقييم S.',metric:'sRanks',target:1},
    {id:'campaign',name:'حامل الرايات الثماني',description:'أكمل المراحل الثماني للحملة.',metric:'chapters',target:8},
    {id:'champion',name:'بطل فيراث',description:'طوّر مقاتلاً إلى المستوى ١٠.',metric:'heroLevel',target:10}
  ];
  const heroAvailable = (i, completed) => {
    const h = HEROES[i];
    if (!h) return false;
    const required = Number.isInteger(h.unlockStage) ? h.unlockStage : i === 2 ? 0 : i === 3 ? 1 : null;
    return required === null || required < 0 || completed[required] === true;
  };
  const defaults = () => ({
    schema: 1,
    build: BUILD,
    shards: 0,
    completed: STAGES.map(() => false),
    heroes: HEROES.map(() => ({
      xp: 0,
      level: 1,
      up: [0, 0, 0],
      relic: 'none'
    })),
    career: {battles:0,wins:0,ko:0,officers:0,highCombo:0,sRanks:0,perfectDodges:0},
    achievements: [],
    best: {},
    committed: [],
    selectedHero: 0,
    selectedStage: 0,
    settings: {
      preset: 'balanced',
      frameTarget: 60,
      auto: true,
      scale: 1,
      opacity: .85,
      sensitivity: 1,
      invert: false,
      floating: false,
      touch: 'auto',
      shake: .4,
      master: .65,
      music: .4,
      sfx: .7,
      deadzone: .15,
      threshold: .55,
      keyboard: {
        ...DEFAULT_KEYS
      },
      bindings: {
        ...DEFAULT_BIND
      },
      profiles: {},
      camX: 2,
      camY: 3,
      difficulty: 'normal'
    }
  });
  class SaveService {
    constructor() {
      this.memory = false;
      this.recovered = false;
      this.data = defaults();
      try {
        let raw = localStorage.getItem('riftbanner-save');
        if (raw) {
          try {
            this.data = this.validate(JSON.parse(raw))
          } catch (e) {
            this.recovered = true;
            let backup = localStorage.getItem('riftbanner-backup');
            if (backup) {
              try {
                this.data = this.validate(JSON.parse(backup))
              } catch (_) {}
            }
            console.warn('Invalid save recovered with backup/defaults')
          }
        }
        localStorage.setItem('riftbanner-probe', '1');
        localStorage.removeItem('riftbanner-probe')
      } catch (e) {
        this.memory = true;
        console.warn('Storage unavailable:', e.message)
      }
    }
    validate(o) {
      // Schema one deliberately remains importable. Original four-hero saves
      // gain default records for the new champions without losing progression.
      if (!o || typeof o !== 'object' || o.schema !== 1 || !Array.isArray(o.heroes) || o.heroes.length < 4 || o.heroes.length > 64) throw Error('صيغة حفظ غير متوافقة');
      const finite = (value, fallback = 0) => {
        if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
      };
      const integer = (value, fallback, min, max) => clamp(Math.floor(finite(value, fallback)), min, max);
      const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      let d = defaults();
      d.shards = integer(o.shards, 0, 0, 1e6);
      d.completed = d.completed.map((_, i) => o.completed?.[i] === true);
      d.heroes = d.heroes.map((record, i) => {
        const h = object(o.heroes[i]);
        return {
          xp: clamp(finite(h.xp), 0, 120 + 45 * (integer(h.level, 1, 1, 20) - 1) - 1),
          level: integer(h.level, 1, 1, 20),
          up: [0, 1, 2].map(slot => integer(h.up?.[slot], 0, 0, 3)),
          relic: RELICS.some(r=>r.id===h.relic && (r.stage === undefined || d.completed[r.stage])) ? h.relic : 'none'
        };
      });
      for (const k of Object.keys(d.career)) d.career[k] = integer(o.career?.[k],0,0,1e9);
      d.achievements = Array.isArray(o.achievements) ? ACHIEVEMENTS.filter(a=>o.achievements.includes(a.id)).map(a=>a.id) : [];
      d.selectedHero = integer(o.selectedHero, 0, 0, HEROES.length - 1);
      d.selectedStage = integer(o.selectedStage, 0, 0, STAGES.length - 1);
      if (!heroAvailable(d.selectedHero, d.completed)) d.selectedHero = 0;
      if (d.selectedStage > 0 && !d.completed[d.selectedStage - 1]) d.selectedStage = 0;
      d.committed = Array.isArray(o.committed) ? o.committed.filter(x => typeof x === 'string' && x.length <= 180).slice(-100) : [];
      d.best = Object.fromEntries(Object.entries(object(o.best))
        .filter(([k, v]) => /^(campaign|skirmish)-\d+-(normal|veteran)$/.test(k) && Number(k.split('-')[1]) < STAGES.length && ['S', 'A', 'B', 'C', 'D'].includes(v?.rank))
        .map(([k, v]) => [k, {rank: v.rank, score: integer(v.score, 0, 0, 1e9), time: integer(v.time, 0, 0, 1e6)}]));
      let s = object(o.settings);
      // Additive migration: schema 1 progress and bindings remain compatible.
      // Saves made before the frame target option receive the 60 Hz default.
      if (s.frameTarget === 30 || s.frameTarget === 60) d.settings.frameTarget = s.frameTarget;
      for (let k of ['auto', 'invert', 'floating'])
        if (typeof s[k] === 'boolean') d.settings[k] = s[k];
      for (let [k, a, b] of [
          ['scale', .8, 1.2],
          ['opacity', .35, 1],
          ['sensitivity', .4, 2],
          ['shake', 0, 1],
          ['master', 0, 1],
          ['music', 0, 1],
          ['sfx', 0, 1],
          ['deadzone', .05, .4],
          ['threshold', .4, .8],
          ['camX', 0, 15],
          ['camY', 0, 15]
        ])
        if (Number.isFinite(s[k])) d.settings[k] = clamp(k === 'camX' || k === 'camY' ? Math.floor(s[k]) : s[k], a, b);
      if (typeof s.preset === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, s.preset)) d.settings.preset = s.preset;
      if (['auto', 'show', 'hide'].includes(s.touch)) d.settings.touch = s.touch;
      if (['normal', 'veteran'].includes(s.difficulty)) d.settings.difficulty = s.difficulty;
      const validKey = v => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9]{1,28}$/.test(v);
      for (let k in DEFAULT_KEYS)
        if (validKey(s.keyboard?.[k])) d.settings.keyboard[k] = s.keyboard[k];
      // Version 1.4 adds jump without changing the progress schema. Migrate only
      // legacy default bindings that would otherwise fire jump and dodge/mount together.
      if (!validKey(s.keyboard?.jump) && s.keyboard?.dodge === 'Space') d.settings.keyboard.dodge = DEFAULT_KEYS.dodge;
      const validBind = v => Number.isInteger(v) && v >= 0 && v < 40 || v && typeof v === 'object' && Number.isInteger(v.axis) && v.axis >= 0 && v.axis < 16 && [1, -1].includes(v.sign) && Number.isFinite(v.neutral) && Number.isFinite(v.range) && v.range >= .2 && v.range <= 2;
      for (let k in DEFAULT_BIND)
        if (validBind(s.bindings?.[k])) d.settings.bindings[k] = s.bindings[k];
      if (!validBind(s.bindings?.jump) && s.bindings?.interact === 0) d.settings.bindings.interact = DEFAULT_BIND.interact;
      for (let [sig, p] of Object.entries(object(s.profiles)).slice(0, 20))
        if (/^[a-z0-9-]{1,180}$/.test(sig) && p && typeof p === 'object') {
          let b = {};
          for (let k in DEFAULT_BIND)
            if (validBind(p[k])) b[k] = p[k];
          if (!validBind(p.jump) && p.interact === 0) b.interact = DEFAULT_BIND.interact;
          d.settings.profiles[sig] = b
        } return d
    }
    write() {
      this.data.build = BUILD;
      try {
        let old = localStorage.getItem('riftbanner-save');
        if (old) {
          try {
            this.validate(JSON.parse(old));
            localStorage.setItem('riftbanner-backup', old)
          } catch (_) {}
        }
        localStorage.setItem('riftbanner-save', JSON.stringify(this.data));
        this.memory = false
      } catch (e) {
        this.memory = true;
        console.warn('Storage unavailable', e.message)
      }
    }
    unlocked(i) {
      return Number.isInteger(i) && i >= 0 && i < HEROES.length && heroAvailable(i, this.data.completed)
    }
    stageUnlocked(i) {
      return Number.isInteger(i) && i >= 0 && i < STAGES.length && (i === 0 || this.data.completed[i - 1] === true)
    }
    relicUnlocked(id) {
      const relic = RELICS.find(r=>r.id===id);
      return !!relic && (relic.stage === undefined || this.data.completed[relic.stage] === true);
    }
    loadout(i) {
      const relic = this.data.heroes[i]?.relic;
      return RELICS.find(r=>r.id===relic && this.relicUnlocked(r.id)) || RELICS[0];
    }
    equip(i,id) {
      if (!this.unlocked(i) || !this.relicUnlocked(id)) return false;
      this.data.heroes[i].relic=id;
      this.write();
      return true;
    }
    achievements() {
      const metrics = {...this.data.career, chapters:this.data.completed.filter(Boolean).length, heroLevel:Math.max(...this.data.heroes.map(h=>h.level))};
      return ACHIEVEMENTS.map(a=>({...a,current:Math.min(a.target,metrics[a.metric]||0),unlocked:this.data.achievements.includes(a.id)}));
    }
    recordBattle(battle,success,rank,score) {
      if (battle.mode === 'training') return [];
      const st=battle.stats, career=this.data.career;
      career.battles++;
      career.wins+=success?1:0;
      career.sRanks+=success&&rank==='S'?1:0;
      for(const k of ['ko','officers','perfectDodges']) career[k]+=Math.max(0,Math.floor(Number(st[k])||0));
      career.highCombo=Math.max(career.highCombo,Math.floor(Number(st.highCombo)||0));
      const unlocked=this.achievements().filter(a=>!a.unlocked&&a.current>=a.target);
      this.data.achievements.push(...unlocked.map(a=>a.id));
      return unlocked;
    }
    export () {
      let blob = new Blob([JSON.stringify(this.data, null, 2)], {
          type: 'application/json'
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'riftbanner-progress.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
  const save = new SaveService();
  let app;
  const settings = () => save.data.settings;
