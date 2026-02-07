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
      return !!this._getNative();
    }

    /**
     * Get the current player's user ID
     * @returns {string|null} The user ID or null if not available
     */
    getMyUserId() {
      return this._getNative()?.me?.()?.userId || null;
    }

    /**
     * Get the current player's session ID
     * @returns {string|null} The session ID or null if not available
     */
    getMySessionId() {
      const sessionId = this._getNative()?.me?.()?.sessionId;
      return sessionId ? String(sessionId) : null;
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
      return this._getNative()?.isGameMaster(`${userId}`) || false;
    }

    /**
     * Get the list of players from the native playerService
     * @returns {Array} Array of player objects
     */
    getPlayerList() {
      return this._getNative()?.playerList?.() || [];
    }

    /**
     * Determine if the current GM has the smallest sessionId among connected GMs
     * @returns {boolean} True if current GM has the lowest sessionId
     */
    isLeadGameMaster() {
      const me = this._getNative()?.me?.();
      const myUserId = me?.userId;
      const mySessionId = me?.sessionId ? String(me.sessionId) : "";
      if (!myUserId || !mySessionId) return false;

      const players = this.getPlayerList();
      if (!players?.length) return false;

      let lowestSessionId = null;

      for (const player of players) {
        if (!player?.connected) continue;
        if (!this.isUserGameMaster(player.userId)) continue;

        const sessionId = player.sessionId ? String(player.sessionId) : "";
        if (!sessionId) continue;

        if (
          lowestSessionId === null ||
          sessionId.localeCompare(lowestSessionId, undefined, { numeric: true }) < 0
        ) {
          lowestSessionId = sessionId;
        }
      }

      if (lowestSessionId === null) return false;

      return mySessionId === lowestSessionId;
    }
  }

  // Register PlayerManager
  const { registerManager } = window._n21_.utils;
  registerManager("PlayerManager", PlayerManager);
})();
