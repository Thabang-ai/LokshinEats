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
