"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export type IntelItem = {
  id: string;
  body: string;
  sentiment: "positive" | "critical";
  platform: "xiaohongshu" | "appstore";
  author: string;
  nodeId: string;
  ts: string;
};

/** Placeholder reviews when live captures are empty */
export const DEMO_INTEL: IntelItem[] = [
  {
    id: "d1",
    author: "CocoLearner",
    platform: "xiaohongshu",
    sentiment: "positive",
    nodeId: "NODE_F3A9",
    ts: "03:12:08.441",
    body: "Two weeks with the note drills and I finally speak up in free conversation. Used to only memorize words — now I can spit out full sentences.",
  },
  {
    id: "d2",
    author: "ParisNight",
    platform: "appstore",
    sentiment: "positive",
    nodeId: "NODE_7C21",
    ts: "03:12:11.902",
    body: "Finally an app that doesn't feel like homework. The chunk practice is addictive — I can feel my spoken French getting smoother every evening session.",
  },
  {
    id: "d3",
    author: "MoonAries",
    platform: "xiaohongshu",
    sentiment: "positive",
    nodeId: "NODE_A018",
    ts: "03:12:14.117",
    body: "Following the method in the notes, my speaking went from freezing up to chatting about daily life. Genuinely worth the recommendation.",
  },
  {
    id: "d4",
    author: "ColdBoot",
    platform: "appstore",
    sentiment: "critical",
    nodeId: "NODE_B44E",
    ts: "03:12:18.550",
    body: "Idea is great but the latest build feels slow on older phones. Offline packs still crash when I switch topics mid-session — needs a hotfix badly.",
  },
  {
    id: "d5",
    author: "RiverLamb",
    platform: "xiaohongshu",
    sentiment: "critical",
    nodeId: "NODE_91D0",
    ts: "03:12:22.003",
    body: "Direction is right, but the comments pane sometimes lags and hard examples jump difficulty too fast. Please smooth the curve and stability.",
  },
  {
    id: "d6",
    author: "lulu_fr",
    platform: "xiaohongshu",
    sentiment: "positive",
    nodeId: "NODE_E2F7",
    ts: "03:12:26.774",
    body: "Once chunks click, free conversation unlocks speaking fear. Whole sentences come out now — it changed how I practice.",
  },
  {
    id: "d7",
    author: "ReviewBot_88",
    platform: "appstore",
    sentiment: "positive",
    nodeId: "NODE_33AA",
    ts: "03:12:30.210",
    body: "Five stars for the speaking loop. Clear prompts, natural pacing, and I actually look forward to opening the app — rare for language tools.",
  },
  {
    id: "d8",
    author: "NorthShore",
    platform: "xiaohongshu",
    sentiment: "critical",
    nodeId: "NODE_C0DE",
    ts: "03:12:34.881",
    body: "UI looks good, but replies in notifications sometimes don't match the note. Tying reviews to the note thread would help a lot.",
  },
];

const HIGHLIGHT_RE =
  /(hard|recommend|love|crash|lag|slow|smooth|speak|hotfix|great|addictive|smoother|fear|unlock)/gi;

function nodeStamp() {
  return `NODE_${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

function clockStamp() {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function highlightBody(body: string) {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(HIGHLIGHT_RE.source, "gi");
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <mark
        key={`h-${k++}`}
        className="rounded bg-sky-500/20 px-1 text-sky-300"
      >
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

function pickBatch(pool: IntelItem[], size: number, salt: number): IntelItem[] {
  const start = salt % pool.length;
  const out: IntelItem[] = [];
  for (let i = 0; i < size; i++) {
    const base = pool[(start + i * 2) % pool.length];
    out.push({
      ...base,
      id: `${base.id}-${salt}-${i}`,
      nodeId: nodeStamp(),
      ts: clockStamp(),
    });
  }
  return out;
}

const listVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, rotateX: -12 },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { type: "spring" as const, stiffness: 280, damping: 22 },
  },
  exit: {
    opacity: 0,
    y: -16,
    rotateX: 18,
    scale: 0.96,
    transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as const },
  },
};

export default function HolographicStream({
  items,
}: {
  /** 不传则用占位长句样本 */
  items?: IntelItem[];
}) {
  const pool = items?.length ? items : DEMO_INTEL;
  const [epoch, setEpoch] = useState(0);
  const batch = useMemo(() => pickBatch(pool, 4, epoch), [pool, epoch]);

  useEffect(() => {
    const id = setInterval(() => setEpoch((e) => e + 1), 4200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#05070f]/90">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Holographic stream
          </p>
          <p className="font-mono text-[11px] text-zinc-400">
            INTEL_FEED // live shuffle
          </p>
        </div>
        <span className="font-mono text-[10px] text-emerald-400/80">
          ● RX
        </span>
      </div>

      <div
        className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-3 py-3"
        style={{
          perspective: 900,
          transformStyle: "preserve-3d",
        }}
      >
        <motion.div
          className="origin-top"
          style={{ transform: "rotateX(4deg)" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={epoch}
              variants={listVariants}
              initial="hidden"
              animate="show"
              exit={{
                opacity: 0,
                y: -18,
                rotateX: 22,
                filter: "blur(4px)",
                transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] },
              }}
              className="space-y-0"
            >
              {batch.map((item) => {
                const positive = item.sentiment === "positive";
                return (
                  <motion.article
                    key={item.id}
                    variants={cardVariants}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    layout
                    className="mb-3 rounded-xl border border-white/5 bg-zinc-900/40 p-4 backdrop-blur-md transition-all hover:border-white/20 hover:bg-zinc-800/60"
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-zinc-500">
                      <span className="text-zinc-400">[{item.ts}]</span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-sky-400/80">{item.nodeId}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`relative inline-block h-1.5 w-1.5 rounded-full ${
                            positive ? "bg-emerald-400" : "bg-rose-400"
                          }`}
                        >
                          <span
                            className={`absolute inset-0 animate-ping rounded-full ${
                              positive ? "bg-emerald-400" : "bg-rose-400"
                            } opacity-60`}
                          />
                        </span>
                        <span
                          className={
                            positive ? "text-emerald-300" : "text-rose-300"
                          }
                        >
                          {positive ? "POSITIVE 😊" : "CRITICAL 🥶"}
                        </span>
                      </span>
                      <span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-600">
                        {item.platform === "xiaohongshu" ? "XHS" : "ASC"} ·{" "}
                        {item.author}
                      </span>
                    </header>
                    <p className="text-[13px] leading-relaxed text-zinc-200">
                      {highlightBody(item.body)}
                    </p>
                  </motion.article>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
