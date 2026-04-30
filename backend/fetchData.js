const axios = require("axios");

const BASE_URL = "https://mosaicfellowship.in/api/data/supply-chain";
const PAGE_SIZE = 100;

// Fetches every page for one endpoint because the source API returns
// shipments and rate cards in paginated chunks.
async function fetchAllPages(endpoint) {
  let page = 1;
  const allData = [];

  while (true) {
    const url = `${BASE_URL}/${endpoint}?page=${page}&limit=${PAGE_SIZE}`;
    const res = await axios.get(url);
    const data = res.data.data;
    const hasNext = res.data.pagination.has_next;

    if (!data || data.length === 0) break;

    allData.push(...data);

    if (!hasNext) break;

    page++;
  }

  return allData;
}

// Loads shipments and rate cards together because reconciliation needs
// both datasets and neither request depends on the other.
async function getAllData() {
  const [shipments, rateCards] = await Promise.all([
    fetchAllPages("shipments"),
    fetchAllPages("rate-card"),
  ]);

  return { shipments, rateCards };
}

module.exports = { getAllData };
