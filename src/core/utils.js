(() => {
  /* =======================
       Core Utilities
    ======================= */

  /**
   * Get a manager from Game Manager script by name
   * Used internally by manager abstractions (TokenManager, etc.)
   * @param {string} managerName - The name of the manager to retrieve
   * @returns {Object|null} The manager instance or null if not available
   */
  function getNativeManager(managerName) {
    if (!managerName) return null;

    const root = window.app?.root;
    if (!root || typeof root.find !== "function") return null;

    const found = root.find((e) => e && e.name === "Game Manager");
    const gameManager = Array.isArray(found) ? found[0] : found;
    if (!gameManager || !gameManager.script) return null;

    return gameManager.script[managerName] || null;
  }

  // Expose utility for manager abstractions
  window._n21_.utils = window._n21_.utils || {};
  window._n21_.utils.getNativeManager = getNativeManager;
})();
