(async () => {
  try {
    /* =======================================================================
         Feature: Inventory Panel

         Appends an "Inventario" action at the very end of a character's action
         bar. Clicking it opens a floating panel that shows the character's
         inventory (weapons, armor, adventuring gear…) as a 4-column grid of
         read-only item icons — reusing the very same action-bar icon markup
         (frame + tooltip) so they look native inside the panel.

         The grid scrolls inside a fixed-height panel; a sticky footer holds a
         refresh button (left) and the parsed money (right).

         Data comes from the shared character sheet JSON (the same one the
         spell/trait action bars use), read through CharacterSheetManager so the
         request is cached and de-duplicated. The refresh button invalidates
         that shared cache and re-downloads, so the fresh JSON benefits every
         feature — it is debounced to once per 10s to avoid hammering the server.

         Items are display-only: the printable JSON exposes an editable id only
         for weapons (via `actions`), not for the rest of the inventory, so to
         keep the behaviour uniform nothing is clickable-to-edit here.

         Money is parsed from the free-text `printable_hash.equipment` string by
         scanning for a `[money:...]` token, e.g. `[money:1pp 2gp 3sp]`. Each
         currency is declared below with a key + icon, so the same mechanism
         works for any game system: undeclared/zero currencies are simply not
         shown.
      ======================================================================= */

    const { loadManagers } = window._n21_;

    const [
      ActionBarManager,
      CharacterSheetManager,
      CharacterItemsManager,
      CombatTrackingManager,
      FloatingPanelManager,
      TooltipManager,
      SettingsManager,
    ] = await loadManagers(
      "ActionBarManager",
      "CharacterSheetManager",
      "CharacterItemsManager",
      "CombatTrackingManager",
      "FloatingPanelManager",
      "TooltipManager",
      "SettingsManager",
    );

    // Applies live: when disabled its items are stripped from the bar.
    let featureEnabled = SettingsManager.get("feature.inventory-panel.enabled");

    // Shared money helpers (currency definitions + [money:...] parsing).
    const money = window._n21_.money;

    // Minimum delay between manual refreshes, per the "don't hammer" rule.
    const REFRESH_COOLDOWN_MS = 10000;

    // Custom action_type for the single bar item this feature appends.
    const ACTION_TYPE = "inventory-open";
    // Marks the item injected by this feature so re-renders stay idempotent.
    const INJECT_TAG = "__n21Inventory";

    const uuid =
      window._n21_?.utils?.uuid || (() => Math.random().toString(36).slice(2));

    // charId -> timestamp of the last successful manual refresh (for cooldown).
    const lastRefreshAt = new Map();

    /** Build a bundled-asset URL from the extension base (carries the ext id). */
    function assetUrl(file) {
      const base = document.documentElement?.dataset?.n21BaseUrl || "";
      return `${base}src/assets/inventory/${file}`;
    }

    /** Minimal HTML escaping for text interpolated into markup. */
    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
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

    /* ------------------------------- Money -------------------------------- */

    /** Build the money row HTML (only currencies with a positive total). */
    function buildMoneyHtml(totals) {
      const parts = [];
      for (const currency of money.CURRENCIES) {
        const amount = totals[currency.key.toLowerCase()];
        if (!amount) continue;
        parts.push(
          `<span class="n21-inventory-coin" title="${escapeHtml(currency.label)}">` +
            `<span class="n21-inventory-coin-amount">${escapeHtml(amount)}</span>` +
            `<img class="n21-inventory-coin-icon" src="${money.iconUrl(
              currency,
            )}" alt="${escapeHtml(currency.key)}">` +
            `</span>`,
        );
      }
      return parts.join("");
    }

    /* ----------------------------- Inventory ------------------------------ */

    /**
     * Build a single read-only inventory cell reusing the native action-bar
     * icon markup (same frame + tooltip), so it looks identical to the bar.
     * @returns {jQuery}
     */
    function buildItemCell(item, index) {
      const name = item?.name || "";
      const icon = item?.icon_url || "";
      const description = item?.cleanDescription ?? item?.description;
      const quantity = item?.quantity ?? 1;

      let tooltipHtml = `<h5>${escapeHtml(item?.tooltip_title || name)}</h5>`;
      if (item?.group) tooltipHtml += `<p><em>${escapeHtml(item.group)}</em></p>`;
      tooltipHtml += `<p><strong>Cantidad: ${escapeHtml(quantity)}</strong></p>`;
      if (description)
        tooltipHtml += `<p>${escapeHtml(description)}</p>`;
      if (item?.location_text)
        tooltipHtml += `<p><strong>${escapeHtml(item.location_text)}</strong></p>`;

      const imageStyle = icon
        ? `background: url('${encodeURI(icon)}') no-repeat;`
        : "";

      const $cell = $("<div>")
        .addClass("action-bar-element n21-inventory-item")
        .toggleClass("n21-inventory-item--empty", quantity === 0)
        .attr("data-action-type", "none")
        .attr("data-index", index)
        .attr("draggable", "true");

      $cell.html(`
        <div class="action-bar-button tooltipstered" data-toggle="tooltip">
          <div class="action-bar-bg"></div>
          <div class="action-bar-image" style="${imageStyle}"></div>
          <div class="action-bar-hover"></div>
          <div class="action-bar-text">
            <span class="action-bar-short-name"></span>
            <span class="action-bar-name">${escapeHtml(name)}</span>
          </div>
          <div class="action-bar-indicator">
            <i class="indicator-icon d-none"></i>
            <i class="selected-indicator-icon d-none"></i>
          </div>
          <div class="action-bar-frame"></div>
          ${
            // Like WoW: the count only shows for stacks (or when used up).
            quantity !== 1
              ? `<span class="n21-inventory-qty">${escapeHtml(quantity)}</span>`
              : ""
          }
        </div>
      `);

      const $button = $cell.find(".action-bar-button");
      $button.attr("title", tooltipHtml);
      TooltipManager.process($button[0]);

      return $cell;
    }

    /* --------------------------- Panel size ----------------------------- */

    // The window only takes whole-slot sizes: 1-9 columns and N rows. The
    // last size is remembered (in columns x rows).
    const SIZE_KEY = "_n21_inventory-panel-size";
    const MAX_COLUMNS = 9;
    const MIN_ROWS = 2;
    const DEFAULT_SIZE = { columns: 4, rows: 6 };

    function loadPanelSize() {
      try {
        const size = JSON.parse(localStorage.getItem(SIZE_KEY) || "null");
        if (size?.columns > 0 && size?.rows > 0) {
          return {
            columns: Math.min(Math.max(size.columns, 1), MAX_COLUMNS),
            rows: Math.max(size.rows, MIN_ROWS),
          };
        }
      } catch (_) {}
      return DEFAULT_SIZE;
    }

    function savePanelSize(size) {
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(size));
      } catch (_) {}
    }

    /** Pixels the panel adds around the usable grid area (borders, header...). */
    function panelChrome($panel) {
      const grid = $panel.find(".n21-inventory-grid")[0];
      return {
        x: $panel.outerWidth() - (grid.clientWidth - GRID_PADDING_PX),
        y: $panel.outerHeight() - (grid.clientHeight - GRID_PADDING_PX),
      };
    }

    /** Resize the panel to exactly `columns x rows` slots. */
    function applyPanelSize($panel, size) {
      const chrome = panelChrome($panel);
      $panel.outerWidth(chrome.x + size.columns * CELL_PX);
      $panel.outerHeight(chrome.y + size.rows * CELL_PX);
    }

    /** Make the native resize snap to whole slots and remember the size. */
    function bindPanelResize($panel) {
      if (typeof $panel.resizable !== "function") return;
      const chrome = panelChrome($panel);
      const onStop = () => {
        const c = panelChrome($panel);
        const size = {
          columns: Math.min(Math.max(Math.round(($panel.outerWidth() - c.x) / CELL_PX), 1), MAX_COLUMNS),
          rows: Math.max(Math.round(($panel.outerHeight() - c.y) / CELL_PX), MIN_ROWS),
        };
        applyPanelSize($panel, size);
        savePanelSize(size);
      };
      try {
        $panel.css({ minWidth: "", maxWidth: "", minHeight: "", maxHeight: "" });
        // Keep any existing stop handler (Nivel20's own) and add ours.
        const previousStop = $panel.resizable("option", "stop");
        $panel.resizable("option", {
          grid: [CELL_PX, CELL_PX],
          minWidth: chrome.x + CELL_PX,
          maxWidth: chrome.x + MAX_COLUMNS * CELL_PX,
          minHeight: chrome.y + MIN_ROWS * CELL_PX,
          stop: function (...args) {
            if (typeof previousStop === "function") previousStop.apply(this, args);
            onStop();
          },
        });
      } catch (_) {}
    }

    /* ------------------------- Local slot layout -------------------------- */

    // Bag-like slots: each item keeps its slot (gaps allowed). Purely local,
    // per character: an array of item keys (null = empty slot).
    const SLOTS_PREFIX = "_n21_inventory-slots:";
    const CELL_PX = 60; // item cell size (same as the action bar buttons)
    const GRID_PADDING_PX = 12;

    function itemKey(item) {
      return item?.itemId ? `id:${item.itemId}` : `name:${item?.name || ""}`;
    }

    function loadSlots(charId) {
      try {
        const list = JSON.parse(localStorage.getItem(SLOTS_PREFIX + charId) || "[]");
        return Array.isArray(list) ? list : [];
      } catch (_) {
        return [];
      }
    }

    function saveSlots(charId, slots) {
      const keys = slots.map((item) => (item ? itemKey(item) : null));
      while (keys.length && keys[keys.length - 1] === null) keys.pop();
      try {
        localStorage.setItem(SLOTS_PREFIX + charId, JSON.stringify(keys));
      } catch (_) {}
    }

    /**
     * Place items in slots: saved positions first, the rest (new items) in
     * the first free slots. Shows as many slots as fit in the window.
     * @returns {Array<Object|null>}
     */
    /** Columns and visible rows that fit in the (resizable) panel. */
    function gridCapacity($panel) {
      const grid = $panel.find(".n21-inventory-grid")[0];
      const width = grid?.clientWidth || CELL_PX * 4;
      const height = grid?.clientHeight || CELL_PX * 6;
      return {
        columns: Math.max(1, Math.floor((width - GRID_PADDING_PX) / CELL_PX)),
        rows: Math.max(1, Math.floor((height - GRID_PADDING_PX) / CELL_PX)),
      };
    }

    function layoutSlots(charId, items, capacity = { columns: 4, rows: 6 }) {
      const saved = charId ? loadSlots(charId) : [];
      const slots = [];
      const placed = new Set();
      const byKey = new Map();
      items.forEach((item) => {
        const key = itemKey(item);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(item);
      });
      saved.forEach((key, index) => {
        const candidates = key ? byKey.get(key) : null;
        const item = candidates?.find((it) => !placed.has(it));
        slots[index] = item || null;
        if (item) placed.add(item);
      });
      items.forEach((item) => {
        if (placed.has(item)) return;
        let free = slots.findIndex((slot) => !slot);
        if (free === -1) free = slots.length;
        slots[free] = item;
        placed.add(item);
      });
      for (let i = 0; i < slots.length; i += 1) if (slots[i] === undefined) slots[i] = null;
      let last = slots.length - 1;
      while (last >= 0 && !slots[last]) last -= 1;
      // Exactly what fits in the window (more only if items don't fit).
      const { columns, rows } = capacity;
      const total = Math.max(columns * rows, Math.ceil((last + 1) / columns) * columns);
      while (slots.length < total) slots.push(null);
      return slots.slice(0, total);
    }

    function renderSlots($panel) {
      const items = $panel.data("n21InventoryItems") || [];
      const slots = $panel.data("n21InventorySlots") || [];
      const $grid = $panel.find(".n21-inventory-grid");
      $grid.empty();
      slots.forEach((item, slot) => {
        if (item) {
          $grid.append(buildItemCell(item, items.indexOf(item)).attr("data-slot", slot));
        } else {
          $grid.append(
            $("<div>").addClass("n21-inventory-slot").attr("data-slot", slot),
          );
        }
      });
    }

    /** Render the grid + money into the panel body. */
    function renderInventory($body, items, ph) {
      const $panel = $body.closest(".n21-inventory-panel");
      const $grid = $body.find(".n21-inventory-grid");
      $grid.empty();
      const charId = $panel.data("n21CharId");
      $panel.data("n21InventoryItems", items);
      $panel.data("n21InventorySlots", layoutSlots(charId, items, gridCapacity($panel)));
      $panel.data("n21InventoryMoney", money.parse(ph?.equipment));

      if (!items.length) {
        $grid.append(
          '<div class="n21-inventory-empty">Sin objetos en el inventario.</div>',
        );
      } else {
        renderSlots($panel);
      }

      const totals = money.parse(ph?.equipment);
      $body
        .find(".n21-inventory-money")
        .html(buildMoneyHtml(totals) || '<span class="n21-inventory-money-empty">Sin dinero</span>')
        .attr("title", "Click derecho: editar dinero");
    }

    /** Load items (with ids/quantities) + sheet and render them. */
    async function loadAndRender($panel, charId) {
      const jsonUrl = `/characters/${charId}.json`;
      const [items, ph] = await Promise.all([
        CharacterItemsManager.getItems(charId),
        CharacterSheetManager.fetchCharacter(jsonUrl),
      ]);
      renderInventory($panel.find(".n21-inventory"), items, ph);
    }

    // Default tooltip shown when hovering the refresh button.
    const REFRESH_TOOLTIP = "Actualizar inventario";

    /** Call a tooltipster instance method, tolerating v3/v4 naming. */
    function tooltipster($el, methods, arg) {
      for (const method of methods) {
        try {
          if (arg === undefined) $el.tooltipster(method);
          else $el.tooltipster(method, arg);
          return true;
        } catch (_) {
          /* try the next alias */
        }
      }
      return false;
    }

    /**
     * Briefly show a message as a tooltip on the refresh button, using the same
     * tooltip system as the item icons, then restore the default tooltip.
     */
    function flashButtonTooltip($button, message) {
      if (typeof $button.tooltipster !== "function") return; // plugin missing
      tooltipster($button, ["content"], message);
      tooltipster($button, ["open", "show"]);
      clearTimeout($button.data("ttTimer"));
      const timer = setTimeout(() => {
        tooltipster($button, ["close", "hide"]);
        tooltipster($button, ["content"], REFRESH_TOOLTIP);
      }, 2500);
      $button.data("ttTimer", timer);
    }

    /**
     * Wire the refresh button: invalidate the shared cache and re-download,
     * debounced to once per REFRESH_COOLDOWN_MS. During the cooldown a hint
     * tells the user how long to wait instead of firing a request.
     */
    function bindRefresh($panel, charId, jsonUrl) {
      const $body = $panel.find(".n21-inventory");
      const $button = $body.find(".n21-inventory-refresh");

      // Initialize the button's tooltip (same system as the item icons) so we
      // can later swap its content to show the cooldown/error message.
      $button.attr("title", REFRESH_TOOLTIP);
      TooltipManager.process($button[0]);

      $button.on("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const now = Date.now();
        const last = lastRefreshAt.get(charId) || 0;
        const elapsed = now - last;
        if (elapsed < REFRESH_COOLDOWN_MS) {
          const wait = Math.ceil((REFRESH_COOLDOWN_MS - elapsed) / 1000);
          flashButtonTooltip($button, `Espera ${wait}s antes de volver a actualizar…`);
          return;
        }

        lastRefreshAt.set(charId, now);
        $button.addClass("loading").prop("disabled", true);
        try {
          CharacterSheetManager.invalidate(jsonUrl);
          await loadAndRender($panel, charId);
        } catch (error) {
          window._n21_.utils?.registerFeatureError?.("inventory-panel", error);
          flashButtonTooltip($button, "No se pudo actualizar el inventario.");
        } finally {
          $button.removeClass("loading").prop("disabled", false);
        }
      });
    }

    /** Build the (empty) panel body markup: scrollable grid + sticky footer. */
    function panelBodyHtml(charId) {
      return (
        '<div class="n21-inventory">' +
        '<div class="n21-inventory-grid"></div>' +
        '<div class="n21-inventory-footer">' +
        '<button class="n21-inventory-refresh">' +
        '<i class="fa fa-refresh"></i></button>' +
        // The items tab only opens on the campaign URL of the sheet.
        `<a class="n21-inventory-edit" href="${escapeHtml(
          CombatTrackingManager.getCharacterSheetUrl(charId),
        )}?panel=items" target="_blank" rel="noopener" title="Editar el equipo en la hoja del personaje">` +
        '<i class="fa fa-pencil"></i></a>' +
        '<div class="n21-inventory-money"></div>' +
        "</div>" +
        "</div>"
      );
    }

    /** Open (or focus) the inventory floating panel for a character. */
    async function openInventoryPanel(charId) {
      const jsonUrl = `/characters/${charId}.json`;
      let ph;
      try {
        ph = await CharacterSheetManager.fetchCharacter(jsonUrl);
      } catch (error) {
        window._n21_.utils?.registerFeatureError?.("inventory-panel", error);
        return;
      }

      const name = CharacterSheetManager.getCharacterName(ph) || "";
      const title = name || "Inventario";

      // Opening seeds the cooldown so an immediate manual refresh still waits,
      // preventing a refresh-spam right after opening.
      if (!lastRefreshAt.has(charId)) lastRefreshAt.set(charId, Date.now());

      const $panel = FloatingPanelManager.openStaticPanelWithHtml(
        title,
        "",
        "#4a3b2a",
        panelBodyHtml(charId),
        "n21-inventory-panel",
        // Sized in whole slots right after opening (see applyPanelSize).
        "width: 290px; height: 420px;",
      );
      if (!$panel || !$panel.length) return;

      $panel.data("n21CharId", String(charId));

      // Bind refresh once per freshly created panel.
      if (!$panel.data("n21InventoryBound")) {
        $panel.data("n21InventoryBound", true);
        applyPanelSize($panel, loadPanelSize());
        bindPanelResize($panel);
        bindRefresh($panel, charId, jsonUrl);
        bindEditing($panel, charId);
      }

      // If the panel already existed (still open), just refresh its contents.
      try {
        await loadAndRender($panel, charId);
      } catch (error) {
        window._n21_.utils?.registerFeatureError?.("inventory-panel", error);
      }
    }

    /* ------------------------------ Editing ------------------------------- */

    let $contextMenu = null;

    function closeContextMenu() {
      if ($contextMenu) $contextMenu.remove();
      $contextMenu = null;
    }

    /** Small context menu with the same look as the board's dropdown. */
    function showContextMenu(x, y, options) {
      closeContextMenu();
      $contextMenu = $('<div class="n21-canvas-dropdown-menu n21-inventory-menu" role="menu"></div>');
      options.forEach((option) => {
        const $item = $(
          `<button type="button" class="n21-canvas-dropdown-item" role="menuitem">${escapeHtml(option.label)}</button>`,
        );
        if (option.danger) $item.addClass("n21-inventory-menu-danger");
        if (option.disabled) $item.prop("disabled", true);
        $item.on("click", (event) => {
          event.stopPropagation();
          closeContextMenu();
          if (!option.disabled) option.onClick?.();
        });
        $contextMenu.append($item);
      });
      $("body").append($contextMenu);
      const width = $contextMenu.outerWidth();
      const height = $contextMenu.outerHeight();
      $contextMenu.css({
        display: "block",
        left: Math.min(x, window.innerWidth - width - 8),
        top: Math.min(y, window.innerHeight - height - 8),
      });
    }

    $(document).on("mousedown.n21InventoryMenu", (event) => {
      if ($contextMenu && !$(event.target).closest(".n21-inventory-menu").length) {
        closeContextMenu();
      }
    });
    $(document).on("keydown.n21InventoryMenu", (event) => {
      if (event.key === "Escape") closeContextMenu();
    });

    function flashMessage($panel, text) {
      const $msg = $panel.find(".n21-inventory-message");
      $msg.text(text).addClass("n21-inventory-message--visible");
      clearTimeout($msg.data("timer"));
      $msg.data(
        "timer",
        setTimeout(() => $msg.removeClass("n21-inventory-message--visible"), 3500),
      );
    }

    function changeQuantity($panel, charId, index, delta) {
      const items = $panel.data("n21InventoryItems") || [];
      const item = items[index];
      if (!item) return;
      const current = item.quantity ?? 1;
      const next = Math.max(0, current + delta);
      if (next === current) return;
      if (!CharacterItemsManager.setQuantity(charId, item, next)) {
        flashMessage($panel, "No se puede editar este objeto.");
        return;
      }
      // Optimistic update: redraw just this cell.
      item.quantity = next;
      const $old = $panel.find(`.n21-inventory-item[data-index="${index}"]`);
      $old.replaceWith(buildItemCell(item, index).attr("data-slot", $old.attr("data-slot")));
    }

    async function deleteItem($panel, charId, index) {
      const items = $panel.data("n21InventoryItems") || [];
      const item = items[index];
      if (!item) return;
      if (!window.confirm(`¿Eliminar «${item.name}» del inventario?`)) return;
      try {
        $panel.find(`.n21-inventory-item[data-index="${index}"]`).addClass("n21-inventory-item--busy");
        await CharacterItemsManager.deleteItem(charId, item);
      } catch (error) {
        flashMessage($panel, "No se pudo eliminar el objeto.");
        $panel.find(`.n21-inventory-item[data-index="${index}"]`).removeClass("n21-inventory-item--busy");
      }
    }

    function openMoneyEditor($panel, charId) {
      const totals = $panel.data("n21InventoryMoney") || {};
      const fields = money.CURRENCIES.map(
        (currency) => `
          <label class="n21-inventory-money-field" title="${escapeHtml(currency.label)}">
            <img src="${money.iconUrl(currency)}" alt="${escapeHtml(currency.key)}" />
            <input type="number" min="0" step="1" inputmode="numeric" data-currency="${escapeHtml(
              currency.key,
            )}" value="${escapeHtml(totals[currency.key.toLowerCase()] || 0)}" />
          </label>`,
      ).join("");
      const $editor = $(`
        <form class="n21-inventory-money-editor">
          <div class="n21-inventory-money-fields">${fields}</div>
          <div class="n21-inventory-money-actions">
            <button type="button" class="btn btn-sm btn-secondary n21-inventory-money-cancel">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-success">Guardar</button>
          </div>
        </form>`);
      $panel.find(".n21-inventory-money-editor").remove();
      $panel.find(".n21-inventory-footer").before($editor);
      $editor.find("input").first().trigger("focus").trigger("select");
      $editor.on("keydown keyup keypress", "input", (event) => event.stopPropagation());
      $editor.on("click", ".n21-inventory-money-cancel", () => $editor.remove());
      $editor.on("submit", async (event) => {
        event.preventDefault();
        const next = {};
        $editor.find("input[data-currency]").each(function () {
          next[this.dataset.currency.toLowerCase()] = Math.max(0, parseInt(this.value, 10) || 0);
        });
        $editor.find("button").prop("disabled", true);
        try {
          const saved = await CharacterItemsManager.updateEquipmentText(charId, (text, max) => {
            const updated = money.setInText(text, next);
            // Never drop player text: skip if the field can't hold the tag.
            return max && updated.length > max ? null : updated;
          });
          if (!saved) flashMessage($panel, "No hay espacio en «Otras posesiones» para guardar el dinero.");
          $editor.remove();
        } catch (error) {
          flashMessage($panel, "No se pudo guardar el dinero.");
          $editor.find("button").prop("disabled", false);
        }
      });
    }

    function bindEditing($panel, charId) {
      // Resizing the window shows more or fewer slots.
      const grid = $panel.find(".n21-inventory-grid")[0];
      if (grid && typeof ResizeObserver === "function") {
        let lastTotal = null;
        let timer = null;
        new ResizeObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            const items = $panel.data("n21InventoryItems");
            if (!items?.length) return;
            const slots = layoutSlots(charId, items, gridCapacity($panel));
            if (slots.length === lastTotal) return;
            lastTotal = slots.length;
            $panel.data("n21InventorySlots", slots);
            renderSlots($panel);
          }, 80);
        }).observe(grid);
      }

      $panel.find(".n21-inventory").append('<div class="n21-inventory-message" role="status"></div>');

      $panel.on("contextmenu", ".n21-inventory-item", function (event) {
        event.preventDefault();
        event.stopPropagation();
        const index = Number($(this).attr("data-index"));
        const item = ($panel.data("n21InventoryItems") || [])[index];
        if (!item) return;
        const editable = !!item.itemId;
        const quantity = item.quantity ?? 1;
        showContextMenu(event.clientX, event.clientY, [
          {
            label: "Usar uno (−1)",
            disabled: !editable || quantity <= 0,
            onClick: () => changeQuantity($panel, charId, index, -1),
          },
          {
            label: "Añadir uno (+1)",
            disabled: !editable,
            onClick: () => changeQuantity($panel, charId, index, 1),
          },
          {
            label: "Eliminar objeto",
            danger: true,
            disabled: !item.deleteUrl,
            onClick: () => deleteItem($panel, charId, index),
          },
        ]);
      });

      // Drag & drop between slots (saved locally for this character):
      // onto an empty slot moves the item, onto another item swaps them.
      let dragSlot = null;
      const SLOT_SELECTOR = ".n21-inventory-item, .n21-inventory-slot";
      $panel.on("dragstart", ".n21-inventory-item", function (event) {
        dragSlot = Number($(this).attr("data-slot"));
        event.originalEvent.dataTransfer.effectAllowed = "move";
        event.originalEvent.dataTransfer.setData("text/plain", String(dragSlot));
        $(this).addClass("n21-inventory-item--dragging");
      });
      $panel.on("dragend", ".n21-inventory-item", () => {
        dragSlot = null;
        $panel.find(".n21-inventory-item--dragging, .n21-inventory-item--drop").removeClass(
          "n21-inventory-item--dragging n21-inventory-item--drop",
        );
      });
      $panel.on("dragover", SLOT_SELECTOR, function (event) {
        if (dragSlot === null) return;
        event.preventDefault();
        $panel.find(".n21-inventory-item--drop").removeClass("n21-inventory-item--drop");
        $(this).addClass("n21-inventory-item--drop");
      });
      $panel.on("drop", SLOT_SELECTOR, function (event) {
        event.preventDefault();
        const target = Number($(this).attr("data-slot"));
        const slots = ($panel.data("n21InventorySlots") || []).slice();
        if (dragSlot === null || dragSlot === target || !slots[dragSlot]) return;
        [slots[dragSlot], slots[target]] = [slots[target] || null, slots[dragSlot]];
        saveSlots(charId, slots);
        $panel.data(
          "n21InventorySlots",
          layoutSlots(charId, $panel.data("n21InventoryItems") || [], gridCapacity($panel)),
        );
        renderSlots($panel);
      });

      $panel.on("contextmenu", ".n21-inventory-money", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showContextMenu(event.clientX, event.clientY, [
          { label: "Editar dinero", onClick: () => openMoneyEditor($panel, charId) },
        ]);
      });

    }

    // Reload open panels once edits have been saved (several edits in a row
    // cause a single reload).
    const reloadTimers = new Map();
    CharacterItemsManager.onChange((charId) => {
      clearTimeout(reloadTimers.get(charId));
      reloadTimers.set(
        charId,
        setTimeout(() => {
          reloadTimers.delete(charId);
          $(".n21-inventory-panel").each(function () {
            const $panel = $(this);
            if ($panel.data("n21CharId") !== String(charId)) return;
            loadAndRender($panel, charId).catch(() => {});
          });
        }, 800),
      );
    });

    /* ------------------------- Action bar wiring -------------------------- */

    /** The single "Inventario" bar item (read-only opener). */
    function buildInventoryItem(charId) {
      return {
        id: `n21-inventory-${uuid()}`,
        name: "Inventario",
        text: "",
        icon: assetUrl("backpack.png"),
        description: null,
        action_type: ACTION_TYPE,
        hidden: false,
        order: null,
        source_name: null,
        tooltip_title: "Inventario",
        owned: false,
        charId,
        n21Key: "n21:inventory",
        [INJECT_TAG]: true,
      };
    }

    /** Append (idempotently) the inventory item at the very end of the bar. */
    function injectInto(items, charId) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
      items.push(buildInventoryItem(charId));
    }

    // List the item in the action bar editor.
    window._n21_.actionBarLayout?.registerProvider("inventory", {
      order: 40,
      getEntries: async () => (!featureEnabled ? [] : [
        { key: "n21:inventory", label: "Inventario", icon: assetUrl("backpack.png") },
      ]),
    });

    // Run after actions (60) and traits (70) so "Inventario" is the last item.
    function stripOwnItems(items) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i][INJECT_TAG]) items.splice(i, 1);
      }
    }

    SettingsManager.onChange(() => {
      const next = !!SettingsManager.get("feature.inventory-panel.enabled");
      if (next === featureEnabled) return;
      featureEnabled = next;
      ActionBarManager.rerenderCharacterBars();
    });

    ActionBarManager.onCreateBar(
      "inventory-panel",
      (element, items, parentItem = null) => {
        if (!featureEnabled) {
          if (parentItem === null && Array.isArray(items)) stripOwnItems(items);
          return;
        }
        if (parentItem !== null) return;
        if (!Array.isArray(items)) return;

        const charId = resolveCharacterId(element);
        if (!charId) return; // not a character bar

        injectInto(items, charId);
        return;
      },
      { priority: 80 },
    );

    /**
     * Re-trigger the root render of character bars already on the page, so the
     * "Inventario" item shows up even when the multi-level observer rendered a
     * bar before this feature registered its interceptor (same pattern the
     * spell/trait action bars use).
     */
    function reprocessExistingBars() {
      document
        .querySelectorAll(".action-bar[data-sender-info]")
        .forEach((bar) => {
          const senderInfo = bar.getAttribute("data-sender-info") || "";
          if (!/Character-\d+/.test(senderInfo)) return;
          const $primary = $(bar).find(".action-bar-row.primary-bar").first();
          if (!$primary.length) return;
          const elements = $(bar).data("elements");
          if (!Array.isArray(elements)) return;
          window.createBar($primary[0], elements, null, 0);
        });
    }

    reprocessExistingBars();

    // Open the panel when the injected bar item is clicked. The multi-level
    // renderer stores the item JSON on the element's data-action attribute.
    $(document).on(
      "click",
      `.action-bar-element[data-action-type="${ACTION_TYPE}"]`,
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        let charId = null;
        try {
          const raw = $(this).attr("data-action");
          if (raw) charId = JSON.parse(raw).charId;
        } catch (_) {
          /* fall through to DOM resolution */
        }
        if (!charId) charId = resolveCharacterId(this);
        if (charId) openInventoryPanel(charId);
      },
    );
  } catch (error) {
    window._n21_.utils.registerFeatureError("Inventory Panel", error);
  }
})();
