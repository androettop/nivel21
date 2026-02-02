(() => {
  try {
    /* =======================
       Feature: Whisper Mode
       Automatically switch to private mode when typing /w
    ======================= */

    const { state } = window._n21_;

    // Selector for message text elements (both data-role and class variants)
    const messageTextSelector = '[data-role="message-text"], .message-text';

    // Selector for chat container
    const chatContainerSelector = ".room-messages-chat";

    // Process whisper messages in chat boxes
    function processWhisperMessages() {
      const chatContainers = document.querySelectorAll(chatContainerSelector);
      if (!chatContainers.length) return;

      chatContainers.forEach((container) => {
        const messageElements = container.querySelectorAll(messageTextSelector);
        messageElements.forEach((element) => {
          processWhisperMessage(element);
        });
      });
    }

    // Process a single whisper message
    function processWhisperMessage(messageElement) {
      if (!messageElement) return;

      const text = messageElement.textContent.trim();
      
      // Check if message starts with /w
      if (startsWithWhisper(text)) {
        // Find the user-name sibling
        const messageBox = messageElement.closest('.room-message');
        if (messageBox) {
          const userName = messageBox.querySelector('.user-name');
          if (userName) {
            // Add text-success class to user-name
            userName.classList.add('text-success');
            
            // Add "(solo a ti)" before the colon
            const userNameText = userName.textContent;
            if (userNameText.includes(':')) {
              userName.textContent = userNameText.replace(':', ' (solo a ti):');
            }
          }
        }

        // Remove /w username from the message text
        const newMessage = removeWhisperPrefix(text);
        messageElement.textContent = newMessage;
      }
    }

    // Initial process on page load
    function processWhisperMessagesInitial() {
      const checkInterval = setInterval(() => {
        const chatContainers = document.querySelectorAll(chatContainerSelector);
        if (chatContainers.length > 0) {
          clearInterval(checkInterval);
          processWhisperMessages();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
      }, 5000);
    }

    // Observe for new messages added dynamically
    function observeWhisperMessages() {
      const chatContainers = document.querySelectorAll(chatContainerSelector);
      if (chatContainers.length) {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if added node is a message-text element or contains one
                if (
                  node.hasAttribute &&
                  node.hasAttribute("data-role") &&
                  node.getAttribute("data-role") === "message-text"
                ) {
                  processWhisperMessage(node);
                } else if (
                  node.classList &&
                  node.classList.contains("message-text")
                ) {
                  processWhisperMessage(node);
                } else if (node.querySelectorAll) {
                  const messageTexts = node.querySelectorAll(messageTextSelector);
                  messageTexts.forEach((element) => {
                    processWhisperMessage(element);
                  });
                }
              }
            });
          });
        });

        // Start observing each chat container for changes
        chatContainers.forEach((container) => {
          observer.observe(container, {
            childList: true,
            subtree: true,
          });
        });
      }
    }

    // Get DOM elements
    function getElements() {
      return {
        visibilitySelect: document.querySelector('#room_message_visibility'),
        messageInput: document.querySelector('#room_message_message')
      };
    }

    // Check if message starts with /w
    function startsWithWhisper(message) {
      return message.trim().startsWith('/w');
    }

    // Set visibility by clicking the appropriate button
    function setVisibility(value) {
      const button = document.querySelector(`.chat-visibility-change[data-value="${value}"]`);
      if (button) {
        button.click();
      } else {
        console.warn('[Whisper Mode] Visibility button not found:', value);
      }
    }

    // Remove /w and username from message, keeping the rest
    function removeWhisperPrefix(message) {
      const trimmed = message.trim();
      if (!startsWithWhisper(trimmed)) return message;
      
      // Match /w followed by optional username and space, capture the rest
      // Pattern: /w [username] [rest of message]
      const match = trimmed.match(/^\/w(?:\s+\S+)?(?:\s+(.*))?$/);
      if (match && match[1]) {
        return match[1]; // Return the rest of the message
      }
      return ''; // No message after /w and username
    }

    // Handle visibility button clicks
    function onVisibilityButtonClick(e) {
        setTimeout(() => {
            const { visibilitySelect, messageInput } = getElements();
            if (!visibilitySelect || !messageInput) return;

            const newValue = visibilitySelect.value;
            const message = messageInput.value;
            
            // If changing to non-private and message has /w, remove the whisper prefix
            if (newValue !== 'private' && startsWithWhisper(message)) {
              const newMessage = removeWhisperPrefix(message);
              messageInput.value = newMessage;
              currentMessage = newMessage;
            }
        }, 10); 
    }

    // Handle message input changes
    function onMessageInput(e) {
      const { visibilitySelect, messageInput } = getElements();
      
      if (!visibilitySelect || !messageInput) return;

      const newMessage = messageInput.value;
      const newMessageStartsWithW = startsWithWhisper(newMessage);
      const oldMessageStartsWithW = startsWithWhisper(currentMessage);

      // Case 1: Just started typing /w
      if (newMessageStartsWithW && !oldMessageStartsWithW) {
        setVisibility('private');
      }
      // Case 2: Just removed /w
      else if (!newMessageStartsWithW && oldMessageStartsWithW) {
        setVisibility('public');
      }

      currentMessage = newMessage;
    }

    // Initialize the feature
    function init() {
      $(document).on('click', '.chat-visibility-change', onVisibilityButtonClick);

      // Wait for elements to be available
      const checkInterval = setInterval(() => {
        const { visibilitySelect, messageInput } = getElements();
        
        if (visibilitySelect && messageInput && App.cable.subscriptions.subscriptions.length > 0) {
          clearInterval(checkInterval);
          
          currentMessage = messageInput.value || '';
          
          // Listen to message input changes
          messageInput.addEventListener('input', onMessageInput);
          
          // Hook into chat subscriptions to handle whisper visibility
          hookChatSubscriptions();
          
          // Process and observe whisper messages in chat boxes
          processWhisperMessagesInitial();
          observeWhisperMessages();
        }
      }, 100);

      // Stop checking after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 10000);
    }

    // Hook into chat subscriptions to handle whisper message visibility
    function hookChatSubscriptions() {
      try {
        const subscription = App.cable.subscriptions.subscriptions[0];
        if (!subscription) return;

        const originalReceived = subscription.received.bind(subscription);
        subscription.received = function(a) {
          // Check if this is a whisper message meant for current user
          if (a.message_type === 'chat' && a.data && a.data.message) {
            const message = a.data.message.trim();
            const currentUserName = window.getUserName?.();
            const currentUserId = window.getUserId?.();

            // Check if message starts with /w username
            const whisperMatch = message.match(/^\/w\s+(\S+)/);
            if (whisperMatch && currentUserName && currentUserId) {
              const targetUsername = whisperMatch[1];
              
              // If the whisper is for current user and not from current user
              if (targetUsername === currentUserName && a.sender_name !== currentUserName) {
                // Add current user to visible_for_users
                a.visible_for_users = a.visible_for_users || [];
                a.visible_for_users.push(currentUserId);
              }
            }
          }

          // Call original received function
          originalReceived(a);
        };
      } catch (error) {
        console.warn('[Whisper Mode] Could not hook chat subscriptions');
      }
    }

    // Start initialization
    init();

  } catch (error) {
    console.error('[Whisper Mode] Error:', error);
  }
})();