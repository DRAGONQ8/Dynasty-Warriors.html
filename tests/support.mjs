import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

export const root = fileURLToPath(new URL('../', import.meta.url));

/** Load the real browser save/data modules without initializing WebGL. */
export async function loadSave(initial = {}, {unavailable = false} = {}) {
  const memory = new Map(Object.entries(initial));
  const storage = {
    getItem(key) { if (unavailable) throw Error('Storage disabled'); return memory.get(key) ?? null; },
    setItem(key, value) { if (unavailable) throw Error('Storage disabled'); memory.set(key, String(value)); },
    removeItem(key) { if (unavailable) throw Error('Storage disabled'); memory.delete(key); }
  };
  const context = vm.createContext({
    BABYLON: {}, document: {getElementById: () => null}, localStorage: storage,
    console: {warn() {}, log() {}, error() {}}, Blob, URL, setTimeout
  });
  const files = await Promise.all(['00-core.js', '10-save.js'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')));
  vm.runInContext(files.join('\n') + '\n globalThis.testAPI = {BUILD,HEROES,STAGES,TYPES,NAMES,ABILITIES,RELICS,ACHIEVEMENTS,DEFAULT_KEYS,DEFAULT_BIND,defaults,SaveService,save};})();', context);
  return {...context.testAPI, memory};
}

export const plain = value => JSON.parse(JSON.stringify(value));

export async function loadCombat() {
  const files = await Promise.all(['00-core.js', '10-save.js', '40-combat.js'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')));
  const context = vm.createContext({
    BABYLON: {Color3: class {}, Color4: class {}}, document: {getElementById() {}},
    localStorage: {getItem() {return null;}, setItem() {}, removeItem() {}}, console, Blob, URL, setTimeout
  });
  const fixture = `
  app = {
    input:{move:{x:0,y:0},press:()=>false,held:()=>false,release:()=>false},
    camera:{yaw:0,target:null,shake:0},
    collision:{move:(a,x,z)=>{a.x+=x;a.z+=z;},visible:()=>true,blocked:()=>false,gates:[],direction:()=>({x:0,z:0})},
    store:{actors:[]}, spatial:{query:(x,z,r)=>app.store.actors.filter(a=>Math.hypot(a.x-x,a.z-z)<=r)},
    effects:{emit(){},burst(){},impact(){}},audio:{sfx(){}},ui:{message(){}},
    performance:{decisions:0},scene:{getLightByName:()=>null},
    battle:{stats:{combo:0,highCombo:0,comboTime:0,ko:0,officers:0,dealt:0,received:0},event(){},queueWave(){}}
  };
  globalThis.testAPI={CombatSystem,app,save,HEROES,TYPES};})();`;
  vm.runInContext(files.join('\n') + fixture, context);
  return context.testAPI;
}

export function legacySave(heroCount = 4) {
  return {
    schema: 1, build: '1.4.0', shards: 180,
    heroes: Array.from({length: heroCount}, (_, i) => ({level: i + 2, xp: 42 + i, up: [1, 2, 0]})),
    completed: [true, true, false], selectedHero: heroCount - 1, selectedStage: 2,
    best: {'campaign-0-normal': {rank: 'A', score: 84, time: 230}}, committed: ['legacy-session'],
    settings: {keyboard: {dodge: 'Space'}, bindings: {interact: 0}, frameTarget: 30, music: .2}
  };
}
