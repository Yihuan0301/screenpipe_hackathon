"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, type Transition } from "framer-motion";
import {
  DollarSign,
  TrendingDown,
  Activity,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import type { ModuleBriefing, ModuleViz } from "@/lib/extract";
import { usdMoneyToEurDisplay, type LiveCostCapture } from "@/lib/ops-costs";
import RevenueInsights from "@/components/RevenueInsights";
import CostsInsights from "@/components/CostsInsights";
import StatusInsights from "@/components/StatusInsights";
import CommentsInsights from "@/components/CommentsInsights";

type ModuleId = "revenue" | "costs" | "status" | "comments";

type CockpitModule = {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  accent: string;
  /** Colored box-shadow tint for the card shell */
  glow: string;
  /** Soft ambient blob behind the card */
  aura: string;
  preview: string;
  details: { label: string; value: string }[];
  viz?: ModuleViz;
  briefing?: ModuleBriefing;
  teaser?: string;
  liveCaptures?: LiveCostCapture[];
};

type LiveModules = Record<
  ModuleId,
  {
    preview: string;
    details: { label: string; value: string }[];
    viz?: ModuleViz;
    briefing?: ModuleBriefing;
    teaser?: string;
    liveCaptures?: LiveCostCapture[];
  }
>;

const MODULE_META: Omit<CockpitModule, "preview" | "details">[] = [
  {
    id: "revenue",
    label: "Revenue",
    icon: DollarSign,
    accent: "text-emerald-400",
    glow: "shadow-[0_0_48px_-6px_rgba(16,185,129,0.55)]",
    aura: "bg-emerald-400/35",
  },
  {
    id: "costs",
    label: "Costs",
    icon: TrendingDown,
    accent: "text-rose-400",
    glow: "shadow-[0_0_48px_-6px_rgba(244,63,94,0.5)]",
    aura: "bg-rose-400/35",
  },
  {
    id: "status",
    label: "Monitor",
    icon: Activity,
    accent: "text-cyan-400",
    glow: "shadow-[0_0_48px_-6px_rgba(34,211,238,0.5)]",
    aura: "bg-cyan-400/35",
  },
  {
    id: "comments",
    label: "Feedback",
    icon: MessageSquare,
    accent: "text-amber-400",
    glow: "shadow-[0_0_48px_-6px_rgba(251,191,36,0.5)]",
    aura: "bg-amber-400/35",
  },
];

/** UI labels — module Sync ≠ Global Sync */
const SYNC_LABEL: Record<ModuleId | "core", string> = {
  revenue: "Revenue",
  costs: "Costs",
  status: "Monitor",
  comments: "Feedback",
  core: "Global",
};

/** Empty shell for pitch demo — fill on one click */
const BLANK: LiveModules = {
  revenue: {
    preview: "—",
    details: [
      { label: "Sales", value: "—" },
      { label: "Units", value: "—" },
      { label: "Source", value: "App Store Connect" },
      { label: "Status", value: "Empty" },
    ],
    teaser: "Empty template · waiting for fill",
  },
  costs: {
    preview: "—",
    details: [
      { label: "Total", value: "—" },
      { label: "Vendors", value: "—" },
      { label: "Source", value: "Gmail · consoles" },
      { label: "Status", value: "Empty" },
    ],
    teaser: "Empty template · waiting for fill",
  },
  status: {
    preview: "—",
    details: [
      { label: "Platforms", value: "—" },
      { label: "Quotas", value: "—" },
      { label: "Health", value: "—" },
      { label: "Status", value: "Empty" },
    ],
    teaser: "Empty template · waiting for fill",
  },
  comments: {
    preview: "—",
    details: [
      { label: "Rednote", value: "—" },
      { label: "App Store", value: "—" },
      { label: "Latest", value: "—" },
      { label: "Status", value: "Empty" },
    ],
    teaser: "Empty template · waiting for fill",
  },
};

/** 轮播切换：稍有弹性 */
const SPRING: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 28,
  mass: 0.9,
};

/**
 * layoutId 变形用 tween，不用 spring——
 * spring 收尾会抖一下，AnimatePresence 等 settle 时也容易在最后一帧卡顿。
 */
