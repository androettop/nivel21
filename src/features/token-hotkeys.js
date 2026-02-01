(() => {
  try {
    /* =======================
	       Feature: Token Hotkeys
	    ======================= */

    const selectedTokenWrapper = ".selected-token-wrapper";

    // Add hotkey labels to buttons if they don't exist
    function addHotKeyLabels() {
      const buttons = [
        { selector: ".btn-toggle-token-visibility", label: "Ctrl+H" },
        { selector: ".btn-toggle-token-lock", label: "Ctrl+B" },
        { selector: ".btn-remove-selected-token", label: "Supr." },
        { selector: ".btn-edit-selected-token", label: "Ctrl+E" },
        { selector: ".btn-duplicate-selected-token", label: "Ctrl+D" },
      ];

      buttons.forEach(({ selector, label }) => {
        const button = document.querySelector(selector);
        if (button) {
          // Check if label already exists
          const existingLabel = button.querySelector(".n21-hotkey-label");
          if (!existingLabel) {
            const span = document.createElement("span");
            span.className = "n21-hotkey-label";
            span.textContent = `${label}`;
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

    // Handle keydown for token hotkeys
    $(document).on("keydown", (e) => {
      // Only process if token wrapper is active
      if (!isTokenWrapperActive()) return;

      // Avoid triggering hotkeys while typing in input fields or textareas
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      let targetButton = null;

      if (e.key === "Delete") {
        // Delete - Remove selected token
        targetButton = document.querySelector(".btn-remove-selected-token");
      } else if (e.key.toLowerCase() === "h" && e.ctrlKey) {
        // Ctrl + H - Toggle token visibility
        targetButton = document.querySelector(".btn-toggle-token-visibility");
      } else if (e.key.toLowerCase() === "b" && e.ctrlKey) {
        // Ctrl + B - Toggle token lock
        targetButton = document.querySelector(".btn-toggle-token-lock");
      } else if (e.key.toLowerCase() === "e" && e.ctrlKey) {
        // Ctrl + E - Edit selected token
        targetButton = document.querySelector(".btn-edit-selected-token");
      } else if (e.key.toLowerCase() === "d" && e.ctrlKey) {
        // Ctrl + D - Duplicate selected token
        targetButton = document.querySelector(".btn-duplicate-selected-token");
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
