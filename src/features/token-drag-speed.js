(async () => {
  try {
    /* =======================
         Feature: Token Drag Speed
      ======================= */

    const { loadManagers } = window._n21_;
    const [CameraManager, SettingsManager] = await loadManagers(
      "CameraManager",
      "SettingsManager"
    );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.token-drag-speed.enabled")) {
      return;
    }

    function updateDragSpeed() {
      const dragSelect = CameraManager._getDragSelect();
      if (!dragSelect) return;

      const maxDragStep = Number(
        SettingsManager.get("token-drag.maxDragStep")
      );
      if (!Number.isFinite(maxDragStep)) return;

      dragSelect.maxDragStep = maxDragStep;
    }

    // Initial setup
    updateDragSpeed();

    // Listen to settings changes
    SettingsManager.onChange(() => {
      updateDragSpeed();
    });
  } catch (error) {
    console.error("Error in Token Drag Speed feature:", error);
  }
})();
