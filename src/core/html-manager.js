(() => {
  /* =======================
       HtmlManager - HTML sanitization and text utilities
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  const DEFAULT_HTML_ALLOWLIST = {
    ALLOWED_TAGS: ["span", "b", "i", "em", "strong", "u", "br"],
    ALLOWED_ATTR: ["class", "data-toggle", "title"],
  };

  /**
   * HtmlManager provides HTML sanitization and text manipulation utilities
   * Depends on: TooltipManager
   */
  class HtmlManager extends BaseManager {
    constructor() {
      super();
      this._initialized = false;
      this._tooltipManager = null;
    }

    /**
     * Initialize the manager - waits for DOMPurify and TooltipManager
     */
    async init() {
      if (this._initialized) return;

      await this._waitForDOMPurify();

      // Load TooltipManager dependency
      const { loadManagers } = window._n21_;
      const [TooltipManager] = await loadManagers("TooltipManager");
      this._tooltipManager = TooltipManager;

      this._initialized = true;
    }

    /**
     * Wait for DOMPurify to be available
     */
    _waitForDOMPurify() {
      return new Promise((resolve) => {
        if (window.DOMPurify) {
          resolve();
          return;
        }

        const checkInterval = setInterval(() => {
          if (window.DOMPurify) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }

    /**
     * Check if the manager is ready
     */
    isReady() {
      return this._initialized;
    }

    /**
     * Sanitize HTML with an allowlist of tags and attributes
     *
     * @param {string} value - HTML string to sanitize
     * @param {Object} allowlist - DOMPurify config with ALLOWED_TAGS and ALLOWED_ATTR
     * @returns {string} Sanitized HTML
     */
    sanitize(value, allowlist = DEFAULT_HTML_ALLOWLIST) {
      if (typeof value !== "string") return "";
      if (!window.DOMPurify) return value;
      return window.DOMPurify.sanitize(value, allowlist);
    }

    /**
     * Convert HTML to plain text
     *
     * @param {string} value - HTML string to convert
     * @returns {string} Plain text content
     */
    toPlainText(value) {
      const temp = document.createElement("div");
      const html = typeof value === "string" ? value : "";
      temp.innerHTML = window.DOMPurify
        ? window.DOMPurify.sanitize(html)
        : html;
      return temp.textContent || "";
    }

    /**
     * Set anchor element content with optional HTML support
     *
     * @param {HTMLAnchorElement} anchor - Anchor element to modify
     * @param {string} html - Content (HTML or plain text)
     * @param {boolean} allowHtml - Whether to allow HTML content
     */
    setAnchorContent(anchor, html, allowHtml) {
      if (!allowHtml) {
        anchor.textContent = this.toPlainText(html) || "Detalle";
        return;
      }

      if (window.DOMPurify) {
        anchor.innerHTML = this.sanitize(html);
        // Use TooltipManager to process tooltips
        if (this._tooltipManager) {
          this._tooltipManager.processAll(anchor);
        }
      } else {
        anchor.textContent = html;
      }
    }

    /**
     * Get the default HTML allowlist
     *
     * @returns {Object} Default allowlist config
     */
    getDefaultAllowlist() {
      return { ...DEFAULT_HTML_ALLOWLIST };
    }
  }

  // Create and expose the manager instance
  const htmlManager = new HtmlManager();
  htmlManager.init();

  // Expose in n21 namespace
  window._n21_ = window._n21_ || {};
  window._n21_.managers = window._n21_.managers || {};
  window._n21_.managers.HtmlManager = htmlManager;
})();
