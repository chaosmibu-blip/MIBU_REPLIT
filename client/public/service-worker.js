const CACHE_VERSION = 'v2';
const STATIC_CACHE = `mibu-static-${CACHE_VERSION}`;
const API_CACHE = `mibu-api-${CACHE_VERSION}`;
const MAP_CACHE = `mibu-map-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/app-icon.jpg',
  '/favicon.png',
];

const API_ROUTES_TO_CACHE = [
  '/api/locations/countries',
  '/api/locations/regions/',
  '/api/locations/districts/',
  '/api/categories',
  '/api/subcategories',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name.startsWith('mibu-') && 
              name !== STATIC_CACHE && 
              name !== API_CACHE && 
              name !== MAP_CACHE;
          })
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.hostname.includes('api.mapbox.com') || url.hostname.includes('tiles.mapbox.com')) {
    event.respondWith(handleMapRequest(event.request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(event.request, url));
    return;
  }

  event.respondWith(handleStaticRequest(event.request));
});

async function handleMapRequest(request) {
  const cache = await caches.open(MAP_CACHE);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    fetch(request).then(response => {
      if (response.ok) {
        cache.put(request, response);
      }
    }).catch(() => {});
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline - Map tiles unavailable', { status: 503 });
  }
}

async function handleApiRequest(request, url) {
  const cache = await caches.open(API_CACHE);
  const shouldCache = API_ROUTES_TO_CACHE.some(route => url.pathname.startsWith(route));
  
  if (url.pathname.startsWith('/api/offline/itinerary/')) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(
      JSON.stringify({ error: 'Itinerary not found offline', offline: true }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && shouldCache) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(
      JSON.stringify({ error: 'Offline', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    fetch(request).then(response => {
      if (response.ok) {
        caches.open(STATIC_CACHE).then(cache => {
          cache.put(request, response);
        });
      }
    }).catch(() => {});
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    if (request.destination === 'document') {
      return caches.match('/');
    }
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};

  if (type === 'CACHE_MAP_TILES') {
    handleCacheMapTiles(event, data.tiles);
  }

  if (type === 'CLEAR_MAP_CACHE') {
    handleClearMapCache(event);
  }

  if (type === 'GET_CACHE_SIZE') {
    handleGetCacheSize(event);
  }

  if (type === 'CACHE_ITINERARY') {
    handleCacheItinerary(event, data);
  }
});

async function handleCacheMapTiles(event, tiles) {
  const cache = await caches.open(MAP_CACHE);
  let cached = 0;
  
  await Promise.all(tiles.map(async (url) => {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        cached++;
      }
    } catch (e) {}
  }));

  event.ports[0]?.postMessage({ success: true, count: cached });
}

async function handleClearMapCache(event) {
  await caches.delete(MAP_CACHE);
  event.ports[0]?.postMessage({ success: true });
}

async function handleGetCacheSize(event) {
  const [staticCache, apiCache, mapCache] = await Promise.all([
    caches.open(STATIC_CACHE),
    caches.open(API_CACHE),
    caches.open(MAP_CACHE)
  ]);

  const [staticKeys, apiKeys, mapKeys] = await Promise.all([
    staticCache.keys(),
    apiCache.keys(),
    mapCache.keys()
  ]);

  event.ports[0]?.postMessage({
    static: staticKeys.length,
    api: apiKeys.length,
    map: mapKeys.length,
    total: staticKeys.length + apiKeys.length + mapKeys.length
  });
}

async function handleCacheItinerary(event, itineraryData) {
  const cache = await caches.open(API_CACHE);
  const url = `/api/offline/itinerary/${itineraryData.id}`;
  const response = new Response(JSON.stringify(itineraryData), {
    headers: { 'Content-Type': 'application/json' }
  });
  await cache.put(url, response);
  event.ports[0]?.postMessage({ success: true });
}
