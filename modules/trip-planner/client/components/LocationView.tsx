import React from 'react';
import { GlobalMapView } from './GlobalMapView';
import { useGlobalMap } from '../context/MapContext';
import { Navigation, Loader2 } from 'lucide-react';

interface LocationViewProps {
  language: 'zh-TW' | 'en' | 'ja' | 'ko';
}

export const LocationView: React.FC<LocationViewProps> = ({ language }) => {
  const { 
    userLocation, 
    locationError, 
    isTracking,
    centerOnUser 
  } = useGlobalMap();

  return (
    <div className="h-full w-full relative">
      <GlobalMapView
        center={userLocation ? [userLocation.lng, userLocation.lat] : undefined}
        zoom={userLocation ? 15 : 12}
        showUserLocation={true}
        className="h-full w-full"
        fullscreen={true}
      />
      
      <button
        onClick={centerOnUser}
        disabled={isTracking && !userLocation}
        className="absolute bottom-24 right-4 z-10 p-3 bg-white rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
        data-testid="button-refresh-location"
        title="定位"
      >
        {isTracking && !userLocation ? (
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
