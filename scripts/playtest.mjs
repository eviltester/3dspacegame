import { chromium } from 'playwright';
import * as THREE from 'three';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('ERROR', e.message));
try {
 await page.goto('http://127.0.0.1:5173/');
 await page.locator('[data-action="newRun"]').click();
 await page.locator('[data-action="launch"]').click();
 await page.mouse.move(640,400);
 await page.mouse.down();
 for(let i=0;i<5;i++) await page.mouse.wheel(0,100);
 let mouse={x:640,y:400};
 for(let i=0;i<250;i++) {
  const s=await page.evaluate(()=>window.vectorShooterDebug.getState());
  if(s.menu || s.phase!=='playing') { console.log('STOP', JSON.stringify(s)); break; }
  const pos=new THREE.Vector3(...s.position);
  const q=new THREE.Quaternion(...s.orientation).invert();
  const targets=s.actors.filter(a=>a.kind==='pirate').sort((a,b)=>pos.distanceTo(new THREE.Vector3(...a.position))-pos.distanceTo(new THREE.Vector3(...b.position)));
  if(targets[0]){
   const a=targets[0], p=new THREE.Vector3(...a.position), v=new THREE.Vector3(...a.velocity);
   const local=p.addScaledVector(v,pos.distanceTo(p)/440).sub(pos).applyQuaternion(q);
   const dx=Math.atan2(local.x,-local.z)/.0022,dy=-Math.atan2(local.y,Math.hypot(local.x,local.z))/.0022;
   mouse.x+=Math.max(-180,Math.min(180,dx));mouse.y+=Math.max(-180,Math.min(180,dy));
   await page.mouse.move(mouse.x,mouse.y);
  }
  await page.waitForTimeout(80);
  if(i%50===0)console.log('PLAY',JSON.stringify({time:s.elapsed,firstCombat:s.stats.firstCombat,firstUpgrade:s.stats.firstUpgrade,kills:s.stats.kills,shots:s.stats.shots,hp:s.hull,shield:s.shield,orientation:s.orientation}));
 }
 await page.mouse.up();
 await page.screenshot({path:'output/playtest-combat.png'});
 console.log('RESULT',JSON.stringify(await page.evaluate(()=>window.vectorShooterDebug.getState())));
} finally { await browser.close(); }
