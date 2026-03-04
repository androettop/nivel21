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

    function getLayerFromDescription(description) {
      const layer = window._n21_.utils.parseTokenTag(description, "l");
      if (!layer) return 0; // Default to 0 if no layer
      const num = parseInt(layer, 10);
      if (num < 1 || num > 6) return 0;
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
     * @param {number} layer - The layer number (0 if no layer assigned)
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

      // Apply layer offset to each child
      token.children.forEach((child, index) => {
        if (!child || !child.localPosition) return;

        const originalZ = childZValues.get(index);
        if (originalZ === undefined) return;

        // New Z = original Z - layer number
        const newZ = originalZ - layer;
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

    function buildSubmenu(context) {
      const networkId = toText(context?.tokenNetworkId);
      const currentLayer = networkId ? getTokenLayerFromSchema(networkId) : 0;

      const layers = [1, 2, 3, 4, 5, 6];

      return [
        {
          id: "n21-layer-none",
          label: `Sin capa${currentLayer === 0 ? CHECK_MARK : ""}`,
          onClick: async (context) => {
            if (!PlayerManager.isGameMaster()) return;

            const networkId = toText(context?.tokenNetworkId);
            if (!networkId) return;

            await EditTokenUIManager.clearTokenLayerMarkers(networkId);
          },
        },
        ...layers.map((layer) => ({
          id: `n21-layer-${layer}`,
          label: `Capa ${layer}${currentLayer === layer ? CHECK_MARK : ""}`,
          onClick: async (context) => {
            if (!PlayerManager.isGameMaster()) return;

            const networkId = toText(context?.tokenNetworkId);
            if (!networkId) return;

            // Get current layer
            const currentLayer = getTokenLayerFromSchema(networkId);

            // Only update if not already on this layer
            if (currentLayer !== layer) {
              await EditTokenUIManager.setTokenLayerMarker(networkId, layer);
            }
          },
        })),
      ];
    }

    function getTokenLayerFromSchema(networkId) {
      const schema = TokenManager.getTokenSchema(networkId);
      if (!schema) return 0;

      const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);

      return getLayerFromDescription(description); // Returns 0 if no layer
    }

    // Register option with dynamic submenu
    CanvasDropdownManager.registerOption({
      id: "n21-token-layers",
      label: "Capa",
      showOn: ["token"],
      order: 56,
      gameMasterOnly: true,
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
