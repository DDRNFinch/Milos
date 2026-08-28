(()=>{
'use strict';
const API=window.jspdf?.jsPDF?.API;if(!API||API.__milosOutputBrand253||typeof API.output!=='function')return;
API.__milosOutputBrand253=true;const output=API.output;
API.output=function(){try{window.MilosProfileBrand252?.applyBrand?.(this);}catch(_){}return output.apply(this,arguments);};
window.MilosPdfOutputBrand253=Object.freeze({version:'2.53'});
})();
