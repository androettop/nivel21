(() => {
  /* =======================
       FloatingPanelManager - Global floating panel abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * FloatingPanelManager provides a unified interface for intercepting floating panel operations
   * Features can register interceptors for loadInFloatingPanel and openInFloatingPanel
   */
  class FloatingPanelManager extends BaseManager {
    constructor() {
      super();
      this._hooked = false;
      this._loadInterceptors = [];
      this._openInterceptors = [];
    }

    /**
     * Hook into the global floating panel functions
     * This is called automatically during initialization
     */
    _hookFunctions() {
      if (this._hooked) return;

      this._hookLoadInFloatingPanel();
      this._hookOpenInFloatingPanel();

      this._hooked = true;
    }

    /**
     * Hook loadInFloatingPanel function
     */
    _hookLoadInFloatingPanel() {
      const originalFn = window.loadInFloatingPanel;
      if (typeof originalFn !== "function") {
        console.warn(
          "[FloatingPanelManager] loadInFloatingPanel function not found",
        );
        return;
      }

      const self = this;

      window.loadInFloatingPanel = function (url, title, icon, color, ...args) {
        const data = { url, title, icon, color };

        for (const interceptor of self._loadInterceptors) {
          try {
            const result = interceptor.callback(data, args);

            // If interceptor returns false, skip the original function
            if (result === false) {
              return;
            }

            // If interceptor returns an object, use it as new data
            if (result && typeof result === "object" && !Array.isArray(result)) {
              Object.assign(data, result);
            }
          } catch (error) {
            console.warn(
              `[FloatingPanelManager] Error in load interceptor "${interceptor.name}":`,
              error,
            );
          }
        }

        return originalFn(data.url, data.title, data.icon, data.color, ...args);
      };
    }

    /**
     * Hook openInFloatingPanel function
     */
    _hookOpenInFloatingPanel() {
      const originalFn = window.openInFloatingPanel;
      if (typeof originalFn !== "function") {
        console.warn(
          "[FloatingPanelManager] openInFloatingPanel function not found",
        );
        return;
      }

      const self = this;

      window.openInFloatingPanel = function (arg1, arg2, arg3, arg4, ...args) {
        const rawArgs = [arg1, arg2, arg3, arg4, ...args];

        for (const interceptor of self._openInterceptors) {
          try {
            const result = interceptor.callback(arg1, arg2, arg3, arg4, args);

            // If interceptor returns false, skip the original function
            if (result === false) {
              return;
            }

            // If interceptor returns an array, use it as new arguments
            if (Array.isArray(result)) {
              [arg1, arg2, arg3, arg4, ...args] = result;
            }
          } catch (error) {
            console.warn(
              `[FloatingPanelManager] Error in open interceptor "${interceptor.name}":`,
              error,
            );
          }
        }

        return originalFn(arg1, arg2, arg3, arg4, ...args);
      };
    }

    /**
     * Register an interceptor for loadInFloatingPanel
     * 
     * @param {string} name - Unique name for this interceptor
     * @param {Function} callback - Function that receives (data, extraArgs) where data is { url, title, icon, color }
     *   Returns: false to prevent panel, modified data object to change params, or undefined to pass through
     * @param {Object} options - Optional configuration { priority: number }
     * @returns {Function} Unsubscribe function
     */
    onLoad(name, callback, options = {}) {
      return this._addInterceptor(this._loadInterceptors, name, callback, options);
    }

    /**
     * Register an interceptor for openInFloatingPanel
     * 
     * @param {string} name - Unique name for this interceptor
     * @param {Function} callback - Function that receives (arg1, arg2, arg3, arg4, extraArgs)
     *   Returns: false to prevent panel, array of new args, or undefined to pass through
     * @param {Object} options - Optional configuration { priority: number }
     * @returns {Function} Unsubscribe function
     */
    onOpen(name, callback, options = {}) {
      return this._addInterceptor(this._openInterceptors, name, callback, options);
    }

    /**
     * Internal method to add an interceptor to a list
     */
    _addInterceptor(list, name, callback, options = {}) {
      if (typeof callback !== "function") {
        console.warn(
          "[FloatingPanelManager] Interceptor callback must be a function",
        );
        return () => {};
      }

      const priority = options.priority ?? 100;

      // Remove existing interceptor with same name
      this._removeFromList(list, name);

      const interceptor = { name, callback, priority };
      list.push(interceptor);

      // Sort by priority (lower first)
      list.sort((a, b) => a.priority - b.priority);

      // Return unsubscribe function
      return () => this._removeFromList(list, name);
    }

    /**
     * Remove an interceptor from a list by name
     */
    _removeFromList(list, name) {
      const index = list.findIndex((i) => i.name === name);
      if (index > -1) {
        list.splice(index, 1);
        return true;
      }
      return false;
    }

    /**
     * Remove a load interceptor by name
     */
    removeLoadInterceptor(name) {
      return this._removeFromList(this._loadInterceptors, name);
    }

    /**
     * Remove an open interceptor by name
     */
    removeOpenInterceptor(name) {
      return this._removeFromList(this._openInterceptors, name);
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the manager is initialized and hooked
     */
    isReady() {
      return this._hooked;
    }

    /**
     * Initialize the manager
     * Waits for floating panel functions to be available and hooks into them
     */
    async init() {
      if (this._hooked) return;

      // Wait for functions to be available
      const maxAttempts = 100;
      const interval = 100;

      for (let i = 0; i < maxAttempts; i++) {
        const hasLoad = typeof window.loadInFloatingPanel === "function";
        const hasOpen = typeof window.openInFloatingPanel === "function";

        if (hasLoad && hasOpen) {
          this._hookFunctions();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      console.warn(
        "[FloatingPanelManager] Timeout waiting for floating panel functions",
      );
    }
  }

  // Register FloatingPanelManager
  const { registerManager } = window._n21_.utils;
  registerManager("FloatingPanelManager", FloatingPanelManager);
})();
