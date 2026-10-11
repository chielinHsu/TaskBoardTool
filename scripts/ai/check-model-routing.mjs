// 不呼叫模型：角色邊界、文件一致性、路由與 hook 端到端檢查。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const hook=path.join(root,'.claude/hooks/model_router.mjs');
const router=await import(pathToFileURL(hook));
const {TIERS,route,emptyState,ENV_PREFIX}=router;
const checks=[];
const check=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const readonly=new Set(['fast-worker','architect','architect-deep']);
const cases=[
 ['列出 outputs/taskboard/index.html 的表單欄位','fast-worker'],
 ['找出 server.py 的排程函式','fast-worker'],
 ['修正 README.md 的錯字','developer'],
 ['在 index.html 調整按鈕間距','developer'],
 ['修改 iframe 主題同步，驗證明暗與自訂色彩','developer-deep'],
 ['修改 CDP capability 權限檢查','architect'],
 ['新增 SQLite migration','architect'],
 ['分析 CDP 重開後偶發空白的根因','architect-deep']
];
const doc=read('MODEL_ROUTING.md');
for(const tier of TIERS){
 const text=read(`.claude/agents/${tier.agent}.md`),m=text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
 const fm=Object.fromEntries((m?.[1]||'').split(/\r?\n/).map(line=>line.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map(m=>[m[1],m[2]]));
 check(`${tier.agent} frontmatter／model／effort`,fm.name===tier.agent && fm.model===tier.model && fm.effort===tier.effort && !!fm.description);
 const tools=(fm.tools||'').split(',').map(x=>x.trim()),denied=(fm.disallowedTools||'').split(',').map(x=>x.trim());
 check(`${tier.agent} 不再委派`,!tools.includes('Agent')&&!tools.includes('Task')&&denied.includes('Agent')&&denied.includes('Task'));
 if(readonly.has(tier.agent))check(`${tier.agent} 唯讀不含 shell／寫入工具`,['Bash','PowerShell','Edit','Write','NotebookEdit'].every(t=>!tools.includes(t)&&denied.includes(t)));
 check(`${tier.agent} 共同規範`,['不 stage、commit、push','不再委派','不覆蓋來源不明的未提交修改','繁體中文'].every(x=>text.includes(x)));
 check(`${tier.agent} 段落完整`,['適用情境','必讀資料','工作方式','工具邊界','升級條件','回報格式'].every(x=>text.includes('## '+x)));
 check(`${tier.agent} 路由文件與 hook 一致`,new RegExp(`\\|\\s*${tier.agent}\\s*\\|\\s*${tier.model}\\s*\\|\\s*${tier.effort}\\s*\\|`).test(doc));
}
check('本專案環境變數與不切換說明',ENV_PREFIX==='TASKBOARD_ROUTER'&&doc.includes('TASKBOARD_ROUTER_DISABLED')&&doc.includes('TASKBOARD_ROUTER_STATE_DIR')&&doc.includes('不會切換主 session 的模型'));
const settings=JSON.parse(read('.claude/settings.json'));
const commands=(settings.hooks?.UserPromptSubmit||[]).flatMap(g=>(g.hooks||[]).map(h=>h.command));
check('UserPromptSubmit 引號與專案路径',commands.includes('node "$CLAUDE_PROJECT_DIR/.claude/hooks/model_router.mjs"'));
check('不繞過權限',settings.permissions?.defaultMode!=='bypassPermissions');
check('hook 無網路或子程序',!/\bfetch\s*\(|node:https?|node:net|child_process|WebSocket/.test(read('.claude/hooks/model_router.mjs')));
for(const [prompt,expected] of cases){const r=route(prompt);check(`路由 ${prompt}`,r.recommendation.agent===expected,JSON.stringify(r));check('四軸分數範圍',Object.values(r.scores).every(v=>v>=1&&v<=5));}
let state=route('修正 README.md 的錯字').state;
const failure=(id,change)=>`[router:fail] attempt=${id}; evidence=檢查仍失敗; change=${change}`;
const first=route(failure('one','調整 selector'),state);state=first.state;
const duplicate=route(failure('one','調整 selector'),state);
check('重複同一有效嘗試不計數',duplicate.state.failures===1);
check('不同 ID 的重複方法不計數',route(failure('other','調整 selector'),state).state.failures===1);
check('同一 ID 的不同方法不重複計數',route(failure('one','其他方法'),state).state.failures===1);
check('沒有證據／方法的失敗不計數',route('還是不行',state).state.failures===1);
const second=route(failure('two','改用可見工作區'),state);state=second.state;
check('兩次有證據不同方法升一級',second.escalation.floor==='developer-deep');
check('問題解決前保持下限',route('修正 README.md 錯字',state).recommendation.agent==='developer-deep');
const resolved=route('[router:resolved]',state);
check('解決後重置',resolved.escalation.floor===null&&resolved.state.failures===0);
check('重置後重新分級',route('修正 README.md 的錯字',resolved.state).recommendation.agent==='developer');
state=route('分析 CDP 偶發空白的根因').state;
state=route(failure('top1','替換連線'),state).state;
const top=route(failure('top2','隔離 profile'),state);
check('最高級仍失敗交給使用者',top.escalation.maxed&&top.recommendation.agent==='architect-deep');
check('損壞語意狀態不崩潰',!!route('修正 README.md 的錯字',{version:1,floor:999,lastTier:-5,failures:100}).recommendation);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'taskboard-router-check-'));
const environment={...process.env,[`${ENV_PREFIX}_STATE_DIR`]:path.join(tmp,'state dir'),CLAUDE_PROJECT_DIR:path.join(tmp,'project with spaces')};
const run=(input,env={})=>spawnSync(process.execPath,[hook],{input,encoding:'utf8',env:{...environment,...env},timeout:10000});
const event=(prompt,session='one')=>JSON.stringify({hook_event_name:'UserPromptSubmit',prompt,session_id:session,cwd:root});
try{
 const normal=run(event('修改 index.html 按鈕間距'));
 check('hook CLI 結構化建議',normal.status===0&&JSON.parse(normal.stdout).hookSpecificOutput.additionalContext.includes('"agent":"developer"'));
 for(const prompt of ['/compact','!git status','<task-notification>背景</task-notification>','<system-reminder>背景</system-reminder>','<ci-monitor-event>通知</ci-monitor-event>','   ',42]){const r=run(event(prompt));check(`忽略 ${String(prompt).slice(0,35)}`,r.status===0&&r.stdout==='');}
 for(const input of ['{bad','','null',JSON.stringify({hook_event_name:'Stop',prompt:'修改'})]){const r=run(input);check('壞輸入／其他事件不阻斷',r.status===0&&r.stdout==='');}
 check('停用環境變數',run(event('修改 README.md'),{[`${ENV_PREFIX}_DISABLED`]:'1'}).stdout==='');
 process.env[`${ENV_PREFIX}_STATE_DIR`]=environment[`${ENV_PREFIX}_STATE_DIR`];
 const stateFile=router.statePath(environment.CLAUDE_PROJECT_DIR,'one');fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile,'{bad');
 check('損壞狀態檔正常輸出',run(event('修改 README.md')).stdout.includes('additionalContext'));
 const blocker=path.join(tmp,'file');fs.writeFileSync(blocker,'x');
 check('寫入失敗不阻斷',run(event('修改 README.md'),{[`${ENV_PREFIX}_STATE_DIR`]:blocker}).stdout.includes('stateSaved\\":false'));
 check('專案／session 隔離',router.statePath('C:/a','one')!==router.statePath('C:/b','one')&&router.statePath('C:/a','one')!==router.statePath('C:/a','two'));
}finally{fs.rmSync(tmp,{recursive:true,force:true});delete process.env[`${ENV_PREFIX}_STATE_DIR`];}
const failed=checks.filter(x=>!x.ok);
for(const c of failed)console.error('失敗：'+c.name+' '+c.detail);
console.log(`${checks.length-failed.length}/${checks.length} 通過（靜態設定與本機 hook；未驗證 Claude 平台載入）`);
process.exitCode=failed.length?1:0;
