(() => {
  /* =======================================================================
       Shared effects renderer

       Short spell/area effects (breath, beam, missile, explosion...) drawn
       with particles on one 2D canvas over the board. Every effect lives in
       world units (1 unit = 1 cell) on the board plane, which is mapped to
       the screen with a homography rebuilt each frame from the camera, so
       effects pan, rotate, zoom and keep the perspective of a tilted (3D)
       camera: each particle is placed and squashed where it lands.

       The TYPE gives the shape/motion and the PALETTE the colors: each
       palette is a gradient (fire goes white-yellow -> orange -> red) and
       particles walk it as they age.

       Particles are pre-rendered radial sprites (one per color) and the
       loop only runs while something is on screen.

       Exposed as `window._n21_.effects`:
         effects.TYPES, effects.PALETTES
         effects.mount(getContainer, project)
           getContainer() -> element the overlay canvas goes into
           project(x, z) -> {x, y} board point in canvas CSS pixels
         effects.play({ type, palette, from: {x, z}, to: {x, z} })
         effects.setPreview({ type, palette, from, to } | null)
           palette: a PALETTES key or a custom { colors: ["#rrggbb"...], glow }
    ======================================================================= */

  // aim: drag from the origin to the target; otherwise a single click.
  const TYPES = [
    { key: "aliento", label: "Aliento", aim: true },
    { key: "haz", label: "Haz", aim: true },
    { key: "cohete", label: "Cohete", aim: true },
    { key: "flecha", label: "Flecha", aim: true },
    { key: "bala", label: "Bala", aim: true },
    { key: "pocion", label: "Poción", aim: true },
    { key: "espadazo", label: "Espadazo", aim: false },
    { key: "punetazo", label: "Puñetazo", aim: false },
    { key: "lluvia-flechas", label: "Lluvia de flechas", aim: false },
    { key: "explosion", label: "Explosión", aim: false },
    { key: "nova", label: "Nova", aim: false },
    { key: "quemar", label: "Quemar", aim: false },
    { key: "brillo", label: "Brillo", aim: false },
    { key: "burbujeo", label: "Burbujeo", aim: false },
    { key: "salpicadura", label: "Salpicadura", aim: false },
  ];

  // colors: young -> old. glow: additive blending (light), else painted.
  // random: each particle keeps one random color instead of aging.
  const PALETTES = [
    { key: "fuego", label: "Fuego", glow: true, colors: ["#fff6c2", "#ffd23f", "#ff9a1f", "#ff5a0a", "#c81d00", "#5a0e00"] },
    { key: "encanto", label: "Encanto", glow: true, colors: ["#ffe0f7", "#ff8ae0", "#e84ac2", "#b02a9c", "#5e1457"] },
    { key: "acido", label: "Ácido", glow: true, colors: ["#f2ffc4", "#b8ff3b", "#5ee82a", "#22a82c", "#0e5418"] },
    { key: "muerte", label: "Muerte", glow: false, colors: ["#3a2a40", "#231a28", "#141016", "#060507", "#000000"] },
    { key: "sagrada", label: "Sagrada", glow: true, colors: ["#ffffff", "#fff6c9", "#ffe58a", "#f2c444", "#a8801c"] },
    { key: "sangre", label: "Sangre", glow: false, colors: ["#d11a1a", "#a80f0f", "#850707", "#5c0000", "#3a0000"] },
    { key: "escarcha", label: "Escarcha", glow: true, colors: ["#ffffff", "#e0f6ff", "#a6e1ff", "#5fb6f0", "#2a6fb8"] },
    { key: "limo", label: "Limo", glow: false, colors: ["#d8ff6a", "#9ae63a", "#5fb82a", "#3a8a1a", "#22560f"] },
    { key: "humo", label: "Humo", glow: false, colors: ["#e6e6e6", "#bdbdbd", "#959595", "#6e6e6e", "#4a4a4a"] },
    { key: "agua", label: "Agua", glow: false, colors: ["#e8f7ff", "#8fd0ff", "#3d97ef", "#1a5fc8", "#0b3480"] },
    {
      key: "magia",
      label: "Magia",
      glow: true,
      random: true,
      colors: ["#ff4d4d", "#ffb43b", "#fff23b", "#4dff7a", "#3bd2ff", "#7d5bff", "#ff4de0"],
    },
  ];

  const CANVAS_ID = "n21-effects-overlay";
  const SPRITE_PX = 64;
  const MAX_DT = 0.05;

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const typeByKey = new Map(TYPES.map((t) => [t.key, t]));
  const paletteByKey = new Map(PALETTES.map((p) => [p.key, p]));
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  /** A palette key, or a custom palette object (validated). */
  function resolvePalette(palette) {
    if (typeof palette === "string") return paletteByKey.get(palette) || null;
    const colors = Array.isArray(palette?.colors) ? palette.colors : [];
    if (colors.length < 2 || colors.length > 8 || !colors.every((c) => HEX_COLOR.test(c))) return null;
    return { key: "personalizado", glow: !!palette.glow, colors: colors.map((c) => c.toLowerCase()) };
  }

  let getContainer = null;
  let project = null;
  let canvas = null;
  let ctx = null;
  // Offscreen layer for effects whose particles show at a set opacity as
  // a whole (overlaps don't get darker).
  let layer = null;
  let frame = null;
  let lastTime = 0;
  let preview = null;
  const active = [];

  /* ----------------------------- helpers ----------------------------- */

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  function circle(r, steps = 48) {
    const points = [];
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      points.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return points;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Soft round sprites, cached per color and style.
  const sprites = new Map();
  function sprite(color, style = "soft") {
    const key = `${style}|${color}`;
    let cached = sprites.get(key);
    if (cached) return cached;
    // Custom colors add sprites over time: keep the cache bounded.
    if (sprites.size > 400) sprites.clear();

    const c = document.createElement("canvas");
    c.width = SPRITE_PX;
    c.height = SPRITE_PX;
    const g = c.getContext("2d");
    const r = SPRITE_PX / 2;
    const [red, green, blue] = hexToRgb(color);
    const rgba = (a) => `rgba(${red}, ${green}, ${blue}, ${a})`;

    if (style === "ring") {
      g.strokeStyle = rgba(0.95);
      g.lineWidth = SPRITE_PX * 0.09;
      g.beginPath();
      g.arc(r, r, r * 0.8, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = rgba(0.25);
      g.fill();
      g.fillStyle = "rgba(255, 255, 255, 0.7)";
      g.beginPath();
      g.arc(r * 0.7, r * 0.7, r * 0.16, 0, Math.PI * 2);
      g.fill();
    } else {
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      if (style === "disc") {
        grad.addColorStop(0, rgba(1));
        grad.addColorStop(0.65, rgba(0.95));
        grad.addColorStop(1, rgba(0));
      } else {
        grad.addColorStop(0, rgba(1));
        grad.addColorStop(0.35, rgba(0.6));
        grad.addColorStop(1, rgba(0));
      }
      g.fillStyle = grad;
      g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
    }

    sprites.set(key, c);
    return c;
  }

  function colorFor(palette, age01, seed) {
    const colors = palette.colors;
    if (palette.random) return colors[seed % colors.length];
    return colors[Math.min(colors.length - 1, Math.floor(clamp(age01, 0, 0.999) * colors.length))];
  }

  /* ----------------------------- particles ----------------------------- */

  function addParticle(fx, p) {
    fx.particles.push({
      vx: 0,
      vz: 0,
      drag: 0,
      age: 0,
      size: 0.2,
      endSize: null,
      alpha: 1,
      style: "soft",
      offset: 0,
      seed: (Math.random() * 1000) | 0,
      ...p,
    });
  }

  function burst(fx, x, z, count, radius, life = 0.9) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(0.3, 1) * radius * 3;
      addParticle(fx, {
        x,
        z,
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        drag: 3.2,
        life: rand(life * 0.6, life),
        size: rand(0.25, 0.45) * Math.max(1, radius * 0.5),
        endSize: rand(0.5, 0.9) * Math.max(1, radius * 0.6),
      });
    }
  }

  /** Crescent between two angles of a circle, thickest in the middle. */
  function crescent(cx, cz, r, a0, a1, width, steps = 24) {
    const outer = [];
    const inner = [];
    for (let i = 0; i <= steps; i += 1) {
      const s = i / steps;
      const a = a0 + (a1 - a0) * s;
      const w = width * Math.sin(Math.PI * s);
      outer.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
      inner.push([cx + Math.cos(a) * (r - w), cz + Math.sin(a) * (r - w)]);
    }
    return outer.concat(inner.reverse());
  }

  /** Same angle for the same board point on every client. */
  function angleFromPoint(point) {
    const n = Math.sin(point.x * 12.9898 + point.z * 78.233) * 43758.5453;
    return (n - Math.floor(n)) * Math.PI * 2;
  }

  /**
   * Arrow with its tip at (x, z) pointing along `angle`, drawn in its own
   * frame (tip at 0, the arrow along -x, 1 = a cell). `sunk` hides that
   * much of the front (stuck in the ground or a target).
   */
  function drawArrow(g, x, z, angle, alpha, tint, sunk = 0) {
    const c = g.ctx;
    if (!g.frame(x, z, angle)) return;
    c.globalCompositeOperation = "source-over";
    c.lineJoin = "round";
    const tail = -1.0;
    const edge = "rgba(15, 10, 5, 0.5)";

    // Soft shadow on the board under a stuck arrow.
    if (sunk > 0) {
      c.globalAlpha = alpha * 0.25;
      c.fillStyle = "#000000";
      c.beginPath();
      c.moveTo(-sunk, 0.03);
      c.lineTo(tail + 0.04, 0.07);
      c.lineTo(tail + 0.04, 0.1);
      c.lineTo(-sunk, 0.045);
      c.fill();
    }
    c.globalAlpha = alpha;

    // Fletching: two curved feather vanes with a dark quill line.
    for (const side of [1, -1]) {
      c.beginPath();
      c.moveTo(-0.66, side * 0.012);
      c.quadraticCurveTo(-0.76, side * 0.075, -0.92, side * 0.07);
      c.lineTo(-0.95, side * 0.012);
      c.closePath();
      c.fillStyle = tint;
      c.fill();
      c.fillStyle = "rgba(255, 255, 255, 0.25)";
      c.beginPath();
      c.moveTo(-0.7, side * 0.02);
      c.quadraticCurveTo(-0.78, side * 0.05, -0.9, side * 0.05);
      c.lineTo(-0.9, side * 0.03);
      c.closePath();
      c.fill();
      c.strokeStyle = edge;
      c.lineWidth = 0.006;
      c.beginPath();
      c.moveTo(-0.66, side * 0.012);
      c.quadraticCurveTo(-0.76, side * 0.075, -0.92, side * 0.07);
      c.lineTo(-0.95, side * 0.012);
      c.stroke();
    }

    // Wooden shaft, lit on one side.
    const shaft = c.createLinearGradient(0, -0.014, 0, 0.014);
    shaft.addColorStop(0, "#7a5734");
    shaft.addColorStop(0.45, "#d8b47e");
    shaft.addColorStop(1, "#6a4a2b");
    c.fillStyle = shaft;
    c.fillRect(tail, -0.013, tail * -1 - Math.max(0.17, sunk), 0.026);
    c.strokeStyle = edge;
    c.lineWidth = 0.005;
    c.strokeRect(tail, -0.013, tail * -1 - Math.max(0.17, sunk), 0.026);
    // Nock.
    c.fillStyle = "#2e2a26";
    c.fillRect(tail - 0.03, -0.017, 0.035, 0.034);

    if (sunk === 0) {
      // Ferrule and a steel leaf-shaped head.
      c.fillStyle = "#3a3632";
      c.fillRect(-0.2, -0.018, 0.04, 0.036);
      const steel = c.createLinearGradient(0, -0.05, 0, 0.05);
      steel.addColorStop(0, "#f4f6f8");
      steel.addColorStop(0.5, "#aab1b8");
      steel.addColorStop(1, "#6f777f");
      c.fillStyle = steel;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-0.07, 0.05, -0.16, 0.022);
      c.lineTo(-0.17, 0);
      c.lineTo(-0.16, -0.022);
      c.quadraticCurveTo(-0.07, -0.05, 0, 0);
      c.fill();
      c.strokeStyle = "rgba(20, 20, 25, 0.6)";
      c.lineWidth = 0.006;
      c.stroke();
    }
  }

  const GLASS = "#e8f4fa";

  /**
   * Potion flask in its own frame (1 = a cell), upright on screen while the
   * rest of the board may rotate: `spin` turns it in flight. `colors` is
   * the palette: the liquid goes from its light to its dark tones.
   */
  function drawFlask(c, m, spin, colors, scale) {
    const dpr = window.devicePixelRatio || 1;
    const cell = Math.hypot(m[2], m[3]) / dpr;
    const k = cell * scale * dpr;
    const cos = Math.cos(spin) * k;
    const sin = Math.sin(spin) * k;
    c.setTransform(cos, sin, -sin, cos, m[4], m[5]);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.lineJoin = "round";

    const R = 0.15; // body radius
    const cy = 0.05; // body centre
    const light = colors[Math.min(1, colors.length - 1)];
    const dark = colors[Math.min(3, colors.length - 1)];
    const outline = "rgba(10, 18, 22, 0.55)";
    const thin = 0.012;

    // Neck, lip and cork (behind the body's top edge).
    c.fillStyle = "rgba(215, 236, 245, 0.55)";
    c.strokeStyle = outline;
    c.lineWidth = thin;
    c.beginPath();
    c.rect(-0.035, -0.19, 0.07, 0.11);
    c.fill();
    c.stroke();
    c.beginPath();
    c.rect(-0.047, -0.205, 0.094, 0.022);
    c.fill();
    c.stroke();
    const cork = c.createLinearGradient(-0.035, 0, 0.035, 0);
    cork.addColorStop(0, "#c08a55");
    cork.addColorStop(1, "#6b4223");
    c.fillStyle = cork;
    c.beginPath();
    c.rect(-0.03, -0.255, 0.06, 0.055);
    c.fill();
    c.stroke();

    // Liquid: lower part of the body, light at the surface, dark below.
    c.save();
    c.beginPath();
    c.arc(0, cy, R - thin, 0, Math.PI * 2);
    c.clip();
    const level = cy - R * 0.25;
    const liquid = c.createLinearGradient(0, level, 0, cy + R);
    liquid.addColorStop(0, light);
    liquid.addColorStop(1, dark);
    c.globalAlpha = 0.92;
    c.fillStyle = liquid;
    c.fillRect(-R, level, R * 2, R * 2);
    // Meniscus.
    c.globalAlpha = 0.6;
    c.fillStyle = "#ffffff";
    c.fillRect(-R, level, R * 2, 0.012);
    c.restore();

    // Glass over it: faint tint and a soft shine.
    const glass = c.createRadialGradient(-0.05, cy - 0.06, 0.01, 0, cy, R);
    glass.addColorStop(0, "rgba(255, 255, 255, 0.45)");
    glass.addColorStop(0.5, "rgba(220, 240, 250, 0.12)");
    glass.addColorStop(1, "rgba(180, 215, 230, 0.3)");
    c.globalAlpha = 1;
    c.fillStyle = glass;
    c.beginPath();
    c.arc(0, cy, R, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = outline;
    c.lineWidth = thin;
    c.stroke();
    // Curved reflection on the left and a small highlight.
    c.strokeStyle = "rgba(255, 255, 255, 0.7)";
    c.lineWidth = 0.018;
    c.lineCap = "round";
    c.beginPath();
    c.arc(0, cy, R * 0.72, Math.PI * 1.05, Math.PI * 1.45);
    c.stroke();
    c.fillStyle = "rgba(255, 255, 255, 0.85)";
    c.beginPath();
    c.arc(0.06, cy + 0.07, 0.016, 0, Math.PI * 2);
    c.fill();
  }

  const DUST = "#b9a88a";

  function dust(fx, x, z, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(0.6, 2);
      addParticle(fx, {
        x,
        z,
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        drag: 6,
        life: rand(0.3, 0.55),
        size: 0.06,
        endSize: 0.16,
        color: DUST,
        style: "soft",
      });
    }
  }

  /* ----------------------------- effect types ----------------------------- */

  // Each type: setup(fx) once, update(fx, t, dt) per frame, draw(fx, t) for
  // the non-particle parts (lines, rings, glows). Coordinates are relative to
  // fx.from; fx.dx/fx.dz is the vector to the target.
  const BEHAVIOR = {
    aliento: {
      setup(fx) {
        fx.length = clamp(fx.dist, 1.5, 40);
        fx.duration = 1.0 + fx.length / 20 + 0.9;
        fx.emitFor = 1.0 + fx.length / 20;
      },
      update(fx, t, dt) {
        if (t > fx.emitFor) return;
        const halfAngle = 0.46; // ~53º cone
        const count = Math.round((140 + fx.length * 8) * dt);
        for (let i = 0; i < count; i += 1) {
          const angle = fx.angle + (Math.random() + Math.random() - 1) * halfAngle;
          const life = rand(0.55, 0.85);
          const speed = (fx.length / life) * rand(0.75, 1.05);
          addParticle(fx, {
            x: rand(-0.1, 0.1),
            z: rand(-0.1, 0.1),
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            drag: 0.6,
            life,
            size: 0.18,
            endSize: 0.35 + fx.length * 0.09,
          });
        }
      },
    },

    haz: {
      setup(fx) {
        fx.length = Math.max(fx.dist, 0.5);
        fx.duration = 1.7;
      },
      update(fx, t, dt) {
        if (t > 1.2) return;
        const count = Math.round((60 + fx.length * 10) * dt);
        const nx = -Math.sin(fx.angle);
        const nz = Math.cos(fx.angle);
        for (let i = 0; i < count; i += 1) {
          const along = Math.random();
          const side = rand(-0.6, 0.6);
          addParticle(fx, {
            x: fx.dx * along,
            z: fx.dz * along,
            vx: nx * side + Math.cos(fx.angle) * 1.5,
            vz: nz * side + Math.sin(fx.angle) * 1.5,
            drag: 1.5,
            life: rand(0.3, 0.6),
            size: rand(0.15, 0.3),
            endSize: 0.05,
          });
        }
      },
      draw(fx, t, g) {
        const c = g.ctx;
        const env = t < 0.12 ? t / 0.12 : clamp(1 - (t - 1.1) / 0.5, 0, 1);
        if (env <= 0) return;
        const flicker = 0.85 + Math.sin(t * 60) * 0.08 + Math.random() * 0.07;
        const colors = fx.palette.colors;
        // Unit vectors along and across the beam.
        const ux = fx.dx / fx.length;
        const uz = fx.dz / fx.length;
        const layers = [
          [colors[Math.min(3, colors.length - 1)], 0.7, 0.35],
          [colors[Math.min(1, colors.length - 1)], 0.38, 0.8],
          [colors[0], 0.16, 1],
        ];
        for (const [color, width, alpha] of layers) {
          const w = (width * flicker) / 2;
          c.globalAlpha = env * alpha * flicker;
          c.fillStyle = color;
          // Rectangle with rounded-ish ends (a short cap past each end).
          g.path([
            [-ux * w - uz * w, -uz * w + ux * w],
            [fx.dx + ux * w - uz * w, fx.dz + uz * w + ux * w],
            [fx.dx + ux * w + uz * w, fx.dz + uz * w - ux * w],
            [-ux * w + uz * w, -uz * w - ux * w],
          ]);
          c.fill();
        }
        // Glow at both ends.
        c.globalAlpha = env * 0.9;
        const glow = sprite(colors[1 % colors.length]);
        g.sprite(glow, 0, 0, 0.6);
        g.sprite(glow, fx.dx, fx.dz, 0.9);
      },
    },

    cohete: {
      setup(fx) {
        fx.travel = clamp(fx.dist / 16, 0.3, 2);
        fx.duration = fx.travel + 1.3;
      },
      update(fx, t, dt) {
        if (t <= fx.travel) {
          const k = t / fx.travel;
          const x = fx.dx * k;
          const z = fx.dz * k;
          const count = Math.max(1, Math.round(160 * dt));
          for (let i = 0; i < count; i += 1) {
            addParticle(fx, {
              x: x + rand(-0.08, 0.08),
              z: z + rand(-0.08, 0.08),
              vx: rand(-0.4, 0.4) - Math.cos(fx.angle) * 0.8,
              vz: rand(-0.4, 0.4) - Math.sin(fx.angle) * 0.8,
              drag: 1,
              life: rand(0.3, 0.6),
              size: 0.25,
              endSize: 0.12,
            });
          }
        } else if (!fx.exploded) {
          fx.exploded = true;
          fx.flashAt = t;
          burst(fx, fx.dx, fx.dz, 90, 1.5, 0.8);
        }
      },
      draw(fx, t, g) {
        const colors = fx.palette.colors;
        if (t <= fx.travel) {
          const k = t / fx.travel;
          g.ctx.globalAlpha = 1;
          g.sprite(sprite(colors[0]), fx.dx * k, fx.dz * k, 0.35);
        } else if (fx.flashAt !== undefined) {
          const f = (t - fx.flashAt) / 0.35;
          if (f < 1) {
            g.ctx.globalAlpha = 1 - f;
            g.sprite(sprite(colors[1 % colors.length]), fx.dx, fx.dz, 1 + f * 1.8);
          }
        }
      },
    },

    // Melee: a click on the target; the angle comes from the point so every
    // client sees the same cut. The palette only tints them.
    espadazo: {
      setup(fx) {
        fx.angle = angleFromPoint(fx.from);
        fx.duration = 1;
        fx.sweep = 0.2;
        fx.span = 1.35; // radians each side of the attack direction
        fx.radius = 1.4;
        // Arc centre a bit before the target, so the cut passes through it.
        fx.cx = fx.dx - Math.cos(fx.angle) * 0.8;
        fx.cz = fx.dz - Math.sin(fx.angle) * 0.8;
      },
      update(fx, t, dt) {
        if (t > fx.sweep) return;
        const head = fx.angle - fx.span + (t / fx.sweep) * fx.span * 2;
        const count = Math.round(140 * dt);
        for (let i = 0; i < count; i += 1) {
          const speed = rand(1.5, 4);
          const out = head + rand(-0.4, 0.4);
          addParticle(fx, {
            x: fx.cx + Math.cos(head) * fx.radius,
            z: fx.cz + Math.sin(head) * fx.radius,
            vx: Math.cos(out) * speed,
            vz: Math.sin(out) * speed,
            drag: 5,
            life: rand(0.2, 0.4),
            size: 0.07,
            endSize: 0.02,
            colorAge: 0,
          });
        }
      },
      draw(fx, t, g) {
        const c = g.ctx;
        const start = fx.angle - fx.span;
        const end = fx.angle + fx.span;
        const head = Math.min(end, start + (t / fx.sweep) * fx.span * 2);
        // After the sweep the trail catches up with the head and fades.
        const tailLag = 2.2 - Math.max(0, t - fx.sweep) * 4;
        const tail = Math.max(start, head - Math.max(0, tailLag));
        if (head - tail < 0.02) return;
        const fade = t < fx.sweep ? 1 : clamp(1 - (t - fx.sweep) / 0.6, 0, 1);
        const tint = fx.palette.colors[Math.min(1, fx.palette.colors.length - 1)];
        c.globalAlpha = 0.6 * fade;
        c.fillStyle = tint;
        g.path(crescent(fx.cx, fx.cz, fx.radius + 0.12, tail, head, 0.75));
        c.fill();
        c.globalCompositeOperation = "source-over";
        c.globalAlpha = 0.95 * fade;
        c.fillStyle = "#ffffff";
        g.path(crescent(fx.cx, fx.cz, fx.radius, tail, head, 0.34));
        c.fill();
        if (fx.palette.glow) c.globalCompositeOperation = "lighter";
      },
    },

    punetazo: {
      setup(fx) {
        fx.angle = angleFromPoint(fx.from);
        fx.duration = 0.9;
        fx.spikes = Array.from({ length: 9 }, (_, i) => ({
          angle: (i / 9) * Math.PI * 2 + rand(-0.15, 0.15),
          length: rand(0.55, 1),
        }));
        // Dust thrown forward, away from the attacker.
        for (let i = 0; i < 22; i += 1) {
          const angle = fx.angle + rand(-0.9, 0.9);
          const speed = rand(1, 4);
          addParticle(fx, {
            x: fx.dx,
            z: fx.dz,
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            drag: 6,
            life: rand(0.35, 0.7),
            size: rand(0.08, 0.16),
            endSize: rand(0.2, 0.3),
          });
        }
      },
      draw(fx, t, g) {
        const c = g.ctx;
        const colors = fx.palette.colors;
        // Flash.
        if (t < 0.15) {
          c.globalAlpha = 1 - t / 0.15;
          g.sprite(sprite(colors[0]), fx.dx, fx.dz, 0.7);
        }
        // Shockwave ring.
        const f = t / 0.35;
        if (f < 1) {
          const r = 0.2 + easeOut(f) * 1.1;
          const half = 0.07 * (1 - f) + 0.02;
          c.globalAlpha = (1 - f) * 0.9;
          c.fillStyle = colors[Math.min(1, colors.length - 1)];
          g.path(circle(r + half).map(([x, z]) => [fx.dx + x, fx.dz + z]));
          g.path(circle(Math.max(0, r - half)).reverse().map(([x, z]) => [fx.dx + x, fx.dz + z]), true);
          c.fill("evenodd");
        }
        // Comic impact spikes.
        const k = t / 0.3;
        if (k < 1) {
          const grow = easeOut(Math.min(1, k * 2));
          c.globalCompositeOperation = "source-over";
          c.globalAlpha = 1 - k * k;
          c.fillStyle = "#ffffff";
          for (const spike of fx.spikes) {
            const a = spike.angle;
            const inner = 0.3;
            const outer = inner + spike.length * grow;
            const w = 0.06;
            const px = -Math.sin(a) * w;
            const pz = Math.cos(a) * w;
            g.path([
              [fx.dx + Math.cos(a) * inner + px, fx.dz + Math.sin(a) * inner + pz],
              [fx.dx + Math.cos(a) * outer, fx.dz + Math.sin(a) * outer],
              [fx.dx + Math.cos(a) * inner - px, fx.dz + Math.sin(a) * inner - pz],
            ]);
            c.fill();
          }
          if (fx.palette.glow) c.globalCompositeOperation = "lighter";
        }
      },
    },

    flecha: {
      setup(fx) {
        fx.travel = clamp(fx.dist / 30, 0.12, 1);
        fx.duration = fx.travel + 1.3;
      },
      update(fx, t) {
        if (t > fx.travel && !fx.hit) {
          fx.hit = true;
          dust(fx, fx.dx, fx.dz, 10);
        }
      },
      draw(fx, t, g) {
        const tint = fx.palette.colors[Math.min(1, fx.palette.colors.length - 1)];
        const k = Math.min(1, t / fx.travel);
        const x = fx.dx * k;
        const z = fx.dz * k;
        if (k < 1) {
          // Faint streak behind the arrow.
          const back = Math.min(1.6, fx.dist * k);
          g.ctx.globalAlpha = 0.35;
          g.ctx.fillStyle = tint;
          const nx = -Math.sin(fx.angle) * 0.03;
          const nz = Math.cos(fx.angle) * 0.03;
          const bx = x - Math.cos(fx.angle) * back;
          const bz = z - Math.sin(fx.angle) * back;
          g.path([[x + nx, z + nz], [x - nx, z - nz], [bx, bz]]);
          g.ctx.fill();
          drawArrow(g, x, z, fx.angle, 1, tint);
        } else {
          const fade = clamp(1 - (t - fx.travel - 0.9) / 0.4, 0, 1);
          drawArrow(g, fx.dx, fx.dz, fx.angle, fade, tint, 0.18);
        }
      },
    },

    bala: {
      setup(fx) {
        fx.travel = clamp(fx.dist / 45, 0.08, 0.6);
        fx.duration = fx.travel + 0.8;
        // Muzzle: sparks thrown forward in a narrow cone.
        for (let i = 0; i < 14; i += 1) {
          const angle = fx.angle + rand(-0.35, 0.35);
          const speed = rand(2, 6);
          addParticle(fx, {
            x: Math.cos(fx.angle) * 0.25,
            z: Math.sin(fx.angle) * 0.25,
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            drag: 9,
            life: rand(0.15, 0.3),
            size: rand(0.1, 0.18),
            endSize: 0.03,
          });
        }
      },
      update(fx, t) {
        if (t <= fx.travel || fx.hit) return;
        fx.hit = true;
        fx.hitAt = t;
        burst(fx, fx.dx, fx.dz, 26, 0.5, 0.45);
        for (let i = 0; i < 10; i += 1) {
          // Sparks bounce back towards the shooter.
          const angle = fx.angle + Math.PI + rand(-1.1, 1.1);
          const speed = rand(2, 5);
          addParticle(fx, {
            x: fx.dx,
            z: fx.dz,
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            drag: 7,
            life: rand(0.2, 0.4),
            size: 0.05,
            endSize: 0.02,
            colorAge: 0,
          });
        }
      },
      draw(fx, t, g) {
        const c = g.ctx;
        const colors = fx.palette.colors;
        const ux = Math.cos(fx.angle);
        const uz = Math.sin(fx.angle);
        // Muzzle flash.
        if (t < 0.12) {
          const f = t / 0.12;
          c.globalAlpha = 1 - f;
          g.sprite(sprite(colors[0]), ux * 0.3, uz * 0.3, 0.35 + f * 0.25);
          g.sprite(sprite(colors[Math.min(2, colors.length - 1)]), ux * 0.5, uz * 0.5, 0.25);
        }
        // Tracer: a short bright streak that runs to the target.
        if (t <= fx.travel) {
          const k = t / fx.travel;
          const hx = fx.dx * k;
          const hz = fx.dz * k;
          const tail = Math.min(1.4, fx.dist * k);
          const bx = hx - ux * tail;
          const bz = hz - uz * tail;
          for (const [color, w, alpha] of [
            [colors[Math.min(1, colors.length - 1)], 0.09, 0.55],
            ["#ffffff", 0.035, 1],
          ]) {
            c.globalAlpha = alpha;
            c.fillStyle = color;
            g.path([[hx + uz * w, hz - ux * w], [hx + ux * w, hz + uz * w], [hx - uz * w, hz + ux * w], [bx, bz]]);
            c.fill();
          }
        }
        // Impact flash.
        if (fx.hitAt !== undefined) {
          const f = (t - fx.hitAt) / 0.2;
          if (f < 1) {
            c.globalAlpha = 1 - f;
            g.sprite(sprite(colors[0]), fx.dx, fx.dz, 0.35 + f * 0.5);
          }
        }
      },
    },

    pocion: {
      setup(fx) {
        fx.travel = clamp(fx.dist / 10, 0.5, 1.4);
        fx.peak = clamp(fx.dist * 0.3, 0.8, 3.5); // cells above the board
        fx.duration = fx.travel + 2.6;
        // Liquid is painted with its color, never added up into white, and
        // the splash is see-through.
        fx.paint = true;
        fx.layerAlpha = 0.5;
      },
      update(fx, t) {
        if (t <= fx.travel || fx.broken) return;
        fx.broken = true;
        const colors = fx.palette.colors;
        // Liquid splashes out, then stays as a puddle that fades.
        for (let i = 0; i < 40; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = rand(0.5, 4.5);
          addParticle(fx, {
            x: fx.dx,
            z: fx.dz,
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            drag: 7,
            life: rand(2, 2.5),
            size: rand(0.1, 0.28) * (speed < 2 ? 1.8 : 1),
            style: "disc",
            colorAge: rand(0.3, 0.75),
            fadeOut: 0.4,
          });
        }
        // Glass shards.
        for (let i = 0; i < 12; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = rand(1.5, 4);
          addParticle(fx, {
            x: fx.dx,
            z: fx.dz,
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            drag: 6,
            life: rand(0.6, 1.1),
            size: 0.05,
            style: "disc",
            color: GLASS,
            fadeOut: 0.5,
          });
        }
        fx.flashColor = colors[0];
      },
      draw(fx, t, g) {
        const c = g.ctx;
        const colors = fx.palette.colors;
        if (t <= fx.travel) {
          const k = t / fx.travel;
          const x = fx.dx * k;
          const z = fx.dz * k;
          const height = 4 * fx.peak * k * (1 - k);
          // Shadow on the board, smaller and fainter the higher it flies.
          c.globalCompositeOperation = "source-over";
          c.globalAlpha = 0.45 - height * 0.07;
          g.sprite(sprite("#000000"), x, z, 0.28 - height * 0.03);
          const m = g.lifted(x, z, height);
          if (m) drawFlask(c, m, k * Math.PI * 3, colors, 1.15 + height * 0.12);
          return;
        }
        const f = (t - fx.travel) / 0.3;
        if (f < 1) {
          c.globalAlpha = 1 - f;
          g.sprite(sprite(fx.flashColor || colors[0]), fx.dx, fx.dz, 0.6 + f * 1.4);
        }
      },
    },

    "lluvia-flechas": {
      setup(fx) {
        fx.duration = 2.2;
        const base = angleFromPoint(fx.from);
        fx.arrows = Array.from({ length: 16 }, () => {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 1.9;
          return {
            x: Math.cos(a) * r,
            z: Math.sin(a) * r,
            angle: base + rand(-0.25, 0.25),
            delay: rand(0, 0.7),
            flight: 0.14,
            hit: false,
          };
        });
      },
      update(fx, t) {
        for (const arrow of fx.arrows) {
          if (!arrow.hit && t > arrow.delay + arrow.flight) {
            arrow.hit = true;
            dust(fx, arrow.x, arrow.z, 4);
          }
        }
      },
      draw(fx, t, g) {
        const tint = fx.palette.colors[Math.min(1, fx.palette.colors.length - 1)];
        const fade = clamp(1 - (t - 1.7) / 0.5, 0, 1);
        for (const arrow of fx.arrows) {
          const k = (t - arrow.delay) / arrow.flight;
          if (k < 0) continue;
          if (k < 1) {
            // Comes in from 2.5 cells away along its angle.
            const back = (1 - k) * 2.5;
            drawArrow(
              g,
              arrow.x - Math.cos(arrow.angle) * back,
              arrow.z - Math.sin(arrow.angle) * back,
              arrow.angle,
              0.6 + 0.4 * k,
              tint,
            );
          } else {
            drawArrow(g, arrow.x, arrow.z, arrow.angle, fade, tint, 0.18);
          }
        }
      },
    },

    explosion: {
      setup(fx) {
        fx.duration = 1.4;
        burst(fx, 0, 0, 150, 2.2, 1);
      },
      draw(fx, t, g) {
        const f = t / 0.4;
        if (f >= 1) return;
        g.ctx.globalAlpha = 1 - f;
        g.sprite(sprite(fx.palette.colors[0]), 0, 0, 1.2 + f * 2.6);
      },
    },

    nova: {
      setup(fx) {
        fx.duration = 1.4;
        fx.radius = 4;
      },
      update(fx, t, dt) {
        if (t > 0.9) return;
        const r = fx.radius * easeOut(t / 0.9);
        const count = Math.round(260 * dt);
        for (let i = 0; i < count; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          addParticle(fx, {
            x: Math.cos(angle) * r,
            z: Math.sin(angle) * r,
            vx: Math.cos(angle) * 1.2,
            vz: Math.sin(angle) * 1.2,
            drag: 2,
            life: rand(0.3, 0.6),
            size: 0.35,
            endSize: 0.1,
          });
        }
      },
      draw(fx, t, g) {
        const f = t / 0.9;
        if (f >= 1) return;
        const r = fx.radius * easeOut(f);
        const half = (0.45 * (1 - f) + 0.05) / 2;
        const colors = fx.palette.colors;
        const c = g.ctx;
        // Ring as an annulus so it follows the perspective.
        c.globalAlpha = (1 - f) * 0.9;
        c.fillStyle = colors[1 % colors.length];
        g.path(circle(r + half));
        g.path(circle(Math.max(0, r - half)).reverse(), true);
        c.fill("evenodd");
        c.globalAlpha = (1 - f) * 0.5;
        g.sprite(sprite(colors[0]), 0, 0, 1.2);
      },
    },

    quemar: {
      setup(fx) {
        fx.duration = 3.2;
      },
      update(fx, t, dt) {
        if (t > 2.6) return;
        const count = Math.round(70 * dt + Math.random());
        for (let i = 0; i < count; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 0.65;
          addParticle(fx, {
            x: Math.cos(angle) * r,
            z: Math.sin(angle) * r,
            // Flames lick upward on screen (towards -z in the top-down view).
            vx: rand(-0.25, 0.25),
            vz: rand(-1.1, -0.4),
            drag: 0.5,
            life: rand(0.45, 0.85),
            size: rand(0.3, 0.5),
            endSize: 0.08,
          });
        }
      },
      draw(fx, t, g) {
        const env = t < 0.3 ? t / 0.3 : clamp(1 - (t - 2.4) / 0.8, 0, 1);
        const flicker = 0.8 + Math.random() * 0.2;
        g.ctx.globalAlpha = env * 0.55 * flicker;
        const colors = fx.palette.colors;
        g.sprite(sprite(colors[2 % colors.length]), 0, 0, 1.1);
      },
    },

    brillo: {
      setup(fx) {
        fx.duration = 3.2;
      },
      update(fx, t, dt) {
        if (t > 2.6) return;
        const count = Math.round(16 * dt + Math.random() * 0.6);
        for (let i = 0; i < count; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const r = rand(0.2, 1.4);
          addParticle(fx, {
            x: Math.cos(angle) * r,
            z: Math.sin(angle) * r,
            vx: Math.cos(angle) * 0.15,
            vz: Math.sin(angle) * 0.15,
            life: rand(0.5, 1),
            size: 0.05,
            endSize: 0.22,
            twinkle: true,
          });
        }
      },
      draw(fx, t, g) {
        const env = t < 0.4 ? t / 0.4 : clamp(1 - (t - 2.4) / 0.8, 0, 1);
        const pulse = 1 + Math.sin(t * 5) * 0.12;
        const colors = fx.palette.colors;
        g.ctx.globalAlpha = env * 0.75;
        g.sprite(sprite(colors[1 % colors.length]), 0, 0, 1.6 * pulse);
        g.ctx.globalAlpha = env;
        g.sprite(sprite(colors[0]), 0, 0, 0.6 * pulse);
      },
    },

    burbujeo: {
      setup(fx) {
        fx.duration = 3.2;
      },
      update(fx, t, dt) {
        if (t <= 2.5) {
          const count = Math.round(14 * dt + Math.random() * 0.5);
          for (let i = 0; i < count; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * 1.3;
            addParticle(fx, {
              x: Math.cos(angle) * r,
              z: Math.sin(angle) * r,
              life: rand(0.5, 1),
              size: 0.04,
              endSize: rand(0.25, 0.45),
              style: "ring",
              fixedAlpha: true,
              popAtEnd: true,
              colorAge: rand(0, 0.5),
            });
          }
        }
        // Popped bubbles leave a few droplets.
        for (const p of fx.particles) {
          if (p.popAtEnd && p.age + dt >= p.life && !p.popped) {
            p.popped = true;
            for (let i = 0; i < 4; i += 1) {
              const angle = Math.random() * Math.PI * 2;
              addParticle(fx, {
                x: p.x,
                z: p.z,
                vx: Math.cos(angle) * 1.4,
                vz: Math.sin(angle) * 1.4,
                drag: 4,
                life: 0.3,
                size: 0.08,
                endSize: 0.02,
                style: "disc",
                colorAge: 0.4,
              });
            }
          }
        }
      },
    },

    salpicadura: {
      setup(fx) {
        fx.duration = 3.2;
        for (let i = 0; i < 46; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = rand(0.5, 6);
          addParticle(fx, {
            x: 0,
            z: 0,
            vx: Math.cos(angle) * speed,
            vz: Math.sin(angle) * speed,
            drag: 7,
            life: rand(2.2, 3),
            size: rand(0.12, 0.35) * (speed < 2 ? 1.8 : 1),
            style: "disc",
            colorAge: rand(0, 0.6),
            fadeIn: 0,
            fadeOut: 0.5,
          });
        }
      },
      draw(fx, t, g) {
        const f = t / 0.25;
        if (f >= 1) return;
        g.ctx.globalAlpha = 1 - f;
        g.sprite(sprite(fx.palette.colors[0], "disc"), 0, 0, 0.6 + f);
      },
    },
  };

  /* ----------------------------- canvas ----------------------------- */

  function ensureCanvas() {
    const container = getContainer?.();
    if (!container) return null;
    if (!canvas || !canvas.isConnected || canvas.parentElement !== container) {
      canvas?.remove();
      canvas = document.getElementById(CANVAS_ID) || document.createElement("canvas");
      canvas.id = CANVAS_ID;
      canvas.className = "n21-effects-overlay";
      canvas.setAttribute("aria-hidden", "true");
      // Right after the board canvas so the rest of the UI (panels, bars)
      // stays on top.
      const board = container.querySelector("#application-canvas");
      if (board && board.parentElement === container) board.after(canvas);
      else container.prepend(canvas);
      ctx = canvas.getContext("2d");
    }
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return ctx;
  }

  /* ----------------------- board -> screen mapping ----------------------- */

  // Solve the 3x3 homography (h8 = 1) taking 4 board points to 4 screen
  // points. The board is a plane, so this is exact for any camera, tilted
  // and in perspective too.
  function solveHomography(src, dst) {
    const m = [];
    for (let i = 0; i < 4; i += 1) {
      const [x, z] = src[i];
      const [u, v] = dst[i];
      m.push([x, z, 1, 0, 0, 0, -u * x, -u * z, u]);
      m.push([0, 0, 0, x, z, 1, -v * x, -v * z, v]);
    }
    for (let col = 0; col < 8; col += 1) {
      let pivot = col;
      for (let r = col + 1; r < 8; r += 1) {
        if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      }
      if (Math.abs(m[pivot][col]) < 1e-12) return null;
      [m[col], m[pivot]] = [m[pivot], m[col]];
      for (let r = 0; r < 8; r += 1) {
        if (r === col) continue;
        const k = m[r][col] / m[col][col];
        for (let c = col; c < 9; c += 1) m[r][c] -= k * m[col][c];
      }
    }
    return m.map((row, i) => row[8] / row[i]);
  }

  /** Mapping for this frame, built around a board point the camera sees. */
  function makeView(anchor) {
    const R = 4;
    const src = [
      [anchor.x - R, anchor.z - R],
      [anchor.x + R, anchor.z - R],
      [anchor.x + R, anchor.z + R],
      [anchor.x - R, anchor.z + R],
    ];
    const dst = [];
    for (const [x, z] of src) {
      const p = project?.(x, z);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      dst.push([p.x, p.y]);
    }
    const h = solveHomography(src, dst);
    if (!h || h.some((v) => !Number.isFinite(v))) return null;
    const dpr = window.devicePixelRatio || 1;

    return {
      toScreen(x, z) {
        const w = h[6] * x + h[7] * z + 1;
        return [((h[0] * x + h[1] * z + h[2]) / w) * dpr, ((h[3] * x + h[4] * z + h[5]) / w) * dpr];
      },
      // Local affine (canvas transform) of the board around (x, z).
      affineAt(x, z) {
        const w = h[6] * x + h[7] * z + 1;
        if (w <= 0) return null; // behind the camera
        const u = (h[0] * x + h[1] * z + h[2]) / w;
        const v = (h[3] * x + h[4] * z + h[5]) / w;
        return [
          ((h[0] - u * h[6]) / w) * dpr,
          ((h[3] - v * h[6]) / w) * dpr,
          ((h[1] - u * h[7]) / w) * dpr,
          ((h[4] - v * h[7]) / w) * dpr,
          u * dpr,
          v * dpr,
        ];
      },
    };
  }

  /** Drawing helpers for one effect: coordinates relative to its origin. */
  function painter(c, view, ox, oz) {
    return {
      ctx: c,
      sprite(img, x, z, r) {
        const m = view.affineAt(ox + x, oz + z);
        if (!m) return;
        c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        c.drawImage(img, -r, -r, r * 2, r * 2);
      },
      /**
       * Board point (x, z) seen `height` cells above the board: the local
       * affine there, raised on screen. Shapes drawn with it face the
       * board's axes, like everything else.
       */
      lifted(x, z, height) {
        const m = view.affineAt(ox + x, oz + z);
        if (!m) return null;
        const cell = Math.hypot(m[2], m[3]);
        return [m[0], m[1], m[2], m[3], m[4], m[5] - height * cell];
      },
      /** Local frame at (x, z) turned by `angle` (x axis = that direction). */
      frame(x, z, angle) {
        const m = view.affineAt(ox + x, oz + z);
        if (!m) return false;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        c.setTransform(
          m[0] * cos + m[2] * sin,
          m[1] * cos + m[3] * sin,
          -m[0] * sin + m[2] * cos,
          -m[1] * sin + m[3] * cos,
          m[4],
          m[5],
        );
        return true;
      },
      // Projected polygon; `keep` adds it to the current path (holes).
      path(points, keep = false) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        if (!keep) c.beginPath();
        points.forEach(([x, z], i) => {
          const [u, v] = view.toScreen(ox + x, oz + z);
          if (i === 0) c.moveTo(u, v);
          else c.lineTo(u, v);
        });
        c.closePath();
      },
    };
  }

  function drawParticles(g, fx) {
    const c = g.ctx;
    for (const p of fx.particles) {
      const k = p.age / p.life;
      if (k >= 1) continue;
      const size = p.endSize === null ? p.size : p.size + (p.endSize - p.size) * k;
      let alpha;
      if (p.fixedAlpha) alpha = 0.9;
      else if (p.fadeOut !== undefined) alpha = k < 1 - p.fadeOut ? 1 : (1 - k) / p.fadeOut;
      else alpha = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
      if (p.twinkle) alpha *= 0.5 + 0.5 * Math.sin(p.seed + p.age * 18);
      c.globalAlpha = clamp(alpha * p.alpha, 0, 1);
      const color = p.color || colorFor(fx.palette, p.colorAge ?? k, p.seed);
      g.sprite(sprite(color, p.style), p.x, p.z, size);
    }
  }

  function drawPreview(c, view) {
    const { type, palette, from, to } = preview;
    const g = painter(c, view, from.x, from.z);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    const color = palette.colors[Math.min(2, palette.colors.length - 1)];
    const dpr = window.devicePixelRatio || 1;
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 3 * dpr;
    c.setLineDash([10 * dpr, 7 * dpr]);
    if (type.key === "aliento" && dist > 0.01) {
      const angle = Math.atan2(dz, dx);
      const half = 0.46;
      const arc = [[0, 0]];
      for (let i = 0; i <= 24; i += 1) {
        const a = angle - half + (i / 24) * half * 2;
        arc.push([Math.cos(a) * dist, Math.sin(a) * dist]);
      }
      g.path(arc);
      c.globalAlpha = 0.15;
      c.fill();
      c.globalAlpha = 0.85;
      c.stroke();
    } else {
      c.globalAlpha = 0.85;
      g.path([[0, 0], [dx, dz]]);
      c.stroke();
    }
    c.setLineDash([]);
    c.globalAlpha = 0.9;
    for (const [x, z] of [[0, 0], [dx, dz]]) {
      g.path(circle(0.12, 16).map(([px, pz]) => [x + px, z + pz]));
      c.fill();
    }
  }

  function tick(now) {
    frame = null;
    const dt = Math.min(MAX_DT, (now - lastTime) / 1000 || 0);
    lastTime = now;

    const c = ensureCanvas();
    if (!c) {
      active.length = 0;
      return;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);

    const anchor = active[0]?.from || preview?.from;
    const view = anchor ? makeView(anchor) : null;

    for (let i = active.length - 1; i >= 0; i -= 1) {
      const fx = active[i];
      const t = (now - fx.start) / 1000;
      if (t >= fx.duration) {
        active.splice(i, 1);
        continue;
      }

      fx.behavior.update?.(fx, t, dt);
      for (const p of fx.particles) {
        p.age += dt;
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp;
        p.vz *= damp;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
      }
      fx.particles = fx.particles.filter((p) => p.age < p.life);

      if (!view) continue;
      const g = painter(c, view, fx.from.x, fx.from.z);
      c.globalCompositeOperation = fx.palette.glow && !fx.paint ? "lighter" : "source-over";
      fx.behavior.draw?.(fx, t, g);
      // Draws may switch blending (arrows are always painted): restore it.
      c.globalCompositeOperation = fx.palette.glow && !fx.paint ? "lighter" : "source-over";
      if (fx.layerAlpha === undefined) {
        drawParticles(g, fx);
        continue;
      }
      if (!layer) layer = document.createElement("canvas");
      if (layer.width !== canvas.width || layer.height !== canvas.height) {
        layer.width = canvas.width;
        layer.height = canvas.height;
      }
      const lc = layer.getContext("2d");
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, layer.width, layer.height);
      drawParticles(painter(lc, view, fx.from.x, fx.from.z), fx);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = fx.layerAlpha;
      c.drawImage(layer, 0, 0);
    }

    if (preview && view) drawPreview(c, view);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";

    if (active.length || preview) {
      frame = requestAnimationFrame(tick);
    } else {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function wake() {
    if (frame !== null) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }

  /* ----------------------------- API ----------------------------- */

  function mount(containerGetter, projectFn) {
    getContainer = containerGetter;
    project = projectFn;
  }

  function play({ type, palette, from, to }) {
    const typeDef = typeByKey.get(type);
    const paletteDef = resolvePalette(palette);
    if (!typeDef || !paletteDef || !from) return false;
    const target = typeDef.aim && to ? to : from;
    const dx = target.x - from.x;
    const dz = target.z - from.z;

    const fx = {
      type: typeDef,
      palette: paletteDef,
      behavior: BEHAVIOR[type],
      from,
      dx,
      dz,
      dist: Math.hypot(dx, dz),
      angle: Math.atan2(dz, dx),
      start: performance.now(),
      duration: 1.5,
      particles: [],
    };
    fx.behavior.setup(fx);
    if (reducedMotion) fx.duration = Math.min(fx.duration, 2);
    active.push(fx);
    wake();
    return true;
  }

  function setPreview(next) {
    if (!next) {
      preview = null;
      wake();
      return;
    }
    const type = typeByKey.get(next.type);
    const palette = resolvePalette(next.palette);
    if (!type || !palette || !next.from || !next.to) return;
    preview = { type, palette, from: next.from, to: next.to };
    wake();
  }

  window._n21_ = window._n21_ || {};
  window._n21_.effects = { TYPES, PALETTES, mount, play, setPreview };
})();
