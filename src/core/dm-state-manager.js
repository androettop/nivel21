(() => {
  /* =======================
       DMStateManager - Global state synchronization between DM and players
    ======================= */

  const { uuid } = window._n21_;

  // DMStateManager provides a unified interface for synchronizing state between DM and players
  // The DM owns the state and broadcasts changes to all players via hidden chat messages
  // Players receive updates and can subscribe to state changes
  const DMStateManager = {
    _state: {},
    _listeners: [],
    _initialized: false,
    _isDM: false,
    _playerListInterval: null,
    _lastPlayerList: [],
    _pendingUpdateIds: new Set(), // Track UUIDs of updates initiated by DM for optimistic updates
    _localStorageKey: "n21_sync_state",
    _stateMessagePrefix: "[[n21:state-sync||",

    // Check if current user is the DM (has ALL_TEAMS in their teams)
    _checkIsDM() {
      try {
        const playersList = window.players?.list?.() || [];
        const me = playersList.find((p) => p.isMe);
        if (me && Array.isArray(me.teams)) {
          return me.teams.includes("ALL_TEAMS");
        }
        return false;
      } catch (error) {
        return false;
      }
    },

    // Get current connected player IDs (excluding self)
    _getConnectedPlayerIds() {
      try {
        const list = window.players?.list?.() || [];
        return list
          .filter((p) => p.connected && !p.isMe)
          .map((p) => p.odooId)
          .filter(Boolean)
          .sort()
          .join(",");
      } catch (error) {
        return "";
      }
    },

    // Save state to localStorage (DM only)
    _saveToLocalStorage() {
      if (!this._isDM) return;
      try {
        localStorage.setItem(
          this._localStorageKey,
          JSON.stringify(this._state),
        );
      } catch (error) {
        console.warn(
          "[DMStateManager] Could not save to localStorage:",
          error,
        );
      }
    },

    // Load state from localStorage (DM only)
    _loadFromLocalStorage() {
      if (!this._isDM) return;
      try {
        const stored = localStorage.getItem(this._localStorageKey);
        if (stored) {
          this._state = JSON.parse(stored);
        }
      } catch (error) {
        console.warn(
          "[DMStateManager] Could not load from localStorage:",
          error,
        );
        this._state = {};
      }
    },

    // Broadcast current state to all players via hidden chat message
    _broadcastState(updateId) {
      if (!this._isDM) return;

      const payload = {
        updateId: updateId || uuid(),
        state: this._state,
        timestamp: Date.now(),
      };

      const message = this._stateMessagePrefix + JSON.stringify(payload) + "]]";

      // Send as hidden message (empty visibility makes it hidden from chat UI)
      if (typeof window.sendChatMessage === "function") {
        window.sendChatMessage(message, {
          visibility: "hidden",
        });
      }
    },

    // Parse incoming message to extract state sync payload
    _parseStateMessage(message) {
      if (!message || typeof message !== "string") return null;
      if (!message.startsWith(this._stateMessagePrefix)) return null;

      try {
        const jsonStr = message.slice(
          this._stateMessagePrefix.length,
          message.lastIndexOf("]]"),
        );
        return JSON.parse(jsonStr);
      } catch (error) {
        return null;
      }
    },

    // Notify all listeners of state change
    _notifyListeners(newState, oldState) {
      for (const listener of this._listeners) {
        try {
          listener(newState, oldState);
        } catch (error) {
          console.warn("[DMStateManager] Listener error:", error);
        }
      }
    },

    // Start observing player list for changes (DM only)
    _startPlayerListObserver() {
      if (!this._isDM || this._playerListInterval) return;

      this._lastPlayerList = this._getConnectedPlayerIds();

      this._playerListInterval = setInterval(() => {
        const currentList = this._getConnectedPlayerIds();
        if (currentList !== this._lastPlayerList) {
          // New players joined, broadcast current state
          this._lastPlayerList = currentList;
          this._broadcastState();
        }
      }, 1000);
    },

    // Stop player list observer
    _stopPlayerListObserver() {
      if (this._playerListInterval) {
        clearInterval(this._playerListInterval);
        this._playerListInterval = null;
      }
    },

    // Hook into ChatManager to receive state sync messages
    _hookChatHandler() {
      const self = this;
      const { ChatManager } = window._n21_.managers;

      if (!ChatManager) {
        console.warn(
          "[DMStateManager] ChatManager not available, retrying...",
        );
        setTimeout(() => self._hookChatHandler(), 500);
        return;
      }

      ChatManager.onMessage((messageData) => {
        const payload = self._parseStateMessage(messageData.message);
        if (!payload) return true; // Not a state sync message, continue processing

        // Block state sync messages from appearing in chat
        // (they are internal protocol messages)

        // If we're the DM, check if this is our own update (optimistic update)
        if (self._isDM) {
          if (self._pendingUpdateIds.has(payload.updateId)) {
            // This is our own update, remove from pending and ignore
            // (we already applied it optimistically)
            self._pendingUpdateIds.delete(payload.updateId);
          }
          // DM ignores their own broadcasts
          return false;
        }

        // Player receives state update
        const oldState = { ...self._state };
        self._state = payload.state || {};
        self._notifyListeners(self._state, oldState);

        return false; // Block message from chat UI
      });
    },

    // Initialize the handler
    init() {
      if (this._initialized) return;

      const self = this;

      // Wait for players to be available to determine if we're the DM
      const checkAndInit = () => {
        if (!window.players?.list) {
          setTimeout(checkAndInit, 500);
          return;
        }

        self._isDM = self._checkIsDM();
        self._initialized = true;

        if (self._isDM) {
          // DM: Load state from localStorage and start broadcasting
          self._loadFromLocalStorage();
          self._startPlayerListObserver();
          // Broadcast initial state
          self._broadcastState();
        }

        // Hook into chat to receive state messages
        self._hookChatHandler();
      };

      checkAndInit();
    },

    // Get current state (read-only copy)
    get state() {
      return { ...this._state };
    },

    // Set state (DM only)
    // Returns true if state was set, false if not DM
    set(newState) {
      if (!this._initialized) {
        console.warn("[DMStateManager] Not initialized yet");
        return false;
      }

      if (!this._isDM) {
        console.warn("[DMStateManager] Only the DM can set state");
        return false;
      }

      const oldState = { ...this._state };
      this._state = newState || {};

      // Save to localStorage
      this._saveToLocalStorage();

      // Generate update ID for optimistic update tracking
      const updateId = uuid();
      this._pendingUpdateIds.add(updateId);

      // Notify listeners immediately (optimistic update for DM)
      this._notifyListeners(this._state, oldState);

      // Broadcast to players
      this._broadcastState(updateId);

      return true;
    },

    // Update state by merging with current state (DM only)
    // Returns true if state was updated, false if not DM
    update(partialState) {
      if (!this._initialized) {
        console.warn("[DMStateManager] Not initialized yet");
        return false;
      }

      if (!this._isDM) {
        console.warn("[DMStateManager] Only the DM can update state");
        return false;
      }

      const newState = { ...this._state, ...partialState };
      return this.set(newState);
    },

    // Subscribe to state changes
    // Callback receives (newState, oldState)
    // Returns unsubscribe function
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
    },

    // Check if current user is the DM
    isDM() {
      return this._isDM;
    },

    // Force re-broadcast current state (DM only)
    // Useful for manual sync
    broadcast() {
      if (!this._isDM) {
        console.warn("[DMStateManager] Only the DM can broadcast state");
        return false;
      }
      this._broadcastState();
      return true;
    },
  };

  // Expose DMStateManager through managers namespace
  window._n21_.managers = window._n21_.managers || {};
  window._n21_.managers.DMStateManager = DMStateManager;

  // Initialize DMStateManager
  DMStateManager.init();
})();
