// Content script loader - injects scripts into page context
(function () {
  // Expose the extension's base URL (chrome-extension://<id>/ or
  // moz-extension://<uuid>/) to the page context via a shared-DOM data
  // attribute, so injected scripts can build URLs to web-accessible assets.
  document.documentElement.dataset.n21BaseUrl = chrome.runtime.getURL("");

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
      injectScript("src/core/app-root-manager.js"),
      injectScript("src/core/settings-manager.js"),
      injectScript("src/core/main-menu-ui-manager.js"),
      injectScript("src/core/quick-menu-ui-manager.js"),
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
      injectScript("src/core/edit-token-ui-manager.js"),
      injectScript("src/core/canvas-dropdown-manager.js"),
      injectScript("src/core/character-manager.js"),
      injectScript("src/core/character-sheet-manager.js"),
      injectScript("src/core/markdown-editor-manager.js"),

      // Features
      injectScript("src/features/advantage-disadvantage.js"),
      injectScript("src/features/send-to-chat.js"),
      injectScript("src/features/parse-chat-links.js"),
      injectScript("src/features/token-hotkeys.js"),
      injectScript("src/features/token-layers.js"),
      injectScript("src/features/token-aura.js"),
      injectScript("src/features/token-assign-player.js"),
      injectScript("src/features/token-assign-character.js"),
      injectScript("src/features/token-move-arrows.js"),
      injectScript("src/features/token-drag-measurement.js"),
      injectScript("src/features/token-drag-speed.js"),
      injectScript("src/features/multi-measurement.js"),
      injectScript("src/features/whisper-mode.js"),
      injectScript("src/features/multi-level-action-bar.js"),
      injectScript("src/features/ambient-fx.js"),
      injectScript("src/features/notes-panel.js"),
      injectScript("src/features/dm-screen.js"),
      injectScript("src/features/turn-order.js"),
      injectScript("src/features/settings-panel.js"),
      injectScript("src/features/token-notes.js"),
      injectScript("src/features/center-camera-here.js"),
      injectScript("src/features/ping-map.js"),
      injectScript("src/features/straighten-camera.js"),
      injectScript("src/features/generate-spell-actions.js"),
      injectScript("src/features/spell-action-bar.js"),
      injectScript("src/features/actions-bar.js"),
      injectScript("src/features/error-report.js"),
    ]);
  });
})();
