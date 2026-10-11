// Real mouse input, disposable database and fake RPC; no saved tasks or model calls.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Cdp} from '../outputs/taskboard/cdp.mjs';

const runtime=JSON.parse(fs.readFileSync(new URL('../outputs/taskboard/.data/app-integration.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const fixture=spawn('python',['-X','utf8',fileURLToPath(new URL('taskboard_details_fixture.py',import.meta.url))],{stdio:['ignore','pipe','pipe'],windowsHide:true});
let stderr='';fixture.stderr.on('data',data=>stderr+=data);
const lines=createInterface({input:fixture.stdout});
let config,cdp,page,targetId;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<60;i++){const value=await fn();if(value)return value;await pause(100);}throw Error('Drag UI condition timed out');}
try{
 config=await Promise.race([once(lines,'line').then(([line])=>JSON.parse(line)),once(fixture,'exit').then(()=>{throw Error(stderr);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Fixture startup timed out')),10000).unref())]);
 const targets=await(await fetch(`http://127.0.0.1:${runtime.cdpPort}/json/list`)).json();
 const app=targets.find(t=>t.type==='page'&&t.url==='app://-/index.html');assert.ok(app,'dedicated renderer');
 cdp=new Cdp(app.webSocketDebuggerUrl);targetId=(await cdp.send('Target.createTarget',{url:config.url,background:true})).targetId;
 const target=await until(async()=> (await(await fetch(`http://127.0.0.1:${runtime.cdpPort}/json/list`)).json()).find(t=>t.id===targetId));
 page=new Cdp(target.webSocketDebuggerUrl);
 await page.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await until(()=>page.evaluate(`document.querySelectorAll('.card').length===5`));
 const api=async(path,method='GET',data)=>{const res=await fetch(config.url+path,{method,headers:{'X-Board-Token':config.token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const out=await res.json();assert.equal(res.ok,true,JSON.stringify(out));return out;};
 const task=async id=>(await api('/api/state')).tasks.find(t=>t.id===id);
 const selector=id=>`.card[data-task-id="${id}"] .card-title`;
 const point=async sel=>page.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
 const mouse=(type,p,buttons=0)=>page.send('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'?'none':'left',buttons,clickCount:type==='mouseMoved'?0:1});
 const release=async p=>{await mouse('mouseReleased',p);await pause(100);};
 async function begin(id,status){
  await page.evaluate('refresh()');
  const from=await point(selector(id)),to=await point(`.column[data-status="${status}"] .colhead`);
  await mouse('mouseMoved',from);await mouse('mousePressed',from,1);
  await mouse('mouseMoved',to,1);
  assert.equal(await page.evaluate(`document.querySelector('.drag-preview')!==null`),true,JSON.stringify({from,to}));return to;
 }
 async function drag(id,status){const to=await begin(id,status);await release(to);}
 async function setStatus(id,status){const t=await task(id);await api('/api/tasks/'+id,'PATCH',{version:t.version,status});await page.evaluate('refresh()');}

 // Moving from a title button must not open the detail dialog; polling must not detach it.
 const to=await begin(config.relatedId,'todo');
 assert.equal(await page.evaluate(`document.querySelector('.column.over').dataset.status`),'todo');
 await pause(3000);
 assert.equal(await page.evaluate(`document.querySelector('.drag-preview')!==null&&document.querySelector('.card.dragging').isConnected`),true);
 await release(to);await until(async()=> (await task(config.relatedId)).status==='todo');
 assert.equal(await page.evaluate(`document.querySelector('#task-dialog').open`),false);
 assert.equal((await api('/api/state')).fixtureCalls.filter(m=>m==='turn/start').length,0);
 await page.send('Page.reload');await until(()=>page.evaluate(`document.querySelector(${JSON.stringify(selector(config.relatedId))})?.closest('.column').dataset.status==='todo'`));
 console.log('PASS: mouse drag across polling, persisted status after reload, no accidental title click or dispatch');

 // Same column, outside the board, Escape and pointer cancellation leave the task unchanged.
 const version=(await task(config.relatedId)).version;
 await drag(config.relatedId,'todo');
 await begin(config.relatedId,'backlog');await release({x:30,y:30});
 const escaped=await begin(config.relatedId,'backlog');
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await release(escaped);
 const cancelled=await begin(config.relatedId,'backlog');
 await page.evaluate(`window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:boardDrag.pointerId}))`);await release(cancelled);
 assert.equal((await task(config.relatedId)).version,version);
 assert.equal(await page.evaluate(`document.querySelectorAll('.drag-preview,.card.dragging,.column.over').length`),0);
 const title=await point(selector(config.relatedId));await mouse('mousePressed',title,1);await release(title);
 assert.equal(await page.evaluate(`document.querySelector('#task-dialog').open`),true);
 await page.evaluate(`document.querySelector('#close-dialog').click()`);
 console.log('PASS: same-column/outside/Escape/cancel are no-ops; regular title click still opens details');

 // Readonly and active tasks cannot begin dragging.
 const readonly=(await api('/api/state')).tasks.find(t=>t.readOnly);
 const from=await point(selector(readonly.id));await mouse('mousePressed',from,1);await mouse('mouseMoved',{x:from.x+30,y:from.y},1);
 assert.equal(await page.evaluate(`document.querySelector('.drag-preview')!==null`),false);await release({x:from.x+30,y:from.y});
 await page.evaluate(`if(document.querySelector('#task-dialog').open)document.querySelector('#close-dialog').click()`);
 await page.evaluate(`state.activeId=${JSON.stringify(config.relatedId)};renderBoard()`);
 const active=await point(selector(config.relatedId));await mouse('mousePressed',active,1);await mouse('mouseMoved',{x:active.x+30,y:active.y},1);
 assert.equal(await page.evaluate(`document.querySelector('.drag-preview')!==null`),false);await release({x:active.x+30,y:active.y});await page.evaluate(`if(document.querySelector('#task-dialog').open)document.querySelector('#close-dialog').click();state.activeId=null;renderBoard()`);

 // A newer server snapshot must not be overwritten by the drag's old version.
 const stale=await begin(config.relatedId,'backlog');await setStatus(config.relatedId,'in_review');await release(stale);
 await until(()=>page.evaluate(`document.querySelector('#toast').textContent.includes('任務已更新')`));
 assert.equal((await task(config.relatedId)).status,'in_review');
 console.log('PASS: readonly/active guards and concurrent-update protection');

 // Review-to-done still requires explicit acceptance; rejection leaves it in review.
 let accept=false,dialogs=0;
 page.on('Page.javascriptDialogOpening',async()=>{dialogs++;await page.send('Page.handleJavaScriptDialog',{accept});});
 await page.send('Page.enable');await drag(config.relatedId,'done');await until(()=>dialogs===1);
 assert.equal((await task(config.relatedId)).status,'in_review');
 accept=true;await drag(config.relatedId,'done');await until(async()=> (await task(config.relatedId)).status==='done');
 assert.equal(dialogs,2);
 await setStatus(config.relatedId,'todo');await drag(config.relatedId,'in_progress');
 await until(async()=> (await api('/api/state')).fixtureCalls.filter(m=>m==='turn/start').length===1);
 await until(async()=> (await task(config.relatedId)).status==='in_review');
 const blocker=await task(config.relatedId),blocked=await api('/api/tasks','POST',{title:'拖曳阻擋測試',cwd:config.cwd,dependsOn:[blocker.id]});
 await page.evaluate('refresh()');await drag(blocked.id,'in_progress');
 await until(()=>page.evaluate(`document.querySelector('#toast').textContent.includes('前置卡片尚未完成')`));
 assert.equal((await api('/api/state')).fixtureCalls.filter(m=>m==='turn/start').length,1);
 console.log('PASS: done confirmation, in-progress starts fake execution, unfinished blockers are never overridden');

 // At narrow widths a held pointer near the edge reveals offscreen columns.
 await setStatus(config.relatedId,'backlog');
 await page.send('Emulation.setDeviceMetricsOverride',{width:850,height:1100,deviceScaleFactor:1,mobile:false});
 await page.evaluate(`document.querySelector('#board').scrollLeft=0`);
 const narrow=await point(selector(config.relatedId)),edge=await page.evaluate(`document.querySelector('#board').getBoundingClientRect().right-8`);await mouse('mousePressed',narrow,1);await mouse('mouseMoved',{x:edge,y:narrow.y},1);
 assert.equal(await page.evaluate(`!!boardDrag?.started`),true,JSON.stringify(await page.evaluate(`({bounds:document.querySelector('#board').getBoundingClientRect().toJSON(),scrollWidth:document.querySelector('#board').scrollWidth,clientWidth:document.querySelector('#board').clientWidth,drag:boardDrag&&{x:boardDrag.x,y:boardDrag.y}})`)));
 // Chromium suspends background-page animation frames; advance the same scroll tick explicitly.
 await page.evaluate(`for(let i=0;i<25;i++){cancelAnimationFrame(boardDragFrame);paintBoardDrag();}`);
 assert.ok(await page.evaluate(`document.querySelector('#board').scrollLeft>200`),JSON.stringify(await page.evaluate(`({bounds:document.querySelector('#board').getBoundingClientRect().toJSON(),scrollLeft:document.querySelector('#board').scrollLeft,scrollWidth:document.querySelector('#board').scrollWidth,clientWidth:document.querySelector('#board').clientWidth,innerWidth,innerHeight,drag:boardDrag&&{x:boardDrag.x,y:boardDrag.y}})`)));await release({x:30,y:30});
 assert.equal((await task(config.relatedId)).status,'backlog');
 console.log('PASS: horizontal edge scrolling reaches hidden status columns');

 // Opaque about:blank iframe and capability RPC reproduce the embedded board transport.
 await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await page.evaluate(`(async()=>{
  const html=await(await fetch('/?embed=1')).text(),capability='isolated-drag-test';
  window.addEventListener('message',async event=>{
   if(event.source!==document.querySelector('#drag-frame')?.contentWindow||event.data?.capability!==capability||event.data?.type!=='caspar-board-api')return;
   const {id,path,method,data}=event.data.payload;
   const response=await fetch(path,{method,headers:{'X-Board-Token':${JSON.stringify(config.token)},'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),out=await response.json();
   event.source.postMessage({type:'caspar-board-response',capability,reply:response.ok?{id,data:out}:{id,error:out.error}},'*');
  });
  document.body.replaceChildren();document.body.style.margin='0';
  const frame=document.createElement('iframe');frame.id='drag-frame';frame.setAttribute('sandbox','allow-scripts allow-modals');frame.style='position:fixed;inset:0;border:0;width:100%;height:100%';
  refresh=async()=>{};window.dragFrameHtml=html.replace('<script>', '<script>window.__CASPAR_EMBED_RPC__='+JSON.stringify(capability)+';');frame.src='about:blank';document.body.append(frame);
 })()`);
 const frameId=await until(async()=> (await page.send('Page.getFrameTree')).frameTree.childFrames?.[0]?.frame.id);
 await page.send('Page.setDocumentContent',{frameId,html:await page.evaluate('window.dragFrameHtml')});
 let context;
 await until(async()=>{const {frameTree}=await page.send('Page.getFrameTree');const frame=frameTree.childFrames?.[0];if(!frame)return false;context=(await page.send('Page.createIsolatedWorld',{frameId:frame.frame.id,worldName:'drag-frame-qa'})).executionContextId;const out=await page.send('Runtime.evaluate',{contextId:context,expression:'document.querySelectorAll(".card").length',returnByValue:true});return out.result.value>=5;});
 const framePoint=async sel=>{const out=await page.send('Runtime.evaluate',{contextId:context,expression:`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`,returnByValue:true});assert.equal(out.exceptionDetails,undefined);return out.result.value;};
 const embeddedFrom=await framePoint(selector(config.relatedId)),embeddedTo=await framePoint('.column[data-status="todo"] .colhead');
 await mouse('mousePressed',embeddedFrom,1);await mouse('mouseMoved',embeddedTo,1);await release(embeddedTo);
 await until(async()=> (await task(config.relatedId)).status==='todo');
 console.log('PASS: real mouse drag in opaque embedded iframe through capability RPC');
}finally{
 page?.close();if(cdp&&targetId)await cdp.send('Target.closeTarget',{targetId});cdp?.close();
 if(config)try{await fetch(config.url+'/api/shutdown',{method:'POST',headers:{'X-Board-Token':config.token,'Content-Type':'application/json'},body:'{}'});}catch{}
 lines.close();if(fixture.exitCode===null){await Promise.race([once(fixture,'exit'),pause(2000)]);if(fixture.exitCode===null)fixture.kill();}
}
