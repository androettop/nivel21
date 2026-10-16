(async () => {
  try {
    /* =======================
       Feature: Creature Resources (Recursos de criaturas)

       Ventana del DM para crear recursos con casillas (espacios de conjuro,
       usos de rasgos, acciones legendarias...) para las criaturas del panel
       de personajes, que en Nivel20 no tienen recursos propios. Se guardan
       solo en el navegador del DM (por campaña) y también se muestran en el
       marco de personaje al seleccionar la criatura.
    ======================= */

    const { loadManagers } = window._n21_;

    const [
      CombatTrackingManager,
      LocalResourcesManager,
      FloatingPanelManager,
      MainMenuUIManager,
      CanvasDropdownManager,
      PlayerManager,
      TokenManager,
      SettingsManager,
    ] = await loadManagers(
      "CombatTrackingManager",
      "LocalResourcesManager",
      "FloatingPanelManager",
      "MainMenuUIManager",
      "CanvasDropdownManager",
      "PlayerManager",
      "TokenManager",
      "SettingsManager",
    );

    if (!SettingsManager.get("feature.creature-resources.enabled")) {
      return;
    }

    if (!PlayerManager.isGameMaster()) return;

    const PANEL_TITLE = "Recursos de criaturas";
    const PANEL_ICON = "ft-grid";
    const PANEL_COLOR = "#822020";
    const PANEL_CLASS = "n21-cres-panel";
    const PANEL_STYLE =
      "min-width: 300px; width: 360px; max-width: 520px; min-height: 280px; height: 460px; max-height: 90vh;";

    let selectedKey = null;

    function escapeHtml(value) {
      const div = document.createElement("div");
      div.textContent = String(value ?? "");
      return div.innerHTML;
    }

    function getPanel() {
      return $(`.floating-panel[data-title="${PANEL_TITLE}"]`);
    }

    function getCreatures() {
      return CombatTrackingManager.getEntries().filter((e) => e.type === "creature");
    }

    function defaultKey(creatures) {
      const selected = CombatTrackingManager.getSelectedRow();
      if (selected?.type === "creature") {
        const match = creatures.find((c) => c.type === selected.type && c.id === selected.id);
        if (match) return match.key;
      }
      return creatures[0]?.key || null;
    }

    function buildBoxes(resource) {
      return Array.from({ length: resource.max }, (_, i) => {
        const used = i < resource.used;
        return `<button type="button" class="n21-cres-box ${used ? "n21-cres-box--used" : ""}"
          data-index="${i + 1}" aria-pressed="${used}" aria-label="Casilla ${i + 1} de ${resource.max}"></button>`;
      }).join("");
    }

    function buildHtml() {
      const creatures = getCreatures();
      if (!creatures.some((c) => c.key === selectedKey)) selectedKey = defaultKey(creatures);

      if (!creatures.length) {
        return `<div class="n21-cres-empty">Agrega criaturas al registro de combate para crearles recursos.</div>`;
      }

      const options = creatures
        .map(
          (c) =>
            `<option value="${escapeHtml(c.key)}" ${c.key === selectedKey ? "selected" : ""}>${escapeHtml(c.name)}</option>`,
        )
        .join("");

      const resources = LocalResourcesManager.getResources(selectedKey);
      const list = resources.length
        ? resources
            .map(
              (r) => `
            <div class="n21-cres-row" data-id="${escapeHtml(r.id)}">
              <div class="n21-cres-row-head">
                <input type="text" class="n21-cres-name" value="${escapeHtml(r.name)}" maxlength="60" aria-label="Nombre del recurso" />
                <span class="n21-cres-count">${r.max - r.used}/${r.max}</span>
                <button type="button" class="n21-cres-remove" title="Eliminar recurso" aria-label="Eliminar recurso">&times;</button>
              </div>
              <div class="n21-cres-boxes">${buildBoxes(r)}</div>
            </div>`,
            )
            .join("")
        : `<div class="n21-cres-empty">Esta criatura no tiene recursos. Crea uno abajo (por ejemplo «Conjuros de nivel 1» con 4 casillas).</div>`;

      const copyOptions = creatures
        .filter((c) => c.key !== selectedKey)
        .map((c) => `<option value="${escapeHtml(c.key)}">${escapeHtml(c.name)}</option>`)
        .join("");

      return `
        <div class="n21-cres">
          <label class="n21-cres-label" for="n21-cres-creature">Criatura</label>
          <select id="n21-cres-creature" class="form-control n21-cres-select">${options}</select>
          <div class="n21-cres-list">${list}</div>
          <form class="n21-cres-add" autocomplete="off">
            <input type="text" class="form-control n21-cres-add-name" placeholder="Nuevo recurso" maxlength="60" aria-label="Nombre del nuevo recurso" required />
            <input type="number" class="form-control n21-cres-add-max" value="3" min="1" max="99" aria-label="Cantidad de casillas" title="Cantidad de casillas" />
            <button type="submit" class="btn btn-success n21-cres-add-btn">Crear</button>
          </form>
          <div class="n21-cres-footer">
            <button type="button" class="btn n21-btn-neutral n21-cres-restore" ${resources.length ? "" : "disabled"}>Recuperar todo</button>
            ${
              copyOptions && resources.length
                ? `<select class="form-control n21-cres-copy" aria-label="Copiar recursos a otra criatura">
                     <option value="">Copiar a…</option>${copyOptions}
                   </select>`
                : ""
            }
          </div>
        </div>`;
    }

    function render() {
      const $panel = getPanel();
      if (!$panel.length) return;
      const $block = $panel.find(".floating-block").first();
      // Don't wipe a field the DM is typing in.
      const focused = document.activeElement;
      if (focused && $block[0]?.contains(focused) && focused.matches("input[type=text]")) return;
      $block.html(buildHtml());
    }

    function openPanel(key) {
      if (key) selectedKey = key;
      let $panel = getPanel();
      if (!$panel.length) {
        $panel = FloatingPanelManager.openStaticPanelWithHtml(
          PANEL_TITLE,
          PANEL_ICON,
          PANEL_COLOR,
          "",
          PANEL_CLASS,
          PANEL_STYLE,
        );
        bindPanel($panel);
      }
      $panel.find(".floating-block").first().html(buildHtml());
    }

    function rowId(el) {
      return $(el).closest(".n21-cres-row").attr("data-id");
    }

    function bindPanel($panel) {
      $panel.on("change", ".n21-cres-select", function () {
        selectedKey = this.value;
        render();
      });

      $panel.on("click", ".n21-cres-box", function () {
        const id = rowId(this);
        const resource = LocalResourcesManager.getResources(selectedKey).find((r) => r.id === id);
        if (!resource) return;
        // Same behavior as Nivel20's slot checks: clicking a used box frees it
        // (and the ones after it); clicking a free box spends up to it.
        const index = Number(this.dataset.index);
        const used = index <= resource.used ? index - 1 : index;
        LocalResourcesManager.updateResource(selectedKey, id, { used });
      });

      $panel.on("change", ".n21-cres-name", function () {
        LocalResourcesManager.updateResource(selectedKey, rowId(this), { name: this.value });
      });

      $panel.on("click", ".n21-cres-remove", function () {
        LocalResourcesManager.removeResource(selectedKey, rowId(this));
      });

      $panel.on("submit", ".n21-cres-add", function (event) {
        event.preventDefault();
        const name = $(this).find(".n21-cres-add-name").val();
        const max = parseInt($(this).find(".n21-cres-add-max").val(), 10);
        if (!String(name || "").trim() || !(max > 0)) return;
        $(this).find(".n21-cres-add-name").val("").blur();
        LocalResourcesManager.addResource(selectedKey, { name, max });
      });

      $panel.on("click", ".n21-cres-restore", () => {
        LocalResourcesManager.restoreAll(selectedKey);
      });

      $panel.on("change", ".n21-cres-copy", function () {
        const target = this.value;
        if (!target) return;
        const name = $(this).find("option:selected").text();
        const existing = LocalResourcesManager.getResources(target).length;
        if (existing && !window.confirm(`${name} ya tiene recursos. ¿Reemplazarlos?`)) {
          this.value = "";
          return;
        }
        LocalResourcesManager.copyResources(selectedKey, target);
        selectedKey = target;
        render();
      });

      // Keep canvas shortcuts from firing while typing in the panel.
      $panel.on("keydown keyup keypress", "input", (event) => event.stopPropagation());
    }

    LocalResourcesManager.onChange(render);
    CombatTrackingManager.onChange(() => {
      // Only re-render if the list of creatures changed.
      const $select = getPanel().find(".n21-cres-select");
      if (!$select.length) return;
      const keys = getCreatures().map((c) => c.key).join(",");
      const shown = $select.find("option").map((_, o) => o.value).get().join(",");
      if (keys !== shown) render();
    });

    // Token context menu: open the resources of the creature assigned to it.
    function getTokenCreatureKey(networkId) {
      // The creature of the group this token is assigned to.
      const assignments = TokenManager.getAllTokenIds()
        .map((id) => ({ networkId: id, ...TokenManager.getLinkedRow(id) }))
        .filter((a) => a.rowId);
      const ref = CombatTrackingManager.mapTokensToEntries(assignments).get(networkId);
      if (!ref || ref.type !== "creature") return null;
      const entry = getCreatures().find((c) => c.id === ref.id && c.index === ref.index);
      return entry ? entry.key : null;
    }

    CanvasDropdownManager.registerOption({
      id: "n21-creature-resources",
      label: "Recursos de la criatura",
      showOn: ["token"],
      order: 62,
      gameMasterOnly: true,
      singleSelectionOnly: true,
      isVisible: (context) =>
        !!context?.tokenNetworkId && !!getTokenCreatureKey(context.tokenNetworkId),
      onClick: (context) => openPanel(getTokenCreatureKey(context.tokenNetworkId)),
    });

    const header = await MainMenuUIManager.addHeader("Nivel 21", {
      id: "n21-menu-header",
    });

    await MainMenuUIManager.addItem(
      {
        id: "n21-creature-resources-panel",
        title: PANEL_TITLE,
        iconClass: PANEL_ICON,
        order: 19,
        onClick: () => openPanel(),
      },
      { afterElement: header },
    );
  } catch (error) {
    window._n21_.utils.registerFeatureError("Creature Resources", error);
  }
})();
