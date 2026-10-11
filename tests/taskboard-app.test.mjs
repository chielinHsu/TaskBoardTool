// Integration check against the launcher's dedicated profile; no card mutations.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Cdp} from '../outputs/taskboard/cdp.mjs';
const runtime=JSON.parse(fs.readFileSync(new URL('../outputs/taskboard/.data/app-integration.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const targets=await(await fetch(`http://127.0.0.1:${runtime.cdpPort}/json/list`)).json();
const target=targets.find(t=>t.type==='page'&&t.url==='app://-/index.html');
assert.ok(target,'dedicated renderer');
const cdp=new Cdp(target.webSocketDebuggerUrl);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitReady(previousName){
 for(let attempt=0;attempt<80;attempt++){
   const status=await cdp.evaluate('window.__casparTaskboard?.status() || null');
   if(status?.frameLoaded && (!previousName || status.frameName!==previousName))return status;
   await wait(500);
 }
 throw Error('Dedicated board did not become ready within 40 seconds');
}
let savedTheme;
async function inFrame(expression){
 const name=(await cdp.evaluate('window.__casparTaskboard.status()')).frameName;
 const {frameTree}=await cdp.send('Page.getFrameTree');
 const find=tree=>tree.frame.name===name?tree.frame:(tree.childFrames||[]).map(find).find(Boolean);
 const frame=find(frameTree);assert.ok(frame,'board frame');
 const {executionContextId}=await cdp.send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'taskboard-appearance-test'});
 const out=await cdp.send('Runtime.evaluate',{contextId:executionContextId,expression,returnByValue:true});
 assert.equal(out.exceptionDetails,undefined);return out.result.value;
}
const paletteExpression=`(()=>{const s=getComputedStyle(document.documentElement);return {mode:document.documentElement.dataset.hostTheme,bg:getComputedStyle(document.body).backgroundColor,ink:getComputedStyle(document.body).color,accent:s.getPropertyValue('--accent').trim(),font:s.fontFamily,paper:getComputedStyle(document.querySelector('.stat')).backgroundColor,column:getComputedStyle(document.querySelector('.column')).backgroundColor,dialog:getComputedStyle(document.querySelector('dialog')).backgroundColor,title:document.title,offline:!document.querySelector('#offline').classList.contains('hidden'),total:document.querySelector('#stat-total').textContent};})()`;
const overrides={'--color-surface':'#eff1f5','--color-surface-elevated-secondary':'#e6e9ef','--color-text-primary':'#4c4f69','--color-text-secondary':'#6c6f85','--codex-base-accent':'#8839ef','--color-surface-secondary':'#ccd0da','--font-sans':'Georgia, serif'};
try {
 await waitReady();
 await cdp.evaluate('window.__casparTaskboard.open()');await wait(1000);
 const initial=await cdp.evaluate('window.__casparTaskboard.status()');
 assert.equal(initial.frameLoaded,true);
 const dark=await inFrame(paletteExpression);
 assert.equal(dark.bg,initial.theme.colors.bg);assert.equal(dark.ink,initial.theme.colors.ink);assert.equal(dark.accent,initial.theme.colors.accent);assert.equal(dark.offline,false);
 console.log('PASS: real host theme matches board, cards and dialogs; API online');
 await cdp.evaluate('window.__casparTaskboard.close()');
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:900,y:500});await wait(300);
 const idle=await cdp.evaluate(`(()=>{const e=document.querySelector('#caspar-taskboard-entry'),native=document.querySelector('nav[data-app-navigation-rail] button[data-selected]');return {bg:getComputedStyle(e).backgroundColor,opacity:getComputedStyle(e,'::before').opacity,width:e.getBoundingClientRect().width,nativeBg:native?getComputedStyle(native,'::before').backgroundColor:null,variant:e.dataset.variant,size:e.dataset.size};})()`);
 assert.equal(idle.bg,'rgba(0, 0, 0, 0)');assert.ok(idle.width>=32);assert.equal(idle.variant,'ghost');assert.equal(idle.size,'xl');
 await cdp.evaluate('window.__casparTaskboard.open()');await wait(300);
 const selected=await cdp.evaluate(`(()=>{const e=document.querySelector('#caspar-taskboard-entry'),s=getComputedStyle(e,'::before');return {bg:s.backgroundColor,opacity:s.opacity};})()`);
 assert.equal(idle.opacity,'0');assert.equal(selected.opacity,'1');assert.notEqual(selected.bg,'rgba(0, 0, 0, 0)');if(idle.nativeBg)assert.equal(selected.bg,idle.nativeBg);
 console.log('PASS: icon transparent when idle, native size/background when selected');
 savedTheme=await cdp.evaluate(`(()=>{const root=document.documentElement,keys=${JSON.stringify(Object.keys(overrides))};return {mode:root.getAttribute('data-theme'),values:Object.fromEntries(keys.map(k=>[k,{value:root.style.getPropertyValue(k),priority:root.style.getPropertyPriority(k)}]))};})()`);
 await cdp.evaluate(`(()=>{const root=document.documentElement;root.setAttribute('data-theme','light');for(const [key,value] of Object.entries(${JSON.stringify(overrides)}))root.style.setProperty(key,value);})()`);
 let custom;
 for(let attempt=0;attempt<20;attempt++){
   await wait(250);custom=await inFrame(paletteExpression);
   if(custom.mode==='light' && custom.accent==='rgb(136, 57, 239)')break;
 }
 assert.equal(custom.mode,'light');assert.equal(custom.bg,'rgb(239, 241, 245)');assert.equal(custom.ink,'rgb(76, 79, 105)');assert.equal(custom.accent,'rgb(136, 57, 239)');assert.equal(custom.paper,'rgb(230, 233, 239)');assert.equal(custom.dialog,custom.paper);assert.equal(custom.column,'rgb(204, 208, 218)');assert.match(custom.font,/Georgia/);
 console.log('PASS: live light/custom palette and font reach iframe without reload');
 await cdp.evaluate(`(()=>{const root=document.documentElement,saved=${JSON.stringify(savedTheme)};if(saved.mode===null)root.removeAttribute('data-theme');else root.setAttribute('data-theme',saved.mode);for(const [key,item] of Object.entries(saved.values)){if(item.value)root.style.setProperty(key,item.value,item.priority);else root.style.removeProperty(key);}})()`);savedTheme=null;
 const previousName=(await cdp.evaluate('window.__casparTaskboard.status()')).frameName;
 await cdp.send('Page.reload');await waitReady(previousName);
 const reloaded=await cdp.evaluate(`({status:window.__casparTaskboard?.status(),counts:['caspar-taskboard-entry','caspar-taskboard-sidebar-entry','caspar-taskboard-panel'].map(id=>document.querySelectorAll('#'+id).length)})`);
 assert.deepEqual(reloaded.counts,[1,1,1]);assert.equal(reloaded.status.frameLoaded,true);assert.equal(reloaded.status.active,true);
 const after=await inFrame(paletteExpression);assert.equal(after.bg,reloaded.status.theme.colors.bg);assert.equal(after.total,dark.total);assert.equal(after.offline,false);
 console.log('PASS: reload restores one icon, one text entry, one working themed board');
 if(process.env.TASKBOARD_QA_SCREENSHOT){let shot;try{shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});}catch{shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false});}fs.writeFileSync(process.env.TASKBOARD_QA_SCREENSHOT,Buffer.from(shot.data,'base64'));}
}finally{
 if(savedTheme)await cdp.evaluate(`(()=>{const root=document.documentElement,saved=${JSON.stringify(savedTheme)};if(saved.mode===null)root.removeAttribute('data-theme');else root.setAttribute('data-theme',saved.mode);for(const [key,item] of Object.entries(saved.values)){if(item.value)root.style.setProperty(key,item.value,item.priority);else root.style.removeProperty(key);}})()`);
 cdp.close();
}
