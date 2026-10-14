(() => {
  /* =======================================================================
       Shared weather renderer

       Lightweight animated weather (rain, storm, snow, fog, cloud shadows,
       embers) drawn on a single 2D canvas layered over the board.

       Particles live in WORLD coordinates (board cells) and are drawn through
       the camera's world->screen transform, so they pan, rotate and zoom with
       the camera. The transform is an affine map rebuilt each frame from three
       projected points (the board is a plane), so drawing stays cheap.

       Built to run on modest devices:
         - particles are drawn in batches (one path per frame per layer),
         - capped at ~30 fps and paused while the tab is hidden,
         - particle counts depend on the screen area, not on the zoom,
         - rendered at CSS resolution (no devicePixelRatio upscaling),
         - "prefers-reduced-motion" lowers counts and disables flashes.

       Exposed as `window._n21_.weather`:
         weather.TYPES
         weather.start(container, type, intensity, { project })
           project(worldX, worldZ) -> {x, y} in canvas CSS pixels
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
  // Fallback when there's no camera: 1 world unit = 100 screen pixels.
  const FALLBACK_SCALE = 100;

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let state = null;
  let frame = null;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /* ----------------------- camera transform ----------------------- */

  /**
   * Affine world->screen transform [a, b, c, d, e, f] (canvas setTransform
   * order) plus the visible world bounds and pixels per world unit.
   */
  function computeView() {
    const s = state;
    let t = null;
    try {
      const p0 = s.project?.(0, 0);
      const px = s.project?.(1, 0);
      const pz = s.project?.(0, 1);
      if (p0 && px && pz) {
        t = [px.x - p0.x, px.y - p0.y, pz.x - p0.x, pz.y - p0.y, p0.x, p0.y];
      }
    } catch (_error) {}
    if (!t || !t.every(Number.isFinite) || Math.abs(t[0] * t[3] - t[1] * t[2]) < 1e-6) {
      t = [FALLBACK_SCALE, 0, 0, FALLBACK_SCALE, 0, 0];
    }

    const [a, b, c, d, e, f] = t;
    const det = a * d - b * c;
    const toWorld = (x, y) => {
      const dx = x - e;
      const dy = y - f;
      return { x: (d * dx - c * dy) / det, z: (-b * dx + a * dy) / det };
    };
    const corners = [
      toWorld(0, 0),
      toWorld(s.width, 0),
      toWorld(0, s.height),
      toWorld(s.width, s.height),
    ];
    const xs = corners.map((p) => p.x);
    const zs = corners.map((p) => p.z);
    return {
      t,
      pxPerUnit: Math.sqrt(Math.abs(det)),
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  }

  /* ----------------------- sprites ----------------------- */

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
  const getFogSprite = () =>
    fogSprite || (fogSprite = makeBlobSprite(256, (a) => `rgba(220, 224, 230, ${a})`));
  const getShadowSprite = () =>
    shadowSprite || (shadowSprite = makeBlobSprite(256, (a) => `rgba(0, 0, 0, ${a})`));

  /* ----------------------- particles ----------------------- */

  function particleCount(base, extra) {
    const s = state;
    const areaFactor = Math.min(Math.max((s.width * s.height) / REFERENCE_AREA, 0.3), 1.5);
    const motionFactor = reducedMotion ? 0.4 : 1;
    return Math.round((base + extra * s.intensity) * areaFactor * motionFactor);
  }

  // World sizes are in board cells (1 unit = 1 cell).
  function spawn(type, view, initial) {
    const spanX = view.maxX - view.minX;
    const spanZ = view.maxZ - view.minZ;
    const x = rand(view.minX - spanX * 0.1, view.maxX + spanX * 0.1);
    const zAnywhere = rand(view.minZ - spanZ * 0.1, view.maxZ);
    switch (type) {
      case "lluvia":
      case "tormenta":
        return {
          x,
          z: initial ? zAnywhere : view.minZ - rand(0, spanZ * 0.3),
          len: rand(0.12, 0.25),
          speed: rand(7, 11) * (type === "tormenta" ? 1.25 : 1),
        };
      case "nieve":
        return {
          x,
          z: initial ? zAnywhere : view.minZ - rand(0, spanZ * 0.1),
          r: rand(0.012, 0.035),
          speed: rand(0.3, 0.75),
          phase: rand(0, Math.PI * 2),
        };
      case "brasas":
        return {
          x,
          z: initial ? rand(view.minZ, view.maxZ) : view.maxZ + rand(0, spanZ * 0.1),
          r: rand(0.01, 0.025),
          speed: rand(0.25, 0.7),
          phase: rand(0, Math.PI * 2),
          life: rand(0.5, 1),
        };
      case "niebla":
      case "nubes": {
        const size = rand(4, 9) * (type === "nubes" ? 1.2 : 1);
        return {
          x: initial ? x : view.minX - size,
          z: rand(view.minZ - spanZ * 0.1, view.maxZ + spanZ * 0.1),
          size,
          speed: rand(0.08, 0.2),
          alpha: type === "nubes" ? rand(0.35, 0.6) : rand(0.25, 0.5),
        };
      }
      default:
        return null;
    }
  }

  function populate(view) {
    const type = state.type;
    let count = 0;
    if (type === "lluvia") count = particleCount(120, 520);
    if (type === "tormenta") count = particleCount(260, 700);
    if (type === "nieve") count = particleCount(70, 330);
    if (type === "brasas") count = particleCount(25, 140);
    if (type === "niebla") count = Math.round(5 + 6 * state.intensity);
    if (type === "nubes") count = Math.round(3 + 4 * state.intensity);
    state.particles = Array.from({ length: count }, () => spawn(type, view, true));
  }

  /** Whether a particle left the visible area (camera moved/zoomed). */
  function isOutside(p, view, margin) {
    const spanX = view.maxX - view.minX;
    const spanZ = view.maxZ - view.minZ;
    const m = margin + (p.size || 0);
    return (
      p.x < view.minX - spanX * 0.3 - m ||
      p.x > view.maxX + spanX * 0.3 + m ||
      p.z < view.minZ - spanZ * 0.5 - m ||
      p.z > view.maxZ + spanZ * 0.3 + m
    );
  }

  /* ----------------------- drawing ----------------------- */

  function drawRain(ctx, view, dt, wind) {
    const { particles } = state;
    ctx.strokeStyle = `rgba(185, 205, 235, ${0.35 + 0.25 * state.intensity})`;
    ctx.lineWidth = 1 / view.pxPerUnit;
    ctx.beginPath();
    for (let i = 0; i < particles.length; i += 1) {
      let p = particles[i];
      p.z += p.speed * dt;
      p.x += p.speed * wind * dt;
      if (p.z > view.maxZ || isOutside(p, view, 1)) p = particles[i] = spawn(state.type, view, false);
      ctx.moveTo(p.x, p.z);
      ctx.lineTo(p.x - p.len * wind, p.z - p.len);
    }
    ctx.stroke();
  }

  function drawSnow(ctx, view, dt, time) {
    const { particles } = state;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    for (let i = 0; i < particles.length; i += 1) {
      let p = particles[i];
      p.z += p.speed * dt;
      p.x += Math.sin(time * 0.8 + p.phase) * 0.2 * dt;
      if (p.z > view.maxZ || isOutside(p, view, 1)) p = particles[i] = spawn("nieve", view, false);
      // Keep flakes visible when zoomed far out.
      const r = Math.max(p.r, 1 / view.pxPerUnit);
      ctx.moveTo(p.x + r, p.z);
      ctx.arc(p.x, p.z, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function drawEmbers(ctx, view, dt, time) {
    const { particles } = state;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255, 140, 50, 0.85)";
    ctx.beginPath();
    for (let i = 0; i < particles.length; i += 1) {
      let p = particles[i];
      p.z -= p.speed * dt;
      p.x += Math.sin(time * 1.6 + p.phase) * 0.15 * dt;
      p.life -= dt * 0.12;
      if (p.z < view.minZ || p.life <= 0 || isOutside(p, view, 1)) {
        p = particles[i] = spawn("brasas", view, false);
      }
      const flicker = 0.6 + 0.4 * Math.sin(time * 9 + p.phase);
      const r = Math.max(p.r * flicker, 0.8 / view.pxPerUnit);
      ctx.moveTo(p.x + r, p.z);
      ctx.arc(p.x, p.z, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawBlobs(ctx, view, dt, sprite, alphaScale) {
    const { particles } = state;
    for (let i = 0; i < particles.length; i += 1) {
      let p = particles[i];
      p.x += p.speed * dt;
      if (p.x - p.size / 2 > view.maxX || isOutside(p, view, 0)) {
        p = particles[i] = spawn(state.type, view, false);
      }
      ctx.globalAlpha = p.alpha * alphaScale;
      ctx.drawImage(sprite, p.x - p.size / 2, p.z - p.size / 2, p.size, p.size);
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
    if (!s || document.hidden) return; // resumed on visibilitychange

    const elapsed = now - s.lastFrame;
    if (elapsed < FRAME_MS) {
      frame = requestAnimationFrame(render);
      return;
    }
    const dt = Math.min(elapsed / 1000, 0.1);
    s.lastFrame = now;
    const time = now / 1000;

    resize();
    const view = computeView();
    if (!s.particles.length) populate(view);

    const ctx = s.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, s.width, s.height);

    // Screen-space tints first.
    if (s.type === "tormenta") {
      ctx.fillStyle = `rgba(8, 12, 28, ${0.12 + 0.18 * s.intensity})`;
      ctx.fillRect(0, 0, s.width, s.height);
    }
    if (s.type === "niebla") {
      ctx.fillStyle = `rgba(210, 214, 220, ${0.05 + 0.12 * s.intensity})`;
      ctx.fillRect(0, 0, s.width, s.height);
    }

    // World-space particles, through the camera transform.
    ctx.setTransform(...view.t);
    switch (s.type) {
      case "lluvia":
        drawRain(ctx, view, dt, 0.18);
        break;
      case "tormenta":
        drawRain(ctx, view, dt, 0.32);
        break;
      case "nieve":
        drawSnow(ctx, view, dt, time);
        break;
      case "brasas":
        drawEmbers(ctx, view, dt, time);
        break;
      case "niebla":
        drawBlobs(ctx, view, dt, getFogSprite(), 0.3 + 0.5 * s.intensity);
        break;
      case "nubes":
        drawBlobs(ctx, view, dt, getShadowSprite(), 0.25 + 0.45 * s.intensity);
        break;
      default:
        break;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (s.type === "tormenta") drawLightning(ctx, dt);

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
      if (changed) s.particles = []; // repopulated for the new size
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
   * @param {{project?: Function}} [options]
   */
  function start(container, type, intensity = 0.5, options = {}) {
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
      if (options.project) state.project = options.project;
      return; // already running
    }

    state = {
      canvas,
      ctx: canvas.getContext("2d"),
      type,
      intensity: level,
      project: options.project || state?.project || null,
      particles: [],
      width: 0,
      height: 0,
      lastFrame: 0,
      flash: 0,
      nextFlash: rand(2, 5),
    };
    canvas.dataset.weather = type;
    if (frame === null) frame = requestAnimationFrame(render);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    state = null;
    document.getElementById(CANVAS_ID)?.remove();
  }

  window._n21_.weather = { TYPES, start, stop };
})();
