// Isolated DOM + async folder API fixture; never change saved tasks or call a model.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Cdp} from '../outputs/taskboard/cdp.mjs';

const runtime=JSON.parse(fs.readFileSync(new URL('../outputs/taskboard/.data/app-integration.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const fixture=spawn('python',['-X','utf8',fileURLToPath(new URL('taskboard_details_fixture.py',import.meta.url))],{stdio:['ignore','pipe','pipe'],windowsHide:true});
let stderr='';fixture.stderr.on('data',d=>stderr+=d);
const lines=createInterface({input:fixture.stdout}),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let config,cdp,page,targetId;
async function until(fn){for(let i=0;i<80;i++){if(await fn())return;await pause(100);}throw Error('Project UI condition timed out');}
try{
 config=await Promise.race([once(lines,'line').then(([line])=>JSON.parse(line)),once(fixture,'exit').then(()=>{throw Error(stderr);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Fixture startup timed out')),10000).unref())]);
 const targets=await(await fetch(`http://127.0.0.1:${runtime.cdpPort}/json/list`)).json();
 const app=targets.find(t=>t.type==='page'&&t.url==='app://-/index.html');assert.ok(app,'dedicated renderer');
 cdp=new Cdp(app.webSocketDebuggerUrl);targetId=(await cdp.send('Target.createTarget',{url:config.url,background:true})).targetId;
 let target;await until(async()=>{target=(await(await fetch(`http://127.0.0.1:${runtime.cdpPort}/json/list`)).json()).find(t=>t.id===targetId);return !!target;});
 page=new Cdp(target.webSocketDebuggerUrl);await page.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await until(()=>page.evaluate('document.querySelectorAll(".card").length===5'));
 const api=async(path,method='GET',data)=>{const r=await fetch(config.url+path,{method,headers:{'X-Board-Token':config.token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const out=await r.json();assert.equal(r.ok,true,JSON.stringify(out));return out;};
 const setProject=name=>page.evaluate(`document.querySelector('#task-project').value=${JSON.stringify(name)};document.querySelector('#task-project').dispatchEvent(new Event('input',{bubbles:true}));`);
 assert.equal(await page.evaluate(`document.querySelector('.column[data-status="backlog"]').getAttribute('aria-label')`),'列管');
 await page.evaluate(`document.querySelector('#new-task').click()`);
 assert.equal(await page.evaluate(`document.querySelector('#task-project').list.id`),'task-project-options');
 assert.equal(await page.evaluate(`[...document.querySelector('#task-project-options').options].filter(o=>o.value==='測試專案').length`),1);
 await setProject('測試專案');assert.equal(await page.evaluate(`document.querySelector('#task-cwd').value`),config.cwd);
 const screenshot=await page.send('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync(new URL('../work/taskboard-projects.png',import.meta.url),Buffer.from(screenshot.data,'base64'));
 // Polling refreshes candidates without overwriting manual input.
 await page.evaluate(`document.querySelector('#task-cwd').value=${JSON.stringify(config.pickerPath)};refresh()`);
 assert.equal(await page.evaluate(`document.querySelector('#task-cwd').value`),config.pickerPath);
 await setProject('全新專案');
 await page.evaluate(`document.querySelector('#task-title').value='新專案列管任務';save()`);
 await until(()=>page.evaluate(`!document.querySelector('#task-dialog').open`));
 let state=await api('/api/state'),saved=state.tasks.find(t=>t.title==='新專案列管任務');
 assert.equal(saved.project,'全新專案');assert.equal(saved.cwd,config.pickerPath);assert.equal(saved.status,'backlog');
 assert.equal(state.fixtureCalls.filter(m=>m==='turn/start').length,0);
 await page.evaluate(`document.querySelector('#new-task').click()`);await setProject('全新專案');
 assert.equal(await page.evaluate(`document.querySelector('#task-cwd').value`),config.pickerPath);
 await setProject('未保存的新名稱');assert.equal(await page.evaluate(`document.querySelector('#task-cwd').value`),'');
 assert.equal(await page.evaluate(`[...document.querySelector('#task-project-options').options].some(o=>o.value==='未保存的新名稱')`),false);
 // Same project with two distinct paths must offer both, rather than silently pick a folder.
 await api('/api/tasks','POST',{title:'同名專案第二路徑',project:'測試專案',cwd:config.pickerPath});
 await page.evaluate(`refresh()`);await until(()=>page.evaluate(`state.tasks.some(t=>t.title==='同名專案第二路徑')`));
 await setProject('測試專案');
 assert.equal(await page.evaluate(`document.querySelector('#task-cwd').value`),'');
 assert.deepEqual((await page.evaluate(`[...document.querySelector('#task-cwd-options').options].map(o=>o.value)`)).sort(),[config.cwd,config.pickerPath].sort());
 console.log('PASS: 列管, project combobox, auto-loaded folder, new project saved without dispatch, ambiguous paths and poll preserve manual edits');
 // Async picker selection and cancellation preserve the form until Save.
 await page.evaluate(`document.querySelector('#pick-folder').click()`);
 await until(()=>page.evaluate(`document.querySelector('#task-cwd').value===${JSON.stringify(config.pickerPath)}&&!document.querySelector('#pick-folder').disabled`));
 const before=(await api('/api/state')).tasks.length;
 await page.evaluate(`document.querySelector('#pick-folder').click()`);
 await until(()=>page.evaluate(`document.querySelector('#pick-folder').textContent==='選擇中…'`));
 await until(()=>page.evaluate(`!document.querySelector('#pick-folder').disabled`));
 assert.equal(await page.evaluate(`document.querySelector('#task-cwd').value`),config.pickerPath);
 assert.equal((await api('/api/state')).tasks.length,before);
 await page.evaluate(`document.querySelector('#task-cwd').value='';document.querySelector('#pick-folder').click();document.querySelector('#close-dialog').click();`);
 await until(()=>page.evaluate(`!folderPicking`));
 await page.evaluate(`document.querySelector('#new-task').click()`);
 assert.equal(await page.evaluate(`document.querySelector('#task-cwd').value`),'');
 await page.evaluate(`document.querySelector('#close-dialog').click();openTask(state.tasks.find(t=>t.readOnly))`);
 assert.equal(await page.evaluate(`document.querySelector('#pick-folder').disabled`),true);
 console.log('PASS: async picker result, cancel preserves folder, close cancels job, readonly guard, no database writes before Save');
 // Reproduce the opaque iframe capability bridge used by the dedicated App.
 await page.evaluate(`(async()=>{
  const html=await(await fetch('/?embed=1')).text(),capability='isolated-project-test';
  window.addEventListener('message',async event=>{
   if(event.source!==document.querySelector('#project-frame')?.contentWindow||event.data?.capability!==capability||event.data?.type!=='caspar-board-api')return;
   const {id,path,method,data}=event.data.payload;
   const response=await fetch(path,{method,headers:{'X-Board-Token':${JSON.stringify(config.token)},'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),out=await response.json();
   event.source.postMessage({type:'caspar-board-response',capability,reply:response.ok?{id,data:out}:{id,error:out.error}},'*');
  });
  document.body.replaceChildren();const frame=document.createElement('iframe');frame.id='project-frame';frame.setAttribute('sandbox','allow-scripts allow-modals');frame.style='position:fixed;inset:0;width:100%;height:100%;border:0';
  refresh=async()=>{};window.projectFrameHtml=html.replace('<script>','<script>window.__CASPAR_EMBED_RPC__='+JSON.stringify(capability)+';');frame.src='about:blank';document.body.append(frame);
 })()`);
 let frameId;await until(async()=>{frameId=(await page.send('Page.getFrameTree')).frameTree.childFrames?.[0]?.frame.id;return !!frameId;});
 await page.send('Page.setDocumentContent',{frameId,html:await page.evaluate('window.projectFrameHtml')});
 let context;const inFrame=async expression=>{const out=await page.send('Runtime.evaluate',{contextId:context,expression,returnByValue:true,awaitPromise:true});assert.equal(out.exceptionDetails,undefined);return out.result.value;};
 await until(async()=>{context=(await page.send('Page.createIsolatedWorld',{frameId,worldName:'project-frame-qa'})).executionContextId;return inFrame(`document.querySelectorAll('.card').length>=7`);});
 await inFrame(`document.querySelector('#new-task').click();document.querySelector('#task-project').value='全新專案';document.querySelector('#task-project').dispatchEvent(new Event('input'));document.querySelector('#task-cwd').value='';document.querySelector('#pick-folder').click();`);
 await until(()=>inFrame(`document.querySelector('#task-cwd').value===${JSON.stringify(config.pickerPath)}&&!document.querySelector('#pick-folder').disabled`));
 await inFrame(`document.querySelector('#close-dialog').click()`);
 console.log('PASS: project auto-fill and async folder selection through opaque iframe capability RPC');
}finally{
 page?.close();if(cdp&&targetId)await cdp.send('Target.closeTarget',{targetId});cdp?.close();
 if(config)try{await fetch(config.url+'/api/shutdown',{method:'POST',headers:{'X-Board-Token':config.token,'Content-Type':'application/json'},body:'{}'});}catch{}
 lines.close();if(fixture.exitCode===null){await Promise.race([once(fixture,'exit'),pause(2000)]);if(fixture.exitCode===null)fixture.kill();}
}
