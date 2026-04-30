const express = require('express');
const cors = require('cors');
const { getAllData } = require('./fetchData');
const { reconcileAll } = require('./reconciliation');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory cache with TTL
let analysisCache = null;
let cacheTime = 0;
let inFlightAnalysis = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// Orders newest shipments first because auditors often review recent
// invoices before older disputes.
function sortByDate(a, b) {
  return b.shipment_date.localeCompare(a.shipment_date);
}

// Orders carriers alphabetically so backend drilldowns can match the
// frontend sort option when this server is used directly.
function sortByCarrier(a, b) {
  return a.carrier.localeCompare(b.carrier);
}

// Orders highest leakage first because issue lists should surface the
// most financially important rows by default.
function sortByOvercharge(a, b) {
  return b.total_overcharge - a.total_overcharge;
}

const SORTERS = {
  date: sortByDate,
  carrier: sortByCarrier,
  overcharge: sortByOvercharge,
};

// Reads a bounded positive integer so invalid query strings cannot force
// huge pages or broken offsets.
function readBoundedInt(value, fallback, max) {
  const parsed = parseInt(value || fallback, 10);
  return Math.min(max, Math.max(1, Number.isNaN(parsed) ? fallback : parsed));
}

// Fetches and reconciles source data once because all backend routes use
// the same expensive audit result.
async function computeAnalysis() {
  const { shipments, rateCards } = await getAllData();
  analysisCache = reconcileAll(shipments, rateCards);
  cacheTime = Date.now();
  return analysisCache;
}

// Returns cached analysis so repeated route calls do not refetch and
// recompute thousands of rows within the TTL window.
async function getAnalysis() {
  if (analysisCache && Date.now() - cacheTime < CACHE_TTL) {
    return analysisCache;
  }
  if (inFlightAnalysis) return inFlightAnalysis;

  inFlightAnalysis = computeAnalysis();
  try {
    return await inFlightAnalysis;
  } finally {
    inFlightAnalysis = null;
  }
}

// Sends the cached aggregate summary so dashboards can load KPI and
// chart data without receiving the full issue list.
async function handleSummary(_, res) {
  try {
    const result = await getAnalysis();
    res.json({
      summary: result.summary,
      by_carrier: result.by_carrier,
      by_violation_type: result.by_violation_type,
      by_zone: result.by_zone,
      by_weight_range: result.by_weight_range,
      by_carrier_zone: result.by_carrier_zone,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Sends one filtered issue page so clients can drill into shipment rows
// without downloading every overcharge at once.
async function handleIssues(req, res) {
  try {
    const result = await getAnalysis();
    const page = readBoundedInt(req.query.page, 1, Number.MAX_SAFE_INTEGER);
    const limit = readBoundedInt(req.query.limit, 50, 200);
    const carrier = req.query.carrier;
    const violationType = req.query.type;
    const sort = req.query.sort || 'overcharge';

    let issues = [...result.issues];
    if (carrier) issues = issues.filter(i => i.carrier === carrier);
    if (violationType) issues = issues.filter(i => i.violation_types.includes(violationType));

    issues.sort(SORTERS[sort] || SORTERS.overcharge);

    const total = issues.length;
    const start = (page - 1) * limit;
    const data = issues.slice(start, start + limit);

    res.json({ total, page, limit, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Sends one issue record so a caller can inspect a shipment without
// scanning the whole issue response client-side.
async function handleIssueDetail(req, res) {
  try {
    const result = await getAnalysis();
    const issue = result.issues.find(i => i.shipment_id === req.params.shipment_id);
    if (!issue) return res.status(404).json({ error: 'Not found' });
    res.json(issue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Reports process health for uptime checks without touching cached data.
function handleHealth(_, res) {
  res.json({ status: 'ok' });
}

// Logs the bound port once so local runs make the active backend visible.
function logStartup() {
  console.log(`Server running on port ${PORT}`);
}

app.get('/api/summary', handleSummary);
app.get('/api/issues', handleIssues);
app.get('/api/issues/:shipment_id', handleIssueDetail);
app.get('/health', handleHealth);

const PORT = process.env.PORT || 3000;
app.listen(PORT, logStartup);
