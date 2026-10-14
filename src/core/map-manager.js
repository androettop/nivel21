(() => {
  /* =======================
       MapManager - Board map abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { loadManagers } = window._n21_ || {};

  /**
   * MapManager exposes the board map's geometry (the textured plane Nivel20
   * draws the map image on), abstracting the native mapManager.
   */
  class MapManager extends BaseManager {
    constructor() {
      super();
      this._appRootManager = null;
    }

    async init() {
      super.init();
      try {
        const [appRootManager] = await loadManagers("AppRootManager");
        this._appRootManager = appRootManager;
      } catch (error) {
        console.warn("N21: Failed to load AppRootManager:", error);
      }
    }

    _getNative() {
      return this._appRootManager?.getNativeManager("mapManager") || null;
    }

    isReady() {
      return !!this._appRootManager;
    }

    /**
     * World-space corners of the map (x/z on the board plane), following its
     * position, size and rotation. The map plane is a unit quad scaled by
     * Nivel20, so its local corners are (±0.5, 0, ±0.5).
     * @returns {Array<{x: number, z: number}>|null} 4 corners in order
     */
    getMapCorners() {
      const mapInstance = this._getNative()?.mapInstance;
      const entity =
        typeof mapInstance?.getWorldTransform === "function" ? mapInstance : mapInstance?.entity;
      const transform = entity?.getWorldTransform?.();
      if (!transform || typeof transform.transformPoint !== "function") return null;
      try {
        const Vec3 = entity.getPosition().constructor;
        return [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5],
        ].map(([lx, lz]) => {
          const p = transform.transformPoint(new Vec3(lx, 0, lz));
          return { x: p.x, z: p.z };
        });
      } catch (_error) {
        return null;
      }
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("MapManager", MapManager);
})();
