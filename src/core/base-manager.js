(() => {
  /* =======================
       BaseManager - Base class for all managers
    ======================= */

  /**
   * BaseManager provides common functionality for all managers
   * All manager classes should extend this base class
   */
  class BaseManager {
    /**
     * Initialize the manager
     * Override this method in subclasses for async initialization
     * @returns {Promise<void>}
     */
    async init() {
      // Default implementation does nothing
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the manager is ready
     */
    isReady() {
      return true;
    }
  }

  // Expose BaseManager globally
  window._n21_.managers = window._n21_.managers || {};
  window._n21_.managers.BaseManager = BaseManager;
})();
