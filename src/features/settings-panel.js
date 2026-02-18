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
    const RELOAD_NOTICE_TEXT =
      "Uno o más cambios requieren <a href='#' onclick='location.reload()'>recargar la página</a> para aplicarse.";

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
        "send-to-chat": {
          label: "Compartir al chat",
          description: "Define la tecla modificadora para enviar contenido al chat.",
        },
        "snap-to-grid": {
          label: "Ajuste a cuadrícula",
          description: "Configura la tecla usada para ajustar tokens al soltar.",
        },
        "token-height": {
          label: "Altura de tokens",
          description: "Ajusta límites y paso para subir y bajar altura.",
        },
        "token-move": {
          label: "Movimiento de tokens",
          description: "Configura cuánto se mueve un token por pulsación.",
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
            <button class="n21-hotkey-reset btn btn-secondary" data-setting="${escapedName}">
              Restablecer
            </button>
          </div>
        </div>
      `;
    }

    /**
     * Build HTML for a select setting
     */
    function buildSelectSettingHtml(name, setting, value) {
      const escapedName = escapeHtml(name);
      const escapedLabel = escapeHtml(setting.label);
      const options = Array.isArray(setting.options) ? setting.options : [];

      const optionsHtml = options
        .map((option) => {
          const optionValue =
            option && typeof option === "object"
              ? String(option.value ?? "")
              : String(option);
          const optionLabel =
            option && typeof option === "object"
              ? String(option.label ?? option.value ?? "")
              : String(option);
          const selected = String(value) === optionValue ? " selected" : "";

          return `<option value="${escapeHtml(optionValue)}"${selected}>${escapeHtml(optionLabel)}</option>`;
        })
        .join("");

      return `
        <div class="n21-setting-item" data-setting="${escapedName}">
          <label class="n21-setting-label" for="n21-setting-${escapedName}">
            <span>${escapedLabel}</span>
          </label>
          <select id="n21-setting-${escapedName}"
                  class="n21-setting-input form-control"
                  data-setting="${escapedName}"
                  data-type="select">
            ${optionsHtml}
          </select>
        </div>
      `;
    }

    /**
     * Build HTML for a number setting
     */
    function buildNumberSettingHtml(name, setting, value) {
      const escapedName = escapeHtml(name);
      const escapedLabel = escapeHtml(setting.label);
      const minAttr =
        typeof setting.min === "number" ? ` min="${setting.min}"` : "";
      const maxAttr =
        typeof setting.max === "number" ? ` max="${setting.max}"` : "";
      const stepAttr =
        typeof setting.step === "number" ? ` step="${setting.step}"` : "";

      return `
        <div class="n21-setting-item" data-setting="${escapedName}">
          <label class="n21-setting-label" for="n21-setting-${escapedName}">
            <span>${escapedLabel}</span>
          </label>
          <input id="n21-setting-${escapedName}"
                 type="number"
                 class="n21-setting-input form-control"
                 data-setting="${escapedName}"
                 data-type="number"
                 value="${escapeHtml(String(value ?? setting.defaultValue ?? ""))}"${minAttr}${maxAttr}${stepAttr} />
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
            case "select":
              return buildSelectSettingHtml(name, setting, value);
            case "number":
              return buildNumberSettingHtml(name, setting, value);
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

      const orderedCategories = [];

      if (categories.features) {
        orderedCategories.push({
          key: "features",
          label: "Funciones",
          settings: categories.features,
        });
      }

      if (categories.hotkeys) {
        orderedCategories.push({
          key: "hotkeys",
          label: "Atajos de teclado",
          settings: categories.hotkeys,
        });
      }

      for (const [catName, settings] of Object.entries(categories)) {
        if (catName !== "features" && catName !== "hotkeys") {
          const categoryMeta = getCategoryMeta(catName);
          orderedCategories.push({
            key: catName,
            label: categoryMeta.label || catName,
            settings,
          });
        }
      }

      let html = '<div class="n21-settings-panel-body">';

      if (orderedCategories.length) {
        html += '<div class="n21-settings-tabs" role="tablist">';
        html += orderedCategories
          .map((category, index) => {
            const escapedCategory = escapeHtml(category.key);
            const escapedLabel = escapeHtml(category.label);
            const activeClass = index === 0 ? " is-active" : "";

            return `
              <button type="button"
                      class="n21-settings-tab${activeClass}"
                      role="tab"
                      data-category-tab="${escapedCategory}"
                      aria-selected="${index === 0 ? "true" : "false"}">
                ${escapedLabel}
              </button>
            `;
          })
          .join("");
        html += "</div>";

        html += '<div class="n21-settings-tab-panels">';
        html += orderedCategories
          .map((category, index) => {
            const categoryHtml = buildCategoryHtml(
              category.key,
              category.label,
              category.settings
            );

            if (!categoryHtml) return "";

            const activeClass = index === 0 ? " is-active" : "";
            return categoryHtml.replace(
              'class="n21-settings-category"',
              `class="n21-settings-category${activeClass}"`
            );
          })
          .join("");
        html += "</div>";
      }

      html += "</div>";

      // Add reload message if needed
      if (featureChangePending) {
        html =
          `<div class="n21-settings-reload-message">${RELOAD_NOTICE_TEXT}</div>` +
          html;
      }


      // Wrap in container
      html = `<div class="h-100 d-flex flex-column flex-grow-1">${html}</div>`;
      return html;
    }

    /**
     * Attach tab listeners
     */
    function attachTabListeners($panel) {
      const $tabs = $panel.find(".n21-settings-tab");
      if (!$tabs.length) return;

      $tabs.off("click.n21SettingsTab");
      $tabs.on("click.n21SettingsTab", function () {
        const $tab = $(this);
        const category = $tab.data("categoryTab");
        if (!category) return;

        $tabs.removeClass("is-active").attr("aria-selected", "false");
        $tab.addClass("is-active").attr("aria-selected", "true");

        $panel.find(".n21-settings-category").removeClass("is-active");
        $panel
          .find(`.n21-settings-category[data-category="${category}"]`)
          .addClass("is-active");
      });
    }

    /**
     * Attach event listeners to settings panel
     */
    function attachEventListeners($panel) {
      if (!$panel || !$panel.length) return;

      attachTabListeners($panel);

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

      // Select settings
      $panel.find('select[data-type="select"]').each(function () {
        const $input = $(this);
        const settingName = $input.data("setting");

        $input.off("change.n21Settings");
        $input.on("change.n21Settings", function () {
          SettingsManager.set(settingName, String($input.val() || ""));
        });
      });

      // Number settings
      $panel.find('input[data-type="number"]').each(function () {
        const $input = $(this);
        const settingName = $input.data("setting");

        $input.off("change.n21Settings blur.n21Settings");
        $input.on("change.n21Settings blur.n21Settings", function () {
          const raw = String($input.val() || "").trim();
          const numeric = Number(raw);
          const setting = SettingsManager.getAllSettings()[settingName];

          if (!setting || !Number.isFinite(numeric)) {
            $input.val(String(SettingsManager.get(settingName)));
            return;
          }

          let nextValue = numeric;
          if (typeof setting.min === "number") {
            nextValue = Math.max(setting.min, nextValue);
          }
          if (typeof setting.max === "number") {
            nextValue = Math.min(setting.max, nextValue);
          }

          SettingsManager.set(settingName, nextValue);
          $input.val(String(nextValue));
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
          `<div class="n21-settings-reload-message">${RELOAD_NOTICE_TEXT}</div>`
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
          } else if (type === "number" || type === "select") {
            $input.val(String(value));
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
