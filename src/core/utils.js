(() => {
  /* =======================
       Core Utilities
    ======================= */

  // Initialize global namespace
  window._n21_ = {
    managers: {},
    utils: {},
  };

  /**
   * Load managers by name, waiting until they are ready
   * @param {...string} managerNames - Names of managers to load (e.g., 'ChatManager', 'TokenManager')
   * @param {Object} options - Optional configuration { timeout: number, checkInterval: number }
   * @returns {Promise<Object[]>} Promise that resolves with array of manager instances
   */
  function loadManagers(...args) {
    // Extract options if last argument is an object (not a string)
    let options = { timeout: 10000, checkInterval: 50 };
    let managerNames = args;

    if (args.length > 0 && typeof args[args.length - 1] === "object") {
      options = { ...options, ...args[args.length - 1] };
      managerNames = args.slice(0, -1);
    }

    const { timeout, checkInterval } = options;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkManagers = () => {
        const managers = window._n21_?.managers || {};
        const results = [];
        let allReady = true;

        for (const name of managerNames) {
          const manager = managers[name];
          if (
            !manager ||
            typeof manager.isReady !== "function" ||
            !manager.isReady()
          ) {
            allReady = false;
            break;
          }
          results.push(manager);
        }

        if (allReady && results.length === managerNames.length) {
          resolve(results);
        } else if (Date.now() - startTime > timeout) {
          const missing = managerNames.filter((name) => {
            const m = managers[name];
            return !m || typeof m.isReady !== "function" || !m.isReady();
          });
          reject(
            new Error(`Timeout waiting for managers: ${missing.join(", ")}`),
          );
        } else {
          setTimeout(checkManagers, checkInterval);
        }
      };

      checkManagers();
    });
  }

  /**
   * Generate a unique identifier
   * @returns {string} A unique identifier string
   */
  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  }

  /**
   * Check if current page is a Nivel20 tabletop URL
   * @returns {boolean}
   */
  function isTabletopUrl() {
    return /^https:\/\/nivel20\.com\/tabletop(?:\/|$)/.test(window.location.href);
  }

  /**
   * Map of emojis to animated image URLs
   * Used for enhanced visual representation in features like ping-map
   */
  const EMOJI_TO_IMAGE_MAP = {
    "❗": "https://em-content.zobj.net/source/animated-noto-color-emoji/427/exclamation-mark_2757.gif",
    "❌": "https://em-content.zobj.net/source/animated-noto-color-emoji/427/cross-mark_274c.gif",
    "⚠️": "https://em-content.zobj.net/source/animated-noto-color-emoji/427/warning_26a0-fe0f.gif",
    "💀": "https://em-content.zobj.net/source/animated-noto-color-emoji/427/skull_1f480.gif",
    "❓": "https://em-content.zobj.net/source/animated-noto-color-emoji/427/question-mark_2753.gif",
    "🔥": "https://em-content.zobj.net/source/animated-noto-color-emoji/427/fire_1f525.gif",
  };

  /**
   * Get image URL for an emoji if available
   * @param {string} emoji - The emoji to look up
   * @returns {string|null} The image URL or null if not found
   */
  function getEmojiImageUrl(emoji) {
    if (!emoji || typeof emoji !== "string") return null;
    return EMOJI_TO_IMAGE_MAP[emoji.trim()] || null;
  }

  /**
   * Register a manager class, instantiate it, call init(), and expose it globally
   * @param {string} name - The name to register the manager under (e.g., 'ChatManager')
   * @param {class} ManagerClass - The manager class to instantiate
   * @returns {Object} The instantiated manager
   */
  function registerManager(name, ManagerClass) {
    const manager = new ManagerClass();
    manager.init();

    window._n21_.managers[name] = manager;
    return manager;
  }

  // Expose utility for manager abstractions

  window._n21_.utils.uuid = uuid;
  window._n21_.utils.isTabletopUrl = isTabletopUrl;
  window._n21_.utils.getEmojiImageUrl = getEmojiImageUrl;
  window._n21_.utils.registerManager = registerManager;

  // Expose loadManagers globally for features
  window._n21_.loadManagers = loadManagers;
})();
