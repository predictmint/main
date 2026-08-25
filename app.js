/* =========================================================================
   EXIT_9TO5 — paper trading dashboard for Kalshi-style crypto markets
   -------------------------------------------------------------------------
   Everything in this file runs on a SIMULATED price feed. There is no
   live Kalshi connection here. See README.md for what real integration
   requires (a backend that holds your API key — never the browser).
   ========================================================================= */

const SYMBOLS = ["BTC", "ETH", "LTC"];
const START_BALANCE = 500;
const TICK_MS = 1500;
const API_BASE = ""; // same-origin on Vercel — frontend and /api share a domain
const MODE = "demo"; // this build only ever runs in demo mode — see README

// ---- access gate ------------------------------------------------------
// If a backend is reachable and a ?key= is present, verify it before
// unlocking the dashboard. If no backend is reachable (e.g. viewing this
// straight from GitHub Pages with no server deployed yet), fail open into
// an unlocked local demo so the dashboard is still explorable — this is a
// convenience for development, not an access-control strategy. Real
// gating requires the backend to actually be deployed.

async function checkAccess() {
  const params = new URLSearchParams(location.search);
  const key = params.get("key");
  const pill = document.getElementById("modePill");
  if (!key) return; // no key provided — leave open demo as-is
  try {
    const r = await fetch(`${API_BASE}/api/access/verify?key=${encodeURIComponent(key)}`);
    const data = await r.json();
    if (!data.valid) {
      document.body.innerHTML = `<div style="padding:60px;font-family:monospace;color:#ff5d5d;">
        access key ${data.reason === "expired" ? "has expired" : "not recognized"}.
        contact @kqwz on Instagram to renew.</div>`;
      throw new Error("blocked");
    }
    if (pill) pill.textContent = "ACCESS VERIFIED";
  } catch (e) {
    // backend unreachable — leave as local unlocked demo, don't hard-block
    console.warn("access check skipped (backend unreachable):", e.message);
  }
}

// ---- push journal entries to backend (best-effort, never blocks UI) -------

