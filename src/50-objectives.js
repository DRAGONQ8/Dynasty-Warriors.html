  class ObjectiveDirector {
    constructor(stage, mode) {
      this.stage = stage;
      this.mode = mode;
      this.node = 0;
      this.events = [];
      this.completed = new Set();
      this.bases = [];
      this.waves = [];
      this.pending = [];
      this.time = 0;
      this.defense = 0;
      this.defenseAnchor = null;
      this.defenseReady = false;
      this.campaignBases = [];
      this.settled = false;
      this.session = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + rnd();
      this.stats = {
        ko: 0,
        officers: 0,
        dealt: 0,
        received: 0,
        combo: 0,
        comboTime: 0,
        highCombo: 0,
        bases: 0,
        objectives: 0,
        perfectDodges: 0
      };
      this.optional = 0;
      this.reserve = 0;
      this.escortTarget = null;
      this.escortWaiting = false;
      this.minimapDirty = true;
      this.hint = 0;
      this.strategicClock = 0;
      this.streamClock = 0;
      this.spawnWaits = 0;
      this.cancelledWaves = 0;
      this.lastMoraleMessage = -10;
      this.initialize()
    }
    createBase(name, x, z, type = 'captain', optional = false) {
      let base = {
        id: this.bases.length,
        name,
        x,
        z,
        radius: 7,
        owner: 1,
        progress: 0,
        optional,
        locked: false,
        flag: app.world.banner(x - 6, z + 2, false),
        ring: app.world.ring(x, z, 7, 'gold'),
        captain: null,
        contested: false,
        supplyEnabled: true
      };
      if (type) {
        let pos = {x, z: z + 3};
        if (app.collision.blocked(pos.x, pos.z, .6)) {
          pos = app.store.spawnPositions(x, z, 1, {x, z: z + 4})[0] || {x, z};
        }
        base.captain = app.store.create(type, 1, pos.x, pos.z, {home: {x, z}})
      }
      this.bases.push(base);
      return base
    }
    initialize() {
      let s = this.stage,
        p = s.points.map(p => ({
          x: p[0],
          z: p[1]
        }));
      if (this.mode === 'training') {
        this.commander = app.store.create('commander', 0, p[0].x + 5, p[0].z, {
          home: p[0]
        });
        this.commander.invincible = true;
        this.trainingReset();
        app.player.ult = 100;
        return
      }
      this.commander = app.store.create('commander', 0, p[0].x + 4, p[0].z + 2, {
        home: p[0]
      });
      app.world.banner(p[0].x - 7, p[0].z + 5, true);
      if (s === STAGES[0]) {
        this.supply = this.createBase(s.bases[0], p[1].x, p[1].z);
        this.bridge = this.createBase(s.bases[1], p[2].x, p[2].z, null);
        this.fort = this.createBase(s.bases[2], p[3].x, p[3].z, 'sentinel');
        this.fort.locked = true;
        this.optionalBase = this.createBase(s.bases[3], p[4].x, p[4].z, 'captain', true);
        this.supply.captain.name = 'دارك • قائد مخيم الإمداد';
        this.optionalBase.captain.name = 'سولان • قائد الرماة';
        this.sentinel = this.fort.captain;
        app.store.addSquad(1, p[1].x, p[1].z - 4, 48, p[1]);
        app.store.addSquad(1, p[3].x, p[3].z, 64, p[3]);
        app.store.addSquad(1, p[4].x, p[4].z, 24, p[4], ['archer', 'pike']);
        app.store.addSquad(0, p[0].x - 4, p[0].z + 5, 28, p[1])
      } else if (s === STAGES[1]) {
        this.escort = app.store.create('bearer', 0, p[0].x + 2, p[0].z + 2, {
          escort: true
        });
        this.escortTarget = p[1];
        this.outpost = this.createBase(s.bases[0], p[1].x, p[1].z, 'warcaller');
        this.lantern = this.createBase(s.bases[1], p[2].x, p[2].z, 'captain');
        this.causeway = this.createBase(s.bases[2], p[3].x, p[3].z, 'odran');
        this.odran = this.causeway.captain;
        this.extract = this.createBase(s.bases[3], p[4].x, p[4].z, null);
        this.extract.locked = true;
        this.extract.owner = 0;
        this.extract.progress = 100;
        app.world.ownFlag(this.extract.flag, 0);
        this.extract.ring.material = app.world.materials.ally;
        this.optionalBase = this.createBase(s.bases[4], p[5].x, p[5].z, 'captain', true);
        this.optionalBase.captain.name = 'تيراك • قائد الحرس الخلفي';
        this.lantern.captain.name = 'مورين • قائد مخيم المشاعل';
        app.store.addSquad(1, p[1].x, p[1].z, 40, p[1]);
        app.store.addSquad(1, p[2].x, p[2].z, 36, p[2]);
        app.store.addSquad(1, p[3].x, p[3].z, 36, p[3]);
        app.store.addSquad(1, p[5].x, p[5].z, 18, p[5], ['shield', 'pike']);
        app.store.addSquad(0, p[0].x, p[0].z, 20, p[1])
      } else if (s === STAGES[2]) {
        this.yard = this.createBase(s.bases[0], p[1].x, p[1].z);
        this.gatebase = this.createBase(s.bases[1], 0, -22, 'captain');
        this.outer = this.createBase(s.bases[2], 0, 20, 'duelist');
        this.duelist = this.outer.captain;
        this.crown = this.createBase(s.bases[3], p[4].x, p[4].z, 'azrakan');
        this.boss = this.crown.captain;
        this.crown.locked = true;
        this.optionalBase = this.createBase('مخزن الدعم', -55, -32, 'captain', true);
        this.yard.captain.name = 'كاريون • قائد ساحة الحصار';
        this.gatebase.captain.name = 'بوران • حارس الرافعة';
        this.optionalBase.captain.name = 'ميراك • أمين مخزن الدعم';
        app.store.addSquad(1, p[1].x, p[1].z, 44, p[1]);
        app.store.addSquad(1, 0, -22, 32, {
          x: 0,
          z: -22
        });
        app.store.addSquad(1, 0, 20, 44, {
          x: 0,
          z: 20
        });
        app.store.addSquad(1, 0, 60, 40, {
          x: 0,
          z: 60
        });
        app.store.addSquad(0, p[0].x, p[0].z + 5, 28, p[1])
      } else this.initializeCampaign(p);
      if (this.mode === 'skirmish') {
        for (let g of app.collision.gates) app.collision.open(g);
        for (let b of this.bases) b.locked = false;
        this.fieldOfficer = s === STAGES[0] ? this.sentinel : s === STAGES[1] ? this.odran : this.boss;
        for (let squad of app.store.squads) {
          if (squad.faction === 1) squad.target = this.commander;
          else squad.target = this.bases[0]
        }
        this.node = 0
      } else this.activate(0);
      app.store.stream(app.player, app.performance.preset.cap);
      app.spatial.build(app.store.actors);
      app.ui.message(s.nodes[0], 5)
    }
    initializeCampaign(points) {
      const mission = this.stage.campaign;
      for (let [i, stronghold] of mission.strongholds.entries()) {
        let point = points[stronghold.point],
          base = this.createBase(this.stage.bases[i], point.x, point.z, stronghold.type, !!stronghold.optional);
        base.locked = !stronghold.optional;
        base.point = stronghold.point;
        if (base.captain) base.captain.name = stronghold.officerName || NAMES[stronghold.type];
        this.campaignBases.push(base);
        if (stronghold.optional) this.optionalBase = base;
        app.store.addSquad(1, point.x, point.z - 3, stronghold.count || 30, base,
          stronghold.unitTypes || ['raider', 'shield', 'pike', 'archer'], {sourceBase: base})
      }
      this.boss = this.campaignBases[mission.bossBase].captain;
      this.fieldOfficer = this.boss;
      app.store.addSquad(0, points[0].x - 3, points[0].z + 5, 28, this.campaignBases[0],
        ['raider', 'shield', 'pike'], {reserve: 18, waves: 3});
      this.commander.name = 'قائد الفجر — حارس الحلف'
    }
    activeStep() {
      return this.mode === 'campaign' ? this.stage.campaign?.steps[this.node] || null : null
    }
    activateCampaign(n) {
      const step = this.stage.campaign?.steps[n];
      if (!step) return;
      const base = this.campaignBases[step.base];
      if (!base) return;
      base.locked = false;
      this.defenseAnchor = null;
      this.defenseReady = false;
      this.defense = 0;
      for (let squad of app.store.squads) {
        if (squad.faction === 0 && !squad.missionWave) squad.target = base
      }
      if (step.kind === 'defend') {
        this.defenseAnchor = base;
        this.defense = Math.max(30, (step.duration || 85) - (this.optionalBase?.advantageAwarded ? 15 : 0));
        // The commander marches along the same collision routes as the armies.
        // Defense waves start after arrival, so distant deployments remain fair.
        this.commander.home = {x: base.x, z: base.z};
        this.commander.target = this.commander.targetGen = null;
        this.commander.decision = 0;
        app.ui.message('رافق قائد الفجر إلى ' + base.name + '؛ يبدأ الدفاع عند وصوله.', 5)
      }
      this.minimapDirty = true
    }
    startCampaignDefense(step, base) {
      this.defenseReady = true;
      const count = Math.max(2, Math.min(5, step.waves || 3)), duration = this.defense;
      for (let i = 0; i < count; i++) {
        let side = i % 2 ? -1 : 1;
        this.queueWave(1, base.x + side * 30, base.z + (i % 3 - 1) * 18,
          12 + Math.min(4, Math.floor(STAGES.indexOf(this.stage) / 2)), this.commander,
          3 + i * Math.max(12, (duration - 14) / count), {kind: 'defense', flank: true})
      }
      this.queueWave(0, base.x - 24, base.z - 20, 10, base, 5, {sourceBase: base});
      app.ui.message('قائد الفجر وصل. صدّ الموجات واحفظ راية ' + base.name + '.', 4)
    }
    campaignThreat(anchor) {
      return app.store.actors.filter(a => a.faction === 1 && a.hp > 0 && dist(a, anchor) < 13)
        .sort((a, b) => dist(a, app.player) - dist(b, app.player))[0] || null
    }
    campaignTarget() {
      const step = this.activeStep();
      if (!step) return this.boss;
      const base = this.campaignBases[step.base];
      if (step.kind === 'officer') return base.captain?.hp > 0 ? base.captain : base;
      if (step.kind === 'defend') {
        if (!this.defenseReady) return this.commander;
        if (this.defense <= 0) return this.campaignThreat(base) || base
      }
      return base
    }
    updateCampaign(dt) {
      const step = this.activeStep();
      if (!step) return;
      const base = this.campaignBases[step.base];
      if (step.kind === 'capture') {
        if (base.owner === 0) this.complete()
      } else if (step.kind === 'officer') {
        if (!base.captain || base.captain.hp <= 0) this.complete()
      } else if (step.kind === 'defend') {
        if (!this.defenseReady) {
          if (base.owner === 0 && dist(this.commander, base) < 12) this.startCampaignDefense(step, base);
          return
        }
        // A lost flag can be recaptured; its timer pauses rather than failing or
        // advancing while the army has lost the defended position.
        if (base.owner === 0) this.defense = Math.max(0, this.defense - dt);
        if (this.defense <= 0 && base.owner === 0 && !this.defenseWavesRemain() && !this.campaignThreat(base)) this.complete()
      }
    }
    supplyAdvantage(base) {
      for (let squad of app.store.squads) if (squad.faction === 1) {
        squad.reserve = squad.waves = 0
      }
      for (let enemyBase of this.bases) if (enemyBase.owner === 1) enemyBase.supplyEnabled = false;
      for (let list of [this.waves, this.pending]) for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].faction === 1 && list[i].kind === 'reinforcement') {
          list.splice(i, 1);
          this.cancelledWaves++
        }
      }
      this.commander.hp = Math.min(this.commander.maxHp, this.commander.hp + 240);
      app.player.ult = Math.min(100, app.player.ult + 20);
      if (this.activeStep()?.kind === 'defend') this.defense = Math.max(10, this.defense - 15);
      this.queueWave(0, base.x - 14, base.z - 12, 14, this.campaignTarget() || this.commander,
        2, {sourceBase: base});
      app.ui.message('خُطفت الإمدادات: توقف احتياط العدو، تجدد القائد ووصل حرس الحلف.', 5)
    }
    trainingReset(type = 'raider') {
      let start = this.stage.points[0];
      for (let a of app.store.actors) {
        a.target = null;
        a.targetGen = null;
        a.slot = false;
        if (a.faction === 1) {
          a.hp = 0;
          a.active = false;
          a.dead = true;
          a.state = 'Dead';
          a.accounted = true;
          a.deathTime = a.deathDuration || .6;
          a.recyclable = true;
          a.squad = null
        }
      }
      app.store.squads = app.store.squads.filter(s => s.faction === 0);
      app.combat.loot.forEach(l => l.active = false);
      app.combat.projectiles.forEach(p => p.active = false);
      app.player.attack = null;
      app.player.state = 'Idle';
      app.player.dead = false;
      app.combat.ultimateLock = app.combat.hitPause = 0;
      app.combat.simScale = 1;
      app.combat.chain = app.combat.chainTime = 0;
      if (app.camera) { app.camera.target = null; app.camera.targetGeneration = null; }
      if (!TYPES[type]) type = 'raider';
      for (let i = 0; i < (TYPES[type].elite || ['sentinel', 'duelist', 'warcaller', 'odran', 'azrakan'].includes(type) ? 1 : 12); i++) app.store.create(type, 1, start[0] + Math.sin(i * 1.2) * 5, start[1] + 8 + Math.cos(i * 1.2) * 5, {
        home: {
          x: start[0],
          z: start[1] + 8
        }
      });
      app.player.hp = app.player.maxHp;
      app.player.energy = app.player.ult = 100;
      this.stats = {
        ko: 0,
        officers: 0,
        dealt: 0,
        received: 0,
        combo: 0,
        comboTime: 0,
        highCombo: 0,
        bases: 0,
        objectives: 0,
        perfectDodges: 0
      };
      app.spatial.build(app.store.actors)
    }
    event(type, data) {
      this.events.push({
        type,
        id: data.id,
        gen: data.gen
      });
      if (this.events.length > 64) this.events.shift();
      if (['CaptainDefeated', 'OfficerDefeated', 'BossDefeated'].includes(type)) this.officerFell(data);
      if (type === 'CaptainDefeated') app.ui.message('سقط ' + (data.name || 'قائد الحامية') + '؛ تراجع تشكيله. أزل الخصوم وارفع الراية.', 3);
      if (type === 'OfficerDefeated' || type === 'BossDefeated') app.ui.message('هُزم ' + (data.name || NAMES[data.type] || 'الضابط'), 4)
    }
    complete() {
      if (this.completed.has(this.node)) return;
      this.completed.add(this.node);
      this.stats.objectives++;
      this.node++;
      if (this.node >= this.stage.nodes.length) {
        this.finish(true);
        return
      }
      this.activate(this.node);
      app.audio.sfx('ui');
      app.ui.message(this.stage.nodes[this.node], 5)
    }
    activate(n) {
      let s = this.stage,
        p = s.points.map(p => ({
          x: p[0],
          z: p[1]
        }));
      if (s === STAGES[0]) {
        if (n === 2) {
          app.collision.open(app.world.gate1);
          this.defense = s.defenseDuration || 135;
          app.ui.message('تحذير: التفاف معادٍ نحو مقر الفجر!', 4);
          for (let [delay, x] of [
              [5, -22],
              [32, 22],
              [62, -24],
              [88, 25]
            ]) this.queueWave(1, x, -48, 12, this.commander, delay, {kind: 'defense'})
        }
        if (n === 3) {
          app.collision.open(app.world.gate1);
          this.fort.locked = false;
          app.store.squads.filter(s => s.faction === 0).forEach(s => s.target = p[3])
        }
      } else if (s === STAGES[1]) {
        if (n === 1) this.escortWaiting = true;
        if (n === 2) {
          this.escortWaiting = false;
          this.escortTarget = p[2];
          app.store.squads.filter(s => s.faction === 0).forEach(s => s.target = p[2])
        }
        if (n === 3) {
          this.defense = s.defenseDuration || 100;
          this.escortWaiting = true;
          for (let delay of [5, 30, 62]) this.queueWave(1, p[2].x + 18, p[2].z + 12, 12, this.escort, delay, {kind: 'defense'})
        }
        if (n === 4) {
          this.escortWaiting = true;
          this.odran.target = app.player
        }
        if (n === 5) {
          app.collision.open(app.world.gate1);
          this.escortTarget = p[4];
          this.escortWaiting = false;
          this.extract.locked = false;
          this.queueWave(1, p[3].x - 12, p[3].z + 20, 14, this.escort, 5, {kind: 'assault'})
        }
      } else if (s === STAGES[2]) {
        if (n === 3) {
          this.defense = s.defenseDuration || 125;
          this.commander.home = {
            x: 0,
            z: 16
          };
          app.store.squads.filter(s => s.faction === 0).forEach(s => s.target = {
            x: 0,
            z: 16
          });
          for (let [delay, x] of [
              [5, 24],
              [30, -24],
              [58, 24],
              [83, -24]
            ]) this.queueWave(1, x, 25, 12, this.commander, delay, {kind: 'defense'})
        }
        if (n === 5) {
          app.collision.open(app.world.gate2);
          this.crown.locked = false;
          this.boss.target = app.player
        }
      } else this.activateCampaign(n)
    }
    queueWave(faction, x, z, count, target, delay = 3, options = {}) {
      if (this.waves.length + this.pending.length >= 16 || this.settled) return false;
      count = Math.min(24, Math.max(0, Math.floor(count)));
      if (!count) return false;
      this.waves.push({
        faction, x, z, count, target, delay: Math.max(0, delay),
        kind: options.kind || 'reinforcement', sourceBase: options.sourceBase,
        flank: options.flank, expiresAt: this.time + Math.max(0, delay) + 48,
        retryAt: 0
      });
      return true
    }
    safeSpawn(wave) {
      let target = wave.target || {x: wave.x, z: wave.z},
        reachable = app.collision.flow(target);
      for (let radius of [0, 10, 18, 27, 36]) {
        let samples = radius ? 12 : 1;
        for (let i = 0; i < samples; i++) {
          let theta = i * Math.PI * 2 / samples + (wave.faction ? .35 : -.35),
            x = wave.x + Math.sin(theta) * radius, z = wave.z + Math.cos(theta) * radius;
          if (app.collision.blocked(x, z, .8) || dist({x, z}, app.player) < 21 || reachable[app.collision.index(x, z)] < 0) continue;
          let positions = app.store.spawnPositions(x, z, wave.count, target, 16);
          if (positions.length === wave.count) return {x, z, positions}
        }
      }
      return null
    }
    processWaves(dt) {
      for (let wave of this.waves) wave.delay -= dt;
      for (let i = this.waves.length - 1; i >= 0; i--) {
        let wave = this.waves[i];
        if (wave.delay > 0) continue;
        this.waves.splice(i, 1);
        if (wave.sourceBase && (wave.sourceBase.owner !== wave.faction || !wave.sourceBase.supplyEnabled)) {
          this.cancelledWaves++;
          continue
        }
        let safe = app.store.available() >= wave.count ? this.safeSpawn(wave) : null;
        if (safe) {
          let squad = app.store.addSquad(wave.faction, safe.x, safe.z, wave.count, wave.target,
            ['raider', 'shield', 'pike', 'archer'], {positions: safe.positions, reserve: 0, waves: 0,
              sourceBase: wave.sourceBase, flank: wave.flank});
          squad.missionWave = wave.kind === 'defense' || wave.kind === 'assault';
          squad.waveKind = wave.kind
        } else {
          wave.retryAt = this.time + 1.5;
          this.pending.push(wave);
          this.spawnWaits++
        }
      }
      for (let i = this.pending.length - 1; i >= 0; i--) {
        let wave = this.pending[i];
        if (this.time >= wave.expiresAt || wave.sourceBase && wave.sourceBase.owner !== wave.faction) {
          this.pending.splice(i, 1);
          this.cancelledWaves++;
          continue
        }
        if (this.time >= wave.retryAt && app.store.available() >= wave.count) {
          this.pending.splice(i, 1);
          wave.delay = 0;
          this.waves.push(wave)
        }
      }
    }
    defenseWavesRemain() {
      return this.waves.some(w => w.kind === 'defense') || this.pending.some(w => w.kind === 'defense')
    }
    rallyFor(squad, excluded = squad.supportBase) {
      let nearest = null, best = Infinity;
      for (let base of this.bases) {
        if (base.owner !== squad.faction || base.locked || base === excluded) continue;
        let distance = dist(squad, base);
        if (distance < best && app.collision.flow(base)[app.collision.index(squad.x, squad.z)] >= 0) { nearest = base; best = distance; }
      }
      if (nearest) return {x: nearest.x, z: nearest.z};
      let threat = app.player, dx = squad.x - threat.x, dz = squad.z - threat.z, length = Math.max(1, Math.hypot(dx, dz));
      for (let range of [16, 11, 7]) {
        let point = {x: squad.x + dx / length * range, z: squad.z + dz / length * range};
        if (!app.collision.blocked(point.x, point.z, .8) && app.collision.visible(squad, point)) return point
      }
      return {...squad.home}
    }
    officerFell(officer) {
      if (this.mode === 'training') return;
      for (let squad of app.store.squads) {
        if (!app.store.strength(squad)) continue;
        if (squad.faction === officer.faction &&
            (squad.leader === officer && squad.leaderGen === officer.gen || dist(squad, officer) < 20 && app.collision.visible(squad, officer))) {
          if (squad.leader === officer) squad.leaderLost = true;
          squad.morale = Math.max(.08, squad.morale - .5);
          squad.brokenUntil = this.time + 7 + squad.id % 3;
          squad.order = 'Retreat';
          squad.destination = this.rallyFor(squad);
          squad.reserve = Math.max(0, squad.reserve - 6);
          for (let member of squad.members) if (member.hp > 0) member.decision = 0
        } else if (squad.faction !== officer.faction && dist(squad, officer) < 30) squad.morale = Math.min(1, squad.morale + .15)
      }
    }
    ownershipChanged(base, owner) {
      app.world.ownFlag(base.flag, owner);
      base.supplyEnabled = owner === 0 || !this.stage.campaign || !this.optionalBase?.advantageAwarded;
      base.contested = false;
      base.lastChanged = this.time;
      base.ring.material = app.world.materials[owner === 0 ? 'ally' : 'enemy'];
      this.minimapDirty = true;
      for (let squad of app.store.squads) {
        if (!app.store.strength(squad)) continue;
        if (squad.supportBase === base && squad.faction !== owner) {
          // Supply budgets never regenerate when a flag repeatedly changes hands.
          squad.reserve = 0;
          squad.waves = 0
        }
        if (dist(squad, base) > 27) continue;
        if (squad.faction === owner) squad.morale = Math.min(1, squad.morale + .16);
        else {
          squad.morale = Math.max(.08, squad.morale - .22);
          squad.order = 'Retreat';
          squad.brokenUntil = Math.max(squad.brokenUntil, this.time + 5);
          squad.destination = this.rallyFor(squad, base)
        }
      }
      for (let list of [this.waves, this.pending]) for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].sourceBase === base && list[i].faction !== owner) { list.splice(i, 1); this.cancelledWaves++; }
      }
    }
    battlefieldCounts() {
      let counts = app.store.counts(), queued = 0;
      for (let wave of this.waves) queued += wave.count;
      for (let wave of this.pending) queued += wave.count;
      return {...counts, queued, pendingWaves: this.pending.length}
    }
    interact() {
      if (this.mode === 'training') {
        app.player.energy = app.player.ult = 100;
        app.combat.ultimateLock = 0;
        app.player.hp = app.player.maxHp;
        app.ui.message('تجددت الحياة والطاقة. لا مكافآت في التدريب.', 2);
        return
      }
      if (this.stage === STAGES[2] && this.node === 2 && dist(app.player, {
          x: 5,
          z: -22
        }) < 6) {
        app.collision.open(app.world.gate1);
        this.event('GateOpened', app.world.gate1);
        this.complete()
      }
    }
    interaction() {
      if (this.mode === 'training') return true;
      return this.stage === STAGES[2] && this.node === 2 && dist(app.player, {
        x: 5,
        z: -22
      }) < 6
    }
    selectedTarget() {
      let s = this.stage;
      if (this.mode === 'training') return {
        x: s.points[0][0],
        z: s.points[0][1] + 8,
        name: 'ساحة التدريب'
      };
      if (this.optional === 1 && this.optionalBase?.owner === 1) return this.optionalBase;
      if (this.mode === 'skirmish') return this.bases.find(b => b.owner === 1) || this.fieldOfficer;
      if (s.campaign) return this.campaignTarget();
      if ((s === STAGES[0] && this.node === 2 || s === STAGES[1] && this.node === 3 || s === STAGES[2] && this.node === 3) && this.defense <= 0) {
        let anchor = s === STAGES[1] ? this.lantern : s === STAGES[2] ? {
          x: 0,
          z: 20
        } : this.commander;
        let threat = app.store.actors.filter(a => a.faction === 1 && a.hp > 0 && dist(a, anchor) < 14).sort((a, b) => dist(a, app.player) - dist(b, app.player))[0];
        if (threat) return threat
      }
      if (s === STAGES[0]) return [this.supply, this.supply, this.commander, this.sentinel, this.fort][this.node];
      if (s === STAGES[1] && [0, 2, 5].includes(this.node) && dist(app.player, this.escort) > 14) return this.escort;
      if (s === STAGES[1]) return [this.outpost, this.outpost, this.lantern, this.lantern, this.odran, this.extract][this.node];
      return [this.yard, this.gatebase.captain, {
        x: 5,
        z: -22,
        name: 'رافعة البوابة'
      }, this.commander, this.duelist, this.boss][this.node]
    }
    cycleObjective() {
      this.optional = 1 - this.optional;
      app.ui.message(this.optional && this.optionalBase ? 'توجيه إلى الهدف الاختياري' : 'توجيه إلى الهدف الرئيسي', 2)
    }
    update(dt) {
      if (this.settled) return;
      dt *= app.combat.simScale ?? 1;
      this.time += dt;
      if (this.stats.comboTime > 0) {
        this.stats.comboTime -= dt;
        if (this.stats.comboTime <= 0) this.stats.combo = 0
      }
      if (this.mode === 'training') {
        if (app.player.hp <= 0) {
          app.player.hp = app.player.maxHp;
          app.player.dead = false;
          app.player.state = 'Idle'
        }
        return
      }
      if (app.player.hp <= 0) {
        this.finish(false, 'سقط البطل');
        return
      }
      if (this.commander.hp <= 0 && (this.stage !== STAGES[1] || this.mode === 'skirmish')) {
        this.finish(false, 'سقط قائد الفجر');
        return
      }
      if (this.mode === 'campaign' && this.escort?.hp <= 0) {
        this.finish(false, 'سقط حامل الراية');
        return
      }
      if (this.time >= this.stage.limit) {
        this.finish(false, 'انتهى زمن المهمة');
        return
      }
      this.streamClock -= dt;
      if (this.streamClock <= 0) {
        app.store.stream(app.player, app.performance.preset.cap);
        this.streamClock = .5
      }
      this.strategicClock -= dt;
      if (this.strategicClock <= 0) {
        this.strategic(.75);
        this.strategicClock = .75
      }
      this.processWaves(dt);
      for (let base of this.bases) {
        if (base.locked || base.captain?.hp > 0) continue;
        let local = app.store.actors.filter(a => a.hp > 0 && dist(a, base) < base.radius),
          friends = local.filter(a => a.faction === 0).length,
          enemies = local.filter(a => a.faction === 1).length,
          player = dist(app.player, base) < base.radius ? 4 : 0;
        base.contested = enemies > 0 && friends + player > 0;
        base.ring.visibility = base.contested ? .6 + Math.sin(this.time * 4) * .2 : .9;
        if (base.owner === 1) {
          if (friends + player > 0 && enemies === 0) base.progress += dt * Math.min(5, friends + player) * .6;
          else if (enemies > 0) base.progress = Math.max(0, base.progress - dt * 1.3);
          if (base.progress >= 100) {
            base.owner = 0;
            base.progress = 100;
            this.ownershipChanged(base, 0);
            if (!base.rewarded) {
              this.stats.bases++;
              base.rewarded = true;
              app.player.hp = Math.min(app.player.maxHp, app.player.hp + 55);
              app.player.energy = Math.min(100, app.player.energy + 25)
            }
            this.event('BaseCaptured', base);
            app.ui.message('رُفعت راية الفجر: ' + base.name, 4);
            if (!base.reinforced) {
              this.queueWave(0, base.x - 8, base.z - 8, 8, this.selectedTarget() || base, 2, {sourceBase: base});
              base.reinforced = true
            }
            if (base.optional && !base.advantageAwarded) {
              base.advantageAwarded = true;
              if (this.stage.campaign) this.supplyAdvantage(base);
              if (this.stage === STAGES[0]) {
                for (let squad of app.store.squads)
                  if (squad.faction === 1 && squad.members.some(a => a.type === 'archer')) squad.reserve = 0
              }
              if (this.stage === STAGES[1]) {
                this.escort.hp = Math.min(this.escort.maxHp, this.escort.hp + 300);
                this.queueWave(0, base.x - 10, base.z - 8, 12, this.escort, 2, {sourceBase: base});
                app.ui.message('وصل حرس المشاعل؛ تجدد حامل الراية ووصلت فرقة حمايته.', 4)
              }
              if (this.stage === STAGES[2]) this.queueWave(0, base.x + 8, base.z, 12, {x: 0, z: 20}, 2)
            }
          }
        } else {
          if (enemies > friends + player) {
            base.progress -= dt * 2;
            if (base.progress <= 0) {
              base.owner = 1;
              base.progress = 0;
              this.ownershipChanged(base, 1);
              app.ui.message('فُقدت الراية: ' + base.name, 3)
            }
          } else base.progress = Math.min(100, base.progress + dt * 2)
        }
      }
      if (this.mode === 'skirmish') {
        if (this.bases.every(b => b.owner === 0) && this.fieldOfficer.hp <= 0) this.finish(true);
        return
      }
      let n = this.node,
        s = this.stage;
      if (s === STAGES[0]) {
        if (n === 0 && this.supply.captain.hp <= 0) this.complete();
        else if (n === 1 && this.supply.owner === 0) this.complete();
        else if (n === 2) {
          this.defense -= dt;
          if (this.defense <= 0 && !this.defenseWavesRemain() && !app.store.actors.some(a => a.faction === 1 && a.hp > 0 && dist(a, this.commander) < 12)) this.complete()
        } else if (n === 3 && this.sentinel.hp <= 0) this.complete();
        else if (n === 4 && this.fort.owner === 0) this.complete()
      } else if (s === STAGES[1]) {
        if (n === 0 && dist(this.escort, this.outpost) < 8) this.complete();
        else if (n === 1 && this.outpost.captain.hp <= 0 && this.outpost.owner === 0) this.complete();
        else if (n === 2 && dist(this.escort, this.lantern) < 7 && this.lantern.owner === 0) this.complete();
        else if (n === 3) {
          this.defense -= dt;
          if (this.defense <= 0 && !this.defenseWavesRemain() && !app.store.actors.some(a => a.hp > 0 && a.faction === 1 && dist(a, this.lantern) < 10)) this.complete()
        } else if (n === 4 && this.odran.hp <= 0) this.complete();
        else if (n === 5 && dist(this.escort, this.extract) < 5 && dist(app.player, this.extract) < 12) this.complete()
      } else if (s === STAGES[2]) {
        if (n === 0 && this.yard.owner === 0) this.complete();
        else if (n === 1 && this.gatebase.captain.hp <= 0) this.complete();
        else if (n === 3) {
          this.defense -= dt;
          if (this.defense <= 0 && !this.defenseWavesRemain() && !app.store.actors.some(a => a.faction === 1 && a.hp > 0 && dist(a, {
              x: 0,
              z: 20
            }) < 12)) this.complete()
        } else if (n === 4 && this.duelist.hp <= 0) this.complete();
        else if (n === 5 && this.boss.hp <= 0) this.complete()
      } else this.updateCampaign(dt);
      this.events.length = 0;
      if (this.time < 55 && Math.floor(this.time / 12) > this.hint) {
        this.hint = Math.floor(this.time / 12);
        app.ui.message(['', 'ضرب خفيف متتابع؛ اضغط الثقيل بعد السلسلة لرفع الأعداء.', 'امسك الثقيل للشحن. تفادَ دائرة الإنذار؛ امسك التفادي للركض.', 'الصدّ في لحظة الهجوم يفتح ضربة مضادة.', 'أزل قائد المخيم والخصوم ثم ابقَ داخل دائرة الراية.'][this.hint] || '', 4)
      }
    }
    squadOrders(squad, alive, dt) {
      let leader = squad.leader && squad.leader.gen === squad.leaderGen && squad.leader.hp > 0 ? squad.leader : null;
      if (squad.supportBase === undefined) {
        squad.supportBase = this.bases.find(b => b.owner === squad.faction && dist(b, squad.home) < 19) || null
      }
      if (squad.leader && !leader && !squad.leaderLost) {
        squad.leaderLost = true;
        squad.morale = Math.max(.08, squad.morale - .45);
        squad.brokenUntil = this.time + 8;
        squad.destination = this.rallyFor(squad)
      }
      let lost = Math.max(0, squad.lastAlive - alive.length);
      squad.morale = Math.max(.08, squad.morale - lost / Math.max(1, squad.initialCount) * .65);
      squad.lastAlive = alive.length;
      if (squad.morale < .27 && this.time >= squad.brokenUntil && !squad.routed) {
        squad.routed = true;
        squad.brokenUntil = this.time + 7;
        squad.destination = this.rallyFor(squad)
      }
      if (this.time < squad.brokenUntil) {
        squad.order = 'Retreat';
        return
      }
      if (squad.order === 'Retreat') {
        squad.order = 'Regroup';
        squad.regroupUntil = this.time + 4
      }
      if (this.time < squad.regroupUntil) {
        squad.morale = Math.min(.65, squad.morale + dt * .055);
        squad.order = 'Regroup';
        return
      }
      squad.morale = Math.min(leader ? .95 : .7, squad.morale + dt * .009);
      if (squad.faction === 0 && !squad.missionWave &&
          (!squad.target || squad.target.hp <= 0 || squad.target.owner === 0)) {
        let next = this.selectedTarget();
        if (next && next !== this.optionalBase && next.hp !== 0) squad.target = next
      }
      let target = squad.target || squad.home;
      squad.destination = {x: target.x, z: target.z};
      let distance = dist(squad.anchor, target);
      if (squad.flank && !squad.flanked && distance > 12) {
        let dx = target.x - squad.home.x, dz = target.z - squad.home.z, magnitude = Math.max(1, Math.hypot(dx, dz)),
          waypoint = {x: target.x + dz / magnitude * squad.flankSide * 11,
            z: target.z - dx / magnitude * squad.flankSide * 11};
        if (!app.collision.blocked(waypoint.x, waypoint.z, .8)) {
          squad.destination = waypoint;
          squad.order = 'Flank';
          if (dist(squad.anchor, waypoint) < 5) squad.flanked = true;
          return
        }
        squad.flanked = true
      }
      squad.order = distance < 5 ? 'Hold' : 'Advance';
      // A garrison forms around its officer while the officer remains in its
      // stronghold. A retreat keeps a fixed rally point instead of following it.
      if (leader && dist(target, squad.home) < 12 && dist(leader, squad.home) < 14) {
        squad.destination = {x: leader.x, z: leader.z};
        squad.facing = leader.yaw
      }
    }
    strategic(dt) {
      let pressureHQ = 0, pressureEscort = 0;
      for (let squad of app.store.squads) {
        let alive = squad.members.filter(a => a.hp > 0 && a.squad === squad);
        if (!alive.length) continue;
        squad.x = alive.reduce((v, a) => v + a.x, 0) / alive.length;
        squad.z = alive.reduce((v, a) => v + a.z, 0) / alive.length;
        this.squadOrders(squad, alive, dt);
        let dir = app.collision.direction(squad.anchor, squad.destination),
          distance = dist(squad.anchor, squad.destination),
          speed = squad.order === 'Retreat' ? 2.9 : squad.order === 'Regroup' ? 1.7 : 2.35,
          stride = Math.min(distance, speed * dt);
        if (distance > .6) {
          app.collision.move(squad.anchor, dir.x * stride, dir.z * stride, .7);
          if (dir.x || dir.z) squad.facing = angle(dir.x, dir.z)
        }
        for (let actor of alive) {
          if (actor.active) continue;
          let slot = app.store.formationTarget(actor), move = app.collision.direction(actor, slot),
            length = Math.min(dist(actor, slot), dt * (squad.order === 'Retreat' ? 3 : 2.5));
          app.collision.move(actor, move.x * length, move.z * length, .5);
          if (move.x || move.z) actor.yaw = angle(move.x, move.z);
          actor.state = 'Advance'
        }
        let near = alive.some(a => a.active), fighting = squad.order !== 'Retreat' && squad.order !== 'Regroup';
        if (!near && fighting && squad.faction === 1) {
          let strength = alive.length * squad.morale;
          if (dist(squad, this.commander) < 12 && app.collision.visible(squad, this.commander)) pressureHQ += Math.min(5, strength * .18);
          if (this.escort && dist(squad, this.escort) < 10 && app.collision.visible(squad, this.escort)) pressureEscort += Math.min(3, strength * .12)
        }
        if (!near && fighting) {
          let opponent = app.store.squads.find(other => other.faction !== squad.faction &&
            other.order !== 'Retreat' && app.store.strength(other) > 0 && dist(other, squad) < 11 &&
            !other.members.some(a => a.hp > 0 && a.active) && app.collision.visible(squad, other));
          if (opponent) {
            let victim = alive.find(a => !a.active);
            if (victim) {
              // Background casualties alter actual physical members, never an
              // invented soldier total, and never award the player's KO counter.
              victim.hp -= dt * (1.7 + opponent.morale * 1.3);
              if (victim.hp <= 0) {
                victim.hp = 0;
                victim.dead = true;
                victim.accounted = true;
                victim.state = 'Dead';
                victim.deathTime = 0;
                victim.active = victim.slot = false
              }
            }
          }
        }
        squad.timer -= dt;
        if (squad.timer <= 0 && squad.reserve > 0 && squad.waves > 0) {
          let owned = squad.supportBase;
          if (!owned || owned.owner !== squad.faction || owned.locked) {
            owned = this.bases.find(b => b.owner === squad.faction && !b.locked &&
              app.collision.flow(b)[app.collision.index(squad.x, squad.z)] >= 0)
          }
          if (owned && (!squad.supportBase || squad.supportBase.owner === squad.faction)) {
            let count = Math.min(6, squad.reserve);
            if (this.queueWave(squad.faction, owned.x + 9, owned.z + 7, count, squad.target, 3, {sourceBase: owned})) {
              squad.reserve -= count;
              squad.waves--
            }
          }
          squad.timer = 28
        }
      }
      let cover = anchor => app.store.squads.filter(s => s.faction === 0 && s.order !== 'Retreat' &&
        dist(s, anchor) < 13 && app.collision.visible(s, anchor)).reduce((n, s) => n + app.store.strength(s) * s.morale, 0);
      for (let [actor, pressure] of [[this.commander, pressureHQ], [this.escort, pressureEscort]]) {
        if (!actor || pressure <= 0 || actor.hp <= 0 || actor.invincible) continue;
        let damage = Math.max(0, Math.min(actor === this.commander ? 8 : 4, pressure) - cover(actor) * .15) * dt;
        actor.hp = Math.max(0, actor.hp - damage);
        if (actor.hp === 0) {
          actor.dead = true;
          actor.state = 'Dead';
          actor.slot = false
        }
      }
      this.reserve = app.store.counts().reserves
    }
    finish(success, reason = '') {
      if (this.settled || this.mode === 'training') return;
      this.settled = true;
      let st = this.stats,
        total = this.mode === 'skirmish' ? this.bases.length : this.stage.nodes.length,
        fraction = clamp((this.mode === 'skirmish' ? this.bases.filter(b => b.owner === 0).length : this.completed.size) / total, 0, 1),
        eliteTotal = Math.max(1, this.bases.filter(b => b.captain && !['captain', 'commander', 'bearer'].includes(b.captain.type)).length),
        score = clamp((success ? 40 : 0) + fraction * 25 + clamp(st.officers / eliteTotal, 0, 1) * 10 + clamp(1 - this.time / this.stage.par, 0, 1) * 15 + clamp(1 - st.received / (app.player.maxHp * 2), 0, 1) * 10, 0, success ? 100 : 54),
        rank = score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
        bonus = {
          D: 0,
          C: 20,
          B: 40,
          A: 80,
          S: 120
        } [rank],
        xp = Math.floor((Math.min(st.ko, 600) + 40 * st.officers + 30 * st.bases + (success ? 180 : 0) + bonus) * (success ? 1 : .4)),
        shards = Math.floor(Math.min(100, (success ? 30 : 0) + 5 * st.officers + 5 * st.bases + bonus / 8) * (success ? 1 : .4)),
        unlocks = [],
        newAchievements = [];
      let d = save.data,
        hero = d.heroes[app.player.hero],
        oldLevel = hero.level;
      if (!d.committed.includes(this.session)) {
        d.committed.push(this.session);
        d.committed = d.committed.slice(-100);
        d.shards += shards;
        hero.xp += xp;
        while (hero.level < 20 && hero.xp >= 120 + 45 * (hero.level - 1)) {
          hero.xp -= 120 + 45 * (hero.level - 1);
          hero.level++
        }
        if (hero.level === 20) hero.xp = 0;
        if (success && this.mode === 'campaign') {
          let i = STAGES.indexOf(this.stage);
          if (!d.completed[i]) {
            d.completed[i] = true;
            for (let h of HEROES) if (h.unlockStage === i) unlocks.push(h.name + ' — ' + h.role);
            if (i === 0) unlocks.push('المناوشة');
            if (i + 1 < STAGES.length) unlocks.push(STAGES[i + 1].name);
            if (i === 2) unlocks.push('تحرير فيراث • بدأت حملة الممالك');
            if (i === STAGES.length - 1) unlocks.push('فجر الممالك • اكتملت الحملة الكبرى')
          }
          d.selectedStage = Math.min(STAGES.length - 1, i + 1)
        }
        let key = this.mode + '-' + STAGES.indexOf(this.stage) + '-' + settings().difficulty;
        if (!d.best[key] || d.best[key].score < score) d.best[key] = {
          rank,
          score: Math.round(score),
          time: Math.round(this.time)
        };
        if (typeof save.recordBattle === 'function') newAchievements = save.recordBattle(this, success, rank, Math.round(score));
        save.write()
      }
      this.result = {
        success,
        reason,
        score: Math.round(score),
        rank,
        xp,
        shards,
        oldLevel,
        level: hero.level,
        unlocks,
        newAchievements
      };
      app.result(this.result)
    }
  }
