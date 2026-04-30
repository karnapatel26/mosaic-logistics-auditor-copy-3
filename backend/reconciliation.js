const EPSILON = 0.01;

// Rounds money and percentages because repeated decimal math can create
// tiny floating-point errors that should not show in audit totals.
function r2(n) {
  return Math.round(n * 100) / 100;
}

// Builds the shared rate lookup key so rate-card reads cannot drift
// between indexing, validation, and reconciliation.
function rateKey(carrier, zone, weightSlab) {
  return `${carrier}|${zone}|${weightSlab}`;
}

// Calculates a safe percentage because empty totals should display as
// zero rather than leaking NaN into API responses.
function pct(part, total) {
  return total ? r2((part / total) * 100) : 0;
}

const WEIGHT_BUCKETS = ["0-1kg", "1-2kg", "2-5kg", "5-10kg", "10kg+"];

// Groups detailed slab labels into stable chart buckets so the UI does
// not need to parse shipment weights on every render.
function weightBucket(weightSlab) {
  const numbers = String(weightSlab).match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  const upper = numbers.length > 1 ? Math.max(...numbers) : numbers[0] || 0;

  if (upper <= 1) return "0-1kg";
  if (upper <= 2) return "1-2kg";
  if (upper <= 5) return "2-5kg";
  if (upper <= 10) return "5-10kg";
  return "10kg+";
}

// Formats a hit rate for API consumers because tables display the value
// directly and should not repeat percentage math.
function hitRate(overcharged, total) {
  return `${pct(overcharged, total)}%`;
}

// Creates a fresh segment bucket so carriers, zones, and lanes do not
// accidentally share mutable aggregate objects.
function emptySegment() {
  return { count: 0, overcharged_count: 0, total_overcharge: 0, hit_rate: "0%" };
}

// Creates a fresh carrier bucket because each carrier needs independent
// totals before final percentages are calculated.
function emptyCarrier() {
  return {
    shipment_count: 0,
    overcharged_count: 0,
    total_billed: 0,
    total_overcharge: 0,
  };
}

// Returns an existing segment or creates it because aggregation loops
// should not repeat the same map-initialization checks.
function getSegment(segments, key) {
  segments[key] ||= emptySegment();
  return segments[key];
}

// Adds shipment totals to a segment because zone and lane buckets share
// the same counting rules.
function addSegmentTotals(segment, row) {
  segment.count++;
  segment.total_overcharge += row.total_overcharge;
  if (row.is_overcharged) segment.overcharged_count++;
}

// Finalizes segment totals after aggregation so percentages are rounded
// once instead of on every row.
function finalizeSegment(segment) {
  segment.total_overcharge = r2(segment.total_overcharge);
  segment.hit_rate = hitRate(segment.overcharged_count, segment.count);
}

// Builds an O(1) rate-card lookup so each shipment can be checked
// without scanning the full rate-card list.
function buildRateIndex(rateCards) {
  const index = new Map();
  for (const rate of rateCards) {
    const key = rateKey(rate.carrier, rate.zone, rate.weight_slab);
    index.set(key, rate);
  }
  return index;
}

