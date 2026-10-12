// Real geometry for "how far is it": great-circle distance between two coordinates. Used instead of
// asking a language model to "estimate" distances (which produced precise-looking 200/300/400/500 m
// figures with no basis).

const EARTH_RADIUS_M = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export const isLatLon = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Straight-line (great-circle) distance in metres. Null if either point is invalid. */
export function distanceMeters(a, b) {
  if (!a || !b || !isLatLon(a.lat, a.lon) || !isLatLon(b.lat, b.lon)) return null;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Honest precision: nearest 10 m under 1 km, 0.1 km above — never more digits than the data supports. */
export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
