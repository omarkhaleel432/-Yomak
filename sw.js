// Old address: this worker only clears itself and reloads open pages (the page then moves to the new site).
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  for(const k of await caches.keys())await caches.delete(k);
  await self.registration.unregister();
  for(const c of await self.clients.matchAll({type:'window'})){try{c.navigate(c.url)}catch(x){}}})())});
