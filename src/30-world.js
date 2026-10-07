  class CollisionWorld {
    constructor(stage) {
      this.stage = stage;
      this.boxes = [];
      this.gates = [];
      this.revision = 0;
      this.cache = new Map();
      this.cell = 4;
      this.nx = Math.ceil(stage.w / 4);
      this.nz = Math.ceil(stage.h / 4)
    }
    add(x, z, w, d, gate = false) {
      let o = {
        x,
        z,
        w,
        d,
        open: false,
        gate
      };
      this.boxes.push(o);
      if (gate) this.gates.push(o);
      return o
    }
    blocked(x, z, r = .5) {
      if (Math.abs(x) > this.stage.w / 2 - r || Math.abs(z) > this.stage.h / 2 - r) return true;
      return this.boxes.some(b => !b.open && Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r)
    }
    move(a, dx, dz, r = .5) {
      let steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .35));
      for (let i = 0; i < steps; i++) {
        let x = a.x + dx / steps,
          z = a.z + dz / steps;
        if (!this.blocked(x, z, r)) {
          a.x = x;
          a.z = z
        } else {
          if (!this.blocked(x, a.z, r)) a.x = x;
          if (!this.blocked(a.x, z, r)) a.z = z
        }
      }
    }
    visible(a, b, clearance = 0) {
      let dx = b.x - a.x,
        dz = b.z - a.z;
      for (let box of this.boxes) {
        if (box.open) continue;
        let lo = 0,
          hi = 1;
        for (let [p, q, min, max] of [
            [a.x, dx, box.x - box.w / 2 - clearance, box.x + box.w / 2 + clearance],
            [a.z, dz, box.z - box.d / 2 - clearance, box.z + box.d / 2 + clearance]
          ]) {
          if (Math.abs(q) < 1e-6) {
            if (p < min || p > max) {
              lo = 2;
              break
            }
          } else {
            let t1 = (min - p) / q,
              t2 = (max - p) / q;
            lo = Math.max(lo, Math.min(t1, t2));
            hi = Math.min(hi, Math.max(t1, t2))
          }
        }
        if (lo <= hi && hi > 0 && lo < 1) return false
      }
      return true
    }
    open(g) {
      if (g.open) return;
      g.open = true;
      g.mesh?.setEnabled(false);
      this.revision++;
      this.cache.clear()
    }
    index(x, z) {
      let ix = clamp(Math.floor((x + this.stage.w / 2) / 4), 0, this.nx - 1),
        iz = clamp(Math.floor((z + this.stage.h / 2) / 4), 0, this.nz - 1);
      return iz * this.nx + ix
    }
    flow(target) {
      let end = this.index(target.x, target.z),
        key = end + '-' + this.revision;
      if (this.cache.has(key)) return this.cache.get(key);
      let d = new Int16Array(this.nx * this.nz).fill(-1),
        queue = new Int32Array(d.length),
        head = 0,
        tail = 0;
      d[end] = 0;
      queue[tail++] = end;
      while (head < tail) {
        let n = queue[head++],
          x = n % this.nx,
          z = Math.floor(n / this.nx);
        for (let [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
          ]) {
          let xx = x + dx,
            zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= this.nx || zz >= this.nz) continue;
          let j = zz * this.nx + xx;
          if (d[j] >= 0) continue;
          let wx = (xx + .5) * 4 - this.stage.w / 2,
            wz = (zz + .5) * 4 - this.stage.h / 2;
          if (this.blocked(wx, wz, .65)) continue;
          d[j] = d[n] + 1;
          queue[tail++] = j
        }
      }
      if (this.cache.size > 18) this.cache.clear();
      this.cache.set(key, d);
      return d
    }
    direction(a, target) {
      // Navigation includes a body radius; damage LOS keeps its zero-width ray.
      if (this.visible(a, target, .65)) {
        let dx = target.x - a.x,
          dz = target.z - a.z,
          m = Math.hypot(dx, dz);
        return m > .1 ? {
          x: dx / m,
          z: dz / m
        } : {
          x: 0,
          z: 0
        }
      }
      let f = this.flow(target),
        i = this.index(a.x, a.z),
        x = i % this.nx,
        z = Math.floor(i / this.nx),
        best = i;
      for (let [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
        let xx = x + dx,
          zz = z + dz,
          j = zz * this.nx + xx;
        if (xx >= 0 && zz >= 0 && xx < this.nx && zz < this.nz && f[j] >= 0 && (f[best] < 0 || f[j] < f[best])) best = j
      }
      if (best === i) return {
        x: 0,
        z: 0
      };
      let dx = (best % this.nx + .5) * 4 - this.stage.w / 2 - a.x,
        dz = (Math.floor(best / this.nx) + .5) * 4 - this.stage.h / 2 - a.z,
        m = Math.hypot(dx, dz);
      return {
        x: dx / m,
        z: dz / m
      }
    }
  }
  class SpatialIndex {
    constructor() {
      this.map = new Map()
    }
    build(actors) {
      this.map.clear();
      for (let a of actors)
        if (a.active && a.hp > 0) {
          let k = Math.floor(a.x / 6) + ',' + Math.floor(a.z / 6);
          if (!this.map.has(k)) this.map.set(k, []);
          this.map.get(k).push(a)
        }
    }
    query(x, z, r) {
      let out = [];
      for (let ix = Math.floor((x - r) / 6); ix <= Math.floor((x + r) / 6); ix++)
        for (let iz = Math.floor((z - r) / 6); iz <= Math.floor((z + r) / 6); iz++) {
          let arr = this.map.get(ix + ',' + iz);
          if (arr)
            for (let a of arr)
              if ((a.x - x) ** 2 + (a.z - z) ** 2 < r * r) out.push(a)
        }
      return out
    }
  }
  class ActorStore {
    constructor() {
      this.actors = [];
      this.squads = [];
      this.generation = 1;
      this.max = 520;
      this.nextSquad = 0;
      this.streamBuckets = Array.from({length: 18}, () => [])
    }
    recyclable(a) {
      return a.hp <= 0 && (!a.elite || a.recyclable) && (a.deathTime || 0) >= (a.deathDuration || .6)
    }
    available() {
      let count = this.max - this.actors.length;
      for (let a of this.actors) if (this.recyclable(a)) count++;
      return count
    }
    create(type, faction, x, z, extra = {}) {
      let d = TYPES[type];
      if (!d) return null;
      const archetype=d.archetype||type;
      let old = this.actors.find(a => this.recyclable(a)), id = old ? old.id : this.actors.length;
      if (!old && this.actors.length >= this.max) return null;
      if (old?.squad) old.squad.members = old.squad.members.filter(a => a !== old);
      let a = {
        id, gen: this.generation++, type, faction, x, z,
        y: 0, vy: 0, yaw: 0, hp: d.hp, maxHp: d.hp,
        posture: d.posture ?? (archetype === 'azrakan' ? 400 : archetype === 'odran' ? 250 : 150),
        maxPosture: d.posture ?? (archetype === 'azrakan' ? 400 : archetype === 'odran' ? 250 : 150),
        state: 'Advance', timer: rnd(), cool: 0, decision: rnd() * .15,
        active: true, elite: !['raider', 'shield', 'pike', 'archer'].includes(type),
        dead: false, accounted: false, hit: new Set(), knockX: 0, knockZ: 0,
        stun: 0, phase: 1, reserve: false, shield: 0, guard: 100, slot: false,
        attackID: 0, stuck: 0, prevX: x, prevZ: z, deathTime: 0,
        deathDuration: .6, reactionTime: 0, reactionDuration: .18,
        moveDX: 0, moveDZ: 0, moveSpeed: 0, targetGen: null, ...extra
      };
      if (old) {
        // Keep id === array index. A new generation invalidates every cached hit,
        // projectile and animation record before this physical slot is reused.
        Object.keys(old).forEach(k => delete old[k]);
        Object.assign(old, a);
        return old
      }
      this.actors.push(a);
      return a
    }
    spawnPositions(x, z, count, target, minPlayerDistance = 0) {
      let positions = [], yaw = target ? angle(target.x - x, target.z - z) : 0,
        sin = Math.sin(yaw), cos = Math.cos(yaw), cols = 6,
        rows = Math.max(2, Math.ceil(count / cols));
      // Test the whole footprint, including line of sight from its muster point.
      // A wave cannot straddle a closed gate or fall back onto the player.
      for (let i = 0; i < Math.max(count * 5, 72) && positions.length < count; i++) {
        let column = (i % cols - (cols - 1) / 2) * 1.55,
          row = (Math.floor(i / cols) - (rows - 1) / 2) * 1.55,
          p = {x: x + column * cos + row * sin, z: z - column * sin + row * cos};
        if (Math.hypot(p.x - x, p.z - z) > 12 || app.collision.blocked(p.x, p.z, .6) || !app.collision.visible({x, z}, p)) continue;
        if (minPlayerDistance && dist(p, app.player) < minPlayerDistance) continue;
        if (positions.some(q => dist(q, p) < 1.1)) continue;
        positions.push(p)
      }
      return positions
    }
    addSquad(faction, x, z, count, target, types = ['raider', 'shield', 'pike', 'archer'], options = {}) {
      let leader = this.actors.find(a => a.elite && !a.escort && a.faction === faction && a.hp > 0 && dist(a, {x, z}) < 18 && app.collision.visible(a, {x, z})),
        s = {
          id: this.nextSquad++, faction, x, z, target: target || {x, z}, members: [],
          home: {x, z}, anchor: {x, z}, destination: {x, z}, facing: target ? angle(target.x - x, target.z - z) : 0,
          reserve: options.reserve ?? 12, waves: options.waves ?? 2,
          timer: 25 + rnd() * 10, exchange: 0, leader, leaderGen: leader?.gen,
          leaderLost: false, morale: leader ? .95 : .78, initialCount: count,
          order: faction === 1 && target && dist({x, z}, target) < 12 ? 'Hold' : 'Advance',
          flank: options.flank ?? (faction === 1 && this.nextSquad % 2 === 0 && target && dist({x, z}, target) > 18),
          flankSide: this.nextSquad % 2 ? 1 : -1, brokenUntil: 0, regroupUntil: 0,
          supportBase: options.sourceBase, lastAlive: 0
        }, positions = options.positions || this.spawnPositions(x, z, count, target, options.minPlayerDistance || 0);
      for (let i = 0; i < positions.length && i < count; i++) {
        let pos = positions[i], type = types[i % types.length], a = this.create(type, faction, pos.x, pos.z, {
          squad: s, active: false, home: {x, z}, slotOffset: i,
          formationRole: type === 'shield' ? 0 : type === 'raider' ? 1 : type === 'pike' ? 2 : 3
        });
        if (!a) break;
        a.yaw = s.facing;
        s.members.push(a)
      }
      s.initialCount = s.lastAlive = s.members.length;
      if (s.members.length) this.squads.push(s);
      return s
    }
    strength(s) {
      let count = 0;
      for (let a of s.members) if (a.hp > 0 && a.squad === s) count++;
      return count
    }
    formationTarget(a) {
      let s = a.squad;
      if (!s) return a.home || a;
      let center = s.anchor || s, index = a.slotOffset || 0,
        column = (Math.floor(index / 4) % 6 - 2.5) * 1.65,
        row = (1.5 - (a.formationRole ?? index % 4)) * 1.7 - Math.floor(index / 24) * 2.4,
        sin = Math.sin(s.facing || 0), cos = Math.cos(s.facing || 0),
        result = {x: center.x + column * cos + row * sin, z: center.z - column * sin + row * cos};
      if (app.collision.blocked(result.x, result.z, .55) || !app.collision.visible(center, result)) return center;
      return result
    }
    counts() {
      let living = 0, active = 0, reserves = 0;
      for (let a of this.actors) if (a.hp > 0) { living++; if (a.active) active++; }
      for (let s of this.squads) if (this.strength(s)) reserves += s.reserve;
      return {living, active, strategic: living - active, reserves, slots: this.actors.length, capacity: this.max}
    }
    stream(player, cap) {
      let used = 1;
      for (let bucket of this.streamBuckets) bucket.length = 0;
      for (let a of this.actors) {
        if (a.hp <= 0 || a.dead) { a.active = false; a.slot = false; continue; }
        if (a.elite) { a.active = true; used++; continue; }
        let distance = dist(a, player);
        if (a.active && (a.state === 'Windup' || a.state === 'Attack' || a.stun > 0 || a.y > 0)) { used++; continue; }
        if (distance < (a.active ? 34 : 29)) this.streamBuckets[Math.min(17, Math.floor(distance / 2))].push(a);
        else { a.active = false; a.slot = false; }
      }
      // Coarse near-to-far buckets avoid sorting the full actor pool twice a second.
      for (let bucket of this.streamBuckets) for (let a of bucket) {
        a.active = used < cap;
        if (a.active) used++;
        else a.slot = false
      }
      return used
    }
  }
  function flatRing(name, scene, segments = 36, inner = .94) {
    let positions = [],
      indices = [],
      normals = [];
    for (let i = 0; i <= segments; i++) {
      let a = i / segments * Math.PI * 2;
      for (let r of [inner, 1]) {
        positions.push(Math.sin(a) * r, 0, Math.cos(a) * r);
        normals.push(0, 1, 0)
      }
    }
    for (let i = 0; i < segments; i++) {
      let j = i * 2;
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3)
    }
    let m = new B.Mesh(name, scene),
      v = new B.VertexData();
    v.positions = positions;
    v.indices = indices;
    v.normals = normals;
    v.applyToMesh(m);
    return m
  }
  class WorldBuilder {
    constructor(scene, stage) {
      this.scene = scene;
      this.stage = stage;
      this.landscape = stage.landscape || stage.theme || (stage === STAGES[1] ? 'gorge' : stage === STAGES[2] ? 'rift' : 'meadow');
      this.materials = {};
      this.textures = {};
      this.statics = [];
      this.banners = [];
      this.torches = [];
      this.flames = [];
      this.grassBatches = [];
      this.roads = [];
      this.cameraVolumes = [];
      this.shadowCasters = [];
      this.shadowCasterCount = 0;
      this.time = this.bannerTime = 0; this.shadowTime = .13;
      const colors = {
        stone: stage.night ? '#9c9a92' : '#b6a588', dark: '#56636a',
        ground: stage.night ? '#53616a' : '#657452',
        path: stage.night ? '#8c9296' : '#9b8e73',
        ally: '#259c92', enemy: '#a83f39', ivory: '#e5d7ac',
        metal: '#566875', rift: '#ab84d1', gold: '#efbc69',
        wood: '#705140', shadow: '#17212a', warning: '#ff925f',
        grass: stage.night ? '#445563' : '#6c784f', earth: '#857858',
        bark: '#433c33', leaf: stage.night ? '#324653' : '#4e644b',
        roof: '#564e4b', canvas: '#c4b493', bronze: '#997847',
        flame: '#ffc675', water: '#456c7a', window: '#1b242a'
      };
      // Every theatre has its own original surface palette. The same small
      // material set keeps the scenery within the existing static draw budget.
      const theatreColors = {
        coast: {ground:'#819779',path:'#c7b594',stone:'#c3b79d',dark:'#667b7f',grass:'#889f6b',leaf:'#5f805e',water:'#3a899a',roof:'#687a7d'},
        marsh: {ground:'#465f4c',path:'#817c60',stone:'#869185',dark:'#455a57',grass:'#546e43',leaf:'#315447',water:'#45665b',canvas:'#aaa77f'},
        desert: {ground:'#c8a575',path:'#dfc493',stone:'#d4b588',dark:'#9b7f64',grass:'#b7a472',earth:'#a78961',leaf:'#6f8861',water:'#428b87'},
        frost: {ground:'#ccd8dd',path:'#b3c5d0',stone:'#afc4cc',dark:'#617888',grass:'#d4ded9',earth:'#889ca8',leaf:'#477175',water:'#7bb3c1',roof:'#859fac'},
        volcanic: {ground:'#515156',path:'#786c68',stone:'#827b7a',dark:'#393f48',grass:'#67565b',earth:'#71615a',leaf:'#464a4b',rift:'#ed9168',water:'#aa583b',roof:'#494d59'}
      };
      Object.assign(colors, theatreColors[this.landscape] || {});
      for (let [name, c] of Object.entries(colors)) {
        let pbr = ['stone', 'metal', 'wood', 'bronze'].includes(name);
        let m = pbr ? new B.PBRMaterial('world-' + name, scene) : new B.StandardMaterial('world-' + name, scene);
        let color = B.Color3.FromHexString(c);
        if (pbr) {
          m.albedoColor = color;
          m.metallic = name === 'metal' ? .76 : name === 'bronze' ? .65 : 0;
          m.roughness = name === 'metal' ? .46 : name === 'bronze' ? .54 : .92;
          m.environmentIntensity = stage.night ? .72 : .86;
          m.maxSimultaneousLights = 3;
          // Preserve the authored material interface for flags, effects and diagnostics.
          Object.defineProperty(m, 'diffuseColor', {get: () => m.albedoColor, set: value => {m.albedoColor = value;}});
        } else {
          m.diffuseColor = color;
          m.specularColor = ['water', 'gold'].includes(name) ? new B.Color3(.12, .14, .15) : B.Color3.Black();
          m.specularPower = 36;
          m.maxSimultaneousLights = 3;
        }
        if (['rift', 'gold', 'flame'].includes(name)) m.emissiveColor = color.scale(name === 'rift' ? .5 : name === 'flame' ? 1.4 : .10);
        if (name === 'shadow') {m.alpha = .24; m.backFaceCulling = false; m.disableLighting = true;}
        if (name === 'warning') {m.emissiveColor = color.scale(.70); m.backFaceCulling = false;}
        this.materials[name] = m;
      }
      this.makeTextures();
      const theatreSkies = {coast:[.49,.71,.77],marsh:[.24,.36,.37],desert:[.77,.67,.52],frost:[.52,.64,.73],volcanic:[.22,.19,.25]};
      const skyTint=theatreSkies[this.landscape];
      scene.clearColor = skyTint ? new B.Color4(...skyTint,1) : stage.night ? new B.Color4(.068, .108, .17, 1) : new B.Color4(.54, .66, .71, 1);
      scene.fogMode = B.Scene.FOGMODE_EXP2;
      scene.fogDensity = this.landscape==='marsh' ? .0048 : this.landscape==='desert' ? .0038 : stage.night ? .0043 : .0031;
      scene.fogColor = new B.Color3(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b);
      scene.ambientColor = stage.night ? new B.Color3(.065, .081, .12) : new B.Color3(.045, .044, .038);
      const image = scene.imageProcessingConfiguration;
      image.toneMappingEnabled = true;
      image.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
      image.exposure = stage.night ? 1.22 : 1.08;
      image.contrast = 1.10;
      let sky = new B.HemisphericLight('sky', new B.Vector3(.15, 1, -.15), scene);
      sky.intensity = stage.night ? .86 : .70;
      sky.diffuse = stage.night ? new B.Color3(.62, .76, 1) : new B.Color3(.82, .91, 1);
      sky.groundColor = stage.night ? new B.Color3(.28, .34, .45) : new B.Color3(.39, .37, .30);
      let sun = new B.DirectionalLight('sun', new B.Vector3(-.48, -.86, .34), scene);
      sun.intensity = stage.night ? .58 : 1.12;
      sun.diffuse = stage.night ? new B.Color3(.63, .76, 1) : new B.Color3(1, .86, .67);
      this.sun = sun;
      this.makeEnvironment();
      this.makeSky();
      this.box(0, -.35, 0, stage.w, .7, stage.h, 'ground');
      this.build();
      this.setupShadows();
      this.makeAtmosphere();
      if (stage.night) {
        this.torchLights = Array.from({length: 2}, (_, i) => {
          let l = new B.PointLight('warm-near-torch-' + i, new B.Vector3(0, 3, 0), scene);
          l.diffuse = new B.Color3(1, .49, .16); l.intensity = 0; l.range = 13;
          return l;
        });
      }
    }
    makeTextures() {
      // Original seamless surface art is built here, never fetched. The larger
      // stone/terrain atlases retain their detail at the highest render setting.
      let seed = 91473;
      const random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
      for (let name of ['ground', 'path', 'stone', 'wood', 'cloth', 'metal', 'roof']) {
        const size = ['stone', 'ground', 'path', 'roof'].includes(name) ? 512 : 256;
        let texture = new B.DynamicTexture('original-surface-' + name, size, this.scene, true, B.Texture.TRILINEAR_SAMPLINGMODE);
        let c = texture.getContext(), heights = new Float32Array(size * size);
        c.fillStyle = name === 'wood' ? '#d8c5a6' : name === 'stone' ? '#e0ddcc' : name === 'roof' ? '#c0c5c2' : '#e1dfce';
        c.fillRect(0, 0, size, size);
        // Periodic soft variation wraps at all four edges; avoids repeated dots.
        for (let i = 0; i < 70; i++) {
          let x = random() * size, y = random() * size, r = 12 + random() * 35, shade = random() > .45;
          for (let ox of [-size, 0, size]) for (let oy of [-size, 0, size]) {
            let g = c.createRadialGradient(x + ox,y + oy,0,x + ox,y + oy,r);
            g.addColorStop(0, shade ? 'rgba(63,61,40,.11)' : 'rgba(255,255,235,.16)'); g.addColorStop(1,'rgba(255,255,235,0)');
            c.fillStyle = g; c.fillRect(x + ox-r,y + oy-r,r*2,r*2);
          }
        }
        for (let i = 0; i < size * 20; i++) {
          c.fillStyle = random() > .55 ? 'rgba(28,32,27,.065)' : 'rgba(255,255,245,.12)';
          c.fillRect(random()*size,random()*size,1+random()*2.5,1+random()*2);
        }
        if (name === 'stone') {
          const bh = size / 8, bw = size / 4;
          for (let y = 0; y < size; y += bh) {
            c.fillStyle = '#8f9384'; c.fillRect(0,y,size,3);
            c.fillStyle = 'rgba(255,255,236,.68)'; c.fillRect(0,y+3,size,2);
            for (let x = -(y/bh%2)*bw/2; x < size; x += bw) {
              c.fillStyle = 'rgba(74,81,66,.28)'; c.fillRect(x,y,3,bh);
              c.fillStyle = 'rgba(255,255,230,.25)'; c.fillRect(x+3,y+4,bw-7,2);
              c.fillStyle = 'rgba(47,60,40,.12)'; c.fillRect(x+4,y+bh-8,bw-6,5);
              for (let k = 0; k < 5; k++) {
                c.strokeStyle = 'rgba(81,78,66,.17)'; c.lineWidth = 1;
                let px=x+random()*bw, py=y+7+random()*(bh-15);
                c.beginPath(); c.moveTo(px,py);c.lineTo(px+4,py+8);c.lineTo(px+3,py+13);c.stroke();
              }
            }
          }
          // Old limestone picks up moisture below the coping and around joints.
          // Paint it into the seamless atlas instead of adding wall decal meshes.
          for (let j=0;j<38;j++) {
            let x=random()*size,y=Math.floor(random()*8)*bh+bh-8;
            let wash=c.createLinearGradient(0,y-20,0,y+5);
            wash.addColorStop(0,'rgba(67,77,52,0)');wash.addColorStop(1,'rgba(67,77,52,.18)');
            c.fillStyle=wash;c.fillRect(x,y-20,8+random()*30,25);
          }
        } else if (name === 'wood') {
          for (let x = 0; x < size; x += 32) {c.fillStyle='rgba(53,35,23,.40)';c.fillRect(x,0,2,size);c.fillStyle='rgba(255,226,176,.35)';c.fillRect(x+2,0,1,size);}
          for (let j = 0; j < 650; j++) {c.strokeStyle='rgba(65,44,29,.13)';c.beginPath();let x=random()*size,y=random()*size;c.moveTo(x,y);c.quadraticCurveTo(x+3,y+12,x,y+35);c.stroke();}
          c.strokeStyle='rgba(51,35,26,.26)';
          for (let j=0;j<12;j++) {c.beginPath();c.ellipse(random()*size,random()*size,3,12,.15,0,Math.PI*2);c.stroke();}
        } else if (name === 'cloth') {
          c.fillStyle='rgba(40,44,38,.065)';
          for(let x=0;x<size;x+=4)c.fillRect(x,0,1,size);
          for(let y=0;y<size;y+=4)c.fillRect(0,y,size,1);
          c.strokeStyle='#cdbd8c';c.lineWidth=7;c.strokeRect(9,9,238,238);
          c.strokeStyle='#f2dfad';c.lineWidth=2;c.strokeRect(15,15,226,226);
          for(let x=22;x<238;x+=18){c.beginPath();c.moveTo(x-4,228);c.lineTo(x,220);c.lineTo(x+4,228);c.stroke();}
        } else if (name === 'metal') {
          for(let j=0;j<800;j++){c.fillStyle='rgba(255,255,255,.12)';c.fillRect(random()*size,random()*size,3+random()*12,1);}
        } else if (name === 'roof') {
          // Overlapping ceramic channels and lips, including irregular aged edges.
          for(let y=0;y<size;y+=32) for(let x=-((y/32)%2)*8;x<size;x+=32) {
            let g=c.createLinearGradient(x,0,x+32,0);g.addColorStop(0,'#777f7b');g.addColorStop(.23,'#c4c9c1');g.addColorStop(.64,'#deded1');g.addColorStop(1,'#8c948e');
            c.fillStyle=g;c.fillRect(x,y,31,32);c.fillStyle='rgba(36,52,46,.43)';c.fillRect(x,y+28,32,3);c.fillStyle='rgba(243,236,211,.48)';c.fillRect(x,y+27,30,1);
            if(random()>.5){c.fillStyle='rgba(80,95,62,.17)';c.fillRect(x+random()*15,y+20,12,7);}
          }
        } else if (name === 'path') {
          for(let y=0;y<size;y+=64) for(let x=-((y/64)%2)*48;x<size;x+=96) {
            c.strokeStyle='rgba(62,62,48,.26)';c.lineWidth=2;c.strokeRect(x+1,y+1,94,62);
            c.strokeStyle='rgba(255,252,219,.27)';c.lineWidth=1;c.beginPath();c.moveTo(x+3,y+60);c.lineTo(x+3,y+3);c.lineTo(x+92,y+3);c.stroke();
          }
          // Faded wheel ruts and gravel keep the marching lanes visibly distinct.
          for(let x of [size*.26,size*.73]) {c.fillStyle='rgba(70,64,45,.08)';c.fillRect(x,0,5,size);}
        } else if (name === 'ground') {
          for(let j=0;j<950;j++) {
            let x=random()*size,y=random()*size;
            c.strokeStyle=this.landscape==='frost'?'rgba(110,136,150,.13)':this.landscape==='desert'?'rgba(147,104,52,.14)':this.landscape==='volcanic'?'rgba(61,51,57,.25)':random()>.45?'rgba(67,81,45,.22)':'rgba(152,140,96,.24)';
            c.beginPath();c.moveTo(x,y);c.lineTo(x+random()*3-1.5,y-2-random()*4);c.stroke();
            if(j%7===0){c.fillStyle='rgba(104,99,79,.24)';c.beginPath();c.ellipse(x,y,1+random()*2,1,0,0,Math.PI*2);c.fill();}
          }
          if(this.landscape==='desert')for(let y=-16;y<size+16;y+=13){c.strokeStyle='rgba(179,135,70,.13)';c.lineWidth=2;c.beginPath();for(let x=0;x<=size;x+=8){let yy=y+Math.sin(x/size*Math.PI*4)*3;x?c.lineTo(x,yy):c.moveTo(x,yy);}c.stroke();}
          if(this.landscape==='frost')for(let j=0;j<110;j++){let x=random()*size,y=random()*size;c.fillStyle='rgba(255,255,255,.32)';c.beginPath();c.ellipse(x,y,4+random()*13,1+random()*4,-.15,0,Math.PI*2);c.fill();}
          if(this.landscape==='volcanic')for(let j=0;j<30;j++){let x=random()*size,y=random()*size;c.strokeStyle='rgba(81,43,36,.26)';c.lineWidth=1;c.beginPath();c.moveTo(x,y);for(let k=0;k<4;k++){x+=random()*21-9;y+=random()*17-4;c.lineTo(x,y);}c.stroke();}
        }
        texture.wrapU=texture.wrapV=B.Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=8;
        texture.update(false);this.textures[name]=texture;
        const mat=this.materials[name];
        if(mat){if(mat instanceof B.PBRMaterial)mat.albedoTexture=texture;else mat.diffuseTexture=texture;}
        if(name==='cloth')for(let key of ['ally','enemy','canvas'])this.materials[key].diffuseTexture=texture;
        if(name!=='cloth') {
          const pixels=c.getImageData(0,0,size,size).data;
          for(let i=0;i<heights.length;i++)heights[i]=pixels[i*4]/255;
          const normal=new Uint8Array(size*size*4),strength=name==='ground'?.6:name==='roof'?1.6:1.3;
          for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
            let i=y*size+x,dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*strength;
            let dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*strength;
            normal[i*4]=Math.round(clamp(128-dx*100,0,255));normal[i*4+1]=Math.round(clamp(128-dy*100,0,255));normal[i*4+2]=250;normal[i*4+3]=255;
          }
          let n=new B.RawTexture(normal,size,size,B.Engine.TEXTUREFORMAT_RGBA,this.scene,true,false,B.Texture.TRILINEAR_SAMPLINGMODE);
          n.name='original-normal-'+name;n.wrapU=n.wrapV=B.Texture.WRAP_ADDRESSMODE;n.anisotropicFilteringLevel=8;
          this.textures[name+'Normal']=n;mat.bumpTexture=n;n.level=name==='stone'?.65:name==='ground'?.22:.35;
        }
      }
      this.materials.dark.diffuseTexture=this.textures.stone;this.materials.dark.bumpTexture=this.textures.stoneNormal;
      this.materials.bark.diffuseTexture=this.textures.wood;
    }
    makeEnvironment() {
      // A smooth, low-frequency original sky cube provides broad metal highlights.
      // The mip chain is generated locally; this is deliberately not an HDR asset claim.
      let data = [], size = 16, night = this.stage.night;
      for (let f = 0; f < 6; f++) {
        let bytes = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          let u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
          let h = f === 2 ? 1 : f === 3 ? -1 : -v / Math.sqrt(1 + u * u + v * v), sky = clamp((h + .4) / 1.4, 0, 1);
          let warm = !night && f === 4 ? Math.pow(Math.max(0, 1 - u * u - (v + .15) * (v + .15)), 3) * .12 : 0;
          let i = (y * size + x) * 4;
          bytes[i] = Math.round(255 * (night ? .065 + sky * .08 : .16 + sky * .24) + warm * 255);
          bytes[i + 1] = Math.round(255 * (night ? .09 + sky * .11 : .17 + sky * .32) + warm * 170);
          bytes[i + 2] = Math.round(255 * (night ? .16 + sky * .18 : .15 + sky * .42)); bytes[i + 3] = 255;
        }
        data.push(bytes);
      }
      let env = new B.RawCubeTexture(this.scene, data, size, B.Engine.TEXTUREFORMAT_RGBA, B.Engine.TEXTURETYPE_UNSIGNED_BYTE, true, false, B.Texture.TRILINEAR_SAMPLINGMODE);
      env.name = 'original-local-sky-cube'; env.gammaSpace = false; env.coordinatesMode = B.Texture.CUBIC_MODE;
      // Integrate the CPU-owned cube bytes synchronously. Babylon's lazy GPU readback
      // otherwise outlives a disposed scene during rapid mission restarts.
      env.sphericalPolynomial = B.CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
        size, right:data[0], left:data[1], up:data[2], down:data[3], front:data[4], back:data[5],
        format:B.Engine.TEXTUREFORMAT_RGBA, type:B.Engine.TEXTURETYPE_UNSIGNED_BYTE, gammaSpace:false
      });
      this.scene.environmentTexture = env; this.scene.environmentIntensity = night ? .76 : .88;
    }
    makeSky() {
      // One original texture and one background draw; no postprocess sky pass.
      let night=this.stage.night,texture=new B.DynamicTexture('original-atmospheric-sky',{width:1024,height:256},this.scene,true,B.Texture.TRILINEAR_SAMPLINGMODE),c=texture.getContext();
      let gradient=c.createLinearGradient(0,0,0,256);
      const skyPalettes={coast:['#4f91ac','#80b3bf','#b2cccd','#cfceba'],marsh:['#253e42','#456269','#71877e','#a3a18a'],desert:['#899bab','#c7bca2','#ddc499','#d4b481'],frost:['#526d88','#8da8bb','#b9ccd4','#d5dadb'],volcanic:['#201f31','#493e4b','#7a5d63','#ae7960']};
      const skyColors=skyPalettes[this.landscape]||(night?['#0b182d','#17283e','#233449','#34404b']:['#668697','#8ba8b3','#a9b9b8','#b2aea0']);
      for(let i=0;i<4;i++)gradient.addColorStop([0,.48,.68,1][i],skyColors[i]);
      c.fillStyle=gradient;c.fillRect(0,0,1024,256);
      let seed=18375,random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      if(!night) {
        let radiance=c.createRadialGradient(773,65,1,773,65,45);
        radiance.addColorStop(0,'rgba(255,242,199,.62)');radiance.addColorStop(.18,'rgba(255,231,181,.20)');radiance.addColorStop(1,'rgba(255,231,181,0)');
        c.fillStyle=radiance;c.fillRect(728,20,90,90);c.fillStyle='rgba(255,248,215,.78)';c.beginPath();c.ellipse(773,65,2.5,5,0,0,Math.PI*2);c.fill();
      }
      if(night) {
        for(let i=0;i<150;i++){let x=random()*1024,y=random()*115;c.fillStyle='rgba(221,232,255,'+(.15+random()*.38)+')';c.fillRect(x,y,random()>.95?1.5:.8,.8);}
        c.fillStyle='rgba(220,230,247,.76)';c.beginPath();c.ellipse(759,53,5.5,11,0,0,Math.PI*2);c.fill();
        c.fillStyle='#122238';c.beginPath();c.ellipse(762,50,5.4,10.5,0,0,Math.PI*2);c.fill();
      }
      c.filter='blur(2px)';
      for(let i=0;i<22;i++) {
        let x=random()*1024,y=30+random()*101;c.fillStyle=night?'rgba(135,153,178,.06)':'rgba(235,232,211,.14)';
        c.beginPath();c.ellipse(x,y,34+random()*65,2+random()*6,-.035,0,Math.PI*2);c.fill();
      }
      c.filter='none';texture.wrapU=B.Texture.WRAP_ADDRESSMODE;texture.wrapV=B.Texture.CLAMP_ADDRESSMODE;texture.update(false);
      let material=new B.StandardMaterial('original-sky-surface',this.scene);material.emissiveTexture=texture;material.diffuseColor=B.Color3.Black();material.emissiveColor=B.Color3.Black();material.disableLighting=true;material.fogEnabled=false;material.backFaceCulling=false;
      let dome=B.MeshBuilder.CreateSphere('atmospheric-sky',{diameter:480,segments:12,sideOrientation:B.Mesh.BACKSIDE},this.scene);dome.material=material;dome.infiniteDistance=true;dome.isPickable=false;dome.applyFog=false;
      this.sky=dome;
    }
    makeAtmosphere() {
      // One bounded particle batch adds drifting battlefield dust. It scales
      // down before render resolution and has no gameplay or collision role.
      if(!B.ParticleSystem)return;
      let texture=new B.DynamicTexture('original-soft-dust',32,this.scene,false,B.Texture.BILINEAR_SAMPLINGMODE),c=texture.getContext();
      const g=c.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,255,255,.45)');g.addColorStop(.4,'rgba(255,255,255,.18)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,32,32);texture.update(false);
      let dust=new B.ParticleSystem('bounded-battlefield-dust',48,this.scene);dust.particleTexture=texture;dust.emitter=new B.Vector3(0,0,0);
      dust.minEmitBox=new B.Vector3(-11,.1,-11);dust.maxEmitBox=new B.Vector3(11,2.1,11);
      dust.direction1=new B.Vector3(.13,.02,-.05);dust.direction2=new B.Vector3(.40,.10,.1);
      dust.minLifeTime=3;dust.maxLifeTime=5;dust.minSize=.09;dust.maxSize=.24;dust.minEmitPower=.25;dust.maxEmitPower=.75;
      dust.color1=this.stage.night?new B.Color4(.48,.60,.75,.12):new B.Color4(.85,.77,.55,.14);
      dust.color2=this.stage.night?new B.Color4(.38,.48,.63,.07):new B.Color4(.63,.61,.48,.08);dust.colorDead=new B.Color4(.4,.4,.3,0);
      if(this.landscape==='frost') {
        dust.minEmitBox.set(-12,5,-12);dust.maxEmitBox.set(12,11,12);dust.direction1.set(-.15,-.65,.05);dust.direction2.set(.25,-.25,.14);
        dust.minSize=.055;dust.maxSize=.11;dust.minLifeTime=5;dust.maxLifeTime=8;dust.color1=new B.Color4(.92,.97,1,.66);dust.color2=new B.Color4(.73,.86,.94,.45);dust.gravity.set(.02,-.025,0);
      } else if(this.landscape==='volcanic') {
        dust.minEmitBox.y=.4;dust.maxEmitBox.y=3;dust.direction1.set(-.03,.30,0);dust.direction2.set(.15,.7,.06);
        dust.minSize=.035;dust.maxSize=.09;dust.color1=new B.Color4(1,.61,.27,.40);dust.color2=new B.Color4(.9,.32,.13,.20);
      } else if(this.landscape==='marsh') {
        dust.minSize=.14;dust.maxSize=.33;dust.color1=new B.Color4(.57,.72,.65,.11);dust.color2=new B.Color4(.78,.84,.77,.07);
      }
      dust.blendMode=B.ParticleSystem.BLENDMODE_STANDARD;if(this.landscape!=='frost')dust.gravity=new B.Vector3(.01,.006,0);dust.updateSpeed=.018;dust.emitRate=0;dust.start();this.dust=dust;
    }
    setupShadows() {
      if (!B.ShadowGenerator) return;
      this.sun.shadowFrustumSize = 38; this.sun.autoUpdateExtends = false;
      this.sun.shadowMinZ = .1; this.sun.shadowMaxZ = 85;
      let g = new B.ShadowGenerator(1024, this.sun);
      g.usePercentageCloserFiltering = true; g.filteringQuality = B.ShadowGenerator.QUALITY_LOW;
      g.bias = .0005; g.normalBias = .035; g.darkness = this.stage.night ? .25 : .32;
      this.shadows = g; g.getShadowMap().renderList = [];
    }
    registerShadowCaster(mesh, priority = 1) {
      if (!mesh || this.shadowCasters.some(c => c.mesh === mesh)) return;
      this.shadowCasters.push({mesh, priority}); this.shadowTime = .13;
    }
    update(dt, budget) {
      this.time += Math.max(0, Math.min(.05, dt || 0));
      this.bannerTime += dt || 0; this.shadowTime += dt || 0;
      if (this.bannerTime > .065) {
        this.bannerTime = 0;
        for (let b of this.banners) {
          let positions = b.metadata.foldPositions;
          for (let j = 0; j < positions.length / 6; j++) {
            let t = j / (positions.length / 6 - 1), fold = Math.sin(t * 5.2 - this.time * 2.3 + b.metadata.phase) * .14 * t;
            positions[j * 6 + 2] = positions[j * 6 + 5] = fold;
          }
          b.updateVerticesData(B.VertexBuffer.PositionKind, positions, false, false);
        }
      }
      let p = typeof app !== 'undefined' ? app.player : null;
      if (!p) return;
      let currentPreset=budget?.effective||'balanced',reduced=budget?.detailLevel>0;
      this.grassClock=(this.grassClock||0)+Math.max(0,dt||0);
      if(this.grassClock>.25){
        this.grassClock=0;
        const range=currentPreset==='quality'?88:60;
        for(let cell of this.grassBatches){
          const visible=currentPreset!=='performance'&&!reduced&&(cell.x-p.x)**2+(cell.z-p.z)**2<range*range;
          if(cell.mesh.isEnabled()!==visible)cell.mesh.setEnabled(visible);
        }
      }
      if(this.dust){this.dust.emitter.set(p.x,0,p.z);this.dust.emitRate=currentPreset==='performance'||reduced?0:currentPreset==='quality'?6:2;}
      this.flameClock=(this.flameClock||0)+Math.max(0,dt||0);
      if(this.flameClock>.075){
        this.flameClock=0;
        for(let f of this.flames){let near=(f.x-p.x)**2+(f.z-p.z)**2<900;
          f.mesh.scaling.y=near&&currentPreset!=='performance'?1+Math.sin(this.time*8.1+f.x)*.10+Math.sin(this.time*13.7+f.z)*.035:1;
          f.mesh.scaling.x=f.mesh.scaling.z=near&&currentPreset!=='performance'?1+Math.sin(this.time*7+f.z)*.06:1;
        }
      }
      if (this.torchLights) {
        let first = null, second = null, d1 = Infinity, d2 = Infinity;
        for (let t of this.torches) {let d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2; if (d < d1) {second = first; d2 = d1; first = t; d1 = d;} else if (d < d2) {second = t; d2 = d;}}
        for (let i = 0; i < 2; i++) {let t = i === 0 ? first : second, d = i === 0 ? d1 : d2, l = this.torchLights[i]; if (t) l.position.set(t.x, 2.8, t.z); l.intensity = t && d < 400 ? 1.6 * clamp((400 - d) / 150, 0, 1) * (1 + Math.sin(this.time * 8 + i) * .035) : 0;}
      }
      if (!this.shadows) return;
      let preset = budget?.effective || 'balanced', enabled = preset !== 'performance' && budget?.shadowsEnabled !== false && (budget?.shadowFactor ?? 1) > 0;
      const map = this.shadows.getShadowMap();
      if (this.shadowsActive !== enabled || this.shadowPreset !== preset) this.shadowTime = .13;
      this.shadowsActive = enabled; this.shadowPreset = preset;
      this.scene.shadowsEnabled = enabled;
      if (!enabled) {map.renderList.length = 0; this.shadowCasterCount = 0; this.shadows.getShadowMap().refreshRate = 0; return;}
      if (this.shadowTime < .12) return;
      this.shadowTime = 0;
      map.refreshRate = 1;
      let wantedSize = preset === 'quality' ? 2048 : 512;
      this.shadows.filteringQuality=preset==='quality'?B.ShadowGenerator.QUALITY_MEDIUM:B.ShadowGenerator.QUALITY_LOW;
      if (map.getSize().width !== wantedSize) this.shadows.mapSize = wantedSize;
      let step = 38 / wantedSize, x = Math.round(p.x / step) * step, z = Math.round(p.z / step) * step;
      this.sun.position.set(x + 18, 32, z - 13);
      // Selection is bounded and runs at 8 Hz; no crowd mesh enters the shadow pass.
      const list = this.shadows.getShadowMap().renderList; list.length = 0;
      let max = preset === 'quality' ? 24 : 12;
      for (let rank = 0; rank <= 2 && list.length < max; rank++) for (let c of this.shadowCasters) {
        let m = c.mesh;
        if (c.priority !== rank || m.isDisposed() || !m.isEnabled() || m.visibility <= .01) continue;
        let pos = m.getAbsolutePosition(), d = (pos.x - p.x) ** 2 + (pos.z - p.z) ** 2;
        if (rank > 0 && d > 225) continue;
        list.push(m); if (list.length >= max) break;
      }
      this.shadowCasterCount = list.length;
    }
    box(x, y, z, w, h, d, mat = 'stone', collide = false) {
      let scale = ['stone','dark'].includes(mat) ? 3.5 : ['wood','bark'].includes(mat) ? 2.5 : mat === 'roof' ? 1.5 : 7;
      let uv = (u, v) => new B.Vector4(0, 0, Math.max(.15, u / scale), Math.max(.15, v / scale));
      let mesh = B.MeshBuilder.CreateBox('world', {
        width: w, height: h, depth: d,
        faceUV: [uv(w, h), uv(w, h), uv(d, h), uv(d, h), uv(w, d), uv(w, d)]
      }, this.scene);
      mesh.position.set(x, y, z);
      mesh.material = this.materials[mat];
      mesh.isPickable = false;
      mesh.receiveShadows = ['stone', 'ground', 'path', 'wood', 'dark'].includes(mat);
      mesh.freezeWorldMatrix();
      this.statics.push(mesh);
      if (collide) {
        let b = app.collision.add(x, z, w, d);
        b.mesh = mesh;
        b.top = y + h / 2;
      }
      return mesh;
    }
    cylinder(x, y, z, r, h, mat, vertices = 10) {
      let repeat = ['stone','dark'].includes(mat) ? 3.5 : 2.5;
      let mesh = B.MeshBuilder.CreateCylinder('prop', {diameter: r * 2, height: h, tessellation: vertices, faceUV: [new B.Vector4(0,0,Math.max(.15,r*2/repeat),Math.max(.15,r*2/repeat)),new B.Vector4(0,0,Math.max(.25,r*Math.PI*2/repeat),Math.max(.15,h/repeat)),new B.Vector4(0,0,Math.max(.15,r*2/repeat),Math.max(.15,r*2/repeat))]}, this.scene);
      mesh.position.set(x, y, z);
      mesh.material = this.materials[mat];
      mesh.isPickable = false;
      mesh.receiveShadows = ['stone', 'ground', 'path', 'wood', 'dark'].includes(mat);
      mesh.freezeWorldMatrix();
      this.statics.push(mesh);
      return mesh;
    }
    fortress(x, y, z, w, h, d, mat = 'stone') {
      // Architectural trim stays within the original blocking footprint.
      let wall = this.box(x, y, z, w, h, d, mat, true);
      let top = y + h / 2;
      this.box(x, y - h / 2 + .18, z, w + .12, .36, d + .12, 'dark');
      this.box(x, top + .14, z, w, .28, d, mat);
      let alongX = w >= d, length = alongX ? w : d;
      for (let t = -length / 2 + 1.3; t < length / 2 - .6; t += 3.8) {
        this.box(x + (alongX ? t : 0), top + .63, z + (alongX ? 0 : t), alongX ? 1.5 : w, .74, alongX ? d : 1.5, mat);
      }
      // Coping, inset arrow slits and pilasters use the existing wall footprint.
      if (length > 7 && h > 2.5) {
        const thickness=alongX?d:w;
        for(let side of [-1,1]) {
          this.box(x+(alongX?0:side*thickness*.501),top-.65,z+(alongX?side*thickness*.501:0),alongX?w:.05,.12,alongX?.05:d,'dark');
          for(let t=-length/2+3;t<length/2-2;t+=8.5) {
            const fx=x+(alongX?t:side*(thickness*.5+.066)),fz=z+(alongX?side*(thickness*.5+.066):t);
            this.box(fx,y+.15,fz,alongX?.15:.055,Math.min(1.1,h*.23),alongX?.055:.15,'window');
            this.box(x+(alongX?t:side*(thickness*.5-.06)),y,z+(alongX?side*(thickness*.5-.06):t),alongX?.58:.19,h*.78,alongX?.19:.58,mat);
          }
        }
      }
      app.collision.boxes[app.collision.boxes.length - 1].top = top + 1;
      return wall;
    }
    tower(x, z, r, height) {
      this.cameraVolume(x,height/2,z,r*2,height+1.5,r*2);
      this.cylinder(x, height / 2, z, r, height, 'stone', 12);
      this.cylinder(x, height + .18, z, r + .13, .36, 'stone', 12);
      this.cylinder(x, .23, z, r + .2, .46, 'dark', 12);
      for(let level of [.28,.52,.81]) this.cylinder(x,height*level,z,r+.045,.13,'dark',12);
      this.cylinder(x,height-.28,z,r+.11,.15,'stone',12);
      for (let side of [-1,1]) {
        this.box(x, height*.66, z + side*(r-.025), .24, height*.22, .055, 'window');
        this.box(x+side*(r-.025),height*.66,z,.055,height*.22,.24,'window');
      }
      for (let j = 0; j < 8; j++) {
        let a = j * Math.PI / 4;
        this.box(x + Math.sin(a) * (r - .48), height + .69, z + Math.cos(a) * (r - .48), .9, .7, .9, 'stone');
      }
    }
    banner(x, z, ally = false) {
      this.cylinder(x, 2.8, z, .105, 5.6, 'wood');
      this.cylinder(x, 5.65, z, .20, .25, 'gold', 6);
      this.cylinder(x, .12, z, .38, .24, 'dark');
      let flag = new B.Mesh('banner', this.scene), positions = [], indices = [], uvs = [], normals = [];
      for (let j = 0; j < 9; j++) {
        let t = j / 8, fold = Math.sin(t * Math.PI * 1.5) * .14;
        positions.push(-.88 + t * 1.8, .69, fold, -.88 + t * 1.8, -.69 - (j === 8 ? .18 : 0), fold);
        uvs.push(t, 0, t, 1);
        if (j < 8) { let n = j * 2; indices.push(n, n + 1, n + 2, n + 2, n + 1, n + 3); }
      }
      B.VertexData.ComputeNormals(positions, indices, normals);
      let data = new B.VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
      data.applyToMesh(flag, true);
      flag.position.set(x + .97, 4.67, z);
      flag.isPickable = false;
      flag.metadata = {keepSeparate: true, symbols: [], foldPositions: new Float32Array(positions), phase: x * .17 + z * .11};
      this.banners.push(flag);
      this.materials.ally.backFaceCulling = this.materials.enemy.backFaceCulling = false;
      this.statics.push(flag);
      for (let kind of [0, 1]) {
        let mark = B.MeshBuilder.CreateCylinder('mark', {diameter: .62, height: .075, tessellation: kind === 0 ? 3 : 4}, this.scene);
        mark.rotation.x = Math.PI / 2;
        mark.rotation.y = kind === 0 ? 0 : Math.PI / 4;
        mark.position.set(x + .92, 4.67, z - .13);
        mark.material = this.materials.ivory;
        mark.isPickable = false;
        mark.metadata = {keepSeparate: true};
        flag.metadata.symbols.push(mark);
        this.statics.push(mark);
      }
      let slit = this.box(x + .92, 4.67, z - .18, .10, .72, .025, 'metal');
      slit.metadata = {keepSeparate: true};
      flag.metadata.symbols.push(slit);
      this.ownFlag(flag, ally ? 0 : 1);
      return flag;
    }
    ownFlag(flag, owner) {
      flag.material = this.materials[owner === 0 ? 'ally' : 'enemy'];
      let s = flag.metadata?.symbols;
      if (s) { s[0].setEnabled(owner === 0); s[1].setEnabled(owner === 1); s[2].setEnabled(owner === 1); }
    }
    ring(x, z, r, mat = 'gold') {
      let m = flatRing('capture', this.scene, 48, .973);
      m.scaling.set(r, 1, r);
      m.position.set(x, .052, z);
      m.material = this.materials[mat]; m.isPickable = false;
      m.metadata = {keepSeparate: true};
      this.statics.push(m);
      return m;
    }
    gate(x, z, w = 12, d = 2) {
      let c = app.collision.add(x, z, w, d, true), m = this.box(x, 2.5, z, w, 5, d, 'wood');
      c.mesh = m; c.hp = c.maxHp = 500; c.top = 5.3;
      m.metadata = {keepSeparate: true};
      this.registerShadowCaster(m,2);
      let alongX = w >= d;
      // All gate fittings are children: disabling a destroyed/open gate clears the whole opening.
      for (let level of [-1.45, 1.15]) {
        let brace = B.MeshBuilder.CreateBox('gate-brace', {width: alongX ? w : w + .10, height: .20, depth: alongX ? d + .10 : d}, this.scene);
        brace.parent = m; brace.position.y = level; brace.material = this.materials.metal; brace.isPickable = false;
      }
      let middle = B.MeshBuilder.CreateBox('gate-seam', {width: alongX ? .12 : w + .12, height: 4.8, depth: alongX ? d + .12 : .12}, this.scene);
      middle.parent = m; middle.material = this.materials.metal; middle.isPickable = false;
      this.gateHardware(m,w,d,alongX);
      if (d > w) {
        this.fortress(x, 3, z - d / 2 - 2, 5, 6, 4);
        this.fortress(x, 3, z + d / 2 + 2, 5, 6, 4);
      } else {
        this.fortress(x - w / 2 - 2, 3, z, 4, 6, 5);
        this.fortress(x + w / 2 + 2, 3, z, 4, 6, 5);
      }
      return c;
    }
    gateHardware(gate,w,d,alongX) {
      // Batch fittings into one child so opening/destroying the gate removes
      // every stud and handle without adding dozens of permanent draw calls.
      const fittings=[],length=alongX?w:d;
      for(let side of [-1,1]) for(let y of [-1.5,1.2]) for(let t=-length*.43;t<=length*.43;t+=Math.max(1.15,length/9)) {
        let stud=B.MeshBuilder.CreateSphere('forged-gate-stud',{diameter:.12,segments:5},this.scene);
        stud.position.set(alongX?t:side*(w*.5+.07),y,alongX?side*(d*.5+.07):t);stud.material=this.materials.metal;stud.isPickable=false;fittings.push(stud);
      }
      for(let t of [-length*.13,length*.13]) {
        let ring=B.MeshBuilder.CreateTorus('gate-pull-ring',{diameter:.48,thickness:.065,tessellation:12},this.scene);
        ring.rotation[alongX?'x':'z']=Math.PI/2;
        ring.position.set(alongX?t:-w*.5-.13,-.05,alongX?-d*.5-.13:t);ring.material=this.materials.metal;ring.isPickable=false;fittings.push(ring);
      }
      let hardware=B.Mesh.MergeMeshes(fittings,true,true,undefined,false,false);
      if(hardware){hardware.parent=gate;hardware.isPickable=false;}
    }
    road(points, width = 9) {
      this.roads.push({points, width});
      for (let j = 1; j < points.length; j++) {
        let a = points[j - 1], b = points[j], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        let path = this.box((a[0] + b[0]) / 2, .019 + (j % 3) * .0015, (a[1] + b[1]) / 2, width, .035, length + .5, 'path');
        path.unfreezeWorldMatrix(); path.rotation.y = Math.atan2(dx, dz); path.freezeWorldMatrix();
      }
    }
    lantern(x, z) {
      this.cylinder(x, 1, z, .16, 2, 'wood');
      this.cylinder(x, 2.04, z, .38, .25, 'metal');
      let flame = this.cylinder(x, 2.33, z, .23, .48, 'gold', 6);
      flame.material = this.materials.flame;
      flame.metadata={keepSeparate:true};flame.unfreezeWorldMatrix();this.flames.push({mesh:flame,x,z});
      this.torches.push({x, z});
      this.cylinder(x, 2.62, z, .40, .14, 'metal');
      // Warm light is baked into a translucent ground disc instead of five costly point lights.
      let glow = B.MeshBuilder.CreateDisc('lantern-pool', {radius: 3.5, tessellation: 24, sideOrientation: B.Mesh.DOUBLESIDE}, this.scene);
      glow.rotation.x = Math.PI / 2; glow.position.set(x, .045, z);
      if (!this.materials.lanternGlow) {
        let m = new B.StandardMaterial('lantern-ground-glow', this.scene);
        m.diffuseColor = new B.Color3(.94, .55, .25); m.emissiveColor = m.diffuseColor;
        m.disableLighting = true; m.alpha = .095; m.backFaceCulling = false;
        this.materials.lanternGlow = m;
      }
      glow.material = this.materials.lanternGlow; glow.isPickable = false; glow.metadata = {keepSeparate: true};
      this.statics.push(glow);
    }
    build() {
      let s = this.stage;
      if (s.training) {
        this.fortress(0, 1.5, -20, 44, 3, 1);
        this.fortress(0, 1.5, 20, 44, 3, 1);
        this.fortress(-22, 1.5, 0, 1, 3, 40);
        this.fortress(22, 1.5, 0, 1, 3, 40);
        this.box(0, .018, 0, 27, .035, 30, 'path');
        this.ring(0, 0, 12);
        for (let x of [-17, 17]) { this.tower(x, 12, 2, 6); this.banner(x, 10, true); }
        this.dressTraining(); this.mergeStatics(); return;
      }
      for (let p of s.points) this.box(p[0], .023, p[1], 16, .045, 18, 'path');
      if (s === STAGES[0]) {
        this.road([[0, -56], [-12, -26], [0, -6], [0, 8], [0, 20], [0, 39]]);
        this.road([[-12, -26], [-47, -12]], 7);
        this.road([[0, 0], [12, 3]], 7);
        for (let x of [-49, 49]) { this.fortress(x, 2, 8, 82, 4, 3); this.tower(x, 8, 4, 8); }
        this.box(0, .018, 7, 11, .035, 22, 'path');
        this.gate1 = this.gate(0, 8, 16);
        for (let x of [-25, 25]) this.fortress(x, 1.5, 34, 22, 3, 3);
        this.box(-32, 1.3, -28, 10, 2.6, 8, 'wood', true);
        this.fortress(34, 1.7, -38, 12, 3.4, 4);
        let barricade = app.collision.add(-47, -8, 12, 1.5, true);
        barricade.attackable = true; barricade.hp = barricade.maxHp = 300;
        barricade.name = 'حاجز قابل للتحطيم'; barricade.top = 2.4;
        barricade.mesh = this.box(-47, 1.2, -8, 12, 2.4, 1.5, 'wood');
        this.ring(-47, -10, 2);
      } else if (s === STAGES[1]) {
        this.road([[-73, -12], [-38, -12], [-27, -10], [-27, 13], [-5, 13], [15, 4], [30, -10], [43, -10], [76, -10]], 9);
        if(s.points[5])this.road([[-38,-12],[-48,0],s.points[5]],7);
        this.box(2, 2, -40, 95, 4, 18, 'dark', true);
        this.box(5, 2, 43, 108, 4, 14, 'dark', true);
        this.box(-18, 2, -5, 5, 4, 26, 'dark', true);
        this.box(35, 2, 25, 5, 4, 22, 'dark', true);
        this.gate1 = this.gate(43, -10, 2, 18);
        this.fortress(43, 3, -37, 2, 6, 36, 'dark');
        this.fortress(43, 3, 31, 2, 6, 64, 'dark');
        for (let p of s.points) this.lantern(p[0] + 7, p[1] + 6);
      } else if (s === STAGES[2]) {
        this.road([[0, -65], [-18, -35], [0, -22], [0, -13], [0, -7], [0, 23], [0, 42], [0, 62]], 11);
        for (let z of [-13, 42]) {
          this.fortress(-53, 4, z, 84, 8, 4); this.fortress(53, 4, z, 84, 8, 4);
          for (let x of [-52, 52]) this.tower(x, z, 5, 10);
          let g = this.gate(0, z, 22); if (z === -13) this.gate1 = g; else this.gate2 = g;
        }
        for (let x of [-56, 56]) this.fortress(x, 3, 15, 4, 6, 90);
        this.box(5, .55, -22, 1.4, 1.1, 1.2, 'wood', true);
        let wheel = B.MeshBuilder.CreateCylinder('gate winch', {diameter: 1.2, height: .15, tessellation: 10}, this.scene);
        wheel.rotation.x = Math.PI / 2; wheel.position.set(5, 1.4, -22.65);
        wheel.material = this.materials.gold; wheel.isPickable = false; this.statics.push(wheel);
        this.ring(5, -22, 2); this.cylinder(0, .08, 67, 7, .16, 'rift');
        for (let x of [-14, 14]) { this.cylinder(x, 3, 67, 1.6, 6, 'rift', 5); this.banner(x, 65); }
      } else {
        this.buildExpedition();
      }
      for (let i = 0; i < 8; i++) this.cylinder((rnd() - .5) * s.w * .8, .14, (rnd() - .5) * s.h * .7, .8, .28, 'dark', 5);
      this.dressStage();
      this.mergeStatics();
    }
    buildExpedition() {
      // Expeditions use a connected, gate-free road network. Reserve the whole
      // route before dressing so scenery never interrupts a mission or convoy.
      const s=this.stage,points=s.points||[],main=points.slice(0,5);
      if(main.length>1)this.road(main,11);
      for(let i=5;i<points.length;i++) {
        let near=main.reduce((a,b)=>Math.hypot(b[0]-points[i][0],b[1]-points[i][1])<Math.hypot(a[0]-points[i][0],a[1]-points[i][1])?b:a,main[0]);
        if(near)this.road([near,points[i]],7);
      }
      for(let i=0;i<points.length;i++) {
        const [x,z]=points[i];
        // These ground markings aid orientation without new collision boxes.
        this.cylinder(x,.065,z,7.4,.08,this.landscape==='marsh'?'wood':'stone',12);
        for(const side of [-1,1]) {
          const px=x+side*19,pz=z+7;
          if(!this.safeDecor(px,pz,2.2))continue;
          this.banner(px,pz,i===0);this.lantern(px,pz+3);
        }
        for(const offset of [[-22,-10],[22,12],[-24,14],[24,-14]]) {
          const cx=x+offset[0],cz=z+offset[1];
          if(this.safeDecor(cx,cz,6)) {this.camp(cx,cz,i===0);break;}
        }
      }
      const edge=s.w*.5+17,back=s.h*.5+25;
      if(this.landscape==='coast') {
        this.box(s.w*.5+48,-.01,0,98,.08,s.h+80,'water');
        this.harborShip(edge+20,-29,1.15);this.harborShip(edge+39,41,.86);
        this.box(edge-9,.20,-28,28,.38,7,'wood');
        for(let z of [-31,-25])for(let x of [edge-21,edge-9,edge+4])this.cylinder(x,.65,z,.18,1.7,'wood',7);
        this.rock(edge-8,.7,back-35,5.0,'stone');
        this.beacon(edge-8,back-35,11);this.distantKeep(-37,back,.72);
      } else if(this.landscape==='marsh') {
        this.distantKeep(-42,back,.79,true);
        for(let x of [-28,-7,16,37]) {
          this.cylinder(x,3.2,back-2,.8,6.4,'stone',8);this.cylinder(x,6.5,back-2,1.1,.22,'dark',8);
          this.box(x,5.6,back-2,5.6,.8,1.5,'stone');
        }
        for(let z of [-54,9,62])this.marshPool(-edge+8,z,12);
      } else if(this.landscape==='desert') {
        this.desertSanctum(-35,back,1.05);this.desertSanctum(edge+5,33,.70);
        this.marshPool(-edge+8,-26,13);
        for(let j=0;j<6;j++)this.palm(-edge+8+Math.sin(j*2.4)*15,-26+Math.cos(j*2.4)*15,1.0+j%2*.2);
      } else if(this.landscape==='frost') {
        this.distantKeep(0,back,1.1,true);
        for(let x of [-edge,edge]) {
          this.ridge(x,14,19,37);this.crystalCluster(x-3,25,2.4,'ivory');
          for(let z of [-59,-21,47,80])this.conifer(x-7,z,1.5);
        }
      } else if(this.landscape==='volcanic'||this.landscape==='rift') {
        this.ridge(0,back+12,27,45);
        for(let side of [-1,1]) {
          this.crystalCluster(side*25,back-6,3.0,'rift');
          this.cylinder(side*14,8,back-2,2.3,16,'dark',8);
          this.cylinder(side*14,16.2,back-2,3.0,.45,'bronze',8);
        }
        this.box(0,.20,back-10,41,.38,7,'dark');
      } else {
        this.distantKeep(0,back,.90);
      }
    }
    harborShip(x,z,scale=1) {
      // Original eight-section cargo hull, kept outside the playable coast.
      const positions=[],indices=[],uvs=[],sections=8;
      for(let j=0;j<sections;j++) {
        const t=j/(sections-1),length=(t-.5)*17*scale,width=Math.sin(Math.PI*t)*2.9*scale+.16*scale;
        positions.push(-width,.44*scale,length,width,.44*scale,length,-width*.66,-.70*scale,length,width*.66,-.70*scale,length);
        uvs.push(0,t*5,1,t*5,0,t*5,1,t*5);
        if(j<sections-1){let n=j*4;indices.push(n,n+4,n+2,n+2,n+4,n+6,n+1,n+3,n+5,n+3,n+7,n+5,n+2,n+6,n+3,n+3,n+6,n+7,n,n+1,n+4,n+1,n+5,n+4);}
      }
      let mesh=new B.Mesh('original-coastal-cargo-hull',this.scene),v=new B.VertexData();
      v.positions=positions;v.indices=indices;v.uvs=uvs;v.normals=[];B.VertexData.ComputeNormals(positions,indices,v.normals);v.applyToMesh(mesh);
      mesh.position.set(x,.7,z);mesh.material=this.materials.wood;mesh.isPickable=false;mesh.freezeWorldMatrix();this.statics.push(mesh);
      this.box(x,1.20*scale,z,4.6*scale,.23*scale,11.5*scale,'wood');
      this.cylinder(x,5*scale,z,.13*scale,9*scale,'wood',8);
      this.box(x,8.3*scale,z,8*scale,.15*scale,.16*scale,'wood');
      this.box(x,6.2*scale,z+.10,6.8*scale,4.0*scale,.045*scale,'canvas');
      this.roof(x,1.5*scale,z+4.4*scale,4.4*scale,1.8*scale,4.1*scale);
      for(let j=0;j<3;j++)this.box(x+(j-1)*1.1*scale,1.8*scale,z-3*scale,.9*scale,1.0*scale,.9*scale,'wood');
    }
    beacon(x,z,height=10) {
      this.cylinder(x,height*.5,z,2.3,height,'stone',10);
      for(let y of [height*.25,height*.55,height*.85])this.cylinder(x,y,z,2.37,.25,'dark',10);
      this.cylinder(x,height+.20,z,2.8,.40,'stone',10);
      for(let j=0;j<6;j++){let a=j/6*Math.PI*2;this.cylinder(x+Math.sin(a)*2.25,height+1.3,z+Math.cos(a)*2.25,.11,2.0,'wood',6);}
      this.cylinder(x,height+1.4,z,.62,1.35,'flame',7);this.roof(x,height+2.4,z,6.2,2.5,6.2);
    }
    marshPool(x,z,r=5) {
      let pool=B.MeshBuilder.CreateDisc('still-scenic-water',{radius:r,tessellation:18,sideOrientation:B.Mesh.DOUBLESIDE},this.scene);
      pool.rotation.x=Math.PI/2;pool.position.set(x,.016,z);pool.scaling.y=.58;pool.material=this.materials.water;pool.isPickable=false;pool.freezeWorldMatrix();this.statics.push(pool);
      for(let j=0;j<5;j++){let a=j*2.4;this.reeds(x+Math.sin(a)*r*.88,z+Math.cos(a)*r*.48,.9);}
    }
    reeds(x,z,scale=1) {
      for(let j=0;j<5;j++) {
        let xx=x+Math.sin(j*2.4)*.5*scale,zz=z+Math.cos(j*2.4)*.4*scale,h=(.8+j%3*.24)*scale;
        this.cylinder(xx,h*.5,zz,.026*scale,h,'grass',5);this.cylinder(xx,h,zz,.055*scale,.22*scale,'bark',5);
      }
    }
    palm(x,z,scale=1) {
      this.cylinder(x,2.5*scale,z,.22*scale,5*scale,'bark',7);
      for(let j=0;j<7;j++) {
        let a=j/7*Math.PI*2,leaf=this.box(x+Math.sin(a)*1.1*scale,5.1*scale,z+Math.cos(a)*1.1*scale,.55*scale,.10*scale,3.5*scale,'leaf');
        leaf.unfreezeWorldMatrix();leaf.rotation.y=a;leaf.rotation.x=.28;leaf.freezeWorldMatrix();
      }
    }
    conifer(x,z,scale=1) {
      this.cylinder(x,2.2*scale,z,.20*scale,4.4*scale,'bark',7);
      for(let level=0;level<3;level++) {
        let m=B.MeshBuilder.CreateCylinder('snow-sheltered-conifer',{diameterTop:.05,diameterBottom:(3.3-level*.68)*scale,height:(2.7-level*.2)*scale,tessellation:8},this.scene);
        m.position.set(x,(2.0+level*1.12)*scale,z);m.material=this.materials.leaf;m.isPickable=false;m.freezeWorldMatrix();this.statics.push(m);
        let snow=B.MeshBuilder.CreateCylinder('original-conifer-snow-cap',{diameterTop:.03,diameterBottom:(3.3-level*.68)*.88*scale,height:(2.7-level*.2)*.94*scale,tessellation:8},this.scene);
        snow.position.set(x,(2.10+level*1.12)*scale,z);snow.material=this.materials.ivory;snow.isPickable=false;snow.freezeWorldMatrix();this.statics.push(snow);
      }
    }
    crystalCluster(x,z,scale=1,mat='rift') {
      for(let j=0;j<5;j++) {
        let a=j*2.399,h=(1.5+(j%3)*.65)*scale,m=B.MeshBuilder.CreateCylinder('original-faceted-crystal',{diameterTop:0,diameterBottom:.7*scale,height:h,tessellation:5},this.scene);
        m.position.set(x+Math.sin(a)*.8*scale,h*.5,z+Math.cos(a)*.8*scale);m.rotation.z=Math.sin(a)*.18;m.material=this.materials[mat];m.isPickable=false;m.freezeWorldMatrix();this.statics.push(m);
      }
    }
    desertSanctum(x,z,scale=1) {
      for(let level=0;level<4;level++)this.box(x,(level*3+1.5)*scale,z,(24-level*5)*scale,3*scale,(20-level*4)*scale,'stone');
      this.cylinder(x,14.5*scale,z,1.1*scale,5*scale,'bronze',6);
      for(const side of [-1,1]){this.cylinder(x+side*16*scale,4.6*scale,z-6*scale,1.2*scale,9.2*scale,'stone',8);this.cylinder(x+side*16*scale,9.4*scale,z-6*scale,1.7*scale,.4*scale,'gold',8);}
    }
    roof(x,y,z,w,h,d,mat='roof') {
      let m=new B.Mesh(mat==='canvas'?'field-canvas-tent':'swept-ceramic-roof',this.scene),v=new B.VertexData();
      if(mat==='canvas') {
        v.positions=[-w/2,0,-d/2,w/2,0,-d/2,0,h,-d/2,-w/2,0,d/2,w/2,0,d/2,0,h,d/2];
        v.indices=[0,2,1,3,4,5,0,3,5,0,5,2,2,5,4,2,4,1];v.uvs=[0,0,1,0,.5,1,0,0,1,0,.5,1];
      } else {
        // Upturned eaves and a bowed ridge create an East Asian fortress
        // silhouette. Split quad vertices retain crisp tile normals and UVs.
        const positions=[],indices=[],uvs=[],segments=12;
        const height=(t,q)=>h*((1-Math.abs(t))*(1-.35*Math.abs(t))+.25*Math.pow(Math.abs(t),6)+.065*Math.pow(Math.abs(q),6));
        const quad=(points,uv)=>{let n=positions.length/3;for(let p of points)positions.push(...p);uvs.push(...uv);indices.push(n,n+1,n+2,n,n+2,n+3);};
        for(let i=0;i<segments;i++) {
          let a=i/segments*2-1,b=(i+1)/segments*2-1;
          for(let j=0;j<4;j++) {
            let q=j/2-1,r=(j+1)/2-1;
            quad([[a*w/2,height(a,q),q*d/2],[a*w/2,height(a,r),r*d/2],[b*w/2,height(b,r),r*d/2],[b*w/2,height(b,q),q*d/2]],[(a+1)*w/4,(q+1)*d/4,(a+1)*w/4,(r+1)*d/4,(b+1)*w/4,(r+1)*d/4,(b+1)*w/4,(q+1)*d/4]);
          }
        }
        for(let side of [-1,1]) for(let i=0;i<segments;i++) {
          let a=i/segments*2-1,b=(i+1)/segments*2-1;
          const points=side>0?[[a*w/2,0,side*d/2],[b*w/2,0,side*d/2],[b*w/2,height(b,side),side*d/2],[a*w/2,height(a,side),side*d/2]]:[[b*w/2,0,side*d/2],[a*w/2,0,side*d/2],[a*w/2,height(a,side),side*d/2],[b*w/2,height(b,side),side*d/2]];
          quad(points,[0,0,1,0,1,1,0,1]);
        }
        v.positions=positions;v.indices=indices;v.uvs=uvs;
        let ridge=this.box(x,y+h+.08,z,.24,.16,d+.4,'dark');
        for(let end of [-1,1]) {
          this.cylinder(x,y+h+.19,z+end*(d*.5+.12),.18,.32,'bronze',8);
          // Warm under-eave trim reinforces the depth at gameplay distances.
          this.box(x,y+h*.20,z+end*d*.5,w*.97,.12,.16,'wood');
        }
      }
      v.normals=[];B.VertexData.ComputeNormals(v.positions,v.indices,v.normals);v.applyToMesh(m);
      m.position.set(x,y,z);m.material=this.materials[mat];m.isPickable=false;m.receiveShadows=true;m.freezeWorldMatrix();this.statics.push(m);return m;
    }
    rock(x, y, z, size = 1, mat = 'dark') {
      // Faceted erosion shapes share scenery batches rather than physics bodies.
      let m = B.MeshBuilder.CreatePolyhedron('weathered-rock', {type: 1, size}, this.scene);
      m.position.set(x,y,z); m.scaling.set(1.1,.55,.78); m.rotation.set(x*.37,z*.07,x*.12);
      m.material = this.materials[mat]; m.isPickable = false; m.freezeWorldMatrix(); this.statics.push(m); return m;
    }
    tree(x, z, scale = 1) {
      this.cylinder(x,1.7*scale,z,.25*scale,3.4*scale,'bark',7);
      this.cylinder(x,.12*scale,z,.39*scale,.24*scale,'bark',7);
      // Exposed roots make trunks meet the terrain, with no extra physics bodies.
      for(let j=0;j<4;j++) {
        let angle=j*Math.PI*.5+x*.27,root=this.cylinder(x+Math.sin(angle)*.39*scale,.075*scale,z+Math.cos(angle)*.39*scale,.085*scale,.78*scale,'bark',5);
        root.unfreezeWorldMatrix();root.rotation.x=Math.PI*.5-.13;root.rotation.y=angle;root.freezeWorldMatrix();
      }
      for (let j = 0; j < 3; j++) {
        let m = B.MeshBuilder.CreateSphere('windswept-canopy', {diameter: 2.9*scale,segments: 8}, this.scene);
        m.position.set(x + (j-1)*.9*scale, 3.8*scale+j*.3, z + Math.sin(j*3)*.65*scale);
        m.scaling.y = .78; m.material = this.materials.leaf; m.isPickable = false; m.freezeWorldMatrix(); this.statics.push(m);
      }
    }
    grassland() {
      // A deterministic tuft field uses opaque tapered blades, avoiding alpha
      // overdraw. Direct cell geometry caps this at 180 tufts / 3,780 triangles.
      const s=this.stage;if(s.training||['desert','frost','volcanic'].includes(this.landscape))return;
      let seed=STAGES.indexOf(s)*983+40719,rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const cells=new Map(),size=48,target=Math.min(180,Math.floor(s.w*s.h/110));
      let count=0;
      for(let attempt=0;attempt<900&&count<target;attempt++) {
        let x=(rand()-.5)*(s.w-14),z=(rand()-.5)*(s.h-14);
        if(!this.safeDecor(x,z,1.3))continue;
        count++;
        let cx=Math.floor(x/size),cz=Math.floor(z/size),key=cx+','+cz;
        if(!cells.has(key))cells.set(key,{x:(cx+.5)*size,z:(cz+.5)*size,positions:[],indices:[],uvs:[],colors:[]});
        let cell=cells.get(key);
        for(let blade=0;blade<7;blade++) {
          let angle=rand()*Math.PI*2,bx=x+(rand()-.5)*.72-cell.x,bz=z+(rand()-.5)*.72-cell.z;
          let height=.26+rand()*.36,width=.025+rand()*.025,bend=.08+rand()*.14,dx=Math.cos(angle),dz=Math.sin(angle),n=cell.positions.length/3;
          cell.positions.push(bx-dx*width,.02,bz-dz*width,bx+dx*width,.02,bz+dz*width,bx+dx*(bend+width*.42),height*.64,bz+dz*(bend+width*.42),bx+dx*(bend-width*.42),height*.64,bz+dz*(bend-width*.42),bx+dx*bend*1.5,height,bz+dz*bend*1.5);
          cell.indices.push(n,n+1,n+2,n,n+2,n+3,n+3,n+2,n+4);cell.uvs.push(0,0,1,0,1,.64,0,.64,.5,1);
          const tint=.78+rand()*.22;
          for(let v=0;v<5;v++) {let top=v>1?1.12:.66;cell.colors.push(.61*tint*top,.69*tint*top,.39*tint*top,1);}
        }
      }
      let material=new B.StandardMaterial('original-tapered-field-grass',this.scene);
      material.diffuseColor=s.night?new B.Color3(.55,.65,.74):B.Color3.White();material.specularColor=B.Color3.Black();material.backFaceCulling=false;material.maxSimultaneousLights=2;
      for(let cell of cells.values()) {
        let mesh=new B.Mesh('bounded-grass-cell',this.scene),v=new B.VertexData();
        v.positions=cell.positions;v.indices=cell.indices;v.uvs=cell.uvs;v.colors=cell.colors;v.normals=[];
        B.VertexData.ComputeNormals(v.positions,v.indices,v.normals);v.applyToMesh(mesh);mesh.position.set(cell.x,0,cell.z);mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;mesh.freezeWorldMatrix();
        this.grassBatches.push({mesh,x:cell.x,z:cell.z});
      }
    }
    gatehouse(x,z,alongX,top,length) {
      // Ceramic eaves sit above the authored guard walkway. Their clearance
      // leaves the existing gate opening and all collision paths intact.
      const start=this.statics.length;
      this.roof(x,top+1.6,z,6.8,2.4,length+2);
      if(alongX)for(let part of this.statics.slice(start)){
        const dx=part.position.x-x,dz=part.position.z-z;
        part.unfreezeWorldMatrix();part.position.x=x+dz;part.position.z=z-dx;part.rotation.y+=Math.PI/2;part.freezeWorldMatrix();
      }
      // Rotate the roof and its generated ridge/eave fittings together.
      this.cameraVolume(x,top+2.5,z,alongX?length+2:6.8,4.3,alongX?6.8:length+2);
      for(let side of [-1,1]) {
        const px=x+(alongX?side*(length*.43):0),pz=z+(alongX?0:side*(length*.43));
        this.box(px,top+.9,pz,.26,1.8,.26,'wood');
      }
    }
    cameraVolume(x,y,z,w,h,d) {this.cameraVolumes.push({x,z,w,d,top:y+h/2,bottom:y-h/2,open:false});}
    camp(x,z,ally=false) {
      this.cameraVolume(x,1.75,z,6.3,3.5,6.8);
      // Supply props stay away from capture discs and from escort/camera corridors.
      this.box(x, .18, z, 6.4, .36, 7, 'earth');
      this.roof(x, .36, z, 6, 3.2, 6.5, 'canvas');
      for (let side of [-1,1]) {
        this.cylinder(x + side*2.95,1.7,z-3.25,.065,3.4,'wood',6);
        let rope=this.box(x+side*3.25,.85,z-3.1,.05,2.1,.05,'ivory'); rope.unfreezeWorldMatrix();rope.rotation.z=side*.32;rope.freezeWorldMatrix();
      }
      this.box(x-4.2,.55,z+2,1.1,1.1,1.1,'wood');
      this.box(x-4.2,1.55,z+2,.8,.8,.8,'wood');
      this.cylinder(x-4.1,.55,z-.1,.47,1.1,'wood',10);
      this.banner(x+4.7,z+1.5,ally);
      if(this.safeDecor(x+9,z+2,2.4))this.supplyWagon(x+9,z+2);
      if(this.safeDecor(x-7,z-3,2))this.armoryRack(x-7,z-3,ally);
    }
    supplyWagon(x,z) {
      this.cameraVolume(x,1,z,3.2,2.0,2.4);
      this.box(x,.65,z,2.8,.24,1.65,'wood');
      for(let side of [-1,1]) {
        this.box(x+side*1.34,1.12,z,.14,.78,1.65,'wood');
        this.box(x,1.12,z+side*.77,2.8,.78,.14,'wood');
        for(let t of [-.85,.85]) {
          let wheel=this.cylinder(x+t,.5,z+side*.97,.48,.16,'dark',12);
          wheel.unfreezeWorldMatrix();wheel.rotation.x=Math.PI/2;wheel.freezeWorldMatrix();
          let hub=this.cylinder(x+t,.5,z+side*1.07,.11,.12,'bronze',8);
          hub.unfreezeWorldMatrix();hub.rotation.x=Math.PI/2;hub.freezeWorldMatrix();
        }
      }
      for(let t of [-.7,.5])this.cylinder(x+t,1.28,z,.38,.94,'wood',12);
      this.box(x+.8,1.18,z-.26,.6,.7,.65,'canvas');
      this.box(x,1.55,z,2.6,.12,.13,'metal');
      this.box(x-2.3,.55,z-.45,1.85,.10,.10,'wood');this.box(x-2.3,.55,z+.45,1.85,.10,.10,'wood');
    }
    armoryRack(x,z,ally) {
      for(let side of [-1,1])this.box(x+side*1.2,.8,z,.16,1.6,.32,'wood');
      this.box(x,1.2,z,2.6,.16,.22,'wood');
      for(let j=0;j<4;j++) {
        const t=x-.9+j*.6;
        let shaft=this.cylinder(t,1.2,z-.16,.045,2.4,'wood',6);shaft.unfreezeWorldMatrix();shaft.rotation.z=.13;shaft.freezeWorldMatrix();
        this.cylinder(t-.16,2.53,z-.16,.10,.31,'metal',4);
      }
      let shield=this.cylinder(x,1,z-.32,.50,.11,ally?'ally':'enemy',8);shield.unfreezeWorldMatrix();shield.rotation.x=Math.PI/2;shield.freezeWorldMatrix();
      let boss=this.cylinder(x,1,z-.41,.16,.13,'bronze',8);boss.unfreezeWorldMatrix();boss.rotation.x=Math.PI/2;boss.freezeWorldMatrix();
    }
    fieldWell(x,z) {
      this.cylinder(x,.45,z,1.25,.90,'stone',12);
      this.cylinder(x,.92,z,1.33,.16,'dark',12);
      this.cylinder(x,1.015,z,1.03,.025,'water',12);
      for(const side of [-1,1])this.box(x+side*1.3,1.85,z,.16,2.0,.18,'wood');
      this.box(x,2.7,z,2.85,.20,.24,'wood');this.roof(x,2.82,z,3.4,.75,2.8);
      this.cylinder(x+.30,2.13,z,.10,.68,'wood',7);this.box(x+.30,1.67,z,.045,.7,.045,'ivory');
      this.cylinder(x+1.8,.26,z+.6,.24,.52,'wood',8);this.cameraVolume(x,1.7,z,3.4,3.4,2.8);
    }
    siegeBallista(x,z,ally=false) {
      // Original field artillery is scenery. Its compact footprint is chosen
      // only after reserving objective discs, escort routes and wall openings.
      this.box(x,.62,z,2.5,.23,2.1,'wood');this.box(x,1.0,z,1.2,.7,1.0,'wood');
      this.box(x,1.54,z,4.8,.17,.22,'wood');this.box(x,1.45,z+.45,.25,.21,3.4,'wood');
      for(const side of [-1,1]) {
        let wing=this.box(x+side*1.98,1.52,z+.37,1.05,.15,.18,'wood');wing.unfreezeWorldMatrix();wing.rotation.y=side*.63;wing.freezeWorldMatrix();
        let wheel=this.cylinder(x+side*1.43,.57,z,.57,.17,'dark',12);wheel.unfreezeWorldMatrix();wheel.rotation.z=Math.PI/2;wheel.freezeWorldMatrix();
        this.box(x+side*1.06,.94,z+.5,.11,.85,.13,'metal');
        this.box(x+side*.89,.87,z-.6,.3,.28,.8,ally?'ally':'enemy');
      }
      this.box(x,1.62,z+.42,.075,.075,3.35,'metal');this.cylinder(x,1.70,z+2.13,.14,.4,'metal',4);
      this.box(x,1.56,z-.01,4.35,.03,.045,'ivory');this.cameraVolume(x,1.0,z,5.0,2.0,4.2);
    }
    distantKeep(x,z,scale=1,night=false) {
      // Background landmarks are outside playable bounds: they cannot block missions.
      this.box(x,5*scale,z,22*scale,10*scale,12*scale,night?'dark':'stone');
      this.roof(x,10*scale,z,24*scale,6*scale,14*scale);
      for (let side of [-1,1]) {
        this.tower(x+side*14*scale,z-3*scale,3.5*scale,15*scale);
        this.roof(x+side*14*scale,16*scale,z-3*scale,8*scale,7*scale,8*scale);
      }
      this.cylinder(x,23*scale,z,1.8*scale,10*scale,'dark',8);
      this.roof(x,28*scale,z,5*scale,6*scale,5*scale);
    }
    ridge(x,z,r,h) {
      // Three eroded rings form irregular peaks rather than repeated cone props.
      let mesh=new B.Mesh('layered-distant-ridgeline',this.scene),v=new B.VertexData(),positions=[],indices=[],uvs=[];
      const n=12;
      for(let ring=0;ring<4;ring++) for(let j=0;j<n;j++) {
        let a=j/n*Math.PI*2,noise=Math.sin(j*2.7+x*.13+z*.05)*.17+Math.cos(j*1.3+z*.08)*.09;
        let radius=r*[1,.75,.39,.10][ring]*(1+noise),height=h*[0,.28,.65,.95][ring];
        positions.push(Math.cos(a)*radius,height*(1+noise*.7)-2,Math.sin(a)*radius*.65);uvs.push(j/n*5,ring*1.7);
        if(ring<3){let k=ring*n+j,next=ring*n+(j+1)%n;indices.push(k,k+n,next,next,k+n,next+n);}
      }
      let apex=positions.length/3;positions.push(r*.07,h-2,-r*.03);uvs.push(2.5,6.8);
      for(let j=0;j<n;j++)indices.push(3*n+j,apex,3*n+(j+1)%n);
      // Babylon uses left-handed winding. Outward faces keep mountains solid
      // from the battlefield, instead of exposing a few inward-facing shards.
      for(let j=0;j<indices.length;j+=3)[indices[j+1],indices[j+2]]=[indices[j+2],indices[j+1]];
      v.positions=positions;v.indices=indices;v.uvs=uvs;v.normals=[];B.VertexData.ComputeNormals(positions,indices,v.normals);v.applyToMesh(mesh);
      mesh.position.set(x,0,z);mesh.rotation.y=x*.17;mesh.material=this.materials.dark;mesh.isPickable=false;mesh.freezeWorldMatrix();this.statics.push(mesh);
      this.rock(x+r*.3,h*.18,z-r*.12,r*.38,'dark');
    }
    safeDecor(x,z,r=5) {
      if (app.collision.blocked(x,z,r)) return false;
      for(let p of this.stage.points||[]) if(Math.hypot(p[0]-x,p[1]-z)<14+r) return false;
      for(let road of this.roads) for(let j=1;j<road.points.length;j++) {
        let a=road.points[j-1],b=road.points[j],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
        if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<road.width*.5+r) return false;
      }
      return true;
    }
    dressTraining() {
      for(let x of [-17,17]) {this.camp(x,-11,true);this.lantern(x,-2);}
      for(let z of [-14,-6,2,10]) for(let x of [-21,21]) this.box(x,1,z,.14,1.3,1.2,'dark');
      this.distantKeep(0,64,.72);
      for(let x of [-42,-29,29,42]) this.tree(x,34,1.2);
    }
    dressStage() {
      let s=this.stage,night=s.night,stage=STAGES.indexOf(s);
      // Edge landscapes frame routes; uniform procedural scatter never enters objectives.
      for(let j=0;j<12;j++) {
        let side=j%2?-1:1,x=side*(s.w*.50+10+(j%3)*5),z=(j/12-.5)*s.h*1.15;
        if(this.landscape==='coast'&&side>0)continue;
        this.ridge(x,z,10+(j%3)*5,17+(j%4)*6);
      }
      let seed=stage*167+3491,rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      for(let j=0;j<100;j++) {
        let x=(rand()-.5)*(s.w-18),z=(rand()-.5)*(s.h-14);
        if(!this.safeDecor(x,z,3)) continue;
        if(j%7===0) {
          if(this.landscape==='desert'||this.landscape==='coast')this.palm(x,z,.7+rand()*.5);
          else if(this.landscape==='frost')this.conifer(x,z,.8+rand()*.45);
          else if(this.landscape==='volcanic')this.crystalCluster(x,z,.45+rand()*.50,'dark');
          else this.tree(x,z,.7+rand()*.5);
        } else if(this.landscape==='marsh'&&j%9===0&&this.safeDecor(x,z,6))this.marshPool(x,z,3+rand()*3);
        else if(this.landscape==='volcanic'&&j%9===0)this.crystalCluster(x,z,.7,'rift');
        else if(j%3===0) this.rock(x,.2,z,.5+rand()*.9,this.landscape==='frost'?'ivory':'dark');
        else {
          let patch=B.MeshBuilder.CreateDisc('terrain-variation',{radius:2+rand()*3,tessellation:9,sideOrientation:B.Mesh.DOUBLESIDE},this.scene);
          patch.rotation.x=Math.PI/2;patch.position.set(x,.012,z);patch.scaling.y=.65;patch.material=this.materials.grass;patch.isPickable=false;patch.receiveShadows=true;patch.freezeWorldMatrix();this.statics.push(patch);
        }
      }
      if(stage===0) {
        this.distantKeep(20,s.h/2+24,.85);
        this.camp(-63,-28,true);this.camp(37,-20,false);this.camp(46,43,false);
        // Guard walkways, coping and gate parapet build an inhabited fortress silhouette.
        this.box(0,6.8,8,24,.55,5,'stone');this.cameraVolume(0,6.8,8,24,.55,5);
        for(let x of [-5,0,5]) this.box(x,7.35,8,1.4,.7,5,'stone');
        this.gatehouse(0,8,true,7.65,24);
        for(let x of [-40,-24,24,40]) {
          this.box(x,3.0,5.75,1.4,4.9,.4,'stone');this.box(x,1.3,6.0,.22,1.3,.025,'shadow');
        }
        this.banner(-11,8);this.banner(10,8);this.banner(-35,32);this.banner(34,32);
        // Supply racks and a ruined arch at the side of the advance.
        for(let j=0;j<4;j++) this.box(-33+j*.6,1.8,-23,.16,3.6,.17,'wood');
        this.box(-32,2.7,-23,3,.18,.25,'wood');
        this.tower(67,48,3,9);this.tower(67,64,3,7);this.box(67,6.8,56,4,.8,15,'stone');
        if(this.safeDecor(-72,-14,3))this.fieldWell(-72,-14);
        if(this.safeDecor(56,-35,4))this.siegeBallista(56,-35,false);
      } else if(stage===1) {
        this.distantKeep(82,68,.75,true);
        for(let x of [-83,-58,-22,6,52,82]) this.lantern(x,x<0?-21:3);
        this.camp(-51,-25,true);this.camp(9,26,false);
        // Moonlit cliffs, supported bridge towers and a firelit gate canopy.
        for(let x of [-50,-22,10,31]) {this.ridge(x,-52,14,18+(x%3)*3);this.ridge(x,55,12,21);}
        this.box(43,7.0,-10,5,.6,27,'dark');this.cameraVolume(43,7.0,-10,5,.6,27);
        this.gatehouse(43,-10,false,7.6,27);
        for(let z of [-23,3]) {this.lantern(39,z);this.banner(43,z);}
        for(let x of [-10,7,24,61]) {this.cylinder(x,2.2,-28,.85,4.4,'stone',8);this.cylinder(x,4.6,-28,1.15,.35,'stone',8);}
        if(this.safeDecor(-62,18,3))this.fieldWell(-62,18);
        if(this.safeDecor(67,23,4))this.siegeBallista(67,23,false);
      } else if(stage===2) {
        this.distantKeep(0,113,1.35);
        for(let side of [-1,1]) {
          this.camp(side*34,-51,side<0);this.camp(side*36,22,side<0);
          for(let z of [-7,7,24,37]) {this.box(side*53.9,4,z,.5,6.5,1.5,'stone');this.box(side*53.5,4,z,.025,1.4,.22,'shadow');}
          // The Rift Crown rises behind the boss courtyard without stealing playable space.
          this.cylinder(side*20,10,83,2.0,20,'stone',10);this.cylinder(side*20,20.1,83,2.6,.8,'bronze',10);
          this.roof(side*20,20.5,83,6,7,6,'roof');this.banner(side*23,78);
          for(let z of [-13,42]) this.banner(side*15,z);
        }
        for(let z of [-13,42]) {
          this.box(0,7.6,z,29,.5,5,'stone');this.cameraVolume(0,7.6,z,29,.5,5);
          for(let x of [-10,-5,0,5,10]) this.box(x,8.1,z,1.6,.65,5,'stone');
          this.gatehouse(0,z,true,8.4,29);
        }
        for(let x of [-7,7]) {this.cylinder(x,.18,67,1.4,.36,'bronze',10);this.cylinder(x,6,81,.6,12,'rift',8);}
        for(const side of [-1,1])if(this.safeDecor(side*50,-52,4))this.siegeBallista(side*50,-52,side<0);
        if(this.safeDecor(-30,12,3))this.fieldWell(-30,12);
      } else {
        // Theatre props remain outside the reserved roads and capture grounds.
        // A bounded set of village detail gives each advance a lived-in scale.
        for(let j=0;j<10;j++) {
          const x=(rand()-.5)*(s.w-30),z=(rand()-.5)*(s.h-24);
          if(!this.safeDecor(x,z,4.5))continue;
          if(this.landscape==='desert') {
            this.cylinder(x,1.9,z,.75,3.8,'stone',8);this.cylinder(x,3.9,z,1.05,.26,'bronze',8);
            this.rock(x+2,.35,z-1,1.3,'stone');
          } else if(this.landscape==='marsh') {
            this.reeds(x,z,1.3);this.tree(x+2,z-2,1.0);this.box(x,.07,z,4,.12,2.0,'wood');
          } else if(this.landscape==='frost') {
            this.crystalCluster(x,z,.8,'ivory');this.rock(x+2,.3,z-1,1.2,'dark');
          } else if(this.landscape==='volcanic') {
            this.box(x,.035,z,4,.05,.35,'rift');this.box(x+1,.035,z+.9,.45,.05,2.4,'rift');this.rock(x-.9,.3,z-1,1.5,'dark');
          } else {
            this.armoryRack(x,z,j%2===0);this.cylinder(x+2,.4,z+.5,.4,.8,'wood',10);
          }
        }
      }
      this.grassland();
    }
    mergeStatics() {
      // Keep gameplay-owned meshes alive; merge static material/cell groups for crowd draw budget.
      let groups = new Map(), gates = new Set(app.collision.gates.map(g => g.mesh));
      for (let m of this.statics) {
        if (gates.has(m) || m.metadata?.keepSeparate || m.name === 'capture' || m.name === 'mark') continue;
        let key = Math.floor(m.position.x / 28) + ',' + Math.floor(m.position.z / 28) + ',' + m.material.name;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
      }
      for (let list of groups.values()) if (list.length > 1) {
        let merged = B.Mesh.MergeMeshes(list, true, true, undefined, false, false);
        if (merged) { merged.isPickable = false; merged.receiveShadows = list.some(m => m.receiveShadows); merged.freezeWorldMatrix(); }
      }
    }
  }

  // Pose channels use the same transform hierarchy for the champion, officers and
