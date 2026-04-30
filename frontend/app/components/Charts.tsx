"use client";

import { useMemo } from "react";
import type { SummaryResponse } from "./types";
import {
  ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});

// Formats overcharge totals with one shared formatter so chart labels
// stay consistent without recreating currency helpers.
const fmt = (n: number) => inr.format(n);

const COLORS = ["#f97316","#3b82f6","#22c55e","#a855f7","#ec4899","#14b8a6","#eab308","#06b6d4"];

// Converts backend violation codes into readable labels because chart
// legends should be understandable without changing API keys.
function humanize(t: string) {
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Renders the pie tooltip only when Recharts has hover data so empty
// hover states do not create placeholder markup.
function PieTip({ active, payload }: {
  active?: boolean; payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#18181b", border: "1px solid #3f3f46",
      borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      <p style={{ color: "#f97316", fontWeight: 600 }}>{payload[0].name}</p>
      <p style={{ color: "#a1a1aa" }}>{payload[0].value} violations</p>
    </div>
  );
}

interface Props { summary: SummaryResponse }

// Draws carrier and violation charts from summary data so the dashboard
// can show risk patterns without recalculating sorted lists on each render.
export default function Charts({ summary }: Props) {
  const carrierData = useMemo(() => Object.entries(summary.by_carrier)
    .map(([name, s]) => ({ name, overcharge: s.total_overcharge }))
    .sort((a, b) => b.overcharge - a.overcharge), [summary.by_carrier]);
  const violationData = useMemo(() => Object.entries(summary.by_violation_type)
    .map(([name, s]) => ({ name: humanize(name), value: s.count }))
    .sort((a, b) => b.value - a.value), [summary.by_violation_type]);
  const maxOvercharge = carrierData[0]?.overcharge ?? 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24, marginBottom: 32 }}
      className="fade-in fade-in-delay-3">
      <div className="glass-card" style={{ padding: "24px" }} id="chart-carrier">
        <p style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 6 }}>
          Overcharge by Carrier
        </p>
        <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 24 }}>
          Sorted descending — worst offenders first
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {carrierData.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 120, fontSize: 12, color: "#a1a1aa",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
                {c.name}
              </span>
              <div className="hbar-track">
                <div className="hbar-fill"
                  style={{ width: `${(c.overcharge / maxOvercharge) * 100}%` }} />
              </div>
              <span style={{ width: 100, fontSize: 12, color: "#fb923c",
                fontWeight: 600, textAlign: "right", flexShrink: 0 }}>
                {fmt(c.overcharge)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="glass-card" style={{ padding: "24px" }} id="chart-violations">
        <p style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 6 }}>
          Violation Breakdown
        </p>
        <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 16 }}>
          Distribution by violation type
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={violationData} cx="50%" cy="45%"
              innerRadius={55} outerRadius={88} paddingAngle={3} dataKey="value">
              {violationData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<PieTip />} />
            <Legend iconSize={8} iconType="circle"
              wrapperStyle={{ fontSize: 10, color: "#71717a", paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
