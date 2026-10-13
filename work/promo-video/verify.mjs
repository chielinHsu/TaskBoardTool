// 在 headless Chrome 內解碼 MP4：擷取指定時間影格、decodeAudioData 檢查音軌
import { launch } from './cdp-lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const file = resolve(process.argv[2]); const times = process.argv.slice(3).map(Number);
mkdirSync('verify', { recursive: true });
const html = `<!doctype html><body style="margin:0;background:#000"><video id=v src="${pathToFileURL(file).href}" muted style="width:1920px;height:1080px"></video><script>
window.__info=async()=>{const v=document.getElementById('v');await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=()=>j(new Error('video error '+(v.error&&v.error.message)));if(v.readyState>=1)r();});
const bytes=await (await fetch(v.src)).arrayBuffer();const ac=new AudioContext();let audio=null;try{const buf=await ac.decodeAudioData(bytes.slice(0));const d=buf.getChannelData(0);let rms=0,peak=0;const seg=[];const n=10;for(let s=0;s<n;s++){let r=0;const a=Math.floor(d.length*s/n),b=Math.floor(d.length*(s+1)/n);for(let i=a;i<b;i+=5)r+=d[i]*d[i];seg.push(Math.sqrt(r/((b-a)/5)).toFixed(3));}for(let i=0;i<d.length;i+=5){rms+=d[i]*d[i];peak=Math.max(peak,Math.abs(d[i]));}audio={duration:buf.duration,channels:buf.numberOfChannels,sampleRate:buf.sampleRate,rms:Math.sqrt(rms/(d.length/5)),peak,segRms:seg};}catch(e){audio={error:String(e)}}
return {duration:v.duration,w:v.videoWidth,h:v.videoHeight,audio};};
window.__seek=t=>new Promise((r,j)=>{const v=document.getElementById('v');v.onseeked=()=>r(true);v.onerror=()=>j(new Error('seek error'));v.currentTime=t;});
</script></body>`;
writeFileSync('verify/page.html', html);
const b = await launch(pathToFileURL(resolve('verify/page.html')).href);
try {
  await b.send('Runtime.enable'); await b.send('Page.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  console.log(JSON.stringify(await b.evaluate('window.__info()', { timeout: 60000 })));
  for (const t of times) { await b.evaluate(`window.__seek(${t})`); await new Promise(r => setTimeout(r, 200)); const { data } = await b.send('Page.captureScreenshot', { format: 'png' }); const f = `verify/v${t.toFixed(2).replace('.', '_')}.png`; writeFileSync(f, Buffer.from(data, 'base64')); console.log('wrote', f); }
} finally { await b.close(); }
