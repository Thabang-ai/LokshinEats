// Map Service
// Handles Google Maps integration and location services

export interface Location {
  lat: number;
  lng: number;
  address: string;
}

export interface Route {
  distance: string;
  duration: string;
  polyline: string;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function calculateDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(destination.lat - origin.lat);
  const dLng = toRad(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(destination.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Estimate delivery time based on distance
 */
export function estimateDeliveryTime(distanceKm: number): string {
  // Average speed in township areas: ~20 km/h
  const avgSpeed = 20;
  const timeMinutes = (distanceKm / avgSpeed) * 60;
  const roundedMinutes = Math.round(timeMinutes);
  
  if (roundedMinutes < 15) return '10-15 min';
  if (roundedMinutes < 30) return `${roundedMinutes - 5}-${roundedMinutes + 5} min`;
  if (roundedMinutes < 45) return `${roundedMinutes - 10}-${roundedMinutes + 10} min`;
  return `${roundedMinutes - 15}-${roundedMinutes + 15} min`;
}

/**
 * Calculate delivery fee based on distance
 */
export function calculateDeliveryFee(distanceKm: number): number {
  const baseFee = 15; // Base delivery fee
  const perKmFee = 5; // Additional fee per km
  const maxFee = 50; // Maximum delivery fee
  
  const fee = baseFee + (distanceKm * perKmFee);
  return Math.min(fee, maxFee);
}

/**
 * Geocode address to coordinates
 * In production, this would use Google Maps Geocoding API
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  // In production, you would:
  // - Call Google Maps Geocoding API
  // - Parse the response
  // - Return coordinates
  
  // For now, return mock coordinates for South African townships
  const mockCoordinates: Record<string, { lat: number; lng: number }> = {
    'Soweto': { lat: -26.2675, lng: 27.8585 },
    'Meadowlands': { lat: -26.2258, lng: 27.8712 }, // Soweto suburb — both seeded stores are here
    'Alexandra': { lat: -26.1097, lng: 28.0991 },
    'Tembisa': { lat: -26.0239, lng: 28.2233 },
    'Katlehong': { lat: -26.3486, lng: 28.1639 },
    'Vosloorus': { lat: -26.3833, lng: 28.2000 },
    'Thokoza': { lat: -26.3500, lng: 28.2833 },
  };

  // Find matching area
  for (const [area, coords] of Object.entries(mockCoordinates)) {
    if (address.toLowerCase().includes(area.toLowerCase())) {
      return coords;
    }
  }

  // Default to Johannesburg if no match
  return { lat: -26.2041, lng: 28.0473 };
}

/**
 * Realistic max delivery distance per vehicle type, in km. Placeholder
 * figures — tune these once you know your actual driver fleet and how far
 * they're realistically willing/able to ride. A bicycle covering a 20km
 * round trip isn't credible; a car covering 3km is needlessly restrictive.
 */
export const VEHICLE_MAX_RADIUS_KM: Record<'bicycle' | 'motorbike' | 'car', number> = {
  bicycle: 4,
  motorbike: 12,
  car: 20,
};

/**
 * Estimate the store → customer delivery distance from their city/area
 * names. Uses the same mock geocoding as the rest of this file — city names
 * are free text (typed by the vendor at registration, and by the customer
 * at checkout), so this is a rough township-level estimate, not a precise
 * address-to-address distance. Good enough to gate "can this vehicle type
 * plausibly do this delivery", not for turn-by-turn routing.
 */
export async function estimateOrderDistanceKm(
  storeCity: string,
  customerCity: string,
): Promise<number | null> {
  if (!storeCity || !customerCity) return null;
  const [origin, destination] = await Promise.all([
    geocodeAddress(storeCity),
    geocodeAddress(customerCity),
  ]);
  if (!origin || !destination) return null;
  return calculateDistance(origin, destination);
}

/**
 * Whether a delivery of the given distance is within a vehicle type's
 * realistic range. `distanceKm === null` (unknown — e.g. an order placed
 * before this field existed) defaults to true so old orders stay visible
 * rather than silently disappearing from every driver's feed.
 */
export function isWithinVehicleRadius(
  distanceKm: number | null,
  vehicleType: string | null | undefined,
): boolean {
  if (distanceKm === null) return true;
  const type = vehicleType === 'bicycle' || vehicleType === 'motorbike' || vehicleType === 'car'
    ? vehicleType
    : 'car'; // unknown/missing vehicleType fails open to the most permissive radius
  return distanceKm <= VEHICLE_MAX_RADIUS_KM[type];
}

/**
 * Get directions between two points
 * In production, this would use Google Maps Directions API
 */
export async function getDirections(
  origin: Location,
  destination: Location
): Promise<Route | null> {
  // In production, you would:
  // - Call Google Maps Directions API
  // - Parse the response
  // - Return route information
  
  // For now, calculate distance and estimate duration
  const distance = calculateDistance(origin, destination);
  const duration = estimateDeliveryTime(distance);
  
  return {
    distance: `${distance.toFixed(1)} km`,
    duration,
    polyline: '', // Would contain encoded polyline in production
  };
}

/**
 * Get user's current location
 */
export function getCurrentLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Format coordinates to address
 * In production, this would use Google Maps Reverse Geocoding API
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // In production, you would call Google Maps Reverse Geocoding API
  // For now, return a mock address
  return 'Unknown Location';
}
