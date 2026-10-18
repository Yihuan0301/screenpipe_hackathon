import type { FeedComment } from "@/lib/comments-feed";
import type { ClusterData } from "@/lib/theme-clusters";

export type SentimentResult = {
  score: number;
  label: "POSITIVE" | "NEUTRAL" | "CRITICAL";
  source: "llm" | "heuristic";
  rationale?: string;
};

function labelFor(score: number): SentimentResult["label"] {
  if (score >= 68) return "POSITIVE";
  if (score <= 38) return "CRITICAL";
  return "NEUTRAL";
}

/** 无 LLM 时的兜底：偏口碑体（好评多应落在 80+） */
export function heuristicSentiment(input: {
  comments?: FeedComment[];
  clusters?: ClusterData[];
  texts?: string[];
}): SentimentResult {
  const texts = [
    ...(input.texts || []),
    ...(input.comments || []).map((c) => c.body),
    ...(input.clusters || []).flatMap((c) => [
      c.aiSummary,
      c.typicalQuote.fullText,
    ]),
  ].filter(Boolean);

  if (!texts.length) {
    return { score: 78, label: "POSITIVE", source: "heuristic", rationale: "empty" };
  }

  let pos = 0;
  let neg = 0;
  let ratings = 0;
  let ratingSum = 0;

  const POS =
    /推荐|喜欢|必备|彻底|爱|棒|赞|好用|流畅|惊喜|完美|敢开口|强烈|great|love|amazing|excellent|addictive|smoother|five stars|强烈推荐/i;
  const NEG =
    /崩溃|卡顿|难用|垃圾|失望|坑|骗|慢|差评|crash|bug|terrible|awful|hotfix|slow|卡/i;

  for (const t of texts) {
    if (POS.test(t)) pos += 1;
    if (NEG.test(t)) neg += 1;
  }
  for (const c of input.comments || []) {
    if (c.rating != null) {
      ratings += 1;
      ratingSum += c.rating;
    }
  }

  const totalSignals = Math.max(1, pos + neg);
  const praiseRatio = pos / totalSignals;
  // 基线抬到 70：评论区整体偏口碑时不应落到 70 以下
  let score = 70 + praiseRatio * 28 - (neg / totalSignals) * 22;
  if (ratings > 0) {
    const avg = ratingSum / ratings;
    score = score * 0.55 + (avg / 5) * 100 * 0.45;
  }
  // 主题聚类：口碑/体验主题加权
  if (input.clusters?.length) {
    const mentions = input.clusters.reduce((s, c) => s + c.mentionCount, 0) || 1;
    const praiseM = input.clusters
      .filter((c) =>
        /口碑|体验|学习|推荐|Innovative|useful|Learning|word of mouth|Experience/i.test(
          c.themeName
        )
      )
      .reduce((s, c) => s + c.mentionCount, 0);
    const painM = input.clusters
      .filter((c) =>
        /痛点|崩溃|网络|发音|机械|Pricing|Network|Mechanical|stability/i.test(
          c.themeName
        )
      )
      .reduce((s, c) => s + c.mentionCount, 0);
    score = score * 0.7 + (55 + (praiseM / mentions) * 40 - (painM / mentions) * 18) * 0.3;
  }

  score = Math.round(Math.max(8, Math.min(98, score)));
  return {
    score,
    label: labelFor(score),
    source: "heuristic",
    rationale: `pos=${pos} neg=${neg}`,
  };
}

export function buildSentimentPrompt(texts: string[]): string {
  const sample = texts.slice(0, 24).map((t, i) => `${i + 1}. ${t.slice(0, 220)}`).join("\n");
  return `你是产品评论情绪分析器。阅读下列用户评论（小红书 + App Store），给出 0-100 的整体情绪分。
规则：
- 80-100：明显好评主导（推荐、爱用、效果好）
- 60-79：偏正面但有杂音
- 40-59：毁誉参半
- 0-39：差评主导
只输出 JSON：{"score":number,"label":"POSITIVE"|"NEUTRAL"|"CRITICAL","rationale":"一句话中文理由"}
不要 markdown。

评论：
${sample}`;
}

export function parseSentimentJson(raw: string): SentimentResult | null {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]) as {
      score?: number;
      label?: string;
      rationale?: string;
    };
    if (typeof obj.score !== "number") return null;
    const score = Math.round(Math.max(0, Math.min(100, obj.score)));
    const label =
      obj.label === "POSITIVE" ||
      obj.label === "NEUTRAL" ||
      obj.label === "CRITICAL"
        ? obj.label
        : labelFor(score);
    return {
      score,
      label,
      source: "llm",
      rationale: obj.rationale,
    };
  } catch {
    return null;
  }
}
