(() => {
  /* =======================
       PlayerManager - Global player abstraction
    ======================= */

  const { getNativeManager } = window._n21_?.utils || {};
  const { BaseManager } = window._n21_?.managers || {};

  /**
   * PlayerManager provides a unified interface for accessing player information
   * Abstracts the native playerService from nivel20
   */
  class PlayerManager extends BaseManager {
    /**
     * Get the native playerService instance
     * @returns {Object|null} The native playerService or null if not available
     */
    _getNative() {
      return getNativeManager("playerService");
    }

    /**
     * Check if the native playerService is available and ready
     * @returns {boolean} True if playerService is available, false otherwise
     */
    isReady() {
      const playerService = this._getNative();
      return !!playerService;
    }

    /**
     * Get the current player's user ID
     * @returns {string|null} The user ID or null if not available
     */
    getMyUserId() {
      return this._getNative()?.me?.()?.userId || null;
    }

    /**
     * Check if the current player is the Game Master
     * @returns {boolean} True if player is GM, false otherwise
     */
    isGameMaster() {
      const userId = this.getMyUserId();
      if (!userId) return false;

      return this.isUserGameMaster(userId);
    }

    /**
     * Check if a given user ID belongs to a Game Master
     * @param {string} userId - The user ID to check
     * @returns {boolean} True if the user is GM, false otherwise
     */
    isUserGameMaster(userId) {
      return playerService.isGameMaster(`${userId}`);
    }

    /**
     * Get the list of players from the native playerService
     * @returns {Array} Array of player objects
     */
    getPlayerList() {
      return this._getNative()?.playerList?.() || [];
    }
  }

  // Register PlayerManager
  const { registerManager } = window._n21_.utils;
  registerManager("PlayerManager", PlayerManager);
})();
