(()=>{
'use strict';
const VERSION='2.65';
const DB_OPEN_MS=3500;
const PUT_REQUEST_MS=6500;
const PUT_COMMIT_GRACE_MS=1400;
const DB_NAME='milos-assessor-media-v1';
const STORE_NAME='files';
function hardenMedia(){
  const base=window.MilosMedia,C=window.MilosCore;
  if(!base||!C||!window.indexedDB)return;
  let dbPromise=null;
  function closeDb(){
    const current=dbPromise;dbPromise=null;
    if(current)Promise.resolve(current).then(db=>{try{db&&db.close&&db.close();}catch(_){}}).catch(()=>{});
  }
  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      let settled=false;
      const request=window.indexedDB.open(DB_NAME,1);
      const timer=setTimeout(()=>{if(settled)return;settled=true;try{request.result?.close?.();}catch(_){};reject(new Error('Private media storage did not open in time.'));},DB_OPEN_MS);
      const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'id'});};
      request.onsuccess=()=>{const db=request.result;try{db.onversionchange=()=>{try{db.close();}catch(_){};dbPromise=null;};}catch(_){};finish(resolve,db);};
      request.onerror=()=>finish(reject,request.error||new Error('Private media storage could not be opened.'));
      request.onblocked=()=>finish(reject,new Error('Private media storage is blocked by an older Milos tab.'));
    });
    dbPromise.catch(()=>{dbPromise=null;});
    return dbPromise;
  }
  async function writeRecord(record){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      let settled=false,requestDone=false,commitTimer=0;
      const tx=db.transaction(STORE_NAME,'readwrite');
      const request=tx.objectStore(STORE_NAME).put(record);
      const hardTimer=setTimeout(()=>{
        if(settled)return;settled=true;
        try{tx.abort();}catch(_){}
        reject(new Error('Private media storage did not respond in time.'));
      },PUT_REQUEST_MS);
      const done=(ok,error)=>{if(settled)return;settled=true;clearTimeout(hardTimer);if(commitTimer)clearTimeout(commitTimer);ok?resolve():reject(error||new Error('The media could not be stored.'));};
      request.onsuccess=()=>{
        requestDone=true;
        try{if(typeof tx.commit==='function')tx.commit();}catch(_){}
        commitTimer=setTimeout(()=>done(true),PUT_COMMIT_GRACE_MS);
      };
      request.onerror=()=>done(false,request.error||new Error('The media could not be stored.'));
      tx.oncomplete=()=>done(true);
      tx.onerror=()=>done(false,tx.error||new Error('The media could not be stored.'));
      tx.onabort=()=>done(false,tx.error||new Error(requestDone?'The media save was interrupted after writing.':'The media save was interrupted.'));
    });
  }
  async function putFile(file){
    if(!file||!(file instanceof Blob))throw new Error('Choose a photo, video or audio file first.');
    const record={
      id:C.uid('media'),
      blob:file,
      name:C.cleanText(file.name||'observation-media',160),
      type:C.cleanText(file.type||'application/octet-stream',100),
      size:Number(file.size||0),
      createdAt:Date.now()
    };
    let lastError=null;
    for(let attempt=0;attempt<2;attempt+=1){
      try{await writeRecord(record);return Object.assign({},record,{blob:undefined});}
      catch(error){lastError=error;closeDb();if(attempt===0)await new Promise(resolve=>setTimeout(resolve,120));}
    }
    throw new Error(`Video was captured, but Milos could not finish private media storage. ${lastError?.message||'Try the recording again.'}`);
  }
  async function putFiles(files){const list=Array.from(files||[]).slice(0,12),saved=[];for(const file of list)saved.push(await putFile(file));return saved;}
  window.MilosMedia=Object.freeze(Object.assign({},base,{putFile,putFiles}));
}
hardenMedia();
const meta=document.querySelector?.('meta[name="milos-app-version"]');if(meta)meta.setAttribute('content',VERSION);
window.MilosFinalisePipeline264=Object.freeze({version:VERSION,recorderLayer:false,dbOpenMs:DB_OPEN_MS,putRequestMs:PUT_REQUEST_MS,putCommitGraceMs:PUT_COMMIT_GRACE_MS});
})();