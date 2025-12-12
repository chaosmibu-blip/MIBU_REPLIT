import React, { useState } from 'react';
import { MibuMap } from './MibuMap';

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

  const handleLocationUpdate = (location: { lat: number; lng: number }) => {
    setUserLocation({
      lat: location.lat,
      lng: location.lng,
      accuracy: undefined,
      timestamp: Date.now(),
    });
  };

  return (
    <div className="h-full w-full">
      <MibuMap
        center={userLocation ? [userLocation.lng, userLocation.lat] : [121.5654, 25.0330]}
        zoom={userLocation ? 15 : 12}
        markers={nearbyMarkers}
        onLocationUpdate={handleLocationUpdate}
        showUserLocation={true}
        language={language}
        className="h-full w-full"
        fullscreen={true}
      />
    </div>
  );
};

export default LocationView;
