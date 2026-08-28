(()=>{
  'use strict';
  const C=window.MilosCore;
  if(!C||!window.document)return;

  const VERSION='2.54';
  const GEO_VERSION='2.54-postcode-first';
  const STORE_KEY='milos-travel-v1';
  const BOOKING_KEY='milos-calendar-bookings-v1';
  const state={busy:false,lastMileage:null,lastRoute:null};

  function clean(value,max=500){return C.cleanText?C.cleanText(value,max):String(value==null?'':value).trim().slice(0,max);}
  function esc(value){return C.escapeHtml?C.escapeHtml(value):String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));}
  function readTravel(){try{const raw=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');return Object.assign({baseAddress:'',base:null,mapApp:'google',mileageRate:'',sites:{},dailyMileage:{},bookingLocations:{}},raw||{});}catch(_){return{baseAddress:'',base:null,mapApp:'google',mileageRate:'',sites:{},dailyMileage:{},bookingLocations:{}};}}
  function writeTravel(data){localStorage.setItem(STORE_KEY,JSON.stringify(data));return data;}
  function bookings(){try{const rows=JSON.parse(localStorage.getItem(BOOKING_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch(_){return[];}}
  function profiles(){return C.getProfiles?C.getProfiles():[];}
  function profile(id){return C.getProfile?C.getProfile(id):profiles().find(item=>item.id===id)||null;}
  function bookingAddress(booking){return clean(booking&&booking.location,300);}
  function isCalendarVisit(booking){return !!(booking&&booking.date&&booking.profileId&&bookingAddress(booking));}
  function normaliseAddress(value){return clean(value,300).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function ukPostcode(value){const match=clean(value,300).toUpperCase().match(/\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i);if(!match)return'';return match[0].replace(/\s+/g,'');}
  function siteKey(value){const postcode=ukPostcode(value);return postcode?`postcode:${postcode}`:`address:${normaliseAddress(value)}`;}
  function dateText(key){const d=new Date(`${key}T12:00:00`);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):key;}
  function toast(message,error){let el=document.getElementById('msameToast');if(!el){el=document.createElement('div');el.id='msameToast';el.className='mvisit-toast';document.body.appendChild(el);}el.textContent=message;el.classList.toggle('is-error',!!error);el.classList.add('is-visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('is-visible'),3200);}
  function currentGeoVersion(){return window.MilosTravel?.geocodeVersion||GEO_VERSION;}
  function freshLocation(value){return !!(value&&Number.isFinite(Number(value.lat))&&Number.isFinite(Number(value.lon))&&value.geocodeVersion===currentGeoVersion());}

  async function ensureBase(d){
    if(!d.baseAddress&&!d.base)throw new Error('Set and calculate your base address first.');
    if(freshLocation(d.base))return d.base;
    if(!d.baseAddress)throw new Error('Open Travel > Profile and save your base address again.');
    const api=window.MilosTravel;if(!api||typeof api.geocode!=='function')throw new Error('Road address lookup is not ready.');
    const point=await api.geocode(d.baseAddress),base={address:d.baseAddress,lat:Number(point.lat),lon:Number(point.lon),displayName:clean(point.displayName||d.baseAddress,300),precision:point.precision||'',postcode:point.postcode||ukPostcode(d.baseAddress),geocodeVersion:point.geocodeVersion||currentGeoVersion(),calculatedAt:Date.now()};
    d.base=base;writeTravel(d);return base;
  }

  function groupBookings(rows){
    const groups=new Map();
    rows.forEach(booking=>{
      const address=bookingAddress(booking),p=profile(booking.profileId),key=siteKey(address);
      if(!address||!p||!key)return;
      let group=groups.get(key);
      if(!group){group={key,address,bookings:[],profiles:[],names:[]};groups.set(key,group);}
      group.bookings.push(booking);
      if(!group.profiles.some(item=>item.id===p.id))group.profiles.push(p);
      if(!group.names.includes(p.name))group.names.push(p.name);
    });
    return [...groups.values()];
  }

  async function locateGroup(group){
    const api=window.MilosTravel;if(!api||typeof api.geocode!=='function')throw new Error('Road address lookup is not ready.');
    const d=readTravel(),booking=group.bookings[0],p=group.profiles[0],address=group.address,bookingId=booking&&booking.id,profileId=p&&p.id,shared=group.profiles.length>1;
    const cached=d.bookingLocations&&bookingId?d.bookingLocations[bookingId]:null,site=d.sites&&profileId?d.sites[profileId]:null;
    if(!shared&&cached&&siteKey(cached.address)===group.key&&freshLocation(cached))return Object.assign({},cached,{address});
    if(!shared&&site&&siteKey(site.address)===group.key&&freshLocation(site))return Object.assign({},site,{address});
    const point=await api.geocode(address),located={address,lat:Number(point.lat),lon:Number(point.lon),displayName:clean(point.displayName||address,300),precision:point.precision||'',postcode:point.postcode||ukPostcode(address),geocodeVersion:point.geocodeVersion||currentGeoVersion(),calculatedAt:Date.now()};
    d.bookingLocations=d.bookingLocations||{};
    group.bookings.forEach(item=>{if(item.id)d.bookingLocations[item.id]=located;});
    writeTravel(d);
    return located;
  }

  function haversine(a,b){if(!a||!b)return Infinity;const R=3958.7613,toRad=x=>x*Math.PI/180,dLat=toRad(Number(b.lat)-Number(a.lat)),dLon=toRad(Number(b.lon)-Number(a.lon)),la1=toRad(Number(a.lat)),la2=toRad(Number(b.lat));const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
  function optimise(base,stops){const remaining=[...stops],order=[];let current=base;while(remaining.length){let best=0,bestDistance=Infinity;remaining.forEach((item,index)=>{const distance=haversine(current,item.site);if(distance<bestDistance){bestDistance=distance;best=index;}});const next=remaining.splice(best,1)[0];order.push(next);current=next.site;}return order;}

  function renderMileage(form,result,rate){
    const body=form.closest('.mtravel-body');if(!body)return;
    body.querySelectorAll('.mvisit-mileage-result,.msame-mileage-result').forEach(el=>el.remove());
    const wrap=document.createElement('div');wrap.className='msame-mileage-result';
    wrap.innerHTML=`<div class="mtravel-summary"><div><span>Total business miles</span><strong>${result.total.toFixed(1)}</strong></div>${rate?`<div><span>At £${rate.toFixed(2)}/mile</span><strong>£${(result.total*rate).toFixed(2)}</strong></div>`:''}</div><div class="mtravel-day-list">${result.days.map(day=>`<div><strong>${esc(dateText(day.date))}</strong><span>${esc(day.labels.join(' → '))}</span><b>${day.miles.toFixed(1)} mi</b></div>`).join('')||'<p>No calendar visits with learner addresses were found in this period.</p>'}</div><button class="mtravel-secondary mtravel-download" type="button" data-msame-download>Download mileage CSV</button><p class="mtravel-note">Mileage uses the postcode/address saved on each calendar booking and recalculates the road route from your saved base. Old cached map matches are ignored after this accuracy update.</p>`;
    form.after(wrap);
  }

  function downloadMileage(){
    const result=state.lastMileage;if(!result)return;
    const lines=[['Date','Learners / physical stops','Visit addresses','Business miles','Driving minutes'],...result.days.map(day=>[day.date,day.labels.join(' -> '),day.addresses.join(' -> '),day.miles.toFixed(1),String(day.minutes)])];
    const csv=lines.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`Milos_Mileage_${result.from}_to_${result.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function calculateMileage(form){
    const data=new FormData(form),from=clean(data.get('from'),20),to=clean(data.get('to'),20),d=readTravel();
    const api=window.MilosTravel;if(!api||typeof api.roadRoute!=='function')throw new Error('Road mileage is not ready.');
    const base=await ensureBase(d);
    const rows=bookings().filter(b=>b.date>=from&&b.date<=to&&isCalendarVisit(b));
    const byDate=new Map();rows.forEach(b=>{const list=byDate.get(b.date)||[];list.push(b);byDate.set(b.date,list);});
    const days=[];
    for(const [date,dateRows] of [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
      const groups=groupBookings(dateRows),stops=[];
      for(const group of groups){const site=await locateGroup(group);stops.push({group,site,address:group.address});}
      if(!stops.length)continue;
      const order=optimise(base,stops),route=await api.roadRoute([base,...order.map(item=>item.site),base]);
      const day={date,labels:order.map(item=>item.group.names.join(' + ')),names:order.flatMap(item=>item.group.names),addresses:order.map(item=>item.address),miles:Number(route.miles||0),minutes:Number(route.minutes||0),geocodeVersion:currentGeoVersion()};
      days.push(day);d.dailyMileage=d.dailyMileage||{};d.dailyMileage[date]=day;
    }
    writeTravel(d);const total=Math.round(days.reduce((sum,item)=>sum+item.miles,0)*10)/10;state.lastMileage={from,to,days,total};renderMileage(form,state.lastMileage,Number(d.mileageRate||0));toast(`${total.toFixed(1)} business miles calculated.`);
  }

  function routeUrl(order,d){
    const addresses=order.map(item=>item.address).filter(Boolean);if(!addresses.length)return'';
    if(d.mapApp==='waze')return `https://waze.com/ul?q=${encodeURIComponent(addresses[0])}&navigate=yes`;
    const destination=addresses[addresses.length-1],waypoints=addresses.slice(0,-1),origin=clean(d.baseAddress,300);
    return `https://www.google.com/maps/dir/?api=1${origin?`&origin=${encodeURIComponent(origin)}`:''}&destination=${encodeURIComponent(destination)}${waypoints.length?`&waypoints=${encodeURIComponent(waypoints.join('|'))}`:''}&travelmode=driving`;
  }

  function renderRoute(form,result,d){
    const body=form.closest('.mtravel-body');if(!body)return;body.querySelectorAll('.mvisit-route-result,.msame-route-result').forEach(el=>el.remove());
    const wrap=document.createElement('div');wrap.className='msame-route-result mvisit-route-result';
    wrap.innerHTML=`<span>Suggested order</span><ol>${result.order.map(item=>`<li>${esc(item.group.names.join(' + '))}<br><small>${esc(item.address)}</small></li>`).join('')}</ol><div class="mtravel-summary"><div><span>Round trip</span><strong>${result.miles.toFixed(1)} mi</strong></div><div><span>Driving</span><strong>${result.minutes} min</strong></div></div><a class="mtravel-primary mtravel-route-link" href="${esc(routeUrl(result.order,d))}" target="_blank" rel="noopener">${d.mapApp==='waze'&&result.order.length>1?'Open first leg in Waze':'Open route in '+(d.mapApp==='waze'?'Waze':'Google Maps')}</a><p class="mtravel-note">Learners at the same calendar visit address are combined into one stop. Postcodes are resolved before road routing to avoid broad town or street matches.</p>`;
    form.after(wrap);
  }

  async function calculateRoute(form){
    const d=readTravel();const api=window.MilosTravel;if(!api||typeof api.roadRoute!=='function')throw new Error('Road route planning is not ready.');
    const base=await ensureBase(d);
    const checked=[...form.querySelectorAll('input[name="mvisitStops"]:checked')];if(!checked.length)return;
    const fakeBookings=checked.map((input,index)=>({id:clean(input.dataset.bookingId,120)||`route-${index}`,profileId:clean(input.dataset.profileId,120),location:clean(input.dataset.address,300)}));
    const groups=groupBookings(fakeBookings),stops=[];
    for(const group of groups){const site=await locateGroup(group);stops.push({group,site,address:group.address});}
    if(!stops.length)throw new Error('Selected calendar visits need an address.');
    const order=optimise(base,stops),route=await api.roadRoute([base,...order.map(item=>item.site),base]);state.lastRoute={order,miles:Number(route.miles||0),minutes:Number(route.minutes||0)};renderRoute(form,state.lastRoute,d);toast(`Suggested route: ${state.lastRoute.miles.toFixed(1)} miles.`);
  }

  document.addEventListener('click',event=>{
    const download=event.target.closest&&event.target.closest('[data-msame-download]');if(download){event.preventDefault();event.stopImmediatePropagation();downloadMileage();}
  },true);

  document.addEventListener('submit',event=>{
    const form=event.target.closest&&event.target.closest('[data-mtravel-form]');if(!form)return;
    const kind=form.dataset.mtravelForm;if(kind!=='mileage'&&kind!=='route')return;
    event.preventDefault();event.stopImmediatePropagation();if(state.busy)return;state.busy=true;
    (async()=>{try{if(kind==='mileage'){toast('Rechecking postcodes and calculating visit mileage…');await calculateMileage(form);}else{toast('Rechecking postcodes and calculating the suggested road route…');await calculateRoute(form);}}catch(err){toast(err&&err.message?err.message:'Travel calculation failed.',true);}finally{state.busy=false;}})();
  },true);

  window.MilosSameSiteMileage=Object.freeze({version:VERSION,siteKey,groupBookings,isCalendarVisit,freshLocation});
})();
