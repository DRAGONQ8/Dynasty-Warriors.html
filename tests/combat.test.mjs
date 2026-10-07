import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCombat} from './support.mjs';

test('earned relics affect the real combat stats, regeneration and skill recovery', async () => {
  const {CombatSystem, app, save, HEROES} = await loadCombat();
  save.data.completed.fill(true);
  assert.equal(save.equip(0, 'aegis'), true);
  app.combat = new CombatSystem();
  app.player = app.combat.initPlayer(0, 0, 0);
  assert.equal(app.player.maxHp, HEROES[0].hp * 1.12);
  assert.equal(save.equip(0, 'dawnblade'), true);
  app.player = app.combat.initPlayer(0, 0, 0);
  assert.equal(app.player.dmg, HEROES[0].dmg * 1.08);
  save.equip(0, 'vigor');
  app.player = app.combat.initPlayer(0, 0, 0);
  app.player.energy = 0;
  app.combat.stepPlayer(.5);
  assert.ok(Math.abs(app.player.energy - 2.7) < .00001);
  save.equip(0, 'focus');
  app.player = app.combat.initPlayer(0, 0, 0);
  app.player.cooldowns = [10, 10];
  app.combat.stepPlayer(.5);
  assert.ok(Math.abs(app.player.cooldowns[0] - 9.44) < .00001);
});

test('perfect dodges reward once per dodge, jumping avoids shockwaves, and parries stop damage', async () => {
  const {CombatSystem, app} = await loadCombat();
  app.combat = new CombatSystem();
  const player = app.player = app.combat.initPlayer(11, 0, 0);
  const officer = {id:20,gen:1,type:'valkora',faction:1,x:0,z:1,hp:100,maxHp:100,posture:150,maxPosture:150,elite:true,active:true,yaw:Math.PI};
  const health = player.hp;
  Object.assign(player, {energy:30,ult:0,state:'Dodge',stateTime:.05,invul:.1});
  app.combat.damage(player, 40, officer);
  app.combat.damage(player, 40, officer);
  assert.equal(player.hp, health);
  assert.equal(player.energy, 42);
  assert.equal(player.ult, 12);
  assert.equal(app.battle.stats.perfectDodges, 1);
  assert.ok(player.critTime > 0);
  Object.assign(player, {state:'Idle',invul:0,grace:0,y:1});
  officer.pattern = 'wave';
  app.combat.damage(player, 40, officer);
  assert.equal(player.hp, health);
  Object.assign(player, {y:0,state:'Guard',parryTime:.1,yaw:0});
  app.combat.damage(player, 40, officer);
  assert.equal(app.battle.stats.parries, 1);
  assert.equal(player.hp, health);
  assert.equal(officer.state, 'React');
});

test('the final commander advances through three phases with a readable recovery interval', async () => {
  const {CombatSystem, app, TYPES} = await loadCombat();
  app.combat = new CombatSystem();
  const officer = {type:'cindermarshal',faction:1,elite:true,x:0,z:2,hp:80,maxHp:300,state:'Windup',slot:true,lastPhase:1,phaseHistory:[1]};
  app.combat.updateOfficerPhase(officer, TYPES.cindermarshal);
  assert.equal(officer.phase, 3);
  assert.equal(officer.state, 'Recover');
  assert.equal(officer.slot, false);
  assert.ok(officer.timer > .8);
});
