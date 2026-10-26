(async () => {
  try {
    /* =======================
       Feature: Resource Actions (Acciones que modifican recursos)

       Una acción de la barra puede cambiar recursos del personaje/criatura
       con etiquetas en su descripción:
         [resource Nombre +1]   suma uno a lo que queda
         [resource Nombre -1]   resta uno
         [resource Nombre 3]    deja el valor en 3
       El nombre puede ir entre comillas ("Canalizar divinidad") o con guiones
       bajos en vez de espacios (Canalizar_divinidad); mayúsculas y tildes no
       importan. Las etiquetas se quitan de la descripción que se muestra.

       Al hacer click en la acción, los cambios usan la misma lógica que los
       recursos del marco de personaje (agrupados, con guardado diferido y
       actualización inmediata en pantalla).
    ======================= */

    const { loadManagers } = window._n21_;

    const [ActionBarManager, SettingsManager] = await loadManagers("ActionBarManager", "SettingsManager");

    if (!SettingsManager.get("feature.resource-actions.enabled")) {
      return;
    }

    const TAG_RE = /\[resource\s+(?:"([^"\]]+)"|([^\s\]]+))\s+([+-]?\d+)\s*\]/gi;
    const OPS_KEY = "n21_resource_ops";

    /** The resource changes written in a text: [{ name, mode, value }]. */
    function parseOps(text) {
      const ops = [];
      if (typeof text !== "string" || !text.includes("[resource")) return ops;
      TAG_RE.lastIndex = 0;
      let match;
      while ((match = TAG_RE.exec(text)) !== null) {
        const name = (match[1] || match[2].replace(/_/g, " ")).trim();
        const raw = match[3];
        ops.push({
          name,
          mode: /^[+-]/.test(raw) ? "add" : "set",
          value: parseInt(raw, 10),
        });
      }
      return ops;
    }

    /** The text without the tags (and without paragraphs left empty). */
    function stripTags(text) {
      return text
        .replace(TAG_RE, "")
        .replace(/<p>\s*<\/p>/g, "")
        .trim();
    }

    /** Move the tags of every item (and its children) to OPS_KEY. */
    function annotate(items) {
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const ops = parseOps(item.description);
        if (ops.length) {
          item[OPS_KEY] = ops;
          item.description = stripTags(item.description);
        }
        annotate(item.elements);
      });
    }

    // After the injecting features (50-80) and the editor's layout (90),
    // before the tabbed (95) and multi-level (100) bars render them.
    ActionBarManager.onCreateBar(
      "resource-actions",
      (element, items) => {
        annotate(items);
      },
      { priority: 92 },
    );
    // Bars drawn before this loaded still show the tags.
    ActionBarManager.rerenderCharacterBars();

    // Only needed to apply the changes (on the tabletop).
    let CombatTrackingManager, LocalResourcesManager, TokenManager;
    const trackingReady = loadManagers("CombatTrackingManager", "LocalResourcesManager", "TokenManager").then(
      (managers) => {
        [CombatTrackingManager, LocalResourcesManager, TokenManager] = managers;
      },
    );

    /* ----------------------- applying ----------------------- */

    /**
     * The tracked entry of a bar ("Character-123" → character 123). For a
     * creature group, the creature of the selected token.
     */
    function entryForBar(bar) {
      const match = /^([A-Za-z]+)-(\d+)/.exec(bar?.getAttribute("data-sender-info") || "");
      if (!match) return null;
      const type = match[1].toLowerCase();
      const id = match[2];
      return CombatTrackingManager.getEntry(type, id, selectedInstance(type, id));
    }

    function selectedInstance(type, id) {
      if (CombatTrackingManager.getInstanceCount(type, id) <= 1) return 0;
      const ids = TokenManager.getSelectedTokenIds();
      if (ids.length !== 1) return 0;
      const assignments = TokenManager.getAllTokenIds()
        .map((networkId) => ({ networkId, ...TokenManager.getLinkedRow(networkId) }))
        .filter((a) => a.rowId);
      return CombatTrackingManager.mapTokensToEntries(assignments).get(ids[0])?.index || 0;
    }

    /** Uses left after an op (clamped to 0..max). */
    function nextRemaining(op, remaining, max) {
      const value = op.mode === "add" ? remaining + op.value : op.value;
      return Math.min(Math.max(value, 0), max);
    }

    function applyOps(entry, ops) {
      const normalize = (text) => CombatTrackingManager.normalizeText(text);
      ops.forEach((op) => {
        const wanted = normalize(op.name);
        const native = entry.resources.find((r) => normalize(r.label) === wanted);
        if (native) {
          // Re-read: earlier ops of this click are already pending.
          const fresh = CombatTrackingManager.getEntry(entry.type, entry.id, entry.index);
          const resource = fresh?.resources.find((r) => r.category === native.category && r.id === native.id);
          if (!resource) return;
          const remaining = nextRemaining(op, resource.max - resource.used, resource.max);
          CombatTrackingManager.setResourceUsed(fresh, resource.category, resource.id, resource.max - remaining);
          return;
        }
        // Creatures: the extension's own resources.
        if (entry.type !== "creature") return;
        const local = LocalResourcesManager.getResources(entry.key).find((r) => normalize(r.name) === wanted);
        if (!local) return;
        const remaining = nextRemaining(op, local.max - local.used, local.max);
        LocalResourcesManager.updateResource(entry.key, local.id, { used: local.max - remaining });
      });
    }

    // Native bars and the tabbed bar share the .action-bar-element markup.
    // Capture phase: the bars stop the click once they've rolled the dice
    // (the tabbed bar's anti-spam, also on capture, still runs first).
    window.addEventListener(
      "click",
      async (event) => {
        const element = event.target.closest?.(".action-bar-element[data-action]");
        if (!element) return;
        let action;
        try {
          action = JSON.parse(element.getAttribute("data-action"));
        } catch (_error) {
          return;
        }
        const ops = action?.[OPS_KEY];
        if (!Array.isArray(ops) || !ops.length) return;
        const bar = element.closest(".action-bar, .n21-tbar");
        await trackingReady;
        const entry = entryForBar(bar);
        if (entry) applyOps(entry, ops);
      },
      true,
    );
  } catch (error) {
    window._n21_.utils.registerFeatureError("Resource Actions", error);
  }
})();
