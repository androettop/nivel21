(async () => {
  try {
    /* =======================
       Feature: Token Layers
    ======================= */

    const { loadManagers } = window._n21_;

    const [CanvasDropdownManager, EditTokenUIManager, PlayerManager, SettingsManager, TokenManager] =
      await loadManagers(
        "CanvasDropdownManager",
        "EditTokenUIManager",
        "PlayerManager",
        "SettingsManager",
        "TokenManager",
      );

    if (!SettingsManager.get("feature.token-layers.enabled")) {
      return;
    }

    // Default layers
    const DEFAULT_LAYERS = [
      { name: "0 - Fondo" },
      { name: "1 - Capa 1" },
      { name: "2 - Capa 2" },
      { name: "3 - Capa 3" },
      { name: "4 - Capa 4" },
      { name: "5 - Capa 5" },
    ];

    const LAYER_HEIGHT = 0.05; // Z offset per layer (adjust as needed)

    const STORAGE_KEY = "n21_token_layers";

    // Store original z values for tokens to preserve them across layer changes
    const originalTokenZValues = new Map(); // Map<networkId, Map<childIndex, originalZ>>

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
     * Get layers from localStorage or return default
     * @returns {Array} Array of layer objects with { name }
     */
    function getLayers() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && stored.trim()) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (error) {
        console.error("[Token Layers] Error reading layers from localStorage:", error);
      }
      return DEFAULT_LAYERS;
    }

    /**
     * Save layers to localStorage
     * @param {Array} layers - Array of layer objects
     */
    function saveLayers(layers) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
        // Notify that layers changed - update UI
        window.dispatchEvent(new CustomEvent("n21_layers_changed"));
      } catch (error) {
        console.error("[Token Layers] Error saving layers to localStorage:", error);
      }
    }

    function getLayerFromDescription(description) {
      const layer = window._n21_.utils.parseTokenTag(description, "l");
      if (!layer) return 0; // Default to 0 (Sin capa) if no layer tag
      const num = parseInt(layer, 10);
      const maxLayer = getLayers().length - 1; // Max valid layer index (excluding "Sin capa")
      if (num < 1 || num > maxLayer) return 0;
      return num;
    }

    /**
     * Save original z values from a token's children
     * @param {string} networkId - The network ID of the token
     */
    function saveOriginalZValues(networkId) {
      const token = TokenManager.getToken(networkId);
      if (!token || !token.children) return;

      if (!originalTokenZValues.has(networkId)) {
        const childZValues = new Map();
        token.children.forEach((child, index) => {
          if (child && child.localPosition) {
            childZValues.set(index, child.localPosition.z);
          }
        });
        originalTokenZValues.set(networkId, childZValues);
      }
    }

    /**
     * Apply layer offset to token's children
     * @param {string} networkId - The network ID of the token
     * @param {number} layer - The layer number (0 = Sin capa, 1+ = actual layer)
     */
    function applyLayerOffset(networkId, layer) {
      const token = TokenManager.getToken(networkId);
      if (!token || !token.children) {
        return;
      }

      // Ensure we have original z values saved
      saveOriginalZValues(networkId);

      const childZValues = originalTokenZValues.get(networkId);
      if (!childZValues) {
        return;
      }

      // Apply layer offset to each child (only if layer > 0)
      token.children.forEach((child, index) => {
        if (!child || !child.localPosition) return;

        const originalZ = childZValues.get(index);
        if (originalZ === undefined) return;

        const zScale = token.localScale.z;

        // If layer is 0 (Sin capa), keep original Z; otherwise apply offset
        const newZ = layer === 0 ? originalZ : originalZ - (layer / zScale * LAYER_HEIGHT);
        child.setLocalPosition(child.localPosition.x, child.localPosition.y, newZ);
      });
    }

    function updateTokenLayerFromMetadata(networkId, metadataString) {
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);
      const layer = getLayerFromDescription(description);

      // Apply the layer offset to the token's children
      applyLayerOffset(networkId, layer);
    }

    // Setup metadata listeners for all players
    TokenManager.onTokenMetadataChange((networkId, metadataString) => {
      updateTokenLayerFromMetadata(networkId, metadataString);
    });

    const CHECK_MARK = " ✓";

    function getTokenLayerFromSchema(networkId) {
      const schema = TokenManager.getTokenSchema(networkId);
      if (!schema) return 0;

      const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);

      return getLayerFromDescription(description); // Returns 0 if no layer
    }

    function buildSubmenu(context) {
      const networkId = toText(context?.tokenNetworkId);
      const currentLayer = networkId ? getTokenLayerFromSchema(networkId) : 0;
      const layers = getLayers();

      return layers.map((layer, index) => ({
        id: `n21-layer-${index}`,
        label: `${layer.name}${currentLayer === index ? CHECK_MARK : ""}`,
        onClick: async (context) => {
          if (!PlayerManager.isGameMaster()) return;

          const networkId = toText(context?.tokenNetworkId);
          if (!networkId) return;

          // Get current layer
          const currentLayer = getTokenLayerFromSchema(networkId);

          // Only update if not already on this layer
          if (currentLayer !== index) {
            if (index === 0) {
              // Sin capa - clear the layer marker
              await EditTokenUIManager.clearTokenLayerMarkers(networkId);
            } else {
              // Set the layer marker
              await EditTokenUIManager.setTokenLayerMarker(networkId, index);
            }
          }
        },
      }));
    }



    /* ----------------------- hotkeys ----------------------- */

    /** Whether a keydown matches a hotkey string like "ctrl+pageup". */
    function matchesHotkey(event, hotkeyString) {
      const parts = String(hotkeyString || "").toLowerCase().split("+").map((p) => p.trim());
      const key = parts.filter((p) => !["ctrl", "alt", "shift"].includes(p))[0] || "";
      return (
        key === String(event.key || "").toLowerCase() &&
        parts.includes("ctrl") === event.ctrlKey &&
        parts.includes("alt") === event.altKey &&
        parts.includes("shift") === event.shiftKey
      );
    }

    // Layer each token is being saved to: quick presses build on it instead
    // of on the not yet saved description.
    const pendingLayers = new Map();

    // RePág / AvPág move the selected tokens one layer up / down.
    document.addEventListener("keydown", (event) => {
      const up = matchesHotkey(event, SettingsManager.get("hotkey.token.layer.up"));
      const down = !up && matchesHotkey(event, SettingsManager.get("hotkey.token.layer.down"));
      if (!up && !down) return;
      const target = event.target;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      if (!PlayerManager.isGameMaster()) return;
      const ids = TokenManager.getSelectedTokenIds();
      if (!ids.length) return;
      event.preventDefault();
      if (event.repeat) return;
      const maxLayer = getLayers().length - 1;
      ids.forEach(async (networkId) => {
        const current = pendingLayers.get(networkId) ?? getTokenLayerFromSchema(networkId);
        const next = Math.min(Math.max(current + (up ? 1 : -1), 0), maxLayer);
        if (next === current) return;
        pendingLayers.set(networkId, next);
        try {
          if (next === 0) await EditTokenUIManager.clearTokenLayerMarkers(networkId);
          else await EditTokenUIManager.setTokenLayerMarker(networkId, next);
        } finally {
          if (pendingLayers.get(networkId) === next) pendingLayers.delete(networkId);
        }
      });
    });

    // Register option with dynamic submenu
    CanvasDropdownManager.registerOption({
      id: "n21-token-layers",
      label: "Capa",
      showOn: ["token"],
      order: 56,
      gameMasterOnly: true,
      singleSelectionOnly: true,
      isVisible: (context) => {
        if (!PlayerManager.isGameMaster()) return false;
        if (!context?.tokenNetworkId) return false;
        return true;
      },
      submenu: buildSubmenu,
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Layers", error);
  }
})();

