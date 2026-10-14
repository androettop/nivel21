(() => {
  /* =======================================================================
       Shared weather renderer

       Animated weather (rain, storm, snow, fog, cloud shadows, embers) drawn
       on one 2D canvas over the board, built from TILEABLE TEXTURES:

         - each effect is 2-3 layers of a seamless 512px texture generated
           once at startup (no image files, no per-particle work),
         - every frame each layer is a single pattern fill whose offset moves
           with time (falling rain, drifting fog...),
         - the fill goes through the camera's world->screen transform, so the
           weather pans, rotates and zooms with the board (3 projected points
           per frame give the affine map; the board is a plane).

       Cheap enough for modest devices: ~30 fps cap, paused while the tab is
       hidden, CSS resolution, and "prefers-reduced-motion" removes the storm
       flashes and slows everything down.

       Exposed as `window._n21_.weather`:
         weather.TYPES
         weather.start(container, type, intensity, { project })
           project(worldX, worldZ) -> {x, y} in canvas CSS pixels (optional;
           without it the effect is drawn in screen space)
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
  const TILE = 512; // texture size in pixels
  const FRAME_MS = 1000 / 30;
  // On-screen size particle tiles aim for, whatever the zoom.
  const TARGET_TILE_PX = 512;
  // Screen-space fallback: 1 world unit = 100 px.
  const FALLBACK_SCALE = 100;

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let state = null;
  let frame = null;

  /* ----------------------- seamless textures ----------------------- */

  // Seeded random so textures look the same on every client.
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function makeTile(draw, seed) {
    const canvas = document.createElement("canvas");
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext("2d");
    draw(ctx, seeded(seed));
    return canvas;
  }

  /** Call fn at (x, y) and at its wrapped copies so the tile is seamless. */
  function wrapped(x, y, reach, fn) {
    for (const dx of [-TILE, 0, TILE]) {
      for (const dy of [-TILE, 0, TILE]) {
        if (x + dx > -reach && x + dx < TILE + reach && y + dy > -reach && y + dy < TILE + reach) {
          fn(x + dx, y + dy);
        }
      }
    }
  }

  function rainTile(count, alpha, seed) {
    return makeTile((ctx, rnd) => {
      ctx.strokeStyle = `rgba(190, 210, 240, ${alpha})`;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = rnd() * TILE;
        const y = rnd() * TILE;
        const len = 14 + rnd() * 22;
        wrapped(x, y, len, (px, py) => {
          ctx.moveTo(px, py);
          ctx.lineTo(px - len * 0.18, py - len);
        });
      }
      ctx.stroke();
    }, seed);
  }

  function dotsTile(count, minR, maxR, color, seed) {
    return makeTile((ctx, rnd) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = rnd() * TILE;
        const y = rnd() * TILE;
        const r = minR + rnd() * (maxR - minR);
        wrapped(x, y, r, (px, py) => {
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, Math.PI * 2);
        });
      }
      ctx.fill();
    }, seed);
  }

  function blobTile(count, rgb, maxAlpha, seed) {
    return makeTile((ctx, rnd) => {
      for (let i = 0; i < count; i += 1) {
        const x = rnd() * TILE;
        const y = rnd() * TILE;
        const r = TILE * (0.18 + rnd() * 0.22);
        const a = maxAlpha * (0.5 + rnd() * 0.5);
        wrapped(x, y, r, (px, py) => {
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, `rgba(${rgb}, ${a})`);
          g.addColorStop(0.6, `rgba(${rgb}, ${a * 0.45})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        });
      }
    }, seed);
  }

  // Generated lazily the first time each effect is used.
  const tiles = {};
  function getTiles(type) {
    if (tiles[type]) return tiles[type];
    switch (type) {
      case "lluvia":
        tiles[type] = [rainTile(140, 0.55, 11), rainTile(90, 0.3, 12)];
        break;
      case "tormenta":
        tiles[type] = [rainTile(260, 0.6, 21), rainTile(180, 0.35, 22)];
        break;
      case "nieve":
        tiles[type] = [
          dotsTile(70, 2.2, 4, "rgba(255, 255, 255, 0.9)", 31),
          dotsTile(110, 1.2, 2.4, "rgba(255, 255, 255, 0.6)", 32),
        ];
        break;
      case "brasas":
        tiles[type] = [
          dotsTile(26, 1.6, 3.2, "rgba(255, 150, 60, 0.9)", 41),
          dotsTile(40, 1, 2, "rgba(255, 110, 40, 0.6)", 42),
        ];
        break;
      case "niebla":
        tiles[type] = [blobTile(9, "220, 224, 230", 0.55, 51), blobTile(7, "205, 210, 218", 0.4, 52)];
        break;
      case "nubes":
        tiles[type] = [blobTile(6, "0, 0, 0", 0.55, 61)];
        break;
      default:
        tiles[type] = [];
    }
    return tiles[type];
  }

  /* ----------------------- layers ----------------------- */

  // Per effect: tile world size (cells), velocity (cells/s) and opacity.
  // A lower-res slower layer behind a faster one gives a parallax depth.
  function layersFor(type) {
    const slow = reducedMotion ? 0.4 : 1;
    switch (type) {
      case "lluvia":
        return [
          { tile: 0, size: 4, vx: 1.2 * slow, vz: 7 * slow, alpha: 1, particles: true },
          { tile: 1, size: 2.6, vx: 0.8 * slow, vz: 5 * slow, alpha: 0.8, particles: true },
        ];
      case "tormenta":
        return [
          { tile: 0, size: 4, vx: 2.6 * slow, vz: 10 * slow, alpha: 1, particles: true },
          { tile: 1, size: 2.8, vx: 1.8 * slow, vz: 7.5 * slow, alpha: 0.85, particles: true },
        ];
      case "nieve":
        return [
          { tile: 0, size: 6, vx: 0.15, vz: 0.6 * slow, sway: 0.35, alpha: 1, particles: true },
          { tile: 1, size: 4, vx: 0.1, vz: 0.4 * slow, sway: 0.25, alpha: 0.9, particles: true },
        ];
      case "brasas":
        return [
          { tile: 0, size: 6, vx: 0.05, vz: -0.5 * slow, sway: 0.3, alpha: 1, particles: true },
          { tile: 1, size: 4.5, vx: 0.08, vz: -0.35 * slow, sway: 0.2, alpha: 0.9, additive: true, particles: true },
        ];
      case "niebla":
        return [
          { tile: 0, size: 16, vx: 0.18 * slow, vz: 0.03, alpha: 1 },
          { tile: 1, size: 11, vx: -0.12 * slow, vz: 0.05, alpha: 1 },
        ];
      case "nubes":
        return [{ tile: 0, size: 24, vx: 0.35 * slow, vz: 0.1, alpha: 1 }];
      default:
        return [];
    }
  }

  /* ----------------------- camera transform ----------------------- */

  function computeView() {
    const s = state;
    let t = null;
    try {
      const p0 = s.project?.(0, 0);
      const px = s.project?.(1, 0);
      const pz = s.project?.(0, 1);
      if (p0 && px && pz) t = [px.x - p0.x, px.y - p0.y, pz.x - p0.x, pz.y - p0.y, p0.x, p0.y];
    } catch (_error) {}
    if (!t || !t.every(Number.isFinite) || Math.abs(t[0] * t[3] - t[1] * t[2]) < 1e-6) {
      t = [FALLBACK_SCALE, 0, 0, FALLBACK_SCALE, 0, 0];
    }
    const [a, b, c, d, e, f] = t;
    const det = a * d - b * c;
    const toWorld = (x, y) => ({
      x: (d * (x - e) - c * (y - f)) / det,
      z: (-b * (x - e) + a * (y - f)) / det,
    });
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

  /* ----------------------- render loop ----------------------- */

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
    s.time += dt;

    resize();
    const ctx = s.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, s.width, s.height);

    // Screen-space tints.
    if (s.type === "tormenta") {
      ctx.fillStyle = `rgba(8, 12, 28, ${0.12 + 0.18 * s.intensity})`;
      ctx.fillRect(0, 0, s.width, s.height);
    }
    if (s.type === "niebla") {
      ctx.fillStyle = `rgba(210, 214, 220, ${0.05 + 0.12 * s.intensity})`;
      ctx.fillRect(0, 0, s.width, s.height);
    }

    // Texture layers, in world space through the camera.
    const view = computeView();
    ctx.setTransform(...view.t);
    const textures = getTiles(s.type);
    s.layers.forEach((layer) => {
      const texture = textures[layer.tile];
      if (!texture) return;
      if (!layer.pattern) layer.pattern = ctx.createPattern(texture, "repeat");
      // Small particles (rain, snow, embers) keep a readable on-screen size:
      // their tile grows/shrinks in powers of two with the zoom.
      let size = layer.size;
      let speed = 1;
      if (layer.particles) {
        const k = Math.round(Math.log2(TARGET_TILE_PX / (layer.size * view.pxPerUnit)));
        speed = 2 ** k;
        size = layer.size * speed;
      }
      const sway = layer.sway ? Math.sin(s.time * 0.9) * layer.sway * speed : 0;
      const ox = (layer.vx * speed * s.time + sway) % size;
      const oz = (layer.vz * speed * s.time) % size;
      const scale = size / TILE;
      layer.pattern.setTransform(new DOMMatrix().translateSelf(ox, oz).scaleSelf(scale, scale));
      ctx.globalAlpha = layer.alpha * (0.35 + 0.65 * s.intensity);
      ctx.globalCompositeOperation = layer.additive ? "lighter" : "source-over";
      ctx.fillStyle = layer.pattern;
      ctx.fillRect(view.minX, view.minZ, view.maxX - view.minX, view.maxZ - view.minZ);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Storm flashes (screen space, soft, never full white).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (s.type === "tormenta" && !reducedMotion) {
      s.nextFlash -= dt;
      if (s.nextFlash <= 0) {
        s.flash = 1;
        s.nextFlash = (6 + Math.random() * 8) / (0.6 + s.intensity);
      }
      if (s.flash > 0) {
        const a = 0.28 * s.flash * (s.flash > 0.5 ? 1 : 0.6);
        ctx.fillStyle = `rgba(225, 232, 255, ${a})`;
        ctx.fillRect(0, 0, s.width, s.height);
        s.flash = Math.max(0, s.flash - dt * 3.2);
      }
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
    s.width = width;
    s.height = height;
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
      layers: layersFor(type),
      width: 0,
      height: 0,
      lastFrame: 0,
      time: 0,
      flash: 0,
      nextFlash: 2 + Math.random() * 3,
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
