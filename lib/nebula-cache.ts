/**
 * Local disk cache for nebula LLM tags (demo-friendly).
 * Path: data/nebula-cache.json
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import type { FeedComment } from "@/lib/comments-feed";
import type { NebulaTerm } from "@/lib/comment-nebula";
import type { SentimentResult } from "@/lib/sentiment-score";

export type NebulaCacheFile = {
  updatedAt: string;
  /** sha of sorted review fingerprints */
  corpusHash: string;
  /** fingerprint per covered review body */
  fingerprints: string[];
  terms: NebulaTerm[];
  sentiment: SentimentResult;
};

const CACHE_PATH = path.join(process.cwd(), "data", "nebula-cache.json");

export function reviewFingerprint(body: string): string {
  return createHash("sha1")
    .update((body || "").replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export function corpusHashOf(comments: FeedComment[]): string {
  const fps = comments
    .map((c) => reviewFingerprint(c.body || ""))
    .filter(Boolean)
    .sort();
  return createHash("sha1").update(fps.join("|")).digest("hex").slice(0, 20);
}

export async function readNebulaCache(): Promise<NebulaCacheFile | null> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    const data = JSON.parse(raw) as NebulaCacheFile;
    if (!Array.isArray(data.terms) || data.terms.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export async function writeNebulaCache(
  comments: FeedComment[],
  terms: NebulaTerm[],
  sentiment: SentimentResult
): Promise<NebulaCacheFile> {
  const fingerprints = [
    ...new Set(
      comments
        .map((c) => reviewFingerprint(c.body || ""))
        .filter(Boolean)
    ),
  ];
  const payload: NebulaCacheFile = {
    updatedAt: new Date().toISOString(),
    corpusHash: corpusHashOf(comments),
    fingerprints,
    terms,
    sentiment: { ...sentiment, source: sentiment.source || "llm" },
  };
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

/** Reviews whose body is not yet covered by the cache. */
export function findUncachedReviews(
  comments: FeedComment[],
  cache: NebulaCacheFile | null
): FeedComment[] {
  if (!cache?.fingerprints?.length) return comments;
  const known = new Set(cache.fingerprints);
  return comments.filter((c) => {
    const fp = reviewFingerprint(c.body || "");
    return fp && !known.has(fp);
  });
}

export function cacheIsFresh(
  comments: FeedComment[],
  cache: NebulaCacheFile | null
): boolean {
  if (!cache?.terms?.length) return false;
  return cache.corpusHash === corpusHashOf(comments);
}
