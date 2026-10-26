(async () => {
  try {
    /* =======================
         Feature: Token Move Arrows

         The arrow keys move the selected tokens as if they were dragged:
         Nivel20 moves them, so walls stop them just like with the mouse
         (players can't go through), and they're synced to the room.
      ======================= */

    const { loadManagers } = window._n21_;
    const [SettingsManager, TokenManager, CameraManager] = await loadManagers(
      "SettingsManager",
      "TokenManager",
      "CameraManager",
    );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.token-move-arrows.enabled")) {
      return;
    }

    const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    const MOVE_SPEED = 20; // Cells per second
    // Two arrows pressed together (diagonal) rarely land at the same time:
    // wait this long for the second one before stepping.
    const COMBINE_MS = 60;

    function getMovementStep() {
      const configured = Number(SettingsManager.get("token-move.step"));
      if (!Number.isFinite(configured)) return 1;
      return Math.max(0.1, configured);
    }

    function isEditableTarget(target) {
      return (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      );
    }

    const pressedKeys = new Set();
    let moving = false;
    let again = false; // An arrow was pressed during the step
    let combineTimer = null;

    function movementFromPressed() {
      const step = getMovementStep();
      const hasUp = pressedKeys.has("ArrowUp");
      const hasDown = pressedKeys.has("ArrowDown");
      const hasLeft = pressedKeys.has("ArrowLeft");
      const hasRight = pressedKeys.has("ArrowRight");
      return {
        x: hasLeft && hasRight ? 0 : hasLeft ? -step : hasRight ? step : 0,
        z: hasUp && hasDown ? 0 : hasUp ? -step : hasDown ? step : 0,
      };
    }

    /**
     * With whole-cell steps, land on a cell: its center (x.5) for tokens of
     * odd size, a grid corner for even ones, like Nivel20's snap.
     */
    function snapToCell(networkId, point) {
      if (!Number.isInteger(getMovementStep())) return point;
      const size = Math.max(1, Math.round(Math.abs(TokenManager.getTokenScale(networkId)?.x || 1)));
      const snap = size % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
      return { x: snap(point.x), z: snap(point.z) };
    }

    async function move() {
      if (moving) {
        again = true;
        return;
      }
      again = false;
      const delta = movementFromPressed();
      if (!delta.x && !delta.z) return;
      // Nivel20 moves the rest of the selection with the grabbed token.
      const networkId = TokenManager.getSelectedTokenIds().find((id) =>
        TokenManager.isTokenSelectable(id),
      );
      const position = networkId && TokenManager.getTokenPosition(networkId);
      if (!position) return;
      moving = true;
      try {
        await CameraManager.moveTokenAlongPath(
          networkId,
          [snapToCell(networkId, { x: position.x + delta.x, z: position.z + delta.z })],
          { speed: MOVE_SPEED },
        );
      } finally {
        moving = false;
      }
      // Keys still held after the step: keep going.
      if (again && pressedKeys.size) move();
    }

    document.addEventListener("keydown", (e) => {
      if (!ARROWS.includes(e.key) || isEditableTarget(e.target)) return;
      if (!TokenManager.getSelectedTokenIds().length) return;
      e.preventDefault();
      pressedKeys.add(e.key);
      if (moving) {
        again = true;
        return;
      }
      if (!combineTimer) {
        combineTimer = setTimeout(() => {
          combineTimer = null;
          move();
        }, COMBINE_MS);
      }
    });

    document.addEventListener("keyup", (e) => {
      pressedKeys.delete(e.key);
    });

    window.addEventListener("blur", () => pressedKeys.clear());
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Move Arrows", error);
  }
})();
