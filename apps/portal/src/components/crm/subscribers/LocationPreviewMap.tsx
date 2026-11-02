'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const MARKER_ICON = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

type LeafletContainerElement = HTMLDivElement & {
  _leaflet_id?: number;
  __iwanaLeafletMap?: L.Map;
};

interface LocationPreviewMapProps {
  latitude: number;
  longitude: number;
}

/**
 * Vista previa de solo lectura con teselas OSM, que la CSP admite en `img-src`.
 * Sustituye al iframe de openstreetmap.org, que la CSP bloquea al no declarar `frame-src`.
 */
export default function LocationPreviewMap({ latitude, longitude }: LocationPreviewMapProps) {
  const containerRef = useRef<LeafletContainerElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Igual que CoverageMap: HMR o React concurrente pueden dejar el nodo marcado por Leaflet.
    if (container.__iwanaLeafletMap) {
      container.__iwanaLeafletMap.remove();
      delete container.__iwanaLeafletMap;
    }
    if (container._leaflet_id !== undefined) delete container._leaflet_id;

    const map = L.map(container, {
      center: [latitude, longitude],
      zoom: 16,
      scrollWheelZoom: false,
      attributionControl: false,
    });
    container.__iwanaLeafletMap = map;
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    markerRef.current = L.marker([latitude, longitude], {
      icon: MARKER_ICON,
      keyboard: false,
    }).addTo(map);

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (container.isConnected && mapRef.current === map) {
          map.invalidateSize({ pan: false, animate: false });
        }
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
      markerRef.current = null;
      delete container.__iwanaLeafletMap;
      if (container._leaflet_id !== undefined) delete container._leaflet_id;
    };
    // El mapa se crea una vez; los cambios de coordenadas se aplican en el efecto siguiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setView([latitude, longitude], mapRef.current.getZoom(), { animate: false });
    markerRef.current?.setLatLng([latitude, longitude]);
  }, [latitude, longitude]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Ubicación del suscriptor: latitud ${latitude}, longitud ${longitude}`}
      className="relative z-0 h-full w-full"
    />
  );
}
