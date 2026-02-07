(() => {
  /* =======================
       SessionStateManager - Manage global session state via hidden chat messages
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * SessionStateManager provides a unified interface for managing session state
   * Uses hidden chat messages to synchronize state across all players
   * Only Game Masters can set the state, all players can read it
   * Depends on: ChatManager, PlayerManager
   */
  class SessionStateManager extends BaseManager {
    constructor() {
      super();
      this._state = {};
      this._listeners = [];
      this._chatManager = null;
      this._playerManager = null;
      this._unsubscribeChatListener = null;
      this._pendingMessageIds = new Set();
      this._messageVisibility = "hidden";
      this._stateKey = "state.session";
      this._readyKey = "state.ready";
      this._requestKey = "state.request";
      this._storageKey = "n21.session_state";
      this._initialStateResolver = null;
    }

    /**
     * Initialize the manager - sets up chat listener
     */
    async init() {
      // Load dependencies
      const { loadManagers } = window._n21_;
      const [ChatManager, PlayerManager] = await loadManagers(
        "ChatManager",
        "PlayerManager",
      );
      this._chatManager = ChatManager;
      this._playerManager = PlayerManager;

      if (!this._chatManager) {
        console.warn("[SessionStateManager] ChatManager not available");
        return;
      }

      if (!this._playerManager) {
        console.warn("[SessionStateManager] PlayerManager not available");
        return;
      }

      // Everyone listens to chat messages for state updates
      this._setupChatListener();

      await this._initializeState();

      // Announce readiness to receive state
      this._sendReadyMessage();

      // Lead GM sends the initial state to everyone
      if (this._playerManager.isLeadGameMaster()) {
        this._sendStateUpdate();
      }
    }

    /**
     * Setup listener for incoming state messages
     * @private
     */
    _setupChatListener() {
      this._unsubscribeChatListener = this._chatManager.onMessage(
        (messageData) => {
          const senderUserId = messageData.raw?.user_id;

          // Parse the message
          const encoded = messageData.message.split("||")[1];
          if (!encoded) return; // No encoded part

          const decoded = this._chatManager.decodeJsonMessage(
            encoded.replace("]]", ""),
          );

          if (decoded && decoded.key === this._readyKey) {
            const myUserId = this._playerManager.getMyUserId();
            if (senderUserId && myUserId && senderUserId === myUserId) {
              return false;
            }

            if (this._playerManager.isLeadGameMaster()) {
              this._sendStateUpdate();
            }
            return false;
          }

          if (decoded && decoded.key === this._requestKey) {
            const mySessionId = this._playerManager.getMySessionId();
            const targetSessionId = decoded.targetSessionId
              ? String(decoded.targetSessionId)
              : "";

            if (
              this._playerManager.isGameMaster() &&
              mySessionId &&
              targetSessionId &&
              mySessionId === targetSessionId
            ) {
              this._sendStateUpdate();
            }

            return false;
          }

          if (decoded && decoded.key === this._stateKey) {
            // Ignore session state updates from non-GMs
            if (!this._playerManager.isUserGameMaster(senderUserId)) {
              return;
            }

            const messageId = decoded.__messageId;
            if (messageId && this._pendingMessageIds.has(messageId)) {
              this._pendingMessageIds.delete(messageId);
              return false;
            }

            // Update state from incoming message
            this._updateStateFromMessage(decoded);
            return false; // Stop propagation of state messages
          }
        },
      );
    }

    /**
     * Initialize state from storage or request from lead GM
     * @private
     */
    async _initializeState() {
      const connectedGms = this._getConnectedGms();
      if (!connectedGms.length) {
        this._applyState(this._loadStateFromStorage(), false);
        return;
      }

      const targetSessionId = this._getLowestGmSessionIdExcludingMe(connectedGms);
      if (!targetSessionId) {
        this._applyState(this._loadStateFromStorage(), false);
        return;
      }

      const statePromise = new Promise((resolve) => {
        this._initialStateResolver = resolve;
      });

      this._chatManager.sendJsonMessage(
        { targetSessionId },
        { visibility: this._messageVisibility },
        this._requestKey,
      );

      await statePromise;
    }

    /**
     * Get connected GMs
     * @private
     */
    _getConnectedGms() {
      const players = this._playerManager.getPlayerList();
      return (players || []).filter(
        (player) =>
          player?.connected && this._playerManager.isUserGameMaster(player.userId),
      );
    }

    /**
     * Get the lowest GM sessionId excluding the current user
     * @private
     */
    _getLowestGmSessionIdExcludingMe(players) {
      const mySessionId = this._playerManager.getMySessionId();
      let lowest = "";

      for (const player of players) {
        const sessionId = player?.sessionId ? String(player.sessionId) : "";
        if (!sessionId || sessionId === mySessionId) continue;

        if (
          !lowest ||
          sessionId.localeCompare(lowest, undefined, { numeric: true }) < 0
        ) {
          lowest = sessionId;
        }
      }

      return lowest || "";
    }

    /**
     * Update internal state from a decoded message payload
     * @private
     */
    _updateStateFromMessage(payload) {
      const newState = {};
      let nextCount = 0;
      let changed = false;

      for (const [key, value] of Object.entries(payload)) {
        if (key === "key" || key === "__messageId") continue;

        newState[key] = value;
        nextCount += 1;

        if (!changed && this._state[key] !== value) {
          changed = true;
        }
      }

      if (!changed) {
        changed = Object.keys(this._state).length !== nextCount;
      }

      if (changed) {
        this._applyState(newState, true);
      }

      if (this._initialStateResolver) {
        if (!changed) {
          this._applyState(newState, false);
        }
        this._initialStateResolver();
        this._initialStateResolver = null;
      }
    }

    /**
     * Notify all listeners of state change
     * @private
     */
    _notifyListeners() {
      for (const listener of this._listeners) {
        try {
          listener(this._state);
        } catch (error) {
          console.warn("[SessionStateManager] Listener error:", error);
        }
      }
    }

    /**
     * Get the current session state (read-only object)
     * @returns {Object} Current state object
     */
    get state() {
      return { ...this._state };
    }

    /**
     * Set the session state (only works for Game Masters)
     * @param {Object} newState - The new state values to set
     * @returns {boolean} True if state was set, false if user is not GM
     */
    setState(newState) {
      if (!this._playerManager.isGameMaster()) {
        console.warn("[SessionStateManager] Only Game Masters can set state");
        return false;
      }

      if (!this._chatManager) {
        console.warn("[SessionStateManager] ChatManager not available");
        return false;
      }

      // Update local state immediately
      const mergedState = { ...this._state };
      let changed = false;

      for (const [key, value] of Object.entries(newState)) {
        if (value === undefined || value === null) {
          if (Object.prototype.hasOwnProperty.call(mergedState, key)) {
            delete mergedState[key];
            changed = true;
          }
          continue;
        }

        if (this._state[key] !== value) {
          changed = true;
        }
        mergedState[key] = value;
      }

      if (!changed) {
        return true; // No changes needed
      }

      this._applyState(mergedState, true);

      // Send state update to chat
      const { uuid } = window._n21_.utils;
      const messageId = uuid();
      this._pendingMessageIds.add(messageId);
      const payload = { ...mergedState, __messageId: messageId };
      this._chatManager.sendJsonMessage(
        payload,
        { visibility: this._messageVisibility },
        this._stateKey,
      );

      return true;
    }

    /**
     * Apply a new state locally, persist it, and optionally notify listeners
     * @private
     */
    _applyState(nextState, notify = true) {
      this._state = { ...nextState };
      this._persistStateToStorage(this._state);
      if (notify) {
        this._notifyListeners();
      }
    }

    /**
     * Load state from local storage
     * @private
     */
    _loadStateFromStorage() {
      try {
        const raw = window.localStorage?.getItem?.(this._storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    /**
     * Persist state to local storage
     * @private
     */
    _persistStateToStorage(state) {
      try {
        window.localStorage?.setItem?.(
          this._storageKey,
          JSON.stringify(state),
        );
      } catch (error) {
        // ignore persistence errors
      }
    }

    /**
     * Send a ready message so GMs can reply with current state
     * @private
     */
    _sendReadyMessage() {
      if (!this._chatManager) return;

      this._chatManager.sendJsonMessage(
        { t: "ready" },
        { visibility: this._messageVisibility },
        this._readyKey,
      );
    }

    /**
     * Send the current state to others (GM only)
     * @private
     */
    _sendStateUpdate() {
      if (!this._playerManager.isGameMaster()) return;
      if (!this._chatManager) return;

      const { uuid } = window._n21_.utils;
      const messageId = uuid();
      this._pendingMessageIds.add(messageId);
      const payload = { ...this._state, __messageId: messageId };
      this._chatManager.sendJsonMessage(
        payload,
        { visibility: this._messageVisibility },
        this._stateKey,
      );
    }

    /**
     * Subscribe to state changes
     * Callback receives the current state object
     * @param {Function} callback - Function to call on state change
     * @returns {Function} Unsubscribe function
     */
    onChange(callback) {
      if (typeof callback !== "function") return () => {};

      this._listeners.push(callback);

      // Return unsubscribe function
      return () => {
        const index = this._listeners.indexOf(callback);
        if (index > -1) {
          this._listeners.splice(index, 1);
        }
      };
    }

    /**
     * Clean up resources
     */
    destroy() {
      if (this._unsubscribeChatListener) {
        this._unsubscribeChatListener();
      }
      this._listeners = [];
    }
  }

  // Register SessionStateManager
  const { registerManager } = window._n21_.utils;
  registerManager("SessionStateManager", SessionStateManager);
})();
