// Old address: this worker only clears itself and sends every open page to the new site.
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  for(const k of await caches.keys())await caches.delete(k);
  await self.registration.unregister();
  for(const c of await self.clients.matchAll({type:'window'})){try{c.navigate('https://yomak-app.github.io/')}catch(x){}}})())});
self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(new Response('<script>location.replace("https://yomak-app.github.io/")</script>',{headers:{'Content-Type':'text/html'}}))});
