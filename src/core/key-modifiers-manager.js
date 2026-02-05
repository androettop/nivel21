(() => {
  /* =======================
       KeyModifiersManager - Tracks keyboard modifier key states
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { events: n21Events } = window._n21_;

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
          n21Events.trigger("modifiers:change", [this.getState()]);
        }
      });

      $(window).on("blur", () => {
        if (!this._shift && !this._alt && !this._ctrl) return;

        this._shift = false;
        this._alt = false;
        this._ctrl = false;
        n21Events.trigger("modifiers:change", [this.getState()]);
      });

      this._initialized = true;
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

  // Create and initialize the manager
  const manager = new KeyModifiersManager();
  manager.init();

  // Expose KeyModifiersManager globally
  window._n21_.managers = window._n21_.managers || {};
  window._n21_.managers.KeyModifiersManager = manager;
})();
