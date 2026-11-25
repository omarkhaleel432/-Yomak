/* YOMAK v15: morning summary + daily reminder + phone push (push needs sql/2026-11-25-push.sql + functions/push + VAPID key) */
(function(){
const YK_VAPID="";  // public VAPID key, filled in when push is switched on
const LS="yomak_morning";
const cfg=()=>{try{const c=JSON.parse(localStorage.getItem(LS));return{on:!(c&&c.on===false),min:Number.isFinite(c&&c.min)?c.min:450,push:!!(c&&c.push)}}catch(e){return{on:true,min:450,push:false}}};
const setCfg=o=>{try{localStorage.setItem(LS,JSON.stringify({...cfg(),...o}))}catch(e){}};
const hm=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
function summary(){
  const k=todayKey(),ts=tasksOn(k),done=ts.filter(t=>t.done[k]).length,ev=eventsOn(k);
  let hb="";try{const hs=d.habits||[];if(hs.length)hb=an(hs.filter(h=>h.checks&&h.checks[k]).length)+"/"+an(hs.length)}catch(e){}
  let pr="";try{const p=nextPrayer();pr=p.name+" "+fmtTime(hhmm(p.at))}catch(e){}
  const w=LV&&LV.weather&&LV.weather.items&&LV.weather.items[0],g=LV&&LV.gold,r=LV&&LV.rates,sa="SA"===d.country;
  return{k,tasks:ts,done,ev,hb,pr,w,g,r,sa}}
function line(s){const a=[];
  if(s.w)a.push(an(Math.round(s.w.temp))+"° "+s.w.name+(s.w.max!=null?" (الكبرى "+an(Math.round(s.w.max))+"°)":""));
  if(s.g&&s.r){const rate=s.sa?s.r.usdSar:s.r.usdEgp;a.push("ذهب ٢١: "+cash(Math.round(21*lvPerG(s.g.oz,rate)/24),s.sa?"SAR":"EGP"))}
  if(s.r)a.push("$١ = "+cash(Math.round(100*(s.sa?s.r.usdSar:s.r.usdEgp))/100,s.sa?"SAR":"EGP"));
  return a.join(" · ")}
function card(){const s=summary();if(!cfg().on)return"";
  setTimeout(()=>{try{lvEnsure(!1)}catch(e){}},200);
  return '<div id="mcard" class="card" style="background:linear-gradient(135deg,#155b50,#123c3a);color:#fff"><div class="hello2">☀️ ملخص يومك</div><div style="margin:8px 0;font-size:14px;line-height:1.9">'+
   '<div>🕌 الصلاة القادمة: <b>'+esc(s.pr||"-")+'</b></div>'+
   '<div>✅ مهام النهاردة: <b>'+an(s.done)+'/'+an(s.tasks.length)+'</b>'+(s.ev.length?' · 📅 مواعيد: <b>'+an(s.ev.length)+'</b>':"")+(s.hb?' · 🔥 عادات: <b>'+s.hb+'</b>':"")+'</div>'+
   '<div>'+(line(s)?esc(line(s)):"🌤️ جاري تحميل الطقس والأسعار…")+'</div></div>'+
   (s.tasks.filter(t=>!t.done[s.k]).slice(0,3).map(t=>'<div style="font-size:13px;opacity:.9">▫️ '+esc(t.title)+(t.time?" · "+fmtTime(t.time):"")+'</div>').join(""))+
   '<button class="secondary" style="margin-top:8px;background:#ffffff22;color:#fff" onclick="openPage(\'settings\')">⚙️ إعدادات التنبيه الصباحي</button></div>'}
const _fh=window.feedHome;
if(typeof _fh==="function")window.feedHome=function(){const h=_fh.apply(this,arguments);return (cs()||d.name)?card()+h:h};
/* in-app morning reminder (fires once a day when the app is open after the chosen time) */
if(typeof alertSources!=="undefined")alertSources.push((e,k,m)=>{const c=cfg();if(!c.on||m<c.min||m>c.min+300)return[];
  const s=summary();const t=["مهام: "+s.done+"/"+s.tasks.length,s.pr?"الصلاة القادمة "+s.pr:"",line(s)].filter(Boolean).join(" · ");
  return[{key:"morning:"+k,icon:"☀️",title:"صباح الخير يا "+d.name,text:t}]});
/* settings card */
window.ykMorning=function(){const on=!!(document.getElementById("mOn")||{}).checked,t=(document.getElementById("mTime")||{}).value||"07:30";const p=t.split(":").map(Number);
  setCfg({on,min:(p[0]||0)*60+(p[1]||0)});msg("تم الحفظ");ykPushSync()};
function b64(u){const p="=".repeat((4-u.length%4)%4),s=(u+p).replace(/-/g,"+").replace(/_/g,"/"),r=atob(s);return Uint8Array.from([...r].map(c=>c.charCodeAt(0)))}
async function ykPushSync(){try{if(!cs()||!cfg().push)return;const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();if(!sub)return;const j=sub.toJSON();
  await sb("/rest/v1/push_subscriptions?on_conflict=endpoint",{method:"POST",prefer:"resolution=merge-duplicates",body:{endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth,tz_offset:new Date().getTimezoneOffset(),morning_min:cfg().min,morning_on:cfg().on,country:d.country==="SA"?"SA":"EG"}})}catch(e){}}
window.ykPushOn=async function(){
  if(!cs()){msg("سجّل الدخول الأول");return}
  if(!YK_VAPID){msg("إشعارات الموبايل لسه ما اتفعلتش من السيرفر");return}
  if(!("serviceWorker"in navigator)||!("PushManager"in window)){msg("المتصفح ده مش بيدعم الإشعارات. على الآيفون: أضف التطبيق للشاشة الرئيسية الأول");return}
  try{const perm=await Notification.requestPermission();if(perm!=="granted"){msg("لم يتم السماح بالإشعارات");return}
    const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(YK_VAPID)});
    setCfg({push:true});await ykPushSync();msg("تم تفعيل إشعارات الموبايل ✅");refresh()}catch(e){msg("تعذر التفعيل: "+((e&&e.message)||"").slice(0,70))}};
