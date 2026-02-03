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

    function getConnectedUsernames() {
      try {
        const list = window.players?.list?.() || [];
        return list
          .filter((player) => player.connected && !player.isMe)
          .map((player) => player.userName);
      } catch (error) {
        return [];
      }
    }

    function parseWhisperInput(input) {
      const match = input.match(/^(\s*\/w)\s+(.*)$/);
      if (!match) return null;

      const prefix = `${match[1]} `;
      const restAll = match[2];

      if (!restAll) {
        return {
          prefix,
          recipientFragment: "",
          rest: "",
          quoteChar: null,
        };
      }

      const firstChar = restAll[0];
      if (firstChar === '"' || firstChar === "'") {
        const quoteChar = firstChar;
        const closingIndex = restAll.indexOf(quoteChar, 1);
        const recipientFragment =
          closingIndex === -1
            ? restAll.slice(1)
            : restAll.slice(1, closingIndex);
        const rest = closingIndex === -1 ? "" : restAll.slice(closingIndex + 1);
        return { prefix, recipientFragment, rest, quoteChar };
      }

      const firstSpaceIndex = restAll.search(/\s/);
      if (firstSpaceIndex === -1) {
        return {
          prefix,
          recipientFragment: restAll,
          rest: "",
          quoteChar: null,
        };
      }

      return {
        prefix,
        recipientFragment: restAll.slice(0, firstSpaceIndex),
        rest: restAll.slice(firstSpaceIndex),
        quoteChar: null,
      };
    }

    function formatRecipient(username, quoteChar) {
      if (username.includes(" ")) {
        const wrapper = quoteChar || '"';
        return `${wrapper}${username}${wrapper}`;
      }

      return username;
    }

    function listStartsWithFilter(usernames, fragment) {
      if (!fragment) return usernames;
      const lowerFragment = fragment.toLowerCase();
      return usernames.filter((name) =>
        name.toLowerCase().startsWith(lowerFragment),
      );
    }

    // Extract recipient name from /w command
    // Supports: /w Username or /w "Username With Spaces" or /w 'Username With Spaces'
    function extractRecipient(message) {
      const trimmed = message.trim();
      if (!startsWithWhisper(trimmed)) return null;

      // Try to match quoted name first
      let match = trimmed.match(/^\/w\s+(?:"([^"]+)"|'([^']+)')/);
      if (match) return match[1] || match[2] || null;

      // Otherwise match single word name
      match = trimmed.match(/^\/w\s+(\S+)/);
      return match && match[1] ? match[1] : null;
    }

    // Remove /w and username from message, keeping the rest
    // Supports: /w Username or /w "Username With Spaces" or /w 'Username With Spaces'
    function removeWhisperPrefix(message) {
      const trimmed = message.trim();
      if (!startsWithWhisper(trimmed)) return message;

      // Try to remove /w "quoted name" or /w 'quoted name' first
      let match = trimmed.match(/^\/w\s+"[^"]+"(?:\s+(.*))?$/);
      if (match) return match[1] ? match[1] : "";

      match = trimmed.match(/^\/w\s+'[^']+'(?:\s+(.*))?$/);
      if (match) return match[1] ? match[1] : "";

      // Otherwise remove /w and single word name
      match = trimmed.match(/^\/w(?:\s+\S+)?(?:\s+(.*))?$/);
      return match && match[1] ? match[1] : "";
    }

    function initWhisperAutocomplete() {
      const autocompleteState = {
        baseInput: "",
        candidates: [],
        index: 0,
        lastWasTab: false,
        suppressInput: false,
      };

      const inputField = document.querySelector(SELECTORS.textInput);
      if (!inputField) return;

      inputField.addEventListener("input", () => {
        if (autocompleteState.suppressInput) {
          autocompleteState.suppressInput = false;
          return;
        }

        autocompleteState.baseInput = inputField.value;
        autocompleteState.candidates = [];
        autocompleteState.index = 0;
        autocompleteState.lastWasTab = false;
      });

      inputField.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") {
          autocompleteState.lastWasTab = false;
          return;
        }

        const currentValue = inputField.value;
        if (!startsWithWhisper(currentValue)) return;

        event.preventDefault();

        if (!autocompleteState.lastWasTab) {
          autocompleteState.baseInput = currentValue;
        }

        const parsed = parseWhisperInput(autocompleteState.baseInput);
        if (!parsed) return;

        const usernames = getConnectedUsernames();
        const candidates = listStartsWithFilter(
          usernames,
          parsed.recipientFragment,
        );

        if (!candidates.length) return;

        const sameCandidates =
          autocompleteState.candidates.length === candidates.length &&
          autocompleteState.candidates.every(
            (name, idx) => name === candidates[idx],
          );

        if (!autocompleteState.lastWasTab || !sameCandidates) {
          autocompleteState.candidates = candidates;
          autocompleteState.index = 0;
        } else {
          autocompleteState.index =
            (autocompleteState.index + 1) % candidates.length;
        }

        const selected = candidates[autocompleteState.index];
        const formattedRecipient = formatRecipient(selected, parsed.quoteChar);
        const newValue = `${parsed.prefix}${formattedRecipient}${parsed.rest}`;

        autocompleteState.suppressInput = true;
        autocompleteState.lastWasTab = true;
        inputField.value = newValue;
        inputField.setSelectionRange(newValue.length, newValue.length);
      });
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
      $(document).on("click", SELECTORS.submitButton, (event) => {
        // before sending, check if message is a whisper and if so, set visibility to private
        const inputField = document.querySelector(SELECTORS.textInput);
        if (inputField) {
          const message = inputField.value;
          if (startsWithWhisper(message)) {
            const recipientName = extractRecipient(message);
            const connectedUsers = getConnectedUsernames();
            const messageContent = removeWhisperPrefix(message).trim();

            // Cancel send if no recipient, recipient is not connected, or no message content
            if (!recipientName || !connectedUsers.includes(recipientName) || !messageContent) {
              event.preventDefault();
              event.stopPropagation();
              
              // Shake the input field
              inputField.classList.add('n21-shake');
              setTimeout(() => {
                inputField.classList.remove('n21-shake');
              }, 500);
              
              return false;
            }

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

            // Try to match quoted name first
            let whisperMatch = message.match(
              /^\/w\s+(?:"([^"]+)"|'([^']+)')/,
            );
            let targetUsername = whisperMatch
              ? whisperMatch[1] || whisperMatch[2] || null
              : null;

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
    initWhisperAutocomplete();
  } catch (error) {
    console.error("[Whisper Mode] Error:", error);
  }
})();
