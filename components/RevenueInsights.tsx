"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import type { RevenueAscViz } from "@/lib/extract";
import { usdMoneyToEurDisplay } from "@/lib/ops-costs";

const TerritoryMap = dynamic(() => import("@/components/TerritoryMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-md bg-zinc-950/40 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
      Loading map…
    </div>
  ),
});

const FADE = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as const,
};

function changeClass(pct?: number) {
  if (pct === undefined) return "text-zinc-500";
  if (pct > 0) return "text-emerald-400";
  if (pct < 0) return "text-rose-400";
  return "text-zinc-400";
}

function formatChange(pct?: number) {
  if (pct === undefined) return "—";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

const DEVICE_COLORS = ["#34d399", "#22d3ee", "#a78bfa", "#fbbf24"];

function DeviceMixCompact({
  devices,
}: {
  devices: { name: string; pct: number }[];
}) {
  const maxDevice = Math.max(...devices.map((d) => d.pct), 1);

  if (devices.length === 0) {
    return <p className="mt-3 text-sm text-zinc-600">No device breakdown yet</p>;
  }

  return (
    <div className="mt-3 space-y-2.5">
      {devices.map((d, i) => (
        <div key={d.name}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-zinc-400">{d.name}</span>
            <span className="tabular-nums text-zinc-200">{d.pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full"
              style={{
                backgroundColor: DEVICE_COLORS[i % DEVICE_COLORS.length],
              }}
              initial={{ width: 0 }}
              animate={{ width: `${(d.pct / maxDevice) * 100}%` }}
              transition={{ ...FADE, delay: 0.28 + i * 0.05 }}
            />
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <svg viewBox="0 0 36 36" className="h-10 w-10 shrink-0 -rotate-90">
          {(() => {
            let offset = 0;
            const r = 14;
            const c = 2 * Math.PI * r;
            return devices.map((d, i) => {
              const len = (d.pct / 100) * c;
              const el = (
                <circle
                  key={d.name}
                  cx="18"
                  cy="18"
                  r={r}
                  fill="none"
                  stroke={DEVICE_COLORS[i % DEVICE_COLORS.length]}
                  strokeWidth="4"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  opacity={0.9}
                />
              );
              offset += len;
              return el;
            });
          })()}
        </svg>
        <div className="min-w-0 space-y-0.5 text-[10px] text-zinc-500">
          {devices.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: DEVICE_COLORS[i % DEVICE_COLORS.length],
                }}
              />
              {d.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RevenueInsights({ viz }: { viz: RevenueAscViz }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      {(viz.period || viz.endingOn) && (
        <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">
          App Store Connect · {viz.period || `Ending ${viz.endingOn}`}
          {viz.endingOn && viz.period ? ` · UTC end ${viz.endingOn}` : ""}
        </p>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {viz.kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...FADE, delay: 0.08 + i * 0.05 }}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-light tabular-nums text-zinc-50">
              {kpi.label === "Sales"
                ? usdMoneyToEurDisplay(kpi.value)
                : kpi.value}
            </p>
            <p
              className={`mt-1 text-xs font-medium tabular-nums ${changeClass(kpi.changePct)}`}
            >
              {formatChange(kpi.changePct)} vs prior
            </p>
          </motion.div>
        ))}
      </div>

      {/* 左：Territories 大地图 · 右：Device Mix 小卡 + Top Apps */}
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.85fr)]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...FADE, delay: 0.2 }}
          className="flex min-h-[280px] flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5"
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            User geography (by timezone)
          </p>
          <div className="relative mt-3 min-h-[220px] flex-1 overflow-hidden rounded-lg">
            <TerritoryMap />
          </div>
        </motion.div>

        <div className="flex flex-col gap-4">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...FADE, delay: 0.26 }}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Device Mix
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">App Units by device</p>
            <DeviceMixCompact devices={viz.devices} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...FADE, delay: 0.3 }}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Top Apps
            </p>
            {viz.topApps.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600">No Top Apps yet</p>
            ) : (
              <div className="mt-3 space-y-3">
                {viz.topApps.map((app) => (
                  <div
                    key={`${app.name}-${app.appleId || app.units}`}
                    className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {app.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">
                        {[app.platform, app.appleId]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm tabular-nums text-zinc-100">
                        {app.units}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {app.sharePct}% ·{" "}
                        <span className={changeClass(app.changePct)}>
                          {formatChange(app.changePct)}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}

                <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5">
                  {viz.topApps.map((app, i) => (
                    <motion.div
                      key={app.name}
                      className="h-full"
                      style={{
                        backgroundColor:
                          DEVICE_COLORS[i % DEVICE_COLORS.length],
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${app.sharePct}%` }}
                      transition={{ ...FADE, delay: 0.36 + i * 0.05 }}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
