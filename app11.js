/* YOMAK v13: groups feel more like Facebook (code only, no database changes):
   - Home: "من جروباتي" = latest posts from the groups you are in
   - حسابي: "منشوراتي في الجروبات" = your own group posts
   - Group page: 👥 الأعضاء list for every member */
(function(){
const F={home:null,mine:null,busy:false};
const PQ="/rest/v1/posts?select=id,group_id,user_id,body,created_at&order=created_at.desc&limit=";
function gname(id){const g=(cl.groups||[]).find(x=>x.id===id);return g?g.name:"جروب"}
function card(p){return '<div class="card" style="cursor:pointer" onclick="openGroup(\''+esc(p.group_id)+'\',\'posts\')"><small class="muted">👥 '+esc(gname(p.group_id))+' · '+esc(nmOf(p.user_id))+' · '+when(p.created_at)+'</small><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 0">'+esc((p.body||"").slice(0,400))+'</p></div>'}
async function load(kind){
  if(F.busy||!cs())return;F.busy=true;
  try{
    if(!cl.conv&&typeof loadConv==="function")await loadConv();
    const me=cs().uid;
    if(kind==="home"){const r=await sb(PQ+"40")||[];const mine=cl.mine||{};F.home=r.filter(p=>mine[p.group_id]).slice(0,15)}
    else{F.mine=await sb(PQ+"20&user_id=eq."+encodeURIComponent(me))||[]}
    await loadPeople((F.home||[]).concat(F.mine||[]).map(p=>p.user_id));
  }catch(e){if(kind==="home")F.home=[];else F.mine=[]}
  F.busy=false;try{renderPage();render()}catch(e){}
}
const _fh=window.feedHome;
if(typeof _fh==="function")window.feedHome=function(){const h=_fh.apply(this,arguments);if(!cs())return h;
  if(F.home===null)setTimeout(()=>{current==="home"&&load("home")},50);
  const body=F.home===null?'<p class="muted">جاري التحميل…</p>':F.home.length?F.home.map(card).join(""):'<div class="card empty"><b>لا توجد منشورات في جروباتك بعد</b></div>';
  return h+'<div class="section"><h3>👥 من جروباتي</h3><button onclick="go(\'groups\')">الجروبات</button></div>'+body};
const _pf=window.profile;
if(typeof _pf==="function")window.profile=function(){const h=_pf.apply(this,arguments);if(!cs())return h;
  if(F.mine===null)setTimeout(()=>{current==="profile"&&load("mine")},50);
  return h+'<div class="section"><h3>منشوراتي في الجروبات</h3></div>'+(F.mine===null?'<p class="muted">جاري التحميل…</p>':F.mine.length?F.mine.map(card).join(""):'<div class="card empty"><b>لم تنشر في جروب بعد</b></div>')};
// refresh the lists when the user comes back to the app tabs
const _go=window.go;if(typeof _go==="function")window.go=function(t){if(t==="home")F.home=null;if(t==="profile")F.mine=null;return _go.apply(this,arguments)};
// members list
window.ykMembers=async function(){const g=curGroupObj();if(!g)return;
  let mem=[];try{mem=await sb("/rest/v1/group_members?select=user_id,joined_at&group_id=eq."+encodeURIComponent(g.id)+"&limit=500")||[]}catch(e){msg(sbErr(e).slice(0,80));return}
  await loadPeople(mem.map(m=>m.user_id));
  mem.sort((a,b)=>(b.user_id===g.owner)-(a.user_id===g.owner));
  openModal('<button class="close" aria-label="إغلاق" onclick="closeModal()">×</button><h3>👥 أعضاء الجروب ('+an(mem.length)+')</h3>'+mem.map(m=>'<div class="card"><div style="display:flex;gap:10px;align-items:center">'+avHtml(cl.pp[m.user_id]||{id:m.user_id,name:"?"},36)+'<b style="flex:1">'+esc(nmOf(m.user_id))+vfMark(cl.pp[m.user_id])+(m.user_id===g.owner?' <span class="pill">المالك</span>':"")+'</b></div></div>').join(""))};
const _gb=window.groupBar;
if(typeof _gb==="function")window.groupBar=function(g){let h=_gb.apply(this,arguments)||"";
  if(g&&cs()&&cl.mine&&cl.mine[g.id]){const b='<button class="chip" onclick="ykMembers()">👥 الأعضاء</button>';
    h=h?h.replace('<div class="chips">','<div class="chips">'+b):'<div class="chips">'+b+"</div>"}return h};
})();
