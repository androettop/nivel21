(() => {
  /* =======================
       TokenManager - Global token abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { loadManagers } = window._n21_ || {};

  /**
   * TokenManager provides a unified interface for managing tokens
   * Abstracts the native tokenManager from nivel20
   */
  class TokenManager extends BaseManager {
    constructor() {
      super();
      this._appRootManager = null;
    }

    /**
     * Initialize the manager - wait for AppRootManager to be ready
     */
    async init() {
      super.init();
      try {
        const [appRootManager] = await loadManagers("AppRootManager");
        this._appRootManager = appRootManager;
      } catch (error) {
        console.warn("N21: Failed to load AppRootManager:", error);
      }
    }

    /**
     * Get the native tokenManager instance
     * @returns {Object|null} The native tokenManager or null if not available
     */
    _getNative() {
      return this._appRootManager?.getNativeManager("tokenManager") || null;
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

    /**
     * Get a child from a token by name
     * @param {string} networkId - The network ID of the token
     * @param {string} childName - The name of the child to find
     * @returns {Object|null} The child entity or null if not found
     */
    getTokenChildByName(networkId, childName) {
      const token = this.getToken(networkId);
      if (!token || !token.children || !token.children.length) return null;

      for (let child of token.children) {
        if (child && child.name === childName) {
          return child;
        }
      }
      return null;
    }

    /**
     * Add a child entity to a token
     * @param {string} networkId - The network ID of the token
     * @param {Object} childEntity - The entity to add as a child
     * @returns {boolean} True if the child was added successfully
     */
    addChildToToken(networkId, childEntity) {
      const token = this.getToken(networkId);
      if (!token || !childEntity) return false;
      if (typeof token.addChild !== "function") return false;

      token.addChild(childEntity);
      return true;
    }

    /**
     * Remove a child entity from a token
     * @param {string} networkId - The network ID of the token
     * @param {Object} childEntity - The entity to remove
     * @returns {boolean} True if the child was removed successfully
     */
    removeChildFromToken(networkId, childEntity) {
      const token = this.getToken(networkId);
      if (!token || !childEntity) return false;
      if (typeof token.removeChild !== "function") return false;

      token.removeChild(childEntity);
      return true;
    }

    /**
     * Get the position of a token
     * @param {string} networkId - The network ID of the token
     * @returns {Object|null} The position {x, y, z} or null if not found
     */
    getTokenPosition(networkId) {
      const token = this.getToken(networkId);
      if (!token || !token.position) return null;

      return {
        x: token.position.x,
        y: token.position.y,
        z: token.position.z,
      };
    }

    /**
     * Get token visibility state
     * @param {string} networkId - The network ID of the token
     * @returns {{hidden: boolean, translucent: boolean}|null} Visibility state or null if token not found
     */
    getTokenVisibility(networkId) {
      const token = this.getToken(networkId);
      if (!token) return null;

      return {
        hidden: !!token.hidden,
        translucent: !!token.translucent,
      };
    }

    /**
     * Subscribe to token visibility changes
     * Callback receives (networkId, hidden, translucent)
     * @param {Function} callback - Visibility callback
     * @returns {Function} Unsubscribe function (best effort)
     */
    onTokenVisibilityChange(callback) {
      if (typeof callback !== "function") return () => {};

      const entityManager = this._getEntityManager();
      const schemaRoot = entityManager?.schema?.();

      if (!schemaRoot || typeof schemaRoot.onAdd !== "function") {
        return () => {};
      }

      schemaRoot.onAdd((schema, networkId) => {
        if (!schema || !networkId) return;

        const token = this.getToken(networkId);

        if (token && typeof token.on === "function") {
          try {
            token.on("hidden", (hidden, translucent) => {
              try {
                callback(networkId, !!hidden, !!translucent);
              } catch (_error) {}
            });
          } catch (_error) {}
        }

        // Emit initial visibility state for newly tracked tokens
        try {
          callback(networkId, !!token?.hidden, !!token?.translucent);
        } catch (_error) {}
      });

      return () => {};
    }
  }

  // Register TokenManager
  const { registerManager } = window._n21_.utils;
  registerManager("TokenManager", TokenManager);
})();
