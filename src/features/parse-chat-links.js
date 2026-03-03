(async () => {
  try {
    /* =======================
	       Feature: Parse Chat Links
	    ======================= */

    const CHAT_LINK_KEY = "chat.link";

    // Regex to find custom n21 links
    const chatLinkRegex = /\[\[n21:[^\|]*\|\|([^\]]+)\]\]/g;

    const { loadManagers } = window._n21_;

    const [ChatManager, ChatUIManager, TooltipManager, HtmlManager, SettingsManager] = await loadManagers(
      "ChatManager",
      "ChatUIManager",
      "TooltipManager",
      "HtmlManager",
      "SettingsManager",
    );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.parse-chat-links.enabled")) {
      return;
    }

    function createFloatingAnchorFromPayload(payload) {
      const anchor = document.createElement("a");
      const type = payload?.type || "floating";
      const title = payload?.title || "";
      const url = payload?.url || "";
      const icon = payload?.icon || "";
      const color = payload?.color || "";
      const content = payload?.content || "";

      const displayHtml = title || content || "Detalle";
      HtmlManager.setAnchorContent(anchor, displayHtml, type !== "static");

      if (type === "static") {
        anchor.href = "#";
        anchor.setAttribute("data-static-floating", "true");
      } else {
        anchor.href = url || "#";
        anchor.setAttribute("data-floating", "true");
      }

      if (title)
        anchor.setAttribute(
          "data-floating-title",
          type === "static" ? HtmlManager.toPlainText(title) : title,
        );
      if (icon) anchor.setAttribute("data-floating-icon", icon);
      if (color) anchor.setAttribute("data-floating-color", color);
      if (content)
        anchor.setAttribute(
          "data-floating-content",
          type === "static" ? HtmlManager.toPlainText(content) : content,
        );
      if (url) anchor.setAttribute("data-floating-url", url);

      return anchor;
    }

    // Function to parse n21 links in text node and replace with anchor elements
    function parseChatLinks(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;

        // Check if text contains links
        if (chatLinkRegex.test(text)) {
          const fragment = document.createDocumentFragment();
          let lastIndex = 0;
          let match;

          // Reset regex
          chatLinkRegex.lastIndex = 0;

          while ((match = chatLinkRegex.exec(text)) !== null) {
            // Add text before the link
            if (match.index > lastIndex) {
              fragment.appendChild(
                document.createTextNode(text.substring(lastIndex, match.index)),
              );
            }

            const payload = ChatManager.decodeJsonMessage(match[1]);
            if (payload && payload.key === CHAT_LINK_KEY) {
              const anchor = createFloatingAnchorFromPayload(payload);
              fragment.appendChild(anchor);
            } else {
              fragment.appendChild(document.createTextNode(match[0]));
            }

            lastIndex = chatLinkRegex.lastIndex;
          }

          // Add remaining text after last link
          if (lastIndex < text.length) {
            fragment.appendChild(
              document.createTextNode(text.substring(lastIndex)),
            );
          }

          // Replace the text node with the fragment
          node.parentNode.replaceChild(fragment, node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Recursively process child nodes, but skip certain elements
        const childNodes = Array.from(node.childNodes);
        for (const child of childNodes) {
          // Don't parse inside already processed links or script tags
          if (child.nodeName !== "A" && child.nodeName !== "SCRIPT") {
            parseChatLinks(child);
          }
        }
      }
    }

    // Register handler with ChatUIManager
    ChatUIManager.onMessage(
      "parse-chat-links",
      (element) => {
        parseChatLinks(element);
      },
      {
        priority: 100,
        onComplete: () => {
          // Update events for newly created links
          if (window.bindFloatingLinks) {
            window.bindFloatingLinks();
          }
        },
      },
    );

    // Process existing messages on page load
    ChatUIManager.processExistingMessages();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Parse Chat Links", error);
  }
})();
