const V='nsvr-v3';
const CORE=['./','index.html','app.js','i18n.js','manifest.webmanifest','icon-192.png','icon-512.png','lib/three.min.js','lib/astronomy.browser.min.js','data/skydata.js','data/comets.js',
 'tex/milkyway.jpg','tex/moon.jpg','tex/mercury.png','tex/venus.png','tex/mars.png','tex/jupiter.png','tex/saturn.png','tex/uranus.png','tex/neptune.png','tex/io.png','tex/europa.png','tex/ganymede.png','tex/callisto.png','tex/saturn_rings_radial.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=='nsvr-img').map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(u.origin===location.origin){// network first for app code so updates arrive, cache fallback offline
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));return;}
 if(u.hostname==='raw.githubusercontent.com'||u.hostname.endsWith('gstatic.com')||u.hostname.endsWith('googleapis.com')){
  e.respondWith(caches.open('nsvr-img').then(c=>c.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok||r.type==='opaque')c.put(e.request,r.clone());return r;}))));}});
