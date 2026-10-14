(async () => {
  try {
    /* =======================
       Feature: Character Frame (Marco de personaje)

       Marco fijo en la esquina superior izquierda del tablero con el
       personaje/criatura seleccionado en el panel de personajes (la misma
       lógica para DM y jugadores): retrato (abre la hoja), nombre, CA, vida,
       estados y recursos.

       - Click en la vida: desplegable con un número y botones Curar, Dañar y
         Temporal. Si el personaje tiene el estado de concentración y recibe
         daño, ofrece tirar la salvación de Constitución.
       - Recursos (espacios de conjuro, "otros recursos" y los recursos
         locales de criaturas): click gasta uno, click derecho recupera uno.

       Todos los cambios usan la misma llamada que el modal nativo de vida.
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      CombatTrackingManager,
      LocalResourcesManager,
      CharacterSheetManager,
      DiceManager,
      TooltipManager,
      SettingsManager,
    ] = await loadManagers(
      "CombatTrackingManager",
      "LocalResourcesManager",
      "CharacterSheetManager",
      "DiceManager",
      "TooltipManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.character-frame.enabled")) {
      return;
    }

    if (!window._n21_.utils.isTabletopUrl()) return;

    const ROOT_ID = "n21-cframe";
    const CONCENTRATION_NAMES = [
      "concentracion",
      "concentrado",
      "concentrada",
      "concentrandose",
    ];

    // Instance shown for creature groups ("2 x Goblin"), per row.
    const selectedInstance = new Map(); // "type:id" -> index
    let current = null; // entry being shown
    let lastRenderKey = "";
    let dropdownOpen = false;

    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
    }

    function formatBonus(value) {
      return value >= 0 ? `+${value}` : `${value}`;
    }

    /* ----------------------- DOM ----------------------- */

    function getContainer() {
      return document.querySelector("#application-canvas")?.parentElement || null;
    }

    function ensureRoot() {
      let root = document.getElementById(ROOT_ID);
      const container = getContainer();
      if (!container) return null;
      if (!root) {
        root = document.createElement("div");
        root.id = ROOT_ID;
        root.className = "n21-cframe";
        root.innerHTML = `
          <div class="n21-cframe-card"></div>
          <div class="n21-cframe-dropdown" hidden></div>
          <div class="n21-cframe-conditions-wrap"></div>`;
        bindEvents(root);
      }
      if (root.parentElement !== container) container.appendChild(root);
      return root;
    }

    /* ----------------------- data ----------------------- */

    function getCurrentEntry() {
      const selected = CombatTrackingManager.getSelectedRow();
      if (!selected) return null;
      const rowKey = `${selected.type}:${selected.id}`;
      const count = CombatTrackingManager.getInstanceCount(selected.type, selected.id);
      let index = selectedInstance.get(rowKey) || 0;
      if (index >= count) index = 0;
      return CombatTrackingManager.getEntry(selected.type, selected.id, index);
    }

    function getLocalResources(entry) {
      // Custom resources only exist for creatures (characters have native ones).
      return entry?.type === "creature"
        ? LocalResourcesManager.getResources(entry.key)
        : [];
    }

    /* ----------------------- render ----------------------- */

    const SHIELD_ICON =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/></svg>';

    const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
    const MAX_PIPS = 6;

    /** Fallback "icon" for resources we don't recognize: their initial. */
    function initialOf(resource) {
      const name = String(resource.label || resource.name || "").trim();
      return (name.match(/[\p{L}\p{N}]/u)?.[0] || "?").toUpperCase();
    }

    /** Roman numeral for spell slots (native, or custom named "... nivel N"). */
    function slotLevel(resource) {
      if (resource.category === "spell_slots") return ROMAN[resource.id] || resource.id;
      if (resource.category === "pact_spell_slots") return ROMAN[resource.id] || resource.id;
      const level = /\bnivel\s*(\d)\b/i.exec(String(resource.label || resource.name || ""));
      return level && ROMAN[level[1]] ? ROMAN[level[1]] : null;
    }

    function buildPips(resource, remaining) {
      if (resource.max > MAX_PIPS) {
        return `<span class="n21-cframe-res-count">${remaining}</span>`;
      }
      // 1-2 in one row, then always two rows (3-4: 2x2, 5-6: 3x2...).
      const cols = resource.max <= 2 ? resource.max : Math.ceil(resource.max / 2);
      return `<span class="n21-cframe-res-pips" style="--n21-pip-cols: ${cols}">${Array.from(
        { length: resource.max },
        (_, i) => `<i class="${i < remaining ? "n21-cframe-pip--on" : ""}"></i>`,
      ).join("")}</span>`;
    }

    function buildResourceHtml(resource, source, editable = true) {
      const remaining = Math.max(resource.max - resource.used, 0);
      const fullName = resource.label || resource.name;
      const attrs =
        source === "native"
          ? `data-source="native" data-category="${escapeHtml(resource.category)}" data-id="${escapeHtml(resource.id)}"`
          : `data-source="local" data-id="${escapeHtml(resource.id)}"`;

      let content;
      const level = slotLevel(resource);
      if (level) {
        // Spell slots: squares in the middle, roman numeral on the top edge.
        content = `
          <span class="n21-cframe-res-top">${escapeHtml(level)}</span>
          ${buildPips(resource, remaining)}`;
      } else {
        // Named resources: icon (or initials) and, if more than one use, the
        // remaining count over the bottom edge.
        const icon = window._n21_.resourceIcons?.match(fullName);
        const glyph = icon
          ? `<span class="n21-cframe-res-icon" style="--n21-res-icon: url('${escapeHtml(
              icon.iconUrl,
            )}'); --n21-res-color: ${icon.color}"></span>`
          : `<span class="n21-cframe-res-initial">${escapeHtml(initialOf(resource))}</span>`;
        content = `${glyph}${
          resource.max > 1 ? `<span class="n21-cframe-res-bottom">${remaining}</span>` : ""
        }`;
      }

      return `
        <button type="button" class="n21-cframe-res ${remaining <= 0 ? "n21-cframe-res--empty" : ""}" ${attrs}
          title="${escapeHtml(
            `<h5>${escapeHtml(fullName)}</h5><p>Quedan ${remaining} de ${resource.max}</p>${
              editable ? "<p><em>Click: gastar · Click derecho: recuperar</em></p>" : ""
            }`,
          )}"
          aria-label="${escapeHtml(fullName)}: quedan ${remaining} de ${resource.max}">
          ${content}
        </button>`;
    }

    function buildConditionsHtml(entry) {
      const items = entry.conditions.map(
        (c) =>
          `<span class="n21-cframe-condition" data-condition-id="${escapeHtml(c.id)}" title="${escapeHtml(
            `<h5>${escapeHtml(c.name)}</h5>${c.summary ? `<p>${escapeHtml(c.summary)}</p>` : ""}${
              entry.editable ? "<p><em>Click derecho: quitar estado</em></p>" : ""
            }`,
          )}">${
            c.icon ? `<img src="${escapeHtml(c.icon)}" alt="${escapeHtml(c.name)}" />` : escapeHtml(c.name)
          }</span>`,
      );
      // Only users allowed to edit the status can add conditions.
      if (entry.editable) {
        items.push(
          `<button type="button" class="n21-cframe-condition n21-cframe-condition-add" title="Agregar estado" aria-label="Agregar estado">+</button>`,
        );
      }
      return items.length ? `<div class="n21-cframe-conditions">${items.join("")}</div>` : "";
    }

    function buildCardHtml(entry) {
      const hpRatio = entry.maxHp > 0 ? Math.min(entry.currentHp / entry.maxHp, 1) : 0;
      const tempRatio = entry.maxHp > 0 ? Math.min(entry.tempHp / entry.maxHp, 1) : 0;
      const hpText = `${entry.currentHp}/${entry.maxHp}${entry.tempHp ? ` +${entry.tempHp}` : ""}`;
      const hpClass =
        hpRatio <= 0 ? "n21-cframe-hp--down" : hpRatio <= 0.5 ? "n21-cframe-hp--bloodied" : "";

      const portrait = entry.imageUrl
        ? `<img src="${escapeHtml(entry.imageUrl)}" alt="" />`
        : `<span class="n21-cframe-portrait-empty">${escapeHtml(entry.name.charAt(0))}</span>`;

      const resources = [
        ...entry.resources.map((r) => buildResourceHtml(r, "native", entry.editable)),
        ...getLocalResources(entry).map((r) => buildResourceHtml(r, "local")),
      ].join("");

      const instances =
        entry.instanceCount > 1
          ? `<div class="n21-cframe-instances" role="group" aria-label="Criatura del grupo">${Array.from(
              { length: entry.instanceCount },
              (_, i) =>
                `<button type="button" class="n21-cframe-instance ${
                  i === entry.index ? "n21-cframe-instance--active" : ""
                }" data-index="${i}">${i + 1}</button>`,
            ).join("")}</div>`
          : "";

      return `
        <div class="n21-cframe-main ${entry.editable ? "" : "n21-cframe--readonly"}">
          <button type="button" class="n21-cframe-portrait" title="Abrir hoja de ${escapeHtml(entry.name)}">
            ${portrait}
          </button>
          <div class="n21-cframe-body">
            <div class="n21-cframe-head">
              <span class="n21-cframe-name">${escapeHtml(entry.name)}</span>
              ${entry.subtitle ? `<span class="n21-cframe-sub">${escapeHtml(entry.subtitle)}</span>` : ""}
              ${
                entry.ac
                  ? `<span class="n21-cframe-ac" title="Clase de armadura">${SHIELD_ICON}<span>${escapeHtml(entry.ac)}</span></span>`
                  : ""
              }
            </div>
            ${instances}
            <button type="button" class="n21-cframe-hp ${hpClass}" ${
              entry.editable ? 'title="Modificar puntos de golpe"' : "disabled"
            } aria-expanded="${dropdownOpen}">
              <span class="n21-cframe-hp-fill" style="width:${hpRatio * 100}%"></span>
              <span class="n21-cframe-hp-temp" style="width:${tempRatio * 100}%"></span>
              <span class="n21-cframe-hp-text">${hpText}</span>
            </button>
          </div>
          ${resources ? `<div class="n21-cframe-resources">${resources}</div>` : ""}
        </div>`;
    }

    function render() {
      const entry = getCurrentEntry();
      const root = ensureRoot();
      if (!root) return;

      if (!entry) {
        current = null;
        lastRenderKey = "";
        root.hidden = true;
        closeDropdown();
        return;
      }

      const renderKey = JSON.stringify([
        entry.key,
        entry.name,
        entry.imageUrl,
        entry.currentHp,
        entry.maxHp,
        entry.tempHp,
        entry.ac,
        entry.editable,
        entry.resources,
        entry.conditions.map((c) => c.name),
        getLocalResources(entry),
      ]);

      if (current?.key !== entry.key) closeDropdown();
      current = entry;
      root.hidden = false;
      if (renderKey === lastRenderKey) return;
      lastRenderKey = renderKey;
      root.querySelector(".n21-cframe-card").innerHTML = buildCardHtml(entry);
      root.querySelector(".n21-cframe-conditions-wrap").innerHTML = buildConditionsHtml(entry);
      // Nivel20's own tooltips instead of plain browser titles; the frame is
      // at the top of the screen, so they open downwards.
      root.querySelectorAll("[title]").forEach((el) => {
        el.dataset.side = "bottom";
      });
      TooltipManager.processAll(root);
    }

    /* ----------------------- HP dropdown ----------------------- */

    function getDropdown() {
      return document.querySelector(`#${ROOT_ID} .n21-cframe-dropdown`);
    }

    function openDropdown() {
      if (!current?.editable) return;
      const dropdown = getDropdown();
      if (!dropdown) return;
      dropdownOpen = true;
      dropdown.hidden = false;
      dropdown.dataset.mode = "hp";
      dropdown.innerHTML = `
        <div class="n21-cframe-hp-form">
          <input type="number" min="0" step="1" inputmode="numeric" class="n21-cframe-hp-input" aria-label="Cantidad" placeholder="0" />
          <button type="button" class="n21-cframe-btn n21-cframe-btn--heal" data-hp-action="heal">Curar</button>
          <button type="button" class="n21-cframe-btn n21-cframe-btn--damage" data-hp-action="damage">Dañar</button>
          <button type="button" class="n21-cframe-btn n21-cframe-btn--temp" data-hp-action="temp">Temporal</button>
        </div>
        <div class="n21-cframe-hp-msg" hidden></div>`;
      dropdown.querySelector("input").focus();
      document.querySelector(`#${ROOT_ID} .n21-cframe-hp`)?.setAttribute("aria-expanded", "true");
    }

    let conditionSearchTimer = null;
    let conditionSearchToken = 0;

    function renderConditionResults(results) {
      const list = getDropdown()?.querySelector(".n21-cframe-cond-results");
      if (!list || !current) return;
      const owned = new Set(current.conditions.map((c) => String(c.id)));
      const available = results.filter((c) => !owned.has(String(c.id)));
      list.innerHTML = available.length
        ? available
            .slice(0, 40)
            .map(
              (c) => `
            <button type="button" class="n21-cframe-cond-option" data-condition-id="${escapeHtml(c.id)}">
              ${c.icon ? `<img src="${escapeHtml(c.icon)}" alt="" />` : "<span></span>"}
              <span>${escapeHtml(c.name)}</span>
            </button>`,
            )
            .join("")
        : `<div class="n21-cframe-cond-empty">Sin resultados</div>`;
      list._results = available;
    }

    function searchConditions(query) {
      clearTimeout(conditionSearchTimer);
      const token = ++conditionSearchToken;
      conditionSearchTimer = setTimeout(async () => {
        try {
          const results = await CombatTrackingManager.searchConditions(query);
          if (token !== conditionSearchToken) return;
          const q = CombatTrackingManager.normalizeText(query);
          renderConditionResults(
            q ? results.filter((c) => CombatTrackingManager.normalizeText(c.name).includes(q)) : results,
          );
        } catch (_error) {
          renderConditionResults([]);
        }
      }, 250);
    }

    function openConditionsDropdown() {
      if (!current?.editable) return;
      const dropdown = getDropdown();
      if (!dropdown) return;
      dropdownOpen = true;
      dropdown.hidden = false;
      dropdown.dataset.mode = "conditions";
      dropdown.innerHTML = `
        <input type="search" class="n21-cframe-cond-input" placeholder="Buscar estado…" aria-label="Buscar estado" autocomplete="off" />
        <div class="n21-cframe-cond-results" role="listbox"><div class="n21-cframe-cond-empty">Buscando…</div></div>`;
      const input = dropdown.querySelector("input");
      input.addEventListener("input", () => searchConditions(input.value));
      input.focus();
      searchConditions("");
    }

    function closeDropdown() {
      const dropdown = getDropdown();
      dropdownOpen = false;
      if (dropdown) {
        dropdown.hidden = true;
        dropdown.innerHTML = "";
      }
      document.querySelector(`#${ROOT_ID} .n21-cframe-hp`)?.setAttribute("aria-expanded", "false");
    }

    function showMessage(html) {
      const msg = getDropdown()?.querySelector(".n21-cframe-hp-msg");
      if (!msg) return;
      msg.hidden = false;
      msg.innerHTML = html;
    }

    async function getConstitutionSaveBonus(entry) {
      if (entry.type === "character" && entry.sheetUrl) {
        try {
          const ph = await CharacterSheetManager.fetchCharacter(entry.sheetUrl);
          const bonus = CharacterSheetManager.getSavingThrowBonus(ph, "con");
          if (bonus !== null) return bonus;
        } catch (_error) {}
      }
      return entry.conModifier || 0;
    }

    async function offerConcentrationSave(entry, damage) {
      const dc = Math.min(Math.max(10, Math.floor(damage / 2)), 30);
      const bonus = await getConstitutionSaveBonus(entry);
      showMessage(`
        <p><b>${escapeHtml(entry.name)}</b> mantiene la concentración. ¿Tirar salvación de Constitución (CD ${dc})?</p>
        <div class="n21-cframe-hp-msg-actions">
          <button type="button" class="n21-cframe-btn n21-cframe-btn--primary" data-concentration="roll"
            data-dc="${dc}" data-bonus="${bonus}">Tirar 1d20${formatBonus(bonus)}</button>
          <button type="button" class="n21-cframe-btn" data-concentration="skip">No</button>
        </div>`);
    }

    async function applyHpAction(action) {
      if (!current) return;
      const dropdown = getDropdown();
      const value = parseInt(dropdown?.querySelector("input")?.value, 10);
      if (!Number.isFinite(value) || value < 0) {
        dropdown?.querySelector("input")?.focus();
        return;
      }

      // Applied optimistically; the manager batches and sends the request.
      const entry = current;
      if (action === "heal") CombatTrackingManager.applyHealing(entry, value);
      if (action === "damage") CombatTrackingManager.applyDamage(entry, value);
      if (action === "temp") CombatTrackingManager.setTempHp(entry, value);

      if (
        action === "damage" &&
        value > 0 &&
        CombatTrackingManager.hasCondition(entry, CONCENTRATION_NAMES)
      ) {
        await offerConcentrationSave(entry, value);
        return;
      }
      closeDropdown();
    }

    /* ----------------------- resources ----------------------- */

    function changeResource(button, delta) {
      if (!current) return;
      const source = button.getAttribute("data-source");
      const id = button.getAttribute("data-id");

      if (source === "local") {
        LocalResourcesManager.changeUsed(current.key, id, delta);
        return;
      }

      if (!current.editable) return;
      const category = button.getAttribute("data-category");
      const resource = current.resources.find((r) => r.category === category && r.id === id);
      if (!resource) return;
      const used = resource.used + delta;
      if (used < 0 || used > resource.max) return;

      CombatTrackingManager.setResourceUsed(current, category, id, used);
    }

    /* ----------------------- events ----------------------- */

    function bindEvents(root) {
      root.addEventListener("click", (event) => {
        const target = event.target;

        if (target.closest(".n21-cframe-portrait")) {
          if (current) CombatTrackingManager.openSheet(current.type, current.id);
          return;
        }

        const instance = target.closest(".n21-cframe-instance");
        if (instance && current) {
          selectedInstance.set(`${current.type}:${current.id}`, Number(instance.dataset.index) || 0);
          render();
          return;
        }

        if (target.closest(".n21-cframe-hp")) {
          if (dropdownOpen && getDropdown()?.dataset.mode === "hp") closeDropdown();
          else openDropdown();
          return;
        }

        if (target.closest(".n21-cframe-condition-add")) {
          if (dropdownOpen && getDropdown()?.dataset.mode === "conditions") closeDropdown();
          else openConditionsDropdown();
          return;
        }

        const option = target.closest(".n21-cframe-cond-option");
        if (option && current) {
          const list = option.closest(".n21-cframe-cond-results");
          const condition = (list?._results || []).find(
            (c) => String(c.id) === option.dataset.conditionId,
          );
          if (condition) CombatTrackingManager.addCondition(current, condition);
          closeDropdown();
          return;
        }

        const hpButton = target.closest("[data-hp-action]");
        if (hpButton) {
          applyHpAction(hpButton.getAttribute("data-hp-action"));
          return;
        }

        const concentration = target.closest("[data-concentration]");
        if (concentration && current) {
          if (concentration.getAttribute("data-concentration") === "roll") {
            const bonus = parseInt(concentration.getAttribute("data-bonus"), 10) || 0;
            const dc = concentration.getAttribute("data-dc");
            DiceManager.roll(`1d20${formatBonus(bonus)}`, {
              name: `Salvación de Constitución (Concentración, CD ${dc})`,
              type: "save",
              senderInfo: current.senderInfo,
            });
          }
          closeDropdown();
          return;
        }

        const resource = target.closest(".n21-cframe-res");
        if (resource) changeResource(resource, 1);
      });

      root.addEventListener("contextmenu", (event) => {
        const condition = event.target.closest(".n21-cframe-condition:not(.n21-cframe-condition-add)");
        if (condition) {
          event.preventDefault();
          // Only users allowed to open Nivel20's status modal can edit.
          if (current?.editable) {
            $(condition).tooltipster?.("close");
            CombatTrackingManager.removeCondition(current, condition.dataset.conditionId);
          }
          return;
        }
        const resource = event.target.closest(".n21-cframe-res");
        if (!resource) return;
        event.preventDefault();
        changeResource(resource, -1);
      });

      root.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDropdown();
      });

      // Keep canvas shortcuts (token hotkeys, camera) from firing while typing.
      ["keydown", "keyup", "keypress"].forEach((type) =>
        root.addEventListener(type, (event) => {
          if (event.target.matches("input")) event.stopPropagation();
        }),
      );

      document.addEventListener("mousedown", (event) => {
        if (dropdownOpen && !event.target.closest(`#${ROOT_ID}`)) closeDropdown();
      });
    }

    CombatTrackingManager.onChange(render);
    LocalResourcesManager.onChange(() => {
      lastRenderKey = "";
      render();
    });
    render();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Character Frame", error);
  }
})();
