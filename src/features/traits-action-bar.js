(async () => {
  try {
    /* =======================================================================
         Feature: Traits Action Bar

         When a character's action bar is created, fetch that character's sheet
         (once, cached until reload), generate the traits ("rasgos") actions and
         re-create the bar with a single "Rasgos" folder appended at the very
         end of the list.

         The folder groups every trait — class, race and others — each with the
         appropriate icon (class / race / character). Traits are display-only:
         clicking them performs no action and no roll.

         Flow mirrors the spell-action-bar feature:
           1. The bar renders normally right away.
           2. The character sheet is fetched asynchronously (cached per id).
           3. Once ready, if there are traits, the bar is re-created with them.
      ======================================================================= */

    const { loadManagers } = window._n21_;

    const [
      ActionBarManager,
      CharacterSheetManager,
      SettingsManager,
      MarkdownEditorManager,
    ] = await loadManagers(
      "ActionBarManager",
      "CharacterSheetManager",
      "SettingsManager",
      "MarkdownEditorManager",
    );

    if (!SettingsManager.get("feature.traits-action-bar.enabled")) {
      return;
    }

    // charId -> Promise<Array> while in flight, then the resolved Array.
    // Lives for the page lifetime, so each character is fetched only once
    // (until F5).
    const cache = new Map();

    // Marks the folder injected by this feature so re-renders stay idempotent.
    const INJECT_TAG = "__n21Traits";

    const uuid =
      window._n21_?.utils?.uuid || (() => Math.random().toString(36).slice(2));

    /** Assign a unique id to every folder/element (recursively). */
    function assignIds(nodes) {
      for (const node of nodes) {
        node.id = `n21-trait-${uuid()}`;
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

    /** Fetch + generate the traits folder for a character. Never rejects. */
    function fetchTraitFolders(charId) {
      return (async () => {
        const buildTraitActions = window._n21_?.traitActions?.buildTraitActions;
        if (typeof buildTraitActions !== "function") {
          throw new Error("traitActions.buildTraitActions not available");
        }
        const ph = await CharacterSheetManager.fetchCharacter(
          `/characters/${charId}.json`,
        );
        const gameSystem = window._n21_?.traitActions?.resolveGameSystem?.();
        const renderDescription = (md) => MarkdownEditorManager.render(md);
        return assignIds(
          buildTraitActions(ph, { gameSystem, renderDescription }),
        );
      })().catch((error) => {
        window._n21_.utils?.registerFeatureError?.("traits-action-bar", error);
        return []; // cache as "no traits" so we don't refetch / recreate
      });
    }

    /**
     * Append (idempotently) the traits folder at the very end of the list, so
     * the "Rasgos" item is always last.
     */
    function injectInto(items, folders) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
      items.push(
        ...folders.map((folder) => ({ ...folder, [INJECT_TAG]: true })),
      );
    }

    /**
     * Re-trigger the root render of action bars that already exist on the
     * page (same rationale as the spell-action-bar feature: the multi-level
     * observer may render before we register our interceptor).
     */
    function reprocessExistingBars() {
      document.querySelectorAll(".action-bar[data-sender-info]").forEach((bar) => {
        const senderInfo = bar.getAttribute("data-sender-info") || "";
        if (!/Character-\d+/.test(senderInfo)) return;
        const $primary = $(bar).find(".action-bar-row.primary-bar").first();
        if (!$primary.length) return;
        const elements = $(bar).data("elements");
        if (!Array.isArray(elements)) return;
        window.createBar($primary[0], elements, null, 0);
      });
    }

    // Run after spell-action-bar (50) and actions-bar (60) so the traits
    // folder lands after them, and before multi-level (100) so it gets
    // normalized and rendered.
    ActionBarManager.onCreateBar(
      "traits-action-bar",
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
          const promise = fetchTraitFolders(charId);
          cache.set(charId, promise);
          promise.then((folders) => {
            cache.set(charId, folders);
            if (folders.length) {
              window.createBar($(element), items, parentItem, 0);
            }
          });
        }

        // Pending (or just kicked off): render normally now, traits come later.
        return;
      },
      { priority: 70 },
    );

    // Catch the level-0 bar that the multi-level observer may have already
    // rendered before we registered.
    reprocessExistingBars();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Traits Action Bar", error);
  }
})();
