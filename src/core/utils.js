(() => {
  /* =======================
       Core Utilities
    ======================= */

  // Initialize global namespace
  window._n21_ = {
    managers: {},
    utils: {},
    errors: {
      managers: new Map(), // Map<managerName, errorMessage>
      features: new Map(), // Map<featureName, errorMessage>
    },
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
  async function registerManager(name, ManagerClass) {
    try {
      const manager = new ManagerClass();
      await manager.init();

      window._n21_.managers[name] = manager;
      return manager;
    } catch (error) {
      console.error(`N21: Error al cargar manager ${name}:`, error);
      window._n21_.errors.managers.set(name, error.message || String(error));
      throw error;
    }
  }

  /**
   * Register a feature error
   * @param {string} featureName - The name of the feature that failed
   * @param {Error|string} error - The error that occurred
   */
  function registerFeatureError(featureName, error) {
    const errorMessage = error?.message || String(error);
    window._n21_.errors.features.set(featureName, errorMessage);
    console.error(`N21: Error al cargar feature ${featureName}:`, errorMessage);
  }

  // Expose utility for manager abstractions

  /**
   * Determine if a tag value needs quotes
   * Values need quotes if they contain spaces, colons, brackets, or quotes
   * @param {*} value - The value to check
   * @returns {boolean} True if value needs quotes
   */
  function needsQuotes(value) {
    const str = String(value || "").trim();
    // Needs quotes if it contains spaces, special chars, or is empty
    return /[\s:\[\]"]/.test(str) || str === "";
  }

  /**
   * Format a tag value with quotes only if necessary
   * @param {*} value - The value to format
   * @returns {string} The formatted value
   */
  function formatTagValue(value) {
    const str = String(value || "").trim();
    if (!needsQuotes(str)) {
      return str;
    }
    // Escape any quotes in the value and wrap in quotes
    const escaped = str.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  /**
   * Parse a tag from description text
   * @param {string} description - The description text to search
   * @param {string} key - The tag key to look for (e.g., 'user', 'l')
   * @returns {string|null} The tag value or null if not found
   */
  function parseTokenTag(description, key) {
    if (!description || !key) return null;

    const text = String(description).trim();
    // Match [key:value] where value can be quoted or unquoted
    const pattern = new RegExp(`\\[${key}:\\s*(?:"([^"]*)"|([^\\]\\s]+))\\s*\\]`, "i");
    const match = pattern.exec(text);

    if (!match) return null;
    // Return either the quoted part (match[1]) or unquoted part (match[2])
    return match[1] !== undefined ? match[1] : match[2];
  }

  /**
   * Set or update a tag in description text
   * @param {string} description - The original description text
   * @param {string} key - The tag key (e.g., 'user', 'l')
   * @param {*} value - The tag value
   * @returns {string} The updated description
   */
  function setTokenTag(description, key, value) {
    if (!key) return description || "";

    const text = String(description || "").trim();
    const formattedValue = formatTagValue(value);
    const newTag = `[${key}:${formattedValue}]`;

    // Pattern to find and replace existing tag
    const pattern = new RegExp(`\\[${key}:\\s*(?:"[^"]*"|[^\\]\\s]+)\\s*\\]`, "gi");
    if (pattern.test(text)) {
      return text.replace(pattern, newTag);
    }

    // If tag doesn't exist, append it
    return text ? `${text} ${newTag}` : newTag;
  }

  /**
   * Remove a tag from description text
   * @param {string} description - The original description text
   * @param {string} key - The tag key to remove (e.g., 'user', 'l')
   * @returns {string} The description without the tag
   */
  function removeTokenTag(description, key) {
    if (!description || !key) return description || "";

    const text = String(description).trim();
    // Pattern to find and remove tag
    const pattern = new RegExp(`\\s*\\[${key}:\\s*(?:"[^"]*"|[^\\]\\s]+)\\s*\\]\\s*`, "gi");
    return text.replace(pattern, " ").trim();
  }

  window._n21_.utils.uuid = uuid;
  window._n21_.utils.isTabletopUrl = isTabletopUrl;
  window._n21_.utils.getEmojiImageUrl = getEmojiImageUrl;
  window._n21_.utils.registerManager = registerManager;
  window._n21_.utils.registerFeatureError = registerFeatureError;
  window._n21_.utils.needsQuotes = needsQuotes;
  window._n21_.utils.formatTagValue = formatTagValue;
  window._n21_.utils.parseTokenTag = parseTokenTag;
  window._n21_.utils.setTokenTag = setTokenTag;
  window._n21_.utils.removeTokenTag = removeTokenTag;

  // Expose loadManagers globally for features
  window._n21_.loadManagers = loadManagers;
})();
