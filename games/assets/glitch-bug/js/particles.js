/* ============================================================
   GLITCH BUG — particles.js
   Freelist-pooled particle effects + floating score text + rings.
   ============================================================ */
'use strict';

const Particles = (function () {
  const parts = [];   // live particles
  const free = [];    // dead, reusable
  const texts = [];
  const waves = [];

  function spawn(x, y, opts) {
    const p = free.pop() || {};
    p.x = x; p.y = y;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.life = opts.life || 0.5; p.max = p.life;
    p.size = opts.size || 2;
    p.color = opts.color || '#39ff14';
    p.grav = opts.grav || 0;
    p.drag = opts.drag == null ? 0.88 : opts.drag;
    parts.push(p);
    return p;
  }

  function burst(x, y, color, count, speed, opts) {
    opts = opts || {};
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = speed * rand(0.3, 1);
      spawn(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, opts.life || 0.6),
        size: rand(1, opts.size || 3),
        color: choice(Array.isArray(color) ? color : [color]),
        grav: opts.grav || 0, drag: opts.drag || 0.86,
      });
    }
  }

  function ring(x, y, color, speed, life) {
    waves.push({ x, y, r: 1, speed: speed || 80, life: life || 0.35, max: life || 0.35, color: color || '#fff' });
  }

  function addText(x, y, str, color, scale, life) {
    texts.push({ x, y, str, color: color || '#fff', scale: scale || 1, life: life || 0.9, max: life || 0.9 });
  }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        free.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt;
      t.y -= 14 * dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const wv = waves[i];
      wv.life -= dt;
      wv.r += wv.speed * dt;
      if (wv.life <= 0) waves.splice(i, 1);
    }
  }

  function draw(ctx) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (const wv of waves) {
      ctx.globalAlpha = clamp(wv.life / wv.max, 0, 1) * 0.8;
      ctx.strokeStyle = wv.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(wv.x - wv.r, wv.y - wv.r, wv.r * 2, wv.r * 2);
    }
    ctx.globalAlpha = 1;

    for (const t of texts) {
      ctx.globalAlpha = clamp(t.life / t.max, 0, 1);
      FONT.drawCentered(ctx, t.str, t.x, t.y, t.scale, t.color);
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    parts.length = 0;
    free.length = 0;
    texts.length = 0;
    waves.length = 0;
  }

  return { spawn, burst, ring, addText, update, draw, clear };
})();
