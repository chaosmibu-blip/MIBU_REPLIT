/// <reference types="vite/client" />
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Navigation, Loader2 } from 'lucide-react';

const MIBU_BRAND_COLORS = {
  primary: '#8B7355',
  secondary: '#C4A77D',
  background: '#F5F0E6',
  accent: '#5D4E37',
  water: '#C4A77D',
  land: '#F5F0E6',
  building: '#D4C4A8',
  road: '#E8E0D0',
};

interface MibuMapProps {
  center?: [number, number];
  zoom?: number;
  markers?: Array<{
    lng: number;
    lat: number;
    title?: string;
    description?: string;
    color?: string;
  }>;
  onLocationUpdate?: (location: { lat: number; lng: number }) => void;
  showUserLocation?: boolean;
  className?: string;
}

export const MibuMap: React.FC<MibuMapProps> = ({
  center = [121.5654, 25.0330],
  zoom = 12,
  markers = [],
  onLocationUpdate,
  showUserLocation = true,
  className = '',
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const placeMarkers = useRef<mapboxgl.Marker[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) return;

    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      setMapError('地圖服務未設定');
      console.error('Mapbox access token not found');
      return;
    }

    try {
      mapboxgl.accessToken = accessToken;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: center,
        zoom: zoom,
        attributionControl: false,
      });

      map.current.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        'bottom-left'
      );

      map.current.on('load', () => {
        setMapLoaded(true);
        if (!map.current) return;

        try {
          map.current.setPaintProperty('water', 'fill-color', MIBU_BRAND_COLORS.water);
        } catch (e) {}
        
        try {
          map.current.setPaintProperty('background', 'background-color', MIBU_BRAND_COLORS.land);
        } catch (e) {}
        
        try {
          map.current.setPaintProperty('landuse', 'fill-color', MIBU_BRAND_COLORS.land);
        } catch (e) {}
        
        try {
          map.current.setPaintProperty('landcover', 'fill-color', MIBU_BRAND_COLORS.land);
        } catch (e) {}
        
        try {
          map.current.setPaintProperty('building', 'fill-color', MIBU_BRAND_COLORS.building);
        } catch (e) {}
        
        try {
          const roadLayers = ['road-street', 'road-minor', 'road-primary', 'road-secondary-tertiary', 'road-motorway-trunk'];
          roadLayers.forEach(layer => {
            try {
              map.current?.setPaintProperty(layer, 'line-color', MIBU_BRAND_COLORS.road);
            } catch (e) {}
          });
        } catch (e) {}
      });

      map.current.on('error', (e: any) => {
        console.error('Map error:', e);
        const errorMessage = e?.error?.message || e?.message || '地圖載入失敗';
        console.error('Detailed error:', errorMessage);
        setMapError(errorMessage);
      });
    } catch (err) {
      console.error('Failed to initialize map:', err);
      setMapError('地圖初始化失敗');
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    placeMarkers.current.forEach(m => m.remove());
    placeMarkers.current = [];

    markers.forEach((marker) => {
      if (marker.lng == null || marker.lat == null || isNaN(marker.lng) || isNaN(marker.lat)) return;
      
      const el = document.createElement('div');
      el.className = 'mibu-marker';
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = marker.color || MIBU_BRAND_COLORS.primary;
      el.style.border = `3px solid ${MIBU_BRAND_COLORS.background}`;
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<div style="padding: 8px;">
          <strong style="color: ${MIBU_BRAND_COLORS.accent};">${marker.title || '景點'}</strong>
          ${marker.description ? `<p style="margin: 4px 0 0; color: ${MIBU_BRAND_COLORS.primary}; font-size: 12px;">${marker.description}</p>` : ''}
        </div>`
      );

      const newMarker = new mapboxgl.Marker(el)
        .setLngLat([marker.lng, marker.lat])
        .setPopup(popup)
        .addTo(map.current!);
      
      placeMarkers.current.push(newMarker);
    });
    
    if (markers.length > 0 && map.current) {
      const validMarkers = markers.filter(m => m.lng != null && m.lat != null && !isNaN(m.lng) && !isNaN(m.lat));
      if (validMarkers.length === 1) {
        map.current.flyTo({ center: [validMarkers[0].lng, validMarkers[0].lat], zoom: 14 });
      } else if (validMarkers.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        validMarkers.forEach(m => bounds.extend([m.lng, m.lat]));
        map.current.fitBounds(bounds, { padding: 50, maxZoom: 15 });
      }
    }
  }, [markers]);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('你的瀏覽器不支援定位功能');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const location = { lat: latitude, lng: longitude };
        setUserLocation(location);
        setIsLocating(false);

        if (map.current) {
          map.current.flyTo({
            center: [longitude, latitude],
            zoom: 15,
            duration: 1500,
          });

          if (userMarker.current) {
            userMarker.current.remove();
          }

          const el = document.createElement('div');
          el.className = 'user-location-marker';
          el.style.width = '20px';
          el.style.height = '20px';
          el.style.borderRadius = '50%';
          el.style.backgroundColor = '#4F46E5';
          el.style.border = '3px solid white';
          el.style.boxShadow = '0 0 0 2px #4F46E5, 0 2px 8px rgba(79, 70, 229, 0.4)';

          userMarker.current = new mapboxgl.Marker(el)
            .setLngLat([longitude, latitude])
            .addTo(map.current);
        }

        onLocationUpdate?.(location);
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('請允許存取你的位置');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('無法取得位置資訊');
            break;
          case error.TIMEOUT:
            setLocationError('定位逾時，請重試');
            break;
          default:
            setLocationError('定位失敗');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`} style={{ minHeight: '320px' }}>
      <div
        ref={mapContainer}
        className="absolute inset-0 w-full h-full"
        style={{ backgroundColor: MIBU_BRAND_COLORS.background }}
      />

      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: MIBU_BRAND_COLORS.background }}>
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" style={{ color: MIBU_BRAND_COLORS.primary }} />
            <p className="text-sm" style={{ color: MIBU_BRAND_COLORS.accent }}>載入地圖中...</p>
          </div>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: MIBU_BRAND_COLORS.background }}>
          <div className="text-center p-4">
            <MapPin className="w-8 h-8 mx-auto mb-2" style={{ color: MIBU_BRAND_COLORS.primary }} />
            <p className="text-sm font-medium" style={{ color: MIBU_BRAND_COLORS.accent }}>{mapError}</p>
          </div>
        </div>
      )}

      {showUserLocation && mapLoaded && (
        <button
          onClick={getCurrentLocation}
          disabled={isLocating}
          className="absolute bottom-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 z-10"
          style={{ border: `2px solid ${MIBU_BRAND_COLORS.primary}` }}
          data-testid="button-locate-me"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: MIBU_BRAND_COLORS.primary }} />
          ) : (
            <Navigation className="w-5 h-5" style={{ color: MIBU_BRAND_COLORS.primary }} />
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

      {userLocation && mapLoaded && (
        <div
          className="absolute top-4 left-4 px-3 py-2 rounded-lg text-xs z-10"
          style={{
            backgroundColor: MIBU_BRAND_COLORS.background,
            color: MIBU_BRAND_COLORS.accent,
            border: `1px solid ${MIBU_BRAND_COLORS.secondary}`,
          }}
        >
          <MapPin className="w-3 h-3 inline mr-1" />
          {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
        </div>
      )}
    </div>
  );
};

export default MibuMap;
