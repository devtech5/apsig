export type Position = { lat: number; lng: number };

export function distanceM(a: Position, b: Position): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Estimation affichée : trafic urbain ~22 km/h, minimum 3 minutes.
export const etaMinutes = (metres: number) => Math.max(3, Math.round((metres / 1000 / 22) * 60) + 2);

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
