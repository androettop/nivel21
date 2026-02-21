(async () => {
  try {
    /* =======================
       Feature: Center Camera Here
    ======================= */

    const { loadManagers } = window._n21_;

    const [CanvasDropdownManager, CameraManager, PlayerManager] = await loadManagers(
      "CanvasDropdownManager",
      "CameraManager",
      "PlayerManager",
    );

    function getWorldPositionFromContext(context) {
      const canvasCoords = context?.canvasCoords;
      const x = Number(canvasCoords?.x);
      const y = Number(canvasCoords?.y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      const worldPoint = CameraManager.screenToWorld(x, y, 0);
      if (!worldPoint) return null;

      const worldX = Number(worldPoint.x);
      const worldZ = Number(worldPoint.z);
      if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return null;

      return {
        x: worldX,
        z: worldZ,
      };
    }

    CanvasDropdownManager.registerOption({
      id: "n21-center-camera-here",
      label: "Centrar camara aqui",
      showOn: ["always"],
      order: 40,
      gameMasterOnly: true,
      onClick: (context) => {
        if (!PlayerManager.isGameMaster()) return;

        const position = getWorldPositionFromContext(context);
        if (!position) return;

        const settings = CameraManager.getCurrentCameraSettings();
        if (!settings || typeof settings !== "object") return;

        const nextSettings = {
          ...settings,
          pivotPoint: {
            ...(settings.pivotPoint || {}),
            x: position.x,
            z: position.z,
          },
        };

        const moved = CameraManager.moveCamera(nextSettings);
        if (!moved) return;

        setTimeout(() => {
          CameraManager.moveOthersToCurrent();
        }, 1000);
      },
    });
  } catch (error) {
    console.warn("N21: Error en feature Center Camera Here:", error.message);
  }
})();
