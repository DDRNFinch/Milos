(()=>{
  'use strict';
  const C=window.MilosCore;
  if(!C||!window.document)return;

  const VERSION='2.49';
  const STORE_KEY='milos-travel-v1';
  const BOOKING_KEY='milos-calendar-bookings-v1';
  const state={lastMileage:null,lastRoute:null,busy:false};

  function clean(value,max=500){return C.cleanText?C.cleanText(value,max):String(value==null?'':value).trim().slice(0,max);}
  function esc(value){return C.escapeHtml?C.escapeHtml(value):String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function readTravel(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');
      return Object.assign({baseAddress:'',base:null,mapApp:'google',mileageRate:'',sites:{},mentors:{},dailyMileage:{},bookingLocations:{}},raw||{});
    }catch(_){return{baseAddress:'',base:null,mapApp:'google',mileageRate:'',sites:{},mentors:{},dailyMileage:{},bookingLocations:{}};}
  }
  function writeTravel(data){localStorage.setItem(STORE_KEY,JSON.stringify(data));return data;}
  function bookings(){try{const rows=JSON.parse(localStorage.getItem(BOOKING_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch(_){return[];}}
  function profiles(){return C.getProfiles?C.getProfiles():[];}
  function profile(id){return C.getProfile?C.getProfile(id):profiles().find(item=>item.id===id)||null;}
  function permanent(id){const d=readTravel(),s=Object.assign({},d.sites&&d.sites[id]||{});s.mentorName=clean(d.mentors&&d.mentors[id]||s.mentorName,120);return s;}
  function mapApp(){return readTravel().mapApp==='waze'?'waze':'google';}
  function destinationUrl(address){
    const q=clean(address,300);if(!q)return'';
    return mapApp()==='waze'
      ?`https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`
      :`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=driving`;
  }
  function routeUrl(order){
    const d=readTravel(),addresses=(order||[]).map(item=>item.address||item.site?.address||item.site?.displayName).filter(Boolean);
    if(!addresses.length)return'';
    if(d.mapApp==='waze')return `https://waze.com/ul?q=${encodeURIComponent(addresses[0])}&navigate=yes`;
    const destination=addresses[addresses.length-1],waypoints=addresses.slice(0,-1),origin=clean(d.baseAddress,300);
    return `https://www.google.com/maps/dir/?api=1${origin?`&origin=${encodeURIComponent(origin)}`:''}&destination=${encodeURIComponent(destination)}${waypoints.length?`&waypoints=${encodeURIComponent(waypoints.join('|'))}`:''}&travelmode=driving`;
  }
  function dateText(key){const d=new Date(`${key}T12:00:00`);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):key;}
  function toast(message,error){
    let el=document.getElementById('mvisitToast');
    if(!el){el=document.createElement('div');el.id='mvisitToast';el.className='mvisit-toast';document.body.appendChild(el);}
    el.textContent=message;el.classList.toggle('is-error',!!error);el.classList.add('is-visible');
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('is-visible'),3200);
  }

  function ensureStyle(){
    if(document.getElementById('milos-visit-address-v249-style'))return;
    const style=document.createElement('style');style.id='milos-visit-address-v249-style';style.textContent=`
      .mvisit-profile-fields{display:grid;gap:12px;margin:6px 0 16px;padding:14px;border:1px solid rgba(61,126,181,.16);border-radius:16px;background:rgba(245,250,255,.9)}
      .mvisit-profile-fields>strong{font-size:13px;color:#244e72}.mvisit-profile-fields>small,.mvisit-booking-hint{font-size:11px;line-height:1.4;color:#70869a}
      .mvisit-reference{display:grid;gap:8px;margin:12px 0 16px;padding:13px;border-radius:16px;background:#f4f8fc;border:1px solid rgba(66,126,177,.13)}
      .mvisit-ref-row{display:grid;gap:2px;border:0;background:transparent;padding:0;text-align:left;color:inherit;font:inherit;width:100%}.mvisit-ref-row span{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7890a5}.mvisit-ref-row strong{font-size:13px;line-height:1.35;color:#24455f}.mvisit-ref-row.is-map{cursor:pointer;padding-right:24px;position:relative}.mvisit-ref-row.is-map:after{content:'›';position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:24px;color:#2f8fef}
      .mcal-detail.mvisit-map-location{cursor:pointer;position:relative;padding-right:34px!important}.mcal-detail.mvisit-map-location:after{content:'›';position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:24px;color:#2f8fef}.mcal-detail.mvisit-map-location:focus{outline:2px solid #2f8fef;outline-offset:2px}
      .mtravel-check-list .mvisit-route-note{display:block;color:#6f8496;font-size:10px;margin-top:2px}
      .mvisit-toast{position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom));transform:translate(-50%,16px);z-index:12000;max-width:min(520px,calc(100% - 28px));padding:11px 15px;border-radius:999px;background:#17324d;color:#fff;font:700 12px/1.25 system-ui;box-shadow:0 10px 30px rgba(18,47,72,.25);opacity:0;pointer-events:none;transition:.2s}.mvisit-toast.is-visible{opacity:1;transform:translate(-50%,0)}.mvisit-toast.is-error{background:#8b3131}
      .mvisit-route-result{margin-top:16px}.mvisit-route-result ol{margin:8px 0 14px;padding-left:22px}.mvisit-route-result li{margin:6px 0;color:#24455f;font-weight:700}.mvisit-route-result .mtravel-route-link{display:block;text-align:center;text-decoration:none}
    `;document.head.appendChild(style);
  }

  function saveReference(profileId,mentorName,address){
    if(!profileId)return;
    const d=readTravel();d.sites=d.sites||{};d.mentors=d.mentors||{};const old=d.sites[profileId]||{};
    const nextAddress=clean(address,300),oldAddress=clean(old.address,300),mentor=clean(mentorName,120);
    const next=Object.assign({},old,{address:nextAddress});delete next.mentorName;
    if(nextAddress!==oldAddress){delete next.lat;delete next.lon;delete next.displayName;delete next.oneWayMiles;delete next.oneWayMinutes;delete next.calculatedAt;}
    if(nextAddress)d.sites[profileId]=next;else delete d.sites[profileId];
    if(mentor)d.mentors[profileId]=mentor;else delete d.mentors[profileId];
    writeTravel(d);
  }

  function patchLearnerForm(){
    document.querySelectorAll('form[data-form="learner"]').forEach(form=>{
      if(form.dataset.mvisitPatched==='1')return;
      form.dataset.mvisitPatched='1';
      const id=clean(form.elements.profileId?.value,120),site=id?permanent(id):{};
      const submit=form.querySelector('button[type="submit"]');if(!submit)return;
      const box=document.createElement('div');box.className='mvisit-profile-fields';
      box.innerHTML=`<strong>Site reference</strong><label class="milos-field"><span>Mentor name</span><input name="milosMentorName" type="text" maxlength="120" autocomplete="off" value="${esc(site.mentorName||'')}" placeholder="Mentor or site supervisor"></label><label class="milos-field"><span>Permanent site address</span><textarea name="milosPermanentAddress" rows="3" maxlength="300" placeholder="Usual site address including postcode">${esc(site.address||'')}</textarea></label><small>This is the learner's usual site. Milos uses it as the default when you book a visit, but you can change the address for one booking without changing this.</small>`;
      submit.before(box);
    });
  }

  function patchLearnerDetail(){
    document.querySelectorAll('.learner-profile-view').forEach(page=>{
      if(page.dataset.mvisitRefPatched==='1')return;
      const id=clean(page.querySelector('[data-action="delete-learner"][data-id]')?.dataset.id,120);if(!id)return;
      page.dataset.mvisitRefPatched='1';const site=permanent(id);if(!site.mentorName&&!site.address)return;
      const ref=document.createElement('div');ref.className='mvisit-reference';
      ref.innerHTML=`${site.mentorName?`<div class="mvisit-ref-row"><span>Mentor</span><strong>${esc(site.mentorName)}</strong></div>`:''}${site.address?`<button type="button" class="mvisit-ref-row is-map" data-mvisit-map="${esc(site.address)}"><span>Permanent site</span><strong>${esc(site.address)}</strong></button>`:''}`;
      const course=page.querySelector('.milos-profile-course');(course||page.querySelector('.milos-profile-heading'))?.after(ref);
    });
  }

  function profileAddress(id){return clean(permanent(id).address,300);}
  function applyBookingDefault(form,force){
    const select=form.elements.profileId,location=form.elements.location;if(!select||!location)return;
    const address=profileAddress(select.value);
    const oldAuto=location.dataset.mvisitAutoAddress||'';
    if(force||!clean(location.value,300)||clean(location.value,300)===clean(oldAuto,300)){
      location.value=address;location.dataset.mvisitAutoAddress=address;
    }
  }
  function patchBookingForms(){
    document.querySelectorAll('form[data-mcal-form]').forEach(form=>{
      const title=form.querySelector('input[name="title"]');if(title)title.closest('label')?.remove();
      const location=form.elements.location,select=form.elements.profileId;if(!location||!select)return;
      const label=location.closest('label');const caption=label?.querySelector(':scope > span');if(caption)caption.textContent='Visit address';
      location.maxLength=300;location.placeholder='Site address including postcode';
      if(!form.querySelector('.mvisit-booking-hint')){
        const hint=document.createElement('small');hint.className='mvisit-booking-hint';hint.textContent='The learner’s permanent site is filled in automatically. Edit it here for this visit only.';label?.appendChild(hint);
      }
      if(form.dataset.mvisitBookingPatched!=='1'){
        form.dataset.mvisitBookingPatched='1';
        select.addEventListener('change',()=>applyBookingDefault(form,true));
        location.addEventListener('input',()=>{if(clean(location.value,300)!==clean(location.dataset.mvisitAutoAddress,300))location.dataset.mvisitAutoAddress='';});
      }
      const editing=!!clean(form.dataset.bookingId,120);
      if(!editing&&!clean(location.value,300))applyBookingDefault(form,false);
    });
  }

  function patchBookingDetails(){
    document.querySelectorAll('.mcal-detail').forEach(row=>{
      const label=clean(row.querySelector('span')?.textContent,80);if(label!=='Location')return;
      const address=clean(row.querySelector('strong')?.textContent,300);if(!address)return;
      row.classList.add('mvisit-map-location');row.dataset.mvisitMap=address;row.setAttribute('role','button');row.setAttribute('tabindex','0');row.setAttribute('aria-label',`Open directions to ${address}`);
    });
  }

  function bookingAddress(booking){return clean(booking&&booking.location,300)||profileAddress(booking&&booking.profileId);}
  function bookedVisits(date){return bookings().filter(item=>item.date===date&&item.profileId&&['review','observation','witness'].includes(item.type));}
  function routeChoiceRows(date){
    const visits=bookedVisits(date),seen=new Set(),rows=[];
    visits.forEach(item=>{const address=bookingAddress(item),p=profile(item.profileId);if(!p||!address)return;const key=`booking:${item.id}`;seen.add(item.profileId);rows.push({key,profileId:item.profileId,bookingId:item.id,address,name:p.name,booked:true});});
    profiles().forEach(p=>{if(seen.has(p.id))return;const address=profileAddress(p.id);if(address)rows.push({key:`profile:${p.id}`,profileId:p.id,bookingId:'',address,name:p.name,booked:false});});
    return rows;
  }
  function patchRouteChoices(){
    const form=document.querySelector('[data-mtravel-form="route"]');if(!form)return;
    const date=clean(form.elements.date?.value,20)||new Date().toISOString().slice(0,10),list=form.querySelector('.mtravel-check-list');if(!list)return;
    const rows=routeChoiceRows(date);list.innerHTML=rows.length?rows.map(row=>`<label class="mtravel-check"><input type="checkbox" name="mvisitStops" value="${esc(row.key)}" data-profile-id="${esc(row.profileId)}" data-booking-id="${esc(row.bookingId)}" data-address="${esc(row.address)}"${row.booked?' checked':''}><span><strong>${esc(row.name)}</strong><small>${esc(row.address)}</small>${row.booked?'<em class="mvisit-route-note">Booked visit address</em>':'<em class="mvisit-route-note">Permanent site</em>'}</span></label>`).join(''):'<div class="mtravel-empty">Add a learner permanent site address or a visit address in the calendar first.</div>';
  }

  function patchAll(){ensureStyle();patchLearnerForm();patchLearnerDetail();patchBookingForms();patchBookingDetails();patchRouteChoices();}

  async function locate(address,profileId,bookingId){
    const q=clean(address,300);if(!q)throw new Error('Add a visit address first.');
    const d=readTravel(),site=d.sites?.[profileId]||{},cached=d.bookingLocations?.[bookingId]||{};
    if(bookingId&&clean(cached.address,300)===q&&Number.isFinite(Number(cached.lat))&&Number.isFinite(Number(cached.lon)))return Object.assign({},cached,{address:q});
    if(clean(site.address,300)===q&&Number.isFinite(Number(site.lat))&&Number.isFinite(Number(site.lon)))return Object.assign({},site,{address:q});
    const api=window.MilosTravel;if(!api||typeof api.geocode!=='function')throw new Error('Road address lookup is not ready. Reopen Travel and try again.');
    const point=await api.geocode(q),located={address:q,lat:Number(point.lat),lon:Number(point.lon),displayName:clean(point.displayName||q,300),calculatedAt:Date.now()};
    d.bookingLocations=d.bookingLocations||{};
    if(bookingId)d.bookingLocations[bookingId]=located;
    if(profileId&&clean(site.address,300)===q)d.sites[profileId]=Object.assign({},site,located);
    writeTravel(d);return located;
  }

  function nearestOrder(base,rows){
    const api=window.MilosTravel;if(api&&typeof api.optimise==='function')return api.optimise(base,rows.map(row=>({profile:row.profile,site:row.site,address:row.address,booking:row.booking}))).map(item=>({profile:item.profile,site:item.site,address:item.address||item.site.address,booking:item.booking}));
    return rows;
  }

  async function handleMileage(form){
    const data=new FormData(form),from=clean(data.get('from'),20),to=clean(data.get('to'),20),d=readTravel();
    if(!d.base)throw new Error('Set and calculate your base address first.');
    const api=window.MilosTravel;if(!api||typeof api.roadRoute!=='function')throw new Error('Road mileage is not ready.');
    const rows=bookings().filter(b=>b.date>=from&&b.date<=to&&b.profileId&&['review','observation','witness'].includes(b.type));
    const byDate=new Map();rows.forEach(b=>{const address=bookingAddress(b);if(!address)return;const list=byDate.get(b.date)||[];if(!list.some(x=>x.profileId===b.profileId&&clean(bookingAddress(x),300)===address))list.push(b);byDate.set(b.date,list);});
    const days=[];
    for(const [date,visits] of [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
      const stops=[];
      for(const booking of visits){const p=profile(booking.profileId),address=bookingAddress(booking);if(!p||!address)continue;const site=await locate(address,p.id,booking.id);stops.push({profile:p,site,address,booking});}
      if(!stops.length)continue;
      const order=nearestOrder(d.base,stops),route=await api.roadRoute([d.base,...order.map(x=>x.site),d.base]);
      const day={date,ids:order.map(x=>x.profile.id),names:order.map(x=>x.profile.name),addresses:order.map(x=>x.address),miles:Number(route.miles||0),minutes:Number(route.minutes||0)};days.push(day);d.dailyMileage=d.dailyMileage||{};d.dailyMileage[date]=day;
    }
    writeTravel(d);const total=Math.round(days.reduce((sum,x)=>sum+x.miles,0)*10)/10;state.lastMileage={from,to,days,total};renderMileageResult(form,state.lastMileage,Number(d.mileageRate||0));toast(`${total.toFixed(1)} business miles calculated.`);
  }

  function renderMileageResult(form,result,rate){
    const body=form.closest('.mtravel-body');if(!body)return;
    body.querySelectorAll('.mvisit-mileage-result').forEach(el=>el.remove());
    const wrap=document.createElement('div');wrap.className='mvisit-mileage-result';
    wrap.innerHTML=`<div class="mtravel-summary"><div><span>Total business miles</span><strong>${result.total.toFixed(1)}</strong></div>${rate?`<div><span>At £${rate.toFixed(2)}/mile</span><strong>£${(result.total*rate).toFixed(2)}</strong></div>`:''}</div><div class="mtravel-day-list">${result.days.map(day=>`<div><strong>${esc(dateText(day.date))}</strong><span>${esc(day.names.join(' → '))}</span><b>${day.miles.toFixed(1)} mi</b></div>`).join('')||'<p>No review or observation visits with addresses were found in this period.</p>'}</div><button class="mtravel-secondary mtravel-download" type="button" data-mvisit-download-mileage>Download mileage CSV</button><p class="mtravel-note">Where a calendar booking has its own visit address, that address is used for the mileage calculation instead of the learner’s permanent site.</p>`;
    form.after(wrap);
  }

  function downloadMileage(){
    const result=state.lastMileage;if(!result)return;
    const lines=[['Date','Learners / stops','Visit addresses','Business miles','Driving minutes'],...result.days.map(day=>[day.date,day.names.join(' -> '),day.addresses.join(' -> '),day.miles.toFixed(1),String(day.minutes)])];
    const csv=lines.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`Milos_Mileage_${result.from}_to_${result.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function handleRoute(form){
    const d=readTravel();if(!d.base)throw new Error('Set and calculate your base address first.');
    const api=window.MilosTravel;if(!api||typeof api.roadRoute!=='function')throw new Error('Road route planning is not ready.');
    const checked=[...form.querySelectorAll('input[name="mvisitStops"]:checked')];if(!checked.length)throw new Error('Select at least one learner.');
    const stops=[];
    for(const input of checked){const profileId=clean(input.dataset.profileId,120),bookingId=clean(input.dataset.bookingId,120),address=clean(input.dataset.address,300),p=profile(profileId);if(!p||!address)continue;const site=await locate(address,profileId,bookingId);stops.push({profile:p,site,address,booking:bookingId?bookings().find(b=>b.id===bookingId):null});}
    if(!stops.length)throw new Error('Selected visits need an address.');
    const order=nearestOrder(d.base,stops),route=await api.roadRoute([d.base,...order.map(x=>x.site),d.base]);state.lastRoute={order,miles:Number(route.miles||0),minutes:Number(route.minutes||0)};renderRouteResult(form,state.lastRoute,d);toast(`Suggested route: ${state.lastRoute.miles.toFixed(1)} miles.`);
  }

  function renderRouteResult(form,result,d){
    const body=form.closest('.mtravel-body');if(!body)return;body.querySelectorAll('.mvisit-route-result').forEach(el=>el.remove());
    const wrap=document.createElement('div');wrap.className='mvisit-route-result';
    wrap.innerHTML=`<span>Suggested order</span><ol>${result.order.map(x=>`<li>${esc(x.profile.name)}<br><small>${esc(x.address)}</small></li>`).join('')}</ol><div class="mtravel-summary"><div><span>Round trip</span><strong>${result.miles.toFixed(1)} mi</strong></div><div><span>Driving</span><strong>${result.minutes} min</strong></div></div><a class="mtravel-primary mtravel-route-link" href="${esc(routeUrl(result.order))}" target="_blank" rel="noopener">${d.mapApp==='waze'&&result.order.length>1?'Open first leg in Waze':'Open route in '+(d.mapApp==='waze'?'Waze':'Google Maps')}</a>${d.mapApp==='waze'&&result.order.length>1?'<p class="mtravel-note">Waze opens the first stop. Milos keeps the remaining visit order listed above.</p>':''}`;
    form.after(wrap);
  }

  document.addEventListener('click',event=>{
    const mapTarget=event.target.closest&&event.target.closest('[data-mvisit-map]');
    if(mapTarget){const url=destinationUrl(mapTarget.dataset.mvisitMap);if(url)window.open(url,'_blank','noopener');return;}
    if(event.target.closest&&event.target.closest('[data-mvisit-download-mileage]')){downloadMileage();return;}
    setTimeout(patchAll,0);
  },true);

  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target?.matches?.('.mvisit-map-location')){event.preventDefault();const url=destinationUrl(event.target.dataset.mvisitMap);if(url)window.open(url,'_blank','noopener');}
  },true);

  document.addEventListener('change',event=>{
    if(event.target?.matches?.('[data-mtravel-form="route"] input[name="date"], [data-mtravel-route-date]'))setTimeout(patchRouteChoices,0);
    setTimeout(patchAll,0);
  },true);

  document.addEventListener('submit',event=>{
    const learnerForm=event.target.closest&&event.target.closest('form[data-form="learner"]');
    if(learnerForm){
      const id=clean(learnerForm.elements.profileId?.value,120),name=clean(learnerForm.elements.name?.value,100),mentor=clean(learnerForm.elements.milosMentorName?.value,120),address=clean(learnerForm.elements.milosPermanentAddress?.value,300),beforeIds=new Set(profiles().map(p=>p.id));
      if(id)saveReference(id,mentor,address);else setTimeout(()=>{const created=profiles().find(p=>!beforeIds.has(p.id))||profiles().find(p=>clean(p.name,100)===name)||profiles()[0];if(created)saveReference(created.id,mentor,address);patchAll();},50);
      setTimeout(patchAll,0);return;
    }
    const travelForm=event.target.closest&&event.target.closest('[data-mtravel-form]');if(!travelForm)return;
    const kind=travelForm.dataset.mtravelForm;if(kind!=='mileage'&&kind!=='route')return;
    event.preventDefault();event.stopImmediatePropagation();if(state.busy)return;state.busy=true;
    (async()=>{try{if(kind==='mileage'){toast('Calculating visit mileage…');await handleMileage(travelForm);}else{toast('Calculating the suggested road route…');await handleRoute(travelForm);}}catch(err){toast(err?.message||'Travel calculation failed.',true);}finally{state.busy=false;}})();
  },true);

  ensureStyle();patchAll();
  window.MilosVisitAddress=Object.freeze({version:VERSION,patch:patchAll,destinationUrl,profileAddress,observer:false});
})();
