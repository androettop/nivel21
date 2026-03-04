(() => {
  /* =======================
       EditTokenUIManager - Token editing UI operations
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * EditTokenUIManager provides interface for opening and modifying token edit forms
   */
  class EditTokenUIManager extends BaseManager {
    constructor() {
      super();
      this._tokenManager = null;
    }

    async init() {
      if (!this._tokenManager) {
        try {
          const { loadManagers } = window._n21_;
          const [TokenManager] = await loadManagers("TokenManager");
          this._tokenManager = TokenManager;
        } catch (error) {
          console.warn("[EditTokenUIManager] Failed to load TokenManager:", error);
        }
      }
    }

    isReady() {
      return !!this._tokenManager;
    }

    /**
     * Set or update a generic token tag in description
     * @param {string} networkId - The network ID of the token to edit
     * @param {string} tagKey - The tag key (e.g., 'user', 'l')
     * @param {*} tagValue - The tag value
     * @returns {Promise<boolean>} True if successfully set and saved
     */
    async setTokenTag(networkId, tagKey, tagValue) {
      if (!this._tokenManager) {
        console.warn("[EditTokenUIManager] TokenManager not available");
        return false;
      }

      const schema = this._tokenManager.getTokenSchema(networkId);
      if (!schema) {
        console.warn("[EditTokenUIManager] Token schema not found");
        return false;
      }

      // Build the metadata object to pass to editOfflineAsset
      let metadata = {};
      try {
        const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
        metadata = JSON.parse(metadataString);
      } catch (error) {
        metadata = {};
      }

      metadata.invisible = schema.invisible || false;
      metadata.locked = schema.locked || false;
      metadata.clears_fog = (schema.fogLightRadius || 0) > 0;

      // Open the form
      if (typeof window.editOfflineAsset !== "function") {
        console.warn("[EditTokenUIManager] editOfflineAsset function not available");
        return false;
      }

      window.editOfflineAsset(metadata);

      // Wait for the form and set the tag
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 50;

        const checkAndSet = () => {
          attempts += 1;

          const $description = $("#tabletop_asset_description");
          if (!$description.length || !$description.is(":visible")) {
            if (attempts < maxAttempts) {
              setTimeout(checkAndSet, 100);
            } else {
              console.warn("[EditTokenUIManager] Form description field did not appear");
              resolve(false);
            }
            return;
          }

          try {
            const currentValue = $description.val() || "";
            // Use generic tag utility to set the tag
            const newValue = window._n21_.utils.setTokenTag(currentValue, tagKey, tagValue);

            // Set the description
            $description.val(newValue);

            // Submit the form
            const $form = $("#TabletopTokenForm");
            if ($form.length) {
              $form.submit();
              resolve(true);
            } else {
              console.warn("[EditTokenUIManager] Token form not found");
              resolve(false);
            }
          } catch (error) {
            console.warn("[EditTokenUIManager] Error setting tag:", error);
            resolve(false);
          }
        };

        checkAndSet();
      });
    }

    /**
     * Remove a generic token tag from description
     * @param {string} networkId - The network ID of the token to edit
     * @param {string} tagKey - The tag key to remove
     * @returns {Promise<boolean>} True if successfully removed and saved
     */
    async removeTokenTag(networkId, tagKey) {
      if (!this._tokenManager) {
        console.warn("[EditTokenUIManager] TokenManager not available");
        return false;
      }

      const schema = this._tokenManager.getTokenSchema(networkId);
      if (!schema) {
        console.warn("[EditTokenUIManager] Token schema not found");
        return false;
      }

      // Build the metadata object to pass to editOfflineAsset
      let metadata = {};
      try {
        const metadataString = typeof schema.metadata === "string" ? schema.metadata : "{}";
        metadata = JSON.parse(metadataString);
      } catch (error) {
        metadata = {};
      }

      metadata.invisible = schema.invisible || false;
      metadata.locked = schema.locked || false;
      metadata.clears_fog = (schema.fogLightRadius || 0) > 0;

      // Open the form
      if (typeof window.editOfflineAsset !== "function") {
        console.warn("[EditTokenUIManager] editOfflineAsset function not available");
        return false;
      }

      window.editOfflineAsset(metadata);

      // Wait for the form and remove the tag
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 50;

        const checkAndRemove = () => {
          attempts += 1;

          const $description = $("#tabletop_asset_description");
          if (!$description.length || !$description.is(":visible")) {
            if (attempts < maxAttempts) {
              setTimeout(checkAndRemove, 100);
            } else {
              console.warn("[EditTokenUIManager] Form description field did not appear");
              resolve(false);
            }
            return;
          }

          try {
            const currentValue = $description.val() || "";
            // Use generic tag utility to remove the tag
            const newValue = window._n21_.utils.removeTokenTag(currentValue, tagKey);

            // Set the description
            $description.val(newValue);

            // Submit the form
            const $form = $("#TabletopTokenForm");
            if ($form.length) {
              $form.submit();
              resolve(true);
            } else {
              console.warn("[EditTokenUIManager] Token form not found");
              resolve(false);
            }
          } catch (error) {
            console.warn("[EditTokenUIManager] Error removing tag:", error);
            resolve(false);
          }
        };

        checkAndRemove();
      });
    }

    /**
     * Convenience method: Set a layer marker on token description
     * @param {string} networkId - The network ID of the token to edit
     * @param {number} layer - The layer number (1-6)
     * @returns {Promise<boolean>} True if successfully set and saved
     */
    async setTokenLayerMarker(networkId, layer) {
      return this.setTokenTag(networkId, "l", layer);
    }

    /**
     * Convenience method: Remove all layer markers from token description
     * @param {string} networkId - The network ID of the token to edit
     * @returns {Promise<boolean>} True if successfully removed and saved
     */
    async clearTokenLayerMarkers(networkId) {
      return this.removeTokenTag(networkId, "l");
    }

    /**
     * Convenience method: Remove all user markers from token description
     * @param {string} networkId - The network ID of the token to edit
     * @returns {Promise<boolean>} True if successfully removed and saved
     */
    async clearTokenUserMarkers(networkId) {
      return this.removeTokenTag(networkId, "user");
    }

    /**
     * Set a user marker on token description (for assign to players)
     * @param {string} networkId - The network ID of the token to edit
     * @param {string} userName - The user name to assign
     * @returns {Promise<boolean>} True if successfully set and saved
     */
    async setTokenUserMarker(networkId, userName) {
      return this.setTokenTag(networkId, "user", userName);
    }
  }

  // Register EditTokenUIManager
  const { registerManager } = window._n21_.utils;
  registerManager("EditTokenUIManager", EditTokenUIManager);
})();
