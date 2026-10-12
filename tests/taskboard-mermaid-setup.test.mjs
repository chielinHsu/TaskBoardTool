// setup-mermaid.mjs with a fake fetch in an isolated work/ folder: never touches the network or outputs/taskboard/vendor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {install,inspect,MERMAID} from '../outputs/taskboard/setup-mermaid.mjs';

const work=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','work');
const body=Buffer.from('globalThis.mermaid={render(){},initialize(){}};');
const pin={version:'0.0.0-test',url:'https://cdn.example.invalid/mermaid.min.js',size:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')};
const fakeFetch=(data,status=200)=>async url=>{assert.equal(url,pin.url);return {ok:status===200,status,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};};
function folder(){fs.mkdirSync(work,{recursive:true});return fs.mkdtempSync(path.join(work,'mermaid-setup-'));}
const quiet=()=>{};

test('pinned release is an exact jsDelivr version with a SHA-256',()=>{
  assert.match(MERMAID.version,/^11\.\d+\.\d+$/);
  assert.equal(MERMAID.url,`https://cdn.jsdelivr.net/npm/mermaid@${MERMAID.version}/dist/mermaid.min.js`);
  assert.match(MERMAID.sha256,/^[0-9a-f]{64}$/);assert.ok(MERMAID.size>1000000);
});

test('matching download installs the file and the manifest',async t=>{
  const dir=folder();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  assert.equal(inspect(dir,pin).reason,'missing');
  assert.deepEqual(await install({dir,pin,fetchImpl:fakeFetch(body),log:quiet}),{changed:true});
  assert.equal(inspect(dir,pin).ok,true);
  const record=JSON.parse(fs.readFileSync(path.join(dir,'mermaid.json'),'utf8'));
  assert.equal(record.sha256,pin.sha256);assert.equal(record.version,pin.version);
  assert.deepEqual(await install({dir,pin,fetchImpl:()=>{throw Error('must not download again');},log:quiet}),{changed:false});
});

test('hash mismatch deletes the download and any old copy and installs nothing',async t=>{
  const dir=folder();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'mermaid.min.js'),'tampered');fs.writeFileSync(path.join(dir,'mermaid.json'),JSON.stringify({sha256:pin.sha256,version:pin.version}));
  assert.equal(inspect(dir,pin).reason,'hash');
  const evil=Buffer.from(body.toString().replace('render','evil__'));assert.equal(evil.length,body.length);
  await assert.rejects(install({dir,pin,fetchImpl:fakeFetch(evil),log:quiet}),/不符.*未安裝/);
  assert.deepEqual(fs.readdirSync(dir),[]);
  assert.equal(inspect(dir,pin).reason,'missing');
});

test('HTTP failure leaves the folder untouched',async t=>{
  const dir=folder();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  await assert.rejects(install({dir,pin,fetchImpl:fakeFetch(body,404),log:quiet}),/HTTP 404/);
  assert.deepEqual(fs.readdirSync(dir),[]);
});

test('a missing or stale manifest is reported',async t=>{
  const dir=folder();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'mermaid.min.js'),body);
  assert.equal(inspect(dir,pin).reason,'manifest');
});
