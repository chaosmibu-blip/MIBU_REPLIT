let preloadPromise: Promise<string | null> | null = null;
let cachedToken: string | null = null;
let isMapboxLoaded = false;
let preconnectDone = false;

export async function preloadMapboxToken(): Promise<string | null> {
  if (cachedToken) {
    return cachedToken;
  }

  if (preloadPromise) {
    return preloadPromise;
  }

  if (!preconnectDone) {
    addPreconnectLinks();
    preconnectDone = true;
  }

  preloadPromise = fetch('/api/config/mapbox')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch Mapbox config');
      }
      return response.json();
    })
    .then(config => {
      if (config.accessToken) {
        cachedToken = config.accessToken;
        return cachedToken;
      }
      return null;
    })
    .catch(error => {
      console.error('Failed to preload Mapbox token:', error);
      preloadPromise = null;
      return null;
    });

  return preloadPromise;
}

function addPreconnectLinks(): void {
  const domains = [
    'https://api.mapbox.com',
    'https://tiles.mapbox.com',
    'https://events.mapbox.com'
  ];

  domains.forEach(href => {
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);

      const dnsLink = document.createElement('link');
      dnsLink.rel = 'dns-prefetch';
      dnsLink.href = href;
      document.head.appendChild(dnsLink);
    }
  });
}

export function getCachedToken(): string | null {
  return cachedToken;
}

export function isTokenPreloaded(): boolean {
  return cachedToken !== null;
}

export async function preloadMapboxResources(): Promise<void> {
  if (isMapboxLoaded) {
    return;
  }

  try {
    await preloadMapboxToken();
    
    if (cachedToken) {
      isMapboxLoaded = true;
    }
  } catch (error) {
    console.error('Failed to preload Mapbox resources:', error);
  }
}

export function clearMapboxCache(): void {
  cachedToken = null;
  preloadPromise = null;
  isMapboxLoaded = false;
}

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      preloadMapboxToken();
    });
  } else {
    setTimeout(() => {
      preloadMapboxToken();
    }, 100);
  }
}
