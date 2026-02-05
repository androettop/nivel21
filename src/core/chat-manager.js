(() => {
  /* =======================
       ChatManager - Global chat abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * Debounced chat message sender to avoid duplicate messages
   * Returns a function that sends messages with 200ms debounce for identical messages from same sender
   */
  function createDebouncedChatSender(debounceMs = 200) {
    let lastMessage = "";
    let lastSender = "";
    let debounceTimer = null;

    return function sendChatMessageDebounced(messageText, options = {}) {
      const senderInfo = options.sender_info || "";
      const messageKey = `${messageText}|${senderInfo}`;
      const lastKey = `${lastMessage}|${lastSender}`;

      // Clear previous timer if it exists
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // If same message from same sender, debounce it
      if (messageKey === lastKey) {
        debounceTimer = setTimeout(() => {
          sendChatMessage(messageText, options);
          lastMessage = messageText;
          lastSender = senderInfo;
        }, debounceMs);
      } else {
        // Different message or sender, send immediately
        sendChatMessage(messageText, options);
        lastMessage = messageText;
        lastSender = senderInfo;
      }
    };
  }

  /**
   * ChatManager provides a unified interface for sending and receiving chat messages
   * Features can subscribe to incoming messages and use a consistent API to send messages
   */
  class ChatManager extends BaseManager {
    constructor() {
      super();
      this._hooked = false;
      this._listeners = [];
      this.sendDebounced = createDebouncedChatSender();
    }

    isReady() {
      const websocketReady = !!this._getSubscription();
      const sendChatMessageReady = typeof window.sendChatMessage === "function";
      return websocketReady && sendChatMessageReady;
    }

    _getSubscription() {
      try {
        return window.App?.cable?.subscriptions?.subscriptions?.[0] || null;
      } catch (error) {
        return null;
      }
    }

    /**
     * Hook into App.cable.subscriptions to intercept incoming messages
     * This is called automatically when the first listener is added
     */
    _hookSubscriptions() {
      if (this._hooked) return;

      try {
        const subscription = this._getSubscription();
        if (!subscription) {
          console.warn("[ChatManager] Could not find chat subscription");
          return;
        }

        const originalReceived = subscription.received.bind(subscription);
        const self = this;

        subscription.received = function (data) {
          // Emit event for all listeners before processing
          if (data.message_type === "chat" && data.data?.message) {
            const messageData = {
              message: data.data.message,
              senderName: data.sender_name,
              senderId: data.sender_id,
              senderInfo: data.sender_info,
              visibility: data.visibility,
              visibleForUsers: data.visible_for_users,
              icon: data.icon,
              raw: data,
            };

            // Allow listeners to modify the data
            for (const listener of self._listeners) {
              try {
                const result = listener(messageData, data);
                // If listener returns false, stop propagation
                if (result === false) return;
              } catch (error) {
                console.warn("[ChatManager] Listener error:", error);
              }
            }
          }

          originalReceived(data);
        };

        this._hooked = true;
      } catch (error) {
        console.warn("[ChatManager] Could not hook subscriptions:", error);
      }
    }

    /**
     * Subscribe to incoming chat messages
     * Callback receives (messageData, rawData)
     * @returns Unsubscribe function
     */
    onMessage(callback) {
      if (typeof callback !== "function") return;

      this._listeners.push(callback);
      this._hookSubscriptions();

      // Return unsubscribe function
      return () => {
        const index = this._listeners.indexOf(callback);
        if (index > -1) {
          this._listeners.splice(index, 1);
        }
      };
    }

    /**
     * Send a chat message with options
     * Options: { sender_info, icon, visibility }
     */
    send(text, options = {}) {
      if (!text) return;
      window.sendChatMessage(text, options);
    }
  }

  // Expose ChatManager through managers namespace
  window._n21_.managers = window._n21_.managers || {};
  window._n21_.managers.ChatManager = new ChatManager();
})();
