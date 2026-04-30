"use client";

import { useCallback, useMemo, useState } from "react";
import axios from "axios";
import { Download, Lightbulb, TrendingDown } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { Issue, IssuesResponse, SummaryResponse } from "./types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});

// Formats rupee values with one shared formatter so export and cards
// use identical money text without recreating Intl objects.
const fmt = (n: number) => inr.format(n);

// Converts percent strings from the API into numbers because the
// heatmap needs numeric thresholds while preserving the API shape.
function pctNumber(value: string) {
  return Number(value.replace("%", "")) || 0;
}

// Turns API enum keys into readable labels so exported root causes
// stay understandable without changing backend codes.
function humanize(t: string) {
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Chooses the heatmap class from a hit rate so the table can highlight
// risky lanes using the existing visual styles.
function heatClass(rate: number) {
  if (rate > 5) return "heat-high";
  if (rate >= 2) return "heat-medium";
  return "heat-low";
}

// Escapes CSV cells because commas, quotes, and newlines would otherwise
// break spreadsheet columns in the exported audit file.
function csvEscape(value: unknown) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Finds the highest-value item in one pass so recommendations do not
// sort large aggregate lists just to keep the first row.
function maxBy<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce<T | undefined>((best, item) => (
    !best || getValue(item) > getValue(best) ? item : best
  ), undefined);
}

// Formats chart ticks as compact rupee thousands so both bar charts
// share one stable formatter function.
function formatInrThousands(value: unknown) {
  return `₹${Math.round(Number(value) / 1000)}k`;
}

// Downloads all current issue rows as CSV so finance teams can reconcile
// the same audit evidence outside the dashboard.
function exportRows(rows: Issue[]) {
  const headers = [
    "shipment_id", "awb_number", "shipment_date", "carrier", "shipment_type", "payment_mode",
    "destination_zone", "billed_zone", "actual_weight_slab", "billed_weight_slab",
    "expected_base_rate", "actual_base_rate", "expected_cod", "actual_cod",
    "expected_rto", "actual_rto", "misc_charges", "expected_total", "actual_total",
    "overcharge", "overcharge_pct", "root_cause",
  ];
  const body = rows.map((issue) => {
    const overchargePct = issue.expected_total
      ? ((issue.total_overcharge / issue.expected_total) * 100).toFixed(2)
      : "0.00";
    return [
      issue.shipment_id,
      issue.awb_number,
      issue.shipment_date?.slice(0, 10),
      issue.carrier,
      issue.shipment_type,
      issue.payment_mode,
      issue.destination_zone,
      issue.billed_zone,
      issue.actual_weight_slab,
      issue.billed_weight_slab,
      issue.contracted_rate,
      issue.billed_rate,
      issue.expected_cod,
      issue.cod_charge,
      issue.expected_rto,
      issue.rto_charge,
      issue.misc_charges,
      issue.expected_total,
      issue.total_billed,
      issue.total_overcharge,
      `${overchargePct}%`,
      issue.violation_types.map(humanize).join("; "),
    ].map(csvEscape).join(",");
  });

  const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mosaic-overbilling-issues.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  summary: SummaryResponse;
}

