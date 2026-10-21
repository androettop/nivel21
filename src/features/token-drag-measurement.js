(async () => {
  try {
    /* =======================
	       Feature: Token Drag Measurement

	       While a token is dragged, an arrow goes from its center where the
	       drag started to its current center, with the distance in feet,
	       meters and grid units (Nivel20's "dnd-classic": the longest axis).
	       It looks like Nivel20's measurement arrow (thinner), but it's our
	       own drawing on the overlay canvas, only on this screen: nothing is
	       sent to the room.
	    ======================= */

    const { loadManagers } = window._n21_;

    const SHOW_DISTANCE_SETTING = "token-drag-measurement.show-distance";
    const LAYER = "token-drag-measurement";
    // D&D: a square is 5 ft = 1,5 m.
    const FEET_PER_SQUARE = 5;
    const METERS_PER_FOOT = 0.3;

    const [
      TokenManager,
      CameraManager,
      TokenOverlayManager,
      MeasurementManager,
      NetworkManager,
      SettingsManager,
      QuickMenuUIManager,
    ] = await loadManagers(
      "TokenManager",
      "CameraManager",
      "TokenOverlayManager",
      "MeasurementManager",
      "NetworkManager",
      "SettingsManager",
      "QuickMenuUIManager",
    );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.token-drag-measurement.enabled")) {
      return;
    }

    let draggedTokenNetworkId = null; // The token being dragged
    let dragStartPosition = null; // its center when grabbed {x, y, z}
    let arrowShown = false;

    function isShowDistanceEnabled() {
      return SettingsManager.get(SHOW_DISTANCE_SETTING) !== false;
    }

    QuickMenuUIManager.registerConnectedActionsToggle({
      id: "n21-token-drag-measurement-toggle",
      groupId: "nivel21",
      groupOrder: 10,
      actionOrder: 10,
      iconClass: "icon-custom-ruler",
      title: "Mostrar/Ocultar distancia al mover token",
      getState: () => isShowDistanceEnabled(),
      onToggle: (nextValue) => {
        SettingsManager.set(SHOW_DISTANCE_SETTING, !!nextValue);
      },
    });

    SettingsManager.onChange((name) => {
      if (name !== SHOW_DISTANCE_SETTING) return;
      QuickMenuUIManager.refreshToggleState("n21-token-drag-measurement-toggle");
      if (!isShowDistanceEnabled()) hideArrow();
    });

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

    /** One decimal, like Nivel20's measurements ("7.5", "10"). */
    function formatNumber(value) {
      return String(Math.round(value * 10) / 10);
    }

    /**
     * The distance lines, like Nivel20's measurement label: feet, meters and
     * grid units. The scene says what a square is worth (e.g. 5 "pies");
     * without it, a square is 5 ft.
     */
    function distanceLines(from, to) {
      // Nivel20's "dnd-classic": the longest axis (diagonals count as one).
      const squares = Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z));
      const { units, unitScale } = MeasurementManager.getSceneUnits();
      let feet = squares * FEET_PER_SQUARE;
      if (units && unitScale) {
        const amount = squares * unitScale;
        if (/^m(etros?)?\.?$/i.test(units.trim())) feet = amount / METERS_PER_FOOT;
        else if (/^(pies?|ft|feet)\.?$/i.test(units.trim())) feet = amount;
      }
      return [
        `${formatNumber(feet)} PIES`,
        `${formatNumber(feet * METERS_PER_FOOT)} M`,
        `${formatNumber(squares)} UD.`,
      ];
    }

    /* ----------------------- drawing ----------------------- */

    // Nivel20's measurement arrow (white, thin black outline, round start,
    // triangular head), and its label: white text with a black outline.
    const FILL = "#ffffff";
    const OUTLINE = "#000000";
    // Same size as Nivel20's arrow (its start / head images are 38x40 px).
    const SHAFT = 16;
    const START_RADIUS = 17;
    const HEAD_LENGTH = 34;
    const HEAD_HALF_WIDTH = 17;
    const OUTLINE_WIDTH = 2.5;
    const LABEL_FONT = '"Noto Sans Display", system-ui, sans-serif';

    function drawArrow(ctx) {
      if (!draggedTokenNetworkId || !dragStartPosition) return;
      const current = TokenManager.getTokenPosition(draggedTokenNetworkId);
      if (!current) return;
      const a = CameraManager.worldToScreen(dragStartPosition.x, dragStartPosition.z, dragStartPosition.y || 0);
      const b = CameraManager.worldToScreen(current.x, current.z, current.y || 0);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 2) return;
      const ux = dx / length;
      const uy = dy / length;
      const head = Math.min(HEAD_LENGTH, length * 0.6);
      const half = HEAD_HALF_WIDTH * (head / HEAD_LENGTH);
      const baseX = b.x - ux * head;
      const baseY = b.y - uy * head;

      // One silhouette: first every outline, then every fill, so the line
      // shows over the start circle and the head (no outline across it).
      const headPath = () => {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(baseX - uy * half, baseY + ux * half);
        ctx.lineTo(baseX + uy * half, baseY - ux * half);
        ctx.closePath();
      };
      // The line goes a bit into the head, so they join without a seam.
      const shaftEndX = baseX + ux * Math.min(4, head / 2);
      const shaftEndY = baseY + uy * Math.min(4, head / 2);
      const shaft = (color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();
      };

      ctx.lineJoin = "round";
      ctx.lineCap = "butt";

      // Outlines.
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.arc(a.x, a.y, START_RADIUS + OUTLINE_WIDTH, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = OUTLINE_WIDTH * 2;
      headPath();
      ctx.stroke();
      shaft(OUTLINE, SHAFT + OUTLINE_WIDTH * 2);

      // Fills.
      ctx.fillStyle = FILL;
      ctx.beginPath();
      ctx.arc(a.x, a.y, START_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      headPath();
      ctx.fill();
      shaft(FILL, SHAFT);

      // Label centered on the middle of the arrow: the first line larger.
      const lines = distanceLines(dragStartPosition, current);
      const sizes = lines.map((_, i) => (i === 0 ? 20 : 15));
      const gap = 2;
      const blockHeight = sizes.reduce((sum, size) => sum + size, 0) + gap * (lines.length - 1);
      const midX = (a.x + b.x) / 2;
      let y = (a.y + b.y) / 2 - blockHeight / 2;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      lines.forEach((line, i) => {
        ctx.font = `700 ${sizes[i]}px ${LABEL_FONT}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = OUTLINE;
        ctx.strokeText(line, midX, y);
        ctx.fillStyle = FILL;
        ctx.fillText(line, midX, y);
        y += sizes[i] + gap;
      });
    }

    function showArrow() {
      if (arrowShown) return;
      arrowShown = true;
      TokenOverlayManager.addLayer(LAYER, drawArrow, 30);
    }

    function hideArrow() {
      if (!arrowShown) return;
      arrowShown = false;
      TokenOverlayManager.removeLayer(LAYER);
    }

    /* ----------------------- dragging ----------------------- */

    // The arrow shows once the grabbed token actually moves.
    NetworkManager.on("transform:update", (data) => {
      if (!draggedTokenNetworkId || data?.networkId !== draggedTokenNetworkId) return;
      if (!isShowDistanceEnabled() || arrowShown) return;
      const position = TokenManager.getTokenPosition(draggedTokenNetworkId);
      if (hasPositionChanged(dragStartPosition, position)) showArrow();
    });

    $(document).on("mousedown", "canvas", (e) => {
      hideArrow();
      draggedTokenNetworkId = null;
      dragStartPosition = null;

      // Get canvas-relative coordinates
      const canvasCoords = getCanvasRelativeCoords(e);
      if (!canvasCoords) return;

      // Raycast to find token under mouse
      const raycastResult = CameraManager.rayCast(canvasCoords.x, canvasCoords.y);
      if (raycastResult?.entity?.name !== "Token") return;

      const networkId = raycastResult.entity.script?.networkId?.networkId;
      const position = networkId ? TokenManager.getTokenPosition(networkId) : null;
      if (!position) return;
      draggedTokenNetworkId = networkId;
      dragStartPosition = { x: position.x, y: position.y, z: position.z };
    });

    $(document).on("mouseup", () => {
      hideArrow();
      draggedTokenNetworkId = null;
      dragStartPosition = null;
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Drag Measurement", error);
  }
})();
