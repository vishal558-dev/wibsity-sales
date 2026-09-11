import type { ScoreCategory } from "@/types/lead";

const CATEGORY_STYLE: Record<ScoreCategory, { emoji: string; className: string }> = {
  HOT: { emoji: "🔥", className: "text-score-hot" },
  WARM: { emoji: "🟡", className: "text-score-warm" },
  LOW: { emoji: "⚪", className: "text-score-low" },
  SKIP: { emoji: "⚪", className: "text-score-skip" },
};

export function LeadScoreBadge({
  score,
  category,
}: {
  score: number | null;
  category: ScoreCategory | null;
}) {
  if (score === null || category === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const { emoji, className } = CATEGORY_STYLE[category];

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-sm tabular-nums ${className}`}>
      <span aria-hidden="true">{emoji}</span>
      <span>{score}</span>
    </span>
  );
}
