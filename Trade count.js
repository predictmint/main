const { getTradeCount, allowCors } = require("../_lib/db");

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  res.json(await getTradeCount());
};
