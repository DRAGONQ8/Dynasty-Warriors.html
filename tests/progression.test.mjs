import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSave, legacySave, plain} from './support.mjs';

test('all twelve commanders and eight battlefields have usable combat/content data', async () => {
  const {HEROES, STAGES, TYPES, ABILITIES} = await loadSave();
  assert.equal(HEROES.length, 12);
  assert.equal(STAGES.length, 8);
  assert.equal(new Set(HEROES.map(hero => hero.id)).size, HEROES.length);
  for (const [i, hero] of HEROES.entries()) {
    for (const key of ['hp', 'speed', 'dmg', 'reach', 'arc', 'duration']) assert.ok(Number.isFinite(hero[key]) && hero[key] > 0, `${hero.id}.${key}`);
    assert.equal(hero.skills.length, 2, hero.id);
    assert.ok(hero.skills.every(Boolean) && hero.ultimate && hero.lore && hero.role, hero.id);
    assert.ok(Number.isInteger(hero.unlockStage) && hero.unlockStage >= -1 && hero.unlockStage < STAGES.length, hero.id);
    for (const key of ['ultimateDamage', 'ultimatePulses', 'ultimateReach']) assert.ok(Number.isFinite(ABILITIES[key][i]) && ABILITIES[key][i] > 0, `${hero.id}.${key}`);
  }
  for (const stage of STAGES) {
    assert.ok(stage.nodes.length >= 5 && stage.brief && stage.name && stage.subtitle, stage.name);
    assert.ok(stage.limit > stage.par && stage.par > 0, stage.name);
    for (const [x, z] of stage.points) assert.ok(Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) < stage.w / 2 && Math.abs(z) < stage.h / 2, `${stage.name}: point ${x},${z}`);
  }
  for (const [id, type] of Object.entries(TYPES)) if (type.archetype) assert.ok(TYPES[type.archetype] && type.elite && type.phases >= 2, id);
});

for (const count of [4, 6]) test(`schema-1 saves with ${count} heroes retain progression and receive new records`, async () => {
  const old = legacySave(count);
  const {save, HEROES, STAGES, DEFAULT_KEYS, DEFAULT_BIND} = await loadSave({'riftbanner-save': JSON.stringify(old)});
  const next = plain(save.data);
  assert.equal(next.heroes.length, HEROES.length);
  assert.equal(next.completed.length, STAGES.length);
  assert.equal(next.shards, old.shards);
  assert.deepEqual(next.heroes.slice(0, count).map(({level, xp, up}) => ({level, xp, up})), old.heroes);
  assert.deepEqual(next.completed.slice(0, 3), old.completed);
  assert.ok(next.completed.slice(3).every(value => value === false));
  assert.ok(next.heroes.slice(count).every(hero => hero.level === 1 && hero.xp === 0));
  assert.deepEqual(next.best['campaign-0-normal'], old.best['campaign-0-normal']);
  assert.equal(next.settings.keyboard.jump, DEFAULT_KEYS.jump);
  assert.equal(next.settings.keyboard.dodge, DEFAULT_KEYS.dodge);
  assert.equal(next.settings.bindings.interact, DEFAULT_BIND.interact);
  assert.equal(next.settings.frameTarget, 30);
});

test('all stages retain valid best results through export/import and ignore invalid keys', async () => {
  const {save, defaults, STAGES} = await loadSave();
  const input = plain(defaults());
  input.completed.fill(true);
  for (let i = 0; i < STAGES.length; i++) for (const mode of ['campaign', 'skirmish']) for (const difficulty of ['normal', 'veteran']) {
    input.best[`${mode}-${i}-${difficulty}`] = {rank: 'S', score: 95, time: 180 + i};
  }
  input.best['campaign-999-normal'] = {rank: 'S', score: 100, time: 1};
  input.best['campaign-8-normal'] = {rank: 'S', score: 100, time: 1};
  input.best['campaign-1-normal'].rank = 'FAKE';
  const valid = plain(save.validate(input));
  assert.equal(Object.keys(valid.best).length, STAGES.length * 4 - 1);
  assert.equal(valid.best['campaign-7-veteran'].time, 187);
  assert.equal(valid.best['campaign-999-normal'], undefined);
  assert.equal(valid.best['campaign-8-normal'], undefined);
  assert.equal(valid.best['campaign-1-normal'], undefined);
  assert.deepEqual(plain(save.validate(JSON.parse(JSON.stringify(valid)))), valid);
});

test('unlocks follow the commander requirements and campaign order', async () => {
  const {save, HEROES, STAGES} = await loadSave();
  for (const [i, hero] of HEROES.entries()) assert.equal(save.unlocked(i), hero.unlockStage < 0, hero.id);
  for (let completed = 0; completed < STAGES.length; completed++) {
    save.data.completed[completed] = true;
    assert.equal(save.stageUnlocked(Math.min(completed + 1, STAGES.length - 1)), true);
    for (const [i, hero] of HEROES.entries()) assert.equal(save.unlocked(i), hero.unlockStage < 0 || hero.unlockStage <= completed, hero.id);
  }
  for (const invalid of [-1, 12, 100, NaN, 1.2]) assert.equal(save.unlocked(invalid), false);
  for (const invalid of [-1, 8, 100, NaN, 1.2]) assert.equal(save.stageUnlocked(invalid), false);
});

