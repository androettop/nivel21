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

    // 1. Load core (state, events, utilities)
    await injectScript("src/core/core.js");
    await injectScript("src/core/utils.js");

    // 2. Load managers
    await injectScript("src/core/base-manager.js");
    await injectScript("src/core/key-modifiers-manager.js");
    await injectScript("src/core/chat-manager.js");
    await injectScript("src/core/token-manager.js");
    await injectScript("src/core/measurement-manager.js");
    await injectScript("src/core/dice-manager.js");

    // 3. Load features (order matters if features depend on each other)
    await Promise.all([
      injectScript("src/features/advantage-disadvantage.js"),
      injectScript("src/features/send-to-chat.js"),
      injectScript("src/features/parse-chat-links.js"),
      injectScript("src/features/token-hotkeys.js"),
      injectScript("src/features/token-height-order.js"),
      injectScript("src/features/snap-to-grid.js"),
      injectScript("src/features/multi-measurement.js"),
      injectScript("src/features/whisper-mode.js"),
      injectScript("src/features/multi-level-action-bar.js"),
    ]);
  });
})();
