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

    // Constants for height adjustment
    const MIN_HEIGHT = 0.001;
    const MAX_HEIGHT = 10;
    const STEP = 0.06;

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

    function updateTokenHeights(delta) {
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
          MAX_HEIGHT,
          Math.max(MIN_HEIGHT, currentY + delta),
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
      const delta = isUp ? STEP : -STEP;
      updateTokenHeights(delta);
    });
  } catch (error) {
    console.warn("N21: Error en feature Token Height Order:", error.message);
  }
})();
