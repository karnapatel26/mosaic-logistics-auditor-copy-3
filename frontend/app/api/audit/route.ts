import { NextResponse } from "next/server";
import { getCachedAnalysis } from "@/lib/cache";

export const maxDuration = 60;

export async function GET() {
  try {
    const result = await getCachedAnalysis();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unable to load audit data.";
    console.error("[/api/audit] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
