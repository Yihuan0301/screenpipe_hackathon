/**
 * Demo nebula seed when LLM is unavailable.
 * Theme tags share counts with theme-cards; extras + review sparks fill density.
 */
import type { FeedComment } from "@/lib/comments-feed";
import { isUserReviewBody } from "@/lib/comments-feed";
import {
  originalSampleFromBody,
  type NebulaTerm,
} from "@/lib/comment-nebula";
import {
  selectActiveThemes,
  THEME_DEFS,
  themeMentionCount,
  type ThemeDef,
} from "@/lib/theme-clusters";

/** Keep nebula theme-tag counts in lockstep with theme cards. */
export function alignNebulaTermsWithThemes(
  terms: NebulaTerm[],
  comments: FeedComment[]
): NebulaTerm[] {
  const active = selectActiveThemes(comments, 6);
  const byTag = new Map(
    THEME_DEFS.map((d: ThemeDef) => [d.nebulaTag.toLowerCase(), d] as const)
  );
  const activeKeys = new Set(
    active.map((a) => a.def.nebulaTag.toLowerCase())
  );

  const aligned = terms
    .map((t) => {
      const def = byTag.get(t.text.trim().toLowerCase());
      if (!def) return t;
      const count = themeMentionCount(def, comments);
      if (count <= 0) return null;
      return { ...t, count };
    })
    .filter(Boolean) as NebulaTerm[];

  const present = new Set(aligned.map((t) => t.text.trim().toLowerCase()));
  for (const { def, count } of active) {
    const key = def.nebulaTag.toLowerCase();
    if (present.has(key)) continue;
    if (!activeKeys.has(key) || count <= 0) continue;
    const hit = pickSample(comments, def.re);
    if (!hit?.body) continue;
    const sample = originalSampleFromBody(hit.body);
    if (sample.length < 4) continue;
    aligned.push({
      text: def.nebulaTag,
      count,
      weight: 0,
      platformBias: biasOf(hit),
      sentiment: def.sentiment ?? 0.2,
      samples: [sample],
    });
  }

  const maxC = Math.max(1, ...aligned.map((t) => t.count));
  return aligned.map((t) => ({ ...t, weight: t.count / maxC }));
}

type ExtraRule = {
  text: string;
  re: RegExp;
  sentiment: number;
  platformPrefer?: "xiaohongshu" | "appstore";
};

/** Dense extras — many small tags for a fuller nebula. */
const EXTRA_SEED_RULES: ExtraRule[] = [
  { text: "what app is this", re: /什么app|哪个软件/, sentiment: 0 },
  { text: "offline / lag", re: /卡顿|离线|反应也不卡/, sentiment: 0.1 },
  {
    text: "strongly recommend",
    re: /强烈推荐|安利|推荐大家|马上下载支持/,
    sentiment: 0.7,
  },
  {
    text: "intuitive UI",
    re: /直观|简约|简洁方便|intuitiv/,
    sentiment: 0.55,
  },
  { text: "speaking practice", re: /口语|开口羞耻|开口难|哑巴法语/, sentiment: 0.45 },
  { text: "tap to pronounce", re: /点击.*发音|点词.*发音|发音的功能/, sentiment: 0.2 },
  { text: "lyrics / daily French", re: /歌词|生活上遇到的法语/, sentiment: 0.35 },
  { text: "auth failed", re: /认证失败|via Google/, sentiment: -0.5 },
  { text: "Wi‑Fi struggle", re: /换了好几个wifi|wifi和流量/, sentiment: -0.35 },
  { text: "annual plan", re: /年费|充一个年费/, sentiment: 0.5 },
  { text: "France expat", re: /留子|刚到法国/, sentiment: 0.4 },
  { text: "flash cards + AI", re: /flash card|boost.*IA|révolutionnaire/i, sentiment: 0.6 },
  { text: "indispensable", re: /indispensable|Application indispensable/i, sentiment: 0.7 },
  { text: "love the UI", re: /I love it|interfaces sont|UI is very/i, sentiment: 0.65 },
  { text: "self-study French", re: /自学法语|法语学习小工具/, sentiment: 0.55 },
  { text: "waiting Android", re: /期待.*安卓|蹲安卓|谷歌上线/, sentiment: 0.1 },
  { text: "can't download", re: /没办法下载|下载不了|法区没/, sentiment: -0.4 },
  { text: "membership?", re: /会员制/, sentiment: 0.15 },
  { text: "language switch", re: /系统语言|改回中文|设成了英文/, sentiment: -0.1 },
  { text: "pricing", re: /价格|定价|有点贵|太贵/, sentiment: -0.2 },
  { text: "clean & snappy", re: /简洁方便|不卡顿|反应也不卡/, sentiment: 0.5 },
  { text: "support creator", re: /支持一下|准备充/, sentiment: 0.45 },
  { text: "treasure find", re: /宝藏/, sentiment: 0.55 },
  { text: "coconut French", re: /椰子法语|椰子老师/, sentiment: 0.3 },
];

