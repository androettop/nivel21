(() => {
  /* =======================
       CharacterSheetManager - Character sheet JSON data abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  // Matches a Nivel20 character page URL, with or without a campaign segment.
  // e.g. /games/dnd-2024/campaigns/138786-luna-de-sangre/characters/2111310-caelum
  //      /games/dnd-2024/characters/1913190-eiron
  const CHARACTER_PATH_RE =
    /^\/games\/[^/]+\/(?:campaigns\/[^/]+\/)?characters\/(\d+)(?:-[^/]*)?\/?$/;

  /**
   * CharacterSheetManager centralizes every access to the Nivel20 character
   * sheet JSON (`/characters/{id}.json`). Features should read character data
   * through this manager instead of fetching or poking at `printable_hash`
   * directly, so the platform-specific shape stays in one place.
   */
  class CharacterSheetManager extends BaseManager {
    async init() {
      super.init();
    }

    isReady() {
      return true;
    }

    /**
     * Whether the current page is a character sheet page.
     * @returns {boolean}
     */
    isCharacterPage() {
      return CHARACTER_PATH_RE.test(window.location.pathname);
    }

    /**
     * Build the `.json` URL for the character currently being viewed, or null
     * if we're not on a character page.
     * @returns {string|null}
     */
    getCurrentCharacterJsonUrl() {
      const path = window.location.pathname.replace(/\/$/, "");
      if (!CHARACTER_PATH_RE.test(path)) return null;
      return `${window.location.origin}${path}.json`;
    }

    /**
     * Fetch a character sheet and return its `printable_hash` payload.
     * Accepts either a full `.json` URL or a raw character page URL/path
     * (the `.json` suffix is added automatically).
     * @param {string} [urlOrPath] - Defaults to the current character page.
     * @returns {Promise<Object>} The `printable_hash` object.
     */
    async fetchCharacter(urlOrPath) {
      let url = urlOrPath || this.getCurrentCharacterJsonUrl();
      if (!url) {
        throw new Error(
          "CharacterSheetManager: no character URL given and not on a character page",
        );
      }
      // Normalize: strip query/hash, ensure a single `.json` suffix.
      url = url.split("#")[0].split("?")[0].replace(/\/$/, "");
      if (!url.endsWith(".json")) url = `${url}.json`;

      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(
          `CharacterSheetManager: failed to fetch ${url} (HTTP ${response.status})`,
        );
      }
      const data = await response.json();
      return data?.printable_hash || data;
    }

    /**
     * Character display name from a printable_hash.
     * @param {Object} ph
     * @returns {string}
     */
    getCharacterName(ph) {
      return ph?.info?.name || "";
    }

    /**
     * Proficiency bonus from a printable_hash.
     * @param {Object} ph
     * @returns {number}
     */
    getProficiencyBonus(ph) {
      return ph?.info?.proficiency_bonus ?? 0;
    }

    /**
     * The character's spell books (one per spellcasting profession).
     * @param {Object} ph
     * @returns {Array<Object>}
     */
    getSpellBooks(ph) {
      return Array.isArray(ph?.spell_books) ? ph.spell_books : [];
    }
  }

  // Register CharacterSheetManager
  const { registerManager } = window._n21_.utils;
  registerManager("CharacterSheetManager", CharacterSheetManager);
})();