const MORPH: Transition = {
  type: "tween",
  duration: 0.48,
  ease: [0.32, 0.72, 0, 1],
};

/** 透明度/位移：丝滑缓出 */
const FADE: Transition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1],
};

/** 详情面板退出：先走，给卡片 morph 让路 */
const DETAILS_EXIT: Transition = {
  duration: 0.22,
  ease: [0.4, 0, 1, 1],
};

/** 返回后轮播层浮现，略慢于 morph，避免两套动画抢最后一帧 */
const CAROUSEL_REVEAL: Transition = {
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1],
};

const CARD_W = 420;
const CARD_H = 540;
const SIDE_GAP = 460;
const STAGE_Y = 12;

function getCircularDiff(index: number, activeIndex: number, total: number) {
  let diff = index - activeIndex;
  if (diff > total / 2) {
    diff -= total;
  } else if (diff < -total / 2) {
    diff += total;
  }
  return diff;
}

function getCoverFlowPose(diff: number) {
  if (diff === 0) {
    return {
      x: 0,
      y: STAGE_Y,
      scale: 1,
      rotateY: 0,
      opacity: 1,
      zIndex: 50,
      filter: "blur(0px)" as const,
    };
  }

  if (diff === -1) {
    return {
      x: -SIDE_GAP,
      y: STAGE_Y,
      scale: 0.75,
      rotateY: 25,
      opacity: 0.7,
      zIndex: 40,
      filter: "blur(0px)" as const,
    };
  }

  if (diff === 1) {
    return {
      x: SIDE_GAP,
      y: STAGE_Y,
      scale: 0.75,
      rotateY: -25,
      opacity: 0.7,
      zIndex: 40,
      filter: "blur(0px)" as const,
    };
  }

  return {
    x: 0,
    y: -40,
    scale: 0.55,
    rotateY: 0,
    opacity: 0.2,
    zIndex: 30,
    filter: "blur(0px)" as const,
  };
}

