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
      FloatingPanelManager,
      TooltipManager,
      SettingsManager,
    ] = await loadManagers(
      "ActionBarManager",
      "CharacterSheetManager",
      "FloatingPanelManager",
      "TooltipManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.inventory-panel.enabled")) {
      return;
    }

    // Currencies to look for inside a [money:...] token, in display order.
    // Add/replace freely for other game systems; the icon is a bundled asset
    // under src/assets/inventory/currency/. Undeclared currencies are ignored,
    // and any with a zero total are not shown.
    const CURRENCIES = [
      { key: "pp", label: "Platino", icon: "pp.png" },
      { key: "gp", label: "Oro", icon: "gp.png" },
      { key: "ep", label: "Electro", icon: "ep.png" },
      { key: "sp", label: "Plata", icon: "sp.png" },
      { key: "cp", label: "Cobre", icon: "cp.png" },
    ];

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

    /**
     * Parse the money totals from a free-text string by scanning every
     * `[money:...]` token for `<number><currencyKey>` pairs. Only declared
     * currencies are counted; multiple tokens sum together.
     * @param {string} text
     * @returns {Object<string, number>} key -> total
     */
    function parseMoney(text) {
      const totals = {};
      if (typeof text !== "string" || !text) return totals;
      const known = new Set(CURRENCIES.map((c) => c.key.toLowerCase()));
      const tokenRe = /\[money:([^\]]*)\]/gi;
      let token;
      while ((token = tokenRe.exec(text)) !== null) {
        const pairRe = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;
        let pair;
        while ((pair = pairRe.exec(token[1])) !== null) {
          const key = pair[2].toLowerCase();
          if (!known.has(key)) continue;
          totals[key] = (totals[key] || 0) + Number(pair[1]);
        }
      }
      return totals;
    }

    /** Build the money row HTML (only currencies with a positive total). */
    function buildMoneyHtml(totals) {
      const parts = [];
      for (const currency of CURRENCIES) {
        const amount = totals[currency.key.toLowerCase()];
        if (!amount) continue;
        parts.push(
          `<span class="n21-inventory-coin" title="${escapeHtml(currency.label)}">` +
            `<span class="n21-inventory-coin-amount">${escapeHtml(amount)}</span>` +
            `<img class="n21-inventory-coin-icon" src="${assetUrl(
              `currency/${currency.icon}`,
            )}" alt="${escapeHtml(currency.key)}">` +
            `</span>`,
        );
      }
      return parts.join("");
    }

    /* ----------------------------- Inventory ------------------------------ */

    /** Flatten the character's `items` categories into a single ordered list. */
    function collectItems(ph) {
      const items = ph?.items;
      if (!items || typeof items !== "object") return [];
      const flat = [];
      for (const list of Object.values(items)) {
        if (Array.isArray(list)) flat.push(...list);
      }
      return flat;
    }

    /**
     * Build a single read-only inventory cell reusing the native action-bar
     * icon markup (same frame + tooltip), so it looks identical to the bar.
     * @returns {jQuery}
     */
    function buildItemCell(item) {
      const name = item?.name || "";
      const icon = item?.icon_url || "";

      let tooltipHtml = `<h5>${escapeHtml(item?.tooltip_title || name)}</h5>`;
      if (item?.group) tooltipHtml += `<p><em>${escapeHtml(item.group)}</em></p>`;
      if (item?.description)
        tooltipHtml += `<p>${escapeHtml(item.description)}</p>`;
      if (item?.location_text)
        tooltipHtml += `<p><strong>${escapeHtml(item.location_text)}</strong></p>`;

      const imageStyle = icon
        ? `background: url('${encodeURI(icon)}') no-repeat;`
        : "";

      const $cell = $("<div>")
        .addClass("action-bar-element")
        .attr("data-action-type", "none");

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
        </div>
      `);

      const $button = $cell.find(".action-bar-button");
      $button.attr("title", tooltipHtml);
      TooltipManager.process($button[0]);

      return $cell;
    }

    /** Render the grid + money into the panel body. */
    function renderInventory($body, ph) {
      const $grid = $body.find(".n21-inventory-grid");
      $grid.empty();

      const items = collectItems(ph);
      if (!items.length) {
        $grid.append(
          '<div class="n21-inventory-empty">Sin objetos en el inventario.</div>',
        );
      } else {
        items.forEach((item) => $grid.append(buildItemCell(item)));
      }

      const totals = parseMoney(ph?.equipment);
      $body.find(".n21-inventory-money").html(buildMoneyHtml(totals));
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
          const ph = await CharacterSheetManager.fetchCharacter(jsonUrl);
          renderInventory($body, ph);
        } catch (error) {
          window._n21_.utils?.registerFeatureError?.("inventory-panel", error);
          flashButtonTooltip($button, "No se pudo actualizar el inventario.");
        } finally {
          $button.removeClass("loading").prop("disabled", false);
        }
      });
    }

    /** Build the (empty) panel body markup: scrollable grid + sticky footer. */
    function panelBodyHtml() {
      return (
        '<div class="n21-inventory">' +
        '<div class="n21-inventory-grid"></div>' +
        '<div class="n21-inventory-footer">' +
        '<button class="n21-inventory-refresh">' +
        '<i class="fa fa-sync"></i></button>' +
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
        panelBodyHtml(),
        "n21-inventory-panel",
        "width: 269px; height: 420px; min-width: 269px; max-width: 269px; " +
          "min-height: 240px;",
      );
      if (!$panel || !$panel.length) return;

      // If the panel already existed (still open), just refresh its contents.
      const $body = $panel.find(".n21-inventory");
      renderInventory($body, ph);

      // Bind refresh once per freshly created panel.
      if (!$panel.data("n21InventoryBound")) {
        $panel.data("n21InventoryBound", true);
        bindRefresh($panel, charId, jsonUrl);
      }
    }

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

    // Run after actions (60) and traits (70) so "Inventario" is the last item.
    ActionBarManager.onCreateBar(
      "inventory-panel",
      (element, items, parentItem = null) => {
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
