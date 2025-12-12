/// <reference types="vite/client" />
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Loader2 } from 'lucide-react';

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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

// Custom marker icon with brand colors
const createCustomIcon = (color: string = MIBU_BRAND_COLORS.primary) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 24px;
      height: 24px;
      background-color: ${color};
      border: 3px solid ${MIBU_BRAND_COLORS.background};
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div style="
    width: 16px;
    height: 16px;
    background-color: #3B82F6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3), 0 2px 8px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Component to update map center when user location changes
function MapUpdater({ center }: { center: [number, number] | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.flyTo(center, 15, { duration: 1 });
    }
  }, [center, map]);
  
  return null;
}

export const MibuMap: React.FC<MibuMapProps> = ({
  center = [25.0330, 121.5654], // Note: Leaflet uses [lat, lng]
  zoom = 12,
  markers = [],
  onLocationUpdate,
  showUserLocation = true,
  className = '',
}) => {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);

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
        const newLocation: [number, number] = [latitude, longitude];
        setUserLocation(newLocation);
        setMapCenter(newLocation);
        setIsLocating(false);
        
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
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapUpdater center={userLocation} />
        
        {/* User location marker */}
        {userLocation && (
          <Marker position={userLocation} icon={userLocationIcon}>
            <Popup>
              <div className="text-center">
                <strong>您的位置</strong>
                <br />
                <span className="text-xs text-gray-500">
                  {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
                </span>
              </div>
            </Popup>
          </Marker>
        )}
        
        {/* Place markers */}
        {markers.map((marker, index) => {
          if (marker.lat == null || marker.lng == null || isNaN(marker.lat) || isNaN(marker.lng)) {
            return null;
          }
          return (
            <Marker
              key={index}
              position={[marker.lat, marker.lng]}
              icon={createCustomIcon(marker.color)}
            >
              {(marker.title || marker.description) && (
                <Popup>
                  <div className="p-1">
                    {marker.title && <strong>{marker.title}</strong>}
                    {marker.description && <p className="text-sm mt-1">{marker.description}</p>}
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}
      </MapContainer>

      {/* Locate button */}
      {showUserLocation && (
        <button
          onClick={getCurrentLocation}
          disabled={isLocating}
          className="absolute bottom-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 z-[1000]"
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

      {/* Location error message */}
      {locationError && (
        <div
          className="absolute top-4 left-4 right-4 p-3 rounded-lg text-sm z-[1000]"
          style={{
            backgroundColor: MIBU_BRAND_COLORS.background,
            color: MIBU_BRAND_COLORS.accent,
            border: `1px solid ${MIBU_BRAND_COLORS.primary}`,
          }}
        >
          {locationError}
        </div>
      )}

      {/* User location display */}
      {userLocation && (
        <div
          className="absolute top-4 left-4 px-3 py-2 rounded-lg text-xs z-[1000]"
          style={{
            backgroundColor: MIBU_BRAND_COLORS.background,
            color: MIBU_BRAND_COLORS.accent,
            border: `1px solid ${MIBU_BRAND_COLORS.secondary}`,
          }}
        >
          <MapPin className="w-3 h-3 inline mr-1" />
          {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
        </div>
      )}
    </div>
  );
};

export default MibuMap;
