/* YOMAK v10: unread-message badges (per chat + on the bottom "المحادثات" tab).
   Client-side only: "last read" times live in this device's localStorage. No database changes. */
(function(){
const POLL=15000,CAP=200;
let unread={},latest={},total=0,busy=false,timer=null;
const uid=()=>{try{const s=cs();return s&&s.uid||""}catch(e){return""}};
const SK=()=>"yk_read_"+uid();
function store(){try{return JSON.parse(localStorage.getItem(SK())||"null")||{}}catch(e){return{}}}
function save(o){try{localStorage.setItem(SK(),JSON.stringify(o))}catch(e){}}
function base(o){if(!o._init){o._init=Date.now();save(o)}return o._init}
const T=x=>Date.parse(x)||0;
function curKey(){try{const p=pageStack[pageStack.length-1];if(!p)return"";if(p.n==="dm")return"d:"+p.p.id;if(p.n==="group"&&cl.tab==="chat")return"g:"+p.p.id}catch(e){}return""}
function markRead(k){if(!k||!uid())return;const o=store();base(o);const t=latest[k]||0;if(t>(o[k]||0)){o[k]=t;save(o)}if(unread[k]){delete unread[k];paint()}}
function paint(){
  total=Object.values(unread).reduce((a,b)=>a+b,0);
  const b=document.querySelector('.nav button[data-t="chat"]');
  if(b){let s=b.querySelector(".ykbdg");if(!s){b.style.position="relative";s=document.createElement("i");s.className="ykbdg";b.appendChild(s)}
    s.textContent=total>99?"99+":String(total);s.style.display=total?"flex":"none"}
  try{if(navigator.setAppBadge){total?navigator.setAppBadge(total):navigator.clearAppBadge()}}catch(e){}
  const l=document.getElementById("cList");if(l&&typeof cListHtml==="function")l.innerHTML=cListHtml();
}
async function poll(){
  if(busy||!uid()||document.hidden)return;busy=true;
  try{
    if(!cl.conv&&!cl.cTs&&typeof loadConv==="function")await loadConv();
    const mine=cl.mine||{},dms=new Set((cl.dm||[]).map(d=>String(d.id)));
    const [g,d]=await Promise.all([
      sb("/rest/v1/messages?select=group_id,created_at,user_id&order=id.desc&limit="+CAP),
      sb("/rest/v1/dm_messages?select=chat_id,created_at,user_id&order=id.desc&limit="+CAP)]);
    const o=store(),b=base(o),me=uid(),u={},lt={};
    (g||[]).forEach(m=>{const k="g:"+m.group_id;if(!mine[m.group_id])return;const t=T(m.created_at);if(t>(lt[k]||0))lt[k]=t;if(m.user_id!==me&&t>(o[k]||b))u[k]=(u[k]||0)+1});
    (d||[]).forEach(m=>{if(!dms.has(String(m.chat_id)))return;const k="d:"+m.chat_id,t=T(m.created_at);if(t>(lt[k]||0))lt[k]=t;if(m.user_id!==me&&t>(o[k]||b))u[k]=(u[k]||0)+1});
    const before=JSON.stringify(unread);latest=lt;unread=u;
    const ck=curKey();if(ck){markRead(ck)}
    paint();
    if(JSON.stringify(unread)!==before&&current==="chat"&&!pageStack.length&&typeof loadConv==="function")loadConv();
  }catch(e){}finally{busy=false}
}
// badge on each conversation row
const _cl=window.cListHtml;
if(typeof _cl==="function"){window.cListHtml=function(){
  const h=_cl.apply(this,arguments);if(!h||h.indexOf('class="conv"')<0)return h;
  const parts=h.split('<button class="conv"');let out=parts[0];
  for(let i=1;i<parts.length;i++){let p=parts[i];
    const m=/data-t="(g|d)" data-id="([^"]*)"/.exec(p),n=m?unread[m[1]+":"+m[2]]:0;
    if(n){p=p.replace('<span class="ct">','<span class="ykn">'+(n>99?"99+":n)+'</span><span class="ct">');out+='<button class="conv unread"'+p}
    else out+='<button class="conv"'+p}
  return out}}
// opening a chat marks it read
const _od=window.openDm;if(typeof _od==="function")window.openDm=function(e){const r=_od.apply(this,arguments);markRead("d:"+e);return r};
const _og=window.openGroup;if(typeof _og==="function")window.openGroup=function(e,t){const r=_og.apply(this,arguments);if(t==="chat")markRead("g:"+e);return r};
// styles
const st=document.createElement("style");st.textContent=
".ykbdg{position:absolute;top:2px;inset-inline-start:calc(50% + 4px);min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#e53935;color:#fff;font:700 10px/17px system-ui,sans-serif;font-style:normal;display:none;align-items:center;justify-content:center;box-sizing:border-box}"+
".conv .ykn{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#1fa37a;color:#fff;font:700 11px/20px system-ui,sans-serif;text-align:center;flex-shrink:0;box-sizing:border-box}"+
".conv.unread .cb b,.conv.unread .cb small{font-weight:700;color:var(--dark)}";
document.head.append(st);
function start(){if(timer)return;timer=setInterval(poll,POLL);poll();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)poll()});
  window.addEventListener("focus",poll)}
if(document.readyState==="complete")setTimeout(start,1500);else window.addEventListener("load",()=>setTimeout(start,1500));
})();
