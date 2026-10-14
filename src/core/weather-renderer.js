(() => {
  /* =======================================================================
       Shared weather renderer

       Lightweight animated weather (rain, storm, snow, fog, cloud shadows,
       embers) drawn on a single 2D canvas layered over the board. Built to
       run on modest devices:
         - particles are drawn in batches (one path per frame per layer),
         - capped at ~30 fps and paused while the tab is hidden,
         - particle counts scale with screen area and intensity,
         - rendered at CSS resolution (no devicePixelRatio upscaling),
         - "prefers-reduced-motion" lowers counts and disables flashes.

       Exposed as `window._n21_.weather`:
         weather.TYPES                       -> [{ key, label }]
         weather.start(container, type, intensity)
         weather.stop()
    ======================================================================= */

  const TYPES = [
    { key: "lluvia", label: "Lluvia" },
    { key: "tormenta", label: "Tormenta" },
    { key: "nieve", label: "Nieve" },
    { key: "niebla", label: "Niebla" },
    { key: "nubes", label: "Nubes" },
    { key: "brasas", label: "Brasas" },
  ];

  const CANVAS_ID = "n21-weather-overlay";
  const FRAME_MS = 1000 / 30;
  const REFERENCE_AREA = 1920 * 1080;

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let state = null; // { canvas, ctx, type, intensity, particles, ... }
  let frame = null;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /* ----------------------- sprites ----------------------- */

  // Soft round blob, rendered once and reused for fog and cloud shadows.
  function makeBlobSprite(size, color) {
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const ctx = sprite.getContext("2d");
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color(1));
    gradient.addColorStop(0.55, color(0.55));
    gradient.addColorStop(1, color(0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return sprite;
  }

  let fogSprite = null;
  let shadowSprite = null;

  function getFogSprite() {
    if (!fogSprite) fogSprite = makeBlobSprite(256, (a) => `rgba(220, 224, 230, ${a})`);
    return fogSprite;
  }

  function getShadowSprite() {
    if (!shadowSprite) shadowSprite = makeBlobSprite(256, (a) => `rgba(0, 0, 0, ${a})`);
    return shadowSprite;
  }

  /* ----------------------- particles ----------------------- */

  function particleCount(base, extra) {
    const s = state;
    const areaFactor = Math.min(Math.max((s.width * s.height) / REFERENCE_AREA, 0.3), 1.5);
    const motionFactor = reducedMotion ? 0.4 : 1;
    return Math.round((base + extra * s.intensity) * areaFactor * motionFactor);
  }

  function spawn(type, initial) {
    const { width, height } = state;
    switch (type) {
      case "lluvia":
      case "tormenta":
        return {
          x: rand(-width * 0.2, width),
          y: initial ? rand(-height, height) : rand(-height * 0.3, -10),
          len: rand(10, 22),
          speed: rand(700, 1100) * (type === "tormenta" ? 1.25 : 1),
        };
      case "nieve":
        return {
          x: rand(0, width),
          y: initial ? rand(-height, height) : rand(-40, -5),
          r: rand(1, 3.2),
          speed: rand(25, 70),
          phase: rand(0, Math.PI * 2),
        };
      case "brasas":
        return {
          x: rand(0, width),
          y: initial ? rand(0, height) : height + rand(5, 40),
          r: rand(0.8, 2.2),
          speed: rand(20, 60),
          phase: rand(0, Math.PI * 2),
          life: rand(0.5, 1),
        };
      case "niebla":
        return {
          x: rand(-0.3, 1.1) * width,
          y: rand(-0.1, 1) * height,
          size: rand(0.35, 0.7) * Math.max(width, height),
          speed: rand(6, 16),
          alpha: rand(0.25, 0.5),
        };
      case "nubes":
        return {
          x: initial ? rand(-0.3, 1.1) * width : -0.6 * width,
          y: rand(-0.2, 1) * height,
          size: rand(0.35, 0.65) * Math.max(width, height),
          speed: rand(10, 22),
          alpha: rand(0.35, 0.6),
        };
      default:
        return null;
    }
  }

  function populate() {
    const type = state.type;
    let count = 0;
    if (type === "lluvia") count = particleCount(120, 520);
    if (type === "tormenta") count = particleCount(260, 700);
    if (type === "nieve") count = particleCount(70, 330);
    if (type === "brasas") count = particleCount(25, 140);
    if (type === "niebla") count = Math.round(5 + 6 * state.intensity);
    if (type === "nubes") count = Math.round(3 + 4 * state.intensity);
    state.particles = Array.from({ length: count }, () => spawn(type, true));
  }

  /* ----------------------- drawing ----------------------- */

  function drawRain(ctx, dt, wind) {
    const { width, height, particles } = state;
    ctx.strokeStyle = `rgba(185, 205, 235, ${0.35 + 0.25 * state.intensity})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.y += p.speed * dt;
      p.x += p.speed * wind * dt;
      if (p.y > height || p.x > width + 20) particles[i] = spawn(state.type, false);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.len * wind, p.y - p.len);
    }
    ctx.stroke();
  }

  function drawSnow(ctx, dt, time) {
    const { width, height, particles } = state;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.y += p.speed * dt;
      p.x += Math.sin(time * 0.8 + p.phase) * 18 * dt;
      if (p.y > height + 5 || p.x < -10 || p.x > width + 10) particles[i] = spawn("nieve", false);
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function drawEmbers(ctx, dt, time) {
    const { particles } = state;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255, 140, 50, 0.85)";
    ctx.beginPath();
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.y -= p.speed * dt;
      p.x += Math.sin(time * 1.6 + p.phase) * 14 * dt;
      p.life -= dt * 0.12;
      if (p.y < -10 || p.life <= 0) particles[i] = spawn("brasas", false);
      const flicker = 0.6 + 0.4 * Math.sin(time * 9 + p.phase);
      const r = p.r * flicker;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawBlobs(ctx, dt, sprite, alphaScale) {
    const { width, particles } = state;
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.x += p.speed * dt;
      if (p.x - p.size / 2 > width) {
        particles[i] = spawn(state.type, false);
        continue;
      }
      ctx.globalAlpha = p.alpha * alphaScale;
      ctx.drawImage(sprite, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawLightning(ctx, dt) {
    if (reducedMotion) return;
    const s = state;
    s.nextFlash -= dt;
    if (s.nextFlash <= 0) {
      s.flash = 1;
      s.nextFlash = rand(6, 14) / (0.6 + s.intensity);
    }
    if (s.flash > 0) {
      // Soft double flicker, never a full white screen.
      const a = 0.28 * s.flash * (s.flash > 0.5 ? 1 : 0.6);
      ctx.fillStyle = `rgba(225, 232, 255, ${a})`;
      ctx.fillRect(0, 0, s.width, s.height);
      s.flash = Math.max(0, s.flash - dt * 3.2);
    }
  }

  function render(now) {
    frame = null;
    const s = state;
    if (!s) return;
    if (document.hidden) return; // resumed on visibilitychange

    const elapsed = now - s.lastFrame;
    if (elapsed < FRAME_MS) {
      frame = requestAnimationFrame(render);
      return;
    }
    const dt = Math.min(elapsed / 1000, 0.1);
    s.lastFrame = now;
    const time = now / 1000;

    resize();
    const ctx = s.ctx;
    ctx.clearRect(0, 0, s.width, s.height);

    switch (s.type) {
      case "lluvia":
        drawRain(ctx, dt, 0.18);
        break;
      case "tormenta":
        ctx.fillStyle = `rgba(8, 12, 28, ${0.12 + 0.18 * s.intensity})`;
        ctx.fillRect(0, 0, s.width, s.height);
        drawRain(ctx, dt, 0.32);
        drawLightning(ctx, dt);
        break;
      case "nieve":
        drawSnow(ctx, dt, time);
        break;
      case "brasas":
        drawEmbers(ctx, dt, time);
        break;
      case "niebla":
        ctx.fillStyle = `rgba(210, 214, 220, ${0.05 + 0.12 * s.intensity})`;
        ctx.fillRect(0, 0, s.width, s.height);
        drawBlobs(ctx, dt, getFogSprite(), 0.3 + 0.5 * s.intensity);
        break;
      case "nubes":
        drawBlobs(ctx, dt, getShadowSprite(), 0.25 + 0.45 * s.intensity);
        break;
      default:
        break;
    }

    frame = requestAnimationFrame(render);
  }

  function resize() {
    const s = state;
    const rect = s.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (s.canvas.width !== width) s.canvas.width = width;
    if (s.canvas.height !== height) s.canvas.height = height;
    if (s.width !== width || s.height !== height) {
      const changed = Math.abs(width - s.width) > 50 || Math.abs(height - s.height) > 50;
      s.width = width;
      s.height = height;
      if (changed && s.particles.length) populate();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state && frame === null) {
      state.lastFrame = performance.now();
      frame = requestAnimationFrame(render);
    }
  });

  /**
   * Start (or switch) the weather effect.
   * @param {HTMLElement} container - Element to place the layer in
   * @param {string} type - One of TYPES keys
   * @param {number} intensity - 0..1
   */
  function start(container, type, intensity = 0.5) {
    if (!container || !TYPES.some((t) => t.key === type)) {
      stop();
      return;
    }
    let canvas = document.getElementById(CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = CANVAS_ID;
      canvas.className = "n21-weather-overlay";
    }
    if (canvas.parentElement !== container) container.appendChild(canvas);

    const level = Math.min(Math.max(Number(intensity) || 0, 0), 1);
    if (state && state.canvas === canvas && state.type === type && state.intensity === level) {
      return; // already running
    }

    state = {
      canvas,
      ctx: canvas.getContext("2d"),
      type,
      intensity: level,
      particles: [],
      width: 0,
      height: 0,
      lastFrame: 0,
      flash: 0,
      nextFlash: rand(2, 5),
    };
    canvas.dataset.weather = type;
    resize();
    populate();
    if (frame === null) frame = requestAnimationFrame(render);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    state = null;
    document.getElementById(CANVAS_ID)?.remove();
  }

  window._n21_.weather = {
    TYPES,
    start,
    stop,
  };
})();
