"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./wind-canvas.module.css";

interface WindCanvasProps {
  windSpeedKph: number;
  windDirectionDeg: number;
  isPlaceholder?: boolean;
  coordinates?: {
    lat: number;
    lng: number;
  };
  locationLabel?: string;
}

interface Particle {
  x: number;
  y: number;
  age: number;
}

interface MapBackdropData {
  zoom: number;
  width: number;
  height: number;
  markerX: number;
  markerY: number;
  tiles: Array<{
    key: string;
    top: number;
    left: number;
    src: string;
  }>;
}

const PARTICLE_COUNT = 90;
const TILE_SIZE = 256;
const DEFAULT_MAP_SIZE = 960;
const FOCUS_RADIUS_METERS = 4000;
const EARTH_CIRCUMFERENCE_METERS = 40075016.686;
const MIN_MAP_ZOOM = 4;
const MAX_MAP_ZOOM = 20;
const TILE_LOADING_DELAY_MS = 850;
const TRAIL_FADE_STRENGTH = 0.26;
const PLACEHOLDER_TRAIL_FADE_STRENGTH = 0.22;
const TRAIL_STROKE_ALPHA = 0.16;
const PLACEHOLDER_TRAIL_STROKE_ALPHA = 0.24;
const HEAD_FILL_ALPHA = 0.4;
const PLACEHOLDER_HEAD_FILL_ALPHA = 0.58;
const HEAD_RADIUS = 1.35;
const PLACEHOLDER_HEAD_RADIUS = 1.55;

function seedParticle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    age: Math.random() * 100,
  };
}

function longitudeToTileX(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * 2 ** zoom;
}

function latitudeToTileY(latitude: number, zoom: number) {
  const radians = (latitude * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
    2 ** zoom
  );
}

function normalizeTileX(tileX: number, zoom: number) {
  const scale = 2 ** zoom;
  return ((tileX % scale) + scale) % scale;
}

function clampTileY(tileY: number, zoom: number) {
  const scale = 2 ** zoom;
  return Math.max(0, Math.min(tileY, scale - 1));
}

function metersPerPixel(latitude: number, zoom: number) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  return (
    (EARTH_CIRCUMFERENCE_METERS * Math.cos(latitudeRadians)) /
    (TILE_SIZE * 2 ** zoom)
  );
}

function getZoomForTargetRadius(
  latitude: number,
  viewportWidth: number,
  viewportHeight: number,
  radiusMeters: number,
) {
  const shortestSide = Math.max(240, Math.min(viewportWidth, viewportHeight));
  const targetPixelsForRadius = shortestSide * 0.38;
  const desiredMetersPerPixel = radiusMeters / Math.max(targetPixelsForRadius, 1);

  let bestZoom = MIN_MAP_ZOOM;

  for (let zoom = MIN_MAP_ZOOM; zoom <= MAX_MAP_ZOOM; zoom += 1) {
    if (metersPerPixel(latitude, zoom) <= desiredMetersPerPixel) {
      bestZoom = zoom;
      break;
    }
    bestZoom = zoom;
  }

  return Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, bestZoom));
}

