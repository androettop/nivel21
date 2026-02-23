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

    isTokenSelectable(networkId) {
      const token = this.getToken(networkId);
      return token?.tags?.has("selectable");
    }

    /**
     * Get the schema of a token
     * @param {string} networkId - The network ID of the token
     * @returns {Object|null} The token's schema or null if not found
     */
    getTokenSchema(networkId) {
      const token = this.getToken(networkId);
      return token?.script?.tokenInstance?.schema || null;
    }

    /**
     * Subscribe to token metadata changes
     * Automatically registers listeners on all tokens (current and future)
     * @param {Function} callback - Called with (networkId, metadataString) when metadata changes
     * @returns {Function} Unsubscribe function
     */
    onTokenMetadataChange(callback) {
      if (typeof callback !== "function") return () => {};

      const entityManager = this._getEntityManager();
      const schemaRoot = entityManager?.schema?.();

      if (!schemaRoot || typeof schemaRoot.onAdd !== "function") {
        return () => {};
      }

      schemaRoot.onAdd((schema, networkId) => {
        if (!schema || !networkId) return;

        if (typeof schema.listen === "function") {
          schema.listen("metadata", (newMetadata) => {
            try {
              callback(networkId, newMetadata);
            } catch (error) {
              console.warn("[TokenManager] Metadata listener error:", error);
            }
          });
        }

        // Call with initial metadata if available
        const initialMetadata = typeof schema.metadata === "string"
          ? schema.metadata
          : (typeof schema.get === "function" ? schema.get("metadata") : "");

        if (initialMetadata) {
          try {
            callback(networkId, initialMetadata);
          } catch (error) {
            console.warn("[TokenManager] Metadata listener error:", error);
          }
        }
      });

      return () => {};
    }

    /**
     * Check if the TokenManager is ready for use
     * @returns {boolean} True if the manager is ready
     */
    isReady() {
      return this._getNative() !== null;
    }
  }

  // Register TokenManager
  const { registerManager } = window._n21_.utils;
  registerManager("TokenManager", TokenManager);
})();
