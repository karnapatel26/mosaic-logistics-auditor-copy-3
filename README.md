# Mosaic Logistics Billing Auditor

Automated carrier billing reconciliation dashboard for the Mosaic Fellowship 2026 logistics challenge. The app fetches live paginated shipment and rate-card data, reconciles every shipment against the contracted rate card, and surfaces recoverable overbilling by carrier, lane, weight range, and violation type.

## Live Deployment

Live URL: `TBD - add Vercel production URL after deployment`

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.4 App Router |
| Language | TypeScript strict mode |
| Runtime | Vercel Serverless Functions |
| Cache | Upstash Redis with local memory fallback |
| Math | decimal.js |
| UI | Tailwind CSS, Lucide React, Recharts |

## Setup

```bash
npm --prefix frontend install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If port 3000 is already in use, Next.js will choose the next available port.

For production validation:

```bash
npm run build
npm run lint
```

## Environment

Copy `.env.example` into the environment where the Next.js app runs and set:

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint for shared serverless cache |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `CRON_SECRET` | Optional bearer secret if cron auth is enabled |

The live Mosaic API base URL is defined in `frontend/lib/fetchData.ts` because the fellowship data source is fixed.

## Architecture

```text
mosaic-logistics-auditor/
├── backend/                  # Legacy Node prototype, not deployed
└── frontend/                 # Production Next.js app
    ├── app/
    │   ├── page.tsx
    │   ├── api/summary/route.ts
    │   ├── api/issues/route.ts
    │   ├── api/export/route.ts
    │   └── api/cron/route.ts
    └── lib/
        ├── fetchData.ts
        ├── reconciliation.ts
        └── cache.ts
```

`frontend/lib/fetchData.ts` fetches shipments and rate cards with bounded parallel pagination and stable page-order reassembly. `frontend/lib/reconciliation.ts` builds an O(1) rate-card index and performs the audit using decimal.js. `frontend/lib/cache.ts` caches the full reconciliation result for 10 minutes and collapses concurrent cold-start requests.

## API

| Route | Purpose |
|---|---|
| `GET /api/summary` | Aggregated KPIs, carrier totals, segment totals, violation totals |
| `GET /api/issues` | Paginated issue rows with `page`, `limit`, `carrier`, `type`, and `sort` filters |
| `GET /api/export` | Streaming CSV export of overcharged shipments |
| `GET /api/cron` | Hourly cache pre-warming endpoint for Vercel Cron |

## Reconciliation Checks

The locked audit engine performs 12 numbered violation rules plus one early-return data quality check, for 13 checks total:

| Check | Purpose |
|---|---|
| `MISSING_RATE_CARD` | No contractual rate-card row exists for carrier, zone, and slab |
| `CONTRACTED_RATE_TAMPERED` | Shipment contracted rate differs from the rate card |
| `WEIGHT_SLAB_INFLATION` | Billed slab is heavier than actual slab |
| `ZONE_UPGRADE` | Billed zone is more expensive than destination zone |
| `BASE_RATE_MANIPULATION` | Billed base rate differs from contracted rate for same lane/slab |
| `COD_FEE_MISMATCH` | COD charge differs from contracted COD fee |
| `PHANTOM_COD_ON_PREPAID` | COD fee appears on prepaid shipment |
| `RTO_MULTIPLIER_MISMATCH` | RTO charge differs from contracted multiplier result |
| `PHANTOM_RTO_ON_DELIVERED` | RTO fee appears on delivered forward shipment |
| `PHANTOM_RTO_ON_UNDELIVERED` | RTO fee appears on undelivered forward shipment |
| `UNAUTHORIZED_RTO_ON_REVERSE_PICKUP` | RTO fee appears on reverse pickup |
| `UNCONTRACTED_MISC_CHARGES` | Miscellaneous charge has no contractual basis |
| `TAX_DISCREPANCY` | GST heuristic flag comparing billed total with expected 18% GST total |

Aggregate dashboard views focus on recoverable financial impact. Informational or effectively zero-value checks can remain in raw shipment detail, but they do not drive headline charts or KPIs.

## Methodology

See `METHODOLOGY.md` for the full audit methodology, rule rationale, financial precision details, and interpretation of the 0.83% recoverable overcharge versus the stated ~15% total budget overrun.
