(() => {
  /* =======================
       Core utilities and global namespace initialization
    ======================= */

  // expose for debugging and for features to access
  window._n21_ = {};

  /* =======================
       HTML helpers
    ======================= */
  const DEFAULT_HTML_ALLOWLIST = {
    ALLOWED_TAGS: ["span", "b", "i", "em", "strong", "u", "br"],
    ALLOWED_ATTR: ["class", "data-toggle", "title"],
  };

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

  window._n21_.sanitizeHtmlAllowlist = sanitizeHtmlAllowlist;
  window._n21_.toPlainText = toPlainText;
  window._n21_.normalizeTitleHtml = normalizeTitleHtml;
  window._n21_.isLikelyUrl = isLikelyUrl;
  window._n21_.getSenderInfoFromElement = getSenderInfoFromElement;
  window._n21_.setAnchorContent = setAnchorContent;
})();
