(() => {
  /* =======================
       ChatManager - Global chat abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  const N21_WARNING_TEXT =
    "Para ver estos mensajes correctamente instala la extensión Nivel21 desde https://github.com/androettop/nivel21";

  /**
   * Escape special characters in JSON message values
   */
  function escapeJsonValue(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/=/g, "\\=");
  }

  /**
   * Encode an object payload into the JSON chat message format
   * @param {Object} payload - Key-value pairs to encode
   * @param {string} key - Optional message key to categorize the message (e.g., "feature.name", "state.session")
   * @returns {string} Encoded message string
   */
  function encodeJsonMessage(payload, key) {
    try {
      const pairs = [];
      
      // Add the message key if provided
      if (key) {
        pairs.push(`key=${escapeJsonValue(key)}`);
      }
      
      for (const [name, value] of Object.entries(payload || {})) {
        if (value !== undefined && value !== null) {
          pairs.push(`${name}=${escapeJsonValue(value)}`);
        }
      }
      const encoded = pairs.join("|");
      return `[[n21: ${N21_WARNING_TEXT} ||${encoded}]]`;
    } catch (error) {
      return "";
    }
  }

  /**
   * Decode a JSON chat message string back to an object
   * @param {string} encoded - The encoded payload string (content between ||...]])
   * @returns {Object|null} Decoded payload object or null on error. Includes 'key' field if present.
   */
  function decodeJsonMessage(encoded) {
    try {
      const payload = {};
      const pairs = encoded.split(/(?<!\\)\|/);

      for (const pair of pairs) {
        const matchResult = pair.match(/^([^=]+)=(.*)$/s);
        if (matchResult) {
          const name = matchResult[1];
          const value = matchResult[2]
            .replace(/\\=/g, "=")
            .replace(/\\\|/g, "|")
            .replace(/\\\\/g, "\\");
          payload[name] = value;
        }
      }

      return payload;
    } catch (error) {
      return null;
    }
  }

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

    /**
     * Encode a payload object into JSON chat message format
     * @param {Object} payload - Key-value pairs to encode
     * @param {string} key - Optional message key to categorize the message
     * @returns {string} Encoded message string
     */
    encodeJsonMessage(payload, key) {
      return encodeJsonMessage(payload, key);
    }

    /**
     * Decode a JSON chat message string back to an object
     * @param {string} encoded - The encoded payload string (content between ||...]])
     * @returns {Object|null} Decoded payload object or null on error
     */
    decodeJsonMessage(encoded) {
      return decodeJsonMessage(encoded);
    }

    /**
     * Send a JSON chat message
     * Automatically encodes the payload and sends with debouncing
     * @param {Object} payload - Key-value pairs to encode and send
     * @param {Object} options - Chat options { sender_info, icon, visibility }
     * @param {string} key - Message key to categorize the message (required)
     */
    sendJsonMessage(payload, options = {}, key) {
      if (!key) {
        console.warn("[ChatManager] sendJsonMessage requires a key parameter");
        return;
      }
      const messageText = encodeJsonMessage(payload, key);
      if (!messageText) return;
      this.sendDebounced(messageText, options);
    }
  }

  // Register ChatManager
  const { registerManager } = window._n21_.utils;
  registerManager("ChatManager", ChatManager);
})();
