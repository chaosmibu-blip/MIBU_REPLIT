import React, { useEffect, useRef, useState } from 'react';
import { useGlobalMap } from '../context/MapContext';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Navigation, Loader2, Download, CheckCircle2 } from 'lucide-react';
import { cacheMapTilesForBounds } from '../../../../client/src/lib/offlineStorage';

const MIBU_BRAND_COLORS = {
  primary: '#8B7355',
  secondary: '#C4A77D',
  background: '#F5F0E6',
  accent: '#5D4E37',
};

interface MarkerData {
  lng: number;
  lat: number;
  title?: string;
  description?: string;
  color?: string;
}

interface GlobalMapViewProps {
  markers?: MarkerData[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  fullscreen?: boolean;
  showUserLocation?: boolean;
  showOfflineDownload?: boolean;
  onOfflineDownloadComplete?: (bounds: { north: number; south: number; east: number; west: number }) => void;
}

function createMarkerKey(m: MarkerData): string {
  return `${m.lng.toFixed(6)},${m.lat.toFixed(6)}`;
}

export const GlobalMapView: React.FC<GlobalMapViewProps> = ({
  markers = [],
  center,
  zoom = 12,
  className = '',
  fullscreen = false,
  showUserLocation = true,
  showOfflineDownload = false,
  onOfflineDownloadComplete,
}) => {
  const containerId = useRef(`map-container-${Date.now()}`);
  const markersMapRef = useRef<Map<string, { marker: mapboxgl.Marker; data: MarkerData }>>(new Map());
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const hasMountedRef = useRef(false);

  const {
    isMapReady,
    userLocation,
    locationError,
    isTracking,
    getMapInstance,
    flyTo,
    centerOnUser,
    returnMapToHiddenContainer,
  } = useGlobalMap();

  const [isDownloadingOffline, setIsDownloadingOffline] = useState(false);
  const [offlineDownloaded, setOfflineDownloaded] = useState(false);
  const lastCenterRef = useRef<string | null>(null);

  useEffect(() => {
    if (isMapReady && !hasMountedRef.current) {
      const map = getMapInstance(containerId.current);
      mapInstanceRef.current = map;
      hasMountedRef.current = true;

      if (map && center) {
        map.setCenter(center);
        map.setZoom(zoom);
        lastCenterRef.current = `${center[0]},${center[1]}`;
      } else if (map && userLocation) {
        map.flyTo({
          center: [userLocation.lng, userLocation.lat],
          zoom: 15,
          duration: 1000,
        });
        lastCenterRef.current = `${userLocation.lng},${userLocation.lat}`;
      }
    }
  }, [isMapReady, getMapInstance]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isMapReady || !hasMountedRef.current) return;
    
    if (center) {
      const centerKey = `${center[0]},${center[1]}`;
      if (lastCenterRef.current !== centerKey) {
        map.flyTo({
          center: center,
          zoom: zoom,
          duration: 800,
        });
        lastCenterRef.current = centerKey;
      }
    }
  }, [center, zoom, isMapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isMapReady) return;

    const currentKeys = new Set(markers.map(createMarkerKey));
    const existingKeys = Array.from(markersMapRef.current.keys());

    existingKeys.forEach((key) => {
      if (!currentKeys.has(key)) {
        const item = markersMapRef.current.get(key);
        if (item) {
          item.marker.remove();
          markersMapRef.current.delete(key);
        }
      }
    });

