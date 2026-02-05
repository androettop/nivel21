(() => {
  /* =======================
       TokenManager - Global token abstraction
    ======================= */

  const { getNativeManager } = window._n21_?.utils || {};

  /**
   * TokenManager provides a unified interface for managing tokens
   * Abstracts the native tokenManager from nivel20
   */
  const TokenManager = {
    /**
     * Get the native tokenManager instance
     * @returns {Object|null} The native tokenManager or null if not available
     */
    _getNative() {
      return getNativeManager("tokenManager");
    },

    /**
     * Get the entity manager from the native tokenManager
     * @returns {Object|null} The entityManager or null if not available
     */
    getEntityManager() {
      return this._getNative()?.entityManager || null;
    },

    /**
     * Get all token instances
     * @returns {Map|null} Map of token instances by networkId
     */
    getInstances() {
      return this.getEntityManager()?.instances || null;
    },

    /**
     * Get a specific token by its networkId
     * @param {string} networkId - The network ID of the token
     * @returns {Object|null} The token instance or null if not found
     */
    getToken(networkId) {
      const instances = this.getInstances();
      return instances?.get?.(networkId) || null;
    },

    /**
     * Request an update to a token's properties
     * @param {Object} updateData - The update data including networkId and properties to update
     * @returns {boolean} True if the update was requested, false otherwise
     */
    requestUpdate(updateData) {
      const entityManager = this.getEntityManager();
      if (!entityManager?.requestUpdate) return false;

      entityManager.requestUpdate(updateData);
      return true;
    },

    /**
     * Update a token's position
     * @param {string} networkId - The network ID of the token
     * @param {Object} position - The new position { x, y, z }
     * @returns {boolean} True if the update was requested, false otherwise
     */
    updatePosition(networkId, position) {
      if (!networkId || !position) return false;

      return this.requestUpdate({
        networkId,
        position,
      });
    },

    /**
     * Check if the TokenManager is available
     * @returns {boolean} True if the native tokenManager is available
     */
    isAvailable() {
      return this._getNative() !== null;
    },
  };

  // Expose TokenManager globally
  window._n21_.managers = window._n21_.managers || {};
  window._n21_.managers.TokenManager = TokenManager;
})();
