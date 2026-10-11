import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../outputs/taskboard/index.html',import.meta.url),'utf8');
const source=html.split('/* taskboard-theme:start */')[1].split('/* taskboard-theme:end */')[0];
const dark={mode:'dark',colors:{bg:'rgb(24, 24, 24)',ink:'#fff',accent:'#a67df2'},font:'Inter',fontSize:'15px'};
function harness({embedded=true,initial=dark}={}) {
  const properties=new Map(),listeners=new Map();
  const root={dataset:{},style:{setProperty:(key,value)=>properties.set(key,value)}};
  const parent={};
  const context={document:{documentElement:root},parent,window:{__CASPAR_EMBED_RPC__:embedded?'capability':undefined,__CASPAR_BOARD_THEME__:initial,addEventListener:(type,handler)=>listeners.set(type,handler)},CSS:{supports:(_,value)=>typeof value==='string' && value!=='invalid'}};
  vm.runInNewContext(source,context);
  const send=(theme,overrides={})=>listeners.get('message')({source:parent,data:{type:'caspar-board-theme',capability:'capability',theme},...overrides});
  return {root,properties,send,parent};
}
test('embedded initial theme applies before body paint',()=>{
 const {root,properties}=harness();assert.equal(root.dataset.hostTheme,'dark');assert.equal(properties.get('--accent'),'#a67df2');assert.equal(root.style.fontFamily,'Inter');
});
test('authenticated live update follows light/custom colors',()=>{
 const {root,properties,send}=harness();send({mode:'light',colors:{bg:'#fefefe',accent:'#ff79c6'},font:'Segoe UI'});assert.equal(root.style.colorScheme,'light');assert.equal(properties.get('--bg'),'#fefefe');assert.equal(properties.get('--accent'),'#ff79c6');
});
test('foreign frame cannot update theme',()=>{
 const {properties,send}=harness();send({mode:'light',colors:{bg:'#000'}},{source:{}});assert.equal(properties.get('--bg'),dark.colors.bg);
});
test('wrong or missing capability cannot update theme',()=>{
 const h=harness();for(const capability of ['wrong',undefined])h.send(null,{data:{type:'caspar-board-theme',capability,theme:{mode:'light',colors:{bg:'#000'}}}});assert.equal(h.properties.get('--bg'),dark.colors.bg);
});
test('unknown CSS keys and invalid values are ignored',()=>{
 const {root,properties,send}=harness();send({mode:'dark',colors:{bg:'invalid',position:'fixed',ink:42},font:'invalid',fontSize:'invalid'});assert.equal(properties.get('--bg'),dark.colors.bg);assert.equal(properties.has('--position'),false);assert.equal(properties.get('--ink'),'#fff');assert.equal(root.style.fontFamily,'Inter');
});
test('invalid mode does not partially change theme',()=>{
 const {root,properties,send}=harness();send({mode:'invalid',colors:{bg:'#000'}});assert.equal(root.dataset.hostTheme,'dark');assert.equal(properties.get('--bg'),dark.colors.bg);
});
test('standalone page ignores all embedded theme messages',()=>{
 const {root,properties,send}=harness({embedded:false});send(dark);assert.equal(root.dataset.hostTheme,undefined);assert.equal(properties.size,0);
});
