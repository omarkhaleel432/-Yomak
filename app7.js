/* YOMAK v9: group voice calls (LiveKit). Join token comes from the Supabase Edge Function livekit-token. */
(function(){
let room=null,lk=null,busy=false,muted=false,gname="",tick=null,t0=0;
const LIB="https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js";
const G=()=>document.getElementById("gcallUI");
function loadLib(){return new Promise((ok,no)=>{if(window.LivekitClient)return ok(window.LivekitClient);const s=document.createElement("script");s.src=LIB;s.onload=()=>ok(window.LivekitClient);s.onerror=()=>no(new Error("lib"));document.head.append(s)})}
function names(){if(!room)return[];const a=[room.localParticipant.name||"أنت"];room.remoteParticipants.forEach(p=>a.push(p.name||"مستخدم"));return a}
function draw(){
  if(!room)return;let e=G();
  if(!e){e=document.createElement("div");e.id="gcallUI";e.style.cssText="position:fixed;inset:0;z-index:20;background:#123c3aee;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center";document.body.append(e)}
  const s=Math.floor((Date.now()-t0)/1000),b=(l,f,c)=>`<button onclick="${f}" style="border:0;border-radius:40px;min-width:110px;min-height:56px;font-size:18px;font-weight:800;color:#fff;background:${c};padding:0 22px">${l}</button>`;
  e.innerHTML=`<div style="font-size:42px">🎙️</div><h2>${esc(gname||"مكالمة الجروب")}</h2><div style="font-size:20px">${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}</div><div>${names().map(n=>`<div style="padding:4px 0">${esc(n)}</div>`).join("")}</div><div style="display:flex;gap:12px">${b(muted?"🔇 تشغيل":"🎙️ كتم","gcallMute()","#3b6b62")}${b("⛔ خروج","gcallLeave()","#b0352d")}</div>`;
}
function close(){clearInterval(tick);const e=G();if(e)e.remove();document.querySelectorAll("audio[data-gcall]").forEach(a=>a.remove());room=null;muted=false}
window.gcallMute=async()=>{if(!room)return;muted=!muted;await room.localParticipant.setMicrophoneEnabled(!muted);draw()};
window.gcallLeave=()=>{try{room&&room.disconnect()}catch(e){}close()};
window.gcallStart=async function(gid,name){
  if(!cs())return authModal("login");
  if(typeof banStop==="function"&&banStop())return;
  if(room||busy)return;
  if(document.getElementById("callUI"))return msg("أنت في مكالمة بالفعل");
  busy=true;gname=name||"";msg("جاري الدخول للمكالمة…");
  try{
    lk=await loadLib();
    const r=await sb("/functions/v1/livekit-token",{method:"POST",body:{group_id:String(gid)}});
    if(!r||!r.token)throw new Error("token");
    const rm=new lk.Room({adaptiveStream:true,dynacast:true});
    rm.on(lk.RoomEvent.TrackSubscribed,(t)=>{if(t.kind==="audio"){const a=t.attach();a.setAttribute("data-gcall","1");document.body.append(a)}});
    rm.on(lk.RoomEvent.TrackUnsubscribed,(t)=>{t.detach().forEach(a=>a.remove())});
    rm.on(lk.RoomEvent.ParticipantConnected,draw);rm.on(lk.RoomEvent.ParticipantDisconnected,draw);
    rm.on(lk.RoomEvent.Disconnected,()=>{if(room){msg("انتهت المكالمة");close()}});
    await rm.connect(r.url,r.token);
    await rm.localParticipant.setMicrophoneEnabled(true);
    try{await rm.startAudio()}catch(e){}
    room=rm;t0=Date.now();draw();tick=setInterval(draw,1000);
  }catch(e){
    const m=e&&e.name==="NotAllowedError"?"اسمح للميكروفون من إعدادات المتصفح":(e&&e.status===403?"لازم تكون عضو في الجروب":(e&&e.status===404?"خدمة مكالمات الجروب لسه مش مفعّلة":"تعذر الدخول للمكالمة"));
    msg(m);try{room&&room.disconnect()}catch(x){}close();
  }
  busy=false;
};
const gp=PAGES.group,oldAct=gp.act;
gp.act=p=>(oldAct?oldAct(p):"")+(p&&p.id?`<button class="pact" aria-label="مكالمة جماعية" onclick="gcallStart('${esc(p.id)}','${esc(p.name||"")}')">🎙️</button>`:"");
})();
