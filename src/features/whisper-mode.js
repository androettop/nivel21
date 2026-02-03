(() => {
  try {
    /* =======================
       Feature: Whisper Mode
    ======================= */

    // ==================== Constants ====================
    const SELECTORS = {
      messageText: '[data-role="message-text"], .message-text',
      chatContainer: ".room-messages-chat",
      messageBox: ".room-message",
      userName: ".user-name",
      submitButton: '.chat-input[type="submit"]',
      textInput: "#room_message_message",
      visibilitySelect: "#room_message_visibility",
    };

    const TEXTS = {
      whisperCommand: "/w",
    };

    // ==================== Helper Utilities ====================

    // Check if message starts with /w
    function startsWithWhisper(message) {
      return message.trim().startsWith(TEXTS.whisperCommand);
    }

    // Extract recipient name from /w command
    // Supports: /w Username or /w [Username With Spaces]
    function extractRecipient(message) {
      const trimmed = message.trim();
      if (!startsWithWhisper(trimmed)) return null;

      // Try to match [bracketed name] first
      let match = trimmed.match(/^\/w\s+\[([^\]]+)\]/);
      if (match && match[1]) return match[1];

      // Otherwise match single word name
      match = trimmed.match(/^\/w\s+(\S+)/);
      return match && match[1] ? match[1] : null;
    }

    // Remove /w and username from message, keeping the rest
    // Supports: /w Username or /w [Username With Spaces]
    function removeWhisperPrefix(message) {
      const trimmed = message.trim();
      if (!startsWithWhisper(trimmed)) return message;

      // Try to remove /w [bracketed name] first
      let match = trimmed.match(/^\/w\s+\[[^\]]+\](?:\s+(.*))?$/);
      if (match) return match[1] ? match[1] : "";

      // Otherwise remove /w and single word name
      match = trimmed.match(/^\/w(?:\s+\S+)?(?:\s+(.*))?$/);
      return match && match[1] ? match[1] : "";
    }

    // Check if node is or contains a message element
    function isMessageElement(node) {
      if (!node.nodeType || node.nodeType !== Node.ELEMENT_NODE) return false;

      const hasDataRole =
        node.hasAttribute?.("data-role") &&
        node.getAttribute("data-role") === "message-text";
      const hasClass = node.classList?.contains("message-text");

      return hasDataRole || hasClass;
    }

    // ==================== Message Processing ====================

    // Process a single whisper message
    function processWhisperMessage(messageElement) {
      if (!messageElement) return;

      const text = messageElement.textContent.trim();

      if (startsWithWhisper(text)) {
        const messageBox = messageElement.closest(SELECTORS.messageBox);
        if (messageBox) {
          const userNameElement = messageBox.querySelector(SELECTORS.userName);
          if (userNameElement) {
            const senderName = userNameElement.textContent
              .replace(":", "")
              .trim();
            const recipientName = extractRecipient(text);

            if (recipientName && !userNameElement.textContent.includes(" a ")) {
              userNameElement.classList.add("text-success");
              userNameElement.textContent = `${senderName} a ${recipientName}:`;
            }
          }
        }

        messageElement.textContent = removeWhisperPrefix(text);
      }
    }

    // Process all whisper messages in chat
    function processWhisperMessages() {
      const chatContainers = document.querySelectorAll(SELECTORS.chatContainer);
      chatContainers.forEach((container) => {
        const messageElements = container.querySelectorAll(
          SELECTORS.messageText,
        );
        messageElements.forEach(processWhisperMessage);
      });
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
          subtree: true,
        });
      });
    }

    // ================== Handle Visibility ==================

    function initHandleWhisperVisibility() {
      $(document).on("click", SELECTORS.submitButton, () => {
        // before sending, check if message is a whisper and if so, set visibility to private
        const inputField = document.querySelector(SELECTORS.textInput);
        if (inputField) {
          const message = inputField.value;
          if (startsWithWhisper(message)) {
            const visibilitySelect = document.querySelector(
              SELECTORS.visibilitySelect,
            );
            if (visibilitySelect && visibilitySelect.value !== "private") {
              const previousValue = visibilitySelect.value;
              visibilitySelect.value = "private";
              setTimeout(() => {
                visibilitySelect.value = previousValue;
              }, 100);
            }
          }
        }
      });
    }

    // ==================== Subscriptions ====================

    // Hook into chat subscriptions to handle whisper visibility
    function hookChatSubscriptions() {
      try {
        const subscription = App.cable.subscriptions.subscriptions[0];
        if (!subscription) return;

        const originalReceived = subscription.received.bind(subscription);
        subscription.received = function (a) {
          if (a.message_type === "chat" && a.data?.message) {
            const message = a.data.message.trim();
            const currentUserName = window.getUserName?.();
            const currentUserId = window.getUserId?.();

            // Try to match [bracketed name] first
            let whisperMatch = message.match(/^\/w\s+\[([^\]]+)\]/);
            let targetUsername = whisperMatch ? whisperMatch[1] : null;

            // Otherwise try single word name
            if (!targetUsername) {
              whisperMatch = message.match(/^\/w\s+(\S+)/);
              targetUsername = whisperMatch ? whisperMatch[1] : null;
            }

            if (targetUsername && currentUserName && currentUserId) {
              if (
                targetUsername === currentUserName &&
                a.sender_name !== currentUserName
              ) {
                a.visible_for_users = a.visible_for_users || [];
                a.visible_for_users.push(currentUserId);
              }
            }
          }

          originalReceived(a);
        };
      } catch (error) {
        console.warn("[Whisper Mode] Could not hook chat subscriptions");
      }
    }

    // ==================== Initialization ====================

    hookChatSubscriptions();
    processWhisperMessages();
    observeWhisperMessages();
    initHandleWhisperVisibility();
  } catch (error) {
    console.error("[Whisper Mode] Error:", error);
  }
})();
