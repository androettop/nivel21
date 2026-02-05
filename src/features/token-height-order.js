(() => {
  try {
    /* =======================
	       Feature: Token Height Order
	    ======================= */

    const { TokenManager } = window._n21_?.managers || {};

    const MIN_HEIGHT = 0.001;
    const MAX_HEIGHT = 10;
    const STEP = 0.5;

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
      if (e.key !== "PageUp" && e.key !== "PageDown") return;
      if (isEditableTarget(e.target)) return;

      e.preventDefault();
      const delta = e.key === "PageUp" ? STEP : -STEP;
      updateTokenHeights(delta);
    });
  } catch (error) {
    console.warn("N21: Error en feature Token Height Order:", error.message);
  }
})();
