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

    const LAYER_MARKER_REGEX = /\[l:\s*(\d+)\s*\]/i;

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
      if (!layer) return null;
      const num = parseInt(layer, 10);
      if (num < 1 || num > 6) return null;
      return num;
    }

    function updateTokenLayerFromMetadata(networkId, metadataString) {
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);
      const layer = getLayerFromDescription(description);

      console.log(`[Token Layers] Token ${networkId} - Layer detected: ${layer}`);
    }

    // Setup metadata listeners for all players
    TokenManager.onTokenMetadataChange((networkId, metadataString) => {
      updateTokenLayerFromMetadata(networkId, metadataString);
    });

    const CHECK_MARK = " ✓";

    function buildSubmenu(context) {
      const networkId = toText(context?.tokenNetworkId);
      const currentLayer = networkId ? getTokenLayerFromSchema(networkId) : null;

      const layers = [1, 2, 3, 4, 5, 6];

      return [
        {
          id: "n21-layer-none",
          label: `Sin capa${currentLayer === null ? CHECK_MARK : ""}`,
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
      if (!schema) return null;

      const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
      const parsedMetadata = safeJsonParse(metadataString) || {};
      const description = toText(parsedMetadata.description);

      return getLayerFromDescription(description);
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
