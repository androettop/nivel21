(async () => {
  try {
    /* =======================
       Feature: Straighten Camera
    ======================= */

    const { loadManagers } = window._n21_;

    const [CanvasDropdownManager, CameraManager, SettingsManager] = await loadManagers(
      "CanvasDropdownManager",
      "CameraManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.straighten-camera.enabled")) {
      return;
    }

    CanvasDropdownManager.registerOption({
      id: "n21-straighten-camera",
      label: "Enderezar camara",
      showOn: ["always"],
      order: 41,
      onClick: () => {
        CameraManager.straightenCameraYaw();
      },
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Straighten Camera", error);
  }
})();
