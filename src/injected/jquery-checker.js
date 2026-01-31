// Helper script to check if jQuery is loaded
(function checkJQuery() {
	if (typeof $ !== 'undefined') {
		document.dispatchEvent(new CustomEvent('jQueryReady'));
	} else {
		setTimeout(checkJQuery, 100);
	}
})();
