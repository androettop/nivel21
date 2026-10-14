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
     * Root schema collection of tokens (null until the room state is ready).
     * @returns {Object|null}
     */
    _getSchemaRoot() {
      try {
        const root = this._getEntityManager()?.schema?.();
        return root && typeof root.onAdd === "function" ? root : null;
      } catch (_error) {
        return null;
      }
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
     * Get the network IDs of all known token instances
     * @returns {string[]} Array of networkId strings (empty if none)
     */
    getAllTokenIds() {
      const instances = this._getEntityManager()?.instances;
      if (!instances || typeof instances.keys !== "function") return [];
      return Array.from(instances.keys());
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
     * Read a [key:value] tag from a token's description.
     * @param {string} networkId
     * @param {string} key
     * @returns {string|null}
     */
    getTokenTag(networkId, key) {
      const schema = this.getTokenSchema(networkId);
      if (!schema) return null;
      let description = "";
      try {
        description = JSON.parse(
          typeof schema.metadata === "string" ? schema.metadata : "{}",
        )?.description || "";
      } catch (_error) {}
      return window._n21_.utils.parseTokenTag(String(description), key);
    }

    /**
     * Screen rectangle (canvas CSS pixels) covered by a token, or null.
     * @param {string} networkId
     * @param {Object} cameraManager - CameraManager (for worldToScreen)
     * @returns {{x: number, y: number, width: number, height: number}|null}
     */
    getTokenScreenRect(networkId, cameraManager) {
      const pos = this.getTokenPosition(networkId);
      if (!pos || !cameraManager) return null;
      const scale = this.getTokenScale(networkId) || { x: 1, z: 1 };
      const halfX = Math.abs(scale.x || 1) / 2;
      const halfZ = Math.abs(scale.z || 1) / 2;
      const corners = [
        [pos.x - halfX, pos.z - halfZ],
        [pos.x + halfX, pos.z - halfZ],
        [pos.x + halfX, pos.z + halfZ],
        [pos.x - halfX, pos.z + halfZ],
      ]
        .map(([wx, wz]) => cameraManager.worldToScreen(wx, wz, 0))
        .filter(Boolean);
      if (corners.length !== 4) return null;
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }

    /**
     * Subscribe to token metadata changes
     * Automatically registers listeners on all tokens (current and future)
     * @param {Function} callback - Called with (networkId, metadataString) when metadata changes
     * @returns {Function} Unsubscribe function
     */
    onTokenMetadataChange(callback) {
      if (typeof callback !== "function") return () => {};

      const schemaRoot = this._getSchemaRoot();
      if (!schemaRoot) {
        // The room state may not be connected yet; subscribe when it is.
        setTimeout(() => this.onTokenMetadataChange(callback), 500);
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
     * Subscribe to token tag changes (add/remove on the token's tags set).
     * Automatically registers listeners on all tokens (current and future).
     * Callback receives (networkId).
     * @param {Function} callback - Tag change callback
     * @returns {Function} Unsubscribe function (best effort)
     */
    onTokenTagsChange(callback) {
      if (typeof callback !== "function") return () => {};

      const schemaRoot = this._getSchemaRoot();
      if (!schemaRoot) {
        // The room state may not be connected yet; subscribe when it is.
        setTimeout(() => this.onTokenTagsChange(callback), 500);
        return () => {};
      }

      schemaRoot.onAdd((schema, networkId) => {
        if (!schema || !networkId) return;

        const token = this.getToken(networkId);
        const tags = token?.tags;

        if (tags && typeof tags.on === "function") {
          try {
            tags.on("change", () => {
              try {
                callback(networkId);
              } catch (_error) {}
            });
          } catch (_error) {}
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
     * Get the local scale of a token
     * @param {string} networkId - The network ID of the token
     * @returns {Object|null} The scale {x, y, z} or null if not found
     */
    getTokenScale(networkId) {
      const token = this.getToken(networkId);
      if (!token || typeof token.getLocalScale !== "function") return null;

      const scale = token.getLocalScale();
      if (!scale) return null;

      return { x: scale.x, y: scale.y, z: scale.z };
    }

    /**
     * Get token visibility state
     * @param {string} networkId - The network ID of the token
     * @returns {{hidden: boolean, translucent: boolean}|null} Visibility state or null if token not found
     */
    getTokenVisibility(networkId) {
      const token = this.getToken(networkId);
      if (!token) return null;

      return this._readVisibility(token);
    }

    /**
     * Read the visibility Nivel20 is currently applying to a token entity
     * (kept by its visibility handler script; the entity has no flags).
     * @param {Object} token - Token entity
     * @returns {{hidden: boolean, translucent: boolean}}
     */
    _readVisibility(token) {
      const handler = token?.script?.scripts?.find(
        (script) =>
          script?.visibility &&
          typeof script.visibility === "object" &&
          "hidden" in script.visibility,
      );
      const state = handler?.visibility;
      if (!state) {
        return { hidden: !!token?.hidden, translucent: !!token?.translucent };
      }
      return { hidden: !!state.hidden, translucent: !!state.seeThrough };
    }

    /**
     * Subscribe to token visibility changes
     * Callback receives (networkId, hidden, translucent)
     * @param {Function} callback - Visibility callback
     * @returns {Function} Unsubscribe function (best effort)
     */
    onTokenVisibilityChange(callback) {
      if (typeof callback !== "function") return () => {};

      const schemaRoot = this._getSchemaRoot();
      if (!schemaRoot) {
        // The room state may not be connected yet; subscribe when it is.
        setTimeout(() => this.onTokenVisibilityChange(callback), 500);
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
          const state = this._readVisibility(token);
          callback(networkId, state.hidden, state.translucent);
        } catch (_error) {}
      });

      return () => {};
    }

    /* ----------------- Local visibility overrides ----------------- */

    /**
     * Hide (or make translucent) a token ONLY on this client, on top of what
     * Nivel20 decides. It can never reveal a token the server hides: the
     * effective state is always the most restrictive of the native state and
     * every active override. Several features can override the same token
     * independently (keyed by `source`).
     *
     * Implemented by re-emitting the token's native "hidden" event, which
     * Nivel20's own handlers use to hide the image, border and name label.
     *
     * @param {string} networkId
     * @param {string} source - Feature key owning this override
     * @param {"hidden"|"translucent"|null} mode - null removes the override
     */
    setLocalVisibilityOverride(networkId, source, mode) {
      if (!networkId || !source) return;
      this._ensureVisibilityOverrides();

      let sources = this._visibilityOverrides.get(networkId);
      if (mode) {
        if (!sources) {
          sources = new Map();
          this._visibilityOverrides.set(networkId, sources);
        }
        if (sources.get(source) === mode) return;
        sources.set(source, mode);
      } else {
        if (!sources || !sources.has(source)) return;
        sources.delete(source);
        if (!sources.size) this._visibilityOverrides.delete(networkId);
      }

      this._applyVisibilityOverride(networkId);
    }

    /**
     * Current local override mode for a token from a given source.
     * @returns {"hidden"|"translucent"|null}
     */
    getLocalVisibilityOverride(networkId, source) {
      return this._visibilityOverrides?.get(networkId)?.get(source) || null;
    }

    _ensureVisibilityOverrides() {
      if (this._visibilityOverrides) return;
      this._visibilityOverrides = new Map(); // networkId -> Map(source -> mode)
      this._nativeVisibility = new Map(); // networkId -> { hidden, translucent }
      this._visibilityHooked = new WeakSet(); // token entities with a listener
      this._applyingOverride = false;

      const schemaRoot = this._getSchemaRoot();
      if (schemaRoot) {
        // Tokens can be re-created by Nivel20 (e.g. after an edit); hook every
        // new instance and re-apply its override.
        schemaRoot.onAdd((_schema, networkId) => {
          if (!networkId) return;
          setTimeout(() => {
            this._hookTokenVisibility(networkId);
            if (this._visibilityOverrides.has(networkId)) {
              this._applyVisibilityOverride(networkId);
            }
          }, 0);
        });
      }
    }

    _hookTokenVisibility(networkId) {
      const token = this.getToken(networkId);
      if (!token || typeof token.on !== "function") return null;
      if (this._visibilityHooked.has(token)) return token;
      this._visibilityHooked.add(token);

      if (!this._nativeVisibility.has(networkId)) {
        this._nativeVisibility.set(networkId, this._readVisibility(token));
      }

      token.on("hidden", (hidden, translucent) => {
        // Ignore the events we emit ourselves; track the real native state.
        if (this._applyingOverride) return;
        this._nativeVisibility.set(networkId, {
          hidden: !!hidden,
          translucent: !!translucent,
        });
        if (this._visibilityOverrides.has(networkId)) {
          // Re-apply after Nivel20 finished handling its own event.
          Promise.resolve().then(() => this._applyVisibilityOverride(networkId));
        }
      });
      return token;
    }

    _applyVisibilityOverride(networkId) {
      const token = this._hookTokenVisibility(networkId);
      if (!token || typeof token.fire !== "function") return;

      const native = this._nativeVisibility.get(networkId) || {
        hidden: false,
        translucent: false,
      };
      const modes = Array.from(this._visibilityOverrides.get(networkId)?.values() || []);

      let hidden = native.hidden;
      let translucent = native.translucent;
      const nativeFullyHidden = native.hidden && !native.translucent;

      if (!nativeFullyHidden) {
        if (modes.includes("hidden")) {
          hidden = true;
          translucent = false;
        } else if (modes.includes("translucent")) {
          hidden = true;
          translucent = true;
        }
      }

      this._applyingOverride = true;
      try {
        token.fire("hidden", hidden, translucent);
      } catch (_error) {
      } finally {
        this._applyingOverride = false;
      }
    }

    /**
     * Prevent this client from selecting a token (removes Nivel20's
     * "selectable" tag locally) for a given reason. The tag is restored only
     * when no reason blocks it anymore and only if we were the ones removing it.
     * @param {string} networkId
     * @param {string} reason - Feature key
     * @param {boolean} blocked
     */
    setSelectionBlocked(networkId, reason, blocked) {
      if (!networkId || !reason) return;
      if (!this._selectionBlocks) {
        this._selectionBlocks = new Map(); // networkId -> Set(reason)
        this._removedSelectable = new Set(); // networkIds we stripped
      }

      let reasons = this._selectionBlocks.get(networkId);
      if (blocked) {
        if (!reasons) {
          reasons = new Set();
          this._selectionBlocks.set(networkId, reasons);
        }
        reasons.add(reason);
      } else if (reasons) {
        reasons.delete(reason);
        if (!reasons.size) this._selectionBlocks.delete(networkId);
      }

      this.refreshSelectionBlock(networkId);
    }

    /**
     * Re-apply the selection block of a token (Nivel20 re-adds "selectable"
     * when it resets a token's tags, e.g. after an edit).
     * @param {string} networkId
     */
    refreshSelectionBlock(networkId) {
      const tags = this.getToken(networkId)?.tags;
      if (!tags || !this._selectionBlocks) return;

      const blocked = this._selectionBlocks.has(networkId);
      if (blocked) {
        if (tags.has?.("selectable")) {
          tags.remove?.("selectable");
          this._removedSelectable.add(networkId);
        }
      } else if (this._removedSelectable.has(networkId)) {
        this._removedSelectable.delete(networkId);
        if (!tags.has?.("selectable")) tags.add?.("selectable");
      }
    }

    /**
     * Keep a decoration child (e.g. an aura) out of the bounds Nivel20 uses to
     * place and size the token's name label, so big auras don't push the name
     * away from the token. Wraps the label handler once per token entity.
     * @param {string} networkId
     * @param {Object} child - Child entity to ignore
     */
    excludeChildFromLabelBounds(networkId, child) {
      const token = this.getToken(networkId);
      if (!token || !child) return;
      child.n21ExcludeFromLabelBounds = true;

      const handler = token.script?.scripts?.find(
        (script) => typeof script?.updateFollowTargetPosition === "function",
      );
      if (!handler) return;

      if (!handler.n21LabelPatched) {
        handler.n21LabelPatched = true;
        const original = handler.updateFollowTargetPosition;
        handler.updateFollowTargetPosition = function (...args) {
          const excluded = (token.children || []).filter(
            (c) => c?.n21ExcludeFromLabelBounds && c.enabled,
          );
          excluded.forEach((c) => {
            c.enabled = false;
          });
          try {
            return original.apply(this, args);
          } finally {
            excluded.forEach((c) => {
              c.enabled = true;
            });
          }
        };
      }

      handler.needsUpdate = true;
    }

    /**
     * Whether a token is blocked from selection by any reason.
     * @param {string} networkId
     * @returns {boolean}
     */
    isSelectionBlocked(networkId) {
      return !!this._selectionBlocks?.has(networkId);
    }
  }

  // Register TokenManager
  const { registerManager } = window._n21_.utils;
  registerManager("TokenManager", TokenManager);
})();
