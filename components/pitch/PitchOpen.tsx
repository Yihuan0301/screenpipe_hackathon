"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PITCH_OPEN,
  PITCH_PLATFORMS,
  platformLogoUrl,
  type PitchPlatform,
} from "@/lib/pitch-content";
import ScreenpipeBadge from "./ScreenpipeBadge";

/** Irregular overlapping browser windows */
const TAB_LAYOUT: {
  top: string;
  left: string;
  rotate: number;
  z: number;
  w: string;
}[] = [
  { top: "12%", left: "4%", rotate: -5.5, z: 2, w: "60%" },
  { top: "17%", left: "36%", rotate: 3.5, z: 5, w: "54%" },
  { top: "28%", left: "10%", rotate: -2, z: 4, w: "50%" },
  { top: "33%", left: "46%", rotate: 6, z: 6, w: "48%" },
  { top: "45%", left: "2%", rotate: 2.5, z: 3, w: "56%" },
  { top: "50%", left: "40%", rotate: -4.5, z: 7, w: "52%" },
  { top: "62%", left: "16%", rotate: 4.5, z: 5, w: "46%" },
  { top: "67%", left: "48%", rotate: -3, z: 12, w: "50%" }, // DeepSeek on top
  { top: "76%", left: "20%", rotate: 1.5, z: 8, w: "56%" },
];

