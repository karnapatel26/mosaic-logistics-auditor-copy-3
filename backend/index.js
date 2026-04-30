const { getAllData } = require("./fetchData");
const { reconcileAll } = require("./reconciliation");

// Runs a full local reconciliation from the command line so developers
// can inspect the raw audit output without starting the API server.
async function run() {
  try {
    console.log("Fetching real data...");

    const { shipments, rateCards } = await getAllData();

    console.log("Data fetched:");
    console.log("Shipments:", shipments.length);
    console.log("RateCards:", rateCards.length);

    const result = reconcileAll(shipments, rateCards);

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

run();
