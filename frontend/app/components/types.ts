export interface Summary {
  total_shipments: number;
  overcharged_count: number;
  overcharge_rate_pct: number;
  total_billed: number;
  total_overcharge: number;
  overcharge_pct_of_spend: number;
}

export interface CarrierStats {
  shipment_count: number;
  overcharged_count: number;
  total_billed: number;
  total_overcharge: number;
  overcharge_pct: number;
  hit_rate_pct: number;
}

export interface ViolationStats {
  count: number;
  total_overcharge: number;
}

export interface SegmentStats {
  count: number;
  overcharged_count: number;
  total_overcharge: number;
  hit_rate: string;
}

export interface SummaryResponse {
  summary: Summary;
  by_carrier: Record<string, CarrierStats>;
  by_violation_type: Record<string, ViolationStats>;
  by_zone: Record<string, SegmentStats>;
  by_weight_range: Record<string, Omit<SegmentStats, "hit_rate">>;
  by_carrier_zone: Record<string, Record<string, SegmentStats>>;
}

export interface Issue {
  shipment_id: string;
  awb_number: string;
  carrier: string;
  shipment_type: string;
  payment_mode: string;
  shipment_date: string;
  destination_zone: string;
  billed_zone: string;
  actual_weight_slab: string;
  billed_weight_slab: string;
  contracted_rate: number;
  billed_rate: number;
  cod_charge: number;
  rto_charge: number;
  misc_charges: number;
  expected_cod: number;
  expected_rto: number;
  expected_total: number;
  total_billed: number;
  total_overcharge: number;
  violations: Array<{ type: string; overcharge: number | null; [key: string]: unknown }>;
  violation_types: string[];
}

export interface IssuesResponse {
  total: number;
  page: number;
  limit: number;
  data: Issue[];
}