function ModulePanel({
  module,
  isActive,
  isSidebar,
  layoutId,
  onSelect,
}: {
  module: CockpitModule;
  isActive: boolean;
  isSidebar?: boolean;
  layoutId?: string;
  onSelect: () => void;
}) {
  const Icon = module.icon;
  const lit = isActive || isSidebar;
  // Detail sidebar: quieter glow; carousel active: fuller bloom
  const shellClass = `
    relative flex h-full w-full flex-col overflow-hidden rounded-2xl border text-left
    backdrop-blur-xl transition-[box-shadow,border-color] duration-500
    ${
      isSidebar
        ? "border-white/15 bg-zinc-900/85 shadow-xl shadow-black/50"
        : lit
          ? `border-white/25 bg-zinc-900/85 shadow-2xl ${module.glow}`
          : "border-white/10 bg-zinc-900/60 shadow-lg shadow-black/40"
    }
  `;

  const aura = (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-opacity duration-500 ${module.aura} ${
        isSidebar
          ? "h-[70%] w-[70%] opacity-25"
          : lit
            ? "h-[120%] w-[120%] opacity-80"
            : "h-[100%] w-[100%] opacity-35"
      }`}
    />
  );

  const header = (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 ${module.accent} ${
          isSidebar
            ? "shadow-[0_0_12px_-4px_currentColor]"
            : lit
              ? "shadow-[0_0_20px_-2px_currentColor]"
              : ""
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
          Module
        </p>
        <h2
          className={`truncate font-semibold tracking-tight ${module.accent} ${
            isSidebar ? "text-lg" : "text-xl"
          }`}
        >
          {module.label}
        </h2>
      </div>
    </div>
  );

  const gridBg = (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </>
  );

  // 侧栏：不显示金额，改为 AI 分析简报
  if (isSidebar) {
    const briefing = module.briefing;
    return (
      <div className="relative h-full w-full">
        {aura}
        <motion.div
          layoutId={layoutId}
          transition={MORPH}
          className={shellClass}
          style={{ willChange: layoutId ? "transform" : undefined }}
        >
          {gridBg}
          <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-col p-5">
            {header}
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
              <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400/80">
                AI Briefing
              </p>
              {briefing ? (
                <>
                  <p className="mt-3 text-[13px] leading-relaxed text-zinc-200">
                    {briefing.summary}
                  </p>
                  <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Suggestions
                  </p>
                  <ul className="mt-2 space-y-2.5">
                    {briefing.suggestions.map((s, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[12px] leading-snug text-zinc-400"
                      >
                        <span className={`mt-0.5 shrink-0 ${module.accent}`}>
                          →
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
                  Sync this module to get product-focused analysis and next steps
                  here.
                </p>
              )}
            </div>
            <p className="mt-3 shrink-0 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              Heuristic AI · ASC Trends
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {aura}
      <motion.button
        type="button"
        layoutId={layoutId}
        transition={MORPH}
        onClick={onSelect}
        className={`${shellClass} cursor-pointer`}
        style={{ willChange: layoutId ? "transform" : undefined }}
      >
      {gridBg}
      <div className="relative z-10 flex h-full min-w-0 flex-col p-6 sm:p-8">
        {header}

        <div className="mt-8 min-w-0">
          <p className="break-words text-4xl font-light tracking-tight text-zinc-100 sm:text-5xl">
            {module.preview}
          </p>
          <AnimatePresence mode="popLayout">
            {!isActive && (
              <motion.p
                key="hint-side"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE}
                className="mt-3 text-sm text-zinc-500"
              >
                Tap to focus in the cockpit
              </motion.p>
            )}
            {isActive && (
              <motion.p
                key="hint-expand"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ ...FADE, delay: 0.32 }}
                className="mt-3 line-clamp-2 text-sm leading-snug text-zinc-400"
              >
                {module.teaser ||
                  module.details
                    .slice(0, 3)
                    .map((d) => `${d.label} ${d.value}`)
                    .join(" · ") ||
                  "Tap to expand details"}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {isActive && (
            <motion.div
              key={`${module.id}-summary`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ ...FADE, delay: 0.3 }}
              className="mt-auto space-y-3 border-t border-white/10 pt-6 text-sm"
            >
              {module.details.slice(0, 4).map((row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="shrink-0 text-zinc-500">{row.label}</span>
                  <span className="text-right font-medium text-zinc-200 tabular-nums">
                    {row.value}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
    </div>
  );
}

export default function Cockpit() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [live, setLive] = useState<LiveModules>(BLANK);
  /** Pitch demo: cards stay empty until one-click fill */
  const [hydrated, setHydrated] = useState(false);
  const [fillFlash, setFillFlash] = useState(false);
  const [pipeOk, setPipeOk] = useState<boolean | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [patrolBusy, setPatrolBusy] = useState(false);
  /** Active Sync target — `core` = all modules; else only that card */
  const [patrolTarget, setPatrolTarget] = useState<ModuleId | "core" | null>(
    null
  );
  const [patrolMsg, setPatrolMsg] = useState<string | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const pullRef = useRef<() => Promise<void>>(async () => {});
  const pendingLiveRef = useRef<LiveModules | null>(null);
  const hydratedRef = useRef(false);
  const patrolTargetRef = useRef<ModuleId | "core" | null>(null);
  /** Modules the user has synced — idle pull only refreshes these */
  const filledModulesRef = useRef<Set<ModuleId>>(new Set());

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    patrolTargetRef.current = patrolTarget;
  }, [patrolTarget]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      try {
        const res = await fetch("/api/cockpit", { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !data?.modules) return;

        setPipeOk(Boolean(data.screenpipeHealthy));
        setFetchedAt(data.fetchedAt ?? null);
        const next: LiveModules = {
          revenue: {
            preview: usdMoneyToEurDisplay(data.modules.revenue.preview),
            details: (data.modules.revenue.details || []).map(
              (d: { label: string; value: string }) => ({
                ...d,
                value:
                  d.label === "Sales" || /^\$/.test(d.value)
                    ? usdMoneyToEurDisplay(d.value)
                    : d.value,
              })
            ),
            viz: data.modules.revenue.viz,
            briefing: data.modules.revenue.briefing,
            teaser: data.modules.revenue.teaser
              ? String(data.modules.revenue.teaser).replace(
                  /\$[\d,.]+(?:K)?/gi,
                  (m) => usdMoneyToEurDisplay(m)
                )
              : data.modules.revenue.teaser,
          },
          costs: {
            preview: data.modules.costs.preview,
            details: data.modules.costs.details,
            viz: data.modules.costs.viz,
            briefing: data.modules.costs.briefing,
            teaser: data.modules.costs.teaser,
            liveCaptures: data.modules.costs.liveCaptures,
          },
          status: {
            preview: data.modules.status.preview,
            details: data.modules.status.details,
            viz: data.modules.status.viz,
            briefing: data.modules.status.briefing,
            teaser: data.modules.status.teaser,
          },
          comments: {
            preview: data.modules.comments.preview,
            details: data.modules.comments.details,
            viz: data.modules.comments.viz,
            briefing: data.modules.comments.briefing,
            teaser: data.modules.comments.teaser,
          },
        };
        pendingLiveRef.current = next;
        // Pitch: stay blank until Sync. Module Sync ≠ fill other cards.
        if (hydratedRef.current) {
          const scope = patrolTargetRef.current;
          if (scope && scope !== "core") {
            setLive((prev) => ({ ...prev, [scope]: next[scope] }));
          } else if (scope === "core") {
            setLive(next);
          } else {
            const filled = filledModulesRef.current;
            setLive((prev) => {
              const out = { ...prev };
              for (const id of filled) out[id] = next[id];
              return out;
            });
          }
        }
      } catch {
        if (!cancelled) setPipeOk(false);
      }
    }

    pullRef.current = pull;
    pull();
    const id = setInterval(pull, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  /** Inject cache into HUD. `core` → all four; else only that module. */
  async function applyPendingToHud(scope: ModuleId | "core" = "core") {
    await pullRef.current();
    const next = pendingLiveRef.current;
    if (!next) return false;
    setFillFlash(true);
    if (scope === "core") {
      filledModulesRef.current = new Set([
        "revenue",
        "costs",
        "status",
        "comments",
      ]);
      setLive(next);
    } else {
      filledModulesRef.current.add(scope);
      setLive((prev) => ({ ...prev, [scope]: next[scope] }));
    }
    setHydrated(true);
    window.setTimeout(() => setFillFlash(false), 900);
    return true;
  }

  /** Module Sync = one tab; Global Sync (`core`) = all four. */
  async function runModulePatrol(moduleId: ModuleId | "core") {
    if (patrolBusy) return;
    setPatrolBusy(true);
    setPatrolTarget(moduleId);
    patrolTargetRef.current = moduleId;
    const isGlobal = moduleId === "core";
    const label = SYNC_LABEL[moduleId];
    setPatrolMsg(
      isGlobal
        ? "Global Sync · opening all platforms…"
        : `${label} Sync · this module only…`
    );
    try {
      const res = await fetch("/api/patrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleId }),
      });
      const data = await res.json();
      if (!data?.ok || !data?.started) {
        setPatrolMsg(
          data?.error || "Sync failed — try again in a moment"
        );
        setPatrolBusy(false);
        setPatrolTarget(null);
        patrolTargetRef.current = null;
        window.setTimeout(() => setPatrolMsg(null), 12000);
        return;
      }

      setPatrolMsg(
        data?.hint ||
          "Sync started — Chrome opens if needed; sign in there if prompted."
      );

      const maxTicks = isGlobal ? 180 : 90; // global visits many consoles
      let ticks = 0;
      const poll = window.setInterval(() => {
        ticks += 1;
        void pullRef.current();
        void fetch("/api/patrol")
          .then((r) => r.json())
          .then(
            (s: {
              busy?: boolean;
              status?: { phase?: string; message?: string } | null;
            }) => {
              const msg = s?.status?.message;
              if (msg) setPatrolMsg(msg);
              if (s?.status?.phase === "done" || s?.status?.phase === "error") {
                window.clearInterval(poll);
                setPatrolBusy(false);
                if (s.status.phase === "done") {
                  // Keep scope until HUD inject finishes (module Sync ≠ fill all)
                  void applyPendingToHud(moduleId)
                    .then((ok) => {
                      setPatrolMsg(
                        ok
                          ? isGlobal
                            ? "Global Sync complete · all four modules updated"
                            : `${label} Sync complete · only this module updated`
                          : "Sync done · refresh if cards still empty"
                      );
                    })
                    .finally(() => {
                      setPatrolTarget(null);
                      patrolTargetRef.current = null;
                    });
                } else {
                  setPatrolTarget(null);
                  patrolTargetRef.current = null;
                  setPatrolMsg(msg || "Sync error");
                }
                window.setTimeout(() => setPatrolMsg(null), 8000);
              } else if (
                !s?.busy &&
                ticks >= 4 &&
                s?.status?.phase !== "waiting_login"
              ) {
                window.clearInterval(poll);
                setPatrolBusy(false);
                void applyPendingToHud(moduleId)
                  .then((ok) => {
                    setPatrolMsg(
                      ok
                        ? isGlobal
                          ? msg || "Global Sync finished"
                          : msg || `${label} Sync finished`
                        : msg || "Sync finished"
                    );
                  })
                  .finally(() => {
                    setPatrolTarget(null);
                    patrolTargetRef.current = null;
                  });
                window.setTimeout(() => setPatrolMsg(null), 6000);
              }
            }
          )
          .catch(() => {});
        if (ticks >= maxTicks) {
          window.clearInterval(poll);
          setPatrolBusy(false);
          setPatrolTarget(null);
          patrolTargetRef.current = null;
          setPatrolMsg("Sync timed out — check the Chrome window");
          window.setTimeout(() => setPatrolMsg(null), 8000);
        }
      }, 2000);
    } catch (err) {
      setPatrolBusy(false);
      setPatrolTarget(null);
      patrolTargetRef.current = null;
      setPatrolMsg(
        err instanceof Error ? err.message : "Sync request failed"
      );
      window.setTimeout(() => setPatrolMsg(null), 8000);
    }
  }

  const modules: CockpitModule[] = MODULE_META.map((meta) => ({
    ...meta,
    preview: live[meta.id].preview,
    details: live[meta.id].details,
    viz: live[meta.id].viz,
    briefing: live[meta.id].briefing,
    teaser: live[meta.id].teaser,
    liveCaptures: live[meta.id].liveCaptures,
  }));

  const active = modules[activeIndex];
  const expandedModule =
    expandedIndex !== null ? modules[expandedIndex] : null;

  function clearCollapseTimer() {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }

  function collapse() {
    setIsCollapsing(true);
    setIsExpanded(false);
    clearCollapseTimer();
    collapseTimerRef.current = window.setTimeout(() => {
      setExpandedIndex(null);
      setIsCollapsing(false);
      collapseTimerRef.current = null;
    }, 520);
  }

  function expandAt(index: number) {
    clearCollapseTimer();
    setIsCollapsing(false);
    setExpandedIndex(index);
    setIsExpanded(true);
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 z-0">
        <Image
          src="/bg-cockpit.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-zinc-950/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[280px] w-[400px] rounded-full bg-emerald-500/5 blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 h-[280px] w-[400px] rounded-full bg-rose-500/5 blur-[100px]" />
      </div>

      <header className="relative z-50 flex items-center justify-between gap-3 px-6 py-5 sm:px-10">
        <div className="flex min-w-0 flex-wrap items-end gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-400/80">
              Screen is the Universal API
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Founder<span className="text-cyan-400">HUD</span>
            </h1>
          </div>
          {/* Global Sync — real Playwright patrol across all core tabs */}
          <button
            type="button"
            disabled={patrolBusy}
            onClick={() => void runModulePatrol("core")}
            title="Global Sync — patrol all four modules (Revenue · Costs · Monitor · Feedback)"
            className="mb-0.5 rounded-full border border-cyan-400/55 bg-zinc-950/90 px-4 py-1.5 text-sm font-medium text-cyan-300 shadow-[0_0_20px_-8px_rgba(34,211,238,0.5)] backdrop-blur transition hover:border-cyan-300/80 hover:bg-cyan-950/40 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-60"
          >
            {patrolBusy && patrolTarget === "core"
              ? "Global Syncing…"
              : "Global Sync"}
          </button>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {hydrated && (
            <button
              type="button"
              onClick={() => {
                setHydrated(false);
                filledModulesRef.current = new Set();
                setLive(BLANK);
                setIsExpanded(false);
                setExpandedIndex(null);
                setPatrolMsg("Back to empty template");
                window.setTimeout(() => setPatrolMsg(null), 3000);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500 backdrop-blur transition hover:border-white/20 hover:text-zinc-300"
              title="Reset to blank cards for the next demo"
            >
              Reset blank
            </button>
          )}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  pipeOk ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  pipeOk ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </span>
            {pipeOk === null
              ? "Connecting…"
              : pipeOk
                ? "Screenpipe Live"
                : "Screenpipe Offline"}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {patrolMsg && !isExpanded && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative z-50 px-6 text-center text-[11px] text-cyan-300/90 sm:px-10"
          >
            {patrolMsg}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Stage：双层叠放，展开时交叉淡入 + 卡片 layoutId 变形 */}
      <div className="relative z-10 min-h-0 flex-1 px-6 pb-6 pt-2 sm:px-10">
        {/* 轮播层：展开时淡出；返回时不用 blur（滤镜收尾最容易顿一下） */}
        <motion.div
          className="absolute inset-x-6 inset-y-2 flex items-center justify-center sm:inset-x-10"
          style={{
            perspective: 1200,
            pointerEvents: isExpanded ? "none" : "auto",
          }}
          initial={false}
          animate={{
            opacity: isExpanded ? 0 : 1,
            scale: isExpanded ? 0.97 : fillFlash ? 1.02 : 1,
          }}
          transition={isExpanded ? FADE : CAROUSEL_REVEAL}
        >
          <div
            className="relative h-[min(560px,68vh)] w-full max-w-6xl"
            style={{ transformStyle: "preserve-3d" }}
          >
            {modules.map((module, index) => {
              // 展开时主卡只活在 rail 上，避免 layoutId 双实例
              if (isExpanded && index === expandedIndex) return null;

              const diff = getCircularDiff(
                index,
                activeIndex,
                modules.length
              );
              const pose = getCoverFlowPose(diff);
              const isActive = diff === 0;
              const isHiddenCarousel = Math.abs(diff) >= 2;

              return (
                <motion.div
                  key={module.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: "50%",
                    top: "50%",
                    width: CARD_W,
                    height: CARD_H,
                    marginLeft: -CARD_W / 2,
                    marginTop: -CARD_H / 2,
                    transformStyle: "preserve-3d",
                    transformOrigin: "center center",
                    zIndex: pose.zIndex,
                    pointerEvents: isHiddenCarousel ? "none" : "auto",
                  }}
                  initial={false}
                  animate={{
                    x: pose.x,
                    y: pose.y,
                    scale: pose.scale,
                    rotateY: pose.rotateY,
                    opacity: pose.opacity,
                    filter: pose.filter,
                  }}
                  transition={
                    isCollapsing && !isActive
                      ? { ...SPRING, delay: 0.1 }
                      : SPRING
                  }
                >
                  <ModulePanel
                    module={module}
                    isActive={isActive}
                    layoutId={isActive ? `module-card-${module.id}` : undefined}
                    onSelect={() => {
                      if (diff === 0) {
                        expandAt(index);
                        return;
                      }
                      setActiveIndex(index);
                    }}
                  />
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* 展开层：外层不透明保证 layoutId 可见；详情先退，卡片再 morph */}
        <AnimatePresence>
          {isExpanded && expandedModule && (
            <motion.div
              key="expanded-workspace"
              className="absolute inset-x-6 inset-y-2 grid grid-cols-1 gap-5 md:grid-cols-[280px_minmax(0,1fr)] sm:inset-x-10"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 1 }}
              transition={MORPH}
            >
              <div className="min-h-[240px] md:min-h-0">
                <ModulePanel
                  module={expandedModule}
                  isActive
                  isSidebar
                  layoutId={`module-card-${expandedModule.id}`}
                  onSelect={() => {}}
                />
              </div>

              <motion.div
                className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/45 p-4 backdrop-blur-md sm:p-5"
                initial={{ opacity: 0, x: 48 }}
                animate={{ opacity: 1, x: 0, transition: MORPH }}
                exit={{ opacity: 0, x: 20, transition: DETAILS_EXIT }}
              >
                <motion.div
                  className="mb-3 flex shrink-0 items-center justify-between gap-4"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...FADE, delay: 0.1 }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      collapse();
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    ← Back
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      disabled={patrolBusy}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void runModulePatrol(expandedModule.id);
                      }}
                      className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3.5 py-1.5 text-sm text-cyan-200 transition-colors hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-50"
                      title={`Sync ${expandedModule.label} only — not Global Sync`}
                    >
                      {patrolBusy && patrolTarget === expandedModule.id
                        ? `Syncing ${expandedModule.label}…`
                        : patrolBusy
                          ? "Busy…"
                          : "Sync"}
                    </button>
                    {patrolMsg && (
                      <p className="max-w-[240px] truncate text-right text-[10px] text-zinc-500">
                        {patrolMsg}
                      </p>
                    )}
                  </div>
                </motion.div>

                {/* 评论模块标题并入 CommentsInsights 单行，避免重复 */}
                {expandedModule.viz?.kind !== "comments-feed" && (
                  <motion.div
                    className="mb-3 shrink-0"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...FADE, delay: 0.12 }}
                  >
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                      {expandedModule.id === "revenue"
                        ? "Sales (ASC Trends)"
                        : expandedModule.id === "costs"
                          ? "Fixed Cost Ledger"
                          : expandedModule.id === "status"
                            ? "Monitor status"
                            : "Primary Signal"}
                    </p>
                    <p className="mt-1 break-words text-3xl font-light tracking-tight text-zinc-50 sm:text-4xl">
                      {expandedModule.preview}
                    </p>
                  </motion.div>
                )}

                {expandedModule.viz?.kind === "revenue-asc" ? (
                  <RevenueInsights viz={expandedModule.viz} />
                ) : expandedModule.viz?.kind === "status-platforms" ? (
                  <StatusInsights viz={expandedModule.viz} />
                ) : expandedModule.viz?.kind === "comments-feed" ? (
                  <CommentsInsights viz={expandedModule.viz} />
                ) : expandedModule.id === "costs" ? (
                  <CostsInsights
                    liveCaptures={expandedModule.liveCaptures}
                  />
                ) : (
                  <motion.div
                    className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto sm:grid-cols-2"
                    initial="hidden"
                    animate="show"
                    variants={{
                      hidden: {},
                      show: {
                        transition: {
                          staggerChildren: 0.06,
                          delayChildren: 0.18,
                        },
                      },
                    }}
                  >
                    {expandedModule.details.map((row) => (
                      <motion.div
                        key={row.label}
                        variants={{
                          hidden: { opacity: 0, y: 16 },
                          show: { opacity: 1, y: 0 },
                        }}
                        transition={FADE}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
                      >
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          {row.label}
                        </p>
                        <p className="mt-3 break-words text-lg font-medium text-zinc-100 tabular-nums sm:text-xl">
                          {row.value}
                        </p>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dock：返回时略晚出现，不跟 morph 抢收尾 */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.nav
            key="module-dock"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }}
            transition={{ ...FADE, delay: isCollapsing ? 0.28 : 0 }}
            className="relative z-50 mx-auto mb-8 flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/70 p-1.5 backdrop-blur-xl"
          >
            {modules.map((module, index) => {
              const Icon = module.icon;
              const isActive = index === activeIndex;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`
                    relative flex items-center gap-2 rounded-full px-3.5 py-2 text-xs transition-colors
                    ${isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"}
                  `}
                >
                  {isActive && (
                    <motion.span
                      layoutId="dock-pill"
                      className="absolute inset-0 rounded-full bg-white/10"
                      transition={MORPH}
                    />
                  )}
                  <Icon
                    className={`relative h-3.5 w-3.5 ${isActive ? module.accent : ""}`}
                  />
                  <span className="relative hidden sm:inline">{module.label}</span>
                </button>
              );
            })}
          </motion.nav>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isExpanded && (
          <motion.p
            key="active-caption"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ ...FADE, delay: isCollapsing ? 0.32 : 0 }}
            className="pointer-events-none absolute bottom-3 left-1/2 z-50 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-zinc-600"
          >
            Active · {active.label}
            {fetchedAt
              ? ` · ${new Date(fetchedAt).toLocaleTimeString()}`
              : ""}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
