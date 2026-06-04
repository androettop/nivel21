(() => {
  /* =======================
       MarkdownEditorManager - Wrapper around the platform markdown editor
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  // Allowlist for rendered markdown HTML (cards / previews).
  const MARKDOWN_HTML_ALLOWLIST = {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "b", "em", "i", "u", "s", "del",
      "blockquote", "code", "pre",
      "table", "thead", "tbody", "tr", "th", "td",
      "a", "span",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel", "class", "align"],
  };

  /**
   * MarkdownEditorManager wraps the global `window.setupMarkdownEditorXS`
   * (EasyMDE) so features don't depend on the platform global directly.
   * If the global ever changes, only this manager needs to be updated.
   */
  class MarkdownEditorManager extends BaseManager {
    constructor() {
      super();
      this._ready = false;
      this._editorAvailable = false;
      this._htmlManager = null;
      this._renderInstance = null;
    }

    async init() {
      if (this._ready) return;

      // Wait (best effort) for the platform editor global to appear.
      const maxAttempts = 100;
      const interval = 100;
      for (let i = 0; i < maxAttempts; i++) {
        if (typeof window.setupMarkdownEditorXS === "function") {
          this._editorAvailable = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      if (!this._editorAvailable) {
        console.warn(
          "[MarkdownEditorManager] window.setupMarkdownEditorXS not available; falling back to plain textareas",
        );
      }

      // Try to load HtmlManager for sanitization (optional dependency).
      try {
        const { loadManagers } = window._n21_;
        const [HtmlManager] = await loadManagers("HtmlManager", {
          timeout: 5000,
        });
        this._htmlManager = HtmlManager;
      } catch (error) {
        console.warn(
          "[MarkdownEditorManager] HtmlManager not available:",
          error?.message || error,
        );
      }

      // Mark ready regardless: attach()/render() degrade gracefully so
      // features depending on this manager never time out.
      this._ready = true;
    }

    isReady() {
      return this._ready;
    }

    /**
     * Whether the platform markdown editor is available.
     * @returns {boolean}
     */
    isEditorAvailable() {
      return this._editorAvailable;
    }

    /**
     * Attach a markdown editor to a textarea element.
     * @param {HTMLTextAreaElement} textareaEl
     * @returns {Object|null} The EasyMDE instance, or null if unavailable
     */
    attach(textareaEl) {
      if (!textareaEl) return null;
      if (typeof window.setupMarkdownEditorXS !== "function") {
        return null;
      }

      try {
        window.setupMarkdownEditorXS(textareaEl);
        if (typeof window.$ === "function") {
          return window.$(textareaEl).data("simplemde") || null;
        }
        return null;
      } catch (error) {
        console.warn("[MarkdownEditorManager] Failed to attach editor:", error);
        return null;
      }
    }

    /**
     * Read the current value from an editor instance (or textarea fallback).
     * @param {Object|null} instance - EasyMDE instance
     * @param {HTMLTextAreaElement} [textareaEl] - Fallback textarea
     * @returns {string}
     */
    getValue(instance, textareaEl) {
      if (instance && typeof instance.value === "function") {
        return instance.value();
      }
      return textareaEl ? textareaEl.value : "";
    }

    /**
     * Set the value of an editor instance (or textarea fallback).
     * @param {Object|null} instance - EasyMDE instance
     * @param {string} value
     * @param {HTMLTextAreaElement} [textareaEl] - Fallback textarea
     */
    setValue(instance, value, textareaEl) {
      const md = value || "";
      if (instance && typeof instance.value === "function") {
        instance.value(md);
        return;
      }
      if (textareaEl) textareaEl.value = md;
    }

    /**
     * Register a change handler on an editor instance (or textarea fallback).
     * @param {Object|null} instance - EasyMDE instance
     * @param {HTMLTextAreaElement} textareaEl - Fallback textarea
     * @param {Function} handler - Called with the current value
     */
    onChange(instance, textareaEl, handler) {
      if (typeof handler !== "function") return;

      if (instance && instance.codemirror && typeof instance.codemirror.on === "function") {
        instance.codemirror.on("change", () => handler(this.getValue(instance, textareaEl)));
        return;
      }

      if (textareaEl) {
        const fn = () => handler(textareaEl.value);
        textareaEl.addEventListener("input", fn);
        textareaEl.addEventListener("change", fn);
      }
    }

    /**
     * Destroy an editor instance, restoring the underlying textarea.
     * @param {Object|null} instance - EasyMDE instance
     */
    destroy(instance) {
      if (instance && typeof instance.toTextArea === "function") {
        try {
          instance.toTextArea();
        } catch (error) {
          console.warn("[MarkdownEditorManager] Failed to destroy editor:", error);
        }
      }
    }

    /**
     * Render markdown to sanitized HTML for read-only display.
     * @param {string} markdown
     * @returns {string} Sanitized HTML
     */
    render(markdown) {
      const md = typeof markdown === "string" ? markdown : "";
      let html = null;

      // Preferred: reuse EasyMDE's bundled markdown renderer.
      try {
        if (typeof window.EasyMDE === "function") {
          const instance = this._getRenderInstance();
          if (instance && typeof instance.markdown === "function") {
            html = instance.markdown(md);
          }
        }
      } catch (error) {
        html = null;
      }

      // Fallback: a globally available `marked`.
      if (html === null && window.marked) {
        try {
          const marked = window.marked;
          html = typeof marked === "function"
            ? marked(md)
            : typeof marked.parse === "function"
              ? marked.parse(md)
              : null;
        } catch (error) {
          html = null;
        }
      }

      // Last resort: escaped plain text with line breaks preserved.
      if (html === null) {
        return this._escapeHtml(md).replace(/\n/g, "<br>");
      }

      if (this._htmlManager) {
        return this._htmlManager.sanitize(html, MARKDOWN_HTML_ALLOWLIST);
      }
      if (window.DOMPurify) {
        return window.DOMPurify.sanitize(html, MARKDOWN_HTML_ALLOWLIST);
      }
      return html;
    }

    /**
     * Lazily build a hidden EasyMDE instance used only for rendering.
     * @private
     */
    _getRenderInstance() {
      if (this._renderInstance) return this._renderInstance;
      if (typeof window.EasyMDE !== "function") return null;

      try {
        // EasyMDE replaces the textarea with a visible editor UI, so keep the
        // whole thing inside an off-screen, hidden wrapper.
        const wrapper = document.createElement("div");
        wrapper.setAttribute("aria-hidden", "true");
        wrapper.style.cssText =
          "position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;";
        const textarea = document.createElement("textarea");
        wrapper.appendChild(textarea);
        document.body.appendChild(wrapper);
        this._renderInstance = new window.EasyMDE({
          element: textarea,
          autoDownloadFontAwesome: false,
        });
      } catch (error) {
        this._renderInstance = null;
      }
      return this._renderInstance;
    }

    /**
     * @private
     */
    _escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("MarkdownEditorManager", MarkdownEditorManager);
})();
