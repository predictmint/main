const crypto = require("crypto");
const { getAdminSessions, setAdminSessions, allowCors } = require("../_lib/db");

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { password } = req.body || {};
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "wrong password" });
  }

  const sessions = await getAdminSessions();
  const token = crypto.randomBytes(24).toString("hex");
  sessions[token] = { expiresAt: Date.now() + 1000 * 60 * 60 * 12 }; // 12h
  await setAdminSessions(sessions);

  res.json({ token });
};
