"use client";

import { useMemo } from "react";
import type { SummaryResponse } from "./types";
import {
  AlertTriangle, Scale, MapPin, DollarSign,
  TrendingDown, Package, BarChart2, Zap,
} from "lucide-react";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});

// Formats rupee values once with a shared formatter so every card
// shows money consistently without recreating Intl objects.
const fmt = (n: number) => inr.format(n);

// Turns API enum keys into readable labels so the UI can keep using
// stable backend codes while showing human-friendly text.
function humanize(t: string) {
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

interface Props { summary: SummaryResponse }

// Builds the key findings cards from summary data so users can scan
// the highest-risk billing patterns without recalculating on every render.
export default function KeyFindings({ summary }: Props) {
  const { by_violation_type, by_carrier, summary: s } = summary;

  const findings = useMemo(() => {
    const violationEntries = Object.entries(by_violation_type);
    const carrierEntries = Object.entries(by_carrier);
    const topViolation = [...violationEntries]
      .sort((a, b) => b[1].count - a[1].count)[0];
    const topByValue = [...violationEntries]
      .sort((a, b) => b[1].total_overcharge - a[1].total_overcharge)[0];
    const worstCarrier = [...carrierEntries]
      .sort((a, b) => b[1].total_overcharge - a[1].total_overcharge)[0];
    const zoneStats = by_violation_type["ZONE_UPGRADE"];
    const weightStats = by_violation_type["WEIGHT_SLAB_INFLATION"];

    return [
      {
        icon: <AlertTriangle size={16} />,
        color: "#f97316",
        bg: "rgba(249,115,22,0.1)",
        label: "Most Frequent Violation",
        value: topViolation ? humanize(topViolation[0]) : "—",
        sub: topViolation ? `${topViolation[1].count.toLocaleString("en-IN")} occurrences` : "",
      },
      {
        icon: <DollarSign size={16} />,
        color: "#ef4444",
        bg: "rgba(239,68,68,0.1)",
        label: "Highest Value Violation",
        value: topByValue ? humanize(topByValue[0]) : "—",
        sub: topByValue ? fmt(topByValue[1].total_overcharge) + " lost" : "",
      },
      {
        icon: <MapPin size={16} />,
        color: "#a855f7",
        bg: "rgba(168,85,247,0.1)",
        label: "Zone Upgrade Fraud",
        value: zoneStats ? `${zoneStats.count.toLocaleString("en-IN")} shipments` : "None found",
        sub: zoneStats ? fmt(zoneStats.total_overcharge) + " overcharged" : "",
      },
      {
        icon: <Scale size={16} />,
        color: "#3b82f6",
        bg: "rgba(59,130,246,0.1)",
        label: "Weight Slab Inflation",
        value: weightStats ? `${weightStats.count.toLocaleString("en-IN")} shipments` : "None found",
        sub: weightStats ? fmt(weightStats.total_overcharge) + " overcharged" : "",
      },
      {
        icon: <TrendingDown size={16} />,
        color: "#ef4444",
        bg: "rgba(239,68,68,0.1)",
        label: "Worst Carrier",
        value: worstCarrier ? worstCarrier[0] : "—",
        sub: worstCarrier
          ? `${fmt(worstCarrier[1].total_overcharge)} · ${worstCarrier[1].hit_rate_pct}% hit rate`
          : "",
      },
      {
        icon: <Zap size={16} />,
        color: "#eab308",
        bg: "rgba(234,179,8,0.1)",
        label: "Overcharge % of Spend",
        value: `${s.overcharge_pct_of_spend}%`,
        sub: `explains the ~15% budget overrun`,
      },
      {
        icon: <Package size={16} />,
        color: "#22c55e",
        bg: "rgba(34,197,94,0.1)",
        label: "Shipments Affected",
        value: s.overcharged_count.toLocaleString("en-IN"),
        sub: `${s.overcharge_rate_pct}% of all shipments`,
      },
      {
        icon: <BarChart2 size={16} />,
        color: "#14b8a6",
        bg: "rgba(20,184,166,0.1)",
        label: "Unique Violation Types",
        value: violationEntries.length.toString(),
        sub: "distinct billing fraud patterns",
      },
    ];
  }, [by_carrier, by_violation_type, s.overcharge_pct_of_spend, s.overcharge_rate_pct, s.overcharged_count]);

  return (
    <div style={{ marginBottom: 32 }} className="fade-in fade-in-delay-2">
      <p style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 6 }}>
        Key Findings
      </p>
      <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 20 }}>
        Patterns discovered automatically from the billing data
      </p>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 24,
      }}>
        {findings.map((f, i) => (
          <div className="finding-card" key={i}>
            <div
              className="finding-icon"
              style={{ background: f.bg, color: f.color }}
            >
              {f.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10, color: "#52525b", fontWeight: 600,
                letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
                {f.label}
              </p>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#fafafa",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.value}
              </p>
              <p style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>{f.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
