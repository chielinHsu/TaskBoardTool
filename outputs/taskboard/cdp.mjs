// Minimal Chrome DevTools client. Only connects to the dedicated loopback renderer.
export class Cdp {
  constructor(url) {
    const endpoint = new URL(url);
    if(endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1') throw Error('CDP must use loopback');
    this.ws = new WebSocket(url); this.next = 1; this.pending = new Map(); this.listeners=new Map();
    this.ready = new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',()=>reject(Error('CDP connection failed')),{once:true});});
    this.ws.addEventListener('message',event=>{
      let message; try {message=JSON.parse(event.data);} catch {return;}
      if(message.method){for(const listener of this.listeners.get(message.method)||[]) Promise.resolve(listener(message.params)).catch(()=>{});return;}
      const pending = this.pending.get(message.id); if(!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if(message.error) pending.reject(Error(message.error.message)); else pending.resolve(message.result);
    });
    this.ws.addEventListener('close',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}this.pending.clear();});
  }
  on(method,listener){if(!this.listeners.has(method))this.listeners.set(method,[]);this.listeners.get(method).push(listener);}
  async send(method,params={}) {
    await this.ready;
    const id=this.next++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`${method} timed out`));},10000);
      this.pending.set(id,{resolve,reject,timer});
      try {this.ws.send(JSON.stringify({id,method,params}));} catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  async evaluate(expression) {
    const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails) throw Error(result.exceptionDetails.text || 'Renderer expression failed');
    return result.result.value;
  }
  close(){this.ws.close();}
}
