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

    // Applies live: when disabled its items are stripped from the bar.
    let featureEnabled = SettingsManager.get("feature.spell-action-bar.enabled");

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
        ...folders.map((folder) => ({
          ...folder,
          n21Key: `n21:spells:${folder.name}`,
          [INJECT_TAG]: true,
        })),
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
    function stripOwnItems(items) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
    }

    SettingsManager.onChange(() => {
      const next = !!SettingsManager.get("feature.spell-action-bar.enabled");
      if (next === featureEnabled) return;
      featureEnabled = next;
      ActionBarManager.rerenderCharacterBars();
    });

    ActionBarManager.onCreateBar(
      "spell-action-bar",
      (element, items, parentItem = null) => {
        if (!featureEnabled) {
          if (parentItem === null && Array.isArray(items)) stripOwnItems(items);
          return;
        }
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

    // List the spell folders in the action bar editor.
    window._n21_.actionBarLayout?.registerProvider("spells", {
      order: 10,
      getEntries: async (charId) => {
        if (!featureEnabled) return [];
        let entry = cache.get(charId);
        if (!entry) {
          entry = fetchSpellFolders(charId);
          cache.set(charId, entry);
        }
        const folders = await entry;
        cache.set(charId, folders);
        return folders.map((f) => ({ key: `n21:spells:${f.name}`, label: f.name, icon: f.icon }));
      },
    });

    /* ----------------------- casting ----------------------- */

    const CONCENTRATION_NAMES = ["concentracion", "concentrado", "concentrada"];

    function readAction(element) {
      try {
        return JSON.parse(element.getAttribute("data-action") || "null");
      } catch (_error) {
        return null;
      }
    }

    /** Give the character the Concentración status (if allowed to edit it). */
    async function startConcentration(charId) {
      // Only on the tabletop, where the combat tracking panel exists.
      const Tracking = window._n21_.managers.CombatTrackingManager;
      const entry = Tracking?.getEntry("character", charId);
      if (!entry?.editable) return;
      if (Tracking.hasCondition(entry, CONCENTRATION_NAMES)) return;
      try {
        const results = await Tracking.searchConditions("concentr");
        const condition = results.find((c) =>
          CONCENTRATION_NAMES.includes(Tracking.normalizeText(c?.name)),
        );
        const fresh = Tracking.getEntry("character", charId);
        if (condition && fresh) Tracking.addCondition(fresh, condition);
      } catch (_error) {}
    }

    /**
     * Spend a spell slot of the spell's level (or a pact slot of that level
     * or higher). Does nothing if none is left or the user can't edit.
     */
    function spendSlot(charId, level) {
      const Tracking = window._n21_.managers.CombatTrackingManager;
      const entry = Tracking?.getEntry("character", charId);
      if (!entry?.editable || !(level > 0)) return;
      const available = (r) => r.used < r.max;
      const slot =
        entry.resources.find(
          (r) => r.category === "spell_slots" && Number(r.id) === level && available(r),
        ) ||
        entry.resources
          .filter((r) => r.category === "pact_spell_slots" && Number(r.id) >= level && available(r))
          .sort((a, b) => Number(a.id) - Number(b.id))[0];
      if (slot) Tracking.setResourceUsed(entry, slot.category, slot.id, slot.used + 1);
    }

    // Capture phase: the bar's own handlers stop propagation.
    document.addEventListener(
      "click",
      (event) => {
        const element = event.target.closest?.(".action-bar-element[data-action]");
        if (!element) return;
        const action = readAction(element);
        if (
          !action ||
          (action.action_type !== "spell_cast" && !action.n21_concentration && !action.n21_consume_slot)
        ) {
          return;
        }

        const charId = resolveCharacterId(element);

        if (action.action_type === "spell_cast") {
          event.preventDefault();
          event.stopPropagation();
          const ChatManager = window._n21_.managers.ChatManager;
          const senderInfo = $(element).closest(".action-bar").attr("data-sender-info");
          const spellName = action.n21_spell_name || action.name;
          const message = `Lanza ${spellName}${action.n21_concentration ? " (concentración)" : ""}`;
          // The spell is cast either way; only the chat notice is optional.
          window._n21_.chatConsent
            ?.confirm("spell-cast", {
              title: "¿Anunciar el conjuro en el chat?",
              description: `Se enviará «${message}».`,
            })
            .then((send) => {
              if (send) ChatManager?.send(message, senderInfo ? { sender_info: senderInfo } : {});
            });
        }

        if (action.n21_consume_slot && charId) spendSlot(charId, Number(action.n21_spell_level));
        if (action.n21_concentration && charId) startConcentration(charId);
      },
      true,
    );

    /* ------------------- spells without slots left ------------------- */

    /** Spell levels (1-9) the character can still cast with a free slot. */
    function availableLevels(entry) {
      const levels = new Set();
      entry.resources.forEach((r) => {
        if (r.used >= r.max) return;
        const level = Number(r.id);
        if (r.category === "spell_slots") levels.add(level);
        // A pact slot can cast any spell of its level or lower.
        if (r.category === "pact_spell_slots") for (let l = 1; l <= level; l += 1) levels.add(l);
      });
      return levels;
    }

    // Purely visual: spells whose level has no slot left look greyed out,
    // but can still be cast.
    function refreshSlotStyles() {
      const Tracking = window._n21_.managers.CombatTrackingManager;
      if (!Tracking) return; // only on the tabletop (combat tracking panel)
      document.querySelectorAll(".action-bar[data-sender-info]").forEach((bar) => {
        const match = (bar.getAttribute("data-sender-info") || "").match(/Character-(\d+)/);
        const entry = match ? Tracking.getEntry("character", match[1]) : null;
        const levels = entry ? availableLevels(entry) : null;
        bar.querySelectorAll(".action-bar-element[data-n21-spell-level]").forEach((el) => {
          const level = Number(el.getAttribute("data-n21-spell-level"));
          const empty = !!levels && level > 0 && !levels.has(level);
          el.classList.toggle("n21-spell-no-slots", empty);
        });
      });
    }

    let slotStyleTimer = null;
    function scheduleSlotStyles() {
      if (slotStyleTimer) return;
      slotStyleTimer = setTimeout(() => {
        slotStyleTimer = null;
        refreshSlotStyles();
      }, 100);
    }

    new MutationObserver((mutations) => {
      const barChanged = mutations.some((m) =>
        [...m.addedNodes].some(
          (n) => n.nodeType === 1 && (n.matches?.(".action-bar-element, [data-folder-depth]") || n.querySelector?.(".action-bar-element")),
        ),
      );
      if (barChanged) scheduleSlotStyles();
    }).observe(document.body, { childList: true, subtree: true });

    window._n21_.loadManagers("CombatTrackingManager", { timeout: 30000 })
      .then(([Tracking]) => Tracking.onChange(scheduleSlotStyles))
      .catch(() => {});

    // Catch the level-0 bar that the multi-level observer may have already
    // rendered before we registered.
    reprocessExistingBars();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Spell Action Bar", error);
  }
})();
