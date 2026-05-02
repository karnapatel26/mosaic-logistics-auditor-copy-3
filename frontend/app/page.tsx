import { Suspense } from "react";
import { getCachedAnalysis } from "@/lib/cache";
import { AlertTriangle, BarChart2, DollarSign, Package, TrendingDown, TrendingUp } from "lucide-react";
import type { SummaryResponse } from "./components/types";

import { KeyFindings, RootCauseAnalysis, Charts, IssuesTable } from "./components/DashboardComponents";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});
const fmt = (n: number) => inr.format(n);

function Skeleton({ w, h, style }: { w?: string; h?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h ?? 14, width: w ?? "70%", ...style }} />;
}

function KpiSkeleton() {
  return (
    <div className="fade-in fade-in-delay-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, marginBottom: 32 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="kpi-card">
          <Skeleton h={14} w="40%" style={{ marginBottom: 12 }} />
          <Skeleton h={30} w="80%" style={{ marginBottom: 8 }} />
          <Skeleton h={12} w="60%" />
        </div>
      ))}
    </div>
  );
}

async function DashboardContent() {
  const result = await getCachedAnalysis();
  
  const summary: SummaryResponse = {
    summary: result.summary,
    by_carrier: result.by_carrier as any,
    by_violation_type: result.by_violation_type,
    by_zone: result.by_zone as any,
    by_weight_range: result.by_weight_range as any,
    by_carrier_zone: result.by_carrier_zone as any,
  };

  const s = summary.summary;
  const carriers = Object.keys(summary.by_carrier).sort();
  const worstOffenders = Object.entries(summary.by_carrier)
    .sort((a, b) => (b[1] as any).total_overcharge - (a[1] as any).total_overcharge);

  const budgetContext = `Billing is running ${s.overcharge_pct_of_spend}% above contracted rates. `
    + `On a total spend of ${fmt(s.total_billed)}, this equates to `
    + `${fmt(s.total_overcharge)} in unjustified charges — `
    + `directly explaining the ~15% budget overrun.`;

  return (
    <>
      <div className="alert-banner fade-in fade-in-delay-1" style={{ padding: "20px 24px", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <AlertTriangle size={20} color="#f97316" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#fed7aa", marginBottom: 4 }}>
              🚨 Budget Overrun Identified — {fmt(s.total_overcharge)} in Overbilling
            </p>
            <p style={{ fontSize: 13, color: "#9a3412", lineHeight: 1.6 }}>
              {budgetContext}
            </p>
          </div>
        </div>
      </div>

      <div className="fade-in fade-in-delay-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, marginBottom: 32 }}>
        <div className="kpi-card green">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Total Billed</span>
            <DollarSign size={15} color="#22c55e" />
          </div>
          <p style={{ fontSize: 26, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.5px" }}>{fmt(s.total_billed)}</p>
          <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>{s.total_shipments.toLocaleString("en-IN")} shipments</p>
        </div>

        <div className="kpi-card red">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Money Lost</span>
            <TrendingDown size={15} color="#ef4444" />
          </div>
          <p style={{ fontSize: 26, fontWeight: 800, color: "#f87171", letterSpacing: "-0.5px" }}>{fmt(s.total_overcharge)}</p>
          <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>Revenue at risk · recoverable</p>
        </div>

        <div className="kpi-card accent">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Above Budget</span>
            <TrendingUp size={15} color="#f97316" />
          </div>
          <p style={{ fontSize: 26, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.5px" }}>{s.overcharge_pct_of_spend}%</p>
          <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>Of contracted spend</p>
        </div>

        <div className="kpi-card blue">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Affected</span>
            <Package size={15} color="#3b82f6" />
          </div>
          <p style={{ fontSize: 26, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.5px" }}>{s.overcharged_count.toLocaleString("en-IN")}</p>
          <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>{s.overcharge_rate_pct}% of all shipments</p>
        </div>

        <div className="kpi-card purple">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Carriers</span>
            <BarChart2 size={15} color="#a855f7" />
          </div>
          <p style={{ fontSize: 26, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.5px" }}>{carriers.length}</p>
          <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>All with overbilling found</p>
        </div>
      </div>

      <KeyFindings summary={summary} />
      <RootCauseAnalysis summary={summary} />
      <Charts summary={summary} />

      <div className="glass-card fade-in fade-in-delay-4" style={{ padding: "24px", marginBottom: 32 }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 6 }}>Worst Offenders</p>
        <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 20 }}>All carriers ranked by total overbilled amount</p>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Carrier</th>
                <th>Shipments</th>
                <th>Overcharged</th>
                <th>Hit Rate</th>
                <th>Total Billed</th>
                <th>Total Overcharge</th>
                <th>Overcharge %</th>
              </tr>
            </thead>
            <tbody>
              {worstOffenders.map(([name, c]: any) => (
                <tr key={name}>
                  <td style={{ color: "#fb923c", fontWeight: 600 }}>{name}</td>
                  <td>{c.shipment_count.toLocaleString("en-IN")}</td>
                  <td>{c.overcharged_count.toLocaleString("en-IN")}</td>
                  <td>
                    <span style={{ color: c.hit_rate_pct > 50 ? '#f87171' : '#facc15', fontWeight: 600 }}>
                      {c.hit_rate_pct}%
                    </span>
                  </td>
                  <td>{fmt(c.total_billed)}</td>
                  <td style={{ color: "#f87171", fontWeight: 600 }}>{fmt(c.total_overcharge)}</td>
                  <td>
                    <span className={`badge ${
                      c.overcharge_pct > 10 ? 'badge-high' :
                      c.overcharge_pct > 5 ? 'badge-medium' :
                      'badge-low'
                    }`}>
                      {c.overcharge_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <IssuesTable carriers={carriers} totalIssues={s.overcharged_count} />
    </>
  );
}

export default function Dashboard() {
  return (
    <div style={{ minHeight: "100vh", padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <header className="fade-in" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <BarChart2 size={22} color="var(--accent)" />
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                Mosaic Logistics Billing Auditor
              </h1>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
              Automated carrier billing reconciliation · Mosaic Fellowship 2026
            </p>
          </div>
        </div>
      </header>
      
      <Suspense fallback={<KpiSkeleton />}>
        <DashboardContent />
      </Suspense>

      <footer style={{ textAlign: "center", marginTop: 48, paddingBottom: 32 }}>
        <p style={{ fontSize: 12, color: "#3f3f46" }}>
          Mosaic Logistics Billing Auditor · Mosaic Fellowship 2026
        </p>
      </footer>
    </div>
  );
}
