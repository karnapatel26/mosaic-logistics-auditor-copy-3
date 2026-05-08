import { Decimal } from "decimal.js";
import type { RawRateCard, RawShipment } from "./fetchData";

const UNKNOWN = "Unknown";
const MONEY_PLACES = 2;

function money(value: unknown): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  try {
    const parsed = new Decimal(String(value).replace(/[₹,\s]/g, ""));
    return parsed.isFinite() ? parsed : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

function r2(value: Decimal | number): number {
  return new Decimal(value).toDecimalPlaces(MONEY_PLACES).toNumber();
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeText(value: unknown, fallback = UNKNOWN): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeCarrier(value: unknown): string {
  return safeText(value)
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeZone(value: unknown): string {
  return safeText(value).replace(/\s+/g, " ");
}

function normalizePayment(value: unknown): string {
  const text = safeText(value).toLowerCase();
  if (text.includes("cod")) return "COD";
  if (text.includes("prepaid") || text.includes("pre-paid")) return "Prepaid";
  return safeText(value);
}

function normalizeService(value: unknown): string {
  const text = safeText(value).toLowerCase();
  if (text.includes("rto") || text.includes("return")) return "RTO";
  if (text.includes("reverse")) return "Reverse Pickup";
  if (text.includes("forward")) return "Forward";
  return safeText(value);
}

function normalizeSlab(value: unknown): string {
  return safeText(value).replace(/\s+/g, "").replace(/KG/g, "kg");
}

function weightPartToKg(value: string): number {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;

  const amount = toFiniteNumber(match[0]);

  return normalized.includes("g") && !normalized.includes("kg")
    ? amount / 1000
    : amount;
}

function weightSlabToKg(value: unknown): number {
  const slab = normalizeSlab(value);
  const upperBound = slab.split("-").at(-1) ?? slab;
  return r2(weightPartToKg(upperBound));
}

function normalizeDelivered(value: unknown): number {
  if (value === true) return 1;
  const text = safeText(value, "0").toLowerCase();
  return text === "1" || text === "delivered" || text === "true" ? 1 : 0;
}

function pct(part: number, total: number) {
  return total ? r2(new Decimal(part).dividedBy(total).times(100)) : 0;
}

function rateKey(carrier: string, zone: string, slab: string) {
  return `${carrier.toLowerCase()}|${zone.toLowerCase()}|${slab.toLowerCase()}`;
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export interface Shipment {
  shipment_id: string;
  awb_number: string;
  carrier: string;
  origin_warehouse: string;
  destination_zone: string;
  billed_zone: string;
  actual_weight_slab: string;
  billed_weight_slab: string;
  actual_weight_kg: number;
  billed_weight_kg: number;
  shipment_type: string;
  payment_mode: string;
  shipment_date: string;
  delivered: number;
  contracted_rate: number;
  billed_rate: number;
  cod_charge: number;
  rto_charge: number;
  misc_charges: number;
  total_billed: number;
}

export interface RateCard {
  carrier: string;
  zone: string;
  weight_slab: string;
  weight_kg: number;
  base_rate: number;
  cod_fee: number;
  rto_multiplier: number;
  service_type: string;
  payment_mode: string;
}

export type AuditStatus = "Overbilled" | "Correct" | "Underbilled/Discounted" | "Rate Card Match Missing";

export interface ReconciledShipment {
  shipment_id: string;
  awb_number: string;
  carrier: string;
  origin_warehouse: string;
  shipment_type: string;
  payment_mode: string;
  shipment_date: string;
  delivered: number;
  delivery_status: string;
  destination_zone: string;
  billed_zone: string;
  actual_weight_slab: string;
  billed_weight_slab: string;
  actual_weight_kg: number;
  billed_weight_kg: number;
  contracted_rate: number;
  billed_rate: number;
  cod_charge: number;
  rto_charge: number;
  misc_charges: number;
  billed_charge: number;
  expected_charge: number;
  overcharge: number;
  status: AuditStatus;
  error_reasons: string[];
  primary_error: string;
  matched_rate: RateCard | null;
}

export interface CarrierStats {
  carrier: string;
  shipment_count: number;
  affected_shipments: number;
  overbilled_count: number;
  violation_events: number;
  total_billed: number;
  total_expected: number;
  total_overcharge: number;
  average_overcharge: number;
  overbilling_rate_pct: number;
  most_common_violation_type: string;
}

export interface ErrorStats {
  error_type: string;
  affected_shipments: number;
  violation_events: number;
  count: number;
  total_overcharge: number;
}

export interface ReconciliationResult {
  summary: {
    total_shipments: number;
    total_billed: number;
    total_expected: number;
    total_potential_overbilling: number;
    overbilling_percentage: number;
    affected_shipments: number;
    overbilled_shipments: number;
    final_billed_total_mismatches: number;
    violation_events: number;
    correct_shipments: number;
    underbilled_shipments: number;
    worst_carrier: string;
    most_common_error_type: string;
    highest_impact_error_type: string;
  };
  shipments: ReconciledShipment[];
  issues: ReconciledShipment[];
  by_carrier: Record<string, CarrierStats>;
  by_error_type: Record<string, ErrorStats>;
  filter_options: {
    carriers: string[];
    errorTypes: string[];
    zones: string[];
    paymentModes: string[];
    deliveryStatuses: string[];
  };
}

export function normalizeShipment(raw: RawShipment = {}): Shipment {
  const actualWeightSlab = normalizeSlab(raw.actual_weight_slab);
  const billedWeightSlab = normalizeSlab(raw.billed_weight_slab ?? raw.actual_weight_slab);

  return {
    shipment_id: safeText(raw.shipment_id, "Missing shipment ID"),
    awb_number: safeText(raw.awb_number, "Missing AWB"),
    carrier: normalizeCarrier(raw.carrier),
    origin_warehouse: safeText(raw.origin_warehouse),
    destination_zone: normalizeZone(raw.destination_zone),
    billed_zone: normalizeZone(raw.billed_zone ?? raw.destination_zone),
    actual_weight_slab: actualWeightSlab,
    billed_weight_slab: billedWeightSlab,
    actual_weight_kg: weightSlabToKg(actualWeightSlab),
    billed_weight_kg: weightSlabToKg(billedWeightSlab),
    shipment_type: normalizeService(raw.shipment_type),
    payment_mode: normalizePayment(raw.payment_mode),
    shipment_date: safeText(raw.shipment_date, ""),
    delivered: normalizeDelivered(raw.delivered),
    contracted_rate: r2(money(raw.contracted_rate)),
    billed_rate: r2(money(raw.billed_rate)),
    cod_charge: r2(money(raw.cod_charge)),
    rto_charge: r2(money(raw.rto_charge)),
    misc_charges: r2(money(raw.misc_charges)),
    total_billed: r2(money(raw.total_billed)),
  };
}

export function normalizeRateCard(raw: RawRateCard = {}): RateCard {
  const weightSlab = normalizeSlab(raw.weight_slab);

  return {
    carrier: normalizeCarrier(raw.carrier),
    zone: normalizeZone(raw.zone),
    weight_slab: weightSlab,
    weight_kg: weightSlabToKg(weightSlab),
    base_rate: r2(money(raw.base_rate)),
    cod_fee: r2(money(raw.cod_fee)),
    rto_multiplier: r2(money(raw.rto_multiplier)),
    service_type: normalizeService(raw.service_type ?? ""),
    payment_mode: normalizePayment(raw.payment_mode ?? ""),
  };
}

export function buildRateIndex(rateCards: RateCard[]) {
  const index = new Map<string, RateCard[]>();
  for (const rate of rateCards) {
    const key = rateKey(rate.carrier, rate.zone, rate.weight_slab);
    const rates = index.get(key) ?? [];
    rates.push(rate);
    index.set(key, rates);
  }
  return index;
}

function matchesOptionalRateFields(shipment: Shipment, rate: RateCard) {
  const serviceMatches = rate.service_type === UNKNOWN || rate.service_type === shipment.shipment_type;
  const paymentMatches = rate.payment_mode === UNKNOWN || rate.payment_mode === shipment.payment_mode;
  return serviceMatches && paymentMatches;
}

function findMatchingRate(shipment: Shipment, rateIndex: Map<string, RateCard[]>): RateCard | null {
  const candidates = rateIndex.get(rateKey(
    shipment.carrier,
    shipment.destination_zone,
    shipment.actual_weight_slab,
  )) ?? [];

  return candidates.find((rate) => matchesOptionalRateFields(shipment, rate)) ?? null;
}

function expectedRtoCharge(shipment: Shipment, rate: RateCard) {
  return shipment.shipment_type === "RTO"
    ? new Decimal(r2(new Decimal(rate.base_rate).times(rate.rto_multiplier)))
    : new Decimal(0);
}

function centsEqual(left: Decimal | number, right: Decimal | number) {
  return r2(left) === r2(right);
}

function classifyReasons(shipment: Shipment, expected: Decimal, rate: RateCard | null): string[] {
  const reasons: string[] = [];

  if (!rate) {
    return ["Rate Card Match Missing"];
  }

  if (shipment.actual_weight_kg !== shipment.billed_weight_kg) {
    addReason(reasons, "Weight slab mismatch");
  }

  if (shipment.destination_zone !== shipment.billed_zone) {
    addReason(reasons, "Zone mismatch");
  }

  const expectedCod = shipment.payment_mode === "COD" ? new Decimal(rate.cod_fee) : new Decimal(0);
  if (!centsEqual(shipment.cod_charge, expectedCod)) {
    addReason(reasons, "COD/payment charge mismatch");
  }

  if (!["Forward", "RTO", "Reverse Pickup", UNKNOWN].includes(shipment.shipment_type)) {
    addReason(reasons, "Service type mismatch");
  }

  if (new Decimal(shipment.misc_charges).greaterThan(0)) {
    addReason(reasons, "Extra charge/surcharge mismatch");
  }

  const expectedRto = expectedRtoCharge(shipment, rate);
  if (!centsEqual(shipment.rto_charge, expectedRto)) {
    addReason(reasons, "RTO/return charge mismatch");
  }

  const hasSpecificReason = reasons.length > 0;
  if (!centsEqual(shipment.total_billed, expected)) {
    if (!hasSpecificReason) addReason(reasons, "Unclassified");
  }

  return reasons.length ? reasons : ["No billing issue"];
}

function reconcileShipment(shipment: Shipment, rateIndex: Map<string, RateCard[]>): ReconciledShipment {
  const matchedRate = findMatchingRate(shipment, rateIndex);

  // Expected charge comes only from the matched contract row: carrier,
  // correct destination zone, correct actual weight slab, plus service
  // type/payment mode when those optional dimensions exist in the rate card.
  const expected = matchedRate
    ? new Decimal(matchedRate.base_rate)
        .plus(shipment.payment_mode === "COD" ? matchedRate.cod_fee : 0)
        .plus(expectedRtoCharge(shipment, matchedRate))
    : new Decimal(0);

  // Billed charge is the shipment invoice total; variance is the audit delta.
  // Positive variance is overbilling, zero is correct, negative is a discount.
  const billed = new Decimal(shipment.total_billed);
  const variance = billed.minus(expected);
  const expectedCharge = r2(expected);
  const overcharge = r2(variance);
  const roundedVariance = new Decimal(overcharge);

  const status: AuditStatus = !matchedRate
    ? "Rate Card Match Missing"
    : roundedVariance.greaterThan(0)
      ? "Overbilled"
      : roundedVariance.lessThan(0)
        ? "Underbilled/Discounted"
        : "Correct";

  const reasons = classifyReasons(shipment, expected, matchedRate);

  return {
    ...shipment,
    delivery_status: shipment.delivered ? "Delivered" : "Not delivered",
    billed_charge: shipment.total_billed,
    expected_charge: expectedCharge,
    overcharge,
    status,
    error_reasons: reasons,
    primary_error: reasons[0] ?? "Rate Card Match Missing",
    matched_rate: matchedRate,
  };
}

function emptyCarrier(carrier: string): CarrierStats {
  return {
    carrier,
    shipment_count: 0,
    affected_shipments: 0,
    overbilled_count: 0,
    violation_events: 0,
    total_billed: 0,
    total_expected: 0,
    total_overcharge: 0,
    average_overcharge: 0,
    overbilling_rate_pct: 0,
    most_common_violation_type: "None",
  };
}

function computeSummary(shipments: ReconciledShipment[]): ReconciliationResult {
  const byCarrier: Record<string, CarrierStats> = {};
  const carrierViolationCounts: Record<string, Record<string, number>> = {};
  const byErrorType: Record<string, ErrorStats> = {};
  let totalBilled = new Decimal(0);
  let totalExpected = new Decimal(0);
  let totalPotentialOverbilling = new Decimal(0);
  let overbilledCount = 0;
  let finalBilledTotalMismatchCount = 0;
  let violationEventCount = 0;
  let correctCount = 0;
  let underbilledCount = 0;

  for (const shipment of shipments) {
    const positiveOvercharge = Math.max(0, shipment.overcharge);
    totalBilled = totalBilled.plus(shipment.billed_charge);
    totalExpected = totalExpected.plus(shipment.expected_charge);
    totalPotentialOverbilling = totalPotentialOverbilling.plus(positiveOvercharge);

    if (shipment.status === "Overbilled") overbilledCount++;
    if (shipment.status === "Overbilled") finalBilledTotalMismatchCount++;
    if (shipment.status === "Correct") correctCount++;
    if (shipment.status === "Underbilled/Discounted") underbilledCount++;

    byCarrier[shipment.carrier] ??= emptyCarrier(shipment.carrier);
    const carrier = byCarrier[shipment.carrier];
    carrier.shipment_count++;
    carrier.total_billed = r2(new Decimal(carrier.total_billed).plus(shipment.billed_charge));
    carrier.total_expected = r2(new Decimal(carrier.total_expected).plus(shipment.expected_charge));
    carrier.total_overcharge = r2(new Decimal(carrier.total_overcharge).plus(positiveOvercharge));
    if (shipment.status === "Overbilled") {
      carrier.affected_shipments++;
      carrier.overbilled_count++;
    }

    if (shipment.status === "Overbilled") {
      const violationReasons = shipment.error_reasons.filter((reason) => reason !== "No billing issue");
      violationEventCount += violationReasons.length;
      carrier.violation_events += violationReasons.length;
      carrierViolationCounts[shipment.carrier] ??= {};

      for (const reason of violationReasons) {
        carrierViolationCounts[shipment.carrier][reason] =
          (carrierViolationCounts[shipment.carrier][reason] ?? 0) + 1;
        byErrorType[reason] ??= {
          error_type: reason,
          affected_shipments: 0,
          violation_events: 0,
          count: 0,
          total_overcharge: 0,
        };
        byErrorType[reason].affected_shipments++;
        byErrorType[reason].violation_events++;
        byErrorType[reason].count = byErrorType[reason].violation_events;
      }

      // Attribute money once per shipment to its primary reason. This keeps
      // total overcharge from being duplicated when one shipment has multiple
      // violation events.
      const primaryReason = shipment.primary_error || "Unclassified";
      byErrorType[primaryReason] ??= {
        error_type: primaryReason,
        affected_shipments: 0,
        violation_events: 0,
        count: 0,
        total_overcharge: 0,
      };
      byErrorType[primaryReason].total_overcharge = r2(
        new Decimal(byErrorType[primaryReason].total_overcharge).plus(positiveOvercharge),
      );
    }
  }

  for (const carrier of Object.values(byCarrier)) {
    carrier.average_overcharge = carrier.overbilled_count
      ? r2(new Decimal(carrier.total_overcharge).dividedBy(carrier.overbilled_count))
      : 0;
    carrier.overbilling_rate_pct = pct(carrier.overbilled_count, carrier.shipment_count);
    const violationCounts = carrierViolationCounts[carrier.carrier] ?? {};
    carrier.most_common_violation_type =
      Object.entries(violationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None";
  }

  const carriers = Object.values(byCarrier);
  const errors = Object.values(byErrorType);
  const worstCarrier = [...carriers].sort((a, b) => b.total_overcharge - a.total_overcharge)[0];
  const mostCommonError = [...errors].sort((a, b) => b.count - a.count)[0];
  const highestImpactError = [...errors].sort((a, b) => b.total_overcharge - a.total_overcharge)[0];

  return {
    summary: {
      total_shipments: shipments.length,
      total_billed: r2(totalBilled),
      total_expected: r2(totalExpected),
      total_potential_overbilling: r2(totalPotentialOverbilling),
      overbilling_percentage: pct(r2(totalPotentialOverbilling), r2(totalBilled)),
      affected_shipments: overbilledCount,
      overbilled_shipments: overbilledCount,
      final_billed_total_mismatches: finalBilledTotalMismatchCount,
      violation_events: violationEventCount,
      correct_shipments: correctCount,
      underbilled_shipments: underbilledCount,
      worst_carrier: worstCarrier?.carrier ?? "None",
      most_common_error_type: mostCommonError?.error_type ?? "None",
      highest_impact_error_type: highestImpactError?.error_type ?? "None",
    },
    shipments,
    issues: shipments.filter((shipment) => shipment.status === "Overbilled"),
    by_carrier: byCarrier,
    by_error_type: byErrorType,
    filter_options: {
      carriers: [...new Set(shipments.map((s) => s.carrier))].sort(),
      errorTypes: [...new Set(shipments
        .filter((s) => s.status === "Overbilled")
        .flatMap((s) => s.error_reasons)
        .filter((reason) => reason !== "No billing issue"))].sort(),
      zones: [...new Set(shipments.map((s) => s.destination_zone))].sort(),
      paymentModes: [...new Set(shipments.map((s) => s.payment_mode))].sort(),
      deliveryStatuses: [...new Set(shipments.map((s) => s.delivery_status))].sort(),
    },
  };
}

export function reconcileAll(rawShipments: RawShipment[], rawRateCards: RawRateCard[]): ReconciliationResult {
  const shipments = rawShipments.map(normalizeShipment);
  const rateCards = rawRateCards.map(normalizeRateCard);
  const rateIndex = buildRateIndex(rateCards);
  const reconciled = shipments.map((shipment) => reconcileShipment(shipment, rateIndex));

  return computeSummary(reconciled);
}

export function summarizeShipments(shipments: ReconciledShipment[]): ReconciliationResult {
  return computeSummary(shipments);
}
