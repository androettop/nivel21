(() => {
  /* =======================
       CharacterItemsManager - Character inventory edits (Nivel20 forms)
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};
  const { loadManagers } = window._n21_ || {};

  // Item quantity is stored as a tag in the item description: [qty:3].
  const QTY_TAG = "qty";
  // Edits are applied optimistically and sent once the user stops clicking.
  const SAVE_DEBOUNCE_MS = 700;

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  }

  /**
   * CharacterItemsManager edits a character's inventory and "Otras
   * posesiones" exactly like the character sheet does: it loads Nivel20's own
   * forms (edit item, edit equipment), changes only the needed
   * field and submits them. Nothing outside those forms is ever sent.
   *
   * The printable JSON has no item ids, so items are matched with the sheet
   * page (where the edit/delete links live) by name and order.
   */
  class CharacterItemsManager extends BaseManager {
    constructor() {
      super();
      this._sheetManager = null;
      this._pendingQty = new Map(); // itemId -> { qty, timer, item, charId }
      this._sheetDocs = new Map(); // charId -> Promise<{doc, url}> (until an edit)
      this._listeners = new Set();
    }

    async init() {
      super.init();
      try {
        const [CharacterSheetManager] = await loadManagers("CharacterSheetManager");
        this._sheetManager = CharacterSheetManager;
      } catch (error) {
        console.warn("[CharacterItemsManager] Failed to load managers:", error);
      }
    }

    isReady() {
      return !!this._sheetManager;
    }

    /* ----------------------- quantity tag ----------------------- */

    /**
     * Quantity stored in an item description, or null if it has none.
     * @param {string} description
     * @returns {number|null}
     */
    getQuantity(description) {
      const value = window._n21_.utils.parseTokenTag(String(description || ""), QTY_TAG);
      const n = parseInt(value, 10);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }

    /** Description without the quantity tag (for display). */
    stripQuantity(description) {
      return window._n21_.utils.removeTokenTag(String(description || ""), QTY_TAG);
    }

    /**
     * Set/replace the quantity tag at the end of a text, never removing any
     * other content. Returns null if the result would not fit `maxLength`.
     */
    withQuantity(description, qty, maxLength = null) {
      const text = String(description || "");
      const next = window._n21_.utils.setTokenTag(text, QTY_TAG, Math.max(0, qty));
      if (maxLength && next.length > maxLength) return null;
      return next;
    }

    /* ----------------------- reading ----------------------- */

    /**
     * The character sheet page (item links, equipment form). Cached and shared
     * until something is edited, so opening/refreshing panels doesn't refetch.
     */
    _getSheetDoc(charId) {
      const key = String(charId);
      if (!this._sheetDocs.has(key)) {
        const request = this._fetchDocument(`/characters/${key}`);
        this._sheetDocs.set(key, request);
        request.catch(() => {
          if (this._sheetDocs.get(key) === request) this._sheetDocs.delete(key);
        });
      }
      return this._sheetDocs.get(key);
    }

    _invalidate(charId) {
      this._sheetDocs.delete(String(charId));
      this._sheetManager.invalidate(`/characters/${charId}.json`);
    }

    async _fetchDocument(url) {
      // Nivel20's firewall answers bursts with an empty 202: retry a bit.
      const waits = [2000, 5000];
      for (let attempt = 0; ; attempt += 1) {
        const response = await window._n21_.utils.queuedFetch(url, { credentials: "include" });
        const html = response.ok ? await response.text() : "";
        if (response.ok && response.status !== 202 && html) {
          return {
            doc: new DOMParser().parseFromString(html, "text/html"),
            url: response.url,
          };
        }
        if (attempt >= waits.length) throw new Error(`HTTP ${response.status} at ${url}`);
        await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
      }
    }

    /**
     * Whether the current user can edit this character's equipment: Nivel20
     * only renders the sheet's edit forms for its owner (and the DM).
     * @param {string|number} charId
     * @returns {Promise<boolean>}
     */
    async canEdit(charId) {
      try {
        const { doc } = await this._getSheetDoc(charId);
        return !!doc.querySelector(
          'form[action$="/update_field"] [name="character[attribute]"][value="equipment"]',
        );
      } catch (_error) {
        return false;
      }
    }

    /**
     * Items of a character with their ids, matched to the printable JSON.
     * @param {string|number} charId
     * @returns {Promise<Array<Object>>} JSON items extended with
     *   { itemId, editUrl, deleteUrl, quantity, cleanDescription }
     */
    async getItems(charId) {
      const ph = await this._sheetManager.fetchCharacter(`/characters/${charId}.json`);
      const items = [];
      Object.values(ph?.items || {}).forEach((list) => {
        if (Array.isArray(list)) items.push(...list);
      });

      let links = [];
      try {
        const { doc } = await this._getSheetDoc(charId);
        links = [...doc.querySelectorAll('a[href*="/items/"][href$="/edit"]')].map((a) => {
          const wrapper = a.closest(".accordion-wrapper");
          const editUrl = a.getAttribute("href");
          const deleteLink = wrapper?.querySelector('a[data-method="delete"][href*="/items/"]');
          const match = /\/items\/(\d+)/.exec(editUrl);
          return {
            itemId: match ? match[1] : null,
            name: wrapper?.querySelector(".accordion-title")?.textContent?.trim() || "",
            editUrl,
            deleteUrl: deleteLink?.getAttribute("href") || null,
          };
        });
      } catch (error) {
        console.warn("[CharacterItemsManager] Could not read item ids:", error);
      }

      const used = new Set();
      return items.map((item) => {
        const link = links.find(
          (l, index) => !used.has(index) && normalize(l.name) === normalize(item?.name) && used.add(index),
        );
        const pending = link ? this._pendingQty.get(link.itemId) : null;
        // Items without a declared quantity count as one.
        const quantity = pending ? pending.qty : this.getQuantity(item?.description) ?? 1;
        return {
          ...item,
          itemId: link?.itemId || null,
          editUrl: link?.editUrl || null,
          deleteUrl: link?.deleteUrl || null,
          quantity,
          cleanDescription: this.stripQuantity(item?.description),
        };
      });
    }

    /* ----------------------- writing ----------------------- */

    async _submitForm(form, action) {
      const response = await window._n21_.utils.queuedFetch(action || form.getAttribute("action"), {
        method: "POST",
        credentials: "include",
        body: new URLSearchParams(new FormData(form)),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return true;
    }

    _csrfToken() {
      return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
    }

    /**
     * Change an item's description through its native edit form (all other
     * fields are submitted as Nivel20 filled them).
     */
    async updateItemDescription(item, transform) {
      if (!item?.editUrl) throw new Error("Item without edit link");
      const { doc } = await this._fetchDocument(item.editUrl);
      const form = doc.querySelector('form[action*="/items/"]');
      const field = form?.querySelector('[name="item[description]"]');
      if (!form || !field) throw new Error("Edit form not found");
      const maxLength = parseInt(field.getAttribute("maxlength"), 10) || null;
      const next = transform(field.value || field.textContent || "", maxLength);
      if (next === null || next === undefined) return false;
      field.value = next;
      field.textContent = next;
      await this._submitForm(form);
      return true;
    }

    /**
     * Queue a quantity change (optimistic + debounced): listeners see it
     * right away and a single edit is sent when the user stops clicking.
     */
    setQuantity(charId, item, qty) {
      if (!item?.itemId) return false;
      const value = Math.max(0, parseInt(qty, 10) || 0);
      let pending = this._pendingQty.get(item.itemId);
      if (!pending) {
        pending = { qty: value, timer: null, item, charId };
        this._pendingQty.set(item.itemId, pending);
      }
      pending.qty = value;
      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => this._flushQuantity(item.itemId), SAVE_DEBOUNCE_MS);
      // The caller updates its own UI right away; listeners are notified once
      // the change is saved.
      return true;
    }

    async _flushQuantity(itemId) {
      const pending = this._pendingQty.get(itemId);
      if (!pending) return;
      const qty = pending.qty;
      try {
        await this.updateItemDescription(pending.item, (text, max) =>
          this.withQuantity(text, qty, max),
        );
      } catch (error) {
        console.warn("[CharacterItemsManager] Could not save quantity:", error);
      }
      if (this._pendingQty.get(itemId)?.qty === qty) this._pendingQty.delete(itemId);
      this._invalidate(pending.charId);
      this._notify(pending.charId);
    }

    /** Delete an item the way the sheet's "Eliminar" link does. */
    async deleteItem(charId, item) {
      if (!item?.deleteUrl) throw new Error("Item without delete link");
      const body = new URLSearchParams();
      body.set("_method", "delete");
      body.set("authenticity_token", this._csrfToken());
      const response = await window._n21_.utils.queuedFetch(item.deleteUrl, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this._invalidate(charId);
      this._notify(charId);
      return true;
    }

    /**
     * Change "Otras posesiones" through its native form.
     * @param {string|number} charId
     * @param {(text: string, maxLength: number|null) => string|null} transform
     */
    async updateEquipmentText(charId, transform) {
      // Fresh copy: the form must carry the current text.
      this._sheetDocs.delete(String(charId));
      const { doc } = await this._getSheetDoc(charId);
      const form = doc.querySelector('form[action$="/update_field"] [name="character[attribute]"][value="equipment"]')
        ?.closest("form");
      const field = form?.querySelector('[name="character[value]"]');
      if (!form || !field) throw new Error("No permission to edit equipment");
      const current = field.getAttribute("data-value") ?? field.value ?? "";
      const maxLength = parseInt(field.getAttribute("maxlength"), 10) || null;
      const next = transform(current, maxLength);
      if (next === null || next === undefined) return false;
      field.value = next;
      field.textContent = next;
      await this._submitForm(form);
      this._invalidate(charId);
      this._notify(charId);
      return true;
    }

    /** Forget the cached sheet and tell listeners to reload (manual refresh). */
    refresh(charId) {
      this._invalidate(charId);
      this._notify(charId);
    }

    /* ----------------------- events ----------------------- */

    /** @returns {Function} Unsubscribe. Callback gets (charId). */
    onChange(callback) {
      if (typeof callback !== "function") return () => {};
      this._listeners.add(callback);
      return () => this._listeners.delete(callback);
    }

    _notify(charId) {
      this._listeners.forEach((callback) => {
        try {
          callback(String(charId));
        } catch (error) {
          console.warn("[CharacterItemsManager] listener error:", error);
        }
      });
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("CharacterItemsManager", CharacterItemsManager);
})();
