import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import * as THREE from 'three';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const reports = [], errors = [];
page.on('pageerror',e=>errors.push(e.message));
await mkdir('output/playwright',{recursive:true});
const state=()=>page.evaluate(()=>window.vectorShooterDebug.getState());
const click=a=>page.locator('[data-action="'+a+'"]').click();
let mouse={x:640,y:400}, held=false;
const hold=async value=>{if(held===value)return;held=value;if(value)await page.mouse.down();else await page.mouse.up();};
const aim=async(dx,dy)=>{mouse.x+=Math.max(-220,Math.min(220,dx));mouse.y+=Math.max(-220,Math.min(220,dy));await page.mouse.move(mouse.x,mouse.y);};
const throttle=async(current,target)=>{const n=Math.round((target-current)/15);for(let i=0;i<Math.abs(n);i++)await page.mouse.wheel(0,n>0?-100:100);};
try{
 await page.addInitScript(()=>{Date.now=()=>41717;});
 await page.goto(process.env.SMOKE_URL??'http://127.0.0.1:5173/');
 for(const mode of process.env.PLAYTEST_MODE ? [process.env.PLAYTEST_MODE] : ['journey','endless']){
  await click('mode:'+mode);await click('newRun');
  let lastStage=0, iterations=0, deaths=0, previousStage=null, bonusTicks=0;
  while(iterations++<10000){
   const s=await state();
   if(s.stage!==lastStage){
    if(previousStage)reports.push(previousStage);
    lastStage=s.stage;previousStage={mode,stage:s.stage};bonusTicks=0;
    console.log('STAGE',mode,s.stage);
    if(mode==='endless'&&s.stage>10)break;
   }
   if(s.menu){
    await hold(false);
    if(s.menu==='briefing'){await click('launch');await page.waitForTimeout(60);await page.mouse.move(640,400);mouse={x:640,y:400};}
    else if(s.menu==='gameover'){deaths++;assert(deaths<15,'repeated failure '+mode+' '+s.stage);await click('relaunch');await page.waitForTimeout(60);await page.mouse.move(640,400);mouse={x:640,y:400};}
    else if(s.menu==='pause'){await click('unpause');await page.waitForTimeout(60);}
    else if(s.menu==='shop'){
     for(const item of ['repair','tier','shield','magnet']){
      const b=page.locator('[data-action="buy:'+item+'"]');
      if(await b.isEnabled())await b.click();
     }
     await page.screenshot({path:'output/playwright/played-'+mode+'-'+s.stage+'.png'});
     await click('depart');
    }else if(s.menu==='bonusOffer'){await click('bonusPlay');await page.waitForTimeout(60);await page.mouse.move(640,400);mouse={x:640,y:400};}
    else if(s.menu==='bonusResult')await click('bonusDock');
    else if(s.menu==='victory'){console.log('VICTORY',mode,deaths);break;}
    else throw new Error('unexpected menu '+s.menu);
    continue;
   }
   if(s.phase==='recovery'){
    await hold(false);await page.mouse.click(mouse.x,mouse.y,{delay:30});
   }else if(s.phase==='bonus'){
    await hold(true);
    await aim(Math.sin(bonusTicks*.12)*4,Math.cos(bonusTicks*.1)*2);
    if(bonusTicks++>55){
     await hold(false);await page.mouse.click(mouse.x,mouse.y,{button:'middle',delay:700});
     // A loan craft can finish or crash during the hold-to-pause gesture.
     const menu=(await state()).menu;
     if(menu==='pause')await page.locator('#screenContent [data-action="exitBonus"]').click();
     else assert.equal(menu,'bonusResult');
    }
   }else{
    const pos=new THREE.Vector3(...s.position),inverse=new THREE.Quaternion(...s.orientation).invert();
    let target;
    if(s.phase==='cleared'){
     target=s.actors.find(a=>a.kind==='gate'&&a.visible);
     await hold(false);
    }else{
     const candidates=s.actors.filter(a=>a.kind==='pirate'||a.kind==='part'||a.kind==='mine');
     const parts=candidates.filter(a=>a.kind==='part');
     const choices=parts.length?parts:candidates;
     choices.sort((a,b)=>pos.distanceToSquared(new THREE.Vector3(...a.position))-pos.distanceToSquared(new THREE.Vector3(...b.position)));
     target=choices[0];
     if(!target&&s.stageKind==='rescue')target=s.actors.find(a=>a.kind==='cargo'&&a.essential&&a.drop==='rescuePod')??s.actors.find(a=>a.kind==='base');
     await hold(!!target&&['pirate','part','mine'].includes(target.kind));
     if(s.charge>=100){await page.mouse.click(mouse.x,mouse.y,{button:'right'});}
    }
    if(target){
     const p=new THREE.Vector3(...target.position),distance=pos.distanceTo(p);
     const hostile=['pirate','part','mine'].includes(target.kind);
     if(hostile)p.addScaledVector(new THREE.Vector3(...target.velocity),Math.min(.8,distance/440));
     const local=p.sub(pos).applyQuaternion(inverse);
     if(s.stageKind==='armada'&&s.phase==='playing'){
      await aim(local.x/.22,0);
     }else{
      await aim(Math.atan2(local.x,-local.z)/.0022,-Math.atan2(local.y,Math.hypot(local.x,local.z))/.0022);
      const aligned=Math.abs(Math.atan2(local.x,-local.z))<.22;
      const speed=aligned?(hostile?(distance>300?65:distance<110?0:20):distance<25?20:95):0;
      await throttle(s.throttle,speed);
     }
    }else await throttle(s.throttle,0);
    previousStage={...previousStage,elapsed:s.elapsed,...s.stats,continued:s.continued,lives:s.lives,phase:s.phase};
   }
   await page.evaluate(()=>window.vectorShooterDebug.step(.14));
   if(iterations%200===0)console.log('PROGRESS',mode,s.stage,Math.round(s.elapsed),s.hostileCount,s.hull,s.shield,s.phase);
  }
  assert(iterations<10000,'playthrough timed out: '+mode);
  if(previousStage)reports.push(previousStage);
  await hold(false);
  if((await state()).menu!=='victory'){await page.mouse.click(mouse.x,mouse.y,{button:'middle',delay:700});}
  await click('title');
 }
 assert.deepEqual(errors,[]);
 await writeFile('output/playwright/mouse-journeys'+(process.env.PLAYTEST_MODE?'-'+process.env.PLAYTEST_MODE:'')+'.json',JSON.stringify({method:'Normal combat, movement, shots, pickups and damage. Mouse-only controls; fixed simulation clock accelerated between inputs. No forced kills, grants, teleportation or completion.',reports,errors},null,2));
 console.log('PASS MOUSE JOURNEYS',reports.length);
}finally{await browser.close();}
