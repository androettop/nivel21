// Content script loader - injects scripts into page context
(function () {
  // Function to inject script into page context
  function injectScript(file) {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(file);
      script.onload = function () {
        this.remove();
        setTimeout(resolve, 200); // slight delay to ensure script is fully loaded
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  // Wait for jQuery to be available in page context
  function waitForJQuery(callback) {
    document.addEventListener("jQueryReady", callback, { once: true });
    injectScript("src/injected/jquery-checker.js");
  }

  // Wait for jQuery, then inject core and features in order
  waitForJQuery(async () => {
    // 0. Load DOMPurify
    await injectScript("src/lib/purify.min.js");

    // 1. Load core utilities
    await injectScript("src/core/utils.js");

    // 2. Load base manager
    await injectScript("src/core/base-manager.js");

    // 3. Load managers and features in parallel
    await Promise.all([
      // Managers
      injectScript("src/core/settings-manager.js"),
      injectScript("src/core/main-menu-ui-manager.js"),
      injectScript("src/core/chat-ui-manager.js"),
      injectScript("src/core/key-modifiers-manager.js"),
      injectScript("src/core/chat-manager.js"),
      injectScript("src/core/chat-commands-manager.js"),
      injectScript("src/core/player-manager.js"),
      injectScript("src/core/token-manager.js"),
      injectScript("src/core/measurement-manager.js"),
      injectScript("src/core/camera-manager.js"),
      injectScript("src/core/network-manager.js"),
      injectScript("src/core/dice-manager.js"),
      injectScript("src/core/floating-panel-manager.js"),
      injectScript("src/core/action-bar-manager.js"),
      injectScript("src/core/tooltip-manager.js"),
      injectScript("src/core/html-manager.js"),

      // Features
      injectScript("src/features/advantage-disadvantage.js"),
      injectScript("src/features/send-to-chat.js"),
      injectScript("src/features/parse-chat-links.js"),
      injectScript("src/features/token-hotkeys.js"),
      injectScript("src/features/token-height-order.js"),
      injectScript("src/features/token-move-arrows.js"),
      injectScript("src/features/token-drag-measurement.js"),
      injectScript("src/features/snap-to-grid.js"),
      injectScript("src/features/multi-measurement.js"),
      injectScript("src/features/whisper-mode.js"),
      injectScript("src/features/multi-level-action-bar.js"),
      injectScript("src/features/ambient-fx.js"),
      injectScript("src/features/notes-panel.js"),
      injectScript("src/features/settings-panel.js"),
    ]);
  });
})();
