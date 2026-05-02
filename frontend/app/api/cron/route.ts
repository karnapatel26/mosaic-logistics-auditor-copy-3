/**
 * app/api/cron/route.ts
 *
 * GET /api/cron
 *
 * This endpoint is triggered by Vercel Cron once per hour.
 * It pre-warms the cache by fetching all shipments and performing
 * the reconciliation. Because we use Upstash Redis, the result
 * is stored globally and shared across all Vercel serverless instances,
 * ensuring users always hit a warm, instant cache.
 */

import { NextResponse } from "next/server";
import { getCachedAnalysis } from "@/lib/cache";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    // Optional: verify cron secret if you configure it in Vercel settings
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) ...

    const result = await getCachedAnalysis();
    
    return NextResponse.json({ 
      success: true, 
      message: "Cache warmed successfully.",
      timestamp: new Date().toISOString(),
      issues_found: result.summary.overcharged_count
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cron] Cache warm failed:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
