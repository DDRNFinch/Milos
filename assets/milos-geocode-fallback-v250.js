(()=>{
  'use strict';
  const api=window.MilosTravel;
  if(!api||typeof api.geocode!=='function')return;

  const VERSION='2.50';

  function clean(value,max=300){
    return String(value==null?'':value).replace(/\s+/g,' ').trim().slice(0,max);
  }

  function ukPostcode(value){
    const match=clean(value,300).toUpperCase().match(/\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i);
    if(!match)return'';
    const compact=match[0].replace(/\s+/g,'');
    return compact.length>3?`${compact.slice(0,-3)} ${compact.slice(-3)}`:compact;
  }

  async function postcodeGeocode(postcode){
    const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&addressdetails=0&postalcode=${encodeURIComponent(postcode)}&country=${encodeURIComponent('United Kingdom')}`;
    const res=await fetch(url,{headers:{'Accept':'application/json','Accept-Language':'en-GB'}});
    if(!res.ok)return null;
    const rows=await res.json(),row=rows&&rows[0];
    if(!row||!Number.isFinite(Number(row.lat))||!Number.isFinite(Number(row.lon)))return null;
    return{lat:Number(row.lat),lon:Number(row.lon),displayName:clean(row.display_name||postcode,300),precision:'postcode'};
  }

  async function geocode(address){
    const q=clean(address,300);
    if(!q)throw new Error('Add an address first.');
    try{
      return await api.geocode(q);
    }catch(originalError){
      const postcode=ukPostcode(q);
      if(postcode){
        try{
          const fallback=await postcodeGeocode(postcode);
          if(fallback)return fallback;
        }catch(_){ }
      }
      const message=clean(originalError&&originalError.message,300);
      if(/lookup is unavailable/i.test(message))throw originalError;
      if(postcode)throw new Error('Milos could not match that site address for mileage. Check the postcode and try again.');
      throw new Error('Milos can open this address in Maps, but needs a recognised UK postcode to calculate mileage.');
    }
  }

  window.MilosTravel=Object.freeze(Object.assign({},api,{version:VERSION,geocode}));
})();
