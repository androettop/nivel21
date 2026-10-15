(async () => {
  try {
    /* =======================================================================
         Feature: Actions Bar

         Injects the standard D&D "Acciones" folder (Dash, Disengage, Dodge,
         Help, Hide, Ready, Search, Study, Utilize) into a character's action
         bar. These actions are identical for every character — no rolls, just
         icon + name + description — so they're hardcoded here instead of
         fetched from the sheet.

         The folder is inserted right after the spell folders (injected by the
         spell-action-bar feature) and before the character's native actions.

         Icons are bundled extension assets under `src/assets/actions/`; their
         URL is built from the extension base URL (which carries the extension
         id) exposed by the content script as `documentElement.dataset.n21BaseUrl`.
      ======================================================================= */

    const { loadManagers } = window._n21_;

    const [ActionBarManager, SettingsManager, CombatTrackingManager] = await loadManagers(
      "ActionBarManager",
      "SettingsManager",
      "CombatTrackingManager",
    );

    // Applies live: when disabled its items are stripped from the bar.
    let featureEnabled = SettingsManager.get("feature.actions-bar.enabled");

    // Marks the folder injected by this feature so re-renders stay idempotent.
    const INJECT_TAG = "__n21Actions";

    const uuid =
      window._n21_?.utils?.uuid || (() => Math.random().toString(36).slice(2));

    /** Build a bundled-asset URL from the extension base (carries the ext id). */
    function assetUrl(file) {
      const base = document.documentElement?.dataset?.n21BaseUrl || "";
      return `${base}src/assets/actions/${file}`;
    }

    // Standard actions: [name, icon file, description (HTML) | null].
    const ACTIONS = [
      [
        "Carrera (Dash)",
        "dash.png",
        "<p>Obtienes movimiento adicional</p>\n",
      ],
      [
        "Destrabar (Disengage)",
        "disengage.png",
        "<p>Al usarla, tu movimiento no provoca ataques de oportunidad.</p>\n",
      ],
      [
        "Esquivar (Dodge)",
        "dodge.png",
        "<p>Desventaja en ataques contra ti.\nVentaja en tiradas de salvación de Destreza.</p>\n",
      ],
      [
        "Ayudar (Help)",
        "help.png",
        "<p>Elige una habilidad o herramienta competente: das Ventaja en una prueba de d20.</p>\n\n<p>Si un enemigo está a 1,5 m (5 pies) de ti: das Ventaja en un ataque aliado contra ese enemigo.</p>\n",
      ],
      ["Ocultarse (Hide)", "hide.jpg", null],
      [
        "Preparar (Ready)",
        "ready.png",
        "<p>Elige una acción y un desencadenante; usas tu reacción antes de tu próximo turno cuando ocurra el desencadenante</p>\n",
      ],
      [
        "Buscar (Search)",
        "search.png",
        "<p>Usar Perspicacia, Medicina, Percepción o Supervivencia según el caso</p>\n",
      ],
      [
        "Investigar (Study)",
        "study.png",
        "<p>Usar Arcana, Historia, Investigación, Naturaleza o Religión</p>\n",
      ],
      [
        "Usar (Utilize)",
        "utilize.png",
        "<p>Utiliza un objeto no mágico que requiera una acción para su uso.</p>\n",
      ],
    ];

    /**
     * Build a fresh "Acciones" folder (unique ids each time so the multi-level
     * normalizer never sees colliding ids across renders).
     */
    function buildActionsFolder() {
      const child = ([name, icon, description]) => ({
        id: `n21-action-${uuid()}`,
        name,
        text: "",
        icon: assetUrl(icon),
        description,
        action_type: "none",
        hidden: false,
        order: null,
        source_name: null,
        tooltip_title: name,
        owned: false,
      });

      return {
        id: `n21-action-${uuid()}`,
        name: "Acciones",
        text: "",
        icon: assetUrl("acciones.png"),
        description: null,
        action_type: "folder",
        hidden: false,
        order: null,
        source_name: null,
        tooltip_title: "Acciones",
        owned: false,
        elements: ACTIONS.map(child),
      };
    }

    /**
     * "Iniciativa" action, first item of the bar: the very same roll as
     * "Inic." in the combat tracking panel (so the turn order can read it
     * from the chat). Only on the tabletop, where that roll exists.
     */
    function initiativeAction(charId) {
      const roll = charId ? CombatTrackingManager.getInitiativeRoll("character", charId) : null;
      if (!roll) return null;
      return {
        id: `n21-action-${uuid()}`,
        name: roll.name,
        text: "",
        icon: assetUrl("initiative.png"),
        description: null,
        action_type: "dice_roll",
        hidden: false,
        order: null,
        source_name: null,
        tooltip_title: roll.name,
        owned: false,
        dice_roll: roll.notation,
        roll_options: { roll_name: roll.name },
      };
    }

    /**
     * Resolve the character id owning an action bar from the `element` passed
     * to createBar (a row inside `.action-bar[data-sender-info]`).
     * @returns {string|null}
     */
    function resolveCharacterId(element) {
      try {
        const bar = $(element).closest(".action-bar")[0];
        const senderInfo = bar?.getAttribute("data-sender-info") || "";
        const match = senderInfo.match(/Character-(\d+)/);
        return match ? match[1] : null;
      } catch (_) {
        return null;
      }
    }

    /**
     * Add (idempotently) "Iniciativa" first and the "Acciones" folder at the
     * end of the list, so the order is: [Iniciativa, spells…, native actions,
     * Acciones]. Spells stay at the
     * front (unshifted by the spell-action-bar feature) and our folder is
     * always last.
     */
    function injectInto(items, charId) {
      // Remove our own previously injected folder.
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
      items.push({ ...buildActionsFolder(), n21Key: "n21:actions", [INJECT_TAG]: true });
      const initiative = initiativeAction(charId);
      if (initiative) items.unshift({ ...initiative, n21Key: "n21:initiative", [INJECT_TAG]: true });
    }

    // Run after spell-action-bar (priority 50) so spells are already in place,
    // and before multi-level (priority 100) so the folder gets normalized.
    // List the folder in the action bar editor.
    window._n21_.actionBarLayout?.registerProvider("initiative", {
      order: 5,
      getEntries: async () => (!featureEnabled ? [] : [
        { key: "n21:initiative", label: "Iniciativa", icon: assetUrl("initiative.png") },
      ]),
    });
    window._n21_.actionBarLayout?.registerProvider("actions", {
      order: 20,
      getEntries: async () => (!featureEnabled ? [] : [
        { key: "n21:actions", label: "Acciones", icon: assetUrl("acciones.png") },
      ]),
    });

    function stripOwnItems(items) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
    }

    SettingsManager.onChange(() => {
      const next = !!SettingsManager.get("feature.actions-bar.enabled");
      if (next === featureEnabled) return;
      featureEnabled = next;
      ActionBarManager.rerenderCharacterBars();
    });

    ActionBarManager.onCreateBar(
      "actions-bar",
      (element, items, parentItem = null) => {
        if (!featureEnabled) {
          if (parentItem === null && Array.isArray(items)) stripOwnItems(items);
          return;
        }
        // Only augment the root render of a character bar.
        if (parentItem !== null) return;
        if (!Array.isArray(items)) return;
        const charId = resolveCharacterId(element);
        if (!charId) return; // not a character bar

        injectInto(items, charId);
        return;
      },
      { priority: 60 },
    );
  } catch (error) {
    window._n21_.utils?.registerFeatureError?.("actions-bar", error);
  }
})();
