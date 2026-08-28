import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../assets/milos-mp4-faststart-v238.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

function u32(value){
  const b=Buffer.alloc(4); b.writeUInt32BE(value>>>0); return b;
}
function box(type,payload=Buffer.alloc(0)){
  return Buffer.concat([u32(8+payload.length),Buffer.from(type,'ascii'),payload]);
}
function container(type,...children){return box(type,Buffer.concat(children));}
function stco(offset){return box('stco',Buffer.concat([Buffer.alloc(4),u32(1),u32(offset)]));}
function types(buffer){
  const out=[]; let p=0;
  while(p+8<=buffer.length){const size=buffer.readUInt32BE(p);if(size<8||p+size>buffer.length)break;out.push(buffer.toString('ascii',p+4,p+8));p+=size;}
  return out;
}

test('Milos 2.42 loads the MP4 fast-start repair immediately after private media storage and caches it offline',()=>{
  assert.match(index,/milos-mp4-faststart-v238\.js\?v=2\.42/);
  assert.ok(index.indexOf('milos-media.js')<index.indexOf('milos-mp4-faststart-v238.js'));
  assert.ok(index.indexOf('milos-mp4-faststart-v238.js')<index.indexOf('milos-video-evidence-v231.js'));
  assert.match(sw,/milos-mp4-faststart-v238\.js/);
  assert.match(sw,/milos-assessor-shell-v2\.42/);
});

test('fast-start repair moves moov before mdat and corrects the real media chunk offset',async()=>{
  const context={Blob,console,MilosMedia:{putFile:async()=>null,getFile:async()=>null}};
  vm.createContext(context);
  vm.runInContext(src,context);
  const repair=context.MilosMp4Faststart;
  assert.ok(repair);

  const ftyp=box('ftyp',Buffer.from('isom0000','ascii'));
  const mdatPayload=Buffer.from('abcdefghijklmnop','ascii');
  const mdat=box('mdat',mdatPayload);
  const originalChunkOffset=ftyp.length+8;
  const moov=container('moov',container('trak',container('mdia',container('minf',container('stbl',stco(originalChunkOffset))))));
  const source=Buffer.concat([ftyp,mdat,moov]);
  assert.deepEqual(types(source),['ftyp','mdat','moov']);

  const output=Buffer.from(await (await repair.optimise(new Blob([source],{type:'video/mp4'}))).arrayBuffer());
  assert.deepEqual(types(output),['ftyp','moov','mdat']);

  const stcoType=output.indexOf(Buffer.from('stco','ascii'));
  assert.ok(stcoType>0);
  const repairedChunkOffset=output.readUInt32BE(stcoType+12);
  assert.equal(repairedChunkOffset,originalChunkOffset+moov.length);
  assert.equal(output.subarray(repairedChunkOffset,repairedChunkOffset+mdatPayload.length).toString('ascii'),mdatPayload.toString('ascii'));
});

test('repair is metadata-only and wraps both newly stored and existing MP4 evidence',()=>{
  assert.match(src,/function patchChunkOffsets/);
  assert.match(src,/box\.type === "stco"/);
  assert.match(src,/box\.type === "co64"/);
  assert.match(src,/async function putFile/);
  assert.match(src,/async function getFile/);
  assert.match(src,/seekableLocalMp4: true/);
  assert.match(src,/noReencode: true/);
  assert.doesNotMatch(src,/MediaRecorder|drawImage|canvas|transcod|videoBitsPerSecond/);
});
