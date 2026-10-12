// Markdown／Mermaid renderer of index.html in a minimal fake DOM: AI text must stay text nodes, never markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../outputs/taskboard/index.html',import.meta.url),'utf8');
const source=html.split('/* taskboard-markdown:start */')[1].split('/* taskboard-markdown:end */')[0];

class FakeText{constructor(data){this.data=String(data);this.parentNode=null;}get textContent(){return this.data;}remove(){detach(this);}}
function detach(node){if(node.parentNode){node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node),1);node.parentNode=null;}}
class FakeElement{
  constructor(name,doc){this.localName=name;this.ownerDocument=doc;this.childNodes=[];this.parentNode=null;this.dataset={};this.style={};this.className='';this.attrs=new Map();}
  append(...items){for(const item of items){const node=typeof item==='string'?new FakeText(item):item;detach(node);node.parentNode=this;this.childNodes.push(node);this.ownerDocument.appended(node);}}
  prepend(...items){const rest=this.childNodes.splice(0);for(const n of rest)n.parentNode=null;this.append(...items,...rest);}
  replaceChildren(...items){for(const n of this.childNodes.splice(0))n.parentNode=null;this.append(...items);}
  remove(){detach(this);}
  get textContent(){return this.childNodes.map(n=>n.textContent).join('');}
  set textContent(value){this.replaceChildren(String(value));}
  set innerHTML(value){throw Error('innerHTML used with: '+value);}
  get children(){return this.childNodes.filter(n=>n instanceof FakeElement);}
  querySelectorAll(selector){assert.equal(selector,'*');const out=[];const walk=n=>{for(const c of n.children){out.push(c);walk(c);}};walk(this);return out;}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  removeAttribute(name){this.attrs.delete(name);}
  get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
}
function harness({api=()=>Promise.reject(Error('尚未安裝 Mermaid 圖表函式庫，請在專案根目錄執行 node outputs/taskboard/setup-mermaid.mjs。')),colors={}}={}){
  const calls=[];
  const document={
    appended(node){if(node.localName==='script')vm.runInContext(node.textContent,context);},
    createElement(name){return new FakeElement(name,document);},
    getElementById(){return null;},
    querySelectorAll(){return [];},
  };
  document.head=new FakeElement('head',document);document.body=new FakeElement('body',document);document.documentElement=new FakeElement('html',document);
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const getComputedStyle=node=>({color:colors[/var\((--[\w-]+)\)/.exec(node.style.color||'')?.[1]]||'',fontFamily:'Inter, "Segoe UI"'});
  const context=vm.createContext({document,window:{},el,api:(...args)=>{calls.push(args);return api(...args);},getComputedStyle,setTimeout,clearTimeout,Date,console});
  context.window=context;
  vm.runInContext(source+';this.exports={mdBlocks,mdBox,mdRender,mdRgb,mermaidPalette,mermaidClean,loadMermaid};',context);
  return {...context.exports,document,el,calls,context};
}
const all=root=>[root,...root.querySelectorAll('*')];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('HTML in report text stays literal text, never elements',()=>{
  const h=harness();
  const text='<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n**<b>粗</b>** `<i>code</i>`\n```html\n<iframe src="javascript:alert(3)"></iframe>\n```';
  const box=h.mdBox(text);
  const names=all(box).map(n=>n.localName);
  for(const bad of ['script','img','iframe','b','i'])assert.ok(!names.includes(bad),bad+' element created');
  assert.ok(box.textContent.includes('<script>alert(1)</script>'));
  assert.ok(box.textContent.includes('<img src=x onerror=alert(2)>'));
  assert.ok(box.textContent.includes('<iframe src="javascript:alert(3)"></iframe>'));
  assert.equal(all(box).some(n=>n.attrs.size),false,'no attributes are copied from text');
});

test('headings, nested lists, tables, quotes, code and inline marks',()=>{
  const h=harness();
  const box=h.mdBox('# 修改摘要\n- 第一項 **重點**\n  - 子項 `server.py`\n- 第二項\n\n3. 三\n4. 四\n\n| 檔案 | 說明 |\n|---|---|\n| a.py | *改* |\n\n> 引用\n\n---\n[文件](docs/x.md) 與 ~~~\n```js\nconst a=1;\n```');
  const kids=box.children.map(n=>n.localName);
  assert.deepEqual(kids,['h1','ul','ol','div','blockquote','hr','p','pre']);
  const ul=box.children[1];assert.equal(ul.children.length,2);assert.equal(ul.children[0].children[1].localName,'ul','nested list');
  assert.equal(all(ul).find(n=>n.localName==='strong').textContent,'重點');
  assert.equal(all(ul).find(n=>n.localName==='code').textContent,'server.py');
  assert.equal(box.children[2].start,3);
  const cells=all(box.children[3]).filter(n=>['th','td'].includes(n.localName)).map(n=>n.textContent);
  assert.deepEqual(cells,['檔案','說明','a.py','改']);
  const link=all(box).find(n=>n.className==='md-link');assert.equal(link.textContent,'文件');assert.equal(link.title,'docs/x.md');
  assert.equal(all(box).some(n=>n.localName==='a'),false,'links are not navigable');
  assert.equal(box.children[7].textContent,'const a=1;');assert.equal(box.children[7].children[0].dataset.lang,'js');
});

