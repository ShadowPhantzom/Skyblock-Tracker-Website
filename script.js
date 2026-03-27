import * as nbt from "https://esm.sh/prismarine-nbt@2.8.0";

// Convert URL-safe base64 from the API into raw bytes.
const base64ToBytes = (base64) => {
  base64 = base64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

// Keep lore/name text on one clean line for display.
const normalizeNoLineBreaks = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

// Format coin values with commas.
const formatCoins = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "N/A";

// Minecraft color codes used in names and lore.
const MC_COLORS = { "0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA", "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA", "8": "#555555", "9": "#5555FF", a: "#55FF55", b: "#55FFFF", c: "#FF5555", d: "#FF55FF", e: "#FFFF55", f: "#FFFFFF" };

// Escape HTML before inserting text into the DOM.
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

// Convert Minecraft formatting codes (e.g. §a, §l) into styled HTML spans.
function mcToHtml(input) {
  const s = normalizeNoLineBreaks(input);
  let color = null, bold = false, italic = false, underline = false, out = "", spanOpen = false;
  const startNewSpan = () => {
    const styles = [];
    if (spanOpen) out += "</span>";
    if (color) styles.push(`color:${color}`);
    if (bold) styles.push("font-weight:700");
    if (italic) styles.push("font-style:italic");
    if (underline) styles.push("text-decoration:underline");
    out += `<span style="${styles.join(";")}">`;
    spanOpen = true;
  };
  startNewSpan();

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "§" && i + 1 < s.length) {
      const code = s[i + 1].toLowerCase();
      i++;
      if (MC_COLORS[code]) color = MC_COLORS[code], startNewSpan();
      if (code === "l" || code === "o" || code === "n" || code === "r") {
        if (code === "l") bold = true;
        if (code === "o") italic = true;
        if (code === "n") underline = true;
        if (code === "r") color = null, bold = false, italic = false, underline = false;
        startNewSpan();
      }
      continue;
    }
    out += escapeHtml(ch);
  }

  if (spanOpen) out += "</span>";
  return out;
}

async function decodeItemBytes(itemBytes) {
  // Item bytes are gzipped + NBT encoded.
  const decompressedU8 = pako.inflate(base64ToBytes(itemBytes));
  const parsed = await nbt.parse(decompressedU8.buffer.slice(decompressedU8.byteOffset, decompressedU8.byteOffset + decompressedU8.byteLength));
  return parsed?.parsed ?? parsed;
}

function getNameLore(decoded) {
  // Grab the first item payload and pull display metadata.
  const firstItem = (decoded?.parsed ?? decoded)?.value?.i?.value?.value?.[0];
  const display = firstItem?.tag?.value?.display?.value;
  return { name: display?.Name?.value ?? "(no name)", lore: Array.isArray(display?.Lore?.value?.value) ? display.Lore.value.value : [] };
}

function getFinalPrice(auction) {
  // Prefer ended price, then highest bid.
  const fromEnded = Number(auction?.price);
  if (Number.isFinite(fromEnded) && fromEnded >= 0) return fromEnded;
  const fallback = Number(auction?.highest_bid_amount);
  if (Number.isFinite(fallback) && fallback >= 0) return fallback;
  return 0;
}

function ensureGrid() {
  // Ensure the render target exists.
  const container = document.querySelector(".container");
  if (!container) throw new Error("Missing .container element in HTML.");
  let grid = document.getElementById("auctionGrid");
  if (!grid) {
    grid = Object.assign(document.createElement("div"), { id: "auctionGrid", className: "auctionGrid" });
    container.appendChild(grid);
  }
  return grid;
}

function renderCard({ name, lore, price }) {
  // Build one auction card.
  const card = document.createElement("div");
  card.className = "innerBox";

  const title = document.createElement("div");
  title.className = "itemName";
  title.innerHTML = mcToHtml(name);

  const meta = document.createElement("div");
  meta.className = "itemMeta";
  meta.textContent = price;

  const loreEl = document.createElement("div");
  loreEl.className = "itemLore";
  const loreOneLine = lore.map(normalizeNoLineBreaks).join("  |  ");
  loreEl.innerHTML = mcToHtml(loreOneLine);

  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(loreEl);
  return card;
}

const yieldToBrowser = () => new Promise((r) => setTimeout(r));

async function loadEndedAuctions() {
  const grid = ensureGrid();
  grid.textContent = "Loading ended auctions...";

  const res = await fetch("https://api.hypixel.net/v2/skyblock/auctions_ended");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const auctions = Array.isArray(data?.auctions) ? data.auctions : [];
  grid.textContent = "";

  for (const auction of auctions) {
    // Show progress immediately while this item decodes.
    const placeholder = document.createElement("div");
    placeholder.className = "innerBox";
    placeholder.textContent = "Decoding...";
    grid.appendChild(placeholder);

    try {
      const itemBytes = auction?.item_bytes;
      if (typeof itemBytes !== "string" || !itemBytes.length) {
        placeholder.textContent = "No item_bytes.";
        continue;
      }

      const decoded = await decodeItemBytes(itemBytes);
      const { name, lore } = getNameLore(decoded);
      placeholder.replaceWith(renderCard({ name, lore, price: `Final: ${formatCoins(getFinalPrice(auction))} coins` }));
    } catch (e) {
      // Per-item failure should not stop the whole list.
      placeholder.textContent = `Error: ${normalizeNoLineBreaks(e.message ?? e)}`;
    }

    // Yield so the browser can paint between items.
    await yieldToBrowser();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadEndedAuctions().catch(console.error);
});