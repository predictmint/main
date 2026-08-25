const crypto = require("crypto");
const { getAccessKeys, setAccessKeys, requireAdmin, allowCors } = require("../_lib/db");

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (!(await requireAdmin(req, res))) return;

  const keys = await getAccessKeys();

  if (req.method === "GET") {
    return res.json(keys);
  }

  if (req.method === "POST") {
    const { label, tierPriceUsd } = req.body || {};
    const key = "e9t_" + crypto.randomBytes(16).toString("hex");
    keys[key] = {
      label: label || null,
      tierPriceUsd: tierPriceUsd || null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
    };
    await setAccessKeys(keys);
    return res.json({ key, expiresAt: keys[key].expiresAt });
  }

  res.status(405).json({ error: "GET or POST only" });
};
