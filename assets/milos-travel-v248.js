(()=>{
  'use strict';
  const C=window.MilosCore;
  const root=document.getElementById('milosApp');
  if(!C||!root)return;

  const VERSION='2.48';
  const STORE_KEY='milos-travel-v1';
  const BOOKING_KEY='milos-calendar-bookings-v1';
  const RECEIPT_DB='milos-travel-receipts-v1';
  const RECEIPT_STORE='receipts';
  const state={tab:'setup',focusProfileId:'',route:null,period:null,busy:false};

  function esc(value){return C.escapeHtml?C.escapeHtml(value):String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function clean(value,max=500){return C.cleanText?C.cleanText(value,max):String(value==null?'':value).trim().slice(0,max);}
  function read(){try{const raw=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');return Object.assign({baseAddress:'',base:null,mapApp:'google',mileageRate:'',sites:{},dailyMileage:{}},raw||{});}catch(_){return{baseAddress:'',base:null,mapApp:'google',mileageRate:'',sites:{},dailyMileage:{}};}}
  function write(data){localStorage.setItem(STORE_KEY,JSON.stringify(data));return data;}
  function profiles(){return C.getProfiles?C.getProfiles():[];}
  function profile(id){return profiles().find(item=>item.id===id)||null;}
  function bookings(){try{const rows=JSON.parse(localStorage.getItem(BOOKING_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch(_){return[];}}
  function today(){return new Date().toISOString().slice(0,10);}
  function monthStart(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;}
  function miles(meters){return Math.round((Number(meters||0)/1609.344)*10)/10;}
  function minutes(seconds){return Math.max(0,Math.round(Number(seconds||0)/60));}
  function dateText(key){const d=new Date(`${key}T12:00:00`);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):key;}
  function haversine(a,b){if(!a||!b)return Infinity;const R=3958.7613,toRad=x=>x*Math.PI/180,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),la1=toRad(a.lat),la2=toRad(b.lat);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}

  async function geocode(address){
    const q=clean(address,260);if(!q)throw new Error('Add an address first.');
    const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res=await fetch(url,{headers:{'Accept':'application/json','Accept-Language':'en-GB'}});
    if(!res.ok)throw new Error('The address lookup is unavailable right now.');
    const rows=await res.json();if(!rows||!rows[0])throw new Error('Milos could not find that UK address.');
    return{lat:Number(rows[0].lat),lon:Number(rows[0].lon),displayName:clean(rows[0].display_name||q,300)};
  }
  async function roadRoute(points){
    const valid=(points||[]).filter(p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)));
    if(valid.length<2)throw new Error('At least two mapped locations are needed.');
    const coords=valid.map(p=>`${Number(p.lon)},${Number(p.lat)}`).join(';');
    const res=await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=false`);
    if(!res.ok)throw new Error('Road mileage is unavailable right now.');
    const json=await res.json(),route=json&&json.routes&&json.routes[0];
    if(!route)throw new Error('Milos could not build a road route for those addresses.');
    return{miles:miles(route.distance),minutes:minutes(route.duration),legs:(route.legs||[]).map(leg=>({miles:miles(leg.distance),minutes:minutes(leg.duration)}))};
  }
  function optimise(base,siteRows){
    const remaining=[...siteRows],ordered=[];let current=base;
    while(remaining.length){let bestIndex=0,best=Infinity;remaining.forEach((item,index)=>{const d=haversine(current,item.site);if(d<best){best=d;bestIndex=index;}});const next=remaining.splice(bestIndex,1)[0];ordered.push(next);current=next.site;}
    return ordered;
  }
  function mapsUrl(order){
    const data=read(),base=data.baseAddress,addresses=order.map(item=>item.site.address||item.site.displayName).filter(Boolean);
    if(!base||!addresses.length)return'';
    if(data.mapApp==='waze')return `https://waze.com/ul?q=${encodeURIComponent(addresses[0])}&navigate=yes`;
    const destination=addresses[addresses.length-1],waypoints=addresses.slice(0,-1);
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(base)}&destination=${encodeURIComponent(destination)}${waypoints.length?`&waypoints=${encodeURIComponent(waypoints.join('|'))}`:''}&travelmode=driving`;
  }
  function toast(message,error){
    let el=document.getElementById('mtravelToast');if(!el){el=document.createElement('div');el.id='mtravelToast';el.className='mtravel-toast';document.body.appendChild(el);}el.textContent=message;el.classList.toggle('is-error',!!error);el.classList.add('is-visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('is-visible'),3200);
  }

  function layer(){let el=document.getElementById('milosTravelLayer');if(!el){el=document.createElement('section');el.id='milosTravelLayer';el.className='mtravel-layer';el.hidden=true;document.body.appendChild(el);}return el;}
  function close(){const el=layer();el.hidden=true;el.innerHTML='';state.route=null;state.period=null;}
  function tabs(){return[['setup','Profile'],['sites','Sites'],['mileage','Mileage'],['route','Route'],['receipts','Receipts']].map(([id,label])=>`<button type="button" data-mtravel-tab="${id}" class="${state.tab===id?'is-active':''}">${label}</button>`).join('');}
  function shell(body){const el=layer();el.hidden=false;el.innerHTML=`<div class="mtravel-scrim" data-mtravel-close></div><div class="mtravel-sheet" role="dialog" aria-modal="true" aria-label="Travel and expenses"><header><div><small>MILOS TRAVEL</small><h2>Travel & expenses</h2></div><button type="button" data-mtravel-close aria-label="Close">×</button></header><nav class="mtravel-tabs">${tabs()}</nav><div class="mtravel-body">${body}</div></div>`;}
  function privacyNote(){return `<p class="mtravel-note">Addresses and receipts stay on this device. Online road lookup runs only when you press calculate; the address is then sent to OpenStreetMap routing services to obtain coordinates and road mileage.</p>`;}

  function renderSetup(){
    const d=read();shell(`<form class="mtravel-form" data-mtravel-form="setup"><label><span>Base address</span><textarea name="baseAddress" rows="3" placeholder="College, office or home address">${esc(d.baseAddress||'')}</textarea></label><div class="mtravel-grid"><label><span>Preferred maps app</span><select name="mapApp"><option value="google"${d.mapApp==='google'?' selected':''}>Google Maps</option><option value="waze"${d.mapApp==='waze'?' selected':''}>Waze</option></select></label><label><span>Mileage rate (optional)</span><input name="mileageRate" inputmode="decimal" value="${esc(d.mileageRate||'')}" placeholder="e.g. 0.45"></label></div><button class="mtravel-primary" type="submit">Save profile</button>${d.base?`<div class="mtravel-status"><strong>Base location ready</strong><span>${esc(d.base.displayName||d.baseAddress)}</span></div>`:''}${privacyNote()}</form>`);
  }
  function siteCards(){const d=read();return profiles().map(p=>{const s=d.sites[p.id];return `<button type="button" class="mtravel-site-card" data-mtravel-edit-site="${esc(p.id)}"><div><strong>${esc(p.name)}</strong><span>${s&&s.address?esc(s.address):'No site address'}</span></div><b>${s&&Number.isFinite(Number(s.oneWayMiles))?`${Number(s.oneWayMiles).toFixed(1)} mi`:'Add'}</b></button>`;}).join('');}
  function renderSites(editId){
    const d=read(),id=editId||state.focusProfileId||'',p=id?profile(id):null,s=p?(d.sites[p.id]||{}):{};
    shell(`${profiles().length?`<div class="mtravel-site-list">${siteCards()}</div>`:'<div class="mtravel-empty">Add learner profiles before adding site locations.</div>'}${p?`<form class="mtravel-form mtravel-site-editor" data-mtravel-form="site"><input type="hidden" name="profileId" value="${esc(p.id)}"><h3>${esc(p.name)}</h3><label><span>Current site address</span><textarea name="address" rows="3" placeholder="Site address including postcode">${esc(s.address||'')}</textarea></label><div class="mtravel-actions"><button class="mtravel-primary" type="submit">Save & calculate</button>${s.address?`<a class="mtravel-secondary" href="${esc((d.mapApp==='waze'?`https://waze.com/ul?q=${encodeURIComponent(s.address)}&navigate=yes`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`))}" target="_blank" rel="noopener">Open map</a>`:''}</div>${s.displayName?`<div class="mtravel-status"><strong>${Number(s.oneWayMiles||0).toFixed(1)} miles from base</strong><span>${esc(s.displayName)}</span></div>`:''}${privacyNote()}</form>`:''}`);
  }
  function periodBookings(from,to){return bookings().filter(b=>b.date>=from&&b.date<=to&&b.profileId&&['review','observation','witness'].includes(b.type));}
  async function calculatePeriod(from,to){
    const d=read();if(!d.base)throw new Error('Set and calculate your base address first.');
    const rows=periodBookings(from,to),byDate=new Map();rows.forEach(b=>{if(!d.sites[b.profileId]||!d.sites[b.profileId].lat)return;const list=byDate.get(b.date)||[];if(!list.includes(b.profileId))list.push(b.profileId);byDate.set(b.date,list);});
    const days=[];for(const [date,ids] of [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){const siteRows=ids.map(id=>({profile:profile(id),site:d.sites[id]})).filter(x=>x.profile&&x.site);if(!siteRows.length)continue;const order=optimise(d.base,siteRows),route=await roadRoute([d.base,...order.map(x=>x.site),d.base]);days.push({date,ids:order.map(x=>x.profile.id),names:order.map(x=>x.profile.name),miles:route.miles,minutes:route.minutes});d.dailyMileage[date]=days[days.length-1];}
    write(d);return{from,to,days,total:Math.round(days.reduce((sum,x)=>sum+x.miles,0)*10)/10};
  }
  function renderMileage(){
    const result=state.period,d=read(),rate=Number(d.mileageRate||0);
    shell(`<form class="mtravel-form" data-mtravel-form="mileage"><div class="mtravel-grid"><label><span>From</span><input type="date" name="from" value="${esc(result?.from||monthStart())}"></label><label><span>To</span><input type="date" name="to" value="${esc(result?.to||today())}"></label></div><button class="mtravel-primary" type="submit">Calculate visit mileage</button></form>${result?`<div class="mtravel-summary"><div><span>Total business miles</span><strong>${result.total.toFixed(1)}</strong></div>${rate?`<div><span>At £${rate.toFixed(2)}/mile</span><strong>£${(result.total*rate).toFixed(2)}</strong></div>`:''}</div><div class="mtravel-day-list">${result.days.map(day=>`<div><strong>${esc(dateText(day.date))}</strong><span>${esc(day.names.join(' → '))}</span><b>${day.miles.toFixed(1)} mi</b></div>`).join('')||'<p>No mapped review or observation visits in this period.</p>'}</div><button class="mtravel-secondary mtravel-download" type="button" data-mtravel-download-mileage>Download mileage CSV</button>`:''}${privacyNote()}`);
  }
  function bookedIds(date){return [...new Set(bookings().filter(b=>b.date===date&&b.profileId&&['review','observation','witness'].includes(b.type)).map(b=>b.profileId))];}
  function routeChoices(date){const d=read(),booked=new Set(bookedIds(date));return profiles().filter(p=>d.sites[p.id]&&d.sites[p.id].lat).map(p=>`<label class="mtravel-check"><input type="checkbox" name="profiles" value="${esc(p.id)}"${booked.has(p.id)?' checked':''}><span><strong>${esc(p.name)}</strong><small>${esc(d.sites[p.id].address)}</small></span></label>`).join('');}
  function renderRoute(date){
    const key=date||today(),route=state.route,d=read();
    shell(`<form class="mtravel-form" data-mtravel-form="route"><label><span>Visit date</span><input type="date" name="date" value="${esc(key)}" data-mtravel-route-date></label><div class="mtravel-check-list">${routeChoices(key)||'<div class="mtravel-empty">Add and calculate learner site addresses first.</div>'}</div><button class="mtravel-primary" type="submit">Suggest efficient route</button></form>${route?`<div class="mtravel-route-result"><span>Suggested order</span><ol>${route.order.map(x=>`<li>${esc(x.profile.name)}</li>`).join('')}</ol><div class="mtravel-summary"><div><span>Round trip</span><strong>${route.miles.toFixed(1)} mi</strong></div><div><span>Driving</span><strong>${route.minutes} min</strong></div></div><a class="mtravel-primary mtravel-route-link" href="${esc(mapsUrl(route.order))}" target="_blank" rel="noopener">${d.mapApp==='waze'&&route.order.length>1?'Open first leg in Waze':'Open route in '+(d.mapApp==='waze'?'Waze':'Google Maps')}</a>${d.mapApp==='waze'&&route.order.length>1?'<p class="mtravel-note">Waze does not accept a full multi-stop route from a web link, so Milos keeps the remaining visit order here.</p>':''}</div>`:''}${privacyNote()}`);
  }

  function openReceiptDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(RECEIPT_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(RECEIPT_STORE))db.createObjectStore(RECEIPT_STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function listReceipts(){const db=await openReceiptDb();return new Promise((resolve,reject)=>{const req=db.transaction(RECEIPT_STORE,'readonly').objectStore(RECEIPT_STORE).getAll();req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.addedAt-a.addedAt));req.onerror=()=>reject(req.error);});}
  async function addReceipts(files){const db=await openReceiptDb();const tx=db.transaction(RECEIPT_STORE,'readwrite'),store=tx.objectStore(RECEIPT_STORE);[...files].forEach(file=>store.put({id:`receipt-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,name:clean(file.name,180)||'Receipt',type:file.type||'application/octet-stream',size:file.size||0,addedAt:Date.now(),file}));return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function deleteReceipt(id){const db=await openReceiptDb();return new Promise((resolve,reject)=>{const tx=db.transaction(RECEIPT_STORE,'readwrite');tx.objectStore(RECEIPT_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function renderReceipts(){
    shell('<div class="mtravel-loading">Loading receipts…</div>');let rows=[];try{rows=await listReceipts();}catch(_){rows=[];}
    shell(`<div class="mtravel-receipt-head"><p>Add receipts when you are preparing an expense claim. Milos stores the files without making you label each one.</p><input id="mtravelReceiptInput" type="file" accept="image/*,application/pdf" multiple hidden><button class="mtravel-primary" type="button" data-mtravel-add-receipts>Add receipts</button></div><div class="mtravel-receipt-list">${rows.map(r=>`<div><div><strong>${esc(r.name)}</strong><span>${new Date(r.addedAt).toLocaleDateString('en-GB')} · ${(Number(r.size||0)/1024/1024).toFixed(1)} MB</span></div><button type="button" data-mtravel-delete-receipt="${esc(r.id)}">Remove</button></div>`).join('')||'<div class="mtravel-empty">No receipts stored yet.</div>'}</div><p class="mtravel-note">Receipt images and PDFs stay in local device storage. This trial does not read merchant names or amounts automatically.</p>`);
  }
  function render(){if(state.tab==='setup')return renderSetup();if(state.tab==='sites')return renderSites();if(state.tab==='mileage')return renderMileage();if(state.tab==='route')return renderRoute();return renderReceipts();}

  function patch(){
    const more=root.querySelector('.option-list [data-action="open-settings"]')?.closest('.option-list');
    if(more&&!more.querySelector('[data-mtravel-open]')){const b=document.createElement('button');b.type='button';b.className='option-row milos-option-row';b.dataset.mtravelOpen='1';b.innerHTML='<span class="option-row-copy"><span>Travel & expenses</span><small>Site mileage, routes and receipts</small></span>';more.appendChild(b);}
    const view=root.querySelector('.learner-profile-view');if(view){const edit=view.querySelector('[data-action="edit-learner"]'),id=edit&&edit.dataset.id,grid=view.querySelector('.milos-action-grid');if(id&&grid&&!grid.querySelector('[data-mtravel-profile]')){const b=document.createElement('button');b.type='button';b.className='milos-secondary';b.dataset.mtravelProfile=id;b.textContent='Site & travel';grid.appendChild(b);}}
  }
  let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;patch();});});observer.observe(root,{childList:true,subtree:true});patch();

  document.addEventListener('click',async event=>{
    const open=event.target.closest&&event.target.closest('[data-mtravel-open]');if(open){event.preventDefault();state.tab='setup';state.focusProfileId='';render();return;}
    const fromProfile=event.target.closest&&event.target.closest('[data-mtravel-profile]');if(fromProfile){event.preventDefault();state.tab='sites';state.focusProfileId=fromProfile.dataset.mtravelProfile;renderSites(state.focusProfileId);return;}
    if(event.target.closest&&event.target.closest('[data-mtravel-close]')){event.preventDefault();close();return;}
    const tab=event.target.closest&&event.target.closest('[data-mtravel-tab]');if(tab){event.preventDefault();state.tab=tab.dataset.mtravelTab;state.route=null;render();return;}
    const edit=event.target.closest&&event.target.closest('[data-mtravel-edit-site]');if(edit){event.preventDefault();state.tab='sites';state.focusProfileId=edit.dataset.mtravelEditSite;renderSites(state.focusProfileId);return;}
    const add=event.target.closest&&event.target.closest('[data-mtravel-add-receipts]');if(add){event.preventDefault();document.getElementById('mtravelReceiptInput')?.click();return;}
    const del=event.target.closest&&event.target.closest('[data-mtravel-delete-receipt]');if(del){event.preventDefault();await deleteReceipt(del.dataset.mtravelDeleteReceipt);await renderReceipts();return;}
    const download=event.target.closest&&event.target.closest('[data-mtravel-download-mileage]');if(download&&state.period){event.preventDefault();const lines=['Date,Visits,Miles',...state.period.days.map(d=>`"${d.date}","${d.names.join(' -> ').replaceAll('"','""')}",${d.miles.toFixed(1)}`),`"TOTAL","",${state.period.total.toFixed(1)}`];const blob=new Blob([lines.join('\n')],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Milos-mileage-${state.period.from}-to-${state.period.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  },true);

  document.addEventListener('change',async event=>{
    if(event.target&&event.target.id==='mtravelReceiptInput'&&event.target.files?.length){try{await addReceipts(event.target.files);toast(`${event.target.files.length} receipt${event.target.files.length===1?'':'s'} saved.`);await renderReceipts();}catch(err){toast(err.message||'Receipt could not be saved.',true);}return;}
    if(event.target&&event.target.matches('[data-mtravel-route-date]')){state.route=null;renderRoute(event.target.value||today());}
  },true);

  document.addEventListener('submit',async event=>{
    const form=event.target.closest&&event.target.closest('[data-mtravel-form]');if(!form)return;event.preventDefault();if(state.busy)return;state.busy=true;
    try{
      const data=new FormData(form),kind=form.dataset.mtravelForm;
      if(kind==='setup'){
        const store=read();store.baseAddress=clean(data.get('baseAddress'),260);store.mapApp=clean(data.get('mapApp'),20)==='waze'?'waze':'google';store.mileageRate=clean(data.get('mileageRate'),20);if(store.baseAddress){toast('Finding your base address…');store.base=await geocode(store.baseAddress);}else store.base=null;write(store);toast('Travel profile saved.');renderSetup();
      }else if(kind==='site'){
        const id=clean(data.get('profileId'),120),address=clean(data.get('address'),260),store=read();if(!profile(id))throw new Error('Learner profile not found.');if(!store.base)throw new Error('Set and calculate your base address first.');if(!address){delete store.sites[id];write(store);renderSites(id);return;}toast('Calculating road mileage…');const located=await geocode(address),route=await roadRoute([store.base,located]);store.sites[id]={address,lat:located.lat,lon:located.lon,displayName:located.displayName,oneWayMiles:route.miles,oneWayMinutes:route.minutes,calculatedAt:Date.now()};write(store);toast(`${profile(id).name}: ${route.miles.toFixed(1)} miles from base.`);renderSites(id);
      }else if(kind==='mileage'){
        const from=clean(data.get('from'),20)||monthStart(),to=clean(data.get('to'),20)||today();toast('Calculating visit mileage…');state.period=await calculatePeriod(from,to);toast(`${state.period.total.toFixed(1)} business miles calculated.`);renderMileage();
      }else if(kind==='route'){
        const date=clean(data.get('date'),20)||today(),ids=data.getAll('profiles').map(x=>clean(x,120)).filter(Boolean),store=read();if(!store.base)throw new Error('Set and calculate your base address first.');if(!ids.length)throw new Error('Select at least one learner.');const siteRows=ids.map(id=>({profile:profile(id),site:store.sites[id]})).filter(x=>x.profile&&x.site&&x.site.lat);if(!siteRows.length)throw new Error('Selected learners need calculated site addresses.');const order=optimise(store.base,siteRows);toast('Calculating the suggested road route…');const route=await roadRoute([store.base,...order.map(x=>x.site),store.base]);state.route={date,order,miles:route.miles,minutes:route.minutes,legs:route.legs};toast(`Suggested route: ${route.miles.toFixed(1)} miles.`);renderRoute(date);
      }
    }catch(err){toast(err&&err.message?err.message:'Travel calculation failed.',true);}finally{state.busy=false;}
  },true);

  window.MilosTravel=Object.freeze({version:VERSION,read,geocode,roadRoute,optimise,calculatePeriod,observer:true});
})();
