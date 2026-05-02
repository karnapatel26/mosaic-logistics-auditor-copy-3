"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { ChevronLeft, ChevronRight, X, AlertCircle } from "lucide-react";
import type { IssuesResponse, Issue } from "./types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});
const fmt = (n: number) => inr.format(n);

function humanize(t: string) {
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function Skeleton({ w, h }: { w?: string; h?: number }) {
  return <div className="skeleton" style={{ height: h ?? 14, width: w ?? "80%" }} />;
}

interface Props {
  carriers: string[];
  totalIssues?: number;
}

const PAGE_SIZE = 50;

export default function IssuesTable({ carriers, totalIssues }: Props) {
  const [data, setData] = useState<IssuesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [carrier, setCarrier] = useState("");
  const [sort, setSort] = useState("overcharge");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  const load = useCallback(async (p: number, c: string, s: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), limit: String(PAGE_SIZE), sort: s,
      });
      if (c) params.set("carrier", c);
      const { data } = await axios.get<IssuesResponse>(`/api/issues?${params}`);
      setData(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load(page, carrier, sort));
  }, [load, page, carrier, sort]);

  const totalPages = useMemo(() => data ? Math.ceil(data.total / PAGE_SIZE) : 1, [data]);
  const skeletonRows = useMemo(() => Array.from({ length: 8 }), []);
  const skeletonCells = useMemo(() => Array.from({ length: 11 }), []);

  const zoneOk = (issue: Issue) => issue.destination_zone === issue.billed_zone;
  const slabOk = (issue: Issue) => issue.actual_weight_slab === issue.billed_weight_slab;
  const overchargePct = (issue: Issue) => issue.expected_total
    ? (issue.total_overcharge / issue.expected_total) * 100
    : 0;

  const changeCarrier = useCallback((value: string) => {
    setCarrier(value);
    setPage(1);
  }, []);

  const changeSort = useCallback((value: string) => {
    setSort(value);
    setPage(1);
  }, []);

  const previousPage = useCallback(() => {
    setPage(p => Math.max(1, p - 1));
  }, []);

  const nextPage = useCallback(() => {
    setPage(p => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const selectIssue = useCallback((issue: Issue) => {
    setSelectedIssue(issue);
  }, []);

  const closeIssue = useCallback(() => {
    setSelectedIssue(null);
  }, []);

  return (
    <div className="glass-card fade-in fade-in-delay-5" id="issues-table">
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
              Overcharged Shipments
            </p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {data
                ? `${data.total.toLocaleString("en-IN")} issues · page ${page}/${totalPages}`
                : totalIssues
                ? `${totalIssues.toLocaleString("en-IN")} issues`
                : "Loading…"}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              id="carrier-filter"
              className="filter-select"
              value={carrier}
              onChange={e => changeCarrier(e.target.value)}
            >
              <option value="">All Carriers</option>
              {carriers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              id="sort-filter"
              className="filter-select"
              value={sort}
              onChange={e => changeSort(e.target.value)}
            >
              <option value="overcharge">↓ Highest Overcharge</option>
              <option value="date">↓ Newest First</option>
              <option value="carrier">A–Z Carrier</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>AWB Number</th>
              <th>Date</th>
              <th>Carrier</th>
              <th>Actual Zone</th>
              <th>Billed Zone</th>
              <th>Actual Slab</th>
              <th>Billed Slab</th>
              <th>Total Billed</th>
              <th>Overcharge</th>
              <th>Violations</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? skeletonRows.map((_, i) => (
                  <tr key={i}>
                    {skeletonCells.map((_, j) => (
                      <td key={j}><Skeleton /></td>
                    ))}
                  </tr>
                ))
              : data?.data.map((issue) => {
                  const issuePct = overchargePct(issue);
                  const isHigh = issuePct > 20;
                  const isMed = issuePct > 5;
                  return (
                    <tr key={issue.shipment_id} id={`row-${issue.shipment_id}`}
                      onClick={() => selectIssue(issue)}>
                      <td style={{ color: "var(--text-primary)", fontWeight: 500,
                        fontFamily: "monospace", fontSize: "0.76rem" }}>
                        {issue.awb_number}
                      </td>
                      <td>{issue.shipment_date?.slice(0, 10) ?? "—"}</td>
                      <td style={{ color: "var(--accent)" }}>{issue.carrier}</td>
                      <td className="match">{issue.destination_zone}</td>
                      <td className={zoneOk(issue) ? "match" : "mismatch"}>
                        {issue.billed_zone}
                        {!zoneOk(issue) && " ⚠"}
                      </td>
                      <td className="match">{issue.actual_weight_slab}</td>
                      <td className={slabOk(issue) ? "match" : "mismatch"}>
                        {issue.billed_weight_slab}
                        {!slabOk(issue) && " ⚠"}
                      </td>
                      <td style={{ color: "var(--text-primary)" }}>{fmt(issue.total_billed)}</td>
                      <td style={{ color: isHigh ? "var(--red)" : isMed ? "var(--accent)" : "var(--yellow)",
                        fontWeight: 700 }}>
                        {fmt(issue.total_overcharge)}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {issue.violation_types.slice(0, 2).map(v => (
                            <span key={v} className="violation-chip">{humanize(v)}</span>
                          ))}
                          {issue.violation_types.length > 2 && (
                            <span className="violation-chip">
                              +{issue.violation_types.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {isHigh
                          ? <span className="badge badge-high">● High</span>
                          : isMed
                          ? <span className="badge badge-medium">● Med</span>
                          : <span className="badge badge-low">● Low</span>}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {data && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center",
          gap: 12, padding: "14px 24px", borderTop: "1px solid var(--border-subtle)" }}>
          <button id="prev-page-btn"
            disabled={page <= 1}
            onClick={previousPage}
            className="icon-button"
            style={{ padding: "6px 12px", height: "auto" }}>
            <ChevronLeft size={14} /> Prev
          </button>
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            {page} / {totalPages}
          </span>
          <button id="next-page-btn"
            disabled={page >= totalPages}
            onClick={nextPage}
            className="icon-button"
            style={{ padding: "6px 12px", height: "auto" }}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {selectedIssue && createPortal(
        <div className="side-panel-layer" onClick={closeIssue}>
          <aside className="side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="side-panel-header">
              <div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 800,
                  letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Shipment Detail
                </p>
                <p style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: 20 }}>
                  {selectedIssue.awb_number}
                </p>
              </div>
              <button className="panel-close" onClick={closeIssue}
                aria-label="Close shipment detail">
                <X size={17} />
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <button 
                onClick={() => alert(`Dispute flagged for AWB: ${selectedIssue.awb_number}. Case #FLG-${Math.random().toString(36).substr(2, 9).toUpperCase()}`)}
                className="icon-button"
                style={{ width: "100%", justifyContent: "center", background: "rgba(239,68,68,0.15)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.3)", height: 44, fontSize: 14, fontWeight: 700 }}>
                <AlertCircle size={16} /> Flag for Dispute
              </button>
            </div>

            <div className="detail-grid">
              <div>
                <span>Carrier</span>
                <strong>{selectedIssue.carrier}</strong>
              </div>
              <div>
                <span>Date</span>
                <strong>{selectedIssue.shipment_date?.slice(0, 10) ?? "—"}</strong>
              </div>
              <div>
                <span>Payment</span>
                <strong>{selectedIssue.payment_mode}</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{selectedIssue.shipment_type}</strong>
              </div>
            </div>

            <div className="charge-card">
              <p className="panel-section-title">Expected vs Actual Charges</p>
              {[
                ["Base rate", selectedIssue.contracted_rate, selectedIssue.billed_rate],
                ["COD", selectedIssue.expected_cod, selectedIssue.cod_charge],
                ["RTO", selectedIssue.expected_rto, selectedIssue.rto_charge],
                ["Misc", 0, selectedIssue.misc_charges],
                ["Total", selectedIssue.expected_total, selectedIssue.total_billed],
              ].map(([label, expected, actual]) => (
                <div className="charge-row" key={label as string}>
                  <span>{label}</span>
                  <span>{fmt(expected as number)}</span>
                  <strong>{fmt(actual as number)}</strong>
                </div>
              ))}
            </div>

            <div className="overcharge-panel">
              <span>Total Overcharge</span>
              <strong>{fmt(selectedIssue.total_overcharge)}</strong>
              <em>{overchargePct(selectedIssue).toFixed(1)}% above expected</em>
            </div>

            <div>
              <p className="panel-section-title">Root Cause</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selectedIssue.violation_types.map((v) => (
                  <span key={v} className="violation-chip">{humanize(v)}</span>
                ))}
              </div>
            </div>

            <div className="detail-grid" style={{ marginTop: 24 }}>
              <div>
                <span>Actual Zone</span>
                <strong>{selectedIssue.destination_zone}</strong>
              </div>
              <div>
                <span>Billed Zone</span>
                <strong className={zoneOk(selectedIssue) ? "" : "mismatch"}>
                  {selectedIssue.billed_zone}
                </strong>
              </div>
              <div>
                <span>Actual Slab</span>
                <strong>{selectedIssue.actual_weight_slab}</strong>
              </div>
              <div>
                <span>Billed Slab</span>
                <strong className={slabOk(selectedIssue) ? "" : "mismatch"}>
                  {selectedIssue.billed_weight_slab}
                </strong>
              </div>
            </div>
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}