    for (const markerData of markers) {
      if (markerData.lat == null || markerData.lng == null ||
          isNaN(markerData.lat) || isNaN(markerData.lng)) {
        continue;
      }

      const key = createMarkerKey(markerData);
      const existing = markersMapRef.current.get(key);

      if (existing) {
        const needsUpdate = existing.data.color !== markerData.color ||
                           existing.data.title !== markerData.title ||
                           existing.data.description !== markerData.description;

        if (needsUpdate) {
          existing.marker.remove();
          markersMapRef.current.delete(key);
        } else {
          continue;
        }
      }

      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.backgroundColor = markerData.color || MIBU_BRAND_COLORS.primary;
      el.style.border = `3px solid ${MIBU_BRAND_COLORS.background}`;
      el.style.borderRadius = '50%';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';

      const marker = new mapboxgl.Marker(el)
        .setLngLat([markerData.lng, markerData.lat])
        .addTo(map);

      if (markerData.title || markerData.description) {
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px;">
            ${markerData.title ? `<strong>${markerData.title}</strong>` : ''}
            ${markerData.description ? `<p style="margin-top: 4px; font-size: 14px;">${markerData.description}</p>` : ''}
          </div>
        `);
        marker.setPopup(popup);
      }

      markersMapRef.current.set(key, { marker, data: markerData });
    }
  }, [markers, isMapReady]);

  useEffect(() => {
    return () => {
      markersMapRef.current.forEach(({ marker }) => marker.remove());
      markersMapRef.current.clear();
      returnMapToHiddenContainer();
    };
  }, [returnMapToHiddenContainer]);

  const containerStyle = fullscreen
    ? { height: '100%', width: '100%' }
    : { minHeight: '320px', height: '320px' };

  return (
    <div className={`relative overflow-hidden ${fullscreen ? '' : 'rounded-xl'} ${className}`} style={containerStyle}>
      <style>{`
        .mapboxgl-ctrl-logo,
        .mapboxgl-ctrl-attrib {
          display: none !important;
        }
      `}</style>
      <div
        id={containerId.current}
        style={{ width: '100%', height: '100%' }}
        data-testid="map-container"
      />

      {!isMapReady && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: MIBU_BRAND_COLORS.background }}
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: MIBU_BRAND_COLORS.primary }} />
            <span className="text-sm" style={{ color: MIBU_BRAND_COLORS.accent }}>載入地圖中...</span>
          </div>
        </div>
      )}

      {showUserLocation && isMapReady && (
        <button
          onClick={centerOnUser}
          className="absolute bottom-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-all z-10"
          style={{ border: `2px solid ${isTracking ? '#3B82F6' : MIBU_BRAND_COLORS.primary}` }}
          data-testid="button-locate-me"
        >
          <Navigation className="w-5 h-5" style={{ color: isTracking ? '#3B82F6' : MIBU_BRAND_COLORS.primary }} />
        </button>
      )}

      {showOfflineDownload && isMapReady && (
        <button
          onClick={async () => {
            const map = mapInstanceRef.current;
            if (!map || isDownloadingOffline || offlineDownloaded) return;
            setIsDownloadingOffline(true);
            try {
              const bounds = map.getBounds();
              if (!bounds) return;
              const mapBounds = {
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest(),
              };
              const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
              const result = await cacheMapTilesForBounds(mapBounds, Math.round(map.getZoom()), accessToken);
              if (result.success) {
                setOfflineDownloaded(true);
                onOfflineDownloadComplete?.(mapBounds);
              }
            } catch (error) {
              console.error('Failed to cache map:', error);
            } finally {
              setIsDownloadingOffline(false);
            }
          }}
          disabled={isDownloadingOffline || offlineDownloaded}
          className="absolute bottom-4 left-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 z-10"
          style={{ border: `2px solid ${offlineDownloaded ? '#22C55E' : MIBU_BRAND_COLORS.primary}` }}
          data-testid="button-download-offline-map"
        >
          {isDownloadingOffline ? (
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: MIBU_BRAND_COLORS.primary }} />
          ) : offlineDownloaded ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Download className="w-5 h-5" style={{ color: MIBU_BRAND_COLORS.primary }} />
          )}
        </button>
      )}

      {locationError && (
        <div
          className="absolute top-4 left-4 right-4 p-3 rounded-lg text-sm z-10"
          style={{
            backgroundColor: MIBU_BRAND_COLORS.background,
            color: MIBU_BRAND_COLORS.accent,
            border: `1px solid ${MIBU_BRAND_COLORS.primary}`,
          }}
        >
          {locationError}
        </div>
      )}
    </div>
  );
};

export default GlobalMapView;
