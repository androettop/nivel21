(() => {
  /* =======================
       LocalResourcesManager - Custom resources kept in this browser
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  const STORAGE_PREFIX = "_n21_local-resources:";

  function toInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * LocalResourcesManager stores custom "box" resources (spell slots, uses of
   * a trait, legendary actions...) for entries Nivel20 has no resources for,
   * like creatures. Data lives only in this browser's localStorage, scoped per
   * campaign, so nothing is ever sent to Nivel20.
   *
   * Entries are keyed with CombatTrackingManager.entryKey ("creature:12:0").
   */
  class LocalResourcesManager extends BaseManager {
    constructor() {
      super();
      this._listeners = new Set();
      window.addEventListener("storage", (event) => {
        if (event.key && event.key.startsWith(STORAGE_PREFIX)) this._notify();
      });
    }

    isReady() {
      return true;
    }

    _scope() {
      const base = (window.$ && $(".combat-tracking").data("base-url")) || "";
      return STORAGE_PREFIX + (base || window.location.pathname);
    }

    _readAll() {
      try {
        const raw = localStorage.getItem(this._scope());
        const data = raw ? JSON.parse(raw) : {};
        return data && typeof data === "object" ? data : {};
      } catch (error) {
        return {};
      }
    }

    _writeAll(data) {
      try {
        localStorage.setItem(this._scope(), JSON.stringify(data));
      } catch (error) {
        console.warn("[LocalResourcesManager] Could not save resources:", error);
      }
      this._notify();
    }

    _sanitize(resource) {
      const max = Math.min(Math.max(toInt(resource?.max, 1), 1), 99);
      return {
        id: String(resource?.id || window._n21_.utils.uuid()),
        name: String(resource?.name || "").trim().slice(0, 60) || "Recurso",
        max,
        used: Math.min(Math.max(toInt(resource?.used, 0), 0), max),
      };
    }

    /**
     * Resources for an entry.
     * @param {string} entryKey
     * @returns {Array<{id: string, name: string, max: number, used: number}>}
     */
    getResources(entryKey) {
      const list = this._readAll()[entryKey];
      return Array.isArray(list) ? list.map((r) => this._sanitize(r)) : [];
    }

    /**
     * Replace the resources of an entry.
     * @param {string} entryKey
     * @param {Array} resources
     */
    setResources(entryKey, resources) {
      const data = this._readAll();
      const list = (resources || []).map((r) => this._sanitize(r));
      if (list.length) data[entryKey] = list;
      else delete data[entryKey];
      this._writeAll(data);
    }

    addResource(entryKey, { name, max }) {
      const list = this.getResources(entryKey);
      list.push(this._sanitize({ name, max, used: 0 }));
      this.setResources(entryKey, list);
    }

    updateResource(entryKey, id, changes) {
      const list = this.getResources(entryKey).map((r) =>
        r.id === id ? this._sanitize({ ...r, ...changes, id }) : r,
      );
      this.setResources(entryKey, list);
    }

    removeResource(entryKey, id) {
      this.setResources(
        entryKey,
        this.getResources(entryKey).filter((r) => r.id !== id),
      );
    }

    /** Spend (delta > 0) or recover (delta < 0) uses. */
    changeUsed(entryKey, id, delta) {
      const resource = this.getResources(entryKey).find((r) => r.id === id);
      if (!resource) return;
      this.updateResource(entryKey, id, { used: resource.used + delta });
    }

    /** Recover every use of an entry (e.g. after a rest). */
    restoreAll(entryKey) {
      this.setResources(
        entryKey,
        this.getResources(entryKey).map((r) => ({ ...r, used: 0 })),
      );
    }

    /**
     * Copy an entry's resource definitions (fully recovered) to another entry,
     * e.g. from "Goblin 1" to "Goblin 2".
     */
    copyResources(fromKey, toKey) {
      const list = this.getResources(fromKey).map((r) => ({
        name: r.name,
        max: r.max,
        used: 0,
      }));
      this.setResources(toKey, list);
    }

    /**
     * @param {Function} callback - Called on any change (also other tabs)
     * @returns {Function} Unsubscribe
     */
    onChange(callback) {
      if (typeof callback !== "function") return () => {};
      this._listeners.add(callback);
      return () => this._listeners.delete(callback);
    }

    _notify() {
      this._listeners.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.warn("[LocalResourcesManager] listener error:", error);
        }
      });
    }
  }

  const { registerManager } = window._n21_.utils;
  registerManager("LocalResourcesManager", LocalResourcesManager);
})();
