'use client';

// Map Component
// Displays a map with markers for tracking deliveries using Google Maps

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

// Type declaration for Google Maps
declare global {
  interface Window {
    google: any;
  }
}

interface MapProps {
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  driverLocation?: { lat: number; lng: number };
  height?: string;
}

// Replace with your actual Google Maps API key
const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

export default function Map({ origin, destination, driverLocation, height = '300px' }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [map, setMap] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);

  useEffect(() => {
    // Load Google Maps script
    const loadGoogleMaps = () => {
      if (typeof window !== 'undefined' && !window.google) {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
        script.async = true;
        script.onload = () => {
          setIsLoaded(true);
        };
        script.onerror = () => {
          console.error('Failed to load Google Maps');
        };
        document.head.appendChild(script);
      } else if (window.google) {
        setIsLoaded(true);
      }
    };

    loadGoogleMaps();
  }, []);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google) return;

    // Initialize map
    const mapInstance = new window.google.maps.Map(mapRef.current, {
      center: driverLocation || origin || { lat: -26.2041, lng: 28.0473 }, // Default to Johannesburg
      zoom: 14,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }],
        },
      ],
    });

    setMap(mapInstance);

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    const newMarkers: any[] = [];

    // Add origin marker (store)
    if (origin) {
      const originMarker = new window.google.maps.Marker({
        position: origin,
        map: mapInstance,
        title: 'Pickup Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      newMarkers.push(originMarker);
    }

    // Add destination marker (delivery address)
    if (destination) {
      const destMarker = new window.google.maps.Marker({
        position: destination,
        map: mapInstance,
        title: 'Delivery Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#22c55e',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      newMarkers.push(destMarker);
    }

    // Add driver marker with pulse animation
    if (driverLocation) {
      const driverMarker = new window.google.maps.Marker({
        position: driverLocation,
        map: mapInstance,
        title: 'Driver Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#f59e0b',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        animation: window.google.maps.Animation.DROP,
      });
      newMarkers.push(driverMarker);
    }

    // Draw route if both origin and destination exist
    if (origin && destination && window.google.maps.DirectionsService) {
      const directionsService = new window.google.maps.DirectionsService();
      const directionsRenderer = new window.google.maps.DirectionsRenderer({
        map: mapInstance,
        polylineOptions: {
          strokeColor: '#2563eb',
          strokeWeight: 5,
          strokeOpacity: 0.7,
        },
      });

      directionsService.route(
        {
          origin,
          destination,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result: any, status: string) => {
          if (status === 'OK') {
            directionsRenderer.setDirections(result);
          }
        }
      );
    }

    setMarkers(newMarkers);

    return () => {
      newMarkers.forEach(marker => marker.setMap(null));
    };
  }, [isLoaded, origin, destination, driverLocation]);

  // If no API key or not loaded, show placeholder
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY' || !isLoaded) {
    return (
      <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ height }}>
        <div ref={mapRef} className="w-full h-full flex items-center justify-center">
          <div className="text-center p-6">
            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-semibold">Live Tracking</p>
            {!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY' ? (
              <p className="text-sm text-gray-500 mt-1">
                Add your Google Maps API key to enable live tracking
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Loading map...</p>
            )}
            
            {(origin || destination) && (
              <div className="mt-4 p-3 bg-white rounded-lg shadow-sm text-left">
                {origin && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-primary rounded-full" />
                    <span className="text-sm">Pickup: {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}</span>
                  </div>
                )}
                {destination && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                    <span className="text-sm">Drop-off: {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}

            {driverLocation && (
              <div className="mt-3 p-3 bg-primary/10 rounded-lg text-left">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-sm font-semibold text-primary">
                    Driver at: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-4 right-4 bg-white px-3 py-2 rounded-lg shadow-md text-xs text-gray-600">
          Map View
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height }}>
      <div ref={mapRef} className="w-full h-full" />
      
      {/* Map Legend */}
      <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded-lg shadow-md text-xs space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
          <span>Pickup</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
          <span>Delivery</span>
        </div>
        {driverLocation && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />
            <span>Driver</span>
          </div>
        )}
      </div>
    </div>
  );
}
