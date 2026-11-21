import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface GeoMapFarmItem {
  id: number | string;
  label: string;
  sublabel?: string;
  lat: number;
  lng: number;
  boundary?: Array<{ lat: number; lng: number }>;
}

export interface GeoMapPilotItem {
  id: number | string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  isStale?: boolean;
  gpsStalenessSeconds?: number | null;
  accuracyMeters?: number | null;
  status?: string;
  lastLocationAt?: string | null;
}

interface GeoMapProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  farms?: GeoMapFarmItem[];
  pilots?: GeoMapPilotItem[];
  interactiveMode?: 'none' | 'pick_center' | 'draw_polygon';
  draftCenter?: { lat: number; lng: number } | null;
  draftPolygon?: Array<{ lat: number; lng: number }>;
  onPickCenter?: (lat: number, lng: number) => void;
  onAddPolygonPoint?: (pt: { lat: number; lng: number }) => void;
}

function createPinIcon(fill: string, label: string, stale?: boolean) {
  const ring = stale ? '#EF4444' : '#DCEAF5';
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
      <div style="background:#123B5D;color:#fff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-bottom:3px;border:1px solid ${ring};box-shadow:0 2px 6px rgba(18,59,93,0.2);">
        ${label}
      </div>
      <div style="width:14px;height:14px;border-radius:9999px;background:${fill};border:2.5px solid #FFFFFF;box-shadow:0 2px 5px rgba(18,59,93,0.3);"></div>
    </div>
  `;
  return L.divIcon({
    className: 'ntf-leaflet-div-icon',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createVertexIcon(idx: number) {
  return L.divIcon({
    className: 'ntf-leaflet-vertex-icon',
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:#42A5F5;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(18,59,93,0.3);transform:translate(-50%,-50%);">${idx + 1}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export const GeoMap: React.FC<GeoMapProps> = ({
  center = [21.1458, 79.0882],
  zoom = 12,
  className = 'h-80 w-full rounded-xl border border-[#DCEAF5] overflow-hidden',
  farms = [],
  pilots = [],
  interactiveMode = 'none',
  draftCenter = null,
  draftPolygon = [],
  onPickCenter,
  onAddPolygonPoint,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const modeRef = useRef(interactiveMode);
  const onPickRef = useRef(onPickCenter);
  const onPolyRef = useRef(onAddPolygonPoint);

  modeRef.current = interactiveMode;
  onPickRef.current = onPickCenter;
  onPolyRef.current = onAddPolygonPoint;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    map.on('click', (ev: L.LeafletMouseEvent) => {
      const lat = Number(ev.latlng.lat.toFixed(6));
      const lng = Number(ev.latlng.lng.toFixed(6));
      if (modeRef.current === 'pick_center' && onPickRef.current) {
        onPickRef.current(lat, lng);
      } else if (modeRef.current === 'draw_polygon' && onPolyRef.current) {
        onPolyRef.current({ lat, lng });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: L.LatLngExpression[] = [];

    for (const farm of farms) {
      if (Number.isFinite(farm.lat) && Number.isFinite(farm.lng)) {
        const marker = L.marker([farm.lat, farm.lng], {
          icon: createPinIcon('#42A5F5', farm.label),
        }).addTo(group);
        marker.bindPopup(
          `<div style="font-size:12px;line-height:1.4;">
            <strong>${farm.label}</strong>
            ${farm.sublabel ? `<div>${farm.sublabel}</div>` : ''}
            <div style="font-family:monospace;font-size:11px;margin-top:2px;">${farm.lat.toFixed(5)}, ${farm.lng.toFixed(5)}</div>
          </div>`
        );
        boundsPoints.push([farm.lat, farm.lng]);
      }

      if (Array.isArray(farm.boundary) && farm.boundary.length >= 3) {
        const latlngs: L.LatLngExpression[] = farm.boundary.map((pt) => [pt.lat, pt.lng]);
        L.polygon(latlngs, {
          color: '#42A5F5',
          fillColor: '#90CAF9',
          fillOpacity: 0.25,
          weight: 2,
        }).addTo(group);
        for (const pt of farm.boundary) {
          boundsPoints.push([pt.lat, pt.lng]);
        }
      }
    }

    for (const pilot of pilots) {
      if (!Number.isFinite(pilot.lat) || !Number.isFinite(pilot.lng)) continue;
      const staleLabel = pilot.isStale ? `${pilot.code} (Stale GPS)` : pilot.code;
      const color = pilot.isStale ? '#D97706' : '#1D4ED8';
      const marker = L.marker([pilot.lat, pilot.lng], {
        icon: createPinIcon(color, staleLabel, pilot.isStale),
      }).addTo(group);
      const lastTime = pilot.lastLocationAt ? new Date(pilot.lastLocationAt).toLocaleTimeString('en-IN') : 'Never';
      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.45;">
          <strong>${pilot.name}</strong> (${pilot.code})<br/>
          Status: <strong>${pilot.status || 'online'}</strong>${pilot.isStale ? ' · <span style="color:#B45309;">STALE GPS</span>' : ''}<br/>
          <span style="font-family:monospace;font-size:11px;">${pilot.lat.toFixed(5)}, ${pilot.lng.toFixed(5)}</span><br/>
          Accuracy: ${pilot.accuracyMeters != null ? `${Math.round(pilot.accuracyMeters)}m` : 'N/A'} · Updated: ${lastTime}
          ${pilot.gpsStalenessSeconds != null ? ` (${pilot.gpsStalenessSeconds}s ago)` : ''}
        </div>`
      );
      boundsPoints.push([pilot.lat, pilot.lng]);
    }

    if (draftCenter && Number.isFinite(draftCenter.lat) && Number.isFinite(draftCenter.lng)) {
      L.marker([draftCenter.lat, draftCenter.lng], {
        icon: createPinIcon('#123B5D', 'Farm Center'),
      }).addTo(group);
      boundsPoints.push([draftCenter.lat, draftCenter.lng]);
    }

    if (draftPolygon.length > 0) {
      draftPolygon.forEach((pt, idx) => {
        L.marker([pt.lat, pt.lng], { icon: createVertexIcon(idx) }).addTo(group);
        boundsPoints.push([pt.lat, pt.lng]);
      });
      if (draftPolygon.length >= 3) {
        L.polygon(
          draftPolygon.map((p) => [p.lat, p.lng] as L.LatLngExpression),
          { color: '#42A5F5', fillColor: '#64B5F6', fillOpacity: 0.25, weight: 2, dashArray: '4 4' }
        ).addTo(group);
      } else if (draftPolygon.length === 2) {
        L.polyline(
          draftPolygon.map((p) => [p.lat, p.lng] as L.LatLngExpression),
          { color: '#42A5F5', weight: 2, dashArray: '4 4' }
        ).addTo(group);
      }
    }

    if (boundsPoints.length === 1 && interactiveMode === 'none') {
      map.setView(boundsPoints[0], Math.max(zoom, 13));
    } else if (boundsPoints.length > 1 && interactiveMode === 'none') {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [36, 36], maxZoom: 15 });
    }
  }, [farms, pilots, draftCenter, draftPolygon, interactiveMode, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (farms.length === 0 && pilots.length === 0 && !draftCenter && draftPolygon.length === 0) {
      map.setView(center, zoom);
    }
  }, [center, zoom, farms.length, pilots.length, draftCenter, draftPolygon.length]);

  return (
    <div
      ref={containerRef}
      className={`${className} ${interactiveMode !== 'none' ? 'cursor-crosshair' : ''}`}
      aria-label="KRASHIVANTRI Geospatial Map"
    />
  );
};
