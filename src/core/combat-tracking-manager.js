(() => {
  /* =======================
       CombatTrackingManager - Combat tracking panel ("Registro de combate")
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  const TRACKING_SELECTOR = ".combat-tracking";
  const ROWS_SELECTOR = "#tracking-rows";
  const CHARACTER_ROW_SELECTOR = ".character-row[data-row-id][data-row-type]";
  const HEALTH_BAR_SELECTOR = ".progress.health-bar[data-row-id][data-row-type]";

  // Edits are applied optimistically and sent once the user stops clicking.
  const SAVE_DEBOUNCE_MS = 600;

  /**
   * Normalize free text for comparisons: lowercase, no accents/diacritics,
   * collapsed whitespace. Conditions are matched by name with this (never by
   * id, ids differ between game systems).
   * @param {*} value
   * @returns {string}
   */
  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function toInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * CombatTrackingManager wraps Nivel20's combat tracking panel: it reads each
   * character/creature state (HP, AC, resources, conditions) from the panel
   * and writes changes through the very same endpoint the native "edit
   * health" modal uses (`{base-url}/set_row_status`), so nothing the server
   * doesn't already support is ever sent.
   */
  class CombatTrackingManager extends BaseManager {
    constructor() {
      super();
      this._listeners = new Set();
      this._observer = null;
      this._notifyTimer = null;
      // key -> { changes: {currentHp, tempHp, used}, timer, inFlight, version }
      this._pending = new Map();
    }

    async init() {
      super.init();
      this._statusData = null; // last payload of Nivel20's campaign status
      this._hookStatusRefresh();
    }

    /**
     * Keep a copy of every campaign status payload Nivel20 applies to the
     * panel (it includes rows this client may not see in its panel).
     * @private
     */
    _hookStatusRefresh() {
      const original = window.refreshCampaignStatus;
      if (typeof original !== "function") {
        setTimeout(() => this._hookStatusRefresh(), 1000);
        return;
      }
      if (original.__n21Hooked) return;
      const self = this;
      const hooked = function (data, ...args) {
        if (data && typeof data === "object") self._statusData = data;
        const result = original.call(this, data, ...args);
        self._scheduleNotify();
        return result;
      };
      hooked.__n21Hooked = true;
      window.refreshCampaignStatus = hooked;

      // Initial snapshot: the same request the panel makes to refresh itself.
      const baseUrl = this.getBaseUrl();
      if (baseUrl) {
        $.ajax({ url: `${baseUrl}/status`, type: "get", dataType: "json" })
          .done((data) => {
            if (!this._statusData) this._statusData = data;
            this._scheduleNotify();
          })
          .fail(() => {});
      }
    }

    /**
     * Resolve a row id (as stored in a token's [char:id] tag) to its type.
     * Rows visible in the panel win; otherwise the last status payload is
     * used (it may include rows hidden from this client).
     * @param {string} rowId
     * @returns {{type: string, id: string}|null}
     */
    resolveRow(rowId) {
      const id = String(rowId || "").trim();
      if (!id) return null;
      for (const type of ["character", "creature"]) {
        if (this._getRow(type, id).length) return { type, id };
      }
      if (this._statusData?.characters?.[id]) return { type: "character", id };
      if (this._statusData?.creatures?.[id]) return { type: "creature", id };
      return null;
    }

    /**
     * Conditions of an entry, read from the panel when visible or from the
     * last campaign status payload otherwise.
     * @returns {Array<Object>}
     */
    getConditions(type, id, index = 0) {
      const entry = this.getEntry(type, id, index);
      if (entry) return entry.conditions;
      const group = type === "creature" ? this._statusData?.creatures : this._statusData?.characters;
      const status = group?.[id];
      if (!status) return [];
      const instance = status.list ? status.list[index] || status.list[String(index)] : status;
      return Array.isArray(instance?.conditions) ? instance.conditions : [];
    }

    /**
     * Map tokens assigned to rows (via [char:id]) to concrete entries. Tokens
     * assigned to the same creature group are spread over its instances in a
     * stable order (sorted by networkId) so every client agrees.
     * @param {Array<{networkId: string, rowId: string}>} assignments
     * @returns {Map<string, {type: string, id: string, index: number}>}
     */
    mapTokensToEntries(assignments) {
      const result = new Map();
      const byRow = new Map();
      (assignments || []).forEach(({ networkId, rowId }) => {
        const row = this.resolveRow(rowId);
        if (!row || !networkId) return;
        const key = `${row.type}:${row.id}`;
        if (!byRow.has(key)) byRow.set(key, { row, ids: [] });
        byRow.get(key).ids.push(networkId);
      });
      byRow.forEach(({ row, ids }) => {
        ids.sort().forEach((networkId, i) => {
          const count = this.getInstanceCount(row.type, row.id);
          result.set(networkId, { ...row, index: count > 1 ? i % count : 0 });
        });
      });
      return result;
    }

    isReady() {
      return typeof window.$ === "function";
    }

    normalizeText(value) {
      return normalizeText(value);
    }

    /**
     * Base URL of the campaign tracking endpoints
     * (e.g. /games/dnd-2024/campaigns/140706-test).
     * @returns {string|null}
     */
    getBaseUrl() {
      return $(TRACKING_SELECTOR).data("base-url") || null;
    }

    /**
     * Key identifying a tracked entry ("character:123:0").
     */
    entryKey(type, id, index = 0) {
      return `${type}:${id}:${index || 0}`;
    }

    parseEntryKey(key) {
      const [type, id, index] = String(key || "").split(":");
      if (!type || !id) return null;
      return { type, id, index: toInt(index, 0) };
    }

    _getRow(type, id) {
      return $(
        `${ROWS_SELECTOR} ${CHARACTER_ROW_SELECTOR}[data-row-type="${type}"][data-row-id="${id}"]`,
      ).first();
    }

    _getHealthBar(type, id, index = 0) {
      const $bars = $(
        `${ROWS_SELECTOR} ${HEALTH_BAR_SELECTOR}[data-row-type="${type}"][data-row-id="${id}"]`,
      );
      if ($bars.length <= 1) return $bars.first();
      const $match = $bars.filter(function () {
        return toInt($(this).data("row-index"), 0) === toInt(index, 0);
      });
      return ($match.length ? $match : $bars).first();
    }

    /**
     * Character/creature row currently selected (the one whose action bar is
     * open), as { type, id } or null.
     */
    getSelectedRow() {
      const $row = $(`${ROWS_SELECTOR} ${CHARACTER_ROW_SELECTOR}.selected`).first();
      if (!$row.length) return null;
      return { type: $row.attr("data-row-type"), id: $row.attr("data-row-id") };
    }

    /**
     * Whether this client can see a given character/creature in its panel.
     */
    isRowVisible(type, id) {
      return this._getRow(type, id).length > 0;
    }

    /**
     * Number of instances (creature groups like "2 x Goblin" have several).
     */
    getInstanceCount(type, id) {
      return Math.max(
        $(`${ROWS_SELECTOR} ${HEALTH_BAR_SELECTOR}[data-row-type="${type}"][data-row-id="${id}"]`)
          .length,
        1,
      );
    }

    _readAttribute($row, shortName) {
      let value = null;
      $row.find(".character-attr .mod-box").each(function () {
        const name = normalizeText($(this).find(".name").first().text());
        if (name === normalizeText(shortName)) {
          value = $(this).find(".modifier").first().text().trim();
          return false;
        }
        return undefined;
      });
      return value;
    }

    /**
     * Full state of a tracked entry, or null if it's not in the panel.
     * @returns {Object|null}
     */
    getEntry(type, id, index = 0) {
      const entry = this._readEntry(type, id, index);
      if (!entry) return null;
      const pending = this._pending.get(entry.key);
      return pending ? this._applyChanges(entry, pending.changes) : entry;
    }

    /**
     * Entry as currently stored by Nivel20 (no pending local edits).
     * @private
     */
    _readEntry(type, id, index = 0) {
      const $row = this._getRow(type, id);
      const $bar = this._getHealthBar(type, id, index);
      if (!$row.length || !$bar.length) return null;

      const data = $bar.data() || {};
      const status = (typeof data.status === "object" && data.status) || {};
      const resourcesDef = (typeof data.resources === "object" && data.resources) || {};
      const usedResources = status.resources || {};

      const baseMaxHp = toInt(data.maxHp, 0);
      const customMaxHp = data.customMaxHp ?? status.max_hp ?? null;
      const maxHp = customMaxHp ? toInt(customMaxHp, baseMaxHp) : baseMaxHp;
      const currentHp = toInt(data.currentHp, maxHp);
      const tempHp = toInt(data.tempHp, 0);

      const resources = [];
      const slotLabels = {
        spell_slots: "Nivel",
        pact_spell_slots: "Pacto",
      };
      Object.keys(slotLabels).forEach((category) => {
        const def = resourcesDef[category];
        if (!def || typeof def !== "object") return;
        Object.keys(def).forEach((slotId) => {
          // "prepared_spells" is a count of prepared spells, not a slot.
          if (!/^\d+$/.test(slotId)) return;
          const max = toInt(def[slotId], 0);
          if (max <= 0) return;
          resources.push({
            category,
            id: slotId,
            label: `${slotLabels[category]} ${slotId}`,
            max,
            used: Math.min(toInt((usedResources[category] || {})[slotId], 0), max),
          });
        });
      });
      (Array.isArray(resourcesDef.other) ? resourcesDef.other : []).forEach((res) => {
        const max = toInt(res?.max_value, 0);
        if (!res?.name || max <= 0) return;
        resources.push({
          category: "other",
          id: res.name,
          label: res.name,
          max,
          used: Math.min(toInt((usedResources.other || {})[res.name], 0), max),
        });
      });

      const conModifier = /\(([+-]?\d+)\)/.exec(this._readAttribute($row, "Con") || "");
      const instanceCount = this.getInstanceCount(type, id);
      const rowName = $row.find(".char-name").first().text().trim();

      return {
        key: this.entryKey(type, id, index),
        type,
        id: String(id),
        index: toInt(index, 0),
        name: String(data.name || rowName || ""),
        subtitle: $row
          .find(".character-desc .text-muted")
          .map(function () {
            return $(this).text().trim();
          })
          .get()
          .filter(Boolean)
          .join(" "),
        imageUrl: $row.find(".char-details img").first().attr("src") || "",
        sheetUrl: $row.find(".char-name a, .char-details a").first().attr("href") || "",
        senderInfo: $row.attr("data-sender-info") || "",
        editable: $bar.hasClass("editable"),
        instanceCount,
        currentHp,
        maxHp,
        baseMaxHp,
        customMaxHp: customMaxHp ? toInt(customMaxHp, null) : null,
        tempHp,
        ac: this._readAttribute($row, "CA"),
        conModifier: conModifier ? toInt(conModifier[1], 0) : 0,
        resources,
        conditions: Array.isArray(status.conditions) ? status.conditions : [],
        notes: status.notes || "",
        _rowIndex: data.rowIndex,
        _usedResources: usedResources,
        _resourcesDef: resourcesDef,
      };
    }

    /**
     * All tracked entries visible to this client.
     * @returns {Array<Object>}
     */
    getEntries() {
      const entries = [];
      $(`${ROWS_SELECTOR} ${HEALTH_BAR_SELECTOR}`).each((_, el) => {
        const $el = $(el);
        const entry = this.getEntry(
          $el.attr("data-row-type"),
          $el.attr("data-row-id"),
          toInt($el.data("row-index"), 0),
        );
        if (entry) entries.push(entry);
      });
      return entries;
    }

    /**
     * Whether an entry has a condition, matched by name (case/accent
     * insensitive).
     * @param {Object} entry
     * @param {string|string[]} names
     */
    hasCondition(entry, names) {
      const wanted = (Array.isArray(names) ? names : [names]).map(normalizeText);
      return (entry?.conditions || []).some((condition) =>
        wanted.includes(normalizeText(condition?.name)),
      );
    }

    /**
     * Overlay pending (not yet saved) changes on an entry.
     * @private
     */
    _applyChanges(entry, changes) {
      const next = { ...entry };
      if (changes.currentHp !== undefined) next.currentHp = changes.currentHp;
      if (changes.tempHp !== undefined) next.tempHp = changes.tempHp;
      const used = changes.used || {};
      next.resources = entry.resources.map((r) => {
        const value = used[r.category]?.[r.id];
        return value === undefined ? r : { ...r, used: value };
      });
      next._usedResources = { ...entry._usedResources };
      Object.entries(used).forEach(([category, values]) => {
        next._usedResources[category] = { ...(next._usedResources[category] || {}), ...values };
      });
      next.pending = true;
      return next;
    }

    /**
     * Queue a change: listeners see it right away (optimistic update) and it
     * is sent to Nivel20 once no more changes arrive for SAVE_DEBOUNCE_MS, so
     * spamming clicks results in a single request. If the request fails, the
     * pending change is dropped and the real state shows again.
     * @param {Object} entry - From getEntry
     * @param {Object} changes - { currentHp, tempHp, used: {category: {id: n}} }
     * @returns {boolean} True if queued
     */
    queueStatus(entry, changes = {}) {
      if (!entry?.key) return false;
      let pending = this._pending.get(entry.key);
      if (!pending) {
        pending = {
          type: entry.type,
          id: entry.id,
          index: entry.index,
          changes: {},
          timer: null,
          inFlight: false,
          version: 0,
        };
        this._pending.set(entry.key, pending);
      }

      const merged = { ...pending.changes };
      if (changes.currentHp !== undefined) merged.currentHp = changes.currentHp;
      if (changes.tempHp !== undefined) merged.tempHp = changes.tempHp;
      if (changes.used) {
        merged.used = { ...(merged.used || {}) };
        Object.entries(changes.used).forEach(([category, values]) => {
          merged.used[category] = { ...(merged.used[category] || {}), ...values };
        });
      }
      pending.changes = merged;
      pending.version += 1;

      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => this._flush(entry.key), SAVE_DEBOUNCE_MS);
      this._notifyNow();
      return true;
    }

    async _flush(key) {
      const pending = this._pending.get(key);
      if (!pending) return;
      if (pending.inFlight) {
        // One request at a time per entry; retry when the current one ends.
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => this._flush(key), SAVE_DEBOUNCE_MS);
        return;
      }

      const base = this._readEntry(pending.type, pending.id, pending.index);
      if (!base) {
        this._pending.delete(key);
        this._notifyNow();
        return;
      }

      const sentVersion = pending.version;
      pending.inFlight = true;
      const ok = await this.setStatus(base, pending.changes);
      pending.inFlight = false;

      if (pending.version === sentVersion) {
        // Nothing new arrived meanwhile: the panel now has the saved values
        // (or the old ones if it failed, which reverts the optimistic edit).
        this._pending.delete(key);
      } else if (!ok) {
        // Keep the newer edits; they'll be retried by their own timer.
      }
      if (!ok) {
        console.warn("[CombatTrackingManager] Could not save status for", key);
      }
      this._notifyNow();
    }

    /**
     * Send a new status for an entry through Nivel20's set_row_status, keeping
     * every field not being changed exactly as it is now.
     * @param {Object} entry - From getEntry
     * @param {Object} changes - { currentHp, tempHp, used: {category: {id: n}} }
     * @returns {Promise<boolean>}
     */
    async setStatus(entry, changes = {}) {
      const baseUrl = this.getBaseUrl();
      if (!baseUrl || !entry) return false;

      const currentHp = changes.currentHp ?? entry.currentHp;
      const tempHp = changes.tempHp ?? entry.tempHp;

      // Same shape the native modal sends: every slot row with its used count.
      const resources = {};
      const def = entry._resourcesDef || {};
      const used = entry._usedResources || {};
      ["spell_slots", "pact_spell_slots"].forEach((category) => {
        if (!def[category]) return;
        resources[category] = {};
        Object.keys(def[category]).forEach((slotId) => {
          resources[category][slotId] = toInt((used[category] || {})[slotId], 0);
        });
      });
      if (Array.isArray(def.other)) {
        resources.other = {};
        def.other.forEach((res) => {
          resources.other[res.name] = toInt((used.other || {})[res.name], 0);
        });
      }
      Object.entries(changes.used || {}).forEach(([category, values]) => {
        resources[category] = { ...(resources[category] || {}), ...values };
      });

      const conditionIds = entry.conditions.map((c) => c.id).filter((v) => v != null);

      const payload = {
        row_id: entry.id,
        row_type: entry.type,
        row_index: entry._rowIndex,
        damage: Math.max(entry.maxHp - currentHp, 0),
        temp_hp: Math.max(tempHp, 0),
        max_hp: entry.customMaxHp ?? "",
        resources,
        notes: entry.notes || "",
        conditions: conditionIds.length ? conditionIds : "CLEAR",
      };

      return new Promise((resolve) => {
        $.ajax({
          url: `${baseUrl}/set_row_status`,
          type: "post",
          dataType: "json",
          data: payload,
          success: (response) => {
            try {
              if (typeof window.refreshCampaignStatus === "function") {
                window.refreshCampaignStatus(response);
              }
            } catch (_error) {}
            resolve(true);
          },
          error: () => resolve(false),
        });
      });
    }

    /**
     * Compute the result of healing (positive) or damaging (negative) an
     * entry, with the native rule: damage consumes temporary HP first.
     * @returns {{currentHp: number, tempHp: number}}
     */
    computeHpChange(entry, amount) {
      let currentHp = entry.currentHp;
      let tempHp = entry.tempHp;
      if (amount < 0) {
        const remainingTemp = tempHp + amount;
        if (remainingTemp < 0) currentHp += remainingTemp;
        tempHp = Math.max(remainingTemp, 0);
      } else {
        currentHp += amount;
      }
      currentHp = Math.max(Math.min(currentHp, entry.maxHp), 0);
      return { currentHp, tempHp };
    }

    /** Damage (amount > 0) an entry. */
    applyDamage(entry, amount) {
      return this.queueStatus(entry, this.computeHpChange(entry, -Math.abs(amount)));
    }

    /** Heal (amount > 0) an entry. */
    applyHealing(entry, amount) {
      return this.queueStatus(entry, this.computeHpChange(entry, Math.abs(amount)));
    }

    /** Set temporary HP (they don't stack: the value replaces the current). */
    setTempHp(entry, value) {
      return this.queueStatus(entry, { tempHp: Math.max(toInt(value, 0), 0) });
    }

    /** Set how many uses of a resource are spent. */
    setResourceUsed(entry, category, id, usedCount) {
      const resource = entry.resources.find((r) => r.category === category && r.id === id);
      const max = resource ? resource.max : usedCount;
      const value = Math.max(Math.min(toInt(usedCount, 0), max), 0);
      return this.queueStatus(entry, { used: { [category]: { [id]: value } } });
    }

    /**
     * Select a character/creature row (opens its action bar) unless it's
     * already selected.
     */
    selectRow(type, id) {
      const $row = this._getRow(type, id);
      if (!$row.length || $row.hasClass("selected")) return false;
      $row.trigger("click");
      return true;
    }

    /**
     * Open an entry's sheet the way the panel does (Nivel20 floating panel).
     */
    openSheet(type, id) {
      const link = this._getRow(type, id).find('a[data-floating="true"]').get(0);
      if (!link) return false;
      link.click();
      return true;
    }

    /**
     * Subscribe to any change in the tracking panel (status refreshes, row
     * selection, rows re-rendered). Debounced; callback gets no arguments.
     * @returns {Function} Unsubscribe
     */
    onChange(callback) {
      if (typeof callback !== "function") return () => {};
      this._listeners.add(callback);
      this._ensureObserver();
      return () => this._listeners.delete(callback);
    }

    _ensureObserver() {
      if (this._observer) return;
      const target = document.querySelector(ROWS_SELECTOR);
      if (!target) {
        setTimeout(() => this._ensureObserver(), 1000);
        return;
      }
      this._observer = new MutationObserver(() => this._scheduleNotify());
      this._observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "data-condition-count"],
      });
    }

    _notifyNow() {
      clearTimeout(this._notifyTimer);
      this._notifyTimer = null;
      this._listeners.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.warn("[CombatTrackingManager] listener error:", error);
        }
      });
    }

    _scheduleNotify() {
      if (this._notifyTimer) return;
      this._notifyTimer = setTimeout(() => {
        this._notifyTimer = null;
        this._listeners.forEach((callback) => {
          try {
            callback();
          } catch (error) {
            console.warn("[CombatTrackingManager] listener error:", error);
          }
        });
      }, 120);
    }
  }

  // Register CombatTrackingManager
  const { registerManager } = window._n21_.utils;
  registerManager("CombatTrackingManager", CombatTrackingManager);
})();
