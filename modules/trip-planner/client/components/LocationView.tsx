import React, { useState, useEffect, useCallback } from 'react';
import { MibuMap } from './MibuMap';
import { Navigation, Loader2 } from 'lucide-react';

interface MapMarker {
  lng: number;
  lat: number;
  title?: string;
  description?: string;
  color?: string;
}

interface LocationViewProps {
  language: 'zh-TW' | 'en' | 'ja' | 'ko';
}

interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export const LocationView: React.FC<LocationViewProps> = ({ language }) => {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [nearbyMarkers, setNearbyMarkers] = useState<MapMarker[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('您的瀏覽器不支援定位功能');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation({
          lat: latitude,
          lng: longitude,
          accuracy,
          timestamp: Date.now(),
        });
        setIsLocating(false);
        setRefreshKey(prev => prev + 1);
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
            setLocationError('定位逾時，請再試一次');
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
  }, []);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  const handleLocationUpdate = (location: { lat: number; lng: number }) => {
    setUserLocation({
      lat: location.lat,
      lng: location.lng,
      accuracy: undefined,
      timestamp: Date.now(),
    });
  };

  return (
    <div className="h-full w-full relative">
      <MibuMap
        key={refreshKey}
        center={userLocation ? [userLocation.lng, userLocation.lat] : [121.5654, 25.0330]}
        zoom={userLocation ? 15 : 12}
        markers={nearbyMarkers}
        onLocationUpdate={handleLocationUpdate}
        showUserLocation={true}
        language={language}
        className="h-full w-full"
        fullscreen={true}
      />
      
      <button
        onClick={refreshLocation}
        disabled={isLocating}
        className="absolute bottom-24 right-4 z-10 p-3 bg-white rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
        data-testid="button-refresh-location"
        title="重新定位"
      >
        {isLocating ? (
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        ) : (
          <Navigation className="w-6 h-6 text-blue-600" />
        )}
      </button>

      {locationError && (
        <div className="absolute bottom-36 left-4 right-4 z-10 p-3 bg-red-50 text-red-600 rounded-xl text-sm text-center shadow-lg">
          {locationError}
        </div>
      )}

      {userLocation && (
        <div className="absolute top-4 left-4 z-10 px-3 py-2 bg-white/90 backdrop-blur rounded-lg shadow text-xs text-slate-600">
          📍 {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
        </div>
      )}
    </div>
  );
};

export default LocationView;
