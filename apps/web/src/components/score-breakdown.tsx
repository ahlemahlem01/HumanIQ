export type ScoreBreakdown = {
  score: number;
  semanticScore: number | null;
  keywordScore: number;
  similarity?: number | null;
  method?: string;
};

export function ScoreBars({ match }: { match: ScoreBreakdown }) {
  return (
    <div className="space-y-3">
      <Bar label="Score global" value={match.score} tone="copper" />
      <Bar
        label="Sémantique (pgvector)"
        value={match.semanticScore}
        hint={
          match.similarity != null
            ? `cosinus ${match.similarity.toFixed(3)}`
            : "vecteur indisponible"
        }
      />
      <Bar label="Mots-clés (ATS)" value={match.keywordScore} />
      {match.method === "keyword-only" ? (
        <p className="text-xs text-warn">
          Aucun vecteur comparable : score calculé sur les mots-clés seuls. Téléversez un CV pour
          activer le matching sémantique.
        </p>
      ) : null}
    </div>
  );
}

function Bar({
  label,
  value,
  hint,
  tone = "forest",
}: {
  label: string;
  value: number | null;
  hint?: string;
  tone?: "forest" | "copper";
}) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className={tone === "copper" ? "text-copper" : "text-forest/70"}>
          {value === null ? "—" : `${value}%`}
          {hint ? <span className="ml-2 text-xs text-forest/50">{hint}</span> : null}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full ${tone === "copper" ? "bg-copper" : "bg-forest"}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}
