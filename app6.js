/* YOMAK v8: 1:1 voice calls (WebRTC, signaling through Supabase table call_signals) */
(function(){
const ICE=[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}].concat(window.YOMAK_TURN||[]);
let rc=null,chan=null,rtClient=null,pollT=null,live=false,call=null,lastSeen=0,authSeen="";
const uuid=()=>crypto.randomUUID();
const C=()=>document.getElementById("callUI");
function ui(html){let e=C();if(!e){e=document.createElement("div");e.id="callUI";e.style.cssText="position:fixed;inset:0;z-index:20;background:#123c3aee;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center";document.body.append(e)}e.innerHTML=html}
function uiClose(){const e=C();if(e)e.remove();const a=document.getElementById("callAudio");if(a)a.remove()}
function btn(label,fn,bg){return `<button onclick="${fn}" style="border:0;border-radius:40px;min-width:110px;min-height:56px;font-size:18px;font-weight:800;color:#fff;background:${bg||"#155b50"};padding:0 22px">${label}</button>`}
function dmInfo(chatId){return (cl.dm||[]).find(x=>String(x.id)===String(chatId))}
function nameOf(uid){const p=(cl.pp||{})[uid];if(p&&p.name)return p.name;const x=(cl.dm||[]).find(x=>dmOther(x)===uid);return x?dmName(x):"مستخدم"}
async function send(kind,payload){
  if(!call)return;
  await sb("/rest/v1/call_signals",{method:"POST",body:{call_id:call.id,to_uid:call.peer,kind,payload:payload||null}});
}
function cleanup(notify){
  if(call&&notify){try{send("hangup")}catch(e){}}
  if(call){clearTimeout(call.t);clearInterval(call.tick);try{call.pc&&call.pc.close()}catch(e){}try{call.stream&&call.stream.getTracks().forEach(t=>t.stop())}catch(e){}}
  call=null;uiClose();
}
async function mkPc(){
  const pc=new RTCPeerConnection({iceServers:ICE});
  call.pc=pc;call.pendingIce=[];
  pc.onicecandidate=e=>{if(e.candidate&&call)send("ice",e.candidate.toJSON()).catch(()=>{})};
  pc.ontrack=e=>{let a=document.getElementById("callAudio");if(!a){a=document.createElement("audio");a.id="callAudio";a.autoplay=true;a.setAttribute("playsinline","");document.body.append(a)}a.srcObject=e.streams[0];a.play&&a.play().catch(()=>{})};
  pc.onconnectionstatechange=()=>{
    if(!call)return;
    if(pc.connectionState==="connected")connected();
    else if(pc.connectionState==="failed"){msg("تعذر الاتصال بالشبكة، جرّب تاني");cleanup(true)}
    else if(pc.connectionState==="disconnected"){call.dc=setTimeout(()=>{if(call&&call.pc.connectionState!=="connected")cleanup(true)},8000)}
  };
  call.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  call.stream.getTracks().forEach(t=>pc.addTrack(t,call.stream));
  return pc;
}
function connected(){
  if(!call||call.on)return;call.on=true;clearTimeout(call.t);call.t0=Date.now();
  const draw=()=>{const s=Math.floor((Date.now()-call.t0)/1000);ui(`<div style="font-size:42px">🎙️</div><h2>${esc(nameOf(call.peer))}</h2><div id="callT" style="font-size:22px">${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}</div><div style="display:flex;gap:12px">${btn(call.muted?"🔇 تشغيل":"🎙️ كتم","callMute()","#3b6b62")}${btn("⛔ إنهاء","callEnd()","#b0352d")}</div>`)};
  draw();call.tick=setInterval(()=>{if(call)draw()},1000);
}
window.callMute=()=>{if(!call||!call.stream)return;call.muted=!call.muted;call.stream.getAudioTracks().forEach(t=>t.enabled=!call.muted)};
window.callEnd=()=>cleanup(true);
window.callStart=async function(peerUid){
  if(!cs())return authModal("login");
  if(typeof banStop==="function"&&banStop())return;
  if(call)return msg("أنت في مكالمة بالفعل");
  if(!window.RTCPeerConnection||!navigator.mediaDevices)return msg("المتصفح لا يدعم المكالمات");
  call={id:uuid(),peer:peerUid,dir:"out"};
  ui(`<div style="font-size:42px">📞</div><h2>${esc(nameOf(peerUid))}</h2><p>جاري الاتصال…</p>${btn("⛔ إلغاء","callEnd()","#b0352d")}`);
  try{
    const pc=await mkPc(),off=await pc.createOffer({offerToReceiveAudio:true});
    await pc.setLocalDescription(off);
    await send("offer",{type:off.type,sdp:off.sdp});
    call.t=setTimeout(()=>{msg("لم يرد");cleanup(true)},45000);
    startPoll();
  }catch(e){const m=e&&e.name==="NotAllowedError"?"اسمح للميكروفون من إعدادات المتصفح":sbErr(e)||"تعذر بدء المكالمة";cleanup(false);msg(m.slice(0,90))}
};
async function incoming(s){
  if(call){await sb("/rest/v1/call_signals",{method:"POST",body:{call_id:s.call_id,to_uid:s.from_uid,kind:"busy"}}).catch(()=>{});return}
  call={id:s.call_id,peer:s.from_uid,dir:"in",offer:s.payload};
  try{navigator.vibrate&&navigator.vibrate([300,150,300,150,300])}catch(e){}
  ui(`<div style="font-size:42px">📞</div><h2>${esc(nameOf(s.from_uid))}</h2><p>مكالمة واردة…</p><div style="display:flex;gap:12px">${btn("✅ رد","callAccept()","#1b7a63")}${btn("⛔ رفض","callDecline()","#b0352d")}</div>`);
  call.t=setTimeout(()=>cleanup(false),45000);
  startPoll();
}
window.callDecline=()=>{if(!call)return;send("decline").catch(()=>{});cleanup(false)};
window.callAccept=async()=>{
  if(!call||!call.offer)return;clearTimeout(call.t);
  ui(`<div style="font-size:42px">📞</div><h2>${esc(nameOf(call.peer))}</h2><p>جاري التوصيل…</p>${btn("⛔ إنهاء","callEnd()","#b0352d")}`);
  try{
    const pc=await mkPc();
    await pc.setRemoteDescription(call.offer);
    for(const c of call.pendingIce)await pc.addIceCandidate(c).catch(()=>{});call.pendingIce=[];
    const an=await pc.createAnswer();await pc.setLocalDescription(an);
    await send("answer",{type:an.type,sdp:an.sdp});
    call.t=setTimeout(()=>{if(call&&!call.on){msg("تعذر الاتصال");cleanup(true)}},30000);
  }catch(e){const m=e&&e.name==="NotAllowedError"?"اسمح للميكروفون من إعدادات المتصفح":"تعذر الرد";cleanup(true);msg(m)}
};
async function onSignal(s){
  if(!s||s.id<=lastSeen&&s.id)return;if(s.id)lastSeen=Math.max(lastSeen,s.id);
  const age=Date.now()-Date.parse(s.created_at);
  try{sb("/rest/v1/call_signals?id=eq."+s.id,{method:"DELETE"}).catch(()=>{})}catch(e){}
  if(age>90000)return;
  if(s.kind==="offer"){return incoming(s)}
  if(!call||call.id!==s.call_id)return;
  if(s.kind==="answer"&&call.pc){await call.pc.setRemoteDescription(s.payload).catch(()=>{});for(const c of call.pendingIce)await call.pc.addIceCandidate(c).catch(()=>{});call.pendingIce=[]}
  else if(s.kind==="ice"){if(call.pc&&call.pc.remoteDescription)await call.pc.addIceCandidate(s.payload).catch(()=>{});else call.pendingIce&&call.pendingIce.push(s.payload)}
  else if(s.kind==="hangup"){msg("انتهت المكالمة");cleanup(false)}
  else if(s.kind==="decline"){msg("تم رفض المكالمة");cleanup(false)}
  else if(s.kind==="busy"){msg("الطرف الآخر في مكالمة");cleanup(false)}
}
async function poll(){
  const me=cs();if(!me||document.hidden||!navigator.onLine)return;
  try{
    const since=new Date(Date.now()-90000).toISOString();
    const r=await sb("/rest/v1/call_signals?select=*&to_uid=eq."+me.uid+"&created_at=gt."+encodeURIComponent(since)+"&order=id.asc&limit=50");
    for(const s of r||[])await onSignal(s);
  }catch(e){}
}
let tickN=0;function startPoll(){}
setInterval(()=>{tickN++;if(call||(!live&&tickN%3===0))poll()},3000);
function connect(){
  const me=cs();
  if(!me||!window.supabase||!window.supabase.createClient)return;
  if(rtClient&&authSeen===me.access)return;
  try{
    if(chan&&rtClient)rtClient.removeChannel(chan);
    authSeen=me.access;live=false;
    rtClient=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    rtClient.realtime.setAuth(me.access);
    chan=rtClient.channel("yomak-calls-"+me.uid).on("postgres_changes",{event:"INSERT",schema:"public",table:"call_signals",filter:"to_uid=eq."+me.uid},p=>onSignal(p.new)).subscribe(st=>{live=st==="SUBSCRIBED"});
  }catch(e){}
}
// DM page: call button
const dmPage=PAGES.dm;
dmPage.act=p=>{const x=p&&dmInfo(p.id);return x?`<button class="pact" aria-label="اتصال صوتي" onclick="callStart('${esc(dmOther(x))}')">📞</button>`:""};
// hook the placeholder provider
try{CALL_PROVIDER.ready=true;CALL_PROVIDER.start=()=>msg("افتح محادثة خاصة واضغط 📞")}catch(e){}
setInterval(connect,15000);
setTimeout(()=>{connect();poll()},2500);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){connect();poll()}});
})();
