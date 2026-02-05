(() => {
  /* =======================
       ChatUIManager - Chat UI observation abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  // Selector for message text elements (both data-role and class variants)
  const MESSAGE_TEXT_SELECTOR = '[data-role="message-text"], .message-text';

  // Selector for chat container
  const CHAT_CONTAINER_SELECTOR = ".room-messages-chat";

  /**
   * ChatUIManager provides a unified interface for observing and processing chat messages
   * Features can register handlers to process new or existing messages
   */
  class ChatUIManager extends BaseManager {
    constructor() {
      super();
      this._initialized = false;
      this._messageHandlers = [];
      this._observer = null;
    }

    /**
     * Initialize the manager and start observing chat containers
     */
    async init() {
      if (this._initialized) return;

      this._setupObserver();
      this._initialized = true;
    }

    /**
     * Check if the manager is ready
     */
    isReady() {
      return this._initialized;
    }

    /**
     * Setup MutationObserver for chat containers
     */
    _setupObserver() {
      const chatContainers = document.querySelectorAll(CHAT_CONTAINER_SELECTOR);

      if (!chatContainers.length) {
        // Retry after a delay if containers not found yet
        setTimeout(() => this._setupObserver(), 500);
        return;
      }

      this._observer = new MutationObserver((mutations) => {
        const processedElements = new Set();

        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const elements = this._findMessageElements(node);
              elements.forEach((element) => {
                if (!processedElements.has(element)) {
                  processedElements.add(element);
                  this._processElement(element);
                }
              });
            }
          });
        });

        // Notify handlers that processing is complete (for post-processing like binding events)
        this._notifyProcessingComplete();
      });

      // Start observing each chat container
      chatContainers.forEach((container) => {
        this._observer.observe(container, {
          childList: true,
          subtree: true,
        });
      });
    }

    /**
     * Find message text elements in a node
     */
    _findMessageElements(node) {
      const elements = [];

      // Check if the node itself is a message-text element
      if (this._isMessageElement(node)) {
        elements.push(node);
      } else if (node.querySelectorAll) {
        // Check children
        const messageTexts = node.querySelectorAll(MESSAGE_TEXT_SELECTOR);
        messageTexts.forEach((el) => elements.push(el));
      }

      return elements;
    }

    /**
     * Check if a node is a message text element
     */
    _isMessageElement(node) {
      if (!node.hasAttribute && !node.classList) return false;

      return (
        (node.hasAttribute &&
          node.hasAttribute("data-role") &&
          node.getAttribute("data-role") === "message-text") ||
        (node.classList && node.classList.contains("message-text"))
      );
    }

    /**
     * Process a message element through all registered handlers
     */
    _processElement(element) {
      // Sort handlers by priority (higher first)
      const sortedHandlers = [...this._messageHandlers].sort(
        (a, b) => (b.priority || 0) - (a.priority || 0),
      );

      for (const handler of sortedHandlers) {
        try {
          handler.callback(element);
        } catch (error) {
          console.warn(
            `[ChatUIManager] Error in handler "${handler.name}":`,
            error,
          );
        }
      }
    }

    /**
     * Notify handlers that a batch of processing is complete
     */
    _notifyProcessingComplete() {
      for (const handler of this._messageHandlers) {
        if (handler.onComplete) {
          try {
            handler.onComplete();
          } catch (error) {
            console.warn(
              `[ChatUIManager] Error in onComplete for "${handler.name}":`,
              error,
            );
          }
        }
      }
    }

    /**
     * Register a handler for processing message elements
     *
     * @param {string} name - Unique name for the handler
     * @param {Function} callback - Function called for each message element
     * @param {Object} options - Optional configuration
     * @param {number} options.priority - Handler priority (higher = runs first, default: 0)
     * @param {Function} options.onComplete - Called after a batch of messages is processed
     */
    onMessage(name, callback, options = {}) {
      if (typeof callback !== "function") {
        console.warn(
          `[ChatUIManager] Handler "${name}" callback must be a function`,
        );
        return;
      }

      // Remove existing handler with same name
      this.removeHandler(name);

      this._messageHandlers.push({
        name,
        callback,
        priority: options.priority || 0,
        onComplete: options.onComplete,
      });
    }

    /**
     * Remove a registered handler
     *
     * @param {string} name - Name of the handler to remove
     */
    removeHandler(name) {
      this._messageHandlers = this._messageHandlers.filter(
        (h) => h.name !== name,
      );
    }

    /**
     * Process all existing messages in chat containers
     * Useful for initial processing on feature load
     */
    processExistingMessages() {
      const chatContainers = document.querySelectorAll(CHAT_CONTAINER_SELECTOR);
      if (!chatContainers.length) return;

      chatContainers.forEach((container) => {
        const messageElements = container.querySelectorAll(
          MESSAGE_TEXT_SELECTOR,
        );
        messageElements.forEach((element) => {
          this._processElement(element);
        });
      });

      this._notifyProcessingComplete();
    }

    /**
     * Get the message text selector
     */
    getMessageTextSelector() {
      return MESSAGE_TEXT_SELECTOR;
    }

    /**
     * Get the chat container selector
     */
    getChatContainerSelector() {
      return CHAT_CONTAINER_SELECTOR;
    }
  }

  // Register ChatUIManager
  const { registerManager } = window._n21_.utils;
  registerManager("ChatUIManager", ChatUIManager);
})();
