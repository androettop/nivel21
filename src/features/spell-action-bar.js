(async () => {
  try {
    /* =======================================================================
         Feature: Spell Action Bar

         When a character's action bar is created, fetch that character's spell
         book (once, cached until reload), generate the spell actions and
         re-create the bar with them prepended — one folder per spell level.

         Flow:
           1. The bar renders normally right away.
           2. The character sheet is fetched asynchronously (cached per id).
           3. Once ready, if there are spells, the bar is re-created with them.

         Nothing happens for non-character bars or characters without spells.
      ======================================================================= */

    const { loadManagers } = window._n21_;

    const [ActionBarManager, CharacterSheetManager, SettingsManager] =
      await loadManagers(
        "ActionBarManager",
        "CharacterSheetManager",
        "SettingsManager",
      );

    if (!SettingsManager.get("feature.spell-action-bar.enabled")) {
      return;
    }

    // charId -> Promise<Array> while in flight, then the resolved Array.
    // Lives for the page lifetime, so each character is fetched only once
    // (until F5).
    const cache = new Map();

    // Marks folders injected by this feature so re-renders stay idempotent.
    const INJECT_TAG = "__n21Spell";

    const uuid =
      window._n21_?.utils?.uuid || (() => Math.random().toString(36).slice(2));

    /**
     * Assign a unique id to every folder/element (recursively). The generator
     * emits `id: null` (that's intentional for the exportable JSON), but the
     * action bar needs unique ids: the multi-level normalizer tracks items it
     * promotes to folders by id and then filters them out, so several `null`
     * ids collide and whole spell folders get dropped from the render.
     */
    function assignIds(nodes) {
      for (const node of nodes) {
        node.id = `n21-spell-${uuid()}`;
        if (Array.isArray(node.elements)) assignIds(node.elements);
      }
      return nodes;
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

    /** Fetch + generate the spell folders for a character. Never rejects. */
    function fetchSpellFolders(charId) {
      return (async () => {
        const buildSpellActions = window._n21_?.spellActions?.buildSpellActions;
        if (typeof buildSpellActions !== "function") {
          throw new Error("spellActions.buildSpellActions not available");
        }
        // Slug-less URL: nivel20 redirects /characters/{id}.json to the right
        // game/campaign, so this works in every context (tabletop, sheet,
        // any game system) without depending on the current URL or AppContext.
        const ph = await CharacterSheetManager.fetchCharacter(
          `/characters/${charId}.json`,
        );
        return assignIds(buildSpellActions(ph, { includedOnly: true }));
      })().catch((error) => {
        window._n21_.utils?.registerFeatureError?.("spell-action-bar", error);
        return []; // cache as "no spells" so we don't refetch / recreate
      });
    }

    /** Remove any previously injected spell folders from an items array. */
    function stripInjected(items) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
    }

    /** Prepend (idempotently) the spell folders to the start of an items array. */
    function injectInto(items, folders) {
      stripInjected(items);
      // unshift in order so folders keep their sequence (Trucos, Nivel 1, …)
      // and land before the character's existing actions.
      items.unshift(
        ...folders.map((folder) => ({ ...folder, [INJECT_TAG]: true })),
      );
    }

    /**
     * Re-trigger the root render of action bars that already exist on the
     * page. The multi-level feature renders the primary (level-0) bar from its
     * own MutationObserver, which can fire *before* this feature finishes
     * loading and registers its interceptor — so we'd miss that first render.
     * Re-dispatching createBar for existing character bars lets our (now
     * registered) interceptor process them, exactly the same path the
     * multi-level observer uses.
     */
    function reprocessExistingBars() {
      document.querySelectorAll(".action-bar[data-sender-info]").forEach((bar) => {
        const senderInfo = bar.getAttribute("data-sender-info") || "";
        if (!/Character-\d+/.test(senderInfo)) return;
        const $primary = $(bar).find(".action-bar-row.primary-bar").first();
        if (!$primary.length) return;
        const elements = $(bar).data("elements");
        if (!Array.isArray(elements)) return;
        // Same call shape the multi-level panel observer uses.
        window.createBar($primary[0], elements, null, 0);
      });
    }

    // Run before the multi-level action bar (priority 100) so the spells are
    // injected into `items` before multi-level normalizes and renders them.
    // Different interceptor names => both coexist (neither overwrites the
    // other); lower priority => this runs first.
    ActionBarManager.onCreateBar(
      "spell-action-bar",
      (element, items, parentItem = null) => {
        // Only augment the root render of a character bar.
        if (parentItem !== null) return;
        if (!Array.isArray(items)) return;

        const charId = resolveCharacterId(element);
        if (!charId) return; // not a character bar -> leave untouched

        const entry = cache.get(charId);

        // Already resolved: inject synchronously and let rendering continue.
        if (Array.isArray(entry)) {
          if (entry.length) injectInto(items, entry);
          return;
        }

        // Never started: kick off the fetch once and re-create when ready.
        if (entry === undefined) {
          const promise = fetchSpellFolders(charId);
          cache.set(charId, promise);
          promise.then((folders) => {
            cache.set(charId, folders);
            if (folders.length) {
              // Re-create the bar; this pass will find the cache and inject.
              // Wrap in jQuery so the native createBar (multi-level disabled)
              // also accepts it; the multi-level interceptor handles both.
              window.createBar($(element), items, parentItem, 0);
            }
          });
        }

        // Pending (or just kicked off): render normally now, spells come later.
        return;
      },
      { priority: 50 },
    );

    // Catch the level-0 bar that the multi-level observer may have already
    // rendered before we registered.
    reprocessExistingBars();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Spell Action Bar", error);
  }
})();
