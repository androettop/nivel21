(() => {
  /* =======================
       AppRootManager - App and native managers abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * AppRootManager manages access to the app object and native managers
   * It ensures the app is available and provides getNativeManager method
   * This should be loaded before other managers that need native managers
   */
  class AppRootManager extends BaseManager {
    constructor() {
      super();
      this._app = null;
      this._appPromise = null;
      this._initialized = false;
    }

    /**
     * Setup the Object.assign hook to capture the app object
     * @private
     */
    _setupAppHook() {
      if (this._appPromise !== null) return this._appPromise;

      this._appPromise = new Promise((resolve, reject) => {
        // Fast path - try sync access first
        const syncApp = window.camera?.app || window.players?.app;
        if (syncApp != null) {
          resolve(syncApp);
          return;
        }

        const originalAssign = Object.assign;
        let done = false;
        let timeoutId;

        const cleanup = () => {
          if (Object.assign === hookedAssign) {
            Object.assign = originalAssign;
          }
          if (timeoutId) clearTimeout(timeoutId);
        };

        const finish = (ok, value) => {
          if (done) return;
          done = true;
          cleanup();
          ok ? resolve(value) : reject(value);
        };

        const hookedAssign = (target, ...sources) => {
          for (const s of sources) {
            const app = s?.camera?.app;
            if (app != null) {
              finish(true, app);
              break;
            }
          }
          return originalAssign.call(Object, target, ...sources);
        };

        Object.assign = hookedAssign;

        timeoutId = setTimeout(() => {
          finish(
            false,
            new Error(`Timeout: no llegó {camera:{app}} en 10000ms`)
          );
        }, 10000);
      });

      return this._appPromise;
    }

    /**
     * Get the app object via hook
     * @private
     */
    async _getApp() {
      // If already cached, return it
      if (this._app) {
        return this._app;
      }

      // Check if app is available synchronously through known properties
      const knownProperties = [
        "callbacks",
        "camera",
        "dices",
        "fogOfWar",
        "gameModes",
        "keyboard",
        "layers",
        "map",
        "players",
        "room",
        "scenes",
        "screenshot",
        "settings",
        "sprites",
        "tokens",
        "measurements"
      ];

      for (const prop of knownProperties) {
        const app = window[prop]?.app;
        if (app != null) {
          this._app = app;
          return app;
        }
      }

      // Fallback to hook approach
      const promise = this._appPromise || this._setupAppHook();
      return promise;
    }

    /**
     * Initialize the manager - wait for app via hook
     */
    async init() {
      super.init();
      try {
        this._app = await this._getApp();
        this._initialized = true;
      } catch (error) {
        console.warn("N21: Failed to get app:", error);
        this._initialized = true; // Mark as initialized even if failed
      }
    }

    /**
     * Get the app object
     * @returns {Object|null} The app object or null if not available
     */
    getAppObject() {
      return this._app;
    }

    /**
     * Get a native manager from the app's game manager script
     * @param {string} managerName - The name of the manager to retrieve
     * @returns {Object|null} The manager instance or null if not available
     */
    getNativeManager(managerName) {
      if (!managerName) return null;
      if (!this._app) return null;

      const root = this._app?.root;
      if (!root || typeof root.find !== "function") return null;

      const found = root.find((c) => c && c.script?.[managerName]);
      if (!found?.[0]) return null;

      return found?.[0]?.script?.[managerName] || null;
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the app is available
     */
    isReady() {
      return this._app !== null;
    }
  }

  // Register AppRootManager
  const { registerManager } = window._n21_.utils;
  registerManager("AppRootManager", AppRootManager);
})();
