(() => {
  /* =======================
       SettingsManager - Manage settings for all features
    ======================= */

  const { BaseManager } = window._n21_?.managers || {};

  /**
   * SettingsManager provides centralized settings management with localStorage
   * Features can register their settings and listen for changes
   */
  class SettingsManager extends BaseManager {
    constructor() {
      super();
      this._settings = {};
      this._categories = {};
      this._listeners = [];
      this._storagePrefix = "_n21_";
    }

    async init() {
      this._initializeDefaultSettings();
    }

    /**
     * Initialize default settings for all features
     * @private
     */
    _initializeDefaultSettings() {
      this.registerCategory({
        name: "features",
        label: "Funciones",
        description: "Activa o desactiva los módulos que quieres usar.",
        order: 10,
      });

      this.registerCategory({
        name: "token-shortcuts",
        label: "Atajos de tokens",
        description: "Configura teclas rápidas para acciones de tokens.",
        order: 20,
      });

      this.registerCategory({
        name: "token-movement",
        label: "Movimiento de tokens",
        description: "Ajusta desplazamiento y comportamiento de cuadrícula.",
        order: 30,
      });

      this.registerCategory({
        name: "chat",
        label: "Chat",
        description: "Define cómo interactúan los módulos con el chat.",
        order: 40,
      });

      this.registerCategory({
        name: "advanced",
        label: "Avanzado",
        description: "Parámetros finos para casos específicos.",
        order: 50,
      });

      // Feature enable/disable settings
      this.registerSetting({
        name: "feature.advantage-disadvantage.enabled",
        label: "Tiradas con Ventaja/Desventaja",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.send-to-chat.enabled",
        label: "Compartir Contenido al Chat",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.parse-chat-links.enabled",
        label: "Enlaces en Mensajes del Chat",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.token-hotkeys.enabled",
        label: "Atajos para Tokens",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.token-height-order.enabled",
        label: "Altura de Tokens",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.token-move-arrows.enabled",
        label: "Mover Tokens con el Teclado",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.snap-to-grid.enabled",
        label: "Ajustar a la Cuadrícula",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.multi-measurement.enabled",
        label: "Mediciones Persistentes",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.whisper-mode.enabled",
        label: "Susurrar en el Chat",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.multi-level-action-bar.enabled",
        label: "Carpetas anidadas",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.ambient-fx.enabled",
        label: "Efectos ambientales",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.notes-panel.enabled",
        label: "Panel de Notas",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      this.registerSetting({
        name: "feature.token-drag-measurement.enabled",
        label: "Medición de Distancias al Arrastrar",
        type: "boolean",
        defaultValue: true,
        category: "features",
      });

      // Token hotkeys settings
      this.registerSetting({
        name: "hotkey.token.visibility",
        label: "Alternar visibilidad de token",
        type: "hotkey",
        defaultValue: "ctrl+h",
        category: "token-shortcuts",
      });

      this.registerSetting({
        name: "hotkey.token.lock",
        label: "Alternar bloqueo de token",
        type: "hotkey",
        defaultValue: "ctrl+b",
        category: "token-shortcuts",
      });

      this.registerSetting({
        name: "hotkey.token.remove",
        label: "Eliminar token",
        type: "hotkey",
        defaultValue: "delete",
        category: "token-shortcuts",
      });

      this.registerSetting({
        name: "hotkey.token.edit",
        label: "Editar token",
        type: "hotkey",
        defaultValue: "ctrl+e",
        category: "token-shortcuts",
      });

      this.registerSetting({
        name: "hotkey.token.duplicate",
        label: "Duplicar token",
        type: "hotkey",
        defaultValue: "ctrl+d",
        category: "token-shortcuts",
      });

      this.registerSetting({
        name: "hotkey.token.height.up",
        label: "Subir altura de token",
        type: "hotkey",
        defaultValue: "pageup",
        category: "token-shortcuts",
      });

      this.registerSetting({
        name: "hotkey.token.height.down",
        label: "Bajar altura de token",
        type: "hotkey",
        defaultValue: "pagedown",
        category: "token-shortcuts",
      });

      this.registerSetting({
        name: "send-to-chat.modifier",
        label: "Tecla para compartir al chat",
        type: "select",
        defaultValue: "shift",
        category: "chat",
        options: [
          { value: "shift", label: "Shift" },
          { value: "ctrl", label: "Ctrl" },
          { value: "alt", label: "Alt" },
        ],
      });

      this.registerSetting({
        name: "snap-to-grid.modifier",
        label: "Tecla para ajustar a cuadrícula",
        type: "select",
        defaultValue: "shift",
        category: "token-movement",
        options: [
          { value: "shift", label: "Shift" },
          { value: "ctrl", label: "Ctrl" },
          { value: "alt", label: "Alt" },
        ],
      });

      this.registerSetting({
        name: "token-height.step",
        label: "Paso de altura",
        type: "number",
        defaultValue: 0.06,
        category: "advanced",
        min: 0.001,
        max: 2,
        step: 0.001,
      });

      this.registerSetting({
        name: "token-height.min",
        label: "Altura mínima",
        type: "number",
        defaultValue: 0.001,
        category: "advanced",
        min: 0,
        max: 100,
        step: 0.001,
      });

      this.registerSetting({
        name: "token-height.max",
        label: "Altura máxima",
        type: "number",
        defaultValue: 10,
        category: "advanced",
        min: 0.001,
        max: 100,
        step: 0.001,
      });

      this.registerSetting({
        name: "token-move.step",
        label: "Paso de movimiento (casillas)",
        type: "number",
        defaultValue: 1,
        category: "token-movement",
        min: 0.1,
        max: 10,
        step: 0.1,
      });

      this.registerSetting({
        name: "multi-measurement.default-persistent",
        label: "Mediciones persistentes por defecto",
        type: "boolean",
        defaultValue: false,
        category: "advanced",
      });

      this.registerSetting({
        name: "advantage-disadvantage.advantage-modifier",
        label: "Tecla para ventaja",
        type: "select",
        defaultValue: "shift",
        category: "advanced",
        options: [
          { value: "shift", label: "Shift" },
          { value: "ctrl", label: "Ctrl" },
          { value: "alt", label: "Alt" },
        ],
      });

      this.registerSetting({
        name: "advantage-disadvantage.disadvantage-modifier",
        label: "Tecla para desventaja",
        type: "select",
        defaultValue: "alt",
        category: "advanced",
        options: [
          { value: "shift", label: "Shift" },
          { value: "ctrl", label: "Ctrl" },
          { value: "alt", label: "Alt" },
        ],
      });
    }

    /**
     * Register a category for settings UI
     * @param {Object} category - Category configuration
     * @param {string} category.name - Unique category name
     * @param {string} category.label - Display label
     * @param {string} [category.description] - Optional category description
     * @param {number} [category.order] - Category order in UI
     */
    registerCategory(category) {
      if (!category || !category.name) {
        console.warn("[SettingsManager] Invalid category registration");
        return;
      }

      this._categories[category.name] = {
        name: category.name,
        label: category.label || category.name,
        description: category.description || "",
        order: Number.isFinite(category.order) ? category.order : 999,
      };
    }

    /**
     * Register a new setting
     * @param {Object} setting - Setting configuration
     * @param {string} setting.name - Unique setting name (e.g., "feature.token-hotkeys.enabled")
     * @param {string} setting.label - Display label
     * @param {string} setting.type - Type: "boolean", "string", "number", "hotkey"
     * @param {*} setting.defaultValue - Default value
     * @param {string} setting.category - Category: "features", "hotkeys", etc.
     * @param {Array} [setting.options] - Options for select type
     */
    registerSetting(setting) {
      if (!setting || !setting.name) {
        console.warn("[SettingsManager] Invalid setting registration");
        return;
      }

      if (!this._categories[setting.category || "general"]) {
        const categoryName = setting.category || "general";
        this.registerCategory({
          name: categoryName,
          label: categoryName,
          description: "",
          order: 999,
        });
      }

      this._settings[setting.name] = {
        ...setting,
        name: setting.name,
        label: setting.label || setting.name,
        type: setting.type || "string",
        defaultValue: setting.defaultValue,
        category: setting.category || "general",
        options: setting.options || null,
      };
    }

    /**
     * Get all categories registered for settings UI
     * @returns {Object} Categories keyed by name
     */
    getAllCategories() {
      return { ...this._categories };
    }

    /**
     * Get all registered settings
     * @returns {Object} All settings keyed by name
     */
    getAllSettings() {
      return { ...this._settings };
    }

    /**
     * Get settings by category
     * @param {string} category - Category name
     * @returns {Object} Settings in the category
     */
    getSettingsByCategory(category) {
      const result = {};
      for (const [name, setting] of Object.entries(this._settings)) {
        if (setting.category === category) {
          result[name] = setting;
        }
      }
      return result;
    }

    /**
     * Get a setting value
     * @param {string} name - Setting name
     * @returns {*} The setting value (from storage or default)
     */
    get(name) {
      const setting = this._settings[name];
      if (!setting) {
        console.warn(`[SettingsManager] Unknown setting: ${name}`);
        return undefined;
      }

      const storageKey = this._storagePrefix + name;
      const storedValue = this._getFromStorage(storageKey);

      if (storedValue !== null) {
        return this._parseValue(storedValue, setting.type);
      }

      return setting.defaultValue;
    }

    /**
     * Set a setting value
     * @param {string} name - Setting name
     * @param {*} value - New value
     * @param {Object} options - Options { silent: boolean }
     */
    set(name, value, options = {}) {
      const setting = this._settings[name];
      if (!setting) {
        console.warn(`[SettingsManager] Unknown setting: ${name}`);
        return;
      }

      const storageKey = this._storagePrefix + name;

      // If value equals default, remove from storage
      if (this._isDefaultValue(value, setting.defaultValue)) {
        this._removeFromStorage(storageKey);
      } else {
        this._saveToStorage(storageKey, value);
      }

      // Notify listeners
      if (!options.silent) {
        this._notifyListeners(name, value, setting.defaultValue);
      }
    }

    /**
     * Check if a value equals the default value
     * @private
     */
    _isDefaultValue(value, defaultValue) {
      if (value === defaultValue) return true;
      if (typeof value === "string" && typeof defaultValue === "string") {
        return value.toLowerCase() === defaultValue.toLowerCase();
      }
      return false;
    }

    /**
     * Reset a setting to its default value
     * @param {string} name - Setting name
     */
    reset(name) {
      const setting = this._settings[name];
      if (!setting) {
        console.warn(`[SettingsManager] Unknown setting: ${name}`);
        return;
      }

      const storageKey = this._storagePrefix + name;
      this._removeFromStorage(storageKey);

      this._notifyListeners(name, setting.defaultValue, setting.defaultValue);
    }

    /**
     * Reset all settings to defaults
     */
    resetAll() {
      for (const name in this._settings) {
        this.reset(name);
      }
    }

    /**
     * Listen for setting changes
     * @param {Function} callback - Function(name, value, defaultValue)
     * @returns {Function} Unsubscribe function
     */
    onChange(callback) {
      if (typeof callback !== "function") {
        console.warn("[SettingsManager] onChange callback must be a function");
        return () => {};
      }

      this._listeners.push(callback);

      // Return unsubscribe function
      return () => {
        const index = this._listeners.indexOf(callback);
        if (index > -1) {
          this._listeners.splice(index, 1);
        }
      };
    }

    /**
     * Notify all listeners of a setting change
     * @private
     */
    _notifyListeners(name, value, defaultValue) {
      for (const listener of this._listeners) {
        try {
          listener(name, value, defaultValue);
        } catch (error) {
          console.warn("[SettingsManager] Error in change listener:", error);
        }
      }
    }

    /**
     * Get value from localStorage
     * @private
     */
    _getFromStorage(key) {
      try {
        const value = localStorage.getItem(key);
        return value;
      } catch (error) {
        console.warn("[SettingsManager] Error reading from localStorage:", error);
        return null;
      }
    }

    /**
     * Save value to localStorage
     * @private
     */
    _saveToStorage(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch (error) {
        console.warn("[SettingsManager] Error writing to localStorage:", error);
      }
    }

    /**
     * Remove value from localStorage
     * @private
     */
    _removeFromStorage(key) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn("[SettingsManager] Error removing from localStorage:", error);
      }
    }

    /**
     * Parse stored value to correct type
     * @private
     */
    _parseValue(value, type) {
      if (value === null || value === undefined) return null;

      switch (type) {
        case "boolean":
          return value === "true" || value === true;
        case "number":
          return Number(value);
        case "string":
        case "hotkey":
        default:
          return String(value);
      }
    }

    isReady() {
      return true;
    }
  }

  // Register SettingsManager
  const { registerManager } = window._n21_.utils;
  registerManager("SettingsManager", SettingsManager);
})();
