import type { ReactNode } from "react";
import { createElement } from "react";
import type { FeedComment } from "@/lib/comments-feed";
import { isUserReviewBody } from "@/lib/comments-feed";

/** LLM 结构化输出：典型原声 + 需高亮的关键词 */
export interface Quote {
  fullText: string;
  highlightWords: string[];
}

/** LLM 主题聚类结果 — 与后端 JSON 一一对应 */
export interface ClusterData {
  themeName: string;
  mentionCount: number;
  aiSummary: string;
  typicalQuote: Quote;
}

/**
 * 在完整原声里锁定 highlightWords，返回带赛博高亮的 React 节点。
 * AI 只负责「找词」，前端负责「发光」。
 */
export function renderHighlightedText(quote: Quote): ReactNode[] {
  const { fullText, highlightWords } = quote;
  if (!fullText) return [];

  const words = [...new Set(highlightWords.filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (words.length === 0) return [fullText];

  const escaped = words.map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = fullText.split(re);

  return parts.map((part, i) => {
    const hit = words.some((w) => w.toLowerCase() === part.toLowerCase());
    if (hit) {
      return createElement(
        "span",
        {
          key: `hl-${i}`,
          className:
            "mx-0.5 rounded bg-sky-500/20 px-1.5 py-0.5 font-medium text-sky-300",
        },
        part
      );
    }
    return part;
  });
}

/** @deprecated 仅作空数据占位；正式展示用 buildClustersFromComments */
export const mockClusters: ClusterData[] = [];

export type ThemeDef = {
  themeName: string;
  /** Nebula tag label — same count as theme card when present */
  nebulaTag: string;
  re: RegExp;
  highlightCandidates: string[];
  /** English summary; n = matched review count (must match badge) */
  summarize: (n: number) => string;
  sentiment?: number;
};

/** "1 review calls" / "4 reviews call" */
function nReviews(n: number, singularVerb: string, pluralVerb: string) {
  if (n <= 0) return `No reviews ${pluralVerb}`;
  return n === 1
    ? `1 review ${singularVerb}`
    : `${n} reviews ${pluralVerb}`;
}

/**
 * Theme pool for cards + nebula. Grid fills with the top live hits;
 * zero-hit themes are skipped and replaced by others that have data.
 */
export const THEME_DEFS: ThemeDef[] = [
  {
    themeName: "# Network issues",
    nebulaTag: "network issues",
    re: /网络|连不上|断网|超时|加载失败|信号|wifi|network|offline|connection|unreachable|timeout|登不上去|登录不上|网络异常|认证失败/i,
    highlightCandidates: ["网络", "network", "offline", "timeout", "登录"],
    sentiment: -0.45,
    summarize: (n) =>
      `${nReviews(n, "calls", "call")} out flaky network or failed loads that break practice mid-session.`,
  },
  {
    themeName: "# Learn English too",
    nebulaTag: "learn English too",
    re: /学英语|英语版|英文版|希望.*英语|也能学英|加.*英语|English (course|track|lesson)|learn English|support English/i,
    highlightCandidates: ["英语", "英文", "English"],
    sentiment: 0.15,
    summarize: (n) =>
      `${nReviews(n, "asks", "ask")} to learn English in the app too — today it only covers French.`,
  },
  {
    themeName: "# Mechanical pronunciation",
    nebulaTag: "mechanical voice",
    re: /发音.*(机械|生硬|不自然)|机械.*(发音|语音|人声)|没有人声|人声.*自然|TTS.*(机械|假|生硬)|robotic|mechanical.*(voice|pronunciation)|unnatural.*(voice|pronunciation)|synthetic.*(voice|speech)/i,
    highlightCandidates: ["发音", "人声", "机械", "TTS"],
    sentiment: -0.3,
    summarize: (n) =>
      `${nReviews(n, "says", "say")} pronunciation still sounds mechanical — not as natural as a human voice.`,
  },
  {
    themeName: "# Innovative & useful",
    nebulaTag: "innovative",
    re: /非常创新|创新好用|好用|推荐|有用|安利|innovative|useful|amazing|excellent|great app|indispensable/i,
    highlightCandidates: ["创新", "好用", "推荐", "Amazing", "Excellent"],
    sentiment: 0.65,
    summarize: (n) =>
      `${nReviews(n, "praises", "praise")} the product as genuinely innovative and useful day to day.`,
  },
  {
    themeName: "# Android version request",
    nebulaTag: "Android request",
    re: /安卓|上架安卓|安卓版|Android|android|Google Play|没有安卓|蹲安卓|谷歌上线/i,
    highlightCandidates: ["安卓", "Android", "上架"],
    sentiment: 0.1,
    summarize: (n) =>
      `${nReviews(n, "asks", "ask")} for an Android build — users want it on Google Play, not iOS-only.`,
  },
  {
    themeName: "# Speaking practice",
    nebulaTag: "speaking practice",
    re: /口语|开口|开口羞耻|哑巴法语|不敢说|说话|对话|speaking|conversation|oral|speak up|自由对话|敢开口/i,
    highlightCandidates: ["口语", "开口", "speaking", "conversation"],
    sentiment: 0.45,
    summarize: (n) =>
      `${nReviews(n, "focuses", "focus")} on speaking anxiety and oral drills — users credit the app with helping them actually open their mouths.`,
  },
  // Fallbacks when core themes have 0 hits
  {
    themeName: "# App Store region",
    nebulaTag: "App Store region",
    re: /哪个区|欧洲区|法区|美区|没看见|没办法下载|下载不了/i,
    highlightCandidates: ["App Store", "区", "欧洲"],
    sentiment: -0.35,
    summarize: (n) =>
      `${nReviews(n, "asks", "ask")} which App Store region carries the app — often can't find it in Europe.`,
  },
  {
    themeName: "# Pricing feedback",
    nebulaTag: "pricing",
    re: /价格|定价|有点贵|太贵|28\s*一|贵了/i,
    highlightCandidates: ["价格", "定价", "贵"],
    sentiment: -0.2,
    summarize: (n) =>
      `${nReviews(n, "flags", "flag")} pricing as a bit high relative to the feature set.`,
  },
  {
    themeName: "# Subscription intent",
    nebulaTag: "subscription intent",
    re: /订阅|年费|会员|充一个/i,
    highlightCandidates: ["订阅", "年费", "会员"],
    sentiment: 0.4,
    summarize: (n) =>
      `${nReviews(n, "shows", "show")} willingness to subscribe or buy an annual plan.`,
  },
  {
    themeName: "# Language switch",
    nebulaTag: "language switch",
    re: /系统语言|改回中文|设成了英文|更改.*语言/i,
    highlightCandidates: ["语言", "中文", "英文"],
    sentiment: -0.1,
    summarize: (n) =>
      `${nReviews(n, "needs", "need")} a clearer way to switch the app language back to Chinese.`,
  },
  {
    themeName: "# Beginner friendly",
    nebulaTag: "beginner friendly",
    re: /初学者|零基础|很适合初学/i,
    highlightCandidates: ["初学者", "零基础"],
    sentiment: 0.5,
    summarize: (n) =>
      `${nReviews(n, "calls", "call")} the app beginner-friendly for early French practice.`,
  },
];

/** Live hit count — real matches only (no demo inflation). */
export function themeMentionCount(
  def: ThemeDef,
  comments: FeedComment[]
): number {
  return comments.filter(
    (c) =>
      isUserReviewBody(c.body || "") &&
      !looksLikeCreatorReply(c.body || "") &&
      def.re.test(c.body || "")
  ).length;
}

/** Top themes with real hits — shared by cards + nebula. */
export function selectActiveThemes(
  comments: FeedComment[],
  limit = 6
): { def: ThemeDef; count: number }[] {
  return THEME_DEFS.map((def) => ({
    def,
    count: themeMentionCount(def, comments),
  }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.def.themeName.localeCompare(b.def.themeName))
    .slice(0, limit);
}


function pickHighlights(text: string, candidates: string[]): string[] {
  return candidates
    .filter((w) => text.toLowerCase().includes(w.toLowerCase()))
    .slice(0, 4);
}

/** 创作者 / 客服回复，不当作用户原声 */
function looksLikeCreatorReply(text: string): boolean {
  return /^(非常感谢你的喜欢|感谢支持|亲[，,]|你好呀|官方|客服|已收到你的反馈)/.test(
    text.trim()
  );
}

/** Drop Chinese sample quotes accidentally left in English summaries */
export function sanitizeClusterSummary(summary: string): string {
  let s = summary || "";
  s = s.replace(/\s*Sample:\s*["“][^"”]*["”]/gi, "");
  s = s.replace(/[「『][^」』]{4,}[」』]/g, "");
  s = s.replace(/[\u4e00-\u9fff]{6,}[^.]{0,40}/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

function pickQuote(hits: string[], candidates: string[]): string {
  if (!hits.length) return "";
  const ranked = [...hits]
    .filter((b) => !looksLikeCreatorReply(b))
    .filter((b) => pickHighlights(b, candidates).length > 0)
    .sort((a, b) => {
      const ha = pickHighlights(a, candidates).length;
      const hb = pickHighlights(b, candidates).length;
      return hb - ha || b.length - a.length;
    });
  return ranked[0] || hits.find((b) => !looksLikeCreatorReply(b)) || hits[0];
}

/**
 * Fill the Reviews theme grid from live hits only.
 * Zero-count themes are dropped; stronger fallbacks take their slots.
 * Badge number === number in the summary sentence.
 */
export function buildClustersFromComments(
  comments: FeedComment[],
  limit = 6
): ClusterData[] {
  const bodies = comments
    .map((c) => (c.body || "").trim())
    .filter((b) => isUserReviewBody(b) && !looksLikeCreatorReply(b));

  const used = new Set<string>();
  const out: ClusterData[] = [];
  const active = selectActiveThemes(comments, limit);

  for (const { def, count } of active) {
    const hits = bodies.filter((b) => def.re.test(b) && !used.has(b));
    const quote = hits.length ? pickQuote(hits, def.highlightCandidates) : "";
    if (quote) used.add(quote);
    const fullText = quote
      ? quote.length > 160
        ? `${quote.slice(0, 158)}…`
        : quote
      : def.themeName;
    out.push({
      themeName: def.themeName,
      mentionCount: count,
      aiSummary: sanitizeClusterSummary(def.summarize(count)),
      typicalQuote: {
        fullText,
        highlightWords: pickHighlights(fullText, def.highlightCandidates),
      },
    });
  }

  return out;
}

/** 校验 LLM 聚类：原声必须能在真实评论里找到（防止编造） */
export function filterClustersAgainstComments(
  clusters: ClusterData[],
  comments: FeedComment[]
): ClusterData[] {
  const corpus = comments.map((c) => c.body || "").join("\n");
  return clusters
    .filter((c) => {
      const q = (c.typicalQuote?.fullText || "").replace(/…$/, "").trim();
      if (q.length < 8) return false;
      const anchor = q.slice(0, Math.min(24, q.length));
      return corpus.includes(anchor);
    })
    .map((c) => ({
      ...c,
      aiSummary: sanitizeClusterSummary(c.aiSummary),
    }))
    .filter((c) => c.aiSummary.length > 12);
}

export function buildClustersPrompt(comments: FeedComment[]): string {
  const lines = comments
    .map((c) => c.body)
    .filter((b) => isUserReviewBody(b || ""))
    .slice(0, 80)
    .map((b, i) => `${i + 1}. ${(b || "").slice(0, 220)}`);
  return `You cluster product reviews (Rednote + App Store) into 3–4 themes.

Hard rules:
- themeName and aiSummary MUST be idiomatic English only — never paste Chinese into the summary
- Do NOT invent monthly-vs-annual confusion unless a review explicitly says that
- Pricing theme: only “too expensive / wants cheaper / hesitant to pay”; convert any 元 amounts to euros (~¥1 ≈ €0.13) if you mention prices
- typicalQuote.fullText must be a verbatim excerpt from a review below (for validation); the UI will not show it
- mentionCount ≈ how many reviews fit the theme

Return JSON only:
{"clusters":[{"themeName":"# Pricing & willingness to pay","mentionCount":12,"aiSummary":"English summary only.","typicalQuote":{"fullText":"…","highlightWords":["…"]}}]}

Reviews:
${lines.join("\n")}`;
}

export function parseClustersJson(raw: string): ClusterData[] | null {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]) as { clusters?: ClusterData[] };
    if (!Array.isArray(obj.clusters) || obj.clusters.length === 0) return null;
    return obj.clusters.filter(
      (c) => c?.themeName && c?.typicalQuote?.fullText
    );
  } catch {
    return null;
  }
}
