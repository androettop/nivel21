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
      this._stateKey = "state.session";
      this._readyKey = "state.ready";
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

      // Announce readiness to receive state
      this._sendReadyMessage();
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
            if (this._playerManager.isLeadGameMaster()) {
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
     * Update internal state from a decoded message payload
     * @private
     */
    _updateStateFromMessage(payload) {
      const newState = { ...this._state };
      let changed = false;

      for (const [key, value] of Object.entries(payload)) {
        if (
          key !== "key" &&
          key !== "__messageId" &&
          this._state[key] !== value
        ) {
          newState[key] = value;
          changed = true;
        }
      }

      if (changed) {
        this._state = newState;
        this._notifyListeners();
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
      const mergedState = { ...this._state, ...newState };
      let changed = false;

      for (const [key, value] of Object.entries(newState)) {
        if (this._state[key] !== value) {
          changed = true;
        }
      }

      if (!changed) {
        return true; // No changes needed
      }

      this._state = mergedState;

      // Notify local listeners before sending
      this._notifyListeners();

      // Send state update to chat
      const { uuid } = window._n21_.utils;
      const messageId = uuid();
      this._pendingMessageIds.add(messageId);
      const payload = { ...mergedState, __messageId: messageId };
      this._chatManager.sendJsonMessage(
        payload,
        { visibility: "hidden" },
        this._stateKey,
      );

      return true;
    }

    /**
     * Send a ready message so GMs can reply with current state
     * @private
     */
    _sendReadyMessage() {
      if (!this._chatManager) return;

      this._chatManager.sendJsonMessage(
        { t: "ready" },
        { visibility: "hidden" },
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
        { visibility: "hidden" },
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
