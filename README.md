# Mosaic Logistics Billing Auditor

Submission project for the Mosaic Fellowship Builder Challenge problem: Supply Chain Team — Logistics Billing Auditor.

- Live demo: To be added after deployment
- Loom walkthrough: To be added after recording

## Problem Statement

The app audits logistics billing by fetching live shipment data and live rate-card data, matching each shipment against the correct contract row, and flagging potential overbilling. It highlights carrier-level leakage, error patterns, shipment-level audit rows, and practical business actions.

## Tech Stack

| Area | Choice |
| --- | --- |
| App framework | Next.js App Router |
| Language | TypeScript, React |
| Charts | Recharts |
| Icons | Lucide React |
| Data fetch | Axios on server API route |
| Currency math | decimal.js |
| Cache | In-memory cache with optional Upstash Redis |

## Features

- Fetches all paginated shipments and rate-card records with `limit=100`.
- Normalizes carrier, zone, payment mode, service type, charge, and weight-slab fields.
- Calculates expected charge from carrier, destination zone, and actual weight slab.
- Classifies rows as Overbilled, Correct, Underbilled/Discounted, or Rate Card Match Missing.
- Separates root-cause violation categories from the final billed-total mismatch check.
- Separates underbilling from potential overbilling totals.
- Shows summary cards, carrier analysis, error breakdown, charts, Smart Audit Summary, methodology, recommendations, and a shipment-level audit table.
- Filters by carrier, error type, zone, payment mode, delivery status, and shipment/AWB search.
- Updates metrics, charts, recommendations, and the table from active filters.
- Exports filtered overbilled shipments to CSV.

## Audit Methodology

1. Fetch all pages from the Mosaic shipments API and rate-card API.
2. Normalize raw records so missing fields do not crash the dashboard.
3. Match each shipment to a rate-card row using carrier, destination zone, and actual weight slab.
4. Calculate expected charge as base rate plus applicable COD charge plus applicable RTO charge.
5. Read billed charge from `total_billed` in the shipment record.
6. Calculate `overcharge = billed charge - expected charge`.
7. Count only positive overcharge as potential overbilling.
8. Classify root-cause reasons from slab mismatch, zone mismatch, payment/COD mismatch, surcharge mismatch, RTO mismatch, and unclassified cases.
9. Track final billed total mismatches separately from root-cause violation events.

## How To Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production build:

```bash
npm run build
```

The root `postinstall` script installs the `frontend` package automatically, so a clean clone can run the documented commands without entering subdirectories.

## Deployment

- Vercel: import the repository, keep the root directory at the repo root, and use the default `npm run build` command.
- Netlify: use the Next.js runtime/plugin with `npm run build`; the app does not need authentication or a separate backend process.
- Cloudflare Pages: deploy with the platform's Next.js adapter/OpenNext flow for App Router API routes.

The app does not use Streamlit, Render, login-gated pages, bundled sample data, or hardcoded final audit metrics. Dashboard figures are calculated from the live Mosaic shipments and rate-card APIs at runtime.

## Assumptions And Limitations

- The public Mosaic APIs are the source of truth and must be reachable at runtime.
- Rate-card matching uses the fields available in the API: carrier, zone, and weight slab. Service type and payment mode are used for optional charge logic where applicable.
- The app labels findings as potential overbilling because final recovery depends on business validation and carrier dispute acceptance.
- Missing rate-card matches are marked Rate Card Match Missing and excluded from potential overbilling until the contract row is available.

## Folder Structure

```text
frontend/
  app/
    api/
      audit/route.ts
      export/route.ts
      issues/route.ts
      summary/route.ts
    components/
      DashboardClient.tsx
      types.ts
    globals.css
    layout.tsx
    page.tsx
  lib/
    cache.ts
    exportCsv.ts
    fetchData.ts
    formatters.ts
    reconciliation.ts
package.json
README.md
```
