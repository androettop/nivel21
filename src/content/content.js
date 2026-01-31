// Content script loader - injects script.js into page context
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

	// Wait for jQuery, then inject the main script
	waitForJQuery(() => {
		injectScript('src/injected/script.js');
	});
})();
