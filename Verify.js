const { getAccessKeys, allowCors } = require("../_lib/db");

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  const key = req.query.key;
  const keys = await getAccessKeys();
  const record = keys[key];
  if (!record) return res.status(404).json({ valid: false, reason: "unknown key" });
  if (record.expiresAt < Date.now()) return res.status(410).json({ valid: false, reason: "expired" });
  res.json({ valid: true, expiresAt: record.expiresAt });
};
