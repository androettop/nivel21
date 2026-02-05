// Content script loader - injects scripts into page context
(function() {
	// Function to inject script into page context
	function injectScript(file) {
		const script = document.createElement('script');
		script.src = chrome.runtime.getURL(file);
		script.onload = function() {
			this.remove();
		};
		(document.head || document.documentElement).appendChild(script);
	}

	// Wait for jQuery to be available in page context
	function waitForJQuery(callback) {
		document.addEventListener('jQueryReady', callback, { once: true });
		injectScript('src/injected/jquery-checker.js');
	}

	// Wait for jQuery, then inject core and features in order
	waitForJQuery(() => {
		// 0. Load DOMPurify
		injectScript('src/lib/purify.min.js');
		
		// 1. Load core (state, events, utilities)
		injectScript('src/core/core.js');
		
		// 2. Load core managers (depend on core.js)
		injectScript('src/core/chat-manager.js');
		injectScript('src/core/dm-state-manager.js');
		
		// 3. Load features (order matters if features depend on each other)
		setTimeout(() => {
			injectScript('src/features/advantage-disadvantage.js');
			injectScript('src/features/send-to-chat.js');
			injectScript('src/features/parse-chat-links.js');
			injectScript('src/features/token-hotkeys.js');
			injectScript('src/features/token-height-order.js');
			injectScript('src/features/snap-to-grid.js');
			injectScript('src/features/multi-measurement.js');
			injectScript('src/features/whisper-mode.js');
			injectScript('src/features/multi-level-action-bar.js');
			// Add more features here in the future
		}, 200);
	});
})();
