(() => {
  /* =======================
       Core utilities and global namespace initialization
    ======================= */

  // expose for debugging and for features to access
  window._n21_ = {};

  /* =======================
       Funciones de utilidad
    ======================= */

  /* =======================
       Chat payload & HTML helpers
    ======================= */
  const DEFAULT_HTML_ALLOWLIST = {
    ALLOWED_TAGS: ["span", "b", "i", "em", "strong", "u", "br"],
    ALLOWED_ATTR: ["class", "data-toggle", "title"],
  };

  function escapeN21PayloadValue(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/=/g, "\\=");
  }

  function encodeN21Payload(warningText, payload) {
    try {
      const pairs = [];
      for (const [key, value] of Object.entries(payload || {})) {
        if (value) {
          pairs.push(`${key}=${escapeN21PayloadValue(value)}`);
        }
      }
      const encoded = pairs.join("|");
      return `[[n21: ${warningText} ||${encoded}]]`;
    } catch (error) {
      return "";
    }
  }

  function decodeN21Payload(encoded) {
    try {
      const payload = {};
      const pairs = encoded.split(/(?<!\\)\|/);

      for (const pair of pairs) {
        const matchResult = pair.match(/^([^=]+)=(.*)$/);
        if (matchResult) {
          const key = matchResult[1];
          const value = matchResult[2]
            .replace(/\\=/g, "=")
            .replace(/\\\|/g, "|")
            .replace(/\\\\/g, "\\");
          payload[key] = value;
        }
      }

      return payload;
    } catch (error) {
      return null;
    }
  }

  function sanitizeHtmlAllowlist(value, allowlist = DEFAULT_HTML_ALLOWLIST) {
    if (typeof value !== "string") return "";
    if (!window.DOMPurify) return value;
    return window.DOMPurify.sanitize(value, allowlist);
  }

  function toPlainText(value) {
    const temp = document.createElement("div");
    const html = typeof value === "string" ? value : "";
    temp.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
    return temp.textContent || "";
  }

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

  function applyTooltips(root) {
    if (typeof processTooltip !== "function") return;
    root.querySelectorAll("[title]").forEach(processTooltip);
  }

  function setAnchorContent(anchor, html, allowHtml) {
    if (!allowHtml) {
      anchor.textContent = toPlainText(html) || "Detalle";
      return;
    }

    if (window.DOMPurify) {
      anchor.innerHTML = sanitizeHtmlAllowlist(html);
      applyTooltips(anchor);
    } else {
      anchor.textContent = html;
    }
  }

  // Legacy uuid function
  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  }

  function isFolder(item) {
    return item.action_type === "folder";
  }

  function createFolderFromItem(baseItem, name) {
    return {
      id: uuid(),
      name,
      text: null,
      icon: baseItem.icon,
      description: null,
      action_type: "folder",
      hidden: false,
      order: null,
      source_name: null,
      tooltip_title: name,
      owned: baseItem.owned,
      elements: [],
    };
  }

  window._n21_.escapeN21PayloadValue = escapeN21PayloadValue;
  window._n21_.encodeN21Payload = encodeN21Payload;
  window._n21_.decodeN21Payload = decodeN21Payload;
  window._n21_.sanitizeHtmlAllowlist = sanitizeHtmlAllowlist;
  window._n21_.toPlainText = toPlainText;
  window._n21_.normalizeTitleHtml = normalizeTitleHtml;
  window._n21_.isLikelyUrl = isLikelyUrl;
  window._n21_.getSenderInfoFromElement = getSenderInfoFromElement;
  window._n21_.applyTooltips = applyTooltips;
  window._n21_.setAnchorContent = setAnchorContent;
  window._n21_.isFolder = isFolder;
  window._n21_.createFolderFromItem = createFolderFromItem;
})();
