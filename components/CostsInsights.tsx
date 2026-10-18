"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  formatEur,
  mergeLedgerWithLive,
  opsCostSummary,
  type CostCategory,
  type LiveCostCapture,
} from "@/lib/ops-costs";

const FADE = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as const,
};

const CATEGORY_STYLE: Record<CostCategory, string> = {
  "Top-up": "border-amber-400/25 bg-amber-400/10 text-amber-300",
  "Dev Tool": "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  Infrastructure: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
  Platform: "border-violet-400/25 bg-violet-400/10 text-violet-300",
};

function relativeTime(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

export default function CostsInsights({
  liveCaptures = [],
}: {
  liveCaptures?: LiveCostCapture[];
}) {
  const summary = opsCostSummary();
  const { rows, fresh } = mergeLedgerWithLive(liveCaptures);
  const headline = fresh[0] || liveCaptures[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <AnimatePresence>
        {headline && (
          <motion.div
            key={headline.id}
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8 }}
            transition={FADE}
            className="shrink-0 overflow-hidden rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300">
                    Live from{" "}
                    {headline.source === "gmail" ? "email" : headline.source}
                  </p>
                </div>
                <p className="mt-1.5 truncate text-sm text-zinc-100">
                  New charge{" "}
                  <span className="font-medium text-emerald-300">
                    {headline.vendor}{" "}
                    {headline.eur != null
                      ? formatEur(headline.eur)
                      : headline.original}
                  </span>
                  {headline.matchedLedgerId
                    ? " · matched ledger row"
                    : " · appended"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {headline.note}
                </p>
              </div>
              <p className="shrink-0 text-[10px] tabular-nums text-emerald-400/80">
                {relativeTime(headline.capturedAt)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Ledger total",
            value: formatEur(summary.totalEur),
            sub: "Booked in EUR",
          },
          {
            label: "Line items",
            value: String(rows.length),
            sub: fresh.length
              ? `+${fresh.length} live`
              : `${summary.countedCount} counted`,
          },
          {
            label: "Dev tools",
            value: formatEur(summary.byCat["Dev Tool"] || 0),
            sub: "Cursor Pro etc.",
          },
          {
            label: "Email hits",
            value: String(liveCaptures.length),
            sub: liveCaptures.length ? "This patrol" : "Waiting on inbox",
          },
        ].map((tile, i) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...FADE, delay: 0.05 + i * 0.04 }}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
          >
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
              {tile.label}
            </p>
            <p className="mt-1 text-lg font-light tabular-nums text-zinc-50">
              {tile.value}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">{tile.sub}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...FADE, delay: 0.16 }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
      >
        <div className="flex shrink-0 items-end justify-between gap-3 border-b border-white/10 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Fixed Cost Ledger
          </p>
          <p className="text-[10px] text-zinc-600">Apr → Aug 2026 · EUR</p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="hidden w-full min-w-[680px] text-left text-sm md:table">
            <thead className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur">
              <tr className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                <th className="px-4 py-2.5 font-normal">Date</th>
                <th className="px-3 py-2.5 font-normal">Vendor</th>
                <th className="px-3 py-2.5 font-normal">Category</th>
                <th className="px-3 py-2.5 font-normal">Billed</th>
                <th className="px-3 py-2.5 font-normal">EUR</th>
                <th className="px-3 py-2.5 font-normal">Amort.</th>
                <th className="px-4 py-2.5 font-normal">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={
                    row.live
                      ? { opacity: 0, backgroundColor: "rgba(52,211,153,0.2)" }
                      : { opacity: 0 }
                  }
                  animate={{
                    opacity: 1,
                    backgroundColor: row.live
                      ? "rgba(52,211,153,0.08)"
                      : "rgba(0,0,0,0)",
                  }}
                  transition={{
                    ...FADE,
                    delay: row.live ? 0.05 : 0.08 + i * 0.015,
                  }}
                  className={`border-t text-zinc-300 ${
                    row.live ? "border-emerald-400/25" : "border-white/5"
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-400">
                    <div className="flex items-center gap-2">
                      {row.live && (
                        <span className="rounded border border-emerald-400/40 bg-emerald-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-300">
                          New
                        </span>
                      )}
                      {row.date}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-100">{row.vendor}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] ${CATEGORY_STYLE[row.category]}`}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-500">
                    {row.original}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2.5 tabular-nums ${
                      row.eur === null ? "text-zinc-600" : "text-zinc-100"
                    }`}
                  >
                    {formatEur(row.eur)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-zinc-500">
                    {row.amortizeMonths ? `${row.amortizeMonths} mo` : "—"}
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-zinc-500">
                    {row.note}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-2 p-3 md:hidden">
            {rows.map((row) => (
              <div
                key={row.id}
                className={`rounded-lg border p-3 ${
                  row.live
                    ? "border-emerald-400/30 bg-emerald-400/10"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {row.live && (
                        <span className="rounded border border-emerald-400/40 px-1.5 py-0.5 text-[9px] uppercase text-emerald-300">
                          New
                        </span>
                      )}
                      <p className="text-sm text-zinc-100">{row.vendor}</p>
                    </div>
                    <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500">
                      {row.date}
                    </p>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[10px] ${CATEGORY_STYLE[row.category]}`}
                  >
                    {row.category}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-zinc-500">{row.original}</span>
                  <span
                    className={`tabular-nums ${
                      row.eur === null ? "text-zinc-600" : "text-zinc-200"
                    }`}
                  >
                    {formatEur(row.eur)}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-600">{row.note}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
