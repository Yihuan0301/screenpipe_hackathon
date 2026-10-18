/**
 * Bilingual review quote cache for nebula hover (demo-friendly).
 * Path: data/review-i18n.json
 *
 * original → English; Latin/FR/EN originals are stored as-is.
 * New CJK reviews are translated in the background; UI only shows EN when ready.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { callLlm } from "@/lib/llm";
import {
  paraphraseReviewToEnglish,
  type NebulaTerm,
} from "@/lib/comment-nebula";
import { reviewFingerprint } from "@/lib/nebula-cache";

export type ReviewI18nEntry = {
  original: string;
  en: string;
  updatedAt: string;
};

export type ReviewI18nFile = {
  updatedAt: string;
  entries: Record<string, ReviewI18nEntry>;
};

const CACHE_PATH = path.join(process.cwd(), "data", "review-i18n.json");

export function needsTranslation(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text || "");
}

export async function readReviewI18n(): Promise<ReviewI18nFile> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    const data = JSON.parse(raw) as ReviewI18nFile;
    if (!data.entries || typeof data.entries !== "object") {
      return { updatedAt: new Date().toISOString(), entries: {} };
    }
    return data;
  } catch {
    return { updatedAt: new Date().toISOString(), entries: {} };
  }
}

export async function writeReviewI18n(
  file: ReviewI18nFile
): Promise<ReviewI18nFile> {
  const next = { ...file, updatedAt: new Date().toISOString() };
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function upsertTranslations(
  pairs: { original: string; en: string }[]
): Promise<ReviewI18nFile> {
  const file = await readReviewI18n();
  const now = new Date().toISOString();
  for (const { original, en } of pairs) {
    const o = (original || "").replace(/\s+/g, " ").trim();
    const e = (en || "").replace(/\s+/g, " ").trim();
    if (!o || !e) continue;
    const fp = reviewFingerprint(o);
    file.entries[fp] = { original: o, en: e, updatedAt: now };
  }
  return writeReviewI18n(file);
}

export function lookupEn(
  original: string,
  file: ReviewI18nFile
): string | null {
  const o = (original || "").replace(/\s+/g, " ").trim();
  if (!o) return null;
  if (!needsTranslation(o)) return o;
  const hit = file.entries[reviewFingerprint(o)];
  return hit?.en || null;
}

/**
 * Swap nebula hover samples to English.
 * CJK quotes without a cached translation are dropped (appear after silent translate).
 */
export function localizeNebulaTerms(
  terms: NebulaTerm[],
  file: ReviewI18nFile
): NebulaTerm[] {
  return terms
    .map((t) => {
      const nextSamples: string[] = [];
      const originals: string[] = [];
      for (const s of t.samples || []) {
        const en = lookupEn(s, file);
        if (en) {
          nextSamples.push(en.slice(0, 200));
          originals.push(s);
        } else if (!needsTranslation(s)) {
          nextSamples.push(s.slice(0, 200));
          originals.push(s);
        }
        // else: still translating — omit quote for now
      }
      return {
        ...t,
        samples: nextSamples,
        /** bilingual: keep originals alongside for debug / future UI */
        sampleOriginals: originals,
      } as NebulaTerm & { sampleOriginals?: string[] };
    })
    .filter((t) => t.samples.length > 0 || t.text.length > 0);
}

/** Collect quote strings from terms that still need an EN entry. */
export function missingTranslations(
  texts: string[],
  file: ReviewI18nFile
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of texts) {
    const o = (raw || "").replace(/\s+/g, " ").trim();
    if (!o || !needsTranslation(o)) continue;
    const fp = reviewFingerprint(o);
    if (file.entries[fp]?.en) continue;
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(o);
  }
  return out;
}

/** Offline / demo: heuristic EN when LLM key is missing. */
export function heuristicTranslate(original: string): string {
  const t = (original || "").replace(/\s+/g, " ").trim();
  if (!needsTranslation(t)) return t;

  // Prefer curated overrides for known demo quotes
  const curated = CURATED_EN[reviewFingerprint(t)] || CURATED_BY_PREFIX.find(
    ([prefix]) => t.startsWith(prefix) || t.includes(prefix)
  )?.[1];
  if (curated) return curated;

  return paraphraseReviewToEnglish(t);
}

