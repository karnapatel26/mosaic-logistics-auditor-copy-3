"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { IssuesResponse, Issue } from "./types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});

// Formats charges with one shared formatter so every table and panel
// amount uses the same rupee display without recreating Intl objects.
const fmt = (n: number) => inr.format(n);

// Turns backend violation codes into readable chips because the API
// keeps stable enum names that are not friendly table labels.
function humanize(t: string) {
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Draws a fixed-size loading block so the table keeps its shape while
// issue rows are being fetched.
function Skeleton({ w, h }: { w?: string; h?: number }) {
  return <div className="skeleton" style={{ height: h ?? 14, width: w ?? "80%" }} />;
}

interface Props {
  carriers: string[];
  totalIssues?: number;
}

const PAGE_SIZE = 50;

// Displays paginated overcharge issues and a detail panel so users can
// inspect invoice errors without loading every shipment at once.
export default function IssuesTable({ carriers, totalIssues }: Props) {
  const [data, setData] = useState<IssuesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [carrier, setCarrier] = useState("");
  const [sort, setSort] = useState("overcharge");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  // Loads one page at a time because the issue list can be large and
  // fetching everything would slow the browser.
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

  // Checks zone agreement so mismatched billing zones can be highlighted
  // without duplicating the comparison in the table and detail panel.
  const zoneOk = (issue: Issue) => issue.destination_zone === issue.billed_zone;

  // Checks slab agreement so weight inflation is shown consistently in
  // both the row and the shipment detail panel.
  const slabOk = (issue: Issue) => issue.actual_weight_slab === issue.billed_weight_slab;

  // Calculates the overcharge percentage from expected cost because
  // severity badges need a normalized risk value.
  const overchargePct = (issue: Issue) => issue.expected_total
    ? (issue.total_overcharge / issue.expected_total) * 100
    : 0;

  // Resets pagination when the carrier changes because filtered results
  // may not have the same page count as the previous view.
  const changeCarrier = useCallback((value: string) => {
    setCarrier(value);
    setPage(1);
  }, []);

  // Resets pagination when sorting changes so users see the first page
  // of the newly ordered issue list.
  const changeSort = useCallback((value: string) => {
    setSort(value);
    setPage(1);
  }, []);

  // Moves backward one page while guarding against page zero.
  const previousPage = useCallback(() => {
    setPage(p => Math.max(1, p - 1));
  }, []);

  // Moves forward one page while guarding against going past the API total.
  const nextPage = useCallback(() => {
    setPage(p => Math.min(totalPages, p + 1));
  }, [totalPages]);

  // Opens the side panel for the clicked shipment so users can review
  // charge-level evidence without leaving the table.
  const selectIssue = useCallback((issue: Issue) => {
    setSelectedIssue(issue);
  }, []);

  // Closes the side panel from the backdrop or close button so the same
  // behavior is reused in both places.
  const closeIssue = useCallback(() => {
    setSelectedIssue(null);
  }, []);

  return (
    <div className="glass-card fade-in fade-in-delay-5" id="issues-table">
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1c1c1f" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", marginBottom: 4 }}>
              Overcharged Shipments
            </p>
            <p style={{ fontSize: 13, color: "#a1a1aa" }}>
              {data
                ? `${data.total.toLocaleString("en-IN")} issues · page ${page}/${totalPages}`
                : totalIssues
                ? `${totalIssues.toLocaleString("en-IN")} issues`
                : "Loading…"}
            </p>
          </div>

          {/* Filters */}
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

      {/* Table */}
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
                      <td style={{ color: "#fafafa", fontWeight: 500,
                        fontFamily: "monospace", fontSize: "0.76rem" }}>
                        {issue.awb_number}
                      </td>
                      <td>{issue.shipment_date?.slice(0, 10) ?? "—"}</td>
                      <td style={{ color: "#fb923c" }}>{issue.carrier}</td>
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
                      <td>{fmt(issue.total_billed)}</td>
                      <td style={{ color: isHigh ? "#f87171" : isMed ? "#fb923c" : "#facc15",
                        fontWeight: 600 }}>
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

      {/* Pagination */}
      {data && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center",
          gap: 12, padding: "14px 24px", borderTop: "1px solid #1c1c1f" }}>
          <button id="prev-page-btn"
            disabled={page <= 1}
            onClick={previousPage}
            style={{ padding: "6px 12px", background: "transparent",
              border: "1px solid #27272a", borderRadius: 6,
              color: page <= 1 ? "#3f3f46" : "#a1a1aa",
              cursor: page <= 1 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <ChevronLeft size={14} /> Prev
          </button>
          <span style={{ fontSize: 13, color: "#52525b" }}>
            {page} / {totalPages}
          </span>
          <button id="next-page-btn"
            disabled={page >= totalPages}
            onClick={nextPage}
            style={{ padding: "6px 12px", background: "transparent",
              border: "1px solid #27272a", borderRadius: 6,
              color: page >= totalPages ? "#3f3f46" : "#a1a1aa",
              cursor: page >= totalPages ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {selectedIssue && createPortal(
        <div className="side-panel-layer" onClick={closeIssue}>
          <aside className="side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="side-panel-header">
              <div>
                <p style={{ fontSize: 11, color: "#71717a", fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Shipment Detail
                </p>
                <p style={{ color: "#fafafa", fontWeight: 800, fontSize: 18 }}>
                  {selectedIssue.awb_number}
                </p>
              </div>
              <button className="panel-close" onClick={closeIssue}
                aria-label="Close shipment detail">
                <X size={17} />
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

            <div className="detail-grid">
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
