const crypto = require("crypto");
const { pushJournalEntry, readJournal, getTradeCount, setTradeCount, allowCors } = require("../_lib/db");

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;

  if (req.method === "POST") {
    const entry = req.body;
    if (!entry || !["demo", "live"].includes(entry.mode)) {
      return res.status(400).json({ error: "entry.mode must be 'demo' or 'live'" });
    }
    entry.id = crypto.randomUUID();
    entry.ts = Date.now();
    await pushJournalEntry(entry);

    if (entry.kind === "close") {
      const counts = await getTradeCount();
      counts[entry.mode] += 1;
      await setTradeCount(counts);
    }
    return res.json({ ok: true });
  }

  if (req.method === "GET") {
    const entries = await readJournal(200);
    const filtered = req.query.mode ? entries.filter(e => e.mode === req.query.mode) : entries;
    return res.json(filtered);
  }

  res.status(405).json({ error: "GET or POST only" });
};
