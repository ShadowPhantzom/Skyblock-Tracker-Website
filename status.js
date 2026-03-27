const ENDPOINTS = [
  { type: "hypixel-api", name: "Hypixel API (Auctions Ended)", url: "https://api.hypixel.net/v2/skyblock/auctions_ended" },
  { type: "minecraft-server", name: "Minecraft Server (mc.hypixel.net)", url: "https://api.mcsrvstat.us/2/mc.hypixel.net" },
];

function statusLabel(ok, successField) {
  if (!ok) return "DOWN";
  if (successField === false) return "DEGRADED";
  return "UP";
}

function makeCard({ name, label, httpStatus, latencyMs, error, details }) {
  const card = document.createElement("div");
  card.className = "innerBox";

  const title = document.createElement("div");
  title.className = "itemName";
  title.textContent = name;

  const badge = document.createElement("div");
  badge.className = `statusBadge ${label.toLowerCase()}`;
  badge.textContent = label;

  const meta = document.createElement("div");
  meta.className = "itemLore";
  const lines = [
    `HTTP: ${httpStatus ?? "N/A"}`,
    `Latency: ${Number.isFinite(latencyMs) ? `${latencyMs} ms` : "N/A"}`,
    error ? `Error: ${error}` : "Check completed successfully.",
  ];
  if (details) lines.push(...details);
  meta.innerHTML = lines.join("<br>");

  card.appendChild(title);
  card.appendChild(badge);
  card.appendChild(meta);
  return card;
}

async function checkEndpoint(endpoint) {
  const started = performance.now();
  try {
    const res = await fetch(endpoint.url, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - started);

    let payload = null;
    try { payload = await res.json(); } catch {
      payload = null;
    }

    if (endpoint.type === "minecraft-server") {
      const online = payload?.online === true;
      return {
        name: endpoint.name,
        label: online ? "UP" : "DOWN",
        httpStatus: res.status,
        latencyMs,
        error: null,
        details: [
          `Online: ${online ? "Yes" : "No"}`,
          `Players: ${payload?.players?.online ?? 0}/${payload?.players?.max ?? "?"}`,
          `Version: ${payload?.version ?? "Unknown"}`,
        ],
      };
    }

    return {
      name: endpoint.name,
      label: statusLabel(res.ok, payload?.success),
      httpStatus: res.status,
      latencyMs,
      error: null,
      details: null,
    };
  } catch (err) {
    return {
      name: endpoint.name,
      label: "DOWN",
      httpStatus: null,
      latencyMs: null,
      error: String(err?.message ?? err),
      details: null,
    };
  }
}

async function refreshStatus() {
  const grid = document.getElementById("statusGrid");
  const lastUpdated = document.getElementById("lastUpdated");
  const button = document.getElementById("refreshBtn");
  if (!grid || !lastUpdated || !button) return;

  button.disabled = true;
  grid.textContent = "Checking API and server status...";

  const results = await Promise.all(ENDPOINTS.map(checkEndpoint));
  grid.textContent = "";
  for (const result of results) grid.appendChild(makeCard(result));

  lastUpdated.textContent = `Last updated: ${new Date().toLocaleString()}`;
  button.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("refreshBtn");
  if (button) button.addEventListener("click", refreshStatus);
  refreshStatus().catch(console.error);
});
