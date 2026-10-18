"use client";

import { motion } from "framer-motion";
import type {
  PlatformCard,
  PlatformHealth,
  PlatformId,
  StatusViz,
} from "@/lib/status-platforms";

const FADE = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as const,
};

const HEALTH_STYLE: Record<
  PlatformHealth,
  { dot: string; pill: string; label: string }
> = {
  ok: {
    dot: "bg-emerald-400",
    pill: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    label: "OK",
  },
  warn: {
    dot: "bg-amber-400",
    pill: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    label: "WATCH",
  },
  down: {
    dot: "bg-rose-400",
    pill: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    label: "DOWN",
  },
  unknown: {
    dot: "bg-zinc-500",
    pill: "border-white/15 bg-white/5 text-zinc-400",
    label: "—",
  },
};

const PLATFORM_ACCENT: Record<PlatformId, string> = {
  cloudflare: "text-orange-300",
  netlify: "text-teal-300",
  fly: "text-violet-300",
  supabase: "text-emerald-300",
  deepseek: "text-sky-300",
  tencent: "text-blue-300",
};

/** Primary metrics per platform */
const PRIMARY_KEYS: Record<PlatformId, string[]> = {
  cloudflare: ["Domain", "Status", "Security insights", "Unique visitors", "Plan"],
  netlify: ["Plan", "Credits left", "Deploys", "Web requests", "Credits used"],
  fly: ["Status", "Machines", "Last invoice", "Upcoming", "Credit bal"],
  supabase: ["MAU", "DB size", "Egress", "Edge fns", "Plan"],
  deepseek: ["Topped-up", "30d cost", "API requests", "Tokens", "flash req"],
  tencent: ["Traffic", "Disk", "CPU", "Memory", "Signal"],
};

function relativeTime(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

function PlatformPanel({
  card,
  index,
}: {
  card: PlatformCard;
  index: number;
}) {
  const health = HEALTH_STYLE[card.health];
  const keys = PRIMARY_KEYS[card.id];
  const metrics = keys.map(
    (label) =>
      card.metrics.find((m) => m.label === label) || {
        label,
        value: "—",
      }
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...FADE, delay: 0.08 + index * 0.04 }}
      className="relative flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3.5 pb-8"
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {card.health === "ok" && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${health.dot}`}
                />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${health.dot}`}
              />
            </span>
            <p
              className={`text-[11px] font-medium tracking-wide ${PLATFORM_ACCENT[card.id]}`}
            >
              {card.name}
            </p>
          </div>
          <p className="mt-1 truncate text-sm text-zinc-100">{card.headline}</p>
        </div>
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] ${health.pill}`}
        >
          {health.label}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-1.5 content-start">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5"
          >
            <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-500">
              {m.label}
            </p>
            <p className="mt-0.5 truncate text-[13px] tabular-nums text-zinc-100">
              {m.value}
            </p>
            {m.hint && (
              <p className="mt-0.5 truncate text-[10px] text-zinc-600">{m.hint}</p>
            )}
          </div>
        ))}
      </div>

      {card.capturedAt ? (
        <p className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] tabular-nums text-zinc-600">
          Synced · {relativeTime(card.capturedAt)}
        </p>
      ) : card.health === "unknown" ? (
        <p className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] text-zinc-600">
          Awaiting sync
        </p>
      ) : null}
    </motion.div>
  );
}

export default function StatusInsights({ viz }: { viz: StatusViz }) {
  const overall = HEALTH_STYLE[viz.overall];
  const liveCount = viz.platforms.filter((p) => p.health !== "unknown").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...FADE, delay: 0.06 }}
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            {viz.overall === "ok" && (
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${overall.dot}`}
              />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${overall.dot}`}
            />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Monitor health
            </p>
            <p className="mt-0.5 text-sm text-zinc-100">
              {liveCount}/{viz.platforms.length} live · CF · Netlify · Fly ·
              Supabase · DeepSeek · Tencent
            </p>
          </div>
        </div>
        <span
          className={`inline-block rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${overall.pill}`}
        >
          {viz.overallLabel}
        </span>
      </motion.div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
        {viz.platforms.map((card, i) => (
          <PlatformPanel key={card.id} card={card} index={i} />
        ))}
      </div>
    </div>
  );
}
