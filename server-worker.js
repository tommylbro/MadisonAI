// A basic service worker for a PWA
const CACHE_NAME = 'MadisonAI-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  // You might need to add other assets here, like CSS, JS, and image files if not dynamically loaded.
  // The React build process typically handles this for you.
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
