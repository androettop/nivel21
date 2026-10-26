(async () => {
  try {
    /* =======================================================================
         Feature: Tabbed Action Bar (Barra de acciones con pestañas)

         A BG3-style action bar for the tabletop. The native bar keeps being
         built exactly as before — with everything the other features inject
         (spells, standard actions, traits, inventory) and the editor's
         order / hidden items — but it's hidden, never removed. This bar reads
         that final item list and splits it in sections:

           Acciones   Iniciativa, weapons, the character's own actions, the
                      standard actions folder, TS and PH folders
           Conjuros   every spell (hidden when there are none)
           Inventario the inventory items (only from its tab)
           Rasgos     the character's traits (only from its tab)

         One panel: "Todos" shows the sections side by side, split by
         draggable dividers (each section scrolls sideways); a tab shows only
         its section. Opening a folder (a weapon, a spell, a trait group)
         fills the whole panel, with a "back" button. Spells that can be cast
         with a higher slot first ask for the level: the level copies built by
         the spell generator ("Nombre (nivel N)", dice already scaled) are
         shown for each level the character has slots for.

         Right side: advantage / normal / disadvantage toggle for every d20
         rolled from this bar, and +/- to add or remove rows (3 by default
         for characters, 1 for creatures).

         The tiles reuse the native `.action-bar-element[data-action]` markup,
         so the handlers of other features keep working (spending slots,
         concentration, floating panels, opening the inventory).
      ======================================================================= */

    const { loadManagers } = window._n21_;

    const [ActionBarManager, SettingsManager, TooltipManager, DiceManager, CharacterItemsManager, QuickMenuUIManager] =
      await loadManagers(
        "ActionBarManager",
        "SettingsManager",
        "TooltipManager",
        "DiceManager",
        "CharacterItemsManager",
        "QuickMenuUIManager",
      );

    const SETTING = "feature.tabbed-action-bar.enabled";
    let featureEnabled = !!SettingsManager.get(SETTING);

    const TABS = [
      { id: "actions", label: "Acciones" },
      { id: "spells", label: "Conjuros" },
      { id: "inventory", label: "Inventario" },
      { id: "traits", label: "Rasgos" },
    ];
    const MIN_ROWS = 1;
    const MAX_ROWS = 5;
    // Default rows: characters 3, creatures 1.
    const DEFAULT_ROWS = 3;
    const DEFAULT_CREATURE_ROWS = 1;
    const STORAGE_PREFIX = "_n21_tabbed-bar:";
    const CUSTOM_PREFIX = "custom:";
    const CUSTOM_LABEL_MAX = 30;
    // Bar width (desktop), the same for every character.
    const WIDTH_KEY = "_n21_tabbed-bar-width";
    const DEFAULT_WIDTH = 800;
    const MIN_WIDTH = 360;

    function loadWidth() {
      try {
        const width = Number(localStorage.getItem(WIDTH_KEY));
        return width >= MIN_WIDTH ? width : DEFAULT_WIDTH;
      } catch (_error) {
        return DEFAULT_WIDTH;
      }
    }

    // Hidden by the user (a small button brings it back), for every character.
    const HIDDEN_KEY = "_n21_tabbed-bar-hidden";

    function isHidden() {
      try {
        return localStorage.getItem(HIDDEN_KEY) === "1";
      } catch (_error) {
        return false;
      }
    }

    /* Show / hide toggle: an eye in Nivel20's quick menu (right side). */
    const VISIBILITY_TOGGLE_ID = "n21-tabbed-bar-visibility-toggle";
    let unregisterVisibilityToggle = null;

    function setVisible(visible) {
      setHidden(!visible);
      QuickMenuUIManager.refreshToggleState(VISIBILITY_TOGGLE_ID);
      // Only the class changes, so the CSS transition plays.
      current?.$root.toggleClass("is-hidden", !visible);
    }

    function syncVisibilityToggle() {
      if (featureEnabled && !unregisterVisibilityToggle) {
        unregisterVisibilityToggle = QuickMenuUIManager.registerConnectedActionsToggle({
          id: VISIBILITY_TOGGLE_ID,
          groupId: "nivel21",
          groupOrder: 10,
          actionOrder: 40,
          iconClass: "fa fa-th",
          title: "Mostrar/Ocultar la barra de acciones",
          getState: () => !isHidden(),
          onToggle: (visible) => setVisible(!!visible),
        });
      } else if (!featureEnabled && unregisterVisibilityToggle) {
        unregisterVisibilityToggle();
        unregisterVisibilityToggle = null;
      }
    }

    function setHidden(hidden) {
      try {
        if (hidden) localStorage.setItem(HIDDEN_KEY, "1");
        else localStorage.removeItem(HIDDEN_KEY);
      } catch (_error) {}
    }

    function saveWidth(width) {
      try {
        localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
      } catch (_error) {}
    }

    const ROLL_MODES = [
      { id: "advantage", short: "V", title: "Tiradas de d20 con ventaja" },
      { id: "normal", short: "N", title: "Tiradas de d20 normales" },
      { id: "disadvantage", short: "D", title: "Tiradas de d20 con desventaja" },
    ];

    // Outline of a d20 (hexagon with its front triangle).
    const D20_ICON =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 21 7v10l-9 5-9-5V7z"/>' +
      '<path d="M12 7 17 15H7z"/><path d="M12 2v5M21 7l-4 8M3 7l4 8M7 15l-4 2M17 15l4 2M7 15l5 7 5-7"/></svg>';

    const TILE_TOOLTIP_DELAY_MS = 1000;

    // Of the bar shown; remembered per character / creature (layout).
    let rollMode = "normal";

    // The bar currently shown: { charId, senderInfo, tabs, $root, $nativeBar }.
    let current = null;
    // Opened folders / level pickers, reset when the character changes.
    let nav = [];

    const uuid =
      window._n21_?.utils?.uuid || (() => Math.random().toString(36).slice(2));

    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = value == null ? "" : String(value);
      return div.innerHTML;
    }

    function assetUrl(path) {
      const base = document.documentElement?.dataset?.n21BaseUrl || "";
      return `${base}src/assets/${path}`;
    }

    function normalizeName(name) {
      return String(name || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();
    }

    /* ----------------------- persisted layout ----------------------- */

    /** Layout of a bar: `key` is the character id or "creature:<sender>". */
    function loadLayout(key) {
      const defaultRows = String(key).startsWith("creature:") ? DEFAULT_CREATURE_ROWS : DEFAULT_ROWS;
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || "null");
        return {
          rows: Math.min(Math.max(Number(data?.rows) || defaultRows, MIN_ROWS), MAX_ROWS),
          // The only tab shown (clicked in the strip), or null for all.
          solo: typeof data?.solo === "string" ? data.solo : null,
          // Section widths in px, set by dragging the dividers.
          widths: data?.widths && typeof data.widths === "object" ? data.widths : {},
          // Locked: items can't be moved and empty slots are hidden.
          locked: data?.locked !== false,
          // Item keys per section, with null for empty slots.
          slots: data?.slots && typeof data.slots === "object" ? data.slots : {},
          // Sections made by the user, after the built-in ones: [{id, label}].
          custom: (Array.isArray(data?.custom) ? data.custom : []).filter(
            (section) => typeof section?.id === "string" && section.id.startsWith(CUSTOM_PREFIX),
          ),
          // Tab ids in the order the user dragged them to.
          order: (Array.isArray(data?.order) ? data.order : []).filter((id) => typeof id === "string"),
          // d20 roll mode: advantage, normal or disadvantage.
          rollMode: ROLL_MODES.some((mode) => mode.id === data?.rollMode) ? data.rollMode : "normal",
          // Sections left out of «Todos» (shown only from their tab).
          hidden: (Array.isArray(data?.hidden) ? data.hidden : []).filter((id) => typeof id === "string"),
        };
      } catch (_error) {
        return { rows: defaultRows, solo: null, widths: {}, locked: true, slots: {}, custom: [], order: [], hidden: [], rollMode: "normal" };
      }
    }

    function saveLayout(key, layout) {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(layout));
      } catch (_error) {}
    }

    /* ----------------------- items -> tabs ----------------------- */

    /**
     * Nest "A > B" names into folders, like the multi-level bar does: a
     * `none` item with the folder's name (a spell header) becomes the folder
     * and keeps its icon, description and spell data.
     */
    function nest(items) {
      const level = [];
      const findFolder = (name) =>
        level.find((node) => node.name === name && node.action_type === "folder");

      const folderFor = (name, sample) => {
        let folder = findFolder(name);
        if (folder) return folder;
        const index = level.findIndex((node) => node.name === name && node.action_type === "none");
        if (index !== -1) {
          folder = { ...level[index], action_type: "folder", elements: [] };
          level[index] = folder;
          return folder;
        }
        folder = {
          name,
          icon: sample.icon,
          description: null,
          action_type: "folder",
          elements: [],
          n21_spell_id: sample.n21_spell_id,
          n21_spell_level: sample.n21_spell_level,
          n21_spell_base_level: sample.n21_spell_base_level,
          n21_upcastable: sample.n21_upcastable,
          n21_upcast_of: sample.n21_upcast_of,
        };
        level.push(folder);
        return folder;
      };

      for (const item of items || []) {
        if (!item || item.hidden) continue;
        const parts = String(item.name || "").split(" > ");
        if (parts.length > 1) {
          folderFor(parts[0], item).elements.push({
            ...item,
            name: parts.slice(1).join(" > "),
            n21_full_name: item.n21_full_name || item.name,
          });
          continue;
        }
        const existing = findFolder(item.name);
        if (existing && item.action_type === "none") {
          existing.icon = item.icon || existing.icon;
          existing.description = existing.description || item.description;
          continue;
        }
        if (existing && item.action_type === "folder") {
          existing.elements.push(...(item.elements || []));
          continue;
        }
        level.push(item.action_type === "folder" ? { ...item, elements: [...(item.elements || [])] } : item);
      }

      level.forEach((node) => {
        if (node.action_type === "folder") node.elements = nest(node.elements);
      });
      return level;
    }

    const isKey = (item, prefix) => String(item?.n21Key || "").startsWith(prefix);

    /**
     * Split the root items of the bar in tabs. Spell folders keep only the
     * base spells; their "(nivel N)" copies are reached through the level
     * picker.
     */
    function buildTabs(items) {
      const tabs = { actions: [], spells: [], inventory: [], traits: [] };
      const upcasts = [];

      for (const item of items) {
        if (!item || item.hidden) continue;
        const name = normalizeName(item.name);
        if (isKey(item, "n21:spells:")) {
          nest(item.elements).forEach((node) => {
            if (node.n21_upcast_of != null) upcasts.push(node);
            else tabs.spells.push(node);
          });
        } else if (isKey(item, "n21:traits:")) {
          tabs.traits.push(...nest(item.elements));
        } else if (isKey(item, "n21:inventory")) {
          tabs.inventory.push(item);
        } else {
          tabs.actions.push(item);
        }
      }
      tabs.actions = orderActions(nest(tabs.actions));

      // Level copies of each upcastable spell, by base spell id.
      const copies = new Map();
      upcasts.forEach((node) => {
        const key = node.n21_upcast_of;
        if (!copies.has(key)) copies.set(key, []);
        copies.get(key).push(node);
      });
      tabs.spells.forEach((node) => {
        const list = copies.get(node.n21_spell_id ?? node.name);
        if (node.n21_upcastable && list?.length) {
          node.n21_levels = [node, ...list].sort((a, b) => a.n21_spell_level - b.n21_spell_level);
        }
      });
      return tabs;
    }

    const hasAttack = (node) =>
      (node.elements || []).some(
        (el) => el.roll_options?.roll_type === "attack" || (el.action_type === "folder" && hasAttack(el)),
      );

    /**
     * "Acciones" tab: Iniciativa, every weapon (anything with an attack
     * roll), the character's own actions, the standard actions folder and
     * the saving throws / skill checks folders.
     */
    function orderActions(nodes) {
      const groups = { initiative: [], weapons: [], own: [], standard: [], saves: [], checks: [] };
      nodes.forEach((node) => {
        const name = normalizeName(node.name);
        if (isKey(node, "n21:initiative")) groups.initiative.push(node);
        else if (isKey(node, "n21:actions")) groups.standard.push(node);
        else if (node.action_type === "folder" && name.startsWith("tiradas de salvacion")) groups.saves.push(node);
        else if (node.action_type === "folder" && name.startsWith("pruebas de habilidad")) groups.checks.push(node);
        else if (node.action_type === "folder" && hasAttack(node)) groups.weapons.push(node);
        else groups.own.push(node);
      });
      return [
        ...groups.initiative,
        ...groups.weapons,
        ...groups.own,
        ...groups.standard,
        ...groups.saves,
        ...groups.checks,
      ];
    }

    /**
     * Tabs with something to show. `sections` are the arranged sections; a
     * tab the character has items for stays visible even if they were all
     * moved elsewhere (so they can be dragged back).
     */
    function visibleTabs(sections) {
      const tabs = [
        ...TABS.filter((tab) => sections[tab.id]?.some(Boolean) || current?.tabs?.[tab.id]?.length),
        // The user's own sections always show (even empty, to drop into).
        ...(current?.custom || []),
      ];
      // In the user's order; tabs not ordered yet keep their place after.
      const order = current?.order || [];
      const rank = (tab, index) => {
        const at = order.indexOf(tab.id);
        return at === -1 ? order.length + index : at;
      };
      return tabs
        .map((tab, index) => ({ tab, rank: rank(tab, index) }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ tab }) => tab);
    }

    const isCustom = (tabId) => String(tabId).startsWith(CUSTOM_PREFIX);

    /** Arrangeable sections: the built-in ones and the user's own. */
    function slotTabs() {
      return [...SLOT_TABS, ...(current?.custom || []).map((section) => section.id)];
    }

    /* ----------------------- arrangement ----------------------- */

    // Sections whose items can be rearranged. Inventory items only move
    // inside the inventory (they do nothing elsewhere).
    const SLOT_TABS = ["actions", "spells", "inventory", "traits"];

    const COPY_PREFIX = "copy:";

    /** Stable key of a root item, to remember where the user put it. */
    function nodeKey(node) {
      if (node.n21_item_key) return node.n21_item_key;
      if (node.n21_spell_id != null) return `spell:${node.n21_spell_id}`;
      if (node.n21Key) return node.n21Key;
      const id = node.id == null ? "" : String(node.id);
      if (id && !id.startsWith("n21-")) return `id:${id}`;
      return `name:${node.n21_full_name || node.name}`;
    }

    /**
     * Each section as an array of items with null for empty slots: first the
     * saved arrangement (items that no longer exist become empty), then the
     * items not placed yet, at the end of their own section.
     */
    function arrangeSections(tabs, layout) {
      const natural = (tab) => (tab === "inventory" ? inventoryNodes() : tabs[tab] || []);
      const sectionIds = slotTabs();
      const byKey = new Map();
      SLOT_TABS.forEach((tab) =>
        natural(tab).forEach((node) => {
          const key = nodeKey(node);
          if (!byKey.has(key)) byKey.set(key, node);
        }),
      );
      // Inventory items placed in other sections: another view of the same
      // item (it stays in the inventory too).
      inventoryNodes().forEach((node) => {
        const key = COPY_PREFIX + nodeKey(node);
        byKey.set(key, { ...node, n21_item_key: key, n21_inventory_copy: true });
      });
      const placed = new Set();
      const sections = {};
      sectionIds.forEach((tab) => {
        const list = (layout.slots[tab] || []).map((key) => {
          if (!key || placed.has(key) || !byKey.has(key)) return null;
          placed.add(key);
          return byKey.get(key);
        });
        while (list.length && !list[list.length - 1]) list.pop();
        sections[tab] = list;
      });
      SLOT_TABS.forEach((tab) =>
        natural(tab).forEach((node) => {
          const key = nodeKey(node);
          if (placed.has(key)) return;
          placed.add(key);
          sections[tab].push(node);
        }),
      );
      return sections;
    }

    /* ----------------------- slots ----------------------- */

    /** Remaining / total slots of a spell level, or null off the tabletop. */
    function slotInfo(charId, level) {
      const Tracking = window._n21_.managers.CombatTrackingManager;
      const entry = Tracking?.getEntry?.("character", charId);
      if (!entry) return null;
      let left = 0;
      let total = 0;
      entry.resources.forEach((r) => {
        if (Number(r.id) !== level) return;
        if (r.category !== "spell_slots" && r.category !== "pact_spell_slots") return;
        left += Math.max(r.max - r.used, 0);
        total += r.max;
      });
      return total ? { left, total } : null;
    }

    /* ----------------------- rolling ----------------------- */

    // Only d20 rolls (attacks, checks, saves, initiative) take the mode.
    function applyRollMode(notation) {
      if (rollMode === "normal" || typeof notation !== "string") return notation;
      if (!/^\s*1d20(?!\d)/i.test(notation)) return notation;
      const fn = rollMode === "advantage" ? "MAX" : "MIN";
      return notation.replace(/^\s*1d20/i, `${fn}(1d20, 1d20)`);
    }

    function rollNode(node) {
      const options = { ...(node.roll_options || {}) };
      options.roll_name = options.roll_name || node.n21_full_name || node.name;
      options.sender_info = options.sender_info || current?.senderInfo;
      options.icon = options.icon || node.icon;
      DiceManager.rollAction(applyRollMode(node.dice_roll), options);
    }

    // Attack variants are covered by the roll mode toggle.
    function isAttackVariant(node) {
      return (
        node?.action_type === "dice_roll" &&
        node.roll_options?.roll_type === "attack" &&
        /^\s*(MAX|MIN)\s*\(/i.test(node.dice_roll || "")
      );
    }

    /* ----------------------- rendering ----------------------- */

    function tooltipHtml(node, extra = "") {
      let html = `<h5>${escapeHtml(node.tooltip_title || node.name)}</h5>`;
      if (node.description) html += node.description;
      if (node.action_type === "dice_roll" && node.dice_roll) {
        // The base roll: advantage / disadvantage is applied when rolling.
        html += `<p><strong>Lanzar ${escapeHtml(node.dice_roll)}</strong></p>`;
      }
      return html + extra;
    }

    /**
     * A tile with the native action bar markup. `action` = the item stored in
     * data-action (so other features' handlers react); null for tiles that
     * only navigate.
     */
    function makeTile({ name, text, icon, title, action, kind, badge, badgeKind, dim }) {
      const $tile = $("<div>")
        .addClass("action-bar-element n21-tbar-tile")
        .attr("data-n21-kind", kind || "action")
        .toggleClass("n21-tbar-tile--dim", !!dim);
      if (action) {
        $tile.attr("data-action-type", action.action_type).attr("data-action", JSON.stringify(action));
        if (Number.isFinite(action.n21_spell_level)) {
          $tile.attr("data-n21-spell-level", action.n21_spell_level);
        }
      }
      const imageStyle = icon ? `background: url('${encodeURI(icon)}') no-repeat;` : "";
      $tile.html(`
        <div class="action-bar-button" data-toggle="tooltip">
          <div class="action-bar-bg"></div>
          <div class="action-bar-image" style="${imageStyle}"></div>
          <div class="action-bar-hover"></div>
          <div class="action-bar-text">
            ${
              // Like the native bar: a short text ("PH", "TS") replaces the name.
              text
                ? `<span class="action-bar-short-name">${escapeHtml(text)}</span>`
                : `<span class="action-bar-name">${escapeHtml(name)}</span>`
            }
          </div>
          <div class="action-bar-frame"></div>
          ${
            badgeKind === "cantrip"
              ? '<span class="n21-tbar-badge n21-tbar-badge--cantrip" aria-label="Truco"><i></i></span>'
              : badge
                ? `<span class="n21-tbar-badge${badgeKind === "roman" ? " n21-tbar-badge--roman" : ""}">${escapeHtml(badge)}</span>`
                : ""
          }
        </div>
      `);
      const $button = $tile.find(".action-bar-button");
      $button.attr("title", title || `<h5>${escapeHtml(name)}</h5>`);
      TooltipManager.process($button[0]);
      return $tile;
    }

    const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

    /** Tile for an item of the bar (action, roll, folder or spell). */
    function nodeTile(node, panelIndex, path) {
      const navigates =
        node.action_type === "folder" || (node.n21_levels && node.n21_levels.length > 1);
      const isSpell = node.n21_spell_id != null || Number.isFinite(node.n21_spell_base_level);
      const $tile = makeTile({
        name: node.name,
        text: node.text,
        icon: node.icon,
        title: tooltipHtml(
          node,
          node.n21_levels ? "<p><strong>Click para elegir el nivel</strong></p>" : "",
        ),
        // Folders and level pickers only navigate: no data-action, so the
        // spell handler doesn't cast them.
        action: navigates ? null : stripNav(node),
        kind: navigates ? "open" : "action",
        // Spell level like the slots in the character frame: an empty
        // square for cantrips, a roman numeral otherwise.
        badge: isSpell && path === "spells" ? ROMAN[node.n21_spell_level | 0] : null,
        badgeKind: isSpell && path === "spells" ? ((node.n21_spell_level | 0) === 0 ? "cantrip" : "roman") : null,
      });
      $tile.data("n21Node", node).attr("data-n21-panel", panelIndex);
      // Greyed out by the spell action bar when no slot is left: of its level,
      // or of its level or higher when it opens the level picker.
      if (Number.isFinite(node.n21_spell_level)) {
        $tile.attr("data-n21-spell-level", node.n21_spell_level);
        if (node.n21_levels && node.n21_levels.length > 1) $tile.attr("data-n21-spell-upcast", "");
      }
      return $tile;
    }

    /** The item as stored in data-action, without our navigation data. */
    function stripNav(node) {
      const { n21_levels, elements, ...rest } = node;
      return rest;
    }

    function levelTile(option, panelIndex) {
      const level = option.n21_spell_level | 0;
      const slots = current ? slotInfo(current.charId, level) : null;
      const title =
        `<h5>${escapeHtml(option.name)}</h5>` +
        (slots ? `<p>Espacios de nivel ${level}: ${slots.left}/${slots.total}</p>` : "");
      // Just the level icon: the slots left are in the tooltip, and a level
      // without any is greyed out.
      const $tile = makeTile({
        name: "",
        icon: assetUrl(`spell-levels/lvl${Math.min(Math.max(level, 0), 9)}.png`),
        title,
        kind: "level",
        dim: slots && slots.left === 0,
      });
      $tile.data("n21Node", option).attr("data-n21-panel", panelIndex);
      return $tile;
    }

    /** What the bar shows right now: the tabs, a folder or a level picker. */
    function currentView() {
      const top = nav[nav.length - 1];
      if (!top) return { kind: "tabs" };
      return { kind: top.kind, node: top.node };
    }

    function scalingNote(nodes) {
      const all = [];
      const walk = (list) =>
        list.forEach((n) => {
          all.push(n);
          if (n.elements) walk(n.elements);
        });
      walk(nodes);
      if (all.some((n) => n.n21_scaled)) {
        return "Dados calculados por Nivel21";
      }
      if (all.some((n) => n.n21_scaling_failed)) {
        return "Nivel21 no pudo calcular los dados de este nivel";
      }
      return null;
    }

    function isMobile() {
      const width = current?.$root?.parent().width() || window.innerWidth;
      return width < 720;
    }

    // Start as narrow as possible (one column, at the right) until their
    // divider is dragged.
    const NARROW_TABS = ["inventory", "traits"];

    /** Tabs shown: all of them side by side, or only the clicked one. */
    function shownTabs(layout) {
      const ids = visibleTabs(current.sections).map((t) => t.id);
      if (ids.includes(layout.solo)) return [layout.solo];
      // Hidden sections are left out of «Todos» (all of them hidden: show them).
      const shown = ids.filter((id) => !layout.hidden.includes(id));
      return shown.length ? shown : ids;
    }

    function renderTabStrip(layout) {
      const $tabs = $("<div>").addClass("n21-tbar-tablist").attr("role", "tablist");
      const ids = visibleTabs(current.sections).map((t) => t.id);
      const solo = ids.includes(layout.solo) ? layout.solo : null;
      [{ id: "", label: "Todos", title: "Ver todas las secciones" }, ...visibleTabs(current.sections)].forEach((tab) => {
        const on = (tab.id || null) === solo;
        $("<button type='button'>")
          .addClass("n21-tbar-tab")
          .toggleClass("is-active", on)
          .attr({
            role: "tab",
            "aria-selected": on,
            title: !tab.id
              ? tab.title
              : `Ver solo ${tab.title || tab.label}${layout.hidden.includes(tab.id) ? " (oculta en «Todos»)" : ""}. ` +
                "Arrástrala para reordenar; click derecho para más opciones",
          })
          .attr("draggable", tab.id ? "true" : null)
          .toggleClass("n21-tbar-tab--custom", isCustom(tab.id))
          .toggleClass("n21-tbar-tab--hidden", layout.hidden.includes(tab.id))
          .attr("data-n21-tab", tab.id)
          .text(tab.label)
          .appendTo($tabs);
      });
      return $("<div>").addClass("n21-tbar-tabs").append($tabs);
    }

    // Sections have no side padding (the grid has it), so they can collapse
    // to 0 and their width works as flex-grow.
    const contentWidth = (section) => section.getBoundingClientRect().width;

    /** Default width: enough columns for every tile at the current rows. */
    function defaultWidth(tabId, rows) {
      const count = (current.sections[tabId] || []).length;
      const tile = isMobile() ? 46 : 54;
      const columns = NARROW_TABS.includes(tabId) ? 1 : Math.max(Math.ceil(count / rows), 1);
      return columns * (tile + 4) - 4 + 12;
    }

    function renderSection(tabId, layout, alone) {
      const nodes = current.sections[tabId] || [];
      const $section = $("<div>").addClass("n21-tbar-section").attr("data-n21-section", tabId);
      // Widths work as proportions, so the sections always fill the bar.
      if (!alone) {
        const saved = layout.widths[tabId];
        // The user's sections start collapsed: a divider opens them.
        const width = Number.isFinite(saved) ? saved : isCustom(tabId) ? 0 : defaultWidth(tabId, layout.rows);
        // Narrow sections keep their one column (don't take a share of the
        // extra width) until a divider is dragged.
        const fixed = !Number.isFinite(saved) && NARROW_TABS.includes(tabId);
        $section
          .css("flex", fixed ? `0 0 ${width}px` : `${width} 1 0px`)
          .toggleClass("is-collapsed", width < 1);
      }
      const $grid = $("<div>").addClass("n21-tbar-grid");
      renderSlots($grid, tabId, nodes, layout);
      $section.append($grid);
      if (isCustom(tabId) && layout.locked && !nodes.some(Boolean)) {
        $("<div>")
          .addClass("n21-tbar-empty")
          .text("Desbloquea la barra (candado) y arrastra acciones aquí.")
          .appendTo($section);
      }
      return $section;
    }

    /**
     * Items and empty slots of an arrangeable section. Unlocked: the items
     * can be dragged and there's a free column at the end to drop into.
     * Locked: empty slots keep their place but are hidden.
     */
    function renderSlots($grid, tabId, nodes, layout) {
      // Unlocked, the empty slots up to the visible width are added once laid
      // out (fillEmptySlots).
      nodes.forEach((node, index) => {
        const $slot = !node
          ? emptySlot(tabId, index)
          : node.n21_inventory_item
            ? itemCell(node)
            : nodeTile(node, 0, tabId);
        $slot.attr({ "data-n21-slot": index, "data-n21-slot-section": tabId });
        if (node) {
          $slot.attr("data-n21-key", nodeKey(node));
          if (!layout.locked) $slot.attr("draggable", "true");
        }
        $grid.append($slot);
      });
    }

    function emptySlot(tabId, index) {
      return $("<div>")
        .addClass("n21-tbar-slot")
        .attr({ "data-n21-slot": index, "data-n21-slot-section": tabId });
    }

    /**
     * Unlocked: fill every arrangeable section with empty slots up to the
     * columns it shows on screen, plus one more column.
     */
    function fillEmptySlots() {
      if (!current?.$root?.hasClass("is-unlocked")) return;
      const rows = loadLayout(current.layoutKey).rows;
      current.$root.find(".n21-tbar-section[data-n21-section]").each(function () {
        const tabId = this.getAttribute("data-n21-section");
        if (!slotTabs().includes(tabId)) return;
        const grid = this.querySelector(".n21-tbar-grid");
        if (!grid) return;
        const style = getComputedStyle(grid);
        const tile = parseFloat(style.gridAutoColumns) || 54;
        const gap = parseFloat(style.columnGap) || 4;
        const visible = Math.max(Math.floor((this.clientWidth - 12 + gap) / (tile + gap)), 0);
        const slots = [...grid.querySelectorAll("[data-n21-slot]")];
        // Columns used by items (up to the last one), not by earlier fillers.
        let used = 0;
        slots.forEach((slot, index) => {
          if (slot.hasAttribute("data-n21-key")) used = index + 1;
        });
        const total = (Math.max(Math.ceil(used / rows), visible) + 1) * rows;
        for (let index = slots.length; index < total; index += 1) {
          grid.appendChild(emptySlot(tabId, index)[0]);
        }
        // Shrunk: drop the trailing empty slots that no longer fit.
        for (let index = slots.length - 1; index >= total && index >= used; index -= 1) {
          slots[index].remove();
        }
      });
    }

    function renderFolder(view) {
      const node = view.node;
      const isLevels = view.kind === "levels";
      // A single-action spell shows itself (as the action, not the picker).
      const children = isLevels
        ? []
        : (node.elements || [{ ...node, n21_levels: null }]).filter((n) => !isAttackVariant(n));
      const note = isLevels ? null : scalingNote(children);

      const $head = $("<div>").addClass("n21-tbar-head");
      $("<button type='button'>")
        .addClass("n21-tbar-back")
        .attr("title", "Volver")
        .html('<i class="fa fa-chevron-left" aria-hidden="true"></i><span>Volver</span>')
        .appendTo($head);

      // Title (and the scaled dice note) right above the rolls / levels,
      // which go side by side, centered in the whole bar.
      const $title = $("<div>")
        .addClass("n21-tbar-title")
        .text(isLevels ? `${node.name}: elige el nivel` : node.name);
      const $note = note
        ? $("<div>")
            .addClass("n21-tbar-note")
            .attr("title", "Calculado a partir de la descripción del conjuro: revisa que sea correcto.")
            .text(note)
        : null;
      const $grid = $("<div>").addClass("n21-tbar-row");
      if (isLevels) {
        node.n21_levels.forEach((option) => $grid.append(levelTile(option, 0)));
      } else {
        children.forEach((child) => $grid.append(nodeTile(child, 0, "folder")));
      }
      const $section = $("<div>")
        .addClass("n21-tbar-section n21-tbar-section--focus")
        .append($title, $note, $grid);
      return [$head, $("<div>").addClass("n21-tbar-sections").append($section)];
    }

    /* Inventory: only the items, loaded once per character (the bar
       re-renders when they arrive). The tab shows while the inventory feature
       adds its bar item. */
    const inventoryCache = new Map();

    /** Inventory items as arrangeable nodes (empty until loaded). */
    function inventoryNodes() {
      if (!current?.tabs?.inventory?.length || !window._n21_.inventoryPanel) return [];
      const charId = current.charId;
      const entry = inventoryCache.get(charId);
      if (Array.isArray(entry)) {
        const seen = new Map();
        return entry.map((item, index) => {
          let key = item.itemId ? `item:${item.itemId}` : `item-name:${item.name}`;
          // Unnamed duplicates: number them in order.
          const n = (seen.get(key) || 0) + 1;
          seen.set(key, n);
          if (n > 1) key += `#${n}`;
          return { name: item.name, n21_inventory_item: item, n21_inventory_index: index, n21_item_key: key };
        });
      }
      if (!entry) {
        inventoryCache.set(
          charId,
          CharacterItemsManager.getItems(charId)
            .catch(() => [])
            .then((items) => {
              inventoryCache.set(charId, items || []);
              if (current?.charId === charId) render();
            }),
        );
      }
      return [];
    }

    /** A read-only inventory item, with the inventory panel's own markup. */
    function itemCell(node) {
      return window._n21_.inventoryPanel
        .buildItemCell(node.n21_inventory_item, node.n21_inventory_index)
        .removeAttr("draggable")
        .addClass("n21-tbar-tile");
    }

    /** d20 roll mode (V / N / D), in the bottom strip. */
    function renderModes() {
      const $modes = $("<div>").addClass("n21-tbar-modes").attr({ role: "radiogroup", "aria-label": "Tiradas" });
      $("<span>").addClass("n21-tbar-d20").attr("title", "Tiradas de d20").html(D20_ICON).appendTo($modes);
      ROLL_MODES.forEach((mode) => {
        $("<button type='button'>")
          .addClass(`n21-tbar-mode n21-tbar-mode--${mode.id}`)
          .toggleClass("is-active", rollMode === mode.id)
          .attr({ role: "radio", "aria-checked": rollMode === mode.id, title: mode.title, "aria-label": mode.title })
          .attr("data-n21-mode", mode.id)
          .text(mode.short)
          .appendTo($modes);
      });
      return $modes;
    }

    /** Rows +/-, lock and options, at the right of the bar. */
    function renderControls(layout) {
      const $controls = $("<div>").addClass("n21-tbar-controls");
      const $rows = $("<div>").addClass("n21-tbar-rows").attr({ role: "group", "aria-label": "Filas" });
      $("<button type='button'>")
        .addClass("n21-tbar-row-btn")
        .attr({ "data-n21-rows": "-1", title: "Quitar fila" })
        .prop("disabled", layout.rows <= MIN_ROWS)
        .text("−")
        .appendTo($rows);
      $("<button type='button'>")
        .addClass("n21-tbar-row-btn")
        .attr({ "data-n21-rows": "1", title: "Añadir fila" })
        .prop("disabled", layout.rows >= MAX_ROWS)
        .text("+")
        .appendTo($rows);
      $("<button type='button'>")
        .addClass("n21-tbar-gear n21-tbar-lock")
        .toggleClass("is-unlocked", !layout.locked)
        .attr({
          "data-n21-lock": "",
          "aria-pressed": String(!layout.locked),
          title: layout.locked ? "Desbloquear para reordenar" : "Bloquear",
        })
        .html(`<i class="fa ${layout.locked ? "fa-lock" : "fa-unlock"}" aria-hidden="true"></i>`)
        .appendTo($controls);
      return $controls.prepend($rows);
    }

    /** Options (gear), at the right of the bottom strip. */
    function renderGear() {
      const $menu = $("<div>").addClass("n21-tbar-menu-wrap");
      $("<button type='button'>")
        .addClass("n21-tbar-gear")
        .attr({ "data-n21-menu": "", title: "Opciones de la barra", "aria-haspopup": "menu", "aria-expanded": "false" })
        .html('<i class="fa fa-cog" aria-hidden="true"></i>')
        .appendTo($menu);
      $("<div>")
        .addClass("n21-tbar-menu")
        .attr({ role: "menu", hidden: "" })
        .append(
          $("<button type='button'>")
            .attr({ role: "menuitem", "data-n21-option": "new-section" })
            .text("Nueva sección"),
          $("<button type='button'>")
            .attr({ role: "menuitem", "data-n21-option": "hide" })
            .text("Ocultar barra"),
          $("<button type='button'>")
            .attr({ role: "menuitem", "data-n21-option": "classic" })
            .text("Volver a la barra clásica"),
        )
        .appendTo($menu);
      return $menu;
    }

    /* ----------------------- custom sections ----------------------- */

    function addCustomSection() {
      const layout = loadLayout(current.layoutKey);
      const id = `${CUSTOM_PREFIX}${uuid()}`;
      layout.custom.push({ id, label: `Sección ${layout.custom.length + 1}` });
      saveLayout(current.layoutKey, layout);
      nav = [];
      render();
      startRename(id);
    }

    function deleteCustomSection(id) {
      const layout = loadLayout(current.layoutKey);
      // Its items go back to their own sections (they're no longer placed).
      layout.custom = layout.custom.filter((s) => s.id !== id);
      delete layout.slots[id];
      delete layout.widths[id];
      layout.order = layout.order.filter((other) => other !== id);
      layout.hidden = layout.hidden.filter((other) => other !== id);
      if (layout.solo === id) layout.solo = null;
      saveLayout(current.layoutKey, layout);
      render();
    }

    /** Edit a section's name right on its tab. */
    function startRename(id) {
      const $tab = current?.$root.find(".n21-tbar-tab").filter((_, el) => el.getAttribute("data-n21-tab") === id);
      if (!$tab.length) return;
      const section = loadLayout(current.layoutKey).custom.find((s) => s.id === id);
      if (!section) return;
      const $input = $("<input type='text'>")
        .addClass("n21-tbar-tab-input")
        .attr({ maxlength: CUSTOM_LABEL_MAX, "aria-label": "Nombre de la sección" })
        .val(section.label);
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        const label = String($input.val() || "").trim().slice(0, CUSTOM_LABEL_MAX);
        if (save && label) {
          const layout = loadLayout(current.layoutKey);
          const target = layout.custom.find((s) => s.id === id);
          if (target) target.label = label;
          saveLayout(current.layoutKey, layout);
        }
        render();
      };
      $input.on("keydown", (event) => {
        // Keep the tabletop shortcuts (token hotkeys, camera) out of it.
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        else if (event.key === "Escape") finish(false);
      });
      $input.on("keyup keypress", (event) => event.stopPropagation());
      $input.on("blur", () => finish(true));
      $tab.replaceWith($input);
      $input.trigger("focus").trigger("select");
    }

    /**
     * The bar never takes room in Nivel20's bottom layout (it's absolute),
     * so the quick menu on the right stays put; it ends where that menu
     * starts so it never covers it.
     */
    function updateRightInset() {
      const container = current?.$root?.parent()[0];
      const quickMenu = document.getElementById("quick-menu");
      if (!container) return;
      let inset = 8;
      if (quickMenu && quickMenu.offsetParent) {
        const right = container.getBoundingClientRect().right;
        inset = Math.max(right - quickMenu.getBoundingClientRect().left, 0) + 8;
      }
      current.$root.css("--n21-tbar-right-inset", `${Math.round(inset)}px`);
    }

    /* Bottom strip. Left: options, (characters) edit the items on the sheet
       and refresh them, and the d20 roll mode. Right: the character's money
       and its editor. */
    const moneyCache = new Map(); // charId -> { currency: amount }
    const editableCache = new Map(); // charId -> Promise<boolean>
    const REFRESH_COOLDOWN_MS = 5000;
    let lastRefresh = 0;
    // Money changes shown right away and saved once the clicks stop.
    const MONEY_SAVE_MS = 800;
    const pendingMoney = new Map(); // charId -> { totals, timer }
    // The money editor stays open (with what was typed) across re-renders.
    let moneyEditor = null; // { charId, amounts: { currency: text } }

    function hasInventory() {
      return !!(window._n21_.inventoryPanel && current?.charId && current.tabs?.inventory?.length);
    }

    function renderFoot() {
      const $left = $("<div>").addClass("n21-tbar-foot-side").append(renderGear());
      const $right = $("<div>").addClass("n21-tbar-foot-side n21-tbar-foot-side--right");
      if (hasInventory()) {
        const charId = current.charId;
        $("<a>")
          .addClass("n21-tbar-gear")
          .attr({
            href: window._n21_.inventoryPanel.editUrl(charId),
            target: "_blank",
            rel: "noopener",
            title: "Editar el equipo en la hoja del personaje",
          })
          .html('<i class="fa fa-pencil" aria-hidden="true"></i>')
          .appendTo($left);
        $("<button type='button'>")
          .addClass("n21-tbar-gear n21-tbar-refresh")
          .attr({ "data-n21-refresh": "", title: "Actualizar inventario" })
          .html('<i class="fa fa-refresh" aria-hidden="true"></i>')
          .appendTo($left);
        renderMoney(charId).appendTo($right);
      }
      $left.append(renderModes());
      return $("<div>").addClass("n21-tbar-foot").append($left, $right);
    }

    function moneyHtml(totals) {
      return (
        window._n21_.inventoryPanel.buildMoneyHtml(totals || {}) ||
        '<span class="n21-tbar-money-empty">Sin dinero</span>'
      );
    }

    function renderMoney(charId) {
      const $wrap = $("<div>").addClass("n21-tbar-money-wrap");
      const $money = $("<div>").addClass("n21-tbar-money").appendTo($wrap);
      if (moneyCache.has(charId)) $money.html(moneyHtml(moneyCache.get(charId)));
      else {
        window._n21_.inventoryPanel
          .getMoney(charId)
          .then((totals) => {
            moneyCache.set(charId, totals);
            if ($money[0].isConnected) $money.html(moneyHtml(totals));
          })
          .catch(() => {});
      }
      if (!editableCache.has(charId)) editableCache.set(charId, CharacterItemsManager.canEdit(charId));
      editableCache.get(charId).then((editable) => {
        if (!editable || !$wrap[0].isConnected) return;
        $("<button type='button'>")
          .addClass("n21-tbar-gear")
          .attr({ "data-n21-money-edit": "", title: "Editar el dinero", "aria-expanded": "false" })
          .html('<i class="fa fa-pencil-square-o" aria-hidden="true"></i>')
          .appendTo($wrap);
        if (moneyEditor?.charId === charId) openMoneyEditor($wrap);
      });
      return $wrap;
    }

    /**
     * Upward popup: the currencies side by side, each with an amount, and a
     * single + / − that applies every amount typed and closes it.
     */
    function openMoneyEditor($wrap) {
      const charId = current.charId;
      if (moneyEditor?.charId !== charId) moneyEditor = { charId, amounts: {} };
      $wrap.find(".n21-tbar-money-pop").remove();
      const $pop = $("<div>").addClass("n21-tbar-money-pop").attr({ role: "dialog", "aria-label": "Editar el dinero" });
      window._n21_.money.CURRENCIES.forEach((currency) => {
        const key = currency.key.toLowerCase();
        const $cell = $("<label>").addClass("n21-tbar-money-cell").attr({ "data-n21-currency": key, title: currency.label });
        $("<span>")
          .addClass("n21-tbar-money-code")
          .append($("<img>").attr({ src: window._n21_.money.iconUrl(currency), alt: "" }), document.createTextNode(currency.short))
          .appendTo($cell);
        $("<input type='number'>")
          .attr({ min: 0, step: 1, inputmode: "numeric", placeholder: "0", "aria-label": `Cantidad de ${currency.label}` })
          .val(moneyEditor.amounts[key] || "")
          .appendTo($cell);
        $pop.append($cell);
      });
      $("<div>")
        .addClass("n21-tbar-money-actions")
        .append(
          $("<button type='button'>").attr({ "data-n21-money-delta": "1", title: "Sumar las cantidades" }).text("+"),
          $("<button type='button'>").attr({ "data-n21-money-delta": "-1", title: "Restar las cantidades" }).text("−"),
        )
        .appendTo($pop);
      $wrap.append($pop);
      $wrap.find("[data-n21-money-edit]").attr("aria-expanded", "true");
      $pop.find(`[data-n21-currency="gp"] input`).trigger("focus"); // Gold changes most
    }

    function closeMoneyEditor() {
      moneyEditor = null;
      $(".n21-tbar-money-pop").remove();
      $("[data-n21-money-edit]").attr("aria-expanded", "false");
    }

    /** Add (or, negative, take) amounts: { currency: delta }. */
    function changeMoney(charId, deltas) {
      const totals = { ...(moneyCache.get(charId) || {}) };
      Object.entries(deltas).forEach(([key, delta]) => {
        totals[key] = Math.max(0, (Number(totals[key]) || 0) + delta);
        if (!totals[key]) delete totals[key];
      });
      moneyCache.set(charId, totals);
      current?.$root.find(".n21-tbar-money").html(moneyHtml(totals));
      const pending = pendingMoney.get(charId) || {};
      clearTimeout(pending.timer);
      pending.totals = totals;
      pending.timer = setTimeout(() => saveMoney(charId), MONEY_SAVE_MS);
      pendingMoney.set(charId, pending);
    }

    async function saveMoney(charId) {
      const pending = pendingMoney.get(charId);
      if (!pending) return;
      const totals = pending.totals;
      let saved = false;
      try {
        saved = await CharacterItemsManager.updateEquipmentText(charId, (text, max) => {
          const updated = window._n21_.money.setInText(text, totals);
          // Never drop the player's text: skip if the field can't hold it.
          return max && updated.length > max ? null : updated;
        });
      } catch (_error) {}
      if (pendingMoney.get(charId)?.totals === totals) pendingMoney.delete(charId);
      if (!saved) {
        window.alert("No se pudo guardar el dinero (¿falta espacio en «Otras posesiones»?).");
        moneyCache.delete(charId);
        if (current?.charId === charId) render();
      }
    }

    function render() {
      if (!current) return;
      updateRightInset();
      const { $root, layoutKey } = current;
      const layout = loadLayout(layoutKey);
      const view = currentView();
      current.custom = layout.custom;
      rollMode = layout.rollMode;
      current.order = layout.order;
      current.sections = arrangeSections(current.tabs, layout);
      $root.toggleClass("is-unlocked", !layout.locked);
      // Hidden (the eye in Nivel20's quick menu): still rendered, so showing
      // it again can slide it in.
      $root.toggleClass("is-hidden", isHidden());

      const $panel = $("<div>").addClass("n21-tbar-panel");
      const $main = $("<div>").addClass("n21-tbar-main");
      if (view.kind === "tabs") {
        const shown = shownTabs(layout);
        // Saved widths that add up to nothing would leave every section
        // empty: use the defaults instead.
        if (!shown.some((tabId) => layout.widths[tabId] > 0)) layout.widths = {};
        const $sections = $("<div>").addClass("n21-tbar-sections");
        shown.forEach((tabId, i) => {
          if (i > 0) {
            $("<div>")
              .addClass("n21-tbar-divider")
              .attr({ role: "separator", "aria-orientation": "vertical", title: "Arrastra para cambiar el ancho" })
              .appendTo($sections);
          }
          $sections.append(renderSection(tabId, layout, shown.length === 1));
        });
        $main.append(renderTabStrip(layout), $sections);
      } else {
        $main.append(...renderFolder(view));
      }
      // Bottom strip: inventory info and options.
      $main.append(renderFoot());
      // Rows and lock in a column at the right.
      $panel.append(
        $main,
        $("<div>").addClass("n21-tbar-side").append(renderControls(layout)),
      );

      $root.css("--n21-tbar-rows", layout.rows).attr("data-sender-info", current.senderInfo);
      const $inner = $("<div>")
        .addClass("n21-tbar-inner")
        .css("width", `${loadWidth()}px`)
        .append($panel);
      ["left", "right"].forEach((side) => {
        $("<div>")
          .addClass(`n21-tbar-resize n21-tbar-resize--${side}`)
          .attr({ "data-n21-resize": side, title: "Arrastra para cambiar el ancho de la barra" })
          .appendTo($inner);
      });
      $root.empty().append($inner);
      fillEmptySlots();
      // Item tooltips only after resting on them a moment.
      TooltipManager.setDelay($root[0].querySelectorAll(".n21-tbar-tile .tooltipstered, .n21-tbar-tile.tooltipstered"), TILE_TOOLTIP_DELAY_MS);
      // Grey out spells without slots now, not after the spell bar's
      // debounced observer (they'd flash in colour).
      window._n21_.spellSlotStyles?.refresh?.();
    }

    /* ----------------------- section menu ----------------------- */

    function closeTabMenu() {
      $(".n21-tbar-tabmenu").remove();
    }

    /** Right click on a tab: rename / delete (user's sections), hide. */
    function openTabMenu(id, x, y) {
      closeTabMenu();
      const layout = loadLayout(current.layoutKey);
      const hidden = layout.hidden.includes(id);
      const options = [];
      if (isCustom(id)) options.push({ label: "Renombrar", run: () => startRename(id) });
      options.push({
        label: hidden ? "Mostrar en «Todos»" : "Ocultar en «Todos»",
        run: () => {
          const next = loadLayout(current.layoutKey);
          next.hidden = hidden ? next.hidden.filter((other) => other !== id) : [...next.hidden, id];
          saveLayout(current.layoutKey, next);
          render();
        },
      });
      // Its actions go back to their place, so nothing is lost.
      if (isCustom(id)) options.push({ label: "Eliminar", run: () => deleteCustomSection(id) });
      const $menu = $("<div>").addClass("n21-tbar-menu n21-tbar-tabmenu").attr("role", "menu");
      options.forEach((option) => {
        $("<button type='button'>")
          .attr("role", "menuitem")
          .text(option.label)
          .on("click", (event) => {
            event.stopPropagation();
            closeTabMenu();
            option.run();
          })
          .appendTo($menu);
      });
      current.$root.append($menu);
      const width = $menu.outerWidth();
      const height = $menu.outerHeight();
      $menu.css({
        left: Math.max(Math.min(x, window.innerWidth - width - 8), 8),
        top: Math.max(y - height - 4, 8),
      });
    }

    $(document).on("mousedown", (event) => {
      if (!$(event.target).closest(".n21-tbar-tabmenu").length) closeTabMenu();
      if (moneyEditor && !$(event.target).closest(".n21-tbar-money-wrap").length) closeMoneyEditor();
    });
    $(document).on("keydown", (event) => {
      if (event.key === "Escape") closeTabMenu();
    });

    /* ----------------------- interaction ----------------------- */

    function bindRoot($root) {
      $root.on("click", ".n21-tbar-tab", function () {
        const tab = this.getAttribute("data-n21-tab");
        const layout = loadLayout(current.layoutKey);
        layout.solo = tab || null;
        saveLayout(current.layoutKey, layout);
        render();
      });

      $root.on("contextmenu", ".n21-tbar-tab[data-n21-tab]", function (event) {
        const id = this.getAttribute("data-n21-tab");
        if (!id) return;
        event.preventDefault();
        event.stopPropagation();
        openTabMenu(id, event.clientX, event.clientY);
      });

      /* Tabs are dragged to reorder the sections. */
      let tabDrag = null;
      const clearTabDrop = () => $root.find(".is-drop-before, .is-drop-after").removeClass("is-drop-before is-drop-after");
      const dropSide = (el, event) => {
        const rect = el.getBoundingClientRect();
        return event.originalEvent.clientX < rect.left + rect.width / 2 ? "before" : "after";
      };

      $root.on("dragstart", ".n21-tbar-tab[draggable='true']", function (event) {
        tabDrag = this.getAttribute("data-n21-tab");
        const transfer = event.originalEvent.dataTransfer;
        transfer.effectAllowed = "move";
        transfer.setData("text/plain", tabDrag);
        this.classList.add("is-dragging");
      });

      $root.on("dragend", ".n21-tbar-tab", function () {
        this.classList.remove("is-dragging");
        tabDrag = null;
        clearTabDrop();
      });

      $root.on("dragover", ".n21-tbar-tab[data-n21-tab]", function (event) {
        const id = this.getAttribute("data-n21-tab");
        if (!tabDrag || !id || id === tabDrag) return;
        event.preventDefault();
        event.originalEvent.dataTransfer.dropEffect = "move";
        clearTabDrop();
        this.classList.add(`is-drop-${dropSide(this, event)}`);
      });

      $root.on("drop", ".n21-tbar-tab[data-n21-tab]", function (event) {
        const target = this.getAttribute("data-n21-tab");
        if (!tabDrag || !target || target === tabDrag) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const side = dropSide(this, event);
        const ids = visibleTabs(current.sections)
          .map((tab) => tab.id)
          .filter((id) => id !== tabDrag);
        ids.splice(ids.indexOf(target) + (side === "after" ? 1 : 0), 0, tabDrag);
        tabDrag = null;
        const layout = loadLayout(current.layoutKey);
        // Keep the place of tabs that aren't shown now.
        layout.order = [...ids, ...layout.order.filter((id) => !ids.includes(id))];
        saveLayout(current.layoutKey, layout);
        render();
      });

      // Dragging a divider gives width to the section on one side and takes
      // it from the other, pushing past collapsed sections (like BG3).
      $root.on("pointerdown", ".n21-tbar-divider", function (event) {
        const divider = this;
        // Mobile: the sections scroll in one row instead.
        if (isMobile()) return;
        const sections = [...divider.parentElement.querySelectorAll(".n21-tbar-section")];
        const split = sections.indexOf(divider.nextElementSibling);
        if (split < 1) return;
        event.preventDefault();
        divider.classList.add("is-dragging");
        // Freeze every section at its real width.
        const start = sections.map(contentWidth);
        const apply = (widths) =>
          sections.forEach((section, i) => {
            section.style.flex = `${widths[i]} 1 0px`;
            section.classList.toggle("is-collapsed", widths[i] < 1);
          });
        apply(start);
        const startX = event.clientX;

        const move = (e) => {
          const widths = [...start];
          const delta = e.clientX - startX;
          // Shrink the sections on the side we move towards, nearest first.
          const shrink = delta < 0 ? [...Array(split).keys()].reverse() : [...Array(sections.length).keys()].slice(split);
          let pending = Math.abs(delta);
          for (const i of shrink) {
            const taken = Math.min(widths[i], pending);
            widths[i] -= taken;
            pending -= taken;
            if (pending <= 0) break;
          }
          const moved = Math.abs(delta) - pending;
          widths[delta < 0 ? split : split - 1] += moved;
          apply(widths);
          fillEmptySlots();
        };
        const end = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          divider.classList.remove("is-dragging");
          fillEmptySlots();
          // Not laid out (e.g. hidden): nothing meaningful to remember.
          if (sections.reduce((sum, section) => sum + contentWidth(section), 0) < 1) return;
          const layout = loadLayout(current.layoutKey);
          sections.forEach((section) => {
            layout.widths[section.getAttribute("data-n21-section")] = Math.round(contentWidth(section));
          });
          saveLayout(current.layoutKey, layout);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
      });

      // The side handles resize the bar from its center: both edges move.
      $root.on("pointerdown", "[data-n21-resize]", function (event) {
        if (isMobile()) return;
        event.preventDefault();
        const handle = this;
        const inner = handle.parentElement;
        const direction = handle.getAttribute("data-n21-resize") === "left" ? -1 : 1;
        const startX = event.clientX;
        const startWidth = inner.getBoundingClientRect().width;
        const maxWidth = $root[0].getBoundingClientRect().width;
        handle.classList.add("is-dragging");

        const move = (e) => {
          const width = startWidth + 2 * direction * (e.clientX - startX);
          inner.style.width = `${Math.min(Math.max(width, MIN_WIDTH), maxWidth)}px`;
              fillEmptySlots();
        };
        const end = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          handle.classList.remove("is-dragging");
          saveWidth(inner.getBoundingClientRect().width);
          fillEmptySlots();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
      });

      // The mouse wheel scrolls a section sideways.
      $root.on("wheel", ".n21-tbar-section", function (event) {
        const e = event.originalEvent;
        if (!e || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        if (this.scrollWidth <= this.clientWidth) return;
        event.preventDefault();
        this.scrollLeft += e.deltaY;
      });

      $root.on("click", ".n21-tbar-back", () => {
        nav.pop();
        render();
      });

      const closeMenu = () => {
        $root.find(".n21-tbar-menu").attr("hidden", "");
        $root.find("[data-n21-menu]").attr("aria-expanded", "false");
      };

      $root.on("click", "[data-n21-menu]", function (event) {
        event.stopPropagation();
        const $menu = $(this).siblings(".n21-tbar-menu");
        const open = $menu.is("[hidden]");
        closeMenu();
        if (open) {
          $menu.removeAttr("hidden");
          $(this).attr("aria-expanded", "true");
        }
      });

      $(document).on("click", (event) => {
        if (!$(event.target).closest(".n21-tbar-menu-wrap").length) closeMenu();
      });

      $root.on("click", "[data-n21-option]", function () {
        const option = this.getAttribute("data-n21-option");
        closeMenu();
        if (option === "hide") {
          setVisible(false);
        } else if (option === "classic") {
          SettingsManager.set(SETTING, false);
        } else if (option === "new-section") {
          addCustomSection();
        }
      });

      $root.on("click", "[data-n21-lock]", () => {
        const layout = loadLayout(current.layoutKey);
        layout.locked = !layout.locked;
        saveLayout(current.layoutKey, layout);
        render();
      });

      /* Drag & drop (unlocked): onto a slot swaps with what's there; onto a
         tab moves the item to that section's first free slot. An inventory
         item dragged out of the inventory is copied (a view of the same
         item, it stays there too); dragging a copy back removes it. */
      let dragFrom = null;
      const isDropTarget = (el) => {
        const tab = el.getAttribute("data-n21-slot-section") || el.getAttribute("data-n21-tab");
        if (!slotTabs().includes(tab) || !dragFrom) return false;
        const toInventory = tab === "inventory";
        if (dragFrom.tab === "inventory") {
          // Copying out: onto a tab or an empty slot.
          return toInventory || !el.hasAttribute("data-n21-key");
        }
        return !toInventory || dragFrom.copy;
      };
      const clearDrop = () => $root.find(".is-drop-target").removeClass("is-drop-target");

      $root.on("dragstart", ".n21-tbar-tile[draggable='true']", function (event) {
        dragFrom = {
          tab: this.getAttribute("data-n21-slot-section"),
          index: Number(this.getAttribute("data-n21-slot")),
          copy: String(this.getAttribute("data-n21-key") || "").startsWith(COPY_PREFIX),
        };
        const transfer = event.originalEvent.dataTransfer;
        transfer.effectAllowed = "move";
        transfer.setData("text/plain", this.getAttribute("data-n21-key") || "");
        this.classList.add("is-dragging");
      });

      $root.on("dragend", ".n21-tbar-tile", function () {
        this.classList.remove("is-dragging");
        dragFrom = null;
        clearDrop();
      });

      const DROP = "[data-n21-slot], .n21-tbar-tab[data-n21-tab]";
      $root.on("dragover", DROP, function (event) {
        if (!dragFrom || !isDropTarget(this)) return;
        event.preventDefault();
        event.originalEvent.dataTransfer.dropEffect = "move";
        clearDrop();
        this.classList.add("is-drop-target");
      });

      $root.on("dragleave", DROP, function () {
        this.classList.remove("is-drop-target");
      });

      $root.on("drop", DROP, function (event) {
        if (!dragFrom || !isDropTarget(this)) return;
        event.preventDefault();
        const from = dragFrom;
        dragFrom = null;
        const keys = {};
        slotTabs().forEach((tab) => {
          keys[tab] = (current.sections[tab] || []).map((node) => (node ? nodeKey(node) : null));
        });
        const moving = keys[from.tab][from.index];
        if (!moving) return;
        const save = () => {
          const layout = loadLayout(current.layoutKey);
          layout.slots = keys;
          saveLayout(current.layoutKey, layout);
          render();
        };
        const targetTab = this.getAttribute("data-n21-slot-section") || this.getAttribute("data-n21-tab");

        // A copy back to the inventory: gone (the item is still there).
        if (from.copy && targetTab === "inventory") {
          keys[from.tab][from.index] = null;
          save();
          return;
        }

        // Out of the inventory: a copy (only one per item: the old one goes).
        if (from.tab === "inventory" && targetTab !== "inventory") {
          const copy = COPY_PREFIX + moving;
          Object.keys(keys).forEach((tab) => {
            keys[tab] = keys[tab].map((key) => (key === copy ? null : key));
          });
          if (this.hasAttribute("data-n21-slot")) {
            const index = Number(this.getAttribute("data-n21-slot"));
            while (keys[targetTab].length <= index) keys[targetTab].push(null);
            keys[targetTab][index] = copy;
          } else {
            const free = keys[targetTab].indexOf(null);
            if (free === -1) keys[targetTab].push(copy);
            else keys[targetTab][free] = copy;
          }
          save();
          return;
        }

        if (this.hasAttribute("data-n21-slot")) {
          const tab = this.getAttribute("data-n21-slot-section");
          const index = Number(this.getAttribute("data-n21-slot"));
          while (keys[tab].length <= index) keys[tab].push(null);
          keys[from.tab][from.index] = keys[tab][index];
          keys[tab][index] = moving;
        } else {
          const tab = this.getAttribute("data-n21-tab");
          if (tab === from.tab) return;
          keys[from.tab][from.index] = null;
          const free = keys[tab].indexOf(null);
          if (free === -1) keys[tab].push(moving);
          else keys[tab][free] = moving;
        }
        save();
      });

      // Only the toggle changes: no re-render.
      $root.on("click", "[data-n21-mode]", function () {
        rollMode = this.getAttribute("data-n21-mode");
        const layout = loadLayout(current.layoutKey);
        layout.rollMode = rollMode;
        saveLayout(current.layoutKey, layout);
        $root.find("[data-n21-mode]").each(function () {
          const on = this.getAttribute("data-n21-mode") === rollMode;
          this.classList.toggle("is-active", on);
          this.setAttribute("aria-checked", String(on));
        });
      });

      $root.on("click", "[data-n21-money-edit]", function (event) {
        event.stopPropagation();
        if (moneyEditor) closeMoneyEditor();
        else openMoneyEditor($(this).closest(".n21-tbar-money-wrap"));
      });

      $root.on("click", "[data-n21-money-delta]", function (event) {
        event.stopPropagation();
        const $pop = $(this).closest(".n21-tbar-money-pop");
        const sign = Number(this.getAttribute("data-n21-money-delta"));
        const deltas = {};
        $pop.find("[data-n21-currency]").each(function () {
          const amount = Math.floor(Number($(this).find("input").val()));
          if (amount > 0) deltas[this.getAttribute("data-n21-currency")] = amount * sign;
        });
        if (!current?.charId || !Object.keys(deltas).length) {
          $pop.find(`[data-n21-currency="gp"] input`).trigger("focus");
          return;
        }
        changeMoney(current.charId, deltas);
        closeMoneyEditor();
      });

      // Keep the tabletop shortcuts out of the inputs; Enter adds.
      $root.on("keydown keyup keypress", ".n21-tbar-money-pop input", function (event) {
        event.stopPropagation();
        if (event.type === "keydown" && event.key === "Escape") closeMoneyEditor();
        if (event.type === "keydown" && event.key === "Enter") {
          $(this).closest(".n21-tbar-money-pop").find("[data-n21-money-delta='1']").trigger("click");
        }
      });

      $root.on("input", ".n21-tbar-money-pop input", function () {
        if (!moneyEditor) return;
        moneyEditor.amounts[$(this).closest("[data-n21-currency]").attr("data-n21-currency")] = this.value;
      });

      $root.on("click", "[data-n21-refresh]", function () {
        const charId = current?.charId;
        if (!charId) return;
        const wait = Math.ceil((lastRefresh + REFRESH_COOLDOWN_MS - Date.now()) / 1000);
        if (wait > 0) {
          this.title = `Espera ${wait} s antes de volver a actualizar`;
          return;
        }
        lastRefresh = Date.now();
        this.title = "Actualizar inventario";
        this.classList.add("is-loading");
        CharacterItemsManager.refresh(charId);
      });

      $root.on("click", "[data-n21-rows]", function () {
        const layout = loadLayout(current.layoutKey);
        layout.rows = Math.min(Math.max(layout.rows + Number(this.getAttribute("data-n21-rows")), MIN_ROWS), MAX_ROWS);
        saveLayout(current.layoutKey, layout);
        render();
      });

      $root.on("click", ".n21-tbar-tile", function (event) {
        const node = $(this).data("n21Node");
        const kind = this.getAttribute("data-n21-kind");
        if (!node) return;

        if (kind === "open") {
          event.stopPropagation();
          const picker = node.n21_levels && node.n21_levels.length > 1;
          nav.push({ kind: picker ? "levels" : "folder", node });
          render();
          return;
        }

        if (kind === "level") {
          event.stopPropagation();
          nav.push({ kind: "folder", node });
          render();
          return;
        }

        // Plain actions: dice are rolled here; casting, floating panels and
        // the inventory are handled by their own features.
        if (node.action_type === "dice_roll") {
          event.stopPropagation();
          rollNode(node);
        }
      });

      // Inventory items: the inventory panel's menu (use, add, delete).
      $root.on("contextmenu", ".n21-inventory-item", async function (event) {
        event.preventDefault();
        event.stopPropagation();
        const charId = current?.charId;
        const items = inventoryCache.get(charId);
        const item = Array.isArray(items) ? items[Number(this.getAttribute("data-index"))] : null;
        if (!item || !(await CharacterItemsManager.canEdit(charId))) return;
        window._n21_.inventoryPanel.showItemMenu(this, event.clientX, event.clientY, item, {
          onQuantity: (delta) => {
            const next = Math.max(0, (item.quantity ?? 1) + delta);
            if (!CharacterItemsManager.setQuantity(charId, item, next)) return;
            // Shown right away; saved once the clicks stop.
            item.quantity = next;
            render();
          },
          onDelete: async () => {
            if (!window.confirm(`¿Eliminar «${item.name}» del inventario?`)) return;
            // Gone right away; back if the deletion fails.
            inventoryCache.set(charId, items.filter((other) => other !== item));
            render();
            try {
              await CharacterItemsManager.deleteItem(charId, item);
            } catch (error) {
              inventoryCache.set(charId, items);
              render();
              window.alert("No se pudo eliminar el objeto.");
            }
          },
        });
      });
    }

    /* ----------------------- mounting ----------------------- */

    function unmount() {
      if (!current) return;
      current.$root.remove();
      current.$nativeBar.removeClass("n21-tbar-native-hidden");
      current = null;
      nav = [];
    }

    function mount(nativeBar, items) {
      const senderInfo = nativeBar.getAttribute("data-sender-info") || "";
      const match = senderInfo.match(BAR_SENDER_RE);
      if (!match) return;
      // Characters: their id (spells, slots, inventory). Anything else
      // (creatures): only its own layout.
      const charId = match[1] === "Character" ? match[2] : null;
      const layoutKey = charId || `creature:${senderInfo}`;

      const tabs = buildTabs(items);
      if (!current || current.$nativeBar[0] !== nativeBar) {
        unmount();
        const $root = $("<div>").addClass("n21-tbar").attr("id", `n21-tbar-${uuid()}`);
        $(nativeBar).before($root);
        bindRoot($root);
        current = { $root, $nativeBar: $(nativeBar) };
      }
      if (current.layoutKey !== layoutKey) nav = [];
      Object.assign(current, { charId, layoutKey, senderInfo, tabs });
      current.$nativeBar.addClass("n21-tbar-native-hidden");
      render();
    }

    // "Character-123", "Creature-45"…: [, type, id].
    const BAR_SENDER_RE = /^([A-Za-z]+)-(\d+)/;

    // After the injecting features (50-80) and the editor's layout (90), and
    // before the multi-level bar (100), which stops the chain when it renders.
    ActionBarManager.onCreateBar(
      "tabbed-action-bar",
      (element, items, parentItem = null) => {
        if (parentItem !== null || !Array.isArray(items)) return;
        const nativeBar = $(element).closest(".action-bar")[0];
        if (!nativeBar || !$(nativeBar).closest(".fixed-actionbar").length) return;
        if (!BAR_SENDER_RE.test(nativeBar.getAttribute("data-sender-info") || "")) {
          // Bars without a sender keep the native bar.
          lastBar = null;
          $(nativeBar).children(".n21-tbar-classic").remove();
          if (current?.$nativeBar[0] === nativeBar) unmount();
          return;
        }
        const snapshot = JSON.parse(JSON.stringify(items));
        // Kept even while disabled, so turning the feature on shows it at once.
        lastBar = { nativeBar, items: snapshot };
        setTimeout(() => ensureClassicGear(nativeBar), 0);
        if (!featureEnabled) return;
        // The native bar renders right after; mount once it's in place.
        setTimeout(() => mount(nativeBar, snapshot), 0);
      },
      { priority: 95 },
    );

    /**
     * Gear on the classic (native) character bar, to try this one. It lives
     * inside the native bar, so it's hidden along with it.
     */
    function ensureClassicGear(nativeBar) {
      if (!nativeBar?.isConnected || $(nativeBar).children(".n21-tbar-classic").length) return;
      $("<div>")
        .addClass("n21-tbar-classic n21-tbar-menu-wrap")
        .append(
          $("<button type='button'>")
            .addClass("n21-tbar-gear")
            .attr({ "data-n21-menu": "", title: "Opciones de la barra", "aria-haspopup": "menu", "aria-expanded": "false" })
            .html('<i class="fa fa-cog" aria-hidden="true"></i>'),
          $("<div>")
            .addClass("n21-tbar-menu")
            .attr({ role: "menu", hidden: "" })
            .append(
              $("<button type='button'>")
                .attr({ role: "menuitem", "data-n21-option": "try" })
                .text("Probar la barra nueva"),
            ),
        )
        .appendTo(nativeBar);
    }

    $(document).on("click", ".n21-tbar-classic [data-n21-menu]", function (event) {
      event.stopPropagation();
      const $menu = $(this).siblings(".n21-tbar-menu");
      const open = $menu.is("[hidden]");
      $menu.attr("hidden", open ? null : "");
      $(this).attr("aria-expanded", String(open));
    });

    $(document).on("click", ".n21-tbar-classic [data-n21-option='try']", function () {
      $(this).closest(".n21-tbar-menu").attr("hidden", "");
      SettingsManager.set(SETTING, true);
    });

    $(document).on("click", (event) => {
      if ($(event.target).closest(".n21-tbar-classic").length) return;
      $(".n21-tbar-classic .n21-tbar-menu").attr("hidden", "");
      $(".n21-tbar-classic [data-n21-menu]").attr("aria-expanded", "false");
    });

    // Last bar rendered by Nivel20: { nativeBar, items }.
    let lastBar = null;

    SettingsManager.onChange(() => {
      const next = !!SettingsManager.get(SETTING);
      if (next === featureEnabled) return;
      featureEnabled = next;
      syncVisibilityToggle();
      if (!next) unmount();
      else if (lastBar?.nativeBar.isConnected) mount(lastBar.nativeBar, lastBar.items);
      ActionBarManager.rerenderCharacterBars();
    });

    /* Anti-spam: the same action / roll can't fire again within a short
       cooldown. Window capture phase, so it runs before every other handler
       (casting, spending slots, floating panels…), which are on document. */
    const ACTION_COOLDOWN_MS = 800;
    const lastFired = new Map();

    window.addEventListener(
      "click",
      (event) => {
        const tile = event.target.closest?.(".n21-tbar .n21-tbar-tile[data-action]");
        if (!tile) return;
        const key = tile.getAttribute("data-action");
        const now = Date.now();
        if (now - (lastFired.get(key) || 0) < ACTION_COOLDOWN_MS) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        lastFired.set(key, now);
      },
      true,
    );

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => current && render(), 150);
    });

    // Slot counts in the level picker follow the combat tracking panel.
    window._n21_
      .loadManagers("CombatTrackingManager", { timeout: 30000 })
      .then(([Tracking]) =>
        Tracking.onChange(() => {
          // Deferred: a slot spent by a click must not re-render the bar
          // while that click is still being handled.
          setTimeout(() => {
            if (nav[nav.length - 1]?.kind === "levels") render();
          }, 0);
        }),
      )
      .catch(() => {});

    // Saved inventory edits (here or in the inventory panel): reload them.
    // The items shown stay until the new ones arrive.
    CharacterItemsManager.onChange((charId) => {
      // Money: unless changes of ours are still waiting to be saved.
      if (moneyCache.has(charId)) {
        window._n21_.inventoryPanel
          ?.getMoney(charId)
          .then((totals) => {
            if (pendingMoney.has(charId)) return;
            moneyCache.set(charId, totals);
            if (current?.charId === charId) render();
          })
          .catch(() => {});
      }
      if (!Array.isArray(inventoryCache.get(charId))) return;
      CharacterItemsManager.getItems(charId)
        .then((items) => {
          inventoryCache.set(charId, items || []);
          if (current?.charId === charId) render();
        })
        .catch(() => {});
    });

    syncVisibilityToggle();
    if (featureEnabled) ActionBarManager.rerenderCharacterBars();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Tabbed Action Bar", error);
  }
})();
