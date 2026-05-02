"use client";

import { useCallback, useMemo, useState } from "react";
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
import type { SummaryResponse } from "./types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});
const fmt = (n: number) => inr.format(n);

function pctNumber(value: string) {
  return Number(value.replace("%", "")) || 0;
}

function heatClass(rate: number) {
  if (rate > 5) return "heat-high";
  if (rate >= 2) return "heat-medium";
  return "heat-low";
}

function maxBy<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce<T | undefined>((best, item) => (
    !best || getValue(item) > getValue(best) ? item : best
  ), undefined);
}

function formatInrThousands(value: unknown) {
  return `₹${Math.round(Number(value) / 1000)}k`;
}

interface Props {
  summary: SummaryResponse;
}

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

  const exportCsv = useCallback(() => {
    setExporting(true);
    window.location.href = "/api/export";
    setTimeout(() => setExporting(false), 2000);
  }, []);

  return (
    <section className="fade-in fade-in-delay-3" style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16,
        alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            Root Cause Analysis Pattern
          </p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Segment-level leakage patterns from automated audit aggregates
          </p>
        </div>
        <button className="icon-button" onClick={exportCsv} disabled={exporting}>
          <Download size={14} /> {exporting ? "Preparing..." : "Export Dispute CSV"}
        </button>
      </div>

      <div className="root-cause-grid">
        <div className="glass-card analysis-card">
          <p className="analysis-title">Leakage by Zone</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={zoneData} margin={{ top: 22, right: 8, left: 6, bottom: 0 }}>
              <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={formatInrThousands} />
              <Bar dataKey="overcharge" fill="var(--accent)" radius={[5, 5, 0, 0]}>
                <LabelList dataKey="hitRate" position="top" fill="var(--text-primary)" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card analysis-card">
          <p className="analysis-title">Leakage by Weight Slab</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weightData} margin={{ top: 22, right: 8, left: 6, bottom: 0 }}>
              <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={formatInrThousands} />
              <Bar dataKey="overcharge" fill="var(--accent)" radius={[5, 5, 0, 0]}>
                <LabelList dataKey="share" position="top" fill="var(--text-primary)" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="root-cause-grid lower">
        <div className="glass-card analysis-card heatmap-wrap">
          <p className="analysis-title">Carrier-Zone Hit Rate Heatmap</p>
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
                    <td style={{ color: "var(--accent)", fontWeight: 700 }}>{carrier}</td>
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

        <div className="glass-card analysis-card" style={{ background: "rgba(9,9,11,0.6)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Lightbulb size={16} color="var(--accent)" />
            <p className="analysis-title" style={{ marginBottom: 0 }}>Smart Recommendations</p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {recommendations.map((r) => (
              <div key={r.issue} className="recommendation-item">
                <p style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{r.issue}</p>
                <p><strong>Pattern:</strong> {r.data}</p>
                <p><strong>Action:</strong> {r.action}</p>
                <p style={{ color: "var(--red)", fontWeight: 800, marginTop: 4 }}>
                  Est. Recovery: {fmt(r.recovery)}
                </p>
              </div>
            ))}
          </div>
          <div className="impact-strip">
            <TrendingDown size={15} color="var(--red)" />
            <span>Projected Monthly Recovery: {fmt(summary.summary.total_overcharge)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
