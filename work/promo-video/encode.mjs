// 以 WebCodecs 逐格編碼 H.264 與 AAC（確定性，不依賴即時效能），輸出 enc/{video.bin,audio.bin,index.json}
import { launch } from './cdp-lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const FPS = +(process.env.FPS || 30), BITRATE = +(process.env.BITRATE || 10e6);
const OUT = process.env.OUT || 'enc'; mkdirSync(OUT, { recursive: true });
const b = await launch(pathToFileURL(resolve(process.env.PAGE || 'promo.html')).href);
try {
  await b.send('Runtime.enable'); await b.send('Page.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await b.evaluate('window.__ready'); await b.evaluate("document.body.classList.add('record')");
  const info = await b.evaluate(`(async()=>{
    const fps=${FPS}, total=Math.round(DUR*fps), b64=a=>{let s='';const u=new Uint8Array(a);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
    // 影片
    const vchunks=[]; let vdesc=null, verr=null;
    const venc=new VideoEncoder({output:(c,m)=>{if(m&&m.decoderConfig&&m.decoderConfig.description)vdesc=b64(m.decoderConfig.description);const d=new Uint8Array(c.byteLength);c.copyTo(d);vchunks.push({ts:c.timestamp,dur:c.duration,key:c.type==='key',data:d});},error:e=>{verr=String(e);}});
    venc.configure({codec:'avc1.640028',width:W,height:H,bitrate:${BITRATE},framerate:fps,latencyMode:'quality',avc:{format:'avc'}});
    for(let i=0;i<total;i++){render(i/fps);const f=new VideoFrame(canvas,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});venc.encode(f,{keyFrame:i%(fps*2)===0});f.close();while(venc.encodeQueueSize>6)await new Promise(r=>setTimeout(r,5));if(verr)throw new Error(verr);}
    await venc.flush(); venc.close();
    // 音訊
    const buf=await buildMusic(); const achunks=[]; let adesc=null, aerr=null;
    const aenc=new AudioEncoder({output:(c,m)=>{if(m&&m.decoderConfig&&m.decoderConfig.description)adesc=b64(m.decoderConfig.description);const d=new Uint8Array(c.byteLength);c.copyTo(d);achunks.push({ts:c.timestamp,dur:c.duration,data:d});},error:e=>{aerr=String(e);}});
    aenc.configure({codec:'mp4a.40.2',sampleRate:buf.sampleRate,numberOfChannels:2,bitrate:192000});
    const step=4800; const ch0=buf.getChannelData(0), ch1=buf.getChannelData(1);
    for(let off=0;off<buf.length;off+=step){const n=Math.min(step,buf.length-off);const data=new Float32Array(n*2);data.set(ch0.subarray(off,off+n),0);data.set(ch1.subarray(off,off+n),n);
      const ad=new AudioData({format:'f32-planar',sampleRate:buf.sampleRate,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(off*1e6/buf.sampleRate),data});aenc.encode(ad);ad.close();if(aerr)throw new Error(aerr);}
    await aenc.flush(); aenc.close();
    const cat=list=>{const n=list.reduce((s,c)=>s+c.data.length,0),u=new Uint8Array(n);let o=0;for(const c of list){u.set(c.data,o);o+=c.data.length;}return u;};
    const vbin=cat(vchunks), abin=cat(achunks); window.__v=b64(vbin); window.__a=b64(abin);
    return {fps,total,width:W,height:H,video:{codec:'avc1.640028',desc:vdesc,chunks:vchunks.map(c=>({ts:c.ts,dur:c.dur,key:c.key,size:c.data.length}))},audio:{codec:'mp4a.40.2',desc:adesc,sampleRate:buf.sampleRate,channels:2,chunks:achunks.map(c=>({ts:c.ts,dur:c.dur,size:c.data.length}))},vlen:window.__v.length,alen:window.__a.length};
  })()`, { timeout: 600000 });
  const pull = async (name, len) => { const CH = 4 * 1024 * 1024, parts = []; for (let i = 0; i < len; i += CH) parts.push(Buffer.from(await b.evaluate(`window.${name}.slice(${i},${i + CH})`), 'base64')); return Buffer.concat(parts); };
  writeFileSync(OUT + '/video.bin', await pull('__v', info.vlen)); writeFileSync(OUT + '/audio.bin', await pull('__a', info.alen));
  const { vlen, alen, ...index } = info; writeFileSync(OUT + '/index.json', JSON.stringify(index));
  console.log(JSON.stringify({ frames: index.video.chunks.length, keyframes: index.video.chunks.filter(c => c.key).length, videoBytes: index.video.chunks.reduce((s, c) => s + c.size, 0), audioChunks: index.audio.chunks.length, audioBytes: index.audio.chunks.reduce((s, c) => s + c.size, 0), vdesc: !!index.video.desc, adesc: index.audio.desc, firstTs: index.video.chunks.slice(0, 5).map(c => c.ts), monotonic: index.video.chunks.every((c, i, a) => i === 0 || c.ts > a[i - 1].ts), audioTs: index.audio.chunks.slice(0, 3) }));
} finally { await b.close(); }