test('imports bound progression and settings and never select a locked commander/stage', async () => {
  const {save, defaults, HEROES} = await loadSave();
  const input = plain(defaults());
  input.shards = 1e99;
  input.heroes[0] = {level: 1e99, xp: 'Infinity', up: [-2, 99, '3']};
  input.completed[0] = 'true';
  input.selectedHero = HEROES.length - 1;
  input.selectedStage = 7;
  input.settings = {master: Infinity, deadzone: -5, preset: 'toString', keyboard: {light: '<script>'}, bindings: {ultimate: -3}};
  const valid = plain(save.validate(input));
  assert.equal(valid.shards, 1e6);
  assert.equal(valid.heroes[0].level, 20);
  assert.equal(valid.heroes[0].xp, 0);
  assert.deepEqual(valid.heroes[0].up, [0, 3, 3]);
  assert.equal(valid.completed[0], false);
  assert.equal(valid.selectedHero, 0);
  assert.equal(valid.selectedStage, 0);
  assert.equal(valid.settings.deadzone, .05);
  assert.equal(valid.settings.preset, 'balanced');
  assert.ok(valid.settings.master >= 0 && valid.settings.master <= 1);
  for (const invalid of [null, [], {schema: 2, heroes: []}, {schema: 1, heroes: []}]) assert.throws(() => save.validate(invalid));
});

test('corrupt saves recover a valid backup and unavailable storage keeps an exportable session', async () => {
  const old = legacySave(6);
  const {save} = await loadSave({'riftbanner-save': '{broken', 'riftbanner-backup': JSON.stringify(old)});
  assert.equal(save.recovered, true);
  assert.equal(save.data.shards, 180);
  save.write();
  assert.equal(save.memory, false);
  const blocked = await loadSave({}, {unavailable: true});
  assert.equal(blocked.save.memory, true);
  blocked.save.data.shards = 77;
  blocked.save.write();
  assert.equal(blocked.save.memory, true);
  assert.equal(blocked.save.data.shards, 77);
  assert.ok(JSON.stringify(blocked.save.data));
});

test('relics require campaign rewards, affect only the chosen hero, and survive migration', async () => {
  const {save, RELICS, defaults} = await loadSave();
  assert.equal(RELICS.length, 6);
  assert.equal(save.loadout(0).id, 'none');
  assert.equal(save.equip(0, 'dawnblade'), false);
  assert.equal(save.equip(0, 'unknown'), false);
  const crafted = plain(defaults());
  crafted.heroes[0].relic = 'crown';
  assert.equal(save.validate(crafted).heroes[0].relic, 'none');
  save.data.completed[0] = true;
  assert.equal(save.equip(0, 'dawnblade'), true);
  assert.equal(save.loadout(0).damage, .08);
  assert.equal(save.loadout(1).id, 'none');
  assert.equal(save.validate(plain(save.data)).heroes[0].relic, 'dawnblade');
  for (const relic of RELICS) {
    if (relic.stage !== undefined) save.data.completed[relic.stage] = true;
    assert.equal(save.equip(0, relic.id), true, relic.id);
    assert.equal(save.loadout(0).id, relic.id);
  }
});

test('war journal totals battle statistics and grants achievements once, excluding training', async () => {
  const {save, ACHIEVEMENTS} = await loadSave();
  const battle = {mode: 'training', stats: {ko: 150, officers: 20, highCombo: 60, perfectDodges: 10}};
  assert.deepEqual(plain(save.recordBattle(battle, true, 'S', 99)), []);
  assert.equal(save.data.career.battles, 0);
  battle.mode = 'campaign';
  save.data.completed.fill(true);
  save.data.heroes[0].level = 10;
  const earned = save.recordBattle(battle, true, 'S', 99).map(item => item.id);
  for (const id of ['first-light', 'hundred', 'officers', 'combo', 'evasion', 'master', 'campaign', 'champion']) assert.ok(earned.includes(id), id);
  assert.equal(save.data.career.battles, 1);
  assert.equal(save.data.career.wins, 1);
  assert.equal(save.data.career.ko, 150);
  battle.stats = {ko: 3, officers: 1, highCombo: 2, perfectDodges: 0};
  assert.deepEqual(plain(save.recordBattle(battle, false, 'D', 0)), []);
  assert.equal(save.data.career.battles, 2);
  assert.equal(save.data.career.wins, 1);
  assert.equal(save.data.career.ko, 153);
  assert.equal(save.data.career.highCombo, 60);
  assert.equal(save.data.achievements.length, new Set(save.data.achievements).size);
  assert.equal(save.achievements().length, ACHIEVEMENTS.length);
});
