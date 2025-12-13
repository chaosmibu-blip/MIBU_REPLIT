import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxLanguage from '@mapbox/mapbox-gl-language';
import { preloadMapboxToken } from '../lib/mapPreloader';

interface UserLocation {
  lng: number;
  lat: number;
  accuracy?: number;
  timestamp: number;
}

interface MapContextValue {
  isMapReady: boolean;
  isMapLoading: boolean;
  loadProgress: number;
  userLocation: UserLocation | null;
  locationError: string | null;
  isTracking: boolean;
  getMapInstance: (containerId: string) => mapboxgl.Map | null;
  moveMapToContainer: (containerId: string) => void;
  returnMapToHiddenContainer: () => void;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  startTracking: () => void;
  stopTracking: () => void;
  centerOnUser: () => void;
}

const MapContext = createContext<MapContextValue | null>(null);

const LANGUAGE_MAP: Record<string, string> = {
  'zh-TW': 'zh-Hant',
  'en': 'en',
  'ja': 'ja',
  'ko': 'ko',
};

const DEFAULT_CENTER: [number, number] = [121.5654, 25.0330];
const DEFAULT_ZOOM = 12;

export const MapProvider: React.FC<{ children: React.ReactNode; language?: string }> = ({ 
  children, 
  language = 'zh-TW' 
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement | null>(null);
  const currentContainerIdRef = useRef<string>('__hidden_map_container__');
  const watchIdRef = useRef<number | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const updateUserMarker = useCallback((lng: number, lat: number) => {
    if (!mapRef.current) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement('div');
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.backgroundColor = '#3B82F6';
      el.style.border = '3px solid white';
      el.style.borderRadius = '50%';
      el.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.3), 0 2px 8px rgba(0,0,0,0.3)';

      userMarkerRef.current = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation || isTracking) return;

    setIsTracking(true);
    setLocationError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const newLocation: UserLocation = {
          lng: longitude,
          lat: latitude,
          accuracy,
          timestamp: Date.now()
        };
        setUserLocation(newLocation);
        setLocationError(null);

        if (mapRef.current) {
          updateUserMarker(longitude, latitude);
        }
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('請允許存取您的位置');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('無法取得位置資訊');
            break;
          case error.TIMEOUT:
            setLocationError('定位逾時');
            break;
          default:
            setLocationError('定位失敗');
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  }, [isTracking, updateUserMarker]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const flyTo = useCallback((lng: number, lat: number, zoom: number = 15) => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom,
        duration: 800,
        essential: true,
      });
    }
  }, []);

  const centerOnUser = useCallback(() => {
    if (userLocation && mapRef.current) {
      flyTo(userLocation.lng, userLocation.lat, 15);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          flyTo(longitude, latitude, 15);
          updateUserMarker(longitude, latitude);
        },
        () => {
          setLocationError('無法取得位置');
        },
        { enableHighAccuracy: false, timeout: 15000 }
      );
    }
  }, [userLocation, flyTo, updateUserMarker]);

  const moveMapToContainer = useCallback((containerId: string) => {
    if (!mapRef.current) return;

    const targetContainer = document.getElementById(containerId);
    if (!targetContainer) return;

    if (currentContainerIdRef.current === containerId) return;

    const mapCanvas = mapRef.current.getCanvas();
    const mapContainer = mapCanvas.parentElement;

    if (mapContainer) {
      targetContainer.innerHTML = '';
      targetContainer.appendChild(mapContainer);
      currentContainerIdRef.current = containerId;
      requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    }
  }, []);

  const getMapInstance = useCallback((containerId: string): mapboxgl.Map | null => {
    if (mapRef.current && containerId) {
      moveMapToContainer(containerId);
    }
    return mapRef.current;
  }, [moveMapToContainer]);

  const returnMapToHiddenContainer = useCallback(() => {
    if (!mapRef.current || !hiddenContainerRef.current) return;
    if (currentContainerIdRef.current === '__hidden_map_container__') return;
    
    const mapCanvas = mapRef.current.getCanvas();
    const mapContainer = mapCanvas.parentElement;
    
    if (mapContainer && hiddenContainerRef.current) {
      hiddenContainerRef.current.innerHTML = '';
      hiddenContainerRef.current.appendChild(mapContainer);
      currentContainerIdRef.current = '__hidden_map_container__';
      requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    }
  }, []);

  useEffect(() => {
    if (mapRef.current) return;

    const initializeMap = async () => {
      setIsMapLoading(true);
      setLoadProgress(10);

      const token = await preloadMapboxToken();
      if (!token) {
        console.error('Failed to get Mapbox token');
        setIsMapLoading(false);
        return;
      }

      setLoadProgress(30);
      mapboxgl.accessToken = token;

      if (!hiddenContainerRef.current) {
        const container = document.createElement('div');
        container.id = '__hidden_map_container__';
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.width = '100%';
        container.style.height = '400px';
        document.body.appendChild(container);
        hiddenContainerRef.current = container;
      }

      setLoadProgress(50);

      mapRef.current = new mapboxgl.Map({
        container: hiddenContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
        antialias: false,
        fadeDuration: 0,
        preserveDrawingBuffer: false,
        trackResize: true,
        maxTileCacheSize: 50,
        refreshExpiredTiles: false,
        pitchWithRotate: false,
        dragRotate: false,
      });

      setLoadProgress(70);

      const mapboxLanguage = LANGUAGE_MAP[language] || 'zh-Hant';
      const languageControl = new MapboxLanguage({ defaultLanguage: mapboxLanguage });
      mapRef.current.addControl(languageControl);
      mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      mapRef.current.on('load', () => {
        setLoadProgress(100);
        setIsMapReady(true);
        setIsMapLoading(false);
        startTracking();
      });

      mapRef.current.on('idle', () => {
        if (!isMapReady) {
          setLoadProgress(90);
        }
      });

      mapRef.current.on('error', (e) => {
        console.error('Mapbox error:', e);
        setIsMapLoading(false);
      });
    };

    initializeMap();

    return () => {
      stopTracking();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (hiddenContainerRef.current) {
        hiddenContainerRef.current.remove();
        hiddenContainerRef.current = null;
      }
    };
  }, [language]);

  const value: MapContextValue = {
    isMapReady,
    isMapLoading,
    loadProgress,
    userLocation,
    locationError,
    isTracking,
    getMapInstance,
    moveMapToContainer,
    returnMapToHiddenContainer,
    flyTo,
    startTracking,
    stopTracking,
    centerOnUser,
  };

  return (
    <MapContext.Provider value={value}>
      {children}
    </MapContext.Provider>
  );
};

export const useGlobalMap = (): MapContextValue => {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useGlobalMap must be used within a MapProvider');
  }
  return context;
};

export default MapContext;
