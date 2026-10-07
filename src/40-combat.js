  class CombatSystem {
    constructor() {
      this.strikeID = 1;
      this.moves = this.createMoves();
      this.lastPlayerSlot = 0;
      this.projectiles = Array.from({
        length: 20
      }, () => ({
        active: false
      }));
      this.loot = Array.from({
        length: 32
      }, () => ({
        active: false,
        x: 0,
        z: 0,
        time: 0
      }));
      this.attacks = 0;
      this.buffer = 0;
      this.chain = 0;
      this.chainTime = 0;
      this.heavyBuffer = 0;
      this.skillBuffer = null;
      this.dodgeCD = 0;
      this.dodgeBuffer = 0;
      this.jumpBuffer = 0;
      this.jumpCD = 0;
      this.ultimateLock = 0;
      this.hitPause = 0;
      this.hitBudget = 0;
      this.simScale = 1
    }
    createMoves() {
      // Original authored attack volumes. Local +Z is forward; angles sweep
      // toward +X. Active intervals are shared with the character pose sampler.
      const sweep = (motion, duration, start, end, reach, from, to, damage, posture, knock, drive = 0, extra = {}) => ({
        motion, duration, start, end, damage, posture, knock,
        drive: {distance: drive, start: Math.max(0, start - .10), end},
        geometry: {shape: 'sweep', reach, inner: .4, width: .34, from, to, minY: -.2, maxY: 2.5},
        ...extra
      });
      const thrust = (motion, duration, start, end, reach, width, damage, posture, knock, drive = 0, extra = {}) => ({
        motion, duration, start, end, damage, posture, knock,
        drive: {distance: drive, start: Math.max(0, start - .08), end},
        geometry: {shape: 'thrust', reach, inner: .5, width, from: 0, to: 0, minY: -.2, maxY: 2.7},
        ...extra
      });
      const slam = (motion, duration, start, end, reach, offset, radius, damage, posture, knock, extra = {}) => ({
        motion, duration, start, end, damage, posture, knock,
        drive: {distance: .20, start: start - .1, end: start},
        geometry: {shape: 'slam', reach, offset, radius, inner: 0, width: radius, from: 0, to: 0, minY: -.4, maxY: 1.6},
        ...extra
      });
      const sets = [
        {
          light: [
            sweep('slash', .39, .11, .22, 3.0, -1.03, .98, 1, 1, 1.2, .34, {side: 1}),
            sweep('slash', .42, .13, .25, 3.0, 1.18, -1.10, 1.06, 1.1, 1.4, .28, {side: -1}),
            sweep('launcher', .44, .16, .27, 2.85, -.50, .62, 1.12, 1.5, 1.6, .48, {side: 1}),
            thrust('overhead', .58, .24, .34, 3.15, .55, 1.4, 2, 3.3, .50, {knockdown: true})
          ],
          heavy: [
            thrust('overhead', .73, .27, .38, 3.35, .46, 2.1, 3.3, 2.8, .22),
            sweep('launcher', .64, .19, .34, 3.15, -.62, .67, 1.6, 2.1, 1.7, .52, {launch: true}),
            thrust('control', .70, .22, .35, 2.65, .78, 1.35, 5.2, 4.3, .78, {control: true}),
            sweep('sweep', .82, .28, .52, 3.40, -2.05, 2.05, 2.15, 2.7, 5.2, .55, {knockdown: true}),
            slam('finisher', .96, .43, .52, 4, 2.15, 1.65, 3.1, 4.6, 6.8, {knockdown: true})
          ]
        },
        {
          light: [
            thrust('thrust', .34, .09, .18, 4.5, .29, 1, 1.1, .8, .28),
            thrust('thrust', .37, .11, .21, 4.55, .34, 1.03, 1.25, 1.1, .38, {side: -1}),
            sweep('slash', .41, .13, .26, 3.8, -1.15, 1.16, 1.08, 1.2, 1.2, .30, {side: 1}),
            sweep('launcher', .43, .14, .29, 4.0, -.70, .70, 1.14, 1.45, 1.6, .44),
            sweep('sweep', .55, .19, .37, 4.3, 1.65, -1.65, 1.4, 1.8, 3.7, .40, {side: -1})
          ],
          heavy: [
            thrust('thrust', .58, .18, .28, 4.8, .34, 2, 3.6, 2.5, .72),
            sweep('launcher', .61, .19, .35, 4.1, -.62, .74, 1.45, 2.25, 1.9, .48, {launch: true}),
            sweep('control', .64, .17, .33, 3.0, 1.2, -1.25, 1.25, 5.3, 4.1, .48, {side: -1, control: true}),
            sweep('sweep', .78, .25, .51, 4.35, -2.25, 2.25, 2.05, 2.8, 5.4, .62, {knockdown: true}),
            thrust('finisher', .83, .22, .51, 4.85, .42, 1.45, 2.25, 3.5, 2.05, {pulses: 2}),
            sweep('finisher', .93, .28, .61, 4.35, -Math.PI, Math.PI, 1.65, 2.7, 5.7, .78, {pulses: 2, knockdown: true})
          ]
        },
        {
          light: [
            sweep('slash', .28, .07, .15, 2.15, -1.08, .84, 1, .85, .7, .40, {side: 1}),
            sweep('slash', .29, .08, .17, 2.18, 1.18, -.98, 1, .9, .8, .36, {side: -1}),
            thrust('thrust', .33, .09, .20, 2.50, .41, 1.06, 1.2, 1.2, .65),
            sweep('control', .36, .10, .22, 2.25, -.95, 1.20, 1.13, 1.3, 1.4, .28, {side: 1}),
            sweep('launcher', .37, .12, .25, 2.3, -.65, .58, 1.14, 1.4, 1.5, .40),
            sweep('sweep', .47, .13, .32, 2.6, 2.25, -2.25, 1.45, 1.8, 3.3, .66, {side: -1})
          ],
          heavy: [
            thrust('overhead', .49, .16, .27, 2.6, .42, 2.15, 3.6, 2.0, .55),
            sweep('launcher', .53, .15, .31, 2.5, -.73, .65, 1.0, 1.6, 1.1, .65, {pulses: 2, launch: true}),
            sweep('control', .59, .15, .36, 2.4, -1.15, 1.15, .95, 2.8, 2.4, .65, {pulses: 2, control: true, reversePulses: true}),
            sweep('sweep', .69, .20, .44, 2.75, -Math.PI, Math.PI, 1.35, 1.6, 4, .85, {pulses: 2, knockdown: true}),
            thrust('finisher', .76, .18, .47, 2.65, .56, 1.15, 1.65, 2.8, 2.3, {pulses: 3}),
            sweep('finisher', .82, .22, .53, 2.8, -2.40, 2.40, 1.30, 2, 3.8, 1, {pulses: 3, reversePulses: true}),
            sweep('finisher', .93, .25, .63, 2.9, -Math.PI, Math.PI, 1.45, 2.1, 5, 1.2, {pulses: 3, knockdown: true})
          ]
        },
        {
          light: [
            sweep('slash', .53, .19, .31, 3.25, -1.10, 1.08, 1, 1.2, 1.8, .26, {side: 1}),
            sweep('slash', .56, .21, .35, 3.2, 1.3, -1.10, 1.08, 1.4, 2.2, .24, {side: -1}),
            thrust('control', .59, .22, .36, 2.95, .74, 1.13, 1.75, 2.7, .55),
            thrust('overhead', .73, .31, .42, 3.5, .65, 1.55, 2.3, 4.8, .36, {knockdown: true})
          ],
          heavy: [
            slam('overhead', .94, .39, .49, 3.35, 2.50, .83, 2.25, 3.6, 3.7),
            sweep('launcher', .84, .30, .46, 3.35, -.8, .72, 1.7, 2.7, 2.3, .55, {launch: true}),
            thrust('control', .86, .27, .44, 3.0, .90, 1.5, 5.2, 5.2, 1.0, {control: true}),
            sweep('sweep', 1.01, .39, .67, 3.7, -2.35, 2.35, 2.6, 3.3, 7.4, .55, {knockdown: true}),
            slam('finisher', 1.14, .54, .65, 4.7, 2.15, 2.5, 3.25, 5.0, 8.2, {knockdown: true})
          ]
        }
      ];
      // Original rig contact samples at 11 points of each active window.
      // Babylon NullEngine measured the final physical weapon sockets; each
      // curve is an authored bound, shared by collision timing and animation.
      // The .10m tolerance plus actor radius covers a weapon edge, not a long
      // invisible blade. Magic ground slams retain their visible shockwave.
      const contactRadii = [
        {light:[[1.646,1.651,1.656,1.662,1.669,1.676,1.682,1.689,1.695,1.7,1.704],[1.706,1.703,1.698,1.692,1.685,1.677,1.67,1.662,1.655,1.65,1.645],[1.458,1.486,1.548,1.617,1.666,1.675,1.638,1.565,1.478,1.407,1.381],[1.364,1.406,1.443,1.47,1.484,1.482,1.463,1.427,1.379,1.321,1.257]],heavy:[[1.364,1.407,1.444,1.472,1.464,1.452,1.436,1.418,1.38,1.322,1.258],[1.455,1.483,1.545,1.615,1.664,1.674,1.637,1.565,1.479,1.408,1.382],[1.683,1.711,1.734,1.754,1.769,1.778,1.782,1.778,1.765,1.738,1.685],[1.627,1.637,1.643,1.651,1.663,1.677,1.69,1.701,1.708,1.709,1.704],[1.389,1.391,1.396,1.403,1.41,1.416,1.422,1.425,1.426,1.425,1.422]]},
        {light:[[2.267,2.319,2.366,2.404,2.428,2.437,2.428,2.404,2.367,2.319,2.267],[2.267,2.319,2.366,2.404,2.428,2.436,2.428,2.403,2.366,2.319,2.267],[2.263,2.268,2.273,2.28,2.288,2.296,2.303,2.311,2.317,2.322,2.325],[1.989,2.028,2.116,2.214,2.28,2.289,2.23,2.118,1.989,1.883,1.843],[2.327,2.327,2.323,2.316,2.306,2.296,2.285,2.275,2.267,2.262,2.26]],heavy:[[2.267,2.319,2.366,2.404,2.428,2.437,2.428,2.404,2.367,2.319,2.267],[1.992,2.031,2.119,2.216,2.283,2.291,2.232,2.121,1.991,1.885,1.844],[2.325,2.321,2.316,2.31,2.302,2.294,2.286,2.278,2.271,2.265,2.26],[2.262,2.258,2.26,2.268,2.281,2.296,2.311,2.322,2.327,2.326,2.319],[2.435,2.432,2.426,2.416,2.402,2.385,2.402,2.416,2.426,2.433,2.435],[2.288,2.266,2.254,2.257,2.274,2.296,2.316,2.326,2.325,2.311,2.289]]},
        {light:[[1.15,1.154,1.159,1.165,1.171,1.178,1.184,1.191,1.197,1.202,1.207],[1.211,1.208,1.204,1.198,1.191,1.184,1.177,1.17,1.163,1.157,1.152],[1.157,1.209,1.256,1.293,1.318,1.326,1.318,1.294,1.257,1.209,1.157],[1.152,1.158,1.164,1.171,1.179,1.186,1.192,1.199,1.204,1.208,1.211],[1.026,1.045,1.087,1.134,1.169,1.18,1.161,1.12,1.069,1.028,1.013],[1.205,1.212,1.213,1.207,1.196,1.181,1.167,1.155,1.147,1.146,1.151]],heavy:[[0.97,1.015,1.056,1.087,1.105,1.099,1.088,1.061,1.016,0.962,0.902],[1.156,1.152,1.142,1.126,1.106,1.121,1.147,1.169,1.186,1.197,1.2],[1.21,1.206,1.201,1.195,1.188,1.181,1.189,1.195,1.201,1.206,1.21],[1.177,1.156,1.143,1.142,1.155,1.175,1.195,1.207,1.206,1.193,1.173],[1.302,1.31,1.316,1.32,1.323,1.324,1.323,1.32,1.315,1.309,1.302],[1.2,1.211,1.213,1.208,1.197,1.182,1.198,1.209,1.213,1.211,1.201],[1.18,1.161,1.148,1.146,1.156,1.173,1.194,1.215,1.214,1.202,1.179]]},
        {light:[[1.609,1.613,1.619,1.626,1.633,1.64,1.648,1.655,1.661,1.667,1.67],[1.673,1.67,1.665,1.659,1.652,1.644,1.636,1.628,1.62,1.614,1.609],[1.651,1.703,1.747,1.758,1.758,1.75,1.735,1.716,1.694,1.67,1.645],[1.357,1.4,1.438,1.467,1.482,1.481,1.463,1.429,1.382,1.325,1.264]],heavy:[[1.261,1.267,1.276,1.285,1.293,1.297,1.298,1.294,1.286,1.273,1.257],[1.406,1.444,1.515,1.58,1.626,1.636,1.606,1.543,1.468,1.408,1.386],[1.651,1.699,1.725,1.746,1.762,1.772,1.775,1.77,1.75,1.703,1.651],[1.546,1.539,1.558,1.588,1.622,1.641,1.657,1.669,1.674,1.672,1.662],[1.42,1.427,1.442,1.458,1.475,1.489,1.498,1.503,1.501,1.494,1.48]]}
      ];
      for(let hero=0;hero<sets.length;hero++) {
        for(const kind of ['light','heavy']) {
          for(let index=0;index<sets[hero][kind].length;index++) {
            const move=sets[hero][kind][index],g=move.geometry;
            if(g.shape==='slam') {
              move.magic=true;g.offset=hero===3?1.20:1.35;g.reach=g.offset+g.radius;
            } else {
              g.radiusCurve=contactRadii[hero][kind][index];
              g.reach=Math.max(...g.radiusCurve)+.10;
              if(g.shape==='sweep') g.width=[.25,.17,.18,.29][hero];
            }
          }
        }
      }
      // The added champions share measured weapon families, with independently
      // owned timings and contact geometry. Never alias another hero's moves.
      const championRoutes = (family, timing, damage, posture, knock) => {
        const routes = {};
        for (const kind of ['light', 'heavy']) routes[kind] = sets[family][kind].map(move => ({
          ...move,
          duration: move.duration * timing,
          start: move.start * timing,
          end: move.end * timing,
          damage: move.damage * damage,
          posture: move.posture * posture,
          knock: move.knock * knock,
          drive: {...move.drive, start: move.drive.start * timing, end: move.drive.end * timing},
          geometry: {...move.geometry, radiusCurve: move.geometry.radiusCurve?.slice()}
        }));
        return routes;
      };
      sets.push(championRoutes(1, 1.10, 1.06, 1.12, 1.10)); // Daeron: measured polearm sockets.
      sets.push(championRoutes(0, 1.04, .98, 1.20, 1.08));  // Maelis: sword contact, shield control.
      const championPace = {
        vanguard: [1.01, 1.05, 1.10, 1.10],
        hunter: [.92, .98, 1.02, .90],
        tempest: [1.02, 1.03, 1.18, 1.12],
        breaker: [1.08, 1.08, 1.20, 1.20],
        guardian: [1.06, .98, 1.22, 1.10],
        storm: [.90, .94, .96, .94]
      };
      for (let hero = sets.length; hero < HEROES.length; hero++) {
        const h = HEROES[hero], family = clamp(h.style || 0, 0, 3),
          pace = championPace[h.skillProfile] || [1, 1, 1, 1];
        sets.push(championRoutes(family, ...pace));
      }
      const cloneMove = move => ({...move, drive:{...move.drive}, geometry:{...move.geometry,radiusCurve:move.geometry.radiusCurve?.slice()}});
      // Six normal hits and C1–C6 follow one consistent input grammar. Added
      // hits use each weapon's measured sockets, with their own pace and force.
      for (const set of sets) {
        set.light.forEach((move, index) => {move.poseIndex = index + 1; move.finishPose = index === set.light.length - 1;});
        const originals = set.light.slice(), finisher = originals[originals.length - 1];
        while (set.light.length < 5) {
          const move = cloneMove(originals[set.light.length % Math.max(1, originals.length - 1)]);
          move.damage *= 1.08; move.posture *= 1.12; set.light.push(move);
        }
        if (set.light.length < 6) {
          const move = cloneMove(finisher);
          move.damage *= 1.25; move.knock = Math.max(3.6, move.knock);
          set.light.push(move);
        }
        set.light.forEach((move, index) => {
          move.knockdown = index === 5;
          if (index < 5) move.knock = Math.min(move.knock, 2.4);
        });
        while (set.heavy.length < 6) {
          const move = cloneMove(set.heavy[set.heavy.length - 1]);
          move.damage *= 1.20; move.posture *= 1.15; move.knock *= 1.12;
          move.knockdown = true; set.heavy.push(move);
        }
        set.heavy.length = 6;
      }
      return sets;
    }
    routeDefinitions(hero) {
      return this.moves[hero] || this.moves[0];
    }
    beginCharge(p) {
      if(p.y > 0 || p.vy > 0) return false;
      // Route capture occurs on acceptance, not release; charging preserves it.
      p.chargeRoute = this.chainTime > 0 ? this.chain : 0;
      p.attack = null; p.state = 'HeavyCharge'; p.stateTime = 0; p.charge = 0;
      return true;
    }
    applyMove(a, move, p) {
      Object.assign(a, move);
      a.damage = p.dmg * move.damage;
      a.posture = (HEROES[p.hero].style === 3 ? 45 : 22) * move.posture;
      a.geometry = {...move.geometry}; a.drive = {...move.drive};
      a.reach = a.geometry.reach;
      a.arc = Math.max(Math.abs(a.geometry.from), Math.abs(a.geometry.to));
      a.side = move.side || (a.geometry.to >= a.geometry.from ? 1 : -1);
      a.pulses = move.pulses || 1;
      a.cancelAt = Math.max(a.end + .025, a.duration * .66);
      a.dodgeAt = a.start + .025; a.turnUntil = a.start * .60;
      if (a.launch) a.geometry.maxY = 4.2;
    }
    initPlayer(hero, x, z) {
      hero = Number.isInteger(hero) ? clamp(hero, 0, HEROES.length - 1) : 0;
      let h = HEROES[hero],
        pr = save.data.heroes[hero], relic = save.loadout?.(hero) || {},
        maxHp = h.hp * (1 + .08 * pr.up[0] + .004 * (pr.level - 1)) * (1 + (relic.hp || 0));
      return {
        hero,
        x,
        z,
        y: 0,
        vy: 0,
        airFollow: 0,
        airAttacks: 0,
        yaw: 0,
        hp: maxHp,
        maxHp,
        relic,
        energy: 100,
        ult: 0,
        guard: 100,
        shield: 0,
        shieldTime: 0,
        iron: 0,
        state: 'Idle',
        stateTime: 0,
        cooldowns: [0, 0],
        attack: null,
        invul: 0,
        grace: 0,
        critTime: 0,
        parryTime: 0,
        counter: 0,
        passive: 0,
        focusTime: 0,
        perfectDodgeTime: 0,
        perfectDodgeAwarded: false,
        faction: 0,
        active: true,
        stun: 0,
        dmg: h.dmg * (1 + .08 * pr.up[1] + .004 * (pr.level - 1)) * (1 + (relic.damage || 0)),
        dead: false,
        deathTime: 0,
        deathDuration: .6,
        moveDX: 0,
        moveDZ: 0,
        moveSpeed: 0,
        reactionTime: 0,
        reactionDuration: .16,
        mounted: false,
        mountHeight: 0
      }
    }
    championSkill(p, a, skill) {
      const profile = HEROES[p.hero].skillProfile;
      if (profile === 'vanguard') {
        if (skill === 0) {
          Object.assign(a, {duration: .98, start: .22, reach: 4.2, arc: 1.6,
            pulses: 2, damage: a.damage * .92, posture: 105, knock: 5,
            move: .65, knockdown: true, gateDamage: true, magic: true});
        } else {
          p.focusTime = 6;
          p.counter = 2.2;
          p.shield = Math.max(p.shield, 90); p.shieldTime = Math.max(p.shieldTime, 6);
          Object.assign(a, {duration: .55, damage: 0, move: 0});
          app.ui.message('تركيز الحارس: ردّ قوي جاهز وضرر أعلى ودرع لمدة ٦ ثوانٍ', 3);
        }
      } else if (profile === 'hunter') {
        if (skill === 0) {
          Object.assign(a, {duration: .72, reach: 3.4, arc: .55, pulses: 3,
            damage: a.damage * .58, move: 1.8, posture: 45});
          p.invul = Math.max(p.invul, .20);
        } else {
          Object.assign(a, {duration: 1.45, reach: 3.8, omni: true, pulses: 4,
            damage: a.damage * .52, move: .25, launch: true});
          p.critTime = Math.max(p.critTime, 3);
        }
      } else if (profile === 'tempest') {
        if (skill === 0) {
          Object.assign(a, {duration: .92, reach: 6.2, arc: .42, pulses: 2,
            damage: a.damage * .90, move: 1.15, posture: 100, knock: 5.5, magic: true});
        } else {
          Object.assign(a, {duration: 1.55, reach: 5.2, omni: true, pulses: 3,
            damage: a.damage * .65, move: .15, launch: true, magic: true});
        }
      } else if (profile === 'breaker') {
        if (skill === 0) {
          Object.assign(a, {duration: 1.08, start: .38, reach: 5.3, slamRadius: 3.5,
            damage: a.damage * 1.40, posture: 150, knock: 8, move: .1,
            knockdown: true, gateDamage: true, gateMultiplier: 2, magic: true});
        } else {
          p.iron = Math.max(p.iron, 7);
          p.shield = Math.max(p.shield, 100); p.shieldTime = Math.max(p.shieldTime, 7);
          p.guard = Math.min(100, p.guard + 40);
          Object.assign(a, {duration: .60, damage: 0, move: 0});
          app.ui.message('عهد الحديد: مقاومة للترنّح ودرع ١٠٠ لمدة ٧ ثوانٍ', 3);
        }
      } else if (profile === 'guardian') {
        if (skill === 0) {
          Object.assign(a, {duration: .86, start: .18, reach: 3.1, arc: .55,
            damage: a.damage * .95, posture: 125, knock: 6, move: .70,
            control: true, knockdown: true});
          p.invul = Math.max(p.invul, .16);
        } else {
          p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .12);
          p.shield = Math.max(p.shield, 100); p.shieldTime = Math.max(p.shieldTime, 7);
          for (const ally of app.spatial.query(p.x, p.z, 9)) {
            if (ally.faction !== p.faction || ally.hp <= 0 || ally.dead) continue;
            ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * .12);
            ally.shield = Math.max(ally.shield || 0, 70); ally.shieldTime = 7;
            ally.rally = Math.max(ally.rally || 0, 7);
          }
          Object.assign(a, {duration: .70, damage: 0, move: 0});
          app.effects.emit(p.x, p.z, 9, .65, 1);
          app.ui.message('راية الحياة: شفاء ١٢٪ ودرع للحارس والحلفاء القريبين', 3);
        }
      } else if (profile === 'storm') {
        if (skill === 0) {
          Object.assign(a, {duration: .82, reach: 3.2, arc: .55, pulses: 5,
            damage: a.damage * .40, move: 1.95, posture: 38});
          p.invul = Math.max(p.invul, .18);
        } else {
          p.focusTime = 4;
          Object.assign(a, {duration: 1.45, reach: 3.9, omni: true, pulses: 5,
            damage: a.damage * .40, move: .4, knockdown: true, magic: true});
          app.ui.message('حجاب العاصفة: هجمات حاسمة لمدة ٤ ثوانٍ', 3);
        }
      }
    }
    attack(kind, charge = 0, skill = -1) {
      let p = app.player;
      if (p.hp <= 0 || p.dead || p.state === 'Stagger') return false;
      if(kind === 'skill' && skill !== 0 && skill !== 1) return false;
      const airborne = !p.mounted && (p.y > 0 || p.vy > 0);
      if (airborne && (kind === 'light' || kind === 'heavy') && p.airAttacks >= 2) return false;
      if (kind !== 'heavy') p.chargeRoute = undefined;
      if (!p.mounted && app.camera.target?.hp > 0) p.yaw = angle(app.camera.target.x - p.x, app.camera.target.z - p.z);
      let h = HEROES[p.hero],
        upgrade = save.data.heroes[p.hero].up[2],
        a = {
          id: this.strikeID++,
          time: 0,
          duration: h.duration,
          start: .1,
          end: .22,
          reach: h.reach,
          arc: h.arc,
          damage: p.dmg,
          posture: h.style === 3 ? 45 : 22,
          knock: 1.2,
          move: .3,
          kind,
          pulses: 1,
          done: 0,
          hit: new Set(),
          launch: false,
          omni: false,
          turn: .25,
          skill,
          chain: this.chain,
          comboIndex: this.chain,
          impactTime: 10,
          hitStopUsed: 0
        };
      if (kind === 'light') {
        this.chain = this.chainTime > 0 ? this.chain % Math.max(4, h.chain) + 1 : 1;
        this.chainTime = 1.05;
        a.chain = a.comboIndex = this.chain; a.route = this.chain - 1;
        a.routeName = 'N' + this.chain;
        this.applyMove(a, this.moves[p.hero].light[(this.chain - 1) % this.moves[p.hero].light.length], p);
        if (!p.mounted && (p.airFollow > 0 || airborne) && (p.airAttacks || 0) < 2) {
          if (p.y <= 0 && p.vy <= 0) {p.y = .05; p.vy = 5.0; p.airAttacks = 0;}
          p.airAttacks++; p.airFollow = 0; a.motion = 'air';
          a.duration = h.style === 3 ? .45 : .32;
          a.start = .08; a.end = .22; a.cancelAt = .26; a.dodgeAt = .12;
          a.damage *= 1.18; a.posture *= 1.35;
          a.geometry.minY = -2.8; a.geometry.maxY = 2.8;
          a.drive = {distance:.45,start:.035,end:a.end};
          a.turnUntil = .04; a.air = true; a.knockdown = p.airAttacks >= 2;
        }
        if (p.critTime > 0) {a.crit = true; p.critTime = 0;}
        if (p.focusTime > 0) {
          if (h.skillProfile === 'storm') a.crit = true;
          else a.damage *= 1.15;
        }
        if (p.state === 'Sprint' || p.dodgeAttack > 0) {
          a.damage *= 1.35; a.drive.distance += .8; a.knock += 1.8;
          a.dodgeAttack = true; p.dodgeAttack = 0;
        }
        if (p.counter > 0) {
          a.damage *= h.passiveKind === 'counter' ? 2.1 : 1.8;
          a.posture *= 3; a.counter = true; p.counter = 0;
        }
      }
      if (kind === 'heavy') {
        const preceding = Math.min(5, typeof p.chargeRoute === 'number' ? p.chargeRoute : this.chainTime > 0 ? this.chain : 0);
        p.chargeRoute = undefined;
        const route = Math.min(preceding, this.moves[p.hero].heavy.length - 1);
        a.route = preceding; a.routeName = 'C' + (preceding + 1);
        a.chain = a.comboIndex = preceding;
        this.applyMove(a, this.moves[p.hero].heavy[route], p);
        a.charge = clamp(charge, 0, 1);
        a.damage *= 1 + a.charge * .65; a.posture *= 1 + a.charge * .75;
        a.knock *= 1 + a.charge * .25;
        if (p.passive > 0 && p.hero === 0) {a.damage *= 1.6; p.passive = 0;}
        if (p.focusTime > 0) a.damage *= h.skillProfile === 'vanguard' ? 1.25 : 1.10;
        if (p.counter > 0) {a.damage *= h.passiveKind === 'counter' ? 1.90 : 1.65; a.posture *= 2; p.counter = 0; a.counter = true;}
        a.gateDamage = true; a.gateMultiplier = (p.hero === 3 || h.passiveKind === 'breaker') && charge > .4 ? 2 : 1;
        if (h.passiveKind === 'breaker' && charge > .4) a.posture *= 1.35;
        if (airborne) {
          // Jump charge attacks fall into a small, visible ground impact.
          // A second airborne strike remains possible; there is no air loop.
          p.airAttacks++; p.airFollow = 0; p.vy = Math.min(p.vy, -2.5);
          a.motion = 'air'; a.routeName = 'JUMP C'; a.air = true;
          a.duration = .58; a.start = .18; a.end = .34;
          a.damage = p.dmg * 1.65; a.posture = 65; a.knock = 4.8;
          a.launch = false; a.knockdown = true; a.magic = true;
          a.geometry = {shape:'slam',reach:2.9,offset:.7,radius:2.2,inner:0,width:2.2,from:0,to:0,minY:-3,maxY:2.5};
          a.reach = 2.9; a.drive = {distance:0,start:0,end:0};
          a.cancelAt = .44; a.dodgeAt = .58; a.turnUntil = .06;
        }
        this.chain = this.chainTime = 0;
      }
      if (kind === 'skill') {
        let costs = ABILITIES.cost;
        if (p.energy < costs[skill] || p.cooldowns[skill] > 0) return false;
        p.energy -= costs[skill];
        p.cooldowns[skill] = h.cd[skill] * (1 - .04 * upgrade);
        a.duration = skill === 0 ? .85 : 1.3;
        a.start = .18;
        a.end = a.duration - .22;
        a.damage = p.dmg * ABILITIES.skillDamage * (1 + .06 * upgrade);
        a.posture *= 3;
        a.knock = 4;
        a.move = .4;
        a.reach += 2;
        a.arc = 1.7;
        if (p.hero === 0 && skill === 1) {
          p.shield = ABILITIES.shield;
          p.shieldTime = ABILITIES.shieldDuration;
          for (let ally of app.spatial.query(p.x, p.z, 10))
            if (ally.faction === 0) {
              ally.shield = 80;
              ally.shieldTime = 8
            };
          a.damage = 0;
          a.duration = .55;
          app.ui.message('حماية الراية: درع ١٣٥ للحارس والحلفاء القريبين', 3)
        }
        if (p.hero === 1 && skill === 0) {
          a.move = 2.5;
          a.arc = .55;
          a.reach = 5;
          a.pulses = 4;
          a.damage *= .65
        }
        if (p.hero === 1 && skill === 1) {
          a.omni = true;
          a.reach = 5;
          a.launch = true
        }
        if (p.hero === 2 && skill === 0) {
          a.move = 2.7;
          a.pulses = 4;
          a.damage *= .65;
          a.reach = 3.5;
          p.invul = .14
        }
        if (p.hero === 2 && skill === 1) {
          a.omni = true;
          a.reach = 4;
          a.pulses = 5;
          a.duration = 2;
          a.damage *= .55;
          a.move = .7
        }
        if (p.hero === 3 && skill === 0) {
          a.reach = 6;
          a.knock = 7;
          a.launch = true;
          a.gateDamage = true
        }
        if (p.hero === 4) {
          // Crescent glaive: a two-hit crescent, or four complete orbit sweeps.
          a.duration = skill === 0 ? 1.05 : 1.70;
          a.reach = skill === 0 ? 4.1 : 4.4;
          a.arc = 2.05;
          a.omni = skill === 1;
          a.pulses = skill === 0 ? 2 : 4;
          a.damage *= skill === 0 ? .90 : .50;
          a.posture *= 1.20;
          a.knock = skill === 0 ? 4.8 : 4.5;
          a.launch = skill === 0;
          a.knockdown = skill === 1;
          a.move = skill === 0 ? .45 : .20;
        }
        if (p.hero === 5 && skill === 0) {
          a.duration = .82;
          a.start = .16;
          a.reach = 2.65;
          a.arc = .45;
          a.damage *= .85;
          a.posture = 110;
          a.knock = 7;
          a.control = true;
          a.knockdown = true;
          a.move = .60;
          p.invul = Math.max(p.invul, .16);
        }
        if (p.hero === 5 && skill === 1) {
          p.shield = Math.max(p.shield, 160);
          p.shieldTime = 7;
          p.guard = Math.min(100, p.guard + 45);
          for (const ally of app.spatial.query(p.x, p.z, 6)) {
            if (ally.faction === 0 && ally.hp > 0) {
              ally.shield = Math.max(ally.shield || 0, 90);
              ally.shieldTime = 7;
            }
          }
          a.duration = .60;
          a.damage = 0;
          a.move = 0;
          app.ui.message('عهد الحماية: درع ١٦٠ لمدة ٧ ثوانٍ و٩٠ للحلفاء القريبين؛ تجدد الصدّ', 3);
        }
        if (p.hero === 3 && skill === 1) {
          p.iron = ABILITIES.ironDuration;
          p.shield = 55;
          a.duration = .6;
          a.damage = 0;
          a.move = 1;
          app.ui.message('تقدّم الحديد: مقاومة للترنّح وصدّ أقوى لمدة ٧ ثوانٍ', 3)
        }
        this.championSkill(p, a, skill);
      }
      if (kind === 'ultimate') {
        if (p.ult < 100 || this.ultimateLock > 0) return false;
        p.ult = 0;
        this.ultimateLock = ABILITIES.ultimateRecharge;
        a.duration = ABILITIES.ultimateDuration;
        a.start = .3;
        a.end = 2.7;
        a.reach = ABILITIES.ultimateReach[p.hero] ?? 10;
        a.arc = 1.7;
        a.omni = p.hero !== 1;
        a.pulses = ABILITIES.ultimatePulses[p.hero] ?? 4;
        a.damage = p.dmg * (ABILITIES.ultimateDamage[p.hero] ?? 3) * (1 + .06 * upgrade);
        a.posture = 180;
        a.knock = 9;
        a.launch = true;
        a.move = .3;
        p.invul = 1;
        if (p.hero === 5) {
          p.shield = Math.max(p.shield, 120);
          p.shieldTime = Math.max(p.shieldTime, 6);
        }
        if (h.skillProfile === 'tempest') {a.omni = true; a.pulses = Math.max(4, a.pulses);}
        if (h.skillProfile === 'breaker') {a.launch = false; a.knockdown = true; a.gateDamage = true; a.gateMultiplier = 2;}
        if (h.skillProfile === 'guardian') {
          p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .18);
          p.shield = Math.max(p.shield, 120); p.shieldTime = Math.max(p.shieldTime, 8);
          for (const ally of app.spatial.query(p.x, p.z, a.reach)) {
            if (ally.faction === p.faction && ally.hp > 0) {
              ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * .18);
              ally.shield = Math.max(ally.shield || 0, 100); ally.shieldTime = 8;
            }
          }
        }
        app.ui.message(h.ultimate, 3)
      }
      if(kind === 'skill') a.end = Math.max(a.start + .07, a.duration - .22);
      if (kind !== 'ultimate' && h.skillProfile === 'storm' && p.focusTime > 0) a.crit = true;
      if (!a.geometry) {
        a.motion = kind === 'ultimate' ? 'finisher' : a.launch ? 'launcher' : a.omni ? 'sweep' : a.arc < .7 ? 'thrust' : 'overhead';
        a.route = 0; a.routeName = kind === 'ultimate' ? 'MUSOU' : 'S' + (skill + 1);
        a.geometry = a.omni ? {shape:'sweep',reach:a.reach,inner:.2,width:.5,from:-Math.PI,to:Math.PI,minY:-.3,maxY:a.launch?4.2:2.8} :
          a.arc < .7 ? {shape:'thrust',reach:a.reach,inner:.4,width:.55,from:0,to:0,minY:-.2,maxY:3.2} :
          {shape:'sweep',reach:a.reach,inner:.3,width:.55,from:-a.arc,to:a.arc,minY:-.3,maxY:3.8};
        if (a.slamRadius) {
          a.motion = 'overhead';
          a.geometry = {shape:'slam',reach:a.reach,offset:1.8,radius:a.slamRadius,inner:0,width:a.slamRadius,from:0,to:0,minY:-.4,maxY:1.8};
        }
        if (p.hero === 5 && skill === 0 && kind === 'skill') {
          a.motion = 'control';
          a.geometry.width = .90;
        }
        if (kind === 'ultimate' || p.hero === 3 && skill === 0 || p.hero === 4 && kind === 'skill') a.magic = true;
        a.drive = {distance:h.speed * a.move * (a.end-a.start),start:a.start,end:a.end};
        a.cancelAt = kind === 'ultimate' ? a.duration : Math.max(a.end+.03,a.duration*.80);
        a.dodgeAt = kind === 'ultimate' ? a.duration : a.start+.045;
        a.turnUntil = a.start*.55; a.side = 1;
        this.chain = this.chainTime = 0;
      }
      const labels={overhead:'كسر مركز',thrust:'اندفاع النصل',launcher:'رفع العدو',control:'كسر التوازن',sweep:'اجتياح الصفوف',finisher:'الضربة الحاسمة',slash:'قطع جانبي',air:'متابعة جوية'};
      a.label=labels[a.motion]||a.routeName;
      if (p.mounted) {
        a.mounted = true; a.drive.distance = 0;
        a.geometry.minY = -.35; a.geometry.maxY = 3.8;
        if (kind === 'light' || kind === 'heavy') {a.damage *= 1.12; a.posture *= 1.12;}
      }
      a.facing = p.yaw; a.progress = 0; a.swingPlayed = false;
      p.attack = a;
      p.state = kind === 'light' ? (a.counter ? 'ParryCounter' : 'LightAttack') : kind === 'heavy' ? 'HeavyAttack' : kind === 'skill' ? 'Skill' : 'Ultimate';
      p.stateTime = 0;
      if(kind==='ultimate') app.audio.sfx('ultimate');
      if (kind === 'skill' && a.damage === 0) app.effects.emit(p.x, p.z, 3, .45, 1);
      return true
    }
    rewardPerfectDodge(p) {
      if (p.perfectDodgeAwarded) return;
      const h = HEROES[p.hero], energy = h.skillProfile === 'hunter' ? 18 : 12,
        ultimate = h.skillProfile === 'storm' ? 12 : 8;
      p.perfectDodgeAwarded = true;
      p.perfectDodgeTime = 1.4;
      p.energy = Math.min(100, p.energy + energy);
      p.ult = Math.min(100, p.ult + ultimate);
      p.dodgeAttack = Math.max(p.dodgeAttack || 0, 1.2);
      if (p.hero === 2 || h.passiveKind === 'evade') p.critTime = Math.max(p.critTime, 2.5);
      app.battle.stats.perfectDodges = (app.battle.stats.perfectDodges || 0) + 1;
      app.effects.emit(p.x, p.z, 2.1, .32, 1);
      app.audio.sfx('parry');
      app.ui.message('تفادٍ متقن! +' + energy + ' طاقة • +' + ultimate + ' قصوى', 2);
    }
    step(dt) {
      // Hit-stop consumes real fixed-step time and slows both sides equally.
      let pausePart = Math.min(dt, this.hitPause);
      this.simScale = 1 - .8 * pausePart / Math.max(.001, dt);
      this.hitPause = Math.max(0, this.hitPause - dt);
      let p = app.player, x = p.x, z = p.z, simDt = dt * this.simScale;
      p.reactionTime = Math.max(0, (p.reactionTime || 0) - simDt);
      if (p.dead) p.deathTime = Math.min(p.deathDuration || .6, (p.deathTime || 0) + simDt);
      if (p.attack) p.attack.impactTime += simDt;
      this.stepPlayer(simDt);
      app.mounts?.update(simDt);
      p.moveDX = p.x - x;
      p.moveDZ = p.z - z;
      p.moveSpeed = Math.hypot(p.moveDX, p.moveDZ) / Math.max(.001, dt)
    }
    clearBuffers() {
      this.buffer = this.heavyBuffer = this.dodgeBuffer = this.jumpBuffer = 0;
      this.skillBuffer = null
    }
    stepPlayer(dt) {
      let p = app.player,
        h = HEROES[p.hero],
        i = app.input;
      this.dodgeCD = Math.max(0, this.dodgeCD - dt);
      this.dodgeBuffer = Math.max(0, this.dodgeBuffer - dt);
      this.jumpCD = Math.max(0, this.jumpCD - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.ultimateLock = Math.max(0, this.ultimateLock - dt);
      if (!p.attack && p.state !== 'HeavyCharge') this.chainTime = Math.max(0, this.chainTime - dt);
      p.airFollow = Math.max(0, (p.airFollow || 0) - dt);
      if (p.y > 0 || p.vy > 0) {
        p.vy -= dt * 17; p.y = Math.max(0, p.y + p.vy * dt);
        if (p.y === 0) {p.vy = 0; p.airAttacks = 0; if (!p.attack && p.state !== 'Dodge') {p.state = 'Recover'; p.stateTime = 0;}}
      }
      this.buffer = Math.max(0, this.buffer - dt);
      this.heavyBuffer = Math.max(0, this.heavyBuffer - dt);
      if (this.skillBuffer) {
        this.skillBuffer.ttl -= dt;
        if (this.skillBuffer.ttl <= 0) this.skillBuffer = null
      };
      p.invul = Math.max(0, p.invul - dt);
      p.grace = Math.max(0, p.grace - dt);
      p.counter = Math.max(0, p.counter - dt);
      p.passive = Math.max(0, p.passive - dt);
      p.focusTime = Math.max(0, (p.focusTime || 0) - dt);
      p.perfectDodgeTime = Math.max(0, (p.perfectDodgeTime || 0) - dt);
      p.critTime = Math.max(0, p.critTime - dt);
      p.dodgeAttack = Math.max(0, (p.dodgeAttack || 0) - dt);
      p.iron = Math.max(0, p.iron - dt);
      p.shieldTime = Math.max(0, p.shieldTime - dt);
      if (!p.shieldTime && !p.iron) p.shield = 0;
      p.cooldowns = p.cooldowns.map(c => Math.max(0, c - dt * (1 + (p.relic?.cooldown || 0))));
      p.energy = Math.min(100, p.energy + dt * 4 * (1 + (p.relic?.energyRegen || 0)));
      if (p.hp > 0 && p.hp <= p.maxHp * .22 && p.state !== 'Ultimate') p.ult = Math.min(100, p.ult + dt * 4.2);
      if (p.state !== 'Guard') p.guard = Math.min(100, p.guard + dt * 19);
      p.stateTime += dt;
      let move = i.move,
        m = Math.hypot(move.x, move.y),
        yaw = app.camera.yaw,
        dx = move.x * Math.cos(yaw) - move.y * Math.sin(yaw),
        dz = -move.x * Math.sin(yaw) - move.y * Math.cos(yaw),
        speed = h.speed;
      let lightEdge = i.press('light');
      if (lightEdge) this.buffer = .48;
      let heavyEdge = i.press('heavy'),
        heavyReleased = i.release('heavy'),
        dodge = i.press('dodge'),
        guardEdge = i.press('guard'),
        skill1 = i.press('skill1'),
        skill2 = i.press('skill2'),
        ultimate = i.press('ultimate'),
        jump = i.press('jump');
      if (i.press('interact') && !app.mounts?.interact()) app.battle.interact();
      let canCancel = !p.attack || p.attack.time >= p.attack.cancelAt;
      if (heavyEdge) this.heavyBuffer = .52;
      if (jump) this.jumpBuffer = .25;
      if (skill1 || skill2 || ultimate) this.skillBuffer = {
        kind: ultimate ? 'ultimate' : 'skill',
        index: skill2 ? 1 : 0,
        ttl: .32
      };
      if (p.state === 'Dead') return;
      if (p.state === 'Recover' && !p.attack) {
        if (p.stateTime < .16) return;
        p.state = 'Idle';
      }
      if (p.state === 'Stagger') {
        this.clearBuffers(); this.chain = this.chainTime = 0; p.chargeRoute = undefined;
        if (p.stateTime > .32) {
          p.state = 'Idle';
          p.grace = .65
        }
        return
      }
      if (this.jumpBuffer > 0 && p.mounted && p.attack?.kind !== 'ultimate') {
        this.jumpBuffer = 0;
        app.mounts?.dismount();
      } else if (this.jumpBuffer > 0 && !p.mounted && this.jumpCD <= 0 && p.y <= 0 && p.vy <= 0 && canCancel && p.state !== 'HeavyCharge') {
        this.jumpBuffer = 0; this.jumpCD = .45;
        p.attack = null; p.chargeRoute = undefined;
        this.chain = this.chainTime = 0;
        p.y = .04; p.vy = 7.4; p.airAttacks = 0; p.airFollow = 0;
        p.state = 'Jump'; p.stateTime = 0;
      }
      // A mount keeps its momentum during swings and charge preparation.
      if (p.mounted) app.mounts?.move(dx, dz, m, dt, i.held('sprint') || i.held('dodge'));
      if (p.attack && canCancel && this.skillBuffer) {
        let q = this.skillBuffer;
        this.skillBuffer = null;
        if (this.attack(q.kind, 0, q.index)) return
      }
      if (p.attack && canCancel && this.heavyBuffer > 0) {
        this.heavyBuffer = 0;
        if (i.held('heavy') && p.y <= 0 && p.vy <= 0) {
          this.beginCharge(p)
        } else this.attack('heavy');
        return
      }
      if (p.attack && canCancel && i.held('guard')) {
        p.attack = null;
        p.state = 'Idle'
      }
      if (dodge) this.dodgeBuffer = .20;
      let dodgeAllowed = !p.mounted && p.y <= 0 && p.vy <= 0 && (!p.attack || p.attack.kind !== 'ultimate' && p.attack.time >= p.attack.dodgeAt);
      if (this.dodgeBuffer > 0 && this.dodgeCD <= 0 && dodgeAllowed) {
        this.dodgeBuffer = 0;
        p.attack = null;
        p.chargeRoute = undefined;
        this.chain = this.chainTime = 0;
        p.state = 'Dodge';
        p.stateTime = 0;
        this.dodgeCD = h.skillProfile === 'storm' ? .62 : h.skillProfile === 'hunter' ? .68 : .75;
        p.invul = .14;
        p.perfectDodgeAwarded = false;
        p.dodgeDir = {
          x: m > .1 ? dx : Math.sin(p.yaw),
          z: m > .1 ? dz : Math.cos(p.yaw)
        };
        const dodgeLength = Math.hypot(p.dodgeDir.x, p.dodgeDir.z);
        if (dodgeLength > .001) {p.dodgeDir.x /= dodgeLength; p.dodgeDir.z /= dodgeLength;}
        p.dodgeAttack = .8;
        let danger = app.spatial.query(p.x, p.z, 3.5).some(a => a.faction === 1 && a.state === 'Windup');
        if (danger && (p.hero === 2 || h.passiveKind === 'evade')) p.critTime = 2;
        app.audio.sfx('dodge')
      }
      if (p.state === 'Dodge') {
        app.collision.move(p, p.dodgeDir.x * dt * 12, p.dodgeDir.z * dt * 12);
        if (p.stateTime >= (h.skillProfile === 'storm' ? .30 : .38)) p.state = i.held('dodge') ? 'Sprint' : 'Idle';
        return
      }
      if (p.state === 'HeavyCharge') {
        p.charge = clamp(p.stateTime / .9, 0, 1);
        if (heavyReleased || !i.held('heavy') || p.stateTime > .9) this.attack('heavy', p.charge);
        else {
          if (!p.mounted && m > .1) app.collision.move(p, dx * speed * dt * .2, dz * speed * dt * .2);
          if (p.stateTime > .35 && Math.floor(p.stateTime * 12) !== Math.floor((p.stateTime - dt) * 12)) app.effects.emit(p.x, p.z, p.charge, .12)
        }
        return
      }
      if (p.attack) {
        let a = p.attack, before = a.time;
        a.time += dt; a.progress = clamp(a.time/a.duration,0,1);
        if(!a.swingPlayed && a.time>=Math.max(.02,a.start-.045)) {
          a.swingPlayed=true; app.audio.sfx(a.kind==='light'?'light':a.kind==='heavy'?'heavy':a.kind);
        }
        // Aim correction is bounded to anticipation; contact facing is locked.
        if (!p.mounted && m > .1 && a.time < a.turnUntil) {
          p.yaw += clamp(wrap(angle(dx,dz)-p.yaw),-dt*3,dt*3); a.facing = p.yaw;
        }
        if (p.mounted) a.facing = p.yaw;
        else if (p.y > 0 && m > .05) app.collision.move(p, dx * speed * dt * .55, dz * speed * dt * .55);
        if (!p.mounted && a.drive?.distance && a.time >= a.drive.start && before < a.drive.end) {
          const overlap = Math.max(0, Math.min(a.time,a.drive.end)-Math.max(before,a.drive.start));
          const distance = a.drive.distance*overlap/Math.max(.02,a.drive.end-a.drive.start);
          app.collision.move(p,Math.sin(a.facing)*distance,Math.cos(a.facing)*distance);
        }
        if (a.time >= a.start && before <= a.end && a.damage > 0) {
          const span = Math.max(.01,a.end-a.start), from = clamp((before-a.start)/span,0,1)*a.pulses,
            to = clamp((a.time-a.start)/span,0,1)*a.pulses;
          for (let pulse=Math.min(a.pulses-1,Math.floor(from));pulse<=Math.min(a.pulses-1,Math.floor(to));pulse++) {
            const phaseFrom=clamp(from-pulse,0,1),phaseTo=clamp(to-pulse,0,1);
            if(phaseTo<phaseFrom) continue;
            a.pulse = pulse; a.pulsePhase = phaseTo;
            this.resolveStrike(p,a,pulse,phaseFrom,phaseTo);
            if(a.done<=pulse) {
              a.done=pulse+1;
              const g=a.geometry, offset=g.shape==='slam'?g.offset:a.magic?0:Math.min(2,g.reach*.55);
              app.effects.emit(p.x+Math.sin(a.facing)*offset,p.z+Math.cos(a.facing)*offset,g.shape==='slam'?g.radius:a.magic?a.reach:.42,a.magic?.42:.16);
            }
          }
        }
        if (a.time >= a.duration) {
          if (a.kind === 'light') this.chainTime = 1.05;
          p.attack = null; p.state = p.y > 0 ? 'Jump' : 'Idle'; p.stateTime = 0;
        } else if (a.time >= a.cancelAt && (this.buffer > 0 || i.held('light'))) {
          this.buffer = 0; this.attack('light');
        }
        return;
      }
      if (guardEdge || i.held('guard')) {
        if (p.state !== 'Guard') {
          p.state = 'Guard';
          p.stateTime = 0;
          p.parryTime = .145
        }
        p.parryTime = Math.max(0, p.parryTime - dt);
        if (m > .1) {
          p.yaw = app.camera.target ? angle(app.camera.target.x - p.x, app.camera.target.z - p.z) : angle(dx, dz);
          if (!p.mounted) app.collision.move(p, dx * speed * dt * .3, dz * speed * dt * .3)
        }
      } else if (p.state === 'Guard') p.state = 'Idle';
      if (this.skillBuffer) {
        let q = this.skillBuffer;
        this.skillBuffer = null;
        this.attack(q.kind, 0, q.index);
        return
      }
      if (this.heavyBuffer > 0) {
        this.heavyBuffer = 0;
        if (i.held('heavy') && p.y <= 0 && p.vy <= 0) {
          this.beginCharge(p)
        } else this.attack('heavy');
        return
      }
      if (this.buffer > 0 || i.held('light')) {
        this.buffer = 0;
        this.attack('light');
        return
      }
      if (p.state === 'Guard') return;
      if (p.mounted) {p.state = m > .05 ? 'MountedMove' : 'MountedIdle'; return;}
      if (m > .05) {
        p.state = p.y > 0 ? 'Jump' : i.held('sprint') || i.held('dodge') ? 'Sprint' : 'Move';
        p.yaw += wrap((app.camera.target ? angle(app.camera.target.x - p.x, app.camera.target.z - p.z) : angle(dx, dz)) - p.yaw) * Math.min(1, dt * 16);
        if (p.state === 'Sprint') speed *= 1.45;
        app.collision.move(p, dx * speed * dt, dz * speed * dt)
      } else p.state = p.y > 0 ? 'Jump' : 'Idle'
    }
    resolveStrike(p, a, pulse, phaseFrom = 0, phaseTo = 1) {
      let didHit = false,
        nearby = app.spatial.query(p.x, p.z, a.reach + 1);
      for (let target of nearby) {
        if (target.faction === p.faction || target.hp <= 0 || target.dead || !target.active) continue;
        let key = target.id + ':' + target.gen + ':' + pulse;
        if (a.hit.has(key)) continue;
        let dx = target.x - p.x,
          dz = target.z - p.z,
          d = Math.hypot(dx, dz);
        if (!this.volumeContains(p, a, target, phaseFrom, phaseTo, pulse)) continue;
        if (!app.collision.visible(p, target)) continue;
        a.hit.add(key);
        didHit = true;
        let crit = a.crit || rnd() < .08,
          dmg = a.damage * (crit ? 1.5 : 1),
          posture = a.posture;
        const reachTip = p.hero >= 6 && HEROES[p.hero].passiveKind === 'reach' && d > a.reach * .70;
        if ((p.hero === 1 || reachTip) && d > a.reach * .7) posture *= 1.8;
        const crescentTip = p.hero === 4 && a.kind !== 'ultimate' && d > a.reach * .70;
        if (crescentTip) posture *= 1.45;
        if (target.state === 'Guard' || target.type === 'shield' || ['sentinel', 'azrakan'].includes(TYPES[target.type]?.archetype || target.type)) {
          let frontal = Math.abs(wrap(angle(p.x - target.x, p.z - target.z) - target.yaw)) < 1.2;
          if (frontal && target.posture > 0 && target.state !== 'Recover' && target.state !== 'React' && target.state !== 'Attack' && a.kind === 'light') {
            dmg *= target.state === 'Guard' && target.elite ? .48 : .32;
            posture *= 1.2;
            app.audio.sfx('guard')
          }
        }
        this.damage(target, dmg, p, posture, a.knock, a.launch, a);
        if (a.launch && target.hp > 0 && target.y >= .05 && target.vy > 0) p.airFollow = Math.max(p.airFollow || 0, .75);
        if(app.effects.impact) app.effects.impact(target.x,target.z,{yaw:angle(target.x-p.x,target.z-p.z),heavy:a.kind!=='light',height:Math.min(2,(target.y||0)+1.1)});
        else app.effects.burst(target.x,target.z,angle(target.x-p.x,target.z-p.z),a.kind==='light'?1:1.5);
        if (a.kind !== 'ultimate') {
          p.energy = clamp(p.energy + 1.2 + (crescentTip || reachTip ? 1.4 : 0), 0, 100);
          p.ult = clamp(p.ult + 1.25, 0, 100)
        }
        app.battle.stats.combo++;
        app.battle.stats.highCombo = Math.max(app.battle.stats.highCombo, app.battle.stats.combo);
        app.battle.stats.comboTime = 2.5;
        if (app.battle.stats.combo % 25 === 0) {
          p.energy = Math.min(100, p.energy + 6);
          if (a.kind !== 'ultimate') p.ult = Math.min(100, p.ult + 4);
          p.cooldowns = p.cooldowns.map(c => Math.max(0, c - .75));
          app.battle.stats.comboMilestones = (app.battle.stats.comboMilestones || 0) + 1;
          if (app.battle.stats.combo % 50 === 0) app.ui.message('سلسلة ' + app.battle.stats.combo + ' ضربة! طاقة وتجدد أسرع للمهارات', 2);
        }
        app.camera.shake = Math.max(app.camera.shake, a.kind === 'light' ? .06 : .15);
        a.impactTime = 0;
        let pause = a.kind === 'light' ? .018 : .045,
          remaining = Math.max(0, .065 - (a.hitStopUsed || 0)),
          added = Math.min(pause, remaining, Math.max(0, pause - this.hitPause));
        if (added > 0) {
          this.hitPause = Math.min(.045, this.hitPause + added);
          a.hitStopUsed = (a.hitStopUsed || 0) + added
        }
      }
      if (didHit) app.audio.sfx(a.kind === 'light' ? 'impactLight' : 'impactHeavy');
      if (a.gateDamage)
        for (let gate of app.collision.gates) {
          const key='gate:'+app.collision.gates.indexOf(gate)+':'+pulse;
          if (gate.open || !gate.attackable || a.hit.has(key)) continue;
          const point={x:clamp(p.x,gate.x-gate.w/2,gate.x+gate.w/2),z:clamp(p.z,gate.z-gate.d/2,gate.z+gate.d/2),y:0};
          if(!this.volumeContains(p,a,point,phaseFrom,phaseTo,pulse)) continue;
          const sight={x:lerp(p.x,point.x,.995),z:lerp(p.z,point.z,.995)};
          if(!app.collision.visible(p,sight)) continue;
          a.hit.add(key); gate.hp -= a.damage*(a.gateMultiplier||1);
          app.effects.burst(point.x,point.z);
          if(gate.hp<=0) {app.collision.open(gate);app.battle.event('GateOpened',gate);}
        }
    }
    volumeContains(p, a, target, phaseFrom = 0, phaseTo = 1, pulse = 0) {
      const g=a.geometry;
      if(!g) return false;
      const height=(target.y||0)-(p.y||0);
      if(height>g.maxY || height+1.35<g.minY) return false;
      const yaw=a.facing??p.yaw, dx=target.x-p.x,dz=target.z-p.z,
        x=dx*Math.cos(yaw)-dz*Math.sin(yaw),z=dx*Math.sin(yaw)+dz*Math.cos(yaw),
        radius=target.elite?.50:.38;
      if(g.shape==='slam') return Math.hypot(x,z-g.offset)<=g.radius+radius;
      const contactReach=this.contactReach(g,phaseFrom,phaseTo);
      if(g.shape==='thrust') {
        const tip=clamp(z,g.inner,contactReach);
        return Math.hypot(x,z-tip)<=g.width+radius;
      }
      const distance=Math.hypot(x,z);
      if(distance>contactReach+g.width+radius||distance<g.inner-radius) return false;
      let start=g.from,end=g.to;
      if(a.reversePulses&&pulse%2) {start=g.to;end=g.from;}
      const lo=Math.min(lerp(start,end,phaseFrom),lerp(start,end,phaseTo)),
        hi=Math.max(lerp(start,end,phaseFrom),lerp(start,end,phaseTo)),
        theta=angle(x,z),pad=Math.asin(clamp((g.width+radius)/Math.max(.7,distance),0,.95));
      for(let turn=-1;turn<=1;turn++) {const t=theta+turn*Math.PI*2;if(t>=lo-pad&&t<=hi+pad)return true;}
      return false;
    }
    contactReach(g, phaseFrom = 0, phaseTo = 1) {
      const curve=g.radiusCurve;
      if(!curve) return g.reach;
      const last=curve.length-1,from=clamp(phaseFrom,0,1)*last,to=clamp(phaseTo,0,1)*last;
      const sample=v=>{const index=Math.min(last-1,Math.floor(v));return lerp(curve[index],curve[index+1],v-index);};
      let radius=Math.max(sample(from),sample(to));
      for(let index=Math.ceil(from);index<=Math.floor(to);index++) radius=Math.max(radius,curve[index]);
      return radius+.10;
    }
    damage(target, amount, source, posture = 0, knock = 0, launch = false, attack = null) {
      if (target.hp <= 0 || target.dead || target.invincible || source?.faction === target.faction) return;
      let player = target === app.player;
      if (player) {
        if (!target.mounted && target.y > .75 && source?.pattern === 'wave') return;
        if (target.invul > 0) {
          if (target.state === 'Dodge' && target.stateTime <= .145 && amount > 0 && source) this.rewardPerfectDodge(target);
          return;
        }
        if (target.grace > 0) return;
        const guardian = target.hero === 5 || HEROES[target.hero].passiveKind === 'guard';
        let frontal = Math.abs(wrap(angle(source.x - target.x, source.z - target.z) - target.yaw)) < 1.4;
        if (target.state === 'Guard' && frontal) {
          if (target.parryTime > 0) {
            target.counter = 1.2;
            target.passive = 4;
            target.ult = clamp(target.ult + 12, 0, 100);
            target.guard = clamp(target.guard + (guardian ? 35 : 15), 0, 100);
            if (guardian) target.energy = clamp(target.energy + 20, 0, 100);
            else if (HEROES[target.hero].passiveKind === 'counter') target.energy = clamp(target.energy + 10, 0, 100);
            if (HEROES[target.hero].passiveKind === 'guard') target.hp = Math.min(target.maxHp, target.hp + target.maxHp * .025);
            app.battle.stats.parries = (app.battle.stats.parries || 0) + 1;
            source.stun = 1.4;
            source.state = 'React';
            source.slot = false;
            source.posture = Math.max(0, source.posture - 60);
            app.audio.sfx('parry');
            app.effects.emit(target.x, target.z, 2, .3);
            return
          }
          target.guard -= amount * (target.iron > 0 ? .45 : guardian ? .70 : 1);
          target.ult = clamp(target.ult + 2, 0, 100);
          amount *= guardian ? .10 : .15;
          app.audio.sfx('guard');
          if (target.guard <= 0) {
            target.guard = 0;
            target.state = 'Stagger';
            target.chargeRoute = undefined; this.chain = this.chainTime = 0;
            target.stateTime = 0;
            target.attack = null;
            target.grace = Math.max(target.grace, .55);
            app.ui.message('انكسر الصدّ! ابتعد حتى يتجدد.', 2)
          }
        }
        if (target.iron > 0) amount *= .65
      }
      if (target.shield > 0) {
        let absorb = Math.min(target.shield, amount);
        target.shield -= absorb;
        amount -= absorb
      }
      if (amount <= 0) return;
      target.reactionDuration = target.elite ? .12 : .18;
      target.reactionTime = target.reactionDuration;
      target.hitYaw = source ? angle(source.x - target.x, source.z - target.z) : target.yaw;
      let actual = Math.min(target.hp, amount);
      target.hp -= amount;
      if (source === app.player) app.battle.stats.dealt += actual;
      if (player) {
        app.battle.stats.received += actual;
        if (target.state !== 'Ultimate') target.ult = Math.min(100, target.ult + Math.min(10, actual * .14));
        target.grace = target.state === 'Stagger' ? .55 : .2;
        if (target.iron <= 0 && target.state !== 'Ultimate' && amount > 23) {
          target.state = 'Stagger';
          target.chargeRoute = undefined; this.chain = this.chainTime = 0;
          target.stateTime = 0;
          target.attack = null
        }
        app.audio.sfx('heavy')
      } else {
        if (source && source.hp > 0) {
          target.threat = source; target.threatGen = source.gen;
          target.threatTime = 3; target.targetAudit = 0;
        }
        const boss=TYPES[target.type]?.boss || ['sentinel','odran','azrakan'].includes(TYPES[target.type]?.archetype || target.type);
        const resistance=target.elite&&target.breakGuard>0?.35:1;
        target.posture=Math.max(0,target.posture-posture*resistance);
        const broken=target.posture<=0;
        target.flinch=target.elite?.10:.18;
        if(!target.elite||broken&&!(target.breakGuard>0)) {
          target.stun=target.elite ? 1.25/(1+Math.min(target.breaks||0,3)*.22) : attack?.control ? .8 : .35;
          target.state='React';target.stateTime=0;target.slot=false;
          if(broken) {
            if (source === app.player) {
              app.battle.stats.guardBreaks = (app.battle.stats.guardBreaks || 0) + 1;
              if (source.state !== 'Ultimate') source.ult = Math.min(100, source.ult + 6);
              if (target.elite) app.ui.message('انكسر توازن ' + (NAMES[target.type] || 'القائد') + ' — فرصة للهجوم!', 2);
            }
            target.posture=target.maxPosture;
            target.breaks=Math.min(4,(target.breaks||0)+1);target.breakReset=8;
            target.breakGuard=target.stun+1.7;
          }
        } else if(broken) target.posture=Math.max(1,target.maxPosture*.18);
        const k=target.elite?knock*(broken?.3:.13):knock,d=Math.max(.1,dist(target,source));
        const nx=(target.x-source.x)/d,nz=(target.z-source.z)/d;
        target.knockX=nx*k*4;target.knockZ=nz*k*4;
        if(launch&&(!target.elite||broken&&!boss)) {
          target.vy=target.elite?3.2:6.8;target.y=Math.max(.05,target.y||0);
          target.state='Launch';target.slot=false;target.stun=Math.max(target.stun||0,.65);
        } else if(attack?.knockdown&&!target.elite) {
          target.state='Knockdown';target.stun=Math.max(target.stun||0,.58);target.slot=false;
          if(target.y>0) target.vy=-7;
        }
      }
      if (target.hp <= 0) {
        target.hp = 0;
        target.dead = true;
        target.slot = false;
        target.state = 'Dead';
        target.stateTime = 0;
        target.deathTime = 0;
        target.deathDuration = .6;
        target.active = false;
        target.attack = null;
        if (!target.accounted) {
          target.accounted = true;
          if (source === app.player) {
            app.battle.stats.ko++;
            if (target.elite && !['captain', 'commander', 'bearer'].includes(target.type)) app.battle.stats.officers++;
            if (app.player.state !== 'Ultimate') app.player.ult = clamp(app.player.ult + 3, 0, 100);
            if (app.battle.stats.ko % 6 === 0) {
              let loot = this.loot.find(l => !l.active);
              if (loot) Object.assign(loot, {
                active: true,
                x: target.x,
                z: target.z,
                time: 18
              })
            }
          }
          app.effects.emit(target.x, target.z, 1, .4);
          if (!player) app.battle.event(target.type === 'captain' ? 'CaptainDefeated' : target.type === 'azrakan' || TYPES[target.type]?.boss ? 'BossDefeated' : target.elite ? 'OfficerDefeated' : 'TroopDefeated', target)
        }
      }
    }
    targetScore(actor, target, current, player) {
      let score = dist(actor, target);
      if (target === current) score *= .78;
      if (target === actor.threat && (target === player || target.gen === actor.threatGen) && actor.threatTime > 0) score *= .65;
      if (target === player) score *= actor.elite ? .88 : .96;
      if (target.type === 'commander' || target.escort) score *= .86;
      if (target.state === 'Windup' && target.target?.faction === actor.faction) score *= .83;
      if (!app.collision.visible(actor, target)) score += 5;
      return score;
    }
    chooseTarget(actor, player, withdrawing) {
      const current = actor.target, squad = actor.squad;
      const search = withdrawing ? 2.5 : actor.elite ? 21 : 15;
      let best = null, bestScore = Infinity;
      const consider = target => {
        if (!target || target.hp <= 0 || target.dead || target.faction === actor.faction || dist(actor, target) > search) return;
        if (squad?.order === 'Hold' && !actor.elite && dist(target, squad.anchor || squad) > 12) return;
        if (actor.type === 'commander' && actor.home && dist(target, actor.home) > 15) return;
        const score = this.targetScore(actor, target, current, player);
        if (score < bestScore) {best = target; bestScore = score;}
      };
      consider(current);
      if (actor.faction === 1) consider(player);
      for (const candidate of app.spatial.query(actor.x, actor.z, search)) consider(candidate);
      if (actor.target !== best) {
        actor.slot = false;
        actor.direction = null;
        actor.decision = 0;
        actor.engageAngle = best ? angle(actor.x - best.x, actor.z - best.z) + ((actor.id % 3) - 1) * .38 : 0;
      }
      actor.target = best; actor.targetGen = best?.gen;
      actor.targetAudit = actor.elite ? .38 : .7 + (actor.id % 5) * .07;
      return best;
    }
    approachDirection(actor, target, definition) {
      const distance = dist(actor, target);
      if (actor.type === 'archer' || distance > definition.range + 5) return app.collision.direction(actor, target);
      const radius = Math.max(1.25, definition.range * (actor.slot ? .70 : .84));
      const theta = actor.engageAngle ?? angle(actor.x - target.x, actor.z - target.z);
      const flank = {x:target.x + Math.sin(theta) * radius,z:target.z + Math.cos(theta) * radius};
      if (app.collision.blocked(flank.x, flank.z, .55) || !app.collision.visible(actor, flank, .55)) return app.collision.direction(actor, target);
      return app.collision.direction(actor, flank);
    }
    face(actor, yaw, dt, rate = 9) {
      actor.yaw = wrap(actor.yaw + clamp(wrap(yaw - actor.yaw), -dt * rate, dt * rate));
    }
    updateOfficerPhase(a, definition) {
      const archetype = definition.archetype || a.type,
        thresholds = definition.phaseThresholds || (archetype === 'azrakan' ? [.66, .33] : archetype === 'odran' ? [.50] : []),
        health = a.hp / Math.max(1, a.maxHp);
      a.phase = 1 + thresholds.filter(threshold => health < threshold).length;
      if (a.phase === a.lastPhase) return;
      const prior = a.lastPhase;
      a.lastPhase = a.phase;
      a.phaseHistory = (a.phaseHistory || []).concat(a.phase);
      if (!prior || a.phase === 1 || !a.elite) return;
      // A phase change replaces any committed strike with an explicit pause;
      // old hit targets and the old warning can never carry into a new attack.
      a.state = 'Recover'; a.stateTime = 0; a.timer = .9; a.slot = false;
      a.hitTargets = new Set(); a.rally = Math.max(a.rally || 0, 4);
      app.effects.emit(a.x, a.z, definition.range + 1, .9, 3);
      app.audio.sfx('warning');
      app.ui.message((NAMES[a.type] || 'قائد العدو') + ' • المرحلة ' + a.phase + ' — احذر النمط الجديد', 3);
      if (a.type === 'azrakan') {
        app.scene.clearColor = new B.Color4(.28, .23, .34, 1);
        app.scene.fogColor = new B.Color3(.28, .23, .34);
        const light = app.scene.getLightByName('sky');
        if (light) light.diffuse = new B.Color3(.8, .72, 1);
        app.battle.queueWave(1, a.x + 15, a.z - 10, 8, a, 2);
      }
    }
    stepAI(dt) {
      let realDt = dt;
      dt *= this.simScale;
      let p = app.player;
      for (let a of app.store.actors) {
        a.previousMoveDX = a.moveDX || 0; a.previousMoveDZ = a.moveDZ || 0;
        a.moveDX = a.moveDZ = a.moveSpeed = 0;
        a.motionX = a.x;
        a.motionZ = a.z;
        a.reactionTime = Math.max(0, (a.reactionTime || 0) - dt);
        if (a.hp <= 0 || a.dead) {
          // A defeated airborne soldier keeps falling during the bounded death
          // animation; disabling its AI must not suspend the body in midair.
          if(a.y>0||a.vy>0) {
            a.vy=(a.vy||0)-dt*18;
            a.y=Math.max(0,(a.y||0)+a.vy*dt);
            if(a.y===0) a.vy=0;
          }
          a.deathDuration = a.deathDuration || .6;
          a.deathTime = Math.min(a.deathDuration, (a.deathTime || 0) + dt);
          a.dead = true;
          a.active = false;
          a.slot = false;
          a.state = 'Dead'
        }
      }
      for (let loot of this.loot)
        if (loot.active) {
          loot.time -= dt;
          if (dist(loot, p) < 1.8) {
            p.hp = Math.min(p.maxHp, p.hp + 24);
            p.energy = Math.min(100, p.energy + 15);
            loot.active = false;
            app.effects.emit(p.x, p.z, 1, .25, 1);
            app.audio.sfx('ui')
          } else if (loot.time <= 0) loot.active = false
        } let slots = 0, eliteSlots = 0;
      for(let a of app.store.actors) if(a.slot&&a.hp>0&&a.stun<=0&&a.target===p) {slots++;if(a.elite)eliteSlots++;}
      const budget = settings().difficulty === 'veteran' ? 5 : 3;
      this.attacks = 0;
      for (let a of app.store.actors) {
        if (a.hp <= 0 || !a.active) continue;
        let def = TYPES[a.type], archetype = def.archetype || a.type;
        a.cool = Math.max(0, a.cool - dt);
        a.stateTime = (a.stateTime || 0) + dt;
        a.targetAudit = Math.max(0, (a.targetAudit || 0) - dt);
        a.threatTime = Math.max(0, (a.threatTime || 0) - dt);
        a.defenseCD = Math.max(0, (a.defenseCD || 0) - dt);
        a.rally = Math.max(0, (a.rally || 0) - dt);
        a.flinch = Math.max(0, (a.flinch || 0) - dt);
        a.breakGuard = Math.max(0, (a.breakGuard || 0) - dt);
        if(a.knockX || a.knockZ) {
          app.collision.move(a,(a.knockX||0)*dt,(a.knockZ||0)*dt,.45);
          const decay=Math.exp(-dt*8);
          a.knockX=(a.knockX||0)*decay; a.knockZ=(a.knockZ||0)*decay;
          if(Math.abs(a.knockX)+Math.abs(a.knockZ)<.08) a.knockX=a.knockZ=0;
        }
        if (a.breakReset > 0) {
          a.breakReset -= dt;
          if (a.breakReset <= 0) a.breaks = 0
        }
        if (a.shieldTime > 0) {
          a.shieldTime -= dt;
          if (a.shieldTime <= 0) a.shield = 0
        }
        if (a.y > 0 || a.vy > 0) {
          a.vy -= dt * 18; a.y = Math.max(0, a.y + a.vy * dt);
          a.slot=false;
          if(a.y>0) {a.state='Launch';continue;}
          a.vy=0; a.state='Knockdown'; a.stun=Math.max(a.stun||0,.36);
        }
        if (a.stun > 0) {
          a.stun -= dt;
          a.slot = false;
          if (a.stun <= 0) {
            a.state = 'Recover';
            a.timer = a.elite ? 1 : .4
          };
          continue
        }
        if (a.escort) {
          this.escortMove(a, dt);
          continue
        }
        if (a.evadeTime > 0) {
          const portion = Math.min(dt, a.evadeTime);
          a.evadeTime = Math.max(0, a.evadeTime - dt);
          app.collision.move(a, a.evadeX * portion * 6.5, a.evadeZ * portion * 6.5, .45);
          if (a.evadeTime <= 0) {a.state = 'Recover'; a.timer = .28;}
          continue;
        }
        let nearPlayer=dist(a,p), target=a.target;
        const committed=['Windup','Attack','Recover','Guard'].includes(a.state), squad=a.squad;
        const withdrawing=!a.elite&&squad&&['Retreat','Regroup'].includes(squad.order);
        if(target&&(target.hp<=0||target.dead||target.faction===a.faction||target!==p&&a.targetGen!==target.gen||dist(a,target)>28)) {
          target=null; a.target=null; a.slot=false;
        }
        if(!committed) {
          if (!target || a.targetAudit <= 0 || withdrawing && dist(a, target) > 2.5) target = this.chooseTarget(a, p, withdrawing);
        }
        if (a.type === 'commander' && target && dist(target, a.home) > 15) {
          target = null;
          a.target = null
        }
        this.updateOfficerPhase(a, def);
        if (a.state === 'Windup') {
          a.timer -= dt;
          this.attacks++;
          if (a.timer <= 0) {
            a.state = 'Attack';
            a.timer = .18;
            if (target && target.hp > 0) {
              let range = def.range + (a.pattern === 'wave' ? 5 : 0),
                d = dist(a, target),
                front = Math.abs(wrap(angle(target.x - a.x, target.z - a.z) - a.yaw)) < (a.pattern === 'sweep' ? Math.PI : a.type === 'pike' ? .5 : 1.5);
              if (a.type === 'archer') {
                this.fire(a, target)
              } else if (d < range && front && app.collision.visible(a, target)) {
                this.enemyHit(a, target, def.dmg * (a.phase === 3 ? 1.15 : 1), 18, 1)
              }
              if (a.elite && a.pattern === 'sweep')
                for (let other of app.spatial.query(a.x, a.z, def.range))
                  if (other.hp > 0 && other.faction !== a.faction && other !== target && app.collision.visible(a, other)) this.enemyHit(a, other, def.dmg * .7, 12, .5);
              if (a.pattern === 'charge') {
                const from={x:a.x,z:a.z}, dir={x:Math.sin(a.yaw),z:Math.cos(a.yaw)};
                app.collision.move(a,dir.x*5,dir.z*5);
                const dx=a.x-from.x,dz=a.z-from.z,len=dx*dx+dz*dz,
                  t=clamp(((target.x-from.x)*dx+(target.z-from.z)*dz)/Math.max(.001,len),0,1),
                  closest={x:from.x+dx*t,z:from.z+dz*t};
                if(Math.hypot(target.x-closest.x,target.z-closest.z)<1.25&&app.collision.visible(closest,target)) this.enemyHit(a,target,def.dmg,30,1);
              }
              app.effects.emit(a.x, a.z, range, .3)
            }
          }
          continue
        }
        if (a.state === 'Guard') {
          a.timer -= dt;
          if (target) this.face(a, angle(target.x - a.x, target.z - a.z), dt, 6);
          if (a.timer <= 0) {a.state = 'Approach'; a.decision = 0;}
          continue;
        }
        if (a.state === 'Attack' || a.state === 'Recover') {
          a.timer -= dt;
          if (a.timer <= 0) {
            a.slot = false;
            if (a.state === 'Attack') {
              a.state = 'Recover';
              a.timer = a.elite ? (archetype === 'odran' ? 1.5 : archetype === 'azrakan' ? 1.25 : .85) : .65
            } else {
              a.state = 'Advance';
              a.cool = a.elite ? .45 : 1 + rnd()
            }
          }
          continue
        }
        a.decision -= dt;
        if (a.decision <= 0) {
          app.performance.decisions++;
          a.decision = (a.elite ? .05 : .1 + rnd() * .05) * (nearPlayer > 20 && target !== p ? (app.performance.backgroundRate || 1) : 1);
          if (target) {
            let d = dist(a, target);
            if (archetype === 'duelist' && target === p && p.attack && p.attack.time < p.attack.end && d < 4 && a.defenseCD <= 0 && rnd() < .22) {
              let side = a.id % 2 ? 1 : -1;
              a.evadeX = Math.cos(a.yaw) * side; a.evadeZ = -Math.sin(a.yaw) * side;
              a.evadeTime = .28; a.state = 'Dodge'; a.stateTime = 0;
              a.defenseCD = 2.4; a.slot = false;
              continue
            }
            if (a.elite && ['captain','sentinel','commander'].includes(archetype) && target === p && p.attack?.kind === 'light' && p.attack.time < p.attack.end && d < 3.6 && a.defenseCD <= 0 && a.breakGuard <= 0 && rnd() < .22) {
              a.state = 'Guard'; a.timer = .42; a.stateTime = 0;
              a.defenseCD = 2.2; a.slot = false;
              continue;
            }
            if (d < def.range + .3 && a.cool <= 0 && (target !== p || slots < budget && (!a.elite || eliteSlots < 2)) && app.collision.visible(a, target)) {
              if (a.type !== 'archer' || this.projectiles.filter(p => p.active).length < 5) {
                a.state = 'Windup';
                a.currentStrike = this.strikeID++;
                a.hitTargets = new Set();
                a.timer = def.wind * (settings().difficulty === 'veteran' ? .88 : 1) * (a.squad?.leader && (a.squad.leader.gen !== a.squad.leaderGen || a.squad.leader.hp <= 0) ? 1.2 : 1) * (a.rally > 0 ? .9 : 1);
                a.yaw = angle(target.x - a.x, target.z - a.z);
                a.slot = target === p;
                if (a.slot) {slots++;if(a.elite)eliteSlots++;}
                let sequence = ELITE_PATTERNS[a.type]?.[a.phase - 1] || ELITE_PATTERNS[archetype]?.[a.phase - 1] || (archetype === 'sentinel' ? ['sweep', 'strike'] : archetype === 'warcaller' ? ['wave', 'strike'] : ['strike', 'charge']);
                if (settings().difficulty === 'veteran' && archetype === 'azrakan') sequence = [...sequence, 'charge'];
                a.pattern = a.elite ? sequence[(a.attackID++) % sequence.length] : 'strike';
                if(a.pattern==='sweep') a.timer*=1.12;
                if(a.pattern==='wave') a.timer*=1.18;
                if (archetype === 'azrakan' && a.phase === 3) a.timer *= .90;
                else if (a.phase > 1) a.timer *= .95;
                if (a.type === 'duelist') {
                  a.pattern = 'charge';
                  a.timer = .7
                }
                a.windDuration=a.timer; a.stateTime=0;
                app.effects.emit(a.x, a.z, def.range + (a.pattern === 'wave' ? 5 : 0), a.timer, a.faction === 1 ? (a.elite ? 3 : 2) : 0);
                if (a.elite && nearPlayer < 18) app.audio.sfx('warning');
                continue
              }
            }
            a.state = 'Approach';
            a.direction = this.approachDirection(a, target, def)
          } else {
            let dest = app.store.formationTarget?.(a) || a.squad?.target || a.home || a;
            if (a.faction === 0 && a.type === 'commander') dest = a.home || a;
            a.direction = app.collision.direction(a, dest);
            a.state = 'Advance'
          }
          if (archetype === 'warcaller' && nearPlayer < 25) {
            a.callTimer = (a.callTimer || 0) + a.decision;
            if (a.callTimer > 18 && a.calls !== 2) {
              a.calls = (a.calls || 0) + 1;
              a.callTimer = 0;
              let base = app.battle.bases.find(b => b.owner === 1 && app.collision.visible(a, b));
              if (base) app.battle.queueWave(1, base.x + 10, base.z + 8, 8, p, 4, {sourceBase:base});
              for (let friend of app.spatial.query(a.x, a.z, 12))
                if (friend.faction === a.faction) friend.rally = 5;
              app.ui.message((NAMES[a.type] || 'مُنادي العدو') + ' يستدعي تعزيزات محدودة', 3)
            }
          }
        }
        let dir = a.direction;
        if (dir) {
          let speed = def.speed * (withdrawing ? 1.12 : .82 + (a.squad?.morale ?? 1)*.18),
            td = target ? dist(a, target) : 100;
          if (target && td < def.range * .85) {
            if (target === p && !a.slot) {
              let side = a.id % 2 ? 1 : -1;
              dir = {
                x: (a.z - p.z) / Math.max(1, td) * side,
                z: -(a.x - p.x) / Math.max(1, td) * side
              };
              speed *= .45
            } else speed = 0
          }
          // Ranged troops retreat directly; reversing a circle vector made archers crowd targets.
          if (target && (a.type === 'archer' && td < 8 || a.type === 'pike' && td < 1.6 && !a.slot)) {
            dir = {x: (a.x - target.x) / Math.max(.1, td), z: (a.z - target.z) / Math.max(.1, td)};
            speed = def.speed * .55
          }
          let oldX = a.x,
            oldZ = a.z;
          app.collision.move(a, dir.x * speed * dt, dir.z * speed * dt, .45);
          if (target && td < def.range + 2) this.face(a, angle(target.x - a.x, target.z - a.z), dt, a.elite ? 8 : 6.5);
          else if (speed) this.face(a, angle(dir.x, dir.z), dt, a.elite ? 7 : 5.5);
          if (Math.hypot(a.x - oldX, a.z - oldZ) < .001 && speed > 0) {
            a.stuck += dt;
            if (a.stuck > 2) {
              a.decision = 0;
              a.direction = null;
              a.stuck = 0
            }
          } else a.stuck = 0
        }
      }
      for (let a of app.store.actors) {
        // Separation also applies during recovery: stationary attackers must
        // not trap moving allies in the larger articulated body silhouettes.
        if (a.active && a.hp > 0 && !a.elite && dist(a, p) < 14) this.separate(a, p, dt);
        a.moveDX = a.x - a.motionX;
        a.moveDZ = a.z - a.motionZ;
        a.moveSpeed = Math.hypot(a.moveDX, a.moveDZ) / Math.max(.001, realDt);
        a.guarding = a.type === 'shield' && !['React', 'Attack', 'Recover', 'Dead', 'Launch', 'Knockdown'].includes(a.state)
      }
      for (let proj of this.projectiles)
        if (proj.active) {
          proj.time -= dt;
          let old = {
            x: proj.x,
            z: proj.z
          };
          proj.x += proj.dx * dt * 16;
          proj.z += proj.dz * dt * 16;
          if (proj.time <= 0 || !app.collision.visible(old, proj)) {
            proj.active = false;
            continue
          }
          let target = proj.target;
          // Sweep relative to the victim's movement, including a galloping
          // rider. Fast bodies cannot cross between arrow samples unseen.
          const valid = target?.hp > 0 && (target === p || target.gen === proj.targetGen);
          const bodyY = (target?.y || 0) + (target?.mounted ? target.mountHeight || 1.14 : 0);
          const ox = old.x - (target?.x || 0) + (target?.moveDX || 0), oz = old.z - (target?.z || 0) + (target?.moveDZ || 0),
            nx = proj.x - (target?.x || 0), nz = proj.z - (target?.z || 0),
            sx = nx - ox, sz = nz - oz, t = clamp(-(ox * sx + oz * sz) / Math.max(.0001, sx * sx + sz * sz), 0, 1),
            crossing = Math.hypot(ox + sx * t, oz + sz * t) < .68;
          if (valid && crossing && bodyY <= proj.height + .12 && bodyY + 1.6 >= proj.height) {
            let source = proj.source?.gen === proj.sourceGen ? proj.source : {x: proj.sourceX, z: proj.sourceZ, faction: proj.sourceFaction};
            this.damage(target, 10, source);
            proj.active = false
          } else if (Math.floor(proj.time * 10) !== Math.floor((proj.time + dt) * 10)) app.effects.emit(proj.x, proj.z, .18, .1)
        }
    }
    separate(a, player, dt) {
      let rx = 0, rz = 0, checked = 0;
      for (let b of app.spatial.query(a.x, a.z, 1.3)) {
        if (b === a || b.hp <= 0 || !b.active) continue;
        let dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), spacing = b.elite ? 1.22 : 1.08;
        if (d >= spacing) continue;
        let penetration = spacing - d;
        if (d < .001) {
          // Coincident pooled spawns receive stable, opposite pair directions.
          let theta = Math.min(a.id, b.id) * 13.37 + Math.max(a.id, b.id) * 7.11, sign = a.id < b.id ? -1 : 1;
          dx = Math.sin(theta) * sign; dz = Math.cos(theta) * sign; d = 1
        } else { dx /= d; dz /= d; }
        let strength = Math.min(3, penetration * 5);
        rx += dx * strength; rz += dz * strength;
        if (++checked >= 8) break
      }
      if (player.hp > 0) {
        let dx = a.x - player.x, dz = a.z - player.z, d = Math.hypot(dx, dz);
        if (d < 1.05) {
          if (d < .001) { dx = Math.sin((a.id + 1) * 2.399963); dz = Math.cos((a.id + 1) * 2.399963); }
          else { dx /= d; dz /= d; }
          // Prioritize an outward component so allies cannot conceal the hero.
          let required = Math.min(3, (1.05 - d) * 8), outward = rx * dx + rz * dz;
          if (outward < required) { rx += dx * (required - outward); rz += dz * (required - outward); }
        }
      }
      let magnitude = Math.hypot(rx, rz);
      if (magnitude > 3) { rx *= 3 / magnitude; rz *= 3 / magnitude; }
      if ((a.state === 'Windup' || a.state === 'Attack') && a.target?.hp > 0) {
        // Crowd pressure cannot slide a telegraphed strike toward its victim.
        let dx = a.target.x - a.x, dz = a.target.z - a.z, d = Math.hypot(dx, dz);
        if (d > .001) {
          dx /= d; dz /= d;
          let toward = rx * dx + rz * dz;
          if (toward > 0) { rx -= dx * toward; rz -= dz * toward; }
        }
      }
      if (rx || rz) app.collision.move(a, rx * dt, rz * dt, .45)
    }
    enemyHit(source, target, damage, posture = 0, knock = 0) {
      let key = target === app.player ? 'player' : target.id + ':' + target.gen;
      if (!source.hitTargets) source.hitTargets = new Set();
      if (source.faction === target.faction || target !== app.player && source.target === target && source.targetGen !== target.gen || !app.collision.visible(source,target)) return;
      if (source.hitTargets.has(key)) return;
      source.hitTargets.add(key);
      this.damage(target, damage, source, posture, knock)
    }
    fire(a, target) {
      if (this.projectiles.filter(p => p.active).length >= 5) return;
      let p = this.projectiles.find(p => !p.active);
      if (!p) return;
      const distance = dist(a, target), lead = Math.min(.32, distance / 16 * .55),
        vx = (target.moveDX || target.previousMoveDX || 0) * 60,
        vz = (target.moveDZ || target.previousMoveDZ || 0) * 60,
        displacement = Math.hypot(vx, vz) * lead,
        factor = displacement > 2.8 ? 2.8 / displacement : 1,
        aimX = target.x + vx * lead * factor, aimZ = target.z + vz * lead * factor,
        d = Math.max(.01, Math.hypot(aimX - a.x, aimZ - a.z));
      Object.assign(p, {
        active: true,
        x: a.x,
        z: a.z,
        dx: (aimX - a.x) / d,
        dz: (aimZ - a.z) / d,
        height: (a.y || 0) + 1.35,
        target,
        targetGen: target.gen,
        source: a,
        sourceGen: a.gen,
        sourceFaction: a.faction,
        sourceX: a.x,
        sourceZ: a.z,
        time: 1.6
      })
    }
    escortMove(a, dt) {
      let dest = app.battle.escortTarget;
      if (!dest) return;
      if (dist(a, app.player) > 17 || app.battle.escortWaiting) return;
      let d = dist(a, dest);
      if (d > 2) {
        let dir = app.collision.direction(a, dest);
        app.collision.move(a, dir.x * dt * TYPES.bearer.speed, dir.z * dt * TYPES.bearer.speed);
        a.yaw = angle(dir.x, dir.z);
        a.state = 'Advance'
      } else a.state = 'Idle'
    }
  }
