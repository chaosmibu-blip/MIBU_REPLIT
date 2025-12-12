import React, { useState } from 'react';
import { MapPin, Navigation, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MibuMap } from './MibuMap';
import { TRANSLATIONS } from '../../../../client/src/constants';

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
  const t = TRANSLATIONS[language] as any;
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyMarkers, setNearbyMarkers] = useState<MapMarker[]>([]);

  const handleLocationUpdate = (location: { lat: number; lng: number }) => {
    setUserLocation({
      lat: location.lat,
      lng: location.lng,
      accuracy: undefined,
      timestamp: Date.now(),
    });
    setIsLocating(false);
    setLocationError(null);
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError(t.locationError);
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError(t.noLocationPermission);
            break;
          case error.POSITION_UNAVAILABLE:
          case error.TIMEOUT:
          default:
            setLocationError(t.locationError);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(language === 'zh-TW' ? 'zh-TW' : language === 'ja' ? 'ja-JP' : language === 'ko' ? 'ko-KR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F0E6] to-white">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#8B7355]/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <MapPin className="w-8 h-8 text-[#8B7355]" />
          </div>
          <h1 className="text-2xl font-bold text-[#5D4E37] mb-1" data-testid="text-location-title">
            {t.locationTitle}
          </h1>
          <p className="text-[#8B7355] text-sm">
            {t.locationSubtitle}
          </p>
        </div>

        {locationError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-700 text-sm font-medium">{locationError}</p>
            </div>
            <button
              onClick={requestLocation}
              className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
              data-testid="button-retry-location"
            >
              {t.tryAgain}
            </button>
          </div>
        )}

        {userLocation && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-emerald-700 font-medium text-sm">{t.locationEnabled}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-emerald-600">
              {userLocation.accuracy && (
                <div>
                  <span className="opacity-70">{t.accuracy}: </span>
                  <span className="font-medium">{Math.round(userLocation.accuracy)} {t.meters}</span>
                </div>
              )}
              {userLocation.timestamp && (
                <div>
                  <span className="opacity-70">{t.lastUpdate}: </span>
                  <span className="font-medium">{formatTime(userLocation.timestamp)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl overflow-hidden shadow-lg border-2 border-[#C4A77D]/30 mb-4">
          <MibuMap
            center={userLocation ? [userLocation.lng, userLocation.lat] : [121.5654, 25.0330]}
            zoom={userLocation ? 15 : 12}
            markers={nearbyMarkers}
            onLocationUpdate={handleLocationUpdate}
            showUserLocation={true}
            className="h-80"
          />
        </div>

        <div className="flex gap-3">
          {!userLocation ? (
            <button
              onClick={requestLocation}
              disabled={isLocating}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#8B7355] text-white rounded-xl font-medium hover:bg-[#5D4E37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-enable-location"
            >
              {isLocating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{t.locating}</span>
                </>
              ) : (
                <>
                  <Navigation className="w-5 h-5" />
                  <span>{t.enableLocation}</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={requestLocation}
              disabled={isLocating}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#C4A77D] text-[#5D4E37] rounded-xl font-medium hover:bg-[#8B7355] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-refresh-location"
            >
              {isLocating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{t.locating}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  <span>{t.refreshLocation}</span>
                </>
              )}
            </button>
          )}
        </div>

        {userLocation && (
          <div className="mt-6">
            <h2 className="text-lg font-bold text-[#5D4E37] mb-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#8B7355]" />
              {t.nearbyPlaces}
            </h2>
            <div className="bg-white rounded-xl p-4 border border-[#C4A77D]/20 shadow-sm">
              <p className="text-[#8B7355] text-sm text-center py-4">
                📍 {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationView;