// Detects every billing violation for one shipment in a single pass so
// the engine can capture multiple causes without repeated scans.
function detectViolations(shipment, rateIndex) {
  const violations = [];

  const correctKey = rateKey(shipment.carrier, shipment.destination_zone, shipment.actual_weight_slab);
  const rate = rateIndex.get(correctKey);

  if (!rate) {
    return [{
      type: 'MISSING_RATE_CARD',
      detail: `No contracted rate for: ${correctKey}`,
      overcharge: null,
    }];
  }

  if (Math.abs(shipment.contracted_rate - rate.base_rate) > EPSILON) {
    violations.push({
      type: 'CONTRACTED_RATE_TAMPERED',
      rate_card_rate: rate.base_rate,
      shipment_contracted_rate: shipment.contracted_rate,
      delta: r2(shipment.contracted_rate - rate.base_rate),
      overcharge: Math.max(0, r2(shipment.contracted_rate - rate.base_rate)),
    });
  }

  const expectedRto = shipment.shipment_type === 'RTO'
    ? r2(shipment.contracted_rate * rate.rto_multiplier)
    : 0;

  if (shipment.actual_weight_slab !== shipment.billed_weight_slab) {
    violations.push({
      type: 'WEIGHT_SLAB_INFLATION',
      actual_slab: shipment.actual_weight_slab,
      billed_slab: shipment.billed_weight_slab,
      overcharge: Math.max(0, r2(shipment.billed_rate - shipment.contracted_rate)),
    });
  }

  if (shipment.destination_zone !== shipment.billed_zone) {
    violations.push({
      type: 'ZONE_UPGRADE',
      actual_zone: shipment.destination_zone,
      billed_zone: shipment.billed_zone,
      overcharge: Math.max(0, r2(shipment.billed_rate - shipment.contracted_rate)),
    });
  }

  const zoneOk = shipment.destination_zone === shipment.billed_zone;
  const slabOk = shipment.actual_weight_slab === shipment.billed_weight_slab;

  if (zoneOk && slabOk && Math.abs(shipment.billed_rate - shipment.contracted_rate) > EPSILON) {
    violations.push({
      type: 'BASE_RATE_MANIPULATION',
      expected_rate: shipment.contracted_rate,
      billed_rate: shipment.billed_rate,
      overcharge: r2(shipment.billed_rate - shipment.contracted_rate),
    });
  }

  // COD mismatch
  if (shipment.payment_mode === 'COD'
      && Math.abs(shipment.cod_charge - rate.cod_fee) > EPSILON) {
    violations.push({
      type: 'COD_FEE_MISMATCH',
      expected_cod: rate.cod_fee,
      billed_cod: shipment.cod_charge,
      overcharge: r2(shipment.cod_charge - rate.cod_fee),
    });
  }

  // Phantom COD
  if (shipment.payment_mode === 'Prepaid' && shipment.cod_charge > 0) {
    violations.push({
      type: 'PHANTOM_COD_ON_PREPAID',
      billed_cod: shipment.cod_charge,
      overcharge: shipment.cod_charge,
    });
  }

  // RTO mismatch
  if (shipment.shipment_type === 'RTO'
      && Math.abs(shipment.rto_charge - expectedRto) > EPSILON) {
    violations.push({
      type: 'RTO_MULTIPLIER_MISMATCH',
      expected_rto: expectedRto,
      billed_rto: shipment.rto_charge,
      rto_multiplier_used: rate.rto_multiplier,
      overcharge: r2(shipment.rto_charge - expectedRto),
    });
  }

  // Phantom RTO
  if (shipment.shipment_type === 'Forward'
      && shipment.delivered === 1
      && shipment.rto_charge > 0) {
    violations.push({
      type: 'PHANTOM_RTO_ON_DELIVERED',
      billed_rto: shipment.rto_charge,
      overcharge: shipment.rto_charge,
    });
  }

  // Unauthorized RTO
  if (shipment.shipment_type === 'Reverse Pickup' && shipment.rto_charge > 0) {
    violations.push({
      type: 'UNAUTHORIZED_RTO_ON_REVERSE_PICKUP',
      billed_rto: shipment.rto_charge,
      overcharge: shipment.rto_charge,
    });
  }

  // Misc charges
  if (shipment.misc_charges > 0) {
    violations.push({
      type: 'UNCONTRACTED_MISC_CHARGES',
      misc_charges: shipment.misc_charges,
      overcharge: shipment.misc_charges,
    });
  }

  return violations;
}

