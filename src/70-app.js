  class HorseSystem {
    constructor(stage, spawn) {
      this.horse = null;
      this.clock = 0;
      this.cooldown = 0;
      this.trampleHits = new Map();
      const breeds = [
        {name:'ريح السهل',breed:'chestnut',color:'#9b5534',pace:10.5,gallopSpeed:16.8,recovery:10},
        {name:'غيمة الفجر',breed:'white',color:'#ded7c5',pace:10,gallopSpeed:15.6,recovery:13},
        {name:'ظل الراية',breed:'dark-bay',color:'#40302b',pace:10.8,gallopSpeed:18,recovery:8}
      ];
      const occupied=[];
      this.horses = breeds.map((breed,id) => {
        const desired = {x:spawn[0] + (id-1)*4.5,z:spawn[1]+5.2};
        let point=this.safePoint(desired,1);
        if (!point || occupied.some(other=>dist(other,point)<2.4)) {
          point=null;
          for (let radius=4;radius<=10&&!point;radius+=2) for (let slot=0;slot<16&&!point;slot++) {
            const theta=(slot+id)*Math.PI/8,trial={x:spawn[0]+Math.sin(theta)*radius,z:spawn[1]+Math.cos(theta)*radius};
            if (!app.collision.blocked(trial.x,trial.z,1) && app.collision.visible({x:spawn[0],z:spawn[1]},trial,.3) &&
                !occupied.some(other=>dist(other,trial)<2.4)) point=trial;
          }
        }
        point=point||this.safePoint({x:spawn[0],z:spawn[1]},1);
        if (point) occupied.push(point);
        return {...breed,id,x:point?.x??spawn[0],z:point?.z??spawn[1],yaw:0,
          speed:0,phase:id*.7,gallop:false,mounted:false,stamina:100,maxStamina:100,
          exhausted:false,mountTime:0,turnLean:0,visible:true};
      });
    }
    safePoint(origin, radius=.6) {
      if (!app.collision.blocked(origin.x,origin.z,radius)) return {x:origin.x,z:origin.z};
      for (let ring=1;ring<=8;ring++) for (let step=0;step<16;step++) {
        const theta=step*Math.PI/8, x=origin.x+Math.sin(theta)*ring*.65,
          z=origin.z+Math.cos(theta)*ring*.65;
        if (!app.collision.blocked(x,z,radius) && app.collision.visible(origin,{x,z},.3)) return {x,z};
      }
      return null;
    }
    nearby() {
      if (this.horse) return this.horse;
      const p=app.player;
      if (!p || p.dead || p.hp<=0) return null;
      let nearest=null, range=3.2;
      for (const horse of this.horses) {
        const d=dist(p,horse);
        if (!horse.mounted && d<range && app.collision.visible(p,horse,.3)) {nearest=horse;range=d;}
      }
      return nearest;
    }
    canInteract() {
      const p=app.player;
      return !!p && p.hp>0 && !p.dead && !p.attack && p.state!=='Stagger' &&
        p.state!=='HeavyCharge' && (p.y||0)<.1 && !!this.nearby();
    }
    interact() {
      // A nearby horse owns the interaction even during a swing. Consuming a
      // temporarily unavailable mount action prevents accidental gate/training use.
      if (!this.nearby()) return false;
      if (!this.canInteract()) return true;
      if (this.cooldown>0) return true;
      if (this.horse) {this.dismount();return true;}
      const p=app.player, horse=this.nearby();
      if (!horse || app.collision.blocked(horse.x,horse.z,1)) return false;
      this.horse=horse;horse.mounted=true;horse.mountTime=0;horse.speed=0;
      p.mounted=true;p.mountHeight=1.14;p.y=p.vy=0;p.airFollow=0;p.airAttacks=0;p.chargeRoute=undefined;
      p.x=horse.x;p.z=horse.z;p.yaw=horse.yaw;p.state='Idle';p.stateTime=0;
      p.invul=Math.max(p.invul,.3);app.combat.clearBuffers();
      app.combat.chain=app.combat.chainTime=0;
      this.cooldown=.35;
      app.camera.target=null;
      app.audio.sfx('mount');
      app.ui.message('ركبت '+horse.name+' • تحرّك، اضرب، واندفع بالركض. القفز أو التفاعل للنزول.',3.5);
      return true;
    }
    dismount(forced=false) {
      const horse=this.horse, p=app.player;
      if (!horse || !p) return false;
      let point=null;
      for (const side of [1,-1,0]) {
        const yaw=horse.yaw+(side===0?Math.PI:side*Math.PI/2),
          trial={x:horse.x+Math.sin(yaw)*1.65,z:horse.z+Math.cos(yaw)*1.65};
        if (!app.collision.blocked(trial.x,trial.z,.55) && app.collision.visible(horse,trial,.3)) {point=trial;break;}
      }
      point=point||this.safePoint(horse,.55)||{x:horse.x,z:horse.z};
      p.mounted=false;p.mountHeight=0;p.x=point.x;p.z=point.z;p.y=0;p.vy=0;p.chargeRoute=undefined;
      horse.mounted=false;horse.speed=0;horse.gallop=false;horse.turnLean=0;
      this.horse=null;this.cooldown=.45;this.trampleHits.clear();
      if (!forced) {
        p.attack=null;p.state='Recover';p.stateTime=0;p.invul=Math.max(p.invul,.25);
        app.combat.clearBuffers();app.combat.chain=app.combat.chainTime=0;
        app.audio.sfx('mount');app.ui.message('نزلت عن '+horse.name,1.8);
      }
      return true;
    }
    move(dx,dz,m,dt,sprinting=false) {
      const horse=this.horse,p=app.player;
      if (!horse || !p.mounted || dt<=0) return;
      m=clamp(m,0,1);
      const active=m>.05 && p.hp>0 && !p.dead && p.state!=='Stagger';
      const requested=active && sprinting && !horse.exhausted && horse.stamina>0;
      horse.gallop=requested;
      const desired=active?(requested?horse.gallopSpeed:horse.pace)*m:0;
      horse.speed=lerp(horse.speed,desired,1-Math.exp(-dt*(active?3.8:8)));
      if (active) {
        const wanted=angle(dx,dz), turn=clamp(wrap(wanted-horse.yaw),-dt*3.6,dt*3.6);
        horse.yaw+=turn;horse.turnLean=lerp(horse.turnLean,clamp(turn/Math.max(.001,dt)*.07,-.2,.2),Math.min(1,dt*8));
      } else horse.turnLean*=Math.exp(-dt*8);
      const before={x:p.x,z:p.z};
      app.collision.move(p,Math.sin(horse.yaw)*horse.speed*dt,Math.cos(horse.yaw)*horse.speed*dt,1);
      const travelled=dist(before,p),actual=travelled/Math.max(.001,dt);
      if (travelled<horse.speed*dt*.1) horse.speed*=Math.exp(-dt*10);
      horse.x=p.x;horse.z=p.z;
      p.yaw=horse.yaw;
      horse.phase+=travelled*(horse.gallop?1.55:2.0);
      p.mountPhase=horse.phase;
      if (actual>11.8 && active) this.trample(before,p,horse);
    }
    trample(before,p,horse) {
      const vx=p.x-before.x,vz=p.z-before.z,length2=vx*vx+vz*vz;
      for (const target of app.spatial.query(p.x,p.z,2.6)) {
        if (target.faction===p.faction || target.hp<=0 || target.dead || target.y>.8) continue;
        const key=target.id+':'+target.gen;
        if ((this.trampleHits.get(key)||0)>this.clock) continue;
        const t=length2>.000001?clamp(((target.x-before.x)*vx+(target.z-before.z)*vz)/length2,0,1):0;
        if (Math.hypot(target.x-before.x-vx*t,target.z-before.z-vz*t)>1.25) continue;
        if (!app.collision.visible(p,target)) continue;
        this.trampleHits.set(key,this.clock+1.15);
        app.combat.damage(target,p.dmg*(target.elite?.18:.38),p,target.elite?8:25,1.3,false,{kind:'trample',knockdown:!target.elite});
        app.effects.impact(target.x,target.z,{yaw:horse.yaw,height:.55});
      }
    }
    update(dt) {
      this.clock+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
      const p=app.player;
      if (this.horse && (p.dead||p.hp<=0)) this.dismount(true);
      for (const horse of this.horses) {
        horse.mountTime+=dt;
        if (horse===this.horse) {
          horse.x=p.x;horse.z=p.z;
          if (p.state==='Stagger') {horse.speed=0;horse.gallop=false;horse.turnLean=0;}
          if (horse.gallop && horse.speed>10) horse.stamina=Math.max(0,horse.stamina-dt*15);
          else horse.stamina=Math.min(horse.maxStamina,horse.stamina+dt*horse.recovery);
          if (horse.stamina<=0 && !horse.exhausted) {
            horse.exhausted=true;horse.gallop=false;app.ui.message('الحصان متعب؛ خفّف الاندفاع حتى يستعيد تحمّله.',2.4);
          }
          if (horse.stamina>=28) horse.exhausted=false;
        } else {
          horse.stamina=Math.min(horse.maxStamina,horse.stamina+dt*horse.recovery);
          if (horse.stamina>=28) horse.exhausted=false;
        }
      }
      if (this.trampleHits.size>64) for (const [key,until] of this.trampleHits) if (until<=this.clock) this.trampleHits.delete(key);
    }
  }
  class GameApp {
    constructor() {
      this.state = 'Boot';
      this.debug = new URLSearchParams(location.search).has('debug');
      this.acc = 0;
      this.last = performance.now();
      this.lastRender = 0;
      this.contextLost = false;
      this.cycles = 0;
      this.manualSimulation = false;
      this.engine = new B.Engine($('game'), true, {
        preserveDrawingBuffer: false,
        stencil: false,
        disableWebGL2Support: false,
        powerPreference: 'high-performance'
      }, false);
      this.performance = new PerformanceManager(this.engine);
      this.audio = new AudioManager();
      this.input = new InputManager();
      this.ui = new UIManager();
      this.minimap = new MinimapRenderer();
      this.lifecycle();
      console.info('RIFTBANNER ' + BUILD + ' Babylon ' + B.Engine.Version);
      this.engine.runRenderLoop(() => {
        try {
          this.frame()
        } catch (e) {
          this.fatal(e)
        }
      })
    }
    gesture(fullscreen = true) {
      this.audio.unlock();
      if (fullscreen && navigator.maxTouchPoints > 0) {
        try {
          document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {})
        } catch (_) {}
      }
    }
    disposeScene() {
      this.ui.preview?.dispose();
      this.ui.preview = null;
      this.instrumentation?.dispose();
      this.scene?.dispose();
      this.scene = null;
      this.mounts = null;
      this.input.clear();
      this.acc = 0;
      this.audio.pause();
      this.cycles++
    }
    start(stageIndex, mode) {
      this.state = 'LoadingBattle';
      this.disposeScene();
      this.camera = null;
      stageIndex = Number.isInteger(stageIndex) ? clamp(stageIndex, 0, STAGES.length - 1) : 0;
      rnd.reset(0x72b61 + stageIndex * 909 + (mode === 'skirmish' ? 333 : 0));
      let stage = mode === 'training' ? {
        ...STAGES[0],
        name: 'ساحة الراية • التدريب',
        w: 44,
        h: 40,
        training: true,
        points: [
          [0, -12],
          [0, 0],
          [0, 5],
          [10, 10],
          [-10, 10]
        ]
      } : STAGES[stageIndex];
      this.collision = new CollisionWorld(stage);
      this.scene = new B.Scene(this.engine);
      this.world = new WorldBuilder(this.scene, stage);
      this.store = new ActorStore();
      this.spatial = new SpatialIndex();
      this.combat = new CombatSystem();
      let spawn = stage.points[0];
      this.player = this.combat.initPlayer(save.data.selectedHero, spawn[0], spawn[1]);
      this.mounts = new HorseSystem(stage, spawn);
      this.renderer = new ActorRenderer(this.scene, this.world.materials);
      this.effects = new EffectsManager(this.scene, this.world.materials);
      this.camera = new CameraRig(this.scene);
      this.camera.yaw = stageIndex === 1 ? Math.PI / 2 : 0;
      this.camera.pivot.set(this.player.x, 1.6, this.player.z);
      this.instrumentation = new B.SceneInstrumentation(this.scene);
      this.instrumentation.captureFrameTime = true;
      this.instrumentation.captureActiveMeshesEvaluationTime = true;
      this.battle = new ObjectiveDirector(stage, mode);
      this.visualBattleTime = 0;
      this.minimap.build();
      this.performance.frames = [];
      this.performance.high = this.performance.low = 0;
      this.state = 'Playing';
      this.last = performance.now();
      this.lastRender = 0;
      this.ui.playing();
      this.audio.resume();
      this.resize();
      $('game').focus();
      console.info('Battle loaded:', stageIndex, mode, 'actors', this.store.actors.length)
    }
    quit() {
      this.disposeScene();
      this.start(0, 'training');
      this.state = 'Menu';
      this.ui.main()
    }
    pause(reason = 'المعركة متوقفة') {
      if (this.state !== 'Playing') return;
      this.state = 'Paused';
      this.input.clear();
      this.acc = 0;
      this.audio.pause();
      this.ui.pause(reason)
    }
    resume() {
      if (!this.scene || this.contextLost) return;
      this.input.clear();
      this.acc = 0;
      this.last = performance.now();
      this.state = 'Playing';
      this.ui.playing();
      this.audio.resume();
      this.resize();
      $('game').focus()
    }
    result(r) {
      this.state = 'Results';
      this.input.clear();
      this.acc = 0;
      this.audio.sfx(r.success ? 'victory' : 'defeat');
      this.ui.results(r)
    }
    lifecycle() {
      addEventListener('blur', () => {
        this.input.clear();
        this.pause('توقفت المعركة عند فقدان التركيز')
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.input.clear();
          this.pause('توقفت المعركة أثناء غياب الصفحة');
          this.audio.pause()
        } else {
          this.last = performance.now();
          this.acc = 0
        }
      });
      addEventListener('pagehide', () => {
        this.input.clear();
        this.audio.pause();
        save.write()
      });
      addEventListener('resize', () => this.resize());
      addEventListener('orientationchange', () => {
        this.input.clear();
        this.resize()
      });
      document.addEventListener('fullscreenchange', () => {
        this.input.clear();
        this.resize();
        if (!document.fullscreenElement && this.state === 'Playing' && navigator.maxTouchPoints > 0) this.pause('خرجت من ملء الشاشة؛ يمكنك المتابعة في النافذة')
      });
      $('game').addEventListener('webglcontextlost', e => {
        e.preventDefault();
        this.contextLost = true;
        this.pause('فُقد سياق الرسوم');
        $('recovery').innerHTML = '<div class="panel"><h2>توقفت الرسوم بأمان</h2><p>انتظار استعادة WebGL. التقدم المحفوظ لم يتغير.</p></div>';
        $('recovery').classList.add('on')
      });
      $('game').addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        $('recovery').innerHTML = '<div class="panel"><h2>عادت الرسوم</h2><p>أعد المعركة بأمان؛ لا نستعيد حالة المعركة بعد فقدان السياق.</p><button id="contextRestart">إعادة المعركة</button><button id="contextMenu">القائمة</button></div>';
        $('contextRestart').onclick = () => {
          $('recovery').classList.remove('on');
          this.start(STAGES.indexOf(this.battle.stage), this.battle.mode)
        };
        $('contextMenu').onclick = () => {
          $('recovery').classList.remove('on');
          this.quit()
        }
      })
    }
    resize() {
      this.performance.resize();
      let portrait = innerHeight > innerWidth && navigator.maxTouchPoints > 0;
      $('rotate').classList.toggle('on', portrait);
      if (portrait) this.pause('أدر الجهاز أفقياً ثم تابع');
      this.input.clear()
    }
    frame() {
      let now = performance.now(),
        realDt = Math.min(.1, (now - this.last) / 1000);
      this.last = now;
      if (document.hidden || this.contextLost || this.state === 'FatalError' || this.state === 'Boot') return;
      this.input.poll(realDt);
      this.audio.update();
      if (this.state === 'Playing' && !this.manualSimulation) {
        this.acc = Math.min(this.acc + realDt, 4 / 60);
        let start = performance.now(),
          steps = 0;
        this.performance.decisions = 0;
        while (this.acc >= 1 / 60 && steps < 4 && this.state === 'Playing') {
          this.spatial.build(this.store.actors);
          this.combat.step(1 / 60);
          this.combat.stepAI(1 / 60);
          this.battle.update(1 / 60);
          this.effects.update(this.combat.simScale / 60);
          this.acc -= 1 / 60;
          steps++
        }
        this.performance.updateTime = performance.now() - start;
        this.performance.steps = steps;
        this.ui.update(realDt);
        this.minimap.draw(realDt)
      } else {
        this.acc = 0;
        this.ui.update(realDt)
      }
      this.camera?.update(realDt);
      const renderBudget=this.ui.preview?1000/60:1000/this.performance.target;
      if (now - this.lastRender < renderBudget - .6) return;
      let interval = this.lastRender ? now - this.lastRender : 16.67;
      this.lastRender = now;
      if(this.ui.preview){this.ui.preview.render(Math.min(.05,interval/1000));return;}
      if (this.scene) {
        const animationStart=performance.now();
        this.renderer.render(this.store, this.player, this.battle.time);
        this.performance.animationMs=performance.now()-animationStart;
        const visualDt=this.state==='Playing'?Math.max(0,this.battle.time-this.visualBattleTime):0;
        this.visualBattleTime=this.battle.time;
        this.world.update?.(visualDt,this.performance);
        this.performance.instanceBytes=this.renderer.diagnostics?.instanceUploadBytes||0;
        const renderStart=performance.now();
        this.scene.render();
        this.performance.renderMs=performance.now()-renderStart;
      }
      this.performance.sample(interval, interval / 1000);
      this.debugUpdate()
    }
    debugUpdate() {
      $('debug').style.display = this.debug ? 'block' : 'none';
      if (!this.debug || !this.battle) return;
      let p = this.performance,
        actors = this.store.actors,
        full = actors.filter(a => a.active && a.hp > 0),
        s = this.battle;
      let heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MiB measured' : 'N/A';
      if(!this.textureClock||performance.now()>this.textureClock){
        this.textureClock=performance.now()+2000;
        this.textureBytesEstimate=this.scene.textures.reduce((sum,texture)=>{const size=texture.getSize();return sum+size.width*size.height*4*(texture.isCube?6:1)*(texture.noMipmap?1:4/3);},0);
      }
      $('debug').textContent = `RIFTBANNER ${BUILD} / WebGL ${this.engine.webGLVersion}\nFPS ${p.fps.toFixed(1)} avg ${p.avg.toFixed(1)} p95 ${p.p95.toFixed(1)} ms\nFixed steps ${p.steps} update ${p.updateTime.toFixed(2)} ms\nFull enemy ${full.filter(a=>a.faction===1).length} ally ${full.filter(a=>a.faction===0).length}\nMid ${this.renderer.midCount} far ${this.renderer.farCount} (strategic members)\nStrength ${actors.filter(a=>a.hp>0).length} / squads ${this.store.squads.length} decisions ${p.decisions}\nDraw calls ${this.engine._drawCalls?.current??'N/A'} triangles ${Math.round(this.scene.getActiveIndices()/3)}\nEffects ${this.effects.count}/80 sparks ${this.effects.sparks.filter(s=>s.time>0).length}/48\nProjectiles ${this.combat.projectiles.filter(p=>p.active).length}/20 loot ${this.combat.loot.filter(l=>l.active).length}/32\nActor slots ${actors.length}/520 generation ${this.store.generation} audio transient voices ${this.audio.voices}/23 + ${this.audio.ambience?1:0} ambient\nQuality ${settings().preset} → ${p.effective} scale ${p.scale.toFixed(2)}\nBuffer ${this.engine.getRenderWidth()} × ${this.engine.getRenderHeight()} heap ${heap}\nGraphics ${(8+this.engine.getRenderWidth()*this.engine.getRenderHeight()*40/1048576).toFixed(1)} MiB estimated (4x AA allowance; driver N/A)\nInput ${this.input.mode} pad ${this.input.padIndex} ${this.input.pad?.mapping||'none'}\nObjective ${STAGES.indexOf(s.stage)}:${s.node} done [${[...s.completed]}] ${this.state}\nScene meshes ${this.scene.meshes.length} materials ${this.scene.materials.length} cycles ${this.cycles}\nCharacter rigs ${(this.renderer.diagnostics?.activeOfficers??0)+1} animated ${this.renderer.diagnostics?.animatedActors??0} trails ${this.renderer.diagnostics?.trailSegments??0}\nQuality budget ${p.budgetStage??0} target ${p.target}Hz\nCPU sim ${p.updateTime.toFixed(2)}ms animation/upload ${p.animationMs.toFixed(2)}ms render submit ${p.renderMs.toFixed(2)}ms\nTextures ${this.scene.textures.length} ${(this.textureBytesEstimate/1048576).toFixed(2)}MiB estimated, driver N/A\nSkeletons ${this.scene.skeletons.length} upload ${(p.instanceBytes/1024).toFixed(1)}KiB\nSeed 0x72b61 / F8 diagnostics`;
    }
    fatal(e) {
      if (this.state === 'FatalError') return;
      console.error('Critical game failure', e);
      this.state = 'FatalError';
      this.input?.clear();
      this.audio?.pause();
      $('recovery').innerHTML = '<div class="panel"><h2>تعذّر تشغيل المعركة</h2><p>قد لا يدعم المتصفح WebGL أو حدث خطأ. التقدم المحفوظ لم يتغير.</p><button onclick="location.reload()">إعادة المحاولة</button><p class="tiny" id="fatalDetail"></p></div>';
      $('fatalDetail').textContent = e.message;
      $('recovery').classList.add('on')
    }
  }
  try {
    if (!B.Engine.IsSupported) throw Error('WebGL غير متاح؛ استخدم Chrome أو Samsung Internet حديثًا مع تسريع الرسوم.');
    app = new GameApp();
    app.start(0, 'training');
    app.state = 'Menu';
    app.ui.main();
    document.dispatchEvent(new Event('rift-ready'));
    if (new URLSearchParams(location.search).has('debug')) {
      window.RiftDebug = {
        get app() {
          return app
        },
        start: (s = 0, m = 'campaign', h = 0) => {
          save.data.selectedHero = Number.isInteger(h)?clamp(h,0,HEROES.length-1):0;
          app.start(s, m)
        },
        setManual: value => {app.manualSimulation=!!value;app.acc=0;},
        step: (count = 1) => {
          for (let k = 0; k < count && app.state === 'Playing'; k++) {
            app.spatial.build(app.store.actors);
            app.combat.step(1 / 60);
            app.combat.stepAI(1 / 60);
            app.battle.update(1 / 60);
            app.effects.update(app.combat.simScale / 60)
          }
        },
        target: () => app.battle.selectedTarget(),
        inspect: () => ({
          state: app.state,
          node: app.battle.node,
          stats: {
            ...app.battle.stats
          },
          hp: app.player.hp,
          mounted: !!app.player.mounted,
          horses: app.mounts.horses.map(h=>({id:h.id,name:h.name,x:h.x,z:h.z,speed:h.speed,stamina:h.stamina,mounted:h.mounted})),
          actors: app.store.actors.filter(a => a.hp > 0).length,
          meshes: app.scene.meshes.length,
          materials: app.scene.materials.length,
          draws: app.engine._drawCalls?.current ?? 0,
          triangles: Math.round(app.scene.getActiveIndices()/3),
          diagnostics: {...app.renderer.diagnostics},
          quality: app.performance.effective,
          cpuMs: app.performance.updateTime,
          animationMs: app.performance.animationMs,
          renderMs: app.performance.renderMs,
          instanceUploadBytes: app.performance.instanceBytes,
          fps: app.performance.fps,
          frameAvgMs: app.performance.avg,
          frameP95Ms: app.performance.p95,
          frameTarget: app.performance.target,
          textures: app.scene.textures.length,
          textureBytesEstimate: app.scene.textures.reduce((sum,t)=>{const d=t.getSize();return sum+d.width*d.height*4*(t.isCube?6:1)*(t.noMipmap?1:4/3);},0),
          heapBytes:performance.memory?.usedJSHeapSize??null,
          battlefield:app.battle.battlefieldCounts?.()??null,
          skeletons: app.scene.skeletons.length,
          shadowCasters: app.world.shadowCasterCount||0,
          renderWidth: app.engine.getRenderWidth(),renderHeight:app.engine.getRenderHeight()
        }),
        kill: a => app.combat.damage(a, a.hp + 1, app.player, 999),
        position: (x, z) => {
          if (app.collision.blocked(x, z)) throw Error('Blocked test position');
          app.player.x = x;
          app.player.z = z;
          if (app.mounts.horse) {app.mounts.horse.x=x;app.mounts.horse.z=z;}
        },
        wave: () => app.battle.queueWave(1, app.player.x + 20, app.player.z + 10, 20, app.player, 0),
        fail: reason => {
          if (reason === 'commander') app.battle.commander.hp = 0;
          else if (reason === 'escort' && app.battle.escort) app.battle.escort.hp = 0;
          else app.player.hp = 0
        },
        capture: id => {
          let b = app.battle.bases[id];
          if (b.captain?.hp > 0) throw Error('Captain alive');
          b.progress = 99;
          app.player.x = b.x;
          app.player.z = b.z
        },
        setSettings: patch => {
          const next=save.validate({...save.data,settings:{...save.data.settings,...patch}});
          save.data=next;save.write();app.performance.requested();app.ui.touchVisibility();
        },
        resetSave: () => {
          save.data = defaults();
          save.write()
        },
        getSave: () => JSON.parse(JSON.stringify(save.data)),
        heroes: () => HEROES.map(h=>({...h})),
        stages: () => STAGES.map(s=>({...s})),
        relics: () => RELICS.map(r=>({...r})),
        achievements: () => save.achievements(),
        pause: () => app.pause(),
        resume: () => app.resume()
      }
    }
  } catch (e) {
    console.error(e);
    $('screen').innerHTML = '<div class="panel"><h2>تعذّر تهيئة WebGL</h2><p>تحتاج اللعبة متصفحًا يدعم WebGL. جرّب Chrome أو Samsung Internet حديثًا مع تسريع الرسوم.</p><button onclick="location.reload()">إعادة المحاولة</button><p id="bootError" class="tiny"></p></div>';
    $('bootError').textContent = e.message
  }
  addEventListener('error', e => app?.fatal(e.error || Error(e.message)));
  addEventListener('unhandledrejection', e => app?.fatal(e.reason instanceof Error ? e.reason : Error(String(e.reason))));
})();
