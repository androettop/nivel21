(async () => {
  try {
    /* =======================
	       Feature: Token Drag Measurement

	       While a token is dragged, an arrow goes from its center where the
	       drag started to its current center, with the distance in feet,
	       meters and grid units (Nivel20's "dnd-classic": the longest axis).
	       Right click while dragging fixes a waypoint and the arrow turns
	       there; the distance is the whole way. It looks like
	       Nivel20's measurement arrow (thinner), but it's our own drawing on
	       the overlay canvas, only on this screen: nothing is sent to the
	       room.

	       Movement preview (on by default, its own quick menu button): the
	       dragged token stays where it is and a translucent copy follows the
	       pointer, at the end of the arrow. Releasing moves the real token
	       through every waypoint; Escape cancels.
	    ======================= */

    const { loadManagers } = window._n21_;

    const SHOW_DISTANCE_SETTING = "token-drag-measurement.show-distance";
    const PREVIEW_SETTING = "token-drag-measurement.preview-move";
    const LAYER = "token-drag-measurement";
    // D&D: a square is 5 ft = 1,5 m.
    const FEET_PER_SQUARE = 5;
    const METERS_PER_FOOT = 0.3;
    const GHOST_ALPHA = 0.55;
    const MOVE_SPEED = 5; // Cells per second when the token walks the path

    const [
      TokenManager,
      CameraManager,
      TokenOverlayManager,
      MeasurementManager,
      SettingsManager,
      QuickMenuUIManager,
    ] = await loadManagers(
      "TokenManager",
      "CameraManager",
      "TokenOverlayManager",
      "MeasurementManager",
      "SettingsManager",
      "QuickMenuUIManager",
    );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.token-drag-measurement.enabled")) {
      return;
    }

    function isShowDistanceEnabled() {
      return SettingsManager.get(SHOW_DISTANCE_SETTING) !== false;
    }

    function isPreviewEnabled() {
      return SettingsManager.get(PREVIEW_SETTING) === true;
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

    QuickMenuUIManager.registerConnectedActionsToggle({
      id: "n21-token-move-preview-toggle",
      groupId: "nivel21",
      groupOrder: 10,
      actionOrder: 15,
      iconClass: "ft-eye",
      title: "Previsualizar el movimiento de tokens antes de moverlos",
      getState: () => isPreviewEnabled(),
      onToggle: (nextValue) => {
        SettingsManager.set(PREVIEW_SETTING, !!nextValue);
      },
    });

    SettingsManager.onChange((name) => {
      if (name === SHOW_DISTANCE_SETTING) {
        QuickMenuUIManager.refreshToggleState("n21-token-drag-measurement-toggle");
      } else if (name === PREVIEW_SETTING) {
        QuickMenuUIManager.refreshToggleState("n21-token-move-preview-toggle");
      }
    });

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

    /** Nivel20's "dnd-classic": the longest axis (diagonals count as one). */
    function squaresBetween(from, to) {
      return Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z));
    }

    /**
     * The distance lines, like Nivel20's measurement label: feet, meters and
     * grid units. The scene says what a square is worth (e.g. 5 "pies");
     * without it, a square is 5 ft.
     */
    function distanceLines(squares) {
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
    // 3/4 of Nivel20's arrow (its start / head images are 38x40 px).
    const SHAFT = 12;
    const START_RADIUS = 12.75;
    const HEAD_LENGTH = 25.5;
    const HEAD_HALF_WIDTH = 12.75;
    const OUTLINE_WIDTH = 2;
    const LABEL_FONT = '"Noto Sans Display", system-ui, sans-serif';

    /** Board point {x, z} on screen. */
    function toScreen(point) {
      return CameraManager.worldToScreen(point.x, point.z, point.y || 0);
    }

    /**
     * One arrow through screen points (start circle on the first, head on
     * the last, round turns in between). Returns false if too short.
     */
    function drawArrowShape(ctx, screenPoints) {
      // Drop points on top of the previous one (no direction there).
      const points = screenPoints.filter(
        (p, i) => i === 0 || Math.hypot(p.x - screenPoints[i - 1].x, p.y - screenPoints[i - 1].y) >= 1,
      );
      if (points.length < 2) return false;
      const a = points[0];
      const b = points[points.length - 1];
      const before = points[points.length - 2];
      const dx = b.x - before.x;
      const dy = b.y - before.y;
      const length = Math.hypot(dx, dy);
      if (points.length === 2 && length < 2) return false;
      const ux = dx / length;
      const uy = dy / length;
      const head = Math.min(HEAD_LENGTH, length * 0.6);
      const half = HEAD_HALF_WIDTH * (head / HEAD_LENGTH);
      const baseX = b.x - ux * head;
      const baseY = b.y - uy * head;

      // One silhouette: first every outline, then every fill, so the line
      // shows over the start circle, the turns and the head (no outline
      // across them).
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
        points.slice(1, -1).forEach((p) => ctx.lineTo(p.x, p.y));
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
      ctx.lineJoin = "round";
      shaft(FILL, SHAFT);
      return true;
    }

    const LABEL_GAP = 2;
    const labelSizes = (lines) => lines.map((_, i) => (i === 0 ? 20 : 15));
    const labelHeight = (lines) =>
      labelSizes(lines).reduce((sum, size) => sum + size, 0) + LABEL_GAP * (lines.length - 1);

    /**
     * Lowest y (overlay coordinates, CSS pixels) a label at x can reach
     * without going under the action bar or off the board.
     */
    function labelFloor(ctx, x) {
      const canvasRect = ctx.canvas.getBoundingClientRect();
      let floor = canvasRect.height;
      const clientX = canvasRect.left + x;
      document.querySelectorAll(".action-bar, .n21-tbar").forEach((bar) => {
        const rect = bar.getBoundingClientRect();
        if (!rect.height || clientX < rect.left || clientX > rect.right) return;
        floor = Math.min(floor, rect.top - canvasRect.top);
      });
      return floor;
    }

    /** Label lines centered on (x, y) or, with `top`, starting at y. */
    function drawLabel(ctx, lines, x, y, { top = false } = {}) {
      // The first line larger.
      const sizes = labelSizes(lines);
      const gap = LABEL_GAP;
      const blockHeight = labelHeight(lines);
      let lineY = top ? y : y - blockHeight / 2;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      lines.forEach((line, i) => {
        ctx.font = `700 ${sizes[i]}px ${LABEL_FONT}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = OUTLINE;
        ctx.strokeText(line, x, lineY);
        ctx.fillStyle = FILL;
        ctx.fillText(line, x, lineY);
        lineY += sizes[i] + gap;
      });
    }

    /* ----------------------- dragging ----------------------- */

    // The token drag going on: { networkId, starts: Map(networkId -> center),
    // offset, waypoints: [{x, z}], preview, target: {x, z}|null (where the
    // preview copy is), cancelled }.
    let drag = null;
    let lastBlockedRightClick = 0;

    const images = new Map(); // url -> HTMLImageElement
    function imageFor(url) {
      if (!url) return null;
      let image = images.get(url);
      if (!image) {
        image = new Image();
        image.src = url;
        images.set(url, image);
      }
      return image.complete && image.naturalWidth ? image : null;
    }

    /** A translucent copy of the token (round portrait, white border). */
    function drawGhost(ctx, helpers, networkId, center) {
      const scale = TokenManager.getTokenScale(networkId) || { x: 1, z: 1 };
      const ground = helpers.groundAt(center, scale);
      if (!ground) return;
      const { width, height } = ground;
      const radius = Math.min(width, height) / 2;
      const border = Math.max(2, radius * 0.07);
      ctx.save();
      ground.apply(ctx);
      ctx.globalAlpha = GHOST_ALPHA;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius - border / 2, 0, Math.PI * 2);
      const image = imageFor(TokenManager.getTokenImageUrl(networkId));
      if (image) {
        ctx.save();
        ctx.clip();
        // Cover the circle, like the token's portrait.
        const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const w = image.naturalWidth * cover;
        const h = image.naturalHeight * cover;
        ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = "#808080";
        ctx.fill();
      }
      ctx.lineWidth = border;
      ctx.strokeStyle = FILL;
      ctx.stroke();
      ctx.restore();
    }

    /** Where the dragged token is (or would be, with the preview). */
    function currentTarget() {
      if (drag.preview) return drag.target;
      const position = TokenManager.getTokenPosition(drag.networkId);
      return position ? { x: position.x, z: position.z } : null;
    }

    function drawDrag(ctx, helpers) {
      if (!drag || drag.cancelled) return;
      const start = drag.starts.get(drag.networkId);
      const target = currentTarget();
      if (!start || !target) return;
      if (!hasPositionChanged(start, target) && !drag.waypoints.length) return;

      const showDistance = isShowDistanceEnabled();
      const points = [start, ...drag.waypoints, target];
      if (showDistance) {
        const screenPoints = points.map(toScreen);
        if (screenPoints.every(Boolean)) drawArrowShape(ctx, screenPoints);
      }

      // The other selected tokens move by the same amount.
      if (drag.preview) {
        const delta = { x: target.x - start.x, z: target.z - start.z };
        drag.starts.forEach((from, networkId) => {
          drawGhost(ctx, helpers, networkId, { x: from.x + delta.x, z: from.z + delta.z });
        });
      }

      if (!showDistance) return;

      // Only the whole way, under the token.
      let squares = 0;
      for (let i = 1; i < points.length; i++) squares += squaresBetween(points[i - 1], points[i]);
      const half = Math.abs(TokenManager.getTokenScale(drag.networkId)?.z || 1) / 2;
      const center = toScreen(target);
      const bottom = toScreen({ x: target.x, z: target.z + half });
      if (center && bottom) {
        const lines = distanceLines(squares);
        const radius = Math.hypot(bottom.x - center.x, bottom.y - center.y);
        let y = center.y + radius + 6;
        // Above the token when the action bar (or the edge) would cover it.
        if (y + labelHeight(lines) > labelFloor(ctx, center.x)) y = center.y - radius - 6 - labelHeight(lines);
        drawLabel(ctx, lines, center.x, y, { top: true });
      }
    }

    function endDrag() {
      drag = null;
      TokenOverlayManager.removeLayer(LAYER);
    }

    function cancelPreview() {
      // Keep holding the drag (the token stays) until the button is released.
      drag.cancelled = true;
      TokenOverlayManager.removeLayer(LAYER);
    }

    function addWaypoint() {
      if (!drag || drag.cancelled) return;
      const target = currentTarget();
      const last = drag.waypoints[drag.waypoints.length - 1] || drag.starts.get(drag.networkId);
      if (!target || !hasPositionChanged(last, target)) return;
      drag.waypoints.push(target);
    }

    function finishDrag() {
      const finished = drag;
      endDrag();
      if (!finished?.preview || finished.cancelled || !finished.target) return;
      const start = finished.starts.get(finished.networkId);
      const path = [...finished.waypoints, finished.target];
      if (!path.some((point) => hasPositionChanged(start, point))) return;
      // After Nivel20 ends its own drag (this runs before its mouseup).
      setTimeout(() => CameraManager.moveTokenAlongPath(finished.networkId, path, { speed: MOVE_SPEED }), 0);
    }

    CameraManager.setTokenDragHandler((info) => {
      if (!drag) {
        if (!info.networkId) return false;
        const starts = new Map();
        info.networkIds.forEach((networkId) => {
          const position = TokenManager.getTokenPosition(networkId);
          if (position) starts.set(networkId, { x: position.x, z: position.z });
        });
        if (!starts.has(info.networkId)) return false;
        drag = {
          networkId: info.networkId,
          starts,
          offset: info.offset,
          waypoints: [],
          preview: isPreviewEnabled(),
          target: null,
          cancelled: false,
        };
        TokenOverlayManager.addLayer(LAYER, drawDrag, 30);
      }
      if (!drag.preview) return false;
      if (!drag.cancelled) {
        const point = CameraManager.screenToWorld(info.screenX, info.screenY, 0);
        if (point) drag.target = { x: point.x + drag.offset.x, z: point.z + drag.offset.z };
      }
      return true;
    });

    // Right click (waypoint) and Escape (cancel the preview) are ours while
    // dragging: Nivel20 must not see them (a right click would end its drag).
    function block(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    window.addEventListener(
      "mousedown",
      (event) => {
        if (!drag || event.button !== 2) return;
        block(event);
        lastBlockedRightClick = Date.now();
        addWaypoint();
      },
      true,
    );

    window.addEventListener(
      "mouseup",
      (event) => {
        if (!drag) return;
        if (event.button === 2) {
          block(event);
          lastBlockedRightClick = Date.now();
        } else if (event.button === 0) {
          finishDrag();
        }
      },
      true,
    );

    ["pointerdown", "pointerup"].forEach((type) => {
      window.addEventListener(
        type,
        (event) => {
          if (drag && event.button === 2) block(event);
        },
        true,
      );
    });

    window.addEventListener(
      "contextmenu",
      (event) => {
        if (drag || Date.now() - lastBlockedRightClick < 500) block(event);
      },
      true,
    );

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || !drag?.preview || drag.cancelled) return;
        block(event);
        cancelPreview();
      },
      true,
    );

    window.addEventListener("touchend", () => finishDrag(), true);
    window.addEventListener("touchcancel", () => endDrag(), true);
    window.addEventListener("blur", () => endDrag());
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Drag Measurement", error);
  }
})();
