(async () => {
  try {
    /* =======================
           Feature: Snap to Grid
        ======================= */

    const { loadManagers } = window._n21_;

    const [CameraManager, KeyModifiersManager, SettingsManager] =
      await loadManagers(
        "CameraManager",
        "KeyModifiersManager",
        "SettingsManager"
      );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.snap-to-grid.enabled")) {
      return;
    }

    function getConfiguredModifier() {
      const modifier = String(
        SettingsManager.get("snap-to-grid.modifier") || "shift"
      ).toLowerCase();
      if (["shift", "ctrl", "alt"].includes(modifier)) {
        return modifier;
      }
      return "shift";
    }

    function isConfiguredModifierPressed() {
      const modifier = getConfiguredModifier();
      const modifiers = KeyModifiersManager.getState() || {};
      return Boolean(modifiers[modifier]);
    }

    function updateGridMagnetism() {
      const dragSelect = CameraManager._getDragSelect();
      if (!dragSelect) return;

      if (isConfiguredModifierPressed()) {
        dragSelect.gridMagnetism = 1;
      } else {
        dragSelect.gridMagnetism = 0;
      }
    }

    // Listen to modifier key state changes
    KeyModifiersManager.onChange(() => {
      updateGridMagnetism();
    });

    // Initialize grid magnetism state on load
    updateGridMagnetism();
  } catch (error) {
    console.warn("N21: Error en feature Snap to Grid:", error.message);
  }
})();
