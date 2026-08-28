(()=>{
  'use strict';
  const C=window.MilosCore;
  if(!C||!window.document)return;
  const VERSION='2.54';
  const PROFILE_KEY='milos-learner-profiles-v1';
  const state={profileId:'',returnFocus:null};

  const clean=(v,max=500)=>C.cleanText?C.cleanText(v,max):String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,max);
  const esc=v=>C.escapeHtml?C.escapeHtml(v):String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
  const int=(v,fallback=0)=>Math.max(0,Math.round(num(v,fallback)));
  const dateFromMs=ms=>{const d=new Date(Number(ms)||0);return Number.isFinite(d.getTime())&&Number(ms)>0?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';};
  const msFromDate=value=>{const v=clean(value,20);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return 0;const d=new Date(`${v}T12:00:00`);return Number.isFinite(d.getTime())?d.getTime():0;};
  const datetimeFromMs=ms=>{const d=new Date(Number(ms)||0);if(!Number.isFinite(d.getTime())||!Number(ms))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
  const msFromDatetime=value=>{const d=new Date(String(value||''));return Number.isFinite(d.getTime())?d.getTime():Date.now();};
  const field=(label,name,value='',type='text',attrs='')=>`<label class="mevia-field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs}></label>`;
  const numberField=(label,name,value='',attrs='')=>field(label,name,value,'number',`inputmode="decimal" ${attrs}`);
  const area=(label,name,value='',rows=3,placeholder='')=>`<label class="mevia-field mevia-wide"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;

  function profile(id){return C.getProfile?C.getProfile(id):null;}
  function snapshotFor(p){return p&&C.latestSnapshot?C.latestSnapshot(p):null;}
  function coachFor(p){return p&&C.coachFor?C.coachFor(p):snapshotFor(p)?.coach||null;}
  function attendanceFor(p){return p&&C.attendanceFor?C.attendanceFor(p):snapshotFor(p)?.collegeAttendance||null;}
  function linesFromTargets(targets){return (Array.isArray(targets)?targets:[]).map(t=>[t.code||'',t.dueDate||'',t.status||'',t.title||''].join(' | ')).join('\n');}
  function parseTargets(value){return String(value||'').split(/\n+/).map(line=>line.trim()).filter(Boolean).slice(0,12).map(line=>{const parts=line.split('|').map(x=>x.trim());return{code:parts[0]||'',dueDate:parts[1]||'',status:parts[2]||'',title:parts.slice(3).join(' | ')||parts[0]||''};}).filter(t=>t.title);}
  function linesFromConfidence(items){return (Array.isArray(items)?items:[]).map(x=>`${x?.[0]||''} | ${x?.[1]||''}`).join('\n');}
  function parseConfidence(value){return String(value||'').split(/\n+/).map(line=>line.trim()).filter(Boolean).slice(0,5).map(line=>{const [name,rating]=line.split('|').map(x=>x.trim());return[name||'',Math.max(1,Math.min(5,num(rating,1)))];}).filter(x=>x[0]);}

  function injectStyle(){
    if(document.getElementById('milos-manual-evia-v254-style'))return;
    const s=document.createElement('style');s.id='milos-manual-evia-v254-style';s.textContent=`
      .mevia-layer{position:fixed;inset:0;z-index:36000}.mevia-layer[hidden]{display:none!important}.mevia-scrim{position:absolute;inset:0;background:rgba(16,24,38,.42);backdrop-filter:blur(3px)}
      .mevia-sheet{position:absolute;left:0;right:0;bottom:0;max-height:92vh;overflow:auto;background:#f7f9fc;border-radius:24px 24px 0 0;padding:16px 14px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -18px 55px rgba(15,25,42,.22)}
      .mevia-sheet header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:sticky;top:-16px;z-index:3;background:#f7f9fc;padding:16px 0 10px}.mevia-sheet header small{display:block;font-size:10px;font-weight:900;color:#6e7e95;letter-spacing:.08em}.mevia-sheet header h2{margin:2px 0 0;font-size:21px;color:#172238}.mevia-close{width:42px;height:42px;border:0;border-radius:50%;background:#e8edf5;color:#25334a;font-size:26px}
      .mevia-note{margin:0 0 10px;padding:10px 12px;border-radius:14px;background:#eaf2fc;color:#44566e;font-size:12px;line-height:1.45}.mevia-form{display:grid;gap:10px}.mevia-section{border:1px solid rgba(31,49,78,.09);border-radius:16px;background:#fff;overflow:hidden}.mevia-section>summary{cursor:pointer;list-style:none;padding:13px 14px;font-size:13px;font-weight:900;color:#22304a}.mevia-section>summary::-webkit-details-marker{display:none}.mevia-section>summary:after{content:'+';float:right;color:#315485}.mevia-section[open]>summary:after{content:'−'}.mevia-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:0 12px 12px}.mevia-field{display:flex;flex-direction:column;gap:4px;color:#627188;font-size:10px;font-weight:800}.mevia-field input,.mevia-field textarea,.mevia-field select{width:100%;box-sizing:border-box;border:1px solid rgba(31,49,78,.14);border-radius:11px;background:#fff;padding:10px 11px;font:inherit;font-size:15px;color:#182238}.mevia-field textarea{resize:vertical;line-height:1.4}.mevia-wide{grid-column:1/-1}.mevia-check{display:flex;align-items:center;gap:8px;grid-column:1/-1;color:#45566d;font-size:12px}.mevia-check input{width:19px;height:19px}.mevia-save{min-height:50px;border:0;border-radius:14px;background:#315485;color:#fff;font:inherit;font-size:14px;font-weight:900;position:sticky;bottom:0;z-index:2;box-shadow:0 -6px 18px rgba(247,249,252,.95)}
      .mevia-manual-button{border-color:#315485!important;color:#315485!important;background:#fff!important}.mevia-manual-tag{display:inline-block;margin-left:5px;padding:2px 6px;border-radius:999px;background:#eaf2fc;color:#315485;font-size:8px;font-weight:900;letter-spacing:.05em;vertical-align:middle}
      @media(max-width:520px){.mevia-grid{grid-template-columns:1fr}.mevia-wide{grid-column:1}.mevia-sheet{max-height:94vh}}
    `;document.head.appendChild(s);
  }

  function layer(){let el=document.getElementById('milosManualEviaLayer');if(!el){el=document.createElement('section');el.id='milosManualEviaLayer';el.className='mevia-layer';el.hidden=true;document.body.appendChild(el);}return el;}
  function close(){const el=layer();el.hidden=true;el.innerHTML='';const focus=state.returnFocus;state.profileId='';state.returnFocus=null;try{focus&&focus.focus();}catch(_){}}

  function courseSelect(selected){return `<label class="mevia-field mevia-wide"><span>Course / route</span><select name="courseRouteId" required><option value="">Select course</option>${(C.COURSE_ROUTES||[]).map(r=>`<option value="${esc(r.id)}"${r.id===selected?' selected':''}>${esc(r.title)}</option>`).join('')}</select></label>`;}

  function formHtml(p){
    const snap=snapshotFor(p)||{},co=coachFor(p)||{},at=attendanceFor(p)||{},q=co.q||{},cf=co.cf||{},tg=co.tg||{},wb=co.wb||{},u=co.u||{},cc=co.c||{},e=co.e||{},l=co.l||{},period=co.p||{};
    const routeId=p.courseRouteId||snap.courseRouteId||'';
    return `<form class="mevia-form" data-mevia-form>
      <p class="mevia-note">This is the manual equivalent of an Evia progress scan. Every progress field Milos can receive from Evia is editable here. Saving creates a new latest progress snapshot while keeping older scans in history.</p>
      <details class="mevia-section" open><summary>Course identity & progress</summary><div class="mevia-grid">
        ${courseSelect(routeId)}
        ${field('Evia learner reference / shared ID','sharedId',snap.sharedId||'','text','maxlength="80"')}
        ${field('Course start date','startDate',p.startDate||snap.startDate||'','date')}
        ${field('Planned end date','endDate',p.endDate||snap.endDate||'','date')}
        ${numberField(`${(C.routeById?.(routeId)?.learningLabel)||'OTJ / GLH'} hours`,'learningHours',snap.learningHours??0,'step="0.1" min="0"')}
        ${numberField(`${(C.routeById?.(routeId)?.learningLabel)||'OTJ / GLH'} target hours`,'learningTarget',snap.learningTarget??C.routeById?.(routeId)?.learningTarget??0,'step="0.1" min="0"')}
        ${numberField('Evidence record count','evidenceCount',snap.evidenceCount??0,'step="1" min="0"')}
        ${field('Last review reference / date','lastReviewAt',snap.lastReviewAt||'','text','maxlength="40"')}
        ${field('Evia export date/time','exportedAt',datetimeFromMs(snap.exportedAt),'datetime-local')}
        ${area('Completed KSB / AC codes','completedCodes',(snap.completedCodes||[]).join(', '),4,'Comma or space separated codes')}
        ${area('New / changed KSB / AC codes','changedCodes',(snap.changedCodes||[]).join(', '),3,'Codes added since the review baseline')}
        ${area('Current targets','targets',linesFromTargets(snap.targets),5,'One per line: CODE | YYYY-MM-DD | status | target wording')}
      </div></details>

      <details class="mevia-section"><summary>Review period & Evia activity</summary><div class="mevia-grid">
        ${field('Review period ID','periodId',period.i||'')}
        ${field('Review period start','periodStart',dateFromMs(period.s),'date')}
        ${field('Review period end','periodEnd',dateFromMs(period.e),'date')}
        ${numberField('Review period days','periodDays',period.d??0,'step="1" min="0"')}
        ${numberField('Evia sessions','usageSessions',u.s??0,'step="1" min="0"')}
        ${numberField('Active days','usageDays',u.d??0,'step="1" min="0"')}
        ${numberField('Review-period weeks','usageWeeks',u.w??0,'step="1" min="0"')}
        ${numberField('Usage counter','usageCount',u.c??0,'step="1" min="0"')}
        ${numberField('Learning activity counter','usageLearning',u.l??0,'step="1" min="0"')}
        ${numberField('Target activity counter','usageTargets',u.t??0,'step="1" min="0"')}
        ${field('Last Evia activity','usageLast',dateFromMs(u.a),'date')}
      </div></details>

      <details class="mevia-section"><summary>Course coverage & evidence breakdown</summary><div class="mevia-grid">
        ${numberField('Baseline mapped criteria','criteriaBaseline',cc.b??0,'step="1" min="0"')}
        ${numberField('Current mapped criteria','criteriaCurrent',cc.n??0,'step="1" min="0"')}
        ${area('New mapped criteria codes','criteriaNew',(cc.z||[]).join(', '),3,'KSB / AC codes')}
        ${numberField('Evidence submissions','evTotal',e.n??0,'step="1" min="0"')}
        ${numberField('Photos','evPhotos',e.p??0,'step="1" min="0"')}
        ${numberField('Videos','evVideos',e.v??0,'step="1" min="0"')}
        ${numberField('Audio reflections','evAudio',e.a??0,'step="1" min="0"')}
        ${numberField('Written responses','evWritten',e.w??0,'step="1" min="0"')}
        ${numberField('Witness updates','evWitness',e.wi??0,'step="1" min="0"')}
        ${numberField('Assessor observation updates','evAssessor',e.as??0,'step="1" min="0"')}
        ${numberField('Additional OTJ / GLH hours in period','periodLearningHours',l.h??0,'step="0.1" min="0"')}
        ${numberField('New OTJ / GLH entries','periodLearningEntries',l.n??0,'step="1" min="0"')}
        <label class="mevia-field"><span>Learning type</span><select name="periodLearningKind"><option value="OTJ"${l.k==='OTJ'?' selected':''}>OTJ</option><option value="GLH"${l.k==='GLH'?' selected':''}>GLH</option></select></label>
      </div></details>

      <details class="mevia-section"><summary>EPA, Maths & English practice</summary><div class="mevia-grid">
        ${numberField('MCQ attempts','mcqAttempts',q.m?.a??0,'step="1" min="0"')}${numberField('MCQ best %','mcqBest',q.m?.b??0,'step="1" min="0" max="100"')}${numberField('MCQ latest %','mcqLatest',q.m?.l??0,'step="1" min="0" max="100"')}
        ${numberField('Discussion attempts','discussionAttempts',q.d?.a??0,'step="1" min="0"')}${numberField('Discussion best %','discussionBest',q.d?.b??0,'step="1" min="0" max="100"')}${numberField('Discussion latest %','discussionLatest',q.d?.l??0,'step="1" min="0" max="100"')}
        ${numberField('Practical attempts','practicalAttempts',q.p?.a??0,'step="1" min="0"')}${numberField('Practical best %','practicalBest',q.p?.b??0,'step="1" min="0" max="100"')}
        ${numberField('Maths attempts','mathsAttempts',q.fm?.a??0,'step="1" min="0"')}${numberField('Maths score','mathsScore',q.fm?.s??0,'step="1" min="0"')}
        ${numberField('English attempts','englishAttempts',q.fe?.a??0,'step="1" min="0"')}${numberField('English score','englishScore',q.fe?.s??0,'step="1" min="0"')}
      </div></details>

      <details class="mevia-section"><summary>Targets, confidence & wellbeing</summary><div class="mevia-grid">
        ${numberField('Targets completed','targetsDone',tg.d??0,'step="1" min="0"')}${numberField('Targets open','targetsOpen',tg.o??0,'step="1" min="0"')}${numberField('Targets overdue','targetsOverdue',tg.x??0,'step="1" min="0"')}${numberField('Targets total','targetsTotal',tg.n??0,'step="1" min="0"')}
        ${numberField('Baseline confidence / 5','confidenceBaseline',cf.b??'','step="0.1" min="1" max="5"')}${numberField('Current confidence / 5','confidenceCurrent',cf.c??'','step="0.1" min="1" max="5"')}${numberField('Confidence checks','confidenceCount',cf.n??0,'step="1" min="0"')}
        ${area('Lowest confidence areas','confidenceLow',linesFromConfidence(cf.lo),4,'One per line: area | rating 1-5')}
        ${numberField('Wellbeing check-ins','wellbeingCount',wb.n??0,'step="1" min="0"')}${field('Wellbeing ratings sequence','wellbeingSequence',wb.s||'','text','placeholder="e.g. 331233" pattern="[123]*"')}
      </div></details>

      <details class="mevia-section"><summary>Symi college attendance</summary><div class="mevia-grid">
        <label class="mevia-check"><input type="checkbox" name="attendanceExact"${Number(at.x)===1?' checked':''}><span>Exact cumulative attendance is available</span></label>
        ${numberField('Current attendance %','attendancePercent',at.p??'','step="1" min="0" max="100"')}${numberField('Pre-Symi baseline %','attendanceBaseline',at.bp??'','step="1" min="0" max="100"')}${numberField('Since-Symi %','attendanceSince',at.sp??'','step="1" min="0" max="100"')}
        ${numberField('Attended minutes','attendanceMinutes',at.am??0,'step="1" min="0"')}${numberField('Expected minutes','attendanceExpected',at.em??0,'step="1" min="0"')}${numberField('Tracked sessions','attendanceSessions',at.s??0,'step="1" min="0"')}${field('Attendance snapshot date','attendanceDate',at.d||'','date')}
      </div></details>
      <button class="mevia-save" type="submit">Save Evia data manually</button>
    </form>`;
  }

  function open(profileId,trigger){
    const p=profile(profileId);if(!p)return;
    state.profileId=profileId;state.returnFocus=trigger||document.activeElement;const el=layer();el.hidden=false;
    el.innerHTML=`<div class="mevia-scrim" data-mevia-close></div><div class="mevia-sheet" role="dialog" aria-modal="true" aria-label="Manual Evia data"><header><div><small>EVIA DATA</small><h2>${esc(p.name)}</h2></div><button type="button" class="mevia-close" data-mevia-close aria-label="Close">×</button></header>${formHtml(p)}</div>`;
  }

  function value(data,name){return clean(data.get(name),8000);}
  function nullableNumber(data,name){const raw=value(data,name);return raw===''?null:num(raw,0);}
  function rawFrom(form,p){
    const data=new FormData(form),routeId=value(data,'courseRouteId');
    const raw={
      courseRouteId:routeId,sharedId:value(data,'sharedId'),startDate:value(data,'startDate'),endDate:value(data,'endDate'),
      learningHours:num(value(data,'learningHours'),0),learningTarget:num(value(data,'learningTarget'),C.routeById?.(routeId)?.learningTarget||0),
      completedCodes:value(data,'completedCodes'),changedCodes:value(data,'changedCodes'),targets:parseTargets(data.get('targets')),evidenceCount:int(value(data,'evidenceCount'),0),lastReviewAt:value(data,'lastReviewAt'),exportedAt:msFromDatetime(data.get('exportedAt')),
      co:{
        p:{i:value(data,'periodId'),s:msFromDate(data.get('periodStart')),e:msFromDate(data.get('periodEnd')),d:int(value(data,'periodDays'),0)},
        u:{s:int(value(data,'usageSessions'),0),d:int(value(data,'usageDays'),0),w:int(value(data,'usageWeeks'),0),c:int(value(data,'usageCount'),0),l:int(value(data,'usageLearning'),0),t:int(value(data,'usageTargets'),0),a:msFromDate(data.get('usageLast'))},
        c:{b:int(value(data,'criteriaBaseline'),0),n:int(value(data,'criteriaCurrent'),0),z:value(data,'criteriaNew')},
        e:{n:int(value(data,'evTotal'),0),p:int(value(data,'evPhotos'),0),v:int(value(data,'evVideos'),0),a:int(value(data,'evAudio'),0),w:int(value(data,'evWritten'),0),wi:int(value(data,'evWitness'),0),as:int(value(data,'evAssessor'),0)},
        l:{h:num(value(data,'periodLearningHours'),0),n:int(value(data,'periodLearningEntries'),0),k:value(data,'periodLearningKind')||'OTJ'},
        q:{m:{a:int(value(data,'mcqAttempts'),0),b:int(value(data,'mcqBest'),0),l:int(value(data,'mcqLatest'),0)},d:{a:int(value(data,'discussionAttempts'),0),b:int(value(data,'discussionBest'),0),l:int(value(data,'discussionLatest'),0)},p:{a:int(value(data,'practicalAttempts'),0),b:int(value(data,'practicalBest'),0)},fm:{a:int(value(data,'mathsAttempts'),0),s:int(value(data,'mathsScore'),0)},fe:{a:int(value(data,'englishAttempts'),0),s:int(value(data,'englishScore'),0)}},
        tg:{d:int(value(data,'targetsDone'),0),o:int(value(data,'targetsOpen'),0),x:int(value(data,'targetsOverdue'),0),n:int(value(data,'targetsTotal'),0)},
        cf:{b:nullableNumber(data,'confidenceBaseline'),c:nullableNumber(data,'confidenceCurrent'),n:int(value(data,'confidenceCount'),0),lo:parseConfidence(data.get('confidenceLow'))},
        wb:{n:int(value(data,'wellbeingCount'),0),s:value(data,'wellbeingSequence').replace(/[^123]/g,'')},
        at:{x:data.get('attendanceExact')?1:0,p:nullableNumber(data,'attendancePercent'),bp:nullableNumber(data,'attendanceBaseline'),sp:nullableNumber(data,'attendanceSince'),am:int(value(data,'attendanceMinutes'),0),em:int(value(data,'attendanceExpected'),0),s:int(value(data,'attendanceSessions'),0),d:value(data,'attendanceDate')}
      }
    };
    return raw;
  }

  function markManual(profileId){
    try{const list=JSON.parse(localStorage.getItem(PROFILE_KEY)||'[]');if(!Array.isArray(list))return;const i=list.findIndex(x=>x?.id===profileId);if(i<0)return;const xs=Array.isArray(list[i].snapshots)?list[i].snapshots:[];if(xs[0]){xs[0].manualEntry=true;xs[0].manualEditedAt=Date.now();list[i].snapshots=xs;list[i].updatedAt=Date.now();localStorage.setItem(PROFILE_KEY,JSON.stringify(list));}}catch(_){ }
  }

  async function refreshVisible(profileId){
    const p=profile(profileId),snap=snapshotFor(p);if(!p||!snap)return;
    try{
      const course=p.courseRouteId&&C.loadCourse?await C.loadCourse(p.courseRouteId):null;
      const metrics=course&&C.metricsFor?C.metricsFor(p,course):null;
      const cards=[...document.querySelectorAll('.milos-metric')];
      cards.forEach(card=>{const label=card.querySelector('span')?.textContent?.trim()||'',strong=card.querySelector('strong');if(!strong)return;if(label==='TOC')strong.textContent=`${metrics?.toc??C.timeOnCoursePercent?.(p.startDate,p.endDate)??0}%`;else if(label==='KSB'||label==='AC'||label==='Coverage')strong.textContent=metrics?`${metrics.coverage}%`:String(snap.completedCodes?.length||0);else if(label==='OTJ / GLH'||label==='OTJ'||label==='GLH')strong.textContent=`${Number(metrics?.learningHours??snap.learningHours??0).toFixed(1)}h`;else if(label==='Evia QR') {card.querySelector('span').textContent='Evia data';strong.textContent='Manual';}});
      const targetSection=[...document.querySelectorAll('.milos-section-heading span')].find(x=>/Current Evia targets/i.test(x.textContent||''))?.closest('.milos-section');
      if(targetSection){const items=snap.targets||[];const body=items.length?`<div class="milos-target-list">${items.map(t=>`<div><span>${esc(t.code||'Target')}</span><p>${esc(t.title||'')}</p><small>${t.dueDate?`Due ${esc(C.formatDate?.(t.dueDate,false)||t.dueDate)}`:'No due date'}</small></div>`).join('')}</div>`:'<p class="milos-muted">No current targets are recorded.</p>';const head=targetSection.querySelector('.milos-section-heading');if(head){head.querySelector('small').textContent=String(items.length);let node=head.nextElementSibling;while(node){const next=node.nextElementSibling;node.remove();node=next;}head.insertAdjacentHTML('afterend',body);}}
    }catch(_){ }
  }

  function selectedProfileIdFromView(){const b=document.querySelector('[data-action="scan-profile"][data-id]');return clean(b?.dataset?.id,120);}
  function patchButtons(){
    document.querySelectorAll('[data-action="scan-profile"][data-id]').forEach(scan=>{
      const parent=scan.parentElement;if(!parent||parent.querySelector('[data-action="manual-evia"]'))return;
      const b=document.createElement('button');b.type='button';b.className='milos-secondary mevia-manual-button';b.dataset.action='manual-evia';b.dataset.id=scan.dataset.id;b.textContent=snapshotFor(profile(scan.dataset.id))?'Edit Evia data':'Enter Evia data manually';
      if(parent.classList.contains('milos-action-grid'))parent.insertBefore(b,scan.nextSibling);else scan.insertAdjacentElement('afterend',b);
    });
    const view=document.querySelector('.learner-profile-view');if(view){const id=selectedProfileIdFromView(),snap=snapshotFor(profile(id));if(snap?.manualEntry&&!view.querySelector('.mevia-manual-tag')){const course=view.querySelector('.milos-profile-course strong');course?.insertAdjacentHTML('beforeend','<span class="mevia-manual-tag">MANUAL EVIA DATA</span>');}}
  }

  document.addEventListener('click',event=>{
    const manual=event.target.closest?.('[data-action="manual-evia"]');if(manual){event.preventDefault();event.stopImmediatePropagation();open(clean(manual.dataset.id,120),manual);return;}
    if(event.target.closest?.('[data-mevia-close]')){event.preventDefault();close();}
  },true);
  document.addEventListener('submit',event=>{
    const form=event.target.closest?.('[data-mevia-form]');if(!form)return;event.preventDefault();event.stopImmediatePropagation();
    try{const p=profile(state.profileId);if(!p)throw new Error('Learner profile not found.');const raw=rawFrom(form,p);if(!raw.courseRouteId)throw new Error('Select the learner course.');C.attachProgress(state.profileId,raw);markManual(state.profileId);const id=state.profileId;close();refreshVisible(id);setTimeout(patchButtons,30);const region=document.getElementById('toastRegion');if(region){region.innerHTML='<div class="app-toast is-visible" role="status">Manual Evia data saved.</div>';setTimeout(()=>{const t=region.querySelector('.app-toast');t?.classList.remove('is-visible');},2600);}}
    catch(err){const button=form.querySelector('.mevia-save');if(button){const old=button.textContent;button.textContent=err?.message||'Could not save';button.style.background='#a44343';setTimeout(()=>{button.textContent=old;button.style.background='';},2600);}}
  },true);

  function start(){injectStyle();patchButtons();const root=document.getElementById('milosApp')||document.body;new MutationObserver(()=>patchButtons()).observe(root,{childList:true,subtree:true});}
  window.MilosManualEvia=Object.freeze({version:VERSION,open});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,0),{once:true});else setTimeout(start,0);
})();
