const appUrl = (process.env.APP_URL || "https://gullak-piggybank.ahansantra607.workers.dev").replace(/\/$/, "");
const apiUrl = (process.env.API_URL || "https://server.ahansantra607.workers.dev").replace(/\/$/, "");

async function get(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(url + " returned HTTP " + response.status);
  return { response, body: await response.text() };
}

const app = await get(appUrl + "/");
if (!/Gullak/i.test(app.body)) throw new Error("Deployed app HTML does not look like Gullak.");

const cloudUi = await get(appUrl + "/js/cloud-ui.js");
if (!cloudUi.body.includes("gullak-encrypted-backup") || !cloudUi.body.includes("G.cloudAccount")) {
  throw new Error("Deployed frontend is stale or missing cloud account/backup code.");
}

const cloudClient = await get(appUrl + "/js/cloud.js");
if (!cloudClient.body.includes("/api/families/") || !cloudClient.body.includes("/api/vault")) {
  throw new Error("Deployed frontend is missing cloud API integration.");
}

const health = await get(apiUrl + "/api/health");
const status = JSON.parse(health.body);
if (status.status !== "healthy" || status.database !== "connected" || status.familySchema !== "ready") {
  throw new Error("Cloud Worker health/schema check failed: " + JSON.stringify(status));
}

console.log("Live deployment smoke test passed.");
console.log("Frontend:", appUrl);
console.log("Cloud API:", apiUrl);
console.log("Family schema:", status.familySchema);
