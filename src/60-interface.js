  class MinimapRenderer {
    constructor() {
      this.c = $('mini');
      this.ctx = this.c.getContext('2d');
      this.static = document.createElement('canvas');
      this.static.width = this.static.height = 240;
      this.clock = 0
    }
    xy(a) {
      let s = app.battle.stage;
      return {
        x: 120 + a.x / s.w * 210,
        y: 120 - a.z / s.h * 210
      }
    }
    build() {
      let c = this.static.getContext('2d');
      c.clearRect(0, 0, 240, 240);
      c.fillStyle = '#172c32';
      c.fillRect(0, 0, 240, 240);
      c.strokeStyle = '#58635a';
      c.lineWidth = 1;
      for (let i = 15; i < 240; i += 26) {
        c.beginPath();
        c.moveTo(i, 15);
        c.lineTo(i, 225);
        c.moveTo(15, i);
        c.lineTo(225, i);
        c.stroke()
      }
      for (let b of app.collision.boxes) {
        if (b.gate) continue;
        let p = this.xy({
          x: b.x - b.w / 2,
          z: b.z + b.d / 2
        });
        c.fillStyle = '#7a7664';
        c.fillRect(p.x, p.y, b.w / app.battle.stage.w * 210, b.d / app.battle.stage.h * 210)
      }
    }
    draw(dt) {
      this.clock -= dt;
      if (this.clock > 0) return;
      this.clock = .1;
      let c = this.ctx;
      c.clearRect(0, 0, 240, 240);
      c.drawImage(this.static, 0, 0);
      for (let s of app.store.squads) {
        if (!app.store.strength(s)) continue;
        let p = this.xy(s);
        c.fillStyle = s.faction === 0 ? '#69d5c0' : '#bf5d47';
        c.beginPath();
        c.arc(p.x, p.y, 3, 0, 7);
        c.fill()
      }
      for (let a of app.store.actors) {
        if (a.hp <= 0 || !a.elite) continue;
        let p = this.xy(a);
        c.fillStyle = a.faction === 0 ? '#caeedc' : '#efa17a';
        c.fillRect(p.x - 3, p.y - 3, 6, 6)
      }
      for (let b of app.battle.bases) {
        let p = this.xy(b);
        c.strokeStyle = b.owner === 0 ? '#69dfcd' : '#d77e61';
        c.lineWidth = 2;
        c.strokeRect(p.x - 5, p.y - 5, 10, 10)
      }
      for (let g of app.collision.gates) {
        let p = this.xy(g);
        c.strokeStyle = g.open ? '#81bf99' : '#f2c077';
        c.beginPath();
        c.moveTo(p.x - 6, p.y);
        c.lineTo(p.x + 6, p.y);
        c.stroke()
      }
      let target = app.battle.selectedTarget();
      if (target) {
        let p = this.xy(target);
        c.strokeStyle = '#f9dc8e';
        c.beginPath();
        c.arc(p.x, p.y, 9, 0, 7);
        c.stroke()
      }
      // Stable horse markers help find an unattended mount after dismounting.
      for (const horse of app.mounts?.horses || []) {
        if (horse.mounted) continue;
        const marker=this.xy(horse);
        c.save();c.translate(marker.x,marker.y);c.fillStyle='#edd097';c.strokeStyle='#14242b';c.lineWidth=1.5;
        c.beginPath();c.moveTo(0,-4);c.lineTo(4,0);c.lineTo(0,4);c.lineTo(-4,0);c.closePath();c.fill();c.stroke();c.restore();
      }
      let p = this.xy(app.player);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(app.player.yaw);
      c.fillStyle = '#fff4c0';
      c.beginPath();
      c.moveTo(0, -7);
      c.lineTo(5, 5);
      c.lineTo(-5, 5);
      c.fill();
      c.restore()
    }
  }
  class PerformanceManager {
    constructor(engine) {
      this.engine=engine;this.frames=[];this.frameWrite=0;this.statsClock=0;
      this.scale=1;this.effective=settings().preset;this.high=0;this.low=0;this.cool=0;
      this.decisions=0;this.updateTime=0;this.steps=0;this.fps=0;this.p95=0;this.avg=0;
      this.budgetStage=0;this.detailLevel=0;this.animationMs=0;this.renderMs=0;this.instanceBytes=0;
      this.budgets();this.resize();
    }
    get preset(){return PRESETS[this.effective];}
    get target(){return settings().frameTarget===30?30:60;}
    budgets() {
      const rank=['quality','balanced','performance'].indexOf(this.effective);
      this.effectFactor=[1,.8,.6][rank]*(this.detailLevel?.65:1);
      this.backgroundRate=[1,1.5,2][rank]*(this.detailLevel?1.5:1);
      this.budgetStage=Math.max(0,rank-['quality','balanced','performance'].indexOf(settings().preset))+this.detailLevel;
      this.frameBudgetMs=1000/this.target;
      this.shadowFactor=rank===2||this.detailLevel?0:rank===1?.6:1;
      this.shadowsEnabled=this.shadowFactor>0;
    }
    resize() {
      const p=PRESETS[settings().preset];
      const pixelRatio=Math.max(.5,Math.min(devicePixelRatio||1,p.dpr,Math.sqrt(p.pixels/Math.max(1,innerWidth*innerHeight)))*this.scale);
      this.engine.setHardwareScalingLevel(1/pixelRatio);this.engine.resize();
    }
    requested() {
      this.effective=settings().preset;this.scale=1;this.detailLevel=0;
      this.high=this.low=this.cool=0;this.frames.length=0;this.frameWrite=0;
      this.budgets();this.resize();
    }
    sample(ms,dt) {
      if(app.state!=='Playing'||!Number.isFinite(ms)||ms<=0)return;
      if(this.frames.length<180)this.frames.push(ms);
      else {this.frames[this.frameWrite]=ms;this.frameWrite=(this.frameWrite+1)%180;}
      this.statsClock+=dt;
      if(this.frames.length>25&&this.statsClock>.5){
        this.statsClock=0;this.avg=this.frames.reduce((a,b)=>a+b,0)/this.frames.length;
        const sorted=this.frames.slice().sort((a,b)=>a-b);
        this.p95=sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)];this.fps=1000/this.avg;
      }
      this.cool=Math.max(0,this.cool-dt);this.budgets();
      if(!settings().auto)return;
      const budget=this.frameBudgetMs;
      if(ms>budget*1.32){this.high+=Math.min(.15,dt);this.low=0;}
      else if(ms<budget*1.1){this.low+=dt;this.high=Math.max(0,this.high-dt);}
      else{this.high=Math.max(0,this.high-dt*.3);this.low=0;}
      if(this.cool<=0&&(this.high>3||ms>budget*1.8&&this.high>1.5)){
        let resized=false;
        // Reduce shadow/effect/crowd work before lowering the hero's resolution.
        if(!this.detailLevel)this.detailLevel=1;
        else if(this.effective!=='performance'){this.effective=this.effective==='quality'?'balanced':'performance';this.detailLevel=0;}
        else if(this.scale>.7){this.scale=Math.max(.7,this.scale-.1);resized=true;}
        this.budgets();if(resized)this.resize();this.cool=5;this.high=0;
      }else if(this.cool<=0&&this.low>14){
        let resized=false;
        if(this.scale<1){this.scale=Math.min(1,this.scale+.05);resized=true;}
        else if(this.detailLevel)this.detailLevel=0;
        else if(this.effective!==settings().preset){const order=['performance','balanced','quality'];this.effective=order[Math.min(order.indexOf(settings().preset),order.indexOf(this.effective)+1)];}
        this.budgets();if(resized)this.resize();this.cool=9;this.low=0;
      }
    }
  }
  const TEXT_ACTIONS = {
    light:'الضرب العادي',heavy:'هجوم الشحن',jump:'القفز / النزول من الخيل',dodge:'التفادي / الركض',guard:'الصدّ / الإتقان',
    skill1:'المهارة الأولى',skill2:'المهارة الثانية',ultimate:'الضربة القصوى',interact:'ركوب / نزول / تفاعل',
    pause:'الإيقاف',lock:'تثبيت الهدف',cycle:'تبديل الهدف',sprint:'الركض',
    forward:'حركة للأمام',back:'حركة للخلف',left:'حركة لليسار',right:'حركة لليمين'
  };
