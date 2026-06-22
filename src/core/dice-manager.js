(() => {
  /* =======================
       DiceManager - Global dice roll abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * Map the extension's visibility values to the string form expected by the
   * page's string-based roll functions (tabletopDiceRoll / tabletopV2DiceRoll).
   * Object-based functions (dice3dRoll) receive the raw, untransformed value.
   */
  const VISIBILITY_MAP = {
    public: "public",
    private: "private",
    hidden: "private",
    master_only: "masterOnly",
    master_and_player: "masterAndPlayer",
  };

  function transformVisibility(value) {
    return VISIBILITY_MAP[value] ?? value;
  }

  /**
   * DiceManager provides a unified interface for modifying dice rolls
   * Features can register modifiers that transform dice notation before rolling
   */
  class DiceManager extends BaseManager {
    constructor() {
      super();
      this._hooked = false;
      this._modifiers = [];
      // When non-null, overrides the visibility argument of every dice roll.
      this._visibilityOverride = null;
    }

    /**
     * Override the visibility of every dice roll, regardless of the chat's
     * configured visibility.
     * @param {string|null} value - One of "public", "private", "hidden",
     *   "master_only", "master_and_player", or null to disable the override.
     */
    setVisibilityOverride(value) {
      this._visibilityOverride = value || null;
    }

    /**
     * Hook into the global diceRoll function
     * This is called automatically during initialization
     */
    _hookDiceRoll() {
      if (this._hooked) return;

      const originalFn = window.diceRoll;
      if (typeof originalFn !== "function") {
        console.warn("[DiceManager] diceRoll function not found");
        return;
      }

      const self = this;

      window.diceRoll = function (notation, ...args) {
        // Apply all registered modifiers in order
        let modifiedNotation = notation;
        let modifiedArgs = args;

        for (const modifier of self._modifiers) {
          try {
            const result = modifier.callback(modifiedNotation, ...modifiedArgs);

            // If modifier returns false, skip the roll entirely
            if (result === false) {
              return;
            }

            // If modifier returns an array, use it as new arguments
            if (Array.isArray(result)) {
              [modifiedNotation, ...modifiedArgs] = result;
            }
          } catch (error) {
            console.warn(
              `[DiceManager] Error in modifier "${modifier.name}":`,
              error,
            );
          }
        }

        return originalFn(modifiedNotation, ...modifiedArgs);
      };

      this._hooked = true;
    }

    /**
     * Hook a roll function whose visibility argument is a plain string
     * (tabletopDiceRoll / tabletopV2DiceRoll). The override is transformed
     * to the page's string form before being applied.
     * @param {string} fnName - Global function name on window
     * @param {number} index - Argument index of the visibility parameter
     * @returns {boolean} True if hooked (or already hooked)
     */
    _hookStringVisibility(fnName, index) {
      const original = window[fnName];
      if (typeof original !== "function") return false;
      if (original.__n21VisibilityHooked) return true;

      const self = this;
      const hooked = function (...args) {
        if (self._visibilityOverride) {
          args[index] = transformVisibility(self._visibilityOverride);
        }
        return original.apply(this, args);
      };

      hooked.__n21VisibilityHooked = true;
      window[fnName] = hooked;
      return true;
    }

    /**
     * Hook a roll function whose visibility argument is an options object
     * (dice3dRoll). Only the `visibility` property is overridden (with the
     * raw, untransformed value); any existing object is spread to preserve
     * its other properties.
     * @param {string} fnName - Global function name on window
     * @param {number} index - Argument index of the options object
     * @returns {boolean} True if hooked (or already hooked)
     */
    _hookObjectVisibility(fnName, index) {
      const original = window[fnName];
      if (typeof original !== "function") return false;
      if (original.__n21VisibilityHooked) return true;

      const self = this;
      const hooked = function (...args) {
        if (self._visibilityOverride) {
          const current = args[index];
          const base =
            current && typeof current === "object" ? current : {};
          args[index] = { ...base, visibility: self._visibilityOverride };
        }
        return original.apply(this, args);
      };

      hooked.__n21VisibilityHooked = true;
      window[fnName] = hooked;
      return true;
    }

    /**
     * Hook all roll entry points so their visibility argument can be
     * overridden. Returns true once every function has been hooked.
     * @returns {boolean}
     */
    _hookVisibilityFunctions() {
      const v2 = this._hookStringVisibility("tabletopV2DiceRoll", 4);
      const tabletop = this._hookStringVisibility("tabletopDiceRoll", 3);
      const dice3d = this._hookObjectVisibility("dice3dRoll", 1);
      const sendMessage = this._hookObjectVisibility("sendDiceRollMessage", 2);
      return v2 && tabletop && dice3d && sendMessage;
    }

    /**
     * Register a dice roll modifier
     * Modifiers are called in order of priority (lower priority first)
     * 
     * @param {string} name - Unique name for this modifier
     * @param {Function} callback - Function that receives (notation, ...args) and returns:
     *   - [newNotation, ...newArgs] to modify the roll
     *   - false to skip the roll entirely
     *   - undefined/null to pass through unchanged
     * @param {Object} options - Optional configuration { priority: number }
     * @returns {Function} Unsubscribe function to remove the modifier
     */
    addModifier(name, callback, options = {}) {
      if (typeof callback !== "function") {
        console.warn("[DiceManager] Modifier callback must be a function");
        return () => {};
      }

      const priority = options.priority ?? 100;

      // Remove existing modifier with same name
      this.removeModifier(name);

      const modifier = { name, callback, priority };
      this._modifiers.push(modifier);

      // Sort by priority (lower first)
      this._modifiers.sort((a, b) => a.priority - b.priority);

      // Return unsubscribe function
      return () => this.removeModifier(name);
    }

    /**
     * Remove a modifier by name
     * @param {string} name - The name of the modifier to remove
     * @returns {boolean} True if the modifier was found and removed
     */
    removeModifier(name) {
      const index = this._modifiers.findIndex((m) => m.name === name);
      if (index > -1) {
        this._modifiers.splice(index, 1);
        return true;
      }
      return false;
    }

    /**
     * Get list of registered modifier names
     * @returns {string[]} Array of modifier names
     */
    getModifierNames() {
      return this._modifiers.map((m) => m.name);
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
     * Waits for diceRoll to be available and hooks into it
     */
    async init() {
      if (this._hooked) return;

      // Wait for diceRoll to be available
      const maxAttempts = 100;
      const interval = 100;

      for (let i = 0; i < maxAttempts; i++) {
        if (typeof window.diceRoll === "function") {
          this._hookDiceRoll();
          this._startVisibilityHookRetry();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      console.warn("[DiceManager] Timeout waiting for diceRoll function");
    }

    /**
     * The roll entry points may not exist yet when the manager initializes;
     * retry until all of them are hooked, then stop.
     */
    _startVisibilityHookRetry() {
      if (this._hookVisibilityFunctions()) return;

      const intervalId = setInterval(() => {
        if (this._hookVisibilityFunctions()) clearInterval(intervalId);
      }, 200);
      setTimeout(() => clearInterval(intervalId), 30000);
    }
  }

  // Register DiceManager
  const { registerManager } = window._n21_.utils;
  registerManager("DiceManager", DiceManager);
})();
