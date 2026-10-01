/**
 * Distance estimation for orders.
 *
 * Ported from the web app's `services/mapService.ts` so the server computes
 * the store-to-customer distance itself rather than accepting it from the
 * browser. The figure decides which drivers see an order — a bicycle courier
 * is not shown a 20km delivery — so a client that could set it could widen
 * its own driver pool.
 *
 * Geocoding is the same placeholder table the web app uses: a handful of
 * Gauteng township centroids, falling back to central Johannesburg. It is
 * good enough to keep a bicycle off a cross-city run and no better. Swapping
 * in a real geocoding API means replacing `geocode` and nothing else.
 */

/** Township centroids, matched loosely against a free-text area string. */
const AREA_COORDINATES: ReadonlyArray<
  readonly [name: string, lat: number, lng: number]
> = [
  ['Meadowlands', -26.2258, 27.8712],
  ['Soweto', -26.2675, 27.8585],
  ['Alexandra', -26.1097, 28.0991],
  ['Tembisa', -26.0239, 28.2233],
  ['Katlehong', -26.3486, 28.1639],
  ['Vosloorus', -26.3833, 28.2],
  ['Thokoza', -26.35, 28.2833],
];

/** Central Johannesburg, used when nothing matches. */
const FALLBACK = { lat: -26.2041, lng: 28.0473 } as const;

/** Mean radius of the Earth in kilometres. */
const EARTH_RADIUS_KM = 6371;

export type Coordinates = { lat: number; lng: number };

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two points, in kilometres.
 *
 * Haversine rather than a flat approximation: cheap, and it does not drift
 * the way equirectangular does over the distances involved here.
 */
export function distanceKm(from: Coordinates, to: Coordinates): number {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(deltaLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // One decimal is all the precision the placeholder data supports.
  return Math.round(EARTH_RADIUS_KM * c * 10) / 10;
}

/**
 * Resolve an area string to coordinates.
 *
 * Ordered longest-name-first at the table level so "Meadowlands" is matched
 * before the "Soweto" it sits inside.
 */
export function geocode(area: string): Coordinates {
  const needle = area.trim().toLowerCase();
  if (!needle) return { ...FALLBACK };

  for (const [name, lat, lng] of AREA_COORDINATES) {
    if (needle.includes(name.toLowerCase())) return { lat, lng };
  }

  return { ...FALLBACK };
}

/**
 * Estimated distance from a store to a delivery address, in kilometres.
 *
 * Returns null when either side is blank, which callers treat as "unknown"
 * and show to every driver rather than hiding the order from all of them.
 */
export function estimateOrderDistanceKm(
  storeCity: string | null | undefined,
  customerCity: string | null | undefined,
): number | null {
  if (!storeCity?.trim() || !customerCity?.trim()) return null;
  return distanceKm(geocode(storeCity), geocode(customerCity));
}