test('javascript: link target is only a title string',()=>{
  const h=harness();
  const plain=h.mdBox('[按我](javascript:alert(1))');assert.equal(plain.textContent,'[按我](javascript:alert(1))');
  const box=h.mdBox('[按我](javascript:void0)');
  const link=all(box).find(n=>n.className==='md-link');assert.equal(link.title,'javascript:void0');assert.equal(link.attrs.size,0);
  assert.equal(all(box).some(n=>n.localName==='a'),false);
});

test('mermaid block falls back to its source with the reason when the library is missing',async()=>{
  const h=harness();
  const diagram='flowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B';
  const box=h.mdBox('前\n```mermaid\n'+diagram+'\n```\n後');
  const block=box.children[1];assert.equal(block.className,'md-mermaid');assert.equal(block.dataset.state,'loading');
  await tick();await tick();
  assert.equal(block.dataset.state,'failed');
  assert.match(block.children[0].textContent,/Mermaid 圖無法顯示.*setup-mermaid\.mjs/);
  assert.equal(block.children[1].textContent,diagram);
  assert.equal(all(block).some(n=>n.localName==='img'),false);
  assert.deepEqual(h.calls.map(c=>c[0]),['/api/vendor/mermaid']);
  h.mdBox('```mermaid\ngraph TD\n```');await tick();await tick();
  assert.equal(h.calls.length,1,'a recent failure is not refetched on every render');
});

test('unclosed mermaid fence while streaming stays plain code and loads nothing',()=>{
  const h=harness();const box=h.mdBox('```mermaid\nflowchart LR\n  A --> B');
  assert.equal(box.children[0].localName,'pre');assert.equal(h.calls.length,0);
});

test('a library that does not define mermaid is reported, not trusted',async()=>{
  const h=harness({api:()=>Promise.resolve({version:'x',source:'globalThis.notMermaid=1'})});
  await assert.rejects(h.loadMermaid(),/無法在此頁面執行/);
  assert.equal(h.document.head.children.length,0,'injected script element is removed');
});

test('mdRender skips identical text and replaces changed text',()=>{
  const h=harness();const node=h.el('div','result-text md');
  h.mdRender(node,'**a**');const first=node.children[0];h.mdRender(node,'**a**');assert.equal(node.children[0],first);
  h.mdRender(node,'b');assert.equal(node.textContent,'b');
});

test('oversized text renders as one plain paragraph',()=>{
  const h=harness();const box=h.mdBox('# x\n'+'a'.repeat(200001));
  assert.equal(box.children.length,1);assert.equal(box.children[0].localName,'p');
});

test('Mermaid SVG cleaner drops active content and keeps local references',()=>{
  const h=harness();const root=h.el('div');const svg=h.el('svg');root.append(svg);
  const script=h.el('script');const image=h.el('image');const g=h.el('g');const use=h.el('use');const a=h.el('a');const anim=h.el('animate');
  g.setAttribute('onclick','alert(1)');g.setAttribute('class','node');g.setAttribute('style','fill:red');
  use.setAttribute('href','#arrow');a.setAttribute('xlink:href','javascript:alert(1)');a.setAttribute('data-x',' java\nscript:alert(1)');
  svg.append(script,image,g,use,a,anim);
  h.mermaidClean(root);
  assert.deepEqual(svg.children.map(n=>n.localName),['g','use','a']);
  assert.deepEqual(g.attributes.map(x=>x.name),['class','style']);
  assert.equal(use.attrs.get('href'),'#arrow');
  assert.equal(a.attrs.size,0);
});

test('diagram palette follows the CSS tokens and composites translucent lines',()=>{
  const dark={'--paper':'rgb(45, 45, 45)','--ink':'rgb(255, 255, 255)','--muted':'rgb(170, 170, 170)','--line':'rgba(255, 255, 255, 0.14)','--accent':'rgb(51, 156, 255)','--accent-light':'color(srgb 0.2 0.3 0.4)','--column':'rgb(20, 20, 20)','--on-accent':'rgb(0, 0, 0)','--danger':'rgb(255, 133, 131)'};
  const vars=harness({colors:dark}).mermaidPalette();
  assert.equal(vars.darkMode,true);assert.equal(vars.background,'#2d2d2d');assert.equal(vars.primaryBorderColor,'#339cff');
  assert.equal(vars.lineColor,'#aaaaaa');assert.equal(vars.clusterBorder,'#4a4a4a');assert.equal(vars.primaryColor,'#334d66');
  const light=harness({colors:{'--paper':'rgb(255, 255, 255)','--ink':'rgb(25, 36, 49)','--accent':'rgb(40, 108, 91)'}}).mermaidPalette();
  assert.equal(light.darkMode,false);assert.equal(light.textColor,'#192431');assert.equal(light.nodeBorder,'#286c5b');
  assert.equal('lineColor' in light,false,'unknown tokens are left to Mermaid instead of guessed');
});

test('colour parser handles rgb, rgba, slash alpha and color(srgb)',()=>{
  const {mdRgb}=harness();
  assert.deepEqual([...mdRgb('rgb(1, 2, 3)')],[1,2,3,1]);
  assert.deepEqual([...mdRgb('rgba(0, 0, 0, 0.04)')],[0,0,0,0.04]);
  assert.deepEqual([...mdRgb('rgb(10 20 30 / 50%)')],[10,20,30,0.5]);
  assert.deepEqual([...mdRgb('color(srgb 1 0 0.5)')],[255,0,127.5,1]);
  assert.equal(mdRgb('var(--x)'),null);
});
