export interface Coordinate {
  lat: number;
  lon: number;
}

export interface GeofenceTarget {
  id: string | number;
  name: string;
  lat: number;
  lon: number;
  radiusMeters: number;
}

export interface GeofenceResult {
  status: "ok" | "error";
  arrived: boolean;
  target: GeofenceTarget | null;
  distanceMeters: number | null;
}

export function haversineDistance(point1: Coordinate, point2: Coordinate): number {
  const R = 6371000;
  const lat1Rad = point1.lat * Math.PI / 180;
  const lat2Rad = point2.lat * Math.PI / 180;
  const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
  const deltaLon = (point2.lon - point1.lon) * Math.PI / 180;

  const a = 
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function checkGeofence(
  userLocation: Coordinate,
  targets: GeofenceTarget[]
): GeofenceResult {
  if (targets.length === 0) {
    return { status: "ok", arrived: false, target: null, distanceMeters: null };
  }

  let nearestTarget: GeofenceTarget | null = null;
  let minDistance = Infinity;

  for (const target of targets) {
    const distance = haversineDistance(userLocation, { lat: target.lat, lon: target.lon });
    if (distance < minDistance) {
      minDistance = distance;
      nearestTarget = target;
    }
  }

  if (nearestTarget && minDistance <= nearestTarget.radiusMeters) {
    return {
      status: "ok",
      arrived: true,
      target: nearestTarget,
      distanceMeters: Math.round(minDistance * 100) / 100,
    };
  }

  return {
    status: "ok",
    arrived: false,
    target: nearestTarget,
    distanceMeters: nearestTarget ? Math.round(minDistance * 100) / 100 : null,
  };
}

export function isWithinRadius(
  point1: Coordinate,
  point2: Coordinate,
  radiusMeters: number
): boolean {
  return haversineDistance(point1, point2) <= radiusMeters;
}
