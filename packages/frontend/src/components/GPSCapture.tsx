import React, { useState, useCallback } from 'react';

export interface GPSCoordinates {
  latitude: number;
  longitude: number;
}

export interface GPSCaptureProps {
  onCapture: (coords: GPSCoordinates) => void;
  value?: GPSCoordinates | null;
}

const INDIA_BOUNDS = { latMin: 6, latMax: 37, lngMin: 68, lngMax: 98 };

function isWithinIndia(lat: number, lng: number): boolean {
  return (
    lat >= INDIA_BOUNDS.latMin &&
    lat <= INDIA_BOUNDS.latMax &&
    lng >= INDIA_BOUNDS.lngMin &&
    lng <= INDIA_BOUNDS.lngMax
  );
}

export const GPSCapture: React.FC<GPSCaptureProps> = ({ onCapture, value }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = useCallback(() => {
    if (!navigator.geolocation) {
      setError('GPS is not available on this device');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (!isWithinIndia(latitude, longitude)) {
          setError('Location is outside India. Please enter coordinates manually.');
          setLoading(false);
          return;
        }
        onCapture({ latitude, longitude });
        setLoading(false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied. Please enable GPS access.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('Location unavailable. Please try again.');
        } else {
          setError('Unable to get location. Please try again.');
        }
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onCapture]);

  return (
    <div data-testid="gps-capture">
      <button onClick={handleCapture} disabled={loading} type="button" data-testid="gps-button">
        {loading ? 'Getting location...' : 'Use GPS'}
      </button>
      {value && (
        <span data-testid="gps-coords" style={{ marginLeft: 8 }}>
          Lat: {value.latitude.toFixed(4)}, Lng: {value.longitude.toFixed(4)}
        </span>
      )}
      {error && (
        <span data-testid="gps-error" role="alert" style={{ color: 'red', marginLeft: 8 }}>
          {error}
        </span>
      )}
    </div>
  );
};
