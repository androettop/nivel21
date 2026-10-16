(async () => {
  try {
    /* =======================
       Feature: Camera Rotation Lock (Bloquear rotación de cámara)

       Botón en el menú rápido (junto a "Mostrar/Ocultar distancia") que
       bloquea la rotación de la cámara para que no se gire el tablero por
       accidente. Desplazar y hacer zoom siguen funcionando. Activado por
       defecto; el estado se recuerda.
    ======================= */

    const { loadManagers } = window._n21_;

    const [CameraManager, SettingsManager, QuickMenuUIManager] = await loadManagers(
      "CameraManager",
      "SettingsManager",
      "QuickMenuUIManager",
    );

    const LOCKED_SETTING = "camera-rotation-lock.locked";
    const TOGGLE_ID = "n21-camera-rotation-lock-toggle";

    let enabled = false;
    let unregisterToggle = null;

    function isLocked() {
      return SettingsManager.get(LOCKED_SETTING) !== false;
    }

    function apply() {
      CameraManager.setRotationLocked(enabled && isLocked());
    }

    // Applies live: disabling removes the button and unlocks the camera.
    SettingsManager.watch("feature.camera-rotation-lock.enabled", (value) => {
      enabled = !!value;
      if (enabled && !unregisterToggle) {
        unregisterToggle = QuickMenuUIManager.registerConnectedActionsToggle({
          id: TOGGLE_ID,
          groupId: "nivel21",
          groupOrder: 10,
          actionOrder: 20,
          iconClass: "ft-lock",
          title: "Bloquear/Desbloquear rotación de la cámara",
          getState: () => isLocked(),
          onToggle: (nextValue) => {
            SettingsManager.set(LOCKED_SETTING, !!nextValue);
          },
        });
      } else if (!enabled && unregisterToggle) {
        unregisterToggle();
        unregisterToggle = null;
      }
      apply();
    });

    SettingsManager.onChange((name) => {
      if (name !== LOCKED_SETTING) return;
      apply();
      QuickMenuUIManager.refreshToggleState(TOGGLE_ID);
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Camera Rotation Lock", error);
  }
})();
