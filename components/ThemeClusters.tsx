"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { mockClusters, type ClusterData } from "@/lib/theme-clusters";

const gridVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.06 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 24 },
  },
};

function ClusterCard({ cluster }: { cluster: ClusterData }) {
  return (
    <motion.article
      variants={cardVariants}
      className="flex flex-col rounded-2xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-zinc-800/60"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold tracking-wide text-zinc-100">
          {cluster.themeName}
        </h3>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-400/10 px-2 py-1 text-sm text-orange-400/80">
          <Flame className="h-3.5 w-3.5" aria-hidden />
          {cluster.mentionCount}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        {cluster.aiSummary}
      </p>
    </motion.article>
  );
}

export default function ThemeClusters({
  clusters = mockClusters,
}: {
  clusters?: ClusterData[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#05070f]/80">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Theme clusters
          </p>
          <p className="text-[11px] text-zinc-400">
            Themes from live reviews · summary only
          </p>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">
          {clusters.length} themes
        </span>
      </div>

      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-4">
        <motion.div
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          variants={gridVariants}
          initial="hidden"
          animate="show"
        >
          {clusters.map((c) => (
            <ClusterCard key={c.themeName} cluster={c} />
          ))}
        </motion.div>
      </div>
    </div>
  );
}

export type { ClusterData, Quote } from "@/lib/theme-clusters";
export { mockClusters, renderHighlightedText } from "@/lib/theme-clusters";
