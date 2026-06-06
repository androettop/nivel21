(() => {
  /* =======================
       CharacterManager - Character tracking panel abstraction
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  const TRACKING_ROWS_SELECTOR = "#tracking-rows";
  const CHARACTER_ROW_SELECTOR = '[data-action-bar][data-row-id]';

  /**
   * CharacterManager provides a unified interface for reading the character
   * tracking panel and selecting characters from it.
   */
  class CharacterManager extends BaseManager {
    async init() {
      super.init();
    }

    isReady() {
      return true;
    }

    /**
     * Get the list of entries (characters and creatures) from the tracking panel.
     * @returns {Array<{id: string, name: string, type: string}>}
     */
    getCharacterList() {
      const rows = document.querySelectorAll(
        `${TRACKING_ROWS_SELECTOR} ${CHARACTER_ROW_SELECTOR}[data-row-type="character"], ` +
        `${TRACKING_ROWS_SELECTOR} ${CHARACTER_ROW_SELECTOR}[data-row-type="creature"]`,
      );

      const characters = [];
      const seen = new Set();

      rows.forEach((row) => {
        const id = row.getAttribute("data-row-id");
        if (!id || seen.has(id)) return;
        seen.add(id);

        const nameEl = row.querySelector(".char-name");
        const name = (nameEl?.textContent || "").trim();
        const type = row.getAttribute("data-row-type") || "";

        characters.push({ id, name: name || id, type });
      });

      return characters;
    }

    /**
     * Get a character's display name by its row id.
     * @param {string} rowId
     * @returns {string|null}
     */
    getCharacterName(rowId) {
      if (!rowId) return null;
      const character = this.getCharacterList().find((c) => c.id === `${rowId}`);
      return character?.name || null;
    }

    /**
     * Get a character's initiative value by its row id, read from the tracking
     * panel (.char-initiative-value). Returns 0 if there's no numeric value.
     * @param {string} rowId
     * @returns {number}
     */
    getCharacterInitiative(rowId) {
      if (!rowId) return 0;

      const row = document.querySelector(
        `${TRACKING_ROWS_SELECTOR} ${CHARACTER_ROW_SELECTOR}[data-row-id="${rowId}"]`,
      );
      if (!row) return 0;

      const valueEl = row.querySelector(".char-initiative-value");
      const value = parseInt((valueEl?.textContent || "").trim(), 10);
      return Number.isFinite(value) ? value : 0;
    }

    /**
     * Select a character in the tracking panel by triggering its row click.
     * Does nothing if the row doesn't exist.
     * @param {string} rowId
     * @returns {boolean} True if a matching row was clicked
     */
    selectCharacter(rowId) {
      if (!rowId) return false;

      const $row = $(`${CHARACTER_ROW_SELECTOR}[data-row-id="${rowId}"]:not(.selected)`);
      if (!$row.length) return false;

      $row.first().click();
      return true;
    }
  }

  // Register CharacterManager
  const { registerManager } = window._n21_.utils;
  registerManager("CharacterManager", CharacterManager);
})();
