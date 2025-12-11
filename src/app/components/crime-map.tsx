// components/CrimeMap.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import axios from "axios";
import type { PoliceVehicle } from "@/app/api/police-vehicles/route";
import type { Feature, FeatureCollection, Point } from "geojson";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

type SelectedThing =
  | { type: "crime"; data: CrimeIncident }
  | { type: "vehicle"; data: PoliceVehicle }
  | null;

type CrimeSeverity = "low" | "medium" | "high";

type CrimeRecord = {
  id: string;
  priorityLevel: number;
  latitude: number;
  longitude: number;
  description: string;
  address?: string | null;
  createdAt?: string | null;
};

type CrimeIncident = CrimeRecord & {
  severity: CrimeSeverity;
  reportedAt: string;
};

const AUCKLAND_LNG = 174.7633;
const AUCKLAND_LAT = -36.8485;

const CRIME_SOURCE_ID = "crimes-source";
const CRIME_LAYER_ID = "crimes-layer";
const CRIME_PULSE_LAYER_ID = "crimes-pulse-layer";
type CrimeFeatureProps = {
  id: string;
  severity: CrimeIncident["severity"];
  freshness: "recent" | "warm" | "old";
};
type CrimeFeature = Feature<Point, CrimeFeatureProps>;
type CrimeFeatureCollection = FeatureCollection<Point, CrimeFeatureProps>;

