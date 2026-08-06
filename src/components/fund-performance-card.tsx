import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { FundPerformance, FundSnapshotDealRow } from "@/lib/portfolio-metrics";

// `asOf` is `Date` server-side (FundPerformance's own shape) but a
// JSON-serialized `string` once it round-trips through the admin fund
// page's `fetch()` — formatDate() already accepts either, so this prop
// type does too rather than forcing every caller to re-parse a Date.
type FundPerformanceLike = Omit<FundPerformance, "asOf"> & { asOf: Date | string };

interface FundPerformanceCardProps {
  performance: FundPerformanceLike;
  /**
   * When present, renders the full per-deal table (Q41-A) beneath the stat
   * strip — used by the LP/admin-preview fund-snapshot block (Part 14,
   * WS36). The admin fund page's own Performance card never passes this;
   * its separate Deals tab below keeps the sheet-sync column and sortable
   * headers, which are Deal-Ledger-specific and out of scope here.
   */
  deals?: FundSnapshotDealRow[];
  fundName?: string;
  /**
   * The "Admin-only estimate..." methodology caveat (and the TVPI/DPI ≈ and
   * Implied Value * markers that refer to it) is accurate on the admin fund
   * page but reads as an internal-tools note when it reaches an LP verbatim
   * — found live during the Part 14 walkthrough. Defaults to true so the
   * admin fund page (which passes no extra props) is unchanged; the
   * fund-snapshot block (shared by admin preview and the real LP page)
   * passes false.
   */
  showCaveat?: boolean;
  /** Part 15, WS37.5 — a fund's manual override (Q46/Q47/Q49/Q50). `null`/absent
   * for funds without a manual override; when at least one field is non-null
   * (JC-B), the card switches into override mode: Gross MOIC / Net TVPI /
   * Net DPI replace TVPI/DPI and Gross IRR is hidden. Invested and Implied
   * Value are unaffected either way. */
  overrides?: { grossMoic: number | null; netTvpi: number | null; netDpi: number | null } | null;
}

function multipleLabel(multiple: number | null): string {
  if (multiple === null) return "n/a";
  if (multiple === 0) return "Written off";
  return `${multiple.toFixed(1)}×`;
}

/**
 * Part 14, WS36.1 — extracted, byte-identical-output, from the JSX that used
 * to live inline at src/app/admin/funds/[id]/page.tsx:462-497. The admin
 * fund page imports and renders this unchanged (no `deals` prop — extraction
 * only, not a redesign). The LP/admin-preview fund-snapshot block (Part 14)
 * passes `deals` to also render the full per-deal table (Q41-A), so the two
 * surfaces render identical markup for the stats they share.
 */
export function FundPerformanceCard({ performance, deals, fundName, showCaveat = true, overrides }: FundPerformanceCardProps) {
  // Part 15, WS37.5, JC-B — "override active" is "at least one field is
  // non-null," not "all three or none." A partial save already switches
  // the card into override mode, showing "—" for the missing field(s).
  const overrideActive = !!overrides && (overrides.grossMoic !== null || overrides.netTvpi !== null || overrides.netDpi !== null);
  return (
    <div className="mb-6 rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{fundName ? `${fundName} — Performance` : "Performance"}</h3>
        <span className="text-xs text-muted-foreground">As of {formatDate(performance.asOf)}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <p className="text-xs text-muted-foreground">Invested</p>
          <p className="font-mono text-lg font-semibold">${performance.invested.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Implied Value{showCaveat && !performance.dilutionAware ? " *" : ""}</p>
          <p className="font-mono text-lg font-semibold">${Math.round(performance.impliedValue).toLocaleString()}</p>
        </div>
        {overrideActive ? (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Gross MOIC</p>
              <p className="font-mono text-lg font-semibold">{overrides!.grossMoic !== null ? `${overrides!.grossMoic.toFixed(2)}x` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net TVPI</p>
              <p className="font-mono text-lg font-semibold">{overrides!.netTvpi !== null ? `${overrides!.netTvpi.toFixed(2)}x` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net DPI</p>
              <p className="font-mono text-lg font-semibold">{overrides!.netDpi !== null ? `${overrides!.netDpi.toFixed(2)}x` : "—"}</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground">TVPI{showCaveat && performance.approximate ? " ≈" : ""}</p>
              <p className="font-mono text-lg font-semibold">{performance.tvpi !== null ? `${performance.tvpi.toFixed(2)}x` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">DPI{showCaveat && performance.approximate ? " ≈" : ""}</p>
              <p className="font-mono text-lg font-semibold">{performance.dpi !== null ? `${performance.dpi.toFixed(2)}x` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gross IRR</p>
              <p className="font-mono text-lg font-semibold" title={performance.grossIrr === null ? "Doesn't converge with the cashflow data recorded so far" : undefined}>
                {performance.grossIrr !== null ? `${(performance.grossIrr * 100).toFixed(1)}%` : "—"}
              </p>
            </div>
          </>
        )}
      </div>
      {showCaveat && (
        <p className="mt-3 text-xs text-muted-foreground">
          Admin-only estimate; gross of fees unless FEE cashflow rows are recorded.
          {!overrideActive && performance.approximate && " TVPI/DPI use total invested as a paid-in stand-in — no capital-call rows recorded yet, so treat as approximate."}
          {!performance.dilutionAware && " * Implied value assumes zero dilution (no ownership % recorded on these deals yet)."}
        </p>
      )}

      {deals && deals.length > 0 && (
        <div className="mt-4">
          <Table tableClassName="min-w-[720px]">
            <TableHead>
              <Th>Company</Th>
              <Th>Type</Th>
              <Th>Date</Th>
              <Th>Amount</Th>
              <Th>Instrument</Th>
              <Th>Entry Val.</Th>
              <Th>Current Val.</Th>
              <Th>Multiple</Th>
              <Th>As of</Th>
            </TableHead>
            <tbody>
              {deals.map((d, i) => (
                <TableRow key={i}>
                  <td className="px-4 py-2.5 font-medium">{d.companyName}</td>
                  <td className="px-4 py-2.5">{d.investmentType === "INITIAL" ? "Initial" : "Follow-on"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(d.dealDate)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">${d.amountUsd.toLocaleString()}</td>
                  <td className="px-4 py-2.5">{d.instrument ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{d.entryValuationUsd !== null ? `$${d.entryValuationUsd.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{d.currentValuationUsd !== null ? `$${d.currentValuationUsd.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-2.5">{multipleLabel(d.multiple)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{d.valuationAsOf ? formatDate(d.valuationAsOf) : "—"}</td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
