(async () => {
  try {
    /* =======================
         Feature: Token Move Arrows
      ======================= */

    const { loadManagers, settingsLoader } = window._n21_;
    
    // Wait for settings to load
    await settingsLoader.load();
    
    // Check if feature is enabled
    if (!settingsLoader.isFeatureEnabled('token-move-arrows')) {
      console.log('N21: Feature Token Move Arrows is disabled');
      return;
    }

    const [TokenManager] = await loadManagers("TokenManager");

    const STEP = 1;
    const selectedTokenWrapper = ".selected-token-wrapper";

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

    function isTokenWrapperActive() {
      const wrapper = document.querySelector(selectedTokenWrapper);
      return wrapper && !wrapper.classList.contains("hidden");
    }

    function updateTokenPositions(selectedSchemas, deltaX, deltaZ) {
      if (!TokenManager || typeof TokenManager.updatePosition !== "function")
        return;

      selectedSchemas.forEach((selectedSchema) => {
        if (
          !selectedSchema ||
          !selectedSchema.networkId ||
          !selectedSchema.position
        )
          return;

        if (!TokenManager.isTokenSelectable(selectedSchema.networkId)) return;

        const currentX =
          typeof selectedSchema.position.x === "number"
            ? selectedSchema.position.x
            : 0;
        const currentZ =
          typeof selectedSchema.position.z === "number"
            ? selectedSchema.position.z
            : 0;
        const nextX = currentX + deltaX;
        const nextZ = currentZ + deltaZ;

        TokenManager.updatePosition(selectedSchema.networkId, {
          ...selectedSchema.position,
          x: nextX,
          z: nextZ,
        });
      });
    }

    const pressedKeys = new Set();

    function applyMovementFromPressed(selectedSchemas) {
      const hasUp = pressedKeys.has("ArrowUp");
      const hasDown = pressedKeys.has("ArrowDown");
      const hasLeft = pressedKeys.has("ArrowLeft");
      const hasRight = pressedKeys.has("ArrowRight");

      const deltaZ = hasUp && hasDown ? 0 : hasUp ? -STEP : hasDown ? STEP : 0;
      const deltaX =
        hasLeft && hasRight ? 0 : hasLeft ? -STEP : hasRight ? STEP : 0;

      if (deltaX === 0 && deltaZ === 0) return;
      updateTokenPositions(selectedSchemas, deltaX, deltaZ);
    }

    $(document).on("keydown keyup", (e) => {
      if (!isTokenWrapperActive()) return;
      if (isEditableTarget(e.target)) return;

      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight"
      )
        return;

      e.preventDefault();

      if (e.type === "keydown") {
        const selectedSchemas = getSelectedSchemas();
        if (!selectedSchemas.length) return;
        pressedKeys.add(e.key);
        applyMovementFromPressed(selectedSchemas);
      } else {
        pressedKeys.delete(e.key);
      }
    });
  } catch (error) {
    console.warn("N21: Error en feature Token Move Arrows:", error.message);
  }
})();
