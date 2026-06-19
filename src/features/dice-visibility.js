(async () => {
  try {
    /* =======================
       Feature: Dice Visibility
       Adds a visibility selector to the left of the dice input (#dice-input)
       that overrides the `visibility` option of every dice roll
       (window.sendDiceRollMessage), independently of the chat's configured
       visibility.
    ======================= */

    const { loadManagers } = window._n21_;
    const [SettingsManager] = await loadManagers("SettingsManager");

    // Check if feature is enabled
    if (!SettingsManager.get("feature.dice-visibility.enabled")) {
      return;
    }

    const SETTING_KEY = "dice-visibility.value";
    const AUTO = "auto";

    // Available visibility levels. "auto" means "don't override anything"
    // (the default chat behaviour, as if the feature didn't exist).
    // Icons mirror the chat's own visibility selector.
    const VISIBILITY_OPTIONS = [
      { value: "auto", label: "Auto (según el chat)", icon: "fa fa-comments" },
      { value: "public", label: "Todo el mundo", icon: "fa fa-globe" },
      {
        value: "master_and_player",
        label: "Master y remitente",
        icon: "fa fa-lock",
      },
      { value: "private", label: "Solo remitente", icon: "fa fa-user" },
      { value: "hidden", label: "Nadie", icon: "fa fa-eye-slash" },
    ];
    const VALID_VALUES = new Set(VISIBILITY_OPTIONS.map((o) => o.value));

    function getVisibility() {
      const value = String(SettingsManager.get(SETTING_KEY) || AUTO);
      return VALID_VALUES.has(value) ? value : AUTO;
    }

    function getOption(value) {
      return (
        VISIBILITY_OPTIONS.find((o) => o.value === value) ||
        VISIBILITY_OPTIONS[0]
      );
    }

    // ==================== Hook sendDiceRollMessage ====================

    // Wrap window.sendDiceRollMessage so the third argument (options) carries
    // the selected visibility. When "auto" is selected we don't touch options,
    // preserving the original/default behaviour.
    function installDiceRollHook() {
      const original = window.sendDiceRollMessage;
      if (typeof original !== "function") return false;
      if (original.__n21DiceVisibilityHooked) return true;

      const hooked = function (notation, sender, options, ...rest) {
        const visibility = getVisibility();
        let finalOptions = options;

        if (visibility !== AUTO) {
          finalOptions = { ...(options || {}), visibility };
        }

        return original.call(this, notation, sender, finalOptions, ...rest);
      };

      hooked.__n21DiceVisibilityHooked = true;
      window.sendDiceRollMessage = hooked;
      return true;
    }

    // sendDiceRollMessage may not exist yet when the feature loads; retry until
    // it is available, then stop.
    if (!installDiceRollHook()) {
      const intervalId = setInterval(() => {
        if (installDiceRollHook()) clearInterval(intervalId);
      }, 200);
      setTimeout(() => clearInterval(intervalId), 30000);
    }

    // ==================== UI: dice visibility selector ====================

    const CONTAINER_CLASS = "n21-dice-visibility";
    const ICON_CLASS = "n21-dice-visibility-icon";
    const ITEM_CLASS = "n21-dice-visibility-change";

    // Reflect the current value on the toggle button (icon + tooltip) and
    // highlight the active item, mirroring the chat's visibility selector.
    function updateToggle(root) {
      const option = getOption(getVisibility());

      const icon = root.querySelector("." + ICON_CLASS);
      if (icon) icon.className = "mr-0 " + ICON_CLASS + " " + option.icon;

      const button = root.querySelector("button");
      if (button) {
        button.setAttribute("title", "Visibilidad de tiradas: " + option.label);
      }

      root.querySelectorAll("." + ITEM_CLASS).forEach((item) => {
        item.classList.toggle(
          "active",
          item.getAttribute("data-value") === option.value,
        );
      });
    }

    function buildSelector() {
      const dropdown = document.createElement("div");
      dropdown.className = "dropdown " + CONTAINER_CLASS;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-dice";
      button.style.width = "44px";
      button.setAttribute("data-toggle", "dropdown");
      button.setAttribute("aria-expanded", "false");

      const buttonIcon = document.createElement("i");
      buttonIcon.className = "mr-0 " + ICON_CLASS;
      button.appendChild(buttonIcon);

      const menu = document.createElement("div");
      menu.className = "dropdown-menu";

      const header = document.createElement("div");
      header.className = "dropdown-header";
      header.textContent = "Tiradas de dados visibles para";
      menu.appendChild(header);

      const divider = document.createElement("div");
      divider.className = "dropdown-divider";
      menu.appendChild(divider);

      for (const option of VISIBILITY_OPTIONS) {
        const item = document.createElement("a");
        item.className = "dropdown-item " + ITEM_CLASS;
        item.href = "#";
        item.setAttribute("data-value", option.value);

        const itemIcon = document.createElement("i");
        itemIcon.className = option.icon;
        item.appendChild(itemIcon);
        item.appendChild(document.createTextNode(" " + option.label));

        item.addEventListener("click", (event) => {
          event.preventDefault();
          SettingsManager.set(SETTING_KEY, option.value);
          updateToggle(dropdown);
        });

        menu.appendChild(item);
      }

      dropdown.appendChild(button);
      dropdown.appendChild(menu);

      updateToggle(dropdown);
      return dropdown;
    }

    function setupVisibilitySelector() {
      const input = document.querySelector("#dice-input");
      if (!input) return;

      const inputGroup = input.closest(".input-group");
      if (!inputGroup) return;

      // The column that wraps the dice input.
      const column = inputGroup.parentElement;
      if (!column) return;

      // Avoid inserting it twice.
      if (column.querySelector("." + CONTAINER_CLASS)) return;

      // Lay out the selector and the input side by side, with a gap, leaving
      // the input's own rounded corners untouched.
      column.classList.add("n21-dice-visibility-col");
      column.insertBefore(buildSelector(), inputGroup);
    }

    // Keep the selector in sync if the value is changed elsewhere
    // (e.g. from the settings panel).
    SettingsManager.onChange((name) => {
      if (name !== SETTING_KEY) return;
      const root = document.querySelector(".input-group ." + CONTAINER_CLASS);
      if (root) updateToggle(root);
    });

    const observer = new MutationObserver(() => {
      setupVisibilitySelector();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setupVisibilitySelector();
  } catch (error) {
    window._n21_.utils.registerFeatureError("Dice Visibility", error);
  }
})();
