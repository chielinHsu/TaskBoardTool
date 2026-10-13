// Read-only integration check against the launcher's dedicated App profile.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Cdp} from '../outputs/taskboard/cdp.mjs';
const config=JSON.parse(fs.readFileSync(new URL('../outputs/taskboard/.data/app-integration.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const html=await(await fetch(config.boardUrl)).text();
const token=html.match(/const TOKEN='([^']+)'/)[1];
// Large state bodies occasionally arrive truncated from the live service (root cause still open); retry once.
const getState=async()=>{for(let attempt=0;;attempt++){try{return await(await fetch(config.boardUrl+'/api/state',{headers:{'X-Board-Token':token}})).json();}catch(error){if(attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,500));}}};
const targets=await(await fetch(`http://127.0.0.1:${config.cdpPort}/json/list`)).json();
const target=targets.find(t=>t.type==='page'&&t.url==='app://-/index.html');
assert.ok(target,'dedicated renderer');
const cdp=new Cdp(target.webSocketDebuggerUrl);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function inFrame(expression){
 const name=(await cdp.evaluate('window.__casparTaskboard.status()')).frameName;
 const {frameTree}=await cdp.send('Page.getFrameTree');
 const find=tree=>tree.frame.name===name?tree.frame:(tree.childFrames||[]).map(find).find(Boolean);
 const frame=find(frameTree);assert.ok(frame,'board iframe');
 const {executionContextId}=await cdp.send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'session-sync-qa'});
 const out=await cdp.send('Runtime.evaluate',{contextId:executionContextId,expression,returnByValue:true});
 assert.equal(out.exceptionDetails,undefined);return out.result.value;
}
try{
 const before=await getState();assert.equal(before.version,'1.9.0');assert.ok(before.chatSync.updatedAt);assert.equal(before.chatSync.error,'');
 const modelResponse=await fetch(config.boardUrl+'/api/models',{headers:{'X-Board-Token':token}});
 assert.equal(modelResponse.ok,true);const catalog=await modelResponse.json();assert.ok(catalog.models.length>0);
 assert.ok(catalog.models.every(model=>typeof model.model==='string'&&typeof model.displayName==='string'));
 console.log(`PASS: ${catalog.models.length} models read from installed Codex; no model turn started`);
 await cdp.send('Page.reload');
 let ready=false;
 for(let i=0;i<80;i++){
  const status=await cdp.evaluate('window.__casparTaskboard?.status() || null');
  if(status?.frameLoaded){ready=true;break;}await wait(500);
 }
 assert.ok(ready,'board reload ready');
 await cdp.evaluate('window.__casparTaskboard.open()');
 for(let i=0;i<40;i++){
  if((await inFrame(`document.querySelector('#session-sync').textContent`)).includes('已同步'))break;
  await wait(500);
 }
 const ui=await inFrame(`({sync:document.querySelector('#session-sync').textContent,total:Number(document.querySelector('#stat-total').textContent),cards:document.querySelectorAll('.card').length,readonly:[...document.querySelectorAll('.card')].filter(c=>/同步 (Codex|Claude Code) session/.test(c.textContent)).map(c=>c.draggable)})`);
 assert.match(ui.sync,/已同步/);assert.equal(ui.total,ui.cards);
 assert.ok(ui.readonly.length>0);assert.ok(ui.readonly.every(v=>v===false));
 console.log(`PASS: ${ui.readonly.length} local session cards automatically visible and cannot drag`);
 await inFrame(`document.querySelector('.card:not([draggable="true"]) .card-title').click()`);
 const overview=await inFrame(`({task:document.querySelector('#task-dialog').open,disabled:document.querySelector('#task-status').disabled,sessions:document.querySelectorAll('.session-entry').length})`);
 assert.deepEqual(overview,{task:true,disabled:true,sessions:1});
 assert.equal(await inFrame(`document.querySelector('.task-content').getBoundingClientRect().right<=document.querySelector('.task-properties').getBoundingClientRect().left`),true);
 await inFrame(`document.querySelector('.session-entry .link-row button').click()`);
 for(let i=0;i<40;i++){
  if(!(await inFrame(`document.querySelector('#chat-id').textContent`)).includes('讀取中'))break;
  await wait(500);
 }
 const dialog=await inFrame(`({chat:document.querySelector('#chat-dialog').open,task:document.querySelector('#task-dialog').open,text:document.querySelector('#chat-transcript').textContent})`);
 assert.equal(dialog.chat,true);assert.equal(dialog.task,true);assert.ok(dialog.text);assert.ok(!dialog.text.includes('目前無法載入聊天紀錄'));
 await inFrame(`document.querySelector('#close-chat').click();document.querySelector('#close-dialog').click();document.querySelector('[data-view="chats"]').click()`);
 const chats=await inFrame(`({rows:document.querySelectorAll('.chat-row').length,sync:document.querySelector('#session-sync').textContent,text:document.querySelector('#chats').textContent})`);
 assert.equal(chats.rows,Number(chats.sync.match(/已同步 (\d+) 個本機 Codex/)[1])+Number((chats.sync.match(/Claude Code (\d+) 個 App sessions/)||[0,0])[1]));assert.match(chats.text,/建立派工卡片/);
 await inFrame(`document.querySelector('[data-view="board"]').click()`);
 const after=await getState();
 assert.deepEqual(after.tasks.filter(t=>!t.readOnly),before.tasks.filter(t=>!t.readOnly));
 assert.deepEqual(after.events,before.events);assert.equal(after.automatic,before.automatic);
 console.log('PASS: session card opens existing transcript; chat list loads automatically; saved cards, events and settings unchanged');
}finally{cdp.close();}
