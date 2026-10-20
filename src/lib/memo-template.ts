// Part 40 (WS125.4). The house memo format. The current template is the MemoTemplate row with the
// highest version, or the built-in default when the table is empty. Editing the template saves a
// new version; existing memos keep their sections (the change applies to new memos only).
import { db } from "@/lib/db";
import { isValidKey, MEMO_LIMITS, type MemoTemplateSection } from "@/lib/memos";

export const DEFAULT_TEMPLATE_VERSION = 1;

const HEADLINE_RULE =
  "Separate the headline number from the underwritable near-term reality, and never underwrite on the biggest number.";
const ATTRIBUTION_RULE = "Attribute each claim to its source and date.";

export const DEFAULT_MEMO_TEMPLATE: MemoTemplateSection[] = [
  {
    key: "open-questions",
    title: "Open Questions",
    guidance:
      "What is still unresolved before a decision: the questions we would put to the founders next, and what would change our mind. Internal working notes; not shared by default.",
    required: true,
    shareByDefault: false,
  },
  {
    key: "company-overview",
    title: "Company Overview",
    guidance: `One paragraph on what the company does, for whom, and why now. ${ATTRIBUTION_RULE}`,
    required: true,
    shareByDefault: true,
  },
  {
    key: "product",
    title: "Product",
    guidance: "What the product does today versus what is planned. Be explicit about what is live, in pilot and on the roadmap.",
    required: true,
    shareByDefault: true,
  },
  {
    key: "market-opportunity",
    title: "Market Opportunity",
    guidance: `${HEADLINE_RULE} Use a table for TAM, SAM and the near-term serviceable market, with the source and date of each figure.`,
    required: true,
    shareByDefault: true,
  },
  {
    key: "traction",
    title: "Traction",
    guidance: `${HEADLINE_RULE} ${ATTRIBUTION_RULE} Separate signed, paying and pilot customers.`,
    required: true,
    shareByDefault: true,
  },
  {
    key: "business-model",
    title: "Business Model",
    guidance: "How the company makes money: pricing, unit economics, margins, and what is assumed versus observed.",
    required: true,
    shareByDefault: true,
  },
  {
    key: "go-to-market-hook",
    title: "Go-to-Market / Hook",
    guidance: "How customers are found and won, the hook that gets the first conversation, and what has actually worked so far.",
    required: true,
    shareByDefault: true,
  },
  {
    key: "competition-status-quo",
    title: "Competition / Status Quo",
    guidance: "What customers do today instead, and who else is building this. Use a table to compare competitors, and say how we know.",
    required: true,
    shareByDefault: true,
  },
  {
    key: "team",
    title: "Team",
    guidance: "Founders and key hires: relevant experience, gaps, and how we know. Stick to facts we can source.",
    required: true,
    shareByDefault: true,
  },
  {
    key: "round-investment-terms",
    title: "Round / Investment Terms",
    guidance: "Round size, instrument, valuation or cap, our proposed check, other investors, and use of proceeds.",
    required: true,
    shareByDefault: true,
  },
  {
    key: "key-risks",
    title: "Key Risks",
    guidance: "The few risks that matter most and what would mitigate each. Rank them; do not list everything.",
    required: true,
    shareByDefault: true,
  },
  {
    key: "exit-opportunities",
    title: "Exit opportunities",
    guidance: "Plausible acquirers or paths to liquidity, with precedent transactions where they exist. Do not underwrite on the best case.",
    required: false,
    shareByDefault: true,
  },
];

export interface MemoTemplate {
  version: number;
  sections: MemoTemplateSection[];
}

/** Stored Json is never trusted as the right shape: bad rows are dropped. */
export function readTemplateSections(json: unknown): MemoTemplateSection[] {
  if (!Array.isArray(json)) return [];
  const out: MemoTemplateSection[] = [];
  for (const s of json) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    if (!isValidKey(r.key) || typeof r.title !== "string" || !r.title.trim()) continue;
    if (out.some((x) => x.key === r.key)) continue;
    out.push({
      key: r.key,
      title: r.title.trim().slice(0, MEMO_LIMITS.sectionTitle),
      guidance: typeof r.guidance === "string" ? r.guidance : "",
      required: r.required === true,
      shareByDefault: r.shareByDefault !== false,
    });
  }
  return out;
}

export async function currentTemplate(): Promise<MemoTemplate> {
  const row = await db.memoTemplate.findFirst({ orderBy: { version: "desc" } });
  if (row) {
    const sections = readTemplateSections(row.sections);
    if (sections.length) return { version: row.version, sections };
  }
  return { version: DEFAULT_TEMPLATE_VERSION, sections: DEFAULT_MEMO_TEMPLATE };
}
