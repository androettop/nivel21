(() => {
  /* =======================
       TokenDescriptionManager - Replace token description input with textarea
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  class TokenDescriptionManager extends BaseManager {
    constructor() {
      super();
      this._observer = null;
      this._selector = "#tabletop_asset_description";
      this._installed = false;
    }

    init() {
      if (this._installed) return;

      this._installed = true;
      this._replaceIfNeeded();
      this._observeDomChanges();
    }

    isReady() {
      return this._installed;
    }

    _observeDomChanges() {
      this._observer = new MutationObserver(() => {
        this._replaceIfNeeded();
      });

      this._observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    _replaceIfNeeded() {
      const inputEl = document.querySelector(this._selector);
      if (!inputEl || inputEl.tagName !== "INPUT") return;

      const originalHtml = inputEl.outerHTML;

      const isTargetDescriptionInput =
        /^<input\b[^>]*\bid=(['"])tabletop_asset_description\1[^>]*\/?>(?:\s*)$/i.test(
          originalHtml,
        );

      if (!isTargetDescriptionInput) return;

      const valueAttrMatch = originalHtml.match(/\bvalue=(['"])([\s\S]*?)\1/i);
      const value = inputEl.value || valueAttrMatch?.[2] || "";

      const textareaHtml = originalHtml
        .replace(/^<input\b/i, "<textarea")
        .replace(/\svalue=(['"])[\s\S]*?\1/i, "")
        .replace(/\s*\/?>\s*$/i, `>${escapeHtml(value)}</textarea>`);

      inputEl.outerHTML = textareaHtml;
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("TokenDescriptionManager", TokenDescriptionManager);
})();
