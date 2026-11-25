/* YOMAK v16: weather/rates/gold come from a shared server-side cache refreshed hourly (with fallbacks);
   the browser only calls the free APIs directly when the cache is missing or older than 3 hours. */
(function(){
const MAX=3*3600*1000;let cache=null,cts=0,inflight=null;
async function getCache(){
  if(cache&&Date.now()-cts<120000)return cache;
  if(inflight)return inflight;
  inflight=(async()=>{try{
    const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);
    const r=await fetch(SB_URL+"/rest/v1/market_cache?select=id,data,source,fetched_at",{signal:c.signal,cache:"no-store",headers:{apikey:SB_KEY}});clearTimeout(t);
    if(!r.ok)throw 0;const rows=await r.json(),m={};rows.forEach(x=>m[x.id]=x);cache=m;cts=Date.now();return m}catch(e){return null}finally{inflight=null}})();
  return inflight}
const fresh=x=>x&&x.data&&Date.now()-Date.parse(x.fetched_at)<MAX;
function wrap(name,key,apply){const orig=window[name];if(typeof orig!=="function")return;
  window[name]=async function(){const m=await getCache(),x=m&&m[key];
    if(fresh(x)){try{if(apply(x)!==false)return}catch(e){}}
    return orig.apply(this,arguments)}}
wrap("lvRates","rates",x=>{const v=x.data;if(!(v.usdEgp>0&&v.usdSar>0))return false;LV.rates={ts:Date.parse(x.fetched_at),usdEgp:v.usdEgp,usdSar:v.usdSar,src:x.source+" (خادم يومك)",upd:v.upd||0}});
wrap("lvGold","gold",x=>{const v=x.data;if(!(v.oz>0))return false;LV.gold={ts:Date.parse(x.fetched_at),oz:v.oz,src:x.source+" (خادم يومك)",upd:v.upd||0}});
wrap("lvWeather","weather",x=>{const items=(x.data.items||[]);if(!items.length)return false;
  const sa="SA"===d.country,want=sa?["الرياض","القاهرة"]:["القاهرة","الرياض"];
  // the user's own place is used from the cache only when it is one of the cached cities; otherwise the direct call handles it
  let me=null;try{me=coords()}catch(e){}
  const near=me&&items.find(i=>Math.abs(i.lat-me.lat)<.3&&Math.abs(i.lng-me.lng)<.3);
  if(me&&!near)return false;
  const pick=[];if(near)pick.push(near);want.forEach(n=>{const i=items.find(z=>z.name===n);if(i&&!pick.includes(i))pick.push(i)});
  if(!pick.length)return false;
  LV.weather={ts:Date.parse(x.fetched_at),items:pick.map(i=>({name:i.name,temp:i.temp,min:i.min,max:i.max,code:i.code,hum:i.hum,wind:i.wind}))}});
})();
