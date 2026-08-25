// Proxies Kalshi's PUBLIC market data — no customer credentials involved.
// See README for why real account/order integration isn't built here.

const KALSHI_BASE = "https://trading-api.kalshi.com/trade-api/v2";
const { allowCors } = require("../_lib/db");

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  try {
    const params = new URLSearchParams(req.query).toString();
    const r = await fetch(`${KALSHI_BASE}/markets?${params}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "kalshi fetch failed", detail: String(err) });
  }
};
