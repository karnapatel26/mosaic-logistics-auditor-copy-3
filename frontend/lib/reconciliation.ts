/**
 * lib/reconciliation.ts
 *
 * Core billing-reconciliation engine.
 *
 * Design decisions:
 *  - buildRateIndex() constructs a Map<"Carrier|Zone|WeightSlab", RateCard>
 *    for O(1) lookups instead of O(n) scans per shipment.
 *  - detectViolations() runs every rule in a single pass per shipment.
 *  - decimal.js is used for all currency math to avoid floating point errors.
 *  - reconcileAll() aggregates results into metrics suitable for charting.
 */

import { Decimal } from "decimal.js";
import type { Shipment, RateCard } from "./fetchData";

// Helper to convert any number/string into a Decimal
function d(value: number | string | Decimal): Decimal {
  return new Decimal(value);
}

// Rounds money and percentages to 2 decimal places as numbers
function r2(n: number | Decimal): number {
  return d(n).toDecimalPlaces(2).toNumber();
}

// Builds the shared rate lookup key
function rateKey(carrier: string, zone: string, weightSlab: string) {
  return `${carrier}|${zone}|${weightSlab}`;
}

// Calculates a safe percentage
function pct(part: number, total: number) {
  return total ? r2(d(part).dividedBy(total).times(100)) : 0;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface Violation {
  type: string;
  overcharge: number | null;
  [key: string]: unknown;
}

export interface ReconciledShipment {
  shipment_id: string;
  awb_number: string;
  carrier: string;
  shipment_type: string;
  payment_mode: string;
  destination_zone: string;
  billed_zone: string;
  actual_weight_slab: string;
  billed_weight_slab: string;
  shipment_date: string;
  delivered: number;
  total_billed: number;
  contracted_rate: number;
  billed_rate: number;
  cod_charge: number;
  rto_charge: number;
  misc_charges: number;
  expected_cod: number;
  expected_rto: number;
  expected_total: number;
  violations: Violation[];
  violation_types: string[];
  total_overcharge: number;
  is_overcharged: boolean;
}

export interface CarrierStats {
  shipment_count: number;
  overcharged_count: number;
  total_billed: number;
  total_overcharge: number;
  overcharge_pct: number;
  hit_rate_pct: number;
}

export interface ViolationStats {
  count: number;
  total_overcharge: number;
}

export interface SegmentStats {
  count: number;
  overcharged_count: number;
  total_overcharge: number;
  hit_rate: string;
}

export interface ReconciliationResult {
  summary: {
    total_shipments: number;
    overcharged_count: number;
    overcharge_rate_pct: number;
    total_billed: number;
    total_overcharge: number;
    overcharge_pct_of_spend: number;
  };
  by_carrier: Record<string, CarrierStats>;
  by_violation_type: Record<string, ViolationStats>;
  by_zone: Record<string, SegmentStats>;
  by_weight_range: Record<string, Omit<SegmentStats, "hit_rate">>;
  by_carrier_zone: Record<string, Record<string, SegmentStats>>;
  issues: ReconciledShipment[];
}

// ─── Rate-card index ──────────────────────────────────────────────────────────

export function buildRateIndex(rateCards: RateCard[]): Map<string, RateCard> {
  const index = new Map<string, RateCard>();
  for (const rate of rateCards) {
    const key = rateKey(rate.carrier, rate.zone, rate.weight_slab);
    index.set(key, rate);
  }
  return index;
}

// ─── Violation detection ──────────────────────────────────────────────────────

function detectViolations(shipment: Shipment, rateIndex: Map<string, RateCard>): Violation[] {
  const violations: Violation[] = [];

  const correctKey = rateKey(shipment.carrier, shipment.destination_zone, shipment.actual_weight_slab);
  const rate = rateIndex.get(correctKey);

  if (!rate) {
    return [
      {
        type: "MISSING_RATE_CARD",
        detail: `No contracted rate for: ${correctKey}`,
        overcharge: null,
      },
    ];
  }

  const sContracted = d(shipment.contracted_rate);
  const sBilledRate = d(shipment.billed_rate);
  const sCodCharge = d(shipment.cod_charge);
  const sRtoCharge = d(shipment.rto_charge);
  const sMiscCharges = d(shipment.misc_charges);
  const sTotalBilled = d(shipment.total_billed);

  // 1. Contracted-rate integrity
  if (!sContracted.equals(rate.base_rate)) {
    const delta = sContracted.minus(rate.base_rate);
    violations.push({
      type: "CONTRACTED_RATE_TAMPERED",
      rate_card_rate: rate.base_rate,
      shipment_contracted_rate: shipment.contracted_rate,
      delta: r2(delta),
      overcharge: r2(Decimal.max(0, delta)),
    });
  }

  const expectedRto = shipment.shipment_type === "RTO" ? sContracted.times(rate.rto_multiplier) : d(0);

  // 2. Weight-slab inflation
  if (shipment.actual_weight_slab !== shipment.billed_weight_slab) {
    violations.push({
      type: "WEIGHT_SLAB_INFLATION",
      actual_slab: shipment.actual_weight_slab,
      billed_slab: shipment.billed_weight_slab,
      overcharge: r2(Decimal.max(0, sBilledRate.minus(sContracted))),
    });
  }

  // 3. Zone upgrade
  if (shipment.destination_zone !== shipment.billed_zone) {
    violations.push({
      type: "ZONE_UPGRADE",
      actual_zone: shipment.destination_zone,
      billed_zone: shipment.billed_zone,
      overcharge: r2(Decimal.max(0, sBilledRate.minus(sContracted))),
    });
  }

  // 4. Base-rate manipulation
  const zoneOk = shipment.destination_zone === shipment.billed_zone;
  const slabOk = shipment.actual_weight_slab === shipment.billed_weight_slab;
  if (zoneOk && slabOk && !sBilledRate.equals(sContracted)) {
    violations.push({
      type: "BASE_RATE_MANIPULATION",
      expected_rate: shipment.contracted_rate,
      billed_rate: shipment.billed_rate,
      overcharge: r2(sBilledRate.minus(sContracted)),
    });
  }

  // 5. COD fee mismatch
  if (shipment.payment_mode === "COD" && !sCodCharge.equals(rate.cod_fee)) {
    violations.push({
      type: "COD_FEE_MISMATCH",
      expected_cod: rate.cod_fee,
      billed_cod: shipment.cod_charge,
      overcharge: r2(sCodCharge.minus(rate.cod_fee)),
    });
  }

  // 6. Phantom COD
  if (shipment.payment_mode === "Prepaid" && sCodCharge.greaterThan(0)) {
    violations.push({
      type: "PHANTOM_COD_ON_PREPAID",
      billed_cod: shipment.cod_charge,
      overcharge: r2(sCodCharge),
    });
  }

  // 7. RTO multiplier mismatch
  if (shipment.shipment_type === "RTO" && !sRtoCharge.equals(expectedRto)) {
    violations.push({
      type: "RTO_MULTIPLIER_MISMATCH",
      expected_rto: r2(expectedRto),
      billed_rto: shipment.rto_charge,
      rto_multiplier_used: rate.rto_multiplier,
      overcharge: r2(sRtoCharge.minus(expectedRto)),
    });
  }

  // 8. Phantom RTO on Delivered
  if (shipment.shipment_type === "Forward" && shipment.delivered === 1 && sRtoCharge.greaterThan(0)) {
    violations.push({
      type: "PHANTOM_RTO_ON_DELIVERED",
      billed_rto: shipment.rto_charge,
      overcharge: r2(sRtoCharge),
    });
  }

  // 9. Phantom RTO on Undelivered (New Rule)
  if (shipment.shipment_type === "Forward" && shipment.delivered === 0 && sRtoCharge.greaterThan(0)) {
    violations.push({
      type: "PHANTOM_RTO_ON_UNDELIVERED",
      billed_rto: shipment.rto_charge,
      overcharge: r2(sRtoCharge),
    });
  }

  // 10. Unauthorized RTO
  if (shipment.shipment_type === "Reverse Pickup" && sRtoCharge.greaterThan(0)) {
    violations.push({
      type: "UNAUTHORIZED_RTO_ON_REVERSE_PICKUP",
      billed_rto: shipment.rto_charge,
      overcharge: r2(sRtoCharge),
    });
  }

  // 11. Uncontracted misc charges
  if (sMiscCharges.greaterThan(0)) {
    violations.push({
      type: "UNCONTRACTED_MISC_CHARGES",
      misc_charges: shipment.misc_charges,
      overcharge: r2(sMiscCharges),
    });
  }

  // 12. Tax Discrepancy (GST Check)
  // Total Billed should roughly equal sum of charges + 18% GST
  const sumOfCharges = sBilledRate.plus(sCodCharge).plus(sRtoCharge).plus(sMiscCharges);
  const expectedTotalWithTax = sumOfCharges.times(1.18);
  
  // Allow a small tolerance for rounding differences in tax computation by carriers (e.g. ₹1)
  if (sTotalBilled.minus(expectedTotalWithTax).abs().greaterThan(1.0)) {
    violations.push({
      type: "TAX_DISCREPANCY",
      expected_total_with_tax: r2(expectedTotalWithTax),
      actual_total_billed: shipment.total_billed,
      overcharge: r2(Decimal.max(0, sTotalBilled.minus(expectedTotalWithTax))),
    });
  }

  return violations;
}

// ─── Per-shipment reconciliation ──────────────────────────────────────────────

function reconcileShipment(shipment: Shipment, rateIndex: Map<string, RateCard>): ReconciledShipment {
  const violations = detectViolations(shipment, rateIndex);
  
  const correctKey = rateKey(shipment.carrier, shipment.destination_zone, shipment.actual_weight_slab);
  const rate = rateIndex.get(correctKey);
  
  const expectedCod = rate && shipment.payment_mode === "COD" ? rate.cod_fee : 0;
  const expectedRto = rate && shipment.shipment_type === "RTO"
    ? r2(d(shipment.contracted_rate).times(rate.rto_multiplier))
    : 0;
    
  // Includes 18% GST to accurately reflect expected total cost
  const expectedTotal = r2(d(shipment.contracted_rate).plus(expectedCod).plus(expectedRto).times(1.18));
  
  const totalOvercharge = violations.reduce(
    (sum, v) => sum.plus(typeof v.overcharge === "number" ? v.overcharge : 0),
    d(0)
  );

  return {
    shipment_id: shipment.shipment_id,
    awb_number: shipment.awb_number,
    carrier: shipment.carrier,
    shipment_type: shipment.shipment_type,
    payment_mode: shipment.payment_mode,
    destination_zone: shipment.destination_zone,
    billed_zone: shipment.billed_zone,
    actual_weight_slab: shipment.actual_weight_slab,
    billed_weight_slab: shipment.billed_weight_slab,
    shipment_date: shipment.shipment_date,
    delivered: shipment.delivered,
    total_billed: shipment.total_billed,
    contracted_rate: shipment.contracted_rate,
    billed_rate: shipment.billed_rate,
    cod_charge: shipment.cod_charge,
    rto_charge: shipment.rto_charge,
    misc_charges: shipment.misc_charges,
    expected_cod: expectedCod,
    expected_rto: expectedRto,
    expected_total: expectedTotal,
    violations,
    violation_types: violations.map((v) => v.type),
    total_overcharge: r2(totalOvercharge),
    is_overcharged: totalOvercharge.greaterThan(0),
  };
}

const WEIGHT_BUCKETS = ["0-1kg", "1-2kg", "2-5kg", "5-10kg", "10kg+"] as const;

function weightBucket(weightSlab: string): typeof WEIGHT_BUCKETS[number] {
  const numbers = weightSlab.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const upper = numbers.length > 1 ? Math.max(...numbers) : numbers[0] ?? 0;

  if (upper <= 1) return "0-1kg";
  if (upper <= 2) return "1-2kg";
  if (upper <= 5) return "2-5kg";
  if (upper <= 10) return "5-10kg";
  return "10kg+";
}

function hitRate(overcharged: number, total: number): string {
  return `${pct(overcharged, total)}%`;
}

function emptySegment(): SegmentStats {
  return { count: 0, overcharged_count: 0, total_overcharge: 0, hit_rate: "0%" };
}

function emptyCarrier(): CarrierStats {
  return {
    shipment_count: 0,
    overcharged_count: 0,
    total_billed: 0,
    total_overcharge: 0,
    overcharge_pct: 0,
    hit_rate_pct: 0,
  };
}

function getSegment(segments: Record<string, SegmentStats>, key: string) {
  segments[key] ??= emptySegment();
  return segments[key];
}

function addSegmentTotals(segment: SegmentStats, row: ReconciledShipment) {
  segment.count++;
  segment.total_overcharge = r2(d(segment.total_overcharge).plus(row.total_overcharge));
  if (row.is_overcharged) segment.overcharged_count++;
}

function finalizeSegment(segment: SegmentStats) {
  segment.total_overcharge = r2(segment.total_overcharge);
  segment.hit_rate = hitRate(segment.overcharged_count, segment.count);
}

// ─── Full reconciliation ──────────────────────────────────────────────────────

export function reconcileAll(shipments: Shipment[], rateCards: RateCard[]): ReconciliationResult {
  const rateIndex = buildRateIndex(rateCards);
  const reconciled = shipments.map((s) => reconcileShipment(s, rateIndex));

  const byCarrier: Record<string, CarrierStats> = {};
  const byViolationType: Record<string, ViolationStats> = {};
  const byZone: Record<string, SegmentStats> = {};
  const byWeightRange: Record<string, Omit<SegmentStats, "hit_rate">> = Object.fromEntries(
    WEIGHT_BUCKETS.map((bucket) => [bucket, { count: 0, overcharged_count: 0, total_overcharge: 0 }])
  );
  const byCarrierZone: Record<string, Record<string, SegmentStats>> = {};
  
  let totalBilled = d(0);
  let totalOvercharge = d(0);
  let overchargedCount = 0;

  for (const r of reconciled) {
    totalBilled = totalBilled.plus(r.total_billed);
    totalOvercharge = totalOvercharge.plus(r.total_overcharge);
    if (r.is_overcharged) overchargedCount++;

    byCarrier[r.carrier] ??= emptyCarrier();
    const c = byCarrier[r.carrier];
    c.shipment_count++;
    c.total_billed = r2(d(c.total_billed).plus(r.total_billed));
    c.total_overcharge = r2(d(c.total_overcharge).plus(r.total_overcharge));
    if (r.is_overcharged) c.overcharged_count++;

    const z = getSegment(byZone, r.destination_zone);
    addSegmentTotals(z, r);

    const bucket = weightBucket(r.actual_weight_slab);
    const w = byWeightRange[bucket];
    w.count++;
    w.total_overcharge = r2(d(w.total_overcharge).plus(r.total_overcharge));
    if (r.is_overcharged) w.overcharged_count++;

    if (!byCarrierZone[r.carrier]) byCarrierZone[r.carrier] = {};
    const cz = getSegment(byCarrierZone[r.carrier], r.destination_zone);
    addSegmentTotals(cz, r);

    // Violation-type aggregation
    for (const v of r.violations) {
      if (!byViolationType[v.type]) {
        byViolationType[v.type] = { count: 0, total_overcharge: 0 };
      }
      byViolationType[v.type].count++;
      byViolationType[v.type].total_overcharge = r2(
        d(byViolationType[v.type].total_overcharge).plus(v.overcharge ?? 0)
      );
    }
  }

  // Finalize carrier stats
  for (const carrier of Object.keys(byCarrier)) {
    const c = byCarrier[carrier];
    c.overcharge_pct = pct(c.total_overcharge, c.total_billed);
    c.hit_rate_pct = pct(c.overcharged_count, c.shipment_count);
  }

  for (const zone of Object.keys(byZone)) {
    finalizeSegment(byZone[zone]);
  }

  for (const carrier of Object.keys(byCarrierZone)) {
    for (const zone of Object.keys(byCarrierZone[carrier])) {
      finalizeSegment(byCarrierZone[carrier][zone]);
    }
  }

  return {
    summary: {
      total_shipments: reconciled.length,
      overcharged_count: overchargedCount,
      overcharge_rate_pct: pct(overchargedCount, reconciled.length),
      total_billed: r2(totalBilled),
      total_overcharge: r2(totalOvercharge),
      overcharge_pct_of_spend: pct(r2(totalOvercharge), r2(totalBilled)),
    },
    by_carrier: byCarrier,
    by_violation_type: byViolationType,
    by_zone: byZone,
    by_weight_range: byWeightRange,
    by_carrier_zone: byCarrierZone,
    issues: reconciled.filter((r) => r.is_overcharged),
  };
}