export function CrimeMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const vehicleMarkersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const vehiclesRef = useRef<PoliceVehicle[]>([]);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [vehicles, setVehicles] = useState<PoliceVehicle[]>([]);
  const [crimes, setCrimes] = useState<CrimeIncident[]>([]);
  const crimesRef = useRef<CrimeIncident[]>([]);
  const [selected, setSelected] = useState<SelectedThing>(null);

  // Keep crimesRef in sync so click handler always has the latest data
  useEffect(() => {
    crimesRef.current = crimes;
  }, [crimes]);

  // Keep vehiclesRef in sync for marker click handlers
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  // Top down map, no tilt
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [AUCKLAND_LNG, AUCKLAND_LAT],
      zoom: 13,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
    });

    // Lock to top-down: no tilt or rotation
    map.setPitch(0);
    map.setBearing(0);
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      // Add empty GeoJSON source for crimes
      map.addSource(CRIME_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Pulsing halo underneath solid dot
      map.addLayer({
        id: CRIME_PULSE_LAYER_ID,
        type: "circle",
        source: CRIME_SOURCE_ID,
        paint: {
          "circle-color": [
            "match",
            ["get", "severity"],
            "high",
            "#ef4444",
            "medium",
            "#f97316",
            "low",
            "#22c55e",
            "#e5e7eb",
          ],
          // These values get animated later via setPaintProperty
          "circle-radius": [
            "match",
            ["get", "freshness"],
            "recent",
            14,
            "warm",
            12,
            "old",
            10,
            12,
          ],
          "circle-opacity": 0.35,
        },
      });

      map.addLayer({
        id: CRIME_LAYER_ID,
        type: "circle",
        source: CRIME_SOURCE_ID,
        paint: {
          // colour by severity
          "circle-color": [
            "match",
            ["get", "severity"],
            "high",
            "#ef4444",
            "medium",
            "#f97316",
            "low",
            "#22c55e",
            "#e5e7eb",
          ],
          // radius by recency
          "circle-radius": [
            "match",
            ["get", "freshness"],
            "recent",
            10,
            "warm",
            8,
            "old",
            6,
            8,
          ],
          "circle-opacity": [
            "match",
            ["get", "freshness"],
            "recent",
            0.9,
            "warm",
            0.75,
            "old",
            0.6,
            0.8,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Click handler for crimes
      map.on("click", CRIME_LAYER_ID, (e) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        if (!id) return;

        const crime = crimesRef.current.find((c) => c.id === id);
        if (!crime) return;

        setSelected({ type: "crime", data: crime });
      });

      // Nice pointer cursor on hover
      map.on("mouseenter", CRIME_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", CRIME_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });

      setMapLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Poll backend for vehicles and crimes
  useEffect(() => {
    let cancelled = false;

    const toIncident = (record: CrimeRecord): CrimeIncident => {
      const prioNum = Number(record.priorityLevel);
      const priorityLevel = Number.isFinite(prioNum) ? prioNum : 1;
      const severity: CrimeSeverity =
        priorityLevel >= 8 ? "high" : priorityLevel >= 4 ? "medium" : "low";
      const reportedAt = record.createdAt ?? new Date().toISOString();

      return {
        ...record,
        priorityLevel,
        severity,
        reportedAt,
        address: record.address,
      };
    };

    const fetchData = async () => {
      try {
        const [vehiclesRes, crimesRes] = await Promise.all([
          axios.get<{ vehicles: PoliceVehicle[] }>("/api/police-vehicles"),
          axios.get<{ data: CrimeRecord[] }>("/api/crimes"),
        ]);

        if (!cancelled) {
          setVehicles(vehiclesRes.data.vehicles ?? []);
          const records = crimesRes.data.data ?? [];
          setCrimes(records.map(toIncident));
        }
      } catch (err) {
        console.error("Failed to fetch map data", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 15_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Push crime reports into the Mapbox GeoJSON source
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const src = map.getSource(CRIME_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!src) return;

    const now = Date.now();

    const features: CrimeFeature[] = crimes.map((crime) => {
      const reportedAtTime = new Date(crime.reportedAt).getTime();
      const ageMinutes = (now - reportedAtTime) / 60000;

      let freshness: "recent" | "warm" | "old";
      if (ageMinutes < 15) freshness = "recent";
      else if (ageMinutes < 60) freshness = "warm";
      else freshness = "old";

      const feature: CrimeFeature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [crime.longitude, crime.latitude],
        },
        properties: {
          id: crime.id,
          severity: crime.severity,
          freshness,
        },
      };
      return feature;
    });

    const geojson: CrimeFeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    src.setData(geojson);
  }, [mapLoaded, crimes]);

  // Police vehicles as DOM markers
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const existingVehicleMarkers = vehicleMarkersRef.current;
    const seenVehicleIds = new Set<string>();

    vehicles.forEach((vehicle) => {
      const { id, lng, lat, status } = vehicle;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      seenVehicleIds.add(id);

      const existingMarker = existingVehicleMarkers[id];

      if (existingMarker) {
        existingMarker.setLngLat([lng, lat]);
        const el = existingMarker.getElement();
        el.setAttribute("data-id", id);
        el.setAttribute("data-status", status);
        return;
      }

      const el = document.createElement("div");
      el.className = "police-icon-wrapper";
      el.setAttribute("data-id", id);
      el.setAttribute("data-status", status);

      const img = document.createElement("img");
      img.src = "/police.png";
      img.alt = "Police unit";
      img.className = "police-icon-image";
      el.appendChild(img);

      el.onclick = (e) => {
        e.stopPropagation();
        const currentVehicle = vehiclesRef.current.find((v) => v.id === id);
        if (!currentVehicle) return;
        setSelected({ type: "vehicle", data: currentVehicle });
      };

      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(map);

      existingVehicleMarkers[id] = marker;
    });

    Object.keys(existingVehicleMarkers).forEach((id) => {
      if (!seenVehicleIds.has(id)) {
        existingVehicleMarkers[id].remove();
        delete existingVehicleMarkers[id];
      }
    });
  }, [mapLoaded, vehicles]);

  // Animate crime pulse layer using Mapbox paint properties (no DOM/CSS)
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    if (!map.getLayer(CRIME_PULSE_LAYER_ID)) return;

    let frame: number;

    const animate = () => {
      const t = (performance.now() % 1500) / 1500; // 1.5s loop
      const scale = 1 + 0.8 * Math.sin(t * Math.PI * 2); // 1..1.8
      const fade = Math.max(0, 0.45 - 0.25 * (scale - 1)); // fade as it grows

      const radiusExpression: mapboxgl.Expression = [
        "*",
        scale,
        [
          "match",
          ["get", "freshness"],
          "recent",
          14,
          "warm",
          12,
          "old",
          10,
          12,
        ],
      ];

      map.setPaintProperty(
        CRIME_PULSE_LAYER_ID,
        "circle-radius",
        radiusExpression
      );
      map.setPaintProperty(CRIME_PULSE_LAYER_ID, "circle-opacity", fade);

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [mapLoaded]);

  const dialogOpen = selected !== null;

  return (
    <>
      {/* Full screen container */}
      <div ref={mapContainerRef} className="h-screen w-screen" />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-md">
          {selected && selected.type === "crime" && (
            <>
              <DialogHeader>
                <DialogTitle>Incident details</DialogTitle>
                <DialogDescription>
                  Live crime report handled by the AI dispatcher.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">Description:</span>{" "}
                  {selected.data.description}
                </p>
                <p>
                  <span className="font-semibold">Severity (by priority):</span>{" "}
                  {selected.data.severity.toUpperCase()}
                </p>
                <p>
                  <span className="font-semibold">Address:</span>{" "}
                  {selected.data.address ?? "Resolving address..."}
                </p>
                <p>
                  <span className="font-semibold">Reported at:</span>{" "}
                  {new Date(selected.data.reportedAt).toLocaleString()}
                </p>
                <p>
                  <span className="font-semibold">Location:</span>{" "}
                  {selected.data.latitude.toFixed(5)},{" "}
                  {selected.data.longitude.toFixed(5)}
                </p>
              </div>
            </>
          )}

          {selected && selected.type === "vehicle" && (
            <>
              <DialogHeader>
                <DialogTitle>Unit details</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">Unit ID:</span>{" "}
                  {selected.data.id}
                </p>
                <p>
                  <span className="font-semibold">Route:</span>{" "}
                  {selected.data.routeId ?? "Unknown"}
                </p>
                <p>
                  <span className="font-semibold">Status:</span>{" "}
                  {selected.data.status === "busy"
                    ? "Busy at incident"
                    : "Available"}
                </p>
                <p>
                  <span className="font-semibold">Last updated:</span>{" "}
                  {new Date(selected.data.lastUpdated).toLocaleString()}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