function PlatformLogo({
  platform,
  className,
}: {
  platform: PitchPlatform;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-md bg-white/10 text-[10px] font-semibold text-zinc-300 ${className || ""}`}
      >
        {platform.name.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={platformLogoUrl(platform, 128)}
      alt=""
      width={32}
      height={32}
      className={`rounded-md bg-white object-contain p-0.5 ${className || ""}`}
      onError={() => setFailed(true)}
    />
  );
}

function BrowserWindow({
  platform,
  compact = false,
}: {
  platform: PitchPlatform;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/12 bg-[#f4f4f5] shadow-[0_16px_48px_-16px_rgba(0,0,0,0.9)] transition-[box-shadow,transform] group-hover:shadow-[0_20px_56px_-12px_rgba(56,189,248,0.35)] group-hover:ring-1 group-hover:ring-cyan-400/30">
      <div className="border-b border-zinc-200/80 bg-zinc-100 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200/90">
          <PlatformLogo
            platform={platform}
            className="h-3.5 w-3.5 shrink-0 rounded-sm p-0"
          />
          <span className="truncate text-[10px] leading-none text-zinc-500">
            https://{platform.url}
          </span>
        </div>
      </div>
      <div
        className={`flex items-center gap-3 bg-white ${
          compact ? "px-2.5 py-2" : "px-3.5 py-3"
        }`}
      >
        <PlatformLogo
          platform={platform}
          className={compact ? "h-7 w-7" : "h-9 w-9"}
        />
        <div className="min-w-0">
          <p
            className={`truncate font-medium text-zinc-900 ${
              compact ? "text-xs" : "text-[13px]"
            }`}
          >
            {platform.name}
          </p>
          <p className="truncate text-[11px] text-zinc-500">{platform.role}</p>
        </div>
      </div>
    </div>
  );
}

function PlatformPreview({
  platform,
  onClose,
}: {
  platform: PitchPlatform;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        aria-label="Close preview"
        className="absolute inset-0 bg-zinc-950/75 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pitch-preview-title"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.9),0_0_40px_-12px_rgba(34,211,238,0.35)]"
      >
        {/* Enlarged site chrome */}
        <div className="border-b border-zinc-800 bg-zinc-900 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-zinc-800/90 px-3 py-1.5 ring-1 ring-white/10">
              <PlatformLogo
                platform={platform}
                className="h-4 w-4 shrink-0 rounded-sm p-0"
              />
              <span className="truncate text-[11px] text-zinc-400">
                https://{platform.url}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
            >
              Esc
            </button>
          </div>
        </div>

        {/* Mock page preview */}
        <div className="bg-gradient-to-b from-zinc-100 to-zinc-200 px-4 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <PlatformLogo platform={platform} className="h-10 w-10" />
            <div className="min-w-0">
              <p
                id="pitch-preview-title"
                className="font-[family-name:var(--font-pitch-display)] text-base font-semibold text-zinc-900"
              >
                {platform.name}
              </p>
              <p className="text-[11px] text-zinc-500">{platform.role}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 rounded-xl border border-zinc-300/80 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-700 shadow-sm">
            {platform.previewLines.map((line, i) => (
              <motion.p
                key={line}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.07 }}
                className={i === 0 ? "text-zinc-400" : "text-zinc-800"}
              >
                {line}
              </motion.p>
            ))}
          </div>
        </div>

        {/* Extract keywords — pitch punchline */}
        <div className="border-t border-white/10 bg-zinc-950 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-400/90">
            We pull from this screen
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {platform.extract.map((kw, i) => (
              <motion.span
                key={kw}
                initial={{ opacity: 0, scale: 0.85, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  delay: 0.28 + i * 0.06,
                  type: "spring",
                  stiffness: 400,
                  damping: 22,
                }}
                className="rounded-md border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-100 shadow-[0_0_16px_-6px_rgba(34,211,238,0.7)]"
              >
                {kw}
              </motion.span>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Words on screen → fields in the HUD.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TabFarm({
  platforms,
  compact = false,
}: {
  platforms: PitchPlatform[];
  compact?: boolean;
}) {
  const [active, setActive] = useState<PitchPlatform | null>(null);

  return (
    <div className="relative h-full w-full">
      {!compact && (
        <p className="pointer-events-none absolute left-5 top-4 z-30 text-[10px] uppercase tracking-[0.24em] text-zinc-500">
          Browser tabs · everyday mess
          <span className="mt-1 block tracking-[0.18em] text-zinc-600 normal-case">
            Click a tab → see what we pull
          </span>
        </p>
      )}
      {platforms.map((p, i) => {
        const layout = TAB_LAYOUT[i] || TAB_LAYOUT[0];
        return (
          <motion.button
            key={p.name}
            type="button"
            initial={
              compact
                ? false
                : { opacity: 0, y: 12, rotate: layout.rotate - 4 }
            }
            animate={
              compact
                ? undefined
                : { opacity: 1, y: 0, rotate: layout.rotate }
            }
            transition={
              compact
                ? undefined
                : {
                    delay: 0.22 + i * 0.045,
                    type: "spring",
                    stiffness: 220,
                    damping: 22,
                  }
            }
            whileHover={{ scale: 1.03, zIndex: 20 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActive(p)}
            className={`group absolute cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
              compact ? "w-[78%]" : ""
            }`}
            style={
              compact
                ? {
                    top: `${10 + i * 15}%`,
                    left: `${6 + (i % 3) * 7}%`,
                    transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (2.5 + i)}deg)`,
                    zIndex: i + 1,
                  }
                : {
                    top: layout.top,
                    left: layout.left,
                    width: layout.w,
                    zIndex: layout.z,
                  }
            }
          >
            <BrowserWindow platform={p} compact={compact} />
          </motion.button>
        );
      })}

      <AnimatePresence>
        {active && (
          <PlatformPreview
            platform={active}
            onClose={() => setActive(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PitchOpen() {
  return (
    <section className="relative flex h-full min-h-0 w-full overflow-hidden px-6 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(251,191,36,0.11),transparent_50%),radial-gradient(ellipse_at_85%_70%,rgba(34,211,238,0.09),transparent_48%),linear-gradient(180deg,#07080c_0%,#0c1018_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.32]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
        }}
      />

      <ScreenpipeBadge />

      <div className="relative z-10 grid h-full min-h-0 w-full grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 xl:gap-16">
        <div className="flex min-h-0 flex-col justify-between py-1">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="font-[family-name:var(--font-pitch-display)] text-4xl font-semibold tracking-tight text-amber-200/95 sm:text-5xl">
                {PITCH_OPEN.brand}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.28em] text-zinc-500">
                {PITCH_OPEN.eyebrow}
              </p>
              <h1 className="mt-3 whitespace-pre-line font-[family-name:var(--font-pitch-display)] text-[1.65rem] font-medium leading-[1.2] tracking-tight text-zinc-50 sm:text-3xl xl:text-[2.35rem] xl:leading-[1.15]">
                {PITCH_OPEN.headline}
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mt-6 max-w-md text-sm leading-relaxed text-zinc-500 sm:mt-7 sm:text-[15px] sm:leading-7"
            >
              {PITCH_OPEN.support}
            </motion.p>

            <motion.ul
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.45 }}
              className="mt-10 space-y-3.5 border-y border-white/10 py-7"
            >
              {PITCH_OPEN.pains.map((pain) => (
                <li
                  key={pain}
                  className="flex gap-3 text-sm leading-snug text-zinc-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[1px] bg-amber-400/90" />
                  {pain}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.55 }}
            className="mt-10 lg:mt-8"
          >
            <p
              className="font-[family-name:var(--font-pitch-display)] text-xl leading-snug sm:text-2xl xl:text-[1.75rem]"
              style={{
                backgroundImage:
                  "linear-gradient(105deg, #38bdf8 0%, #2dd4bf 45%, #a3e635 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                filter:
                  "drop-shadow(0 0 18px rgba(56,189,248,0.35)) drop-shadow(0 0 40px rgba(45,212,191,0.18))",
              }}
            >
              {PITCH_OPEN.bridge}
            </p>
            <p className="mt-3 text-sm text-zinc-500">{PITCH_OPEN.bridgeSub}</p>
            <p className="mt-8 text-[10px] uppercase tracking-[0.32em] text-zinc-600">
              {PITCH_OPEN.scrollHint} ↓
            </p>
          </motion.div>
        </div>

        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.55 }}
          className="relative hidden min-h-[420px] lg:block xl:min-h-0"
        >
          <div className="absolute inset-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,rgba(244,63,94,0.07),transparent_60%)]" />
            <div className="relative h-full w-full p-4 sm:p-5">
              <TabFarm platforms={PITCH_PLATFORMS} />
            </div>
          </div>
        </motion.aside>

        <div className="relative min-h-[280px] lg:hidden">
          <div className="relative h-[300px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/50 p-3">
            <TabFarm platforms={PITCH_PLATFORMS.slice(0, 5)} compact />
          </div>
        </div>
      </div>
    </section>
  );
}
