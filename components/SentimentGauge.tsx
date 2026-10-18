"use client";

/** 情绪角标：😊 POSITIVE 82 — 无渐变条 */
export default function SentimentGauge({
  score,
  loading,
}: {
  score: number;
  label?: string;
  source?: "llm" | "heuristic";
  rationale?: string;
  loading?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const mood =
    clamped >= 68
      ? { emoji: "😊", tag: "POSITIVE", color: "text-emerald-300" }
      : clamped <= 38
        ? { emoji: "🥶", tag: "CRITICAL", color: "text-rose-300" }
        : { emoji: "😐", tag: "NEUTRAL", color: "text-amber-200" };

  return (
    <div
      className={`flex items-center gap-2 ${mood.color} ${
        loading ? "animate-pulse opacity-70" : ""
      }`}
    >
      <span className="text-lg leading-none">{mood.emoji}</span>
      <span className="font-mono text-[12px] tracking-wider">{mood.tag}</span>
      <span className="font-mono text-base tabular-nums text-zinc-100">
        {clamped}
      </span>
    </div>
  );
}
