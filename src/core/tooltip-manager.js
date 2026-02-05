(() => {
  /* =======================
       TooltipManager - Tooltip processing abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * TooltipManager provides a unified interface for processing tooltips
   * Wraps the native window.processTooltip function
   */
  class TooltipManager extends BaseManager {
    constructor() {
      super();
      this._initialized = false;
    }

    /**
     * Initialize the manager - waits for window.processTooltip to be available
     */
    async init() {
      if (this._initialized) return;

      // Wait for processTooltip to be available
      await this._waitForProcessTooltip();
      this._initialized = true;
    }

    /**
     * Wait for window.processTooltip to be available
     */
    _waitForProcessTooltip() {
      return new Promise((resolve) => {
        if (typeof window.processTooltip === "function") {
          resolve();
          return;
        }

        const checkInterval = setInterval(() => {
          if (typeof window.processTooltip === "function") {
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
      return this._initialized && typeof window.processTooltip === "function";
    }

    /**
     * Process a single element's tooltip
     *
     * @param {HTMLElement} element - Element with title attribute to process
     */
    process(element) {
      if (!element) return;

      try {
        window.processTooltip(element);
      } catch (error) {
        console.warn("[TooltipManager] Error processing tooltip:", error);
      }
    }

    /**
     * Process all elements with [title] attribute within a root element
     *
     * @param {HTMLElement} root - Root element to search within
     */
    processAll(root) {
      if (!root) return;

      const elements = root.querySelectorAll("[title]");
      elements.forEach((element) => {
        try {
          window.processTooltip(element);
        } catch (error) {
          console.warn("[TooltipManager] Error processing tooltip:", error);
        }
      });
    }

    /**
     * Process an array of elements
     *
     * @param {HTMLElement[]|NodeList} elements - Elements to process
     */
    processElements(elements) {
      if (!elements) return;

      elements.forEach((element) => {
        try {
          window.processTooltip(element);
        } catch (error) {
          console.warn("[TooltipManager] Error processing tooltip:", error);
        }
      });
    }
  }

  // Register TooltipManager
  const { registerManager } = window._n21_.utils;
  registerManager("TooltipManager", TooltipManager);
})();
