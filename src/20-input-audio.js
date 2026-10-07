  class InputManager {
    constructor() {
      this.sources = {
        key: {},
        mouse: {},
        touch: {},
        pad: {}
      };
      this.states = {};
      this.last = {};
      this.edges = {};
      this.releases = {};
      this.keys = {};
      this.mode = 'keyboard';
      this.move = {
        x: 0,
        y: 0
      };
      this.look = {
        x: 0,
        y: 0
      };
      this.pad = null;
      this.padIndex = -1;
      this.signature = '';
      this.rebind = null;
      this.pointer = new Map();
      this.joy = {
        x: 0,
        y: 0
      };
      this.mouse = null;
      this.zoom = 0;
      this.menuWait = 0;
      this.bindEvents()
    }
    set(source, a, v) {
      this.sources[source][a] = v
    }
    clear() {
      this.suppressed = new Set([...(this.suppressed || []), ...Object.keys(this.states || {}).filter(a => this.states[a])]);
      for (let s in this.sources) this.sources[s] = {};
      this.keys = {};
      this.states = {};
      this.edges = {};
      this.releases = {};
      this.last = {};
      this.joy = {
        x: 0,
        y: 0
      };
      this.pointer.clear();
      this.mouse = null;
      this.move = {
        x: 0,
        y: 0
      };
      this.look = {
        x: 0,
        y: 0
      };
      this.padMove = {x: 0, y: 0};
      this.padNeutral = true;
      this.zoom = 0;
      app?.combat?.clearBuffers();
      $('knob').style.transform = '';
      $('stick').style.left = '';
      $('stick').style.top = '';
      $('stick').style.bottom = '';
      document.querySelectorAll('.action').forEach(b => b.classList.remove('down'))
    }
    press(a) {
      let v = !!this.edges[a];
      delete this.edges[a];
      return v
    }
    release(a) {
      let v = !!this.releases[a];
      delete this.releases[a];
      return v
    }
    held(a) {
      return !!this.states[a]
    }
    activate(mode) {
      if (this.mode !== mode) {
        this.mode = mode;
        app?.ui.touchVisibility()
      }
    }
    bindEvents() {
      document.addEventListener('pointerdown', () => {
        if (app?.state === 'Playing' && app.audio.ctx?.state !== 'running') app.audio.unlock()
      }, {
        capture: true
      });
      addEventListener('keydown', e => {
        if (app?.state === 'Playing' && app.audio.ctx?.state !== 'running') app.audio.unlock();
        if (this.rebind?.type === 'key') {
          if (e.code !== 'Escape') {
            settings().keyboard[this.rebind.action] = e.code;
            save.write()
          }
          this.rebind = null;
          app.ui.settings('controls');
          e.preventDefault();
          return
        }
        // Searches and settings retain native typing, cursor and select/slider keys.
        // Escape still provides the common menu-back action.
        if (app?.state !== 'Playing' && e.code !== 'Escape' &&
            e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
        if (e.code === 'F8') {
          app.debug = !app.debug;
          e.preventDefault();
          return
        }
        if (app?.state !== 'Playing' && ['Escape','Enter'].includes(e.code)) {
          e.preventDefault();
          if (e.repeat) return;
          this.clear();
          this.activate('keyboard');
          if (e.code === 'Enter') app.ui.confirmMenu();
          else if (app.state === 'Paused') app.resume();
          else app.ui.back();
          return
        }
        if (app?.state === 'Playing' || app?.state === 'Paused') {
          if ([...Object.values(settings().keyboard), 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Equal', 'Minus', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
        }
        // Space would also activate a focused native button; consume its browser
        // default so the new jump/menu-confirm action fires only once.
        if (e.code === 'Space' && app?.state !== 'Playing') e.preventDefault();
        if (e.repeat) return;
        this.keys[e.code] = true;
        this.activate('keyboard');
        for (let a in settings().keyboard)
          if (settings().keyboard[a] === e.code) this.set('key', a, true);
        if (app?.state !== 'Playing') {
          if (['ArrowDown', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
            app.ui.focus(1)
          }
          if (['ArrowUp', 'ArrowLeft'].includes(e.code)) {
            e.preventDefault();
            app.ui.focus(-1)
          }
        }
      });
      addEventListener('keyup', e => {
        this.keys[e.code] = false;
        for (let a in settings().keyboard)
          if (settings().keyboard[a] === e.code) this.set('key', a, false)
      });
      const c = $('game');
      c.addEventListener('contextmenu', e => e.preventDefault());
      $('controls').addEventListener('contextmenu', e => e.preventDefault());
      c.addEventListener('pointerdown', e => {
        if (app.state !== 'Playing') return;
        if (e.pointerType !== 'mouse') e.preventDefault();
        c.setPointerCapture(e.pointerId);
        if (e.pointerType !== 'mouse' && settings().floating && e.clientX < innerWidth * .4 && e.clientY > innerHeight * .45) {
          if ([...this.pointer.values()].some(p => p.kind === 'joy')) return;
          let r = $('stick').getBoundingClientRect();
          $('stick').style.left = clamp(e.clientX - r.width / 2, 8, innerWidth * .4 - r.width) + 'px';
          $('stick').style.top = clamp(e.clientY - r.height / 2, innerHeight * .45, innerHeight - r.height - 8) + 'px';
          $('stick').style.bottom = 'auto';
          this.pointer.set(e.pointerId, {
            kind: 'joy'
          });
          this.activate('touch');
          this.joyMove(e);
          return
        }
        this.pointer.set(e.pointerId, {
          kind: 'camera',
          x: e.clientX,
          y: e.clientY
        });
        if (e.pointerType === 'mouse') {
          this.activate('keyboard');
          // Mouse action ownership is separate from a held keyboard binding.
          this.mouse = true
        } else this.activate('touch')
      });
      c.addEventListener('pointermove', e => {
        let p = this.pointer.get(e.pointerId);
        if (!p) return;
        if (p.kind === 'joy') {
          this.joyMove(e);
          return
        }
        this.look.x += (e.clientX - p.x) * .006;
        this.look.y += (e.clientY - p.y) * .006;
        p.x = e.clientX;
        p.y = e.clientY
      });
      const end = e => {
        let p = this.pointer.get(e.pointerId);
        if (!p) return;
        if (p.kind === 'joy') {
          this.joy = {
            x: 0,
            y: 0
          };
          $('knob').style.transform = '';
          if (settings().floating) {
            $('stick').style.left = '';
            $('stick').style.top = '';
            $('stick').style.bottom = ''
          }
        }
        if (p.kind === 'action') {
          let stillHeld = [...this.pointer.entries()].some(([id, other]) => id !== e.pointerId && other.kind === 'action' && other.a === p.a);
          this.set('touch', p.a, stillHeld);
          if (!stillHeld) p.el.classList.remove('down')
        }
        if (p.kind === 'camera' && e.pointerType === 'mouse' && e.type !== 'pointerup') {
          this.sources.mouse = {};
          this.mouse = null
        }
        this.pointer.delete(e.pointerId)
      };
      for (let ev of ['pointerup', 'pointercancel', 'lostpointercapture']) addEventListener(ev, end);
      c.addEventListener('mousedown', e => {
        if (app.state !== 'Playing' || e.sourceCapabilities?.firesTouchEvents) return;
        if (e.button === 0 || e.button === 2) this.set('mouse', e.button === 2 ? 'heavy' : 'light', true)
      });
      addEventListener('mouseup', e => {
        if (e.button === 0 || e.button === 2) this.set('mouse', e.button === 2 ? 'heavy' : 'light', false)
      });
      $('stick').addEventListener('pointerdown', e => {
        if (app.state !== 'Playing' || [...this.pointer.values()].some(p => p.kind === 'joy')) return;
        e.preventDefault();
        e.stopPropagation();
        let el = $('stick');
        if (settings().floating) {
          let r = el.getBoundingClientRect();
          el.style.left = clamp(e.clientX - r.width / 2, 8, innerWidth * .4 - r.width) + 'px';
          el.style.top = clamp(e.clientY - r.height / 2, innerHeight * .45, innerHeight - r.height - 8) + 'px';
          el.style.bottom = 'auto'
        }
        el.setPointerCapture(e.pointerId);
        this.pointer.set(e.pointerId, {
          kind: 'joy'
        });
        this.activate('touch');
        this.joyMove(e)
      });
      $('stick').addEventListener('pointermove', e => {
        if (this.pointer.get(e.pointerId)?.kind === 'joy') this.joyMove(e)
      });
      document.querySelectorAll('.action').forEach(el => el.addEventListener('pointerdown', e => {
        if (app.state !== 'Playing') return;
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        this.pointer.set(e.pointerId, {
          kind: 'action',
          a: el.dataset.a,
          el
        });
        this.set('touch', el.dataset.a, true);
        el.classList.add('down');
        this.activate('touch')
      }));
      c.addEventListener('wheel', e => {
        if (app.state === 'Playing') {
          e.preventDefault();
          this.zoom += Math.sign(e.deltaY) * .5
        }
      }, {
        passive: false
      });
      $('pauseButton').onclick = () => app.pause();
      $('mini').onclick = () => app.battle?.cycleObjective();
      addEventListener('gamepaddisconnected', e => {
        if (e.gamepad.index === this.padIndex) {
          this.clear();
          this.pad = null;
          this.padIndex = -1;
          if (this.mode === 'gamepad') app.pause('انقطع اتصال يد التحكم')
        }
      });
      addEventListener('gamepadconnected', e => console.info('Controller connected', e.gamepad.id));
    }
    joyMove(e) {
      let r = $('stick').getBoundingClientRect(),
        x = (e.clientX - r.left - r.width / 2) / (r.width * .36),
        y = (e.clientY - r.top - r.height / 2) / (r.height * .36),
        m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m
      }
      this.joy = {
        x,
        y
      };
      $('knob').style.transform = `translate(${x*r.width*.3}px,${y*r.height*.3}px)`
    }
    radial(x, y) {
      let m = Math.hypot(x, y),
        d = settings().deadzone;
      if (m < d) return {
        x: 0,
        y: 0
      };
      let k = clamp((m - d) / (1 - d), 0, 1) / m;
      return {
        x: x * k,
        y: y * k
      }
    }
    getPads() {
      try {
        if (!navigator.getGamepads) {
          this.padError = 'Gamepad API unavailable';
          return []
        }
        this.padError = null;
        return Array.from(navigator.getGamepads()).filter(Boolean)
      } catch (e) {
        this.padError = e.name;
        return []
      }
    }
    poll(dt) {
      let pads = this.getPads(),
        pad = pads.find(p => p.index === this.padIndex) || pads[0];
      this.sources.pad = {};
      if (pad) {
        this.pad = pad;
        this.padIndex = pad.index;
        let sig = pad.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 100) + '-' + pad.buttons.length + '-' + pad.axes.length;
        if (sig !== this.signature) {
          this.signature = sig;
          if (settings().profiles[sig]) settings().bindings = {
            ...DEFAULT_BIND,
            ...settings().profiles[sig]
          };
          console.info('Controller', pad.id, pad.mapping)
        }
        if (this.rebind?.type === 'pad') {
          let r = this.rebind;
          for (let i = 0; i < pad.buttons.length; i++)
            if (pad.buttons[i].value > .7 && (r.buttons[i] || 0) < .3) {
              settings().bindings[r.action] = i;
              this.finishRebind();
              break
            } if (this.rebind)
            for (let i = 0; i < pad.axes.length; i++) {
              let neutral = r.axes[i] || 0,
                v = pad.axes[i] - neutral;
              if (Math.abs(v) > .7) {
                settings().bindings[r.action] = {
                  axis: i,
                  sign: Math.sign(v),
                  neutral,
                  range: Math.abs(v)
                };
                this.finishRebind();
                break
              }
            }
        } else {
          for (let a in settings().bindings) {
            let bind = settings().bindings[a],
              v = typeof bind === 'number' ? (pad.buttons[bind]?.value || 0) : clamp(((pad.axes[bind.axis] || 0) - bind.neutral) * bind.sign / bind.range, 0, 1),
              was = !!this.last[a];
            this.sources.pad[a] = (pad.mapping === 'standard' || !!settings().profiles[this.signature]) && v > (was ? settings().threshold - .2 : settings().threshold)
          }
          let mv = this.radial(pad.axes[0] || 0, pad.axes[1] || 0),
            cam = this.radial(pad.axes[settings().camX] || 0, pad.axes[settings().camY] || 0);
          if (Math.hypot(mv.x, mv.y) > .12 || Object.values(this.sources.pad).some(Boolean) || Math.hypot(cam.x, cam.y) > .2) this.activate('gamepad');
          if (this.padNeutral && Math.hypot(mv.x, mv.y) < .05 && Math.hypot(cam.x, cam.y) < .05) this.padNeutral = false;
          this.padMove = this.padNeutral ? {x: 0, y: 0} : mv;
          if (app.state === 'Playing' && !this.padNeutral) {
            this.look.x += cam.x * dt * 2.2;
            this.look.y += cam.y * dt * 1.6
          }
          for (let [i, a] of [
              [12, 'zoomIn'],
              [13, 'zoomOut'],
              [14, 'objectivePrev'],
              [15, 'objectiveNext']
            ]) this.sources.pad[a] = !!pad.buttons[i]?.pressed
        }
      } else {
        if (this.pad) {
          this.clear();
          if (this.mode === 'gamepad' && app.state === 'Playing') app.pause('لم تعد يد التحكم متاحة؛ وصّلها أو تابع باللمس.')
        }
        this.pad = null;
        this.padMove = {
          x: 0,
          y: 0
        }
      }
      this.states = {};
      for (let src of Object.values(this.sources))
        for (let a in src) this.states[a] = this.states[a] || src[a];
      for (let a of this.suppressed || []) {
        if (!this.states[a]) this.suppressed.delete(a);
        else this.states[a] = false
      }
      for (let a of new Set([...Object.keys(this.states), ...Object.keys(this.last)])) {
        if (this.states[a] && !this.last[a]) this.edges[a] = true;
        if (!this.states[a] && this.last[a]) this.releases[a] = true
      }
      this.last = {
        ...this.states
      };
      let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0) + this.joy.x + (this.padMove?.x || 0),
        y = (this.held('back') ? 1 : 0) - (this.held('forward') ? 1 : 0) + this.joy.y + (this.padMove?.y || 0),
        m = Math.hypot(x, y);
      this.move = {
        x: x / Math.max(1, m),
        y: y / Math.max(1, m)
      };
      if (this.keys.Equal) this.zoom -= dt * 2;
      if (this.keys.Minus) this.zoom += dt * 2;
      let zi = this.press('zoomIn'),
        zo = this.press('zoomOut'),
        op = this.press('objectivePrev'),
        on = this.press('objectiveNext');
      if (app.state === 'Playing') {
        if (zi) this.zoom -= .5;
        if (zo) this.zoom += .5;
        if (op || on) app.battle?.cycleObjective()
      }
      if (app.state === 'Playing') {
        if (this.press('pause')) app.pause();
        if (this.press('lock')) app.camera.toggle();
        if (this.press('cycle')) app.camera.cycle()
      } else {
        this.menuWait -= dt;
        let menuY = (pad?.axes[1] || 0),
          menuX = (pad?.axes[0] || 0);
        if (this.menuWait <= 0 && (Math.abs(menuY) > .6 || Math.abs(menuX) > .6 || pad?.buttons[12]?.pressed || pad?.buttons[13]?.pressed || pad?.buttons[14]?.pressed || pad?.buttons[15]?.pressed)) {
          app.ui.focus(menuY < -.6 || menuX < -.6 || pad?.buttons[12]?.pressed || pad?.buttons[14]?.pressed ? -1 : 1);
          this.menuWait = .22
        }
        // The south button remains menu confirm even though it now jumps in combat.
        const confirmJump=this.press('jump'),confirmInteract=this.press('interact');
        if (confirmJump || confirmInteract) app.ui.confirmMenu();
        if (this.press('dodge')) app.ui.back();
        if (this.press('pause')) {
          if (app.state === 'Paused') app.resume();
          else app.ui.back()
        }
      }
      this.edges = Object.fromEntries(Object.entries(this.edges).filter(([k]) => !['zoomIn', 'zoomOut', 'objectiveNext', 'objectivePrev'].includes(k)))
    }
    finishRebind() {
      settings().profiles[this.signature] = {
        ...settings().bindings
      };
      save.write();
      this.rebind = null;
      app.ui.settings('gamepad')
    }
    startRebind(type, action) {
      this.clear();
      this.rebind = {
        type,
        action,
        axes: this.pad ? Array.from(this.pad.axes) : [],
        buttons: this.pad ? this.pad.buttons.map(b => b.value) : []
      };
      $('bindStatus').textContent = type === 'key' ? 'اضغط المفتاح الجديد (Escape للإلغاء)' : 'اضغط زرًا أو حرّك المحور من وضعه المحايد. انتظار اتصال اليد إن لم تظهر.'
    }
  }
  // Original synthesized Foley: shared noise, filtered swishes, resonant steel,
  // leather/stone steps and percussion. No audio files or network dependencies.
  class AudioManager {
    constructor() {
      this.ctx = null; this.voices = 0; this.tick = 0; this.next = 0;
      this.enabled = false; this.footDistance = 0; this.lastFoot = null; this.footMounted = false;
      this.mix = 0; this.ambience = null;
    }
    unlock() {
      if (this.failed) return;
      try {
        if (!this.ctx) {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          const c = this.ctx;
          this.master = c.createGain(); this.limiter = c.createDynamicsCompressor();
          this.limiter.threshold.value = -14; this.limiter.knee.value = 16;
          this.limiter.ratio.value = 8; this.limiter.attack.value = .003; this.limiter.release.value = .16;
          this.master.connect(this.limiter); this.limiter.connect(c.destination);
          this.master.gain.value = settings().master;
          this.noiseBuffer = c.createBuffer(1, Math.ceil(c.sampleRate * 2), c.sampleRate);
          const data = this.noiseBuffer.getChannelData(0);
          let seed = 197706, previous = 0;
          for (let i=0;i<data.length;i++) {
            seed = (Math.imul(seed,1664525)+1013904223)>>>0;
            const white = seed / 2147483648 - 1;
            previous = previous * .78 + white * .22;
            data[i] = white * .65 + previous * .35;
          }
          const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
          source.buffer = this.noiseBuffer; source.loop = true;
          filter.type = 'lowpass'; filter.frequency.value = 220; filter.Q.value = .4;
          gain.gain.value = 0; source.connect(filter); filter.connect(gain); gain.connect(this.master);
          source.start(); this.ambience = {source, filter, gain};
        }
        this.ctx.resume().catch(()=>{}); this.enabled = true;
      } catch(e) { this.failed = true; console.warn('Silent audio fallback', e); }
    }
    ready(music=false) {
      // Reserve one of the 24 voices for the persistent ambience source.
      return this.ctx?.state === 'running' && this.voices < (this.ambience ? 23 : 24) && settings().master > 0 && (music ? settings().music : settings().sfx) > 0;
    }
    envelope(gain, time, duration, volume, attack=.005) {
      gain.gain.setValueAtTime(.0001,time);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),time+Math.min(attack,duration*.3));
      gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    }
    tone(freq,dur,type='sine',gain=.1,when=0,slide=0,music=false) {
      if (!this.ready(music)) return;
      const c=this.ctx,t=Math.max(c.currentTime,when||0),o=c.createOscillator(),g=c.createGain();
      o.type=type; o.frequency.setValueAtTime(freq,t);
      if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(25,slide),t+dur);
      this.master.gain.value=settings().master;
      this.envelope(g,t,dur,gain*(music?settings().music:settings().sfx));
      o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.015);this.voices++;
      o.onended=()=>{o.disconnect();g.disconnect();this.voices=Math.max(0,this.voices-1);};
    }
    noise(dur,gain,freq=1200,type='bandpass',slide=0,delay=0,music=false) {
      if(!this.ready(music))return;
      const c=this.ctx,t=c.currentTime+delay,source=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
      source.buffer=this.noiseBuffer;f.type=type;f.frequency.setValueAtTime(freq,t);f.Q.value=.65;
      if(slide)f.frequency.exponentialRampToValueAtTime(Math.max(45,slide),t+dur);
      this.envelope(g,t,dur,gain*(music?settings().music:settings().sfx),type==='highpass'?.015:.006);
      source.connect(f);f.connect(g);g.connect(this.master);
      source.start(t,(this.tick%7)*.13,dur+.02);this.voices++;
      source.onended=()=>{source.disconnect();f.disconnect();g.disconnect();this.voices=Math.max(0,this.voices-1);};
    }
    sfx(name) {
      if(name==='victory'||name==='defeat') {
        const notes=name==='victory'?[293.66,369.99,440,587.33]:[220,196,146.83];
        notes.forEach((n,i)=>{this.tone(n,.65,'triangle',.045,(this.ctx?.currentTime||0)+i*.2);this.tone(n/2,.75,'sine',.055,(this.ctx?.currentTime||0)+i*.2);});
        return;
      }
      if(name==='light'||name==='dodge') {this.noise(.18,name==='light'?.12:.06,2400,'bandpass',500);return;}
      if(name==='heavy'||name==='skill') {this.noise(.3,.15,1600,'bandpass',280);this.tone(80,.15,'sine',.025,0,40);return;}
      if(name==='impactLight') {
        this.noise(.075,.16,1400,'bandpass',380); this.tone(160,.095,'sine',.095,0,52);
        this.tone(1750,.065,'sine',.023,0,1080);return;
      }
      if(name==='impactHeavy') {
        this.noise(.22,.23,420,'lowpass',100);this.noise(.085,.14,2200,'highpass',700);
        this.tone(76,.24,'sine',.18,0,30);this.tone(640,.11,'triangle',.024,0,230);return;
      }
      if(name==='guard'||name==='parry') {
        this.noise(.10,.10,3200,'highpass',1600);
        this.tone(name==='parry'?2100:1450,.25,'sine',.055,0,1700);
        this.tone(name==='parry'?3200:2350,.17,'sine',.035);return;
      }
      if(name==='ultimate') {this.noise(.75,.21,300,'lowpass',1500);this.tone(54,.7,'sine',.14,0,130);return;}
      if(name==='hoof') {
        this.noise(.065,.062,1000,'bandpass',340);
        this.tone(125,.075,'sine',.044,0,46);
        this.noise(.055,.044,720,'lowpass',240,.065);
        this.tone(105,.06,'sine',.031,(this.ctx?.currentTime||0)+.065,42);return;
      }
      if(name==='mount') {this.noise(.16,.06,650,'bandpass',300);this.tone(185,.12,'triangle',.025,0,90);return;}
      if(name==='jump') {this.noise(.14,.052,1700,'bandpass',420);return;}
      if(name==='foot') {this.noise(.055,.038,650,'lowpass',180);this.tone(90,.045,'sine',.025,0,40);return;}
      if(name==='warning'){this.tone(330,.2,'triangle',.045,0,220);return;}
      this.tone(550,.045,'sine',.035);
    }
    update() {
      if(this.ctx?.state==='suspended'&&app.state==='Playing'&&app.battle.time>3&&!this.prompted){
        this.prompted=true;app.ui.message('اضغط الشاشة أو مفتاحاً لتفعيل الصوت؛ يمكنك المتابعة بصمت وفي النافذة.',6);
      }
      if(!this.ctx||this.ctx.state!=='running')return;
      const c=this.ctx,playing=app.state==='Playing';
      this.master.gain.setTargetAtTime(settings().master,c.currentTime,.03);
      if(this.ambience)this.ambience.gain.gain.setTargetAtTime(playing?.022*settings().sfx:0,c.currentTime,.5);
      if(!playing)return;
      const p=app.player;
      const mounted=!!p.mounted;
      if(mounted!==this.footMounted){this.footDistance=0;this.footMounted=mounted;}
      if(this.lastFoot){
        const travel=Math.hypot(p.x-this.lastFoot.x,p.z-this.lastFoot.z);
        // Accumulate actual travel so stationary horses stay silent and attack
        // movement still produces hooves. Ignore teleports and airborne strides.
        const grounded=!(p.airTime>0)&&!(p.y>.15);
        if(travel<1&&grounded&&(mounted||['Move','Sprint','Idle','Run','Walk'].includes(p.state)))this.footDistance+=travel;
        const stride=mounted?1.8:p.state==='Sprint'?1.45:1.1;
        if(this.footDistance>stride){this.footDistance%=stride;this.sfx(mounted?'hoof':'foot');}
      }
      if(!this.lastFoot)this.lastFoot={x:p.x,z:p.z};
      else{this.lastFoot.x=p.x;this.lastFoot.z=p.z;}
      if(this.next<c.currentTime)this.next=c.currentTime+.03;
      const boss=app.battle?.boss?.hp>0&&dist(p,app.battle.boss)<30;
      const elite=app.store?.actors.some(a=>a.elite&&a.faction===1&&a.hp>0&&dist(a,p)<18);
      const target=boss?2:elite?1:0; this.mix+=(target-this.mix)*.07;
      const beat=.32-this.mix*.055;
      while(this.next<c.currentTime+.12){
        const n=this.tick++,t=this.next,chord=Math.floor(n/16)%4,root=[73.42,65.41,87.31,55][chord];
        if(n%2===0)this.tone(n%4===0?78:122,.18,'sine',n%4===0?.15:.04,t,34,true);
        if(n%4===2)this.noise(.08,.023,1400,'bandpass',450,Math.max(0,t-c.currentTime),true);
        if(n%8===0){this.tone(root,.9,'triangle',.036,t,0,true);this.tone(root*1.5,.85,'sine',.018,t,0,true);}
        if(n%4===3)this.tone(root*[4,3,4.5,3][Math.floor(n/4)%4],.4,'triangle',.018+.006*this.mix,t,0,true);
        if(boss&&n%2===1)this.tone(147,.1,'sine',.043,t,55,true);
        this.next+=beat;
      }
    }
    pause(){this.ctx?.suspend().catch(()=>{});this.next=0;this.lastFoot=null;this.footDistance=0;}
    resume(){this.ctx?.resume().catch(()=>{});this.next=0;this.lastFoot=null;}
  }
