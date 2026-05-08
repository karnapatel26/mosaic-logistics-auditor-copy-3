"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart2,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { downloadCsv, buildOverbillingCsv } from "@/lib/exportCsv";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatters";
import { summarizeShipments } from "@/lib/reconciliation";
import type { AuditResponse, ReconciledShipment } from "./types";

type Filters = {
  carrier: string;
  errorType: string;
  zone: string;
  paymentMode: string;
  deliveryStatus: string;
  search: string;
};

const emptyFilters: Filters = {
  carrier: "",
  errorType: "",
  zone: "",
  paymentMode: "",
  deliveryStatus: "",
  search: "",
};

const chartTooltipStyle = {
  backgroundColor: "#fff",
  border: "1px solid var(--border-soft)",
  borderRadius: 8,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  color: "var(--text)",
  fontSize: 12,
  lineHeight: 1.55,
  padding: "10px 12px",
};
const chartTooltipLabelStyle = {
  color: "var(--text)",
  fontWeight: 700,
};
const exactInr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const rowsPerPage = 25;

function compactTick(value: string | number, maxLength = 14) {
  const label = String(value);
  return label.length > maxLength ? `${label.slice(0, maxLength - 3)}...` : label;
}

function formatExactCurrency(value: number) {
  return exactInr.format(Number.isFinite(value) ? value : 0);
}

function matchesFilters(shipment: ReconciledShipment, filters: Filters) {
  const query = filters.search.trim().toLowerCase();
  return (
    (!filters.carrier || shipment.carrier === filters.carrier) &&
    (!filters.errorType || shipment.error_reasons.includes(filters.errorType)) &&
    (!filters.zone || shipment.destination_zone === filters.zone) &&
    (!filters.paymentMode || shipment.payment_mode === filters.paymentMode) &&
    (!filters.deliveryStatus || shipment.delivery_status === filters.deliveryStatus) &&
    (!query ||
      shipment.shipment_id.toLowerCase().includes(query) ||
      shipment.awb_number.toLowerCase().includes(query))
  );
}

function topCarrierAction(summary: AuditResponse["summary"]) {
  return summary.worst_carrier === "None"
    ? "No carrier dispute is needed from the current filtered view."
    : `Audit ${summary.worst_carrier} first and validate its highest-value invoice lines before payment release.`;
}

function overbilledShipmentRate(summary: AuditResponse["summary"]) {
  return summary.total_shipments
    ? (summary.affected_shipments / summary.total_shipments) * 100
    : 0;
}

function recommendedAction(reasons: string[]) {
  const actionMap = [
    ["RTO/return charge mismatch", "Dispute RTO Charge"],
    ["Weight slab mismatch", "Dispute Weight Slab"],
    ["Zone mismatch", "Dispute Zone Billing"],
    ["COD/payment charge mismatch", "Dispute COD Charge"],
    ["Extra charge/surcharge mismatch", "Review Misc Charge"],
    ["Rate Card Match Missing", "Review Rate Card"],
  ] as const;

  return actionMap.find(([reason]) => reasons.includes(reason))?.[1] ?? "Manual Review";
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select className="filter-select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="kpi-card">
      <span className="eyebrow">{label}</span>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-detail">{detail}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>;
}

type EvidenceRow = {
  check: string;
  expected: string;
  billed: string;
};

function formatAvailableCurrency(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? formatCurrency(value) : "Not available";
}

function safeValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Not available";
  if (typeof value === "string" && value.trim()) return value;
  return "Not available";
}

function firstAvailable(values: Array<string | number | null | undefined>) {
  return values.map((value) => safeValue(value)).find((value) => value !== "Not available") ?? "Not available";
}

function reasonText(shipment: ReconciledShipment) {
  return shipment.error_reasons.join(", ");
}

type ProofKind = "zone" | "weight" | "rto" | "cod" | "misc" | "rate-card" | "manual";

function expectedCodCharge(shipment: ReconciledShipment) {
  if (!shipment.matched_rate) return null;
  return shipment.payment_mode === "COD" ? shipment.matched_rate.cod_fee : 0;
}

