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
     * Open the token edit form with the given metadata
     * @param {string} networkId - The network ID of the token to edit
     * @param {string} userName - The username to add to the description (optional)
     * @returns {Promise<boolean>} True if form was opened and saved successfully
     */
    async openTokenEditForm(networkId, userName = null) {
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

      // Wait for the form to appear and then modify the description
      if (userName) {
        const success = await this._updateDescriptionWithUserMarker(userName);
        if (!success) return false;
      }

      return true;
    }

    /**
     * Update the description field with user marker and save the form
     * @private
     * @param {string} userName - The username to add to the description
     * @returns {Promise<boolean>} True if successfully updated and saved
     */
    async _updateDescriptionWithUserMarker(userName) {
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds with 100ms intervals

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
            const inputMaxLength = $description.attr("maxlength")
              ? parseInt($description.attr("maxlength"), 10)
              : 500;

            // Remove all user markers from current value
            const cleanedValue = currentValue.replace(/\s*\[user:\s*"[^"]*"\s*\]\s*/gi, "").trim();

            // Create the user marker string
            const userString = ` [user:"${userName}"]`;

            // Ensure we have enough space and append the user marker
            const truncatedValue = cleanedValue.substring(
              0,
              Math.max(0, inputMaxLength - userString.length),
            );
            const newValue = truncatedValue + userString;

            // Set the new description
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
            console.warn("[EditTokenUIManager] Error updating description:", error);
            resolve(false);
          }
        };

        // Start checking for the form field
        checkAndUpdate();
      });
    }

    /**
     * Remove all user markers from token description and save
     * @param {string} networkId - The network ID of the token to edit
     * @returns {Promise<boolean>} True if successfully cleared and saved
     */
    async clearTokenUserMarkers(networkId) {
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

      // Wait for the form and clear all user markers
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 50;

        const checkAndClear = () => {
          attempts += 1;

          const $description = $("#tabletop_asset_description");
          if (!$description.length || !$description.is(":visible")) {
            if (attempts < maxAttempts) {
              setTimeout(checkAndClear, 100);
            } else {
              console.warn("[EditTokenUIManager] Form description field did not appear");
              resolve(false);
            }
            return;
          }

          try {
            const currentValue = $description.val() || "";
            // Remove all user markers
            const cleanedValue = currentValue.replace(/\s*\[user:\s*"[^"]*"\s*\]\s*/gi, "").trim();

            // Set the cleaned description
            $description.val(cleanedValue);

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
            console.warn("[EditTokenUIManager] Error clearing markers:", error);
            resolve(false);
          }
        };

        checkAndClear();
      });
    }
  }

  // Register EditTokenUIManager
  const { registerManager } = window._n21_.utils;
  registerManager("EditTokenUIManager", EditTokenUIManager);
})();
