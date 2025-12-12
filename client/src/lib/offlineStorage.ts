const DB_NAME = 'mibu-offline';
const DB_VERSION = 1;

export interface OfflineItinerary {
  id: string;
  name: string;
  country: string;
  city: string;
  district: string;
  items: any[];
  createdAt: string;
  savedAt: string;
  mapBounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  isMapCached: boolean;
}

interface OfflinePlace {
  id: string;
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  description: string;
  rating?: number;
  savedAt: string;
}

let db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains('itineraries')) {
        const itineraryStore = database.createObjectStore('itineraries', { keyPath: 'id' });
        itineraryStore.createIndex('savedAt', 'savedAt', { unique: false });
        itineraryStore.createIndex('city', 'city', { unique: false });
      }

      if (!database.objectStoreNames.contains('places')) {
        const placeStore = database.createObjectStore('places', { keyPath: 'id' });
        placeStore.createIndex('placeId', 'placeId', { unique: true });
        placeStore.createIndex('category', 'category', { unique: false });
      }

      if (!database.objectStoreNames.contains('mapTiles')) {
        database.createObjectStore('mapTiles', { keyPath: 'url' });
      }
    };
  });
}

export async function saveItineraryOffline(itinerary: OfflineItinerary): Promise<void> {
  const database = await openDB();
  
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(['itineraries'], 'readwrite');
    const store = transaction.objectStore('itineraries');
    
    const data = {
      ...itinerary,
      savedAt: new Date().toISOString(),
    };
    
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
  
  try {
    await sendMessageToSW({ 
      type: 'CACHE_ITINERARY', 
      data: { ...itinerary, savedAt: new Date().toISOString() } 
    });
  } catch (e) {
  }
}

export async function getOfflineItinerary(id: string): Promise<OfflineItinerary | null> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['itineraries'], 'readonly');
    const store = transaction.objectStore('itineraries');
    const request = store.get(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

export async function getAllOfflineItineraries(): Promise<OfflineItinerary[]> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['itineraries'], 'readonly');
    const store = transaction.objectStore('itineraries');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

export async function deleteOfflineItinerary(id: string): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['itineraries'], 'readwrite');
    const store = transaction.objectStore('itineraries');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function savePlaceOffline(place: OfflinePlace): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['places'], 'readwrite');
    const store = transaction.objectStore('places');
    
    const data = {
      ...place,
      savedAt: new Date().toISOString(),
    };
    
    const request = store.put(data);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getOfflinePlaces(): Promise<OfflinePlace[]> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['places'], 'readonly');
    const store = transaction.objectStore('places');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

export async function isItinerarySavedOffline(id: string): Promise<boolean> {
  const itinerary = await getOfflineItinerary(id);
  return itinerary !== null;
}

export async function getOfflineStorageSize(): Promise<{ itineraries: number; places: number; total: number }> {
  const database = await openDB();
  
  const getCount = (storeName: string): Promise<number> => {
    return new Promise((resolve) => {
      const transaction = database.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  };

  const [itineraries, places] = await Promise.all([
    getCount('itineraries'),
    getCount('places'),
  ]);

  return { itineraries, places, total: itineraries + places };
}

export async function clearAllOfflineData(): Promise<void> {
  const database = await openDB();
  
  const clearStore = (storeName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  await Promise.all([
    clearStore('itineraries'),
    clearStore('places'),
    clearStore('mapTiles'),
  ]);
}

export function sendMessageToSW(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker.controller) {
      reject(new Error('No service worker controller'));
      return;
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data);
    
    const timeout = setTimeout(() => {
      reject(new Error('Service worker message timeout'));
    }, 10000);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data);
    };
    
    navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
  });
}

export async function cacheMapTilesForBounds(
  bounds: { north: number; south: number; east: number; west: number },
  zoom: number = 14,
  accessToken: string
): Promise<{ success: boolean; count: number }> {
  const tiles: string[] = [];
  
  const lat2tile = (lat: number, z: number) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
  const lng2tile = (lng: number, z: number) => Math.floor((lng + 180) / 360 * Math.pow(2, z));

  for (let z = Math.max(10, zoom - 2); z <= zoom + 1; z++) {
    const minX = lng2tile(bounds.west, z);
    const maxX = lng2tile(bounds.east, z);
    const minY = lat2tile(bounds.north, z);
    const maxY = lat2tile(bounds.south, z);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push(
          `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/${z}/${x}/${y}?access_token=${accessToken}`
        );
      }
    }
  }

  if (tiles.length > 500) {
    tiles.length = 500;
  }

  try {
    const result = await sendMessageToSW({ type: 'CACHE_MAP_TILES', data: { tiles } });
    return result;
  } catch (error) {
    console.error('Failed to cache map tiles:', error);
    return { success: false, count: 0 };
  }
}

export async function getCacheStatus(): Promise<{
  static: number;
  api: number;
  map: number;
  swTotal: number;
  itineraries: number;
  places: number;
}> {
  try {
    const [swCache, dbSize] = await Promise.all([
      sendMessageToSW({ type: 'GET_CACHE_SIZE' }),
      getOfflineStorageSize(),
    ]);
    return { 
      static: swCache.static || 0,
      api: swCache.api || 0,
      map: swCache.map || 0,
      swTotal: swCache.total || 0,
      itineraries: dbSize.itineraries,
      places: dbSize.places,
    };
  } catch (error) {
    const dbSize = await getOfflineStorageSize();
    return { static: 0, api: 0, map: 0, swTotal: 0, ...dbSize };
  }
}