function expectedRtoCharge(shipment: ReconciledShipment) {
  if (!shipment.matched_rate) return null;
  return shipment.shipment_type === "RTO"
    ? shipment.matched_rate.base_rate * shipment.matched_rate.rto_multiplier
    : 0;
}

function proofKindFromReason(reason: string): ProofKind | null {
  const normalizedReason = reason.toLowerCase();
  if (normalizedReason.includes("weight slab mismatch")) return "weight";
  if (normalizedReason.includes("zone mismatch")) return "zone";
  if (normalizedReason.includes("cod") || normalizedReason.includes("payment")) return "cod";
  if (normalizedReason.includes("extra charge") || normalizedReason.includes("surcharge")) return "misc";
  if (normalizedReason.includes("rto") || normalizedReason.includes("return charge")) return "rto";
  if (normalizedReason.includes("rate card match missing")) return "rate-card";
  return null;
}

function getProofKind(shipment: ReconciledShipment): ProofKind {
  return proofKindFromReason(shipment.primary_error) ?? proofKindFromReason(reasonText(shipment)) ?? "manual";
}

function buildWhyDispute(proofKind: ProofKind) {
  if (proofKind === "zone") {
    return "Shipment was billed using a different zone than the contracted destination zone.";
  }

  if (proofKind === "weight") {
    return "Shipment was billed using a different weight slab than the actual shipment slab.";
  }

  if (proofKind === "rto") {
    return "RTO charge was billed, but this shipment record does not qualify for RTO billing.";
  }

  if (proofKind === "cod") {
    return "COD charge was billed even though the payment mode does not qualify for COD billing.";
  }

  if (proofKind === "misc") {
    return "Extra/misc charge was billed beyond the expected contracted charge.";
  }

  if (proofKind === "rate-card") {
    return "This shipment needs rate-card validation before the billing line can be cleared.";
  }

  return "This shipment requires manual review against the contracted billing record.";
}

function buildEvidenceRows(shipment: ReconciledShipment, proofKind: ProofKind): EvidenceRow[] {
  const totalChargeRow = {
    check: "Total Charge",
    expected: formatCurrency(shipment.expected_charge),
    billed: formatCurrency(shipment.billed_charge),
  };

  if (proofKind === "rto") {
    return [
      { check: "RTO Charge", expected: formatAvailableCurrency(expectedRtoCharge(shipment)), billed: formatCurrency(shipment.rto_charge) },
      { check: "Shipment Type / Status", expected: firstAvailable([shipment.shipment_type, shipment.delivery_status]), billed: "RTO charged" },
      totalChargeRow,
    ];
  }

  if (proofKind === "zone") {
    return [
      { check: "Zone", expected: safeValue(shipment.destination_zone), billed: safeValue(shipment.billed_zone) },
      { check: "Weight Slab", expected: safeValue(shipment.actual_weight_slab), billed: safeValue(shipment.billed_weight_slab) },
      totalChargeRow,
    ];
  }

  if (proofKind === "weight") {
    return [
      { check: "Weight Slab", expected: safeValue(shipment.actual_weight_slab), billed: safeValue(shipment.billed_weight_slab) },
      { check: "Zone", expected: safeValue(shipment.destination_zone), billed: safeValue(shipment.billed_zone) },
      totalChargeRow,
    ];
  }

  if (proofKind === "cod") {
    return [
      { check: "COD Charge", expected: formatAvailableCurrency(expectedCodCharge(shipment)), billed: formatCurrency(shipment.cod_charge) },
      { check: "Payment Mode", expected: safeValue(shipment.payment_mode), billed: "COD charged" },
      totalChargeRow,
    ];
  }

  if (proofKind === "misc") {
    return [
      { check: "Misc Charge", expected: formatCurrency(0), billed: formatCurrency(shipment.misc_charges) },
      totalChargeRow,
    ];
  }

  return [
    { check: "Billing Basis", expected: firstAvailable([shipment.destination_zone, shipment.actual_weight_slab]), billed: firstAvailable([shipment.billed_zone, shipment.billed_weight_slab]) },
    totalChargeRow,
  ];
}

