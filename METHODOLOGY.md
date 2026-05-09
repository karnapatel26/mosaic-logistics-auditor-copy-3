# Audit Methodology

The Logistics Billing Auditor compares live shipment billing against live contract rate-card data from the Mosaic Fellowship APIs.

## Data Ingestion

- Shipments API: `https://mosaicfellowship.in/api/data/supply-chain/shipments?page=1&limit=100`
- Rate Card API: `https://mosaicfellowship.in/api/data/supply-chain/rate-card?page=1&limit=100`
- The app fetches page 1, page 2, page 3, and so on with `limit=100`.
- Fetching stops when an API page returns no records or reports no next page.

## Normalization

Before reconciliation, raw records are normalized:

- Charge and rate fields are converted to numbers.
- Carrier names are trimmed and case-normalized.
- Destination zones and billed zones are trimmed.
- Payment mode values are normalized to practical values such as `COD` and `Prepaid`.
- Shipment/service type values are normalized to values such as `Forward`, `RTO`, and `Reverse Pickup`.
- Missing fields receive safe defaults so the dashboard does not crash.

## Expected Charge

For each shipment, the engine matches a rate-card row using:

- Carrier
- Destination zone
- Actual weight slab

Expected charge is calculated as:

```text
expected charge = base rate + applicable COD fee + applicable RTO charge
```

COD fee is included only for COD shipments. RTO charge is included only for RTO shipments and uses the rate-card multiplier.

## Billed Charge And Overcharge

Billed charge is read from the shipment record `total_billed` field.

```text
overcharge = billed charge - expected charge
```

Status classification:

- `Overbilled` when overcharge is positive.
- `Correct` when overcharge is zero.
- `Underbilled/Discounted` when overcharge is negative.
- `Rate Card Match Missing` when no usable rate-card match exists.

Only positive overcharge contributes to recoverable overbilling. Underbilled or discounted shipments are tracked separately and are not included in recoverable leakage.

## Violation Reasons

The audit assigns one or more reasons when possible:

- Weight slab mismatch
- Zone mismatch
- COD/payment charge mismatch
- Extra charge/surcharge mismatch
- RTO/return charge mismatch
- Unclassified

The dashboard uses root-cause reasons for category summaries and charts, while the shipment table shows all assigned root-cause reasons. Affected shipments are unique overbilled shipments. Violation events are counted separately as root-cause issues, and one affected shipment can have multiple violation events.

Recoverable billed-total overages are interpreted as positive-overcharge rows only. Underbilled/discounted rows are not counted as recoverable overbilling, even though they are still classified for audit context.

## Final Verified Numbers

- Total shipments audited: 8,000
- Recoverable overbilling: ₹14,438.07
- Affected shipments: 212
- Violation events: 215
- Underbilled/discounted shipments: 22
- Worst carrier: BlueDart
- Most common issue: Weight slab mismatch
- Highest financial-impact issue: RTO/return charge mismatch

## Assumptions

- The rate card is the contract source of truth.
- Shipment `total_billed` is the amount charged by the carrier for that shipment.
- The app uses available API fields only; it does not invent AI-generated findings or hardcoded final totals.
- Findings are labeled potential overbilling because operational teams should validate before filing carrier disputes.
