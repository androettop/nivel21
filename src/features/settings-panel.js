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

    function formatHotkeyForDisplay(hotkeyString) {
      const parsed = parseHotkey(hotkeyString);
      const parts = [];

      if (parsed.ctrl) parts.push("Ctrl");
      if (parsed.alt) parts.push("Alt");
      if (parsed.shift) parts.push("Shift");
      if (parsed.key) {
        const keyLabel = parsed.key === "delete" ? "Supr" : parsed.key.toUpperCase();
        parts.push(keyLabel);
      }

      return parts.join(" + ");
    }

    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    function isDefaultSettingValue(setting, value) {
      if (!setting) return true;

      const defaultValue = setting.defaultValue;

      if (setting.type === "number") {
        return Number(value) === Number(defaultValue);
      }

      if (setting.type === "boolean") {
        return Boolean(value) === Boolean(defaultValue);
      }

      return String(value ?? "").toLowerCase() === String(defaultValue ?? "").toLowerCase();
    }

    function buildModifiedIndicatorHtml(setting, value) {
      if (isDefaultSettingValue(setting, value)) {
        return "";
      }

      return '<span class="n21-setting-modified-badge" title="Modificado" aria-label="Modificado"><i class="fa fa-pencil" aria-hidden="true"></i></span>';
    }

    function updateSettingModifiedIndicator($panel, settingName, value) {
      if (!$panel || !$panel.length) return;

      const setting = SettingsManager.getAllSettings()[settingName];
      if (!setting) return;

      const $item = $panel.find(`.n21-setting-item[data-setting="${settingName}"]`);
      if (!$item.length) return;

      const isDefault = isDefaultSettingValue(setting, value);
      $item.toggleClass("is-modified", !isDefault);

      let $badge = $item.find(".n21-setting-modified-badge");
      if (isDefault) {
        $badge.remove();
        return;
      }

      if (!$badge.length) {
        const $label = $item.find(".n21-setting-label").first();
        if (!$label.length) return;

        const $lastLabelSpan = $label.find("span").last();
        if ($lastLabelSpan.length) {
          $lastLabelSpan.after('<span class="n21-setting-modified-badge" title="Modificado" aria-label="Modificado"><i class="fa fa-pencil" aria-hidden="true"></i></span>');
        } else {
          $label.append('<span class="n21-setting-modified-badge" title="Modificado" aria-label="Modificado"><i class="fa fa-pencil" aria-hidden="true"></i></span>');
        }
      }
    }

    function buildBooleanSettingHtml(name, setting, value) {
      const checked = value ? " checked" : "";
      const escapedName = escapeHtml(name);
      const escapedLabel = escapeHtml(setting.label);
      const modifiedIndicatorHtml = buildModifiedIndicatorHtml(setting, value);
      const modifiedClass = modifiedIndicatorHtml ? " is-modified" : "";

      return `
        <div class="n21-setting-item p-0${modifiedClass}" data-setting="${escapedName}">
          <label class="n21-setting-label p-1">
            <input type="checkbox" class="n21-setting-input n21-setting-checkbox" data-setting="${escapedName}" data-type="boolean"${checked} />
            <span>${escapedLabel}</span>
            ${modifiedIndicatorHtml}
          </label>
        </div>
      `;
    }

    function buildHotkeySettingHtml(name, setting, value) {
      const escapedName = escapeHtml(name);
      const escapedLabel = escapeHtml(setting.label);
      const displayValue = formatHotkeyForDisplay(value);
      const escapedValue = escapeHtml(displayValue);
      const modifiedIndicatorHtml = buildModifiedIndicatorHtml(setting, value);
      const modifiedClass = modifiedIndicatorHtml ? " is-modified" : "";

      return `
        <div class="n21-setting-item n21-hotkey-item${modifiedClass}" data-setting="${escapedName}">
          <label class="n21-setting-label">
            <span>${escapedLabel}</span>
            ${modifiedIndicatorHtml}
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

    function buildSelectSettingHtml(name, setting, value) {
      const escapedName = escapeHtml(name);
      const escapedLabel = escapeHtml(setting.label);
      const currentValue = String(value ?? setting.defaultValue ?? "");
      const options = Array.isArray(setting.options) ? setting.options : [];
      const modifiedIndicatorHtml = buildModifiedIndicatorHtml(setting, value);
      const modifiedClass = modifiedIndicatorHtml ? " is-modified" : "";

      const optionsHtml = options
        .map((option) => {
          const optionValue = String(option?.value ?? "");
          const selected = optionValue === currentValue ? " selected" : "";
          const escapedValue = escapeHtml(optionValue);
          const escapedOptionLabel = escapeHtml(option?.label || optionValue);
          return `<option value="${escapedValue}"${selected}>${escapedOptionLabel}</option>`;
        })
        .join("");

      return `
        <div class="n21-setting-item${modifiedClass}" data-setting="${escapedName}">
          <label class="n21-setting-label" for="n21-setting-${escapedName}">
            <span>${escapedLabel}</span>
            ${modifiedIndicatorHtml}
          </label>
          <div class="n21-hotkey-input-wrapper">
            <select id="n21-setting-${escapedName}"
                    class="n21-setting-input form-control"
                    data-setting="${escapedName}"
                    data-type="select">
              ${optionsHtml}
            </select>
            <button class="n21-setting-reset btn btn-secondary"
                    data-setting="${escapedName}"
                    data-type="select">
              Restablecer
            </button>
          </div>
        </div>
      `;
    }

    function buildNumberSettingHtml(name, setting, value) {
      const escapedName = escapeHtml(name);
      const escapedLabel = escapeHtml(setting.label);
      const numberValue = Number(value);
      const displayValue = Number.isFinite(numberValue)
        ? String(numberValue)
        : String(setting.defaultValue ?? "");
      const escapedValue = escapeHtml(displayValue);
      const modifiedIndicatorHtml = buildModifiedIndicatorHtml(setting, value);
      const modifiedClass = modifiedIndicatorHtml ? " is-modified" : "";

      const minAttr = Number.isFinite(setting.min) ? ` min="${setting.min}"` : "";
      const maxAttr = Number.isFinite(setting.max) ? ` max="${setting.max}"` : "";
      const stepAttr = Number.isFinite(setting.step)
        ? ` step="${setting.step}"`
        : "";

      return `
        <div class="n21-setting-item${modifiedClass}" data-setting="${escapedName}">
          <label class="n21-setting-label" for="n21-setting-${escapedName}">
            <span>${escapedLabel}</span>
            ${modifiedIndicatorHtml}
          </label>
          <div class="n21-hotkey-input-wrapper">
            <input id="n21-setting-${escapedName}"
                   type="number"
                   class="n21-setting-input form-control"
                   data-setting="${escapedName}"
                   data-type="number"
                   value="${escapedValue}"${minAttr}${maxAttr}${stepAttr} />
            <button class="n21-setting-reset btn btn-secondary"
                    data-setting="${escapedName}"
                    data-type="number">
              Restablecer
            </button>
          </div>
        </div>
      `;
    }

    function buildCategoryHtml(categoryName, categoryMeta, settings) {
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

      const escapedLabel = escapeHtml(categoryMeta.label || categoryName);
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

    function buildPanelHtml() {
      const allSettings = SettingsManager.getAllSettings();
      const allCategories = SettingsManager.getAllCategories
        ? SettingsManager.getAllCategories()
        : {};

      const groupedSettings = {};
      for (const [name, setting] of Object.entries(allSettings)) {
        const categoryName = setting.category || "general";
        if (!groupedSettings[categoryName]) {
          groupedSettings[categoryName] = {};
        }
        groupedSettings[categoryName][name] = setting;
      }

      const orderedCategories = Object.entries(groupedSettings)
        .map(([categoryName, settings]) => {
          const categoryMeta = allCategories[categoryName] || {
            name: categoryName,
            label: categoryName,
            description: "",
            order: 999,
          };

          return {
            key: categoryName,
            settings,
            meta: categoryMeta,
          };
        })
        .sort((a, b) => {
          if (a.meta.order !== b.meta.order) {
            return a.meta.order - b.meta.order;
          }
          return String(a.meta.label).localeCompare(String(b.meta.label));
        });

      let html = '<div class="n21-settings-panel-body">';

      if (orderedCategories.length) {
        html += '<div class="n21-settings-tabs" role="tablist">';
        html += orderedCategories
          .map((category, index) => {
            const escapedCategory = escapeHtml(category.key);
            const escapedLabel = escapeHtml(category.meta.label || category.key);
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
              category.meta,
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

      if (featureChangePending) {
        html =
          `<div class="n21-settings-reload-message">${RELOAD_NOTICE_TEXT}</div>` +
          html;
      }

      return `<div class="h-100 d-flex flex-column flex-grow-1">${html}</div>`;
    }

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

    function attachEventListeners($panel) {
      if (!$panel || !$panel.length) return;

      attachTabListeners($panel);

      $panel.find('input[type="checkbox"][data-type="boolean"]').each(function () {
        const $input = $(this);
        const settingName = $input.data("setting");

        $input.off("change.n21Settings");
        $input.on("change.n21Settings", function () {
          const newValue = $input.prop("checked");
          SettingsManager.set(settingName, newValue);

          if (settingName.startsWith("feature.") && settingName.endsWith(".enabled")) {
            featureChangePending = true;
            showReloadMessage($panel);
          }
        });
      });

      $panel.find('select[data-type="select"]').each(function () {
        const $input = $(this);
        const settingName = $input.data("setting");

        $input.off("change.n21Settings");
        $input.on("change.n21Settings", function () {
          SettingsManager.set(settingName, String($input.val() || ""));
        });
      });

      $panel.find('input[type="number"][data-type="number"]').each(function () {
        const $input = $(this);
        const settingName = $input.data("setting");

        $input.off("change.n21Settings blur.n21Settings");
        $input.on("change.n21Settings blur.n21Settings", function () {
          const rawValue = String($input.val() || "").trim();
          const numericValue = Number(rawValue);
          const setting = SettingsManager.getAllSettings()[settingName];

          if (!setting || !Number.isFinite(numericValue)) {
            $input.val(String(SettingsManager.get(settingName) ?? ""));
            return;
          }

          let nextValue = numericValue;
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

      $panel.find(".n21-setting-reset").each(function () {
        const $button = $(this);
        const settingName = $button.data("setting");
        const settingType = $button.data("type");

        $button.off("click.n21Settings");
        $button.on("click.n21Settings", function (e) {
          e.preventDefault();
          SettingsManager.reset(settingName);

          const newValue = SettingsManager.get(settingName);
          const $input = $panel.find(
            `.n21-setting-input[data-setting="${settingName}"][data-type="${settingType}"]`
          );

          if ($input.length) {
            $input.val(String(newValue ?? ""));
          }
        });
      });

      $panel.find('input[data-type="hotkey"]').each(function () {
        const $input = $(this);
        const settingName = $input.data("setting");

        $input.off("keydown.n21Settings");
        $input.on("keydown.n21Settings", function (e) {
          e.preventDefault();
          e.stopPropagation();

          const key = String(e.key || "").toLowerCase();
          const ctrl = e.ctrlKey;
          const alt = e.altKey;
          const shift = e.shiftKey;

          if (["control", "alt", "shift", "meta"].includes(key)) {
            return;
          }

          const parts = [];
          if (ctrl) parts.push("ctrl");
          if (alt) parts.push("alt");
          if (shift) parts.push("shift");
          parts.push(key);

          const hotkeyString = parts.join("+");
          $input.val(formatHotkeyForDisplay(hotkeyString));
          SettingsManager.set(settingName, hotkeyString);
        });
      });

      $panel.find(".n21-hotkey-reset").each(function () {
        const $button = $(this);
        const settingName = $button.data("setting");

        $button.off("click.n21Settings");
        $button.on("click.n21Settings", function (e) {
          e.preventDefault();
          SettingsManager.reset(settingName);

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

    function showReloadMessage($panel) {
      if (!$panel || !$panel.length) return;

      let $message = $panel.find(".n21-settings-reload-message");

      if (!$message.length) {
        $message = $(
          `<div class="n21-settings-reload-message">${RELOAD_NOTICE_TEXT}</div>`
        );
        $panel.find(".n21-settings-panel-body").before($message);
      }
    }

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

      const unsubscribe = SettingsManager.onChange((name, value) => {
        if (!currentPanel || !currentPanel.length) {
          unsubscribe();
          return;
        }

        const $input = currentPanel.find(
          `.n21-setting-input[data-setting="${name}"]`
        );
        if (!$input.length) return;

        const type = $input.data("type");
        if (type === "boolean") {
          $input.prop("checked", value);
        } else if (type === "hotkey") {
          $input.val(formatHotkeyForDisplay(value));
        } else if (type === "number" || type === "select") {
          $input.val(String(value ?? ""));
        }

        updateSettingModifiedIndicator(currentPanel, name, value);
      });

      $panel.on("remove", () => {
        unsubscribe();
        currentPanel = null;
      });
    }

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
