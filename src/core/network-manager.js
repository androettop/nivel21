(() => {
  /* =======================
       NetworkManager - Network events abstraction
    ======================= */

  const { getNativeManager } = window._n21_?.utils || {};
  const { BaseManager } = window._n21_?.managers || {};

  /**
   * NetworkManager provides a unified interface for network events
   * Allows subscribing to network messages without directly accessing window.app
   */
  class NetworkManager extends BaseManager {
    constructor() {
      super();
      this._listeners = new Map(); // event -> Set of callbacks
      this._hookInstalled = false;
    }

    /**
     * Get the native networkManager instance
     * @returns {Object|null} The native networkManager or null if not available
     */
    _getNative() {
      return getNativeManager("networkManager");
    }

    /**
     * Install the network hook to intercept messages
     * @private
     * @returns {boolean} True if hook was installed successfully
     */
    _installHook() {
      if (this._hookInstalled) return true;

      const root = window.camera?.app?.root || window.players?.app?.root
      if (!root || typeof root.find !== "function") return false;

      const native = this._getNative();

      const found = root.find((e) => e && e.name === "Game Manager");
      const gameManager = Array.isArray(found) ? found[0] : found;
      if (!native?.room?.send) return false;

      const roomProto = native.room.__proto__;
      if (!roomProto?.send) return false;

      const originalSend = roomProto.send;
      const self = this;

      roomProto.send = function (event, data, ...args) {
        // Notify all listeners for this event
        const listeners = self._listeners.get(event);
        if (listeners) {
          listeners.forEach((callback) => {
            try {
              callback(data, event);
            } catch (error) {
              console.warn("N21: Error in network listener:", error);
            }
          });
        }

        return originalSend.call(this, event, data, ...args);
      };

      this._hookInstalled = true;
      return true;
    }

    /**
     * Subscribe to a network event
     * @param {string} event - The event name (e.g., "transform:update")
     * @param {Function} callback - Function to call when event occurs (receives data, event)
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
      if (typeof callback !== "function") {
        console.warn("N21: NetworkManager.on() requires a callback function");
        return () => {};
      }

      // Ensure hook is installed
      if (!this._hookInstalled) {
        this._installHook();
      }

      // Add listener
      if (!this._listeners.has(event)) {
        this._listeners.set(event, new Set());
      }
      this._listeners.get(event).add(callback);

      // Return unsubscribe function
      return () => {
        const listeners = this._listeners.get(event);
        if (listeners) {
          listeners.delete(callback);
          if (listeners.size === 0) {
            this._listeners.delete(event);
          }
        }
      };
    }

    /**
     * Initialize the manager - tries to install hook with retry
     */
    init() {
      super.init();

      // Try to install hook with polling
      const hookCheckInterval = setInterval(() => {
        if (this._installHook()) {
          clearInterval(hookCheckInterval);
        }
      }, 500);

      // Stop trying after 15 seconds
      setTimeout(() => clearInterval(hookCheckInterval), 15000);
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the hook is installed
     */
    isReady() {
      return this._hookInstalled;
    }
  }

  // Register NetworkManager
  const { registerManager } = window._n21_.utils;
  registerManager("NetworkManager", NetworkManager);
})();
