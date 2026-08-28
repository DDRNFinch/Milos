import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

function gitBlobSha(path){
  const data=readFileSync(new URL(`../${path}`,import.meta.url));
  const header=Buffer.from(`blob ${data.length}\0`);
  return createHash('sha1').update(header).update(data).digest('hex');
}

const LOCKED_V246_CAMERA_FILES={
  'assets/milos-video-evidence-v231.js':'8855d755f2cdb9d7b3c2c2062a39af20f2b4beaf',
  'assets/milos-media.js':'78b42043b8dfb4fb66ca09b67dab0af3a8b64fad',
  'assets/milos-mp4-faststart-v238.js':'6fae978414bd380c1df40e9871d5e6210c6a563b',
  'assets/milos-media-optimize-v24.js':'53ae4432f9622647ec082b2f0c7b8b180cdb04ef',
  'assets/fix-webm-duration-1.0.6.js':'546aa1a836350455e269944e653199a767f539fb'
};

test('Milos keeps the exact Android-working 2.46 camera and media stack',()=>{
  for(const [path,expected] of Object.entries(LOCKED_V246_CAMERA_FILES)){
    assert.equal(gitBlobSha(path),expected,`${path} must remain byte-for-byte identical to confirmed working Milos 2.46`);
  }
});

test('the 2.47 observation outcome overlay is not allowed back into the live camera workflow',()=>{
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.doesNotMatch(index,/milos-observation-outcomes-v247/);
  assert.doesNotMatch(sw,/milos-observation-outcomes-v247/);
  assert.equal(existsSync(new URL('../assets/milos-observation-outcomes-v247.js',import.meta.url)),false);
  assert.equal(existsSync(new URL('../assets/milos-observation-outcomes-v247.css',import.meta.url)),false);
});
