const dynamicCacheName = 'site-dynamic-v1';
const assets = [
    "index.html",
    "script.js",
    // Styles
    "style.less",
    "utilities.less",
    // Montserrat
    // "http://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap",
    // ID3 writer
    "https://egoroof.ru/browser-id3-writer/js/browser-id3-writer.4.0.0.js",
    // Zip.js
    "https://cdn.jsdelivr.net/gh/gildas-lormeau/zip.js@2.4.5/dist/zip.min.js",
    // Vue.js
    "https://unpkg.com/vue@3",
    // Indexeddb
    "https://rawcdn.githack.com/xuset/idb-kv-store/fc51e037c8bca7a143de379402b55d3f8a04971b/idbkvstore.min.js",
]
// activate event
self.addEventListener('activate', evt => {
	evt.waitUntil(
    caches.open(dynamicCacheName).then((cache) => {
      cache.addAll(assets);
    })
  );
  evt.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key =>  key !== dynamicCacheName)
        .map(key => caches.delete(key))
      );
    })
  );
});
// fetch event
self.addEventListener('fetch', evt => {
  evt.respondWith(
    caches.match(evt.request).then(cacheRes => {
      return cacheRes || fetch(evt.request).then(fetchRes => {
        return caches.open(dynamicCacheName).then(cache => {
          cache.put(evt.request.url, fetchRes.clone());
          return fetchRes;
        })
      });
    })
  );
});