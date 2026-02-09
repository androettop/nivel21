(async () => {
  try {
    /* =======================
	       Feature: Token Hotkeys
	    ======================= */

    const { settingsLoader } = window._n21_;
    
    // Wait for settings to load
    await settingsLoader.load();
    
    // Check if feature is enabled
    if (!settingsLoader.isFeatureEnabled('token-hotkeys')) {
      console.log('N21: Feature Token Hotkeys is disabled');
      return;
    }

    const selectedTokenWrapper = ".selected-token-wrapper";

    // Add hotkey labels to buttons if they don't exist
    function addHotKeyLabels() {
      const settings = settingsLoader.getFeatureSettings('token-hotkeys');
      const buttons = [
        { selector: ".btn-toggle-token-visibility", keyName: "toggleVisibility" },
        { selector: ".btn-toggle-token-lock", keyName: "toggleLock" },
        { selector: ".btn-remove-selected-token", keyName: "delete" },
        { selector: ".btn-edit-selected-token", keyName: "edit" },
        { selector: ".btn-duplicate-selected-token", keyName: "duplicate" },
      ];

      buttons.forEach(({ selector, keyName }) => {
        const button = document.querySelector(selector);
        if (button) {
          // Check if label already exists
          const existingLabel = button.querySelector(".n21-hotkey-label");
          const label = settings.keys[keyName] || '';
          if (!existingLabel && label) {
            const span = document.createElement("span");
            span.className = "n21-hotkey-label";
            span.textContent = label;
            button.appendChild(span);
          }
        }
      });
    }

    // Check if selected token wrapper is visible
    function isTokenWrapperActive() {
      const wrapper = document.querySelector(selectedTokenWrapper);
      return wrapper && !wrapper.classList.contains("hidden");
    }

    // Parse key combination from settings
    function parseKeyCombination(keyCombo) {
      if (!keyCombo) return null;
      
      // Handle special case for keys that contain '+'
      const modifiers = [];
      let key = keyCombo;
      
      // Extract modifiers
      if (keyCombo.startsWith('Ctrl+')) {
        modifiers.push('ctrl');
        key = key.substring(5);
      }
      if (keyCombo.startsWith('Alt+')) {
        modifiers.push('alt');
        key = key.substring(4);
      }
      if (keyCombo.startsWith('Shift+')) {
        modifiers.push('shift');
        key = key.substring(6);
      }
      if (keyCombo.startsWith('Meta+')) {
        modifiers.push('meta');
        key = key.substring(5);
      }
      
      // Re-check in case of combinations like 'Ctrl+Shift+H'
      const parts = keyCombo.split('+');
      const finalKey = parts[parts.length - 1];
      
      return {
        key: finalKey.toLowerCase(),
        ctrl: keyCombo.includes('Ctrl+'),
        alt: keyCombo.includes('Alt+'),
        shift: keyCombo.includes('Shift+'),
        meta: keyCombo.includes('Meta+')
      };
    }

    // Handle keydown for token hotkeys
    $(document).on("keydown", (e) => {
      // Only process if token wrapper is active
      if (!isTokenWrapperActive()) return;

      // Avoid triggering hotkeys while typing in input fields or textareas
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      const settings = settingsLoader.getFeatureSettings('token-hotkeys');
      let targetButton = null;

      // Check each configured hotkey
      const keyMappings = {
        delete: ".btn-remove-selected-token",
        toggleVisibility: ".btn-toggle-token-visibility",
        toggleLock: ".btn-toggle-token-lock",
        edit: ".btn-edit-selected-token",
        duplicate: ".btn-duplicate-selected-token"
      };

      for (const [keyName, selector] of Object.entries(keyMappings)) {
        const keyCombo = settings.keys[keyName];
        const parsed = parseKeyCombination(keyCombo);
        
        if (parsed) {
          const keyMatch = e.key.toLowerCase() === parsed.key || 
                          (parsed.key === 'delete' && e.key === 'Delete');
          const ctrlMatch = parsed.ctrl === (e.ctrlKey || e.metaKey);
          const altMatch = parsed.alt === e.altKey;
          const shiftMatch = parsed.shift === e.shiftKey;

          if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
            targetButton = document.querySelector(selector);
            break;
          }
        }
      }

      if (targetButton) {
        e.preventDefault();
        targetButton.click();
      }
    });

    // Initialize hotkey labels on page load
    addHotKeyLabels();
  } catch (error) {
    console.warn("N21: Error en feature Token Hotkeys:", error.message);
  }
})();
