import { ExternalLink } from "lucide-react";
import { formatDateOnly, type MemoCitation } from "./types";

/** Read-only citation chips under a section: "label · date", with a link icon when it has a URL. */
export function CitationChips({ citations }: { citations: MemoCitation[] }) {
  if (!citations.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Citations">
      {citations.map((c, i) => (
        <li key={i} className="badge-neutral !normal-case">
          <span>{c.label}</span>
          {c.date && <span className="text-muted-foreground">· {formatDateOnly(c.date)}</span>}
          {c.url && (
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={`Open ${c.label}`}
              className="inline-flex text-primary hover:text-primary-hover"
            >
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