// Reconciles one shipment so downstream aggregation can work from one
// normalized row that includes expected charges and violation totals.
function reconcileShipment(shipment, rateIndex) {
  const violations = detectViolations(shipment, rateIndex);
  const correctKey = rateKey(shipment.carrier, shipment.destination_zone, shipment.actual_weight_slab);
  const rate = rateIndex.get(correctKey);
  const expectedCod = rate && shipment.payment_mode === 'COD' ? rate.cod_fee : 0;
  const expectedRto = rate && shipment.shipment_type === 'RTO'
    ? r2(shipment.contracted_rate * rate.rto_multiplier)
    : 0;
  const expectedTotal = r2(shipment.contracted_rate + expectedCod + expectedRto);

  const totalOvercharge = violations.reduce(
    (sum, v) => sum + (typeof v.overcharge === 'number' ? v.overcharge : 0),
    0
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
    violation_types: violations.map(v => v.type),
    total_overcharge: r2(totalOvercharge),
    is_overcharged: totalOvercharge > EPSILON,
  };
}

// Reconciles all shipments and returns API-ready aggregates so expensive
// grouping happens on the server instead of in the browser.
function reconcileAll(shipments, rateCards) {
  const rateIndex = buildRateIndex(rateCards);
  const reconciled = shipments.map(s => reconcileShipment(s, rateIndex));

  const byCarrier = {};
  const byViolationType = {};
  const byZone = {};
  const byWeightRange = Object.fromEntries(
    WEIGHT_BUCKETS.map(bucket => [bucket, { count: 0, overcharged_count: 0, total_overcharge: 0 }])
  );
  const byCarrierZone = {};
  let totalBilled = 0;
  let totalOvercharge = 0;
  let overchargedCount = 0;

  for (const r of reconciled) {
    totalBilled += r.total_billed;
    totalOvercharge += r.total_overcharge;
    if (r.is_overcharged) overchargedCount++;

    byCarrier[r.carrier] ||= emptyCarrier();
    const c = byCarrier[r.carrier];
    c.shipment_count++;
    c.total_billed += r.total_billed;
    c.total_overcharge += r.total_overcharge;
    if (r.is_overcharged) c.overcharged_count++;

    const z = getSegment(byZone, r.destination_zone);
    addSegmentTotals(z, r);

    const bucket = weightBucket(r.actual_weight_slab);
    const w = byWeightRange[bucket];
    w.count++;
    w.total_overcharge += r.total_overcharge;
    if (r.is_overcharged) w.overcharged_count++;

    if (!byCarrierZone[r.carrier]) byCarrierZone[r.carrier] = {};
    const cz = getSegment(byCarrierZone[r.carrier], r.destination_zone);
    addSegmentTotals(cz, r);

    for (const v of r.violations) {
      if (!byViolationType[v.type]) {
        byViolationType[v.type] = { count: 0, total_overcharge: 0 };
      }
      byViolationType[v.type].count++;
      byViolationType[v.type].total_overcharge += (v.overcharge || 0);
    }
  }

  for (const carrier of Object.keys(byCarrier)) {
    const c = byCarrier[carrier];
    c.total_billed = r2(c.total_billed);
    c.total_overcharge = r2(c.total_overcharge);
    c.overcharge_pct = pct(c.total_overcharge, c.total_billed);
    c.hit_rate_pct = pct(c.overcharged_count, c.shipment_count);
  }

  for (const type of Object.keys(byViolationType)) {
    byViolationType[type].total_overcharge = r2(byViolationType[type].total_overcharge);
  }

  for (const zone of Object.keys(byZone)) {
    finalizeSegment(byZone[zone]);
  }

  for (const bucket of Object.keys(byWeightRange)) {
    byWeightRange[bucket].total_overcharge = r2(byWeightRange[bucket].total_overcharge);
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
      overcharge_pct_of_spend: pct(totalOvercharge, totalBilled),
    },
    by_carrier: byCarrier,
    by_violation_type: byViolationType,
    by_zone: byZone,
    by_weight_range: byWeightRange,
    by_carrier_zone: byCarrierZone,
    issues: reconciled.filter(r => r.is_overcharged),
  };
}

module.exports = { buildRateIndex, reconcileAll };
