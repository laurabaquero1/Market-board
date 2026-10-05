// Stock dashboard server. No dependencies, needs Node 18+.
// Run:  node server.js   then open http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const CACHE_MS = 60 * 1000; // data refreshes every minute

// Edit this list to change what the dashboard tracks.
const SYMBOLS = [
  { symbol: "^GSPC", label: "S&P 500", group: "Indices" },
  { symbol: "^AXJO", label: "ASX 200", group: "Indices" },
  { symbol: "AAPL", label: "Apple", group: "US" },
  { symbol: "MSFT", label: "Microsoft", group: "US" },
  { symbol: "NVDA", label: "NVIDIA", group: "US" },
  { symbol: "TSLA", label: "Tesla", group: "US" },
  { symbol: "CBA.AX", label: "Commonwealth Bank", group: "ASX" },
  { symbol: "BHP.AX", label: "BHP Group", group: "ASX" },
  { symbol: "CSL.AX", label: "CSL", group: "ASX" },
  { symbol: "WBC.AX", label: "Westpac", group: "ASX" },
];

let cache = { at: 0, data: null };

async function fetchOne(item) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?range=1d&interval=5m`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${item.symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const r = json.chart && json.chart.result && json.chart.result[0];
  if (!r) throw new Error(`${item.symbol}: no data`);
  const m = r.meta;
  const q = (r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = [];
  (r.timestamp || []).forEach((t, i) => {
    if (q.close && q.close[i] != null) closes.push([t, q.close[i]]);
  });
  const price = m.regularMarketPrice;
  const prev = m.chartPreviousClose ?? m.previousClose;
  return {
    ...item,
    currency: m.currency,
    price,
    prevClose: prev,
    change: prev != null ? price - prev : null,
    pct: prev ? ((price - prev) / prev) * 100 : null,
    dayHigh: m.regularMarketDayHigh,
    dayLow: m.regularMarketDayLow,
    volume: m.regularMarketVolume,
    marketTime: m.regularMarketTime,
    exchange: m.fullExchangeName,
    series: closes,
  };
}

async function getQuotes() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const results = await Promise.allSettled(SYMBOLS.map(fetchOne));
  const quotes = results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ...SYMBOLS[i], error: String(r.reason.message || r.reason) }
  );
  cache = { at: Date.now(), data: { fetchedAt: Date.now(), quotes } };
  return cache.data;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/quotes")) {
      const data = await getQuotes();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(data));
    }
    let file = path.join(__dirname, "public", "index.html");
    if (!fs.existsSync(file)) file = path.join(__dirname, "index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(file));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(PORT, () => console.log(`Stock dashboard running at http://localhost:${PORT}`));
