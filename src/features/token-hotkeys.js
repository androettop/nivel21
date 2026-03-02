(async () => {
  try {
    /* =======================
	       Feature: Token Hotkeys
	    ======================= */

    const { loadManagers } = window._n21_;
    const [SettingsManager] = await loadManagers("SettingsManager");

    // Check if feature is enabled
    if (!SettingsManager.get("feature.token-hotkeys.enabled")) {
      return;
    }

    const selectedTokenWrapper = ".selected-token-wrapper";

    // Get hotkey configuration from SettingsManager
    function getHotkey(name) {
      return SettingsManager.get(name);
    }

    // Parse hotkey string
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

    // Format hotkey for display
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

      return parts.join("+");
    }

    // Check if event matches hotkey
    function matchesHotkey(event, hotkeyString) {
      const hotkey = parseHotkey(hotkeyString);
      const eventKey = event.key.toLowerCase();

      const ctrlMatch = hotkey.ctrl ? event.ctrlKey : !event.ctrlKey;
      const altMatch = hotkey.alt ? event.altKey : !event.altKey;
      const shiftMatch = hotkey.shift ? event.shiftKey : !event.shiftKey;
      const keyMatch = hotkey.key === eventKey;

      return ctrlMatch && altMatch && shiftMatch && keyMatch;
    }

    // Add hotkey labels to buttons if they don't exist
    function addHotKeyLabels() {
      const buttons = [
        {
          selector: ".btn-toggle-token-visibility",
          hotkeyName: "hotkey.token.visibility",
        },
        {
          selector: ".btn-toggle-token-lock",
          hotkeyName: "hotkey.token.lock",
        },
        {
          selector: ".btn-remove-selected-token",
          hotkeyName: "hotkey.token.remove",
        },
        {
          selector: ".btn-edit-selected-token",
          hotkeyName: "hotkey.token.edit",
        },
        {
          selector: ".btn-duplicate-selected-token",
          hotkeyName: "hotkey.token.duplicate",
        },
      ];

      buttons.forEach(({ selector, hotkeyName }) => {
        const button = document.querySelector(selector);
        if (button) {
          // Check if label already exists
          let label = button.querySelector(".n21-hotkey-label");
          const hotkeyString = getHotkey(hotkeyName);
          const displayText = formatHotkeyForDisplay(hotkeyString);

          if (!label) {
            label = document.createElement("span");
            label.className = "n21-hotkey-label";
            button.appendChild(label);
          }

          label.textContent = displayText;
        }
      });
    }

    // Check if selected token wrapper is visible
    function isTokenWrapperActive() {
      const wrapper = document.querySelector(selectedTokenWrapper);
      return wrapper && !wrapper.classList.contains("hidden");
    }

    // Handle keydown for token hotkeys
    function handleKeydown(e) {
      // Only process if token wrapper is active
      if (!isTokenWrapperActive()) return;

      // Avoid triggering hotkeys while typing in input fields or textareas
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      let targetButton = null;

      if (matchesHotkey(e, getHotkey("hotkey.token.remove"))) {
        // Remove selected token
        targetButton = document.querySelector(".btn-remove-selected-token");
      } else if (matchesHotkey(e, getHotkey("hotkey.token.visibility"))) {
        // Toggle token visibility
        targetButton = document.querySelector(".btn-toggle-token-visibility");
      } else if (matchesHotkey(e, getHotkey("hotkey.token.lock"))) {
        // Toggle token lock
        targetButton = document.querySelector(".btn-toggle-token-lock");
      } else if (matchesHotkey(e, getHotkey("hotkey.token.edit"))) {
        // Edit selected token
        targetButton = document.querySelector(".btn-edit-selected-token");
      } else if (matchesHotkey(e, getHotkey("hotkey.token.duplicate"))) {
        // Duplicate selected token
        targetButton = document.querySelector(".btn-duplicate-selected-token");
      }

      if (targetButton) {
        e.preventDefault();
        targetButton.click();
      }
    }

    // Attach event handler
    $(document).on("keydown", handleKeydown);

    // Initialize hotkey labels on page load
    addHotKeyLabels();

    // Listen for settings changes to update labels
    SettingsManager.onChange((name) => {
      if (name.startsWith("hotkey.token.")) {
        addHotKeyLabels();
      }
    });
  } catch (error) {
    window._n21_.utils.registerFeatureError("Token Hotkeys", error);
  }
})();
