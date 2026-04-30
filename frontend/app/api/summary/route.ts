/**
 * app/api/summary/route.ts
 *
 * GET /api/summary
 *
 * Returns the aggregated reconciliation summary:
 *   - summary   → top-level KPIs (total billed, total overcharge, etc.)
 *   - by_carrier → per-carrier breakdown
 *   - by_violation_type → per-violation-type breakdown
 *
 * The heavy lifting (fetching + reconciling) is handled by getCachedAnalysis()
 * which maintains a 10-minute in-memory TTL to avoid Vercel timeout issues.
 */

import { NextResponse } from "next/server";
import { getCachedAnalysis } from "@/lib/cache";

// Vercel: allow up to 60 s execution time for the initial cold-start fetch
export const maxDuration = 60;

// Returns cached aggregate audit data so the dashboard can load summary
// panels without recomputing reconciliation for every request.
export async function GET() {
  try {
    const result = await getCachedAnalysis();

    return NextResponse.json({
      summary: result.summary,
      by_carrier: result.by_carrier,
      by_violation_type: result.by_violation_type,
      by_zone: result.by_zone,
      by_weight_range: result.by_weight_range,
      by_carrier_zone: result.by_carrier_zone,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/summary] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
