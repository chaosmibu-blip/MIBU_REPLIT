/// <reference types="vite/client" />
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Navigation, Loader2 } from 'lucide-react';

const MIBU_BRAND_COLORS = {
  primary: '#8B7355',
  secondary: '#C4A77D',
  background: '#F5F0E6',
  accent: '#5D4E37',
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
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const initMap = async () => {
      try {
        const response = await fetch('/api/config/mapbox');
        if (!response.ok) {
          throw new Error('Failed to fetch Mapbox config');
        }
        const config = await response.json();
        
        if (!config.accessToken) {
          setMapError('地圖金鑰未設定');
          setIsInitializing(false);
          return;
        }

        mapboxgl.accessToken = config.accessToken;

        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: center,
          zoom: zoom,
          attributionControl: true,
        });

        map.current.on('load', () => {
          setMapLoaded(true);
          setIsInitializing(false);
          console.log('Mapbox map loaded successfully');
        });

        map.current.on('error', (e) => {
          console.error('Mapbox error:', e);
          setMapError('地圖載入失敗');
          setIsInitializing(false);
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      } catch (error) {
        console.error('Failed to initialize Mapbox:', error);
        setMapError('無法初始化地圖');
        setIsInitializing(false);
      }
    };

    initMap();

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    markers.forEach((markerData) => {
      if (markerData.lat == null || markerData.lng == null || 
          isNaN(markerData.lat) || isNaN(markerData.lng)) {
        return;
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
        .addTo(map.current!);

      if (markerData.title || markerData.description) {
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px;">
            ${markerData.title ? `<strong>${markerData.title}</strong>` : ''}
            ${markerData.description ? `<p style="margin-top: 4px; font-size: 14px;">${markerData.description}</p>` : ''}
          </div>
        `);
        marker.setPopup(popup);
      }

      markersRef.current.push(marker);
    });
  }, [markers, mapLoaded]);

  const updateUserMarker = (lng: number, lat: number) => {
    if (!map.current || !mapLoaded) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }

    const el = document.createElement('div');
    el.style.width = '16px';
    el.style.height = '16px';
    el.style.backgroundColor = '#3B82F6';
    el.style.border = '3px solid white';
    el.style.borderRadius = '50%';
    el.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.3), 0 2px 8px rgba(0,0,0,0.3)';

    userMarkerRef.current = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .addTo(map.current);

    map.current.flyTo({
      center: [lng, lat],
      zoom: 15,
      duration: 1000,
    });
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('您的瀏覽器不支援定位功能');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([longitude, latitude]);
        setIsLocating(false);
        
        updateUserMarker(longitude, latitude);
        
        if (onLocationUpdate) {
          onLocationUpdate({ lat: latitude, lng: longitude });
        }
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('請允許存取您的位置');
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
        maximumAge: 60000,
      }
    );
  };

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`} style={{ minHeight: '320px', height: '320px' }}>
      <div 
        ref={mapContainer} 
        style={{ width: '100%', height: '100%' }}
        data-testid="map-container"
      />

      {isInitializing && (
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

      {mapError && (
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: MIBU_BRAND_COLORS.background }}
        >
          <div className="text-center p-4">
            <MapPin className="w-12 h-12 mx-auto mb-2" style={{ color: MIBU_BRAND_COLORS.secondary }} />
            <p style={{ color: MIBU_BRAND_COLORS.accent }}>{mapError}</p>
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
          {userLocation[1].toFixed(4)}, {userLocation[0].toFixed(4)}
        </div>
      )}
    </div>
  );
};

export default MibuMap;
