'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CoverageNodeConfig, CoverageZoneConfig } from '@/lib/api-client';

const ACTIVE_ICON = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const INACTIVE_ICON = L.divIcon({
  className: 'coverage-marker-inactive',
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#9ca3af;border:2px solid #4b5563;"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

interface CoverageMapProps {
  nodes: CoverageNodeConfig[];
  zones: CoverageZoneConfig[];
  readonly: boolean;
  onNodeClick: (node: CoverageNodeConfig) => void;
  onMapClick: (latlng: { lat: number; lng: number }) => void;
}

type LeafletContainerElement = HTMLDivElement & {
  _leaflet_id?: number;
  __iwanaLeafletMap?: L.Map;
};

export default function CoverageMap({
  nodes,
  zones,
  readonly,
  onNodeClick,
  onMapClick,
}: CoverageMapProps) {
  const containerRef = useRef<LeafletContainerElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    /**
     * HMR/React concurrent puede dejar un `_leaflet_id` colgando sobre el mismo
     * nodo DOM. Si no limpiamos esto antes de crear un nuevo mapa, Leaflet asume
     * que el contenedor ya pertenece a otra instancia y lanza el error de reuso.
     */
    if (container.__iwanaLeafletMap) {
      container.__iwanaLeafletMap.remove();
      delete container.__iwanaLeafletMap;
    }
    if (container._leaflet_id !== undefined) {
      delete container._leaflet_id;
    }

    const map = L.map(container, {
      center: [4.6097, -74.0817],
      zoom: 12,
      scrollWheelZoom: !readonly,
      zoomControl: true,
    });

    container.__iwanaLeafletMap = map;
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    overlayLayerRef.current = L.layerGroup().addTo(map);

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      if (readonly) {
        return;
      }

      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    };

    map.on('click', handleMapClick);

    /**
     * Invalidar tamaño solo cuando el contenedor sigue conectado al DOM y el mapa
     * continúa vivo. Esto evita el `_leaflet_pos` undefined observado durante
     * desmontajes concurrentes y reconexiones de efectos en React 19.
     */
    const scheduleInvalidateSize = () => {
      requestAnimationFrame(() => {
        if (!container.isConnected) {
          return;
        }

        if (mapRef.current !== map) {
          return;
        }

        map.invalidateSize({ pan: false, animate: false });
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleInvalidateSize();
    });

    observer.observe(container);
    scheduleInvalidateSize();

    return () => {
      observer.disconnect();
      map.off('click', handleMapClick);

      if (overlayLayerRef.current) {
        overlayLayerRef.current.clearLayers();
        overlayLayerRef.current.remove();
        overlayLayerRef.current = null;
      }

      map.remove();

      if (mapRef.current === map) {
        mapRef.current = null;
      }

      delete container.__iwanaLeafletMap;
      if (container._leaflet_id !== undefined) {
        delete container._leaflet_id;
      }
    };
  }, [readonly, onMapClick]);

  useEffect(() => {
    const map = mapRef.current;
    const overlayLayer = overlayLayerRef.current;

    if (!map || !overlayLayer) {
      return;
    }

    overlayLayer.clearLayers();

    for (const zone of zones) {
      const circle = L.circle([zone.centerLatitude, zone.centerLongitude], {
        radius: zone.radiusKm * 1000,
        color: zone.isActive ? '#0f172a' : '#9ca3af',
        fillColor: zone.isActive ? '#1d4ed8' : '#d1d5db',
        fillOpacity: zone.isActive ? 0.14 : 0.08,
      });

      circle.bindPopup(
        `<div class="space-y-1 text-xs"><p class="font-semibold">${zone.name}</p><p>Radio: ${zone.radiusKm.toFixed(2)} km</p></div>`,
      );
      circle.addTo(overlayLayer);
    }

    for (const node of nodes) {
      const marker = L.marker([node.latitude, node.longitude], {
        icon: node.isActive ? ACTIVE_ICON : INACTIVE_ICON,
      });

      marker.bindPopup(
        `<div class="space-y-1 text-xs"><p class="font-semibold">${node.name}</p><p>${node.isActive ? 'Activo' : 'Inactivo'}</p></div>`,
      );
      marker.on('click', () => onNodeClick(node));
      marker.addTo(overlayLayer);
    }

    if (zones.length > 0 || nodes.length > 0) {
      const bounds = L.featureGroup(overlayLayer.getLayers()).getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.12), { animate: false });
      }
    }
  }, [nodes, zones, onNodeClick]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-gray-200 dark:border-dark-border"
      data-testid="coverage-map"
    >
      <div ref={containerRef} className="h-[400px] w-full" />
    </div>
  );
}
