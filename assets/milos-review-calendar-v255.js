(()=>{
  'use strict';
  const C=window.MilosCore;
  if(!C||!window.document)return;

  const VERSION='2.55';
  const BOOKING_KEY='milos-calendar-bookings-v1';
  const CHECKIN_KEY='milos-checkins-v1';
  const state={
    reviewProfileId:'',
    reviewDate:'',
    plannedBooking:null,
    selectedCalendarEvent:null,
    midpoint:{enabled:false,date:'',userEdited:false,profileId:''},
    midpointSavedForReview:'',
    preCompleteReviewId:'',
  };

  const clean=(v,max=500)=>C.cleanText?C.cleanText(v,max):String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,max);
  const esc=v=>C.escapeHtml?C.escapeHtml(v):String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'');return value==null?fallback:value;}catch(_){return fallback;}};
  const writeJson=(key,value)=>{localStorage.setItem(key,JSON.stringify(value));return value;};
  const bookings=()=>{const rows=readJson(BOOKING_KEY,[]);return Array.isArray(rows)?rows:[];};
  const checkins=()=>{const rows=readJson(CHECKIN_KEY,[]);return Array.isArray(rows)?rows:[];};
  const profile=id=>C.getProfile?.(id)||null;
  const validDate=v=>C.validDate?C.validDate(v):(/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):'');
  const uid=prefix=>C.uid?C.uid(prefix):`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  function midpointDate(from,to){
    const a=validDate(from),b=validDate(to);if(!a||!b)return'';
    const start=new Date(`${a}T12:00:00`),end=new Date(`${b}T12:00:00`);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)return'';
    const mid=new Date(start.getTime()+Math.round((end.getTime()-start.getTime())/2));
    return `${mid.getFullYear()}-${String(mid.getMonth()+1).padStart(2,'0')}-${String(mid.getDate()).padStart(2,'0')}`;
  }

  function distanceValue(value){const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*10)/10:0;}
  function distanceLabel(value){const miles=distanceValue(value);return `Distance Booking (${miles % 1===0?miles.toFixed(0):miles.toFixed(1)} miles)`;}

  function updateBookingDistance(pending){
    if(!pending)return;
    const rows=bookings();
    let item=null;
    if(pending.id)item=rows.find(row=>row.id===pending.id)||null;
    if(!item){
      const candidates=rows.filter(row=>row.date===pending.date&&row.time===pending.time&&row.profileId===pending.profileId&&row.type===pending.type);
      item=candidates.sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0))[0]||null;
    }
    if(!item)return;
    if(item.type==='other'){
      item.distanceMiles=distanceValue(pending.distanceMiles);
      item.distanceBooking=true;
      if(!pending.typedTitle||/^Booking(?:\s*·|$)/i.test(item.title||''))item.title=[distanceLabel(item.distanceMiles),item.profileId?profile(item.profileId)?.name:''].filter(Boolean).join(' · ');
    }else{
      delete item.distanceMiles;delete item.distanceBooking;
    }
    item.updatedAt=Date.now();writeJson(BOOKING_KEY,rows);setTimeout(patchCalendar,0);
  }

  function patchBookingForm(form){
    if(!form||form.dataset.v255Distance==='1')return;
    form.dataset.v255Distance='1';
    const type=form.querySelector('select[name="type"]');if(!type)return;
    const option=type.querySelector('option[value="other"]');if(option)option.textContent='Distance Booking (0 miles)';
    const id=clean(form.dataset.bookingId,120),existing=id?bookings().find(row=>row.id===id):null;
    const label=document.createElement('label');label.className='mcal-distance-field';label.innerHTML=`<span>Distance miles</span><input name="distanceMiles" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(existing?.distanceMiles??0)}" aria-label="Distance booking miles"><small>Use this for a mileage-only calendar booking.</small>`;
    const location=form.querySelector('input[name="location"]')?.closest('label');
    if(location)location.insertAdjacentElement('beforebegin',label);else form.querySelector('button[type="submit"]')?.insertAdjacentElement('beforebegin',label);
    const refresh=()=>{const miles=distanceValue(label.querySelector('input')?.value);label.hidden=type.value!=='other';if(option)option.textContent=distanceLabel(miles);};
    type.addEventListener('change',refresh);label.querySelector('input')?.addEventListener('input',refresh);refresh();
  }

  function patchEventRows(){
    document.querySelectorAll('[data-mcal-event][data-mcal-source="booking"]').forEach(button=>{
      const id=button.dataset.mcalEvent,row=bookings().find(item=>item.id===id);if(!row||row.type!=='other')return;
      const small=button.querySelector('small');if(small)small.textContent=[row.time&&row.endTime?`${row.time}–${row.endTime}`:row.time||row.endTime||'',distanceLabel(row.distanceMiles)].filter(Boolean).join(' · ');
      const strong=button.querySelector('strong');if(strong&&/^Booking(?:\s*·|$)/i.test(strong.textContent||''))strong.textContent=[distanceLabel(row.distanceMiles),row.profileId?profile(row.profileId)?.name:''].filter(Boolean).join(' · ');
    });
  }

  function selectedEventFromButton(button){
    const date=clean(button?.dataset?.mcalEventDate,20),id=clean(button?.dataset?.mcalEvent,140),source=clean(button?.dataset?.mcalSource,40);
    if(!date||!id)return null;
    return window.MilosWeekCalendar?.derivedEvents?.(date)?.find(item=>item.id===id&&item.source===source)||null;
  }

  function quickLabel(item){
    if(!item)return'';
    if(item.type==='review')return'Open planned review';
    if(item.type==='observation'||item.type==='witness')return'Open planned observation';
    if(item.type==='meeting')return item.midpointCheckIn?'Open midpoint check-in':'Open meeting notes';
    return'';
  }

  function patchCalendarDetail(){
    const sheet=document.querySelector('#milosCalendarLayer .mcal-detail-sheet');if(!sheet||sheet.dataset.v255Quick==='1')return;
    const item=state.selectedCalendarEvent;if(!item)return;
    sheet.dataset.v255Quick='1';
    const heading=sheet.querySelector('header small');
    if(item.type==='other'&&heading)heading.textContent=distanceLabel(item.distanceMiles).toUpperCase();
    const label=quickLabel(item);if(!label||(!item.profileId&&item.type!=='meeting'))return;
    const actions=sheet.querySelector('.mcal-detail-actions');if(!actions)return;
    const button=document.createElement('button');button.type='button';button.className='mcal-primary-action mcal-quick-access';button.dataset.mcalQuick=item.type;button.textContent=label;actions.insertBefore(button,actions.firstChild);
  }

  function patchCalendar(){
    document.querySelectorAll('form[data-mcal-form]').forEach(patchBookingForm);patchEventRows();patchCalendarDetail();
  }

  function closeCalendar(){const layer=document.getElementById('milosCalendarLayer');if(layer){layer.hidden=true;layer.innerHTML='';}}
  function dispatchAppAction(action,profileId){
    const app=document.getElementById('milosApp');if(!app||!profileId)return;
    closeCalendar();
    const button=document.createElement('button');button.type='button';button.hidden=true;button.dataset.action=action;button.dataset.id=profileId;app.appendChild(button);button.click();button.remove();
  }

  function wellbeingSequence(p){const coach=C.coachFor?.(p)||C.latestSnapshot?.(p)?.coach||{};return String(coach?.wb?.s||'').replace(/[^123]/g,'').slice(-40);}
  function patchWellbeing(){
    const form=document.querySelector('form[data-form="review-support"]');if(!form||form.dataset.v255Wellbeing==='1')return;
    form.dataset.v255Wellbeing='1';const p=profile(state.reviewProfileId);const seq=wellbeingSequence(p);
    const field=form.querySelector('textarea[name="wellbeing"]')?.closest('label');if(!field)return;
    const box=document.createElement('section');box.className='milos-evia-wellbeing-history';
    const chips=seq?[...seq].map(value=>`<span class="is-${value}" title="${value==='3'?'Positive':value==='2'?'Okay':'Low'}">${value==='3'?'😊':value==='2'?'😐':'☹️'}</span>`).join(''):'<em>No wellbeing check-ins were included in the latest Evia progress data.</em>';
    box.innerHTML=`<div><strong>Evia wellbeing history since last review</strong><small>${seq?`${seq.length} check-in${seq.length===1?'':'s'} from the latest Evia scan`:'Reference only'}</small></div><div class="milos-evia-wellbeing-chips">${chips}</div><p>Reference only. Milos does not write or infer the review wellbeing statement from these results.</p>`;
    field.insertAdjacentElement('beforebegin',box);
  }

  function patchMidpoint(){
    const form=document.querySelector('form[data-form="review-targets"]');if(!form||form.dataset.v255Midpoint==='1')return;
    form.dataset.v255Midpoint='1';
    const next=form.querySelector('input[name="nextReviewDate"]');if(!next)return;
    const current=new Date(),todayDate=`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`,currentDate=validDate(state.reviewDate)||todayDate;
    if(!state.midpoint.date)state.midpoint.date=midpointDate(currentDate,next.value);
    state.midpoint.profileId=state.reviewProfileId||state.midpoint.profileId;
    const box=document.createElement('section');box.className='milos-midpoint-option';
    box.innerHTML=`<label class="milos-midpoint-toggle"><input type="checkbox" name="midpointCheckinEnabled"${state.midpoint.enabled?' checked':''}><span><strong>Schedule a midpoint check-in</strong><small>A short check-in between this review and the next review.</small></span></label><label class="milos-field milos-midpoint-date"${state.midpoint.enabled?'':' hidden'}><span>Midpoint check-in date</span><input name="midpointCheckinDate" type="date" value="${esc(state.midpoint.date||'')}"></label><p class="milos-midpoint-note"${state.midpoint.enabled?'':' hidden'}>The date is set halfway between the current and next review. You can change it.</p>`;
    next.closest('label')?.insertAdjacentElement('afterend',box);
    const toggle=box.querySelector('[name="midpointCheckinEnabled"]'),date=box.querySelector('[name="midpointCheckinDate"]'),dateLabel=box.querySelector('.milos-midpoint-date'),note=box.querySelector('.milos-midpoint-note');
    const show=()=>{state.midpoint.enabled=!!toggle.checked;dateLabel.hidden=!toggle.checked;note.hidden=!toggle.checked;date.required=!!toggle.checked;if(toggle.checked&&!date.value){date.value=midpointDate(currentDate,next.value);state.midpoint.date=date.value;}};
    toggle.addEventListener('change',show);
    next.addEventListener('change',()=>{if(!state.midpoint.userEdited){state.midpoint.date=midpointDate(currentDate,next.value);date.value=state.midpoint.date;}});
    date.addEventListener('change',()=>{state.midpoint.userEdited=true;state.midpoint.date=validDate(date.value);});show();
  }

  function upsertMidpointBooking(review,date){
    const p=profile(review.profileId);if(!p||!date)return;
    const rows=bookings(),id=`midpoint-checkin-${review.id}`,index=rows.findIndex(row=>row.id===id),now=Date.now();
    const previous=index>=0?rows[index]:{};
    const item=Object.assign({},previous,{id,date,time:previous.time||'',endTime:previous.endTime||'',type:'meeting',profileId:review.profileId,title:`Midpoint check-in · ${p.name}`,location:previous.location||review.location||'',note:previous.note||'Midpoint check-in between progress reviews',midpointCheckIn:true,sourceReviewId:review.id,createdAt:previous.createdAt||now,updatedAt:now});
    if(index>=0)rows[index]=item;else rows.push(item);writeJson(BOOKING_KEY,rows);
  }

  function saveMidpointOnLatestReview(){
    const profileId=state.midpoint.profileId||state.reviewProfileId;if(!profileId||!state.midpoint.enabled||!state.midpoint.date)return;
    const latest=C.reviewsForProfile?.(profileId)?.[0];if(!latest||latest.id===state.preCompleteReviewId||state.midpointSavedForReview===latest.id)return;
    const next=Object.assign({},latest,{midpointCheckIn:true,midpointCheckInDate:state.midpoint.date});C.saveReview?.(next);upsertMidpointBooking(next,state.midpoint.date);state.midpointSavedForReview=latest.id;setTimeout(patchCalendar,20);
  }

  function scheduleMidpointSave(){let attempts=0;const timer=setInterval(()=>{attempts+=1;const before=state.midpointSavedForReview;saveMidpointOnLatestReview();if(state.midpointSavedForReview&&state.midpointSavedForReview!==before||attempts>24)clearInterval(timer);},180);}

  function checkinForBooking(booking){return checkins().find(item=>item.bookingId===booking.id)||null;}
  function notesLayer(){let el=document.getElementById('milosCheckinLayer');if(!el){el=document.createElement('section');el.id='milosCheckinLayer';el.className='milos-checkin-layer';el.hidden=true;document.body.appendChild(el);}return el;}
  function closeNotes(){const el=notesLayer();el.hidden=true;el.innerHTML='';}
  function openNotes(booking){
    if(!booking)return;const p=profile(booking.profileId),saved=checkinForBooking(booking),title=booking.midpointCheckIn?'Midpoint check-in':'Meeting notes',el=notesLayer();
    el.hidden=false;el.innerHTML=`<div class="milos-checkin-scrim" data-checkin-close></div><div class="milos-checkin-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><small>${booking.midpointCheckIn?'MIDPOINT CHECK-IN':'MEETING'}</small><h2>${esc(p?.name||booking.title||title)}</h2><span>${esc(C.formatDate?.(booking.date,false)||booking.date||'')}</span></div><button type="button" data-checkin-close aria-label="Close">×</button></header><form data-checkin-form data-booking-id="${esc(booking.id)}"><label><span>Notes</span><textarea name="notes" rows="12" placeholder="Add check-in or meeting notes here">${esc(saved?.notes||booking.checkInNotes||'')}</textarea></label><button type="submit">Save notes</button></form></div>`;
  }
  function saveNotes(form){
    const bookingId=clean(form.dataset.bookingId,140),rows=bookings(),booking=rows.find(item=>item.id===bookingId);if(!booking)throw new Error('Calendar booking not found.');
    const notes=clean(form.elements.notes?.value,6000),items=checkins(),existing=items.find(item=>item.bookingId===bookingId),now=Date.now();
    const entry=Object.assign({},existing||{id:uid('checkin'),bookingId,profileId:booking.profileId,date:booking.date,kind:booking.midpointCheckIn?'midpoint':'meeting',createdAt:now},{notes,updatedAt:now});
    const index=items.findIndex(item=>item.bookingId===bookingId);if(index>=0)items[index]=entry;else items.unshift(entry);writeJson(CHECKIN_KEY,items);
    booking.checkInNotes=notes;booking.updatedAt=now;writeJson(BOOKING_KEY,rows);closeNotes();setTimeout(patchCalendar,0);
  }

  function applyPlannedBookingToForms(){
    const booking=state.plannedBooking;if(!booking)return;
    if(booking.type==='review'){
      const form=document.querySelector('form[data-form="review-meeting"]');if(form&&form.dataset.v255Plan!=='1'){
        form.dataset.v255Plan='1';if(form.elements.reviewDate)form.elements.reviewDate.value=booking.date||form.elements.reviewDate.value;if(form.elements.location&&!form.elements.location.value)form.elements.location.value=booking.location||'';
      }
    }
    if(booking.type==='observation'||booking.type==='witness'){
      const form=document.querySelector('form[data-form="observation-record"]');if(form&&form.dataset.v255Plan!=='1'){
        form.dataset.v255Plan='1';if(form.elements.observationDate)form.elements.observationDate.value=booking.date||form.elements.observationDate.value;if(form.elements.location&&!form.elements.location.value)form.elements.location.value=booking.location||'';if(form.elements.startTime&&!form.elements.startTime.value)form.elements.startTime.value=booking.time||'';if(form.elements.endTime&&!form.elements.endTime.value)form.elements.endTime.value=booking.endTime||'';
      }
    }
  }

  function cleanupToasts(){
    const region=document.getElementById('toastRegion');if(!region)return;
    region.querySelectorAll('.app-toast:not([data-v255-cleanup])').forEach(item=>{item.dataset.v255Cleanup='1';setTimeout(()=>{if(item.isConnected)item.remove();},3800);});
  }

  function patchAll(){patchCalendar();patchWellbeing();patchMidpoint();applyPlannedBookingToForms();cleanupToasts();}

  document.addEventListener('click',event=>{
    const start=event.target.closest?.('[data-action="start-review"][data-id]');if(start){state.reviewProfileId=clean(start.dataset.id,120);state.reviewDate='';state.midpoint={enabled:false,date:'',userEdited:false,profileId:state.reviewProfileId};state.plannedBooking=state.plannedBooking?.profileId===state.reviewProfileId?state.plannedBooking:null;}
    const calEvent=event.target.closest?.('[data-mcal-event]');if(calEvent)state.selectedCalendarEvent=selectedEventFromButton(calEvent);
    const quick=event.target.closest?.('[data-mcal-quick]');if(quick){event.preventDefault();event.stopImmediatePropagation();const item=state.selectedCalendarEvent;if(!item)return;if(item.type==='review'){state.plannedBooking=item;state.reviewProfileId=item.profileId;state.midpoint={enabled:false,date:'',userEdited:false,profileId:item.profileId};dispatchAppAction('start-review',item.profileId);}else if(item.type==='observation'||item.type==='witness'){state.plannedBooking=item;dispatchAppAction('start-observation',item.profileId);}else if(item.type==='meeting'){closeCalendar();openNotes(item);}return;}
    if(event.target.closest?.('[data-checkin-close]')){event.preventDefault();closeNotes();return;}
    const complete=event.target.closest?.('[data-action="review-complete"]');if(complete&&state.midpoint.enabled){state.preCompleteReviewId=C.reviewsForProfile?.(state.midpoint.profileId||state.reviewProfileId)?.[0]?.id||'';scheduleMidpointSave();}
  },true);

  document.addEventListener('submit',event=>{
    const calForm=event.target.closest?.('form[data-mcal-form]');if(calForm){
      const data=new FormData(calForm),pending={id:clean(calForm.dataset.bookingId,120),date:clean(data.get('date'),20),time:clean(data.get('time'),10),profileId:clean(data.get('profileId'),120),type:clean(data.get('type'),30)||'other',typedTitle:clean(data.get('title'),120),distanceMiles:distanceValue(data.get('distanceMiles'))};setTimeout(()=>updateBookingDistance(pending),30);
    }
    const meetingForm=event.target.closest?.('form[data-form="review-meeting"]');if(meetingForm){state.reviewDate=validDate(meetingForm.querySelector('[name="reviewDate"]')?.value)||state.reviewDate;}
    const targetForm=event.target.closest?.('form[data-form="review-targets"]');if(targetForm){
      const enabled=!!targetForm.querySelector('[name="midpointCheckinEnabled"]')?.checked,date=validDate(targetForm.querySelector('[name="midpointCheckinDate"]')?.value);state.midpoint.enabled=enabled;state.midpoint.date=enabled?date:'';state.midpoint.profileId=state.reviewProfileId;
    }
    const checkinForm=event.target.closest?.('form[data-checkin-form]');if(checkinForm){event.preventDefault();event.stopImmediatePropagation();try{saveNotes(checkinForm);}catch(err){alert(err?.message||'Notes could not be saved.');}}
  },true);

  document.addEventListener('change',event=>{
    if(event.target?.matches?.('form[data-mcal-form] select[name="type"]'))setTimeout(patchCalendar,0);
  },true);

  const observer=new MutationObserver(()=>patchAll());observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(patchAll,0),{once:true});else setTimeout(patchAll,0);
  window.MilosReviewCalendar255=Object.freeze({version:VERSION,midpointDate,distanceLabel,wellbeingSequence,openNotes});
})();
