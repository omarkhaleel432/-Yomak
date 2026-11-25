/* YOMAK v14: groups upgrade (needs sql/2026-11-25-groups-v2.sql)
   - private groups + join requests (owner/admins approve)
   - photos in group posts, group cover, profile cover
   - follow people + "من أتابعهم" section on Home
   - "انشر أيضًا للعامة" checkbox in the group composer */
(function(){
const P={set:{},setTs:0,req:{},cov:{},ga:{},fol:null,fh:null,pimgs:[],busyF:false};
const OKURL=u=>typeof u==="string"&&/^https:\/\/[^'"<>\s]+\/storage\/v1\/object\/public\/post-images\/[^'"<>\s]+$/.test(u);
const me=()=>{const s=cs();return s?s.uid:null};
const rerender=()=>{try{renderPage()}catch(e){}try{render()}catch(e){}};
function pickFile(cb){const i=document.createElement("input");i.type="file";i.accept="image/*";i.onchange=()=>{const f=i.files&&i.files[0];if(f)cb(f)};i.click()}
async function toUrl(file,px){const data=await readImage(file,px||1100,.7);const u=await upImg(data);if(!OKURL(u))throw{message:"تعذر رفع الصورة، جرّب صورة أصغر"};return u}
/* ---------- settings / requests ---------- */
async function loadSet(){
  if(!cs())return;P.setTs=Date.now();
  try{
    const s=await sb("/rest/v1/group_settings?select=group_id,privacy,cover_url&limit=1000")||[];
    P.set={};s.forEach(x=>P.set[x.group_id]=x);
    const r=await sb("/rest/v1/group_join_requests?select=group_id,status&user_id=eq."+me()+"&limit=1000")||[];
    P.req={};r.forEach(x=>P.req[x.group_id]=x.status);
  }catch(e){}
  rerender();
}
const isPriv=id=>!!(P.set[id]&&P.set[id].privacy==="private");
const _gc=window.grpCard;
if(typeof _gc==="function")window.grpCard=function(g,t){let h=_gc.apply(this,arguments);if(!cs()||!g)return h;
  if(Date.now()-P.setTs>60000){P.setTs=Date.now();setTimeout(loadSet,0)}
  if(!isPriv(g.id))return h;
  h=h.replace('<span class="pill">','<span class="pill">🔒 خاص · ').replace('<span class="pill">🔒 خاص · ','<span class="pill">🔒 خاص</span> <span class="pill">');
  if(!(cl.mine&&cl.mine[g.id])){const st=P.req[g.id],id=esc(g.id);
    const b=st==="pending"?'<button class="chip" disabled>⏳ طلبك قيد المراجعة</button>':st==="approved"?'<button class="chip on" onclick="joinGroup(\''+id+'\')">✅ تمت الموافقة، انضم</button>':'<button class="chip" onclick="joinGroup(\''+id+'\')">🔒 طلب انضمام</button>';
    h=h.replace(/<button class="chip" onclick="joinGroup\('[^']*'\)">انضمام<\/button>/,b)}
  return h};
const _jg=window.joinGroup;
window.joinGroup=async function(id){
  if(!isPriv(id)||P.req[id]==="approved"||(cl.mine&&cl.mine[id]))return _jg.apply(this,arguments);
  if(banStop())return;
  try{await ensureProfile();await sb("/rest/v1/group_join_requests",{method:"POST",body:{group_id:id}});P.req[id]="pending";msg("تم إرسال طلب الانضمام لمشرفي الجروب");rerender()}catch(e){msg(sbErr(e).slice(0,90))}};
/* create group as private */
const _gm=window.groupModal;
if(typeof _gm==="function")window.groupModal=function(){const r=_gm.apply(this,arguments);
  const p=el("gErr");if(p&&!el("gPriv"))p.insertAdjacentHTML("beforebegin",'<label class="chkrow"><input type="checkbox" id="gPriv"> 🔒 جروب خاص (الانضمام بموافقة المشرفين)</label>');return r};
const _cg=window.createGroup;
if(typeof _cg==="function")window.createGroup=async function(){
  const priv=chkv("gPriv"),nm=val("gName");const r=await _cg.apply(this,arguments);
  if(priv&&nm.length>=2&&cs()){try{
    const g=await sb("/rest/v1/groups?select=id&owner=eq."+me()+"&name=eq."+encodeURIComponent(nm)+"&order=created_at.desc&limit=1");
    if(g&&g[0]){await sb("/rest/v1/group_settings",{method:"POST",body:{group_id:g[0].id,privacy:"private"}});P.setTs=0;loadSet()}
  }catch(e){msg("اتعمل الجروب لكن تعذر جعله خاصًا: "+sbErr(e).slice(0,60))}}
  return r};
async function saveSet(gid,f){
  const r=await sb("/rest/v1/group_settings?group_id=eq."+encodeURIComponent(gid),{method:"PATCH",prefer:"return=representation",body:{...f,updated_at:new Date().toISOString()}});
  if(r&&r.length){P.set[gid]=r[0];return}
  const c=await sb("/rest/v1/group_settings",{method:"POST",prefer:"return=representation",body:{group_id:gid,...f}});
  if(c&&c[0])P.set[gid]=c[0]}
/* group management: privacy, cover, requests */
window.ykPrivacy=async function(){const g=curGroupObj();if(!g)return;
  const s=P.set[g.id]||{privacy:"public"};let rq=[];
  try{rq=await sb("/rest/v1/group_join_requests?select=id,user_id,created_at&status=eq.pending&group_id=eq."+encodeURIComponent(g.id)+"&order=created_at.asc&limit=100")||[];await loadPeople(rq.map(x=>x.user_id))}catch(e){}
  openModal('<button class="close" aria-label="إغلاق" onclick="closeModal()">×</button><h3>🔒 خصوصية الجروب والغلاف</h3>'+
   '<div class="seg"><button class="'+(s.privacy!=="private"?"on":"")+'" onclick="ykSetPriv(\''+esc(g.id)+'\',\'public\')">🌍 عام</button><button class="'+(s.privacy==="private"?"on":"")+'" onclick="ykSetPriv(\''+esc(g.id)+'\',\'private\')">🔒 خاص</button></div>'+
   '<p class="muted">الجروب الخاص: أي حد لازم يبعت طلب انضمام وتوافق عليه.</p>'+
   '<button class="secondary" onclick="ykGroupCover(\''+esc(g.id)+'\')">🖼️ اختيار صورة غلاف</button>'+
   '<div class="sub2">طلبات الانضمام ('+an(rq.length)+')</div>'+
   (rq.length?rq.map(x=>'<div class="card"><div style="display:flex;gap:8px;align-items:center">'+avHtml(cl.pp[x.user_id]||{id:x.user_id,name:"?"},34)+'<b style="flex:1">'+esc(nmOf(x.user_id))+'</b><button class="chip on" onclick="ykReq('+x.id+',\'approved\')">قبول</button><button class="chip" onclick="ykReq('+x.id+',\'rejected\')">رفض</button></div></div>').join(""):'<p class="muted">لا توجد طلبات.</p>'))};
window.ykSetPriv=async function(gid,v){try{await saveSet(gid,{privacy:v});msg(v==="private"?"الجروب بقى خاص 🔒":"الجروب بقى عام 🌍");closeModal();rerender()}catch(e){msg(sbErr(e).slice(0,90))}};
window.ykGroupCover=function(gid){pickFile(async f=>{try{msg("جاري رفع الغلاف…");const u=await toUrl(f,1200);await saveSet(gid,{cover_url:u});msg("تم تغيير الغلاف ✅");closeModal();rerender()}catch(e){msg(sbErr(e).slice(0,90))}})};
window.ykReq=async function(id,st){try{const r=await sb("/rest/v1/group_join_requests?id=eq."+Number(id),{method:"PATCH",prefer:"return=representation",body:{status:st}});if(!r||!r.length)throw{message:"لا تملك الصلاحية"};msg(st==="approved"?"تم القبول، يقدر ينضم الآن":"تم الرفض");closeModal();ykPrivacy()}catch(e){msg(sbErr(e).slice(0,90))}};
const _gb=window.groupBar;
if(typeof _gb==="function")window.groupBar=function(g){let h=_gb.apply(this,arguments)||"";
  if(!g||!cs())return h;
  const mine=g.owner===me()||cl.admin;
  if(!mine&&P.ga[g.id]===undefined){P.ga[g.id]=false;sb("/rest/v1/group_admins?select=user_id&group_id=eq."+encodeURIComponent(g.id)+"&user_id=eq."+me()).then(r=>{if(r&&r.length){P.ga[g.id]=true;rerender()}}).catch(()=>{})}
  if(mine||P.ga[g.id]){const b='<button class="chip" onclick="ykPrivacy()">🔒 الخصوصية والغلاف</button>';
    h=h?h.replace('<div class="chips">','<div class="chips">'+b):'<div class="chips">'+b+"</div>"}
  return h};
/* ---------- group page: cover + photos + composer ---------- */
window.ykAddPImg=function(){if(P.pimgs.length>=4){msg("الحد الأقصى ٤ صور");return}
  pickFile(f=>readImage(f,1000,.65).then(u=>{P.pimgs.push(u);paintPImgs()}).catch(()=>msg("تعذر قراءة الصورة")))};
window.ykDelPImg=function(i){P.pimgs.splice(i,1);paintPImgs()};
function paintPImgs(){const b=el("pImgPrev");if(b)b.innerHTML=P.pimgs.map((u,i)=>'<span style="position:relative;display:inline-block;margin:4px"><img class="prev" style="width:84px;height:84px;object-fit:cover" alt="" src="'+u+'"><button class="close" style="position:absolute;top:-6px;left:-6px;width:28px;height:28px;font-size:16px" onclick="ykDelPImg('+i+')">×</button></span>').join("")}
const gimgs={};
async function loadGImgs(ids){ids=(ids||[]).filter(x=>UUID_RE.test(x+""));if(!ids.length)return;
  try{const r=await sb("/rest/v1/group_post_images?select=post_id,url&post_id=in.("+ids.join(",")+")")||[];ids.forEach(i=>gimgs[i]=[]);r.forEach(x=>{if(OKURL(x.url))gimgs[x.post_id].push(x.url)})}catch(e){}}
const _lp=window.loadPosts;
if(typeof _lp==="function")window.loadPosts=async function(gid){await _lp.apply(this,arguments);
  const ids=(cl.posts||[]).map(p=>p.id);if(ids.length){await loadGImgs(ids);rerender()}};
if(typeof PAGES!=="undefined"&&PAGES.group){const _r=PAGES.group.render;
  PAGES.group.render=function(e){let h=_r.apply(this,arguments);if(!cs()||typeof h!=="string")return h;
    const g=curGroupObj();
    if(g&&P.set[g.id]&&OKURL(P.set[g.id].cover_url))h='<div class="cover" style="background:url(\''+esc(P.set[g.id].cover_url)+'\') center/cover;margin-bottom:10px"></div>'+h;
    if(cl.tab==="chat")return h;
    h=h.replace('<button class="primary" style="margin-top:8px" onclick="sendPost()">نشر</button>','<div id="pImgPrev">'+P.pimgs.map((u,i)=>'<span style="position:relative;display:inline-block;margin:4px"><img class="prev" style="width:84px;height:84px;object-fit:cover" alt="" src="'+u+'"><button class="close" style="position:absolute;top:-6px;left:-6px;width:28px;height:28px;font-size:16px" onclick="ykDelPImg('+i+')">×</button></span>').join("")+'</div><button class="chip" type="button" onclick="ykAddPImg()">📷 إضافة صورة</button><label class="chkrow"><input type="checkbox" id="pPub"> انشر أيضًا للعامة (تظهر في الصفحة الرئيسية)</label><button class="primary" style="margin-top:8px" onclick="sendPost()">نشر</button>');
    (cl.posts||[]).forEach(p=>{const u=gimgs[p.id];if(!u||!u.length)return;const at=h.indexOf("'"+p.id+"'");if(at<0)return;const j=h.indexOf("</p>",at>0?h.lastIndexOf('<p style="white-space:pre-wrap">',at):0);if(j<0)return;
      const gal='<div class="gal g'+u.length+'">'+u.map(x=>'<img class="fimg" alt="" loading="lazy" src="'+esc(x)+'">').join("")+"</div>";h=h.slice(0,j+4)+gal+h.slice(j+4)});
    return h}}
window.sendPost=async function(){
  if(banStop())return;const g=curGroup(),t=val("pBody");if(!g)return;
  if(!t&&!P.pimgs.length){msg("اكتب المنشور أو أضف صورة");return}
  const pub=chkv("pPub"),body=t||"📷";
  try{
    const r=await sb("/rest/v1/posts",{method:"POST",prefer:"return=representation",body:{group_id:g.id,body:body.slice(0,1000)}});
    const pid=r&&r[0]&&r[0].id;const urls=[];
    if(P.pimgs.length)msg("جاري رفع الصور…");
    for(const dta of P.pimgs){try{const u=await upImg(dta);if(OKURL(u))urls.push(u)}catch(e){}}
    if(urls.length&&pid)await sb("/rest/v1/group_post_images",{method:"POST",body:urls.map(url=>({post_id:pid,url}))});
    if(pub){await ensureProfile();
      await sb("/rest/v1/service_posts",{method:"POST",body:{country:"SA"===d.country?"SA":"EG",region:(d.region||"").slice(0,60),city:(d.city||"").slice(0,40),category:"other",kind:"offer",title:body.slice(0,80),body:body.slice(0,1000),phone:"",whatsapp:false,price:"",images:urls.slice(0,4),image:null}});
      fd.list=null;fd.ts=0;P.fh=null}
    P.pimgs=[];const b=el("pBody");if(b)b.value="";
    await loadPosts(g.id);msg(pub?"تم النشر في الجروب وللعامة ✅":"تم النشر")
  }catch(e){msg(sbErr(e).slice(0,100))}};
/* ---------- covers on profiles ---------- */
async function ensureCov(id){P.cov[id]="";try{const r=await sb("/rest/v1/profile_covers?select=url&user_id=eq."+encodeURIComponent(id));if(r&&r[0]&&OKURL(r[0].url)){P.cov[id]=r[0].url;rerender()}}catch(e){}}
const _ph=window.profHead;
if(typeof _ph==="function")window.profHead=function(e,t){let h=_ph.apply(this,arguments);const id=e&&e.id;if(!id||!cs()||!UUID_RE.test(id+""))return h;
  if(P.cov[id]===undefined)setTimeout(()=>ensureCov(id),0);
  if(P.cov[id])h=h.replace('<div class="cover"></div>','<div class="cover" style="background:url(\''+esc(P.cov[id])+'\') center/cover"></div>');return h};
window.ykProfileCover=function(){pickFile(async f=>{try{msg("جاري رفع الغلاف…");const u=await toUrl(f,1200);
  const r=await sb("/rest/v1/profile_covers?user_id=eq."+me(),{method:"PATCH",prefer:"return=representation",body:{url:u,updated_at:new Date().toISOString()}});
  if(!r||!r.length)await sb("/rest/v1/profile_covers",{method:"POST",body:{user_id:me(),url:u}});
  P.cov[me()]=u;msg("تم تغيير الغلاف ✅");rerender()}catch(e){msg(sbErr(e).slice(0,90))}})};
const _pf=window.profile;
if(typeof _pf==="function")window.profile=function(){let h=_pf.apply(this,arguments);if(!cs())return h;
  return h.replace('<button class="fchip" onclick="profileModal()">','<button class="fchip" onclick="ykProfileCover()">🖼️ غلاف</button><button class="fchip" onclick="profileModal()">')};
/* ---------- follow ---------- */
async function loadFol(){if(P.busyF||!cs())return;P.busyF=true;
  try{const r=await sb("/rest/v1/follows?select=following&follower=eq."+me()+"&limit=1000")||[];P.fol=new Set(r.map(x=>x.following))}catch(e){P.fol=new Set()}
  P.busyF=false;rerender()}
window.ykFollow=async function(id,on){if(banStop())return;if(!UUID_RE.test(id+""))return;
  try{if(on)await sb("/rest/v1/follows",{method:"POST",body:{following:id}});else await sb("/rest/v1/follows?follower=eq."+me()+"&following=eq."+encodeURIComponent(id),{method:"DELETE"});
    if(!P.fol)P.fol=new Set();on?P.fol.add(id):P.fol.delete(id);P.fh=null;msg(on?"بقيت تتابعه ✅":"ألغيت المتابعة");rerender()}catch(e){msg(sbErr(e).slice(0,90))}};
if(typeof PAGES!=="undefined"&&PAGES.user){const _ur=PAGES.user.render;
  PAGES.user.render=function(e){let h=_ur.apply(this,arguments);if(!cs()||typeof h!=="string"||!e||e.id===me()||!UUID_RE.test(e.id+""))return h;
    if(P.fol===null)setTimeout(loadFol,0);
    const f=P.fol&&P.fol.has(e.id),b=f?'<button class="fchip on" onclick="ykFollow(\''+esc(e.id)+'\',0)">✓ تتابعه</button>':'<button class="fchip" onclick="ykFollow(\''+esc(e.id)+'\',1)">＋ متابعة</button>';
    return h.replace('<div class="fact" style="margin:8px 0">','<div class="fact" style="margin:8px 0">'+b)}}
const _fh=window.feedHome;
if(typeof _fh==="function")window.feedHome=function(){const h=_fh.apply(this,arguments);if(!cs())return h;
  if(P.fol===null){setTimeout(loadFol,0);return h}
  if(!P.fol.size)return h;
  if(P.fh===null){P.fh=[];const ids=[...P.fol].filter(x=>UUID_RE.test(x));
    fetchPosts("&user_id=in.("+ids.join(",")+")",0).then(l=>{P.fh=(l||[]).slice(0,8);rerender()}).catch(()=>{P.fh=[]});return h}
  return h+'<div class="section"><h3>⭐ من أتابعهم</h3></div>'+(P.fh.length?P.fh.map(svcCard).join(""):'<div class="card empty"><b>لا جديد من المتابَعين</b></div>')};
const _go=window.go;if(typeof _go==="function")window.go=function(t){if(t==="home")P.fh=null;return _go.apply(this,arguments)};
})();
