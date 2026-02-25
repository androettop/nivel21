(() => {
  /* =======================
       MeasurementManager - Global measurement abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { loadManagers } = window._n21_ || {};

  /**
   * MeasurementManager provides a unified interface for managing measurements
   * Abstracts the native measurementManager from nivel20
   */
  class MeasurementManager extends BaseManager {
    constructor() {
      super();
      this._appRootManager = null;
    }

    /**
     * Initialize the manager - wait for AppRootManager to be ready
     */
    async init() {
      super.init();
      try {
        const [appRootManager] = await loadManagers("AppRootManager");
        this._appRootManager = appRootManager;
      } catch (error) {
        console.warn("N21: Failed to load AppRootManager:", error);
      }
    }

    /**
     * Get the native measurementManager instance
     * @returns {Object|null} The native measurementManager or null if not available
     */
    _getNative() {
      return this._appRootManager?.getNativeManager("measurementManager") || null;
    }

    /**
     * Get the entity manager from the native measurementManager
     * @returns {Object|null} The entityManager or null if not available
     */
    getEntityManager() {
      return this._getNative()?.entityManager || null;
    }

    /**
     * Check if the native measurement manager is active
     * @returns {boolean} True if active
     */
    isActive() {
      return this._getNative()?.active === true;
    }

    /**
     * Set active state on the native measurement manager
     * @param {boolean} active - Whether to activate the manager
     * @returns {boolean} True if the state was applied
     */
    setActive(active) {
      const native = this._getNative();
      if (!native || typeof native.setActive !== "function") return false;

      native.setActive(!!active);
      return true;
    }

    /**
     * Get the current shape configuration from the native manager
     * @returns {Object|null} The shape config or null if unavailable
     */
    getShapeConfig() {
      const native = this._getNative();
      if (!native?.shapeConfig) return null;

      return { ...native.shapeConfig };
    }

    /**
     * Set the shape configuration on the native manager
     * @param {Object} config - Shape configuration
     * @returns {boolean} True if the config was applied
     */
    setShapeConfig(config, partial = true) {
      const native = this._getNative();
      if (!native || typeof native.setShapeConfig !== "function") return false;

      if (partial) {
        native.setShapeConfig({ ...native.shapeConfig, ...config });
      } else {
        native.setShapeConfig(config);
      }
      return true;
    }

    /**
     * Trigger the native onMouseDown handler with a full event-like payload
     * @param {Object} data - Mouse data with canvas-relative coordinates
     * @returns {boolean} True if the handler was called
     */
    triggerMouseDown(data) {
      const native = this._getNative();
      if (!native || typeof native.onMouseDown !== "function") return false;

      if (!data || typeof data.x !== "number" || typeof data.y !== "number") {
        return false;
      }

      const payload = {
        x: data.x,
        y: data.y,
        dx: data.dx ?? 0,
        dy: data.dy ?? 0,
        button: data.button ?? 0,
        wheelDelta: data.wheelDelta ?? 0,
        ctrlKey: !!data.ctrlKey,
        altKey: !!data.altKey,
        shiftKey: !!data.shiftKey,
        metaKey: !!data.metaKey,
        buttons: Array.isArray(data.buttons) ? data.buttons : [true, false, false],
        element: data.element || {},
        event: data.event || null,
      };

      native.onMouseDown(payload);
      return true;
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the manager and entityManager are available
     */
    isReady() {
      return this.getEntityManager() !== null;
    }

    /**
     * Remove measurements owned by the current player
     * @returns {number} Number of measurements removed
     */
    removeOwnedMeasurements() {
      const native = this._getNative();
      if (!native || typeof native.removeOwnedMeasurements !== "function")
        return 0;

      native.removeOwnedMeasurements();
      return 1;
    }
  }

  // Register MeasurementManager
  const { registerManager } = window._n21_.utils;
  registerManager("MeasurementManager", MeasurementManager);
})();
