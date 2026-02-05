(() => {
  /* =======================
       KeyModifiersManager - Tracks keyboard modifier key states
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * KeyModifiersManager tracks the state of modifier keys (Shift, Alt, Ctrl)
   * and emits events when they change
   */
  class KeyModifiersManager extends BaseManager {
    constructor() {
      super();
      this._initialized = false;
      this._shift = false;
      this._alt = false;
      this._ctrl = false;
      this._listeners = [];
    }

    /**
     * Initialize the manager and set up event listeners
     */
    init() {
      if (this._initialized) return;

      $(document).on("keydown keyup", (e) => {
        const pressed = e.type === "keydown";
        let changed = false;

        if (e.key === "Shift" && this._shift !== pressed) {
          this._shift = pressed;
          changed = true;
        }

        // Alt for windows/linux, Meta for macOS (Command key)
        if ((e.key === "Alt" || e.key === "Meta") && this._alt !== pressed ) {
          this._alt = pressed;
          changed = true;
        }

        if (e.key === "Control" && this._ctrl !== pressed) {
          this._ctrl = pressed;
          changed = true;
        }

        if (changed) {
          e.preventDefault();
          this._notifyListeners();
        }
      });

      $(window).on("blur", () => {
        console.log("[KeyModifiersManager] Window lost focus, resetting modifier keys");
        if (!this._shift && !this._alt && !this._ctrl) return;

        this._shift = false;
        this._alt = false;
        this._ctrl = false;
        this._notifyListeners();
      });

      this._initialized = true;
    }

    /**
     * Notify all listeners of state change
     */
    _notifyListeners() {
      const state = this.getState();
      for (const listener of this._listeners) {
        try {
          listener(state);
        } catch (error) {
          console.warn("[KeyModifiersManager] Listener error:", error);
        }
      }
    }

    /**
     * Subscribe to modifier key state changes
     * Callback receives the current state { shift, alt, ctrl }
     * @param {Function} callback - Function to call when modifiers change
     * @returns {Function} Unsubscribe function
     */
    onChange(callback) {
      if (typeof callback !== "function") return () => {};

      this._listeners.push(callback);

      // Return unsubscribe function
      return () => {
        const index = this._listeners.indexOf(callback);
        if (index > -1) {
          this._listeners.splice(index, 1);
        }
      };
    }

    /**
     * Get the current state of modifier keys
     * @returns {Object} Object with shift, alt, ctrl boolean properties
     */
    getState() {
      return {
        shift: this._shift,
        alt: this._alt,
        ctrl: this._ctrl,
      };
    }

    /**
     * Check if the manager is ready for use
     * @returns {boolean} True if the manager is initialized
     */
    isReady() {
      return this._initialized;
    }
  }

  // Register KeyModifiersManager
  const { registerManager } = window._n21_.utils;
  registerManager("KeyModifiersManager", KeyModifiersManager);
})();
