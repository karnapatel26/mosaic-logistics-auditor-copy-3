import { NextRequest, NextResponse } from "next/server";
import { getCachedAnalysis } from "@/lib/cache";
import { buildOverbillingCsv } from "@/lib/exportCsv";
import type { ReconciledShipment } from "@/lib/reconciliation";

export const maxDuration = 60;

function matches(issue: ReconciledShipment, searchParams: URLSearchParams) {
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  return (
    (!searchParams.get("carrier") || issue.carrier === searchParams.get("carrier")) &&
    (!searchParams.get("errorType") || issue.error_reasons.includes(searchParams.get("errorType") ?? "")) &&
    (!searchParams.get("zone") || issue.destination_zone === searchParams.get("zone")) &&
    (!searchParams.get("paymentMode") || issue.payment_mode === searchParams.get("paymentMode")) &&
    (!searchParams.get("deliveryStatus") || issue.delivery_status === searchParams.get("deliveryStatus")) &&
    (!search ||
      issue.shipment_id.toLowerCase().includes(search) ||
      issue.awb_number.toLowerCase().includes(search))
  );
}

export async function GET(request: NextRequest) {
  try {
    const result = await getCachedAnalysis();
    const rows = result.issues.filter((issue) => matches(issue, request.nextUrl.searchParams));
    return new NextResponse(buildOverbillingCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mosaic-overbilling-issues.csv"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new NextResponse(message, { status: 500 });
  }
}
