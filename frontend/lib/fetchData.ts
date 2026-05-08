import axios from "axios";

const BASE_URL = "https://mosaicfellowship.in/api/data/supply-chain";
const PAGE_SIZE = 100;
const MAX_PAGE_GUARD = 500;
const PAGE_BATCH_SIZE = 8;

interface PaginatedResponse<T> {
  data?: T[];
}

export interface RawShipment {
  shipment_id?: unknown;
  awb_number?: unknown;
  carrier?: unknown;
  origin_warehouse?: unknown;
  destination_zone?: unknown;
  billed_zone?: unknown;
  actual_weight_slab?: unknown;
  billed_weight_slab?: unknown;
  shipment_type?: unknown;
  payment_mode?: unknown;
  shipment_date?: unknown;
  delivered?: unknown;
  contracted_rate?: unknown;
  billed_rate?: unknown;
  cod_charge?: unknown;
  rto_charge?: unknown;
  misc_charges?: unknown;
  total_billed?: unknown;
}

export interface RawRateCard {
  id?: unknown;
  carrier?: unknown;
  zone?: unknown;
  weight_slab?: unknown;
  base_rate?: unknown;
  cod_fee?: unknown;
  rto_multiplier?: unknown;
  service_type?: unknown;
  payment_mode?: unknown;
}

function readRows<T>(response: PaginatedResponse<T>): T[] {
  return Array.isArray(response.data) ? response.data : [];
}

async function fetchPage<T>(endpoint: string, page: number): Promise<PaginatedResponse<T>> {
  const url = `${BASE_URL}/${endpoint}?page=${page}&limit=${PAGE_SIZE}`;
  const response = await axios.get<PaginatedResponse<T>>(url, { timeout: 20000 });
  return response.data;
}

async function fetchAllPages<T>(endpoint: string): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 1; page <= MAX_PAGE_GUARD; page += PAGE_BATCH_SIZE) {
    const batchPages = Array.from(
      { length: Math.min(PAGE_BATCH_SIZE, MAX_PAGE_GUARD - page + 1) },
      (_, index) => page + index,
    );
    const batch = await Promise.all(batchPages.map((batchPage) => fetchPage<T>(endpoint, batchPage)));

    for (const response of batch) {
      const pageRows = readRows(response);
      if (pageRows.length === 0) return rows;

      rows.push(...pageRows);
    }
  }

  return rows;
}

export async function getAllData(): Promise<{ shipments: RawShipment[]; rateCards: RawRateCard[] }> {
  const [shipments, rateCards] = await Promise.all([
    fetchAllPages<RawShipment>("shipments"),
    fetchAllPages<RawRateCard>("rate-card"),
  ]);

  return { shipments, rateCards };
}
