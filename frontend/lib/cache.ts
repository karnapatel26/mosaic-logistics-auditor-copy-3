/**
 * lib/cache.ts
 *
 * Module-level in-memory cache + Redis for the reconciliation result.
 *
 * Vercel Serverless environments benefit from Redis to avoid cache drift
 * across instances. We use Upstash Redis, falling back to local memory if
 * environment variables are not provided.
 */

import { getAllData } from "./fetchData";
import { reconcileAll, type ReconciliationResult } from "./reconciliation";
import { Redis } from "@upstash/redis";

const CACHE_TTL_S = 10 * 60; // 10 minutes
const CACHE_TTL_MS = CACHE_TTL_S * 1000;

// Local memory fallback
let cachedResult: ReconciliationResult | null = null;
let cacheTimestamp = 0;
let inFlightAnalysis: Promise<ReconciliationResult> | null = null;

// Initialize Upstash Redis if credentials are present
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Fetches and reconciles source data once because both summary and issue
// routes need the same expensive analysis result.
async function computeAnalysis(): Promise<ReconciliationResult> {
  const { shipments, rateCards } = await getAllData();
  const result = reconcileAll(shipments, rateCards);

  // Cache the completed carrier billing audit, not raw API pages, so every
  // dashboard route reads the same reconciled numbers.
  if (redis) {
    try {
      await redis.setex("audit_reconciliation_result", CACHE_TTL_S, result);
    } catch (e) {
      console.warn("[Cache] Failed to set Redis cache:", e);
    }
  }

  cachedResult = result;
  cacheTimestamp = Date.now();
  return result;
}

// Returns cached reconciliation data so API routes avoid refetching and
// recalculating thousands of rows on every dashboard request.
export async function getCachedAnalysis(): Promise<ReconciliationResult> {
  const now = Date.now();

  // 1. Try Redis first to prevent drift across Vercel functions
  if (redis) {
    try {
      const cached = await redis.get<ReconciliationResult>("audit_reconciliation_result");
      if (cached) {
        return cached;
      }
    } catch (e) {
      console.warn("[Cache] Failed to get from Redis cache, falling back to local memory:", e);
    }
  }

  // 2. Try local memory fallback
  if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  // 3. Request collapsing (prevent multiple parallel fetches)
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
