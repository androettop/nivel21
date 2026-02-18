(async () => {
  try {
    /* =======================
	       Feature: Advantage / Disadvantage
	    ======================= */

    const { loadManagers } = window._n21_;

    const [KeyModifiersManager, DiceManager, SettingsManager] = await loadManagers(
      "KeyModifiersManager",
      "DiceManager",
      "SettingsManager",
    );

    // Check if feature is enabled
    if (!SettingsManager.get("feature.advantage-disadvantage.enabled")) {
      return;
    }

    let hoverEl = null;

    function getConfiguredModifiers() {
      const advantage = String(
        SettingsManager.get("advantage-disadvantage.advantage-modifier") ||
          "shift",
      ).toLowerCase();
      const disadvantage = String(
        SettingsManager.get("advantage-disadvantage.disadvantage-modifier") ||
          "alt",
      ).toLowerCase();

      const allowedModifiers = ["shift", "ctrl", "alt"];

      return {
        advantage: allowedModifiers.includes(advantage) ? advantage : "shift",
        disadvantage: allowedModifiers.includes(disadvantage)
          ? disadvantage
          : "alt",
      };
    }

    function updateOutline(el, modifiers) {
      if (!el) return;

      const $el = $(el);
      const configured = getConfiguredModifiers();
      const advantageActive = Boolean(modifiers[configured.advantage]);
      const disadvantageActive = Boolean(modifiers[configured.disadvantage]);

      $el.removeClass("n21-advantage n21-disadvantage");

      /* --- cancel out if both pressed --- */
      if (advantageActive && disadvantageActive) return;

      if (advantageActive) {
        $el.addClass("n21-advantage");
      } else if (disadvantageActive) {
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
        const configured = getConfiguredModifiers();
        const advantageActive = Boolean(modifiers[configured.advantage]);
        const disadvantageActive = Boolean(modifiers[configured.disadvantage]);

        /* --- cancel out --- */
        if (advantageActive && disadvantageActive) {
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
        if (advantageActive) {
          dicePart = `max(${dicePart},${dicePart})`;
        } else if (disadvantageActive) {
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