/**
 * Translate missing quotes: LLM batch when available, else heuristic.
 * Writes results into data/review-i18n.json.
 */
export async function ensureReviewTranslations(
  texts: string[]
): Promise<ReviewI18nFile> {
  let file = await readReviewI18n();
  const missing = missingTranslations(texts, file);
  if (missing.length === 0) return file;

  const pairs: { original: string; en: string }[] = [];

  // Try LLM in one batch (cap 24)
  const batch = missing.slice(0, 24);
  try {
    const listed = batch
      .map((t, i) => `${i + 1}. ${t.slice(0, 280)}`)
      .join("\n");
    const raw = await callLlm(
      `Translate each user review into natural English. Keep meaning; no commentary.

Return JSON only:
{"items":[{"i":1,"en":"..."}]}

Reviews:
${listed}`,
      "You translate product reviews to English. Return only JSON."
    );
    if (raw) {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        const obj = JSON.parse(m[0]) as {
          items?: { i?: number; en?: string }[];
        };
        for (const item of obj.items || []) {
          const idx = Number(item.i) - 1;
          if (idx < 0 || idx >= batch.length) continue;
          const en = (item.en || "").trim();
          if (en.length >= 4) pairs.push({ original: batch[idx], en });
        }
      }
    }
  } catch (err) {
    console.warn("[review-i18n] llm translate fail", err);
  }

  const done = new Set(pairs.map((p) => reviewFingerprint(p.original)));
  for (const o of missing) {
    if (done.has(reviewFingerprint(o))) continue;
    pairs.push({ original: o, en: heuristicTranslate(o) });
  }

  if (pairs.length) file = await upsertTranslations(pairs);
  return file;
}

/** Curated EN for current nebula demo quotes (fingerprint-agnostic prefix map). */
const CURATED_BY_PREFIX: [string, string][] = [
  [
    "这个在哪个区的App Store有",
    "Which App Store region is this available in? I can't find it in the European store.",
  ],
  [
    "刚想下载发现没有安卓版蹲蹲",
    "Was about to download — no Android build yet. Waiting…",
  ],
  [
    "这个chunkflow登不上去咋办",
    "Can't sign into ChunkFlow — it keeps saying authentication failed. What should I do?",
  ],
  [
    "立刻试用了一下，很简洁方便的软件",
    "Tried it right away — clean, snappy, great for casual study. Only note: pricing feels a bit high for a single-feature app; I'd happily pay ¥10–15/mo like a leisure subscription, while ¥28/mo is closer to other French tools. Still rooting for a promo since you just launched.",
  ],
  [
    "立即下载了，非常好用，能不能有点击单词就能发音",
    "Downloaded immediately — really useful. Could you add tap-to-pronounce for words? I'm a beginner and hit lots of new vocab in sentences. Thanks!",
  ],
  [
    "很适合初学者！当然对我这样阅读写作没问题但是口语废物",
    "Great for beginners! Reading and writing are fine for me, but speaking was hopeless — this actually helps get over the fear of opening your mouth. Just arrived in France and practice with it daily. Ready to buy the annual plan!",
  ],
  ["会员制的吗？", "Is it a subscription?"],
  [
    "换了好几个wifi终于可以了",
    "Finally connected after switching Wi‑Fi a few times. This app is great for decoding French I run into in daily life — especially lyrics. Perfect for casual vocab building.",
  ],
  [
    "请问如何更改系统语言？不小心设成了英文",
    "How do I change the app language? I set it to English by mistake and want Chinese back. Thanks!",
  ],
  ["什么app？", "What app is this?"],
  [
    "很有创新的法语学习小工具",
    "A genuinely innovative little French-learning tool. Love the minimal style and useful details — it's helping me stick with French. Highly recommend!",
  ],
];

const CURATED_EN: Record<string, string> = {};
