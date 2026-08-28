import process from 'node:process';

const endpoint=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9222';
const pageUrl=process.env.MILOS_SMOKE_URL||'http://127.0.0.1:4173/tests/browser-recorder-v264.html';
const deadline=Date.now()+18000;
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

async function json(url,options){
  const response=await fetch(url,options);
  if(!response.ok)throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function openTarget(){
  let lastError;
  while(Date.now()<deadline){
    try{
      return await json(`${endpoint}/json/new?${encodeURIComponent(pageUrl)}`,{method:'PUT'});
    }catch(error){lastError=error;await sleep(200);}
  }
  throw lastError||new Error('Chrome DevTools endpoint did not become ready');
}

function connect(wsUrl){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(wsUrl);
    ws.addEventListener('open',()=>resolve(ws),{once:true});
    ws.addEventListener('error',()=>reject(new Error('Could not connect to Chrome DevTools WebSocket')),{once:true});
  });
}

const target=await openTarget();
if(!target?.webSocketDebuggerUrl)throw new Error('Chrome target did not expose a debugger WebSocket');
const ws=await connect(target.webSocketDebuggerUrl);
let nextId=1;
const pending=new Map();
ws.addEventListener('message',(event)=>{
  let message;try{message=JSON.parse(String(event.data));}catch{return;}
  if(!message.id)return;
  const task=pending.get(message.id);if(!task)return;
  pending.delete(message.id);
  if(message.error)task.reject(new Error(message.error.message||'Chrome DevTools command failed'));
  else task.resolve(message.result);
});
function send(method,params={}){
  const id=nextId++;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
}

await send('Runtime.enable');
await send('Page.enable');
let lastText='';
let state='RUNNING';
while(Date.now()<deadline){
  const evaluated=await send('Runtime.evaluate',{expression:`JSON.stringify({state:document.documentElement.dataset.result||'',text:document.getElementById('result')?.textContent||''})`,returnByValue:true});
  try{
    const value=JSON.parse(evaluated?.result?.value||'{}');
    state=value.state||state;lastText=value.text||lastText;
  }catch{}
  if(state==='PASS'||state==='FAIL')break;
  await sleep(250);
}
console.log(`browser-state=${state}`);
console.log(lastText||'(no browser result text)');
try{await send('Page.close');}catch{}
try{ws.close();}catch{}
if(state!=='PASS')process.exit(1);
