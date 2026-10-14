(() => {
  /* =======================================================================
       Shared action bar layout

       Order and visibility of the ROOT entries of a character's action bar,
       saved per character in this browser. It covers what Nivel20 can't store
       (folders injected by the extension, the default "Pruebas de habilidad" /
       "Tiradas de salvación" position, weapon actions) and is applied to the
       bar right before it's rendered.

       Features that inject root folders give them a stable `n21Key` and
       register a provider so the action bar editor can list them.

       Exposed as `window._n21_.actionBarLayout`:
         registerProvider(id, { order, getEntries(charId) -> [{key,label,icon}] })
         getProviderEntries(charId) -> Promise<[{key,label,icon}]>
         keyOf(item)                 -> stable key of a bar item
         getLayout(charId) / saveLayout(charId, { order: [key], hidden: [key] })
         apply(items, charId)        -> reorders/hides root items in place
    ======================================================================= */

  const STORAGE_PREFIX = "_n21_actionbar-layout:";
  const providers = new Map();

  function registerProvider(id, provider) {
    if (!id || typeof provider?.getEntries !== "function") return;
    providers.set(id, { order: 100, ...provider });
  }

  async function getProviderEntries(charId) {
    const list = [...providers.values()].sort((a, b) => a.order - b.order);
    const results = [];
    for (const provider of list) {
      try {
        const entries = await provider.getEntries(String(charId));
        (entries || []).forEach((e) => e?.key && results.push({ ...e, order: provider.order }));
      } catch (_error) {}
    }
    return results;
  }

  /** Stable key of a bar item: injected folders carry their own. */
  function keyOf(item) {
    if (!item) return null;
    if (item.n21Key) return item.n21Key;
    if (item.id !== undefined && item.id !== null && item.id !== "") return `native:${item.id}`;
    return item.name ? `native-name:${item.name}` : null;
  }

  function getLayout(charId) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + charId);
      const data = raw ? JSON.parse(raw) : null;
      if (!data || typeof data !== "object") return null;
      return {
        order: Array.isArray(data.order) ? data.order : [],
        hidden: Array.isArray(data.hidden) ? data.hidden : [],
      };
    } catch (_error) {
      return null;
    }
  }

  function saveLayout(charId, layout) {
    try {
      localStorage.setItem(
        STORAGE_PREFIX + charId,
        JSON.stringify({ order: layout?.order || [], hidden: layout?.hidden || [] }),
      );
    } catch (_error) {}
  }

  /**
   * Reorder (and hide) root items in place according to the saved layout.
   * Items the layout doesn't know keep their position.
   */
  function apply(items, charId) {
    if (!Array.isArray(items)) return items;
    const layout = getLayout(charId);
    if (!layout) {
      attachIconHolders(items);
      return items;
    }

    const hidden = new Set(layout.hidden);
    // Hidden extension folders take their icon holder with them.
    const hiddenNames = new Set(
      items.filter((it) => it?.n21Key && hidden.has(it.n21Key)).map((it) => it.name),
    );
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      const isHiddenHolder =
        !item?.n21Key && item?.action_type === "none" && hiddenNames.has(item?.name);
      if (hidden.has(keyOf(item)) || isHiddenHolder) items.splice(i, 1);
    }

    const rankOf = (item) => {
      let rank = layout.order.indexOf(keyOf(item));
      if (rank === -1 && item?.name) rank = layout.order.indexOf(`native-name:${item.name}`);
      return rank;
    };
    const slots = [];
    const known = [];
    items.forEach((item, index) => {
      const rank = rankOf(item);
      if (rank !== -1) {
        slots.push(index);
        known.push({ item, rank });
      }
    });
    known.sort((a, b) => a.rank - b.rank);
    slots.forEach((slot, i) => {
      items[slot] = known[i].item;
    });
    attachIconHolders(items, hidden);
    return items;
  }

  /**
   * Extension folders can get an icon from a Nivel20 "Sin acción" action with
   * the same name (the bar merges its icon into the folder). For the merge to
   * happen the holder must come right after the folder; if the folder is
   * hidden, its holder is hidden too.
   */
  function attachIconHolders(items, hidden = new Set()) {
    const isHolder = (item) => !item?.n21Key && item?.action_type === "none";
    for (let i = 0; i < items.length; i += 1) {
      const folder = items[i];
      // Extension folders and Nivel20's default folders (not user records).
      const takesHolder =
        folder?.n21Key ||
        (folder?.action_type === "folder" && folder.id != null && !/^\d+$/.test(String(folder.id)));
      if (!takesHolder) continue;
      const holderIndex = items.findIndex((it) => isHolder(it) && it.name === folder.name);
      if (holderIndex === -1) continue;
      const [holder] = items.splice(holderIndex, 1);
      if (folder.n21Key && hidden.has(folder.n21Key)) {
        if (holderIndex < i) i -= 1;
        continue;
      }
      const at = items.indexOf(folder) + 1;
      items.splice(at, 0, holder);
      if (at <= i) i += 1;
    }
  }

  window._n21_.actionBarLayout = {
    registerProvider,
    getProviderEntries,
    keyOf,
    getLayout,
    saveLayout,
    apply,
  };
})();
