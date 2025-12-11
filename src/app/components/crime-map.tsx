// components/CrimeMap.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import axios from "axios";
import type { PoliceVehicle } from "@/app/api/police-vehicles/route";
import type { CrimeReport } from "@/app/api/crime-reports/route";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

type SelectedThing =
  | { type: "crime"; data: CrimeReport }
  | { type: "vehicle"; data: PoliceVehicle }
  | null;

const AUCKLAND_LNG = 174.7633;
const AUCKLAND_LAT = -36.8485;

export function CrimeMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const vehicleMarkersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const crimeMarkersRef = useRef<Record<string, mapboxgl.Marker>>({});

  const [mapLoaded, setMapLoaded] = useState(false);
  const [vehicles, setVehicles] = useState<PoliceVehicle[]>([]);
  const [crimes, setCrimes] = useState<CrimeReport[]>([]);
  const [selected, setSelected] = useState<SelectedThing>(null);

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

    const fetchData = async () => {
      try {
        const [vehiclesRes, crimesRes] = await Promise.all([
          axios.get<{ vehicles: PoliceVehicle[] }>("/api/police-vehicles"),
          axios.get<{ crimes: CrimeReport[] }>("/api/crime-reports"),
        ]);

        if (!cancelled) {
          setVehicles(vehiclesRes.data.vehicles ?? []);
          setCrimes(crimesRes.data.crimes ?? []);
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

  function getCrimeClasses(report: CrimeReport): {
    containerClass: string;
    innerClass: string;
  } {
    const reportedAt = new Date(report.reportedAt).getTime();
    const ageMinutes = (Date.now() - reportedAt) / 60000;

    let severityClass = "crime-low";
    if (report.severity === "medium") severityClass = "crime-medium";
    if (report.severity === "high") severityClass = "crime-high";

    let recencyClass = "";
    if (ageMinutes < 15) {
      recencyClass = "crime-recent";
    } else if (ageMinutes < 60) {
      recencyClass = "crime-warm";
    } else {
      recencyClass = "crime-old";
    }

    return {
      containerClass: `crime-marker ${severityClass} ${recencyClass}`,
      innerClass: "crime-inner-dot",
    };
  }

  // Markers
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Police vehicles as icons
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
        el.setAttribute("data-status", status);
        return;
      }

      const el = document.createElement("div");
      el.className = "police-icon-wrapper";
      el.setAttribute("data-status", status);

      const img = document.createElement("img");
      img.src = "/police.png";
      img.alt = "Police unit";
      img.className = "police-icon-image";
      el.appendChild(img);

      el.onclick = (e) => {
        e.stopPropagation();
        setSelected({ type: "vehicle", data: vehicle });
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

    // Crimes as pulsing dots
    const existingCrimeMarkers = crimeMarkersRef.current;
    const seenCrimeIds = new Set<string>();

    crimes.forEach((report) => {
      const { id, longitude, latitude } = report;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      seenCrimeIds.add(id);

      const existingMarker = existingCrimeMarkers[id];
      const { containerClass, innerClass } = getCrimeClasses(report);

      if (existingMarker) {
        existingMarker.setLngLat([longitude, latitude]);
        const el = existingMarker.getElement();
        el.className = containerClass;
        const inner = el.querySelector(
          ".crime-inner-dot"
        ) as HTMLDivElement | null;
        if (inner) {
          inner.className = innerClass;
        }
        return;
      }

      const el = document.createElement("div");
      el.className = containerClass;

      const inner = document.createElement("div");
      inner.className = innerClass;
      el.appendChild(inner);

      const pulse = document.createElement("div");
      pulse.className = "crime-pulse";
      el.appendChild(pulse);

      el.onclick = (e) => {
        e.stopPropagation();
        setSelected({ type: "crime", data: report });
      };

      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat([longitude, latitude])
        .addTo(map);

      existingCrimeMarkers[id] = marker;
    });

    Object.keys(existingCrimeMarkers).forEach((id) => {
      if (!seenCrimeIds.has(id)) {
        existingCrimeMarkers[id].remove();
        delete existingCrimeMarkers[id];
      }
    });
  }, [mapLoaded, vehicles, crimes]);

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
                  <span className="font-semibold">Severity:</span>{" "}
                  {selected.data.severity.toUpperCase()}
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
                <DialogDescription>
                  This unit is being animated from live bus data.
                </DialogDescription>
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
