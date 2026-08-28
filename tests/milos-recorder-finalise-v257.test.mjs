import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/milos-recorder-finalise-v257.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

class FakeRecorder extends EventTarget{
  static isTypeSupported(){return true;}
  constructor(){super();this.state='recording';this.stopCalls=0;}
  stop(){this.stopCalls+=1;this.state='inactive';/* Android failure reproduction: no stop event */}
  requestData(){}
}

test('2.57 forces a stop event when Android never emits one',()=>{
  const document={addEventListener(){}};
  const context={window:{MediaRecorder:FakeRecorder},document,Event,EventTarget,Proxy,Object,Reflect,String,clearTimeout,console,setTimeout(fn){fn();return 1;}};
  vm.runInNewContext(source,context);
  const recorder=new context.window.MediaRecorder({},{});
  let stopped=0;recorder.addEventListener('stop',()=>stopped++);
  recorder.stop();
  assert.equal(recorder.stopCalls,1);
  assert.equal(stopped,1,'synthetic stop event should release Milos finalisation');
});

test('2.57 finaliser loads before the observation recorder and is cached offline',()=>{
  const finaliser=index.indexOf('milos-recorder-finalise-v257.js');
  const recorder=index.indexOf('milos-video-evidence-v231.js');
  assert.ok(finaliser>=0&&recorder>finaliser);
  assert.match(index,/milos-recorder-finalise-v257\.js\?v=2\.57/);
  assert.match(sw,/milos-recorder-finalise-v257\.js/);
  assert.match(source,/STOP_TIMEOUT=900/);
  assert.match(source,/Saving clip…/);
});

test('2.57 release metadata is aligned',()=>{
  assert.equal(pkg.version,'2.57.0');
  assert.match(index,/milos-app-version" content="2\.57"/);
  assert.match(sw,/milos-assessor-shell-v2\.57/);
});
