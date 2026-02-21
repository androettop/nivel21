(async () => {
  try {
    /* =======================
       Feature: Token Notes
    ======================= */

    const { loadManagers } = window._n21_;

    const [ChatManager, ChatUIManager, CanvasDropdownManager, SettingsManager] =
      await loadManagers(
        "ChatManager",
        "ChatUIManager",
        "CanvasDropdownManager",
        "SettingsManager",
      );

    const TOKEN_NOTES_CHAT_KEY = "feature.token-notes";
    const N21_MESSAGE_REGEX = /\[\[n21:[^\|]*\|\|([^\]]+)\]\]/g;

    if (!SettingsManager.get("feature.token-notes.enabled")) {
      return;
    }

    function safeJsonParse(value) {
      if (typeof value !== "string" || !value.trim()) return null;

      try {
        return JSON.parse(value);
      } catch (error) {
        return null;
      }
    }

    function toText(value) {
      if (value === undefined || value === null) return "";
      return String(value).trim();
    }

    function createTokenNoteElement(payload) {
      const container = document.createElement("div");
      container.className = "n21-token-note-chat";

      const title = toText(payload?.name);
      const description = toText(payload?.description);
      const imageUrl = toText(payload?.imageUrl);
      const borderType = toText(payload?.border_type);
      const borderColor = toText(payload?.border_color);

      if (title) {
        const titleEl = document.createElement("div");
        titleEl.className = "n21-token-note-chat-title";
        titleEl.textContent = `${title}:`;
        container.appendChild(titleEl);
      }

      if (imageUrl) {
        const image = document.createElement("img");
        image.className = "n21-token-note-chat-image";
        
        if (borderType === "none") {
          image.classList.add("n21-token-note-chat-image--square", "n21-token-note-chat-image--contain");
        }
        
        image.src = imageUrl;
        image.alt = title || "Token";
        image.loading = "lazy";

        if (borderType === "default" && borderColor) {
          image.style.border = `2px solid ${borderColor}`;
        }

        container.appendChild(image);
      }

      if (description) {
        const descriptionEl = document.createElement("div");
        descriptionEl.className = "n21-token-note-chat-description";
        descriptionEl.textContent = description;
        container.appendChild(descriptionEl);
      }

      return container;
    }

    function parseTokenNoteMessages(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (!N21_MESSAGE_REGEX.test(text)) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;

        N21_MESSAGE_REGEX.lastIndex = 0;

        while ((match = N21_MESSAGE_REGEX.exec(text)) !== null) {
          if (match.index > lastIndex) {
            fragment.appendChild(
              document.createTextNode(text.substring(lastIndex, match.index)),
            );
          }

          const payload = ChatManager.decodeJsonMessage(match[1]);
          if (payload && payload.key === TOKEN_NOTES_CHAT_KEY) {
            fragment.appendChild(createTokenNoteElement(payload));
          } else {
            fragment.appendChild(document.createTextNode(match[0]));
          }

          lastIndex = N21_MESSAGE_REGEX.lastIndex;
        }

        if (lastIndex < text.length) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex)),
          );
        }

        node.parentNode.replaceChild(fragment, node);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const childNodes = Array.from(node.childNodes);
      childNodes.forEach((child) => {
        if (child.nodeName === "SCRIPT") return;
        parseTokenNoteMessages(child);
      });
    }

    CanvasDropdownManager.registerOption({
      id: "n21-token-notes-send-to-chat",
      label: "Enviar al chat",
      showOn: ["token"],
      order: 50,
      onClick: (context) => {
        const token = context?.token;
        const tokenInstance = token?.script?.tokenInstance;

        const metadataJson = tokenInstance?.schema?.metadata;
        const metadata = safeJsonParse(metadataJson) || {};

        const name = toText(metadata.name);
        const description = toText(metadata.description);
        const borderType = toText(metadata.border_type);
        const borderColor = toText(metadata.border_color);
        const imageUrl = toText(tokenInstance?.imageUrl);

        if (!name && !imageUrl && !description) return;

        ChatManager.sendJsonMessage(
          {
            name,
            imageUrl,
            description,
            border_type: borderType,
            border_color: borderColor,
          },
          {},
          TOKEN_NOTES_CHAT_KEY,
        );
      },
    });

    ChatUIManager.onMessage(
      "token-notes-render",
      (element) => {
        parseTokenNoteMessages(element);
      },
      { priority: 120 },
    );

    ChatUIManager.processExistingMessages();
  } catch (error) {
    console.warn("N21: Error en feature Token Notes:", error.message);
  }
})();
