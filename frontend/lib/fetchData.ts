/**
 * lib/fetchData.ts
 *
 * Handles paginated ingestion of the Mosaic Fellowship supply-chain API.
 * Fetches 100 rows per request and concatenates until `has_next` is false.
 */

import axios from "axios";

const BASE_URL = "https://mosaicfellowship.in/api/data/supply-chain";
const PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 8;
const MAX_PAGE_GUARD = 500;

interface PaginatedResponse<T> {
  data: T[];
  pagination: { has_next: boolean };
}

// Fetches every page with bounded concurrency so API ingestion is faster
// while the returned rows still keep stable page order.
async function fetchAllPages<T>(endpoint: string): Promise<T[]> {
  const pages = new Map<number, T[]>();

  // Fetches one API page because batching needs a small reusable unit
  // that can run safely in parallel.
  const fetchPage = async (page: number): Promise<PaginatedResponse<T>> => {
    const url = `${BASE_URL}/${endpoint}?page=${page}&limit=${PAGE_SIZE}`;
    const res = await axios.get<PaginatedResponse<T>>(url);
    return res.data;
  };

  // The first page tells us whether the endpoint has data before we
  // spend requests on parallel pagination.
  const first = await fetchPage(1);
  if (!first.data || first.data.length === 0) return [];
  pages.set(1, first.data);
  if (!first.pagination.has_next) return first.data;

  let nextPage = 2;
  let terminalPage: number | null = null;

  while (nextPage <= MAX_PAGE_GUARD) {
    const batchPages: number[] = [];
    for (let i = 0; i < DEFAULT_CONCURRENCY && nextPage + i <= MAX_PAGE_GUARD; i++) {
      batchPages.push(nextPage + i);
    }

    const batchResults = await Promise.all(
      batchPages.map(async (page) => {
        const result = await fetchPage(page);
        return { page, result };
      })
    );

    for (const { page, result } of batchResults) {
      if (!result.data || result.data.length === 0) {
        terminalPage = terminalPage === null ? page - 1 : Math.min(terminalPage, page - 1);
        continue;
      }

      pages.set(page, result.data);

      if (!result.pagination.has_next) {
        terminalPage = terminalPage === null ? page : Math.min(terminalPage, page);
      }
    }

    nextPage += batchPages.length;

    if (terminalPage !== null && nextPage > terminalPage) {
      break;
    }
  }

  const endPage = terminalPage ?? Math.max(...pages.keys());
  const allData: T[] = [];
  for (let page = 1; page <= endPage; page++) {
    const rows = pages.get(page);
    if (rows && rows.length > 0) {
      allData.push(...rows);
    }
  }

  return allData;
}

export interface Shipment {
  shipment_id: string;
  awb_number: string;
  carrier: string;
  shipment_type: string;
  payment_mode: string;
  destination_zone: string;
  billed_zone: string;
  actual_weight_slab: string;
  billed_weight_slab: string;
  shipment_date: string;
  delivered: number;
  total_billed: number;
  contracted_rate: number;
  billed_rate: number;
  cod_charge: number;
  rto_charge: number;
  misc_charges: number;
}

export interface RateCard {
  carrier: string;
  zone: string;
  weight_slab: string;
  base_rate: number;
  cod_fee: number;
  rto_multiplier: number;
}

// Loads shipments and rate cards together because reconciliation needs
// both datasets before it can compare billed rates with contracted rates.
export async function getAllData(): Promise<{ shipments: Shipment[]; rateCards: RateCard[] }> {
  const [shipments, rateCards] = await Promise.all([
    fetchAllPages<Shipment>("shipments"),
    fetchAllPages<RateCard>("rate-card"),
  ]);

  return { shipments, rateCards };
}
