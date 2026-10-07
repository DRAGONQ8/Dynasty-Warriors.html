import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {root} from './support.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8'};
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(resolve(root) + '/')) throw Error('Invalid path');
    response.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'});
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const externalRequests = [];
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
page.on('request', request => {if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) externalRequests.push(request.url());});
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
page.setDefaultTimeout(30000);

async function assertHealthy(label) {
  assert.notEqual(await page.evaluate(() => RiftDebug.app.state), 'FatalError', label);
  assert.deepEqual(errors, [], `${label}: browser errors`);
}
async function click(action, value) {
  await page.locator(`#screen [data-do="${action}"]${value === undefined ? '' : `[data-value="${value}"]`}`).first().click();
}
async function screenshot(name) {
  if (!process.env.ARTIFACT_DIR) return;
  await mkdir(process.env.ARTIFACT_DIR, {recursive: true});
  const debug=await page.evaluate(()=>{const value=RiftDebug.app.debug;RiftDebug.app.debug=false;document.getElementById('debug').style.display='none';return value;});
  await page.screenshot({path: resolve(process.env.ARTIFACT_DIR, name + '.png'), fullPage: true});
  await page.evaluate(debug=>{RiftDebug.app.debug=debug;},debug);
}

try {
  await page.goto(origin + '/index.html?debug', {waitUntil: 'load'});
  await page.waitForFunction(() => window.RiftDebug && RiftDebug.app.state === 'Menu', null, {timeout: 60000});
  await page.evaluate(() => {
    RiftDebug.setManual(true);
    RiftDebug.setSettings({preset: 'performance', auto: false, master: 0, music: 0, sfx: 0, touch: 'hide'});
  });
  assert.equal(await page.evaluate(() => RiftDebug.heroes().length), 12);
  assert.equal(await page.evaluate(() => RiftDebug.stages().length), 8);
  await assertHealthy('boot');
  await screenshot('main-desktop');

  // Exercise visible menus, filtering, the real 3D preview, and all settings tabs.
  await click('heroes');
  assert.equal(await page.locator('.heroCard').count(), 12);
  await page.locator('#heroSearch').fill('ريفن');
  assert.equal(await page.locator('.heroCard:visible').count(), 1);
  await click('previewHero', 11);
  assert.match(await page.locator('#previewHeroName').textContent(), /ريفن/);
  await click('previewAttack');
  await page.locator('#heroSearch').fill('');
  await page.locator('#heroFilter').selectOption('locked');
  assert.ok(await page.locator('.heroCard:visible').count() > 0);
  await page.locator('#heroFilter').selectOption('all');
  await screenshot('heroes-desktop');
  await page.locator('#heroSearch').fill('');
  await page.locator('#heroSearch').pressSequentially('x c x');
  assert.equal(await page.locator('#heroSearch').inputValue(),'x c x');
  assert.equal(await page.evaluate(()=>RiftDebug.app.ui.page),'heroes','typing native search must not trigger menu actions');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>RiftDebug.app.ui.page),'main','Escape leaves search once');
  await click('heroes');
  await click('main');
  await click('codex');
  assert.equal(await page.locator('.codexEntry').count(), 12);
  await click('codex', 'officers');
  assert.ok(await page.locator('.codexEntry').count() >= 17);
  await page.locator('#codexSearch').fill('فالكورا');
  assert.equal(await page.locator('.codexEntry:visible').count(), 1);
  await click('codex', 'stages');
  assert.equal(await page.locator('.codexEntry').count(), 8);
  await click('codex', 'achievements');
  assert.equal(await page.locator('.achievementCard').count(), 10);
  await click('codex', 'guide');
  assert.ok(await page.locator('.controlHelp').isVisible());
  await click('main');
  await click('settings');
  for (const tab of ['audio', 'controls', 'gamepad', 'progress', 'graphics']) {
    await click('settingsTab', tab);
    assert.equal(await page.evaluate(() => RiftDebug.app.ui.tab), tab);
  }
  await page.locator('[data-setting="frameTarget"]').selectOption('30');
  assert.equal(await page.evaluate(() => RiftDebug.getSave().settings.frameTarget), 30);
  await click('settingsBack');
  await click('missions');
  assert.equal(await page.locator('.missionCard').count(), 8);
  await screenshot('missions-desktop');
  await page.locator('#screen [data-do="brief"][data-value="0"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>RiftDebug.app.ui.page),'brief','Enter selects one menu action');
  assert.ok(await page.locator('.missionObjectives li').count() >= 5);
  await page.locator('#screen [data-do="start"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>RiftDebug.app.state),'Playing');
  assert.equal(await page.evaluate(()=>RiftDebug.app.player.y),0,'menu confirmation must not also jump');
  await assertHealthy('menus and preview');
  console.log('PASS: menus, native search keys, 3D preview, codex, settings and campaign briefing.');

  // Menus stay inside a narrow phone width; landscape mode is used for combat.
  await page.setViewportSize({width: 390, height: 844});
  await page.evaluate(() => RiftDebug.app.ui.main());
  for (const menu of ['main', 'heroes', 'codex', 'missions', 'settings']) {
    if (menu !== 'main') await page.evaluate(menu => RiftDebug.app.ui.action(menu), menu);
    const bounds = await page.evaluate(() => ({width: window.innerWidth, scroll: document.documentElement.scrollWidth, panel: document.querySelector('#screen .panel').getBoundingClientRect().toJSON()}));
    assert.ok(bounds.scroll <= bounds.width + 1, `${menu}: horizontal overflow ${bounds.scroll} > ${bounds.width}`);
    assert.ok(bounds.panel.width <= bounds.width + 1, `${menu}: panel too wide`);
    if (menu !== 'main') await page.evaluate(() => RiftDebug.app.ui.main());
  }
  await screenshot('main-mobile');
  await page.setViewportSize({width: 1280, height: 800});
  console.log('PASS: 390px phone menus have no horizontal overflow.');

  // Real DOM key events pass through the normal input manager and attack buffers.
  await page.evaluate(() => RiftDebug.start(0, 'training', 0));
  for (const [key, kind, skill] of [['j', 'light', -1], ['k', 'heavy', -1], ['e', 'skill', 0], ['r', 'skill', 1], ['f', 'ultimate', -1]]) {
    await page.evaluate(() => {
      const app=RiftDebug.app,p=app.player;
      app.input.clear(); app.combat.clearBuffers();
      p.attack=null; p.state='Idle'; p.stateTime=0; p.energy=p.ult=100;p.cooldowns.fill(0);app.combat.ultimateLock=0;
    });
    await page.keyboard.down(key);
    await page.evaluate(() => {const app=RiftDebug.app;app.input.poll(1/60);app.combat.step(1/60);});
    if (kind === 'heavy') {
      await page.keyboard.up(key);
      await page.evaluate(() => {const app=RiftDebug.app;app.input.poll(1/60);app.combat.step(1/60);});
    }
    const attack=await page.evaluate(() => ({kind:RiftDebug.app.player.attack?.kind,skill:RiftDebug.app.player.attack?.skill}));
    assert.equal(attack.kind, kind, `keyboard ${key}`);
    if (skill>=0)assert.equal(attack.skill,skill);
    await page.keyboard.up(key);
  }
  console.log('PASS: real J/K/E/R/F keyboard events reach combat.');

  // Show and scale mobile controls, then use a pointer action through the DOM.
  await page.setViewportSize({width: 844, height: 390});
  await page.evaluate(() => {
    RiftDebug.start(0,'training',0);
    RiftDebug.setSettings({touch:'show',scale:.8,opacity:.75});
  });
  assert.ok(await page.locator('#controls').evaluate(element=>element.classList.contains('on')));
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--scale').trim()),'.8'.replace(/^\./,'0.'));
  const lightButton=page.locator('.action[data-a="light"]');
  const buttonBox=await lightButton.boundingBox();
  await page.mouse.move(buttonBox.x+buttonBox.width/2,buttonBox.y+buttonBox.height/2);
  await page.mouse.down();
  await page.evaluate(()=>{const app=RiftDebug.app;app.input.poll(1/60);app.combat.step(1/60);});
  assert.equal(await page.evaluate(()=>RiftDebug.app.player.attack?.kind),'light');
  await page.mouse.up();
  await screenshot('training-mobile-landscape');
  await page.keyboard.down('Escape');
  await page.evaluate(()=>RiftDebug.app.input.poll(1/60));
  await page.keyboard.up('Escape');
  assert.equal(await page.evaluate(()=>RiftDebug.app.state),'Paused');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>RiftDebug.app.state),'Playing','Escape resumes once');
  await page.evaluate(()=>RiftDebug.setSettings({touch:'hide',scale:1}));
  await page.setViewportSize({width:1280,height:800});
  // Software GPU validation needs one deliberate render per scene, while the
  // normal render loop was already exercised through menus and input above.
  await page.evaluate(()=>RiftDebug.app.engine.stopRenderLoop());

  if (!process.env.UI_ONLY) {
  // Use real attacks and simulation for every hero, including all six charge routes.
  for (let hero = 0; hero < 12; hero++) {
    const report = await page.evaluate(hero => {
      const D = RiftDebug;
      D.start(0, 'training', hero);
      const app = D.app, attacks = [];
      const perform = (kind, skill = -1) => {
        const p = app.player;
        p.attack = null; p.state = 'Idle'; p.y = p.vy = 0; p.energy = p.ult = 100; p.cooldowns.fill(0);
        app.combat.ultimateLock = 0;
        if (!app.combat.attack(kind, .8, skill)) throw Error(`Hero ${hero} refused ${kind}:${skill}`);
        const attack = p.attack;
        const values = Object.fromEntries(['duration', 'start', 'end', 'reach', 'arc', 'damage', 'posture', 'pulses'].map(key => [key, attack[key]]));
        attacks.push({kind, skill, values});
        for (let frame = 0; frame < Math.ceil((attack.duration + .4) * 60); frame++) {
          app.spatial.build(app.store.actors);
          app.combat.step(1 / 60);
          app.battle.update(1 / 60);
          app.effects.update(1 / 60);
        }
      };
      perform('light');
      for (let charge = 0; charge < 6; charge++) {
        app.combat.chain = charge; app.combat.chainTime = 1;
        perform('heavy');
      }
      perform('skill', 0); perform('skill', 1); perform('ultimate');
      return {attacks, hp: app.player.hp, actorHealth: app.store.actors.map(actor => actor.hp), state: app.state};
    }, hero);
    for (const attack of report.attacks) for (const [key, value] of Object.entries(attack.values)) assert.ok(Number.isFinite(value), `hero ${hero} ${attack.kind}:${attack.skill} ${key}=${value}`);
    assert.ok(Number.isFinite(report.hp) && report.actorHealth.every(Number.isFinite), `hero ${hero}: finite health`);
    assert.equal(report.state, 'Playing');
    await assertHealthy(`hero ${hero}`);
    console.log(`PASS: hero ${hero+1}/12 combat actions.`);
  }
  console.log('PASS: 12 heroes, 6 charge routes each, both skills and ultimate, real simulation.');

  // Check mounts through their normal interaction, including stamina and a safe landing.
  const mount = await page.evaluate(() => {
    const D = RiftDebug;
    D.start(0, 'training', 0);
    const app = D.app, horse = app.mounts.horses[0];
    D.position(horse.x, horse.z);
    app.mounts.interact();
    const mounted = !!app.player.mounted;
    for (let i = 0; i < 120; i++) {app.mounts.move(1, 0, 1, 1 / 60, true); app.mounts.update(1 / 60);}
    app.mounts.dismount();
    return {mounted, dismounted: !app.player.mounted, stamina: horse.stamina, blocked: app.collision.blocked(app.player.x, app.player.z), position: [app.player.x, app.player.z]};
  });
  assert.ok(mount.mounted && mount.dismounted && !mount.blocked);
  assert.ok(mount.stamina >= 0 && mount.stamina <= 100 && mount.position.every(Number.isFinite));

  // Initial target, captain and player spawn must be accessible on all battlefields.
  for (const mode of ['campaign', 'skirmish']) for (let stage = 0; stage < 8; stage++) {
    const info = await page.evaluate(({stage, mode}) => {
      const D = RiftDebug; D.start(stage, mode, stage % 12);
      const app = D.app, target = D.target(), p = app.player;
      D.step(3);
      app.renderer.render(app.store,app.player,app.battle.time);app.ui.update(.1);app.minimap.draw(.1);app.scene.render();
      return {
        name: app.battle.stage.name, expected: D.stages()[stage].name, mode: app.battle.mode,
        state: app.state, spawnBlocked: app.collision.blocked(p.x, p.z),
        target: target && {x: target.x, z: target.z}, targetBlocked: target && app.collision.blocked(target.x, target.z, .4),
        reachable: target && app.collision.flow(target)[app.collision.index(p.x, p.z)] >= 0,
        blockedCaptains: app.battle.bases.filter(base => base.captain && app.collision.blocked(base.captain.x, base.captain.z, .5)).map(base => base.name),
        actors: app.store.actors.length, meshes: app.scene.meshes.length
      };
    }, {stage, mode});
    assert.equal(info.name, info.expected, `${mode} stage ${stage}: stage clamp`);
    assert.equal(info.mode, mode);
    assert.equal(info.state, 'Playing');
    assert.ok(!info.spawnBlocked && info.target && !info.targetBlocked && info.reachable, `${mode} stage ${stage}: spawn/target accessibility ${JSON.stringify(info)}`);
    assert.deepEqual(info.blockedCaptains, [], `${mode} stage ${stage}: captain spawn`);
    assert.ok(info.actors > 20 && info.meshes > 20);
    await assertHealthy(`${mode} stage ${stage}`);
    if(mode==='skirmish'){
      const victory=await page.evaluate(()=>{
        const D=RiftDebug,app=D.app,battle=app.battle;
        for(const actor of app.store.actors)if(actor.faction===1&&actor.hp>0)D.kill(actor);
        for(const base of battle.bases){D.capture(base.id);app.spatial.build(app.store.actors);battle.update(.5);}
        return {state:app.state,allFriendly:battle.bases.every(base=>base.owner===0),officerDown:battle.fieldOfficer.hp<=0};
      });
      assert.ok(victory.state==='Results'&&victory.allFriendly&&victory.officerDown,`${mode} stage ${stage}: victory conditions`);
    }
    console.log(`PASS: ${mode} battlefield ${stage+1}/8 loaded.`);
    if (mode === 'campaign' && stage === 3) await screenshot('dragon-coast');
    if (mode === 'campaign' && stage === 6) await screenshot('frost-campaign');
  }
  console.log('PASS: all 8 campaign and 8 skirmish battlefields load, render and expose reachable targets; all skirmishes reach victory.');

  // Fulfil the new campaign conditions through kills, captures and defense clocks.
  // No calls to complete()/finish(): the real director must decide when to advance.
  for (let stage = 3; stage < 8; stage++) {
    const result = await page.evaluate(stage => {
      const D = RiftDebug; D.start(stage, 'campaign', 0);
      const app = D.app, battle = app.battle, steps = battle.stage.campaign.steps, visited = [];
      const clearEnemies = () => {for (const actor of app.store.actors) if (actor.faction === 1 && actor.hp > 0) D.kill(actor);};
      for (let iteration = 0; iteration < 1000 && app.state === 'Playing'; iteration++) {
        const node = battle.node, step = steps[node];
        if (!step) throw Error(`Missing campaign step ${stage}:${node}`);
        if (!visited.includes(node)) visited.push(node);
        clearEnemies();
        const base = battle.bases[step.base];
        if (step.kind === 'capture') D.capture(base.id);
        else if (step.kind === 'officer' && base.captain.hp > 0) D.kill(base.captain);
        else if (step.kind === 'defend') {
          app.player.x = battle.commander.x; app.player.z = battle.commander.z;
        } else if (step.kind === 'interact') {
          const target = D.target(); D.position(target.x, target.z); battle.interact();
        }
        app.spatial.build(app.store.actors);
        app.combat.stepAI(step.kind === 'defend' ? 1 : .5);
        battle.update(step.kind === 'defend' ? 1 : .5);
      }
      const first = D.getSave();
      battle.finish(true);
      const again = D.getSave();
      return {state: app.state, settled: battle.settled, node: battle.node, nodes: battle.stage.nodes.length, visited, completed: first.completed[stage], careerWins: first.career.wins, shards: first.shards, unchanged: JSON.stringify(first) === JSON.stringify(again), score: first.best[`campaign-${stage}-normal`]?.score};
    }, stage);
    assert.equal(result.state, 'Results', `stage ${stage}: campaign did not finish ${JSON.stringify(result)}`);
    assert.ok(result.settled && result.completed && result.unchanged, `stage ${stage}: saved victory and idempotent rewards`);
    assert.equal(result.node, result.nodes);
    assert.equal(result.visited.length, result.nodes);
    assert.ok(Number.isFinite(result.score));
    await assertHealthy(`campaign ${stage} victory`);
    console.log(`PASS: new campaign ${stage+1}/8 victory saved once.`);
  }
  console.log('PASS: all 5 new campaigns reach victory via objective conditions and commit rewards once.');

  // Commander death is a loss and cannot mark the chapter complete.
  const defeat = await page.evaluate(() => {
    const D = RiftDebug; D.resetSave(); D.start(7, 'campaign', 0);
    D.fail('commander'); D.step(1);
    return {state: D.app.state, completed: D.getSave().completed[7], wins: D.getSave().career.wins};
  });
  assert.equal(defeat.state, 'Results');
  assert.equal(defeat.completed, false);
  assert.equal(defeat.wins, 0);
  await assertHealthy('loss path');
  } else {
    for (const [stage,name] of [[3,'dragon-coast'],[6,'frost-campaign'],[7,'volcanic-campaign']]) {
      const state=await page.evaluate(stage=>{RiftDebug.start(stage,'campaign',0);RiftDebug.step(3);const app=RiftDebug.app;app.renderer.render(app.store,app.player,app.battle.time);app.ui.update(.1);app.minimap.draw(.1);app.scene.render();return app.state;},stage);
      assert.equal(state,'Playing');
      await screenshot(name);await assertHealthy(name);
    }
    console.log('PASS: latest coast, frost and volcanic worlds render without errors.');
  }
  assert.deepEqual(externalRequests, [], 'procedural game requests no external assets');

  const offlineContext=await browser.newContext({offline:true,viewport:{width:1280,height:800}});
  const offlinePage=await offlineContext.newPage(),offlineErrors=[],offlineNetwork=[];
  offlinePage.on('pageerror',error=>offlineErrors.push(error.message));
  offlinePage.on('request',request=>{if(/^https?:/.test(request.url()))offlineNetwork.push(request.url());});
  let fileNavigation=true;
  try {
    await offlinePage.goto(pathToFileURL(resolve(root,'index.html')).href+'?debug',{waitUntil:'load'});
  } catch(error) {
    if(!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw error;
    fileNavigation=false;
    console.log('SKIP: file:// navigation is blocked by the system Chromium URL policy; testing the same standalone HTML offline through a fulfilled local document.');
    const offlineUrl=origin+'/offline.html?debug',html=await readFile(resolve(root,'index.html'),'utf8');
    await offlinePage.route('**/*',route=>route.request().url()===offlineUrl?route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}):route.abort());
    await offlinePage.goto(offlineUrl,{waitUntil:'load'});
  }
  await offlinePage.waitForFunction(()=>window.RiftDebug&&RiftDebug.app.state==='Menu',null,{timeout:60000});
  const offlineResult=await offlinePage.evaluate(()=>{RiftDebug.setManual(true);RiftDebug.start(3,'campaign',6);RiftDebug.step(5);RiftDebug.app.scene.render();return {state:RiftDebug.app.state,name:RiftDebug.app.battle.stage.name,heroes:RiftDebug.heroes().length};});
  assert.equal(offlineResult.state,'Playing');
  assert.equal(offlineResult.heroes,12);
  assert.deepEqual(offlineErrors,[]);
  assert.deepEqual(offlineNetwork,fileNavigation?[]:[origin+'/offline.html?debug'],'standalone has no external assets or additional HTTP requests');
  await offlineContext.close();
  console.log(`PASS: standalone index.html runs ${fileNavigation?'via file://':'from its exact disk HTML'} with network disabled and no external assets.`);
  console.log(process.env.UI_ONLY?'PASS: final UI, input and world rendering recheck; no browser errors.':'PASS: menus, preview, filters, settings, responsive width, horses and defeat path; no browser errors.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