function postJournalEntry(entry) {
  fetch(`${API_BASE}/api/journal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...entry, mode: MODE }),
  }).catch(() => { /* backend not deployed yet — fine, stays local-only */ });
}

// ---- persona voice bank -------------------------------------------------
// Short, in-character journal lines. Kept as fragments so entries can be
// composed with real numbers and still sound distinct from each other.

const VOICE = {
  winOpen: [
    "saw the setup and took it. no hesitation.",
    "this is the one. sizing it like I mean it.",
    "textbook breakout. pulling the trigger.",
    "the tape gave me an opening, I took it.",
  ],
  winClose: [
    "called it. this is how you stack days.",
    "green. one more brick in the wall away from the 9-5.",
    "that's the edge showing up. staying disciplined.",
    "took the win, didn't get greedy. exactly the plan.",
  ],
  lossOpen: [
    "risking small on this one, tape's choppy.",
    "not fully sure but the setup's there. controlled size.",
    "taking the shot, r:r is still in my favor even if this loses.",
  ],
  lossClose: [
    "red. it happens. the process was still right.",
    "took the L. sizing kept it small, moving on.",
    "market didn't cooperate. logging it and staying honest about it.",
    "lost this one but I'm not changing the system off one trade.",
  ],
  milestone: [
    "not rich yet. but I haven't opened my work email in days.",
    "still doing this from my laptop, still nobody telling me when to wake up.",
    "the goal was never one big trade. it's never needing the alarm again.",
  ],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---- state ---------------------------------------------------------------

let state = {
  prices: {},
  history: {},
  positions: [],
  trades: [],
  running: true,
  strategy: "fairvalue",
  startedAt: Date.now(),
};

function loadState() {
  const saved = localStorage.getItem("exit9to5_state");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed };
      return;
    } catch (e) { /* fall through to fresh state */ }
  }
  SYMBOLS.forEach(sym => {
    const base = sym === "BTC" ? 64000 : sym === "ETH" ? 3200 : 84;
    state.prices[sym] = base;
    state.history[sym] = Array(30).fill(base);
  });
}

function saveState() {
  localStorage.setItem("exit9to5_state", JSON.stringify(state));
}

// ---- simulated price feed -------------------------------------------------
// Random walk with mild momentum persistence, just enough structure for a
// momentum/reversion strategy to have *something* to react to. This is NOT
// real market data.

function tickPrices() {
  SYMBOLS.forEach(sym => {
    const hist = state.history[sym];
    const last = hist[hist.length - 1];
    const prevChange = hist.length > 1 ? last - hist[hist.length - 2] : 0;
    const drift = prevChange * 0.15; // mild persistence
    const noise = (Math.random() - 0.5) * last * 0.0015;
    const next = Math.max(last + drift + noise, last * 0.9);
    hist.push(next);
    if (hist.length > 40) hist.shift();
    state.prices[sym] = next;
  });
}

function pctChange(sym) {
  const hist = state.history[sym];
  const first = hist[Math.max(0, hist.length - 10)];
  const last = hist[hist.length - 1];
  return ((last - first) / first) * 100;
}

// ---- fair-value model --------------------------------------------------
// This is the actual technique real market-makers use to price short-window
// binary/event contracts: treat the underlying as a random walk, estimate
// its realized volatility, and compute the probability it finishes above a
// strike by the market's close using the normal distribution. That gives a
// "fair value" in cents (0-100) to compare against whatever the market is
// actually charging. Trade only when the gap between them is big enough
// to be worth the risk — never just because price "looks like" it's moving
// one way.
//
// This is a REAL, standard method (it's the same shape as Black-Scholes'
// digital-option pricing). It is NOT a guarantee of any win rate — it's
// only as good as the volatility estimate and the assumption that the
// asset behaves like a random walk, which real crypto only roughly does.

function erf(x) {
  // Abramowitz-Stegun approximation, accurate to ~1e-7
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign * y;
}
function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

function realizedVolatility(sym) {
  const hist = state.history[sym];
  if (hist.length < 5) return 0.001;
  const returns = [];
  for (let i = 1; i < hist.length; i++) returns.push((hist[i] - hist[i - 1]) / hist[i - 1]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) || 0.001; // per-tick stdev of returns
}

function fairValueYesCents(sym, strike, minutesRemaining) {
  const spot = state.prices[sym];
  const sigma = realizedVolatility(sym);
  const ticksRemaining = Math.max(1, (minutesRemaining * 60 * 1000) / TICK_MS);
  const sigmaHorizon = sigma * Math.sqrt(ticksRemaining);
  const drift = 0; // random-walk assumption: no directional edge assumed by default
  const z = (Math.log(strike / spot) - drift) / sigmaHorizon;
  const probAbove = 1 - normCdf(z); // P(spot ends above strike)
  return Math.round(probAbove * 100);
}

// ---- strategy engine -------------------------------------------------------
// Only trades when the model's fair value and the market's price disagree
// by more than EDGE_THRESHOLD cents. This is what "edge" actually means:
// not a hunch about direction, but a measurable, if often small, mispricing.

const EDGE_THRESHOLD = 8; // cents of disagreement required before trading

function syntheticMarketPrice(fairValue) {
  // Simulates the market's own (imperfect) pricing: mostly close to fair
  // value, occasionally mispriced enough to create a real opportunity.
  const noise = (Math.random() - 0.5) * 24;
  return Math.min(97, Math.max(3, Math.round(fairValue + noise)));
}

function maybeOpenPosition() {
  if (state.strategy === "off") return;
  if (state.positions.length >= 3) return;
  if (Math.random() > 0.2) return; // don't evaluate every single tick

  const sym = pick(SYMBOLS);
  const spot = state.prices[sym];
  const windowMin = 15 + Math.floor(Math.random() * 3) * 15; // 15/30/45m market
  const strike = spot * (1 + (Math.random() - 0.5) * 0.006); // strike near the money

  const fairYes = fairValueYesCents(sym, strike, windowMin);
  const marketYes = syntheticMarketPrice(fairYes);
  const edge = fairYes - marketYes; // positive = YES underpriced, negative = NO underpriced

  let side = null;
  let entryPrice = null;
  if (edge > EDGE_THRESHOLD) { side = "yes"; entryPrice = marketYes; }
  else if (edge < -EDGE_THRESHOLD) { side = "no"; entryPrice = 100 - marketYes; }
  if (!side) return; // no real edge found — this is the model correctly doing nothing

  // size scales modestly with edge magnitude, capped — real risk management,
  // not "bet more because it feels right"
  const edgeMag = Math.min(Math.abs(edge), 30);
  const size = 5 + Math.round((edgeMag / 30) * 15);
  const risk = entryPrice * size / 100;
  const reward = (100 - entryPrice) * size / 100;

  const position = {
    id: crypto.randomUUID(),
    sym,
    side,
    entryPrice,
    size,
    risk: +risk.toFixed(2),
    reward: +reward.toFixed(2),
    openedAt: Date.now(),
    window: windowMin,
    fairValue: fairYes,
    marketPrice: marketYes,
    edge: +edge.toFixed(1),
  };
  state.positions.push(position);
  logJournalOpen(position);
}

function maybeClosePositions() {
  const stillOpen = [];
  state.positions.forEach(pos => {
    const age = (Date.now() - pos.openedAt) / 1000;
    // simulate resolution after a short in-app window (compressed for demo)
    if (age < 8 + Math.random() * 10) {
      stillOpen.push(pos);
      return;
    }
    // Resolution is driven by the model's OWN fair-value probability for the
    // side taken — i.e. if the model said YES was 62% likely, YES wins that
    // often in this simulation, not some arbitrary tuned number. This means
    // the simulated win rate reflects "if the volatility-random-walk
    // assumption holds," which is the honest ceiling of this approach —
    // real crypto has fatter tails and more structure than a pure random
    // walk, so real performance will differ from this simulation.
    const trueProb = pos.side === "yes" ? pos.fairValue / 100 : (100 - pos.fairValue) / 100;
    const win = Math.random() < trueProb;

    const pnl = win ? pos.reward : -pos.risk;
    const trade = { ...pos, win, pnl: +pnl.toFixed(2), closedAt: Date.now() };
    state.trades.push(trade);
    logJournalClose(trade);
  });
  state.positions = stillOpen;
}

// ---- journal ---------------------------------------------------------------

function logJournalOpen(pos) {
  const voice = pos.risk < pos.reward ? pick(VOICE.winOpen) : pick(VOICE.lossOpen);
  addEntry({
    kind: "open",
    text: `model says ${pos.sym} fair value is ${pos.fairValue}c, market's only charging ${pos.marketPrice}c for the other side — that's ${Math.abs(pos.edge)}c of edge. took ${pos.side.toUpperCase()}, ${pos.size} contracts @ ${pos.entryPrice}c (${pos.window}m mkt). risking $${pos.risk} to make $${pos.reward}. ${voice}`,
    result: null,
  });
}

function logJournalClose(trade) {
  const voice = trade.win ? pick(VOICE.winClose) : pick(VOICE.lossClose);
  addEntry({
    kind: "close",
    text: `${trade.sym} ${trade.side.toUpperCase()} closed ${trade.win ? "WIN" : "LOSS"}, ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl}. ${voice}`,
    result: trade.win ? "win" : "loss",
  });
  if (state.trades.length % 8 === 0) {
    addEntry({ kind: "note", text: pick(VOICE.milestone), result: null });
  }
}

function addEntry(entry) {
  entry.id = crypto.randomUUID();
  entry.ts = Date.now();
  if (!state.journal) state.journal = [];
  state.journal.push(entry);
  if (state.journal.length > 60) state.journal.shift();
  postJournalEntry(entry);
}

// ---- stats -------------------------------------------------------------

function computeStats() {
  const closed = state.trades;
  const pnl = closed.reduce((s, t) => s + t.pnl, 0);
  const wins = closed.filter(t => t.win);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : null;
  const avgRisk = closed.length ? closed.reduce((s, t) => s + t.risk, 0) / closed.length : null;
  const avgReward = closed.length ? closed.reduce((s, t) => s + t.reward, 0) / closed.length : null;
  const rr = avgRisk && avgReward ? avgReward / avgRisk : null;
  const days = Math.max(1, Math.round((Date.now() - state.startedAt) / (1000 * 60 * 60 * 24)));
  return { pnl, winRate, rr, count: closed.length, days };
}

// ---- rendering -----------------------------------------------------------

function renderStats() {
  const s = computeStats();
  const pnlEl = document.getElementById("statPnl");
  pnlEl.textContent = `${s.pnl >= 0 ? "+" : ""}$${s.pnl.toFixed(2)}`;
  pnlEl.className = "stat-value " + (s.pnl > 0 ? "pos" : s.pnl < 0 ? "neg" : "");

  document.getElementById("statWinRate").textContent = s.winRate === null ? "—" : `${s.winRate.toFixed(0)}%`;
  document.getElementById("statRR").textContent = s.rr === null ? "—" : `1 : ${s.rr.toFixed(2)}`;
  document.getElementById("statCount").textContent = s.count;
  document.getElementById("statDays").textContent = s.days;
}

function renderTickers() {
  const el = document.getElementById("tickers");
  el.innerHTML = SYMBOLS.map(sym => {
    const chg = pctChange(sym);
    const price = state.prices[sym];
    const dir = chg >= 0 ? "up" : "down";
    const arrow = chg >= 0 ? "▲" : "▼";
    return `<div class="ticker">
      <span class="ticker-sym">${sym}</span>
      <span class="ticker-price">$${price.toLocaleString(undefined, {maximumFractionDigits: sym === "LTC" ? 2 : 0})}</span>
      <span class="ticker-chg ${dir}">${arrow} ${Math.abs(chg).toFixed(2)}%</span>
    </div>`;
  }).join("");
}

function renderPositions() {
  const el = document.getElementById("positions");
  document.getElementById("posCount").textContent = `${state.positions.length} active`;
  if (!state.positions.length) {
    el.innerHTML = `<p class="empty">no open positions. bot is watching the tape.</p>`;
    return;
  }
  el.innerHTML = state.positions.map(p => `
    <div class="position">
      <span>${p.sym} <span class="position-side ${p.side}">${p.side.toUpperCase()}</span></span>
      <span>${p.size}x @ ${p.entryPrice}c</span>
      <span>risk $${p.risk}</span>
    </div>
  `).join("");
}

function renderJournal() {
  const el = document.getElementById("journal");
  const entries = state.journal || [];
  el.innerHTML = entries.slice().reverse().map(e => {
    const cls = e.result ? `entry ${e.result}` : "entry";
    const resultTag = e.result ? `<span class="entry-result ${e.result}">${e.result.toUpperCase()}</span>` : "";
    const time = new Date(e.ts).toLocaleTimeString();
    return `<div class="${cls}">
      <div class="entry-meta"><span>${time}</span>${resultTag}</div>
      <div class="entry-text">${e.text}</div>
    </div>`;
  }).join("");
}

function renderAll() {
  renderStats();
  renderTickers();
  renderPositions();
  renderJournal();
}

// ---- main loop -------------------------------------------------------------

function tick() {
  if (!state.running) return;
  tickPrices();
  maybeOpenPosition();
  maybeClosePositions();
  renderAll();
  saveState();
}

function boot() {
  checkAccess();
  loadState();
  if (!state.journal || !state.journal.length) {
    addEntry({ kind: "note", text: "day 1. laptop open, coffee made, nobody clocking me in. let's see what the tape gives me.", result: null });
  }
  renderAll();
  setInterval(tick, TICK_MS);

  document.getElementById("strategySelect").value = state.strategy;
  document.getElementById("strategySelect").addEventListener("change", e => {
    state.strategy = e.target.value;
    document.getElementById("engineStatus").textContent =
      state.strategy === "off" ? "paused — watching only" : "scanning...";
    saveState();
  });

  const toggleBtn = document.getElementById("toggleRun");
  toggleBtn.addEventListener("click", () => {
    state.running = !state.running;
    toggleBtn.textContent = state.running ? "pause bot" : "resume bot";
    document.getElementById("engineStatus").textContent = state.running ? "scanning..." : "paused";
    saveState();
  });

  document.getElementById("resetAll").addEventListener("click", () => {
    if (!confirm("Reset all journal entries, trades, and P&L? This can't be undone.")) return;
    localStorage.removeItem("exit9to5_state");
    location.reload();
  });

  // boot line typing flourish
  const bootLine = document.getElementById("bootLine");
  const lines = [
    "> connecting to kalshi_demo_env...",
    "> loading strategy engine [fair-value model]...",
    "> journal online. tracking p&l, win rate, risk:reward...",
    "> status: paper trading. no real funds at risk.",
  ];
  let i = 0;
  setInterval(() => {
    i = (i + 1) % lines.length;
    bootLine.textContent = lines[i];
  }, 3200);
}

boot();
initRain();
