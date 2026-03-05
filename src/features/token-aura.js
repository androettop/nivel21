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

    /**
     * Parse aura tag from description: [a:colorKey-radius]
     * Returns { color, radius } or null
     * Supports decimal radii (e.g., b-1.5, r-2.25)
     */
    function parseAuraFromDescription(description) {
      const tag = window._n21_.utils.parseTokenTag(description, "a");
      if (!tag) return null;

      // Pattern: color key (one or more letters) + dash + radius (integers or decimals)
      const match = /^([a-z]+)-?([\d.]+)$/.exec(tag);
      if (!match) return null;

      const radius = parseFloat(match[2]);
      if (isNaN(radius) || radius < 0) return null;

      return {
        color: match[1],
        radius: radius,
      };
    }

    /**
     * Format aura config for tag storage: colorKey-radius
     */
    function formatAuraTag(color, radius) {
      return `${color}-${radius}`;
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

    /**
     * Get or create TokenAura shape on the token
     */
    function getOrCreateAuraShape(token) {
      if (!token) return null;

      // Find existing TokenAura child
      if (token.children && token.children.length > 0) {
        for (let child of token.children) {
          if (child && child.name === "TokenAura") {
            return child;
          }
        }
      }

      // Create new aura shape using MeasurementManager
      const shape = MeasurementManager.createAuraShape();
      if (!shape) {
        console.warn("[Token Aura] Failed to create aura shape");
        return null;
      }

      // Set position to token's position (absolute) before adding as child
      shape.setPosition(shape.position.x, token.position.y, shape.position.z);

      // Add to token as child (after setting position/rotation, further changes will be relative)
      if (token.addChild) {
        token.addChild(shape);
      }

      return shape;
    }

    /**
     * Apply aura configuration to token
     * If radius is 0, removes the aura
     */
    async function applyAuraToToken(networkId, color, radius) {
      const token = TokenManager.getToken(networkId);
      if (!token) {
        console.warn("[Token Aura] Token not found:", networkId);
        return;
      }

      // If radius is 0, remove the aura
      if (radius === 0) {
        if (token.children && token.children.length > 0) {
          const auraShape = token.children.find((child) => child && child.name === "TokenAura");
          if (auraShape) {
            token.removeChild(auraShape);
          }
        }
        return;
      }

      // Get or create the aura shape
      const shape = getOrCreateAuraShape(token);
      if (!shape) {
        console.warn("[Token Aura] Failed to create aura shape");
        return;
      }

      // Get color configuration
      const colorConfig = AURA_COLORS[color];
      if (!colorConfig) {
        console.warn("[Token Aura] Invalid color key:", color);
        return;
      }

      // Apply aura configuration
      const size = radius * 2;
      const [r, g, b] = colorConfig.rgb;
      const fillAlpha = colorConfig.alpha;
      const borderAlpha = Math.min(fillAlpha + 0.2, 1.0);

      // Configure material parameters
      shape.render.material.setParameter("uAngle", 360);
      shape.render.material.setParameter("uBorderPx", 2 / size);
      shape.render.material.setParameter("uFigureSize", [63.9, 63.9]);

      // Set border color (fill alpha + 0.2, capped at 1.0)
      shape.render.material.setParameter("uGeomBorderColor", [r, g, b, borderAlpha]);

      // Set fill color (using color's alpha)
      shape.render.material.setParameter("uGeomFillColor", [r, g, b, fillAlpha]);

      // Set size
      shape.setLocalScale(size, size, size);
    }

    /**
     * Open aura configuration panel for a specific token
     */
    function openAuraPanel(networkId) {
      const currentAura = getAuraFromToken(networkId);
      const currentColor = currentAura?.color || "b";
      const currentRadius = currentAura?.radius || 1;

      // Build color swatches HTML
      const colorSwatchesHtml = Object.entries(AURA_COLORS)
        .map(([key, config]) => {
          const [r, g, b] = config.rgb;
          const rgbStr = `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
          const isSelected = key === currentColor ? "n21-aura-color-selected" : "";
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

      const html = `
        <div class="n21-aura-panel-content">
          <div class="n21-aura-panel-section">
            <label class="n21-aura-section-label">Color:</label>
            <div class="n21-aura-color-grid">
              ${colorSwatchesHtml}
            </div>
          </div>
          <div class="n21-aura-panel-section">
            <label for="n21-aura-radius" class="n21-aura-section-label">Radio:</label>
            <input 
              type="number" 
              id="n21-aura-radius" 
              class="form-control" 
              value="${currentRadius}" 
              min="0" 
              step="0.5"
            />
          </div>
          <div class="n21-aura-panel-buttons">
            <button id="n21-aura-apply-btn" class="btn btn-success">Aplicar</button>
            <button id="n21-aura-remove-btn" class="btn btn-danger">Eliminar</button>
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
        "min-width: 320px; min-height: 292px; max-width: 320px; max-height: 292px;",
      );

      if (!$panel || !$panel.length) {
        console.warn("[Token Aura] Failed to create floating panel");
        return;
      }

      // Track selected color
      let selectedColor = currentColor;

      // Get form elements
      const $colorSwatches = $panel.find(".n21-aura-color-swatch");
      const $radiusInput = $panel.find("#n21-aura-radius");
      const $applyBtn = $panel.find("#n21-aura-apply-btn");
      const $removeBtn = $panel.find("#n21-aura-remove-btn");

      // Color swatch click handler
      $colorSwatches.on("click", function () {
        // Remove selection from all swatches
        $colorSwatches.removeClass("n21-aura-color-selected");
        
        // Add selection to clicked swatch
        $(this).addClass("n21-aura-color-selected");
        
        // Update selected color
        selectedColor = $(this).attr("data-color-key");
      });

      // Apply button handler
      $applyBtn.on("click", async () => {
        const color = selectedColor;
        const radius = parseFloat($radiusInput.val());

        if (!color || isNaN(radius) || radius < 0) {
          alert("[Token Aura] Radio inválido");
          return;
        }

        const token = TokenManager.getToken(networkId);
        if (!token) {
          alert(`[Token Aura] El token no se encuentra (ID: ${networkId})`);
          return;
        }

        // Only modify tag - the metadata change listener will apply the visual changes
        if (radius === 0) {
          await EditTokenUIManager.removeTokenTag(networkId, "a");
        } else {
          await EditTokenUIManager.setTokenTag(networkId, "a", formatAuraTag(color, radius));
        }
      });

      // Remove button handler
      $removeBtn.on("click", async () => {
        const token = TokenManager.getToken(networkId);
        if (!token) {
          alert(`[Token Aura] El token no se encuentra (ID: ${networkId})`);
          return;
        }

        // Only remove tag - the metadata change listener will remove the visual aura
        await EditTokenUIManager.removeTokenTag(networkId, "a");
        
        // Reset form
        $radiusInput.val(0);
      });
    }

    // Register aura option in canvas dropdown
    CanvasDropdownManager.registerOption({
      id: "n21-token-aura",
      label: "Aura",
      showOn: ["token"],
      order: 59,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      onClick: (context) => {
        if (!PlayerManager.isGameMaster()) return;

        const networkId = toText(context?.tokenNetworkId);
        if (!networkId) {
          console.warn("[Token Aura] No token network ID provided");
          return;
        }

        openAuraPanel(networkId);
      },
    });

    // Apply or remove aura on token metadata change
    TokenManager.onTokenMetadataChange((networkId) => {
      const aura = getAuraFromToken(networkId);
      
      if (aura && aura.radius > 0) {
        // Apply aura if tag exists and radius > 0
        applyAuraToToken(networkId, aura.color, aura.radius);
      } else {
        // Remove aura if no tag or radius is 0
        applyAuraToToken(networkId, "b", 0);
      }
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Aura", error);
  }
})();
