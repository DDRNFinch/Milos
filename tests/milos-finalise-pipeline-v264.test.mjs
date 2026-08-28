import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/milos-finalise-pipeline-v264.js',import.meta.url),'utf8');
const wait=(ms=30)=>new Promise(resolve=>setTimeout(resolve,ms));

function fastTimer(fn,ms=0,...args){return setTimeout(fn,Math.min(Number(ms)||0,8),...args);}

class SilentRecorder extends EventTarget{
  static isTypeSupported(){return true;}
  constructor(){super();this.state='recording';this.stopCalls=0;}
  stop(){this.stopCalls+=1;}
}

test('Android finaliser releases awaited stop listeners even when the wrapped recorder never emits stop',async()=>{
  const layer={hidden:false};
  const document={getElementById(id){return id==='milosVideoObservationLayer'?layer:null;},querySelector(){return null;}};
  const context={window:null,document,navigator:{userAgent:'Mozilla/5.0 (Linux; Android 16) Chrome/140'},MediaRecorder:SilentRecorder,Event,EventTarget,Blob,Proxy,Object,Reflect,Promise,Map,Array,Date,String,Number,queueMicrotask,setTimeout:fastTimer,clearTimeout,console,indexedDB:null};
  context.window=context;
  vm.runInNewContext(source,context,{filename:'milos-finalise-pipeline-v264.js'});
  const recorder=new context.MediaRecorder({},{});
  let stops=0;
  recorder.addEventListener('stop',()=>{stops+=1;},{once:true});
  recorder.stop();
  await wait(35);
  assert.equal(recorder.stopCalls,1);
  assert.equal(stops,1);
});

test('bounded media storage proceeds after IndexedDB put succeeds even if transaction completion never arrives',async()=>{
  const layer={hidden:false};
  const document={getElementById(id){return id==='milosVideoObservationLayer'?layer:null;},querySelector(){return null;}};
  const saved=[];
  const db={
    objectStoreNames:{contains(){return true;}},
    close(){},
    transaction(){
      const tx={error:null,commit(){},abort(){this.onabort?.();},oncomplete:null,onerror:null,onabort:null};
      tx.objectStore=()=>({put(record){
        saved.push(record);
        const request={onsuccess:null,onerror:null,error:null};
        fastTimer(()=>request.onsuccess?.(),1);
        return request;
      }});
      return tx;
    }
  };
  const indexedDB={open(){
    const request={result:db,error:null,onsuccess:null,onerror:null,onblocked:null,onupgradeneeded:null};
    fastTimer(()=>request.onsuccess?.(),1);
    return request;
  }};
  let uid=0;
  const MilosCore={uid(prefix){uid+=1;return `${prefix}-${uid}`;},cleanText(value,max){return String(value||'').trim().slice(0,max||500);}};
  const baseMedia={getFile(){},removeFile(){},putFile(){throw new Error('old putFile should be replaced');},putFiles(){}};
  const context={window:null,document,navigator:{userAgent:'Mozilla/5.0 (Linux; Android 16) Chrome/140'},MediaRecorder:SilentRecorder,Event,EventTarget,Blob,Proxy,Object,Reflect,Promise,Map,Array,Date,String,Number,queueMicrotask,setTimeout:fastTimer,clearTimeout,console,indexedDB,MilosCore,MilosMedia:baseMedia};
  context.window=context;
  vm.runInNewContext(source,context,{filename:'milos-finalise-pipeline-v264.js'});
  const blob=new Blob(['video-data'],{type:'video/webm'});blob.name='235_LO3.webm';
  const record=await context.MilosMedia.putFile(blob);
  assert.equal(record.id,'media-1');
  assert.equal(record.name,'235_LO3.webm');
  assert.equal(record.type,'video/webm');
  assert.equal(record.size,blob.size);
  assert.equal(saved.length,1);
  assert.equal(saved[0].blob,blob);
});

test('2.64 patch declares hard bounds for both stop completion and private storage',()=>{
  assert.match(source,/STOP_HARD_MS=2600/);
  assert.match(source,/PUT_REQUEST_MS=6500/);
  assert.match(source,/PUT_COMMIT_GRACE_MS=1400/);
  assert.match(source,/Video was captured, but Milos could not finish private media storage/);
});
