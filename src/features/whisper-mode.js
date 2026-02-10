(async () => {
  try {
    /* =======================
       Feature: Whisper Mode
    ======================= */

    const { loadManagers } = window._n21_;
    const [ChatUIManager, PlayerManager, ChatCommandsManager] =
      await loadManagers("ChatUIManager", "PlayerManager", "ChatCommandsManager");

    // ==================== Constants ====================
    const SELECTORS = {
      messageBox: ".room-message",
      userName: ".user-name",
      visibilitySelect: "#room_message_visibility",
    };

    // ==================== Helper Utilities ====================

    function parseWhisperCommand(message) {
      const parsed = ChatCommandsManager.parseInput(message);
      if (!parsed || !parsed.isCommand) return null;
      if (parsed.name !== "w") return null;
      return parsed;
    }

    function getConnectedUsernames() {
      try {
        const list = PlayerManager?.getPlayerList?.() || [];
        return list
          .filter((player) => player.connected && !player.isMe)
          .map((player) => player.userName);
      } catch (error) {
        return [];
      }
    }

    function getWhisperRecipient(parsed) {
      if (!parsed || !parsed.args?.length) return null;
      return parsed.args[0] || null;
    }

    function getWhisperBody(parsed) {
      if (!parsed) return "";
      return ChatCommandsManager.getRestText(parsed, 0);
    }

    ChatCommandsManager.registerCommand("w", {
      description: "Whisper to a player",
      params: [
        {
          name: "recipient",
          quoteIfNeeded: true,
          getSuggestions: (fragment) => {
            const list = getConnectedUsernames();
            if (!fragment) return list;
            const lowerFragment = fragment.toLowerCase();
            return list.filter((name) =>
              name.toLowerCase().startsWith(lowerFragment),
            );
          },
        },
      ],
      validate: ({ parsed, args }) => {
        const recipientName = args?.[0] || null;
        const connectedUsers = getConnectedUsernames();
        const messageContent = getWhisperBody(parsed).trim();

        if (!recipientName) return false;
        if (!connectedUsers.includes(recipientName)) return false;
        if (!messageContent) return false;

        return true;
      },
      onBeforeSend: () => {
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
      },
    });

    // ==================== Message Processing ====================

    // Process a single whisper message
    function processWhisperMessage(messageElement) {
      if (!messageElement) return;

      const text = messageElement.textContent.trim();

      const parsed = parseWhisperCommand(text);
      if (parsed) {
        const messageBox = messageElement.closest(SELECTORS.messageBox);
        if (messageBox) {
          const userNameElement = messageBox.querySelector(SELECTORS.userName);
          if (userNameElement) {
            const senderName = userNameElement.textContent
              .replace(":", "")
              .trim();
            const recipientName = getWhisperRecipient(parsed);

            if (recipientName && !userNameElement.textContent.includes(" a ")) {
              userNameElement.classList.add("text-success");
              userNameElement.textContent = `${senderName} a ${recipientName}:`;
            }
          }
        }

        messageElement.textContent = getWhisperBody(parsed);
      }
    }

    // ================== Handle Visibility ==================

    // ==================== Subscriptions ====================

    // Subscribe to chat messages via ChatManager to handle whisper visibility
    async function subscribeToWhisperMessages() {
      const [ChatManager] = await loadManagers("ChatManager");

      ChatManager.onMessage((messageData, rawData) => {
        const message = messageData.message.trim();
        const currentUserName = window.getUserName?.();
        const currentUserId = window.getUserId?.();

        const parsed = parseWhisperCommand(message);
        const targetUsername = parsed ? getWhisperRecipient(parsed) : null;

        if (targetUsername && currentUserName && currentUserId) {
          if (
            targetUsername === currentUserName &&
            messageData.senderName !== currentUserName
          ) {
            rawData.visible_for_users = rawData.visible_for_users || [];
            rawData.visible_for_users.push(currentUserId);
          }
        }

        // Continue processing (don't block)
        return true;
      });
    }

    // ==================== Initialization ====================

    // Register handler with ChatUIManager for processing whisper messages
    ChatUIManager.onMessage("whisper-mode", (element) => {
      processWhisperMessage(element);
    });

    // Process existing messages on page load
    ChatUIManager.processExistingMessages();

    subscribeToWhisperMessages();
  } catch (error) {
    console.error("[Whisper Mode] Error:", error);
  }
})();
