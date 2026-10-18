"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  isUserReviewBody,
  type CommentsViz,
} from "@/lib/comments-feed";
import CommentNebula from "@/components/CommentNebula";
import ThemeClusters from "@/components/ThemeClusters";
import SentimentGauge from "@/components/SentimentGauge";
import {
  buildClustersFromComments,
  type ClusterData,
} from "@/lib/theme-clusters";
import { DEMO_INTEL } from "@/components/HolographicStream";
import {
  heuristicSentiment,
  type SentimentResult,
} from "@/lib/sentiment-score";
import type { NebulaTerm } from "@/lib/comment-nebula";

const FADE = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as const,
};

function relativeTime(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

type IntelPayload = SentimentResult & {
  terms?: NebulaTerm[];
  clusters?: ClusterData[];
  fromCache?: boolean;
  synced?: boolean;
};

export default function CommentsInsights({ viz }: { viz: CommentsViz }) {
  const nebulaComments = useMemo(
    () =>
      viz.comments.length > 0
        ? viz.comments
        : DEMO_INTEL.map((d) => ({
            id: d.id,
            author: d.author,
            body: d.body,
            platform: d.platform,
            source: "unknown" as const,
          })),
    [viz.comments]
  );

  const texts = useMemo(() => {
    const live = viz.comments.map((c) => c.body).filter(isUserReviewBody);
    const fallback = DEMO_INTEL.map((d) => d.body).filter(isUserReviewBody);
    const pool = live.length >= 3 ? live : [...live, ...fallback];
    const seen = new Set<string>();
    return pool.filter((t) => {
      if (!t || seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  }, [viz.comments]);

  const localClusters = useMemo(
    () => buildClustersFromComments(nebulaComments, 6),
    [nebulaComments]
  );

  const [sentiment, setSentiment] = useState<SentimentResult>(() =>
    heuristicSentiment({
      comments: viz.comments,
      clusters: localClusters,
      texts,
    })
  );
  const [terms, setTerms] = useState<NebulaTerm[]>([]);
  const [clusters, setClusters] = useState<ClusterData[]>(localClusters);
  const [termSource, setTermSource] = useState("cache");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setClusters(localClusters);
  }, [localClusters]);

  // 1) Instant: disk cache (or seed) — never blank the sphere while waiting
  useEffect(() => {
    let cancelled = false;
    const payload = {
      mode: "cache" as const,
      texts,
      comments: nebulaComments,
      clusters: localClusters,
    };

    fetch("/api/sentiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data: IntelPayload) => {
        if (cancelled) return;
        if (typeof data?.score === "number") {
          setSentiment({
            score: data.score,
            label: data.label,
            source: data.source,
            rationale: data.rationale,
          });
        }
        if (Array.isArray(data?.terms) && data.terms.length > 0) {
          setTerms(data.terms);
          setTermSource(data.fromCache ? "cache" : "LLM");
        }
        if (Array.isArray(data?.clusters) && data.clusters.length > 0) {
          setClusters(data.clusters);
        }
      })
      .catch(() => {
        /* keep whatever we have */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [texts, nebulaComments, localClusters]);

  // 2) Silent sync: LLM only when corpus changed / uncached reviews
  useEffect(() => {
    let cancelled = false;
    const payload = {
      mode: "sync" as const,
      texts,
      comments: nebulaComments,
      clusters: localClusters,
    };

    fetch("/api/sentiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data: IntelPayload) => {
        if (cancelled) return;
        if (typeof data?.score === "number") {
          setSentiment({
            score: data.score,
            label: data.label,
            source: data.source,
            rationale: data.rationale,
          });
        }
        if (Array.isArray(data?.terms) && data.terms.length > 0) {
          setTerms(data.terms);
          setTermSource(
            data.source === "llm" ? "LLM" : data.fromCache ? "cache" : "seed"
          );
        }
        if (Array.isArray(data?.clusters) && data.clusters.length > 0) {
          setClusters(data.clusters);
        }
      })
      .catch(() => {
        /* silent — cache already on screen */
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- termSource is display-only
  }, [texts, nebulaComments, localClusters]);

  const totalComments = viz.total || nebulaComments.length || DEMO_INTEL.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={FADE}
        className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1"
      >
        <p className="min-w-0 text-[13px] leading-none text-zinc-400">
          <span>Rednote · App Store</span>
          {viz.scannedAt ? (
            <span className="text-zinc-600">
              {" "}
              · {relativeTime(viz.scannedAt)}
            </span>
          ) : null}
          <span className="ml-2 text-base font-light text-zinc-50">
            {totalComments} reviews
          </span>
        </p>
        <SentimentGauge score={sentiment.score} loading={loading} />
      </motion.div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(200px,0.36fr)_minmax(0,0.64fr)]">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...FADE, delay: 0.08 }}
          className="min-h-[220px] overflow-hidden lg:min-h-0"
        >
          <CommentNebula
            comments={nebulaComments}
            terms={terms}
            sourceLabel={termSource}
            compact
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...FADE, delay: 0.1 }}
          className="flex min-h-[300px] flex-col overflow-hidden lg:min-h-0"
        >
          <ThemeClusters clusters={clusters} />
        </motion.div>
      </div>
    </div>
  );
}
