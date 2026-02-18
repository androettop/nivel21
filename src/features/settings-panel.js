(async () => {
  try {
    /* =======================
       Feature: Settings Panel
    ======================= */

    const { loadManagers } = window._n21_;

    const [MainMenuUIManager, FloatingPanelManager, SettingsManager] =
      await loadManagers(
        "MainMenuUIManager",
        "FloatingPanelManager",
        "SettingsManager"
      );

    if (!MainMenuUIManager || !FloatingPanelManager || !SettingsManager) {
      console.warn("[Settings Panel] Managers not available");
      return;
    }

    const MENU_ITEM_ID = "n21-settings-panel";
    const PANEL_TITLE = "Ajustes de Nivel21";
    const PANEL_ICON = "ft-settings";
    const PANEL_COLOR = "#822020";
    const PANEL_CLASS = "n21-settings-panel";
    const PANEL_STYLE =
      "min-width: 540px; min-height: 620px; width: 540px; height: 620px;";

    let currentPanel = null;
    let featureChangePending = false;

    /**
     * Parse hotkey string into components
     */
    function parseHotkey(hotkeyString) {
      const lower = String(hotkeyString || "").toLowerCase();
      const parts = lower.split("+").map((p) => p.trim());

      return {
        ctrl: parts.includes("ctrl"),
        alt: parts.includes("alt"),
        shift: parts.includes("shift"),
        key: parts.filter((p) => !["ctrl", "alt", "shift"].includes(p))[0] || "",
      };
    }

    /**
     * Format hotkey for display
     */
    function formatHotkeyForDisplay(hotkeyString) {
      const parsed = parseHotkey(hotkeyString);
      const parts = [];

      if (parsed.ctrl) parts.push("Ctrl");
      if (parsed.alt) parts.push("Alt");
      if (parsed.shift) parts.push("Shift");
      if (parsed.key) {
        const keyLabel =
          parsed.key === "delete"
            ? "Supr"
            : parsed.key.toUpperCase();
        parts.push(keyLabel);
      }

      return parts.join(" + ");
    }

    /**
     * Escape HTML special characters
     */
    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    /**
     * Get category metadata for UI text
     */
    function getCategoryMeta(categoryName) {
      const meta = {
        features: {
          label: "Funciones",
          description: "Activa o desactiva los módulos que quieres usar.",
        },
        hotkeys: {
          label: "Atajos de teclado",
          description: "Personaliza combinaciones para acciones rápidas.",
        },
      };

      return (
        meta[categoryName] || {
          label: categoryName,
          description: "",
        }
      );
    }

    /**
     * Build HTML for a boolean setting
     */
    function buildBooleanSettingHtml(name, setting, value) {
      const checked = value ? " checked" : "";
      const escapedName = escapeHtml(name);
      const escapedLabel = escapeHtml(setting.label);

      return `
        <div class="n21-setting-item" data-setting="${escapedName}">
          <label class="n21-setting-label">
            <input type="checkbox" class="n21-setting-input n21-setting-checkbox" data-setting="${escapedName}" data-type="boolean"${checked} />
            <span>${escapedLabel}</span>
          </label>
        </div>
      `;
    }

    /**
     * Build HTML for a hotkey setting
     */
    function buildHotkeySettingHtml(name, setting, value) {
      const escapedName = escapeHtml(name);
      const escapedLabel = escapeHtml(setting.label);
      const displayValue = formatHotkeyForDisplay(value);
      const escapedValue = escapeHtml(displayValue);

      return `
        <div class="n21-setting-item n21-hotkey-item" data-setting="${escapedName}">
          <label class="n21-setting-label">
            <span>${escapedLabel}</span>
          </label>
          <div class="n21-hotkey-input-wrapper">
            <input type="text"
                   class="n21-setting-input form-control n21-hotkey-input"
                   data-setting="${escapedName}"
                   data-type="hotkey"
                   value="${escapedValue}"
                   readonly
                   placeholder="Presione una tecla..." />
            <button class="n21-hotkey-reset btn btn-sm btn-secondary" data-setting="${escapedName}">
              Restablecer
            </button>
          </div>
        </div>
      `;
    }

    /**
     * Build HTML for settings by category
     */
    function buildCategoryHtml(categoryName, categoryLabel, settings) {
      const settingNames = Object.keys(settings || {});
      if (!settingNames.length) return "";

      const settingsHtml = Object.entries(settings)
        .map(([name, setting]) => {
          const value = SettingsManager.get(name);

          switch (setting.type) {
            case "boolean":
              return buildBooleanSettingHtml(name, setting, value);
            case "hotkey":
              return buildHotkeySettingHtml(name, setting, value);
            default:
              return "";
          }
        })
        .join("");

      const categoryMeta = getCategoryMeta(categoryName);
      const escapedLabel = escapeHtml(categoryLabel);
      const escapedDescription = escapeHtml(categoryMeta.description || "");

      return `
        <div class="n21-settings-category" data-category="${categoryName}">
          <div class="n21-settings-category-header">
            <h3 class="n21-settings-category-title">${escapedLabel}</h3>
          </div>
          ${
            escapedDescription
              ? `<p class="n21-settings-category-description">${escapedDescription}</p>`
              : ""
          }
          <div class="n21-settings-category-content">
            ${settingsHtml}
          </div>
        </div>
      `;
    }

    /**
     * Build complete settings panel HTML
     */
    function buildPanelHtml() {
      const allSettings = SettingsManager.getAllSettings();

      // Group by category
      const categories = {};
      for (const [name, setting] of Object.entries(allSettings)) {
        const cat = setting.category || "general";
        if (!categories[cat]) {
          categories[cat] = {};
        }
        categories[cat][name] = setting;
      }

      let html = '<div class="n21-settings-panel-body">';

      // Features category
      if (categories.features) {
        html += buildCategoryHtml("features", "Funciones", categories.features);
      }

      // Hotkeys category
      if (categories.hotkeys) {
        html += buildCategoryHtml(
          "hotkeys",
          "Atajos de teclado",
          categories.hotkeys
        );
      }

      // Other categories
      for (const [catName, settings] of Object.entries(categories)) {
        if (catName !== "features" && catName !== "hotkeys") {
          html += buildCategoryHtml(catName, catName, settings);
        }
      }

      html += "</div>";

      // Add reload message if needed
      if (featureChangePending) {
        html =
          '<div class="n21-settings-reload-message">Se han cambiado las funciones. Recarga la página para aplicar los cambios.</div>' +
          html;
      }

      return html;
    }

    /**
     * Attach event listeners to settings panel
     */
    function attachEventListeners($panel) {
      if (!$panel || !$panel.length) return;

      // Boolean checkboxes
      $panel.find('input[type="checkbox"][data-type="boolean"]').each(function () {
        const $input = $(this);
        const settingName = $input.data("setting");

        $input.off("change.n21Settings");
        $input.on("change.n21Settings", function () {
          const newValue = $input.prop("checked");
          SettingsManager.set(settingName, newValue);

          // Check if this is a feature toggle
          if (settingName.startsWith("feature.") && settingName.endsWith(".enabled")) {
            featureChangePending = true;
            showReloadMessage($panel);
          }
        });
      });

      // Hotkey inputs
      $panel.find('input[data-type="hotkey"]').each(function () {
        const $input = $(this);
        const settingName = $input.data("setting");

        $input.off("keydown.n21Settings");
        $input.on("keydown.n21Settings", function (e) {
          e.preventDefault();
          e.stopPropagation();

          const key = e.key.toLowerCase();
          const ctrl = e.ctrlKey;
          const alt = e.altKey;
          const shift = e.shiftKey;

          // Build hotkey string
          const parts = [];
          if (ctrl) parts.push("ctrl");
          if (alt) parts.push("alt");
          if (shift) parts.push("shift");

          // Ignore modifier-only presses
          if (["control", "alt", "shift", "meta"].includes(key)) {
            return;
          }

          parts.push(key);
          const hotkeyString = parts.join("+");

          // Update display
          $input.val(formatHotkeyForDisplay(hotkeyString));

          // Save setting
          SettingsManager.set(settingName, hotkeyString);
        });
      });

      // Hotkey reset buttons
      $panel.find(".n21-hotkey-reset").each(function () {
        const $button = $(this);
        const settingName = $button.data("setting");

        $button.off("click.n21Settings");
        $button.on("click.n21Settings", function (e) {
          e.preventDefault();
          SettingsManager.reset(settingName);

          // Update display
          const newValue = SettingsManager.get(settingName);
          const $input = $panel.find(
            `input[data-setting="${settingName}"][data-type="hotkey"]`
          );
          if ($input.length) {
            $input.val(formatHotkeyForDisplay(newValue));
          }
        });
      });
    }

    /**
     * Show reload message
     */
    function showReloadMessage($panel) {
      if (!$panel || !$panel.length) return;

      // Check if message already exists
      let $message = $panel.find(".n21-settings-reload-message");

      if (!$message.length) {
        $message = $(
          '<div class="n21-settings-reload-message">Se han cambiado las funciones. Recarga la página para aplicar los cambios.</div>'
        );
        $panel.find(".n21-settings-panel-body").before($message);
      }
    }

    /**
     * Open settings panel
     */
    function openSettingsPanel() {
      const html = buildPanelHtml();

      const $panel = FloatingPanelManager.openStaticPanelWithHtml(
        PANEL_TITLE,
        PANEL_ICON,
        PANEL_COLOR,
        html,
        PANEL_CLASS,
        PANEL_STYLE
      );

      if (!$panel || !$panel.length) return;

      currentPanel = $panel;
      attachEventListeners($panel);

      // Listen for settings changes from other sources
      const unsubscribe = SettingsManager.onChange((name, value) => {
        if (!currentPanel || !currentPanel.length) {
          unsubscribe();
          return;
        }

        // Update the UI to reflect the change
        const $input = currentPanel.find(`[data-setting="${name}"]`);
        if ($input.length) {
          const type = $input.data("type");
          if (type === "boolean") {
            $input.prop("checked", value);
          } else if (type === "hotkey") {
            $input.val(formatHotkeyForDisplay(value));
          }
        }
      });

      // Clean up on panel close
      $panel.on("remove", () => {
        unsubscribe();
        currentPanel = null;
      });
    }

    // Add menu item
    const header = await MainMenuUIManager.addHeader("Nivel 21", {
      id: "n21-menu-header",
    });

    await MainMenuUIManager.addItem(
      {
        id: MENU_ITEM_ID,
        title: "Configuración",
        iconClass: "ft-settings",
        onClick: () => {
          openSettingsPanel();
        },
      },
      {
        afterElement: header,
      }
    );
  } catch (error) {
    console.warn("N21: Error en feature Settings Panel:", error.message);
  }
})();
