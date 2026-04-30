"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import {
  AlertTriangle, BarChart2, DollarSign, Package,
  TrendingDown, RefreshCw, TrendingUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { SummaryResponse } from "./components/types";

const KeyFindings = dynamic(() => import("./components/KeyFindings"), { ssr: false });
const RootCauseAnalysis = dynamic(() => import("./components/RootCauseAnalysis"), { ssr: false });
const Charts     = dynamic(() => import("./components/Charts"),      { ssr: false });
const IssuesTable = dynamic(() => import("./components/IssuesTable"), { ssr: false });

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});

// Formats dashboard money values with one shared formatter so every KPI
// shows rupees consistently without recreating Intl objects.
const fmt = (n: number) => inr.format(n);

// Draws a fixed loading placeholder so cards keep their size while the
// summary API request is still in flight.
function Skeleton({ w, h, style }: { w?: string; h?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h ?? 14, width: w ?? "70%", ...style }} />;
}

// Loads the dashboard summary and renders each audit section so users
// can review billing leakage from top-level KPIs down to shipment rows.
export default function Dashboard() {
  const [summary, setSummary]   = useState<SummaryResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Fetches summary aggregates once per refresh because every dashboard
  // section depends on the same cached API result.
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get<SummaryResponse>("/api/summary");
      setSummary(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchSummary);
  }, [fetchSummary]);

  const s = summary?.summary;
  const carriers = useMemo(() => (
    summary ? Object.keys(summary.by_carrier).sort() : []
  ), [summary]);
  const worstOffenders = useMemo(() => (
    summary
      ? Object.entries(summary.by_carrier)
        .sort((a, b) => b[1].total_overcharge - a[1].total_overcharge)
      : []
  ), [summary]);

  const budgetContext = useMemo(() => s
    ? `Billing is running ${s.overcharge_pct_of_spend}% above contracted rates. `
      + `On a total spend of ${fmt(s.total_billed)}, this equates to `
      + `${fmt(s.total_overcharge)} in unjustified charges — `
      + `directly explaining the ~15% budget overrun.`
    : "", [s]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16, color: "#ef4444" }}>
        <AlertTriangle size={40} />
        <p style={{ fontSize: 18, fontWeight: 600 }}>Failed to load audit data</p>
        <p style={{ color: "#71717a", fontSize: 14 }}>{error}</p>
        <button onClick={fetchSummary} style={{ marginTop: 8, padding: "8px 20px",
          background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8,
          color: "#fafafa", cursor: "pointer", display: "flex", alignItems: "center",
          gap: 8, fontSize: 14 }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: "24px 32px",
      maxWidth: 1400, margin: "0 auto" }}>
      <header className="fade-in" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <BarChart2 size={22} color="#f97316" />
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fafafa" }}>
                Mosaic Logistics Billing Auditor
              </h1>
            </div>
            <p style={{ fontSize: 13, color: "#71717a" }}>
              Automated carrier billing reconciliation · Mosaic Fellowship 2026
            </p>
          </div>
          <button onClick={fetchSummary} id="refresh-btn"
            style={{ padding: "8px 16px", background: "#18181b",
              border: "1px solid #3f3f46", borderRadius: 8, color: "#a1a1aa",
              cursor: "pointer", display: "flex", alignItems: "center",
              gap: 8, fontSize: 13 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </header>
      <div className="alert-banner fade-in fade-in-delay-1"
        style={{ padding: "20px 24px", marginBottom: 32 }}>
        {loading ? <Skeleton h={28} w="70%" /> : (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <AlertTriangle size={20} color="#f97316" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#fed7aa", marginBottom: 4 }}>
                🚨 Budget Overrun Identified — {fmt(s!.total_overcharge)} in Overbilling
              </p>
              <p style={{ fontSize: 13, color: "#9a3412", lineHeight: 1.6 }}>
                {budgetContext}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="fade-in fade-in-delay-2"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 24, marginBottom: 32 }}>
        <div className="kpi-card green" id="kpi-total-billed">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase" }}>Total Billed</span>
            <DollarSign size={15} color="#22c55e" />
          </div>
          {loading ? <Skeleton h={30} /> : (
            <p style={{ fontSize: 26, fontWeight: 800, color: "#fafafa",
              letterSpacing: "-0.5px" }}>{fmt(s!.total_billed)}</p>
          )}
          {loading ? <Skeleton h={12} w="55%" style={{ marginTop: 6 }} /> : (
            <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>
              {s!.total_shipments.toLocaleString("en-IN")} shipments
            </p>
          )}
        </div>
        <div className="kpi-card red" id="kpi-total-overcharge">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase" }}>Money Lost</span>
            <TrendingDown size={15} color="#ef4444" />
          </div>
          {loading ? <Skeleton h={30} /> : (
            <p style={{ fontSize: 26, fontWeight: 800, color: "#f87171",
              letterSpacing: "-0.5px" }}>{fmt(s!.total_overcharge)}</p>
          )}
          {loading ? <Skeleton h={12} w="55%" style={{ marginTop: 6 }} /> : (
            <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>
              Revenue at risk · recoverable
            </p>
          )}
        </div>
        <div className="kpi-card accent" id="kpi-overcharge-pct">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase" }}>Above Budget</span>
            <TrendingUp size={15} color="#f97316" />
          </div>
          {loading ? <Skeleton h={30} /> : (
            <p style={{ fontSize: 26, fontWeight: 800, color: "#fafafa",
              letterSpacing: "-0.5px" }}>{s!.overcharge_pct_of_spend}%</p>
          )}
          {loading ? <Skeleton h={12} w="55%" style={{ marginTop: 6 }} /> : (
            <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>
              Of contracted spend
            </p>
          )}
        </div>
        <div className="kpi-card blue" id="kpi-overcharged-shipments">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase" }}>Affected</span>
            <Package size={15} color="#3b82f6" />
          </div>
          {loading ? <Skeleton h={30} /> : (
            <p style={{ fontSize: 26, fontWeight: 800, color: "#fafafa",
              letterSpacing: "-0.5px" }}>
              {s!.overcharged_count.toLocaleString("en-IN")}
            </p>
          )}
          {loading ? <Skeleton h={12} w="55%" style={{ marginTop: 6 }} /> : (
            <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>
              {s!.overcharge_rate_pct}% of all shipments
            </p>
          )}
        </div>
        <div className="kpi-card purple" id="kpi-carriers">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase" }}>Carriers</span>
            <BarChart2 size={15} color="#a855f7" />
          </div>
          {loading ? <Skeleton h={30} /> : (
            <p style={{ fontSize: 26, fontWeight: 800, color: "#fafafa",
              letterSpacing: "-0.5px" }}>{carriers.length}</p>
          )}
          {loading ? <Skeleton h={12} w="55%" style={{ marginTop: 6 }} /> : (
            <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>
              All with overbilling found
            </p>
          )}
        </div>
      </div>
      {!loading && summary && <KeyFindings summary={summary} />}

      {!loading && summary && <RootCauseAnalysis summary={summary} />}

      {!loading && summary && <Charts summary={summary} />}

      {!loading && summary && (
        <div className="glass-card fade-in fade-in-delay-4"
          style={{ padding: "24px", marginBottom: 32 }} id="worst-offenders">
          <p style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 6 }}>
            Worst Offenders
          </p>
          <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 20 }}>
            All carriers ranked by total overbilled amount
          </p>
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
              {worstOffenders.map(([name, c]) => (
                <tr key={name}>
                  <td style={{ color: "#fb923c", fontWeight: 600 }}>{name}</td>
                  <td>{c.shipment_count.toLocaleString("en-IN")}</td>
                  <td>{c.overcharged_count.toLocaleString("en-IN")}</td>
                  <td>
                    <span style={{ color: c.hit_rate_pct > 50 ? "#f87171" : "#facc15",
                      fontWeight: 600 }}>
                      {c.hit_rate_pct}%
                    </span>
                  </td>
                  <td>{fmt(c.total_billed)}</td>
                  <td style={{ color: "#f87171", fontWeight: 600 }}>
                    {fmt(c.total_overcharge)}
                  </td>
                  <td>
                    <span className={`badge ${c.overcharge_pct > 10 ? "badge-high"
                      : c.overcharge_pct > 5 ? "badge-medium" : "badge-low"}`}>
                      {c.overcharge_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IssuesTable carriers={carriers} totalIssues={s?.overcharged_count} />

      <footer style={{ textAlign: "center", marginTop: 48, paddingBottom: 32 }}>
        <p style={{ fontSize: 12, color: "#3f3f46" }}>
          Mosaic Logistics Billing Auditor · Mosaic Fellowship 2026
        </p>
      </footer>
    </div>
  );
}
