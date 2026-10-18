import { NextResponse } from "next/server";
import {
  heuristicSentiment,
  parseSentimentJson,
  type SentimentResult,
} from "@/lib/sentiment-score";
import {
  buildNebulaPrompt,
  llmTermsToNebula,
  parseNebulaIntelJson,
  type NebulaTerm,
} from "@/lib/comment-nebula";
import {
  buildClustersFromComments,
  type ClusterData,
} from "@/lib/theme-clusters";
import { callLlm } from "@/lib/llm";
import { isUserReviewBody, type FeedComment } from "@/lib/comments-feed";
import {
  cacheIsFresh,
  findUncachedReviews,
  readNebulaCache,
  writeNebulaCache,
} from "@/lib/nebula-cache";
import {
  alignNebulaTermsWithThemes,
  seedNebulaTermsFromReviews,
} from "@/lib/nebula-seed";
import {
  ensureReviewTranslations,
  localizeNebulaTerms,
} from "@/lib/review-i18n";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  texts?: string[];
  comments?: FeedComment[];
  clusters?: ClusterData[];
  /**
   * cache — disk only, instant (for first paint)
   * sync  — use cache if fresh; else LLM (or seed) then write disk
   */
  mode?: "cache" | "sync";
};

export type SentimentIntelResponse = SentimentResult & {
  terms: NebulaTerm[];
  clusters: ClusterData[];
  fromCache?: boolean;
  synced?: boolean;
};

function reviewCorpusFrom(
  comments: FeedComment[],
  texts: string[]
): FeedComment[] {
  if (comments.length > 0) return comments;
  return texts.map((body, i) => ({
    id: `t-${i}`,
    author: "",
    body,
    platform: "xiaohongshu" as const,
    source: "unknown" as const,
  }));
}

async function withEnglishSamples(
  terms: NebulaTerm[],
  corpus: FeedComment[] = []
): Promise<NebulaTerm[]> {
  const aligned = corpus.length
    ? alignNebulaTermsWithThemes(terms, corpus)
    : terms;
  const quotes = aligned.flatMap((t) => t.samples || []);
  const i18n = await ensureReviewTranslations(quotes);
  return localizeNebulaTerms(aligned, i18n);
}

async function ensureSeedCache(
  corpus: FeedComment[],
  sentiment: SentimentResult
): Promise<{ terms: NebulaTerm[]; sentiment: SentimentResult }> {
  const existing = await readNebulaCache();
  if (existing?.terms?.length) {
    return {
      terms: await withEnglishSamples(existing.terms, corpus),
      sentiment: existing.sentiment,
    };
  }
  const terms = seedNebulaTermsFromReviews(corpus);
  if (terms.length === 0) return { terms: [], sentiment };
  const written = await writeNebulaCache(corpus, terms, {
    ...sentiment,
    source: "heuristic",
    rationale:
      sentiment.rationale ||
      "Demo nebula seed from live reviews (LLM cache bootstrap).",
  });
  return {
    terms: await withEnglishSamples(written.terms, corpus),
    sentiment: written.sentiment,
  };
}

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty */
  }

  const mode = body.mode === "cache" ? "cache" : "sync";
  const comments = (body.comments || []).filter((c) =>
    isUserReviewBody(c.body || "")
  );
  const texts = [
    ...(body.texts || []),
    ...comments.map((c) => c.body).filter(Boolean),
  ].filter((t) => t && t.length > 4) as string[];

  const fallbackSentiment = heuristicSentiment({
    texts,
    comments,
    clusters: body.clusters,
  });
  const fallbackClusters = buildClustersFromComments(comments, 6);
  const corpus = reviewCorpusFrom(comments, texts);
  const cache = await readNebulaCache();

  // —— Instant path: serve disk cache (seed if empty) ——
  if (mode === "cache") {
    const seeded = await ensureSeedCache(corpus, fallbackSentiment);
    return NextResponse.json({
      ...seeded.sentiment,
      terms: seeded.terms,
      clusters: fallbackClusters,
      fromCache: true,
      synced: false,
    } satisfies SentimentIntelResponse);
  }

  // —— Sync path: reuse tag cache when corpus unchanged; still refresh i18n ——
  if (cacheIsFresh(corpus, cache) && cache) {
    // Also translate any new quote strings silently
    const bodies = corpus.map((c) => c.body || "");
    await ensureReviewTranslations([
      ...cache.terms.flatMap((t) => t.samples || []),
      ...bodies,
    ]);
    return NextResponse.json({
      ...cache.sentiment,
      terms: await withEnglishSamples(cache.terms, corpus),
      clusters: fallbackClusters,
      fromCache: true,
      synced: true,
    } satisfies SentimentIntelResponse);
  }

  let sentiment: SentimentResult = cache?.sentiment || fallbackSentiment;
  let terms: NebulaTerm[] = cache?.terms || [];
  const uncached = findUncachedReviews(corpus, cache);

  // Have cache but only a few new reviews → keep rendering old tags;
  // still try LLM on the full corpus so tags stay coherent.
  const shouldCallLlm =
    uncached.length > 0 || !cache?.terms?.length;

  if (shouldCallLlm && corpus.length > 0) {
    try {
      const raw = await callLlm(
        buildNebulaPrompt(corpus),
        "You extract English product-review tags for a word nebula. Each tag must cite a review index. Return only JSON."
      );
      if (raw) {
        const intel = parseNebulaIntelJson(raw);
        if (intel?.terms?.length) {
          sentiment = {
            score:
              typeof intel.score === "number"
                ? Math.round(Math.max(0, Math.min(100, intel.score)))
                : fallbackSentiment.score,
            label:
              intel.label === "POSITIVE" ||
              intel.label === "NEUTRAL" ||
              intel.label === "CRITICAL"
                ? intel.label
                : fallbackSentiment.label,
            source: "llm",
            rationale: intel.rationale || fallbackSentiment.rationale,
          };
          terms = llmTermsToNebula(intel.terms, corpus);
          await writeNebulaCache(corpus, terms, sentiment);
        } else {
          const parsed = parseSentimentJson(raw);
          if (parsed) sentiment = parsed;
        }
      }
    } catch (err) {
      console.warn("[sentiment] nebula llm fail", err);
    }
  }

  // LLM missing / failed → keep prior cache or bootstrap seed
  if (!terms.length) {
    const seeded = await ensureSeedCache(corpus, fallbackSentiment);
    terms = seeded.terms;
    sentiment = seeded.sentiment;
  } else {
    // Silent bilingual fill for new originals before serving
    await ensureReviewTranslations([
      ...terms.flatMap((t) => t.samples || []),
      ...corpus.map((c) => c.body || ""),
    ]);
    terms = await withEnglishSamples(terms, corpus);
  }

  return NextResponse.json({
    ...sentiment,
    terms,
    clusters: fallbackClusters,
    fromCache: Boolean(cache?.terms?.length),
    synced: true,
  } satisfies SentimentIntelResponse);
}
