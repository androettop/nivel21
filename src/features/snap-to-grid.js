(async () => {
  try {
    /* =======================
           Feature: Snap to Grid
        ======================= */

    const { loadManagers } = window._n21_;
    const FIXED_MAGNETISM_SETTING = "snap-to-grid.fixed-magnetism";
    const SNAP_TOGGLE_ID = "n21-snap-to-grid-toggle";

    const [CameraManager, KeyModifiersManager, SettingsManager, QuickMenuUIManager] =
      await loadManagers(
        "CameraManager",
        "KeyModifiersManager",
        "SettingsManager",
        "QuickMenuUIManager",
      );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.snap-to-grid.enabled")) {
      return;
    }

    let isFixedMagnetismEnabled = SettingsManager.get(FIXED_MAGNETISM_SETTING) === true;
    let initialGridMagnetism = null;

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

      if (initialGridMagnetism === null) {
        const currentValue = Number(dragSelect.gridMagnetism);
        initialGridMagnetism = Number.isFinite(currentValue) ? currentValue : 0;
      }

      if (isFixedMagnetismEnabled) {
        dragSelect.gridMagnetism = initialGridMagnetism;
        return;
      }

      if (isConfiguredModifierPressed()) {
        dragSelect.gridMagnetism = 1;
      } else {
        dragSelect.gridMagnetism = 0;
      }
    }

    QuickMenuUIManager.registerConnectedActionsToggle({
      id: SNAP_TOGGLE_ID,
      groupId: "nivel21",
      groupOrder: 10,
      actionOrder: 20,
      iconClass: "icon-custom-square-dashed",
      title: "Alternar Magnetismo de Tokens",
      getState: () => isFixedMagnetismEnabled,
      onToggle: (nextValue) => {
        SettingsManager.set(FIXED_MAGNETISM_SETTING, !!nextValue);
      },
    });

    SettingsManager.onChange((name, value) => {
      if (name !== FIXED_MAGNETISM_SETTING) return;
      isFixedMagnetismEnabled = value === true;
      QuickMenuUIManager.refreshToggleState(SNAP_TOGGLE_ID);
      updateGridMagnetism();
    });

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
