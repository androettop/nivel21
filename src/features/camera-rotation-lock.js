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

    if (!SettingsManager.get("feature.camera-rotation-lock.enabled")) {
      return;
    }

    const LOCKED_SETTING = "camera-rotation-lock.locked";
    const TOGGLE_ID = "n21-camera-rotation-lock-toggle";

    function isLocked() {
      return SettingsManager.get(LOCKED_SETTING) !== false;
    }

    QuickMenuUIManager.registerConnectedActionsToggle({
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

    SettingsManager.onChange((name) => {
      if (name !== LOCKED_SETTING) return;
      CameraManager.setRotationLocked(isLocked());
      QuickMenuUIManager.refreshToggleState(TOGGLE_ID);
    });

    CameraManager.setRotationLocked(isLocked());
  } catch (error) {
    window._n21_.utils.registerFeatureError("Camera Rotation Lock", error);
  }
})();
