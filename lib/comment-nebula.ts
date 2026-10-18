import {
  isUserReviewBody,
  type FeedComment,
} from "@/lib/comments-feed";
import type { ClusterData } from "@/lib/theme-clusters";

export type NebulaTerm = {
  text: string;
  count: number;
  weight: number;
  platformBias: number;
  sentiment: number;
  /** Hover quote — English when served from i18n cache */
  samples: string[];
  /** Optional originals (bilingual); UI shows `samples` only */
  sampleOriginals?: string[];
};

/** LLM 抽出的词核（可直接渲染） */
export type LlmNebulaTerm = {
  text: string;
  weight: number;
  sentiment?: number;
  /** 1-based index into the numbered review list in the prompt */
  review?: number;
  /** Legacy; prefer `review` so UI can show the verbatim original */
  sample?: string;
};

const STOP = new Set([
  "的",
  "了",
  "是",
  "我",
  "你",
  "在",
  "有",
  "和",
  "也",
  "就",
  "都",
  "很",
  "还",
  "这",
  "那",
  "个",
  "可以",
  "一个",
  "没有",
  "什么",
  "真的",
  "感觉",
  "觉得",
  "比较",
  "然后",
  "已经",
  "还是",
  "不是",
  "就是",
  "the",
  "and",
  "for",
  "this",
  "that",
  "with",
  "from",
  "been",
  "using",
  "while",
  "have",
  "has",
  "are",
  "was",
  "were",
  "app",
  "apps",
  "version",
  "review",
  "reviews",
  "store",
  // 法语虚词（ASC 法评里易被英文字母正则切碎，如 première fois → fois）
  "qui",
  "pour",
  "cette",
  "les",
  "des",
  "une",
  "est",
  "sont",
  "avec",
  "dans",
  "pas",
  "plus",
  "très",
  "tres",
  "que",
  "je",
  "nous",
  "vous",
  "fois",
  "cest",
  "c'est",
  "la",
  "le",
  "un",
  "du",
  "au",
  "aux",
  "ce",
  "ces",
  "mon",
  "ton",
  "son",
  "mais",
  "ou",
  "et",
  "en",
  "sur",
  "par",
  "ne",
  "se",
  "y",
  "il",
  "elle",
  "on",
  "ils",
  "elles",
  "suis",
  "fait",
  "faites",
  "vois",
  "voir",
  "premi",
  "premiere",
  "première",
  "volutionnaire",
  "fran",
  "ais",
  "cette",
  "beaucoup",
  "vraiment",
  "aussi",
  "comme",
  "tout",
  "tous",
  "bien",
  "mal",
  "peu",
  "encore",
  "toujours",
  "jamais",
  "rien",
  "quel",
  "quelle",
  "quand",
  "dont",
  "car",
  "donc",
  "alors",
  "ici",
  "leur",
  "leurs",
  "nos",
  "vos",
  "mes",
  "tes",
  "ses",
  // ASC 控制台噪音（绝不能进星云）
  "distribution",
  "analytics",
  "testflight",
  "optimization",
  "availability",
  "regions",
  "region",
  "application",
  "recent",
  "general",
  "history",
  "privacy",
  "accessibility",
  "subscriptions",
  "subscription",
  "nominations",
  "featuring",
  "monetization",
  "marketing",
  "library",
  "codes",
  "promo",
  "ratings",
  "reply",
  "report",
  "concern",
  "platform",
  "countries",
  "waiting",
  "ready",
  "product",
  "page",
  "custom",
  "events",
  "purchases",
  "growth",
  "safety",
  "chunkflow",
]);

