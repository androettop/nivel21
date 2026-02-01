(() => {
  try {
    /* =======================
	       Feature: Snap to Grid
	    ======================= */

    const { state, getManager } = window._n21_;

    let isDragging = false;
    let dragStarted = false;
    let capturedNetworkIds = new Set();
    let hookInstalled = false;

    function installHook() {
      if (hookInstalled) return true;

      const root = window.app?.root;
      if (!root || typeof root.find !== "function") return false;

      const found = root.find((e) => e && e.name === "Game Manager");
      const gameManager = Array.isArray(found) ? found[0] : found;
      if (!gameManager?.script?.networkManager?.room?.send) return false;

      const roomProto = gameManager.script.networkManager.room.__proto__;
      if (!roomProto?.send) return false;

      const originalSend = roomProto.send;

      roomProto.send = function (event, data, ...args) {
        if (
          event === "transform:update" &&
          isDragging &&
          dragStarted &&
          data?.networkId?.includes("TOKEN")
        ) {
          capturedNetworkIds.add(data.networkId);
        }
        return originalSend.call(this, event, data, ...args);
      };

      hookInstalled = true;
      return true;
    }

    // Instalar hook con polling
    const hookCheckInterval = setInterval(() => {
      if (installHook()) clearInterval(hookCheckInterval);
    }, 500);

    setTimeout(() => clearInterval(hookCheckInterval), 15000);

    $(document).on("mousedown", "canvas", () => {
      isDragging = true;
      dragStarted = false;
      capturedNetworkIds.clear();
    });

    $(document).on("mousemove", () => {
      if (isDragging) dragStarted = true;
    });

    $(document).on("mouseup", () => {
      if (isDragging && dragStarted && state.shift) {
        setTimeout(snapSelectedTokens, 10);
      }
      isDragging = false;
      dragStarted = false;
    });

    function snapSelectedTokens() {
      if (capturedNetworkIds.size === 0) return;

      const tokenManager = getManager("tokenManager");
      if (!tokenManager?.entityManager?.instances) return;

      capturedNetworkIds.forEach((networkId) => {
        const token = tokenManager.entityManager.instances.get(networkId);
        if (!token?.localScale || !token?.position) return;

        const gridStepX = (token.localScale.x || 1) / 2;
        const gridStepZ = (token.localScale.z || 1) / 2;

        const snapToGrid = (value, gridStep) =>
          typeof value === "number"
            ? Math.round(value / gridStep) * gridStep
            : value;

        const snappedX = snapToGrid(token.position.x, gridStepX);
        const snappedZ = snapToGrid(token.position.z, gridStepZ);

        if (snappedX !== token.position.x || snappedZ !== token.position.z) {
          tokenManager.entityManager.requestUpdate({
            networkId,
            position: {
              x: snappedX,
              y: token.position.y,
              z: snappedZ,
            },
          });
        }
      });

      capturedNetworkIds.clear();
    }
  } catch (error) {
    console.warn("N21: Error en feature Snap to Grid:", error.message);
  }
})();
