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
    ] = await loadManagers(
      "TokenManager",
      "CanvasDropdownManager",
      "EditTokenUIManager",
      "PlayerManager",
      "SettingsManager",
      "MeasurementManager",
    );

    if (!SettingsManager.get("feature.token-aura.enabled")) {
      return;
    }

    // Define colors with single-letter keys
    const AURA_COLORS = {
      w: { name: "Blanco", rgb: [1, 1, 1] },
      b: { name: "Negro", rgb: [0, 0, 0] },
      r: { name: "Rojo", rgb: [1, 0, 0] },
      g: { name: "Verde", rgb: [0, 1, 0] },
      a: { name: "Azul", rgb: [0, 0, 1] },
      y: { name: "Amarillo", rgb: [1, 1, 0] },
      o: { name: "Naranja", rgb: [1, 0.5, 0] },
      p: { name: "Púrpura", rgb: [0.5, 0, 1] },
    };

    // Aura radii from 0 to 12
    const AURA_RADII = Array.from({ length: 13 }, (_, i) => i);

    const CHECK_MARK = " ✓";

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
     * Parse aura tag from description: [a:colorKeyRadius]
     * Returns { color, radius } or null
     */
    function parseAuraFromDescription(description) {
      const tag = window._n21_.utils.parseTokenTag(description, "a");
      if (!tag) return null;

      // Pattern: color key (one or more letters) + radius (one or more digits)
      const match = /^([a-z]+)(\d+)$/.exec(tag);
      if (!match) return null;

      return {
        color: match[1],
        radius: parseInt(match[2], 10),
      };
    }

    /**
     * Format aura config for tag storage: colorKeyRadius
     */
    function formatAuraTag(color, radius) {
      return `${color}${radius}`;
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

      // Configure material parameters
      shape.render.material.setParameter("uAngle", 360);
      shape.render.material.setParameter("uBorderPx", 2 / size);
      shape.render.material.setParameter("uFigureSize", [63.9, 63.9]);

      // Set border color (based on color with opacity 0.8)
      shape.render.material.setParameter("uGeomBorderColor", [r, g, b, 0.8]);

      // Set fill color (based on color with opacity 0.6)
      shape.render.material.setParameter("uGeomFillColor", [r, g, b, 0.6]);

      // Set size
      shape.setLocalScale(size, size, size);
    }

    /**
     * Build radius submenu
     */
    function buildRadiusSubmenu(context) {
      const networkId = toText(context?.tokenNetworkId);
      const currentAura = networkId ? getAuraFromToken(networkId) : null;
      const currentRadius = currentAura?.radius || 0;

      return AURA_RADII.map((radius) => ({
        id: `n21-aura-radius-${radius}`,
        label: `Radio ${radius}${currentRadius === radius ? CHECK_MARK : ""}`,
        onClick: async (context) => {
          if (!PlayerManager.isGameMaster()) return;

          const networkId = toText(context?.tokenNetworkId);
          if (!networkId) return;

          const currentAura = getAuraFromToken(networkId);
          const color = currentAura?.color || "b"; // Default to black

          // Save to description
          if (radius === 0) {
            await EditTokenUIManager.removeTokenTag(networkId, "a");
          } else {
            await EditTokenUIManager.setTokenTag(networkId, "a", formatAuraTag(color, radius));
          }

          // Apply visual change
          await applyAuraToToken(networkId, color, radius);
        },
      }));
    }

    /**
     * Build color submenu
     */
    function buildColorSubmenu(context) {
      const networkId = toText(context?.tokenNetworkId);
      const currentAura = networkId ? getAuraFromToken(networkId) : null;
      const currentColor = currentAura?.color || "b";

      return Object.entries(AURA_COLORS).map(([key, config]) => ({
        id: `n21-aura-color-${key}`,
        label: `${config.name}${currentColor === key ? CHECK_MARK : ""}`,
        onClick: async (context) => {
          if (!PlayerManager.isGameMaster()) return;

          const networkId = toText(context?.tokenNetworkId);
          if (!networkId) return;

          const currentAura = getAuraFromToken(networkId);
          const radius = currentAura?.radius || 1; // Default to radius 1

          // Save to description
          await EditTokenUIManager.setTokenTag(networkId, "a", formatAuraTag(key, radius));

          // Apply visual change
          await applyAuraToToken(networkId, key, radius);
        },
      }));
    }

    // Register radius option
    CanvasDropdownManager.registerOption({
      id: "n21-token-aura-radius",
      label: "Radio de Aura",
      showOn: ["token"],
      order: 59,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: buildRadiusSubmenu,
    });

    // Register color option
    CanvasDropdownManager.registerOption({
      id: "n21-token-aura-color",
      label: "Color de Aura",
      showOn: ["token"],
      order: 60,
      gameMasterOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: buildColorSubmenu,
    });

    // Apply aura on token metadata change
    TokenManager.onTokenMetadataChange((networkId) => {
      const aura = getAuraFromToken(networkId);
      if (aura) {
        applyAuraToToken(networkId, aura.color, aura.radius);
      }
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Aura", error);
  }
})();
