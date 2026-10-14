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
           per frame give the affine map; the board is a plane),
         - particle effects have near/mid/far LOD textures picked by zoom
           (cross-faded around each threshold), so they stay readable when
           the camera moves away.

       Cheap enough for modest devices: ~30 fps cap, paused while the tab is
       hidden, CSS resolution, and "prefers-reduced-motion" removes the storm
       flashes and slows everything down.

       Exposed as `window._n21_.weather`:
         weather.TYPES
         weather.start(container, type, intensity, { project, clip })
           project(worldX, worldZ) -> {x, y} in canvas CSS pixels (optional;
           without it the effect is drawn in screen space)
           clip() -> [{x, z}...] world polygon to limit the effect to (the map)
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

  function rainTile(count, alpha, seed, minLen = 14, maxLen = 36, width = 1.4) {
    return makeTile((ctx, rnd) => {
      ctx.strokeStyle = `rgba(190, 210, 240, ${alpha})`;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = rnd() * TILE;
        const y = rnd() * TILE;
        const len = minLen + rnd() * (maxLen - minLen);
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
  // Texture factories, generated lazily the first time they're used.
  // "*-near/-mid/-far" are the LOD versions of the particle effects.
  const TILE_FACTORIES = {
    "rain-near": () => rainTile(140, 0.55, 11),
    "rain-near-2": () => rainTile(90, 0.3, 12),
    "rain-mid": () => rainTile(420, 0.45, 13, 10, 20, 1.2),
    "rain-far": () => rainTile(1100, 0.35, 14, 5, 11, 1),
    "storm-near": () => rainTile(260, 0.6, 21),
    "storm-near-2": () => rainTile(180, 0.35, 22),
    "storm-mid": () => rainTile(700, 0.5, 23, 10, 22, 1.2),
    "storm-far": () => rainTile(1600, 0.4, 24, 6, 12, 1),
    "snow-near": () => dotsTile(70, 2.2, 4, "rgba(255, 255, 255, 0.9)", 31),
    "snow-near-2": () => dotsTile(110, 1.2, 2.4, "rgba(255, 255, 255, 0.6)", 32),
    "snow-mid": () => dotsTile(320, 1.2, 2.2, "rgba(255, 255, 255, 0.8)", 33),
    "snow-far": () => dotsTile(900, 0.8, 1.4, "rgba(255, 255, 255, 0.7)", 34),
    "ember-near": () => dotsTile(26, 1.6, 3.2, "rgba(255, 150, 60, 0.9)", 41),
    "ember-near-2": () => dotsTile(40, 1, 2, "rgba(255, 110, 40, 0.6)", 42),
    "ember-mid": () => dotsTile(110, 1.1, 2, "rgba(255, 140, 55, 0.85)", 43),
    "ember-far": () => dotsTile(320, 0.8, 1.3, "rgba(255, 130, 50, 0.8)", 44),
    "fog-1": () => blobTile(9, "220, 224, 230", 0.55, 51),
    "fog-2": () => blobTile(7, "205, 210, 218", 0.4, 52),
    "clouds": () => blobTile(6, "0, 0, 0", 0.55, 61),
  };

  const tiles = {};
  function getTile(key) {
    if (!tiles[key] && TILE_FACTORIES[key]) tiles[key] = TILE_FACTORIES[key]();
    return tiles[key] || null;
  }

  /* ----------------------- layers ----------------------- */

  // LOD thresholds, in screen pixels per board cell: >= NEAR uses "near",
  // >= MID uses "mid", below that "far". Near a threshold both LODs are
  // cross-faded so switching doesn't pop.
  const LOD_NEAR_PX = 60;
  const LOD_MID_PX = 22;
  const LOD_BLEND = 1.35;

  /**
   * Layers of an effect. Each layer has one or three LODs; each LOD is a
   * texture key, its world size (cells) and velocity (cells/s). Far LODs
   * cover more cells and move faster in world units, so on screen they keep
   * the feel of the near ones.
   */
  function layersFor(type) {
    const slow = reducedMotion ? 0.4 : 1;
    const lods = (prefix, near, mid, far) => [
      { tile: `${prefix}-near`, ...near },
      { tile: `${prefix}-mid`, ...mid },
      { tile: `${prefix}-far`, ...far },
    ];
    switch (type) {
      case "lluvia":
        return [
          {
            alpha: 1,
            lods: lods(
              "rain",
              { size: 4, vx: 1.2 * slow, vz: 7 * slow },
              { size: 12, vx: 3 * slow, vz: 18 * slow },
              { size: 36, vx: 8 * slow, vz: 48 * slow },
            ),
          },
          { alpha: 0.8, near: true, lods: [{ tile: "rain-near-2", size: 2.6, vx: 0.8 * slow, vz: 5 * slow }] },
        ];
      case "tormenta":
        return [
          {
            alpha: 1,
            lods: lods(
              "storm",
              { size: 4, vx: 2.6 * slow, vz: 10 * slow },
              { size: 12, vx: 6.5 * slow, vz: 25 * slow },
              { size: 36, vx: 17 * slow, vz: 66 * slow },
            ),
          },
          { alpha: 0.85, near: true, lods: [{ tile: "storm-near-2", size: 2.8, vx: 1.8 * slow, vz: 7.5 * slow }] },
        ];
      case "nieve":
        return [
          {
            alpha: 1,
            lods: lods(
              "snow",
              { size: 6, vx: 0.15, vz: 0.6 * slow, sway: 0.35 },
              { size: 16, vx: 0.4, vz: 1.6 * slow, sway: 0.9 },
              { size: 48, vx: 1.2, vz: 4.8 * slow, sway: 2.6 },
            ),
          },
          { alpha: 0.9, near: true, lods: [{ tile: "snow-near-2", size: 4, vx: 0.1, vz: 0.4 * slow, sway: 0.25 }] },
        ];
      case "brasas":
        return [
          {
            alpha: 1,
            lods: lods(
              "ember",
              { size: 6, vx: 0.05, vz: -0.5 * slow, sway: 0.3 },
              { size: 16, vx: 0.15, vz: -1.3 * slow, sway: 0.8 },
              { size: 48, vx: 0.4, vz: -4 * slow, sway: 2.4 },
            ),
          },
          {
            alpha: 0.9,
            additive: true,
            near: true,
            lods: [{ tile: "ember-near-2", size: 4.5, vx: 0.08, vz: -0.35 * slow, sway: 0.2 }],
          },
        ];
      case "niebla":
        return [
          { alpha: 1, lods: [{ tile: "fog-1", size: 16, vx: 0.18 * slow, vz: 0.03 }] },
          { alpha: 1, lods: [{ tile: "fog-2", size: 11, vx: -0.12 * slow, vz: 0.05 }] },
        ];
      case "nubes":
        return [{ alpha: 1, lods: [{ tile: "clouds", size: 24, vx: 0.35 * slow, vz: 0.1 }] }];
      default:
        return [];
    }
  }

  /**
   * Weights of each LOD (near, mid, far) for a zoom level, with a short
   * log-scale cross-fade around each threshold.
   */
  function lodWeights(pxPerUnit) {
    const fade = (threshold) => {
      const lo = threshold / LOD_BLEND;
      const hi = threshold * LOD_BLEND;
      if (pxPerUnit <= lo) return 0;
      if (pxPerUnit >= hi) return 1;
      return Math.log(pxPerUnit / lo) / Math.log(hi / lo);
    };
    const aboveNear = fade(LOD_NEAR_PX);
    const aboveMid = fade(LOD_MID_PX);
    return [aboveNear, aboveMid * (1 - aboveNear), 1 - aboveMid];
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

    const view = computeView();
    ctx.save();
    ctx.setTransform(...view.t);

    // Only cover the map, not the infinite board around it.
    let corners = null;
    try {
      corners = s.clip?.() || null;
    } catch (_error) {}
    if (corners && corners.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].z);
      for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i].x, corners[i].z);
      ctx.closePath();
      ctx.clip();
    }

    const fillView = () =>
      ctx.fillRect(view.minX, view.minZ, view.maxX - view.minX, view.maxZ - view.minZ);

    // Tints.
    if (s.type === "tormenta") {
      ctx.fillStyle = `rgba(8, 12, 28, ${0.12 + 0.18 * s.intensity})`;
      fillView();
    }
    if (s.type === "niebla") {
      ctx.fillStyle = `rgba(210, 214, 220, ${0.05 + 0.12 * s.intensity})`;
      fillView();
    }

    // Texture layers, in world space through the camera.
    const weights = lodWeights(view.pxPerUnit);
    s.layers.forEach((layer) => {
      layer.lods.forEach((lod, i) => {
        // Single-LOD layers always draw; "near" extras only when close.
        let weight = layer.lods.length > 1 ? weights[i] : 1;
        if (layer.near) weight = weights[0];
        if (weight <= 0.01) return;

        const texture = getTile(lod.tile);
        if (!texture) return;
        if (!lod.pattern) lod.pattern = ctx.createPattern(texture, "repeat");
        const sway = lod.sway ? Math.sin(s.time * 0.9) * lod.sway : 0;
        const ox = (lod.vx * s.time + sway) % lod.size;
        const oz = (lod.vz * s.time) % lod.size;
        const scale = lod.size / TILE;
        lod.pattern.setTransform(new DOMMatrix().translateSelf(ox, oz).scaleSelf(scale, scale));
        ctx.globalAlpha = weight * layer.alpha * (0.35 + 0.65 * s.intensity);
        ctx.globalCompositeOperation = layer.additive ? "lighter" : "source-over";
        ctx.fillStyle = lod.pattern;
        fillView();
      });
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Storm flashes (soft, never full white), also limited to the map.
    if (s.type === "tormenta" && !reducedMotion) {
      s.nextFlash -= dt;
      if (s.nextFlash <= 0) {
        s.flash = 1;
        s.nextFlash = (6 + Math.random() * 8) / (0.6 + s.intensity);
      }
      if (s.flash > 0) {
        const a = 0.28 * s.flash * (s.flash > 0.5 ? 1 : 0.6);
        ctx.fillStyle = `rgba(225, 232, 255, ${a})`;
        fillView();
        s.flash = Math.max(0, s.flash - dt * 3.2);
      }
    }
    ctx.restore();

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
      if (options.clip) state.clip = options.clip;
      return; // already running
    }

    state = {
      canvas,
      ctx: canvas.getContext("2d"),
      type,
      intensity: level,
      project: options.project || state?.project || null,
      clip: options.clip || state?.clip || null,
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
