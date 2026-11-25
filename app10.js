/* YOMAK v12: bottom bar = الرئيسية | الجروبات | انشر | المحادثات | مصروفاتي | حسابي. "الخدمات" moves to a tile on Home. */
(function(){
const st=document.createElement("style");
st.textContent=".nav{grid-template-columns:repeat(6,1fr)}.nav button{font-size:9.5px}.nav button span{font-size:17px}.nav .plus span{font-size:22px}.hub.svcrow{margin:8px 0}";
document.head.append(st);
const MAP={day:"home",services:"home",orders:"profile"};
function mark(){const e=typeof current==="string"?current:"home",t=MAP[e]||e;
  document.querySelectorAll(".nav button").forEach(b=>{const on=b.dataset.t===t;b.classList.toggle("active",on);b.setAttribute("aria-current",on?"page":"false")})}
const _go=window.go;
if(typeof _go==="function")window.go=function(){const r=_go.apply(this,arguments);mark();return r};
const _fh=window.feedHome;
if(typeof _fh==="function")window.feedHome=function(){const h=_fh.apply(this,arguments);
  return '<div class="hub svcrow"><button onclick="go(\'services\')"><span>▦</span>الخدمات</button></div>'+h};
mark();
})();