/** ASC / 控制台词 —— 出现即丢弃 */
function isConsoleNoiseTerm(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (STOP.has(t.toLowerCase())) return true;
  if (
    /product page|page optimization|custom product|in-app|promo code|game center|app store connect|ratings and reviews|all versions|all ratings|all reviews|report a concern/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/** Match Chinese/EN review phrases → English nebula labels (UI is English-only). */
const PHRASE_ALIASES: { display: string; match: RegExp }[] = [
  { display: "ChunkFlow", match: /ChunkFlow/i },
  { display: "free conversation", match: /自由对话/i },
  { display: "speaking anxiety", match: /开口难|开口羞耻/i },
  { display: "dare to speak", match: /敢开口/i },
  { display: "self-study French", match: /自学法语/i },
  { display: "spoken French", match: /法语口语/i },
  { display: "strongly recommend", match: /强烈推荐/i },
  { display: "beginner-friendly", match: /零基础/i },
  { display: "offline pack", match: /离线包/i },
  { display: "subscription", match: /订阅|subscription/i },
  { display: "price", match: /价格|定价|price/i },
  { display: "crash", match: /崩溃|crash/i },
  { display: "lag", match: /卡顿/i },
  { display: "difficulty curve", match: /难度曲线/i },
  { display: "must-have", match: /必备/i },
  { display: "chunk", match: /\bchunk\b/i },
  { display: "hotfix", match: /hotfix/i },
];

const ZH_TERM_GLOSS: Record<string, string> = {
  价格: "price",
  定价: "pricing",
  订阅: "subscription",
  卡顿: "lag",
  崩溃: "crash",
  自学法语: "self-study French",
  自由对话: "free conversation",
  开口难: "speaking anxiety",
  敢开口: "dare to speak",
  强烈推荐: "strongly recommend",
  零基础: "beginner-friendly",
  法语口语: "spoken French",
  必备: "must-have",
  离线包: "offline pack",
  难度曲线: "difficulty curve",
  评论区: "comments",
  好用: "works well",
  推荐: "recommend",
  年费: "annual plan",
  口语: "speaking",
};

function glossTerm(text: string): string {
  const t = text.trim();
  if (ZH_TERM_GLOSS[t]) return ZH_TERM_GLOSS[t];
  // mixed / multi-char Chinese → try longest key
  for (const [zh, en] of Object.entries(ZH_TERM_GLOSS)) {
    if (t.includes(zh) && t.length <= zh.length + 2) return en;
  }
  // drop pure CJK labels from the nebula UI
  if (/^[\u4e00-\u9fff]{2,}$/.test(t)) return "";
  return t;
}

const POSITIVE =
  /好用|喜欢|推荐|棒|赞|爱|流畅|惊喜|完美|敢开口|强烈|必备|love|great|amazing|excellent/i;
const NEGATIVE =
  /不好|难用|卡顿|崩溃|失望|差|坑|crash|bug|slow|terrible|hotfix/i;

function normalizeTerms(
  raw: { text: string; count: number; sentiment: number; samples: string[]; platformBias?: number }[]
): NebulaTerm[] {
  const maxN = Math.max(1, ...raw.map((t) => t.count));
  const merged = new Map<
    string,
    { count: number; sentiment: number; samples: string[]; platformBias?: number }
  >();
  for (const t of raw) {
    const label = glossTerm(t.text);
    if (!label || label.length < 2 || STOP.has(label.toLowerCase())) continue;
    const cur = merged.get(label) || {
      count: 0,
      sentiment: 0,
      samples: [] as string[],
      platformBias: t.platformBias,
    };
    cur.count += t.count;
    cur.sentiment += t.sentiment;
    for (const s of t.samples.slice(0, 2)) {
      const en = /[\u4e00-\u9fff]{4,}/.test(s)
        ? paraphraseReviewToEnglish(s)
        : s;
      if (
        cur.samples.length < 2 &&
        en &&
        en.length > 8 &&
        !isGarbageSample(en)
      ) {
        cur.samples.push(en);
      }
    }
    merged.set(label, cur);
  }
  const list = [...merged.entries()].map(([text, v]) => ({
    text,
    count: v.count,
    sentiment: v.sentiment / Math.max(1, v.count),
    samples: v.samples,
    platformBias: v.platformBias ?? 0.5,
  }));
  const maxM = Math.max(1, ...list.map((t) => t.count));
  return list
    .sort((a, b) => b.count - a.count)
    .slice(0, 56)
    .map((t) => ({
      text: t.text,
      count: t.count,
      weight: t.count / maxM,
      platformBias: t.platformBias ?? 0.5,
      sentiment: Math.max(-1, Math.min(1, t.sentiment)),
      samples: t.samples.slice(0, 2),
    }));
}

/**
 * Turn a review body into a short English hover quote.
 * UI is English-only — never surface raw Chinese in the nebula detail.
 */
export function paraphraseReviewToEnglish(body: string): string {
  const t = (body || "").replace(/\s+/g, " ").trim();
  if (!t) return "";

  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  // Pure Latin / French / EN — keep as-is
  if (cjk === 0) {
    const cut = t.slice(0, 120);
    return cut + (t.length > 120 ? "…" : "");
  }

  // Specific intents first
  if (
    /哪个区|欧洲区|法区|美区|区的.*App\s*Store|App\s*Store.*没|没看见|法区没|没办法下载|下载不了/i.test(
      t
    )
  ) {
    return "Which App Store region is this in? I can't find it in Europe.";
  }
  if (/改.*语言|系统语言|设成了英文|改回中文|如何更改.*语言/i.test(t)) {
    return "How do I switch the app language back to Chinese?";
  }
  if (/安卓|Android|Google Play|谷歌上线/i.test(t)) {
    return "Please ship an Android build — I'd use it on Google Play.";
  }
  if (/网络|登不上去|登录不上|网络异常|连不上|挂.?梯|超时|加载失败/i.test(t)) {
    return "Network / login keeps failing — can't get in to practice.";
  }
  if (/价格|定价|有点贵|太贵|28\s*一|贵了/i.test(t)) {
    return "Useful, but the monthly price feels a bit high for what it does.";
  }
  if (/学英语|英语版|英文版|也能学英|加.*英语/i.test(t)) {
    return "Would love an English learning track in the app too.";
  }
  if (/发音|机械|人声|TTS|不自然/i.test(t)) {
    return "Pronunciation still sounds mechanical — not as natural as a real voice.";
  }
  if (/口语|开口羞耻|开口难|哑巴法语|不敢说|自由对话/i.test(t)) {
    return "Really helps with speaking practice and getting over the fear of talking.";
  }
  if (/订阅|年费|会员|充/i.test(t)) {
    return "Ready to subscribe / support with an annual plan.";
  }
  if (/创新|好用|很好|推荐|安利|宝藏|喜欢|超有用|indispensable|amazing|excellent/i.test(t)) {
    return "Genuinely useful and innovative — worth trying.";
  }
  if (/什么app|哪个软件|叫什么/i.test(t)) {
    return "Which app is this? Looking for the name to download.";
  }

  // Mixed ZH+EN: keep a clean Latin excerpt if long enough
  const latin = t.match(
    /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\s,'’"“”:.!?\-()]{8,120}/
  );
  if (latin && !/[\u4e00-\u9fff]/.test(latin[0])) {
    return latin[0].replace(/\s+/g, " ").trim().slice(0, 90);
  }

  return "User review in Chinese — see theme cards for the product takeaway.";
}

/**
 * Hover quote for the nebula: always English for the FounderHUD UI.
 */
function hoverSampleFromBody(body: string): string | null {
  const en = paraphraseReviewToEnglish(body);
  if (!en || en.length < 12) return null;
  return en.slice(0, 120);
}

function isGarbageSample(s: string): boolean {
  // Reject leftover Chinese samples in the English UI
  if (/[\u4e00-\u9fff]{4,}/.test(s)) return true;
  const letters = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return letters < 8 || letters / Math.max(1, s.length) < 0.35;
}

/** 无 LLM：只抽完整短语 / 英文词 / 聚类高亮，绝不碎切二字 */
export function buildNebulaTerms(
  comments: FeedComment[],
  limit = 48,
  clusters?: ClusterData[]
): NebulaTerm[] {
  const map = new Map<
    string,
    { n: number; sent: number; samples: string[]; xhs: number; asc: number }
  >();

  const bump = (
    text: string,
    body: string,
    platform: FeedComment["platform"] | "mixed",
    sent: number,
    w = 1
  ) => {
    const key = text.trim();
    if (key.length < 2 || isConsoleNoiseTerm(key)) return;
    if (/^[\d.万+]+$/.test(key)) return;
    // sample 本身是控制台文案则不要
    if (body && isConsoleNoiseTerm(body.slice(0, 80))) return;
    const cur = map.get(key) || {
      n: 0,
      sent: 0,
      samples: [] as string[],
      xhs: 0,
      asc: 0,
    };
    cur.n += w;
    cur.sent += sent;
    if (platform === "xiaohongshu") cur.xhs += 1;
    else if (platform === "appstore") cur.asc += 1;
    if (cur.samples.length < 2 && body) {
      const sample = hoverSampleFromBody(body);
      if (sample && !isGarbageSample(sample)) cur.samples.push(sample);
    }
    map.set(key, cur);
  };

  for (const c of comments) {
    const body = c.body || "";
    if (!isUserReviewBody(body)) continue;
    // creator / support replies are not user reviews
    if (
      /^(非常感谢你的喜欢|感谢支持|亲[，,]|你好呀|官方|客服|已收到你的反馈)/.test(
        body.trim()
      )
    ) {
      continue;
    }
    let sent = 0;
    if (c.rating != null) sent += (c.rating - 3) / 2;
    if (POSITIVE.test(body)) sent += 0.35;
    if (NEGATIVE.test(body)) sent -= 0.45;

    for (const { display, match } of PHRASE_ALIASES) {
      if (match.test(body)) {
        bump(display, body, c.platform, sent, 2);
      }
    }
    for (const m of body.matchAll(/#[\w\u4e00-\u9fff]{2,20}/g)) {
      bump(m[0].replace(/^#/, ""), body, c.platform, sent, 2);
    }
    // Do NOT tokenize every Latin word — one FR App Store review used to
    // explode into révolutionnaire / combine / toutes / fonctionnalités…
    // Only known brands + a small EN product lexicon (no usernames / FR filler).
    for (const m of body.matchAll(
      /\b(ChunkFlow|Google|WiFi|Android|iOS|App\s?Store)\b/g
    )) {
      bump(m[0].replace(/\s+/g, " "), body, c.platform, sent, 2);
    }
    for (const m of body.matchAll(
      /\b(amazing|excellent|intuitive|indispensable|crash|offline|subscription|pricing|speaking|conversation)\b/gi
    )) {
      bump(m[0].toLowerCase(), body, c.platform, sent, 1);
    }
  }

  for (const cluster of clusters || []) {
    for (const w of cluster.typicalQuote.highlightWords || []) {
      bump(w, cluster.typicalQuote.fullText, "mixed", 0.2, cluster.mentionCount / 8);
    }
  }

  const raw = [...map.entries()].map(([text, v]) => ({
    text,
    count: Math.max(1, Math.round(v.n)),
    sentiment: v.sent / Math.max(1, v.n),
    samples: v.samples,
    platformBias:
      v.xhs + v.asc === 0 ? 0.5 : v.asc / (v.xhs + v.asc),
  }));

  return normalizeTerms(raw).slice(0, limit);
}

function platformBiasOf(c: FeedComment | undefined): number {
  if (!c) return 0.5;
  if (c.platform === "appstore") return 0.85;
  if (c.platform === "xiaohongshu") return 0.15;
  return 0.5;
}

/** Truncate original review for hover — keep language as-is (原文). */
export function originalSampleFromBody(body: string, max = 160): string {
  const t = (body || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function resolveSourceReview(
  t: LlmNebulaTerm,
  reviews: FeedComment[]
): FeedComment | null {
  const idx =
    typeof t.review === "number" ? Math.round(t.review) : NaN;
  if (idx >= 1 && idx <= reviews.length) {
    return reviews[idx - 1] || null;
  }
  const needle = (t.sample || "").replace(/…$/, "").trim().slice(0, 28);
  if (needle.length >= 8) {
    const hit = reviews.find((c) => (c.body || "").includes(needle));
    if (hit) return hit;
  }
  return null;
}

/**
 * Map LLM tags → nebula nodes. Each tag must resolve to a real review
 * so the hover can show the verbatim original (原文).
 */
export function llmTermsToNebula(
  terms: LlmNebulaTerm[],
  reviews: FeedComment[] = []
): NebulaTerm[] {
  const cleaned = terms
    .map((t) => ({
      ...t,
      text: glossTerm((t.text || "").trim()),
    }))
    .filter((t) => {
      const text = t.text;
      if (!text || text.length < 2) return false;
      if (isConsoleNoiseTerm(text)) return false;
      if (/^[\u4e00-\u9fff]+$/.test(text)) return false;
      return true;
    });

  const out: NebulaTerm[] = [];
  const seenTag = new Set<string>();

  for (const t of cleaned) {
    if (out.length >= 48) break;
    const key = t.text.toLowerCase();
    if (seenTag.has(key)) continue;
    const src = resolveSourceReview(t, reviews);
    if (!src?.body) continue;
    const original = originalSampleFromBody(src.body);
    if (original.length < 6) continue;
    seenTag.add(key);
    out.push({
      text: t.text,
      count: Math.max(1, Math.round(t.weight || 1)),
      weight: 0,
      platformBias: platformBiasOf(src),
      sentiment: typeof t.sentiment === "number" ? t.sentiment : 0.2,
      samples: [original],
    });
  }

  const maxW = Math.max(1, ...out.map((t) => t.count));
  return out.map((t) => ({
    ...t,
    weight: t.count / maxW,
    sentiment: Math.max(-1, Math.min(1, t.sentiment)),
  }));
}

/** Numbered review corpus for the nebula LLM (tags only — no regex). */
export function buildNebulaPrompt(comments: FeedComment[]): string {
  const reviews = comments
    .filter((c) => isUserReviewBody(c.body || ""))
    .slice(0, 120);
  const listed = reviews
    .map((c, i) => {
      const ch = c.platform === "appstore" ? "ASC" : "XHS";
      return `${i + 1}. [${ch}] ${(c.body || "").replace(/\s+/g, " ").trim().slice(0, 280)}`;
    })
    .join("\n");

  return `You build a review word-nebula for a French-learning app (ChunkFlow).

Below are ${reviews.length} user reviews, numbered. Read all of them.

Hard rules:
- terms[].text = short idiomatic ENGLISH tag/label only (e.g. "speaking anxiety", "App Store region", "Android request", "price"). Never Chinese in text.
- terms[].review = 1-based index of the source review that best exemplifies this tag (REQUIRED). Must be a real number from the list.
- Do NOT invent quotes. Do NOT paraphrase into sample — the server attaches the original text from review.
- Ban App Store Connect chrome / note titles / marketing hooks.
- weight 1–10; sentiment -1..1; aim for 28–40 diverse product-meaningful tags.
- Prefer concrete product themes over generic adjectives like "excellent" alone.

Also give overall sentiment score 0–100 and a one-sentence English rationale.

JSON only (no markdown):
{"score":number,"label":"POSITIVE"|"NEUTRAL"|"CRITICAL","rationale":"…","terms":[{"text":"App Store region","weight":4,"sentiment":-0.3,"review":12}]}

Reviews:
${listed}`;
}

export function parseNebulaIntelJson(raw: string): {
  score?: number;
  label?: string;
  rationale?: string;
  terms: LlmNebulaTerm[];
} | null {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]) as {
      score?: number;
      label?: string;
      rationale?: string;
      terms?: LlmNebulaTerm[];
    };
    if (!Array.isArray(obj.terms) || obj.terms.length === 0) return null;
    return {
      score: obj.score,
      label: obj.label,
      rationale: obj.rationale,
      terms: obj.terms
        .filter((t) => t?.text && String(t.text).length >= 2)
        .map((t) => ({
          ...t,
          review:
            typeof t.review === "number"
              ? t.review
              : Number.isFinite(Number((t as { review?: unknown }).review))
                ? Number((t as { review?: unknown }).review)
                : undefined,
        })),
    };
  } catch {
    return null;
  }
}
