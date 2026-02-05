(async () => {
  try {
    /* =======================
	       Feature: Send to Chat
	    ======================= */

    const { loadManagers } = window._n21_;

    const [ChatManager, KeyModifiersManager, FloatingPanelManager, HtmlManager] =
      await loadManagers(
        "ChatManager",
        "KeyModifiersManager",
        "FloatingPanelManager",
        "HtmlManager",
      );

    // ==================== Local Helper Functions ====================

    function normalizeTitleHtml(value) {
      return typeof value === "string"
        ? value.replace(/="([^"]*)"/g, "='$1'")
        : "";
    }

    function isLikelyUrl(value) {
      return (
        typeof value === "string" &&
        (value.startsWith("http://") ||
          value.startsWith("https://") ||
          value.startsWith("/") ||
          value.startsWith("data:"))
      );
    }

    function getSenderInfoFromElement(element) {
      if (!element) return null;

      const $elementWithSenderInfo = $(element).closest("[data-sender-info]");
      if ($elementWithSenderInfo.length > 0) {
        return $elementWithSenderInfo.attr("data-sender-info");
      }

      return null;
    }

    // ==================== Feature Code ====================

    const floatingElementsSelector = "[data-floating], [data-static-floating]";
    let hoverEl = null;

    // Helper function to get icon URL from floating element
    function getIconUrlFromElement(element) {
      const img = element.querySelector("img");
      return img ? img.src : null;
    }

    function getFloatingDataFromElement(element) {
      if (!element) return null;
      return {
        title: normalizeTitleHtml(
          element.getAttribute("data-floating-title") || "",
        ),
        icon: element.getAttribute("data-floating-icon") || "",
        color: element.getAttribute("data-floating-color") || "",
        content: element.getAttribute("data-floating-content") || "",
        url: element.getAttribute("data-floating-url") || "",
      };
    }

    // Helper function to update visual feedback
    function updateChatFilter(el, isShiftPressed) {
      if (!el) return;

      const $el = $(el);

      if (isShiftPressed) {
        $el.addClass("n21-send-to-chat");
      } else {
        $el.removeClass("n21-send-to-chat");
      }
    }

    // Helper function to clear visual feedback
    function clearChatFilter(el) {
      if (!el) return;
      $(el).removeClass("n21-send-to-chat");
    }

    // Helper function to get sender info with fallback
    function getSenderInfo() {
      let senderInfo = getSenderInfoFromElement(hoverEl);

      if (!senderInfo) {
        const senderInfoElement = document.getElementById(
          "room_message_sender_info",
        );
        senderInfo = senderInfoElement?.value;
      }

      return senderInfo;
    }

    // Helper function to send encoded payload to chat
    function sendPayloadToChat(payload, fallbackIcon) {
      const senderInfo = getSenderInfo();
      const messageOptions = {};

      if (senderInfo) {
        messageOptions.sender_info = senderInfo;
      }

      // Try to get icon from the hovered element
      if (hoverEl) {
        const iconUrl = getIconUrlFromElement(hoverEl);
        if (iconUrl) {
          messageOptions.icon = iconUrl;
        }
      }

      // Use fallback icon if no icon set yet
      if (!messageOptions.icon && isLikelyUrl(fallbackIcon)) {
        messageOptions.icon = fallbackIcon;
      }

      ChatManager.sendJsonMessage(payload, messageOptions);
    }

    // Track hovered floating element
    $(document)
      .on("mouseenter", floatingElementsSelector, function () {
        hoverEl = this;
        updateChatFilter(this, KeyModifiersManager.getState().shift);
      })
      .on("mouseleave", floatingElementsSelector, function () {
        clearChatFilter(this);
        hoverEl = null;
      });

    // Update visual feedback when shift modifier changes
    KeyModifiersManager.onChange((modifiers) => {
      updateChatFilter(hoverEl, modifiers.shift);
    });

    // Intercept loadInFloatingPanel to send to chat if shift is pressed
    FloatingPanelManager.onLoad(
      "send-to-chat",
      (data) => {
        if (KeyModifiersManager.getState().shift) {
          if (data.title) {
            sendPayloadToChat(
              {
                type: "floating",
                title: normalizeTitleHtml(data.title),
                url: data.url,
                icon: data.icon,
              },
              data.icon,
            );
          }
          return false;
        }
      },
      { priority: 100 },
    );

    // Intercept openInFloatingPanel to send static floating panels to chat
    FloatingPanelManager.onOpen(
      "send-to-chat",
      (arg1, arg2, arg3, arg4) => {
        if (KeyModifiersManager.getState().shift) {
          let data = null;

          if (arg1 instanceof HTMLElement) {
            data = getFloatingDataFromElement(arg1);
          } else if (arg1 && typeof arg1 === "object") {
            data = {
              title: normalizeTitleHtml(arg1.title || arg1.name || ""),
              icon: arg1.icon || "",
              color: arg1.color || "",
              content: arg1.content || arg1.body || arg1.text || "",
              url: arg1.url || "",
            };
          } else {
            data = {
              title: normalizeTitleHtml(typeof arg1 === "string" ? arg1 : ""),
              icon: typeof arg2 === "string" ? arg2 : "",
              color: typeof arg3 === "string" ? arg3 : "",
              content: typeof arg4 === "string" ? arg4 : "",
              url: "",
            };
          }

          const plainTitle = HtmlManager.toPlainText(data?.title || "");
          const plainContent = HtmlManager.toPlainText(data?.content || "");
          sendPayloadToChat(
            {
              type: "static",
              title: plainTitle,
              url: data?.url || "",
              icon: data?.icon || "",
              color: data?.color || "",
              content: plainContent,
            },
            data?.icon,
          );

          return false;
        }
      },
      { priority: 100 },
    );
  } catch (error) {
    console.warn("N21: Error en feature Send to Chat:", error.message);
  }
})();
