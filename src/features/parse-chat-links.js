(async () => {
  try {
    /* =======================
	       Feature: Parse Chat Links
	    ======================= */

    const CHAT_LINK_KEY = "chat.link";

    // Regex to find custom n21 links and markdown links
    const combinedLinkRegex =
      /\[\[n21:[^\|]*\|\|([^\]]+)\]\]|\[([^\]]+)\]\(([^)]+)\)/g;

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

    // Check if URL is from nivel20.com
    function isNivel20Url(url) {
      try {
        const parsedUrl = new URL(url, window.location.origin);
        return parsedUrl.hostname === "nivel20.com";
      } catch (e) {
        // If it's a relative URL, assume it's from nivel20.com
        return url.startsWith("/");
      }
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

    // Function to parse links in text node and replace with anchor elements
    function parseMarkdownLinks(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;

        // Check if text contains links
        if (combinedLinkRegex.test(text)) {
          const fragment = document.createDocumentFragment();
          let lastIndex = 0;
          let match;

          // Reset regex
          combinedLinkRegex.lastIndex = 0;

          while ((match = combinedLinkRegex.exec(text)) !== null) {
            // Add text before the link
            if (match.index > lastIndex) {
              fragment.appendChild(
                document.createTextNode(text.substring(lastIndex, match.index)),
              );
            }

            if (match[1]) {
              const payload = ChatManager.decodeJsonMessage(match[1]);
              if (payload && payload.key === CHAT_LINK_KEY) {
                const anchor = createFloatingAnchorFromPayload(payload);
                fragment.appendChild(anchor);
              } else {
                fragment.appendChild(document.createTextNode(match[0]));
              }
            } else {
              const linkText = match[2];
              const linkUrl = match[3];

              // Only create anchor if URL is from nivel20.com
              if (isNivel20Url(linkUrl)) {
                // Create anchor element with data attributes
                const anchor = document.createElement("a");

                // Parse HTML content safely with DOMPurify
                if (window.DOMPurify) {
                  anchor.innerHTML = HtmlManager.sanitize(linkText);
                  TooltipManager.processAll(anchor);
                } else {
                  anchor.textContent = linkText;
                }

                anchor.href = linkUrl; // (url)
                anchor.setAttribute("data-floating", "true");

                let floatingTitle = linkText;
                if (window.DOMPurify) {
                  const tempDiv = document.createElement("div");
                  tempDiv.innerHTML = HtmlManager.sanitize(linkText);
                  floatingTitle = tempDiv.textContent || "";
                }
                anchor.setAttribute("data-floating-title", floatingTitle);

                fragment.appendChild(anchor);
              } else {
                // If not a nivel20.com link, keep as plain text
                fragment.appendChild(document.createTextNode(match[0]));
              }
            }

            lastIndex = combinedLinkRegex.lastIndex;
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
            parseMarkdownLinks(child);
          }
        }
      }
    }

    // Register handler with ChatUIManager
    ChatUIManager.onMessage(
      "parse-chat-links",
      (element) => {
        parseMarkdownLinks(element);
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
    console.warn("N21: Error en feature Parse Chat Links:", error.message);
  }
})();
