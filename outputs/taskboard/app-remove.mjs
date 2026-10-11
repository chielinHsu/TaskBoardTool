import fs from 'node:fs';
import {Cdp} from './cdp.mjs';
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
const targets=await(await fetch(`http://127.0.0.1:${config.cdpPort}/json/list`,{signal:AbortSignal.timeout(3000)})).json();
for(const target of targets.filter(t=>t.type==='page' && t.url==='app://-/index.html')){
 const cdp=new Cdp(target.webSocketDebuggerUrl);
 try{
  const id=await cdp.evaluate('window.__casparTaskboardScriptId || null');
  await cdp.evaluate('window.__casparTaskboard?.destroy();delete window.__casparTaskboardScriptId;delete window.__casparBoardRpc');
  if(id)try{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:id});}catch{}
  await cdp.send('Page.setBypassCSP',{enabled:false});
 }finally{cdp.close();}
}
