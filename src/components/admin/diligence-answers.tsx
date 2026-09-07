// Part 34, WS91/WS92 — read-only render of CompanyDiligence's founder-written
// answers. Plain text from a <textarea>, NOT TipTap HTML: whitespace-pre-wrap
// + normal interpolation, never dangerouslySetInnerHTML. `variant="compact"`
// is the queue-card form (D2: behind a native <details>) — it renders only
// the Stellar essays, since the incorporation answer is already shown as a
// badge in the queue card. The default "full" variant (the WS91 tab) renders
// the incorporation answer too.
export interface DiligenceAnswers {
  isUsIncorporated: boolean | null;
  isStellarEcosystem: boolean;
  stellarWhyText: string | null;
  stellarTimelineText: string | null;
}

function EssayBlock({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {text && text.trim().length > 0 ? (
        <p className="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Not answered yet.</p>
      )}
    </div>
  );
}

export default function DiligenceAnswers({
  diligence,
  variant = "full",
}: {
  diligence: DiligenceAnswers;
  variant?: "compact" | "full";
}) {
  const essays = diligence.isStellarEcosystem ? (
    <div className="space-y-3">
      <EssayBlock
        label="Why does this deal involve the Stellar ecosystem?"
        text={diligence.stellarWhyText}
      />
      <EssayBlock
        label="What's the timeline for Stellar involvement?"
        text={diligence.stellarTimelineText}
      />
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      Stellar ecosystem questions were not asked for this deal.
    </p>
  );

  if (variant === "compact") {
    return essays;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          US-incorporated?
        </p>
        <p className="mt-1 text-sm">
          {diligence.isUsIncorporated == null ? (
            <span className="text-muted-foreground">Not answered yet.</span>
          ) : diligence.isUsIncorporated ? (
            "Yes"
          ) : (
            "No"
          )}
        </p>
      </div>
      {essays}
    </div>
  );
}
