(() => {
  /* =======================
       MeasurementManager - Global measurement abstraction
    ======================= */

  const { getNativeManager } = window._n21_?.utils || {};
  const { BaseManager } = window._n21_?.managers || {};

  /**
   * MeasurementManager provides a unified interface for managing measurements
   * Abstracts the native measurementManager from nivel20
   */
  class MeasurementManager extends BaseManager {
    /**
     * Get the native measurementManager instance
     * @returns {Object|null} The native measurementManager or null if not available
     */
    _getNative() {
      return getNativeManager("measurementManager");
    }

    /**
     * Get the entity manager from the native measurementManager
     * @returns {Object|null} The entityManager or null if not available
     */
    getEntityManager() {
      return this._getNative()?.entityManager || null;
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the manager and entityManager are available
     */
    isReady() {
      return this.getEntityManager() !== null;
    }
  }

  // Expose MeasurementManager globally
  window._n21_.managers = window._n21_.managers || {};
  window._n21_.managers.MeasurementManager = new MeasurementManager();
})();
