(async () => {
  try {
    /* =======================
	       Feature: Advantage / Disadvantage
	    ======================= */

    const { loadManagers, settingsLoader } = window._n21_;
    
    // Wait for settings to load
    await settingsLoader.load();
    
    // Check if feature is enabled
    if (!settingsLoader.isFeatureEnabled('advantage-disadvantage')) {
      console.log('N21: Feature Advantage/Disadvantage is disabled');
      return;
    }

    const [KeyModifiersManager, DiceManager] = await loadManagers(
      "KeyModifiersManager",
      "DiceManager",
    );

    let hoverEl = null;

    function updateOutline(el, modifiers) {
      if (!el) return;

      const $el = $(el);

      $el.removeClass("n21-advantage n21-disadvantage");

      /* --- cancel out if both pressed --- */
      if (modifiers.shift && modifiers.alt) return;

      if (modifiers.shift) {
        $el.addClass("n21-advantage");
      } else if (modifiers.alt) {
        $el.addClass("n21-disadvantage");
      }
    }

    function clearOutline(el) {
      if (!el) return;
      $(el).removeClass("n21-advantage n21-disadvantage");
    }

    const rollButtonsSelector = ".action-bar-button, [data-dice-roll]";

    $(document)
      .on("mouseenter", rollButtonsSelector, function () {
        hoverEl = this;
        updateOutline(this, KeyModifiersManager.getState());
      })
      .on("mouseleave", rollButtonsSelector, function () {
        clearOutline(this);
        hoverEl = null;
      });

    KeyModifiersManager.onChange((modifiers) => {
      updateOutline(hoverEl, modifiers);
    });

    DiceManager.addModifier(
      "advantage-disadvantage",
      (notation, ...args) => {
        // already modified → do nothing
        if (
          typeof notation === "string" &&
          (notation.toLowerCase().includes("max") ||
            notation.toLowerCase().includes("min"))
        ) {
          return [notation, ...args];
        }

        const modifiers = KeyModifiersManager.getState();

        /* --- cancel out --- */
        if (modifiers.shift && modifiers.alt) {
          return [notation, ...args];
        }

        if (typeof notation !== "string") {
          return [notation, ...args];
        }

        /* --- detect dice + modifier --- */
        const match = notation.match(/^(\d+d\d+)\s*([+-])\s*(\d+)$/);

        let dicePart = notation;
        let modifierPart = "";

        if (match) {
          dicePart = match[1];
          modifierPart = `${match[2]}${match[3]}`;
        }

        /* --- apply advantage / disadvantage --- */
        if (modifiers.shift) {
          dicePart = `max(${dicePart},${dicePart})`;
        } else if (modifiers.alt) {
          dicePart = `min(${dicePart},${dicePart})`;
        }

        notation = modifierPart ? `${dicePart}${modifierPart}` : dicePart;

        return [notation, ...args];
      },
      { priority: 100 },
    );
  } catch (error) {
    console.warn(
      "N21: Error en feature Advantage/Disadvantage:",
      error.message,
    );
  }
})();
