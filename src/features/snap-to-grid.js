(async () => {
  try {
    /* =======================
	       Feature: Snap to Grid
	    ======================= */

    const { loadManagers } = window._n21_;

    const [TokenManager, KeyModifiersManager, NetworkManager] = await loadManagers(
      "TokenManager",
      "KeyModifiersManager",
      "NetworkManager",
    );

    let isDragging = false;
    let dragStarted = false;
    let capturedNetworkIds = new Set();

    // Subscribe to token transform updates
    NetworkManager.on("transform:update", (data) => {
      if (
        isDragging &&
        dragStarted &&
        data?.networkId?.includes("TOKEN")
      ) {
        capturedNetworkIds.add(data.networkId);
      }
    });

    $(document).on("mousedown", "canvas", () => {
      isDragging = true;
      dragStarted = false;
      capturedNetworkIds.clear();
    });

    $(document).on("mousemove", () => {
      if (isDragging) dragStarted = true;
    });

    $(document).on("mouseup", () => {
      if (isDragging && dragStarted && KeyModifiersManager.getState().shift) {
        setTimeout(snapSelectedTokens, 10);
      }
      isDragging = false;
      dragStarted = false;
    });

    function snapSelectedTokens() {
      if (capturedNetworkIds.size === 0) return;

      capturedNetworkIds.forEach((networkId) => {
        const token = TokenManager.getToken(networkId);
        if (!token?.localScale || !token?.position) return;

        const gridSize = 1;
        const scaleX = token.localScale.x || 1;
        const scaleZ = token.localScale.z || 1;

        const snapToGrid = (value, scale) => {
          if (typeof value !== "number") return value;

          const clampedScale = typeof scale === "number" && scale > 0 ? scale : 1;
          const offset = clampedScale <= 1 ? 0.5 : clampedScale / 2;

          return Math.round((value - offset) / gridSize) * gridSize + offset;
        };

        const snappedX = snapToGrid(token.position.x, scaleX);
        const snappedZ = snapToGrid(token.position.z, scaleZ);

        if (snappedX !== token.position.x || snappedZ !== token.position.z) {
          TokenManager.updatePosition(networkId, {
            x: snappedX,
            y: token.position.y,
            z: snappedZ,
          });
        }
      });

      capturedNetworkIds.clear();
    }
  } catch (error) {
    console.warn("N21: Error en feature Snap to Grid:", error.message);
  }
})();
