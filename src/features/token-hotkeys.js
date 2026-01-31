(() => {
	/* =======================
       Feature: Token Hotkeys
    ======================= */

	const selectedTokenWrapper = '.selected-token-wrapper';

	// Check if selected token wrapper is visible
	function isTokenWrapperActive() {
		const wrapper = document.querySelector(selectedTokenWrapper);
		return wrapper && !wrapper.classList.contains('hidden');
	}

	// Handle keydown for token hotkeys
	$(document).on('keydown', (e) => {
		// Only process if token wrapper is active
		if (!isTokenWrapperActive()) return;

		// Avoid triggering hotkeys while typing in input fields or textareas
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

		let targetButton = null;

		if (e.key === 'h' || e.key === 'H') {
			// H - Toggle token visibility
			targetButton = document.querySelector('.btn-toggle-token-visibility');
		} else if (e.key === 'b' || e.key === 'B') {
			// B - Toggle token lock
			targetButton = document.querySelector('.btn-toggle-token-lock');
		} else if (e.key === 'Delete') {
			// Delete - Remove selected token
			targetButton = document.querySelector('.btn-remove-selected-token');
		}

		if (targetButton) {
			e.preventDefault();
			targetButton.click();
		}
	});
})();