function MapBackdropLayer({
  mapBackdrop,
  coordinates,
  locationLabel,
}: {
  mapBackdrop: MapBackdropData;
  coordinates?: {
    lat: number;
    lng: number;
  };
  locationLabel?: string;
}) {
  const [settledTileCount, setSettledTileCount] = useState(0);
  const [isSlowLoading, setIsSlowLoading] = useState(false);
  const tileCount = mapBackdrop.tiles.length;
  const mapReady = settledTileCount >= Math.max(4, Math.ceil(tileCount * 0.45));
  const showLoadingState = isSlowLoading && !mapReady;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setIsSlowLoading(true);
    }, TILE_LOADING_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [mapBackdrop]);

  return (
    <>
      <div
        className={`${styles.mapLoadingBackdrop} ${
          settledTileCount > 0 ? styles.mapLoadingBackdropReady : ""
        }`}
        aria-hidden="true"
      />
      <div
        className={`${styles.mapLayer} ${mapReady ? styles.mapLayerReady : ""}`}
        style={{
          width: `${mapBackdrop.width}px`,
          height: `${mapBackdrop.height}px`,
          left: `calc(50% - ${mapBackdrop.markerX}px)`,
          top: `calc(50% - ${mapBackdrop.markerY}px)`,
        }}
        aria-hidden="true"
      >
        {mapBackdrop.tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            className={styles.mapTile}
            alt=""
            src={tile.src}
            style={{
              top: `${tile.top}px`,
              left: `${tile.left}px`,
            }}
            onLoad={() => {
              setSettledTileCount((current) => current + 1);
            }}
            onError={() => {
              setSettledTileCount((current) => current + 1);
            }}
          />
        ))}
      </div>
      {showLoadingState ? (
        <div className={styles.mapLoadingPanel} role="status" aria-live="polite">
          <span className={styles.mapLoadingLabel}>Loading live map</span>
          <strong>
            {locationLabel ? `Fetching tiles for ${locationLabel}` : "Fetching map tiles"}
          </strong>
          <span className={styles.mapLoadingCoords}>
            {coordinates
              ? `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`
              : "Using the provided coordinates."}
          </span>
          <span className={styles.mapLoadingBars} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      ) : null}
      <div className={styles.mapMarker} aria-hidden="true">
        <span className={styles.mapMarkerDot} />
      </div>
      {locationLabel ? (
        <div className={styles.locationBadge}>
          <span className={styles.locationBadgeLabel}>Map focus</span>
          <strong>{locationLabel}</strong>
          <span className={styles.locationBadgeCoords}>Zoom {mapBackdrop.zoom}</span>
          {coordinates ? (
            <span className={styles.locationBadgeCoords}>
              {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function WindCanvas({
  windSpeedKph,
  windDirectionDeg,
  isPlaceholder = false,
  coordinates,
  locationLabel,
}: WindCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({
    width: DEFAULT_MAP_SIZE,
    height: DEFAULT_MAP_SIZE,
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const update = () => {
      const bounds = stage.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(bounds.width));
      const nextHeight = Math.max(1, Math.floor(bounds.height));

      setStageSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    update();

    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, []);

  const mapBackdrop = useMemo(() => {
    if (!coordinates) {
      return null;
    }

    const mapZoom = getZoomForTargetRadius(
      coordinates.lat,
      stageSize.width,
      stageSize.height,
      FOCUS_RADIUS_METERS,
    );
    const originTileX = longitudeToTileX(coordinates.lng, mapZoom);
    const originTileY = latitudeToTileY(coordinates.lat, mapZoom);
    const horizontalRadius = Math.ceil(stageSize.width / (2 * TILE_SIZE)) + 1;
    const verticalRadius = Math.ceil(stageSize.height / (2 * TILE_SIZE)) + 1;
    const tileColumns = horizontalRadius * 2 + 1;
    const tileRows = verticalRadius * 2 + 1;
    const firstTileX = Math.floor(originTileX) - horizontalRadius;
    const firstTileY = Math.floor(originTileY) - verticalRadius;
    const markerX = (originTileX - firstTileX) * TILE_SIZE;
    const markerY = (originTileY - firstTileY) * TILE_SIZE;
    const tiles: Array<{
      key: string;
      top: number;
      left: number;
      src: string;
    }> = [];

    for (let row = 0; row < tileRows; row += 1) {
      for (let column = 0; column < tileColumns; column += 1) {
        const tileX = normalizeTileX(firstTileX + column, mapZoom);
        const tileY = clampTileY(firstTileY + row, mapZoom);

        tiles.push({
          key: `${mapZoom}-${tileX}-${tileY}`,
          top: row * TILE_SIZE,
          left: column * TILE_SIZE,
          src: `https://tile.openstreetmap.org/${mapZoom}/${tileX}/${tileY}.png`,
        });
      }
    }

    return {
      zoom: mapZoom,
      width: tileColumns * TILE_SIZE,
      height: tileRows * TILE_SIZE,
      markerX,
      markerY,
      tiles,
    };
  }, [coordinates, stageSize.height, stageSize.width]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let particles: Particle[] = [];

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      particles = Array.from({ length: PARTICLE_COUNT }, () =>
        seedParticle(width, height),
      );
    };

    const drawStaticVectorField = () => {
      context.clearRect(0, 0, width, height);
      context.strokeStyle = isPlaceholder
        ? "rgba(132, 227, 218, 0.48)"
        : "rgba(132, 227, 218, 0.34)";
      context.lineWidth = isPlaceholder ? 1.25 : 0.95;

      const flowAngle = ((windDirectionDeg + 180) * Math.PI) / 180;
      const cell = 28;

      for (let x = cell; x < width; x += cell) {
        for (let y = cell; y < height; y += cell) {
          const length = 10 + Math.min(windSpeedKph, 35) * 0.3;
          const endX = x + Math.cos(flowAngle) * length;
          const endY = y + Math.sin(flowAngle) * length;

          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(endX, endY);
          context.stroke();
        }
      }
    };

    const render = () => {
      context.save();
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = `rgba(0, 0, 0, ${
        isPlaceholder ? PLACEHOLDER_TRAIL_FADE_STRENGTH : TRAIL_FADE_STRENGTH
      })`;
      context.fillRect(0, 0, width, height);
      context.restore();

      const centerX = width / 2;
      const centerY = height / 2;
      const flowAngle = ((windDirectionDeg + 180) * Math.PI) / 180;
      const speed = isPlaceholder ? 1.35 : 0.7 + Math.min(windSpeedKph, 35) / 18;

      context.strokeStyle = isPlaceholder
        ? `rgba(132, 227, 218, ${PLACEHOLDER_TRAIL_STROKE_ALPHA})`
        : `rgba(132, 227, 218, ${TRAIL_STROKE_ALPHA})`;
      context.fillStyle = isPlaceholder
        ? `rgba(132, 227, 218, ${PLACEHOLDER_HEAD_FILL_ALPHA})`
        : `rgba(132, 227, 218, ${HEAD_FILL_ALPHA})`;
      context.lineWidth = isPlaceholder ? 1 : 0.82;
      context.lineCap = "round";

      particles.forEach((particle, index) => {
        let dx = 0;
        let dy = 0;
        const startX = particle.x;
        const startY = particle.y;

        if (isPlaceholder) {
          const orbitAngle = Math.atan2(particle.y - centerY, particle.x - centerX);
          const radius = Math.hypot(particle.x - centerX, particle.y - centerY);
          const pull = Math.max(0.08, Math.min(radius / Math.max(width, height), 0.24));

          dx = Math.cos(orbitAngle + Math.PI / 2) * speed - Math.cos(orbitAngle) * pull;
          dy = Math.sin(orbitAngle + Math.PI / 2) * speed - Math.sin(orbitAngle) * pull;
        } else {
          const wave =
            Math.sin(
              (particle.y / Math.max(height, 1)) * Math.PI * 4 + particle.age * 0.03,
            ) * 0.45;
          dx = Math.cos(flowAngle + wave) * speed;
          dy = Math.sin(flowAngle + wave) * speed;
        }

        context.beginPath();
        context.moveTo(startX, startY);
        particle.x += dx;
        particle.y += dy;
        context.lineTo(particle.x, particle.y);
        context.stroke();

        context.beginPath();
        context.arc(
          particle.x,
          particle.y,
          isPlaceholder ? PLACEHOLDER_HEAD_RADIUS : HEAD_RADIUS,
          0,
          Math.PI * 2,
        );
        context.fill();

        particle.age += 1;

        if (
          particle.x < -10 ||
          particle.x > width + 10 ||
          particle.y < -10 ||
          particle.y > height + 10 ||
          particle.age > 160
        ) {
          particles[index] = seedParticle(width, height);
        }
      });

      animationFrame = window.requestAnimationFrame(render);
    };

    resize();

    if (prefersReducedMotion) {
      drawStaticVectorField();
    } else {
      render();
    }

    const handleResize = () => {
      resize();

      if (prefersReducedMotion) {
        drawStaticVectorField();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isPlaceholder, stageSize.height, stageSize.width, windDirectionDeg, windSpeedKph]);

  return (
    <div className={styles.stage} ref={stageRef}>
      {mapBackdrop ? (
        <MapBackdropLayer
          key={
            coordinates
              ? `${coordinates.lat.toFixed(4)}-${coordinates.lng.toFixed(4)}`
              : "no-coordinates"
          }
          mapBackdrop={mapBackdrop}
          coordinates={coordinates}
          locationLabel={locationLabel}
        />
      ) : (
        <div className={styles.placeholderBackdrop} aria-hidden="true" />
      )}

      <div
        className={`${styles.atmosphere} ${isPlaceholder ? styles.atmosphereIdle : ""}`}
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  );
}