/** Short labels for leftover reviews → fill nebula density. */
const SPARK_RULES: { text: string; re: RegExp; sentiment: number }[] = [
  { text: "tried it today", re: /试用|立刻下载|立即下载|马上下载/, sentiment: 0.4 },
  { text: "hope it lasts", re: /坚持用|希望我能坚持/, sentiment: 0.35 },
  { text: "detail features", re: /细节功能/, sentiment: 0.4 },
  { text: "minimal style", re: /简约风/, sentiment: 0.45 },
  { text: "login help", re: /登不上去|登录不上|咋办/, sentiment: -0.45 },
  { text: "Europe store", re: /欧洲区/, sentiment: -0.3 },
  { text: "Google Play please", re: /Google Play|谷歌/, sentiment: 0.15 },
  { text: "practice daily", re: /每天陪我练习|平时积累/, sentiment: 0.5 },
  { text: "super app", re: /Super application|Excellente App|Excellent !/i, sentiment: 0.7 },
  { text: "amazing app", re: /Amazing app|I love it/i, sentiment: 0.7 },
  { text: "useful tool", re: /小工具|超有用|非常好用/, sentiment: 0.6 },
  { text: "need promo", re: /促销|年费会员|期待一下下/, sentiment: 0.1 },
];

function biasOf(c: FeedComment): number {
  if (c.platform === "appstore") return 0.85;
  if (c.platform === "xiaohongshu") return 0.15;
  return 0.5;
}

function pickSample(
  comments: FeedComment[],
  re: RegExp,
  prefer?: "xiaohongshu" | "appstore"
): FeedComment | null {
  const ranked = comments
    .filter((c) => isUserReviewBody(c.body || "") && re.test(c.body || ""))
    .sort((a, b) => {
      const pa = prefer && a.platform === prefer ? 1 : 0;
      const pb = prefer && b.platform === prefer ? 1 : 0;
      return pb - pa || (b.body?.length || 0) - (a.body?.length || 0);
    });
  return ranked[0] || null;
}

function pushUnique(
  out: NebulaTerm[],
  seenTags: Set<string>,
  term: NebulaTerm
) {
  const key = term.text.trim().toLowerCase();
  if (!key || seenTags.has(key)) return;
  seenTags.add(key);
  out.push(term);
}

export function seedNebulaTermsFromReviews(
  comments: FeedComment[],
  limit = 40
): NebulaTerm[] {
  const usedBodies = new Set<string>();
  const seenTags = new Set<string>();
  const out: NebulaTerm[] = [];

  // 1) Every theme with live hits (not only top-6 cards) — denser core
  for (const def of THEME_DEFS) {
    if (out.length >= limit) break;
    const count = themeMentionCount(def, comments);
    if (count <= 0) continue;
    const hit = pickSample(comments, def.re);
    if (!hit?.body) continue;
    usedBodies.add(hit.body);
    const sample = originalSampleFromBody(hit.body);
    pushUnique(out, seenTags, {
      text: def.nebulaTag,
      count,
      weight: 0,
      platformBias: biasOf(hit),
      sentiment: def.sentiment ?? 0.2,
      samples: sample.length >= 4 ? [sample] : [],
    });
  }

  // 2) Extra topical tags
  for (const rule of EXTRA_SEED_RULES) {
    if (out.length >= limit) break;
    const matches = comments.filter(
      (c) => isUserReviewBody(c.body || "") && rule.re.test(c.body || "")
    );
    if (!matches.length) continue;
    const hit =
      pickSample(comments, rule.re, rule.platformPrefer) || matches[0];
    if (!hit?.body) continue;
    usedBodies.add(hit.body);
    const sample = originalSampleFromBody(hit.body);
    if (sample.length < 4) continue;
    pushUnique(out, seenTags, {
      text: rule.text,
      count: Math.max(1, matches.length),
      weight: 0,
      platformBias: biasOf(hit),
      sentiment: rule.sentiment,
      samples: [sample],
    });
  }

  // 3) Spark tags from leftover reviews — fill the sphere
  for (const rule of SPARK_RULES) {
    if (out.length >= limit) break;
    const hit = comments.find(
      (c) =>
        isUserReviewBody(c.body || "") &&
        rule.re.test(c.body || "") &&
        !usedBodies.has(c.body || "")
    );
    if (!hit?.body) continue;
    usedBodies.add(hit.body);
    const sample = originalSampleFromBody(hit.body);
    pushUnique(out, seenTags, {
      text: rule.text,
      count: 1,
      weight: 0,
      platformBias: biasOf(hit),
      sentiment: rule.sentiment,
      samples: [sample],
    });
  }

  // 4) Still short? Add remaining long reviews as numbered sparks
  let sparkIdx = 1;
  for (const c of comments) {
    if (out.length >= limit) break;
    if (!isUserReviewBody(c.body || "") || usedBodies.has(c.body || "")) continue;
    if ((c.body || "").length < 28) continue;
    usedBodies.add(c.body || "");
    const sample = originalSampleFromBody(c.body || "");
    const label =
      c.platform === "appstore"
        ? `store note ${sparkIdx}`
        : `community note ${sparkIdx}`;
    sparkIdx += 1;
    pushUnique(out, seenTags, {
      text: label,
      count: 1,
      weight: 0,
      platformBias: biasOf(c),
      sentiment: 0.25,
      samples: [sample],
    });
  }

  const maxC = Math.max(1, ...out.map((t) => t.count));
  return out.map((t) => ({
    ...t,
    weight: Math.max(0.18, t.count / maxC), // floor weight so small tags stay visible
  }));
}
