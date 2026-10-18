"use client";

import { motion } from "framer-motion";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import {
  USER_GEO_POINTS,
  USER_GEO_TOTAL,
  type UserGeoPoint,
} from "@/lib/user-geo";

const GEO_URL = "/countries-110m.json";

function markerRadius(count: number, maxCount: number) {
  const t = Math.sqrt(count / maxCount);
  return 2.2 + t * 7.5;
}

function haloRadius(core: number) {
  return core * 2.4;
}

type Props = {
  /** 可选：覆盖默认用户时区分布 */
  points?: UserGeoPoint[];
};

export default function TerritoryMap({ points = USER_GEO_POINTS }: Props) {
  const maxCount = Math.max(...points.map((p) => p.count), 1);
  const topLabels = points.slice(0, 6);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-zinc-950/40">
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 155, center: [10, 8] }}
        width={800}
        height={360}
        className="h-full w-full"
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#27272a"
                stroke="#3f3f46"
                strokeWidth={0.4}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none", fill: "#3f3f46" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {points.map((pin, i) => {
          const core = markerRadius(pin.count, maxCount);
          const halo = haloRadius(core);
          // 大点优先 interleave，避免全站同相位
          const delay = (i % 8) * 0.12;

          return (
            <Marker key={pin.timezone} coordinates={pin.coordinates}>
              <motion.circle
                fill="rgba(52,211,153,0.16)"
                stroke="rgba(52,211,153,0.3)"
                strokeWidth={0.8}
                initial={false}
                animate={{
                  r: [halo * 0.75, halo * 1.15, halo * 0.75],
                  opacity: [0.5, 0.12, 0.5],
                }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay,
                }}
              />
              <motion.circle
                fill="rgba(52,211,153,0.22)"
                initial={false}
                animate={{
                  r: [core * 1.1, core * 1.85, core * 1.1],
                  opacity: [0.4, 0.06, 0.4],
                }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: delay + 0.3,
                }}
              />
              <motion.circle
                fill="#34d399"
                initial={false}
                animate={{
                  r: [core * 0.88, core * 1.08, core * 0.88],
                  opacity: [0.82, 1, 0.82],
                }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay,
                }}
              />
              {pin.pct >= 1 && (
                <text
                  textAnchor="middle"
                  y={-(core + 8)}
                  style={{
                    fontFamily: "ui-sans-serif, system-ui, sans-serif",
                    fontSize: pin.pct >= 10 ? 9 : 7.5,
                    letterSpacing: "0.04em",
                    fill: "#a1a1aa",
                    fontWeight: 500,
                  }}
                >
                  {pin.short}
                </text>
              )}
            </Marker>
          );
        })}
      </ComposableMap>

      <div className="pointer-events-none absolute inset-x-2 bottom-1.5 flex flex-wrap items-end justify-between gap-1">
        <div className="flex flex-wrap gap-1">
          {topLabels.map((t) => (
            <span
              key={t.timezone}
              className="rounded-full border border-emerald-400/20 bg-zinc-950/75 px-2 py-0.5 text-[9px] text-emerald-300/90 backdrop-blur-sm"
            >
              {t.timezone.split("/").pop()?.replace(/_/g, " ")} · {t.count}
            </span>
          ))}
        </div>
        <span className="rounded border border-white/10 bg-zinc-950/70 px-1.5 py-0.5 text-[9px] text-zinc-500 backdrop-blur-sm">
          {points.length} tz · n={USER_GEO_TOTAL}
        </span>
      </div>
    </div>
  );
}
