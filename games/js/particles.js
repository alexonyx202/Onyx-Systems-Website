"use strict";
/* ============================================================
   DATA BREAK — particle system (pooled, additive glow)
   ============================================================ */
window.BREAK = window.BREAK || {};

(function (R) {
  "use strict";

  const U = R.Util;
  const MAX = 900;
  const pool = [];
  let active = [];
  let texts = [];

  function get() {
    let p = pool.pop();
    if (!p) p = {};
    return p;
  }

  function spawn(o) {
    if (active.length >= MAX) {
      const old = active.shift();
      pool.push(old);
    }
    const p = get();
    p.x = o.x; p.y = o.y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = o.life || 0.6;
    p.maxLife = p.life;
    p.size = o.size || 4;
    p.color = o.color || "#22d3ee";
    p.grav = o.grav || 0;
    p.drag = o.drag || 0;
    p.add = o.add !== false;         // additive blending
    p.grow = o.grow || 0;            // size growth per sec
    p.spin = o.spin || 0;
    p.rot = U.rand(0, U.TAU);
    p.shape = o.shape || "circle";   // circle | square | shard
    active.push(p);
    return p;
  }

  // burst of sparks
  function burst(x, y, o) {
    const n = Math.round((o.count || 14) * R.Save.quality().particles);
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, U.TAU);
      const sp = U.rand(o.speed * 0.25 || 60, o.speed || 320);
      spawn({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: U.rand(0.3, o.life || 0.7),
        size: U.rand(o.size * 0.4 || 2, o.size || 6),
        color: Array.isArray(o.colors) ? U.pick(o.colors) : (o.color || "#22d3ee"),
        grav: o.grav !== undefined ? o.grav : 260,
        drag: 1.2,
        shape: o.shape || "circle"
      });
    }
  }

  // expanding shockwave ring
  function ring(x, y, color, size, life) {
    spawn({
      x, y, vx: 0, vy: 0,
      life: life || 0.45,
      size: size || 10,
      color: color || "#ffffff",
      grow: (size || 10) * 9,
      add: true,
      shape: "ring"
    });
  }

  // rising sparkle line (power-up pickup)
  function sparkle(x, y, color) {
    for (let i = 0; i < 6; i++) {
      spawn({
        x: x + U.rand(-10, 10), y: y + U.rand(-10, 10),
        vx: U.rand(-40, 40), vy: U.rand(-160, -60),
        life: U.rand(0.35, 0.6),
        size: U.rand(2, 4),
        color: color || "#fbbf24",
        grav: 100, drag: 1,
        shape: "star"
      });
    }
  }

  // debris from destroyed blocks (squares)
  function debris(x, y, w, h, color) {
    const n = Math.round(6 * R.Save.quality().particles);
    for (let i = 0; i < n; i++) {
      spawn({
        x: x + U.rand(-w / 2, w / 2), y: y + U.rand(-h / 2, h / 2),
        vx: U.rand(-160, 160), vy: U.rand(-260, 60),
        life: U.rand(0.35, 0.7),
        size: U.rand(3, 7),
        color: color || "#94a3b8",
        grav: 420, drag: 0.6,
        shape: "square",
        spin: U.rand(-6, 6)
      });
    }
  }

  // float up from ship engines; lean (radians) tilts spawn + emission to follow the bank
  function thruster(x, y, color, lean) {
    const a = lean || 0;
    const ca = Math.cos(a), sa = Math.sin(a);
    // local-space jitter + downward thrust, then rotated by the ship's lean
    const jx = U.rand(-14, 14), jy = U.rand(120, 220);
    const ox = U.rand(-6, 6), oy = U.rand(0, 6);
    spawn({
      x: x + ox * ca - oy * sa, y: y + ox * sa + oy * ca,
      vx: jx * ca - jy * sa, vy: jx * sa + jy * ca,
      life: U.rand(0.2, 0.4),
      size: U.rand(2.5, 5),
      color: color || "#38bdf8",
      grav: -60, drag: 2,
      shape: "circle"
    });
  }

  // screen-space confetti
  function confetti(x, y, n) {
    const colors = ["#22d3ee", "#c084fc", "#34d399", "#fbbf24", "#fb7185"];
    for (let i = 0; i < (n || 40); i++) {
      spawn({
        x: x + U.rand(-20, 20), y: y + U.rand(-20, 20),
        vx: U.rand(-240, 240), vy: U.rand(-420, -80),
        life: U.rand(0.8, 1.6),
        size: U.rand(3, 7),
        color: U.pick(colors),
        grav: 500, drag: 0.8,
        shape: "square",
        spin: U.rand(-8, 8)
      });
    }
  }

  // floating score text
  function text(x, y, str, color, size) {
    texts.push({
      x, y,
      str,
      color: color || "#ffffff",
      size: size || 22,
      life: 0.9,
      maxLife: 0.9,
      vy: -90
    });
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.life -= dt;
      if (p.life <= 0) {
        pool.push(p);
        active[i] = active[active.length - 1];
        active.pop();
        continue;
      }
      p.vy += p.grav * dt;
      const dragF = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragF; p.vy *= dragF;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      if (p.size < 0) p.size = 0;
      p.rot += (p.spin || 0) * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
  }

  function render(ctx, viewW, viewH) {
    // batch canvas state: only touch globalCompositeOperation / globalAlpha /
    // fillStyle when they actually change — per-particle state sets are
    // surprisingly expensive when hundreds of particles are live.
    let lastComp = "source-over";
    let lastAlpha = -1;
    let lastFill = "";
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      const comp = p.add ? "lighter" : "source-over";
      if (comp !== lastComp) { ctx.globalCompositeOperation = comp; lastComp = comp; }
      if (a !== lastAlpha) { ctx.globalAlpha = a; lastAlpha = a; }
      if (p.color !== lastFill) { ctx.fillStyle = p.color; lastFill = p.color; }
      const s = p.size * (0.4 + 0.6 * a);
      if (p.shape === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + 3 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, U.TAU);
        ctx.stroke();
      } else if (p.shape === "square") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else if (p.shape === "star") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a2 = k * Math.PI / 2;
          ctx.lineTo(Math.cos(a2) * s, Math.sin(a2) * s);
          ctx.lineTo(Math.cos(a2 + Math.PI / 4) * s * 0.4, Math.sin(a2 + Math.PI / 4) * s * 0.4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        // circle fast path: no save/translate/restore needed
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, s), 0, U.TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";

    // texts
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const a = Math.min(1, t.life / t.maxLife * 1.4);
      ctx.globalAlpha = a;
      ctx.font = `700 ${t.size}px "Cascadia Code", ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillText(t.str, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    while (active.length) pool.push(active.pop());
    texts.length = 0;
  }

  R.Particles = { burst, ring, sparkle, debris, thruster, confetti, text, update, render, clear, spawn };
})(window.BREAK);