window.ykPushOff=async function(){try{const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
  if(sub){const ep=sub.endpoint;await sub.unsubscribe();if(cs())await sb("/rest/v1/push_subscriptions?endpoint=eq."+encodeURIComponent(ep),{method:"DELETE"})}}catch(e){}
  setCfg({push:false});msg("تم إيقاف إشعارات الموبايل");refresh()};
if(typeof PAGES!=="undefined"&&PAGES.settings){const _r=PAGES.settings.render;
  PAGES.settings.render=function(){const c=cfg();
    return _r.apply(this,arguments)+'<div class="card"><b>☀️ الملخص الصباحي</b><p class="muted">ملخص يومك (مهام، صلاة، طقس، ذهب، عملة) في أول الرئيسية، وتنبيه كل صباح.</p>'+
     '<label class="chkrow"><input type="checkbox" id="mOn" '+(c.on?"checked":"")+'> تفعيل الملخص والتنبيه الصباحي</label>'+
     '<label class="lbl" for="mTime">وقت التنبيه</label><input type="time" id="mTime" class="input" value="'+hm(c.min)+'">'+
     '<button class="secondary" onclick="ykMorning()">حفظ</button>'+
     '<p class="muted" style="margin-top:10px">إشعارات الموبايل (تصلك حتى والتطبيق مقفول، وفيها رسائلك الخاصة):</p>'+
     (c.push?'<button class="secondary" onclick="ykPushOff()">إيقاف إشعارات الموبايل</button>':'<button class="primary" onclick="ykPushOn()">🔔 تفعيل إشعارات الموبايل</button>')+
     '<p class="muted" style="font-size:11px">على الآيفون: لازم تضيف التطبيق للشاشة الرئيسية من متصفح Safari الأول.</p></div>'}}
/* hourly refresh of weather, rates and gold while the app is open; the shown numbers update when they change */
try{LV_TTL.weather=36e5;LV_TTL.rates=36e5;LV_TTL.gold=36e5}catch(e){}
const _rd=window.lvRedraw;
if(typeof _rd==="function")window.lvRedraw=function(){_rd.apply(this,arguments);const c=document.getElementById("mcard");if(c&&cfg().on){const t=document.createElement("div");t.innerHTML=card();if(t.firstChild)c.outerHTML=t.firstChild.outerHTML}};
const tick=()=>{if(document.hidden||!d.name)return;try{lvEnsure(!1)}catch(e){}};
setInterval(tick,5*60*1000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)tick()});
setTimeout(ykPushSync,4000);
})();
