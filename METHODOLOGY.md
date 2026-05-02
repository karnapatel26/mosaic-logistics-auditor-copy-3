# Mosaic Logistics Billing Auditor Methodology

## 1. The Problem

The supply chain head reported logistics costs running roughly 15% above budget, with live shipment records and carrier rate cards provided through the Mosaic Fellowship API. The objective was to isolate which charges were not explainable by the contracted rate card, quantify the recoverable amount, and make the dispute patterns clear enough for a supply chain leader to act on.

## 2. How We Discovered the Violation Categories

We started by examining every numeric field in the shipment schema: billed base rate, contracted rate, COD charge, RTO charge, miscellaneous charges, and total billed amount. Each field was mapped to the contractual counterpart in the rate card: carrier, destination zone, weight slab, base rate, COD fee, and RTO multiplier.

Every mismatch pattern with financial impact became a violation rule. After the numeric checks were defined, we looked for structural billing violations that do not appear as simple rate-card deltas: payment mode conflicts, delivery status conflicts, reverse pickup handling, missing rate-card entries, and GST-level total checks.

## 3. The 12 Violation Rules With Business Justification

### CONTRACTED_RATE_TAMPERED
Detects: The shipment-level contracted rate does not match the canonical rate card for the carrier, zone, and weight slab.
Formula: overcharge = max(0, shipment_contracted_rate - rate_card_base_rate)
Why it matters: A shipment record should not override the contract. A higher embedded contracted rate can hide leakage before billed-rate checks even run.

### WEIGHT_SLAB_INFLATION
Detects: The carrier billed a heavier weight slab than the actual measured slab.
Formula: overcharge = max(0, billed_rate - contracted_rate_at_actual_slab)
Why it matters: Weight rounding and slab inflation are common parcel-billing leakage patterns, especially near slab boundaries.

### ZONE_UPGRADE
Detects: The billed zone differs from the destination zone used for the contract lookup.
Formula: overcharge = max(0, billed_rate - contracted_rate_at_actual_zone)
Why it matters: Billing a shipment as remote or higher-zone when the destination maps to a cheaper zone directly inflates freight cost.

### BASE_RATE_MANIPULATION
Detects: For matching zone and slab, the billed base rate still differs from the contracted rate.
Formula: overcharge = billed_rate - contracted_rate
Why it matters: This catches direct base-rate edits that are not explained by zone or weight differences.

### COD_FEE_MISMATCH
Detects: A COD shipment has a COD fee different from the carrier contract.
Formula: overcharge = billed_cod_fee - contracted_cod_fee
Why it matters: COD fees are often small per shipment but large in aggregate at ecommerce volume.

### PHANTOM_COD_ON_PREPAID
Detects: A prepaid shipment includes a COD charge.
Formula: overcharge = billed_cod_fee
Why it matters: Prepaid shipments should not carry cash-collection fees, so the full COD charge is disputable.

### RTO_MULTIPLIER_MISMATCH
Detects: An RTO shipment's billed RTO charge differs from the contracted multiplier result.
Formula: overcharge = billed_rto_charge - (contracted_base_rate * rto_multiplier)
Why it matters: RTO pricing is multiplier-driven; a wrong multiplier quietly compounds reverse logistics cost.

### PHANTOM_RTO_ON_DELIVERED
Detects: A delivered forward shipment includes an RTO fee.
Formula: overcharge = billed_rto_charge
Why it matters: Delivered forward shipments did not return to origin, so the RTO fee has no operational basis.

### PHANTOM_RTO_ON_UNDELIVERED
Detects: An undelivered forward shipment includes an RTO fee before being classified as an RTO shipment.
Formula: overcharge = billed_rto_charge
Why it matters: Undelivered status alone should not authorize an RTO charge unless the shipment has entered the contracted RTO flow.

### UNAUTHORIZED_RTO_ON_REVERSE_PICKUP
Detects: A reverse pickup shipment includes an RTO fee.
Formula: overcharge = billed_rto_charge
Why it matters: Reverse pickup already describes the return-leg service. Adding RTO on top duplicates reverse movement cost.

### UNCONTRACTED_MISC_CHARGES
Detects: Miscellaneous charges appear without a rate-card basis.
Formula: overcharge = misc_charges
Why it matters: Unexplained accessorial fees are hard to audit manually and should be disputed unless backed by contract terms.

