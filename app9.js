/* YOMAK v11: Messenger-style chat controls (delete for me / for everyone, group admins) + account controls for the app admin.
   Needs sql/2026-11-25-chat-admin.sql and the admin-user Edge Function. Until then each control shows a clear error and nothing else breaks. */
(function(){
const H={g:new Set(),d:new Set(),loaded:false,loading:false};
const GA={}; // group id -> Set of admin user ids (null while loading)
const A=(s)=>String(s).replace(/[^0-9]/g,"");
async function loadHides(){if(H.loading||!cs())return;H.loading=true;
  try{const r=await sb("/rest/v1/message_hides?select=kind,msg_id&limit=5000");H.g.clear();H.d.clear();(r||[]).forEach(x=>H[x.kind]&&H[x.kind].add(String(x.msg_id)));}catch(e){}
  H.loaded=true;H.loading=false;try{renderPage()}catch(e){}}
async function loadGA(gid){if(GA[gid]!==undefined)return;GA[gid]=null;
  try{const r=await sb("/rest/v1/group_admins?select=user_id&group_id=eq."+encodeURIComponent(gid));GA[gid]=new Set((r||[]).map(x=>x.user_id))}catch(e){GA[gid]=new Set()}
  try{renderPage()}catch(e){}}
const hideLink=(k,id)=>' · <a href="#" onclick="ykHide(\''+k+'\','+id+');return false">🙈 حذف عندي</a>';
function decorate(html){
  html=html.replace(/(copyItem\('(message|dm)','(\d+)'\);return false">[^<]*<\/a>)/g,(m,a,t,id)=>a+hideLink(t==="dm"?"d":"g",id));
  return html.replace(/🗑 حذف<\/a>/g,"🗑 حذف للجميع</a>")}
const _mh=window.msgHtml;
if(typeof _mh==="function")window.msgHtml=function(){if(!H.loaded)loadHides();const all=cl.msgs;try{cl.msgs=(all||[]).filter(m=>!H.g.has(String(m.id)));return decorate(_mh.apply(this,arguments))}finally{cl.msgs=all}};
const _dh=window.dmHtml;
if(typeof _dh==="function")window.dmHtml=function(){if(!H.loaded)loadHides();const all=cl.dmMsgs;try{cl.dmMsgs=(all||[]).filter(m=>!H.d.has(String(m.id)));return decorate(_dh.apply(this,arguments))}finally{cl.dmMsgs=all}};
window.ykHide=async function(k,id){
  if(!confirm("حذف الرسالة من عندك فقط؟ الطرف الآخر هيفضل شايفها."))return;
  try{await sb("/rest/v1/message_hides",{method:"POST",prefer:"resolution=ignore-duplicates",body:{kind:k,msg_id:Number(id)}});H[k].add(String(id));msg("تم الحذف من عندك");renderPage()}
  catch(e){msg(sbErr(e).slice(0,90))}};
// ---- group admin ----
function isOwner(g){const u=cs();return !!(g&&u&&g.owner===u.uid)}
function isGAdmin(g){const u=cs();return !!(u&&g&&(isOwner(g)||(GA[g.id]&&GA[g.id].has(u.uid))))}
const _gb=window.groupBar;
if(typeof _gb==="function")window.groupBar=function(g){
  let h=_gb.apply(this,arguments)||"";
  if(g&&cs()){loadGA(g.id);
    if(isGAdmin(g)||cl.admin){const b='<button class="chip" onclick="ykGroupModal()">⚙️ إدارة الجروب</button>';
      h=h?h.replace('<div class="chips">','<div class="chips">'+b):'<div class="chips">'+b+"</div>"}}
  return h};
window.ykGroupModal=async function(){
  const p=curGroup(),g=curGroupObj();if(!p||!g)return;
  let mem=[];try{mem=await sb("/rest/v1/group_members?select=user_id&group_id=eq."+encodeURIComponent(g.id)+"&limit=500")||[]}catch(e){}
  await loadPeople(mem.map(m=>m.user_id));
  const me=cs(),adm=GA[g.id]||new Set(),own=isOwner(g),can=isGAdmin(g)||cl.admin;
  const row=m=>{const u=m.user_id,isO=u===g.owner,isA=adm.has(u),self=me&&u===me.uid;
    const btn=[];
    if(own&&!isO)btn.push(isA?'<button class="chip" data-u="'+esc(u)+'" onclick="ykToggleAdmin(this.dataset.u,0)">إزالة الإشراف</button>':'<button class="chip" data-u="'+esc(u)+'" onclick="ykToggleAdmin(this.dataset.u,1)">⭐ اجعله مشرف</button>');
    if(can&&!isO&&!self&&(own||cl.admin||!isA))btn.push('<button class="chip" data-u="'+esc(u)+'" onclick="ykKick(this.dataset.u)">🚪 إخراج</button>');
    return '<div class="card"><div style="display:flex;gap:10px;align-items:center">'+avHtml(cl.pp[u]||{id:u,name:"?"},36)+'<b style="flex:1">'+esc(nmOf(u))+(isO?' <span class="pill">المالك</span>':isA?' <span class="pill">مشرف</span>':"")+'</b></div>'+(btn.length?'<div class="chips" style="margin-top:6px">'+btn.join("")+"</div>":"")+"</div>"};
  openModal('<button class="close" aria-label="إغلاق" onclick="closeModal()">×</button><h3>⚙️ إدارة الجروب</h3>'+
    (can?'<button class="secondary" onclick="ykEditGroup()">✏️ تعديل الاسم والوصف</button>':"")+
    '<p class="muted">الأعضاء ('+an(mem.length)+')</p>'+mem.map(row).join(""))};
window.ykToggleAdmin=async function(u,on){const g=curGroupObj();if(!g)return;
  try{if(on)await sb("/rest/v1/group_admins",{method:"POST",prefer:"resolution=ignore-duplicates",body:{group_id:g.id,user_id:u}});
    else if(!await delRow("/rest/v1/group_admins?group_id=eq."+g.id+"&user_id=eq."+encodeURIComponent(u)))throw{message:"لم يتم (لا تملك الصلاحية)"};
    GA[g.id]=undefined;await loadGA(g.id);closeModal();msg(on?"تم تعيين مشرف":"تمت إزالة الإشراف");}
  catch(e){msg(sbErr(e).slice(0,90))}};
window.ykKick=async function(u){const g=curGroupObj();if(!g||!confirm("إخراج "+nmOf(u)+" من الجروب؟"))return;
  try{if(!await delRow("/rest/v1/group_members?group_id=eq."+g.id+"&user_id=eq."+encodeURIComponent(u)))throw{message:"لم يتم (لا تملك الصلاحية)"};
    cl.gTs=0;closeModal();msg("تم الإخراج")}catch(e){msg(sbErr(e).slice(0,90))}};
window.ykEditGroup=function(){const g=curGroupObj();if(!g)return;
  formModal("تعديل الجروب",inp("geName","اسم الجروب",g.name||"",{max:60})+inp("geDesc","وصف",g.description||"",{area:1,max:300,rows:3}),()=>{ykSaveGroup(g.id);return false},{save:"حفظ"})};
window.ykSaveGroup=async function(id){const n=val("geName").trim(),d=val("geDesc").trim();if(n.length<2){msg("اكتب اسم الجروب");return}
  try{const r=await sb("/rest/v1/groups?id=eq."+encodeURIComponent(id),{method:"PATCH",prefer:"return=representation",body:{name:n,description:d}});
    if(!r||!r.length)throw{message:"لم يتم الحفظ (لا تملك الصلاحية)"};
    const g=(cl.groups||[]).find(x=>x.id===id);if(g){g.name=n;g.description=d}closeModal();msg("تم الحفظ");renderPage()}catch(e){msg(sbErr(e).slice(0,90))}};
// ---- account controls for the app admin (users list in the admin area) ----
async function fn(action,uid){const s=cs();
  const r=await fetch(SB_URL+"/functions/v1/admin-user",{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+s.access,"Content-Type":"application/json"},body:JSON.stringify({action,user_id:uid})});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw{message:(j.error||"فشل")+(j.detail?" — "+j.detail:"")};return j}
window.ykAcct=async function(action,uid,name){if(!cl.admin)return;
  try{
    if(action==="delete"){
      if(!confirm("حذف حساب «"+name+"» نهائيًا؟ لا يمكن التراجع."))return;
      const t=prompt("للتأكيد اكتب اسم الحساب بالضبط:");if(t===null||t.trim()!==String(name).trim()){msg("الاسم غير مطابق، لم يتم الحذف");return}
    }else if(!confirm(action==="block"?"تعطيل دخول «"+name+"»؟":"إعادة تفعيل «"+name+"»؟"))return;
    await fn(action,uid);msg(action==="delete"?"تم حذف الحساب":action==="block"?"تم تعطيل الحساب":"تم تفعيل الحساب");
    cl.ulist=null;if(typeof loadUsers==="function")await loadUsers();renderPage()}
  catch(e){msg(sbErr(e).slice(0,100))}};
const _ur=window.uRowHtml;
if(typeof _ur==="function")window.uRowHtml=function(){const h=_ur.apply(this,arguments);if(!cl.admin)return h;
  return h.replace(/<button class="chip" data-u="([^"]*)" data-n="([^"]*)" onclick="wipeUser\([^"]*\)">[^<]*<\/button>/g,(m,u,n)=>m+
    '<button class="chip" data-u="'+u+'" data-n="'+n+'" onclick="ykAcct(\'block\',this.dataset.u,this.dataset.n)">🔒 تعطيل الدخول</button>'+
    '<button class="chip" data-u="'+u+'" data-n="'+n+'" onclick="ykAcct(\'unblock\',this.dataset.u,this.dataset.n)">🔓 تفعيل</button>'+
    '<button class="chip" style="color:#b0352d" data-u="'+u+'" data-n="'+n+'" onclick="ykAcct(\'delete\',this.dataset.u,this.dataset.n)">☠️ حذف الحساب</button>')};
const _ow=window.openGroup;
if(typeof _ow==="function")window.openGroup=function(id){const r=_ow.apply(this,arguments);GA[id]=undefined;return r};
})();
