/**
 * lib/cache.ts
 *
 * Module-level in-memory cache for the reconciliation result.
 *
 * Why this works on Vercel:
 *   Vercel keeps serverless function instances "warm" between requests.
 *   Module-level variables persist for the lifetime of that warm instance.
 *   A 10-minute TTL ensures data freshness while avoiding a costly re-fetch
 *   (8,000+ API rows) on every single page load.
 *
 * Important caveat:
 *   Different warm instances do NOT share memory — each will cold-start once.
 *   This is acceptable: the first request per instance pays the fetch cost;
 *   all subsequent requests within 10 min are served from cache.
 */

import { getAllData } from "./fetchData";
import { reconcileAll, type ReconciliationResult } from "./reconciliation";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedResult: ReconciliationResult | null = null;
let cacheTimestamp = 0;
let inFlightAnalysis: Promise<ReconciliationResult> | null = null;

// Fetches and reconciles source data once because both summary and issue
// routes need the same expensive analysis result.
async function computeAnalysis() {
  const { shipments, rateCards } = await getAllData();
  const result = reconcileAll(shipments, rateCards);
  cachedResult = result;
  cacheTimestamp = Date.now();
  return result;
}

// Returns cached reconciliation data so API routes avoid refetching and
// recalculating thousands of rows on every dashboard request.
export async function getCachedAnalysis(): Promise<ReconciliationResult> {
  const now = Date.now();

  if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  if (inFlightAnalysis) {
    return inFlightAnalysis;
  }

  inFlightAnalysis = computeAnalysis();

  try {
    return await inFlightAnalysis;
  } finally {
    inFlightAnalysis = null;
  }
}
