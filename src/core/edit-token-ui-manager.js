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
     * Saving the edit form makes Nivel20 drop a token's native link to its
     * character (tokenizable_id). When another tag is written on a token
     * linked only that way, add [char:id] in the same save to keep the link.
     * @private
     */
    _keepNativeLink(networkId, description, tagKey) {
      if (tagKey === "char") return description;
      const utils = window._n21_.utils;
      if (utils.parseTokenTag(description, "char")) return description;
      const nativeId = this._tokenManager.getNativeCharacterId?.(networkId);
      return nativeId ? utils.setTokenTag(description, "char", nativeId) : description;
    }

    /**
     * Set or update a generic token tag in description
     * @param {string} networkId - The network ID of the token to edit
     * @param {string} tagKey - The tag key (e.g., 'user', 'l')
     * @param {*} tagValue - The tag value
     * @returns {Promise<boolean>} True if successfully set and saved
     */
    setTokenTag(networkId, tagKey, tagValue) {
      return this._editDescription(networkId, tagKey, (text) =>
        window._n21_.utils.setTokenTag(text, tagKey, tagValue),
      );
    }

    /**
     * Remove a generic token tag from description
     * @param {string} networkId - The network ID of the token to edit
     * @param {string} tagKey - The tag key to remove
     * @returns {Promise<boolean>} True if successfully removed and saved
     */
    removeTokenTag(networkId, tagKey) {
      return this._editDescription(networkId, tagKey, (text) =>
        window._n21_.utils.removeTokenTag(text, tagKey),
      );
    }

    /**
     * Edit a token's description through Nivel20's (single, shared) token
     * form. Edits run one at a time: opening the form while a previous edit
     * is still on screen would read and save the previous token's data onto
     * this one.
     * @private
     */
    _editDescription(networkId, tagKey, transform) {
      const run = () => this._runEdit(networkId, tagKey, transform);
      this._editChain = (this._editChain || Promise.resolve()).then(run, run);
      return this._editChain;
    }

    /**
     * Nivel20 applies a saved token form to whatever token is selected when
     * the save finishes (window.selectedSchema). Pin it to the token being
     * edited, so changing the selection meanwhile can't overwrite another
     * token, and tokens can be edited without being selected.
     * @private
     */
    _hookSaveTarget() {
      const original = window.updateExistingAsset;
      if (typeof original !== "function" || original.__n21Pinned) return;
      const self = this;
      const pinned = function (...args) {
        const target = self._editTarget ? self._tokenManager.getTokenSchema(self._editTarget) : null;
        if (!target) return original.apply(this, args);
        const previous = window.selectedSchema;
        window.selectedSchema = target;
        try {
          return original.apply(this, args);
        } finally {
          window.selectedSchema = previous;
        }
      };
      pinned.__n21Pinned = true;
      window.updateExistingAsset = pinned;
    }

    /** @private */
    async _runEdit(networkId, tagKey, transform) {
      if (!this._tokenManager) {
        console.warn("[EditTokenUIManager] TokenManager not available");
        return false;
      }
      const schema = this._tokenManager.getTokenSchema(networkId);
      if (!schema) {
        console.warn("[EditTokenUIManager] Token schema not found");
        return false;
      }
      if (typeof window.editOfflineAsset !== "function") {
        console.warn("[EditTokenUIManager] editOfflineAsset function not available");
        return false;
      }

      let metadata = {};
      try {
        metadata = JSON.parse(typeof schema.metadata === "string" ? schema.metadata : "{}");
      } catch (error) {
        metadata = {};
      }
      metadata.invisible = schema.invisible || false;
      metadata.locked = schema.locked || false;
      metadata.clears_fog = (schema.fogLightRadius || 0) > 0;

      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const formVisible = () => $("#tabletop_asset_description").is(":visible");
      const until = async (test, timeoutMs) => {
        const started = Date.now();
        while (!test()) {
          if (Date.now() - started > timeoutMs) return false;
          await wait(100);
        }
        return true;
      };

      // A previous edit's form must be gone before reusing the form.
      if (!(await until(() => !formVisible(), 5000))) {
        console.warn("[EditTokenUIManager] Token form is still open");
        return false;
      }

      window.editOfflineAsset(metadata);

      // Wait until the form shows THIS token (same name and description).
      const expectedName = String(metadata.name ?? schema.name ?? "");
      const expectedDescription = String(metadata.description ?? "");
      const ready = await until(
        () =>
          formVisible() &&
          String($("#tabletop_asset_name").val() ?? "") === expectedName &&
          String($("#tabletop_asset_description").val() ?? "") === expectedDescription,
        5000,
      );
      const $form = $("#TabletopTokenForm");
      if (!ready || !$form.length) {
        console.warn("[EditTokenUIManager] Token form did not load this token; edit skipped");
        $form.closest(".modal").modal?.("hide");
        return false;
      }

      this._hookSaveTarget();
      this._editTarget = networkId;
      try {
        const $description = $("#tabletop_asset_description");
        let newValue = transform($description.val() || "");
        newValue = this._keepNativeLink(networkId, newValue, tagKey);
        $description.val(newValue);
        $form.submit();
        // The form closes when the save is done; next edits wait for it.
        return await until(() => !formVisible(), 8000);
      } catch (error) {
        console.warn("[EditTokenUIManager] Error editing token description:", error);
        return false;
      } finally {
        this._editTarget = null;
      }
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