class HeroPreview {
  constructor(canvas, heroIndex) {
    this.canvas = canvas;
    this.engine = new B.Engine(canvas, true, {stencil:false, preserveDrawingBuffer:false}, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, 1.25));
    this.scene = new B.Scene(this.engine);
    this.scene.clearColor = new B.Color4(.035, .075, .10, 1);
    // The same locally authored light probe as daylight gameplay; no CDN assets.
    WorldBuilder.prototype.makeEnvironment.call({scene:this.scene,stage:{night:false}});
    const image=this.scene.imageProcessingConfiguration;
    image.toneMappingEnabled=true;
    image.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    image.exposure=1.1;image.contrast=1.08;
    const ambient = new B.HemisphericLight('portrait ambient', new B.Vector3(0,1,.3), this.scene);
    ambient.intensity = .55;
    ambient.groundColor = new B.Color3(.22,.26,.28);
    const key = new B.DirectionalLight('portrait key', new B.Vector3(-.5,-.8,-.6), this.scene);
    key.intensity = 1.2;
    key.diffuse = new B.Color3(1,.88,.72);
    const rim = new B.DirectionalLight('portrait rim', new B.Vector3(.7,-.3,.8), this.scene);
    rim.intensity = .5;
    rim.diffuse = new B.Color3(.46,.81,.88);
    this.camera = new B.FreeCamera('portrait camera', new B.Vector3(0,1.65,4.8),this.scene);
    this.camera.minZ = .05;
    this.camera.fov = .62;
    this.camera.setTarget(new B.Vector3(0,1.12,0));
    this.scene.activeCamera = this.camera;
    const plinth = B.MeshBuilder.CreateCylinder('portrait plinth',{diameter:2.25,height:.10,tessellation:48},this.scene);
    plinth.position.y = -.055;
    const stone = new B.StandardMaterial('portrait stone',this.scene);
    stone.diffuseColor = new B.Color3(.15,.24,.26);
    stone.specularColor = new B.Color3(.12,.15,.15);
    plinth.material = stone;
    const edge = B.MeshBuilder.CreateTorus('portrait inlay',{diameter:2.12,thickness:.018,tessellation:48},this.scene);
    const gold = new B.StandardMaterial('portrait gold',this.scene);
    gold.diffuseColor = new B.Color3(.86,.67,.36);
    gold.emissiveColor = new B.Color3(.18,.13,.04);
    edge.material = gold;
    const contact=flatRing('portrait contact',this.scene,32,0);
    const shadow=new B.StandardMaterial('portrait shadow',this.scene);
    shadow.diffuseColor=B.Color3.Black();shadow.disableLighting=true;
    shadow.alpha=.3;shadow.backFaceCulling=false;
    contact.material=shadow;contact.position.y=.012;contact.scaling.set(.56,1,.43);
    this.factory = new CharacterFactory(this.scene, {});
    this.animator = new CharacterAnimator();
    this.time = 0;
    this.yaw = -.25;
    this.pointer = null;
    this.setHero(heroIndex);
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.pointer = {id:e.pointerId,x:e.clientX};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (this.pointer?.id !== e.pointerId) return;
      this.yaw += (e.clientX - this.pointer.x)*.012;
      this.pointer.x = e.clientX;
    });
    const release = e => {if(this.pointer?.id===e.pointerId)this.pointer=null;};
    canvas.addEventListener('pointerup',release);
    canvas.addEventListener('pointercancel',release);
    canvas.addEventListener('keydown',e=>{
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
        this.yaw += e.key==='ArrowLeft' ? -.2 : .2;
        e.preventDefault();
      }
    });
    this.observer = new ResizeObserver(()=>this.engine.resize());
    this.observer.observe(canvas);
    this.engine.resize();
  }
  setHero(index) {
    if(this.rig){
      if(this.rig.dispose)this.rig.dispose();
      else this.rig.root.dispose();
    }
    this.index=index;
    this.rig=this.factory.build(index,0,true);
    this.actor={hero:index,x:0,z:0,y:0,yaw:0,hp:1,gen:index+1,state:'Idle',stateTime:0,attack:null,speed:0};
    this.time=0;
    const h=HEROES[index];
    const label=$('previewHeroName');
    if(label)label.textContent=h.name+' • '+h.weapon;
    const family=HEROES[index].style??index;
    this.camera.position.z=family===1?5.6:family===2?4.8:5.1;
    this.camera.setTarget(new B.Vector3(0,family===1?1.35:1.18,0));
  }
  attack() {
    const d=HEROES[this.index].duration;
    this.actor.state='LightAttack';
    const move=app?.combat?.routeDefinitions?.(this.index)?.light?.[0];
    this.actor.attack=move?{...move,time:0,kind:'light',chain:1,comboIndex:1,side:move.side||1}:
      {time:0,start:d*.26,end:d*.65,duration:d,kind:'light',motion:HEROES[this.index].style===1?'thrust':'slash',chain:1,reach:HEROES[this.index].reach};
  }
  render(dt) {
    this.time+=dt;
    this.actor.stateTime+=dt;
    const a=this.actor.attack;
    if(a){a.time+=dt;if(a.time>=a.duration){this.actor.attack=null;this.actor.state='Idle';}}
    this.animator.update(this.rig,this.actor,dt,this.time);
    this.rig.root.rotation.y=this.yaw;
    this.scene.render();
  }
  dispose() {
    this.observer.disconnect();
    this.pointer=null;
    this.scene.dispose();
    this.engine.dispose();
  }
}
  class UIManager {
    constructor() {
      this.page = 'main';
      this.tab = 'graphics';
      this.noticeTime = 0;
      this.hudClock = 0;
      this.testerClock = 0;
      this.settingsOrigin = 'main';
      this.returnPage = 'main';
      $('importFile').onchange = async e => {
        let file = e.target.files[0];
        if (!file) return;
        try {
          if (file.size > 100000) throw Error('ملف كبير أو غير صالح');
          let valid = save.validate(JSON.parse(await file.text()));
          if (confirm('استبدال التقدم الحالي بالملف الذي تم التحقق منه؟')) {
            save.data = valid;
            save.write();
            app.performance.requested();
            this.main();
            this.message('تم استيراد التقدم', 3)
          }
        } catch (e) {
          alert('فشل الاستيراد: ' + e.message)
        }
        e.target.value = ''
      };
      $('version').onpointerdown = () => {
        this.debugTimer = setTimeout(() => {
          app.debug = !app.debug
        }, 1200)
      };
      $('version').onpointerup = () => clearTimeout(this.debugTimer);
      // Let variable-length Arabic objectives and officer bars share normal flow.
      // Fixed top offsets otherwise overlap once navigation wraps on a phone.
      const info=document.createElement('div');info.id='battleInfo';
      for(const id of ['objectives','enemybar','critical'])info.appendChild($(id));
      $('hud').appendChild(info);
      const left=document.createElement('div');left.id='battleLeft';
      const tactical=document.createElement('div');tactical.id='tacticalOverview';
      left.appendChild($('hud').querySelector('.status'));
      tactical.appendChild($('mini'));tactical.appendChild($('ko'));left.appendChild(tactical);$('hud').appendChild(left);
      const abilities=document.createElement('div');abilities.id='abilityHUD';left.querySelector('.status').appendChild(abilities);
      const progress=document.createElement('div');progress.id='objectiveProgress';$('objectives').prepend(progress);
      const guide=document.createElement('div');guide.id='comboGuide';$('hud').appendChild(guide);
      const readouts=document.createElement('div');readouts.id='battleReadouts';readouts.setAttribute('aria-hidden','true');$('hud').appendChild(readouts);
      this.unitBars=Array.from({length:4},()=>{const el=document.createElement('div');el.className='unitReadout';el.innerHTML='<span></span><div><i></i></div>';el.hidden=true;readouts.appendChild(el);return el;});
      this.damageLabels=Array.from({length:16},()=>{const el=document.createElement('div');el.className='damageReadout';el.hidden=true;readouts.appendChild(el);return {el,until:0};});
      this.observedHealth=new Map();this.damageCursor=0;this.readoutScene=null;
      this.touchVisibility()
    }
    show(html, page) {
      this.preview?.dispose();
      this.preview = null;
      this.editing = false;
      this.page = page;
      $('screen').innerHTML = '<div class="panel panel-'+page+'">' + html + '</div>';
      $('screen').setAttribute('aria-label', 'قائمة اللعبة');
      $('screen').classList.remove('hide');
      $('hud').classList.remove('on');
      $('controls').classList.remove('on');
      for (let el of $('screen').querySelectorAll('[data-do]')) el.onclick = () => this.action(el.dataset.do, el.dataset.value);
      requestAnimationFrame(() => $('screen').querySelector('button:not(:disabled)')?.focus())
    }
    title(name, sub = '') {
      return `<div class="eyebrow">RIFTBANNER / رايات الصدع</div><div class="row between"><h2>${name}</h2><span class="tiny">${sub}</span></div>`
    }
    main() {
      app.state='Menu';app.audio.pause();
      const cleared=save.data.completed.filter(Boolean).length;
      const next=Math.min(STAGES.length-1,save.data.completed.findIndex(done=>!done)<0?STAGES.length-1:save.data.completed.findIndex(done=>!done));
      const stage=STAGES[next],hero=HEROES[save.data.selectedHero],record=save.data.heroes[save.data.selectedHero];
      const available=HEROES.filter((_,i)=>save.unlocked(i)).length;
      this.show(`<div class="mainHero"><div class="eyebrow">DAWNWARD ACCORD / VEYRATH <span class="releaseBadge">V${BUILD}</span></div><div class="brand">RIFTBANNER</div><h1>رايات الصدع</h1><p class="mainLead">من سهول الجمر إلى آخر حصون الرماد.<br>قُد أبطال الفجر، حرّر الرايات، واكتب نهاية الحرب.</p><div class="campaignStats"><div><strong>${HEROES.length}</strong><span>أبطال بأسلحة مختلفة</span></div><div><strong>${STAGES.length}</strong><span>فصول الحملة</span></div><div><strong>${cleared} / ${STAGES.length}</strong><span>ساحات محرّرة</span></div></div></div><div class="mainContent"><div class="continueCard"><div><div class="eyebrow">${cleared===STAGES.length?'CAMPAIGN COMPLETE':'YOUR NEXT BATTLE'}</div><h3>${stage.name}</h3><p>${stage.brief}</p><div class="missionMeta"><span>الفصل ${next+1}</span><span>مستوى ${stage.recommendedLevel||next*2+1}</span><span>${Math.round(stage.limit/60)} دقيقة</span></div></div><button class="primary" data-do="continue" data-value="${next}">${cleared===STAGES.length?'إعادة آخر معركة':'متابعة الحملة'} ←</button></div><div class="selectedLoadout"><span class="heroSigil" style="--hero-color:${hero.color}">◆</span><div><b>${hero.name}</b><span class="tiny">${hero.weapon} • المستوى ${record.level}${typeof save.loadout==='function'?' • '+save.loadout(save.data.selectedHero).name:''}</span></div><button data-do="heroes">تغيير البطل</button></div><div class="mainNavigation"><button data-do="missions"><b>خريطة الحملة</b><span>${cleared} فصول مكتملة</span></button><button data-do="heroes"><b>أبطال الفجر</b><span>${available} أبطال متاحون</span></button><button data-do="training"><b>ساحة التدريب</b><span>جرّب الأسلحة والفرسان</span></button><button data-do="codex"><b>سجل الحرب</b><span>قادة • ساحات • إنجازات</span></button><button data-do="settings"><b>الإعدادات</b><span>تحكم • رسوم • حفظ</span></button><button data-do="release"><b>جديد التحديث</b><span>توسعة عهد الرايات</span></button></div><div class="mainFooter"><span class="tag">◆ ${save.data.shards} شظية راية</span><span class="tiny">Enter تأكيد • Esc عودة • يد تحكم ولمس</span></div><div id="storageWarning">${save.recovered?'تم إصلاح الحفظ من النسخة الاحتياطية أو القيم الافتراضية. ':''}${save.memory?'التخزين غير متاح؛ صدّر التقدم من الإعدادات قبل الإغلاق.':'حفظ تلقائي محلي • متوافق مع تقدم الإصدارات السابقة'}</div></div>`, 'main');
    }
    themeLabel(theme) {
      return ({grassland:'سهول الجمر',lantern:'ممر ليلي',citadel:'حصن الصدع',coast:'الساحل',marsh:'المستنقع',desert:'الصحراء',frost:'مرتفعات الجليد',volcanic:'الجبهة البركانية'})[theme]||theme||'';
    }
    heroUnlockText(i) {
      const stage=HEROES[i].unlockStage??(i===2?0:i===3?1:-1);
      return stage>=0&&STAGES[stage]?'أكمل '+STAGES[stage].name:'متاح من البداية';
    }
    bindFilter(inputId,selectId,selector) {
      const input=$(inputId),select=$(selectId);
      const refresh=()=>{
        const query=(input?.value||'').trim().toLocaleLowerCase('ar'),filter=select?.value||'all';
        let count=0;
        for(const card of $('screen').querySelectorAll(selector)) {
          const visible=(!query||card.textContent.toLocaleLowerCase('ar').includes(query))&&(filter==='all'||card.dataset.filter===filter);
          card.hidden=!visible;if(visible)count++;
        }
        const empty=$('filterEmpty');if(empty)empty.hidden=count>0;
        const countLabel=$('filterCount');if(countLabel)countLabel.textContent=count+' نتائج';
      };
      if(input)input.oninput=refresh;if(select)select.onchange=refresh;refresh();
    }

    heroes() {
      const selected=save.data.selectedHero;
      this.show(this.title('أبطال الفجر',HEROES.length+' أبطال • '+save.data.shards+' شظية')+`<div class="rosterToolbar"><label class="searchField"><span>البحث عن بطل أو سلاح</span><input id="heroSearch" type="search" placeholder="الاسم، السلاح، المهارة…" autocomplete="off"></label><label>عرض <select id="heroFilter"><option value="all">جميع الأبطال</option><option value="unlocked">المتاحون</option><option value="locked">المقفلون</option></select></label><span id="filterCount" class="tiny"></span></div><div class="heroSelection"><div class="heroPortrait"><canvas id="heroPreview" tabindex="0" aria-label="نموذج البطل؛ اسحب أو استخدم الأسهم لتدويره"></canvas><strong id="previewHeroName"></strong><p id="previewHeroLore" class="tiny">${HEROES[selected].lore||HEROES[selected].passive}</p><div class="portraitActions"><button data-do="previewPrevious" aria-label="البطل السابق">‹</button><button data-do="previewAttack">عرض الضربة</button><button data-do="previewNext" aria-label="البطل التالي">›</button></div><p class="tiny">اسحب للتدوير • كل بطل يملك ٦ مسارات شحن</p></div><div><div class="grid heroCards">${HEROES.map((h,i)=>{const p=save.data.heroes[i],on=save.unlocked(i);return `<article class="card heroCard ${selected===i?'selected':''} ${on?'':'locked'}" data-filter="${on?'unlocked':'locked'}" style="--hero-color:${h.color}"><div class="heroCardHeading"><span class="heroSigil">${String(i+1).padStart(2,'0')}</span><div><h3>${h.name}${i>=6?'<span class="newHero">جديد</span>':''}</h3><span class="tiny">${h.role||h.weapon}</span></div>${selected===i?'<span class="selectedMark">مختار ✓</span>':''}</div><div class="heroWeapon">${h.weapon} <span>المستوى ${p.level}</span></div><div class="heroStats"><span><b>${Math.round(h.hp*(1+.08*p.up[0]+.004*(p.level-1))*(1+(typeof save.loadout==='function'?save.loadout(i).hp||0:0)))}</b> حياة</span><span><b>${Math.round(h.dmg*(1+.08*p.up[1]+.004*(p.level-1))*(1+(typeof save.loadout==='function'?save.loadout(i).damage||0:0)))}</b> قوة</span><span><b>${h.speed}</b> سرعة</span></div><p class="tiny heroPassive">${h.passive}</p><details class="heroDetails"><summary>المهارات والضربة القصوى</summary><p class="tiny">${h.skills.map((name,k)=>`<b>${name}</b> • ${h.cd[k]}ث تبريد`).join('<br>')}<br><b>${h.ultimate}</b> • عداد قصوى مكتمل</p></details>${on?'':`<p class="unlockRequirement">◇ ${this.heroUnlockText(i)}</p>`}<div class="heroCardActions"><button data-do="previewHero" data-value="${i}" aria-label="معاينة ${h.name}">معاينة</button><button ${selected===i?'class="primary"':''} data-do="hero" data-value="${i}" ${on?'':'disabled'}>${selected===i?'مختار':'اختيار'}</button>${on?`<button data-do="upgrade" data-value="${i}">تطوير وتجهيز</button>`:''}</div></article>`}).join('')}</div><p id="filterEmpty" class="emptyState" hidden>لا يوجد بطل يطابق البحث.</p></div></div><div class="menuButtons"><button data-do="main">القائمة</button><button data-do="codex" data-value="heroes">سجل الأبطال</button><button class="primary" data-do="missions">اختيار المعركة ←</button></div>`, 'heroes');
      this.preview=new HeroPreview($('heroPreview'),selected);this.bindFilter('heroSearch','heroFilter','.heroCard');
    }
    previewHero(index) {
      index=(index+HEROES.length)%HEROES.length;
      this.preview?.setHero(index);
      if($('previewHeroLore'))$('previewHeroLore').textContent=HEROES[index].lore||HEROES[index].passive;
      for(const card of $('screen').querySelectorAll('.heroCard'))card.classList.toggle('previewed',+card.querySelector('[data-do="previewHero"]').dataset.value===index);
    }

    upgrades(i) {
      const h=HEROES[i],p=save.data.heroes[i],names=['الحيوية','قوة السلاح','إتقان المهارات'],effects=['+٨٪ من الحياة الأساسية لكل رتبة','+٨٪ من ضرر السلاح الأساسي لكل رتبة','+٦٪ ضرر مهارة و−٤٪ زمن تبريد لكل رتبة'];
      const relics=typeof RELICS!=='undefined'?RELICS:[],equipped=typeof save.loadout==='function'?save.loadout(i).id:'none';
      this.show(this.title('تطوير '+h.name,save.data.shards+' شظية')+`<p>المستوى ${p.level} / ٢٠ • الخبرة ${Math.floor(p.xp)} / ${120+45*(p.level-1)}<br><span class="tiny">كل مستوى يضيف ٠٫٤٪ للحياة والسلاح. تتراكم الترقيات مع أثر التجهيز.</span></p><div class="xpTrack"><i style="width:${p.level===20?100:clamp(p.xp/(120+45*(p.level-1))*100,0,100)}%"></i></div><div class="grid upgradeGrid">${names.map((name,k)=>`<div class="card"><div class="eyebrow">UPGRADE 0${k+1}</div><h3>${name}</h3><p class="tiny">${effects[k]}</p><div class="upgradePips" aria-label="الرتبة ${p.up[k]} من ٣">${[0,1,2].map(v=>`<i class="${v<p.up[k]?'filled':''}"></i>`).join('')}</div><button data-do="buy" data-value="${i},${k}" ${p.up[k]===3||save.data.shards<30*(p.up[k]+1)?'disabled':''}>${p.up[k]===3?'اكتملت الترقية':'شراء • '+30*(p.up[k]+1)+' شظية'}</button></div>`).join('')}</div>${relics.length?`<div class="sectionHeading"><h3>آثار الرايات</h3><span class="tiny">جهّز أثرًا واحدًا لكل بطل • تفتحها أحداث الحملة</span></div><div class="grid relicGrid">${relics.map(relic=>{const available=save.relicUnlocked(relic.id);return `<article class="card ${equipped===relic.id?'selected':''}"><h3>${relic.name}</h3><p class="tiny">${relic.description}</p><span class="tag">${available?'متاح':relic.requirement}</span><button data-do="equip" data-value="${i},${relic.id}" ${available?'':'disabled'}>${equipped===relic.id?'مجهّز ✓':'تجهيز'}</button></article>`}).join('')}</div>`:''}<div class="menuButtons"><button data-do="heroes">عودة للأبطال</button><button class="primary" data-do="missions">اختيار المعركة</button></div>`, 'upgrade');
    }

    missions(mode='campaign') {
      this.mode=mode;
      const cleared=save.data.completed.filter(Boolean).length;
      this.show(this.title(mode==='campaign'?'الحملة — عهد الرايات':'المناوشة — أسر ودفاع',`${cleared} / ${STAGES.length} فصول محرّرة`)+`<div class="campaignToolbar"><div class="segmented"><button data-do="campaign" class="${mode==='campaign'?'primary':''}">الحملة</button><button data-do="skirmish" class="${mode==='skirmish'?'primary':''}" ${save.data.completed[0]?'':'disabled'}>المناوشة</button></div><label>الصعوبة <select id="difficulty"><option value="normal">عادية</option><option value="veteran">محارب</option></select></label></div><p class="tiny">${mode==='campaign'?'أكمل الفصول بالترتيب. حرّر الرايات الاختيارية لتعزيز جيشك، وأعد أي مرحلة لتحسين رتبتك.':'توزيع مختلف لكل ساحة: أسر القواعد وهزيمة ضابط الميدان مع حماية مقر الفجر.'}</p><div class="grid campaignGrid">${STAGES.map((stage,i)=>{const unlocked=mode==='campaign'?save.stageUnlocked(i):save.data.completed[i],best=save.data.best[mode+'-'+i+'-'+settings().difficulty],level=stage.recommendedLevel||i*2+1;return `<article class="card missionCard ${unlocked?'':'locked'} ${save.data.completed[i]?'completed':''}" style="--mission-color:${stage.night?'#a5a3dd':'#dbb36d'}"><div class="missionLandscape ${stage.landscape||stage.layout||'field'} ${stage.night?'night':''}" aria-hidden="true"><span class="chapterNumber">${String(i+1).padStart(2,'0')}</span><span class="missionState">${save.data.completed[i]?'محرّرة ✓':unlocked?'جاهزة للمعركة':'مقفلة ◇'}</span><div class="landscapeSun"></div><div class="landscapeMountains"></div><div class="landscapeTower"></div></div><div class="missionBody"><div class="eyebrow">${stage.subtitle}</div><h3>${stage.name}</h3><div class="tag">${stage.chapter||'الفصل '+(i+1)}${stage.theme?' • '+this.themeLabel(stage.theme):''}</div><p class="tiny missionBrief">${mode==='campaign'?stage.brief:'حرّر كل القواعد واهزم ضابط الميدان. أبقِ قائد الفجر حياً أمام الهجوم المعادي.'}</p><div class="missionMeta"><span>مستوى ${level}</span><span>${Math.round(stage.limit/60)} دقيقة</span><span>${stage.nodes.length} أهداف</span></div><div class="missionFooter"><span class="rankBadge ${best?'rank'+best.rank:''}">${best?.rank||'—'}</span><span class="tiny">${best?'أفضل رتبة • '+fmt(best.time):'لا توجد نتيجة بعد'}</span></div><button class="${unlocked?'primary':''}" data-do="brief" data-value="${i}" ${unlocked?'':'disabled'}>${unlocked?'تجهيز المعركة ←':mode==='campaign'?'أكمل الفصل السابق':'أكمل الحملة أولاً'}</button></div></article>`}).join('')}</div><div class="menuButtons"><button data-do="main">القائمة</button><button data-do="heroes">الأبطال والتجهيز</button><button data-do="codex" data-value="stages">سجل الساحات</button></div>`, 'missions');
      $('difficulty').value=settings().difficulty;$('difficulty').onchange=e=>{settings().difficulty=e.target.value;save.write();this.missions(mode);};
    }

    brief(i) {
      if(!Number.isInteger(i)||!STAGES[i]||(this.mode==='skirmish'?!save.data.completed[i]:!save.stageUnlocked(i)))return;
      save.data.selectedStage=i;save.write();const stage=STAGES[i],hero=HEROES[save.data.selectedHero],record=save.data.heroes[save.data.selectedHero],skirmish=this.mode==='skirmish';
      this.show(this.title(stage.name,stage.subtitle)+`<div class="briefHeader"><span class="chapterSeal">${String(i+1).padStart(2,'0')}</span><div><div class="tag">${stage.chapter||'الفصل '+(i+1)}${stage.theme?' • '+this.themeLabel(stage.theme):''}</div><p>${skirmish?'حرّر كل القواعد واهزم ضابط الميدان. تهاجم الفرق المعادية مقر الفجر من طرق متعددة.':stage.brief}</p></div></div><div class="grid briefGrid"><div class="card"><h3>المهمة</h3><ol class="missionObjectives">${(skirmish?['استولِ على جميع القواعد','اهزم ضابط الميدان','احمِ قائد الفجر']:stage.nodes).map(node=>`<li>${node}</li>`).join('')}</ol></div><div class="card"><h3>شروط المعركة</h3><p class="tiny"><b>النصر:</b> ${skirmish?'كل القواعد صديقة وضابط الميدان مهزوم.':stage.victory||stage.nodes[stage.nodes.length-1]}<br><b>الهزيمة:</b> سقوط البطل أو ${i===1&&!skirmish?'حامل الراية':'قائد الفجر'}، أو انتهاء الوقت.</p><div class="missionMeta"><span>حد ${Math.round(stage.limit/60)} دقيقة</span><span>مستوى مقترح ${stage.recommendedLevel||i*2+1}</span><span>${settings().difficulty==='veteran'?'صعوبة محارب':'صعوبة عادية'}</span></div><hr><b>${hero.name} • ${hero.weapon}</b><p class="tiny">المستوى ${record.level}${typeof save.loadout==='function'?'<br>الأثر المجهّز: '+save.loadout(save.data.selectedHero).name:''}</p>${record.level<(stage.recommendedLevel||1)?'<p class="tag">التدريب والترقيات يساعدانك في هذا الفصل.</p>':''}<button data-do="heroes">تغيير البطل والتجهيز</button></div></div><div class="battleTip">◆ اهزم قائد الحامية، أزل الأعداء من دائرة الراية، ثم ابقَ داخلها حتى يكتمل الأسر. تُظهر الخريطة الهدف الحالي بالذهبي.</div><div class="menuButtons"><button class="primary" data-do="start">دخول المعركة ←</button><button data-do="missions">عودة لخريطة الحملة</button></div>`, 'brief');
    }

    codex(tab='heroes') {
      this.codexTab=['heroes','officers','stages','achievements','guide'].includes(tab)?tab:'heroes';
      let content='';
      if(this.codexTab==='heroes')content=`<div class="grid codexGrid">${HEROES.map((hero,i)=>`<article class="card codexEntry" data-filter="${save.unlocked(i)?'unlocked':'locked'}"><div class="eyebrow">CHAMPION ${String(i+1).padStart(2,'0')}</div><h3>${hero.name} • ${hero.weapon}</h3><span class="tag">${hero.role||'بطل الفجر'} • ${save.unlocked(i)?'متاح':this.heroUnlockText(i)}</span><p class="tiny">${hero.lore||hero.passive}</p><div class="missionMeta"><span>حياة ${hero.hp}</span><span>ضرر ${hero.dmg}</span><span>سرعة ${hero.speed}</span><span>مدى ${hero.reach} م</span></div><p class="tiny"><b>المهارات:</b> ${hero.skills.join(' • ')}<br><b>القصوى:</b> ${hero.ultimate}<br><b>الميزة:</b> ${hero.passive}</p><button data-do="upgrade" data-value="${i}" ${save.unlocked(i)?'':'disabled'}>تطوير وتجهيز</button></article>`).join('')}</div>`;
      if(this.codexTab==='officers')content=`<div class="grid codexGrid">${Object.entries(TYPES).map(([type,unit])=>{const names={raider:'مغير',shield:'حامل درع',pike:'حامل رمح',archer:'رامٍ'};const tactic=unit.tactics||(type==='archer'?'اقترب بتفادٍ متتالٍ. احذر السهم عند الوقوف بعيدًا.':type==='shield'?'استعمل الشحن لكسر الدرع ثم تابع السلسلة.':type==='pike'?'تحرّك إلى الجانب قبل اندفاع الرمح.':type==='commander'||type==='bearer'?'حليف رئيسي؛ راقب حياته وابقَ قريبًا عند تعرضه للهجوم.':'راقب إشارات الهجوم، ثم تفادَ أو صدّ في اللحظة المناسبة. اكسر التوازن قبل الهجوم الطويل.');return `<article class="card codexEntry" data-filter="${type==='commander'||type==='bearer'?'allies':names[type]?'soldiers':'officers'}"><div class="eyebrow">${names[type]?'TROOP':type==='commander'||type==='bearer'?'ALLY':'OFFICER'}</div><h3>${NAMES[type]||names[type]||type}</h3><p class="tiny">${unit.lore||'من قوات معركة الرايات.'}</p><div class="missionMeta"><span>حياة ${unit.hp}</span><span>ضرر ${unit.dmg}</span><span>مدى ${unit.range} م</span>${unit.phases?`<span>${Array.isArray(unit.phases)?unit.phases.length:unit.phases} مراحل قتال</span>`:''}</div><p class="tiny"><b>التكتيك:</b> ${tactic}</p></article>`}).join('')}</div>`;
      if(this.codexTab==='stages')content=`<div class="grid codexGrid">${STAGES.map((stage,i)=>`<article class="card codexEntry" data-filter="${save.data.completed[i]?'completed':'remaining'}"><div class="eyebrow">CHAPTER ${String(i+1).padStart(2,'0')} • ${stage.subtitle}</div><h3>${stage.name}</h3><span class="tag">${this.themeLabel(stage.theme)||stage.chapter||'ساحة الرايات'}</span><p class="tiny">${stage.brief}</p><div class="missionMeta"><span>مستوى ${stage.recommendedLevel||i*2+1}</span><span>${Math.round(stage.limit/60)} دقيقة</span><span>${stage.night?'ساحة ليلية':'ساحة نهارية'}</span></div><details><summary>أهداف الفصل</summary><ol class="missionObjectives">${stage.nodes.map(node=>`<li>${node}</li>`).join('')}</ol></details><p class="tiny"><b>النصر:</b> ${stage.victory||stage.nodes[stage.nodes.length-1]}</p></article>`).join('')}</div>`;
      if(this.codexTab==='achievements') {
        const achievements=typeof save.achievements==='function'?save.achievements():[];
        content=`<div class="achievementSummary"><b>${achievements.filter(item=>item.unlocked).length} / ${achievements.length}</b><span>إنجازات مكتملة</span><span class="tiny">الإنجازات تُثبت عند نهاية المعركة • ساحة التدريب لا تمنح تقدمًا</span></div><div class="grid codexGrid">${achievements.map(item=>`<article class="card codexEntry achievementCard ${item.unlocked?'earned':''}" data-filter="${item.unlocked?'earned':'remaining'}"><span class="achievementIcon">${item.unlocked?'✦':'◇'}</span><h3>${item.name}</h3><p class="tiny">${item.description}</p><div class="achievementTrack"><i style="width:${clamp((item.current||0)/Math.max(1,item.target)*100,0,100)}%"></i></div><span class="tag">${item.unlocked?'مكتمل ✓':Math.min(item.current||0,item.target)+' / '+item.target}</span></article>`).join('')}</div>`;
      }
      if(this.codexTab==='guide')content=`<div class="grid guideGrid"><article class="card"><h3>مسارات الشحن</h3><p class="tiny">شحن مباشر = C1. اضرب مرة ثم اشحن = C2، مرتين ثم اشحن = C3، وحتى خمس ضربات ثم شحن = C6. لكل سلاح ست ضربات عادية وتوقيت مختلف. التفادي يلغي بعض الحركات ويتيح إعادة التموضع.</p></article><article class="card"><h3>الصدّ والتفادي المتقن</h3><p class="tiny">ابدأ الصدّ عند وصول الضربة لكسر توازن الضابط. تفادَ قبل الاصطدام مباشرة لاستعادة الطاقة وتقوية الهجوم التالي. موجات الصدمة الأرضية يمكن تجاوزها بالقفز.</p></article><article class="card"><h3>إدارة الرايات</h3><p class="tiny">الحامية تمنع الأسر حتى يسقط قائدها. أزل الخصوم وابقَ في الدائرة؛ يعود العدو بتعزيزات من القواعد التي يملكها. الرايات الاختيارية تقطع الإمداد وتساعد جيشك.</p></article><article class="card"><h3>القتال من السرج</h3><p class="tiny">تفاعل قرب الجواد لركوبه. الضربة العادية تمسح جانبي الحصان، والشحن يجتاح المقدمة. امسك الركض للعدو السريع مع مراقبة طاقة الجواد. القفز أو التفاعل ينزلك من السرج.</p></article><article class="card"><h3>الترقيات والآثار</h3><p class="tiny">اكسب الخبرة والشظايا من المعارك، ثم طوّر الحيوية والسلاح والمهارات لكل بطل. آثار الرايات تمنح مزايا إضافية؛ جهّز أثرًا واحدًا من صفحة التطوير. النتائج تحفظ أفضل رتبة لكل صعوبة.</p></article><article class="card"><h3>التتابع والضباط</h3><p class="tiny">واصل إصابة الأعداء للحفاظ على عداد HIT. يردّ التتابع الطويل جزءًا من الطاقة ويقصّر التبريد. بعض القادة يغيّرون أسلوبهم عند انخفاض الحياة؛ راقب إشارات المرحلة والهجمات الثقيلة.</p></article></div>${this.controlHelp()}`;
      const filters=this.codexTab==='heroes'?[['unlocked','المتاحون'],['locked','المقفلون']]:this.codexTab==='officers'?[['officers','القادة'],['soldiers','الجنود'],['allies','الحلفاء']]:this.codexTab==='stages'?[['completed','المحرّرة'],['remaining','المتبقية']]:[['earned','المكتملة'],['remaining','المتبقية']];
      this.show(this.title('سجل الحرب','أبطال الفجر • جيوش الرماد')+`<div class="codexTabs">${[['heroes','الأبطال'],['officers','القادة والجنود'],['stages','الساحات'],['achievements','الإنجازات'],['guide','دليل القتال']].map(([key,name])=>`<button data-do="codex" data-value="${key}" class="${this.codexTab===key?'primary':''}">${name}</button>`).join('')}</div>${this.codexTab!=='guide'?`<div class="rosterToolbar"><label class="searchField"><span>ابحث في السجل</span><input id="codexSearch" type="search" placeholder="ابحث بالاسم أو الوصف…" autocomplete="off"></label><label>عرض <select id="codexFilter"><option value="all">الكل</option>${filters.map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></label><span id="filterCount" class="tiny"></span></div>`:''}${content}<p id="filterEmpty" class="emptyState" hidden>لا توجد نتائج تطابق البحث.</p><div class="menuButtons"><button data-do="main">القائمة</button><button data-do="training">ساحة التدريب</button></div>`, 'codex');
      this.bindFilter('codexSearch','codexFilter','.codexEntry');
    }
    trainingMenu() {
      this.show(this.title('ساحة التدريب') + `<p>جرّب مسارات الأسلحة والصدّ المتقن والقتال الجوي والخيول دون مكافآت أو مخاطرة بالتقدم. اقترب من الحصان ثم تفاعل للركوب؛ التفاعل بعيداً عنه يعيد الحياة والعدادات.</p><div class="row">${HEROES.map((h,i)=>`<button data-do="trainingHero" data-value="${i}" ${save.unlocked(i)?'':'disabled'}>${h.name}</button>`).join('')}</div><p class="tiny">الشخصية الحالية: ${HEROES[save.data.selectedHero].name}<br>ست ضربات عادية لكل بطل؛ الشحن المباشر C1، ومن ضربة إلى خمس ضربات ثم الشحن C2–C6. جرّب القفز ثم الضرب أو الشحن في الهواء.<br>على الخيل: الضرب لمسح الجانبين، الشحن للاجتياح؛ القفز ينزلك من السرج.</p>${this.controlHelp()}<div class="menuButtons"><button class="primary" data-do="trainingStart">دخول الساحة</button><button data-do="main">عودة</button></div>`, 'training')
    }
    pause(message = 'المعركة متوقفة') {
      let training = app.battle.mode === 'training';
      this.show(this.title('إيقاف مؤقت') + `<p>${message}</p><div class="menuButtons"><button class="primary" data-do="resume">متابعة</button><button data-do="restart">إعادة المعركة</button><button data-do="settings">الإعدادات</button><button data-do="quit">العودة للقائمة</button></div>${training?`<div class="row"><label>خصم التدريب <select id="practice">${Object.keys(TYPES).filter(type=>!['commander','bearer','captain'].includes(type)).map(x=>`<option value="${x}">${NAMES[x]||{raider:'مغير',shield:'حامل درع',pike:'حامل رمح',archer:'رامٍ'}[x]}</option>`).join('')}</select></label><button data-do="practice">إعادة الخصوم</button><button data-do="refill">ملء العدادات</button></div>`:''}<p class="tiny">الوقت والتبريد والتعزيزات مجمدة أثناء الإيقاف.</p>`, 'pause')
    }
    results(r) {
      let b = app.battle,
        st = b.stats;
      this.show(this.title(r.success ? 'نصر — رُفعت رايات الفجر' : 'هزيمة — ستعود الرايات', b.stage.name) + `<div class="row"><div class="brand">${r.rank}</div><p>النتيجة ${r.score} / ١٠٠<br>${r.success?'تحققت شروط المهمة':r.reason}</p></div><div class="results">${[['KO — إسقاطات اللاعب',st.ko],['زمن المعركة',fmt(b.time)],['ضباط مهزومون',st.officers],['أعلى تتابع',st.highCombo],['الضرر المُسبّب',Math.round(st.dealt)],['الضرر المستلم',Math.round(st.received)],['أهداف مكتملة',st.objectives],['صدّ متقن',st.parries||0],['تفادٍ متقن',st.perfectDodges||0],['كسر توازن',st.guardBreaks||0],['قواعد أسيرة',st.bases],['خبرة مكتسبة',r.xp],['شظايا الراية',r.shards],['المستوى',r.oldLevel+' ← '+r.level]].map(([name,v])=>`<div><span class="tiny">${name}</span><strong>${v}</strong></div>`).join('')}</div><p>${r.unlocks.length?'فُتح: '+r.unlocks.join(' • '):''}${r.success&&b.stage===STAGES[STAGES.length-1]&&b.mode==='campaign'?'<br>انطفأ سلاح الحصار، وثبّتت الرايات أرض فيراث. يعود الفجر من بين الشقوق.':''}</p>${r.newAchievements?.length?`<div class="newAchievements"><h3>إنجازات جديدة ✦</h3><p>${r.newAchievements.map(item=>item.name).join(' • ')}</p></div>`:''}<p class="tiny">التقييم: نجاح ٤٠، أهداف ٢٥، ضباط ١٠، كفاءة وقت ١٥، دفاع ١٠. الهزيمة لا تتجاوز ٥٤ نقطة. المكافأة مُثبتة مرة واحدة لكل معركة.</p>${save.memory?'<p class="tag">التخزين غير متاح. صدّر التقدم قبل إغلاق الصفحة.</p><button data-do="export">تصدير التقدم</button>':''}<div class="menuButtons"><button class="primary" data-do="quit">القائمة</button><button data-do="restart">إعادة المعركة</button></div>`, 'results')
    }
    settings(tab = this.tab) {
      this.tab = tab;
      if (!['settings', 'rebind'].includes(this.page)) this.settingsOrigin = this.page;
      let s = settings(),
        control = `<div class="settingsRow"><label>إظهار أزرار اللمس</label><select data-setting="touch"><option value="auto">تلقائي</option><option value="show">دائمًا</option><option value="hide">إخفاء</option></select></div>` + this.range('scale', 'حجم أزرار اللمس', .8, 1.2, .05) + this.range('opacity', 'شفافية الأزرار', .35, 1, .05) + this.range('sensitivity', 'حساسية الكاميرا', .4, 2, .1) + this.check('invert', 'عكس محور الكاميرا الرأسي') + this.check('floating', 'عصا لمس عائمة') + `<div id="bindStatus" class="tag"></div><div class="grid">${Object.keys(DEFAULT_KEYS).map(a=>`<button data-do="keybind" data-value="${a}">${TEXT_ACTIONS[a]} <kbd>${s.keyboard[a]}</kbd></button>`).join('')}</div><div class="row"><button data-do="resetControls">استعادة التحكم الافتراضي</button></div>${this.controlHelp()}`,
        gp = this.range('deadzone', 'منطقة حياد العصا', .05, .4, .01) + this.range('threshold', 'عتبة الزناد (تحرير أقل بـ٠٫٢)', .4, .8, .05) + `<div class="settingsRow"><label>محورا كاميرا اليد X / Y</label><input data-setting="camX" type="number" min="0" max="15" style="width:65px"><input data-setting="camY" type="number" min="0" max="15" style="width:65px"></div><p class="tiny">الربط القياسي يعمل تلقائياً لليد القياسية. لغير القياسية اضبط الأزرار هنا. حرّك المحور أو الزناد من حياده أثناء إعادة الربط.</p><div class="settingsRow"><label>اختيار يد متصلة</label><select id="padSelect"></select></div><div id="tester">جارٍ اكتشاف اليد. اضغط زرًا بعد الاتصال؛ قد يتطلب المتصفح صفحة HTTPS.</div><div id="bindStatus" class="tag"></div><div class="grid">${Object.keys(DEFAULT_BIND).map(a=>`<button data-do="padbind" data-value="${a}">${TEXT_ACTIONS[a]}: ${this.bindLabel(s.bindings[a])}</button>`).join('')}</div><div class="row"><button data-do="calibrate">معايرة الحياد</button><button data-do="resetPad">استعادة ربط PlayStation</button><button data-do="cancelBind">إلغاء الربط</button></div>`;
      this.show(this.title('الإعدادات') + `<div class="row">${[['graphics','الرسوم'],['audio','الصوت'],['controls','التحكم'],['gamepad','يد التحكم'],['progress','التقدم']].map(([k,n])=>`<button data-do="settingsTab" data-value="${k}" ${tab===k?'class="primary"':''}>${n}</button>`).join('')}</div>` + (tab === 'graphics' ? `<div class="settingsRow"><label>جودة مطلوبة</label><select data-setting="preset"><option value="performance">الأداء</option><option value="balanced">متوازنة</option><option value="quality">الجودة القصوى — حتى 4K</option></select></div>` + `<div class="settingsRow"><label>معدل الإطارات المستهدف</label><select data-setting="frameTarget"><option value="60">٦٠ إطارًا / ثانية</option><option value="30">٣٠ إطارًا / ثانية</option></select></div>` + this.check('auto', 'تكيّف تلقائي بحسب زمن الإطارات') + this.range('shake', 'اهتزاز الكاميرا — صفر للإيقاف', 0, 1, .1) + `<p class="tiny">الجودة الفعلية: ${app.performance.effective} • مقياس الرسم ${app.performance.scale.toFixed(2)}. تفاصيل الجنود ٨٠ / ١٢٠ / ١٦٠. دقة الجودة القصوى حتى ٨٫٣ مليون بكسل بحسب الشاشة، مع ظلال أدق. الحشود البعيدة تبقى مرئية. فعّل التكيّف على الأجهزة الأبطأ؛ دقة 4K تعتمد على حجم الشاشة وقدرة الجهاز.</p>` : tab === 'audio' ? this.range('master', 'الصوت العام — صفر للكتم', 0, 1, .05) + this.range('music', 'موسيقى المعركة', 0, 1, .05) + this.range('sfx', 'المؤثرات', 0, 1, .05) + `<p class="tiny">صوت إجرائي أصلي. قد تحتاج نقرة لتفعيل الصوت؛ اللعب الصامت متاح.</p><button data-do="audioTest">تفعيل واختبار الصوت</button>` : tab === 'controls' ? control : tab === 'gamepad' ? gp : `<p>شظايا الراية: ${save.data.shards}<br>${save.memory?'التخزين غير متاح؛ التقدم لهذه الجلسة فقط. استخدم التصدير.':'التقدم محفوظ محلياً.'} HTTPS هو المسار الموصى به؛ تخزين file:// يختلف بين المتصفحات.</p><div class="menuButtons"><button data-do="export">تصدير التقدم JSON</button><button data-do="import">استيراد التقدم</button><button class="danger" data-do="resetSave">حذف تقدم اللعبة</button></div><p class="tiny">لا حفظ سحابي ولا استعادة للمعركة بعد إعادة تحميل الصفحة.</p>`) + `<div class="menuButtons"><button data-do="settingsBack">عودة</button></div>`, 'settings');
      for (let e of $('screen').querySelectorAll('[data-setting]')) {
        let k = e.dataset.setting;
        if (e.type === 'checkbox') e.checked = s[k];
        else e.value = s[k];
        e.oninput = () => {
          s[k] = e.type === 'checkbox' ? e.checked : e.type === 'range' || e.type === 'number' || k === 'frameTarget' ? +e.value : e.value;
          save.write();
          if (k === 'master' && app.audio.master) app.audio.master.gain.value = s.master;
          if (k === 'preset' || k === 'frameTarget') app.performance.requested();
          this.touchVisibility()
        }
      }
    }
    check(k, n) {
      return `<div class="settingsRow"><label for="s-${k}">${n}</label><input id="s-${k}" type="checkbox" data-setting="${k}"></div>`
    }
    range(k, n, min, max, step) {
      return `<div class="settingsRow"><label for="s-${k}">${n}</label><input id="s-${k}" type="range" min="${min}" max="${max}" step="${step}" data-setting="${k}"></div>`
    }
    keyLabel(a) {
      const code=settings().keyboard[a] || DEFAULT_KEYS[a];
      return ({Space:'Space',AltLeft:'Alt',AltRight:'Alt يمين',ShiftLeft:'Shift',ShiftRight:'Shift يمين',Escape:'Esc',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'}[code] || code?.replace(/^Key/,'').replace(/^Digit/,''));
    }
    controlHelp() {
      const k=a=>`<kbd>${this.keyLabel(a)}</kbd>`,g=a=>`<kbd>${this.padLabel(a)}</kbd>`;
      return `<div class="controlHelp"><p class="tiny"><b>لوحة المفاتيح</b> ${['forward','left','back','right'].map(k).join(' ')} حركة • ${k('light')} ضرب • ${k('heavy')} شحن • ${k('jump')} قفز • ${k('dodge')} تفادٍ (امسك للركض) • ${k('sprint')} ركض • ${k('guard')} صدّ • ${k('skill1')} / ${k('skill2')} مهارات • ${k('ultimate')} قصوى • ${k('interact')} ركوب / نزول / تفاعل • ${k('lock')} تثبيت • ${k('cycle')} تبديل الهدف • ${k('pause')} إيقاف. اسحب الفأرة للكاميرا؛ الزران الأيسر والأيمن للضرب والشحن.</p><p class="tiny"><b>يد التحكم</b> العصا اليسرى حركة واليمنى كاميرا • ${g('light')} ضرب • ${g('heavy')} شحن • ${g('jump')} قفز • ${g('dodge')} تفادٍ (امسك للركض) • ${g('guard')} صدّ • ${g('skill1')} / ${g('skill2')} مهارات • ${g('ultimate')} قصوى • ${g('interact')} ركوب / نزول / تفاعل • ${g('lock')} تثبيت • ${g('cycle')} تبديل • ${g('pause')} إيقاف. الأسهم ↑ / ↓ لتقريب الكاميرا وإبعادها، ← / → لتبديل هدف المهمة. في القوائم: ${g('jump')} تأكيد و${g('dodge')} عودة.</p><p class="tiny"><b>اللمس</b> عصا يسار للحركة، واسحب مساحة الميدان الحرة لتحريك الكاميرا. استعمل زر قفز؛ يظهر زر ركوب أو نزول قرب الخيل. امسك التفادي للركض. القفز أثناء الركوب ينزلك من السرج.</p></div>`;
    }
    padLabel(a) {
      let b = settings().bindings[a];
      return typeof b === 'number' ? ({
        0: '×',
        1: '○',
        2: '□',
        3: '△',
        4: 'L1',
        5: 'R1',
        6: 'L2',
        7: 'R2',
        8: 'Share',
        9: 'Options',
        10: 'L3',
        11: 'R3'
      } [b] || 'B' + b) : this.bindLabel(b)
    }
    bindLabel(b) {
      return typeof b === 'number' ? 'B' + b : 'A' + b.axis + (b.sign > 0 ? '+' : '−')
    }
    action(action, value) {
      app.audio.sfx('ui');
      switch (action) {
        case 'release':
          this.show(this.title('عهد الرايات — توسعة الحرب','RIFTBANNER '+BUILD)+`<p>حملة أوسع وأبطال جدد ونظام تطوير يمنح كل معركة هدفًا جديدًا.</p><div class="grid"><div class="card"><h3>${HEROES.length} أبطال و${STAGES.length} فصول</h3><p class="tiny">ساحات جديدة ببيئات وأهداف مختلفة، مع تطوير الفصول الأولى. أسلحة وأدوار ومهارات إضافية وقادة يبدّلون أسلوبهم أثناء القتال.</p></div><div class="card"><h3>بناء البطل</h3><p class="tiny">خبرة وترقيات وآثار تفتحها أحداث الحملة. لكل بطل تجهيز مستقل، وسجل إنجازات يتابع انتصاراتك وإتقان القتال.</p></div><div class="card"><h3>تفاصيل الميدان</h3><p class="tiny">فرسان، قفز، هجمات جوية، صدّ وتفادٍ متقن، ومسارات C1–C6. خريطة تكتيكية وتقدم للأهداف وتبريد واضح لكل مهارة.</p></div><div class="card"><h3>سجل الحرب</h3><p class="tiny">دليل قابل للبحث لكل الأبطال والقادة والساحات، وشرح التكتيكات والتحكم. قوائم عربية تدعم الشاشات الصغيرة واللمس ويد التحكم.</p></div></div><p class="tiny">الحفظ القديم متوافق ويحتفظ بترقياتك وتقدمك وإعدادات التحكم. اللعبة مستقلة بأبطال ورسوم وأصوات أصلية تعمل محليًا.</p><div class="menuButtons"><button class="primary" data-do="missions">استكشف الحملة</button><button data-do="codex" data-value="guide">دليل القتال</button><button data-do="main">القائمة</button></div>`, 'release');
          break;
        case 'continue':
          this.mode='campaign';this.brief(+value);
          break;
        case 'codex':
          this.codex(value||'heroes');
          break;
        case 'equip': {
          const [hero,id]=value.split(',');
          if(typeof save.equip==='function')save.equip(+hero,id);
          this.upgrades(+hero);break;
        }
        case 'main':
          this.main();
          break;
        case 'quit':
          app.quit();
          break;
        case 'heroes':
          this.heroes();
          break;
        case 'previewHero':
          this.previewHero(+value);
          break;
        case 'previewPrevious':
          this.previewHero((this.preview?.index??0)-1);
          break;
        case 'previewNext':
          this.previewHero((this.preview?.index??0)+1);
          break;
        case 'previewAttack':
          this.preview?.attack();
          break;
        case 'previewTurn':
          if(this.preview)this.preview.yaw += +value*.35;
          break;
        case 'hero':
          if(!save.unlocked(+value))break;
          save.data.selectedHero = +value;
          save.write();
          this.heroes();
          break;
        case 'upgrade':
          if(!save.unlocked(+value))break;
          this.upgrades(+value);
          break;
        case 'buy': {
          let [i, k] = value.split(',').map(Number), p = save.data.heroes[i], cost = 30 * (p.up[k] + 1);
          if (p.up[k] < 3 && save.data.shards >= cost) {
            save.data.shards -= cost;
            p.up[k]++;
            save.write()
          }
          this.upgrades(i);
          break
        }
        case 'missions':
          this.missions(this.mode || 'campaign');
          break;
        case 'campaign':
          this.missions('campaign');
          break;
        case 'skirmish':
          if (save.data.completed[0]) this.missions('skirmish');
          break;
        case 'brief':
          this.brief(+value);
          break;
        case 'start':
          app.gesture();
          app.start(save.data.selectedStage, this.mode || 'campaign');
          break;
        case 'training':
          this.trainingMenu();
          break;
        case 'trainingHero':
          save.data.selectedHero = +value;
          save.write();
          this.trainingMenu();
          break;
        case 'trainingStart':
          app.gesture();
          app.start(0, 'training');
          break;
        case 'resume':
          app.gesture(false);
          app.resume();
          break;
        case 'restart':
          app.gesture(false);
          app.start(STAGES.indexOf(app.battle.stage), app.battle.mode);
          break;
        case 'practice':
          app.battle.trainingReset($('practice').value);
          app.resume();
          break;
        case 'refill':
          app.player.energy = app.player.ult = 100;
          app.combat.ultimateLock = 0;
          app.player.hp = app.player.maxHp;
          app.resume();
          break;
        case 'settings':
          this.settings();
          break;
        case 'settingsTab':
          app.input.rebind = null;
          this.settings(value);
          break;
        case 'settingsBack':
          app.input.rebind = null;
          if (app.state === 'Paused') this.pause();
          else this.main();
          break;
        case 'keybind':
          app.input.startRebind('key', value);
          break;
        case 'padbind':
          app.input.startRebind('pad', value);
          break;
        case 'cancelBind':
          app.input.rebind = null;
          this.settings('gamepad');
          break;
        case 'resetControls':
          Object.assign(settings(), {
            keyboard: {
              ...DEFAULT_KEYS
            },
            scale: 1,
            opacity: .85,
            sensitivity: 1,
            invert: false,
            floating: false,
            touch: 'auto'
          });
          save.write();
          this.settings('controls');
          break;
        case 'resetPad':
          settings().bindings = {
            ...DEFAULT_BIND
          };
          if (app.input.signature) settings().profiles[app.input.signature] = {
            ...DEFAULT_BIND
          };
          save.write();
          this.settings('gamepad');
          break;
        case 'calibrate':
          if (app.input.pad) {
            let axes = app.input.pad.axes,
              neutral = Math.max(Math.hypot(axes[0] || 0, axes[1] || 0), Math.hypot(axes[2] || 0, axes[3] || 0));
            settings().deadzone = clamp(neutral + .05, .05, .4);
            save.write();
            this.settings('gamepad')
          } else $('bindStatus').textContent = 'لم تظهر يد التحكم بعد. اضغط زرًا في اليد.';
          break;
        case 'audioTest':
          app.audio.unlock();
          app.audio.sfx('parry');
          break;
        case 'export':
          save.export();
          break;
        case 'import':
          $('importFile').click();
          break;
        case 'resetSave':
          if (confirm('حذف تقدم رايات الصدع وترقياتها نهائيًا؟')) {
            save.data = defaults();
            save.write();
            app.input.clear();
            app.performance.requested();
            this.main()
          }
          break;
      }
    }
    confirmMenu() {
      let e = document.activeElement;
      if (e?.tagName === 'SELECT' || e?.tagName === 'INPUT' && ['range', 'number', 'search', 'text'].includes(e.type)) {
        this.editing = !this.editing;
        e.style.outline = this.editing ? '2px solid #58d5c5' : ''
      } else e?.click()
    }
    focus(direction) {
      let e = document.activeElement;
      if (this.editing) {
        if (e?.tagName === 'SELECT') {
          e.selectedIndex = clamp(e.selectedIndex + direction, 0, e.options.length - 1);
          e.dispatchEvent(new Event('input'));
          e.dispatchEvent(new Event('change'));
          return
        }
        if (e?.tagName === 'INPUT' && ['range','number'].includes(e.type)) {
          e.value = clamp(+e.value + direction * (+e.step || 1), +e.min, +e.max);
          e.dispatchEvent(new Event('input'));
          return
        }
      }
      let items = Array.from($('screen').querySelectorAll('button:not(:disabled),select,input:not([type=file]),summary')),
        i = items.indexOf(document.activeElement);
      items=items.filter(item=>!item.closest('[hidden]'));
      i=items.indexOf(document.activeElement);
      items[(i + direction + items.length) % items.length]?.focus()
    }
    back() {
      if (this.editing) {
        this.editing = false;
        if (document.activeElement) document.activeElement.style.outline = '';
        return
      }
      if (app.state === 'Playing') app.pause();
      else if (app.state === 'Paused') {
        if (this.page === 'settings') this.pause();
        else app.resume()
      } else if (this.page === 'brief') this.missions(this.mode);
      else if (this.page === 'upgrade') this.heroes();
      else this.main()
    }
    touchVisibility() {
      let s = settings();
      document.documentElement.style.setProperty('--scale', s.scale);
      document.documentElement.style.setProperty('--opacity', s.opacity);
      let show = s.touch === 'show' || s.touch === 'auto' && (app?.input?.mode === 'touch' || app?.input?.mode !== 'gamepad' && navigator.maxTouchPoints > 0);
      $('controls').classList.toggle('on', !!show && app?.state === 'Playing');
      $('hud').classList.toggle('touchMode', !!show);
      $('hint').style.display = show ? 'none' : ''
    }
    message(text, duration = 4) {
      this.noticeScene=app?.scene;
      $('notice').textContent = text;
      this.noticeTime = duration;
      $('notice').style.opacity = text ? '1' : '0'
    }
    playing() {
      if(this.noticeScene&&this.noticeScene!==app.scene)this.message('',0);
      this.hudClock=0;
      $('screen').classList.add('hide');
      $('hud').classList.add('on');
      this.touchVisibility()
    }
    update(dt) {
      this.noticeTime -= dt;
      if (this.noticeTime <= 0) $('notice').style.opacity = 0;
      this.testerClock -= dt;
      if (this.page === 'settings' && this.tab === 'gamepad' && this.testerClock <= 0) {
        this.testerClock = .1;
        let p = app.input.pad;
        if (p) {
          let select = $('padSelect');
          if (select) {
            let pads = app.input.getPads();
            if (select.options.length !== pads.length) {
              select.innerHTML = '';
              for (let gp of pads) {
                let o = document.createElement('option');
                o.value = gp.index;
                o.textContent = gp.index + ' • ' + gp.id.slice(0, 70);
                select.appendChild(o)
              }
            }
            select.value = p.index;
            select.onchange = () => {
              app.input.clear();
              app.input.padIndex = +select.value;
              app.input.signature = ''
            }
          }
          let duplicates = Object.entries(settings().bindings).filter(([a, b], i, arr) => arr.some(([aa, bb], j) => i !== j && JSON.stringify(b) === JSON.stringify(bb))).map(([a]) => a),
            lines = [p.id, 'index: ' + p.index + ' / mapping: ' + (p.mapping || 'non-standard'), 'axes: ' + p.axes.length + ' buttons: ' + p.buttons.length, 'Deadzone: ' + settings().deadzone.toFixed(2) + ' / neutral ' + (Math.hypot(p.axes[0] || 0, p.axes[1] || 0) < settings().deadzone ? '●' : '○')];
          lines.push(p.axes.map((v, i) => 'A' + i + ': ' + v.toFixed(2)).join('  '));
          lines.push(p.buttons.map((b, i) => 'B' + i + ':' + b.value.toFixed(2)).join(' '));
          lines.push('Actions: ' + Object.entries(app.input.sources.pad).filter(([a, v]) => v).map(([a]) => a).join(', '));
          lines.push('Duplicate bindings: ' + (duplicates.join(', ') || 'none'));
          $('tester').textContent = lines.join('\n')
        } else $('tester').textContent = app.input.padError ? 'Controller API: ' + app.input.padError + ' — جرّب HTTPS وإعادة التركيز.' : 'لا توجد يد ظاهرة. وصّلها واضغط زرًا؛ لا يمكن للصفحة فرض كشف Bluetooth.'
      }
      if (app.state !== 'Playing') return;
      this.hudClock -= dt;
      if (this.hudClock > 0) return;
      this.hudClock = .08;
      let p = app.player,
        b = app.battle,
        h = HEROES[p.hero];
      $('heroName').textContent = h.name + ' • ' + h.weapon;
      for (let [key, value, max] of [
          ['hp', p.hp, p.maxHp],
          ['energy', p.energy, 100],
          ['ult', p.ult, 100]
        ]) {
        $(key + 'Fill').style.width = clamp(value / max * 100, 0, 100) + '%';
        $(key + 'Text').textContent = Math.ceil(value) + ' / ' + Math.ceil(max)
      }
      $('guardHUD').style.display = p.state === 'Guard' || p.guard < 95 || p.shield > 0 ? 'block' : 'none';
      $('guardFill').style.width = p.guard + '%';
      $('shieldText').textContent = p.shield > 0 ? 'درع: ' + Math.ceil(p.shield) : 'توازن الصدّ: ' + Math.floor(p.guard);
      $('time').textContent = fmt(b.time) + ' / ' + fmt(b.stage.limit);
      const route=p.attack?.kind==='heavy'?p.attack.routeName:null;
      const guide=$('comboGuide');
      guide.style.display=b.mode==='training'||route?'block':'none';
      guide.textContent=route ? `${route} • ${p.attack.label||''}` : `شحن مباشر C1 • عادي ×1–5 ثم شحن C2–C6`;
      if(b.mode==='training'&&!route&&app.combat.chainTime>0)guide.textContent=`السلسلة ${app.combat.chain} / ${h.chain} • △ مسار C${Math.min(app.combat.chain+1,6)} • ○ إلغاء وتفادٍ`;
      $('ko').innerHTML = '<b>KO ' + b.stats.ko + '</b><span>' + b.stats.combo + ' HIT</span><i style="width:'+clamp(b.stats.comboTime/2.5*100,0,100)+'%"></i>';
      this.updateReadouts(p);
      const total=b.mode==='skirmish'?b.bases.length+1:b.stage.nodes.length;
      const done=b.mode==='skirmish'?b.bases.filter(base=>base.owner===0).length+(b.fieldOfficer?.hp<=0?1:0):b.completed?.size??b.node;
      const objectiveMarkup=b.mode==='training'?'<span>ساحة التدريب</span>':`<span>الهدف ${Math.min(done+1,total)} / ${total}</span><span>${done} مكتمل</span><i style="width:${clamp(done/Math.max(1,total)*100,0,100)}%"></i>`;
      if(this.objectiveMarkup!==objectiveMarkup){$('objectiveProgress').innerHTML=objectiveMarkup;this.objectiveMarkup=objectiveMarkup;}
      const abilityMarkup=h.skills.map((name,k)=>{const cost=k?40:25,remaining=p.cooldowns[k]||0,ready=remaining<=0&&p.energy>=cost;return `<div class="abilityReadout ${ready?'ready':''}"><b>${name}</b><span>${remaining>0?Math.ceil(remaining)+'ث':p.energy<cost?'طاقة '+cost:(app.input.mode==='gamepad'?this.padLabel('skill'+(k+1)):this.keyLabel('skill'+(k+1)))+' • جاهزة'}</span></div>`;}).join('')+`<div class="abilityReadout ${p.ult>=100?'ready ultimateReady':''}"><b>القصوى</b><span>${p.ult>=100?'جاهزة ✦':Math.floor(p.ult)+'٪'}</span></div>`;
      if(this.abilityMarkup!==abilityMarkup){$('abilityHUD').innerHTML=abilityMarkup;this.abilityMarkup=abilityMarkup;}
      $('objText').textContent = b.mode === 'training' ? 'تدريب آمن — جرّب القتال والصدّ' : b.mode === 'skirmish' ? 'استولِ على كل القواعد واهزم ضابط الميدان' : b.stage.nodes[b.node] || 'اكتملت المهمة';
      let target = b.selectedTarget(),
        distance = target ? dist(p, target) : 0;
      $('navigation').textContent = target ? ((b.optional === 1 && b.optionalBase?.owner === 1 ? 'اختياري • ' : '') + (target.name || NAMES[target.type] || {
        raider: 'مغير معادٍ',
        shield: 'حامل درع',
        archer: 'رامٍ معادٍ',
        pike: 'حامل رمح'
      } [target.type] || 'الهدف') + ' • ' + Math.round(distance) + ' م ' + this.direction(target)) : '';
      let base = b.bases.find(a => dist(a, p) < a.radius + 2);
      const defending=b.activeStep?.()?.kind==='defend';
      $('objSub').textContent=defending
        ? !b.defenseReady?'رافق قائد الفجر إلى راية الدفاع':b.defense>0?'وقت الدفاع المتبقي: '+fmt(b.defense)+' • احمِ الراية':'أزل المهاجمين قرب راية الدفاع'
        : base ? base.captain?.hp>0?'اهزم قائد الحامية أولاً':base.owner===0?'راية الفجر • '+Math.floor(base.progress)+'٪':'الأسر '+Math.floor(base.progress)+'٪ — أزل الخصوم من الدائرة'
        : b.escort&&!b.escortWaiting&&dist(p,b.escort)>14?'حامل الراية ينتظر قربك؛ عُد إلى العلامة المثلثة'
        : b.defense>0?'وقت الدفاع المتبقي: '+fmt(b.defense)
        : (b.stage===STAGES[0]&&b.node===2||b.stage===STAGES[1]&&b.node===3||b.stage===STAGES[2]&&b.node===3)?'أزل ما تبقى من المهاجمين قرب الراية':'امسك التفادي للركض نحو الهدف';
      let relevant = app.camera.target || app.store.actors.filter(a => a.faction === 1 && a.elite && a.hp > 0 && dist(a, p) < 16).sort((a, c) => dist(a, p) - dist(c, p))[0];
      $('enemybar').style.display = relevant ? 'block' : 'none';
      if (relevant) {
        $('enemyName').textContent=(NAMES[relevant.type]||'ضابط')+(relevant.phase>1?' • المرحلة '+relevant.phase:'');
        $('enemyFill').style.width = relevant.hp / relevant.maxHp * 100 + '%';
        $('postureFill').style.width = relevant.posture / relevant.maxPosture * 100 + '%'
      }
      let critical = b.escort || b.commander;
      $('critical').classList.toggle('inDanger',!!critical&&critical.hp/Math.max(1,critical.maxHp)<.35);
      $('critical').textContent = critical ? (b.escort ? 'حامل الراية' : 'قائد الفجر') + ' ' + Math.ceil(critical.hp) + ' / ' + critical.maxHp : '';
      const mountedHorse=p.mounted?app.mounts?.horse:null, nearbyHorse=p.mounted?null:app.mounts?.nearby?.();
      const horse=mountedHorse||nearbyHorse, horseInteraction=!!app.mounts?.canInteract?.();
      const interactAvailable=horse?horseInteraction:!!b.interaction();
      const interactLabel=p.mounted?'نزول':nearbyHorse?'ركوب':'تفاعل';
      $('horseHUD').hidden=!horse;
      if(horse){
        $('horseName').textContent=horse.name;
        $('horseState').textContent=p.mounted?(horse.exhausted?'استعادة الطاقة':Math.round(horse.speed||0)+' م/ث'):'جاهز للركوب';
        $('horseFill').style.width=clamp(horse.stamina/Math.max(1,horse.maxStamina)*100,0,100)+'%';
        $('horseHint').textContent=horseInteraction?(app.input.mode==='gamepad'?this.padLabel('interact'):this.keyLabel('interact'))+' '+interactLabel:'أكمل الحركة أولاً';
      }
      for (let el of document.querySelectorAll('.action')) {
        let action = el.dataset.a;
        if (action === 'skill1' || action === 'skill2') {
          let k = action === 'skill1' ? 0 : 1;
          el.classList.toggle('unready', p.cooldowns[k] > 0 || p.energy < (k ? 40 : 25));
          el.querySelector('small').textContent = p.cooldowns[k] > 0 ? Math.ceil(p.cooldowns[k]) + 'ث' : this.padLabel(k ? 'skill2' : 'skill1') + ' • ' + (k ? 40 : 25)
        }
        if (['light', 'heavy', 'jump', 'dodge', 'guard', 'ultimate'].includes(action)) el.querySelector('small').textContent = this.padLabel(action);
        if (action === 'ultimate') el.classList.toggle('unready', p.ult < 100);
        if (action === 'jump') el.setAttribute('aria-label',p.mounted?'نزول من الخيل':'قفز');
        if (action === 'interact') {
          el.style.display=interactAvailable?'block':'none';
          el.querySelector('span').textContent=interactLabel;
          el.querySelector('small').textContent=this.padLabel('interact');
          el.setAttribute('aria-label',interactLabel+(horse?' '+horse.name:''));
        }
      }
      const binding=a=>app.input.mode==='gamepad'?this.padLabel(a):this.keyLabel(a);
      $('hint').textContent=(app.input.mode==='gamepad'?'LS':(['forward','left','back','right'].map(a=>this.keyLabel(a)).join('')))+' حركة • '+binding('light')+' ضرب • '+binding('heavy')+' شحن • '+binding('jump')+' قفز • '+binding('dodge')+' تفادٍ • '+binding('guard')+' صدّ • '+binding('ultimate')+' قصوى'+(interactAvailable?' • '+binding('interact')+' '+interactLabel:'');
      let t = app.camera.target;
      if (t) {
        let v = B.Vector3.Project(new B.Vector3(t.x, 2.7, t.z), B.Matrix.Identity(), app.scene.getTransformMatrix(), app.camera.camera.viewport.toGlobal(innerWidth, innerHeight));
        $('lockmarker').style.display = 'block';
        $('lockmarker').style.left = v.x - 10 + 'px';
        $('lockmarker').style.top = v.y - 10 + 'px'
      } else $('lockmarker').style.display = 'none'
    }
    updateReadouts(p) {
      const now=performance.now();
      if(this.readoutScene!==app.scene){
        this.observedHealth.clear();this.readoutScene=app.scene;
        for(const label of this.damageLabels){label.until=0;label.el.hidden=true;}
      }
      const vp=app.camera.camera.viewport.toGlobal(innerWidth,innerHeight),matrix=app.scene.getTransformMatrix(),identity=B.Matrix.Identity();
      const project=(a,height=2.75)=>B.Vector3.Project(new B.Vector3(a.x,(a.y||0)+height,a.z),identity,matrix,vp);
      const blockers=['battleInfo','mini','ko','time','pauseButton','horseHUD'].map(id=>$(id)).concat($('hud').querySelector('.status'));
      if($('controls').classList.contains('on'))blockers.push($('stick'),document.querySelector('.actions'));
      const covered=blockers.filter(Boolean).map(el=>el.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
      const inView=v=>v.z>0&&v.z<1&&v.x>58&&v.x<innerWidth-58&&v.y>74&&v.y<innerHeight-45&&!covered.some(r=>v.x+58>r.left&&v.x-58<r.right&&v.y+8>r.top&&v.y-24<r.bottom);
      const nearest=[];
      for(const a of app.store.actors){
        if(a.faction!==1)continue;
        const key=a.id+':'+a.gen,old=this.observedHealth.get(a.id),distance=dist(a,p);
        if(old&&old.key===key&&old.hp>a.hp&&distance<18){
          const label=this.damageLabels[this.damageCursor++%this.damageLabels.length];
          label.x=a.x;label.z=a.z;label.y=a.y||0;label.until=now+650;label.el.textContent=Math.round(old.hp-a.hp);
          label.el.classList.toggle('strong',old.hp-a.hp>=60);
        }
        this.observedHealth.set(a.id,{key,hp:a.hp});
        if(a.hp>0&&a.elite&&distance<20&&app.collision.visible(p,a))nearest.push({a,distance});
      }
      nearest.sort((a,b)=>a.distance-b.distance);
      const seen=nearest.map(entry=>({a:entry.a,v:project(entry.a)})).filter(entry=>inView(entry.v)).slice(0,this.unitBars.length);
      for(let i=0;i<this.unitBars.length;i++){
        const bar=this.unitBars[i],entry=seen[i];bar.hidden=!entry;
        if(!entry)continue;
        bar.style.transform='translate(-50%, -100%) translate('+entry.v.x+'px,'+entry.v.y+'px)';
        bar.querySelector('span').textContent=NAMES[entry.a.type]||'ضابط';
        bar.querySelector('i').style.width=clamp(entry.a.hp/entry.a.maxHp*100,0,100)+'%';
      }
      for(const label of this.damageLabels){
        label.el.hidden=label.until<=now;if(label.el.hidden)continue;
        const progress=1-(label.until-now)/650,v=project(label, 2.3+.8*progress);
        if(!inView(v)){label.el.hidden=true;continue;}
        label.el.style.transform='translate(-50%, -50%) translate('+v.x+'px,'+v.y+'px)';
        label.el.style.opacity=Math.min(1,(label.until-now)/190);
      }
    }
    direction(t) {
      let a = wrap(angle(t.x - app.player.x, t.z - app.player.z) - app.camera.yaw);
      return a < -.6 ? '↖' : a > .6 ? '↗' : '↑'
    }
  }
  // Original cavalry simulation. Horses share battlefield collision and fixed-step
  // time with the rider; riding never bypasses gates, capture rules, or objectives.