### TAX_DISCREPANCY
Detects: The billed total differs from the sum of billed charges plus the 18% GST heuristic by more than the tolerance.
Formula: flag when abs(total_billed - ((billed_rate + cod + rto + misc) * 1.18)) > 1.00; recoverable overcharge = max(0, total_billed - expected_total_with_tax)
Why it matters: GST mismatches indicate invoice-level inconsistency. This is a flag, not a certainty, because taxes can be rounded or represented differently by carrier systems.

The engine also has one early-return data quality check: MISSING_RATE_CARD. It detects that no carrier-zone-slab contract row exists, records the issue, and avoids inventing an overcharge where no contract baseline is available.

## 4. Financial Precision

JavaScript `Number` uses IEEE 754 binary floating-point arithmetic, which can introduce sub-paise drift when repeatedly adding rates, taxes, and fee deltas. Billing audits need deterministic decimal math, so the reconciliation engine uses `decimal.js` for all currency calculations and rounds explicit money and percentage outputs to two decimals.

## 5. The O(1) Lookup Architecture

The rate card is converted into a `Map` keyed by `carrier|zone|slab`, for example `BlueDart|Zone C (Tier 2)|2-5kg`. Each shipment then performs one direct lookup instead of scanning every rate-card row.

With roughly 8,000 shipments and about 200 rate-card rows, a naive nested scan would require about 1.6 million comparisons. The index reduces that to about 8,000 lookups after one rate-card indexing pass, while also making the match deterministic and independent of iteration order.

## 6. What We Found

The audit processed 8,000 shipments and found 233 shipments with recoverable overbilling. Total billed spend was INR 1,762,257.12 and recoverable overcharge was INR 14,593.38, or 0.83% of billed spend.

Carrier-level recoverable overcharge:

| Carrier | Overcharge |
|---|---:|
| BlueDart | INR 3,445.11 |
| DTDC | INR 2,636.40 |
| Shadowfax | INR 2,417.46 |
| Delhivery | INR 2,320.73 |
| Xpressbees | INR 2,297.73 |
| Ecom Express | INR 1,475.95 |

Recoverable violation-type overcharge:

| Violation Type | Overcharge |
|---|---:|
| WEIGHT_SLAB_INFLATION | INR 4,325.22 |
| ZONE_UPGRADE | INR 3,349.50 |
| PHANTOM_RTO_ON_DELIVERED | INR 2,450.14 |
| UNAUTHORIZED_RTO_ON_REVERSE_PICKUP | INR 1,995.39 |
| UNCONTRACTED_MISC_CHARGES | INR 1,370.73 |
| PHANTOM_COD_ON_PREPAID | INR 1,102.18 |

`TAX_DISCREPANCY` and near-zero `RTO_MULTIPLIER_MISMATCH` are retained in raw shipment detail as informational flags but are excluded from aggregate dashboard views because they do not materially contribute recoverable value.

The 15% figure represents total budget variance, which includes legitimate factors like rate revisions, volume mix, and seasonal surcharges. Our 0.83% represents the subset that is purely attributable to billing violations against the contracted rate card: charges that are directly disputable and recoverable.

## 7. Assumptions and Edge Cases

Tax tolerance: the GST discrepancy check uses a INR 1.00 tolerance to avoid flagging normal invoice rounding. The UI also treats violation types with aggregate recoverable overcharge at or below INR 1.00 as informational in charts and headline KPIs.

Missing contracts: when no matching rate card exists for `carrier|zone|slab`, the engine emits `MISSING_RATE_CARD` with no overcharge value. That keeps the audit honest: missing data is surfaced, not converted into a fabricated claim.

Multi-violation shipments: a shipment can carry multiple violations. The locked engine adds each positive violation overcharge into `total_overcharge`, so compound billing errors are additive in the recoverable amount. This is intentionally conservative for dispute packaging because each claim row preserves the individual rule evidence.

GST heuristic: the tax rule assumes an 18% GST basis for flagging total-billed inconsistency. Because tax treatment can vary by invoice representation, this rule is a signal for review rather than a standalone recoverable claim unless it produces a positive overcharge.
