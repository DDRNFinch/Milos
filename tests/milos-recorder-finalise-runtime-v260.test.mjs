import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-recorder-finalise-v258.js',import.meta.url),'utf8');

class FakeDocument{
  constructor(layer){this.layer=layer;this.listeners=[];}
  getElementById(id){return id==='milosVideoObservationLayer'?this.layer:null;}
  addEventListener(type,fn){if(type==='click')this.listeners.push(fn);}
}
class FakeStream{getTracks(){return[];}}

function setup({android=true}={}){
  let fakeNow=0;
  class FastDate extends Date{static now(){fakeNow+=1000;return fakeNow;}}
  const fastSetTimeout=(fn,ms=0,...args)=>setTimeout(fn,Math.min(Number(ms)||0,6),...args);
  class FakeMediaRecorder extends EventTarget{
    static isTypeSupported(){return true;}
    constructor(stream,options){super();this.stream=stream;this.options=options;this.state='inactive';this.mimeType=String(options?.mimeType||'video/webm');this.nativeRequestDataCalls=0;}
    start(){this.state='recording';}
    requestData(){
      this.nativeRequestDataCalls+=1;
      if(this.state!=='recording')throw new Error('inactive');
      const event=new Event('dataavailable');
      Object.defineProperty(event,'data',{value:new Blob(['manual'],{type:this.mimeType})});
      this.dispatchEvent(event);
    }
    stop(){
      if(this.state!=='recording')throw new Error('inactive');
      fastSetTimeout(()=>{
        const event=new Event('dataavailable');
        Object.defineProperty(event,'data',{value:new Blob(['tail'],{type:this.mimeType})});
        this.dispatchEvent(event);
        this.state='inactive';
        this.dispatchEvent(new Event('stop'));
      },4);
    }
    unexpectedStop(){
      const event=new Event('dataavailable');
      Object.defineProperty(event,'data',{value:new Blob(['held'],{type:this.mimeType})});
      this.dispatchEvent(event);
      this.state='inactive';
      this.dispatchEvent(new Event('stop'));
    }
  }
  const layer={hidden:false,querySelector(){return null;}};
  const document=new FakeDocument(layer);
  let fixCalls=0;
  const context={
    console,Event,EventTarget,Blob,Promise,queueMicrotask,clearTimeout,setTimeout:fastSetTimeout,Date:FastDate,document,
    navigator:{userAgent:android?'Mozilla/5.0 (Linux; Android 16) Chrome/140':'Mozilla/5.0 (iPhone) Safari/605.1'},
    MediaRecorder:FakeMediaRecorder,
    ysFixWebmDuration:(blob)=>{fixCalls+=1;return Promise.resolve(new Blob([blob,'fixed'],{type:blob.type}));}
  };
  context.window=context;
  vm.runInNewContext(js,context,{filename:'milos-recorder-finalise-v258.js'});
  return{context,getFixCalls:()=>fixCalls};
}
const wait=(ms=30)=>new Promise(resolve=>setTimeout(resolve,ms));

test('Android advertises WebM support but suppresses MP4 support for observation codec selection',()=>{
  const{context}=setup({android:true});
  assert.equal(context.MediaRecorder.isTypeSupported('video/mp4'),false);
  assert.equal(context.MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus'),true);
});

test('Apple keeps native MP4 capability available',()=>{
  const{context}=setup({android:false});
  assert.equal(context.MediaRecorder.isTypeSupported('video/mp4'),true);
});

test('observation requestData is not forwarded and native stop still emits final data before stop',async()=>{
  const{context}=setup();
  const recorder=new context.MediaRecorder(new FakeStream(),{mimeType:'video/webm'});
  const order=[];
  recorder.addEventListener('dataavailable',event=>{if(event.data?.size)order.push('data');});
  recorder.addEventListener('stop',()=>order.push('stop'));
  recorder.start();
  recorder.requestData();
  assert.equal(recorder.nativeRequestDataCalls,0);
  recorder.stop();
  await wait();
  assert.deepEqual(order,['data','stop']);
  assert.equal(recorder.state,'inactive');
});

test('unexpected native stop is held for judgement then replays only the awaited stop notification',async()=>{
  const{context}=setup();
  const recorder=new context.MediaRecorder(new FakeStream(),{mimeType:'video/webm'});
  recorder.start();
  recorder.unexpectedStop();
  assert.equal(recorder.state,'recording');
  let replayed=0;
  recorder.addEventListener('stop',()=>{replayed+=1;},{once:true});
  recorder.stop();
  await wait();
  assert.equal(replayed,1);
  assert.equal(recorder.state,'inactive');
});

test('live save skips WebM rewrite but later playback/export can repair it',async()=>{
  const{context,getFixCalls}=setup();
  const recorder=new context.MediaRecorder(new FakeStream(),{mimeType:'video/webm'});
  recorder.start();
  recorder.stop();
  await wait();
  const blob=new Blob(['raw-webm'],{type:'video/webm'});
  const saved=await context.ysFixWebmDuration(blob,9000,{logger:false});
  assert.equal(getFixCalls(),0);
  assert.equal(saved,blob);
  for(let i=0;i<12;i+=1)context.Date.now();
  const repaired=await context.ysFixWebmDuration(blob,9000,{logger:false});
  assert.equal(getFixCalls(),1);
  assert.ok(repaired.size>blob.size);
});