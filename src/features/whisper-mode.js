(() => {
  try {
    /* =======================
       Feature: Whisper Mode
       Automatically switch to private mode when typing /w
    ======================= */

    const { state } = window._n21_;

    // ==================== Constants ====================
    const SELECTORS = {
      messageText: '[data-role="message-text"], .message-text',
      chatContainer: '.room-messages-chat',
      messageBox: '.room-message',
      userName: '.user-name',
      visibilitySelect: '#room_message_visibility',
      messageInput: '#room_message_message',
      visibilityButton: '.chat-visibility-change'
    };

    const TEXTS = {
      whisperIndicator: ' (solo a ti):',
      whisperCommand: '/w'
    };

    const TIMEOUTS = {
      pollingInterval: 100,
      maxPollingTime: 5000,
      initTimeout: 10000,
      visibilityDelay: 10
    };

    // ==================== Helper Utilities ====================
    
    // Wait for elements to be available with polling
    function waitForElement(checkFn, callback, timeout = TIMEOUTS.maxPollingTime) {
      const checkInterval = setInterval(() => {
        if (checkFn()) {
          clearInterval(checkInterval);
          callback();
        }
      }, TIMEOUTS.pollingInterval);

      setTimeout(() => clearInterval(checkInterval), timeout);
    }

    // Check if message starts with /w
    function startsWithWhisper(message) {
      return message.trim().startsWith(TEXTS.whisperCommand);
    }

    // Remove /w and username from message, keeping the rest
    function removeWhisperPrefix(message) {
      const trimmed = message.trim();
      if (!startsWithWhisper(trimmed)) return message;
      
      // Match /w followed by optional username and space, capture the rest
      const match = trimmed.match(/^\/w(?:\s+\S+)?(?:\s+(.*))?$/);
      return match && match[1] ? match[1] : '';
    }

    // Check if node is or contains a message element
    function isMessageElement(node) {
      if (!node.nodeType || node.nodeType !== Node.ELEMENT_NODE) return false;
      
      const hasDataRole = node.hasAttribute?.('data-role') && 
                         node.getAttribute('data-role') === 'message-text';
      const hasClass = node.classList?.contains('message-text');
      
      return hasDataRole || hasClass;
    }

    // Get DOM elements
    function getElements() {
      return {
        visibilitySelect: document.querySelector(SELECTORS.visibilitySelect),
        messageInput: document.querySelector(SELECTORS.messageInput)
      };
    }

    // Set visibility by clicking the appropriate button
    function setVisibility(value) {
      const button = document.querySelector(`${SELECTORS.visibilityButton}[data-value="${value}"]`);
      if (button) {
        button.click();
      } else {
        console.warn('[Whisper Mode] Visibility button not found:', value);
      }
    }

    // ==================== Message Processing ====================
    
    // Process whisper messages in all chat boxes
    function processWhisperMessages() {
      const chatContainers = document.querySelectorAll(SELECTORS.chatContainer);
      if (!chatContainers.length) return;

      chatContainers.forEach((container) => {
        const messageElements = container.querySelectorAll(SELECTORS.messageText);
        messageElements.forEach((element) => {
          processWhisperMessage(element);
        });
      });
    }

    // Process a single whisper message
    function processWhisperMessage(messageElement) {
      if (!messageElement) return;

      const text = messageElement.textContent.trim();
      
      if (startsWithWhisper(text)) {
        // Find the message box and add visual indicators
        const messageBox = messageElement.closest(SELECTORS.messageBox);
        if (messageBox) {
          const userName = messageBox.querySelector(SELECTORS.userName);
          if (userName && !userName.textContent.includes(TEXTS.whisperIndicator)) {
            userName.classList.add('text-success');
            userName.textContent = userName.textContent.replace(':', TEXTS.whisperIndicator);
          }
        }

        // Remove /w username from the message text
        messageElement.textContent = removeWhisperPrefix(text);
      }
    }

    // Process existing messages on page load
    function processExistingMessages() {
      waitForElement(
        () => document.querySelectorAll(SELECTORS.chatContainer).length > 0,
        processWhisperMessages
      );
    }

    // Observe for new messages added dynamically
    function observeWhisperMessages() {
      const chatContainers = document.querySelectorAll(SELECTORS.chatContainer);
      if (!chatContainers.length) return;

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (isMessageElement(node)) {
              processWhisperMessage(node);
            } else if (node.querySelectorAll) {
              const messageTexts = node.querySelectorAll(SELECTORS.messageText);
              messageTexts.forEach(processWhisperMessage);
            }
          });
        });
      });

      chatContainers.forEach((container) => {
        observer.observe(container, {
          childList: true,
          subtree: true
        });
      });
    }

    // ==================== Event Handlers ====================

    // ==================== Event Handlers ====================
    
    // Handle visibility button clicks
    function onVisibilityButtonClick(e) {
      setTimeout(() => {
        const { visibilitySelect, messageInput } = getElements();
        if (!visibilitySelect || !messageInput) return;

        const newValue = visibilitySelect.value;
        const message = messageInput.value;
        
        // If changing to non-private and message has /w, remove it
        if (newValue !== 'private' && startsWithWhisper(message)) {
          messageInput.value = removeWhisperPrefix(message);
        }
      }, TIMEOUTS.visibilityDelay); 
    }

    // Handle message input changes (auto-switch visibility)
    function onMessageInput(currentMessage) {
      return function(e) {
        const { visibilitySelect, messageInput } = getElements();
        if (!visibilitySelect || !messageInput) return;

        const newMessage = messageInput.value;
        const newMessageStartsWithW = startsWithWhisper(newMessage);
        const oldMessageStartsWithW = startsWithWhisper(currentMessage.value);

        // Switch to private when typing /w
        if (newMessageStartsWithW && !oldMessageStartsWithW) {
          setVisibility('private');
        }
        // Switch to public when removing /w
        else if (!newMessageStartsWithW && oldMessageStartsWithW) {
          setVisibility('public');
        }

        currentMessage.value = newMessage;
      };
    }

    // ==================== Initialization ====================
    
    // Hook into chat subscriptions to handle whisper visibility
    function hookChatSubscriptions() {
      try {
        const subscription = App.cable.subscriptions.subscriptions[0];
        if (!subscription) return;

        const originalReceived = subscription.received.bind(subscription);
        subscription.received = function(a) {
          // Check if this is a whisper message for the current user
          if (a.message_type === 'chat' && a.data?.message) {
            const message = a.data.message.trim();
            const currentUserName = window.getUserName?.();
            const currentUserId = window.getUserId?.();

            const whisperMatch = message.match(/^\/w\s+(\S+)/);
            if (whisperMatch && currentUserName && currentUserId) {
              const targetUsername = whisperMatch[1];
              
              // Add current user to visible_for_users if whisper is for them
              if (targetUsername === currentUserName && a.sender_name !== currentUserName) {
                a.visible_for_users = a.visible_for_users || [];
                a.visible_for_users.push(currentUserId);
              }
            }
          }

          originalReceived(a);
        };
      } catch (error) {
        console.warn('[Whisper Mode] Could not hook chat subscriptions');
      }
    }

    // Initialize the feature
    function init() {
      // Track current message state locally
      const currentMessage = { value: '' };

      $(document).on('click', SELECTORS.visibilityButton, onVisibilityButtonClick);

      // Wait for required elements to be available
      waitForElement(
        () => {
          const { visibilitySelect, messageInput } = getElements();
          return visibilitySelect && messageInput && App.cable.subscriptions.subscriptions.length > 0;
        },
        () => {
          const { messageInput } = getElements();
          currentMessage.value = messageInput.value || '';
          
          // Listen to message input changes
          messageInput.addEventListener('input', onMessageInput(currentMessage));
          
          // Hook into chat subscriptions
          hookChatSubscriptions();
          
          // Process existing and observe new whisper messages
          processExistingMessages();
          observeWhisperMessages();
        },
        TIMEOUTS.initTimeout
      );
    }

    // Start initialization
    init();

  } catch (error) {
    console.error('[Whisper Mode] Error:', error);
  }
})();