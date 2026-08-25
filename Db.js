// Shared storage helpers, built on Vercel KV (Redis-compatible).
// Vercel serverless functions don't share disk between requests, so this
// replaces the JSON-file approach from the standalone-server version.
//
// Setup required in the Vercel dashboard: Storage → Create Database → KV,
// then connect it to this project. Vercel sets the KV_* env vars for you
// automatically once connected — no code changes needed.

const { kv } = require("@vercel/kv");

async function getAccessKeys() {
  return (await kv.get("access_keys")) || {};
}
async function setAccessKeys(obj) {
  await kv.set("access_keys", obj);
}

async function getAdminSessions() {
  return (await kv.get("admin_sessions")) || {};
}
async function setAdminSessions(obj) {
  await kv.set("admin_sessions", obj);
}

async function getTradeCount() {
  return (await kv.get("trade_count")) || { demo: 0, live: 0 };
}
async function setTradeCount(obj) {
  await kv.set("trade_count", obj);
}

async function pushJournalEntry(entry) {
  await kv.rpush("journal", JSON.stringify(entry));
  await kv.ltrim("journal", -5000, -1); // cap growth
}
async function readJournal(limit = 200) {
  const raw = await kv.lrange("journal", -limit, -1);
  return raw.map(r => (typeof r === "string" ? JSON.parse(r) : r));
}

async function requireAdmin(req, res) {
  const token = req.headers["x-admin-token"];
  const sessions = await getAdminSessions();
  const session = token && sessions[token];
  if (!session || session.expiresAt < Date.now()) {
    res.status(401).json({ error: "not authorized" });
    return false;
  }
  return true;
}

function allowCors(req, res) {
  // Same-origin on Vercel by default (frontend + api share a domain), but
  // this keeps things working if you ever call the API from elsewhere.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = {
  getAccessKeys, setAccessKeys,
  getAdminSessions, setAdminSessions,
  getTradeCount, setTradeCount,
  pushJournalEntry, readJournal,
  requireAdmin, allowCors,
};
