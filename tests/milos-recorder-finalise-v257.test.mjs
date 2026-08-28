import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/milos-recorder-finalise-v257.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

class FakeRecorder extends EventTarget{
  static isTypeSupported(){return true;}
  constructor(){super();this.state='recording';this.stopCalls=0;}
  stop(){this.stopCalls+=1;this.state='inactive';}
  requestData(){}
}

test('historical 2.57 layer forced a stop event when Android never emitted one',()=>{
  const document={addEventListener(){}};
  const context={window:{MediaRecorder:FakeRecorder},document,Event,EventTarget,Proxy,Object,Reflect,String,clearTimeout,console,setTimeout(fn){fn();return 1;}};
  vm.runInNewContext(source,context);
  const recorder=new context.window.MediaRecorder({},{});
  let stopped=0;recorder.addEventListener('stop',()=>stopped++);
  recorder.stop();
  assert.equal(recorder.stopCalls,1);
  assert.equal(stopped,1);
});

test('2.57 recorder layer is retired from the current runtime after the 2.58 replacement',()=>{
  assert.doesNotMatch(index,/milos-recorder-finalise-v257\.js/);
  assert.doesNotMatch(sw,/milos-recorder-finalise-v257\.js/);
  assert.match(source,/STOP_TIMEOUT=900/);
  assert.match(source,/Saving clip…/);
});
