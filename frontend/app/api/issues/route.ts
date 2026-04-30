/**
 * app/api/issues/route.ts
 *
 * GET /api/issues
 *
 * Returns a paginated, sortable list of overcharged shipments.
 *
 * Query parameters:
 *   page     (number, default 1)   — 1-indexed page number
 *   limit    (number, default 50)  — rows per page
 *   carrier  (string, optional)    — filter by exact carrier name
 *   type     (string, optional)    — filter by violation type
 *   sort     (string, default "overcharge") — "overcharge" | "date" | "carrier"
 *
 * Response shape:
 *   { total: number, page: number, limit: number, data: ReconciledShipment[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCachedAnalysis } from "@/lib/cache";
import type { ReconciledShipment } from "@/lib/reconciliation";

// Vercel: allow up to 60 s execution time for the initial cold-start fetch
export const maxDuration = 60;

// Orders newest shipments first because auditors often start with the
// most recent invoices when resolving active disputes.
function sortByDate(a: ReconciledShipment, b: ReconciledShipment) {
  return b.shipment_date.localeCompare(a.shipment_date);
}

// Orders carriers alphabetically so filtered exports and table views are
// easy to scan by provider name.
function sortByCarrier(a: ReconciledShipment, b: ReconciledShipment) {
  return a.carrier.localeCompare(b.carrier);
}

// Orders highest leakage first because the default view should surface
// the most financially important rows.
function sortByOvercharge(a: ReconciledShipment, b: ReconciledShipment) {
  return b.total_overcharge - a.total_overcharge;
}

const SORTERS: Record<string, (a: ReconciledShipment, b: ReconciledShipment) => number> = {
  date: sortByDate,
  carrier: sortByCarrier,
  overcharge: sortByOvercharge,
};

// Reads a bounded positive integer from the query string so bad inputs
// cannot force huge pages or invalid pagination.
function readBoundedInt(value: string | null, fallback: number, max: number) {
  const parsed = parseInt(value ?? String(fallback), 10);
  return Math.min(max, Math.max(1, Number.isNaN(parsed) ? fallback : parsed));
}

// Serves filtered and sorted issue rows from the cached audit so the UI
// can paginate large results without doing the work in the browser.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const page = readBoundedInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const limit = readBoundedInt(searchParams.get("limit"), 50, 200);
    const carrierFilter = searchParams.get("carrier");
    const typeFilter = searchParams.get("type");
    const sort = searchParams.get("sort") ?? "overcharge";

    const result = await getCachedAnalysis();
    let issues: ReconciledShipment[] = [...result.issues];

    if (carrierFilter) issues = issues.filter((i) => i.carrier === carrierFilter);
    if (typeFilter) issues = issues.filter((i) => i.violation_types.includes(typeFilter));

    issues.sort(SORTERS[sort] ?? SORTERS.overcharge);

    const total = issues.length;
    const start = (page - 1) * limit;
    const data = issues.slice(start, start + limit);

    return NextResponse.json({ total, page, limit, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/issues] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
