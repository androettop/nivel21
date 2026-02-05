(() => {
  /* =======================
       TokenManager - Global token abstraction
    ======================= */

  const { getNativeManager } = window._n21_?.utils || {};
  const { BaseManager } = window._n21_?.managers || {};

  /**
   * TokenManager provides a unified interface for managing tokens
   * Abstracts the native tokenManager from nivel20
   */
  class TokenManager extends BaseManager {
    /**
     * Get the native tokenManager instance
     * @returns {Object|null} The native tokenManager or null if not available
     */
    _getNative() {
      return getNativeManager("tokenManager");
    }

    /**
     * Get the entity manager from the native tokenManager
     * @returns {Object|null} The entityManager or null if not available
     */
    _getEntityManager() {
      return this._getNative()?.entityManager || null;
    }

    /**
     * Get a specific token by its networkId
     * @param {string} networkId - The network ID of the token
     * @returns {Object|null} The token instance or null if not found
     */
    getToken(networkId) {
      const instances = this._getEntityManager()?.instances;
      return instances?.get?.(networkId) || null;
    }

    /**
     * Update a token's position
     * @param {string} networkId - The network ID of the token
     * @param {Object} position - The new position { x, y, z }
     * @returns {boolean} True if the update was requested, false otherwise
     */
    updatePosition(networkId, position) {
      if (!networkId || !position) return false;

      const entityManager = this._getEntityManager();
      if (!entityManager?.requestUpdate) return false;

      entityManager.requestUpdate({ networkId, position });
      return true;
    }

    /**
     * Check if the TokenManager is ready for use
     * @returns {boolean} True if the manager is ready
     */
    isReady() {
      return this._getNative() !== null;
    }
  }

  // Expose TokenManager globally
  window._n21_.managers = window._n21_.managers || {};
  window._n21_.managers.TokenManager = new TokenManager();
})();
