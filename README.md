# Mosaic Logistics Billing Auditor

> Automated carrier billing reconciliation dashboard built for the **Mosaic Fellowship 2026** challenge.

---

## 🎥 Loom Video Walkthrough

> **TODO — Add before final submission**
>
> Paste your Loom link here (≤ 5 min walkthrough of the dashboard and key findings).

---

## 📝 Methodology Write-up (500 words)

> **TODO — Add before final submission**
>
> Write a 500-word explanation of your reconciliation methodology here. Cover:
> - How you modelled the rate-card index (O(1) lookup)
> - Each violation type and how it is detected
> - Any edge cases you encountered and resolved
> - What the data reveals about carrier billing patterns

---

## 🚀 Setup & Run Instructions

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x

### 1 — Clone the repo

```bash
git clone https://github.com/<your-username>/mosaic-logistics-auditor.git
cd mosaic-logistics-auditor
```

### 2 — Install dependencies

```bash
cd frontend
npm install
```

### 3 — Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4 — Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

> Set the **Root Directory** to `frontend/` in the Vercel project settings.

---

## 🏗 Architecture

```
mosaic-logistics-auditor/
├── backend/                  # Original Node.js prototype (reference only)
│   ├── fetchData.js
│   └── reconciliation.js
└── frontend/                 # Production Next.js (App Router) application
    ├── app/
    │   ├── layout.tsx        # Root layout + SEO metadata
    │   ├── page.tsx          # Dashboard Client Component
    │   ├── globals.css       # Design system tokens, animations
    │   └── api/
    │       ├── summary/route.ts   # GET /api/summary
    │       └── issues/route.ts    # GET /api/issues (paginated)
    └── lib/
        ├── fetchData.ts      # Paginated API ingestion
        ├── reconciliation.ts # Core reconciliation engine
        └── cache.ts          # 10-minute in-memory TTL cache
```

### Why Next.js (App Router) instead of Express?

The fellowship requires deployment to **Vercel**. Express needs a persistent server process (e.g., Render, Railway), which is not available. Next.js Serverless API Routes run natively on Vercel with zero configuration — each route is an isolated Lambda function.

### O(1) Rate-Card Index

The core performance insight is in `lib/reconciliation.ts → buildRateIndex()`:

```ts
// Instead of O(n) scan per shipment:
const rate = rateCards.find(r =>
  r.carrier === s.carrier && r.zone === s.zone && r.weight_slab === s.slab
);

// We build a Map once — O(n) — then look up in O(1):
const key = `${carrier}|${zone}|${weight_slab}`;
const rate = rateIndex.get(key); // O(1)
```

With 8,000+ shipments and ~200 rate-card rows, this saves **~1.6 million comparisons** per reconciliation run.

### 10-Minute Cache Strategy

Vercel keeps function instances warm between requests. The `lib/cache.ts` module stores the reconciliation result at module scope:

```
Cold start → fetch all pages (8,000+ rows) → reconcile → store in module variable
Subsequent requests (within 10 min) → return cached result instantly
Cache expires → next request triggers a fresh fetch
```

This prevents Vercel function timeout (max 60 s) from being hit on repeat page loads.

### Violation Detection

Each shipment is checked against **10 violation rules** in a single linear pass:

| Violation | Description |
|---|---|
| `CONTRACTED_RATE_TAMPERED` | Stated contracted rate ≠ rate-card base rate |
| `WEIGHT_SLAB_INFLATION` | Billed on heavier slab than actual weight |
| `ZONE_UPGRADE` | Billed to more expensive zone than actual |
| `BASE_RATE_MANIPULATION` | Billed rate ≠ contracted rate (same zone & slab) |
| `COD_FEE_MISMATCH` | COD fee charged differs from contracted amount |
| `PHANTOM_COD_ON_PREPAID` | COD fee charged on a prepaid shipment |
| `RTO_MULTIPLIER_MISMATCH` | Wrong RTO multiplier applied |
| `PHANTOM_RTO_ON_DELIVERED` | RTO fee charged on a delivered forward shipment |
| `UNAUTHORIZED_RTO_ON_REVERSE_PICKUP` | RTO fee on a reverse pickup |
| `UNCONTRACTED_MISC_CHARGES` | Misc charges with no contract basis |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + Vanilla CSS design tokens |
| Charts | Recharts |
| Icons | Lucide React |
| HTTP Client | Axios |
| Deployment | Vercel (Serverless) |

---

## 📄 License

MIT
