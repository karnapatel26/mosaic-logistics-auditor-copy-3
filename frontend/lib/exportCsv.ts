import type { ReconciledShipment } from "@/app/components/types";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const headers = [
  "Shipment ID",
  "AWB",
  "Carrier",
  "Billed charge",
  "Expected charge",
  "Overcharge",
  "Primary violation",
  "All violation reasons",
];

export function buildOverbillingCsv(shipments: ReconciledShipment[]) {
  // The export is intentionally dispute-ready: only positive overbilling rows
  // are included, while correct and discounted rows stay out of carrier follow-up.
  const rows = shipments
    .filter((shipment) => shipment.status === "Overbilled" && shipment.overcharge > 0)
    .map((shipment) => [
      shipment.shipment_id,
      shipment.awb_number,
      shipment.carrier,
      shipment.billed_charge,
      shipment.expected_charge,
      shipment.overcharge,
      shipment.primary_error,
      shipment.error_reasons.join("; "),
    ].map(csvEscape).join(","));

  return [headers.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
