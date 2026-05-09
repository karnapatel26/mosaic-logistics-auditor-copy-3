# Mosaic Logistics Billing Auditor

Next.js/TypeScript submission project for the Mosaic Fellowship Builder Challenge problem: Supply Chain Team - Logistics Billing Auditor.

- Live demo: To be added after deployment
- Loom walkthrough: To be added after recording
- GitHub repository: https://github.com/karnapatel26/mosaic-logistics-auditor-copy-3

## Overview

The app audits logistics billing by fetching the live Mosaic shipment and rate-card APIs, matching each shipment against the correct contract row, and surfacing recoverable carrier overbilling. It is built as a Vercel-ready Next.js App Router application with TypeScript, React, server-side API routes, and no login requirement.

Backend logic runs through Next.js API routes in `frontend/app/api`. There is no separate Express service, background server, or standalone backend process.

## Final Verified Numbers

- Total shipments audited: 8,000
- Recoverable overbilling: ₹14,438.07
- Affected shipments: 212
- Violation events: 215
- Underbilled/discounted shipments: 22
- Worst carrier: BlueDart
- Most common issue: Weight slab mismatch
- Highest financial-impact issue: RTO/return charge mismatch

## Submission Write-up

Logistics bills were higher than expected, so this dashboard checks whether carriers billed more than the contracted rate card. It gives the supply chain team a dispute-ready view of where money can be recovered and why the billing leakage happened.

The app fetches live shipment and rate-card data from the Mosaic APIs. It matches every shipment to the correct contract row using carrier, destination zone, and actual weight slab, calculates the expected billing amount, compares it with the shipment's `total_billed` amount, and flags only positive overcharges as recoverable leakage. Underbilled or discounted shipments are tracked separately and are not included in recovery totals.

Key findings: 8,000 shipments were audited, with ₹14,438.07 in recoverable overbilling across 212 affected overbilled shipments and 215 root-cause violation events. BlueDart had the highest recoverable leakage. Weight slab mismatch was the most common issue, while RTO/return charge mismatch had the highest financial impact.

Recommended actions are to audit BlueDart first, prioritize high-value rows from the Priority Dispute Queue, review weight slab mapping with carriers, block invalid RTO/COD/misc charges before invoice approval, and export the dispute CSV for carrier follow-up.

## Tech Stack

| Area | Choice |
| --- | --- |
| App framework | Next.js App Router |
| Language | TypeScript, React |
| Charts | Recharts |
| Icons | Lucide React |
| Data fetch | Axios in Next.js server API routes |
| Currency math | decimal.js |
| Cache | In-memory cache with optional Upstash Redis |

## Features

- Fetches all paginated shipments and rate-card records with `limit=100`.
- Normalizes carrier, zone, payment mode, service type, charge, and weight-slab fields.
- Calculates expected charge from carrier, destination zone, and actual weight slab.
- Classifies rows as Overbilled, Correct, Underbilled/Discounted, or Rate Card Match Missing.
- Counts only positive overcharge as recoverable overbilling.
- Excludes underbilled/discounted shipments from recoverable leakage.
- Separates unique affected shipments from root-cause violation events.
- Allows one shipment to carry multiple violation reasons when multiple checks fail.
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
9. Count affected shipments as unique overbilled shipments, while violation events are counted separately as root-cause issues.

The dashboard treats underbilled or discounted shipments as non-recoverable for dispute purposes. They are useful context, but they do not increase the recoverable leakage number.

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

The app does not use Streamlit, Render, login-gated pages, bundled sample data, or hardcoded dashboard metrics. Dashboard figures are calculated from the live Mosaic shipments and rate-card APIs at runtime.

## Assumptions And Limitations

- The public Mosaic APIs are the source of truth and must be reachable at runtime.
- Rate-card matching uses the fields available in the API: carrier, zone, and weight slab. Service type and payment mode are used for optional charge logic where applicable.
- The app labels findings as potential overbilling because final recovery depends on business validation and carrier dispute acceptance.
- Missing rate-card matches are marked Rate Card Match Missing and excluded from potential overbilling until the contract row is available.
- The internal recovery mismatch count should be interpreted as positive-overcharge rows only, not all nonzero variances.

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
