(()=>{
'use strict';
let selected=null,lastDate='';
function restore(){const form=document.querySelector('[data-mtravel-form="route"]');if(!form||!selected)return;form.querySelectorAll('input[name="mvisitStops"]').forEach(x=>x.checked=selected.has(x.value));}
document.addEventListener('change',e=>{const form=e.target?.closest?.('[data-mtravel-form="route"]');if(!form)return;if(e.target.matches('input[type="date"]')){selected=null;lastDate=e.target.value||'';return;}if(!e.target.matches('input[name="mvisitStops"]'))return;const date=form.elements.date?.value||'';if(!selected||lastDate!==date){selected=new Set([...form.querySelectorAll('input[name="mvisitStops"]:checked')].map(x=>x.value));lastDate=date;}if(e.target.checked)selected.add(e.target.value);else selected.delete(e.target.value);setTimeout(restore,30);},true);
window.MilosRouteSelection252=Object.freeze({version:'2.52'});
})();