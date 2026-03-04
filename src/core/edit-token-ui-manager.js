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
     * Open token edit form, transform description, and submit (single modal interaction)
     * @param {string} networkId - The network ID of the token to edit
     * @param {Function} transformDescription - Function(currentDescription) => newDescription
     * @returns {Promise<boolean>} True if successfully updated and saved
     */
    async updateTokenDescription(networkId, transformDescription) {
      if (!this._tokenManager) {
        console.warn("[EditTokenUIManager] TokenManager not available");
        return false;
      }

      if (typeof transformDescription !== "function") {
        console.warn("[EditTokenUIManager] transformDescription must be a function");
        return false;
      }

      const schema = this._tokenManager.getTokenSchema(networkId);
      if (!schema) {
        console.warn("[EditTokenUIManager] Token schema not found");
        return false;
      }

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

      if (typeof window.editOfflineAsset !== "function") {
        console.warn("[EditTokenUIManager] editOfflineAsset function not available");
        return false;
      }

      window.editOfflineAsset(metadata);

      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 50;

        const checkAndUpdate = () => {
          attempts += 1;

          const $description = $("#tabletop_asset_description");
          if (!$description.length || !$description.is(":visible")) {
            if (attempts < maxAttempts) {
              setTimeout(checkAndUpdate, 100);
            } else {
              console.warn("[EditTokenUIManager] Form description field did not appear");
              resolve(false);
            }
            return;
          }

          try {
            const currentValue = $description.val() || "";
            const newValue = transformDescription(currentValue);

            $description.val(newValue);

            const $form = $("#TabletopTokenForm");
            if ($form.length) {
              $form.submit();
              resolve(true);
            } else {
              console.warn("[EditTokenUIManager] Token form not found");
              resolve(false);
            }
          } catch (error) {
            console.warn("[EditTokenUIManager] Error updating description:", error);
            resolve(false);
          }
        };

        checkAndUpdate();
      });
    }

    /**
     * Update multiple tags in one single modal edit.
     * @param {string} networkId - The network ID of the token to edit
     * @param {string[]} tagsToRemove - Tag keys to remove first
     * @param {string|null} tagToSet - Tag key to set after removals
     * @param {*} tagValue - Tag value for tagToSet
     * @returns {Promise<boolean>} True if successfully updated and saved
     */
    async updateTokenTags(networkId, tagsToRemove = [], tagToSet = null, tagValue = null) {
      return this.updateTokenDescription(networkId, (currentDescription) => {
        let nextDescription = String(currentDescription || "");

        const uniqueTagsToRemove = Array.from(new Set((tagsToRemove || []).filter(Boolean)));
        uniqueTagsToRemove.forEach((tagKey) => {
          nextDescription = window._n21_.utils.removeTokenTag(nextDescription, tagKey);
        });

        if (tagToSet) {
          nextDescription = window._n21_.utils.setTokenTag(nextDescription, tagToSet, tagValue);
        }

        return nextDescription;
      });
    }

    /**
     * Set or update a generic token tag in description
     * @param {string} networkId - The network ID of the token to edit
     * @param {string} tagKey - The tag key (e.g., 'user', 'l')
     * @param {*} tagValue - The tag value
     * @returns {Promise<boolean>} True if successfully set and saved
     */
    async setTokenTag(networkId, tagKey, tagValue) {
      return this.updateTokenDescription(networkId, (currentDescription) => {
        return window._n21_.utils.setTokenTag(currentDescription, tagKey, tagValue);
      });
    }

    /**
     * Remove a generic token tag from description
     * @param {string} networkId - The network ID of the token to edit
     * @param {string} tagKey - The tag key to remove
     * @returns {Promise<boolean>} True if successfully removed and saved
     */
    async removeTokenTag(networkId, tagKey) {
      return this.updateTokenDescription(networkId, (currentDescription) => {
        return window._n21_.utils.removeTokenTag(currentDescription, tagKey);
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
  }

  // Register EditTokenUIManager
  const { registerManager } = window._n21_.utils;
  registerManager("EditTokenUIManager", EditTokenUIManager);
})();
