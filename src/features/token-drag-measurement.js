(async () => {
  try {
    /* =======================
	       Feature: Token Drag Measurement
	    ======================= */

    const { loadManagers } = window._n21_;

    const [TokenManager, MeasurementManager, CameraManager, NetworkManager] =
      await loadManagers(
        "TokenManager",
        "MeasurementManager",
        "CameraManager",
        "NetworkManager",
      );

    let isDragging = false;
    let draggedTokenNetworkId = null; // The token being dragged
    let dragStartPosition = null; // {x, y, z}
    let dragStartCanvasCoords = null; // {x, y}
    let tokenPositionChanged = false; // Track if token position actually changed
    let measurementStarted = false;
    let previousShapeConfig = null;
    let mouseDownEvent = null;

    /**
     * Convert mouse event coordinates to canvas-relative coordinates
     * @param {MouseEvent} event - The mouse event
     * @returns {Object|null} Canvas-relative coordinates {x, y} or null if canvas not found
     */
    function getCanvasRelativeCoords(event) {
      const canvas = event.target;
      if (!canvas || canvas.tagName !== "CANVAS") return null;

      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    }

    /**
     * Check if position changed (ignoring Y axis)
     * @param {Object} pos1 - First position {x, y, z}
     * @param {Object} pos2 - Second position {x, y, z}
     * @returns {boolean} True if positions are different
     */
    function hasPositionChanged(pos1, pos2) {
      if (!pos1 || !pos2) return false;
      
      const threshold = 0.001; // Small threshold for floating point comparison
      return (
        Math.abs(pos1.x - pos2.x) > threshold ||
        Math.abs(pos1.z - pos2.z) > threshold
      );
    }

    // Subscribe to token transform updates
    NetworkManager.on("transform:update", (data) => {
      if (
        isDragging &&
        data?.networkId?.includes("TOKEN") &&
        data.networkId === draggedTokenNetworkId
      ) {
        // Check if token position actually changed
        const token = TokenManager.getToken(draggedTokenNetworkId);
        if (token?.position && dragStartPosition) {
          tokenPositionChanged = hasPositionChanged(
            dragStartPosition,
            token.position
          );
        }

        if (tokenPositionChanged && !measurementStarted && dragStartCanvasCoords) {
          measurementStarted = true;
          previousShapeConfig = MeasurementManager.getShapeConfig();

          MeasurementManager.setShapeConfig({
            shape: "none",
            visibility: "private",
            color: "FAFAFA",
          });

          MeasurementManager.setActive(true);
          if (mouseDownEvent) {
            const buttonsMask = mouseDownEvent.buttons || 0;
            const buttons = [
              (buttonsMask & 1) === 1,
              (buttonsMask & 2) === 2,
              (buttonsMask & 4) === 4,
            ];

            MeasurementManager.triggerMouseDown({
              x: dragStartCanvasCoords.x,
              y: dragStartCanvasCoords.y,
              dx: 0,
              dy: 0,
              button: mouseDownEvent.button ?? 0,
              wheelDelta: mouseDownEvent.wheelDelta || 0,
              ctrlKey: !!mouseDownEvent.ctrlKey,
              altKey: !!mouseDownEvent.altKey,
              shiftKey: !!mouseDownEvent.shiftKey,
              metaKey: !!mouseDownEvent.metaKey,
              buttons,
              element: mouseDownEvent.target || {},
              event: mouseDownEvent,
            });
          }
        }
      }
    });

    $(document).on("mousedown", "canvas", (e) => {
      isDragging = true;
      draggedTokenNetworkId = null;
      dragStartPosition = null;
      dragStartCanvasCoords = null;
      tokenPositionChanged = false;
      measurementStarted = false;
      previousShapeConfig = null;
      mouseDownEvent = null;

      mouseDownEvent = e;

      // Get canvas-relative coordinates
      const canvasCoords = getCanvasRelativeCoords(e);
      if (!canvasCoords) return;

      // Raycast to find token under mouse
      const raycastResult = CameraManager.rayCast(canvasCoords.x, canvasCoords.y);
      
      if (raycastResult?.entity?.name === "Token") {
        const token = raycastResult.entity;
        const networkId = token.script?.networkId?.networkId;
        
        if (networkId && token.getLocalPosition) {
          draggedTokenNetworkId = networkId;
          dragStartCanvasCoords = canvasCoords;
          const localPos = token.getLocalPosition();
          dragStartPosition = {
            x: localPos.x,
            y: localPos.y,
            z: localPos.z,
          };
        }
      }
    });

    $(document).on("mouseup", () => {
      if (measurementStarted) {
        MeasurementManager.setActive(false);
        if (previousShapeConfig) {
          MeasurementManager.setShapeConfig(previousShapeConfig);
        }
      }

      isDragging = false;
      draggedTokenNetworkId = null;
      dragStartPosition = null;
      dragStartCanvasCoords = null;
      tokenPositionChanged = false;
      measurementStarted = false;
      previousShapeConfig = null;
    });
  } catch (error) {
    console.warn("N21: Error en feature Token Drag Measurement:", error.message);
  }
})();
