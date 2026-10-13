// Real DOM + isolated HTTP data and fake RPC; never change saved tasks or call a model.
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
async function until(fn){for(let i=0;i<60;i++){const value=await fn();if(value)return value;await pause(100);}throw Error('UI condition timed out');}
try{
 config=await Promise.race([once(lines,'line').then(([line])=>JSON.parse(line)),once(fixture,'exit').then(()=>{throw Error('Fixture failed: '+stderr);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Fixture startup timed out')),10000).unref())]);
 const targets=await(await fetch(`http://127.0.0.1:${runtime.cdpPort}/json/list`)).json();
 const app=targets.find(t=>t.type==='page'&&t.url==='app://-/index.html');assert.ok(app,'dedicated renderer');
 cdp=new Cdp(app.webSocketDebuggerUrl);
 targetId=(await cdp.send('Target.createTarget',{url:config.url})).targetId;
 const browserTarget=await until(async()=> (await(await fetch(`http://127.0.0.1:${runtime.cdpPort}/json/list`)).json()).find(t=>t.id===targetId));
 page=new Cdp(browserTarget.webSocketDebuggerUrl);
 await until(()=>page.evaluate(`[...document.querySelectorAll('.card-title')].some(e=>e.textContent.includes('完整任務'))`));
 const api=async(path,method='GET',data)=>{const res=await fetch(config.url+path,{method,headers:{'X-Board-Token':config.token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const out=await res.json();assert.equal(res.ok,true,JSON.stringify(out));return out;};
 await page.evaluate(`document.querySelector('#project-filter').value='測試專案';document.querySelector('#new-task').click()`);
 const defaults=await page.evaluate(`({project:document.querySelector('#task-project').value,cwd:document.querySelector('#task-cwd').value})`);
 assert.equal(defaults.project,'測試專案');assert.equal(defaults.cwd,config.cwd);
 assert.equal((await api('/api/state')).fixtureCalls.filter(m=>m!=='model/list').length,0);
 await page.evaluate(`document.querySelector('#close-dialog').click();document.querySelector('#project-filter').value='';document.querySelector('#project-filter').dispatchEvent(new Event('input'));[...document.querySelectorAll('.card-title')].find(e=>e.textContent.includes('完整任務')).click()`);
 const detail=await page.evaluate(`(()=>{const aside=document.querySelector('.task-properties').getBoundingClientRect(),main=document.querySelector('.task-content').getBoundingClientRect();return {open:document.querySelector('#task-dialog').open,description:document.querySelector('#task-description-read').textContent,editor:document.querySelector('#description-editor').hidden,right:main.right<=aside.left,status:document.querySelector('#task-status').value,sessions:document.querySelectorAll('.session-entry').length,runs:document.querySelectorAll('.run-record').length,hidden:[...document.querySelectorAll('.run-more')].reduce((n,b)=>n+Number(b.dataset.hidden),0),text:document.querySelector('#task-sessions').textContent,created:document.querySelector('#task-created').dateTime,overflow:document.querySelector('#task-dialog').scrollWidth>document.querySelector('#task-dialog').clientWidth};})()`);
 assert.equal(detail.open,true);assert.match(detail.description,/驗收條件/);assert.equal(detail.editor,true);assert.equal(detail.right,true);assert.equal(detail.created,new Date((await api('/api/state')).tasks.find(t=>t.id===config.taskId).createdAt*1000).toISOString());assert.equal(detail.status,'in_review');assert.equal(detail.sessions,2);assert.equal(detail.runs,2);assert.equal(detail.hidden,1);assert.match(detail.text,/第一次提問 · 首次執行 · 已回報 · 待驗收/);assert.match(detail.text,/第 1 次需求/);assert.doesNotMatch(detail.text,/首次回報，必須保留/);assert.equal(detail.overflow,false);
 await until(()=>page.evaluate(`document.querySelector('#task-model').options.length>1`));
 await page.evaluate(`document.querySelector('#task-model').value='fixture-model';document.querySelector('#task-labels').value='介面、修復、介面';document.querySelector('#related-picker').value=${JSON.stringify(config.relatedId)};document.querySelector('#add-related').click();save(false)`);
 let savedProperties=await api('/api/state');
 assert.equal(savedProperties.tasks.find(t=>t.id===config.taskId).model,'fixture-model');
 assert.deepEqual(savedProperties.tasks.find(t=>t.id===config.taskId).labels,['介面','修復']);
 assert.deepEqual(savedProperties.tasks.find(t=>t.id===config.relatedId).relatedIds,[config.taskId]);
 assert.equal(savedProperties.fixtureCalls.filter(m=>m==='turn/start').length,0);
 await page.evaluate(`document.querySelector('.session-entry .link-row button').click()`);
 await until(()=>page.evaluate(`document.querySelector('#chat-transcript').textContent.includes('隔離對話內容')`));
 assert.equal(await page.evaluate(`document.querySelector('#chat-followup-section').hidden`),false);
 await page.evaluate(`document.querySelector('#task-project').value='未儲存';document.querySelector('#chat-followup-text').value='先測試未儲存保護';document.querySelector('#chat-queue-followup').click()`);
 await until(()=>page.evaluate(`document.querySelector('#toast').textContent.includes('請先儲存')`));
 assert.equal((await api('/api/state')).tasks.find(t=>t.id===config.taskId).nextRun,null);
 await page.evaluate(`document.querySelector('#task-project').value='測試專案'`);
 await page.evaluate(`document.querySelector('#chat-followup-text').value='修正第一次成果';document.querySelector('#chat-queue-followup').click()`);
 await until(async()=> (await api('/api/state')).tasks.find(t=>t.id===config.taskId)?.nextRun);
 let state=await api('/api/state'),task=state.tasks.find(t=>t.id===config.taskId);
 assert.equal(task.nextRun.threadId,'fixture-chat-a');assert.equal(state.fixtureCalls.filter(m=>m==='turn/start').length,0);assert.equal(task.runs.length,3);
 await page.evaluate(`document.querySelector('#close-chat').click();document.querySelector('#close-dialog').click()`);
 await api(`/api/tasks/${config.taskId}/start`,'POST',{});
 await until(async()=> (await api('/api/state')).tasks.find(t=>t.id===config.taskId)?.runs.length===4 && (await api('/api/state')).activeId===null);
 task=(await api('/api/state')).tasks.find(t=>t.id===config.taskId);assert.equal(task.runs[3].threadId,'fixture-chat-a');assert.equal(task.runs[0].result,'首次回報，必須保留');assert.equal(task.runs[3].result,'隔離測試：後續修正回報');
 await api(`/api/tasks/${config.taskId}/followup`,'POST',{version:task.version,text:'改用新對話',threadId:''});
 await api(`/api/tasks/${config.taskId}/start`,'POST',{});
 await until(async()=> (await api('/api/state')).activeId===null);
 await until(()=>page.evaluate(`document.querySelectorAll('.card-title').length===5`));
 await page.evaluate(`[...document.querySelectorAll('.card-title')].find(e=>e.textContent.includes('完整任務')).click()`);
 await until(()=>page.evaluate(`document.querySelectorAll('.session-entry').length===3`));
 const multiple=await page.evaluate(`({sessions:document.querySelectorAll('.session-entry').length,runs:document.querySelectorAll('.run-record').length,hidden:[...document.querySelectorAll('.run-more')].reduce((n,b)=>n+Number(b.dataset.hidden),0),status:document.querySelector('#task-status').value})`);
 // Each session lists only the run that opened it; the other two of the five runs fold into "另有 N 次延續對話".
 assert.equal(multiple.sessions,3);assert.equal(multiple.runs,3);assert.equal(multiple.hidden,2);
 assert.equal(multiple.status,'in_review');
 await page.send('Emulation.setDeviceMetricsOverride',{width:600,height:900,deviceScaleFactor:1,mobile:false});
 assert.equal(await page.evaluate(`document.querySelector('#task-dialog').scrollWidth>document.querySelector('#task-dialog').clientWidth`),false);
 await page.send('Emulation.clearDeviceMetricsOverride');
 if(process.env.TASKBOARD_DETAILS_SCREENSHOT){const shot=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(process.env.TASKBOARD_DETAILS_SCREENSHOT,Buffer.from(shot.data,'base64'));}
 await page.evaluate(`document.querySelector('#close-dialog').click();[...document.querySelectorAll('.card-title')].find(e=>e.textContent.includes('唯讀')).click()`);
 await until(()=>page.evaluate(`document.querySelector('#task-description-read').textContent.includes('原始需求')&&document.querySelector('#task-sessions').textContent.includes('隔離對話內容')`));
 const readonly=await page.evaluate(`({open:document.querySelector('#task-dialog').open,status:document.querySelector('#task-status').disabled,save:document.querySelector('#save-task').hidden,followup:document.querySelector('#task-followup-section').hidden,sessions:document.querySelectorAll('.session-entry').length})`);
 assert.deepEqual(readonly,{open:true,status:true,save:true,followup:true,sessions:1});
 assert.equal((await api('/api/state')).tasks.find(t=>t.id===config.taskId).runs[4].model,'fixture-model');
 assert.deepEqual((await api('/api/state')).tasks.find(t=>t.id===config.taskId).runs.map(r=>r.tool||'codex'),['codex','codex','codex','codex','codex']);
 // Claude Code: tool/model selection, per-tool badges, handoff history, cross-tool followup controls, transcript reading.
 await page.evaluate(`document.querySelector('#close-dialog').click();[...document.querySelectorAll('.card-title')].find(e=>e.textContent.includes('Claude 接手')).click()`);
 await until(()=>page.evaluate(`document.querySelector('#task-tool').value==='claude'&&[...document.querySelector('#task-model').options].some(o=>o.value==='fake-opus')`));
 const claude=await page.evaluate(`({tool:document.querySelector('#task-tool').value,model:document.querySelector('#task-model').value,tools:[...document.querySelectorAll('.session-entry')].map(e=>e.dataset.tool).sort(),text:document.querySelector('#task-sessions').textContent,options:[...document.querySelector('#followup-thread').options].map(o=>o.textContent),hint:document.querySelector('#tool-hint').textContent,start:document.querySelector('#start-task').disabled})`);
 assert.equal(claude.tool,'claude');assert.equal(claude.model,'fake-opus');assert.deepEqual(claude.tools,['claude','codex']);assert.match(claude.text,/跨工具接手（來自 Codex）/);assert.ok(claude.options.some(o=>o.includes('Claude Code'))&&claude.options.some(o=>o.includes('Codex')));assert.ok(claude.hint&&!claude.hint.includes('無法使用'));assert.equal(claude.start,false);
 await page.evaluate(`document.querySelector('#followup-thread').value='';document.querySelector('#followup-thread').dispatchEvent(new Event('change'))`);
 await until(()=>page.evaluate(`!document.querySelector('#followup-new').hidden&&[...document.querySelector('#followup-model').options].some(o=>o.value==='fake-opus')`));
 await page.evaluate(`document.querySelector('#followup-tool').value='codex';document.querySelector('#followup-tool').dispatchEvent(new Event('change'))`);
 await until(()=>page.evaluate(`document.querySelector('#followup-tool-hint').textContent.includes('跨工具接手')&&[...document.querySelector('#followup-model').options].some(o=>o.value==='fixture-model')`));
 await page.evaluate(`[...document.querySelectorAll('.session-entry')].find(e=>e.dataset.tool==='claude').querySelector('.link-row button').click()`);
 await until(()=>page.evaluate(`document.querySelector('#chat-transcript').textContent.includes('Claude 的回報內容')&&!document.querySelector('#chat-resume').hidden&&document.querySelector('#chat-id').textContent.includes('Claude Code')`));
 await page.evaluate(`document.querySelector('#chat-followup-text').value='用同一個 Claude session 修正';document.querySelector('#chat-queue-followup').click()`);
 await until(async()=> (await api('/api/state')).tasks.find(t=>t.id===config.claudeTaskId)?.nextRun);
 const queued=(await api('/api/state')).tasks.find(t=>t.id===config.claudeTaskId);assert.equal(queued.nextRun.tool,'claude');assert.equal(queued.nextRun.threadId,'11111111-2222-3333-4444-555555555555');assert.equal(queued.nextRun.kind,'followup');
 await page.evaluate(`document.querySelector('#close-chat').click()`);
 await until(()=>page.evaluate(`!document.querySelector('#task-pending').hidden&&document.querySelector('#task-pending-text').textContent.includes('Claude Code')`));
 await page.evaluate(`document.querySelector('#cancel-followup').click()`);
 await until(async()=> !(await api('/api/state')).tasks.find(t=>t.id===config.claudeTaskId)?.nextRun);
 await page.evaluate(`document.querySelector('#close-dialog').click()`);
 const badges=await page.evaluate(`({claudeCards:[...document.querySelectorAll('.card')].filter(c=>c.querySelector('.tag.tool-claude')).length,codexCards:[...document.querySelectorAll('.card')].filter(c=>c.querySelector('.tag.tool-codex')).length,readonlyClaude:[...document.querySelectorAll('.card')].filter(c=>c.textContent.includes('同步 Claude Code session')).length,connection:document.querySelector('#connection').textContent})`);
 assert.equal(badges.claudeCards,2);assert.equal(badges.codexCards,3);assert.equal(badges.readonlyClaude,1);assert.match(badges.connection,/Claude Code 可用/);
 // Plan import: dependency-ordered backlog cards, blocked badges, release on done, effort field per tool.
 const plan=await api('/api/plans','POST',{name:'測試計畫',project:'測試專案',cwd:config.cwd,tool:'claude',items:[{key:'a',title:'計畫 A 前置',role:'developer'},{key:'b',title:'計畫 B 後續',role:'architect',dependsOn:['a']},{key:'c',title:'計畫 C 文件',tool:'codex',dependsOn:['a']}]});
 assert.deepEqual(plan.order,['a','b','c']);
 await until(()=>page.evaluate(`[...document.querySelectorAll('.card-badge.blocked')].length===2`));
 const planCards=await page.evaluate(`({blocked:[...document.querySelectorAll('.card-badge.blocked')].map(b=>b.textContent),plan:[...document.querySelectorAll('.tag.plan')].length})`);
 assert.ok(planCards.blocked.every(t=>t.includes('計畫 A 前置')));assert.equal(planCards.plan,3);
 await page.evaluate(`[...document.querySelectorAll('.card-title')].find(e=>e.textContent.includes('計畫 B 後續')).click()`);
 await until(()=>page.evaluate(`document.querySelector('#task-tool').value==='claude'&&document.querySelector('#task-effort').value==='high'`));
 const blockedDetail=await page.evaluate(`({start:document.querySelector('#start-task').disabled,label:document.querySelector('#start-task').textContent,title:document.querySelector('#start-task').title,depends:document.querySelector('#depends-list').textContent,effortHidden:document.querySelector('#effort-field').hidden,model:document.querySelector('#task-model').value})`);
 assert.equal(blockedDetail.start,false);assert.equal(blockedDetail.label,'略過前置，開始執行');assert.match(blockedDetail.title,/前置卡片尚未完成/);assert.match(blockedDetail.depends,/計畫 A 前置/);assert.equal(blockedDetail.effortHidden,false);assert.equal(blockedDetail.model,'opus');
 await page.evaluate(`document.querySelector('#close-dialog').click();[...document.querySelectorAll('.card-title')].find(e=>e.textContent.includes('計畫 C 文件')).click()`);
 await until(()=>page.evaluate(`document.querySelector('#task-tool').value==='codex'`));
 assert.equal(await page.evaluate(`document.querySelector('#effort-field').hidden`),true);
 await page.evaluate(`document.querySelector('#close-dialog').click()`);
 const blocker=plan.tasks.find(t=>t.plan.key==='a');
 await api('/api/tasks/'+blocker.id,'PATCH',{version:blocker.version,status:'in_review'});
 const reviewed=(await api('/api/state')).tasks.find(t=>t.id===blocker.id);
 const done=await api('/api/tasks/'+blocker.id,'PATCH',{version:reviewed.version,status:'done'});
 assert.equal(done.released.length,2);
 await until(()=>page.evaluate(`[...document.querySelectorAll('.card-badge.blocked')].length===0`));
 const after=(await api('/api/state')).tasks.filter(t=>t.plan?.name==='測試計畫');
 assert.deepEqual(after.filter(t=>t.plan.key!=='a').map(t=>t.status),['todo','todo']);
 assert.equal((await api('/api/state')).fixtureCalls.filter(m=>m==='turn/start').length,2); // automatic is off in the fixture: nothing dispatched
 assert.equal(await page.evaluate(`document.querySelector('#import-plan')!==null&&document.querySelector('#plan-dialog')!==null`),true);
 console.log('PASS: right properties, creation date, models, labels, symmetric relations, grouped sessions, followup queue, retained reports, readonly details, mobile layout, Claude tool/model selection, cross-tool followup controls, Claude transcript and badges, plan import with blocked badges, release on done, per-tool effort field');
}finally{
 page?.close();if(cdp&&targetId)await cdp.send('Target.closeTarget',{targetId});cdp?.close();
 if(config)try{await fetch(config.url+'/api/shutdown',{method:'POST',headers:{'X-Board-Token':config.token,'Content-Type':'application/json'},body:'{}'});}catch{}
 lines.close();if(fixture.exitCode===null){await Promise.race([once(fixture,'exit'),pause(2000)]);if(fixture.exitCode===null)fixture.kill();}
}
