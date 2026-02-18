(async () => {
  try {
    /* =======================
	       Feature: Token Height Order
	    ======================= */

    const { loadManagers } = window._n21_;
    const [SettingsManager] = await loadManagers("SettingsManager");

    // Check if feature is enabled
    if (!SettingsManager.get("feature.token-height-order.enabled")) {
      return;
    }

    const { TokenManager } = window._n21_?.managers || {};

    function parseHotkey(hotkeyString) {
      const lower = String(hotkeyString || "").toLowerCase();
      const parts = lower.split("+").map((p) => p.trim());

      return {
        ctrl: parts.includes("ctrl"),
        alt: parts.includes("alt"),
        shift: parts.includes("shift"),
        key: parts.filter((p) => !["ctrl", "alt", "shift"].includes(p))[0] || "",
      };
    }

    function matchesHotkey(event, hotkeyString) {
      const hotkey = parseHotkey(hotkeyString);
      const eventKey = String(event.key || "").toLowerCase();

      const ctrlMatch = hotkey.ctrl ? event.ctrlKey : !event.ctrlKey;
      const altMatch = hotkey.alt ? event.altKey : !event.altKey;
      const shiftMatch = hotkey.shift ? event.shiftKey : !event.shiftKey;
      const keyMatch = hotkey.key === eventKey;

      return ctrlMatch && altMatch && shiftMatch && keyMatch;
    }

    function getNumberSetting(name, fallback) {
      const numeric = Number(SettingsManager.get(name));
      return Number.isFinite(numeric) ? numeric : fallback;
    }

    function getHeightConfig() {
      const step = Math.max(0.001, getNumberSetting("token-height.step", 0.06));
      const minHeight = Math.max(0, getNumberSetting("token-height.min", 0.001));
      const maxHeightRaw = getNumberSetting("token-height.max", 10);
      const maxHeight = Math.max(minHeight, maxHeightRaw);
      return { step, minHeight, maxHeight };
    }

    function isEditableTarget(target) {
      return (
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      );
    }

    function getSelectedSchemas() {
      if (Array.isArray(window.selectedSchemas)) {
        return window.selectedSchemas;
      }

      return [];
    }

    function updateTokenHeights(delta, config) {
      const selectedSchemas = getSelectedSchemas();
      if (!selectedSchemas.length) return;

      selectedSchemas.forEach((selectedSchema) => {
        if (
          !selectedSchema ||
          !selectedSchema.networkId ||
          !selectedSchema.position
        )
          return;

        const currentY =
          typeof selectedSchema.position.y === "number"
            ? selectedSchema.position.y
            : 0;
        const nextY = Math.min(
          config.maxHeight,
          Math.max(config.minHeight, currentY + delta),
        );

        TokenManager.updatePosition(selectedSchema.networkId, {
          ...selectedSchema.position,
          y: nextY,
        });
      });
    }

    $(document).on("keydown", (e) => {
      if (isEditableTarget(e.target)) return;

      const hotkeyUp = SettingsManager.get("hotkey.token.height.up");
      const hotkeyDown = SettingsManager.get("hotkey.token.height.down");
      const isUp = matchesHotkey(e, hotkeyUp);
      const isDown = matchesHotkey(e, hotkeyDown);
      if (!isUp && !isDown) return;

      e.preventDefault();
      const config = getHeightConfig();
      const delta = isUp ? config.step : -config.step;
      updateTokenHeights(delta, config);
    });
  } catch (error) {
    console.warn("N21: Error en feature Token Height Order:", error.message);
  }
})();
