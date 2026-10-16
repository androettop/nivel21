(async () => {
  try {
    /* =======================
       Feature: Token Aura
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      TokenManager,
      CanvasDropdownManager,
      EditTokenUIManager,
      PlayerManager,
      SettingsManager,
      MeasurementManager,
      FloatingPanelManager,
    ] = await loadManagers(
      "TokenManager",
      "CanvasDropdownManager",
      "EditTokenUIManager",
      "PlayerManager",
      "SettingsManager",
      "MeasurementManager",
      "FloatingPanelManager",
    );

    if (!SettingsManager.get("feature.token-aura.enabled")) {
      return;
    }

    // Define colors with single-letter keys (rgb + alpha)
    const AURA_COLORS = {
      w: { name: "Blanco", rgb: [1, 1, 1], alpha: 0.2 },
      b: { name: "Negro", rgb: [0, 0, 0], alpha: 0.4 },
      r: { name: "Rojo", rgb: [1, 0, 0], alpha: 0.2 },
      g: { name: "Verde", rgb: [0, 1, 0], alpha: 0.1 },
      a: { name: "Azul", rgb: [0, 0, 1], alpha: 0.2 },
      y: { name: "Amarillo", rgb: [1, 1, 0], alpha: 0.2 },
      o: { name: "Naranja", rgb: [1, 0.5, 0], alpha: 0.2 },
      p: { name: "Púrpura", rgb: [0.5, 0, 1], alpha: 0.2 },
    };

    // Tokens with an active aura, keyed by networkId.
    // Value holds the desired world size and the last token scale applied, so
    // the per-frame loop only re-scales the aura when the token scale changes.
    // This keeps the aura world-relative regardless of who resizes the token
    // (local, network, animation, etc.).
    const activeAuras = new Map(); // networkId -> { scale: {x,y,z}, lastScale: {x,y,z} }
    let auraSyncFrame = null;

    function toText(value) {
      if (value === undefined || value === null) return "";
      return String(value).trim();
    }

    function safeJsonParse(value) {
      if (typeof value !== "string" || !value.trim()) return null;
      try {
        return JSON.parse(value);
      } catch (error) {
        return null;
      }
    }

    // Shapes the aura can take. The tag keeps the legacy circle format
    // ([a:color-radius]) and appends a shape segment for the others:
    //   q<height>  -> rectangle (width = size)      e.g. [a:g-4-q2]
    //   c<angle>   -> cone (length = size)          e.g. [a:r-3-c53-d90]
    //   l<width>   -> line (length = size)          e.g. [a:a-6-l1-d180]
    // plus optional flags:
    //   d<deg>     -> direction for cones/lines (0 = up, clockwise)
    //   s          -> "solo aura": the token itself is hidden, only the area shows
    const AURA_SHAPES = {
      circle: { label: "Círculo", kind: "cone" },
      rect: { label: "Rectángulo", kind: "box" },
      cone: { label: "Cono", kind: "cone" },
      line: { label: "Línea", kind: "line" },
    };

    const DIRECTIONS = [
      { deg: 0, label: "Arriba" },
      { deg: 45, label: "Arriba a la derecha" },
      { deg: 90, label: "Derecha" },
      { deg: 135, label: "Abajo a la derecha" },
      { deg: 180, label: "Abajo" },
      { deg: 225, label: "Abajo a la izquierda" },
      { deg: 270, label: "Izquierda" },
      { deg: 315, label: "Arriba a la izquierda" },
    ];

    const DEFAULT_CONE_ANGLE = 53;
    const VISIBILITY_SOURCE = "token-aura-only";

    function toNumber(value, fallback) {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : fallback;
    }

    /**
     * Parse aura tag from description.
     * Returns { color, shape, size, height, angle, width, direction, auraOnly }
     * or null. Supports decimal sizes (e.g., b-1.5, r-2.25).
     */
    function parseAuraFromDescription(description) {
      const tag = window._n21_.utils.parseTokenTag(description, "a");
      if (!tag) return null;

      const parts = String(tag).split("-");
      if (parts.length < 2) return null;

      const color = parts[0];
      if (!/^[a-z]+$/.test(color)) return null;

      const size = parseFloat(parts[1]);
      if (!/^[\d.]+$/.test(parts[1]) || isNaN(size) || size < 0) return null;

      const aura = {
        color,
        shape: "circle",
        size,
        height: size,
        angle: DEFAULT_CONE_ANGLE,
        width: 1,
        direction: 0,
        auraOnly: false,
      };

      for (const segment of parts.slice(2)) {
        const key = segment.charAt(0);
        const value = segment.slice(1);
        if (key === "q") {
          aura.shape = "rect";
          aura.height = Math.max(toNumber(value, size), 0);
        } else if (key === "c") {
          aura.shape = "cone";
          aura.angle = Math.min(Math.max(toNumber(value, DEFAULT_CONE_ANGLE), 1), 360);
        } else if (key === "l") {
          aura.shape = "line";
          aura.width = Math.max(toNumber(value, 1), 0.1);
        } else if (key === "d") {
          aura.direction = ((toNumber(value, 0) % 360) + 360) % 360;
        } else if (segment === "s") {
          aura.auraOnly = true;
        }
      }

      return aura;
    }

    /**
     * Format aura config for tag storage (see AURA_SHAPES comment).
     */
    function formatAuraTag(aura) {
      const parts = [aura.color, aura.size];
      if (aura.shape === "rect") parts.push(`q${aura.height}`);
      if (aura.shape === "cone") parts.push(`c${aura.angle}`);
      if (aura.shape === "line") parts.push(`l${aura.width}`);
      if ((aura.shape === "cone" || aura.shape === "line") && aura.direction) {
        parts.push(`d${aura.direction}`);
      }
      if (aura.auraOnly) parts.push("s");
      return parts.join("-");
    }

    /**
     * Get aura configuration from token schema
     */
    function getAuraFromToken(networkId) {
      const schema = TokenManager.getTokenSchema(networkId);
      if (!schema) return null;

      const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
      const metadata = safeJsonParse(metadataString) || {};
      const description = toText(metadata.description);

      return parseAuraFromDescription(description);
    }

    function removeAuraShape(networkId) {
      const auraShape = TokenManager.getTokenChildByName(networkId, "TokenAura");
      if (auraShape) {
        TokenManager.removeChildFromToken(networkId, auraShape);
        if (typeof auraShape.destroy === "function") auraShape.destroy();
      }
      activeAuras.delete(networkId);
    }

    /**
     * Get or create the TokenAura shape on the token, re-creating it when the
     * native template needed for the shape kind changes.
     */
    function getOrCreateAuraShape(networkId, kind) {
      const existingAura = TokenManager.getTokenChildByName(networkId, "TokenAura");
      if (existingAura && MeasurementManager.getAuraShapeKind(existingAura) === kind) {
        return existingAura;
      }
      if (existingAura) removeAuraShape(networkId);

      const shape = MeasurementManager.createAuraShape(kind);
      if (!shape) return null;

      if (!TokenManager.addChildToToken(networkId, shape)) return null;

      return shape;
    }

    /**
     * "Solo aura": hide the token itself on every client with the extension
     * (the DM keeps seeing it translucent so it can still be moved/edited).
     */
    function syncAuraOnlyVisibility(networkId, aura) {
      const mode = aura?.auraOnly
        ? PlayerManager.isGameMaster()
          ? "translucent"
          : "hidden"
        : null;
      TokenManager.setLocalVisibilityOverride(networkId, VISIBILITY_SOURCE, mode);
      TokenManager.setSelectionBlocked(
        networkId,
        VISIBILITY_SOURCE,
        !!aura?.auraOnly && !PlayerManager.isGameMaster(),
      );
    }

    /**
     * Apply aura configuration to token. A null aura (or size 0) removes it.
     */
    function applyAuraToToken(networkId, aura) {
      const token = TokenManager.getToken(networkId);
      if (!token) return;

      if (!aura || !(aura.size > 0)) {
        removeAuraShape(networkId);
        return;
      }

      const shapeDef = AURA_SHAPES[aura.shape] || AURA_SHAPES.circle;
      const colorConfig = AURA_COLORS[aura.color];
      if (!colorConfig) return;

      const shape = getOrCreateAuraShape(networkId, shapeDef.kind);
      if (!shape) return;

      const [r, g, b] = colorConfig.rgb;
      const fillAlpha = colorConfig.alpha;
      const borderAlpha = Math.min(fillAlpha + 0.2, 1.0);

      const isRect = aura.shape === "rect";
      MeasurementManager.configureAuraMaterial(shape, {
        radius: aura.size,
        width: isRect ? aura.size : aura.width,
        height: aura.height,
        angle: aura.shape === "cone" ? aura.angle : 360,
        direction: aura.direction,
        borderColor: [r, g, b, borderAlpha],
        fillColor: [r, g, b, fillAlpha],
      });

      // The aura is a child of the token, so its world scale is multiplied by
      // the token's scale. Track it and let the per-frame loop keep it
      // counter-scaled so it stays relative to the world.
      const scale = isRect
        ? { x: aura.size, y: aura.height, z: aura.height }
        : { x: aura.size * 2, y: aura.size * 2, z: aura.size * 2 };
      activeAuras.set(networkId, { scale, lastScale: null });
      applyWorldScale(networkId, shape, scale);
      startAuraScaleSync();

      // Keep the name label next to the token instead of above the aura.
      TokenManager.excludeChildFromLabelBounds(networkId, shape);
    }

    /**
     * Counter-scale the aura shape against the token's current scale so the
     * aura keeps a constant world size. Returns false if the token/shape is
     * gone (so the caller can stop tracking it).
     */
    function applyWorldScale(networkId, shape, scale) {
      const tokenScale = TokenManager.getTokenScale(networkId);
      if (!tokenScale) return false;

      const entry = activeAuras.get(networkId);
      const last = entry && entry.lastScale;
      if (
        last &&
        last.x === tokenScale.x &&
        last.y === tokenScale.y &&
        last.z === tokenScale.z
      ) {
        return true; // No scale change, nothing to do this frame
      }

      MeasurementManager.setShapeScale(
        shape,
        scale.x / (tokenScale.x || 1),
        scale.y / (tokenScale.y || 1),
        scale.z / (tokenScale.z || 1)
      );

      if (entry) entry.lastScale = tokenScale;
      return true;
    }

    /**
     * Per-frame loop that keeps every active aura counter-scaled against its
     * token. Robust to resizes from any source (including other players),
     * since it reads the live entity scale rather than relying on an event.
     * Idle work is minimal: it only re-scales when a token's scale changed.
     */
    function startAuraScaleSync() {
      if (auraSyncFrame !== null) return;

      const sync = () => {
        for (const [networkId, entry] of activeAuras.entries()) {
          const shape = TokenManager.getTokenChildByName(networkId, "TokenAura");
          if (!shape || !applyWorldScale(networkId, shape, entry.scale)) {
            // Token or aura shape is gone; stop tracking it.
            activeAuras.delete(networkId);
          }
        }

        if (activeAuras.size > 0) {
          auraSyncFrame = requestAnimationFrame(sync);
          return;
        }

        auraSyncFrame = null;
      };

      auraSyncFrame = requestAnimationFrame(sync);
    }

    /**
     * Apply aura based on token visibility and current aura tag.
     * Tokens hidden by Nivel20 (and not translucent) don't display their aura;
     * "solo aura" tokens hide only the token, never their own aura.
     */
    function syncAuraWithVisibility(networkId, hidden, translucent) {
      const aura = getAuraFromToken(networkId);
      syncAuraOnlyVisibility(networkId, aura);

      if (!aura || aura.size <= 0) {
        applyAuraToToken(networkId, null);
        return;
      }

      const hiddenByUs =
        TokenManager.getLocalVisibilityOverride(networkId, VISIBILITY_SOURCE) !== null;
      if (hidden && !translucent && !hiddenByUs) {
        applyAuraToToken(networkId, null);
        return;
      }

      applyAuraToToken(networkId, aura);
    }

    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
    }

    const SHAPE_ICONS = {
      circle: '<circle cx="12" cy="12" r="8" />',
      rect: '<rect x="3" y="6" width="18" height="12" rx="1" />',
      cone: '<path d="M12 21 L4 5 A 9 9 0 0 1 20 5 Z" />',
      line: '<rect x="10" y="2" width="4" height="20" rx="1" />',
    };

    /**
     * Open aura configuration panel for a specific token
     */
    function openAuraPanel(networkId) {
      const current = getAuraFromToken(networkId) || {
        color: "b",
        shape: "circle",
        size: 1,
        height: 1,
        angle: DEFAULT_CONE_ANGLE,
        width: 1,
        direction: 0,
        auraOnly: false,
      };

      // Build color swatches HTML
      const colorSwatchesHtml = Object.entries(AURA_COLORS)
        .map(([key, config]) => {
          const [r, g, b] = config.rgb;
          const rgbStr = `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
          const isSelected = key === current.color ? "n21-aura-color-selected" : "";
          return `
            <div 
              class="n21-aura-color-swatch ${isSelected}" 
              data-color-key="${key}" 
              style="background-color: ${rgbStr};"
              title="${config.name}"
            ></div>
          `;
        })
        .join("");

      const shapeButtonsHtml = Object.entries(AURA_SHAPES)
        .map(
          ([key, def]) => `
            <button type="button" class="n21-aura-shape-btn ${
              key === current.shape ? "n21-aura-shape-selected" : ""
            }" data-shape="${key}" title="${def.label}" aria-label="${def.label}">
              <svg viewBox="0 0 24 24" aria-hidden="true">${SHAPE_ICONS[key]}</svg>
              <span>${def.label}</span>
            </button>`,
        )
        .join("");

      const directionOptionsHtml = DIRECTIONS.map(
        (d) =>
          `<option value="${d.deg}" ${
            d.deg === current.direction ? "selected" : ""
          }>${d.label}</option>`,
      ).join("");

      const field = (id, label, value, attrs, shapes) => `
        <div class="n21-aura-field" data-shapes="${shapes}">
          <label for="${id}" class="n21-aura-section-label">${label}</label>
          <input type="number" id="${id}" class="form-control" value="${escapeHtml(
            value,
          )}" ${attrs} />
        </div>`;

      const html = `
        <div class="n21-aura-panel">
        <div class="n21-aura-panel-content">
          <div class="n21-aura-panel-section">
            <label class="n21-aura-section-label">Forma</label>
            <div class="n21-aura-shape-grid">${shapeButtonsHtml}</div>
          </div>
          <div class="n21-aura-panel-section">
            <label class="n21-aura-section-label">Color</label>
            <div class="n21-aura-color-grid">
              ${colorSwatchesHtml}
            </div>
          </div>
          <div class="n21-aura-fields">
            ${field("n21-aura-radius", "Radio (casillas)", current.size, 'min="0" step="0.5"', "circle")}
            ${field("n21-aura-width", "Ancho (casillas)", current.size, 'min="0" step="0.5"', "rect")}
            ${field("n21-aura-height", "Alto (casillas)", current.height, 'min="0" step="0.5"', "rect")}
            ${field("n21-aura-length", "Longitud (casillas)", current.size, 'min="0" step="0.5"', "cone line")}
            ${field("n21-aura-angle", "Apertura (grados)", current.angle, 'min="1" max="360" step="1"', "cone")}
            ${field("n21-aura-line-width", "Ancho (casillas)", current.width, 'min="0.5" step="0.5"', "line")}
            <div class="n21-aura-field" data-shapes="cone line">
              <label for="n21-aura-direction" class="n21-aura-section-label">Dirección</label>
              <select id="n21-aura-direction" class="form-control">${directionOptionsHtml}</select>
            </div>
          </div>
          <label class="n21-aura-check">
            <input type="checkbox" id="n21-aura-only" ${current.auraOnly ? "checked" : ""} />
            <span>Solo aura: ocultar el token a los jugadores (para terreno difícil, trampas o zonas)</span>
          </label>
        </div>
        <div class="n21-panel-footer">
          <button id="n21-aura-remove-btn" class="btn btn-danger">Eliminar</button>
          <button id="n21-aura-apply-btn" class="btn btn-primary">Aplicar</button>
        </div>
        </div>
      `;
      const tokenSchema = TokenManager.getTokenSchema(networkId);
      const panelTitle = `Aura de ${tokenSchema.name} <span n21-h>${networkId}</span>`;
      const $panel = FloatingPanelManager.openStaticPanelWithHtml(
        panelTitle,
        "ft-circle",
        "#822020",
        html,
        "n21-aura-floating-panel n21-fixed-panel",
        "min-width: 360px; max-width: 360px; height: 560px; min-height: 560px; max-height: 90vh;",
      );

      if (!$panel || !$panel.length) return;

      let selectedColor = current.color;
      let selectedShape = current.shape;

      const $colorSwatches = $panel.find(".n21-aura-color-swatch");
      const $shapeButtons = $panel.find(".n21-aura-shape-btn");
      const $applyBtn = $panel.find("#n21-aura-apply-btn");
      const $removeBtn = $panel.find("#n21-aura-remove-btn");

      function syncFields() {
        $panel.find(".n21-aura-field").each(function () {
          const shapes = String($(this).attr("data-shapes") || "").split(" ");
          $(this).toggle(shapes.includes(selectedShape));
        });
      }
      syncFields();

      $colorSwatches.on("click", function () {
        $colorSwatches.removeClass("n21-aura-color-selected");
        $(this).addClass("n21-aura-color-selected");
        selectedColor = $(this).attr("data-color-key");
      });

      $shapeButtons.on("click", function () {
        $shapeButtons.removeClass("n21-aura-shape-selected");
        $(this).addClass("n21-aura-shape-selected");
        selectedShape = $(this).attr("data-shape");
        syncFields();
      });

      function readNumber(selector) {
        return parseFloat($panel.find(selector).val());
      }

      function readAura() {
        const aura = {
          color: selectedColor,
          shape: selectedShape,
          size: 0,
          height: 0,
          angle: DEFAULT_CONE_ANGLE,
          width: 1,
          direction: parseInt($panel.find("#n21-aura-direction").val(), 10) || 0,
          auraOnly: $panel.find("#n21-aura-only").is(":checked"),
        };
        if (selectedShape === "circle") aura.size = readNumber("#n21-aura-radius");
        if (selectedShape === "rect") {
          aura.size = readNumber("#n21-aura-width");
          aura.height = readNumber("#n21-aura-height");
        }
        if (selectedShape === "cone" || selectedShape === "line") {
          aura.size = readNumber("#n21-aura-length");
        }
        if (selectedShape === "cone") aura.angle = readNumber("#n21-aura-angle");
        if (selectedShape === "line") aura.width = readNumber("#n21-aura-line-width");
        return aura;
      }

      $applyBtn.on("click", async () => {
        const aura = readAura();
        const invalid =
          !aura.color ||
          isNaN(aura.size) ||
          aura.size < 0 ||
          (aura.shape === "rect" && (isNaN(aura.height) || aura.height <= 0)) ||
          (aura.shape === "cone" && (isNaN(aura.angle) || aura.angle < 1 || aura.angle > 360)) ||
          (aura.shape === "line" && (isNaN(aura.width) || aura.width <= 0));

        if (invalid) {
          alert("Algún valor no es válido. Revisa los tamaños (números mayores o iguales a 0) y la apertura (entre 1 y 360).");
          return;
        }

        const token = TokenManager.getToken(networkId);
        if (!token) {
          alert("No se encontro el token seleccionado. Cierra este panel y vuelve a intentarlo desde el token.");
          return;
        }

        // Only modify tag - the metadata change listener will apply the visual changes
        if (aura.size === 0) {
          await EditTokenUIManager.removeTokenTag(networkId, "a");
        } else {
          await EditTokenUIManager.setTokenTag(networkId, "a", formatAuraTag(aura));
        }
      });

      // Remove button handler
      $removeBtn.on("click", async () => {
        const token = TokenManager.getToken(networkId);
        if (!token) {
          alert("No se encontro el token seleccionado. Cierra este panel y vuelve a intentarlo desde el token.");
          return;
        }

        // Only remove tag - the metadata change listener will remove the visual aura
        await EditTokenUIManager.removeTokenTag(networkId, "a");
      });
    }

    // Register aura option in canvas dropdown
    CanvasDropdownManager.registerOption({
      id: "n21-token-aura",
      label: "Modificar Aura",
      showOn: ["token"],
      order: 59,
      gameMasterOnly: true,
      singleSelectionOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      onClick: (context) => {
        if (!PlayerManager.isGameMaster()) return;

        const networkId = toText(context?.tokenNetworkId);
        if (!networkId) return;

        openAuraPanel(networkId);
      },
    });

    // Apply or remove aura on token metadata change
    TokenManager.onTokenMetadataChange((networkId) => {
      const visibility = TokenManager.getTokenVisibility(networkId) || {
        hidden: false,
        translucent: false,
      };

      syncAuraWithVisibility(networkId, visibility.hidden, visibility.translucent);
    });

    // Hide/show aura when token visibility changes
    TokenManager.onTokenVisibilityChange((networkId, hidden, translucent) => {
      syncAuraWithVisibility(networkId, hidden, translucent);
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Aura", error);
  }
})();
