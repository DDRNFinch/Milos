import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/milos-finalise-pipeline-v264.js',import.meta.url),'utf8');
const wait=(ms=30)=>new Promise(resolve=>setTimeout(resolve,ms));

function fastTimer(fn,ms=0,...args){
  const value=Number(ms)||0;
  const scaled=value<=2?1:Math.max(2,Math.round(value/500));
  return setTimeout(fn,scaled,...args);
}

test('2.65 finalise pipeline does not wrap MediaRecorder again',()=>{
  assert.doesNotMatch(source,/window\.MediaRecorder=/);
  assert.doesNotMatch(source,/new Proxy\(/);
  assert.doesNotMatch(source,/STOP_HARD_MS/);
  assert.match(source,/recorderLayer:false/);
});

test('bounded media storage proceeds after IndexedDB put succeeds even if transaction completion never arrives',async()=>{
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
  const document={querySelector(){return null;}};
  const context={window:null,document,Blob,Object,Promise,Array,Date,String,Number,setTimeout:fastTimer,clearTimeout,console,indexedDB,MilosCore,MilosMedia:baseMedia};
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

test('media pipeline keeps hard bounds without owning recorder completion',()=>{
  assert.match(source,/DB_OPEN_MS=3500/);
  assert.match(source,/PUT_REQUEST_MS=6500/);
  assert.match(source,/PUT_COMMIT_GRACE_MS=1400/);
  assert.match(source,/Video was captured, but Milos could not finish private media storage/);
});