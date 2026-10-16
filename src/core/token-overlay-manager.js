(() => {
  /* =======================
       TokenOverlayManager - 2D drawing layer over the board canvas
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { loadManagers } = window._n21_ || {};

  const OVERLAY_ID = "n21-token-overlay";

  /**
   * TokenOverlayManager owns a transparent 2D canvas placed over Nivel20's
   * board canvas. Features register drawing layers (health bars, status
   * icons...) and get, every frame, a context plus helpers to locate tokens
   * on screen. The loop only runs while at least one layer is registered and
   * the tab is visible.
   */
  class TokenOverlayManager extends BaseManager {
    constructor() {
      super();
      this._layers = new Map(); // name -> { draw, order }
      this._frame = null;
      this._tokenManager = null;
      this._cameraManager = null;
    }

    async init() {
      super.init();
      try {
        const [TokenManager, CameraManager] = await loadManagers(
          "TokenManager",
          "CameraManager",
        );
        this._tokenManager = TokenManager;
        this._cameraManager = CameraManager;
      } catch (error) {
        console.warn("[TokenOverlayManager] Failed to load managers:", error);
      }
      document.addEventListener("visibilitychange", () => this._ensureLoop());
    }

    isReady() {
      return !!this._tokenManager && !!this._cameraManager;
    }

    /**
     * Register (or replace) a drawing layer.
     * @param {string} name
     * @param {Function} draw - (ctx, helpers) => void; helpers has
     *   rectOf(networkId), width, height, pixelRatio
     * @param {number} [order=0] - Lower layers draw first
     */
    addLayer(name, draw, order = 0) {
      if (!name || typeof draw !== "function") return;
      this._layers.set(name, { draw, order });
      this._ensureLoop();
    }

    removeLayer(name) {
      this._layers.delete(name);
      if (!this._layers.size) this._clear();
    }

    _getCanvas() {
      const appCanvas = document.querySelector("#application-canvas");
      if (!appCanvas?.parentElement) return null;
      let canvas = document.getElementById(OVERLAY_ID);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = OVERLAY_ID;
        canvas.className = "n21-token-overlay";
      }
      if (canvas.previousElementSibling !== appCanvas) {
        appCanvas.insertAdjacentElement("afterend", canvas);
      }
      return canvas;
    }

    _clear() {
      const canvas = document.getElementById(OVERLAY_ID);
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }

    _ensureLoop() {
      if (this._frame !== null) return;
      if (!this._layers.size || document.hidden) return;
      this._frame = requestAnimationFrame(() => this._tick());
    }

    _tick() {
      this._frame = null;
      if (!this._layers.size || document.hidden) return;

      const canvas = this._getCanvas();
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const width = Math.round(rect.width * ratio);
        const height = Math.round(rect.height * ratio);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        const helpers = {
          width: rect.width,
          height: rect.height,
          pixelRatio: ratio,
          rectOf: (networkId) =>
            this._tokenManager.getTokenScreenRect(networkId, this._cameraManager),
          // The token's footprint as it is laid on the board: draw in a
          // top-down box of `width` x `height` px after `apply(ctx)`, and it
          // follows the camera tilt and rotation (identity in plain 2D).
          groundOf: (networkId) => {
            const pos = this._tokenManager.getTokenPosition(networkId);
            if (!pos) return null;
            const scale = this._tokenManager.getTokenScale(networkId) || { x: 1, z: 1 };
            const halfX = Math.abs(scale.x || 1) / 2;
            const halfZ = Math.abs(scale.z || 1) / 2;
            const ground = this._cameraManager.getGroundAffine(pos.x - halfX, pos.z - halfZ);
            const basis = this._cameraManager.getGroundBasis(pos.x, pos.z);
            if (!ground || !basis) return null;
            const [a, b, c, d] = ground.matrix;
            return {
              width: halfX * 2 * basis.scale,
              height: halfZ * 2 * basis.scale,
              origin: ground.origin,
              apply: (ctx) => ctx.transform(a, b, c, d, ground.origin.x, ground.origin.y),
            };
          },
        };

        [...this._layers.entries()]
          .sort((a, b) => a[1].order - b[1].order)
          .forEach(([name, layer]) => {
            ctx.save();
            try {
              layer.draw(ctx, helpers);
            } catch (error) {
              console.warn(`[TokenOverlayManager] Layer "${name}" failed:`, error);
            }
            ctx.restore();
          });
      }

      this._ensureLoop();
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("TokenOverlayManager", TokenOverlayManager);
})();