function EvidenceTable({ rows }: { rows: EvidenceRow[] }) {
  return (
    <table className="evidence-table">
      <thead>
        <tr>
          <th>Check</th>
          <th>Expected</th>
          <th>Billed / Found</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.check}>
            <td>{row.check}</td>
            <td>{row.expected}</td>
            <td>{row.billed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function buildDisputeNote(shipment: ReconciledShipment, proofKind: ProofKind) {
  const moneyText = `Expected charge was ${formatCurrency(shipment.expected_charge)} and billed charge was ${formatCurrency(shipment.billed_charge)}, creating an overcharge of ${formatCurrency(shipment.overcharge)}. Please review and reverse the excess charge.`;

  if (proofKind === "zone") {
    return `Shipment ${shipment.shipment_id} / ${shipment.awb_number} was billed using ${shipment.billed_zone}, but the contracted destination zone is ${shipment.destination_zone}. ${moneyText}`;
  }

  if (proofKind === "weight") {
    return `Shipment ${shipment.shipment_id} / ${shipment.awb_number} was billed using ${shipment.billed_weight_slab}, but the actual shipment slab is ${shipment.actual_weight_slab}. ${moneyText}`;
  }

  if (proofKind === "rto") {
    return `Shipment ${shipment.shipment_id} / ${shipment.awb_number} was billed with an incorrect RTO/return charge. ${moneyText}`;
  }

  if (proofKind === "cod") {
    return `Shipment ${shipment.shipment_id} / ${shipment.awb_number} includes an incorrect COD/payment charge. ${moneyText}`;
  }

  if (proofKind === "misc") {
    return `Shipment ${shipment.shipment_id} / ${shipment.awb_number} includes an extra/misc charge beyond expected billing. ${moneyText}`;
  }

  return `Shipment ${shipment.shipment_id} / ${shipment.awb_number} requires review for ${reasonText(shipment)}. ${moneyText}`;
}

function ShipmentDetailDrawer({
  shipment,
  onClose,
}: {
  shipment: ReconciledShipment;
  onClose: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const violationReason = reasonText(shipment);
  const proofKind = getProofKind(shipment);
  const whyDispute = buildWhyDispute(proofKind);
  const evidenceRows = buildEvidenceRows(shipment, proofKind);
  const actionText = `Raise dispute with ${shipment.carrier} for ${formatCurrency(shipment.overcharge)}.`;
  const disputeNote = buildDisputeNote(shipment, proofKind);

  const copyDisputeMessage = async () => {
    try {
      await navigator.clipboard.writeText(disputeNote);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <>
      <button className="drawer-backdrop" aria-label="Close dispute decision" onClick={onClose} />
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="shipment-detail-title">
        <div className="drawer-header">
          <div>
            <h2 id="shipment-detail-title">Dispute Decision</h2>
            <p>{shipment.shipment_id} · {shipment.carrier}</p>
            <small>{shipment.awb_number}</small>
          </div>
          <button className="drawer-close-button" aria-label="Close dispute decision" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="decision-card">
          <span>Dispute Recommended</span>
          <strong>Recover {formatCurrency(shipment.overcharge)}</strong>
          <p>Reason: {violationReason}</p>
        </div>

        <div className="drawer-section-card">
          <h3>Why dispute?</h3>
          <p className="drawer-why-text">{whyDispute}</p>
        </div>

        <div className="drawer-section-card">
          <h3>Evidence</h3>
          <EvidenceTable rows={evidenceRows} />
        </div>

        <div className="drawer-section-card">
          <h3>Action</h3>
          <p className="drawer-action-text">{actionText}</p>
          <button className="icon-button copy-note-button" onClick={copyDisputeMessage}>
            {copyStatus === "copied" ? "Copied" : "Copy Dispute Message"}
          </button>
          <p className="copy-helper">Copies a ready-to-send dispute message.</p>
          {copyStatus === "failed" ? <p className="copy-status">Copy failed. Select the note text and copy manually.</p> : null}
        </div>
      </aside>
    </>
  );
}

export default function DashboardClient() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showAllAudited, setShowAllAudited] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<ReconciledShipment | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/audit", { cache: "no-store" });
        if (!response.ok) throw new Error(`Audit API returned ${response.status}`);
        const json = await response.json() as AuditResponse;
        if (active) setData(json);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load audit data.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const filteredShipments = useMemo(() => (
    data?.shipments.filter((shipment) => matchesFilters(shipment, filters)) ?? []
  ), [data, filters]);

  const filteredAudit = useMemo(() => summarizeShipments(filteredShipments), [filteredShipments]);
  const overbilledRows = useMemo(() => (
    filteredShipments
      .filter((shipment) => shipment.status === "Overbilled" && shipment.overcharge > 0)
      .sort((a, b) => b.overcharge - a.overcharge)
  ), [filteredShipments]);
  const auditRows = useMemo(() => (
    [...filteredShipments].sort((a, b) => {
      if (a.status === "Overbilled" && b.status !== "Overbilled") return -1;
      if (a.status !== "Overbilled" && b.status === "Overbilled") return 1;
      return b.overcharge - a.overcharge;
    })
  ), [filteredShipments]);

  const carrierRows = useMemo(() => Object.values(filteredAudit.by_carrier)
    .sort((a, b) => b.total_overcharge - a.total_overcharge), [filteredAudit.by_carrier]);
  const impactRows = useMemo(() => Object.values(filteredAudit.by_error_type)
    .sort((a, b) => b.total_overcharge - a.total_overcharge), [filteredAudit.by_error_type]);
  const rootCauseRows = useMemo(() => Object.values(filteredAudit.by_error_type)
    .sort((a, b) => b.count - a.count), [filteredAudit.by_error_type]);
  const tableRows = showAllAudited ? auditRows : overbilledRows;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / rowsPerPage));
  const visibleRows = tableRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    if (!selectedShipment) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedShipment(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedShipment]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setPage(1);
    setSelectedShipment(null);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setPage(1);
    setSelectedShipment(null);
    setFilters(emptyFilters);
  };

  const exportFilteredCsv = () => {
    downloadCsv("mosaic-dispute-queue.csv", buildOverbillingCsv(overbilledRows));
  };

  if (loading) {
    return (
      <main className="page-shell">
        <div className="hero-row">
          <div>
            <p className="eyebrow">Carrier Billing Recovery</p>
            <h1>Mosaic Logistics Billing Auditor</h1>
            <p>Preparing dispute-ready reconciliation from the live Mosaic APIs.</p>
          </div>
        </div>
        <div className="summary-grid">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton-card" />)}</div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="page-shell">
        <div className="error-panel">
          <AlertTriangle size={20} />
          <div>
            <strong>Audit data could not be loaded.</strong>
            <p>{error || "Unknown loading issue."}</p>
          </div>
        </div>
      </main>
    );
  }

  const summary = filteredAudit.summary;
  const highestImpactIssue = impactRows[0];
  const mostCommonIssue = rootCauseRows[0];
  const worstCarrier = carrierRows.find((carrier) => carrier.carrier === summary.worst_carrier);
  const isCarrierFiltered = Boolean(filters.carrier && filters.carrier !== "All");
  const smartSummaryCarrier = isCarrierFiltered ? filters.carrier : summary.worst_carrier;
  const smartSummaryCarrierAmount = worstCarrier ? ` (${formatCurrency(worstCarrier.total_overcharge)})` : "";
  const maxCarrierOvercharge = Math.max(...carrierRows.map((row) => row.total_overcharge), 1);
  const maxRootCauseCount = Math.max(...rootCauseRows.map((row) => row.count), 1);
  const tableSubtitle = showAllAudited
    ? `${formatNumber(filteredShipments.length)} audited shipments · ${formatNumber(overbilledRows.length)} overbilled`
    : `${formatNumber(overbilledRows.length)} dispute-ready shipments · sorted by highest overcharge`;

  return (
    <main className="page-shell">
      <section className="hero-row">
        <div>
          <p className="eyebrow">Carrier Billing Recovery</p>
          <h1>Mosaic Logistics Billing Auditor</h1>
          <p>Dispute-ready reconciliation tool for detecting recoverable carrier overbilling.</p>
        </div>
        <button className="icon-button primary" onClick={exportFilteredCsv}>
          <Download size={16} /> Export Dispute CSV
        </button>
      </section>

      <section className="filters-panel">
        <label className="filter-field search-field">
          <span>Shipment / AWB</span>
          <div className="search-box">
            <Search size={15} />
            <input
              value={filters.search}
              placeholder="Search ID or AWB"
              onChange={(event) => updateFilter("search", event.target.value)}
            />
          </div>
        </label>
        <SelectFilter label="Carrier" value={filters.carrier} options={data.filter_options.carriers} onChange={(value) => updateFilter("carrier", value)} />
        <SelectFilter label="Violation Type" value={filters.errorType} options={data.filter_options.errorTypes} onChange={(value) => updateFilter("errorType", value)} />
        <SelectFilter label="Zone" value={filters.zone} options={data.filter_options.zones} onChange={(value) => updateFilter("zone", value)} />
        <SelectFilter label="Payment" value={filters.paymentMode} options={data.filter_options.paymentModes} onChange={(value) => updateFilter("paymentMode", value)} />
        <SelectFilter label="Delivery" value={filters.deliveryStatus} options={data.filter_options.deliveryStatuses} onChange={(value) => updateFilter("deliveryStatus", value)} />
        <button className="icon-button reset-button" onClick={resetFilters}>
          <RefreshCw size={15} /> Reset
        </button>
      </section>

      <section className="summary-grid" aria-labelledby="executive-summary-title">
        <h2 id="executive-summary-title" className="sr-only">Recovery Summary Cards</h2>
        <Kpi label="Total Shipments Audited" value={formatNumber(summary.total_shipments)} detail="Filtered shipment count" />
        <Kpi label="Recoverable Overbilling" value={formatCurrency(summary.total_potential_overbilling)} detail="Positive overcharges only" />
        <Kpi label="Affected Shipments" value={formatNumber(summary.affected_shipments)} detail="Dispute-ready overbilled rows" />
        <Kpi label="Violation Events" value={formatNumber(summary.violation_events)} detail="Root-cause events on affected rows" />
        <Kpi
          label="First Carrier to Audit"
          value={summary.worst_carrier}
          detail={worstCarrier
            ? `${formatCurrency(worstCarrier.total_overcharge)} recoverable · top issue: ${worstCarrier.most_common_violation_type}`
            : "Highest recoverable amount"}
        />
        <Kpi
          label="Highest Impact Issue"
          value={summary.highest_impact_error_type}
          detail={highestImpactIssue ? formatCurrency(highestImpactIssue.total_overcharge) : "No recoverable impact"}
        />
      </section>

      <section className="panel spend-context">
        <div className="section-title compact-title">
          <FileText size={17} />
          <div>
            <h2>Spend Context</h2>
            <p>Filtered invoice spend behind the recovery queue.</p>
          </div>
        </div>
        <div className="context-grid">
          <div className="context-metric">
            <span>Total Billed Amount</span>
            <strong>{formatExactCurrency(summary.total_billed)}</strong>
            <small>Carrier invoice amount</small>
          </div>
          <div className="context-metric">
            <span>Total Expected Amount</span>
            <strong>{formatExactCurrency(summary.total_expected)}</strong>
            <small>Matched rate-card charge</small>
          </div>
          <div className="context-metric">
            <span>Overbilled Shipment Rate</span>
            <strong>{formatPercent(overbilledShipmentRate(summary))}</strong>
            <small>{formatNumber(summary.affected_shipments)} of {formatNumber(summary.total_shipments)} audited shipments</small>
          </div>
        </div>
      </section>

      <section className="panel priority-queue-panel">
        <div className="section-title table-heading">
          <div>
            <h2>Priority Dispute Queue</h2>
            <p>{tableSubtitle}</p>
          </div>
          <div className="table-actions">
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={showAllAudited}
                onChange={(event) => {
                  setPage(1);
                  setSelectedShipment(null);
                  setShowAllAudited(event.target.checked);
                }}
              />
              <span>Show all audited shipments</span>
            </label>
            <div className="pager">
              <span className="page-indicator">Page {page} of {totalPages}</span>
              <button className="icon-button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Prev</button>
              <button className="icon-button" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Shipment / AWB</th>
                <th>Carrier</th>
                <th>Violation Reason</th>
                <th>Recommended Action</th>
                <th>Overcharge</th>
                <th>Expected Charge</th>
                <th>Billed Charge</th>
                <th>Payment Mode</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? visibleRows.map((shipment) => {
                const isDisputeReady = shipment.status === "Overbilled" && shipment.overcharge > 0;
                const isSelected = isDisputeReady && selectedShipment?.shipment_id === shipment.shipment_id;
                const rowClassName = [
                  isDisputeReady ? "priority-queue-row" : "",
                  shipment.status === "Overbilled" ? "overbilled-row" : "",
                  isSelected ? "selected-row" : "",
                ].filter(Boolean).join(" ");

                return (
                  <tr
                    key={shipment.shipment_id}
                    className={rowClassName}
                    role={isDisputeReady ? "button" : undefined}
                    tabIndex={isDisputeReady ? 0 : undefined}
                    aria-pressed={isDisputeReady ? isSelected : undefined}
                    title={isDisputeReady ? undefined : "Dispute drawer is available only for overbilled shipments."}
                    onClick={() => {
                      if (isDisputeReady) setSelectedShipment(shipment);
                    }}
                    onKeyDown={(event) => {
                      if (!isDisputeReady) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedShipment(shipment);
                      }
                    }}
                  >
                    <td><strong>{shipment.shipment_id}</strong><span>{shipment.awb_number}</span></td>
                    <td>{shipment.carrier}</td>
                    <td>{shipment.error_reasons.join(", ")}</td>
                    <td><span className="action-pill">{recommendedAction(shipment.error_reasons)}</span></td>
                    <td className={shipment.overcharge > 0 ? "amount-danger" : undefined}>{formatCurrency(shipment.overcharge)}</td>
                    <td>{formatCurrency(shipment.expected_charge)}</td>
                    <td>{formatCurrency(shipment.billed_charge)}</td>
                    <td>{shipment.payment_mode}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8}><EmptyState message={showAllAudited ? "No shipments match the current filters." : "No dispute-ready overbilled shipments match the current filters."} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-grid two">
        <div className="panel">
          <div className="section-title">
            <BarChart2 size={17} />
            <div>
              <h2>Carrier-wise Recoverable Overbilling</h2>
              <p>Recoverable amount by carrier, sorted by where audit effort should start.</p>
            </div>
          </div>
          {carrierRows.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={carrierRows.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 16, left: 26, bottom: 8 }}>
                <CartesianGrid stroke="var(--border-soft)" horizontal={false} />
                <XAxis type="number" axisLine={false} tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} />
                <YAxis type="category" dataKey="carrier" width={126} axisLine={false} tickFormatter={(value) => compactTick(value, 16)} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} formatter={(value) => formatCurrency(Number(value))} labelFormatter={(label) => `Carrier: ${label}`} />
                <Bar dataKey="total_overcharge" fill="#2563eb" radius={[0, 7, 7, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No carrier data in this view." />}
        </div>

        <div className="panel">
          <div className="section-title">
            <Target size={17} />
            <div>
              <h2>Root Cause Breakdown</h2>
              <p>Violation types by event count in the current filtered view.</p>
            </div>
          </div>
          {rootCauseRows.length ? (
            <div className="ranked-list" aria-label="Root cause ranked list">
              {rootCauseRows.map((cause) => (
                <div className="ranked-row" key={cause.error_type}>
                  <div className="ranked-row-heading">
                    <strong>{cause.error_type}</strong>
                    <span>{formatNumber(cause.count)}</span>
                  </div>
                  <div className="bar-track">
                    <div style={{ width: `${(cause.count / maxRootCauseCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No violation types in this view." />}
        </div>
      </section>

      <section className="section-grid two">
        <div className="panel">
          <div className="section-title">
            <Target size={17} />
            <div>
              <h2>Financial Impact by Root Cause</h2>
              <p>Recoverable amount attributed to each primary violation type.</p>
            </div>
          </div>
          {impactRows.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={impactRows.slice(0, 8)} margin={{ top: 16, right: 12, left: 0, bottom: 22 }}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} />
                <XAxis axisLine={false} dataKey="error_type" height={46} interval={0} tickFormatter={(value) => compactTick(value, 12)} tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} tickMargin={8} />
                <YAxis axisLine={false} tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="total_overcharge" fill="#f59e0b" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No recoverable impact in this view." />}
        </div>

        <div className="panel">
          <div className="section-title">
            <ShieldCheck size={17} />
            <div>
              <h2>Smart Audit Summary</h2>
              <p>Action summary from the current filtered recovery view.</p>
            </div>
          </div>
          <ul className="smart-summary-list">
            <li>Potential overbilling of <strong>{formatCurrency(summary.total_potential_overbilling)}</strong> detected across <strong>{formatNumber(summary.affected_shipments)}</strong> affected shipments.</li>
            <li>{isCarrierFiltered ? "Carrier under review" : "First carrier to audit"}: <strong>{smartSummaryCarrier}</strong>{smartSummaryCarrierAmount}.</li>
            <li>Most common issue: <strong>{mostCommonIssue?.error_type ?? summary.most_common_error_type}</strong>{mostCommonIssue ? ` (${formatNumber(mostCommonIssue.count)} events)` : ""}.</li>
            <li>Highest financial-impact issue: <strong>{summary.highest_impact_error_type}</strong>{highestImpactIssue ? ` (${formatCurrency(highestImpactIssue.total_overcharge)})` : ""}.</li>
            <li>
              {isCarrierFiltered ? "Recommended action" : "Recommended first action"}:{" "}
              <strong>{isCarrierFiltered ? "Validate this carrier's highest-value invoice lines before payment release." : topCarrierAction(summary)}</strong>
            </li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <BarChart2 size={17} />
          <div>
            <h2>Carrier Audit Scorecard</h2>
            <p>Carrier-level recovery context for the current filtered view.</p>
          </div>
        </div>
        {carrierRows.length ? (
          <div className="carrier-scorecard-wrap">
            <table className="carrier-scorecard">
              <thead>
                <tr>
                  <th>Carrier</th>
                  <th>Total Shipments</th>
                  <th>Affected Shipments</th>
                  <th>Violation Events</th>
                  <th>Total Billed</th>
                  <th>Total Expected</th>
                  <th>Total Recoverable</th>
                  <th>Average Overcharge</th>
                  <th>Overbilled Shipment Rate</th>
                  <th>Most Common Violation</th>
                </tr>
              </thead>
              <tbody>
                {carrierRows.map((carrier) => (
                  <tr key={carrier.carrier}>
                    <td><strong>{carrier.carrier}</strong></td>
                    <td>{formatNumber(carrier.shipment_count)}</td>
                    <td>{formatNumber(carrier.affected_shipments)}</td>
                    <td>{formatNumber(carrier.violation_events)}</td>
                    <td>{formatCurrency(carrier.total_billed)}</td>
                    <td>{formatCurrency(carrier.total_expected)}</td>
                    <td>
                      <div className="carrier-overcharge-cell">
                        <strong>{formatCurrency(carrier.total_overcharge)}</strong>
                        <div className="bar-track">
                          <div style={{ width: `${(carrier.total_overcharge / maxCarrierOvercharge) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>{formatCurrency(carrier.average_overcharge)}</td>
                    <td>{formatPercent(carrier.overbilling_rate_pct)}</td>
                    <td>{carrier.most_common_violation_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState message="No carrier data in this view." />}
      </section>

      <section className="panel methodology-panel">
        <div className="section-title">
          <FileText size={17} />
          <div>
            <h2>Audit Methodology</h2>
            <p>Three reconciliation rules used in this view.</p>
          </div>
        </div>
        <ul className="plain-list">
          <li>Expected charge = contracted base rate + eligible COD + eligible RTO.</li>
          <li>Overcharge = billed charge - expected charge.</li>
          <li>Only positive overcharges are counted as recoverable leakage.</li>
        </ul>
      </section>

      {selectedShipment ? (
        <ShipmentDetailDrawer
          key={selectedShipment.shipment_id}
          shipment={selectedShipment}
          onClose={() => setSelectedShipment(null)}
        />
      ) : null}
    </main>
  );
}
