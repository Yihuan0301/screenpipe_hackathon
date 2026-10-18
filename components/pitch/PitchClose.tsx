"use client";

import { motion } from "framer-motion";
import {
  PITCH_CLOSE,
  PITCH_PLATFORMS,
  platformLogoUrl,
} from "@/lib/pitch-content";
import ScreenpipeBadge from "./ScreenpipeBadge";

const HUB_MODULES = ["Revenue", "Costs", "Monitor", "Feedback"] as const;

const PITCH_GRADIENT = {
  backgroundImage:
    "linear-gradient(105deg, #38bdf8 0%, #2dd4bf 45%, #a3e635 100%)",
  WebkitBackgroundClip: "text" as const,
  backgroundClip: "text" as const,
  color: "transparent",
  filter:
    "drop-shadow(0 0 18px rgba(56,189,248,0.35)) drop-shadow(0 0 40px rgba(45,212,191,0.18))",
};

const GOLD_GRADIENT = {
  backgroundImage:
    "linear-gradient(100deg, #fde68a 0%, #fbbf24 40%, #34d399 100%)",
  WebkitBackgroundClip: "text" as const,
  backgroundClip: "text" as const,
  color: "transparent",
  filter: "drop-shadow(0 0 20px rgba(251,191,36,0.35))",
};

export default function PitchClose() {
  const { before, now, finale, bridgeLabel } = PITCH_CLOSE;

  return (
    <section className="relative flex h-full min-h-0 w-full overflow-hidden px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_5%,rgba(34,211,238,0.13),transparent_48%),radial-gradient(ellipse_at_8%_90%,rgba(251,191,36,0.08),transparent_42%),linear-gradient(180deg,#06070b_0%,#0a1218_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
        }}
      />

      <ScreenpipeBadge />

      {/* Three bands: story → compare → core tech — content-sized, vertically centered */}
      <div className="relative z-10 flex h-full min-h-0 w-full flex-col justify-center gap-7 lg:gap-9">
        {/* TOP — brand + payoff */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="grid shrink-0 grid-cols-1 gap-5 pr-28 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-10"
        >
          <div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="font-[family-name:var(--font-pitch-display)] text-3xl font-semibold tracking-tight text-cyan-200/95 sm:text-4xl">
                {PITCH_CLOSE.brand}
              </p>
              <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">
                {PITCH_CLOSE.eyebrow}
              </p>
            </div>
            <h2 className="mt-3 max-w-xl whitespace-pre-line font-[family-name:var(--font-pitch-display)] text-2xl font-medium leading-[1.2] text-zinc-50 sm:text-3xl xl:text-[2.35rem]">
              {PITCH_CLOSE.headline}
            </h2>
          </div>
          <div className="lg:pb-1">
            <p className="max-w-md text-sm leading-relaxed text-zinc-500 sm:text-[15px] sm:leading-7">
              {PITCH_CLOSE.support}
            </p>
            <p
              className="mt-4 font-[family-name:var(--font-pitch-display)] text-xs font-medium uppercase tracking-[0.2em] sm:text-sm"
              style={PITCH_GRADIENT}
            >
              {PITCH_CLOSE.tagline}
            </p>
          </div>
        </motion.header>

        {/* MIDDLE — Before → Now, hug content (no tall empty boxes) */}
        <div className="relative grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-[1fr_minmax(64px,88px)_1fr] sm:items-center sm:gap-0">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 p-4 opacity-60 grayscale-[0.55] sm:p-5"
          >
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              {before.title}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {before.body}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PITCH_PLATFORMS.map((p, i) => (
                <span
                  key={p.name}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-500"
                  style={{
                    transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (2 + i * 0.6)}deg)`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={platformLogoUrl(p, 32)}
                    alt=""
                    width={12}
                    height={12}
                    className="rounded-sm bg-white/90 object-contain"
                  />
                  {p.name.split(" ")[0]}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              {before.caption}
            </p>
          </motion.div>

          <div className="relative flex flex-col items-center justify-center gap-1.5 py-1 sm:py-0">
            <div
              aria-hidden
              className="absolute inset-x-2 top-1/2 hidden h-[3px] -translate-y-1/2 rounded-full sm:block"
              style={{
                background:
                  "linear-gradient(90deg, rgba(161,161,170,0.25), rgba(56,189,248,0.85), rgba(45,212,191,0.9))",
                boxShadow:
                  "0 0 16px rgba(56,189,248,0.55), 0 0 32px rgba(45,212,191,0.25)",
              }}
            />
            <motion.div
              aria-hidden
              className="relative z-10 hidden h-3 w-3 rounded-full bg-cyan-300 sm:block"
              animate={{
                boxShadow: [
                  "0 0 8px rgba(56,189,248,0.6)",
                  "0 0 20px rgba(45,212,191,0.9)",
                  "0 0 8px rgba(56,189,248,0.6)",
                ],
              }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <p className="relative z-10 text-center text-[9px] font-medium uppercase leading-snug tracking-[0.12em] text-cyan-200/90 sm:mt-8 sm:bg-zinc-950/85 sm:px-1 sm:py-1 sm:backdrop-blur-sm">
              {bridgeLabel}
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="overflow-hidden rounded-2xl border border-cyan-400/40 bg-cyan-950/35 p-4 shadow-[0_0_48px_-12px_rgba(34,211,238,0.55),inset_0_1px_0_rgba(165,243,252,0.12)] sm:p-5"
          >
            <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/90">
              {now.title}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-200">
              {now.body}
            </p>
            <div className="mt-3 rounded-xl border border-cyan-400/20 bg-zinc-950/70 p-3 shadow-[inset_0_0_24px_rgba(34,211,238,0.08)]">
              <p className="font-[family-name:var(--font-pitch-display)] text-sm text-zinc-50">
                FounderHUD
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {HUB_MODULES.map((m) => (
                  <div
                    key={m}
                    className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] px-2.5 py-2 text-center text-[11px] text-cyan-50/90"
                  >
                    {m}
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">
              {now.caption}
            </p>
          </motion.div>
        </div>

        {/* BOTTOM — core tech as a full-width footing */}
        <motion.footer
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="shrink-0 border-t border-white/10 pt-5 sm:pt-6"
        >
          <p className="text-[10px] uppercase tracking-[0.28em] text-amber-200/70">
            {finale.kicker}
          </p>
          <div className="mt-3 grid grid-cols-1 items-end gap-4 sm:grid-cols-[auto_1fr_auto] sm:gap-8 lg:gap-12">
            <p className="font-[family-name:var(--font-pitch-display)] text-2xl leading-none tracking-tight text-zinc-50 sm:text-3xl xl:text-4xl">
              {finale.line}
            </p>
            <div
              className="flex flex-wrap gap-x-5 gap-y-1 font-[family-name:var(--font-pitch-display)] text-lg leading-snug tracking-tight sm:text-xl xl:text-2xl"
              style={GOLD_GRADIENT}
            >
              {finale.subLines.map((line) => (
                <span key={line} className="whitespace-nowrap">
                  {line}
                </span>
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 sm:text-right">
              {finale.strengths.join(" · ")}
            </p>
          </div>
        </motion.footer>
      </div>
    </section>
  );
}