// Shows root-cause breakdowns and export controls so billing leakage can
// be investigated by lane, zone, carrier, and shipment weight.
export default function RootCauseAnalysis({ summary }: Props) {
  const [exporting, setExporting] = useState(false);

  const zoneData = useMemo(() => Object.entries(summary.by_zone)
    .map(([name, s]) => ({
      name,
      overcharge: s.total_overcharge,
      hitRate: s.hit_rate,
      hitRateValue: pctNumber(s.hit_rate),
    }))
    .sort((a, b) => b.overcharge - a.overcharge), [summary.by_zone]);

  const weightData = useMemo(() => {
    const total = Object.values(summary.by_weight_range)
      .reduce((sum, s) => sum + s.total_overcharge, 0);
    return Object.entries(summary.by_weight_range)
      .map(([name, s]) => ({
        name,
        overcharge: s.total_overcharge,
        share: total ? `${Math.round((s.total_overcharge / total) * 100)}%` : "0%",
      }));
  }, [summary.by_weight_range]);

  const carriers = useMemo(() => Object.keys(summary.by_carrier_zone).sort(), [summary.by_carrier_zone]);
  const zones = useMemo(() => Object.keys(summary.by_zone).sort(), [summary.by_zone]);

  const recommendations = useMemo(() => {
    const carrierZones = Object.entries(summary.by_carrier_zone)
      .flatMap(([carrier, zoneMap]) => Object.entries(zoneMap).map(([zone, s]) => ({ carrier, zone, ...s })));
    const zonesByRisk = Object.entries(summary.by_zone)
      .map(([zone, s]) => ({ zone, ...s }));
    const weightsByRisk = Object.entries(summary.by_weight_range)
      .map(([bucket, s]) => ({ bucket, ...s }));
    const worstCarrierZone = maxBy(carrierZones, (item) => item.total_overcharge);
    const worstZone = maxBy(zonesByRisk, (item) => item.total_overcharge);
    const worstWeight = maxBy(weightsByRisk, (item) => item.total_overcharge);

    return [
      worstCarrierZone && {
        issue: `${worstCarrierZone.carrier} in ${worstCarrierZone.zone}`,
        data: `${worstCarrierZone.hit_rate} hit rate across ${worstCarrierZone.count} shipments`,
        action: "Run a carrier invoice dispute for this lane and lock zone mapping before billing.",
        recovery: worstCarrierZone.total_overcharge,
      },
      worstZone && {
        issue: `${worstZone.zone} zone drift`,
        data: `${fmt(worstZone.total_overcharge)} overbilled with ${worstZone.hit_rate} hit rate`,
        action: "Audit destination-zone assignment rules and rerate open invoices in this zone.",
        recovery: worstZone.total_overcharge,
      },
      worstWeight && {
        issue: `${worstWeight.bucket} weight slab inflation`,
        data: `${worstWeight.count} shipments created ${fmt(worstWeight.total_overcharge)} leakage`,
        action: "Compare billed slab against manifest weight before approving carrier charges.",
        recovery: worstWeight.total_overcharge,
      },
    ].filter(Boolean) as Array<{ issue: string; data: string; action: string; recovery: number }>;
  }, [summary]);

  // Fetches every issue page before exporting because partial CSVs would
  // make downstream invoice disputes miss evidence.
  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const pageSize = 200;
      let page = 1;
      let total = Infinity;
      const rows: Issue[] = [];

      while (rows.length < total) {
        const { data } = await axios.get<IssuesResponse>(`/api/issues?page=${page}&limit=${pageSize}`);
        total = data.total;
        rows.push(...data.data);
        page++;
      }

      exportRows(rows);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <section className="fade-in fade-in-delay-3" style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16,
        alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#fafafa", marginBottom: 4 }}>
            Root Cause Analysis
          </p>
          <p style={{ fontSize: 13, color: "#a1a1aa" }}>
            Segment-level leakage patterns from API aggregates
          </p>
        </div>
        <button className="icon-button" onClick={exportCsv} disabled={exporting}>
          <Download size={14} /> {exporting ? "Exporting" : "Export CSV"}
        </button>
      </div>

      <div className="root-cause-grid">
        <div className="glass-card analysis-card">
          <p className="analysis-title">Zone Breakdown</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={zoneData} margin={{ top: 22, right: 8, left: 6, bottom: 0 }}>
              <CartesianGrid stroke="#1c1c1f" vertical={false} />
              <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={formatInrThousands} />
              <Bar dataKey="overcharge" fill="var(--accent)" radius={[5, 5, 0, 0]}>
                <LabelList dataKey="hitRate" position="top" fill="#fed7aa" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card analysis-card">
          <p className="analysis-title">Weight Range Breakdown</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weightData} margin={{ top: 22, right: 8, left: 6, bottom: 0 }}>
              <CartesianGrid stroke="#1c1c1f" vertical={false} />
              <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={formatInrThousands} />
              <Bar dataKey="overcharge" fill="var(--accent)" radius={[5, 5, 0, 0]}>
                <LabelList dataKey="share" position="top" fill="#fed7aa" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="root-cause-grid lower">
        <div className="glass-card analysis-card heatmap-wrap">
          <p className="analysis-title">Carrier-Zone Heatmap</p>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table heatmap-table">
              <thead>
                <tr>
                  <th>Carrier</th>
                  {zones.map((zone) => <th key={zone}>{zone}</th>)}
                </tr>
              </thead>
              <tbody>
                {carriers.map((carrier) => (
                  <tr key={carrier}>
                    <td style={{ color: "#fb923c", fontWeight: 600 }}>{carrier}</td>
                    {zones.map((zone) => {
                      const stats = summary.by_carrier_zone[carrier]?.[zone];
                      const rate = stats ? pctNumber(stats.hit_rate) : 0;
                      return (
                        <td key={zone}>
                          <span className={`heat-cell ${heatClass(rate)}`}>
                            {stats?.hit_rate ?? "0%"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card analysis-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Lightbulb size={16} color="#f97316" />
            <p className="analysis-title" style={{ marginBottom: 0 }}>Recommendations</p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {recommendations.map((r) => (
              <div key={r.issue} className="recommendation-item">
                <p style={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}>{r.issue}</p>
                <p><strong>Data:</strong> {r.data}</p>
                <p><strong>Action:</strong> {r.action}</p>
                <p style={{ color: "#f87171", fontWeight: 700 }}>
                  Est. Recovery: {fmt(r.recovery)}
                </p>
              </div>
            ))}
          </div>
          <div className="impact-strip">
            <TrendingDown size={15} color="#ef4444" />
            <span>Monthly loss {fmt(summary.summary.total_overcharge)}</span>
            <span>Annual projection {fmt(summary.summary.total_overcharge * 12)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
