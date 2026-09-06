import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const url = process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/';
const out = 'output/playwright';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const report = { journeys: [], bonuses: [], checks: [], errors };
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.vectorShooterDebug.getState());
const action = name => page.locator('[data-action="' + name + '"]').click();
const step = n => page.evaluate(n => window.vectorShooterDebug.step(n), n);
const snapshot = async name => {
 const buffer = await page.screenshot({ path: out + '/' + name + '.png' });
 const png = PNG.sync.read(buffer);
 let lit = 0;
 for (let i = 0; i < png.data.length; i += 4) if (Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 60) lit++;
 assert(lit > 800, name + ' is blank');
 return png;
};
const launch = async () => { await action('launch'); await page.waitForTimeout(90); };
const finish = async () => { await page.evaluate(() => window.vectorShooterDebug.finishEncounter()); await page.waitForTimeout(60); };
const warp = async () => { await page.evaluate(() => window.vectorShooterDebug.reachGate()); await step(2.2); await page.waitForTimeout(80); };
const layout = async () => {
 const result = await page.evaluate(() => {
  const overlay = document.querySelector('#launchOverlay');
  const root = overlay.hidden ? document.querySelector('.hud') : overlay;
  const overflow = [...root.querySelectorAll('button, dt, dd, h2, .model-copy p')].filter(el => {
   if (!el.getClientRects().length) return false;
   return el.scrollWidth > el.clientWidth + 2;
  }).map(el => el.textContent);
  const selectors = '.hud-panel,.radar,.bottom-strip,.message-log,.arcade-strip,.flight-buttons,#objectiveArrow,#threatArrow,#hitCallout';
  const boxes = overlay.hidden ? [...document.querySelectorAll(selectors)].filter(el => el.getClientRects().length && getComputedStyle(el).opacity !== '0').map(el => ({ id: el.id || el.className, rect: el.getBoundingClientRect() })) : [];
  const overlaps = [];
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   const a=boxes[i].rect,b=boxes[j].rect;
   if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)overlaps.push(boxes[i].id+' / '+boxes[j].id);
  }
  return { overflow, overlaps, wide: root.scrollWidth > innerWidth + 2 };
 });
 assert.deepEqual(result, { overflow: [], overlaps: [], wide: false });
};
try {
 await page.addInitScript(() => {
  localStorage.setItem('vector-shooter-save-v1', JSON.stringify({ credits: 9999, bestScore: 1200, unlockedWeaponLevel: 3, wantedBySector: { old: 4 } }));
  const OriginalAudioContext = window.AudioContext;
  window.__audioContexts = [];
  window.AudioContext = class extends OriginalAudioContext { constructor(...args) { super(...args); window.__audioContexts.push(this); } };
 });
 await page.goto(url);
 await page.waitForFunction(() => window.vectorShooterDebug);
 await snapshot('arcade-title'); await layout();
 const initialScan = (await state()).briefingCount;
 await action('scanNext'); assert.notEqual((await state()).briefingCount, initialScan);
 await action('scanPrevious'); assert.equal((await state()).briefingCount, initialScan);
 await page.waitForTimeout(5100); assert.notEqual((await state()).briefingCount, initialScan);
 await action('newRun'); await launch();
 assert.equal((await state()).wanted, false); assert.equal((await state()).credits, 0);
 for(let i=0;i<5;i++)await page.mouse.wheel(0,100);
 await page.mouse.move(720,450);
 const before = (await state()).orientation;
 await page.mouse.move(760,465); await step(.1);
 assert.notDeepEqual((await state()).orientation, before);
 await page.evaluate(() => window.vectorShooterDebug.spawnIncomingBolt());
 await page.mouse.down(); await step(.6); await page.mouse.up();
 assert((await state()).stats.shots > 0);
 assert((await state()).stats.interceptions > 0);
 const p1 = await snapshot('combat-pulse');
 await page.waitForTimeout(200);
 const p2 = await snapshot('combat-motion');
 let changed=0;for(let i=0;i<p1.data.length;i+=4)if(p1.data[i]!==p2.data[i]||p1.data[i+1]!==p2.data[i+1]||p1.data[i+2]!==p2.data[i+2])changed++;
 assert(changed>300,'canvas is not animated');
 const friends = (await state()).actors.filter(a => a.kind === 'police' || a.kind === 'trader').map(a => [a.id,a.hull]);
 await page.evaluate(() => { window.vectorShooterDebug.primeBlast(); window.vectorShooterDebug.blast(); });
 assert.equal((await state()).wanted, false);
 for(const [id,hull] of friends)assert.equal((await state()).actors.find(a=>a.id===id).hull,hull);
 await page.mouse.click(720,450,{button:'middle'}); assert.equal((await state()).menu,'pause');
 const frozen=(await state()).elapsed; await step(10); assert.equal((await state()).elapsed,frozen);
 await action('unpause'); await page.waitForTimeout(100);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); assert.equal((await state()).menu,'pause');
 await action('unpause'); await page.waitForTimeout(100);
 await page.evaluate(()=>document.exitPointerLock()); await page.waitForTimeout(100);
 assert.equal((await state()).menu,'pause');
 await action('unpause'); await page.waitForTimeout(100);
 const audio = await page.evaluate(()=>window.__audioContexts.map(c=>c.state));
 assert(audio.includes('running'));
 report.checks.push('mouse fire, steering, wheel, interception, friendly blast safety, mouse pause, blur and pointer-lock pause, audio');

 for(let death=0;death<3;death++){
  await page.evaluate(()=>window.vectorShooterDebug.forcePlayerDeath());
  assert.equal((await state()).lives,2-death);
  assert.equal((await state()).menu,'gameover');
  if(death===0)await snapshot('relaunch');
  await action('relaunch'); await page.waitForTimeout(100);
 }
 assert.equal((await state()).continued,true);assert.equal((await state()).lives,3);assert.equal((await state()).score,0);
 await page.evaluate(()=>window.vectorShooterDebug.forcePlayerDeath());
 await page.waitForTimeout(10300);
 assert.equal((await state()).menu,'title');
 await action('resumeRun');assert.equal((await state()).menu,'gameover');assert.equal((await state()).lives,2);
 await action('relaunch');await page.waitForTimeout(100);
 report.checks.push('death rollback, immediate relaunch and unlimited continue');

 for(let n=1;n<=12;n++){
  assert.equal((await state()).stage,n);
  if(n===3){
   const before=(await state()).position;
   await page.mouse.move(810,520);await step(.3);
   const after=(await state()).position;
   assert.equal(after[1],0);assert.equal(after[2],0);assert.notEqual(after[0],before[0]);
   await snapshot('armada');
  }
  if([4,8,12].includes(n)){
   await step(.1);
   const s=await state(), carrier=s.actors.find(a=>a.kind==='pirate'&&a.role==='carrier');
   assert(carrier);
   await page.evaluate(id=>window.vectorShooterDebug.hitActor(id,9999),carrier.id);
   assert.equal((await state()).actors.find(a=>a.id===carrier.id).hull,carrier.hull);
   await snapshot('carrier-'+n);
  }
  await finish();
  assert.match(await page.locator('#missionProgress').innerText(),/WARP/);
  const reward=(await state()).credits;
  await finish();assert.equal((await state()).credits,reward);
  await warp();
  if(n===12){assert.equal((await state()).menu,'victory');break;}
  if([3,7,11].includes(n)){
   assert.equal((await state()).menu,'bonusOffer');
   const main=await state();
   await action('bonusPlay');await page.waitForTimeout(100);await step(2);
   await snapshot('bonus-'+n);
   assert((await state()).bonus);
   await page.mouse.click(720,450,{button:'right'});
   assert.equal((await state()).menu,'bonusResult');
   assert.equal((await state()).lives,main.lives);assert.equal((await state()).hull,main.hull);
   assert.equal((await state()).shield,main.shield);assert.deepEqual((await state()).tiers,main.tiers);
   await action('bonusDock');
  }
  assert.equal((await state()).menu,'shop');
  if(n===1){
   await action('equip:spread');
   await page.evaluate(()=>window.vectorShooterDebug.giveCredits(400));
   await action('buy:tier'); assert.equal((await state()).tiers.spread,2);
   await snapshot('shop');
   await action('title'); await page.reload(); await action('resumeRun');
   assert.equal((await state()).menu,'shop'); assert.equal((await state()).tiers.spread,2);
  }
  await action('depart');await launch();
  report.journeys.push({mode:'journey',stage:n,verified:'briefing, encounter settlement, warp, dock'});
 }
 await snapshot('journey-victory');
 await action('title');await action('mode:endless');await action('newRun');await launch();
 for(let n=1;n<=10;n++){
  assert.equal((await state()).stage,n);await finish();
  if(n%5){
   assert.equal((await state()).phase,'recovery');
   await page.mouse.click(720,450);await page.waitForTimeout(100);
   assert.equal((await state()).stage,n+1);
  }else{
   await warp();assert.equal((await state()).menu,'bonusOffer');
   if(n===5){
    await action('bonusPlay');await page.waitForTimeout(100);
    await page.evaluate(()=>window.vectorShooterDebug.finishBonus('crash'));
    assert.equal((await state()).lives,3);
    await action('bonusDock');
   }else await action('bonusSkip');
   await action('equip:lance');
   await snapshot('endless-dock-'+n);
   await action('depart');await launch();
  }
  report.journeys.push({mode:'endless',stage:n,verified:'wave, recovery / boss dock and bonus'});
 }
 await page.mouse.click(720,450,{button:'middle'});
 await action('title'); await page.reload();
 await action('mode:journey');
 assert.match(await page.locator('.record-line').innerText(),/CONTINUED/);
 await action('mode:endless');await action('resumeRun');await launch();
 assert.equal((await state()).stage,11);
 assert.equal((await state()).weapon,'lance');
 report.checks.push('twelve Journey stages, ten Endless waves, separate resumes, bonus isolation and single payouts');

 const bonusChecks = await page.evaluate(async () => {
  const { BonusController }=await import('/src/bonus.ts');
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const result=[];
  for(const kind of ['asteroids','canyon','sequence']){
   for(const reason of ['complete','crash','timeout','exit']){
    const b=new BonusController(kind,41),c=new THREE.PerspectiveCamera(68,1,.1,6000);
    if(reason==='timeout') for(let i=0;i<4600&&!b.state.finished;i++)b.step(1/60,{x:0,y:0},c);
    else if(reason==='crash'&&kind==='canyon')for(let i=0;i<260&&!b.state.finished;i++)b.step(1/60,{x:300,y:0},c);
    else b.finish(reason);
    if(!b.state.finished)throw new Error(kind+' '+reason+' did not exit');
    const ratio=b.ratio;b.finish('exit');if(b.ratio!==ratio)throw new Error('double exit changed result');
    result.push({kind,requested:reason,actual:b.state.reason,health:b.state.health,ratio});b.dispose();
   }
  }
  const b=new BonusController('sequence',41),c=new THREE.PerspectiveCamera(68,1,.1,6000);
  c.lookAt(16.5,40.5,-206);b.shoot(c);
  if(b.state.remaining!==58||b.state.nextMarker!==1)throw new Error('wrong marker penalty');
  for(let i=0;i<16;i++){c.lookAt((i%4-1.5)*33,(1.5-Math.floor(i/4))*27,-170-(i%3)*18);b.shoot(c);}
  if(b.state.nextMarker!==17||b.state.reason!=='complete')throw new Error('ordered markers failed');
  b.dispose();
  return result;
 });
 report.bonuses=bonusChecks;
 for(const size of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844},{width:650,height:779}]){
  await page.setViewportSize(size);await page.waitForTimeout(120);
  await layout();await snapshot('hud-'+size.width);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await action('title');
  await layout();await snapshot('title-'+size.width);
  await action('resumeRun');await launch();
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'/arcade-report.json',JSON.stringify(report,null,2));
 console.log('PASS',JSON.stringify({journeys:report.journeys.length+1,bonusExits:report.bonuses.length,checks:report.checks,errors}));
} finally { await browser.close(); }
