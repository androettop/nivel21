(() => {
  /* =======================
       ActionBarManager - Global action bar abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * ActionBarManager provides a unified interface for intercepting action bar operations
   * Features can register interceptors that modify or replace createBar behavior
   */
  class ActionBarManager extends BaseManager {
    constructor() {
      super();
      this._hooked = false;
      this._originalCreateBar = null;
      this._interceptors = [];
    }

    /**
     * Hook into the global createBar function
     */
    _hookCreateBar() {
      if (this._hooked) return;

      this._originalCreateBar = window.createBar;

      const self = this;

      window.createBar = function (element, items, ...args) {
        // Call interceptors in order of priority
        for (const interceptor of self._interceptors) {
          try {
            const result = interceptor.callback(element, items, ...args);

            // If interceptor returns false, stop and don't call original
            if (result === false) {
              return $(element);
            }

            // If interceptor returns a result, use it as final result
            if (result !== undefined && result !== null) {
              return result;
            }
          } catch (error) {
            console.warn(
              `[ActionBarManager] Error in interceptor "${interceptor.name}":`,
              error,
            );
          }
        }

        // If no interceptor handled it, call original
        if (self._originalCreateBar) {
          return self._originalCreateBar(element, items, ...args);
        }

        return $(element);
      };

      this._hooked = true;
    }

    /**
     * Register an interceptor for createBar
     * 
     * Interceptors receive (element, items, ...args) and can:
     * - Return undefined/null to pass through to next interceptor or original
     * - Return false to prevent further processing
     * - Return a jQuery element to use as the final result
     * 
     * @param {string} name - Unique name for this interceptor
     * @param {Function} callback - Function that intercepts createBar calls
     * @param {Object} options - Optional configuration { priority: number }
     * @returns {Function} Unsubscribe function
     */
    onCreateBar(name, callback, options = {}) {
      if (typeof callback !== "function") {
        console.warn(
          "[ActionBarManager] Interceptor callback must be a function",
        );
        return () => {};
      }

      const priority = options.priority ?? 100;

      // Remove existing interceptor with same name
      this.removeInterceptor(name);

      const interceptor = { name, callback, priority };
      this._interceptors.push(interceptor);

      // Sort by priority (lower first)
      this._interceptors.sort((a, b) => a.priority - b.priority);

      return () => this.removeInterceptor(name);
    }

    /**
     * Remove an interceptor by name
     */
    removeInterceptor(name) {
      const index = this._interceptors.findIndex((i) => i.name === name);
      if (index > -1) {
        this._interceptors.splice(index, 1);
        return true;
      }
      return false;
    }

    /**
     * Get the original createBar function
     * @returns {Function|null}
     */
    getOriginalCreateBar() {
      return this._originalCreateBar;
    }

    /**
     * Call the original createBar function
     * Useful for interceptors that want to modify behavior but still use original
     */
    callOriginal(element, items, ...args) {
      if (this._originalCreateBar) {
        return this._originalCreateBar(element, items, ...args);
      }
      return $(element);
    }

    /**
     * Check if the manager is ready
     */
    isReady() {
      return this._hooked;
    }

    /**
     * Initialize the manager
     */
    async init() {
      if (this._hooked) return;

      const maxAttempts = 100;
      const interval = 100;

      for (let i = 0; i < maxAttempts; i++) {
        if (typeof window.createBar === "function") {
          this._hookCreateBar();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      console.warn("[ActionBarManager] Timeout waiting for createBar function");
    }
  }

  // Register ActionBarManager
  const { registerManager } = window._n21_.utils;
  registerManager("ActionBarManager", ActionBarManager);
})();
