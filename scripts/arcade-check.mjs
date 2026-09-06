import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const output='output/playwright/arcade';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[],models=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const lit=buffer=>{
 const p=PNG.sync.read(buffer);let lit=0;
 for(let i=0;i<p.data.length;i+=4)if(Math.max(p.data[i],p.data[i+1],p.data[i+2])>50)lit++;
 return lit;
};
try{
 await page.addInitScript(()=>{
  window.audioAudit={sources:0,audible:0,contexts:[]};
  const original=AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource=function(){
   const node=original.call(this),start=node.start.bind(node);
   if(!window.audioAudit.contexts.includes(this))window.audioAudit.contexts.push(this);
   node.start=(...args)=>{
    window.audioAudit.sources++;
    if(node.buffer?.getChannelData(0).some(v=>Math.abs(v)>.02))window.audioAudit.audible++;
    return start(...args);
   };
   return node;
  };
 });
 await page.goto(process.env.SMOKE_URL??'http://127.0.0.1:5173/');
 await page.waitForFunction(()=>window.vectorShooterDebug);
 const count=Number((await page.locator('#modelCount').innerText()).split('/')[1]);
 for(let i=0;i<count;i++){
  const before=await page.locator('#modelPreview canvas').screenshot({path:output+'/model-'+i+'.png'});
  const n=lit(before);assert(n>50,'blank catalog model '+i);
  await page.waitForTimeout(140);
  const after=await page.locator('#modelPreview canvas').screenshot();
  assert(!before.equals(after),'static model '+i);
  models.push({name:await page.locator('#modelTitle').innerText(),lit:n});
  await page.locator('[data-action="scanNext"]').click();
 }
 for(const width of [1920,1280,800,390,320]){
  await page.setViewportSize({width,height:width<500?740:800});
  await page.waitForTimeout(80);
  assert(lit(await page.locator('#vectorTitle').screenshot())>100);
  assert(await page.evaluate(()=>document.querySelector('#launchOverlay').scrollWidth<=innerWidth));
  await page.screenshot({path:output+'/title-'+width+'.png'});
 }
 await page.setViewportSize({width:1280,height:800});
 await page.locator('[data-action="newRun"]').click();await page.locator('[data-action="launch"]').click();
 await page.waitForTimeout(150);await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();
 const audio=await page.evaluate(()=>({sources:window.audioAudit.sources,audible:window.audioAudit.audible,states:window.audioAudit.contexts.map(c=>c.state)}));
 assert(audio.audible>0);assert(audio.states.includes('running'));
 const projectiles=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {createBoltModel,disposeObject}=await import('/src/models.ts');
  const {weaponSpec}=await import('/src/weapons.ts');
  const {SOUND_EFFECT_NAMES,synthesizeEffect}=await import('/src/sound.ts');
  const result=[];
  for(const family of ['pulse','spread','lance']){
   const spec=weaponSpec(family,3),model=createBoltModel(spec.color,spec.radius,spec.length,'player',family);
   let lines=0,opaque=0;
   model.traverse(c=>{if(c.isLineSegments){lines++;if(!c.material.transparent||c.material.depthWrite)opaque++;}});
   result.push({family,lines,opaque,damage:spec.damage,count:spec.count,pierce:spec.pierce});disposeObject(model);
  }
  const audio=SOUND_EFFECT_NAMES.map(n=>({name:n,samples:synthesizeEffect(n).length}));
  return {models:result,sounds:audio};
 });
 for(const p of projectiles.models)assert.equal(p.opaque,0);
 const previews=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {createBoltModel,setProjectilePulseOpacity,disposeObject}=await import('/src/models.ts');
  const {weaponSpec}=await import('/src/weapons.ts');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(360,260);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,360/260,.1,200),results=[];
  for(const family of ['pulse','spread','lance']){
   const spec=weaponSpec(family,3),model=createBoltModel(spec.color,spec.radius,spec.length,'player',family);
   model.position.z=-45;scene.add(model);setProjectilePulseOpacity(model,1);renderer.render(scene,camera);
   const bright=renderer.domElement.toDataURL();setProjectilePulseOpacity(model,0);renderer.render(scene,camera);
   results.push({family,bright,dim:renderer.domElement.toDataURL()});scene.remove(model);disposeObject(model);
  }
  renderer.dispose();return results;
 });
 for(const preview of previews){
  const buffer=Buffer.from(preview.bright.split(',')[1],'base64'),dim=Buffer.from(preview.dim.split(',')[1],'base64');
  assert(lit(buffer)>70);assert(!buffer.equals(dim),'projectile pulse does not change');
  const png=PNG.sync.read(buffer),center=(130*360+180)*4;
  assert.equal(png.data[center]+png.data[center+1]+png.data[center+2],0,'projectile center is not see-through');
  await writeFile(output+'/weapon-'+preview.family+'.png',buffer);
 }
 await page.evaluate(()=>window.vectorShooterDebug.maximumLoad());
 const start=await page.evaluate(()=>window.vectorShooterDebug.getState());
 assert.equal(start.hostileCount,18);assert(start.shots.length>=220);
 const timing=await page.evaluate(()=>new Promise(resolve=>{
  const times=[];let previous=performance.now();const start=previous;
  function sample(now){times.push(now-previous);previous=now;if(now-start<2300)requestAnimationFrame(sample);else resolve(times);}
  requestAnimationFrame(sample);
 }));
 timing.sort((a,b)=>a-b);
 const performance={median:timing[Math.floor(timing.length*.5)],p95:timing[Math.floor(timing.length*.95)],frames:timing.length};
 assert(performance.median<50,'maximum load falls below 20 FPS');
 const end=await page.evaluate(()=>window.vectorShooterDebug.getState());
 assert(end.hostileCount<=18);assert(end.attackerCount<=6);assert(end.speedScale<=1.35);assert(end.shots.length<=240);
 await page.screenshot({path:output+'/maximum-load.png'});
 assert.deepEqual(errors,[]);
 await writeFile(output+'/audit.json',JSON.stringify({models,projectiles,audio,performance,errors},null,2));
 console.log('PASS ARCADE AUDIT',JSON.stringify({models:models.length,audio,performance,errors}));
}finally{await browser.close();}
