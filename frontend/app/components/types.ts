import type {
  AuditStatus,
  CarrierStats,
  ErrorStats,
  ReconciledShipment,
} from "@/lib/reconciliation";

export type { AuditStatus, CarrierStats, ErrorStats, ReconciledShipment };

export interface AuditSummary {
  total_shipments: number;
  total_billed: number;
  total_expected: number;
  total_potential_overbilling: number;
  overbilling_percentage: number;
  affected_shipments: number;
  overbilled_shipments: number;
  final_billed_total_mismatches: number;
  violation_events: number;
  correct_shipments: number;
  underbilled_shipments: number;
  worst_carrier: string;
  most_common_error_type: string;
  highest_impact_error_type: string;
}

export interface AuditResponse {
  summary: AuditSummary;
  shipments: ReconciledShipment[];
  issues: ReconciledShipment[];
  by_carrier: Record<string, CarrierStats>;
  by_error_type: Record<string, ErrorStats>;
  filter_options: {
    carriers: string[];
    errorTypes: string[];
    zones: string[];
    paymentModes: string[];
    deliveryStatuses: string[];
  };
}
