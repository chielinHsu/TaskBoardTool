import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Cdp} from './cdp.mjs';
import {randomUUID} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
const runtimePath=process.argv[2];
if(!runtimePath) throw Error('Integration runtime path required');
const config=JSON.parse(fs.readFileSync(runtimePath,'utf8').replace(/^\uFEFF/,''));
const controlPath=path.join(path.dirname(runtimePath),'app-stop');
const statusPath=path.join(path.dirname(runtimePath),'app-status.json');
const showPath=path.join(path.dirname(runtimePath),'app-show');
const base=`http://127.0.0.1:${config.cdpPort}`;
const source=`window.__CASPAR_TASKBOARD_URL__=${JSON.stringify(config.boardUrl+'/?embed=1')};window.__CASPAR_TASKBOARD_AUTOOPEN__=true;`+fs.readFileSync(path.join(root,'app-panel.js'),'utf8');
const connections=new Map();
function findFrame(tree,name){if(tree.frame?.name===name)return tree.frame;for(const child of tree.childFrames||[]){const found=findFrame(child,name);if(found)return found;}return null;}
async function loadFrame(connection,panel) {
  const {frameTree}=await connection.cdp.send('Page.getFrameTree');
  const frame=findFrame(frameTree,panel.frameName);
  if(!frame || connection.loadedFrame===frame.id) return;
  const response=await fetch(config.boardUrl+'/?embed=1',{signal:AbortSignal.timeout(5000)});
  const html=await response.text();
  const token=html.match(/const TOKEN='([^']+)'/)?.[1];
  if(!response.ok || !token || !html.includes('Caspar')) throw Error('Taskboard service identity mismatch');
  connection.token=token;connection.capability=randomUUID();
  await connection.cdp.evaluate(`window.__casparTaskboard.prepare(${JSON.stringify(connection.capability)})`);
  const initialTheme=JSON.stringify(panel.theme||null).replace(/</g,'\\u003c');
  const prefix=`<head><base href="${config.boardUrl}/"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri ${config.boardUrl}"><script>window.__CASPAR_EMBED_RPC__=${JSON.stringify(connection.capability)};window.__CASPAR_BOARD_THEME__=${initialTheme};</script>`;
  await connection.cdp.send('Page.setDocumentContent',{frameId:frame.id,html:html.replace('<head>',prefix)});
  connection.loadedFrame=frame.id;
}
let stopping=false, shownRequest='', serviceAvailable=false, lastHealthCheck=0;
function status(value){fs.writeFileSync(statusPath,JSON.stringify({updatedAt:new Date().toISOString(),helperPid:process.pid,...value},null,2));}
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
status({phase:'connecting'});
try {
  let misses=0;
  while(!stopping && !fs.existsSync(controlPath)) {
    try {
      if(Date.now()-lastHealthCheck>5000){
        lastHealthCheck=Date.now();
        try {const health=await fetch(config.boardUrl+'/health',{signal:AbortSignal.timeout(2000)});serviceAvailable=health.ok && (await health.json()).service==='caspar-taskboard';}catch{serviceAvailable=false;}
      }
      const response=await fetch(base+'/json/list',{signal:AbortSignal.timeout(3000)});
      if(!response.ok) throw Error('Dedicated renderer unavailable');
      const targets=(await response.json()).filter(t=>{
        if(t.type!=='page' || !t.webSocketDebuggerUrl) return false;
        const url=new URL(t.url);
        return ['app:','file:'].includes(url.protocol) && url.pathname.endsWith('/index.html') && !/avatar-overlay|detached-window/.test(url.searchParams.get('initialRoute') || '');
      });
      misses=0;
      for(const [id,connection] of connections) if(!targets.some(t=>t.id===id)){connection.cdp.close();connections.delete(id);}
      for(const target of targets) {
        let connection=connections.get(target.id);
        try {
          if(!connection) {
            const cdp=new Cdp(target.webSocketDebuggerUrl); await cdp.ready;
            await cdp.send('Page.enable');
            await cdp.send('Runtime.enable');
            await cdp.evaluate('window.__casparTaskboard?.destroy()');
            await cdp.send('Runtime.addBinding',{name:'__casparBoardRpc'});
            // Restricted to this launcher's independent profile; required by the host's frame CSP.
            await cdp.send('Page.setBypassCSP',{enabled:true});
            const script=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source});
            connection={cdp,scriptId:script.identifier}; connections.set(target.id,connection);
            await cdp.evaluate(`window.__casparTaskboardScriptId=${JSON.stringify(script.identifier)}`);
            const bound=connection;
            cdp.on('Runtime.bindingCalled',async event=>{
              if(event.name!=='__casparBoardRpc')return;
              let request;try {request=JSON.parse(event.payload);}catch{return;}
              if(!bound.capability || request.capability!==bound.capability)return;
              const reply={id:request.id};
              try {
                // Only the execution-tool selector is accepted as a query; everything else stays path-only.
                if(!/^\/api\/[a-zA-Z0-9/_-]+(\?tool=(codex|claude))?$/.test(request.path) || request.path==='/api/shutdown' || !['GET','POST','PATCH','DELETE'].includes(request.method))throw Error('Unsupported board request');
                const response=await fetch(config.boardUrl+request.path,{method:request.method,headers:{'X-Board-Token':bound.token,'Content-Type':'application/json'},body:request.data===undefined?undefined:JSON.stringify(request.data),signal:AbortSignal.timeout(18000)});
                const data=await response.json();if(!response.ok){if(response.status===403 && data.error==='請重新開啟看板。')bound.loadedFrame=null;throw Error(data.error||'看板操作失敗');}reply.data=data;
              }catch(error){reply.error=error.message;}
              if(request.capability!==bound.capability)return;
              try {await cdp.evaluate(`window.__casparTaskboard?.respond(${JSON.stringify(reply)})`);}catch{}
            });
            await cdp.evaluate(source);
          }
          let panel=await connection.cdp.evaluate('window.__casparTaskboard?.status() || null');
          if(!panel){await connection.cdp.evaluate(source);panel=await connection.cdp.evaluate('window.__casparTaskboard?.status() || null');}
          if(panel?.frameName) await loadFrame(connection,panel);
          const showRequest=fs.existsSync(showPath)?fs.readFileSync(showPath,'utf8').trim():'';
          if(showRequest && showRequest!==shownRequest && panel?.entryPresent){
            await connection.cdp.evaluate('window.__casparTaskboard.open()');
            try {await connection.cdp.send('Page.bringToFront');}catch{}
            shownRequest=showRequest;
          }
          if(panel?.entryPresent) status({phase:!serviceAvailable?'service-offline':panel.frameLoaded?'ready':'loading-board',serviceAvailable,panel});
          else status({phase:'waiting-for-app-navigation'});
        } catch(error) {connection?.cdp.close();connections.delete(target.id);status({phase:'reconnecting',message:error.message});}
      }
      if(!targets.length) status({phase:'waiting-for-renderer'});
    } catch(error) {
      misses++; status({phase:'waiting-for-app',message:error.message});
      if(misses>=12) break;
    }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
} finally {
  for(const connection of connections.values()) {
    try {
      await connection.cdp.evaluate('window.__casparTaskboard?.destroy()');
      await connection.cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:connection.scriptId});
      await connection.cdp.send('Page.setBypassCSP',{enabled:false});
      await connection.cdp.send('Runtime.removeBinding',{name:'__casparBoardRpc'});
    } catch { /* A closed renderer needs no cleanup. */ }
    connection.cdp.close();
  }
  status({phase:'stopped'});
}
