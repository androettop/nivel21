(() => {
  /* =======================
       DiceManager - Global dice roll abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * DiceManager provides a unified interface for modifying dice rolls
   * Features can register modifiers that transform dice notation before rolling
   */
  class DiceManager extends BaseManager {
    constructor() {
      super();
      this._hooked = false;
      this._modifiers = [];
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
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      console.warn("[DiceManager] Timeout waiting for diceRoll function");
    }
  }

  // Register DiceManager
  const { registerManager } = window._n21_.utils;
  registerManager("DiceManager", DiceManager);
})();