// thin-instanced soldiers. No crowd member owns a Babylon skeleton or meshes.
class CharacterAnimator {
  constructor() {
    this.keys = ['hips','spine','neck','head','upperArmL','forearmL','handL','upperArmR','forearmR','handR','thighL','shinL','footL','thighR','shinR','footR','cape','weaponRoot'];
    this.aliases = ['pelvis','torso','neck','head','armL','elbowL','handL','armR','elbowR','handR','legL','kneeL','footL','legR','kneeR','footR','cape','weaponRoot'];
    this.target=new Float32Array(54);
    // Original reusable keyframed clips. Normalized phases 0-.45 wind-up,
    // .45-.80 contact, .80-1 recovery are fitted to authoritative move timing.
    // Channels: torso pitch/twist, leading/trailing knee, hip pitch, body sink.
    this.clips={
      slash:[[0,-.03,0,.12,.12,0,0],[.26,.08,-.65,.24,.16,-.04,-.03],[.45,-.08,-.50,.27,.14,0,-.025],[.80,-.13,.75,.18,.24,0,-.025],[1,-.03,0,.12,.12,0,0]],
      thrust:[[0,-.02,0,.12,.12,0,0],[.33,.06,-.28,.35,.13,-.05,-.04],[.45,-.10,-.10,.29,.12,0,-.025],[.80,-.17,.23,.13,.28,.05,-.04],[1,-.02,0,.12,.12,0,0]],
      launcher:[[0,-.04,0,.12,.12,0,0],[.30,-.34,-.40,.60,.31,-.10,-.14],[.45,-.25,-.22,.51,.25,-.08,-.10],[.80,.14,.54,.08,.16,.10,.045],[1,-.04,0,.12,.12,0,0]],
      control:[[0,-.04,0,.12,.12,0,0],[.32,.11,-.42,.31,.22,-.04,-.06],[.45,-.14,-.12,.41,.14,.02,-.07],[.80,-.25,.24,.17,.36,.06,-.08],[1,-.04,0,.12,.12,0,0]],
      sweep:[[0,-.03,0,.12,.12,0,0],[.30,.05,-.95,.34,.22,-.08,-.07],[.45,-.11,-.75,.36,.23,0,-.06],[.80,-.20,1.10,.23,.38,.08,-.08],[1,-.03,0,.12,.12,0,0]],
      overhead:[[0,-.03,0,.12,.12,0,0],[.34,.18,-.16,.20,.20,-.06,-.015],[.45,-.35,.13,.48,.36,.06,-.11],[.80,-.32,.24,.36,.27,.03,-.10],[1,-.03,0,.12,.12,0,0]],
      finisher:[[0,-.04,0,.12,.12,0,0],[.35,.20,-.55,.23,.21,-.08,-.02],[.45,-.39,.40,.58,.35,.06,-.15],[.80,-.28,.75,.34,.25,.02,-.10],[1,-.04,0,.12,.12,0,0]],
      air:[[0,-.15,0,.75,.42,0,-.02],[.32,-.23,-.70,.93,.57,-.12,-.05],[.45,-.29,-.40,.87,.48,0,-.04],[.80,-.08,.85,.48,.80,.08,-.02],[1,-.15,0,.75,.42,0,-.02]]
    };
    this.clipSample=new Float32Array(6);this.poseClipNames=Object.keys(this.clips);
    this.ik = {target:new B.Vector3(), shoulder:new B.Vector3(), end:new B.Vector3(), elbow:new B.Vector3(), direction:new B.Vector3(), bend:new B.Vector3(), cross:new B.Vector3(), temp:new B.Vector3(), inverse:new B.Matrix(), parentInverse:new B.Matrix(), desired:new B.Matrix(), local:new B.Matrix(), scale:new B.Vector3(), handPosition:new B.Vector3(), q:new B.Quaternion(), unit:new B.Vector3(0,-1,0)};
  }
  styleOf(actor) {
    const index=typeof actor.hero==='number'?actor.hero:-1;
    return index>=0?(typeof HEROES!=='undefined'?HEROES[index]?.style:undefined)??(index===4?1:index===5?0:index):-1;
  }
  heroKey(actor) {
    const style=this.styleOf(actor),id=actor.heroId||actor.type||'raider';
    return style>=0?['kareth','seyra','nivara','torvek'][style]||'kareth':id==='daeron'?'seyra':id==='maelis'||id==='oriel'?'kareth':(typeof TYPES!=='undefined'?TYPES[id]?.archetype:undefined)||id;
  }
  makeState(actor) {
    return {id:actor.id??null,identity:actor.hero??actor.heroId??actor.type??null,gen:actor.gen||0, x:actor.x||0,z:actor.z||0,phase:(actor.id||0)*1.71, speed:0, pose:new Float32Array(54), initialized:false, deathAge:0,dead:false,bob:0,rootPitch:0,rootRoll:0,rootTurn:0,attackId:-1,lod:0};
  }
  // Sampling does not depend on app. Preview scenes can use precisely this API.
  sample(actor, dt, t, state) {
    dt = Math.max(0,Math.min(.1,dt||0));
    const target = this.target;
    target.fill(0);
    const dx=(actor.x||0)-state.x,dz=(actor.z||0)-state.z,travel=Math.hypot(dx,dz);
    state.x=actor.x||0;state.z=actor.z||0;
    // Only displacement advances the gait. A pressed stick against a wall does
    // not animate walking, and fixed-step motion is measured across render gaps.
    let speed=dt>0?Math.min(12,travel/dt):0;
    const dead=actor.dead||actor.hp<=0||actor.state==='Dead';
    if(dead) speed=0;
    state.speed+=(speed-state.speed)*(dt>0?1-Math.exp(-dt*18):0);
    if(travel<.001) state.speed*=Math.exp(-dt*22);
    state.phase+=Math.min(.32,travel)*5.1;
    const gait=Math.min(1,state.speed/4.5), phase=state.phase, step=Math.sin(phase), opposite=-step;
    if(travel>.001) {
      const yaw=actor.yaw||0;state.forward=(dx*Math.sin(yaw)+dz*Math.cos(yaw))/travel;state.strafe=(dx*Math.cos(yaw)-dz*Math.sin(yaw))/travel;
    }
    const forward=state.forward??1,strafe=state.strafe||0;
    const breath=Math.sin(t*2.5+(actor.id||0))*.012;
    let rootPitch=0,rootRoll=0,rootTurn=0,bob=breath,spearPitch=1.14;
    const put=(i,x=0,y=0,z=0)=>{target[i*3]=x;target[i*3+1]=y;target[i*3+2]=z;};
    const hero=this.heroKey(actor);
    const sprint=actor.state==='Sprint',stride=gait*(sprint?.82:.58);
    // Knees bend only during the swing half. Opposite ankle compensation keeps
    // the support foot flat; pelvis sway is small enough to preserve collision.
    put(10,step*stride*forward,0,.025*gait+step*stride*strafe);put(13,opposite*stride*forward,0,-.025*gait+opposite*stride*strafe);
    put(11,Math.max(0,-step)*gait*.92);put(14,Math.max(0,-opposite)*gait*.92);
    put(12,-target[30]*.55-target[33]*.45);put(15,-target[39]*.55-target[42]*.45);
    put(0,0,0,step*gait*.025);put(1,-gait*(sprint?.15:.07),step*gait*.035,0);
    put(4,-opposite*gait*.30*forward-.12,0,-.12);put(5,-.24-gait*.15);
    put(7,-step*gait*.30*forward-.18,0,.13);put(8,-.32-gait*.15);put(9,1.08,0,-.48);
    put(16,.10+gait*.26+Math.sin(t*3+phase)*.04,step*gait*.08,0);
    bob+=Math.abs(Math.sin(phase*2))*gait*.035;
    // A two-handed ready pose carries the spear or axe in front of the body.
    if(hero==='seyra'||hero==='pike'||hero==='sentinel'||hero==='azrakan') {
      put(7,-.95,0,.13);put(8,-.55);put(9,2.5);put(4,-1.08,0,-.22);put(5,-.55);put(6,2.45);
    } else if(hero==='torvek'||hero==='odran'||hero==='warcaller') {
      put(7,-.65,0,.32);put(8,-.68);put(9,1.30);put(4,-.87,0,-.30);put(5,-.7);
      put(1,-.05-gait*.08,0,0);put(10,target[30],0,.1);put(13,target[39],0,-.1);
    } else if(hero==='nivara'||hero==='duelist') {
      put(7,-.35-step*gait*.32,0,.30);put(8,-.7);put(9,1.3,0,-.55);put(4,-.35+step*gait*.32,0,-.30);put(5,-.7);put(6,1.3,0,.55);
      put(1,-gait*.15,step*gait*.06);put(10,target[30],0,.05);put(13,target[39],0,-.05);
    } else if(hero==='shield') {
      put(4,-.87,0,-.30);put(5,-.80);put(6,1.19);put(7,-.30-step*gait*.2,0,.20);
    } else if(hero==='archer') {
      put(4,-.80,0,-.22);put(5,-.48);put(6,1.28);put(7,-.68,0,.22);put(8,-1.1);
    }
    const stateName=actor.state||'Idle';
    if(stateName==='Guard'||stateName==='ParryCounter') {
      put(1,-.10,.15);put(4,-1.10,0,-.42);put(5,-.93);put(7,-.95,0,.40);put(8,-.87);put(9,.38);
      put(10,-.13,0,.11);put(11,.27);put(13,.16,0,-.11);put(14,.2);bob-=.05;
    }
    if(stateName==='HeavyCharge') {
      const c=Math.min(1,actor.charge||actor.stateTime||0);
      put(1,-.08,-.48,-.08);put(7,-1.55,0,.72);put(8,-1.1);put(9,.15);
      put(4,-1.05,0,-.32);put(5,-1.0);put(10,-.18,0,.14);put(11,.35);put(13,.1,0,-.14);put(14,.35);
      bob-=.1+c*.025;rootRoll=-.03;
      if(hero==='seyra') {put(7,-1.02,0,.32);put(8,-.64);put(9,3.10);put(1,-.14,-.30);spearPitch=.70;}
    }
    let attack=actor.attack;
    // NPC telegraphs use their authoritative Windup / Attack / Recover timers.
    if(!attack&&(stateName==='Windup'||stateName==='Attack'||stateName==='Recover')) {
      const wind=actor.windDuration||(typeof TYPES!=='undefined'&&TYPES[actor.type]?TYPES[actor.type].wind:.8);
      const recovery=actor.elite?(actor.type==='odran'?1.5:actor.type==='azrakan'?1.25:.85):.65;
      const time=stateName==='Windup'?Math.max(0,wind-(actor.timer||0)):stateName==='Attack'?wind+.18-(actor.timer||0):wind+.18+recovery-(actor.timer||0);
      attack={time,start:wind,end:wind+.18,duration:wind+.18+recovery,kind:actor.pattern==='sweep'?'heavy':'light',motion:actor.pattern==='sweep'?'sweep':actor.type==='pike'?'thrust':'overhead',chain:(actor.attackID||0)%3+1,skill:-1};
    }
    if(attack&&!dead) {
      const a=attack,start=Math.max(.025,a.start||.1),end=Math.max(start+.02,a.end||.22),duration=Math.max(end+.025,a.duration||.36),time=Math.max(0,a.time||0);
      const anticipation=Math.min(1,time/start),active=Math.min(1,Math.max(0,(time-start)/(end-start))),recovery=Math.min(1,Math.max(0,(time-end)/(duration-end)));
      const smooth=v=>v*v*(3-2*v);
      const wind=smooth(Math.min(1,anticipation/.58)),strike=time<start?smooth(Math.max(0,(anticipation-.58)/.42)):1,release=1-smooth(recovery);
      // Combat resolves its first pulse at start. The last 42% of anticipation
      // therefore brings the blade into contact at start; the active window is
      // restrained follow-through, then recovery. Damage timing is unchanged.
      const blend=(rest,pre,hit)=>time<start?(anticipation<.58?rest+(pre-rest)*wind:pre+(hit-pre)*strike):(hit+(hit-pre)*Math.sin(active*Math.PI)*.10)*release+rest*(1-release);
      const combo=a.poseIndex||a.comboIndex||a.chain||1,heavy=a.kind==='heavy',skill=a.kind==='skill',ultimate=a.kind==='ultimate';
      const side=combo%2?1:-1;
      const finish=typeof a.finishPose==='boolean'?a.finishPose:typeof HEROES!=='undefined'&&typeof actor.hero==='number'?combo===(HEROES[actor.hero]?.chain||4):combo%3===0;
      let twist=blend(0,-.65*side,.72*side),shoulderX=blend(-.2,-1.30,-.95),shoulderZ=blend(.12,.88*side,-.76*side),elbow=blend(-.32,-.85,-.22),wrist=blend(1.08,.35,1.32);
      if(hero==='seyra'||hero==='pike'||hero==='sentinel'||hero==='azrakan') {
        // Thrust: elbow extends during the exact damage interval. Sweep/final
        // strikes rotate the torso while preserving both grips on the shaft.
        const sweep=heavy||finish||skill&&a.skill===1||ultimate;
        spearPitch=blend(1.14,.64,sweep?1.23:1.54);
        shoulderX=blend(-.95,-.48,-1.54);elbow=blend(-.55,-1.03,-.12);wrist=blend(2.5,2.62,3.11);
        shoulderZ=blend(.13,.34,sweep?-.58:.02);twist=blend(0,sweep?-.85:-.22,sweep?.98:.25);
        if(ultimate) {twist=Math.sin(active*Math.PI*6)*.45*release;shoulderX=blend(-.95,-1.8,-1.2);}
        put(4,shoulderX,0,-.12);put(5,-.50);put(6,2.6);
      } else if(hero==='torvek'||hero==='odran'||hero==='warcaller') {
        const overhead=heavy||finish||skill&&a.skill===0||ultimate;
        shoulderX=blend(-.65,overhead?-2.48:-1.42,overhead?-.18:-.80);
        shoulderZ=blend(.32,overhead?.32:.92,overhead?.16:-.66);elbow=blend(-.68,-.84,-.22);wrist=blend(1.3,overhead?1.68:.9,overhead?.80:1.22);
        twist=blend(0,overhead?-.22:-.70,overhead?.18:.65);
        put(4,shoulderX*.85,0,-.28);put(5,-.7);put(1,blend(-.05,.19,-.37),twist,0);
        bob-=Math.sin(active*Math.PI)*.085*release;
      } else if(hero==='nivara'||hero==='duelist') {
        const orbit=skill&&a.skill===1||ultimate;
        const alternation=orbit?Math.sin(active*Math.PI*(ultimate?12:6)):side;
        shoulderX=blend(-.35,-1.24,-.64);shoulderZ=blend(.30,.8*alternation,-.78*alternation);elbow=blend(-.7,-1.04,-.26);
        put(4,blend(-.35,-.60,-1.26),0,-shoulderZ);put(5,blend(-.7,-.24,-1.1));put(6,blend(0,-.20,.28));
        if(orbit) {twist=Math.sin(active*Math.PI*6)*.75*release;rootTurn=active*Math.PI*2*release;}
        put(1,-.14,twist,-.06*side);
      } else if(hero==='archer') {
        put(4,blend(-.80,-1.54,-1.45),-.14,-.07);put(5,blend(-.48,-.08,-.14));put(6,1.57);
        shoulderX=blend(-.68,-1.40,-1.1);shoulderZ=blend(.22,.82,.4);elbow=blend(-1.1,-1.9,-.5);wrist=.2;twist=blend(0,-.3,.2);
      } else {
        // Kareth's chain alternates horizontal cuts, an ascending cut and a
        // planted finishing overhead; heavy and dawn skills read differently.
        if(heavy||finish||skill&&a.skill===0||ultimate) {
          shoulderX=blend(-.2,-2.30,-.25);shoulderZ=blend(.12,.34,.13);elbow=blend(-.32,-.92,-.22);wrist=blend(1.08,.2,.92);twist=blend(0,-.32,.4);
        } else if(combo%4===3) {shoulderX=blend(-.2,-.18,-1.95);shoulderZ=blend(.12,.64,-.2);elbow=blend(-.32,-.42,-.34);}
        put(4,blend(-.12,-.85,-.50),0,blend(-.12,-.28,-.18));put(5,-.7);
      }
      put(7,shoulderX,0,shoulderZ);put(8,elbow);put(9,wrist);
      if(hero!=='torvek'&&hero!=='odran'&&hero!=='warcaller'&&hero!=='nivara'&&hero!=='duelist') put(1,blend(-.04,.06,-.12),twist,-.025*side);
      put(0,0,-twist*.15,0);
      put(10,blend(-.08,-.17,-.32),0,.12);put(11,blend(.10,.30,.28));put(13,blend(.06,.15,.12),0,-.12);put(14,.16);
      if(skill&&a.skill===1&&hero==='kareth') {put(7,-1.10,0,.45);put(8,-.90);put(4,-1.06,0,-.5);put(5,-.95);put(1,-.06);}
      if(skill&&a.skill===1&&hero==='torvek') {put(7,-.76,0,.40);put(8,-.8);put(1,-.22);}
      if(ultimate) {bob+=Math.sin(active*Math.PI)*.05*release;put(16,.45,Math.sin(active*Math.PI*5)*.12);}
      if(a.motion&&this.clips[a.motion]) {
        const phase=time<start?Math.min(1,time/start)*.45:time<=end?.45+active*.35:.80+recovery*.20;
        const pose=this.sampleClip(a.motion,phase),handed=a.side||side,weight=hero==='torvek'?1.20:hero==='seyra'?.70:hero==='nivara'?.90:1;
        put(1,pose[0]*weight,pose[1]*handed*(hero==='seyra'?.78:1),hero==='nivara'?-.075*handed:0);
        put(0,pose[4],-target[4]*.15,hero==='torvek'?.025*handed:0);
        put(11,pose[2]*weight);put(14,pose[3]*weight);bob+=pose[5]*weight;
        if(a.motion==='launcher') {put(7,blend(-.3,-.24,-1.86),0,blend(.2,.52,-.15)*handed);put(8,blend(-.4,-.9,-.22));}
        if(a.motion==='control') {put(7,blend(-.3,-.95,-1.15),0,.18);put(8,blend(-.4,-1.3,-.12));put(4,blend(-.15,-1.05,-1.27),0,-.3);put(5,blend(-.4,-1.05,-.37));}
        if(a.motion==='sweep') {put(7,blend(-.3,-1.5,-1.1),0,blend(.2,.65,-.7)*handed);put(8,blend(-.4,-.66,-.2));}
        if(a.motion==='air') {put(10,-.95,0,.18);put(13,.22,0,-.20);put(4,-1.2,0,-.48);put(5,-.42);rootPitch=-.11;}
        if(hero==='nivara'&&(a.motion==='sweep'||a.motion==='finisher')&&a.geometry?.shape==='sweep'&&Math.abs(a.geometry.to-a.geometry.from)>5)rootTurn=active*Math.PI*2*handed*release;
        state.clipName=a.motion;state.clipPhase=phase;
      }
    }
    if(stateName==='Launch'||((actor.y||0)>.15&&!attack&&stateName!=='Dodge')) {
      put(1,.22,0,-.12);put(10,-.65,0,.23);put(11,.92);put(13,.32,0,-.22);put(14,.70);put(7,-.45,0,.8);put(8,-.65);put(4,-.25,0,-.8);put(5,-.8);rootPitch=.15;
    }
    if(stateName==='Knockdown') {
      rootPitch=-1.37;rootRoll=.14;bob=-.02;put(1,.25);put(10,-.22,0,.23);put(11,.7);put(13,.2,0,-.2);put(14,.44);put(7,-.1,0,.75);put(8,-.55);put(4,-.2,0,-.67);put(5,-.8);
    }
    if(stateName==='Recover'&&!attack&&!dead) {
      const recovering=Math.max(0,Math.min(1,(actor.timer||.16)/.4));put(1,-.22*recovering);put(10,-.30*recovering,0,.12);put(11,.60*recovering);put(13,.12*recovering,0,-.12);put(14,.35*recovering);bob-=.11*recovering;
    }
    if(stateName==='Dodge') {
      const v=Math.min(1,(actor.stateTime||0)/.38),roll=Math.sin(v*Math.PI);
      rootPitch=-.63*roll;rootRoll=(hero==='nivara'?.24:.08)*roll;bob-=.22*roll;
      put(1,-.5*roll,0,0);put(10,-.9*roll);put(11,1.15*roll);put(13,.6*roll);put(14,.85*roll);put(7,-.7,0,.38);put(8,-.8);put(4,-.6,0,-.38);put(5,-.8);
    }
    if(stateName==='Stagger'||stateName==='React'||actor.flinch>0||actor.reactionTime>0) {
      const reaction=actor.reactionTime>0?Math.min(1,actor.reactionTime/(actor.reactionDuration||.28)):actor.flinch>0?Math.min(1,actor.flinch/.16):.7;
      const direction=(actor.hitYaw??actor.yaw??0)-(actor.yaw||0),front=Math.cos(direction),sideHit=Math.sin(direction);
      put(1,.25*reaction*front,-.08*reaction*sideHit,-.16*reaction*sideHit);put(0,.12*reaction*front);put(7,-.5,0,.4);put(8,-.9);put(4,-.4,0,-.4);put(5,-.8);rootPitch=.10*reaction*front;rootRoll=-.07*reaction*sideHit;
    }
    // Two-handed weapons are carried across the body. Rear grips are positioned
    // on the real shaft and kept within both arm chains' reach through attacks.
    if(['seyra','pike','sentinel','azrakan','torvek','odran'].includes(hero)) target[23]=-.90;
    const shieldHero=actor.hero===5||actor.hero===10||['maelis','oriel'].includes(actor.heroId)||['maelis','oriel'].includes(actor.type);
    if(shieldHero&&!dead) {put(4,-.91,0,-.30);put(5,-.83);put(6,1.14);}
    if(hero==='shield') target[18]=-.48-target[12]-target[15];
    if(dead) {
      if(!state.dead) state.deathAge=0;
      state.deathAge=typeof actor.deathTime==='number'?Math.max(actor.deathTime,actor.renderDeathTime||0):state.deathAge+dt;
      const death=Math.min(1,state.deathAge/(actor.deathDuration||.6)),ease=death*death*(3-2*death);
      rootPitch=-1.42*ease;rootRoll=((actor.id||0)%2?.18:-.18)*ease;bob=-.045*ease;
      put(1,.35*ease);put(10,-.20*ease,0,.20);put(11,.82*ease);put(13,.1*ease,0,-.20);put(14,.42*ease);put(7,-.15*ease,0,.70*ease);put(8,-.5*ease);put(4,.1*ease,0,-.6*ease);put(5,-.65*ease);
    }
    if(actor.mounted&&!dead) {
      // Mounted hips stay planted on the saddle while attacks retain their arm channels.
      const ride=Math.min(1,state.speed/9),horsePhase=actor.mountPhase??state.phase,rideBob=Math.sin(horsePhase*2)*.027*ride;
      put(0,-.07,0,0);put(10,-.64,0,.56);put(13,-.64,0,-.56);put(11,.96);put(14,.96);put(12,-.20);put(15,-.20);
      if(!attack) {put(1,-.08-ride*.08,0,0);put(4,-.82,0,-.18);put(5,-.97);put(6,1.13);put(7,-.37,0,.23);put(8,-.67);put(9,1.12,0,-.35);}
      bob=rideBob-.055;rootPitch=0;rootRoll=-Math.min(.035,ride*.035)*(state.strafe||0);rootTurn=0;
      put(16,.18+ride*.25,Math.sin(horsePhase)*.06,0);
    }
    state.dead=!!dead;
    const blendRate=attack?40:dead?24:16,contact=attack&&attack.time>=attack.start&&attack.time<=attack.end;
    const alpha=state.initialized?(contact&&dt>0?1:1-Math.exp(-dt*blendRate)):1;
    for(let i=0;i<54;i++) state.pose[i]+=(target[i]-state.pose[i])*alpha;
    const rootAlpha=state.initialized?1-Math.exp(-dt*20):1;
    state.bob+=(bob-state.bob)*rootAlpha;state.rootPitch+=(rootPitch-state.rootPitch)*rootAlpha;state.rootRoll+=(rootRoll-state.rootRoll)*rootAlpha;state.rootTurn+=(rootTurn-state.rootTurn)*rootAlpha;
    state.spearPitch=state.spearPitch===undefined?spearPitch:state.spearPitch+(spearPitch-state.spearPitch)*alpha;
    state.initialized=true;
    return state;
  }
  sampleClip(name,phase) {
    const frames=this.clips[name]||this.clips.slash,out=this.clipSample;
    let a=frames[0],b=frames[frames.length-1];
    for(let i=1;i<frames.length;i++)if(phase<=frames[i][0]){a=frames[i-1];b=frames[i];break;}
    let blend=Math.max(0,Math.min(1,(phase-a[0])/Math.max(.0001,b[0]-a[0])));blend=blend*blend*(3-2*blend);
    for(let i=0;i<6;i++)out[i]=a[i+1]+(b[i+1]-a[i+1])*blend;
    return out;
  }
  update(rig,actor,dt,t=0) {
    let state=rig.animationState;
    const identity=actor.hero??actor.heroId??actor.type??null;
    if(!state||state.gen!==(actor.gen||0)||state.id!==(actor.id??null)||state.identity!==identity) {
      // A recycled actor must never inherit the previous occupant's death pose,
      // cached IK quaternions or hidden root. Euler writes do not reset a quaternion.
      if(state) rig.reset?.();
      for(const node of Object.values(rig.nodes||{})) node.rotationQuaternion=null;
      state=rig.animationState=this.makeState(actor);
    }
    this.sample(actor,dt,t,state);
    rig.root.position.set(actor.x||0,(actor.y||0)+(actor.mounted?(actor.mountHeight||1.14):0)+state.bob,actor.z||0);
    rig.root.rotationQuaternion=null;rig.root.rotation.set(state.rootPitch,(actor.yaw||0)+state.rootTurn,state.rootRoll);
    const joints=rig.joints||rig.nodes;
    for(let i=0;i<this.keys.length;i++) {
      const node=joints[this.keys[i]]||rig.nodes?.[this.aliases[i]];
      if(!node) continue;
      node.rotationQuaternion=null;
      const bind=rig.bindPose?.[node.name]||rig.bindPose?.[this.aliases[i]]||rig.bindPose?.[this.keys[i]];
      node.rotation.set((bind?.rotation?.x||0)+state.pose[i*3],(bind?.rotation?.y||0)+state.pose[i*3+1],(bind?.rotation?.z||0)+state.pose[i*3+2]);
    }
    const hero=this.heroKey(actor);
    if(rig.nodes.capeMid) {
      const gait=Math.min(1,state.speed/5),pulse=actor.attack?Math.sin(Math.min(1,actor.attack.time/actor.attack.duration)*Math.PI):0;
      rig.nodes.capeMid.rotation.set(.05+gait*.14+Math.sin(t*3.6+state.phase)*.055+pulse*.11,Math.sin(t*2.3+state.phase)*.045,0);
      rig.nodes.capeEnd.rotation.set(.09+gait*.18+Math.sin(t*4.1+state.phase-.6)*.075+pulse*.15,Math.sin(t*2.6+state.phase-1)*.055,0);
      rig.nodes.hair.rotation.set(-.035+gait*.07+Math.sin(t*2.9+state.phase)*.045,Math.sin(t*2.1+state.phase)*.065,0);
    }
    if(!state.dead) {
      if(rig.hero>=0)this.driveWeapon(rig,actor,state);
      else if(['pike','sentinel','azrakan'].includes(hero))this.steerSpear(rig,actor,state);
      if(rig.offhandGrip&&rig.twoHanded!==false&&['kareth','seyra','torvek','pike','sentinel','azrakan','odran'].includes(hero)) {
        rig.offhandGrip.position.y=hero==='kareth'?(actor.attack?.geometry?.shape==='slam'?-.27:-.125):-.20;this.solveOffhand(rig,'L');
      }
    }
    this.syncBounds(rig);
    return state;
  }
  syncBounds(rig) {
    rig.root.computeWorldMatrix(true);
    for(const mesh of rig.bodyMeshes||[]) {
      // Local authored bounds remain cheap, but their world centre must follow
      // the actor. Freezing this sync caused bodies to vanish away from origin.
      mesh.doNotSyncBoundingInfo=false;mesh.computeWorldMatrix(true);
      mesh.getBoundingInfo().update(mesh.getWorldMatrix());
    }
  }
  driveWeapon(rig,actor,state) {
    const a=actor.attack,hero=this.styleOf(actor),geometry=a?.geometry,w=this.ik,twoHand=rig.twoHanded??(hero===0||hero===1||hero===3);
    if(!geometry&&!twoHand)return;
    let yaw=0,elevation=hero===1?.43:.62,x=.12,y=hero===3?1.25:1.31,z=.30,weight=1;
    if(geometry) {
      const start=Math.max(.01,a.start),end=Math.max(start+.01,a.end),duration=Math.max(end+.01,a.duration),time=a.time;
      const active=Math.max(0,Math.min(1,(time-start)/(end-start))),anticipation=Math.max(0,Math.min(1,time/start)),recovery=Math.max(0,Math.min(1,(time-end)/(duration-end))),ease=v=>v*v*(3-2*v);
      let phase=a.pulsePhase??active,from=geometry.from||0,to=geometry.to||0;
      if(a.reversePulses&&(a.pulse||0)%2){const swap=from;from=to;to=swap;}
      yaw=from+(to-from)*(time<start?0:phase);
      x=.035+Math.sin(yaw)*.32;y=hero===3?1.20:1.31;z=Math.cos(yaw)*.32;
      elevation=a.motion==='launcher'?-.52+ease(active)*1.25:a.motion==='air'?.05:.03;
      if(geometry.shape==='thrust') {
        const extension=time<start?-.11*(1-ease(anticipation)):.17*Math.sin(active*Math.PI);
        x=.12;y=hero===1?1.34:1.29;z=.29+extension;
        if(a.motion==='control'){y=1.13;z=.36+extension;elevation=-.20;}
        if(a.motion==='overhead'){elevation=time<start?1.22-(1.85*ease(Math.max(0,(anticipation-.56)/.44))):-.63-.12*active;y=1.32;}
      }
      if(geometry.shape==='slam') {
        // The wind-up completes at contact start: the real tip strikes ground
        // ahead of the hero, where combat emits its visible impact shockwave.
        const stroke=ease(Math.max(0,(anticipation-.48)/.52));
        elevation=time<start?1.18-stroke*2.25:-1.07-.08*active;
        x=.10;y=time<start?1.62-stroke*.68:.94;z=time<start?.20+stroke*.23:.43;
      }
      if(a.motion==='sweep'||a.motion==='finisher'&&geometry.shape==='sweep')y=hero===3?1.14:1.29;
      if(time>end) {const relax=ease(recovery);yaw*=1-relax;elevation=elevation*(1-relax)+(hero===1?.43:.62)*relax;x=x*(1-relax)+.12*relax;y=y*(1-relax)+1.30*relax;z=z*(1-relax)+.30*relax;}
      weight=time<start?ease(Math.min(1,anticipation/.34)):1;
      state.weaponYaw=yaw;state.weaponElevation=elevation;state.weaponPhase=phase;
    }
    // Riding cuts lean the blade down beside the saddle: a reachable grip at
    // chest height lets the real tip strike infantry instead of passing overhead.
    if(actor.mounted&&geometry) {y-=.28;elevation-=.34;}
    // Grip trajectories stay inside anatomical arm reach. Both arm surfaces
    // deform around their elbows rather than detaching hands to fake grips.
    rig.root.computeWorldMatrix(true);rig.nodes.handR.computeWorldMatrix(true);
    w.handPosition.copyFrom(rig.nodes.handR.getAbsolutePosition());
    const facing=actor.yaw||0,cosFacing=Math.cos(facing),sinFacing=Math.sin(facing);
    w.temp.set((actor.x||0)+x*cosFacing+z*sinFacing,(actor.y||0)+(actor.mounted?(actor.mountHeight||1.14):0)+state.bob+y,(actor.z||0)+z*cosFacing-x*sinFacing);
    w.temp.subtractInPlace(w.handPosition).scaleInPlace(weight).addInPlace(w.handPosition);
    rig.root.getWorldMatrix().invertToRef(w.inverse);B.Vector3.TransformCoordinatesToRef(w.temp,w.inverse,w.temp);
    rig.attackGripTarget.position.copyFrom(w.temp);this.solveOffhand(rig,'R',rig.attackGripTarget);
    // The authored blade tip can be offset from its shaft (axe/curved blades).
    // Offset compensation keeps that real point on the combat arc's angle.
    const tip=rig.weaponTip.position,yawOffset=Math.atan2(tip.x,tip.y*Math.cos(elevation));
    this.orientWeaponHand(rig,'R',(actor.yaw||0)+yaw-yawOffset,Math.PI/2-elevation,rig.weaponRoot.rotation.x||.48);
    if(geometry?.shape==='slam'&&a.time>=a.start) {
      // Match the actual floor rather than burying the blade during body sink.
      rig.weaponRoot.computeWorldMatrix(true);const height=rig.weaponRoot.getAbsolutePosition().y-(actor.y||0)-.035;
      elevation=-Math.asin(Math.max(-.98,Math.min(.98,height/Math.max(.1,tip.y))));
      this.orientWeaponHand(rig,'R',(actor.yaw||0)+yaw-Math.atan2(tip.x,tip.y*Math.cos(elevation)),Math.PI/2-elevation,rig.weaponRoot.rotation.x||.48);
      state.weaponElevation=elevation;
    }
    if(hero===2&&geometry) {
      let leftPhase=Math.max(0,(a.pulsePhase??Math.max(0,Math.min(1,(a.time-a.start)/(a.end-a.start))))-.12),leftFrom=geometry.from||0,leftTo=geometry.to||0;
      if(a.reversePulses&&(a.pulse||0)%2){const swap=leftFrom;leftFrom=leftTo;leftTo=swap;}
      const angleL=geometry.shape==='thrust'?yaw-.10:leftFrom+(leftTo-leftFrom)*leftPhase,lx=-.035+Math.sin(angleL)*.31,lz=Math.cos(angleL)*.31;
      w.temp.set((actor.x||0)+lx*cosFacing+lz*sinFacing,(actor.y||0)+(actor.mounted?(actor.mountHeight||1.14):0)+state.bob+1.25-(actor.mounted?.28:0),(actor.z||0)+lz*cosFacing-lx*sinFacing);rig.root.getWorldMatrix().invertToRef(w.inverse);B.Vector3.TransformCoordinatesToRef(w.temp,w.inverse,w.temp);rig.attackGripTarget.position.copyFrom(w.temp);this.solveOffhand(rig,'L',rig.attackGripTarget);
      this.orientWeaponHand(rig,'L',(actor.yaw||0)+angleL-Math.atan2(rig.offhandTip.position.x,rig.offhandTip.position.y*Math.cos(elevation)),Math.PI/2-elevation,.48);
    }
  }
  orientWeaponHand(rig,side,yaw,pitch,bindPitch) {
    const hand=rig.nodes['hand'+side],w=this.ik;hand.parent.computeWorldMatrix(true);hand.parent.getWorldMatrix().invertToRef(w.inverse);
    B.Matrix.RotationYawPitchRollToRef(yaw,pitch,0,w.desired);B.Matrix.RotationYawPitchRollToRef(0,-bindPitch,0,w.local);
    w.local.multiplyToRef(w.desired,w.desired);w.desired.multiplyToRef(w.inverse,w.local);w.local.decompose(w.scale,w.q,w.temp);
    hand.rotationQuaternion=hand._weaponQuaternion||(hand._weaponQuaternion=new B.Quaternion());hand.rotationQuaternion.copyFrom(w.q);
  }
  steerSpear(rig,actor,state) {
    const hand=rig.nodes.handR,w=this.ik;
    hand.parent.computeWorldMatrix(true);hand.parent.getWorldMatrix().invertToRef(w.inverse);
    B.Matrix.RotationYawPitchRollToRef((actor.yaw||0)+state.pose[4]*.28,state.spearPitch||1.14,0,w.desired);
    B.Matrix.RotationYawPitchRollToRef(0,-(rig.bindPose?.weaponRoot?.rotation.x||.48),0,w.local);
    w.local.multiplyToRef(w.desired,w.desired);w.desired.multiplyToRef(w.inverse,w.local);w.local.decompose(w.scale,w.q,w.temp);
    hand.rotationQuaternion=hand._weaponQuaternion||(hand._weaponQuaternion=new B.Quaternion());hand.rotationQuaternion.copyFrom(w.q);
  }
  solveOffhand(rig,side='L',explicitTarget=null) {
    const n=rig.nodes||{},j=rig.joints||{},upper=j['upperArm'+side]||n['arm'+side],elbow=j['forearm'+side]||n['elbow'+side],hand=j['hand'+side]||n['hand'+side],target=explicitTarget||rig.offhandGrip;
    if(!upper||!elbow||!hand||!target) return;
    const w=this.ik,parent=upper.parent;
    rig.root.computeWorldMatrix(true);target.computeWorldMatrix(true);parent.computeWorldMatrix(true);
    parent.getWorldMatrix().invertToRef(w.parentInverse);
    B.Vector3.TransformCoordinatesToRef(target.getAbsolutePosition(),w.parentInverse,w.target);
    w.shoulder.copyFrom(upper.position);w.direction.copyFrom(w.target).subtractInPlace(w.shoulder);
    const l1=elbow.position.length(),l2=hand.position.length(),d=Math.max(.02,Math.min(l1+l2-.006,w.direction.length()));
    if(w.direction.lengthSquared()<.000001) w.direction.copyFrom(w.unit);else w.direction.normalize();
    // A stable pole keeps the elbow outside the torso instead of flipping at
    // near-extension. This is a two-bone solve, not a detached secondary hand.
    w.bend.set(side==='L'?-1:1,-.2,-.35);
    const dot=B.Vector3.Dot(w.bend,w.direction);
    w.temp.copyFrom(w.direction).scaleInPlace(dot);w.bend.subtractInPlace(w.temp);
    if(w.bend.lengthSquared()<.000001) {w.bend.set(0,0,1);w.temp.copyFrom(w.direction).scaleInPlace(B.Vector3.Dot(w.bend,w.direction));w.bend.subtractInPlace(w.temp);}
    w.bend.normalize();
    const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(.00001,l1*l1-along*along));
    w.elbow.copyFrom(w.direction).scaleInPlace(along);w.temp.copyFrom(w.bend).scaleInPlace(height);w.elbow.addInPlace(w.temp).addInPlace(w.shoulder);
    w.temp.copyFrom(w.elbow).subtractInPlace(w.shoulder).normalize();
    this.alignDown(w.temp,upper);
    upper.computeWorldMatrix(true);upper.getWorldMatrix().invertToRef(w.inverse);
    B.Vector3.TransformCoordinatesToRef(target.getAbsolutePosition(),w.inverse,w.end);
    w.end.subtractInPlace(elbow.position).normalize();this.alignDown(w.end,elbow);
    hand.rotation.set(0,0,0);
  }
  alignDown(direction,node) {
    const w=this.ik,dot=B.Vector3.Dot(w.unit,direction);
    if(dot<-.9999) w.q.set(1,0,0,0);
    else {B.Vector3.CrossToRef(w.unit,direction,w.cross);w.q.set(w.cross.x,w.cross.y,w.cross.z,1+dot);w.q.normalize();}
    if(!node.rotationQuaternion) node.rotationQuaternion=node._ikQuaternion||(node._ikQuaternion=new B.Quaternion());
    node.rotationQuaternion.copyFrom(w.q);
  }
}

  /* Original authored warrior meshes. Y up; faces and breastplates look +Z.
     Heroes and officers use shared weighted body geometry and linked armatures;
     crowds batch fitted joint geometry. Surface maps are generated locally and
     shared. No remote assets, decoders, or per-frame mesh creation are needed. */
  class CharacterFactory {
    constructor(scene, mats = {}) {
      this.scene = scene;
      this.mats = mats;
      this.cache = new Map();
      this.materialCache = new Map();
      this.textureCache = new Map();
      this.boneNames = ['pelvis','torso','neck','head','armL','elbowL','handL','armR','elbowR','handR','legL','kneeL','footL','legR','kneeR','footR','cape','capeMid','capeEnd','hair'];
      this.boneIndex = new Map(this.boneNames.map((name,index)=>[name,index]));
      this.serial = 0;
    }
    appearance(hero) {
      return [null,null,null,null,null,null,
        {base:0,crest:'jade',weapon:'saber'},
        {base:2,crest:'moon',weapon:'twins'},
        {base:1,crest:'sun',weapon:'sunSpear'},
        {base:3,crest:'frost',weapon:'frostAxe'},
        {base:5,crest:'ember',weapon:'ward'},
        {base:2,crest:'storm',weapon:'daggers'}][hero] || null;
    }
    palette(faction, hero, identity='') {
      const colors = {
        skin:'#c39877',dark:'#1e2931',steel:'#556d7c',edge:'#bfd0d4',
        leather:'#342724',trim:'#c6a063',gold:'#d7ad67',wood:'#745746',ivory:'#e4e2d6',eyes:'#39645c',hair:'#252b34',mouth:'#916057',
        cloth: faction ? '#a8493e' : '#3ba898', lining: faction ? '#522e35' : '#234b5a'
      };
      const heroColors=['#176b61','#d0c59a','#564272','#863d26','#185082','#b6333d','#28694a','#909fb9','#bd8131','#567f8e','#962f2d','#35567a'];
      if (hero >= 0) {
        const index=Math.max(0,Math.min(heroColors.length-1,hero|0));
        colors.cloth = heroColors[index];
        colors.lining = ['#123c3c','#425948','#29213d','#342425','#172f48','#eee0c5','#213f35','#39465e','#68451d','#263f51','#f0cdb0','#182937'][index];
        colors.skin = ['#d4aa83','#deb995','#cfad98','#ba8969','#c7a17d','#e3b59c','#bd916e','#d8bda3','#ac7b54','#dcb9a2','#bd916e','#c8a98d'][index];
        colors.hair = ['#202623','#222326','#16151d','#442d21','#131d2a','#6b3025','#273128','#c3c4c8','#33291e','#b5a790','#48251f','#101c27'][index];
        colors.eyes = ['#405744','#655839','#675877','#614a30','#285877','#667253','#3d7455','#547796','#8c6532','#568c9d','#856348','#498ba7'][index];
        colors.steel = ['#537171','#839483','#695f7d','#65595b','#627f99','#929895','#4f776c','#a7b9c7','#8e7657','#849fae','#74686a','#5a758f'][index];
        colors.gold = ['#d4b366','#d7bc82','#c1a16e','#c49658','#d0bc86','#d6aa72','#d2b776','#d5d9df','#e6c36d','#d2e1e5','#daab68','#afd5e0'][index];
        colors.trim = colors.gold;
        if(index===4) {colors.ivory='#d6e6e7';colors.edge='#d2e5e6';}
        if(index===5) {colors.ivory='#f2ead8';colors.edge='#e3e1d0';}
        if(index>=6)colors.edge=['#b9d5c8','#e1edf1','#efe3bc','#dceff2','#e8d1bb','#c4e5f1'][index-6];
      } else {
        const officerColors={valkora:['#683858','#263249','#d7b386'],mirelord:['#537447','#2b473a','#a5bf7d'],sandwarden:['#b18a44','#65462b','#e4c787'],frostthane:['#547d99','#294654','#d9edf0'],cindermarshal:['#9b4638','#3e2d39','#e4aa75']};
        const variant=officerColors[identity];
        if(variant){colors.cloth=variant[0];colors.lining=variant[1];colors.gold=colors.trim=variant[2];}
      }
      return colors;
    }
    // All artwork is original and authored here. Small deterministic microdetail
    // maps share one allocation per surface class; no remote image or decoder.
    surfaceTexture(kind, normal=false) {
      const key=kind+(normal?'-normal':'-albedo');
      if(this.textureCache.has(key)) return this.textureCache.get(key);
      const size=256,pixels=new Uint8Array(size*size*4);
      for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
        const offset=(y*size+x)*4,noise=Math.sin(x*127.1+y*311.7)*43758.5453,grain=noise-Math.floor(noise);
        const weave=(x%4===0?1:0)+(y%4===0?1:0),brocade=Math.sin(x*.20+Math.sin(y*.10)*2)*Math.sin(y*.16+Math.sin(x*.085)*1.6);
        if(normal) {
          pixels[offset]=128+Math.round((grain-.5)*(kind==='fabric'?10:4)+(kind==='fabric'?brocade*3:0));
          pixels[offset+1]=128+Math.round((weave-1)*(kind==='fabric'?8:3));pixels[offset+2]=254;
        } else {
          const value=kind==='metal'?245+grain*9-(y%53===0?7:0)-(x%97===0?4:0):kind==='skin'?249+grain*5:239+grain*11-weave*4+brocade*4;
          pixels[offset]=pixels[offset+1]=pixels[offset+2]=Math.round(value);
        }
        pixels[offset+3]=255;
      }
      const texture=B.RawTexture.CreateRGBATexture(pixels,size,size,this.scene,true,false,B.Texture.TRILINEAR_SAMPLINGMODE);
      texture.name='original warrior '+key;texture.wrapU=texture.wrapV=B.Texture.WRAP_ADDRESSMODE;
      texture.uScale=texture.vScale=kind==='skin'?2:5;
      this.textureCache.set(key,texture);return texture;
    }
    material(key, faction, hero) {
      const colors=this.palette(faction,hero),neutral=['matte','metallic','flesh'].includes(key),cacheKey=neutral?key:key+':'+colors[key];
      if(this.materialCache.has(cacheKey)) return this.materialCache.get(cacheKey);
      const metal=['steel','edge','gold','metallic'].includes(key);
      const m=new B.PBRMaterial('warrior-'+cacheKey,this.scene);
      m.albedoColor=neutral?B.Color3.White():B.Color3.FromHexString(colors[key]||colors.steel);
      m.metallic=metal?.84:0;m.roughness=metal?.32:key==='flesh'?.70:.86;
      if(metal&&m.clearCoat){m.clearCoat.isEnabled=true;m.clearCoat.intensity=.22;m.clearCoat.roughness=.36;}
      m.environmentIntensity=metal?.82:.45;m.directIntensity=1;
      m.albedoTexture=this.surfaceTexture(metal?'metal':key==='flesh'?'skin':'fabric');
      if(key==='matte'||key==='metallic') m.bumpTexture=this.surfaceTexture(metal?'metal':'fabric',true);
      // Cloth capes expose both sides. Metal and anatomy retain useful culling.
      m.backFaceCulling=key!=='matte';m.useVertexColors=true;
      if(key==='gold') m.emissiveColor=m.albedoColor.scale(.025);
      // Existing crowd color baking reads diffuseColor; the actual material is PBR.
      m.diffuseColor=m.albedoColor;
      this.materialCache.set(cacheKey,m);return m;
    }
    create(id, options = {}) {
      return this.build(id, options.faction || 0, options.detail !== false);
    }
    build(id = 0, faction = 0, detail = true) {
      const heroIds = typeof HEROES!=='undefined'?HEROES.map(h=>h.id):['kareth','seyra','nivara','torvek','daeron','maelis','valen','lyss','sahir','brynja','oriel','riven'];
      const hero = typeof id === 'number' ? Math.max(0, Math.min(heroIds.length-1, id | 0)) : heroIds.indexOf(id);
      const identity = hero >= 0 ? heroIds[hero] : String(id || 'raider');
      const type = hero>=0?identity:(typeof TYPES!=='undefined'?TYPES[identity]?.archetype:undefined)||identity;
      const shapeHero=this.appearance(hero)?.base??hero;
      const boss = ['odran', 'azrakan'].includes(type);
      const heavy = shapeHero === 3 || boss || type === 'sentinel';
      const slim = shapeHero === 1 || shapeHero === 2 || shapeHero === 5 || type === 'duelist' || type === 'archer';
      const officer = boss || ['captain', 'commander', 'sentinel', 'duelist', 'warcaller'].includes(type);
      const armLength = heavy ? .37 : .33;
      const forearmLength = heavy ? .33 : .31;
      const width=heavy?.355:slim?.248:.295;
      const prefix = 'warrior-' + type + '-' + (++this.serial);
      const root = new B.TransformNode(prefix, this.scene);
      const nodes = {}, meshes = [], parts = [];
      const node = (name, parent, x, y, z) => {
        const n = new B.TransformNode(prefix + '-' + name, this.scene);
        n.parent = parent;
        n.position.set(x || 0, y || 0, z || 0);
        nodes[name] = n;
        return n;
      };
      const pelvis = node('pelvis', root, 0, 1.02, 0);
      const torso = node('torso', pelvis, 0, .16, 0);
      const neck = node('neck', torso, 0, .48, .01);
      const head = node('head', neck, 0, .055, 0);
      for (const side of ['L', 'R']) {
        const sign = side === 'L' ? -1 : 1;
        const arm = node('arm' + side, torso, sign * width, .39, 0);
        const elbow = node('elbow' + side, arm, 0, -armLength, 0);
        node('hand' + side, elbow, 0, -forearmLength, .008);
        const leg = node('leg' + side, pelvis, sign * (heavy ? .19 : .15), -.025, 0);
        const knee = node('knee' + side, leg, 0, -.43, 0);
        node('foot' + side, knee, 0, -.43, .008);
      }
      const cape = node('cape', torso, 0, .36, -.18);
      node('capeMid',cape,0,-.34,-.08);node('capeEnd',nodes.capeMid,0,-.34,-.08);
      node('hair',head,0,.18,-.10);node('attackGripTarget',root,.12,1.3,.30);
      const mainHand = type === 'archer' ? 'L' : 'R';
      const weaponRoot = node('weaponRoot', nodes['hand' + mainHand], 0, -.045, .025);
      const weaponTip = node('weaponTip', weaponRoot, 0, 1.16, 0);
      const offhandRoot = node('offhandRoot', nodes.handL, 0, -.045, .025);
      const offhandTip = node('offhandTip', offhandRoot, 0, .72, 0);
      const offhandGrip = node('offhandGrip', weaponRoot, 0, -.20, 0);
      // The upright blade tilts forward from the knuckles rather than running
      // through the forearm in the hanging idle pose. Animation preserves this
      // bind offset while steering the wrists and articulated arms.
      if (type !== 'archer') weaponRoot.rotation.x = .48;
      offhandRoot.rotation.x = .48;
      const joints = {
        hips: pelvis, spine: torso, chest: torso, neck, head,
        upperArmL: nodes.armL, forearmL: nodes.elbowL, handL: nodes.handL,
        upperArmR: nodes.armR, forearmR: nodes.elbowR, handR: nodes.handR,
        thighL: nodes.legL, shinL: nodes.kneeL, footL: nodes.footL,
        thighR: nodes.legR, shinR: nodes.kneeR, footR: nodes.footR
      };
      const bindPose = {};
      for (const [name, n] of Object.entries(nodes)) bindPose[name] = {position: n.position.clone(), rotation: n.rotation.clone()};
      const cacheKey = identity + ':' + (detail ? 1 : 0) + ':' + faction;
      let template = this.cache.get(cacheKey);
      if (!template) {
        template = this.geometry(identity, hero, faction, detail, heavy, slim, officer, width, armLength, forearmLength);
        this.cache.set(cacheKey, template);
      }
      for (const part of template.parts) {
        const m = new B.Mesh(prefix + '-' + part.joint + '-' + part.mat, this.scene);
        part.geometry.applyToMesh(m);
        m.parent = nodes[part.joint];
        m.material = this.material(part.mat, faction, hero);
        m.isPickable = false;
        m.useVertexColors = true;
        m.hasVertexAlpha = false;
        m.alwaysSelectAsActiveMesh = false;
        m.metadata = {joint: part.joint, materialKey: part.mat, characterPart: true, equipment: part.joint === 'weaponRoot' || part.joint === 'offhandRoot'};
        meshes.push(m);
        parts.push({m, joint: part.joint, material: part.mat, name: part.joint + '-' + part.mat});
      }
      weaponTip.position.copyFromFloats(...template.tip);
      offhandTip.position.copyFromFloats(...template.offhandTip);
      offhandGrip.position.copyFromFloats(...template.grip);
      const rig = {
        root, nodes, joints, meshes, parts, bindPose, type:identity, archetype:type, hero, faction,
        equipmentMeshes: meshes.filter(m => m.metadata.equipment),
        bodyMeshes: meshes.filter(m => !m.metadata.equipment),
        weaponRoot,weaponTip,weaponGrip:weaponRoot,attackGripTarget:nodes.attackGripTarget,offhandGrip, offhandRoot, offhandTip, cape,
        mainHand, armLength, forearmLength, shoulderWidth: width,
        twoHanded: [0,1,3,4].includes(shapeHero)||['pike','sentinel','azrakan','odran'].includes(type),
        weaponLength: template.weaponLength, triangleCount: template.triangleCount,
        drawCount: meshes.length,
        reset() {
          for (const [name, p] of Object.entries(bindPose)) {
            nodes[name].rotationQuaternion=null;
            nodes[name].position.copyFrom(p.position);
            nodes[name].rotation.copyFrom(p.rotation);
          }
          weaponTip.position.copyFromFloats(...template.tip);
          offhandTip.position.copyFromFloats(...template.offhandTip);
          offhandGrip.position.copyFromFloats(...template.grip);
        },
        dispose() { root.dispose(false, false);if(this.skeleton){this.skeleton.dispose();this.skeleton=null;} }
      };
      if(detail) this.skinRig(rig,template);
      return rig;
    }
    skinWeights(joint,material,x,y,z,armLength,forearmLength) {
      const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
      const index=name=>this.boneIndex.get(name)??this.boneIndex.get('handR');
      const pair=(a,b,w)=>[index(a),1-w,index(b),w];
      const flexible=['skin','cloth','lining','leather','dark','trim'].includes(material);
      if(joint==='head'&&material==='hair'&&y<.20)return pair('head','hair',smooth((.20-y)/.35));
      if(joint==='cape') {
        if(y<-.34) return pair('capeMid','capeEnd',smooth((-y-.34)/.5));
        return pair('cape','capeMid',smooth(-y/.45));
      }
      if(!flexible) return pair(joint,joint,0);
      if(joint==='pelvis'&&y<.045) return pair('pelvis',x<0?'legL':'legR',smooth((-.015-y)/.44)*Math.min(.75,Math.abs(x)*4));
      if(joint==='torso') return pair('pelvis','torso',smooth((y+.12)/.27));
      if(joint==='head'&&y<-.045) return pair('neck','head',smooth((y+.145)/.12));
      if(joint==='armL'||joint==='armR') {
        const side=joint.slice(-1),elbow='elbow'+side,hand='hand'+side;
        if(y>-.08) return pair(joint,'torso',smooth((y+.08)/.14)*.30);
        if(y<-(armLength+forearmLength-.07)) return pair(elbow,hand,smooth((-y-armLength-forearmLength+.07)/.1));
        return pair(joint,elbow,smooth((-y-armLength+.09)/.18));
      }
      if(joint==='legL'||joint==='legR') {
        const side=joint.slice(-1);
        if(y>-.075) return pair(joint,'pelvis',smooth((y+.075)/.13)*.38);
        if(y<-.78) return pair('knee'+side,'foot'+side,smooth((-y-.78)/.13));
        return pair(joint,'knee'+side,smooth((-y-.34)/.18));
      }
      return pair(joint,joint,0);
    }
    skinRig(rig,template) {
      // One reusable armature layout: sockets are actual linked joint nodes.
      // Weighted root-space geometry is cached, while each champion has its
      // own bone palette. GPU deformation affects continuous elbow/knee/waist
      // surfaces; equipment remains attached to the same animated hands.
      const skeleton=new B.Skeleton(rig.root.name+'-armature',rig.root.name+'-armature',this.scene),bones={};
      for(const name of this.boneNames) {
        const joint=rig.nodes[name],parentName=this.boneNames.find(key=>rig.nodes[key]===joint.parent);
        const bind=B.Matrix.Translation(joint.position.x,joint.position.y,joint.position.z);
        const bone=new B.Bone(name,skeleton,parentName?bones[parentName]:null,bind,bind,bind,this.boneIndex.get(name));
        bone.linkTransformNode(joint);bones[name]=bone;
      }
      rig.skeleton=skeleton;rig.bones=bones;rig.skinning='weighted GPU / linked sockets';
      if(!template.skinParts) {
        const groups=new Map(),point=new B.Vector3(),normal=new B.Vector3();
        rig.root.computeWorldMatrix(true);
        for(const part of template.parts) {
          if(part.joint==='weaponRoot'||part.joint==='offhandRoot') continue;
          if(!groups.has(part.mat)) groups.set(part.mat,{p:[],n:[],i:[],c:[],uv:[],bone:[],weight:[]});
          const out=groups.get(part.mat),positions=part.geometry.getVerticesData(B.VertexBuffer.PositionKind),normals=part.geometry.getVerticesData(B.VertexBuffer.NormalKind),colors=part.geometry.getVerticesData(B.VertexBuffer.ColorKind),indices=part.geometry.getIndices(),offset=out.p.length/3;
          const node=rig.nodes[part.joint];node.computeWorldMatrix(true);const matrix=node.getWorldMatrix();
          for(let i=0;i<positions.length;i+=3) {
            const vertex=i/3,x=positions[i],y=positions[i+1],z=positions[i+2];
            point.set(x,y,z);B.Vector3.TransformCoordinatesToRef(point,matrix,point);out.p.push(point.x,point.y,point.z);
            normal.set(normals[i],normals[i+1],normals[i+2]);B.Vector3.TransformNormalToRef(normal,matrix,normal);normal.normalize();out.n.push(normal.x,normal.y,normal.z);
            out.c.push(colors[vertex*4],colors[vertex*4+1],colors[vertex*4+2],1);
            out.uv.push(Math.atan2(x,z)/(Math.PI*2)+.5,y*1.7);
            const w=part.weights[vertex];out.bone.push(w[0],w[2],0,0);out.weight.push(w[1],w[3],0,0);
          }
          for(const index of indices) out.i.push(index+offset);
        }
        template.skinParts=[];
        for(const [mat,out] of groups) {
          const data=new B.VertexData();data.positions=out.p;data.normals=out.n;data.indices=out.i;data.colors=out.c;data.uvs=out.uv;data.matricesIndices=out.bone;data.matricesWeights=out.weight;
          const geometry=new B.Geometry(rig.type+'-'+rig.faction+'-'+mat+'-weighted-body',this.scene,data,false);
          const source=new B.Mesh('original skinned source '+rig.type+' '+mat,this.scene);geometry.applyToMesh(source);source.setEnabled(false);source.isPickable=false;
          template.skinParts.push({geometry,source,mat,vertices:out.p.length/3});
        }
      }
      const equipment=rig.parts.filter(part=>part.m.metadata.equipment);
      for(const part of rig.parts) if(!part.m.metadata.equipment) part.m.dispose(false,false);
      rig.parts=equipment;rig.meshes=equipment.map(part=>part.m);rig.bodyMeshes=[];
      for(const part of template.skinParts) {
        const mesh=new B.Mesh(rig.root.name+'-'+part.mat+'-skinned',this.scene);part.geometry.applyToMesh(mesh);
        mesh.parent=rig.root;mesh.skeleton=skeleton;mesh.numBoneInfluencers=4;mesh.useVertexColors=true;mesh.material=this.material(part.mat,rig.faction,rig.hero);mesh.isPickable=false;
        // GPU deformation needs an authored local envelope, but its world-space
        // bounds must follow the moving rig. Freezing world bounds made the
        // body vanish while its hand-held weapons and effects stayed visible.
        mesh.setBoundingInfo(new B.BoundingInfo(new B.Vector3(-1.7,-.35,-1.7),new B.Vector3(1.7,3.10,1.7)));
        mesh.doNotSyncBoundingInfo=false;mesh.hasVertexAlpha=false;
        mesh.cullingStrategy=B.AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
        mesh.metadata={characterPart:true,skinned:true,originalArt:true,surface:part.mat};
        rig.meshes.push(mesh);rig.bodyMeshes.push(mesh);rig.parts.push({m:mesh,joint:'skinned',material:part.mat,name:'weighted '+part.mat});
      }
      rig.originalArtwork=true;rig.artRevision=3;
      rig.drawCount=rig.meshes.length;rig.boneCount=skeleton.bones.length;rig.weightedVertices=template.skinParts.reduce((sum,p)=>sum+p.vertices,0);
      skeleton.prepare();
    }
    geometry(type, hero, faction, detail, heavy, slim, officer, width, armLength, forearmLength) {
      const identity=type,appearanceHero=hero,profile=this.appearance(hero);
      if(profile)hero=profile.base;
      if(hero<0)type=(typeof TYPES!=='undefined'?TYPES[type]?.archetype:undefined)||type;
      const groups = new Map();
      const boss = type === 'odran' || type === 'azrakan';
      const segments = detail ? 20 : 7;
      const bucket = (joint, mat) => {
        const key = joint + ':' + mat;
        if (!groups.has(key)) groups.set(key, {joint, mat, p: [], i: []});
        return groups.get(key);
      };
      // Ring contours preserve shaped waists, shoulder slopes, muscle mass and
      // beveled plate edges instead of the old box limbs and square torso.
      const contour = (joint, mat, rings, count = segments, start = 0, span = Math.PI * 2, cap = true) => {
        // Babylon's left-handed normal computation expects this ring ordering.
        // Normalize every anatomical, armor and weapon contour top to bottom.
        if (rings[0][0] < rings[rings.length - 1][0]) rings = rings.slice().reverse();
        const g = bucket(joint, mat), base = g.p.length / 3;
        const full = span >= Math.PI * 2 - .001;
        const n = full ? count : count + 1;
        for (const r of rings) for (let k = 0; k < n; k++) {
          const a = start + k / count * span;
          g.p.push((r[3] || 0) + Math.sin(a) * r[1], r[0], (r[4] || 0) + Math.cos(a) * r[2]);
        }
        for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < count; k++) {
          const a = base + j * n + k, b = base + j * n + (k + 1) % n;
          g.i.push(a, b, a + n, b, b + n, a + n);
        }
        if (cap && full) for (const end of [0, rings.length - 1]) {
          const r = rings[end], center = g.p.length / 3;
          g.p.push(r[3] || 0, r[0], r[4] || 0);
          for (let k = 0; k < count; k++) {
            const a = base + end * n + k, b = base + end * n + (k + 1) % n;
            if (end === 0) g.i.push(center, b, a); else g.i.push(center, a, b);
          }
        }
      };
      const ellipsoid = (joint, mat, x, y, z, rx, ry, rz, count = segments) => {
        const rings = [];
        for (let j = 0; j <= 5; j++) {
          const a = j / 5 * Math.PI;
          const rr = Math.max(.055, Math.sin(a));
          rings.push([y + Math.cos(a) * ry, rx * rr, rz * rr, x, z]);
        }
        contour(joint, mat, rings.reverse(), count);
      };
      // Extruded XY outlines give recognisable forged weapons and angular
      // insignia while retaining volume when seen from the side.
      const plate=(joint,mat,outline,z,depth=.035)=>{
        let area=0;for(let k=0;k<outline.length;k++){const a=outline[k],b=outline[(k+1)%outline.length];area+=a[0]*b[1]-b[0]*a[1];}
        if(area>0)outline=outline.slice().reverse();
        const g=bucket(joint,mat),n=outline.length,center=[outline.reduce((v,p)=>v+p[0],0)/n,outline.reduce((v,p)=>v+p[1],0)/n],bevel=detail?Math.min(.009,depth*.23):0;
        const inset=outline.map(p=>[center[0]+(p[0]-center[0])*(bevel?.92:1),center[1]+(p[1]-center[1])*(bevel?.92:1)]);
        // Ear-clipped original outlines support concave axe blades and insignia.
        const order=Array.from({length:n},(_,i)=>i),triangles=[],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        let guard=n*n;
        while(order.length>3&&guard-->0){let found=false;for(let k=0;k<order.length;k++){
          const ia=order[(k+order.length-1)%order.length],ib=order[k],ic=order[(k+1)%order.length],a=outline[ia],b=outline[ib],c=outline[ic];
          if(cross(a,b,c)>=-1e-10)continue;
          let occupied=false;for(const id of order){if(id===ia||id===ib||id===ic)continue;const p=outline[id];if(cross(a,b,p)<=1e-9&&cross(b,c,p)<=1e-9&&cross(c,a,p)<=1e-9){occupied=true;break;}}
          if(occupied)continue;triangles.push(ia,ib,ic);order.splice(k,1);found=true;break;
        }if(!found)break;}
        if(order.length===3)triangles.push(...order);
        if(!triangles.length)for(let k=1;k<n-1;k++)triangles.push(0,k,k+1);
        const back=g.p.length/3;for(const p of outline)g.p.push(p[0],p[1],z-depth/2);
        const front=g.p.length/3;for(const p of inset)g.p.push(p[0],p[1],z+depth/2);
        for(let k=0;k<triangles.length;k+=3){const a=triangles[k],b=triangles[k+1],c=triangles[k+2];g.i.push(front+a,front+b,front+c,back+a,back+c,back+b);}
        // Separate face, bevel and wall vertices preserve forged planar normals.
        for(let k=0;k<n;k++){
          const next=(k+1)%n,a=outline[k],b=outline[next],ia=inset[k],ib=inset[next],side=g.p.length/3;
          g.p.push(a[0],a[1],z-depth/2,b[0],b[1],z-depth/2,a[0],a[1],z+depth/2-bevel,b[0],b[1],z+depth/2-bevel);
          g.i.push(side,side+1,side+2,side+1,side+3,side+2);
          if(bevel){const strip=g.p.length/3;g.p.push(a[0],a[1],z+depth/2-bevel,b[0],b[1],z+depth/2-bevel,ia[0],ia[1],z+depth/2,ib[0],ib[1],z+depth/2);g.i.push(strip,strip+1,strip+2,strip+1,strip+3,strip+2);}
        }
      };
      const bar = (joint, mat, x, y, z, w, h, d) => plate(joint, mat, [[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]], z, d);
      const tube = (joint, mat, y0, y1, rx, rz = rx, x = 0, z = 0) => contour(joint, mat, [[y0,rx,rz,x,z],[y1,rx,rz,x,z]], detail ? 8 : 6);
      // Thin reliefs are geometry, so they remain crisp without an external
      // texture pack. Their shared materials add no extra character draw calls.
      const relief=(joint,mat,path,z,thickness=.007)=>{
        for(let k=0;k<path.length-1;k++) {
          const a=path[k],b=path[k+1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1;
          const nx=-dy/length*thickness*.5,ny=dx/length*thickness*.5;
          plate(joint,mat,[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]],z,.007);
        }
      };
      const medallion=(joint,x,y,z,r=.05,mat='gold')=>{
        ellipsoid(joint,mat,x,y,z,r,r,.012,12);
        ellipsoid(joint,'cloth',x,y,z+.014,r*.60,r*.60,.006,10);
        plate(joint,mat,[[x-r*.16,y-r*.37],[x+r*.16,y-r*.37],[x+r*.37,y],[x+r*.16,y+r*.37],[x-r*.16,y+r*.37],[x-r*.37,y]],z+.022,.007);
      };
      const filigree=(joint,x,y,z,scale=1,sign=1)=>{
        const path=[[0,0],[.032,.024],[.063,.022],[.078,.006],[.071,-.009],[.055,-.012],[.044,0],[.047,.011]];
        relief(joint,'gold',path.map(p=>[x+sign*p[0]*scale,y+p[1]*scale]),z,.006*scale);
      };
      const breast = heavy ? .35 : slim ? .245 : .285;
      // Tunic and rib cage are separate silhouettes; the plate has a broad
      // shoulder line, recessed waist and a curved forward-facing breast.
      contour('torso','cloth',detail?[[.475,.075,.074],[.43,breast*.72,.13],[.35,breast*.94,.155],[.22,breast*.90,.15],[.09,breast*.79,.133],[-.035,breast*.75,.13],[-.16,breast*.78,.14],[-.295,breast*.70,.12]]:[[ -.025,breast*.78,.135],[.12,breast*.83,.145],[.33,breast*.95,.16],[.43,breast*.72,.13]]);
      if(detail) {
        // Raised collar and stitched neckline bridge the shaped rib cage.
        contour('torso','leather',[[.435,.087,.082],[.49,.083,.079]],12);
        for(const sign of [-1,1]) {
          plate('torso','leather',[[sign*.16,.4],[sign*.20,.37],[sign*.125,.055],[sign*.085,.05]],.17,.012);
          for(let stitch=0;stitch<5;stitch++)bar('torso','gold',sign*(.14-stitch*.009),.30-stitch*.039,.185,.021,.007,.009);
        }
      }
      if(hero!==1&&hero!==2&&type!=='archer'&&type!=='duelist') {
        contour('torso','steel',[[.005,breast*.78,.151],[.055,breast*.85,.166],[.13,breast*.87,.182],[.25,breast*.98,.21],[.34,breast*1.02,.205],[.405,breast*.88,.165],[.455,breast*.55,.12]]);
        if(detail) {
          // Forged raised rib, bevel strips and lower articulated lame layers.
          plate('torso','edge',[[-.022,.065],[0,.40],[.023,.065],[0,.033]],.218,.018);
          for(let lame=0;lame<3;lame++)contour('torso','steel',[[.026-lame*.043,breast*(.81-lame*.016),.161],[.049-lame*.043,breast*(.84-lame*.014),.168]],16);
          for(const sign of [-1,1])plate('torso','gold',[[sign*.03,.32],[sign*.18,.375],[sign*.215,.32],[sign*.185,.325],[sign*.08,.295]],.202,.01);
        }
        plate('torso', 'gold', [[-.115,.275],[0,.34],[.115,.275],[.04,.245],[0,.16],[-.04,.245]], .207, .018);
        if (heavy) {
          contour('torso', 'dark', [[.08,.27,.181],[.14,.28,.19],[.19,.29,.192]], 10, Math.PI*.75, Math.PI*.5, false);
          bar('torso', 'gold', 0, .405, .163, .22, .035, .025);
        }
      } else {
        contour('torso', 'leather', [[.03,breast*.83,.145],[.2,breast*.86,.17],[.38,breast*.80,.145]], segments, -.75, 1.5, false);
        plate('torso', 'gold', [[-.025,.08],[.018,.08],[.16,.40],[.115,.425]], .172, .018);
        plate('torso', 'gold', [[.025,.08],[-.018,.08],[-.16,.40],[-.115,.425]], .172, .018);
      }
      if(detail&&hero===1) {
        for(let lame=0;lame<4;lame++) {
          const y=.095+lame*.077,r=breast*(.79+lame*.035);
          contour('torso','steel',[[y,r,.165+lame*.012],[y+.062,r*1.06,.173+lame*.012]],16,-.98,1.96,false);
          for(const sign of [-1,1])for(let rivet=0;rivet<3;rivet++)ellipsoid('torso','gold',sign*(.04+rivet*.049),y+.044,.177+lame*.012,.006,.006,.004,6);
        }
      }
      if(detail&&hero>=0) {
        // Original embroidered cloud and wing motifs identify the champions at
        // close range; large contrasting silhouettes identify them in combat.
        const front=hero===1||hero===2?.19:.22;
        for(const sign of [-1,1]) {
          filigree('torso',sign*.056,.255,front,hero===3?1.15:.88,sign);
          filigree('torso',sign*.041,.122,front-.010,.68,sign);
          medallion('torso',sign*(breast*.66),.365,front-.026,.025);
        }
        // Sewn lamellae, edge bindings and gold rivets have actual thickness.
        if(hero===0||hero===4||hero===5)for(let row=0;row<4;row++)for(let col=-2;col<=2;col++) {
          const x=col*.067,y=.305-row*.052,z=.212-Math.abs(col)*.015;
          plate('torso',row%2===0?'steel':'edge',[[x-.026,y+.015],[x+.026,y+.015],[x+.024,y-.028],[x,y-.039],[x-.024,y-.028]],z,.011);
          if(row===0||row===3)ellipsoid('torso','gold',x,y+.004,z+.009,.004,.004,.003,6);
        }
        if(hero===4) {
          // Daeron's crossed ivory stole and raised cloud collar frame an open
          // face, while the long cobalt overskirt carries the silhouette.
          plate('torso','ivory',[[-.207,.418],[-.143,.435],[.056,.039],[.009,-.038],[-.026,.04]],.229,.018);
          relief('torso','gold',[[-.171,.426],[-.069,.223],[.035,.025]],.242,.011);
          for(const sign of [-1,1])plate('torso','lining',[[sign*.06,.475],[sign*.126,.50],[sign*.161,.428],[sign*.078,.375]],.125,.027);
          medallion('torso',-.098,.29,.252,.041);
        }
        if(hero===5) {
          plate('torso','ivory',[[.125,.435],[.204,.39],[.100,.223],[-.046,.106],[-.100,.116],[-.070,.167]],.234,.016);
          relief('torso','gold',[[.16,.411],[.078,.25],[-.069,.14]],.246,.010);
          medallion('torso',.126,.371,.250,.036);
          plate('torso','gold',[[-.081,.379],[0,.444],[.081,.379],[.052,.372],[0,.409],[-.052,.372]],.214,.013);
        }
        if(hero===2) {
          // Nivara's asymmetrical shoulder sash and dagger sheaths read as a
          // nimble duelist rather than another armored infantry silhouette.
          plate('torso','cloth',[[-.25,.40],[-.18,.455],[.16,.045],[.117,-.001]],.189,.02);
          relief('torso','gold',[[-.213,.427],[-.085,.259],[.135,.024]],.203,.008);
        }
      }
      // Pelvis, belt and split tassets preserve leg motion and silhouette.
      contour('pelvis', 'cloth', [[-.14,breast*.65,.12],[-.055,breast*.79,.145],[.15,breast*.79,.145]]);
      contour('pelvis', 'leather', [[.095,breast*.81,.15],[.165,breast*.81,.15]], segments);
      bar('pelvis', 'gold', 0, .132, .165, .083, .062, .025);
      if(!detail) {
        for(const side of ['L','R'])plate('leg'+side,'cloth',[[-.105,.065],[.10,.065],[.13,-.24],[.088,-.36],[-.10,-.32]],.124,.020);
      } else {
        // Weighted split overskirts have authored folds and asymmetrical hems.
        // They cover the crotch/upper-thigh seam and move with each real leg.
        const skirt=(sign,length,key='cloth')=>{
          const g=bucket('pelvis',key),rows=8,columns=10,base=g.p.length/3;
          for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
            const v=row/(rows-1),u=column/(columns-1),inner=.025+v*.024,outer=breast*(.80+v*.21);
            const x=sign*(inner+(outer-inner)*u),y=.07-v*length+(row===rows-1?Math.sin(u*Math.PI)*.022+sign*u*.025:0);
            const z=.158+v*.015+Math.sin(u*Math.PI*5)*(.009+v*.012)+u*u*.015;g.p.push(x,y,z);
          }
          for(let row=0;row<rows-1;row++)for(let column=0;column<columns-1;column++){const a=base+row*columns+column;sign>0?g.i.push(a,a+columns,a+1,a+1,a+columns,a+columns+1):g.i.push(a,a+1,a+columns,a+1,a+columns+1,a+columns);}
          const trim=bucket('pelvis','trim'),tb=trim.p.length/3;
          for(let row=0;row<rows;row++){const v=row/(rows-1),x=sign*(.025+v*.024),y=.07-v*length;trim.p.push(x,y,.165+v*.015,x+sign*.009,y,.165+v*.015);}
          for(let row=0;row<rows-1;row++){const a=tb+row*2;trim.i.push(a,a+2,a+1,a+1,a+2,a+3);}
        };
        for(const sign of [-1,1])skirt(sign,hero===2?(sign<0?.34:.59):hero===4?(sign<0?.73:.64):hero===5?(sign<0?.55:.66):hero===0?.67:hero===1?.63:.58);
        // Side lames are fitted to the thigh, rather than floating hip cubes.
        if(hero===0||hero===4||hero===5||heavy||officer)for(const side of ['L','R'])for(let lame=0;lame<3;lame++) {
          const sign=side==='L'?-1:1,y=.045-lame*.09;
          plate('leg'+side,'steel',[[sign*.025,y],[sign*.12,y-.02],[sign*.125,y-.103],[sign*.014,y-.086]],.126,.024);
          plate('leg'+side,'gold',[[sign*.025,y-.077],[sign*.122,y-.095],[sign*.12,y-.104],[sign*.022,y-.087]],.140,.008);
        }
      }
      if(detail&&hero>=0) {
        // Belt ornaments, cords and brocade hems stay attached to their body
        // joints; none are free meshes that can be left behind after culling.
        for(const sign of [-1,1]) {
          medallion('pelvis',sign*(breast*.65),.131,.153,.032);
          relief('pelvis','trim',[[sign*.055,.153],[sign*.144,.135],[sign*.206,.09],[sign*.241,-.043]],.176,.009);
          for(let charm=0;charm<3;charm++) {
            const x=sign*(.118+charm*.025),y=-.21-charm*.034;
            relief('pelvis','gold',[[x,.067],[x,y+.03]],.17,.004);
            plate('pelvis',charm===1?'gold':'ivory',[[x-.008,y+.027],[x+.008,y+.027],[x+.012,y-.005],[x,y-.018],[x-.012,y-.005]],.175,.010);
          }
          filigree('pelvis',sign*.09,-.366,.185,.84,sign);
          filigree('pelvis',sign*.14,-.446,.189,.62,sign);
        }
        if(hero===4)for(const sign of [-1,1])plate('pelvis','ivory',[[sign*.184,.09],[sign*.258,.039],[sign*.327,-.43],[sign*.277,-.637],[sign*.242,-.567],[sign*.211,-.12]],.13,.015);
        if(hero===2)for(const sign of [-1,1]) {
          tube('pelvis','leather',-.14,-.32,.03,.034,sign*.255,-.041);
          plate('pelvis','gold',[[sign*.232,-.13],[sign*.274,-.13],[sign*.274,-.168],[sign*.232,-.168]],-.005,.017);
        }
      }
      // Continuous limbs contain shaped muscle volumes; independent elbow,
      // knee and ankle pivots stay at the anatomical hinge positions.
      for (const side of ['L','R']) {
        const sign = side === 'L' ? -1 : 1;
        const armMat=hero===1||hero===2||type==='archer'?'skin':'lining';
        contour('arm'+side,armMat,detail?[[.05,.087,.085],[-.055,heavy?.124:.102,.107],[-.15,heavy?.12:.10,.10],[-armLength+.055,.071,.073],[-armLength,.067,.069],[-armLength-.065,heavy?.096:.079,.083],[-armLength-.16,heavy?.092:.078,.078],[-armLength-forearmLength+.055,.052,.057],[-armLength-forearmLength+.012,.05,.053]]:[[.03,.082,.085],[-.09,heavy?.125:.10,heavy?.13:.10],[-.23,.075,.075],[-armLength,.061,.065]],detail?16:7);
        if (type !== 'archer') {
          if(detail) {
            const pauldron=heavy?.17:slim?.105:.133,shoulderMat=hero===1?'leather':hero===2?'lining':'steel';
            contour('arm'+side,shoulderMat,[[.075,pauldron*.42,.090,sign*.008,0],[.043,pauldron*.91,.123,sign*.016,0],[-.015,pauldron*1.01,.136,sign*.025,0],[-.10,pauldron*.82,.119,sign*.033,0]],12);
            for(let lame=0;lame<(heavy?3:2);lame++)contour('arm'+side,shoulderMat,[[ -.11-lame*.048,pauldron*(.81-lame*.09),.114-lame*.011,sign*.035,0],[-.077-lame*.048,pauldron*(.89-lame*.09),.125-lame*.011,sign*.034,0]],12);
            if(hero!==2)contour('arm'+side,'gold',[[.014,pauldron*1.025,.138,sign*.025,0],[.025,pauldron*.99,.134,sign*.025,0]],12);
          } else contour('arm'+side,'steel',[[.06,.076,.085,sign*.01,0],[.025,.123,.124,sign*.025,0],[-.04,.131,.133,sign*.028,0],[-.10,.108,.105,sign*.036,0]],7);
          if(hero===3||boss)plate('arm'+side,'gold',[[sign*.035,.035],[sign*.21,.10],[sign*.265,-.04],[sign*.06,-.09]],.16,.025);
          if(detail&&hero>=0) {
            const reach=heavy?.22:hero===4?.19:hero===5?.16:.145;
            plate('arm'+side,'gold',[[sign*.02,.030],[sign*reach,.014],[sign*(reach+.026),-.057],[sign*(reach*.82),-.077],[sign*.032,-.033]],.126,.014);
            filigree('arm'+side,sign*.031,-.042,.145,.70,sign);
            if(hero===4)plate('arm'+side,'ivory',[[sign*.05,-.018],[sign*.162,-.035],[sign*.186,-.128],[sign*.147,-.208],[sign*.097,-.160]],-.06,.05);
            if(hero===5&&side==='R')for(let feather=0;feather<3;feather++)plate('arm'+side,'edge',[[sign*(.066+feather*.025),.035],[sign*(.111+feather*.039),.062],[sign*(.139+feather*.032),-.09],[sign*(.081+feather*.024),-.083]],-.012,.045);
          }
          if(detail&&type==='odran')for(let spike=0;spike<3;spike++)plate('arm'+side,'edge',[[sign*(.07+spike*.055),.03],[sign*(.13+spike*.055),.08],[sign*(.17+spike*.055),.22],[sign*(.18+spike*.055),.02]],-.02,.09);
          if(detail&&hero===2&&side==='L')contour('arm'+side,'cloth',[[.06,.123,.14],[-.04,.140,.146],[-.20,.13,.14],[-.32,.092,.10]],14);
        }
        if(!detail)contour('elbow'+side,'leather',[[.025,.071,.071],[-.09,heavy?.1:.079,.08],[-forearmLength+.035,.057,.06],[-forearmLength,.054,.054]],7);
        if(detail) {
          contour('elbow'+side,'leather',[[-.12,.09,.089],[-.19,.080,.081],[-forearmLength+.035,.064,.067]],14);
          for(const by of [-.16,-forearmLength+.05])contour('elbow'+side,'gold',[[by-.009,.083,.083],[by+.009,.083,.083]],12);
        }
        if (hero !== 2 && type !== 'archer' && type !== 'duelist') {
          contour('elbow'+side, 'steel', [[-.04,.074,.083],[-.09,.092,.092],[-forearmLength+.05,.065,.072]], segments, -.88, 1.76, false);
        }
        if(detail&&hero>=0) {
          plate('elbow'+side,'gold',[[-.026,-.086],[0,-.056],[.026,-.086],[.024,-.18],[0,-.232],[-.024,-.18]],.084,.014);
          filigree('elbow'+side,-.036,-.164,.085,.60,1);
        }
        // Sculpted palm, four separately curled fingers and an opposing thumb.
        if(detail) {
          contour('hand'+side,'leather',[[.012,.047,.042,0,.008],[-.025,.055,.04,0,.015],[-.075,.057,.035,0,.024],[-.09,.046,.025,0,.024]],12);
          for(let finger=0;finger<4;finger++) {
            const fx=-.039+finger*.026,length=finger===0||finger===3?.053:.067;
            contour('hand'+side,armMat==='skin'?'skin':'leather',[[-.066,.015,.016,fx,.031],[-.093,.015,.017,fx,.048],[-.066-length,.012,.015,fx,.060],[-.083-length,.01,.011,fx,.046]],8);
          }
          contour('hand'+side,'leather',[[-.008,.022,.028,-sign*.046,.029],[-.041,.024,.026,-sign*.062,.045],[-.065,.019,.019,-sign*.051,.056]],10);
          if(armMat!=='skin')plate('hand'+side,'steel',[[-.037,-.031],[.037,-.031],[.042,-.069],[-.042,-.069]],-.021,.016);
        } else {
          ellipsoid('hand'+side,'leather',0,-.05,.012,.063,.095,.065,6);
          ellipsoid('hand'+side,'leather',-sign*.052,-.035,.032,.028,.052,.035,6);
        }
        contour('leg'+side,'lining',detail?[[.03,.115,.113],[-.10,heavy?.142:.118,.126],[-.21,.106,.11],[-.34,.079,.088],[-.43,.072,.076,0,.015],[-.52,.087,.09],[-.62,.088,.096,0,-.012],[-.75,.068,.08],[-.86,.053,.061]]:[[.025,.105,.11],[-.10,heavy?.145:.113,.12],[-.26,.092,.10],[-.43,.068,.078]],detail?16:7);
        if(!detail&&(heavy||hero===0)) {
          contour('leg'+side,'steel', [[-.025,.117,.125],[-.18,.121,.136],[-.31,.084,.095]], segments, -.85, 1.7, false);
        }
        if(!detail)contour('knee'+side,'leather',[[.025,.075,.079],[-.09,.085,.09],[-.25,.069,.08],[-.43,.055,.06]],7);
        if(detail) {
          contour('knee'+side,'leather',[[-.16,.089,.096],[-.26,.079,.088],[-.42,.065,.075]],14);
          for(const by of [-.2,-.37])contour('knee'+side,'gold',[[by-.013,.088,.092],[by+.013,.088,.092]],12);
        }
        if (hero !== 2 && type !== 'archer' && type !== 'duelist') {
          if(detail)plate('knee'+side,'steel',[[-.067,.043],[0,.068],[.067,.043],[.070,-.018],[.043,-.061],[-.043,-.061],[-.070,-.018]],.072,.035);
          else plate('knee'+side,'steel',[[-.061,.038],[0,.057],[.061,.038],[.067,-.02],[.039,-.06],[-.039,-.06],[-.067,-.02]],.072,.029);
          plate('knee'+side,'steel',[[-.053,-.075],[.053,-.075],[.061,-.18],[.040,-.34],[-.040,-.34],[-.061,-.18]],.085,.026);
        }
        if(detail&&hero>=0) {
          relief('knee'+side,'gold',[[-.039,-.102],[0,-.070],[.039,-.102],[.022,-.275],[0,-.312],[-.022,-.275],[-.039,-.102]],.105,.006);
          medallion('knee'+side,0,.011,.106,.022);
        }
        // Raised cuff, ankle and rounded wedge toe; soles touch ground at .015.
        contour('foot'+side, 'leather', [[-.115,.083,.16,0,.065],[-.075,.10,.17,0,.06],[.012,.093,.155,0,.055],[.075,.071,.072,0,0],[.215,.070,.073,0,0]], detail ? 16 : 7);
        if(detail) {
          contour('foot'+side,'dark',[[-.116,.085,.168,0,.064],[-.102,.094,.175,0,.063]],16);
          for(let lace=0;lace<3;lace++)bar('foot'+side,'gold',0,.034+lace*.026,.068,.070,.008,.008);
        }
        if (hero === 0 || heavy) plate('foot'+side, 'steel', [[-.068,.006],[.068,.006],[.06,.084],[-.06,.084]], .074, .028);
      }
      // Sculpted original head: nape, narrow jaw, cheekbone, temple and cranium
      // profiles, with separate eye surfaces, lids, nose wings and lower lip.
      tube('head','skin',-.145,-.044,.061,.064);
      contour('head','skin',(detail?[[.265,.022,.035,0,-.006],[.246,.072,.074,0,-.01],[.219,.103,.093,0,-.01],[.183,.119,.106,0,-.006],[.15,.124,.107,0,-.007],[.115,.120,.103,0,-.005],[.081,.123,.103,0,.002],[.052,.112,.092,0,.009],[.024,.098,.085,0,.015],[-.014,.09,.079,0,.022],[-.046,.073,.073,0,.017],[-.071,.053,.062,0,.005]]:[[ -.075,.07,.074,0,.018],[-.035,.10,.09,0,.017],[.055,.125,.108],[.16,.127,.109],[.23,.102,.091],[.255,.042,.051]]).map(r=>[r[0],r[1]*(slim?.94:heavy?1.045:1),r[2],r[3]||0,r[4]||0]),detail?28:8);
      if(detail) {
        contour('head','skin',[[.139,.016,.019,0,.105],[.099,.019,.029,0,.113],[.075,.027,.036,0,.122],[.060,.023,.021,0,.125]],10);
        for(const sign of [-1,1]) {
          ellipsoid('head','ivory',sign*.054,.117,.091,.030,.014,.014,10);
          ellipsoid('head','eyes',sign*.052,.117,.104,.011,.011,.0045,8);
          ellipsoid('head','dark',sign*.052,.117,.108,.0045,.007,.003,8);
          ellipsoid('head','ivory',sign*.050,.121,.112,.0028,.0028,.0015,6);
          plate('head','hair',[[sign*.024,.145],[sign*.076,.153],[sign*.089,.145],[sign*.079,.136],[sign*.026,.135]],.106,.008);
          plate('head','skin',[[sign*.025,.125],[sign*.081,.128],[sign*.084,.133],[sign*.025,.132]],.104,.006);
          ellipsoid('head','skin',sign*.122,.091,-.008,.027,.049,.03,10);
          ellipsoid('head','mouth',sign*.129,.093,.008,.013,.027,.007,8);
        }
        contour('head','mouth',[[.031,.031,.003,0,.101],[.021,.033,.006,0,.101],[.014,.026,.004,0,.10]],10);
        bar('head','dark',0,.023,.109,.046,.0035,.003);
        ellipsoid('head','skin',0,-.025,.084,.04,.018,.012,12);
      } else {
        plate('head','skin',[[-.022,.095],[0,.166],[.023,.095],[.014,.077],[-.014,.077]],.126,.055);
        for(const sign of [-1,1])plate('head','dark',[[sign*.025,.116],[sign*.095,.133],[sign*.095,.112],[sign*.027,.10]],.112,.012);
      }
      if(detail&&hero>=0) {
        // Slight cheek and lower-lid reliefs avoid a flat painted face in the
        // character gallery, with distinct hairlines and subtle battle marks.
        for(const sign of [-1,1]) {
          relief('head','skin',[[sign*.026,.109],[sign*.057,.103],[sign*.079,.112]],.105,.005);
          ellipsoid('head','skin',sign*.073,.058,.089,.032,.016,.009,10);
        }
        if(hero===2)relief('head','mouth',[[-.071,.17],[-.062,.152],[-.052,.132],[-.045,.106]],.109,.003);
        if(hero===0)for(const sign of [-1,1])plate('head','hair',[[sign*.008,.048],[sign*.045,.035],[sign*.052,.023],[sign*.019,.031]],.104,.006);
        if(hero===3) {
          contour('head','dark',[[.006,.080,.074,0,.017],[-.055,.080,.074,0,.018],[-.132,.059,.058,0,.024],[-.207,.022,.036,0,.027]],14,.80,Math.PI*2-1.60,false);
          for(let braid=0;braid<5;braid++) {
            const x=(braid-2)*.024;
            plate('head','hair',[[x-.008,-.050],[x+.009,-.050],[x+.010,-.119],[x,-.176],[x-.010,-.119]],.096,.012);
          }
          for(const sign of [-1,1])relief('head','gold',[[sign*.038,-.105],[sign*.039,-.133]],.104,.010);
        }
      }
      if(hero===4) {
        // Daeron: open cloud-crown, tall knotted hair and twin pale silk tails.
        contour('head','hair',[[.133,.126,.110,0,-.026],[.205,.120,.103,0,-.022],[.268,.067,.065,0,-.023],[.29,.022,.024,0,-.018]],segments,.81,Math.PI*2-1.62,false);
        contour('hair','hair',[[.04,.046,.047,0,-.011],[.13,.073,.059,0,-.015],[.24,.05,.045,0,-.008],[.29,.016,.019,0,.011]],detail?16:8);
        contour('hair','hair',[[.065,.066,.058,0,-.045],[-.13,.049,.044,0,-.089],[-.37,.039,.033,0,-.125],[-.56,.014,.018,0,-.150]],12);
        contour('hair','gold',[[.095,.075,.064,0,-.015],[.120,.075,.064,0,-.015]],12);
        for(const sign of [-1,1]) {
          contour('head','hair',[[.19,.031,.034,sign*.107,-.004],[.067,.023,.025,sign*.121,.005],[-.10,.010,.015,sign*.113,.017]],10);
          plate('head','gold',[[sign*.03,.169],[sign*.116,.223],[sign*.159,.270],[sign*.142,.168],[sign*.095,.143]],.093,.022);
          if(detail)plate('hair','ivory',[[sign*.048,.107],[sign*.072,.081],[sign*.107,-.183],[sign*.068,-.492],[sign*.045,-.446],[sign*.060,-.160]],-.065,.012);
        }
        contour('head','gold',[[.158,.135,.123],[.180,.135,.123]],16,-1.0,2.0,false);
        medallion('head',0,.188,.136,.026);
      } else if(hero===5) {
        // Maelis: swept auburn waves, a braided bun and original wing circlet.
        contour('head','hair',[[.153,.128,.114,0,-.018],[.225,.112,.096,0,-.022],[.282,.059,.056,0,-.025],[.295,.023,.03,0,-.020]],segments,.63,Math.PI*2-1.26,false);
        contour('hair','hair',[[.022,.051,.04,0,-.047],[.092,.080,.067,0,-.04],[.174,.054,.05,0,-.037],[.20,.025,.026,0,-.025]],16);
        for(const sign of [-1,1]) {
          contour('head','hair',[[.225,.030,.031,sign*.084,.032],[.165,.026,.029,sign*.107,.029],[.056,.025,.028,sign*.116,.001],[-.068,.015,.020,sign*.099,-.013]],12);
          plate('head','gold',[[sign*.028,.165],[sign*.098,.193],[sign*.173,.272],[sign*.181,.219],[sign*.148,.149],[sign*.088,.149]],.069,.017);
          if(detail) {
            relief('head','edge',[[sign*.077,.169],[sign*.115,.181],[sign*.156,.237]],.083,.008);
            medallion('head',sign*.109,.164,.103,.016);
            ellipsoid('head','gold',sign*.118,.028,-.002,.015,.022,.012,8);
          }
        }
        plate('head','gold',[[-.029,.162],[0,.203],[.029,.162],[0,.137]],.127,.012);
        ellipsoid('head','cloth',0,.170,.14,.011,.019,.006,8);
      } else if (hero === 1) {
        // Seyra: uncovered face, sweeping hair and tied long ponytail.
        contour('head', 'dark', [[.155,.131,.11],[.24,.113,.098],[.285,.061,.05,0,-.012]], segments);
        contour('head','hair',[[.20,.076,.071,0,-.125],[.05,.060,.057,0,-.17],[-.15,.044,.038,0,-.205],[-.39,.026,.025,0,-.235],[-.57,.012,.014,0,-.20]],12);
        for(const sign of [-1,1])contour('head','hair',[[.19,.034,.041,sign*.107,-.017],[.04,.026,.032,sign*.12,.004],[-.10,.014,.018,sign*.093,.022]],10);
        bar('head', 'gold', 0, .164, .106, .205, .035, .025);
      } else if (hero === 2 || type === 'duelist') {
        // Nivara: deep angular hood, exposed face and high cheek guards.
        contour('head', 'lining', [[-.05,.14,.12,0,-.016],[.07,.16,.14,0,-.018],[.22,.145,.125,0,-.025],[.31,.04,.055,0,-.03]], segments, .72, Math.PI*2-1.44, false);
        plate('head', 'gold', [[-.12,.19],[0,.265],[.12,.19],[.087,.19],[0,.23],[-.087,.19]], .111, .018);
        for (const sign of [-1,1]) plate('head', 'leather', [[sign*.073,.048],[sign*.14,.08],[sign*.12,-.06],[sign*.074,-.02]], .093, .028);
      } else {
        const helmetHigh = heavy ? .32 : .285;
        contour('head', 'steel', [[.16,.14,.118],[.23,.133,.112],[helmetHigh,.084,.083],[helmetHigh+.025,.015,.026]], segments);
        contour('head', 'steel', [[-.04,.129,.108],[.14,.142,.121],[.19,.141,.122]], segments, .85, Math.PI*2-1.7, false);
        for (const sign of [-1,1]) plate('head', 'steel', [[sign*.083,.10],[sign*.132,.16],[sign*.125,-.065],[sign*.081,-.018]], .10, .038);
        bar('head', 'gold', 0, .179, .118, .225, .025, .02);
        if (hero === 3 || boss) {
          plate('head', 'steel', [[-.026,.175],[.026,.175],[.025,.02],[0,-.01],[-.025,.02]], .132, .028);
          plate('head', 'gold', [[-.03,.22],[.03,.22],[.023,.37],[0,.42],[-.023,.37]], .02, .06);
        } else if (officer || hero === 0) {
          plate('head', 'cloth', [[-.030,.275],[.030,.275],[.045,.43],[.018,.56],[-.045,.45]], -.005, .07);
        }
      }
      if(detail&&hero>=0) {
        // Relief grooves on the helmet and raised hems give the older heroes
        // the same material finish as the two new champions.
        if(hero===0||hero===3)for(const sign of [-1,1]) {
          relief('head','gold',[[sign*.028,.197],[sign*.068,.242],[sign*.083,.278]],.106,.007);
          plate('head','gold',[[sign*.097,.128],[sign*.117,.136],[sign*.111,-.040],[sign*.095,-.053]],.13,.009);
        }
        if(hero===1) {
          for(const sign of [-1,1])relief('head','gold',[[sign*.02,.178],[sign*.083,.199],[sign*.117,.189]],.113,.006);
          medallion('head',0,.179,.123,.023);
          for(let braid=0;braid<4;braid++)ellipsoid('head','hair',Math.sin(braid*1.8)*.012,-.06-braid*.104,-.198,.027,.061,.027,10);
        }
        if(hero===2)for(const sign of [-1,1])relief('head','gold',[[sign*.104,-.038],[sign*.142,.067],[sign*.133,.159],[sign*.046,.250]],.105,.006);
      }
      if (type === 'azrakan' || type === 'warcaller') {
        for (const sign of [-1,0,1]) plate('head', 'gold', [[sign*.10-.04,.24],[sign*.10+.04,.24],[sign*.12+.025,.41],[sign*.13,.5],[sign*.12-.025,.41]], .016, .055);
      }
      // Shared cloth panels have curved cross-sections and asymmetric hems.
      const cloak = (joint, mat, rows) => {
        const g = bucket(joint, mat), base = g.p.length / 3;
        for (const r of rows) for (let k = 0; k < 7; k++) {
          const u = k / 6 * 2 - 1;
          g.p.push(u*r[1], r[0] + (r[3] || 0)*Math.abs(u), r[2] + u*u*.075);
        }
        for (let row = 0; row < rows.length-1; row++) for (let k = 0; k < 6; k++) {
          const a=base+row*7+k;
          g.i.push(a,a+7,a+1,a+1,a+7,a+8);
        }
      };
      if(hero===4) {
        cloak('cape','ivory',[[.035,.22,-.029],[-.16,.26,-.091],[-.52,.31,-.208],[-.91,.295,-.30],[-1.13,.255,-.30,.054]]);
        cloak('cape','cloth',[[.014,.09,-.044],[-.23,.087,-.113],[-.68,.075,-.252],[-1.10,.048,-.32,.025]]);
        if(detail)for(const sign of [-1,1])relief('cape','gold',[[sign*.211,-.031],[sign*.25,-.18],[sign*.302,-.51],[sign*.282,-.86],[sign*.242,-1.074]],-.216,.014);
      } else if(hero===5) {
        cloak('cape','ivory',[[.026,.203,-.033],[-.15,.222,-.095],[-.45,.248,-.206],[-.79,.228,-.258,.06]]);
        if(detail) {
          plate('cape','cloth',[[-.08,-.199],[0,-.126],[.08,-.199],[.07,-.487],[0,-.566],[-.07,-.487]],-.20,.012);
          plate('cape','gold',[[-.046,-.288],[0,-.224],[.046,-.288],[0,-.402]],-.214,.009);
        }
      } else if (hero === 0 || boss || type === 'commander' || type === 'captain') {
        cloak('cape', 'lining', [[.025,.245,-.035],[ -.2,.30,-.10],[-.53,.39,-.22],[-.89,.44,-.28],[-1.08,.40,-.30,.055]]);
        plate('cape', 'gold', [[-.065,-.3],[0,-.22],[.065,-.3],[0,-.50]], -.215, .015);
      } else if (hero === 1) {
        cloak('cape', 'cloth', [[.045,.15,-.015],[-.15,.12,-.1],[-.48,.09,-.22],[-.65,.045,-.23,.055]]);
      } else if (hero === 2) {
        cloak('cape', 'cloth', [[.08,.19,.015],[-.06,.18,-.035],[-.22,.12,-.09],[-.50,.09,-.18,.04]]);
      } else if (hero === 3 || type === 'sentinel') {
        cloak('cape', 'lining', [[.01,.31,-.045],[-.2,.35,-.13],[-.55,.32,-.23,.05]]);
      }
      if(detail&&heavy) {
        // Torvek's broad fur mantle and Odran's spikes read above army heads.
        contour('torso','leather',[[.405,.34,.23,0,-.06],[.46,.32,.21,0,-.06],[.50,.22,.13,0,-.04]],16,1.03,Math.PI*2-2.06,false);
        for(const sign of [-1,1])for(let tuft=0;tuft<5;tuft++)plate('torso','leather',[[sign*(.17+tuft*.039),.47],[sign*(.20+tuft*.042),.45],[sign*(.18+tuft*.048),.345],[sign*(.15+tuft*.039),.397]],-.04,.18);
      }
      if(detail&&type==='azrakan') {
        contour('neck','gold',[[.045,.105,.10],[-.02,.12,.13],[-.08,.18,.155]],16);
        for(const sign of [-1,1])plate('torso','gold',[[sign*.06,.26],[sign*.21,.39],[sign*.29,.47],[sign*.19,.25],[sign*.11,.08]],.21,.035);
      }
      if (faction && hero < 0) {
        // Enemy crescent insignia and angular pauldrons distinguish allegiance
        // even when colors are difficult to read in the night stage.
        plate('torso', 'gold', [[-.073,.31],[0,.25],[.073,.31],[.035,.22],[0,.19],[-.035,.22]], .218, .017);
      }
      if(profile) {
        // New champions retain the proven articulated rig, while their head,
        // mantle, heraldry and weapon silhouettes remain individually authored.
        const crest=profile.crest;
        if(crest==='jade') {
          for(const sign of [-1,1])plate('head','gold',[[sign*.035,.22],[sign*.083,.28],[sign*.12,.54],[sign*.18,.61],[sign*.13,.37],[sign*.09,.20]],-.015,.040);
          plate('torso','gold',[[-.12,.28],[0,.42],[.12,.28],[.064,.21],[0,.27],[-.064,.21]],.229,.019);
          if(detail)cloak('cape','cloth',[[.024,.265,-.052],[-.22,.31,-.122],[-.58,.38,-.24],[-1.09,.34,-.34,.12]]);
        } else if(crest==='moon') {
          for(const sign of [-1,1])plate('head','edge',[[sign*.11,.15],[sign*.19,.21],[sign*.28,.39],[sign*.23,.38],[sign*.15,.22]],.028,.025);
          contour('head','gold',[[.19,.149,.13],[.21,.147,.128]],16);
          for(const side of ['L','R'])plate('arm'+side,'edge',[[-.05,.06],[.05,.11],[.12,.22],[.10,.01],[-.05,-.06]],.13,.027);
        } else if(crest==='sun') {
          contour('head','cloth',[[.23,.15,.133],[.29,.155,.13],[.33,.11,.105]],16);
          plate('head','gold',[[-.067,.20],[0,.41],[.067,.20],[0,.23]],.139,.023);
          medallion('torso',0,.29,.185,.065);
          for(const sign of [-1,1])plate('cape','cloth',[[sign*.055,.04],[sign*.11,.04],[sign*.15,-.89],[sign*.09,-1.05]],-.23,.012);
        } else if(crest==='frost') {
          for(const sign of [-1,1]) {
            plate('head','ivory',[[sign*.10,.18],[sign*.21,.28],[sign*.26,.49],[sign*.21,.44],[sign*.18,.27]],.015,.055);
            contour('arm'+(sign<0?'L':'R'),'ivory',[[.035,.16,.16],[.105,.18,.17],[.18,.12,.11]],12);
          }
          medallion('torso',0,.24,.232,.083,'edge');
        } else if(crest==='ember') {
          for(const sign of [-1,1])plate('head','gold',[[sign*.03,.20],[sign*.13,.28],[sign*.14,.53],[sign*.21,.64],[sign*.19,.35],[sign*.085,.22]],-.034,.035);
          plate('cape','cloth',[[-.11,-.16],[0,-.05],[.11,-.16],[.075,-.61],[0,-.76],[-.075,-.61]],-.26,.010);
          for(const side of ['L','R'])plate('arm'+side,'gold',[[-.07,.05],[0,.22],[.12,.09],[.13,-.07],[.05,-.13]],.145,.036);
        } else if(crest==='storm') {
          contour('head','cloth',[[.37,.065,.065,0,-.03],[.30,.15,.15,0,-.035],[.12,.167,.162,0,-.035],[-.10,.12,.127,0,-.025]],16,1.08,Math.PI*2-2.16,false);
          plate('head','lining',[[-.09,.061],[.09,.061],[.072,-.022],[0,-.052],[-.072,-.022]],.137,.018);
          for(const sign of [-1,1])plate('torso','edge',[[sign*.018,.32],[sign*.074,.39],[sign*.096,.23],[sign*.048,.15],[sign*.062,.28]],.195,.014);
        }
        if(detail)for(const sign of [-1,1])relief('cape','gold',[[sign*.10,-.16],[sign*.16,-.30],[sign*.115,-.46]],-.255,.010);
      } else if(identity!==type&&officer) {
        for(const sign of [-1,1])plate('head','gold',[[sign*.12,.18],[sign*.17,.26],[sign*.22,.42],[sign*.16,.37]],.020,.030);
        if(detail)medallion('torso',0,.28,.233,.086);
      }
      let tip = [0,1.16,0], offTip=[0,.72,0], grip=[0,-.20,0], weaponLength=1.16;
      const sword = (joint, long = 1.1, curve = false) => {
        tube(joint, 'leather', -.17, .15, .037, .035);
        bar(joint, 'gold', 0, .13, 0, .31, .052, .065);
        ellipsoid(joint,'gold',0,-.185,0,.056,.046,.045,6);
        const blade = curve ? [[-.045,.16],[.07,.16],[.10,long*.6],[.17,long*.91],[.095,long],[.006,long*.76],[-.035,long*.45]] : [[-.085,.16],[.085,.16],[.123,.25],[.098,long-.18],[0,long],[-.098,long-.18],[-.123,.25]];
        plate(joint, 'edge', blade, 0, .045);
        if(detail) plate(joint,'steel',[[-.015,.2],[.015,.2],[.015,long-.21],[0,long-.12],[-.015,long-.21]],.026,.007);
      };
      const spear = (length = 1.72, fork = false) => {
        tube('weaponRoot','wood',-.83,length-.32,.027,.027);
        tube('weaponRoot','leather',-.17,.22,.036,.035);
        tube('weaponRoot','gold',length-.39,length-.28,.047,.043);
        plate('weaponRoot','edge',[[-.055,length-.32],[0,length-.47],[.055,length-.32],[.08,length-.23],[0,length],[-.08,length-.23]],0,.05);
        if(fork) for(const s of [-1,1]) plate('weaponRoot','gold',[[s*.04,length-.30],[s*.13,length-.26],[s*.16,length-.02],[s*.11,length-.13],[s*.09,length-.32]],0,.036);
        tip=[0,length,0]; weaponLength=length+.83;
      };
      const crescentGlaive=()=>{
        const joint='weaponRoot';
        tube(joint,'wood',-.87,1.63,.029,.029);
        tube(joint,'leather',-.25,.26,.040,.038);
        for(const y of [-.24,.25,.98,1.51])tube(joint,'gold',y-.023,y+.023,.047,.045);
        // An original asymmetrical crescent edge, with a deep forged spine and
        // an open inner curve, remains recognizable through sweep animations.
        plate(joint,'steel',[[-.027,1.51],[-.127,1.65],[-.125,1.83],[.027,2.015],[.202,2.13],[.35,2.082],[.426,1.943],[.399,1.738],[.270,1.582],[.103,1.552],[.241,1.701],[.274,1.852],[.190,1.990],[.087,1.896],[.045,1.728],[.026,1.51]],0,.082);
        plate(joint,'edge',[[-.125,1.83],[.027,2.015],[.202,2.13],[.35,2.082],[.426,1.943],[.399,1.738],[.270,1.582],[.241,1.614],[.365,1.760],[.391,1.936],[.325,2.046],[.198,2.090],[.060,1.990],[-.091,1.810]],.003,.087);
        tube(joint,'gold',1.40,1.61,.063,.055);
        plate(joint,'gold',[[-.052,1.541],[.030,1.547],[.062,1.722],[.098,1.863],[.136,1.916],[.111,1.793],[.086,1.591],[.037,1.492]],.050,.017);
        plate(joint,'edge',[[-.035,-.875],[.035,-.875],[.047,-.816],[0,-.972],[-.047,-.816]],0,.058);
        if(detail) {
          relief(joint,'gold',[[.028,1.719],[.009,1.830],[.069,1.951],[.17,2.035],[.236,2.040]],.048,.007);
          filigree(joint,.095,1.985,.048,.64,1);
          for(let wrap=0;wrap<8;wrap++)relief(joint,'ivory',[[-.034,-.20+wrap*.054],[.034,-.173+wrap*.054]],.037,.006);
          for(let tassel=0;tassel<5;tassel++)plate(joint,'cloth',[[-.067-tassel*.012,1.453],[-.049-tassel*.012,1.449],[-.067-tassel*.017,1.096+tassel*.021],[-.091-tassel*.019,1.064+tassel*.019]],-.012,.008);
        }
        tip=[.202,2.13,0];grip=[0,-.20,0];weaponLength=3.10;
      };
      const axe = () => {
        tube('weaponRoot','wood',-.36,1.21,.041,.04);
        tube('weaponRoot','leather',-.25,.23,.053,.05);
        tube('weaponRoot','gold',.84,1.15,.065,.058);
        plate('weaponRoot','steel',[[-.065,.81],[-.23,.81],[-.43,.63],[-.48,.91],[-.37,1.29],[-.16,1.16],[.06,1.16],[.12,1.02],[.06,.84]],0,.095);
        plate('weaponRoot','edge',[[-.43,.63],[-.48,.91],[-.37,1.29],[-.32,1.23],[-.40,.91],[-.37,.72]],.003,.102);
        plate('weaponRoot','gold',[[-.14,.90],[-.24,1.04],[-.13,1.14],[-.07,1.03]],.055,.018);
        tip=[-.37,1.29,0];grip=[0,-.20,0];weaponLength=1.70;
      };
      const shield = (large=false) => {
        const w=large?.40:.33,h=large?.53:.44;
        const outline=[[-w,h*.65],[-w*.82,h],[w*.82,h],[w,h*.65],[w*.78,-h*.68],[0,-h],[-w*.78,-h*.68]];
        plate('offhandRoot','steel',outline,.145,.065);
        plate('offhandRoot','cloth',outline.map(p=>[p[0]*.86,p[1]*.86]),.186,.017);
        plate('offhandRoot','gold',[[-.055,.25],[.055,.25],[.055,.08],[.16,.08],[.16,-.025],[.055,-.025],[.055,-.26],[-.055,-.26],[-.055,-.025],[-.16,-.025],[-.16,.08],[-.055,.08]],.20,.02);
        ellipsoid('offhandRoot','steel',0,.026,.22,.065,.065,.043,8);
        offTip=[0,.5,.22];
      };
      const dawnShield=()=>{
        const joint='offhandRoot',w=.355,h=.47;
        const outline=[[-w*.73,h*.86],[-w*.94,h*.53],[-w,h*.12],[-w*.89,-h*.40],[-w*.55,-h*.79],[0,-h],[w*.55,-h*.79],[w*.89,-h*.40],[w,h*.12],[w*.94,h*.53],[w*.73,h*.86],[0,h]];
        plate(joint,'gold',outline,.144,.067);
        plate(joint,'ivory',outline.map(p=>[p[0]*.91,p[1]*.91]),.184,.027);
        plate(joint,'cloth',[[0,.372],[.226,.244],[.252,.061],[.201,-.199],[0,-.397],[-.201,-.199],[-.252,.061],[-.226,.244]],.206,.019);
        ellipsoid(joint,'gold',0,.020,.226,.099,.099,.031,16);
        ellipsoid(joint,'steel',0,.020,.255,.054,.054,.025,14);
        // A sun-flower shield boss is original ornament rather than heraldry
        // taken from a franchise, and its wide light rim reads in battle.
        for(let ray=0;ray<12;ray++) {
          const angle=ray/12*Math.PI*2,dx=Math.sin(angle),dy=Math.cos(angle),nx=Math.cos(angle)*.018,ny=-Math.sin(angle)*.018;
          plate(joint,'gold',[[dx*.117+nx,.02+dy*.117+ny],[dx*.245,.02+dy*.245],[dx*.117-nx,.02+dy*.117-ny]],.225,.012);
        }
        if(detail) {
          for(const sign of [-1,1]) {
            filigree(joint,sign*.185,.253,.213,.80,sign);
            filigree(joint,sign*.112,-.276,.213,.75,sign);
          }
          // Retained rear straps make the shield visibly carried by the hand.
          bar(joint,'leather',0,.063,.098,.159,.037,.023);
          for(const sign of [-1,1])bar(joint,'leather',sign*.088,.06,.104,.020,.159,.022);
        }
        offTip=[0,.47,.258];
      };
      if(profile?.weapon==='saber') {
        sword('weaponRoot',1.36,true);tip=[.095,1.36,0];weaponLength=1.54;
        plate('weaponRoot','gold',[[-.17,.13],[-.18,.20],[-.11,.24],[-.07,.18],[.11,.18],[.19,.23],[.19,.16]],0,.056);
      } else if(profile?.weapon==='twins'||profile?.weapon==='daggers') {
        const long=profile.weapon==='daggers'?.72:1.01;
        sword('weaponRoot',long,true);sword('offhandRoot',long-.035,true);tip=[.095,long,0];offTip=[.095,long-.035,0];weaponLength=long+.18;
        if(detail)for(const joint of ['weaponRoot','offhandRoot'])for(const sign of [-1,1])plate(joint,'gold',[[sign*.04,.15],[sign*.15,.20],[sign*.19,.34],[sign*.13,.30],[sign*.08,.19]],0,.028);
      } else if(profile?.weapon==='sunSpear') {
        spear(2.12);
        for(const sign of [-1,1])plate('weaponRoot','gold',[[sign*.035,1.78],[sign*.19,1.86],[sign*.25,2.03],[sign*.19,1.97],[sign*.11,1.90]],0,.042);
        medallion('weaponRoot',0,1.78,.040,.068);
      } else if(profile?.weapon==='frostAxe') {
        axe();plate('weaponRoot','edge',[[.045,.84],[.17,.80],[.35,.67],[.34,1.14],[.20,1.30],[.13,1.11],[.045,1.10]],0,.085);
        if(detail)relief('weaponRoot','gold',[[-.36,.91],[-.22,1.08],[-.14,.96],[0,1.11],[.19,.97],[.28,1.10]],.056,.015);
        tip=[-.37,1.29,0];weaponLength=1.70;
      } else if(profile?.weapon==='ward') {
        sword('weaponRoot',1.21);shield(true);tip=[0,1.21,0];weaponLength=1.39;
        plate('offhandRoot','gold',[[-.15,.21],[0,.38],[.15,.21],[.09,.12],[.12,-.12],[0,-.33],[-.12,-.12],[-.09,.12]],.234,.025);
      } else if(hero===4) {
        crescentGlaive();
      } else if(hero===5) {
        sword('weaponRoot',1.11);dawnShield();
        plate('weaponRoot','gold',[[-.164,.113],[-.197,.169],[-.140,.212],[-.093,.158],[.093,.158],[.14,.212],[.197,.169],[.164,.113]],0,.066);
        if(detail) {
          medallion('weaponRoot',0,.136,.044,.025);
          for(const sign of [-1,1])relief('weaponRoot','gold',[[sign*.022,.26],[sign*.040,.64],[sign*.025,.932]],.028,.006);
          for(let wrap=0;wrap<5;wrap++)bar('weaponRoot','ivory',0,-.125+wrap*.049,.038,.05,.008,.006);
        }
        tip=[0,1.11,0];weaponLength=1.29;
      } else if(hero===1||['pike','sentinel','azrakan'].includes(type)) {
        spear(type==='azrakan'?2.18:hero===1?2.0:1.62,type==='azrakan');
        if(type==='sentinel')shield(true);
      } else if(hero===2||type==='duelist') {
        sword('weaponRoot',.88,true);sword('offhandRoot',.82,true);tip=[.095,.88,0];offTip=[.095,.82,0];weaponLength=1.05;
      } else if(hero===3||type==='odran') {
        axe();
      } else if(type==='warcaller') {
        tube('weaponRoot','wood',-.4,1.42,.035);
        tube('weaponRoot','gold',1.10,1.37,.085,.085);
        plate('weaponRoot','gold',[[-.19,1.25],[-.25,1.42],[-.17,1.59],[-.04,1.38],[0,1.65],[.04,1.38],[.17,1.59],[.25,1.42],[.19,1.25]],0,.075);
        tip=[0,1.65,0];weaponLength=2.05;
      } else if(type==='archer') {
        const bow=bucket('weaponRoot','wood');
        // Bent laminated bow, round in section, faces forward toward +Z.
        const base=bow.p.length/3, rows=13, rings=6;
        for(let j=0;j<rows;j++) {
          const u=j/(rows-1)*2-1, y=u*.61, z=.035+u*u*.23;
          for(let k=0;k<rings;k++) {const a=k/rings*Math.PI*2;bow.p.push(Math.cos(a)*.032,y, z+Math.sin(a)*.028);}
        }
        for(let j=0;j<rows-1;j++)for(let k=0;k<rings;k++) {const a=base+j*rings+k,b=base+j*rings+(k+1)%rings;bow.i.push(a,b,a+rings,b,b+rings,a+rings);}
        tube('weaponRoot','leather',-.10,.10,.045,.045,0,.038);
        tube('weaponRoot','gold',-.59,.59,.004,.004,0,.268);
        // Arrow and quiver have visible volume; draw pose is animated by rig.
        bar('weaponRoot','wood',0,0,.46,.016,.016,.9);
        plate('weaponRoot','edge',[[-.035,-.018],[.035,-.018],[0,.045]],.90,.03);
        contour('torso','leather',[[.0,.08,.085,.17,-.22],[.34,.08,.085,.17,-.22]],7);
        for(const x of [.13,.17,.21])tube('torso','wood',.27,.52,.009,.009,x,-.22);
        tip=[0,0,.94];grip=[0,0,.268];weaponLength=1.22;
      } else {
        sword('weaponRoot',hero===0?1.38:officer?1.12:.91);tip=[0,hero===0?1.38:officer?1.12:.91,0];weaponLength=tip[1]+.18;
        if(['shield','captain','commander'].includes(type))shield(type==='captain');
      }
      // Bake the deliberate cloth/skin/leather/plate color blocking into vertex
      // colors, then merge by roughness class. This preserves metal highlights
      // while limiting each anatomical joint to at most two draw calls.
      const palette=this.palette(faction,appearanceHero,identity), merged=new Map();
      for(const g of groups.values()) {
        const mat=['steel','edge','gold'].includes(g.mat)?'metallic':detail&&g.mat==='skin'?'flesh':'matte';
        const key=g.joint+':'+mat;
        if(!merged.has(key))merged.set(key,{joint:g.joint,mat,p:[],i:[],c:[],weights:[]});
        const out=merged.get(key),base=out.p.length/3,color=B.Color3.FromHexString(palette[g.mat]);
        for(const p of g.p)out.p.push(p);
        for(const index of g.i)out.i.push(index+base);
        for(let k=0;k<g.p.length/3;k++) {
          out.c.push(color.r,color.g,color.b,1);
          if(detail) out.weights.push(this.skinWeights(g.joint,g.mat,g.p[k*3],g.p[k*3+1],g.p[k*3+2],armLength,forearmLength));
        }
      }
      // Store reusable Babylon Geometry objects, one per joint/roughness class.
      const parts=[];let triangleCount=0;
      for(const g of merged.values()) {
        const data=new B.VertexData();data.positions=g.p;data.indices=g.i;data.colors=g.c;
        data.normals=[];B.VertexData.ComputeNormals(g.p,g.i,data.normals);
        const geometry=new B.Geometry('warrior-geometry-'+identity+'-'+faction+'-'+g.joint+'-'+g.mat+'-'+detail,this.scene,data,false);
        // A disabled source retains the shared Geometry when the last visible
        // instance is disposed (hero preview switching and pooled officers).
        const source=new B.Mesh('warrior-source-'+type+'-'+g.joint+'-'+g.mat,this.scene);
        geometry.applyToMesh(source);source.setEnabled(false);source.isPickable=false;
        parts.push({geometry,source,joint:g.joint,mat:g.mat,weights:g.weights});triangleCount+=g.i.length/3;
      }
      return {parts,tip,offhandTip:offTip,grip,weaponLength,triangleCount};
    }
    dispose() {
      for(const template of this.cache.values())for(const p of [...template.parts,...(template.skinParts||[])]){p.source.dispose(false,false);if(!p.geometry.isDisposed())p.geometry.dispose();}
      for(const m of this.materialCache.values())m.dispose(false,false);
      for(const texture of this.textureCache.values())texture.dispose();
      this.textureCache.clear();
      this.cache.clear();this.materialCache.clear();
    }
  }


  // Three original warhorses share textures and pooled articulated meshes.
  // Horse simulation owns travel/phase; rendering never advances gameplay.
  class HorseVisual {
    constructor(scene,mats) {
      this.scene=scene;this.mats=mats;this.rigs=[];this.visibleCount=0;
      this.materials={};
      const material=(name,color,shine=.02)=>{
        const m=new B.StandardMaterial('warhorse-'+name,scene);
        m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(shine,shine,shine);m.specularPower=48;m.maxSimultaneousLights=3;
        this.materials[name]=m;return m;
      };
      const hair=new B.DynamicTexture('original-fine-horse-coat',128,scene,true,B.Texture.TRILINEAR_SAMPLINGMODE),ctx=hair.getContext();
      ctx.fillStyle='#dedbd4';ctx.fillRect(0,0,128,128);
      for(let i=0;i<900;i++) {const x=(i*37)%128,y=(i*53)%128;ctx.strokeStyle=i%3?'rgba(80,67,50,.045)':'rgba(255,255,255,.12)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+1,y+3+i%4);ctx.stroke();}
      hair.update(false);hair.uScale=3;hair.vScale=3;
      for(const [name,color] of [['chestnut','#a05e38'],['white','#ddd9cb'],['bay','#453027']]) {material(name,color,.09).diffuseTexture=hair;}
      material('mane','#241e1c');material('lightMane','#b0ab9e');material('leather','#382a22',.035);material('hoof','#252b2c',.08);material('eye','#101518',.4);material('mark','#e6ddcc');
      this.materials.gold=mats.bronze||mats.gold;this.materials.cloth=mats.ally;this.materials.enemy=mats.enemy;
      for(let i=0;i<3;i++)this.rigs.push(this.build(i));
      const dustTexture=new B.DynamicTexture('warhorse-hoof-dust-texture',32,scene,false,B.Texture.BILINEAR_SAMPLINGMODE),dc=dustTexture.getContext(),fade=dc.createRadialGradient(16,16,0,16,16,16);
      fade.addColorStop(0,'rgba(215,191,153,.35)');fade.addColorStop(1,'rgba(215,191,153,0)');dc.fillStyle=fade;dc.fillRect(0,0,32,32);dustTexture.hasAlpha=true;dustTexture.update(false);
      const dustMat=material('dust','#b9a180');dustMat.diffuseTexture=dustTexture;dustMat.useAlphaFromDiffuseTexture=true;dustMat.disableLighting=true;dustMat.backFaceCulling=false;
      this.dust=Array.from({length:12},()=>{const m=B.MeshBuilder.CreatePlane('pooled-warhorse-hoof-dust',{size:1},scene);m.material=dustMat;m.billboardMode=B.Mesh.BILLBOARDMODE_ALL;m.isPickable=false;m.setEnabled(false);return {m,life:0,duration:.36};});
      this.dustCursor=0;this.dustClock=0;
    }
    build(index) {
      const scene=this.scene,root=new B.TransformNode('warhorse-'+index,scene),body=new B.TransformNode('warhorse-body-'+index,scene),neck=new B.TransformNode('warhorse-neck-'+index,scene),tail=new B.TransformNode('warhorse-tail-'+index,scene);
      body.parent=root;neck.parent=body;neck.position.set(0,1.75,.69);tail.parent=body;tail.position.set(0,1.66,-.96);
      const coat=this.materials[['chestnut','white','bay'][index]],mane=this.materials[index===1?'lightMane':'mane'],groups=new Map(),legs=[];
      const collect=(mesh,parent,mat)=>{mesh.material=mat;mesh.isPickable=false;const key=parent.name+':'+mat.name;if(!groups.has(key))groups.set(key,{parent,mat,parts:[]});groups.get(key).parts.push(mesh);return mesh;};
      const oval=(parent,x,y,z,w,h,d,mat=coat,rx=0)=>{const m=B.MeshBuilder.CreateSphere('horse-authored-volume',{diameter:1,segments:12},scene);m.position.set(x,y,z);m.scaling.set(w,h,d);m.rotation.x=rx;return collect(m,parent,mat);};
      const box=(parent,x,y,z,w,h,d,mat)=>{const m=B.MeshBuilder.CreateBox('horse-tack',{width:w,height:h,depth:d},scene);m.position.set(x,y,z);return collect(m,parent,mat);};
      const tube=(parent,points,radius,mat)=>{const m=B.MeshBuilder.CreateTube('horse-leather-line',{path:points.map(p=>new B.Vector3(...p)),radius,tessellation:6,cap:B.Mesh.CAP_ALL},scene);return collect(m,parent,mat);};
      const loft=(parent,rings,mat)=>{
        const positions=[],indices=[],normals=[],uvs=[],segments=16;
        for(let i=0;i<rings.length;i++) {
          const r=rings[i],before=rings[Math.max(0,i-1)],after=rings[Math.min(rings.length-1,i+1)],length=Math.max(.001,Math.hypot(after[1]-before[1],after[2]-before[2])),ty=(after[1]-before[1])/length,tz=(after[2]-before[2])/length;
          for(let j=0;j<=segments;j++) {const a=j/segments*Math.PI*2;positions.push(r[0]+Math.sin(a)*r[3],r[1]-Math.cos(a)*r[4]*tz,r[2]+Math.cos(a)*r[4]*ty);uvs.push(j/segments,i/(rings.length-1));if(i<rings.length-1&&j<segments){const k=i*(segments+1)+j;indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}}
        }
        // Capped end rings preserve a solid silhouette at every camera angle.
        for(const end of [0,rings.length-1]) {const r=rings[end],center=positions.length/3;positions.push(r[0],r[1],r[2]);uvs.push(.5,end?1:0);for(let j=0;j<segments;j++){const k=end*(segments+1)+j;if(end)indices.push(center,k,k+1);else indices.push(center,k+1,k);}}
        B.VertexData.ComputeNormals(positions,indices,normals);const data=new B.VertexData();data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=uvs;const m=new B.Mesh('original-warhorse-anatomy',scene);data.applyToMesh(m);return collect(m,parent,mat);
      };
      // Withers, barrel, shoulder and haunches form a continuous animal silhouette.
      oval(body,0,1.47,-.06,.90,.85,1.98);oval(body,0,1.54,.60,.78,.88,.84);oval(body,0,1.48,-.68,.94,.84,.79);
      oval(body,0,1.87,.04,.61,.22,1.18);oval(body,0,1.16,.11,.61,.35,1.31);
      loft(neck,[[0,-.17,-.06,.30,.35],[0,.16,.05,.29,.30],[0,.47,.18,.25,.27],[0,.73,.31,.19,.22],[0,.94,.39,.16,.16]],coat);
      loft(neck,[[0,.95,.51,.17,.23],[0,.91,.67,.205,.22],[0,.79,.88,.16,.17],[0,.64,1.06,.145,.115],[0,.60,1.16,.145,.09]],coat);
      oval(neck,0,.60,1.13,.30,.21,.20,index===1?this.materials.lightMane:this.materials.leather,-.38);
      for(const side of [-1,1]) {
        oval(neck,side*.145,1.18,.48,.14,.35,.16,coat,side*.14);oval(neck,side*.149,1.18,.493,.07,.23,.035,mane,side*.14);
        oval(neck,side*.209,.90,.69,.042,.068,.082,this.materials.eye);oval(neck,side*.148,.61,1.17,.036,.045,.063,this.materials.eye);
        tube(neck,[[side*.22,.72,.73],[side*.18,.60,1.04],[side*.16,.62,1.18]],.020,this.materials.leather);
        tube(neck,[[side*.217,.83,.59],[side*.219,.71,.77],[side*.18,.70,1.02]],.019,this.materials.leather);
        oval(neck,side*.224,.74,.73,.055,.055,.055,this.materials.gold);
      }
      if(index!==1) {oval(neck,0,.90,.87,.08,.36,.022,this.materials.mark,-.36);oval(neck,0,.71,1.064,.13,.18,.016,this.materials.mark,-.4);}
      loft(neck,[[0,-.07,-.18,.075,.11],[0,.17,-.13,.073,.115],[0,.41,-.01,.070,.105],[0,.66,.12,.067,.090],[0,.88,.25,.065,.075]],mane);
      oval(neck,0,1.02,.49,.19,.24,.28,mane,-.4);
      oval(tail,0,-.31,-.18,.18,.81,.23,mane,.35);oval(tail,0,-.69,-.35,.17,.56,.23,mane,.46);
      // Saddlecloth, padded seat, girth and metal stirrups are visible at riding distance.
      oval(body,0,1.935,-.06,.91,.11,.88,this.materials.cloth);box(body,0,1.983,-.05,.59,.12,.68,this.materials.leather);
      oval(body,0,2.035,.30,.66,.16,.17,this.materials.leather);oval(body,0,2.018,-.40,.66,.17,.14,this.materials.leather);
      for(const side of [-1,1]) {
        box(body,side*.443,1.685,-.08,.045,.47,.82,this.materials.cloth);box(body,side*.47,1.475,-.08,.035,.035,.85,this.materials.gold);
        tube(body,[[side*.31,1.97,-.06],[side*.49,1.70,-.04],[side*.49,1.25,.06]],.025,this.materials.leather);
        tube(body,[[side*.46,1.34,.05],[side*.46,1.15,-.06],[side*.46,1.11,.15],[side*.46,1.34,.18]],.028,this.materials.gold);
        tube(body,[[side*.40,1.83,.18],[side*.47,1.44,.18],[side*.30,1.06,.18]],.025,this.materials.leather);
        for(let j=0;j<4;j++)box(body,side*.47,1.58,-.36+j*.18,.028,.095,.035,this.materials.gold);
      }
      const reins=[];
      for(const side of [-1,1]) {
        const m=B.MeshBuilder.CreateTube('horse-rein-'+index+'-'+side,{path:[new B.Vector3(side*.19,2.46,1.56),new B.Vector3(side*.22,2.14,.83),new B.Vector3(side*.19,2.37,.24)],radius:.013,tessellation:5},scene);
        m.parent=root;m.material=this.materials.leather;m.isPickable=false;reins.push(m);
      }
      for(const fore of [true,false])for(const side of [-1,1]) {
        const upper=new B.TransformNode('horse-upper-leg-'+index+'-'+fore+'-'+side,scene);upper.parent=body;upper.position.set(side*.32,1.39,fore?.57:-.69);
        const knee=new B.TransformNode('horse-knee-'+index+'-'+fore+'-'+side,scene);knee.parent=upper;knee.position.y=-.57;
        const foot=new B.TransformNode('horse-hoof-joint-'+index+'-'+fore+'-'+side,scene);foot.parent=knee;foot.position.y=-.60;
        oval(upper,0,-.17,0,fore?.24:.32,.56,fore?.27:.35);oval(upper,0,-.43,.015,.13,.32,.15);
        oval(knee,0,-.05,0,.14,.14,.15);oval(knee,0,-.30,.016,.105,.51,.115,index===2?this.materials.mane:coat);
        box(foot,0,-.062,.049,.165,.17,.22,this.materials.hoof);oval(foot,0,-.055,.125,.165,.17,.11,this.materials.hoof);oval(foot,0,.08,.009,.125,.14,.135,index===0?this.materials.mark:coat);
        legs.push({upper,knee,foot,fore,side});
      }
      const meshes=[];
      for(const group of groups.values()) {
        const merged=group.parts.length>1?B.Mesh.MergeMeshes(group.parts,true,true,undefined,false,false):group.parts[0];
        merged.parent=group.parent;merged.material=group.mat;merged.isPickable=false;merged.receiveShadows=true;merged.alwaysSelectAsActiveMesh=false;meshes.push(merged);
      }
      const shadow=flatRing('warhorse-ground-contact-'+index,scene,28,0);shadow.material=this.mats.shadow;shadow.isPickable=false;shadow.scaling.set(.66,1,1.30);
      root.setEnabled(false);shadow.setEnabled(false);
      const world=typeof app!=='undefined'&&app.world?.scene===scene?app.world:null;
      if(world)for(const mesh of meshes.filter(m=>m.parent===body&&m.material===coat||m.parent===neck&&m.material===coat))world.registerShadowCaster(mesh,1);
      return {root,body,neck,tail,legs,meshes,reins,shadow,index,lastYaw:0,turn:0};
    }
    update(horses,p,dt,t,budget) {
      this.visibleCount=0;const viewDistance=budget?.effective==='performance'?85:130;
      for(let i=0;i<this.rigs.length;i++) {
        const rig=this.rigs[i],h=horses?.[i],visible=!!h&&Math.hypot(h.x-p.x,h.z-p.z)<viewDistance;
        rig.root.setEnabled(visible);rig.shadow.setEnabled(visible);if(!visible)continue;this.visibleCount++;
        const speed=Math.max(0,Math.abs(h.speed||0)),gait=Math.min(1,speed/6),gallop=Math.min(1,Math.max(0,(speed-5.6)/4)),phase=h.phase||0,breath=Math.sin(t*1.8+i)*.008;
        const bob=Math.abs(Math.sin(phase*2))*.027*gait+Math.sin(phase)*.037*gallop;
        rig.root.position.set(h.x,(h.y||0),h.z);rig.root.rotation.y=h.yaw||0;
        const turn=dt>0?clamp(wrap((h.yaw||0)-rig.lastYaw)/dt,-2,2):0;rig.lastYaw=h.yaw||0;rig.turn=lerp(rig.turn,turn,1-Math.exp(-dt*8));
        rig.body.position.y=bob+breath;rig.body.rotation.x=Math.sin(phase)*.025*gallop;rig.body.rotation.z=-rig.turn*.035*gait;
        rig.neck.rotation.x=-.07*gallop+Math.sin(phase+1)*.024*gait+Math.sin(t*1.3+i)*.012*(1-gait);
        rig.neck.rotation.y=Math.sin(t*.75+i*1.6)*.045*(1-gait);rig.tail.rotation.x=.1+gait*.18;rig.tail.rotation.z=Math.sin(t*3+phase)*(.10+gait*.12);
        for(let j=0;j<rig.legs.length;j++) {
          const leg=rig.legs[j],walkPhase=phase+(leg.fore?(leg.side<0?0:Math.PI):(leg.side<0?Math.PI*1.5:Math.PI*.5)),trotPhase=phase+(leg.fore?(leg.side<0?0:Math.PI):(leg.side<0?Math.PI:0)),runPhase=phase+(leg.fore?(leg.side<0?.26:0):(leg.side<0?2.18:2.65));
          const swing=(Math.sin(walkPhase)*(1-gallop)+Math.sin(runPhase)*gallop),trot=Math.min(1,Math.max(0,(speed-2)/2.6))*(1-gallop),beat=swing*(1-trot)+Math.sin(trotPhase)*trot;
          leg.upper.rotation.x=beat*gait*(.39+.33*gallop);leg.knee.rotation.x=Math.max(0,-beat)*gait*(leg.fore?.78:-.68);leg.foot.rotation.x=-leg.upper.rotation.x*.5-leg.knee.rotation.x*.65;
          // A small visual extension cancels stance compression, grounding the hooves.
          leg.upper.position.y=1.39-bob*.5+Math.max(0,beat)*gait*.025;
        }
        for(const rein of rig.reins)rein.setEnabled(!!h.mounted);
        rig.shadow.position.set(h.x,.055,h.z);rig.shadow.rotation.y=h.yaw||0;
      }
      this.dustClock+=dt;
      const ridden=horses?.find(h=>h.mounted);
      if(ridden&&Math.abs(ridden.speed||0)>3&&this.dustClock>.085&&(budget?.effectFactor??1)>.65) {
        this.dustClock=0;const item=this.dust[this.dustCursor++%this.dust.length],side=this.dustCursor%2?1:-1,yaw=ridden.yaw||0;
        item.life=item.duration=.30;item.m.position.set(ridden.x-Math.sin(yaw)*.65+Math.cos(yaw)*side*.25,.10,ridden.z-Math.cos(yaw)*.65-Math.sin(yaw)*side*.25);item.m.setEnabled(true);
      }
      for(const d of this.dust)if(d.life>0) {d.life=Math.max(0,d.life-dt);const age=1-d.life/d.duration;d.m.scaling.setAll(.18+age*.85);d.m.position.y+=dt*.18;d.m.visibility=(1-age)*.60;d.m.setEnabled(d.life>0);}
    }
  }

  class ActorRenderer {
  constructor(scene,mats) {
    this.scene=scene;this.mats=mats;this.factory=new CharacterFactory(scene,mats);this.animator=new CharacterAnimator();
    this.hero=this.factory.create(save.data.selectedHero,{faction:0,detail:true});
    this.hero.parts=this.hero.parts||[];
    // The controlled actor must stay renderable during camera swings, leaps and
    // context restoration. The fixed officer pool is equally small and bounded.
    this.keepRigActive(this.hero);
    this.shadowWorld=typeof app!=='undefined'&&app.world?.scene===scene?app.world:null;
    if(this.shadowWorld)for(const mesh of this.hero.meshes)this.shadowWorld.registerShadowCaster(mesh,0);
    this.capacity=520;this.officerBudget=8;this.officers=[];this.records=new Array(this.capacity);this.batches=[];this.farBatches=[];
    this.midCount=0;this.farCount=0;this.nearCount=0;this.animatedCount=0;this.lastRender=performance.now();this.visualClock=0;
    this.q=new B.Quaternion();this.scale=new B.Vector3(1,1,1);this.position=new B.Vector3();this.matrix=new B.Matrix();this.rootMatrix=new B.Matrix();this.inverse=new B.Matrix();this.localMatrix=new B.Matrix();
    this.jointMatrices=Array.from({length:19},()=>new B.Matrix());
    this.keys=['pelvis','torso','neck','head','armL','elbowL','handL','armR','elbowR','handR','legL','kneeL','footL','legR','kneeR','footR','cape','weaponRoot','offhandRoot'];
    this.index=new Map(this.keys.map((k,i)=>[k,i]));this.skeleton=[];this.skeletonByType={};this.crowdBody=[[],[]];this.equipment=[{},{}];this.templates=[{},{}];
    this.crowdMaterial=new B.StandardMaterial('crowd colored armor',scene);this.crowdMaterial.diffuseColor=B.Color3.White();this.crowdMaterial.specularColor=new B.Color3(.065,.065,.065);this.crowdMaterial.specularPower=18;
    this.crowdMaterial.backFaceCulling=false;
    // Vertex colours combine leather, skin, steel and faction cloth into one
    // draw per hinge. Equipment varies by role without duplicating every body.
    for(let faction=0;faction<2;faction++) {
      for(const type of ['raider','shield','pike','archer']) {
        const rig=this.factory.create(type,{faction,detail:false});this.templates[faction][type]=rig;
        if(!this.skeletonByType[type]) this.readSkeleton(rig,type);
        const equipment=rig.parts.filter(p=>p.joint==='weaponRoot'||p.joint==='offhandRoot');
        this.equipment[faction][type]=this.buildJointBatches(equipment,rig,'equipment '+type+' '+faction);
        if(type==='raider') this.crowdBody[faction]=this.buildJointBatches(rig.parts.filter(p=>p.joint!=='weaponRoot'&&p.joint!=='offhandRoot'),rig,'troop body '+faction);
        this.makeFarBatch(rig,faction,type);
        // Sources now contain baked independent buffers, so temporary authoring
        // rigs are immediately released. Factory geometries remain reusable.
        rig.dispose();this.templates[faction][type]=null;
      }
    }
    // One contact-shadow draw per faction; champions use the same affordable
    // disc rather than requiring a shadow map on the mobile performance mode.
    this.shadowBatches=[];
    for(let faction=0;faction<2;faction++) {
      const m=flatRing('warrior ground contact '+faction,scene,16,0);m.material=mats.shadow;m.isPickable=false;
      this.shadowBatches.push(this.registerBatch(m,-1,new B.Matrix(),faction));
    }
    this.heroShadow=flatRing('champion ground contact',scene,24,0);this.heroShadow.material=mats.shadow;this.heroShadow.isPickable=false;this.horseVisual=new HorseVisual(scene,mats);
    this.bearerPole=B.MeshBuilder.CreateCylinder('bearer standard',{diameter:.065,height:3,tessellation:7},scene);this.bearerPole.material=mats.wood;
    this.bearerCloth=B.MeshBuilder.CreatePlane('bearer cloth',{width:1.1,height:.7,sideOrientation:B.Mesh.DOUBLESIDE},scene);this.bearerCloth.material=mats.ally;
    this.bearerMark=B.MeshBuilder.CreateCylinder('bearer triangle',{diameter:.30,height:.026,tessellation:3},scene);this.bearerMark.material=mats.ivory;this.bearerMark.rotation.x=Math.PI/2;
    for(const m of [this.bearerPole,this.bearerCloth,this.bearerMark]) {m.isPickable=false;m.setEnabled(false);}
    this.trailMaterial=new B.StandardMaterial('weapon motion light',scene);this.trailMaterial.diffuseColor=new B.Color3(.74,.92,1);this.trailMaterial.emissiveColor=new B.Color3(.35,.58,.64);this.trailMaterial.specularColor=B.Color3.Black();this.trailMaterial.alpha=.38;
    this.trails=Array.from({length:24},()=>{const m=B.MeshBuilder.CreateCylinder('pooled weapon motion',{height:1,diameter:.045,tessellation:5},scene);m.material=this.trailMaterial;m.isPickable=false;m.setEnabled(false);return{m,life:0};});
    this.trailCursor=0;this.weaponMotion={tip:new B.Vector3(),grip:new B.Vector3(),offhandTip:new B.Vector3(),previousTip:new B.Vector3(),previousOffhand:new B.Vector3(),active:false,attackId:-1,valid:false};
    this.trailDirection=new B.Vector3();this.trailAxis=new B.Vector3(0,1,0);this.trailCross=new B.Vector3();
    this.diagnostics={nearDrawBudget:this.batches.length,farDrawBudget:this.farBatches.length,officerPool:8,activeOfficers:0,animatedActors:0,nearActors:0,farActors:0,characterTriangles:this.hero.triangleCount||0,trailSegments:0,animationMs:0};
  }
  keepRigActive(rig) {
    for(const mesh of rig.meshes||[]) {mesh.alwaysSelectAsActiveMesh=true;mesh.doNotSyncBoundingInfo=false;}
  }
  deathAgeOf(actor,state=null) {return Math.max(actor.deathTime||0,actor.renderDeathTime||0,state?.deathAge||0);}
  readSkeleton(rig,type=rig.type) {
    const skeleton=[];
    for(const key of this.keys) {
      const n=rig.nodes[key],parentName=n?.parent?this.keys.find(k=>rig.nodes[k]===n.parent):null;
      skeleton.push({key,parent:parentName?this.index.get(parentName):-1,position:n?n.position.clone():new B.Vector3(),rotation:n?n.rotation.clone():new B.Vector3()});
    }
    this.skeletonByType[type]=skeleton;if(!this.skeleton.length)this.skeleton=skeleton;
  }
  // Combine rigid pieces at one joint with baked vertex colours. The hero and
  // officers retain individually shaded materials; crowds retain their shapes.
  coloredGeometry(parts,rig,bakeWorld=false) {
    const p=[],n=[],c=[],indices=[];
    const point=new B.Vector3(),normal=new B.Vector3(),matrix=new B.Matrix(),inverse=new B.Matrix();
    rig.root.computeWorldMatrix(true);
    for(const part of parts) {
      const mesh=part.m;mesh.computeWorldMatrix(true);
      if(bakeWorld) matrix.copyFrom(mesh.getWorldMatrix());
      else {
        const joint=rig.nodes[part.joint];joint.computeWorldMatrix(true);joint.getWorldMatrix().invertToRef(inverse);mesh.getWorldMatrix().multiplyToRef(inverse,matrix);
      }
      const vp=mesh.getVerticesData(B.VertexBuffer.PositionKind),vn=mesh.getVerticesData(B.VertexBuffer.NormalKind),vc=mesh.getVerticesData(B.VertexBuffer.ColorKind),vi=mesh.getIndices(),offset=p.length/3,color=mesh.material?.diffuseColor||B.Color3.White();
      for(let i=0;i<vp.length;i+=3) {
        point.set(vp[i],vp[i+1],vp[i+2]);B.Vector3.TransformCoordinatesToRef(point,matrix,point);p.push(point.x,point.y,point.z);
        normal.set(vn?.[i]??0,vn?.[i+1]??1,vn?.[i+2]??0);B.Vector3.TransformNormalToRef(normal,matrix,normal);normal.normalize();n.push(normal.x,normal.y,normal.z);const ci=i/3*4;c.push(color.r*(vc?.[ci]??1),color.g*(vc?.[ci+1]??1),color.b*(vc?.[ci+2]??1),1);
      }
      for(let i=0;i<vi.length;i++) indices.push(offset+vi[i]);
    }
    const data=new B.VertexData();data.positions=p;data.normals=n;data.colors=c;data.indices=indices;return data;
  }
  buildJointBatches(parts,rig,label) {
    const grouped=new Map(),result=[];
    for(const part of parts) {if(!grouped.has(part.joint)) grouped.set(part.joint,[]);grouped.get(part.joint).push(part);}
    for(const [joint,pieces] of grouped) {
      const m=new B.Mesh(label+' '+joint,this.scene);this.coloredGeometry(pieces,rig).applyToMesh(m);m.material=this.crowdMaterial;m.useVertexColors=true;m.isPickable=false;
      const batch=this.registerBatch(m,this.index.get(joint),B.Matrix.Identity(),rig.faction);batch.type=rig.type;batch.mainHand=rig.mainHand;result.push(batch);
    }
    return result;
  }
  registerBatch(m,joint,local,faction) {
    m.alwaysSelectAsActiveMesh=true;m.doNotSyncBoundingInfo=true;
    const buf=new Float32Array(this.capacity*16);m.thinInstanceSetBuffer('matrix',buf,16,false);m.thinInstanceCount=0;m.setEnabled(false);
    m.setBoundingInfo(new B.BoundingInfo(new B.Vector3(-112,-4,-112),new B.Vector3(112,14,112)));
    const b={m,buf,joint,local,faction,count:0};this.batches.push(b);return b;
  }
  makeFarBatch(rig,faction,type) {
    // This is a single merged, volumetric humanoid with recognizable head,
    // shoulders, separate legs and its actual shield, bow or polearm.
    this.animator.update(rig,{type,faction,x:0,z:0,y:0,yaw:0,state:'Idle',hp:1},1/60,0);
    const m=new B.Mesh('formation silhouette '+faction+' '+type,this.scene);this.farGeometry(rig,faction,type).applyToMesh(m);m.material=this.crowdMaterial;m.useVertexColors=true;m.isPickable=false;
    m.alwaysSelectAsActiveMesh=true;m.doNotSyncBoundingInfo=true;
    const buf=new Float32Array(this.capacity*16);m.thinInstanceSetBuffer('matrix',buf,16,false);m.thinInstanceCount=0;m.setEnabled(false);m.setBoundingInfo(new B.BoundingInfo(new B.Vector3(-112,-3,-112),new B.Vector3(112,14,112)));
    this.farBatches.push({m,buf,count:0,faction,type});rig.reset();rig.animationState=null;
  }
  farGeometry(rig,faction,type) {
    const p=[],indices=[],colors=[],point=new B.Vector3(),palette=this.factory.palette?this.factory.palette(faction,-1):{cloth:faction?'#a8493e':'#3ba898',skin:'#cba080',leather:'#4b3833',steel:'#8fadb8',wood:'#745746',gold:'#e1bc76'};
    const color=key=>B.Color3.FromHexString(palette[key]||palette.steel);
    const vertex=(joint,x,y,z,tint)=>{point.set(x,y,z);rig.nodes[joint].computeWorldMatrix(true);B.Vector3.TransformCoordinatesToRef(point,rig.nodes[joint].getWorldMatrix(),point);p.push(point.x,point.y,point.z);colors.push(tint.r,tint.g,tint.b,1);};
    const tube=(joint,key,rings,count=4)=>{
      if(rings[0][0]<rings[rings.length-1][0]) rings=rings.slice().reverse();
      const base=p.length/3,tint=color(key);
      for(const r of rings) for(let k=0;k<count;k++){const angle=k/count*Math.PI*2;vertex(joint,(r[3]||0)+Math.sin(angle)*r[1],r[0],(r[4]||0)+Math.cos(angle)*r[2],tint);}
      for(let row=0;row<rings.length-1;row++)for(let k=0;k<count;k++){const a=base+row*count+k,b=base+row*count+(k+1)%count;indices.push(a,b,a+count,b,b+count,a+count);}
      for(const row of [0,rings.length-1])for(let k=1;k<count-1;k++){const a=base+row*count;row===0?indices.push(a,a+k+1,a+k):indices.push(a,a+k,a+k+1);}
    };
    const plate=(joint,key,outline,z,depth)=>{
      let area=0;for(let k=0;k<outline.length;k++){const next=outline[(k+1)%outline.length];area+=outline[k][0]*next[1]-next[0]*outline[k][1];}
      if(area>0) outline=outline.slice().reverse();
      const base=p.length/3,tint=color(key),count=outline.length;
      for(const dz of [-depth/2,depth/2])for(const v of outline)vertex(joint,v[0],v[1],z+dz,tint);
      for(let k=1;k<count-1;k++)indices.push(base,base+k+1,base+k,base+count,base+count+k,base+count+k+1);
      for(let k=0;k<count;k++){const next=(k+1)%count;indices.push(base+k,base+next,base+count+k,base+next,base+count+next,base+count+k);}
    };
    tube('torso','cloth',[[-.02,.21,.13],[.22,.28,.17],[.44,.22,.13]]);
    tube('pelvis','leather',[[-.14,.17,.12],[.13,.22,.13]]);
    tube('head','skin',[[-.07,.07,.07],[.10,.13,.10],[.24,.055,.06]]);
    tube('head','steel',[[.16,.135,.11],[.27,.06,.06]]);
    for(const side of ['L','R']) {
      tube('arm'+side,'cloth',[[.035,.11,.11],[-rig.armLength,.065,.065]]);
      tube('elbow'+side,'leather',[[.015,.075,.075],[-rig.forearmLength-.065,.058,.06]]);
      tube('leg'+side,'cloth',[[.015,.105,.11],[-.43,.068,.075]]);
      tube('knee'+side,'steel',[[.015,.075,.078],[-.43,.055,.065]]);
      tube('foot'+side,'leather',[[-.11,.09,.15,0,.045],[.04,.075,.10,0,.04]]);
    }
    if(type==='pike') {
      tube('weaponRoot','wood',[[-.72,.025,.025],[1.48,.025,.025]]);
      plate('weaponRoot','steel',[[-.055,1.44],[0,1.75],[.055,1.44]],0,.045);
    } else if(type==='archer') {
      for(let segment=0;segment<4;segment++) {
        const y0=-.6+segment*.3,y1=y0+.3,z0=.04+y0*y0*.63,z1=.04+y1*y1*.63;
        tube('weaponRoot','wood',[[y0,.028,.025,0,z0],[y1,.028,.025,0,z1]]);
      }
      plate('weaponRoot','steel',[[-.008,-.59],[.008,-.59],[.008,.59],[-.008,.59]],.268,.015);
    } else {
      tube('weaponRoot','leather',[[-.14,.032,.035],[.17,.032,.035]]);
      plate('weaponRoot','steel',[[-.09,.16],[-.065,.73],[0,.9],[.065,.73],[.09,.16]],0,.045);
    }
    if(type==='shield') {
      plate('offhandRoot','cloth',[[-.25,.38],[.25,.38],[.25,-.28],[0,-.49],[-.25,-.28]],.17,.07);
      plate('offhandRoot','gold',[[-.035,.28],[.035,.28],[.035,-.30],[-.035,-.30]],.214,.02);
    }
    const data=new B.VertexData();data.positions=p;data.indices=indices;data.colors=colors;data.normals=[];B.VertexData.ComputeNormals(p,indices,data.normals);return data;
  }
  initOfficerPool(store) {
    if(this.officers.length>=this.officerBudget)return;
    const now=performance.now();if(this.lastOfficerPoolRefresh!==undefined&&now-this.lastOfficerPoolRefresh<250)return;
    this.lastOfficerPoolRefresh=now;
    const rank={azrakan:100,odran:95,sentinel:90,duelist:90,warcaller:90,bearer:80,commander:75,captain:10};
    // New training encounter elites receive the real art pipeline too. The pool
    // stays bounded; reused generations are handled by the same identity checks
    // as campaigns, and an idle matching type is reused instead of duplicated.
    const candidates=store.actors.filter(a=>a.elite&&a.hp>0&&!this.officers.some(entry=>
      entry.id===a.id&&entry.gen===a.gen||entry.type===a.type&&entry.faction===a.faction&&(!store.actors[entry.id]||store.actors[entry.id].gen!==entry.gen||store.actors[entry.id].hp<=0)
    )).sort((a,b)=>(rank[this.visualType(b.type)]||0)-(rank[this.visualType(a.type)]||0));
    for(const a of candidates) {
      if(this.officers.length>=this.officerBudget)break;
      const rig=this.factory.create(a.type,{faction:a.faction,detail:true});this.keepRigActive(rig);rig.root.setEnabled(false);
      if(this.shadowWorld)for(const mesh of rig.meshes)this.shadowWorld.registerShadowCaster(mesh,1);
      if(this.visualType(a.type)==='azrakan')rig.root.scaling.setAll(1.25);else if(this.visualType(a.type)==='odran')rig.root.scaling.setAll(1.16);
      this.officers.push({rig,id:a.id,gen:a.gen,type:a.type,faction:a.faction,active:false});
    }
  }
  visualType(type) {return (typeof TYPES!=='undefined'?TYPES[type]?.archetype:undefined)||type;}
  troopType(a) {const type=this.visualType(a.type);return ['pike','sentinel','azrakan'].includes(type)?'pike':['shield','commander','bearer'].includes(type)?'shield':type==='archer'?'archer':'raider';}
  composeCrowd(a,state,type) {
    // Weapon binds and shoulder spacing differ for archers and polearm troops.
    // Sharing the raider bind gave bows the sword's tilt and shifted grips.
    this.skeleton=this.skeletonByType[type]||this.skeleton;
    const scale=this.visualType(a.type)==='azrakan'?1.35:this.visualType(a.type)==='odran'?1.25:a.elite?1.10:1;
    this.scale.setAll(scale);this.position.set(a.x,(a.y||0)+state.bob,a.z);B.Quaternion.FromEulerAnglesToRef(state.rootPitch,(a.yaw||0)+state.rootTurn,state.rootRoll,this.q);B.Matrix.ComposeToRef(this.scale,this.q,this.position,this.rootMatrix);
    this.scale.setAll(1);
    for(let i=0;i<this.skeleton.length;i++) {
      const joint=this.skeleton[i],pi=Math.min(17,i)*3;
      const rx=joint.rotation.x+(i<18?state.pose[pi]:0),ry=joint.rotation.y+(i<18?state.pose[pi+1]:0),rz=joint.rotation.z+(i<18?state.pose[pi+2]:0);
      B.Quaternion.FromEulerAnglesToRef(rx,ry,rz,this.q);B.Matrix.ComposeToRef(this.scale,this.q,joint.position,this.localMatrix);
      let parent=joint.parent;
      if(i===17&&type==='archer') parent=6;
      this.localMatrix.multiplyToRef(parent>=0?this.jointMatrices[parent]:this.rootMatrix,this.jointMatrices[i]);
    }
    if(type==='pike'&&!state.dead) {this.steerCrowdSpear(a,state);this.solveCrowdGrip();}
  }
  steerCrowdSpear(a,state) {
    const w=this.animator.ik;this.jointMatrices[9].getTranslationToRef(w.handPosition);
    B.Matrix.RotationYawPitchRollToRef((a.yaw||0)+state.pose[4]*.28,state.spearPitch||1.14,0,w.desired);B.Matrix.RotationYawPitchRollToRef(0,-this.skeleton[17].rotation.x,0,w.local);w.local.multiplyToRef(w.desired,w.desired);w.desired.decompose(w.scale,w.q,w.temp);
    const scale=this.visualType(a.type)==='azrakan'?1.35:this.visualType(a.type)==='odran'?1.25:a.elite?1.10:1;this.scale.setAll(scale);B.Matrix.ComposeToRef(this.scale,w.q,w.handPosition,this.jointMatrices[9]);
    this.scale.setAll(1);B.Quaternion.FromEulerAnglesToRef(this.skeleton[17].rotation.x,0,0,this.q);B.Matrix.ComposeToRef(this.scale,this.q,this.skeleton[17].position,this.localMatrix);this.localMatrix.multiplyToRef(this.jointMatrices[9],this.jointMatrices[17]);
  }
  solveCrowdGrip() {
    const w=this.animator.ik,upper=this.skeleton[4],lower=this.skeleton[5],hand=this.skeleton[6];
    this.jointMatrices[1].invertToRef(w.parentInverse);w.temp.set(0,-.20,0);B.Vector3.TransformCoordinatesToRef(w.temp,this.jointMatrices[17],w.target);B.Vector3.TransformCoordinatesToRef(w.target,w.parentInverse,w.target);
    w.shoulder.copyFrom(upper.position);w.direction.copyFrom(w.target).subtractInPlace(w.shoulder);
    const l1=lower.position.length(),l2=hand.position.length(),d=Math.max(.02,Math.min(l1+l2-.006,w.direction.length()));
    if(w.direction.lengthSquared()<.000001)w.direction.copyFrom(w.unit);else w.direction.normalize();w.bend.set(-1,-.2,-.35);
    w.temp.copyFrom(w.direction).scaleInPlace(B.Vector3.Dot(w.bend,w.direction));w.bend.subtractInPlace(w.temp);
    if(w.bend.lengthSquared()<.000001){w.bend.set(0,0,1);w.temp.copyFrom(w.direction).scaleInPlace(B.Vector3.Dot(w.bend,w.direction));w.bend.subtractInPlace(w.temp);}w.bend.normalize();
    const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(.00001,l1*l1-along*along));w.elbow.copyFrom(w.direction).scaleInPlace(along);w.temp.copyFrom(w.bend).scaleInPlace(height);w.elbow.addInPlace(w.temp).addInPlace(w.shoulder);
    w.direction.copyFrom(w.elbow).subtractInPlace(w.shoulder).normalize();this.downQuaternion(w.direction,this.q);
    B.Matrix.ComposeToRef(this.scale,this.q,upper.position,this.localMatrix);this.localMatrix.multiplyToRef(this.jointMatrices[1],this.jointMatrices[4]);this.jointMatrices[4].invertToRef(w.inverse);
    // Target from torso to world to upper-arm space; lower-arm matrix is local.
    B.Vector3.TransformCoordinatesToRef(w.target,this.jointMatrices[1],w.end);B.Vector3.TransformCoordinatesToRef(w.end,w.inverse,w.end);w.end.subtractInPlace(lower.position).normalize();this.downQuaternion(w.end,this.q);
    B.Matrix.ComposeToRef(this.scale,this.q,lower.position,this.localMatrix);this.localMatrix.multiplyToRef(this.jointMatrices[4],this.jointMatrices[5]);
    this.q.set(0,0,0,1);B.Matrix.ComposeToRef(this.scale,this.q,hand.position,this.localMatrix);this.localMatrix.multiplyToRef(this.jointMatrices[5],this.jointMatrices[6]);
    B.Matrix.ComposeToRef(this.scale,this.q,this.skeleton[18].position,this.localMatrix);this.localMatrix.multiplyToRef(this.jointMatrices[6],this.jointMatrices[18]);
  }
  downQuaternion(v,q) {
    const w=this.animator.ik,dot=B.Vector3.Dot(w.unit,v);
    if(dot<-.9999) q.set(1,0,0,0);else {B.Vector3.CrossToRef(w.unit,v,w.cross);q.set(w.cross.x,w.cross.y,w.cross.z,1+dot);q.normalize();}
  }
  pushJointBatch(batch) {if(batch.count>=this.capacity) return;this.jointMatrices[batch.joint].copyToArray(batch.buf,batch.count++*16);}
  updateBearer(store,t) {
    let bearer=null;
    for(const a of store.actors) if(a.type==='bearer'&&a.hp>0) {bearer=a;break;}
    for(const m of [this.bearerPole,this.bearerCloth,this.bearerMark]) m.setEnabled(!!bearer);
    if(!bearer) return;
    const sideX=Math.cos(bearer.yaw||0)*.56,sideZ=-Math.sin(bearer.yaw||0)*.56;
    this.bearerPole.position.set(bearer.x+sideX,(bearer.y||0)+1.5,bearer.z+sideZ);
    this.bearerCloth.position.set(bearer.x+sideX+.47,(bearer.y||0)+2.55,bearer.z+sideZ);this.bearerCloth.rotation.y=Math.sin(t*2)*.10;
    this.bearerMark.position.copyFrom(this.bearerCloth.position);this.bearerMark.position.z-=.025;
  }
  render(store,p,t) {
    const started=performance.now(),now=started,playing=typeof app==='undefined'||app.state==='Playing',ending=typeof app!=='undefined'&&app.state==='Results',realDt=Math.max(0,Math.min(.07,(now-this.lastRender)/1000)),simulationTime=Number.isFinite(t)?t:this.visualClock,dt=playing?Math.max(0,Math.min(.10,simulationTime-(this.lastSimulationTime??simulationTime))):0;
    this.lastSimulationTime=simulationTime;
    this.lastRender=now;this.visualClock+=dt;t=this.visualClock;this.initOfficerPool(store);this.updateBearer(store,t);
    if(ending) {
      for(const actor of store.actors) if(actor.dead||actor.hp<=0) actor.renderDeathTime=Math.min(actor.deathDuration||.6,(actor.renderDeathTime??actor.deathTime??0)+realDt);
      if(p.dead||p.hp<=0) p.renderDeathTime=Math.min(p.deathDuration||.6,(p.renderDeathTime??p.deathTime??0)+realDt);
    }
    const performanceManager=typeof app!=='undefined'?app.performance:null,preset=performanceManager?.preset||{mid:120,far:240},quality=performanceManager?.effective||'balanced';
    const officerLimit=quality==='performance'?2:quality==='quality'?6:4;
    const viewDistance=Math.max(108,Math.min(280,this.scene.activeCamera?.maxZ||108));
    for(const b of this.batches) b.count=0;for(const b of this.farBatches) b.count=0;
    this.midCount=this.farCount=this.nearCount=this.animatedCount=0;
    let officerCount=0,livingInRange=0,livingRepresented=0,budgetFallbacks=0;
    for(const entry of this.officers) {
      const previous=store.actors[entry.id],retired=!previous||previous.gen!==entry.gen||(previous.dead||previous.hp<=0)&&this.deathAgeOf(previous,entry.rig.animationState)>=(previous.deathDuration||.6);
      if(retired) {
        let replacement=null,replacementDistance=Infinity;
        for(const candidate of store.actors) {
          if(!candidate.elite||candidate.hp<=0||candidate.type!==entry.type||candidate.faction!==entry.faction) continue;
          let assigned=false;for(const other of this.officers) if(other!==entry&&other.id===candidate.id&&other.gen===candidate.gen) {assigned=true;break;}
          const d=Math.hypot(candidate.x-p.x,candidate.z-p.z);
          if(!assigned&&d<replacementDistance) {replacement=candidate;replacementDistance=d;}
        }
        if(replacement) {entry.id=replacement.id;entry.gen=replacement.gen;entry.rig.reset();entry.rig.animationState=null;entry.active=false;}
      }
      const a=store.actors[entry.id],same=a&&a.gen===entry.gen,alive=same&&(!(a.dead||a.hp<=0)||this.deathAgeOf(a,entry.rig.animationState)<(a.deathDuration||.6));
      const distance=alive?Math.hypot(a.x-p.x,a.z-p.z):Infinity,visible=alive&&distance<(entry.active?29:25)&&officerCount<officerLimit;
      entry.active=!!visible;entry.rig.root.setEnabled(!!visible);
      if(visible) {this.animator.update(entry.rig,a,ending&&a.dead?realDt:dt,t);officerCount++;this.animatedCount++;a.renderDetail=2;}
    }
    for(const a of store.actors) {
      const dead=a.dead||a.hp<=0;
      if(dead&&typeof a.deathTime==='number'&&Math.max(a.deathTime,a.renderDeathTime||0)>=(a.deathDuration||.6)) {a.renderDeathRemaining=0;continue;}
      const distance=Math.hypot(a.x-p.x,a.z-p.z);
      if(distance>viewDistance) {a.renderDetail=-1;continue;}
      if(!dead)livingInRange++;
      let rec=this.records[a.id];
      if(!rec||rec.gen!==(a.gen||0)||rec.identity!==(a.hero??a.heroId??a.type??null)) rec=this.records[a.id]=this.animator.makeState(a);
      if(dead&&typeof a.deathTime!=='number'&&rec.deathAge>=(a.deathDuration||.6)) {a.renderDeathRemaining=0;continue;}
      const detailed=this.officers.some(e=>e.active&&e.id===a.id&&e.gen===a.gen);
      a.renderDetail=detailed?2:-1;
      const near=distance<(rec.lod===0?40:34),type=this.troopType(a);
      rec.lod=near?0:distance<76?1:2;
      if(dead) {a.renderDeathRemaining=Math.max(0,(a.deathDuration||.6)-Math.max(a.deathTime??rec.deathAge,a.renderDeathTime||0));}
      if(near||dead&&distance<48) {
        if(!detailed) {
          // Distant/inactive articulated bodies animate at a reduced cadence.
          // Combat range and hero always update every render, including deaths.
          rec.age=(rec.age||0)+(ending&&dead?realDt:dt);
          const rate=distance<18||a.state==='Windup'||a.state==='Attack'||dead?0:(performanceManager?.backgroundRate||1)/30;
          const refresh=!rec.matrixCache||rec.age>=rate||rec.cacheType!==type||Math.abs((a.yaw||0)-(rec.cacheYaw||0))>.12;
          if(refresh) {
            this.animator.sample(a,rec.age,t,rec);rec.age=0;this.composeCrowd(a,rec,type);
            if(!rec.matrixCache) rec.matrixCache=new Float32Array(19*16);
            for(let j=0;j<19;j++) this.jointMatrices[j].copyToArray(rec.matrixCache,j*16);
            rec.cacheX=a.x;rec.cacheY=a.y||0;rec.cacheZ=a.z;rec.cacheYaw=a.yaw||0;rec.cacheType=type;this.animatedCount++;
          } else {
            // Pose throttling may delay elbows, never root movement. Effects,
            // collision and the body use the same current actor coordinates.
            const dx=a.x-rec.cacheX,dy=(a.y||0)-rec.cacheY,dz=a.z-rec.cacheZ;
            for(let j=0;j<19;j++){const offset=j*16,m=this.jointMatrices[j];B.Matrix.FromArrayToRef(rec.matrixCache,offset,m);m.setTranslationFromFloats(rec.matrixCache[offset+12]+dx,rec.matrixCache[offset+13]+dy,rec.matrixCache[offset+14]+dz);}
          }
          for(const b of this.crowdBody[a.faction]) this.pushJointBatch(b);
          for(const b of this.equipment[a.faction][type]) this.pushJointBatch(b);
          this.nearCount++;a.renderDetail=1;
        }
        const shadow=this.shadowBatches[a.faction];
        this.scale.set(.48,1,.38);this.position.set(a.x,.065,a.z);this.q.set(0,0,0,1);B.Matrix.ComposeToRef(this.scale,this.q,this.position,this.matrix);this.matrix.copyToArray(shadow.buf,shadow.count++*16);
      } else if(!dead&&!detailed) {
        // Budgets can reduce animation work, but must not remove a living body
        // while its attacks, banner or projectile effects still remain visible.
        if(distance<76?this.midCount>=(preset.mid||160):this.farCount>=(preset.far||240))budgetFallbacks++;
        const batch=this.farBatches.find(b=>b.faction===a.faction&&b.type===type);
        const size=a.elite?1.1:1;this.scale.setAll(size);this.position.set(a.x,a.y||0,a.z);B.Quaternion.FromEulerAnglesToRef(0,a.yaw||0,0,this.q);B.Matrix.ComposeToRef(this.scale,this.q,this.position,this.matrix);this.matrix.copyToArray(batch.buf,batch.count++*16);
        if(distance<76) this.midCount++;else this.farCount++;a.renderDetail=0;
        rec.x=a.x;rec.z=a.z;rec.speed=0;rec.matrixCache=null;rec.age=0;
      }
      if(!dead&&a.renderDetail>=0)livingRepresented++;
    }
    let instanceUploadBytes=0;
    // Embedded Babylon passes instancesCount to Buffer.updateDirectly, limiting
    // each matrix upload to populated 64-byte records, not allocated capacity.
    for(const b of this.batches) {b.m.thinInstanceCount=b.count;b.m.setEnabled(b.count>0);if(b.count) {b.m.thinInstanceBufferUpdated('matrix');instanceUploadBytes+=b.count*16*Float32Array.BYTES_PER_ELEMENT;}}
    for(const b of this.farBatches) {b.m.thinInstanceCount=b.count;b.m.setEnabled(b.count>0);if(b.count) {b.m.thinInstanceBufferUpdated('matrix');instanceUploadBytes+=b.count*16*Float32Array.BYTES_PER_ELEMENT;}}
    p.mountPhase=p.mounted&&typeof app!=='undefined'?app.mounts?.horse?.phase:undefined;
    this.horseVisual.update(typeof app!=='undefined'?app.mounts?.horses:null,p,ending?realDt:dt,t,performanceManager);
    this.animator.update(this.hero,p,ending&&p.dead?realDt:dt,t);this.animatedCount++;
    this.hero.root.setEnabled(!((p.dead||p.hp<=0)&&this.deathAgeOf(p,this.hero.animationState)>=(p.deathDuration||.6)));
    this.heroShadow.position.set(p.x,.065,p.z);this.heroShadow.scaling.set(p.mounted?.66:.58,1,p.mounted?1.30:.46);this.heroShadow.setEnabled(this.hero.root.isEnabled()&&!p.mounted);
    this.updateWeaponTrails(p,ending?realDt:dt,performanceManager?.effectFactor||1);
    Object.assign(this.diagnostics,{horseRigs:this.horseVisual.rigs.length,visibleHorses:this.horseVisual.visibleCount,mounted:!!p.mounted,viewDistance,livingInRange,livingRepresented,missingBodies:livingInRange-livingRepresented,budgetFallbacks,heroVisible:this.hero.root.isEnabled(),activeOfficers:officerCount,instanceUploadBytes,skinnedActors:officerCount+1,heroBones:this.hero.boneCount||0,weightedVertices:this.hero.weightedVertices||0,animatedActors:this.animatedCount,nearActors:this.nearCount,farActors:this.midCount+this.farCount,trailSegments:this.trails.filter(e=>e.life>0).length,animationMs:performance.now()-started});
  }
  updateWeaponTrails(p,dt,factor) {
    for(const segment of this.trails) if(segment.life>0) {segment.life-=dt;segment.m.visibility=Math.max(0,segment.life/.13);segment.m.setEnabled(segment.life>0);}
    const motion=this.weaponMotion,a=p.attack,active=!!a&&a.damage!==0&&a.time>=a.start*.58&&a.time<=a.end&&!p.dead;
    this.hero.weaponTip.computeWorldMatrix(true);this.hero.weaponGrip.computeWorldMatrix(true);
    motion.tip.copyFrom(this.hero.weaponTip.getAbsolutePosition());motion.grip.copyFrom(this.hero.weaponGrip.getAbsolutePosition());
    if(this.animator.styleOf(p)===2) {this.hero.offhandTip.computeWorldMatrix(true);motion.offhandTip.copyFrom(this.hero.offhandTip.getAbsolutePosition());}
    if(active&&motion.valid&&motion.attackId===a.id&&dt>0) {
      this.emitWeaponSegment(motion.previousTip,motion.tip,factor);
      if(this.animator.styleOf(p)===2) this.emitWeaponSegment(motion.previousOffhand,motion.offhandTip,factor);
    }
    motion.previousTip.copyFrom(motion.tip);motion.previousOffhand.copyFrom(motion.offhandTip);motion.valid=active;motion.active=active;motion.damageActive=!!a&&a.time>=a.start&&a.time<=a.end&&!p.dead;motion.attackId=a?.id??-1;
  }
  emitWeaponSegment(from,to,factor) {
    this.trailDirection.copyFrom(to).subtractInPlace(from);const length=this.trailDirection.length();
    if(!Number.isFinite(length)||length<.025||length>2.6) return;
    this.trailDirection.scaleInPlace(1/length);const dot=B.Vector3.Dot(this.trailAxis,this.trailDirection);
    if(dot<-.9999) this.q.set(1,0,0,0);else {B.Vector3.CrossToRef(this.trailAxis,this.trailDirection,this.trailCross);this.q.set(this.trailCross.x,this.trailCross.y,this.trailCross.z,1+dot);this.q.normalize();}
    const cap=Math.max(8,Math.min(this.trails.length,Math.floor(this.trails.length*factor))),segment=this.trails[(this.trailCursor++)%cap];segment.life=.13;segment.m.position.copyFrom(from).addInPlace(to).scaleInPlace(.5);segment.m.scaling.set(1,length,1);
    if(!segment.m.rotationQuaternion) segment.m.rotationQuaternion=new B.Quaternion();segment.m.rotationQuaternion.copyFrom(this.q);segment.m.visibility=1;segment.m.setEnabled(true);
  }
  animateRig(rig,actor,dt,t) {return this.animator.update(rig,actor,dt,t);}
}

  class EffectsManager {
    constructor(scene, mats) {
      this.scene = scene;
      // Weapon ribbons are sampled from the authoritative weapon sockets by ActorRenderer.
      this.lootMeshes = Array.from({length:32}, () => {
        let m = B.MeshBuilder.CreatePolyhedron('rift nectar',{type:1,size:.26},scene);
        m.material=mats.rift;m.isPickable=false;m.setEnabled(false);return m;
      });
      const hot = new B.StandardMaterial('restrained-impact-metal',scene);
      hot.diffuseColor=new B.Color3(1,.72,.31);hot.emissiveColor=new B.Color3(1,.49,.10);hot.disableLighting=true;
      this.sparks=[];this.shots=[];this.dust=[];
      for(let i=0;i<48;i++) {
        let m=B.MeshBuilder.CreateBox('localized-metal-spark',{width:.025,height:.025,depth:.16},scene);
        m.material=hot;m.isPickable=false;m.setEnabled(false);
        this.sparks.push({m,time:0,duration:0,vx:0,vz:0,vy:0});
      }
      for(let i=0;i<20;i++) {
        let m=B.MeshBuilder.CreateBox('arrow-shaft',{width:.035,height:.035,depth:.72},scene);
        m.material=mats.wood;m.isPickable=false;m.setEnabled(false);
        let head=B.MeshBuilder.CreatePolyhedron('arrowhead',{type:1,size:.09},scene);
        head.parent=m;head.position.z=.38;head.scaling.set(.50,.32,1.4);head.material=mats.metal;head.isPickable=false;
        let fletching=B.MeshBuilder.CreateBox('arrow-fletching',{width:.15,height:.02,depth:.13},scene);
        fletching.parent=m;fletching.position.z=-.31;fletching.material=mats.ivory;fletching.isPickable=false;
        this.shots.push(m);
      }
      const texture=new B.DynamicTexture('original-impact-dust',64,scene,true,B.Texture.TRILINEAR_SAMPLINGMODE),context=texture.getContext();
      let fade=context.createRadialGradient(32,32,1,32,32,30);fade.addColorStop(0,'rgba(222,198,160,.62)');fade.addColorStop(.35,'rgba(214,188,146,.35)');fade.addColorStop(1,'rgba(214,188,146,0)');
      context.fillStyle=fade;context.fillRect(0,0,64,64);texture.hasAlpha=true;texture.update(false);
      const dustMaterial=new B.StandardMaterial('localized-ground-dust',scene);
      dustMaterial.diffuseTexture=texture;dustMaterial.useAlphaFromDiffuseTexture=true;dustMaterial.diffuseColor=new B.Color3(.76,.68,.56);dustMaterial.emissiveColor=new B.Color3(.08,.06,.035);dustMaterial.specularColor=B.Color3.Black();dustMaterial.alpha=.38;dustMaterial.backFaceCulling=false;
      for(let i=0;i<24;i++) {
        let m=B.MeshBuilder.CreatePlane('impact-dust',{size:1},scene);m.material=dustMaterial;m.billboardMode=B.Mesh.BILLBOARDMODE_ALL;m.isPickable=false;m.setEnabled(false);
        this.dust.push({m,time:0,duration:0,vx:0,vz:0,size:1});
      }
      this.pool=[];
      for(let i=0;i<80;i++) {
        let m=flatRing('impact wave',scene,32,.94);m.material=mats.gold;m.isPickable=false;m.setEnabled(false);
        this.pool.push({m,time:0,duration:0,size:1,kind:0});
      }
    }
    emit(x,z,size=1,duration=.3,kind=0) {
      const factor=app.performance.effectFactor??1,cap=app.performance.effective==='performance'?32:app.performance.effective==='balanced'?56:80;
      let count=0,e=null,replace=null;
      for(let item of this.pool) {if(item.time>0) {count++;if(item.kind!==3&&(!replace||item.time<replace.time))replace=item;} else if(!e)e=item;}
      if(count>=cap&&kind!==3)return;
      if(kind===3&&count>=cap)e=replace||e;
      if(!e)return;
      e.m.position.set(x,kind>=2?.065:.09,z);e.time=e.duration=Math.max(.05,duration);e.size=size;e.kind=kind;
      e.m.material=kind>=2?app.world.materials.warning:kind===1?app.world.materials.rift:app.world.materials.gold;
      e.m.visibility=kind>=2?.68:.40*factor;e.m.setEnabled(true);
    }
    burst(x,z,yaw=0,strength=1,height=1.1) {
      const factor=app.performance.effectFactor??1,strong=clamp(strength,.5,2);
      let amount=Math.max(2,Math.round((strong>1.1?7:4)*factor));
      for(let i=0;i<amount;i++) {
        let s=null;for(let item of this.sparks)if(item.time<=0){s=item;break;}if(!s)break;
        let a=yaw+(rnd()-.5)*3.4,speed=(1.6+rnd()*2.2)*strong;
        s.time=s.duration=.12+rnd()*.16;s.m.position.set(x,height,z);s.m.visibility=1;s.m.scaling.setAll(1);s.m.setEnabled(true);
        s.vx=Math.sin(a)*speed;s.vz=Math.cos(a)*speed;s.vy=1+rnd()*2.7;
        s.m.rotation.y=a;s.m.rotation.x=-.35-rnd()*.3;
      }
      let dustAmount=strong>1.1?3:1;
      for(let i=0;i<dustAmount;i++) {
        let d=null;for(let item of this.dust)if(item.time<=0){d=item;break;}if(!d)break;
        let a=yaw+(rnd()-.5)*2.4;d.time=d.duration=.22+rnd()*.14;d.size=.40+strong*.35;d.vx=Math.sin(a)*strong;d.vz=Math.cos(a)*strong;
        d.m.position.set(x+(rnd()-.5)*.25,.22,z+(rnd()-.5)*.25);d.m.rotation.z=rnd()*6.28;d.m.visibility=.8;d.m.scaling.setAll(d.size*.4);d.m.setEnabled(true);
      }
    }
    impact(x,z,options={}) {this.burst(x,z,options.yaw||0,options.heavy?1.7:1,options.height??1.1);}
    update(dt) {
      for(let i=0;i<this.lootMeshes.length;i++) {
        let l=app.combat.loot[i],m=this.lootMeshes[i];m.setEnabled(l.active);
        if(l.active){m.position.set(l.x,.35+Math.sin(l.time*4)*.08,l.z);m.rotation.y+=dt*2;}
      }
      for(let s of this.sparks)if(s.time>0) {
        s.time-=dt;s.vy-=dt*13;s.m.position.x+=s.vx*dt;s.m.position.z+=s.vz*dt;s.m.position.y+=s.vy*dt;
        s.m.visibility=clamp(s.time/s.duration,0,1);s.m.scaling.z=1+s.time/s.duration;s.m.setEnabled(s.time>0);
      }
      for(let d of this.dust)if(d.time>0) {
        d.time-=dt;let k=1-d.time/d.duration;d.m.position.x+=d.vx*dt;d.m.position.z+=d.vz*dt;d.m.position.y+=dt*.6;
        d.m.scaling.setAll(d.size*(.5+k));d.m.visibility=Math.max(0,(1-k)*.75);d.m.setEnabled(d.time>0);
      }
      for(let i=0;i<this.shots.length;i++) {
        let p=app.combat.projectiles[i],m=this.shots[i];m.setEnabled(p.active);
        if(p.active){m.position.set(p.x,1.35,p.z);m.rotation.y=Math.atan2(p.dx,p.dz);}
      }
      for(let e of this.pool)if(e.time>0) {
        e.time-=dt;let k=clamp(1-e.time/e.duration,0,1);
        if(e.kind>=2) {
          // Telegraphs retain their true hit radius until the threat resolves.
          e.m.scaling.set(e.size,1,e.size);e.m.visibility=(.42+.18*Math.sin(k*Math.PI*3))*(1-k*.25);
        } else {let s=e.size*(.68+k*.34);e.m.scaling.set(s,1,s);e.m.visibility=(1-k)*.40;}
        if(e.time<=0)e.m.setEnabled(false);
      }
    }
    get count() {let n=0;for(let e of this.pool)if(e.time>0)n++;return n;}
  }
  class CameraRig {
    constructor(scene) {
      this.clearanceSources = [null, null]; this.emptyVolumes = []; this.liftAngles = [.68, .98, 1.18, 1.38];
      this.camera = new B.FreeCamera('follow', new B.Vector3(0, 4.2, -9), scene);
      this.camera.minZ = .08;
      this.camera.maxZ = 250;
      this.camera.fov = .78;
      this.yaw = 0;
      this.pitch = .31;
      this.distance = 8.8;
      this.actual = 8.8;
      this.pivot = new B.Vector3();
      this.aim = new B.Vector3();
      this.target = null;
      this.targetLost = 0;
      this.targetGeneration = null;
      this.ultimateFocus = 0;
      this.manualOrbitTime = 0;
      this.shakePhase = 0;
      this.shake = 0;
      this.obstacleLift = 0;
      this.crowdLift = 0;
      this.crowded = false;
      this.started = false;
      this.mountFocus = 0;
      scene.activeCamera = this.camera;
    }
    toggle() {
      if (this.target) { this.target = null; this.targetLost = 0; }
      else this.cycle();
    }
    cycle() {
      let p = app.player;
      if (!p) return;
      let list = app.store.actors.filter(a => a.elite && a.faction === 1 && a.hp > 0 && dist(a, p) < 26 && app.collision.visible(p, a))
        .sort((a, b) => dist(a, p) - dist(b, p));
      let index = list.indexOf(this.target);
      this.target = list.length ? list[(index + 1) % list.length] : null;
      this.targetLost = 0;
      this.targetGeneration = this.target?.gen;
    }
    clearance(origin, dx, dy, dz, distance) {
      // Intersect the existing collision world in 3D, never actors or weapon/effect meshes.
      // Height metadata comes from WorldBuilder; geometry/pathfinding retain their original AABBs.
      const radius = .28;
      let allowed = distance, c = app.collision;
      this.clearanceSources[0] = c.boxes; this.clearanceSources[1] = app.world?.cameraVolumes || this.emptyVolumes;
      for (let source of this.clearanceSources) for (let b of source) {
        if (b.open) continue;
        let lo = 0, hi = distance, top = (b.top == null ? 8 : b.top) + radius;
        for (let axis = 0; axis < 3; axis++) {
          let p = axis === 0 ? origin.x : axis === 1 ? origin.z : origin.y;
          let q = axis === 0 ? dx : axis === 1 ? dz : dy;
          let min = axis === 0 ? b.x - b.w / 2 - radius : axis === 1 ? b.z - b.d / 2 - radius : (b.bottom ?? 0) - radius;
          let max = axis === 0 ? b.x + b.w / 2 + radius : axis === 1 ? b.z + b.d / 2 + radius : top;
          if (Math.abs(q) < .00001) {
            if (p < min || p > max) { lo = distance + 1; break; }
          } else {
            let t1 = (min - p) / q, t2 = (max - p) / q;
            lo = Math.max(lo, Math.min(t1, t2));
            hi = Math.min(hi, Math.max(t1, t2));
          }
        }
        if (lo <= hi && hi > 0 && lo < allowed) allowed = Math.max(.65, lo - .18);
      }
      for (let axis = 0; axis < 2; axis++) {
        let p = axis === 0 ? origin.x : origin.z, q = axis === 0 ? dx : dz;
        let bound = (axis === 0 ? c.stage.w : c.stage.h) / 2 - radius;
        if (Math.abs(q) > .00001) {
          let hit = ((q > 0 ? bound : -bound) - p) / q;
          if (hit > 0) allowed = Math.min(allowed, hit);
        }
      }
      return allowed;
    }
    update(dt) {
      let p = app.player, input = app.input;
      if (!p || !input) return;
      dt = app.state === 'Playing' ? Math.min(.05, Math.max(0, dt)) : 0;
      this.mountFocus=lerp(this.mountFocus,p.mounted?1:0,1-Math.exp(-dt*5));
      const ridingSpeed=p.mounted?Math.abs(app.mounts?.horse?.speed||0):0;
      let config = settings(), lookX = dt > 0 ? input.look.x : 0, lookY = dt > 0 ? input.look.y : 0;
      if (Math.abs(lookX) + Math.abs(lookY) > .002) this.manualOrbitTime = 1.4;
      else this.manualOrbitTime = Math.max(0, this.manualOrbitTime - dt);
      this.yaw = wrap(this.yaw + lookX * config.sensitivity);
      this.pitch = clamp(this.pitch + lookY * config.sensitivity * (config.invert ? -1 : 1), .15, .78);
      input.look.x = input.look.y = 0;
      this.distance = clamp(this.distance + (dt > 0 ? input.zoom : 0), 6.6, 12.2);
      input.zoom = 0;
      if (this.target) {
        if (this.target.hp <= 0 || this.target.gen !== this.targetGeneration || this.target.faction !== 1 || dist(p, this.target) > 34) this.target = null;
        else {
          this.targetLost = app.collision.visible(p, this.target) ? 0 : this.targetLost + dt;
          if (this.targetLost > .5) this.target = null;
          else {
            let desiredYaw = angle(this.target.x - p.x, this.target.z - p.z);
            this.yaw = wrap(this.yaw + wrap(desiredYaw - this.yaw) * (1 - Math.exp(-dt * (Math.abs(lookX) > .001 ? 3 : 8))));
          }
        }
      }
      // A short dolly into the hero opens an ultimate while preserving orbit orientation.
      const ultimate = p.attack?.kind === 'ultimate' ? p.attack : null;
      let focus = ultimate ? Math.sin(clamp(ultimate.time / .65, 0, 1) * Math.PI) : 0;
      this.ultimateFocus = lerp(this.ultimateFocus, focus, 1 - Math.exp(-dt * 12));
      if (!this.target && this.manualOrbitTime <= 0 && !p.attack && input.move?.y < -.8 && Math.abs(input.move.x) < .15) {
        this.yaw = wrap(this.yaw + wrap(p.yaw - this.yaw) * (1 - Math.exp(-dt * 1.3)));
      }
      if(p.mounted&&ridingSpeed>4&&!this.target&&this.manualOrbitTime<=0&&!p.attack) {
        this.yaw=wrap(this.yaw+wrap(p.yaw-this.yaw)*(1-Math.exp(-dt*1.8)));
      }
      // Raise the viewpoint gently in a packed melee; manual orbit values stay unchanged.
      let nearby = 0;
      for (let actor of app.store.actors) {
        if (actor === p || actor.hp <= 0) continue;
        let x = actor.x - p.x, z = actor.z - p.z;
        if (x * x + z * z < 22.5625 && ++nearby >= 28) break;
      }
      if (nearby > 12) this.crowded = true;
      else if (nearby <= 9) this.crowded = false;
      let desiredCrowdLift = this.crowded ? .16 + .06 * clamp((nearby - 12) / 12, 0, 1) : 0;
      this.crowdLift = lerp(this.crowdLift, desiredCrowdLift, 1 - Math.exp(-dt * (this.crowded ? 3.8 : 2.2)));
      let focusHeight = 1.35 + this.mountFocus*.95 + this.ultimateFocus * .07 + (p.y || 0) * .55 + Math.min(.30, this.crowdLift / .22 * .30);
      const initialPosition = !this.started;
      if (!this.started) {
        this.pivot.set(p.x, focusHeight, p.z);
        this.aim.copyFrom(this.pivot);
        this.started = true;
      }
      let follow = 1 - Math.exp(-dt * 14);
      this.pivot.x = lerp(this.pivot.x, p.x, follow);
      this.pivot.z = lerp(this.pivot.z, p.z, follow);
      this.pivot.y = lerp(this.pivot.y, focusHeight, 1 - Math.exp(-dt * 10));
      // A small shoulder offset preserves the whole warrior and weapon against the battlefield.
      let shoulder = (this.target ? .22 : .44) * (1 - this.ultimateFocus * .50);
      let shoulderX = Math.cos(this.yaw) * shoulder, shoulderZ = -Math.sin(this.yaw) * shoulder;
      if (app.collision.blocked(this.pivot.x + shoulderX, this.pivot.z + shoulderZ, .3)) shoulderX = shoulderZ = 0;
      let origin = this.aim;
      origin.set(this.pivot.x + shoulderX, this.pivot.y, this.pivot.z + shoulderZ);
      let pitch = clamp(this.pitch + this.crowdLift, .15, .90);
      let wanted = this.distance + this.mountFocus*(1.65+Math.min(.70,ridingSpeed*.055)) - this.ultimateFocus * .75;
      if (this.target) wanted = Math.max(wanted, clamp(7.4 + dist(p, this.target) * .22, 8.8, 12.2));
      let dx = -Math.sin(this.yaw) * Math.cos(pitch), dz = -Math.cos(this.yaw) * Math.cos(pitch), dy = Math.sin(pitch);
      let allowed = this.clearance(origin, dx, dy, dz, wanted);
      // When low cover would pull the lens into the hero, lift over it before shortening.
      let desiredLift = 0;
      if (allowed < 4.1) {
        // Short walls beside the hero require a higher arc than a small shoulder nudge.
        // The orbit yaw remains unchanged, so movement direction stays consistent.
        let best = allowed;
        for (let raised of this.liftAngles) {
          if (raised <= pitch) continue;
          let rx = -Math.sin(this.yaw) * Math.cos(raised), rz = -Math.cos(this.yaw) * Math.cos(raised), ry = Math.sin(raised);
          let extra = this.clearance(origin, rx, ry, rz, wanted);
          if (extra > best + .6) {best = extra; desiredLift = raised - pitch;}
          if (extra >= Math.min(wanted - .25, 6.2)) break;
        }
      }
      const emergencyLift = allowed < 2.4 && desiredLift > this.obstacleLift + .04;
      this.obstacleLift = initialPosition || emergencyLift ? desiredLift : lerp(this.obstacleLift, desiredLift, 1 - Math.exp(-dt * 9));
      if (this.obstacleLift > .001) {
        pitch = Math.min(1.38, pitch + this.obstacleLift);
        dx = -Math.sin(this.yaw) * Math.cos(pitch); dz = -Math.cos(this.yaw) * Math.cos(pitch); dy = Math.sin(pitch);
        allowed = this.clearance(origin, dx, dy, dz, wanted);
      }
      if (initialPosition) this.actual = allowed;
      else {if (emergencyLift && allowed > 4.5) this.actual = Math.max(this.actual, 4.5);
        this.actual = allowed < this.actual ? allowed : lerp(this.actual, allowed, 1 - Math.exp(-dt * 4.5));}
      this.shake = Math.max(0, this.shake - dt * 3.5);
      this.shakePhase += dt * 76;
      let shake = (Math.sin(this.shakePhase) * .72 + Math.sin(this.shakePhase * .67) * .28) * Math.min(.075, this.shake) * config.shake;
      this.camera.position.set(origin.x + dx * this.actual + Math.cos(this.yaw) * shake, origin.y + dy * this.actual, origin.z + dz * this.actual - Math.sin(this.yaw) * shake);
      let aimX = origin.x, aimY = origin.y, aimZ = origin.z;
      const rideLookAhead=this.mountFocus*Math.min(1.1,ridingSpeed*.085);
      aimX+=Math.sin(p.yaw||0)*rideLookAhead;aimZ+=Math.cos(p.yaw||0)*rideLookAhead;
      if (this.target) {
        // Look a little ahead while retaining the hero as the composition anchor.
        let reach = Math.min(1.9, dist(p, this.target) * .17);
        aimX += Math.sin(this.yaw) * reach;
        aimZ += Math.cos(this.yaw) * reach;
        aimY += .13;
      }
      origin.set(aimX, aimY, aimZ);
      this.camera.setTarget(origin);
      let aspect = this.camera.getEngine().getRenderWidth() / Math.max(1, this.camera.getEngine().getRenderHeight());
      this.camera.fov = lerp(this.camera.fov, (aspect < 1 ? .94 : .78) + this.mountFocus*.035 - this.ultimateFocus * .045, 1 - Math.exp(-dt * 5));
    }
  }
