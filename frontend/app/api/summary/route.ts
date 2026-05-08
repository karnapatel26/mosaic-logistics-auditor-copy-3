import { NextResponse } from "next/server";
import { getCachedAnalysis } from "@/lib/cache";

export const maxDuration = 60;

export async function GET() {
  try {
    const result = await getCachedAnalysis();
    return NextResponse.json({
      summary: result.summary,
      by_carrier: result.by_carrier,
      by_error_type: result.by_error_type,
      filter_options: result.filter_options,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/summary] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
