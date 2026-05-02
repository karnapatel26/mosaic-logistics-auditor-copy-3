import { NextResponse } from "next/server";
import { getCachedAnalysis } from "@/lib/cache";
import type { ReconciledShipment } from "@/lib/reconciliation";

export const maxDuration = 60;

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function humanize(t: string) {
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export async function GET() {
  try {
    const result = await getCachedAnalysis();
    const rows = result.issues;

    const headers = [
      "shipment_id", "awb_number", "shipment_date", "carrier", "shipment_type", "payment_mode",
      "destination_zone", "billed_zone", "actual_weight_slab", "billed_weight_slab",
      "expected_base_rate", "actual_base_rate", "expected_cod", "actual_cod",
      "expected_rto", "actual_rto", "misc_charges", "expected_total", "actual_total",
      "overcharge", "overcharge_pct", "root_cause",
    ];

    const csvRows = rows.map((issue: ReconciledShipment) => {
      const overchargePct = issue.expected_total
        ? ((issue.total_overcharge / issue.expected_total) * 100).toFixed(2)
        : "0.00";
      return [
        issue.shipment_id,
        issue.awb_number,
        issue.shipment_date?.slice(0, 10),
        issue.carrier,
        issue.shipment_type,
        issue.payment_mode,
        issue.destination_zone,
        issue.billed_zone,
        issue.actual_weight_slab,
        issue.billed_weight_slab,
        issue.contracted_rate,
        issue.billed_rate,
        issue.expected_cod,
        issue.cod_charge,
        issue.expected_rto,
        issue.rto_charge,
        issue.misc_charges,
        issue.expected_total,
        issue.total_billed,
        issue.total_overcharge,
        `${overchargePct}%`,
        issue.violation_types.map(humanize).join("; "),
      ].map(csvEscape).join(",");
    });

    const csvString = [headers.join(","), ...csvRows].join("\n");

    return new NextResponse(csvString, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="mosaic-overbilling-issues.csv"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new NextResponse(message, { status: 500 });
  }
}
