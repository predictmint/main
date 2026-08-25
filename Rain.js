/* Shared subtle background effect — used on both landing.html and index.html.
   Kept separate from app.js so the landing page doesn't need to load (or
   accidentally run) the trading engine. */

function initRain() {
  const canvas = document.getElementById("rain");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, cols, drops;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    cols = Math.floor(w / 16);
    drops = Array(cols).fill(0).map(() => Math.random() * -50);
  }
  resize();
  window.addEventListener("resize", resize);

  const chars = "01アイウエオカキクケコ$%+-";
  function draw() {
    ctx.fillStyle = "rgba(7,9,10,0.08)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3ef78a";
    ctx.font = "14px monospace";
    drops.forEach((y, x) => {
      const char = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(char, x * 16, y * 16);
      if (y * 16 > h && Math.random() > 0.975) drops[x] = 0;
      else drops[x] = y + 1;
    });
  }
  setInterval(draw, 70);
}

initRain();
